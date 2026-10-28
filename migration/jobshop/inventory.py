"""Jobshop Inventory data: units of measure, locations, unit conversions and
the part fields of the Jobshop emulation (module nline_js_inventory)

    run(m): m is the Migration of nline_migrate.py

Re-runnable: a unit is found by its symbol, a location by its code in the
warehouse's storage, a conversion by (part, from, to), a part location by
(part, location); the part fields are written again from INVENTORY_PART.
The parts themselves were made by the base migration (step parts: template
code = Jobshop part ID).

Opening balances (INVENTORY_PART_LOCATION.QTY_ON_HAND as adjustments) are
brought only when NLINE_JS_INVENTORY_BALANCES=1: they bring each part and
location to Jobshop's quantity, so run them once, at cutover, after the
other steps.
"""
import os
from decimal import Decimal

try:
    from nline_migrate import log, one_line
except ImportError:  # run outside nline_migrate (tests)
    import time

    def log(message):
        print('%s %s' % (time.strftime('%H:%M:%S'), message), flush=True)

    def one_line(value, size=None):
        value = ' '.join(str(value or '').split())
        return value[:size] if size else value

# Jobshop units -> the Tryton units of the same meaning (by symbol)
UNITS = {'EA': 'u', 'IN': 'in', 'FT': 'ft', 'LB': 'lb', 'LBS': 'lb',
    'HR': 'h', 'SQ IN': 'in²', 'GAL': 'gal'}
LOT_ALL = ['supplier', 'customer', 'lost_found', 'storage', 'production']
CHUNK = 500
# The part's user fields kept (N-Line fills USER_0, USER_1, USER_10, USER_11)
USER_FIELDS = list(range(12))
# Update on Receipt: Jobshop's value -> the ERP's
UPDATE_COSTS = {'SYSTEM': 'system', 'ALWAYS': 'always', 'ASK': 'ask',
    'NEVER': 'never'}
INSTRUCTIONS = ['QUOTE', 'SALES', 'SHIPPING', 'MATERIAL', 'RFQ',
    'PURCHASING', 'RECEIVING']
# Jobshop's part rules are not checked on the imported data (N-Line has
# parts Jobshop itself would refuse today, e.g. lot tracked and auto issue)
NO_RULES = {'nline_js_no_part_rules': True}


def chunks(values, size=CHUNK):
    values = list(values)
    for i in range(0, len(values), size):
        yield values[i:i + size]


def flt(value):
    return float(value) if value is not None else None


def dec4(value):
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal('0.0001'))


def text(value):
    value = (value or '').strip() if isinstance(value, str) else value
    return value or None


def run(m):
    if not getattr(m, 'products', None) and hasattr(m, 'load_products'):
        m.load_products()
    labels(m)
    units = units_of_measure(m)
    locations = storage_locations(m)
    parts(m, units, locations)
    conversions(m, units)
    part_locations(m, locations)
    if os.environ.get('NLINE_JS_INVENTORY_BALANCES') == '1':
        balances(m, locations)
    log("jobshop inventory: done")


def labels(m):
    "The labels of the part's user defined fields (System Settings)"
    rows = m.js.rows("select * from INVENTORY_OBJECT_GLOBAL")
    if not rows:
        return
    row = rows[0]
    names = [one_line(row.get('USER_%s' % i)) for i in USER_FIELDS]
    Configuration = m.get('nline.desk.configuration')
    config = Configuration(1)
    value = '\n'.join(names).rstrip('\n') or None
    if config.part_user_labels != value:
        config.part_user_labels = value
        config.save()


def units_of_measure(m):
    """INVENTORY_UNIT -> product.uom: the standard Tryton unit of the same
    meaning, else a unit of its own (its own category). Only the units with
    a description or used by a part or a conversion. Returns {Jobshop ID:
    uom id}"""
    Uom = m.get('product.uom')
    Category = m.get('product.uom.category')
    used = set()
    for column in ['STOCK_UM', 'WEIGHT_UM', 'SELLING_UM', 'PURCHASE_UM',
            'USAGE_UM', 'DIMENSIONS_UM']:
        used |= {r['UM'] for r in m.js.rows(
                "select distinct %s as UM from INVENTORY_PART "
                "where %s is not null" % (column, column))}
    for column in ['FROM_UNIT_ID', 'TO_UNIT_ID']:
        used |= {r['UM'] for r in m.js.rows(
                "select distinct %s as UM from INVENTORY_UNITS_CONVERSION"
                % column)}
    result = {}
    by_symbol = {u.symbol: u.id for u in Uom.find([])}
    for row in m.js.rows("select * from INVENTORY_UNIT"):
        code = (row['ID'] or '').strip()
        if not code:
            continue
        if not text(row.get('DESCRIPTION')) and code not in used:
            continue
        symbol = UNITS.get(code.upper(), code)
        if symbol in by_symbol:
            result[code] = by_symbol[symbol]
            continue
        scale = max(0, min(int(row.get('UNIT_SCALE') or 0), 4))
        name = one_line(row.get('DESCRIPTION')) or code
        category = Category(name=name)
        category.save()
        uom = Uom(name=name, symbol=code, category=category, factor=1.0,
            rate=1.0, digits=scale, rounding=float(
                Decimal(1).scaleb(-scale)),
            active=not row.get('INACTIVE'))
        uom.save()
        by_symbol[code] = result[code] = uom.id
        m.count('units')
    log("jobshop inventory: %s units" % len(result))
    return result


