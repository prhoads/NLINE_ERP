# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Accounting: account sets, accounting calendar, account interface

- An account set is a Tryton product category with accounting: its Tryton
  accounts (expense, revenue, stock...) are the ones Tryton posts to; the
  Jobshop accounts Tryton has no place for (labor, burden, service, WIP,
  applied labor...) are kept on the category for the Account Set window and
  reports.
- The accounting calendar is Tryton's fiscal years and periods.
- The account interface posts the draft moves of the operations (stock,
  production, invoices) and gathers the posted moves of a period and journal
  into a journal batch (Jobshop's batch), then exports them to a file.
"""
import csv
import datetime as dt
import io
from collections import defaultdict
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.rpc import RPC

ZERO = Decimal(0)


def _date(value):
    if isinstance(value, str):
        return dt.date.fromisoformat(value[:10]) if value else None
    if isinstance(value, dt.datetime):
        return value.date()
    return value


def _account_field(string):
    return fields.Many2One('account.account', string,
        domain=[
            ('company', '=', Eval('context', {}).get('company', -1)),
            ('type', '!=', None),
            ],
        states={
            'invisible': ~Eval('accounting', False),
            },
        ondelete='RESTRICT',
        help="An account of the Jobshop account set Tryton does not post "
        "to (kept for the Account Set window and reports).")


# The accounts of a Jobshop account set in its window's order:
# (Jobshop column, label, Tryton field, the field is the Tryton account)
ACCOUNT_SET = [
    ('INV_MAT', "Inventory Material", 'account_stock', True),
    ('INV_LAB', "Inventory Labor", 'js_inv_labor_account', False),
    ('INV_BUR', "Inventory Burden", 'js_inv_burden_account', False),
    ('INV_SER', "Inventory Service", 'js_inv_service_account', False),
    ('WIP_MAT', "WIP Material", 'js_wip_material_account', False),
    ('WIP_LAB', "WIP Labor", 'js_wip_labor_account', False),
    ('WIP_BUR', "WIP Burden", 'js_wip_burden_account', False),
    ('WIP_SER', "WIP Service", 'js_wip_service_account', False),
    ('CGS_MAT', "CGS Material", 'account_stock_out', True),
    ('CGS_LAB', "CGS Labor", 'js_cgs_labor_account', False),
    ('CGS_BUR', "CGS Burden", 'js_cgs_burden_account', False),
    ('CGS_SER', "CGS Service", 'js_cgs_service_account', False),
    ('EXP', "Purchase Expense", 'account_expense', True),
    ('REV', "Sales Revenue", 'account_revenue', True),
    ('ADJ', "Inventory Adjustment", 'js_adjustment_account', False),
    ('POA', "Purchase Order Accrual", 'account_stock_in', True),
    ('AFL', "Applied Factory Labor", 'js_applied_labor_account', False),
    ('AFB', "Applied Factory Burden", 'js_applied_burden_account', False),
    ('IND', "Indirect Factory Labor", 'js_indirect_labor_account', False),
    ('RECV', "Receivables", 'js_receivable_account', False),
    ('PAYB', "Payables", 'js_payable_account', False),
    ]


def jobshop_account_type(account):
    "Jobshop's account type: Asset, Liability, Expense, Equity or Revenue"
    type_ = account.type
    if not type_:
        return ''
    if type_.revenue:
        return 'Revenue'
    if type_.expense:
        return 'Expense'
    if type_.receivable or type_.stock or type_.assets:
        return 'Asset'
    if type_.payable or getattr(type_, 'debt', False):
        return 'Liability'
    if type_.statement == 'income':
        return 'Expense'
    return 'Equity'


class Category(metaclass=PoolMeta):
    __name__ = 'product.category'
    js_description = fields.Char("Account Set Description",
        states={
            'invisible': ~Eval('accounting', False),
            })
    js_inv_labor_account = _account_field("Inventory Labor")
    js_inv_burden_account = _account_field("Inventory Burden")
    js_inv_service_account = _account_field("Inventory Service")
    js_wip_material_account = _account_field("WIP Material")
    js_wip_labor_account = _account_field("WIP Labor")
    js_wip_burden_account = _account_field("WIP Burden")
    js_wip_service_account = _account_field("WIP Service")
    js_cgs_labor_account = _account_field("CGS Labor")
    js_cgs_burden_account = _account_field("CGS Burden")
    js_cgs_service_account = _account_field("CGS Service")
    js_adjustment_account = _account_field("Inventory Adjustment")
    js_applied_labor_account = _account_field("Applied Factory Labor")
    js_applied_burden_account = _account_field("Applied Factory Burden")
    js_indirect_labor_account = _account_field("Indirect Factory Labor")
    js_receivable_account = _account_field("Receivables")
    js_payable_account = _account_field("Payables")


class JournalBatch(ModelSQL, ModelView):
    """Journal Batch

    Jobshop's batch: the posted moves of a period and a journal (its sub
    ledger) gathered by the Account Interface's Post, exported to the
    accounting application"""
    __name__ = 'nline.js.journal_batch'
    number = fields.Char("Batch ID", required=True, readonly=True)
    description = fields.Char("Description")
    company = fields.Many2One('company.company', "Company", required=True,
        readonly=True)
    period = fields.Many2One('account.period', "Period", required=True,
        readonly=True, ondelete='RESTRICT')
    journal = fields.Many2One('account.journal', "Sub Ledger",
        readonly=True, ondelete='RESTRICT',
        context={
            'company': Eval('company', -1),
            },
        depends={'company'})
    posting_date = fields.Date("Posting Date", required=True, readonly=True)
    posted_date = fields.Date("Posted Date", readonly=True)
    exported_date = fields.Date("Exported Date", readonly=True)
    moves = fields.One2Many('account.move', 'js_batch', "Moves",
        readonly=True)
    debit = fields.Function(fields.Numeric("Debit", digits=(16, 2)),
        'get_amounts')
    credit = fields.Function(fields.Numeric("Credit", digits=(16, 2)),
        'get_amounts')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('number_unique', Unique(t, t.company, t.number),
                'nline_js_admin.msg_batch_number_unique'),
            ]
        cls._order = [('posting_date', 'DESC'), ('number', 'DESC')]

    @classmethod
    def get_amounts(cls, batches, names):
        result = {n: {b.id: ZERO for b in batches} for n in names}
        for batch in batches:
            for move in batch.moves:
                for line in move.lines:
                    if 'debit' in result:
                        result['debit'][batch.id] += line.debit
                    if 'credit' in result:
                        result['credit'][batch.id] += line.credit
        return result

    def get_rec_name(self, name):
        return self.number


class Move(metaclass=PoolMeta):
    __name__ = 'account.move'
    js_batch = fields.Many2One('nline.js.journal_batch', "Journal Batch",
        readonly=True, ondelete='SET NULL')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        # A posted move is gathered into a batch after its posting
        cls._check_modify_exclude.append('js_batch')

    @classmethod
    def copy(cls, moves, default=None):
        default = default.copy() if default else {}
        default.setdefault('js_batch', None)
        return super().copy(moves, default=default)


# The documents a move comes from, by the model of its origin, as the
# Jobshop transaction classes
ORIGIN_CLASSES = {
    'stock.move': "Inventory",
    'account.invoice': "Invoice",
    'production': "Work Order",
    'production.work.cycle': "Labor",
    'account.payment': "Payment",
    'account.statement': "Bank",
    'account.statement.line': "Bank",
    }


def origin_class(move):
    origin = move.origin
    if not origin:
        return "Journal"
    return ORIGIN_CLASSES.get(origin.__name__, origin.__name__)


class DeskAccounting(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in [
                'jsadmin_calendar_action', 'jsadmin_fiscalyear_create',
                'jsadmin_interface_post', 'jsadmin_interface_export']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in [
                'jsadmin_account_set_fields', 'jsadmin_calendar',
                'jsadmin_interface']:
            cls.__rpc__[name] = RPC()

    # ---- Account sets ----------------------------------------------------

    @classmethod
    def jsadmin_account_set_fields(cls):
        """The accounts of an account set in Jobshop's order: name, label,
        whether Tryton posts to it (only the fields of the installed
        modules)"""
        cls._check_read('product.category')
        Category = Pool().get('product.category')
        return [{
                'name': name,
                'label': label,
                'jobshop': code,
                'tryton': tryton,
                } for code, label, name, tryton in ACCOUNT_SET
            if name in Category._fields]

    # ---- Accounting calendar ---------------------------------------------

    @classmethod
    def jsadmin_calendar(cls):
        """The fiscal years and their periods (Jobshop's Year, Period, End
        Date, Closed) with the draft moves of each period"""
        cls._check_read('account.fiscalyear', 'account.period')
        pool = Pool()
        FiscalYear = pool.get('account.fiscalyear')
        Move = pool.get('account.move')
        company = cls._company()
        years = FiscalYear.search([('company', '=', company.id)],
            order=[('start_date', 'DESC')])
        drafts = defaultdict(int)
        try:
            cls._check_read('account.move')
            for move in Move.search([
                        ('company', '=', company.id),
                        ('state', '=', 'draft'),
                        ]):
                drafts[move.period.id] += 1
        except Exception:
            # Without the right to see moves, no counts
            pass
        result = []
        for year in years:
            periods = sorted((p for p in year.periods
                    if p.type == 'standard'), key=lambda p: p.start_date)
            result.append({
                    'id': year.id,
                    'name': year.name,
                    'start_date': year.start_date,
                    'end_date': year.end_date,
                    'state': year.state,
                    'periods': [{
                            'id': p.id,
                            'number': i,
                            'name': p.name,
                            'start_date': p.start_date,
                            'end_date': p.end_date,
                            'state': p.state,
                            'drafts': drafts.get(p.id, 0),
                            } for i, p in enumerate(periods, 1)],
                    })
        return result

    @classmethod
    def jsadmin_calendar_action(cls, action, ids):
        """Close, reopen or lock periods ('period-close', 'period-reopen',
        'period-lock') or fiscal years ('year-close', 'year-reopen')"""
        pool = Pool()
        Period = pool.get('account.period')
        FiscalYear = pool.get('account.fiscalyear')
        kind, verb = action.split('-', 1)
        Model = Period if kind == 'period' else FiscalYear
        cls._check_write(Model.__name__)
        records = Model.browse(ids)
        if verb == 'close':
            # Jobshop closes a period with everything before it
            Model.close(sorted(records, key=lambda r: r.start_date))
        elif verb == 'reopen':
            Model.reopen(sorted(records, key=lambda r: r.start_date,
                    reverse=True))
        elif verb == 'lock' and kind == 'period':
            Model.lock_(records)
        else:
            raise ValidationError(gettext(
                    'nline_js_admin.msg_unknown_action', action=action))
        return cls.jsadmin_calendar()

    @classmethod
    def jsadmin_fiscalyear_create(cls, values):
        """Create a fiscal year from the latest one (its sequences renewed,
        as Tryton's Renew Fiscal Year) with monthly or quarterly periods
        (System Settings > Accounting > Auto)
        values: end_date, period_type ('monthly' or 'quarterly'), name"""
        cls._check_create('account.fiscalyear', 'account.period')
        pool = Pool()
        FiscalYear = pool.get('account.fiscalyear')
        Period = pool.get('account.period')
        Renew = pool.get('account.fiscalyear.renew', type='wizard')
        company = cls._company()
        end_date = _date(values['end_date'])
        # The day after the same date a year before
        try:
            start_date = end_date.replace(year=end_date.year - 1)
        except ValueError:
            start_date = end_date.replace(year=end_date.year - 1, day=28)
        start_date += dt.timedelta(days=1)
        previous = FiscalYear.search([('company', '=', company.id)],
            order=[('end_date', 'DESC')], limit=1)
        if not previous:
            raise ValidationError(gettext(
                    'nline_js_admin.msg_no_previous_fiscalyear'))
        if FiscalYear.search([
                    ('company', '=', company.id),
                    ('start_date', '<=', end_date),
                    ('end_date', '>=', start_date),
                    ], limit=1):
            raise ValidationError(gettext(
                    'nline_js_admin.msg_fiscalyear_overlaps',
                    start=start_date, end=end_date))
        previous, = previous
        session_id, _, _ = Renew.create()
        renew = Renew(session_id)
        renew.start.company = company
        renew.start.previous_fiscalyear = previous
        renew.start.name = values.get('name') or str(end_date.year)
        renew.start.start_date = start_date
        renew.start.end_date = end_date
        renew.start.reset_sequences = True
        fiscalyear = renew.create_fiscalyear()
        fiscalyear.save()
        Renew.delete(session_id)
        interval = 3 if values.get('period_type') == 'quarterly' else 1
        periods = [p for p in fiscalyear.periods if p.type == 'standard']
        months = round((end_date - start_date).days / 30.4)
        if not periods or len(periods) != max(1, round(months / interval)):
            Period.delete(periods)
            FiscalYear.create_period([fiscalyear], interval=interval,
                end_day=end_date.day if end_date.day < 28 else 31)
        return fiscalyear.id

    # ---- Account interface -----------------------------------------------

    @classmethod
    def _interface_domain(cls, period_ids=None, journal_id=None):
        domain = [('company', '=', cls._company().id)]
        if period_ids:
            domain.append(('period', 'in', period_ids))
        if journal_id:
            domain.append(('journal', '=', journal_id))
        return domain

    @classmethod
    def jsadmin_interface(cls, period_ids=None, journal_id=None):
        """The Account Interface: the draft moves of the operations, the
        posted moves not in a batch yet, by period and journal, and the
        batches"""
        cls._check_read('account.move')
        pool = Pool()
        Move = pool.get('account.move')
        Batch = pool.get('nline.js.journal_batch')
        domain = cls._interface_domain(period_ids, journal_id)
        groups = {}
        for move in Move.search(domain + [
                    ['OR',
                        ('state', '=', 'draft'),
                        ('js_batch', '=', None),
                        ],
                    ], order=[('date', 'ASC'), ('id', 'ASC')]):
            key = (move.period.id, move.journal.id)
            group = groups.setdefault(key, {
                    'period': move.period.id,
                    'period_name': move.period.rec_name,
                    'period_end': move.period.end_date,
                    'period_state': move.period.state,
                    'journal': move.journal.id,
                    'journal_name': move.journal.rec_name,
                    'draft': 0,
                    'posted': 0,
                    'debit': ZERO,
                    'moves': [],
                    })
            debit = sum((l.debit for l in move.lines), ZERO)
            group['debit'] += debit
            group['draft' if move.state == 'draft' else 'posted'] += 1
            if len(group['moves']) < 200:
                group['moves'].append({
                        'id': move.id,
                        'number': move.post_number or move.number,
                        'date': move.date,
                        'state': move.state,
                        'class': origin_class(move),
                        'origin': move.origin.rec_name
                        if move.origin else '',
                        'description': move.description or '',
                        'amount': debit,
                        })
        batches = []
        for batch in Batch.search([('company', '=', cls._company().id)],
                limit=100):
            batches.append({
                    'id': batch.id,
                    'number': batch.number,
                    'description': batch.description or '',
                    'period': batch.period.rec_name,
                    'journal': batch.journal.rec_name if batch.journal
                    else 'ALL',
                    'posting_date': batch.posting_date,
                    'posted_date': batch.posted_date,
                    'exported_date': batch.exported_date,
                    'moves': len(batch.moves),
                    'debit': batch.debit,
                    'credit': batch.credit,
                    })
        return {
            'groups': sorted(groups.values(), key=lambda g: (
                    g['period_end'], g['journal_name'])),
            'batches': batches,
            }

    @classmethod
    def _batch_number(cls):
        pool = Pool()
        Configuration = pool.get('nline.desk.configuration')
        config = Configuration(1)
        sequence = getattr(config, 'js_batch_sequence', None)
        if sequence:
            return sequence.get()
        Batch = pool.get('nline.js.journal_batch')
        return '%05d' % (Batch.search([], count=True) + 1)

    @classmethod
    def jsadmin_interface_post(cls, values):
        """Post: the draft moves of the periods (and journal) are posted and
        the posted moves without a batch gathered into one batch per period
        and journal
        values: periods (ids), journal (id or None), up_to (date: the moves
        up to that date only)"""
        cls._check_write('account.move')
        cls._check_create('nline.js.journal_batch')
        pool = Pool()
        Move = pool.get('account.move')
        Batch = pool.get('nline.js.journal_batch')
        Date = pool.get('ir.date')
        domain = cls._interface_domain(values.get('periods'),
            values.get('journal'))
        up_to = _date(values.get('up_to'))
        if up_to:
            domain.append(('date', '<=', up_to))
        drafts = Move.search(domain + [('state', '=', 'draft')])
        if drafts:
            Move.post(drafts)
        moves = Move.search(domain + [
                ('state', '=', 'posted'),
                ('js_batch', '=', None),
                ], order=[('date', 'ASC'), ('id', 'ASC')])
        by_key = defaultdict(list)
        for move in moves:
            by_key[(move.period, move.journal)].append(move)
        today = Date.today()
        batches = []
        for (period, journal), group in sorted(by_key.items(),
                key=lambda i: (i[0][0].end_date, i[0][1].rec_name)):
            batch = Batch(
                number=cls._batch_number(),
                description="%s - %s" % (journal.rec_name, period.rec_name),
                company=cls._company(),
                period=period,
                journal=journal,
                posting_date=min(period.end_date, up_to or period.end_date),
                posted_date=today)
            batch.save()
            Move.write(group, {'js_batch': batch.id})
            batches.append(batch.id)
        return {'posted': len(drafts), 'batches': batches,
            'moves': len(moves)}

    EXPORTS = ['gl', 'ar', 'ap', 'customers', 'suppliers']

    @classmethod
    def jsadmin_interface_export(cls, values):
        """Export to files: the posted moves of the batches (general ledger),
        the customer invoices (accounts receivable), the supplier bills
        (accounts payable), the customers, the suppliers
        values: what (gl, ar, ap, customers, suppliers), from_date, to_date,
        reexport (also the batches exported before), batch (only this
        batch), detail (each move line, else rolled up by account)
        Returns [{name, content}] (CSV text)"""
        what = values.get('what') or 'gl'
        if what not in cls.EXPORTS:
            raise ValidationError(gettext(
                    'nline_js_admin.msg_unknown_action', action=what))
        return getattr(cls, '_export_' + what)(values)

    @staticmethod
    def _csv(header, rows):
        out = io.StringIO()
        writer = csv.writer(out, lineterminator='\r\n')
        writer.writerow(header)
        for row in rows:
            writer.writerow(['' if v is None else
                    v.isoformat() if isinstance(v, dt.date) else v
                    for v in row])
        return out.getvalue()

    @classmethod
    def _export_gl(cls, values):
        cls._check_read('account.move', 'nline.js.journal_batch')
        pool = Pool()
        Batch = pool.get('nline.js.journal_batch')
        Date = pool.get('ir.date')
        domain = [('company', '=', cls._company().id)]
        if values.get('batch'):
            domain.append(('id', '=', values['batch']))
        else:
            if values.get('from_date'):
                domain.append(('posting_date', '>=',
                        _date(values['from_date'])))
            if values.get('to_date'):
                domain.append(('posting_date', '<=',
                        _date(values['to_date'])))
            if not values.get('reexport'):
                domain.append(('exported_date', '=', None))
        batches = Batch.search(domain, order=[('posting_date', 'ASC'),
                ('number', 'ASC')])
        rows = []
        for batch in batches:
            if values.get('detail'):
                for move in batch.moves:
                    for line in move.lines:
                        rows.append([batch.number, batch.posting_date,
                                batch.period.rec_name,
                                batch.journal.rec_name if batch.journal
                                else '', line.account.code or '',
                                line.account.name, move.date,
                                origin_class(move),
                                move.origin.rec_name if move.origin else '',
                                line.party.rec_name if line.party else '',
                                line.description or move.description or '',
                                line.debit, line.credit])
            else:
                totals = defaultdict(lambda: [ZERO, ZERO])
                accounts = {}
                for move in batch.moves:
                    for line in move.lines:
                        totals[line.account.id][0] += line.debit
                        totals[line.account.id][1] += line.credit
                        accounts[line.account.id] = line.account
                for account_id, (debit, credit) in sorted(totals.items(),
                        key=lambda i: accounts[i[0]].code or ''):
                    account = accounts[account_id]
                    net = debit - credit
                    rows.append([batch.number, batch.posting_date,
                            batch.period.rec_name,
                            batch.journal.rec_name if batch.journal else '',
                            account.code or '', account.name,
                            net if net > 0 else ZERO,
                            -net if net < 0 else ZERO])
        if values.get('detail'):
            header = ['Batch ID', 'Posting Date', 'Period', 'Sub Ledger',
                'Account ID', 'Account', 'Transaction Date', 'Class',
                'Document', 'Party', 'Description', 'Debit', 'Credit']
        else:
            header = ['Batch ID', 'Posting Date', 'Period', 'Sub Ledger',
                'Account ID', 'Account', 'Debit', 'Credit']
        if batches:
            cls._check_write('nline.js.journal_batch')
            Batch.write(batches, {'exported_date': Date.today()})
        return [{'name': 'inventory_transactions.csv',
                'content': cls._csv(header, rows),
                'count': len(batches)}]

    @classmethod
    def _invoice_rows(cls, type_, values):
        pool = Pool()
        Invoice = pool.get('account.invoice')
        cls._check_read('account.invoice')
        domain = [
            ('company', '=', cls._company().id),
            ('type', '=', type_),
            ('state', 'in', ['posted', 'paid']),
            ]
        if values.get('from_date'):
            domain.append(('invoice_date', '>=', _date(values['from_date'])))
        if values.get('to_date'):
            domain.append(('invoice_date', '<=', _date(values['to_date'])))
        rows = []
        for invoice in Invoice.search(domain, order=[
                    ('invoice_date', 'ASC'), ('number', 'ASC')]):
            for line in invoice.lines:
                if line.type != 'line':
                    continue
                rows.append([invoice.number, invoice.invoice_date,
                        invoice.party.code or '', invoice.party.name,
                        invoice.reference or '',
                        invoice.payment_term.rec_name
                        if invoice.payment_term else '',
                        invoice.account.code or '',
                        line.account.code if line.account else '',
                        line.product.rec_name if line.product else '',
                        line.description or '', line.quantity,
                        line.unit_price, line.amount,
                        invoice.tax_amount, invoice.total_amount])
        return rows

    INVOICE_HEADER = ['Invoice ID', 'Invoice Date', 'Party ID', 'Name',
        'Reference', 'Terms', 'Account ID', 'Line Account ID', 'Part',
        'Description', 'Quantity', 'Unit Price', 'Amount', 'Tax',
        'Invoice Total']

    @classmethod
    def _export_ar(cls, values):
        return [{'name': 'invoices.csv',
                'content': cls._csv(cls.INVOICE_HEADER,
                    cls._invoice_rows('out', values))}]

    @classmethod
    def _export_ap(cls, values):
        return [{'name': 'receivers.csv',
                'content': cls._csv(cls.INVOICE_HEADER,
                    cls._invoice_rows('in', values))}]

    @classmethod
    def _party_rows(cls, kind):
        pool = Pool()
        Party = pool.get('party.party')
        Invoice = pool.get('account.invoice')
        cls._check_read('party.party')
        type_ = 'out' if kind == 'customers' else 'in'
        ids = {i.party.id for i in Invoice.search([('type', '=', type_)])}
        rows = []
        for party in Party.browse(sorted(ids)):
            address = party.addresses[0] if party.addresses else None
            rows.append([party.code or '', party.name,
                    address.street if address else '',
                    address.city if address else '',
                    address.subdivision.code if address and
                    address.subdivision else '',
                    address.postal_code if address else '',
                    address.country.code if address and address.country
                    else '',
                    party.phone or '', party.fax or '', party.email or ''])
        return rows

    PARTY_HEADER = ['ID', 'Name', 'Address', 'City', 'State', 'Postal Code',
        'Country', 'Phone', 'Fax', 'Email']

    @classmethod
    def _export_customers(cls, values):
        return [{'name': 'customers.csv', 'content': cls._csv(
                    cls.PARTY_HEADER, cls._party_rows('customers'))}]

    @classmethod
    def _export_suppliers(cls, values):
        return [{'name': 'suppliers.csv', 'content': cls._csv(
                    cls.PARTY_HEADER, cls._party_rows('suppliers'))}]
