"""Jobshop Sales data (step js_sales): the Sales code tables (sales reps,
territories, SIC codes, carriers, service charges, tax groups, discount
classes and their prices), the customers' Jobshop fields, ship to
addresses and price breaks, and the imported sales orders' Jobshop fields
and charges.

Re-runnable: a code table row is found by its ID, a customer by its
Jobshop ID (the party code), an order by its number, a charge by its order
and service charge; only what differs is written. Reads Jobshop only."""
from decimal import Decimal

try:
    from nline_migrate import dec, day, log, one_line
except ImportError:  # imported as jobshop.sales from nline_migrate itself
    from __main__ import dec, day, log, one_line

FREIGHT = {'BILLED': 'billed', 'COLLECT': 'collect', 'PREPAID': 'prepaid'}
CREDIT = {'APPROVED': 'approved', 'HOLD ORDERS': 'hold_orders',
    'HOLD_ORDERS': 'hold_orders', 'HOLDORDERS': 'hold_orders',
    'HOLD SHIPMENTS': 'hold_shipments', 'HOLD_SHIPMENTS': 'hold_shipments',
    'HOLDSHIPMENTS': 'hold_shipments'}
# The order's address block (SALES_ORDER.NAME... and SHIPTO_NAME...)
ADDRESS_COLUMNS = [('name', 'NAME'), ('addr_1', 'ADDR_1'),
    ('addr_2', 'ADDR_2'), ('city', 'CITY'), ('state', 'STATE'),
    ('postal', 'POSTAL_CODE'), ('country', 'COUNTRY'), ('etc', 'ADDR_ETC'),
    ('contact', 'CONTACT_NAME'), ('title', 'CONTACT_TITLE'),
    ('phone', 'CONTACT_PHONE'), ('fax', 'CONTACT_FAX'),
    ('email', 'CONTACT_EMAIL'), ('mobile', 'CONTACT_MOBILE')]
QUOTE_TYPE = {'BREAK': 'break', 'UPTO': 'up_to', 'UP_TO': 'up_to',
    'UP-TO': 'up_to'}


def flag(value):
    "A Jobshop boolean (-1 / 0)"
    return bool(value) and value != 0


def text(value):
    value = (value or '').strip() if isinstance(value, str) else value
    return value or None


class Codes:
    "A code table of the ERP, by code; rows made when missing"

    def __init__(self, m, model):
        self.m = m
        self.Model = m.get(model)
        self.model = model
        self.by_code = {r.code: r for r in self.Model.find(
                [('active', 'in', [True, False])])}

    def get(self, code, **values):
        code = one_line(code, 60) if code else None
        if not code:
            return None
        record = self.by_code.get(code)
        if record is None:
            record = self.Model(code=code, **values)
            record.save()
            self.by_code[code] = record
            self.m.count(self.model)
        elif values:
            update(record, values)
        return record


def update(record, values):
    "Write only what differs (re-runnable)"
    changed = False
    for name, value in values.items():
        current = getattr(record, name)
        if hasattr(current, 'id'):
            same = value is not None and getattr(value, 'id', value) == \
                current.id
        else:
            same = current == value or (current in (None, '') and value in (
                None, ''))
        if not same:
            setattr(record, name, value)
            changed = True
    if changed:
        record.save()
    return changed


def run(m):
    codes = {
        'rep': Codes(m, 'nline.sales_rep'),
        'territory': Codes(m, 'nline.territory'),
        'sic': Codes(m, 'nline.sic_code'),
        'carrier': Codes(m, 'nline.carrier'),
        'service': Codes(m, 'nline.service_charge'),
        'group': Codes(m, 'nline.sales_tax_group'),
        'discount': Codes(m, 'nline.discount_class'),
        'fob': Codes(m, 'nline.fob_point'),
        'via': Codes(m, 'nline.ship_via'),
        'product_code': Codes(m, 'nline.product_code'),
        'commodity_code': Codes(m, 'nline.commodity_code'),
        }
    code_tables(m, codes)
    parties = customers(m, codes)
    prices(m, parties)
    orders(m, codes)
    log("js_sales: " + ', '.join('%s %s' % (n, w)
            for w, n in sorted(m.counts.items())
            if w.startswith('nline.') or w.startswith('js_sales')))


