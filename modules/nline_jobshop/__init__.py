# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import jobshop

__all__ = ['register']


def register():
    Pool.register(
        *jobshop.MODELS,
        module='nline_jobshop', type_='model')
    Pool.register(
        *jobshop.WIZARDS,
        module='nline_jobshop', type_='wizard')
    Pool.register(
        *jobshop.REPORTS,
        module='nline_jobshop', type_='report')
