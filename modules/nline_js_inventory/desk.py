# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The services of Jobshop's Inventory windows (nline_desk web screens)

Parts (its order tabs, where used, inventory transactions and pieces, supply
and demand, material availability, copy to a new Part ID, delete, reset
material costs), Units of Measure, Unit Conversions, Locations and
Adjustments (adjust in / out, transfers, physical counts).
"""
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.modules.product import round_price
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .part import on_hand

ZERO = Decimal(0)

# Jobshop's order statuses -> the Tryton states, by document
STATUSES = {
    'sale': {
        'unreleased': ['draft'],
        'firm': ['quotation'],
        'released': ['confirmed', 'processing'],
        'closed': ['done'],
        'cancelled': ['cancelled'],
        },
    'purchase': {
        'unreleased': ['draft'],
        'firm': ['quotation'],
        'released': ['confirmed', 'processing'],
        'closed': ['done'],
        'cancelled': ['cancelled'],
        },
    'production': {
        'unreleased': ['request', 'draft'],
        'released': ['waiting', 'assigned', 'running'],
        'closed': ['done'],
        'cancelled': ['cancelled'],
        },
    }
STATUS_LABELS = {'unreleased': "Unreleased", 'firm': "Firm",
    'released': "Released", 'closed': "Closed", 'cancelled': "Cancelled"}
OPEN = ['unreleased', 'firm', 'released']
# The material statuses of Reset Material Costs -> production states
MATERIAL_STATUSES = STATUSES['production']


def _status(kind, state):
    for status, states in STATUSES[kind].items():
        if state in states:
            return STATUS_LABELS[status]
    return state


def _states(kind, statuses):
    statuses = statuses or ['released']
    if 'all' in statuses:
        statuses = list(STATUSES[kind])
    return [s for status in statuses for s in STATUSES[kind].get(status, [])]


def _num(value):
    return float(value) if value is not None else None


def _date(value):
    if isinstance(value, str):
        return dt.date.fromisoformat(value[:10])
    return value


def _dec(value):
    if value is None or value == '':
        return None
    return Decimal(str(value))


class Desk(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in [
                'part_copy', 'part_delete', 'reset_material_costs',
                'adjustments_post', 'transfers_post', 'count_save',
                'units_save', 'conversions_save', 'locations_save']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in [
                'inventory_setup', 'part_orders', 'part_where_used',
                'part_supply_demand', 'part_availability',
                'inventory_transactions', 'inventory_pieces',
                'unit_convert', 'adjustments_history', 'count_sheet',
                'units_list', 'conversions_list', 'locations_list',
                'location_stock']:
            cls.__rpc__[name] = RPC()

    # ---- Helpers ---------------------------------------------------------

    @classmethod
    def _js_warehouse(cls):
        pool = Pool()
        Location = pool.get('stock.location')
        warehouse = Location.get_default_warehouse()
        if warehouse:
            return Location(warehouse)
        warehouses = Location.search([('type', '=', 'warehouse')], limit=1)
        if not warehouses:
            raise ValidationError(gettext(
                    'nline_js_inventory.msg_no_warehouse'))
        return warehouses[0]

    @classmethod
    def _js_lost_found(cls, warehouse):
        Location = Pool().get('stock.location')
        if warehouse.lost_found_location:
            return warehouse.lost_found_location
        found = Location.search([('type', '=', 'lost_found')], limit=1)
        if not found:
            raise ValidationError(gettext(
                    'nline_js_inventory.msg_no_lost_found'))
        return found[0]

    @classmethod
    def _js_storages(cls, warehouse=None, active_test=True):
        "The storage locations of the warehouse (all of them by default)"
        Location = Pool().get('stock.location')
        domain = [('type', '=', 'storage')]
        if warehouse and warehouse.storage_location:
            domain.append(
                ('parent', 'child_of', [warehouse.storage_location.id]))
        with Transaction().set_context(active_test=active_test):
            return Location.search(domain, order=[('code', 'ASC'),
                    ('name', 'ASC')])

    @classmethod
    def _js_part(cls, template):
        Template = Pool().get('product.template')
        with Transaction().set_context(active_test=False):
            return Template(int(template))

    @classmethod
    def _js_product(cls, part):
        "The variant of a Jobshop part (template id or product id)"
        pool = Pool()
        Product = pool.get('product.product')
        if isinstance(part, dict):
            if part.get('product'):
                return Product(int(part['product']))
            part = part.get('template')
        template = cls._js_part(part)
        if not template.products:
            raise ValidationError(gettext(
                    'nline_js_inventory.msg_part_no_variant',
                    part=template.rec_name))
        return template.products[0]

    @classmethod
    def inventory_setup(cls):
        """The warehouse, its locations and the reason codes the Inventory
        windows offer, and the labels of the part's user defined fields"""
        pool = Pool()
        Reason = pool.get('nline.reason_code')
        Configuration = pool.get('nline.desk.configuration')
        warehouse = cls._js_warehouse()
        labels = (Configuration(1).part_user_labels or '').splitlines()
        labels = (labels + [''] * 10)[:10]
        return {
            'warehouse': {'id': warehouse.id, 'rec_name': warehouse.rec_name},
            'lost_found': cls._js_lost_found(warehouse).id,
            'storage': (warehouse.storage_location.id
                if warehouse.storage_location else None),
            'reasons': [{'id': r.id, 'code': r.code,
                    'rec_name': r.rec_name} for r in Reason.search([])],
            'user_labels': [l.strip() or 'User Defined %s' % (i + 1)
                for i, l in enumerate(labels)],
            }

    # ---- Part: order tabs ----------------------------------------------

    @classmethod
    def part_orders(cls, template, kind, statuses=None):
        """The lines of the part on sales orders (kind 'sale'), purchase
        orders ('purchase') or the work orders that make it ('production'),
        in the Jobshop statuses (default Released)"""
        pool = Pool()
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        rows = []
        if kind == 'sale':
            cls._check_read('sale.line')
            Line = pool.get('sale.line')
            for line in Line.search([
                        ('product', 'in', products),
                        ('sale.state', 'in', _states('sale', statuses)),
                        ], order=[('sale.sale_date', 'DESC'), ('id', 'DESC')],
                    limit=500):
                shipped = cls._js_done_quantity(line, 'customer')
                price = line.unit_price or ZERO
                rows.append({
                        'id': line.sale.id,
                        'line': line.id,
                        'linked': bool(getattr(line, 'productions', None)),
                        'number': line.sale.number or str(line.sale.id),
                        'party': line.sale.party.rec_name,
                        'status': _status('sale', line.sale.state),
                        'line_status': ("Closed" if shipped >= line.quantity
                            else _status('sale', line.sale.state)),
                        'sequence': line.sequence,
                        'quantity': line.quantity,
                        'shipped': shipped,
                        'unit': line.unit.symbol if line.unit else '',
                        'unit_price': price,
                        'amount': line.amount,
                        'shipped_amount': (price * Decimal(str(shipped))
                            ).quantize(Decimal('0.01')),
                        'date': line.shipping_date,
                        'reference': line.sale.reference or '',
                        })
        elif kind == 'purchase':
            cls._check_read('purchase.line')
            Line = pool.get('purchase.line')
            for line in Line.search([
                        ('product', 'in', products),
                        ('purchase.state', 'in',
                            _states('purchase', statuses)),
                        ], order=[('purchase.purchase_date', 'DESC'),
                        ('id', 'DESC')], limit=500):
                received = cls._js_done_quantity(line, 'supplier')
                dates = [m.effective_date for m in line.moves
                    if m.state == 'done' and m.effective_date]
                price = line.unit_price or ZERO
                rows.append({
                        'id': line.purchase.id,
                        'line': line.id,
                        'linked': bool(getattr(line, 'requests', None)),
                        'number': line.purchase.number
                        or str(line.purchase.id),
                        'party': line.purchase.party.rec_name,
                        'status': _status('purchase', line.purchase.state),
                        'buyer': (line.purchase.create_uid.rec_name
                            if line.purchase.create_uid else ''),
                        'sequence': line.sequence,
                        'quantity': line.quantity,
                        'received': received,
                        'unit': line.unit.symbol if line.unit else '',
                        'unit_price': price,
                        'amount': line.amount,
                        'received_amount': (price * Decimal(str(received))
                            ).quantize(Decimal('0.01')),
                        'last_received': max(dates) if dates else None,
                        'date': line.delivery_date,
                        'reference': line.purchase.reference or '',
                        })
        elif kind == 'production':
            cls._check_read('production')
            Production = pool.get('production')
            for production in Production.search([
                        ('product', 'in', products),
                        ('state', 'in', _states('production', statuses)),
                        ], order=[('planned_date', 'DESC'), ('id', 'DESC')],
                    limit=500):
                received = sum(m.quantity for m in production.outputs
                    if m.state == 'done' and m.product.id in products)
                cost = getattr(production, 'cost', None)
                rows.append({
                        'id': production.id,
                        'number': production.number or str(production.id),
                        'description': template.name,
                        'status': _status('production', production.state),
                        'state': production.state,
                        'quantity': production.quantity,
                        'received': received,
                        'unit': (production.unit.symbol
                            if production.unit else ''),
                        'unit_cost': (round_price(cost / Decimal(str(
                                    production.quantity)))
                            if cost and production.quantity else None),
                        'date': production.planned_date,
                        'start': production.planned_start_date,
                        'finish': production.planned_date,
                        })
        else:
            raise ValueError(kind)
        return rows

    @classmethod
    def _js_done_quantity(cls, line, party_type):
        "The quantity of the order line moved to/from the party, in its unit"
        Uom = Pool().get('product.uom')
        quantity = 0.0
        for move in line.moves:
            if move.state != 'done':
                continue
            sign = 1
            if party_type in (move.from_location.type,
                    move.to_location.type):
                # A return goes the other way
                if (party_type == 'customer') == (
                        move.from_location.type == 'customer'):
                    sign = -1
            quantity += sign * Uom.compute_qty(
                move.unit, move.quantity, line.unit)
        return quantity

    # ---- Part: where used ------------------------------------------------

    @classmethod
    def part_where_used(cls, template, masters=True, work_orders=True):
        """The engineering masters (BOMs) and the open work orders where the
        part is a material (Jobshop's Part Where Used)"""
        pool = Pool()
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        rows = []
        if masters:
            cls._check_read('production.bom')
            Input = pool.get('production.bom.input')
            for line in Input.search([('product', 'in', products)]):
                bom = line.bom
                outputs = [o.product.rec_name for o in bom.outputs]
                rows.append({
                        'type': 'Eng Master',
                        'model': 'production.bom',
                        'id': bom.id,
                        'document': bom.rec_name,
                        'part': ', '.join(outputs),
                        'revision': getattr(bom, 'revision', None) or '',
                        'quantity': line.quantity,
                        'unit': line.unit.symbol if line.unit else '',
                        'status': '',
                        })
        if work_orders:
            cls._check_read('production')
            Move = pool.get('stock.move')
            Card = None
            try:
                Card = pool.get('production.material_card')
            except KeyError:
                pass
            cards = {}
            if Card:
                for card in Card.search([('product', 'in', products)]):
                    cards[card.move.id] = card
            for move in Move.search([
                        ('product', 'in', products),
                        ('production_input', '!=', None),
                        ('production_input.state', 'not in',
                            ['done', 'cancelled']),
                        ('state', '!=', 'cancelled'),
                        ]):
                production = move.production_input
                card = cards.get(move.id)
                rows.append({
                        'type': 'Work Order',
                        'model': 'production',
                        'id': production.id,
                        'document': production.number or str(production.id),
                        'part': (production.product.rec_name
                            if production.product else ''),
                        'operation': card.operation if card else None,
                        'piece': card.piece if card else None,
                        'quantity': move.quantity,
                        'unit': move.unit.symbol if move.unit else '',
                        'status': _status('production', production.state),
                        })
        return rows

    # ---- Part: inventory transactions and pieces ------------------------

    @classmethod
    def inventory_transactions(cls, template=None, location=None, limit=500):
        """The inventory transactions (done and planned stock moves) of a
        part, or of a location, newest first, in Jobshop's columns"""
        cls._check_read('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        domain = [('state', '!=', 'cancelled')]
        if template:
            template = cls._js_part(template)
            domain.append(('product', 'in', [p.id for p in template.products]))
        if location:
            domain.append(['OR', ('from_location', '=', int(location)),
                    ('to_location', '=', int(location))])
        if not template and not location:
            domain.append(['OR', ('from_location.type', '=', 'storage'),
                    ('to_location.type', '=', 'storage')])
        rows = []
        for move in Move.search(domain, order=[('effective_date', 'DESC'),
                    ('planned_date', 'DESC'), ('id', 'DESC')],
                limit=int(limit or 500)):
            inbound = move.to_location.type == 'storage'
            outbound = move.from_location.type == 'storage'
            factor = 0 if inbound and outbound else (1 if inbound else
                (-1 if outbound else 0))
            stock_location = move.to_location if inbound else (
                move.from_location)
            cost = move.cost_price if getattr(
                move, 'cost_price', None) is not None else None
            document = ''
            if move.shipment:
                document = move.shipment.rec_name
            elif getattr(move, 'production_input', None):
                document = move.production_input.rec_name
            elif getattr(move, 'production_output', None):
                document = move.production_output.rec_name
            elif move.origin:
                document = move.origin.rec_name
            rows.append({
                    'id': move.id,
                    'date': move.effective_date or move.planned_date,
                    'class': move.get_js_class(),
                    'type': {1: 'In', -1: 'Out', 0: ''}[factor],
                    'part': move.product.rec_name,
                    'quantity': move.quantity,
                    'unit': move.unit.symbol if move.unit else '',
                    'location': stock_location.rec_name,
                    'from': move.from_location.rec_name,
                    'to': move.to_location.rec_name,
                    'lot': move.lot.number if getattr(move, 'lot', None)
                    else '',
                    'cost': cost,
                    'value': (cost * Decimal(str(move.quantity))).quantize(
                        Decimal('0.01')) if cost is not None else None,
                    'document': document,
                    'reason': (move.reason_code.rec_name
                        if move.reason_code else ''),
                    'state': move.state,
                    })
        return rows

    @classmethod
    def inventory_pieces(cls, template):
        """The part's stock today by location and tracking number (lot)
        with the dimensions of piece tracking"""
        cls._check_read('stock.move')
        pool = Pool()
        Location = pool.get('stock.location')
        Lot = pool.get('stock.lot')
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        storages = cls._js_storages(active_test=False)
        quantities = on_hand([s.id for s in storages], products,
            grouping=('product', 'lot'), with_childs=False)
        rows = []
        for (location, product, lot), quantity in sorted(
                quantities.items(), key=lambda i: (i[0][0], i[0][2] or 0)):
            if not quantity:
                continue
            location = Location(location)
            rows.append({
                    'location': location.rec_name,
                    'location_id': location.id,
                    'lot': Lot(lot).number if lot else '',
                    'quantity': quantity,
                    'unit': template.default_uom.symbol,
                    'length': None, 'width': None, 'height': None,
                    'dimensions_uom': (template.dimensions_uom.symbol
                        if template.dimensions_uom else ''),
                    })
        return {
            'part': template.rec_name,
            'piece_tracked': bool(template.piece_tracked),
            'rows': rows,
            }

    @classmethod
    def location_stock(cls, template, location=None):
        """The part's quantity on hand by storage location (or in one): what
        an adjustment or a transfer can take out"""
        cls._check_read('stock.move')
        product = cls._js_product(template)
        if location:
            locations = [int(location)]
        else:
            locations = [l.id for l in cls._js_storages()]
        quantities = on_hand(locations, [product.id], grouping=('product',
                'lot'), with_childs=False)
        result = []
        Lot = Pool().get('stock.lot')
        for (location_id, _, lot), quantity in quantities.items():
            if quantity:
                result.append({'location': location_id,
                        'lot': Lot(lot).number if lot else '',
                        'quantity': quantity})
        return result

    # ---- Part: supply and demand, material availability ----------------

    @classmethod
    def part_supply_demand(cls, template):
        """Jobshop's Supply & Demand of a part: the open sales orders
        (demand), work orders (supply when they make the part, demand when
        they use it) and purchase orders (supply)"""
        pool = Pool()
        ModelAccess = pool.get('ir.model.access')
        Move = pool.get('stock.move')
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        result = {'sales': [], 'work_orders': [], 'purchases': [],
            'unit': template.default_uom.symbol}
        Uom = pool.get('product.uom')

        def to_stock(quantity, unit):
            return Uom.compute_qty(unit, quantity, template.default_uom)

        if ModelAccess.check('sale.line', 'read', raise_exception=False):
            Line = pool.get('sale.line')
            for line in Line.search([
                        ('product', 'in', products),
                        ('sale.state', 'in', _states('sale', OPEN)),
                        ], order=[('id', 'ASC')]):
                demand = to_stock(line.quantity - cls._js_done_quantity(
                        line, 'customer'), line.unit)
                if demand <= 0:
                    continue
                result['sales'].append({
                        'id': line.sale.id,
                        'number': line.sale.number or str(line.sale.id),
                        'sequence': line.sequence,
                        'status': _status('sale', line.sale.state),
                        'date': line.shipping_date,
                        'demand': demand,
                        'linked': bool(getattr(line, 'productions', None)),
                        })
        if ModelAccess.check('production', 'read', raise_exception=False):
            Production = pool.get('production')
            for production in Production.search([
                        ('product', 'in', products),
                        ('state', 'in', _states('production', OPEN)),
                        ], order=[('planned_date', 'ASC'), ('id', 'ASC')]):
                done = sum(to_stock(m.quantity, m.unit)
                    for m in production.outputs
                    if m.state == 'done' and m.product.id in products)
                supply = to_stock(production.quantity or 0,
                    production.unit or template.default_uom) - done
                if supply <= 0:
                    continue
                result['work_orders'].append({
                        'id': production.id,
                        'number': production.number or str(production.id),
                        'status': _status('production', production.state),
                        'date': production.planned_date,
                        'finish': production.planned_date,
                        'supply': supply,
                        'demand': 0,
                        })
            for move in Move.search([
                        ('product', 'in', products),
                        ('production_input', '!=', None),
                        ('production_input.state', 'in',
                            _states('production', OPEN)),
                        ('state', 'not in', ['done', 'cancelled']),
                        ], order=[('planned_date', 'ASC'), ('id', 'ASC')]):
                production = move.production_input
                result['work_orders'].append({
                        'id': production.id,
                        'number': production.number or str(production.id),
                        'status': _status('production', production.state),
                        'date': move.planned_date or production.planned_date,
                        'finish': production.planned_date,
                        'supply': 0,
                        'demand': to_stock(move.quantity, move.unit),
                        })
        if ModelAccess.check('purchase.line', 'read', raise_exception=False):
            Line = pool.get('purchase.line')
            for line in Line.search([
                        ('product', 'in', products),
                        ('purchase.state', 'in', _states('purchase', OPEN)),
                        ], order=[('id', 'ASC')]):
                supply = to_stock(line.quantity - cls._js_done_quantity(
                        line, 'supplier'), line.unit)
                if supply <= 0:
                    continue
                result['purchases'].append({
                        'id': line.purchase.id,
                        'number': line.purchase.number
                        or str(line.purchase.id),
                        'sequence': line.sequence,
                        'status': _status('purchase', line.purchase.state),
                        'date': line.delivery_date,
                        'supply': supply,
                        'linked': bool(getattr(line, 'requests', None)),
                        })
        # By date (the lines' dates are computed)
        for key in ['sales', 'work_orders', 'purchases']:
            result[key].sort(key=lambda r: (r['date'] or dt.date.max,
                    r['number']))
        return result

    @classmethod
    def part_availability(cls, template):
        """Material Availability of a part: on hand, on hold, available,
        the open supply and demand and what is left (projected)"""
        cls._check_read('stock.move')
        pool = Pool()
        PartLocation = pool.get('nline.js.part_location')
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        warehouse = cls._js_warehouse()
        quantities = on_hand([warehouse.id], products)
        total = sum(quantities.get((warehouse.id, p), 0) for p in products)
        hold = sum(pl.quantity for pl in PartLocation.search([
                    ('template', '=', template.id),
                    ('hold', '=', True),
                    ]))
        sd = cls.part_supply_demand(template.id)
        supply = (sum(r['supply'] for r in sd['work_orders'])
            + sum(r['supply'] for r in sd['purchases']))
        demand = (sum(r['demand'] for r in sd['work_orders'])
            + sum(r['demand'] for r in sd['sales']))
        available = total - hold
        return {
            'part': template.rec_name,
            'unit': template.default_uom.symbol,
            'on_hand': total,
            'on_hold': hold,
            'available': available,
            'supply': supply,
            'demand': demand,
            'projected': available + supply - demand,
            'order_point': template.order_point,
            'safety_stock': template.safety_stock,
            'below_order_point': (template.order_point is not None
                and available + supply - demand <= template.order_point),
            }

    @classmethod
    def unit_convert(cls, quantity, from_uom, to_uom, template=None):
        "Convert a quantity between units (Jobshop's unit conversions)"
        Conversion = Pool().get('nline.js.unit_conversion')
        return Conversion.convert(quantity, from_uom, to_uom, template)

    # ---- Part: copy, delete, reset material costs ------------------------

    @classmethod
    def part_copy(cls, template, code):
        """Copy all the information of a part except the Part ID into a new
        part (Jobshop Copy / Paste Document)"""
        cls._check_create('product.template')
        Template = Pool().get('product.template')
        code = (code or '').strip()
        if not code:
            raise ValidationError(gettext(
                    'nline_js_inventory.msg_part_id_required'))
        template = cls._js_part(template)
        new, = Template.copy([template], default={'code': code})
        return new.id

    @classmethod
    def _part_references(cls, template):
        "Where the part is used: what forbids deleting it"
        pool = Pool()
        products = [p.id for p in template.products]
        checks = [
            ('stock.move', 'product', "inventory transactions"),
            ('sale.line', 'product', "sales orders"),
            ('purchase.line', 'product', "purchase orders"),
            ('production.bom.input', 'product', "engineering masters"),
            ('production.bom.output', 'product', "engineering masters"),
            ('production', 'product', "work orders"),
            ('account.invoice.line', 'product', "invoices"),
            ]
        used = []
        with Transaction().set_context(active_test=False), \
                Transaction().set_user(0):
            for model, field, label in checks:
                try:
                    Model = pool.get(model)
                except KeyError:
                    continue
                if Model.search([(field, 'in', products)], limit=1):
                    used.append(label)
        return used

    @classmethod
    def part_delete(cls, template):
        """Delete a part that is not used anywhere (Jobshop refuses a part
        with references; mark it Inactive instead)"""
        pool = Pool()
        ModelAccess = pool.get('ir.model.access')
        Template = pool.get('product.template')
        ModelAccess.check('product.template', 'delete')
        template = cls._js_part(template)
        used = cls._part_references(template)
        if used:
            raise ValidationError(gettext(
                    'nline_js_inventory.msg_part_used',
                    part=template.rec_name, used=', '.join(used)))
        Template.delete([template])
        return True

    @classmethod
    def reset_material_costs(cls, values):
        """Reset the estimated cost of the materials of the work orders to
        the part's current cost (Jobshop Tools > Reset Material Costs)

        values: template (None: all materials), statuses (unreleased,
        released, closed, cancelled, all), from_date / to_date (work order
        creation). Done materials keep their cost; masters have no cost of
        their own (they use the part's)."""
        cls._check_write('stock.move', 'production')
        pool = Pool()
        Move = pool.get('stock.move')
        domain = [
            ('production_input', '!=', None),
            ('state', 'not in', ['done', 'cancelled']),
            ]
        if values.get('template'):
            template = cls._js_part(values['template'])
            domain.append(
                ('product', 'in', [p.id for p in template.products]))
        statuses = values.get('statuses')
        if statuses:
            domain.append(('production_input.state', 'in',
                    _states('production', statuses)))
        if values.get('from_date'):
            domain.append(('production_input.create_date', '>=',
                    dt.datetime.combine(_date(values['from_date']),
                        dt.time.min)))
        if values.get('to_date'):
            domain.append(('production_input.create_date', '<=',
                    dt.datetime.combine(_date(values['to_date']),
                        dt.time.max)))
        moves = Move.search(domain)
        to_write = defaultdict(list)
        for move in moves:
            cost = move.product.cost_price
            if move.cost_price != cost:
                to_write[cost].append(move)
        count = 0
        for cost, group in to_write.items():
            Move.write(group, {'cost_price': cost})
            count += len(group)
        return {'materials': len(moves), 'reset': count}

    # ---- Adjustments, transfers -----------------------------------------

    @classmethod
    def _js_lot(cls, product, number, create=False):
        Lot = Pool().get('stock.lot')
        number = (number or '').strip()
        if not number:
            return None
        lots = Lot.search([('product', '=', product.id),
                ('number', '=', number)], limit=1)
        if lots:
            return lots[0]
        if not create:
            raise ValidationError(gettext(
                    'nline_js_inventory.msg_lot_unknown',
                    lot=number, part=product.rec_name))
        lot = Lot(product=product, number=number)
        lot.save()
        return lot

    @classmethod
    def _js_available(cls, product, location, lot=None):
        quantities = on_hand([location.id], [product.id],
            grouping=('product', 'lot'), with_childs=True)
        return sum(q for (l, p, lt), q in quantities.items()
            if lot is None or lt == (lot.id if lot else None))

    @classmethod
    def adjustments_post(cls, values):
        """Adjust parts in or out of inventory (Jobshop Adjustments tab):
        each line a done move from (in) or to (out) the lost and found
        location. values: lines [{type: in|out, date, template, quantity,
        location, reason_code, account, lot, material, labor, burden,
        service}]. Returns the moves (entry numbers)."""
        cls._check_create('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        Location = pool.get('stock.location')
        Date = pool.get('ir.date')
        warehouse = cls._js_warehouse()
        lost_found = cls._js_lost_found(warehouse)
        company = cls._company()
        today = Date.today()
        moves, costs = [], []
        out_needed = defaultdict(float)
        for line in values.get('lines', []):
            kind = line.get('type')
            if kind not in ('in', 'out'):
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_adjustment_type'))
            product = cls._js_product(line)
            quantity = float(line.get('quantity') or 0)
            if quantity <= 0:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_quantity_positive',
                        part=product.rec_name))
            location = Location(int(line.get('location')
                    or product.template.primary_location
                    or warehouse.storage_location))
            if location.type != 'storage':
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_location_storage',
                        location=location.rec_name))
            lot = cls._js_lot(product, line.get('lot'), create=kind == 'in')
            if product.lot_is_required(location, lost_found) and not lot:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_lot_required',
                        part=product.rec_name))
            date = _date(line.get('date')) or today
            move = Move(
                product=product,
                unit=product.default_uom,
                quantity=product.default_uom.round(quantity),
                from_location=lost_found if kind == 'in' else location,
                to_location=location if kind == 'in' else lost_found,
                effective_date=date,
                planned_date=date,
                company=company,
                adjustment=kind,
                lot=lot,
                reason_code=line.get('reason_code') or None,
                adjustment_account=line.get('account') or None,
                )
            cost = None
            if kind == 'in' and any(line.get(c) not in (None, '')
                    for c in ['material', 'labor', 'burden', 'service']):
                cost = sum((_dec(line.get(c)) or ZERO)
                    for c in ['material', 'labor', 'burden', 'service'])
                move.cost_price = round_price(cost)
            if kind == 'out':
                out_needed[(product, location, lot)] += quantity
            moves.append(move)
            costs.append(cost)
        # Jobshop: no adjustment leaves a location negative
        for (product, location, lot), quantity in out_needed.items():
            available = cls._js_available(product, location, lot)
            if quantity > available + 1e-9:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_not_enough',
                        part=product.rec_name, location=location.rec_name,
                        quantity=available))
        if not moves:
            return []
        for move, cost in zip(moves, costs):
            if cost is not None:
                cls._js_revalue(move.product, move.quantity, cost)
        Move.save(moves)
        with Transaction().set_context(_skip_warnings=True):
            Move.do(moves)
        return [{'id': m.id, 'entry': m.id} for m in moves]

    @classmethod
    def _js_revalue(cls, product, quantity, cost, included=False):
        """An Adjust In at value: the part's average cost takes the value of
        the quantity adjusted in (Jobshop's FIFO layer at that cost);
        included: the quantity is already on hand"""
        if product.cost_price_method != 'average':
            return
        warehouses = [l.id for l in Pool().get('stock.location').search([
                    ('type', '=', 'warehouse')])]
        quantities = on_hand(warehouses, [product.id])
        current = Decimal(str(sum(quantities.get((w, product.id), 0)
                    for w in warehouses)))
        quantity = Decimal(str(quantity))
        if included:
            current -= quantity
        old = product.cost_price or ZERO
        if current + quantity <= 0:
            return
        if current < 0:
            current = ZERO
        new = round_price((old * current + cost * quantity)
            / (current + quantity))
        if new != old:
            product.cost_price = new
            product.save()

    @classmethod
    def transfers_post(cls, values):
        """Move parts between locations (Jobshop Transfers tab): done moves
        between storage locations. values: lines [{date, template,
        quantity, location, to_location, lot, reason_code}]"""
        cls._check_create('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        Location = pool.get('stock.location')
        Date = pool.get('ir.date')
        company = cls._company()
        today = Date.today()
        moves = []
        needed = defaultdict(float)
        for line in values.get('lines', []):
            product = cls._js_product(line)
            quantity = float(line.get('quantity') or 0)
            if quantity <= 0:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_quantity_positive',
                        part=product.rec_name))
            from_location = Location(int(line['location']))
            to_location = Location(int(line['to_location']))
            for location in [from_location, to_location]:
                if location.type != 'storage':
                    raise ValidationError(gettext(
                            'nline_js_inventory.msg_location_storage',
                            location=location.rec_name))
            if from_location == to_location:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_transfer_same',
                        location=from_location.rec_name))
            lot = cls._js_lot(product, line.get('lot'))
            date = _date(line.get('date')) or today
            moves.append(Move(
                    product=product,
                    unit=product.default_uom,
                    quantity=product.default_uom.round(quantity),
                    from_location=from_location,
                    to_location=to_location,
                    effective_date=date,
                    planned_date=date,
                    company=company,
                    adjustment='transfer',
                    lot=lot,
                    reason_code=line.get('reason_code') or None,
                    ))
            needed[(product, from_location, lot)] += quantity
        for (product, location, lot), quantity in needed.items():
            available = cls._js_available(product, location, lot)
            if quantity > available + 1e-9:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_not_enough',
                        part=product.rec_name, location=location.rec_name,
                        quantity=available))
        if not moves:
            return []
        Move.save(moves)
        with Transaction().set_context(_skip_warnings=True):
            Move.do(moves)
        return [{'id': m.id, 'entry': m.id} for m in moves]

    @classmethod
    def adjustments_history(cls, kind='adjustment', limit=200):
        """The saved adjustments (kind 'adjustment') or transfers
        ('transfer'), newest first: Jobshop's information table once
        saved"""
        cls._check_read('stock.move')
        Move = Pool().get('stock.move')
        kinds = ['transfer'] if kind == 'transfer' else ['in', 'out']
        rows = []
        for move in Move.search([('adjustment', 'in', kinds)],
                order=[('id', 'DESC')], limit=int(limit or 200)):
            location = move.to_location if move.adjustment == 'in' else (
                move.from_location)
            rows.append({
                    'entry': move.id,
                    'date': move.effective_date or move.planned_date,
                    'type': {'in': 'Adjust In', 'out': 'Adjust Out',
                        'transfer': 'Transfer'}[move.adjustment],
                    'template': move.product.template.id,
                    'part': move.product.template.code or '',
                    'description': move.product.template.name,
                    'quantity': move.quantity,
                    'unit': move.unit.symbol,
                    'location': location.rec_name,
                    'from': move.from_location.rec_name,
                    'to': move.to_location.rec_name,
                    'reason': (move.reason_code.rec_name
                        if move.reason_code else ''),
                    'account': (move.adjustment_account.rec_name
                        if move.adjustment_account else ''),
                    'lot': move.lot.number if move.lot else '',
                    'cost': move.cost_price,
                    'state': move.state,
                    })
        return rows

    # ---- Physical count ----------------------------------------------------

    @classmethod
    def count_sheet(cls, filters=None):
        """The physical count table: every part and location (with stock,
        or a saved count) in the filters, its quantity on hand, the counted
        quantity of the open count and the part's unit costs.
        filters: location_from/to, part_from/to, product_code_from/to,
        commodity_code_from/to (IDs, ranges by text), active ('active',
        'inactive', 'both')"""
        cls._check_read('stock.inventory', 'stock.move')
        pool = Pool()
        Product = pool.get('product.product')
        Inventory = pool.get('stock.inventory')
        filters = filters or {}

        def in_range(value, low, high):
            value = value or ''
            if low and value < low:
                return False
            if high and value > high:
                return False
            return True

        storages = [l for l in cls._js_storages()
            if in_range(l.code or l.name, filters.get('location_from'),
                filters.get('location_to'))]
        active = filters.get('active', 'active')
        product_domain = [('type', '=', 'goods')]
        if active == 'active':
            product_domain.append(('template.active', '=', True))
        elif active == 'inactive':
            product_domain.append(('template.active', '=', False))
        for name, field in [('part', 'template.code'),
                ('product_code', 'template.product_code.code'),
                ('commodity_code', 'template.commodity_code.code')]:
            if filters.get(name + '_from'):
                product_domain.append(
                    (field, '>=', filters[name + '_from']))
            if filters.get(name + '_to'):
                product_domain.append((field, '<=', filters[name + '_to']))
        with Transaction().set_context(active_test=False):
            products = Product.search(product_domain)
        product_ids = {p.id for p in products}
        quantities = on_hand([l.id for l in storages], list(product_ids),
            grouping=('product', 'lot'), with_childs=False) if (
            storages and product_ids) else {}
        # The open (draft) counts of these locations
        counted = {}
        for inventory in Inventory.search([
                    ('state', '=', 'draft'),
                    ('location', 'in', [l.id for l in storages]),
                    ]):
            for line in inventory.lines:
                if line.product.id in product_ids:
                    counted[(inventory.location.id, line.product.id,
                            line.lot.id if getattr(line, 'lot', None)
                            else None)] = line.quantity
        keys = {k for k, q in quantities.items() if q} | set(counted)
        locations = {l.id: l for l in storages}
        products = {p.id: p for p in products}
        rows = []
        Lot = pool.get('stock.lot')
        for location_id, product_id, lot_id in keys:
            product = products[product_id]
            template = product.template
            quantity = quantities.get((location_id, product_id, lot_id), 0)
            count = counted.get((location_id, product_id, lot_id))
            rows.append({
                    'location': location_id,
                    'location_code': locations[location_id].code
                    or locations[location_id].name,
                    'template': template.id,
                    'product': product_id,
                    'part': template.code or '',
                    'description': template.name,
                    'inactive': not template.active,
                    'lot': Lot(lot_id).number if lot_id else '',
                    'on_hand': quantity,
                    'unit': template.default_uom.symbol,
                    'count': count if count is not None else quantity,
                    'saved': count is not None,
                    'material': template.unit_material_cost,
                    'labor': template.unit_labor_cost,
                    'burden': template.unit_burden_cost,
                    'service': template.unit_service_cost,
                    })
        rows.sort(key=lambda r: (r['location_code'], r['part'], r['lot']))
        return rows

    @classmethod
    def count_save(cls, values):
        """Save the counted quantities (draft stock inventories, one per
        location) and, with adjust, post them: the differences go to or from
        lost and found (Jobshop's Physical Count Save / Adjust).
        values: lines [{location, product, lot, count, material, labor,
        burden, service}], date, reason_code, adjust (bool), method
        ('over': adjust the differences, default; 'revalue': the counted
        quantity is valued at the costs of the line)"""
        cls._check_create('stock.inventory')
        pool = Pool()
        Inventory = pool.get('stock.inventory')
        Line = pool.get('stock.inventory.line')
        Location = pool.get('stock.location')
        Product = pool.get('product.product')
        Move = pool.get('stock.move')
        PartLocation = pool.get('nline.js.part_location')
        Date = pool.get('ir.date')
        company = cls._company()
        date = _date(values.get('date')) or Date.today()
        by_location = defaultdict(list)
        for line in values.get('lines', []):
            by_location[int(line['location'])].append(line)
        inventories = []
        for location_id, lines in by_location.items():
            location = Location(location_id)
            found = Inventory.search([
                    ('state', '=', 'draft'),
                    ('location', '=', location_id),
                    ], limit=1)
            if found:
                inventory = found[0]
                inventory.date = date
                inventory.save()
            else:
                inventory = Inventory(location=location, date=date,
                    company=company, empty_quantity='keep')
                inventory.save()
            existing = {(l.product.id, l.lot.id if getattr(l, 'lot', None)
                    else None): l for l in inventory.lines}
            to_save = []
            for data in lines:
                product = Product(int(data['product']))
                lot = cls._js_lot(product, data.get('lot'), create=True)
                key = (product.id, lot.id if lot else None)
                line = existing.get(key)
                if not line:
                    line = Line(inventory=inventory, product=product)
                    if lot:
                        line.lot = lot
                line.quantity = float(data.get('count') or 0)
                to_save.append(line)
            Line.save(to_save)
            inventories.append(inventory)
        if not values.get('adjust'):
            return {'inventories': [i.id for i in inventories],
                'adjusted': False}
        cls._check_create('stock.move')
        Inventory.complete_lines(inventories, fill=False)
        with Transaction().set_context(_skip_warnings=True):
            Inventory.confirm(inventories)
        # The moves of the count: Jobshop's reason code and costs
        costs = {}
        for line in values.get('lines', []):
            if any(line.get(c) not in (None, '')
                    for c in ['material', 'labor', 'burden', 'service']):
                costs[int(line['product'])] = sum(
                    (_dec(line.get(c)) or ZERO)
                    for c in ['material', 'labor', 'burden', 'service'])
        moves = Move.search([
                ('origin.inventory', 'in', [i.id for i in inventories],
                    'stock.inventory.line'),
                ])
        reason = values.get('reason_code') or None
        to_write = []
        for move in moves:
            move.reason_code = reason
            move.adjustment = ('in' if move.to_location.type == 'storage'
                else 'out')
            to_write.append(move)
        if to_write:
            Move.save(to_write)
        if values.get('method') == 'revalue':
            for product_id, cost in costs.items():
                product = Product(product_id)
                if product.cost_price_method == 'average':
                    product.cost_price = round_price(cost)
                    product.save()
        else:
            for move in moves:
                cost = costs.get(move.product.id)
                if move.adjustment == 'in' and cost is not None:
                    # Adjust In at value (the quantity is already in)
                    cls._js_revalue(move.product, move.quantity, cost,
                        included=True)
        # Last counted on the part locations
        pairs = {(l.product.template.id, i.location.id)
            for i in inventories for l in i.lines}
        PartLocation.ensure(pairs)
        part_locations = PartLocation.search([
                ['OR'] + [[('template', '=', t), ('location', '=', l)]
                    for t, l in pairs]]) if pairs else []
        if part_locations:
            PartLocation.write(part_locations, {'last_counted': date})
        return {'inventories': [i.id for i in inventories], 'adjusted': True,
            'moves': len(moves)}

    # ---- Units of measure, unit conversions, locations ------------------

    @classmethod
    def units_list(cls):
        "The units of measure (Jobshop ID = symbol, Description = name)"
        Uom = Pool().get('product.uom')
        with Transaction().set_context(active_test=False):
            uoms = Uom.search([], order=[('symbol', 'ASC'), ('id', 'ASC')])
        return [{
                'id': u.id,
                'symbol': u.symbol,
                'name': u.name,
                'digits': u.digits,
                'category': {'id': u.category.id,
                    'rec_name': u.category.rec_name},
                'factor': u.factor,
                'inactive': not u.active,
                } for u in uoms]

    @classmethod
    def units_save(cls, values):
        """Save the rows of the Units of Measure window. A new unit without
        a category gets a category of its own (Jobshop converts between
        units with the unit conversions). values: rows [{id, symbol, name,
        digits (unit scale), category, factor, inactive}], deleted [ids]"""
        pool = Pool()
        Uom = pool.get('product.uom')
        Category = pool.get('product.uom.category')
        rows = values.get('rows', [])
        if any(not r.get('id') for r in rows):
            cls._check_create('product.uom')
        if any(r.get('id') for r in rows):
            cls._check_write('product.uom')
        for row in rows:
            symbol = (row.get('symbol') or '').strip()
            if not symbol:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_unit_id_required'))
            scale = max(0, min(int(row.get('digits') or 0), 4))
            data = {
                'symbol': symbol,
                'name': (row.get('name') or '').strip() or symbol,
                'digits': scale,
                'rounding': float(Decimal(1).scaleb(-scale)),
                'active': not row.get('inactive'),
                }
            if row.get('id'):
                uom = Uom(int(row['id']))
                if row.get('factor') and uom.factor != float(row['factor']):
                    data['factor'] = float(row['factor'])
                Uom.write([uom], data)
            else:
                category = row.get('category')
                if not category:
                    category, = Category.create([{'name': data['name']}])
                    data['factor'] = 1.0
                else:
                    data['factor'] = float(row.get('factor') or 1.0)
                data['category'] = int(category)
                Uom.create([data])
        if values.get('deleted'):
            ModelAccess = pool.get('ir.model.access')
            ModelAccess.check('product.uom', 'delete')
            uoms = Uom.browse([int(i) for i in values['deleted']])
            cls._check_uom_unused(uoms)
            Uom.delete(uoms)
        return cls.units_list()

    @classmethod
    def _check_uom_unused(cls, uoms):
        pool = Pool()
        ids = [u.id for u in uoms]
        checks = [('product.template', 'default_uom'),
            ('stock.move', 'unit'), ('sale.line', 'unit'),
            ('purchase.line', 'unit'), ('production.bom.input', 'unit')]
        with Transaction().set_context(active_test=False), \
                Transaction().set_user(0):
            for model, field in checks:
                try:
                    Model = pool.get(model)
                except KeyError:
                    continue
                found = Model.search([(field, 'in', ids)], limit=1)
                if found:
                    uom = getattr(found[0], field)
                    raise ValidationError(gettext(
                            'nline_js_inventory.msg_unit_used',
                            unit=uom.rec_name))

    @classmethod
    def conversions_list(cls, template=None):
        "The unit conversions of a part, or the general ones (no part)"
        Conversion = Pool().get('nline.js.unit_conversion')
        return [{
                'id': c.id,
                'from_uom': {'id': c.from_uom.id,
                    'rec_name': c.from_uom.rec_name},
                'from_name': c.from_name,
                'to_uom': {'id': c.to_uom.id,
                    'rec_name': c.to_uom.rec_name},
                'to_name': c.to_name,
                'factor': c.factor,
                'sentence': c.sentence,
                } for c in Conversion.search([
                    ('template', '=', int(template) if template else None)])]

    @classmethod
    def conversions_save(cls, values):
        """Save the rows of the Unit Conversions window (template empty) or
        tab. values: template, rows [{id, from_uom, to_uom, factor}],
        deleted [ids]"""
        pool = Pool()
        Conversion = pool.get('nline.js.unit_conversion')
        template = values.get('template')
        rows = values.get('rows', [])
        if any(not r.get('id') for r in rows):
            cls._check_create('nline.js.unit_conversion')
        if any(r.get('id') for r in rows) or values.get('deleted'):
            cls._check_write('nline.js.unit_conversion')
        to_create = []
        for row in rows:
            data = {
                'from_uom': int(row['from_uom']),
                'to_uom': int(row['to_uom']),
                'factor': float(row.get('factor') or 0),
                }
            if row.get('id'):
                Conversion.write([Conversion(int(row['id']))], data)
            else:
                data['template'] = int(template) if template else None
                to_create.append(data)
        if to_create:
            Conversion.create(to_create)
        if values.get('deleted'):
            Conversion.delete(Conversion.browse(
                    [int(i) for i in values['deleted']]))
        return cls.conversions_list(template)

    @classmethod
    def locations_list(cls):
        """The storage locations of the warehouse (Jobshop's Locations:
        ID = code, Description = name)"""
        warehouse = cls._js_warehouse()
        return [{
                'id': l.id,
                'code': l.code or '',
                'name': l.name,
                'warehouse': l.warehouse.rec_name if l.warehouse else '',
                'parent': l.parent.rec_name if l.parent else '',
                'inactive': not l.active,
                } for l in cls._js_storages(warehouse, active_test=False)]

    @classmethod
    def locations_save(cls, values):
        """Save the rows of the Locations window: storage locations under
        the warehouse's storage. values: rows [{id, code, name, inactive}],
        deleted [ids]"""
        pool = Pool()
        Location = pool.get('stock.location')
        ModelAccess = pool.get('ir.model.access')
        warehouse = cls._js_warehouse()
        rows = values.get('rows', [])
        if any(not r.get('id') for r in rows):
            cls._check_create('stock.location')
        if any(r.get('id') for r in rows):
            cls._check_write('stock.location')
        codes = set()
        for row in rows:
            code = (row.get('code') or '').strip()
            if not code:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_location_id_required'))
            if code in codes:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_location_id_unique',
                        location=code))
            codes.add(code)
        with Transaction().set_context(active_test=False):
            for row in rows:
                code = row['code'].strip()
                others = Location.search([('code', '=', code),
                        ('type', '=', 'storage'),
                        ('id', '!=', int(row.get('id') or -1))], limit=1)
                if others:
                    raise ValidationError(gettext(
                            'nline_js_inventory.msg_location_id_unique',
                            location=code))
                data = {
                    'code': code,
                    'name': (row.get('name') or '').strip() or code,
                    'active': not row.get('inactive'),
                    }
                if row.get('id'):
                    Location.write([Location(int(row['id']))], data)
                else:
                    data.update(type='storage',
                        parent=warehouse.storage_location.id)
                    Location.create([data])
        if values.get('deleted'):
            ModelAccess.check('stock.location', 'delete')
            locations = Location.browse([int(i) for i in values['deleted']])
            Move = pool.get('stock.move')
            for location in locations:
                if Move.search(['OR', ('from_location', '=', location.id),
                            ('to_location', '=', location.id)], limit=1):
                    raise ValidationError(gettext(
                            'nline_js_inventory.msg_location_used',
                            location=location.rec_name))
            Location.delete(locations)
        return cls.locations_list()
