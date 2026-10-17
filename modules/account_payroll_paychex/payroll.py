# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.model.exceptions import AccessError
from trytond.exceptions import UserError
from trytond.pool import Pool
from trytond.pyson import Eval, PYSONEncoder
from trytond.transaction import Transaction
from trytond.wizard import (
    Button, StateAction, StateTransition, StateView, Wizard)

from .paychex import PaychexError, normalize, parse


class Mapping(ModelSQL, ModelView):
    "Paychex Mapping"
    __name__ = 'account.payroll.paychex.mapping'
    company = fields.Many2One('company.company', "Company", required=True)
    section = fields.Char("Section", required=True,
        help="The section of the Paychex General Ledger Report.")
    label = fields.Char("Label", required=True,
        help="The description of the line in the report.")
    section_key = fields.Char("Section Key", readonly=True)
    label_key = fields.Char("Label Key", readonly=True)
    account = fields.Many2One(
        'account.account', "Account",
        domain=[
            ('company', '=', Eval('company', -1)),
            ('type', '!=', None),
            ('closed', '!=', True),
            ],
        help="The account where the amount of the line is posted.")
    distribute = fields.Boolean(
        "Distribute at Import",
        help="Check to distribute the amount between accounts at each "
        "import (e.g. earnings by department).")
    party = fields.Many2One('party.party', "Party",
        context={
            'company': Eval('company', -1),
            },
        depends={'company'},
        help="Required for payable or receivable accounts.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('key_unique', Unique(t, t.company, t.section_key, t.label_key),
                'account_payroll_paychex.msg_mapping_unique'),
            ]
        cls._order.insert(0, ('section', 'ASC'))
        cls._order.insert(1, ('label', 'ASC'))

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def _set_keys(cls, values):
        values = values.copy()
        if 'section' in values:
            values['section_key'] = normalize(values['section'] or '')
        if 'label' in values:
            values['label_key'] = normalize(values['label'] or '')
        return values

    @classmethod
    def create(cls, vlist):
        return super().create([cls._set_keys(v) for v in vlist])

    @classmethod
    def write(cls, *args):
        actions = iter(args)
        args = []
        for records, values in zip(actions, actions):
            args.extend((records, cls._set_keys(values)))
        super().write(*args)


class ImportStart(ModelView):
    "Import Paychex Payroll"
    __name__ = 'account.payroll.paychex.import.start'
    company = fields.Many2One('company.company', "Company", required=True)
    journal = fields.Many2One(
        'account.journal', "Journal", required=True,
        context={
            'company': Eval('company', -1),
            },
        depends={'company'})
    report = fields.Binary("General Ledger Report", required=True,
        filename='report_name',
        help='The PDF "General Ledger Report by Check Date" from Paychex.')
    report_name = fields.Char("Report Name")

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_journal(cls):
        pool = Pool()
        Journal = pool.get('account.journal')
        journals = Journal.search([('type', '=', 'general')], limit=1)
        if journals:
            return journals[0].id


class ImportDistribute(ModelView):
    "Import Paychex Payroll Distribution"
    __name__ = 'account.payroll.paychex.import.distribute'
    lines = fields.One2Many(
        'account.payroll.paychex.import.distribute.line', None, "Lines",
        help="Distribute the amount of the lines between the accounts.")


class ImportDistributeLine(ModelView):
    "Import Paychex Payroll Distribution Line"
    __name__ = 'account.payroll.paychex.import.distribute.line'
    label = fields.Char("Paychex Line", required=True, readonly=True)
    total = fields.Numeric("Total", digits=(16, 2), readonly=True)
    account = fields.Many2One(
        'account.account', "Account", required=True,
        domain=[
            ('type', '!=', None),
            ('closed', '!=', True),
            ])
    amount = fields.Numeric("Amount", digits=(16, 2), required=True)


