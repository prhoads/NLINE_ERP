"""Jobshop Purchasing data (step js_purchasing): services, purchasing tax
groups, the supplier fields (Suppliers window), the suppliers' part and
service prices, requests for quote, and the Jobshop fields of the purchase
orders already imported (number = Jobshop PO ID).

Re-runnable: a record already here (a service by its code SVC-<id>, a tax
group by its ID, a price by supplier + part + supplier part ID, an RFQ by
its ID) is updated, never duplicated. Reads Jobshop only."""

from nline_migrate import chunks, day, dec, log, one_line, placeholders

FREIGHT = {'BILLED': 'billed', 'COLLECT': 'collect', 'PREPAID': 'prepaid'}
RFQ_STATUS = {'ACTIVE': 'active', 'UNRELEASED': 'unreleased',
    'CLOSED': 'closed', 'CANCELLED': 'cancelled'}
SHIP_TO = [('ship_to_name', 'SHIPTO_NAME'), ('ship_to_city', 'SHIPTO_CITY'),
    ('ship_to_state', 'SHIPTO_STATE'),
    ('ship_to_postal_code', 'SHIPTO_POSTAL_CODE'),
    ('ship_to_country', 'SHIPTO_COUNTRY'),
    ('ship_to_contact', 'SHIPTO_CONTACT_NAME'),
    ('ship_to_title', 'SHIPTO_CONTACT_TITLE'),
    ('ship_to_phone', 'SHIPTO_CONTACT_PHONE'),
    ('ship_to_fax', 'SHIPTO_CONTACT_FAX'),
    ('ship_to_email', 'SHIPTO_CONTACT_EMAIL')]


def text(value):
    "A Jobshop text blob as text (None when empty)"
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode('cp1252', 'replace')
    value = str(value).replace('\r\n', '\n').strip()
    return value or None


def flag(value):
    "Jobshop booleans are -1 / 0"
    return bool(value) and value != 0


class Codes:
    "The ERP records of Jobshop code tables, by code"

    def __init__(self, m):
        self.m = m
        self.cache = {}

    def get(self, model, code, field='code'):
        if not code:
            return None
        key = (model, code)
        if key not in self.cache:
            Model = self.m.get(model)
            found = Model.find([(field, '=', code)], limit=1)
            self.cache[key] = found[0] if found else None
        return self.cache[key]


def run(m):
    if not m.parties:
        m.load_parties()
    m.load_products()
    codes = Codes(m)
    services(m)
    tax_groups(m, codes)
    suppliers = supplier_fields(m, codes)
    supplier_prices(m, suppliers)
    rfqs(m, codes)
    purchase_orders(m, codes)
    log("js_purchasing: " + ', '.join('%s %s' % (m.counts[k], k) for k in [
                'js services', 'js tax groups', 'js suppliers',
                'js supplier prices', 'js rfqs', 'js purchase orders']))


# ---- Services ------------------------------------------------------------

def services(m):
    "Every Jobshop service as an outside service (code SVC-<id>)"
    Template = m.get('product.template')
    for row in m.js.rows("select * from PURCHASING_SERVICE"):
        product = m.service(row['ID'])
        template = Template(product.template.id)
        name = one_line(row.get('DESCRIPTION'), 120) or row['ID']
        active = not flag(row.get('INACTIVE'))
        changed = False
        if template.name != name:
            template.name = name
            changed = True
        if template.active != active:
            template.active = active
            changed = True
        if changed:
            template.save()
        m.count('js services')


# ---- Tax groups ----------------------------------------------------------

def tax_group(m, name):
    if not name:
        return None
    Tax = m.get('account.tax')
    found = Tax.find([('name', '=', name), ('parent', '=', None),
            ('group.code', '=', 'JS-PURCHASE')], limit=1)
    return found[0] if found else None


