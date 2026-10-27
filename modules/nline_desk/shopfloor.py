# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""N-Line screens: Jobshop shop floor (UI upgrade phase 5)

The Work Order window's information and costs (Show Costs), Labor Entry
(a work cycle of the operation with its hours, costed at the work center's
rate) and its reversal, Material Issues (inputs issued to the work order,
a partial quantity split from the rest), Work Order Receipts (the finished
quantity received to stock) and the engineering master's cost rollup.
"""
import datetime as dt
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC

from .desk import accept_warnings

ZERO = Decimal(0)
CENT = Decimal('0.01')


class DeskShopfloor(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['labor_entry', 'labor_cancel', 'issue_material',
                'work_order_receive', 'work_order_explode']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['work_order_info', 'open_work_orders', 'bom_costs',
                'master_info']:
            cls.__rpc__[name] = RPC()

    @classmethod
    def open_work_orders(cls, states=None):
        "Return the open work orders for the shop floor screens"
        cls._check_read('production')
        Production = Pool().get('production')
        states = states or ['waiting', 'assigned', 'running']
        return [{
                'id': p.id,
                'number': p.number or str(p.id),
                'product': p.product.rec_name if p.product else '',
                'quantity': p.quantity,
                'unit': p.unit.rec_name if p.unit else '',
                'state': p.state,
                'planned_date': p.planned_date,
                } for p in Production.search([('state', 'in', states)],
                order=[('planned_date', 'ASC'), ('id', 'ASC')])]

    @classmethod
    def work_order_info(cls, production):
        """Return the work order's operations with their labor, materials,
        outputs and costs (estimated and actual)"""
        cls._check_read('production')
        Production = Pool().get('production')
        production = Production(production)
        works = []
        labor_cost = ZERO
        for work in getattr(production, 'works', []) or []:
            hours = sum((c.duration.total_seconds() / 3600
                    for c in work.cycles
                    if c.state == 'done' and c.duration), 0.0)
            cost = sum((c.cost or ZERO for c in work.cycles
                    if c.state == 'done'), ZERO)
            labor_cost += cost
            works.append({
                    'id': work.id,
                    'name': work.rec_name,
                    'work_center': work.work_center.rec_name
                    if work.work_center else '',
                    'state': work.state,
                    'hours': round(hours, 2),
                    'cost': cost,
                    'cycles': [{
                            'id': c.id,
                            'state': c.state,
                            'hours': round(c.duration.total_seconds() / 3600,
                                2) if c.duration else None,
                            'cost': c.cost,
                            'by': (c.done_by or c.run_by).rec_name
                            if (c.done_by or c.run_by) else '',
                            } for c in work.cycles],
                    })

        def move_cost(move):
            price = (move.cost_price if move.state == 'done'
                and getattr(move, 'cost_price', None) is not None
                else move.product.cost_price) or ZERO
            return (price * Decimal(str(move.quantity))).quantize(CENT)

        materials = [{
                'id': m.id,
                'product': m.product.rec_name,
                'quantity': m.quantity,
                'unit': m.unit.rec_name,
                'state': m.state,
                'from': m.from_location.rec_name,
                'cost': move_cost(m),
                } for m in production.inputs]
        outputs = [{
                'id': m.id,
                'product': m.product.rec_name,
                'quantity': m.quantity,
                'unit': m.unit.rec_name,
                'state': m.state,
                'to': m.to_location.rec_name,
                } for m in production.outputs]
        material_estimated = sum((m['cost'] for m in materials), ZERO)
        material_actual = sum((m['cost'] for m in materials
                if m['state'] == 'done'), ZERO)
        return {
            'id': production.id,
            'number': production.number or str(production.id),
            'state': production.state,
            'product': production.product.rec_name
            if production.product else '',
            'quantity': production.quantity,
            'unit': production.unit.rec_name if production.unit else '',
            'planned_date': production.planned_date,
            'planned_start_date': production.planned_start_date,
            'origin': production.origin.rec_name if production.origin
            else '',
            'works': works,
            'materials': materials,
            'outputs': outputs,
            'costs': {
                'material_estimated': material_estimated,
                'material_actual': material_actual,
                'labor_actual': labor_cost,
                'total_actual': material_actual + labor_cost,
                'production_cost': getattr(production, 'cost', None),
                },
            }

    @classmethod
    @accept_warnings
    def labor_entry(cls, values):
        """Post a labor ticket: the hours of an operation as a done work
        cycle, costed at its work center's rate
        values: work, hours"""
        cls._check_create('production.work.cycle')
        pool = Pool()
        Work = pool.get('production.work')
        Cycle = pool.get('production.work.cycle')
        work = Work(values['work'])
        hours = float(values.get('hours') or 0)
        if hours <= 0:
            raise ValidationError(gettext('nline_desk.msg_labor_hours'))
        if work.production.state not in {'waiting', 'assigned', 'running'}:
            raise ValidationError(gettext(
                    'nline_desk.msg_work_order_not_open',
                    production=work.production.rec_name))
        cycle = Cycle(work=work)
        cycle.save()
        Cycle.run([cycle])
        cycle = Cycle(cycle.id)
        cycle.duration = dt.timedelta(hours=hours)
        cycle.save()
        Cycle.do([cycle])
        cycle = Cycle(cycle.id)
        return {'id': cycle.id, 'cost': cycle.cost, 'hours': hours}

    @classmethod
    def labor_cancel(cls, cycle):
        "Cancel a labor ticket not done yet"
        Cycle = Pool().get('production.work.cycle')
        cls._check_create('production.work.cycle')
        Cycle.cancel([Cycle(cycle)])
        return True

    @classmethod
    @accept_warnings
    def issue_material(cls, values):
        """Issue materials to their work orders (the input moves done); a
        partial quantity is split from the rest, which stays to issue
        values: lines (move, quantity)"""
        cls._check_create('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        to_do = []
        for data in values['lines']:
            move = Move(data['move'])
            quantity = float(data.get('quantity') or 0)
            if quantity <= 0 or move.state in {'done', 'cancelled'}:
                continue
            if quantity < move.quantity:
                Move.copy([move], {
                        'quantity': move.quantity - quantity,
                        })
                move.quantity = quantity
                move.save()
            to_do.append(move)
        if not to_do:
            raise ValidationError(gettext('nline_desk.msg_nothing_issued'))
        Move.assign_try(to_do)
        Move.do(to_do)
        return {'moves': len(to_do)}

    @classmethod
    @accept_warnings
    def work_order_receive(cls, values):
        """Receive the finished work order to stock: started if needed
        (its remaining materials issued), then done
        values: production"""
        cls._check_create('stock.move')
        Production = Pool().get('production')
        production = Production(values['production'])
        if production.state in {'request', 'draft'}:
            raise ValidationError(gettext(
                    'nline_desk.msg_work_order_not_open',
                    production=production.rec_name))
        if production.state == 'waiting':
            Production.assign_try([production])
            production = Production(production.id)
        if production.state == 'assigned':
            Production.run([production])
            production = Production(production.id)
        if production.state == 'running':
            Production.done([production])
        production = Production(production.id)
        return {'id': production.id, 'state': production.state}

    @classmethod
    def work_order_explode(cls, production):
        """Create the materials and output of a draft work order from its
        master (when the window created it)"""
        cls._check_create('stock.move')
        Production = Pool().get('production')
        production = Production(production)
        if production.state in {'request', 'draft'} and not (
                production.inputs or production.outputs):
            Production.set_moves([production])
        return True

    @classmethod
    def master_info(cls, bom):
        """The engineering master's part and operations (Jobshop's master
        window: the part it makes, the routing steps in sequence)"""
        cls._check_read('production.bom')
        pool = Pool()
        BOM = pool.get('production.bom')
        ProductBom = pool.get('product.product-production.bom')
        bom = BOM(bom)
        parts = [{'id': o.product.id, 'code': o.product.code,
                'name': o.product.template.name,
                'current': o.product.template.engineering_revision
                if hasattr(o.product.template, 'engineering_revision')
                else None}
            for o in bom.outputs]
        links = ProductBom.search([('bom', '=', bom.id)])
        routing = next((l.routing for l in links if l.routing), None)
        steps = []
        if routing:
            for step in sorted(routing.steps,
                    key=lambda s: (s.sequence or 0, s.id)):
                service = getattr(step, 'service', None)
                supplier = getattr(step, 'supplier', None)
                setup = getattr(step, 'setup_duration', None)
                run = getattr(step, 'run_duration', None)
                steps.append({
                        'sequence': step.sequence,
                        'operation': step.operation.rec_name,
                        'setup': round(setup.total_seconds() / 3600, 2)
                        if setup else None,
                        'run': round(run.total_seconds() / 3600, 2)
                        if run else None,
                        'service': service.rec_name if service else None,
                        'supplier': supplier.rec_name if supplier else None,
                        'materials': [{
                                'product': i.product.rec_name,
                                'quantity': i.quantity,
                                'unit': i.unit.rec_name,
                                'piece': getattr(i, 'piece', None)}
                            for i in bom.inputs
                            if getattr(i, 'operation', None) == step.sequence],
                        })
        return {'parts': parts, 'routing': routing.rec_name
            if routing else None, 'steps': steps}

    @classmethod
    def bom_costs(cls, bom, quantity=1):
        """The engineering master's cost rollup (Show Costs): its materials
        at their cost, the fabricated ones through their own master"""
        cls._check_read('production.bom')
        pool = Pool()
        BOM = pool.get('production.bom')
        rows = []

        def walk(bom, quantity, level, seen):
            output = sum(o.quantity for o in bom.outputs) or 1
            total = ZERO
            for line in bom.inputs:
                qty = line.quantity * quantity / output
                product = line.product
                sub = None
                get_bom = getattr(product, 'get_bom', None)
                product_bom = get_bom() if get_bom else (
                    product.boms[0] if product.boms else None)
                if product_bom and product_bom.bom and \
                        product_bom.bom.id not in seen:
                    sub = product_bom.bom
                index = len(rows)
                rows.append({
                        'level': level,
                        'product': product.rec_name,
                        'quantity': round(qty, 4),
                        'unit': line.unit.rec_name,
                        'unit_cost': product.cost_price or ZERO,
                        'cost': ZERO,
                        'fabricated': bool(sub),
                        })
                if sub:
                    cost = walk(sub, qty, level + 1, seen | {sub.id})
                else:
                    cost = ((product.cost_price or ZERO)
                        * Decimal(str(qty))).quantize(CENT)
                rows[index]['cost'] = cost
                total += cost
            return total

        bom = BOM(bom)
        total = walk(bom, quantity, 0, {bom.id})
        return {
            'bom': bom.rec_name,
            'quantity': quantity,
            'total': total,
            'rows': rows,
            }
