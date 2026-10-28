# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The read-only tabs and dialogs of Jobshop's Part window

Quote / SO / RFQ / PO lines and work orders of the part by status (the
right-click "... by Status of" menus), the pricing tabs (Supplier Part
Prices, Supplier Service Pricing, Customer Part Pricing, Discount Class Part
Pricing), Tracking Info, and the work order Material Availability in
N-Line's own layout (VInventory N-LineAvailability).

The documents of other areas (quotes, RFQs, customer prices...) are read when
their module is installed: a missing model or a model the user may not read
gives no rows (the window does not show the tab).
"""
import datetime as dt
from decimal import Decimal

from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .part import on_hand

ZERO = Decimal(0)

# Jobshop's statuses of each document (the menus of the tabs)
STATUS_LABELS = {
    'unreleased': "Unreleased", 'unapproved': "Unapproved", 'firm': "Firm",
    'released': "Released", 'closed': "Closed", 'hold': "Hold",
    'cancelled': "Cancelled", 'active': "Active", 'ready': "Ready",
    'won': "Won", 'lost': "Lost",
    }
DOC_STATUSES = {
    'quote': ['active', 'ready', 'won', 'lost', 'cancelled'],
    'sale': ['unreleased', 'firm', 'released', 'closed', 'hold',
        'cancelled'],
    'rfq': ['unreleased', 'active', 'closed', 'cancelled'],
    'purchase': ['unreleased', 'unapproved', 'firm', 'released', 'closed',
        'hold', 'cancelled'],
    'production': ['unreleased', 'firm', 'released', 'closed', 'hold',
        'cancelled'],
    }
# Shown when the window opens (Jobshop's defaults)
DEFAULT_STATUSES = {
    'quote': ['active'],
    'sale': ['released'],
    'rfq': ['unreleased', 'active'],
    'purchase': ['released'],
    'production': ['released'],
    }
# Tryton states when the Jobshop status field of the area is missing
STATES = {
    'sale': {'unreleased': ['draft'], 'firm': ['quotation'],
        'released': ['confirmed', 'processing'], 'closed': ['done'],
        'cancelled': ['cancelled']},
    'purchase': {'unreleased': ['draft'], 'firm': ['quotation'],
        'released': ['confirmed', 'processing'], 'closed': ['done'],
        'cancelled': ['cancelled']},
    'production': {'unreleased': ['request', 'draft'],
        'released': ['waiting', 'assigned', 'running'], 'closed': ['done'],
        'cancelled': ['cancelled']},
    }
# Material status of a material card from its move
MATERIAL_STATUS = {'staging': "Unreleased", 'draft': "Unreleased",
    'assigned': "Released", 'done': "Closed", 'cancelled': "Cancelled"}


def _num(value):
    return float(value) if value is not None else None


def _line_no(line, lines):
    """Jobshop's Line No of a document line: its sequence, else its place
    among the document's lines (as the Sales / Purchasing windows number
    them)"""
    if getattr(line, 'sequence', None):
        return line.sequence
    numbers = [l.id for l in lines if getattr(l, 'type', 'line') == 'line']
    return numbers.index(line.id) + 1 if line.id in numbers else None


def _code(record):
    "A Jobshop ID: the code of a record, else its name"
    if not record:
        return ''
    return getattr(record, 'code', None) or record.rec_name


def _get(record, *names):
    "The first attribute of the record that exists and is set"
    for name in names:
        value = getattr(record, name, None)
        if value not in (None, ''):
            return value
    return None


def _model(name):
    "The model when installed and readable by the user, else None"
    pool = Pool()
    ModelAccess = pool.get('ir.model.access')
    try:
        Model = pool.get(name)
    except KeyError:
        return None
    if not ModelAccess.check(name, 'read', raise_exception=False):
        return None
    return Model


class Desk(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['part_lines_setup', 'part_prices', 'part_tracking',
                'wo_material_availability']:
            cls.__rpc__[name] = RPC()

    # ---- The tabs of the part's documents ------------------------------

    @classmethod
    def part_lines_setup(cls):
        """Which document tabs the user may see, their statuses (Jobshop's
        right-click menus) and the statuses shown first"""
        models = {'quote': 'nline.quote.line', 'sale': 'sale.line',
            'rfq': 'nline.rfq.line', 'purchase': 'purchase.line',
            'production': 'production'}
        result = {}
        for kind, model in models.items():
            if _model(model):
                result[kind] = {
                    'statuses': [[s, STATUS_LABELS[s]]
                        for s in DOC_STATUSES[kind]],
                    'default': DEFAULT_STATUSES[kind],
                    }
        prices = {'supplier': 'purchase.product_supplier',
            'service': 'purchase.product_supplier',
            'customer': 'nline.sale_price', 'discount': 'nline.sale_price'}
        result['prices'] = [k for k, m in prices.items() if _model(m)]
        return result

    @classmethod
    def _js_statuses(cls, kind, statuses):
        statuses = list(statuses or DEFAULT_STATUSES[kind])
        if 'all' in statuses:
            statuses = list(DOC_STATUSES[kind])
        return statuses

    @classmethod
    def _js_status_domain(cls, kind, prefix, statuses):
        "The search clause of the document's Jobshop statuses"
        pool = Pool()
        model, field = {
            'sale': ('sale.sale', 'js_status'),
            'purchase': ('purchase.purchase', 'jobshop_status'),
            'production': ('production', 'order_status'),
            }[kind]
        if field in pool.get(model)._fields:
            return [(prefix + field, 'in', statuses)]
        states = [s for status in statuses
            for s in STATES[kind].get(status, [])]
        return [(prefix + 'state', 'in', states)]

    @classmethod
    def _js_doc_status(cls, kind, record):
        field = {'sale': 'js_status', 'purchase': 'jobshop_status',
            'production': 'order_status'}[kind]
        status = getattr(record, field, None)
        if status is None:
            for key, states in STATES[kind].items():
                if record.state in states:
                    status = key
        return STATUS_LABELS.get(status, status or '')

    @classmethod
    def part_orders(cls, template, kind, statuses=None):
        """The lines of the part on quotes ('quote'), sales orders ('sale'),
        RFQs ('rfq'), purchase orders ('purchase') or the work orders that
        make it ('production') in the Jobshop statuses (default: Jobshop's),
        newest first, in the columns of the Part window's tab"""
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        statuses = cls._js_statuses(kind, statuses)
        reader = getattr(cls, '_js_lines_%s' % kind, None)
        if not reader:
            raise ValueError(kind)
        return reader(template, products, statuses)

    @classmethod
    def _js_lines_quote(cls, template, products, statuses):
        Line = _model('nline.quote.line')
        if not Line:
            return []
        rows = []
        for line in Line.search([
                    ('product', 'in', products),
                    ('quote.status', 'in', statuses),
                    ], order=[('quote.id', 'DESC'), ('line_no', 'ASC')],
                limit=500):
            quote = line.quote
            prices = list(line.prices or [])
            first = prices[0] if prices else None
            bom = line.bom
            rows.append({
                    'id': quote.id,
                    'number': quote.number or str(quote.id),
                    'party': _code(quote.party),
                    'party_name': quote.party.rec_name if quote.party else '',
                    'date': quote.quote_date,
                    'status': STATUS_LABELS.get(quote.status, quote.status),
                    'sales_rep': quote.sales_rep or '',
                    'sequence': line.line_no,
                    'quantity': first.quantity if first else None,
                    'unit': line.unit.symbol if line.unit else '',
                    'unit_price': first.unit_price if first else None,
                    'discount': first.trade_discount if first else None,
                    'multiple': len(prices) > 1,
                    'customer_part': line.customer_part or '',
                    'product_code': _code(line.product_code),
                    'commodity_code': _code(line.commodity_code),
                    'drawing': line.drawing_number or '',
                    'drawing_rev': line.drawing_revision or '',
                    'eng_master': (_get(bom, 'revision', 'rec_name') or ''
                        if bom else ''),
                    })
        return rows

    @classmethod
    def _js_lines_sale(cls, template, products, statuses):
        Line = _model('sale.line')
        if not Line:
            return []
        rows = []
        for line in Line.search([
                    ('product', 'in', products),
                    ] + cls._js_status_domain('sale', 'sale.', statuses),
                order=[('sale.id', 'DESC'), ('sequence', 'ASC'),
                    ('id', 'ASC')], limit=500):
            sale = line.sale
            shipped = cls._js_done_quantity(line, 'customer')
            price = line.unit_price or ZERO
            line_status = getattr(line, 'js_line_status', None)
            if line_status is None:
                line_status = ('closed' if shipped >= line.quantity
                    else 'open')
            dates = [m.effective_date for m in line.moves
                if m.state == 'done' and m.effective_date
                and m.to_location.type == 'customer']
            sales_rep = getattr(sale, 'sales_rep', None)
            rows.append({
                    'id': sale.id,
                    'line': line.id,
                    'linked': bool(getattr(line, 'productions', None)),
                    'number': sale.number or str(sale.id),
                    'party': _code(sale.party),
                    'party_name': sale.party.rec_name,
                    'date': sale.sale_date,
                    'status': cls._js_doc_status('sale', sale),
                    'sales_rep': _code(sales_rep) if sales_rep else '',
                    'reference': sale.reference or '',
                    'po_line': getattr(line, 'customer_po_line', None) or '',
                    'sequence': _line_no(line, sale.lines),
                    'line_status': {'open': "Open", 'closed': "Closed",
                        'cancelled': "Cancelled"}.get(line_status,
                        line_status),
                    'desired_date': (getattr(line, 'js_desired_date', None)
                        or line.shipping_date),
                    'quantity': line.quantity,
                    'shipped': shipped,
                    'unit': line.unit.symbol if line.unit else '',
                    'unit_price': price,
                    'discount': _num(getattr(line, 'trade_discount', None)),
                    'amount': line.amount,
                    'shipped_amount': (price * Decimal(str(shipped))
                        ).quantize(Decimal('0.01')),
                    'last_shipped': max(dates) if dates else None,
                    'customer_part': getattr(line, 'customer_part', None)
                    or '',
                    'product_code': _code(getattr(line, 'product_code', None)
                        or template.product_code),
                    'commodity_code': _code(getattr(line, 'commodity_code',
                            None) or template.commodity_code),
                    'drawing': (getattr(line, 'drawing_id', None)
                        or template.drawing_number or ''),
                    'drawing_rev': (getattr(line, 'drawing_rev', None)
                        or template.drawing_revision or ''),
                    'eng_master': template.engineering_revision or '',
                    })
        return rows

    @classmethod
    def _js_lines_rfq(cls, template, products, statuses):
        Line = _model('nline.rfq.line')
        if not Line:
            return []
        rows = []
        for line in Line.search([
                    ('product', 'in', products),
                    ('rfq.status', 'in', statuses),
                    ], order=[('rfq.id', 'DESC'), ('sequence', 'ASC')],
                limit=500):
            rfq = line.rfq
            prices = list(line.prices or [])
            first = prices[0] if prices else None
            row = {
                'id': rfq.id,
                'number': rfq.number or str(rfq.id),
                'date': rfq.rfq_date,
                'status': {'unreleased': "Unreleased", 'active': "Active",
                    'closed': "Closed", 'cancelled': "Cancelled"}.get(
                    rfq.status, rfq.status),
                'sequence': _line_no(line, rfq.lines),
                'quantity': first.quantity if first else None,
                'unit': line.unit.symbol if line.unit else '',
                'multiple': len(prices) > 1,
                'product_code': _code(line.product_code),
                'commodity_code': _code(line.commodity_code),
                }
            for slot in (1, 2, 3):
                supplier = getattr(rfq, 'supplier_%s' % slot, None)
                row['supplier_%s' % slot] = _code(supplier)
                for name in ['unit_price', 'trade_discount', 'delivery_date',
                        'lead_time']:
                    value = getattr(first, '%s_%s' % (name, slot), None) \
                        if first else None
                    row['%s_%s' % (name, slot)] = (_num(value)
                        if isinstance(value, Decimal) else value)
            rows.append(row)
        return rows

    @classmethod
    def _js_lines_purchase(cls, template, products, statuses):
        Line = _model('purchase.line')
        if not Line:
            return []
        rows = []
        for line in Line.search([
                    ('product', 'in', products),
                    ] + cls._js_status_domain('purchase', 'purchase.',
                    statuses),
                order=[('purchase.id', 'DESC'), ('sequence', 'ASC'),
                    ('id', 'ASC')], limit=500):
            purchase = line.purchase
            received = cls._js_done_quantity(line, 'supplier')
            dates = [m.effective_date for m in line.moves
                if m.state == 'done' and m.effective_date]
            price = line.unit_price or ZERO
            line_status = getattr(line, 'line_status', None) or (
                'closed' if received >= line.quantity else 'open')
            rows.append({
                    'id': purchase.id,
                    'line': line.id,
                    'linked': bool(getattr(line, 'links', None)
                        or getattr(line, 'requests', None)),
                    'number': purchase.number or str(purchase.id),
                    'party': _code(purchase.party),
                    'party_name': purchase.party.rec_name,
                    'date': purchase.purchase_date,
                    'status': cls._js_doc_status('purchase', purchase),
                    'buyer': (getattr(purchase, 'buyer', None)
                        or (purchase.create_uid.rec_name
                            if purchase.create_uid else '')),
                    'sequence': _line_no(line, purchase.lines),
                    'line_status': {'open': "Open", 'closed': "Closed"}.get(
                        line_status, line_status),
                    'desired_date': line.delivery_date,
                    'quantity': line.quantity,
                    'received': received,
                    'unit': line.unit.symbol if line.unit else '',
                    'unit_price': price,
                    'discount': _num(getattr(line, 'trade_discount', None)),
                    'fixed_charge': getattr(line, 'fixed_charge', None),
                    'amount': line.amount,
                    'received_amount': (price * Decimal(str(received))
                        ).quantize(Decimal('0.01')),
                    'last_received': max(dates) if dates else None,
                    'promise_date': (getattr(line, 'promise_date', None)
                        or getattr(purchase, 'promise_date', None)),
                    'drawing': (getattr(line, 'drawing', None)
                        or template.drawing_number or ''),
                    'drawing_rev': (getattr(line, 'drawing_revision', None)
                        or template.drawing_revision or ''),
                    'supplier_part': getattr(line, 'supplier_part_code',
                        None) or '',
                    'mfg_name': (getattr(line, 'mfg_name', None)
                        or template.mfg_name or ''),
                    'mfg_part_id': (getattr(line, 'mfg_part_id', None)
                        or template.mfg_part_id or ''),
                    'product_code': _code(getattr(line, 'product_code', None)
                        or template.product_code),
                    'commodity_code': _code(getattr(line, 'commodity_code',
                            None) or template.commodity_code),
                    })
        return rows

    @classmethod
    def _js_lines_production(cls, template, products, statuses):
        Production = _model('production')
        if not Production:
            return []
        rows = []
        for production in Production.search([
                    ('product', 'in', products),
                    ] + cls._js_status_domain('production', '', statuses),
                order=[('id', 'DESC')], limit=500):
            received = sum(m.quantity for m in production.outputs
                if m.state == 'done' and m.product.id in products)
            cost = getattr(production, 'cost', None)
            quantity = production.quantity or 0
            bom = production.bom
            rows.append({
                    'id': production.id,
                    'number': production.number or str(production.id),
                    'lot': '',
                    'split': (str(production.leg_index)
                        if getattr(production, 'leg_index', None) else ''),
                    'description': (_get(production, 'description')
                        or template.name),
                    'date': production.planned_date,
                    'release_date': production.planned_start_date,
                    'status': cls._js_doc_status('production', production),
                    'quantity': quantity,
                    'received': received,
                    'unit': (production.unit.symbol
                        if production.unit else ''),
                    'unit_cost': (cost / Decimal(str(quantity))
                        ).quantize(Decimal('0.0001'))
                    if cost and quantity else None,
                    'start': production.planned_start_date,
                    'finish': production.planned_date,
                    'drawing': (_get(production, 'drawing_number')
                        or template.drawing_number or ''),
                    'drawing_rev': (_get(production, 'drawing_revision')
                        or template.drawing_revision or ''),
                    'eng_master': (_get(bom, 'revision') or ''
                        if bom else ''),
                    })
        return rows

    # ---- The pricing tabs ---------------------------------------------

    @classmethod
    def part_prices(cls, template, kind):
        """The part's quantity / price breaks: 'supplier' (its suppliers),
        'service' (the suppliers' services done to the part), 'customer'
        (customer prices) and 'discount' (discount class prices)"""
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        rows = []
        if kind in ('supplier', 'service'):
            ProductSupplier = _model('purchase.product_supplier')
            if not ProductSupplier:
                return []
            if kind == 'supplier':
                domain = ['OR', ('template', '=', template.id),
                    ('product', 'in', products)]
            elif 'service_part' in ProductSupplier._fields:
                domain = [('service_part', 'in', [template.id] + products)]
            else:
                return []
            with Transaction().set_context(active_test=False):
                suppliers = ProductSupplier.search(domain)
            for supplier in suppliers:
                if kind == 'supplier' and getattr(supplier, 'service_part',
                        None):
                    continue
                prices = list(supplier.prices or [])
                row = {
                    'party': _code(supplier.party),
                    'party_name': supplier.party.rec_name,
                    'party_id': supplier.party.id,
                    'code': supplier.code or '',
                    'service': (supplier.template.code or supplier.template.name
                        if kind == 'service' and supplier.template else ''),
                    'mfg_name': getattr(supplier, 'mfg_name', None) or '',
                    'mfg_part_id': getattr(supplier, 'mfg_part_id', None)
                    or '',
                    'unit': (supplier.unit.symbol
                        if getattr(supplier, 'unit', None) else ''),
                    'quote_type': {'break': "Break Table",
                        'upto': "Up-to-Qty Table"}.get(
                        getattr(supplier, 'price_type', None), ''),
                    'quote_date': getattr(supplier, 'quote_date', None),
                    'expires': getattr(supplier, 'expiration_date', None),
                    'default_price': None,
                    }
                for i, price in enumerate(prices[:10], 1):
                    row['qty_%s' % i] = price.quantity
                    row['price_%s' % i] = price.unit_price
                rows.append(row)
        elif kind in ('customer', 'discount'):
            SalePrice = _model('nline.sale_price')
            if not SalePrice:
                return []
            domain = [('product', 'in', products)]
            domain.append(('party', '!=', None) if kind == 'customer'
                else ('discount_class', '!=', None))
            for price in SalePrice.search(domain):
                owner = price.party if kind == 'customer' else (
                    price.discount_class)
                row = {
                    'party': _code(owner),
                    'party_name': (_get(owner, 'description', 'name')
                        or owner.rec_name),
                    'party_id': owner.id,
                    'customer_part': price.customer_part or '',
                    'unit': price.unit.symbol if price.unit else '',
                    'eng_master': template.engineering_revision or '',
                    'quote_type': {'break': "Break Table",
                        'up_to': "Up-to-Qty Table"}.get(price.quote_type, ''),
                    'quote_date': price.as_of,
                    'expires': price.expires,
                    'default_price': price.default_unit_price,
                    }
                for i, brk in enumerate(list(price.breaks or [])[:10], 1):
                    row['qty_%s' % i] = brk.quantity
                    row['price_%s' % i] = brk.unit_price
                rows.append(row)
        else:
            raise ValueError(kind)
        return rows

    # ---- Tracking Info -------------------------------------------------

    @classmethod
    def part_tracking(cls, template, show_all=False):
        """The tracking numbers (lots) of the part by location with their
        quantity on hand and the date they came in; Show All also those
        used up"""
        cls._check_read('stock.move')
        pool = Pool()
        Lot = pool.get('stock.lot')
        Move = pool.get('stock.move')
        Location = pool.get('stock.location')
        template = cls._js_part(template)
        products = [p.id for p in template.products]
        storages = cls._js_storages(active_test=False)
        quantities = on_hand([s.id for s in storages], products,
            grouping=('product', 'lot'), with_childs=False)
        rows = {}
        for (location, product, lot), quantity in quantities.items():
            if lot and (quantity or show_all):
                rows[(location, lot)] = quantity
        if show_all:
            for move in Move.search([
                        ('product', 'in', products),
                        ('lot', '!=', None),
                        ('state', '=', 'done'),
                        ('to_location', 'in', [s.id for s in storages]),
                        ]):
                rows.setdefault((move.to_location.id, move.lot.id), 0.0)
        result = []
        for (location, lot), quantity in rows.items():
            lot = Lot(lot)
            first = Move.search([('lot', '=', lot.id), ('state', '=', 'done')],
                order=[('effective_date', 'ASC'), ('id', 'ASC')], limit=1)
            result.append({
                    'location': _code(Location(location)),
                    'lot': lot.number,
                    'date': (getattr(lot, 'tracking_date', None)
                        or (first[0].effective_date if first else None)),
                    'quantity': quantity,
                    })
        result.sort(key=lambda r: (r['location'], r['lot']))
        return result

    # ---- Material Availability of a work order --------------------------

    @classmethod
    def wo_material_availability(cls, production, release_date=None,
            multi_level=True):
        """Jobshop's Material Availability of a work order in N-Line's
        layout (N-LineAvailability): each material card of the order (and
        of its legs: Level No), what is required, issued and due, and the
        projected quantity available at the release date (on hand plus the
        open supply minus the other demand due by then)"""
        pool = Pool()
        Production = pool.get('production')
        Product = pool.get('product.product')
        Uom = pool.get('product.uom')
        Date = pool.get('ir.date')
        cls._check_read('production')
        root = Production(int(production))
        release = (dt.date.fromisoformat(release_date[:10])
            if isinstance(release_date, str) and release_date
            else release_date or root.planned_start_date or Date.today())
        orders = [(0, root)]
        if multi_level:
            def walk(order, level):
                for leg in sorted(getattr(order, 'legs', []) or [],
                        key=lambda l: l.id):
                    orders.append((level, leg))
                    walk(leg, level + 1)
            walk(root, 1)
        needs = []
        for level, order in orders:
            cards = list(getattr(order, 'material_cards', None) or [])
            if cards:
                for card in cards:
                    if card.supply == 'leg' or not card.move:
                        continue
                    needs.append((level, order, card, card.move))
            else:
                for move in order.inputs:
                    needs.append((level, order, None, move))
        products = list({m.product.id for _, _, _, m in needs})
        warehouse = root.warehouse or cls._js_warehouse()
        projected = {}
        if products:
            with Transaction().set_context(locations=[warehouse.id],
                    with_childs=True, stock_date_end=release,
                    forecast=release > Date.today()):
                projected = {p.id: p.quantity for p in Product.browse(
                        products)}
        rows = []
        for level, order, card, move in needs:
            product = move.product
            template = product.template
            required = Uom.compute_qty(move.unit, move.quantity,
                product.default_uom)
            issued = required if move.state == 'done' else 0.0
            due = required - issued
            available = projected.get(product.id, 0.0)
            if move.state not in ('done', 'cancelled'):
                # The projection already counts this card's own demand
                # when it is due by the release date
                if move.planned_date and move.planned_date <= release:
                    available += required
            rows.append({
                    'level': level,
                    'production': order.id,
                    'part': product.rec_name,
                    'part_code': template.code or product.rec_name,
                    'template': template.id,
                    'sub_id': (str(order.leg_index)
                        if getattr(order, 'leg_index', None) else '0'),
                    'operation': card.operation if card else None,
                    'piece': card.piece if card else None,
                    'eng_master': (getattr(card, 'component_revision', None)
                        or template.engineering_revision or '')
                    if card else (template.engineering_revision or ''),
                    'description': template.name,
                    'status': MATERIAL_STATUS.get(move.state, move.state),
                    'required_date': move.planned_date,
                    'work_order': order.number or str(order.id),
                    'order_plan': 'Work Order' if level else '',
                    'required': required,
                    'issued': issued,
                    'due': due,
                    'projected': available,
                    'short': available - due,
                    'unit': product.default_uom.symbol,
                    'lead_time': template.lead_time_days,
                    'product_code': _code(template.product_code),
                    'commodity_code': _code(template.commodity_code),
                    'supplier': _code(template.preferred_supplier),
                    })
        return {
            'work_order': root.number or str(root.id),
            'part': root.product.rec_name if root.product else '',
            'release_date': release,
            'rows': rows,
            }
