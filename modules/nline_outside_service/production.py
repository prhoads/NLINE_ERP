# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from decimal import Decimal
from itertools import groupby

from trytond.i18n import gettext
from trytond.model import ModelView, Workflow, fields
from trytond.modules.product import round_price
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Bool, Eval, If
from trytond.transaction import Transaction

from .exceptions import OutsideServiceWarning


class RoutingStep(metaclass=PoolMeta):
    __name__ = 'production.routing.step'

    supplier = fields.Many2One(
        'party.party', "Supplier",
        help="The supplier doing the operation outside.")
    service = fields.Many2One(
        'product.product', "Service", ondelete='RESTRICT',
        domain=[
            ('purchasable', '=', True),
            ('template.type', '=', 'service'),
            ],
        states={
            'required': Bool(Eval('supplier')),
            'invisible': ~Eval('supplier'),
            },
        help="The service bought from the supplier for the operation.")
    service_supplier = fields.Many2One(
        'purchase.product_supplier', "Supplier's Service",
        ondelete='RESTRICT',
        domain=[
            ('template.type', '=', 'service'),
            If(Bool(Eval('service')),
                ['OR',
                    [
                        ('template.products', '=', Eval('service')),
                        ('product', '=', None),
                        ],
                    ('product', '=', Eval('service')),
                    ],
                []),
            ('party', '=', Eval('supplier', -1)),
            ],
        states={
            'invisible': ~Eval('supplier'),
            },
        help="The supplier's service to buy for the operation.")
    service_quantity = fields.Float(
        "Service Quantity",
        states={
            'invisible': ~Eval('service'),
            'required': Bool(Eval('service')),
            },
        help="The quantity of service to buy for each unit of the BOM "
        "output.")

    @classmethod
    def default_service_quantity(cls):
        return 1

    @fields.depends('supplier', 'service', 'service_supplier')
    def on_change_service(self):
        if self.service:
            product_suppliers = list(self.service.product_suppliers_used(
                    party=self.supplier.id if self.supplier else -1))
            if len(product_suppliers) == 1:
                self.service_supplier, = product_suppliers
            elif (self.service_supplier
                    and self.service_supplier not in product_suppliers):
                self.service_supplier = None

    @fields.depends('service', 'service_supplier')
    def on_change_service_supplier(self):
        if self.service_supplier:
            if self.service_supplier.product:
                self.service = self.service_supplier.product
            elif not self.service:
                products = self.service_supplier.template.products
                if len(products) == 1:
                    self.service, = products

    def get_work(self, production, work_center_picker):
        work = super().get_work(production, work_center_picker)
        work.routing_step = self
        if self.supplier:
            # The time of an outside operation is not charged
            work.planned_duration = None
        return work


