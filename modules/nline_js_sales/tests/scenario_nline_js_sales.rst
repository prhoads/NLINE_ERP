=========================
N-Line Jobshop Sales Scenario
=========================

The models and services of the Jobshop Sales windows: the code tables, the
customer's Jobshop fields and prices, the Sales Order window (Details,
Charges, Taxes, statuses, copy, delete), Shipping (back orders, returns) and
Invoicing (charges, credit memos).

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

    >>> config = activate_modules(['nline_js_sales'])

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> Desk = Model.get('nline.desk')

The code tables::

    >>> SalesRep = Model.get('nline.sales_rep')
    >>> rep = SalesRep(code='KC', description="Keith Chalk")
    >>> rep.save()
    >>> rep.rec_name
    'KC - Keith Chalk'
    >>> Territory = Model.get('nline.territory')
    >>> territory = Territory(code='BRAZIL', description="Flavio Fuentes")
    >>> territory.save()
    >>> Carrier = Model.get('nline.carrier')
    >>> carrier = Carrier(code='OLD DOMINION', description="Old Dominion",
    ...     route="I-10", cod_charge=Decimal('25'))
    >>> carrier.save()
    >>> Sic = Model.get('nline.sic_code')
    >>> sic = Sic(code='3491', description="Industrial valves")
    >>> sic.save()
    >>> ServiceCharge = Model.get('nline.service_charge')
    >>> crating = ServiceCharge(code='CRATING', description="Crating charges",
    ...     amount=Decimal('250.00'), account=accounts['revenue'])
    >>> crating.save()
    >>> FOB = Model.get('nline.fob_point')
    >>> fob = FOB(code='EX WORKS', description="Ex Works N-Line plant")
    >>> fob.save()

A tax group is kept as Tryton taxes::

    >>> TaxGroup = Model.get('nline.sales_tax_group')
    >>> group = TaxGroup(code='TX', description="Texas")
    >>> tax_line = group.lines.new(tax_name='STATE', description="TX state",
    ...     percent=Decimal('6.25'), account=accounts['tax'])
    >>> group.save()
    >>> tax_line, = group.lines
    >>> tax_line.tax.rate
    Decimal('0.0625')
    >>> tax_line.percent = Decimal('8.25')
    >>> tax_line.save()
    >>> tax_line.tax.reload()
    >>> tax_line.tax.rate
    Decimal('0.0825')

A discount class::

    >>> DiscountClass = Model.get('nline.discount_class')
    >>> distributors = DiscountClass(code='DIST', description="Distributors",
    ...     discount_percent=Decimal('10'))
    >>> distributors.save()

A valve::

    >>> ProductCategory = Model.get('product.category')
    >>> category = ProductCategory(name="Valves")
    >>> category.accounting = True
    >>> category.account_expense = accounts['expense']
    >>> category.account_revenue = accounts['revenue']
    >>> category.save()
    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> template = Template(name="Valve 2in", default_uom=unit, type='goods',
    ...     salable=True, list_price=Decimal('1000'))
    >>> template.account_category = category
    >>> template.save()
    >>> valve, = template.products
    >>> plug_template = Template(name="Plug", default_uom=unit,
    ...     type='goods', salable=True, list_price=Decimal('40'))
    >>> plug_template.account_category = category
    >>> plug_template.save()
    >>> plug, = plug_template.products

A customer with its Jobshop details, main address and price breaks::

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Refinery Supply")
    >>> customer.sales_rep = rep
    >>> customer.territory = territory
    >>> customer.carrier = carrier
    >>> customer.customer_sic_code = sic
    >>> customer.customer_fob_point = fob
    >>> customer.customer_tax_group = group
    >>> customer.customer_freight_terms = 'prepaid'
    >>> customer.discount_class = distributors
    >>> customer.sales_instructions = "Hydrotest every valve"
    >>> customer.save()
    >>> customer.credit_status, customer.customer_open_date == today
    ('approved', True)
    >>> customer.sold_to_street = "5901 Arcturus Road"
    >>> customer.sold_to_city = "Oxnard"
    >>> customer.save()
    >>> address, = customer.addresses
    >>> address.street, address.city
    ('5901 Arcturus Road', 'Oxnard')
    >>> Price = Model.get('nline.sale_price')
    >>> price = Price(party=customer, product=valve, customer_part='RS-V2')
    >>> _ = price.breaks.new(quantity=1, unit_price=Decimal('950'))
    >>> _ = price.breaks.new(quantity=10, unit_price=Decimal('900'))
    >>> price.save()

