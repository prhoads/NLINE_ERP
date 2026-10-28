=================================
N-Line Jobshop Purchasing Scenario
=================================

The services behind the Jobshop Purchasing screens: the Suppliers window
(supplier fields, part prices), Tax Groups, Purchase Orders (status, fixed
charges, taxes, links), Receiving (receipt, fixed charges, price change,
return, cancel) and Request For Quotes (quotes of three suppliers, the
purchase order of the chosen quote).

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

    >>> config = activate_modules(['nline_js_purchasing'])

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> Desk = Model.get('nline.desk')

Create a purchased part::

    >>> ProductCategory = Model.get('product.category')
    >>> category = ProductCategory(name="Castings")
    >>> category.accounting = True
    >>> category.account_expense = accounts['expense']
    >>> category.account_revenue = accounts['revenue']
    >>> category.save()
    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> template = Template(name="Body casting", default_uom=unit,
    ...     type='goods', purchasable=True, list_price=Decimal('0'))
    >>> template.account_category = category
    >>> template.code = '321-00027'
    >>> template.save()
    >>> body, = template.products

A supplier from the Suppliers window: its address, contact and Jobshop
fields::

    >>> Party = Model.get('party.party')
    >>> FOB = Model.get('nline.fob_point')
    >>> fob = FOB(code='ORIGIN', description="Shipping point")
    >>> fob.save()
    >>> foundry = Party(name="Houston Foundry", is_supplier=True)
    >>> foundry.supplier_address_1 = "10700 Corporate Dr"
    >>> foundry.supplier_address_2 = "Unit 118"
    >>> foundry.supplier_city = "Stafford"
    >>> foundry.supplier_postal_code = "77477"
    >>> foundry.supplier_phone = "832-939-4600"
    >>> foundry.supplier_buyer = "AB"
    >>> foundry.supplier_fob_point = fob
    >>> foundry.supplier_freight_terms = 'billed'
    >>> foundry.supplier_specifications = "Certs with each shipment"
    >>> foundry.save()
    >>> foundry.reload()
    >>> address, = foundry.addresses
    >>> address.street
    '10700 Corporate Dr\nUnit 118'
    >>> foundry.supplier_city, foundry.supplier_phone
    ('Stafford', '832-939-4600')
    >>> foundry.supplier_address_2
    'Unit 118'
    >>> defaults = Desk.js_supplier_defaults(foundry.id, config.context)
    >>> defaults['buyer'], defaults['fob_point']['id'] == fob.id
    ('AB', True)

Part prices: a break table and an up-to table::

    >>> price = Desk.js_supplier_price_save({
    ...         'party': foundry.id, 'product': body.id,
    ...         'code': 'WHM-675', 'mfg_name': 'SMALLEY',
    ...         'price_type': 'break', 'quote_date': today,
    ...         'prices': [{'quantity': 0, 'unit_price': '45.00'},
    ...             {'quantity': 10, 'unit_price': '40.00'}],
    ...         }, config.context)
    >>> [p['unit_price'] for p in price['prices']]
    [Decimal('45.00'), Decimal('40.00')]
    >>> quote = Desk.js_supplier_price(foundry.id, body.id, 12, None,
    ...     config.context)
    >>> quote['unit_price'], quote['code'], quote['mfg_name']
    (Decimal('40.00'), 'WHM-675', 'SMALLEY')
    >>> Desk.js_supplier_price(foundry.id, body.id, 3, None,
    ...     config.context)['unit_price']
    Decimal('45.00')

    >>> price = Desk.js_supplier_price_save(dict(price,
    ...         price_type='upto',
    ...         prices=[{'quantity': 5, 'unit_price': '50.00'},
    ...             {'quantity': None, 'unit_price': '42.00'}]),
    ...     config.context)
    >>> Desk.js_supplier_price(foundry.id, body.id, 4, None,
    ...     config.context)['unit_price']
    Decimal('50.00')
    >>> Desk.js_supplier_price(foundry.id, body.id, 8, None,
    ...     config.context)['unit_price']
    Decimal('42.00')

