=================================
Jobshop Engineering Scenario
=================================

The desk's calls of the Jobshop Work Order, Engineering Master, Operation
Template, Quote and Quote Master windows: the information cards, the
operation and material windows, legs, Change Status, Show Costs, material
availability, supply and demand, variables, co-products, scheduling, copies
and the quote won into a sales order.

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company
    >>> from trytond.modules.account.tests.tools import create_chart, \
    ...     get_accounts

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules(['nline_js_engineering'])
    >>> _ = create_company()
    >>> company = get_company()
    >>> Desk = Model.get('nline.desk')
    >>> ctx = config.context
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> Category = Model.get('product.category')
    >>> category = Category(name="Parts", accounting=True,
    ...     account_expense=accounts['expense'],
    ...     account_revenue=accounts['revenue'])
    >>> category.save()

    >>> Location = Model.get('stock.location')
    >>> warehouse, = Location.find([('code', '=', 'WH')])
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> wip = Location(name="Leg WIP", type='production', parent=warehouse)
    >>> wip.save()
    >>> warehouse.production_wip_location = wip
    >>> warehouse.save()

Parts, a resource and a supplier::

    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> def part(code, name, producible=False, cost=0, salable=False):
    ...     template = Template(name=name, code=code, default_uom=unit,
    ...         type='goods', producible=producible, salable=salable,
    ...         purchasable=True, list_price=Decimal(1000),
    ...         account_category=category)
    ...     template.save()
    ...     product, = template.products
    ...     product.cost_price = Decimal(cost)
    ...     product.save()
    ...     return product
    >>> valve = part('332-001', "Valve", True, salable=True)
    >>> body = part('323-001', "Body", True)
    >>> casting = part('311-001', "Casting", cost=40)
    >>> bolt = part('400-001', "Bolt", cost=2)
    >>> bar = part('311-002', "Round Bar", cost=3)

    >>> WorkCenter = Model.get('production.work.center')
    >>> lathe = WorkCenter(name="Lathe", cost_price=Decimal('30'),
    ...     cost_method='hour', warehouse=warehouse)
    >>> lathe.save()
    >>> assembly = WorkCenter(name="Assembly", cost_price=Decimal('20'),
    ...     cost_method='hour', warehouse=warehouse)
    >>> assembly.save()
    >>> Party = Model.get('party.party')
    >>> supplier = Party(name="Steel Supply")
    >>> supplier.save()
    >>> customer = Party(name="Acme Oil")
    >>> customer.save()

An operation template::

    >>> OperationTemplate = Model.get('nline.engineering.operation_template')
    >>> turn = OperationTemplate(code='TURN', description="Turn the body",
    ...     resource=lathe, run_type='pcs_hr', run=2,
    ...     setup_hours=1)
    >>> turn.save()
    >>> values = Desk.eng_operation('template', turn.id, ctx)
    >>> values['code'], values['run'], values['setup_hours']
    ('TURN', 2.0, 1.0)

Building a new engineering master for the body: its part, name and
routing come with it::

    >>> BOM = Model.get('production.bom')
    >>> body_bom = BOM(name='-', revision='B')
    >>> body_bom.save()
    >>> _ = Desk.eng_master_ready(body_bom.id, body.id, ctx)
    >>> body_bom.reload()
    >>> body_bom.name, body_bom.part == body, bool(body_bom.routing)
    ('323-001 Body', True, True)

Add the template's operation (2 pieces an hour is half an hour a piece) and
the casting::

    >>> tree = Desk.eng_operation_save('bom', body_bom.id, None, {
    ...     'template': turn.id, 'resource': lathe.id, 'setup_hours': 1,
    ...     'run': 2, 'run_type': 'pcs_hr', 'description': "Turn the body",
    ...     'specifications': "Deburr all edges"}, ctx)
    >>> [(w['sequence'], w['operation'], w['description'], w['has_specs'])
    ...     for w in tree['works']]
    [(10, 'Lathe', 'Turn the body', True)]
    >>> step = Model.get('production.routing.step')(tree['works'][0]['step_id'])
    >>> step.run_duration
    datetime.timedelta(seconds=1800)
    >>> tree = Desk.eng_material_save('bom', body_bom.id, None, {
    ...     'product': casting.id, 'quantity': 1, 'operation': 10,
    ...     'specifications': "ASTM A890"}, ctx)
    >>> [(c['product'], c['piece'], c['has_specs']) for c in tree['cards']]
    [('[311-001] Casting', 10, True)]

