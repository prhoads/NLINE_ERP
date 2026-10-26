===========================
N-Line Check Print Scenario
===========================

Imports::

    >>> import datetime as dt
    >>> from decimal import Decimal
    >>> from proteus import Model, Report, Wizard
    >>> from trytond.tests.tools import activate_modules
    >>> from trytond.modules.company.tests.tools import create_company, \
    ...     get_company
    >>> from trytond.modules.account.tests.tools import create_fiscalyear, \
    ...     create_chart, get_accounts
    >>> from trytond.modules.account_invoice.tests.tools import \
    ...     set_fiscalyear_invoice_sequences

    >>> today = dt.date.today()

Activate modules::

    >>> config = activate_modules('nline_check_print')

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)

Create the check journal numbered from 10234::

    >>> Sequence = Model.get('ir.sequence')
    >>> SequenceType = Model.get('ir.sequence.type')
    >>> check_type, = SequenceType.find([('name', '=', "Check")])
    >>> check_sequence = Sequence(name="Chase 9807 Checks",
    ...     sequence_type=check_type, number_next=10234)
    >>> check_sequence.save()
    >>> PaymentJournal = Model.get('account.payment.journal')
    >>> journal = PaymentJournal(name="Chase 9807 Checks",
    ...     process_method='check', check_sequence=check_sequence)
    >>> journal.save()

Post three bills from two suppliers::

    >>> Party = Model.get('party.party')
    >>> acme = Party(name="Acme Heat Treat")
    >>> address, = acme.addresses
    >>> address.street = "1200 Industrial Blvd"
    >>> address.city = "Houston"
    >>> address.postal_code = "77012"
    >>> acme.save()
    >>> coating = Party(name="Gulf Coating")
    >>> coating.save()

    >>> Invoice = Model.get('account.invoice')
    >>> def bill(party, amount, reference):
    ...     invoice = Invoice(type='in', party=party, invoice_date=today,
    ...         reference=reference)
    ...     line = invoice.lines.new()
    ...     line.account = accounts['expense']
    ...     line.quantity = 1
    ...     line.unit_price = amount
    ...     invoice.click('post')
    ...     return invoice
    >>> bill1 = bill(acme, Decimal('1000.00'), 'HT-501')
    >>> bill2 = bill(acme, Decimal('234.56'), 'HT-502')
    >>> bill3 = bill(coating, Decimal('80.00'), 'GC-77')

Pay them by check::

    >>> lines = [l for b in [bill1, bill2, bill3] for l in b.lines_to_pay]
    >>> pay_line = Wizard('account.move.line.pay', lines)
    >>> pay_line.execute('next_')
    >>> pay_line.form.journal = journal
    >>> pay_line.execute('next_')
    >>> Payment = Model.get('account.payment')
    >>> payments = Payment.find([])
    >>> len(payments)
    3
    >>> for payment in payments:
    ...     payment.click('submit')
    ...     payment.click('approve')
    >>> process = Wizard('account.payment.process', payments)
    >>> group, =Model.get('account.payment.group').find([])

One check per payee::

    >>> sorted((p.party.name, p.check_number) for p in Payment.find([]))
    [('Acme Heat Treat', '10234'), ('Acme Heat Treat', '10234'), ('Gulf Coating', '10235')]

Print the checks::

    >>> check_report = Report('account.payment.group.check')
    >>> ext, content, _, name = check_report.execute([group])
    >>> content = content.decode() if isinstance(content, bytes) else content
    >>> 'One Thousand Two Hundred Thirty-Four and 56/100' in content
    True
    >>> 'Eighty and 00/100' in content
    True
    >>> 'HT-502' in content and '1200 Industrial Blvd' in content
    True
