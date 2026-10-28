"""Jobshop Engineering and Estimating data (step js_engineering)

- the operation templates (ENGINEERING_OPER_TEMPLATE and their additional
  resources);
- the Jobshop fields of the engineering masters already imported (step
  masters: BOM "<part> <description>", revision = ENG_ID, with its routing):
  the header (ENGINEERING_MASTER), each operation (ENGINEERING_OPERATION,
  matched by its sequence) and each material (ENGINEERING_MATERIAL, matched
  by sequence and piece; a material feeding a leg is a Leg/Detail);
- the quote masters (ESTIMATING_MASTER, its operations and materials) as
  BOMs of type quote with their own routing;
- the quotes (ESTIMATING_QUOTE, lines, quantities quoted, charges): in sample
  mode the open ones (Active, Ready), in full mode those since the cutoff.

Re-runnable: a record found by its Jobshop id is updated, never duplicated.
"""
import datetime as dt
from decimal import Decimal

from nline_migrate import day, dec, log, one_line

RUN_TYPES = {'HRS_PC': 'hrs_pc', 'PCS_HR': 'pcs_hr', 'MIN_PC': 'min_pc',
    'PCS_MIN': 'pcs_min', 'LOADS_HR': 'loads_hr', 'HRS_LOAD': 'hrs_load'}
STEP_TYPES = {'SETUP': 'setup', 'RUN': 'run', 'BOTH': 'both'}
QUOTE_STATUS = {'ACTIVE': 'active', 'READY': 'ready', 'WON': 'won',
    'LOST': 'lost', 'CANCELLED': 'cancelled'}
FREIGHT = {'BILLED': 'billed', 'COLLECT': 'collect', 'PREPAID': 'prepaid'}


def _float(value):
    return float(value) if value is not None else None


def _text(value):
    value = (value or '').strip()
    return value or None


def _run_hours(run_type, run, load):
    "Run hours of one piece (as nline_js_engineering computes them)"
    if not run:
        return 0.0
    load = load or 1.0
    return {
        'pcs_hr': lambda: 1.0 / run,
        'min_pc': lambda: run / 60.0,
        'pcs_min': lambda: 1.0 / (run * 60.0),
        'loads_hr': lambda: 1.0 / (run * load),
        'hrs_load': lambda: run / load,
        }.get(run_type, lambda: run)()


class Codes:
    "The Jobshop code tables of nline_js_common (product, commodity...)"

    def __init__(self, m):
        self.m = m
        self.cache = {}

    def get(self, model, code):
        code = _text(code)
        if not code:
            return None
        key = (model, code)
        if key not in self.cache:
            Model = self.m.get(model)
            # An inactive code too: the ID is unique among all
            found = Model.find([('code', '=', code),
                    ('active', 'in', [True, False])], limit=1)
            if found:
                self.cache[key] = found[0].id
            else:
                record = Model(code=code)
                record.save()
                self.cache[key] = record.id
        return self.cache[key]


