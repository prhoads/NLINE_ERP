# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"Jobshop reports: Shopfloor and Planning"
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.pool import Pool
from trytond.transaction import Transaction

from .report_inventory import _part_codes, _products
from .reports import (
    WORK_ORDER_STATUS, WORK_ORDER_STATUSES, ZERO, attr, code, code_rows,
    dec, f_check, f_dates, f_range, f_status, hours, model, move_cost, name,
    part_id, production_costs, quantities, report, shipped)

CENT = Decimal('0.01')
OPEN = ['request', 'draft', 'waiting', 'assigned', 'running']


def _company():
    return Transaction().context.get('company')


def _work_orders(p, states=None, key='wo'):
    Production = Pool().get('production')
    domain = [('company', '=', _company())]
    if states:
        domain.append(('state', 'in', states))
    start, end = p.get(key + '_from'), p.get(key + '_to')
    if start:
        domain.append(('number', '>=', start))
    if end:
        domain.append(('number', '<=', end))
    return Production.search(domain, order=[('number', 'ASC')])


def _wo_head(production):
    return {
        'wo': production.number or str(production.id),
        'lot': attr(production, 'lot_id', 'js_lot') or '',
        'split': attr(production, 'split_id', 'js_split') or '',
        'part': part_id(production.product),
        'description': name(production.product),
        'status': WORK_ORDER_STATUS.get(production.state, production.state),
        'quantity': production.quantity,
        'unit': production.unit.symbol if production.unit else '',
        'want_date': production.planned_date,
        'release_date': production.planned_start_date,
        'start_date': production.effective_start_date,
        'close_date': production.effective_date,
        '_drill': {'type': 'screen', 'route':
            'work-orders/%s' % production.id},
        }


def _received(production):
    return sum((m.quantity for m in production.outputs
            if m.state == 'done' and m.product == production.product), 0.0)


def _clock(employee):
    "Clock number and name of an employee"
    if not employee:
        return '', ''
    number = attr(employee, 'clock_no', 'code', 'clock_number') or \
        employee.party.code or ''
    return number, employee.party.name


def _ticket_model():
    "Jobshop's labor tickets (nline_js_shopfloor) when installed"
    return model('nline.js.labor_ticket')


def _cycles(p, key='date'):
    """The labor tickets of the dates: Jobshop's labor tickets when
    installed, else the done work cycles"""
    Ticket = _ticket_model()
    start, end = p.dates(key)
    if Ticket is not None:
        # (a reversed ticket and its reversal net out)
        domain = [('company', '=', _company()),
            ('state', 'in', ['posted', 'saved'])]
        if start:
            domain.append(('transaction_date', '>=',
                    dt.datetime.combine(start, dt.time())))
        if end:
            domain.append(('transaction_date', '<', dt.datetime.combine(
                        end + dt.timedelta(days=1), dt.time())))
        return Ticket.search(domain, order=[('transaction_date', 'ASC'),
                ('id', 'ASC')])
    Cycle = model('production.work.cycle')
    if Cycle is None:
        return []
    domain = [('state', '=', 'done'), ('work.company', '=', _company())]
    if start:
        domain.append(('create_date', '>=', dt.datetime.combine(start,
                    dt.time())))
    if end:
        domain.append(('create_date', '<', dt.datetime.combine(
                    end + dt.timedelta(days=1), dt.time())))
    return Cycle.search(domain, order=[('create_date', 'ASC')])


def _ticket(record):
    """A labor ticket row; '_work' and '_production' are the operation and
    the work order"""
    if record.__name__ == 'nline.js.labor_ticket':
        work = record.work
        production = record.production or (work.production if work
            else None)
        number, employee = _clock(record.employee)
        kind = record.type or 'run'
        h = record.hours_worked or 0.0
        labor = record.labor_cost or ZERO
        burden = record.burden_cost or ZERO
        row = {
            'clock': number,
            'employee': employee,
            'shift': record.shift_no or '',
            'date': record.transaction_date.date()
            if record.transaction_date else None,
            'clock_in': record.clock_in,
            'clock_out': record.clock_out,
            'completed': record.completed_qty,
            'deviated': record.deviated_qty,
            'reason': name(record.reason_code),
            'labor_cost': labor,
            'burden_cost': burden,
            'total_cost': labor + burden,
            'resource': name(record.resource) or (name(work.work_center)
                if work else ''),
            }
    else:
        work = record.work
        production = work.production
        number, employee = _clock(record.done_by or record.run_by)
        kind = 'run'
        h = hours(record.duration)
        row = {
            'clock': number,
            'employee': employee,
            'shift': '',
            'date': record.create_date.date() if record.create_date
            else None,
            'clock_in': record.create_date,
            'clock_out': record.write_date,
            'completed': None,
            'deviated': None,
            'reason': '',
            'labor_cost': record.cost or ZERO,
            'burden_cost': ZERO,
            'total_cost': record.cost or ZERO,
            'resource': name(work.work_center),
            }
    row.update({
            'wo': (production.number or str(production.id)) if production
            else '',
            'part': part_id(production.product) if production else '',
            'description': name(production.product) if production else '',
            'seq': work.sequence if work else None,
            'operation': (attr(work, 'description') or (work.operation.name
                    if work.operation else '')) if work else (
                'Indirect' if kind == 'indirect' else ''),
            'type': str(kind).capitalize(),
            'setup': h if kind == 'setup' else 0.0,
            'run': h if kind != 'setup' else 0.0,
            'hours': h,
            '_work': work,
            '_production': production,
            '_drill': {'type': 'screen', 'route':
                'work-orders/%s' % production.id} if production else None,
            })
    return row


def _labor_gaps(p):
    if _ticket_model() is not None:
        return
    if model('production.work.cycle') is None:
        p.gap("Labor: Tryton module production_work is not activated.")
        return
    p.gap("Labor tickets: Jobshop's labor tickets (nline_js_shopfloor) are "
        "not installed; Tryton's work cycles have no setup / run type, "
        "shift, completed or deviated quantity and no burden (the hours "
        "count as run hours).")