An expired quote is not used::

    >>> price = Desk.js_supplier_price_save(dict(price,
    ...         expiration_date=today - dt.timedelta(days=1)),
    ...     config.context)
    >>> Desk.js_supplier_price(foundry.id, body.id, 8, None,
    ...     config.context)['unit_price']
    >>> price = Desk.js_supplier_price_save(dict(price,
    ...         expiration_date=None), config.context)
    >>> len(Desk.js_supplier_prices(foundry.id, 'part', config.context))
    1

A purchasing tax group of two taxes, one replaced next year::

    >>> group = Desk.js_tax_group_save({
    ...         'name': 'TX', 'description': "Texas",
    ...         'taxes': [
    ...             {'name': 'STATE', 'description': "State tax",
    ...                 'start_date': None, 'percent': '6.25',
    ...                 'account': accounts['tax'].id},
    ...             {'name': 'STATE', 'description': "State tax",
    ...                 'start_date': dt.date(today.year + 1, 1, 1),
    ...                 'percent': '7', 'account': accounts['tax'].id},
    ...             {'name': 'CITY', 'description': "City tax",
    ...                 'start_date': None, 'percent': '1',
    ...                 'account': accounts['tax'].id}],
    ...         }, config.context)
    >>> [(t['name'], t['end_date']) for t in group['taxes']] == [
    ...     ('CITY', None), ('STATE', dt.date(today.year, 12, 31)),
    ...     ('STATE', None)]
    True

A purchase order with a trade discount, a fixed charge and the tax group::

    >>> po = Desk.js_po_save({
    ...         'party': foundry.id, 'purchase_date': today,
    ...         'number': 'PO-7001', 'buyer': 'AB', 'tax_group': group['id'],
    ...         'specifications': "Certs with each shipment",
    ...         'ship_to_name': "Customer site", 'user_2': "10/27/2026",
    ...         'ship_to_mobile': "555-0101", 'ship_to_supplier': "GULF",
    ...         'ship_to_address_no': 2,
    ...         'purchase_from_name': "Foundry sales office",
    ...         'purchase_from_city': "Tulsa",
    ...         'purchase_from_mobile': "555-0199",
    ...         'lines': [{'product': body.id, 'quantity': 10,
    ...             'unit_price': '40.00', 'trade_discount': '10',
    ...             'fixed_charge': '50.00', 'supplier_part_code': 'WHM-675',
    ...             'promise_date': today, 'drawing': '102-00704',
    ...             'drawing_revision': 'C', 'user_0': 'R:\\D\\704_C.pdf',
    ...             'user_1': 'C',
    ...             'links': [{'reference': '2111/1.0-1', 'operation': 20,
    ...                 'quantity': 10}]}],
    ...         }, config.context)
    >>> po['number'], po['jobshop_status'], po['ship_to_name']
    ('PO-7001', 'unreleased', 'Customer site')
    >>> po['user_2']
    '10/27/2026'

The Purchase From tab is the order's own copy of the address; Ship To
has Jobshop's Mobile, Ship To Supplier ID and Address No::

    >>> po['purchase_from']['name'], po['purchase_from']['city']
    ('Foundry sales office', 'Tulsa')
    >>> po['purchase_from_mobile'], po['purchase_from_default']['name']
    ('555-0199', 'Houston Foundry')
    >>> po['ship_to_mobile'], po['ship_to_supplier'], po['ship_to_address_no']
    ('555-0101', 'GULF', 2)
    >>> line, = po['lines']
    >>> line['unit_price'], line['list_unit_price'], line['amount']
    (Decimal('41.0000'), Decimal('40.00'), Decimal('410.00'))
    >>> line['drawing'], line['drawing_revision'], line['user_1']
    ('102-00704', 'C', 'C')
    >>> po['untaxed_amount'], po['tax_amount']
    (Decimal('410.00'), Decimal('29.72'))
    >>> [(k['reference'], k['operation']) for k in line['js_links']]
    [('2111/1.0-1', 20)]
    >>> sorted(t['name'] for t in po['taxes'])
    ['CITY', 'STATE']
    >>> bool(Party(foundry.id).is_supplier)
    True

