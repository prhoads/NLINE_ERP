# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop's Scheduling window (Planning > Scheduling) and the scheduler.

The scheduler schedules the operations of the Firm and Released work orders
(and their legs) on the units of capacity of their resources (work centers),
within the shifts of the weekly calendars and calendar exceptions: each
operation runs on one unit for its whole duration (Jobshop loads unit 0
first). As Jobshop, a work order is scheduled backward from its want date
(the last operation first, each one on the unit giving the latest start);
when that would start before the schedule's as of date (or the release
date, when hard) or the work order is Forward Schedule, it is scheduled
forward (each operation on the unit giving the earliest finish), and with
Retry Backward again backward from that forward end date. An infinite
schedule ignores the load of the other operations (the calendars still
apply). Its output is Jobshop's OPERATION_SCHED: nline.js.schedule.operation.
"""
import csv
import datetime as dt
import io
from collections import defaultdict
from xml.etree import ElementTree as ET

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC

from trytond.modules.nline_desk.desk import _date

from .material import split_number, wo_status

# The work orders the scheduler schedules: Firm and Released (Jobshop's
# status of a work order is nline_js_engineering's order_status)
SCHEDULED_STATUS = ['firm', 'released']
# The production states of the legs scheduled with their work order
LEG_STATES = ['request', 'draft', 'waiting', 'assigned', 'running']
# The calendar when none is set: Monday to Friday, one 8 hour shift at 7:00
DEFAULT_START = dt.time(7, 0)
DEFAULT_DAYS = {0, 1, 2, 3, 4}
DEFAULT_HOURS = 8.0
# How far the scheduler looks for capacity before giving up an operation
LIMIT_DAYS = 3 * 366
EPSILON = 1e-6


def _datetime(value):
    if isinstance(value, str):
        value = value.replace(' ', 'T')
        if len(value) == 10:
            value += 'T00:00'
        return dt.datetime.fromisoformat(value)
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return dt.datetime.combine(value, dt.time())
    return value


def _iso(value):
    return value.strftime('%Y-%m-%dT%H:%M') if value else None


def _end_of(date):
    return dt.datetime.combine(date, dt.time(23, 59, 59)) if date else None


def shifts(row):
    "(hours, capacity or None) of the three shifts of a calendar row"
    for i in (1, 2, 3):
        yield (getattr(row, 'shift_%d' % i) or 0,
            getattr(row, 'shift_%d_capacity' % i))


class Calendar:
    """The shifts of the resources from the weekly calendars and calendar
    exceptions of the Shopfloor area (nline_js_shopfloor; no resource: the
    shop's calendar; the rows of an employee are not the scheduler's)"""

    def __init__(self, schedule):
        pool = Pool()
        Week = pool.get('nline.js.calendar.week')
        Change = pool.get('nline.js.calendar.change')
        self.weeks = {}
        for row in Week.search([('employee', '=', None)]):
            # Jobshop's DAY_OF_WEEK: 0 = Saturday; Python's: 0 = Monday
            weekday = (int(row.day_of_week) + 5) % 7
            self.weeks[(row.resource.id if row.resource else None,
                    weekday)] = row
        self.default = not self.weeks
        self.changes = defaultdict(list)
        for row in Change.search([('employee', '=', None)]):
            self.changes[row.resource.id if row.resource else None].append(
                row)
        self.cache = {}

    @staticmethod
    def resource_capacity(resource, shift):
        """The units of the resource on the shift (Shop Resource: 1 on the
        first shift, none on the others unless set)"""
        if resource is not None:
            name = 'shift_%d_capacity' % shift
            if name in resource._fields:
                value = getattr(resource, name)
                if value is not None:
                    return value
        return 1 if shift == 1 else 0

    @staticmethod
    def finite(resource):
        "The resource's load is limited by its capacity (Schedule Method)"
        if resource is None or 'schedule_method' not in resource._fields:
            return True
        return resource.schedule_method != 'infinite'

    def change(self, resource, day):
        rid = resource.id if resource else None
        for key in ([rid, None] if rid else [None]):
            for change in self.changes.get(key, []):
                if change.start_date <= day <= change.end_date:
                    return change
        return None

    def row(self, resource, day):
        "The calendar row of the resource for the day (None: no work)"
        rid = resource.id if resource else None
        change = self.change(resource, day)
        if change:
            return change
        for key in ([rid, None] if rid else [None]):
            row = self.weeks.get((key, day.weekday()))
            if row:
                return row
        return None

    def windows(self, resource, day):
        "The working windows of the day: [(start, end, units)]"
        key = (resource.id if resource else None, day)
        if key in self.cache:
            return self.cache[key]
        windows = []
        if self.default and not self.change(resource, day):
            if day.weekday() in DEFAULT_DAYS:
                start = dt.datetime.combine(day, DEFAULT_START)
                windows.append((start, start + dt.timedelta(
                            hours=DEFAULT_HOURS),
                        self.resource_capacity(resource, 1)))
        else:
            row = self.row(resource, day)
            if row:
                start = dt.datetime.combine(day,
                    row.start_of_day or DEFAULT_START)
                for shift, (hours, units) in enumerate(shifts(row), 1):
                    if hours <= 0:
                        continue
                    end = start + dt.timedelta(hours=hours)
                    if units is None:
                        units = self.resource_capacity(resource, shift)
                    if units > 0:
                        windows.append((start, end, units))
                    start = end
        self.cache[key] = windows
        return windows

    def max_units(self, resource):
        units = [self.resource_capacity(resource, s) for s in (1, 2, 3)]
        rid = resource.id if resource else None
        rows = [r for k, r in self.weeks.items() if k[0] in (rid, None)]
        rows += self.changes.get(rid, []) + self.changes.get(None, [])
        for row in rows:
            units.extend(u for _, u in shifts(row) if u)
        return max(max(units), 1)

    def consume_back(self, resource, unit, cursor, hours):
        """The (start, finish) of hours of work on the unit ending at the
        latest by cursor, back through its working windows"""
        remaining = max(hours, 0)
        finish = None
        last = cursor.date() + dt.timedelta(days=1)
        for k in range(LIMIT_DAYS):
            for ws, we, units in reversed(self.windows(resource,
                    last - dt.timedelta(days=k))):
                if units <= unit or ws >= cursor:
                    continue
                e = min(we, cursor)
                if finish is None:
                    finish = e
                available = (e - ws).total_seconds() / 3600
                if remaining <= available + EPSILON:
                    return e - dt.timedelta(hours=remaining), finish
                remaining -= available
        return None

    def consume(self, resource, unit, cursor, hours):
        """The (start, finish) of hours of work on the unit from cursor,
        through its working windows"""
        remaining = max(hours, 0)
        start = None
        first = cursor.date() - dt.timedelta(days=1)
        for k in range(LIMIT_DAYS):
            for ws, we, units in self.windows(resource,
                    first + dt.timedelta(days=k)):
                if units <= unit or we <= cursor:
                    continue
                s = max(ws, cursor)
                if start is None:
                    start = s
                available = (we - s).total_seconds() / 3600
                if remaining <= available + EPSILON:
                    return start, s + dt.timedelta(hours=remaining)
                remaining -= available
        return None


class Scheduler:
    "Backward / forward schedule of the work orders on the resources"

    def __init__(self, schedule, as_of, infinite=True, hard_release=False,
            sort_by='want', started='normal', mode='together',
            retry_backward=False, keep_forward_dp=False):
        self.schedule = schedule
        self.as_of = as_of
        self.infinite = infinite
        self.hard_release = hard_release
        self.sort_by = sort_by
        self.started = started
        self.mode = mode
        self.retry_backward = retry_backward
        self.keep_forward_dp = keep_forward_dp
        self.calendar = Calendar(schedule)
        self.busy = defaultdict(list)
        self.journal = []
        self.kept = {}
        self.rows = []
        self.picker = None

    # ---- inputs ----------------------------------------------------------

    def keep(self, rows):
        "Rows that do not move (frozen): they hold their units"
        for row in rows:
            self.kept[self.op_key(row.production, row.work, row.step,
                    row.sequence)] = row
            if row.start and row.finish and not row.outside:
                self.busy[(row.resource.id if row.resource else None,
                        row.unit_no or 0)].append((row.start, row.finish))

    def load(self, rows):
        "Rows of the other work orders (scheduling one): their load"
        for row in rows:
            if row.start and row.finish and not row.outside:
                self.busy[(row.resource.id if row.resource else None,
                        row.unit_no or 0)].append((row.start, row.finish))

    @staticmethod
    def op_key(production, work, step, sequence):
        return (production.id, work.id if work else None,
            step.id if step else None, sequence or 0)

    def work_center(self, production, step):
        "The resource a routing step will run on"
        pool = Pool()
        WorkCenter = pool.get('production.work.center')
        if getattr(step, 'resource', None):
            return step.resource
        category = step.operation.work_center_category
        if not category:
            return production.work_center
        if self.picker is None:
            self.picker = WorkCenter.get_picker()
        if production.work_center:
            center = self.picker(production.work_center, category)
            if center:
                return center
        centers = WorkCenter.search([('category', '=', category.id)],
            limit=1)
        return centers[0] if centers else production.work_center

    def operations(self, production):
        """The operations still to do: dicts with work, step, sequence,
        name, resource, hours, outside, transit (days), delivery"""
        ops = []
        if production.works:
            for work in sorted(production.works,
                    key=lambda w: (w.sequence or 0, w.id)):
                if work.state in ('finished', 'done'):
                    continue
                planned = getattr(work, 'planned_duration', None)
                hours = planned.total_seconds() / 3600 if planned else 0
                done = sum((c.duration.total_seconds() / 3600
                        for c in work.cycles
                        if c.state == 'done' and c.duration), 0)
                step = getattr(work, 'routing_step', None)
                outside = bool(getattr(work, 'outside', False))
                line = getattr(work, 'purchase_line', None)
                ops.append({
                        'work': work, 'step': step,
                        'sequence': work.sequence or 0,
                        'name': work.operation.rec_name,
                        'resource': None if outside else work.work_center,
                        'hours': max(hours - done, 0),
                        'outside': outside,
                        'supplier': step.supplier if outside else None,
                        'transit': self.transit(step) if outside else 0,
                        'delivery': getattr(line, 'delivery_date', None)
                        if line else None,
                        'started': work.state == 'running' or any(
                            c.state in ('running', 'done')
                            for c in work.cycles),
                        })
        elif getattr(production, 'routing', None):
            for step in production.routing.steps:
                duration = (step.compute_planned_duration(production)
                    if hasattr(step, 'compute_planned_duration') else None)
                supplier = getattr(step, 'supplier', None)
                ops.append({
                        'work': None, 'step': step,
                        'sequence': step.sequence or 0,
                        'name': step.operation.rec_name,
                        'resource': None if supplier else self.work_center(
                            production, step),
                        'hours': duration.total_seconds() / 3600
                        if duration and not supplier else 0,
                        'outside': bool(supplier),
                        'supplier': supplier,
                        'transit': self.transit(step) if supplier else 0,
                        'delivery': None,
                        'started': False,
                        })
        return ops

    @staticmethod
    def transit(step):
        "The days the supplier keeps an outside service (its lead time)"
        ps = getattr(step, 'service_supplier', None) if step else None
        if ps and ps.lead_time:
            return max(ps.lead_time.days, 1)
        return 1

    # ---- placing ---------------------------------------------------------

    def place(self, resource, ready, hours):
        "(start, finish, unit) of the operation, the earliest finish"
        rid = resource.id if resource else None
        infinite = self.infinite or not self.calendar.finite(resource)
        units = 1 if infinite else self.calendar.max_units(resource)
        best = None
        for unit in range(units):
            cursor = ready
            for _ in range(10000):
                found = self.calendar.consume(resource, unit, cursor, hours)
                if not found:
                    break
                start, finish = found
                if infinite:
                    break
                conflicts = [b for b in self.busy[(rid, unit)]
                    if (b[0] < finish and b[1] > start)
                    or (start == finish and b[0] <= start < b[1])]
                if not conflicts:
                    break
                cursor = max(b[1] for b in conflicts)
            else:
                found = None
            if found and (best is None or found[1] < best[1]):
                best = (found[0], found[1], unit)
        if best is None:
            return ready, ready, 0
        if not infinite:
            self.reserve((rid, best[2]), (best[0], best[1]))
        return best

    def place_back(self, resource, due, hours):
        """(start, finish, unit) of the operation finishing by due, the
        latest start; None when no capacity is found"""
        rid = resource.id if resource else None
        infinite = self.infinite or not self.calendar.finite(resource)
        units = 1 if infinite else self.calendar.max_units(resource)
        floor = self.as_of - dt.timedelta(days=LIMIT_DAYS)
        best = None
        for unit in range(units):
            cursor = due
            for _ in range(10000):
                found = self.calendar.consume_back(resource, unit, cursor,
                    hours)
                if not found or found[0] < floor:
                    found = None
                    break
                start, finish = found
                if infinite:
                    break
                conflicts = [b for b in self.busy[(rid, unit)]
                    if (b[0] < finish and b[1] > start)
                    or (start == finish and b[0] < start <= b[1])]
                if not conflicts:
                    break
                cursor = min(b[0] for b in conflicts)
            else:
                found = None
            if found and (best is None or found[0] > best[0]):
                best = (found[0], found[1], unit)
        if best is None:
            return None
        if not infinite:
            self.reserve((rid, best[2]), (best[0], best[1]))
        return best

    def reserve(self, key, interval):
        self.busy[key].append(interval)
        self.journal.append((key, interval))

    def rollback(self, mark, journal):
        "Undo the rows and reservations made since mark (a failed try)"
        del self.rows[mark:]
        for key, interval in self.journal[journal:]:
            self.busy[key].remove(interval)
        del self.journal[journal:]

    def could(self, resource, ready, hours):
        "The undelayed (start, finish): the calendar only"
        found = self.calendar.consume(resource, 0, ready, hours)
        return found or (ready, ready)

    def could_back(self, resource, due, hours):
        "The undelayed (start, finish) backward: the calendar only"
        found = self.calendar.consume_back(resource, 0, due, hours)
        return found or (due, due)

    # ---- scheduling ------------------------------------------------------

    def is_started(self, production):
        return production.state == 'running' or any(
            op['started'] for op in self.operations(production))

    def order_key(self, production):
        if self.mode == 'released_first':
            # Released then Firm: the released ones are all scheduled first
            first = 0 if getattr(production, 'order_status',
                None) == 'released' else 1
            return (first,) + self._order_key(production)
        return self._order_key(production)

    def _order_key(self, production):
        want = production.planned_date or dt.date.max
        release = production.planned_start_date or dt.date.max
        number = production.number or ''
        if self.sort_by == 'priority':
            return (getattr(production, 'global_rank', None) or 999, want,
                release, number, production.id)
        return (want, release, number,
            getattr(production, 'global_rank', None) or 999, production.id)

    def run(self, productions):
        "Schedule the work orders (roots) in order; return the rows made"
        orders = sorted(productions, key=self.order_key)
        if self.started in ('first', 'first_freeze'):
            started = [p for p in orders if self.is_started(p)]
            orders = started + [p for p in orders if p not in started]
        for production in orders:
            earliest = self.as_of
            release = production.planned_start_date
            # Forward from the release date (the work order's Forward
            # Schedule, or every one with hard release dates)
            forward = bool(getattr(production, 'forward_schedule', False))
            if (self.hard_release or forward) and release:
                earliest = max(earliest, dt.datetime.combine(
                        release, dt.time()))
            want = _end_of(production.planned_date)
            if not forward and want and self.backward(production, want,
                    earliest):
                continue
            mark, journal = len(self.rows), len(self.journal)
            result = self.schedule_production(production, production,
                earliest, earliest)
            if (self.retry_backward and not forward and result[2]
                    is not None):
                # Retry backward from the forward schedule's end date
                forward_dp = self.determinant_ops(result[2])
                end = result[0]
                self.rollback(mark, journal)
                if self.backward(production, end, earliest,
                        forward_dp if self.keep_forward_dp else None):
                    continue
                result = self.schedule_production(production, production,
                    earliest, earliest)
            # The determinant path: back from the last operation
            for row in self.path(result[2]):
                row['determinant'] = True
        return self.rows

    @staticmethod
    def path(row):
        "The rows of the determinant path from a row along its drivers"
        rows = []
        while row is not None:
            rows.append(row)
            row = row.get('driver')
        return rows

    def determinant_ops(self, row):
        return {self.op_key_of(r) for r in self.path(row)}

    @staticmethod
    def op_key_of(row):
        return (row['production'], row['work'], row['step'], row['sequence'])

    def backward(self, production, due, earliest, keep_dp=None):
        """Schedule the work order backward from due; True when it fits
        after earliest, else nothing of it is kept"""
        mark, journal = len(self.rows), len(self.journal)
        ok = self.schedule_back(production, production, due, due, None)
        rows = self.rows[mark:]
        if ok and rows and min(r['start'] for r in rows) >= earliest:
            if keep_dp:
                for row in rows:
                    row['determinant'] = self.op_key_of(row) in keep_dp
            else:
                # The determinant path: from the first operation along the
                # operations whose start set the due of the one before
                first = min(rows, key=lambda r: (r['start'],
                        -(r['sequence'] or 0)))
                for row in self.path(first):
                    row['determinant'] = True
            return True
        self.rollback(mark, journal)
        return False

    def schedule_back(self, root, production, due, could_due, driver):
        """Schedule the operations (last first) and the legs of the
        production backward; False when an operation finds no capacity"""
        pool = Pool()
        Production = pool.get('production')
        ops = self.operations(production)
        feeds = self.feeds(production, ops)
        if not ops:
            return all(self.schedule_back(root, Production(leg.id), due,
                        could_due, driver)
                for legs in feeds.values() for leg in legs)
        nxt = driver
        for index in reversed(range(len(ops))):
            row = self.schedule_op_back(root, production, ops[index], due,
                could_due)
            if row is None:
                return False
            row['driver'] = nxt
            self.rows.append(row)
            nxt = row
            due, could_due = row['start'], row['could_start']
            for leg in feeds.get(index, []):
                if not self.schedule_back(root, Production(leg.id),
                        row['start'], row['could_start'], row):
                    return False
        return True

    def schedule_op_back(self, root, production, op, due, could_due):
        key = self.op_key(production, op['work'], op['step'],
            op['sequence'])
        kept = self.kept.get(key)
        resource = op['resource']
        if op['outside']:
            days = dt.timedelta(days=op['transit'])
            finish = due
            if op['delivery']:
                finish = min(finish, _end_of(op['delivery']))
            start = finish - days
            could_start, could_finish = could_due - days, could_due
            unit = 0
        else:
            could_start, could_finish = self.could_back(resource, could_due,
                op['hours'])
            if kept and kept.start and kept.finish:
                start, finish, unit = kept.start, kept.finish, (
                    kept.unit_no or 0)
            else:
                placed = self.place_back(resource, due, op['hours'])
                if placed is None:
                    return None
                start, finish, unit = placed
        row = self.row(root, production, op, resource, unit, start, finish,
            could_start, could_finish, kept)
        row['forward'] = False
        return row

    def schedule_production(self, root, production, ready, could_ready):
        """Schedule the legs then the operations of the production; return
        (finish, could finish, last row)"""
        pool = Pool()
        Production = pool.get('production')
        ops = self.operations(production)
        feeds = self.feeds(production, ops)
        leg_done = defaultdict(list)
        for index, legs in feeds.items():
            for leg in legs:
                leg_done[index].append(self.schedule_production(
                        root, Production(leg.id), ready, could_ready))
        last = None
        finish, could_finish = ready, could_ready
        for index, op in enumerate(ops):
            start_at, could_at, driver = finish, could_finish, last
            for leg_finish, leg_could, leg_row in leg_done.get(index, []):
                if leg_finish > start_at:
                    start_at, driver = leg_finish, leg_row
                could_at = max(could_at, leg_could)
            row = self.schedule_op(root, production, op, start_at, could_at)
            row['driver'] = driver
            self.rows.append(row)
            last = row
            finish, could_finish = row['finish'], row['could_finish']
        if not ops:
            for results in leg_done.values():
                for leg_finish, leg_could, leg_row in results:
                    if leg_finish >= finish:
                        finish, last = leg_finish, leg_row
                    could_finish = max(could_finish, leg_could)
        return finish, could_finish, last

    @staticmethod
    def feeds(production, ops):
        "The legs by the index of the operation they feed (their card's)"
        feeds = defaultdict(list)
        for card in production.material_cards:
            leg = card.leg if card.supply == 'leg' else None
            if not leg or leg.state not in LEG_STATES:
                continue
            index = next((i for i, op in enumerate(ops)
                    if op['sequence'] >= (card.operation or 0)), 0)
            feeds[index].append(leg)
        for leg in production.legs:
            if leg.state in LEG_STATES and not any(
                    leg in legs for legs in feeds.values()):
                feeds[0].append(leg)
        return feeds

    def schedule_op(self, root, production, op, ready, could_ready):
        key = self.op_key(production, op['work'], op['step'],
            op['sequence'])
        kept = self.kept.get(key)
        resource = op['resource']
        if op['outside']:
            days = dt.timedelta(days=op['transit'])
            start, finish = ready, ready + days
            if op['delivery']:
                finish = max(finish, _end_of(op['delivery']))
            could_start, could_finish = could_ready, could_ready + days
            unit = 0
        else:
            could_start, could_finish = self.could(resource, could_ready,
                op['hours'])
            if kept and kept.start and kept.finish:
                start, finish, unit = kept.start, kept.finish, (
                    kept.unit_no or 0)
            else:
                start, finish, unit = self.place(resource, ready,
                    op['hours'])
        row = self.row(root, production, op, resource, unit, start, finish,
            could_start, could_finish, kept)
        row['forward'] = True
        return row

    def row(self, root, production, op, resource, unit, start, finish,
            could_start, could_finish, kept):
        return {
            'schedule': self.schedule.id,
            'production': production.id,
            'root': root.id,
            'work': op['work'].id if op['work'] else None,
            'step': op['step'].id if op['step'] else None,
            'sequence': op['sequence'],
            'operation': op['name'],
            'resource': resource.id if resource else None,
            'resource_name': (op['supplier'].rec_name if op['supplier']
                else resource.rec_name if resource else ''),
            'outside': op['outside'],
            'unit_no': unit,
            'hours': op['hours'],
            'start': start,
            'finish': finish,
            'could_start': could_start,
            'could_finish': could_finish,
            'determinant': False,
            'frozen': bool(kept and kept.frozen),
            'started': op['started'],
            'kept': kept,
            }


class DeskScheduling(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['js_schedule_all', 'js_schedule_work_order',
                'js_schedule_freeze', 'js_schedule_settings',
                'js_schedule_delete', 'js_schedule_delete_work_order']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['js_schedule_info', 'js_schedule_resource_details',
                'js_schedule_work_order_details', 'js_schedule_chart',
                'js_schedule_export', 'js_schedule_list',
                'js_schedule_comparison']:
            cls.__rpc__[name] = RPC()

    # ---- Helpers ---------------------------------------------------------

    @classmethod
    def _js_now(cls):
        "Now at the shop (the company's time zone)"
        company = cls._company()
        timezone = getattr(company, 'timezone', None)
        if timezone:
            try:
                from zoneinfo import ZoneInfo
                return dt.datetime.now(ZoneInfo(timezone)).replace(
                    tzinfo=None, second=0, microsecond=0)
            except Exception:
                pass
        return dt.datetime.now().replace(second=0, microsecond=0)

    @classmethod
    def _js_schedule(cls, code=None, create=False):
        """The schedule of that Schedule ID (or id), STANDARD when none:
        STANDARD is the plan; the others are Jobshop's what-if schedules"""
        Schedule = Pool().get('nline.js.schedule')
        if isinstance(code, int):
            return Schedule(code)
        code = (code or '').strip().upper()
        if not code or code == 'STANDARD':
            return Schedule.standard()
        schedules = Schedule.search([('code', '=', code)], limit=1)
        if schedules:
            return schedules[0]
        if not create:
            raise ValidationError(gettext(
                    'nline_js_planning.msg_schedule_unknown', schedule=code))
        cls._check_create('nline.js.schedule')
        standard = Schedule.standard()
        schedule, = Schedule.copy([standard], default={
                'code': code, 'description': None,
                'scheduled_as_of': None})
        return schedule

    @classmethod
    def _js_settings(cls, schedule):
        return {
            'id': schedule.id,
            'code': schedule.code,
            'description': schedule.description or '',
            'infinite': bool(schedule.infinite),
            'scheduled_as_of': _iso(schedule.scheduled_as_of),
            'horizon': schedule.horizon,
            'hard_release_dates': bool(schedule.hard_release_dates),
            'sort_by': schedule.sort_by,
            'started': schedule.started,
            'mode': schedule.mode or 'together',
            'piece_scheduling': bool(schedule.piece_scheduling),
            'retry_backward': bool(schedule.retry_backward),
            'keep_forward_dp': bool(schedule.keep_forward_dp),
            'load_horizon': schedule.load_horizon or 90,
            }

    @classmethod
    def _js_scheduler(cls, schedule, as_of, started=None):
        return Scheduler(schedule, as_of, schedule.infinite,
            schedule.hard_release_dates, schedule.sort_by,
            started or schedule.started, schedule.mode or 'together',
            schedule.retry_backward, schedule.keep_forward_dp)

    @classmethod
    def _js_orders(cls, schedule, as_of):
        "The work orders the schedule schedules (roots)"
        Production = Pool().get('production')
        domain = [
            ('order_status', 'in', ['released']
                if schedule.mode == 'released' else SCHEDULED_STATUS),
            ('parent', '=', None),
            ]
        if schedule.horizon:
            domain.append(['OR',
                    ('planned_date', '=', None),
                    ('planned_date', '<=', as_of.date()
                        + dt.timedelta(days=schedule.horizon)),
                    ])
        return Production.search(domain)

    @classmethod
    def _js_save_rows(cls, rows):
        Operation = Pool().get('nline.js.schedule.operation')
        to_create = []
        for row in rows:
            values = {k: v for k, v in row.items()
                if k not in ('kept', 'driver')}
            if row['kept']:
                Operation.write([row['kept']], {
                        'determinant': values['determinant'],
                        'forward': values['forward'],
                        'could_start': values['could_start'],
                        'could_finish': values['could_finish'],
                        })
            else:
                to_create.append(values)
        Operation.create(to_create)
        return len(rows)

    # ---- Schedule All / Schedule Work Order ------------------------------

    @classmethod
    def js_schedule_settings(cls, values):
        """Save the schedule's settings (Set Load Horizon, Schedule All);
        values['schedule']: its Schedule ID (a new one is made)"""
        cls._check_write('nline.js.schedule')
        Schedule = Pool().get('nline.js.schedule')
        schedule = cls._js_schedule(values.get('schedule'), create=True)
        fields = {k: values[k] for k in ('infinite', 'hard_release_dates',
                'sort_by', 'started', 'load_horizon', 'horizon', 'mode',
                'piece_scheduling', 'retry_backward', 'keep_forward_dp',
                'description')
            if k in values}
        if 'description' in fields:
            fields['description'] = (fields['description'] or '').strip() \
                or None
        if fields:
            Schedule.write([schedule], fields)
        return cls._js_settings(Schedule(schedule.id))

    @classmethod
    def js_schedule_list(cls):
        "The schedules (the Schedule ID lookup of Schedule All)"
        cls._check_read('nline.js.schedule')
        Schedule = Pool().get('nline.js.schedule')
        Schedule.standard()
        return [cls._js_settings(s) for s in Schedule.search([],
                order=[('code', 'ASC')])]

    @classmethod
    def js_schedule_delete(cls, code):
        "Delete a what-if schedule (Schedule All's Delete; not STANDARD)"
        pool = Pool()
        Schedule = pool.get('nline.js.schedule')
        ModelAccess = pool.get('ir.model.access')
        ModelAccess.check('nline.js.schedule', 'delete')
        schedule = cls._js_schedule(code)
        if schedule.code == 'STANDARD':
            raise ValidationError(gettext(
                    'nline_js_planning.msg_schedule_standard'))
        Schedule.delete([schedule])
        return True

    @classmethod
    def js_schedule_delete_work_order(cls, production, schedule=None):
        "Tools > Delete Work Order Schedule: its operations leave the schedule"
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        Production = pool.get('production')
        ModelAccess = pool.get('ir.model.access')
        ModelAccess.check('nline.js.schedule.operation', 'delete')
        root = Production(production)
        root = root.root or root
        schedule = cls._js_schedule(schedule)
        Operation.delete(Operation.search([
                    ('schedule', '=', schedule.id),
                    ('root', '=', root.id)]))
        return True

    @classmethod
    def js_schedule_all(cls, values=None):
        """Schedule All: schedule every Firm and Released work order
        values: as_of, infinite, hard_release_dates, sort_by, started"""
        cls._check_create('nline.js.schedule.operation')
        cls._check_read('production')
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        Schedule = pool.get('nline.js.schedule')
        values = values or {}
        settings = cls.js_schedule_settings(values)
        schedule = Schedule(settings['id'])
        now = cls._js_now()
        as_of = _datetime(values.get('as_of')) or now
        if as_of.date() < now.date():
            raise ValidationError(gettext(
                    'nline_js_planning.msg_schedule_past'))
        scheduler = cls._js_scheduler(schedule, as_of)
        old = Operation.search([('schedule', '=', schedule.id)])
        kept = [o for o in old if o.frozen or (
                schedule.started == 'first_freeze' and o.started
                and o.finish and o.finish >= now)]
        Operation.delete([o for o in old if o not in kept])
        scheduler.keep(kept)
        orders = cls._js_orders(schedule, as_of)
        rows = scheduler.run(orders)
        # Rows of orders not scheduled any more go
        done = {r['kept'].id for r in rows if r['kept']}
        Operation.delete([o for o in kept if o.id not in done])
        cls._js_save_rows(rows)
        Schedule.write([schedule], {'scheduled_as_of': as_of})
        late = {r['root'] for r in rows if r['finish'] and r['finish']
            > (_end_of(Pool().get('production')(r['root']).planned_date)
                or dt.datetime.max)}
        return {'orders': len(orders), 'operations': len(rows),
            'late': len(late), 'as_of': _iso(as_of)}

    @classmethod
    def js_schedule_work_order(cls, production, schedule=None):
        """Schedule Work Order (the Work Order window's Tools): schedule only
        this work order in the current schedule, with no precedence"""
        cls._check_create('nline.js.schedule.operation')
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        Production = pool.get('production')
        production = Production(production)
        root = production.root or production
        if getattr(root, 'order_status', None) not in SCHEDULED_STATUS:
            raise ValidationError(gettext(
                    'nline_js_planning.msg_not_schedulable',
                    production=root.rec_name))
        schedule = cls._js_schedule(schedule)
        now = cls._js_now()
        as_of = max(schedule.scheduled_as_of or now, now)
        scheduler = cls._js_scheduler(schedule, as_of, 'normal')
        mine = Operation.search([('schedule', '=', schedule.id),
                ('root', '=', root.id)])
        kept = [o for o in mine if o.frozen]
        Operation.delete([o for o in mine if not o.frozen])
        scheduler.load(Operation.search([('schedule', '=', schedule.id),
                    ('root', '!=', root.id)]))
        scheduler.keep(kept)
        rows = scheduler.run([root])
        done = {r['kept'].id for r in rows if r['kept']}
        Operation.delete([o for o in kept if o.id not in done])
        cls._js_save_rows(rows)
        return cls.js_schedule_work_order_details(root.id, schedule.id)

    @classmethod
    def js_schedule_freeze(cls, operations, frozen=True):
        "Frozen: the operations do not move when scheduled again"
        cls._check_write('nline.js.schedule.operation')
        Operation = Pool().get('nline.js.schedule.operation')
        Operation.write(Operation.browse(operations),
            {'frozen': bool(frozen)})
        return True

    # ---- Reading the schedule --------------------------------------------

    @classmethod
    def _js_op(cls, op):
        root = op.root
        production = op.production
        number = split_number(production)
        want = _end_of(root.planned_date)
        work = op.work
        status = work.state if work else production.state
        return {
            'id': op.id,
            'schedule_id': op.schedule.code,
            'part_id': (production.product.code
                or production.product.rec_name) if production.product
            else '',
            'production': production.id,
            'root': root.id,
            'number': number['number'],
            'work_id': number['work_id'],
            'lot_id': number['lot_id'],
            'split_id': number['split_id'],
            'sub_id': number['sub_id'],
            'seq_no': op.sequence,
            'operation': op.operation or '',
            'resource': op.resource.id if op.resource else None,
            'resource_id': op.resource_name or '',
            'outside': bool(op.outside),
            'unit_no': op.unit_no or 0,
            'hours': op.hours or 0,
            'start': _iso(op.start),
            'finish': _iso(op.finish),
            'qty': production.quantity,
            'cmp_qty': production.quantity if work and work.state in (
                'finished', 'done') else 0,
            'status': status,
            'order_status': wo_status(root),
            'could_start': _iso(op.could_start),
            'could_finish': _iso(op.could_finish),
            'could_early': bool(op.could_start and op.start
                and op.could_start < op.start),
            'want_date': root.planned_date,
            'release_date': root.planned_start_date,
            'determinant': bool(op.determinant),
            'forward': bool(op.forward),
            'late': bool(want and op.finish and op.finish > want),
            'frozen': bool(op.frozen),
            'part': production.product.rec_name
            if production.product else '',
            }

    @classmethod
    def js_schedule_info(cls, schedule=None):
        """The Scheduling window: the schedule's settings, the resources,
        the scheduled work orders and the calendars"""
        cls._check_read('production')
        pool = Pool()
        WorkCenter = pool.get('production.work.center')
        Operation = pool.get('nline.js.schedule.operation')
        Schedule = pool.get('nline.js.schedule')
        schedule = cls._js_schedule(schedule)
        resources = [{'id': c.id, 'name': c.rec_name, 'code': c.name,
                'description': getattr(c, 'description', None) or ''}
            for c in WorkCenter.search([], order=[('name', 'ASC')])
            if not c.children]
        orders = {}
        for op in Operation.search([('schedule', '=', schedule.id)]):
            root = op.root
            orders[root.id] = {'id': root.id,
                'number': root.number or str(root.id),
                'description': root.product.name if root.product else ''}
        views = []
        try:
            ShopView = pool.get('nline.js.shop_view')
        except KeyError:
            ShopView = None
        if ShopView:
            for view in ShopView.search([]):
                views.append({'id': view.id, 'name': view.rec_name,
                        'resources': [l.resource.id
                            for l in view.resource_lines if l.resource]})
        info = cls._js_settings(schedule)
        info.update({
                'views': views,
                'today': cls._js_now().date(),
                'now': _iso(cls._js_now()),
                'resources': resources,
                'work_orders': sorted(orders.values(),
                    key=lambda o: o['number']),
                'schedules': [s.code for s in Schedule.search([],
                        order=[('code', 'ASC')])],
                })
        return info

    @classmethod
    def _js_view_resources(cls, view):
        "The resources of a shop view (nline_js_shopfloor)"
        ShopView = Pool().get('nline.js.shop_view')
        return [l.resource.id for l in ShopView(view).resource_lines
            if l.resource]

    @classmethod
    def js_schedule_resource_details(cls, resource=None, view=None,
            schedule=None):
        """Resource Details: the scheduled operations of one resource, of
        the resources of a shop view or of all"""
        cls._check_read('production')
        Operation = Pool().get('nline.js.schedule.operation')
        schedule = cls._js_schedule(schedule)
        domain = [('schedule', '=', schedule.id)]
        if resource:
            domain.append(('resource', '=', resource))
        elif view:
            domain.append(('resource', 'in', cls._js_view_resources(view)))
        ops = Operation.search(domain, order=[('resource', 'ASC'),
                ('start', 'ASC'), ('id', 'ASC')])
        return [cls._js_op(o) for o in ops]

    @classmethod
    def js_schedule_work_order_details(cls, production, schedule=None):
        "Work Order Details: the work order and its scheduled operations"
        cls._check_read('production')
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        Production = pool.get('production')
        root = Production(production)
        root = root.root or root
        schedule = cls._js_schedule(schedule)
        ops = [cls._js_op(o) for o in Operation.search([
                    ('schedule', '=', schedule.id),
                    ('root', '=', root.id),
                    ], order=[('start', 'ASC'), ('id', 'ASC')])]
        starts = [o['start'] for o in ops if o['start']]
        finishes = [o['finish'] for o in ops if o['finish']]
        finish = max(finishes) if finishes else None
        # Days Early/Late: the finish date against the want date
        missed = None
        if finish and root.planned_date:
            missed = (_datetime(finish).date() - root.planned_date).days
        return {
            'id': root.id,
            'number': root.number or str(root.id),
            'work_id': split_number(root)['work_id'],
            'part': root.product.rec_name if root.product else '',
            'description': root.product.name if root.product else '',
            'want_date': root.planned_date,
            'release_date': root.planned_start_date,
            'start': min(starts) if starts else None,
            'finish': finish,
            'missed_days': missed,
            'rank': root.global_rank,
            'forward': bool(getattr(root, 'forward_schedule', False)),
            'frozen': bool(ops) and all(o['frozen'] for o in ops),
            'late': any(o['late'] for o in ops),
            'status': wo_status(root),
            'operations': ops,
            }

    @classmethod
    def js_schedule_chart(cls, mode='resource', ident=None, from_date=None,
            to_date=None, view=None, schedule=None):
        """The Schedule tab: one row per resource (mode 'resource') or per
        work order (mode 'work_order') with its operations as bars and,
        for a resource, the capacity of each day"""
        cls._check_read('production')
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        WorkCenter = pool.get('production.work.center')
        Production = pool.get('production')
        schedule = cls._js_schedule(schedule)
        today = cls._js_now().date()
        start = _date(from_date) or today - dt.timedelta(days=7)
        end = _date(to_date) or today + dt.timedelta(
            days=schedule.load_horizon or 90)
        domain = [('schedule', '=', schedule.id),
            ('start', '<=', dt.datetime.combine(end, dt.time.max)),
            ('finish', '>=', dt.datetime.combine(start, dt.time())),
            ]
        view_resources = cls._js_view_resources(view) if view else None
        if ident and mode == 'resource':
            domain.append(('resource', '=', ident))
        elif view_resources is not None and mode == 'resource':
            domain.append(('resource', 'in', view_resources))
        elif ident:
            domain.append(('root', '=', ident))
        ops = [cls._js_op(o) for o in Operation.search(domain,
                order=[('start', 'ASC'), ('id', 'ASC')])]
        rows = []
        if mode == 'resource':
            calendar = Calendar(schedule)
            if ident:
                centers = [WorkCenter(ident)]
            elif view_resources is not None:
                centers = WorkCenter.browse(view_resources)
            else:
                ids = {o['resource'] for o in ops if o['resource']}
                centers = [c for c in WorkCenter.search([],
                        order=[('name', 'ASC')])
                    if c.id in ids or not c.children]
            for center in centers:
                capacity = []
                day = start
                while day <= end:
                    windows = calendar.windows(center, day)
                    if windows:
                        capacity.append({'day': day, 'windows': [
                                    {'start': _iso(s), 'end': _iso(e),
                                        'units': u}
                                    for s, e, u in windows]})
                    day += dt.timedelta(days=1)
                rows.append({'id': center.id, 'label': center.rec_name,
                        'units': calendar.max_units(center),
                        'capacity': capacity,
                        'bars': [o for o in ops
                            if o['resource'] == center.id]})
            outside = [o for o in ops if not o['resource']]
            if outside and not ident and view_resources is None:
                rows.append({'id': None, 'label': "Outside services",
                        'units': 1, 'capacity': [], 'bars': outside})
        else:
            roots = {}
            for o in ops:
                roots.setdefault(o['root'], []).append(o)
            if ident and ident not in roots:
                roots[ident] = []
            if not ident:
                # Every open work order with its dates in the range, as the
                # desk's earlier chart (its dates are dragged to move it)
                for p in Production.search([
                            ('state', 'in', LEG_STATES),
                            ('parent', '=', None),
                            ('planned_date', '>=', start),
                            ['OR',
                                ('planned_start_date', '=', None),
                                ('planned_start_date', '<=', end)],
                            ]):
                    roots.setdefault(p.id, [])
            for root in Production.browse(list(roots)):
                rows.append({'id': root.id,
                        'label': root.number or str(root.id),
                        'part': root.product.rec_name
                        if root.product else '',
                        'state': root.state,
                        'release_date': root.planned_start_date,
                        'want_date': root.planned_date,
                        'bars': roots[root.id]})
            rows.sort(key=lambda r: (min([b['start'] for b in r['bars']]
                        or ['9999']), r['label']))
        return {'from': start, 'to': end, 'today': today,
            'schedule': schedule.code,
            'description': schedule.description or '',
            'rows': rows}

    # ---- Exporting Your Schedule to MS Project ---------------------------

    @classmethod
    def js_schedule_export(cls, format='xml', schedule=None):
        """The schedule as a file: Jobshop's Export Schedule (tab delimited,
        the operations as Resource Details shows them) or for MS Project:
        Project XML (MSPDI) or CSV, one summary task per work order, a task
        per operation"""
        cls._check_read('production')
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        schedule = cls._js_schedule(schedule)
        ops = Operation.search([('schedule', '=', schedule.id)],
            order=[('root', 'ASC'), ('start', 'ASC'), ('id', 'ASC')])
        orders = []
        by_root = {}
        for op in ops:
            if op.root.id not in by_root:
                by_root[op.root.id] = []
                orders.append(op.root)
            by_root[op.root.id].append(op)
        stamp = cls._js_now().strftime('%Y%m%d')
        if format == 'tab':
            return {'filename': 'schedule_%s_%s.txt' % (schedule.code, stamp),
                'mimetype': 'text/tab-separated-values',
                'content': cls._js_tab(ops)}
        if format == 'csv':
            return {'filename': 'schedule_%s.csv' % stamp,
                'mimetype': 'text/csv',
                'content': cls._js_csv(orders, by_root)}
        return {'filename': 'schedule_%s.xml' % stamp,
            'mimetype': 'application/xml',
            'content': cls._js_mspdi(schedule, orders, by_root)}

    @classmethod
    def _js_tab(cls, ops):
        "The scheduled operations, tab delimited (Jobshop's Export Schedule)"
        out = io.StringIO()
        writer = csv.writer(out, delimiter='\t', lineterminator='\r\n')
        writer.writerow(['Schedule ID', 'Resource ID', 'Part ID', 'Work ID',
                'Lot ID', 'Split ID', 'Sub ID', 'Seq No', 'Unit No',
                'Start Date', 'Finish Date', 'Qty', 'Cmp Qty', 'Status',
                'Could Start Date', 'Could Finish Date', 'Want Date',
                'Determinant', 'Forward', 'Late'])
        for op in sorted(ops, key=lambda o: (o.resource_name or '',
                    o.start or dt.datetime.min, o.id)):
            r = cls._js_op(op)
            writer.writerow([r['schedule_id'], r['resource_id'],
                    r['part_id'], r['work_id'], r['lot_id'], r['split_id'],
                    r['sub_id'], r['seq_no'], r['unit_no'],
                    (r['start'] or '').replace('T', ' '),
                    (r['finish'] or '').replace('T', ' '), r['qty'],
                    r['cmp_qty'], r['status'],
                    (r['could_start'] or '').replace('T', ' '),
                    (r['could_finish'] or '').replace('T', ' '),
                    r['want_date'] or '', 'Y' if r['determinant'] else 'N',
                    'Y' if r['forward'] else 'N', 'Y' if r['late'] else 'N'])
        return out.getvalue()

    # ---- Schedule Comparison ---------------------------------------------

    @classmethod
    def js_schedule_comparison(cls, what_if_1=None, what_if_2=None):
        """The Schedule Comparison tab: each scheduled work order's start and
        finish in the STANDARD schedule and two what-if schedules, and the
        percent of late work orders of each"""
        cls._check_read('production')
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        Schedule = pool.get('nline.js.schedule')
        schedules = {'standard': Schedule.standard()}
        for key, code in (('what_if_1', what_if_1), ('what_if_2',
                    what_if_2)):
            found = Schedule.search([('code', '=', code)], limit=1) \
                if code else []
            schedules[key] = found[0] if found else None
        dates = defaultdict(dict)
        roots = {}
        for key, schedule in schedules.items():
            if not schedule:
                continue
            for op in Operation.search([('schedule', '=', schedule.id)]):
                roots[op.root.id] = op.root
                start, finish = dates[op.root.id].get(key, (None, None))
                if op.start and (not start or op.start < start):
                    start = op.start
                if op.finish and (not finish or op.finish > finish):
                    finish = op.finish
                dates[op.root.id][key] = (start, finish)
        rows = []
        late = defaultdict(int)
        counted = defaultdict(int)
        for root in sorted(roots.values(), key=lambda p: (p.number or '',
                    p.id)):
            number = split_number(root)
            want = _end_of(root.planned_date)
            row = {
                'id': root.id,
                'work_id': number['work_id'],
                'lot_id': number['lot_id'],
                'split_id': number['split_id'],
                'order_status': wo_status(root),
                'part_id': (root.product.code or root.product.rec_name)
                if root.product else '',
                'desired_qty': root.quantity,
                'hard_rls_date': bool(schedules['standard']
                    .hard_release_dates),
                'forward_schedule': bool(getattr(root, 'forward_schedule',
                        False)),
                'global_rank': getattr(root, 'global_rank', None),
                'release_date': root.planned_start_date,
                'want_date': root.planned_date,
                }
            for key in schedules:
                start, finish = dates[root.id].get(key, (None, None))
                row[key + '_start'] = _iso(start)
                row[key + '_finish'] = _iso(finish)
                if finish:
                    counted[key] += 1
                    if want and finish > want:
                        late[key] += 1
            rows.append(row)
        percent = {key: (round(100.0 * late[key] / counted[key], 1)
                if counted[key] else None) for key in schedules}
        return {
            'schedules': {k: s.code if s else None
                for k, s in schedules.items()},
            'percent_late': percent,
            'rows': rows,
            }

    @staticmethod
    def _js_duration(start, finish):
        seconds = max(int((finish - start).total_seconds()), 0) if (
            start and finish) else 0
        return 'PT%dH%dM0S' % (seconds // 3600, seconds % 3600 // 60)

    @classmethod
    def _js_csv(cls, orders, by_root):
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(['ID', 'Name', 'Outline Level', 'Start', 'Finish',
                'Duration', 'Resource Names', 'Predecessors', 'Notes'])
        uid = 0
        for root in orders:
            ops = by_root[root.id]
            uid += 1
            writer.writerow([uid, '%s %s' % (root.number or root.id,
                        root.product.rec_name if root.product else ''), 1,
                    min(o.start for o in ops).strftime('%m/%d/%Y %H:%M'),
                    max(o.finish for o in ops).strftime('%m/%d/%Y %H:%M'),
                    '', '', '', 'Want %s' % (root.planned_date or '')])
            previous = None
            for op in ops:
                uid += 1
                writer.writerow([uid, '%s %s' % (op.sequence or '',
                            op.operation or ''), 2,
                        op.start.strftime('%m/%d/%Y %H:%M'),
                        op.finish.strftime('%m/%d/%Y %H:%M'),
                        '%.2fh' % ((op.finish - op.start).total_seconds()
                            / 3600),
                        op.resource_name or '',
                        previous or '', op.production.number or ''])
                previous = uid
        return out.getvalue()

    @classmethod
    def _js_mspdi(cls, schedule, orders, by_root):
        ns = 'http://schemas.microsoft.com/project'
        ET.register_namespace('', ns)

        def sub(parent, tag, text=None):
            node = ET.SubElement(parent, '{%s}%s' % (ns, tag))
            if text is not None:
                node.text = str(text)
            return node

        def stamp(value):
            return value.strftime('%Y-%m-%dT%H:%M:%S')

        project = ET.Element('{%s}Project' % ns)
        sub(project, 'SaveVersion', 14)
        sub(project, 'Name', '%s schedule' % schedule.code)
        sub(project, 'Title', schedule.description or schedule.code)
        starts = [o.start for ops in by_root.values() for o in ops]
        sub(project, 'ScheduleFromStart', 1)
        if starts:
            sub(project, 'StartDate', stamp(min(starts)))
        sub(project, 'CalendarUID', 1)
        sub(project, 'MinutesPerDay', 480)
        sub(project, 'MinutesPerWeek', 2400)
        calendars = sub(project, 'Calendars')
        calendar = sub(calendars, 'Calendar')
        sub(calendar, 'UID', 1)
        sub(calendar, 'Name', 'Standard')
        sub(calendar, 'IsBaseCalendar', 1)

        resources = sub(project, 'Resources')
        resource_uid = {}
        for ops in by_root.values():
            for op in ops:
                name = op.resource_name or ''
                if name and name not in resource_uid:
                    resource_uid[name] = len(resource_uid) + 1
                    node = sub(resources, 'Resource')
                    sub(node, 'UID', resource_uid[name])
                    sub(node, 'ID', resource_uid[name])
                    sub(node, 'Name', name)
                    sub(node, 'Type', 1)

        tasks = sub(project, 'Tasks')
        assignments = sub(project, 'Assignments')
        uid = 0
        for root in orders:
            ops = by_root[root.id]
            uid += 1
            task = sub(tasks, 'Task')
            sub(task, 'UID', uid)
            sub(task, 'ID', uid)
            sub(task, 'Name', '%s %s' % (root.number or root.id,
                    root.product.rec_name if root.product else ''))
            sub(task, 'OutlineLevel', 1)
            sub(task, 'Summary', 1)
            start = min(o.start for o in ops)
            finish = max(o.finish for o in ops)
            sub(task, 'Start', stamp(start))
            sub(task, 'Finish', stamp(finish))
            sub(task, 'Duration', cls._js_duration(start, finish))
            if root.planned_date:
                sub(task, 'Deadline', stamp(_end_of(root.planned_date)))
            previous = None
            for op in ops:
                uid += 1
                task = sub(tasks, 'Task')
                sub(task, 'UID', uid)
                sub(task, 'ID', uid)
                sub(task, 'Name', '%s %s' % (op.sequence or '',
                        op.operation or ''))
                sub(task, 'OutlineLevel', 2)
                sub(task, 'Start', stamp(op.start))
                sub(task, 'Finish', stamp(op.finish))
                sub(task, 'Duration', cls._js_duration(op.start, op.finish))
                # Start No Earlier Than: Project keeps the scheduled dates
                sub(task, 'ConstraintType', 4)
                sub(task, 'ConstraintDate', stamp(op.start))
                sub(task, 'Notes', '%s %s' % (op.production.number or '',
                        op.resource_name or ''))
                if previous:
                    link = sub(task, 'PredecessorLink')
                    sub(link, 'PredecessorUID', previous)
                    sub(link, 'Type', 1)
                previous = uid
                if op.resource_name in resource_uid:
                    assignment = sub(assignments, 'Assignment')
                    sub(assignment, 'UID', uid)
                    sub(assignment, 'TaskUID', uid)
                    sub(assignment, 'ResourceUID',
                        resource_uid[op.resource_name])
                    sub(assignment, 'Start', stamp(op.start))
                    sub(assignment, 'Finish', stamp(op.finish))
        return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            + ET.tostring(project, encoding='unicode'))
