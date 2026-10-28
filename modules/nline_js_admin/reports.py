# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The Jobshop reports: one generic engine for the 99 reports of Jobshop's
report list

A report is defined once (see the report_*.py files) with the decorator
`report`: its id, Jobshop name, group bar, .rpt, the Tryton models it reads,
its columns, its filters (Jobshop's report dialog: ID ranges, date ranges,
statuses, options), the columns it sorts and groups by. Its function
returns the rows (dicts by column key). The engine then applies the ranges,
statuses, the advanced filters and sorts (Jobshop's Advanced Filtering and
Sorting), groups with subtotals, totals and returns rows + columns to the
screen (RPC jsadmin_report_run). jsadmin_report_list returns the reports of
a group bar the user may run, with their filters.
"""
import datetime as dt
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

ZERO = Decimal(0)
MAX_ROWS = 20000

# The group bars and their reports, in Jobshop's order
GROUPS = ['inventory', 'engineering', 'estimating', 'sales', 'purchasing',
    'planning', 'shopfloor', 'accounting', 'common']
GROUP_NAMES = {
    'inventory': "Inventory", 'engineering': "Engineering",
    'estimating': "Estimating", 'sales': "Sales",
    'purchasing': "Purchasing", 'planning': "Planning",
    'shopfloor': "Shopfloor", 'accounting': "Accounting",
    'common': "Common",
    }

REPORTS = {}

NUMERIC = {'int', 'qty', 'money', 'num', 'pct'}


class Report:
    "A Jobshop report: its definition and the function making its rows"

    def __init__(self, func, id, name, group, rpt, models, columns,
            filters=(), sort=None, group_by=None, chart=None, totals=None,
            advanced=False, note=None, landscape=False):
        self.func = func
        self.id = id
        self.name = name
        self.group = group
        self.rpt = rpt
        self.models = tuple(models)
        self.columns = [self._column(c) for c in columns]
        self.filters = list(filters)
        self.sort = sort
        self.group_by = group_by
        self.chart = chart
        self.advanced = advanced
        self.note = note
        self.landscape = landscape
        if totals is None:
            totals = [c['key'] for c in self.columns
                if c['type'] in {'money'}]
        self.totals = set(totals)
        for column in self.columns:
            column['total'] = column['key'] in self.totals

    @staticmethod
    def _column(column):
        key, label = column[:2]
        type_ = column[2] if len(column) > 2 else 'char'
        return {'key': key, 'label': label, 'type': type_}

    def definition(self):
        return {
            'id': self.id,
            'name': self.name,
            'group': self.group,
            'rpt': self.rpt,
            'columns': self.columns,
            'filters': self.filters,
            'sort': self.sort or self.columns[0]['key'],
            'group_by': self.group_by,
            'advanced': self.advanced,
            'chart': self.chart,
            'note': self.note,
            'landscape': self.landscape,
            }


def report(id, name, group, rpt, models, columns, **kwargs):
    "Register the function as the rows of a Jobshop report"
    def decorator(func):
        REPORTS[id] = Report(func, id, name, group, rpt, models, columns,
            **kwargs)
        return func
    return decorator


# ---- The filters of the report dialogs -------------------------------------

def f_range(key, label, column=None):
    "From / To of an ID (applied to the column)"
    return {'type': 'range', 'key': key, 'label': label,
        'column': column or key}


def f_dates(key, label, column=None, default=None):
    "From / To dates (applied to the column)"
    return {'type': 'dates', 'key': key, 'label': label,
        'column': column or key, 'default': default}


def f_status(key, label, options, column=None, default=''):
    "One status of the list (applied to the column), '' for all"
    return {'type': 'select', 'key': key, 'label': label,
        'column': column or key, 'options': options, 'default': default}


def f_option(key, label, options, default=None):
    "A choice the report function uses"
    return {'type': 'option', 'key': key, 'label': label,
        'options': options, 'default': default or options[0][0]}


def f_check(key, label, default=False):
    "A check box the report function uses"
    return {'type': 'check', 'key': key, 'label': label, 'default': default}


def f_date(key, label, default='today'):
    "A date the report function uses (As of...)"
    return {'type': 'date', 'key': key, 'label': label, 'default': default}


class Params(dict):
    "The values of the report dialog, with the gaps the report found"

    def __init__(self, values):
        super().__init__(values or {})
        self.gaps = []

    def date(self, key):
        value = self.get(key)
        if isinstance(value, str):
            return dt.date.fromisoformat(value[:10]) if value else None
        return value

    def dates(self, key):
        "The (from, to) dates of a dates filter"
        return self.date(key + '_from'), self.date(key + '_to')

    def gap(self, message):
        if message not in self.gaps:
            self.gaps.append(message)

    def domain_dates(self, key, field):
        "The Tryton domain of a dates filter on a field"
        start, end = self.dates(key)
        domain = []
        if start:
            domain.append((field, '>=', start))
        if end:
            domain.append((field, '<=', end))
        return domain


# ---- Applying filters and sorts --------------------------------------------

def _comparable(value):
    if value is None:
        return (0, '')
    if isinstance(value, bool):
        return (1, int(value))
    if isinstance(value, (int, float, Decimal)):
        return (1, float(value))
    if isinstance(value, dt.datetime):
        return (2, value.date().isoformat())
    if isinstance(value, dt.date):
        return (2, value.isoformat())
    return (3, str(value).upper())


def _number(text):
    try:
        return float(str(text).replace(',', ''))
    except (TypeError, ValueError):
        return None


def _in_range(value, start, end):
    "The value is between the From and To of a range"
    if value is None or value == '':
        return not start and not end
    number = value if isinstance(value, (int, float, Decimal)) and \
        not isinstance(value, bool) else None
    for bound, test in ((start, lambda a, b: a >= b),
            (end, lambda a, b: a <= b)):
        if bound in (None, ''):
            continue
        if number is not None and _number(bound) is not None:
            if not test(float(number), _number(bound)):
                return False
        elif not test(str(value).upper(), str(bound).upper()):
            return False
    return True


def _date_of(value):
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value[:10])
        except ValueError:
            return None
    return value


CONDITIONS = ['=', '!=', '<', '<=', '>', '>=', 'contains', 'not contains',
    'starts with', 'is empty', 'is not empty']


def _test(value, condition, operand):
    "Advanced filter: the value meets the condition"
    if condition == 'is empty':
        return value in (None, '', False)
    if condition == 'is not empty':
        return value not in (None, '', False)
    text = '' if value is None else str(value)
    if condition == 'contains':
        return str(operand or '').upper() in text.upper()
    if condition == 'not contains':
        return str(operand or '').upper() not in text.upper()
    if condition == 'starts with':
        return text.upper().startswith(str(operand or '').upper())
    if isinstance(value, (int, float, Decimal)) and not isinstance(
            value, bool) and _number(operand) is not None:
        left, right = float(value), _number(operand)
    elif isinstance(value, (dt.date, dt.datetime)):
        left, right = _date_of(value).isoformat(), str(operand or '')[:10]
    else:
        left, right = text.upper(), str(operand or '').upper()
    if condition == '=':
        return left == right
    if condition == '!=':
        return left != right
    if condition == '<':
        return left < right
    if condition == '<=':
        return left <= right
    if condition == '>':
        return left > right
    if condition == '>=':
        return left >= right
    raise ValidationError(gettext('nline_js_admin.msg_unknown_condition',
            condition=condition))


def apply_filters(definition, rows, params):
    "Keep the rows within the ranges, dates and statuses of the dialog"
    for spec in definition.filters:
        kind = spec['type']
        key, column = spec['key'], spec.get('column')
        if column and column.startswith('_'):
            # Applied by the report function itself
            continue
        if kind == 'range':
            start, end = params.get(key + '_from'), params.get(key + '_to')
            if start in (None, '') and end in (None, ''):
                continue
            rows = [r for r in rows if _in_range(r.get(column), start, end)]
        elif kind == 'dates':
            start, end = params.dates(key)
            if not start and not end:
                continue

            def keep(row, start=start, end=end, column=column):
                value = _date_of(row.get(column))
                if value is None:
                    return False
                return ((not start or value >= start)
                    and (not end or value <= end))
            rows = [r for r in rows if keep(r)]
        elif kind == 'select':
            value = params.get(key)
            if value in (None, ''):
                continue
            rows = [r for r in rows if str(r.get(column) or '') == value]
    advanced = params.get('advanced') or {}
    conditions = [c for c in advanced.get('filters') or []
        if c.get('key') and c.get('condition')]
    if conditions:
        def match(row):
            result = None
            for c in conditions:
                ok = _test(row.get(c['key']), c['condition'], c.get('value'))
                if result is None:
                    result = ok
                elif (c.get('join') or 'and') == 'or':
                    result = result or ok
                else:
                    result = result and ok
            return result
        rows = [r for r in rows if match(r)]
    return rows


def sort_rows(definition, rows, params):
    "Sort By, then the advanced sorts"
    keys = []
    advanced = params.get('advanced') or {}
    for s in advanced.get('sort') or []:
        if s.get('key'):
            keys.append((s['key'], bool(s.get('desc'))))
    primary = params.get('sort') or definition.sort or \
        definition.columns[0]['key']
    if primary and primary not in [k for k, _ in keys]:
        keys.insert(0, (primary, bool(params.get('sort_desc'))))
    if definition.group_by and params.get('group', True):
        keys.insert(0, (definition.group_by, False))
    for key, desc in reversed(keys):
        rows.sort(key=lambda r: _comparable(r.get(key)), reverse=desc)
    return rows


def layout(definition, rows, params):
    """The rows of the screen: [{k: kind, v: values, d: drill}], kinds row,
    group (header), subtotal, total"""
    columns = definition.columns
    keys = [c['key'] for c in columns]
    totals = [c['key'] for c in columns if c['total']]

    def values(row):
        return [row.get(k) for k in keys]

    def summed(group_rows):
        result = []
        for c in columns:
            if c['total']:
                total = ZERO
                for r in group_rows:
                    v = r.get(c['key'])
                    if v not in (None, ''):
                        total += Decimal(str(v))
                result.append(total)
            else:
                result.append(None)
        return result

    out = []
    group_key = definition.group_by if params.get('group', True) else None
    if group_key:
        label_of = {c['key']: c['label'] for c in columns}
        current, members = object(), []

        def close():
            if members and totals:
                out.append({'k': 'subtotal', 'v': summed(members),
                        'l': "Total %s" % (members[0].get(group_key) or '')})
        for row in rows:
            value = row.get(group_key)
            if value != current:
                close()
                current, members = value, []
                out.append({'k': 'group', 'l': "%s: %s" % (
                            label_of.get(group_key, ''), value or '')})
            members.append(row)
            out.append({'k': 'row', 'v': values(row),
                    'd': row.get('_drill')})
        close()
    else:
        out = [{'k': 'row', 'v': values(r), 'd': r.get('_drill')}
            for r in rows]
    if totals and rows:
        out.append({'k': 'total', 'v': summed(rows), 'l': "Report Total"})
    return out


class DeskReports(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__rpc__['jsadmin_report_list'] = RPC()
        cls.__rpc__['jsadmin_report_run'] = RPC()

    @classmethod
    def _report_allowed(cls, definition, access):
        pool = Pool()
        for model in definition.models:
            try:
                pool.get(model)
            except KeyError:
                # A model of another area not installed: shown empty
                continue
            if not access.get(model, {}).get('read', False):
                return False
        return True

    @classmethod
    def jsadmin_report_list(cls, group=None):
        """The reports of a group bar (all groups when None) the user may
        run, with the filters of their dialogs"""
        pool = Pool()
        ModelAccess = pool.get('ir.model.access')
        models = set()
        for definition in REPORTS.values():
            models.update(definition.models)
        installed = []
        for model in models:
            try:
                pool.get(model)
                installed.append(model)
            except KeyError:
                pass
        access = ModelAccess.get_access(installed)
        result = []
        for name in GROUPS:
            if group and name != group:
                continue
            for definition in REPORTS.values():
                if definition.group != name:
                    continue
                if not cls._report_allowed(definition, access):
                    continue
                result.append(definition.definition())
        return result

    @classmethod
    def jsadmin_report_run(cls, report_id, params=None):
        """Run a Jobshop report: {id, name, title, subtitle, columns, rows,
        count, truncated, gaps}"""
        definition = REPORTS.get(report_id)
        if not definition:
            raise ValidationError(gettext(
                    'nline_js_admin.msg_unknown_report', report=report_id))
        pool = Pool()
        for model in definition.models:
            try:
                pool.get(model)
            except KeyError:
                continue
            cls._check_read(model)
        params = Params(params)
        company = cls._company()
        with Transaction().set_context(company=company.id):
            rows = definition.func(cls, params) or []
        rows = apply_filters(definition, rows, params)
        rows = sort_rows(definition, rows, params)
        count = len(rows)
        truncated = count > MAX_ROWS
        if truncated:
            rows = rows[:MAX_ROWS]
        return {
            'id': definition.id,
            'name': definition.name,
            'title': definition.name,
            'company': company.rec_name,
            'subtitle': cls._report_subtitle(definition, params),
            'columns': definition.columns,
            'rows': layout(definition, rows, params),
            'chart': cls._report_chart(definition, rows),
            'count': count,
            'truncated': truncated,
            'gaps': params.gaps,
            'note': definition.note,
            'landscape': definition.landscape,
            }

    @staticmethod
    def _report_subtitle(definition, params):
        "The ranges of the dialog, as Jobshop prints them under the title"
        parts = []
        for spec in definition.filters:
            key = spec['key']
            if spec['type'] in {'range', 'dates'}:
                start = params.get(key + '_from')
                end = params.get(key + '_to')
                if start or end:
                    parts.append('%s: %s - %s' % (spec['label'],
                            start or '', end or ''))
            elif spec['type'] in {'select', 'option'}:
                value = params.get(key)
                labels = dict((str(o[0]), o[1]) for o in spec['options'])
                if value not in (None, ''):
                    parts.append('%s: %s' % (spec['label'],
                            labels.get(str(value), value)))
            elif spec['type'] == 'date' and params.get(key):
                parts.append('%s: %s' % (spec['label'], params.get(key)))
            elif spec['type'] == 'check' and params.get(key):
                parts.append(spec['label'])
        return '; '.join(parts)

    @staticmethod
    def _report_chart(definition, rows):
        """The graph of the graphical reports: the value column summed by
        the label column"""
        if not definition.chart:
            return None
        label_key, value_key = definition.chart['label'], \
            definition.chart['value']
        sums = {}
        for row in rows:
            label = row.get(label_key)
            label = '' if label is None else str(label)
            sums[label] = sums.get(label, 0.0) + float(
                row.get(value_key) or 0)
        items = sorted(sums.items(), key=lambda i: -i[1])[:25]
        return {
            'title': definition.chart.get('title') or definition.name,
            'kind': definition.chart.get('kind', 'hbar'),
            'labels': [i[0] for i in items],
            'series': [{'label': next(c['label'] for c in definition.columns
                            if c['key'] == value_key),
                    'values': [round(i[1], 2) for i in items]}],
            }


# ---- Helpers of the report functions ---------------------------------------

def model(name):
    "The Tryton model or None (a model of an area not installed yet)"
    try:
        return Pool().get(name)
    except KeyError:
        return None


def first_model(*names):
    for name in names:
        Model = model(name)
        if Model is not None:
            return Model
    return None


def plain(value):
    """A value of a record as the screen shows it: a record as its name,
    records joined, a time as HH:MM, a duration in hours"""
    if hasattr(value, 'rec_name'):
        return value.rec_name
    if isinstance(value, (list, tuple)):
        return ', '.join(plain(v) or '' for v in value)
    if isinstance(value, dt.timedelta):
        return round(value.total_seconds() / 3600, 2)
    if isinstance(value, dt.time):
        return value.strftime('%H:%M')
    return value


def attr(record, *names):
    """The first of the attributes the record has (fields other areas add),
    as text for a record"""
    for name in names:
        if record is not None and name in getattr(record, '_fields', {}):
            return plain(getattr(record, name))
    return None


def has_field(Model, name):
    return Model is not None and name in Model._fields


def name(record):
    return record.rec_name if record else ''


def code(party):
    "Jobshop's customer / supplier ID: the party code"
    if not party:
        return ''
    return party.code or party.name


def part_id(product):
    if not product:
        return ''
    return product.code or product.rec_name


def dec(value):
    if value is None:
        return ZERO
    return Decimal(str(value))


def hours(duration):
    return round(duration.total_seconds() / 3600, 2) if duration else 0.0


# Jobshop's statuses of the Tryton states
SALE_STATUS = {
    'draft': "Firmed", 'quotation': "Firmed", 'confirmed': "Released",
    'processing': "Released", 'done': "Closed", 'cancelled': "Cancelled",
    }
QUOTE_STATUS = {
    'draft': "Active", 'quotation': "Ready", 'confirmed': "Won",
    'processing': "Won", 'done': "Won", 'cancelled': "Lost",
    # nline.quote (nline_js_engineering)
    'active': "Active", 'ready': "Ready", 'won': "Won", 'lost': "Lost",
    }
PURCHASE_STATUS = SALE_STATUS
WORK_ORDER_STATUS = {
    'request': "Unreleased", 'draft': "Firmed", 'waiting': "Released",
    'assigned': "Released", 'running': "Released", 'done': "Closed",
    'cancelled': "Cancelled",
    }
ORDER_STATUSES = [['Firmed', "Firmed"], ['Released', "Released"],
    ['Closed', "Closed"], ['Cancelled', "Cancelled"]]
WORK_ORDER_STATUSES = [['Unreleased', "Unreleased"], ['Firmed', "Firmed"],
    ['Released', "Released"], ['Closed', "Closed"],
    ['Cancelled', "Cancelled"]]


def code_rows(params, label, candidates, extra=None, id_fields=None,
        description_fields=None):
    """The rows of a code table list (ID, Description): the first model of
    the candidates installed (other areas add them); a gap when none"""
    Model = first_model(*candidates)
    if Model is None:
        params.gap("%s: no Tryton table yet (expected %s)." % (
                label, ' or '.join(candidates)))
        return []
    with Transaction().set_context(active_test=False):
        records = Model.search([])
    rows = []
    for record in records:
        row = {
            'id': attr(record, *(id_fields or ('code', 'name'))) or '',
            'description': attr(record, *(description_fields or (
                        'description', 'name'))) or '',
            'active': attr(record, 'active') is not False,
            '_drill': {'type': 'record', 'model': Model.__name__,
                'id': record.id},
            }
        for key, names in (extra or {}).items():
            row[key] = attr(record, *names)
        rows.append(row)
    return rows


def quantities(product_ids=None, location_ids=None, date=None,
        grouping=('product',)):
    """On hand {(location, product): quantity} of the storage locations
    (each warehouse's storage with its children)"""
    pool = Pool()
    Product = pool.get('product.product')
    Location = pool.get('stock.location')
    if location_ids is None:
        location_ids = [l.id for l in Location.search([
                    ('type', '=', 'storage')])]
    if not location_ids:
        return {}
    context = {}
    if date:
        context['stock_date_end'] = date
    with Transaction().set_context(**context):
        return Product.products_by_location(location_ids,
            with_childs=False, grouping=grouping,
            grouping_filter=(product_ids,) if product_ids else None)


def shipped(line):
    "The quantity of the sale line shipped (less the returns)"
    total = 0.0
    for move in line.moves:
        if move.state != 'done':
            continue
        total += move.quantity if move.to_location.type == 'customer' \
            else -move.quantity
    return total


def received(line):
    "The quantity of the purchase line received (less the returns)"
    total = 0.0
    for move in line.moves:
        if move.state != 'done':
            continue
        total += move.quantity if move.from_location.type == 'supplier' \
            else -move.quantity
    return total


def move_cost(move):
    "The cost of a stock move: its cost price (done) or the product's"
    price = move.cost_price if move.state == 'done' and \
        move.cost_price is not None else (move.product.cost_price or ZERO)
    return (price * dec(move.quantity)).quantize(Decimal('0.01'))


def production_costs(production):
    """The estimated and actual costs of a work order: material (inputs),
    labor (work cycles), service (outside service purchases)"""
    material_est = sum((move_cost(m) for m in production.inputs), ZERO)
    material_act = sum((move_cost(m) for m in production.inputs
            if m.state == 'done'), ZERO)
    labor_act = ZERO
    labor_est = ZERO
    hours_act = 0.0
    hours_est = 0.0
    service = ZERO
    for work in getattr(production, 'works', None) or []:
        for cycle in work.cycles:
            if cycle.state == 'done':
                labor_act += cycle.cost or ZERO
                hours_act += hours(cycle.duration)
        planned = getattr(work, 'planned_duration', None)
        if planned:
            hours_est += hours(planned)
            rate = work.work_center.cost_price if work.work_center else None
            if rate:
                method = getattr(work.work_center, 'cost_method', 'hour')
                if method == 'hour':
                    labor_est += dec(hours(planned)) * rate
    # The outside services bought for the work order
    for line in getattr(production, 'purchase_lines', None) or []:
        if line.purchase.state == 'cancelled':
            continue
        cost = getattr(line, 'production_cost_amount', None)
        service += cost if cost is not None else (line.amount or ZERO)
    return {
        'material_est': material_est, 'material_act': material_act,
        'labor_est': labor_est.quantize(Decimal('0.01')),
        'labor_act': labor_act.quantize(Decimal('0.01')),
        'hours_est': round(hours_est, 2), 'hours_act': round(hours_act, 2),
        'service': service,
        }