Hold, firm, then release it::

    >>> po = Desk.js_po_status(po['id'], 'hold', config.context)
    >>> po['jobshop_status']
    'hold'
    >>> po = Desk.js_po_status(po['id'], 'firm', config.context)
    >>> po['jobshop_status'], po['state']
    ('firm', 'quotation')
    >>> po = Desk.js_po_status(po['id'], 'released', config.context)
    >>> po['jobshop_status'], po['statuses']
    ('released', ['closed'])
    >>> [p['number'] for p in Desk.js_supplier_purchases(
    ...     foundry.id, None, config.context)]
    ['PO-7001']

Receiving: the order waits in the Receiving Activity; receive 6 with a
fixed charge::

    >>> activity = Desk.js_receiving_activity('unreceived', None,
    ...     config.context)
    >>> [a['number'] for a in activity]
    ['PO-7001']
    >>> activity[0]['status'], activity[0]['order_date'] == today
    ('released', True)
    >>> receiver = Desk.js_receiver_new(po['id'], config.context)
    >>> rline, = receiver['lines']
    >>> rline['receive_quantity'], rline['unit_price'], rline['discount']
    (10.0, Decimal('40.00'), Decimal('10'))
    >>> rline['user_0'], rline['drawing']
    ('R:\\D\\704_C.pdf', '102-00704')
    >>> rline['receive_quantity'] = 6
    >>> rline['fixed_charge'] = '30.00'
    >>> receiver['supplier_invoice'] = 'INV-55'
    >>> done = Desk.js_receiver_receive(receiver, config.context)
    >>> done['transacted'], done['receiver_status'], done['supplier_invoice']
    (True, 'approved', 'INV-55')
    >>> done['lines'][0]['amount']
    Decimal('246.00')
    >>> Move = Model.get('stock.move')
    >>> Move(done['lines'][0]['move']).unit_price
    Decimal('41.0000')

The other 4 stay on order::

    >>> po = Desk.js_po_get(po['id'], config.context)
    >>> po['lines'][0]['received'], po['jobshop_status']
    (6.0, 'released')
    >>> [(r['kind'], r['status']) for r in po['receivers']]
    [('receipt', 'approved')]

The price of the receiver changes until it is exported::

    >>> done['lines'][0]['unit_price'] = '35.00'
    >>> done['receiver_status'] = 'unapproved'
    >>> done = Desk.js_receiver_save(done, config.context)
    >>> done['receiver_status'], done['lines'][0]['amount']
    ('unapproved', Decimal('219.00'))
    >>> Move(done['lines'][0]['move']).unit_price
    Decimal('36.5000')

Return 2 to the foundry::

    >>> done['lines'][0]['receive_quantity'] = 2
    >>> back = Desk.js_receiver_return({
    ...         'receiver': done['id'], 'received_date': today,
    ...         'reference': 'RMA-3', 'lines': done['lines'],
    ...         }, config.context)
    >>> back['kind'], back['state'], back['lines'][0]['quantity']
    ('return', 'done', 2.0)
    >>> again = Desk.js_receiver_get('receipt', done['id'], config.context)
    >>> again['lines'][0]['returned_quantity']
    2.0

Cancel the receiver: the 4 left go back and are expected again::

    >>> cancelled = Desk.js_receiver_cancel(done['id'], config.context)
    >>> cancelled['receiver_status']
    'cancelled'
    >>> receiver = Desk.js_receiver_new(po['id'], config.context)
    >>> sorted(l['receive_quantity'] for l in receiver['lines'])
    [4.0, 4.0]

