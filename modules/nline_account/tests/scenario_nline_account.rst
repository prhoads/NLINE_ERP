=======================
N-Line Account Scenario
=======================

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

    >>> config = activate_modules('nline_account')

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)

Post an entry in the first period and close it::

    >>> Journal = Model.get('account.journal')
    >>> Move = Model.get('account.move')
    >>> Period = Model.get('account.period')
    >>> journal, = Journal.find([('code', '=', 'EXP')])
    >>> period = fiscalyear.periods[0]
    >>> def entry(amount):
    ...     move = Move(journal=journal, period=period,
    ...         date=period.start_date)
    ...     _ = move.lines.new(account=accounts['expense'], debit=amount)
    ...     _ = move.lines.new(account=accounts['cash'], credit=amount)
    ...     move.click('post')
    ...     return move
    >>> _ = entry(Decimal(10))
    >>> period.click('close')
    >>> JournalPeriod = Model.get('account.journal.period')
    >>> journal_period, = JournalPeriod.find([('period', '=', period.id)])
    >>> journal_period.state
    'closed'

Reopen the period, its journal-period is open and entries can be posted::

    >>> period.click('reopen')
    >>> journal_period.reload()
    >>> journal_period.state
    'open'
    >>> entry(Decimal(5)).state
    'posted'

Record an exemption certificate::

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Refinery Supply (resale)")
    >>> customer.tax_exemption_type = 'resale'
    >>> customer.tax_exemption_certificate = '1-23-4567890-1'
    >>> customer.tax_exemption_date = dt.date(2025, 1, 15)
    >>> customer.tax_exemption_expiry = dt.date(2025, 1, 1)
    >>> customer.save()  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
        ...
    DomainValidationError: ...
    >>> customer.tax_exemption_expiry = None
    >>> customer.save()