def tax_groups(m, codes):
    Desk = m.get('nline.desk')
    taxes = {}
    for row in m.js.rows("select * from PURCHASING_TAX order by "
            "TAX_GROUP_ID, TAX_NAME, EFFECTIVE_DATE"):
        taxes.setdefault(row['TAX_GROUP_ID'], []).append(row)
    for row in m.js.rows("select * from PURCHASING_TAX_GROUP"):
        rows = []
        for tax in taxes.get(row['ID'], []):
            account = m.account(tax.get('TAX_GL_ACCT_ID') or '')
            if not account:
                Account = m.get('account.account')
                found = Account.find([('name', 'ilike', '%tax%'),
                        ('type.statement', '=', 'balance'),
                        ('closed', '!=', True)], limit=1)
                account = found[0] if found else None
            if not account:
                log("tax group %s: no account for %s, left out"
                    % (row['ID'], tax['TAX_NAME']))
                continue
            rows.append({'name': tax['TAX_NAME'],
                    'description': one_line(tax.get('DESCRIPTION'))
                    or tax['TAX_NAME'],
                    'start_date': day(tax.get('EFFECTIVE_DATE')),
                    'percent': str(dec(tax.get('TAX_PERCENT'))),
                    'account': account.id})
        existing = tax_group(m, row['ID'])
        values = {'id': existing.id if existing else None, 'name': row['ID'],
            'description': one_line(row.get('DESCRIPTION')) or row['ID'],
            'taxes': rows}
        if existing:
            # The taxes already there keep their ids (used on orders)
            current = Desk.js_tax_group_get(existing.id, m.context)
            known = {(t['name'], t['start_date']): t['id']
                for t in current['taxes']}
            for tax in rows:
                tax['id'] = known.get((tax['name'], tax['start_date']))
        Desk.js_tax_group_save(values, m.context)
        m.count('js tax groups')


# ---- Suppliers -----------------------------------------------------------

def supplier_rows(m):
    "The Jobshop suppliers whose party is (or is now) in the ERP"
    if m.sample:
        ids = sorted({key[1] for key in m.party_by_js if key[0] == 'V'})
        rows = []
        for part in chunks(ids):
            rows += m.js.rows("select * from PURCHASING_SUPPLIER where ID in "
                "(%s)" % placeholders(part), *part)
        return rows
    return m.js.rows("select * from PURCHASING_SUPPLIER where "
        "isnull(INACTIVE, 0) = 0 or LAST_ORDER_DATE >= ?", m.cutoff)