def operation_values(m, row, codes):
    "The nline_js_engineering fields of a Jobshop operation row"
    run_type = RUN_TYPES.get((row.get('RUN_TYPE') or '').upper(), 'hrs_pc')
    values = {
        'description': one_line(row.get('DESCRIPTION'), 120) or None,
        'run_type': run_type,
        'run': _float(row.get('RUN_EXPR')),
        'load_size': _float(row.get('LOAD_SIZE_QTY')) or None,
        'move_hours': _float(row.get('MOVE_HRS')) or None,
        'transit_days': row.get('TRANSIT_DAYS') or None,
        'minimum_move_qty': _float(row.get('MINIMUM_MOVE_QTY')) or None,
        'scrap_yield': 'yield' if (row.get('SCRAP_YIELD_TYPE') or '')
        .upper() == 'YIELD' else 'scrap',
        'scrap_percent': _float(row.get('SCRAP_YIELD_PCT')) or None,
        'fixed_scrap': _float(row.get('FIXED_SCRAP_UNITS')) or None,
        'override_start_qty': _float(row.get('USER_START_QTY')),
        'override_end_qty': _float(row.get('USER_END_QTY')),
        'minimum_capacity': row.get('CAPACITY_USAGE_MIN'),
        'maximum_capacity': row.get('CAPACITY_USAGE_MAX'),
        'drawing_number': _text(row.get('DRAWING_ID')),
        'drawing_revision': _text(row.get('DRAWING_REV_NO')),
        'drawing_page': _text(row.get('DRAWING_PAGE_NO')),
        'drawing_file': _text(row.get('DRAWING_FILE')),
        'specifications': _text(row.get('SPECIFICATIONS')),
        }
    for name, column in [
            ('setup_cost_hour', 'SETUP_PER_HR'),
            ('run_cost_hour', 'RUN_PER_HR'),
            ('run_cost_unit', 'RUN_PER_UNIT'),
            ('run_cost_operation', 'RUN_PER_OPER'),
            ('setup_burden_hour', 'BUR_PER_HR_SETUP'),
            ('run_burden_hour', 'BUR_PER_HR_RUN'),
            ('burden_unit', 'BUR_PER_UNIT_RUN'),
            ('burden_operation', 'BUR_PER_OPER')]:
        value = row.get(column)
        values[name] = dec(value).quantize(Decimal('0.0001')) \
            if value else None
    for name, column in [('setup_burden_percent', 'BUR_PERCENT_SETUP'),
            ('run_burden_percent', 'BUR_PERCENT_RUN')]:
        values[name] = _float(row.get(column)) or None
    resource = m.centers.get(row.get('RESOURCE_ID'))
    values['resource'] = resource.id if resource else None
    return values


def material_values(m, row):
    "The nline_js_engineering fields of a Jobshop material row"
    supplier = None
    if row.get('SUPPLIER_ID'):
        try:
            supplier = m.js_party('V', row['SUPPLIER_ID']).id
        except Exception:
            supplier = None
    unit_cost = row.get('UNIT_MAT_COST')
    return {
        'qty_per_type': 'end' if (row.get('QTY_PER_TYPE') or '').upper()
        == 'END' else 'start',
        'fixed_quantity': _float(row.get('FIXED_QTY')) or None,
        'scrap_percent': _float(row.get('SCRAP_PERCENT')) or None,
        'dimensions': _text(row.get('DIMENSIONS')),
        'drawing_number': _text(row.get('DRAWING_ID')),
        'drawing_revision': _text(row.get('DRAWING_REV_NO')),
        'drawing_page': _text(row.get('DRAWING_PAGE_NO')),
        'drawing_file': _text(row.get('DRAWING_FILE')),
        'specifications': _text(row.get('SPECIFICATIONS')),
        'unit_cost': dec(unit_cost).quantize(Decimal('0.0001'))
        if unit_cost else None,
        'fixed_cost': dec(row.get('FIXED_COST')).quantize(Decimal('0.0001'))
        if row.get('FIXED_COST') else None,
        'supplier': supplier,
        }


def header_values(row, codes):
    "The Jobshop header fields of a master (engineering or quote)"
    return {
        'description': one_line(row.get('DESCRIPTION'), 200) or None,
        'desired_quantity': _float(row.get('DESIRED_QTY')) or 1,
        'engineered_by': one_line(row.get('ENGINEERED_BY'), 60) or None,
        'engineered_date': day(row.get('ENGINEERED_DATE')),
        'drawing_page': _text(row.get('DRAWING_PAGE_NO')),
        'drawing_file': _text(row.get('DRAWING_FILE')),
        'product_code': codes.get('nline.product_code',
            row.get('PRODUCT_CODE')),
        'commodity_code': codes.get('nline.commodity_code',
            row.get('COMMODITY_CODE')),
        'global_rank': row.get('GLOBAL_RANK') or 50,
        'forward_schedule': bool(row.get('FORWARD_SCHEDULE')),
        'specifications': _text(row.get('SPECIFICATIONS')),
        }


def run(m):
    for name, loader in [('centers', 'step_resources')]:
        if not hasattr(m, name):
            getattr(m, loader)()
    m.load_products()
    if not m.parties:
        m.load_parties()
    codes = Codes(m)
    templates(m, codes)
    masters(m, codes)
    quote_masters(m, codes)
    quotes(m, codes)