def code_tables(m, codes):
    for row in m.js.rows("select * from SALES_SALESREP"):
        codes['rep'].get(row['ID'], description=one_line(row['NAME']) or None,
            commission=dec(row['COMMISSION']),
            active=not flag(row['INACTIVE']))
    for row in m.js.rows("select * from SALES_TERRITORY"):
        codes['territory'].get(row['ID'],
            description=one_line(row['DESCRIPTION']) or None,
            active=not flag(row['INACTIVE']))
    for row in m.js.rows("select * from SALES_SIC"):
        codes['sic'].get(row['ID'],
            description=one_line(row['DESCRIPTION']) or None,
            active=not flag(row['INACTIVE']))
    for row in m.js.rows("select * from SALES_CARRIER"):
        codes['carrier'].get(row['ID'],
            description=one_line(row['NAME']) or None,
            carrier_code=text(row['SHIPPER_ID']), route=text(row['ROUTE']),
            instructions=text(row['SHIPPER_INSTRUCT']),
            cod_charge=dec(row['COD_CHARGE'], None),
            active=not flag(row['INACTIVE']))
    for row in m.js.rows("select * from SALES_SERVICE_CHARGE"):
        account = m.account(row['REV_GL_ACCT_ID']) \
            if row.get('REV_GL_ACCT_ID') else None
        values = dict(description=one_line(row['DESCRIPTION']) or None,
            amount=dec(row['AMOUNT']), active=not flag(row['INACTIVE']))
        if account:
            values['account'] = account
        codes['service'].get(row['ID'], **values)

    # Tax groups and their taxes (kept as Tryton taxes when they have an
    # account the ERP knows)
    Line = m.get('nline.sales_tax_group.line')
    for row in m.js.rows("select * from SALES_TAX_GROUP"):
        codes['group'].get(row['ID'],
            description=one_line(row['DESCRIPTION']) or None,
            active=not flag(row['INACTIVE']))
    for row in m.js.rows("select * from SALES_TAX order by TAX_GROUP_ID, "
            "TAX_NAME, EFFECTIVE_DATE"):
        group = codes['group'].get(row['TAX_GROUP_ID'])
        effective = day(row['EFFECTIVE_DATE'])
        found = Line.find([('group', '=', group.id),
                ('tax_name', '=', row['TAX_NAME']),
                ('effective_date', '=', effective)])
        line = found[0] if found else Line(group=group,
            tax_name=row['TAX_NAME'], effective_date=effective)
        values = dict(description=one_line(row['DESCRIPTION']) or None,
            percent=dec(row['TAX_PERCENT']))
        account = m.account(row['TAX_GL_ACCT_ID']) \
            if row.get('TAX_GL_ACCT_ID') else None
        if account:
            values['account'] = account
        if not found:
            for k, v in values.items():
                setattr(line, k, v)
            line.save()
            m.count('nline.sales_tax_group.line')
        else:
            update(line, values)

    for row in m.js.rows("select * from SALES_DISCOUNT_CLASS"):
        codes['discount'].get(row['ID'],
            description=one_line(row['DESCRIPTION']) or None,
            discount_percent=dec(row['DISCOUNT_PERCENT']),
            active=not flag(row['INACTIVE']))


