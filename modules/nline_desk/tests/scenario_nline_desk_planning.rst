============================
N-Line Desk Planning Scenario
============================

The services behind the Jobshop planning and estimating screens (UI upgrade
phase 6): material planning and its work and purchase orders, the schedule
and the quote costing.

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

    >>> config = activate_modules(['nline_desk'])
    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)

Create the valve, its body bought from a foundry, and the master::

    >>> ProductCategory = Model.get('product.category')
    >>> category = ProductCategory(name="Parts")
    >>> category.accounting = True
    >>> category.account_expense = accounts['expense']
    >>> category.account_revenue = accounts['revenue']
    >>> category.save()
    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> valve_template = Template(name="Valve", default_uom=unit,
    ...     type='goods', producible=True, salable=True,
    ...     list_price=Decimal(900))
    >>> valve_template.account_category = category
    >>> valve_template.save()
    >>> valve, = valve_template.products
    >>> body_template = Template(name="Body", default_uom=unit,
    ...     type='goods', purchasable=True, list_price=Decimal(0))
    >>> body_template.account_category = category
    >>> body, = body_template.products
    >>> body.cost_price = Decimal('40')
    >>> body_template.save()
    >>> body, = body_template.products

    >>> Party = Model.get('party.party')
    >>> foundry = Party(name="Houston Foundry")
    >>> foundry.save()
    >>> ProductSupplier = Model.get('purchase.product_supplier')
    >>> supplier = ProductSupplier(template=body_template, party=foundry)
    >>> supplier.save()

    >>> BOM = Model.get('production.bom')
    >>> bom = BOM(name="Valve")
    >>> _ = bom.inputs.new(product=body, quantity=2)
    >>> _ = bom.outputs.new(product=valve, quantity=1)
    >>> bom.save()
    >>> _ = valve.boms.new(bom=bom)
    >>> valve.save()

    >>> Desk = Model.get('nline.desk')

The quote costs the valve from its master::

    >>> Desk.quote_cost(valve.id, 1, 'master', config.context)
    {'unit_cost': Decimal('80.00'), 'source': 'master'}

Material planning makes a work order of 3 valves: 6 bodies short::

    >>> wo = Desk.plan_work_order({'product': valve.id, 'quantity': 3,
    ...     'date': today + dt.timedelta(days=10)}, config.context)
    >>> plan = Desk.planning(config.context)
    >>> body_need, = [m for m in plan['materials']
    ...     if m['product'] == body.id]
    >>> body_need['required'], body_need['short']
    (6.0, 6.0)

Purchase the shortage from the foundry: a draft purchase order::

    >>> po = Desk.plan_purchase({'product': body.id, 'quantity': 6},
    ...     config.context)
    >>> Purchase = Model.get('purchase.purchase')
    >>> purchase = Purchase(po['purchase'])
    >>> purchase.party == foundry, purchase.lines[0].quantity
    (True, 6.0)

    >>> Purchase.click([purchase], 'quote')
    >>> plan = Desk.planning(config.context)
    >>> [m['short'] for m in plan['materials'] if m['product'] == body.id]
    [0.0]

The schedule shows the work order; move it 2 days::

    >>> schedule = Desk.schedule(None, None, config.context)
    >>> [r['id'] for r in schedule['rows']] == [wo['id']]
    True
    >>> row, = schedule['rows']
    >>> Desk.reschedule({'production': wo['id'],
    ...     'start': row['start'] + dt.timedelta(days=2),
    ...     'end': row['end'] + dt.timedelta(days=2)}, config.context)
    True
    >>> Production = Model.get('production')
    >>> Production(wo['id']).planned_date == row['end'] + dt.timedelta(days=2)
    True
