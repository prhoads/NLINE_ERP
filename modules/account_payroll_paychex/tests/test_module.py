# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime
import os
import unittest
from decimal import Decimal

from trytond.exceptions import UserError
from trytond.model.exceptions import AccessError
from trytond.modules.account.tests import create_chart, get_fiscalyear
from trytond.modules.company.tests import (
    CompanyTestMixin, create_company, set_company)
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction

from ..paychex import PaychexError, parse


def sample_report():
    path = os.path.join(os.path.dirname(__file__), 'sample_report.pdf')
    with open(path, 'rb') as fp:
        return fp.read()


class PaychexParserTestCase(unittest.TestCase):
    "Test Paychex report parser"

    def test_parse(self):
        "Test parse sample report"
        report = parse(sample_report())

        self.assertEqual(report.company_code, '0000 1234-5678')
        self.assertEqual(report.check_date, datetime.date(2026, 10, 9))
        self.assertEqual(report.period_start, datetime.date(2026, 9, 21))
        self.assertEqual(report.period_end, datetime.date(2026, 10, 4))
        self.assertEqual(report.total_debit, Decimal('10765.00'))
        self.assertEqual(report.total_credit, Decimal('10765.00'))
        self.assertEqual(
            [(l.key, l.debit, l.credit) for l in report.lines], [
                (('EARNINGS', 'EARNINGS'), Decimal('10000.00'), 0),
                (('EMPLOYEEWITHHOLDINGS', 'SOCIALSECURITY'),
                    0, Decimal('620.00')),
                (('EMPLOYEEWITHHOLDINGS', 'MEDICARE'), 0, Decimal('145.00')),
                (('EMPLOYEEWITHHOLDINGS', 'FEDINCOMETAX'),
                    0, Decimal('1000.00')),
                (('DEDUCTIONS', 'PXCMPEEPRE'), 0, Decimal('200.00')),
                (('NETPAYROLL', 'DIRECTDEPOSIT'), 0, Decimal('8035.00')),
                (('EMPLOYERPAIDTAXLIABILITIES', 'EMPLOYERTAXEXPENSES'),
                    Decimal('765.00'), 0),
                (('EMPLOYERPAIDTAXLIABILITIES', 'SOCIALSECURITY'),
                    0, Decimal('620.00')),
                (('EMPLOYERPAIDTAXLIABILITIES', 'MEDICARE'),
                    0, Decimal('145.00')),
                ])

    def test_parse_not_report(self):
        "Test parse a PDF which is not a report"
        with self.assertRaises(Exception):
            parse(b'not a pdf')

    def test_unbalanced(self):
        "Test unbalanced report is rejected"
        report = parse(sample_report())
        report.lines[0].debit += 1
        with self.assertRaises(PaychexError):
            report.validate()


class AccountPayrollPaychexTestCase(CompanyTestMixin, ModuleTestCase):
    'Test Account Payroll Paychex module'
    module = 'account_payroll_paychex'

    @with_transaction()
    def test_import(self):
        "Test import payroll"
        pool = Pool()
        Account = pool.get('account.account')
        FiscalYear = pool.get('account.fiscalyear')
        Journal = pool.get('account.journal')
        Mapping = pool.get('account.payroll.paychex.mapping')
        Import = pool.get('account.payroll.paychex.import', type='wizard')

        company = create_company()
        with set_company(company):
            create_chart(company)
            fiscalyear = get_fiscalyear(
                company, today=datetime.date(2026, 10, 9))
            fiscalyear.save()
            FiscalYear.create_period([fiscalyear])
            journal, = Journal.search([('code', '=', 'REV')])
            expense, = Account.search([('type.expense', '=', True)])
            cash, = Account.search([('name', '=', 'Main Cash')])

            def run_import(distribute=None):
                session_id, _, _ = Import.create()
                wizard = Import(session_id)
                wizard.start.company = company
                wizard.start.journal = journal
                wizard.start.report = sample_report()
                if distribute is not None:
                    wizard.distribute.lines = distribute(wizard)
                return wizard

            # First import registers the lines to map
            wizard = run_import()
            self.assertEqual(wizard.transition_import_(), 'open_mappings')
            mappings = Mapping.search([])
            self.assertEqual(len(mappings), 9)
            for mapping in mappings:
                if mapping.label_key in {'EARNINGS', 'EMPLOYERTAXEXPENSES'}:
                    mapping.account = expense
                else:
                    mapping.account = cash
                if mapping.label_key == 'EARNINGS':
                    mapping.distribute = True
            Mapping.save(mappings)

            # Earnings must be distributed
            wizard = run_import()
            self.assertEqual(wizard.transition_import_(), 'distribute')
            proposal = wizard.default_distribute([])
            self.assertEqual(proposal['lines'], [{
                        'label': 'EARNINGS',
                        'total': Decimal('10000.00'),
                        'account': expense.id,
                        'amount': Decimal('10000.00'),
                        }])

            def split(amounts):
                def distribute(wizard):
                    Line = pool.get(
                        'account.payroll.paychex.import.distribute.line')
                    return [Line(
                            label='EARNINGS', total=Decimal('10000.00'),
                            account=account, amount=amount)
                        for account, amount in amounts]
                return distribute

            wizard = run_import(split([(expense, Decimal('6000.00'))]))
            with self.assertRaises(UserError):
                wizard.create_move()

            wizard = run_import(split([
                        (expense, Decimal('6000.00')),
                        (cash, Decimal('4000.00'))]))
            move = wizard.create_move()
            self.assertEqual(move.date, datetime.date(2026, 10, 9))
            self.assertEqual(move.state, 'draft')
            self.assertEqual(len(move.lines), 10)
            self.assertEqual(
                sum(l.debit for l in move.lines), Decimal('10765.00'))
            self.assertEqual(
                sum(l.credit for l in move.lines), Decimal('10765.00'))
            earnings = [l for l in move.lines if l.description == 'EARNINGS']
            self.assertEqual(
                sorted(l.debit for l in earnings),
                [Decimal('4000.00'), Decimal('6000.00')])

            # Same report can not be imported twice
            with self.assertRaises(AccessError):
                run_import().transition_import_()


del ModuleTestCase
