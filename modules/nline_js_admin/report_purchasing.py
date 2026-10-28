# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"Jobshop reports: Purchasing"
from collections import defaultdict
from decimal import Decimal

from trytond.pool import Pool
from trytond.transaction import Transaction

from .report_sales import TAX_COLUMNS, party_rows, tax_rows
from .reports import (
    ORDER_STATUSES, PURCHASE_STATUS, ZERO, attr, code, dec, f_dates,
    f_range, f_status, name, part_id, received, report)

CENT = Decimal('0.01')


def _company():
    return Transaction().context.get('company')


def _purchases(p, states=None):
    Purchase = Pool().get('purchase.purchase')
    domain = [('company', '=', _company())]
    if states:
        domain.append(('state', 'in', states))
    else:
        domain.append(('state', '!=', 'draft'))
    domain += p.domain_dates('date', 'purchase_date')
    return Purchase.search(domain, order=[('number', 'ASC')])


def _po_head(purchase):
    party = purchase.party
    contact = purchase.contact
    return {
        'po': purchase.number or str(purchase.id),
        'date': purchase.purchase_date,
        'status': PURCHASE_STATUS.get(purchase.state, purchase.state),
        'supplier': code(party),
        'supplier_name': party.name,
        'contact': contact.rec_name if contact else '',
        'buyer': attr(purchase, 'buyer') or (purchase.create_uid.rec_name
            if purchase.create_uid else ''),
        'terms': name(purchase.payment_term),
        'ship_via': attr(purchase, 'ship_via', 'carrier') or '',
        'fob': attr(purchase, 'fob_point', 'fob') or '',
        'freight': attr(purchase, 'freight', 'freight_terms') or '',
        'desired': purchase.delivery_date,
        'promise': attr(purchase, 'promise_date'),
        'reference': purchase.reference or '',
        'amount': purchase.untaxed_amount,
        '_drill': {'type': 'screen', 'route':
            'purchase-orders/%s' % purchase.id},
        }


def _po_lines(purchase):
    return [l for l in purchase.lines if l.type == 'line']


def _line_values(line):
    ordered = line.quantity or 0
    done = received(line)
    return {
        'part': part_id(line.product),
        'description': line.description or name(line.product),
        'ordered': ordered,
        'received': done,
        'due': max(ordered - done, 0),
        'unit': line.unit.symbol if line.unit else '',
        'unit_price': line.unit_price,
        'amount': line.amount,
        'line_desired': line.delivery_date,
        'work_order': line.production.number
        if getattr(line, 'production', None) else '',
        }


PO_STATUS_FILTER = f_status('status', "Status", ORDER_STATUSES)


@report('purchase_order_list', "Purchase Order List", 'purchasing',
    'PurchaseOrderList.rpt', ['purchase.purchase'],
    [('po', "Purchase ID"), ('status', "Status"),
        ('date', "Order Date", 'date'), ('desired', "Desired Rcpt Date",
            'date'), ('promise', "Promise Date", 'date'),
        ('supplier', "Supplier ID"), ('supplier_name', "Supplier Name"),
        ('amount', "Amount", 'money')],
    filters=[f_range('po', "Purchase Order ID"),
        f_range('supplier', "Supplier ID"), f_dates('date', "Order Date"),
        PO_STATUS_FILTER],
    sort='po', advanced=True)
def purchase_order_list(desk, p):
    return [_po_head(po) for po in _purchases(p)]


DETAIL = [('line', "Line", 'int'), ('part', "Part ID"),
    ('description', "Description"), ('ordered', "Order Qty", 'qty'),
    ('received', "Received Qty", 'qty'), ('due', "Qty Due", 'qty'),
    ('unit', "UM"), ('unit_price', "Unit Price", 'money'),
    ('amount', "Amount", 'money'),
    ('line_desired', "Desired Rcpt", 'date'),
    ('work_order', "Work Order")]


def _detail_rows(p, states=None):
    rows = []
    for purchase in _purchases(p, states):
        head = _po_head(purchase)
        for i, line in enumerate(_po_lines(purchase), 1):
            rows.append(dict(head, line=i, **_line_values(line)))
    return rows


@report('purchase_order', "Purchase Order", 'purchasing',
    'PurchaseOrder.rpt', ['purchase.purchase'],
    [('po', "Purchase Order"), ('date', "Order Date", 'date'),
        ('buyer', "Buyer ID"), ('supplier_name', "To"),
        ('contact', "Contact"), ('desired', "Requested Receipt", 'date'),
        ('terms', "Payment Terms"), ('fob', "FOB Point"),
        ('ship_via', "Ship Via")] + DETAIL,
    filters=[f_range('po', "Purchase Order ID"),
        f_dates('date', "Order Date")],
    group_by='po', sort='line', totals=['amount'], landscape=True,
    note="The printed purchase order of a supplier is Tryton's purchase "
    "report (Purchase Orders window > Print).")
