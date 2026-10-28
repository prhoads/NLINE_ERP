# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Employees (SHOPFLOOR_DIRECT_EMPLOYEE) on Tryton's employees, and
their clock in / clock out (time and attendance, SHOPFLOOR_EMPLOYEE_TIME)."""
import datetime

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.model.exceptions import AccessError, ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.transaction import Transaction

from .resource import cost_field

# Jobshop's Phone / Mobile / E-mail: the party's contact mechanisms
CONTACTS = {'phone': 'phone', 'mobile': 'mobile', 'email': 'email'}


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
    # Jobshop's Employee tab: the person's name, address and phones, kept on
    # the employee's party (Tryton's person) and shown on the employee
    employee_name = fields.Function(fields.Char("Name"),
        'get_party_field', setter='set_party_field')
    addr_1 = fields.Function(fields.Char("Address"),
        'get_party_field', setter='set_party_field')
    addr_2 = fields.Function(fields.Char("Address 2"),
        'get_party_field', setter='set_party_field')
    city = fields.Function(fields.Char("City"),
        'get_party_field', setter='set_party_field')
    state = fields.Function(fields.Char("State"),
        'get_party_field', setter='set_party_field')
    postal_code = fields.Function(fields.Char("Postal Code"),
        'get_party_field', setter='set_party_field')
    country = fields.Function(fields.Char("Country"),
        'get_party_field', setter='set_party_field')
    addr_etc = fields.Function(fields.Char("Etc."),
        'get_party_field', setter='set_party_field')
    phone = fields.Function(fields.Char("Phone"),
        'get_party_field', setter='set_party_field')
    mobile = fields.Function(fields.Char("Mobile"),
        'get_party_field', setter='set_party_field')
    email = fields.Function(fields.Char("E-mail"),
        'get_party_field', setter='set_party_field')
    # Calendars tab: the employee's own week and exceptions
    calendar_weeks = fields.One2Many('nline.js.calendar.week', 'employee',
        "Employee Calendar")
    calendar_changes = fields.One2Many('nline.js.calendar.change',
        'employee', "Employee Calendar Exceptions")

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

    @classmethod
    def create(cls, vlist):
        """Jobshop's Employees window makes the person with the employee:
        a new employee without a party gets one of its Name (or clock no)"""
        Party = Pool().get('party.party')
        vlist = [dict(v) for v in vlist]
        for values in vlist:
            if not values.get('party'):
                name = (values.get('employee_name') or values.get('clock_no')
                    or '').strip()
                if name:
                    party, = Party.create([{'name': name}])
                    values['party'] = party.id
        return super().create(vlist)

    def _address(self):
        addresses = self.party.addresses if self.party else []
        return addresses[0] if addresses else None

    def _contact(self, type_):
        for mechanism in (self.party.contact_mechanisms if self.party
                else []):
            if mechanism.type == type_:
                return mechanism
        return None

    def get_party_field(self, name):
        if not self.party:
            return None
        if name == 'employee_name':
            return self.party.name
        if name in CONTACTS:
            mechanism = self._contact(CONTACTS[name])
            return mechanism.value if mechanism else None
        address = self._address()
        if not address:
            return None
        lines = (address.street or '').split('\n')
        if name == 'addr_1':
            return lines[0] or None
        if name == 'addr_2':
            return '\n'.join(lines[1:]) or None
        if name == 'state':
            return address.subdivision.code.split('-')[-1] \
                if address.subdivision else None
        if name == 'country':
            return address.country.name if address.country else None
        if name == 'addr_etc':
            return address.name
        return getattr(address, name)

    @classmethod
    def set_party_field(cls, employees, name, value):
        "Write the value on the employee's person (party, address, contact)"
        pool = Pool()
        Party = pool.get('party.party')
        Address = pool.get('party.address')
        Mechanism = pool.get('party.contact_mechanism')
        Country = pool.get('country.country')
        Subdivision = pool.get('country.subdivision')
        value = (value or '').strip() or None
        for employee in employees:
            party = employee.party
            if not party:
                continue
            if name == 'employee_name':
                if value and value != party.name:
                    Party.write([party], {'name': value})
                continue
            if name in CONTACTS:
                mechanism = employee._contact(CONTACTS[name])
                if mechanism and not value:
                    Mechanism.delete([mechanism])
                elif mechanism:
                    Mechanism.write([mechanism], {'value': value})
                elif value:
                    Mechanism.create([{'party': party.id,
                                'type': CONTACTS[name], 'value': value}])
                continue
            address = employee._address()
            if not address:
                if not value:
                    continue
                address, = Address.create([{'party': party.id}])
            lines = (address.street or '').split('\n')
            if name == 'addr_1':
                lines[0] = value or ''
                values = {'street': '\n'.join(lines).strip('\n') or None}
            elif name == 'addr_2':
                values = {'street': '\n'.join(
                        [lines[0]] + ([value] if value else [])) or None}
            elif name == 'country':
                countries = Country.search(['OR',
                        ('name', 'ilike', value),
                        ('code', '=', (value or '').upper()),
                        ], limit=1) if value else []
                values = {'country': countries[0].id if countries else None}
            elif name == 'state':
                domain = [('code', 'like', '%%-%s' % (value or '').upper())]
                if address.country:
                    domain.append(('country', '=', address.country.id))
                states = Subdivision.search(domain, limit=1) \
                    if value else []
                values = {'subdivision': states[0].id if states else None}
            elif name == 'addr_etc':
                values = {'name': value}
            else:
                values = {name: value}
            Address.write([address], values)

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
    approved_date = fields.DateTime("Approved On", readonly=True)
    exported = fields.Boolean("Exported",
        help="The ticket was sent to the payroll (Jobshop's Posted).")
    exported_date = fields.Date("Exported Date", readonly=True)
    transaction_date = fields.Function(fields.Date("Transaction Date"),
        'get_transaction_date')
    notes = fields.Text("Notes")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('clock_in', 'DESC'), ('id', 'DESC')]

    @classmethod
    def default_approved(cls):
        return False

    @classmethod
    def default_exported(cls):
        return False

    def get_transaction_date(self, name):
        "Jobshop dates a ticket when it is complete (clocked out)"
        return self.clock_out.date() if self.clock_out else None

    @classmethod
    def approve(cls, times):
        "Tools > Approve Ticket(s): by the user, now"
        user = Transaction().user
        cls.write([t for t in times if t.clock_out and not t.approved], {
                'approved': True, 'approved_by': user,
                'approved_date': datetime.datetime.now(),
                })

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
