==================================
N-Line Customer Statement Scenario
==================================

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model, Wizard
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company
    >>> from trytond.modules.account.tests.tools import create_fiscalyear, \
    ...     create_chart, get_accounts
    >>> from trytond.modules.account_invoice.tests.tools import \
    ...     set_fiscalyear_invoice_sequences

    >>> today = dt.date.today()
    >>> year = today.year

Activate modules::

    >>> config = activate_modules('nline_customer_statement')

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(
    ...         company, (dt.date(year, 1, 1), dt.date(year, 12, 31))))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)

    >>> Journal = Model.get('account.journal')
    >>> PaymentMethod = Model.get('account.invoice.payment.method')
    >>> journal_cash, = Journal.find([('type', '=', 'cash')])
    >>> payment_method = PaymentMethod(name="Check", journal=journal_cash,
    ...     credit_account=accounts['cash'], debit_account=accounts['cash'])
    >>> payment_method.save()

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Gulf Refining")
    >>> customer.save()

    >>> Invoice = Model.get('account.invoice')
    >>> def invoice(date, amount, reference):
    ...     invoice = Invoice(type='out', party=customer, invoice_date=date,
    ...         reference=reference)
    ...     line = invoice.lines.new()
    ...     line.account = accounts['revenue']
    ...     line.description = "Valve"
    ...     line.quantity = 1 if amount > 0 else -1
    ...     line.unit_price = abs(amount)
    ...     invoice.click('post')
    ...     return invoice

An invoice before the period, an invoice, a payment and a credit memo in it::

    >>> september = invoice(dt.date(year, 9, 1), Decimal(1000), 'PO-77')
    >>> october = invoice(dt.date(year, 10, 5), Decimal(500), 'PO-81')
    >>> pay = september.click('pay')
    >>> pay.form.date = dt.date(year, 10, 10)
    >>> pay.form.payment_method = payment_method
    >>> pay.form.amount = Decimal(1000)
    >>> pay.execute('choice')
    >>> credit = invoice(dt.date(year, 10, 12), Decimal(-100), 'RMA-3')

Print the statement of October::

    >>> print_statement = Wizard('nline.customer_statement.print', [customer])
    >>> print_statement.form.from_date = dt.date(year, 10, 1)
    >>> print_statement.form.to_date = dt.date(year, 10, 31)
    >>> print_statement.execute('print_')
    >>> ext, content, _, name = print_statement.actions[0]
    >>> content = content.decode() if isinstance(content, bytes) else content
    >>> import re
    >>> body = re.sub(r'<[^>]+>', ' ', content.split('<tbody>')[1])
    >>> cells = [c.strip() for c in body.split('  ') if c.strip()]
    >>> balance_forward = cells.index('Balance forward')
    >>> cells[balance_forward + 1]
    '$1,000.00'
    >>> [c for c in cells if c.startswith(('Invoice', 'Payment', 'Credit'))]
    ['Invoice 2', 'Payment 3', 'Invoice 1', 'Credit Memo 3']
    >>> [c for c in cells if c.startswith('$')]
    ['$1,000.00', '$500.00', '$1,500.00', '$1,000.00', '$500.00', '$100.00', '$400.00']
    >>> 'RMA-3' in content and 'PO-81' in content
    True

The aging and the amount due::

    >>> aging = re.sub(r'<[^>]+>', ' ', content.split('class="aging"')[1])
    >>> [c.strip() for c in aging.split('  ') if c.strip()][1:13]
    ['Current', '1-30', '31-60', '61-90', 'Over 90', 'Amount Due', '$0.00', '$400.00', '$0.00', '$0.00', '$0.00', '$400.00']
