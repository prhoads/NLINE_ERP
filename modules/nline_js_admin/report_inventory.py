# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"Jobshop reports: Inventory"
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.pool import Pool
from trytond.transaction import Transaction

from .reports import (
    ZERO, attr, dec, f_check, f_date, f_dates, f_range, f_status,
    first_model, move_cost, name, part_id, quantities, report)

CENT = Decimal('0.01')


def _storage():
    Location = Pool().get('stock.location')
    return Location.search([('type', '=', 'storage')])


def _products(p, key='part'):
    "The parts of the Part ID range (in Tryton: products with a code)"
    Product = Pool().get('product.product')
    domain = [('type', '!=', 'service')]
    start, end = p.get(key + '_from'), p.get(key + '_to')
    if start:
        domain.append(('code', '>=', start))
    if end:
        domain.append(('code', '<=', end))
    with Transaction().set_context(active_test=False):
        return Product.search(domain)


def _part_codes(product):
    "Product code and commodity code (fields of the inventory area)"
    return {
        'product_code': attr(product, 'product_code', 'js_product_code')
        or attr(product.template, 'product_code', 'js_product_code') or '',
        'commodity_code': attr(product, 'commodity_code',
            'js_commodity_code') or attr(product.template, 'commodity_code',
            'js_commodity_code') or '',
        }


def _codes_gap(p):
    Template = Pool().get('product.template')
    if 'product_code' not in Template._fields and \
            'js_product_code' not in Template._fields:
        p.gap("Product Code and Commodity Code of the parts: not in Tryton "
            "yet (nline_js_inventory).")


@report('warehouse_location_list', "Inventory Location List", 'inventory',
    'WarehouseLocationList.rpt', ['stock.location'],
    [('warehouse', "Warehouse ID"), ('id', "Location ID"),
        ('description', "Description"), ('type', "Type")],
    filters=[f_range('id', "Location ID")], sort='warehouse',
    advanced=True)
def warehouse_location_list(desk, p):
    Location = Pool().get('stock.location')
    return [{
            'warehouse': l.warehouse.code or l.warehouse.name
            if l.warehouse else '',
            'id': l.code or l.name,
            'description': l.name,
            'type': l.type,
            '_drill': {'type': 'record', 'model': 'stock.location',
                'id': l.id},
            } for l in Location.search([
                ('type', 'in', ['warehouse', 'storage', 'view']),
                ])]


def _transaction_class(move):
    "Jobshop's transaction class: In, Out, Adjust"
    src, dst = move.from_location.type, move.to_location.type
    if src == 'storage' and dst == 'storage':
        return "Transfer"
    if dst == 'storage':
        return "Adjust In" if src == 'lost_found' else "In"
    if src == 'storage':
        return "Adjust Out" if dst == 'lost_found' else "Out"
    return "%s > %s" % (src, dst)


def _move_refs(move):
    refs = {'work_order': '', 'sales_order': '', 'purchase_order': ''}
    production = getattr(move, 'production_input', None) or getattr(
        move, 'production_output', None)
    if production:
        refs['work_order'] = production.number or ''
    origin = move.origin
    if origin is not None:
        if origin.__name__ == 'sale.line':
            refs['sales_order'] = origin.sale.number or ''
        elif origin.__name__ == 'purchase.line':
            refs['purchase_order'] = origin.purchase.number or ''
    return refs


@report('inventory_transaction_list', "Inventory Transaction List",
    'inventory', 'InventoryTransaction.rpt', ['stock.move'],
    [('date', "Transaction Date", 'date'), ('part', "Part ID"),
        ('work_order', "Work Order"), ('sales_order', "Sales Order"),
        ('purchase_order', "Purchase Order"), ('class', "Class"),
        ('quantity', "Quantity", 'qty'), ('unit', "UM"),
        ('location', "Location"), ('reason', "Reason Code"),
        ('material', "Material Cost", 'money'),
        ('labor', "Labor Cost", 'money'), ('service', "Service Cost",
            'money'), ('burden', "Burden Cost", 'money')],
    filters=[f_dates('date', "Transaction Date", default='this-month'),
        f_range('part', "Part ID"),
        f_status('class', "Class", [[c, c] for c in [
                    'In', 'Out', 'Adjust In', 'Adjust Out', 'Transfer']])],
    sort='date', landscape=True)
