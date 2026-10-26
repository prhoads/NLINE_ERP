===============================
N-Line Outside Service Scenario
===============================

A body is machined inside then heat treated outside. The heat treat is bought
per operation, its bill differs from the purchase and is posted before the
production is done. A second production is billed after it is done and the
difference is posted as a variance.

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
    >>> from trytond.modules.account_stock_continental.tests.tools import \
    ...     add_stock_accounts
    >>> from trytond.modules.stock.exceptions import MoveOriginWarning
    >>> from trytond.modules.nline_outside_service.exceptions import \
    ...     OutsideServiceWarning

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules('nline_outside_service')
    >>> Warning = Model.get('res.user.warning')

Create company::

    >>> _ = create_company()
    >>> company = get_company()

Create fiscal year::

    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
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
    >>> variance, = accounts['expense'].duplicate(
    ...     default={'name': "Production Variance"})

    >>> AccountConfiguration = Model.get('account.configuration')
    >>> account_configuration = AccountConfiguration(1)
    >>> account_configuration.production_wip_account = wip
    >>> account_configuration.production_applied_cost_account = applied
    >>> account_configuration.production_variance_account = variance
    >>> account_configuration.save()

Create parties::

    >>> Party = Model.get('party.party')
    >>> heat_treater = Party(name="Heat Treater")
    >>> heat_treater.save()

Create product categories::

    >>> ProductCategory = Model.get('product.category')
    >>> account_category = ProductCategory(name="Goods")
    >>> account_category.accounting = True
    >>> account_category.account_expense = accounts['expense']
    >>> account_category.account_revenue = accounts['revenue']
    >>> account_category.account_stock = stock
    >>> account_category.account_stock_in = stock_in
    >>> account_category.account_stock_out = stock_out
    >>> account_category.save()
    >>> service_category = ProductCategory(name="Outside Services")
    >>> service_category.accounting = True
    >>> service_category.account_expense = accounts['expense']
    >>> service_category.save()

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

    >>> body = create_product("Body", producible=True)
    >>> casting = create_product("Casting")

    >>> template = ProductTemplate(name="Heat Treat", default_uom=unit,
    ...     type='service', purchasable=True, list_price=Decimal(0),
    ...     account_category=service_category)
    >>> service_supplier = template.product_suppliers.new()
    >>> service_supplier.party = heat_treater
    >>> price = service_supplier.prices.new()
    >>> price.unit_price = Decimal('40.0000')
    >>> template.save()
    >>> heat_treat, = template.products

Create work centers and operations::

    >>> WorkCenter = Model.get('production.work.center')
    >>> machining = WorkCenter(name="Machining")
    >>> machining.cost_method = 'hour'
    >>> machining.cost_price = Decimal('50')
    >>> machining.save()

    >>> Operation = Model.get('production.routing.operation')
    >>> machine = Operation(name="Machine")
    >>> machine.save()
    >>> heat = Operation(name="Heat Treat")
    >>> heat.save()

Create BOM and routing with an outside step::

    >>> BOM = Model.get('production.bom')
    >>> bom = BOM(name="Body")
    >>> _ = bom.inputs.new(product=casting, quantity=1)
    >>> _ = bom.outputs.new(product=body, quantity=1)
    >>> bom.save()

    >>> Routing = Model.get('production.routing')
    >>> routing = Routing(name="Body")
    >>> routing.boms.append(bom)
    >>> _ = routing.steps.new(operation=machine,
    ...     run_duration=dt.timedelta(hours=1))
    >>> step = routing.steps.new(operation=heat)
    >>> step.supplier = heat_treater
    >>> step.service = heat_treat
    >>> step.service_supplier == template.product_suppliers[0]
    True
    >>> routing.save()

    >>> ProductBom = Model.get('product.product-production.bom')
    >>> body.boms.append(ProductBom(bom=bom, routing=routing))
    >>> body.save()

