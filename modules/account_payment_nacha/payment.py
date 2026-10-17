# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime
import string
from collections import defaultdict

from trytond.i18n import gettext
from trytond.model import ModelView, dualmethod, fields
from trytond.modules.account_payment.exceptions import ProcessError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction

from .nacha import Batch, Entry, File, NachaError

FILE_ID_MODIFIERS = string.ascii_uppercase + string.digits


class Journal(metaclass=PoolMeta):
    __name__ = 'account.payment.journal'
    _nacha_states = {
        'required': Eval('process_method') == 'nacha',
        'invisible': Eval('process_method') != 'nacha',
        }
    nacha_profile = fields.Selection([
            (None, "Standard"),
            ('chase', "Chase"),
            ], "Nacha Profile",
        states={
            'invisible': Eval('process_method') != 'nacha',
            },
        help="Apply the rules of the bank to the file.")
    nacha_bank_account = fields.Many2One(
        'bank.account', "Bank Account", states=_nacha_states,
        help="The company account to pay from or to deposit into.")
    nacha_immediate_destination = fields.Char(
        "Immediate Destination", size=9, states=_nacha_states,
        help="The routing number of the bank receiving the file.")
    nacha_immediate_destination_name = fields.Char(
        "Immediate Destination Name", size=23, states=_nacha_states)
    nacha_company_identification = fields.Char(
        "Company Identification", size=10, states=_nacha_states,
        help="The 10 digits identifier given by the bank.")
    nacha_company_name = fields.Char(
        "Company Name", size=16,
        states={
            'invisible': Eval('process_method') != 'nacha',
            })
    nacha_entry_class = fields.Selection([
            ('CCD', "CCD - Corporate"),
            ('PPD', "PPD - Personal"),
            ], "Standard Entry Class", states=_nacha_states)
    nacha_entry_description = fields.Char(
        "Entry Description", size=10, states=_nacha_states,
        help="Shown on the bank statement of the receiver.")
    del _nacha_states

    @classmethod
    def __setup__(cls):
        super().__setup__()
        method = ('nacha', "Nacha (ACH)")
        if method not in cls.process_method.selection:
            cls.process_method.selection.append(method)

    @classmethod
    def default_nacha_profile(cls):
        return 'chase'

    @classmethod
    def default_nacha_immediate_destination(cls):
        return '021000021'

    @classmethod
    def default_nacha_immediate_destination_name(cls):
        return 'JPMORGAN CHASE'

    @classmethod
    def default_nacha_entry_class(cls):
        return 'CCD'

    @classmethod
    def default_nacha_entry_description(cls):
        return 'ACH PMT'