def inventory_transaction_list(desk, p):
    Move = Pool().get('stock.move')
    domain = [
        ('state', '=', 'done'),
        ['OR',
            ('from_location.type', '=', 'storage'),
            ('to_location.type', '=', 'storage'),
            ],
        ] + p.domain_dates('date', 'effective_date')
    rows = []
    for move in Move.search(domain, order=[('effective_date', 'ASC'),
                ('id', 'ASC')]):
        sign = -1 if move.from_location.type == 'storage' and \
            move.to_location.type != 'storage' else 1
        location = move.to_location if move.to_location.type == 'storage' \
            else move.from_location
        row = {
            'date': move.effective_date,
            'part': part_id(move.product),
            'class': _transaction_class(move),
            'quantity': sign * move.internal_quantity
            if move.internal_quantity is not None else sign * move.quantity,
            'unit': move.product.default_uom.symbol,
            'location': location.code or location.name,
            'reason': attr(move, 'reason_code', 'js_reason') or '',
            'material': sign * move_cost(move),
            'labor': None,
            'service': None,
            'burden': None,
            '_drill': {'type': 'record', 'model': 'stock.move',
                'id': move.id},
            }
        row.update(_move_refs(move))
        rows.append(row)
    p.gap("Inventory transactions: Tryton values a move at one cost price "
        "(no labor / service / burden split); the material column is "
        "the whole cost.")
    return rows


@report('inventory_turns', "Inventory Turns", 'inventory',
    'InventoryTurns.rpt', ['stock.move', 'product.product'],
    [('part', "Part ID"), ('description', "Description"),
        ('on_hand', "On Hand", 'qty'), ('unit', "UM"),
        ('value', "Inventory Value", 'money'),
        ('usage', "Usage (6 Months)", 'qty'),
        ('usage_value', "Usage Value (6 Months)", 'money'),
        ('turns', "Annualized Turns", 'num')],
    filters=[f_range('part', "Part ID"), f_date('as_of', "As of")],
    sort='part')
def inventory_turns(desk, p):
    Move = Pool().get('stock.move')
    as_of = p.date('as_of') or dt.date.today()
    since = as_of - dt.timedelta(days=182)
    products = {pr.id: pr for pr in _products(p)}
    on_hand = defaultdict(float)
    for (location, product), qty in quantities(list(products),
            date=as_of).items():
        on_hand[product] += qty
    usage = defaultdict(float)
    usage_value = defaultdict(lambda: ZERO)
    for move in Move.search([
                ('state', '=', 'done'),
                ('product', 'in', list(products)),
                ('from_location.type', '=', 'storage'),
                ('to_location.type', 'in', ['customer', 'production']),
                ('effective_date', '>=', since),
                ('effective_date', '<=', as_of),
                ]):
        usage[move.product.id] += move.internal_quantity or move.quantity
        usage_value[move.product.id] += move_cost(move)
    rows = []
    for pid, product in products.items():
        if not on_hand.get(pid) and not usage.get(pid):
            continue
        value = (dec(on_hand.get(pid, 0)) * (product.cost_price or ZERO)
            ).quantize(CENT)
        turns = float(usage_value[pid] * 2 / value) if value else None
        rows.append({
                'part': part_id(product),
                'description': product.name,
                'on_hand': on_hand.get(pid, 0),
                'unit': product.default_uom.symbol,
                'value': value,
                'usage': usage.get(pid, 0),
                'usage_value': usage_value[pid],
                'turns': round(turns, 2) if turns is not None else None,
                })
    return rows


@report('inventory_value', "Inventory Value", 'inventory',
    'InventoryValue.rpt', ['product.product', 'stock.location'],
    [('part', "Part ID"), ('description', "Description"),
        ('location', "Location"), ('account_set', "Account Set"),
        ('quantity', "On Hand", 'qty'), ('unit', "UM"),
        ('unit_cost', "Unit Cost", 'money'), ('value', "Value", 'money')],
    filters=[f_range('part', "Part ID"), f_date('as_of', "As of")],
    group_by='part', sort='location')
