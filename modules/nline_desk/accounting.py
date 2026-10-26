# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""N-Line screens: QuickBooks daily accounting (UI upgrade phase 2)

Sales receipts, credit memos and applying them, credit card charges,
general journal entries, the chart of accounts and its registers, bank
reconciliation, the income and bill trackers and the financial reports
(profit and loss, balance sheet, A/R and A/P aging) of the report viewer.
"""
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .desk import _date, _decimal, accept_warnings

ZERO = Decimal(0)


class DeskAccounting(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in [
                'sales_receipt', 'credit_memo', 'apply_credit',
                'credit_card_charge', 'journal_entry', 'reconcile']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in [
                'open_credits', 'accounts', 'account_register',
                'reconcile_data', 'tracker', 'report']:
            cls.__rpc__[name] = RPC()

    # ---- Customers -------------------------------------------------------

    @classmethod
    @accept_warnings
    def sales_receipt(cls, values):
        """A cash sale: post the invoice and receive its payment at once
        values: party, date, reference, memo, lines, journal (receipt
        payment journal), payment_reference"""
        cls._check_create('account.invoice', 'account.payment')
        invoice = cls._invoice('out', values)
        items = [{
                'line': line.id,
                'amount': str(line.debit - line.credit),
                } for line in invoice.lines_to_pay]
        payment = cls.receive_payment({
                'journal': values['journal'],
                'party': values['party'],
                'date': values.get('date'),
                'amount': str(invoice.total_amount),
                'reference': values.get('payment_reference')
                or values.get('reference'),
                'items': items,
                })
        result = cls._summary(invoice)
        result['payment'] = payment
        return result

    @classmethod
    @accept_warnings
    def credit_memo(cls, values):
        """Post a credit memo (customer) or a vendor credit and apply it to
        an open invoice or bill
        values: kind ('customer' or 'vendor'), party, date, reference, memo,
        lines (positive amounts), apply_to (invoice id)"""
        cls._check_create('account.invoice')
        lines = []
        for line in values['lines']:
            line = dict(line)
            if line.get('amount') is not None:
                line['amount'] = str(-abs(_decimal(line['amount'])))
            if line.get('quantity'):
                line['quantity'] = -abs(float(line['quantity']))
            lines.append(line)
        type_ = 'out' if values.get('kind', 'customer') == 'customer' else 'in'
        credit = cls._invoice(type_, dict(values, lines=lines))
        result = cls._summary(credit)
        if values.get('apply_to'):
            result['applied'] = cls.apply_credit(credit.id,
                values['apply_to'])
        return result

    @classmethod
    def open_credits(cls, party, kind='customer'):
        "Return the credits of the party not used yet"
        cls._check_read('account.invoice')
        Invoice = Pool().get('account.invoice')
        credits = Invoice.search([
                ('party', '=', party),
                ('type', '=', 'out' if kind == 'customer' else 'in'),
                ('state', '=', 'posted'),
                ('total_amount', '<', 0),
                ], order=[('invoice_date', 'ASC')])
        result = []
        for credit in credits:
            available = cls._credit_available(credit)
            if available:
                result.append({
                        'id': credit.id,
                        'number': credit.number,
                        'date': credit.invoice_date,
                        'amount': -credit.total_amount,
                        'open_amount': available,
                        })
        return result

    @classmethod
    def _credit_available(cls, credit):
        "The amount of a credit not applied nor reconciled yet"
        amount = sum((l.debit - l.credit for l in credit.lines_to_pay
                if not l.reconciliation
                and not getattr(l, 'invoice_payment', None)), ZERO)
        return abs(amount)

    @classmethod
    def apply_credit(cls, credit, invoice):
        """Use a credit memo to pay an open invoice of the same party: the
        whole credit, on an invoice of at least its amount"""
        cls._check_create('account.invoice')
        Invoice = Pool().get('account.invoice')
        credit, invoice = Invoice(credit), Invoice(invoice)
        available = cls._credit_available(credit)
        if (credit.party != invoice.party or credit.type != invoice.type
                or credit.account != invoice.account):
            raise ValidationError(gettext('nline_desk.msg_credit_other_party',
                    credit=credit.rec_name, invoice=invoice.rec_name))
        if available <= 0 or available > invoice.amount_to_pay:
            raise ValidationError(gettext('nline_desk.msg_credit_too_large',
                    credit=credit.rec_name, invoice=invoice.rec_name))
        Invoice.add_payment_lines({invoice: list(credit.lines_to_pay)})
        invoice = Invoice(invoice.id)
        if not invoice.amount_to_pay:
            cls._reconcile_paid(
                [l.id for l in invoice.lines_to_pay]
                + [l.id for l in invoice.payment_lines])
            Invoice.process([invoice])
        return {'invoice': invoice.id, 'amount': available}

    # ---- Banking ---------------------------------------------------------

    @classmethod
    def _general_journal(cls):
        Journal = Pool().get('account.journal')
        journals = Journal.search([('type', '=', 'general')], limit=1)
        if not journals:
            raise ValidationError(gettext('nline_desk.msg_no_general_journal'))
        return journals[0]

    @classmethod
    def _post_move(cls, date, description, lines, journal=None):
        """Post a move of lines (account, debit, credit, party,
        description); return it"""
        pool = Pool()
        Move = pool.get('account.move')
        Line = pool.get('account.move.line')
        Account = pool.get('account.account')
        Party = pool.get('party.party')
        Period = pool.get('account.period')
        company = cls._company()
        date = _date(date) or dt.date.today()
        move = Move(
            company=company,
            journal=journal or cls._general_journal(),
            date=date,
            period=Period.find(company, date=date),
            description=description)
        move_lines = []
        for values in lines:
            debit = _decimal(values.get('debit')) or ZERO
            credit = _decimal(values.get('credit')) or ZERO
            if not debit and not credit:
                continue
            account = Account(values['account'])
            line = Line(
                account=account,
                debit=debit, credit=credit,
                description=values.get('description') or description)
            if values.get('party'):
                line.party = Party(values['party'])
            elif account.party_required:
                raise ValidationError(gettext('nline_desk.msg_party_required',
                        account=account.rec_name))
            move_lines.append(line)
        if not move_lines:
            raise ValidationError(gettext('nline_desk.msg_empty_entry'))
        if sum(l.debit - l.credit for l in move_lines):
            raise ValidationError(gettext('nline_desk.msg_unbalanced_entry'))
        move.lines = move_lines
        move.save()
        Move.post([move])
        return move

    @classmethod
    @accept_warnings
    def journal_entry(cls, values):
        """Post a general journal entry
        values: date, memo, lines (account, debit, credit, party, memo)"""
        cls._check_create('account.move')
        move = cls._post_move(values.get('date'), values.get('memo'), [
                dict(l, description=l.get('memo')) for l in values['lines']])
        return {'id': move.id, 'number': move.number}

    @classmethod
    @accept_warnings
    def credit_card_charge(cls, values):
        """Post a credit card charge (or refund): the expenses against the
        card's liability account
        values: card (account), party, date, reference, memo, refund,
        lines (account, memo, amount)"""
        cls._check_create('account.move')
        refund = values.get('refund')
        lines, total = [], ZERO
        for line in values['lines']:
            amount = _decimal(line.get('amount')) or ZERO
            total += amount
            lines.append({
                    'account': line['account'],
                    'debit': ZERO if refund else amount,
                    'credit': amount if refund else ZERO,
                    'description': line.get('memo') or values.get('memo'),
                    'party': values.get('party') if
                    Pool().get('account.account')(line['account'])
                    .party_required else None,
                    })
        lines.append({
                'account': values['card'],
                'debit': total if refund else ZERO,
                'credit': ZERO if refund else total,
                'party': values.get('party') if
                Pool().get('account.account')(values['card'])
                .party_required else None,
                'description': values.get('reference') or values.get('memo'),
                })
        move = cls._post_move(values.get('date'),
            values.get('memo') or values.get('reference'), lines)
        return {'id': move.id, 'number': move.number, 'amount': total}

    @classmethod
    def accounts(cls, date=None):
        """Return the chart of accounts: code, name, type, balance at the
        date (today), for the QuickBooks Chart of Accounts"""
        cls._check_read('account.account')
        Account = Pool().get('account.account')
        with Transaction().set_context(to_date=_date(date)):
            accounts = Account.search([
                    ('type', '!=', None),
                    ('closed', '!=', True),
                    ], order=[('code', 'ASC'), ('name', 'ASC')])
            return [{
                    'id': a.id,
                    'code': a.code or '',
                    'name': a.name,
                    'type': a.type.name if a.type else '',
                    'statement': a.type.statement if a.type else '',
                    'balance': a.balance,
                    } for a in accounts]

    @classmethod
    def account_register(cls, account, from_date=None, to_date=None):
        """Return the register of an account: its posted lines with the
        party, memo, debit, credit and running balance"""
        cls._check_read('account.move.line')
        pool = Pool()
        Line = pool.get('account.move.line')
        Account = pool.get('account.account')
        account = Account(account)
        from_date, to_date = _date(from_date), _date(to_date)
        domain = [
            ('account', '=', account.id),
            ('move.state', '=', 'posted'),
            ]
        if to_date:
            domain.append(('date', '<=', to_date))
        balance = ZERO
        rows = []
        for line in Line.search(domain, order=[
                    ('date', 'ASC'), ('move.number', 'ASC'), ('id', 'ASC')]):
            balance += line.debit - line.credit
            if from_date and line.date < from_date:
                continue
            origin = line.move.origin
            rows.append({
                    'line': line.id,
                    'move': line.move.id,
                    'origin': str(origin) if origin else None,
                    'date': line.date,
                    'number': line.move.number or '',
                    'party_name': line.party.rec_name if line.party else '',
                    'memo': line.description or line.move.description or '',
                    'debit': line.debit,
                    'credit': line.credit,
                    'balance': balance,
                    'reconciled': bool(line.reconciliation),
                    })
        return {
            'account': account.id,
            'name': account.rec_name,
            'balance': balance,
            'rows': rows,
            }

    @classmethod
    def reconcile_data(cls, journal):
        """Return what the bank reconciliation of a payment journal starts
        from: the cleared balance (the bank GL account) and the checks and
        deposits not cleared yet (its clearing account)"""
        cls._check_read('account.move.line')
        pool = Pool()
        Line = pool.get('account.move.line')
        PaymentJournal = pool.get('account.payment.journal')
        journal = PaymentJournal(journal)
        bank = journal.bank_account
        if not bank or not journal.clearing_account:
            raise ValidationError(gettext('nline_desk.msg_no_bank_clearing',
                    journal=journal.rec_name))
        cleared = sum((l.debit - l.credit for l in Line.search([
                        ('account', '=', bank.id),
                        ('move.state', '=', 'posted'),
                        ])), ZERO)
        items = []
        for line in Line.search([
                    ('account', '=', journal.clearing_account.id),
                    ('move.state', '=', 'posted'),
                    ('reconciliation', '=', None),
                    ], order=[('date', 'ASC'), ('id', 'ASC')]):
            origin = line.move.origin
            party = line.party or getattr(origin, 'party', None)
            items.append({
                    'line': line.id,
                    'date': line.date,
                    'number': getattr(origin, 'check_number', None) or '',
                    'party_name': party.rec_name if party else '',
                    'memo': (line.description or line.move.description
                        or getattr(origin, 'description', None) or ''),
                    'amount': line.debit - line.credit,
                    })
        return {
            'bank': bank.rec_name,
            'beginning_balance': cleared,
            'items': items,
            }

    @classmethod
    def reconcile(cls, values):
        """Reconcile the bank account: post a bank statement of the ticked
        checks and deposits, which moves them from the clearing account to
        the bank account
        values: journal (payment journal), date, ending_balance, lines"""
        cls._check_create('account.statement')
        pool = Pool()
        Line = pool.get('account.move.line')
        PaymentJournal = pool.get('account.payment.journal')
        Statement = pool.get('account.statement')
        StatementLine = pool.get('account.statement.line')
        StatementJournal = pool.get('account.statement.journal')
        Payment = pool.get('account.payment')
        journal = PaymentJournal(values['journal'])
        date = _date(values['date'])
        data = cls.reconcile_data(journal.id)
        statement_journals = StatementJournal.search([
                ('account', '=', journal.bank_account.id),
                ], limit=1)
        if not statement_journals:
            raise ValidationError(gettext(
                    'nline_desk.msg_no_statement_journal',
                    account=journal.bank_account.rec_name))
        statement_journal, = statement_journals
        start = data['beginning_balance']
        end = _decimal(values['ending_balance'])
        lines = Line.browse(values['lines'])
        statement = Statement(
            company=cls._company(),
            journal=statement_journal,
            name=gettext('nline_desk.msg_reconcile_name', date=date),
            date=date,
            start_balance=start,
            end_balance=end,
            total_amount=end - start,
            number_of_lines=len(lines))
        statement_lines, plain = [], []
        for line in lines:
            origin = line.move.origin
            statement_line = StatementLine(
                date=line.date or date,
                amount=line.debit - line.credit,
                party=line.party or getattr(origin, 'party', None),
                account=line.account,
                description=line.description or line.move.description)
            if isinstance(origin, Payment):
                statement_line.related_to = origin
            else:
                plain.append((statement_line, line))
            statement_lines.append(statement_line)
        statement.lines = statement_lines
        statement.save()
        Statement.validate_statement([statement])
        Statement.post([statement])
        # A deposit (no payment): its clearing line with the statement's
        for statement_line, line in plain:
            amount = line.debit - line.credit
            counterparts = [l for l in Line.search([
                        ('account', '=', line.account.id),
                        ('reconciliation', '=', None),
                        ('move.origin', 'in', [str(statement),
                                str(StatementLine(statement_line.id))]),
                        ]) if l.credit - l.debit == amount]
            if counterparts:
                cls._reconcile_paid([line.id, counterparts[0].id])
        return {'statement': statement.id, 'lines': len(lines)}

    # ---- Trackers --------------------------------------------------------

    @classmethod
    def tracker(cls, kind='customer'):
        """The QuickBooks Income Tracker (customer) or Bill Tracker
        (vendor): the totals of unbilled orders, open and overdue invoices
        and payments of the last 30 days, and the rows behind them"""
        pool = Pool()
        Invoice = pool.get('account.invoice')
        Payment = pool.get('account.payment')
        today = dt.date.today()
        customer = kind == 'customer'
        cls._check_read('account.invoice')
        rows = []
        order_model = 'sale.sale' if customer else 'purchase.purchase'
        try:
            Order = pool.get(order_model)
            cls._check_read(order_model)
        except (KeyError, Exception):
            Order = None
        if Order:
            for order in Order.search([
                        ('state', 'in', ['confirmed', 'processing']),
                        ('invoice_state', 'in', ['none', 'pending',
                                'waiting']),
                        ]):
                rows.append({
                        'status': 'unbilled',
                        'model': order_model,
                        'id': order.id,
                        'party_name': order.party.rec_name,
                        'type': 'Sales Order' if customer else 'Purchase '
                        'Order',
                        'number': order.number or '',
                        'date': (order.sale_date if customer
                            else order.purchase_date),
                        'due_date': None,
                        'amount': order.total_amount,
                        'open_amount': order.total_amount,
                        })
        for invoice in Invoice.search([
                    ('type', '=', 'out' if customer else 'in'),
                    ('state', '=', 'posted'),
                    ]):
            if not invoice.amount_to_pay:
                continue
            if invoice.total_amount < 0 and not cls._credit_available(
                    invoice):
                continue
            dates = [l.maturity_date for l in invoice.lines_to_pay
                if l.maturity_date and not l.reconciliation]
            due = min(dates) if dates else invoice.invoice_date
            rows.append({
                    'status': 'overdue' if due and due < today else 'open',
                    'model': 'account.invoice',
                    'id': invoice.id,
                    'party_name': invoice.party.rec_name,
                    'type': ('Credit' if invoice.total_amount < 0 else
                        'Invoice' if customer else 'Bill'),
                    'number': invoice.number or '',
                    'date': invoice.invoice_date,
                    'due_date': due,
                    'amount': invoice.total_amount,
                    'open_amount': invoice.amount_to_pay,
                    })
        for payment in Payment.search([
                    ('kind', '=', 'receivable' if customer else 'payable'),
                    ('date', '>=', today - dt.timedelta(days=30)),
                    ('state', '!=', 'failed'),
                    ]):
            rows.append({
                    'status': 'paid',
                    'model': 'account.payment',
                    'id': payment.id,
                    'party_name': payment.party.rec_name,
                    'type': 'Payment',
                    'number': (getattr(payment, 'check_number', None)
                        or str(payment.id)),
                    'date': payment.date,
                    'due_date': None,
                    'amount': payment.amount,
                    'open_amount': ZERO,
                    })
        totals = defaultdict(lambda: ZERO)
        counts = defaultdict(int)
        for row in rows:
            key = 'open' if row['status'] == 'overdue' else row['status']
            totals[key] += row['open_amount' if key != 'paid' else 'amount']
            counts[key] += 1
            if row['status'] == 'overdue':
                totals['overdue'] += row['open_amount']
                counts['overdue'] += 1
        rows.sort(key=lambda r: (r['date'] or dt.date.min), reverse=True)
        return {
            'totals': dict(totals),
            'counts': dict(counts),
            'rows': rows,
            }

    # ---- Reports ---------------------------------------------------------

    @classmethod
    def report(cls, name, params=None):
        """Return a report of the report viewer: title, subtitle, columns
        and rows (label, level, values, drill)"""
        params = params or {}
        method = getattr(cls, '_report_%s' % name, None)
        if not method:
            raise ValidationError(gettext('nline_desk.msg_unknown_report',
                    report=name))
        return method(params)

    @classmethod
    def _type_report(cls, statement, context, title, subtitle):
        "The account type tree of a statement with its accounts"
        pool = Pool()
        Type = pool.get('account.account.type')
        Account = pool.get('account.account')
        cls._check_read('account.account')
        company = cls._company()
        rows = []
        with Transaction().set_context(**context):
            types = Type.search([
                    ('statement', '=', statement),
                    ('company', '=', company.id),
                    ], order=[('sequence', 'ASC'), ('id', 'ASC')])
            by_parent = defaultdict(list)
            ids = {t.id for t in types}
            for type_ in types:
                parent = type_.parent.id if type_.parent and \
                    type_.parent.id in ids else None
                by_parent[parent].append(type_)
            accounts = defaultdict(list)
            for account in Account.search([('type', 'in', list(ids))],
                    order=[('code', 'ASC'), ('name', 'ASC')]):
                accounts[account.type.id].append(account)

            def expense(type_):
                "An expense section: shown positive, as in QuickBooks"
                if statement != 'income':
                    return False
                if type_.expense:
                    return True
                childs = by_parent.get(type_.id, [])
                return bool(childs) and all(expense(c) for c in childs)

            def walk(parent, level, negate=False):
                for type_ in by_parent.get(parent, []):
                    sign = -1 if (negate or expense(type_)) else 1
                    rows.append({
                            'label': type_.name,
                            'level': level,
                            'values': [sign * type_.amount],
                            'total': bool(by_parent.get(type_.id)),
                            'drill': None,
                            })
                    for account in accounts.get(type_.id, []):
                        amount = account.credit - account.debit
                        if statement == 'balance' and type_.assets:
                            amount = -amount
                        if not amount:
                            continue
                        rows.append({
                                'label': account.rec_name,
                                'level': level + 1,
                                'values': [sign * amount],
                                'total': False,
                                'drill': {'type': 'account',
                                    'id': account.id},
                                })
                    walk(type_.id, level + 1, sign < 0)
            walk(None, 0)
            if statement == 'income':
                rows.append({
                        'label': 'Net Income',
                        'level': 0,
                        'values': [sum((t.amount for t in by_parent[None]),
                                ZERO)],
                        'total': True,
                        'drill': None,
                        })
        return {
            'title': title,
            'subtitle': subtitle,
            'columns': [{'label': 'Amount', 'money': True}],
            'rows': rows,
            }

    @classmethod
    def _report_profit_loss(cls, params):
        from_date = _date(params.get('from_date'))
        to_date = _date(params.get('to_date'))
        return cls._type_report('income',
            {'from_date': from_date, 'to_date': to_date},
            'Profit & Loss', cls._period_label(from_date, to_date))

    @classmethod
    def _report_balance_sheet(cls, params):
        to_date = _date(params.get('to_date')) or dt.date.today()
        return cls._type_report('balance', {'to_date': to_date},
            'Balance Sheet', 'As of %s' % to_date.strftime('%m/%d/%Y'))

    @staticmethod
    def _period_label(from_date, to_date):
        def fmt(d):
            return d.strftime('%m/%d/%Y') if d else ''
        if from_date and to_date:
            return '%s - %s' % (fmt(from_date), fmt(to_date))
        return 'Through %s' % fmt(to_date) if to_date else 'All dates'

    @classmethod
    def _aging(cls, kind, params):
        pool = Pool()
        Line = pool.get('account.move.line')
        cls._check_read('account.move.line')
        to_date = _date(params.get('to_date')) or dt.date.today()
        buckets = ['Current', '1 - 30', '31 - 60', '61 - 90', '> 90']
        domain = [
            ('account.type.%s' % kind, '=', True),
            ('move.state', '=', 'posted'),
            ('date', '<=', to_date),
            ('party', '!=', None),
            ['OR',
                ('reconciliation', '=', None),
                ('reconciliation.date', '>', to_date),
                ],
            ]
        parties = {}
        totals = [ZERO] * (len(buckets) + 1)
        for line in Line.search(domain):
            amount = line.debit - line.credit
            if kind == 'payable':
                amount = -amount
            days = (to_date - (line.maturity_date or line.date)).days
            index = (0 if days <= 0 else 1 if days <= 30 else 2
                if days <= 60 else 3 if days <= 90 else 4)
            party = parties.setdefault(line.party.id, {
                    'name': line.party.rec_name,
                    'values': [ZERO] * (len(buckets) + 1)})
            party['values'][index] += amount
            party['values'][-1] += amount
            totals[index] += amount
            totals[-1] += amount
        rows = [{
                'label': p['name'],
                'level': 0,
                'values': p['values'],
                'total': False,
                'drill': {'type': 'party', 'id': pid,
                    'kind': 'customer' if kind == 'receivable'
                    else 'vendor'},
                } for pid, p in sorted(parties.items(),
                key=lambda i: i[1]['name'].lower()) if any(p['values'])]
        rows.append({'label': 'TOTAL', 'level': 0, 'values': totals,
                'total': True, 'drill': None})
        return {
            'title': ('A/R Aging Summary' if kind == 'receivable'
                else 'A/P Aging Summary'),
            'subtitle': 'As of %s' % to_date.strftime('%m/%d/%Y'),
            'columns': [{'label': b, 'money': True} for b in buckets]
            + [{'label': 'Total', 'money': True}],
            'rows': rows,
            }

    @classmethod
    def _report_ar_aging(cls, params):
        return cls._aging('receivable', params)

    @classmethod
    def _report_ap_aging(cls, params):
        return cls._aging('payable', params)