class Work(metaclass=PoolMeta):
    __name__ = 'production.work'

    routing_step = fields.Many2One(
        'production.routing.step', "Routing Step", readonly=True,
        ondelete='SET NULL')
    purchase_line = fields.Many2One(
        'purchase.line', "Purchase Line", readonly=True,
        ondelete='SET NULL',
        domain=[
            ('production', '=', Eval('production', -1)),
            ],
        states={
            'invisible': ~Eval('purchase_line'),
            },
        help="The purchase of the outside operation.")
    outside = fields.Function(
        fields.Boolean("Outside"), 'on_change_with_outside')
    supplier = fields.Function(fields.Many2One(
            'party.party', "Supplier",
            context={
                'company': Eval('company', -1),
                },
            states={
                'invisible': ~Eval('outside'),
                },
            depends={'company'}),
        'on_change_with_supplier')
    purchase = fields.Function(fields.Many2One(
            'purchase.purchase', "Purchase",
            states={
                'invisible': ~Eval('purchase'),
                }),
        'on_change_with_purchase')
    expected_date = fields.Function(fields.Date(
            "Expected Date",
            states={
                'invisible': ~Eval('outside'),
                }),
        'get_expected_date')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._buttons.update({
                'receive': {
                    'invisible': (~Eval('outside')
                        | Eval('state').in_(['request', 'finished', 'done'])),
                    'depends': ['outside', 'state'],
                    },
                })

    @fields.depends('routing_step')
    def on_change_with_outside(self, name=None):
        return bool(self.routing_step and self.routing_step.supplier)

    @fields.depends('routing_step')
    def on_change_with_supplier(self, name=None):
        if self.routing_step and self.routing_step.supplier:
            return self.routing_step.supplier.id

    @fields.depends('purchase_line')
    def on_change_with_purchase(self, name=None):
        if self.purchase_line and self.purchase_line.purchase:
            return self.purchase_line.purchase.id

    def get_expected_date(self, name):
        if self.purchase_line:
            return self.purchase_line.delivery_date

    @classmethod
    @ModelView.button
    def receive(cls, works):
        "Finish the outside works when the supplier returns the goods"
        cls.finish(works)

    def _group_outside_purchase_key(self):
        step = self.routing_step
        supplier = step.supplier
        if step.service_supplier:
            currency = step.service_supplier.currency
        else:
            currency = self.company.currency
        return (
            ('company', self.company),
            ('party', supplier),
            ('payment_term', supplier.supplier_payment_term),
            ('warehouse', self.production.warehouse),
            ('currency', currency),
            ('invoice_address', supplier.address_get(type='invoice')),
            )

    def get_outside_purchase_line(self, purchase):
        pool = Pool()
        Line = pool.get('purchase.line')
        step = self.routing_step
        production = self.production
        line = Line()
        line.purchase = purchase
        line.product = step.service
        line.product_supplier = step.service_supplier
        line.unit = step.service.purchase_uom
        if production.bom and production.product:
            factor = production.bom.compute_factor(
                production.product, production.quantity or 0,
                production.unit)
        else:
            factor = production.quantity or 0
        line.quantity = line.unit.round(factor * step.service_quantity)
        line.production = production
        line.on_change_product()
        line.description = '%s - %s' % (
            getattr(line, 'description', None) or step.service.rec_name,
            self.rec_name)
        return line

    @classmethod
    def copy(cls, works, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('purchase_line', None)
        return super().copy(works, default=default)


class WorkCycle(metaclass=PoolMeta):
    __name__ = 'production.work.cycle'

    def set_cost(self):
        if self.cost is None and self.work.outside:
            # The cost of an outside operation comes from its purchase
            self.cost = Decimal(0)
        super().set_cost()


class Production(metaclass=PoolMeta):
    __name__ = 'production'

    def get_cost(self, name):
        pool = Pool()
        Currency = pool.get('currency.currency')
        cost = super().get_cost(name)
        # Use the posted supplier bill instead of the purchase amount
        for line in self.purchase_lines:
            if line.purchase.state == 'cancelled' or not line.amount:
                continue
            basis = line.get_production_cost_basis()
            if basis != line.amount:
                cost += Currency.compute(
                    line.purchase.currency, basis - line.amount,
                    self.company.currency, round=False)
        return round_price(cost)

    @classmethod
    @ModelView.button
    @Workflow.transition('waiting')
    def wait(cls, productions):
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        PurchaseLine = pool.get('purchase.line')
        Work = pool.get('production.work')
        Date = pool.get('ir.date')

        draft_productions = [p for p in productions if p.state == 'draft']
        super().wait(productions)

        works = [w for p in cls.browse(draft_productions) for w in p.works
            if w.outside and not w.purchase_line]
        works.sort(key=lambda w: w._group_outside_purchase_key())
        purchases, lines = [], []
        for key, grouped in groupby(
                works, key=lambda w: w._group_outside_purchase_key()):
            grouped = list(grouped)
            key = dict(key)
            with Transaction().set_context(company=key['company'].id):
                today = Date.today()
            dates = [w.production.planned_start_date
                or w.production.planned_date for w in grouped]
            purchase_date = max(min(filter(None, dates), default=today), today)
            purchase = Purchase(purchase_date=purchase_date, **key)
            purchases.append(purchase)
            for work in grouped:
                line = work.get_outside_purchase_line(purchase)
                lines.append(line)
                work.purchase_line = line
        Purchase.save(purchases)
        PurchaseLine.save(lines)
        Work.save(works)

    @classmethod
    @ModelView.button
    @Workflow.transition('done')
    def done(cls, productions):
        pool = Pool()
        PurchaseLine = pool.get('purchase.line')
        Warning = pool.get('res.user.warning')

        not_billed = [p for p in productions
            if any(not l.production_billed for l in p.purchase_lines
                if l.purchase.state != 'cancelled')]
        if not_billed:
            names = ', '.join(p.rec_name for p in not_billed[:5])
            if len(not_billed) > 5:
                names += '...'
            warning_name = Warning.format(
                'nline_outside_service.not_billed', not_billed)
            if Warning.check(warning_name):
                raise OutsideServiceWarning(warning_name, gettext(
                        'nline_outside_service.msg_production_not_billed',
                        productions=names))
        super().done(productions)
        # Record the amount included in the cost of the goods produced
        lines = []
        for production in productions:
            for line in production.purchase_lines:
                if line.purchase.state == 'cancelled':
                    continue
                line.production_cost_amount = line.get_production_cost_basis()
                lines.append(line)
        PurchaseLine.save(lines)
