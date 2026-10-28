"""Jobshop Shopfloor data (step js_shopfloor): VISUAL Jobshop's SHOPFLOOR_*
tables into the ERP (nline_js_shopfloor).

- SHOPFLOOR_SHOP_RESOURCE -> the Jobshop fields of the work centers that
  step_resources made (description, type, scheduling, capacities, special
  instructions, the Costs tab); a Group resource it did not make is made
- SHOPFLOOR_RESOURCE_MEMBER -> nline.js.resource.member (Shop Groups)
- SHOPFLOOR_SHOP_VIEW, SHOPFLOOR_SHOP_VIEW_RESOURCE -> nline.js.shop_view
- SHOPFLOOR_CALENDAR_WEEK, SHOPFLOOR_CALENDAR_CHANGE -> the weekly
  calendars and the calendar exceptions (no resource: the shop's default)
- SHOPFLOOR_DIRECT_EMPLOYEE -> company.employee (by clock number, else by
  the person's name): shift, rates, burden, hire / termination dates,
  title, inactive, phone and e-mail.  EMPLOYEE_PASSWORD is never read.

Not imported: SHOPFLOOR_LABOR_TRAN (labor of 2005 work orders the ERP does
not have) and SHOPFLOOR_EMPLOYEE_TIME (empty).

Re-runnable: what exists (same ID) is updated, never duplicated."""
import datetime as dt
from decimal import Decimal

try:
    from nline_migrate import SHOP, log, one_line
except ImportError:                     # the tests
    SHOP = "N-Line Shop"

    def log(message):
        print(message)

    def one_line(value, size=None):
        value = ' '.join(str(value or '').split())
        return value[:size] if size else value

RESOURCE_TYPES = {
    'MACHINE': 'machine', '0': 'machine',
    'ASSEMBLY': 'assembly', '1': 'assembly',
    'GENERAL': 'general', '2': 'general',
    'CONTRACTOR': 'contractor', '3': 'contractor',
    'GROUP': 'group', '4': 'group',
    'TEAM': 'team', '5': 'team',
    }
SCHEDULE_METHODS = {'FINITE': 'finite', 'INFINITE': 'infinite'}
SCHEDULE_TYPES = {'NORMAL': 'normal', '0': 'normal',
    'DISCONTINUOUS': 'discontinuous', '1': 'discontinuous'}
EXCLUSIVITY = {'EXCLUSIVE': 'exclusive', 'INCLUSIVE': 'inclusive'}
RESOURCE_COSTS = {
    'setup_per_hr': 'SETUP_PER_HR',
    'run_per_hr': 'RUN_PER_HR',
    'run_per_unit': 'RUN_PER_UNIT',
    'bur_per_hr_setup': 'BUR_PER_HR_SETUP',
    'bur_percent_setup': 'BUR_PERCENT_SETUP',
    'bur_per_hr_run': 'BUR_PER_HR_RUN',
    'bur_percent_run': 'BUR_PERCENT_RUN',
    'bur_per_unit_run': 'BUR_PER_UNIT_RUN',
    'bur_per_oper': 'BUR_PER_OPER',
    'act_bur_per_hr_setup': 'ACT_BUR_PER_HR_SETUP',
    'act_bur_percent_setup': 'ACT_BUR_PERCENT_SETUP',
    'act_bur_per_hr_run': 'ACT_BUR_PER_HR_RUN',
    'act_bur_percent_run': 'ACT_BUR_PERCENT_RUN',
    'act_bur_per_unit_run': 'ACT_BUR_PER_UNIT_RUN',
    'act_bur_per_oper': 'ACT_BUR_PER_OPER',
    }
EMPLOYEE_COSTS = {
    'cost_per_hr': 'COST_PER_HR',
    'setup_cost_per_hr': 'SETUP_COST_PER_HR',
    'run_cost_per_hr': 'RUN_COST_PER_HR',
    'cost_per_unit': 'COST_PER_UNIT',
    'bur_per_hr_setup': 'BUR_PER_HR_SETUP',
    'bur_per_hr_run': 'BUR_PER_HR_RUN',
    'bur_per_unit_run': 'BUR_PER_UNIT_RUN',
    'bur_percent_setup': 'BUR_PERCENT_SETUP',
    'bur_percent_run': 'BUR_PERCENT_RUN',
    }
