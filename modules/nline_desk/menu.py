# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.model import ModelSQL, ModelView, fields
from trytond.pool import Pool
from trytond.transaction import Transaction


class SupersededMenu(ModelSQL, ModelView):
    "Superseded Menu"
    __name__ = 'nline.desk.menu'

    menu = fields.Many2One(
        'ir.ui.menu', "Menu", required=True, ondelete='CASCADE',
        context={
            'active_test': False,
            },
        help="The standard Tryton menu entry an N-Line screen replaces.")
    superseded_by = fields.Char(
        "Superseded By",
        help="The N-Line screen to use instead.")
    hidden = fields.Boolean(
        "Hidden",
        help="Hide the menu entry for every user. Untick to show it again.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order.insert(0, ('superseded_by', 'ASC'))

    @classmethod
    def default_hidden(cls):
        return False

    def get_rec_name(self, name):
        return self.menu.rec_name

    @classmethod
    def create(cls, vlist):
        records = super().create(vlist)
        cls.apply(records)
        return records

    @classmethod
    def write(cls, *args):
        super().write(*args)
        cls.apply(sum(args[0:None:2], []))

    @classmethod
    def delete(cls, records):
        pool = Pool()
        Menu = pool.get('ir.ui.menu')
        menus = [r.menu for r in records if r.hidden]
        super().delete(records)
        # Deleting the line shows the menu again
        with Transaction().set_context(active_test=False):
            Menu.write(Menu.browse(menus), {'active': True})

    @classmethod
    def apply(cls, records):
        "Hide or show the menu entries (the standard active flag)"
        pool = Pool()
        Menu = pool.get('ir.ui.menu')
        to_hide = [r.menu for r in records if r.hidden and r.menu.active]
        to_show = [r.menu for r in records
            if not r.hidden and not r.menu.active]
        with Transaction().set_context(active_test=False):
            if to_hide:
                Menu.write(to_hide, {'active': False})
            if to_show:
                Menu.write(to_show, {'active': True})
