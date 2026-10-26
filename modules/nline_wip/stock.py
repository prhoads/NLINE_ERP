# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval


class Location(metaclass=PoolMeta):
    __name__ = 'stock.location'
    production_wip_location = fields.Many2One(
        'stock.location', "Production WIP",
        states={
            'invisible': Eval('type') != 'warehouse',
            },
        domain=[
            ('type', '=', 'production'),
            ('parent', 'child_of', [Eval('id', -1)]),
            ],
        help="Where the goods made by a production for another production "
        "(legs) pass without being received into stock.\n"
        "They stay in work in progress at their production cost.")

    @classmethod
    def _parent_domain(cls):
        domain = super()._parent_domain()
        # The production WIP location is inside its warehouse
        domain['production'] = domain['production'] + ['warehouse']
        return domain


class Move(metaclass=PoolMeta):
    __name__ = 'stock.move'
    wip_source = fields.Many2One(
        'stock.move', "WIP Source", ondelete='RESTRICT',
        domain=[
            ('production_output', '!=', None),
            ('product', '=', Eval('product', -1)),
            ],
        states={
            'invisible': ~Eval('wip_source'),
            'readonly': Eval('state') != 'draft',
            },
        help="The output of the production (leg) that supplies this input "
        "at its production cost.")
    wip_targets = fields.One2Many(
        'stock.move', 'wip_source', "WIP Targets", readonly=True,
        states={
            'invisible': ~Eval('wip_targets'),
            })

    @fields.depends('from_location', 'to_location')
    def on_change_with_unit_price_required(self, name=None):
        from_type = self.from_location.type if self.from_location else None
        to_type = self.to_location.type if self.to_location else None
        # The cost of a leg is set when it is done
        if from_type == 'production' and to_type == 'production':
            return False
        return super().on_change_with_unit_price_required(name=name)

    @classmethod
    def do(cls, moves):
        # The inputs supplied by a leg are done when the leg is done
        super().do([m for m in moves
                if not m.wip_source or m.wip_source.state == 'done'])

    def _get_account_stock_move_lines(self, type_):
        lines = super()._get_account_stock_move_lines(type_)
        if type_ in {'out_production', 'in_production'}:
            account = self.get_production_wip_account()
            if account:
                for line in lines:
                    line.account = account
        return lines

    def get_production_wip_account(self):
        pool = Pool()
        Configuration = pool.get('account.configuration')
        return Configuration(1).get_multivalue(
            'production_wip_account', company=self.company.id)

    def set_price_from_wip_source(self):
        "Set the unit price from the cost of the WIP source"
        pool = Pool()
        Uom = pool.get('product.uom')
        source = self.wip_source
        if source and source.unit_price is not None:
            unit_price = Uom.compute_price(
                source.unit, source.unit_price, self.unit)
            if (self.unit_price != unit_price
                    or self.currency != source.currency):
                self.unit_price = unit_price
                self.currency = source.currency
                return True
        return False

    @classmethod
    def copy(cls, moves, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('wip_source', None)
        default.setdefault('wip_targets', None)
        return super().copy(moves, default=default)