LABOR_FILTERS = [f_dates('date', "Clock In Date", default='this-month'),
    f_range('clock', "Clock Number"), f_range('wo', "Work Order ID"),
    f_range('resource', "Resource ID")]


@report('labor_list', "Labor List", 'shopfloor', 'LaborList.rpt',
    ['production.work.cycle'],
    [('clock', "Clock Number"), ('employee', "Employee Name"),
        ('shift', "Shift"), ('clock_in', "Clock In Time"),
        ('wo', "Work Order"), ('resource', "Resource ID"),
        ('operation', "Operation Description"),
        ('setup', "Setup Hours", 'num'), ('run', "Run Hours", 'num'),
        ('hours', "Total Hours", 'num'),
        ('labor_cost', "Labor Cost", 'money'),
        ('burden_cost', "Burden Cost", 'money'),
        ('total_cost', "Total Cost", 'money')],
    filters=LABOR_FILTERS, group_by='employee', sort='clock_in',
    totals=['setup', 'run', 'hours', 'labor_cost', 'burden_cost',
        'total_cost'], landscape=True)
def labor_list(desk, p):
    _labor_gaps(p)
    return [_ticket(r) for r in _cycles(p)]


@report('labor_transaction', "Labor Transaction", 'shopfloor', 'Labor.rpt',
    ['production.work.cycle'],
    [('wo', "Work Order ID"), ('date', "Transaction Date", 'date'),
        ('seq', "Op Seq", 'int'), ('clock', "Clock Number"),
        ('employee', "Employee Name"), ('shift', "Shift"),
        ('type', "Setup/Run"), ('clock_in', "Clock In"),
        ('clock_out', "Clock Out"), ('hours', "Hours", 'num'),
        ('completed', "Completed Qty", 'qty'),
        ('deviated', "Deviated Qty", 'qty'),
        ('labor_cost', "Labor Cost", 'money')],
    filters=LABOR_FILTERS, group_by='wo', sort='clock_in',
    totals=['hours', 'labor_cost'], landscape=True)
def labor_transaction(desk, p):
    _labor_gaps(p)
    return [_ticket(r) for r in _cycles(p)]


def _efficiency_rows(p, key):
    "Estimated against actual hours by employee or resource"
    stats = {}
    for record in _cycles(p):
        ticket = _ticket(record)
        work = ticket['_work']
        if work is None:
            # Indirect labor has no operation to compare with
            continue
        k = (ticket[key], ticket['wo'], work.id)
        stat = stats.setdefault(k, dict(ticket, hours=0.0, setup=0.0,
                run=0.0, completed=0.0, work=work))
        stat['hours'] += ticket['hours']
        stat['setup'] += ticket['setup']
        stat['run'] += ticket['run']
        stat['completed'] += ticket['completed'] or 0
    rows = []
    for stat in stats.values():
        work = stat.pop('work')
        planned = hours(getattr(work, 'planned_duration', None))
        stat['estimated'] = planned
        stat['variance'] = round(stat['hours'] - planned, 2) if planned \
            else None
        stat['efficiency'] = round(100.0 * planned / stat['hours'], 1) \
            if planned and stat['hours'] else None
        quantity = work.production.quantity or 0
        stat['est_rate'] = round(quantity / planned, 2) if planned else None
        stat['act_rate'] = round((stat['completed'] or quantity)
            / stat['hours'], 2) if stat['hours'] else None
        rows.append(stat)
    return rows


@report('employee_efficiency', "Employee Efficiency", 'shopfloor',
    'EmployeeEfficiency.rpt', ['production.work.cycle'],
    [('employee', "Employee"), ('wo', "Work Order ID"),
        ('resource', "Resource ID"), ('operation', "Operation"),
        ('part', "Part ID"), ('date', "Clock In Date", 'date'),
        ('completed', "Completed Qty", 'qty'),
        ('hours', "Hours Worked", 'num'),
        ('estimated', "Estimated Hours", 'num'),
        ('est_rate', "Est Parts/Hour", 'num'),
        ('act_rate', "Act Parts/Hour", 'num'),
        ('efficiency', "Efficiency %", 'pct')],
    filters=LABOR_FILTERS, group_by='employee', sort='date',
    totals=['hours', 'estimated'], landscape=True,
    chart={'label': 'employee', 'value': 'hours', 'title': "Hours Worked"})
def employee_efficiency(desk, p):
    _labor_gaps(p)
    return _efficiency_rows(p, 'employee')


@report('resource_efficiency', "Resource Efficiency", 'shopfloor',
    'ResourceEfficiency.rpt', ['production.work.cycle'],
    [('resource', "Resource ID"), ('wo', "Work Order"),
        ('seq', "Sequence", 'int'), ('part', "Part ID"),
        ('setup', "Actual Setup Hrs", 'num'), ('run', "Actual Run Hrs",
            'num'), ('estimated', "Estimated Hrs", 'num'),
        ('variance', "Variance Hrs", 'num'),
        ('efficiency', "Efficiency %", 'pct')],
    filters=LABOR_FILTERS, group_by='resource', sort='wo',
    totals=['setup', 'run', 'estimated'],
    chart={'label': 'resource', 'value': 'run', 'title': "Actual Hours"})
def resource_efficiency(desk, p):
    _labor_gaps(p)
    return _efficiency_rows(p, 'resource')


@report('labor_analysis', "Labor Analysis", 'shopfloor', 'Runtimevar.rpt',
    ['production.work.cycle'],
    [('wo', "Work Order"), ('seq', "Seq", 'int'),
        ('resource', "Resource ID"), ('employee', "Employee"),
        ('estimated', "Estimated Hrs", 'num'), ('setup', "Actual Setup",
            'num'), ('run', "Actual Run", 'num'),
        ('variance', "Variance", 'num'), ('efficiency', "Efficiency %",
            'pct')],
    filters=LABOR_FILTERS + [{'type': 'option', 'key': 'by',
            'label': "Efficiency By", 'options': [['employee', "Employee"],
                ['resource', "Resource"]], 'default': 'employee'}],
    group_by='wo', sort='seq', totals=['estimated', 'setup', 'run'])