def customers(m, codes):
    """The Jobshop fields of the customers imported as parties (step
    parties): only those, a customer not imported is left out"""
    Party = m.get('party.party')
    Address = m.get('party.address')
    Note = m.get('ir.note')
    by_code = {p.code: p for p in Party.find([('code', '!=', None)])}
    parties = {}
    for (kind, jobshop_id), party in m.party_by_js.items():
        if kind == 'C':
            parties[jobshop_id] = party
    rows = m.js.rows("select * from SALES_CUSTOMER")
    for row in rows:
        party = parties.get(row['ID']) or by_code.get(row['ID'])
        if party is None:
            continue
        party = Party(party.id)
        parties[row['ID']] = party
        credit = CREDIT.get((row['CREDIT_STATUS'] or '').strip().upper(),
            'approved')
        values = {
            'sales_rep': codes['rep'].get(row['SALESREP_ID']),
            'territory': codes['territory'].get(row['TERRITORY']),
            'customer_fob_point': codes['fob'].get(row['FOB_POINT']),
            'customer_ship_via': codes['via'].get(row['SHIP_VIA']),
            'carrier': codes['carrier'].get(row['CARRIER_ID']),
            'customer_sic_code': codes['sic'].get(row['SIC_CODE']),
            'discount_class': codes['discount'].get(
                row['DISCOUNT_CLASS_ID']),
            'customer_tax_group': codes['group'].get(row['TAX_GROUP_ID']),
            'customer_tax_exempt': flag(row['TAX_EXEMPT']),
            'customer_tax_id_number': text(row['TAX_ID_NUMBER']),
            'customer_freight_terms': FREIGHT.get(
                (row['FREIGHT_TERMS'] or '').strip().upper()),
            'credit_status': credit,
            'credit_limit': dec(row['CREDIT_LIMIT']),
            'our_supplier_id': text(row['OUR_SUPPLIER_ID']),
            'contact_title': text(row['CONTACT_TITLE']),
            'customer_contact': text(row['CONTACT_NAME']),
            'customer_inactive': flag(row['INACTIVE']),
            'customer_exported': flag(row['POSTED']),
            'customer_exported_date': day(row['POSTED_DATE']),
            'customer_open_date': day(row['OPEN_DATE'])
            or day(row['RECORD_CREATED']),
            'quote_instructions': text(row['QUOTE_INSTRUCTIONS']),
            'sales_instructions': text(row['SALES_INSTRUCTIONS']),
            'quote_footer': text(row['QT_FOOTER']),
            'sales_order_footer': text(row['SO_FOOTER']),
            'shipper_footer': text(row['SHP_FOOTER']),
            'invoice_footer': text(row['INV_FOOTER']),
            'customer_specs': text(row['SPECIFICATIONS']),
            }
        # The numbers the parties step left out (it keeps phone, e-mail)
        for name, column in [('customer_fax', 'CONTACT_FAX'),
                ('customer_mobile', 'CONTACT_MOBILE')]:
            if text(row[column]):
                values[name] = text(row[column])
        if update(party, values):
            m.count('js_sales customers updated')
        notes = text(row['NOTES'])
        if notes:
            resource = 'party.party,%s' % party.id
            if not Note.find([('resource', '=', resource),
                        ('message', '=', notes)]):
                Note(resource=party, message=notes).save()
                m.count('js_sales customer notes')

    # The ship to addresses (the main one is the party's first address)
    for row in m.js.rows("select * from SALES_CUSTOMER_ADDRESS order by "
            "CUSTOMER_ID, ADDRESS_NO"):
        party = parties.get(row['CUSTOMER_ID'])
        if party is None:
            continue
        street = '\n'.join(filter(None, [row.get('ADDR_1'),
                    row.get('ADDR_2')])) or None
        name = one_line(row['NAME']) or None
        found = Address.find([('party', '=', party.id),
                ('party_name', '=', name), ('street', '=', street)])
        address = found[0] if found else Address(party=party,
            party_name=name, street=street)
        values = {
            'city': text(row['CITY']),
            'postal_code': text(row['POSTAL_CODE']),
            'delivery': True,
            'ship_to_default': flag(row['DEFAULT_ADDRESS']),
            'ship_to_contact': text(row['CONTACT_NAME']),
            'ship_to_title': text(row['CONTACT_TITLE']),
            'ship_to_phone': text(row['CONTACT_PHONE']),
            'ship_to_fax': text(row['CONTACT_FAX']),
            'ship_to_email': text(row['CONTACT_EMAIL']),
            'ship_to_tax_exempt': flag(row['TAX_EXEMPT']),
            'ship_to_tax_group': codes['group'].get(row['TAX_GROUP_ID']),
            'ship_to_tax_id_number': text(row['TAX_ID_NUMBER']),
            'ship_to_sales_rep': codes['rep'].get(row['SALESREP_ID']),
            'ship_to_territory': codes['territory'].get(row['TERRITORY']),
            'ship_to_fob_point': codes['fob'].get(row['FOB_POINT']),
            'ship_to_ship_via': codes['via'].get(row['SHIP_VIA']),
            'ship_to_carrier': codes['carrier'].get(row['CARRIER_ID']),
            'ship_to_discount_class': codes['discount'].get(
                row['DISCOUNT_CLASS_ID']),
            }
        if not found:
            for k, v in values.items():
                setattr(address, k, v)
            address.save()
            m.count('js_sales ship to addresses')
        else:
            update(address, values)
    return parties


