# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Administration: User Manager and Authority Manager

- Jobshop users are Tryton users (res.user), Jobshop roles Tryton groups
  (res.group). People sign in through N-Line BI: no password is ever set or
  stored here. Their N-Line role (nline_role) and its options (PO limit,
  work orders) come from the BI Admin page at each sign-in.
- The Authority Manager is a matrix of the Jobshop screens (the menus of the
  group bar and of the QuickBooks folders) by user or by role: a screen is
  allowed when the user is in one of the groups of the menu, of its folders
  and of its action (as Tryton shows menus). Allowing a screen to a user
  gives them a group of the menu; denying takes those groups away. By role,
  allowing or denying adds or removes the group on the menu.
"""
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

# The modules whose menus are the screens of the Authority Manager
MENU_MODULES = ['nline_jobshop', 'nline_desk']

# The per-user options of nline_role (set from the BI Admin page too)
OPTIONS = [
    ('nline_po_limit', "PO Limit"),
    ('nline_wo_create', "May Create Work Orders"),
    ('nline_wo_modify', "May Change Work Orders"),
    ]


class DeskUsers(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['jsadmin_user_save', 'jsadmin_role_save',
                'jsadmin_authority_set']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['jsadmin_users', 'jsadmin_authorities']:
            cls.__rpc__[name] = RPC()

    # ---- User Manager ----------------------------------------------------

    @staticmethod
    def _user_values(user):
        values = {
            'id': user.id,
            'login': user.login,
            'name': user.name or '',
            'email': user.email or '',
            'active': user.active,
            'groups': sorted(g.id for g in user.groups),
            }
        role = getattr(user, 'nline_role', None)
        values['nline_role'] = {'id': role.id, 'rec_name': role.rec_name} \
            if role else None
        for name, _ in OPTIONS:
            if hasattr(user, name):
                value = getattr(user, name)
                if name != 'nline_po_limit' and value is not None:
                    value = bool(value)
                values[name] = value
        values['active'] = bool(values['active'])
        return values

    @classmethod
    def jsadmin_users(cls):
        """The User Manager: the users with their roles (groups), the roles
        with their users and the N-Line roles of the BI Admin page"""
        cls._check_read('res.user', 'res.group')
        pool = Pool()
        User = pool.get('res.user')
        Group = pool.get('res.group')
        with Transaction().set_context(active_test=False):
            users = User.search([('id', '!=', 0)],
                order=[('login', 'ASC')])
        groups = Group.search([], order=[('name', 'ASC')])
        members = {}
        for user in users:
            for group in user.groups:
                members.setdefault(group.id, []).append(user.id)
        roles = []
        try:
            Role = pool.get('nline.role')
            cls._check_read('nline.role')
            roles = [{
                    'id': r.id,
                    'name': r.name,
                    'code': r.code,
                    'all_groups': r.all_groups,
                    'groups': sorted(g.id for g in r.groups),
                    } for r in Role.search([])]
        except (KeyError, Exception):
            roles = []
        return {
            'users': [cls._user_values(u) for u in users],
            'groups': [{
                    'id': g.id,
                    'name': g.name,
                    'users': members.get(g.id, []),
                    } for g in groups],
            'nline_roles': roles,
            'options': [{'name': n, 'label': l} for n, l in OPTIONS
                if n in User._fields],
            }

    @classmethod
    def jsadmin_user_save(cls, values):
        """Create or change a user: login, name, email, active, groups (the
        ids of their roles), nline_role, the options; never a password (the
        users sign in through N-Line BI)"""
        pool = Pool()
        User = pool.get('res.user')
        user_id = values.get('id')
        if user_id:
            cls._check_write('res.user')
        else:
            cls._check_create('res.user')
        write = {}
        for name in ['login', 'name', 'email']:
            if name in values:
                write[name] = (values[name] or '').strip() or None
        if 'login' in write and not write['login']:
            raise ValidationError(gettext('nline_js_admin.msg_login_required'))
        if 'active' in values:
            write['active'] = bool(values['active'])
        if 'nline_role' in values and 'nline_role' in User._fields:
            role = values['nline_role']
            write['nline_role'] = role.get('id') if isinstance(role, dict) \
                else role
        for name, _ in OPTIONS:
            if name in values and name in User._fields:
                value = values[name]
                if name == 'nline_po_limit':
                    write[name] = Decimal(str(value)).quantize(
                        Decimal('0.01')) if value not in (None, '') else None
                else:
                    write[name] = bool(value)
        if user_id:
            with Transaction().set_context(active_test=False):
                user = User(user_id)
            if write:
                User.write([user], write)
        else:
            if not write.get('login'):
                raise ValidationError(gettext(
                        'nline_js_admin.msg_login_required'))
            company = cls._company()
            write.setdefault('companies', [('add', [company.id])])
            write.setdefault('company', company.id)
            user, = User.create([write])
        if 'groups' in values:
            # After the role: the groups it gave stay unless unticked
            user = User(user.id)
            current = {g.id for g in user.groups}
            wanted = {int(g) for g in values['groups'] or []}
            if current != wanted:
                User.write([user], {'groups': [
                            ('remove', sorted(current - wanted)),
                            ('add', sorted(wanted - current)),
                            ]})
        with Transaction().set_context(active_test=False):
            return cls._user_values(User(user.id))

    @classmethod
    def jsadmin_role_save(cls, values):
        """Create or rename a role (Tryton group) and set its users
        values: id, name, users (ids)"""
        pool = Pool()
        Group = pool.get('res.group')
        User = pool.get('res.user')
        if values.get('id'):
            cls._check_write('res.group')
            group = Group(values['id'])
            if values.get('name') and values['name'] != group.name:
                Group.write([group], {'name': values['name']})
        else:
            cls._check_create('res.group')
            if not values.get('name'):
                raise ValidationError(gettext(
                        'nline_js_admin.msg_role_name_required'))
            group, = Group.create([{'name': values['name']}])
        if 'users' in values:
            cls._check_write('res.user')
            with Transaction().set_context(active_test=False):
                current = {u.id for u in User.search([
                            ('groups', '=', group.id)])}
            wanted = {int(u) for u in values['users'] or []}
            for user_id in wanted - current:
                User.write([User(user_id)], {'groups': [
                            ('add', [group.id])]})
            for user_id in current - wanted:
                User.write([User(user_id)], {'groups': [
                            ('remove', [group.id])]})
        return group.id

    # ---- Authority Manager -----------------------------------------------

    @classmethod
    def _screens(cls):
        """The menus of the Jobshop group bar and the QuickBooks folders:
        id, path, name, the groups each needs (menu, folders, action)"""
        pool = Pool()
        Menu = pool.get('ir.ui.menu')
        ModelData = pool.get('ir.model.data')
        with Transaction().set_context(_check_access=False,
                active_test=False):
            data = ModelData.search([
                    ('module', 'in', MENU_MODULES),
                    ('model', '=', 'ir.ui.menu'),
                    ])
            ids = {d.db_id for d in data}
            menus = {m.id: m for m in Menu.browse(sorted(ids))
                if m.active}
        screens = []

        def needs(menu):
            "The group sets the menu needs: one of each set"
            result = []
            node = menu
            while node:
                if node.groups:
                    result.append(sorted(g.id for g in node.groups))
                node = node.parent
            for keyword in menu.action_keywords:
                action = keyword.action
                groups = getattr(action, 'groups', None)
                if groups:
                    result.append(sorted(g.id for g in groups))
            return result

        def path(menu):
            names = []
            node = menu
            while node:
                names.append(node.name)
                node = node.parent
            return ' / '.join(reversed(names))

        for menu in sorted(menus.values(), key=lambda m: path(m)):
            if not menu.action_keywords:
                continue
            screens.append({
                    'id': menu.id,
                    'name': menu.name,
                    'path': path(menu),
                    'folder': path(menu.parent) if menu.parent else '',
                    'module': 'jobshop' if any(d.db_id == menu.id
                        and d.module == 'nline_jobshop' for d in data)
                    else 'desk',
                    'groups': sorted(g.id for g in menu.groups),
                    'needs': needs(menu),
                    })
        return screens

    @staticmethod
    def _with_parents(groups):
        "The groups and the groups they inherit (res.group parent)"
        result = set()
        for group in groups:
            node = group
            while node and node.id not in result:
                result.add(node.id)
                node = getattr(node, 'parent', None)
        return result

    @classmethod
    def jsadmin_authorities(cls):
        """The Authority Manager: the screens, the users and the roles with
        what each may open; the options of the users"""
        cls._check_read('res.user', 'res.group')
        pool = Pool()
        User = pool.get('res.user')
        Group = pool.get('res.group')
        ModelData = pool.get('ir.model.data')
        admin = ModelData.get_id('res', 'group_admin')
        screens = cls._screens()
        users = []
        for user in User.search([('id', '!=', 0)],
                order=[('login', 'ASC')]):
            have = cls._with_parents(user.groups)
            values = cls._user_values(user)
            values['allowed'] = [s['id'] for s in screens
                if all(have & set(n) for n in s['needs'])]
            values['admin'] = admin in have
            users.append(values)
        groups = [{
                'id': g.id,
                'name': g.name,
                'allowed': [s['id'] for s in screens
                    if all(cls._with_parents([g]) & set(n)
                        for n in s['needs'])],
                } for g in Group.search([], order=[('name', 'ASC')])]
        return {
            'screens': screens,
            'users': users,
            'groups': groups,
            'options': [{'name': n, 'label': l} for n, l in OPTIONS
                if n in User._fields],
            }

    @classmethod
    def jsadmin_authority_set(cls, values):
        """Allow or deny a screen
        values: menu, allow (bool), and user (gives or takes the groups of
        the menu) or group (adds the group to or removes it from the menu)
        Returns the matrix again"""
        pool = Pool()
        Menu = pool.get('ir.ui.menu')
        User = pool.get('res.user')
        Group = pool.get('res.group')
        screens = {s['id']: s for s in cls._screens()}
        screen = screens.get(values['menu'])
        if not screen:
            raise ValidationError(gettext(
                    'nline_js_admin.msg_unknown_screen'))
        allow = bool(values.get('allow'))
        if values.get('user'):
            cls._check_write('res.user')
            user = User(values['user'])
            have = cls._with_parents(user.groups)
            if allow:
                add = []
                for need in screen['needs']:
                    if not have & set(need):
                        # The group of the menu with the fewest users
                        group = min(Group.browse(need),
                            key=lambda g: (len(g.users), g.name))
                        add.append(group.id)
                        have |= cls._with_parents([group])
                if add:
                    User.write([user], {'groups': [('add', add)]})
            else:
                need = set(screen['needs'][0]) if screen['needs'] else set()
                if not need:
                    raise ValidationError(gettext(
                            'nline_js_admin.msg_screen_for_everyone'))
                remove = sorted(need & {g.id for g in user.groups})
                if remove:
                    User.write([user], {'groups': [('remove', remove)]})
        elif values.get('group'):
            cls._check_write('ir.ui.menu')
            menu = Menu(screen['id'])
            group = int(values['group'])
            current = {g.id for g in menu.groups}
            if allow:
                # The group on the menu, its folders and its action where
                # they need groups (a menu for everyone stays for everyone)
                node = menu
                while node:
                    groups = {g.id for g in node.groups}
                    if groups and group not in groups:
                        Menu.write([node], {'groups': [('add', [group])]})
                    node = node.parent
                Action = pool.get('ir.action')
                for keyword in menu.action_keywords:
                    action = Action(keyword.action.id)
                    groups = {g.id for g in action.groups}
                    if groups and group not in groups:
                        cls._check_write('ir.action')
                        Action.write([action], {'groups': [
                                    ('add', [group])]})
            elif not allow and group in current:
                if current == {group}:
                    raise ValidationError(gettext(
                            'nline_js_admin.msg_last_group_of_screen'))
                Menu.write([menu], {'groups': [('remove', [group])]})
        return cls.jsadmin_authorities()
