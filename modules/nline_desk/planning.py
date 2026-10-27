# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""N-Line screens: Jobshop planning and estimating (UI upgrade phase 6)

Material Planning (open sales order lines without their work order, the
materials the open work orders still need, the stocked parts below their
order point; a work order or a purchase order made from each), the schedule
of the work orders (Gantt chart) and the costing of quote lines (Cost
From: the part's cost or its engineering master's rollup).
"""
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .desk import _date, accept_warnings

ZERO = Decimal(0)


class DeskPlanning(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['plan_work_order', 'plan_purchase', 'reschedule']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['planning', 'schedule', 'quote_cost']:
            cls.__rpc__[name] = RPC()

    # ---- Material Planning -----------------------------------------------

    @classmethod
    def planning(cls):
        """Return the three tabs of Material Planning: open sales order
        lines, non-stocked needs of the work orders, stocked parts"""
        cls._check_read('production')
        pool = Pool()
        SaleLine = pool.get('sale.line')
        Move = pool.get('stock.move')
        Product = pool.get('product.product')
        PurchaseLine = pool.get('purchase.line')
        warehouses = cls._warehouse_ids()

        def stock(products):
            with Transaction().set_context(locations=warehouses,
                    with_childs=True, stock_date_end=dt.date.max):
                return {p.id: (p.quantity, p.forecast_quantity)
                    for p in Product.browse(products)}

        sales = []
        for line in SaleLine.search([
                    ('type', '=', 'line'),
                    ('product.producible', '=', True),
                    ('sale.state', 'in', ['confirmed', 'processing']),
                    ]):
            if getattr(line, 'productions', None) or getattr(
                    line, 'job_coverages', None):
                continue
            quantity = line._get_move_quantity('out')
            if quantity <= 0:
                continue
            sales.append({
                    'line': line.id,
                    'sale': line.sale.id,
                    'number': line.sale.number or str(line.sale.id),
                    'party': line.sale.party.rec_name,
                    'product': line.product.id,
                    'product_name': line.product.rec_name,
                    'quantity': quantity,
                    'unit': line.unit.rec_name,
                    'date': line.shipping_date,
                    })
        levels = stock({s['product'] for s in sales})
        for s in sales:
            s['on_hand'], s['forecast'] = levels.get(s['product'], (0, 0))

        # What the open work orders still need
        needs = defaultdict(lambda: {'required': 0.0, 'orders': set(),
                'date': None})
        for move in Move.search([
                    ('production_input', '!=', None),
                    ('production_input.state', 'in', ['request', 'draft',
                            'waiting', 'assigned', 'running']),
                    ('state', 'in', ['staging', 'draft']),
                    ]):
            need = needs[move.product.id]
            need['required'] += move.internal_quantity
            need['orders'].add(move.production_input.number
                or str(move.production_input.id))
            if move.planned_date and (not need['date']
                    or move.planned_date < need['date']):
                need['date'] = move.planned_date
        on_order = defaultdict(float)
        for line in PurchaseLine.search([
                    ('product', 'in', list(needs)),
                    ('purchase.state', 'in', ['quotation', 'confirmed',
                            'processing']),
                    ]):
            received = sum(m.internal_quantity for m in line.moves
                if m.state == 'done')
            on_order[line.product.id] += max(
                line.quantity - received, 0)
        levels = stock(list(needs))
        materials = []
        for product in Product.browse(list(needs)):
            need = needs[product.id]
            on_hand, forecast = levels.get(product.id, (0, 0))
            short = need['required'] - max(on_hand, 0) - on_order[product.id]
            materials.append({
                    'product': product.id,
                    'product_name': product.rec_name,
                    'unit': product.default_uom.rec_name,
                    'required': need['required'],
                    'on_hand': on_hand,
                    'on_order': on_order[product.id],
                    'short': max(short, 0),
                    'orders': ', '.join(sorted(need['orders'])),
                    'date': need['date'],
                    'purchasable': product.purchasable,
                    'producible': getattr(product, 'producible', False),
                    })
        materials.sort(key=lambda m: (-m['short'], m['product_name']))

        stocked = []
        try:
            OrderPoint = pool.get('stock.order_point')
        except KeyError:
            OrderPoint = None
        if OrderPoint:
            points = OrderPoint.search([('type', 'in',
                        ['purchase', 'production'])])
            levels = stock({p.product.id for p in points})
            for point in points:
                on_hand, forecast = levels.get(point.product.id, (0, 0))
                if point.min_quantity is None:
                    continue
                stocked.append({
                        'product': point.product.id,
                        'product_name': point.product.rec_name,
                        'unit': point.product.default_uom.rec_name,
                        'type': point.type,
                        'min': point.min_quantity,
                        'target': point.target_quantity,
                        'on_hand': on_hand,
                        'forecast': forecast,
                        'short': max((point.target_quantity or 0)
                            - forecast, 0)
                        if forecast < point.min_quantity else 0,
                        })
        return {'sales': sales, 'materials': materials, 'stocked': stocked}

    @classmethod
    @accept_warnings
    def plan_work_order(cls, values):
        """Make a work order for a part (a material short or a stocked part
        below its order point)
        values: product, quantity, date"""
        cls._check_create('production')
        pool = Pool()
        Product = pool.get('product.product')
        Production = pool.get('production')
        Location = pool.get('stock.location')
        product = Product(values['product'])
        if not getattr(product, 'producible', False):
            raise ValidationError(gettext('nline_desk.msg_not_producible',
                    product=product.rec_name))
        warehouse, = Location.search([('type', '=', 'warehouse')], limit=1)
        get_bom = getattr(product, 'get_bom', None)
        product_bom = get_bom() if get_bom else (
            product.boms[0] if product.boms else None)
        production = Production(
            company=cls._company(),
            warehouse=warehouse,
            location=warehouse.production_location,
            product=product,
            bom=product_bom.bom if product_bom else None,
            unit=product.default_uom,
            quantity=float(values['quantity']),
            planned_date=_date(values.get('date')),
            state='request',
            )
        if product_bom and hasattr(Production, 'routing'):
            production.routing = product_bom.routing
        if hasattr(production, 'set_planned_start_date'):
            production.set_planned_start_date()
        production.save()
        Production.set_moves([production])
        return {
            'id': production.id,
            'number': production.number or str(production.id),
            }

    @classmethod
    @accept_warnings
    def plan_purchase(cls, values):
        """Order a part from its first supplier (a draft purchase order, one
        per supplier and day), else a purchase request
        values: product, quantity"""
        cls._check_create('purchase.purchase')
        pool = Pool()
        Product = pool.get('product.product')
        Purchase = pool.get('purchase.purchase')
        Request = pool.get('purchase.request')
        product = Product(values['product'])
        quantity = float(values['quantity'])
        suppliers = list(getattr(product, 'product_suppliers_used', None)
            and product.product_suppliers_used() or [])
        if not suppliers:
            Location = pool.get('stock.location')
            warehouse, = Location.search([('type', '=', 'warehouse')],
                limit=1)
            request = Request(
                company=cls._company(), product=product,
                quantity=quantity, unit=product.purchase_uom,
                computed_quantity=quantity,
                computed_unit=product.purchase_uom,
                warehouse=warehouse)
            request.save()
            return {'request': request.id}
        party = suppliers[0].party
        drafts = Purchase.search([
                ('party', '=', party.id),
                ('state', '=', 'draft'),
                ('purchase_date', '=', dt.date.today()),
                ], limit=1)
        lines = []
        if drafts:
            current = cls.purchase_order_get(drafts[0].id)
            lines = [{'id': l['id'], 'product': l['product']['id']
                    if l['product'] else None,
                    'quantity': l['quantity'],
                    'unit_price': str(l['unit_price'])
                    if l['unit_price'] is not None else None}
                for l in current['lines']]
        lines.append({'product': product.id, 'quantity': quantity})
        order = cls.purchase_order_save({
                'id': drafts[0].id if drafts else None,
                'party': party.id,
                'purchase_date': dt.date.today(),
                'lines': lines,
                })
        return {'purchase': order['id'], 'number': order['number']}

    # ---- Scheduling -----------------------------------------------------

    @classmethod
    def schedule(cls, from_date=None, to_date=None):
        """Return the open work orders with their dates and operations for
        the schedule (Gantt chart)"""
        cls._check_read('production')
        Production = Pool().get('production')
        today = dt.date.today()
        from_date = _date(from_date) or today - dt.timedelta(days=7)
        to_date = _date(to_date) or today + dt.timedelta(days=90)
        rows = []
        for p in Production.search([
                    ('state', 'in', ['request', 'draft', 'waiting',
                            'assigned', 'running']),
                    ], order=[('planned_start_date', 'ASC'),
                    ('planned_date', 'ASC'), ('id', 'ASC')]):
            start = p.planned_start_date or p.planned_date or today
            end = p.planned_date or start
            if end < from_date or start > to_date:
                continue
            rows.append({
                    'id': p.id,
                    'number': p.number or str(p.id),
                    'product': p.product.rec_name if p.product else '',
                    'quantity': p.quantity,
                    'state': p.state,
                    'start': start,
                    'end': end,
                    'late': bool(p.planned_date and p.planned_date < today),
                    'resources': sorted({w.work_center.rec_name
                            for w in getattr(p, 'works', []) or []
                            if w.work_center}),
                    })
        return {'from': from_date, 'to': to_date, 'rows': rows}

    @classmethod
    def reschedule(cls, values):
        """Move a work order: its start and want dates
        values: production, start, end"""
        cls._check_create('production')
        Production = Pool().get('production')
        production = Production(values['production'])
        Production.write([production], {
                'planned_start_date': _date(values.get('start')),
                'planned_date': _date(values.get('end')),
                })
        return True

    # ---- Estimating --------------------------------------------------------

    @classmethod
    def quote_cost(cls, product, quantity=1, basis='master'):
        """The unit cost of a quote line (Jobshop's Cost From): the part's
        cost, or its engineering master's material rollup"""
        cls._check_read('product.product')
        Product = Pool().get('product.product')
        product = Product(product)
        cost = product.cost_price or ZERO
        source = 'part'
        if basis == 'master':
            get_bom = getattr(product, 'get_bom', None)
            product_bom = get_bom() if get_bom else (
                product.boms[0] if product.boms else None)
            if product_bom and product_bom.bom:
                cost = cls.bom_costs(product_bom.bom.id, 1)['total']
                source = 'master'
        return {'unit_cost': cost, 'source': source}