def inventory_value(desk, p):
    as_of = p.date('as_of')
    products = {pr.id: pr for pr in _products(p)}
    locations = {l.id: l for l in _storage()}
    rows = []
    for (location, product), qty in quantities(list(products),
            list(locations), date=as_of,
            grouping=('product',)).items():
        if not qty or product not in products:
            continue
        product = products[product]
        location = locations[location]
        cost = product.cost_price or ZERO
        rows.append({
                'part': part_id(product),
                'description': product.name,
                'location': location.code or location.name,
                'account_set': name(product.account_category),
                'quantity': qty,
                'unit': product.default_uom.symbol,
                'unit_cost': cost,
                'value': (dec(qty) * cost).quantize(CENT),
                })
    p.gap("Inventory value: Tryton's cost price per part (no FIFO layer "
        "by receipt date and no material / labor / burden / service "
        "split).")
    return rows


@report('location_content_list', "Location Content List", 'inventory',
    'LocationContentList.rpt', ['product.product', 'stock.location'],
    [('location', "Location ID"), ('location_name', "Location"),
        ('part', "Part ID"), ('description', "Description"),
        ('quantity', "On-hand Quantity", 'qty'), ('unit', "Stock UM")],
    filters=[f_range('location', "Location ID"),
        f_range('part', "Part ID")],
    group_by='location', sort='part', totals=[])
def location_content_list(desk, p):
    locations = {l.id: l for l in _storage()}
    rows = []
    Product = Pool().get('product.product')
    found = quantities(None, list(locations))
    products = {pr.id: pr for pr in Product.browse(
            sorted({k[1] for k, q in found.items() if q}))}
    for (location, product), qty in found.items():
        if not qty:
            continue
        product = products[product]
        location = locations[location]
        rows.append({
                'location': location.code or location.name,
                'location_name': location.name,
                'part': part_id(product),
                'description': product.name,
                'quantity': qty,
                'unit': product.default_uom.symbol,
                })
    return rows


@report('lot_where_used', "Lot Where Used Report", 'inventory',
    'LotWhereUsed.rpt', ['stock.move'],
    [('part', "Part ID"), ('lot', "Tracking Number"),
        ('date', "Date", 'date'), ('from', "From"), ('to', "To"),
        ('quantity', "Quantity", 'qty'), ('document', "Document")],
    filters=[f_range('part', "Part ID"), f_range('lot', "Tracking Number"),
        f_dates('date', "Date")],
    group_by='lot', sort='date', totals=[])
def lot_where_used(desk, p):
    Move = Pool().get('stock.move')
    if 'lot' not in Move._fields:
        p.gap("Lot tracking: Tryton module stock_lot is not activated.")
        return []
    rows = []
    for move in Move.search([('lot', '!=', None), ('state', '=', 'done')]
            + p.domain_dates('date', 'effective_date')):
        document = move.shipment or getattr(move, 'production_input', None) \
            or getattr(move, 'production_output', None) or move.origin
        rows.append({
                'part': part_id(move.product),
                'lot': move.lot.number,
                'date': move.effective_date,
                'from': move.from_location.rec_name,
                'to': move.to_location.rec_name,
                'quantity': move.quantity,
                'document': document.rec_name if document else '',
                })
    return rows


@report('part_list_simple', "Part List", 'inventory', 'PartlistSimple.rpt',
    ['product.product'],
    [('part', "Part ID"), ('description', "Description"), ('unit', "UM"),
        ('product_code', "Product Code"),
        ('commodity_code', "Commodity Code"),
        ('unit_cost', "Unit Cost", 'money'),
        ('unit_price', "Unit Price", 'money')],
    filters=[f_range('part', "Part ID")], sort='part', totals=[],
    advanced=True)
def part_list_simple(desk, p):
    _codes_gap(p)
    rows = []
    for product in _products(p):
        row = {
            'part': part_id(product),
            'description': product.name,
            'unit': product.default_uom.symbol,
            'unit_cost': product.cost_price,
            'unit_price': product.list_price,
            '_drill': {'type': 'record', 'model': 'product.product',
                'id': product.id},
            }
        row.update(_part_codes(product))
        rows.append(row)
    return rows


@report('part_location_list', "Part Location List", 'inventory',
    'PartLocationList.rpt', ['product.product', 'stock.location'],
    [('part', "Part ID"), ('description', "Description"),
        ('location', "Location ID"), ('quantity', "On-Hand Quantity", 'qty'),
        ('unit', "Stock UM"), ('on_hold', "On Hold", 'bool')],
    filters=[f_range('part', "Part ID"), f_range('location', "Location ID")],
    group_by='part', sort='location', totals=[])
