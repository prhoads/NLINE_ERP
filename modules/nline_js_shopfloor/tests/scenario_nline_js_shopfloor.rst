===========================
Jobshop Shopfloor Scenario
===========================

The services of the Jobshop Shopfloor windows: shop resources, shop groups
and views, employees, material issues and returns, labor entry with
Jobshop's costing and its reversal, the labor data collection terminal and
work order receipts and returns.

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company

Activate modules::

    >>> config = activate_modules(['nline_js_shopfloor'])
    >>> _ = create_company()
    >>> company = get_company()
    >>> Desk = Model.get('nline.desk')

Shop resources with their Jobshop costs::

    >>> WorkCenterCategory = Model.get('production.work.center.category')
    >>> machining = WorkCenterCategory(name="Machining")
    >>> machining.save()
    >>> WorkCenter = Model.get('production.work.center')
    >>> lathe = WorkCenter(name="LATHE", description="Big lathe",
    ...     category=machining, cost_price=Decimal('30'), cost_method='hour')
    >>> lathe.resource_type
    'machine'
    >>> lathe.run_per_hr = Decimal('20')
    >>> lathe.bur_per_hr_run = Decimal('10')
    >>> lathe.bur_per_oper = Decimal('5')
    >>> _ = lathe.calendar_weeks.new(day_of_week='2', shift_1=8.0)
    >>> lathe.save()
    >>> drill = WorkCenter(name="DRILL", description="Drill press",
    ...     resource_type='machine')
    >>> drill.save()

A new resource gets a category of its name, as the migrated ones::

    >>> Desk.sf_resource_setup(drill.id, config.context)
    True
    >>> drill.reload()
    >>> drill.category.name
    'DRILL'

A shop group is a resource of type Group with members numbered by 10::

    >>> cell = WorkCenter(name="CELL", resource_type='group',
    ...     exclusivity='exclusive')
    >>> _ = cell.members.new(resource=lathe)
    >>> _ = cell.members.new(resource=drill)
    >>> cell.save()
    >>> [(m.sequence, m.resource.name, m.description) for m in cell.members]
    [(10, 'LATHE', 'Big lathe'), (20, 'DRILL', 'Drill press')]
    >>> other = WorkCenter(name="CELL2", resource_type='group')
    >>> _ = other.members.new(resource=cell)
    >>> other.save()  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    trytond.model.exceptions.DomainValidationError: ...

A shop view::

    >>> ShopView = Model.get('nline.js.shop_view')
    >>> view = ShopView(code="MACH", description="Machines")
    >>> _ = view.resource_lines.new(resource=lathe)
    >>> _ = view.resource_lines.new(resource=drill)
    >>> view.save()
    >>> [l.sequence for l in view.resource_lines]
    [10, 20]
    >>> _ = view.resource_lines.new(resource=lathe)
    >>> view.save()  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    trytond.model.exceptions.ValidationError: ...
    >>> view.reload()

Employees, as Jobshop's table::

    >>> _ = Desk.sf_employees_save({'rows': [{
    ...         'name': "Greg Kirsch", 'clock_no': 'KIRSCHG', 'shift_no': 1,
    ...         'cost_per_hr': 25, 'run_cost_per_hr': 30}]}, config.context)
    >>> greg, = Desk.sf_employees(True, config.context)
    >>> greg['clock_no'], greg['name'], float(greg['run_cost_per_hr'])
    ('KIRSCHG', 'Greg Kirsch', 30.0)
    >>> Desk.sf_dc_employee('kirschg', config.context)['id'] == greg['id']
    True

The valve, its master and routing, and stock of bodies::

    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> valve_template = Template(name="Valve", default_uom=unit,
    ...     type='goods', producible=True, list_price=Decimal(900))
    >>> valve_template.save()
    >>> valve, = valve_template.products
    >>> body_template = Template(name="Body", default_uom=unit,
    ...     type='goods', list_price=Decimal(0))
    >>> body, = body_template.products
    >>> body.cost_price = Decimal('40')
    >>> body_template.save()
    >>> body, = body_template.products
    >>> bolt_template = Template(name="Bolt", default_uom=unit,
    ...     type='goods', list_price=Decimal(0))
    >>> bolt, = bolt_template.products
    >>> bolt.cost_price = Decimal('1')
    >>> bolt_template.save()
    >>> bolt, = bolt_template.products

    >>> BOM = Model.get('production.bom')
    >>> bom = BOM(name="Valve")
    >>> _ = bom.inputs.new(product=body, quantity=2)
    >>> _ = bom.outputs.new(product=valve, quantity=1)
    >>> bom.save()
    >>> Operation = Model.get('production.routing.operation')
    >>> turn = Operation(name="Turn", work_center_category=machining)
    >>> turn.save()
    >>> Routing = Model.get('production.routing')
    >>> routing = Routing(name="Valve")
    >>> routing.boms.append(bom)
    >>> _ = routing.steps.new(operation=turn, sequence=10)
    >>> routing.save()

    >>> Location = Model.get('stock.location')
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> Inventory = Model.get('stock.inventory')
    >>> inventory = Inventory(location=storage)
    >>> _ = inventory.lines.new(product=body, quantity=10)
    >>> _ = inventory.lines.new(product=bolt, quantity=10)
    >>> inventory.click('confirm')

