# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"Jobshop reports: Engineering and Estimating"
from decimal import Decimal

from trytond.pool import Pool
from trytond.transaction import Transaction

from .reports import (
    QUOTE_STATUS, ZERO, attr, code, dec, f_dates, f_range,
    f_status, first_model, hours, name, part_id, report)

CENT = Decimal('0.01')


def _masters(p):
    "The engineering masters (part - BOM links) of the Part ID range"
    ProductBom = Pool().get('product.product-production.bom')
    domain = []
    start, end = p.get('part_from'), p.get('part_to')
    if start:
        domain.append(('product.code', '>=', start))
    if end:
        domain.append(('product.code', '<=', end))
    BOM = Pool().get('production.bom')
    if 'master_type' in BOM._fields:
        # The quote masters are Estimating's
        domain.append(('bom.master_type', '!=', 'quote'))
    return ProductBom.search(domain)


def _engineered(record):
    user = getattr(record, 'create_uid', None)
    return {
        'engineered_by': user.rec_name if user else '',
        'engineered_date': record.create_date.date()
        if getattr(record, 'create_date', None) else None,
        }


def _step_rate(step):
    "The cost per hour of the step's resource (first work center)"
    pool = Pool()
    WorkCenter = pool.get('production.work.center')
    category = getattr(step.operation, 'work_center_category', None)
    if not category:
        return ZERO
    centers = WorkCenter.search([('category', '=', category.id)], limit=1)
    if centers and centers[0].cost_method == 'hour':
        return centers[0].cost_price or ZERO
    return ZERO


def _master_lines(product_bom, quantity=None):
    "The operations and materials of a master as report rows"
    bom = product_bom.bom
    routing = getattr(product_bom, 'routing', None)
    output = sum(o.quantity for o in bom.outputs) or 1
    quantity = quantity or output
    rows = []
    head = {
        'part': part_id(product_bom.product),
        'master': attr(bom, 'revision') or bom.name,
        'drawing': attr(bom, 'drawing_number') or attr(
            product_bom.product.template, 'drawing_number') or '',
        'revision': attr(bom, 'drawing_revision') or '',
        'account_set': name(product_bom.product.account_category),
        'desired': quantity,
        }
    head.update(_engineered(bom))
    if routing:
        for step in routing.steps:
            setup = hours(getattr(step, 'setup_duration', None))
            run = hours(getattr(step, 'run_duration', None))
            category = getattr(step.operation, 'work_center_category', None)
            row = dict(head)
            row.update({
                    'seq': step.sequence,
                    'piece': None,
                    'kind': "Service" if attr(step, 'supplier') else
                    "Operation",
                    'item': name(category) or attr(step, 'service') or '',
                    'description': step.operation.name,
                    'qty_per': None,
                    'unit': '',
                    'quantity': None,
                    'setup': setup,
                    'run': run,
                    'step': step,
                    })
            rows.append(row)
    for line in bom.inputs:
        row = dict(head)
        row.update({
                'seq': attr(line, 'operation'),
                'piece': attr(line, 'piece'),
                'kind': "Material",
                'item': part_id(line.product),
                'description': line.product.name,
                'qty_per': line.quantity / output,
                'unit': line.unit.symbol,
                'quantity': round(line.quantity * quantity / output, 4),
                'setup': None,
                'run': None,
                'line': line,
                })
        rows.append(row)
    return rows


MASTER_COLUMNS = [('part', "Part ID"), ('master', "Engineering ID"),
    ('seq', "Seq", 'int'), ('piece', "Piece", 'int'), ('kind', "Type"),
    ('item', "Part / Resource"), ('description', "Description")]


