# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import role


def register():
    Pool.register(
        role.Role,
        role.RoleGroup,
        role.User,
        role.Action,
        role.ActionURL,
        role.Menu,
        role.ModelAccess,
        role.ModelButton,
        role.Purchase,
        module='nline_role', type_='model')