# ---- Operation templates ----------------------------------------------------

def templates(m, codes):
    Template = m.get('nline.engineering.operation_template')
    Resource = m.get('nline.engineering.operation_resource')
    existing = {t.code: t for t in Template.find([
                ('active', 'in', [True, False])])}
    resources = {}
    for row in m.js.rows("select * from ENGINEERING_OPER_TEMPLATE_RES"):
        resources.setdefault(row['OPER_TEMPLATE_ID'], []).append(row)
    for row in m.js.rows("select * from ENGINEERING_OPER_TEMPLATE"):
        values = operation_values(m, row, codes)
        values.update({
                'code': row['ID'],
                'operation': m.operation(row.get('RESOURCE_ID')
                    or row['ID']).id,
                'setup_hours': _float(row.get('SETUP_HRS')) or None,
                'special_instructions': _text(
                    row.get('SPECIAL_INSTRUCTIONS')),
                'active': not row.get('INACTIVE'),
                })
        if row.get('SERVICE_ID'):
            supplier = m.js_party('V', row['SUPPLIER_ID']) \
                if row.get('SUPPLIER_ID') else None
            service = m.service(row['SERVICE_ID'], supplier)
            values['service'] = service.id if service else None
            values['supplier'] = supplier.id if supplier else None
        template = existing.get(row['ID'])
        if template:
            Template.write([template.id], values, m.context)
            template = Template(template.id)
        else:
            template = Template(**{k: v for k, v in values.items()
                    if v is not None})
            template.save()
            m.count('operation templates')
        if not template.extra_resources:
            for res in resources.get(row['ID'], []):
                center = m.centers.get(res['RESOURCE_ID'])
                if not center:
                    continue
                Resource(template=template, resource=center,
                    step_type=STEP_TYPES.get(
                        (res.get('OPERATION_STEP') or '').upper(), 'both'),
                    duration_percent=_float(res.get('PERCENT_DURATION'))
                    or 100.0,
                    justification='end' if (res.get('JUSTIFICATION') or '')
                    .upper().endswith('END') else 'start').save()
    log("operation templates: %s" % len(m.js.rows(
                "select ID from ENGINEERING_OPER_TEMPLATE")))


# ---- Engineering masters ----------------------------------------------------

def masters(m, codes):
    """The Jobshop fields of the engineering masters imported by the step
    masters (matched by part and Eng ID)"""
    BOM = m.get('production.bom')
    Step = m.get('production.routing.step')
    Input = m.get('production.bom.input')
    done = 0
    for bom in BOM.find([('master_type', '=', 'engineering')]):
        part = bom.outputs[0].product.code if bom.outputs else None
        if not part or not bom.revision:
            continue
        heads = m.js.rows("select * from ENGINEERING_MASTER where PART_ID = ? "
            "and ENG_ID = ? and SUB_ID = '0'", part, bom.revision)
        if not heads:
            continue
        head = heads[0]
        values = header_values(head, codes)
        values.update({
                'workorder_instructions': _text(
                    head.get('WORKORDER_INSTRUCTIONS')),
                'private': bool(head.get('PRIVATE')),
                })
        BOM.write([bom.id], values, m.context)
        routing = bom.routing
        steps = {s.sequence: s for s in routing.steps} if routing else {}
        for row in m.js.rows("select * from ENGINEERING_OPERATION where "
                "PART_ID = ? and ENG_ID = ? and SUB_ID = '0'", part,
                bom.revision):
            step = steps.get(row['SEQ_NO'])
            if step:
                Step.write([step.id], operation_values(m, row, codes),
                    m.context)
        inputs = {(i.operation, i.piece): i for i in bom.inputs}
        for row in m.js.rows("select * from ENGINEERING_MATERIAL where "
                "PART_ID = ? and ENG_ID = ? and SUB_ID = '0'", part,
                bom.revision):
            line = inputs.get((row['SEQ_NO'], row['PIECE_NO']))
            if not line:
                continue
            values = material_values(m, row)
            values['leg_detail'] = bool(row.get('SUBORD_SUB_ID'))
            Input.write([line.id], values, m.context)
        done += 1
    log("engineering masters: Jobshop fields of %s" % done)


