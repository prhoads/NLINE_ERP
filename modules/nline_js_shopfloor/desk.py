# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The services of the Jobshop Shopfloor screens (js/jobshop/shopfloor.js):
Material Issues/Returns, Work Order Receipts/Returns, Shop Resources (where
used, reset operation costs), Employees, Labor Entry / Labor Reversal and
the Labor Data Collection terminal.  Every service checks the user's rights
first; the screens only offer what the user may do."""
import datetime as dt
import re
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.modules.nline_desk.desk import accept_warnings
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .labor import OPEN_STATES
from .resource import shop_center

ZERO = Decimal(0)
CENT = Decimal('0.01')
OPEN_MOVE_STATES = {'staging', 'draft', 'assigned'}
# Tryton's production states in Jobshop's words
WO_STATUS = {
    'request': 'Planned', 'draft': 'Unreleased', 'waiting': 'Released',
    'assigned': 'Released', 'running': 'Released', 'done': 'Closed',
    'cancelled': 'Cancelled',
    }
# Jobshop's statuses of the Reset Operation Costs dialog
JS_STATUS = {
    'unreleased': {'request', 'draft'}, 'firm': {'waiting'},
    'released': {'assigned', 'running'}, 'closed': {'done'},
    'cancelled': {'cancelled'},
    }

READS = [
    'sf_material_lines', 'sf_part_quantities', 'sf_part_transactions',
    'sf_receipt_lines', 'sf_resource_where_used', 'sf_employees',
    'sf_work_order_operations', 'sf_labor_tickets', 'sf_dc_employee',
    'sf_dc_tickets', 'sf_operation_lookup',
    ]
WRITES = [
    'sf_material_save', 'sf_receipt_save', 'sf_resource_setup',
    'sf_reset_operation_costs', 'sf_employees_save', 'sf_labor_post',
    'sf_labor_reverse', 'sf_dc_start', 'sf_dc_post', 'sf_dc_resume',
    'sf_dc_edit', 'sf_dc_delete', 'sf_dc_save', 'sf_clock',
    ]


def flt(value):
    return float(value or 0)


def dec(value):
    return Decimal(str(value or 0))


class DeskShopfloor(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in READS:
            cls.__rpc__[name] = RPC()
        for name in WRITES:
            cls.__rpc__[name] = RPC(readonly=False)

    # ---- helpers -----------------------------------------------------------

    @classmethod
    def _check_delete(cls, *models):
        ModelAccess = Pool().get('ir.model.access')
        for model in models:
            ModelAccess.check(model, 'delete')

    @classmethod
    def _timezone(cls):
        Company = Pool().get('company.company')
        company = Transaction().context.get('company')
        name = Company(company).timezone if company else None
        if name:
            try:
                from zoneinfo import ZoneInfo
                return ZoneInfo(name)
            except Exception:
                return None
        return None

    @classmethod
    def _to_utc(cls, text):
        """The UTC datetime of the screen's local 'YYYY-MM-DD HH:MM' (Tryton
        stores UTC)"""
        if not text:
            return None
        if isinstance(text, dt.datetime):
            return text
        text = str(text).strip().replace('T', ' ')
        value = None
        for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d']:
            try:
                value = dt.datetime.strptime(text[:19], fmt)
                break
            except ValueError:
                continue
        if value is None:
            raise ValidationError(gettext(
                    'nline_js_shopfloor.msg_bad_datetime', value=text))
        tz = cls._timezone()
        if tz:
            value = value.replace(tzinfo=tz).astimezone(
                dt.timezone.utc).replace(tzinfo=None)
        return value

    @classmethod
    def _local(cls, value):
        "The screen's 'YYYY-MM-DD HH:MM' of a UTC datetime"
        if not value:
            return None
        tz = cls._timezone()
        if tz:
            value = value.replace(tzinfo=dt.timezone.utc).astimezone(tz)
        return value.strftime('%Y-%m-%d %H:%M')

    @classmethod
    def _date(cls, text):
        if not text:
            return Pool().get('ir.date').today()
        if isinstance(text, dt.date):
            return text
        return dt.date.fromisoformat(str(text)[:10])

    @staticmethod
    def _sub(production):
        "Jobshop's Sub ID of a work order: its leg number (0 = the main one)"
        return getattr(production, 'leg_index', None) or 0

    @classmethod
    def _quantities(cls, location_ids, product_ids):
        Product = Pool().get('product.product')
        if not location_ids or not product_ids:
            return {}
        with Transaction().set_context(
                stock_date_end=Pool().get('ir.date').today()):
            return Product.products_by_location(list(location_ids),
                with_childs=True, grouping_filter=(list(product_ids),))

    @classmethod
    def _production(cls, production, open_only=True):
        Production = Pool().get('production')
        production = Production(production)
        if open_only and production.state not in OPEN_STATES:
            raise ValidationError(gettext(
                    'nline_desk.msg_work_order_not_open',
                    production=production.rec_name))
        return production

    # ---- Material Issues/Returns -------------------------------------------

    @classmethod
    def sf_material_lines(cls, production, options=None):
        """The material requirements of a work order for Material Issues:
        one row a material card (sequence, piece), its quantity due, issued
        to date and the stock of its location
        options: show_all, stocked_only, operation (seq #)"""
        cls._check_read('production', 'stock.move')
        options = options or {}
        production = cls._production(production, open_only=False)
        cards = {}
        for card in getattr(production, 'material_cards', []) or []:
            if card.move:
                cards[card.move.id] = card
        rows, by_product = {}, {}

        def row_for(move):
            card = cards.get(move.id)
            if card:
                key = (move.product.id, card.operation, card.piece)
            elif len(by_product.get(move.product.id, [])) == 1:
                key = by_product[move.product.id][0]
            else:
                key = (move.product.id, None, None)
            if key not in rows:
                rows[key] = {
                    'product': move.product.id,
                    'code': move.product.code or '',
                    'part': move.product.rec_name,
                    'description': move.product.template.name,
                    'sub': cls._sub(production),
                    'seq': key[1],
                    'piece': key[2],
                    'unit': move.unit.rec_name,
                    'due': 0.0,
                    'issued': 0.0,
                    'moves': [],
                    'location': None,
                    'location_name': '',
                    'stocked': move.product.type == 'goods' and getattr(
                        move.product.template, 'stocked', True) is not False,
                    'tracked': bool(getattr(move.product, 'lot_is_required',
                            None) and False),
                    'linked': False,
                    }
                by_product.setdefault(move.product.id, []).append(key)
            return rows[key]

        # The moves of a card first: a split move (no card) joins its card
        inputs = sorted(production.inputs,
            key=lambda m: (m.id not in cards, m.id))
        for move in inputs:
            if move.state == 'cancelled' or move.receipt_return:
                continue
            row = row_for(move)
            if move.state == 'done':
                row['issued'] += move.quantity
            else:
                row['due'] += move.quantity
                row['moves'].append(move.id)
                if not row['location']:
                    row['location'] = move.from_location.id
                    row['location_name'] = move.from_location.rec_name
            if not row['location'] and move.state == 'done':
                row['location'] = move.from_location.id
                row['location_name'] = move.from_location.rec_name
        for move in production.outputs:
            if move.material_return and move.state == 'done':
                keys = by_product.get(move.product.id)
                if keys:
                    rows[keys[0]]['issued'] -= move.quantity

        storage = production.warehouse.storage_location \
            if production.warehouse else None
        locations = {r['location'] for r in rows.values() if r['location']}
        if storage:
            locations.add(storage.id)
        products = {r['product'] for r in rows.values()}
        quantities = cls._quantities(locations, products)
        warehouse = production.warehouse.id if production.warehouse else None
        totals = cls._quantities([warehouse] if warehouse else [], products)
        result = []
        for row in rows.values():
            if not row['location'] and storage:
                row['location'] = storage.id
                row['location_name'] = storage.rec_name
            row['location_qty'] = quantities.get(
                (row['location'], row['product']), 0)
            row['on_hand'] = totals.get((warehouse, row['product']), 0)
            row['available'] = row['location_qty'] >= row['due'] > 0 or (
                row['due'] <= 0)
            row['status'] = 'Released' if row['due'] > 0 else 'Closed'
            row['due'] = round(row['due'], 4)
            row['issued'] = round(row['issued'], 4)
            if not options.get('show_all') and row['due'] <= 0:
                continue
            if options.get('stocked_only') and not row['stocked']:
                continue
            if options.get('operation') not in (None, '') and str(
                    row['seq']) != str(options['operation']):
                continue
            result.append(row)
        result.sort(key=lambda r: (r['seq'] is None, r['seq'] or 0,
                r['piece'] or 0, r['code']))
        return {
            'id': production.id,
            'number': production.number or str(production.id),
            'part': production.product.rec_name if production.product
            else '',
            'quantity': production.quantity,
            'state': production.state,
            'status': WO_STATUS.get(production.state, production.state),
            'open': production.state in OPEN_STATES,
            'operations': sorted({w.sequence for w in production.works
                    if w.sequence is not None}),
            'rows': result,
            }

    @classmethod
    @accept_warnings
    def sf_material_save(cls, values):
        """Issue (positive quantity) or return (negative quantity) the
        materials of a work order; Close Now cancels what is left to issue;
        a part not on the work order is added to it (issued on the fly)
        values: production, date, lines (product, moves, quantity, location,
        close_now)"""
        cls._check_create('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        Product = pool.get('product.product')
        Location = pool.get('stock.location')
        production = cls._production(values['production'])
        date = cls._date(values.get('date'))
        storage = production.warehouse.storage_location
        company = production.company
        to_do, to_cancel, returns = [], [], []
        issued = returned = 0
        for line in values.get('lines', []):
            quantity = flt(line.get('quantity'))
            product = Product(line['product'])
            location = Location(line['location']) if line.get('location') \
                else None
            moves = [Move(m) for m in line.get('moves') or []]
            moves = [m for m in moves if m.state in OPEN_MOVE_STATES
                and m.production_input == production]
            if quantity > 0:
                Move.draft([m for m in moves if m.state == 'assigned'])
                remaining = quantity
                for move in moves:
                    if remaining <= 0:
                        break
                    move = Move(move.id)
                    take = min(remaining, move.quantity)
                    if take < move.quantity:
                        Move.copy([move], {
                                'quantity': move.quantity - take,
                                })
                        move.quantity = take
                    if location:
                        move.from_location = location
                    move.effective_date = date
                    move.save()
                    moves = [m for m in moves if m.id != move.id]
                    to_do.append(move)
                    remaining -= take
                if remaining > 1e-9:
                    # Over the requirement, or not on the work order: a new
                    # material of the work order
                    move = Move(
                        product=product, unit=product.default_uom,
                        quantity=round(remaining, 4),
                        from_location=location or storage,
                        to_location=production.location,
                        production_input=production, company=company,
                        planned_date=date, effective_date=date)
                    move.save()
                    to_do.append(move)
                issued += 1
            elif quantity < 0:
                returns.append((product, -quantity, location))
            if line.get('close_now'):
                to_cancel.extend(Move(m.id) for m in moves
                    if m.state in OPEN_MOVE_STATES and m not in to_do)
        if not to_do and not returns and not to_cancel:
            raise ValidationError(gettext('nline_desk.msg_nothing_issued'))
        if to_do:
            Move.assign_try(to_do)
            Move.do(to_do)
        if to_cancel:
            Move.cancel(to_cancel)
        if returns:
            returned = len(cls._material_returns(production, returns, date))
        return {'issued': issued, 'returned': returned,
            'closed': len(to_cancel)}

    @classmethod
    def _material_returns(cls, production, returns, date):
        """Return issued materials to stock: an output of the production of
        the material, at the cost it was issued at"""
        pool = Pool()
        Move = pool.get('stock.move')
        Uom = pool.get('product.uom')
        moves = []
        for product, quantity, location in returns:
            done = [m for m in production.inputs if m.product == product
                and m.state == 'done' and not m.receipt_return]
            issued = sum(Uom.compute_qty(m.unit, m.quantity,
                    product.default_uom, round=False) for m in done)
            back = sum(Uom.compute_qty(m.unit, m.quantity,
                    product.default_uom, round=False)
                for m in production.outputs
                if m.product == product and m.material_return
                and m.state == 'done')
            if quantity > issued - back + 1e-9:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_return_over_issued',
                        product=product.rec_name,
                        issued=round(issued - back, 4)))
            value = sum((Decimal(str(Uom.compute_qty(m.unit, m.quantity,
                            product.default_uom, round=False)))
                    * (m.cost_price or product.cost_price or ZERO)
                    for m in done), ZERO)
            cost = (value / Decimal(str(issued))) if issued else (
                product.cost_price or ZERO)
            source = location or (done[0].from_location if done
                else production.warehouse.storage_location)
            moves.append(Move(
                    product=product, unit=product.default_uom,
                    quantity=quantity,
                    from_location=production.location,
                    to_location=source,
                    production_output=production,
                    company=production.company,
                    unit_price=cost.quantize(Decimal('0.0001')),
                    currency=production.company.currency,
                    planned_date=date, effective_date=date,
                    material_return=True))
        Move.save(moves)
        Move.do(moves)
        return moves

    @classmethod
    def sf_part_quantities(cls, product):
        """The stock of a part by location (the Inventory Pieces / Location
        quantities view of the material issue)"""
        cls._check_read('stock.move')
        pool = Pool()
        Location = pool.get('stock.location')
        Product = pool.get('product.product')
        product = Product(product)
        storages = Location.search([('type', '=', 'storage')])
        quantities = cls._quantities([l.id for l in storages], [product.id])
        rows = []
        for location in storages:
            qty = quantities.get((location.id, product.id), 0)
            if qty:
                rows.append({'location': location.rec_name, 'quantity': qty,
                        'unit': product.default_uom.rec_name})
        return {'part': product.rec_name, 'rows': rows,
            'total': sum(r['quantity'] for r in rows)}

    @classmethod
    def sf_part_transactions(cls, product, limit=200):
        "The inventory transactions of a part, newest first"
        cls._check_read('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        moves = Move.search([
                ('product', '=', product),
                ('state', '=', 'done'),
                ], order=[('effective_date', 'DESC'), ('id', 'DESC')],
            limit=limit)
        rows = []
        for move in moves:
            if move.production_input:
                kind, doc = 'Issue', move.production_input.rec_name
            elif move.production_output:
                kind = 'Return' if move.material_return else 'Receipt'
                doc = move.production_output.rec_name
            elif move.shipment:
                kind, doc = 'Shipment', move.shipment.rec_name
            else:
                kind, doc = 'Adjustment', move.origin.rec_name \
                    if move.origin else ''
            rows.append({
                    'date': move.effective_date,
                    'type': kind,
                    'document': doc,
                    'from': move.from_location.rec_name,
                    'to': move.to_location.rec_name,
                    'quantity': move.quantity,
                    'unit': move.unit.rec_name,
                    'cost': move.cost_price,
                    })
        return rows

    # ---- Work Order Receipts/Returns -----------------------------------------

    @classmethod
    def _received(cls, production):
        "The quantity of the part received from the work order (net)"
        pool = Pool()
        Uom = pool.get('product.uom')
        unit = production.unit
        out = sum(Uom.compute_qty(m.unit, m.quantity, unit, round=False)
            for m in production.outputs
            if m.product == production.product and m.state == 'done'
            and not m.material_return)
        back = sum(Uom.compute_qty(m.unit, m.quantity, unit, round=False)
            for m in production.inputs
            if m.receipt_return and m.state == 'done')
        return round(out - back, 4)

    @classmethod
    def sf_receipt_lines(cls, options=None):
        """The work orders to receive (open) or to return to the shop floor
        (previously received)
        options: mode (open|received), exclude_linked, exclude_incomplete"""
        cls._check_read('production', 'stock.move')
        Production = Pool().get('production')
        options = options or {}
        received_mode = options.get('mode') == 'received'
        if received_mode:
            domain = [('state', 'in', ['running', 'done']),
                ('outputs.state', '=', 'done')]
        else:
            domain = [('state', 'in', list(OPEN_STATES))]
        productions = Production.search(domain,
            order=[('planned_date', 'ASC'), ('id', 'ASC')], limit=500)
        rows, locations, products = [], set(), set()
        for production in productions:
            if not production.product:
                continue
            received = cls._received(production)
            if received_mode and received <= 0:
                continue
            origin = production.origin
            linked = 0.0
            if origin and origin.__name__ == 'sale.line':
                linked = min(origin.quantity or 0, production.quantity or 0)
            fully_linked = bool(production.quantity) and \
                linked >= production.quantity
            if options.get('exclude_linked') and fully_linked:
                continue
            completed = all(w.operation_closed or w.state in {'finished',
                    'done'} for w in production.works)
            if options.get('exclude_incomplete') and not completed:
                continue
            outputs = [m for m in production.outputs
                if m.product == production.product
                and not m.material_return and m.state != 'cancelled']
            location = outputs[0].to_location if outputs else (
                production.warehouse.storage_location)
            remaining = max((production.quantity or 0) - received, 0)
            rows.append({
                    'id': production.id,
                    'number': production.number or str(production.id),
                    'sub': cls._sub(production),
                    'product': production.product.id,
                    'part': production.product.rec_name,
                    'description': production.product.template.name,
                    'desired': production.quantity,
                    'linked': linked,
                    'received': received,
                    'quantity': received if received_mode else remaining,
                    'unit': production.unit.rec_name,
                    'location': location.id,
                    'location_name': location.rec_name,
                    'state': production.state,
                    'status': WO_STATUS.get(production.state,
                        production.state),
                    'completed': completed,
                    'for_return': received_mode,
                    'can_return': production.state == 'running'
                    and received > 0,
                    'tracked': False,
                    'origin': origin.rec_name if origin else '',
                    })
            locations.add(location.id)
            products.add(production.product.id)
        quantities = cls._quantities(locations, products)
        for row in rows:
            row['available'] = quantities.get(
                (row['location'], row['product']), 0)
        return rows

    @classmethod
    def _finish_works(cls, production):
        """The operations of a work order closed by its receipt: N-Line's
        finish (nline_wip: the planned time) or an empty cycle"""
        pool = Pool()
        Work = pool.get('production.work')
        Cycle = pool.get('production.work.cycle')
        works = [w for w in production.works
            if w.state not in {'finished', 'done'}]
        if not works:
            return
        if hasattr(Work, 'finish'):
            Work.finish(works)
            return
        running = [c for w in works for c in w.cycles if c.state == 'running']
        if running:
            Cycle.do(running)
        empty = [Cycle(work=w, duration=dt.timedelta(), cost=ZERO)
            for w in works if not any(c.state == 'running' for c in w.cycles)]
        Cycle.save(empty)
        Cycle.run(empty)
        Cycle.do(empty)

    @classmethod
    def _start(cls, production):
        "Start the work order (Tryton issues its remaining materials)"
        Production = Pool().get('production')
        if production.state == 'waiting':
            Production.assign_try([production])
            production = Production(production.id)
        if production.state == 'waiting':
            # As the material issues: the stock may go negative
            Production.assign([production])
            production = Production(production.id)
        if production.state == 'assigned':
            Production.run([production])
            production = Production(production.id)
        return production

    @classmethod
    @accept_warnings
    def sf_receipt_save(cls, values):
        """Receive work orders to stock (a partial quantity, to completion,
        or closed short) and return received parts to the shop floor
        values: date, lines (production, quantity, location, close_short,
        return)"""
        cls._check_create('stock.move')
        pool = Pool()
        Production = pool.get('production')
        Move = pool.get('stock.move')
        Location = pool.get('stock.location')
        Uom = pool.get('product.uom')
        date = cls._date(values.get('date'))
        result = []
        for line in values.get('lines', []):
            production = cls._production(line['production'])
            quantity = flt(line.get('quantity'))
            location = Location(line['location']) if line.get('location') \
                else None
            if line.get('return'):
                cls._receipt_return(production, quantity, location, date)
                result.append({'id': production.id, 'state':
                        Production(production.id).state})
                continue
            if quantity <= 0 and not line.get('close_short'):
                continue
            production = cls._start(production)
            outputs = [m for m in production.outputs
                if m.product == production.product
                and not m.material_return
                and m.state in OPEN_MOVE_STATES]
            Move.draft([m for m in outputs if m.state == 'assigned'])
            outputs = [Move(m.id) for m in outputs]
            remaining = sum(Uom.compute_qty(m.unit, m.quantity,
                    production.unit, round=False) for m in outputs)
            if location:
                for move in outputs:
                    move.to_location = location
            if quantity + 1e-9 >= remaining or line.get('close_short'):
                # To completion (or closed short): the work order is done
                left = quantity
                for move in outputs:
                    qty = Uom.compute_qty(production.unit, left, move.unit)
                    if move is outputs[-1]:
                        move.quantity = max(qty, 0)
                    else:
                        move.quantity = min(move.quantity, max(qty, 0))
                    left -= Uom.compute_qty(move.unit, move.quantity,
                        production.unit, round=False)
                    move.effective_date = date
                Move.save(outputs)
                Move.cancel([m for m in outputs if not m.quantity])
                if not outputs:
                    output = Move(product=production.product,
                        unit=production.unit, quantity=quantity,
                        from_location=production.location,
                        to_location=location
                        or production.warehouse.storage_location,
                        production_output=production,
                        company=production.company,
                        unit_price=ZERO,
                        currency=production.company.currency,
                        effective_date=date)
                    output.save()
                cls._finish_works(production)
                Production.done([Production(production.id)])
            else:
                # A partial receipt: that much of the output is done now,
                # at the cost so far (Tryton prices it again when done)
                move = outputs[0]
                qty = Uom.compute_qty(production.unit, quantity, move.unit)
                if qty < move.quantity:
                    Move.copy([move], {'quantity': move.quantity - qty})
                    move.quantity = qty
                cost = production.cost
                per_unit = cost / dec(production.quantity) \
                    if production.quantity else ZERO
                move.unit_price = Uom.compute_price(production.unit,
                    per_unit, move.unit).quantize(Decimal('0.0001'))
                move.currency = production.company.currency
                move.effective_date = date
                move.save()
                Move.do([move])
            production = Production(production.id)
            result.append({'id': production.id, 'state': production.state,
                    'received': cls._received(production)})
        if not result:
            raise ValidationError(gettext(
                    'nline_js_shopfloor.msg_nothing_received'))
        return result

    @classmethod
    def _receipt_return(cls, production, quantity, location, date):
        """Return received parts from stock to their open work order: an
        input of the part, and as much more to receive again"""
        pool = Pool()
        Move = pool.get('stock.move')
        if production.state != 'running':
            raise ValidationError(gettext(
                    'nline_js_shopfloor.msg_return_not_running',
                    production=production.rec_name))
        received = cls._received(production)
        if quantity <= 0 or quantity > received + 1e-9:
            raise ValidationError(gettext(
                    'nline_js_shopfloor.msg_return_over_received',
                    production=production.rec_name, received=received))
        source = location or production.warehouse.storage_location
        back = Move(product=production.product, unit=production.unit,
            quantity=quantity, from_location=source,
            to_location=production.location, production_input=production,
            company=production.company, effective_date=date,
            planned_date=date, receipt_return=True)
        back.save()
        Move.do([back])
        outputs = [m for m in production.outputs
            if m.product == production.product and not m.material_return
            and m.state == 'draft']
        if outputs:
            outputs[0].quantity += quantity
            outputs[0].save()
        else:
            Move(product=production.product, unit=production.unit,
                quantity=quantity, from_location=production.location,
                to_location=source, production_output=production,
                company=production.company, unit_price=ZERO,
                currency=production.company.currency,
                planned_date=date).save()
        return back

    # ---- Shop Resources -----------------------------------------------------

    @classmethod
    def sf_resource_setup(cls, center):
        """After a resource is saved: like the migrated ones, a category of
        its name (the routing operations look for it) under the shop"""
        cls._check_write('production.work.center')
        pool = Pool()
        WorkCenter = pool.get('production.work.center')
        Category = pool.get('production.work.center.category')
        center = WorkCenter(center)
        shop = shop_center()
        values = {}
        if not center.category and center.resource_type != 'group':
            categories = Category.search([('name', '=', center.name)],
                limit=1)
            category = categories[0] if categories else Category(
                name=center.name)
            category.save()
            values['category'] = category.id
        if shop and shop != center and not center.parent:
            values['parent'] = shop.id
        if values:
            WorkCenter.write([center], values)
        return True

    @classmethod
    def _master_steps(cls, centers):
        """The routing steps (master operations) of the resources: the
        step's resource (engineering area), else the operation's category"""
        Step = Pool().get('production.routing.step')
        ids = [c.id for c in centers]
        categories = [c.category.id for c in centers if c.category]
        domain = ['OR']
        if 'resource' in Step._fields:
            domain.append(('resource', 'in', ids))
            if categories:
                domain.append([('resource', '=', None),
                        ('operation.work_center_category', 'in',
                            categories)])
        elif categories:
            domain.append(('operation.work_center_category', 'in',
                    categories))
        if len(domain) == 1:
            return []
        steps = Step.search(domain,
            order=[('routing', 'ASC'), ('sequence', 'ASC')])
        # A work order's own copy of the operations is a work order's
        return [s for s in steps if not getattr(s.routing, 'work_order',
                False)]

    @staticmethod
    def _master_type(step):
        boms = step.routing.boms
        if boms and all(getattr(b, 'master_type', None) == 'quote'
                for b in boms):
            return 'quote'
        return 'engineering'

    @classmethod
    def sf_resource_where_used(cls, center, options=None):
        """The quote masters, engineering masters and work orders that use a
        resource (View > Where Used)
        options: quotes, masters, work_orders (default all)"""
        cls._check_read('production.work.center')
        pool = Pool()
        WorkCenter = pool.get('production.work.center')
        Work = pool.get('production.work')
        options = options or {}
        center = WorkCenter(center)
        rows = []
        for step in cls._master_steps([center]):
            kind = cls._master_type(step)
            if not options.get('quotes' if kind == 'quote' else 'masters',
                    True):
                continue
            rows.append({
                    'type': 'Quote Master' if kind == 'quote'
                    else 'Engineering Master',
                    'id': step.routing.id,
                    'model': 'production.routing',
                    'document': ', '.join(b.rec_name
                        for b in step.routing.boms) or step.routing.rec_name,
                    'part': ', '.join(o.product.rec_name
                        for b in step.routing.boms for o in b.outputs),
                    'seq': step.sequence,
                    'operation': step.operation.rec_name,
                    'status': '',
                    })
        if options.get('work_orders', True):
            for work in Work.search([
                        ('work_center', '=', center.id),
                        ('production.state', '!=', 'cancelled'),
                        ], order=[('production', 'DESC'),
                        ('sequence', 'ASC')], limit=500):
                production = work.production
                rows.append({
                        'type': 'Work Order',
                        'id': production.id,
                        'model': 'production',
                        'document': production.number or str(production.id),
                        'part': production.product.rec_name
                        if production.product else '',
                        'seq': work.sequence,
                        'operation': work.rec_name,
                        'status': WO_STATUS.get(production.state,
                            production.state),
                        })
        return {'resource': center.name, 'rows': rows}

    # The resource's costs -> the operation card's (engineering area)
    OPERATION_COSTS = {
        'setup_per_hr': 'setup_cost_hour',
        'run_per_hr': 'run_cost_hour',
        'run_per_unit': 'run_cost_unit',
        'bur_per_hr_setup': 'setup_burden_hour',
        'bur_per_hr_run': 'run_burden_hour',
        'bur_per_unit_run': 'burden_unit',
        'bur_per_oper': 'burden_operation',
        'bur_percent_setup': 'setup_burden_percent',
        'bur_percent_run': 'run_burden_percent',
        }

    @classmethod
    def _reset_costs(cls, Model, records, center_of):
        "Copy the resource's costs to the operations; the number changed"
        fields_ = {k: v for k, v in cls.OPERATION_COSTS.items()
            if v in Model._fields}
        changed = []
        for record in records:
            center = center_of(record)
            if not center or not fields_:
                continue
            dirty = False
            for source, target in fields_.items():
                value = getattr(center, source)
                if Model._fields[target]._type == 'float':
                    value = float(value) if value is not None else None
                if getattr(record, target) != value:
                    setattr(record, target, value)
                    dirty = True
            if dirty:
                changed.append(record)
        Model.save(changed)
        if hasattr(Model, 'reset_operation_costs'):
            Model.reset_operation_costs(records)
        return len(changed) if fields_ else len(records)

    @classmethod
    def sf_reset_operation_costs(cls, values):
        """Tools > Reset Operation Info: the operations of the resources
        (quote masters, engineering masters, work orders, by status, by
        creation date) take the resource's current costs, and the Tryton
        rate of the resource is its run cost plus run burden an hour
        values: resource (none: all), quotes, masters, work_orders,
        statuses (unreleased, firm, released, closed, cancelled),
        from_date, to_date"""
        cls._check_write('production.work.center')
        pool = Pool()
        WorkCenter = pool.get('production.work.center')
        Work = pool.get('production.work')
        Step = pool.get('production.routing.step')
        if values.get('resource'):
            centers = [WorkCenter(values['resource'])]
        else:
            centers = WorkCenter.search([])
        updated = 0
        for center in centers:
            rate = (center.run_per_hr or ZERO) + (center.bur_per_hr_run
                or ZERO)
            if rate and (center.cost_price != rate
                    or center.cost_method != 'hour'):
                center.cost_price = rate
                center.cost_method = 'hour'
                updated += 1
        WorkCenter.save(centers)
        ids = [c.id for c in centers]
        from_date = to_date = None
        if values.get('from_date'):
            from_date = dt.datetime.combine(cls._date(values['from_date']),
                dt.time())
        if values.get('to_date'):
            to_date = dt.datetime.combine(cls._date(values['to_date'])
                + dt.timedelta(days=1), dt.time())
        works = steps = 0
        if values.get('work_orders', True):
            domain = [('work_center', 'in', ids)]
            states = set()
            for status in values.get('statuses') or []:
                states |= JS_STATUS.get(status, set())
            if states:
                domain.append(('production.state', 'in', list(states)))
            else:
                # A closed work order keeps the costs it was made with
                domain.append(('production.state', 'not in',
                        ['done', 'cancelled']))
            if from_date:
                domain.append(('production.create_date', '>=', from_date))
            if to_date:
                domain.append(('production.create_date', '<', to_date))
            records = Work.search(domain)
            works = cls._reset_costs(Work, records,
                lambda w: w.work_center)
        kinds = set()
        if values.get('masters', True):
            kinds.add('engineering')
        if values.get('quotes', True):
            kinds.add('quote')
        if kinds:
            by_category = {c.category.id: c for c in centers if c.category}
            records = [s for s in cls._master_steps(centers)
                if cls._master_type(s) in kinds
                and (not from_date or s.routing.create_date >= from_date)
                and (not to_date or s.routing.create_date < to_date)]

            def center_of(step):
                resource = getattr(step, 'resource', None)
                if resource:
                    return resource
                category = step.operation.work_center_category
                return by_category.get(category.id) if category else None
            steps = cls._reset_costs(Step, records, center_of)
        return {'resources': updated, 'work_orders': works, 'masters': steps}

    # ---- Employees ----------------------------------------------------------

    EMPLOYEE_FIELDS = ['clock_no', 'shift_no', 'department', 'title',
        'cost_per_hr', 'setup_cost_per_hr', 'run_cost_per_hr',
        'cost_per_unit', 'bur_per_hr_setup', 'bur_per_hr_run',
        'bur_per_unit_run', 'bur_percent_setup', 'bur_percent_run',
        'start_date', 'end_date', 'inactive']
    EMPLOYEE_COSTS = {'cost_per_hr', 'setup_cost_per_hr', 'run_cost_per_hr',
        'cost_per_unit', 'bur_per_hr_setup', 'bur_per_hr_run',
        'bur_per_unit_run', 'bur_percent_setup', 'bur_percent_run'}

    @classmethod
    def sf_employees(cls, show_inactive=True):
        "The Employees table: one row an employee"
        cls._check_read('company.employee')
        pool = Pool()
        Employee = pool.get('company.employee')
        Ticket = pool.get('nline.js.labor_ticket')
        company = Transaction().context.get('company')
        domain = [('company', '=', company)]
        if not show_inactive:
            domain.append(('inactive', '=', False))
        employees = Employee.search(domain,
            order=[('clock_no', 'ASC NULLS LAST'), ('id', 'ASC')])
        with_labor = {t.employee.id for t in Ticket.search([
                    ('employee', 'in', [e.id for e in employees]),
                    ])}
        rows = []
        for employee in employees:
            row = {'id': employee.id, 'name': employee.party.name,
                'party': employee.party.id,
                'has_labor': employee.id in with_labor}
            for name in cls.EMPLOYEE_FIELDS:
                row[name] = getattr(employee, name)
            rows.append(row)
        return rows

    @classmethod
    def sf_employees_save(cls, values):
        """Save the Employees table: new rows (a person and an employee),
        changed rows, deleted rows (refused when they have labor)
        values: rows (id or none, name, clock_no...), delete (ids)"""
        pool = Pool()
        Employee = pool.get('company.employee')
        Party = pool.get('party.party')
        company = Transaction().context.get('company')
        rows = values.get('rows') or []
        deleted = values.get('delete') or []
        if any(not r.get('id') for r in rows):
            cls._check_create('company.employee', 'party.party')
        if any(r.get('id') for r in rows):
            cls._check_write('company.employee')
        if deleted:
            cls._check_delete('company.employee')
        to_save = []
        for row in rows:
            if row.get('id'):
                employee = Employee(row['id'])
                name = (row.get('name') or '').strip()
                if name and name != employee.party.name:
                    cls._check_write('party.party')
                    party = employee.party
                    party.name = name
                    party.save()
            else:
                name = (row.get('name') or row.get('clock_no') or ''
                    ).strip()
                if not name:
                    continue
                party = Party(name=name)
                party.save()
                employee = Employee(party=party, company=company)
            for field in cls.EMPLOYEE_FIELDS:
                if field not in row:
                    continue
                value = row[field]
                if field in cls.EMPLOYEE_COSTS:
                    value = dec(value) if value not in (None, '') else None
                elif field in {'start_date', 'end_date'}:
                    value = cls._date(value) if value else None
                elif field == 'clock_no':
                    value = (value or '').strip() or None
                setattr(employee, field, value)
            to_save.append(employee)
        Employee.save(to_save)
        if deleted:
            Employee.delete(Employee.browse(deleted))
        return {'saved': len(to_save), 'deleted': len(deleted)}

    # ---- Labor -----------------------------------------------------------------

    @classmethod
    def sf_work_order_operations(cls, production):
        """A work order's operations for labor (Sub/Seq): status, operation
        quantity, completed quantity, hours"""
        cls._check_read('production')
        production = cls._production(production, open_only=False)
        works = []
        for work in sorted(production.works,
                key=lambda w: (w.sequence or 0, w.id)):
            works.append({
                    'id': work.id,
                    'sub': cls._sub(production),
                    'seq': work.sequence,
                    'name': work.operation.rec_name if work.operation
                    else work.rec_name,
                    'resource': work.work_center.name if work.work_center
                    else '',
                    'resource_id': work.work_center.id if work.work_center
                    else None,
                    'state': work.state,
                    'closed': work.operation_closed,
                    'setup_completed': work.setup_completed,
                    'run_completed': work.run_completed,
                    'operation_qty': work.operation_quantity,
                    'completed_qty': work.completed_quantity,
                    'deviated_qty': work.deviated_quantity,
                    'setup_hours': round(work.setup_hours or 0, 2),
                    'run_hours': round(work.run_hours or 0, 2),
                    'instructions': work.work_center.special_instructions
                    if work.work_center else None,
                    })
        return {
            'id': production.id,
            'number': production.number or str(production.id),
            'sub': cls._sub(production),
            'part': production.product.rec_name if production.product
            else '',
            'quantity': production.quantity,
            'state': production.state,
            'status': WO_STATUS.get(production.state, production.state),
            'open': production.state in OPEN_STATES,
            'works': works,
            }

    @classmethod
    def _ticket_row(cls, ticket):
        production = ticket.production
        return {
            'id': ticket.id,
            'state': ticket.state,
            'employee': ticket.employee.id if ticket.employee else None,
            'clock_no': ticket.employee.clock_no if ticket.employee else '',
            'name': ticket.employee.party.name if ticket.employee else '',
            'shift_no': ticket.shift_no,
            'shift_type': ticket.shift_type,
            'type': ticket.type,
            'production': production.id if production else None,
            'number': (production.number or str(production.id))
            if production else '',
            'sub': cls._sub(production) if production else None,
            'work': ticket.work.id if ticket.work else None,
            'seq': ticket.work.sequence if ticket.work else None,
            'operation': ticket.work.operation.rec_name
            if ticket.work and ticket.work.operation else '',
            'resource': ticket.resource.name if ticket.resource else '',
            'resource_id': ticket.resource.id if ticket.resource else None,
            'transaction_date': cls._local(ticket.transaction_date),
            'clock_in': cls._local(ticket.clock_in),
            'clock_out': cls._local(ticket.clock_out),
            'hours': ticket.hours_worked,
            'labor_percent': ticket.labor_percent,
            'completed_qty': ticket.completed_qty,
            'deviated_qty': ticket.deviated_qty,
            'operation_qty': ticket.work.operation_quantity
            if ticket.work else None,
            'operation_completed_qty': ticket.work.completed_quantity
            if ticket.work else None,
            'reason_code': ticket.reason_code.id if ticket.reason_code
            else None,
            'reason': ticket.reason_code.rec_name if ticket.reason_code
            else '',
            'description': ticket.description or '',
            'completed': bool(ticket.completed),
            'reversing': bool(ticket.reversing),
            'reversed': bool(ticket.reversed),
            'labor_cost': ticket.labor_cost,
            'burden_cost': ticket.burden_cost,
            }

    @classmethod
    def _new_ticket(cls, state):
        "A new ticket with its defaults and every other field empty"
        Ticket = Pool().get('nline.js.labor_ticket')
        values = {n: None for n in Ticket._fields
            if n not in {'id', 'reversed', 'create_uid', 'create_date',
                'write_uid', 'write_date', 'rec_name'}
            and not getattr(Ticket._fields[n], 'getter', None)}
        values.update(Ticket.default_get(list(values), with_rec_name=False))
        values['state'] = state
        return Ticket(**values)

    @classmethod
    def _ticket_values(cls, ticket, values):
        "Set the ticket from the screen's values"
        pool = Pool()
        Employee = pool.get('company.employee')
        Work = pool.get('production.work')
        Reason = pool.get('nline.reason_code')
        WorkCenter = pool.get('production.work.center')
        if 'employee' in values:
            ticket.employee = Employee(values['employee']) \
                if values['employee'] else None
            if ticket.employee and values.get('shift_no') in (None, ''):
                ticket.shift_no = ticket.employee.shift_no
        for name in ['shift_type', 'type']:
            if values.get(name):
                setattr(ticket, name, values[name])
        if values.get('shift_no') not in (None, ''):
            ticket.shift_no = int(values['shift_no'])
        if 'resource' in values:
            ticket.resource = WorkCenter(values['resource']) \
                if values['resource'] else None
        if 'work' in values:
            ticket.set_operation(Work(values['work'])
                if values['work'] else None)
        for name in ['clock_in', 'clock_out', 'transaction_date']:
            if name in values:
                setattr(ticket, name, cls._to_utc(values[name]))
        if values.get('hours') not in (None, ''):
            ticket.hours_worked = flt(values['hours'])
        elif 'clock_in' in values or 'clock_out' in values:
            ticket.hours_worked = None
        for name, field in [('labor_percent', 'labor_percent'),
                ('completed_qty', 'completed_qty'),
                ('deviated_qty', 'deviated_qty')]:
            if name in values:
                setattr(ticket, field, flt(values[name])
                    if values[name] not in (None, '') else None)
        if 'reason_code' in values:
            ticket.reason_code = Reason(values['reason_code']) \
                if values['reason_code'] else None
        if 'description' in values:
            ticket.description = values['description'] or None
        if 'completed' in values:
            ticket.completed = bool(values['completed'])
        if ticket.type == 'setup':
            ticket.completed_qty = None
        if ticket.type == 'indirect':
            ticket.production = ticket.work = None
            ticket.completed_qty = ticket.deviated_qty = None

    @classmethod
    @accept_warnings
    def sf_labor_post(cls, values):
        """Labor Entry: post a labor ticket (saved at once, costed)
        values: employee, shift_no, shift_type, type, work, clock_in,
        clock_out, hours, labor_percent, completed_qty, deviated_qty,
        reason_code, description, completed"""
        cls._check_create('nline.js.labor_ticket', 'production.work.cycle')
        Ticket = Pool().get('nline.js.labor_ticket')
        ticket = cls._new_ticket('posted')
        cls._ticket_values(ticket, values)
        ticket.compute_hours()
        if ticket.hours_worked is None or ticket.hours_worked < 0:
            raise ValidationError(gettext('nline_desk.msg_labor_hours'))
        ticket.check_open()
        ticket.save()
        Ticket.save_tickets([ticket])
        return cls._ticket_row(Ticket(ticket.id))

    @classmethod
    @accept_warnings
    def labor_entry(cls, values):
        """Post a labor ticket of hours on an operation (the earlier Labor
        Entry): now a Jobshop labor ticket, costed as Jobshop does when the
        rates are set, at the work center's rate otherwise
        values: work, hours (and the sf_labor_post values)"""
        cls._check_create('production.work.cycle')
        hours = flt(values.get('hours'))
        if hours <= 0 and not (values.get('clock_in')
                and values.get('clock_out')):
            raise ValidationError(gettext('nline_desk.msg_labor_hours'))
        row = cls.sf_labor_post(dict(values, type=values.get('type') or 'run'))
        Ticket = Pool().get('nline.js.labor_ticket')
        ticket = Ticket(row['id'])
        cycle = ticket.cycle
        return {'id': cycle.id if cycle else None,
            'cost': cycle.cost if cycle else ticket.labor_cost,
            'hours': ticket.hours_worked, 'ticket': ticket.id}

    @classmethod
    def _ticket_domain(cls, options):
        options = options or {}
        domain = []
        kind = options.get('kind') or 'all'
        if kind == 'employee' and options.get('employee'):
            domain.append(('employee', '=', options['employee']))
        elif kind == 'work_order' and options.get('production'):
            domain.append(('production', '=', options['production']))
        elif kind == 'resource' and options.get('resource'):
            domain.append(('resource', '=', options['resource']))
        if options.get('from_date'):
            domain.append(('transaction_date', '>=', cls._to_utc(
                        str(cls._date(options['from_date'])))))
        if options.get('to_date'):
            domain.append(('transaction_date', '<', cls._to_utc(str(
                        cls._date(options['to_date'])
                        + dt.timedelta(days=1)))))
        return domain

    @classmethod
    def sf_labor_tickets(cls, options=None):
        """The saved labor tickets for Labor Reversal
        options: kind (all|employee|work_order|resource), employee,
        production, resource, from_date, to_date, limit"""
        cls._check_read('nline.js.labor_ticket')
        Ticket = Pool().get('nline.js.labor_ticket')
        options = options or {}
        domain = [('state', '=', 'saved')] + cls._ticket_domain(options)
        tickets = Ticket.search(domain, limit=options.get('limit') or 500)
        return [cls._ticket_row(t) for t in tickets]

    @classmethod
    def sf_labor_reverse(cls, ids):
        "Reverse saved labor tickets"
        cls._check_create('nline.js.labor_ticket', 'production.work.cycle')
        Ticket = Pool().get('nline.js.labor_ticket')
        reversals = Ticket.reverse(Ticket.browse(ids))
        return [cls._ticket_row(t) for t in reversals]

    # ---- Labor Data Collection -------------------------------------------------

    @classmethod
    def sf_dc_employee(cls, clock_no):
        """The employee of a clock number (typed or scanned) and whether
        they are clocked in"""
        cls._check_read('company.employee')
        pool = Pool()
        Employee = pool.get('company.employee')
        Time = pool.get('nline.js.employee_time')
        company = Transaction().context.get('company')
        text = str(clock_no or '').strip().strip('*')
        employees = []
        if text:
            employees = Employee.search([
                    ('company', '=', company),
                    ('clock_no', 'ilike', text),
                    ('inactive', '=', False),
                    ], limit=1)
            if not employees and text.isdigit():
                employees = Employee.search([
                        ('company', '=', company),
                        ('id', '=', int(text)),
                        ], limit=1)
        if not employees:
            return None
        employee, = employees
        times = Time.search([
                ('employee', '=', employee.id),
                ('clock_out', '=', None),
                ], limit=1)
        return {
            'id': employee.id,
            'clock_no': employee.clock_no or '',
            'name': employee.party.name,
            'shift_no': employee.shift_no,
            'clocked_in': cls._local(times[0].clock_in) if times else None,
            }

    @classmethod
    def sf_dc_tickets(cls, options=None):
        """The terminal's table: the labor not saved yet (in progress,
        suspended, post on save)
        options: kind (employee|work_order|resource|date|all), employee,
        production, resource, from_date, to_date"""
        cls._check_read('nline.js.labor_ticket')
        Ticket = Pool().get('nline.js.labor_ticket')
        options = dict(options or {})
        if options.get('kind') == 'date':
            options['kind'] = 'all'
            options.setdefault('to_date', options.get('from_date'))
        domain = [('state', 'in', ['active', 'suspended', 'posted'])]
        domain += cls._ticket_domain(options)
        tickets = Ticket.search(domain, order=[('employee', 'ASC'),
                ('id', 'ASC')])
        return [cls._ticket_row(t) for t in tickets]

    @classmethod
    def sf_operation_lookup(cls, code):
        """The operation of a traveler's bar code: <work order>/<seq>, or
        <work order>/<sub>/<seq> (Jobshop's Work/Lot/Split/Sub/Seq)"""
        cls._check_read('production')
        Production = Pool().get('production')
        text = str(code or '').strip().strip('*').strip()
        if not text:
            return None
        parts = [p for p in re.split(r'[/|\s]+', text) if p]
        number, sub, seq = parts[0], None, None
        if len(parts) >= 3:
            sub, seq = parts[-2], parts[-1]
        elif len(parts) == 2:
            seq = parts[1]
        productions = Production.search([('number', '=', number)], limit=1)
        if not productions and number.isdigit():
            productions = Production.search([('id', '=', int(number))],
                limit=1)
        if not productions:
            return None
        production, = productions
        if sub not in (None, '', '0') and 'leg_index' in Production._fields:
            legs = Production.search([
                    ('parent', 'child_of', [production.id], 'parent'),
                    ('leg_index', '=', int(sub)),
                    ], limit=1)
            if legs:
                production = legs[0]
        work = None
        if seq is not None:
            for candidate in production.works:
                if str(candidate.sequence) == str(seq).lstrip('0') or str(
                        candidate.sequence) == str(seq):
                    work = candidate
                    break
        return {
            'production': production.id,
            'number': production.number or str(production.id),
            'sub': cls._sub(production),
            'work': work.id if work else None,
            'seq': work.sequence if work else None,
            'open': production.state in OPEN_STATES,
            }

    @classmethod
    def sf_dc_start(cls, values):
        """Start labor on an operation (clock in): a ticket in progress and
        the operation's cycle running
        values: employee, work (or code), type, shift_no, shift_type,
        clock_in"""
        cls._check_create('nline.js.labor_ticket', 'production.work.cycle')
        Ticket = Pool().get('nline.js.labor_ticket')
        values = dict(values)
        if not values.get('work') and values.get('code'):
            found = cls.sf_operation_lookup(values['code'])
            values['work'] = found and found['work']
        if not values.get('employee'):
            raise ValidationError(gettext(
                    'nline_js_shopfloor.msg_ticket_employee'))
        ticket = cls._new_ticket('active')
        cls._ticket_values(ticket, values)
        if ticket.type != 'indirect' and not ticket.work:
            raise ValidationError(gettext(
                    'nline_js_shopfloor.msg_ticket_operation'))
        Ticket.start([ticket])
        return cls._ticket_row(Ticket(ticket.id))

    @classmethod
    def _dc_tickets(cls, ids, states):
        Ticket = Pool().get('nline.js.labor_ticket')
        tickets = [t for t in Ticket.browse(ids or []) if t.state in states]
        if not tickets:
            raise ValidationError(gettext(
                    'nline_js_shopfloor.msg_no_ticket_selected'))
        return tickets

    @classmethod
    def sf_dc_post(cls, values):
        """Post (or suspend) labor in progress: clock out, completed and
        deviated quantities; a suspended copy is left to resume later
        values: tickets ([{id, completed_qty, deviated_qty, reason_code,
        description, completed}]) or ids, clock_out, suspend"""
        cls._check_create('nline.js.labor_ticket', 'production.work.cycle')
        Ticket = Pool().get('nline.js.labor_ticket')
        details = {d['id']: d for d in values.get('tickets') or []}
        ids = list(details) or values.get('ids') or []
        tickets = cls._dc_tickets(ids, {'active'})
        clock_out = cls._to_utc(values.get('clock_out')) \
            or dt.datetime.now()
        for ticket in tickets:
            detail = {k: v for k, v in details.get(ticket.id, {}).items()
                if k in {'completed_qty', 'deviated_qty', 'reason_code',
                    'description', 'completed', 'labor_percent'}}
            cls._ticket_values(ticket, detail)
            ticket.clock_out = clock_out
            ticket.hours_worked = None
        Ticket.post(tickets)
        suspended = []
        if values.get('suspend'):
            suspended = Ticket.copy(tickets, {
                    'state': 'suspended',
                    'clock_in': None, 'clock_out': None,
                    'hours_worked': None, 'completed_qty': None,
                    'deviated_qty': None, 'reason_code': None,
                    'description': None, 'completed': False,
                    'cycle': None, 'transaction_date': None,
                    })
        return [cls._ticket_row(t) for t in tickets + suspended]

    @classmethod
    def sf_dc_resume(cls, values):
        """Resume suspended operations (clock in again)
        values: ids, clock_in"""
        cls._check_create('nline.js.labor_ticket', 'production.work.cycle')
        Ticket = Pool().get('nline.js.labor_ticket')
        tickets = cls._dc_tickets(values.get('ids'), {'suspended'})
        clock_in = cls._to_utc(values.get('clock_in')) or dt.datetime.now()
        for ticket in tickets:
            ticket.clock_in = clock_in
            ticket.transaction_date = clock_in
        Ticket.start(tickets)
        return [cls._ticket_row(t) for t in tickets]

    @classmethod
    def sf_dc_edit(cls, values):
        """Edit labor not saved yet (Edit Details)
        values: tickets ([{id, ...the ticket's values}])"""
        cls._check_write('nline.js.labor_ticket')
        Ticket = Pool().get('nline.js.labor_ticket')
        details = {d['id']: d for d in values.get('tickets') or []}
        tickets = cls._dc_tickets(list(details),
            {'active', 'suspended', 'posted'})
        for ticket in tickets:
            detail = dict(details[ticket.id])
            detail.pop('id', None)
            if ticket.cycle and 'work' in detail and \
                    detail['work'] != (ticket.work.id if ticket.work
                        else None):
                # A started cycle stays on its operation
                detail.pop('work')
            cls._ticket_values(ticket, detail)
            if ticket.state == 'posted':
                ticket.compute_hours()
        Ticket.save(tickets)
        return [cls._ticket_row(t) for t in tickets]

    @classmethod
    def sf_dc_delete(cls, ids):
        "Delete labor not saved yet (its running cycle cancelled)"
        cls._check_delete('nline.js.labor_ticket')
        Ticket = Pool().get('nline.js.labor_ticket')
        tickets = cls._dc_tickets(ids, {'active', 'suspended', 'posted'})
        Ticket.delete(tickets)
        return len(tickets)

    @classmethod
    def sf_dc_save(cls, ids):
        "Save the posted labor to the database (the tickets are costed)"
        cls._check_create('nline.js.labor_ticket', 'production.work.cycle')
        Ticket = Pool().get('nline.js.labor_ticket')
        tickets = cls._dc_tickets(ids, {'posted'})
        Ticket.save_tickets(tickets)
        return [cls._ticket_row(Ticket(t.id)) for t in tickets]

    @classmethod
    def sf_clock(cls, values):
        """Employee Clock In/Out (time and attendance)
        values: employee, action (in|out), at"""
        cls._check_create('nline.js.employee_time')
        pool = Pool()
        Time = pool.get('nline.js.employee_time')
        Employee = pool.get('company.employee')
        employee = Employee(values['employee'])
        at = cls._to_utc(values.get('at')) or dt.datetime.now()
        open_ = Time.search([
                ('employee', '=', employee.id),
                ('clock_out', '=', None),
                ], limit=1)
        if values.get('action') == 'out':
            if not open_:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_not_clocked_in',
                        employee=employee.rec_name))
            time, = open_
            time.clock_out = at
            time.save()
        else:
            if open_:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_clocked_in',
                        employee=employee.rec_name))
            time = Time(employee=employee, shift_no=employee.shift_no,
                clock_in=at)
            time.save()
        return {'id': time.id, 'clock_in': cls._local(time.clock_in),
            'clock_out': cls._local(time.clock_out),
            'hours': time.hours_worked}