def purchase_order(desk, p):
    return _detail_rows(p)


@report('purchase_order_detail', "Purchase Order Detail", 'purchasing',
    'PurchaseOrderDetail.rpt', ['purchase.purchase'],
    [('po', "PO Number"), ('supplier', "Supplier"), ('contact', "Contact"),
        ('date', "Order Date", 'date'), ('promise', "Promise Date", 'date'),
        ('status', "Status"), ('ship_via', "Ship Via"),
        ('fob', "Free On Board"), ('terms', "Payment Terms")] + DETAIL,
    filters=[f_range('po', "PO Number"), f_range('supplier', "Supplier ID"),
        f_dates('date', "Order Date"), PO_STATUS_FILTER],
    group_by='po', sort='line', totals=['amount'], landscape=True)
def purchase_order_detail(desk, p):
    return _detail_rows(p)


def _receivers(p):
    Shipment = Pool().get('stock.shipment.in')
    return Shipment.search([('company', '=', _company())]
        + p.domain_dates('date', 'effective_date'),
        order=[('number', 'ASC')])


def _receiver_rows(p):
    rows = []
    for shipment in _receivers(p):
        for i, move in enumerate(shipment.incoming_moves, 1):
            line = move.origin if move.origin is not None and \
                move.origin.__name__ == 'purchase.line' else None
            purchase = line.purchase if line else None
            rows.append({
                    'receiver': shipment.number or str(shipment.id),
                    'date': shipment.effective_date or shipment.planned_date,
                    'supplier': code(shipment.supplier),
                    'supplier_name': shipment.supplier.name,
                    'contact': name(shipment.contact_address),
                    'reference': shipment.reference or '',
                    'status': {'done': "Received", 'received': "Received",
                        'cancelled': "Cancelled"}.get(shipment.state,
                        shipment.state),
                    'po': purchase.number if purchase else '',
                    'order_date': purchase.purchase_date if purchase
                    else None,
                    'desired': line.delivery_date if line else None,
                    'promise': attr(line, 'promise_date') if line else None,
                    'buyer': purchase.create_uid.rec_name if purchase and
                    purchase.create_uid else '',
                    'line': i,
                    'part': part_id(move.product),
                    'description': move.product.name,
                    'ordered': line.quantity if line else None,
                    'quantity': move.quantity,
                    'unit': move.unit.symbol,
                    'unit_cost': move.unit_price,
                    'amount': (dec(move.quantity) * (move.unit_price or
                            ZERO)).quantize(CENT),
                    'work_order': line.production.number if line and
                    getattr(line, 'production', None) else '',
                    '_drill': {'type': 'record', 'model':
                        'stock.shipment.in', 'id': shipment.id},
                    })
    return rows


RECEIVER_COLUMNS = [('receiver', "Receiver ID"), ('po', "Purchase Order ID"),
    ('date', "Received Date", 'date'), ('order_date', "Order Date", 'date'),
    ('supplier', "Supplier"), ('contact', "Contact"), ('line', "Line", 'int'),
    ('part', "Part ID"), ('description', "Description"),
    ('ordered', "Order Qty", 'qty'), ('quantity', "Received Qty", 'qty'),
    ('unit', "UM"), ('amount', "Amount", 'money')]


@report('receiver_list', "Receiver List", 'purchasing', 'ReceiverList.rpt',
    ['stock.shipment.in'], RECEIVER_COLUMNS,
    filters=[f_range('receiver', "Receiver ID"),
        f_range('supplier', "Supplier ID"), f_dates('date',
            "Received Date")],
    sort='receiver', advanced=True, landscape=True)
def receiver_list(desk, p):
    return _receiver_rows(p)


@report('receiver', "Receiver", 'purchasing', 'Receiving.rpt',
    ['stock.shipment.in'],
    RECEIVER_COLUMNS + [('desired', "Desired Date", 'date'),
        ('promise', "Promise Date", 'date'), ('buyer', "Buyer ID"),
        ('work_order', "Work Order")],
    filters=[f_range('receiver', "Receiver ID"),
        f_dates('date', "Received Date")],
    group_by='receiver', sort='line', landscape=True)
def receiver(desk, p):
    return _receiver_rows(p)


