# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import statement


def register():
    Pool.register(
        statement.StatementStart,
        module='nline_customer_statement', type_='model')
    Pool.register(
        statement.PrintStatement,
        module='nline_customer_statement', type_='wizard')
    Pool.register(
        statement.Statement,
        module='nline_customer_statement', type_='report')
