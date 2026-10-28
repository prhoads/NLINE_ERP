# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop's Material Planning window (Planning > Material Planning): Open
Sales Orders, Non-Stocked Parts, Outside Services and Stocked Parts, and the
Supply & Demand dialog.

The links of Jobshop are the ones the ERP has: a work order made for a sales
order line (its origin) or a Job covering several lines (nline_job); an
outside service bought by a purchase line (nline_outside_service); a material
card bought by a purchase line (nline_js_purchasing's nline.purchase.link,
Jobshop's PURCHASING_ORDER_LINK: work order, seq no and piece no)."""
import datetime as dt
import re
from decimal import Decimal
from collections import defaultdict

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from trytond.modules.nline_desk.desk import _date, accept_warnings

# Jobshop's status of a work order (Tryton production state, when
# nline_js_engineering's order_status is not known)
WO_STATUS = {
    'request': "Unreleased",
    'draft': "Unreleased",
    'waiting': "Released",
    'assigned': "Released",
    'running': "Released",
    'done': "Closed",
    'cancelled': "Cancelled",
    }
ORDER_STATUS = {
    'unreleased': "Unreleased",
    'firm': "Firm",
    'hold': "Hold",
    'released': "Released",
    'closed': "Closed",
    'cancelled': "Cancelled",
    }


def wo_status(production):
    "Jobshop's status of the work order (Firm and Hold: planning_status)"
    status = getattr(production, 'order_status', None)
    return ORDER_STATUS.get(status) or WO_STATUS.get(production.state)


# The open work orders: their demand and supply count
WO_OPEN = ['request', 'draft', 'waiting', 'assigned', 'running']
# Jobshop's status of a sales order (Tryton sale state)
SO_STATUS = {
    'draft': "Unreleased",
    'quotation': "Firm",
    'confirmed': "Released",
    'processing': "Released",
    'done': "Closed",
    'cancelled': "Cancelled",
    }
# The statuses a sales order may change to (nline_js_sales'
# sales_order_status: Tryton's workflow, Hold and Closed as flags)
SO_CHANGES = {
    'draft': ["Firm", "Released", "Hold", "Cancelled"],
    'quotation': ["Unreleased", "Released", "Hold", "Cancelled"],
    'confirmed': ["Hold", "Closed"],
    'processing': ["Hold", "Closed"],
    'done': ["Hold"],
    'cancelled': ["Unreleased"],
    }


def so_status(sale):
    "Jobshop's status of the sales order"
    if _field(sale, 'js_hold'):
        return "Hold"
    if _field(sale, 'js_closed'):
        return "Closed"
    return SO_STATUS.get(sale.state, sale.state)


def so_changes(sale):
    "The statuses the sales order may change to"
    changes = list(SO_CHANGES.get(sale.state, []))
    current = so_status(sale)
    if current in ("Hold", "Closed"):
        # Back to the status of its state
        changes.insert(0, SO_STATUS.get(sale.state))
    return [c for c in changes if c != current]


# Jobshop's status of a material card (its stock move's state)
MATERIAL_STATUS = {
    'staging': "Unreleased",
    'draft': "Released",
    'assigned': "Released",
    'done': "Closed",
    'cancelled': "Cancelled",
    }


# Firm and Released: the open sales orders of Material Planning
SO_OPEN = ['quotation', 'confirmed', 'processing']
PO_OPEN = ['draft', 'quotation', 'confirmed', 'processing']
PO_STATUS = {
    'draft': "Unreleased",
    'quotation': "Firm",
    'confirmed': "Released",
    'processing': "Released",
    'done': "Closed",
    'cancelled': "Cancelled",
    }


def _field(record, *names):
    "The first of these fields the record's model has and is set"
    if record is None:
        return None
    for name in names:
        if name in record._fields:
            value = getattr(record, name)
            if value is not None:
                return value
    return None


def _days(value):
    if value is None:
        return None
    if isinstance(value, dt.timedelta):
        return value.days
    return int(value)


def _code(record):
    "The ID of a code table record, a party or a product"
    if record is None:
        return ''
    for name in ('code', 'name'):
        value = getattr(record, name, None)
        if isinstance(value, str) and value:
            return value
    return record.rec_name


def _qty(value):
    "A quantity as Jobshop shows it in a text (no trailing zeros)"
    return ('%f' % (value or 0)).rstrip('0').rstrip('.')


def split_number(production):
    """Jobshop's Work ID, Lot ID, Split ID and Sub ID of a work order or leg:
    the number is <work id>[/<lot>][.<split>] (as imported) and a leg is
    <work order>/<sub id>"""
    root = production
    while root.parent:
        root = root.parent
    number = root.number or str(root.id)
    match = re.match(r'^(.*?)(?:/([^/.]+))?(?:\.([^/.]+))?$', number)
    work, lot, split = match.groups() if match else (number, None, None)
    sub = production.leg_index if production.parent else 0
    return {
        'work_id': work or number,
        'lot_id': lot or '1',
        'split_id': split or '0',
        'sub_id': str(sub or 0),
        'number': number,
        }


class DeskMaterialPlanning(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['js_planning_link', 'js_planning_unlink',
                'js_planning_create_work_order', 'js_planning_sale_status',
                'js_planning_purchase', 'js_planning_rfq']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['js_planning_access', 'js_planning_sales',
                'js_planning_non_stocked', 'js_planning_outside',
                'js_planning_stocked', 'js_planning_new_work_order',
                'js_planning_link_targets', 'js_supply_demand']:
            cls.__rpc__[name] = RPC()

    # ---- Helpers ---------------------------------------------------------

    @classmethod
    def _js_may(cls, model, mode):
        ModelAccess = Pool().get('ir.model.access')
        return bool(ModelAccess.check(model, mode, raise_exception=False))

    @classmethod
    def js_planning_access(cls):
        """What the user may do in Material Planning and Scheduling (the
        screen shows only that)"""
        cls._check_read('production')
        may = cls._js_may
        return {
            'work_order': may('production', 'create'),
            'link': may('production', 'write') and may(
                'production.job.coverage', 'create'),
            'purchase': may('purchase.purchase', 'create') and may(
                'purchase.line', 'create'),
            'request': may('purchase.request', 'create'),
            'sale_status': may('sale.sale', 'write'),
            'rfq': may('nline.rfq', 'create') and may(
                'nline.rfq.line', 'create'),
            'schedule': may('nline.js.schedule.operation', 'create'),
            'calendar': may('nline.js.calendar.week', 'write'),
            'move': may('production', 'write'),
            }

    @classmethod
    def _js_stock(cls, products, date_end=None):
        "On hand quantity (stock unit) of the products in the warehouses"
        Product = Pool().get('product.product')
        products = [p for p in products if p]
        if not products:
            return {}
        with Transaction().set_context(locations=cls._warehouse_ids(),
                with_childs=True, stock_date_end=date_end or dt.date.today()):
            return {p.id: p.quantity for p in Product.browse(products)}

    @classmethod
    def _js_prefetch_points(cls, products, cache):
        "Read the order points of many parts at once (into the cache)"
        try:
            OrderPoint = Pool().get('stock.order_point')
        except KeyError:
            return
        ids = list({p.id for p in products if p})
        points = cache.setdefault('_points', {})
        for i in range(0, len(ids), 1000):
            for point in OrderPoint.search([
                        ('product', 'in', ids[i:i + 1000]),
                        ('type', 'in', ['purchase', 'production']),
                        ]):
                points.setdefault(point.product.id, point)
        for pid in ids:
            points.setdefault(pid, None)

    @classmethod
    def _js_order_point(cls, product, cache=None):
        if cache is not None and product.id in cache.get('_points', {}):
            return cache['_points'][product.id]
        pool = Pool()
        try:
            OrderPoint = pool.get('stock.order_point')
        except KeyError:
            return None
        points = OrderPoint.search([
                ('product', '=', product.id),
                ('type', 'in', ['purchase', 'production']),
                ], limit=1)
        return points[0] if points else None

    @classmethod
    def _planning_part(cls, product, cache=None):
        """The part's planning data as Jobshop's Part window has it (the
        fields of the Inventory area when they exist, else Tryton's)"""
        if cache is not None and product in cache:
            return cache[product]
        info = {'product': None, 'part_id': '', 'description': '',
            'fabricated': False, 'purchased': False, 'stocked': False,
            'tool': False, 'lead_time': None, 'order_point': None,
            'safety_stock': None, 'target': None, 'product_code': '',
            'commodity_code': '', 'supplier': None, 'supplier_id': '',
            'supplier_part_id': '', 'mfg_name': '', 'mfg_part_id': '',
            'stock_um': '', 'active': True, 'point_type': None,
            'eng_id': '', 'drawing_id': '', 'drawing_rev': '',
            'primary_loc_id': '', 'unit_mat_cost': None,
            'restocking_level': None, 'minimum_order_qty': None,
            'multiple_order_qty': None, 'pref_suppliers': ['', '', '', '', '']}
        if product:
            template = product.template
            point = cls._js_order_point(product, cache)
            suppliers = list(product.product_suppliers_used()) if hasattr(
                product, 'product_suppliers_used') else []
            supplier = suppliers[0] if suppliers else None
            pref = _field(template, 'preferred_supplier', 'pref_supplier')
            lead = _days(_field(template, 'planning_leadtime',
                    'planning_lead_time', 'lead_time_days'))
            if lead is None and product.producible:
                times = [l.lead_time for l in getattr(
                        product, 'lead_times', []) or [] if l.lead_time]
                lead = _days(times[0]) if times else None
            if lead is None and supplier and supplier.lead_time:
                lead = _days(supplier.lead_time)
            stocked = _field(template, 'stocked')
            if stocked is None:
                stocked = bool(point)
            order_point = _field(template, 'order_point', 'order_point_qty')
            if order_point is None and point:
                order_point = point.min_quantity
            info.update({
                    'product': product.id,
                    'part_id': product.code or product.rec_name,
                    'description': product.name,
                    'fabricated': bool(product.producible),
                    'purchased': bool(product.purchasable),
                    'stocked': bool(stocked),
                    'tool': bool(_field(template, 'tool_or_fixture',
                            'tool')),
                    'lead_time': lead,
                    'order_point': order_point,
                    'safety_stock': _field(template, 'safety_stock',
                        'safety_stock_qty'),
                    'target': point.target_quantity if point else None,
                    'point_type': point.type if point else None,
                    'product_code': _code(_field(template, 'product_code')),
                    'commodity_code': _code(_field(template,
                            'commodity_code')),
                    'supplier': (pref.id if pref else
                        supplier.party.id if supplier else None),
                    'supplier_id': _code(pref) if pref else (
                        _code(supplier.party) if supplier else ''),
                    'supplier_part_id': (supplier.code or '')
                    if supplier else '',
                    'mfg_name': _field(template, 'mfg_name') or '',
                    'mfg_part_id': _field(template, 'mfg_part_id') or '',
                    'stock_um': product.default_uom.symbol,
                    'active': bool(product.active and template.active)
                    and not _field(template, 'inactive'),
                    'eng_id': _field(template, 'engineering_revision') or '',
                    'drawing_id': _field(template, 'drawing_number') or '',
                    'drawing_rev': _field(template, 'drawing_revision')
                    or '',
                    'primary_loc_id': _code(_field(template,
                            'primary_location')),
                    'unit_mat_cost': _field(template, 'unit_material_cost'),
                    'restocking_level': _field(template,
                        'maximum_stock_qty') or (point.max_quantity
                        if point and getattr(point, 'max_quantity', None)
                        else None),
                    'minimum_order_qty': _field(template,
                        'minimum_order_qty'),
                    'multiple_order_qty': _field(template,
                        'multiple_order_qty'),
                    'pref_suppliers': [_code(_field(template, name))
                        for name in ('preferred_supplier',
                            'preferred_supplier_2', 'preferred_supplier_3',
                            'preferred_supplier_4', 'preferred_supplier_5')],
                    })
            if not info['pref_suppliers'][0]:
                info['pref_suppliers'][0] = info['supplier_id']
        if cache is not None:
            cache[product] = info
        return info

    @classmethod
    def _js_projected(cls, rows, key, qty_key, date_key):
        """Jobshop's Projected Available of the rows: the part's available
        quantity less the running demand of its rows by date"""
        running = {}
        for row in sorted(rows, key=lambda r: (r[date_key] or dt.date.max,
                    r.get('sort', 0))):
            if not row.get(key):
                row['projected'] = None
                continue
            left = running.get(row[key], row['qty_available'] or 0)
            left -= row[qty_key] or 0
            running[row[key]] = left
            row['projected'] = left

    @classmethod
    def _js_rfq_quantities(cls, productions):
        """The quantity of the open requests for quote linked to each
        (production, seq no, piece no) and (production, work)"""
        pool = Pool()
        result = defaultdict(float)
        try:
            Link = pool.get('nline.rfq.link')
        except KeyError:
            return result
        if not cls._js_may('nline.rfq.link', 'read'):
            return result
        for link in Link.search([
                    ('production', 'in', [p.id for p in productions]),
                    ('line.rfq.status', 'in', ['unreleased', 'active']),
                    ]):
            if link.work:
                result[(link.production.id, 'work', link.work.id)] += (
                    link.quantity or 0)
            else:
                result[(link.production.id, link.operation or 0,
                        link.piece or 0)] += link.quantity or 0
        return result

    @staticmethod
    def _js_reference(production):
        "The work order's Project/Reference/Other (Jobshop OTHER_INFO)"
        root = production.root or production if production else None
        return _field(root, 'other_info', 'project_reference',
            'reference') or ''

    @classmethod
    def _js_order_by(cls, date, lead):
        if not date:
            return None
        return date - dt.timedelta(days=lead or 0)

    # ---- Open Sales Orders -------------------------------------------------

    @classmethod
    def _js_sale_links(cls, line):
        """The work orders linked to the sales order line: [(production,
        quantity in the line's unit)]"""
        pool = Pool()
        Uom = pool.get('product.uom')
        links = []
        for production in getattr(line, 'productions', None) or []:
            if production.state == 'cancelled':
                continue
            links.append((production, Uom.compute_qty(
                        production.unit, production.quantity, line.unit)))
        for coverage in getattr(line, 'job_coverages', None) or []:
            if coverage.job.state == 'cancelled':
                continue
            links.append((coverage.job, Uom.compute_qty(
                        coverage.job.unit, coverage.quantity, line.unit)))
        return links

    @classmethod
    def js_planning_sales(cls, view='exclude'):
        """The Open Sales Orders section: the lines of the Firm and Released
        sales orders still to ship; view 'exclude' leaves out the lines fully
        linked to work orders, 'all' shows them"""
        cls._check_read('sale.sale', 'production')
        pool = Pool()
        SaleLine = pool.get('sale.line')
        today = dt.date.today()
        cache = {}
        rows = []
        lines = SaleLine.search([
                ('type', '=', 'line'),
                ('sale.state', 'in', SO_OPEN),
                ], order=[('sale.number', 'ASC'), ('sequence', 'ASC'),
                ('id', 'ASC')])
        for line in lines:
            due = line._get_move_quantity('out')
            if line.sale.state == 'quotation':
                # Nothing shipped before the order is released
                due = line.quantity
            if due <= 0:
                continue
            part = cls._planning_part(line.product, cache)
            links = cls._js_sale_links(line)
            linked = sum(q for _, q in links)
            if view != 'all' and links and linked >= due:
                continue
            rows.append(dict(line=line, due=due, part=part, links=links,
                    linked=linked))
        stock = cls._js_stock({r['line'].product for r in rows})
        result = []
        for r in rows:
            line, part = r['line'], r['part']
            sale = line.sale
            ship = line.shipping_date or sale.sale_date
            order_by = cls._js_order_by(ship, part['lead_time'])
            available = stock.get(line.product.id, 0) if line.product else 0
            messages = []
            if line.product and r['due'] > max(available, 0):
                messages.append("Short")
            if not r['links']:
                messages.append("Not linked to a work order")
            sale_lines = [l for l in sale.lines if l.type == 'line']
            customer_part = _field(line, 'product_customer')
            result.append({
                    'line': line.id,
                    'sale': sale.id,
                    'sale_state': sale.state,
                    'desired_ship_date': ship,
                    'lead_time': part['lead_time'],
                    'order_by': order_by,
                    'late': bool(order_by and order_by < today),
                    'sales_id': sale.number or str(sale.id),
                    'line_no': sale_lines.index(line) + 1,
                    'line_status': "Open",
                    'order_status': so_status(sale),
                    'status_changes': so_changes(sale),
                    'product': line.product.id if line.product else None,
                    'part_id': part['part_id'],
                    'fabricated': part['fabricated'],
                    'purchased': part['purchased'],
                    'stock_um': line.unit.symbol if line.unit else '',
                    'order_qty': line.quantity,
                    'shipped_qty': max(line.quantity - r['due'], 0)
                    if sale.state != 'quotation' else 0,
                    'linked_qty': r['linked'],
                    'qty_due': r['due'],
                    'qty_available': available,
                    'qty_on_hold': 0,
                    'wo_link': ', '.join(p.number or str(p.id)
                        for p, _ in r['links']) or "No Link",
                    'links': [{'id': p.id, 'number': p.number or str(p.id),
                            'quantity': q} for p, q in r['links']],
                    'customer_part_id': _code(customer_part)
                    if customer_part else '',
                    'customer': sale.party.id,
                    'customer_id': _code(sale.party),
                    'name': sale.party.name,
                    'description': part['description'] or line.description
                    or '',
                    'eng_id': _code(_field(line, 'master', 'bom'))
                    if _field(line, 'master', 'bom') else part['eng_id'],
                    'link_shipped_qty': min(r['linked'],
                        max(line.quantity - r['due'], 0))
                    if r['links'] and sale.state != 'quotation' else 0,
                    'pref_supplier_id': part['pref_suppliers'][0],
                    'message': ', '.join(messages),
                    'fully_linked': bool(r['links'])
                    and r['linked'] >= r['due'],
                    'sort': len(result),
                    })
        cls._js_projected(result, 'product', 'qty_due', 'desired_ship_date')
        return result

    @classmethod
    def js_planning_link_targets(cls, product):
        "The open work orders of the part a sales order line may link to"
        cls._check_read('production')
        Production = Pool().get('production')
        result = []
        Coverage = Pool().get('production.job.coverage')
        for p in Production.search([
                    ('product', '=', product),
                    ('state', 'in', WO_OPEN),
                    ('parent', '=', None),
                    ], order=[('planned_date', 'ASC'), ('id', 'ASC')]):
            # Linked: its sales order line (origin) or the lines it covers
            linked = sum(c.quantity or 0 for c in Coverage.search([
                        ('job', '=', p.id), ('sale_line', '!=', None)]))
            origin = getattr(p, 'origin', None)
            if origin and getattr(origin, '__name__', '') == 'sale.line':
                linked += p.quantity or 0
            number = split_number(p)
            result.append({
                    'id': p.id,
                    'number': p.number or str(p.id),
                    'work_id': number['work_id'],
                    'lot_id': number['lot_id'],
                    'split_id': number['split_id'],
                    'status': wo_status(p),
                    'release_date': p.planned_start_date,
                    'quantity': p.quantity,
                    'available': max((p.quantity or 0) - linked, 0),
                    'want_date': p.planned_date,
                    'part_id': p.product.code or p.product.rec_name,
                    'description': p.product.name,
                    'job': bool(getattr(p, 'job', False)),
                    })
        return result

    @classmethod
    def _js_new_production(cls, product, quantity, values):
        """A work order of the part (header only without an engineering
        master), as the Create New Work Order dialog of Jobshop makes it"""
        pool = Pool()
        Production = pool.get('production')
        Location = pool.get('stock.location')
        ProductBom = pool.get('product.product-production.bom')
        WorkCenter = pool.get('production.work.center')
        if not product.producible:
            raise ValidationError(gettext('nline_desk.msg_not_producible',
                    product=product.rec_name))
        warehouse, = Location.search([('type', '=', 'warehouse')], limit=1)
        if values.get('product_bom'):
            product_bom = ProductBom(values['product_bom'])
        else:
            get_bom = getattr(product, 'get_bom', None)
            product_bom = get_bom() if get_bom else (
                product.boms[0] if product.boms else None)
        number = (values.get('work_id') or '').strip()
        if number:
            lot = (values.get('lot_id') or '1').strip()
            split = (values.get('split_id') or '0').strip()
            number += ('' if lot in ('', '1') else '/' + lot) + (
                '' if split in ('', '0') else '.' + split)
            if Production.search([('number', '=', number)], limit=1):
                raise ValidationError(gettext(
                        'nline_js_planning.msg_work_order_exists',
                        number=number))
        status = values.get('status') or 'Firm'
        production = Production(
            company=cls._company(),
            warehouse=warehouse,
            location=warehouse.production_location,
            product=product,
            bom=product_bom.bom if product_bom else None,
            unit=product.default_uom,
            quantity=float(quantity),
            planned_date=_date(values.get('want_date')),
            planned_start_date=_date(values.get('release_date')),
            state='draft',
            )
        if 'planning_status' in Production._fields:
            production.planning_status = {'Firm': 'firm',
                'Hold': 'hold'}.get(status)
        if 'forward_schedule' in Production._fields and values.get(
                'forward'):
            production.forward_schedule = True
        if ('global_rank' in Production._fields
                and values.get('global_rank') not in (None, '')):
            production.global_rank = int(values['global_rank'])
        if number:
            production.number = number
        if values.get('origin'):
            production.origin = values['origin']
        if values.get('job'):
            production.job = True
        if product_bom and 'routing' in Production._fields:
            production.routing = product_bom.routing
            if production.routing and not getattr(
                    production, 'work_center', None):
                # The shop: the work center the resources are under
                centers = WorkCenter.search([('parent', '=', None)],
                    order=[('id', 'ASC')])
                with_children = [c for c in centers if c.children]
                if centers:
                    production.work_center = (with_children or centers)[0]
        if not production.planned_start_date and hasattr(
                production, 'set_planned_start_date'):
            production.set_planned_start_date()
        production.save()
        Production.set_moves([production])
        if status == 'Released':
            Production.wait([production])
        return Production(production.id)

    @classmethod
    def js_planning_new_work_order(cls, product, want_date=None,
            quantity=None):
        """The defaults of the Create New Work Order dialog for a part:
        description, engineering masters, release date (want date less the
        lead time), want date and quantity"""
        cls._check_read('production')
        Product = Pool().get('product.product')
        product = Product(product)
        part = cls._planning_part(product)
        want = _date(want_date) or dt.date.today() + dt.timedelta(
            days=part['lead_time'] or 0)
        get_bom = getattr(product, 'get_bom', None)
        current = get_bom() if get_bom else None
        if quantity is None:
            quantity = part['order_point'] or 1
        return {
            'product': product.id,
            'part_id': part['part_id'],
            'description': part['description'],
            'masters': [{'id': pb.id, 'name': pb.rec_name,
                    'current': pb == current} for pb in product.boms],
            'product_bom': current.id if current else (
                product.boms[0].id if product.boms else None),
            'release_date': want - dt.timedelta(days=part['lead_time'] or 0),
            'want_date': want,
            'quantity': quantity,
            'status': 'Firm',
            'global_rank': 50,
            }

    @classmethod
    @accept_warnings
    def js_planning_create_work_order(cls, values):
        """Create New Work Order (Open Sales Orders: unlinked to the line;
        Stocked Parts; Non-Stocked Parts: a Job covering the cards)
        values: product, quantity, work_id, lot_id, split_id, product_bom,
        release_date, want_date, status (Unreleased, Firm, Released),
        cards (material cards the new work order supplies)"""
        cls._check_create('production')
        pool = Pool()
        Product = pool.get('product.product')
        Card = pool.get('production.material_card')
        Coverage = pool.get('production.job.coverage')
        Uom = pool.get('product.uom')
        product = Product(values['product'])
        cards = Card.browse(values.get('cards') or [])
        if cards:
            cls._check_create('production.job.coverage')
            values = dict(values, job=True)
        production = cls._js_new_production(product, values['quantity'],
            values)
        if cards:
            Coverage.save([Coverage(job=production, card=c,
                        quantity=Uom.compute_qty(c.unit, c.quantity,
                            production.unit)) for c in cards])
        return {'id': production.id,
            'number': production.number or str(production.id)}

    @classmethod
    @accept_warnings
    def js_planning_link(cls, values):
        """Link Order Line To: a new work order (status Unreleased, Firm or
        Released) or an existing one; several lines of one part are
        consolidated to one work order (a Job covering them)
        values: lines, status or production"""
        cls._check_write('production')
        cls._check_create('production')
        pool = Pool()
        SaleLine = pool.get('sale.line')
        Production = pool.get('production')
        Coverage = pool.get('production.job.coverage')
        Uom = pool.get('product.uom')
        lines = SaleLine.browse(values['lines'])
        if not lines:
            return None
        products = {l.product for l in lines}
        if len(products) != 1 or None in products:
            raise ValidationError(gettext(
                    'nline_js_planning.msg_link_one_part'))
        product, = products
        if not product.producible:
            raise ValidationError(gettext('nline_desk.msg_not_producible',
                    product=product.rec_name))
        needs = []
        for line in lines:
            due = (line.quantity if line.sale.state == 'quotation'
                else line._get_move_quantity('out'))
            linked = sum(q for _, q in cls._js_sale_links(line))
            need = max(due - linked, 0)
            if need > 0:
                needs.append((line, Uom.compute_qty(line.unit, need,
                            product.default_uom)))
        if not needs:
            raise ValidationError(gettext(
                    'nline_js_planning.msg_lines_linked'))
        total = sum(q for _, q in needs)
        if values.get('production'):
            production = Production(values['production'])
            if production.product != product or production.state not in (
                    WO_OPEN):
                raise ValidationError(gettext(
                        'nline_js_planning.msg_link_wrong_order',
                        production=production.rec_name))
            if (len(needs) == 1 and not production.origin
                    and not getattr(production, 'job', False)):
                Production.write([production], {
                        'origin': str(needs[0][0])})
            else:
                cls._check_create('production.job.coverage')
                if not production.job:
                    Production.write([production], {'job': True})
                Coverage.save([Coverage(job=production, sale_line=l,
                            quantity=q) for l, q in needs])
        else:
            dates = [l.shipping_date or l.sale.sale_date for l, _ in needs]
            dates = [d for d in dates if d]
            want = min(dates) if dates else None
            part = cls._planning_part(product)
            options = {
                'status': values.get('status') or 'Firm',
                'want_date': want,
                'release_date': cls._js_order_by(want, part['lead_time']),
                }
            if len(needs) == 1:
                options['origin'] = str(needs[0][0])
                production = cls._js_new_production(product, total, options)
            else:
                cls._check_create('production.job.coverage')
                options['job'] = True
                production = cls._js_new_production(product, total, options)
                Coverage.save([Coverage(job=production, sale_line=l,
                            quantity=q) for l, q in needs])
        return {'id': production.id,
            'number': production.number or str(production.id)}

    @classmethod
    def js_planning_unlink(cls, values):
        """Break the links of the sales order lines (or of the material
        cards) to their work orders; values: lines, cards, production"""
        cls._check_write('production')
        pool = Pool()
        SaleLine = pool.get('sale.line')
        Card = pool.get('production.material_card')
        Production = pool.get('production')
        Coverage = pool.get('production.job.coverage')
        Link = pool.get('nline.purchase.link')
        only = values.get('production')
        coverages, origins = [], []
        for line in SaleLine.browse(values.get('lines') or []):
            for production in getattr(line, 'productions', []) or []:
                if not only or production.id == only:
                    origins.append(production)
            coverages.extend(c for c in line.job_coverages
                if not only or c.job.id == only)
        cards = Card.browse(values.get('cards') or [])
        for card in cards:
            coverages.extend(c for c in card.job_coverages
                if not only or c.job.id == only)
        if origins:
            Production.write(origins, {'origin': None})
        if coverages:
            Coverage.delete(coverages)
        if values.get('purchases'):
            links = [l for ls in cls._js_card_links(cards).values()
                for l in ls]
            Link.delete(links)
        return True

    @classmethod
    def js_planning_sale_status(cls, sale, status):
        """Change Sales Order Status (the whole order), as the Sales Order
        window does it (nline_js_sales.sales_order_status)"""
        cls._check_write('sale.sale')
        Sale = Pool().get('sale.sale')
        sale = Sale(sale)
        if status not in so_changes(sale):
            raise ValidationError(gettext(
                    'nline_js_planning.msg_sale_status',
                    sale=sale.rec_name, status=status))
        cls.sales_order_status(sale.id, status.lower())
        sale = Sale(sale.id)
        return {'state': sale.state, 'status': so_status(sale),
            'status_changes': so_changes(sale)}

    # ---- Non-Stocked Parts -------------------------------------------------

    @classmethod
    def _js_card_links(cls, cards):
        """The purchase links (nline.purchase.link) of each material card:
        a link names the work order (or leg), the seq no and the piece no
        of the card; one with other numbers goes to a card of the part"""
        pool = Pool()
        Link = pool.get('nline.purchase.link')
        result = {c.id: [] for c in cards}
        by_production = defaultdict(list)
        for card in cards:
            by_production[card.production.id].append(card)
        links = Link.search([
                ('production', 'in', list(by_production)),
                ('work', '=', None),
                ('purchase_line.purchase.state', '!=', 'cancelled'),
                ], order=[('id', 'ASC')])
        for link in links:
            candidates = [c for c in by_production[link.production.id]
                if not link.purchase_line.product
                or c.product == link.purchase_line.product]
            exact = [c for c in candidates
                if (c.operation, c.piece) == (link.operation, link.piece)]
            free = [c for c in candidates if not result[c.id]]
            card = (exact or free or candidates or [None])[0]
            if card:
                result[card.id].append(link)
        return result

    @classmethod
    def _js_link_received(cls, links):
        """The quantity received of each link: its own, else the purchase
        line's received quantity shared among its links in order"""
        received = {}
        by_line = defaultdict(list)
        for link in links:
            by_line[link.purchase_line].append(link)
        for line, line_links in by_line.items():
            done = sum(m.internal_quantity for m in line.moves
                if m.state == 'done')
            for link in sorted(line_links, key=lambda l: l.id):
                share = min(link.quantity or 0, max(done, 0))
                received[link.id] = link.received_quantity or share
                done -= share
        return received

    @classmethod
    def _js_required_dates(cls, productions):
        """The date each operation of the work orders is scheduled to start
        (the STANDARD schedule), by (production, sequence)"""
        pool = Pool()
        Operation = pool.get('nline.js.schedule.operation')
        dates = {}
        for op in Operation.search([
                    ('production', 'in', [p.id for p in productions]),
                    ('schedule.code', '=', 'STANDARD'),
                    ]):
            if op.start:
                dates[(op.production.id, op.sequence or 0)] = op.start.date()
        return dates

    @classmethod
    def _js_card_date(cls, card, dates):
        "The date the material is required: its operation's scheduled start"
        production = card.production
        works = sorted([k[1] for k in dates if k[0] == production.id])
        for sequence in works:
            if sequence >= (card.operation or 0):
                return dates[(production.id, sequence)]
        return (production.planned_start_date or production.planned_date)

    @classmethod
    def js_planning_non_stocked(cls, view='exclude', include_stocked=False):
        """The Non-Stocked Parts section: the material cards of the open
        work orders for parts not stocked (or without part), with their
        purchase order links; view 'exclude' leaves out the fully linked;
        include_stocked: Planning > Include Material Demand for Stocked
        Parts"""
        cls._check_read('production')
        pool = Pool()
        Card = pool.get('production.material_card')
        Uom = pool.get('product.uom')
        today = dt.date.today()
        cache = {}
        cards = Card.search([
                ('production.state', 'in', WO_OPEN),
                ('move.state', 'not in', ['cancelled']),
                ('supply', '!=', 'leg'),
                ])
        cls._js_prefetch_points([c.product for c in cards], cache)
        if not include_stocked:
            cards = [c for c in cards
                if not cls._planning_part(c.product, cache)['stocked']]
        card_links = cls._js_card_links(cards)
        rfqs = cls._js_rfq_quantities({c.production for c in cards})
        received = cls._js_link_received(
            [l for ls in card_links.values() for l in ls])
        dates = cls._js_required_dates({c.production for c in cards})
        stock = cls._js_stock({c.product for c in cards})
        rows = []
        for card in cards:
            part = cls._planning_part(card.product, cache)
            production = card.production
            unit = card.product.default_uom
            calc = Uom.compute_qty(card.unit, card.quantity, unit)
            issued = calc if card.move.state == 'done' else 0
            net = max(calc - issued, 0)
            po_links = card_links[card.id]
            linked = sum(l.quantity for l in po_links)
            job = getattr(card, 'job', None)
            if job:
                linked = net
            fully = linked >= net
            if view != 'all' and fully:
                continue
            required = cls._js_card_date(card, dates)
            order_by = cls._js_order_by(required, part['lead_time'])
            number = split_number(production)
            info = [('%s/%s' % (l.purchase_line.purchase.number
                        or l.purchase_line.purchase.id,
                        l.purchase_line.sequence or l.purchase_line.id),
                    l.quantity) for l in po_links]
            supplier = _field(card, 'supplier')
            rows.append({
                    'card': card.id,
                    'production': production.id,
                    'root': (production.root or production).id,
                    'required_date': required,
                    'lead_time': part['lead_time'],
                    'order_by': order_by,
                    'late': bool(order_by and order_by < today),
                    'work_id': number['work_id'],
                    'lot_id': number['lot_id'],
                    'split_id': number['split_id'],
                    'sub_id': number['sub_id'],
                    'seq_no': card.operation,
                    'piece_no': card.piece,
                    'product': card.product.id,
                    'part_id': part['part_id'],
                    'fabricated': part['fabricated'],
                    'purchased': part['purchased'],
                    'tool': part['tool'],
                    'calc_qty': calc,
                    'linked_po_qty': linked if not job else 0,
                    'issued_qty': issued,
                    'net_qty': net,
                    'linked_received': sum(received.get(l.id, 0)
                        for l in po_links),
                    'qty_available': stock.get(card.product.id, 0),
                    'stock_um': unit.symbol,
                    'po_link': ', '.join('%s (%s)' % (n, q)
                        for n, q in info) or (
                        'WO %s' % job.rec_name if job else ''),
                    'job': job.id if job else None,
                    'length': _field(card, 'length'),
                    'width': _field(card, 'width'),
                    'height': _field(card, 'height'),
                    'usage_um': card.unit.symbol,
                    'supplier': supplier.id if supplier else part['supplier'],
                    'supplier_id': _code(supplier) if supplier
                    else part['supplier_id'],
                    'supplier_part_id': part['supplier_part_id'],
                    'mfg_name': _field(card, 'mfg_name') or part['mfg_name'],
                    'mfg_part_id': _field(card, 'mfg_part_id')
                    or part['mfg_part_id'],
                    'material_status': MATERIAL_STATUS.get(card.move.state,
                        card.move.state),
                    'order_status': wo_status(production),
                    'description': card.move.product.name,
                    'specifications': _field(card, 'specifications') or '',
                    'eng_id': part['eng_id'] if part['fabricated'] else '',
                    'stocked': part['stocked'],
                    'linked_rfq_qty': rfqs.get((production.id,
                            card.operation or 0, card.piece or 0), 0),
                    'primary_loc_id': part['primary_loc_id'],
                    'reference': cls._js_reference(production),
                    'fully_linked': fully,
                    })
        rows.sort(key=lambda r: (r['required_date'] or dt.date.max,
                r['work_id'], r['seq_no'] or 0))
        for i, row in enumerate(rows):
            row['sort'] = i
        cls._js_projected(rows, 'product', 'net_qty', 'required_date')
        return rows

    # ---- Outside Services ------------------------------------------------

    @classmethod
    def js_planning_outside(cls, view='exclude'):
        """The Outside Services section: the outside operations of the Firm
        and Released work orders, linked to their purchase order line"""
        cls._check_read('production')
        pool = Pool()
        Work = pool.get('production.work')
        Uom = pool.get('product.uom')
        today = dt.date.today()
        rows = []
        works = Work.search([
                ('production.state', 'in', WO_OPEN),
                ('state', 'not in', ['finished', 'done']),
                ('routing_step.supplier', '!=', None),
                ])
        dates = cls._js_required_dates({w.production for w in works})
        rfqs = cls._js_rfq_quantities({w.production for w in works})
        for work in works:
            step = work.routing_step
            production = work.production
            line = work.purchase_line
            if line and line.purchase.state == 'cancelled':
                line = None
            if view != 'all' and line:
                continue
            transit = _days(step.service_supplier.lead_time) if (
                step.service_supplier and step.service_supplier.lead_time
                ) else 0
            required = dates.get((production.id, work.sequence or 0)) or (
                production.planned_start_date or production.planned_date)
            order_by = cls._js_order_by(required, transit)
            number = split_number(production)
            calc = production.quantity or 0
            linked = Uom.compute_qty(line.unit, line.quantity,
                production.unit) if line and line.unit else 0
            received = calc if work.state in ('finished', 'done') else 0
            rows.append({
                    'work': work.id,
                    'production': production.id,
                    'root': (production.root or production).id,
                    'required_date': required,
                    'transit_days': transit,
                    'order_by': order_by,
                    'late': bool(order_by and order_by < today),
                    'order_status': wo_status(production),
                    'work_id': number['work_id'],
                    'lot_id': number['lot_id'],
                    'split_id': number['split_id'],
                    'sub_id': number['sub_id'],
                    'seq_no': work.sequence,
                    'operation_status': work.state,
                    'service': step.service.id if step.service else None,
                    'service_id': _code(step.service),
                    'supplier': step.supplier.id,
                    'supplier_id': _code(step.supplier),
                    'supplier_service_id': (step.service_supplier.code or '')
                    if step.service_supplier else '',
                    'operation': work.operation.rec_name,
                    'part_id': production.product.code
                    or production.product.rec_name
                    if production.product else '',
                    'calc_qty': calc,
                    'linked_po_qty': linked,
                    'linked_received': received,
                    'net_qty': max(calc - received, 0),
                    'stock_um': production.unit.symbol
                    if production.unit else '',
                    'specifications': '',
                    'po_link': '%s/%s' % (line.purchase.number
                        or line.purchase.id, line.sequence or line.id)
                    if line else '',
                    'purchase': line.purchase.id if line else None,
                    'usage_um': line.unit.symbol if line and line.unit
                    else '',
                    'part_description': production.product.name
                    if production.product else '',
                    'linked_rfq_qty': rfqs.get((production.id, 'work',
                            work.id), 0),
                    'reference': cls._js_reference(production),
                    'fully_linked': bool(line),
                    })
        rows.sort(key=lambda r: (r['required_date'] or dt.date.max,
                r['work_id'], r['seq_no'] or 0))
        return rows

    # ---- Stocked Parts ---------------------------------------------------

    @classmethod
    def _js_demand_supply(cls, products, horizon=None, release=False):
        """Net demand (open work order cards and sales order lines) and
        total supply (open purchase order lines and work orders) of the
        products, in their stock unit, up to the horizon date; release:
        a card's demand date is its work order's release date (Use Work
        Order Release Date for Material Demand Date), else its want date"""
        pool = Pool()
        Card = pool.get('production.material_card')
        SaleLine = pool.get('sale.line')
        PurchaseLine = pool.get('purchase.line')
        Production = pool.get('production')
        Uom = pool.get('product.uom')
        ids = [p.id for p in products]
        demand = defaultdict(float)
        supply = defaultdict(float)

        def within(date):
            return not horizon or not date or date <= horizon

        for card in Card.search([
                    ('product', 'in', ids),
                    ('production.state', 'in', WO_OPEN),
                    ('move.state', 'in', ['staging', 'draft', 'assigned']),
                    ('supply', '!=', 'leg'),
                    ]):
            production = card.production
            if within(production.planned_start_date if release
                    and production.planned_start_date
                    else production.planned_date):
                demand[card.product.id] += Uom.compute_qty(
                    card.unit, card.quantity, card.product.default_uom)
        for line in SaleLine.search([
                    ('product', 'in', ids),
                    ('type', '=', 'line'),
                    ('sale.state', 'in', SO_OPEN),
                    ]):
            due = (line.quantity if line.sale.state == 'quotation'
                else line._get_move_quantity('out'))
            if due > 0 and within(line.shipping_date):
                demand[line.product.id] += Uom.compute_qty(
                    line.unit, due, line.product.default_uom)
        for line in PurchaseLine.search([
                    ('product', 'in', ids),
                    ('type', '=', 'line'),
                    ('purchase.state', 'in', PO_OPEN),
                    ]):
            done = sum(m.internal_quantity for m in line.moves
                if m.state == 'done')
            remaining = Uom.compute_qty(line.unit, line.quantity,
                line.product.default_uom) - done
            if remaining > 0 and within(getattr(line, 'delivery_date',
                        None)):
                supply[line.product.id] += remaining
        for production in Production.search([
                    ('product', 'in', ids),
                    ('state', 'in', WO_OPEN),
                    ]):
            if not within(production.planned_date):
                continue
            for output in production.outputs:
                if output.product.id in ids and output.state not in (
                        'done', 'cancelled'):
                    supply[output.product.id] += output.internal_quantity
        return demand, supply

    @classmethod
    def js_planning_stocked(cls, filters=None):
        """The Stocked Parts section: supply and demand of the stocked parts
        netted by part; filters: part_from, part_to, product_code_from/to,
        commodity_code_from/to, supplier_from/to, activity (active,
        inactive, both), horizon (date), short_only"""
        cls._check_read('production')
        pool = Pool()
        Product = pool.get('product.product')
        filters = filters or {}
        cache = {}
        # For: all active parts and the inactive ones with demand (Jobshop's
        # default), active only, inactive only, inactive with demand, all
        activity = {'active': 'active_only', 'inactive': 'inactive_only',
            'both': 'all'}.get(filters.get('activity'),
            filters.get('activity') or 'active_demand')
        kind = filters.get('fabricated') or 'both'
        domain = [('template.type', '=', 'goods'),
            ('active', 'in', [True, False])]
        # Only the stocked parts are read (thousands of parts otherwise)
        if 'stocked' in pool.get('product.template')._fields:
            domain.append(('template.stocked', '=', True))
        else:
            try:
                OrderPoint = pool.get('stock.order_point')
            except KeyError:
                OrderPoint = None
            domain.append(('id', 'in', [p.product.id
                        for p in OrderPoint.search([])] if OrderPoint
                    else []))
        products = []
        for p in Product.search(domain, order=[('code', 'ASC'),
                    ('id', 'ASC')]):
            part = cls._planning_part(p, cache)
            if not part['stocked']:
                continue
            if activity == 'active_only' and not part['active']:
                continue
            if activity in ('inactive_only', 'inactive_demand') \
                    and part['active']:
                continue
            if kind == 'fabricated' and not part['fabricated']:
                continue
            if kind == 'purchased' and not part['purchased']:
                continue
            products.append(p)

        def in_range(value, low, high):
            value = (value or '').upper()
            return ((not low or value >= low.upper())
                and (not high or value <= high.upper()))

        keep = []
        for product in products:
            part = cls._planning_part(product, cache)
            if not in_range(part['part_id'], filters.get('part_from'),
                    filters.get('part_to')):
                continue
            if not in_range(part['product_code'],
                    filters.get('product_code_from'),
                    filters.get('product_code_to')):
                continue
            if not in_range(part['commodity_code'],
                    filters.get('commodity_code_from'),
                    filters.get('commodity_code_to')):
                continue
            if not in_range(part['supplier_id'], filters.get('supplier_from'),
                    filters.get('supplier_to')):
                continue
            keep.append(product)
        today = dt.date.today()
        horizon = _date(filters.get('horizon'))
        horizons = {}
        if filters.get('use_leadtime'):
            # Use Part Leadtime (+ days) as Horizon
            plus = int(filters.get('plus_days') or 0)
            for product in keep:
                lead = cls._planning_part(product, cache)['lead_time'] or 0
                horizons[product.id] = today + dt.timedelta(days=lead + plus)
        by_horizon = defaultdict(list)
        for product in keep:
            by_horizon[horizons.get(product.id, horizon)].append(product)
        demand, supply = defaultdict(float), defaultdict(float)
        for date, products_ in by_horizon.items():
            d, s_ = cls._js_demand_supply(products_, date,
                release=bool(filters.get('use_release_date')))
            demand.update(d)
            supply.update(s_)
        stock = cls._js_stock(keep)
        purchases = cls._js_open_purchases(keep)
        rows = []
        for product in keep:
            part = cls._planning_part(product, cache)
            if (activity == 'inactive_demand' or (activity == 'active_demand'
                        and not part['active'])) and not demand[product.id]:
                continue
            on_hand = stock.get(product.id, 0)
            projected = on_hand + supply[product.id] - demand[product.id]
            order_point = part['order_point'] or 0
            safety = part['safety_stock'] or 0
            if projected <= safety:
                color = 'red'
            elif projected <= order_point:
                color = 'blue'
            else:
                color = 'black'
            short = projected <= max(order_point, safety, 0)
            if filters.get('short_only', True) and not short:
                continue
            target = part['target'] or order_point
            suggested = max(target - projected, 0) or order_point or 1
            if part['purchased'] and not part['fabricated']:
                suggested = cls._js_round_quantity(product, None, suggested)
            cost = float(part['unit_mat_cost'] or 0)
            date = horizons.get(product.id, horizon)
            rows.append(dict(part, **{
                    'inactive': not part['active'],
                    'rfq_exists': purchases[product.id]['rfq'],
                    'po_exists': purchases[product.id]['po'],
                    'horizon_date': date,
                    'unit_mat_cost': cost,
                    'order_qty': suggested,
                    'estimated_cost': cost * suggested,
                    'on_hold': 0,
                    'on_hand': on_hand,
                    'qty_available': on_hand,
                    'net_demand': demand[product.id],
                    'total_supply': supply[product.id],
                    'projected': projected,
                    'color': color,
                    'short': short,
                    'suggested': suggested,
                    }))
        return rows

    @classmethod
    def _js_open_purchases(cls, products):
        """Whether an open request for quote / purchase order line exists
        for each product (the RFQ(s) Exists and PO(s) Exist columns)"""
        pool = Pool()
        PurchaseLine = pool.get('purchase.line')
        ids = [p.id for p in products]
        result = defaultdict(lambda: {'rfq': False, 'po': False})
        for line in PurchaseLine.search([
                    ('product', 'in', ids),
                    ('type', '=', 'line'),
                    ('purchase.state', 'in', PO_OPEN),
                    ]):
            result[line.product.id]['po'] = True
        try:
            RfqLine = pool.get('nline.rfq.line')
        except KeyError:
            RfqLine = None
        if RfqLine and cls._js_may('nline.rfq.line', 'read'):
            for line in RfqLine.search([
                        ('product', 'in', ids),
                        ('rfq.status', 'in', ['unreleased', 'active']),
                        ]):
                result[line.product.id]['rfq'] = True
        return result

    # ---- Purchase orders -------------------------------------------------

    @classmethod
    def _js_round_quantity(cls, product, party, quantity):
        """The planning variables (Jobshop prompts to meet them): the
        minimum order quantity and the multiple of the supplier, else of
        the part (Inventory's Planning tab)"""
        minimum = multiple = None
        for ps in (product.product_suppliers_used(party=party.id)
                if party else []):
            minimum = _field(ps, 'minimum_quantity', 'minimal_quantity')
            multiple = _field(ps, 'quantity_rounding', 'multiple_quantity')
            break
        template = product.template
        minimum = minimum or _field(template, 'minimum_order_qty')
        multiple = multiple or _field(template, 'multiple_order_qty')
        if minimum and quantity < minimum:
            quantity = minimum
        if multiple:
            quantity = -(-quantity // multiple) * multiple
        return quantity

    @classmethod
    @accept_warnings
    def js_planning_purchase(cls, values):
        """Create Purchase Order for supplier from the rows of a section, one
        draft order with one line per part (consolidated) linked to the work
        orders: values: kind ('material', 'service' or 'stocked'), rows
        (card, work or product ids), supplier, quantities ({row id:
        quantity} for stocked parts)"""
        cls._check_create('purchase.purchase', 'purchase.line')
        pool = Pool()
        Party = pool.get('party.party')
        Product = pool.get('product.product')
        Card = pool.get('production.material_card')
        Work = pool.get('production.work')
        Link = pool.get('nline.purchase.link')
        Purchase = pool.get('purchase.purchase')
        PurchaseLine = pool.get('purchase.line')
        Uom = pool.get('product.uom')
        kind = values['kind']
        party = Party(values['supplier'])
        rows = values.get('rows') or []
        if not rows:
            raise ValidationError(gettext('nline_js_planning.msg_no_rows'))

        if kind == 'service':
            works = [w for w in Work.browse(rows) if not w.purchase_line
                or w.purchase_line.purchase.state == 'cancelled']
            if not works:
                raise ValidationError(gettext(
                        'nline_js_planning.msg_lines_linked'))
            purchase = Purchase(company=cls._company(), party=party)
            purchase.on_change_party()
            purchase.purchase_date = dt.date.today()
            purchase.save()
            lines = []
            for work in works:
                if not (work.routing_step and work.routing_step.service):
                    continue
                line = work.get_outside_purchase_line(purchase)
                lines.append(line)
            PurchaseLine.save(lines)
            for work, line in zip([w for w in works if w.routing_step
                        and w.routing_step.service], lines):
                work.purchase_line = line
            Work.save(works)
            if hasattr(Purchase, 'nline_check_limit'):
                # The user's PO limit (module nline_role)
                Purchase.nline_check_limit([purchase])
            return {'purchase': purchase.id,
                'number': purchase.number or str(purchase.id)}

        # Parts: one line per part, its links to the cards
        quantities = defaultdict(float)
        cards_of = defaultdict(list)
        order = []
        if kind == 'material':
            cls._check_create('nline.purchase.link')
            cards = Card.browse(rows)
            existing = {cid: sum(l.quantity or 0 for l in links)
                for cid, links in cls._js_card_links(cards).items()}
            for card in cards:
                unit = card.product.default_uom
                need = Uom.compute_qty(card.unit, card.quantity, unit)
                if card.move.state == 'done':
                    need = 0
                need -= existing[card.id]
                if need <= 0:
                    continue
                if card.product not in quantities:
                    order.append(card.product)
                quantities[card.product] += need
                cards_of[card.product].append((card, need))
        else:
            given = {int(k): v for k, v in (
                    values.get('quantities') or {}).items()}
            for product in Product.browse(rows):
                quantity = float(given.get(product.id) or 0)
                if quantity <= 0:
                    continue
                order.append(product)
                quantities[product] += quantity
        if not order:
            raise ValidationError(gettext(
                    'nline_js_planning.msg_lines_linked'))
        lines = []
        for product in order:
            quantity = Uom.compute_qty(product.default_uom,
                quantities[product], product.purchase_uom or
                product.default_uom)
            quantity = cls._js_round_quantity(product, party, quantity)
            line = {'product': product.id, 'quantity': quantity}
            price = (values.get('unit_prices') or {}).get(str(product.id))
            if kind == 'stocked' and price not in (None, '', 0):
                # The Unit Material Cost of the grid (per stock unit)
                line['unit_price'] = Uom.compute_price(product.default_uom,
                    Decimal(str(price)), product.purchase_uom
                    or product.default_uom)
            lines.append(line)
        result = cls.purchase_order_save({
                'party': party.id,
                'purchase_date': dt.date.today(),
                'lines': lines,
                })
        if kind == 'material':
            by_product = {}
            for line in PurchaseLine.browse([l['id']
                        for l in result['lines']]):
                by_product.setdefault(line.product, line)
            Link.save([Link(purchase_line=by_product[p],
                        production=c.production, operation=c.operation,
                        piece=c.piece, quantity=q)
                    for p in order for c, q in cards_of[p]
                    if p in by_product])
        return {'purchase': result['id'], 'number': result['number']
            or str(result['id'])}

    # ---- Supply & Demand -------------------------------------------------

    @classmethod
    def js_supply_demand(cls, product, horizon=None):
        """The Supply & Demand dialog of a part (Jobshop's
        dlgStockedPartNetting): its sales orders, work orders and purchase
        orders up to the horizon date, the running demand / supply of each
        tab and the projected available quantity after each line"""
        cls._check_read('production')
        pool = Pool()
        Product = pool.get('product.product')
        SaleLine = pool.get('sale.line')
        Card = pool.get('production.material_card')
        Production = pool.get('production')
        PurchaseLine = pool.get('purchase.line')
        Link = pool.get('nline.purchase.link')
        Uom = pool.get('product.uom')
        product = Product(product)
        unit = product.default_uom
        part = cls._planning_part(product)
        horizon = _date(horizon)

        def within(date):
            return not horizon or not date or date <= horizon

        sales, demand = [], 0
        for line in SaleLine.search([
                    ('product', '=', product.id),
                    ('type', '=', 'line'),
                    ('sale.state', 'in', SO_OPEN),
                    ], order=[('sale.sale_date', 'ASC'), ('id', 'ASC')]):
            due = (line.quantity if line.sale.state == 'quotation'
                else line._get_move_quantity('out'))
            ship = line.shipping_date or line.sale.sale_date
            if due <= 0 or not within(ship):
                continue
            qty = Uom.compute_qty(line.unit, due, unit)
            demand += qty
            sale_lines = [l for l in line.sale.lines if l.type == 'line']
            links = cls._js_sale_links(line)
            master = _field(line, 'master', 'bom')
            sales.append({
                    'sale': line.sale.id,
                    'order_id': line.sale.number or str(line.sale.id),
                    'line_no': sale_lines.index(line) + 1,
                    'status': so_status(line.sale),
                    'ship_date': ship,
                    'demand_qty': qty,
                    'drawing_id': part['drawing_id'],
                    'drawing_rev': part['drawing_rev'],
                    'eng_id': _code(master) if master else part['eng_id'],
                    'links': ', '.join('%s (%s)' % (p.number or p.id,
                            _qty(q)) for p, q in links),
                    'linked_qty': sum(q for _, q in links),
                    'demand': demand,
                    '_date': ship,
                    '_delta': -qty,
                    })

        works, events = [], []
        for production in Production.search([
                    ('product', '=', product.id),
                    ('state', 'in', WO_OPEN),
                    ]):
            remaining = sum(o.internal_quantity for o in production.outputs
                if o.product == product and o.state not in (
                    'done', 'cancelled'))
            if within(production.planned_date):
                events.append((production.planned_date or dt.date.max,
                        production, None, remaining, 0))
        for card in Card.search([
                    ('product', '=', product.id),
                    ('production.state', 'in', WO_OPEN),
                    ('move.state', 'in', ['staging', 'draft', 'assigned']),
                    ]):
            date = (card.production.planned_start_date
                or card.production.planned_date)
            if within(date):
                events.append((date or dt.date.max, card.production, card,
                        0, Uom.compute_qty(card.unit, card.quantity, unit)))
        events.sort(key=lambda e: (e[0], e[1].id))
        Operation = pool.get('nline.js.schedule.operation')
        finishes = {}
        for op in Operation.search([
                    ('production', 'in', [e[1].id for e in events]),
                    ('schedule.code', '=', 'STANDARD'),
                    ]):
            if op.finish and (op.production.id not in finishes
                    or op.finish > finishes[op.production.id]):
                finishes[op.production.id] = op.finish
        supply, wo_demand = 0, 0
        for date, production, card, s, d in events:
            supply += s
            wo_demand += d
            number = split_number(production)
            finish = finishes.get(production.id)
            works.append(dict(number, **{
                        'production': (production.root or production).id,
                        'coproduct': False,
                        'seq_no': card.operation if card else None,
                        'piece_no': card.piece if card else None,
                        'status': wo_status(production),
                        'release_date': production.planned_start_date,
                        'want_date': production.planned_date,
                        'finish_date': finish.date() if finish else None,
                        'supply_qty': s,
                        'demand_qty': d,
                        'drawing_id': _field(production, 'drawing_number')
                        or part['drawing_id'],
                        'drawing_rev': _field(production, 'drawing_revision')
                        or part['drawing_rev'],
                        'eng_id': (production.bom.rec_name
                            if production.bom else '') if not card
                        else '',
                        'supply': supply,
                        'demand': wo_demand,
                        '_date': date if date != dt.date.max else None,
                        '_delta': s - d,
                        }))

        purchases, po_supply = [], 0
        for line in PurchaseLine.search([
                    ('product', '=', product.id),
                    ('type', '=', 'line'),
                    ('purchase.state', 'in', PO_OPEN),
                    ], order=[('purchase.purchase_date', 'ASC'),
                    ('id', 'ASC')]):
            done = sum(m.internal_quantity for m in line.moves
                if m.state == 'done')
            qty = Uom.compute_qty(line.unit, line.quantity, unit) - done
            receive = getattr(line, 'delivery_date', None)
            if qty <= 0 or not within(receive):
                continue
            po_supply += qty
            links = Link.search([('purchase_line', '=', line.id)])
            purchases.append({
                    'purchase': line.purchase.id,
                    'order_id': line.purchase.number
                    or str(line.purchase.id),
                    'line_no': line.sequence,
                    'status': PO_STATUS.get(line.purchase.state),
                    'receive_date': receive,
                    'supply_qty': qty,
                    'drawing_id': part['drawing_id'],
                    'drawing_rev': part['drawing_rev'],
                    'links': ', '.join('%s/%s/%s (%s)' % (
                            split_number(l.production)['number']
                            if l.production else (l.reference or ''),
                            l.operation or 0, l.piece or 0,
                            _qty(l.quantity)) for l in links),
                    'linked_qty': sum(l.quantity or 0 for l in links),
                    'supply': po_supply,
                    '_date': receive,
                    '_delta': qty,
                    })

        # Projected available after each line: on hand plus the supply less
        # the demand of every tab, by date
        on_hand = cls._js_stock([product]).get(product.id, 0)
        timeline = sorted(sales + works + purchases, key=lambda r: (
                r['_date'] or dt.date.max, -r['_delta']))
        running = on_hand
        for row in timeline:
            running += row['_delta']
            row['projected'] = running
        for row in timeline:
            del row['_date'], row['_delta']
        return {
            'product': product.id,
            'part_id': part['part_id'],
            'description': part['description'],
            'stock_um': unit.symbol,
            'drawing_id': part['drawing_id'],
            'drawing_rev': part['drawing_rev'],
            'eng_id': part['eng_id'],
            'masters': [pb.rec_name for pb in product.boms]
            if product.producible else [],
            'inactive': not part['active'],
            'horizon': horizon,
            'on_hand': on_hand,
            'demand': demand + wo_demand,
            'supply': supply + po_supply,
            'sales': sales,
            'work_orders': works,
            'purchases': purchases,
            }

    # ---- Request For Quote -------------------------------------------------

    @classmethod
    @accept_warnings
    def js_planning_rfq(cls, values):
        """Create Request For Quote for Supplier... of the rows of a section:
        one request to the supplier, one line per part (consolidated) with
        the quantity to quote, linked to the work orders (nline.rfq.link)
        values: kind ('material', 'service' or 'stocked'), rows, supplier,
        quantities ({row id: quantity} for stocked parts)"""
        cls._check_create('nline.rfq', 'nline.rfq.line')
        pool = Pool()
        Card = pool.get('production.material_card')
        Work = pool.get('production.work')
        Product = pool.get('product.product')
        Uom = pool.get('product.uom')
        kind = values['kind']
        rows = values.get('rows') or []
        if not rows:
            raise ValidationError(gettext('nline_js_planning.msg_no_rows'))
        lines = []

        def link(production, quantity, operation=None, piece=None,
                work=None):
            return {'production': production.id, 'operation': operation,
                'piece': piece, 'work': work.id if work else None,
                'quantity': quantity}

        if kind == 'service':
            for work in Work.browse(rows):
                step = work.routing_step
                if not step or not step.service:
                    continue
                quantity = work.production.quantity or 0
                lines.append({
                        'line_type': 'service',
                        'service_part': (work.production.product.id
                            if work.production.product else None),
                        'description': step.service.rec_name,
                        'unit': step.service.purchase_uom.id
                        if step.service.purchase_uom else None,
                        'prices': [{'quantity': quantity}],
                        'links': [link(work.production, quantity,
                                work.sequence, None, work)],
                        '_product': step.service,
                        })
            for line in lines:
                line['product'] = line.pop('_product').id
        else:
            quantities = defaultdict(float)
            links = defaultdict(list)
            order = []
            if kind == 'material':
                for card in Card.browse(rows):
                    if not card.product or card.move.state == 'done':
                        continue
                    need = Uom.compute_qty(card.unit, card.quantity,
                        card.product.default_uom)
                    if card.product not in quantities:
                        order.append(card.product)
                    quantities[card.product] += need
                    links[card.product].append(link(card.production, need,
                            card.operation, card.piece))
            else:
                given = {int(k): v for k, v in (
                        values.get('quantities') or {}).items()}
                for product in Product.browse(rows):
                    quantity = float(given.get(product.id) or 0)
                    if quantity > 0:
                        order.append(product)
                        quantities[product] += quantity
            for product in order:
                part = cls._planning_part(product)
                lines.append({
                        'line_type': 'part',
                        'product': product.id,
                        'description': product.name,
                        'unit': product.default_uom.id,
                        'mfg_name': part['mfg_name'] or None,
                        'mfg_part_id': part['mfg_part_id'] or None,
                        'drawing': part['drawing_id'] or None,
                        'drawing_revision': part['drawing_rev'] or None,
                        'prices': [{'quantity': quantities[product]}],
                        'links': links[product],
                        })
        if not lines:
            raise ValidationError(gettext(
                    'nline_js_planning.msg_lines_linked'))
        if any(l['links'] for l in lines):
            cls._check_create('nline.rfq.link')
        rfq = cls.js_rfq_save({
                'status': 'unreleased',
                'supplier_1': values['supplier'],
                'lines': lines,
                })
        return {'rfq': rfq['id'], 'number': rfq['number'] or str(rfq['id'])}
