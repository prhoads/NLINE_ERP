# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The Jobshop customer's fields Tryton's party has not (Customer window:
Customers, Account and Details tabs) and the ship to addresses' overrides

The fields a supplier has too (FOB point, ship via, tax group, freight
terms...) are prefixed customer_ so the purchasing area can add its own."""
from decimal import Decimal

from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.transaction import Transaction

FREIGHT_TERMS = [
    (None, ""),
    ('billed', "Billed"),
    ('collect', "Collect"),
    ('prepaid', "Prepaid"),
    ]
CREDIT_STATUS = [
    ('approved', "Approved"),
    ('hold_orders', "Hold Orders"),
    ('hold_shipments', "Hold Shipments"),
    ]
OPEN_STATES = ['draft', 'quotation', 'confirmed', 'processing']
# The main (sold to) address fields shown on the Customers tab
SOLD_TO = ['party_name', 'street', 'city', 'postal_code', 'subdivision',
    'country']


class Party(metaclass=PoolMeta):
    __name__ = 'party.party'

    # Customers tab: the main address (Tryton keeps it in the addresses)
    sold_to_name = fields.Function(fields.Char("Sold To Name"),
        'get_sold_to', setter='set_sold_to')
    sold_to_street = fields.Function(fields.Text("Address"),
        'get_sold_to', setter='set_sold_to')
    sold_to_city = fields.Function(fields.Char("City"),
        'get_sold_to', setter='set_sold_to')
    sold_to_postal_code = fields.Function(fields.Char("Postal Code"),
        'get_sold_to', setter='set_sold_to')
    sold_to_subdivision = fields.Function(fields.Many2One(
            'country.subdivision', "State"),
        'get_sold_to', setter='set_sold_to')
    sold_to_country = fields.Function(fields.Many2One(
            'country.country', "Country"),
        'get_sold_to', setter='set_sold_to')
    contact_title = fields.Char("Title")

    # Account tab
    customer_open_date = fields.Date("Account Opened")
    customer_last_order_date = fields.Function(fields.Date("Last Order"),
        'get_customer_orders')
    customer_open_orders = fields.Function(fields.Numeric(
            "Total Open Orders", digits=(16, 2)), 'get_customer_orders')
    customer_open_order_count = fields.Function(fields.Integer(
            "Open Orders"), 'get_customer_orders')
    our_supplier_id = fields.Char("Supplier ID (Ours)",
        help="Our supplier number at this customer.")
    customer_freight_terms = fields.Selection(FREIGHT_TERMS, "Freight Terms")
    credit_status = fields.Selection(CREDIT_STATUS, "Credit Status")
    credit_limit = fields.Numeric("Order Limit", digits=(16, 2),
        help="Saving an order over this amount asks to accept it "
        "(0: no limit).")

    # Details tab
    sales_rep = fields.Many2One('nline.sales_rep', "Sales Rep")
    territory = fields.Many2One('nline.territory', "Territory")
    customer_fob_point = fields.Many2One('nline.fob_point', "FOB Point")
    customer_ship_via = fields.Many2One('nline.ship_via', "Ship Via")
    carrier = fields.Many2One('nline.carrier', "Carrier")
    customer_sic_code = fields.Many2One('nline.sic_code', "SIC Code")
    discount_class = fields.Many2One('nline.discount_class',
        "Discount Class")
    customer_tax_id_number = fields.Char("Tax ID Number")
    customer_tax_group = fields.Many2One('nline.sales_tax_group',
        "Tax Group")
    customer_tax_exempt = fields.Boolean("Tax Exempt")
    quote_instructions = fields.Text("Quote Instructions")
    sales_instructions = fields.Text("Sales Order Instructions")
    quote_footer = fields.Text("Quote Footer")
    sales_order_footer = fields.Text("Sales Order Footer")
    shipper_footer = fields.Text("Shipper Footer")
    invoice_footer = fields.Text("Invoice Footer")
    customer_specs = fields.Text("Specifications")

    # Prices tab
    sale_prices = fields.One2Many('nline.sale_price', 'party', "Prices")

    @staticmethod
    def default_credit_status():
        return 'approved'

    @staticmethod
    def default_credit_limit():
        return Decimal(0)

    @staticmethod
    def default_customer_tax_exempt():
        return False

    def _sold_to_address(self):
        for address in self.addresses:
            if address.active is not False:
                return address

    @classmethod
    def get_sold_to(cls, parties, names):
        result = {n: {} for n in names}
        for party in parties:
            address = party._sold_to_address()
            for name in names:
                value = getattr(address, name[len('sold_to_'):], None) \
                    if address else None
                if hasattr(value, 'id'):
                    value = value.id
                result[name][party.id] = value
        return result

    @classmethod
    def set_sold_to(cls, parties, name, value):
        Address = Pool().get('party.address')
        field = name[len('sold_to_'):]
        for party in parties:
            address = party._sold_to_address()
            if address:
                Address.write([address], {field: value})
            elif value:
                Address.create([{'party': party.id, field: value}])

    @classmethod
    def get_customer_orders(cls, parties, names):
        pool = Pool()
        Sale = pool.get('sale.sale')
        result = {n: {p.id: None for p in parties} for n in names}
        for name in ['customer_open_orders', 'customer_open_order_count']:
            if name in result:
                for party in parties:
                    result[name][party.id] = (
                        0 if name.endswith('count') else Decimal(0))
        ids = [p.id for p in parties]
        for sale in Sale.search([('party', 'in', ids)],
                order=[('sale_date', 'ASC')]):
            pid = sale.party.id
            if 'customer_last_order_date' in result and sale.sale_date:
                result['customer_last_order_date'][pid] = sale.sale_date
            if sale.state in OPEN_STATES:
                if 'customer_open_orders' in result:
                    result['customer_open_orders'][pid] += (
                        sale.total_amount or Decimal(0))
                if 'customer_open_order_count' in result:
                    result['customer_open_order_count'][pid] += 1
        return result

    @staticmethod
    def default_customer_open_date():
        return Pool().get('ir.date').today()

    def sale_price(self, product, quantity, date=None):
        """Jobshop's unit price of the part for this customer: the
        customer's price break table, then the discount class's table, then
        the part's price less the class's discount.
        Return (unit price, trade discount %, customer part ID, source)"""
        pool = Pool()
        Date = pool.get('ir.date')
        if date is None:
            date = Date.today()
        for price in self.sale_prices:
            if price.product == product and price.valid(date):
                unit_price = None if price.use_part_price \
                    else price.unit_price(quantity)
                if unit_price is not None:
                    return (unit_price, Decimal(0), price.customer_part,
                        'customer')
                break
        discount = Decimal(0)
        customer_part = None
        if self.discount_class:
            discount = self.discount_class.discount_percent or Decimal(0)
            for price in self.discount_class.prices:
                if price.product == product and price.valid(date):
                    unit_price = None if price.use_part_price \
                        else price.unit_price(quantity)
                    if unit_price is not None:
                        return (unit_price, Decimal(0), None,
                            'discount_class')
                    break
        Product = pool.get('product.product')
        with Transaction().set_context(customer=self.id, sale_date=date):
            list_price = Product.get_sale_price(
                [product], quantity or 0)[product.id] or Decimal(0)
        return list_price, discount, customer_part, (
            'discount_class' if discount else 'part')


class Address(metaclass=PoolMeta):
    __name__ = 'party.address'

    ship_to_default = fields.Boolean("Default Ship To",
        help="The ship to address of the customer's new orders.")
    ship_to_contact = fields.Char("Contact Name")
    ship_to_title = fields.Char("Contact Title")
    ship_to_phone = fields.Char("Contact Phone")
    ship_to_fax = fields.Char("Contact Fax")
    ship_to_email = fields.Char("Contact E-Mail")
    ship_to_tax_exempt = fields.Boolean("Tax Exempt")
    ship_to_tax_group = fields.Many2One('nline.sales_tax_group', "Tax Group")
    ship_to_tax_id_number = fields.Char("Tax ID Number")
    ship_to_sales_rep = fields.Many2One('nline.sales_rep', "Sales Rep")
    ship_to_territory = fields.Many2One('nline.territory', "Territory")
    ship_to_fob_point = fields.Many2One('nline.fob_point', "FOB Point")
    ship_to_ship_via = fields.Many2One('nline.ship_via', "Ship Via")
    ship_to_carrier = fields.Many2One('nline.carrier', "Carrier")
    ship_to_discount_class = fields.Many2One('nline.discount_class',
        "Discount Class")