# ---- Quote masters ----------------------------------------------------------

def quote_masters(m, codes):
    BOM = m.get('production.bom')
    Routing = m.get('production.routing')
    existing = {b.name: b for b in BOM.find([
                ('master_type', '=', 'quote'),
                ('active', 'in', [True, False])])}
    for head in m.js.rows("select * from ESTIMATING_MASTER where "
            "SUB_ID = '0' order by MASTER_ID"):
        master_id = head['MASTER_ID']
        values = header_values(head, codes)
        values.update({
                'master_type': 'quote',
                'name': master_id,
                'drawing_number': _text(head.get('DRAWING_ID')),
                'drawing_revision': _text(head.get('DRAWING_REV_NO')),
                })
        bom = existing.get(master_id)
        if bom:
            BOM.write([bom.id], values, m.context)
            continue
        bom = BOM(**{k: v for k, v in values.items() if v is not None
                and k not in {'product_code', 'commodity_code'}})
        bom.product_code = values['product_code'] and m.get(
            'nline.product_code')(values['product_code'])
        bom.commodity_code = values['commodity_code'] and m.get(
            'nline.commodity_code')(values['commodity_code'])
        part = m.product(head['PART_ID']) if head.get('PART_ID') else None
        if part:
            bom.outputs.new(product=part, quantity=1)
        for row in m.js.rows("select * from ESTIMATING_MATERIAL where "
                "MASTER_ID = ? and SUB_ID = '0' order by SEQ_NO, PIECE_NO",
                master_id):
            component = m.product(row['SUBORD_PART_ID']) \
                if row.get('SUBORD_PART_ID') else None
            if not component or component == part:
                continue
            line = bom.inputs.new(product=component,
                quantity=float(row['QTY_PER'] or 1))
            line.operation = row['SEQ_NO']
            line.piece = row['PIECE_NO']
            for name, value in material_values(m, row).items():
                if value is not None and name != 'supplier':
                    setattr(line, name, value)
            if row.get('SUPPLIER_ID'):
                line.supplier = m.js_party('V', row['SUPPLIER_ID'])
        bom.save()
        steps = m.js.rows("select * from ESTIMATING_OPERATION where "
            "MASTER_ID = ? and SUB_ID = '0' order by SEQ_NO", master_id)
        routing = Routing(name=('Quote master %s' % master_id)[:100])
        routing.boms.append(BOM(bom.id))
        for row in steps:
            step = routing.steps.new(
                operation=m.operation(row['RESOURCE_ID']),
                sequence=row['SEQ_NO'])
            values = operation_values(m, row, codes)
            resource = values.pop('resource')
            if resource:
                step.resource = m.get('production.work.center')(resource)
            for name, value in values.items():
                if value is not None:
                    setattr(step, name, value)
            if row.get('SETUP_HRS'):
                step.setup_duration = dt.timedelta(
                    hours=float(row['SETUP_HRS']))
            run_hours = _run_hours(values['run_type'], values['run'],
                values['load_size'])
            if run_hours:
                step.run_duration = dt.timedelta(hours=run_hours)
            if row.get('SERVICE_ID') and hasattr(step, 'service'):
                supplier = m.js_party('V', row['SUPPLIER_ID']) \
                    if row.get('SUPPLIER_ID') else None
                step.supplier = supplier
                step.service = m.service(row['SERVICE_ID'], supplier)
        routing.save()
        existing[master_id] = bom
        m.count('quote masters')
    log("quote masters: %s" % m.counts['quote masters'])


# ---- Quotes -----------------------------------------------------------------

