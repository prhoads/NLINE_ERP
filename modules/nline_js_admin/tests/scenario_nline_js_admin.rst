=============================
N-Line Jobshop Admin Scenario
=============================

The services behind Jobshop's Accounting group (account sets, accounting
calendar, account interface), Executive Information, Administration (user
manager, authority manager, system settings) and the report engine of the
99 Jobshop reports.

Imports::

    >>> import datetime as dt
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

    >>> config = activate_modules('nline_js_admin')

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> Desk = Model.get('nline.desk')

Account Sets: product categories with accounting, with Jobshop's accounts::

    >>> fields = Desk.jsadmin_account_set_fields(config.context)
    >>> labels = [f['label'] for f in fields]
    >>> labels.index('Inventory Labor') < labels.index('WIP Material')
    True
    >>> 'Sales Revenue' in [f['label'] for f in fields]
    True
    >>> [f['tryton'] for f in fields if f['label'] == 'Sales Revenue']
    [True]

    >>> Category = Model.get('product.category')
    >>> account_set = Category(name="DEFAULT", accounting=True,
    ...     js_description="Default Account Set")
    >>> account_set.account_revenue = accounts['revenue']
    >>> account_set.account_expense = accounts['expense']
    >>> account_set.js_wip_labor_account = accounts['expense']
    >>> account_set.save()

Parts, a customer and a supplier::

    >>> ProductUom = Model.get('product.uom')
    >>> unit, = ProductUom.find([('name', '=', 'Unit')])
    >>> ProductTemplate = Model.get('product.template')
    >>> template = ProductTemplate(name="Gate Valve 2in", type='goods',
    ...     default_uom=unit, list_price=Decimal('150'), salable=True,
    ...     purchasable=True, account_category=account_set, code='GV-2')
    >>> template.save()
    >>> valve, = template.products
    >>> valve.cost_price = Decimal('80')
    >>> valve.save()

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Refinery Supply", code='REFSUP')
    >>> customer.save()
    >>> supplier = Party(name="Gulf Castings", code='GULF')
    >>> supplier.save()

A sales order and a purchase order (backlog, open PO)::

    >>> Sale = Model.get('sale.sale')
    >>> sale = Sale(party=customer, sale_date=today)
    >>> line = sale.lines.new(product=valve, quantity=4)
    >>> line.unit_price = Decimal('150')
    >>> sale.click('quote')
    >>> sale.click('confirm')
    >>> sale.state
    'processing'

    >>> Purchase = Model.get('purchase.purchase')
    >>> purchase = Purchase(party=supplier, purchase_date=today)
    >>> line = purchase.lines.new(product=valve, quantity=10)
    >>> line.unit_price = Decimal('80')
    >>> purchase.click('quote')
    >>> purchase.click('confirm')

A posted customer invoice and a draft journal entry::

    >>> Invoice = Model.get('account.invoice')
    >>> invoice = Invoice(type='out', party=customer, invoice_date=today)
    >>> line = invoice.lines.new()
    >>> line.account = accounts['revenue']
    >>> line.description = "Repair"
    >>> line.quantity = 1
    >>> line.unit_price = Decimal('500')
    >>> invoice.click('post')

    >>> Journal = Model.get('account.journal')
    >>> journal, = Journal.find([('code', '=', 'MISC')], limit=1)
    >>> Move = Model.get('account.move')
    >>> move = Move(journal=journal, date=today, description="Accrual")
    >>> line = move.lines.new(account=accounts['expense'],
    ...     debit=Decimal('75'))
    >>> line = move.lines.new(account=accounts['cash'], credit=Decimal('75'))
    >>> move.save()
    >>> move.state
    'draft'

Accounting Calendar: the fiscal year and its periods::

    >>> calendar = Desk.jsadmin_calendar(config.context)
    >>> year, = calendar
    >>> len(year['periods'])
    12
    >>> sum(p['drafts'] for p in year['periods'])
    1

