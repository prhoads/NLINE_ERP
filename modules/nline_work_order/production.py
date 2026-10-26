# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import re

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Workflow, fields
from trytond.model.exceptions import AccessError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Bool, Eval
from trytond.wizard import Button, StateTransition, StateView, Wizard

from .exceptions import LegError


class Production(metaclass=PoolMeta):
    __name__ = 'production'

    parent = fields.Many2One(
        'production', "Parent", readonly=True, ondelete='CASCADE',
        states={
            'invisible': ~Eval('parent'),
            },
        help="The production this leg is made for.")
    legs = fields.One2Many(
        'production', 'parent', "Legs", readonly=True,
        states={
            'invisible': ~Eval('legs'),
            })
    root = fields.Function(fields.Many2One(
            'production', "Work Order",
            states={
                'invisible': ~Eval('parent'),
                }),
        'get_root', searcher='search_root')
    leg_index = fields.Integer(
        "Leg", readonly=True,
        states={
            'invisible': ~Eval('parent'),
            },
        help="The number of the leg in its work order (Jobshop SUB_ID).")
    material_cards = fields.One2Many(
        'production.material_card', 'production', "Material Cards",
        readonly=True,
        order=[
            ('operation', 'ASC'),
            ('piece', 'ASC'),
            ('id', 'ASC'),
            ])

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.number.readonly = False
        cls.number.states = {
            'readonly': ~Eval('state').in_(['request', 'draft']),
            }

    @classmethod
    def _get_origin(cls):
        return super()._get_origin() | {'production.material_card'}

    def get_root(self, name):
        production = self
        while production.parent:
            production = production.parent
        return production.id

    @classmethod
    def search_root(cls, name, clause):
        _, operator, value = clause[:3]
        if operator == '=' and isinstance(value, int):
            return ['OR',
                ('id', '=', value),
                ('parent', 'child_of', [value], 'parent'),
                ]
        return [('id', '=', None)]

    @classmethod
    def work_order_number(cls, sale_line):
        """Return the work order number of the sale line:
        WO-<sale order digits>-<line position>"""
        sale = sale_line.sale
        digits = re.sub(r'\D', '', sale.number or '')
        lines = [l for l in sale.lines if l.type == 'line']
        position = lines.index(sale_line) + 1 if sale_line in lines else 1
        number = 'WO-%s-%02d' % (digits, position)
        if cls.search([('number', '=', number)], limit=1):
            return None
        return number

    @classmethod
    def create(cls, vlist):
        pool = Pool()
        SaleLine = pool.get('sale.line')
        ProductBom = pool.get('product.product-production.bom')
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            if (values.get('bom') and values.get('product')
                    and not values.get('routing')):
                # The routing of the master of the BOM revision
                product_boms = ProductBom.search([
                        ('product', '=', values['product']),
                        ('bom', '=', values['bom']),
                        ], limit=1)
                if product_boms:
                    product_bom, = product_boms
                    values['routing'] = (
                        product_bom.routing.id if product_bom.routing
                        else None)
            origin = values.get('origin')
            if isinstance(origin, str):
                origin = origin.split(',')
            if values.get('number') is None and origin:
                model, id_ = origin
                if model == 'sale.line' and int(id_) >= 0:
                    values['number'] = cls.work_order_number(
                        SaleLine(int(id_)))
        productions = super().create(vlist)
        cls.sync_material_cards(productions)
        return productions

    @classmethod
    def write(cls, *args):
        super().write(*args)
        cls.sync_material_cards(sum(args[0:None:2], []))

    @classmethod
    def set_moves(cls, productions):
        super().set_moves(productions)
        cls.sync_material_cards(productions)

    @classmethod
    def sync_material_cards(cls, productions):
        """Create a material card for each input without one
        with the operation, piece and revision of its BOM line"""
        pool = Pool()
        Card = pool.get('production.material_card')
        cards = []
        for production in cls.browse(productions):
            if production.state not in {'request', 'draft', 'waiting'}:
                continue
            missing = [m for m in production.inputs
                if not isinstance(m.origin, Card)
                and m.state != 'cancelled']
            if not missing:
                continue
            bom_inputs = list(production.bom.inputs) if production.bom else []
            used = {c.bom_input for c in production.material_cards
                if c.bom_input}
            bom_inputs = [i for i in bom_inputs if i not in used]
            for move in missing:
                bom_input = next(
                    (i for i in bom_inputs if i.product == move.product),
                    None)
                card = Card(production=production, move=move)
                if bom_input:
                    bom_inputs.remove(bom_input)
                    card.bom_input = bom_input
                    card.operation = bom_input.operation
                    card.piece = bom_input.piece
                    card.component_revision = bom_input.component_revision
                cards.append(card)
        if cards:
            Card.save(cards)
            Move = pool.get('stock.move')
            moves = []
            for card in cards:
                card.move.origin = card
                moves.append(card.move)
            Move.save(moves)

    @classmethod
    @ModelView.button
    @Workflow.transition('waiting')
    def wait(cls, productions):
        draft_legs = [l for p in productions for l in p.legs
            if l.state in {'request', 'draft'}]
        super().wait(productions)
        # Releasing an order releases its legs
        if draft_legs:
            if hasattr(cls, 'work_center'):
                for leg in draft_legs:
                    if not leg.work_center:
                        leg.work_center = leg.parent.work_center
                cls.save(draft_legs)
            cls.draft([l for l in draft_legs if l.state == 'request'])
            cls.wait(cls.browse(draft_legs))

    @classmethod
    @ModelView.button
    @Workflow.transition('cancelled')
    def cancel(cls, productions):
        legs = [l for p in productions for l in p.legs
            if l.state not in {'done', 'cancelled'}]
        super().cancel(productions)
        if legs:
            cls.cancel(legs)

    @classmethod
    def copy(cls, productions, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('legs', None)
        default.setdefault('material_cards', None)
        default.setdefault('leg_index', None)
        return super().copy(productions, default=default)

    def next_leg_index(self):
        "Return the next leg number in the work order"
        root = self.root or self
        legs = self.search([('parent', 'child_of', [root.id], 'parent')])
        return max((l.leg_index or 0 for l in legs), default=0) + 1


class MaterialCard(ModelSQL, ModelView):
    "Material Card"
    __name__ = 'production.material_card'

    production = fields.Many2One(
        'production', "Production", required=True, ondelete='CASCADE',
        readonly=True)
    move = fields.Many2One(
        'stock.move', "Input", required=True, ondelete='CASCADE',
        readonly=True,
        domain=[
            ('production_input', '=', Eval('production', -1)),
            ])
    bom_input = fields.Many2One(
        'production.bom.input', "BOM Line", readonly=True,
        ondelete='SET NULL')
    operation = fields.Integer(
        "Operation", help="The operation the material is used at.")
    piece = fields.Integer("Piece")
    component_revision = fields.Char(
        "Revision",
        help="The pinned revision of the component, empty for the current "
        "one.")
    supply = fields.Selection([
            ('stock', "Stock"),
            ('leg', "Leg"),
            ], "Supply", readonly=True, required=True)
    product = fields.Function(fields.Many2One(
            'product.product', "Product"), 'get_move_field',
        searcher='search_move_field')
    quantity = fields.Function(fields.Float(
            "Quantity", digits='unit'), 'get_move_field')
    unit = fields.Function(fields.Many2One(
            'product.uom', "Unit"), 'get_move_field')
    state = fields.Function(fields.Selection(
            'get_move_states', "State"), 'get_move_field')
    legs = fields.One2Many('production', 'origin', "Legs", readonly=True)
    leg = fields.Function(fields.Many2One(
            'production', "Leg",
            states={
                'invisible': Eval('supply') != 'leg',
                }),
        'get_leg')
    producible = fields.Function(
        fields.Boolean("Producible"), 'get_producible')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('production')
        cls._order = [
            ('production', 'ASC'),
            ('operation', 'ASC'),
            ('piece', 'ASC'),
            ('id', 'ASC'),
            ]
        cls._buttons.update({
                'make_leg': {
                    'invisible': ((Eval('supply') == 'leg')
                        | ~Eval('producible')),
                    'readonly': Eval('state') != 'draft',
                    'depends': ['supply', 'producible', 'state'],
                    },
                'remove_leg': {
                    'invisible': Eval('supply') != 'leg',
                    'readonly': Eval('state') != 'draft',
                    'depends': ['supply', 'state'],
                    },
                })

    @classmethod
    def default_supply(cls):
        return 'stock'

    @classmethod
    def get_move_states(cls):
        pool = Pool()
        Move = pool.get('stock.move')
        return Move.fields_get(['state'])['state']['selection']

    def get_move_field(self, name):
        value = getattr(self.move, name)
        if isinstance(value, ModelSQL):
            return value.id
        return value

    @classmethod
    def search_move_field(cls, name, clause):
        return [('move.' + clause[0],) + tuple(clause[1:])]

    def get_leg(self, name):
        for leg in self.legs:
            if leg.state != 'cancelled':
                return leg.id

    def get_producible(self, name):
        return bool(self.product and self.product.producible
            and self.product.boms)

    def get_rec_name(self, name):
        return '%s @ %s' % (self.product.rec_name, self.production.rec_name)

    @classmethod
    def search_rec_name(cls, name, clause):
        return ['OR',
            ('move.product.rec_name',) + tuple(clause[1:]),
            ('production.rec_name',) + tuple(clause[1:]),
            ]

    @classmethod
    @ModelView.button_action('nline_work_order.wizard_make_leg')
    def make_leg(cls, cards):
        pass

    @classmethod
    @ModelView.button
    def remove_leg(cls, cards):
        pool = Pool()
        Production = pool.get('production')
        Move = pool.get('stock.move')
        legs, moves = [], []
        for card in cards:
            if card.supply != 'leg':
                continue
            for leg in card.legs:
                if leg.state not in {'request', 'draft', 'cancelled'}:
                    raise LegError(gettext(
                            'nline_work_order.msg_remove_leg_started',
                            leg=leg.rec_name))
                legs.append(leg)
            move = card.move
            move.from_location = card.production.picking_location
            move.wip_source = None
            moves.append(move)
            card.supply = 'stock'
        Move.save(moves)
        cls.save(cards)
        Production.delete(legs)

    def create_leg(self, product_bom):
        """Create the leg producing the card component from the BOM link
        and supply the card from it"""
        pool = Pool()
        Production = pool.get('production')
        Move = pool.get('stock.move')

        parent = self.production
        if parent.state not in {'request', 'draft', 'waiting'}:
            raise LegError(gettext(
                    'nline_work_order.msg_make_leg_state',
                    production=parent.rec_name))
        if self.supply == 'leg':
            raise LegError(gettext(
                    'nline_work_order.msg_make_leg_already',
                    card=self.rec_name))
        wip_location = parent.warehouse.production_wip_location
        if not wip_location:
            raise LegError(gettext(
                    'nline_work_order.msg_missing_wip_location',
                    warehouse=parent.warehouse.rec_name))

        root = parent.root or parent
        index = parent.next_leg_index()
        leg = Production(
            company=parent.company,
            warehouse=parent.warehouse,
            location=parent.location,
            product=self.product,
            bom=product_bom.bom,
            unit=self.unit,
            quantity=self.quantity,
            planned_date=parent.planned_start_date or parent.planned_date,
            origin=self,
            parent=parent,
            leg_index=index,
            number='%s/%s' % (root.number, index),
            state='request' if parent.state == 'request' else 'draft',
            )
        if hasattr(Production, 'routing'):
            leg.routing = getattr(product_bom, 'routing', None)
        if hasattr(Production, 'work_center'):
            leg.work_center = parent.work_center
        leg.set_planned_start_date()
        leg.save()
        Production.set_moves([leg])
        leg = Production(leg.id)

        source = None
        outputs = []
        for output in leg.outputs:
            if output.product == self.product and not source:
                output.to_location = wip_location
                source = output
                outputs.append(output)
        Move.save(outputs)

        move = self.move
        move.from_location = wip_location
        move.wip_source = source
        move.save()
        self.supply = 'leg'
        self.save()
        if parent.state == 'waiting':
            Production.wait([leg])
        return leg

    @classmethod
    def delete(cls, cards):
        for card in cards:
            if any(l.state != 'cancelled' for l in card.legs):
                raise AccessError(gettext(
                        'nline_work_order.msg_delete_card_leg',
                        card=card.rec_name))
        super().delete(cards)


class MakeLegStart(ModelView):
    "Make Leg"
    __name__ = 'production.material_card.make_leg.start'

    card = fields.Many2One(
        'production.material_card', "Material Card", readonly=True)
    product = fields.Many2One('product.product', "Product", readonly=True)
    product_bom = fields.Many2One(
        'product.product-production.bom', "Revision", required=True,
        domain=[
            ('product', '=', Eval('product', -1)),
            ],
        help="The engineering master to build the leg from.\n"
        "The pinned revision of the card is selected.")
    pinned_revision = fields.Char("Pinned Revision", readonly=True)


class MakeLeg(Wizard):
    "Make Leg"
    __name__ = 'production.material_card.make_leg'
    start = StateView(
        'production.material_card.make_leg.start',
        'nline_work_order.material_card_make_leg_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Make Leg", 'make', 'tryton-ok', default=True),
            ])
    make = StateTransition()

    def default_start(self, fields):
        card = self.record
        product_bom = card.product.get_bom(card.component_revision)
        return {
            'card': card.id,
            'product': card.product.id,
            'product_bom': product_bom.id if product_bom else None,
            'pinned_revision': card.component_revision,
            }

    def transition_make(self):
        self.record.create_leg(self.start.product_bom)
        return 'end'


class Move(metaclass=PoolMeta):
    __name__ = 'stock.move'

    @classmethod
    def _get_origin(cls):
        return super()._get_origin() + ['production.material_card']


class SaleLine(metaclass=PoolMeta):
    __name__ = 'sale.line'

    work_order = fields.Function(fields.Many2One(
            'production', "Work Order",
            states={
                'invisible': ~Bool(Eval('work_order')),
                }),
        'get_work_order')

    def get_work_order(self, name):
        for production in self.productions:
            if production.state != 'cancelled':
                return production.id
