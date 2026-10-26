# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Services of the N-Line Desk web screens

Every operation creates and posts standard Tryton documents (supplier and
customer invoices, payments, moves and reconciliations): the screens hold no
posting logic.
"""
import datetime as dt
from decimal import Decimal
from functools import wraps

from trytond.i18n import gettext
from trytond.model import ModelSingleton, ModelSQL, ModelView, fields
from trytond.model.exceptions import ValidationError
from trytond.modules.company.model import (
    CompanyMultiValueMixin, CompanyValueMixin)
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.rpc import RPC
from trytond.transaction import Transaction


def _date(value):
    if isinstance(value, str):
        return dt.date.fromisoformat(value)
    return value


def _decimal(value):
    if value is None or value == '':
        return Decimal(0)
    return Decimal(str(value))


def accept_warnings(func):
    """Skip the warnings of the call when values has accept_warnings: the
    screen sends it after the user confirmed the warning it showed (a retry
    can not match a warning about a document the call creates)"""
    @wraps(func)
    def wrapper(cls, values, *args, **kwargs):
        # The values are not modified as the call may be retried
        skip = bool(values.get('accept_warnings')) or bool(
            Transaction().context.get('_skip_warnings'))
        values = {k: v for k, v in values.items() if k != 'accept_warnings'}
        with Transaction().set_context(_skip_warnings=skip):
            return func(cls, values, *args, **kwargs)
    return wrapper


class Configuration(ModelSingleton, ModelSQL, ModelView,
        CompanyMultiValueMixin):
    "N-Line Desk Configuration"
    __name__ = 'nline.desk.configuration'

    early_discount_account = fields.MultiValue(fields.Many2One(
            'account.account', "Early Pay Discount Account",
            domain=[
                ('company', '=', Eval('context', {}).get('company', -1)),
                ('closed', '!=', True),
                ('party_required', '=', False),
                ],
            help="Credited with the discounts taken on supplier bills."))
    sales_discount_account = fields.MultiValue(fields.Many2One(
            'account.account', "Sales Discount Account",
            domain=[
                ('company', '=', Eval('context', {}).get('company', -1)),
                ('closed', '!=', True),
                ('party_required', '=', False),
                ],
            help="Debited with the discounts given to customers."))
    undeposited_account = fields.MultiValue(fields.Many2One(
            'account.account', "Undeposited Funds Account",
            domain=[
                ('company', '=', Eval('context', {}).get('company', -1)),
                ('closed', '!=', True),
                ('reconcile', '=', True),
                ('party_required', '=', False),
                ],
            help="Where customer payments wait until they are deposited."))
    deposit_journal = fields.MultiValue(fields.Many2One(
            'account.journal', "Deposit Journal",
            context={
                'company': Eval('context', {}).get('company', -1),
                },
            help="The journal of the bank deposits and discount entries."))

    @classmethod
    def multivalue_model(cls, field):
        pool = Pool()
        if field in {'early_discount_account', 'sales_discount_account',
                'undeposited_account', 'deposit_journal'}:
            return pool.get('nline.desk.configuration.account')
        return super().multivalue_model(field)


class ConfigurationAccount(ModelSQL, CompanyValueMixin):
    "N-Line Desk Configuration Account"
    __name__ = 'nline.desk.configuration.account'
    early_discount_account = fields.Many2One(
        'account.account', "Early Pay Discount Account",
        domain=[('company', '=', Eval('company', -1))])
    sales_discount_account = fields.Many2One(
        'account.account', "Sales Discount Account",
        domain=[('company', '=', Eval('company', -1))])
    undeposited_account = fields.Many2One(
        'account.account', "Undeposited Funds Account",
        domain=[('company', '=', Eval('company', -1))])
    deposit_journal = fields.Many2One(
        'account.journal', "Deposit Journal",
        context={
            'company': Eval('company', -1),
            },
        depends={'company'})


class PaymentTerm(metaclass=PoolMeta):
    __name__ = 'account.invoice.payment_term'

    early_discount_rate = fields.Numeric(
        "Early Pay Discount", digits=(16, 4),
        help="The discount for paying early, 0.02 for 2% 10 Net 30.")
    early_discount_days = fields.Integer(
        "Early Pay Days",
        help="The days after the invoice date the discount applies, "
        "10 for 2% 10 Net 30.")

    def early_discount(self, invoice_date, pay_date, amount):
        "Return the discount on the amount when paid at pay_date"
        if (not self.early_discount_rate or self.early_discount_days is None
                or not invoice_date):
            return Decimal(0)
        if pay_date > invoice_date + dt.timedelta(
                days=self.early_discount_days):
            return Decimal(0)
        return (amount * self.early_discount_rate).quantize(Decimal('0.01'))


class PaymentJournal(metaclass=PoolMeta):
    __name__ = 'account.payment.journal'

    bank_account = fields.Many2One(
        'account.account', "Bank GL Account",
        domain=[
            ('company', '=', Eval('company', -1)),
            ('closed', '!=', True),
            ],
        help="The bank account of the general ledger the payments clear "
        "into, shown in the register.")


class Desk(ModelView):
    "N-Line Desk"
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in [
                'enter_bill', 'write_check', 'pay_bills', 'create_invoice',
                'receive_payment', 'make_deposit', 'make_leg']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in [
                'open_bills', 'open_invoices', 'undeposited_payments',
                'register', 'party_center', 'masters', 'work_order',
                'home']:
            cls.__rpc__[name] = RPC()

    # ---- Home ------------------------------------------------------------

    # The Home tab: the workflows as on the QuickBooks Home Page, each tile
    # the action of a menu (shown only when the user sees that menu); flow
    # sections are drawn with arrows
    HOME = [
        ('Vendors', True, [
                ('Purchase Orders', 'purchase.act_purchase_form'),
                ('Receive Items', 'stock.act_shipment_in_form'),
                ('Enter Bills', 'nline_desk.url_desk_bills'),
                ('Pay Bills', 'nline_desk.url_desk_pay_bills'),
                ]),
        ('Customers', True, [
                ('Sales Orders', 'sale.act_sale_form'),
                ('Ship', 'stock.act_shipment_out_form'),
                ('Create Invoices', 'nline_desk.url_desk_invoices'),
                ('Receive Payments', 'nline_desk.url_desk_receive'),
                ('Make Deposits', 'nline_desk.url_desk_deposits'),
                ]),
        ('Customer Activities', False, [
                ('Sales Receipts', 'nline_desk.url_desk_sales_receipts'),
                ('Credit Memos', 'nline_desk.url_desk_credits'),
                ('Statements', 'nline_desk.url_desk_statements'),
                ('Income Tracker', 'nline_desk.url_desk_income_tracker'),
                ]),
        ('Vendor Activities', False, [
                ('Vendor Credits', 'nline_desk.url_desk_vendor_credits'),
                ('Bill Tracker', 'nline_desk.url_desk_bill_tracker'),
                ('Credit Card Charges', 'nline_desk.url_desk_cards'),
                ]),
        ('Shop Floor', True, [
                ('Bills of Materials', 'production.act_bom_list'),
                ('Work Orders', 'nline_desk.url_desk_workorders'),
                ('Productions', 'production.act_production_list'),
                ('Inventory Counts', 'stock.act_inventory_form'),
                ]),
        ('Banking', False, [
                ('Write Checks', 'nline_desk.url_desk_checks'),
                ('Check Register', 'nline_desk.url_desk_register'),
                ('Reconcile', 'nline_desk.url_desk_reconcile'),
                ('Bank Statements', 'account_statement.act_statement_form'),
                ]),
        ('Company', False, [
                ('Chart of Accounts', 'nline_desk.url_desk_accounts'),
                ('Journal Entries', 'nline_desk.url_desk_journal'),
                ('Report Center', 'nline_desk.url_desk_reports'),
                ('Items', 'nline_desk.url_desk_items'),
                ]),
        ('Centers', False, [
                ('Customer Center', 'nline_desk.url_desk_customers'),
                ('Vendor Center', 'nline_desk.url_desk_vendors'),
                ('Parts', 'product.act_template_form'),
                ]),
        ]

    @classmethod
    def home(cls):
        """Return the sections of the Home tab with the tiles the user may
        open: label, action (ir.action id) and route (N-Line screens)"""
        pool = Pool()
        Menu = pool.get('ir.ui.menu')
        ModelData = pool.get('ir.model.data')
        visible = {}
        for menu in Menu.search([]):
            if menu.action and menu.action.id >= 0:
                visible[str(menu.action)] = menu.action
        sections = []
        for title, flow, tiles in cls.HOME:
            shown = []
            for label, xml_id in tiles:
                module, fs_id = xml_id.split('.')
                with Transaction().set_context(_check_access=False):
                    data = ModelData.search([
                            ('module', '=', module),
                            ('fs_id', '=', fs_id),
                            ], limit=1)
                if not data:
                    continue
                action = visible.get('%s,%s' % (data[0].model,
                        data[0].db_id))
                if not action:
                    continue
                url = getattr(action, 'url', None) or ''
                shown.append({
                        'label': label,
                        'action': action.action.id,
                        'route': (url.split('#/', 1)[1]
                            if url.startswith('desk/') else None),
                        })
            if shown:
                sections.append({
                        'title': title, 'flow': flow, 'tiles': shown})
        return sections

    # ---- Helpers ---------------------------------------------------------

    @classmethod
    def _check_read(cls, *models):
        "Refuse a user who may not read these records in Tryton"
        ModelAccess = Pool().get('ir.model.access')
        for model in models:
            ModelAccess.check(model, 'read')

    @classmethod
    def _check_create(cls, *models):
        """Refuse a user who may not create these records in Tryton: the
        screens create them through server code, which Tryton does not check
        (read-only roles, users without the accounting groups)"""
        ModelAccess = Pool().get('ir.model.access')
        for model in models:
            ModelAccess.check(model, 'create')

    @classmethod
    def _company(cls):
        pool = Pool()
        Company = pool.get('company.company')
        company = Transaction().context.get('company')
        if not company:
            raise ValidationError(gettext('nline_desk.msg_user_no_company'))
        return Company(company)

    @classmethod
    def _config(cls, name):
        pool = Pool()
        Configuration = pool.get('nline.desk.configuration')
        value = Configuration(1).get_multivalue(
            name, company=cls._company().id)
        if not value:
            raise ValidationError(gettext(
                    'nline_desk.msg_missing_configuration',
                    field=Configuration._fields[name].string))
        return value

    @classmethod
    def _invoice_lines(cls, invoice, lines):
        pool = Pool()
        Line = pool.get('account.invoice.line')
        Product = pool.get('product.product')
        Account = pool.get('account.account')
        result = []
        for values in lines:
            line = Line(invoice=invoice, type='line')
            line.currency = invoice.currency
            line.company = invoice.company
            line.invoice_type = invoice.type
            line.party = invoice.party
            if values.get('product'):
                line.product = Product(values['product'])
                line.on_change_product()
            if values.get('account'):
                line.account = Account(values['account'])
                line.on_change_account()
            line.quantity = float(values.get('quantity') or 1)
            if values.get('unit_price') is not None:
                line.unit_price = _decimal(values['unit_price'])
            elif values.get('amount') is not None:
                line.unit_price = _decimal(values['amount'])
                line.quantity = 1
            if values.get('description'):
                line.description = values['description']
            if values.get('cost_order') and hasattr(line, 'analytic_accounts'):
                AnalyticAccount = pool.get('analytic_account.account')
                account = AnalyticAccount(values['cost_order'])
                line.analytic_accounts = [{
                        'root': account.root.id,
                        'account': account.id,
                        }]
            result.append(line)
        return result

    @classmethod
    def _invoice(cls, type_, values):
        pool = Pool()
        Invoice = pool.get('account.invoice')
        Party = pool.get('party.party')
        PaymentTerm = pool.get('account.invoice.payment_term')
        party = Party(values['party'])
        company = cls._company()
        invoice = Invoice(
            company=company,
            currency=company.currency,
            type=type_,
            party=party,
            invoice_date=_date(values.get('date')),
            reference=values.get('reference'),
            description=values.get('memo'),
            )
        invoice.on_change_type()
        invoice.on_change_party()
        if values.get('payment_term'):
            invoice.payment_term = PaymentTerm(values['payment_term'])
        invoice.lines = cls._invoice_lines(invoice, values['lines'])
        invoice.save()
        Invoice.update_taxes([invoice])
        Invoice.post([invoice])
        return invoice

    @classmethod
    def _summary(cls, invoice):
        return {
            'id': invoice.id,
            'number': invoice.number,
            'untaxed_amount': invoice.untaxed_amount,
            'tax_amount': invoice.tax_amount,
            'total_amount': invoice.total_amount,
            'state': invoice.state,
            }

    @classmethod
    def _process_payments(cls, payments, issue=True):
        """Submit, approve and process the payments in one group;
        a check is issued at once (succeeded and cleared into the bank
        account through the clearing journal)"""
        pool = Pool()
        Payment = pool.get('account.payment')
        Group = pool.get('account.payment.group')
        Move = pool.get('account.move')
        if not payments:
            return None
        Payment.save(payments)
        Payment.submit(payments)
        if payments[0].kind == 'payable':
            Payment.approve(payments)
        journal = payments[0].journal
        groups = []

        def new_group():
            group = Group(
                company=journal.company, journal=journal,
                kind=payments[0].kind)
            group.save()
            groups.append(group)
            return group
        Payment.process(payments, new_group)
        group, = groups
        if issue and journal.process_method in {'check', 'manual'}:
            # The check is written (the payment received) on its date
            with Transaction().set_context(clearing_date=payments[0].date):
                Payment.succeed(payments)
            moves = [p.clearing_move for p in Payment.browse(payments)
                if p.clearing_move and p.clearing_move.state == 'draft']
            Move.post(moves)
        return group

    @classmethod
    def _discount_move(cls, party, account, amount, date, discount_account,
            description):
        """Return the posted move taking the discount off the party balance:
        a debit of the payable (or a credit of the receivable)"""
        pool = Pool()
        Move = pool.get('account.move')
        Line = pool.get('account.move.line')
        Period = pool.get('account.period')
        company = cls._company()
        journal = cls._config('deposit_journal')
        period = Period.find(company, date=date)
        if account.type.payable:
            party_line = Line(account=account, party=party,
                debit=amount, credit=Decimal(0))
            counter = Line(account=discount_account,
                debit=Decimal(0), credit=amount)
        else:
            party_line = Line(account=account, party=party,
                debit=Decimal(0), credit=amount)
            counter = Line(account=discount_account,
                debit=amount, credit=Decimal(0))
        move = Move(journal=journal, period=period, date=date,
            company=company, description=description,
            lines=[party_line, counter])
        move.save()
        Move.post([move])
        return [l for l in move.lines if l.account == account][0]

    @classmethod
    def _applied_credit_lines(cls, line):
        "The lines of the credits applied to the invoice of the line"
        Invoice = Pool().get('account.invoice')
        origin = line.move.origin
        if not isinstance(origin, Invoice):
            return []
        return [l.id for l in origin.payment_lines if not l.reconciliation]

    @classmethod
    def _reconcile_paid(cls, lines):
        "Reconcile the party lines that sum to zero"
        pool = Pool()
        Line = pool.get('account.move.line')
        lines = [l for l in Line.browse(lines) if not l.reconciliation]
        if lines and not sum(l.debit - l.credit for l in lines):
            Line.reconcile(lines)
            return True
        return False

    # ---- Vendors ---------------------------------------------------------

    @classmethod
    @accept_warnings
    def enter_bill(cls, values):
        """Post a supplier bill
        values: party, date, reference, memo, payment_term, lines
        (account or product, description, quantity, unit_price, cost_order)
        """
        cls._check_create('account.invoice')
        return cls._summary(cls._invoice('in', values))

    @classmethod
    @accept_warnings
    def write_check(cls, values):
        """Write a check: post a bill for the expense lines and pay it with
        one check of the payment journal
        values: journal, party, date, memo, lines"""
        cls._check_create('account.invoice', 'account.payment')
        pool = Pool()
        Invoice = pool.get('account.invoice')
        Payment = pool.get('account.payment')
        PaymentJournal = pool.get('account.payment.journal')
        journal = PaymentJournal(values['journal'])
        values = dict(values, reference=values.get('reference')
            or values.get('memo'))
        bill = cls._invoice('in', values)
        payments = []
        for line in bill.lines_to_pay:
            payments.append(Payment(
                    company=bill.company, journal=journal, kind='payable',
                    party=bill.party, line=line, date=bill.invoice_date,
                    amount=line.credit - line.debit,
                    description=values.get('memo')))
        group = cls._process_payments(payments)
        payments = Payment.browse(payments)
        for payment in payments:
            if payment.clearing_move:
                cls._reconcile_paid([payment.line.id] + [
                        l.id for l in payment.clearing_move.lines
                        if l.account == payment.line.account])
        # The clearing move is posted after the payment succeeded
        Invoice.process([bill])
        bill = Invoice(bill.id)
        return {
            'bill': cls._summary(bill),
            'group': group.id,
            'payments': [p.id for p in payments],
            'check_number': getattr(payments[0], 'check_number', None),
            'amount': sum(p.amount for p in payments),
            }

    @classmethod
    def open_bills(cls, party=None, pay_date=None):
        "Return the open supplier bills with the discount available"
        cls._check_read('account.invoice')
        return cls._open_items('in', party, pay_date)

    @classmethod
    def _open_items(cls, type_, party, pay_date):
        pool = Pool()
        Invoice = pool.get('account.invoice')
        pay_date = _date(pay_date) or Pool().get('ir.date').today()
        domain = [
            ('company', '=', cls._company().id),
            ('type', '=', type_),
            ('state', '=', 'posted'),
            ]
        if party:
            domain.append(('party', '=', party))
        result = []
        for invoice in Invoice.search(domain, order=[
                    ('party.name', 'ASC'), ('invoice_date', 'ASC')]):
            for line in invoice.lines_to_pay:
                if line.reconciliation:
                    continue
                # A credit applied to another invoice is not open any more
                used_by = getattr(line, 'invoice_payment', None)
                if used_by and used_by != invoice:
                    continue
                if type_ == 'in':
                    amount = line.credit - line.debit
                else:
                    amount = line.debit - line.credit
                pending = line.payment_amount if hasattr(
                    line, 'payment_amount') else amount
                if invoice.payment_lines and len(invoice.lines_to_pay) == 1:
                    # Less the credits applied to it
                    pending = min(pending, invoice.amount_to_pay)
                discount = Decimal(0)
                if invoice.payment_term:
                    discount = invoice.payment_term.early_discount(
                        invoice.invoice_date, pay_date, amount)
                result.append({
                        'line': line.id,
                        'invoice': invoice.id,
                        'number': invoice.number,
                        'reference': invoice.reference,
                        'party': invoice.party.id,
                        'party_name': invoice.party.rec_name,
                        'date': invoice.invoice_date,
                        'due_date': line.maturity_date,
                        'amount': amount,
                        'open_amount': pending,
                        'discount': discount,
                        })
        return result

    @classmethod
    @accept_warnings
    def pay_bills(cls, values):
        """Pay supplier bills by check or ACH
        values: journal, date, items (line, amount, discount)
        One check per supplier; discounts are posted to the early pay
        discount account. Returns the payment group."""
        cls._check_create('account.payment')
        pool = Pool()
        Payment = pool.get('account.payment')
        PaymentJournal = pool.get('account.payment.journal')
        Line = pool.get('account.move.line')
        journal = PaymentJournal(values['journal'])
        date = _date(values['date'])
        payments, to_reconcile = [], []
        discount_account = None
        for item in values['items']:
            line = Line(item['line'])
            amount = _decimal(item.get('amount'))
            discount = _decimal(item.get('discount'))
            # with the credits applied to the invoice (apply_credit)
            group_lines = [line.id] + cls._applied_credit_lines(line)
            if discount:
                if discount_account is None:
                    discount_account = cls._config('early_discount_account')
                discount_line = cls._discount_move(
                    line.party, line.account, discount, date,
                    discount_account,
                    gettext('nline_desk.msg_discount_taken',
                        invoice=line.move.origin.rec_name
                        if line.move.origin else line.rec_name))
                group_lines.append(discount_line.id)
            if amount:
                payment = Payment(
                    company=journal.company, journal=journal,
                    kind='payable', party=line.party, line=line,
                    date=date, amount=amount)
                payments.append(payment)
                to_reconcile.append((payment, group_lines))
            else:
                cls._reconcile_paid(group_lines)
        group = cls._process_payments(payments)
        # Reconcile the bill with its discount and its cleared payment
        for payment, group_lines in to_reconcile:
            payment = Payment(payment.id)
            if payment.clearing_move:
                group_lines += [l.id for l in payment.clearing_move.lines
                    if l.account == payment.line.account]
            cls._reconcile_paid(group_lines)
        return {
            'group': group.id if group else None,
            'payments': [p.id for p in payments],
            'checks': sorted({getattr(p, 'check_number', None) or ''
                    for p in Payment.browse(payments)} - {''}),
            'amount': sum((p.amount for p in payments), Decimal(0)),
            }

    # ---- Customers -------------------------------------------------------

    @classmethod
    @accept_warnings
    def create_invoice(cls, values):
        """Post a customer invoice
        values: party, date, reference (customer PO), memo, payment_term,
        lines (product or account, description, quantity, unit_price)"""
        cls._check_create('account.invoice')
        return cls._summary(cls._invoice('out', values))

    @classmethod
    def open_invoices(cls, party=None, pay_date=None):
        "Return the open customer invoices"
        cls._check_read('account.invoice')
        return cls._open_items('out', party, pay_date)

    @classmethod
    @accept_warnings
    def receive_payment(cls, values):
        """Receive a customer payment and apply it to invoices
        values: journal (receipt payment journal), party, date, amount,
        reference (check number), items (line, amount, discount)
        The payment waits in undeposited funds (the clearing account of the
        journal) until it is deposited."""
        cls._check_create('account.payment')
        pool = Pool()
        Payment = pool.get('account.payment')
        PaymentJournal = pool.get('account.payment.journal')
        Line = pool.get('account.move.line')
        Party = pool.get('party.party')
        journal = PaymentJournal(values['journal'])
        date = _date(values['date'])
        party = Party(values['party'])
        payments, to_reconcile = [], []
        applied = Decimal(0)
        discount_account = None
        for item in values.get('items', []):
            line = Line(item['line'])
            amount = _decimal(item.get('amount'))
            discount = _decimal(item.get('discount'))
            # with the credits applied to the invoice (apply_credit)
            group_lines = [line.id] + cls._applied_credit_lines(line)
            if discount:
                if discount_account is None:
                    discount_account = cls._config('sales_discount_account')
                discount_line = cls._discount_move(
                    party, line.account, discount, date, discount_account,
                    gettext('nline_desk.msg_discount_given',
                        invoice=line.move.origin.rec_name
                        if line.move.origin else line.rec_name))
                group_lines.append(discount_line.id)
            if amount:
                payment = Payment(
                    company=journal.company, journal=journal,
                    kind='receivable', party=party, line=line, date=date,
                    amount=amount, description=values.get('reference'))
                payments.append(payment)
                to_reconcile.append((payment, group_lines))
                applied += amount
        total = _decimal(values.get('amount')) or applied
        if total > applied:
            # The unapplied rest is a credit of the customer
            payments.append(Payment(
                    company=journal.company, journal=journal,
                    kind='receivable', party=party, date=date,
                    amount=total - applied,
                    account=party.account_receivable_used,
                    description=values.get('reference')))
        group = cls._process_payments(payments)
        for payment, group_lines in to_reconcile:
            payment = Payment(payment.id)
            if payment.clearing_move:
                group_lines += [l.id for l in payment.clearing_move.lines
                    if l.account == payment.line.account]
            cls._reconcile_paid(group_lines)
        return {
            'group': group.id if group else None,
            'payments': [p.id for p in payments],
            'amount': total,
            }

    @classmethod
    def undeposited_payments(cls):
        "Return the received payments not deposited yet"
        cls._check_read('account.move.line')
        pool = Pool()
        Line = pool.get('account.move.line')
        account = cls._config('undeposited_account')
        lines = Line.search([
                ('account', '=', account.id),
                ('reconciliation', '=', None),
                ('move.state', '=', 'posted'),
                ('debit', '>', 0),
                ], order=[('date', 'ASC'), ('id', 'ASC')])
        result = []
        for line in lines:
            origin = line.move.origin
            party = getattr(origin, 'party', None)
            result.append({
                    'line': line.id,
                    'date': line.date,
                    'party_name': party.rec_name if party else '',
                    'reference': getattr(origin, 'description', None) or '',
                    'amount': line.debit - line.credit,
                    })
        return result

    @classmethod
    @accept_warnings
    def make_deposit(cls, values):
        """Deposit received payments into a bank account
        values: journal (a payment journal of the bank), date, lines
        (undeposited lines), memo
        The deposit waits in the clearing account of the bank (deposit in
        transit) until the bank statement clears it."""
        cls._check_create('account.move')
        pool = Pool()
        Move = pool.get('account.move')
        Line = pool.get('account.move.line')
        PaymentJournal = pool.get('account.payment.journal')
        Period = pool.get('account.period')
        company = cls._company()
        date = _date(values['date'])
        undeposited = cls._config('undeposited_account')
        journal = cls._config('deposit_journal')
        bank = PaymentJournal(values['journal']).clearing_account
        lines = Line.browse(values['lines'])
        total = sum((l.debit - l.credit for l in lines), Decimal(0))
        move = Move(journal=journal, company=company, date=date,
            period=Period.find(company, date=date),
            description=values.get('memo') or gettext(
                'nline_desk.msg_deposit'),
            lines=[
                Line(account=bank, debit=total, credit=Decimal(0)),
                Line(account=undeposited, debit=Decimal(0), credit=total),
                ])
        move.save()
        Move.post([move])
        counter = [l for l in move.lines if l.account == undeposited]
        Line.reconcile(list(lines) + counter)
        return {'move': move.id, 'amount': total}

    # ---- Registers and centers -------------------------------------------

    @classmethod
    def register(cls, journal, from_date=None, to_date=None):
        """Return the checkbook register of the bank of the payment journal:
        the cleared lines of the bank GL account and the outstanding checks
        and deposits of its clearing account, with a running balance"""
        cls._check_read('account.move.line')
        pool = Pool()
        Line = pool.get('account.move.line')
        PaymentJournal = pool.get('account.payment.journal')
        journal = PaymentJournal(journal)
        account = journal.bank_account.id
        accounts = [account]
        if journal.clearing_account:
            accounts.append(journal.clearing_account.id)
        domain = [
            ('account', 'in', accounts),
            ('move.state', '=', 'posted'),
            ]
        if to_date:
            domain.append(('date', '<=', _date(to_date)))
        lines = Line.search(domain, order=[
                ('date', 'ASC'), ('move.number', 'ASC'), ('id', 'ASC')])
        balance = Decimal(0)
        result = []
        from_date = _date(from_date)
        for line in lines:
            if line.account.id != account:
                # A clearing line counts until its bank line exists
                if line.reconciliation:
                    continue
            amount = line.debit - line.credit
            balance += amount
            if from_date and line.date < from_date:
                continue
            origin = line.move.origin
            party = line.party or getattr(origin, 'party', None)
            result.append({
                    'line': line.id,
                    'date': line.date,
                    'number': getattr(origin, 'check_number', None) or '',
                    'party_name': party.rec_name if party else '',
                    'memo': (line.description or line.move.description
                        or getattr(origin, 'description', None) or ''),
                    'payment': -amount if amount < 0 else Decimal(0),
                    'deposit': amount if amount > 0 else Decimal(0),
                    'balance': balance,
                    'cleared': line.account.id == account,
                    })
        return result

    @classmethod
    def party_center(cls, party, kind='customer'):
        """Return the balance and the transactions of a customer or a
        supplier"""
        cls._check_read('account.invoice')
        pool = Pool()
        Invoice = pool.get('account.invoice')
        Payment = pool.get('account.payment')
        Party = pool.get('party.party')
        party = Party(party)
        type_ = 'out' if kind == 'customer' else 'in'
        invoices = Invoice.search([
                ('party', '=', party.id),
                ('type', '=', type_),
                ('state', '!=', 'cancelled'),
                ], order=[('invoice_date', 'DESC'), ('id', 'DESC')])
        payments = Payment.search([
                ('party', '=', party.id),
                ('kind', '=', 'receivable' if kind == 'customer'
                    else 'payable'),
                ], order=[('date', 'DESC'), ('id', 'DESC')])
        transactions = [{
                'type': 'invoice' if (i.total_amount or 0) >= 0
                else 'credit',
                'id': i.id,
                'date': i.invoice_date,
                'number': i.number,
                'reference': i.reference,
                'amount': i.total_amount,
                'open_amount': i.amount_to_pay,
                'state': i.state,
                } for i in invoices]
        transactions += [{
                'type': 'payment',
                'id': p.id,
                'date': p.date,
                'number': getattr(p, 'check_number', None) or str(p.id),
                'reference': p.description,
                'amount': p.amount,
                'open_amount': None,
                'state': p.state,
                } for p in payments]
        transactions.sort(key=lambda t: (t['date'] or dt.date.min),
            reverse=True)
        balance = (party.receivable if kind == 'customer'
            else -party.payable)
        balance = cls._company().currency.round(Decimal(balance or 0))
        return {
            'party': party.id,
            'name': party.rec_name,
            'balance': balance,
            'transactions': transactions,
            }

    # ---- Work orders -----------------------------------------------------

    @classmethod
    def masters(cls, text='', limit=50):
        """Return the producible parts matching the text with their
        engineering masters (revisions)"""
        cls._check_read('production')
        pool = Pool()
        Product = pool.get('product.product')
        domain = [('producible', '=', True), ('boms', '!=', None)]
        if text:
            domain.append(('rec_name', 'ilike', '%%%s%%' % text))
        result = []
        for product in Product.search(domain, limit=limit):
            current = product.get_bom()
            result.append({
                    'product': product.id,
                    'name': product.rec_name,
                    'current_revision': product.engineering_revision,
                    'drawing': product.drawing_number,
                    'masters': [{
                            'product_bom': pb.id,
                            'bom': pb.bom.id,
                            'revision': pb.bom.revision,
                            'current': pb == current,
                            'inputs': len(pb.bom.inputs),
                            'operations': len(pb.routing.steps)
                            if getattr(pb, 'routing', None) else 0,
                            } for pb in product.boms],
                    })
        return result

    @classmethod
    def work_order(cls, production):
        "Return the build tree of the work order"
        cls._check_read('production')
        pool = Pool()
        Production = pool.get('production')
        tree, = Production.get_build_tree([Production(production)])
        return tree

    @classmethod
    def make_leg(cls, card, product_bom):
        """Make the leg of the material card from the master dropped on it
        and return the build tree of the work order"""
        cls._check_create('production.material_card')
        pool = Pool()
        Card = pool.get('production.material_card')
        ProductBom = pool.get('product.product-production.bom')
        card = Card(card)
        product_bom = ProductBom(product_bom)
        if product_bom.product != card.product:
            raise ValidationError(gettext(
                    'nline_desk.msg_master_wrong_part',
                    master=product_bom.rec_name,
                    part=product_bom.product.rec_name,
                    card=card.rec_name))
        leg = card.create_leg(product_bom)
        root = leg.root or card.production
        return cls.work_order(root.id)
