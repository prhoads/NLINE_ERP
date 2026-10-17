# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime
import io
from decimal import Decimal
from itertools import groupby

from sql import Literal, Null
from sql.aggregate import Sum

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.report import Report
from trytond.transaction import Transaction
from trytond.wizard import (
    Button, StateAction, StateTransition, StateView, Wizard)

FORMS = [
    ('nec', "1099-NEC"),
    ('misc', "1099-MISC"),
    ]
# The boxes of payment by form
BOXES = [
    ('nec_1', "1099-NEC 1 - Nonemployee compensation"),
    ('nec_3', "1099-NEC 3 - Excess golden parachute payments"),
    ('misc_1', "1099-MISC 1 - Rents"),
    ('misc_2', "1099-MISC 2 - Royalties"),
    ('misc_3', "1099-MISC 3 - Other income"),
    ('misc_5', "1099-MISC 5 - Fishing boat proceeds"),
    ('misc_6', "1099-MISC 6 - Medical and health care payments"),
    ('misc_8', "1099-MISC 8 - Substitute payments in lieu of dividends "
        "or interest"),
    ('misc_9', "1099-MISC 9 - Crop insurance proceeds"),
    ('misc_10', "1099-MISC 10 - Gross proceeds paid to an attorney"),
    ('misc_11', "1099-MISC 11 - Fish purchased for resale"),
    ('misc_12', "1099-MISC 12 - Section 409A deferrals"),
    ('misc_15', "1099-MISC 15 - Nonqualified deferred compensation"),
    ]
BOX_TITLES = {
    'nec_1': "Nonemployee compensation",
    'nec_3': "Excess golden parachute payments",
    'misc_1': "Rents",
    'misc_2': "Royalties",
    'misc_3': "Other income",
    'misc_5': "Fishing boat proceeds",
    'misc_6': "Medical and health care payments",
    'misc_8': "Substitute payments in lieu of dividends or interest",
    'misc_9': "Crop insurance proceeds",
    'misc_10': "Gross proceeds paid to an attorney",
    'misc_11': "Fish purchased for resale",
    'misc_12': "Section 409A deferrals",
    'misc_15': "Nonqualified deferred compensation",
    }
FORM_TITLES = {
    'nec': "Nonemployee Compensation",
    'misc': "Miscellaneous Information",
    }
TIN_TYPES = ['us_ein', 'us_ssn', 'us_itin', 'us_atin']
TAX_CLASSIFICATIONS = [
    (None, ""),
    ('individual', "Individual/sole proprietor or single-member LLC"),
    ('c_corporation', "C corporation"),
    ('s_corporation', "S corporation"),
    ('partnership', "Partnership"),
    ('trust', "Trust/estate"),
    ('llc_c', "LLC taxed as C corporation"),
    ('llc_s', "LLC taxed as S corporation"),
    ('llc_p', "LLC taxed as partnership"),
    ('other', "Other"),
    ]


def box_form(box):
    return box.split('_', 1)[0]


def box_number(box):
    return box.split('_', 1)[1]


def tin_digits(code):
    return ''.join(c for c in (code or '') if c.isdigit())


def format_tin(type_, code):
    digits = tin_digits(code)
    if len(digits) != 9:
        return code or ''
    if type_ == 'us_ein':
        return '%s-%s' % (digits[:2], digits[2:])
    return '%s-%s-%s' % (digits[:3], digits[3:5], digits[5:])


def truncate_tin(code):
    "Return the TIN truncated to the last four digits for recipient copies"
    digits = tin_digits(code)
    if len(digits) != 9:
        return ''
    return '***-**-%s' % digits[-4:]


class Account(metaclass=PoolMeta):
    __name__ = 'account.account'
    us_1099_payment = fields.Boolean(
        "1099 Payment Account",
        help="Check if the cash paid from this account must be reported "
        "on Forms 1099 (bank and payment clearing accounts).\n"
        "Leave unchecked for credit card accounts as those payments are "
        "reported by the card processor on Form 1099-K.")

    @classmethod
    def default_us_1099_payment(cls):
        return False


