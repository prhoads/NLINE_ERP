# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The Jobshop receiver fields on Tryton's supplier shipments (receipts) and
supplier return shipments (returns)"""
from decimal import Decimal

from trytond.model import fields
from trytond.modules.product import price_digits
from trytond.pool import PoolMeta

RECEIVER_STATUS = [
    ('unapproved', "Unapproved"),
    ('approved', "Approved"),
    ('cancelled', "Cancelled"),
    ]


class ReceiverMixin:
    __slots__ = ()
    receiver_status = fields.Selection(
        RECEIVER_STATUS, "Receiver Status", required=True,
        help="Unapproved: received, not yet matched to the supplier's "
        "invoice.")
    purchase = fields.Many2One(
        'purchase.purchase', "Order ID", ondelete='SET NULL', readonly=True)
    supplier_invoice = fields.Char("Invoice ID")
    invoiced_date = fields.Date("Invoiced Date")
    payment_due_date = fields.Date("Payment Due Date")
    receiver_exported = fields.Boolean("Exported")
    receiver_exported_date = fields.Date("Exported Date")
    specifications = fields.Text("Specifications")
    receiver_user = fields.Char("Received By (user)", readonly=True)

    @classmethod
    def default_receiver_status(cls):
        return 'approved'

    @classmethod
    def default_receiver_exported(cls):
        return False


class ShipmentIn(ReceiverMixin, metaclass=PoolMeta):
    __name__ = 'stock.shipment.in'


class ShipmentInReturn(ReceiverMixin, metaclass=PoolMeta):
    __name__ = 'stock.shipment.in.return'


class Move(metaclass=PoolMeta):
    __name__ = 'stock.move'

    # A receiver line: the line's unit price is the quoted price less the
    # discount plus the fixed charge spread on the quantity (Jobshop's
    # actual cost of the receipt)
    receiver_unit_price = fields.Numeric(
        "Receiver Unit Price", digits=price_digits)
    receiver_discount = fields.Numeric("Receiver Disc %", digits=(16, 4))
    receiver_fixed_charge = fields.Numeric(
        "Receiver Fixed Charge", digits=(16, 2))
    returned_move = fields.Many2One(
        'stock.move', "Returned Receipt", ondelete='SET NULL', readonly=True,
        help="The receipt line this return gives back.")

    def receiver_cost(self):
        "The unit cost of the receiver line"
        price = self.receiver_unit_price
        if price is None:
            price = self.unit_price or Decimal(0)
        discount = self.receiver_discount or Decimal(0)
        fixed = self.receiver_fixed_charge or Decimal(0)
        cost = price * (1 - discount / 100)
        if self.quantity:
            cost += fixed / Decimal(str(self.quantity))
        return cost.quantize(Decimal(1) / 10 ** price_digits[1])

    def receiver_amount(self):
        "The received amount of the line (Jobshop's Received Amount)"
        price = self.receiver_unit_price
        if price is None:
            price = self.unit_price or Decimal(0)
        discount = self.receiver_discount or Decimal(0)
        fixed = self.receiver_fixed_charge or Decimal(0)
        amount = (Decimal(str(self.quantity or 0)) * price
            * (1 - discount / 100) + fixed)
        return amount.quantize(Decimal('0.01'))

    @classmethod
    def copy(cls, moves, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('returned_move', None)
        return super().copy(moves, default=default)
