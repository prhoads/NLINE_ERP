# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.exceptions import UserError
from trytond.modules.company.tests import CompanyTestMixin
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction
from trytond.transaction import Transaction


class NlineDeskTestCase(CompanyTestMixin, ModuleTestCase):
    'Test N-Line Desk module'
    module = 'nline_desk'

    @with_transaction()
    def test_screens_check_access(self):
        "Test the screens refuse a user who may not create the records"
        pool = Pool()
        User = pool.get('res.user')
        Desk = pool.get('nline.desk')
        user, = User.create([{'login': 'jdoe', 'name': "Jane"}])
        with Transaction().set_user(user.id), \
                Transaction().set_context(_check_access=True):
            for method in [
                    Desk.enter_bill, Desk.write_check, Desk.pay_bills,
                    Desk.create_invoice, Desk.receive_payment,
                    Desk.make_deposit]:
                with self.subTest(method=method.__name__):
                    with self.assertRaises(UserError):
                        method({})


del ModuleTestCase
