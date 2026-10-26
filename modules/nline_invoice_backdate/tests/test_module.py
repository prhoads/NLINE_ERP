# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime as dt
from decimal import Decimal

from trytond.modules.account.tests import create_chart, get_fiscalyear
from trytond.modules.account_invoice.tests import set_invoice_sequences
from trytond.modules.company.tests import (
    CompanyTestMixin, create_company, set_company)
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction


class NlineInvoiceBackdateTestCase(CompanyTestMixin, ModuleTestCase):
    'Test N-Line Invoice Backdate module'
    module = 'nline_invoice_backdate'

    @with_transaction()
    def test_backdated_invoice(self):
        "Test a customer invoice dated before a numbered one is posted"
        pool = Pool()
        Account = pool.get('account.account')
        FiscalYear = pool.get('account.fiscalyear')
        Invoice = pool.get('account.invoice')
        Journal = pool.get('account.journal')
        Party = pool.get('party.party')

        company = create_company()
        with set_company(company):
            create_chart(company)
            fiscalyear = set_invoice_sequences(get_fiscalyear(
                    company, today=dt.date(2026, 1, 1)))
            fiscalyear.save()
            FiscalYear.create_period([fiscalyear])
            revenue, = Account.search([('type.revenue', '=', True)])
            journal, = Journal.search([('type', '=', 'revenue')])
            party, = Party.create([{
                        'name': "Customer",
                        'addresses': [('create', [{}])],
                        }])

            def invoice(date):
                invoice = Invoice(type='out', party=party,
                    invoice_address=party.address_get(), journal=journal,
                    invoice_date=date, currency=company.currency,
                    account=party.account_receivable_used,
                    lines=[{
                            'type': 'line', 'quantity': 1,
                            'unit_price': Decimal(100),
                            'account': revenue.id,
                            'description': "Valve",
                            }])
                invoice.save()
                return invoice

            later = invoice(dt.date(2026, 3, 20))
            Invoice.post([later])
            earlier = invoice(dt.date(2026, 3, 2))
            Invoice.post([earlier])

            self.assertEqual(earlier.state, 'posted')
            self.assertEqual(int(earlier.number), int(later.number) + 1)


del ModuleTestCase