The valve's master: an assembly operation, bolts (Add Materials) and the
body as a Leg/Detail::

    >>> valve_bom = BOM(name='-', revision='A')
    >>> valve_bom.save()
    >>> _ = Desk.eng_master_ready(valve_bom.id, valve.id, ctx)
    >>> _ = Desk.eng_operation_save('bom', valve_bom.id, None, {
    ...     'resource': assembly.id, 'setup_hours': 0.5, 'run': 1,
    ...     'run_type': 'hrs_pc'}, ctx)
    >>> _ = Desk.eng_material_save('bom', valve_bom.id, None, {'lines': [
    ...     {'product': bolt.id, 'quantity': 4, 'operation': 10},
    ...     {'product': bar.id, 'quantity': 1, 'operation': 10,
    ...         'dimensions': 'LENGTH * 2'}]}, ctx)
    >>> tree = Desk.eng_leg_add('bom', valve_bom.id, {
    ...     'product': body.id, 'quantity': 1, 'operation': 10}, ctx)
    >>> [(c['product'], c['piece'], c['supply']) for c in tree['cards']]
    [('[400-001] Bolt', 10, 'stock'), ('[311-002] Round Bar', 20, 'stock'), ('[323-001] Body', 30, 'leg')]
    >>> leg = tree['cards'][2]['leg']
    >>> leg['number'], [c['product'] for c in leg['cards']]
    ('323-001 Body', ['[311-001] Casting'])

The master's variables set the bar's length::

    >>> tree = Desk.eng_variables_save('bom', valve_bom.id,
    ...     [{'name': 'LENGTH', 'value': 6}], ctx)
    >>> tree['cards'][1]['quantity']
    12.0

Show Costs: the bolts and bar, the leg's casting and turning, the
assembly::

    >>> costs = Desk.eng_costs('bom', valve_bom.id, 1, ctx)
    >>> costs['material'], costs['labor']
    (Decimal('84.00'), Decimal('75.00'))
    >>> [(r['level'], r['kind']) for r in costs['rows']]
    [(0, 'header'), (1, 'op'), (1, 'mat'), (1, 'mat'), (1, 'leg'), (2, 'header'), (3, 'op'), (3, 'mat')]

Copying Into a New Engineering Master (revision C of the valve)::

    >>> copy_id = Desk.eng_master_copy(valve_bom.id, {'revision': 'C'}, ctx)
    >>> copy = BOM(copy_id)
    >>> copy.revision, len(copy.inputs), len(copy.routing.steps)
    ('C', 3, 1)

Resequence Materials for Operation (here by 5)::

    >>> tree = Desk.eng_resequence('bom', copy_id, 10, 5, ctx)
    >>> [c['piece'] for c in tree['cards']]
    [5, 10, 15]

Revision A is the valve's current revision::

    >>> valve.template.engineering_revision = 'A'
    >>> valve.template.save()

The master's header goes into its work orders::

    >>> valve_bom.engineered_by = 'ABOSTAIN'
    >>> valve_bom.drawing_number = '102-001'
    >>> valve_bom.user_0 = r'R:\NLine_Released\332-001_A.pdf'
    >>> valve_bom.save()
    >>> header = Desk.eng_header('bom', valve_bom.id, ctx)
    >>> header['unit'], bool(header['created'])
    ('u', True)

Inactive is the inverse of active (masters and operation templates)::

    >>> turn.inactive = True
    >>> turn.save()
    >>> turn.reload()
    >>> with config.set_context(active_test=False):
    ...     found = OperationTemplate.find([('inactive', '=', True)])
    >>> bool(turn.active), len(found)
    (False, 1)
    >>> template = OperationTemplate(turn.id)
    >>> template.created_by.split()[0]
    'admin'
    >>> turn_copy, = OperationTemplate.duplicate([template])
    >>> turn_copy.code
    'TURN-1'
    >>> turn.inactive = False
    >>> turn.save()

A work order of the valve: its materials, operations and the body leg come
from the master::

    >>> Production = Model.get('production')
    >>> work_order = Production(product=valve, quantity=2,
    ...     planned_date=today + dt.timedelta(days=30), number='WO-1')
    >>> work_order.save()
    >>> _ = Desk.eng_work_order_ready(work_order.id, ctx)
    >>> work_order.reload()
    >>> work_order.bom == valve_bom, work_order.order_status
    (True, 'unreleased')
    >>> work_order.engineered_by, work_order.drawing_number, work_order.user_0
    ('ABOSTAIN', '102-001', 'R:\\NLine_Released\\332-001_A.pdf')
    >>> work_order.description, work_order.linked, work_order.stock_um
    ('Valve', False, 'EA')

