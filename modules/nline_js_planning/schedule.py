# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop's schedule: the STANDARD schedule and its settings, and the
scheduled operations (the output of the scheduler, Jobshop's
OPERATION_SCHED). The weekly calendars and calendar exceptions are the
Shopfloor area's (nline_js_shopfloor: nline.js.calendar.week / change)."""
from trytond.model import ModelSQL, ModelView, Unique, fields


class Schedule(ModelSQL, ModelView):
    "Schedule"
    __name__ = 'nline.js.schedule'

    code = fields.Char("Schedule ID", required=True, strip=True)
    description = fields.Char("Description")
    infinite = fields.Boolean(
        "Schedule Infinite",
        help="Ignore the capacity of the resources (only their calendars).")
    scheduled_as_of = fields.DateTime(
        "Schedule As Of", readonly=True,
        help="When the schedule was last run, and from when.")
    horizon = fields.Integer(
        "Schedule Horizon",
        help="Only schedule the work orders wanted within this many days.")
    hard_release_dates = fields.Boolean(
        "Treat Release Dates as Hard",
        help="No work order starts before its release date.")
    sort_by = fields.Selection([
            ('want', "Order Want Date"),
            ('priority', "Priority Want Date"),
            ], "Sort By", required=True)
    started = fields.Selection([
            ('normal', "Normally"),
            ('first', "First, Don't Freeze Started Operations"),
            ('first_freeze', "First, Freeze Started Operations"),
            ], "Schedule Started Work Orders", required=True)
    load_horizon = fields.Integer(
        "Set Load Horizon (Days)",
        help="The days of schedule the Scheduling window shows.")
    active = fields.Boolean("Active")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('code_unique', Unique(t, t.code),
                'nline_js_planning.msg_schedule_unique'),
            ]

    @staticmethod
    def default_infinite():
        return True

    @staticmethod
    def default_horizon():
        return 730

    @staticmethod
    def default_sort_by():
        return 'want'

    @staticmethod
    def default_started():
        return 'normal'

    @staticmethod
    def default_load_horizon():
        return 90

    @staticmethod
    def default_active():
        return True

    def get_rec_name(self, name):
        return self.code

    @classmethod
    def standard(cls):
        "Return the STANDARD schedule (made when missing)"
        schedules = cls.search([('code', '=', 'STANDARD')], limit=1)
        if schedules:
            return schedules[0]
        schedule = cls(code='STANDARD', description="Standard Schedule")
        schedule.save()
        return schedule


class ScheduleOperation(ModelSQL, ModelView):
    "Scheduled Operation"
    __name__ = 'nline.js.schedule.operation'

    schedule = fields.Many2One(
        'nline.js.schedule', "Schedule", required=True, ondelete='CASCADE')
    production = fields.Many2One(
        'production', "Work Order / Leg", required=True, ondelete='CASCADE')
    root = fields.Many2One(
        'production', "Work Order", required=True, ondelete='CASCADE')
    work = fields.Many2One(
        'production.work', "Operation", ondelete='CASCADE',
        help="Empty for a Firm work order: its operations are its routing's.")
    step = fields.Many2One(
        'production.routing.step', "Routing Step", ondelete='SET NULL')
    sequence = fields.Integer("Seq No")
    operation = fields.Char("Operation")
    resource = fields.Many2One(
        'production.work.center', "Resource ID", ondelete='SET NULL')
    resource_name = fields.Char("Resource",
        help="The resource, or the supplier of an outside service.")
    outside = fields.Boolean("Outside Service")
    unit_no = fields.Integer("Unit No")
    hours = fields.Float("Hours", digits=(16, 2))
    start = fields.DateTime("Start Date")
    finish = fields.DateTime("Finish Date")
    could_start = fields.DateTime("Could Start Date")
    could_finish = fields.DateTime("Could Finish Date")
    determinant = fields.Boolean("Determinant")
    frozen = fields.Boolean("Frozen",
        help="The operation does not move when the schedule is run again.")
    started = fields.Boolean("Started")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('root')
        cls._order = [('start', 'ASC'), ('id', 'ASC')]
