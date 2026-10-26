===============================
N-Line Desk Order to Cash Scenario
===============================

The services behind the Jobshop order to cash screens (UI upgrade phase 3):
the customer order window and its lines' work orders, and the part's
information.

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

Create a valve made of a body::

    >>> ProductCategory = Model.get('product.category')
    >>> category = ProductCategory(name="Valves")
    >>> category.accounting = True
    >>> category.account_expense = accounts['expense']
    >>> category.account_revenue = accounts['revenue']
    >>> category.save()
    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> Template = Model.get('product.template')
    >>> body_template = Template(name="Body", default_uom=unit, type='goods',
    ...     purchasable=True, list_price=Decimal('100'))
    >>> body_template.account_category = category
    >>> body_template.save()
    >>> body, = body_template.products
    >>> valve_template = Template(name="Valve 2in", default_uom=unit,
    ...     type='goods', salable=True, producible=True,
    ...     list_price=Decimal('900'))
    >>> valve_template.account_category = category
    >>> valve_template.save()
    >>> valve, = valve_template.products

    >>> BOM = Model.get('production.bom')
    >>> bom = BOM(name="Valve 2in")
    >>> bom_input = bom.inputs.new(product=body, quantity=1)
    >>> bom_output = bom.outputs.new(product=valve, quantity=1)
    >>> bom.save()
    >>> _ = valve.boms.new(bom=bom)
    >>> valve.save()

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Refinery Supply")
    >>> customer.save()
    >>> Desk = Model.get('nline.desk')

Enter a customer order::

    >>> order = Desk.sale_order_save({
    ...         'party': customer.id, 'sale_date': today,
    ...         'reference': 'PO-77', 'shipping_date': today,
    ...         'lines': [{'product': valve.id, 'quantity': 2,
    ...             'unit_price': '850.00'}],
    ...         }, config.context)
    >>> order['state'], order['total_amount'], order['reference']
    ('draft', Decimal('1700.00'), 'PO-77')
    >>> line, = order['lines']
    >>> line['product']['id'] == valve.id
    True

Change its line::

    >>> order = Desk.sale_order_save({
    ...         'id': order['id'], 'party': customer.id,
    ...         'lines': [{'id': line['id'], 'product': valve.id,
    ...             'quantity': 3, 'unit_price': '850.00'}],
    ...         }, config.context)
    >>> order['total_amount'], len(order['lines'])
    (Decimal('2550.00'), 1)

No work order before the order is confirmed::

    >>> Desk.sale_line_work_order(  # doctest: +IGNORE_EXCEPTION_DETAIL
    ...     order['lines'][0]['id'], config.context)
    Traceback (most recent call last):
        ...
    ValidationError: ...

Confirm it and create the line's work order::

    >>> Sale = Model.get('sale.sale')
    >>> sale = Sale(order['id'])
    >>> sale.click('quote')
    >>> sale.click('confirm')
    >>> work_order = Desk.sale_line_work_order(
    ...     order['lines'][0]['id'], config.context)
    >>> order = Desk.sale_order_get(order['id'], config.context)
    >>> [l['id'] for l in order['lines'][0]['links']] == [work_order['id']]
    True
    >>> Production = Model.get('production')
    >>> production = Production(work_order['id'])
    >>> production.product == valve, production.quantity
    (True, 3.0)

The part's information::

    >>> info = Desk.part_info(body_template.id, config.context)
    >>> [w['kind'] for w in info['where_used']]
    ['Master', 'Work Order']
    >>> info['stock'][0]['on_hand']
    0.0
