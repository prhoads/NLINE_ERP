==========================
N-Line Build Tree Scenario
==========================

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model, Report, Wizard
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company

Activate modules::

    >>> config = activate_modules(['nline_build_tree', 'nline_job'])

    >>> _ = create_company()
    >>> company = get_company()

    >>> Location = Model.get('stock.location')
    >>> warehouse, = Location.find([('code', '=', 'WH')])
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> wip_loc = Location(name="Leg WIP", type='production',
    ...     parent=warehouse)
    >>> wip_loc.save()
    >>> warehouse.production_wip_location = wip_loc
    >>> warehouse.save()

Create products and masters::

    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> ProductTemplate = Model.get('product.template')
    >>> def create_product(name, producible=False):
    ...     template = ProductTemplate(name=name, default_uom=unit,
    ...         type='goods', producible=producible, list_price=Decimal(1))
    ...     template.save()
    ...     product, = template.products
    ...     return product
    >>> valve = create_product("VALVE", True)
    >>> body = create_product("332-02000", True)
    >>> casting = create_product("Casting")
    >>> bolt = create_product("Bolt")

    >>> Operation = Model.get('production.routing.operation')
    >>> machine = Operation(name="Machine")
    >>> machine.save()
    >>> assemble = Operation(name="Assemble")
    >>> assemble.save()
    >>> test = Operation(name="Test")
    >>> test.save()
    >>> WorkCenter = Model.get('production.work.center')
    >>> center = WorkCenter(name="Shop")
    >>> center.save()

    >>> BOM = Model.get('production.bom')
    >>> Routing = Model.get('production.routing')
    >>> ProductBom = Model.get('product.product-production.bom')
    >>> def create_master(product, revision, inputs, operations):
    ...     bom = BOM(name=product.template.name, revision=revision)
    ...     for values in inputs:
    ...         _ = bom.inputs.new(**values)
    ...     _ = bom.outputs.new(product=product, quantity=1)
    ...     bom.save()
    ...     routing = Routing(name=product.template.name)
    ...     routing.boms.append(bom)
    ...     for sequence, operation in operations:
    ...         _ = routing.steps.new(operation=operation, sequence=sequence)
    ...     routing.save()
    ...     product.boms.append(ProductBom(bom=bom, routing=routing))
    ...     product.save()
    ...     return bom
    >>> _ = create_master(body, 'B', [{'product': casting, 'quantity': 1}],
    ...     [(10, machine)])
    >>> valve_bom = create_master(valve, 'A', [
    ...         {'product': body, 'quantity': 1, 'operation': 10},
    ...         {'product': bolt, 'quantity': 4, 'operation': 20},
    ...         ], [(10, assemble), (20, test)])

Two bolts are in stock, four are needed::

    >>> Inventory = Model.get('stock.inventory')
    >>> inventory = Inventory(location=storage)
    >>> _ = inventory.lines.new(product=bolt, quantity=2)
    >>> inventory.click('confirm')

Make a work order with a body leg::

    >>> Production = Model.get('production')
    >>> work_order = Production(product=valve, bom=valve_bom, quantity=1,
    ...     work_center=center, number='WO-261400-01')
    >>> work_order.save()
    >>> body_card, bolt_card = work_order.material_cards
    >>> make_leg = Wizard('production.material_card.make_leg', [body_card])
    >>> make_leg.execute('make')
    >>> work_order.click('wait')

The build tree flags the short bolts::

    >>> tree, = Production.get_build_tree([work_order.id], config.context)
    >>> tree['number'], tree['revision'], tree['shortage']
    ('WO-261400-01', 'A', True)
    >>> [(w['sequence'], w['operation']) for w in tree['works']]
    [(10, 'Assemble'), (20, 'Test')]
    >>> [(c['product'], c['supply'], c['short']) for c in tree['cards']]
    [('332-02000', 'leg', False), ('Bolt', 'stock', True)]
    >>> leg = tree['cards'][0]['leg']
    >>> leg['number'], leg['revision'], leg['cards'][0]['product']
    ('WO-261400-01/1', 'B', 'Casting')

Print the traveler, the leg is under the body card after the assembly::

    >>> traveler = Report('production.traveler')
    >>> ext, content, _, name = traveler.execute([work_order])
    >>> ext
    'html'
    >>> content = content.decode() if isinstance(content, bytes) else content
    >>> order = [content.index(t) for t in [
    ...     'Assemble', '332-02000', 'WO-261400-01/1', 'Machine', 'Casting',
    ...     'Test', 'Bolt']]
    >>> order == sorted(order)
    True
    >>> 'SHORT' in content
    True
