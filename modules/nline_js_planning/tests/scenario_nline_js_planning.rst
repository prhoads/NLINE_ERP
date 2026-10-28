=========================
Jobshop Planning Scenario
=========================

Material Planning (Open Sales Orders, Non-Stocked Parts, Outside Services,
Stocked Parts, Supply & Demand) and Scheduling (the scheduler on the
calendars, Resource and Work Order Details, the chart, the MS Project
export) of the Jobshop emulation.

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
    >>> monday = today + dt.timedelta(days=7 - today.weekday())

Activate modules::

    >>> config = activate_modules(['nline_js_planning'])
    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)

    >>> Desk = Model.get('nline.desk')
    >>> access = Desk.js_planning_access(config.context)
    >>> access['work_order'], access['purchase'], access['schedule']
    (True, True, True)

Parts: the valve (fabricated, sold), its body (bought, not stocked), its bar
stock (bought, stocked: an order point) and a heat treat service::

    >>> ProductCategory = Model.get('product.category')
    >>> category = ProductCategory(name="Parts")
    >>> category.accounting = True
    >>> category.account_expense = accounts['expense']
    >>> category.account_revenue = accounts['revenue']
    >>> category.save()
    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> Party = Model.get('party.party')
    >>> foundry = Party(name="Houston Foundry")
    >>> foundry.save()
    >>> heat_treater = Party(name="Heat Treater")
    >>> heat_treater.save()
    >>> customer = Party(name="Refinery")
    >>> _ = customer.addresses.new(street="1 Main")
    >>> customer.save()

    >>> def part(name, **values):
    ...     template = Template(name=name, default_uom=unit, type='goods',
    ...         list_price=Decimal(100), account_category=category,
    ...         **values)
    ...     template.save()
    ...     product, = template.products
    ...     product.suffix_code = name.upper()
    ...     product.save()
    ...     return product
    >>> valve = part("Valve", producible=True, salable=True)
    >>> body = part("Body", purchasable=True)
    >>> bar = part("Bar", purchasable=True)
    >>> ProductSupplier = Model.get('purchase.product_supplier')
    >>> _ = ProductSupplier(template=body.template, party=foundry,
    ...     code='F-BODY').save()

    >>> service_template = Template(name="Heat Treat", default_uom=unit,
    ...     type='service', purchasable=True, list_price=Decimal(0),
    ...     account_category=category)
    >>> service_supplier = service_template.product_suppliers.new()
    >>> service_supplier.party = heat_treater
    >>> service_supplier.lead_time = dt.timedelta(days=1)
    >>> service_template.save()
    >>> heat_treat, = service_template.products

    >>> OrderPoint = Model.get('stock.order_point')
    >>> Location = Model.get('stock.location')
    >>> warehouse, = Location.find([('type', '=', 'warehouse')])
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> _ = OrderPoint(product=bar, type='purchase',
    ...     warehouse_location=warehouse, min_quantity=10,
    ...     target_quantity=20).save()

The valve's master: a lathe operation, the heat treat outside, a finish
operation::

    >>> BOM = Model.get('production.bom')
    >>> bom = BOM(name="Valve")
    >>> _ = bom.inputs.new(product=body, quantity=2)
    >>> _ = bom.inputs.new(product=bar, quantity=1)
    >>> _ = bom.outputs.new(product=valve, quantity=1)
    >>> bom.save()
    >>> WorkCenter = Model.get('production.work.center')
    >>> lathe = WorkCenter(name="Lathe", schedule_method='finite')
    >>> lathe.save()
    >>> Operation = Model.get('production.routing.operation')
    >>> turn = Operation(name="Turn")
    >>> turn.save()
    >>> heat = Operation(name="Heat Treat")
    >>> heat.save()
    >>> finish = Operation(name="Finish")
    >>> finish.save()
    >>> Routing = Model.get('production.routing')
    >>> routing = Routing(name="Valve")
    >>> routing.boms.append(bom)
    >>> _ = routing.steps.new(operation=turn, sequence=10,
    ...     setup_duration=dt.timedelta(hours=1),
    ...     run_duration=dt.timedelta(minutes=30))
    >>> step = routing.steps.new(operation=heat, sequence=20)
    >>> step.supplier = heat_treater
    >>> step.service = heat_treat
    >>> _ = routing.steps.new(operation=finish, sequence=30,
    ...     run_duration=dt.timedelta(hours=1))
    >>> routing.save()
    >>> ProductBom = Model.get('product.product-production.bom')
    >>> valve.boms.append(ProductBom(bom=bom, routing=routing))
    >>> valve.save()