class Party(metaclass=PoolMeta):
    __name__ = 'party.party'
    us_1099_box = fields.Selection([(None, "")] + BOXES, "1099 Box",
        help="The box of Form 1099 where the payments to the party are "
        "reported.\nLeave empty if the party does not receive a Form 1099.")
    us_tax_classification = fields.Selection(
        TAX_CLASSIFICATIONS, "Federal Tax Classification",
        help="As declared on the Form W-9 of the party.")
    us_w9_date = fields.Date("W-9 Received",
        help="The date of the Form W-9 received from the party.")
    us_1099_second_tin_notice = fields.Boolean("2nd TIN Notice",
        help="Check if the IRS notified twice in 3 years that the TIN of "
        "the party is incorrect.")
    us_1099_tin = fields.Function(fields.Many2One(
            'party.identifier', "1099 TIN"), 'get_us_1099_tin')

    def get_us_1099_tin(self, name):
        identifiers = {
            i.type: i for i in self.identifiers if i.type in TIN_TYPES}
        for type_ in TIN_TYPES:
            if type_ in identifiers:
                return identifiers[type_].id


class Threshold(ModelSQL, ModelView):
    "US 1099 Threshold"
    __name__ = 'account.us.1099.threshold'
    box = fields.Selection(BOXES, "Box", required=True)
    start_year = fields.Integer("Start Year", required=True,
        help="The first calendar year of payments for the threshold.")
    amount = fields.Numeric("Amount", digits=(16, 2), required=True,
        help="The minimal amount paid in the year to file the form.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('box_year_unique', Unique(t, t.box, t.start_year),
                'account_us_1099.msg_threshold_unique'),
            ]
        cls._order.insert(0, ('box', 'ASC'))
        cls._order.insert(1, ('start_year', 'DESC'))

    @classmethod
    def get_amounts(cls, year):
        "Return the threshold amount by box for the year"
        amounts = {}
        for threshold in cls.search(
                [('start_year', '<=', year)],
                order=[('start_year', 'ASC')]):
            amounts[threshold.box] = threshold.amount
        return amounts


