# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"Jobshop reports: Accounting and Common"
from trytond.pool import Pool
from trytond.transaction import Transaction

from .accounting import ACCOUNT_SET, jobshop_account_type, origin_class
from .reports import (
    code_rows, f_dates, f_range, f_status, first_model, report)

# ---- Accounting ------------------------------------------------------------


@report('account_list', "Account List", 'accounting', 'AccountList.rpt',
    ['account.account'],
    [('id', "Account ID"), ('description', "Account Description"),
        ('type', "Account Type"), ('inactive', "Inactive", 'bool')],
    filters=[f_range('id', "Account ID"),
        f_status('type', "Account Type", [[t, t] for t in [
                    'Asset', 'Liability', 'Equity', 'Revenue', 'Expense']])],
    advanced=True)
def account_list(desk, p):
    Account = Pool().get('account.account')
    with Transaction().set_context(active_test=False):
        accounts = Account.search([
                ('company', '=', desk._company().id),
                ('type', '!=', None),
                ])
    return [{
            'id': a.code or '',
            'description': a.name,
            'type': jobshop_account_type(a),
            'inactive': bool(a.closed),
            '_drill': {'type': 'account', 'id': a.id},
            } for a in accounts]


@report('account_set_list', "Account Set List", 'accounting',
    'AccountSetList.rpt', ['product.category', 'account.account'],
    [('set', "Account Set ID"), ('set_description', "Description"),
        ('account_type', "Account"), ('id', "Account ID"),
        ('description', "Account Description")],
    filters=[f_range('set', "Account Set ID")],
    group_by='set', sort='account_type', advanced=True)
def account_set_list(desk, p):
    Category = Pool().get('product.category')
    rows = []
    order = {label: i for i, (_, label, _, _) in enumerate(ACCOUNT_SET)}
    for category in Category.search([('accounting', '=', True)]):
        for _, label, field, _ in ACCOUNT_SET:
            if field not in Category._fields:
                continue
            account = getattr(category, field, None)
            rows.append({
                    'set': category.name,
                    'set_description': category.js_description or '',
                    'account_type': '%02d %s' % (order[label], label),
                    'id': account.code if account else '',
                    'description': account.name if account else '',
                    '_drill': {'type': 'screen', 'route':
                        'account-sets/%s' % category.id},
                    })
    for row in rows:
        row['account_type'] = row['account_type'][3:]
    return rows


@report('accounting_calendar', "Accounting Calendar", 'accounting',
    'AccountingCalendar.rpt', ['account.period'],
    [('year', "Year"), ('period', "Period", 'int'),
        ('name', "Period Name"), ('start_date', "Start Date", 'date'),
        ('end_date', "End Date", 'date'), ('status', "Status")],
    filters=[f_range('year', "Year"),
        f_status('status', "Status", [['Open', "Open"],
                ['Closed', "Closed"], ['Locked', "Locked"]])],
    sort='end_date', advanced=True)
def accounting_calendar(desk, p):
    Period = Pool().get('account.period')
    rows = []
    counters = {}
    for period in Period.search([
                ('company', '=', desk._company().id),
                ('type', '=', 'standard'),
                ], order=[('start_date', 'ASC')]):
        year = period.fiscalyear.name
        counters[year] = counters.get(year, 0) + 1
        rows.append({
                'year': year,
                'period': counters[year],
                'name': period.name,
                'start_date': period.start_date,
                'end_date': period.end_date,
                'status': {'open': "Open", 'closed': "Closed",
                    'locked': "Locked"}.get(period.state, period.state),
                })
    return rows


BATCH_COLUMNS = [('batch', "Batch ID"), ('posting_date', "Posting Date",
        'date'), ('period', "Period/Year"), ('sub_ledger', "Sub Ledger")]


@report('journal_batch_list', "Journal Batch List", 'accounting',
    'JournaltBatchList.rpt', ['nline.js.journal_batch'],
    BATCH_COLUMNS + [('debit', "Debit Amount", 'money'),
        ('credit', "Credit Amount", 'money'), ('posted', "Posted", 'bool'),
        ('posted_date', "Posted Date", 'date'),
        ('exported_date', "Exported Date", 'date')],
    filters=[f_range('batch', "Batch ID"),
        f_dates('posting_date', "Posting Date")],
    sort='batch', advanced=True)