@report('engineering_master', "Engineering Master", 'engineering',
    'EngineeringMaster.rpt', ['production.bom'],
    MASTER_COLUMNS + [('qty_per', "Qty Per", 'qty'), ('unit', "Usage UM"),
        ('quantity', "Calc Qty", 'qty'), ('setup', "Setup Hrs", 'num'),
        ('run', "Run Hrs/Unit", 'num'), ('drawing', "Drawing"),
        ('revision', "Revision"), ('account_set', "Account Set"),
        ('engineered_by', "Engineered By"),
        ('engineered_date', "Engineered Date", 'date')],
    filters=[f_range('part', "Part ID"), f_range('master', "Engineering ID")],
    group_by='part', sort='seq', totals=[], landscape=True)
def engineering_master(desk, p):
    rows = []
    for product_bom in _masters(p):
        for row in _master_lines(product_bom):
            row.pop('step', None)
            row.pop('line', None)
            rows.append(row)
    return rows


@report('engineering_master_cost', "Engineering Master Cost",
    'engineering', 'EngineeringMasterCost.rpt', ['production.bom'],
    MASTER_COLUMNS + [('quantity', "Calc Qty", 'qty'),
        ('material', "Material", 'money'), ('labor', "Labor", 'money'),
        ('service', "Service", 'money'), ('burden', "Burden", 'money'),
        ('total', "Total", 'money'), ('setup', "Setup Hrs", 'num'),
        ('run', "Run Hrs", 'num')],
    filters=[f_range('part', "Part ID"), f_range('master', "Engineering ID"),
        {'type': 'option', 'key': 'quantity', 'label': "Quantity",
            'options': [['', "Master quantity"], ['1', "1"], ['10', "10"],
                ['100', "100"]], 'default': ''}],
    group_by='part', sort='seq', landscape=True)
def engineering_master_cost(desk, p):
    rows = []
    quantity = float(p.get('quantity') or 0) or None
    for product_bom in _masters(p):
        for row in _master_lines(product_bom, quantity):
            step = row.pop('step', None)
            line = row.pop('line', None)
            material = labor = ZERO
            run_total = None
            if line is not None:
                material = ((line.product.cost_price or ZERO)
                    * dec(row['quantity'])).quantize(CENT)
            if step is not None:
                run_total = round((row['run'] or 0) * row['desired'], 2)
                labor = ((dec(row['setup'] or 0) + dec(run_total))
                    * _step_rate(step)).quantize(CENT)
                row['run'] = run_total
            row.update({'material': material, 'labor': labor,
                    'service': ZERO, 'burden': None,
                    'total': material + labor})
            rows.append(row)
    p.gap("Master costs: burden rates and outside service prices are not "
        "on the Tryton masters; labor is the work center's cost per hour.")
    return rows


@report('eng_master_list', "Engineering Master List", 'engineering',
    'EngMasterList.rpt', ['production.bom'],
    [('part', "Part ID"), ('master', "Engineering ID"),
        ('description', "Description"), ('current', "Current", 'bool'),
        ('materials', "Materials", 'int'), ('operations', "Operations",
            'int'), ('drawing', "Drawing"),
        ('engineered_by', "Engineered By"),
        ('engineered_date', "Engineered Date", 'date')],
    filters=[f_range('part', "Part ID"), f_range('master', "Engineering ID")],
    sort='part', totals=[], advanced=True)
def eng_master_list(desk, p):
    rows = []
    for product_bom in _masters(p):
        bom = product_bom.bom
        current = getattr(product_bom.product, 'get_bom', None)
        routing = getattr(product_bom, 'routing', None)
        row = {
            'part': part_id(product_bom.product),
            'master': attr(bom, 'revision') or bom.name,
            'description': product_bom.product.name,
            'current': bool(current and current() == product_bom),
            'materials': len(bom.inputs),
            'operations': len(routing.steps) if routing else 0,
            'drawing': attr(bom, 'drawing_number') or '',
            '_drill': {'type': 'record', 'model': 'production.bom',
                'id': bom.id},
            }
        row.update(_engineered(bom))
        rows.append(row)
    return rows


