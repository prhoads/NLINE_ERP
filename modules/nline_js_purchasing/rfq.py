# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop's Request for Quote window: a request sent to up to three
suppliers, the quantities each line asks a price for, the prices each
supplier quoted, and the purchase order made from the chosen quote."""
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.model.exceptions import AccessError
from trytond.modules.product import price_digits
from trytond.pool import Pool
from trytond.pyson import Eval
from trytond.transaction import Transaction

from .party import FREIGHT_TERMS, TAX_GROUP_DOMAIN
from .purchase import LINE_TYPES, ShipToMixin

SLOTS = (1, 2, 3)
RFQ_STATUS = [
    ('unreleased', "Unreleased"),
    ('active', "Active (Awaiting Quote)"),
    ('closed', "Closed"),
    ('cancelled', "Cancelled"),
    ]
SUPPLIER_DOMAIN = [
    ('is_supplier', '=', True),
    ]


def _slot_fields(namespace):
    "Supplier 1, 2 and 3 of the request (Jobshop's three Supplier tabs)"
    for slot in SLOTS:
        namespace['supplier_%s' % slot] = fields.Many2One(
            'party.party', "Supplier %s" % slot, ondelete='RESTRICT',
            domain=SUPPLIER_DOMAIN,
            context={
                'company': Eval('company', -1),
                },
            depends={'company'})
        namespace['quote_received_%s' % slot] = fields.Boolean(
            "Quote Received %s" % slot)
        namespace['tax_group_%s' % slot] = fields.Many2One(
            'account.tax', "Tax Group %s" % slot, ondelete='SET NULL',
            domain=TAX_GROUP_DOMAIN)
        namespace['reference_%s' % slot] = fields.Char(
            "Supplier Ref No %s" % slot)
        namespace['as_of_date_%s' % slot] = fields.Date(
            "As Of Date %s" % slot)
        namespace['expiration_date_%s' % slot] = fields.Date(
            "Expiration Date %s" % slot)


class RequestForQuote(ShipToMixin, ModelSQL, ModelView):
    "Request for Quote"
    __name__ = 'nline.rfq'
    _rec_name = 'number'

    company = fields.Many2One(
        'company.company', "Company", required=True, ondelete='CASCADE')
    number = fields.Char("RFQ ID", strip=True,
        help="Left empty, the next number is given on save.")
    rfq_date = fields.Date("RFQ Date", required=True)
    due_date = fields.Date("Quote Due Date")
    desired_receive_date = fields.Date("Desired Recv Date")
    status = fields.Selection(RFQ_STATUS, "RFQ Status", required=True)
    fob_point = fields.Many2One(
        'nline.fob_point', "FOB Point", ondelete='SET NULL')
    ship_via = fields.Many2One(
        'nline.ship_via', "Ship Via", ondelete='SET NULL')
    payment_term = fields.Many2One(
        'account.invoice.payment_term', "Terms", ondelete='SET NULL')
    payable_account = fields.Many2One(
        'account.account', "Payable Account", ondelete='SET NULL',
        domain=[
            ('type.payable', '=', True),
            ('closed', '!=', True),
            ('company', '=', Eval('company', -1)),
            ])
    freight_terms = fields.Selection(FREIGHT_TERMS, "Freight Terms")
    buyer = fields.Char("Buyer")
    printed_date = fields.DateTime("Printed Date", readonly=True)
    specifications = fields.Text("Specifications")
    _slot_fields(locals())
    lines = fields.One2Many('nline.rfq.line', 'rfq', "Lines")
    purchases = fields.One2Many(
        'purchase.purchase', 'rfq', "Purchase Orders", readonly=True)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('number_unique', Unique(t, t.company, t.number),
                'nline_js_purchasing.msg_rfq_number_unique'),
            ]
        cls._order = [('rfq_date', 'DESC'), ('number', 'DESC'),
            ('id', 'DESC')]

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_rfq_date(cls):
        return Pool().get('ir.date').today()

    @classmethod
    def default_due_date(cls):
        return Pool().get('ir.date').today()

    @classmethod
    def default_status(cls):
        return 'unreleased'

    @classmethod
    def default_buyer(cls):
        user = Pool().get('res.user')(Transaction().user)
        return user.login.upper() if user and user.login else None

    def suppliers(self):
        "[(slot, party)] of the suppliers asked"
        return [(s, getattr(self, 'supplier_%s' % s)) for s in SLOTS
            if getattr(self, 'supplier_%s' % s)]

    @classmethod
    def create(cls, vlist):
        pool = Pool()
        Sequence = pool.get('ir.sequence')
        ModelData = pool.get('ir.model.data')
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            if not values.get('number'):
                sequence = Sequence(ModelData.get_id(
                        'nline_js_purchasing', 'sequence_rfq'))
                values['number'] = sequence.get()
        return super().create(vlist)

    @classmethod
    def copy(cls, rfqs, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('number', None)
        default.setdefault('status', 'unreleased')
        default.setdefault('printed_date', None)
        default.setdefault('purchases', None)
        for slot in SLOTS:
            default.setdefault('quote_received_%s' % slot, False)
        return super().copy(rfqs, default=default)

    @classmethod
    def delete(cls, rfqs):
        for rfq in rfqs:
            if rfq.purchases:
                raise AccessError(gettext(
                        'nline_js_purchasing.msg_rfq_delete_purchased',
                        rfq=rfq.rec_name))
        super().delete(rfqs)


def _line_slot_fields(namespace):
    for slot in SLOTS:
        namespace['supplier_code_%s' % slot] = fields.Char(
            "Supplier Part/Service ID %s" % slot)
        namespace['tax_group_%s' % slot] = fields.Many2One(
            'account.tax', "Tax Group %s" % slot, ondelete='SET NULL',
            domain=TAX_GROUP_DOMAIN)


class RequestForQuoteLine(ModelSQL, ModelView):
    "Request for Quote Line"
    __name__ = 'nline.rfq.line'

    rfq = fields.Many2One(
        'nline.rfq', "RFQ", required=True, ondelete='CASCADE')
    sequence = fields.Integer("Line No")
    line_type = fields.Selection(LINE_TYPES, "Line Type", required=True)
    line_status = fields.Selection([
            ('open', "Open"),
            ('closed', "Closed"),
            ], "Status", required=True)
    product = fields.Many2One(
        'product.product', "Part / Service", ondelete='RESTRICT',
        domain=[
            ('purchasable', '=', True),
            ])
    service_part = fields.Many2One(
        'product.product', "Part ID", ondelete='SET NULL',
        states={
            'invisible': Eval('line_type') != 'service',
            },
        help="The part the service is done on.")
    description = fields.Text("Description")
    unit = fields.Many2One('product.uom', "Purchase U/M", ondelete='RESTRICT')
    mfg_name = fields.Char("Mfg Name")
    mfg_part_id = fields.Char("Mfg Part ID")
    _line_slot_fields(locals())
    product_code = fields.Many2One(
        'nline.product_code', "Product Code", ondelete='SET NULL')
    commodity_code = fields.Many2One(
        'nline.commodity_code', "Commodity Code", ondelete='SET NULL')
    desired_receive_date = fields.Date("Recv Date")
    expense_account = fields.Many2One(
        'account.account', "Exp Acct ID", ondelete='SET NULL')
    specifications = fields.Text("Specifications")
    drawing = fields.Char("Drawing ID")
    drawing_revision = fields.Char("Drawing Rev")
    prices = fields.One2Many('nline.rfq.line.price', 'line', "Quantities")
    links = fields.One2Many('nline.rfq.link', 'line', "Links")
    purchase_lines = fields.One2Many(
        'purchase.line', 'rfq_line', "Purchase Lines", readonly=True)
    linked = fields.Function(fields.Boolean("Linked"), 'get_flags')
    po_line_exists = fields.Function(
        fields.Boolean("PO Line Exists"), 'get_flags')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('rfq')
        cls._order = [('rfq', 'ASC'), ('sequence', 'ASC'), ('id', 'ASC')]

    @classmethod
    def default_line_type(cls):
        return 'part'

    @classmethod
    def default_line_status(cls):
        return 'open'

    @classmethod
    def get_flags(cls, lines, names):
        result = {n: {} for n in names}
        for line in lines:
            if 'linked' in result:
                result['linked'][line.id] = bool(line.links)
            if 'po_line_exists' in result:
                result['po_line_exists'][line.id] = bool(line.purchase_lines)
        return result

    def get_rec_name(self, name):
        text = '%s/%s' % (self.rfq.rec_name, self.sequence or '')
        if self.product:
            text += ' ' + self.product.rec_name
        elif self.description:
            text += ' ' + self.description.splitlines()[0]
        return text

    @classmethod
    def copy(cls, lines, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('purchase_lines', None)
        default.setdefault('line_status', 'open')
        return super().copy(lines, default=default)


def _price_slot_fields(namespace):
    for slot in SLOTS:
        namespace['lead_time_%s' % slot] = fields.Integer(
            "Leadtime %s" % slot, help="Days.")
        namespace['unit_price_%s' % slot] = fields.Numeric(
            "Unit Price %s" % slot, digits=price_digits)
        namespace['trade_discount_%s' % slot] = fields.Numeric(
            "Trade Disc %% %s" % slot, digits=(16, 4))
        namespace['fixed_charge_%s' % slot] = fields.Numeric(
            "Fixed Charge %s" % slot, digits=(16, 2))
        namespace['delivery_date_%s' % slot] = fields.Date(
            "Delivery Date %s" % slot)
        namespace['amount_%s' % slot] = fields.Function(fields.Numeric(
                "Extension %s" % slot, digits=(16, 2)), 'get_amount')


class RequestForQuoteLinePrice(ModelSQL, ModelView):
    "Request for Quote Quantity"
    __name__ = 'nline.rfq.line.price'

    line = fields.Many2One(
        'nline.rfq.line', "Line", required=True, ondelete='CASCADE')
    quantity = fields.Float("Quote Qty", required=True)
    _price_slot_fields(locals())

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('line')
        cls._order = [('line', 'ASC'), ('quantity', 'ASC'), ('id', 'ASC')]

    def amount(self, slot):
        "Jobshop's extension: qty x price less the discount, plus the charge"
        price = getattr(self, 'unit_price_%s' % slot)
        if price is None:
            return None
        discount = getattr(self, 'trade_discount_%s' % slot) or Decimal(0)
        fixed = getattr(self, 'fixed_charge_%s' % slot) or Decimal(0)
        amount = (Decimal(str(self.quantity or 0)) * price
            * (1 - discount / 100) + fixed)
        return amount.quantize(Decimal('0.01'))

    @classmethod
    def get_amount(cls, prices, names):
        result = {n: {} for n in names}
        for price in prices:
            for name in names:
                result[name][price.id] = price.amount(int(name[-1]))
        return result


class RequestForQuoteLink(ModelSQL, ModelView):
    """Request for Quote Link

    The work order a request line is for (Jobshop's RFQ_LINK); it goes on
    to the purchase line made from the quote."""
    __name__ = 'nline.rfq.link'

    line = fields.Many2One(
        'nline.rfq.line', "Line", required=True, ondelete='CASCADE')
    production = fields.Many2One(
        'production', "Work Order", ondelete='CASCADE')
    operation = fields.Integer("Seq No")
    piece = fields.Integer("Piece No")
    work = fields.Many2One(
        'production.work', "Operation", ondelete='SET NULL',
        domain=[
            ('production', '=', Eval('production', -1)),
            ])
    quantity = fields.Float("Quantity")
    reference = fields.Char(
        "Jobshop Link",
        help="The Jobshop work order of the link, kept when the work order "
        "is not in the ERP.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('line')
        cls._order = [('line', 'ASC'), ('id', 'ASC')]
