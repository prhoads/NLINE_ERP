# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Purchasing: Suppliers, requests for quote, purchase orders, receiving, services, tax groups, as in VISUAL Jobshop"""
from . import desk, party, product, purchase, rfq, stock

# The classes this module registers (see __init__.py)
MODELS = [
    party.Party,
    party.Address,
    product.ProductSupplier,
    product.ProductSupplierPrice,
    rfq.RequestForQuote,
    rfq.RequestForQuoteLine,
    rfq.RequestForQuoteLinePrice,
    rfq.RequestForQuoteLink,
    purchase.Purchase,
    purchase.PurchaseLine,
    purchase.PurchaseLink,
    stock.ShipmentIn,
    stock.ShipmentInReturn,
    stock.Move,
    desk.Desk,
    ]
WIZARDS = []
REPORTS = []