Release a work order of 3 valves::

    >>> Production = Model.get('production')
    >>> production = Production(product=valve, bom=bom, routing=routing,
    ...     work_center=lathe, quantity=3)
    >>> production.click('wait')
    >>> work, = production.works

Material Issues: the bodies due; issue 4 of the 6::

    >>> lines = Desk.sf_material_lines(production.id, {}, config.context)
    >>> row, = lines['rows']
    >>> row['due'], row['issued'], row['location_qty'], row['available']
    (6.0, 0.0, 10.0, True)
    >>> result = Desk.sf_material_save({'production': production.id,
    ...     'lines': [{'product': body.id, 'moves': row['moves'],
    ...         'quantity': 4, 'location': row['location']}]},
    ...     config.context)
    >>> row, = Desk.sf_material_lines(production.id, {},
    ...     config.context)['rows']
    >>> row['due'], row['issued']
    (2.0, 4.0)

Return one body to stock (a negative issue), issue bolts not on the work
order, and close the bodies short::

    >>> result = Desk.sf_material_save({'production': production.id,
    ...     'lines': [
    ...         {'product': body.id, 'moves': row['moves'], 'quantity': -1,
    ...             'close_now': True},
    ...         {'product': bolt.id, 'quantity': 2}]}, config.context)
    >>> result['issued'], result['returned'], result['closed']
    (1, 1, 1)
    >>> rows = Desk.sf_material_lines(production.id, {'show_all': True},
    ...     config.context)['rows']
    >>> sorted((r['description'], r['due'], r['issued'], r['status'])
    ...     for r in rows)
    [('Body', 0.0, 3.0, 'Closed'), ('Bolt', 0.0, 2.0, 'Closed')]
    >>> Desk.sf_material_lines(production.id, {}, config.context)['rows']
    []
    >>> production.reload()
    >>> [(m.quantity, float(m.unit_price)) for m in production.outputs
    ...     if m.material_return]
    [(1.0, 40.0)]

Labor Entry: two hours of run by Greg, one piece completed; Jobshop costs
the employee's run rate and the resource's burden with the fixed burden of
the first ticket::

    >>> operations = Desk.sf_work_order_operations(production.id,
    ...     config.context)
    >>> operations['works'][0]['seq'], operations['works'][0]['operation_qty']
    (10, 3.0)
    >>> ticket = Desk.sf_labor_post({'employee': greg['id'], 'type': 'run',
    ...     'work': work.id, 'clock_in': '2026-10-26 08:00',
    ...     'clock_out': '2026-10-26 10:00', 'completed_qty': 1},
    ...     config.context)
    >>> ticket['hours'], float(ticket['labor_cost']), float(
    ...     ticket['burden_cost'])
    (2.0, 60.0, 25.0)

An hour of overtime: the labor is one and a half times, no fixed burden::

    >>> overtime = Desk.sf_labor_post({'employee': greg['id'],
    ...     'type': 'run', 'shift_type': 'overtime', 'work': work.id,
    ...     'hours': 1}, config.context)
    >>> float(overtime['labor_cost']), float(overtime['burden_cost'])
    (45.0, 10.0)