@report('engineering_material_list', "Engineering Master Material List",
    'engineering', 'EngineeringMaterialList.rpt', ['production.bom'],
    [('part', "Part ID"), ('master', "Engineering ID"),
        ('seq', "Seq", 'int'), ('piece', "Piece", 'int'),
        ('material', "Material Part ID"), ('description', "Description"),
        ('qty_per', "Qty Per", 'qty'), ('unit', "UM"),
        ('unit_cost', "Unit Cost", 'money'), ('cost', "Extended Cost",
            'money')],
    filters=[f_range('part', "Part ID"),
        f_range('material', "Material Part ID")],
    group_by='part', sort='seq')
def engineering_material_list(desk, p):
    rows = []
    for product_bom in _masters(p):
        for row in _master_lines(product_bom):
            line = row.get('line')
            if line is None:
                continue
            cost = line.product.cost_price or ZERO
            rows.append({
                    'part': row['part'],
                    'master': row['master'],
                    'seq': row['seq'],
                    'piece': row['piece'],
                    'material': row['item'],
                    'description': row['description'],
                    'qty_per': row['qty_per'],
                    'unit': row['unit'],
                    'unit_cost': cost,
                    'cost': (cost * dec(row['qty_per'])).quantize(CENT),
                    })
    return rows


@report('operation_template_list', "Operation Template List",
    'engineering', 'OperationTemplateList.rpt',
    ['production.routing.operation'],
    [('id', "Operation ID"), ('description', "Description"),
        ('resource', "Resource ID"), ('setup', "Setup Hrs", 'num'),
        ('run', "Run Hrs/Unit", 'num'), ('used', "Used In Masters", 'int')],
    filters=[f_range('id', "Operation ID")], sort='id', totals=[],
    advanced=True)
def operation_template_list(desk, p):
    pool = Pool()
    Operation = pool.get('production.routing.operation')
    Step = pool.get('production.routing.step')
    Template = first_model('nline.engineering.operation_template',
        'nline.operation_template')
    if Template is not None:
        rows = []
        used = {}
        if 'template' in Step._fields:
            for step in Step.search([('template', '!=', None)]):
                used[step.template.id] = used.get(step.template.id, 0) + 1
        with Transaction().set_context(active_test=False):
            templates = Template.search([])
        for t in templates:
            setup = attr(t, 'setup_hours', 'setup_duration')
            run = attr(t, 'run', 'run_duration')
            rows.append({
                    'id': attr(t, 'code', 'name') or str(t.id),
                    'description': attr(t, 'description', 'name') or '',
                    'resource': attr(t, 'resource', 'work_center',
                        'work_center_category') or '',
                    'setup': setup if isinstance(setup, (int, float))
                    else None,
                    'run': run if isinstance(run, (int, float)) else None,
                    'used': used.get(t.id, 0),
                    '_drill': {'type': 'record', 'model': Template.__name__,
                        'id': t.id},
                    })
        return rows
    used = {}
    for step in Step.search([]):
        used[step.operation.id] = used.get(step.operation.id, 0) + 1
    with Transaction().set_context(active_test=False):
        operations = Operation.search([])
    return [{
            'id': o.name,
            'description': o.name,
            'resource': name(getattr(o, 'work_center_category', None)),
            'setup': None,
            'run': None,
            'used': used.get(o.id, 0),
            } for o in operations]


# ---- Estimating ------------------------------------------------------------
#
# The quotes are nline.quote (nline_js_engineering) when installed, else the
# sales of Tryton not confirmed yet; the quote masters are the BOMs of
# master type 'quote'.

def _quote_model():
    return first_model('nline.quote')


def _quotes(p, open_only=False):
    "The quotes of the Quote Date range"
    company = Transaction().context.get('company')
    Quote = _quote_model()
    if Quote is not None:
        domain = [('company', '=', company)]
        if open_only:
            domain.append(('status', 'in', ['active', 'ready']))
        domain += p.domain_dates('date', 'quote_date')
        return Quote.search(domain, order=[('number', 'ASC')])
    Sale = Pool().get('sale.sale')
    domain = [('company', '=', company)]
    if open_only:
        domain.append(('state', 'in', ['draft', 'quotation']))
    domain += p.domain_dates('date', 'sale_date')
    return Sale.search(domain, order=[('number', 'ASC')])