Reset unit price from customer: the customer's table, then the class::

    >>> result = Desk.sales_price(customer.id, valve.id, 12, today,
    ...     config.context)
    >>> result['gross_unit_price'] == Decimal('900'), result['customer_part']
    (True, 'RS-V2')
    >>> result['trade_discount'] == 0, result['source']
    (True, 'customer')
    >>> result = Desk.sales_price(customer.id, plug.id, 1, today,
    ...     config.context)
    >>> (result['gross_unit_price'] == Decimal('40'),
    ...     result['trade_discount'] == Decimal('10'), result['source'])
    (True, True, 'discount_class')

The order's Details come from the customer::

    >>> defaults = Desk.sales_order_defaults(customer.id, config.context)
    >>> defaults['sales_rep']['id'] == rep.id, defaults['freight_terms']
    (True, 'prepaid')
    >>> defaults['js_specs']
    'Hydrotest every valve'

Enter a sales order with a discount, a charge and the tax group::

    >>> order = Desk.sale_order_save({
    ...         'party': customer.id, 'sale_date': today, 'number': 'SO-1001',
    ...         'reference': 'PO-77', 'shipping_date': today,
    ...         'sales_rep': rep.id, 'js_carrier': carrier.id,
    ...         'tax_group': group.id, 'freight_terms': 'prepaid',
    ...         'js_specs': "Hydrotest every valve",
    ...         'lines': [
    ...             {'product': valve.id, 'quantity': 4,
    ...                 'gross_unit_price': '1000', 'trade_discount': '10',
    ...                 'customer_part': 'RS-V2', 'promise_date': today},
    ...             {'product': plug.id, 'quantity': 2,
    ...                 'gross_unit_price': '40', 'trade_discount': '0'}],
    ...         'charges': [{'service_charge': crating.id,
    ...                 'amount': '250.00', 'apply': True}],
    ...         }, config.context)
    >>> order['number'], order['js_status'], float(order['total_amount'])
    ('SO-1001', 'unreleased', 3983.6)
    >>> [(l['line_no'], float(l['gross_unit_price']),
    ...     float(l['trade_discount'])) for l in order['lines']]
    [(1, 1000.0, 10.0), (2, 40.0, 0.0)]
    >>> float(order['order_amount']), order['charges'][0]['description']
    (4233.6, 'Crating charges')
    >>> [(t['tax_group'], t['tax_name'], float(t['amount']))
    ...     for t in order['taxes']]
    [('TX', 'STATE', 303.6)]

The order limit asks to accept the order::

    >>> customer.credit_limit = Decimal('1000')
    >>> customer.save()
    >>> Desk.sale_order_save({  # doctest: +IGNORE_EXCEPTION_DETAIL
    ...         'party': customer.id, 'lines': [{'product': valve.id,
    ...             'quantity': 2, 'unit_price': '1000'}],
    ...         }, config.context)
    Traceback (most recent call last):
        ...
    UserWarning: ...
    >>> customer.credit_limit = Decimal('0')
    >>> customer.save()

The Order Line window's fields, the header's Jobshop data and the
customer's contact fields::

    >>> line1 = order['lines'][0]
    >>> order = Desk.sale_order_save({'id': order['id'],
    ...         'party': customer.id, 'reference': 'PO-77',
    ...         'sale_date': today, 'shipping_date': today,
    ...         'lines': [dict(line1,
    ...             product=valve.id, gross_unit_price='1000',
    ...             trade_discount='10', drawing_id='331-00163',
    ...             drawing_rev='F', user_0='R:\\331-00163_F.pdf',
    ...             js_desired_date=today + dt.timedelta(days=30),
    ...             commissionable=False),
    ...             dict(order['lines'][1], product=plug.id,
    ...                 gross_unit_price='40', trade_discount='0')],
    ...         'charges': order['charges']}, config.context)
    >>> l = order['lines'][0]
    >>> l['drawing_id'], l['drawing_rev'], l['user_0'], l['commissionable']
    ('331-00163', 'F', 'R:\\331-00163_F.pdf', False)
    >>> l['js_desired_date'] == today + dt.timedelta(days=30)
    True
    >>> bool(order['created_by']), order['customer_name']
    (True, 'Refinery Supply')
    >>> Desk.sales_order_printed(order['id'], config.context)
    True

