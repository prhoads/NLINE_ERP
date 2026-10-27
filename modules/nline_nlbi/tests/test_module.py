# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import time

from trytond.config import config
from trytond.exceptions import LoginException
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction
from trytond.transaction import Transaction

from ..user import sign, verify

SECRET = 'test-secret'


class NlineNlbiTestCase(ModuleTestCase):
    'Test N-Line BI sign-in module'
    module = 'nline_nlbi'

    def setUp(self):
        super().setUp()
        saved = {}
        for section, option, value in [
                ('nlbi', 'secret', SECRET),
                ('session', 'authentications', 'nlbi,password')]:
            if not config.has_section(section):
                config.add_section(section)
            saved[section, option] = config.get(section, option)
            config.set(section, option, value)

        def restore():
            for (section, option), value in saved.items():
                if value is None:
                    config.remove_option(section, option)
                else:
                    config.set(section, option, value)
        self.addCleanup(restore)

    def token(self, login, **extra):
        payload = {
            'login': login,
            'name': 'Jane Doe',
            'database': Transaction().database.name,
            'time': time.time(),
            }
        payload.update(extra)
        return sign(payload, extra.pop('secret', SECRET))

    def test_verify(self):
        "Test the token checks"
        token = sign({'login': 'jdoe', 'time': 1000}, SECRET)
        self.assertEqual(verify(token, SECRET, now=1050)['login'], 'jdoe')
        self.assertIsNone(verify(token, SECRET, now=1200))
        self.assertIsNone(verify(token, 'other', now=1050))
        self.assertIsNone(verify(token[:-1] + '0', SECRET, now=1050))
        self.assertIsNone(verify('', SECRET))
        self.assertIsNone(verify(token, '', now=1050))

    @with_transaction()
    def test_login_creates_user(self):
        "Test a first N-Line BI sign-in creates the Tryton user"
        pool = Pool()
        User = pool.get('res.user')
        user_id = User.get_login('jdoe', {'nlbi_token': self.token('jdoe')})
        user = User(user_id)
        self.assertEqual((user.login, user.name), ('jdoe', 'Jane Doe'))
        self.assertFalse(user.groups)
        self.assertEqual(
            User.get_login('jdoe', {'nlbi_token': self.token('jdoe')}),
            user_id)

    @with_transaction()
    def test_login_role(self):
        "Test the role of the token gives the Tryton groups"
        pool = Pool()
        User = pool.get('res.user')
        Role = pool.get('nline.role')
        role = Role.by_code('production_user')
        user_id = User.get_login('jdoe', {
                'nlbi_token': self.token('jdoe', role='production_user')})
        user = User(user_id)
        self.assertEqual(user.nline_role, role)
        self.assertEqual({g.id for g in user.groups}, role.group_ids())

        # No role in the token: unchanged
        User.get_login('jdoe', {'nlbi_token': self.token('jdoe')})
        self.assertEqual(User(user_id).nline_role, role)

        # A role unknown to Tryton: no groups
        User.get_login('jdoe', {'nlbi_token': self.token('jdoe', role='x')})
        user = User(user_id)
        self.assertIsNone(user.nline_role)
        self.assertFalse(user.groups)

    @with_transaction()
    def test_login_options(self):
        "Test the options of the token set the user's authority"
        pool = Pool()
        User = pool.get('res.user')
        user_id = User.get_login('jdoe', {'nlbi_token': self.token('jdoe',
                    options={'po_limit': 2500, 'wo_create': False,
                        'wo_modify': True})})
        user = User(user_id)
        self.assertEqual(user.nline_po_limit, 2500)
        self.assertFalse(user.nline_wo_create)
        self.assertTrue(user.nline_wo_modify)

    @with_transaction()
    def test_login_refused(self):
        "Test a wrong token signs nobody in"
        pool = Pool()
        User = pool.get('res.user')
        for token in [
                self.token('other'),
                self.token('jdoe', database='nline'),
                self.token('jdoe', time=time.time() - 3600),
                sign({
                        'login': 'jdoe',
                        'time': time.time(),
                        'database': Transaction().database.name,
                        }, 'wrong-secret'),
                ]:
            with self.subTest(token=token):
                # Not signed in: Tryton asks for the password instead
                with self.assertRaises(LoginException):
                    User.get_login('jdoe', {'nlbi_token': token})
        self.assertFalse(User.search([('login', '=', 'jdoe')]))

    @with_transaction()
    def test_inactive_user(self):
        "Test an inactive Tryton user is refused"
        pool = Pool()
        User = pool.get('res.user')
        user, = User.create([{'login': 'jdoe', 'name': "Jane"}])
        User.write([user], {'active': False})
        with self.assertRaises(LoginException):
            User.get_login('jdoe', {'nlbi_token': self.token('jdoe')})


del ModuleTestCase