def labor_analysis(desk, p):
    _labor_gaps(p)
    return _efficiency_rows(p, p.get('by') or 'employee')


def _throughput(p, key):
    "Throughput (shop rate): sales less material and service by hour"
    stats = {}
    for record in _cycles(p):
        ticket = _ticket(record)
        production = ticket['_production']
        if production is None:
            continue
        k = ticket[key]
        stat = stats.setdefault(k, {key: k, 'hours': 0.0, 'completed': 0.0,
                'deviated': 0.0, 'productions': set()})
        stat['hours'] += ticket['hours']
        stat['completed'] += ticket['completed'] or 0
        stat['deviated'] += ticket['deviated'] or 0
        stat['productions'].add(production)
    rows = []
    for stat in stats.values():
        sales = material = service = ZERO
        for production in stat.pop('productions'):
            costs = production_costs(production)
            material += costs['material_act']
            service += costs['service']
            line = production.origin if production.origin is not None \
                and production.origin.__name__ == 'sale.line' else None
            if line:
                sales += line.amount or ZERO
        stat.update({
                'sales': sales, 'material': material, 'service': service,
                'throughput': sales - material - service,
                'rate': ((sales - material - service) / dec(stat['hours'])
                    ).quantize(CENT) if stat['hours'] else None,
                })
        rows.append(stat)
    p.gap("Throughput: the sales of a work order are those of the sales "
        "order line it was made for.")
    return rows


THROUGHPUT = [('hours', "Hours", 'num'), ('completed', "Completed Qty",
        'qty'), ('deviated', "Deviated Qty", 'qty'),
    ('sales', "Sales", 'money'), ('material', "Material", 'money'),
    ('service', "Service", 'money'), ('throughput', "Throughput", 'money'),
    ('rate', "Throughput/Hour", 'money')]


@report('employee_throughput', "Employee Throughput", 'shopfloor',
    'EmployeeThroughput.rpt', ['production.work.cycle'],
    [('employee', "Employee")] + THROUGHPUT,
    filters=LABOR_FILTERS, sort='employee',
    totals=['hours', 'sales', 'material', 'service', 'throughput'])
def employee_throughput(desk, p):
    _labor_gaps(p)
    return _throughput(p, 'employee')


@report('resource_throughput', "Resource Throughput", 'shopfloor',
    'ResourceThroughput.rpt', ['production.work.cycle'],
    [('resource', "Resource ID")] + THROUGHPUT,
    filters=LABOR_FILTERS, sort='resource',
    totals=['hours', 'sales', 'material', 'service', 'throughput'])
def resource_throughput(desk, p):
    _labor_gaps(p)
    return _throughput(p, 'resource')


@report('customer_throughput', "Customer Throughput", 'shopfloor',
    'CustomerThroughput.rpt', ['production', 'sale.sale'],
    [('customer', "Customer ID"), ('wo', "Work Order"),
        ('order_date', "Order Date", 'date'),
        ('ordered', "Ordered Qty", 'qty'), ('shipped', "Shipped Qty", 'qty'),
        ('material', "Actual Material", 'money'),
        ('service', "Actual Service", 'money'),
        ('sales', "Sales", 'money'), ('hours', "Hours", 'num'),
        ('throughput', "Throughput", 'money'),
        ('rate', "Throughput/Hour", 'money')],
    filters=[f_range('customer', "Customer ID"),
        f_dates('close_date', "Closed Date", column='close_date')],
    group_by='customer', sort='wo',
    totals=['material', 'service', 'sales', 'hours', 'throughput'],
    landscape=True)
def customer_throughput(desk, p):
    rows = []
    for production in _work_orders(p):
        line = production.origin if production.origin is not None and \
            production.origin.__name__ == 'sale.line' else None
        if not line:
            continue
        costs = production_costs(production)
        sales = line.amount or ZERO
        throughput = sales - costs['material_act'] - costs['service']
        row = _wo_head(production)
        row.update({
                'customer': code(line.sale.party),
                'order_date': line.sale.sale_date,
                'ordered': line.quantity,
                'shipped': shipped(line),
                'material': costs['material_act'],
                'service': costs['service'],
                'sales': sales,
                'hours': costs['hours_act'],
                'throughput': throughput,
                'rate': (throughput / dec(costs['hours_act'])).quantize(CENT)
                if costs['hours_act'] else None,
                })
        rows.append(row)
    return rows


@report('employee_list', "Employee List", 'shopfloor', 'EmployeeList.rpt',
    ['company.employee'],
    [('clock', "Clock Number"), ('employee', "Employee Name"),
        ('shift', "Shift"), ('cost_hour', "Cost/Hour", 'money'),
        ('cost_unit', "Cost/Unit", 'money'), ('active', "Active", 'bool')],
    filters=[f_range('clock', "Clock Number")], sort='clock', totals=[],
    advanced=True)
def employee_list(desk, p):
    Employee = Pool().get('company.employee')
    with Transaction().set_context(active_test=False):
        employees = Employee.search([('company', '=', _company())])
    rows = []
    for employee in employees:
        rows.append({
                'clock': attr(employee, 'clock_no', 'code',
                    'clock_number') or employee.party.code or '',
                'employee': employee.party.name,
                'shift': attr(employee, 'shift_no', 'shift') or '',
                'cost_hour': attr(employee, 'cost_price'),
                'cost_unit': attr(employee, 'cost_per_unit'),
                # (company.employee has no active field in every setup)
                'active': attr(employee, 'active') is not False,
                '_active': attr(employee, 'active') is not False,
                '_drill': {'type': 'record', 'model': 'company.employee',
                    'id': employee.id},
                })
    return rows


@report('employee_label', "Employee Label", 'shopfloor',
    'EmployeeLabel.rpt', ['company.employee'],
    [('clock', "Clock Number"), ('employee', "Employee Name"),
        ('barcode', "Barcode")],
    filters=[f_range('clock', "Clock Number")], sort='clock', totals=[],
    advanced=True, note="Print on Avery 5160 labels: the screen prints the "
    "labels three across.")