def supplier_fields(m, codes):
    """The Jobshop fields of each supplier party; returns {Jobshop id:
    party}"""
    Party = m.get('party.party')
    Note = m.get('ir.note')
    Address = m.get('party.address')
    result = {}
    alternates = {}
    rows = supplier_rows(m)
    ids = [r['ID'] for r in rows]
    for part in chunks(ids):
        for row in m.js.rows("select * from PURCHASING_SUPPLIER_ADDRESS "
                "where SUPPLIER_ID in (%s) order by SUPPLIER_ID, ADDRESS_NO"
                % placeholders(part), *part):
            alternates.setdefault(row['SUPPLIER_ID'], []).append(row)
    for row in rows:
        party = m.js_party('V', row['ID'])
        party = Party(party.id)
        result[row['ID']] = party
        values = {
            'is_supplier': True,
            'supplier_inactive': flag(row.get('INACTIVE')),
            'supplier_contact': one_line(row.get('CONTACT_NAME')) or None,
            'supplier_contact_title': one_line(row.get('CONTACT_TITLE'))
            or None,
            'supplier_open_date': day(row.get('OPEN_DATE'))
            or day(row.get('RECORD_CREATED')),
            'supplier_exported': flag(row.get('POSTED')),
            'supplier_exported_date': day(row.get('POSTED_DATE')),
            'supplier_our_customer_id': one_line(row.get('OUR_CUSTOMER_ID'))
            or None,
            'supplier_buyer': one_line(row.get('BUYER')) or None,
            'supplier_tax_id_number': one_line(row.get('TAX_ID_NUMBER'))
            or None,
            'supplier_tax_exempt': flag(row.get('TAX_EXEMPT')),
            'supplier_freight_terms': FREIGHT.get(
                (row.get('FREIGHT_TERMS') or '').upper()),
            'supplier_specifications': text(row.get('SPECIFICATIONS')),
            'supplier_rfq_instructions': text(row.get('RFQ_INSTRUCTIONS')),
            'supplier_po_instructions': text(
                row.get('PURCHASING_INSTRUCTIONS')),
            }
        for field, code_model, code in [
                ('supplier_fob_point', 'nline.fob_point', 'FOB_POINT'),
                ('supplier_ship_via', 'nline.ship_via', 'SHIP_VIA')]:
            record = codes.get(code_model, row.get(code))
            values[field] = record
        values['supplier_tax_group'] = tax_group(m, row.get('TAX_GROUP_ID'))
        if row.get('EXP_GL_ACCT_ID'):
            values['supplier_expense_account'] = m.account(
                row['EXP_GL_ACCT_ID'])
        # Contact and address as Jobshop has them on the supplier
        if row.get('ADDR_ETC'):
            values['supplier_address_etc'] = text(row['ADDR_ETC'])
        if row.get('STATE'):
            values['supplier_state'] = row['STATE'].strip()
        if row.get('COUNTRY'):
            values['supplier_country'] = row['COUNTRY'].strip()
        if row.get('CONTACT_FAX'):
            values['supplier_fax'] = row['CONTACT_FAX'].strip()
        if row.get('WEB_URL'):
            values['supplier_web_url'] = row['WEB_URL'].strip()
        changed = False
        for field, value in values.items():
            current = getattr(party, field)
            if hasattr(current, 'id'):
                current = current.id
            target = value.id if hasattr(value, 'id') else value
            if current != target and not (current in (None, '', False)
                    and target in (None, '', False)):
                setattr(party, field, value)
                changed = True
        if changed:
            party.save()
        notes = text(row.get('NOTES'))
        if notes and not Note.find([
                    ('resource', '=', 'party.party,%s' % party.id),
                    ('message', '=', notes)]):
            Note(resource=party, message=notes).save()
        # The alternate addresses (Addresses tab)
        party.reload()
        known = {((a.street or '').strip().upper(),
                (a.city or '').strip().upper()) for a in party.addresses}
        for alt in alternates.get(row['ID'], []):
            street = '\n'.join(filter(None, [one_line(alt.get('ADDR_1')),
                        one_line(alt.get('ADDR_2')),
                        text(alt.get('ADDR_ETC'))]))
            key = (street.upper(), (alt.get('CITY') or '').strip().upper())
            if key in known:
                continue
            address = Address(party=party,
                party_name=one_line(alt.get('NAME')) or None,
                street=street or None,
                city=one_line(alt.get('CITY')) or None,
                postal_code=one_line(alt.get('POSTAL_CODE')) or None,
                site_contact_name=one_line(alt.get('CONTACT_NAME')) or None,
                site_contact_title=one_line(alt.get('CONTACT_TITLE'))
                or None,
                site_contact_phone=one_line(alt.get('CONTACT_PHONE'))
                or None,
                site_contact_fax=one_line(alt.get('CONTACT_FAX')) or None,
                site_contact_email=one_line(alt.get('CONTACT_EMAIL'))
                or None)
            address.save()
            known.add(key)
        m.count('js suppliers')
    return result


# ---- Supplier part and service prices ---------------------------------------

def quote_prices(row):
    "The rows of a Jobshop QUOTE_VALUES table as [{quantity, unit_price}]"
    prices = []
    for i in range(1, 11):
        price = row.get('UNIT_PRICE_%s' % i)
        if price is None:
            continue
        quantity = row.get('QTY_BREAK_%s' % i)
        prices.append({'quantity': float(quantity) if quantity else 0,
                'unit_price': str(dec(price))})
    default = row.get('DEFAULT_UNIT_PRICE')
    if default is not None:
        # Break table: the base price (no quantity); up-to table: the price
        # above the last quantity
        if not any(not p['quantity'] for p in prices):
            prices.append({'quantity': 0, 'unit_price': str(dec(default))})
    return prices


