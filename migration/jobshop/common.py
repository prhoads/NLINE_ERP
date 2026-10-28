"""Jobshop Common data (step js_common): the code tables of the Common group
bar from VISUAL Jobshop's SHARED_* tables into the ERP (nline_js_common).

- SHARED_FOB_POINT, SHARED_SHIP_VIA, SHARED_PRODUCT_CODE,
  SHARED_COMMODITY_CODE, SHARED_REASON_CODE -> the nline.* code tables
- SHARED_TERMS_RULE -> account.invoice.payment_term (matched by name)
- SHARED_STATE_PROVINCE -> matched to country.subdivision (Tryton has the ISO
  list): the ones it lacks are listed, not made
- SHARED_POSTAL_CODE -> country.postal_code (no country: the US)
- SHARED_CURRENCY_CODE -> currency.currency (matched by code)
- SHARED_USER_ALERT, SHARED_USER_MESSAGE -> nline.user_alert,
  nline.alert_message, for the users the ERP has (same login)

Re-runnable: what exists (same ID) is updated, never duplicated."""
import re
from decimal import Decimal

try:
    from nline_migrate import log, one_line
except ImportError:                     # the tests
    def log(message):
        print(message)

    def one_line(value, size=None):
        value = ' '.join(str(value or '').split())
        return value[:size] if size else value



def find_all(Model, domain=None):
    "The records, inactive ones too"
    with Model._config.set_context(active_test=False):
        return Model.find(domain or [])

# Jobshop terms_type and the code tables' enums -> the ERP's selections
AGE_TYPES = {'AGE': 'age', 'COD': 'cod', 'DAY_NEXT_MONTH': 'day_next_month',
    'EOM': 'eom'}
REASON_TYPES = {'INVENTORY': 'inventory', 'LABOR': 'labor',
    'CALENDAR': 'calendar', 'EMPLOYEE': 'employee'}

# Jobshop's free-text countries (POSTAL_CODE.COUNTRY) -> ISO codes
COUNTRIES = {
    'USA': 'US', 'US': 'US', 'UNITED STATES': 'US', 'UNITED STATE': 'US',
    'UK': 'GB', 'UNITED KINGDOM': 'GB', 'BRASIL': 'BR', 'BRAZIL': 'BR',
    'UAE': 'AE', 'CANADA': 'CA', 'MEXICO': 'MX', 'AUSTRALIA': 'AU',
    'CHINA': 'CN', 'GERMANY': 'DE', 'INDIA': 'IN', 'INDONESIA': 'ID',
    'MALAYSIA': 'MY', 'NORWAY': 'NO', 'PAKISTAN': 'PK', 'POLAND': 'PL',
    'SINGAPORE': 'SG', 'TURKMENISTAN': 'TM', 'BANGLADESH': 'BD',
    }
# Where a bare Jobshop state ID (TX, AB, RJ) is looked for, in order
STATE_COUNTRIES = ['US', 'CA', 'MX', 'BR', 'AU', 'GB']


def unchanged(record, values):
    "The record has these values already (a blank text is None)"
    def norm(v):
        return None if v == '' else v
    return all(norm(getattr(record, f)) == norm(v) for f, v in values.items())


def inactive(value):
    "Jobshop booleans are 0 / -1 (or 1)"
    return bool(value) and value != 0


def code_tables(m):
    "FOB points, ship vias, product, commodity and reason codes"
    tables = [
        ('SHARED_FOB_POINT', 'nline.fob_point', 'DESCRIPTION', {}),
        ('SHARED_SHIP_VIA', 'nline.ship_via', 'DESCRIPTION', {}),
        ('SHARED_PRODUCT_CODE', 'nline.product_code', 'DESCRIPTION',
            {'markup_percent': 'MARKUP_PERCENT'}),
        ('SHARED_COMMODITY_CODE', 'nline.commodity_code', 'DESCRIPTION',
            {'markup_percent': 'MARKUP_PERCENT'}),
        ('SHARED_REASON_CODE', 'nline.reason_code', 'REASON',
            {'reason_type': 'REASON_TYPE'}),
        ]
    for table, model, description, extra in tables:
        Model = m.get(model)
        existing = {r.code: r for r in find_all(Model)}
        made = changed = 0
        seen = set()
        for row in m.js.rows('select * from %s order by ID' % table):
            code = one_line(row['ID'])
            if not code or code in seen:
                continue
            seen.add(code)
            values = {
                'description': one_line(row.get(description)) or None,
                'active': not inactive(row.get('INACTIVE')),
                }
            for field, column in extra.items():
                value = row.get(column)
                if field == 'reason_type':
                    value = REASON_TYPES.get((value or '').upper(),
                        'inventory')
                elif value is not None:
                    # Jobshop keeps 6 decimals, the ERP field 4
                    value = Decimal(str(value)).quantize(Decimal('0.0001'))
                values[field] = value
            record = existing.get(code)
            if record is None:
                record = Model(code=code)
                made += 1
            elif unchanged(record, values):
                continue
            else:
                changed += 1
            for field, value in values.items():
                setattr(record, field, value)
            record.save()
            existing[code] = record
        m.count(model, made)
        log("%s: %s made, %s updated" % (model, made, changed))