class Amount(ModelSQL, ModelView):
    "US 1099 Amount"
    __name__ = 'account.us.1099'
    company = fields.Many2One(
        'company.company', "Company", required=True,
        states={
            'readonly': Eval('id', -1) >= 0,
            })
    year = fields.Integer("Year", required=True,
        states={
            'readonly': Eval('id', -1) >= 0,
            },
        help="The calendar year of the payments.")
    party = fields.Many2One(
        'party.party', "Recipient", required=True,
        context={
            'company': Eval('company', -1),
            },
        depends={'company'},
        states={
            'readonly': Eval('id', -1) >= 0,
            })
    box = fields.Selection(BOXES, "Box", required=True)
    form = fields.Function(fields.Selection(FORMS, "Form"),
        'on_change_with_form', searcher='search_form')
    computed_amount = fields.Numeric(
        "Computed Amount", digits=(16, 2), readonly=True,
        help="The payments of the year computed from the accounting.")
    adjustment = fields.Numeric("Adjustment", digits=(16, 2),
        help="Add or remove an amount to the computed amount.")
    amount = fields.Function(
        fields.Numeric("Amount", digits=(16, 2)), 'get_amount')
    federal_withheld = fields.Numeric(
        "Federal Income Tax Withheld", digits=(16, 2),
        help="The backup withholding of the year (box 4).")
    reportable = fields.Function(fields.Boolean("Reportable",
            help="If the amount reaches the threshold of the box."),
        'get_reportable')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('party_box_unique',
                Unique(t, t.company, t.year, t.party, t.box),
                'account_us_1099.msg_amount_unique'),
            ]
        cls._order = [
            ('year', 'DESC'),
            ('party.name', 'ASC'),
            ('box', 'ASC'),
            ('id', 'ASC'),
            ]

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_year(cls):
        return default_year()

    @classmethod
    def default_computed_amount(cls):
        return Decimal(0)

    @classmethod
    def default_adjustment(cls):
        return Decimal(0)

    @classmethod
    def default_federal_withheld(cls):
        return Decimal(0)

    @fields.depends('box')
    def on_change_with_form(self, name=None):
        if self.box:
            return box_form(self.box)

    @classmethod
    def search_form(cls, name, clause):
        _, operator, value = clause
        if operator in {'=', '!='} and value:
            boxes = [b for b, _ in BOXES if box_form(b) == value]
            return [('box', 'in' if operator == '=' else 'not in', boxes)]
        return []

    def get_amount(self, name):
        return (self.computed_amount or 0) + (self.adjustment or 0)

    @classmethod
    def get_reportable(cls, amounts, name):
        pool = Pool()
        Threshold = pool.get('account.us.1099.threshold')
        thresholds = {}
        result = {}
        for amount in amounts:
            if amount.year not in thresholds:
                thresholds[amount.year] = Threshold.get_amounts(amount.year)
            threshold = thresholds[amount.year].get(amount.box)
            result[amount.id] = bool(
                (amount.federal_withheld or 0) > 0
                or (amount.amount and threshold is not None
                    and amount.amount >= threshold))
        return result

    def get_rec_name(self, name):
        return '%s - %s - %s' % (
            self.year, self.party.rec_name, dict(BOXES)[self.box])

    @classmethod
    def compute(cls, company, year):
        """Compute the payments of the year to the 1099 parties

        The payments are the moves of the year with a 1099 payment account.
        The amount is the debit minus the credit of the lines of the party on
        the payable and expense accounts of those moves, so the refunds
        received are deducted."""
        pool = Pool()
        Account = pool.get('account.account')
        AccountType = pool.get('account.account.type')
        Line = pool.get('account.move.line')
        Move = pool.get('account.move')
        Party = pool.get('party.party')
        transaction = Transaction()
        cursor = transaction.connection.cursor()

        line = Line.__table__()
        payment_line = Line.__table__()
        move = Move.__table__()
        account = Account.__table__()
        payment_account = Account.__table__()
        type_ = AccountType.__table__()
        party = Party.__table__()

        start = datetime.date(year, 1, 1)
        end = datetime.date(year, 12, 31)
        payment_moves = (payment_line
            .join(payment_account,
                condition=payment_line.account == payment_account.id)
            .select(payment_line.move,
                where=(payment_account.us_1099_payment == Literal(True))
                & (payment_account.company == company.id)))
        query = (line
            .join(move, condition=line.move == move.id)
            .join(account, condition=line.account == account.id)
            .join(type_, condition=account.type == type_.id)
            .join(party, condition=line.party == party.id)
            .select(
                line.party, party.us_1099_box,
                Sum(line.debit - line.credit),
                where=(move.company == company.id)
                & (move.state == 'posted')
                & (move.date >= start) & (move.date <= end)
                & (party.us_1099_box != Null)
                & ((type_.payable == Literal(True))
                    | (type_.expense == Literal(True)))
                & (account.us_1099_payment != Literal(True))
                & line.move.in_(payment_moves),
                group_by=[line.party, party.us_1099_box]))
        cursor.execute(*query)
        computed = {
            (party_id, box): Decimal(str(total or 0)).quantize(
                Decimal('0.01'))
            for party_id, box, total in cursor}

        existing = cls.search([
                ('company', '=', company.id),
                ('year', '=', year),
                ])
        to_save = []
        for amount in existing:
            key = (amount.party.id, amount.box)
            value = computed.pop(key, Decimal(0))
            if amount.computed_amount != value:
                amount.computed_amount = value
                to_save.append(amount)
        for (party_id, box), value in computed.items():
            to_save.append(cls(
                    company=company, year=year, party=party_id, box=box,
                    computed_amount=value))
        cls.save(to_save)
        return cls.search([
                ('company', '=', company.id),
                ('year', '=', year),
                ])

    @classmethod
    def forms(cls, amounts):
        """Return the forms to file as list of (form, party, amounts)
        for the reportable amounts"""
        def key(a):
            return (a.company.id, a.year, a.form, a.party.id)
        reportable = {a for a in amounts if a.reportable}
        result = []
        for _, group in groupby(sorted(amounts, key=key), key=key):
            group = list(group)
            if not reportable.intersection(group):
                continue
            first = group[0]
            result.append(Form(first.company, first.year, first.form,
                    first.party, group))
        return result