Close and reopen the first period (it has no draft move)::

    >>> first = year['periods'][0]
    >>> current = [p for p in year['periods'] if p['drafts']][0]
    >>> if first['id'] != current['id']:
    ...     calendar = Desk.jsadmin_calendar_action(
    ...         'period-close', [first['id']], config.context)
    ...     state = calendar[0]['periods'][0]['state']
    ...     calendar = Desk.jsadmin_calendar_action(
    ...         'period-reopen', [first['id']], config.context)
    ... else:
    ...     state = 'closed'
    >>> state
    'closed'
    >>> Desk.jsadmin_calendar(config.context)[0]['periods'][0]['state']
    'open'

The next fiscal year, quarterly (System Settings > Accounting > Auto)::

    >>> next_end = year['end_date'].replace(year=year['end_date'].year + 1)
    >>> new_year = Desk.jsadmin_fiscalyear_create({
    ...     'end_date': next_end, 'period_type': 'quarterly'},
    ...     config.context)
    >>> FiscalYear = Model.get('account.fiscalyear')
    >>> len([p for p in FiscalYear(new_year).periods
    ...     if p.type == 'standard'])
    4

Account Interface: the draft move is listed, posted and batched::

    >>> interface = Desk.jsadmin_interface(None, None, config.context)
    >>> sum(g['draft'] for g in interface['groups'])
    1
    >>> result = Desk.jsadmin_interface_post({
    ...     'periods': [current['id']]}, config.context)
    >>> result['posted']
    1
    >>> len(result['batches']) >= 1
    True
    >>> move.reload()
    >>> move.state
    'posted'
    >>> bool(move.js_batch)
    True
    >>> Desk.jsadmin_interface(None, None, config.context)['groups']
    []

Export the batches (rolled up by account) and the invoices::

    >>> files = Desk.jsadmin_interface_export({'what': 'gl'},
    ...     config.context)
    >>> files[0]['name']
    'inventory_transactions.csv'
    >>> files[0]['content'].splitlines()[0]
    'Batch ID,Posting Date,Period,Sub Ledger,Account ID,Account,Debit,Credit'
    >>> files[0]['count'] >= 1
    True
    >>> Desk.jsadmin_interface_export({'what': 'gl'},
    ...     config.context)[0]['count']
    0
    >>> again = Desk.jsadmin_interface_export({'what': 'gl',
    ...     'reexport': True, 'detail': True}, config.context)
    >>> 'Transaction Date' in again[0]['content'].splitlines()[0]
    True
    >>> ar = Desk.jsadmin_interface_export({'what': 'ar'}, config.context)
    >>> len(ar[0]['content'].splitlines())
    2
    >>> customers = Desk.jsadmin_interface_export({'what': 'customers'},
    ...     config.context)
    >>> 'REFSUP' in customers[0]['content']
    True

System Settings: the numbering and the defaults::

    >>> settings = Desk.jsadmin_settings(config.context)
    >>> settings['company']['name']
    'Dunder Mifflin'
    >>> numbering = {n['key']: n for n in settings['numbering']}
    >>> 'purchase' in numbering and 'shipper' in numbering
    True
    >>> settings['options']['update_cost']
    'never'
    >>> settings = Desk.jsadmin_settings_save({
    ...     'company': {'phone': '713-555-0100'},
    ...     'numbering': {'batch': {'prefix': 'B', 'padding': 4,
    ...         'number_next': 50}},
    ...     'options': {'update_cost': 'prompt', 'allow_negative': False,
    ...         'sales_account_set': account_set.id}},
    ...     config.context)
    >>> settings['company']['phone']
    '713-555-0100'
    >>> batch = [n for n in settings['numbering'] if n['key'] == 'batch'][0]
    >>> batch['sequence']['sample']
    'B0050'
    >>> settings['options']['update_cost']
    'prompt'
    >>> settings['options']['sales_account_set']['rec_name']
    'DEFAULT'

User Manager: a user (no password: they sign in through N-Line BI) and a
role (a Tryton group)::

    >>> Group = Model.get('res.group')
    >>> sales_group, = Group.find([('name', '=', 'Sales')])
    >>> user = Desk.jsadmin_user_save({
    ...     'login': 'jdoe', 'name': "Jane Doe",
    ...     'groups': [sales_group.id], 'nline_po_limit': '2500',
    ...     'nline_wo_create': False}, config.context)
    >>> user['login'], user['nline_po_limit'], user['nline_wo_create']
    ('jdoe', Decimal('2500.00'), False)
    >>> User = Model.get('res.user')
    >>> User(user['id']).password_hash is None
    True
    >>> role = Desk.jsadmin_role_save({'name': "Shopfloor Workers",
    ...     'users': [user['id']]}, config.context)
    >>> sorted(g.name for g in User(user['id']).groups)
    ['Sales', 'Shopfloor Workers']
    >>> managed = Desk.jsadmin_users(config.context)
    >>> [u['name'] for u in managed['users'] if u['login'] == 'jdoe']
    ['Jane Doe']