@report('service_list', "Service List", 'purchasing', 'ServiceList.rpt',
    ['product.product'],
    [('id', "Service ID"), ('description', "Description"),
        ('supplier', "Supplier"), ('unit_cost', "Unit Cost", 'money')],
    filters=[f_range('id', "Service ID")], sort='id', totals=[],
    advanced=True)
def service_list(desk, p):
    Product = Pool().get('product.product')
    rows = []
    for product in Product.search([('type', '=', 'service'),
                ('purchasable', '=', True)]):
        suppliers = product.product_suppliers or \
            product.template.product_suppliers
        rows.append({
                'id': part_id(product),
                'description': product.name,
                'supplier': suppliers[0].party.rec_name if suppliers else '',
                'unit_cost': product.cost_price,
                })
    return rows


@report('supplier_list', "Supplier List", 'purchasing', 'SupplierList.rpt',
    ['party.party'],
    [('supplier', "Supplier ID"), ('supplier_name', "Name"),
        ('address', "Address"), ('city', "City"), ('state', "State"),
        ('postal', "Postal Code"), ('country', "Country"),
        ('contact', "Contact"), ('title', "Contact Title"),
        ('phone', "Phone"), ('fax', "Fax"), ('email', "E-mail")],
    filters=[f_range('supplier', "Supplier ID")], sort='supplier',
    totals=[], advanced=True, landscape=True)
def supplier_list(desk, p):
    return party_rows('supplier')


def _supplier_prices(p):
    ProductSupplier = Pool().get('purchase.product_supplier')
    rows = []
    for ps in ProductSupplier.search([]):
        product = ps.product or (ps.template.products[0]
            if ps.template.products else None)
        prices = ps.prices or [None]
        for price in prices:
            rows.append({
                    'supplier': code(ps.party),
                    'supplier_name': ps.party.name,
                    'contact': '',
                    'part': part_id(product),
                    'description': ps.template.name,
                    'supplier_part': ps.code or '',
                    'quote_type': attr(ps, 'price_type') or (
                        "Price Break" if price else "Default"),
                    'unit': ps.unit.symbol if ps.unit else '',
                    'break': price.quantity if price else None,
                    'price': price.unit_price if price else (
                        product.cost_price if product else None),
                    'lead_time': ps.lead_time.days if ps.lead_time
                    else None,
                    'as_of': attr(ps, 'as_of_date', 'quote_date'),
                    'expires': attr(ps, 'expiration_date'),
                    'manufacturer': attr(ps, 'mfg_name', 'manufacturer')
                    or '',
                    'mfg_part': attr(ps, 'mfg_part_id') or '',
                    })
    return rows


@report('parts_by_supplier', "Parts & Services by Supplier", 'purchasing',
    'Partsbysupplier.rpt', ['purchase.product_supplier'],
    [('supplier', "Supplier ID"), ('supplier_name', "Supplier Name"),
        ('part', "Part ID"), ('description', "Description"),
        ('supplier_part', "Supplier Part ID"),
        ('price', "Default Price", 'money'), ('unit', "UM"),
        ('quote_type', "Quote Type"), ('break', "Price Break Qty", 'qty'),
        ('as_of', "As of Date", 'date'), ('expires', "Expiration Date",
            'date'), ('lead_time', "Lead Time (days)", 'int')],
    filters=[f_range('supplier', "Supplier ID"), f_range('part',
            "Part ID")],
    group_by='supplier', sort='part', totals=[], landscape=True)
def parts_by_supplier(desk, p):
    return _supplier_prices(p)


@report('supplier_part_price_list', "Supplier Prices by Part List",
    'purchasing', 'SupplierPartPriceList.rpt', ['purchase.product_supplier'],
    [('part', "Part ID"), ('quote_type', "Quote Type"),
        ('supplier_part', "Supplier Part ID"), ('unit', "Purchased UM"),
        ('as_of', "As of Date", 'date'), ('expires', "Expires On", 'date'),
        ('supplier', "Supplier ID"), ('supplier_name', "Supplier Name"),
        ('break', "Break Quantity", 'qty'),
        ('price', "Quoted Unit Price", 'money'),
        ('manufacturer', "Manufacturer"), ('mfg_part', "Mfg Part ID")],
    filters=[f_range('part', "Part ID"), f_range('supplier',
            "Supplier ID")],
    group_by='part', sort='supplier', totals=[], landscape=True)
def supplier_part_price_list(desk, p):
    return _supplier_prices(p)


