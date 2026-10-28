# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The code tables of Jobshop's Sales group bar: sales reps, territories,
SIC codes, carriers, service charges, tax groups and discount classes, and
the customer / discount class price break tables"""
import datetime as dt
from decimal import Decimal

from trytond.model import ModelSQL, ModelView, fields
from trytond.modules.nline_js_common.common import CodeTable
from trytond.pool import Pool
from trytond.pyson import Bool, Eval
from trytond.transaction import Transaction, without_check_access

PERCENT = (10, 6)


class InactiveMixin:
    """Jobshop's Inactive column: the reverse of Tryton's active, read-only
    (the windows change active), searchable for the Browse tabs"""
    __slots__ = ()
    inactive = fields.Function(fields.Boolean("Inactive"),
        'get_inactive', searcher='search_inactive')

    def get_inactive(self, name):
        return not self.active

    @classmethod
    def search_inactive(cls, name, clause):
        _, operator, value = clause[:3]
        if operator in {'=', '!='}:
            wanted = not value if operator == '=' else bool(value)
            return [('active', '=', wanted)]
        return []


class SalesRep(InactiveMixin, CodeTable):
    "Sales Representative"
    __name__ = 'nline.sales_rep'
    commission = fields.Numeric("Commission %", digits=PERCENT)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        # Jobshop calls the description of a sales rep its name
        cls.description.string = "Name"

    @staticmethod
    def default_commission():
        return Decimal(0)


class Territory(InactiveMixin, CodeTable):
    "Territory"
    __name__ = 'nline.territory'


class SicCode(InactiveMixin, CodeTable):
    "SIC Code"
    __name__ = 'nline.sic_code'


class Carrier(InactiveMixin, CodeTable):
    "Carrier"
    __name__ = 'nline.carrier'
    carrier_code = fields.Char("Carrier Code")
    route = fields.Char("Route")
    instructions = fields.Text("Shipper Instructions")
    cod_charge = fields.Numeric("COD Charge", digits=(16, 2))

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.description.string = "Name"


class ServiceCharge(InactiveMixin, CodeTable):
    "Service Charge"
    __name__ = 'nline.service_charge'
    amount = fields.Numeric("Amount", digits=(16, 2))
    account = fields.Many2One('account.account', "Revenue Account",
        domain=[('type', '!=', None), ('closed', '!=', True)])

    @staticmethod
    def default_amount():
        return Decimal(0)


class TaxGroup(InactiveMixin, CodeTable):
    "Sales Tax Group"
    __name__ = 'nline.sales_tax_group'
    lines = fields.One2Many('nline.sales_tax_group.line', 'group', "Taxes")

    def get_taxes(self, date=None):
        """The Tryton taxes of the group at the date: for each tax name the
        line of the latest effective date on or before it"""
        if date is None:
            date = Pool().get('ir.date').today()
        current = {}
        for line in self.lines:
            if not line.tax:
                continue
            if line.effective_date and line.effective_date > date:
                continue
            key = line.tax_name
            known = current.get(key)
            if (not known or (line.effective_date or dt.date.min)
                    >= (known.effective_date or dt.date.min)):
                current[key] = line
        return [l.tax for l in current.values()]


class TaxGroupLine(ModelSQL, ModelView):
    """Sales Tax Group Tax

    A Jobshop tax line: kept as a Tryton tax (account.tax) of the company,
    made or updated when the line has an account."""
    __name__ = 'nline.sales_tax_group.line'
    group = fields.Many2One('nline.sales_tax_group', "Tax Group",
        required=True, ondelete='CASCADE')
    tax_name = fields.Char("Tax Name", required=True)
    description = fields.Char("Description")
    effective_date = fields.Date("Effective")
    account = fields.Many2One('account.account', "Account",
        domain=[('type', '!=', None), ('closed', '!=', True)])
    percent = fields.Numeric("Tax Percent", digits=PERCENT)
    tax = fields.Many2One('account.tax', "Tryton Tax", ondelete='SET NULL',
        domain=[('parent', '=', None)],
        help="The tax of the accounting the line is: made from the line "
        "when it has an account, or chosen.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('tax_name', 'ASC'), ('effective_date', 'ASC')]

    @staticmethod
    def default_percent():
        return Decimal(0)

    def get_rec_name(self, name):
        return '%s %s' % (self.group.code, self.tax_name)

    @classmethod
    def create(cls, vlist):
        lines = super().create(vlist)
        cls.sync_taxes(lines)
        return lines

    @classmethod
    def write(cls, *args):
        super().write(*args)
        lines = sum(args[0:None:2], [])
        cls.sync_taxes(lines)

    @classmethod
    def sync_taxes(cls, lines):
        """Make or update the Tryton tax of the lines that have an account
        (the sales users may not change the accounting's taxes themselves)"""
        pool = Pool()
        Tax = pool.get('account.tax')
        company = Transaction().context.get('company')
        if not company:
            return
        with without_check_access():
            for line in cls.browse(lines):
                if not line.account:
                    continue
                values = {
                    'name': '%s %s' % (line.group.code, line.tax_name),
                    'description': line.description or line.tax_name,
                    'type': 'percentage',
                    'rate': (line.percent or Decimal(0)) / 100,
                    'invoice_account': line.account.id,
                    'credit_note_account': line.account.id,
                    'start_date': line.effective_date,
                    }
                if line.tax:
                    changed = {k: v for k, v in values.items()
                        if (getattr(line.tax, k).id if k.endswith('account')
                            and getattr(line.tax, k) else getattr(
                                line.tax, k)) != v}
                    if changed:
                        Tax.write([line.tax], changed)
                else:
                    values['company'] = company
                    tax, = Tax.create([values])
                    super().write([line], {'tax': tax.id})


class SalePrice(ModelSQL, ModelView):
    """Sales Price

    A quantity / price break table of a part for a customer (the Customer
    window's Prices tab) or a discount class (its Prices tab)."""
    __name__ = 'nline.sale_price'
    party = fields.Many2One('party.party', "Customer", ondelete='CASCADE',
        states={'invisible': Bool(Eval('discount_class'))})
    discount_class = fields.Many2One('nline.discount_class',
        "Discount Class", ondelete='CASCADE',
        states={'invisible': Bool(Eval('party'))})
    product = fields.Many2One('product.product', "Part", required=True,
        ondelete='CASCADE')
    unit = fields.Many2One('product.uom', "Selling U/M")
    customer_part = fields.Char("Customer Part ID")
    quote_type = fields.Selection([
            ('break', "Break table"),
            ('up_to', "Up-to-Qty table"),
            ], "Type", required=True)
    as_of = fields.Date("As Of")
    expires = fields.Date("Expires")
    use_part_price = fields.Boolean("Use Part Price")
    default_unit_price = fields.Numeric("Default Price", digits=(16, 4))
    breaks = fields.One2Many('nline.sale_price.break', 'price', "Quantities")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('product', 'ASC'), ('as_of', 'DESC')]

    @staticmethod
    def default_quote_type():
        return 'break'

    def get_rec_name(self, name):
        return self.product.rec_name

    def valid(self, date):
        return ((not self.as_of or self.as_of <= date)
            and (not self.expires or self.expires >= date))

    def unit_price(self, quantity):
        """The price of the quantity: a break table gives the price of the
        largest break the quantity reaches, an up-to table the price of the
        smallest break that covers it"""
        breaks = sorted(self.breaks, key=lambda b: b.quantity or 0)
        price = None
        if self.quote_type == 'up_to':
            for b in breaks:
                if quantity <= (b.quantity or 0):
                    price = b.unit_price
                    break
            else:
                if breaks:
                    price = breaks[-1].unit_price
        else:
            for b in breaks:
                if quantity >= (b.quantity or 0):
                    price = b.unit_price
            if price is None and breaks:
                price = breaks[0].unit_price
        if price is None:
            price = self.default_unit_price
        return price