# The employee columns read (never EMPLOYEE_PASSWORD)
EMPLOYEE_COLUMNS = ['CLOCK_NO', 'NAME', 'TITLE', 'PHONE', 'EMAIL', 'MOBILE',
    'SHIFT_NO', 'HIRE_DATE', 'TERMINATION_DATE', 'INACTIVE'] + list(
    EMPLOYEE_COSTS.values())
CAPACITIES = ['shift_1', 'shift_2', 'shift_3', 'shift_1_capacity',
    'shift_2_capacity', 'shift_3_capacity']


def find_all(Model, domain=None):
    "The records, inactive ones too"
    with Model._config.set_context(active_test=False):
        return Model.find(domain or [])


def money(value):
    return Decimal(str(value)).quantize(Decimal('0.0001')) \
        if value is not None else None


def flag(value):
    return bool(value) and value not in (0, '0')


def text(value):
    value = (value or '').strip() if isinstance(value, str) else value
    return value or None


def day(value):
    if value is None:
        return None
    return value.date() if isinstance(value, dt.datetime) else value


def time_of(value):
    "Jobshop's START_OF_DAY (a time on 1899-12-30)"
    if isinstance(value, dt.datetime):
        return value.time()
    return value


def code(value):
    return str(value).strip().upper() if value is not None else ''


def assign(record, values):
    "Set the values that differ; whether something changed"
    changed = False
    for name, value in values.items():
        current = getattr(record, name)
        if hasattr(current, 'id'):
            current = current.id
        compare = value.id if hasattr(value, 'id') else value
        if isinstance(current, Decimal) or isinstance(compare, Decimal):
            if (current or 0) == (compare or 0) and (current is None) == (
                    compare is None):
                continue
        elif current == compare or (current in (None, '') and compare in (
                None, '')):
            continue
        setattr(record, name, value)
        changed = True
    return changed


def run(m):
    centers = resources(m)
    groups(m, centers)
    views(m, centers)
    employees_ = employees(m)
    calendars(m, centers, employees_)


def resources(m):
    WorkCenter = m.get('production.work.center')
    Category = m.get('production.work.center.category')
    centers = {c.name: c for c in find_all(WorkCenter)}
    shop = centers.get(SHOP)
    updated = made = 0
    for row in m.js.rows("select * from SHOPFLOOR_SHOP_RESOURCE"):
        name = one_line(row['ID'])
        kind = RESOURCE_TYPES.get(code(row.get('RESOURCE_TYPE')), 'machine')
        center = centers.get(name)
        if not center:
            # step_resources made the active ones; a group is made here
            if kind != 'group' or flag(row.get('INACTIVE')):
                continue
            center = WorkCenter(name=name)
            if shop:
                center.parent = shop
            made += 1
        values = {
            'description': one_line(row.get('DESCRIPTION'), 250) or None,
            'resource_type': kind,
            'schedule_method': SCHEDULE_METHODS.get(
                code(row.get('SCHEDULE_METHOD')), 'infinite'),
            'schedule_type': SCHEDULE_TYPES.get(
                code(row.get('SCHEDULE_TYPE')), 'normal'),
            'exclusivity': EXCLUSIVITY.get(code(row.get('EXCLUSIVITY')),
                'inclusive'),
            'min_segment_size': float(row['MIN_SEGMENT_SIZE'])
            if row.get('MIN_SEGMENT_SIZE') is not None else None,
            'shift_1_capacity': row.get('SHIFT_1_CAPACITY'),
            'shift_2_capacity': row.get('SHIFT_2_CAPACITY'),
            'shift_3_capacity': row.get('SHIFT_3_CAPACITY'),
            'auto_reporting': flag(row.get('AUTO_REPORTING')),
            'special_instructions': text(row.get('SPECIAL_INSTRUCTIONS')),
            }
        for name_, column in RESOURCE_COSTS.items():
            values[name_] = money(row.get(column)) or None
        if assign(center, values) or not center.id:
            center.save()
            updated += 1
        centers[name] = center
        if kind != 'group' and not center.category:
            categories = Category.find([('name', '=', name)], limit=1)
            category = categories[0] if categories else Category(name=name)
            if category.id is None or category.id < 0:
                category.save()
            center.category = category
            center.save()
    log("js_shopfloor: %s resources updated, %s groups made"
        % (updated, made))
    return centers


