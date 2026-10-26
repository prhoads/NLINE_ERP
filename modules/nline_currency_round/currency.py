# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import decimal

from trytond.pool import PoolMeta


class Currency(metaclass=PoolMeta):
    __name__ = 'currency.currency'

    def round(self, amount, rounding=decimal.ROUND_HALF_UP, opposite=False):
        # Round half cents up as QuickBooks and US practice do instead of
        # half to even. An explicit rounding of the caller is kept.
        return super().round(amount, rounding=rounding, opposite=opposite)