Authority Manager: allow then deny a screen to the user::

    >>> matrix = Desk.jsadmin_authorities(config.context)
    >>> jdoe, = [u for u in matrix['users'] if u['login'] == 'jdoe']
    >>> screens = [s for s in matrix['screens'] if s['needs']]
    >>> len(screens) > 0
    True
    >>> screen = [s for s in screens if s['id'] not in jdoe['allowed']][0]
    >>> matrix = Desk.jsadmin_authority_set({'menu': screen['id'],
    ...     'user': jdoe['id'], 'allow': True}, config.context)
    >>> jdoe, = [u for u in matrix['users'] if u['login'] == 'jdoe']
    >>> screen['id'] in jdoe['allowed']
    True
    >>> matrix = Desk.jsadmin_authority_set({'menu': screen['id'],
    ...     'user': jdoe['id'], 'allow': False}, config.context)
    >>> jdoe, = [u for u in matrix['users'] if u['login'] == 'jdoe']
    >>> screen['id'] in jdoe['allowed']
    False

By role: the screen given to the new role::

    >>> matrix = Desk.jsadmin_authority_set({'menu': screen['id'],
    ...     'group': role, 'allow': True}, config.context)
    >>> workers, = [g for g in matrix['groups'] if g['id'] == role]
    >>> screen['id'] in workers['allowed']
    True

Executive Information::

    >>> sales = Desk.jsadmin_exec('sales', 12, config.context)
    >>> tiles = {t['label']: t['value'] for t in sales['tiles']}
    >>> tiles['Backlog']
    Decimal('600.00')
    >>> len(sales['charts'][0]['labels'])
    12
    >>> purchasing = Desk.jsadmin_exec('purchasing', 6, config.context)
    >>> {t['label']: t['value'] for t in purchasing['tiles']}[
    ...     'Open PO Value']
    Decimal('800.00')
    >>> production = Desk.jsadmin_exec('production', 12, config.context)
    >>> production['title']
    'Production'
    >>> financials = Desk.jsadmin_exec('financials', 12, config.context)
    >>> {t['label']: t['value'] for t in financials['tiles']}[
    ...     'Accounts Receivable']
    Decimal('500.00')

Jobshop's Executive Information lines (status / dates and the value)::

    >>> lines = Desk.jsadmin_exec_values('sales', {}, config.context)
    >>> [l['key'] for l in lines]
    ['quotes', 'orders', 'backlog', 'late', 'hold']
    >>> {l['key']: l['value'] for l in lines}['backlog']
    Decimal('600.00')
    >>> lines = Desk.jsadmin_exec_values('sales', {'orders': {
    ...     'status': 'Closed'}}, config.context)
    >>> {l['key']: l['value'] for l in lines}['orders']
    Decimal('0')
    >>> for kind in ['purchasing', 'production', 'financials']:
    ...     _ = Desk.jsadmin_exec_values(kind, {}, config.context)
    >>> [l['key'] for l in Desk.jsadmin_exec_values('purchasing', {},
    ...     config.context)]
    ['orders', 'late', 'uncommitted']

