==========================
N-Line Sales Cost Scenario
==========================

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

    >>> config = activate_modules('nline_sales_cost')

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)

Create the cost order root::

    >>> AnalyticAccount = Model.get('analytic_account.account')
    >>> root = AnalyticAccount(type='root', name="Cost Orders")
    >>> root.save()
    >>> SaleConfig = Model.get('sale.configuration')
    >>> sale_config = SaleConfig(1)
    >>> sale_config.cost_order_root = root
    >>> sale_config.save()

Create parties and products::

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Customer")
    >>> customer.save()
    >>> carrier = Party(name="Freight Carrier")
    >>> carrier.save()

    >>> ProductCategory = Model.get('product.category')
    >>> account_category = ProductCategory(name="Account Category")
    >>> account_category.accounting = True
    >>> account_category.account_expense = accounts['expense']
    >>> account_category.account_revenue = accounts['revenue']
    >>> account_category.save()

    >>> Uom = Model.get('product.uom')
    >>> unit, = Uom.find([('name', '=', 'Unit')])
    >>> ProductTemplate = Model.get('product.template')
    >>> template = ProductTemplate(name="Valve", default_uom=unit,
    ...     type='goods', salable=True, list_price=Decimal(100),
    ...     account_category=account_category)
    >>> valve, = template.products
    >>> valve.cost_price = Decimal(60)
    >>> template.save()
    >>> valve, = template.products

    >>> template = ProductTemplate(name="Freight", default_uom=unit,
    ...     type='service', purchasable=True, list_price=Decimal(0),
    ...     account_category=account_category)
    >>> template.save()
    >>> freight, = template.products

    >>> Location = Model.get('stock.location')
    >>> storage, = Location.find([('code', '=', 'STO')])
    >>> Inventory = Model.get('stock.inventory')
    >>> inventory = Inventory(location=storage)
    >>> _ = inventory.lines.new(product=valve, quantity=5)
    >>> inventory.click('confirm')

Sell two valves, the cost order is created::

    >>> Sale = Model.get('sale.sale')
    >>> sale = Sale(party=customer)
    >>> line = sale.lines.new()
    >>> line.product = valve
    >>> line.quantity = 2
    >>> sale.click('quote')
    >>> sale.click('confirm')
    >>> sale.cost_order.name == sale.number
    True
    >>> sale.cost_order.root == root
    True
    >>> entry, = sale.lines[0].analytic_accounts
    >>> entry.account == sale.cost_order
    True

Ship and invoice::

    >>> shipment, = sale.shipments
    >>> shipment.click('assign_try')
    >>> shipment.click('pick')
    >>> shipment.click('pack')
    >>> shipment.click('done')
    >>> invoice, = sale.invoices
    >>> invoice.click('post')

Enter the freight bill against the cost order::

    >>> Invoice = Model.get('account.invoice')
    >>> bill = Invoice(type='in', party=carrier, invoice_date=today)
    >>> bill_line = bill.lines.new()
    >>> bill_line.product = freight
    >>> bill_line.quantity = 1
    >>> bill_line.unit_price = Decimal('25.00')
    >>> bill_entry, = bill_line.analytic_accounts
    >>> bill_entry.account = sale.cost_order
    >>> bill.click('post')

The sale shows its cost order::

    >>> sale.reload()
    >>> sale.cost_order_revenue
    Decimal('200.00')
    >>> sale.cost_order_cogs
    Decimal('120.00')
    >>> sale.cost_order_bills
    Decimal('25.00')
    >>> sale.cost_order_margin
    Decimal('55.00')
    >>> sale.cost_order_margin_rate
    Decimal('0.2750')
