# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop labor transactions (SHOPFLOOR_LABOR_TRAN): Labor Entry, Labor
Reversal and the Labor Data Collection terminal.

A ticket on a work order operation is saved as a done work cycle of the
operation (production.work.cycle) carrying the ticket's cost, so the work
order's cost and work in process are Tryton's.  Jobshop's costing
(Posting_Setup_Labor, Posting_Run_Labor, Costing_Variables):

- labor = (cost/hr x hours + cost/unit x completed qty) x shift multiplier
  x labor allocation %; the employee's rates, the resource's when the
  employee has none;
- burden = burden/hr x hours + burden/unit x completed qty + burden % x
  labor / 100 + the fixed burden on the first ticket of the operation.

Tickets of the terminal live through active (in progress), suspended and
posted (post on save) before they are saved; a saved ticket is changed only
by reversing it."""
import datetime as dt
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, fields
from trytond.model.exceptions import AccessError, ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction

from .resource import COST_DIGITS

ZERO = Decimal(0)
MULTIPLIERS = {
    'regular': Decimal(1),
    'overtime': Decimal('1.5'),
    'double': Decimal(2),
    'triple': Decimal(3),
    }
OPEN_STATES = {'waiting', 'assigned', 'running'}


def dec(value):
    return Decimal(str(value or 0))


class LaborTicket(ModelSQL, ModelView):
    "Labor Transaction"
    __name__ = 'nline.js.labor_ticket'
    company = fields.Many2One('company.company', "Company", required=True)
    employee = fields.Many2One('company.employee', "Employee",
        ondelete='RESTRICT',
        domain=[('company', '=', Eval('company', -1))])
    shift_no = fields.Integer("Shift #")
    shift_type = fields.Selection([
            ('regular', "Regular"),
            ('overtime', "Overtime"),
            ('double', "Double"),
            ('triple', "Triple"),
            ], "Shift Type", required=True)
    type = fields.Selection([
            ('setup', "Setup"),
            ('run', "Run"),
            ('indirect', "Indirect"),
            ], "Transaction Type", required=True)
    production = fields.Many2One('production', "Work Order",
        ondelete='RESTRICT')
    work = fields.Many2One('production.work', "Operation",
        ondelete='RESTRICT',
        domain=[('production', '=', Eval('production', -1))])
    resource = fields.Many2One('production.work.center', "Resource",
        ondelete='RESTRICT')
    transaction_date = fields.DateTime("Transaction Date")
    clock_in = fields.DateTime("Clock In")
    clock_out = fields.DateTime("Clock Out")
    hours_worked = fields.Float("Hours Worked")
    labor_percent = fields.Float("Labor Allocation %")
    completed_qty = fields.Float("Completed Qty")
    deviated_qty = fields.Float("Deviated Qty")
    reason_code = fields.Many2One('nline.reason_code', "Reason Code",
        ondelete='RESTRICT')
    description = fields.Text("Description")
    completed = fields.Boolean("Completed",
        help="The setup or the run of the operation is complete.")
    state = fields.Selection([
            ('active', "In Progress"),
            ('suspended', "Suspended"),
            ('posted', "Post on Save"),
            ('saved', "Saved"),
            ], "State", required=True, readonly=True)
    reversing = fields.Boolean("Reversing", readonly=True,
        help="This ticket reverses a previous one.")
    reversal_of = fields.Many2One('nline.js.labor_ticket', "Reverses",
        readonly=True, ondelete='RESTRICT')
    reversed = fields.Function(fields.Boolean("Reversed"), 'get_reversed')
    cycle = fields.Many2One('production.work.cycle', "Work Cycle",
        readonly=True, ondelete='SET NULL')
    multiplier = fields.Numeric("Multiplier", digits=(16, 3), readonly=True)
    cost_per_hr = fields.Numeric("Cost/Hr", digits=COST_DIGITS,
        readonly=True)
    cost_per_unit = fields.Numeric("Cost/Unit", digits=COST_DIGITS,
        readonly=True)
    burden_per_hr = fields.Numeric("Burden/Hr", digits=COST_DIGITS,
        readonly=True)
    burden_per_unit = fields.Numeric("Burden/Unit", digits=COST_DIGITS,
        readonly=True)
    burden_percent = fields.Numeric("Burden %", digits=COST_DIGITS,
        readonly=True)
    burden_per_oper = fields.Numeric("Burden/Operation", digits=COST_DIGITS,
        readonly=True)
    labor_cost = fields.Numeric("Labor Cost", digits=COST_DIGITS,
        readonly=True)
    burden_cost = fields.Numeric("Burden Cost", digits=COST_DIGITS,
        readonly=True)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('transaction_date', 'DESC NULLS FIRST'),
            ('id', 'DESC')]

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    @classmethod
    def default_shift_type(cls):
        return 'regular'

    @classmethod
    def default_type(cls):
        return 'run'

    @classmethod
    def default_labor_percent(cls):
        return 100.0

    @classmethod
    def default_state(cls):
        return 'active'

    @classmethod
    def default_completed(cls):
        return False

    @classmethod
    def default_reversing(cls):
        return False

    def get_rec_name(self, name):
        parts = [self.employee.clock_no or self.employee.rec_name
            if self.employee else '']
        if self.production:
            parts.append(self.production.rec_name)
        if self.work:
            parts.append(str(self.work.sequence or ''))
        parts.append(self.type)
        return ' '.join(p for p in parts if p)

    @classmethod
    def get_reversed(cls, tickets, name):
        reversals = cls.search([
                ('reversal_of', 'in', [t.id for t in tickets]),
                ])
        done = {r.reversal_of.id for r in reversals}
        return {t.id: t.id in done for t in tickets}

    @classmethod
    def validate(cls, tickets):
        super().validate(tickets)
        for ticket in tickets:
            if ticket.reversing:
                continue
            if (ticket.deviated_qty or 0) > 0 and not ticket.reason_code:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_deviated_reason'))
            if ticket.type != 'indirect' and ticket.state != 'suspended' \
                    and not ticket.work:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_ticket_operation'))
            if ticket.clock_in and ticket.clock_out \
                    and ticket.clock_out < ticket.clock_in:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_clock_out_before_in'))

    @classmethod
    def delete(cls, tickets):
        # A saved ticket is only reversed (Labor Entry > Labor Reversal)
        for ticket in tickets:
            if ticket.state == 'saved':
                raise AccessError(gettext(
                        'nline_js_shopfloor.msg_ticket_delete_saved',
                        ticket=ticket.rec_name))
        Cycle = Pool().get('production.work.cycle')
        Cycle.cancel([t.cycle for t in tickets
                if t.cycle and t.cycle.state in {'draft', 'running'}])
        super().delete(tickets)

    # ---- the operation --------------------------------------------------

    def set_operation(self, work):
        "Take the work order and resource of the operation"
        self.work = work
        if work:
            self.production = work.production
            if not getattr(self, 'resource', None):
                self.resource = work.work_center

    def check_open(self):
        "Labor goes only to open (firm or released) work orders"
        if self.production and self.production.state not in OPEN_STATES:
            raise ValidationError(gettext(
                    'nline_desk.msg_work_order_not_open',
                    production=self.production.rec_name))

    def compute_hours(self):
        if self.hours_worked is None and self.clock_in and self.clock_out:
            self.hours_worked = round(
                (self.clock_out - self.clock_in).total_seconds() / 3600, 4)

    # ---- costing ---------------------------------------------------------

    def first_on_operation(self):
        "Whether no saved ticket of the operation carries the fixed burden"
        if not self.work:
            return False
        others = self.search([
                ('work', '=', self.work.id),
                ('state', '=', 'saved'),
                ('reversing', '=', False),
                ('id', '!=', self.id or -1),
                ('burden_per_oper', '!=', 0),
                ])
        reversed_ = {o.id for o in others if o.reversed}
        return not [o for o in others if o.id not in reversed_]

    def compute_cost(self):
        """Set the rates and the labor and burden costs of the ticket;
        return whether Jobshop rates were found (else Tryton's work center
        rate costs the cycle)"""
        step = self.type
        employee, resource = self.employee, self.resource
        rates = resource.js_rates(step) if resource else {}
        hours = dec(self.hours_worked)
        quantity = dec(self.completed_qty) if step == 'run' else ZERO
        self.multiplier = MULTIPLIERS.get(self.shift_type, Decimal(1))
        self.cost_per_hr = (employee.labor_rate(step) if employee else ZERO
            ) or rates.get('labor_per_hr') or ZERO
        self.cost_per_unit = ((employee.cost_per_unit if employee else ZERO)
            or rates.get('labor_per_unit') or ZERO) if step == 'run' else ZERO
        burden_hr = rates.get('burden_per_hr') or ZERO
        burden_unit = rates.get('burden_per_unit') or ZERO
        burden_percent = rates.get('burden_percent') or ZERO
        if employee and not (burden_hr or burden_unit or burden_percent):
            if step == 'setup':
                burden_hr = employee.bur_per_hr_setup or ZERO
                burden_percent = employee.bur_percent_setup or ZERO
            elif step == 'run':
                burden_hr = employee.bur_per_hr_run or ZERO
                burden_unit = employee.bur_per_unit_run or ZERO
                burden_percent = employee.bur_percent_run or ZERO
        self.burden_per_hr = burden_hr
        self.burden_per_unit = burden_unit
        self.burden_percent = burden_percent
        fixed = rates.get('burden_per_oper') or ZERO
        self.burden_per_oper = fixed if fixed and self.first_on_operation() \
            else ZERO
        allocation = dec(self.labor_percent if self.labor_percent is not None
            else 100) / 100
        labor = ((self.cost_per_hr * hours + self.cost_per_unit * quantity)
            * self.multiplier * allocation)
        burden = (self.burden_per_hr * hours + self.burden_per_unit * quantity
            + self.burden_percent * labor / 100 + self.burden_per_oper)
        quant = Decimal(10) ** -COST_DIGITS[1]
        self.labor_cost = labor.quantize(quant)
        self.burden_cost = burden.quantize(quant)
        return bool(self.labor_cost or self.burden_cost or any(
                rates.get(k) for k in rates)) or bool(
            employee and (employee.labor_rate(step)
                or employee.cost_per_unit))

    # ---- the terminal: start, post, save ----------------------------------

    @classmethod
    def start(cls, tickets):
        "Clock in: the operation's cycle runs"
        pool = Pool()
        Cycle = pool.get('production.work.cycle')
        now = dt.datetime.now()
        cycles = []
        for ticket in tickets:
            ticket.check_open()
            ticket.state = 'active'
            if not ticket.clock_in:
                ticket.clock_in = now
            ticket.clock_out = None
            ticket.hours_worked = None
            if not ticket.transaction_date:
                ticket.transaction_date = ticket.clock_in
            if ticket.work and not ticket.cycle:
                cycle = Cycle(work=ticket.work)
                cycles.append((ticket, cycle))
        Cycle.save([c for _, c in cycles])
        Cycle.run([c for _, c in cycles])
        for ticket, cycle in cycles:
            ticket.cycle = cycle
            if ticket.employee:
                cycle.run_by = ticket.employee
        Cycle.save([c for _, c in cycles])
        cls.save(tickets)

    @classmethod
    def post(cls, tickets):
        "Clock out: the ticket waits for the Save (post on save)"
        now = dt.datetime.now()
        for ticket in tickets:
            if not ticket.clock_out:
                ticket.clock_out = now
            if ticket.clock_in and ticket.clock_out < ticket.clock_in:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_clock_out_before_in'))
            ticket.compute_hours()
            ticket.state = 'posted'
        cls.save(tickets)

    @classmethod
    def save_tickets(cls, tickets):
        """Save the posted tickets to the database: costed, the work
        cycle of the operation done"""
        pool = Pool()
        Cycle = pool.get('production.work.cycle')
        now = dt.datetime.now()
        to_run, to_do = [], []
        for ticket in tickets:
            if ticket.state == 'saved':
                continue
            if ticket.type == 'indirect':
                ticket.production = ticket.work = None
            ticket.check_open()
            ticket.compute_hours()
            if ticket.hours_worked is None:
                ticket.hours_worked = 0
            if not ticket.transaction_date:
                ticket.transaction_date = ticket.clock_in or now
            jobshop = ticket.compute_cost()
            ticket.state = 'saved'
            if not ticket.work:
                continue
            cycle = ticket.cycle
            if not cycle or cycle.state not in {'draft', 'running'}:
                cycle = Cycle(work=ticket.work)
                cycle.save()
                to_run.append(cycle)
            elif cycle.state == 'draft':
                to_run.append(cycle)
            cycle.duration = dt.timedelta(hours=ticket.hours_worked or 0)
            cycle.cost = (ticket.labor_cost + ticket.burden_cost
                if jobshop else None)
            ticket.cycle = cycle
            to_do.append((ticket, cycle))
        cls.save(tickets)
        Cycle.run(to_run)
        Cycle.save([c for _, c in to_do])
        Cycle.do([c for _, c in to_do])
        for ticket, cycle in to_do:
            if ticket.employee:
                cycle.run_by = cycle.done_by = ticket.employee
            if cycle.cost is not None and not (
                    ticket.labor_cost or ticket.burden_cost):
                # Costed at the work center rate (Tryton): the ticket shows it
                ticket.labor_cost = cycle.cost
        Cycle.save([c for _, c in to_do])
        cls.save([t for t, _ in to_do])

    @classmethod
    def reverse(cls, tickets):
        """Reverse saved tickets: a reversing ticket with the opposite hours,
        quantities and costs, and a cycle of the opposite cost"""
        pool = Pool()
        Cycle = pool.get('production.work.cycle')
        reversals, cycles = [], []
        for ticket in tickets:
            if ticket.state != 'saved' or ticket.reversing or ticket.reversed:
                continue
            ticket.check_open()
            reversal, = cls.copy([ticket], {
                    'reversing': True,
                    'reversal_of': ticket.id,
                    'state': 'saved',
                    'cycle': None,
                    'transaction_date': dt.datetime.now(),
                    'hours_worked': -(ticket.hours_worked or 0),
                    'completed_qty': -(ticket.completed_qty or 0),
                    'deviated_qty': -(ticket.deviated_qty or 0),
                    'completed': False,
                    'labor_cost': -(ticket.labor_cost or ZERO),
                    'burden_cost': -(ticket.burden_cost or ZERO),
                    })
            reversals.append(reversal)
            if ticket.cycle and ticket.cycle.state == 'done' and \
                    ticket.cycle.cost:
                cycle = Cycle(work=ticket.cycle.work,
                    duration=dt.timedelta(), cost=-ticket.cycle.cost)
                cycles.append((reversal, cycle))
        Cycle.save([c for _, c in cycles])
        Cycle.run([c for _, c in cycles])
        Cycle.do([c for _, c in cycles])
        for reversal, cycle in cycles:
            reversal.cycle = cycle
        cls.save([r for r, _ in cycles])
        return reversals


class Work(metaclass=PoolMeta):
    "Operation"
    __name__ = 'production.work'
    labor_tickets = fields.One2Many('nline.js.labor_ticket', 'work',
        "Labor Tickets", readonly=True)
    setup_completed = fields.Function(fields.Boolean("Setup Completed"),
        'get_labor')
    run_completed = fields.Function(fields.Boolean("Run Completed"),
        'get_labor')
    completed_quantity = fields.Function(fields.Float("Completed Qty"),
        'get_labor')
    deviated_quantity = fields.Function(fields.Float("Deviated Qty"),
        'get_labor')
    setup_hours = fields.Function(fields.Float("Actual Setup Hours"),
        'get_labor')
    run_hours = fields.Function(fields.Float("Actual Run Hours"),
        'get_labor')
    operation_quantity = fields.Function(fields.Float("Operation Qty"),
        'get_labor')
    operation_closed = fields.Function(fields.Boolean("Operation Closed",
            help="Closed by labor: the run reported complete, or the "
            "completed quantity reaches the work order quantity."),
        'get_labor')

    @classmethod
    def get_labor(cls, works, names):
        result = {n: {} for n in names}
        for work in works:
            tickets = [t for t in work.labor_tickets if t.state == 'saved']
            # A reversed ticket and its reversal cancel out
            values = {
                'setup_completed': any(t.completed and t.type == 'setup'
                    and not t.reversed for t in tickets),
                'run_completed': any(t.completed and t.type == 'run'
                    and not t.reversed for t in tickets),
                'completed_quantity': sum((t.completed_qty or 0)
                    for t in tickets if t.type == 'run'),
                'deviated_quantity': sum((t.deviated_qty or 0)
                    for t in tickets),
                'setup_hours': sum((t.hours_worked or 0) for t in tickets
                    if t.type == 'setup'),
                'run_hours': sum((t.hours_worked or 0) for t in tickets
                    if t.type == 'run'),
                'operation_quantity': work.production.quantity
                if work.production else None,
                }
            values['operation_closed'] = values['run_completed'] or bool(
                values['operation_quantity']
                and values['completed_quantity']
                >= values['operation_quantity'])
            for name in names:
                result[name][work.id] = values[name]
        return result
