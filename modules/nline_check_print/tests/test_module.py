# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import unittest
from decimal import Decimal

from trytond.modules.company.tests import CompanyTestMixin
from trytond.tests.test_tryton import ModuleTestCase

from ..payment import amount_to_words


class AmountToWordsTestCase(unittest.TestCase):
    "Test amount in words"

    def test_amounts(self):
        for amount, words in [
                ('0.50', "Zero and 50/100"),
                ('1', "One and 00/100"),
                ('15.05', "Fifteen and 05/100"),
                ('40', "Forty and 00/100"),
                ('99.99', "Ninety-Nine and 99/100"),
                ('100', "One Hundred and 00/100"),
                ('1234.56',
                    "One Thousand Two Hundred Thirty-Four and 56/100"),
                ('20000', "Twenty Thousand and 00/100"),
                ('466295.10', "Four Hundred Sixty-Six Thousand "
                    "Two Hundred Ninety-Five and 10/100"),
                ('1000001', "One Million One and 00/100"),
                ]:
            with self.subTest(amount=amount):
                self.assertEqual(amount_to_words(Decimal(amount)), words)


class NlineCheckPrintTestCase(CompanyTestMixin, ModuleTestCase):
    'Test N-Line Check Print module'
    module = 'nline_check_print'


del ModuleTestCase