def save_price(m, party, product, row, service_part=None, code=None):
    Desk = m.get('nline.desk')
    ProductSupplier = m.get('purchase.product_supplier')
    existing = ProductSupplier.find([('party', '=', party.id),
            ('template', '=', product.template.id)])
    record = next((r for r in existing if (r.code or None) == code), None)
    if record is None:
        # The preferred supplier the parts step made has no code yet
        record = next((r for r in existing if not r.code
                and not r.prices), None)
    values = {
        'id': record.id if record else None,
        'party': party.id,
        'product': product.id,
        'service_part': service_part.id if service_part else None,
        'code': code,
        'mfg_name': one_line(row.get('MFG_NAME')) or None,
        'mfg_part_id': one_line(row.get('MFG_PART_ID')) or None,
        'price_type': 'upto' if (row.get('QUOTE_TYPE') or '').upper()
        == 'UPTO' else 'break',
        'quote_date': day(row.get('QUOTE_DATE')),
        'expiration_date': day(row.get('QUOTE_EXPIRES')),
        'lead_time': int(row['PLANNING_LEADTIME'])
        if row.get('PLANNING_LEADTIME') else None,
        'minimum_quantity': float(row['MINIMUM_ORDER_QTY'])
        if row.get('MINIMUM_ORDER_QTY') else None,
        'multiple_quantity': float(row['MULTIPLE_ORDER_QTY'])
        if row.get('MULTIPLE_ORDER_QTY') else None,
        'prices': quote_prices(row),
        }
    Desk.js_supplier_price_save(values, m.context)
    m.count('js supplier prices')


def supplier_prices(m, suppliers):
    for row in m.js.rows("select * from PURCHASING_SUPPLIER_PART "
            "where PART_ID is not null"):
        party = suppliers.get(row['SUPPLIER_ID'])
        if m.sample and (not party or row['PART_ID'] not in m.products):
            continue
        party = party or m.js_party('V', row['SUPPLIER_ID'])
        product = m.product(row['PART_ID'])
        if not product or not product.template.purchasable:
            continue
        save_price(m, party, product, row,
            code=one_line(row.get('SUPPLIER_PART_ID')) or None)
    for row in m.js.rows("select * from PURCHASING_SUPPLIER_SERVICE"):
        party = suppliers.get(row['SUPPLIER_ID'])
        if m.sample and not party:
            continue
        party = party or m.js_party('V', row['SUPPLIER_ID'])
        product = m.service(row['SERVICE_ID'], party)
        part = m.products.get(row.get('PART_ID')) if m.sample else \
            m.product(row.get('PART_ID'))
        save_price(m, party, product, row, service_part=part,
            code=one_line(row.get('SUPPLIER_SERVICE_ID')) or None)


# ---- Requests for quote ------------------------------------------------------

def production_of(m, row):
    "The work order (or leg) of a Jobshop link, and the link as text"
    number = row['WORK_ID'] + ('' if row.get('LOT_ID') in ('1', None)
        else '/' + row['LOT_ID']) + ('' if row.get('SPLIT_ID') in ('0', None)
        else '.' + row['SPLIT_ID'])
    if row.get('SUB_ID') not in ('0', None):
        number += '/' + row['SUB_ID']
    reference = '%s/%s.%s-%s' % (row['WORK_ID'], row.get('LOT_ID') or '1',
        row.get('SPLIT_ID') or '0', row.get('SUB_ID') or '0')
    if not hasattr(m, '_js_productions'):
        m._js_productions = {}
    if number not in m._js_productions:
        Production = m.get('production')
        found = Production.find([('number', '=', number)], limit=1)
        m._js_productions[number] = found[0].id if found else None
    return m._js_productions[number], reference


def links(m, rows):
    result = []
    for row in rows:
        production, reference = production_of(m, row)
        link = {
            'production': production,
            'operation': row.get('SEQ_NO'),
            'piece': row.get('PIECE_NO'),
            'quantity': float(row['QTY'] or 0),
            'reference': reference,
            }
        if 'RECEIVED_QTY' in row:
            link['received_quantity'] = float(row['RECEIVED_QTY'] or 0)
        result.append(link)
    return result


