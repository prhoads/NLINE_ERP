# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The Jobshop purchase order fields on Tryton's purchases

Jobshop status of a purchase (Purchase Order window):
- Unreleased: draft; Hold: draft or quotation put on hold
- Firm: quotation (released, not yet placed with the supplier)
- Released: confirmed / processing with something still to receive
- Closed: everything received (or the rest ignored), or done
- Cancelled: cancelled
"""
from decimal import Decimal

from trytond.model import ModelSQL, ModelView, fields
from trytond.modules.product import price_digits
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction

from .party import FREIGHT_TERMS, TAX_GROUP_DOMAIN

PO_STATUS = [
    ('unreleased', "Unreleased"),
    ('hold', "Hold"),
    ('firm', "Firm"),
    ('released', "Released"),
    ('closed', "Closed"),
    ('cancelled', "Cancelled"),
    ]
LINE_TYPES = [
    ('part', "Part Order"),
    ('service', "Service Order"),
    ]
SHIP_TO_FIELDS = ['ship_to_name', 'ship_to_street', 'ship_to_city',
    'ship_to_state', 'ship_to_postal_code', 'ship_to_country',
    'ship_to_contact', 'ship_to_title', 'ship_to_phone', 'ship_to_fax',
    'ship_to_email']


class ShipToMixin:
    "The Ship To tab of Jobshop's purchase orders and RFQs (drop shipments)"
    __slots__ = ()
    ship_to_name = fields.Char("Ship To Name")
    ship_to_street = fields.Text("Ship To Address")
    ship_to_city = fields.Char("Ship To City")
    ship_to_state = fields.Char("Ship To State")
    ship_to_postal_code = fields.Char("Ship To Postal Code")
    ship_to_country = fields.Char("Ship To Country")
    ship_to_contact = fields.Char("Ship To Contact")
    ship_to_title = fields.Char("Ship To Title")
    ship_to_phone = fields.Char("Ship To Phone")
    ship_to_fax = fields.Char("Ship To Fax")
    ship_to_email = fields.Char("Ship To E-Mail")


class Purchase(ShipToMixin, metaclass=PoolMeta):
    __name__ = 'purchase.purchase'

    jobshop_status = fields.Function(fields.Selection(
            PO_STATUS, "Order Status"), 'get_jobshop_status',
        searcher='search_jobshop_status')
    hold = fields.Boolean(
        "Hold", states={
            'readonly': ~Eval('state').in_(['draft', 'quotation']),
            })
    buyer = fields.Char("Buyer")
    fob_point = fields.Many2One(
        'nline.fob_point', "FOB Point", ondelete='SET NULL')
    ship_via = fields.Many2One(
        'nline.ship_via', "Ship Via", ondelete='SET NULL')
    tax_group = fields.Many2One(
        'account.tax', "Tax Group", ondelete='SET NULL',
        domain=TAX_GROUP_DOMAIN)
    freight_terms = fields.Selection(FREIGHT_TERMS, "Freight Terms")
    payable_account = fields.Many2One(
        'account.account', "Payable Account", ondelete='SET NULL',
        domain=[
            ('type.payable', '=', True),
            ('closed', '!=', True),
            ('company', '=', Eval('company', -1)),
            ],
        help="Overrides the supplier's payable account on the bills.")
    promise_date = fields.Date("Promise Date")
    printed_date = fields.DateTime("Printed Date", readonly=True)
    specifications = fields.Text("Specifications")
    rfq = fields.Many2One(
        'nline.rfq', "Request for Quote", ondelete='SET NULL',
        readonly=True)
    last_received_date = fields.Function(
        fields.Date("Last Recv Date"), 'get_received')
    received_amount = fields.Function(fields.Numeric(
            "Received Amount", digits=(16, 2)), 'get_received')

    @classmethod
    def default_hold(cls):
        return False

    def get_jobshop_status(self, name=None):
        if self.state == 'cancelled':
            return 'cancelled'
        if self.state == 'done':
            return 'closed'
        if self.state in {'confirmed', 'processing'}:
            if self.shipment_state == 'received':
                return 'closed'
            return 'released'
        if self.hold:
            return 'hold'
        if self.state == 'quotation':
            return 'firm'
        return 'unreleased'

    @classmethod
    def search_jobshop_status(cls, name, clause):
        _, operator, value = clause[:3]
        values = value if isinstance(value, (list, tuple)) else [value]
        domains = {
            'cancelled': [('state', '=', 'cancelled')],
            'closed': ['OR', ('state', '=', 'done'),
                [('state', 'in', ['confirmed', 'processing']),
                    ('shipment_state', '=', 'received')]],
            'released': [('state', 'in', ['confirmed', 'processing']),
                ('shipment_state', '!=', 'received')],
            'hold': [('state', 'in', ['draft', 'quotation']),
                ('hold', '=', True)],
            'firm': [('state', '=', 'quotation'), ('hold', '!=', True)],
            'unreleased': [('state', '=', 'draft'), ('hold', '!=', True)],
            }
        domain = ['OR'] + [domains[v] for v in values if v in domains]
        if len(domain) == 1:
            domain = [('id', '=', -1)]
        if operator in {'!=', 'not in'}:
            return [('id', 'not in', [p.id for p in cls.search(domain)])]
        return [domain]

    @classmethod
    def get_received(cls, purchases, names):
        result = {n: {} for n in names}
        for purchase in purchases:
            last, amount = None, Decimal(0)
            for line in purchase.lines:
                if line.type != 'line':
                    continue
                for move in line.moves:
                    if move.state != 'done':
                        continue
                    if move.effective_date and (
                            not last or move.effective_date > last):
                        last = move.effective_date
                    amount += (Decimal(str(move.quantity))
                        * (move.unit_price or Decimal(0)))
            if 'last_received_date' in result:
                result['last_received_date'][purchase.id] = last
            if 'received_amount' in result:
                result['received_amount'][purchase.id] = (
                    purchase.currency.round(amount)
                    if purchase.currency else amount)
        return result

    @classmethod
    def create(cls, vlist):
        purchases = super().create(vlist)
        # A party bought from is a supplier (Suppliers window)
        pool = Pool()
        Party = pool.get('party.party')
        parties = {p.party for p in purchases if not p.party.is_supplier}
        if parties:
            # (a buyer may not change parties)
            with Transaction().set_context(_check_access=False):
                Party.write(list(parties), {'is_supplier': True})
        return purchases

    @classmethod
    def copy(cls, purchases, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('printed_date', None)
        default.setdefault('rfq', None)
        default.setdefault('hold', False)
        return super().copy(purchases, default=default)

    def _get_invoice_purchase(self):
        invoice = super()._get_invoice_purchase()
        if self.payable_account:
            invoice.account = self.payable_account
        return invoice


class PurchaseLine(metaclass=PoolMeta):
    __name__ = 'purchase.line'

    line_type = fields.Function(fields.Selection(
            LINE_TYPES, "PO Line Type"), 'get_line_type')
    list_unit_price = fields.Numeric(
        "Quoted Unit Price", digits=price_digits,
        help="The unit price before the trade discount and fixed charge "
        "(the line's unit price includes them).")
    trade_discount = fields.Numeric(
        "Trade Disc %", digits=(16, 4))
    fixed_charge = fields.Numeric("Fixed Charge", digits=(16, 2))
    supplier_part_code = fields.Char("Supplier Part ID")
    mfg_name = fields.Char("Mfg Name")
    mfg_part_id = fields.Char("Mfg Part ID")
    product_code = fields.Many2One(
        'nline.product_code', "Product Code", ondelete='SET NULL')
    commodity_code = fields.Many2One(
        'nline.commodity_code', "Commodity Code", ondelete='SET NULL')
    promise_date = fields.Date("Promise Date")
    tax_group = fields.Many2One(
        'account.tax', "Tax Group", ondelete='SET NULL',
        domain=TAX_GROUP_DOMAIN,
        help="Overrides the tax group of the order.")
    expense_account = fields.Many2One(
        'account.account', "Expense Account", ondelete='SET NULL',
        domain=[
            ('closed', '!=', True),
            ],
        help="Charged on the bill instead of the part's account.")
    line_closed = fields.Boolean(
        "Closed", help="Closed by hand before it was received in full.")
    line_status = fields.Function(fields.Selection([
                ('open', "Open"),
                ('closed', "Closed"),
                ], "Line Status"), 'get_received')
    received_quantity = fields.Function(
        fields.Float("Received Qty"), 'get_received')
    last_received_date = fields.Function(
        fields.Date("Last Recv Date"), 'get_received')
    specifications = fields.Text("Specifications")
    rfq_line = fields.Many2One(
        'nline.rfq.line', "RFQ Line", ondelete='SET NULL', readonly=True)
    links = fields.One2Many(
        'nline.purchase.link', 'purchase_line', "Links")

    @classmethod
    def default_line_closed(cls):
        return False

    def get_line_type(self, name):
        if self.product and self.product.type == 'service':
            return 'service'
        return 'part'

    @classmethod
    def get_received(cls, lines, names):
        result = {n: {} for n in names}
        for line in lines:
            received, last = 0.0, None
            for move in line.moves:
                if move.state != 'done':
                    continue
                received += move.quantity
                if move.effective_date and (
                        not last or move.effective_date > last):
                    last = move.effective_date
            if 'received_quantity' in result:
                result['received_quantity'][line.id] = received
            if 'last_received_date' in result:
                result['last_received_date'][line.id] = last
            if 'line_status' in result:
                closed = bool(line.line_closed) or (
                    line.quantity and received >= line.quantity)
                result['line_status'][line.id] = (
                    'closed' if closed else 'open')
        return result

    def get_invoice_line(self):
        lines = super().get_invoice_line()
        if self.expense_account:
            for line in lines:
                line.account = self.expense_account
        return lines

    @classmethod
    def copy(cls, lines, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('rfq_line', None)
        default.setdefault('line_closed', False)
        return super().copy(lines, default=default)


class PurchaseLink(ModelSQL, ModelView):
    """Purchase Line Link

    The work order a purchase line supplies (Jobshop's ORDER_LINK): the
    material of an operation (operation and piece) or the outside operation
    of a service."""
    __name__ = 'nline.purchase.link'

    purchase_line = fields.Many2One(
        'purchase.line', "Purchase Line", required=True, ondelete='CASCADE')
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
    received_quantity = fields.Float("Received Qty", readonly=True)
    reference = fields.Char(
        "Jobshop Link",
        help="The Jobshop work order of the link (WORK/LOT.SPLIT-SUB "
        "seq piece), kept when the work order is not in the ERP.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('purchase_line')
        cls._order = [('purchase_line', 'ASC'), ('id', 'ASC')]

    @classmethod
    def default_received_quantity(cls):
        return 0

    def get_rec_name(self, name):
        if self.production:
            text = self.production.rec_name
        else:
            text = self.reference or ''
        if self.operation is not None:
            text += ' seq %s' % self.operation
        if self.piece is not None:
            text += ' piece %s' % self.piece
        return text

