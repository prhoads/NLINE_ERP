=============================
N-Line Desk Shop Floor Scenario
=============================

The services behind the Jobshop shop floor screens (UI upgrade phase 5):
the work order's information and costs, labor entry and its reversal,
material issues of a partial quantity, the work order receipt and the
master's cost rollup.

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules(['nline_desk'])
    >>> _ = create_company()
    >>> company = get_company()

Create the valve, its body, a work center and the master with its routing::

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

    >>> WorkCenterCategory = Model.get('production.work.center.category')
    >>> machining = WorkCenterCategory(name="Machining")
    >>> machining.save()
    >>> WorkCenter = Model.get('production.work.center')
    >>> lathe = WorkCenter(name="Lathe", category=machining,
    ...     cost_price=Decimal('30'), cost_method='hour')
    >>> lathe.save()

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
    >>> _ = routing.steps.new(operation=turn)
    >>> routing.save()

Stock the bodies::

    >>> Location = Model.get('stock.location')
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> Inventory = Model.get('stock.inventory')
    >>> inventory = Inventory(location=storage)
    >>> _ = inventory.lines.new(product=body, quantity=10)
    >>> inventory.click('confirm')

The master's cost rollup::

    >>> Desk = Model.get('nline.desk')
    >>> costs = Desk.bom_costs(bom.id, 1, config.context)
    >>> costs['total']
    Decimal('80.00')

Release a work order of 3 valves::

    >>> Production = Model.get('production')
    >>> production = Production(product=valve, bom=bom, routing=routing,
    ...     work_center=lathe, quantity=3)
    >>> production.click('wait')
    >>> [w['id'] for w in Desk.open_work_orders(None, config.context)] == [
    ...     production.id]
    True
    >>> info = Desk.work_order_info(production.id, config.context)
    >>> work, = info['works']
    >>> material, = info['materials']
    >>> material['quantity'], info['costs']['material_estimated']
    (6.0, Decimal('240.00'))

Post 1.5 hours of labor::

    >>> ticket = Desk.labor_entry({'work': work['id'], 'hours': 1.5},
    ...     config.context)
    >>> ticket['cost']
    Decimal('45.0000')
    >>> info = Desk.work_order_info(production.id, config.context)
    >>> info['works'][0]['hours'], info['costs']['labor_actual']
    (1.5, Decimal('45.0000'))

Issue 4 of the 6 bodies::

    >>> issued = Desk.issue_material({'lines': [
    ...         {'move': material['id'], 'quantity': 4}]}, config.context)
    >>> info = Desk.work_order_info(production.id, config.context)
    >>> sorted((m['quantity'], m['state']) for m in info['materials'])
    [(2.0, 'draft'), (4.0, 'done')]

Receive the valves: the work order is done::

    >>> received = Desk.work_order_receive(
    ...     {'production': production.id}, config.context)
    >>> received['state']
    'done'