@report('supplier_delivery_performance', "Supplier Delivery Performance",
    'purchasing', 'SupplierDeliveryPerformance.rpt', ['purchase.purchase'],
    [('supplier', "Supplier ID"), ('supplier_name', "Supplier Name"),
        ('receipts', "Receipts", 'int'), ('early', "Early", 'int'),
        ('on_time', "On Time", 'int'), ('late', "Late", 'int'),
        ('on_time_pct', "On Time %", 'pct'),
        ('average_days', "Avg Days Late", 'num')],
    filters=[f_range('supplier', "Supplier ID"),
        f_dates('date', "Received Date", column='_date',
            default='this-year')],
    sort='supplier', totals=['receipts', 'early', 'on_time', 'late'],
    chart={'label': 'supplier', 'value': 'on_time_pct',
        'title': "On Time %", 'kind': 'hbar'})
def supplier_delivery_performance(desk, p):
    Move = Pool().get('stock.move')
    stats = defaultdict(lambda: {'receipts': 0, 'early': 0, 'on_time': 0,
            'late': 0, 'days': 0})
    names = {}
    for move in Move.search([('company', '=', _company()),
                ('state', '=', 'done'),
                ('from_location.type', '=', 'supplier'),
                ] + p.domain_dates('date', 'effective_date')):
        line = move.origin if move.origin is not None and \
            move.origin.__name__ == 'purchase.line' else None
        if not line:
            continue
        party = line.purchase.party
        key = code(party)
        names[key] = party.name
        stat = stats[key]
        stat['receipts'] += 1
        wanted = line.delivery_date or line.purchase.delivery_date
        if not wanted or not move.effective_date:
            stat['on_time'] += 1
            continue
        days = (move.effective_date - wanted).days
        if days < 0:
            stat['early'] += 1
        elif days == 0:
            stat['on_time'] += 1
        else:
            stat['late'] += 1
            stat['days'] += days
    return [{
            'supplier': key,
            'supplier_name': names[key],
            'receipts': s['receipts'],
            'early': s['early'],
            'on_time': s['on_time'],
            'late': s['late'],
            'on_time_pct': round(100.0 * (s['on_time'] + s['early'])
                / s['receipts'], 1) if s['receipts'] else None,
            'average_days': round(s['days'] / s['late'], 1)
            if s['late'] else 0,
            } for key, s in stats.items()]


@report('supplier_price_performance', "Supplier Price Performance",
    'purchasing', 'SupplierPricePerformance.rpt', ['purchase.purchase'],
    [('supplier', "Supplier ID"), ('part', "Part ID"),
        ('description', "Description"), ('fob', "FOB Point"),
        ('ship_via', "Ship Via"), ('terms', "Payment Terms"),
        ('quantity', "Rcvd Quantity", 'qty'),
        ('average', "Average Price", 'money'),
        ('volume', "Volume", 'money'), ('unit', "UM")],
    filters=[f_range('supplier', "Supplier ID"), f_range('part', "Part ID"),
        f_dates('date', "Received Date", column='_date',
            default='this-year')],
    group_by='supplier', sort='part', totals=['volume'], landscape=True)
def supplier_price_performance(desk, p):
    Move = Pool().get('stock.move')
    stats = {}
    for move in Move.search([('company', '=', _company()),
                ('state', '=', 'done'),
                ('from_location.type', '=', 'supplier'),
                ] + p.domain_dates('date', 'effective_date')):
        line = move.origin if move.origin is not None and \
            move.origin.__name__ == 'purchase.line' else None
        if not line:
            continue
        purchase = line.purchase
        key = (code(purchase.party), move.product.id)
        stat = stats.setdefault(key, {
                'supplier': key[0],
                'part': part_id(move.product),
                'description': move.product.name,
                'fob': attr(purchase, 'fob_point', 'fob') or '',
                'ship_via': attr(purchase, 'ship_via') or '',
                'terms': name(purchase.payment_term),
                'quantity': 0.0,
                'volume': ZERO,
                'unit': move.unit.symbol,
                })
        stat['quantity'] += move.quantity
        stat['volume'] += dec(move.quantity) * (move.unit_price or ZERO)
    rows = []
    for stat in stats.values():
        stat['volume'] = stat['volume'].quantize(CENT)
        stat['average'] = (stat['volume'] / dec(stat['quantity'])).quantize(
            Decimal('0.0001')) if stat['quantity'] else None
        rows.append(stat)
    return rows


@report('purchase_tax_group_list', "Tax Group List", 'purchasing',
    'PurchaseSalesTaxGroupList.rpt', ['account.tax'], TAX_COLUMNS,
    filters=[f_range('tax', "Tax Name")], sort='tax', totals=[],
    advanced=True)
def purchase_tax_group_list(desk, p):
    return tax_rows('purchase')
