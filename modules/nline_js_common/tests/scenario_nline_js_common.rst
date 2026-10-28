==============================
N-Line Jobshop Common Scenario
==============================

The Common group bar of VISUAL Jobshop: the code tables, Terms, Currency
Codes, Postal Codes, Alert Messages and the User Control Panel.

Imports::

    >>> import datetime as dt
    >>> import importlib.util
    >>> import os
    >>> from decimal import Decimal
    >>> from proteus import Model
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company
    >>> from trytond.modules.account.tests.tools import create_fiscalyear, \
    ...     create_chart, get_accounts
    >>> from trytond.modules.account_invoice.tests.tools import \
    ...     set_fiscalyear_invoice_sequences

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules('nline_js_common')

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> Desk = Model.get('nline.desk')

The code tables: an ID, unique, and a description::

    >>> ShipVia = Model.get('nline.ship_via')
    >>> ups = ShipVia(code=' UPS-GROUND ', description="UPS - Ground")
    >>> ups.save()
    >>> ups.code, ups.rec_name
    ('UPS-GROUND', 'UPS-GROUND - UPS - Ground')
    >>> ShipVia.find([('rec_name', 'ilike', '%ground%')]) == [ups]
    True
    >>> ShipVia(code='UPS-GROUND').save()  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    SQLConstraintError: ...
    >>> ReasonCode = Model.get('nline.reason_code')
    >>> scrap = ReasonCode(code='SCRAP', description="Finished Part Scrapped")
    >>> scrap.reason_type
    'inventory'
    >>> scrap.save()
    >>> ProductCode = Model.get('nline.product_code')
    >>> valves = ProductCode(code='VALVE', markup_percent=Decimal('25'))
    >>> valves.save()