def storage_locations(m):
    """INVENTORY_LOCATION -> storage locations in the warehouse's storage
    (Jobshop's one warehouse). Returns {Jobshop location ID: id}"""
    Location = m.get('stock.location')
    warehouses = Location.find([('type', '=', 'warehouse')])
    if not warehouses:
        log("jobshop inventory: no warehouse, no locations")
        return {}
    warehouse = warehouses[0]
    storage = warehouse.storage_location
    existing = {l.code: l for l in Location.find([
                ('type', '=', 'storage'),
                ('parent', 'child_of', [storage.id]),
                ('active', 'in', [True, False]),
                ])
        if l.code}
    result = {}
    for row in m.js.rows("select * from INVENTORY_LOCATION order by ID"):
        code = (row['ID'] or '').strip()
        if not code:
            continue
        name = one_line(row.get('DESCRIPTION'), 120) or code
        active = not row.get('INACTIVE')
        location = existing.get(code)
        if not location:
            location = Location(name=name, code=code, type='storage',
                parent=storage)
            location.save()
            m.count('locations')
        elif location.name != name:
            location.name = name
            location.save()
        if location.active != active:
            try:
                Location.write([location.id], {'active': active},
                    m.context)
            except Exception as error:  # an inactive location with stock
                log("jobshop inventory: location %s stays active: %s"
                    % (code, one_line(error, 120)))
        result[code] = location.id
    log("jobshop inventory: %s locations" % len(result))
    return result


def codes(m, model, values):
    "The ids of Jobshop code table values (made when missing)"
    Model = m.get(model)
    with_inactive = [('active', 'in', [True, False])]
    found = {c.code: c.id for c in Model.find(with_inactive)}
    for value in sorted({v for v in values if v} - set(found)):
        record = Model(code=value)
        record.save()
        found[value] = record.id
    return found


def part_templates(m):
    "{Jobshop part ID: template id} of the parts (active or not)"
    Template = m.get('product.template')
    return {t.code: t.id for t in Template.find([('code', '!=', None),
                ('active', 'in', [True, False])])}


