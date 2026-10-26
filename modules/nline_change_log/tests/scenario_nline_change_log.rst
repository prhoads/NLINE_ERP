==========================
N-Line Change Log Scenario
==========================

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

Activate modules::

    >>> config = activate_modules('nline_change_log')

    >>> _ = create_company()
    >>> company = get_company()
    >>> fiscalyear = set_fiscalyear_invoice_sequences(
    ...     create_fiscalyear(company, today))
    >>> fiscalyear.click('create_period')
    >>> _ = create_chart(company)
    >>> accounts = get_accounts(company)

Create a customer and rename it::

    >>> Party = Model.get('party.party')
    >>> customer = Party(name="Acme Valves")
    >>> customer.save()
    >>> customer.name = "Acme Valve Co."
    >>> customer.save()

Enter an invoice, change its price and post it::

    >>> Invoice = Model.get('account.invoice')
    >>> invoice = Invoice(type='out', party=customer, invoice_date=today)
    >>> line = invoice.lines.new()
    >>> line.account = accounts['revenue']
    >>> line.description = "Valve"
    >>> line.quantity = 1
    >>> line.unit_price = Decimal('100.00')
    >>> invoice.save()
    >>> line, = invoice.lines
    >>> line.unit_price = Decimal('125.00')
    >>> line.save()
    >>> invoice.reload()
    >>> invoice.click('post')

Enter and delete another invoice::

    >>> draft = Invoice(type='out', party=customer, invoice_date=today,
    ...     description="Mistake")
    >>> draft.save()
    >>> draft_id = draft.id
    >>> draft.delete()

The change log of the invoice line shows the price change::

    >>> change_log = Wizard('nline.change_log')
    >>> change_log.form.model = 'account.invoice.line'
    >>> change_log.execute('result')
    >>> [(l.field, l.old_value, l.new_value)
    ...     for l in change_log.form.lines if l.action == 'write']
    [('Unit Price', '100.00', '125.00')]
    >>> [l.action for l in change_log.form.lines]
    ['write', 'create']
    >>> change_log.execute('end')

The change log of the party shows the rename::

    >>> change_log = Wizard('nline.change_log', [customer])
    >>> [(l.field, l.old_value, l.new_value)
    ...     for l in change_log.form.lines if l.field == 'Name']
    [('Name', 'Acme Valves', 'Acme Valve Co.')]
    >>> change_log.execute('end')

The change log of the invoices shows the posting and the deletion::

    >>> change_log = Wizard('nline.change_log')
    >>> change_log.form.model = 'account.invoice'
    >>> change_log.execute('result')
    >>> changes = [(l.record_id, l.action, l.field, l.new_value)
    ...     for l in change_log.form.lines]
    >>> (draft_id, 'delete', None, None) in changes
    True
    >>> (invoice.id, 'write', 'State', 'Posted') in changes
    True
    >>> (invoice.id, 'write', 'Number', invoice.number) in changes
    True
    >>> all(l.user == 'Administrator' for l in change_log.form.lines)
    True