Open Sales Orders
-----------------

A released sales order of 3 valves: the line is not linked::

    >>> Sale = Model.get('sale.sale')
    >>> sale = Sale(party=customer)
    >>> line = sale.lines.new(product=valve, quantity=3)
    >>> line.unit_price = Decimal(900)
    >>> sale.click('quote')
    >>> row, = Desk.js_planning_sales('exclude', config.context)
    >>> row['order_status'], row['qty_due'], row['wo_link'], row['message']
    ('Firm', 3.0, 'No Link', 'Short, Not linked to a work order')
    >>> row['status_changes']
    ['Unreleased', 'Released', 'Hold', 'Cancelled']

Change the status of the sales order to Hold, then to Released::

    >>> Desk.js_planning_sale_status(sale.id, 'Hold', config.context)
    {'state': 'quotation', 'status': 'Hold', 'status_changes': ['Firm', 'Unreleased', 'Released', 'Cancelled']}
    >>> Desk.js_planning_sale_status(sale.id, 'Released',
    ...     config.context)['status']
    'Released'
    >>> row, = Desk.js_planning_sales('exclude', config.context)
    >>> row['order_status'], row['status_changes']
    ('Released', ['Hold', 'Closed'])

Link the line to a new Released work order: fully linked lines are left
out unless viewing all::

    >>> wo = Desk.js_planning_link({'lines': [row['line']],
    ...     'status': 'Released'}, config.context)
    >>> Desk.js_planning_sales('exclude', config.context)
    []
    >>> row, = Desk.js_planning_sales('all', config.context)
    >>> row['linked_qty'], row['wo_link'] == wo['number']
    (3.0, True)
    >>> Production = Model.get('production')
    >>> production = Production(wo['id'])
    >>> production.state, production.origin == sale.lines[0]
    ('waiting', True)

The work order's heat treat was bought when released::

    >>> Desk.js_planning_outside('exclude', config.context)
    []
    >>> service, = Desk.js_planning_outside('all', config.context)
    >>> (service['supplier_id'] == heat_treater.code, service['transit_days'],
    ...     bool(service['po_link']))
    (True, 1, True)

Break the link and link the line to the existing work order::

    >>> Desk.js_planning_unlink({'lines': [row['line']]}, config.context)
    True
    >>> [t['number'] for t in Desk.js_planning_link_targets(valve.id,
    ...     config.context)] == [wo['number']]
    True
    >>> _ = Desk.js_planning_link({'lines': [row['line']],
    ...     'production': wo['id']}, config.context)
    >>> Desk.js_planning_sales('exclude', config.context)
    []

Create an unlinked work order (Create New Work Order dialog)::

    >>> defaults = Desk.js_planning_new_work_order(valve.id,
    ...     today + dt.timedelta(days=30), 2, config.context)
    >>> defaults['description'], defaults['status'], len(defaults['masters'])
    ('Valve', 'Firm', 1)
    >>> firm = Desk.js_planning_create_work_order({'product': valve.id,
    ...     'quantity': 2, 'work_id': '9001', 'lot_id': '2',
    ...     'product_bom': defaults['product_bom'],
    ...     'release_date': defaults['release_date'],
    ...     'want_date': defaults['want_date'], 'status': 'Firm'},
    ...     config.context)
    >>> firm['number'], Production(firm['id']).state
    ('9001/2', 'draft')