class Import(Wizard):
    "Import Paychex Payroll"
    __name__ = 'account.payroll.paychex.import'
    start = StateView('account.payroll.paychex.import.start',
        'account_payroll_paychex.import_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Import", 'import_', 'tryton-ok', default=True),
            ])
    import_ = StateTransition()
    distribute = StateView('account.payroll.paychex.import.distribute',
        'account_payroll_paychex.import_distribute_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Import", 'create_', 'tryton-ok', default=True),
            ])
    create_ = StateTransition()
    open_move = StateAction('account.act_move_line_form')
    open_mappings = StateAction('account_payroll_paychex.act_mapping_form')

    def transition_import_(self):
        report, mappings = self._check()
        if mappings is None:
            return 'open_mappings'
        if any(mappings[l.key].distribute for l in report.lines
                if l.debit or l.credit):
            return 'distribute'
        self.create_move()
        return 'open_move'

    def default_distribute(self, fields):
        "Propose the distribution of the last import"
        pool = Pool()
        MoveLine = pool.get('account.move.line')
        report, mappings = self._check()
        lines = []
        for line in report.lines:
            mapping = mappings[line.key]
            amount = line.debit or line.credit
            if not mapping.distribute or not amount:
                continue
            previous = MoveLine.search([
                    ('move.company', '=', self.start.company.id),
                    ('move.description', 'like', 'Paychex %'),
                    ('description', '=', line.label),
                    ], order=[('move.date', 'DESC'), ('id', 'DESC')])
            last = [l for l in previous if l.move == previous[0].move] if (
                previous) else []
            previous_total = sum(l.debit + l.credit for l in last)
            accounts = [l for l in last if l.debit + l.credit]
            if not accounts or not previous_total:
                lines.append({
                        'label': line.label,
                        'total': amount,
                        'account': mapping.account.id,
                        'amount': amount,
                        })
                continue
            remaining = amount
            for i, previous_line in enumerate(accounts):
                if i == len(accounts) - 1:
                    value = remaining
                else:
                    value = (amount * (previous_line.debit
                            + previous_line.credit) / previous_total
                        ).quantize(Decimal('0.01'))
                    remaining -= value
                lines.append({
                        'label': line.label,
                        'total': amount,
                        'account': previous_line.account.id,
                        'amount': value,
                        })
        return {'lines': lines}

    def transition_create_(self):
        self.create_move()
        return 'open_move'

    def do_open_move(self, action):
        return action, {
            'res_id': [l.id for l in self.move.lines],
            }

    def do_open_mappings(self, action):
        action['name'] = gettext(
            'account_payroll_paychex.msg_mapping_to_complete')
        action['pyson_domain'] = PYSONEncoder().encode([
                ('company', '=', self.start.company.id),
                ('account', '=', None),
                ])
        return action, {}

    @classmethod
    def reference(cls, report):
        return 'Paychex %s %s' % (
            report.company_code or '', report.check_date.isoformat())

    def _check(self):
        """Return the report and the mappings by key
        or None as mappings if some must be completed"""
        pool = Pool()
        Mapping = pool.get('account.payroll.paychex.mapping')
        Move = pool.get('account.move')

        company = self.start.company
        try:
            report = parse(bytes(self.start.report))
        except PaychexError as exception:
            raise UserError(gettext(
                    'account_payroll_paychex.msg_report_invalid',
                    error=str(exception))) from exception

        if Move.search([
                    ('company', '=', company.id),
                    ('description', '=', self.reference(report)),
                    ], limit=1):
            raise AccessError(gettext(
                    'account_payroll_paychex.msg_report_already_imported',
                    check_date=report.check_date))

        mappings = {
            (m.section_key, m.label_key): m
            for m in Mapping.search([('company', '=', company.id)])}
        new = []
        for line in report.lines:
            if line.key not in mappings:
                new.append(Mapping(
                        company=company, section=line.section,
                        label=line.label))
                mappings[line.key] = new[-1]
        if new:
            Mapping.save(new)
        if any(not mappings[l.key].account for l in report.lines):
            # The user must set the account of the lines
            return report, None
        return report, mappings

    def create_move(self):
        pool = Pool()
        Move = pool.get('account.move')
        Line = pool.get('account.move.line')
        Period = pool.get('account.period')

        company = self.start.company
        report, mappings = self._check()
        if mappings is None:
            return None

        distributions = {}
        for line in getattr(self.distribute, 'lines', None) or []:
            distributions.setdefault(line.label, []).append(line)

        def move_line(mapping, account, debit, credit, label):
            return Line(
                account=account,
                party=mapping.party if account.party_required else None,
                debit=debit,
                credit=credit,
                description=label)

        period = Period.find(company, date=report.check_date)
        lines = []
        for line in report.lines:
            mapping = mappings[line.key]
            amount = line.debit or line.credit
            if not amount:
                continue
            if mapping.distribute and line.label in distributions:
                parts = distributions[line.label]
                if sum(p.amount for p in parts) != amount:
                    raise UserError(gettext(
                            'account_payroll_paychex'
                            '.msg_distribution_not_total',
                            line=line.label,
                            total=amount))
                for part in parts:
                    if not part.amount:
                        continue
                    lines.append(move_line(
                            mapping, part.account,
                            part.amount if line.debit else 0,
                            part.amount if line.credit else 0,
                            line.label))
            else:
                lines.append(move_line(
                        mapping, mapping.account, line.debit, line.credit,
                        line.label))
        description = self.reference(report)
        move = Move(
            company=company,
            journal=self.start.journal,
            period=period,
            date=report.check_date,
            description=description,
            lines=lines)
        move.save()
        self.move = move
        return move
