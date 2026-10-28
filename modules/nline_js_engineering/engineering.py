# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Engineering and Estimating: Engineering masters, operation
templates, quotes, quote masters and the work order window (information
cards), as in VISUAL Jobshop

The Jobshop windows sit on the Tryton records:
- a work order is a production (its legs child productions, nline_work_order),
  its operations works (or the routing steps before release), its materials
  material cards (stock moves);
- an engineering master is a BOM with its routing (master_type 'engineering'),
  a quote master a BOM of type 'quote' with its own routing;
- an operation template is a record of its own, copied into an operation.
The fields Jobshop has and Tryton has not are added here (Specs, drawings,
run types, costs, scrap, additional resources, variables...).
"""
from trytond.model import ModelSQL, ModelView, fields
from trytond.modules.nline_js_common.common import CodeTable
from trytond.pool import Pool, PoolMeta

from . import estimating

# Jobshop's work order statuses (VShopfloorWorkOrder "Order Status")
ORDER_STATUS = [
    ('unreleased', "Unreleased"),
    ('firm', "Firm"),
    ('hold', "Hold"),
    ('released', "Released"),
    ('closed', "Closed"),
    ('cancelled', "Cancelled"),
    ]
# Jobshop's run types (VEngineeringOperation "Run Type")
RUN_TYPES = [
    ('hrs_pc', "Hours per Piece"),
    ('pcs_hr', "Pieces per Hour"),
    ('min_pc', "Minutes per Piece"),
    ('pcs_min', "Pieces per Minute"),
    ('loads_hr', "Loads per Hour"),
    ('hrs_load', "Hours per Load"),
    ]
COST_DIGITS = (16, 4)


def run_hours_per_piece(run_type, run, load_size):
    "The run hours of one piece from Jobshop's run value and run type"
    if not run:
        return 0.0
    load = load_size or 1.0
    if run_type == 'pcs_hr':
        return 1.0 / run
    if run_type == 'min_pc':
        return run / 60.0
    if run_type == 'pcs_min':
        return 1.0 / (run * 60.0)
    if run_type == 'loads_hr':
        return 1.0 / (run * load)
    if run_type == 'hrs_load':
        return run / load
    return run


class DrawingMixin:
    "Jobshop's drawing reference of a header, an operation or a material"
    __slots__ = ()
    drawing_page = fields.Char("Drawing Page")
    drawing_file = fields.Char(
        "Drawing File", help="The path of the drawing file.")
    specifications = fields.Text("Specifications")


class OperationMixin(DrawingMixin):
    """The fields of a Jobshop operation (Operation, Specs, Costs and Other
    tabs) shared by the operation templates, the master's routing steps and
    the work order's operations"""
    __slots__ = ()
    run_type = fields.Selection(RUN_TYPES, "Run Type")
    run = fields.Float("Run", help="The run value in the unit of the run "
        "type.")
    load_size = fields.Float("Load Size Qty")
    move_hours = fields.Float("Move Hrs")
    transit_days = fields.Integer("Transit Days")
    minimum_move_qty = fields.Float("Minimum Move Qty")
    preserved = fields.Boolean(
        "Preserved", help="Keep the description when the resource or the "
        "template changes.")
    scrap_yield = fields.Selection([
            ('scrap', "Scrap"),
            ('yield', "Yield"),
            ], "Scrap or Yield")
    scrap_percent = fields.Float("Scrap/Yield %")
    fixed_scrap = fields.Float("Fixed Scrap Units")
    override_start_qty = fields.Float("Override Start Qty")
    override_end_qty = fields.Float("Override End Qty")
    minimum_capacity = fields.Integer("Minimum Capacity")
    maximum_capacity = fields.Integer("Maximum Capacity")
    drawing_number = fields.Char("Drawing ID")
    drawing_revision = fields.Char("Drawing Rev")
    setup_cost_hour = fields.Numeric("Setup Per Hr", digits=COST_DIGITS)
    run_cost_hour = fields.Numeric("Run Per Hr", digits=COST_DIGITS)
    run_cost_unit = fields.Numeric("Run Per Unit", digits=COST_DIGITS)
    run_cost_operation = fields.Numeric(
        "Run Per Operation", digits=COST_DIGITS)
    setup_burden_hour = fields.Numeric(
        "Setup Burden Per Hour", digits=COST_DIGITS)
    run_burden_hour = fields.Numeric(
        "Run Burden Per Hour", digits=COST_DIGITS)
    burden_unit = fields.Numeric("Burden Per Unit", digits=COST_DIGITS)
    burden_operation = fields.Numeric(
        "Burden Per Operation", digits=COST_DIGITS)
    setup_burden_percent = fields.Float("Setup Percentage")
    run_burden_percent = fields.Float("Run Percentage")

    @classmethod
    def default_run_type(cls):
        return 'hrs_pc'

    @classmethod
    def default_scrap_yield(cls):
        return 'scrap'