def default_year():
    "The previous year until the filing deadlines else the current year"
    pool = Pool()
    Date = pool.get('ir.date')
    today = Date.today()
    if today.month <= 3:
        return today.year - 1
    return today.year


class Form:
    "A Form 1099 for a recipient"

    def __init__(self, company, year, form, party, amounts):
        self.company = company
        self.year = year
        self.form = form
        self.party = party
        self.amounts = amounts

    @property
    def boxes(self):
        "Return the amount by box number"
        boxes = {}
        for amount in self.amounts:
            number = box_number(amount.box)
            boxes[number] = boxes.get(number, Decimal(0)) + amount.amount
        withheld = sum(a.federal_withheld or 0 for a in self.amounts)
        if withheld:
            boxes['4'] = withheld
        return boxes

    @property
    def tin(self):
        return self.party.us_1099_tin

    @property
    def payer_tin(self):
        party = self.company.party
        for identifier in party.identifiers:
            if identifier.type == 'us_ein':
                return identifier

    @property
    def address(self):
        return self.party.address_get()

    @property
    def payer_address(self):
        return self.company.party.address_get()

    def check(self):
        "Raise ValidationError if the form can not be filed"
        if not self.payer_tin:
            raise ValidationError(gettext(
                    'account_us_1099.msg_payer_tin_missing',
                    company=self.company.rec_name))
        if not self.tin:
            raise ValidationError(gettext(
                    'account_us_1099.msg_tin_missing',
                    party=self.party.rec_name))
        if len(tin_digits(self.tin.code)) != 9:
            raise ValidationError(gettext(
                    'account_us_1099.msg_tin_invalid',
                    party=self.party.rec_name))
        address = self.address
        if (not address or not address.street or not address.city
                or not address.postal_code):
            raise ValidationError(gettext(
                    'account_us_1099.msg_address_missing',
                    party=self.party.rec_name))


class ComputeStart(ModelView):
    "Compute US 1099"
    __name__ = 'account.us.1099.compute.start'
    company = fields.Many2One('company.company', "Company", required=True)
    year = fields.Integer("Year", required=True)

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_year(cls):
        return default_year()


class Compute(Wizard):
    "Compute US 1099"
    __name__ = 'account.us.1099.compute'
    start = StateView('account.us.1099.compute.start',
        'account_us_1099.compute_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Compute", 'compute', 'tryton-ok', default=True),
            ])
    compute = StateAction('account_us_1099.act_amount_form')

    def do_compute(self, action):
        pool = Pool()
        Amount = pool.get('account.us.1099')
        amounts = Amount.compute(self.start.company, self.start.year)
        action['name'] += ' - %s' % self.start.year
        return action, {
            'res_id': [a.id for a in amounts],
            }


class ExportStart(ModelView):
    "Export US 1099"
    __name__ = 'account.us.1099.export.start'
    company = fields.Many2One('company.company', "Company", required=True)
    year = fields.Integer("Year", required=True)

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_year(cls):
        return default_year()


class ExportResult(ModelView):
    "Export US 1099"
    __name__ = 'account.us.1099.export.result'
    nec_file = fields.Binary("1099-NEC File", readonly=True,
        filename='nec_filename')
    nec_filename = fields.Char("1099-NEC File Name", readonly=True)
    nec_count = fields.Integer("1099-NEC Forms", readonly=True)
    misc_file = fields.Binary("1099-MISC File", readonly=True,
        filename='misc_filename')
    misc_filename = fields.Char("1099-MISC File Name", readonly=True)
    misc_count = fields.Integer("1099-MISC Forms", readonly=True)


