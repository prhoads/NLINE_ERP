# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from collections import defaultdict
from decimal import Decimal

from trytond.model import ModelView, Workflow, fields
from trytond.modules.currency.fields import Monetary
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.tools import grouped_slice


class Configuration(metaclass=PoolMeta):
    __name__ = 'sale.configuration'
    cost_order_root = fields.Many2One(
        'analytic_account.account', "Cost Order Root",
        domain=[
            ('type', '=', 'root'),
            ('parent', '=', None),
            ],
        help="The analytic root under which a cost order account is created "
        "for each confirmed sale.\n"
        "Leave empty to not create cost orders.")


class Sale(metaclass=PoolMeta):
    __name__ = 'sale.sale'

    cost_order = fields.Many2One(
        'analytic_account.account', "Cost Order", readonly=True,
        domain=[
            ('type', '=', 'normal'),
            ('company', '=', Eval('company', -1)),
            ],
        help="The analytic account carrying the freight, crating, "
        "documentation, certificates and tests of the order.")
    cost_order_revenue = fields.Function(Monetary(
            "Revenue", currency='currency', digits='currency'),
        'get_cost_order_amounts')
    cost_order_bills = fields.Function(Monetary(
            "Supplier Bills", currency='currency', digits='currency'),
        'get_cost_order_amounts')
    cost_order_cogs = fields.Function(Monetary(
            "Cost of Goods Shipped", currency='currency', digits='currency'),
        'get_cost_order_amounts')
    cost_order_margin = fields.Function(Monetary(
            "Margin", currency='currency', digits='currency'),
        'get_cost_order_amounts')
    cost_order_margin_rate = fields.Function(fields.Numeric(
            "Margin Rate", digits=(16, 4)),
        'get_cost_order_amounts')

    @classmethod
    @ModelView.button
    @Workflow.transition('confirmed')
    def confirm(cls, sales):
        super().confirm(sales)
        cls.create_cost_orders(sales)

    @classmethod
    def create_cost_orders(cls, sales):
        """Create the analytic account of the sales without one and set it
        on their lines"""
        pool = Pool()
        Account = pool.get('analytic_account.account')
        Entry = pool.get('analytic.account.entry')
        Configuration = pool.get('sale.configuration')
        root = Configuration(1).cost_order_root
        if not root:
            return
        to_create = [s for s in sales if not s.cost_order]
        accounts = []
        for sale in to_create:
            accounts.append(Account(
                    name=sale.number,
                    code=sale.number,
                    company=sale.company,
                    type='normal',
                    root=root,
                    parent=root,
                    ))
        Account.save(accounts)
        entries = []
        for sale, account in zip(to_create, accounts):
            sale.cost_order = account
            for line in sale.lines:
                if line.type != 'line':
                    continue
                for entry in line.analytic_accounts:
                    if entry.root == root:
                        entry.account = account
                        entries.append(entry)
                        break
                else:
                    entries.append(Entry(
                            origin=line, root=root, account=account))
        Entry.save(entries)
        cls.save(to_create)

    @classmethod
    def get_cost_order_amounts(cls, sales, names):
        pool = Pool()
        AnalyticLine = pool.get('analytic_account.line')
        Uom = pool.get('product.uom')

        result = {n: defaultdict(Decimal) for n in names}
        revenue, bills = defaultdict(Decimal), defaultdict(Decimal)
        account2sale = {s.cost_order.id: s.id for s in sales if s.cost_order}
        for sub in grouped_slice(list(account2sale)):
            lines = AnalyticLine.search([
                    ('account', 'in', list(sub)),
                    ('move_line.move.state', '=', 'posted'),
                    ])
            for line in lines:
                sale_id = account2sale[line.account.id]
                account_type = line.move_line.account.type
                if account_type.revenue:
                    revenue[sale_id] += line.credit - line.debit
                elif account_type.expense:
                    bills[sale_id] += line.debit - line.credit

        cogs = defaultdict(Decimal)
        for sale in sales:
            for move in sale.moves:
                if move.state != 'done':
                    continue
                quantity = Decimal(str(Uom.compute_qty(
                            move.unit, move.quantity,
                            move.product.default_uom)))
                cost = quantity * (move.cost_price or 0)
                if move.to_location.type == 'customer':
                    cogs[sale.id] += cost
                elif move.from_location.type == 'customer':
                    cogs[sale.id] -= cost

        for sale in sales:
            currency = sale.currency
            values = {
                'cost_order_revenue': currency.round(revenue[sale.id]),
                'cost_order_bills': currency.round(bills[sale.id]),
                'cost_order_cogs': currency.round(cogs[sale.id]),
                }
            values['cost_order_margin'] = (values['cost_order_revenue']
                - values['cost_order_bills'] - values['cost_order_cogs'])
            if values['cost_order_revenue']:
                values['cost_order_margin_rate'] = (
                    values['cost_order_margin']
                    / values['cost_order_revenue']).quantize(
                        Decimal('0.0001'))
            else:
                values['cost_order_margin_rate'] = None
            for name in names:
                result[name][sale.id] = values[name]
        return result

    @classmethod
    def copy(cls, sales, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('cost_order', None)
        return super().copy(sales, default=default)
