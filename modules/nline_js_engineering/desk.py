# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The desk's calls of the Jobshop Engineering and Estimating windows

The Work Order, Engineering Master and Quote Master windows share the
information cards of their Details tab: the card tree (eng_tree), the
operation and material dialogs (eng_operation / eng_operation_save,
eng_material / eng_material_save), legs (eng_leg_add), delete, Change
Status, the indented costs (Show Costs), material availability, supply and
demand, the inventory and labor transactions, the sales order links,
variables, co-products, scheduling, labor tickets and purchasing.

Every call checks the user's rights on the records it reads or changes
first; the screens only offer what the user may do.
"""
import ast
import datetime as dt
import math
import operator
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.modules.nline_desk.desk import accept_warnings
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .engineering import (
    HEADER_COPY, MATERIAL_FIELDS, OPERATION_FIELDS, run_hours_per_piece)

ZERO = Decimal(0)
CENT = Decimal('0.01')
OPEN = {'request', 'draft', 'waiting', 'assigned', 'running'}
WRITES = [
    'eng_work_order_ready', 'eng_operation_save', 'eng_material_save',
    'eng_leg_add', 'eng_card_delete', 'eng_change_status',
    'eng_master_ready', 'eng_master_copy', 'eng_work_order_copy',
    'eng_variables_save', 'eng_coproducts_save', 'eng_schedule',
    'eng_start_labor', 'eng_purchase', 'eng_printed', 'eng_quote_win',
    'eng_quote_lose', 'eng_quote_copy', 'eng_quote_printed',
    'eng_quote_save', 'eng_resequence',
    ]
READS = [
    'eng_tree', 'eng_operation', 'eng_material', 'eng_costs', 'eng_header',
    'eng_po_links',
    'eng_availability', 'eng_supply_demand', 'eng_transactions',
    'eng_sales_links', 'eng_variables', 'eng_coproducts', 'eng_employees',
    'eng_quote_cost', 'eng_quote_get', 'eng_party_address',
    ]


def _hours(delta):
    return delta.total_seconds() / 3600 if delta else 0.0


def _dec(value):
    if value is None or value == '':
        return None
    return Decimal(str(value))


def _float(value):
    if value is None or value == '':
        return None
    return float(value)


def _id(value):
    if isinstance(value, dict):
        value = value.get('id')
    return int(value) if value not in (None, '', False) else None


def _record_value(record, name):
    value = getattr(record, name, None)
    if hasattr(value, 'id') and hasattr(value, '__name__'):
        return {'id': value.id, 'rec_name': value.rec_name}
    if isinstance(value, Decimal):
        return float(value)
    return value


# A small calculator for the material dimensions (Jobshop's variables):
# numbers, variable names and + - * / ** ( )
_OPERATORS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
    }


def evaluate(expression, variables):
    "Return the value of the dimensions expression with the variables"
    names = {k.upper(): v for k, v in variables.items()}

    def walk(node):
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and isinstance(
                node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Name):
            if node.id.upper() not in names:
                raise ValueError(node.id)
            return float(names[node.id.upper()] or 0)
        if isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
            return _OPERATORS[type(node.op)](walk(node.left), walk(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPERATORS:
            return _OPERATORS[type(node.op)](walk(node.operand))
        raise ValueError(expression)
    return walk(ast.parse(expression, mode='eval'))


class Desk(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in WRITES:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in READS:
            cls.__rpc__[name] = RPC()

    @classmethod
    def _eng_error(cls, message, **kwargs):
        raise ValidationError(gettext(
                'nline_js_engineering.' + message, **kwargs))

    # ---- The card tree -----------------------------------------------------

    @classmethod
    def eng_tree(cls, kind, record):
        """The information cards of a work order ('production') or a master
        ('bom'): the header, its operations, materials and legs"""
        pool = Pool()
        if kind == 'production':
            cls._check_read('production')
            Production = pool.get('production')
            tree, = Production.get_build_tree([Production(record)])
            return tree
        cls._check_read('production.bom')
        BOM = pool.get('production.bom')
        bom = BOM(record)
        return cls._master_node(bom, bom.desired_quantity or 1, set(), None)

    @classmethod
    def _master_node(cls, bom, quantity, seen, card):
        part = bom.part
        output = sum(o.quantity for o in bom.outputs
            if part and o.product == part) or 1
        factor = quantity / output
        routing = bom.routing
        steps = sorted(routing.steps, key=lambda s: (s.sequence or 0, s.id)) \
            if routing else []
        node = {
            'kind': 'bom',
            'id': bom.id,
            'bom_id': bom.id,
            'master_type': bom.master_type,
            'number': bom.name,
            'job': False,
            'product': part.rec_name if part else None,
            'product_id': part.id if part else None,
            'template_id': part.template.id if part else None,
            'description': bom.description or (
                part.template.name if part else None),
            'revision': bom.revision,
            'quantity': quantity,
            'unit': part.default_uom.symbol if part else None,
            'state': 'draft',
            'order_status': 'inactive' if not bom.active else None,
            'private': bom.private,
            'routing_id': routing.id if routing else None,
            'drawing_number': bom.drawing_number,
            'drawing_file': bom.drawing_file,
            'has_specs': bool(bom.specifications),
            'shortage': False,
            'cost': None,
            'origin': None,
            'sale_id': None,
            'works': [cls._step_node(s, quantity) for s in steps],
            'cards': [],
            }
        for line in bom.inputs:
            product = line.product
            master = None
            if product.producible and hasattr(product, 'get_bom'):
                master = product.get_bom(line.component_revision)
            qty = line.quantity * factor
            leg = None
            if (line.leg_detail and master and master.bom
                    and master.bom.id not in seen | {bom.id}
                    and len(seen) < 10):
                leg = cls._master_node(master.bom, qty, seen | {bom.id},
                    line)
            node['cards'].append({
                    'kind': 'input',
                    'id': line.id,
                    'operation': line.operation,
                    'piece': line.piece,
                    'product': product.rec_name,
                    'product_id': product.id,
                    'template_id': product.template.id,
                    'description': product.template.name,
                    'revision': line.component_revision,
                    'quantity': round(qty, 4),
                    'unit': line.unit.symbol,
                    'supply': 'leg' if leg else 'stock',
                    'state': 'draft',
                    'short': False,
                    'producible': bool(product.producible and product.boms),
                    'master_bom_id': master.bom.id if master else None,
                    'job': None,
                    'leg': leg,
                    'leg_detail': line.leg_detail,
                    'drawing_file': line.drawing_file,
                    'has_specs': bool(line.specifications),
                    'supplier': (line.supplier.rec_name
                        if line.supplier else None),
                    'reference': line.reference,
                    })
        return node

    @classmethod
    def _step_node(cls, step, quantity):
        setup = _hours(getattr(step, 'setup_duration', None))
        run = _hours(getattr(step, 'run_duration', None))
        supplier = getattr(step, 'supplier', None)
        service = getattr(step, 'service', None)
        return {
            'kind': 'step',
            'id': None,
            'step_id': step.id,
            'routing_id': step.routing.id,
            'sequence': step.sequence,
            'operation': step.operation.rec_name,
            'description': step.description,
            'work_center': step.resource.rec_name if step.resource else None,
            'work_center_id': step.resource.id if step.resource else None,
            'purchase_id': None,
            'state': 'request',
            'planned_duration': setup + run * quantity if (setup or run)
            else None,
            'setup_hours': setup or None,
            'run': step.run,
            'run_type': step.run_type,
            'cost': None,
            'outside': bool(supplier),
            'supplier': supplier.rec_name if supplier else None,
            'service': service.rec_name if service else None,
            'purchase': None,
            'expected_date': None,
            'drawing_file': step.drawing_file,
            'has_specs': bool(step.specifications),
            'resources': len(step.extra_resources),
            }

    # ---- Rights and edit helpers -------------------------------------------

    @classmethod
    def _editable_bom(cls, bom):
        cls._check_write('production.bom')
        if bom.private:
            cls._eng_error('msg_master_private', master=bom.rec_name)

    @classmethod
    def _editable_production(cls, production, states=('request', 'draft',
                'waiting')):
        cls._check_write('production')
        if production.state not in states:
            cls._eng_error('msg_work_order_not_editable',
                work_order=production.rec_name)

    @classmethod
    def _bom_routing(cls, bom):
        "The routing of the master, made when it has none"
        pool = Pool()
        Routing = pool.get('production.routing')
        ProductBom = pool.get('product.product-production.bom')
        if bom.routing:
            return bom.routing
        routing = Routing(name=('%s Rev %s' % (bom.name, bom.revision or '')
                if bom.revision else bom.name)[:100], boms=[bom])
        routing.save()
        links = ProductBom.search([('bom', '=', bom.id)])
        for link in links:
            link.routing = routing
        ProductBom.save(links)
        return routing

    @classmethod
    def _own_routing(cls, production):
        """The routing of a work order not released, its own copy when the
        master or other work orders share it: Jobshop copies the master into
        the work order, a change to the order does not change the master"""
        pool = Pool()
        Routing = pool.get('production.routing')
        Production = pool.get('production')
        routing = production.routing
        name = ('%s' % (production.number or production.id))[:100]
        if routing:
            shared = not routing.work_order or bool(Production.search([
                        ('routing', '=', routing.id),
                        ('id', '!=', production.id),
                        ], limit=1))
            if not shared:
                return routing
            routing, = Routing.copy([routing], {
                    'name': name,
                    'work_order': True,
                    })
        else:
            routing = Routing(name=name, work_order=True,
                boms=[production.bom] if production.bom else [])
            routing.save()
        values = {'routing': routing.id}
        if not production.work_center:
            center = cls._work_center(production, routing)
            values['work_center'] = center.id if center else None
        Production.write([production], values)
        return Routing(routing.id)

    @classmethod
    def _works_to_routing(cls, production):
        """Keep the operations of a released work order as its own routing
        before it goes back to Unreleased (Tryton deletes the works)"""
        pool = Pool()
        Routing = pool.get('production.routing')
        Step = pool.get('production.routing.step')
        Production = pool.get('production')
        if not production.works:
            return
        routing = Routing(name=('%s' % (production.number
                    or production.id))[:100], work_order=True,
            boms=[production.bom] if production.bom else [])
        routing.save()
        steps = []
        for work in production.works:
            step = Step(routing=routing, operation=work.operation,
                sequence=work.sequence, description=work.description,
                resource=work.work_center, template=work.template)
            for name in OPERATION_FIELDS:
                setattr(step, name, getattr(work, name))
            if hasattr(Step, 'setup_duration'):
                step.setup_duration = work.setup_duration
                step.run_duration = work.run_duration
            if getattr(work, 'routing_step', None):
                for name in ['supplier', 'service', 'service_supplier',
                        'service_quantity']:
                    if hasattr(Step, name):
                        setattr(step, name, getattr(work.routing_step, name))
            step.extra_resources = [
                r.copy_to_work() for r in work.extra_resources]
            steps.append(step)
        Step.save(steps)
        Production.write([production], {'routing': routing.id})

    @classmethod
    def _work_center(cls, production, routing=None):
        "The work center of a work order with operations"
        WorkCenter = Pool().get('production.work.center')
        for step in (routing.steps if routing else []):
            if step.resource:
                return step.resource
        centers = WorkCenter.search([
                ('warehouse', '=', production.warehouse.id),
                ], order=[('parent', 'ASC NULLS FIRST'), ('id', 'ASC')],
            limit=1) if production.warehouse else []
        return centers[0] if centers else None

    @classmethod
    def _routing_operation(cls, values):
        "The routing operation of a Jobshop operation (named as its resource)"
        pool = Pool()
        Operation = pool.get('production.routing.operation')
        WorkCenter = pool.get('production.work.center')
        Template = pool.get('nline.engineering.operation_template')
        if _id(values.get('operation')):
            return Operation(_id(values['operation']))
        template = _id(values.get('template'))
        if template and Template(template).operation:
            return Template(template).operation
        resource = _id(values.get('resource'))
        name = (WorkCenter(resource).name if resource
            else values.get('description')) or 'Operation'
        name = name[:60]
        operations = Operation.search([('name', '=', name)], limit=1)
        if operations:
            return operations[0]
        operation = Operation(name=name)
        operation.save()
        return operation

    # ---- Operations --------------------------------------------------------

    @classmethod
    def eng_operation(cls, kind, record):
        """The values of an operation for its window: kind 'step' (a master's
        or an unreleased work order's), 'work' (a released work order's) or
        'template'"""
        pool = Pool()
        Model = pool.get({
                'step': 'production.routing.step',
                'work': 'production.work',
                'template': 'nline.engineering.operation_template',
                }[kind])
        cls._check_read(Model.__name__)
        op = Model(record)
        values = {name: _record_value(op, name) for name in OPERATION_FIELDS}
        values.update({
                'id': op.id,
                'kind': kind,
                'description': op.description,
                'template': _record_value(op, 'template')
                if kind != 'template' else None,
                'operation': _record_value(op, 'operation'),
                'setup_hours': op.setup_hours if kind == 'template' else
                _hours(getattr(op, 'setup_duration', None)),
                'run_duration': _hours(getattr(op, 'run_duration', None)),
                'resources': [{
                        'id': r.id,
                        'resource': _record_value(r, 'resource'),
                        'step_type': r.step_type,
                        'duration_percent': r.duration_percent,
                        'justification': r.justification,
                        } for r in op.extra_resources],
                })
        if kind == 'template':
            values['resource'] = _record_value(op, 'resource')
            values['code'] = op.code
            values['service'] = _record_value(op, 'service')
            values['supplier'] = _record_value(op, 'supplier')
            values['special_instructions'] = op.special_instructions
        elif kind == 'step':
            values['sequence'] = op.sequence
            values['resource'] = _record_value(op, 'resource')
            values['service'] = _record_value(op, 'service')
            values['supplier'] = _record_value(op, 'supplier')
        else:
            values['sequence'] = op.sequence
            values['resource'] = _record_value(op, 'work_center')
            step = getattr(op, 'routing_step', None)
            values['service'] = _record_value(step, 'service') \
                if step else None
            values['supplier'] = _record_value(step, 'supplier') \
                if step else None
            values['state'] = op.state
            values['planned_hours'] = _hours(op.planned_duration)
        if values['run'] is None and values['run_duration']:
            values['run'] = values['run_duration']
        return values

    @classmethod
    def _set_operation(cls, op, values, quantity_factor=None):
        "Write the window's values on a step, a work or a template"
        pool = Pool()
        Resource = pool.get('nline.engineering.operation_resource')
        WorkCenter = pool.get('production.work.center')
        Product = pool.get('product.product')
        Party = pool.get('party.party')
        Template = pool.get('nline.engineering.operation_template')
        decimals = {n for n in OPERATION_FIELDS
            if n.endswith(('_hour', '_unit', '_operation'))}
        floats = {'run', 'load_size', 'move_hours', 'minimum_move_qty',
            'scrap_percent', 'fixed_scrap', 'override_start_qty',
            'override_end_qty', 'setup_burden_percent', 'run_burden_percent'}
        ints = {'transit_days', 'minimum_capacity', 'maximum_capacity'}
        for name in OPERATION_FIELDS:
            if name not in values:
                continue
            value = values[name]
            if name in decimals:
                value = _dec(value)
            elif name in floats:
                value = _float(value)
            elif name in ints:
                value = int(value) if value not in (None, '') else None
            elif name == 'preserved':
                value = bool(value)
            setattr(op, name, value)
        if 'description' in values:
            op.description = values['description'] or None
        if 'template' in values and hasattr(op, 'template'):
            template = _id(values['template'])
            op.template = Template(template) if template else None
        resource = _id(values.get('resource'))
        if 'resource' in values:
            if op.__name__ == 'production.work':
                if resource:
                    op.work_center = WorkCenter(resource)
            else:
                op.resource = WorkCenter(resource) if resource else None
        for name, Model in [('service', Product), ('supplier', Party)]:
            if name in values and hasattr(op.__class__, name) and \
                    op.__name__ != 'production.work':
                value = _id(values[name])
                setattr(op, name, Model(value) if value else None)
        if op.__name__ == 'production.routing.step' and getattr(
                op, 'service', None) and hasattr(op, 'service_quantity'):
            op.service_quantity = getattr(
                op, 'service_quantity', None) or 1
        if 'setup_hours' in values or 'run' in values:
            setup = _float(values.get('setup_hours')) or 0.0
            run = run_hours_per_piece(getattr(op, 'run_type', None),
                getattr(op, 'run', None) or 0.0,
                getattr(op, 'load_size', None))
            if op.__name__ == 'nline.engineering.operation_template':
                op.setup_hours = setup or None
            else:
                op.setup_duration = (dt.timedelta(hours=setup)
                    if setup else None)
                op.run_duration = dt.timedelta(hours=run) if run else None
            if (op.__name__ == 'production.work'
                    and quantity_factor is not None):
                total = setup + run * quantity_factor
                op.planned_duration = dt.timedelta(hours=total) \
                    if total else None
        if 'resources' in values:
            existing = {r.id: r
                for r in getattr(op, 'extra_resources', [])}
            keep = []
            for row in values['resources'] or []:
                if not _id(row.get('resource')):
                    continue
                line = existing.get(_id(row.get('id'))) or Resource()
                line.resource = WorkCenter(_id(row['resource']))
                line.step_type = row.get('step_type') or 'both'
                line.duration_percent = _float(row.get('duration_percent'))
                line.justification = row.get('justification') or 'start'
                keep.append(line)
            op.extra_resources = keep
        return op

    @classmethod
    def eng_operation_save(cls, parent_kind, parent, record, values):
        """Add (record None) or change an operation of a master ('bom') or a
        work order ('production'); return the new tree"""
        pool = Pool()
        Step = pool.get('production.routing.step')
        Work = pool.get('production.work')
        if parent_kind == 'bom':
            BOM = pool.get('production.bom')
            bom = BOM(parent)
            cls._editable_bom(bom)
            cls._check_write('production.routing')
            routing = cls._bom_routing(bom)
            op = Step(record) if record else Step(routing=routing)
            factor = None
        else:
            Production = pool.get('production')
            production = Production(parent)
            cls._editable_production(production, states=OPEN)
            if production.works or production.state in {
                    'waiting', 'assigned', 'running'}:
                cls._check_write('production.work')
                op = Work(record) if record else Work(
                    production=production, company=production.company,
                    state='draft')
                op.work_center = op.work_center if record else (
                    production.work_center)
                factor = production.quantity or 0
                if production.bom and production.product:
                    factor = production.bom.compute_factor(
                        production.product, production.quantity or 0,
                        production.unit)
            else:
                cls._check_write('production.routing')
                routing = cls._own_routing(production)
                if record:
                    old = Step(record)
                    # The step of the copied routing with the same place
                    if old.routing != routing:
                        record = next((s.id for s in routing.steps
                                if s.sequence == old.sequence
                                and s.operation == old.operation), None)
                op = Step(record) if record else Step(routing=routing)
                factor = None
        if not record or 'operation' in values or 'resource' in values or \
                'template' in values:
            op.operation = cls._routing_operation(values)
        if values.get('sequence') not in (None, ''):
            op.sequence = int(values['sequence'])
        elif not record:
            siblings = (op.routing.steps if op.__name__ ==
                'production.routing.step' else op.production.works)
            op.sequence = max((s.sequence or 0 for s in siblings
                    if s.id != op.id), default=0) + 10
        cls._set_operation(op, values, factor)
        op.save()
        return cls.eng_tree(parent_kind, parent)

    # ---- Materials ---------------------------------------------------------

    @classmethod
    def eng_material(cls, kind, record):
        """The values of a material for its window: kind 'input' (a master's)
        or 'card' (a work order's)"""
        pool = Pool()
        Model = pool.get('production.bom.input' if kind == 'input'
            else 'production.material_card')
        cls._check_read(Model.__name__)
        line = Model(record)
        values = {name: _record_value(line, name) for name in MATERIAL_FIELDS}
        values.update({
                'id': line.id,
                'kind': kind,
                'product': _record_value(line, 'product'),
                'quantity': line.quantity,
                'unit': _record_value(line, 'unit'),
                'operation': line.operation,
                'piece': line.piece,
                'component_revision': line.component_revision,
                'cost_price': float(line.product.cost_price or 0),
                })
        if kind == 'input':
            values['leg_detail'] = line.leg_detail
        else:
            values['state'] = line.state
            values['supply'] = line.supply
        return values

    @classmethod
    def _set_material(cls, line, values):
        pool = Pool()
        Party = pool.get('party.party')
        floats = {'fixed_quantity', 'scrap_percent'}
        decimals = {'unit_cost', 'fixed_cost'}
        for name in MATERIAL_FIELDS:
            if name not in values:
                continue
            value = values[name]
            if name in floats:
                value = _float(value)
            elif name in decimals:
                value = _dec(value)
            elif name == 'supplier':
                value = Party(_id(value)) if _id(value) else None
            elif name == 'required_date':
                value = dt.date.fromisoformat(value[:10]) if isinstance(
                    value, str) and value else value or None
            elif isinstance(value, str):
                value = value or None
            setattr(line, name, value)
        for name in ['operation', 'piece']:
            if name in values:
                setattr(line, name, int(values[name])
                    if values[name] not in (None, '') else None)
        if 'component_revision' in values:
            line.component_revision = values['component_revision'] or None

    @classmethod
    def eng_material_save(cls, parent_kind, parent, record, values):
        """Add (record None) or change a material of a master ('bom') or a
        work order ('production'); values may hold 'lines' to add several
        materials at once (Add Materials); return the new tree"""
        pool = Pool()
        Product = pool.get('product.product')
        Uom = pool.get('product.uom')
        rows = values.get('lines') or [values]
        if parent_kind == 'bom':
            BOM = pool.get('production.bom')
            Input = pool.get('production.bom.input')
            bom = BOM(parent)
            cls._editable_bom(bom)
            cls._check_write('production.bom.input')
            for row in rows:
                line = Input(record) if record else Input(bom=bom)
                if _id(row.get('product')):
                    line.product = Product(_id(row['product']))
                if not record or 'unit' in row:
                    unit = _id(row.get('unit'))
                    line.unit = Uom(unit) if unit else line.product.default_uom
                if row.get('quantity') not in (None, ''):
                    line.quantity = float(row['quantity'])
                elif not record:
                    line.quantity = 1
                if 'leg_detail' in row:
                    line.leg_detail = bool(row['leg_detail'])
                cls._default_place(line, bom.inputs, row, record)
                cls._set_material(line, row)
                line.save()
            return cls.eng_tree('bom', parent)
        Production = pool.get('production')
        Card = pool.get('production.material_card')
        production = Production(parent)
        cls._editable_production(production)
        cls._check_write('production.material_card')
        for row in rows:
            if record:
                card = Card(record)
                move = card.move
                if row.get('quantity') not in (None, '') and \
                        move.state in {'draft', 'staging'}:
                    move.quantity = float(row['quantity'])
                if _id(row.get('unit')) and move.state in {'draft', 'staging'}:
                    move.unit = Uom(_id(row['unit']))
                move.save()
            else:
                cls._check_create('stock.move')
                product = Product(_id(row['product']))
                unit = Uom(_id(row['unit'])) if _id(row.get('unit')) \
                    else product.default_uom
                move = production._move('input', product, unit,
                    float(row.get('quantity') or 1))
                move.unit_price_required = \
                    move.on_change_with_unit_price_required()
                move.save()
                Production.sync_material_cards([production])
                card, = Card.search([('move', '=', move.id)])
            cls._default_place(card, production.material_cards, row, record)
            cls._set_material(card, row)
            card.save()
        return cls.eng_tree('production', parent)

    @staticmethod
    def _default_place(line, siblings, row, record):
        "A new material goes on the last operation, after its last piece"
        if record:
            return
        if row.get('operation') in (None, ''):
            operations = [s.operation for s in siblings if s.operation]
            row['operation'] = max(operations, default=10)
        if row.get('piece') in (None, ''):
            pieces = [s.piece or 0 for s in siblings
                if s.operation == int(row['operation']) and s != line]
            row['piece'] = max(pieces, default=0) + 10

    # ---- Legs ---------------------------------------------------------------

    @classmethod
    def eng_leg_add(cls, parent_kind, parent, values):
        """Add Leg/Detail: a fabricated part made in a leg of the work order
        (a child work order from its master) or of the master (a material
        made from the part's master, pinned to its revision)"""
        pool = Pool()
        Product = pool.get('product.product')
        ProductBom = pool.get('product.product-production.bom')
        product = Product(_id(values['product']))
        link = ProductBom(_id(values['product_bom'])) if _id(
            values.get('product_bom')) else product.get_bom()
        if not link or link.product != product:
            cls._eng_error('msg_no_master', part=product.rec_name)
        row = {
            'product': product.id,
            'quantity': values.get('quantity') or 1,
            'operation': values.get('operation'),
            'piece': values.get('piece'),
            }
        if parent_kind == 'bom':
            row['leg_detail'] = True
            row['component_revision'] = (link.bom.revision
                if link.bom.revision != product.engineering_revision
                else None)
            return cls.eng_material_save('bom', parent, None, row)
        cls._check_create('production')
        Card = pool.get('production.material_card')
        Production = pool.get('production')
        before = {c.id for c in Production(parent).material_cards}
        cls.eng_material_save('production', parent, None, row)
        card, = [c for c in Production(parent).material_cards
            if c.id not in before]
        card.create_leg(link)
        root = Card(card.id).production.root or Production(parent)
        return cls.eng_tree('production', root.id)

    # ---- Delete -------------------------------------------------------------

    @classmethod
    def eng_card_delete(cls, kind, record, parent_kind=None, parent=None):
        """Delete an information card of a master ('bom') or a work order
        ('production'): 'step', 'work', 'input', 'card' (its input move too)
        or 'leg' (the leg of a material card)"""
        pool = Pool()
        if kind == 'step':
            Step = pool.get('production.routing.step')
            step = Step(record)
            if parent_kind == 'production':
                Production = pool.get('production')
                production = Production(parent)
                cls._editable_production(production)
                routing = cls._own_routing(production)
                step = next((s for s in routing.steps
                        if s.sequence == step.sequence
                        and s.operation == step.operation), None)
            else:
                BOM = pool.get('production.bom')
                cls._editable_bom(BOM(parent))
            if step:
                Step.delete([step])
        elif kind == 'work':
            Work = pool.get('production.work')
            cls._check_write('production.work')
            Work.delete([Work(record)])
        elif kind == 'input':
            Input = pool.get('production.bom.input')
            line = Input(record)
            cls._editable_bom(line.bom)
            Input.delete([line])
        elif kind == 'card':
            Card = pool.get('production.material_card')
            Move = pool.get('stock.move')
            card = Card(record)
            cls._editable_production(card.production)
            cls._check_write('production.material_card')
            move = card.move
            if move.state not in {'draft', 'staging', 'cancelled'}:
                cls._eng_error('msg_material_issued',
                    material=card.rec_name)
            Card.delete([card])
            Move.delete([move])
        elif kind == 'leg':
            Card = pool.get('production.material_card')
            cls._check_write('production.material_card')
            Card.remove_leg([Card(record)])
        return True

    # ---- Change Status -----------------------------------------------------

    @classmethod
    @accept_warnings
    def eng_change_status(cls, values):
        """Jobshop's Change Status of a card: a work order or a leg (with its
        legs), an operation or a material
        values: kind ('production', 'work', 'card'), id, status"""
        pool = Pool()
        kind, status = values['kind'], values['status']
        if kind == 'production':
            Production = pool.get('production')
            production = Production(values['id'])
            cls._check_write('production')
            cls._production_status(production, status)
            return True
        if kind == 'work':
            Work = pool.get('production.work')
            work = Work(values['id'])
            cls._check_write('production.work')
            if status == 'closed' and hasattr(Work, 'finish'):
                Work.finish([work])
            elif status == 'cancelled':
                Work.delete([work])
            return True
        Card = pool.get('production.material_card')
        Move = pool.get('stock.move')
        card = Card(values['id'])
        cls._check_write('production.material_card')
        cls._check_create('stock.move')
        move = card.move
        if status == 'closed' and move.state in {'draft', 'staging',
                'assigned'}:
            Move.assign_try([move])
            Move.do([move])
        elif status == 'cancelled' and move.state not in {'done'}:
            Move.cancel([move])
        return True

    @classmethod
    def _production_status(cls, production, status):
        Production = Pool().get('production')
        legs = [l for l in production.legs
            if l.state not in {'done', 'cancelled'}]
        if status in {'unreleased', 'firm', 'hold'}:
            if production.state == 'done':
                cls._eng_error('msg_reopen_closed',
                    work_order=production.rec_name)
            if production.state in {'waiting', 'assigned', 'running'}:
                cls._works_to_routing(production)
                production = Production(production.id)
                if production.state in {'assigned', 'running'}:
                    Production.wait([production])
                Production.draft([production])
            elif production.state in {'request', 'cancelled'}:
                Production.draft([production])
            Production.write([production], {
                    'planning_status': None if status == 'unreleased'
                    else status,
                    })
            for leg in legs:
                cls._production_status(Production(leg.id), status)
        elif status == 'released':
            if production.state in {'request', 'cancelled'}:
                Production.draft([production])
            if Production(production.id).state == 'draft':
                Production.wait([production])
        elif status == 'closed':
            for leg in legs:
                cls._production_status(Production(leg.id), status)
            production = Production(production.id)
            if production.state in {'request', 'cancelled'}:
                Production.draft([production])
            if Production(production.id).state == 'draft':
                Production.wait([production])
            production = Production(production.id)
            if production.state == 'waiting':
                Production.assign_try([production])
                production = Production(production.id)
                if production.state == 'waiting':
                    # Jobshop closes a work order short of material too
                    Production.assign([production])
            production = Production(production.id)
            if production.state == 'assigned':
                Production.run([production])
            production = Production(production.id)
            if production.state == 'running':
                # Closing the order finishes its operations (nline_wip)
                Work = Pool().get('production.work')
                works = [w for w in production.works
                    if w.state not in {'finished', 'done'}]
                if works and hasattr(Work, 'finish'):
                    Work.finish(works)
                Production.done([Production(production.id)])
        elif status == 'cancelled':
            if production.state not in {'done', 'cancelled'}:
                if production.state == 'running':
                    cls._eng_error('msg_cancel_started',
                        work_order=production.rec_name)
                if production.state == 'assigned':
                    Production.wait([production])
                Production.cancel([Production(production.id)])

    # ---- Work orders --------------------------------------------------------

    @classmethod
    def eng_work_order_ready(cls, production):
        """Complete a work order saved in the window: its master (the part's
        current one) and routing, its materials and output, and the legs of
        the master's Leg/Detail materials"""
        pool = Pool()
        Production = pool.get('production')
        cls._check_create('stock.move')
        production = Production(production)
        if production.state not in {'request', 'draft'}:
            return True
        values = {}
        bom = production.bom
        if production.product and not bom:
            link = production.product.get_bom() if hasattr(
                production.product, 'get_bom') else None
            if link:
                bom = link.bom
                values['bom'] = bom.id
                if getattr(link, 'routing', None):
                    values['routing'] = link.routing.id
        if bom and not production.routing and not values.get('routing') \
                and bom.routing:
            values['routing'] = bom.routing.id
        if values.get('routing') and not production.work_center:
            center = cls._work_center(production,
                pool.get('production.routing')(values['routing']))
            values['work_center'] = center.id if center else None
        if bom and not (production.inputs or production.outputs):
            # A new work order: the master's header (Jobshop copies the
            # master into the work order), where the window left it empty
            for name in HEADER_COPY:
                value = getattr(bom, name, None)
                if value not in (None, '', False) and getattr(
                        production, name, None) in (None, '', False):
                    values[name] = getattr(value, 'id', value)
            if bom.global_rank and production.global_rank in (None, 50):
                values['global_rank'] = bom.global_rank
            if bom.description and not values.get('description') and (
                    not production.description or (production.product and
                        production.description
                        == production.product.template.name)):
                values['description'] = bom.description
        if values:
            Production.write([production], values)
            production = Production(production.id)
        if not (production.inputs or production.outputs):
            Production.set_moves([production])
            production = Production(production.id)
            cls._make_legs(production)
        return True

    @classmethod
    def _make_legs(cls, production, depth=0):
        "Make the legs of the master's Leg/Detail materials"
        if depth > 8:
            return
        for card in production.material_cards:
            line = card.bom_input
            if not line or not line.leg_detail or card.supply != 'stock':
                continue
            link = card.product.get_bom(card.component_revision) if hasattr(
                card.product, 'get_bom') else None
            if link:
                leg = card.create_leg(link)
                cls._make_legs(leg, depth + 1)

    @classmethod
    def eng_work_order_copy(cls, production):
        """Copying Into a New Work Order: the part, master, quantity, header
        and operations of the work order, its materials from the master and
        its legs as they are; return the new work order's id"""
        pool = Pool()
        Production = pool.get('production')
        cls._check_create('production', 'stock.move')
        source = Production(production)
        new, = Production.copy([source], {
                'number': None,
                'origin': None,
                'parent': None,
                'leg_index': None,
                'inputs': None,
                'outputs': None,
                })
        Production.set_moves([new])
        cls._copy_legs(source, Production(new.id))
        return new.id

    @classmethod
    def _copy_legs(cls, source, target, depth=0):
        if depth > 8:
            return
        pool = Pool()
        Production = pool.get('production')
        ProductBom = pool.get('product.product-production.bom')
        free = [c for c in target.material_cards if c.supply == 'stock']
        for card in source.material_cards:
            leg = card.leg
            if not leg or not leg.bom:
                continue
            match = next((c for c in free if c.product == card.product
                    and c.operation == card.operation
                    and c.piece == card.piece), None) or next(
                (c for c in free if c.product == card.product), None)
            links = ProductBom.search([('product', '=', leg.product.id),
                    ('bom', '=', leg.bom.id)], limit=1)
            if not match or not links:
                continue
            free.remove(match)
            new_leg = match.create_leg(links[0])
            cls._copy_legs(leg, Production(new_leg.id), depth + 1)

    @classmethod
    def eng_printed(cls, production):
        "The traveler was printed: Jobshop's Printed Date"
        pool = Pool()
        Production = pool.get('production')
        cls._check_read('production')
        with Transaction().set_context(_check_access=False):
            Production.write([Production(production)],
                {'printed_date': dt.datetime.now()})
        return True

    @classmethod
    def eng_schedule(cls, production, forward=None):
        """Schedule Work Order: its start from its want date and operation
        hours (8 hour days, working days, plus the transit days), or its
        want date from its start with the forward schedule"""
        pool = Pool()
        Production = pool.get('production')
        Date = pool.get('ir.date')
        cls._check_write('production')
        production = Production(production)
        forward = production.forward_schedule if forward is None else forward
        hours, transit = 0.0, 0
        if production.works:
            for work in production.works:
                hours += _hours(work.planned_duration)
                transit += work.transit_days or 0
        elif production.routing:
            for step in production.routing.steps:
                duration = step.compute_planned_duration(production) \
                    if hasattr(step, 'compute_planned_duration') else None
                hours += _hours(duration)
                transit += step.transit_days or 0
        days = max(1, math.ceil(hours / 8)) + transit

        def shift(date, count, sign):
            while count > 0:
                date += dt.timedelta(days=sign)
                if date.weekday() < 5:
                    count -= 1
            return date
        today = Date.today()
        release = production.planned_start_date
        want = production.planned_date
        if forward or not want:
            # From the release date (never in the past)
            start = max(release or today, today)
            finish = shift(start, days, 1)
        else:
            start = shift(want, days, -1)
            finish = want
            if start < today:
                # Jobshop schedules forward a start in the past
                start = today
                finish = max(want, shift(start, days, 1))
        if production.hard_release_date and release and start < release:
            # Treat Release Date as Hard: not before the release date
            start = release
            finish = max(finish, shift(start, days, 1))
        # Jobshop's Schedule Start / Finish Date: the release and want dates
        # are the user's and stay as they are
        Production.write([production], {
                'schedule_start_date': dt.datetime.combine(
                    start, dt.time(8)),
                'schedule_finish_date': dt.datetime.combine(
                    finish, dt.time(16)),
                })
        return {
            'hours': round(hours, 2),
            'days': days,
            'start': start,
            'finish': finish,
            'want': want,
            }

    # ---- Labor -------------------------------------------------------------

    @classmethod
    def eng_employees(cls):
        "The employees for Start Labor Ticket for Employee"
        pool = Pool()
        Employee = pool.get('company.employee')
        cls._check_read('company.employee')
        return [{'id': e.id, 'name': e.rec_name}
            for e in Employee.search([], order=[('id', 'ASC')])]

    @classmethod
    def eng_start_labor(cls, work, employee):
        """Start a labor ticket of the employee on the operation (a running
        work cycle); the work order is started first if needed"""
        pool = Pool()
        Work = pool.get('production.work')
        Cycle = pool.get('production.work.cycle')
        Production = pool.get('production')
        cls._check_create('production.work.cycle')
        work = Work(work)
        production = work.production
        if production.state not in {'waiting', 'assigned', 'running'}:
            cls._eng_error('msg_work_order_not_released',
                work_order=production.rec_name)
        if production.state == 'waiting':
            Production.assign_try([production])
            production = Production(production.id)
        if production.state == 'assigned':
            Production.run([production])
        cycle = Cycle(work=Work(work.id))
        cycle.save()
        with Transaction().set_context(employee=int(employee)):
            Cycle.run([cycle])
        return {'id': cycle.id}

    # ---- Purchasing --------------------------------------------------------

    @classmethod
    def eng_purchase(cls, kind, record):
        """Purchase this Material/Service: a draft purchase order of the
        material card (its supplier, or the part's) or of the outside
        operation; return the purchase id"""
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        Line = pool.get('purchase.line')
        Date = pool.get('ir.date')
        cls._check_create('purchase.purchase', 'purchase.line')
        if kind == 'work':
            Work = pool.get('production.work')
            work = Work(record)
            if getattr(work, 'purchase_line', None):
                return work.purchase_line.purchase.id
            if not getattr(work, 'outside', False):
                cls._eng_error('msg_not_outside', operation=work.rec_name)
            key = dict(work._group_outside_purchase_key())
            purchase = Purchase(purchase_date=Date.today(), **key)
            purchase.save()
            line = work.get_outside_purchase_line(purchase)
            line.save()
            work.purchase_line = line
            work.save()
            cls._eng_link(line, work.production, work.sequence, None,
                work=work, quantity=line.quantity)
            return purchase.id
        Card = pool.get('production.material_card')
        card = Card(record)
        product = card.product
        supplier = card.supplier or next(
            (ps.party for ps in getattr(product, 'product_suppliers', [])),
            None)
        if not supplier:
            cls._eng_error('msg_no_supplier', part=product.rec_name)
        production = card.production
        purchase = Purchase(company=production.company, party=supplier,
            warehouse=production.warehouse, purchase_date=Date.today())
        purchase.on_change_party()
        purchase.save()
        line = Line(purchase=purchase, product=product,
            quantity=card.quantity, unit=product.purchase_uom)
        line.on_change_product()
        line.quantity = card.quantity
        line.delivery_date = card.required_date or (
            production.planned_start_date)
        line.description = '%s - %s' % (product.rec_name,
            production.rec_name)
        line.save()
        cls._eng_link(line, production, card.operation, card.piece,
            quantity=card.quantity)
        return purchase.id

    @classmethod
    def _eng_link(cls, line, production, operation, piece, work=None,
            quantity=None):
        """Jobshop's ORDER_LINK of the purchase line to the work order (the
        purchasing area's nline.purchase.link, when it is installed)"""
        pool = Pool()
        try:
            Link = pool.get('nline.purchase.link')
        except KeyError:
            return
        values = {'purchase_line': line.id, 'production': production.id,
            'operation': operation, 'piece': piece, 'quantity': quantity}
        if work:
            values['work'] = work.id
        with Transaction().set_context(_check_access=False):
            Link.create([values])

    @classmethod
    def eng_po_links(cls, production, kind=None, record=None):
        """Purchase Order Links (View menu) of the work order and its legs,
        or of one material card / outside operation (kind 'card' / 'work'):
        the purchase lines that supply them"""
        pool = Pool()
        Production = pool.get('production')
        cls._check_read('production', 'purchase.purchase')
        root = Production(production)
        productions = Production.search([
                ('parent', 'child_of', [root.id], 'parent')])
        by_id = {p.id: p for p in productions}
        rows, seen = [], set()

        def add(line, production, operation, piece, quantity):
            purchase = line.purchase
            received = sum(m.quantity for m in line.moves
                if m.state == 'done')
            rows.append({
                    'purchase_id': purchase.id,
                    'purchase': purchase.number or purchase.rec_name,
                    'line': line.rec_name,
                    'line_no': (purchase.lines.index(line) + 1
                        if line in purchase.lines else None),
                    'supplier': purchase.party.rec_name,
                    'product': line.product.rec_name if line.product
                    else line.description,
                    'work_order': production.rec_name if production else '',
                    'operation': operation,
                    'piece': piece,
                    'order_qty': line.quantity,
                    'linked_qty': quantity,
                    'received_qty': received,
                    'unit': line.unit.symbol if line.unit else '',
                    'state': purchase.state,
                    })
        try:
            Link = pool.get('nline.purchase.link')
        except KeyError:
            Link = None
        if Link:
            for link in Link.search([
                        ('production', 'in', list(by_id)),
                        ], order=[('id', 'ASC')]):
                if kind == 'work' and (not link.work
                        or link.work.id != record):
                    continue
                if kind == 'card':
                    card = pool.get('production.material_card')(record)
                    if link.work or link.production != card.production or (
                            link.purchase_line.product
                            and link.purchase_line.product != card.product):
                        continue
                    if (link.operation, link.piece) != (
                            card.operation, card.piece) and any(
                            c.product == card.product and (c.operation,
                                c.piece) == (link.operation, link.piece)
                            for c in card.production.material_cards):
                        continue
                seen.add(link.purchase_line.id)
                add(link.purchase_line, link.production, link.operation,
                    link.piece, link.quantity)
        # The outside operations' own purchase lines (nline_outside_service)
        for p in productions:
            for work in p.works:
                line = getattr(work, 'purchase_line', None)
                if not line or line.id in seen or (
                        kind == 'card') or (kind == 'work'
                        and work.id != record):
                    continue
                seen.add(line.id)
                add(line, p, work.sequence, None, line.quantity)
        return rows

    @classmethod
    def eng_resequence(cls, kind, record, operation, step=10):
        """Resequence Materials for Operation: the piece numbers of the
        operation's materials 10, 20, 30... in their order"""
        pool = Pool()
        if kind == 'bom':
            BOM = pool.get('production.bom')
            bom = BOM(record)
            cls._editable_bom(bom)
            cls._check_write('production.bom.input')
            lines = [l for l in bom.inputs if l.operation == operation]
        else:
            Production = pool.get('production')
            production = Production(record)
            cls._editable_production(production)
            cls._check_write('production.material_card')
            lines = [c for c in production.material_cards
                if c.operation == operation]
        lines.sort(key=lambda l: (l.piece is None, l.piece or 0, l.id))
        for index, line in enumerate(lines, 1):
            if line.piece != index * step:
                line.piece = index * step
                line.save()
        return cls.eng_tree(kind, record)

    @classmethod
    def eng_header(cls, kind, record):
        """What the Jobshop header shows beside the fields: Created by,
        Last Modified by, the descriptions of the codes and the U/M, Linked
        and the master's revision of a work order"""
        pool = Pool()
        name = {
            'production': 'production',
            'bom': 'production.bom',
            'template': 'nline.engineering.operation_template',
            'quote': 'nline.quote',
            }[kind]
        Model = pool.get(name)
        cls._check_read(name)
        with Transaction().set_context(active_test=False):
            item = Model(record)

        def stamp(user, date):
            if not date:
                return ''
            return '%s %s' % (user.login if user else '',
                date.strftime('%m/%d/%Y %I:%M:%S %p'))
        result = {
            'created': stamp(item.create_uid, item.create_date),
            'modified': stamp(item.write_uid, item.write_date)
            if item.write_date else '',
            }
        for field in ['product_code', 'commodity_code']:
            code = getattr(item, field, None)
            result[field] = code.description if code else ''
        if kind == 'production':
            result['unit'] = item.unit.symbol if item.unit else ''
            result['linked'] = item.linked
            result['revision'] = (item.bom.revision or '') if item.bom else ''
        elif kind == 'bom':
            part = item.part
            result['unit'] = part.default_uom.symbol if part else ''
        return result

    # ---- Show Costs ---------------------------------------------------------

    @staticmethod
    def _rate(op, name, resource):
        value = getattr(op, name, None)
        if value is not None:
            return value
        if resource and resource.cost_method == 'hour':
            return resource.cost_price or ZERO
        return ZERO

    @classmethod
    def _op_costs(cls, op, quantity, setup_h, run_h):
        "The labor, burden and service cost of an operation"
        resource = getattr(op, 'resource', None) or getattr(
            op, 'work_center', None)
        setup_labor = Decimal(str(setup_h)) * cls._rate(
            op, 'setup_cost_hour', resource)
        run_labor = Decimal(str(run_h)) * cls._rate(
            op, 'run_cost_hour', resource)
        qty = Decimal(str(quantity or 0))
        labor = setup_labor + run_labor + qty * (op.run_cost_unit or ZERO) + (
            op.run_cost_operation or ZERO)
        burden = (Decimal(str(setup_h)) * (op.setup_burden_hour or ZERO)
            + Decimal(str(run_h)) * (op.run_burden_hour or ZERO)
            + qty * (op.burden_unit or ZERO) + (op.burden_operation or ZERO)
            + setup_labor * Decimal(str(op.setup_burden_percent or 0)) / 100
            + run_labor * Decimal(str(op.run_burden_percent or 0)) / 100)
        step = op if op.__name__ == 'production.routing.step' else getattr(
            op, 'routing_step', None)
        service = ZERO
        if step and getattr(step, 'service', None):
            service = (step.service.cost_price or ZERO) * Decimal(str(
                (getattr(step, 'service_quantity', None) or 1)
                * (quantity or 0)))
        return labor, burden, service

    @staticmethod
    def _material_qty(line, quantity):
        qty = quantity
        if line.scrap_percent:
            qty = qty * (1 + line.scrap_percent / 100)
        return qty + (line.fixed_quantity or 0)

    @classmethod
    def _material_unit_cost(cls, line, product):
        if line.unit_cost is not None:
            return line.unit_cost
        return product.cost_price or ZERO

    @classmethod
    def eng_costs(cls, kind, record, quantity=None):
        """Show Costs / Indented Costs: each operation, material and leg with
        its material, labor, burden and service cost (estimated) and, for a
        work order, the actual cost"""
        pool = Pool()
        rows = []
        if kind == 'bom':
            cls._check_read('production.bom')
            BOM = pool.get('production.bom')
            bom = BOM(record)
            quantity = float(quantity or bom.desired_quantity or 1)
            totals = cls._bom_costs(bom, quantity, 0, rows, {bom.id})
        else:
            cls._check_read('production')
            Production = pool.get('production')
            production = Production(record)
            quantity = production.quantity
            totals = cls._production_costs(production, 0, rows)
        total = sum(totals[:4], ZERO)
        return {
            'quantity': quantity,
            'rows': rows,
            'material': totals[0].quantize(CENT),
            'labor': totals[1].quantize(CENT),
            'burden': totals[2].quantize(CENT),
            'service': totals[3].quantize(CENT),
            'total': total.quantize(CENT),
            'unit': (total / Decimal(str(quantity))).quantize(CENT)
            if quantity else ZERO,
            'actual': totals[4].quantize(CENT) if len(totals) > 4 else None,
            }

    @staticmethod
    def _row(rows, level, kind, label, quantity, unit, costs, actual=None):
        material, labor, burden, service = costs
        rows.append({
                'level': level, 'kind': kind, 'label': label,
                'quantity': round(quantity, 4) if quantity is not None
                else None,
                'unit': unit,
                'material': material.quantize(CENT),
                'labor': labor.quantize(CENT),
                'burden': burden.quantize(CENT),
                'service': service.quantize(CENT),
                'total': (material + labor + burden + service).quantize(CENT),
                'actual': actual.quantize(CENT) if actual is not None
                else None,
                })
        return rows[-1]

    @classmethod
    def _bom_costs(cls, bom, quantity, level, rows, seen):
        part = bom.part
        output = sum(o.quantity for o in bom.outputs
            if part and o.product == part) or 1
        factor = quantity / output
        totals = [ZERO] * 4
        head = cls._row(rows, level, 'header', bom.rec_name, quantity,
            part.default_uom.symbol if part else None, totals)
        routing = bom.routing
        for step in sorted(routing.steps if routing else [],
                key=lambda s: (s.sequence or 0, s.id)):
            setup_h = _hours(getattr(step, 'setup_duration', None))
            run_h = _hours(getattr(step, 'run_duration', None)) * factor
            labor, burden, service = cls._op_costs(step, factor, setup_h,
                run_h)
            cls._row(rows, level + 1, 'op', '%s %s' % (step.sequence or '',
                    step.description or step.operation.rec_name),
                setup_h + run_h, 'h', (ZERO, labor, burden, service))
            totals[1] += labor
            totals[2] += burden
            totals[3] += service
        for line in bom.inputs:
            product = line.product
            qty = cls._material_qty(line, line.quantity * factor)
            master = product.get_bom(line.component_revision) if (
                line.leg_detail and hasattr(product, 'get_bom')) else None
            if master and master.bom and master.bom.id not in seen:
                sub_rows = []
                sub = cls._bom_costs(master.bom, qty, level + 2, sub_rows,
                    seen | {master.bom.id})
                cls._row(rows, level + 1, 'leg', product.rec_name, qty,
                    line.unit.symbol, sub)
                rows.extend(sub_rows)
                for i in range(4):
                    totals[i] += sub[i]
                continue
            cost = (cls._material_unit_cost(line, product)
                * Decimal(str(qty)) + (line.fixed_cost or ZERO))
            cls._row(rows, level + 1, 'mat', product.rec_name, qty,
                line.unit.symbol, (cost, ZERO, ZERO, ZERO))
            totals[0] += cost
        head.update(cls._row([], level, 'header', bom.rec_name, quantity,
                head['unit'], totals))
        return totals

    @classmethod
    def _production_costs(cls, production, level, rows, depth=0):
        totals = [ZERO] * 5
        head = cls._row(rows, level, 'header', production.rec_name,
            production.quantity, production.unit.symbol
            if production.unit else None, totals[:4])
        factor = production.quantity or 0
        if production.bom and production.product:
            factor = production.bom.compute_factor(production.product,
                production.quantity or 0, production.unit)
        if production.works:
            for work in production.works:
                setup_h = _hours(work.setup_duration)
                run_h = _hours(work.run_duration) * factor
                if not (setup_h or run_h):
                    setup_h = _hours(work.planned_duration)
                labor, burden, service = cls._op_costs(work, factor,
                    setup_h, run_h)
                actual = work.cost or ZERO
                cls._row(rows, level + 1, 'op', '%s %s' % (
                        work.sequence or '', work.description
                        or work.operation.rec_name), setup_h + run_h, 'h',
                    (ZERO, labor, burden, service), actual)
                totals[1] += labor
                totals[2] += burden
                totals[3] += service
                totals[4] += actual
        elif production.routing:
            for step in production.routing.steps:
                setup_h = _hours(getattr(step, 'setup_duration', None))
                run_h = _hours(getattr(step, 'run_duration', None)) * factor
                labor, burden, service = cls._op_costs(step, factor, setup_h,
                    run_h)
                cls._row(rows, level + 1, 'op', '%s %s' % (
                        step.sequence or '', step.description
                        or step.operation.rec_name), setup_h + run_h, 'h',
                    (ZERO, labor, burden, service), ZERO)
                totals[1] += labor
                totals[2] += burden
                totals[3] += service
        for card in production.material_cards:
            leg = card.leg
            if leg and depth < 8:
                sub_rows = []
                sub = cls._production_costs(leg, level + 2, sub_rows,
                    depth + 1)
                cls._row(rows, level + 1, 'leg', card.product.rec_name,
                    card.quantity, card.unit.symbol, sub[:4], sub[4])
                rows.extend(sub_rows)
                for i in range(5):
                    totals[i] += sub[i]
                continue
            move = card.move
            unit_cost = cls._material_unit_cost(card, card.product)
            cost = unit_cost * Decimal(str(move.quantity)) + (
                card.fixed_cost or ZERO)
            actual = ZERO
            if move.state == 'done':
                price = move.cost_price if getattr(
                    move, 'cost_price', None) is not None else unit_cost
                actual = price * Decimal(str(move.quantity))
            cls._row(rows, level + 1, 'mat', card.product.rec_name,
                move.quantity, move.unit.symbol, (cost, ZERO, ZERO, ZERO),
                actual)
            totals[0] += cost
            totals[4] += actual
        head.update(cls._row([], level, 'header', production.rec_name,
                production.quantity, head['unit'], totals[:4], totals[4]))
        return totals

    # ---- Material availability, supply and demand -------------------------

    @classmethod
    def eng_availability(cls, kind, record):
        """Material Availability: each material's required quantity against
        what is on hand and forecast in the warehouse"""
        pool = Pool()
        Product = pool.get('product.product')
        Uom = pool.get('product.uom')
        Location = pool.get('stock.location')
        cls._check_read('product.product')
        needs = []
        if kind == 'bom':
            BOM = pool.get('production.bom')
            bom = BOM(record)
            cls._check_read('production.bom')
            factor = (bom.desired_quantity or 1) / (sum(
                    o.quantity for o in bom.outputs) or 1)
            warehouse = next(iter(Location.search(
                        [('type', '=', 'warehouse')], limit=1)), None)
            for line in bom.inputs:
                needs.append((line.product, line.unit,
                        line.quantity * factor, line.operation, line.piece,
                        'draft'))
        else:
            Production = pool.get('production')
            cls._check_read('production')
            production = Production(record)
            warehouse = production.warehouse
            for card in production.material_cards:
                if card.supply == 'leg':
                    continue
                needs.append((card.product, card.unit, card.quantity,
                        card.operation, card.piece, card.state))
        products = list({n[0] for n in needs})
        context = {'locations': [warehouse.id], 'with_childs': True} \
            if warehouse else {}
        with Transaction().set_context(**context):
            on_hand = {p.id: p.quantity for p in Product.browse(products)}
            forecast = {p.id: p.forecast_quantity
                for p in Product.browse(products)}
        rows = []
        for product, unit, quantity, operation, piece, state in needs:
            required = Uom.compute_qty(unit, quantity, product.default_uom)
            rows.append({
                    'product': product.rec_name,
                    'product_id': product.id,
                    'operation': operation,
                    'piece': piece,
                    'required': round(required, 4),
                    'unit': product.default_uom.symbol,
                    'on_hand': on_hand[product.id],
                    'available': forecast[product.id],
                    'issued': state == 'done',
                    'short': state != 'done' and on_hand[product.id]
                    < required,
                    })
        return rows

    @classmethod
    def eng_supply_demand(cls, product):
        """Supply and Demand of a part: its open incoming and outgoing moves
        by date with the projected balance from the quantity on hand"""
        pool = Pool()
        Product = pool.get('product.product')
        Move = pool.get('stock.move')
        Location = pool.get('stock.location')
        cls._check_read('stock.move')
        product = Product(product)
        warehouses = Location.search([('type', '=', 'warehouse')])
        with Transaction().set_context(
                locations=[w.id for w in warehouses], with_childs=True):
            balance = Product(product.id).quantity
        rows = [{'date': None, 'kind': 'On hand', 'document': '',
                'supply': None, 'demand': None, 'balance': balance}]
        moves = Move.search([
                ('product', '=', product.id),
                ('state', 'in', ['draft', 'staging', 'assigned']),
                ], order=[('planned_date', 'ASC NULLS FIRST'), ('id', 'ASC')])
        for move in moves:
            to_stock = move.to_location.type == 'storage'
            from_stock = move.from_location.type == 'storage'
            if to_stock == from_stock:
                continue
            qty = move.internal_quantity
            document = move.shipment or move.origin or (
                move.production_input or move.production_output)
            if to_stock:
                balance += qty
            else:
                balance -= qty
            rows.append({
                    'date': move.planned_date,
                    'kind': 'Supply' if to_stock else 'Demand',
                    'document': document.rec_name if document else '',
                    'supply': qty if to_stock else None,
                    'demand': None if to_stock else qty,
                    'balance': balance,
                    })
        return {'product': product.rec_name, 'rows': rows}

    # ---- Inventory and labor transactions, sales order links ----------------

    @classmethod
    def eng_transactions(cls, production):
        """Inventory Txs and Labor Txs of the work order and its legs"""
        pool = Pool()
        Production = pool.get('production')
        cls._check_read('production', 'stock.move')
        root = Production(production)
        productions = Production.search([
                ('parent', 'child_of', [root.id], 'parent')])
        inventory, labor = [], []
        for p in productions:
            for move, kind in [(m, 'Issue') for m in p.inputs] + [
                    (m, 'Receipt') for m in p.outputs]:
                if move.state != 'done':
                    continue
                inventory.append({
                        'date': move.effective_date,
                        'work_order': p.rec_name,
                        'kind': kind,
                        'product': move.product.rec_name,
                        'quantity': move.quantity,
                        'unit': move.unit.symbol,
                        'location': (move.from_location if kind == 'Issue'
                            else move.to_location).rec_name,
                        'cost': getattr(move, 'cost_price', None),
                        })
            for work in p.works:
                for cycle in work.cycles:
                    by = cycle.done_by or cycle.run_by
                    labor.append({
                            'date': (cycle.write_date
                                or cycle.create_date).date()
                            if (cycle.write_date or cycle.create_date)
                            else None,
                            'work_order': p.rec_name,
                            'operation': '%s %s' % (work.sequence or '',
                                work.operation.rec_name),
                            'employee': by.rec_name if by else '',
                            'hours': round(_hours(cycle.duration), 2)
                            if cycle.duration else None,
                            'cost': cycle.cost,
                            'state': cycle.state,
                            })
        inventory.sort(key=lambda r: (r['date'] or dt.date.min))
        labor.sort(key=lambda r: (r['date'] or dt.date.min))
        return {'inventory': inventory, 'labor': labor}

    @classmethod
    def eng_sales_links(cls, production):
        "Sales Order Links: the sales order lines the work order is for"
        pool = Pool()
        Production = pool.get('production')
        cls._check_read('production')
        production = Production(production)
        root = production.root or production
        rows = []
        origin = root.origin
        if getattr(origin, '__name__', None) == 'sale.line':
            sale = origin.sale
            lines = [l for l in sale.lines if l.type == 'line']
            rows.append({
                    'sale_id': sale.id,
                    'sale': sale.number or sale.rec_name,
                    'line_no': (lines.index(origin) + 1
                        if origin in lines else None),
                    'customer': sale.party.rec_name,
                    'line': origin.rec_name,
                    'quantity': origin.quantity,
                    'link_quantity': root.quantity,
                    'shipped': sum(m.quantity for m in origin.moves
                        if m.state == 'done'),
                    'unit': origin.unit.symbol if origin.unit else '',
                    'ship_date': getattr(origin, 'shipping_date', None),
                    'state': sale.state,
                    })
        return rows

    # ---- Variables and co-products -----------------------------------------

    @classmethod
    def eng_variables(cls, kind, record):
        pool = Pool()
        Model = pool.get('production' if kind == 'production'
            else 'production.bom')
        cls._check_read(Model.__name__)
        return [{'id': v.id, 'name': v.name, 'value': v.value}
            for v in Model(record).variables]

    @classmethod
    def eng_variables_save(cls, kind, record, rows):
        """Variables: save them and recalculate the quantity of each material
        whose dimensions use them; return the new tree"""
        pool = Pool()
        Variable = pool.get('nline.engineering.variable')
        Model = pool.get('production' if kind == 'production'
            else 'production.bom')
        target = Model(record)
        if kind == 'production':
            cls._editable_production(target)
        else:
            cls._editable_bom(target)
        field = 'production' if kind == 'production' else 'bom'
        Variable.delete(list(target.variables))
        Variable.save([Variable(**{field: target, 'name': r['name'],
                        'value': _float(r.get('value'))})
                for r in rows if (r.get('name') or '').strip()])
        target = Model(record)
        values = {v.name: v.value for v in target.variables}
        if kind == 'production':
            Move = pool.get('stock.move')
            factor = target.quantity or 0
            if target.bom and target.product:
                factor = target.bom.compute_factor(target.product,
                    target.quantity or 0, target.unit)
            moves = []
            for card in target.material_cards:
                if not card.dimensions or card.move.state not in {
                        'draft', 'staging'}:
                    continue
                move = card.move
                move.quantity = move.unit.round(cls._material_qty(card,
                        cls._dimension(card, values) * factor))
                moves.append(move)
            Move.save(moves)
        else:
            Input = pool.get('production.bom.input')
            lines = []
            for line in target.inputs:
                if line.dimensions:
                    line.quantity = cls._dimension(line, values)
                    lines.append(line)
            Input.save(lines)
        return cls.eng_tree(kind, record)

    @classmethod
    def _dimension(cls, line, values):
        try:
            return evaluate(line.dimensions, values)
        except (ValueError, SyntaxError, ZeroDivisionError, TypeError):
            cls._eng_error('msg_dimensions', dimensions=line.dimensions,
                material=line.rec_name)

    @classmethod
    def eng_coproducts(cls, kind, record):
        "Co-Products: the outputs other than the part made"
        pool = Pool()
        if kind == 'production':
            Production = pool.get('production')
            cls._check_read('production')
            production = Production(record)
            outputs = [m for m in production.outputs
                if m.product != production.product]
        else:
            BOM = pool.get('production.bom')
            cls._check_read('production.bom')
            bom = BOM(record)
            outputs = [o for o in bom.outputs if o.product != bom.part]
        return [{'id': o.id, 'product': _record_value(o, 'product'),
                'quantity': o.quantity, 'unit': _record_value(o, 'unit')}
            for o in outputs]

    @classmethod
    def eng_coproducts_save(cls, kind, record, rows):
        pool = Pool()
        Product = pool.get('product.product')
        Uom = pool.get('product.uom')
        if kind == 'production':
            Production = pool.get('production')
            Move = pool.get('stock.move')
            production = Production(record)
            cls._editable_production(production, states=('request', 'draft'))
            cls._check_create('stock.move')
            old = [m for m in production.outputs
                if m.product != production.product]
            Move.delete(old)
            moves = []
            for row in rows:
                if not _id(row.get('product')):
                    continue
                product = Product(_id(row['product']))
                unit = Uom(_id(row['unit'])) if _id(row.get('unit')) \
                    else product.default_uom
                move = production._move('output', product, unit,
                    float(row.get('quantity') or 1))
                move.unit_price = ZERO
                moves.append(move)
            Move.save(moves)
        else:
            BOM = pool.get('production.bom')
            Output = pool.get('production.bom.output')
            bom = BOM(record)
            cls._editable_bom(bom)
            Output.delete([o for o in bom.outputs if o.product != bom.part])
            Output.save([Output(bom=bom, product=Product(_id(r['product'])),
                        unit=Uom(_id(r['unit'])) if _id(r.get('unit'))
                        else Product(_id(r['product'])).default_uom,
                        quantity=float(r.get('quantity') or 1))
                    for r in rows if _id(r.get('product'))])
        return True

    # ---- Masters ------------------------------------------------------------

    @classmethod
    def eng_master_ready(cls, bom, product=None):
        """Complete a master saved in the window (Building a New Engineering
        or Quote Master): the part it makes, its name and its routing"""
        pool = Pool()
        BOM = pool.get('production.bom')
        Output = pool.get('production.bom.output')
        Product = pool.get('product.product')
        ProductBom = pool.get('product.product-production.bom')
        cls._check_write('production.bom')
        bom = BOM(bom)
        product = Product(_id(product)) if _id(product) else bom.part
        if product and not bom.outputs:
            Output(bom=bom, product=product, unit=product.default_uom,
                quantity=1).save()
            bom = BOM(bom.id)
        if bom.master_type == 'engineering':
            if not product:
                cls._eng_error('msg_part_required')
            if not bom.name or bom.name == '-':
                BOM.write([bom], {'name': ('%s %s' % (product.code or '',
                                product.template.name)).strip()[:100]})
            if not ProductBom.search([('product', '=', product.id),
                        ('bom', '=', bom.id)], limit=1):
                ProductBom(product=product, bom=bom).save()
        elif not bom.name or bom.name == '-':
            BOM.write([bom], {'name': cls._next_quote_master()})
        cls._bom_routing(BOM(bom.id))
        return BOM(bom.id).id

    @classmethod
    def _next_quote_master(cls):
        "Jobshop's quote master numbering: 00001, 00002..."
        BOM = Pool().get('production.bom')
        numbers = [b.name for b in BOM.search([
                    ('master_type', '=', 'quote')])]
        count = max((int(n) for n in numbers if n and n.isdigit()),
            default=0)
        return '%05d' % (count + 1)

    @classmethod
    def eng_master_copy(cls, bom, values):
        """Copying Into a New Engineering (or Quote) Master: the header,
        operations and materials; values: master_type, product, revision,
        name; return the new master's id"""
        pool = Pool()
        BOM = pool.get('production.bom')
        Routing = pool.get('production.routing')
        Product = pool.get('product.product')
        ProductBom = pool.get('product.product-production.bom')
        cls._check_create('production.bom', 'production.routing')
        source = BOM(bom)
        master_type = values.get('master_type') or source.master_type
        product = Product(_id(values['product'])) if _id(
            values.get('product')) else source.part
        new, = BOM.copy([source], {
                'master_type': master_type,
                'name': values.get('name') or '-',
                'private': False,
                })
        BOM.write([new], {'revision': values.get('revision') or None})
        if product and source.part and product != source.part:
            for output in new.outputs:
                if output.product == source.part:
                    output.product = product
                    output.unit = product.default_uom
                    output.save()
        routing = None
        if source.routing:
            routing, = Routing.copy([source.routing], {
                    'name': ('%s Rev %s' % (product.code if product else
                            new.name, values.get('revision') or ''))[:100],
                    })
            if routing.boms:
                Routing.write([routing], {
                        'boms': [('remove', [b.id for b in routing.boms])]})
            Routing.write([routing], {'boms': [('add', [new.id])]})
        if master_type == 'engineering' and product:
            ProductBom(product=product, bom=new, routing=routing).save()
        return cls.eng_master_ready(new.id, product.id if product else None)

    # ---- Quotes -------------------------------------------------------------

    @classmethod
    def eng_quote_cost(cls, values):
        """The unit cost of a quote line at a quantity (Cost From): the part's
        cost, or the costs of its engineering master or quote master by
        material, fabricated material, labor, burden and service"""
        pool = Pool()
        Product = pool.get('product.product')
        BOM = pool.get('production.bom')
        cls._check_read('product.product')
        quantity = float(values.get('quantity') or 1)
        cost_from = values.get('cost_from') or 'engineering'
        bom = None
        if cost_from == 'quote' and _id(values.get('quote_master')):
            bom = BOM(_id(values['quote_master']))
        elif cost_from == 'engineering':
            if _id(values.get('bom')):
                bom = BOM(_id(values['bom']))
            elif _id(values.get('product')):
                product = Product(_id(values['product']))
                link = product.get_bom() if hasattr(product, 'get_bom') \
                    else None
                bom = link.bom if link else None
        result = {'material': ZERO, 'fabricated': ZERO, 'labor': ZERO,
            'burden': ZERO, 'service': ZERO, 'source': 'part', 'bom': None}
        if bom:
            costs = cls.eng_costs('bom', bom.id, quantity)
            q = Decimal(str(quantity))
            fabricated = sum((Decimal(str(r['total'])) for r in costs['rows']
                    if r['kind'] == 'leg' and r['level'] == 1), ZERO)
            material = costs['material']
            legs_material = sum((Decimal(str(r['material']))
                    for r in costs['rows']
                    if r['kind'] == 'leg' and r['level'] == 1), ZERO)
            result.update({
                    'material': ((material - legs_material) / q),
                    'fabricated': fabricated / q,
                    'labor': costs['labor'] / q,
                    'burden': costs['burden'] / q,
                    'service': costs['service'] / q,
                    'source': cost_from,
                    'bom': bom.id,
                    })
            # The legs' labor... are in the fabricated material
            legs = [r for r in costs['rows']
                if r['kind'] == 'leg' and r['level'] == 1]
            for name in ['labor', 'burden', 'service']:
                result[name] -= sum((Decimal(str(r[name])) for r in legs),
                    ZERO) / q
        elif _id(values.get('product')) and cost_from != 'none':
            product = Product(_id(values['product']))
            result['material'] = product.cost_price or ZERO
        for name in ['material', 'fabricated', 'labor', 'burden', 'service']:
            result[name] = Decimal(result[name]).quantize(Decimal('0.0001'))
        result['unit_cost'] = sum((result[n] for n in ['material',
                    'fabricated', 'labor', 'burden', 'service']), ZERO)
        return result

    @classmethod
    def eng_party_address(cls, party):
        "The Sold To and Ship To of a customer for a quote"
        pool = Pool()
        Quote = pool.get('nline.quote')
        Party = pool.get('party.party')
        cls._check_read('party.party')
        quote = Quote(party=Party(party))
        quote.fill_party()
        names = ['name', 'street', 'city', 'state', 'postal_code', 'country',
            'contact_name', 'contact_phone', 'contact_email',
            'contact_mobile']
        result = {n: getattr(quote, n, None) for n in names}
        result.update({'ship_' + n: getattr(quote, 'ship_' + n, None)
                for n in names[:6]})
        result['payment_term'] = _record_value(quote, 'payment_term')
        return result

    LINE_FIELDS = ['product', 'description', 'customer_part', 'unit',
        'cost_from', 'bom', 'quote_master', 'drawing_number',
        'drawing_revision', 'product_code', 'commodity_code',
        'desired_ship_date', 'promise_date', 'specifications',
        'win_probability', 'status']
    PRICE_FIELDS = ['quantity', 'unit_cost', 'calc_unit_price', 'unit_price',
        'trade_discount', 'leadtime', 'material_markup', 'fab_markup',
        'labor_markup', 'burden_markup', 'service_markup', 'in_total',
        'in_proforma']

    @classmethod
    def eng_quote_get(cls, quote):
        "The lines of a quote with their quantities quoted"
        pool = Pool()
        Quote = pool.get('nline.quote')
        cls._check_read('nline.quote')
        quote = Quote(quote)
        return [dict({n: _record_value(l, n) for n in cls.LINE_FIELDS},
                id=l.id, line_no=l.line_no,
                prices=[dict({n: _record_value(p, n)
                            for n in cls.PRICE_FIELDS}, id=p.id)
                    for p in l.prices])
            for l in quote.lines]

    @classmethod
    def eng_quote_save(cls, quote, lines):
        """Save the lines of a quote (Quote tab table and the Quantities
        Quoted of each line); lines without id are added, missing ones
        deleted"""
        pool = Pool()
        Quote = pool.get('nline.quote')
        Line = pool.get('nline.quote.line')
        Price = pool.get('nline.quote.line.price')
        cls._check_write('nline.quote')
        quote = Quote(quote)
        relations = {'product': 'product.product', 'unit': 'product.uom',
            'bom': 'production.bom', 'quote_master': 'production.bom',
            'product_code': 'nline.product_code',
            'commodity_code': 'nline.commodity_code'}
        keep = set()
        for row in lines:
            line = Line(_id(row.get('id'))) if _id(row.get('id')) else Line(
                quote=quote)
            for name in cls.LINE_FIELDS:
                if name not in row:
                    continue
                value = row[name]
                if name in relations:
                    value = pool.get(relations[name])(_id(value)) \
                        if _id(value) else None
                elif name in {'desired_ship_date', 'promise_date'}:
                    value = dt.date.fromisoformat(value[:10]) if isinstance(
                        value, str) and value else value or None
                elif name == 'win_probability':
                    value = _float(value)
                elif isinstance(value, str) and name not in {
                        'cost_from', 'status'}:
                    value = value or None
                setattr(line, name, value)
            product = getattr(line, 'product', None)
            if product and not getattr(line, 'unit', None):
                line.unit = product.sale_uom if hasattr(
                    product, 'sale_uom') else product.default_uom
            if product and not getattr(line, 'description', None):
                line.description = line.product.template.name
            prices = []
            for p in row.get('prices') or []:
                if p.get('quantity') in (None, ''):
                    continue
                price = Price(_id(p['id'])) if _id(p.get('id')) else Price()
                for name in cls.PRICE_FIELDS:
                    if name not in p:
                        continue
                    value = p[name]
                    if name in {'unit_cost', 'calc_unit_price',
                            'unit_price'}:
                        value = _dec(value)
                    elif name in {'in_total', 'in_proforma'}:
                        value = bool(value)
                    elif name == 'leadtime':
                        value = int(value) if value not in (None, '') \
                            else None
                    else:
                        value = _float(value)
                    setattr(price, name, value)
                prices.append(price)
            line.prices = prices
            line.save()
            keep.add(line.id)
        Line.delete([l for l in Quote(quote.id).lines if l.id not in keep])
        return cls.eng_quote_get(quote.id)

    @classmethod
    def eng_quote_win(cls, quote, confirm=True):
        """Win the quote: a sales order of its lines (the quantity in the
        total) and charges; the quote is Won; return the sales order id"""
        pool = Pool()
        Quote = pool.get('nline.quote')
        Sale = pool.get('sale.sale')
        SaleLine = pool.get('sale.line')
        Date = pool.get('ir.date')
        cls._check_write('nline.quote')
        cls._check_create('sale.sale', 'sale.line')
        quote = Quote(quote)
        if quote.status == 'won' and quote.sale:
            return quote.sale.id
        if not quote.party:
            cls._eng_error('msg_quote_customer', quote=quote.rec_name)
        today = Date.today()
        sale = Sale(company=quote.company, party=quote.party,
            sale_date=today)
        sale.on_change_party()
        sale.reference = quote.customer_reference
        sale.description = ('Quote %s' % quote.number)[:100]
        if quote.payment_term:
            sale.payment_term = quote.payment_term
        lines = []
        for qline in quote.lines:
            price = qline.total_price()
            if not price or qline.status != 'open':
                continue
            line = SaleLine(sale=sale, type='line')
            if qline.product and qline.product.salable:
                line.product = qline.product
                line.on_change_product()
                line.unit = qline.unit or line.unit
            else:
                line.unit = qline.unit
            line.quantity = price.quantity
            line.unit_price = price.net_price()
            line.description = qline.description or (
                qline.product.rec_name if qline.product else '')
            if qline.desired_ship_date and hasattr(
                    line, 'shipping_date_store'):
                line.shipping_date_store = qline.desired_ship_date
            lines.append(line)
        for charge in quote.charges:
            line = SaleLine(sale=sale, type='line')
            if charge.product:
                line.product = charge.product
                line.on_change_product()
            line.quantity = 1
            line.unit_price = (charge.amount or ZERO).quantize(
                Decimal('0.0001'))
            line.description = charge.description or charge.service_charge
            lines.append(line)
        if not lines:
            cls._eng_error('msg_quote_no_lines', quote=quote.rec_name)
        sale.lines = lines
        sale.save()
        if confirm:
            Sale.quote([sale])
            Sale.confirm([sale])
        Quote.write([quote], {'status': 'won', 'won_loss_date': today,
                'sale': sale.id})
        if quote.copy_notes:
            # Jobshop's Copy Notes to Sales Order
            Note = pool.get('ir.note')
            notes = Note.search([('resource', '=', str(quote))])
            if notes:
                Note.create([{'resource': str(sale), 'message': n.message}
                        for n in notes])
        return sale.id

    @classmethod
    def eng_quote_lose(cls, quote, reason=None, status='lost'):
        "Lose (or cancel) the quote with the reason"
        pool = Pool()
        Quote = pool.get('nline.quote')
        Date = pool.get('ir.date')
        cls._check_write('nline.quote')
        Quote.write([Quote(quote)], {
                'status': 'cancelled' if status == 'cancelled' else 'lost',
                'won_loss_date': Date.today(),
                'won_loss_reason': reason or None,
                })
        return True

    @classmethod
    def eng_quote_copy(cls, quote):
        "Copying Quotes: a new active quote with the lines and charges"
        Quote = Pool().get('nline.quote')
        cls._check_create('nline.quote')
        new, = Quote.copy([Quote(quote)])
        return new.id

    @classmethod
    def eng_quote_printed(cls, quote):
        "The quote was printed: its Printed date, an Active one is Ready"
        Quote = Pool().get('nline.quote')
        cls._check_read('nline.quote')
        quote = Quote(quote)
        values = {'printed_date': dt.datetime.now()}
        if quote.status == 'active':
            values['status'] = 'ready'
        with Transaction().set_context(_check_access=False):
            Quote.write([quote], values)
        return True


MODELS = [Desk]
