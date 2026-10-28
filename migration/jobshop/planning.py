"""Jobshop Planning data (step js_planning): the schedules and their settings
(SHOPFLOOR_SCHEDULE: the STANDARD schedule of the Scheduling window).

Re-runnable: a schedule is matched by its ID.

The weekly calendars and calendar exceptions (SHOPFLOOR_CALENDAR_WEEK,
SHOPFLOOR_CALENDAR_CHANGE) are imported by the Shopfloor step (js_shopfloor):
the scheduler uses those. The scheduled operations (SHOPFLOOR_OPERATION_SCHED)
are not imported: they are made by running the schedule (Scheduling >
Schedule All)."""
try:
    from nline_migrate import log, one_line
except ImportError:                     # the tests
    def log(message):
        print(message)

    def one_line(value, size=None):
        value = ' '.join(str(value or '').split())
        return value[:size] if size else value

STARTED = {1: 'first', 2: 'first_freeze'}
# SCHEDULE.MODE: Released and Firm Together, Released then Firm, Released Only
MODE = {1: 'released_first', 2: 'released'}


def run(m):
    Schedule = m.get('nline.js.schedule')
    schedules = {s.code: s for s in Schedule.find([])}
    for row in m.js.rows("select * from SHOPFLOOR_SCHEDULE"):
        code = row['ID']
        schedule = schedules.get(code)
        if not schedule:
            schedule = Schedule(code=code)
            if hasattr(m, 'count'):
                m.count('schedules')
        schedule.description = one_line(row.get('DESCRIPTION')) or None
        schedule.infinite = bool(row.get('INFINITE_CAPACITY'))
        schedule.horizon = row.get('HORIZON') or 730
        schedule.hard_release_dates = bool(row.get('HARD_RELEASE_DATES'))
        schedule.sort_by = 'priority' if row.get('SORT_BY') == 1 else 'want'
        schedule.started = STARTED.get(row.get('SCHED_STARTED_WO'), 'normal')
        schedule.mode = MODE.get(row.get('MODE'), 'together')
        schedule.piece_scheduling = bool(row.get('PIECE_SCHEDULING'))
        schedule.retry_backward = bool(row.get('RETRY_BACKWARD'))
        schedule.keep_forward_dp = bool(row.get('KEEP_FORWARD_DP'))
        schedule.active = bool(row.get('ACTIVE', True))
        schedule.save()
        schedules[code] = schedule
    others = m.js.rows("select count(*) as N from SHOPFLOOR_CALENDAR_WEEK "
        "where SCHEDULE_ID is not null and SCHEDULE_ID <> ''")
    if others and others[0]['N']:
        log("planning: %s weekly calendar rows of one schedule not imported "
            "(the calendars are the shop's)" % others[0]['N'])
    log("planning: %s schedules" % len(schedules))