def rfqs(m, codes):
    RFQ = m.get('nline.rfq')
    Desk = m.get('nline.desk')
    done = {r.number for r in RFQ.find([])}
    if m.sample:
        # Every open RFQ (N-Line's newest is older than the sample's year)
        heads = m.js.rows("select * from PURCHASING_RFQ where RFQ_STATUS in "
            "('ACTIVE', 'UNRELEASED') order by ID")
    else:
        heads = m.js.rows("select * from PURCHASING_RFQ where RFQ_DATE >= ? "
            "or RFQ_STATUS in ('ACTIVE', 'UNRELEASED') order by ID",
            m.cutoff)
    for head in heads:
        if head['ID'] in done:
            continue
        values = {
            'number': head['ID'],
            'rfq_date': day(head['RFQ_DATE']),
            'due_date': day(head.get('DUE_DATE')),
            'desired_receive_date': day(head.get('DESIRED_RECV_DATE')),
            'status': RFQ_STATUS.get(head.get('RFQ_STATUS'), 'unreleased'),
            'buyer': one_line(head.get('BUYER')) or None,
            'freight_terms': FREIGHT.get(
                (head.get('FREIGHT_TERMS') or '').upper()),
            'specifications': text(head.get('SPECIFICATIONS')),
            'ship_to_street': '\n'.join(filter(None, [
                        one_line(head.get('SHIPTO_ADDR_1')),
                        one_line(head.get('SHIPTO_ADDR_2')),
                        text(head.get('SHIPTO_ADDR_ETC'))])) or None,
            'lines': [],
            }
        for field, column in SHIP_TO:
            values[field] = one_line(head.get(column)) or None
        record = codes.get('nline.fob_point', head.get('FOB_POINT'))
        values['fob_point'] = record.id if record else None
        record = codes.get('nline.ship_via', head.get('SHIP_VIA'))
        values['ship_via'] = record.id if record else None
        term = m.term(head.get('TERMS_RULE_ID'))
        values['payment_term'] = term.id if term else None
        if head.get('PAYB_GL_ACCT_ID'):
            account = m.account(head['PAYB_GL_ACCT_ID'])
            values['payable_account'] = account.id if account else None
        for slot in (1, 2, 3):
            supplier = head.get('SUPPLIER_ID_%s' % slot)
            party = m.js_party('V', supplier) if supplier else None
            if party and not party.is_supplier:
                m.get('party.party').write([party.id], {'is_supplier': True},
                    m.context)
            values['supplier_%s' % slot] = party.id if party else None
            values['quote_received_%s' % slot] = flag(
                head.get('SUPPLIER_QUOTE_RECV_%s' % slot))
            values['reference_%s' % slot] = one_line(
                head.get('SUPPLIER_QUOTE_REF_%s' % slot)) or None
            values['as_of_date_%s' % slot] = day(
                head.get('SUPPLIER_AS_OF_DATE_%s' % slot))
            values['expiration_date_%s' % slot] = day(
                head.get('SUPPLIER_EXP_DATE_%s' % slot))
            group = tax_group(m, head.get('TAX_GROUP_ID_%s' % slot))
            values['tax_group_%s' % slot] = group.id if group else None
        prices = {}
        for row in m.js.rows("select * from PURCHASING_RFQ_LINE_PRICE where "
                "RFQ_ID = ? order by RFQ_LINE_NO, USER_QUOTE_QTY",
                head['ID']):
            prices.setdefault(row['RFQ_LINE_NO'], []).append(row)
        linked = {}
        for row in m.js.rows("select * from PURCHASING_RFQ_LINK where "
                "RFQ_ID = ?", head['ID']):
            linked.setdefault(row['RFQ_LINE_NO'], []).append(row)
        for row in m.js.rows("select * from PURCHASING_RFQ_LINE where "
                "RFQ_ID = ? order by LINE_NO", head['ID']):
            product = None
            if row.get('SERVICE_ID'):
                product = m.service(row['SERVICE_ID'])
            elif row.get('PART_ID'):
                product = m.product(row['PART_ID'])
                if product and not product.template.purchasable:
                    product = None
            line = {
                'sequence': row['LINE_NO'],
                'line_type': 'service' if row.get('SERVICE_ID') else 'part',
                'line_status': 'closed' if (row.get('LINE_STATUS') or ''
                    ).upper() == 'CLOSED' else 'open',
                'product': product.id if product else None,
                'service_part': (m.products[row['PART_ID']].id
                    if row.get('SERVICE_ID') and row.get('PART_ID') in
                    m.products else None),
                'description': text(row.get('DESCRIPTION'))
                or row.get('PART_ID') or row.get('SERVICE_ID'),
                'unit': m.unit(row.get('PURCHASE_UM')).id,
                'mfg_name': one_line(row.get('MFG_NAME')) or None,
                'mfg_part_id': one_line(row.get('MFG_PART_ID')) or None,
                'desired_receive_date': day(row.get('DESIRED_RECV_DATE')),
                'specifications': text(row.get('SPECIFICATIONS')),
                'drawing': one_line(row.get('DRAWING_ID')) or None,
                'drawing_revision': one_line(row.get('DRAWING_REV_NO'))
                or None,
                'prices': [],
                'links': links(m, linked.get(row['LINE_NO'], [])),
                }
            for field, model in [('product_code', 'nline.product_code'),
                    ('commodity_code', 'nline.commodity_code')]:
                record = codes.get(model, row.get(field.upper()))
                line[field] = record.id if record else None
            if row.get('EXP_GL_ACCT_ID'):
                account = m.account(row['EXP_GL_ACCT_ID'])
                line['expense_account'] = account.id if account else None
            for slot in (1, 2, 3):
                line['supplier_code_%s' % slot] = one_line(
                    row.get('SUPPLIER_PART_ID_%s' % slot)
                    or row.get('SUPPLIER_SERVICE_ID_%s' % slot)) or None
                group = tax_group(m, row.get('TAX_GROUP_ID_%s' % slot))
                line['tax_group_%s' % slot] = group.id if group else None
            for price in prices.get(row['LINE_NO'], []):
                quoted = {'quantity': float(price['USER_QUOTE_QTY'] or 0)}
                for slot in (1, 2, 3):
                    unit_price = price.get('UNIT_PRICE_%s' % slot)
                    supplier = values['supplier_%s' % slot]
                    # A price of 0 from a supplier asked is "not quoted yet"
                    quoted['unit_price_%s' % slot] = (str(dec(unit_price))
                        if supplier and unit_price else None)
                    quoted['trade_discount_%s' % slot] = str(dec(
                        price.get('TRADE_DISC_PERCENT_%s' % slot)))
                    quoted['fixed_charge_%s' % slot] = str(dec(
                        price.get('FIXED_CHARGE_%s' % slot)))
                    lead = price.get('PLANNING_LEADTIME_%s' % slot)
                    quoted['lead_time_%s' % slot] = int(lead) if lead \
                        else None
                    quoted['delivery_date_%s' % slot] = day(
                        price.get('DELIVERY_DATE_%s' % slot))
                line['prices'].append(quoted)
            values['lines'].append(line)
        Desk.js_rfq_save(values, m.context)
        done.add(head['ID'])
        m.count('js rfqs')


