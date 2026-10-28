# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Currency Codes (VSharedCurrencyCode) on Tryton's currencies: the
thousands and decimal separators and the exchange rate as one field"""
from decimal import Decimal

from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.transaction import Transaction


class Currency(metaclass=PoolMeta):
    __name__ = 'currency.currency'

    thousands_separator = fields.Char(
        "Thousands Separator", size=1,
        help="The character between thousands on documents in this "
        "currency.")
    decimal_separator = fields.Char(
        "Decimal Separator", size=1,
        help="The character before the decimals on documents in this "
        "currency.")
    exchange_rate = fields.Function(fields.Numeric(
            "Exchange Rate", digits=(15, 8),
            help="Today's rate: the units of this currency for one unit of "
            "the base currency (setting it adds today's rate)."),
        'get_exchange_rate', setter='set_exchange_rate')

    @classmethod
    def default_thousands_separator(cls):
        return ','

    @classmethod
    def default_decimal_separator(cls):
        return '.'

    @classmethod
    def get_exchange_rate(cls, currencies, name):
        return cls.get_rate(currencies, 'rate')

    @classmethod
    def set_exchange_rate(cls, currencies, name, value):
        "Today's rate of the currencies (Jobshop keeps one rate)"
        pool = Pool()
        Rate = pool.get('currency.currency.rate')
        Date = pool.get('ir.date')
        if value is None:
            return
        today = Date.today()
        value = Decimal(str(value))
        with Transaction().set_context(_check_access=False):
            for currency in currencies:
                rates = Rate.search([
                        ('currency', '=', currency.id),
                        ('date', '=', today),
                        ])
                if rates:
                    Rate.write(rates, {'rate': value})
                else:
                    Rate.create([{
                                'currency': currency.id,
                                'date': today,
                                'rate': value,
                                }])


MODELS = [Currency]
