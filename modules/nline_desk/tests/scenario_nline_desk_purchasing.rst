=============================
N-Line Desk Purchasing Scenario
=============================

The services behind the Jobshop purchasing screens (UI upgrade phase 4):
the purchase order window, receiving with a partial quantity and a return
to the supplier.

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

Create a purchased part and a supplier::

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
    >>> template.save()
    >>> body, = template.products

    >>> Party = Model.get('party.party')
    >>> foundry = Party(name="Houston Foundry")
    >>> foundry.save()
    >>> Desk = Model.get('nline.desk')

Enter and release a purchase order::

    >>> po = Desk.purchase_order_save({
    ...         'party': foundry.id, 'purchase_date': today,
    ...         'reference': 'Q-12',
    ...         'lines': [{'product': body.id, 'quantity': 10,
    ...             'unit_price': '40.00'}],
    ...         }, config.context)
    >>> po['state'], po['total_amount']
    ('draft', Decimal('400.00'))
    >>> Purchase = Model.get('purchase.purchase')
    >>> purchase = Purchase(po['id'])
    >>> purchase.click('quote')
    >>> purchase.click('confirm')

Receive 6 of the 10::

    >>> open_lines = Desk.open_receipts(foundry.id, config.context)
    >>> [(l['quantity'], l['number']) for l in open_lines] == [
    ...     (10.0, purchase.number)]
    True
    >>> receiver = Desk.receive_items({
    ...         'date': today, 'reference': 'PS-881',
    ...         'lines': [{'move': open_lines[0]['move'], 'quantity': 6}],
    ...         }, config.context)
    >>> receiver['lines']
    1
    >>> ShipmentIn = Model.get('stock.shipment.in')
    >>> ShipmentIn(receiver['id']).state
    'done'

The other 4 stay on order::

    >>> [l['quantity'] for l in Desk.open_receipts(
    ...     foundry.id, config.context)]
    [4.0]
    >>> po = Desk.purchase_order_get(po['id'], config.context)
    >>> po['lines'][0]['received']
    6.0

Return 2 to the foundry::

    >>> received, = Desk.received_items(foundry.id, config.context)
    >>> back = Desk.return_items({
    ...         'date': today, 'reference': 'RMA-3', 'accept_warnings': True,
    ...         'lines': [{'move': received['move'], 'quantity': 2}],
    ...         }, config.context)
    >>> back['state']
    'done'