def groups(m, centers):
    Member = m.get('nline.js.resource.member')
    existing = {(x.group.id, x.resource.id): x for x in Member.find([])}
    made = 0
    for row in m.js.rows("select * from SHOPFLOOR_RESOURCE_MEMBER "
            "order by GROUP_RESOURCE_ID, SEQ_NO"):
        group = centers.get(one_line(row['GROUP_RESOURCE_ID']))
        member = centers.get(one_line(row['SUB_RESOURCE_ID']))
        if not group or not member or group.resource_type != 'group' \
                or member.resource_type == 'group':
            continue
        line = existing.get((group.id, member.id))
        values = {'sequence': row.get('SEQ_NO'),
            'efficiency': float(row['EFFICIENCY_FACTOR'])
            if row.get('EFFICIENCY_FACTOR') is not None else None}
        if not line:
            line = Member(group=group, resource=member)
            made += 1
        if assign(line, values) or not line.id:
            line.save()
            existing[(group.id, member.id)] = line
    log("js_shopfloor: %s shop group members" % made)


def views(m, centers):
    View = m.get('nline.js.shop_view')
    Line = m.get('nline.js.shop_view.resource')
    known = {v.code: v for v in find_all(View)}
    made = 0
    for row in m.js.rows("select * from SHOPFLOOR_SHOP_VIEW"):
        view_code = one_line(row['ID'])
        view = known.get(view_code)
        if not view:
            view = View(code=view_code)
            made += 1
        if assign(view, {'description': one_line(row.get('DESCRIPTION'))
                    or None}) or not view.id:
            view.save()
            known[view_code] = view
    lines = {(l.view.id, l.resource.id): l for l in Line.find([])}
    for row in m.js.rows("select * from SHOPFLOOR_SHOP_VIEW_RESOURCE "
            "order by SHOP_VIEW_ID, SEQ_NO"):
        view = known.get(one_line(row['SHOP_VIEW_ID']))
        center = centers.get(one_line(row['RESOURCE_ID']))
        if not view or not center:
            continue
        line = lines.get((view.id, center.id))
        if not line:
            line = Line(view=view, resource=center)
        if assign(line, {'sequence': row.get('SEQ_NO')}) or not line.id:
            line.save()
            lines[(view.id, center.id)] = line
    log("js_shopfloor: %s shop views made" % made)


def employees(m):
    Employee = m.get('company.employee')
    Party = m.get('party.party')
    Contact = m.get('party.contact_mechanism')
    by_clock = {e.clock_no: e for e in Employee.find([])
        if e.clock_no}
    by_name = {}
    for employee in Employee.find([]):
        by_name.setdefault((employee.party.name or '').strip().upper(),
            employee)
    made = updated = 0
    for row in m.js.rows("select %s from SHOPFLOOR_DIRECT_EMPLOYEE"
            % ', '.join(EMPLOYEE_COLUMNS)):
        clock_no = one_line(row['CLOCK_NO'])
        name = one_line(row.get('NAME'), 120) or clock_no
        employee = by_clock.get(clock_no) or by_name.get(name.upper())
        if not employee:
            parties = Party.find([('name', '=', name)], limit=1)
            party = parties[0] if parties else Party(name=name)
            if party.id is None or party.id < 0:
                # (an unsaved proteus record has a negative id)
                party.save()
            employee = Employee(party=party, company=m.company)
            made += 1
        values = {
            'clock_no': clock_no,
            'shift_no': row.get('SHIFT_NO') or 1,
            'title': one_line(row.get('TITLE')) or None,
            'start_date': day(row.get('HIRE_DATE')),
            'end_date': day(row.get('TERMINATION_DATE')),
            # The pseudo-employee of the operation completions stays out
            # of the lookups
            'inactive': flag(row.get('INACTIVE')) or clock_no == 'OPCOMPLETE',
            }
        for name_, column in EMPLOYEE_COSTS.items():
            values[name_] = money(row.get(column)) or None
        if assign(employee, values) or not employee.id:
            employee.save()
            updated += 1
        by_clock[clock_no] = employee
        party = employee.party
        have = {(c.type, c.value) for c in party.contact_mechanisms}
        for kind, column in [('phone', 'PHONE'), ('mobile', 'MOBILE'),
                ('email', 'EMAIL')]:
            value = one_line(row.get(column))
            if value and (kind, value) not in have:
                try:
                    Contact(party=party, type=kind, value=value).save()
                except Exception as error:
                    log("js_shopfloor: %s %s of %s not kept: %s"
                        % (kind, value, clock_no, error))
    log("js_shopfloor: %s employees made, %s updated" % (made, updated))
    return by_clock


