# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""N-Line user roles

A role is a set of Tryton groups. Giving a user a role (in Tryton, or from
the N-Line BI Admin page through the nline_nlbi sign-in) gives them its groups
and takes away the groups of their previous role; groups an administrator
added by hand stay. A role with "All Groups" gives every group.

The group "N-Line Read Only" makes its users read-only everywhere: they see
the menus of their other groups but cannot create, change or delete records
nor click the buttons of records (post, confirm...).
"""
import json
from decimal import Decimal

from trytond.cache import Cache
from trytond.exceptions import UserError
from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.rpc import RPC
from trytond.transaction import Transaction, without_check_access

# What a read-only user still writes: their own screen settings, saved
# searches and exports, and the sessions of wizards (to print reports)
WRITABLE = {
    'ir.export',
    'ir.export.line',
    'ir.session.wizard',
    'ir.ui.menu.favorite',
    'ir.ui.view_search',
    'ir.ui.view_tree_optional',
    'ir.ui.view_tree_state',
    'ir.ui.view_tree_width',
    'res.user.warning',
    }


def read_only_group():
    "Return the id of the read-only group (None before the module is set)"
    ModelData = Pool().get('ir.model.data')
    try:
        return ModelData.get_id('nline_role', 'group_read_only')
    except KeyError:
        return None


def read_only_user():
    "Tell if the user of the transaction is read-only"
    transaction = Transaction()
    if transaction.user == 0:
        return False
    group = read_only_group()
    return bool(group) and group in Pool().get('res.user').get_groups()


class Role(ModelSQL, ModelView):
    "N-Line Role"
    __name__ = 'nline.role'
    name = fields.Char("Name", required=True)
    code = fields.Char("Code", required=True,
        help="The role's code on the N-Line BI Admin page.")
    all_groups = fields.Boolean("All Groups",
        help="Give every group (the administrators).")
    groups = fields.Many2Many('nline.role-res.group', 'role', 'group',
        "Groups",
        states={
            'invisible': Eval('all_groups', False),
            })
    users = fields.One2Many('res.user', 'nline_role', "Users", readonly=True)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('code_unique', Unique(t, t.code),
                'nline_role.msg_role_code_unique'),
            ]
        cls._order.insert(0, ('name', 'ASC'))

    @staticmethod
    def default_all_groups():
        return False

    def group_ids(self):
        "Return the ids of the groups the role gives"
        pool = Pool()
        Group = pool.get('res.group')
        if self.all_groups:
            with Transaction().set_context(_check_access=False):
                groups = {g.id for g in Group.search([])}
            groups.discard(read_only_group())
            return groups
        return {g.id for g in self.groups}

    @classmethod
    def write(cls, *args):
        pool = Pool()
        User = pool.get('res.user')
        super().write(*args)
        actions = iter(args)
        changed = []
        for roles, values in zip(actions, actions):
            if values.keys() & {'groups', 'all_groups'}:
                changed.extend(roles)
        if changed:
            with Transaction().set_context(active_test=False):
                users = User.search([('nline_role', 'in', changed)])
            User.apply_nline_role(users)

    @classmethod
    def delete(cls, roles):
        pool = Pool()
        User = pool.get('res.user')
        with Transaction().set_context(active_test=False):
            users = User.search([('nline_role', 'in', roles)])
        if users:
            User.write(users, {'nline_role': None})
        super().delete(roles)

    @classmethod
    def by_code(cls, code):
        "Return the role of the code or None"
        with Transaction().set_context(_check_access=False):
            roles = cls.search([('code', '=', code)], limit=1)
        return roles[0] if roles else None


class RoleGroup(ModelSQL):
    "N-Line Role - Group"
    __name__ = 'nline.role-res.group'
    role = fields.Many2One('nline.role', "Role", required=True,
        ondelete='CASCADE')
    group = fields.Many2One('res.group', "Group", required=True,
        ondelete='CASCADE')


class User(metaclass=PoolMeta):
    __name__ = 'res.user'
    nline_role = fields.Many2One('nline.role', "N-Line Role",
        ondelete='RESTRICT',
        help="Gives the groups of the role (set on the N-Line BI Admin page "
        "when the user signs in through N-Line BI).")
    # The groups the role gave, taken away when the role changes
    nline_role_groups = fields.Text("N-Line Role Groups", readonly=True)
    # The authority of the person (set on the N-Line BI Admin page)
    nline_po_limit = fields.Numeric("PO Limit", digits=(16, 2),
        help="The largest purchase order the user may quote or confirm, in "
        "the company currency (empty: no limit).")
    nline_wo_create = fields.Boolean("May Create Work Orders",
        help="Off: the user cannot create work orders, whatever their "
        "groups.")
    nline_wo_modify = fields.Boolean("May Change Work Orders",
        help="Off: the user cannot change work orders, whatever their "
        "groups (the shop floor buttons stay).")

    @staticmethod
    def default_nline_wo_create():
        return True

    @staticmethod
    def default_nline_wo_modify():
        return True

    @classmethod
    def create(cls, vlist):
        users = super().create(vlist)
        cls.apply_nline_role([u for u in users if u.nline_role])
        return users

    @classmethod
    def write(cls, *args):
        super().write(*args)
        actions = iter(args)
        to_apply = []
        for users, values in zip(actions, actions):
            if 'nline_role' in values:
                to_apply.extend(users)
        cls.apply_nline_role(to_apply)

    @classmethod
    @without_check_access
    def apply_nline_role(cls, users):
        "Give the users the groups of their role"
        for user in cls.browse([u.id for u in users]):
            previous = set(json.loads(user.nline_role_groups or '[]'))
            granted = user.nline_role.group_ids() if user.nline_role else set()
            current = {g.id for g in user.groups}
            groups = (current - previous) | granted
            values = {'nline_role_groups': json.dumps(sorted(granted))}
            if groups != current:
                values['groups'] = [
                    ('remove', sorted(current - groups)),
                    ('add', sorted(groups - current)),
                    ]
            if values['nline_role_groups'] != user.nline_role_groups or (
                    'groups' in values):
                super().write([user], values)

    @classmethod
    def set_nline_role(cls, user, code):
        """Give the user the role of the code (from the N-Line BI sign-in);
        an unknown code takes the role away"""
        pool = Pool()
        Role = pool.get('nline.role')
        role = Role.by_code(code) if code else None
        with Transaction().set_user(0):
            user = cls(user.id)
            if user.nline_role != role:
                cls.write([user], {'nline_role': role.id if role else None})
            else:
                # The groups of an "All Groups" role grow with new modules
                cls.apply_nline_role([user])
        return role

    @classmethod
    def set_nline_options(cls, user, options):
        """Give the user the authority of the N-Line BI Admin page:
        po_limit (amount or empty), wo_create, wo_modify"""
        options = options or {}
        values = {}
        if 'po_limit' in options:
            limit = options['po_limit']
            values['nline_po_limit'] = (Decimal(str(limit)).quantize(
                    Decimal('0.01'))
                if limit not in (None, '') else None)
        for key in ('wo_create', 'wo_modify'):
            if key in options:
                values['nline_' + key] = bool(options[key])
        with Transaction().set_user(0):
            user = cls(user.id)
            values = {k: v for k, v in values.items()
                if getattr(user, k) != v}
            if values:
                cls.write([user], values)


class Action(metaclass=PoolMeta):
    __name__ = 'ir.action'
    nline_writes = fields.Boolean("Creates or Changes Records",
        help="Its menus are hidden from read-only users.")

    @staticmethod
    def default_nline_writes():
        return False


class ActionURL(metaclass=PoolMeta):
    __name__ = 'ir.action.url'
    # (the other ir.action fields are mirrored when ir is set up, before
    # this module extends ir.action)
    nline_writes = fields.Function(fields.Boolean(
            "Creates or Changes Records"),
        'get_action', setter='set_action', searcher='search_action')

    @staticmethod
    def default_nline_writes():
        return False


class Menu(metaclass=PoolMeta):
    __name__ = 'ir.ui.menu'
    # The folders with a menu the groups may open: {groups: {folder ids}}
    _nline_folders = Cache('ir.ui.menu.nline_folders', duration=300,
        context=False)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__rpc__['nline_allowed'] = RPC()

    @classmethod
    def create(cls, vlist):
        cls._nline_folders.clear()
        return super().create(vlist)

    @classmethod
    def write(cls, *args):
        cls._nline_folders.clear()
        super().write(*args)

    @classmethod
    def delete(cls, menus):
        cls._nline_folders.clear()
        super().delete(menus)

    @classmethod
    def _nline_hidden(cls, menu):
        "Tell if a read-only user does not see the menu"
        return any(
            k.action.type == 'ir.action.wizard' or k.action.nline_writes
            for k in menu.action_keywords)

    @classmethod
    def search(cls, domain, offset=0, limit=None, order=None, count=False,
            query=False):
        transaction = Transaction()
        menus = super().search(domain, offset=offset, limit=limit,
            order=order, count=False, query=query)
        if (query or not transaction.check_access or transaction.user == 0
                or transaction.context.get('_nline_menus')):
            return len(menus) if count else menus
        if read_only_user():
            menus = [m for m in menus if not cls._nline_hidden(m)]
        # A folder without any menu the user may open is removed
        folders = cls._nline_open_folders()
        menus = [m for m in menus
            if m.action_keywords or m.id in folders]
        return len(menus) if count else menus

    @classmethod
    def _nline_open_folders(cls):
        "Return the ids of the folders with a menu the user may open"
        User = Pool().get('res.user')
        key = User.get_groups()
        folders = cls._nline_folders.get(key)
        if folders is not None:
            return set(folders)
        with Transaction().set_context(_nline_menus=True):
            menus = cls.search([])
        read_only = read_only_user()
        by_id = {m.id: m for m in menus}
        folders = set()
        for menu in menus:
            if not menu.action_keywords or (
                    read_only and cls._nline_hidden(menu)):
                continue
            parent = menu.parent
            while parent and parent.id in by_id and parent.id not in folders:
                folders.add(parent.id)
                parent = parent.parent
        cls._nline_folders.set(key, sorted(folders))
        return folders

    @classmethod
    def nline_allowed(cls):
        """Return what the user's menus open: the client refuses an address
        typed by hand to anything else ({'all': True} for administrators)"""
        pool = Pool()
        ModelData = pool.get('ir.model.data')
        User = pool.get('res.user')
        if ModelData.get_id('res', 'group_admin') in User.get_groups():
            return {'all': True}
        models, wizards, urls = set(), set(), set()
        for menu in cls.search([]):
            action = menu.action
            if not action or action.id < 0:
                continue
            if action.__name__ == 'ir.action.act_window':
                if action.res_model:
                    models.add(action.res_model)
            elif action.__name__ == 'ir.action.wizard':
                wizards.add(action.wiz_name)
            elif action.__name__ == 'ir.action.url':
                urls.add(action.url)
        return {
            'all': False,
            'models': sorted(models),
            'wizards': sorted(wizards),
            'urls': sorted(urls),
            }


def nline_user():
    "Return the user of the transaction (None for root)"
    transaction = Transaction()
    if transaction.user == 0:
        return None
    User = Pool().get('res.user')
    with transaction.set_context(_check_access=False):
        return User(transaction.user)


class ModelAccess(metaclass=PoolMeta):
    __name__ = 'ir.model.access'

    @classmethod
    def get_access(cls, models):
        access = super().get_access(models)
        if read_only_user():
            access = {
                m: a if m in WRITABLE else dict(
                    a, write=False, create=False, delete=False)
                for m, a in access.items()}
        if 'production' in access:
            # (empty: users from before the options may do both)
            user = nline_user()
            refused = lambda value: value is not None and not value
            if user and refused(user.nline_wo_create):
                access['production'] = dict(access['production'],
                    create=False, delete=False)
            if user and refused(user.nline_wo_modify):
                access['production'] = dict(access['production'],
                    write=False, delete=False)
        return access


class Purchase(metaclass=PoolMeta):
    __name__ = 'purchase.purchase'

    @classmethod
    def nline_check_limit(cls, purchases):
        "Refuse purchase orders over the user's PO limit"
        pool = Pool()
        Currency = pool.get('currency.currency')
        user = nline_user()
        limit = user.nline_po_limit if user else None
        if limit is None:
            return
        for purchase in purchases:
            amount = purchase.total_amount or Decimal(0)
            company = purchase.company
            if company and purchase.currency != company.currency:
                with Transaction().set_context(
                        date=purchase.purchase_date):
                    amount = Currency.compute(
                        purchase.currency, amount, company.currency)
            if amount > limit:
                raise UserError(gettext('nline_role.msg_po_over_limit',
                        amount=amount,
                        limit=limit))

    @classmethod
    def quote(cls, purchases):
        cls.nline_check_limit(purchases)
        super().quote(purchases)

    @classmethod
    def confirm(cls, purchases):
        cls.nline_check_limit(purchases)
        super().confirm(purchases)


class ModelButton(metaclass=PoolMeta):
    __name__ = 'ir.model.button'

    @classmethod
    def get_groups(cls, model, name):
        groups = super().get_groups(model, name)
        if read_only_user():
            # Nobody's group: the buttons are read-only and refused
            return {-1}
        return groups
