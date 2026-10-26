# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import decimal
from decimal import Decimal

from trytond.modules.currency.tests import create_currency
from trytond.tests.test_tryton import ModuleTestCase, with_transaction


class NlineCurrencyRoundTestCase(ModuleTestCase):
    'Test N-Line Currency Round module'
    module = 'nline_currency_round'

    @with_transaction()
    def test_round_half_up(self):
        "Test half cents are rounded up"
        currency = create_currency('USD')
        self.assertEqual(currency.round(Decimal('165.625')), Decimal('165.63'))
        self.assertEqual(currency.round(Decimal('0.125')), Decimal('0.13'))
        self.assertEqual(currency.round(Decimal('-0.125')), Decimal('-0.13'))
        self.assertEqual(currency.round(Decimal('0.124')), Decimal('0.12'))

    @with_transaction()
    def test_round_explicit(self):
        "Test an explicit rounding is kept"
        currency = create_currency('USD')
        self.assertEqual(
            currency.round(
                Decimal('165.625'), rounding=decimal.ROUND_HALF_EVEN),
            Decimal('165.62'))
        # The opposite of half up is half down
        self.assertEqual(
            currency.round(Decimal('0.125'), opposite=True),
            Decimal('0.12'))

    @with_transaction()
    def test_tax_amount(self):
        "Test the Texas tax of the US-practice test ST-7"
        currency = create_currency('USD')
        self.assertEqual(
            currency.round(Decimal('2007.58') * Decimal('0.0825')),
            Decimal('165.63'))


del ModuleTestCase
