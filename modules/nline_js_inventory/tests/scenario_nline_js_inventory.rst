=============================
Jobshop Inventory Scenario
=============================

The services of Jobshop's Inventory windows: Parts (with Jobshop's part
fields), Units of Measure, Unit Conversions, Locations and Adjustments
(adjust in / out, transfers, physical counts).

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

    >>> config = activate_modules(['nline_js_inventory'])

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> Desk = Model.get('nline.desk')
    >>> setup = Desk.inventory_setup(config.context)
    >>> len(setup['user_labels'])
    10

Locations window: two shelves in the warehouse::

    >>> rows = Desk.locations_save({'rows': [
    ...         {'code': 'A1', 'name': 'Shelf A1'},
    ...         {'code': 'B1', 'name': 'Shelf B1'}]}, config.context)
    >>> sorted(r['code'] for r in rows if r['code'] in ('A1', 'B1'))
    ['A1', 'B1']
    >>> shelf_a = [r['id'] for r in rows if r['code'] == 'A1'][0]
    >>> shelf_b = [r['id'] for r in rows if r['code'] == 'B1'][0]
    >>> Desk.locations_save({'rows': [{'code': 'A1', 'name': 'Again'}]},
    ...     config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...

Units of Measure window: a box, in a category of its own::

    >>> units = Desk.units_save({'rows': [
    ...         {'symbol': 'BOX', 'name': 'Box', 'digits': 0}]},
    ...     config.context)
    >>> box, = [u for u in units if u['symbol'] == 'BOX']
    >>> box['digits'], box['category']['rec_name']
    (0, 'Box')
    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])

A part with Jobshop's fields::

    >>> Common = Model.get('nline.commodity_code')
    >>> steel = Common(code='SS', description="Stainless")
    >>> steel.save()
    >>> ProductCategory = Model.get('product.category')
    >>> category = ProductCategory(name="Parts")
    >>> category.accounting = True
    >>> category.account_expense = accounts['expense']
    >>> category.account_revenue = accounts['revenue']
    >>> category.save()
    >>> Party = Model.get('party.party')
    >>> supplier = Party(name="Bolt Supply")
    >>> supplier.save()
    >>> Template = Model.get('product.template')
    >>> bolt = Template(name="Bolt, SS, 1/2", default_uom=unit,
    ...     type='goods', purchasable=True, salable=True,
    ...     list_price=Decimal('2'), cost_price_method='average')
    >>> bolt.code = '321-BOLT'
    >>> bolt.account_category = category
    >>> bolt.commodity_code = steel
    >>> bolt.stocked = True
    >>> bolt.order_point = 50
    >>> bolt.mfg_name = "Fastenal"
    >>> bolt.unit_material_cost = Decimal('1.20')
    >>> bolt.unit_burden_cost = Decimal('0.05')
    >>> bolt.primary_location = Model.get('stock.location')(shelf_a)
    >>> bolt.specifications = "Material, UNS S31600"
    >>> bolt.save()
    >>> bolt.unit_cost
    Decimal('1.2500')
    >>> bolt.inactive
    False
    >>> bolt.preferred_supplier = supplier
    >>> bolt.save()
    >>> bolt.reload()
    >>> bolt.preferred_supplier == supplier
    True
    >>> part, = bolt.products

The Part ID is unique::

    >>> other = Template(name="Other bolt", default_uom=unit, type='goods')
    >>> other.code = '321-BOLT'
    >>> other.save()  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...

Unit Conversions: a box of this part holds 10::

    >>> rows = Desk.conversions_save({'template': bolt.id, 'rows': [
    ...         {'from_uom': box['id'], 'to_uom': unit.id, 'factor': 10}]},
    ...     config.context)
    >>> rows[0]['sentence']
    '1 BOX = 10 u'
    >>> Desk.unit_convert(2, box['id'], unit.id, bolt.id, config.context)
    20.0
    >>> Desk.unit_convert(30, unit.id, box['id'], bolt.id, config.context)
    3.0
    >>> Desk.unit_convert(2, box['id'], unit.id, None, config.context)

