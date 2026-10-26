# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import ModelView, Workflow, fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Bool, Eval, If
from trytond.report import Report
from trytond.transaction import Transaction
from trytond.wizard import Button, StateReport, StateView, Wizard

from .exceptions import ExemptionWarning


class Period(metaclass=PoolMeta):
    __name__ = 'account.period'

    @classmethod
    @ModelView.button
    @Workflow.transition('open')
    def reopen(cls, periods):
        pool = Pool()
        JournalPeriod = pool.get('account.journal.period')
        super().reopen(periods)
        # Closing a period closes its journal-periods, reopening it reopens
        # them so entries can be posted again
        JournalPeriod.reopen(JournalPeriod.search([
                    ('period', 'in', [p.id for p in periods]),
                    ('state', '=', 'closed'),
                    ]))


class Party(metaclass=PoolMeta):
    __name__ = 'party.party'

    tax_exemption_type = fields.Selection([
            (None, ""),
            ('resale', "Resale"),
            ('exempt', "Exempt Organization"),
            ('manufacturing', "Manufacturing"),
            ('other', "Other"),
            ], "Exemption Type",
        help="The kind of sales tax exemption or resale certificate "
        "the customer gave.")
    tax_exemption_certificate = fields.Char(
        "Certificate Number",
        states={
            'invisible': ~Eval('tax_exemption_type'),
            })
    tax_exemption_state = fields.Many2One(
        'country.subdivision', "Certificate State",
        states={
            'invisible': ~Eval('tax_exemption_type'),
            })
    tax_exemption_date = fields.Date(
        "Certificate Date",
        states={
            'invisible': ~Eval('tax_exemption_type'),
            })
    tax_exemption_expiry = fields.Date(
        "Certificate Expiry",
        states={
            'invisible': ~Eval('tax_exemption_type'),
            },
        domain=[
            If(Bool(Eval('tax_exemption_date')) & Bool(
                    Eval('tax_exemption_expiry')),
                ('tax_exemption_expiry', '>=', Eval('tax_exemption_date')),
                ()),
            ],
        help="Leave empty when the certificate does not expire.")

    def tax_exemption_valid(self, date):
        "Return if the exemption certificate is valid at the date"
        if not self.tax_exemption_type or not self.tax_exemption_certificate:
            return False
        if self.tax_exemption_expiry and self.tax_exemption_expiry < date:
            return False
        return True


class Invoice(metaclass=PoolMeta):
    __name__ = 'account.invoice'

    @classmethod
    def post(cls, invoices):
        pool = Pool()
        Warning = pool.get('res.user.warning')
        Date = pool.get('ir.date')
        today = Date.today()
        expired = []
        for invoice in invoices:
            party = invoice.party
            if (invoice.type == 'out' and party.tax_exemption_type
                    and not invoice.tax_amount
                    and not party.tax_exemption_valid(
                        invoice.invoice_date or today)):
                expired.append(invoice)
        if expired:
            names = ', '.join(i.rec_name for i in expired[:5])
            key = Warning.format('nline_account.exemption', expired)
            if Warning.check(key):
                raise ExemptionWarning(key, gettext(
                        'nline_account.msg_exemption_expired',
                        invoices=names))
        super().post(invoices)


class TexasReturnStart(ModelView):
    "Texas Sales Tax Return"
    __name__ = 'nline.texas_return.start'

    company = fields.Many2One('company.company', "Company", required=True)
    from_date = fields.Date("From Date", required=True)
    to_date = fields.Date("To Date", required=True,
        domain=[('to_date', '>=', Eval('from_date'))])

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_from_date(cls):
        pool = Pool()
        Date = pool.get('ir.date')
        today = Date.today()
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=quarter_month, day=1)
        # The quarter just ended
        if quarter_month == 1:
            return start.replace(year=start.year - 1, month=10)
        return start.replace(month=quarter_month - 3)

    @classmethod
    def default_to_date(cls):
        pool = Pool()
        Date = pool.get('ir.date')
        today = Date.today()
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        return today.replace(month=quarter_month, day=1) - dt.timedelta(1)


class TexasReturn(Wizard):
    "Texas Sales Tax Return"
    __name__ = 'nline.texas_return'
    start = StateView(
        'nline.texas_return.start',
        'nline_account.texas_return_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Print", 'print_', 'tryton-print', default=True),
            ])
    print_ = StateReport('nline.texas_return.report')

    def do_print_(self, action):
        return action, {
            'company': self.start.company.id,
            'from_date': self.start.from_date,
            'to_date': self.start.to_date,
            }


def get_texas_return(company, from_date, to_date):
    """Return the figures of the Texas sales and use tax return:
    total sales, taxable sales, state tax and the local taxes by authority"""
    pool = Pool()
    Invoice = pool.get('account.invoice')
    TaxLine = pool.get('account.tax.line')
    Jurisdiction = pool.get('account.tax.us.jurisdiction')

    invoices = Invoice.search([
            ('company', '=', company.id),
            ('type', '=', 'out'),
            ('state', 'in', ['posted', 'paid']),
            ('invoice_date', '>=', from_date),
            ('invoice_date', '<=', to_date),
            ])
    total_sales = sum((i.untaxed_amount for i in invoices), Decimal(0))

    jurisdictions = Jurisdiction.search([
            ('company', '=', company.id),
            ('subdivision.code', '=', 'US-TX'),
            ('tax', '!=', None),
            ])
    by_tax = {}
    for jurisdiction in jurisdictions:
        by_tax[jurisdiction.tax.id] = jurisdiction
        for child in jurisdiction.tax.childs:
            by_tax[child.id] = jurisdiction

    base, amount = defaultdict(Decimal), defaultdict(Decimal)
    lines = TaxLine.search([
            ('move_line.move.company', '=', company.id),
            ('move_line.move.state', '=', 'posted'),
            ('move_line.move.date', '>=', from_date),
            ('move_line.move.date', '<=', to_date),
            ('tax', 'in', list(by_tax.keys())),
            ])
    for line in lines:
        jurisdiction = by_tax[line.tax.id]
        # Sales tax lines are credits
        value = -line.amount
        if line.type == 'base':
            base[jurisdiction] += value
        else:
            amount[jurisdiction] += value

    state = [j for j in jurisdictions if j.type == 'state']
    taxable_sales = sum((base[j] for j in state), Decimal(0))
    state_tax = sum((amount[j] for j in state), Decimal(0))
    local = [{
            'code': j.code,
            'name': j.name,
            'type': j.type,
            'base': base[j],
            'rate': j.get_rate(None, date=to_date),
            'tax': amount[j],
            } for j in jurisdictions
        if j.type != 'state' and (base[j] or amount[j])]
    local.sort(key=lambda l: l['code'])
    return {
        'company': company,
        'from_date': from_date,
        'to_date': to_date,
        'total_sales': total_sales,
        'taxable_sales': taxable_sales,
        'taxable_purchases': Decimal(0),
        'state_tax': state_tax,
        'local': local,
        'local_tax': sum((l['tax'] for l in local), Decimal(0)),
        'currency': company.currency,
        }


class TexasReturnReport(Report):
    "Texas Sales Tax Return"
    __name__ = 'nline.texas_return.report'

    @classmethod
    def get_context(cls, records, header, data):
        pool = Pool()
        Company = pool.get('company.company')
        context = super().get_context(records, header, data)
        company = Company(data['company'])
        with Transaction().set_context(company=company.id):
            context['tax_return'] = get_texas_return(
                company, data['from_date'], data['to_date'])
        context['company'] = company
        return context
