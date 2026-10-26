====================
N-Line Desk Scenario
====================

The services behind the QuickBooks-like screens: enter a bill on 2% 10 Net 30,
pay it with the discount by check, write a check, invoice a customer, receive
the payment into undeposited funds, deposit it and read the register.

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

    >>> config = activate_modules(['nline_desk', 'nline_check_print'])

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)
    >>> bank = accounts['cash']

Create the clearing accounts and the desk journal::

    >>> Account = Model.get('account.account')
    >>> clearing, = bank.duplicate(default={
    ...     'name': "Chase 9807 Clearing", 'reconcile': True})
    >>> undeposited, = bank.duplicate(default={
    ...     'name': "Undeposited Funds", 'reconcile': True})
    >>> early_discount, = accounts['revenue'].duplicate(
    ...     default={'name': "Early Pay Discount"})
    >>> sales_discount, = accounts['expense'].duplicate(
    ...     default={'name': "Sales Discounts"})
    >>> Journal = Model.get('account.journal')
    >>> desk_journal = Journal(name="Desk", type='general', code='DESK')
    >>> desk_journal.save()

    >>> Configuration = Model.get('nline.desk.configuration')
    >>> desk_config = Configuration(1)
    >>> desk_config.early_discount_account = early_discount
    >>> desk_config.sales_discount_account = sales_discount
    >>> desk_config.undeposited_account = undeposited
    >>> desk_config.deposit_journal = desk_journal
    >>> desk_config.save()

Create the check and receipt payment journals::

    >>> Sequence = Model.get('ir.sequence')
    >>> SequenceType = Model.get('ir.sequence.type')
    >>> check_type, = SequenceType.find([('name', '=', "Check")])
    >>> checks_sequence = Sequence(name="9807 Checks",
    ...     sequence_type=check_type, number_next=10234)
    >>> checks_sequence.save()
    >>> PaymentJournal = Model.get('account.payment.journal')
    >>> checks = PaymentJournal(name="Chase 9807 Checks",
    ...     process_method='check', check_sequence=checks_sequence,
    ...     clearing_account=clearing, clearing_journal=desk_journal,
    ...     bank_account=bank)
    >>> checks.save()
    >>> receipts = PaymentJournal(name="Customer Receipts",
    ...     process_method='manual', clearing_account=undeposited,
    ...     clearing_journal=desk_journal)
    >>> receipts.save()

Create the parties and the 2% 10 Net 30 term::

    >>> PaymentTerm = Model.get('account.invoice.payment_term')
    >>> term = PaymentTerm(name="2% 10 Net 30",
    ...     early_discount_rate=Decimal('0.02'), early_discount_days=10)
    >>> line = term.lines.new(type='remainder')
    >>> delta = line.relativedeltas.new(days=30)
    >>> term.save()

    >>> Party = Model.get('party.party')
    >>> machinist = Party(name="Gulf Machining",
    ...     supplier_payment_term=term)
    >>> machinist.save()
    >>> office = Party(name="Office Depot")
    >>> office.save()
    >>> customer = Party(name="Refinery Supply")
    >>> customer.save()

    >>> Desk = Model.get('nline.desk')

Enter a bill::

    >>> bill = Desk.enter_bill({
    ...         'party': machinist.id, 'date': today, 'reference': 'GM-4410',
    ...         'payment_term': term.id,
    ...         'lines': [{'account': accounts['expense'].id,
    ...             'description': "Outside machining", 'quantity': 2,
    ...             'unit_price': '500.00'}],
    ...         }, config.context)
    >>> bill['total_amount'], bill['state']
    (Decimal('1000.00'), 'posted')

The bill is open with its discount::

    >>> open_bill, = Desk.open_bills(machinist.id, today, config.context)
    >>> open_bill['amount'], open_bill['discount'], open_bill['reference']
    (Decimal('1000.00'), Decimal('20.00'), 'GM-4410')
    >>> later, = Desk.open_bills(
    ...     machinist.id, today + dt.timedelta(days=11), config.context)
    >>> later['discount']
    Decimal('0')

