# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.i18n import gettext
from trytond.model import fields
from trytond.model.exceptions import ValidationError
from trytond.pool import PoolMeta

from .nacha import routing_number_valid


class Account(metaclass=PoolMeta):
    __name__ = 'bank.account'
    us_routing_number = fields.Char(
        "Routing Number", size=9,
        help="The 9 digits ABA routing number of the bank account.")
    us_account_type = fields.Selection([
            (None, ""),
            ('checking', "Checking"),
            ('savings', "Savings"),
            ], "Account Type",
        help="The type of the US bank account for ACH transfers.")

    @classmethod
    def default_us_account_type(cls):
        return 'checking'

    @classmethod
    def validate_fields(cls, accounts, field_names):
        super().validate_fields(accounts, field_names)
        if field_names & {'us_routing_number'}:
            for account in accounts:
                account.check_us_routing_number()

    def check_us_routing_number(self):
        if (self.us_routing_number
                and not routing_number_valid(self.us_routing_number)):
            raise ValidationError(gettext(
                    'account_payment_nacha.msg_invalid_routing_number',
                    number=self.us_routing_number,
                    account=self.rec_name))

    @property
    def us_account_number(self):
        "Return the account number for ACH"
        for number in self.numbers:
            if number.type != 'iban' and number.number:
                return ''.join(number.number.split())
