# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime
import os
import unittest
from decimal import Decimal

from trytond.exceptions import UserError
from trytond.modules.account.tests import create_chart, get_fiscalyear
from trytond.modules.company.tests import (
    CompanyTestMixin, create_company, set_company)
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction

from ..texas import parse


def rate_file(name='taxrates.txt'):
    with open(os.path.join(os.path.dirname(__file__), name), 'rb') as fp:
        return fp.read()


class TexasRateFileTestCase(unittest.TestCase):
    "Test Texas rate file"

    def test_parse(self):
        "Test parse rate file"
        rates = parse(rate_file())

        self.assertEqual(rates.quarter, '20263')
        self.assertEqual(rates.start_date, datetime.date(2026, 7, 1))
        self.assertEqual(rates.state_rate, Decimal('0.0625'))
        self.assertEqual(
            [(l.name, l.county) for l in rates.locations], [
                ('Fort Worth', 'Parker'),
                ('Houston', 'Fort Bend'),
                ('Rosenberg', 'Fort Bend'),
                ])
        houston = rates.locations[1]
        self.assertEqual(
            [(j.type, j.code, j.rate) for j in houston.jurisdictions], [
                ('city', '2101017', Decimal('0.01')),
                ('transit', '3101990', Decimal('0.01')),
                ])
        self.assertFalse(houston.over_cap)
        self.assertTrue(rates.locations[0].over_cap)

    def test_parse_invalid(self):
        "Test parse invalid file"
        with self.assertRaises(ValueError):
            parse(b'foo\tbar')


