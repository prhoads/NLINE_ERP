===================================
N-Line Desk Daily Accounting Scenario
===================================

The services behind the QuickBooks daily accounting screens (UI upgrade
phase 2): sales receipts, credit memos and applying them, credit card
charges, journal entries, the chart of accounts and its registers, bank
reconciliation, the trackers and the financial reports.

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

Create the clearing accounts, the journals and the desk configuration::

    >>> clearing, = bank.duplicate(default={
    ...     'name': "Chase 9807 Clearing", 'reconcile': True})
    >>> undeposited, = bank.duplicate(default={
    ...     'name': "Undeposited Funds", 'reconcile': True})
    >>> card_account, = accounts['payable'].duplicate(default={
    ...     'name': "Amex", 'party_required': False, 'reconcile': False})
    >>> Journal = Model.get('account.journal')
    >>> desk_journal = Journal(name="Desk", type='general', code='DESK')
    >>> desk_journal.save()

    >>> Configuration = Model.get('nline.desk.configuration')
    >>> desk_config = Configuration(1)
    >>> desk_config.early_discount_account = accounts['revenue']
    >>> desk_config.sales_discount_account = accounts['expense']
    >>> desk_config.undeposited_account = undeposited
    >>> desk_config.deposit_journal = desk_journal
    >>> desk_config.save()

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

    >>> StatementJournal = Model.get('account.statement.journal')
    >>> AccountJournal = Model.get('account.journal')
    >>> cash_journal, = AccountJournal.find([('code', '=', 'STA')], limit=1)
    >>> statement_journal = StatementJournal(name="Chase 9807",
    ...     journal=cash_journal, account=bank, validation='balance')
    >>> statement_journal.save()

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Refinery Supply")
    >>> customer.save()
    >>> vendor = Party(name="Gulf Machining")
    >>> vendor.save()
    >>> Desk = Model.get('nline.desk')
    >>> Invoice = Model.get('account.invoice')

A sales receipt: the invoice paid at once, waiting in undeposited funds::

    >>> receipt = Desk.sales_receipt({
    ...         'party': customer.id, 'date': today, 'reference': 'SR-1',
    ...         'journal': receipts.id, 'payment_reference': 'Check 77',
    ...         'lines': [{'account': accounts['revenue'].id,
    ...             'description': "Repair kit", 'quantity': 1,
    ...             'unit_price': '300.00'}],
    ...         }, config.context)
    >>> receipt['total_amount'], Invoice(receipt['id']).state
    (Decimal('300.00'), 'paid')
    >>> [p['amount'] for p in Desk.undeposited_payments(config.context)]
    [Decimal('300.00')]

A credit memo applied to an open invoice::

    >>> invoice = Desk.create_invoice({
    ...         'party': customer.id, 'date': today,
    ...         'lines': [{'account': accounts['revenue'].id,
    ...             'quantity': 1, 'unit_price': '1000.00'}],
    ...         }, config.context)
    >>> credit = Desk.credit_memo({
    ...         'kind': 'customer', 'party': customer.id, 'date': today,
    ...         'lines': [{'account': accounts['revenue'].id,
    ...             'amount': '200.00'}],
    ...         'apply_to': invoice['id'],
    ...         }, config.context)
    >>> credit['total_amount'], credit['applied']['amount']
    (Decimal('-200.00'), Decimal('200.00'))
    >>> Invoice(invoice['id']).amount_to_pay
    Decimal('800.00')

A credit larger than the invoice is refused::

    >>> small = Desk.create_invoice({
    ...         'party': customer.id, 'date': today,
    ...         'lines': [{'account': accounts['revenue'].id,
    ...             'quantity': 1, 'unit_price': '50.00'}],
    ...         }, config.context)
    >>> big = Desk.credit_memo({
    ...         'kind': 'customer', 'party': customer.id, 'date': today,
    ...         'lines': [{'account': accounts['revenue'].id,
    ...             'amount': '75.00'}],
    ...         }, config.context)
    >>> [c['open_amount'] for c in Desk.open_credits(
    ...     customer.id, 'customer', config.context)]
    [Decimal('75.00')]
    >>> Desk.apply_credit(big['id'], small['id'], config.context)  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    ValidationError: ...

