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

from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
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
        return access


class ModelButton(metaclass=PoolMeta):
    __name__ = 'ir.model.button'

    @classmethod
    def get_groups(cls, model, name):
        groups = super().get_groups(model, name)
        if read_only_user():
            # Nobody's group: the buttons are read-only and refused
            return {-1}
        return groups