class Group(metaclass=PoolMeta):
    __name__ = 'account.payment.group'
    nacha_file = fields.Binary(
        "Nacha File", filename='nacha_filename', readonly=True,
        states={
            'invisible': ~Eval('nacha_file'),
            })
    nacha_filename = fields.Char("Nacha Filename", readonly=True)
    nacha_file_id_modifier = fields.Char(
        "File ID Modifier", size=1, readonly=True)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._buttons.update({
                'nacha_generate_file': {
                    'invisible': Eval('process_method') != 'nacha',
                    'depends': ['process_method'],
                    },
                })

    def process_nacha(self):
        self.nacha_file_id_modifier = self._nacha_next_file_id_modifier()
        self.nacha_generate_file(_save=False)

    def _nacha_next_file_id_modifier(self):
        "Return the next modifier for the files of the day"
        pool = Pool()
        Date = pool.get('ir.date')
        today = Date.today()
        start = datetime.datetime.combine(today, datetime.time())
        groups = self.search([
                ('journal', '=', self.journal.id),
                ('nacha_file_id_modifier', '!=', None),
                ('create_date', '>=', start),
                ('id', '!=', self.id),
                ])
        return FILE_ID_MODIFIERS[len(groups) % len(FILE_ID_MODIFIERS)]

    @dualmethod
    @ModelView.button
    def nacha_generate_file(cls, groups, _save=True):
        for group in groups:
            if group.journal.process_method != 'nacha':
                continue
            if not group.nacha_file_id_modifier:
                group.nacha_file_id_modifier = (
                    group._nacha_next_file_id_modifier())
            try:
                content = group.get_nacha_file().encode()
            except NachaError as exception:
                raise ProcessError(gettext(
                        'account_payment_nacha.msg_nacha_error',
                        group=group.rec_name,
                        error=str(exception))) from exception
            group.nacha_file = content
            group.nacha_filename = group.get_nacha_filename()
        if _save:
            cls.save(groups)

    def get_nacha_filename(self):
        # Chase limits the file name to 50 characters
        number = ''.join(c for c in (self.number or '') if c.isalnum())
        return ('ACH-%s.txt' % number)[:50]

    def get_nacha_file(self):
        pool = Pool()
        Date = pool.get('ir.date')
        journal = self.journal
        account = journal.nacha_bank_account
        if not account or not account.us_routing_number:
            raise ProcessError(gettext(
                    'account_payment_nacha.msg_journal_no_routing_number',
                    journal=journal.rec_name))
        company = self.company
        creation = datetime.datetime.now()
        nacha = File(
            immediate_destination=journal.nacha_immediate_destination,
            immediate_origin=journal.nacha_company_identification,
            immediate_destination_name=(
                journal.nacha_immediate_destination_name),
            immediate_origin_name=company.party.name,
            file_id_modifier=self.nacha_file_id_modifier or 'A',
            creation=creation,
            profile=journal.nacha_profile)
        direction = 'credit' if self.kind == 'payable' else 'debit'
        today = Date.today()
        by_date = defaultdict(list)
        for payment in sorted(self.payments, key=lambda p: (p.date, p.id)):
            # The effective date must be after the creation date
            date = max(payment.date, today + datetime.timedelta(days=1))
            by_date[date].append(payment)
        for date, payments in sorted(by_date.items()):
            batch = Batch(
                company_name=(
                    journal.nacha_company_name or company.party.name),
                company_identification=journal.nacha_company_identification,
                entry_description=journal.nacha_entry_description,
                effective_date=date,
                odfi_routing_number=account.us_routing_number,
                standard_entry_class=journal.nacha_entry_class,
                funding_account_number=account.us_account_number,
                descriptive_date=date.strftime('%b %d').upper())
            for payment in payments:
                batch.entries.append(payment.get_nacha_entry(direction))
            nacha.batches.append(batch)
        return nacha


class Payment(metaclass=PoolMeta):
    __name__ = 'account.payment'
    nacha_bank_account = fields.Many2One(
        'bank.account', "Bank Account", ondelete='RESTRICT',
        domain=[
            ('owners', '=', Eval('party', -1)),
            ('us_routing_number', '!=', None),
            ],
        states={
            'invisible': Eval('process_method') != 'nacha',
            'readonly': Eval('state') != 'draft',
            },
        help="The bank account of the party.")

    @fields.depends('party', 'process_method', 'nacha_bank_account')
    def on_change_party(self):
        super().on_change_party()
        if self.process_method == 'nacha' and self.party:
            if (not self.nacha_bank_account
                    or self.party not in self.nacha_bank_account.owners):
                self.nacha_bank_account = self.party.nacha_bank_account
        elif not self.party:
            self.nacha_bank_account = None

    @classmethod
    def create(cls, vlist):
        pool = Pool()
        Party = pool.get('party.party')
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            if not values.get('nacha_bank_account') and values.get('party'):
                account = Party(values['party']).nacha_bank_account
                if account:
                    values['nacha_bank_account'] = account.id
        return super().create(vlist)

    @property
    def nacha_identification(self):
        "Identification of the receiver (must not be an SSN)"
        return self.party.code or str(self.party.id)

    @property
    def nacha_addenda(self):
        "Information for the receiver to reconcile the payment"
        if self.description:
            return self.description
        line = self.line
        if line and line.move_origin:
            return getattr(line.move_origin, 'rec_name', None)

    def get_nacha_entry(self, direction):
        account = self.nacha_bank_account
        if not account:
            raise ProcessError(gettext(
                    'account_payment_nacha.msg_payment_no_bank_account',
                    payment=self.rec_name))
        return Entry(
            routing_number=account.us_routing_number or '',
            account_number=account.us_account_number or '',
            account_type=account.us_account_type or 'checking',
            amount=self.amount,
            name=self.party.name,
            identification=self.nacha_identification,
            direction=direction,
            addenda=self.nacha_addenda)


class Party(metaclass=PoolMeta):
    __name__ = 'party.party'

    @property
    def nacha_bank_account(self):
        "Return the first bank account usable for ACH"
        for account in getattr(self, 'bank_accounts', []):
            if account.active and account.us_routing_number:
                return account