def parts(m, units, locations):
    "Write the Jobshop part fields on the parts of the base migration"
    Template = m.get('product.template')
    Note = m.get('ir.note')
    templates = part_templates(m)
    if not templates:
        log("jobshop inventory: no part to complete")
        return
    rows = []
    for ids in chunks(sorted(templates)):
        rows += m.js.rows("select * from INVENTORY_PART where ID in (%s)"
            % ','.join('?' * len(ids)), *ids)
    product_codes = codes(m, 'nline.product_code',
        [text(r.get('PRODUCT_CODE')) for r in rows])
    commodity_codes = codes(m, 'nline.commodity_code',
        [text(r.get('COMMODITY_CODE')) for r in rows])
    for i, row in enumerate(rows, 1):
        template_id = templates[row['ID']]
        values = {
            'stocked': bool(row.get('STOCKED')),
            'tool_or_fixture': bool(row.get('TOOL_OR_FIXTURE')),
            'auto_issue': bool(row.get('AUTO_ISSUE')),
            'product_code': product_codes.get(text(row.get('PRODUCT_CODE'))),
            'commodity_code': commodity_codes.get(
                text(row.get('COMMODITY_CODE'))),
            'weight': flt(row.get('WEIGHT')),
            'weight_uom': units.get(text(row.get('WEIGHT_UM'))),
            'ship_dimensions': one_line(row.get('SHIP_DIMENSIONS')) or None,
            'drawing_file': text(row.get('DRAWING_FILE')),
            'mfg_name': one_line(row.get('MFG_NAME')) or None,
            'mfg_part_id': one_line(row.get('MFG_PART_ID')) or None,
            'specifications': text(row.get('SPECIFICATIONS')),
            'primary_location': locations.get(
                text(row.get('PRIMARY_LOC_ID'))),
            'issue_from_location': locations.get(
                text(row.get('AUTOISSUE_LOC_ID'))),
            'lead_time_days': (int(row['PLANNING_LEADTIME'])
                if row.get('PLANNING_LEADTIME') is not None else None),
            'order_point': flt(row.get('ORDER_POINT')),
            'safety_stock': flt(row.get('SAFETY_STOCK_QTY')) or 0,
            'minimum_order_qty': flt(row.get('MINIMUM_ORDER_QTY')),
            'maximum_order_qty': flt(row.get('MAXIMUM_ORDER_QTY')),
            'multiple_order_qty': flt(row.get('MULTIPLE_ORDER_QTY')),
            'maximum_stock_qty': flt(row.get('MAXIMUM_STOCK_QTY')),
            'piece_tracked': bool(row.get('PIECE_TRACKED')),
            'length_required': bool(row.get('LENGTH_REQD')),
            'width_required': bool(row.get('WIDTH_REQD')),
            'height_required': bool(row.get('HEIGHT_REQD')),
            'dimensions_uom': units.get(text(row.get('DIMENSIONS_UM'))),
            'usage_uom': units.get(text(row.get('USAGE_UM'))),
            'unit_material_cost': dec4(row.get('UNIT_MAT_COST')),
            'unit_labor_cost': dec4(row.get('UNIT_LAB_COST')),
            'unit_burden_cost': dec4(row.get('UNIT_BUR_COST')),
            'unit_service_cost': dec4(row.get('UNIT_SER_COST')),
            'fixed_cost': dec4(row.get('FIXED_COST')),
            'active': not row.get('INACTIVE'),
            'date_tracked': bool(row.get('DATE_TRACKED')),
            'commissionable': bool(row.get('COMMISSIONABLE')),
            'preserve_unit_costs': bool(row.get('PRIVATE_UNIT_COSTS')),
            'preserve_unit_price': bool(row.get('PRIVATE_UNIT_PRICE')),
            'update_costs_from_po': UPDATE_COSTS.get(
                (text(row.get('UPDATE_COSTS_FROM_PO')) or '').upper(),
                'system'),
            }
        for name in INSTRUCTIONS:
            values['%s_instructions' % name.lower()] = text(
                row.get('%s_INSTRUCTIONS' % name))
        for n in USER_FIELDS:
            values['user_%s' % n] = one_line(row.get('USER_%s' % n)) or None
        if row.get('LOT_TRACKED'):
            values['lot_required'] = LOT_ALL
        context = dict(m.context, **NO_RULES)
        try:
            Template.write([template_id], values, context)
        except Exception as error:
            # A unit of another category, a value Tryton refuses: the rest
            log("jobshop inventory: part %s: %s" % (row['ID'],
                    one_line(error, 160)))
            for name in ['usage_uom', 'weight_uom', 'dimensions_uom',
                    'lot_required', 'active']:
                values.pop(name, None)
            Template.write([template_id], values, context)
        suppliers(m, template_id, row)
        notes = text(row.get('NOTES'))
        if notes:
            resource = 'product.template,%s' % template_id
            if not Note.find([('resource', '=', resource)], limit=1):
                Note(resource=Template(template_id), message=notes).save()
                m.count('part notes')
        m.count('parts completed')
        if i % 500 == 0:
            log("jobshop inventory: parts %s of %s" % (i, len(rows)))
    log("jobshop inventory: %s parts completed" % len(rows))


def suppliers(m, template_id, row):
    "The 2nd to 5th preferred suppliers (the 1st was made with the part)"
    ids = [text(row.get('PREF_SUPPLIER_ID_%s' % n)) for n in range(2, 6)]
    ids = [i for i in ids if i]
    if not ids:
        return
    Template = m.get('product.template')
    template = Template(template_id)
    if not template.purchasable:
        return
    have = {s.party.id for s in template.product_suppliers}
    changed = False
    for supplier_id in ids:
        party = m.js_party('V', supplier_id)
        if party and party.id not in have:
            template.product_suppliers.new(party=party)
            have.add(party.id)
            changed = True
    if changed:
        template.save()