def employee_label(desk, p):
    rows = employee_list(desk, p)
    for row in rows:
        row['barcode'] = '*%s*' % row['clock'] if row['clock'] else ''
    # (the dialog's "For" keeps the active employees by default)
    return rows


def _material_rows(p, states):
    "The materials (inputs) of the work orders not issued yet"
    rows = []
    Card = model('production.material_card')
    for production in _work_orders(p, states):
        cards = {}
        if Card is not None:
            for card in Card.search([('production', '=', production.id)]):
                move = attr(card, 'move') and card.move
                if move:
                    cards[move.id] = card
        for move in production.inputs:
            if move.state in {'done', 'cancelled'}:
                continue
            card = cards.get(move.id)
            work = None
            seq = attr(card, 'operation') if card else None
            if seq is not None:
                for w in getattr(production, 'works', []) or []:
                    if w.sequence == seq:
                        work = w
            issued = sum((m.quantity for m in production.inputs
                    if m.state == 'done' and m.product == move.product), 0.0)
            row = _wo_head(production)
            row.update({
                    'material': part_id(move.product),
                    'material_description': move.product.name,
                    'location': move.from_location.code or
                    move.from_location.name,
                    'seq': seq,
                    'piece': attr(card, 'piece') if card else None,
                    'resource': name(work.work_center) if work else '',
                    'operation': work.operation.name if work and
                    work.operation else '',
                    'required': move.planned_date or production.planned_date,
                    'issued': issued,
                    'due': move.quantity,
                    'unit': move.unit.symbol,
                    'stock_unit': move.product.default_uom.symbol,
                    'dimensions': attr(card, 'dimensions') if card
                    else None,
                    'piece_tracked': bool(attr(move.product.template,
                            'piece_tracked')),
                    })
            rows.append(row)
    return rows


@report('pick_list', "Pick List", 'shopfloor', 'PickList.rpt',
    ['production'],
    [('wo', "Work Order"), ('material', "Part ID"),
        ('material_description', "Description"),
        ('location', "Primary Location"), ('seq', "Sequence", 'int'),
        ('piece', "Piece", 'int'), ('resource', "Resource ID"),
        ('operation', "Operation Description"),
        ('required', "Date Required", 'date'),
        ('issued', "Qty Issued to Date", 'qty'), ('due', "Qty Due", 'qty'),
        ('stock_unit', "Stock UM"), ('unit', "Usage UM")],
    filters=[f_range('wo', "Work Order ID"),
        f_dates('required', "Date Required")],
    group_by='wo', sort='seq', totals=[], landscape=True)
def pick_list(desk, p):
    return _material_rows(p, ['draft', 'waiting', 'assigned', 'running'])


@report('cut_list', "Cut List", 'shopfloor', 'CutList.rpt', ['production'],
    [('wo', "Work Order"), ('seq', "Sequence", 'int'),
        ('piece', "Piece", 'int'), ('material', "Part ID"),
        ('material_description', "Description"),
        ('due', "Quantity", 'qty'), ('unit', "UM"),
        ('dimensions', "Dimensions"),
        ('resource', "Resource ID"), ('operation', "Operation")],
    filters=[f_range('wo', "Work Order ID")], group_by='wo', sort='seq',
    totals=[], landscape=True)
def cut_list(desk, p):
    Template = Pool().get('product.template')
    rows = _material_rows(p, ['draft', 'waiting', 'assigned', 'running'])
    if 'piece_tracked' not in Template._fields:
        p.gap("Cut List: the parts are not piece tracked in Tryton yet "
            "(nline_js_inventory): every unissued material is listed.")
        return rows
    return [r for r in rows if r['piece_tracked']]


@report('production_brief', "Production", 'shopfloor',
    'ProductionBrief.rpt', ['production'],
    [('date', "Transaction Date", 'date'), ('wo', "Work Order"),
        ('seq', "Sequence", 'int'), ('part', "Work Order Part ID"),
        ('description', "Description"), ('type', "Transaction"),
        ('resource', "Resource ID"), ('quantity', "Quantity", 'qty'),
        ('hours', "Hours", 'num')],
    filters=[f_dates('date', "Transaction Date", default='this-month'),
        f_range('wo', "Work Order ID")],
    sort='date', totals=['hours'])
def production_brief(desk, p):
    Move = Pool().get('stock.move')
    rows = []
    for move in Move.search([('production_output', '!=', None),
                ('state', '=', 'done')] + p.domain_dates('date',
                'effective_date')):
        production = move.production_output
        row = _wo_head(production)
        row.update({'date': move.effective_date, 'seq': None,
                'part': part_id(move.product),
                'description': move.product.name, 'type': "Receipt",
                'resource': '', 'quantity': move.quantity, 'hours': None})
        rows.append(row)
    for record in _cycles(p):
        ticket = _ticket(record)
        rows.append(dict(ticket, type="Labor (%s)" % ticket['type'],
                quantity=ticket['completed']))
    return rows


def _quality(p, label):
    if _ticket_model() is None:
        p.gap("%s: Tryton's work cycles have no deviated quantity and "
            "reason (Jobshop's labor tickets of nline_js_shopfloor are not "
            "installed)." % label)
        return []
    rows = []
    for record in _cycles(p):
        ticket = _ticket(record)
        if not ticket['deviated']:
            continue
        completed = (ticket['completed'] or 0) + ticket['deviated']
        ticket['ppm'] = round(1e6 * ticket['deviated'] / completed) \
            if completed else None
        ticket['percent'] = round(100.0 * ticket['deviated'] / completed, 2) \
            if completed else None
        rows.append(ticket)
    return rows


QUALITY = [('date', "Labor Ticket Date", 'date'), ('wo', "Work Order ID"),
    ('seq', "Sequence", 'int'), ('part', "Part ID"),
    ('description', "Description"), ('reason', "Reason"),
    ('completed', "Completed Qty", 'qty'),
    ('deviated', "Deviated Qty", 'qty'), ('percent', "Percent", 'pct'),
    ('ppm', "PPM", 'int')]


