# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop's inventory transactions on Tryton's stock moves

An adjustment is a move from (Adjust In) or to (Adjust Out) the lost and found
location, a transfer a move between two storage locations, a physical count a
stock inventory; the move keeps Jobshop's reason code and adjustment account.
"""
from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval

# Jobshop's inventory transaction class (INV_TRAN.CLASS) of a move
ADJUSTMENTS = [
    (None, ""),
    ('in', "Adjust In"),
    ('out', "Adjust Out"),
    ('transfer', "Transfer"),
    ]


class Move(metaclass=PoolMeta):
    __name__ = 'stock.move'

    reason_code = fields.Many2One(
        'nline.reason_code', "Reason Code", ondelete='RESTRICT',
        states={
            'readonly': Eval('state').in_(['done', 'cancelled']),
            })
    adjustment = fields.Selection(
        ADJUSTMENTS, "Adjustment", readonly=True,
        help="The Jobshop adjustment that made the move.")
    adjustment_account = fields.Many2One(
        'account.account', "Adj Account", ondelete='RESTRICT',
        states={
            'invisible': ~Eval('adjustment'),
            'readonly': Eval('state').in_(['done', 'cancelled']),
            },
        help="Overrides the account of the part for this adjustment.")

    @classmethod
    def do(cls, moves):
        super().do(moves)
        cls._ensure_part_locations(moves)

    @classmethod
    def _ensure_part_locations(cls, moves):
        """Jobshop adds a part location when a part is received into a
        location"""
        pool = Pool()
        PartLocation = pool.get('nline.js.part_location')
        pairs = set()
        for move in moves:
            if (move.state == 'done' and move.product
                    and move.to_location.type == 'storage'):
                pairs.add((move.product.template.id, move.to_location.id))
        PartLocation.ensure(pairs)

    def get_js_class(self):
        "The Jobshop transaction class of the move"
        from_type = self.from_location.type
        to_type = self.to_location.type
        if self.adjustment == 'transfer' or (
                from_type == 'storage' and to_type == 'storage'):
            return 'TRANSFER'
        if 'lost_found' in {from_type, to_type}:
            return 'ADJUSTMENT'
        if 'supplier' in {from_type, to_type}:
            return 'PO_RECEIPT'
        if 'customer' in {from_type, to_type}:
            return 'SHIPMENT'
        if getattr(self, 'production_output', None):
            return 'WO_RECEIPT'
        if getattr(self, 'production_input', None):
            return 'ISSUE'
        if 'production' in {from_type, to_type}:
            return 'ISSUE'
        return 'TRANSFER'


class ShipmentIn(metaclass=PoolMeta):
    __name__ = 'stock.shipment.in'

    def _get_inventory_move(self, incoming_move):
        """Jobshop receives a part into its primary location (when it is in
        the warehouse's storage)"""
        pool = Pool()
        Location = pool.get('stock.location')
        move = super()._get_inventory_move(incoming_move)
        if not move or not move.product:
            return move
        primary = move.product.template.primary_location
        if primary and self.warehouse_storage and primary != move.to_location:
            if Location.search([
                        ('id', '=', primary.id),
                        ('parent', 'child_of', [self.warehouse_storage.id]),
                        ], limit=1):
                move.to_location = primary
        return move
