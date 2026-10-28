# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Executive Information: the key figures and charts of sales,
purchasing, production and financials, from Tryton's documents

Each dashboard is {title, tiles: [{label, value, type, hint}], charts:
[{title, kind: 'bar'|'line'|'hbar', labels, series: [{label, values}],
money}], tables: [{title, columns, rows}]}; the screen draws the charts in
SVG.
"""
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

ZERO = Decimal(0)
CENT = Decimal('0.01')

OPEN_SALE = ['confirmed', 'processing']
OPEN_PURCHASE = ['confirmed', 'processing']
OPEN_PRODUCTION = ['request', 'draft', 'waiting', 'assigned', 'running']


def months_back(today, count=12):
    "The first days of the last count months, oldest first"
    result = []
    year, month = today.year, today.month
    for _ in range(count):
        result.append(dt.date(year, month, 1))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(result))


def month_key(date):
    return dt.date(date.year, date.month, 1) if date else None


def month_label(date):
    return date.strftime('%b %y')


def money(value):
    return Decimal(value or 0).quantize(CENT)


class DeskExecutive(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__rpc__['jsadmin_exec'] = RPC()

    EXEC = {
        'sales': ('sale.sale',),
        'purchasing': ('purchase.purchase',),
        'production': ('production',),
        'financials': ('account.move.line', 'account.account'),
        }

    @classmethod
    def jsadmin_exec(cls, kind, months=12):
        "The dashboard of Executive Information > Sales, Purchasing..."
        if kind not in cls.EXEC:
            raise ValidationError(gettext(
                    'nline_js_admin.msg_unknown_action', action=kind))
        cls._check_read(*cls.EXEC[kind])
        Date = Pool().get('ir.date')
        with Transaction().set_context(company=cls._company().id):
            today = Date.today()
        months = max(3, min(int(months or 12), 36))
        result = getattr(cls, '_exec_' + kind)(today, months_back(today,
                months))
        result['as_of'] = today
        return result

    @staticmethod
    def _monthly(months, values):
        return [money(values.get(m, ZERO)) for m in months]

    @classmethod
    def _shipped_quantity(cls, line):
        "The quantity of the sale line shipped to the customer"
        shipped = 0.0
        for move in line.moves:
            if move.state != 'done':
                continue
            sign = 1 if move.to_location.type == 'customer' else -1
            shipped += sign * move.quantity
        return shipped

    @classmethod
    def _exec_sales(cls, today, months):
        pool = Pool()
        Sale = pool.get('sale.sale')
        Move = pool.get('stock.move')
        Invoice = pool.get('account.invoice')
        company = cls._company()
        start = months[0]
        bookings = defaultdict(lambda: ZERO)
        by_customer = defaultdict(lambda: ZERO)
        for sale in Sale.search([
                    ('company', '=', company.id),
                    ('state', 'in', OPEN_SALE + ['done']),
                    ('sale_date', '>=', start),
                    ]):
            amount = sale.untaxed_amount or ZERO
            bookings[month_key(sale.sale_date)] += amount
            by_customer[sale.party.rec_name] += amount
        backlog = ZERO
        backlog_lines = 0
        late = 0
        for sale in Sale.search([
                    ('company', '=', company.id),
                    ('state', 'in', OPEN_SALE),
                    ]):
            for line in sale.lines:
                if line.type != 'line' or not line.product:
                    continue
                due = (line.quantity or 0) - cls._shipped_quantity(line)
                if due <= 0:
                    continue
                backlog += Decimal(str(due)) * (line.unit_price or ZERO)
                backlog_lines += 1
                date = line.shipping_date or sale.shipping_date
                if date and date < today:
                    late += 1
        shipments = defaultdict(lambda: ZERO)
        for move in Move.search([
                    ('company', '=', company.id),
                    ('state', '=', 'done'),
                    ('to_location.type', '=', 'customer'),
                    ('effective_date', '>=', start),
                    ]):
            shipments[month_key(move.effective_date)] += Decimal(
                str(move.quantity)) * (move.unit_price or ZERO)
        invoiced = defaultdict(lambda: ZERO)
        for invoice in Invoice.search([
                    ('company', '=', company.id),
                    ('type', '=', 'out'),
                    ('state', 'in', ['posted', 'paid']),
                    ('invoice_date', '>=', start),
                    ]):
            invoiced[month_key(invoice.invoice_date)] += \
                invoice.untaxed_amount or ZERO
        quotes = Sale.search([
                ('company', '=', company.id),
                ('state', 'in', ['draft', 'quotation']),
                ])
        quote_value = sum((q.untaxed_amount or ZERO for q in quotes), ZERO)
        this_month = months[-1]
        year_start = dt.date(today.year, 1, 1)
        top = sorted(by_customer.items(), key=lambda i: -i[1])[:10]
        return {
            'title': "Sales",
            'tiles': [
                {'label': "Bookings This Month", 'type': 'money',
                    'value': money(bookings.get(this_month))},
                {'label': "Bookings Year to Date", 'type': 'money',
                    'value': money(sum((v for k, v in bookings.items()
                                if k >= year_start), ZERO))},
                {'label': "Backlog", 'type': 'money', 'value': money(
                        backlog), 'hint': "%s open lines" % backlog_lines},
                {'label': "Late Order Lines", 'type': 'int',
                    'value': late, 'bad': late > 0},
                {'label': "Shipments This Month", 'type': 'money',
                    'value': money(shipments.get(this_month))},
                {'label': "Invoiced This Month", 'type': 'money',
                    'value': money(invoiced.get(this_month))},
                {'label': "Open Quotes", 'type': 'money',
                    'value': money(quote_value),
                    'hint': "%s quotes" % len(quotes)},
                ],
            'charts': [
                {'title': "Bookings and Shipments", 'kind': 'bar',
                    'money': True,
                    'labels': [month_label(m) for m in months],
                    'series': [
                        {'label': "Bookings",
                            'values': cls._monthly(months, bookings)},
                        {'label': "Shipments",
                            'values': cls._monthly(months, shipments)},
                        ]},
                {'title': "Invoiced Sales", 'kind': 'line', 'money': True,
                    'labels': [month_label(m) for m in months],
                    'series': [{'label': "Invoiced",
                            'values': cls._monthly(months, invoiced)}]},
                {'title': "Top Customers (Bookings)", 'kind': 'hbar',
                    'money': True,
                    'labels': [t[0] for t in top],
                    'series': [{'label': "Bookings",
                            'values': [money(t[1]) for t in top]}]},
                ],
            'tables': [],
            }

    @classmethod
    def _exec_purchasing(cls, today, months):
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        Move = pool.get('stock.move')
        company = cls._company()
        start = months[0]
        open_value = ZERO
        open_count = 0
        late_lines = 0
        for purchase in Purchase.search([
                    ('company', '=', company.id),
                    ('state', 'in', OPEN_PURCHASE),
                    ]):
            open_count += 1
            for line in purchase.lines:
                if line.type != 'line':
                    continue
                received = sum((m.quantity for m in line.moves
                        if m.state == 'done'), 0.0)
                due = (line.quantity or 0) - received
                if due <= 0:
                    continue
                open_value += Decimal(str(due)) * (line.unit_price or ZERO)
                date = line.delivery_date
                if date and date < today:
                    late_lines += 1
        ordered = defaultdict(lambda: ZERO)
        by_supplier = defaultdict(lambda: ZERO)
        for purchase in Purchase.search([
                    ('company', '=', company.id),
                    ('state', 'in', OPEN_PURCHASE + ['done']),
                    ('purchase_date', '>=', start),
                    ]):
            amount = purchase.untaxed_amount or ZERO
            ordered[month_key(purchase.purchase_date)] += amount
            by_supplier[purchase.party.rec_name] += amount
        receipts = defaultdict(lambda: ZERO)
        for move in Move.search([
                    ('company', '=', company.id),
                    ('state', '=', 'done'),
                    ('from_location.type', '=', 'supplier'),
                    ('effective_date', '>=', start),
                    ]):
            receipts[month_key(move.effective_date)] += Decimal(
                str(move.quantity)) * (move.unit_price or ZERO)
        payable = cls._readable_balance('payable', today)
        top = sorted(by_supplier.items(), key=lambda i: -i[1])[:10]
        this_month = months[-1]
        result = {
            'title': "Purchasing",
            'tiles': [
                {'label': "Open Purchase Orders", 'type': 'int',
                    'value': open_count},
                {'label': "Open PO Value", 'type': 'money',
                    'value': money(open_value)},
                {'label': "Late PO Lines", 'type': 'int',
                    'value': late_lines, 'bad': late_lines > 0},
                {'label': "Ordered This Month", 'type': 'money',
                    'value': money(ordered.get(this_month))},
                {'label': "Receipts This Month", 'type': 'money',
                    'value': money(receipts.get(this_month))},
                ],
            'charts': [
                {'title': "Orders and Receipts", 'kind': 'bar',
                    'money': True,
                    'labels': [month_label(m) for m in months],
                    'series': [
                        {'label': "Ordered",
                            'values': cls._monthly(months, ordered)},
                        {'label': "Received",
                            'values': cls._monthly(months, receipts)},
                        ]},
                {'title': "Top Suppliers (Ordered)", 'kind': 'hbar',
                    'money': True,
                    'labels': [t[0] for t in top],
                    'series': [{'label': "Ordered",
                            'values': [money(t[1]) for t in top]}]},
                ],
            'tables': [],
            }
        if payable:
            # Only for the users who see the accounting
            result['tiles'].append({'label': "Accounts Payable",
                    'type': 'money', 'value': payable['total']})
            result['charts'].append({'title': "Payables Aging",
                    'kind': 'bar', 'money': True,
                    'labels': payable['labels'],
                    'series': [{'label': "Payables",
                            'values': payable['buckets']}]})
        return result

    @classmethod
    def _production_costs(cls, production):
        "Actual material and labor of the work order"
        material = ZERO
        for move in production.inputs:
            if move.state != 'done':
                continue
            price = move.cost_price if move.cost_price is not None else (
                move.product.cost_price or ZERO)
            material += Decimal(str(move.quantity)) * price
        labor = ZERO
        hours = 0.0
        for work in getattr(production, 'works', None) or []:
            for cycle in work.cycles:
                if cycle.state != 'done':
                    continue
                labor += cycle.cost or ZERO
                if cycle.duration:
                    hours += cycle.duration.total_seconds() / 3600
        return money(material), money(labor), hours

    @classmethod
    def _exec_production(cls, today, months):
        pool = Pool()
        Production = pool.get('production')
        company = cls._company()
        start = months[0]
        wip_value = ZERO
        open_count = 0
        late = 0
        late_rows = []
        by_state = defaultdict(int)
        for production in Production.search([
                    ('company', '=', company.id),
                    ('state', 'in', OPEN_PRODUCTION),
                    ], order=[('planned_date', 'ASC')]):
            open_count += 1
            by_state[production.state] += 1
            if production.state in {'waiting', 'assigned', 'running'}:
                material, labor, _ = cls._production_costs(production)
                wip_value += material + labor
            date = production.planned_date
            if date and date < today and production.state != 'request':
                late += 1
                if len(late_rows) < 15:
                    late_rows.append([production.number or '',
                            production.product.rec_name
                            if production.product else '',
                            production.quantity, date,
                            (today - date).days])
        completed = defaultdict(int)
        hours = defaultdict(float)
        center_hours = defaultdict(float)
        for production in Production.search([
                    ('company', '=', company.id),
                    ('state', '=', 'done'),
                    ('effective_date', '>=', start),
                    ]):
            completed[month_key(production.effective_date)] += 1
        try:
            Cycle = pool.get('production.work.cycle')
            for cycle in Cycle.search([
                        ('state', '=', 'done'),
                        ('work.company', '=', company.id),
                        ('create_date', '>=', dt.datetime.combine(start,
                                dt.time())),
                        ]):
                if not cycle.duration:
                    continue
                h = cycle.duration.total_seconds() / 3600
                hours[month_key(cycle.create_date.date())] += h
                center = cycle.work.work_center
                center_hours[center.rec_name if center else '-'] += h
        except KeyError:
            pass
        this_month = months[-1]
        state_labels = {
            'request': "Unreleased", 'draft': "Firmed",
            'waiting': "Released", 'assigned': "Released (Materials)",
            'running': "Started"}
        top = sorted(center_hours.items(), key=lambda i: -i[1])[:10]
        return {
            'title': "Production",
            'tiles': [
                {'label': "Open Work Orders", 'type': 'int',
                    'value': open_count},
                {'label': "Late Work Orders", 'type': 'int', 'value': late,
                    'bad': late > 0},
                {'label': "WIP Value", 'type': 'money',
                    'value': money(wip_value)},
                {'label': "Completed This Month", 'type': 'int',
                    'value': completed.get(this_month, 0)},
                {'label': "Labor Hours This Month", 'type': 'num',
                    'value': round(hours.get(this_month, 0.0), 1)},
                ],
            'charts': [
                {'title': "Work Orders Completed", 'kind': 'bar',
                    'labels': [month_label(m) for m in months],
                    'series': [{'label': "Completed",
                            'values': [completed.get(m, 0)
                                for m in months]}]},
                {'title': "Labor Hours", 'kind': 'line',
                    'labels': [month_label(m) for m in months],
                    'series': [{'label': "Hours",
                            'values': [round(hours.get(m, 0.0), 1)
                                for m in months]}]},
                {'title': "Open Work Orders by Status", 'kind': 'hbar',
                    'labels': [state_labels.get(s, s) for s in by_state],
                    'series': [{'label': "Work Orders",
                            'values': list(by_state.values())}]},
                {'title': "Hours by Resource", 'kind': 'hbar',
                    'labels': [t[0] for t in top],
                    'series': [{'label': "Hours",
                            'values': [round(t[1], 1) for t in top]}]},
                ],
            'tables': [
                {'title': "Late Work Orders",
                    'columns': [
                        {'label': "Work Order", 'type': 'char'},
                        {'label': "Part", 'type': 'char'},
                        {'label': "Quantity", 'type': 'qty'},
                        {'label': "Want Date", 'type': 'date'},
                        {'label': "Days Late", 'type': 'int'},
                        ],
                    'rows': late_rows},
                ],
            }

    @classmethod
    def _readable_balance(cls, kind, today):
        "The open balance when the user may read the accounting, else None"
        access = Pool().get('ir.model.access').get_access(
            ['account.move.line'])
        if not access.get('account.move.line', {}).get('read'):
            return None
        return cls._open_balance(kind, today)

    @classmethod
    def _open_balance(cls, kind, today):
        "The open receivable or payable lines by age"
        pool = Pool()
        Line = pool.get('account.move.line')
        labels = ["Current", "1 - 30", "31 - 60", "61 - 90", "> 90"]
        buckets = [ZERO] * len(labels)
        for line in Line.search([
                    ('company', '=', cls._company().id),
                    ('account.type.%s' % kind, '=', True),
                    ('move.state', '=', 'posted'),
                    ('reconciliation', '=', None),
                    ]):
            amount = line.debit - line.credit
            if kind == 'payable':
                amount = -amount
            days = (today - (line.maturity_date or line.date)).days
            index = (0 if days <= 0 else 1 if days <= 30 else 2
                if days <= 60 else 3 if days <= 90 else 4)
            buckets[index] += amount
        buckets = [money(b) for b in buckets]
        return {'labels': labels, 'buckets': buckets,
            'total': sum(buckets, ZERO)}

    @classmethod
    def _exec_financials(cls, today, months):
        pool = Pool()
        Line = pool.get('account.move.line')
        PaymentJournal = None
        try:
            PaymentJournal = pool.get('account.payment.journal')
        except KeyError:
            pass
        company = cls._company()
        start = months[0]
        receivable = cls._open_balance('receivable', today)
        payable = cls._open_balance('payable', today)
        revenue = defaultdict(lambda: ZERO)
        expense = defaultdict(lambda: ZERO)
        for line in Line.search([
                    ('company', '=', company.id),
                    ('move.state', '=', 'posted'),
                    ('date', '>=', start),
                    ['OR',
                        ('account.type.revenue', '=', True),
                        ('account.type.expense', '=', True),
                        ],
                    ]):
            key = month_key(line.date)
            if line.account.type.revenue:
                revenue[key] += line.credit - line.debit
            else:
                expense[key] += line.debit - line.credit
        # Cash: the bank accounts of the payment journals
        banks = set()
        if PaymentJournal:
            for journal in PaymentJournal.search([]):
                account = getattr(journal, 'bank_account', None)
                if account:
                    banks.add(account.id)
        cash = ZERO
        cash_by_month = defaultdict(lambda: ZERO)
        if banks:
            opening = ZERO
            for line in Line.search([
                        ('account', 'in', list(banks)),
                        ('move.state', '=', 'posted'),
                        ]):
                amount = line.debit - line.credit
                cash += amount
                if line.date < start:
                    opening += amount
                else:
                    cash_by_month[month_key(line.date)] += amount
            running = opening
            balances = []
            for m in months:
                running += cash_by_month.get(m, ZERO)
                balances.append(money(running))
        else:
            balances = [ZERO for m in months]
        year_start = dt.date(today.year, 1, 1)
        net_ytd = sum((revenue[k] - expense[k] for k in set(revenue) |
                set(expense) if k >= year_start), ZERO)
        this_month = months[-1]
        return {
            'title': "Financials",
            'tiles': [
                {'label': "Cash", 'type': 'money', 'value': money(cash)},
                {'label': "Accounts Receivable", 'type': 'money',
                    'value': receivable['total']},
                {'label': "AR Over 30 Days", 'type': 'money',
                    'value': money(sum(receivable['buckets'][2:], ZERO)),
                    'bad': sum(receivable['buckets'][2:], ZERO) > 0},
                {'label': "Accounts Payable", 'type': 'money',
                    'value': payable['total']},
                {'label': "Revenue This Month", 'type': 'money',
                    'value': money(revenue.get(this_month))},
                {'label': "Net Income Year to Date", 'type': 'money',
                    'value': money(net_ytd), 'bad': net_ytd < 0},
                ],
            'charts': [
                {'title': "Revenue and Expenses", 'kind': 'bar',
                    'money': True,
                    'labels': [month_label(m) for m in months],
                    'series': [
                        {'label': "Revenue",
                            'values': cls._monthly(months, revenue)},
                        {'label': "Expenses",
                            'values': cls._monthly(months, expense)},
                        ]},
                {'title': "Cash", 'kind': 'line', 'money': True,
                    'labels': [month_label(m) for m in months],
                    'series': [{'label': "Cash", 'values': balances}]},
                {'title': "Receivables Aging", 'kind': 'bar',
                    'money': True, 'labels': receivable['labels'],
                    'series': [{'label': "Receivables",
                            'values': receivable['buckets']}]},
                {'title': "Payables Aging", 'kind': 'bar', 'money': True,
                    'labels': payable['labels'],
                    'series': [{'label': "Payables",
                            'values': payable['buckets']}]},
                ],
            'tables': [],
            }