Non-Stocked Parts
-----------------

The bodies of both work orders: buy them from the foundry, one line linked
to both cards::

    >>> rows = Desk.js_planning_non_stocked('exclude', config.context)
    >>> sorted((r['work_id'], r['part_id'], r['net_qty']) for r in rows)
    [('9001', 'BODY', 4.0), ('WO-1-01', 'BODY', 6.0)]
    >>> rows[0]['supplier_id'] == foundry.code, rows[0]['supplier_part_id']
    (True, 'F-BODY')
    >>> po = Desk.js_planning_purchase({'kind': 'material',
    ...     'rows': [r['card'] for r in rows], 'supplier': foundry.id},
    ...     config.context)
    >>> Purchase = Model.get('purchase.purchase')
    >>> purchase = Purchase(po['purchase'])
    >>> [(l.product.code, l.quantity) for l in purchase.lines]
    [('BODY', 10.0)]
    >>> Desk.js_planning_non_stocked('exclude', config.context)
    []
    >>> [r['linked_po_qty'] for r in sorted(Desk.js_planning_non_stocked(
    ...     'all', config.context), key=lambda r: r['net_qty'])]
    [4.0, 6.0]

Stocked Parts
-------------

The bar: 3 needed by the released order, 2 by the firm one, none on hand::

    >>> bar_row, = Desk.js_planning_stocked({}, config.context)
    >>> (bar_row['part_id'], bar_row['net_demand'], bar_row['projected'],
    ...     bar_row['order_point'], bar_row['color'], bar_row['suggested'])
    ('BAR', 5.0, -5.0, 10.0, 'red', 25.0)
    >>> po = Desk.js_planning_purchase({'kind': 'stocked',
    ...     'rows': [bar.id], 'supplier': foundry.id,
    ...     'quantities': {str(bar.id): 25}}, config.context)
    >>> Purchase(po['purchase']).lines[0].quantity
    25.0
    >>> Desk.js_planning_stocked({}, config.context)
    []
    >>> [r['projected'] for r in Desk.js_planning_stocked(
    ...     {'short_only': False}, config.context)]
    [20.0]

Supply & Demand of the body::

    >>> sd = Desk.js_supply_demand(body.id, config.context)
    >>> [w['demand'] for w in sd['work_orders']]
    [6.0, 10.0]
    >>> [(p['supply_qty'], p['links']) for p in sd['purchases']]
    [(10.0, 10.0)]

Scheduling
----------

Without weekly calendar (Shopfloor) the shop works Monday to Friday, one 8
hour shift at 7:00. Schedule as of next Monday 7:00, finite (the lathe is a
finite resource)::

    >>> Week = Model.get('nline.js.calendar.week')
    >>> len(Week.find([]))
    0
    >>> as_of = dt.datetime.combine(monday, dt.time(7, 0))
    >>> result = Desk.js_schedule_all({'as_of': as_of, 'infinite': False},
    ...     config.context)
    >>> result['orders'], result['operations']
    (2, 6)

The released order is wanted first: it gets the lathe first, the firm one
waits for it; the heat treats take a day::

    >>> def times(rows):
    ...     return [(r['work_id'], r['seq_no'], r['start'][-5:],
    ...         r['finish'][-5:]) for r in rows]
    >>> lathe_ops = Desk.js_schedule_resource_details(lathe.id,
    ...     config.context)
    >>> times(lathe_ops) == [
    ...     (wo['number'], 10, '07:00', '09:30'),
    ...     ('9001', 10, '09:30', '11:30'),
    ...     (wo['number'], 30, '09:30', '12:30'),
    ...     ('9001', 30, '12:30', '14:30')]
    True
    >>> details = Desk.js_schedule_work_order_details(firm['id'],
    ...     config.context)
    >>> [(o['seq_no'], o['determinant'], o['outside']) for o in
    ...     details['operations']]
    [(10, True, False), (20, True, True), (30, True, False)]
    >>> details['late']
    False