The Work/Lot/Split ID is the number (lot 1 and split 0 are not written)::

    >>> work_order.work_id, work_order.lot_id, work_order.split_id
    ('WO-1', '1', '0')
    >>> work_order.lot_id = '2'
    >>> work_order.save()
    >>> work_order.reload()
    >>> work_order.number
    'WO-1/2'
    >>> work_order.lot_id = '1'
    >>> work_order.save()
    >>> work_order.reload()
    >>> work_order.number
    'WO-1'
    >>> header = Desk.eng_header('production', work_order.id, ctx)
    >>> header['revision'], header['linked']
    ('A', False)
    >>> tree = Desk.eng_tree('production', work_order.id, ctx)
    >>> [(c['product'], c['supply'], c['has_specs']) for c in tree['cards']]
    [('[400-001] Bolt', 'stock', False), ('[311-002] Round Bar', 'stock', False), ('[323-001] Body', 'leg', False)]
    >>> tree['cards'][2]['leg']['number']
    'WO-1/1'
    >>> [w['operation'] for w in tree['works']]
    ['Assembly']

Adding an operation to the work order gives it its own routing (the master
keeps its own)::

    >>> tree = Desk.eng_operation_save('production', work_order.id, None, {
    ...     'resource': lathe.id, 'description': "Final test",
    ...     'setup_hours': 0, 'run': 0.25}, ctx)
    >>> [w['sequence'] for w in tree['works']]
    [10, 20]
    >>> work_order.reload()
    >>> work_order.routing != valve_bom.routing
    True
    >>> len(valve_bom.routing.steps)
    1

Add a material and Change Status to Firm, then Released::

    >>> tree = Desk.eng_material_save('production', work_order.id, None, {
    ...     'product': bolt.id, 'quantity': 2, 'supplier': supplier.id}, ctx)
    >>> len(tree['cards'])
    4
    >>> Desk.eng_change_status({'kind': 'production', 'id': work_order.id,
    ...     'status': 'firm'}, ctx)
    True
    >>> work_order.reload()
    >>> work_order.order_status
    'firm'
    >>> Desk.eng_change_status({'kind': 'production', 'id': work_order.id,
    ...     'status': 'released'}, ctx)
    True
    >>> work_order.reload()
    >>> work_order.order_status, len(work_order.works)
    ('released', 2)
    >>> sorted(p.number for p in Production.find(
    ...     [('order_status', '=', 'released')]))
    ['WO-1', 'WO-1/1']

Material availability shows the short bolts, supply and demand the
work order's demand::

    >>> rows = Desk.eng_availability('production', work_order.id, ctx)
    >>> [(r['product'], r['required'], r['short']) for r in rows][:1]
    [('[400-001] Bolt', 8.0, True)]
    >>> demand = Desk.eng_supply_demand(bolt.id, ctx)
    >>> [r['kind'] for r in demand['rows']]
    ['On hand', 'Demand', 'Demand']

Schedule Work Order backward from the want date::

    >>> want = work_order.planned_date
    >>> result = Desk.eng_schedule(work_order.id, False, ctx)
    >>> work_order.reload()
    >>> work_order.schedule_start_date < work_order.schedule_finish_date
    True
    >>> work_order.schedule_finish_date.date() == want == work_order.planned_date
    True

Treat Release Date as Hard: the schedule does not start before the release
date::

    >>> work_order.hard_release_date = True
    >>> work_order.planned_start_date = want - dt.timedelta(days=1)
    >>> work_order.save()
    >>> result = Desk.eng_schedule(work_order.id, False, ctx)
    >>> work_order.reload()
    >>> work_order.schedule_start_date.date() == want - dt.timedelta(days=1)
    True
    >>> work_order.schedule_finish_date.date() >= want
    True

Purchase this Material: a draft purchase from the card's supplier::

    >>> card = [c for c in work_order.material_cards
    ...     if c.supplier == supplier][0]
    >>> purchase_id = Desk.eng_purchase('card', card.id, ctx)
    >>> Purchase = Model.get('purchase.purchase')
    >>> purchase = Purchase(purchase_id)
    >>> purchase.party == supplier, purchase.lines[0].quantity
    (True, 2.0)
    >>> Desk.eng_po_links(work_order.id, 'card', card.id, ctx)
    []

Unreleased again: the operations stay as the work order's routing::

    >>> Desk.eng_change_status({'kind': 'production', 'id': work_order.id,
    ...     'status': 'unreleased'}, ctx)
    True
    >>> work_order.reload()
    >>> work_order.state, len(work_order.routing.steps)
    ('draft', 2)