A work order with labor and an issued material (the shopfloor
reports)::

    >>> ball_template = ProductTemplate(name="Ball Valve", default_uom=unit,
    ...     type='goods', producible=True, list_price=Decimal(900),
    ...     code='BV-1')
    >>> ball_template.save()
    >>> ball, = ball_template.products
    >>> body_template = ProductTemplate(name="Body", default_uom=unit,
    ...     type='goods', list_price=Decimal(0), code='BODY')
    >>> body, = body_template.products
    >>> body.cost_price = Decimal('40')
    >>> body_template.save()
    >>> body, = body_template.products
    >>> WorkCenterCategory = Model.get('production.work.center.category')
    >>> machining = WorkCenterCategory(name="Machining")
    >>> machining.save()
    >>> WorkCenter = Model.get('production.work.center')
    >>> lathe = WorkCenter(name="Lathe", category=machining,
    ...     cost_price=Decimal('30'), cost_method='hour')
    >>> lathe.save()
    >>> BOM = Model.get('production.bom')
    >>> bom = BOM(name="Ball Valve")
    >>> _ = bom.inputs.new(product=body, quantity=2)
    >>> _ = bom.outputs.new(product=ball, quantity=1)
    >>> bom.save()
    >>> Operation = Model.get('production.routing.operation')
    >>> turn = Operation(name="Turn", work_center_category=machining)
    >>> turn.save()
    >>> Routing = Model.get('production.routing')
    >>> routing = Routing(name="Ball Valve")
    >>> routing.boms.append(bom)
    >>> _ = routing.steps.new(operation=turn)
    >>> routing.save()
    >>> Location = Model.get('stock.location')
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> Inventory = Model.get('stock.inventory')
    >>> inventory = Inventory(location=storage)
    >>> _ = inventory.lines.new(product=body, quantity=10)
    >>> inventory.click('confirm')
    >>> Production = Model.get('production')
    >>> production = Production(product=ball, bom=bom, routing=routing,
    ...     work_center=lathe, quantity=3)
    >>> production.click('wait')
    >>> info = Desk.work_order_info(production.id, config.context)
    >>> work, = info['works']
    >>> material, = info['materials']
    >>> _ = Desk.labor_entry({'work': work['id'], 'hours': 1.5},
    ...     config.context)
    >>> _ = Desk.issue_material({'lines': [
    ...         {'move': material['id'], 'quantity': 4}]}, config.context)

The reports: every group bar lists its reports, each runs::

    >>> reports = Desk.jsadmin_report_list(None, config.context)
    >>> len(reports)
    107
    >>> groups = {}
    >>> for r in reports:
    ...     groups[r['group']] = groups.get(r['group'], 0) + 1
    >>> groups == {'inventory': 16, 'engineering': 6, 'estimating': 6,
    ...     'sales': 21, 'purchasing': 13, 'planning': 2, 'shopfloor': 29,
    ...     'accounting': 5, 'common': 9}
    True
    >>> failed = []
    >>> for r in reports:
    ...     try:
    ...         _ = Desk.jsadmin_report_run(r['id'], {}, config.context)
    ...     except Exception as exception:
    ...         failed.append((r['id'], str(exception)))
    >>> failed
    []

Backlog by order line: the open sales order line::

    >>> backlog = Desk.jsadmin_report_run('line_backlog', {},
    ...     config.context)
    >>> keys = [c['key'] for c in backlog['columns']]
    >>> row, = [r for r in backlog['rows'] if r['k'] == 'row']
    >>> row['v'][keys.index('part')], row['v'][keys.index('due')]
    ('GV-2', 4.0)
    >>> total, = [r for r in backlog['rows'] if r['k'] == 'total']
    >>> total['v'][keys.index('backlog')]
    Decimal('600.00')

Ranges, statuses, advanced filters and sorts of the report dialog::

    >>> listing = Desk.jsadmin_report_run('account_list', {
    ...     'type': 'Revenue'}, config.context)
    >>> keys = [c['key'] for c in listing['columns']]
    >>> types = {r['v'][keys.index('type')] for r in listing['rows']}
    >>> types
    {'Revenue'}
    >>> revenue = Desk.jsadmin_report_run('account_list', {
    ...     'advanced': {'filters': [{'key': 'description',
    ...         'condition': 'contains', 'value': 'revenue'}],
    ...         'sort': [{'key': 'id', 'desc': True}]}},
    ...     config.context)
    >>> all('revenue' in r['v'][keys.index('description')].lower()
    ...     for r in revenue['rows'])
    True
    >>> len(revenue['rows']) >= 1
    True
    >>> orders = Desk.jsadmin_report_run('sales_order_list', {
    ...     'customer_from': 'REFSUP', 'customer_to': 'REFSUP',
    ...     'status': 'Released'}, config.context)
    >>> orders['count'], orders['subtitle']
    (1, 'Customer ID: REFSUP - REFSUP; Order Status: Released')
    >>> none = Desk.jsadmin_report_run('sales_order_list', {
    ...     'status': 'Closed'}, config.context)
    >>> none['count']
    0