def net_days(row):
    "The Jobshop net days, or the days in its ID (Net 30 Days)"
    if row.get('TERMS_NET_DAYS') is not None:
        return int(row['TERMS_NET_DAYS'])
    found = re.match(r'^\s*net\s*(\d+)', row['ID'] or '', re.I)
    return int(found.group(1)) if found else None


def terms(m):
    """Every Jobshop terms ID as a payment term of the same name; one
    already there keeps its due dates unless Jobshop gives its days"""
    PaymentTerm = m.get('account.invoice.payment_term')
    existing = {t.name.strip().upper(): t for t in find_all(PaymentTerm)}
    made = changed = 0
    for row in m.js.rows('select * from SHARED_TERMS_RULE order by ID'):
        name = one_line(row['ID'])
        if not name:
            continue
        days = net_days(row)
        net_type = AGE_TYPES.get((row.get('TERMS_NET_TYPE') or '').upper(),
            'age')
        values = {
            'discount_type': AGE_TYPES.get(
                (row.get('TERMS_DISC_TYPE') or '').upper(), 'age'),
            'early_discount_days': row.get('TERMS_DISC_DAYS'),
            'early_discount_rate': (Decimal(str(row['TERMS_DISC_PERCENT']))
                / 100 if row.get('TERMS_DISC_PERCENT') else None),
            'active': not inactive(row.get('INACTIVE')),
            }
        if row.get('TERMS_DESCRIPTION'):
            values['description'] = row['TERMS_DESCRIPTION'].strip()
        term = existing.get(name.upper())
        if term is None:
            term = PaymentTerm(name=name, net_type=net_type,
                net_days=days if days is not None else 0)
            made += 1
        else:
            # Its own due dates stay unless Jobshop says when it is due
            if days is not None or net_type != 'age':
                values['net_type'] = net_type
                values['net_days'] = days
            if unchanged(term, values):
                continue
            changed += 1
        for field, value in values.items():
            setattr(term, field, value)
        term.save()
        existing[name.upper()] = term
    m.count('payment terms', made)
    log("terms: %s made, %s updated" % (made, changed))


def countries(m):
    "The ERP's countries by ISO code"
    Country = m.get('country.country')
    return {c.code: c for c in find_all(Country)}


def find_subdivision(subdivisions, state, country_codes):
    "The subdivision of a Jobshop state ID or name, None when unknown"
    state = one_line(state).upper()
    if not state:
        return None
    for code in country_codes:
        found = subdivisions['code'].get('%s-%s' % (code, state))
        if found:
            return found
    for code in country_codes:
        found = subdivisions['name'].get((code, state))
        if found:
            return found
    return None


def load_subdivisions(m):
    Subdivision = m.get('country.subdivision')
    by_code, by_name = {}, {}
    for s in find_all(Subdivision):
        if s.code:
            by_code[s.code.upper()] = s
        by_name.setdefault((s.country.code, s.name.upper()), s)
    return {'code': by_code, 'name': by_name}


def states(m, subdivisions):
    """Jobshop's states and provinces are matched to Tryton's (ISO) ones;
    those it does not know are only listed (most are typos or cities)"""
    matched, unknown = 0, []
    for row in m.js.rows('select * from SHARED_STATE_PROVINCE order by ID'):
        found = (find_subdivision(subdivisions, row['ID'], STATE_COUNTRIES)
            or find_subdivision(subdivisions, row.get('NAME'),
                STATE_COUNTRIES))
        if found:
            matched += 1
        else:
            unknown.append(one_line(row['ID']))
    log("states/provinces: %s known to the ERP, %s not: %s" % (
            matched, len(unknown), ', '.join(unknown[:40])))


