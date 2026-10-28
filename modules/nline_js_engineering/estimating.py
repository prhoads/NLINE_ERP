# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Estimating: quotes (VEstimatingQuote)

A quote is a record of its own, as in Jobshop: it is estimated (Active),
made ready and printed (Ready), then won (a sales order is made from it) or
lost. Each line quotes a part (or a description) at one or more quantities,
its cost from the part, its engineering master or a quote master.
"""
import datetime as dt
from decimal import Decimal

from trytond.model import ModelSQL, ModelView, fields
from trytond.pool import Pool
from trytond.pyson import Eval
from trytond.transaction import Transaction

QUOTE_STATUS = [
    ('active', "Active"),
    ('ready', "Ready"),
    ('won', "Won"),
    ('lost', "Lost"),
    ('cancelled', "Cancelled"),
    ]
COST_FROM = [
    ('part', "Part"),
    ('engineering', "Engineering Master"),
    ('quote', "Quote Master"),
    ('none', "None"),
    ]
PRICE = (16, 4)


class AddressMixin:
    "A Jobshop address with its contact (Sold To and Ship To tabs)"
    __slots__ = ()


def _address_fields(prefix, label):
    return {
        prefix + 'name': fields.Char(label + "Name"),
        prefix + 'street': fields.Text(label + "Address"),
        prefix + 'city': fields.Char(label + "City"),
        prefix + 'state': fields.Char(label + "State"),
        prefix + 'postal_code': fields.Char(label + "Postal Code"),
        prefix + 'country': fields.Char(label + "Country"),
        prefix + 'contact_name': fields.Char(label + "Contact"),
        prefix + 'contact_title': fields.Char(label + "Title"),
        prefix + 'contact_phone': fields.Char(label + "Phone"),
        prefix + 'contact_fax': fields.Char(label + "Fax"),
        prefix + 'contact_email': fields.Char(label + "Email"),
        # Jobshop's Etc. line of the address and the contact's Mobile
        prefix + 'addr_etc': fields.Char(label + "Etc."),
        prefix + 'contact_mobile': fields.Char(label + "Mobile"),
        }


for _name, _field in list(_address_fields('', '').items()) + list(
        _address_fields('ship_', 'Ship To ').items()):
    setattr(AddressMixin, _name, _field)

ADDRESS_FIELDS = list(_address_fields('', '').keys())


class StampMixin:
    "Jobshop's Created by / Last Modified by: the user and the time"
    __slots__ = ()
    created_by = fields.Function(fields.Char("Created by"), 'get_stamp')
    modified_by = fields.Function(
        fields.Char("Last Modified by"), 'get_stamp')

    def get_stamp(self, name):
        user, date = ((self.create_uid, self.create_date)
            if name == 'created_by' else (self.write_uid, self.write_date))
        if not date:
            return None
        return '%s %s' % (user.login if user else '',
            date.strftime('%m/%d/%Y %I:%M:%S %p'))


class Quote(AddressMixin, StampMixin, ModelSQL, ModelView):
    "Quote"
    __name__ = 'nline.quote'

    number = fields.Char(
        "Quote ID", strip=True,
        help="Given when the quote is saved, if left empty.")
    quote_date = fields.Date("Quote Date", required=True)
    status = fields.Selection(QUOTE_STATUS, "Status", required=True)
    party = fields.Many2One(
        'party.party', "Customer ID",
        context={
            'company': Eval('company', -1),
            },
        depends={'company'})
    company = fields.Many2One('company.company', "Company", required=True)
    customer_reference = fields.Char("Customer Reference")
    # Dates tab
    desired_ship_date = fields.Date("Ship On")
    promise_date = fields.Date("Promised")
    followup_date = fields.Date("Follow Up")
    expiration_date = fields.Date("Expires")
    expected_win_date = fields.Date("Expected")
    won_loss_date = fields.Date("Won/Loss")
    won_loss_reason = fields.Char("Won/Loss Reason")
    printed_date = fields.DateTime("Printed", readonly=True)
    quoted_leadtime = fields.Integer("Quoted Leadtime (days)")
    win_probability = fields.Float("Win Probability %")
    # Details tab
    our_supplier_id = fields.Char("Our Supplier ID")
    sic_code = fields.Char("SIC Code ID")
    carrier = fields.Char("Carrier ID")
    sales_rep = fields.Char("Sales Rep ID")
    territory = fields.Char("Territory ID")
    fob_point = fields.Many2One('nline.fob_point', "FOB Point ID")
    ship_via = fields.Many2One('nline.ship_via', "Ship Via ID")
    freight_terms = fields.Selection([
            (None, ""),
            ('billed', "Billed"),
            ('collect', "Collect"),
            ('prepaid', "Prepaid"),
            ], "Freight Terms")
    payment_term = fields.Many2One(
        'account.invoice.payment_term', "Terms ID")
    discount_class = fields.Char("Discount Class ID")
    tax_group = fields.Char("Tax Group ID")
    tax_id_number = fields.Char("Tax ID")
    tax_exempt = fields.Boolean("Exempt")
    # Specs tab
    specifications = fields.Text("Specifications")
    footer = fields.Text("Quote Footer")
    copy_notes = fields.Boolean("Copy Notes to Sales Order",
        help="Winning the quote copies its notes to the sales order.")
    lines = fields.One2Many('nline.quote.line', 'quote', "Lines")
    charges = fields.One2Many('nline.quote.charge', 'quote', "Charges")
    sale = fields.Many2One(
        'sale.sale', "Sales Order", readonly=True, ondelete='SET NULL',
        help="The sales order made when the quote was won.")
    total_amount = fields.Function(fields.Numeric(
            "Total", digits=(16, 2)), 'get_total_amount')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('quote_date', 'DESC'), ('number', 'DESC')]

    @classmethod
    def default_quote_date(cls):
        return Pool().get('ir.date').today()

    @classmethod
    def default_status(cls):
        return 'active'

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    def get_rec_name(self, name):
        party = self.party.rec_name if self.party else (self.name or '')
        return '%s %s' % (self.number or '', party)

    @classmethod
    def search_rec_name(cls, name, clause):
        return ['OR',
            ('number',) + tuple(clause[1:]),
            ('party.rec_name',) + tuple(clause[1:]),
            ('name',) + tuple(clause[1:]),
            ('customer_reference',) + tuple(clause[1:]),
            ]

    def get_total_amount(self, name):
        total = sum((l.amount or Decimal(0) for l in self.lines),
            Decimal(0))
        total += sum((c.amount or Decimal(0) for c in self.charges),
            Decimal(0))
        return total.quantize(Decimal('0.01'))

    @classmethod
    def next_number(cls, date=None):
        """Jobshop's quote numbering at N-Line: the year and a four digit
        count (20260971)"""
        year = str((date or dt.date.today()).year)
        numbers = [q.number for q in cls.search([
                    ('number', 'like', year + '%')])]
        count = max((int(n[4:]) for n in numbers
                if n[4:].isdigit() and len(n) == 8), default=0)
        return '%s%04d' % (year, count + 1)

    @classmethod
    def create(cls, vlist):
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            if not values.get('number'):
                values['number'] = cls.next_number(values.get('quote_date'))
        quotes = super().create(vlist)
        # A new customer's quote gets its Sold To and Ship To
        to_fill = [q for q in quotes if q.party and not q.name]
        for quote in to_fill:
            quote.fill_party()
        if to_fill:
            cls.save(to_fill)
        return quotes

    @classmethod
    def copy(cls, quotes, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('number', None)
        default.setdefault('status', 'active')
        default.setdefault('sale', None)
        default.setdefault('printed_date', None)
        default.setdefault('won_loss_date', None)
        default.setdefault('won_loss_reason', None)
        default.setdefault('quote_date', cls.default_quote_date())
        return super().copy(quotes, default=default)

    def fill_party(self):
        "Copy the customer's address and terms (Sold To / Ship To tabs)"
        party = self.party
        if not party:
            return
        address = party.address_get(type='invoice')
        ship = party.address_get(type='delivery') or address
        self.name = party.name
        for prefix, a in [('', address), ('ship_', ship)]:
            if not a:
                continue
            setattr(self, prefix + 'name', a.party_name or party.name)
            setattr(self, prefix + 'street', a.street)
            setattr(self, prefix + 'city', a.city)
            setattr(self, prefix + 'postal_code', a.postal_code)
            setattr(self, prefix + 'state',
                a.subdivision.code if a.subdivision else None)
            setattr(self, prefix + 'country',
                a.country.rec_name if a.country else None)
        email = party.contact_mechanism_get('email')
        phone = party.contact_mechanism_get({'phone', 'mobile'})
        self.contact_email = email.value if email else None
        self.contact_phone = phone.value if phone else None
        mobile = party.contact_mechanism_get('mobile')
        self.contact_mobile = mobile.value if mobile else None
        if getattr(party, 'customer_payment_term', None):
            self.payment_term = party.customer_payment_term


class QuoteLine(ModelSQL, ModelView):
    "Quote Line"
    __name__ = 'nline.quote.line'

    quote = fields.Many2One(
        'nline.quote', "Quote", required=True, ondelete='CASCADE')
    line_no = fields.Integer("Line No")
    status = fields.Selection([
            ('open', "Open"),
            ('closed', "Closed"),
            ], "Line Status", required=True)
    product = fields.Many2One('product.product', "Part ID")
    description = fields.Char("Description")
    customer_part = fields.Char("Customer Part ID")
    unit = fields.Many2One('product.uom', "Selling U/M")
    cost_from = fields.Selection(COST_FROM, "Cost From", required=True)
    bom = fields.Many2One(
        'production.bom', "Engineering Master",
        domain=[('master_type', '=', 'engineering')])
    quote_master = fields.Many2One(
        'production.bom', "Quote Master",
        domain=[('master_type', '=', 'quote')])
    drawing_number = fields.Char("Drawing ID")
    drawing_revision = fields.Char("Drawing Rev")
    product_code = fields.Many2One('nline.product_code', "Product Code")
    commodity_code = fields.Many2One(
        'nline.commodity_code', "Commodity Code")
    desired_ship_date = fields.Date("Ship Date")
    promise_date = fields.Date("Promise Date")
    specifications = fields.Text("Specs")
    win_probability = fields.Float("Win Probability %")
    prices = fields.One2Many(
        'nline.quote.line.price', 'line', "Quantities Quoted")
    quantity = fields.Function(fields.Float("Qty"), 'get_price_field')
    unit_cost = fields.Function(fields.Numeric(
            "Unit Cost", digits=PRICE), 'get_price_field')
    unit_price = fields.Function(fields.Numeric(
            "Unit Price", digits=PRICE), 'get_price_field')
    amount = fields.Function(fields.Numeric(
            "Amount", digits=(16, 2)), 'get_price_field')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('quote', 'ASC'), ('line_no', 'ASC'), ('id', 'ASC')]

    @classmethod
    def default_status(cls):
        return 'open'

    @classmethod
    def default_cost_from(cls):
        return 'engineering'

    def get_rec_name(self, name):
        return '%s/%s %s' % (self.quote.number, self.line_no or '',
            self.product.rec_name if self.product else self.description or '')

    def total_price(self):
        "The quantity quoted that counts in the quote's total"
        prices = [p for p in self.prices if p.in_total] or list(
            self.prices[:1])
        return prices[0] if prices else None

    def get_price_field(self, name):
        price = self.total_price()
        if not price:
            return None
        if name == 'quantity':
            return price.quantity
        if name == 'unit_cost':
            return price.unit_cost
        if name == 'unit_price':
            return price.net_price()
        if name == 'amount':
            return (price.net_price() * Decimal(str(price.quantity or 0))
                ).quantize(Decimal('0.01'))

    @classmethod
    def create(cls, vlist):
        pool = Pool()
        Quote = pool.get('nline.quote')
        vlist = [v.copy() for v in vlist]
        nexts = {}
        for values in vlist:
            if values.get('line_no') is None and values.get('quote'):
                quote = values['quote']
                if quote not in nexts:
                    nexts[quote] = max((l.line_no or 0
                            for l in Quote(quote).lines), default=0)
                nexts[quote] += 1
                values['line_no'] = nexts[quote]
        return super().create(vlist)


class QuoteLinePrice(ModelSQL, ModelView):
    "Quote Line Price"
    __name__ = 'nline.quote.line.price'

    line = fields.Many2One(
        'nline.quote.line', "Line", required=True, ondelete='CASCADE')
    quantity = fields.Float("Qty", required=True)
    unit_cost = fields.Numeric("Unit Cost", digits=PRICE)
    calc_unit_price = fields.Numeric("Calc Unit Price", digits=PRICE)
    unit_price = fields.Numeric("Unit Price", digits=PRICE)
    trade_discount = fields.Float("Trade Disc %")
    leadtime = fields.Integer("Leadtime")
    material_markup = fields.Float("Pur Matl Markup %")
    fab_markup = fields.Float("Fab Matl Markup %")
    labor_markup = fields.Float("Labor Markup %")
    burden_markup = fields.Float("Burden Markup %")
    service_markup = fields.Float("Service Markup %")
    in_total = fields.Boolean("In Total")
    in_proforma = fields.Boolean("In Proforma")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('line', 'ASC'), ('quantity', 'ASC'), ('id', 'ASC')]

    @classmethod
    def default_quantity(cls):
        return 1

    @classmethod
    def default_in_total(cls):
        return True

    def net_price(self):
        price = self.unit_price
        if price is None:
            price = self.calc_unit_price or Decimal(0)
        if self.trade_discount:
            price *= Decimal(str(1 - self.trade_discount / 100))
        return Decimal(price).quantize(Decimal('0.0001'))


class QuoteCharge(ModelSQL, ModelView):
    "Quote Charge"
    __name__ = 'nline.quote.charge'

    quote = fields.Many2One(
        'nline.quote', "Quote", required=True, ondelete='CASCADE')
    service_charge = fields.Char("Service Charge ID")
    product = fields.Many2One(
        'product.product', "Service", domain=[('type', '=', 'service')],
        help="The service of the sales order line made from the charge.")
    description = fields.Char("Description")
    amount = fields.Numeric("Amount", digits=(16, 2))
    tax_group = fields.Char("Tax Group ID")


MODELS = [Quote, QuoteLine, QuoteLinePrice, QuoteCharge]
