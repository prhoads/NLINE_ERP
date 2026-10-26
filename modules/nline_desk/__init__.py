# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import desk, menu


def register():
    Pool.register(
        desk.Configuration,
        desk.ConfigurationAccount,
        desk.PaymentTerm,
        desk.PaymentJournal,
        desk.Desk,
        menu.SupersededMenu,
        module='nline_desk', type_='model')
