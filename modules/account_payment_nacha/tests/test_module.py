# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime
from decimal import Decimal

from trytond.model.exceptions import ValidationError
from trytond.modules.company.tests import (
    CompanyTestMixin, create_company, set_company)
from trytond.modules.currency.tests import create_currency
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction
from trytond.transaction import Transaction


def setup_environment():
    pool = Pool()
    Party = pool.get('party.party')
    Bank = pool.get('bank')
    Account = pool.get('bank.account')
    Journal = pool.get('account.payment.journal')

    currency = create_currency('USD')
    company = create_company(currency=currency)
    bank_party = Party(name="JPMorgan Chase")
    bank_party.save()
    bank = Bank(party=bank_party)
    bank.save()
    supplier = Party(name="Alltex Welding Supply, Inc.", code='V0042')
    supplier.save()
    company_account, supplier_account = Account.create([{
                'bank': bank,
                'owners': [('add', [company.party])],
                'currency': currency.id,
                'us_routing_number': '021000021',
                'us_account_type': 'checking',
                'numbers': [('create', [{
                                'type': 'other',
                                'number': '9807',
                                }])],
                }, {
                'bank': bank,
                'owners': [('add', [supplier])],
                'currency': currency.id,
                'us_routing_number': '071000013',
                'us_account_type': 'savings',
                'numbers': [('create', [{
                                'type': 'other',
                                'number': '987 654 3210',
                                }])],
                }])
    with set_company(company):
        journal = Journal(
            name="Chase ACH",
            currency=currency,
            process_method='nacha',
            nacha_bank_account=company_account,
            nacha_company_identification='1234567890')
        journal.save()
    return company, supplier, journal


class AccountPaymentNachaTestCase(CompanyTestMixin, ModuleTestCase):
    'Test Account Payment Nacha module'
    module = 'account_payment_nacha'

    @with_transaction()
    def test_routing_number_validation(self):
        "Test routing number is validated"
        pool = Pool()
        Account = pool.get('bank.account')

        account = Account(us_routing_number='021000022')
        with self.assertRaises(ValidationError):
            account.save()

    @with_transaction()
    def test_process_payable(self):
        "Test processing payable payments creates a Chase ACH file"
        pool = Pool()
        Payment = pool.get('account.payment')
        Group = pool.get('account.payment.group')
        Date = pool.get('ir.date')
        ProcessPayment = pool.get('account.payment.process', type='wizard')

        company, supplier, journal = setup_environment()
        with set_company(company):
            today = Date.today()
            payment, = Payment.create([{
                        'company': company,
                        'party': supplier,
                        'journal': journal,
                        'kind': 'payable',
                        'amount': Decimal('1500.25'),
                        'state': 'approved',
                        'description': "Invoice 1001, PO 27626",
                        'date': today,
                        }])
            self.assertEqual(
                payment.nacha_bank_account.us_routing_number, '071000013')

            session_id, _, _ = ProcessPayment.create()
            process = ProcessPayment(session_id)
            with Transaction().set_context(
                    active_model=Payment.__name__,
                    active_ids=[payment.id]):
                _, data = process.do_process(None)
            group, = Group.browse(data['res_id'])

            self.assertEqual(group.nacha_file_id_modifier, 'A')
            self.assertTrue(group.nacha_filename.endswith('.txt'))
            self.assertLessEqual(len(group.nacha_filename), 50)
            records = bytes(group.nacha_file).decode('ascii').split('\r\n')
            self.assertEqual(records[-1], '')
            records = records[:-1]
            self.assertEqual(len(records) % 10, 0)
            self.assertTrue(all(len(r) == 94 for r in records))
            header, batch, entry, addenda, control, file_control = (
                records[:6])
            self.assertEqual(header[3:23], ' 0210000211234567890')
            self.assertEqual(batch[0:4], '5220')
            self.assertEqual(batch[20:40], '00000000000000009807')
            effective = today + datetime.timedelta(days=1)
            self.assertEqual(batch[69:75], effective.strftime('%y%m%d'))
            self.assertEqual(entry[0:12], '632071000013')
            self.assertEqual(entry[12:29].rstrip(), '9876543210')
            self.assertEqual(entry[29:39], '0000150025')
            self.assertEqual(entry[39:54].rstrip(), 'V0042')
            self.assertEqual(
                entry[54:76].rstrip(), 'ALLTEX WELDING SUPPLY')
            self.assertEqual(
                addenda[3:83].rstrip(), 'INVOICE 1001  PO 27626')
            self.assertEqual(control[32:44], '000000150025')
            self.assertEqual(file_control[0:1], '9')


del ModuleTestCase