The table window saves its changes at once (delete, write, create)::

    >>> FOB = Model.get('nline.fob_point')
    >>> plant = FOB(code='PLANT', description="N-Line Plant")
    >>> plant.save()
    >>> old = FOB(code='OLD')
    >>> old.save()
    >>> created = Desk.common_save_table('nline.fob_point', {
    ...         'delete': [old.id],
    ...         'write': [[plant.id, {'description': "Ex Works N-Line"}]],
    ...         'create': [{'code': 'DEST', 'description': "Destination"}],
    ...         }, config.context)
    >>> [(f.code, f.description) for f in FOB.find([])]
    [('DEST', 'Destination'), ('PLANT', 'Ex Works N-Line')]
    >>> Desk.common_save_table('res.user', {'delete': [1]},
    ...     config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    AccessError: ...

Terms: a term entered with its Jobshop rule gets its due date from it::

    >>> PaymentTerm = Model.get('account.invoice.payment_term')
    >>> Desk.common_save_table('account.invoice.payment_term', {
    ...         'create': [{'name': 'Net 45 Days', 'net_type': 'age',
    ...             'net_days': 45}]}, config.context) and None
    >>> net45, = PaymentTerm.find([('name', '=', 'Net 45 Days')])
    >>> line, = net45.lines
    >>> line.type, [d.days for d in line.relativedeltas]
    ('remainder', [45])
    >>> net45.net_type = 'eom'
    >>> net45.discount_type = 'day_next_month'
    >>> net45.early_discount_days = 10
    >>> net45.early_discount_rate = Decimal('0.02')
    >>> net45.save()
    >>> line, = net45.lines
    >>> [(d.day, d.months, d.days) for d in line.relativedeltas]
    [(31, 0, 0)]

End of month: the last day of the invoice's month; the discount of a "day
of next month" rule lasts to that day::

    >>> from trytond.modules.nline_js_common.terms import rule_date
    >>> rule_date('eom', None, dt.date(2026, 2, 10))
    datetime.date(2026, 2, 28)
    >>> rule_date('day_next_month', 10, dt.date(2026, 1, 25))
    datetime.date(2026, 2, 10)
    >>> rule_date('age', 45, dt.date(2026, 1, 10))
    datetime.date(2026, 2, 24)
    >>> rule_date('cod', None, dt.date(2026, 1, 10))
    datetime.date(2026, 1, 10)

A term with several due dates keeps them::

    >>> split = PaymentTerm(name='50/50')
    >>> first = split.lines.new(type='percent', ratio=Decimal('.5'),
    ...     divisor=Decimal('2'))
    >>> second = split.lines.new(type='remainder')
    >>> delta = second.relativedeltas.new(days=30)
    >>> split.save()
    >>> split.net_days = 10
    >>> split.save()
    >>> split.reload()
    >>> len(split.lines)
    2

Currency Codes: the separators and today's exchange rate::

    >>> Currency = Model.get('currency.currency')
    >>> cad = Currency(name="Canadian Dollar", code='CAD', symbol='$')
    >>> cad.thousands_separator, cad.decimal_separator
    (',', '.')
    >>> cad.save()
    >>> Currency.write([cad.id], {'exchange_rate': Decimal('1.36')},
    ...     config.context)
    >>> cad.reload()
    >>> cad.exchange_rate == Decimal('1.36')
    True
    >>> Currency.write([cad.id], {'exchange_rate': Decimal('1.38')},
    ...     config.context)
    >>> cad.reload()
    >>> len(cad.rates), cad.exchange_rate == Decimal('1.38')
    (1, True)

States/Provinces and Postal Codes are Tryton's subdivisions and postal
codes::

    >>> Country = Model.get('country.country')
    >>> us = Country(name="United States", code='US')
    >>> us.save()
    >>> Subdivision = Model.get('country.subdivision')
    >>> texas = Subdivision(name="Texas", code='US-TX', country=us,
    ...     type='state')
    >>> texas.save()
    >>> created = Desk.common_save_table('country.postal_code', {
    ...         'create': [{'postal_code': '77047', 'city': 'Houston',
    ...             'subdivision': texas.id, 'country': us.id}]},
    ...     config.context)
    >>> PostalCode = Model.get('country.postal_code')
    >>> PostalCode(created[0]).rec_name
    'Houston (77047)'

Alert Messages: a late purchase order raises a message for the user who
watches them, once::

    >>> Alert = Model.get('nline.user_alert')
    >>> alert = Alert(alert_type='po', alert_change='late')
    >>> alert.save()
    >>> alert.user.login, alert.alert_action, alert.generated
    ('admin', 'manual', True)

    >>> ProductCategory = Model.get('product.category')
    >>> category = ProductCategory(name="Castings")
    >>> category.accounting = True
    >>> category.account_expense = accounts['expense']
    >>> category.account_revenue = accounts['revenue']
    >>> category.save()
    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> template = Template(name="Body casting", default_uom=unit,
    ...     type='goods', purchasable=True, list_price=Decimal('0'))
    >>> template.account_category = category
    >>> template.save()
    >>> body, = template.products
    >>> Party = Model.get('party.party')
    >>> foundry = Party(name="Houston Foundry")
    >>> foundry.save()
    >>> Purchase = Model.get('purchase.purchase')
    >>> purchase = Purchase(party=foundry,
    ...     purchase_date=today - dt.timedelta(days=20),
    ...     delivery_date=today - dt.timedelta(days=2))
    >>> line = purchase.lines.new(product=body, quantity=5,
    ...     unit_price=Decimal('40'))
    >>> purchase.click('quote')
    >>> purchase.click('confirm')

    >>> Desk.common_refresh_alerts(config.context)
    1
    >>> Desk.common_refresh_alerts(config.context)
    0
    >>> Desk.common_alert_count(config.context)
    1
    >>> message, = Desk.common_alerts(False, 10, config.context)
    >>> message['subject'], message['message'] == (
    ...     "Purchase Order '%s' is late." % purchase.number)
    ('PO Overdue', True)
    >>> message['document'][:2] == ['purchase.purchase', purchase.id]
    True
    >>> Desk.common_archive_alerts([message['id']], True, config.context)
    1
    >>> Desk.common_alerts(False, 10, config.context)
    []
    >>> len(Desk.common_alerts(True, 10, config.context))
    1

Another user sees only their own alerts and messages::

    >>> User = Model.get('res.user')
    >>> Group = Model.get('res.group')
    >>> clerk = User(name="Clerk", login='clerk')
    >>> clerk.save()
    >>> config.user = clerk.id
    >>> Alert.find([])
    []
    >>> Model.get('nline.alert_message').find([])
    []
    >>> mine = Alert(alert_type='so', alert_change='late',
    ...     alert_action='email', recipient='clerk@example.com')
    >>> mine.save()
    >>> mine.user == clerk
    True
    >>> Desk.common_archive_alerts([message['id']], False, config.context)
    0

The User Control Panel: the user's preferences, never the password::

    >>> prefs = Desk.common_preferences(config.context)
    >>> prefs['login'], prefs['nlbi_sign_on']
    ('clerk', False)
    >>> 'password' in prefs
    False
    >>> prefs = Desk.common_set_preferences({'email': 'clerk@example.com',
    ...         'password': 'secret', 'name': 'Boss'}, config.context)
    >>> prefs['email'], prefs['name']
    ('clerk@example.com', 'Clerk')
    >>> config.user = 1

The Jobshop data import (migration/jobshop/common.py) on rows like
Jobshop's::

    >>> path = os.path.join(os.environ.get('NLINE_MIGRATION',
    ...     r'M:\NLINE_ERP\migration'), 'jobshop', 'common.py')
    >>> spec = importlib.util.spec_from_file_location('js_common', path)
    >>> js_common = importlib.util.module_from_spec(spec)
    >>> spec.loader.exec_module(js_common)

    >>> ROWS = {
    ...     'SHARED_FOB_POINT': [
    ...         {'ID': 'PLANT', 'DESCRIPTION': 'N-LINE PLANT', 'INACTIVE': -1},
    ...         {'ID': 'EX WORKS', 'DESCRIPTION': None, 'INACTIVE': 0}],
    ...     'SHARED_SHIP_VIA': [
    ...         {'ID': 'BEST WAY ', 'DESCRIPTION': 'BEST WAY',
    ...             'INACTIVE': 0}],
    ...     'SHARED_PRODUCT_CODE': [],
    ...     'SHARED_COMMODITY_CODE': [
    ...         {'ID': 'RAWMATL', 'DESCRIPTION': 'Raw Material',
    ...             'INACTIVE': 0, 'MARKUP_PERCENT': None}],
    ...     'SHARED_REASON_CODE': [
    ...         {'ID': 'SCRAP', 'REASON': 'Finished Part Scrapped',
    ...             'INACTIVE': 0, 'REASON_TYPE': 'LABOR'}],
    ...     'SHARED_TERMS_RULE': [
    ...         {'ID': 'Net 60 Days', 'TERMS_NET_TYPE': 'AGE',
    ...             'TERMS_NET_DAYS': None, 'TERMS_DISC_TYPE': 'AGE',
    ...             'TERMS_DISC_DAYS': None, 'TERMS_DISC_PERCENT': None,
    ...             'TERMS_DESCRIPTION': None, 'INACTIVE': 0},
    ...         {'ID': 'VISA', 'TERMS_NET_TYPE': 'AGE',
    ...             'TERMS_NET_DAYS': None, 'TERMS_DISC_TYPE': 'AGE',
    ...             'TERMS_DISC_DAYS': None, 'TERMS_DISC_PERCENT': None,
    ...             'TERMS_DESCRIPTION': None, 'INACTIVE': 0}],
    ...     'SHARED_STATE_PROVINCE': [
    ...         {'ID': 'TX', 'NAME': 'Texas'}, {'ID': 'Houston',
    ...             'NAME': None}],
    ...     'SHARED_POSTAL_CODE': [
    ...         {'ID': '77043', 'CITY': 'Houston', 'STATE': 'TX',
    ...             'COUNTRY': None},
    ...         {'ID': '77047', 'CITY': 'Houston', 'STATE': 'TX',
    ...             'COUNTRY': 'USA'},
    ...         {'ID': 'DE13 8BX', 'CITY': 'Burton', 'STATE': None,
    ...             'COUNTRY': 'Atlantis'}],
    ...     'SHARED_CURRENCY_CODE': [],
    ...     'SHARED_USER_ALERT': [],
    ...     'SHARED_USER_MESSAGE': [
    ...         {'RECORD_IDENTITY': 'AYQYOIQLD9', 'USER_ID': 'CLERK',
    ...             'ALERT_TYPE': 'PO', 'ALERT_CHANGE': 'LATE',
    ...             'ALERT_ACTION': 'EMAIL', 'RECIPIENT': 'c@example.com',
    ...             'SUBJECT': 'PO Overdue',
    ...             'MESSAGE': "Purchase Order '18222' is late.",
    ...             'SENT_ON': None, 'ARCHIVED': 0},
    ...         {'RECORD_IDENTITY': 'AYQYONQPFK', 'USER_ID': 'NOBODY',
    ...             'ALERT_TYPE': 'PO', 'ALERT_CHANGE': 'LATE',
    ...             'ALERT_ACTION': 'EMAIL', 'RECIPIENT': None,
    ...             'SUBJECT': None, 'MESSAGE': None, 'SENT_ON': None,
    ...             'ARCHIVED': 0}],
    ...     }
    >>> class Source:
    ...     def rows(self, sql, *params):
    ...         return ROWS[sql.split(' from ')[1].split()[0]]
    >>> class Migration:
    ...     js = Source()
    ...     counts = {}
    ...     def get(self, name):
    ...         return Model.get(name)
    ...     def count(self, what, n=1):
    ...         self.counts[what] = self.counts.get(what, 0) + n
    >>> m = Migration()
    >>> js_common.run(m)  # doctest: +ELLIPSIS
    nline.fob_point: 1 made, 1 updated
    nline.ship_via: 1 made, 0 updated
    nline.product_code: 0 made, 0 updated
    nline.commodity_code: 1 made, 0 updated
    nline.reason_code: 0 made, 1 updated
    terms: 2 made, 0 updated
    states/provinces: 1 known to the ERP, 1 not: Houston
    postal codes: 1 made, 1 without a known country
    currency codes: 0 made
    alerts: 0 made, 1 messages

    >>> plant.reload()
    >>> bool(plant.active), plant.description
    (False, 'N-LINE PLANT')
    >>> scrap.reload()
    >>> scrap.reason_type
    'labor'
    >>> net60, = PaymentTerm.find([('name', '=', 'Net 60 Days')])
    >>> net60.net_type, net60.net_days, [d.days
    ...     for d in net60.lines[0].relativedeltas]
    ('age', 60, [60])
    >>> len(PostalCode.find([]))
    2

Run again, nothing is duplicated::

    >>> js_common.run(m)  # doctest: +ELLIPSIS
    nline.fob_point: 0 made, 0 updated
    nline.ship_via: 0 made, 0 updated
    nline.product_code: 0 made, 0 updated
    nline.commodity_code: 0 made, 0 updated
    nline.reason_code: 0 made, 0 updated
    terms: 0 made, 0 updated
    states/provinces: 1 known to the ERP, 1 not: Houston
    postal codes: 0 made, 1 without a known country
    currency codes: 0 made
    alerts: 0 made, 0 messages