# The operation fields copied from a template or step to an operation
OPERATION_FIELDS = [
    'run_type', 'run', 'load_size', 'move_hours', 'transit_days',
    'minimum_move_qty', 'preserved', 'scrap_yield', 'scrap_percent',
    'fixed_scrap', 'override_start_qty', 'override_end_qty',
    'minimum_capacity', 'maximum_capacity', 'drawing_number',
    'drawing_revision', 'drawing_page', 'drawing_file', 'specifications',
    'setup_cost_hour', 'run_cost_hour', 'run_cost_unit',
    'run_cost_operation', 'setup_burden_hour', 'run_burden_hour',
    'burden_unit', 'burden_operation', 'setup_burden_percent',
    'run_burden_percent',
    ]


class MaterialMixin(DrawingMixin):
    """The fields of a Jobshop material (Specs, Costs and Purchasing tabs)
    shared by the master's materials and the work order's material cards"""
    __slots__ = ()
    qty_per_type = fields.Selection([
            ('start', "Start"),
            ('end', "End"),
            ], "Qty Per Type")
    fixed_quantity = fields.Float("Fixed Qty")
    scrap_percent = fields.Float("Scrap %")
    dimensions = fields.Char(
        "Dimensions", help="An expression of the variables giving the "
        "quantity per piece, e.g. LENGTH * WIDTH.")
    drawing_number = fields.Char("Drawing ID")
    drawing_revision = fields.Char("Drawing Rev")
    unit_cost = fields.Numeric(
        "Unit Material Cost", digits=COST_DIGITS,
        help="The estimated cost of one unit (empty: the part's cost).")
    fixed_cost = fields.Numeric("Fixed Cost", digits=COST_DIGITS)
    supplier = fields.Many2One('party.party', "Supplier")
    required_date = fields.Date("Required Date")

    @classmethod
    def default_qty_per_type(cls):
        return 'start'


MATERIAL_FIELDS = [
    'qty_per_type', 'fixed_quantity', 'scrap_percent', 'dimensions',
    'drawing_number', 'drawing_revision', 'drawing_page', 'drawing_file',
    'specifications', 'unit_cost', 'fixed_cost', 'supplier',
    'required_date',
    ]


class HeaderMixin(DrawingMixin):
    "The header fields of a work order or a master (Work Order tab)"
    __slots__ = ()
    engineered_by = fields.Char("Engineered By")
    engineered_date = fields.Date("Engineered Date")
    product_code = fields.Many2One('nline.product_code', "Product Code")
    commodity_code = fields.Many2One(
        'nline.commodity_code', "Commodity Code")
    global_rank = fields.Integer(
        "Global Rank", help="The lower, the earlier it is scheduled.")
    forward_schedule = fields.Boolean(
        "Forward Schedule", help="Schedule from the release date forward.")

    @classmethod
    def default_global_rank(cls):
        return 50