class Export(Wizard):
    "Export US 1099"
    __name__ = 'account.us.1099.export'
    start = StateView('account.us.1099.export.start',
        'account_us_1099.export_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Export", 'export', 'tryton-ok', default=True),
            ])
    export = StateTransition()
    result = StateView('account.us.1099.export.result',
        'account_us_1099.export_result_view_form', [
            Button("Close", 'end', 'tryton-close'),
            ])

    def transition_export(self):
        pool = Pool()
        Amount = pool.get('account.us.1099')
        amounts = Amount.search([
                ('company', '=', self.start.company.id),
                ('year', '=', self.start.year),
                ])
        forms = Amount.forms(amounts)
        for form in forms:
            form.check()
        self.result.nec_count = self.result.misc_count = 0
        for form_type in ['nec', 'misc']:
            rows = [f for f in forms if f.form == form_type]
            setattr(self.result, '%s_count' % form_type, len(rows))
            if not rows:
                continue
            data = export_workbook(form_type, [fire_values(f) for f in rows])
            filename = 'F1099%s-%s.xlsx' % (
                form_type.upper(), self.start.year)
            setattr(self.result, '%s_file' % form_type, data)
            setattr(self.result, '%s_filename' % form_type, filename)
        return 'result'

    def default_result(self, fields):
        values = {}
        for name in fields:
            value = getattr(self.result, name, None)
            if value is not None:
                values[name] = value
        return values


# The amount boxes by form
BOX_NUMBERS = {
    'nec': ['1', '3', '4'],
    'misc': ['1', '2', '3', '4', '5', '6', '8', '9', '10', '11', '12', '15'],
    }

# The workbooks of 1099FIRE (tax year 2025) as (sheet, columns) by form.
# A column is a header and the key of its value in the row of the form.
FIRE_LAYOUTS = {
    'nec': ('1099-NEC Data', [
            ('DO NOT USE', None),
            ('Corrected (0, 1 or 2)', 'corrected'),
            ('Payer Name', 'payer_name'),
            ('Payer Address', 'payer_address'),
            ('Payer City', 'payer_city'),
            ('Payer State', 'payer_state'),
            ('Payer Zip', 'payer_zip'),
            ('Payer Phone', 'payer_phone'),
            ('Payer TIN', 'payer_tin'),
            ('Recipient TIN', 'recipient_tin'),
            ('Recipient Name', 'recipient_name'),
            ('Recipient Address', 'recipient_address'),
            ('Recipient City', 'recipient_city'),
            ('Recipient State', 'recipient_state'),
            ('Recipient Zip', 'recipient_zip'),
            ('Recipient Account Number', 'account_number'),
            ('Box 1 - Non Employee Compensation', 'box_1'),
            ('Box 2 - Payer Made Direct Sales', None),
            ('Box 3 - Excess Golden Parachute Payments', 'box_3'),
            ('Box 4 - Federal Tax Withholding', 'box_4'),
            ('Box 5_1 - State Tax Witholding', None),
            ('Box 5_2 - State Tax Witholding', None),
            ('Box 6_1 - State Payers No', None),
            ('Box 6_2 - State Payers No', None),
            ('Box 7_1 - State Income Amt', None),
            ('Box 7_2 - State Income Amt', None),
            ]),
    'misc': ('1099-MISC Data', [
            ('DO NOT USE', None),
            ('Corrected (0, 1 or 2)', 'corrected'),
            ('Payer Name', 'payer_name'),
            ('Payer Address', 'payer_address'),
            ('Payer City', 'payer_city'),
            ('Payer State', 'payer_state'),
            ('Payer Zip', 'payer_zip'),
            ('Payer Phone', 'payer_phone'),
            ('Payer TIN', 'payer_tin'),
            ('Recipient TIN', 'recipient_tin'),
            ('Recipient Name', 'recipient_name'),
            ('Recipient Address', 'recipient_address'),
            ('Recipient City', 'recipient_city'),
            ('Recipient State', 'recipient_state'),
            ('Recipient Zip', 'recipient_zip'),
            ('Acct No', 'account_number'),
            ('Box 13\nFATCA', None),
            ('Box 1\nRents', 'box_1'),
            ('Box 2\nRoyalties', 'box_2'),
            ('Box 3\nOther income', 'box_3'),
            ('Box 4\nTax Withheld', 'box_4'),
            ('Box 5 Fishing Boat', 'box_5'),
            ('Box 6 Medical Payments', 'box_6'),
            ('Box 7 Doirect Sales (1=Yes)', None),
            ('Box 8 Sub Payments in lieu Div', 'box_8'),
            ('Box 9 Crop Ins', 'box_9'),
            ('Box 10 Attorney Fees', 'box_10'),
            ('Box 11 Resale Fish', 'box_11'),
            ('Box 12 409A Deferrals', 'box_12'),
            ('Box 14 - Blank', None),
            ('Box 15 Non-Qual Deferred Pay', 'box_15'),
            ('Box 16_1 Stae 1 Tax W/H', None),
            ('Box 16_2 State 2 Tax W/H', None),
            ('Box 17_1 State 1 No', None),
            ('Box 17_2 State 2 No', None),
            ('Box 18_1 State 1 Income', None),
            ('Box 18_2 State 2 Income', None),
            ]),
    }


