# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction
from trytond.transaction import Transaction


class NlineRoleTestCase(ModuleTestCase):
    'Test N-Line role module'
    module = 'nline_role'

    def group(self, xml_id):
        ModelData = Pool().get('ir.model.data')
        return ModelData.get_id(*xml_id.split('.'))

    def role(self, code):
        Role = Pool().get('nline.role')
        return Role.by_code(code)

    @with_transaction()
    def test_seeded_roles(self):
        "Test the five roles are proposed"
        Role = Pool().get('nline.role')
        self.assertEqual(sorted(r.code for r in Role.search([])), [
                'accounting_user', 'accounts_specialist', 'admin',
                'production_specialist', 'production_user'])

    @with_transaction()
    def test_role_gives_groups(self):
        "Test a role gives its groups and the next role replaces them"
        pool = Pool()
        User = pool.get('res.user')
        production = self.role('production_specialist')
        accounting = self.role('accounting_user')
        user, = User.create([{
                    'login': 'jdoe', 'name': "Jane",
                    'nline_role': production.id,
                    }])
        self.assertEqual(
            {g.id for g in user.groups}, production.group_ids())
        self.assertIn(self.group('production.group_production'),
            {g.id for g in user.groups})

        # A group given by hand stays when the role changes
        extra = self.group('currency.group_currency_admin')
        User.write([user], {'groups': [('add', [extra])]})
        User.write([user], {'nline_role': accounting.id})
        user = User(user.id)
        self.assertEqual({g.id for g in user.groups},
            accounting.group_ids() | {extra})
        self.assertIn(self.group('nline_role.group_read_only'),
            {g.id for g in user.groups})

        User.write([user], {'nline_role': None})
        self.assertEqual({g.id for g in User(user.id).groups}, {extra})

    @with_transaction()
    def test_role_change_updates_users(self):
        "Test changing the groups of a role changes its users"
        pool = Pool()
        User = pool.get('res.user')
        Role = pool.get('nline.role')
        role = self.role('production_user')
        user, = User.create([{
                    'login': 'jdoe', 'name': "Jane", 'nline_role': role.id}])
        stock = self.group('stock.group_stock')
        Role.write([role], {'groups': [('remove', [stock])]})
        self.assertNotIn(stock, {g.id for g in User(user.id).groups})

    @with_transaction()
    def test_admin_all_groups(self):
        "Test the admin role gives every group but read-only"
        pool = Pool()
        Group = pool.get('res.group')
        admin = self.role('admin')
        groups = {g.id for g in Group.search([])}
        self.assertEqual(admin.group_ids(),
            groups - {self.group('nline_role.group_read_only')})

    @with_transaction()
    def test_set_nline_role(self):
        "Test the role from the N-Line BI sign-in"
        pool = Pool()
        User = pool.get('res.user')
        user, = User.create([{'login': 'jdoe', 'name': "Jane"}])
        self.assertEqual(
            User.set_nline_role(user, 'production_user'),
            self.role('production_user'))
        self.assertEqual(
            User(user.id).nline_role, self.role('production_user'))
        self.assertIsNone(User.set_nline_role(user, 'unknown'))
        user = User(user.id)
        self.assertIsNone(user.nline_role)
        self.assertFalse(user.groups)

    @with_transaction()
    def test_read_only(self):
        "Test a read-only role reads but does not write nor click"
        pool = Pool()
        User = pool.get('res.user')
        ModelAccess = pool.get('ir.model.access')
        Button = pool.get('ir.model.button')
        reader, writer = User.create([{
                    'login': 'reader', 'name': "Reader",
                    'nline_role': self.role('accounting_user').id,
                    }, {
                    'login': 'writer', 'name': "Writer",
                    'nline_role': self.role('accounts_specialist').id,
                    }])
        models = ['account.move', 'production', 'ir.ui.view_tree_width']
        with Transaction().set_user(reader.id):
            access = ModelAccess.get_access(models)
            groups = Button.get_groups('account.move', 'post')
        self.assertTrue(access['account.move']['read'])
        self.assertFalse(access['account.move']['write'])
        self.assertFalse(access['production']['create'])
        self.assertTrue(access['ir.ui.view_tree_width']['write'])
        self.assertEqual(groups, {-1})
        with Transaction().set_user(writer.id):
            access = ModelAccess.get_access(models)
            groups = Button.get_groups('account.move', 'post')
        self.assertTrue(access['account.move']['write'])
        self.assertTrue(access['production']['create'])
        self.assertNotEqual(groups, {-1})

    @with_transaction()
    def test_menus(self):
        "Test the menus a role sees"
        pool = Pool()
        User = pool.get('res.user')
        Menu = pool.get('ir.ui.menu')
        reader, production = User.create([{
                    'login': 'reader', 'name': "Reader",
                    'nline_role': self.role('accounting_user').id,
                    }, {
                    'login': 'prod', 'name': "Production",
                    'nline_role': self.role('production_specialist').id,
                    }])
        financial = self.group('account.menu_account')
        productions = self.group('production.menu_production')

        def visible(user):
            with Transaction().set_user(user.id), \
                    Transaction().set_context(_check_access=True):
                Menu._nline_folders.clear()
                menus = Menu.search([])
                allowed = Menu.nline_allowed()
            return menus, allowed

        menus, allowed = visible(reader)
        ids = {m.id for m in menus}
        self.assertIn(financial, ids)
        self.assertFalse([m for m in menus if Menu._nline_hidden(m)])
        self.assertIn('account.move', allowed['models'])
        self.assertFalse(allowed['wizards'])
        # No folder without anything to open
        for menu in menus:
            if not menu.action_keywords:
                self.assertTrue(any(m.parent == menu for m in menus),
                    menu.rec_name)

        menus, allowed = visible(production)
        ids = {m.id for m in menus}
        self.assertNotIn(financial, ids)
        self.assertIn(productions, ids)
        self.assertNotIn('account.move', allowed['models'])
        self.assertIn('production', allowed['models'])

        self.assertEqual(Menu.nline_allowed(), {'all': True})


del ModuleTestCase
