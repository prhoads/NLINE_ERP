# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Inventory: Parts, units of measure, unit conversions, locations, adjustments / transfers / physical counts, as in VISUAL Jobshop"""
from . import desk, part, partinfo, stock

# The classes this module registers (see __init__.py)
MODELS = [
    part.Template,
    part.PartLocation,
    part.UnitConversion,
    part.Configuration,
    stock.Move,
    stock.ShipmentIn,
    desk.Desk,
    partinfo.Desk,
    ]
WIZARDS = []
REPORTS = []