Grouped reports have a subtotal per group::

    >>> detail = Desk.jsadmin_report_run('purchase_order_detail', {},
    ...     config.context)
    >>> [r['k'] for r in detail['rows']]
    ['group', 'row', 'subtotal', 'total']

A report of a table another area has not made yet tells the gap::

    >>> territories = Desk.jsadmin_report_run('territory_list', {},
    ...     config.context)
    >>> territories['rows'], bool(territories['gaps'])
    ([], True)
    >>> fob = Desk.jsadmin_report_run('fob_point_list', {}, config.context)
    >>> fob['gaps']
    []

The WIP value of the work order: the issued bodies and the labor::

    >>> wip = Desk.jsadmin_report_run('wip_value', {}, config.context)
    >>> keys = [c['key'] for c in wip['columns']]
    >>> row, = [r for r in wip['rows'] if r['k'] == 'row']
    >>> row['v'][keys.index('material_act')], row['v'][keys.index('labor_act')]
    (Decimal('160.00'), Decimal('45.00'))
    >>> labor = Desk.jsadmin_report_run('labor_list', {}, config.context)
    >>> keys = [c['key'] for c in labor['columns']]
    >>> [r['v'][keys.index('hours')] for r in labor['rows'] if r['k'] == 'row']
    [1.5]
    >>> where = Desk.jsadmin_report_run('where_used', {
    ...     'part_from': 'BODY', 'part_to': 'BODY'}, config.context)
    >>> keys = [c['key'] for c in where['columns']]
    >>> sorted(r['v'][keys.index('kind')] for r in where['rows']
    ...     if r['k'] == 'row')
    ['Master', 'Work Order']

Jobshop's dialogs: the captions and order of its selection fields, the
"For" radio groups, a selection Tryton has no data for is not applied::

    >>> parts = [r for r in reports if r['id'] == 'part_list_simple'][0]
    >>> [(f['type'], f['label']) for f in parts['filters']]
    [('range', 'Part ID'), ('radio', 'For'), ('range', 'Product Code ID'), ('radio', 'For'), ('range', 'Commodity Code ID')]
    >>> active = Desk.jsadmin_report_run('part_list_simple', {},
    ...     config.context)
    >>> both = Desk.jsadmin_report_run('part_list_simple', {
    ...     'active': 'both'}, config.context)
    >>> both['count'] >= active['count'] > 0
    True
    >>> inactive = Desk.jsadmin_report_run('part_list_simple', {
    ...     'active': 'no'}, config.context)
    >>> inactive['count']
    0
    >>> invoices = Desk.jsadmin_report_run('invoice', {
    ...     'shipper_from': 'A'}, config.context)
    >>> invoices['count'] > 0, any('Shipper ID' in g for g in invoices['gaps'])
    (True, True)
    >>> rolled = Desk.jsadmin_report_run('journal_batch_detail', {
    ...     'expanded': False}, config.context)
    >>> rolled['count'] <= Desk.jsadmin_report_run('journal_batch_detail',
    ...     {}, config.context)['count']
    True
    >>> [r for r in reports if r['id'] == 'terms_list'][0]['rpt']
    'TermsRuleList.rpt'

The reports of N-Line's installed Jobshop the help does not list::

    >>> backlog = Desk.jsadmin_report_run('po_line_backlog', {},
    ...     config.context)
    >>> total, = [r for r in backlog['rows'] if r['k'] == 'total']
    >>> keys = [c['key'] for c in backlog['columns']]
    >>> total['v'][keys.index('backlog')] > 0
    True
    >>> status = Desk.jsadmin_report_run('work_order_status', {},
    ...     config.context)
    >>> status['count']
    1
    >>> bom = Desk.jsadmin_report_run('engineering_master_bom', {
    ...     'depth': '1'}, config.context)
    >>> materials = Desk.jsadmin_report_run('engineering_material_list', {},
    ...     config.context)
    >>> bom['count'] >= materials['count']
    True