def quotes(m, codes):
    Quote = m.get('nline.quote')
    BOM = m.get('production.bom')
    done = {q.number for q in Quote.find([('number', '!=', None)])}
    if m.sample:
        heads = m.js.rows("select * from ESTIMATING_QUOTE where QUOTE_STATUS "
            "in ('ACTIVE', 'READY') order by ID")
    else:
        heads = m.js.rows("select * from ESTIMATING_QUOTE where "
            "QUOTE_DATE >= ? order by ID", m.cutoff)
    quote_masters = {b.name: b for b in BOM.find([
                ('master_type', '=', 'quote')])}
    for head in heads:
        if head['ID'] in done:
            continue
        quote = Quote(number=head['ID'],
            quote_date=day(head.get('QUOTE_DATE')) or dt.date.today(),
            status=QUOTE_STATUS.get((head.get('QUOTE_STATUS') or '').upper(),
                'active'))
        if head.get('CUSTOMER_ID'):
            quote.party = m.js_party('C', head['CUSTOMER_ID'])
        for name, column in [
                ('customer_reference', 'CUSTOMER_PO_REF'),
                ('won_loss_reason', 'WON_LOSS_REASON'),
                ('tax_id_number', 'TAX_ID_NUMBER'),
                ('sic_code', 'SIC_CODE'), ('carrier', 'CARRIER_ID'),
                ('our_supplier_id', 'OUR_SUPPLIER_ID'),
                ('sales_rep', 'SALESREP_ID'), ('territory', 'TERRITORY'),
                ('discount_class', 'DISCOUNT_CLASS_ID'),
                ('tax_group', 'TAX_GROUP_ID'),
                ('specifications', 'SPECIFICATIONS'),
                ('footer', 'QT_FOOTER')]:
            value = head.get(column)
            if isinstance(value, str) and name not in {'specifications',
                    'footer'}:
                value = one_line(value, 120)
            setattr(quote, name, _text(value) if isinstance(value, str)
                else value)
        for name, column in [
                ('desired_ship_date', 'DESIRED_SHIP_DATE'),
                ('promise_date', 'PROMISE_DATE'),
                ('followup_date', 'FOLLOWUP_DATE'),
                ('expiration_date', 'EXPIRATION_DATE'),
                ('expected_win_date', 'EXPECTED_WIN_DATE'),
                ('won_loss_date', 'WON_LOSS_DATE')]:
            setattr(quote, name, day(head.get(column)))
        quote.printed_date = head.get('PRINTED_DATE')
        quote.quoted_leadtime = head.get('QUOTED_LEADTIME')
        quote.win_probability = _float(head.get('WIN_PROBABILITY'))
        quote.tax_exempt = bool(head.get('TAX_EXEMPT'))
        quote.freight_terms = FREIGHT.get(
            (head.get('FREIGHT_TERMS') or '').upper())
        for prefix, jprefix in [('', ''), ('ship_', 'SHIPTO_')]:
            street = '\n'.join(filter(None, [
                        _text(head.get(jprefix + 'ADDR_1')),
                        _text(head.get(jprefix + 'ADDR_2')),
                        _text(head.get(jprefix + 'ADDR_ETC'))]))
            setattr(quote, prefix + 'street', street or None)
            for name, column in [('name', 'NAME'), ('city', 'CITY'),
                    ('state', 'STATE'), ('postal_code', 'POSTAL_CODE'),
                    ('country', 'COUNTRY'), ('contact_name', 'CONTACT_NAME'),
                    ('contact_title', 'CONTACT_TITLE'),
                    ('contact_phone', 'CONTACT_PHONE'),
                    ('contact_fax', 'CONTACT_FAX'),
                    ('contact_email', 'CONTACT_EMAIL')]:
                setattr(quote, prefix + name, one_line(
                        head.get(jprefix + column), 120) or None)
        if head.get('TERMS_RULE_ID'):
            term = m.term(head['TERMS_RULE_ID'])
            if term:
                quote.payment_term = term
        if head.get('FOB_POINT'):
            quote.fob_point = m.get('nline.fob_point')(codes.get(
                    'nline.fob_point', head['FOB_POINT']))
        if head.get('SHIP_VIA'):
            quote.ship_via = m.get('nline.ship_via')(codes.get(
                    'nline.ship_via', head['SHIP_VIA']))
        prices = {}
        for row in m.js.rows("select * from ESTIMATING_QUOTE_LINE_PRICE "
                "where QUOTE_ID = ? order by QUOTE_LINE_NO, USER_QUOTE_QTY",
                head['ID']):
            prices.setdefault(row['QUOTE_LINE_NO'], []).append(row)
        for row in m.js.rows("select * from ESTIMATING_QUOTE_LINE where "
                "QUOTE_ID = ? order by LINE_NO", head['ID']):
            line = quote.lines.new(line_no=row['LINE_NO'])
            line.status = 'closed' if (row.get('LINE_STATUS') or '').upper() \
                == 'CLOSED' else 'open'
            product = m.product(row['PART_ID']) if row.get('PART_ID') \
                else None
            if product:
                line.product = product
            line.description = one_line(row.get('DESCRIPTION'), 250) \
                or (product.template.name if product else None)
            line.customer_part = _text(row.get('CUSTOMER_PART_ID'))
            line.drawing_number = _text(row.get('DRAWING_ID'))
            line.drawing_revision = _text(row.get('DRAWING_REV_NO'))
            line.specifications = _text(row.get('SPECIFICATIONS'))
            line.desired_ship_date = day(row.get('DESIRED_SHIP_DATE'))
            line.promise_date = day(row.get('PROMISE_DATE'))
            line.win_probability = _float(row.get('WIN_PROBABILITY'))
            if row.get('PRODUCT_CODE'):
                line.product_code = m.get('nline.product_code')(codes.get(
                        'nline.product_code', row['PRODUCT_CODE']))
            if row.get('COMMODITY_CODE'):
                line.commodity_code = m.get('nline.commodity_code')(
                    codes.get('nline.commodity_code',
                        row['COMMODITY_CODE']))
            master = quote_masters.get(row.get('MASTER_ID'))
            if master:
                line.cost_from = 'quote'
                line.quote_master = master
            elif product and product.boms:
                line.cost_from = 'engineering'
                revision = row.get('MASTER_ENG_ID') or row.get('ENG_ID')
                link = next((b for b in product.boms
                        if revision and b.bom.revision == revision), None)
                if link:
                    line.bom = link.bom
            else:
                line.cost_from = 'part' if product else 'none'
            for p in prices.get(row['LINE_NO'], []) or [{}]:
                price = line.prices.new(
                    quantity=_float(p.get('USER_QUOTE_QTY')) or 1)
                for name, column in [('unit_cost', 'CALC_UNIT_COST'),
                        ('calc_unit_price', 'CALC_UNIT_PRICE'),
                        ('unit_price', 'UNIT_PRICE')]:
                    if p.get(column) is not None:
                        setattr(price, name, dec(p[column]).quantize(
                                Decimal('0.0001')))
                price.trade_discount = _float(p.get('TRADE_DISC_PERCENT')) \
                    or None
                price.leadtime = p.get('QUOTED_LEADTIME')
                for name, column in [('material_markup', 'PUR_MATL_PERCENT'),
                        ('fab_markup', 'FAB_MATL_PERCENT'),
                        ('labor_markup', 'LABOR_PERCENT'),
                        ('burden_markup', 'BURDEN_PERCENT'),
                        ('service_markup', 'SERVICE_PERCENT')]:
                    price_value = _float(p.get(column))
                    setattr(price, name, price_value or None)
                price.in_proforma = bool(p.get('IN_PROFORMA'))
            # The first quantity counts in the total when none is chosen
            chosen = [p for p in prices.get(row['LINE_NO'], [])
                if p.get('IN_TOTAL')]
            for price, p in zip(line.prices, prices.get(row['LINE_NO'], [])
                    or [{}]):
                price.in_total = bool(p.get('IN_TOTAL')) if chosen else (
                    price is line.prices[0])
        for row in m.js.rows("select * from ESTIMATING_QUOTE_CHARGE where "
                "QUOTE_ID = ?", head['ID']):
            quote.charges.new(service_charge=row.get('SERVICE_CHARGE_ID'),
                description=one_line(row.get('DESCRIPTION'), 120) or None,
                amount=dec(row.get('AMOUNT')).quantize(Decimal('0.01')),
                tax_group=_text(row.get('TAX_GROUP_ID')))
        quote.save()
        done.add(head['ID'])
        m.count('quotes')
    log("quotes: %s" % m.counts['quotes'])
