# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The Jobshop sales order's fields on Tryton's sale (Sales Order window:
Details, Specs, Charges tabs, Jobshop's statuses), its lines' overrides and
the shippers' (customer shipments') fields"""
from decimal import Decimal

from trytond.model import fields
from trytond.pool import Pool, PoolMeta

from .party import FREIGHT_TERMS

# Jobshop's sales order statuses, from Tryton's states and two flags
JS_STATUS = [
    ('unreleased', "Unreleased"),
    ('firm', "Firm"),
    ('released', "Released"),
    ('hold', "Hold"),
    ('closed', "Closed"),
    ('cancelled', "Cancelled"),
    ]
JS_LINE_STATUS = [
    ('open', "Open"),
    ('closed', "Closed"),
    ('cancelled', "Cancelled"),
    ]


class Sale(metaclass=PoolMeta):
    __name__ = 'sale.sale'

    js_status = fields.Function(fields.Selection(JS_STATUS, "Status"),
        'get_js_status', searcher='search_js_status')
    js_hold = fields.Boolean("Hold", readonly=True,
        help="Jobshop's Hold status: the order is not shipped.")
    js_closed = fields.Boolean("Closed", readonly=True,
        help="Closed by hand before it was shipped to completion.")
    js_quote = fields.Char("Quote ID",
        help="The quote the order was made from.")
    promise_date = fields.Date("Promise Date")
    sales_rep = fields.Many2One('nline.sales_rep', "Sales Rep")
    territory = fields.Many2One('nline.territory', "Territory")
    fob_point = fields.Many2One('nline.fob_point', "FOB Point")
    ship_via = fields.Many2One('nline.ship_via', "Ship Via")
    js_carrier = fields.Many2One('nline.carrier', "Carrier")
    freight_terms = fields.Selection(FREIGHT_TERMS, "Freight Terms")
    tax_group = fields.Many2One('nline.sales_tax_group', "Tax Group")
    discount_class = fields.Many2One('nline.discount_class',
        "Discount Class")
    js_specs = fields.Text("Specifications")
    charges = fields.One2Many('nline.sale_charge', 'sale', "Charges")
    js_last_shipped_date = fields.Function(fields.Date("Last Shipped"),
        'get_js_shipped')
    js_shipped_amount = fields.Function(fields.Numeric("Shipped Amount",
            digits=(16, 2)), 'get_js_shipped')
    js_charges_amount = fields.Function(fields.Numeric("Charges",
            digits=(16, 2)), 'get_js_charges_amount')

    @fields.depends('party', 'shipment_address')
    def on_change_party(self):
        super().on_change_party()
        if self.party:
            self.set_jobshop_defaults()

    def set_jobshop_defaults(self):
        "The order's Details from the customer and its ship to address"
        party = self.party
        address = getattr(self, 'shipment_address', None)
        default_ship_to = [a for a in party.addresses if a.ship_to_default]
        if default_ship_to and (not address or address.party != party):
            address = self.shipment_address = default_ship_to[0]

        def pick(name, party_name):
            value = getattr(address, 'ship_to_' + name, None) \
                if address else None
            return value or getattr(party, party_name)
        self.sales_rep = pick('sales_rep', 'sales_rep')
        self.territory = pick('territory', 'territory')
        self.fob_point = pick('fob_point', 'customer_fob_point')
        self.ship_via = pick('ship_via', 'customer_ship_via')
        self.js_carrier = pick('carrier', 'carrier')
        self.discount_class = pick('discount_class', 'discount_class')
        self.tax_group = pick('tax_group', 'customer_tax_group')
        self.freight_terms = party.customer_freight_terms
        if not getattr(self, 'js_specs', None) and party.sales_instructions:
            self.js_specs = party.sales_instructions

    @property
    def tax_exempt(self):
        address = self.shipment_address
        return bool(self.party.customer_tax_exempt
            or (address and address.ship_to_tax_exempt))

    def get_js_status(self, name):
        if self.state == 'cancelled':
            return 'cancelled'
        if self.js_hold:
            return 'hold'
        if self.state == 'done' or self.js_closed:
            return 'closed'
        if self.state in {'confirmed', 'processing'}:
            return 'released'
        if self.state == 'quotation':
            return 'firm'
        return 'unreleased'

    @classmethod
    def search_js_status(cls, name, clause):
        _, operator, value = clause[:3]
        values = value if isinstance(value, (list, tuple)) else [value]
        domains = {
            'cancelled': [('state', '=', 'cancelled')],
            'hold': [('state', '!=', 'cancelled'), ('js_hold', '=', True)],
            'closed': [('state', '!=', 'cancelled'), ('js_hold', '=', False),
                ['OR', ('state', '=', 'done'), ('js_closed', '=', True)]],
            'released': [('js_hold', '=', False), ('js_closed', '=', False),
                ('state', 'in', ['confirmed', 'processing'])],
            'firm': [('js_hold', '=', False), ('js_closed', '=', False),
                ('state', '=', 'quotation')],
            'unreleased': [('js_hold', '=', False), ('js_closed', '=', False),
                ('state', '=', 'draft')],
            }
        domain = ['OR'] + [domains[v] for v in values if v in domains]
        if operator in {'!=', 'not in'}:
            ids = [s.id for s in cls.search(domain)]
            return [('id', 'not in', ids)]
        return domain

    @classmethod
    def get_js_shipped(cls, sales, names):
        result = {n: {} for n in names}
        for sale in sales:
            last, amount = None, Decimal(0)
            for line in sale.lines:
                if line.type != 'line':
                    continue
                shipped = line.js_shipped_quantity or 0
                amount += Decimal(str(shipped)) * (line.unit_price
                    or Decimal(0))
                if line.js_last_shipped_date and (not last
                        or line.js_last_shipped_date > last):
                    last = line.js_last_shipped_date
            if 'js_last_shipped_date' in names:
                result['js_last_shipped_date'][sale.id] = last
            if 'js_shipped_amount' in names:
                result['js_shipped_amount'][sale.id] = (
                    sale.currency.round(amount) if sale.currency else amount)
        return result

    def get_js_charges_amount(self, name):
        return sum((c.amount or Decimal(0) for c in self.charges),
            Decimal(0))

    @classmethod
    def copy(cls, sales, default=None):
        default = default.copy() if default is not None else {}
        for name in ['js_hold', 'js_closed']:
            default.setdefault(name, False)
        return super().copy(sales, default=default)

    def create_invoice(self):
        "The order's pending service charges go on its next invoice"
        invoice = super().create_invoice()
        charges = [c for c in self.charges if c.pending]
        if invoice is not None and charges:
            invoice.lines = list(invoice.lines) + [
                c.get_invoice_line_values(invoice) for c in charges]
        return invoice


class SaleLine(metaclass=PoolMeta):
    __name__ = 'sale.line'

    customer_part = fields.Char("Customer Part ID")
    customer_po_line = fields.Char("Customer PO Line #")
    gross_unit_price = fields.Numeric("List Unit Price", digits=(16, 4),
        help="The unit price before the trade discount.")
    trade_discount = fields.Numeric("Trade Disc %", digits=(10, 6))
    promise_date = fields.Date("Promise Date")
    product_code = fields.Many2One('nline.product_code', "Product Code")
    commodity_code = fields.Many2One('nline.commodity_code',
        "Commodity Code")
    line_tax_group = fields.Many2One('nline.sales_tax_group', "Tax Group")
    js_line_specs = fields.Text("Specifications")
    js_line_closed = fields.Boolean("Closed by hand", readonly=True)
    js_return_of = fields.Many2One('sale.line', "Return Of", readonly=True,
        ondelete='SET NULL',
        help="The shipped line this return line takes back.")
    js_returns = fields.One2Many('sale.line', 'js_return_of', "Returns",
        readonly=True)
    js_line_status = fields.Function(fields.Selection(JS_LINE_STATUS,
            "Line Status"), 'get_js_line_status')
    js_shipped_quantity = fields.Function(fields.Float("Shipped Qty"),
        'get_js_shipped')
    js_last_shipped_date = fields.Function(fields.Date("Last Shipped"),
        'get_js_shipped')

    @staticmethod
    def default_trade_discount():
        return Decimal(0)

    @classmethod
    def get_js_shipped(cls, lines, names):
        pool = Pool()
        Uom = pool.get('product.uom')
        result = {n: {} for n in names}
        for line in lines:
            quantity, last = 0.0, None
            # The returns made on the order take back what it shipped
            moves = list(line.moves) + [m for r in line.js_returns
                for m in r.moves]
            for move in moves:
                if move.state != 'done':
                    continue
                qty = Uom.compute_qty(move.unit, move.quantity, line.unit) \
                    if line.unit else move.quantity
                # A return (into the warehouse) takes back what was shipped
                if move.to_location.type == 'customer':
                    quantity += qty
                else:
                    quantity -= qty
                if move.effective_date and (not last
                        or move.effective_date > last):
                    last = move.effective_date
            if 'js_shipped_quantity' in names:
                result['js_shipped_quantity'][line.id] = quantity
            if 'js_last_shipped_date' in names:
                result['js_last_shipped_date'][line.id] = last
        return result

    def get_js_line_status(self, name):
        if self.sale.state == 'cancelled':
            return 'cancelled'
        if self.js_line_closed or self.sale.state == 'done':
            return 'closed'
        if (self.type == 'line' and self.quantity
                and abs(self.js_shipped_quantity) >= abs(self.quantity)):
            return 'closed'
        if self.moves and all(m.state == 'cancelled' for m in self.moves):
            return 'cancelled'
        return 'open'

    @classmethod
    def copy(cls, lines, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('js_line_closed', False)
        default.setdefault('js_return_of', None)
        default.setdefault('js_returns', None)
        return super().copy(lines, default=default)


class InvoiceLine(metaclass=PoolMeta):
    __name__ = 'account.invoice.line'

    @classmethod
    def _get_origin(cls):
        return super()._get_origin() + ['nline.sale_charge']


class ShipmentOut(metaclass=PoolMeta):
    __name__ = 'stock.shipment.out'

    js_carrier = fields.Many2One('nline.carrier', "Carrier")
    js_tracking_number = fields.Char("Shipment Tracking Number")
    fob_point = fields.Many2One('nline.fob_point', "FOB Point")
    ship_via = fields.Many2One('nline.ship_via', "Ship Via")
    freight_terms = fields.Selection(FREIGHT_TERMS, "Freight Terms")
    js_specs = fields.Text("Specifications",
        help="Printed on the packing list.")
    charges = fields.One2Many('nline.sale_charge', 'shipment', "Charges",
        readonly=True)