The could start date of the firm order's finish is earlier than its
scheduled start (the lathe is busy)::

    >>> details['operations'][2]['could_early']
    True

A calendar exception: the lathe does not work on Monday; schedule the firm
order alone, its first operation moves to Tuesday::

    >>> Change = Model.get('nline.js.calendar.change')
    >>> _ = Change(resource=lathe, start_date=monday, end_date=monday,
    ...     start_of_day=dt.time(7, 0), shift_1=0).save()
    >>> details = Desk.js_schedule_work_order(firm['id'], config.context)
    >>> details['operations'][0]['start'] == '%sT07:00' % (
    ...     monday + dt.timedelta(days=1))
    True

Freeze an operation: it stays when the schedule runs again::

    >>> first = details['operations'][0]
    >>> Desk.js_schedule_freeze([first['id']], True, config.context)
    True
    >>> _ = Desk.js_schedule_all({'as_of': as_of, 'infinite': True},
    ...     config.context)
    >>> details = Desk.js_schedule_work_order_details(firm['id'],
    ...     config.context)
    >>> details['operations'][0]['start'] == first['start']
    True
    >>> details['operations'][0]['frozen']
    True

The chart by resource and by work order::

    >>> chart = Desk.js_schedule_chart('resource', lathe.id, monday,
    ...     monday + dt.timedelta(days=7), config.context)
    >>> row, = chart['rows']
    >>> row['label'], len(row['bars']), len(row['capacity'])
    ('Lathe', 4, 5)
    >>> chart = Desk.js_schedule_chart('work_order', None, monday,
    ...     monday + dt.timedelta(days=7), config.context)
    >>> len(chart['rows'])
    2

Export to MS Project::

    >>> export = Desk.js_schedule_export('xml', config.context)
    >>> export['filename'].endswith('.xml'), '<Project' in export['content']
    (True, True)
    >>> export['content'].count('<Task>')
    8
    >>> export = Desk.js_schedule_export('csv', config.context)
    >>> len(export['content'].strip().splitlines())
    9

Settings: the load horizon::

    >>> Desk.js_schedule_settings({'load_horizon': 60},
    ...     config.context)['load_horizon']
    60

The Jobshop data import (migration/jobshop/planning.py) on rows like
Jobshop's: the STANDARD schedule's settings::

    >>> import importlib.util, os
    >>> path = os.path.join(os.environ.get('NLINE_MIGRATION',
    ...     r'M:\NLINE_ERP\migration'), 'jobshop', 'planning.py')
    >>> spec = importlib.util.spec_from_file_location('js_planning', path)
    >>> js_planning = importlib.util.module_from_spec(spec)
    >>> spec.loader.exec_module(js_planning)
    >>> ROWS = {
    ...     'SHOPFLOOR_SCHEDULE': [{'ID': 'STANDARD',
    ...         'DESCRIPTION': 'Standard Schedule', 'INFINITE_CAPACITY': 0,
    ...         'HORIZON': 730, 'HARD_RELEASE_DATES': 0, 'SORT_BY': 1,
    ...         'SCHED_STARTED_WO': 2, 'ACTIVE': -1}],
    ...     'SHOPFLOOR_CALENDAR_WEEK': [{'N': 0}],
    ...     }
    >>> class Source:
    ...     def rows(self, sql, *params):
    ...         return ROWS[sql.split(' from ')[1].split()[0]]
    >>> class Migration:
    ...     js = Source()
    ...     def get(self, name):
    ...         return Model.get(name)
    >>> js_planning.run(Migration())
    planning: 1 schedules
    >>> js_planning.run(Migration())
    planning: 1 schedules
    >>> Schedule = Model.get('nline.js.schedule')
    >>> standard, = Schedule.find([])
    >>> bool(standard.infinite), standard.sort_by, standard.started
    (False, 'priority', 'first_freeze')
