# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Shop Resources, Shop Groups, Shop Views and resource calendars.

A Jobshop shop resource is a Tryton work center (the migration made one per
SHOPFLOOR_SHOP_RESOURCE row under the "N-Line Shop" center); a shop group is
a resource of type Group with its members; a shop view is a named list of
resources (a filter of the schedule)."""
from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, fields
from trytond.model.exceptions import ValidationError
from trytond.modules.nline_js_common.common import CodeTable
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval

COST_DIGITS = (16, 4)

RESOURCE_TYPES = [
    ('machine', "Machine"),
    ('assembly', "Assembly Area"),
    ('general', "General Area"),
    ('contractor', "Contractor"),
    ('group', "Group"),
    ('team', "Team/Individual"),
    ]
# SHOPFLOOR_SHOP_RESOURCE.RESOURCE_TYPE (text in the N-Line database, the
# number of the schema in older ones)
JS_RESOURCE_TYPES = {
    'MACHINE': 'machine', '0': 'machine',
    'ASSEMBLY': 'assembly', '1': 'assembly',
    'GENERAL': 'general', '2': 'general',
    'CONTRACTOR': 'contractor', '3': 'contractor',
    'GROUP': 'group', '4': 'group',
    'TEAM': 'team', '5': 'team',
    }

# The costs of a resource (Costs tab), as SHOPFLOOR_SHOP_RESOURCE names them
COST_FIELDS = {
    'setup_per_hr': 'SETUP_PER_HR',
    'run_per_hr': 'RUN_PER_HR',
    'run_per_unit': 'RUN_PER_UNIT',
    'bur_per_hr_setup': 'BUR_PER_HR_SETUP',
    'bur_percent_setup': 'BUR_PERCENT_SETUP',
    'bur_per_hr_run': 'BUR_PER_HR_RUN',
    'bur_percent_run': 'BUR_PERCENT_RUN',
    'bur_per_unit_run': 'BUR_PER_UNIT_RUN',
    'bur_per_oper': 'BUR_PER_OPER',
    'act_bur_per_hr_setup': 'ACT_BUR_PER_HR_SETUP',
    'act_bur_percent_setup': 'ACT_BUR_PERCENT_SETUP',
    'act_bur_per_hr_run': 'ACT_BUR_PER_HR_RUN',
    'act_bur_percent_run': 'ACT_BUR_PERCENT_RUN',
    'act_bur_per_unit_run': 'ACT_BUR_PER_UNIT_RUN',
    'act_bur_per_oper': 'ACT_BUR_PER_OPER',
    }


def cost_field(string, help=''):
    return fields.Numeric(string, digits=COST_DIGITS, help=help)


class WorkCenter(metaclass=PoolMeta):
    "Shop Resource"
    __name__ = 'production.work.center'
    description = fields.Char("Description")
    resource_type = fields.Selection(RESOURCE_TYPES, "Resource Type",
        required=True)
    schedule_method = fields.Selection([
            ('finite', "Finite"),
            ('infinite', "Infinite"),
            ], "Schedule Method", required=True)
    schedule_type = fields.Selection([
            ('normal', "Normal"),
            ('discontinuous', "Discontinuous"),
            ], "Schedule Type", required=True)
    exclusivity = fields.Selection([
            ('exclusive', "Exclusive"),
            ('inclusive', "Inclusive"),
            ], "Group Exclusivity", required=True)
    min_segment_size = fields.Float("Min Segment Size",
        help="The smallest block of hours of a discontinuous operation.")
    shift_1_capacity = fields.Integer("Shift 1 Capacity")
    shift_2_capacity = fields.Integer("Shift 2 Capacity")
    shift_3_capacity = fields.Integer("Shift 3 Capacity")
    auto_reporting = fields.Boolean("Auto Report",
        help="The resource is reported complete automatically.")
    special_instructions = fields.Text("Special Instructions",
        help="Shown when the resource is used on an operation card.")
    # Jobshop's Inactive check box: Tryton's Active the other way round
    inactive = fields.Function(fields.Boolean("Inactive"),
        'get_inactive', setter='set_inactive', searcher='search_inactive')
    # Costs tab: the estimated labor rates and the burden, estimated and
    # actual (Jobshop's ACT_BUR_*)
    setup_per_hr = cost_field("Setup/Hr")
    run_per_hr = cost_field("Run/Hr")
    run_per_unit = cost_field("Run/Unit")
    bur_per_hr_setup = cost_field("Burden/Hr (Setup)")
    bur_percent_setup = cost_field("Burden % (Setup)")
    bur_per_hr_run = cost_field("Burden/Hr (Run)")
    bur_percent_run = cost_field("Burden % (Run)")
    bur_per_unit_run = cost_field("Burden/Unit (Run)")
    bur_per_oper = cost_field("Burden/Operation",
        help="The fixed burden charged once per operation.")
    act_bur_per_hr_setup = cost_field("Actual Burden/Hr (Setup)")
    act_bur_percent_setup = cost_field("Actual Burden % (Setup)")
    act_bur_per_hr_run = cost_field("Actual Burden/Hr (Run)")
    act_bur_percent_run = cost_field("Actual Burden % (Run)")
    act_bur_per_unit_run = cost_field("Actual Burden/Unit (Run)")
    act_bur_per_oper = cost_field("Fixed Burden",
        help="The fixed burden charged on the first labor ticket of an "
        "operation.")
    members = fields.One2Many('nline.js.resource.member', 'group',
        "Members",
        states={
            'invisible': Eval('resource_type') != 'group',
            })
    calendar_weeks = fields.One2Many('nline.js.calendar.week', 'resource',
        "Weekly Calendar")
    calendar_changes = fields.One2Many('nline.js.calendar.change',
        'resource', "Calendar Exceptions")

    @classmethod
    def default_resource_type(cls):
        return 'machine'

    @classmethod
    def default_schedule_method(cls):
        return 'infinite'

    @classmethod
    def default_schedule_type(cls):
        return 'normal'

    @classmethod
    def default_exclusivity(cls):
        return 'inclusive'

    @classmethod
    def default_shift_1_capacity(cls):
        return 1

    def get_inactive(self, name):
        return not self.active

    @classmethod
    def set_inactive(cls, centers, name, value):
        cls.write(centers, {'active': not value})

    @classmethod
    def search_inactive(cls, name, clause):
        _, operator, value = clause
        if operator in {'=', '!='}:
            if operator == '!=':
                value = not value
            return [('active', '=', not value)]
        return []

    @classmethod
    def default_auto_reporting(cls):
        return False

    @classmethod
    def search_rec_name(cls, name, clause):
        domain = super().search_rec_name(name, clause)
        _, operator, *value = clause
        if operator.startswith('!') or operator.startswith('not '):
            return domain
        return ['OR', domain, ('description',) + tuple(clause[1:])]

    def js_rates(self, step):
        """The Jobshop rates of the resource for a labor step (setup, run
        or indirect): labor and burden, estimated and actual"""
        z = 0
        if step == 'setup':
            return {
                'labor_per_hr': self.setup_per_hr or z,
                'labor_per_unit': z,
                'burden_per_hr': self.act_bur_per_hr_setup or
                self.bur_per_hr_setup or z,
                'burden_per_unit': z,
                'burden_percent': self.act_bur_percent_setup or
                self.bur_percent_setup or z,
                'burden_per_oper': self.act_bur_per_oper or
                self.bur_per_oper or z,
                }
        if step == 'run':
            return {
                'labor_per_hr': self.run_per_hr or z,
                'labor_per_unit': self.run_per_unit or z,
                'burden_per_hr': self.act_bur_per_hr_run or
                self.bur_per_hr_run or z,
                'burden_per_unit': self.act_bur_per_unit_run or
                self.bur_per_unit_run or z,
                'burden_percent': self.act_bur_percent_run or
                self.bur_percent_run or z,
                'burden_per_oper': self.act_bur_per_oper or
                self.bur_per_oper or z,
                }
        return {k: z for k in ['labor_per_hr', 'labor_per_unit',
                'burden_per_hr', 'burden_per_unit', 'burden_percent',
                'burden_per_oper']}

    @classmethod
    def copy(cls, centers, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('calendar_weeks', None)
        default.setdefault('calendar_changes', None)
        return super().copy(centers, default=default)

    @classmethod
    def validate(cls, centers):
        super().validate(centers)
        for center in centers:
            if center.resource_type != 'group' and center.members:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_members_not_group',
                        resource=center.rec_name))


class ResourceMember(ModelSQL, ModelView):
    "Shop Group Member"
    __name__ = 'nline.js.resource.member'
    group = fields.Many2One('production.work.center', "Shop Group",
        required=True, ondelete='CASCADE',
        domain=[('resource_type', '=', 'group')])
    sequence = fields.Integer("Seq #")
    resource = fields.Many2One('production.work.center', "Resource ID",
        required=True, ondelete='CASCADE',
        domain=[('resource_type', '!=', 'group')])
    efficiency = fields.Float("Efficiency",
        help="Levels members of slightly different capability.")
    description = fields.Function(fields.Char("Description"),
        'get_resource_field')
    resource_type = fields.Function(fields.Selection(RESOURCE_TYPES,
            "Resource Type"), 'get_resource_field')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('group', 'ASC'), ('sequence', 'ASC'), ('id', 'ASC')]

    def get_resource_field(self, name):
        return getattr(self.resource, name, None) if self.resource else None

    @classmethod
    def create(cls, vlist):
        vlist = next_sequences(cls, vlist, 'group')
        return super().create(vlist)

    @classmethod
    def validate(cls, members):
        super().validate(members)
        for member in members:
            if member.resource.resource_type == 'group':
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_group_nested',
                        resource=member.resource.rec_name))
            if member.resource == member.group:
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_group_itself',
                        resource=member.resource.rec_name))


def next_sequences(Model, vlist, parent):
    """Give the lines without a sequence the next one in steps of 10, as
    Jobshop does for group and view members"""
    vlist = [v.copy() for v in vlist]
    last = {}
    for values in vlist:
        if values.get('sequence') is not None or not values.get(parent):
            continue
        key = values[parent]
        if key not in last:
            lines = Model.search([(parent, '=', key)],
                order=[('sequence', 'DESC NULLS LAST')], limit=1)
            last[key] = (lines[0].sequence or 0) if lines else 0
        last[key] += 10
        values['sequence'] = last[key]
    return vlist


class ShopView(CodeTable):
    "Shop View"
    __name__ = 'nline.js.shop_view'
    resource_lines = fields.One2Many('nline.js.shop_view.resource', 'view',
        "Resources")


class ShopViewResource(ModelSQL, ModelView):
    "Shop View Resource"
    __name__ = 'nline.js.shop_view.resource'
    view = fields.Many2One('nline.js.shop_view', "Shop View", required=True,
        ondelete='CASCADE')
    sequence = fields.Integer("Seq #")
    resource = fields.Many2One('production.work.center', "Resource ID",
        required=True, ondelete='CASCADE')
    description = fields.Function(fields.Char("Description"),
        'get_resource_field')
    resource_type = fields.Function(fields.Selection(RESOURCE_TYPES,
            "Resource Type"), 'get_resource_field')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('view', 'ASC'), ('sequence', 'ASC'), ('id', 'ASC')]

    def get_resource_field(self, name):
        return getattr(self.resource, name, None) if self.resource else None

    @classmethod
    def create(cls, vlist):
        vlist = next_sequences(cls, vlist, 'view')
        return super().create(vlist)

    @classmethod
    def validate(cls, lines):
        super().validate(lines)
        for line in lines:
            if cls.search([
                        ('view', '=', line.view.id),
                        ('resource', '=', line.resource.id),
                        ('id', '!=', line.id),
                        ], limit=1):
                raise ValidationError(gettext(
                        'nline_js_shopfloor.msg_view_duplicate',
                        resource=line.resource.rec_name,
                        view=line.view.rec_name))


DAYS = [
    # Jobshop's DAY_OF_WEEK: 0 = Saturday
    ('0', "Saturday"), ('1', "Sunday"), ('2', "Monday"), ('3', "Tuesday"),
    ('4', "Wednesday"), ('5', "Thursday"), ('6', "Friday"),
    ]


class CalendarMixin:
    __slots__ = ()
    resource = fields.Many2One('production.work.center', "Resource",
        ondelete='CASCADE',
        help="Leave empty for the shop's default calendar.")
    employee = fields.Many2One('company.employee', "Employee",
        ondelete='CASCADE')
    start_of_day = fields.Time("Start of Day")
    shift_1 = fields.Float("Shift 1 Hours")
    shift_2 = fields.Float("Shift 2 Hours")
    shift_3 = fields.Float("Shift 3 Hours")
    shift_1_capacity = fields.Integer("Shift 1 Capacity")
    shift_2_capacity = fields.Integer("Shift 2 Capacity")
    shift_3_capacity = fields.Integer("Shift 3 Capacity")


class CalendarWeek(CalendarMixin, ModelSQL, ModelView):
    "Weekly Calendar"
    __name__ = 'nline.js.calendar.week'
    day_of_week = fields.Selection(DAYS, "Day of Week", required=True,
        sort=False)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('resource', 'ASC NULLS FIRST'),
            ('day_of_week', 'ASC')]


class CalendarChange(CalendarMixin, ModelSQL, ModelView):
    "Calendar Exception"
    __name__ = 'nline.js.calendar.change'
    start_date = fields.Date("Start Date", required=True)
    end_date = fields.Date("End Date", required=True,
        domain=[('end_date', '>=', Eval('start_date'))])
    reason_code = fields.Many2One('nline.reason_code', "Reason Code",
        ondelete='RESTRICT')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('start_date', 'DESC'), ('id', 'DESC')]


def shop_center():
    "The work center of the work orders (migration's SHOP), if any"
    WorkCenter = Pool().get('production.work.center')
    centers = WorkCenter.search([('name', '=', 'N-Line Shop')], limit=1)
    return centers[0] if centers else None