class AccountTaxUSTestCase(CompanyTestMixin, ModuleTestCase):
    'Test Account Tax US module'
    module = 'account_tax_us'
    extras = ['sale']

    def setup(self, company):
        pool = Pool()
        Account = pool.get('account.account')
        Configuration = pool.get('account.configuration')
        Location = pool.get('account.tax.us.location')
        Tax = pool.get('account.tax')
        TaxRule = pool.get('account.tax.rule')
        Import = pool.get('account.tax.us.import_texas', type='wizard')

        create_chart(company)
        fiscalyear = get_fiscalyear(
            company, today=datetime.date(2026, 10, 1))
        fiscalyear.save()

        session_id, _, _ = Import.create()
        wizard = Import(session_id)
        wizard.start.company = company
        wizard.start.file = rate_file()
        self.assertEqual(wizard.transition_import_(), 'result')
        self.assertEqual(wizard.result.locations, 3)
        self.assertEqual(wizard.result.over_cap, 1)

        rosenberg, = Location.search([('name', '=', 'Rosenberg')])
        houston, = Location.search([('name', '=', 'Houston')])
        account, = Account.search([('type.payable', '=', True)])
        config = Configuration(1)
        config.us_sales_tax_account = account
        config.us_sales_tax_origin = rosenberg
        config.save()

        placeholder = Tax(
            name="Sales Tax", description="Sales Tax", type='none',
            us_sales_tax=True)
        placeholder.save()
        rule = TaxRule(name="US Sales Tax", kind='sale', us_sales_tax=True)
        rule.save()
        return rosenberg, houston, placeholder, rule

    def compute(self, rule, tax, to_address=None, date=None):
        pool = Pool()
        Tax = pool.get('account.tax')
        tax_ids = rule.apply(tax, {
                'us_to_address': to_address.id if to_address else None,
                })
        taxes = Tax.browse(tax_ids)
        return sum(
            (t['amount'] for t in Tax.compute(
                    taxes, Decimal('100'), 1,
                    date or datetime.date(2026, 10, 1))),
            Decimal(0))

    def address(self, state, location=None, country='US'):
        pool = Pool()
        Address = pool.get('party.address')
        Country = pool.get('country.country')
        Party = pool.get('party.party')
        Subdivision = pool.get('country.subdivision')
        country, = Country.search([('code', '=', country)]) or [
            Country(code=country, name=country)]
        if not country.id or country.id < 0:
            country.save()
        subdivision = None
        if state:
            subdivision, = Subdivision.search([
                    ('code', '=', '%s-%s' % (country.code, state))]) or [
                Subdivision(
                    country=country, code='%s-%s' % (country.code, state),
                    name=state, type='state')]
            if not subdivision.id or subdivision.id < 0:
                subdivision.save()
        party = Party(name="Customer")
        party.save()
        address = Address(
            party=party, country=country, subdivision=subdivision,
            us_tax_location=location)
        address.save()
        return address

    @with_transaction()
    def test_origin(self):
        "Test sales tax at the seller location"
        company = create_company()
        with set_company(company):
            rosenberg, houston, placeholder, rule = self.setup(company)
            houston_address = self.address('TX', houston)

            # 6.25% state and 2% Rosenberg
            self.assertEqual(
                self.compute(rule, placeholder, houston_address),
                Decimal('8.25'))
            # Without address the seller location is used
            self.assertEqual(
                self.compute(rule, placeholder), Decimal('8.25'))

    @with_transaction()
    def test_destination(self):
        "Test sales tax at the delivery address"
        pool = Pool()
        Configuration = pool.get('account.configuration')
        company = create_company()
        with set_company(company):
            rosenberg, houston, placeholder, rule = self.setup(company)
            config = Configuration(1)
            config.us_sales_tax_sourcing = 'destination'
            config.save()

            houston_address = self.address('TX', houston)
            # 6.25% state, 1% Houston and 1% Houston MTA
            self.assertEqual(
                self.compute(rule, placeholder, houston_address),
                Decimal('8.25'))
            tax_ids = rule.apply(
                placeholder, {'us_to_address': houston_address.id})
            self.assertEqual(len(tax_ids), 3)

            with self.assertRaises(UserError):
                self.compute(rule, placeholder, self.address('TX'))

    @with_transaction()
    def test_out_of_state(self):
        "Test no sales tax outside the state"
        company = create_company()
        with set_company(company):
            rosenberg, houston, placeholder, rule = self.setup(company)

            self.assertEqual(
                self.compute(rule, placeholder, self.address('OK')),
                Decimal(0))
            self.assertEqual(
                self.compute(
                    rule, placeholder, self.address(None, country='MX')),
                Decimal(0))

    @with_transaction()
    def test_exempt(self):
        "Test exempt customer"
        pool = Pool()
        TaxRule = pool.get('account.tax.rule')
        company = create_company()
        with set_company(company):
            rosenberg, houston, placeholder, rule = self.setup(company)
            exempt = TaxRule(name="Exempt", kind='sale')
            exempt.save()

            self.assertEqual(
                self.compute(exempt, placeholder, self.address('TX', houston)),
                Decimal(0))

    @with_transaction()
    def test_over_cap(self):
        "Test location over the local cap"
        pool = Pool()
        Location = pool.get('account.tax.us.location')
        Configuration = pool.get('account.configuration')
        company = create_company()
        with set_company(company):
            rosenberg, houston, placeholder, rule = self.setup(company)
            fort_worth, = Location.search([('name', '=', 'Fort Worth')])
            config = Configuration(1)
            config.us_sales_tax_origin = fort_worth
            config.save()

            with self.assertRaises(UserError):
                self.compute(rule, placeholder)

            fort_worth.jurisdictions = [
                j for j in fort_worth.jurisdictions if j.type != 'special']
            fort_worth.manual = True
            fort_worth.save()
            # 6.25% + 1% city, 0.5% county and 0.5% MTA
            self.assertEqual(
                self.compute(rule, placeholder), Decimal('8.25'))

    @with_transaction()
    def test_rate_change(self):
        "Test new quarter rates"
        pool = Pool()
        Import = pool.get('account.tax.us.import_texas', type='wizard')
        company = create_company()
        with set_company(company):
            rosenberg, houston, placeholder, rule = self.setup(company)
            # Create the taxes with the third quarter rate
            self.compute(rule, placeholder)

            session_id, _, _ = Import.create()
            wizard = Import(session_id)
            wizard.start.company = company
            wizard.start.file = rate_file('taxrates_q4.txt')
            wizard.transition_import_()
            self.assertEqual(wizard.result.changed, 1)

            self.assertEqual(
                self.compute(rule, placeholder,
                    date=datetime.date(2026, 9, 30)),
                Decimal('8.25'))
            self.assertEqual(
                self.compute(rule, placeholder,
                    date=datetime.date(2026, 10, 1)),
                Decimal('7.75'))


del ModuleTestCase
