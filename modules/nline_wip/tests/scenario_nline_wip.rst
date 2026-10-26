=======================
N-Line WIP Leg Scenario
=======================

A valve is made from a body leg and bolts. The body leg is made from a
casting. Both have an internal operation charged at the planned hours by the
work center rate. The full cost rolls up into the valve and the work in
progress account nets to zero.

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company
    >>> from trytond.modules.account.tests.tools import create_fiscalyear, \
    ...     create_chart, get_accounts
    >>> from trytond.modules.account_stock_continental.tests.tools import \
    ...     add_stock_accounts

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules('nline_wip')

Create company::

    >>> _ = create_company()
    >>> company = get_company()

Create fiscal year::

    >>> fiscalyear = create_fiscalyear(company, today)
    >>> fiscalyear.account_stock_method = 'continental'
    >>> fiscalyear.click('create_period')

Create chart of accounts::

    >>> _ = create_chart(company)
    >>> accounts = add_stock_accounts(get_accounts(company), company)
    >>> stock = accounts['stock']
    >>> stock_in = accounts['stock_expense']
    >>> stock_out, = stock_in.duplicate()
    >>> wip, = stock.duplicate(default={'name': "Work in Progress"})
    >>> applied, = accounts['expense'].duplicate(
    ...     default={'name': "Applied Shop Cost"})

    >>> AccountConfiguration = Model.get('account.configuration')
    >>> account_configuration = AccountConfiguration(1)
    >>> account_configuration.production_wip_account = wip
    >>> account_configuration.production_applied_cost_account = applied
    >>> account_configuration.save()

Create product category::

    >>> ProductCategory = Model.get('product.category')
    >>> account_category = ProductCategory(name="Account Category")
    >>> account_category.accounting = True
    >>> account_category.account_expense = accounts['expense']
    >>> account_category.account_revenue = accounts['revenue']
    >>> account_category.account_stock = stock
    >>> account_category.account_stock_in = stock_in
    >>> account_category.account_stock_out = stock_out
    >>> account_category.save()

Create products::

    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> ProductTemplate = Model.get('product.template')

    >>> def create_product(name, producible=False):
    ...     template = ProductTemplate(name=name, default_uom=unit,
    ...         type='goods', producible=producible,
    ...         list_price=Decimal(0), cost_price_method='average',
    ...         account_category=account_category)
    ...     template.save()
    ...     product, = template.products
    ...     return product

    >>> valve = create_product("Valve", producible=True)
    >>> body = create_product("Body", producible=True)
    >>> casting = create_product("Casting")
    >>> bolt = create_product("Bolt")

Create work center and operations::

    >>> WorkCenter = Model.get('production.work.center')
    >>> center = WorkCenter(name="Machining")
    >>> center.cost_method = 'hour'
    >>> center.cost_price = Decimal('50')
    >>> center.save()

    >>> Operation = Model.get('production.routing.operation')
    >>> machine = Operation(name="Machine")
    >>> machine.save()
    >>> assemble = Operation(name="Assemble")
    >>> assemble.save()

Create BOMs and routings::

    >>> BOM = Model.get('production.bom')
    >>> Routing = Model.get('production.routing')
    >>> ProductBom = Model.get('product.product-production.bom')

    >>> def create_master(product, inputs, operation, setup, run):
    ...     bom = BOM(name=product.rec_name)
    ...     for component, quantity in inputs:
    ...         bom.inputs.new(product=component, quantity=quantity)
    ...     bom.outputs.new(product=product, quantity=1)
    ...     bom.save()
    ...     routing = Routing(name=product.rec_name)
    ...     routing.boms.append(bom)
    ...     routing.steps.new(operation=operation,
    ...         setup_duration=setup, run_duration=run)
    ...     routing.save()
    ...     product.boms.append(ProductBom(bom=bom, routing=routing))
    ...     product.save()
    ...     return bom, routing

    >>> body_bom, body_routing = create_master(
    ...     body, [(casting, 1)], machine,
    ...     dt.timedelta(hours=1), dt.timedelta(minutes=30))
    >>> valve_bom, valve_routing = create_master(
    ...     valve, [(body, 1), (bolt, 2)], assemble,
    ...     None, dt.timedelta(hours=1))