The order's own Sold To / Ship To, Copy Notes to Shipper and the line's
commission percent and ship via::

    >>> order = Desk.sale_order_save({'id': order['id'],
    ...         'party': customer.id, 'reference': 'PO-77',
    ...         'sale_date': today, 'shipping_date': today,
    ...         'js_sold_name': 'Refinery Supply', 'js_sold_city': 'Houston',
    ...         'js_ship_name': 'Plant 2', 'js_ship_contact': 'J. Doe',
    ...         'js_copy_notes': True,
    ...         'lines': [dict(l, product=valve.id, gross_unit_price='1000',
    ...                 trade_discount='10', commission_percent='2.5',
    ...                 js_ship_via=None),
    ...             dict(order['lines'][1], product=plug.id,
    ...                 gross_unit_price='40', trade_discount='0')],
    ...         'charges': order['charges']}, config.context)
    >>> order['js_sold_city'], order['js_ship_name'], order['js_copy_notes']
    ('Houston', 'Plant 2', True)
    >>> float(order['lines'][0]['commission_percent'])
    2.5

A line left out of a draft order is deleted (the modern page's Remove)::

    >>> scratch = Desk.sale_order_save({'party': customer.id, 'lines': [
    ...         {'product': plug.id, 'quantity': 1, 'gross_unit_price': '40'},
    ...         {'product': plug.id, 'quantity': 2, 'gross_unit_price': '40'}],
    ...         }, config.context)
    >>> scratch = Desk.sale_order_save({'id': scratch['id'],
    ...         'party': customer.id, 'lines': [dict(scratch['lines'][1],
    ...             product=plug.id)]}, config.context)
    >>> [l['quantity'] for l in scratch['lines']]
    [2.0]
    >>> _ = Desk.sales_order_delete(scratch['id'], config.context)
    >>> order['lines'][0]['quotes_exist'], order['payment_term_descr'] != None
    (False, True)
    >>> Note = Model.get('ir.note')
    >>> note = Note(resource=Model.get('sale.sale')(order['id']),
    ...     message='Crate')
    >>> note.save()
    >>> Desk.sale_order_get(order['id'], config.context)['js_printed_date'] == today
    True
    >>> customer.customer_phone = '713-555-0100'
    >>> customer.customer_mobile = '713-555-0101'
    >>> customer.customer_exported = True
    >>> customer.save()
    >>> customer.reload()
    >>> customer.customer_phone, customer.customer_exported_date == today
    ('713-555-0100', True)
    >>> sorted(m.type for m in customer.contact_mechanisms)
    ['mobile', 'phone']
    >>> customer.sold_to_address_1 = '1 Main St'
    >>> customer.sold_to_address_2 = 'Suite 2'
    >>> customer.save()
    >>> customer.reload()
    >>> customer.sold_to_street.splitlines(), customer.sold_to_address_2
    (['1 Main St', 'Suite 2'], 'Suite 2')
    >>> rows = Desk.sales_order_lines({'party': customer.id}, config.context)
    >>> [r['line_no'] for r in rows]
    [1, 2]
    >>> len(Desk.sales_order_lines({'product': plug.id,
    ...     'statuses': ['closed']}, config.context))
    0
    >>> rep.reload()
    >>> rep.inactive
    False

Copy it into a new order, then delete the copy::

    >>> copy = Desk.sales_order_copy(order['id'], 'order', config.context)
    >>> copy['id'] != order['id'], len(copy['lines']), copy['js_status']
    (True, 2, 'unreleased')
    >>> Desk.sales_order_delete(copy['id'], config.context)
    True

Change the status: firm, hold, released::

    >>> Desk.sales_order_status(order['id'], 'firm', config.context)['js_status']
    'firm'
    >>> Desk.sales_order_status(order['id'], 'hold', config.context)['js_status']
    'hold'
    >>> order = Desk.sales_order_status(order['id'], 'released',
    ...     config.context)
    >>> order['js_status']
    'released'
    >>> Sale = Model.get('sale.sale')
    >>> sale = Sale(order['id'])
    >>> len(Sale.find([('js_status', '=', 'released')]))
    1

The charge went on the invoice made when the order was released::

    >>> invoice, = sale.invoices
    >>> sorted(l.description or l.product.rec_name for l in invoice.lines)
    ['Crating charges', 'Plug', 'Valve 2in']
    >>> sale.charges[0].invoice == invoice
    True

Ship 3 of the 4 valves: the rest is back ordered::

    >>> activity = Desk.sales_shipping_activity(False, config.context)
    >>> shipper_row, = activity
    >>> shipper_row['sales'][0]['number'], shipper_row['reference']
    ('SO-1001', 'PO-77')
    >>> shipper = Desk.sales_shipper_get(shipper_row['id'],
    ...     'stock.shipment.out', config.context)
    >>> shipper['js_carrier']['id'] == carrier.id
    True
    >>> valve_line, = [l for l in shipper['lines']
    ...     if l['product']['id'] == valve.id]
    >>> shipper = Desk.sales_ship({'id': shipper['id'],
    ...         'lines': [{'move': valve_line['move'], 'quantity': 3}],
    ...         'js_tracking_number': '1Z999', 'ship': True,
    ...         }, config.context)
    >>> shipper['state'], shipper['js_tracking_number']
    ('done', '1Z999')
    >>> [n.message for n in Note.find([('resource', '=',
    ...     'stock.shipment.out,%s' % shipper['id'])])]
    ['Crate']
    >>> 'ship_via' in shipper['lines'][0], 'customer_code' in shipper
    (True, True)
    >>> order = Desk.sale_order_get(order['id'], config.context)
    >>> [(l['shipped_quantity'], l['js_line_status']) for l in order['lines']]
    [(3.0, 'open'), (2.0, 'closed')]
    >>> backorder, = Desk.sales_shipping_activity(False, config.context)
    >>> [l['quantity'] for l in Desk.sales_shipper_get(backorder['id'],
    ...     'stock.shipment.out', config.context)['lines']]
    [1.0]

The activity's "Some Can Ship", the shipper's Jobshop status and the
Shippers/Invoices tab::

    >>> rows = Desk.sales_shipping_activity(False, None, False,
    ...     config.context)
    >>> 'some_can_ship' in rows[0], rows[0]['carrier']
    (True, 'OLD DOMINION')
    >>> done = Desk.sales_shipper_get(shipper['id'], 'stock.shipment.out',
    ...     config.context)
    >>> done['js_shipper_status'], 'could_ship' in done['lines'][0]
    ('unapproved', True)
    >>> sorted({d['type'] for d in order['shippers']} & {'Shipment'})
    ['Shipment']
    >>> lines = Desk.sales_shipper_lines(order['id'], None, config.context)
    >>> sorted(l['quantity'] for l in lines)
    [1.0, 2.0, 3.0]
    >>> len(Desk.sales_shipper_browse(None, config.context)) >= 2
    True

Close short the back order: the last valve is not shipped, the line closes::

    >>> backorder = Desk.sales_shipper_get(backorder['id'],
    ...     'stock.shipment.out', config.context)
    >>> move = backorder['lines'][0]['move']
    >>> closed = Desk.sales_ship({'id': backorder['id'], 'ship': False,
    ...         'lines': [{'move': move, 'quantity': 1,
    ...             'close_short': True}]}, config.context)
    >>> order = Desk.sale_order_get(order['id'], config.context)
    >>> order['lines'][0]['js_line_status']
    'closed'

Return one valve: a return order, its return shipper and credit memo::

    >>> valve_order_line = order['lines'][0]
    >>> returned = Desk.sales_return({'sale': order['id'],
    ...         'lines': [{'line': valve_order_line['id'], 'quantity': 1}],
    ...         }, config.context)
    >>> return_shipper, = returned['returns']
    >>> received = Desk.sales_return_receive(return_shipper['id'],
    ...     config.context)
    >>> received['state']
    'done'
    >>> order = Desk.sale_order_get(order['id'], config.context)
    >>> order['lines'][0]['shipped_quantity']
    2.0

Invoicing: the drafts wait, a charge is added, the invoice is posted::

    >>> rows = Desk.sales_invoicing_activity(config.context)
    >>> sorted(r['type'] for r in rows)
    ['Return', 'Shipment']
    >>> row, = [r for r in rows if r['type'] == 'Shipment']
    >>> data = Desk.sales_invoice_get(row['id'], config.context)
    >>> [c['description'] for c in data['charges']]
    ['Crating charges']
    >>> data = Desk.sales_invoice_save({'id': row['id'],
    ...         'invoice_date': today, 'comment': "Certificates attached",
    ...         'charges': data['charges'] + [{'service_charge': crating.id,
    ...                 'description': "Extra crate", 'amount': '100.00'}],
    ...         }, config.context)
    >>> sorted(float(c['amount']) for c in data['charges'])
    [100.0, 250.0]
    >>> data['comment']
    'Certificates attached'
    >>> Invoice = Model.get('account.invoice')
    >>> invoice = Invoice(row['id'])
    >>> invoice.click('post')
    >>> invoice.state
    'posted'
    >>> Desk.sales_invoice_printed([invoice.id], config.context)
    True
    >>> data = Desk.sales_invoice_get(invoice.id, config.context)
    >>> data['js_printed_date'] == today, data['exported']
    (True, True)
    >>> data['customer_code'] == (customer.code or '')
    True

The order's tracker amounts (the modern page): invoiced, not paid yet::

    >>> order = Desk.sale_order_get(order['id'], config.context)
    >>> order['invoiced_amount'] == invoice.total_amount
    True
    >>> order['paid_amount'] == 0, isinstance(order['draft_invoices'], list)
    (True, True)
    >>> done = Desk.sales_shipper_get(shipper['id'], 'stock.shipment.out',
    ...     config.context)
    >>> done['credit_status'] == customer.credit_status, done['sales_hold']
    (True, False)

Issue a credit memo for it::

    >>> memo = Desk.sales_credit_memo(invoice.id, config.context)
    >>> memo['state'], memo['total_amount'] == -invoice.total_amount
    ('draft', True)

Import the Jobshop data (migration/jobshop/sales.py) from rows read as
Jobshop gives them, twice: the second run makes nothing new::

    >>> import contextlib, importlib, io, os, re, sys
    >>> sys.path.insert(0, os.environ.get('NLINE_MIGRATION',
    ...     r'M:\NLINE_ERP\migration'))
    >>> js_sales = importlib.import_module('jobshop.sales')
    >>> class Row(dict):
    ...     def __missing__(self, key):
    ...         return None
    >>> class Jobshop:
    ...     def __init__(self, tables):
    ...         self.tables = tables
    ...     def rows(self, sql, *params):
    ...         table = re.search(r'from (\w+)', sql).group(1)
    ...         return [Row(r) for r in self.tables.get(table, [])]
    >>> class Migration:
    ...     sample = False
    ...     def __init__(self, tables):
    ...         self.js = Jobshop(tables)
    ...         self.counts = {}
    ...         self.party_by_js = {}
    ...         self.context = config.context
    ...     def get(self, name):
    ...         return Model.get(name)
    ...     def count(self, what, n=1):
    ...         self.counts[what] = self.counts.get(what, 0) + n
    ...     def account(self, code):
    ...         return None
    ...     def product(self, code):
    ...         return None
    >>> tables = {
    ...     'SALES_SALESREP': [
    ...         {'ID': 'KC', 'NAME': 'KEITH CHALK', 'COMMISSION': 0,
    ...             'INACTIVE': 0},
    ...         {'ID': 'SK', 'NAME': 'SK WONG', 'COMMISSION': 0,
    ...             'INACTIVE': -1}],
    ...     'SALES_TERRITORY': [{'ID': 'AUSTRALIA',
    ...         'DESCRIPTION': 'UPSTREAM', 'INACTIVE': 0}],
    ...     'SALES_CARRIER': [{'ID': 'JAS FORWARDING',
    ...         'NAME': 'JAS FORWARDING', 'INACTIVE': 0}],
    ...     'SALES_SERVICE_CHARGE': [{'ID': 'DOCUMENTATION',
    ...         'DESCRIPTION': 'DOCUMENTATION', 'AMOUNT': Decimal('50'),
    ...         'REV_GL_ACCT_ID': '4010', 'INACTIVE': 0}],
    ...     'SALES_TAX_GROUP': [{'ID': 'Tax Exempt', 'INACTIVE': 0}],
    ...     'SALES_CUSTOMER': [{'ID': customer.code, 'SALESREP_ID': 'KC',
    ...         'TERRITORY': 'AUSTRALIA', 'FOB_POINT': 'EX WORKS',
    ...         'SHIP_VIA': 'TBA', 'CREDIT_STATUS': 'APPROVED',
    ...         'FREIGHT_TERMS': 'BILLED', 'TAX_EXEMPT': -1,
    ...         'CREDIT_LIMIT': Decimal('0'), 'NOTES': 'Wants certs'}],
    ...     'SALES_CUSTOMER_ADDRESS': [{'CUSTOMER_ID': customer.code,
    ...         'ADDRESS_NO': 1, 'NAME': 'ExxonMobil Corp',
    ...         'ADDR_1': '5901 Arcturus Road', 'ADDR_2': 'Heritage Field',
    ...         'CITY': 'Oxnard', 'TAX_EXEMPT': 0, 'DEFAULT_ADDRESS': -1}],
    ...     'SALES_SALES_ORDER': [{'ID': 'SO-1001',
    ...         'ORDER_STATUS': 'RELEASED', 'SALESREP_ID': 'KC',
    ...         'QUOTE_ID': 'Q-55', 'FREIGHT_TERMS': 'PREPAID'}],
    ...     'SALES_ORDER_LINE': [
    ...         {'LINE_NO': 1, 'UNIT_PRICE': Decimal('1000'),
    ...             'TRADE_DISC_PERCENT': Decimal('10'),
    ...             'PRODUCT_CODE': 'VALVES'},
    ...         {'LINE_NO': 2, 'UNIT_PRICE': Decimal('40'),
    ...             'TRADE_DISC_PERCENT': Decimal('0')}],
    ...     'SALES_ORDER_CHARGE': [{'SERVICE_CHARGE_ID': 'DOCUMENTATION',
    ...         'DESCRIPTION': 'DOCUMENTATION', 'AMOUNT': Decimal('50'),
    ...         'APPLY': -1, 'APPLIED_AMOUNT': Decimal('0')}],
    ...     }
    >>> m = Migration(tables)
    >>> with contextlib.redirect_stdout(io.StringIO()):
    ...     js_sales.run(m)
    >>> customer.reload()
    >>> (customer.sales_rep.code, customer.territory.code,
    ...     customer.customer_fob_point.code, bool(customer.customer_tax_exempt),
    ...     customer.customer_freight_terms)
    ('KC', 'AUSTRALIA', 'EX WORKS', True, 'billed')
    >>> [bool(a.ship_to_default) for a in customer.addresses
    ...     if a.party_name == 'ExxonMobil Corp']
    [True]
    >>> SalesRep(SalesRep.find([('code', '=', 'SK'),
    ...     ('active', '=', False)])[0].id).description
    'SK WONG'
    >>> sale = Sale(order['id'])
    >>> sale.js_quote, sale.lines[0].product_code.code
    ('Q-55', 'VALVES')
    >>> sorted(c.service_charge.code for c in sale.charges)
    ['CRATING', 'CRATING', 'DOCUMENTATION']
    >>> again = Migration(tables)
    >>> with contextlib.redirect_stdout(io.StringIO()):
    ...     js_sales.run(again)
    >>> {k: v for k, v in again.counts.items()
    ...     if k.startswith('nline.') or 'notes' in k or 'addresses' in k}
    {}
