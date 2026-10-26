# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from collections import defaultdict
from decimal import Decimal
from itertools import groupby

from trytond.i18n import gettext
from trytond.model import fields
from trytond.model.exceptions import AccessError
from trytond.modules.company import CompanyReport
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval, Id

ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
    'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
    'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
TENS = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
    'Eighty', 'Ninety']
SCALES = [
    (10 ** 12, 'Trillion'), (10 ** 9, 'Billion'), (10 ** 6, 'Million'),
    (1000, 'Thousand'), (100, 'Hundred')]


def _words(number):
    if number < 20:
        return ONES[number]
    if number < 100:
        tens, ones = divmod(number, 10)
        return TENS[tens] + ('-' + ONES[ones] if ones else '')
    for scale, name in SCALES:
        if number >= scale:
            count, rest = divmod(number, scale)
            words = '%s %s' % (_words(count), name)
            if rest:
                words += ' ' + _words(rest)
            return words


def amount_to_words(amount):
    """Return the amount as written on a US check:
    'One Thousand Two Hundred Thirty-Four and 56/100'"""
    amount = Decimal(amount).quantize(Decimal('0.01'))
    dollars = int(amount)
    cents = int((amount - dollars) * 100)
    words = _words(dollars) if dollars else 'Zero'
    return '%s and %02d/100' % (words, cents)


class Journal(metaclass=PoolMeta):
    __name__ = 'account.payment.journal'

    check_sequence = fields.Many2One(
        'ir.sequence', "Check Sequence",
        domain=[
            ('company', 'in', [Eval('company', -1), None]),
            ('sequence_type', '=',
                Id('nline_check_print', 'sequence_type_check')),
            ],
        states={
            'required': Eval('process_method') == 'check',
            'invisible': Eval('process_method') != 'check',
            },
        help="The numbers of the checks of the bank account.")
    check_bank_account = fields.Many2One(
        'bank.account', "Bank Account",
        states={
            'invisible': Eval('process_method') != 'check',
            },
        help="The company account the checks are drawn on.")
    check_micr = fields.Boolean(
        "Print MICR Line",
        states={
            'invisible': Eval('process_method') != 'check',
            },
        help="Print the MICR line for blank check stock "
        "(needs the MICR E-13B font and magnetic toner).\n"
        "Leave unchecked for stock with the MICR line pre-printed.")
    check_micr_routing = fields.Char(
        "MICR Routing Number", size=9,
        states={
            'invisible': ~Eval('check_micr'),
            'required': Eval('check_micr', False),
            })
    check_micr_account = fields.Char(
        "MICR Account Number",
        states={
            'invisible': ~Eval('check_micr'),
            'required': Eval('check_micr', False),
            })

    @classmethod
    def __setup__(cls):
        super().__setup__()
        method = ('check', "Check")
        if method not in cls.process_method.selection:
            cls.process_method.selection.append(method)


class Group(metaclass=PoolMeta):
    __name__ = 'account.payment.group'

    def process_check(self):
        "Number one check for each payee of the group"
        pool = Pool()
        Payment = pool.get('account.payment')
        sequence = self.journal.check_sequence
        payments = sorted(
            self.payments, key=lambda p: (p.party.rec_name, p.id))
        to_save = []
        for party, grouped in groupby(payments, key=lambda p: p.party):
            number = sequence.get()
            for payment in grouped:
                payment.check_number = number
                to_save.append(payment)
        Payment.save(to_save)

    def get_checks(self):
        """Return the checks of the group as dictionaries:
        number, party, address, amount, words, payments"""
        checks = defaultdict(list)
        for payment in self.payments:
            if payment.check_number and payment.state != 'failed':
                checks[payment.check_number].append(payment)
        result = []
        for number in sorted(checks, key=lambda n: (len(n), n)):
            payments = checks[number]
            party = payments[0].party
            amount = sum(p.amount for p in payments)
            result.append({
                    'number': number,
                    'party': party,
                    'address': party.address_get(type='invoice'),
                    'date': max(p.date for p in payments),
                    'amount': amount,
                    'words': amount_to_words(amount),
                    'payments': payments,
                    'currency': payments[0].currency,
                    })
        return result


class Payment(metaclass=PoolMeta):
    __name__ = 'account.payment'

    check_number = fields.Char(
        "Check Number", readonly=True,
        states={
            'invisible': ~Eval('check_number'),
            })

    def get_check_invoice(self):
        "Return the invoice paid by the payment"
        pool = Pool()
        Invoice = pool.get('account.invoice')
        if self.line and isinstance(self.line.move.origin, Invoice):
            return self.line.move.origin

    @classmethod
    def copy(cls, payments, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('check_number', None)
        return super().copy(payments, default=default)


class Check(CompanyReport):
    "Check"
    __name__ = 'account.payment.group.check'

    @classmethod
    def execute(cls, ids, data):
        pool = Pool()
        Group = pool.get('account.payment.group')
        for group in Group.browse(ids):
            if group.journal.process_method != 'check':
                raise AccessError(gettext(
                        'nline_check_print.msg_group_not_check',
                        group=group.rec_name))
        return super().execute(ids, data)

    @classmethod
    def get_context(cls, records, header, data):
        context = super().get_context(records, header, data)
        context['checks'] = lambda g: g.get_checks()
        return context
