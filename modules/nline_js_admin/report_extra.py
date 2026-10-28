# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop reports of N-Line's installed Jobshop (6.1.2) that the help's
report list does not name: their .rpt files and selection dialogs are in
the installation (Reports\\*.rpt, Layouts\\VReports.vml)"""
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.pool import Pool
from trytond.transaction import Transaction

from .report_engineering import _masters
from .report_inventory import _part_codes, _products, _storage
from .reports import (
    PURCHASE_STATUS, WORK_ORDER_STATUS, ZERO, attr, code, dec, f_active,
    f_check, f_date, f_dates, f_option, f_radio, f_range, model, name,
    part_id, production_costs, quantities, received, report)

CENT = Decimal('0.01')


def _company():
    return Transaction().context.get('company')


def _in_range(value, p, key):
    start, end = p.get(key + '_from'), p.get(key + '_to')
    value = (value or '').upper()
    return (not start or value >= start.upper()) and (
        not end or value <= end.upper())


# ---- Sales -----------------------------------------------------------------

@report('customer_delivery_performance', "Customer Delivery Performance",
    'sales', 'CustomerDeliveryPerformance.rpt', ['sale.sale'],
    [('customer', "Customer ID"), ('customer_name', "Customer Name"),
        ('shipments', "Shipments", 'int'), ('early', "Early", 'int'),
        ('on_time', "On Time", 'int'), ('late', "Late", 'int'),
        ('on_time_pct', "On Time %", 'pct'),
        ('average_days', "Avg Days Late", 'num')],
    filters=[f_range('customer', "Customer ID"),
        f_dates('date', "Shipped Date", column='_date',
            default='this-year'),
        f_range('part', "Part ID", column='_part'),
        f_active("Customers")],
    sort='customer', totals=['shipments', 'early', 'on_time', 'late'],
    chart={'label': 'customer', 'value': 'on_time_pct',
        'title': "On Time %", 'kind': 'hbar'})
def customer_delivery_performance(desk, p):
    "The shipped sale lines against their desired ship date"
    Move = Pool().get('stock.move')
    stats = defaultdict(lambda: {'shipments': 0, 'early': 0, 'on_time': 0,
            'late': 0, 'days': 0})
    parties = {}
    for move in Move.search([('company', '=', _company()),
                ('state', '=', 'done'),
                ('to_location.type', '=', 'customer'),
                ] + p.domain_dates('date', 'effective_date')):
        line = move.origin if move.origin is not None and \
            move.origin.__name__ == 'sale.line' else None
        if not line or not _in_range(part_id(move.product), p, 'part'):
            continue
        party = line.sale.party
        key = code(party)
        parties[key] = party
        stat = stats[key]
        stat['shipments'] += 1
        wanted = line.shipping_date or line.sale.shipping_date
        if not wanted or not move.effective_date:
            stat['on_time'] += 1
            continue
        days = (move.effective_date - wanted).days
        if days < 0:
            stat['early'] += 1
        elif days == 0:
            stat['on_time'] += 1
        else:
            stat['late'] += 1
            stat['days'] += days
    return [{
            'customer': key,
            'customer_name': parties[key].name,
            'shipments': s['shipments'],
            'early': s['early'],
            'on_time': s['on_time'],
            'late': s['late'],
            'on_time_pct': round(100.0 * (s['on_time'] + s['early'])
                / s['shipments'], 1) if s['shipments'] else None,
            'average_days': round(s['days'] / s['late'], 1)
            if s['late'] else 0,
            '_active': parties[key].active,
            } for key, s in stats.items()]


@report('sales_rep_commission', "Sales Rep Commission", 'sales',
    'SalesRepCommission.rpt', ['account.invoice'],
    [('sales_rep', "Sales Rep ID"), ('invoice', "Invoice ID"),
        ('date', "Invoiced Date", 'date'), ('customer', "Customer ID"),
        ('order', "Sales Order ID"), ('part', "Part ID"),
        ('amount', "Amount", 'money'), ('rate', "Commission %", 'pct'),
        ('commission', "Commission", 'money')],
    filters=[f_range('invoice', "Invoice ID"),
        f_range('sales_rep', "Sales Rep ID"),
        f_dates('date', "Invoiced Date", default='last-month'),
        f_check('condensed', "Condensed")],
    group_by='sales_rep', sort='invoice', totals=['amount', 'commission'])
def sales_rep_commission(desk, p):
    """The invoiced sale lines by sales rep: the rep's commission % of the
    commissionable lines"""
    Invoice = Pool().get('account.invoice')
    Sale = Pool().get('sale.sale')
    if 'sales_rep' not in Sale._fields:
        p.gap("Sales reps of the sales orders: not in Tryton yet "
            "(nline_js_sales).")
    rows = []
    for invoice in Invoice.search([('company', '=', _company()),
                ('type', '=', 'out'), ('state', 'in', ['posted', 'paid']),
                ] + p.domain_dates('date', 'invoice_date')):
        for line in invoice.lines:
            source = getattr(line, 'origin', None)
            if line.type != 'line' or source is None or \
                    source.__name__ != 'sale.line':
                continue
            sale = source.sale
            rep = getattr(sale, 'sales_rep', None) or getattr(
                sale.party, 'sales_rep', None)
            if rep is None:
                continue
            rate = getattr(rep, 'commission', None) or ZERO
            if getattr(source, 'commissionable', True) is False:
                rate = ZERO
            amount = line.amount or ZERO
            rows.append({
                    'sales_rep': attr(rep, 'code', 'name') or rep.rec_name,
                    'invoice': invoice.number or str(invoice.id),
                    'date': invoice.invoice_date,
                    'customer': code(invoice.party),
                    'order': sale.number or '',
                    'part': part_id(line.product),
                    'amount': amount,
                    'rate': float(rate),
                    'commission': (amount * rate / 100).quantize(CENT),
                    '_drill': {'type': 'record', 'model': 'account.invoice',
                        'id': invoice.id},
                    })
    if p.get('condensed'):
        # One line per invoice and rep
        rolled = {}
        for row in rows:
            key = (row['sales_rep'], row['invoice'])
            if key not in rolled:
                rolled[key] = dict(row, part='', amount=ZERO,
                    commission=ZERO)
            rolled[key]['amount'] += row['amount']
            rolled[key]['commission'] += row['commission']
        rows = list(rolled.values())
    return rows


# ---- Purchasing ------------------------------------------------------------

@report('po_line_backlog', "Purchase Order Line Backlog", 'purchasing',
    'POLineBackLog.rpt', ['purchase.purchase'],
    [('desired', "Desired Rcpt Date", 'date'), ('po', "Purchase Order ID"),
        ('line', "Line", 'int'), ('supplier', "Supplier ID"),
        ('status', "Status"), ('part', "Part ID"),
        ('description', "Description"), ('ordered', "Order Qty", 'qty'),
        ('received', "Received Qty", 'qty'), ('due', "Qty Due", 'qty'),
        ('unit', "UM"), ('unit_price', "Unit Price", 'money'),
        ('backlog', "Backlog Amount", 'money')],
    filters=[f_range('po', "Purchase Order ID"),
        f_range('supplier', "Supplier ID"),
        f_dates('desired', "Desired Receive On Date"),
        f_range('product_code', "Product Code ID"),
        f_range('commodity_code', "Commodity Code ID")],
    sort='desired', totals=['backlog'], landscape=True)
def po_line_backlog(desk, p):
    "The lines of the open purchase orders not received in full"
    Purchase = Pool().get('purchase.purchase')
    rows = []
    for purchase in Purchase.search([('company', '=', _company()),
                ('state', 'in', ['confirmed', 'processing'])],
            order=[('number', 'ASC')]):
        lines = [l for l in purchase.lines if l.type == 'line']
        for i, line in enumerate(lines, 1):
            ordered = line.quantity or 0
            due = max(ordered - received(line), 0)
            if due <= 0:
                continue
            price = line.unit_price or ZERO
            row = {
                'desired': line.delivery_date or purchase.delivery_date,
                'po': purchase.number or str(purchase.id),
                'line': i,
                'supplier': code(purchase.party),
                'status': PURCHASE_STATUS.get(purchase.state,
                    purchase.state),
                'part': part_id(line.product),
                'description': line.description or name(line.product),
                'ordered': ordered,
                'received': ordered - due,
                'due': due,
                'unit': line.unit.symbol if line.unit else '',
                'unit_price': price,
                'backlog': (dec(due) * price).quantize(CENT),
                '_drill': {'type': 'screen', 'route':
                    'purchase-orders/%s' % purchase.id},
                }
            if line.product:
                row.update(_part_codes(line.product))
            rows.append(row)
    return rows


# ---- Inventory -------------------------------------------------------------

@report('inventory_aging', "Inventory Aging", 'inventory',
    'InventoryAging.rpt', ['product.product', 'stock.move'],
    [('part', "Part ID"), ('description', "Description"),
        ('on_hand', "On Hand", 'qty'), ('unit', "UM"),
        ('unit_cost', "Unit Cost", 'money'), ('value', "Value", 'money'),
        ('last_date', "Last Transaction", 'date'),
        ('last_adjust', "Last Adjustment", 'date'),
        ('days', "Days", 'int')],
    filters=[f_range('part', "Part ID"), f_active("Parts"),
        f_range('product_code', "Product Code ID"),
        f_radio('stocked', "For", ("Stocked Parts Only",
                "Non-Stocked Parts Only"), '_stocked', default='both'),
        f_range('commodity_code', "Commodity Code ID"),
        f_date('after', "No Active Transactions After", default=None),
        f_check('adjust_only', "Show Parts with No Active Transactions and "
            "Only Adjustments Before Date")],
    sort='days', totals=['value'])
def inventory_aging(desk, p):
    """The parts on hand by the date of their last active transaction
    (receipt, issue, shipment; adjustments apart)"""
    Move = Pool().get('stock.move')
    after = p.date('after')
    products = {pr.id: pr for pr in _products(p)
        if pr.template.type == 'goods'}
    on_hand = defaultdict(float)
    for (location, product), qty in quantities(list(products)).items():
        on_hand[product] += qty
    last, adjusted = {}, {}
    for move in Move.search([('product', 'in', list(products)),
                ('state', '=', 'done')], order=[('effective_date', 'ASC')]):
        types = {move.from_location.type, move.to_location.type}
        date = move.effective_date
        if 'lost_found' in types:
            adjusted[move.product.id] = date
        else:
            last[move.product.id] = date
    today = dt.date.today()
    rows = []
    for pid, product in products.items():
        qty = on_hand.get(pid, 0)
        if not qty:
            continue
        date = last.get(pid)
        if after:
            if date and date > after:
                continue
            if not date and not p.get('adjust_only'):
                continue
        cost = product.cost_price or ZERO
        row = {
            'part': part_id(product),
            'description': product.name,
            'on_hand': qty,
            'unit': product.default_uom.symbol,
            'unit_cost': cost,
            'value': (dec(qty) * cost).quantize(CENT),
            'last_date': date,
            'last_adjust': adjusted.get(pid),
            'days': (today - date).days if date else None,
            '_drill': {'type': 'record', 'model': 'product.product',
                'id': product.id},
            }
        row.update(_part_codes(product))
        rows.append(row)
    return rows


@report('part_label', "Part Label", 'inventory', 'PartLabel.rpt',
    ['product.product'],
    [('part', "Part ID"), ('description', "Description"),
        ('barcode', "Barcode")],
    filters=[f_range('part', "Part ID"), f_active("Parts")],
    sort='part', totals=[], advanced=True,
    note="Print on Avery 5160 labels: the screen prints the labels three "
    "across.")
def part_label(desk, p):
    rows = []
    for product in _products(p):
        row = {
            'part': part_id(product),
            'description': product.name,
            'barcode': '*%s*' % part_id(product),
            }
        row.update(_part_codes(product))
        rows.append(row)
    return rows


@report('warehouse_location_label', "Warehouse Location Label",
    'inventory', 'WarehouseLocationLabel.rpt', ['stock.location'],
    [('location', "Location ID"), ('description', "Description"),
        ('barcode', "Barcode")],
    filters=[f_range('location', "Location ID")], sort='location',
    totals=[], advanced=True,
    note="Print on Avery 5160 labels: the screen prints the labels three "
    "across.")
def warehouse_location_label(desk, p):
    return [{
            'location': location.code or location.name,
            'description': location.name,
            'barcode': '*%s*' % (location.code or location.name),
            } for location in _storage()]


# ---- Engineering -----------------------------------------------------------

def _indented(product, quantity, level, depth, seen):
    "The materials of a part's default master, level by level"
    rows = []
    boms = getattr(product, 'boms', None) or []
    if not boms or level > depth or product.id in seen:
        return rows
    bom = boms[0].bom
    output = sum(o.quantity for o in bom.outputs) or 1
    for line in bom.inputs:
        qty = line.quantity * quantity / output
        rows.append({
                'level': level,
                'item': '.' * (level - 1) + part_id(line.product),
                'description': line.product.name,
                'qty_per': round(line.quantity / output, 4),
                'quantity': round(qty, 4),
                'unit': line.unit.symbol,
                'fabricated': bool(getattr(line.product, 'boms', None)),
                })
        rows.extend(_indented(line.product, qty, level + 1, depth,
                seen | {product.id}))
    return rows


@report('engineering_master_bom', "Engineering Master Bill of Material",
    'engineering', 'EngineeringMasterBOM.rpt',
    ['product.product-production.bom'],
    [('part', "Part ID"), ('master', "Engineering ID"),
        ('level', "Level", 'int'), ('item', "Material Part ID"),
        ('description', "Description"), ('qty_per', "Qty Per", 'qty'),
        ('quantity', "Extended Qty", 'qty'), ('unit', "UM"),
        ('fabricated', "Fabricated", 'bool')],
    filters=[f_range('part', "Part ID / Eng ID"),
        f_option('depth', "Indent Level", [[str(i), str(i)]
                for i in range(10, 0, -1)])],
    group_by='part', sort='_order', totals=[], landscape=True)
def engineering_master_bom(desk, p):
    "The indented bill of material of the masters (down to Indent Level)"
    depth = int(p.get('depth') or 10)
    rows = []
    for product_bom in _masters(p):
        product = product_bom.product
        head = {'part': part_id(product),
            'master': attr(product_bom.bom, 'revision') or
            product_bom.bom.name}
        output = sum(o.quantity for o in product_bom.bom.outputs) or 1
        for line in product_bom.bom.inputs:
            qty = line.quantity / output
            sub = [{
                    'level': 1,
                    'item': part_id(line.product),
                    'description': line.product.name,
                    'qty_per': round(qty, 4),
                    'quantity': round(qty, 4),
                    'unit': line.unit.symbol,
                    'fabricated': bool(getattr(line.product, 'boms', None)),
                    }] + _indented(line.product, qty, 2, depth,
                {product.id})
            for row in sub:
                rows.append(dict(head, **row))
    for i, row in enumerate(rows):
        row['_order'] = i
    return rows


# ---- Shopfloor -------------------------------------------------------------

@report('work_order_status', "Work Order Status", 'shopfloor',
    'WorkOrderStatus.rpt', ['production'],
    [('wo', "Work Order ID"), ('part', "Part ID"),
        ('description', "Description"), ('status', "Status"),
        ('quantity', "Desired Qty", 'qty'), ('received', "Received Qty",
            'qty'), ('want_date', "Want Date", 'date'),
        ('operations', "Operations", 'int'), ('done', "Completed", 'int'),
        ('est_hours', "Est Hours", 'num'), ('act_hours', "Act Hours",
            'num'), ('pct', "% Complete", 'pct')],
    filters=[f_range('wo', "Work/Lot/Split ID"), f_range('part', "Part ID")],
    sort='wo', totals=[], landscape=True)
def work_order_status(desk, p):
    "The open work orders: operations completed and hours to date"
    Production = Pool().get('production')
    domain = [('company', '=', _company()),
        ('state', 'not in', ['done', 'cancelled'])]
    if p.get('wo_from'):
        domain.append(('number', '>=', p['wo_from']))
    if p.get('wo_to'):
        domain.append(('number', '<=', p['wo_to']))
    rows = []
    for production in Production.search(domain, order=[('number', 'ASC')]):
        works = getattr(production, 'works', None) or []
        done = len([w for w in works if w.state == 'done'])
        costs = production_costs(production)
        received_qty = sum((m.quantity for m in production.outputs
                if m.state == 'done' and m.product == production.product),
            0.0)
        rows.append({
                'wo': production.number or str(production.id),
                'part': part_id(production.product),
                'description': name(production.product),
                'status': WORK_ORDER_STATUS.get(production.state,
                    production.state),
                'quantity': production.quantity,
                'received': received_qty,
                'want_date': production.planned_date,
                'operations': len(works),
                'done': done,
                'est_hours': costs['hours_est'],
                'act_hours': costs['hours_act'],
                'pct': round(100.0 * done / len(works), 1) if works else None,
                '_drill': {'type': 'screen', 'route':
                    'work-orders/%s' % production.id},
                })
    return rows


@report('employee_attendance_history', "Employee Attendance History",
    'shopfloor', 'EmployeeAttendanceHistory.rpt',
    ['company.employee', 'nline.js.employee_time'],
    [('clock', "Clock Number"), ('employee', "Employee Name"),
        ('shift', "Shift", 'int'), ('clock_in', "Clock In"),
        ('clock_out', "Clock Out"), ('hours', "Hours", 'num'),
        ('approved', "Approved", 'bool'), ('exported', "Exported", 'bool')],
    filters=[f_range('clock', "Employee Clock No"),
        f_dates('date', "Clock In Date", column='_date'),
        f_radio('approved', "Have Been", ("Not Approved", "Approved"),
            'approved', default='both'),
        f_active("Employees")],
    group_by='employee', sort='clock_in', totals=['hours'])
def employee_attendance_history(desk, p):
    "The clock in / out tickets (Time and Attendance)"
    Time = model('nline.js.employee_time')
    if Time is None:
        p.gap("Time and attendance tickets: not in Tryton yet "
            "(nline_js_shopfloor).")
        return []
    start, end = p.dates('date')
    domain = []
    if start:
        domain.append(('clock_in', '>=', dt.datetime.combine(start,
                    dt.time())))
    if end:
        domain.append(('clock_in', '<', dt.datetime.combine(
                    end + dt.timedelta(days=1), dt.time())))
    rows = []
    with Transaction().set_context(active_test=False):
        times = Time.search(domain, order=[('clock_in', 'ASC')])
    for time in times:
        employee = time.employee
        rows.append({
                'clock': attr(employee, 'clock_no', 'code') or
                employee.party.code or '',
                'employee': employee.party.name,
                'shift': time.shift_no,
                'clock_in': time.clock_in.strftime('%Y-%m-%d %H:%M')
                if time.clock_in else '',
                'clock_out': time.clock_out.strftime('%Y-%m-%d %H:%M')
                if time.clock_out else '',
                'hours': time.hours_worked,
                'approved': bool(time.approved),
                'exported': bool(time.exported),
                '_active': attr(employee, 'active') is not False,
                })
    return rows
