# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.model import ModelSQL, fields
from trytond.modules.company.model import CompanyValueMixin
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval

production_wip_account = fields.Many2One(
    'account.account', "Production WIP Account",
    domain=[
        ('closed', '!=', True),
        ('party_required', '=', False),
        ('company', '=', Eval('context', {}).get('company', -1)),
        ],
    help="The work in progress account debited with the components issued "
    "to productions and the cost of their operations, "
    "and credited with the cost of the goods produced.\n"
    "Leave empty to post productions to the stock in and out accounts of "
    "the products.")
production_applied_cost_account = fields.Many2One(
    'account.account', "Production Applied Cost Account",
    domain=[
        ('closed', '!=', True),
        ('party_required', '=', False),
        ('company', '=', Eval('context', {}).get('company', -1)),
        ],
    help="The account credited with the cost of the internal operations "
    "(hours by work center rate) charged to work in progress.")
production_variance_account = fields.Many2One(
    'account.account', "Production Variance Account",
    domain=[
        ('closed', '!=', True),
        ('party_required', '=', False),
        ('company', '=', Eval('context', {}).get('company', -1)),
        ],
    help="The account charged with the cost differences found after a "
    "production is done, such as a supplier bill of an outside operation "
    "that differs from its purchase.")


class Configuration(metaclass=PoolMeta):
    __name__ = 'account.configuration'
    production_wip_account = fields.MultiValue(production_wip_account)
    production_applied_cost_account = fields.MultiValue(
        production_applied_cost_account)
    production_variance_account = fields.MultiValue(
        production_variance_account)

    @classmethod
    def multivalue_model(cls, field):
        pool = Pool()
        if field in {
                'production_wip_account', 'production_applied_cost_account',
                'production_variance_account'}:
            return pool.get('account.configuration.production_account')
        return super().multivalue_model(field)


class ConfigurationProductionAccount(ModelSQL, CompanyValueMixin):
    "Account Configuration Production Account"
    __name__ = 'account.configuration.production_account'
    production_wip_account = fields.Many2One(
        'account.account', "Production WIP Account",
        domain=[
            ('closed', '!=', True),
            ('party_required', '=', False),
            ('company', '=', Eval('company', -1)),
            ])
    production_applied_cost_account = fields.Many2One(
        'account.account', "Production Applied Cost Account",
        domain=[
            ('closed', '!=', True),
            ('party_required', '=', False),
            ('company', '=', Eval('company', -1)),
            ])
    production_variance_account = fields.Many2One(
        'account.account', "Production Variance Account",
        domain=[
            ('closed', '!=', True),
            ('party_required', '=', False),
            ('company', '=', Eval('company', -1)),
            ])


class Move(metaclass=PoolMeta):
    __name__ = 'account.move'

    @classmethod
    def _get_origin(cls):
        return super()._get_origin() + ['production.work.cycle']
