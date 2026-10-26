# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, fields
from trytond.model.exceptions import ValidationError
from trytond.modules.company.model import CompanyValueMixin
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Bool, Eval, Id
from trytond.transaction import Transaction
from trytond.wizard import (
    Button, StateAction, StateTransition, StateView, Wizard)

job_sequence = fields.Many2One(
    'ir.sequence', "Job Sequence", required=True,
    domain=[
        ('company', 'in', [Eval('context', {}).get('company', -1), None]),
        ('sequence_type', '=', Id('nline_job', 'sequence_type_job')),
        ],
    help="The numbering of the Jobs (8564 and up in Jobshop).")


class Configuration(metaclass=PoolMeta):
    __name__ = 'production.configuration'
    job_sequence = fields.MultiValue(job_sequence)

    @classmethod
    def multivalue_model(cls, field):
        pool = Pool()
        if field == 'job_sequence':
            return pool.get('production.configuration.job_sequence')
        return super().multivalue_model(field)

    @classmethod
    def default_job_sequence(cls, **pattern):
        return cls.multivalue_model('job_sequence').default_job_sequence()


class ConfigurationJobSequence(ModelSQL, CompanyValueMixin):
    "Production Configuration Job Sequence"
    __name__ = 'production.configuration.job_sequence'
    job_sequence = fields.Many2One(
        'ir.sequence', "Job Sequence", required=True,
        domain=[
            ('company', 'in', [Eval('company', -1), None]),
            ('sequence_type', '=', Id('nline_job', 'sequence_type_job')),
            ])

    @classmethod
    def default_job_sequence(cls):
        pool = Pool()
        ModelData = pool.get('ir.model.data')
        try:
            return ModelData.get_id('nline_job', 'sequence_job')
        except KeyError:
            return None