@report('quality_tracking_graph', "Quality Tracking Graph", 'shopfloor',
    'QualityTrackingGraph.rpt', ['production.work.cycle'], QUALITY,
    filters=LABOR_FILTERS, sort='date', totals=['deviated'],
    chart={'label': 'date', 'value': 'deviated', 'kind': 'bar',
        'title': "Deviated Quantity over Time"})
def quality_tracking_graph(desk, p):
    return _quality(p, "Quality Tracking Graph")


@report('quality_variance', "Quality Variance", 'shopfloor',
    'Qualityvar.rpt', ['production.work.cycle'], QUALITY,
    filters=LABOR_FILTERS, group_by='reason', sort='date',
    totals=['deviated'], chart={'label': 'reason', 'value': 'deviated',
        'title': "Deviated Quantity by Reason"})
def quality_variance(desk, p):
    return _quality(p, "Quality Variance")


@report('resource_utilization', "Resource Utilization", 'shopfloor',
    'ResourceUtilization.rpt', ['production'],
    [('resource', "Resource ID"), ('week', "Week Of", 'date'),
        ('scheduled', "Scheduled Hours", 'num'),
        ('capacity', "Capacity Hours", 'num'),
        ('utilized', "Percent Utilized", 'pct')],
    filters=[f_range('resource', "Resource ID"),
        f_dates('week', "Week Of")],
    group_by='resource', sort='week', totals=['scheduled'],
    chart={'label': 'resource', 'value': 'scheduled',
        'title': "Scheduled Hours"})
def resource_utilization(desk, p):
    Work = model('production.work')
    if Work is None:
        return []
    stats = defaultdict(float)
    capacities = {}
    for work in Work.search([('production.state', 'in', OPEN),
                ('state', 'not in', ['finished', 'done'])]):
        date = work.production.planned_start_date or \
            work.production.planned_date
        if not date:
            continue
        week = date - dt.timedelta(days=date.weekday())
        resource = name(work.work_center) or '-'
        stats[(resource, week)] += hours(
            getattr(work, 'planned_duration', None))
        if resource not in capacities:
            capacities[resource] = _weekly_capacity(work.work_center)
    if not all(capacities.values()):
        p.gap("Resource capacity: a resource without a weekly calendar "
            "(Shop Resources > Calendar) counts 40 hours a week.")
    return [{
            'resource': resource, 'week': week,
            'scheduled': round(h, 2),
            'capacity': capacities.get(resource) or 40.0,
            'utilized': round(100.0 * h / (capacities.get(resource) or 40.0),
                1),
            } for (resource, week), h in stats.items()]


def _weekly_capacity(center):
    "The hours a week of the resource: its calendar's shifts by capacity"
    weeks = getattr(center, 'calendar_weeks', None) if center else None
    if not weeks:
        return None
    total = 0.0
    for day in weeks:
        for shift in ('1', '2', '3'):
            total += (getattr(day, 'shift_' + shift, None) or 0) * (
                getattr(day, 'shift_%s_capacity' % shift, None) or 1)
    return round(total, 2) or None


@report('resource_where_used', "Resource Where Used", 'shopfloor',
    'ResourceWhereUsed.rpt', ['production.routing'],
    [('resource', "Resource ID"), ('type', "Master/Work Order"),
        ('master', "Engineering ID / Work Order"), ('seq', "Sequence",
            'int'), ('operation', "Operation Description"),
        ('part', "Part"), ('description', "Description"),
        ('setup', "Setup Time", 'num'), ('run', "Run Time", 'num')],
    filters=[f_range('resource', "Resource ID")], group_by='resource',
    sort='master', totals=[])
def resource_where_used(desk, p):
    pool = Pool()
    ProductBom = pool.get('product.product-production.bom')
    rows = []
    for product_bom in ProductBom.search([('routing', '!=', None)]):
        for step in product_bom.routing.steps:
            category = getattr(step.operation, 'work_center_category', None)
            rows.append({
                    'resource': name(category) or (attr(step, 'supplier')
                        or ''),
                    'type': "Master",
                    'master': attr(product_bom.bom, 'revision') or
                    product_bom.bom.name,
                    'seq': step.sequence,
                    'operation': step.operation.name,
                    'part': part_id(product_bom.product),
                    'description': product_bom.product.name,
                    'setup': hours(getattr(step, 'setup_duration', None)),
                    'run': hours(getattr(step, 'run_duration', None)),
                    })
    Work = model('production.work')
    if Work is not None:
        for work in Work.search([('production.state', 'in', OPEN)]):
            production = work.production
            rows.append({
                    'resource': name(work.work_center) or name(
                        getattr(work, 'work_center_category', None)),
                    'type': "Work Order",
                    'master': production.number or '',
                    'seq': work.sequence,
                    'operation': work.operation.name if work.operation
                    else '',
                    'part': part_id(production.product),
                    'description': name(production.product),
                    'setup': None,
                    'run': hours(getattr(work, 'planned_duration', None)),
                    })
    return rows


@report('schedule_performance', "Schedule Performance", 'shopfloor',
    'SchedulePerformance.rpt', ['production'],
    [('wo', "Work Order ID"), ('part', "Part ID"),
        ('description', "Description"), ('status', "Status"),
        ('quantity', "Desired Qty", 'qty'), ('received', "Received Qty",
            'qty'), ('shipped', "Shipped Qty", 'qty'),
        ('release_date', "Release Date", 'date'),
        ('start_date', "Actual Start", 'date'),
        ('want_date', "Want Date", 'date'),
        ('close_date', "Finished", 'date'), ('days_late', "Days Late",
            'int')],
    filters=[f_range('wo', "Work Order ID"),
        f_status('status', "Status", WORK_ORDER_STATUSES),
        f_dates('want_date', "Want Date")],
    sort='want_date', totals=[], advanced=True, landscape=True)