def price_breaks(price, row):
    "QTY_BREAK_1..10 / UNIT_PRICE_1..10 into the price's quantities"
    wanted = []
    for i in range(1, 11):
        qty, unit_price = row.get('QTY_BREAK_%s' % i), \
            row.get('UNIT_PRICE_%s' % i)
        if qty is None or unit_price is None:
            continue
        wanted.append((float(qty), dec(unit_price)))
    current = sorted((b.quantity, b.unit_price) for b in price.breaks)
    if current == sorted(wanted):
        return False
    while price.breaks:
        price.breaks.pop()
    for qty, unit_price in wanted:
        price.breaks.new(quantity=qty, unit_price=unit_price)
    return True


def prices(m, parties):
    "The customers' and discount classes' price break tables"
    Price = m.get('nline.sale_price')
    Class = m.get('nline.discount_class')
    classes = {c.code: c for c in Class.find(
            [('active', 'in', [True, False])])}
    sources = [('party', 'CUSTOMER_ID', parties, 'SALES_CUSTOMER_PRICE'),
        ('discount_class', 'DISCOUNT_CLASS_ID', classes,
            'SALES_DISCOUNT_PRICE')]
    for field, column, owners, table in sources:
        for row in m.js.rows("select * from %s" % table):
            owner = owners.get(row[column])
            product = m.product(row.get('PART_ID'))
            if owner is None or product is None:
                continue
            found = Price.find([(field, '=', owner.id),
                    ('product', '=', product.id)])
            price = found[0] if found else Price(product=product)
            setattr(price, field, owner)
            price.quote_type = QUOTE_TYPE.get(
                (row.get('QUOTE_TYPE') or '').strip().upper(), 'break')
            price.customer_part = text(row.get('CUSTOMER_PART_ID'))
            price.use_part_price = flag(row.get('USE_PART_PRICE'))
            price.default_unit_price = dec(row.get('DEFAULT_UNIT_PRICE'),
                None)
            price.as_of = day(row.get('QUOTE_DATE'))
            price.expires = day(row.get('QUOTE_EXPIRES'))
            changed = price_breaks(price, row)
            if not found or changed or price._changed:
                price.save()
                m.count('nline.sale_price')