Close the order by hand: the rest is not expected::

    >>> po = Desk.js_po_status(po['id'], 'closed', config.context)
    >>> po['jobshop_status']
    'closed'
    >>> Desk.js_receiving_activity('unreceived', None, config.context)
    []

A request for quote to two suppliers, with two quantities::

    >>> mill = Party(name="Gulf Mill", is_supplier=True)
    >>> mill.save()
    >>> rfq = Desk.js_rfq_save({
    ...         'status': 'active', 'due_date': today,
    ...         'supplier_1': foundry.id, 'reference_1': 'Q-1',
    ...         'supplier_2': mill.id,
    ...         'lines': [{'product': body.id, 'line_type': 'part',
    ...             'description': "Body casting", 'unit': unit.id,
    ...             'supplier_code_2': 'GM-27',
    ...             'specifications': "ASTM A216 WCB",
    ...             'prices': [
    ...                 {'quantity': 10, 'unit_price_1': '44.00',
    ...                     'unit_price_2': '39.00', 'fixed_charge_2': '25'},
    ...                 {'quantity': 50, 'unit_price_1': '41.00',
    ...                     'unit_price_2': '37.00'}]}],
    ...         }, config.context)
    >>> rfq['number']
    '00001'
    >>> rline, = rfq['lines']
    >>> [p['amount_2'] for p in rline['prices']]
    [Decimal('415.00'), Decimal('1850.00')]

Update Supplier Pricing from Selected Rows: the mill's quote becomes its
break table::

    >>> updated, = Desk.js_rfq_update_pricing(rfq['id'], 2,
    ...     [p['id'] for p in rline['prices']], config.context)
    >>> updated['code'], [(p['quantity'], p['unit_price'])
    ...     for p in updated['prices']]
    ('GM-27', [(0.0, Decimal('39.00')), (10.0, Decimal('39.00')), (50.0, Decimal('37.00'))])

Order 50 from supplier 2::

    >>> made = Desk.js_rfq_create_po({'rfq': rfq['id'], 'slot': 2,
    ...         'lines': [{'line': rline['id'],
    ...             'price': rline['prices'][1]['id']}]}, config.context)
    >>> made['party']['id'] == mill.id, made['rfq']['id'] == rfq['id']
    (True, True)
    >>> mline, = made['lines']
    >>> mline['quantity'], mline['unit_price'], mline['supplier_part_code']
    (50.0, Decimal('37.0000'), 'GM-27')
    >>> mline['specifications']
    'ASTM A216 WCB'
    >>> rfq = Desk.js_rfq_get(rfq['id'], config.context)
    >>> rfq['status'], rfq['lines'][0]['po_line_exists']
    ('closed', True)

A purchase order not released yet can be deleted::

    >>> Desk.js_po_delete(made['id'], config.context)
    True
    >>> Desk.js_rfq_get(rfq['id'], config.context)['purchases']
    []

Close Short: a partial receipt that closes the line::

    >>> po = Desk.js_po_save({'party': foundry.id, 'purchase_date': today,
    ...         'lines': [{'product': body.id, 'quantity': 10,
    ...             'unit_price': '40.00'}]}, config.context)
    >>> po = Desk.js_po_status(po['id'], 'released', config.context)
    >>> receiver = Desk.js_receiver_new(po['id'], config.context)
    >>> receiver['lines'][0]['receive_quantity'] = 3
    >>> receiver['lines'][0]['close_short'] = True
    >>> done = Desk.js_receiver_receive(receiver, config.context)
    >>> po = Desk.js_po_get(po['id'], config.context)
    >>> po['lines'][0]['received'], po['lines'][0]['line_status']
    (3.0, 'closed')
    >>> Desk.js_receiving_activity('unreceived', None, config.context)
    []

Services: the values of a new one::

    >>> Desk.js_service_defaults(config.context)['type']
    'service'