def journal_batch_list(desk, p):
    Batch = Pool().get('nline.js.journal_batch')
    return [{
            'batch': b.number,
            'posting_date': b.posting_date,
            'period': b.period.rec_name,
            'sub_ledger': b.journal.rec_name if b.journal else 'ALL',
            'debit': b.debit,
            'credit': b.credit,
            'posted': bool(b.posted_date),
            'posted_date': b.posted_date,
            'exported_date': b.exported_date,
            } for b in Batch.search([('company', '=', desk._company().id)]
            + p.domain_dates('posting_date', 'posting_date'))]


def _origin_refs(move):
    "Part, location, work order, sales order, shipper, PO, receiver"
    refs = {}
    origin = move.origin
    if origin is None:
        return refs
    if origin.__name__ == 'stock.move':
        refs['part'] = origin.product.code or origin.product.rec_name
        refs['location'] = (origin.to_location if origin.to_location.type
            == 'storage' else origin.from_location).rec_name
        production = origin.production_input or origin.production_output \
            if hasattr(origin, 'production_input') else None
        if production:
            refs['work_order'] = production.number
        shipment = origin.shipment
        if shipment is not None:
            if shipment.__name__.startswith('stock.shipment.out'):
                refs['shipper'] = shipment.number
            elif shipment.__name__.startswith('stock.shipment.in'):
                refs['receiver'] = shipment.number
        source = origin.origin
        if source is not None:
            if source.__name__ == 'sale.line':
                refs['sales_order'] = source.sale.number
            elif source.__name__ == 'purchase.line':
                refs['purchase_order'] = source.purchase.number
    elif origin.__name__ == 'production':
        refs['work_order'] = origin.number
        refs['part'] = origin.product.code if origin.product else ''
    elif origin.__name__ == 'production.work.cycle':
        refs['work_order'] = origin.work.production.number
    elif origin.__name__ == 'account.invoice':
        for line in origin.lines:
            source = getattr(line, 'origin', None)
            if source is not None and source.__name__ == 'sale.line':
                refs['sales_order'] = source.sale.number
                break
            if source is not None and source.__name__ == 'purchase.line':
                refs['purchase_order'] = source.purchase.number
                break
    return refs


@report('journal_batch_detail', "Journal Batch Detail List", 'accounting',
    'JournalBatchDetail.rpt', ['nline.js.journal_batch', 'account.move'],
    BATCH_COLUMNS + [('account', "Account ID"),
        ('date', "Transaction Date", 'date'), ('class', "Class"),
        ('part', "Part"), ('location', "Location"),
        ('work_order', "Work Order"), ('sales_order', "Sales Order"),
        ('shipper', "Shipper"), ('purchase_order', "PO"),
        ('receiver', "Receiver"), ('debit', "Debit", 'money'),
        ('credit', "Credit", 'money')],
    filters=[f_range('batch', "Batch ID"),
        f_dates('posting_date', "Posting Date"),
        f_range('account', "Account ID")],
    group_by='batch', sort='account', landscape=True)
def journal_batch_detail(desk, p):
    Batch = Pool().get('nline.js.journal_batch')
    rows = []
    for batch in Batch.search([('company', '=', desk._company().id)]
            + p.domain_dates('posting_date', 'posting_date')):
        head = {
            'batch': batch.number,
            'posting_date': batch.posting_date,
            'period': batch.period.rec_name,
            'sub_ledger': batch.journal.rec_name if batch.journal else 'ALL',
            }
        for move in batch.moves:
            refs = _origin_refs(move)
            for line in move.lines:
                row = dict(head, **refs)
                row.update({
                        'account': line.account.code or line.account.name,
                        'date': move.date,
                        'class': origin_class(move),
                        'debit': line.debit,
                        'credit': line.credit,
                        '_drill': {'type': 'record',
                            'model': 'account.move', 'id': move.id},
                        })
                rows.append(row)
    return rows


# ---- Common ----------------------------------------------------------------

CODE_COLUMNS = [('id', "ID"), ('description', "Description")]


def code_report(id, name, rpt, label, candidates, columns=None, extra=None):
    @report(id, name, 'common', rpt, [], columns or CODE_COLUMNS,
        filters=[f_range('id', "%s ID" % label)], advanced=True)
    def rows(desk, p):
        return code_rows(p, label, candidates, extra)
    return rows


code_report('commodity_code_list', "Commodity Code List",
    'Commoditycodelist.rpt', "Commodity Code", ['nline.commodity_code'])