Pay it by check taking the discount::

    >>> paid = Desk.pay_bills({
    ...         'journal': checks.id, 'date': today,
    ...         'items': [{'line': open_bill['line'], 'amount': '980.00',
    ...             'discount': '20.00'}],
    ...         }, config.context)
    >>> paid['checks'], paid['amount']
    (['10234'], Decimal('980.00'))
    >>> Invoice = Model.get('account.invoice')
    >>> Invoice(bill['id']).state
    'paid'
    >>> early_discount.reload()
    >>> early_discount.balance
    Decimal('-20.00')

Write a check for office supplies::

    >>> check = Desk.write_check({
    ...         'journal': checks.id, 'party': office.id, 'date': today,
    ...         'memo': "Toner",
    ...         'lines': [{'account': accounts['expense'].id,
    ...             'amount': '150.00'}],
    ...         }, config.context)
    >>> check['check_number'], check['amount'], check['bill']['state']
    ('10235', Decimal('150.00'), 'paid')

Invoice a customer and receive the payment::

    >>> invoice = Desk.create_invoice({
    ...         'party': customer.id, 'date': today, 'reference': 'PO-9981',
    ...         'lines': [{'account': accounts['revenue'].id,
    ...             'description': "Valve 2in 600#", 'quantity': 1,
    ...             'unit_price': '2500.00'}],
    ...         }, config.context)
    >>> invoice['total_amount']
    Decimal('2500.00')
    >>> open_invoice, = Desk.open_invoices(customer.id, today, config.context)
    >>> received = Desk.receive_payment({
    ...         'journal': receipts.id, 'party': customer.id, 'date': today,
    ...         'amount': '2500.00', 'reference': "Check 5521",
    ...         'items': [{'line': open_invoice['line'],
    ...             'amount': '2500.00'}],
    ...         }, config.context)
    >>> Invoice(invoice['id']).state
    'paid'
    >>> waiting, = Desk.undeposited_payments(config.context)
    >>> waiting['amount'], waiting['party_name']
    (Decimal('2500.00'), 'Refinery Supply')

Deposit it::

    >>> deposit = Desk.make_deposit({
    ...         'journal': checks.id, 'date': today,
    ...         'lines': [waiting['line']]}, config.context)
    >>> deposit['amount']
    Decimal('2500.00')
    >>> Desk.undeposited_payments(config.context)
    []

The register shows the outstanding checks and the deposit in transit::

    >>> register = Desk.register(checks.id, None, None, config.context)
    >>> for r in register:
    ...     print(r['number'] if r['payment'] else 'deposit',
    ...         r['payment'], r['deposit'], r['balance'], r['cleared'])
    10234 980.00 0 -980.00 False
    10235 150.00 0 -1130.00 False
    deposit 0 2500.00 1370.00 False

The customer center::

    >>> center = Desk.party_center(customer.id, 'customer', config.context)
    >>> center['balance']
    Decimal('0.00')
    >>> [(t['type'], t['amount']) for t in center['transactions']]
    [('invoice', Decimal('2500.00')), ('payment', Decimal('2500.00'))]

The administrator hides a superseded standard menu and shows it again::

    >>> SupersededMenu = Model.get('nline.desk.menu')
    >>> superseded = SupersededMenu.find([
    ...         ('superseded_by', '=', "Enter Bills, Vendor Center")])
    >>> superseded, = superseded
    >>> bool(superseded.hidden)
    False
    >>> superseded.hidden = True
    >>> superseded.save()
    >>> Menu = Model.get('ir.ui.menu')
    >>> menu_id = superseded.menu.id
    >>> Menu.find([('id', '=', menu_id)])
    []
    >>> superseded.hidden = False
    >>> superseded.save()
    >>> len(Menu.find([('id', '=', menu_id)]))
    1

The N-Line screens are in the Tryton menus, opened in Tryton tabs::

    >>> purchases, = Menu.find([('name', '=', "Purchases"), ('parent', '=', None)])
    >>> {'Enter Bills', 'Pay Bills', 'Vendor Center'} <= {
    ...     m.name for m in purchases.childs}
    True
    >>> Menu.find([('name', '=', "N-Line"), ('parent', '=', None)])
    []

The administrator may open them all, the screens that write included::

    >>> allowed = Menu.nline_allowed({})
    >>> allowed['all']
    True