def part_location_list(desk, p):
    products = {pr.id: pr for pr in _products(p)}
    locations = {l.id: l for l in _storage()}
    held = set()
    PartLocation = first_model('nline.js.part_location')
    if PartLocation is not None:
        held = {(pl.template.id, pl.location.id)
            for pl in PartLocation.search([('hold', '=', True)])
            if pl.template and pl.location}
    rows = []
    for (location, product), qty in quantities(list(products),
            list(locations)).items():
        if not qty or product not in products:
            continue
        product = products[product]
        location = locations[location]
        rows.append({
                'part': part_id(product),
                'description': product.name,
                'location': location.code or location.name,
                'quantity': qty,
                'unit': product.default_uom.symbol,
                'on_hold': (product.template.id, location.id) in held,
                })
    return rows


@report('part_list', "Part", 'inventory', 'Partlist.rpt',
    ['product.product'],
    [('part', "Part ID"), ('description', "Description"),
        ('type', "Type"), ('unit', "Stock UM"),
        ('fabricated', "Fabricated", 'bool'),
        ('purchased', "Purchased", 'bool'),
        ('stocked', "Stocked", 'bool'), ('sold', "Sold", 'bool'),
        ('product_code', "Product Code"),
        ('commodity_code', "Commodity Code"),
        ('account_set', "Account Set"), ('revision', "Revision"),
        ('drawing', "Drawing"), ('supplier', "Preferred Supplier"),
        ('lead_time', "Lead Time (days)", 'int'),
        ('unit_cost', "Unit Material Cost", 'money'),
        ('unit_price', "Unit Price", 'money')],
    filters=[f_range('part', "Part ID")], sort='part', totals=[],
    advanced=True, landscape=True)
def part_list(desk, p):
    _codes_gap(p)
    rows = []
    for product in _products(p):
        template = product.template
        suppliers = getattr(product, 'product_suppliers', None) or \
            getattr(template, 'product_suppliers', None) or []
        supplier = suppliers[0] if suppliers else None
        row = {
            'part': part_id(product),
            'description': product.name,
            'type': template.type,
            'unit': product.default_uom.symbol,
            'fabricated': bool(getattr(template, 'producible', False)),
            'purchased': bool(getattr(template, 'purchasable', False)),
            'stocked': template.type == 'goods',
            'sold': bool(getattr(template, 'salable', False)),
            'account_set': name(template.account_category),
            'revision': attr(template, 'engineering_revision') or '',
            'drawing': attr(template, 'drawing_number') or '',
            'supplier': supplier.party.rec_name if supplier else '',
            'lead_time': supplier.lead_time.days
            if supplier and supplier.lead_time else None,
            'unit_cost': product.cost_price,
            'unit_price': product.list_price,
            '_drill': {'type': 'record', 'model': 'product.product',
                'id': product.id},
            }
        row.update(_part_codes(product))
        rows.append(row)
    return rows


@report('physical_count_form', "Physical Count Form", 'inventory',
    'PhysicalCountForm.rpt', ['product.product', 'stock.location'],
    [('part', "Part ID"), ('description', "Description"),
        ('location', "Location"), ('unit', "Stock UM"),
        ('quantity', "On-hand Quantity", 'qty'), ('count', "Count"),
        ('variance', "Over/Under")],
    filters=[f_range('location', "Location ID"), f_range('part', "Part ID"),
        f_check('zero', "Include parts with no quantity")],
    group_by='location', sort='part', totals=[])
def physical_count_form(desk, p):
    products = {pr.id: pr for pr in _products(p)
        if pr.template.type == 'goods'}
    locations = {l.id: l for l in _storage()}
    rows = []
    found = quantities(list(products), list(locations))
    seen = set()
    for (location, product), qty in found.items():
        if product not in products or (not qty and not p.get('zero')):
            continue
        seen.add(product)
        product = products[product]
        location = locations[location]
        rows.append({
                'part': part_id(product),
                'description': product.name,
                'location': location.code or location.name,
                'unit': product.default_uom.symbol,
                'quantity': qty,
                'count': '',
                'variance': '',
                })
    if p.get('zero'):
        for pid, product in products.items():
            if pid not in seen:
                rows.append({
                        'part': part_id(product),
                        'description': product.name,
                        'location': '',
                        'unit': product.default_uom.symbol,
                        'quantity': 0.0,
                        'count': '', 'variance': ''})
    return rows