def schedule_performance(desk, p):
    today = dt.date.today()
    rows = []
    for production in _work_orders(p):
        if production.state == 'cancelled':
            continue
        row = _wo_head(production)
        line = production.origin if production.origin is not None and \
            production.origin.__name__ == 'sale.line' else None
        finish = production.effective_date or (
            today if production.state != 'done' else None)
        want = production.planned_date
        row.update({
                'received': _received(production),
                'shipped': shipped(line) if line else None,
                'days_late': (finish - want).days if finish and want and
                finish > want else 0,
                })
        rows.append(row)
    return rows


@report('shop_resource_list', "Shop Resource List", 'shopfloor',
    'Shopresourcelist.rpt', ['production.work.center'],
    [('id', "Resource ID"), ('description', "Description"),
        ('type', "Type"), ('setup_hour', "Set Up/Hour", 'money'),
        ('run_hour', "Run/Hour", 'money'), ('run_unit', "Run/Unit",
            'money'), ('burden_hour', "Burden Per Hour", 'money'),
        ('burden_pct', "Burden Percent", 'pct'),
        ('capacity', "Shift Capacity", 'int'),
        ('warehouse', "Warehouse")],
    filters=[f_range('id', "Resource ID")], sort='id', totals=[],
    advanced=True, landscape=True)
def shop_resource_list(desk, p):
    WorkCenter = Pool().get('production.work.center')
    rows = []
    with Transaction().set_context(active_test=False):
        centers = WorkCenter.search([])
    for center in centers:
        per_hour = center.cost_method == 'hour'
        rows.append({
                'id': center.name,
                'description': attr(center, 'description') or center.name,
                'type': attr(center, 'resource_type') or name(center.category),
                'setup_hour': attr(center, 'setup_cost_price') or (
                    center.cost_price if per_hour else None),
                'run_hour': center.cost_price if per_hour else None,
                'run_unit': center.cost_price if not per_hour else None,
                'burden_hour': attr(center, 'burden_per_hour'),
                'burden_pct': attr(center, 'burden_percent'),
                'capacity': attr(center, 'shift_1_capacity', 'capacity'),
                'warehouse': name(center.warehouse),
                '_drill': {'type': 'record',
                    'model': 'production.work.center', 'id': center.id},
                })
    WorkCenterModel = Pool().get('production.work.center')
    if 'shift_1_capacity' not in WorkCenterModel._fields:
        p.gap("Shop resources: the shift capacities are not in Tryton yet "
            "(nline_js_shopfloor).")
    p.gap("Shop resources: Tryton has one cost per hour (or unit) per "
        "resource; the burden rates are on the operations.")
    return rows


def shop_code_report(id, rname, rpt, label, candidates, columns, extra,
        id_fields=None, description_fields=None):
    @report(id, rname, 'shopfloor', rpt, [], columns,
        filters=[f_range('id', "%s ID" % label)], advanced=True, totals=[])
    def rows(desk, p):
        return code_rows(p, label, candidates, extra, id_fields,
            description_fields)
    return rows


shop_code_report('shop_view_list', "Shop View List", 'Shopviewlist.rpt',
    "Shop View", ['nline.js.shop_view', 'nline.shop_view'],
    [('id', "Shop View ID"), ('description', "Description"),
        ('resources', "Resource IDs")],
    {'resources': ('resource_lines', 'resources', 'work_centers')})
CALENDAR_SHIFTS = {
    'start': ('start_of_day', 'start_time'),
    'shift1': ('shift_1',), 'shift2': ('shift_2',), 'shift3': ('shift_3',),
    'capacity1': ('shift_1_capacity',), 'capacity2': ('shift_2_capacity',),
    'capacity3': ('shift_3_capacity',)}
CALENDAR_COLUMNS = [('start', "Start of Day"),
    ('shift1', "Shift 1 Hrs", 'num'), ('shift2', "Shift 2 Hrs", 'num'),
    ('shift3', "Shift 3 Hrs", 'num'), ('capacity1', "Shift 1 Capacity",
        'num'), ('capacity2', "Shift 2 Capacity", 'num'),
    ('capacity3', "Shift 3 Capacity", 'num')]
shop_code_report('calendar_week_list', "Calendar Week List",
    'CalendarWeekList.rpt', "Resource",
    ['nline.js.calendar.week', 'nline.js.calendar_week'],
    [('id', "Resource ID"), ('description', "Day of Week")]
    + CALENDAR_COLUMNS, CALENDAR_SHIFTS,
    id_fields=('resource', 'employee'), description_fields=('day_of_week',))
shop_code_report('calendar_change_list', "Calendar Exception List",
    'CalendarChangeList.rpt', "Resource",
    ['nline.js.calendar.change', 'nline.js.calendar_exception'],
    [('id', "Resource ID"), ('description', "Reason"),
        ('start_date', "Start Date", 'date'), ('end_date', "End Date",
            'date')] + CALENDAR_COLUMNS,
    dict(CALENDAR_SHIFTS, start_date=('start_date',),
        end_date=('end_date',)),
    id_fields=('resource', 'employee'), description_fields=('reason_code',))


@report('traveler', "Traveler", 'shopfloor', 'Traveller.rpt',
    ['production'],
    [('wo', "Work Order"), ('part', "Part ID"),
        ('quantity', "Quantity", 'qty'), ('want_date', "Want Date", 'date'),
        ('release_date', "Release Date", 'date'), ('order', "Sales Order"),
        ('seq', "Seq", 'int'), ('kind', "Type"),
        ('item', "Resource / Material"), ('detail', "Description"),
        ('required', "Required", 'qty'), ('hours', "Hours", 'num')],
    filters=[f_range('wo', "Work Order ID"),
        f_status('status', "Status", WORK_ORDER_STATUSES)],
    group_by='wo', sort='seq', totals=[], landscape=True,
    note="The printed traveler of a work order (with bar codes) is the "
    "Traveler report of the Work Order window.")
