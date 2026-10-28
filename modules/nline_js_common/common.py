# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Common: FOB points, shipping methods, product, commodity and
reason codes, as in VISUAL Jobshop (Common group bar)"""
from trytond.model import (
    DeactivableMixin, ModelSQL, ModelView, Unique, fields)


class CodeTable(DeactivableMixin, ModelSQL, ModelView):
    """A Jobshop code table: an ID (the code) and a description.

    Other N-Line Jobshop modules inherit it for their own tables (sales reps,
    territories, SIC codes...)."""
    __slots__ = ()
    code = fields.Char("ID", required=True, strip=True)
    description = fields.Char("Description")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('code_unique', Unique(t, t.code),
                'nline_js_common.msg_code_unique'),
            ]
        cls._order = [('code', 'ASC')]

    def get_rec_name(self, name):
        if self.description:
            return '%s - %s' % (self.code, self.description)
        return self.code

    @classmethod
    def search_rec_name(cls, name, clause):
        _, operator, *value = clause
        if operator.startswith('!') or operator.startswith('not '):
            bool_op = 'AND'
        else:
            bool_op = 'OR'
        return [bool_op,
            ('code',) + tuple(clause[1:]),
            ('description',) + tuple(clause[1:]),
            ]


class FOBPoint(CodeTable):
    "FOB Point"
    __name__ = 'nline.fob_point'


class ShipVia(CodeTable):
    "Shipping Method"
    __name__ = 'nline.ship_via'


class ProductCode(CodeTable):
    "Product Code"
    __name__ = 'nline.product_code'


class CommodityCode(CodeTable):
    "Commodity Code"
    __name__ = 'nline.commodity_code'


class ReasonCode(CodeTable):
    "Status Reason Code"
    __name__ = 'nline.reason_code'


# The classes this module registers (see __init__.py)
MODELS = [FOBPoint, ShipVia, ProductCode, CommodityCode, ReasonCode]
WIZARDS = []
REPORTS = []
