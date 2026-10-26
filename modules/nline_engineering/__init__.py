# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import engineering


def register():
    Pool.register(
        engineering.Template,
        engineering.Product,
        engineering.ProductBom,
        engineering.BOM,
        engineering.BOMInput,
        module='nline_engineering', type_='model')