Copying Into a New Work Order keeps the leg::

    >>> new_id = Desk.eng_work_order_copy(work_order.id, ctx)
    >>> new = Production(new_id)
    >>> len(new.material_cards), [c.supply for c in new.material_cards
    ...     if c.product == body]
    (3, ['leg'])

Close the work order: it is received, with its leg::

    >>> inventory = Model.get('stock.inventory')(location=storage)
    >>> for product in [bolt, bar, casting]:
    ...     _ = inventory.lines.new(product=product, quantity=100)
    >>> inventory.click('confirm')
    >>> Desk.eng_change_status({'kind': 'production', 'id': work_order.id,
    ...     'status': 'closed'}, ctx)
    True
    >>> work_order.reload()
    >>> work_order.order_status, work_order.received_quantity
    ('closed', 2.0)
    >>> txs = Desk.eng_transactions(work_order.id, ctx)
    >>> sorted({r['kind'] for r in txs['inventory']})
    ['Issue', 'Receipt']

A quote master::

    >>> quote_master = BOM(name='-', master_type='quote',
    ...     description="Special valve")
    >>> quote_master.save()
    >>> _ = Desk.eng_master_ready(quote_master.id, None, ctx)
    >>> quote_master.reload()
    >>> quote_master.name, bool(quote_master.routing)
    ('00001', True)
    >>> _ = Desk.eng_material_save('bom', quote_master.id, None, {
    ...     'product': casting.id, 'quantity': 2}, ctx)

A quote of the valve and of the special valve; its costs come from the
masters::

    >>> Quote = Model.get('nline.quote')
    >>> quote = Quote(party=customer, customer_reference="RFQ 12")
    >>> quote.save()
    >>> quote.number == '%s0001' % today.year, quote.status
    (True, 'active')
    >>> cost = Desk.eng_quote_cost({'product': valve.id,
    ...     'cost_from': 'engineering', 'quantity': 1}, ctx)
    >>> cost['unit_cost'], cost['fabricated']
    (Decimal('159.0000'), Decimal('85.0000'))
    >>> cost = Desk.eng_quote_cost({'cost_from': 'quote',
    ...     'quote_master': quote_master.id, 'quantity': 1}, ctx)
    >>> cost['unit_cost']
    Decimal('80.0000')
    >>> lines = Desk.eng_quote_save(quote.id, [
    ...     {'product': valve.id, 'cost_from': 'engineering', 'prices': [
    ...         {'quantity': 1, 'unit_price': 500, 'in_total': True},
    ...         {'quantity': 10, 'unit_price': 450, 'in_total': False}]},
    ...     {'description': "Special valve", 'cost_from': 'quote',
    ...         'quote_master': quote_master.id, 'prices': [
    ...         {'quantity': 2, 'unit_price': 300, 'in_total': True}]}], ctx)
    >>> [(l['line_no'], len(l['prices'])) for l in lines]
    [(1, 2), (2, 1)]
    >>> charge = quote.charges.new(description="Freight", amount=Decimal(50))
    >>> quote.save()
    >>> quote.total_amount
    Decimal('1150.00')

Copying the quote, printing it, losing the copy and winning the quote::

    >>> copy_id = Desk.eng_quote_copy(quote.id, ctx)
    >>> copy = Quote(copy_id)
    >>> copy.status, len(copy.lines), copy.number != quote.number
    ('active', 2, True)
    >>> Desk.eng_quote_printed(quote.id, ctx)
    True
    >>> quote.reload()
    >>> quote.status, bool(quote.printed_date)
    ('ready', True)
    >>> Desk.eng_quote_lose(copy_id, "Price", 'lost', ctx)
    True
    >>> copy.reload()
    >>> copy.status, copy.won_loss_reason
    ('lost', 'Price')
    >>> Note = Model.get('ir.note')
    >>> note = Note(resource=quote, message="Customer wants test certs")
    >>> note.save()
    >>> quote.copy_notes = True
    >>> quote.save()
    >>> sale_id = Desk.eng_quote_win(quote.id, False, ctx)
    >>> quote.reload()
    >>> quote.status, quote.sale.id == sale_id
    ('won', True)
    >>> [n.message for n in Note.find(
    ...     [('resource', '=', 'sale.sale,%s' % sale_id)])]
    ['Customer wants test certs']
    >>> sale = Model.get('sale.sale')(sale_id)
    >>> [(l.description, l.quantity, l.unit_price) for l in sale.lines]
    [('Valve', 1.0, Decimal('500.0000')), ('Special valve', 2.0, Decimal('300.0000')), ('Freight', 1.0, Decimal('50.0000'))]