Adjust parts in at value and out::

    >>> entries = Desk.adjustments_post({'lines': [
    ...         {'type': 'in', 'template': bolt.id, 'quantity': 10,
    ...             'location': shelf_a, 'material': '1.50'}]},
    ...     config.context)
    >>> len(entries)
    1
    >>> part.reload()
    >>> part.cost_price
    Decimal('1.5000')
    >>> stock = Desk.location_stock(bolt.id, None, config.context)
    >>> [(s['location'] == shelf_a, s['quantity']) for s in stock]
    [(True, 10.0)]
    >>> _ = Desk.adjustments_post({'lines': [
    ...         {'type': 'out', 'template': bolt.id, 'quantity': 3,
    ...             'location': shelf_a}]}, config.context)
    >>> Desk.adjustments_post({'lines': [
    ...         {'type': 'out', 'template': bolt.id, 'quantity': 100,
    ...             'location': shelf_a}]},
    ...     config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...
    >>> [(h['type'], h['quantity']) for h in Desk.adjustments_history(
    ...         'adjustment', 10, config.context)]
    [('Adjust Out', 3.0), ('Adjust In', 10.0)]

The part is now in shelf A1 (its Locations tab)::

    >>> bolt.reload()
    >>> [(l.location.code, l.quantity, l.primary) for l in
    ...     bolt.part_locations]
    [('A1', 7.0, True)]

Lot Tracked needs the part with nothing on hand::

    >>> bolt.lot_tracked = True
    >>> bolt.save()  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...
    >>> bolt.reload()

Transfer two to shelf B1::

    >>> _ = Desk.transfers_post({'lines': [
    ...         {'template': bolt.id, 'quantity': 2, 'location': shelf_a,
    ...             'to_location': shelf_b}]}, config.context)
    >>> sorted((s['location'] == shelf_b, s['quantity'])
    ...     for s in Desk.location_stock(bolt.id, None, config.context))
    [(False, 5.0), (True, 2.0)]
    >>> pieces = Desk.inventory_pieces(bolt.id, config.context)
    >>> sorted(r['quantity'] for r in pieces['rows'])
    [2.0, 5.0]
    >>> txs = Desk.inventory_transactions(bolt.id, None, 50, config.context)
    >>> [t['class'] for t in txs]
    ['TRANSFER', 'ADJUSTMENT', 'ADJUSTMENT']

Physical count: shelf A1 counts 4 (one is missing)::

    >>> sheet = Desk.count_sheet({'location_from': 'A1',
    ...         'location_to': 'A1'}, config.context)
    >>> [(r['part'], r['on_hand'], r['count']) for r in sheet]
    [('321-BOLT', 5.0, 5.0)]
    >>> line = dict(sheet[0], count=4)
    >>> result = Desk.count_save({'lines': [line], 'adjust': False},
    ...     config.context)
    >>> result['adjusted']
    False
    >>> [r['count'] for r in Desk.count_sheet({'location_from': 'A1',
    ...         'location_to': 'A1'}, config.context)]
    [4.0]
    >>> result = Desk.count_save({'lines': [line], 'adjust': True},
    ...     config.context)
    >>> result['adjusted'], result['moves']
    (True, 1)
    >>> [s['quantity'] for s in Desk.location_stock(bolt.id, shelf_a,
    ...         config.context)]
    [4.0]

Where used, supply and demand::

    >>> valve_template = Template(name="Valve", default_uom=unit,
    ...     type='goods', producible=True, salable=True,
    ...     list_price=Decimal('100'))
    >>> valve_template.account_category = category
    >>> valve_template.save()
    >>> valve, = valve_template.products
    >>> BOM = Model.get('production.bom')
    >>> bom = BOM(name="Valve")
    >>> _ = bom.inputs.new(product=part, quantity=4)
    >>> _ = bom.outputs.new(product=valve, quantity=1)
    >>> bom.save()
    >>> [w['type'] for w in Desk.part_where_used(bolt.id, True, True,
    ...         config.context)]
    ['Eng Master']

    >>> Production = Model.get('production')
    >>> production = Production(product=valve, bom=bom, quantity=2)
    >>> production.save()
    >>> [w['type'] for w in Desk.part_where_used(bolt.id, False, True,
    ...         config.context)]
    ['Work Order']

    >>> customer = Party(name="Refinery")
    >>> customer.save()
    >>> Sale = Model.get('sale.sale')
    >>> sale = Sale(party=customer)
    >>> sale_line = sale.lines.new(product=part, quantity=6)
    >>> sale_line.unit_price = Decimal('2')
    >>> sale.click('quote')
    >>> sale.click('confirm')
    >>> [(r['number'] == sale.number, r['quantity'], r['status'])
    ...     for r in Desk.part_orders(bolt.id, 'sale', None, config.context)]
    [(True, 6.0, 'Released')]
    >>> Desk.part_orders(bolt.id, 'sale', ['closed'], config.context)
    []
    >>> sd = Desk.part_supply_demand(bolt.id, config.context)
    >>> [r['demand'] for r in sd['sales']], [r['demand'] for r in
    ...     sd['work_orders']]
    ([6.0], [8.0])
    >>> availability = Desk.part_availability(bolt.id, config.context)
    >>> availability['on_hand'], availability['demand'], \
    ...     availability['projected'], availability['below_order_point']
    (6.0, 14.0, -8.0, True)

Reset material costs of the open work orders::

    >>> result = Desk.reset_material_costs({'template': bolt.id,
    ...         'statuses': ['all']}, config.context)
    >>> result['materials']
    1

Copy to a new Part ID, delete the copy, not the used part::

    >>> new_id = Desk.part_copy(bolt.id, '321-BOLT-2', config.context)
    >>> copy = Template(new_id)
    >>> copy.code, copy.mfg_name, len(copy.unit_conversions), \
    ...     len(copy.part_locations)
    ('321-BOLT-2', 'Fastenal', 1, 0)
    >>> Desk.part_delete(new_id, config.context)
    True
    >>> Desk.part_delete(bolt.id,
    ...     config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...

A unit in use is not deleted::

    >>> Desk.units_save({'rows': [], 'deleted': [unit.id]},
    ...     config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...

The Jobshop data (migration/jobshop/inventory.py) from a stand-in Jobshop::

    >>> import importlib.util, os
    >>> root = os.environ.get('NLINE_ERP_ROOT', 'M:/NLINE_ERP')
    >>> spec = importlib.util.spec_from_file_location('js_inventory',
    ...     os.path.join(root, 'migration', 'jobshop', 'inventory.py'))
    >>> js_inventory = importlib.util.module_from_spec(spec)
    >>> spec.loader.exec_module(js_inventory)

    >>> class Jobshop:
    ...     tables = [
    ...         ('INVENTORY_OBJECT_GLOBAL', [{'USER_0': 'Eng Parts List',
    ...             'USER_1': 'Part Number Rev'}]),
    ...         ('select distinct', []),
    ...         ('INVENTORY_UNITS_CONVERSION', [{'PART_ID': '321-BOLT',
    ...             'FROM_UNIT_ID': 'PK', 'TO_UNIT_ID': 'EA',
    ...             'CONVERSION': 12}, {'PART_ID': None,
    ...             'FROM_UNIT_ID': 'IN', 'TO_UNIT_ID': 'FT',
    ...             'CONVERSION': 0.0833333}]),
    ...         ('INVENTORY_UNIT', [
    ...             {'ID': 'EA', 'DESCRIPTION': 'EACH', 'UNIT_SCALE': 0},
    ...             {'ID': 'IN', 'DESCRIPTION': 'INCH', 'UNIT_SCALE': 4},
    ...             {'ID': 'FT', 'DESCRIPTION': 'FEET', 'UNIT_SCALE': 0},
    ...             {'ID': 'PK', 'DESCRIPTION': 'Pack', 'UNIT_SCALE': 0},
    ...             {'ID': 'e', 'DESCRIPTION': None, 'UNIT_SCALE': 0}]),
    ...         ('INVENTORY_LOCATION', [
    ...             {'ID': 'A1', 'DESCRIPTION': 'General Shop Location',
    ...                 'INACTIVE': 0},
    ...             {'ID': 'C2', 'DESCRIPTION': 'Pallet Rack',
    ...                 'INACTIVE': 0},
    ...             {'ID': 'BP', 'DESCRIPTION': 'DO NOT USE',
    ...                 'INACTIVE': -1}]),
    ...         ('INVENTORY_PART_LOCATION', [{'PART_ID': '321-BOLT',
    ...             'LOCATION_ID': 'C2', 'QTY_ON_HAND': 5, 'HOLD': -1,
    ...             'LAST_COUNTED': None}]),
    ...         ('INVENTORY_PART', [{'ID': '321-BOLT', 'STOCKED': -1,
    ...             'PRODUCT_CODE': 'FAST', 'COMMODITY_CODE': 'SS',
    ...             'WEIGHT': 0.25, 'WEIGHT_UM': 'LBS', 'MFG_NAME': 'Vesta',
    ...             'MFG_PART_ID': 'BV10', 'SPECIFICATIONS': 'UNS S31600',
    ...             'PRIMARY_LOC_ID': 'C2', 'AUTOISSUE_LOC_ID': None,
    ...             'PLANNING_LEADTIME': 14, 'ORDER_POINT': 20,
    ...             'SAFETY_STOCK_QTY': 5, 'UNIT_MAT_COST': 1.1,
    ...             'UNIT_BUR_COST': 0.1, 'USER_0': 'R:/list.pdf',
    ...             'USER_1': 'B', 'INACTIVE': 0,
    ...             'NOTES': 'Unit cost updated by receiver 02558'}]),
    ...         ]
    ...     def rows(self, sql, *params):
    ...         for name, rows in self.tables:
    ...             if name in sql:
    ...                 return rows
    ...         return []
    >>> class Migration:
    ...     js = Jobshop()
    ...     context = config.context
    ...     products = {}
    ...     sample = False
    ...     counts = {}
    ...     def get(self, name):
    ...         return Model.get(name)
    ...     def count(self, what, n=1):
    ...         self.counts[what] = self.counts.get(what, 0) + n
    ...     def js_party(self, kind, jobshop_id):
    ...         return None
    >>> m = Migration()
    >>> import contextlib, io
    >>> with contextlib.redirect_stdout(io.StringIO()):
    ...     js_inventory.run(m)

It can be run again::

    >>> with contextlib.redirect_stdout(io.StringIO()):
    ...     js_inventory.run(m)

    >>> bolt.reload()
    >>> bolt.primary_location.code, bolt.mfg_name, bolt.order_point, \
    ...     bolt.lead_time_days, bolt.product_code.code, bolt.user_1
    ('C2', 'Vesta', 20.0, 14, 'FAST', 'B')
    >>> bolt.unit_cost
    Decimal('1.2000')
    >>> sorted((l.location.code, bool(l.hold)) for l in bolt.part_locations)
    [('A1', False), ('B1', False), ('C2', True)]
    >>> sorted(c.sentence for c in bolt.unit_conversions)
    ['1 BOX = 10 u', '1 PK = 12 u']
    >>> Conversion = Model.get('nline.js.unit_conversion')
    >>> [c.sentence for c in Conversion.find([('template', '=', None)])]
    ['1 in = 0.0833333 ft']
    >>> Location = Model.get('stock.location')
    >>> bp, = Location.find([('code', '=', 'BP'),
    ...     ('active', 'in', [True, False])])
    >>> bool(bp.active)
    False
    >>> len(Uom.find([('symbol', '=', 'PK')])), \
    ...     len(Uom.find([('symbol', '=', 'e')]))
    (1, 0)
    >>> Desk.inventory_setup(config.context)['user_labels'][:3]
    ['Eng Parts List', 'Part Number Rev', 'User Defined 3']
    >>> Note = Model.get('ir.note')
    >>> len(Note.find([('resource', '=', 'product.template,%s' % bolt.id)]))
    1
