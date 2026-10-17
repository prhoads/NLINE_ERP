# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.modules.account.tests import create_chart
from trytond.modules.company.tests import create_company, set_company
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction


class AccountUSTestCase(ModuleTestCase):
    'Test Account US module'
    module = 'account_us'

    @with_transaction()
    def test_create_chart_nline(self):
        "Create N-Line Valves chart"
        pool = Pool()
        Account = pool.get('account.account')
        company = create_company()
        with set_company(company):
            create_chart(company, chart=self.module + '.nline')

            receivable, = Account.search([('code', '=', '1200')])
            self.assertTrue(receivable.type.receivable)
            self.assertTrue(receivable.reconcile)
            self.assertTrue(receivable.party_required)

            payable, = Account.search([('code', '=', '2000')])
            self.assertTrue(payable.type.payable)

            inventory, = Account.search([('code', '=', '1120')])
            self.assertTrue(inventory.type.stock)

            sub_account, = Account.search([('code', '=', '6902')])
            self.assertEqual(sub_account.parent.code, '6901')
            self.assertEqual(sub_account.parent.parent.code, '6900')

            self.assertEqual(
                Account.search([('code', '=', '4010')])[0].type.name,
                "Revenue")
            self.assertEqual(
                Account.search([('code', '=', '5010')])[0].type.name,
                "Cost of Goods Sold")


del ModuleTestCase