def conversions(m, units):
    "INVENTORY_UNITS_CONVERSION -> nline.js.unit_conversion"
    Conversion = m.get('nline.js.unit_conversion')
    templates = part_templates(m)
    existing = {(c.template.id if c.template else None, c.from_uom.id,
            c.to_uom.id): c for c in Conversion.find([])}
    count = 0
    for row in m.js.rows("select * from INVENTORY_UNITS_CONVERSION"):
        from_uom = units.get(text(row.get('FROM_UNIT_ID')))
        to_uom = units.get(text(row.get('TO_UNIT_ID')))
        factor = flt(row.get('CONVERSION'))
        if not from_uom or not to_uom or from_uom == to_uom or not factor:
            continue
        template = None
        if row.get('PART_ID'):
            template = templates.get(row['PART_ID'])
            if not template:
                continue
        key = (template, from_uom, to_uom)
        conversion = existing.get(key)
        if conversion:
            if abs(conversion.factor - factor) > 1e-9:
                conversion.factor = factor
                conversion.save()
        else:
            conversion = Conversion(template=template, from_uom=from_uom,
                to_uom=to_uom, factor=factor)
            conversion.save()
            existing[key] = conversion
            m.count('unit conversions')
        count += 1
    log("jobshop inventory: %s unit conversions" % count)


def part_locations(m, locations):
    """INVENTORY_PART_LOCATION -> nline.js.part_location: the locations
    with stock or on hold (the empty ones are left out)"""
    PartLocation = m.get('nline.js.part_location')
    templates = part_templates(m)
    existing = {(p.template.id, p.location.id): p
        for p in PartLocation.find([])}
    rows = m.js.rows("select PART_ID, LOCATION_ID, QTY_ON_HAND, HOLD, "
        "INACTIVE, LAST_COUNTED from INVENTORY_PART_LOCATION "
        "where QTY_ON_HAND <> 0 or HOLD <> 0")
    made = 0
    for row in rows:
        template = templates.get(row['PART_ID'])
        location = locations.get(text(row['LOCATION_ID']))
        if not template or not location:
            continue
        values = {
            'hold': bool(row.get('HOLD')),
            'inactive': bool(row.get('INACTIVE')),
            }
        if row.get('LAST_COUNTED'):
            last = row['LAST_COUNTED']
            values['last_counted'] = last.date() if hasattr(
                last, 'date') else last
        part_location = existing.get((template, location))
        if not part_location:
            created, = PartLocation.create([dict(values, template=template,
                        location=location)], dict(m.context, **NO_RULES))
            existing[(template, location)] = PartLocation(created)
            made += 1
        elif any(getattr(part_location, k) != v for k, v in values.items()):
            PartLocation.write([part_location.id], values,
                dict(m.context, **NO_RULES))
    m.count('part locations', made)
    log("jobshop inventory: %s part locations" % len(rows))


def balances(m, locations):
    """Bring the quantity of each part and location to Jobshop's
    (QTY_ON_HAND) with adjustments in / out at the part's unit cost"""
    Desk = m.get('nline.desk')
    Template = m.get('product.template')
    templates = {t.code: t for t in Template.find([('code', '!=', None),
                ('type', '=', 'goods'), ('active', 'in', [True, False])])}
    rows = m.js.rows("select PART_ID, LOCATION_ID, QTY_ON_HAND "
        "from INVENTORY_PART_LOCATION where QTY_ON_HAND <> 0")
    by_location = {}
    for row in rows:
        template = templates.get(row['PART_ID'])
        location = locations.get(text(row['LOCATION_ID']))
        if template and location:
            by_location.setdefault(location, []).append(
                (template, float(row['QTY_ON_HAND'])))
    count = 0
    for location, items in by_location.items():
        for group in chunks(items, 200):
            lines = []
            for template, wanted in group:
                current = sum(s['quantity'] for s in Desk.location_stock(
                        template.id, location, m.context))
                difference = round(wanted - current, 4)
                if not difference:
                    continue
                line = {
                    'type': 'in' if difference > 0 else 'out',
                    'template': template.id,
                    'quantity': abs(difference),
                    'location': location,
                    }
                if difference > 0:
                    line['material'] = str(template.unit_material_cost or 0)
                    line['labor'] = str(template.unit_labor_cost or 0)
                    line['burden'] = str(template.unit_burden_cost or 0)
                    line['service'] = str(template.unit_service_cost or 0)
                lines.append(line)
            if lines:
                try:
                    Desk.adjustments_post({'lines': lines}, m.context)
                    count += len(lines)
                except Exception as error:
                    log("jobshop inventory: balances of location %s: %s"
                        % (location, one_line(error, 160)))
    m.count('opening balances', count)
    log("jobshop inventory: %s opening balance adjustments" % count)