Receive the purchased components::

    >>> Location = Model.get('stock.location')
    >>> Move = Model.get('stock.move')
    >>> supplier_loc, = Location.find([('code', '=', 'SUP')])
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> warehouse, = Location.find([('code', '=', 'WH')])

    >>> def receive(product, quantity, unit_price):
    ...     move = Move(product=product, quantity=quantity, unit=unit,
    ...         from_location=supplier_loc, to_location=storage,
    ...         unit_price=unit_price, currency=company.currency,
    ...         effective_date=today)
    ...     move.click('do')

    >>> receive(casting, 2, Decimal('100'))
    >>> receive(bolt, 4, Decimal('5'))
    >>> stock.reload()
    >>> stock.balance
    Decimal('220.00')

Set the WIP location of the warehouse::

    >>> production_loc = warehouse.production_location
    >>> wip_loc = Location(name="Leg WIP", type='production',
    ...     parent=warehouse)
    >>> wip_loc.save()
    >>> warehouse.production_wip_location = wip_loc
    >>> warehouse.save()

Make the valve production with a body leg::

    >>> Production = Model.get('production')
    >>> valve_production = Production(product=valve, bom=valve_bom,
    ...     routing=valve_routing, quantity=2, work_center=center)
    >>> body_input, = [i for i in valve_production.inputs
    ...     if i.product == body]
    >>> body_input.from_location = wip_loc
    >>> valve_production.save()

    >>> leg = Production(product=body, bom=body_bom,
    ...     routing=body_routing, quantity=2, work_center=center)
    >>> leg_output, = leg.outputs
    >>> leg_output.to_location = wip_loc
    >>> leg.save()
    >>> leg_output, = leg.outputs

    >>> body_input, = [i for i in valve_production.inputs
    ...     if i.product == body]
    >>> body_input.wip_source = leg_output
    >>> body_input.save()

Release and run the valve first, the body input waits for the leg::

    >>> valve_production.click('wait')
    >>> valve_production.click('assign_try')
    >>> valve_production.state
    'assigned'
    >>> valve_production.click('run')
    >>> body_input.reload()
    >>> body_input.state
    'assigned'

    >>> wip.reload()
    >>> wip.balance
    Decimal('20.00')

The valve can not be done before its leg::

    >>> valve_production.works[0].click('finish')
    >>> valve_production.click('done')  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    AccessError: ...

Make the leg, its operation is charged at the planned hours (1 + 2 x 0.5)::

    >>> leg.click('wait')
    >>> work, = leg.works
    >>> work.planned_duration
    datetime.timedelta(seconds=7200)
    >>> leg.click('assign_try')
    >>> leg.click('run')
    >>> work.click('finish')
    >>> work.reload()
    >>> work.cost
    Decimal('100.0000')
    >>> leg.click('done')
    >>> leg.state
    'done'
    >>> leg_output.reload()
    >>> leg_output.unit_price
    Decimal('150.0000')

The leg output passed to the valve at its cost without posting::

    >>> body_input.reload()
    >>> body_input.state
    'done'
    >>> body_input.unit_price
    Decimal('150.0000')
    >>> stock.reload()
    >>> stock.balance
    Decimal('0.00')

Do the valve::

    >>> valve_production.reload()
    >>> work, = valve_production.works
    >>> work.cost
    Decimal('100.0000')
    >>> valve_production.cost
    Decimal('420.0000')
    >>> valve_production.click('done')
    >>> output, = valve_production.outputs
    >>> output.unit_price
    Decimal('210.0000')

The full cost is in finished goods and WIP nets to zero::

    >>> wip.reload()
    >>> wip.balance
    Decimal('0.00')
    >>> stock.reload()
    >>> stock.balance
    Decimal('420.00')
    >>> applied.reload()
    >>> applied.balance
    Decimal('-200.00')
    >>> stock_in.reload()
    >>> stock_in.balance
    Decimal('-220.00')
    >>> stock_out.reload()
    >>> stock_out.balance
    Decimal('0.00')

    >>> valve.reload()
    >>> valve.cost_price
    Decimal('210.0000')