class SalePriceBreak(ModelSQL, ModelView):
    "Sales Price Break"
    __name__ = 'nline.sale_price.break'
    price = fields.Many2One('nline.sale_price', "Price", required=True,
        ondelete='CASCADE')
    quantity = fields.Float("Qty Break", required=True)
    unit_price = fields.Numeric("Unit Price", digits=(16, 4), required=True)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('quantity', 'ASC')]


class DiscountClass(InactiveMixin, CodeTable):
    "Discount Class"
    __name__ = 'nline.discount_class'
    discount_percent = fields.Numeric("Discount Percent", digits=PERCENT)
    prices = fields.One2Many('nline.sale_price', 'discount_class', "Prices")

    @staticmethod
    def default_discount_percent():
        return Decimal(0)


class Charge(ModelSQL, ModelView):
    """Sales Order Charge

    A service charge of a sales order (its Charges tab), applied to the
    next invoice of the order: it becomes a line of that invoice."""
    __name__ = 'nline.sale_charge'
    sale = fields.Many2One('sale.sale', "Sales Order", required=True,
        ondelete='CASCADE')
    service_charge = fields.Many2One('nline.service_charge',
        "Service Charge", required=True)
    description = fields.Char("Description")
    amount = fields.Numeric("Amount", digits=(16, 2), required=True)
    tax_group = fields.Many2One('nline.sales_tax_group', "Tax Group")
    apply = fields.Boolean("Apply",
        help="Add the charge to the next invoice of the order.")
    account = fields.Many2One('account.account', "Revenue Account",
        domain=[('type', '!=', None), ('closed', '!=', True)])
    shipment = fields.Many2One('stock.shipment.out', "Shipper",
        ondelete='SET NULL', readonly=True)
    invoice_line = fields.Function(fields.Many2One('account.invoice.line',
            "Invoice Line"), 'get_invoice_line')
    invoice = fields.Function(fields.Many2One('account.invoice', "Invoice"),
        'get_invoice_line', searcher='search_invoice')
    applied_amount = fields.Function(fields.Numeric("Applied Amount",
            digits=(16, 2)), 'get_invoice_line')

    @staticmethod
    def default_apply():
        return True

    @staticmethod
    def default_amount():
        return Decimal(0)

    @fields.depends('service_charge')
    def on_change_service_charge(self):
        if self.service_charge:
            self.description = self.service_charge.description
            self.amount = self.service_charge.amount
            self.account = self.service_charge.account

    def get_rec_name(self, name):
        return self.description or self.service_charge.rec_name

    @classmethod
    def copy(cls, charges, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('shipment', None)
        default.setdefault('apply', True)
        return super().copy(charges, default=default)

    @classmethod
    def get_invoice_line(cls, charges, names):
        pool = Pool()
        InvoiceLine = pool.get('account.invoice.line')
        result = {n: {c.id: None for c in charges} for n in names}
        lines = InvoiceLine.search([
                ('origin', 'in', ['%s,%s' % (cls.__name__, c.id)
                        for c in charges]),
                ('invoice.state', '!=', 'cancelled'),
                ])
        for line in lines:
            if 'invoice_line' in names:
                result['invoice_line'][line.origin.id] = line.id
            if 'invoice' in names:
                result['invoice'][line.origin.id] = (
                    line.invoice.id if line.invoice else None)
            if 'applied_amount' in names:
                result['applied_amount'][line.origin.id] = line.amount
        if 'applied_amount' in names:
            for charge in charges:
                if result['applied_amount'][charge.id] is None:
                    result['applied_amount'][charge.id] = Decimal(0)
        return result

    @classmethod
    def search_invoice(cls, name, clause):
        pool = Pool()
        InvoiceLine = pool.get('account.invoice.line')
        _, operator, value = clause[:3]
        lines = InvoiceLine.search([
                ('invoice',) + tuple(clause[1:]),
                ('origin', 'like', cls.__name__ + ',%'),
                ])
        return [('id', 'in', [l.origin.id for l in lines if l.origin])]

    @property
    def pending(self):
        "To be added to the next invoice of the order"
        return self.apply and not self.invoice_line and bool(self.amount)

    def get_invoice_line_values(self, invoice):
        "The invoice line of the charge (not saved)"
        pool = Pool()
        InvoiceLine = pool.get('account.invoice.line')
        Configuration = pool.get('account.configuration')
        account = self.account or self.service_charge.account
        if not account:
            account = Configuration(1).get_multivalue(
                'default_category_account_revenue',
                company=self.sale.company.id)
        line = InvoiceLine(
            invoice=invoice,
            type='line',
            company=self.sale.company,
            currency=self.sale.currency,
            description=self.description or self.service_charge.description
            or self.service_charge.code,
            quantity=1,
            unit_price=self.amount,
            account=account,
            origin=self,
            )
        line.taxes = self.tax_group.get_taxes(self.sale.sale_date) \
            if self.tax_group else []
        return line

    @classmethod
    def apply_to_draft_invoices(cls, charges):
        """Add the pending charges to the draft invoice of their order (made
        when the order was confirmed or shipped)"""
        pool = Pool()
        InvoiceLine = pool.get('account.invoice.line')
        lines = []
        for charge in cls.browse(charges):
            if not charge.pending:
                continue
            drafts = [i for i in charge.sale.invoices if i.state == 'draft'
                and i.type == 'out']
            if drafts:
                lines.append(charge.get_invoice_line_values(drafts[0]))
        if lines:
            InvoiceLine.save(lines)
            Invoice = pool.get('account.invoice')
            Invoice.update_taxes(list({l.invoice for l in lines}))
        return lines