The earlier labor entry of hours still posts (at the resource's rates)::

    >>> entry = Desk.labor_entry({'work': work.id, 'hours': 1.5},
    ...     config.context)
    >>> float(entry['cost']), entry['hours']
    (45.0, 1.5)

Indirect labor has no work order::

    >>> indirect = Desk.sf_labor_post({'employee': greg['id'],
    ...     'type': 'indirect', 'hours': 1}, config.context)
    >>> float(indirect['labor_cost']), indirect['number']
    (25.0, '')

Pay Rate: indirect labor costed at the employee's run rate::

    >>> paid = Desk.sf_labor_post({'employee': greg['id'],
    ...     'type': 'indirect', 'hours': 1, 'pay_rate': 'run'},
    ...     config.context)
    >>> paid['pay_rate'], float(paid['labor_cost'])
    ('run', 30.0)

A deviated quantity needs a reason code::

    >>> Desk.sf_labor_post({'employee': greg['id'], 'type': 'run',
    ...     'work': work.id, 'hours': 1, 'deviated_qty': 1},
    ...     config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    trytond.model.exceptions.ValidationError: ...

Labor Reversal of the first ticket::

    >>> tickets = Desk.sf_labor_tickets({'kind': 'employee',
    ...     'employee': greg['id']}, config.context)
    >>> len(tickets)
    4
    >>> reversal, = Desk.sf_labor_reverse([ticket['id']], config.context)
    >>> reversal['reversing'], reversal['hours'], float(
    ...     reversal['labor_cost'])
    (True, -2.0, -60.0)
    >>> work.reload()
    >>> work.completed_quantity, work.run_hours
    (0.0, 2.5)

Labor Data Collection: Greg clocks in, scans the operation of the traveler
and starts; he suspends it after a piece, resumes, deletes the resumed line
and saves::

    >>> clock = Desk.sf_clock({'employee': greg['id'], 'action': 'in',
    ...     'at': '2026-10-27 07:00'}, config.context)
    >>> Desk.sf_dc_employee('KIRSCHG', config.context)['clocked_in']
    '2026-10-27 07:00'
    >>> found = Desk.sf_operation_lookup(
    ...     '*%s/%s*' % (production.number, work.sequence), config.context)
    >>> found['work'] == work.id
    True
    >>> started = Desk.sf_dc_start({'employee': greg['id'],
    ...     'work': found['work'], 'type': 'run',
    ...     'clock_in': '2026-10-27 08:00'}, config.context)
    >>> started['state']
    'active'
    >>> work.reload()
    >>> work.state
    'running'
    >>> posted, suspended = Desk.sf_dc_post({
    ...     'tickets': [{'id': started['id'], 'completed_qty': 1}],
    ...     'clock_out': '2026-10-27 10:30', 'suspend': True},
    ...     config.context)
    >>> posted['state'], posted['hours'], suspended['state']
    ('posted', 2.5, 'suspended')
    >>> resumed, = Desk.sf_dc_resume({'ids': [suspended['id']],
    ...     'clock_in': '2026-10-27 11:00'}, config.context)
    >>> resumed['state']
    'active'
    >>> [t['state'] for t in Desk.sf_dc_tickets({'kind': 'employee',
    ...     'employee': greg['id']}, config.context)]
    ['posted', 'active']
    >>> Desk.sf_dc_delete([resumed['id']], config.context)
    1
    >>> saved, = Desk.sf_dc_save([posted['id']], config.context)
    >>> saved['state'], float(saved['labor_cost']), float(
    ...     saved['burden_cost'])
    ('saved', 75.0, 30.0)
    >>> Desk.sf_dc_tickets({'kind': 'all'}, config.context)
    []
    >>> _ = Desk.sf_clock({'employee': greg['id'], 'action': 'out',
    ...     'at': '2026-10-27 15:30'}, config.context)
    >>> EmployeeTime = Model.get('nline.js.employee_time')
    >>> time, = EmployeeTime.find([])
    >>> time.hours_worked
    8.5

An employee with labor cannot be deleted::

    >>> Desk.sf_employees_save({'delete': [greg['id']]},
    ...     config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    trytond.model.exceptions.AccessError: ...

Where the lathe is used, and Reset Operation Info::

    >>> used = Desk.sf_resource_where_used(lathe.id, {}, config.context)
    >>> sorted({r['type'] for r in used['rows']})
    ['Engineering Master', 'Work Order']
    >>> drill.run_per_hr = Decimal('12')
    >>> drill.save()
    >>> reset = Desk.sf_reset_operation_costs({}, config.context)
    >>> reset['resources']
    1
    >>> drill.reload()
    >>> float(drill.cost_price), drill.cost_method
    (12.0, 'hour')

Work Order Receipts: receive one valve, return it to the shop floor, then
receive the three::

    >>> row, = Desk.sf_receipt_lines({}, config.context)
    >>> row['quantity'], row['received']
    (3.0, 0)
    >>> result, = Desk.sf_receipt_save({'lines': [{
    ...     'production': production.id, 'quantity': 1}]}, config.context)
    >>> result['state'], result['received']
    ('running', 1.0)
    >>> row, = Desk.sf_receipt_lines({'mode': 'received'}, config.context)
    >>> row['quantity'], row['can_return']
    (1.0, True)
    >>> result, = Desk.sf_receipt_save({'lines': [{
    ...     'production': production.id, 'quantity': 1, 'return': True}]},
    ...     config.context)
    >>> row, = Desk.sf_receipt_lines({}, config.context)
    >>> row['quantity'], row['received']
    (3.0, 0.0)
    >>> result, = Desk.sf_receipt_save({'lines': [{
    ...     'production': production.id, 'quantity': 3}]}, config.context)
    >>> result['state'], result['received']
    ('done', 3.0)

The valves received carry the whole cost of the work order::

    >>> production.reload()
    >>> main = [m for m in production.outputs if m.product == valve
    ...     and m.state == 'done']
    >>> received = sum(Decimal(str(m.quantity)) * m.unit_price for m in main)
    >>> others = sum(Decimal(str(m.quantity)) * m.unit_price
    ...     for m in production.outputs if m.material_return)
    >>> abs(received + others - production.cost) < Decimal('0.05')
    True

The Jobshop data import (migration/jobshop/shopfloor.py) on rows like
Jobshop's::

    >>> import importlib.util, os
    >>> path = os.path.join(os.environ.get('NLINE_MIGRATION',
    ...     r'M:\NLINE_ERP\migration'), 'jobshop', 'shopfloor.py')
    >>> spec = importlib.util.spec_from_file_location('js_shopfloor', path)
    >>> js_shopfloor = importlib.util.module_from_spec(spec)
    >>> spec.loader.exec_module(js_shopfloor)

    >>> ROWS = {
    ...     'SHOPFLOOR_SHOP_RESOURCE': [
    ...         {'ID': 'LATHE', 'DESCRIPTION': 'Lathe 1', 'RESOURCE_TYPE':
    ...             'MACHINE', 'SCHEDULE_METHOD': 'FINITE',
    ...             'SCHEDULE_TYPE': 'NORMAL', 'EXCLUSIVITY': 'INCLUSIVE',
    ...             'SHIFT_1_CAPACITY': 2, 'RUN_PER_HR': Decimal('20'),
    ...             'BUR_PER_HR_RUN': Decimal('10'), 'BUR_PER_OPER':
    ...             Decimal('5'), 'SPECIAL_INSTRUCTIONS': 'Per 201-1',
    ...             'INACTIVE': 0},
    ...         {'ID': 'GRP1', 'DESCRIPTION': 'Machines', 'RESOURCE_TYPE':
    ...             'GROUP', 'SCHEDULE_METHOD': 'INFINITE',
    ...             'EXCLUSIVITY': 'EXCLUSIVE', 'INACTIVE': 0},
    ...         {'ID': 'OLD', 'RESOURCE_TYPE': 'TEAM', 'INACTIVE': -1}],
    ...     'SHOPFLOOR_RESOURCE_MEMBER': [
    ...         {'GROUP_RESOURCE_ID': 'GRP1', 'SEQ_NO': 10,
    ...             'SUB_RESOURCE_ID': 'LATHE', 'EFFICIENCY_FACTOR': None},
    ...         {'GROUP_RESOURCE_ID': 'GRP1', 'SEQ_NO': 20,
    ...             'SUB_RESOURCE_ID': 'DRILL', 'EFFICIENCY_FACTOR': None}],
    ...     'SHOPFLOOR_SHOP_VIEW': [{'ID': 'ASSY', 'DESCRIPTION': 'Assembly'}],
    ...     'SHOPFLOOR_SHOP_VIEW_RESOURCE': [
    ...         {'SHOP_VIEW_ID': 'ASSY', 'SEQ_NO': 10, 'RESOURCE_ID':
    ...             'LATHE'}],
    ...     'SHOPFLOOR_DIRECT_EMPLOYEE': [
    ...         {'CLOCK_NO': 'KIRSCHG', 'NAME': 'Greg Kirsch', 'SHIFT_NO': 2,
    ...             'COST_PER_HR': Decimal('26'), 'EMAIL': 'greg@example.com',
    ...             'INACTIVE': 0},
    ...         {'CLOCK_NO': 'OPCOMPLETE', 'NAME': 'OPERATION COMPLETE',
    ...             'SHIFT_NO': 1, 'INACTIVE': 0}],
    ...     'SHOPFLOOR_CALENDAR_WEEK': [
    ...         {'DAY_OF_WEEK': 2, 'START_OF_DAY': dt.datetime(
    ...             1899, 12, 30, 7, 0), 'SHIFT_1': Decimal('8')}],
    ...     'SHOPFLOOR_CALENDAR_CHANGE': [],
    ...     }
    >>> class Source:
    ...     def rows(self, sql, *params):
    ...         return ROWS[sql.split(' from ')[1].split()[0]]
    >>> class Migration:
    ...     js = Source()
    ...     company = company
    ...     def get(self, name):
    ...         return Model.get(name)
    >>> js_shopfloor.run(Migration())
    js_shopfloor: 2 resources updated, 1 groups made
    js_shopfloor: 2 shop group members
    js_shopfloor: 1 shop views made
    js_shopfloor: 1 employees made, 2 updated
    js_shopfloor: 1 calendar lines
    >>> js_shopfloor.run(Migration())
    js_shopfloor: 0 resources updated, 0 groups made
    js_shopfloor: 0 shop group members
    js_shopfloor: 0 shop views made
    js_shopfloor: 0 employees made, 0 updated
    js_shopfloor: 0 calendar lines

    >>> lathe.reload()
    >>> lathe.description, lathe.schedule_method, lathe.shift_1_capacity
    ('Lathe 1', 'finite', 2)
    >>> group, = WorkCenter.find([('name', '=', 'GRP1')])
    >>> group.resource_type, [m.resource.name for m in group.members]
    ('group', ['LATHE', 'DRILL'])
    >>> employee, = Model.get('company.employee').find([
    ...     ('clock_no', '=', 'KIRSCHG')])
    >>> employee.shift_no, float(employee.cost_per_hr)
    (2, 26.0)
    >>> [c.value for c in employee.party.contact_mechanisms]
    ['greg@example.com']
    >>> opcomplete, = Model.get('company.employee').find([
    ...     ('clock_no', '=', 'OPCOMPLETE')])
    >>> bool(opcomplete.inactive)
    True

The Employees window: the name, address and phones are the person's; a new
employee makes its person::

    >>> Employee = Model.get('company.employee')
    >>> kirsch = Employee(greg['id'])
    >>> kirsch.phone = '555-1234'
    >>> kirsch.addr_1 = '1 Main St'
    >>> kirsch.city = 'Dover'
    >>> kirsch.save()
    >>> kirsch.reload()
    >>> kirsch.phone, kirsch.addr_1, kirsch.city, kirsch.party.addresses[0].city
    ('555-1234', '1 Main St', 'Dover', 'Dover')
    >>> newcomer = Employee(clock_no='NEWE', employee_name='New Person')
    >>> newcomer.save()
    >>> newcomer.party.name, newcomer.employee_name
    ('New Person', 'New Person')
    >>> _ = newcomer.calendar_weeks.new(day_of_week='2', shift_1=8.0)
    >>> newcomer.save()
    >>> len(newcomer.calendar_weeks)
    1

Time and Attendance: a ticket, approved, Who is In/Out::

    >>> row = Desk.sf_attendance_save({'employee': greg['id'],
    ...     'clock_in': '2026-10-20 07:00', 'clock_out': '2026-10-20 15:30',
    ...     'notes': 'Doctor'}, config.context)
    >>> row['hours'], row['transaction_date'], row['has_notes']
    (8.5, '2026-10-20', True)
    >>> row['id'] in [r['id'] for r in Desk.sf_attendance({
    ...     'show': 'not_approved', 'employee': greg['id']}, config.context)]
    True
    >>> approved, = Desk.sf_attendance_approve([row['id']], config.context)
    >>> approved['approved'], bool(approved['approved_by'])
    (True, True)
    >>> exported = Desk.sf_attendance_save({'id': row['id'],
    ...     'exported': True}, config.context)
    >>> exported['exported'], bool(exported['exported_date'])
    (True, True)
    >>> who = Desk.sf_who_is_in(config.context)
    >>> sorted(who[0])  # doctest: +NORMALIZE_WHITESPACE
    ['absence', 'clock_in', 'clock_no', 'clock_out', 'employee', 'name',
     'shift_no', 'shift_start', 'status']

Shop Resources: Inactive is Active the other way round; Where Used gives
Jobshop's columns; Reset Operation Costs of the description only::

    >>> drill.inactive
    False
    >>> used = Desk.sf_resource_where_used(lathe.id, {}, config.context)
    >>> used['description']
    'Lathe 1'
    >>> all(k in used['rows'][0] for k in ['created', 'sub', 'op_status',
    ...     'setup_hours', 'run_type', 'drawing_id', 'preserved'])
    True
    >>> Desk.sf_reset_operation_costs({'resource': lathe.id, 'costs': False,
    ...     'description': True, 'templates': True, 'statuses': ['all']},
    ...     config.context)['templates']
    0
    >>> drill.inactive = True
    >>> drill.save()
    >>> bool(drill.active)
    False