class Production(HeaderMixin, metaclass=PoolMeta):
    __name__ = 'production'

    planning_status = fields.Selection([
            (None, ""),
            ('firm', "Firm"),
            ('hold', "Hold"),
            ], "Planning Status",
        help="Jobshop's Firm and Hold of a work order not released.")
    order_status = fields.Function(fields.Selection(
            ORDER_STATUS, "Order Status"),
        'get_order_status', searcher='search_order_status')
    received_quantity = fields.Function(fields.Float(
            "Rec'd Qty", digits='unit'), 'get_received_quantity')
    printed_date = fields.DateTime("Printed Date", readonly=True)
    closed_date = fields.Function(fields.Date("Closed Date"),
        'get_closed_date')
    drawing_number = fields.Char("Drawing ID")
    drawing_revision = fields.Char("Drawing Rev")
    variables = fields.One2Many(
        'nline.engineering.variable', 'production', "Variables")

    def get_order_status(self, name):
        if self.state in {'request', 'draft'}:
            return self.planning_status or 'unreleased'
        if self.state in {'waiting', 'assigned', 'running'}:
            return 'released'
        if self.state == 'done':
            return 'closed'
        return 'cancelled'

    @classmethod
    def _order_status_domain(cls, status):
        if status in {'unreleased', 'firm', 'hold'}:
            return [('state', 'in', ['request', 'draft']),
                ('planning_status', '=',
                    None if status == 'unreleased' else status)]
        if status == 'released':
            return [('state', 'in', ['waiting', 'assigned', 'running'])]
        if status == 'closed':
            return [('state', '=', 'done')]
        if status == 'cancelled':
            return [('state', '=', 'cancelled')]
        return [('id', '=', None)]

    @classmethod
    def search_order_status(cls, name, clause):
        _, operator, value = clause[:3]
        values = value if isinstance(value, (list, tuple)) else [value]
        if operator in {'!=', 'not in'}:
            values = [s for s, _ in ORDER_STATUS if s not in values]
        domain = ['OR'] + [cls._order_status_domain(v) for v in values]
        return domain if len(domain) > 1 else [('id', '=', None)]

    def get_received_quantity(self, name):
        pool = Pool()
        Uom = pool.get('product.uom')
        total = 0.0
        for move in self.outputs:
            if move.state == 'done' and move.product == self.product:
                total += Uom.compute_qty(move.unit, move.quantity, self.unit)
        return total

    def get_closed_date(self, name):
        if self.state == 'done':
            return self.effective_date

    @classmethod
    def create(cls, vlist):
        pool = Pool()
        Product = pool.get('product.product')
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            # The Work Order window gives the part only: its unit
            if values.get('product') and not values.get('unit'):
                values['unit'] = Product(values['product']).default_uom.id
        return super().create(vlist)

    @classmethod
    def copy(cls, productions, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('printed_date', None)
        default.setdefault('planning_status', None)
        return super().copy(productions, default=default)

    # The information cards (nline_build_tree): what Jobshop's cards show

    def _build_tree_node(self):
        node = super()._build_tree_node()
        node.update({
                'kind': 'production',
                'order_status': self.order_status,
                'description': (self.product.template.name
                    if self.product else None),
                'drawing_number': self.drawing_number,
                'drawing_file': self.drawing_file,
                'has_specs': bool(self.specifications),
                'received_quantity': self.received_quantity,
                'parent_id': self.parent.id if self.parent else None,
                })
        return node

    def _build_tree_step_node(self, step):
        node = super()._build_tree_step_node(step)
        node.update(_step_extras(step))
        node['kind'] = 'step'
        node['step_id'] = step.id
        node['routing_id'] = step.routing.id
        if node['work_center'] is None and step.resource:
            node['work_center'] = step.resource.rec_name
            node['work_center_id'] = step.resource.id
        return node


def _step_extras(record):
    "The fields of an operation the cards show (step or work)"
    service = getattr(record, 'service', None) or getattr(
        getattr(record, 'routing_step', None), 'service', None)
    return {
        'description': record.description,
        'setup_hours': (record.setup_duration.total_seconds() / 3600
            if getattr(record, 'setup_duration', None) else None),
        'run': record.run,
        'run_type': record.run_type,
        'service': service.rec_name if service else None,
        'drawing_file': record.drawing_file,
        'has_specs': bool(record.specifications),
        'resources': len(record.extra_resources),
        }


class BOM(HeaderMixin, metaclass=PoolMeta):
    __name__ = 'production.bom'

    master_type = fields.Selection([
            ('engineering', "Engineering Master"),
            ('quote', "Quote Master"),
            ], "Master Type", required=True,
        help="A quote master is an estimate only: it makes no work order.")
    description = fields.Char("Description")
    desired_quantity = fields.Float(
        "Quantity", help="The quantity the master is costed for.")
    workorder_instructions = fields.Text(
        "Work Order Instructions",
        help="Shown when a work order is made from the master.")
    private = fields.Boolean(
        "Private", help="Locked: the master cannot be changed.")
    variables = fields.One2Many(
        'nline.engineering.variable', 'bom', "Variables")
    part = fields.Function(fields.Many2One('product.product', "Part"),
        'get_part', searcher='search_part')
    routing = fields.Function(fields.Many2One(
            'production.routing', "Routing"), 'get_routing')

    @classmethod
    def default_master_type(cls):
        return 'engineering'

    @classmethod
    def default_desired_quantity(cls):
        return 1

    def get_part(self, name):
        return self.outputs[0].product.id if self.outputs else None

    @classmethod
    def search_part(cls, name, clause):
        return [('outputs.product',) + tuple(clause[1:])]

    def get_routing(self, name):
        pool = Pool()
        ProductBom = pool.get('product.product-production.bom')
        Routing = pool.get('production.routing')
        for link in ProductBom.search([('bom', '=', self.id)]):
            if getattr(link, 'routing', None):
                return link.routing.id
        routings = Routing.search([
                ('boms', '=', self.id),
                ('work_order', '=', False),
                ], limit=1)
        return routings[0].id if routings else None


class BOMInput(MaterialMixin, metaclass=PoolMeta):
    __name__ = 'production.bom.input'

    leg_detail = fields.Boolean(
        "Leg/Detail", help="Made in a leg of the work orders of the master "
        "(Jobshop leg), not taken from stock.")


class MaterialCard(MaterialMixin, metaclass=PoolMeta):
    __name__ = 'production.material_card'

    @classmethod
    def create(cls, vlist):
        pool = Pool()
        BOMInput = pool.get('production.bom.input')
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            # The material's Specs, Costs and Purchasing from the master
            if values.get('bom_input'):
                line = BOMInput(values['bom_input'])
                for name in MATERIAL_FIELDS:
                    if values.get(name) is None:
                        value = getattr(line, name)
                        values[name] = value.id if isinstance(
                            value, ModelSQL) else value
        return super().create(vlist)

    def _build_tree_node(self):
        node = super()._build_tree_node()
        node.update({
                'kind': 'card',
                'drawing_file': self.drawing_file
                or (self.bom_input.drawing_file if self.bom_input else None),
                'has_specs': bool(self.specifications),
                'description': self.product.template.name,
                'supplier': self.supplier.rec_name if self.supplier else None,
                })
        return node


class Routing(metaclass=PoolMeta):
    __name__ = 'production.routing'

    work_order = fields.Boolean(
        "Work Order Copy", readonly=True,
        help="The operations of one work order, copied from its master "
        "when they were changed.")


class RoutingStep(OperationMixin, metaclass=PoolMeta):
    __name__ = 'production.routing.step'

    description = fields.Char("Description")
    resource = fields.Many2One(
        'production.work.center', "Resource ID",
        help="The shop resource the operation runs on.")
    template = fields.Many2One(
        'nline.engineering.operation_template', "Template ID",
        ondelete='SET NULL')
    extra_resources = fields.One2Many(
        'nline.engineering.operation_resource', 'step',
        "Additional Resources")

    def get_work(self, production, work_center_picker):
        work = super().get_work(production, work_center_picker)
        # The work order's operation is a copy of the master's
        for name in OPERATION_FIELDS + ['description', 'template']:
            setattr(work, name, getattr(self, name))
        work.setup_duration = getattr(self, 'setup_duration', None)
        work.run_duration = getattr(self, 'run_duration', None)
        if self.resource:
            work.work_center = self.resource
        work.extra_resources = [
            r.copy_to_work() for r in self.extra_resources]
        return work


class Work(OperationMixin, metaclass=PoolMeta):
    __name__ = 'production.work'

    description = fields.Char("Description")
    setup_duration = fields.TimeDelta("Setup")
    run_duration = fields.TimeDelta("Run per Unit")
    template = fields.Many2One(
        'nline.engineering.operation_template', "Template ID",
        ondelete='SET NULL')
    extra_resources = fields.One2Many(
        'nline.engineering.operation_resource', 'work',
        "Additional Resources")

    def _build_tree_node(self):
        node = super()._build_tree_node()
        node.update(_step_extras(self))
        node['kind'] = 'work'
        node['step_id'] = None
        return node


class OperationTemplate(OperationMixin, CodeTable):
    "Operation Template"
    __name__ = 'nline.engineering.operation_template'

    resource = fields.Many2One('production.work.center', "Resource ID")
    operation = fields.Many2One(
        'production.routing.operation', "Operation",
        help="The routing operation of the steps made from the template.")
    service = fields.Many2One(
        'product.product', "Service ID",
        domain=[('type', '=', 'service')])
    supplier = fields.Many2One('party.party', "Supplier ID")
    setup_hours = fields.Float("Setup Hrs")
    special_instructions = fields.Text(
        "Special Instructions",
        help="Shown when the template is used on an operation.")
    extra_resources = fields.One2Many(
        'nline.engineering.operation_resource', 'template',
        "Additional Resources")


class OperationResource(ModelSQL, ModelView):
    "Operation Additional Resource"
    __name__ = 'nline.engineering.operation_resource'

    template = fields.Many2One(
        'nline.engineering.operation_template', "Template",
        ondelete='CASCADE')
    step = fields.Many2One(
        'production.routing.step', "Step", ondelete='CASCADE')
    work = fields.Many2One('production.work', "Work", ondelete='CASCADE')
    resource = fields.Many2One(
        'production.work.center', "Resource ID", required=True)
    step_type = fields.Selection([
            ('setup', "Setup"),
            ('run', "Run"),
            ('both', "Both"),
            ], "Step", required=True)
    duration_percent = fields.Float("Duration %")
    justification = fields.Selection([
            ('start', "At Start"),
            ('end', "At End"),
            ], "Justification", required=True)

    @classmethod
    def default_step_type(cls):
        return 'both'

    @classmethod
    def default_duration_percent(cls):
        return 100.0

    @classmethod
    def default_justification(cls):
        return 'start'

    def copy_to_work(self):
        return self.__class__(resource=self.resource,
            step_type=self.step_type, duration_percent=self.duration_percent,
            justification=self.justification)


class Variable(ModelSQL, ModelView):
    "Work Order Variable"
    __name__ = 'nline.engineering.variable'

    production = fields.Many2One(
        'production', "Work Order", ondelete='CASCADE')
    bom = fields.Many2One('production.bom', "Master", ondelete='CASCADE')
    name = fields.Char(
        "Name", required=True, strip=True,
        help="The name used in the dimensions of the materials.")
    value = fields.Float("Value")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('name', 'ASC')]


from . import desk  # noqa: E402 (it uses the classes above)

# The classes this module registers (see __init__.py)
MODELS = [
    Production, BOM, BOMInput, MaterialCard, Routing, RoutingStep, Work,
    OperationTemplate, OperationResource, Variable,
    ] + estimating.MODELS + desk.MODELS
WIZARDS = []
REPORTS = []