Receive castings::

    >>> Location = Model.get('stock.location')
    >>> Move = Model.get('stock.move')
    >>> supplier_loc, = Location.find([('code', '=', 'SUP')])
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> move = Move(product=casting, quantity=4, unit=unit,
    ...     from_location=supplier_loc, to_location=storage,
    ...     unit_price=Decimal('100'), currency=company.currency,
    ...     effective_date=today)
    >>> try:
    ...     move.click('do')
    ... except MoveOriginWarning as warning:
    ...     _, (key, *_) = warning.args
    >>> Warning(user=config.user, name=key).save()
    >>> move.click('do')

Make a production, the heat treat is purchased for the operation::

    >>> Production = Model.get('production')
    >>> production = Production(product=body, bom=bom, routing=routing,
    ...     quantity=2, work_center=machining)
    >>> production.click('wait')
    >>> machine_work, heat_work = production.works
    >>> machine_work.outside
    False
    >>> machine_work.planned_duration
    datetime.timedelta(seconds=7200)
    >>> heat_work.outside
    True
    >>> heat_work.supplier == heat_treater
    True
    >>> heat_work.planned_duration
    >>> purchase_line = heat_work.purchase_line
    >>> purchase_line.quantity
    2.0
    >>> purchase_line.amount
    Decimal('80.00')
    >>> purchase_line.production == production
    True
    >>> production.cost
    Decimal('280.0000')

Confirm the purchase and post the bill at a higher price::

    >>> purchase = heat_work.purchase
    >>> purchase.click('quote')
    >>> purchase.click('confirm')
    >>> invoice, = purchase.invoices
    >>> invoice_line, = invoice.lines
    >>> invoice_line.account == wip
    True
    >>> invoice_line.unit_price = Decimal('45.0000')
    >>> invoice.invoice_date = today
    >>> invoice.click('post')
    >>> wip.reload()
    >>> wip.balance
    Decimal('90.00')

Run and finish the works, the outside one is received without cost::

    >>> production.click('assign_try')
    >>> production.click('run')
    >>> machine_work.click('finish')
    >>> heat_work.click('receive')
    >>> heat_work.reload()
    >>> heat_work.state
    'finished'
    >>> heat_work.cost
    Decimal('0.0000')

The production uses the bill amount and WIP clears::

    >>> production.reload()
    >>> production.cost
    Decimal('390.0000')
    >>> production.click('done')
    >>> output, = production.outputs
    >>> output.unit_price
    Decimal('195.0000')
    >>> wip.reload()
    >>> wip.balance
    Decimal('0.00')

Make a second production billed after it is done::

    >>> production2 = Production(product=body, bom=bom, routing=routing,
    ...     quantity=2, work_center=machining)
    >>> production2.click('wait')
    >>> _, heat_work2 = production2.works
    >>> purchase2 = heat_work2.purchase
    >>> purchase2.click('quote')
    >>> purchase2.click('confirm')
    >>> production2.click('assign_try')
    >>> production2.click('run')
    >>> for work in production2.works:
    ...     work.click('finish')
    >>> try:
    ...     production2.click('done')
    ... except OutsideServiceWarning as warning:
    ...     _, (key, *_) = warning.args
    ...     raise  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    OutsideServiceWarning: ...
    >>> Warning(user=config.user, name=key).save()
    >>> production2.click('done')
    >>> production2.state
    'done'
    >>> wip.reload()
    >>> wip.balance
    Decimal('-80.00')

Post the bill, the difference goes to the variance::

    >>> invoice2, = purchase2.invoices
    >>> invoice_line2, = invoice2.lines
    >>> invoice_line2.unit_price = Decimal('42.5000')
    >>> invoice2.invoice_date = today
    >>> invoice2.click('post')
    >>> wip.reload()
    >>> wip.balance
    Decimal('0.00')
    >>> variance.reload()
    >>> variance.balance
    Decimal('5.00')
    >>> purchase_line2 = heat_work2.purchase_line
    >>> purchase_line2.reload()
    >>> purchase_line2.production_cost_amount
    Decimal('85.00')