class Production(metaclass=PoolMeta):
    __name__ = 'production'

    job = fields.Boolean(
        "Job", readonly=True,
        help="Makes one component into stock for several needs.")
    job_coverages = fields.One2Many(
        'production.job.coverage', 'job', "Coverages",
        states={
            'invisible': ~Eval('job'),
            'readonly': Eval('state').in_(['done', 'cancelled']),
            })
    in_job = fields.Function(
        fields.Boolean("In Job"), 'get_in_job')

    @classmethod
    def default_job(cls):
        return False

    def get_in_job(self, name):
        "Return if the production is a Job or a leg of a Job"
        root = self.root or self
        return bool(root.job)

    @classmethod
    def create(cls, vlist):
        pool = Pool()
        Config = pool.get('production.configuration')
        vlist = [v.copy() for v in vlist]
        config = Config(1)
        default_company = cls.default_company()
        for values in vlist:
            if values.get('job') and values.get('number') is None:
                values['number'] = config.get_multivalue(
                    'job_sequence',
                    company=values.get('company', default_company)).get()
        return super().create(vlist)

    @classmethod
    def copy(cls, productions, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('job_coverages', None)
        return super().copy(productions, default=default)


class JobCoverage(ModelSQL, ModelView):
    "Job Coverage"
    __name__ = 'production.job.coverage'

    job = fields.Many2One(
        'production', "Job", required=True, ondelete='CASCADE',
        domain=[
            ('job', '=', True),
            ])
    card = fields.Many2One(
        'production.material_card', "Material Card", ondelete='CASCADE',
        domain=[
            ('product', '=', Eval('product', -1)),
            ],
        states={
            'required': ~Eval('sale_line'),
            'readonly': Bool(Eval('sale_line')),
            })
    sale_line = fields.Many2One(
        'sale.line', "Sale Line", ondelete='CASCADE',
        domain=[
            ('product', '=', Eval('product', -1)),
            ],
        states={
            'required': ~Eval('card'),
            'readonly': Bool(Eval('card')),
            })
    quantity = fields.Float("Quantity", digits='unit', required=True)
    unit = fields.Function(fields.Many2One('product.uom', "Unit"),
        'on_change_with_unit')
    product = fields.Function(fields.Many2One('product.product', "Product"),
        'on_change_with_product')
    need = fields.Function(fields.Char("Need"), 'get_need')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('job')

    @fields.depends('job', '_parent_job.unit')
    def on_change_with_unit(self, name=None):
        return self.job.unit if self.job else None

    @fields.depends('job', '_parent_job.product')
    def on_change_with_product(self, name=None):
        return self.job.product if self.job else None

    def get_need(self, name):
        if self.card:
            return self.card.production.rec_name
        if self.sale_line:
            return self.sale_line.rec_name

    def get_rec_name(self, name):
        return '%s - %s' % (self.job.rec_name, self.need)

    @classmethod
    def validate(cls, coverages):
        super().validate(coverages)
        for coverage in coverages:
            coverage.check_no_sub_job()

    def check_no_sub_job(self):
        "Check that the output of a Job does not feed another Job"
        if self.card and self.card.production.in_job:
            raise ValidationError(gettext(
                    'nline_job.msg_no_sub_job',
                    card=self.card.rec_name,
                    job=self.job.rec_name))

    @classmethod
    def create(cls, vlist):
        coverages = super().create(vlist)
        cls._set_card_supply(coverages)
        return coverages

    @classmethod
    def delete(cls, coverages):
        pool = Pool()
        Card = pool.get('production.material_card')
        cards = [c.card for c in coverages if c.card]
        super().delete(coverages)
        cards = Card.browse([c.id for c in cards])
        Card.write([c for c in cards if not c.job_coverages], {
                'supply': 'stock',
                })

    @classmethod
    def _set_card_supply(cls, coverages):
        pool = Pool()
        Card = pool.get('production.material_card')
        cards = [c.card for c in coverages if c.card]
        if cards:
            Card.write(cards, {'supply': 'job'})


class MaterialCard(metaclass=PoolMeta):
    __name__ = 'production.material_card'

    job_coverages = fields.One2Many(
        'production.job.coverage', 'card', "Job Coverages", readonly=True)
    job = fields.Function(fields.Many2One(
            'production', "Job",
            states={
                'invisible': Eval('supply') != 'job',
                }),
        'get_job')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.supply.selection = cls.supply.selection + [('job', "Job")]
        cls._buttons['make_leg']['invisible'] |= Eval('supply') == 'job'

    def get_job(self, name):
        for coverage in self.job_coverages:
            if coverage.job.state != 'cancelled':
                return coverage.job.id


class SaleLine(metaclass=PoolMeta):
    __name__ = 'sale.line'

    job_coverages = fields.One2Many(
        'production.job.coverage', 'sale_line', "Job Coverages",
        readonly=True)


class CreateJobStart(ModelView):
    "Create Job"
    __name__ = 'production.job.create.start'

    company = fields.Many2One('company.company', "Company", readonly=True)
    warehouse = fields.Many2One(
        'stock.location', "Warehouse", required=True,
        domain=[('type', '=', 'warehouse')])
    product = fields.Many2One(
        'product.product', "Product", required=True,
        domain=[
            ('producible', '=', True),
            ('boms', '!=', None),
            ],
        context={
            'company': Eval('company', -1),
            },
        depends={'company'})

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_warehouse(cls):
        pool = Pool()
        Location = pool.get('stock.location')
        return Location.get_default_warehouse()


class CreateJobNeeds(ModelView):
    "Create Job"
    __name__ = 'production.job.create.needs'

    product = fields.Many2One('product.product', "Product", readonly=True)
    unit = fields.Many2One('product.uom', "Unit", readonly=True)
    product_bom = fields.Many2One(
        'product.product-production.bom', "Revision", required=True,
        domain=[
            ('product', '=', Eval('product', -1)),
            ])
    needs = fields.One2Many(
        'production.job.create.need', None, "Needs",
        help="Check the needs the Job covers.")
    extra_quantity = fields.Float(
        "Extra Quantity", digits='unit',
        help="The quantity made for stock in addition to the needs.")
    planned_date = fields.Date("Planned Date")
    job = fields.Many2One('production', "Job", readonly=True)


class CreateJobNeed(ModelView):
    "Create Job Need"
    __name__ = 'production.job.create.need'

    selected = fields.Boolean("Cover")
    kind = fields.Selection([
            ('card', "Work Order Card"),
            ('sale', "Sale Line"),
            ('order_point', "Order Point"),
            ], "Kind", readonly=True)
    card = fields.Many2One(
        'production.material_card', "Material Card", readonly=True)
    sale_line = fields.Many2One('sale.line', "Sale Line", readonly=True)
    description = fields.Char("Need", readonly=True)
    date = fields.Date("Date", readonly=True)
    quantity = fields.Float("Quantity", digits='unit', readonly=True)
    unit = fields.Many2One('product.uom', "Unit", readonly=True)


class CreateJob(Wizard):
    "Create Job"
    __name__ = 'production.job.create'
    start = StateView(
        'production.job.create.start',
        'nline_job.job_create_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Find Needs", 'needs', 'tryton-forward', default=True),
            ])
    needs = StateView(
        'production.job.create.needs',
        'nline_job.job_create_needs_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Create Job", 'create_', 'tryton-ok', default=True),
            ])
    create_ = StateTransition()
    open_ = StateAction('production.act_production_list')

    def default_needs(self, fields):
        product = self.start.product
        product_bom = product.get_bom()
        needs = [n for n in self.get_needs(product, self.start.warehouse)]
        return {
            'product': product.id,
            'unit': product.default_uom.id,
            'product_bom': product_bom.id if product_bom else None,
            'needs': needs,
            'extra_quantity': 0,
            }

    @classmethod
    def get_needs(cls, product, warehouse):
        """Yield the open needs of the product not covered by a Job:
        work order cards supplied from stock, sale lines and order points"""
        pool = Pool()
        Card = pool.get('production.material_card')
        SaleLine = pool.get('sale.line')
        Uom = pool.get('product.uom')
        unit = product.default_uom

        cards = Card.search([
                ('product', '=', product.id),
                ('supply', '=', 'stock'),
                ('production.state', 'in', ['request', 'draft', 'waiting']),
                ('production.warehouse', '=', warehouse.id),
                ])
        for card in cards:
            if card.production.in_job:
                continue
            yield {
                'kind': 'card',
                'card': card.id,
                'description': card.rec_name,
                'date': card.production.planned_start_date
                or card.production.planned_date,
                'quantity': Uom.compute_qty(
                    card.unit, card.quantity, unit),
                'unit': unit.id,
                'selected': True,
                }

        lines = SaleLine.search([
                ('product', '=', product.id),
                ('type', '=', 'line'),
                ('sale.state', 'in', ['confirmed', 'processing']),
                ('sale.warehouse', '=', warehouse.id),
                ])
        for line in lines:
            if line.job_coverages or getattr(line, 'productions', None):
                continue
            quantity = line._get_move_quantity('out')
            if quantity <= 0:
                continue
            yield {
                'kind': 'sale',
                'sale_line': line.id,
                'description': line.rec_name,
                'date': line.shipping_date,
                'quantity': Uom.compute_qty(line.unit, quantity, unit),
                'unit': unit.id,
                'selected': True,
                }

        shortfall = cls.get_order_point_shortfall(product, warehouse)
        if shortfall > 0:
            yield {
                'kind': 'order_point',
                'description': gettext('nline_job.msg_order_point_need'),
                'quantity': shortfall,
                'unit': unit.id,
                'selected': False,
                }

    @classmethod
    def get_order_point_shortfall(cls, product, warehouse):
        "Return the quantity below the minimal quantity of the order point"
        pool = Pool()
        try:
            OrderPoint = pool.get('stock.order_point')
        except KeyError:
            return 0
        Product = pool.get('product.product')
        order_points = OrderPoint.search([
                ('product', '=', product.id),
                ('warehouse_location', '=', warehouse.id),
                ('type', 'in', ['purchase', 'production']),
                ], limit=1)
        if not order_points:
            return 0
        order_point, = order_points
        if order_point.min_quantity is None:
            return 0
        with Transaction().set_context(locations=[warehouse.id]):
            quantity = Product(product.id).forecast_quantity
        return max(order_point.target_quantity - quantity, 0)

    def transition_create_(self):
        pool = Pool()
        Production = pool.get('production')
        Coverage = pool.get('production.job.coverage')
        needs = self.needs
        product = needs.product
        selected = [n for n in needs.needs if n.selected]
        quantity = sum(n.quantity for n in selected) + (
            needs.extra_quantity or 0)
        if quantity <= 0:
            raise ValidationError(gettext('nline_job.msg_job_no_quantity'))
        dates = [n.date for n in selected if n.date]
        planned_date = needs.planned_date or (min(dates) if dates else None)
        job = Production(
            company=self.start.company,
            warehouse=self.start.warehouse,
            location=self.start.warehouse.production_location,
            product=product,
            bom=needs.product_bom.bom,
            unit=product.default_uom,
            quantity=quantity,
            planned_date=planned_date,
            job=True,
            state='draft',
            )
        if hasattr(Production, 'routing'):
            job.routing = needs.product_bom.routing
        job.set_planned_start_date()
        job.save()
        Production.set_moves([job])
        coverages = []
        for need in selected:
            if need.kind == 'card':
                coverages.append(Coverage(
                        job=job, card=need.card, quantity=need.quantity))
            elif need.kind == 'sale':
                coverages.append(Coverage(
                        job=job, sale_line=need.sale_line,
                        quantity=need.quantity))
        Coverage.save(coverages)
        self.needs.job = job
        return 'open_'

    def do_open_(self, action):
        action['res_id'] = [self.needs.job.id]
        action['views'].reverse()
        return action, {}
