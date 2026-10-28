# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Terms (VSharedTermsRules) on Tryton's payment terms: the invoice
and discount age types and days. A term of one line follows its Jobshop rule:
its due date is rebuilt from the age type and days when they change."""
from decimal import Decimal

from dateutil.relativedelta import relativedelta

from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.transaction import Transaction

# Jobshop's terms_type (Domains.schema)
AGE_TYPES = [
    (None, ''),
    ('age', "Age in days"),
    ('day_next_month', "Day of next month"),
    ('cod', "Collect on delivery"),
    ('eom', "End of this month"),
    ]


def rule_delta(age_type, days):
    """The relativedelta values of a Jobshop age rule (a payment term line
    delta), None when the rule gives no date"""
    days = days or 0
    if age_type == 'age':
        return {'days': days, 'weeks': 0, 'months': 0, 'day': None}
    if age_type == 'cod':
        return {'days': 0, 'weeks': 0, 'months': 0, 'day': None}
    if age_type == 'day_next_month':
        return {'days': 0, 'weeks': 0, 'months': 1,
            'day': min(max(days, 1), 31)}
    if age_type == 'eom':
        # relativedelta(day=31) stops at the last day of the month
        return {'days': 0, 'weeks': 0, 'months': 0, 'day': 31}
    return None


def rule_date(age_type, days, date):
    "The date a Jobshop age rule gives from a date"
    delta = rule_delta(age_type, days)
    if delta is None or not date:
        return None
    return date + relativedelta(**{k: v for k, v in delta.items()
            if v is not None})


class PaymentTerm(metaclass=PoolMeta):
    __name__ = 'account.invoice.payment_term'

    net_type = fields.Selection(
        AGE_TYPES, "Invoice Age Type",
        help="How the invoice due date is found: an age in days, on "
        "delivery, a day of the next month or the end of the month.")
    net_days = fields.Integer(
        "Invoice Aging Days",
        help="The age in days or the day of the month the invoice is due.")
    discount_type = fields.Selection(
        AGE_TYPES, "Discount Age Type",
        help="How the last day of the early pay discount is found.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        # Jobshop's names for the fields nline_desk adds
        cls.early_discount_days.string = "Disc Aging Days"

    @classmethod
    def default_net_type(cls):
        return 'age'

    @classmethod
    def default_discount_type(cls):
        return 'age'

    def early_discount(self, invoice_date, pay_date, amount):
        "The discount, the deadline following the discount age type"
        if (self.discount_type in {None, 'age'} or not invoice_date
                or not self.early_discount_rate):
            return super().early_discount(invoice_date, pay_date, amount)
        deadline = rule_date(self.discount_type, self.early_discount_days,
            invoice_date)
        if deadline is None or pay_date > deadline:
            return Decimal(0)
        return (amount * self.early_discount_rate).quantize(Decimal('0.01'))

    def jobshop_due_date(self, date):
        "The invoice due date of the Jobshop rule (None without a rule)"
        if self.net_type == 'age' and self.net_days is None:
            return None
        return rule_date(self.net_type, self.net_days, date)

    def _jobshop_rule(self):
        """The line values of the Jobshop rule, None when the term keeps its
        own lines (no rule, an age without days, several lines)"""
        if self.net_type == 'age' and self.net_days is None:
            return None
        delta = rule_delta(self.net_type, self.net_days)
        if delta is None or len(self.lines) > 1:
            return None
        return delta

    @classmethod
    def create(cls, vlist):
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            # A term entered in the Terms window has no lines: its rule is
            # its one line (Tryton wants one, a remainder)
            if not values.get('lines'):
                net_type = values.get('net_type', cls.default_net_type())
                days = values.get('net_days')
                delta = rule_delta(net_type, days or 0)
                if delta is None:
                    delta = rule_delta('age', 0)
                values['lines'] = [('create', [{
                                'type': 'remainder',
                                'relativedeltas': [('create', [delta])],
                                }])]
        return super().create(vlist)

    @classmethod
    def write(cls, *args):
        changed = []
        actions = iter(args)
        for records, values in zip(actions, actions):
            if {'net_type', 'net_days'} & set(values):
                changed.extend(records)
        super().write(*args)
        if changed:
            cls._apply_jobshop_rule(cls.browse([t.id for t in changed]))

    @classmethod
    def _apply_jobshop_rule(cls, terms):
        "Rebuild the one line of the terms from their Jobshop rule"
        pool = Pool()
        Line = pool.get('account.invoice.payment_term.line')
        # The user may change the term: its lines follow
        with Transaction().set_context(_check_access=False):
            for term in terms:
                delta = term._jobshop_rule()
                if delta is None:
                    continue
                if term.lines:
                    Line.delete(list(term.lines))
                Line.create([{
                            'payment': term.id,
                            'type': 'remainder',
                            'relativedeltas': [('create', [delta])],
                            }])


MODELS = [PaymentTerm]