def orders(m, codes):
    """The Jobshop fields of the sales orders step sales imported (their
    number is the Jobshop Order ID), their lines' and their charges"""
    Sale = m.get('sale.sale')
    Charge = m.get('nline.sale_charge')
    sales = {s.number: s for s in Sale.find([('number', '!=', None)])}
    if not sales:
        return
    numbers = sorted(sales)
    heads = []
    for i in range(0, len(numbers), 500):
        part = numbers[i:i + 500]
        heads += m.js.rows("select * from SALES_SALES_ORDER where ID in "
            "(%s)" % ','.join('?' * len(part)), *part)
    for head in heads:
        sale = sales[head['ID']]
        status = (head['ORDER_STATUS'] or '').upper()
        values = {
            'sales_rep': codes['rep'].get(head['SALESREP_ID']),
            'territory': codes['territory'].get(head['TERRITORY']),
            'fob_point': codes['fob'].get(head['FOB_POINT']),
            'ship_via': codes['via'].get(head['SHIP_VIA']),
            'js_carrier': codes['carrier'].get(head['CARRIER_ID']),
            'tax_group': codes['group'].get(head['TAX_GROUP_ID']),
            'discount_class': codes['discount'].get(
                head['DISCOUNT_CLASS_ID']),
            'freight_terms': FREIGHT.get(
                (head['FREIGHT_TERMS'] or '').strip().upper()),
            'promise_date': day(head['PROMISE_DATE']),
            'js_quote': text(head['QUOTE_ID']),
            'js_specs': text(head['SPECIFICATIONS']),
            'js_copy_notes': flag(head.get('COPY_NOTES')),
            }
        # The order's own Sold To / Ship To tabs
        for prefix, column in [('js_sold_', ''), ('js_ship_', 'SHIPTO_')]:
            for part, name in ADDRESS_COLUMNS:
                values[prefix + part] = text(head.get(column + name))
        printed = day(head['PRINTED_DATE'])
        if head.get('DESIRED_SHIP_DATE') and sale.state == 'draft':
            values['shipping_date'] = day(head['DESIRED_SHIP_DATE'])
        flags = {'js_hold': status == 'HOLD',
            'js_closed': status == 'CLOSED' and sale.state != 'done',
            'js_printed_date': printed}
        changed = update(sale, values)
        if any(getattr(sale, k) != v for k, v in flags.items()):
            # Read-only on the form: written as the importer
            Sale.write([sale.id], flags, m.context)
            changed = True
        sale = Sale(sale.id)

        rows = m.js.rows("select * from SALES_ORDER_LINE where SALES_ID = ? "
            "order by LINE_NO", head['ID'])
        lines = sorted((l for l in sale.lines if l.type == 'line'),
            key=lambda l: (l.sequence or 0, l.id))
        for line, row in zip(lines, rows):
            line_values = {
                'customer_part': text(row['CUSTOMER_PART_ID']),
                'customer_po_line': text(row['CUSTOMER_PO_LINE_NO']),
                'gross_unit_price': dec(row['UNIT_PRICE']).quantize(
                    Decimal('0.0001')),
                'trade_discount': dec(row['TRADE_DISC_PERCENT']),
                'promise_date': day(row['PROMISE_DATE']),
                'product_code': codes['product_code'].get(
                    row['PRODUCT_CODE']),
                'commodity_code': codes['commodity_code'].get(
                    row['COMMODITY_CODE']),
                'line_tax_group': codes['group'].get(row['TAX_GROUP_ID']),
                'js_line_specs': text(row['SPECIFICATIONS']),
                'js_desired_date': day(row['DESIRED_SHIP_DATE']),
                'drawing_id': text(row['DRAWING_ID']),
                'drawing_rev': text(row['DRAWING_REV_NO']),
                'commissionable': flag(row['COMMISSIONABLE']),
                'commission_percent': dec(row['COMMISSION_PERCENT'])
                if row.get('COMMISSION_PERCENT') is not None else None,
                'js_ship_via': codes['via'].get(row.get('SHIP_VIA')),
                'user_0': text(row['USER_0']),
                'user_1': text(row['USER_1']),
                'user_2': text(row['USER_2']),
                }
            if row['QUOTE_LINE_NO'] is not None:
                line_values['quote_line_no'] = int(row['QUOTE_LINE_NO'])
            discount = line_values['trade_discount']
            if sale.state == 'draft' and discount:
                line_values['unit_price'] = (
                    line_values['gross_unit_price'] * (1 - discount / 100)
                    ).quantize(Decimal('0.0001'))
            if update(line, line_values):
                changed = True
        if changed:
            m.count('js_sales orders updated')

        # The order's service charges (an applied one waits for the next
        # invoice only on an order still open)
        existing = {c.service_charge.code: c for c in sale.charges}
        for row in m.js.rows("select * from SALES_ORDER_CHARGE where "
                "SALES_ID = ?", head['ID']):
            service = codes['service'].get(row['SERVICE_CHARGE_ID'])
            account = m.account(row['REV_GL_ACCT_ID']) \
                if row.get('REV_GL_ACCT_ID') else None
            pending = (flag(row['APPLY'])
                and not dec(row['APPLIED_AMOUNT'])
                and status in ('RELEASED', 'UNRELEASED', 'FIRM', 'HOLD'))
            charge_values = {
                'description': one_line(row['DESCRIPTION']) or None,
                'amount': dec(row['AMOUNT']),
                'tax_group': codes['group'].get(row['TAX_GROUP_ID']),
                'apply': pending,
                }
            if account:
                charge_values['account'] = account
            charge = existing.get(service.code)
            if charge is None:
                charge = Charge(sale=sale, service_charge=service,
                    **charge_values)
                charge.save()
                m.count('nline.sale_charge')
            else:
                update(charge, charge_values)
