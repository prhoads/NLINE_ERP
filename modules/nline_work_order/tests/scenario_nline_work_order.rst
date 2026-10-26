==========================
N-Line Work Order Scenario
==========================

A sales order line for a valve creates the work order WO-261367-02. Its body
card pins revision A, a leg is made from it and a core leg is nested under the
body leg. Releasing the work order releases its legs and the full cost rolls
up into the valve.

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model, Wizard
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company
    >>> from trytond.modules.account.tests.tools import create_fiscalyear, \
    ...     create_chart, get_accounts
    >>> from trytond.modules.account_invoice.tests.tools import \
    ...     set_fiscalyear_invoice_sequences
    >>> from trytond.modules.account_stock_continental.tests.tools import \
    ...     add_stock_accounts

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules('nline_work_order')

Create company::

    >>> _ = create_company()
    >>> company = get_company()

Create fiscal year and chart of accounts::

    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.account_stock_method = 'continental'
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = add_stock_accounts(get_accounts(company), company)
    >>> stock = accounts['stock']
    >>> stock_in = accounts['stock_expense']
    >>> wip, = stock.duplicate(default={'name': "Work in Progress"})
    >>> applied, = accounts['expense'].duplicate(
    ...     default={'name': "Applied Shop Cost"})
    >>> AccountConfiguration = Model.get('account.configuration')
    >>> account_configuration = AccountConfiguration(1)
    >>> account_configuration.production_wip_account = wip
    >>> account_configuration.production_applied_cost_account = applied
    >>> account_configuration.save()

    >>> ProductCategory = Model.get('product.category')
    >>> account_category = ProductCategory(name="Goods")
    >>> account_category.accounting = True
    >>> account_category.account_expense = accounts['expense']
    >>> account_category.account_revenue = accounts['revenue']
    >>> account_category.account_stock = stock
    >>> account_category.account_stock_in = stock_in
    >>> account_category.account_stock_out = stock_in
    >>> account_category.save()

Set the sales order numbering like N-Line (26-1367)::

    >>> SaleConfig = Model.get('sale.configuration')
    >>> sale_sequence = SaleConfig(1).sale_sequence
    >>> sale_sequence.prefix = '26-'
    >>> sale_sequence.number_next = 1367
    >>> sale_sequence.save()

Set the WIP location of the warehouse::

    >>> Location = Model.get('stock.location')
    >>> warehouse, = Location.find([('code', '=', 'WH')])
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> wip_loc = Location(name="Leg WIP", type='production',
    ...     parent=warehouse)
    >>> wip_loc.save()
    >>> warehouse.production_wip_location = wip_loc
    >>> warehouse.save()

Create products::

    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> ProductTemplate = Model.get('product.template')

    >>> def create_product(name, producible=False, cost=Decimal(0),
    ...         revision=None, **kwargs):
    ...     template = ProductTemplate(name=name, default_uom=unit,
    ...         type='goods', producible=producible,
    ...         list_price=Decimal(1000), cost_price_method='average',
    ...         account_category=account_category,
    ...         engineering_revision=revision, **kwargs)
    ...     product, = template.products
    ...     product.cost_price = cost
    ...     template.save()
    ...     product, = template.products
    ...     return product

    >>> valve = create_product("VALVE-2-600", producible=True,
    ...     revision='A', salable=True, supply_on_sale='always')
    >>> body = create_product("332-02000", producible=True, revision='B')
    >>> core = create_product("323-02275", producible=True, revision='A')
    >>> casting = create_product("Casting", cost=Decimal(100))
    >>> bolt = create_product("Bolt", cost=Decimal(5))
    >>> spare = create_product("Seal Kit", salable=True)

Create the work center and operations::

    >>> WorkCenter = Model.get('production.work.center')
    >>> center = WorkCenter(name="Shop")
    >>> center.cost_method = 'hour'
    >>> center.cost_price = Decimal('50')
    >>> center.save()
    >>> Operation = Model.get('production.routing.operation')
    >>> machine = Operation(name="Machine")
    >>> machine.save()
    >>> assemble = Operation(name="Assemble")
    >>> assemble.save()

Create the engineering masters::

    >>> BOM = Model.get('production.bom')
    >>> Routing = Model.get('production.routing')
    >>> ProductBom = Model.get('product.product-production.bom')

    >>> def create_master(product, revision, inputs, operation, run):
    ...     bom = BOM(name=product.template.name, revision=revision)
    ...     for values in inputs:
    ...         _ = bom.inputs.new(**values)
    ...     _ = bom.outputs.new(product=product, quantity=1)
    ...     bom.save()
    ...     routing = Routing(name="%s %s" % (product.template.name, revision))
    ...     routing.boms.append(bom)
    ...     _ = routing.steps.new(operation=operation, run_duration=run)
    ...     routing.save()
    ...     product.boms.append(ProductBom(bom=bom, routing=routing))
    ...     product.save()
    ...     return bom

    >>> core_a = create_master(core, 'A',
    ...     [{'product': casting, 'quantity': 1}],
    ...     machine, dt.timedelta(hours=1))
    >>> body_a = create_master(body, 'A',
    ...     [{'product': core, 'quantity': 1, 'operation': 10}],
    ...     machine, dt.timedelta(hours=1))
    >>> body_b = create_master(body, 'B',
    ...     [{'product': casting, 'quantity': 1}],
    ...     machine, dt.timedelta(hours=2))
    >>> valve_a = create_master(valve, 'A', [
    ...         {'product': bolt, 'quantity': 2, 'operation': 20,
    ...             'piece': 1},
    ...         {'product': body, 'quantity': 1, 'operation': 10,
    ...             'piece': 1, 'component_revision': 'A'},
    ...         ], assemble, dt.timedelta(hours=1))
    >>> body.reload()
    >>> body.current_bom == body_b
    True