def _quote_head(quote):
    party = quote.party
    jobshop = quote.__name__ == 'nline.quote'
    contact = getattr(quote, 'contact', None)
    head = {
        'quote': quote.number or str(quote.id),
        'customer': code(party),
        'customer_name': party.name if party else '',
        'contact': contact.rec_name if contact else (
            attr(quote, 'contact_name') or ''),
        'phone': (party.phone or '') if party else '',
        'sales_rep': attr(quote, 'sales_rep') or attr(party, 'sales_rep')
        or '',
        'territory': attr(quote, 'territory') or attr(party, 'territory')
        or '',
        'terms': name(quote.payment_term),
        'probability': attr(quote, 'win_probability'),
        'expires': attr(quote, 'expiration_date', 'quote_expiration_date'),
        'follow_up': attr(quote, 'followup_date', 'follow_up_date'),
        'win_date': attr(quote, 'won_loss_date', 'win_date'),
        '_drill': {'type': 'record', 'model': quote.__name__,
            'id': quote.id},
        }
    if jobshop:
        head.update({
                'date': quote.quote_date,
                'reference': quote.customer_reference or '',
                'status': QUOTE_STATUS.get(quote.status, quote.status),
                'expected': attr(quote, 'expected_win_date') or
                quote.desired_ship_date,
                'amount': quote.total_amount,
                })
    else:
        head.update({
                'date': quote.sale_date or (quote.create_date.date()
                    if quote.create_date else None),
                'reference': quote.reference or '',
                'status': QUOTE_STATUS.get(quote.state, quote.state),
                'expected': quote.shipping_date,
                'amount': quote.untaxed_amount,
                })
    return head


def _quote_lines(quote):
    "The lines of a quote: line, part, description, quantity, unit, price"
    if quote.__name__ == 'nline.quote':
        for line in quote.lines:
            yield {
                'line': line.line_no,
                'part': part_id(line.product),
                'description': line.description or name(line.product),
                'quantity': line.quantity,
                'unit': line.unit.symbol if line.unit else '',
                'unit_price': line.unit_price,
                'amount': line.amount,
                }
        return
    for i, line in enumerate((l for l in quote.lines
                if l.type == 'line'), 1):
        yield {
            'line': i,
            'part': part_id(line.product),
            'description': line.description or name(line.product),
            'quantity': line.quantity,
            'unit': line.unit.symbol if line.unit else '',
            'unit_price': line.unit_price,
            'amount': line.amount,
            }


def _quote_gaps(p):
    if _quote_model() is None:
        p.gap("Quotes: Jobshop's quotes (nline_js_engineering) are not "
            "installed; the sales of Tryton not confirmed are shown, without "
            "expiration date, win probability and follow-up date.")


QUOTE_STATUSES = [['Active', "Active"], ['Ready', "Ready"], ['Won', "Won"],
    ['Lost', "Lost"], ['Cancelled', "Cancelled"]]


@report('quote_form', "Quote Form", 'estimating', 'QuoteForm.rpt',
    ['sale.sale'],
    [('quote', "Quote ID"), ('date', "Quote Date", 'date'),
        ('customer_name', "Quote To"), ('contact', "Contact"),
        ('sales_rep', "Sales Rep"), ('reference', "Customer Reference"),
        ('terms', "Terms"), ('expected', "Desired Ship Date", 'date'),
        ('expires', "Expiration Date", 'date'),
        ('line', "Line", 'int'), ('part', "Part ID"),
        ('description', "Description"), ('quantity', "Quantity", 'qty'),
        ('unit', "UM"), ('unit_price', "Unit Price", 'money'),
        ('amount', "Amount", 'money')],
    filters=[f_range('quote', "Quote ID"), f_dates('date', "Quote Date")],
    group_by='quote', sort='line', totals=['amount'], landscape=True)