code_report('fob_point_list', "FOB Point List", 'FOBPointList.rpt',
    "FOB Point", ['nline.fob_point'])
code_report('product_code_list', "Product Code List",
    'Productcodelist.rpt', "Product Code", ['nline.product_code'])
code_report('reason_code_list', "Reason Code List", 'Reasoncodelist.rpt',
    "Reason Code", ['nline.reason_code'],
    columns=[('id', "Reason Code ID"), ('description', "Reason")])
code_report('shipping_method_list', "Shipping Method List",
    'Shippingmethodlist.rpt', "Ship Via", ['nline.ship_via'])


@report('state_province_list', "State / Province List", 'common',
    'Stateprovincelist.rpt', ['country.subdivision'],
    [('id', "State/Province ID"), ('description', "Description"),
        ('country', "Country")],
    filters=[f_range('id', "State/Province ID")], advanced=True)
def state_province_list(desk, p):
    Subdivision = Pool().get('country.subdivision')
    Country = Pool().get('country.country')
    # The states of the countries of N-Line's parties (Tryton knows all)
    countries = Country.search([('code', 'in', ['US', 'CA', 'MX'])])
    return [{
            'id': (s.code or '').split('-')[-1],
            'description': s.name,
            'country': s.country.code,
            } for s in Subdivision.search([
                ('country', 'in', [c.id for c in countries]),
                ('parent', '=', None),
                ])]


@report('postal_code_list', "Postal Code List", 'common',
    'PostalCodeList.rpt', ['country.postal_code'],
    [('id', "Postal Code ID"), ('city', "City"), ('state', "State"),
        ('country', "Country")],
    filters=[f_range('id', "Postal Code ID")], advanced=True)
def postal_code_list(desk, p):
    PostalCode = first_model('country.postal_code')
    if PostalCode is None:
        p.gap("Postal codes: Tryton's country.postal_code is not installed.")
        return []
    return [{
            'id': c.postal_code,
            'city': c.city or '',
            'state': (c.subdivision.code or '').split('-')[-1]
            if c.subdivision else '',
            'country': c.country.code if c.country else '',
            } for c in PostalCode.search([])]


@report('terms_list', "Payment Terms List", 'common', 'TermsList.rpt',
    ['account.invoice.payment_term'],
    [('id', "Terms ID"), ('description', "Description"),
        ('aging', "Aging Days", 'int'), ('discount_days', "Discount Days",
            'int'), ('discount', "Discount %", 'pct')],
    filters=[f_range('id', "Terms ID")], advanced=True)
def terms_list(desk, p):
    Term = Pool().get('account.invoice.payment_term')
    rows = []
    for term in Term.search([]):
        days = getattr(term, 'net_days', None)
        if days is None:
            days = 0
            for line in term.lines:
                for delta in line.relativedeltas:
                    days = max(days, delta.days or 0)
        rate = getattr(term, 'early_discount_rate', None)
        rows.append({
                'id': term.name,
                'description': term.description or '',
                'aging': days,
                'discount_days': getattr(term, 'early_discount_days', None),
                'discount': float(rate * 100) if rate else None,
                })
    return rows


def _currency_list(id, rpt):
    @report(id, "Currency Code List", 'common', rpt,
        ['currency.currency'],
        [('id', "Currency ID"), ('description', "Name"),
            ('symbol', "Symbol"), ('thousands', "Thousands Separator"),
            ('decimal', "Decimal Separator"),
            ('rate', "Exchange Rate", 'num'),
            ('sample', "Sample Print Format")],
        filters=[f_range('id', "Currency ID")], advanced=True)
    def rows(desk, p):
        Currency = Pool().get('currency.currency')
        rows = []
        for c in Currency.search([]):
            thousands = getattr(c, 'thousands_separator', None) or ','
            decimal = getattr(c, 'decimal_separator', None) or '.'
            rate = getattr(c, 'exchange_rate', None) or c.rate
            rows.append({
                    'id': c.code,
                    'description': c.name,
                    'symbol': c.symbol or '',
                    'thousands': thousands,
                    'decimal': decimal,
                    'rate': float(rate) if rate else None,
                    'sample': '%s1%s234%s56' % (c.symbol or '', thousands,
                        decimal),
                    })
        return rows
    return rows


_currency_list('currency_code_list', 'CurrencyCodeList.rpt')
