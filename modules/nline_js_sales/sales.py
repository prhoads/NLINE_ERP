# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Sales: Customers, sales orders, shipping, invoicing, service charges, tax groups, sales reps, territories, SIC codes, carriers, discount classes, as in VISUAL Jobshop"""
from . import code, desk, party, sale

# The classes this module registers (see __init__.py)
MODELS = [
    code.SalesRep, code.Territory, code.SicCode, code.Carrier,
    code.ServiceCharge, code.TaxGroup, code.TaxGroupLine,
    code.DiscountClass, code.SalePrice, code.SalePriceBreak, code.Charge,
    party.Party, party.Address,
    sale.Sale, sale.SaleLine, sale.InvoiceLine, sale.ShipmentOut,
    desk.Desk,
    ]
WIZARDS = []
REPORTS = []
