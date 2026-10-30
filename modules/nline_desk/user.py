# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.model import fields
from trytond.pool import PoolMeta


class User(metaclass=PoolMeta):
    __name__ = 'res.user'
    # Settings > Menu Layout (custom.js, desk menu-layout): the menu pane of
    # this user, as JSON: hidden menus, colour scheme, icon style, each
    # item's own icon and colour. A preference: every user saves their own.
    nline_menu_prefs = fields.Text("Menu Layout")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._preferences_fields.append('nline_menu_prefs')
