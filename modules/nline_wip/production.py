# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime as dt
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import ModelView, Workflow, fields
from trytond.model.exceptions import AccessError
from trytond.modules.account.exceptions import PeriodNotFoundError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval, TimeDelta
from trytond.transaction import Transaction

DURATION_DOMAIN = ['OR',
    ('{}', '=', None),
    ('{}', '>=', TimeDelta()),
    ]


def duration_domain(name):
    return [c if isinstance(c, str) else (name,) + c[1:]
        for c in DURATION_DOMAIN]


class RoutingStep(metaclass=PoolMeta):
    __name__ = 'production.routing.step'
    setup_duration = fields.TimeDelta(
        "Setup", domain=duration_domain('setup_duration'),
        help="The planned setup time of the operation.")
    run_duration = fields.TimeDelta(
        "Run per Unit", domain=duration_domain('run_duration'),
        help="The planned run time of the operation for each unit of the BOM "
        "output.")

    def get_work(self, production, work_center_picker):
        work = super().get_work(production, work_center_picker)
        work.planned_duration = self.compute_planned_duration(production)
        return work

    def compute_planned_duration(self, production):
        "Return the planned duration of the step for the production"
        if self.setup_duration is None and self.run_duration is None:
            return None
        if production.bom and production.product:
            factor = production.bom.compute_factor(
                production.product, production.quantity or 0,
                production.unit)
        else:
            factor = production.quantity or 0
        duration = self.setup_duration or dt.timedelta()
        if self.run_duration:
            duration += self.run_duration * factor
        return duration


class Work(metaclass=PoolMeta):
    __name__ = 'production.work'
    planned_duration = fields.TimeDelta(
        "Planned Duration", domain=duration_domain('planned_duration'),
        states={
            'readonly': Eval('state').in_(['finished', 'done']),
            },
        help="The time charged when the work is finished without cycles: "
        "setup plus run time from the routing.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._buttons.update({
                'finish': {
                    'invisible': Eval('state').in_(
                        ['request', 'finished', 'done']),
                    'depends': ['state'],
                    },
                })

    @classmethod
    @ModelView.button
    def finish(cls, works):
        """Finish the works: stop the running cycles and, for a work without
        cycle, record one cycle of the planned duration"""
        pool = Pool()
        Cycle = pool.get('production.work.cycle')
        to_do, to_create = [], []
        for work in works:
            running = [c for c in work.cycles if c.state == 'running']
            if running:
                to_do.extend(running)
            elif not any(c.state == 'done' for c in work.cycles):
                to_create.append(Cycle(
                        work=work,
                        duration=work.planned_duration or dt.timedelta()))
        Cycle.save(to_create)
        Cycle.run(to_create)
        to_do.extend(to_create)
        Cycle.do(to_do)


class WorkCycle(metaclass=PoolMeta):
    __name__ = 'production.work.cycle'

    @classmethod
    @ModelView.button
    @Workflow.transition('done')
    def do(cls, cycles):
        pool = Pool()
        AccountMove = pool.get('account.move')
        super().do(cycles)
        moves = []
        for cycle in cycles:
            move = cycle.get_account_move()
            if move:
                moves.append(move)
        AccountMove.save(moves)
        AccountMove.post(moves)

    def get_account_move(self):
        "Return the account move charging the cost of the cycle to WIP"
        pool = Pool()
        AccountMove = pool.get('account.move')
        AccountMoveLine = pool.get('account.move.line')
        Configuration = pool.get('account.configuration')
        Period = pool.get('account.period')
        Date = pool.get('ir.date')

        if not self.cost:
            return
        company = self.work.company
        configuration = Configuration(1)
        wip = configuration.get_multivalue(
            'production_wip_account', company=company.id)
        applied = configuration.get_multivalue(
            'production_applied_cost_account', company=company.id)
        if not wip or not applied:
            return
        with Transaction().set_context(company=company.id):
            date = Date.today()
        try:
            period = Period.find(company, date=date)
        except PeriodNotFoundError:
            return
        if not period.fiscalyear.account_stock_method:
            return
        amount = company.currency.round(self.cost)
        if not amount:
            return
        debit, credit = (amount, Decimal(0)) if amount > 0 else (
            Decimal(0), -amount)
        lines = [
            AccountMoveLine(account=wip, debit=debit, credit=credit),
            AccountMoveLine(account=applied, debit=credit, credit=debit),
            ]
        journal = configuration.get_multivalue(
            'stock_journal', company=company.id)
        return AccountMove(
            journal=journal,
            period=period,
            date=date,
            origin=self,
            description=self.work.rec_name,
            lines=lines,
            )


class Production(metaclass=PoolMeta):
    __name__ = 'production'

    @classmethod
    @ModelView.button
    @Workflow.transition('done')
    def done(cls, productions):
        pool = Pool()
        Move = pool.get('stock.move')
        for production in productions:
            for move in production.inputs:
                if (move.wip_source and move.state != 'cancelled'
                        and move.wip_source.state != 'done'):
                    raise AccessError(gettext(
                            'nline_wip.msg_production_done_wip_source',
                            production=production.rec_name,
                            source=move.wip_source.production_output.rec_name))
        # Inputs from legs done after the production was run
        to_do = [m for p in productions for m in p.inputs
            if m.wip_source and m.state not in {'done', 'cancelled'}]
        for move in to_do:
            move.set_price_from_wip_source()
        Move.save(to_do)
        Move.do(to_do)
        super().done(productions)
        cls.pass_wip_cost(productions)

    @classmethod
    def pass_wip_cost(cls, productions):
        """Pass the cost of the outputs to the inputs they supply and do the
        inputs of running productions"""
        pool = Pool()
        Move = pool.get('stock.move')
        to_save, to_do = [], []
        for production in productions:
            for output in production.outputs:
                if output.state != 'done':
                    continue
                for target in output.wip_targets:
                    if target.state in {'done', 'cancelled'}:
                        continue
                    target.set_price_from_wip_source()
                    to_save.append(target)
                    parent = target.production_input
                    if parent and parent.state == 'running':
                        to_do.append(target)
        Move.save(to_save)
        Move.do(to_do)