def quote_form(desk, p):
    _quote_gaps(p)
    rows = []
    for quote in _quotes(p):
        head = _quote_head(quote)
        for line in _quote_lines(quote):
            rows.append(dict(head, **line))
    return rows


@report('quote_list', "Quote List", 'estimating', 'QuoteList.rpt',
    ['sale.sale'],
    [('quote', "Quote ID"), ('date', "Date", 'date'),
        ('expected', "Expected Date", 'date'),
        ('expires', "Expiration Date", 'date'),
        ('win_date', "Win Date", 'date'), ('customer', "Customer ID"),
        ('territory', "Territory"), ('reference', "Customer Reference"),
        ('status', "Quote Status"), ('probability', "Win Probability",
            'pct'), ('contact', "Contact"), ('phone', "Phone"),
        ('follow_up', "Follow-up Date", 'date'),
        ('amount', "Amount", 'money')],
    filters=[f_range('quote', "Quote ID"), f_range('customer',
            "Customer ID"), f_dates('date', "Quote Date"),
        f_status('status', "Quote Status", QUOTE_STATUSES)],
    sort='quote', advanced=True, landscape=True)
def quote_list(desk, p):
    _quote_gaps(p)
    return [_quote_head(q) for q in _quotes(p)]


@report('quote_proforma', "Quote Proforma", 'estimating',
    'QuoteProforma.rpt', ['sale.sale'],
    [('quote', "Quote ID"), ('date', "Quote Date", 'date'),
        ('status', "Status"), ('customer_name', "Customer Name"),
        ('contact', "Contact"), ('phone', "Contact Methods"),
        ('follow_up', "Follow Up", 'date'),
        ('expected', "Expected Date", 'date'),
        ('expires', "Expires On", 'date'),
        ('probability', "Win Probability", 'pct'),
        ('amount', "Quoted Amount", 'money'),
        ('weighted', "Weighted Amount", 'money')],
    filters=[f_range('quote', "Quote ID"), f_dates('date', "Quote Date")],
    sort='expected')
def quote_proforma(desk, p):
    _quote_gaps(p)
    rows = []
    for quote in _quotes(p, open_only=True):
        row = _quote_head(quote)
        probability = row['probability']
        row['weighted'] = ((row['amount'] or ZERO) * dec(probability) / 100
            ).quantize(CENT) if probability is not None else row['amount']
        rows.append(row)
    return rows


def _quote_masters(p, label):
    "The quote masters: the BOMs of master type 'quote'"
    BOM = Pool().get('production.bom')
    if 'master_type' not in BOM._fields:
        p.gap("%s: Tryton has no quote masters yet (nline_js_engineering)."
            % label)
        return []
    domain = [('master_type', '=', 'quote')]
    start, end = p.get('master_from'), p.get('master_to')
    if start:
        domain.append(('name', '>=', start))
    if end:
        domain.append(('name', '<=', end))
    return BOM.search(domain)


def _quote_master_head(bom):
    part = getattr(bom, 'part', None) or (bom.outputs[0].product
        if bom.outputs else None)
    head = {
        'master': bom.name,
        'part': part_id(part),
        'description': attr(bom, 'description') or name(part),
        'desired': attr(bom, 'desired_quantity') or sum(
            o.quantity for o in bom.outputs) or 1,
        'drawing': attr(bom, 'drawing_number') or '',
        'revision': attr(bom, 'drawing_revision', 'revision') or '',
        }
    head.update(_engineered(bom))
    return head


def _bom_steps(bom):
    "The operations of a master: its own routing, else a linked one"
    routing = getattr(bom, 'routing', None)
    if routing is None and getattr(bom, 'routings', None):
        routing = bom.routings[0]
    return list(routing.steps) if routing is not None and hasattr(
        routing, 'steps') else []