def postal_codes(m, by_code, subdivisions):
    PostalCode = m.get('country.postal_code')
    existing = {(p.postal_code, (p.city or '').upper(), p.country.id): p
        for p in PostalCode.find([])}
    made, skipped, filled = [], 0, []
    for row in m.js.rows('select * from SHARED_POSTAL_CODE order by ID'):
        code = one_line(row['ID'])
        name = one_line(row.get('COUNTRY')).upper()
        iso = COUNTRIES.get(name, name if len(name) == 2 else 'US' if not
            name else None)
        country = by_code.get(iso)
        if not code or country is None:
            skipped += 1
            continue
        city = one_line(row.get('CITY')) or None
        key = (code, (city or '').upper(), country.id)
        subdivision = find_subdivision(subdivisions, row.get('STATE'),
            [iso])
        if key in existing:
            # (made before the subdivisions were in the ERP: their State
            # was left blank; fill it in now)
            p = existing[key]
            if p is not None and subdivision and not p.subdivision:
                p.subdivision = subdivision
                filled.append(p)
            continue
        existing[key] = None
        made.append(PostalCode(postal_code=code, city=city, country=country,
                subdivision=subdivision))
    if made:
        PostalCode.save(made)
    if filled:
        PostalCode.save(filled)
    m.count('postal codes', len(made))
    log("postal codes: %s made, %s states filled in, %s without a known "
        "country" % (len(made), len(filled), skipped))


def currencies(m):
    Currency = m.get('currency.currency')
    existing = {c.code: c for c in find_all(Currency)}
    made = 0
    for row in m.js.rows('select * from SHARED_CURRENCY_CODE order by ID'):
        code = one_line(row['ID']).upper()[:3]
        if not code:
            continue
        currency = existing.get(code)
        if currency is None:
            currency = Currency(code=code, name=one_line(row.get('NAME'))
                or code)
            made += 1
        currency.symbol = row.get('CURRENCY_SYMBOL') or currency.symbol
        currency.thousands_separator = (row.get('THOUSANDS_SEP') or ',')[:1]
        currency.decimal_separator = (row.get('DECIMAL_SEP') or '.')[:1]
        currency.active = not inactive(row.get('INACTIVE'))
        if row.get('EXCHANGE_RATE'):
            currency.exchange_rate = Decimal(str(row['EXCHANGE_RATE']))
        currency.save()
        existing[code] = currency
    m.count('currencies', made)
    log("currency codes: %s made" % made)


def alerts(m):
    "The users' alerts and their unread messages, for the ERP's users"
    User = m.get('res.user')
    users = {u.login.upper(): u for u in find_all(User)}
    Alert = m.get('nline.user_alert')
    Message = m.get('nline.alert_message')
    lower = str.lower
    known = {(a.user.id, a.alert_type, a.alert_change, a.alert_action)
        for a in Alert.find([])}
    made = 0
    for row in m.js.rows('select * from SHARED_USER_ALERT'):
        user = users.get((row['USER_ID'] or '').upper())
        if not user:
            continue
        key = (user.id, lower(row['ALERT_TYPE']), lower(row['ALERT_CHANGE']),
            lower(row['ALERT_ACTION']))
        if key in known:
            continue
        known.add(key)
        Alert(user=user, alert_type=key[1], alert_change=key[2],
            alert_action=key[3], recipient=row.get('RECIPIENT'),
            subject=row.get('SUBJECT')).save()
        made += 1
    imported = {msg.jobshop_identity for msg in Message.find([
                ('jobshop_identity', '!=', None)])}
    messages = []
    for row in m.js.rows('select * from SHARED_USER_MESSAGE '
            'where ARCHIVED = 0'):
        user = users.get((row['USER_ID'] or '').upper())
        identity = row['RECORD_IDENTITY']
        if not user or identity in imported:
            continue
        messages.append(Message(user=user,
                alert_type=lower(row['ALERT_TYPE']),
                alert_change=lower(row['ALERT_CHANGE']),
                alert_action=lower(row['ALERT_ACTION']),
                recipient=row.get('RECIPIENT'), subject=row.get('SUBJECT'),
                message=row.get('MESSAGE'), sent_on=row.get('SENT_ON'),
                jobshop_identity=identity))
    if messages:
        Message.save(messages)
    m.count('alerts', made)
    m.count('alert messages', len(messages))
    log("alerts: %s made, %s messages" % (made, len(messages)))


def run(m):
    code_tables(m)
    terms(m)
    by_code = countries(m)
    if not by_code:
        log("no countries in the ERP (trytond_import_countries): states "
            "and postal codes skipped")
    else:
        subdivisions = load_subdivisions(m)
        states(m, subdivisions)
        postal_codes(m, by_code, subdivisions)
    currencies(m)
    alerts(m)