# ---- Purchase orders already imported -------------------------------------------

def purchase_orders(m, codes):
    """The Jobshop fields of the purchase orders the purchases step
    imported (number = Jobshop PO ID): buyer, FOB, ship via, dates, specs,
    ship to, hold, the RFQ; on the lines the quoted price, discount, fixed
    charge, supplier's ids, codes, specs and the work order links"""
    Purchase = m.get('purchase.purchase')
    Line = m.get('purchase.line')
    Link = m.get('nline.purchase.link')
    RFQ = m.get('nline.rfq')
    RFQLine = m.get('nline.rfq.line')
    purchases = {p.number: p for p in Purchase.find([('number', '!=', None)])}
    if not purchases:
        return
    numbers = sorted(purchases)
    rfq_ids = {r.number: r.id for r in RFQ.find([])}
    for part in chunks(numbers):
        heads = m.js.rows("select * from PURCHASING_PURCHASE_ORDER where ID "
            "in (%s)" % placeholders(part), *part)
        lines_by = {}
        for row in m.js.rows("select * from PURCHASING_ORDER_LINE where "
                "PURCHASE_ID in (%s) order by PURCHASE_ID, LINE_NO"
                % placeholders(part), *part):
            lines_by.setdefault(row['PURCHASE_ID'], []).append(row)
        links_by = {}
        for row in m.js.rows("select * from PURCHASING_ORDER_LINK where "
                "PURCHASE_ID in (%s)" % placeholders(part), *part):
            links_by.setdefault((row['PURCHASE_ID'],
                    row['PURCHASE_LINE_NO']), []).append(row)
        for head in heads:
            purchase = purchases[head['ID']]
            values = {
                'buyer': one_line(head.get('BUYER')) or None,
                'freight_terms': FREIGHT.get(
                    (head.get('FREIGHT_TERMS') or '').upper()),
                'promise_date': day(head.get('PROMISE_DATE')),
                'specifications': text(head.get('SPECIFICATIONS')),
                'hold': (head.get('ORDER_STATUS') == 'HOLD'
                    and purchase.state in ('draft', 'quotation')),
                'ship_to_street': '\n'.join(filter(None, [
                            one_line(head.get('SHIPTO_ADDR_1')),
                            one_line(head.get('SHIPTO_ADDR_2')),
                            text(head.get('SHIPTO_ADDR_ETC'))])) or None,
                }
            for field, column in SHIP_TO:
                values[field] = one_line(head.get(column)) or None
            record = codes.get('nline.fob_point', head.get('FOB_POINT'))
            values['fob_point'] = record.id if record else None
            record = codes.get('nline.ship_via', head.get('SHIP_VIA'))
            values['ship_via'] = record.id if record else None
            group = tax_group(m, head.get('TAX_GROUP_ID'))
            values['tax_group'] = group.id if group else None
            if purchase.state == 'draft':
                values['delivery_date'] = day(head.get('DESIRED_RECV_DATE'))
            if head.get('RFQ_ID') in rfq_ids:
                values['rfq'] = rfq_ids[head['RFQ_ID']]
            Purchase.write([purchase.id], values, m.context)
            lines = [l for l in purchase.lines if l.type == 'line']
            rows = lines_by.get(head['ID'], [])
            for line, row in zip(lines, rows):
                line_values = {
                    'sequence': row['LINE_NO'],
                    'list_unit_price': dec(row.get('UNIT_PRICE')),
                    'trade_discount': dec(row.get('TRADE_DISC_PERCENT')),
                    'fixed_charge': dec(row.get('FIXED_CHARGE')),
                    'supplier_part_code': one_line(
                        row.get('SUPPLIER_PART_ID')
                        or row.get('SUPPLIER_SERVICE_ID')) or None,
                    'mfg_name': one_line(row.get('MFG_NAME')) or None,
                    'mfg_part_id': one_line(row.get('MFG_PART_ID')) or None,
                    'promise_date': day(row.get('PROMISE_DATE')),
                    'specifications': text(row.get('SPECIFICATIONS')),
                    'line_closed': (row.get('LINE_STATUS') or '').upper()
                    == 'CLOSED' and float(row.get('RECEIVED_QTY') or 0)
                    < float(row.get('ORDER_QTY') or 0),
                    }
                for field, model in [('product_code', 'nline.product_code'),
                        ('commodity_code', 'nline.commodity_code')]:
                    record = codes.get(model, row.get(field.upper()))
                    line_values[field] = record.id if record else None
                group = tax_group(m, row.get('TAX_GROUP_ID'))
                line_values['tax_group'] = group.id if group else None
                if row.get('EXP_GL_ACCT_ID'):
                    account = m.account(row['EXP_GL_ACCT_ID'])
                    line_values['expense_account'] = account.id \
                        if account else None
                if row.get('RFQ_ID') in rfq_ids and row.get('RFQ_LINE_NO'):
                    found = RFQLine.find([
                            ('rfq', '=', rfq_ids[row['RFQ_ID']]),
                            ('sequence', '=', row['RFQ_LINE_NO'])], limit=1)
                    if found:
                        line_values['rfq_line'] = found[0].id
                Line.write([line.id], line_values, m.context)
                found = links(m, links_by.get((head['ID'], row['LINE_NO']),
                        []))
                if found and not Link.find([('purchase_line', '=', line.id)]):
                    Link.create([dict(link, purchase_line=line.id)
                            for link in found], m.context)
            m.count('js purchase orders')