@report('units_conversion_list', "Unit Conversions List", 'inventory',
    'UnitsConversionList.rpt', ['product.uom'],
    [('part', "Part ID"), ('from', "From Unit ID"), ('to', "To Unit ID"),
        ('factor', "Conversion Factor", 'num'), ('category', "Category")],
    filters=[f_range('from', "From Unit ID")], sort='category', totals=[],
    advanced=True)
def units_conversion_list(desk, p):
    Uom = Pool().get('product.uom')
    rows = []
    for uom in Uom.search([]):
        reference = [u for u in uom.category.uoms if u.rate == 1.0]
        if not reference or reference[0] == uom:
            continue
        rows.append({
                'part': '',
                'from': uom.symbol,
                'to': reference[0].symbol,
                'factor': uom.factor,
                'category': uom.category.name,
                })
    Conversion = first_model('nline.js.unit_conversion',
        'nline.unit_conversion')
    if Conversion is None:
        p.gap("Part specific unit conversions: not in Tryton yet "
            "(nline_js_inventory).")
    else:
        for conversion in Conversion.search([]):
            rows.append({
                    'part': attr(getattr(conversion, 'template', None),
                        'code') or attr(conversion, 'template', 'product')
                    or '',
                    'from': attr(conversion, 'from_uom', 'from_unit') or '',
                    'to': attr(conversion, 'to_uom', 'to_unit') or '',
                    'factor': attr(conversion, 'factor', 'rate'),
                    'category': '',
                    })
    return rows


@report('unit_list', "Units of Measure List", 'inventory', 'UnitList.rpt',
    ['product.uom'],
    [('id', "UM ID"), ('description', "Description"),
        ('scale', "Unit Scale", 'int'), ('category', "Category")],
    filters=[f_range('id', "UM ID")], sort='id', totals=[], advanced=True)
def unit_list(desk, p):
    Uom = Pool().get('product.uom')
    return [{
            'id': u.symbol,
            'description': u.name,
            'scale': u.digits,
            'category': u.category.name,
            } for u in Uom.search([])]


@report('where_used', "Where Used", 'inventory', 'WhereUsed.rpt',
    ['production.bom', 'production'],
    [('part', "Part ID"), ('description', "Description"),
        ('unit', "Stock UM"), ('parent', "Parent Part ID"),
        ('master', "Eng ID / Work Order"), ('kind', "Master/Work Order"),
        ('seq', "Seq", 'int'), ('piece', "Piece", 'int'),
        ('quantity', "Qty Per", 'qty'), ('status', "Status")],
    filters=[f_range('part', "Part ID"), f_check('work_orders',
            "Include open work orders", True)],
    group_by='part', sort='parent', totals=[])
def where_used(desk, p):
    pool = Pool()
    Input = pool.get('production.bom.input')
    products = {pr.id: pr for pr in _products(p)}
    rows = []
    for line in Input.search([('product', 'in', list(products))]):
        bom = line.bom
        outputs = [o.product for o in bom.outputs]
        for parent in outputs or [None]:
            rows.append({
                    'part': part_id(line.product),
                    'description': line.product.name,
                    'unit': line.product.default_uom.symbol,
                    'parent': part_id(parent),
                    'master': attr(bom, 'revision') or bom.name,
                    'kind': "Master",
                    'seq': attr(line, 'operation'),
                    'piece': attr(line, 'piece'),
                    'quantity': line.quantity,
                    'status': '',
                    '_drill': {'type': 'record', 'model': 'production.bom',
                        'id': bom.id},
                    })
    if p.get('work_orders', True):
        # One row per work order and material (its moves summed)
        Move = pool.get('stock.move')
        by_order = {}
        for move in Move.search([
                    ('product', 'in', list(products)),
                    ('production_input', '!=', None),
                    ('production_input.state', 'not in',
                        ['done', 'cancelled']),
                    ('state', '!=', 'cancelled'),
                    ]):
            production = move.production_input
            key = (production.id, move.product.id)
            if key in by_order:
                by_order[key]['quantity'] += move.quantity
                continue
            by_order[key] = {
                'part': part_id(move.product),
                'description': move.product.name,
                'unit': move.product.default_uom.symbol,
                'parent': part_id(production.product),
                'master': production.number or '',
                'kind': "Work Order",
                'seq': None,
                'piece': None,
                'quantity': move.quantity,
                'status': production.state,
                '_drill': {'type': 'screen', 'route':
                    'work-orders/%s' % production.id},
                }
        rows.extend(by_order.values())
    return rows
