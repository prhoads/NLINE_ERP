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
    settings(m)


# Jobshop's LSA_SETTINGS -> nline.desk.configuration (System Settings)
SETTINGS = {
    'ALLOW_NEGATIVE_INVENTORY': 'js_allow_negative',
    'SET_RECEIVER_STATUS_APPROVED_UPON_RECEIPT': 'js_receiver_approved',
    'PREVENT_LABOR_WHEN_PREV_OPER_NOT_COMPLETED': 'js_prevent_run_labor',
    'LOCK_LDC_CLOCK_FIELDS': 'js_lock_clock_in',
    'LOG_AUTOMATED_COST_CHANGE': 'js_log_cost_changes',
    'LOG_ADJUSTMENTS_TRANSFERS': 'js_log_adjustments',
    'DisplayNotesOnInactivePartEntered': 'js_inactive_part_notes',
    'LOG_PLANNING_VARIABLE_CHANGES': 'js_log_planning_changes',
    'ShipEarlyNumberDays': 'js_ship_early_days',
    'ALLOW_LABOR_AGAINST_CLOSED_WO': 'js_labor_closed_wo',
    'WARN_LABOR_EXCEEDS_ESTIMATE': 'js_warn_labor_estimate',
    'DISALLOW_MULTIPLE_CLOCKINS': 'js_single_clock_in',
    'CLOSE_OP_ONLY_ON_RUN_COMPLETE_CHECKED': 'js_close_op_run_complete',
    'TA_REASON_CODES_REQ': 'js_ta_reason_required',
    'ASK_TO_ADJUST_TO_SHIFT_START_END': 'js_adjust_to_shift',
    'DO_NOT_ALLOW_INACTIVE_ITEMS': 'js_no_inactive_items',
    'CHROMA_CODE_WORK_ORDER_LATE_WANT': 'js_color_late_want',
    'CHROMA_CODE_WORK_ORDER_LATE_RELEASE': 'js_color_late_release',
    'DoNotAutoMarkShipperLinesForDeletion': 'js_no_auto_mark_shipper',
    'DoNotAutoCheckCreateWOWhenCostFromEngMaster': 'js_no_auto_create_wo',
    'SyncUDefsBetweenSalesLineAndLinkedWorkOrder': 'js_sync_udefs',
    'UPDATE_PART_COSTS_FROM_RECEIVER': 'js_update_cost',
    }
UPDATE_COST = {'0': 'never', '1': 'prompt', '2': 'always'}
ADJUST = {'0': 'ask', '1': 'always', '2': 'keep'}


def settings(m):
    """The settings of Jobshop's System Settings (LSA_SETTINGS and the
    shift grace minutes of SHOPFLOOR_OBJECT_GLOBAL): Jobshop's values are
    copied while Jobshop is the system of record"""
    Configuration = m.get('nline.desk.configuration')
    config = Configuration(1)
    values = {r['NAME']: r['SETTING_VALUE'] for r in m.js.rows(
            "select NAME, SETTING_VALUE from LSA_SETTINGS")}
    changed = []
    for name, field in SETTINGS.items():
        if field not in Configuration._fields or name not in values:
            continue
        raw = (values[name] or '').strip()
        kind = Configuration._fields[field]['type']
        if field == 'js_update_cost':
            value = UPDATE_COST.get(raw)
        elif field == 'js_adjust_to_shift':
            value = ADJUST.get(raw)
        elif kind == 'boolean':
            value = raw.lower() in ('true', '-1', '1')
        elif kind == 'integer':
            value = int(raw) if raw.lstrip('-').isdigit() else None
        else:
            value = raw
        if value is None or getattr(config, field, None) == value:
            continue
        setattr(config, field, value)
        changed.append(field)
    rows = m.js.rows("select SHIFT_START_GRACE, SHIFT_END_GRACE "
        "from SHOPFLOOR_OBJECT_GLOBAL")
    for column, field in [('SHIFT_START_GRACE', 'js_shift_start_grace'),
            ('SHIFT_END_GRACE', 'js_shift_end_grace')]:
        if rows and field in Configuration._fields and (
                getattr(config, field, None) is None) and (
                rows[0].get(column) is not None):
            setattr(config, field, int(rows[0][column]))
            changed.append(field)
    if changed:
        config.save()
        log("system settings: %s" % ', '.join(changed))


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