@report('quote_master', "Quote Master", 'estimating', 'QuoteMaster.rpt',
    ['production.bom'],
    [('master', "Master ID"), ('part', "Part ID"),
        ('desired', "Desired Quantity", 'qty'),
        ('engineered_by', "Engineered By"),
        ('engineered_date', "Engineered Date", 'date'),
        ('drawing', "Drawing Number"), ('revision', "Revision Number"),
        ('seq', "Seq", 'int'), ('kind', "Type"),
        ('item', "Part / Resource"), ('line_description', "Description"),
        ('qty_per', "Qty Per", 'qty'), ('unit', "Usage UM"),
        ('quantity', "Calc Qty", 'qty')],
    filters=[f_range('master', "Master ID")], group_by='master',
    sort='seq', totals=[], landscape=True)
def quote_master(desk, p):
    rows = []
    for bom in _quote_masters(p, "Quote Master"):
        head = _quote_master_head(bom)
        output = sum(o.quantity for o in bom.outputs) or 1
        for step in _bom_steps(bom):
            rows.append(dict(head, seq=step.sequence, kind="Operation",
                    item=attr(step, 'resource') or name(getattr(
                        step.operation, 'work_center_category', None)),
                    line_description=attr(step, 'description') or
                    step.operation.name,
                    qty_per=None, unit='', quantity=None))
        for line in bom.inputs:
            rows.append(dict(head, seq=attr(line, 'operation'),
                    kind="Material", item=part_id(line.product),
                    line_description=line.product.name,
                    qty_per=line.quantity / output,
                    unit=line.unit.symbol,
                    quantity=round(line.quantity * head['desired'] / output,
                        4)))
    return rows


@report('quote_master_cost', "Quote Master Cost", 'estimating',
    'QuoteMasterCost.rpt', ['production.bom'],
    [('master', "Master ID"), ('part', "Part ID"),
        ('engineered_by', "Engineered By"),
        ('engineered_date', "Engineered Date", 'date'),
        ('desired', "Quantity", 'qty'), ('seq', "Seq Number", 'int'),
        ('item', "Resource / Material"), ('quantity', "End Quantity", 'qty'),
        ('material', "Material Costs", 'money'),
        ('labor', "Labor Costs", 'money'),
        ('burden', "Burden Costs", 'money'),
        ('total', "Total Costs", 'money')],
    filters=[f_range('master', "Master ID")], group_by='master',
    sort='seq', landscape=True)
def quote_master_cost(desk, p):
    rows = []
    for bom in _quote_masters(p, "Quote Master Cost"):
        head = _quote_master_head(bom)
        output = sum(o.quantity for o in bom.outputs) or 1
        for line in bom.inputs:
            quantity = round(line.quantity * head['desired'] / output, 4)
            material = ((line.product.cost_price or ZERO) * dec(quantity)
                ).quantize(CENT)
            rows.append(dict(head, seq=attr(line, 'operation'),
                    item=part_id(line.product), quantity=quantity,
                    material=material, labor=ZERO, burden=ZERO,
                    total=material))
        for step in _bom_steps(bom):
            setup = hours(getattr(step, 'setup_duration', None))
            run = hours(getattr(step, 'run_duration', None))
            labor = ((dec(setup) + dec(run) * dec(head['desired']))
                * _step_rate(step)).quantize(CENT)
            rows.append(dict(head, seq=step.sequence,
                    item=attr(step, 'resource') or step.operation.name,
                    quantity=None, material=ZERO, labor=labor,
                    burden=ZERO, total=labor))
    return rows


@report('quote_master_list', "Quote Master List", 'estimating',
    'QuoteMasterList.rpt', ['production.bom'],
    [('master', "Quote Master ID"), ('description', "Description"),
        ('part', "Part ID"), ('desired', "Quantity", 'qty')],
    filters=[f_range('master', "Quote Master ID")], sort='master',
    totals=[], advanced=True)
def quote_master_list(desk, p):
    rows = []
    for bom in _quote_masters(p, "Quote Master List"):
        row = _quote_master_head(bom)
        row['_drill'] = {'type': 'record', 'model': 'production.bom',
            'id': bom.id}
        rows.append(row)
    return rows
