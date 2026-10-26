===================
N-Line Job Scenario
===================

Two valves are sold and a core is sold as a spare. One Job makes the cores
for both work orders, the spare and one more for stock. A Job can not feed
another Job.

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

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules('nline_job')

Create company, fiscal year and chart of accounts::

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> ProductCategory = Model.get('product.category')
    >>> account_category = ProductCategory(name="Goods")
    >>> account_category.accounting = True
    >>> account_category.account_expense = accounts['expense']
    >>> account_category.account_revenue = accounts['revenue']
    >>> account_category.save()

    >>> Location = Model.get('stock.location')
    >>> warehouse, = Location.find([('code', '=', 'WH')])
    >>> wip_loc = Location(name="Leg WIP", type='production',
    ...     parent=warehouse)
    >>> wip_loc.save()
    >>> warehouse.production_wip_location = wip_loc
    >>> warehouse.save()

Create products and masters::

    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> ProductTemplate = Model.get('product.template')
    >>> def create_product(name, producible=False, **kwargs):
    ...     template = ProductTemplate(name=name, default_uom=unit,
    ...         type='goods', producible=producible,
    ...         list_price=Decimal(100), account_category=account_category,
    ...         **kwargs)
    ...     template.save()
    ...     product, = template.products
    ...     return product
    >>> valve = create_product("VALVE", producible=True, salable=True,
    ...     supply_on_sale='always')
    >>> core = create_product("323-02275", producible=True, salable=True)
    >>> casting = create_product("Casting")

    >>> BOM = Model.get('production.bom')
    >>> ProductBom = Model.get('product.product-production.bom')
    >>> def create_master(product, revision, component):
    ...     bom = BOM(name=product.template.name, revision=revision)
    ...     _ = bom.inputs.new(product=component, quantity=1)
    ...     _ = bom.outputs.new(product=product, quantity=1)
    ...     bom.save()
    ...     product.boms.append(ProductBom(bom=bom))
    ...     product.save()
    ...     return bom
    >>> core_a = create_master(core, 'A', casting)
    >>> valve_a = create_master(valve, 'A', core)

Sell two valves and a spare core::

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Customer")
    >>> _ = customer.addresses.new()
    >>> customer.save()
    >>> Sale = Model.get('sale.sale')
    >>> def sell(*products):
    ...     sale = Sale(party=customer)
    ...     for product in products:
    ...         line = sale.lines.new()
    ...         line.product = product
    ...         line.quantity = 1
    ...     sale.click('quote')
    ...     sale.click('confirm')
    ...     return sale
    >>> sale1 = sell(valve)
    >>> sale2 = sell(valve, core)

    >>> Production = Model.get('production')
    >>> work_orders = Production.find([], order=[('id', 'ASC')])
    >>> len(work_orders)
    2

Create a Job for the cores::

    >>> create_job = Wizard('production.job.create')
    >>> create_job.form.product = core
    >>> create_job.execute('needs')
    >>> sorted((n.kind, n.quantity) for n in create_job.form.needs)
    [('card', 1.0), ('card', 1.0), ('sale', 1.0)]
    >>> create_job.form.product_bom.bom == core_a
    True
    >>> create_job.form.extra_quantity = 1
    >>> create_job.execute('create_')

    >>> job, = Production.find([('job', '=', True)])
    >>> job.number
    '8780'
    >>> job.quantity
    4.0
    >>> job.bom == core_a
    True
    >>> len(job.job_coverages)
    3
    >>> core_card, = work_orders[0].material_cards
    >>> core_card.supply
    'job'
    >>> core_card.job == job
    True

The covered needs are not proposed again::

    >>> create_job = Wizard('production.job.create')
    >>> create_job.form.product = core
    >>> create_job.execute('needs')
    >>> create_job.form.needs
    []
    >>> create_job.execute('end')

A Job can not feed another Job::

    >>> Coverage = Model.get('production.job.coverage')
    >>> create_job = Wizard('production.job.create')
    >>> create_job.form.product = valve
    >>> create_job.execute('needs')
    >>> create_job.form.needs
    []
    >>> create_job.form.extra_quantity = 1
    >>> create_job.execute('create_')
    >>> other_job, = Production.find([('product', '=', valve.id),
    ...     ('job', '=', True)])
    >>> other_job.number
    '8781'
    >>> card, = other_job.material_cards
    >>> coverage = Coverage(job=job, card=card, quantity=1)
    >>> coverage.save()  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...

Removing a coverage supplies the card from stock again::

    >>> coverage, = [c for c in job.job_coverages if c.card == core_card]
    >>> Coverage.delete([coverage])
    >>> core_card.reload()
    >>> core_card.supply
    'stock'
