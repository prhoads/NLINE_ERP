# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""N-Line screens: company and setup (UI upgrade phase 7)

The accounting periods and QuickBooks' "Set Closing Date": the periods
ending on or before the date are closed (no entry can be posted in them).
"""
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC

from .desk import _date


class DeskCompany(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__rpc__['close_periods'] = RPC(readonly=False)
        cls.__rpc__['periods'] = RPC()

    @classmethod
    def periods(cls):
        "Return the accounting periods with their state"
        cls._check_read('account.period')
        Period = Pool().get('account.period')
        company = cls._company()
        return [{
                'id': p.id,
                'name': p.rec_name,
                'fiscalyear': p.fiscalyear.rec_name,
                'start_date': p.start_date,
                'end_date': p.end_date,
                'state': p.state,
                } for p in Period.search([
                    ('company', '=', company.id),
                    ('type', '=', 'standard'),
                    ], order=[('start_date', 'DESC')])]

    @classmethod
    def close_periods(cls, date):
        """Close the open periods ending on or before the date (the
        closing date); return how many were closed"""
        Period = Pool().get('account.period')
        cls._check_create('account.period')
        date = _date(date)
        periods = Period.search([
                ('company', '=', cls._company().id),
                ('end_date', '<=', date),
                ('state', '=', 'open'),
                ])
        if periods:
            Period.close(periods)
        return len(periods)