def traveler(desk, p):
    rows = []
    for production in _work_orders(p, OPEN):
        head = _wo_head(production)
        line = production.origin if production.origin is not None and \
            production.origin.__name__ == 'sale.line' else None
        head['order'] = line.sale.number if line else ''
        for work in getattr(production, 'works', None) or []:
            rows.append(dict(head, seq=work.sequence, kind="Operation",
                    item=name(work.work_center),
                    detail=work.operation.name if work.operation else '',
                    required=None,
                    hours=hours(getattr(work, 'planned_duration', None))))
        for move in production.inputs:
            rows.append(dict(head, seq=None, kind="Material",
                    item=part_id(move.product), detail=move.product.name,
                    required=move.quantity, hours=None))
    return rows


COST_COLUMNS = [('material_act', "Material Cost", 'money'),
    ('labor_act', "Labor Cost", 'money'), ('burden', "Burden Cost", 'money'),
    ('service', "Service Cost", 'money'), ('total', "Total Cost", 'money')]


def _cost_row(production):
    row = _wo_head(production)
    costs = production_costs(production)
    row.update(costs)
    row['burden'] = ZERO
    row['total'] = costs['material_act'] + costs['labor_act'] + \
        costs['service']
    row['estimated'] = costs['material_est'] + costs['labor_est'] + \
        costs['service']
    row['received'] = _received(production)
    return row


@report('wip_value', "WIP Value", 'shopfloor', 'WIPValue.rpt',
    ['production'],
    [('wo', "Work Order"), ('part', "Part ID"),
        ('description', "Description"), ('status', "Order Status"),
        ('quantity', "Desired Qty", 'qty'), ('received', "Received Qty",
            'qty')] + COST_COLUMNS,
    filters=[f_range('wo', "Work Order ID"), f_range('part', "Part ID")],
    sort='wo', landscape=True)
def wip_value(desk, p):
    return [_cost_row(pr) for pr in _work_orders(p, ['waiting', 'assigned',
                'running'])]


@report('work_order_history', "Work Order History", 'shopfloor',
    'WorkOrderHistory.rpt', ['production'],
    [('wo', "Work Order ID"), ('lot', "Lot ID"), ('part', "Part ID"),
        ('status', "Status"), ('want_date', "Desired Want Date", 'date'),
        ('release_date', "Released Date", 'date'),
        ('close_date', "Closed Date", 'date'),
        ('quantity', "Desired Qty", 'qty'),
        ('received', "Received Qty", 'qty')] + COST_COLUMNS,
    filters=[f_range('wo', "Work Order ID"),
        f_status('status', "Status", WORK_ORDER_STATUSES),
        f_dates('close_date', "Closed Date")],
    sort='wo', landscape=True)
def work_order_history(desk, p):
    return [_cost_row(pr) for pr in _work_orders(p)]


@report('work_order_list', "Work Order List", 'shopfloor',
    'WorkOrderList.rpt', ['production'],
    [('wo', "Work Order ID"), ('lot', "Lot ID"), ('split', "Split ID"),
        ('part', "Part ID"), ('status', "Status"),
        ('estimated', "Estimated Cost", 'money'),
        ('total', "Actual Cost", 'money'),
        ('variance', "Variance to Date", 'money'),
        ('projected', "Projected Cost", 'money'),
        ('projected_variance', "Projected Variance", 'money')],
    filters=[f_range('wo', "Work Order ID"),
        f_status('status', "Status", WORK_ORDER_STATUSES)],
    sort='wo', advanced=True, landscape=True)
def work_order_list(desk, p):
    rows = []
    for production in _work_orders(p):
        row = _cost_row(production)
        # Projected: the actual so far plus the estimate of what is left
        left_material = row['material_est'] - row['material_act']
        left_labor = max(row['labor_est'] - row['labor_act'], ZERO)
        projected = row['total'] + max(left_material, ZERO) + left_labor \
            if production.state not in {'done', 'cancelled'} \
            else row['total']
        row.update({
                'variance': row['total'] - row['estimated'],
                'projected': projected,
                'projected_variance': projected - row['estimated'],
                })
        rows.append(row)
    return rows


@report('work_order_cost', "Work Order Cost", 'shopfloor',
    'WorkOrderCost.rpt', ['production'],
    [('wo', "Work Order"), ('part', "Part ID"), ('status', "Status"),
        ('seq', "Sequence", 'int'), ('item', "Resource / Material"),
        ('required', "Required Qty", 'qty'),
        ('completed', "Completed Qty", 'qty'),
        ('est_material', "Est Material", 'money'),
        ('act_material', "Act Material", 'money'),
        ('est_labor', "Est Labor", 'money'),
        ('act_labor', "Act Labor", 'money'),
        ('est_hours', "Est Hours", 'num'), ('act_hours', "Act Hours",
            'num')],
    filters=[f_range('wo', "Work Order ID"),
        f_status('status', "Status", WORK_ORDER_STATUSES)],
    group_by='wo', sort='seq', landscape=True,
    totals=['est_material', 'act_material', 'est_labor', 'act_labor',
        'est_hours', 'act_hours'])
def work_order_cost(desk, p):
    rows = []
    for production in _work_orders(p):
        head = _wo_head(production)
        for work in getattr(production, 'works', None) or []:
            act = sum((c.cost or ZERO for c in work.cycles
                    if c.state == 'done'), ZERO)
            act_hours = sum((hours(c.duration) for c in work.cycles
                    if c.state == 'done'), 0.0)
            planned = hours(getattr(work, 'planned_duration', None))
            rate = work.work_center.cost_price if work.work_center and \
                work.work_center.cost_method == 'hour' else ZERO
            rows.append(dict(head, seq=work.sequence,
                    item=name(work.work_center) or (work.operation.name
                        if work.operation else ''),
                    required=production.quantity, completed=None,
                    est_material=None, act_material=None,
                    est_labor=(dec(planned) * (rate or ZERO)).quantize(CENT),
                    act_labor=act, est_hours=planned,
                    act_hours=round(act_hours, 2)))
        for move in production.inputs:
            rows.append(dict(head, seq=None, item=part_id(move.product),
                    required=move.quantity,
                    completed=move.quantity if move.state == 'done' else 0,
                    est_material=move_cost(move),
                    act_material=move_cost(move) if move.state == 'done'
                    else ZERO,
                    est_labor=None, act_labor=None, est_hours=None,
                    act_hours=None))
    return rows


