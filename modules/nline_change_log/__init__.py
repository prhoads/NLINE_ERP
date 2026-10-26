# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import change_log


def register():
    Pool.register(
        change_log.ChangeLogLine,
        change_log.ChangeLogStart,
        change_log.ChangeLogResult,
        module='nline_change_log', type_='model')
    for module, models in change_log.TRACKED.items():
        Pool.register(
            *[change_log.history_mixin(m) for m in models],
            module='nline_change_log', type_='model', depends=[module])
    Pool.register(
        change_log.ChangeLog,
        module='nline_change_log', type_='wizard')
