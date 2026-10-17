# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import tax


def register():
    Pool.register(
        tax.Configuration,
        tax.Jurisdiction,
        tax.JurisdictionRate,
        tax.Location,
        tax.LocationJurisdiction,
        tax.Tax,
        tax.TaxRule,
        tax.Address,
        tax.InvoiceLine,
        tax.ImportTexasStart,
        tax.ImportTexasResult,
        tax.Party,
        module='account_tax_us', type_='model')
    Pool.register(
        tax.SaleLine,
        module='account_tax_us', type_='model', depends=['sale'])
    Pool.register(
        tax.ImportTexas,
        module='account_tax_us', type_='wizard')