def calendars(m, centers, employees_):
    Week = m.get('nline.js.calendar.week')
    Change = m.get('nline.js.calendar.change')
    Reason = m.get('nline.reason_code')
    reasons = {r.code: r for r in find_all(Reason)}

    def key_of(record):
        return (record.resource.id if record.resource else None,
            record.employee.id if record.employee else None)

    weeks = {key_of(w) + (w.day_of_week,): w for w in Week.find([])}
    n = 0
    for row in m.js.rows("select * from SHOPFLOOR_CALENDAR_WEEK "
            "where SCHEDULE_ID is null or SCHEDULE_ID = ''"):
        center = centers.get(one_line(row.get('RESOURCE_ID'))) \
            if row.get('RESOURCE_ID') else None
        employee = employees_.get(one_line(row.get('EMPLOYEE_CLOCK_NO'))) \
            if row.get('EMPLOYEE_CLOCK_NO') else None
        if (row.get('RESOURCE_ID') and not center) or (
                row.get('EMPLOYEE_CLOCK_NO') and not employee):
            continue
        day_ = str(row.get('DAY_OF_WEEK') or 0)
        key = (center.id if center else None,
            employee.id if employee else None, day_)
        week = weeks.get(key) or Week(resource=center, employee=employee,
            day_of_week=day_)
        values = {'start_of_day': time_of(row.get('START_OF_DAY'))}
        for name in CAPACITIES:
            value = row.get(name.upper())
            values[name] = (int(value) if 'capacity' in name else
                float(value)) if value is not None else None
        if assign(week, values) or not week.id:
            week.save()
            weeks[key] = week
            n += 1
    changes = {key_of(c) + (c.start_date, c.end_date): c
        for c in Change.find([])}
    for row in m.js.rows("select * from SHOPFLOOR_CALENDAR_CHANGE "
            "where SCHEDULE_ID is null or SCHEDULE_ID = ''"):
        center = centers.get(one_line(row.get('RESOURCE_ID'))) \
            if row.get('RESOURCE_ID') else None
        employee = employees_.get(one_line(row.get('EMPLOYEE_CLOCK_NO'))) \
            if row.get('EMPLOYEE_CLOCK_NO') else None
        if (row.get('RESOURCE_ID') and not center) or (
                row.get('EMPLOYEE_CLOCK_NO') and not employee):
            continue
        start, end = day(row['START_DATE']), day(row['END_DATE'])
        key = (center.id if center else None,
            employee.id if employee else None, start, end)
        change = changes.get(key) or Change(resource=center,
            employee=employee, start_date=start, end_date=end)
        values = {'start_of_day': time_of(row.get('START_OF_DAY')),
            'reason_code': reasons.get(one_line(row.get('REASON_CODE_ID')))}
        for name in CAPACITIES:
            value = row.get(name.upper())
            values[name] = (int(value) if 'capacity' in name else
                float(value)) if value is not None else None
        if assign(change, values) or not change.id:
            change.save()
            changes[key] = change
            n += 1
    log("js_shopfloor: %s calendar lines" % n)
