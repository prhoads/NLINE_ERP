# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Employees (SHOPFLOOR_DIRECT_EMPLOYEE) on Tryton's employees, and
their clock in / clock out (time and attendance, SHOPFLOOR_EMPLOYEE_TIME)."""
from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.model.exceptions import AccessError, ValidationError
from trytond.pool import Pool, PoolMeta

from .resource import cost_field


class Employee(metaclass=PoolMeta):
    __name__ = 'company.employee'
    clock_no = fields.Char("Clock #", strip=True,
        help="The employee's badge: up to 15 characters, all caps without "
        "spaces when it is scanned.")
    shift_no = fields.Integer("Shift #")
    department = fields.Char("Department")
    title = fields.Char("Title")
    cost_per_hr = cost_field("Cost/Hr",
        help="The base (indirect) labor cost of an hour.")
    setup_cost_per_hr = cost_field("Setup Cost/Hr",
        help="The cost of an hour of setup (the base cost when empty).")
    run_cost_per_hr = cost_field("Run Cost/Hr",
        help="The cost of an hour of run (the base cost when empty).")
    cost_per_unit = cost_field("Cost/Unit", help="The piece rate.")
    bur_per_hr_setup = cost_field("Burden/Hr (Setup)")
    bur_per_hr_run = cost_field("Burden/Hr (Run)")
    bur_per_unit_run = cost_field("Burden/Unit (Run)")
    bur_percent_setup = cost_field("Burden % (Setup)")
    bur_percent_run = cost_field("Burden % (Run)")
    inactive = fields.Boolean("Inactive",
        help="Inactive employees are left out of the lookups.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('clock_no_unique', Unique(t, t.company, t.clock_no),
                'nline_js_shopfloor.msg_clock_no_unique'),
            ]

    @classmethod
    def default_shift_no(cls):
        return 1

    @classmethod
    def default_inactive(cls):
        return False

    def get_rec_name(self, name):
        name = super().get_rec_name(name)
        if self.clock_no:
            return '%s - %s' % (self.clock_no, name)
        return name

    @classmethod
    def search_rec_name(cls, name, clause):
        _, operator, *value = clause
        if operator.startswith('!') or operator.startswith('not '):
            bool_op = 'AND'
        else:
            bool_op = 'OR'
        return [bool_op,
            ('party.rec_name',) + tuple(clause[1:]),
            ('clock_no',) + tuple(clause[1:]),
            ]

    def labor_rate(self, step):
        "The employee's cost of an hour of the step (setup, run, indirect)"
        if step == 'setup' and self.setup_cost_per_hr:
            return self.setup_cost_per_hr
        if step == 'run' and self.run_cost_per_hr:
            return self.run_cost_per_hr
        return self.cost_per_hr or 0

    @classmethod
    def delete(cls, employees):
        # Jobshop: "You CANNOT delete an employee record if that employee
        # has entered any labor transactions"
        Ticket = Pool().get('nline.js.labor_ticket')
        tickets = Ticket.search([
                ('employee', 'in', [e.id for e in employees]),
                ], limit=1)
        if tickets:
            raise AccessError(gettext(
                    'nline_js_shopfloor.msg_employee_delete_labor',
                    employee=tickets[0].employee.rec_name))
        super().delete(employees)


class EmployeeTime(ModelSQL, ModelView):
    "Employee Clock In/Out"
    __name__ = 'nline.js.employee_time'
    employee = fields.Many2One('company.employee', "Employee",
        required=True, ondelete='CASCADE')
    shift_no = fields.Integer("Shift #")
    clock_in = fields.DateTime("Clock In", required=True)
    clock_out = fields.DateTime("Clock Out")
    hours_worked = fields.Function(fields.Float("Hours Worked"),
        'get_hours_worked')
    in_reason_code = fields.Many2One('nline.reason_code',
        "Clock In Reason Code", ondelete='RESTRICT')
    out_reason_code = fields.Many2One('nline.reason_code',
        "Clock Out Reason Code", ondelete='RESTRICT')
    approved = fields.Boolean("Approved")
    approved_by = fields.Many2One('res.user', "Approved By", readonly=True)
    notes = fields.Text("Notes")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('clock_in', 'DESC'), ('id', 'DESC')]

    def get_hours_worked(self, name):
        if self.clock_in and self.clock_out:
            return round((self.clock_out - self.clock_in).total_seconds()
                / 3600, 4)
        return None

    def get_rec_name(self, name):
        return '%s @ %s' % (self.employee.rec_name, self.clock_in)

    @classmethod
    def validate(cls, times):
        super().validate(times)
        for time in times:
            if time.clock_out and time.clock_out < time.clock_in:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_clock_out_before_in'))
