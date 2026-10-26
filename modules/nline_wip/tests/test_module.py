# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.modules.company.tests import CompanyTestMixin
from trytond.tests.test_tryton import ModuleTestCase


class NlineWipTestCase(CompanyTestMixin, ModuleTestCase):
    'Test N-Line WIP module'
    module = 'nline_wip'


del ModuleTestCase