# ---- Planning --------------------------------------------------------------

@report('material_netting', "Material Netting", 'planning',
    'MaterialNetting.rpt', ['product.product', 'sale.sale',
        'purchase.purchase', 'production'],
    [('part', "Part ID"), ('description', "Description"),
        ('date', "Date", 'date'), ('kind', "Supply / Demand"),
        ('document', "Order"), ('party', "Customer / Supplier"),
        ('supply', "Supply Qty", 'qty'), ('demand', "Demand Qty", 'qty'),
        ('balance', "Projected Balance", 'qty'), ('unit', "UM")],
    filters=[f_range('part', "Part ID"), f_check('short',
            "Only the parts that go short")],
    group_by='part', sort='date', totals=[], landscape=True)
def material_netting(desk, p):
    pool = Pool()
    Move = pool.get('stock.move')
    products = {pr.id: pr for pr in _products(p)
        if pr.template.type == 'goods'}
    on_hand = defaultdict(float)
    for (location, product), qty in quantities(list(products)).items():
        on_hand[product] += qty
    events = defaultdict(list)
    for move in Move.search([
                ('product', 'in', list(products)),
                ('state', 'in', ['draft', 'staging', 'assigned']),
                ]):
        src, dst = move.from_location.type, move.to_location.type
        if src == 'storage' and dst != 'storage':
            kind, qty = 'demand', move.internal_quantity or move.quantity
        elif dst == 'storage' and src != 'storage':
            kind, qty = 'supply', move.internal_quantity or move.quantity
        else:
            continue
        document = getattr(move, 'production_input', None) or getattr(
            move, 'production_output', None)
        party = ''
        if document is None and move.origin is not None:
            origin = move.origin
            if origin.__name__ == 'sale.line':
                document = origin.sale
                party = origin.sale.party.rec_name
            elif origin.__name__ == 'purchase.line':
                document = origin.purchase
                party = origin.purchase.party.rec_name
        events[move.product.id].append({
                'date': move.planned_date or dt.date.max,
                'kind': {'demand': "Demand", 'supply': "Supply"}[kind],
                'document': document.rec_name if document is not None
                else (move.shipment.rec_name if move.shipment else ''),
                'party': party,
                'supply': qty if kind == 'supply' else None,
                'demand': qty if kind == 'demand' else None,
                })
    rows = []
    for pid, product in products.items():
        if pid not in events and not on_hand.get(pid):
            continue
        balance = on_hand.get(pid, 0.0)
        part_rows = [{'part': part_id(product), 'description': product.name,
                'date': None, 'kind': "On Hand", 'document': '', 'party': '',
                'supply': None, 'demand': None, 'balance': balance,
                'unit': product.default_uom.symbol}]
        short = balance < 0
        for event in sorted(events.get(pid, []), key=lambda e: e['date']):
            balance += (event['supply'] or 0) - (event['demand'] or 0)
            short = short or balance < 0
            part_rows.append(dict(event, part=part_id(product),
                    description=product.name, balance=round(balance, 4),
                    unit=product.default_uom.symbol,
                    date=None if event['date'] == dt.date.max
                    else event['date']))
        if p.get('short') and not short:
            continue
        codes = _part_codes(product)
        for row in part_rows:
            row.update(codes)
        rows.extend(part_rows)
    return rows


@report('resource_schedule', "Resource Schedule", 'planning',
    'ResourceSchedule.rpt', ['production'],
    [('resource', "Resource ID"), ('start', "Scheduled Start", 'date'),
        ('finish', "Scheduled Finish", 'date'), ('wo', "Work Order"),
        ('seq', "Sequence", 'int'), ('operation', "Operation"),
        ('part', "Part ID"), ('quantity', "Quantity", 'qty'),
        ('hours', "Hours", 'num'), ('behind', "Behind Schedule", 'bool')],
    filters=[f_range('resource', "Resource ID"),
        f_dates('start', "Scheduled Start")],
    group_by='resource', sort='start', totals=['hours'])
def resource_schedule(desk, p):
    today = dt.date.today()
    rows = []
    Operation = model('nline.js.schedule.operation')
    if Operation is not None:
        # The last run of the scheduler (nline_js_planning)
        for op in Operation.search([('schedule.active', '=', True)],
                order=[('start', 'ASC')]):
            production = op.production
            finish = op.finish.date() if op.finish else None
            want = production.planned_date if production else None
            rows.append({
                    'resource': op.resource_name or name(op.resource),
                    'start': op.start.date() if op.start else None,
                    'finish': finish,
                    'wo': production.number if production else '',
                    'seq': op.sequence,
                    'operation': op.operation or '',
                    'part': part_id(production.product) if production
                    else '',
                    'quantity': production.quantity if production else None,
                    'hours': op.hours,
                    'behind': bool(finish and want and finish > want),
                    '_drill': {'type': 'screen', 'route':
                        'work-orders/%s' % production.id}
                    if production else None,
                    })
        return rows
    p.gap("Resource Schedule: the scheduler (nline_js_planning) is not "
        "installed; the planned dates of the work orders are shown.")
    Work = model('production.work')
    if Work is None:
        return []
    for work in Work.search([('production.state', 'in', OPEN),
                ('state', 'not in', ['finished', 'done'])]):
        production = work.production
        start = attr(work, 'planned_start_date', 'scheduled_start') or \
            production.planned_start_date
        finish = attr(work, 'planned_finish_date', 'scheduled_finish') or \
            production.planned_date
        rows.append({
                'resource': name(work.work_center) or name(
                    getattr(work, 'work_center_category', None)),
                'start': start,
                'finish': finish,
                'wo': production.number or '',
                'seq': work.sequence,
                'operation': work.operation.name if work.operation else '',
                'part': part_id(production.product),
                'quantity': production.quantity,
                'hours': hours(getattr(work, 'planned_duration', None)),
                'behind': bool(finish and finish < today),
                '_drill': {'type': 'screen', 'route':
                    'work-orders/%s' % production.id},
                })
    return rows
