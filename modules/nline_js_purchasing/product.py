# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Supplier part and service prices (the Part Prices and Service Prices tabs
of the Jobshop Suppliers window) on Tryton's product suppliers"""
import datetime as dt

from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction

PRICE_TYPES = [
    ('break', "Break Table"),
    ('upto', "Up-to-Qty Table"),
    ]


class ProductSupplier(metaclass=PoolMeta):
    __name__ = 'purchase.product_supplier'

    mfg_name = fields.Char("Mfg Name")
    mfg_part_id = fields.Char("Mfg Part ID")
    price_type = fields.Selection(PRICE_TYPES, "Type", required=True,
        help="Break Table: a price from each quantity on.\n"
        "Up-to-Qty Table: a price up to each quantity, the last one for "
        "any quantity above.")
    as_of_date = fields.Date(
        "As Of", help="The prices apply from this date.")
    expiration_date = fields.Date(
        "Expires", help="The prices apply until this date.")
    quote_date = fields.Date("Quoted")
    minimum_quantity = fields.Float("Minimum Order Qty")
    multiple_quantity = fields.Float("Order in Multiples Of")
    service_part = fields.Many2One(
        'product.product', "Part ID", ondelete='SET NULL',
        context={
            'company': Eval('company', -1),
            },
        states={
            'invisible': Eval('template_type') != 'service',
            },
        depends={'company'},
        help="The part the service is done on.")
    template_type = fields.Function(
        fields.Char("Product Type"), 'on_change_with_template_type')

    @classmethod
    def default_price_type(cls):
        return 'break'

    @fields.depends('template', '_parent_template.type')
    def on_change_with_template_type(self, name=None):
        return self.template.type if self.template else None

    def in_date(self, date=None):
        "Whether the prices apply at the date (today by default)"
        if date is None:
            date = Transaction().context.get('purchase_date')
            if isinstance(date, str):
                date = dt.date.fromisoformat(date)
            if not date:
                date = Pool().get('ir.date').today()
        if self.as_of_date and date < self.as_of_date:
            return False
        if self.expiration_date and date > self.expiration_date:
            return False
        return True

    def match(self, pattern, match_none=False):
        # Jobshop: a quote before its As Of or after it Expires is not used
        if not self.in_date():
            return False
        return super().match(pattern, match_none=match_none)

    def jobshop_price(self, quantity):
        "The unit price of the quantity as Jobshop's break / up-to tables"
        prices = sorted(self.prices, key=lambda p: p.quantity)
        if not prices:
            return None
        if self.price_type == 'upto':
            # The smallest "up to" quantity the order fits, the open row
            # (no quantity) for any quantity above
            for price in prices:
                if price.quantity and abs(quantity) <= price.quantity:
                    return price.unit_price
            open_rows = [p for p in prices if not p.quantity]
            return (open_rows or prices)[-1].unit_price
        result = prices[0].unit_price
        for price in prices:
            if abs(quantity) >= price.quantity:
                result = price.unit_price
        return result


class ProductSupplierPrice(metaclass=PoolMeta):
    __name__ = 'purchase.product_supplier.price'

    def match(self, quantity, unit, pattern):
        if (self.product_supplier
                and self.product_supplier.price_type == 'upto'):
            # Up to the row's quantity; the empty row matches any quantity.
            # The rows are saved from the largest quantity down (the empty
            # row first) so the last match is the smallest that fits
            if not self.quantity:
                return True
            pool = Pool()
            Uom = pool.get('product.uom')
            test_quantity = Uom.compute_qty(
                self.product_supplier.unit, self.quantity, unit)
            return abs(quantity) <= test_quantity
        return super().match(quantity, unit, pattern)
