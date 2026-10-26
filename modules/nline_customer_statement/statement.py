# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from collections import namedtuple
from decimal import Decimal

from trytond.model import ModelView, fields
from trytond.report import Report
from trytond.pool import Pool
from trytond.pyson import Eval
from trytond.transaction import Transaction
from trytond.wizard import Button, StateReport, StateView, Wizard

AGING = [
    ('current', "Current", None, 0),
    ('days_30', "1-30", 1, 30),
    ('days_60', "31-60", 31, 60),
    ('days_90', "61-90", 61, 90),
    ('over_90', "Over 90", 91, None),
    ]

StatementLine = namedtuple('StatementLine', [
        'date', 'document', 'description', 'charge', 'payment', 'balance',
        'due_date'])


def get_statement(company, party, from_date, to_date):
    """Return the statement of the party as a dictionary:
    opening, lines, closing and aging"""
    pool = Pool()
    MoveLine = pool.get('account.move.line')
    Invoice = pool.get('account.invoice')

    domain = [
        ('party', '=', party.id),
        ('account.type.receivable', '=', True),
        ('move.state', '=', 'posted'),
        ('move.company', '=', company.id),
        ('date', '<=', to_date),
        ]
    with Transaction().set_context(company=company.id):
        lines = MoveLine.search(
            domain, order=[('date', 'ASC'), ('move.number', 'ASC'),
                ('id', 'ASC')])

    opening = Decimal(0)
    statement_lines = []
    balance = None
    for line in lines:
        amount = line.debit - line.credit
        if line.date < from_date:
            opening += amount
            continue
        if balance is None:
            balance = opening
        balance += amount
        origin = line.move.origin
        if isinstance(origin, Invoice) and origin.move == line.move:
            kind = "Invoice" if origin.total_amount >= 0 else "Credit Memo"
            if origin.type == 'in':
                kind = "Bill"
            document = '%s %s' % (kind, origin.number)
            description = origin.reference or origin.description or ''
        else:
            document = "Payment" if amount < 0 else "Charge"
            if line.move.number:
                document += ' %s' % line.move.number
            description = line.description or line.move.description or ''
            if isinstance(origin, Invoice):
                description = description or 'Invoice %s' % origin.number
        statement_lines.append(StatementLine(
                date=line.date,
                document=document,
                description=description,
                charge=amount if amount > 0 else Decimal(0),
                payment=-amount if amount < 0 else Decimal(0),
                balance=balance,
                due_date=line.maturity_date))
    closing = balance if balance is not None else opening

    aging = {key: Decimal(0) for key, *_ in AGING}
    for line in lines:
        reconciliation = line.reconciliation
        if reconciliation and reconciliation.date <= to_date:
            continue
        amount = line.debit - line.credit
        due = line.maturity_date or line.date
        days = (to_date - due).days
        for key, _, low, high in AGING:
            if (low is None or days >= low) and (high is None or days <= high):
                aging[key] += amount
                break
        else:
            aging['current'] += amount
    return {
        'party': party,
        'address': party.address_get(type='invoice'),
        'from_date': from_date,
        'to_date': to_date,
        'opening': opening,
        'lines': statement_lines,
        'closing': closing,
        'aging': [(label, aging[key]) for key, label, *_ in AGING],
        'currency': company.currency,
        }


class StatementStart(ModelView):
    "Customer Statement"
    __name__ = 'nline.customer_statement.start'

    company = fields.Many2One('company.company', "Company", required=True)
    from_date = fields.Date("From Date", required=True)
    to_date = fields.Date("To Date", required=True)
    parties = fields.Many2Many(
        'party.party', None, None, "Customers",
        context={
            'company': Eval('company', -1),
            },
        depends={'company'},
        help="Leave empty for every customer with activity or a balance.")

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_from_date(cls):
        pool = Pool()
        Date = pool.get('ir.date')
        return Date.today().replace(day=1)

    @classmethod
    def default_to_date(cls):
        pool = Pool()
        Date = pool.get('ir.date')
        return Date.today()


class PrintStatement(Wizard):
    "Customer Statement"
    __name__ = 'nline.customer_statement.print'
    start = StateView(
        'nline.customer_statement.start',
        'nline_customer_statement.statement_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Print", 'print_', 'tryton-print', default=True),
            ])
    print_ = StateReport('nline.customer_statement')

    def default_start(self, fields):
        defaults = {}
        if self.model and self.model.__name__ == 'party.party':
            defaults['parties'] = [r.id for r in self.records]
        return defaults

    def do_print_(self, action):
        pool = Pool()
        MoveLine = pool.get('account.move.line')
        start = self.start
        if start.parties:
            party_ids = [p.id for p in start.parties]
        else:
            lines = MoveLine.search([
                    ('account.type.receivable', '=', True),
                    ('move.state', '=', 'posted'),
                    ('move.company', '=', start.company.id),
                    ('date', '<=', start.to_date),
                    ('party', '!=', None),
                    ['OR',
                        ('date', '>=', start.from_date),
                        ('reconciliation', '=', None),
                        ],
                    ])
            party_ids = sorted({l.party.id for l in lines})
        data = {
            'company': start.company.id,
            'from_date': start.from_date,
            'to_date': start.to_date,
            'parties': party_ids,
            }
        return action, data


class Statement(Report):
    "Customer Statement"
    __name__ = 'nline.customer_statement'

    @classmethod
    def get_context(cls, records, header, data):
        pool = Pool()
        Company = pool.get('company.company')
        Party = pool.get('party.party')
        context = super().get_context(records, header, data)
        company = Company(data['company'])
        parties = Party.browse(data.get('parties') or [r.id for r in records])
        context['company'] = company
        context['statements'] = [
            get_statement(company, p, data['from_date'], data['to_date'])
            for p in sorted(parties, key=lambda p: p.rec_name)]
        return context

    @classmethod
    def _get_records(cls, ids, model, data):
        pool = Pool()
        Party = pool.get('party.party')
        return Party.browse(data.get('parties') or ids)