A credit card charge::

    >>> charge = Desk.credit_card_charge({
    ...         'card': card_account.id, 'party': vendor.id, 'date': today,
    ...         'reference': 'AMEX-1',
    ...         'lines': [{'account': accounts['expense'].id,
    ...             'memo': "Tooling", 'amount': '45.50'}],
    ...         }, config.context)
    >>> charge['amount']
    Decimal('45.50')
    >>> card_account.reload()
    >>> card_account.balance
    Decimal('-45.50')

A general journal entry; an unbalanced one is refused::

    >>> entry = Desk.journal_entry({
    ...         'date': today, 'memo': "Accrual",
    ...         'lines': [
    ...             {'account': accounts['expense'].id, 'debit': '100.00'},
    ...             {'account': card_account.id, 'credit': '100.00'}],
    ...         }, config.context)
    >>> bool(entry['number'])
    True
    >>> Desk.journal_entry({  # doctest: +IGNORE_EXCEPTION_DETAIL
    ...         'date': today,
    ...         'lines': [
    ...             {'account': accounts['expense'].id, 'debit': '10.00'},
    ...             {'account': card_account.id, 'credit': '9.00'}],
    ...         }, config.context)
    Traceback (most recent call last):
        ...
    ValidationError: ...

The chart of accounts and a register::

    >>> chart = Desk.accounts(None, config.context)
    >>> [a['balance'] for a in chart if a['id'] == card_account.id]
    [Decimal('-145.50')]
    >>> register = Desk.account_register(
    ...     card_account.id, None, None, config.context)
    >>> [(r['credit'], r['balance']) for r in register['rows']]
    [(Decimal('45.50'), Decimal('-45.50')), (Decimal('100.00'), Decimal('-145.50'))]

Deposit the receipt and write a check, then reconcile the bank::

    >>> waiting, = Desk.undeposited_payments(config.context)
    >>> _ = Desk.make_deposit({
    ...         'journal': checks.id, 'date': today,
    ...         'lines': [waiting['line']]}, config.context)
    >>> check = Desk.write_check({
    ...         'journal': checks.id, 'party': vendor.id, 'date': today,
    ...         'lines': [{'account': accounts['expense'].id,
    ...             'amount': '120.00'}],
    ...         }, config.context)
    >>> data = Desk.reconcile_data(checks.id, config.context)
    >>> data['beginning_balance']
    Decimal('0')
    >>> sorted(i['amount'] for i in data['items'])
    [Decimal('-120.00'), Decimal('300.00')]
    >>> done = Desk.reconcile({
    ...         'journal': checks.id, 'date': today,
    ...         'ending_balance': '180.00',
    ...         'lines': [i['line'] for i in data['items']],
    ...         }, config.context)
    >>> done['lines']
    2
    >>> data = Desk.reconcile_data(checks.id, config.context)
    >>> data['beginning_balance'], data['items']
    (Decimal('180.00'), [])

The income tracker::

    >>> tracker = Desk.tracker('customer', config.context)
    >>> tracker['totals']['open']
    Decimal('775.00')
    >>> tracker['counts']['open']
    3

The reports::

    >>> pl = Desk.report('profit_loss', {
    ...     'from_date': today.replace(day=1), 'to_date': today},
    ...     config.context)
    >>> pl['title']
    'Profit & Loss'
    >>> any(r['drill'] for r in pl['rows'])
    True
    >>> bs = Desk.report('balance_sheet', {'to_date': today}, config.context)
    >>> bs['title']
    'Balance Sheet'
    >>> aging = Desk.report('ar_aging', {'to_date': today}, config.context)
    >>> aging['rows'][-1]['values'][-1]
    Decimal('775.00')