def _address_values(address):
    "Return street (lines separated by |), city, state and ZIP"
    if not address:
        return ['', '', '', '']
    street = '|'.join(
        l.strip() for l in (address.street or '').splitlines() if l.strip())
    return [
        street,
        address.city or '',
        address.subdivision.code.split('-')[-1]
        if address.subdivision else '',
        address.postal_code or '',
        ]


def fire_values(form):
    "Return the values of the form by key of FIRE_LAYOUTS"
    company_party = form.company.party
    payer_tin = form.payer_tin
    payer_street, payer_city, payer_state, payer_zip = _address_values(
        form.payer_address)
    street, city, state, zip_ = _address_values(form.address)
    tin = form.tin
    values = {
        'corrected': 0,
        'payer_name': company_party.name,
        'payer_address': payer_street,
        'payer_city': payer_city,
        'payer_state': payer_state,
        'payer_zip': payer_zip,
        'payer_phone': company_party.phone or '',
        'payer_tin': format_tin('us_ein', payer_tin.code if payer_tin else ''),
        'recipient_tin': format_tin(tin.type, tin.code) if tin else '',
        'recipient_name': form.party.name,
        'recipient_address': street,
        'recipient_city': city,
        'recipient_state': state,
        'recipient_zip': zip_,
        'account_number': form.party.code or str(form.party.id),
        }
    for number, amount in form.boxes.items():
        if amount:
            values['box_%s' % number] = amount
    return values


def export_workbook(form_type, rows):
    "Return the 1099FIRE workbook of the rows (values by key)"
    from openpyxl import Workbook

    sheet_name, columns = FIRE_LAYOUTS[form_type]
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    sheet.append([h for h, _ in columns])
    for values in rows:
        row = []
        for _, key in columns:
            value = values.get(key) if key else None
            if value == '':
                value = None
            row.append(value)
        sheet.append(row)
    # Keep the leading zeros of ZIP codes
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, str):
                cell.data_type = 's'
                cell.number_format = '@'
    content = io.BytesIO()
    workbook.save(content)
    return content.getvalue()


class RecipientCopy(Report):
    "Form 1099 Copy B"
    __name__ = 'account.us.1099.recipient'

    @classmethod
    def _execute(cls, records, header, data, action):
        pool = Pool()
        Amount = pool.get('account.us.1099')
        from .form import render
        amounts = Amount.browse([r.id for r in records])
        # Include all the boxes of the forms of the records
        keys = {(a.company.id, a.year, a.party.id) for a in amounts}
        domain = ['OR'] + [[
                ('company', '=', c), ('year', '=', y), ('party', '=', p)]
            for c, y, p in sorted(keys)]
        forms = Amount.forms(Amount.search(domain))
        for form in forms:
            form.check()
        return 'pdf', render(forms)
