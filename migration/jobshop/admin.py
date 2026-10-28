"""Jobshop emulation data of the admin area (step js_admin)

- The account sets (ACCOUNTING_ACCOUNT_SET): the DEFAULT set fills the
  accounts of the "Parts" category (the Jobshop parts' account set), the
  others become product categories with accounting of their ID. Only empty
  accounts are filled: what the base step (or a person) set stays. The
  Jobshop account IDs are matched to the Tryton accounts by code, else by
  name (the description in ACCOUNTING_ACCOUNT).
- The defaults of System Settings: the default account sets of Inventory,
  Purchasing and Sales, the next journal batch number
  (INVENTORY_NEXT_BATCH_ID).
- The accounting calendar (ACCOUNTING_ACCOUNT_CALENDAR) is compared only:
  Tryton's fiscal years and periods are made by the base step and the
  periods are closed in Tryton by the accountant (closing them here would
  stop the import of older documents).

Re-runnable: it matches what exists and never duplicates.
"""
import datetime as dt

from nline_migrate import log, norm

# Jobshop column prefix -> Tryton field of the category
FIELDS = {
    'INV_MAT': 'account_stock',
    'INV_LAB': 'js_inv_labor_account',
    'INV_BUR': 'js_inv_burden_account',
    'INV_SER': 'js_inv_service_account',
    'WIP_MAT': 'js_wip_material_account',
    'WIP_LAB': 'js_wip_labor_account',
    'WIP_BUR': 'js_wip_burden_account',
    'WIP_SER': 'js_wip_service_account',
    'CGS_MAT': 'account_stock_out',
    'CGS_LAB': 'js_cgs_labor_account',
    'CGS_BUR': 'js_cgs_burden_account',
    'CGS_SER': 'js_cgs_service_account',
    'EXP': 'account_expense',
    'REV': 'account_revenue',
    'ADJ': 'js_adjustment_account',
    'POA': 'account_stock_in',
    'AFL': 'js_applied_labor_account',
    'AFB': 'js_applied_burden_account',
    'IND': 'js_indirect_labor_account',
    'RECV': 'js_receivable_account',
    'PAYB': 'js_payable_account',
    }


def run(m):
    account_sets(m)
    calendar(m)


def _accounts(m):
    "Jobshop account ID -> Tryton account (by code, else by name)"
    Account = m.get('account.account')
    jobshop = {r['ID']: r for r in m.js.rows(
            "select ID, DESCRIPTION from ACCOUNTING_ACCOUNT")}
    by_code, by_name = {}, {}
    for account in Account.find([('type', '!=', None)]):
        if account.code:
            by_code[account.code] = account
        by_name.setdefault(norm(account.name), account)
    result = {}
    for code, row in jobshop.items():
        account = by_code.get(code) or by_name.get(
            norm(row['DESCRIPTION'] or ''))
        if account:
            result[code] = account
    return result, jobshop


def account_sets(m):
    Category = m.get('product.category')
    accounts, jobshop = _accounts(m)
    missing = set()
    first = None
    for row in m.js.rows("select * from ACCOUNTING_ACCOUNT_SET order by ID"):
        set_id = (row['ID'] or '').strip()
        if not set_id:
            continue
        if set_id == 'DEFAULT' and getattr(m, 'parts_category', None):
            category = Category(m.parts_category.id)
        else:
            found = Category.find([('name', '=', set_id),
                    ('accounting', '=', True)], limit=1)
            category = found[0] if found else Category(name=set_id,
                accounting=True)
        changed = not category.id
        if row.get('DESCRIPTION') and not category.js_description:
            category.js_description = row['DESCRIPTION'].strip()
            changed = True
        for prefix, field in FIELDS.items():
            if field not in Category._fields:
                continue
            code = (row.get('%s_GL_ACCT_ID' % prefix) or '').strip()
            if not code or getattr(category, field, None):
                continue
            account = accounts.get(code)
            if account is None:
                missing.add('%s %s' % (code, (jobshop.get(code) or {}).get(
                            'DESCRIPTION') or ''))
                continue
            setattr(category, field, account)
            changed = True
        if changed:
            category.save()
            m.count('account sets')
        if set_id == 'DEFAULT' or first is None:
            first = category
    if missing:
        log("account sets: no Tryton account for Jobshop %s"
            % ', '.join(sorted(missing)))
    defaults(m, first)


def defaults(m, account_set):
    "System Settings: default account sets and the next batch number"
    Configuration = m.get('nline.desk.configuration')
    config = Configuration(1)
    changed = False
    if account_set is not None:
        for field in ['js_inventory_account_set', 'js_purchasing_account_set',
                'js_sales_account_set']:
            if not getattr(config, field, None):
                setattr(config, field, account_set)
                changed = True
    if changed:
        config.save()
    rows = m.js.rows("select * from INVENTORY_NEXT_BATCH_ID")
    sequence = config.js_batch_sequence
    if rows and sequence:
        Sequence = m.get('ir.sequence')
        sequence = Sequence(sequence.id)
        row = rows[0]
        next_number = int(row.get('NEXT_NUMBER') or 1)
        if sequence.number_next < next_number:
            sequence.number_next = next_number
            if row.get('LEADING_ZEROS'):
                sequence.padding = int(row.get('DECIMAL_PLACES') or 0)
            sequence.save()
            log("journal batches: next number %s" % next_number)


def calendar(m):
    "Compare Jobshop's accounting calendar with Tryton's periods"
    Period = m.get('account.period')
    periods = Period.find([('type', '=', 'standard')])
    by_end = {p.end_date: p for p in periods}
    rows = m.js.rows("select ACCOUNT_YEAR, ACCOUNT_PERIOD, END_DATE, "
        "PERIOD_CLOSED from ACCOUNTING_ACCOUNT_CALENDAR "
        "order by END_DATE")
    missing, differ = 0, []
    for row in rows:
        end = row['END_DATE']
        end = end.date() if isinstance(end, dt.datetime) else end
        period = by_end.get(end)
        if period is None:
            missing += 1
            continue
        closed = bool(row['PERIOD_CLOSED'])
        if closed != (period.state != 'open'):
            differ.append(period.name)
    log("accounting calendar: %s Jobshop periods, %s not in Tryton, "
        "%s closed differently (left as in Tryton): %s" % (len(rows),
            missing, len(differ), ', '.join(differ[-12:])))