Put the purchased parts in stock::

    >>> Inventory = Model.get('stock.inventory')
    >>> inventory = Inventory(location=storage)
    >>> _ = inventory.lines.new(product=casting, quantity=10)
    >>> _ = inventory.lines.new(product=bolt, quantity=10)
    >>> inventory.click('confirm')
    >>> stock.reload()
    >>> stock.balance
    Decimal('1050.00')

Sell a seal kit and a valve::

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Customer")
    >>> _ = customer.addresses.new()
    >>> customer.save()
    >>> Sale = Model.get('sale.sale')
    >>> sale = Sale(party=customer)
    >>> for product in [spare, valve]:
    ...     line = sale.lines.new()
    ...     line.product = product
    ...     line.quantity = 1
    >>> sale.click('quote')
    >>> sale.click('confirm')
    >>> sale.number
    '26-1367'

The valve line has its work order with one card per BOM line::

    >>> Production = Model.get('production')
    >>> work_order, = Production.find([])
    >>> work_order.number
    'WO-261367-02'
    >>> work_order.origin == sale.lines[1]
    True
    >>> work_order.bom == valve_a
    True
    >>> work_order.routing is not None
    True
    >>> [(c.operation, c.piece, c.product.template.name,
    ...         c.component_revision, c.supply)
    ...     for c in work_order.material_cards]
    [(10, 1, '332-02000', 'A', 'stock'), (20, 1, 'Bolt', None, 'stock')]
    >>> body_card, bolt_card = work_order.material_cards
    >>> body_card.move.origin == body_card
    True

Make the body card a leg, the pinned revision is proposed::

    >>> make_leg = Wizard('production.material_card.make_leg', [body_card])
    >>> make_leg.form.product_bom.bom == body_a
    True
    >>> make_leg.execute('make')
    >>> body_card.reload()
    >>> body_card.supply
    'leg'
    >>> body_leg = body_card.leg
    >>> body_leg.number
    'WO-261367-02/1'
    >>> body_leg.parent == work_order
    True
    >>> body_leg.bom == body_a
    True
    >>> body_card.move.from_location == wip_loc
    True
    >>> body_card.move.wip_source.production_output == body_leg
    True

Nest a core leg under the body leg::

    >>> core_card, = body_leg.material_cards
    >>> make_leg = Wizard('production.material_card.make_leg', [core_card])
    >>> make_leg.execute('make')
    >>> core_card.reload()
    >>> core_leg = core_card.leg
    >>> core_leg.number
    'WO-261367-02/2'
    >>> core_leg.parent == body_leg
    True
    >>> core_leg.root == work_order
    True

Remove and make again the core leg::

    >>> core_card.click('remove_leg')
    >>> core_card.reload()
    >>> core_card.supply
    'stock'
    >>> core_card.leg
    >>> core_card.move.from_location == storage
    True
    >>> core_card.move.wip_source
    >>> make_leg = Wizard('production.material_card.make_leg', [core_card])
    >>> make_leg.execute('make')
    >>> core_card.reload()
    >>> core_leg = core_card.leg
    >>> core_leg.number
    'WO-261367-02/2'

Release the work order, its legs are released::

    >>> work_order.reload()
    >>> work_order.work_center = center
    >>> work_order.save()
    >>> work_order.click('draft')
    >>> work_order.click('wait')
    >>> body_leg.reload()
    >>> core_leg.reload()
    >>> body_leg.state, core_leg.state
    ('waiting', 'waiting')
    >>> len(body_leg.works), len(core_leg.works)
    (1, 1)

Build from the deepest leg up::

    >>> def build(production):
    ...     production.click('assign_try')
    ...     production.click('run')
    ...     for work in production.works:
    ...         work.click('finish')
    ...     production.click('done')
    ...     production.reload()
    ...     return production.state

    >>> build(core_leg)
    'done'
    >>> build(body_leg)
    'done'
    >>> work_order.reload()
    >>> build(work_order)
    'done'

The valve cost is all materials plus all operations::

    >>> core_leg.cost
    Decimal('150.0000')
    >>> body_leg.cost
    Decimal('200.0000')
    >>> work_order.cost
    Decimal('260.0000')
    >>> output, = work_order.outputs
    >>> output.unit_price
    Decimal('260.0000')
    >>> wip.reload()
    >>> wip.balance
    Decimal('0.00')
    >>> applied.reload()
    >>> applied.balance
    Decimal('-150.00')
