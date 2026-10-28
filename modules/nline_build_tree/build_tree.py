# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.model import fields
from trytond.modules.company import CompanyReport
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction


class Production(metaclass=PoolMeta):
    __name__ = 'production'

    shortage = fields.Function(fields.Boolean(
            "Shortage",
            help="A material card of the order or of its legs is short."),
        'get_shortage')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__rpc__.update({
                'get_build_tree': RPC(instantiate=0),
                })

    def get_shortage(self, name):
        return any(c.short for c in self.material_cards) or any(
            l.shortage for l in self.legs if l.state != 'cancelled')

    @classmethod
    def get_build_tree(cls, productions):
        "Return the build tree of the productions as nested dictionaries"
        return [p._build_tree_node() for p in productions]

    def _build_tree_node(self):
        bom = self.bom
        origin = self.origin
        node = {
            'id': self.id,
            'number': self.number,
            'job': getattr(self, 'job', False),
            'leg_index': self.leg_index,
            'product': self.product.rec_name if self.product else None,
            'product_id': self.product.id if self.product else None,
            'template_id': (
                self.product.template.id if self.product else None),
            'revision': bom.revision if bom else None,
            'bom_id': bom.id if bom else None,
            # The sales order of the order made for a sale line
            'sale_id': (origin.sale.id
                if getattr(origin, '__name__', None) == 'sale.line'
                else None),
            'quantity': self.quantity,
            'unit': self.unit.symbol if self.unit else None,
            'state': self.state,
            'planned_start_date': self.planned_start_date,
            'planned_date': self.planned_date,
            'cost': self.cost,
            'shortage': self.shortage,
            'origin': self.origin.rec_name if self.origin else None,
            'works': [w._build_tree_node() for w in self.works],
            'cards': [c._build_tree_node() for c in self.material_cards],
            }
        if not node['works'] and getattr(self, 'routing', None):
            # Before release the operations come from the routing
            node['works'] = [
                self._build_tree_step_node(s) for s in self.routing.steps]
        return node

    def _build_tree_step_node(self, step):
        "Return the node of a routing step not released as a work yet"
        duration = None
        if hasattr(step, 'compute_planned_duration'):
            duration = step.compute_planned_duration(self)
        supplier = getattr(step, 'supplier', None)
        return {
            'id': None,
            'sequence': step.sequence,
            'operation': step.operation.rec_name,
            'work_center': None,
            'work_center_id': None,
            'purchase_id': None,
            'state': 'request',
            'planned_duration': (
                duration.total_seconds() / 3600 if duration else None),
            'cost': None,
            'outside': bool(supplier),
            'supplier': supplier.rec_name if supplier else None,
            'purchase': None,
            'expected_date': None,
            }

    def get_traveler_lines(self, depth=0):
        """Yield (depth, kind, record) for the order, its operations and
        cards in Jobshop order, each leg under the card it supplies"""
        yield depth, 'production', self
        cards = list(self.material_cards)
        works = sorted(self.works, key=lambda w: (w.sequence or 0, w.id))
        for work in works:
            yield depth, 'work', work
            sequence = work.sequence or 0
            for card in list(cards):
                if (card.operation or 0) <= sequence:
                    cards.remove(card)
                    yield from card.get_traveler_lines(depth)
        for card in cards:
            yield from card.get_traveler_lines(depth)


class Work(metaclass=PoolMeta):
    __name__ = 'production.work'

    def _build_tree_node(self):
        node = {
            'id': self.id,
            'sequence': self.sequence,
            'operation': self.operation.rec_name,
            'work_center': (
                self.work_center.rec_name if self.work_center else None),
            'work_center_id': (
                self.work_center.id if self.work_center else None),
            'purchase_id': None,
            'state': self.state,
            'planned_duration': (
                self.planned_duration.total_seconds() / 3600
                if getattr(self, 'planned_duration', None) else None),
            'cost': self.cost,
            'outside': getattr(self, 'outside', False),
            'supplier': None,
            'purchase': None,
            'expected_date': None,
            }
        if node['outside']:
            node['supplier'] = (
                self.supplier.rec_name if self.supplier else None)
            node['purchase'] = (
                self.purchase.rec_name if self.purchase else None)
            node['purchase_id'] = self.purchase.id if self.purchase else None
            node['expected_date'] = self.expected_date
        return node


class MaterialCard(metaclass=PoolMeta):
    __name__ = 'production.material_card'

    short = fields.Function(fields.Boolean(
            "Short",
            help="The material is supplied from stock and is not available."),
        'get_short')

    @classmethod
    def get_short(cls, cards, name):
        pool = Pool()
        Product = pool.get('product.product')
        Uom = pool.get('product.uom')
        result = {c.id: False for c in cards}
        to_check = [c for c in cards
            if c.supply in {'stock', 'job'}
            and c.move.state in {'draft', 'staging'}
            and c.production.state in {'request', 'draft', 'waiting'}]
        by_warehouse = {}
        for card in to_check:
            by_warehouse.setdefault(card.production.warehouse, []).append(
                card)
        for warehouse, wcards in by_warehouse.items():
            products = list({c.product for c in wcards})
            with Transaction().set_context(
                    locations=[warehouse.id], with_childs=True):
                quantities = {p: p.quantity for p in Product.browse(products)}
            for card in wcards:
                needed = Uom.compute_qty(
                    card.unit, card.quantity, card.product.default_uom)
                available = quantities[card.product]
                if available < needed:
                    result[card.id] = True
                quantities[card.product] = available - needed
        return result

    def _build_tree_node(self):
        leg = self.leg
        job = getattr(self, 'job', None)
        # The engineering master of the part (the pinned revision or the
        # current one)
        master = None
        if self.product.producible and hasattr(self.product, 'get_bom'):
            master = self.product.get_bom(self.component_revision)
        return {
            'id': self.id,
            'operation': self.operation,
            'piece': self.piece,
            'product': self.product.rec_name,
            'product_id': self.product.id,
            'template_id': self.product.template.id,
            'revision': self.component_revision,
            'quantity': self.quantity,
            'unit': self.unit.symbol,
            'supply': self.supply,
            'state': self.state,
            'short': self.short,
            'producible': self.producible,
            'master_bom_id': master.bom.id if master else None,
            'job': job.number if job else None,
            'leg': leg._build_tree_node() if leg else None,
            }

    def get_traveler_lines(self, depth):
        yield depth + 1, 'card', self
        if self.leg:
            yield from self.leg.get_traveler_lines(depth + 2)


class Traveler(CompanyReport):
    "Traveler"
    __name__ = 'production.traveler'

    @classmethod
    def get_context(cls, records, header, data):
        context = super().get_context(records, header, data)
        context['lines'] = lambda p: list(p.get_traveler_lines())
        # Fields of optional modules
        context['attr'] = lambda r, n, d=None: getattr(r, n, d)
        return context
