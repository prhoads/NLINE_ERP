# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import account, production, stock


def register():
    Pool.register(
        account.Configuration,
        account.ConfigurationProductionAccount,
        account.Move,
        stock.Location,
        stock.Move,
        production.RoutingStep,
        production.Work,
        production.WorkCycle,
        production.Production,
        module='nline_wip', type_='model')
