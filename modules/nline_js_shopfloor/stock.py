# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Material returns and work order returns on Tryton's productions.

- A material returned from a work order to stock (a negative issue in
  Jobshop) is an output of the production of the material's product:
  Tryton prices it at the cost of the issued material and takes it off the
  production's cost.
- Finished parts returned from stock to the shop floor (Work Order Receipts,
  For Return) are an input of the production of its own part: their value
  goes back into work in process, and the cost of the parts received is the
  whole production cost again (set_cost below)."""
from decimal import Decimal

from trytond.model import fields
from trytond.modules.product import round_price
from trytond.pool import Pool, PoolMeta


class Move(metaclass=PoolMeta):
    __name__ = 'stock.move'
    material_return = fields.Boolean("Material Return", readonly=True,
        help="A material returned from a work order to stock.")
    receipt_return = fields.Boolean("Receipt Return", readonly=True,
        help="Finished parts returned from stock to their work order.")

    @classmethod
    def default_material_return(cls):
        return False

    @classmethod
    def default_receipt_return(cls):
        return False

    @classmethod
    def copy(cls, moves, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('material_return', False)
        default.setdefault('receipt_return', False)
        return super().copy(moves, default=default)


class Production(metaclass=PoolMeta):
    __name__ = 'production'

    @classmethod
    def set_cost(cls, productions):
        pool = Pool()
        Uom = pool.get('product.uom')
        Move = pool.get('stock.move')
        super().set_cost(productions)
        # Tryton prices an output of a product that is also an input at the
        # input's cost; the parts returned to the shop floor are not a
        # material: their output takes the rest of the production cost
        to_save = []
        for production in productions:
            if not any(m.receipt_return and m.state != 'cancelled'
                    for m in production.inputs):
                continue
            outputs = [o for o in production.outputs
                if o.state != 'cancelled'
                and o.to_location.type != 'lost_found']
            main = [o for o in outputs
                if o.product == production.product
                and not o.material_return]
            if not main:
                continue
            others = sum((Decimal(str(o.quantity)) * (o.unit_price or 0)
                    for o in outputs if o not in main), Decimal(0))
            cost = max(production.cost - others, Decimal(0))
            quantity = sum(Uom.compute_qty(o.unit, o.quantity,
                    production.product.default_uom, round=False)
                for o in main)
            if not quantity:
                continue
            unit_cost = cost / Decimal(str(quantity))
            for output in main:
                unit_price = round_price(Uom.compute_price(
                        production.product.default_uom, unit_cost,
                        output.unit))
                if output.unit_price != unit_price:
                    output.unit_price = unit_price
                    output.currency = production.company.currency
                    to_save.append(output)
        Move.save(to_save)
