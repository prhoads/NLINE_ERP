# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop's Executive Information windows (VExecutive/*): one line per
figure, "Total Value of <status> <documents> from <date> to <date>" and its
value, with the "..." that lists the documents (the report behind it)"""
import datetime as dt
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .report_engineering import _quote_head, _quotes
from .reports import (
    PURCHASE_STATUS, SALE_STATUS, WORK_ORDER_STATUS, Params, received,
    shipped)

ZERO = Decimal(0)
CENT = Decimal('0.01')

QUOTE_CHOICES = ['All', 'Active', 'Ready', 'Won', 'Lost']
ORDER_CHOICES = ['All', 'Firmed', 'Released', 'Closed', 'Cancelled']
WO_CHOICES = ['All', 'Unreleased', 'Firmed', 'Released', 'Closed',
    'Cancelled']


def _amount(value):
    return Decimal(str(value or 0)).quantize(CENT)


def _between(date, start, end):
    if date is None:
        return not start and not end
    return (not start or date >= start) and (not end or date <= end)


class DeskExecutiveValues(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__rpc__['jsadmin_exec_values'] = RPC()

    @classmethod
    def jsadmin_exec_values(cls, kind, values=None):
        """The lines of an Executive Information window
        values: {line key: {status, from, to, proforma}}
        Returns [{key, label, statuses, status, dates, from, to, value,
        report}] (report: the js-reports route listing the documents)"""
        if kind not in cls.EXEC:
            raise ValidationError(gettext(
                    'nline_js_admin.msg_unknown_action', action=kind))
        cls._check_read(*cls.EXEC[kind])
        values = values or {}
        with Transaction().set_context(company=cls._company().id):
            Date = Pool().get('ir.date')
            today = Date.today()
            return getattr(cls, '_exec_values_' + kind)(values, today)

    @staticmethod
    def _choice(values, key, default='All'):
        line = values.get(key) or {}
        start = line.get('from')
        end = line.get('to')
        start = dt.date.fromisoformat(start[:10]) if isinstance(start,
            str) and start else (start or None)
        end = dt.date.fromisoformat(end[:10]) if isinstance(end, str) \
            and end else (end or None)
        return line.get('status') or default, start, end, line

    @classmethod
    def _exec_values_sales(cls, values, today):
        pool = Pool()
        Sale = pool.get('sale.sale')
        company = cls._company().id
        result = []
        # Quotes (nline.quote when installed, else the sales not confirmed)
        status, start, end, line = cls._choice(values, 'quotes', 'Active')
        total = ZERO
        for quote in _quotes(Params({})):
            head = _quote_head(quote)
            if status != 'All' and head.get('status') != status:
                continue
            if not _between(head.get('date'), start, end):
                continue
            amount = _amount(head.get('amount'))
            if line.get('proforma'):
                probability = getattr(quote, 'win_probability', None)
                amount = (amount * Decimal(str(probability or 0)) / 100
                    ).quantize(CENT)
            total += amount
        result.append({'key': 'quotes', 'label': "Total Value of",
                'statuses': QUOTE_CHOICES, 'status': status, 'dates': True,
                'noun': "Quotes from", 'from': start, 'to': end,
                'proforma': bool(line.get('proforma')), 'value': total,
                'report': 'js-reports/estimating/quote_list'})
        # Sales orders
        status, start, end, line = cls._choice(values, 'orders', 'Released')
        sales = Sale.search([('company', '=', company),
                ('state', 'not in', ['draft', 'quotation'])])
        total = ZERO
        for sale in sales:
            if status != 'All' and SALE_STATUS.get(sale.state) != status:
                continue
            if _between(sale.sale_date, start, end):
                total += _amount(sale.untaxed_amount)
        result.append({'key': 'orders', 'label': "Total Value of",
                'statuses': ORDER_CHOICES, 'status': status, 'dates': True,
                'noun': "Sales Orders from", 'from': start, 'to': end,
                'value': total,
                'report': 'js-reports/sales/sales_order_list'})
        backlog = late = hold = ZERO
        for sale in sales:
            if sale.state not in ('confirmed', 'processing'):
                continue
            for sale_line in sale.lines:
                if sale_line.type != 'line':
                    continue
                due = max((sale_line.quantity or 0) - shipped(sale_line), 0)
                value = _amount(Decimal(str(due))
                    * (sale_line.unit_price or ZERO))
                backlog += value
                wanted = sale_line.shipping_date or sale.shipping_date
                if wanted and wanted < today:
                    late += value
            if getattr(sale, 'on_hold', False) or getattr(
                    sale.party, 'credit_hold', False):
                hold += _amount(sale.untaxed_amount)
        result += [
            {'key': 'backlog', 'label':
                "Total Value of Backlogged Sales Orders", 'value': backlog,
                'report': 'js-reports/sales/backlog'},
            {'key': 'late', 'label': "Total Value of Late Sales Orders",
                'value': late, 'report': 'js-reports/sales/line_backlog'},
            {'key': 'hold', 'label': "Total Value of Sales Orders on Hold",
                'value': hold, 'report': 'js-reports/sales/sales_order_list'},
            ]
        return result

    @classmethod
    def _exec_values_purchasing(cls, values, today):
        Purchase = Pool().get('purchase.purchase')
        purchases = Purchase.search([('company', '=', cls._company().id),
                ('state', '!=', 'draft')])
        status, start, end, line = cls._choice(values, 'orders', 'Released')
        total = late = uncommitted = ZERO
        for purchase in purchases:
            if (status == 'All' or PURCHASE_STATUS.get(purchase.state)
                    == status) and _between(purchase.purchase_date, start,
                    end):
                total += _amount(purchase.untaxed_amount)
            if purchase.state not in ('confirmed', 'processing'):
                continue
            for po_line in purchase.lines:
                if po_line.type != 'line':
                    continue
                due = max((po_line.quantity or 0) - received(po_line), 0)
                value = _amount(Decimal(str(due))
                    * (po_line.unit_price or ZERO))
                uncommitted += value
                wanted = po_line.delivery_date or purchase.delivery_date
                if wanted and wanted < today:
                    late += value
        return [
            {'key': 'orders', 'label': "Total Value of", 'statuses':
                ORDER_CHOICES, 'status': status, 'dates': True, 'noun':
                "Purchase Orders from", 'from': start, 'to': end,
                'value': total,
                'report': 'js-reports/purchasing/purchase_order_list'},
            {'key': 'late', 'label': "Total Value of Late Purchase Orders "
                "(Firm or Released)", 'value': late,
                'report': 'js-reports/purchasing/po_line_backlog'},
            {'key': 'uncommitted', 'label': "Total Value of UnCommitted "
                "Materials on Open Purchase Orders (Firm or Released)",
                'value': uncommitted,
                'report': 'js-reports/purchasing/po_line_backlog'},
            ]

    @classmethod
    def _wo_values(cls, production):
        "Projected (estimate) and actual cost of a work order"
        material, labor, _ = cls._exec_production_costs(production)
        estimate = ZERO
        for move in production.inputs:
            price = move.product.cost_price or ZERO
            estimate += Decimal(str(move.quantity)) * price
        actual = material + labor
        return _amount(max(estimate, actual)), _amount(actual - estimate)

    @classmethod
    def _exec_values_production(cls, values, today):
        Production = Pool().get('production')
        productions = Production.search([('company', '=',
                    cls._company().id)])
        open_status, o_start, o_end, _ = cls._choice(values, 'open',
            'Released')
        over_status, v_start, v_end, _ = cls._choice(values, 'overage',
            'Closed')
        open_total = overage = late = hold = ZERO
        for production in productions:
            label = WORK_ORDER_STATUS.get(production.state)
            date = production.planned_start_date or production.planned_date
            projected, over = None, None
            if (open_status == 'All' or label == open_status) and _between(
                    date, o_start, o_end):
                projected, over = cls._wo_values(production)
                open_total += projected
            if (over_status == 'All' or label == over_status) and _between(
                    date, v_start, v_end):
                if over is None:
                    projected, over = cls._wo_values(production)
                if over > 0:
                    overage += over
            if production.state in ('draft', 'waiting', 'assigned',
                    'running'):
                if production.planned_date and \
                        production.planned_date < today:
                    if projected is None:
                        projected, over = cls._wo_values(production)
                    late += projected
                if getattr(production, 'on_hold', False):
                    if projected is None:
                        projected, over = cls._wo_values(production)
                    hold += projected
        return [
            {'key': 'open', 'label': "Total Projected Value of", 'statuses':
                WO_CHOICES, 'status': open_status, 'dates': True, 'noun':
                "Work Orders from", 'from': o_start, 'to': o_end,
                'value': open_total,
                'report': 'js-reports/shopfloor/work_order_list'},
            {'key': 'overage', 'label': "Total Overage Amount of",
                'statuses': WO_CHOICES, 'status': over_status, 'dates': True,
                'noun': "Work Orders from", 'from': v_start, 'to': v_end,
                'value': overage,
                'report': 'js-reports/shopfloor/work_order_cost'},
            {'key': 'late', 'label': "Total Projected Value of Late Work "
                "Orders (Firm or Released)", 'value': late,
                'report': 'js-reports/shopfloor/schedule_performance'},
            {'key': 'hold', 'label': "Total Projected Value of Work Orders "
                "on Hold", 'value': hold,
                'report': 'js-reports/shopfloor/work_order_list'},
            ]

    @classmethod
    def _exec_values_financials(cls, values, today):
        pool = Pool()
        Invoice = pool.get('account.invoice')
        Product = pool.get('product.product')
        Location = pool.get('stock.location')
        Production = pool.get('production')
        _, start, end, _ = cls._choice(values, 'invoiced')
        domain = [('company', '=', cls._company().id), ('type', '=', 'out'),
            ('state', 'in', ['posted', 'paid'])]
        if start:
            domain.append(('invoice_date', '>=', start))
        if end:
            domain.append(('invoice_date', '<=', end))
        invoiced = sum((_amount(i.untaxed_amount)
                for i in Invoice.search(domain)), ZERO)
        inventory = ZERO
        storage = [l.id for l in Location.search([('type', '=', 'storage')])]
        if storage:
            quantities = Product.products_by_location(storage,
                with_childs=False, grouping=('product',))
            products = Product.browse(list({k[1] for k, v in
                        quantities.items() if v}))
            cost = {p.id: p.cost_price or ZERO for p in products}
            for (location, product), qty in quantities.items():
                if qty:
                    inventory += Decimal(str(qty)) * cost.get(product, ZERO)
        wip = ZERO
        for production in Production.search([
                    ('company', '=', cls._company().id),
                    ('state', 'in', ['request', 'draft', 'waiting',
                            'assigned', 'running'])]):
            material, labor, _ = cls._exec_production_costs(production)
            wip += material + labor
        return [
            {'key': 'invoiced', 'label':
                "Total Value of Invoiced Shippers from", 'dates': True,
                'from': start, 'to': end, 'value': invoiced,
                'report': 'js-reports/sales/invoice_list'},
            {'key': 'inventory', 'label':
                "Total Current Value of Inventory", 'value':
                _amount(inventory),
                'report': 'js-reports/inventory/inventory_value'},
            {'key': 'wip', 'label': "Total Current Value of Work In "
                "Progress (Unreleased, Firm, or Released Work Orders)",
                'value': _amount(wip),
                'report': 'js-reports/shopfloor/wip_value'},
            ]
