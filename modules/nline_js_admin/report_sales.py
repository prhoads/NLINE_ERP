# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"Jobshop reports: Sales"
from collections import defaultdict
from decimal import Decimal

from trytond.pool import Pool
from trytond.transaction import Transaction

from .report_inventory import _part_codes
from .reports import (
    ORDER_STATUSES, SALE_STATUS, ZERO, attr, code, code_rows, dec,
    f_dates, f_option, f_range, f_status, first_model, move_cost, name,
    part_id, report, shipped)

CENT = Decimal('0.01')
CODE_COLUMNS = [('id', "ID"), ('description', "Description")]


def _company():
    return Transaction().context.get('company')


def _sales(p, states=None):
    Sale = Pool().get('sale.sale')
    domain = [('company', '=', _company())]
    if states:
        domain.append(('state', 'in', states))
    else:
        domain.append(('state', 'not in', ['draft', 'quotation']))
    domain += p.domain_dates('date', 'sale_date')
    return Sale.search(domain, order=[('number', 'ASC')])


def _order_head(sale):
    party = sale.party
    address = sale.shipment_address
    return {
        'order': sale.number or str(sale.id),
        'date': sale.sale_date,
        'status': SALE_STATUS.get(sale.state, sale.state),
        'customer': code(party),
        'customer_name': party.name,
        'reference': sale.reference or '',
        'terms': name(sale.payment_term),
        'ship_via': attr(sale, 'ship_via', 'js_carrier', 'carrier') or '',
        'fob': attr(sale, 'fob_point', 'fob') or '',
        'freight': attr(sale, 'freight', 'freight_terms') or '',
        'sales_rep': attr(sale, 'sales_rep') or attr(party, 'sales_rep')
        or '',
        'territory': attr(sale, 'territory') or attr(party, 'territory')
        or '',
        'desired_ship': sale.shipping_date,
        'promise': attr(sale, 'promise_date'),
        'ship_to': address.full_address.replace('\n', ', ')
        if address else '',
        '_drill': {'type': 'screen', 'route': 'orders/%s' % sale.id},
        }


def _order_gaps(p):
    Sale = Pool().get('sale.sale')
    missing = [label for field, label in [
            ('sales_rep', "Sales Rep"), ('territory', "Territory"),
            ('ship_via', "Ship Via"), ('fob_point', "FOB Point"),
            ('promise_date', "Promise Date")]
        if field not in Sale._fields]
    if missing:
        p.gap("Sales orders: %s not in Tryton yet (nline_js_sales)."
            % ', '.join(missing))


def _line_values(line):
    ordered = line.quantity or 0
    done = shipped(line)
    due = max(ordered - done, 0)
    price = line.unit_price or ZERO
    discount = attr(line, 'discount_rate', 'discount')
    return {
        'part': part_id(line.product),
        'description': line.description or name(line.product),
        'ordered': ordered,
        'shipped': done,
        'due': due,
        'unit': line.unit.symbol if line.unit else '',
        'unit_price': price,
        'discount': float(discount) * 100 if discount else None,
        'amount': line.amount,
        'backlog': (dec(due) * price).quantize(CENT),
        'due_date': line.shipping_date,
        'product_code': _part_codes(line.product)['product_code']
        if line.product else '',
        'commodity_code': _part_codes(line.product)['commodity_code']
        if line.product else '',
        }


def _lines(sale):
    return [l for l in sale.lines if l.type == 'line']


ORDER_FILTERS = [f_range('order', "Order ID"),
    f_range('customer', "Customer ID")]


@report('line_backlog', "Backlog by Order Line", 'sales', 'LineBacklog.rpt',
    ['sale.sale'],
    [('due_date', "Due Date", 'date'), ('order', "Order ID"),
        ('line', "Line", 'int'), ('customer', "Customer ID"),
        ('reference', "Purchase Order Ref"), ('part', "Part ID"),
        ('description', "Description"), ('ordered', "Ordered Qty", 'qty'),
        ('shipped', "Shipped Qty", 'qty'), ('due', "Qty Due", 'qty'),
        ('unit', "UM"), ('unit_price', "Unit Price", 'money'),
        ('discount', "Discount %", 'pct'),
        ('backlog', "Backlog Amount", 'money')],
    filters=ORDER_FILTERS + [f_dates('due_date', "Due Date")],
    sort='due_date', totals=['backlog'], landscape=True)
def line_backlog(desk, p):
    rows = []
    for sale in _sales(p, ['confirmed', 'processing']):
        head = _order_head(sale)
        for i, line in enumerate(_lines(sale), 1):
            values = _line_values(line)
            if values['due'] <= 0:
                continue
            row = dict(head, line=i, **values)
            row['due_date'] = values['due_date'] or sale.shipping_date
            rows.append(row)
    return rows


@report('backlog', "Backlog by Sales Order", 'sales', 'Backlog.rpt',
    ['sale.sale'],
    [('order', "Order ID"), ('customer', "Customer ID"),
        ('customer_name', "Customer Name"),
        ('desired_ship', "Desired Ship Date", 'date'),
        ('ship_via', "Shipping Method"), ('terms', "Order Terms"),
        ('status', "Order Status"), ('line', "Order Line", 'int'),
        ('part', "Part ID"), ('due', "Qty Due", 'qty'),
        ('unit_price', "Unit Price", 'money'),
        ('backlog', "Backlog Amount", 'money')],
    filters=ORDER_FILTERS, group_by='order', sort='line',
    totals=['backlog'], landscape=True)
def backlog(desk, p):
    _order_gaps(p)
    horizon = p.date('horizon')
    # Jobshop's "Desired Ship Date On or Before"
    return [r for r in line_backlog(desk, p) if not horizon
        or (r.get('desired_ship') and r['desired_ship'] <= horizon)]


@report('sales_order_list', "Sales Order List", 'sales',
    'Salesorderlist.rpt', ['sale.sale'],
    [('order', "Sales Order ID"), ('date', "Order Date", 'date'),
        ('status', "Status"), ('customer', "Customer ID"),
        ('customer_name', "Customer Name"), ('sales_rep', "Sales Rep"),
        ('territory', "Territory"), ('terms', "Terms"),
        ('freight', "Freight"), ('ship_via', "Ship Via"),
        ('fob', "FOB Point"), ('value', "Order Value", 'money'),
        ('value_shipped', "Value Shipped", 'money'),
        ('promise', "Promise Date", 'date'),
        ('desired_ship', "Ship Date", 'date')],
    filters=[f_range('order', "Sales Order ID"),
        f_range('customer', "Customer ID"),
        f_dates('date', "Order Date"),
        f_status('status', "Order Status", ORDER_STATUSES)],
    sort='order', advanced=True, landscape=True)
def sales_order_list(desk, p):
    _order_gaps(p)
    rows = []
    for sale in _sales(p):
        row = _order_head(sale)
        value_shipped = ZERO
        for line in _lines(sale):
            value_shipped += dec(shipped(line)) * (line.unit_price or ZERO)
        row.update({
                'value': sale.untaxed_amount,
                'value_shipped': value_shipped.quantize(CENT),
                })
        rows.append(row)
    return rows


DETAIL_COLUMNS = [('line', "Line", 'int'), ('part', "Part ID"),
    ('description', "Description"), ('ordered', "Ordered Qty", 'qty'),
    ('shipped', "Shipped Qty", 'qty'), ('due', "Qty Due", 'qty'),
    ('unit', "UM"), ('unit_price', "Unit Price", 'money'),
    ('discount', "Discount %", 'pct'), ('amount', "Amount", 'money')]


def _order_lines(p, states=None):
    rows = []
    for sale in _sales(p, states):
        head = _order_head(sale)
        for i, line in enumerate(_lines(sale), 1):
            rows.append(dict(head, line=i, **_line_values(line)))
    return rows


@report('sales_order_detail', "Sales Order Detail", 'sales',
    'SalesOrderDetail.rpt', ['sale.sale'],
    [('order', "Order ID"), ('date', "Order Date", 'date'),
        ('desired_ship', "Desired Ship Date", 'date'),
        ('status', "Status"), ('customer', "Customer ID"),
        ('ship_via', "Ship Via"), ('fob', "Free on Board"),
        ('terms', "Terms"), ('freight', "Freight")] + DETAIL_COLUMNS,
    filters=[f_range('order', "Order ID"),
        f_range('customer', "Customer ID"), f_dates('date', "Order Date"),
        f_status('status', "Status", ORDER_STATUSES)],
    group_by='order', sort='line', totals=['amount'], landscape=True)
def sales_order_detail(desk, p):
    _order_gaps(p)
    return _order_lines(p)


@report('sales_order_acknowledgement', "Sales Order Acknowledgement",
    'sales', 'SalesOrderAcknowledgement.rpt', ['sale.sale'],
    [('order', "Order ID"), ('date', "Order Date", 'date'),
        ('customer_name', "Sold To"), ('ship_to', "Ship To"),
        ('reference', "Customer PO"), ('terms', "Terms"),
        ('due_date', "Promised Ship", 'date')] + DETAIL_COLUMNS,
    filters=[f_range('order', "Order ID"), f_dates('date', "Order Date")],
    group_by='order', sort='line', totals=['amount'], landscape=True)
def sales_order_acknowledgement(desk, p):
    return _order_lines(p, ['confirmed', 'processing', 'done'])


@report('customer_list', "Customer List", 'sales', 'CustomerList.rpt',
    ['party.party'],
    [('customer', "Customer ID"), ('customer_name', "Customer Name"),
        ('contact', "Contact"), ('title', "Title"), ('address', "Address"),
        ('city', "City"), ('state', "State"), ('postal', "Postal Code"),
        ('country', "Country"), ('phone', "Phone"), ('fax', "Fax"),
        ('email', "Email")],
    filters=[f_range('customer', "Customer ID")], sort='customer',
    totals=[], advanced=True, landscape=True)
def customer_list(desk, p):
    return party_rows('customer')


def party_rows(kind):
    "The customers (parties of sales or invoices) or the suppliers"
    pool = Pool()
    Party = pool.get('party.party')
    Invoice = pool.get('account.invoice')
    ids = set()
    if kind == 'customer':
        Sale = pool.get('sale.sale')
        ids |= {s.party.id for s in Sale.search([])}
        ids |= {i.party.id for i in Invoice.search([('type', '=', 'out')])}
        flag = 'customer'
    else:
        Purchase = pool.get('purchase.purchase')
        ids |= {s.party.id for s in Purchase.search([])}
        ids |= {i.party.id for i in Invoice.search([('type', '=', 'in')])}
        flag = 'supplier'
    for field in ('is_%s' % flag, 'js_%s' % flag):
        if field in Party._fields:
            ids |= {pa.id for pa in Party.search([(field, '=', True)])}
    rows = []
    with Transaction().set_context(active_test=False):
        parties = Party.browse(sorted(ids))
    for party in parties:
        address = party.addresses[0] if party.addresses else None
        contacts = getattr(party, 'relations', None) or []
        contact = contacts[0].to if contacts else None
        rows.append({
                kind: code(party),
                kind + '_name': party.name,
                'contact': attr(party, '%s_contact' % kind) or (
                    contact.rec_name if contact else ''),
                'title': attr(party, '%s_contact_title' % kind,
                    'contact_title') or (attr(contacts[0], 'type')
                    if contacts else '') or '',
                'address': (address.street or '').replace('\n', ', ')
                if address else '',
                'city': address.city if address else '',
                'state': (address.subdivision.code or '').split('-')[-1]
                if address and address.subdivision else '',
                'postal': address.postal_code if address else '',
                'country': address.country.code if address and
                address.country else '',
                'phone': party.phone or '',
                'fax': party.fax or '',
                'email': party.email or '',
                '_active': party.active,
                '_drill': {'type': 'record', 'model': 'party.party',
                    'id': party.id},
                })
    return rows


def _invoices(p, type_='out'):
    Invoice = Pool().get('account.invoice')
    domain = [('company', '=', _company()), ('type', '=', type_),
        ('state', 'in', ['posted', 'paid'])]
    domain += p.domain_dates('date', 'invoice_date')
    return Invoice.search(domain, order=[('number', 'ASC')])


def _invoice_head(invoice):
    contact = getattr(invoice, 'contact', None)
    return {
        'invoice': invoice.number or '',
        'date': invoice.invoice_date,
        'customer': code(invoice.party),
        'customer_name': invoice.party.name,
        'contact': contact.rec_name if contact else '',
        'reference': invoice.reference or '',
        'terms': name(invoice.payment_term),
        'posted_date': invoice.move.post_date if invoice.move else None,
        'account': invoice.account.code or invoice.account.name,
        'total': invoice.total_amount,
        'untaxed': invoice.untaxed_amount,
        'tax': invoice.tax_amount,
        'status': "Paid" if invoice.state == 'paid' else "Open",
        '_drill': {'type': 'record', 'model': 'account.invoice',
            'id': invoice.id},
        }


@report('invoice_list', "Invoice List", 'sales', 'InvoiceList.rpt',
    ['account.invoice'],
    [('invoice', "Invoice ID"), ('date', "Invoice Date", 'date'),
        ('customer', "Customer"), ('customer_name', "Name"),
        ('contact', "Contact"), ('total', "Invoice Amount", 'money'),
        ('terms', "Payment Terms"), ('posted_date', "Posted Date", 'date'),
        ('account', "Receiving Account"), ('status', "Status")],
    filters=[f_range('invoice', "Invoice ID"),
        f_range('customer', "Customer ID"), f_dates('date', "Invoice Date"),
        f_status('status', "Status", [['Open', "Open"], ['Paid', "Paid"]])],
    sort='invoice', advanced=True)
def invoice_list(desk, p):
    return [_invoice_head(i) for i in _invoices(p)]


@report('invoice', "Invoice", 'sales', 'Invoice.rpt', ['account.invoice'],
    [('invoice', "Invoice ID"), ('date', "Invoice Date", 'date'),
        ('customer_name', "Bill To"), ('reference', "Customer PO"),
        ('terms', "Terms"), ('line', "Line", 'int'), ('part', "Part ID"),
        ('description', "Description"), ('quantity', "Quantity", 'qty'),
        ('unit', "UM"), ('unit_price', "Unit Price", 'money'),
        ('amount', "Amount", 'money')],
    filters=[f_range('invoice', "Invoice ID"),
        f_range('customer', "Customer ID"), f_dates('date', "Invoice Date")],
    group_by='invoice', sort='line', totals=['amount'], landscape=True,
    note="The printed invoice of a customer is Tryton's invoice report "
    "(Invoicing window > Print).")
def invoice(desk, p):
    rows = []
    for inv in _invoices(p):
        head = _invoice_head(inv)
        for i, line in enumerate((l for l in inv.lines
                    if l.type == 'line'), 1):
            rows.append(dict(head, line=i,
                    part=part_id(line.product),
                    description=line.description or name(line.product),
                    quantity=line.quantity,
                    unit=line.unit.symbol if line.unit else '',
                    unit_price=line.unit_price,
                    amount=line.amount))
    return rows


def _shipments(p, returns=True):
    pool = Pool()
    Shipment = pool.get('stock.shipment.out')
    domain = [('company', '=', _company())]
    shipments = list(Shipment.search(domain + p.domain_dates('date',
                'effective_date')))
    if returns:
        Return = pool.get('stock.shipment.out.return')
        shipments += Return.search(domain + p.domain_dates('date',
                'effective_date'))
    return shipments


SHIPPER_STATUS = {
    'draft': "Draft", 'waiting': "Waiting", 'assigned': "Picked",
    'picked': "Picked", 'packed': "Packed", 'done': "Shipped",
    'received': "Received", 'cancelled': "Cancelled",
    }


def _shipment_head(shipment):
    moves = [m for m in shipment.moves if m.origin is not None and
        m.origin.__name__ == 'sale.line']
    sales = sorted({m.origin.sale for m in moves}, key=lambda s: s.id)
    sale = sales[0] if sales else None
    invoices = sorted({il.invoice.number for m in moves
            for il in m.origin.invoice_lines
            if il.invoice and il.invoice.number})
    address = shipment.delivery_address if hasattr(
        shipment, 'delivery_address') else getattr(
        shipment, 'contact_address', None)
    is_return = shipment.__name__.endswith('.return')
    lines = (shipment.incoming_moves if is_return
        else shipment.outgoing_moves)
    amount = sum((dec(m.quantity) * (m.unit_price or ZERO)
            for m in lines), ZERO)
    return {
        'shipper': shipment.number or str(shipment.id),
        'type': "Return" if is_return else "Shipment",
        'customer': code(shipment.customer),
        'customer_name': shipment.customer.name,
        'ship_to': address.full_address.replace('\n', ', ')
        if address else '',
        'order': ', '.join(s.number or '' for s in sales),
        'reference': sale.reference if sale and sale.reference else '',
        'terms': name(sale.payment_term) if sale else '',
        'ship_via': attr(shipment, 'ship_via', 'js_carrier', 'carrier')
        or '',
        'fob': attr(shipment, 'fob_point') or (attr(sale, 'fob_point', 'fob')
            if sale else '') or '',
        'freight': attr(shipment, 'cost_used', 'freight'),
        'date': shipment.effective_date or shipment.planned_date,
        'status': SHIPPER_STATUS.get(shipment.state, shipment.state),
        'invoice': ', '.join(invoices),
        'amount': (-amount if is_return else amount).quantize(CENT),
        '_drill': {'type': 'record', 'model': shipment.__name__,
            'id': shipment.id},
        }


@report('shipper_list', "Shipper List", 'sales', 'Shipperlist.rpt',
    ['stock.shipment.out'],
    [('shipper', "Shipper ID"), ('type', "Type"),
        ('customer_name', "Sold To"), ('ship_to', "Ship To"),
        ('amount', "Amount", 'money'), ('terms', "Terms"),
        ('freight', "Freight", 'money'), ('ship_via', "Ship Via"),
        ('fob', "FOB"), ('date', "Shipped Date", 'date'),
        ('status', "Status"), ('order', "Sales Order"),
        ('invoice', "Invoice")],
    filters=[f_range('shipper', "Shipper ID"),
        f_range('customer', "Customer ID"),
        f_dates('date', "Shipped Date")],
    sort='shipper', totals=['amount'], advanced=True, landscape=True)
def shipper_list(desk, p):
    return [_shipment_head(s) for s in _shipments(p)]


@report('pack_list', "Pack List", 'sales', 'PackList.rpt',
    ['stock.shipment.out'],
    [('shipper', "Shipper ID"), ('order', "Sales Order"),
        ('date', "Shipped Date", 'date'), ('customer_name', "Sold To"),
        ('ship_to', "Ship To"), ('reference', "Customer Order"),
        ('terms', "Terms"), ('ship_via', "Shipping"),
        ('line', "Shipper Line", 'int'), ('part', "Part ID"),
        ('description', "Description"), ('ordered', "On-Order Qty", 'qty'),
        ('shipped', "Shipped Qty", 'qty'),
        ('backordered', "Backordered Qty", 'qty'), ('unit', "UM")],
    filters=[f_range('shipper', "Shipper ID"),
        f_dates('date', "Shipped Date")],
    group_by='shipper', sort='line', totals=[], landscape=True)
def pack_list(desk, p):
    rows = []
    for shipment in _shipments(p, returns=False):
        head = _shipment_head(shipment)
        for i, move in enumerate(shipment.outgoing_moves, 1):
            line = move.origin if move.origin is not None and \
                move.origin.__name__ == 'sale.line' else None
            ordered = line.quantity if line else move.quantity
            done = shipped(line) if line else move.quantity
            rows.append(dict(head, line=i,
                    part=part_id(move.product),
                    description=move.product.name,
                    ordered=ordered,
                    shipped=move.quantity,
                    backordered=max((ordered or 0) - done, 0),
                    unit=move.unit.symbol))
    return rows


ANALYSIS_BY = [['customer', "By Customer"],
    ['product_code', "By Product Code"], ['sales_rep', "By Sales Rep"],
    ['territory', "By Territory"], ['commodity_code', "By Commodity Code"],
    ['sic_code', "By SIC Code"]]


def _analysis_key(by, party, product):
    if by == 'customer':
        return code(party)
    if by in ('sales_rep', 'territory', 'sic_code'):
        return attr(party, by, 'customer_' + by) or ''
    if product is None:
        return ''
    return attr(product, by, 'js_' + by) or attr(
        product.template, by, 'js_' + by) or ''


@report('sales_analysis', "Sales Analysis", 'sales', 'SalesAnalysis.rpt',
    ['account.invoice', 'sale.sale'],
    [('key', "Analysis Key"), ('sales', "Sales Amount", 'money'),
        ('percent', "% of Total Sales", 'pct'),
        ('bookings', "Bookings", 'money'),
        ('ratio', "Bookings to Sales Ratio", 'num')],
    filters=[f_option('by', "Sales Analysis", ANALYSIS_BY),
        f_dates('date', "Date", column='_date', default='this-year')],
    sort='key', chart={'label': 'key', 'value': 'sales',
        'title': "Sales"})
def sales_analysis(desk, p):
    pool = Pool()
    Sale = pool.get('sale.sale')
    by = p.get('by') or 'customer'
    sales = defaultdict(lambda: ZERO)
    bookings = defaultdict(lambda: ZERO)
    for inv in _invoices(p):
        for line in inv.lines:
            if line.type != 'line':
                continue
            amount = line.amount or ZERO
            sales[_analysis_key(by, inv.party, line.product)] += amount
    for sale in Sale.search([('company', '=', _company()),
                ('state', 'in', ['confirmed', 'processing', 'done'])]
            + p.domain_dates('date', 'sale_date')):
        for line in _lines(sale):
            bookings[_analysis_key(by, sale.party, line.product)] += \
                line.amount or ZERO
    if by != 'customer' and not any(k for k in set(sales) | set(bookings)):
        p.gap("Sales Analysis %s: the field is not in Tryton yet."
            % dict(ANALYSIS_BY)[by])
    total = sum(sales.values(), ZERO)
    rows = []
    for key in sorted(set(sales) | set(bookings)):
        rows.append({
                'key': key or '(none)',
                'sales': sales.get(key, ZERO),
                'percent': float(sales.get(key, ZERO) / total * 100)
                if total else None,
                'bookings': bookings.get(key, ZERO),
                'ratio': round(float(bookings.get(key, ZERO)
                        / sales[key]), 2) if sales.get(key) else None,
                })
    return rows


@report('sales_gross_margin', "Sales, Gross Margin and Throughput", 'sales',
    'SalesGrossMargin.rpt', ['sale.sale', 'stock.move'],
    [('customer', "Customer ID"), ('customer_name', "Customer Name"),
        ('sales', "Sales", 'money'), ('cost', "Cost of Sales", 'money'),
        ('margin', "Gross Margin", 'money'), ('margin_pct', "GM %", 'pct'),
        ('material', "Material & Service", 'money'),
        ('throughput', "Throughput", 'money')],
    filters=[f_range('customer', "Customer ID"),
        f_dates('date', "Shipped Date", column='_date',
            default='this-year')],
    sort='customer', chart={'label': 'customer', 'value': 'margin',
        'title': "Gross Margin"})
def sales_gross_margin(desk, p):
    Move = Pool().get('stock.move')
    sales = defaultdict(lambda: ZERO)
    costs = defaultdict(lambda: ZERO)
    names = {}
    for move in Move.search([('company', '=', _company()),
                ('state', '=', 'done'),
                ['OR',
                    ('to_location.type', '=', 'customer'),
                    ('from_location.type', '=', 'customer')],
                ] + p.domain_dates('date', 'effective_date')):
        line = move.origin if move.origin is not None and \
            move.origin.__name__ == 'sale.line' else None
        party = line.sale.party if line else (move.shipment.customer
            if move.shipment is not None and hasattr(move.shipment,
                'customer') else None)
        if party is None:
            continue
        sign = 1 if move.to_location.type == 'customer' else -1
        key = code(party)
        names[key] = party.name
        sales[key] += sign * dec(move.quantity) * (move.unit_price or ZERO)
        costs[key] += sign * move_cost(move)
    rows = []
    for key in sorted(sales):
        sale, cost = sales[key].quantize(CENT), costs[key]
        margin = sale - cost
        rows.append({
                'customer': key,
                'customer_name': names[key],
                'sales': sale,
                'cost': cost,
                'margin': margin,
                'margin_pct': float(margin / sale * 100) if sale else None,
                'material': cost,
                'throughput': margin,
                })
    p.gap("Throughput: Tryton's cost of a shipped part is one cost price; "
        "the material and service part of it is not split from labor.")
    return rows


def sales_code_report(id, rname, rpt, label, candidates, columns=None,
        extra=None):
    @report(id, rname, 'sales', rpt, [], columns or CODE_COLUMNS,
        filters=[f_range('id', "%s ID" % label)], advanced=True,
        totals=[])
    def rows(desk, p):
        return code_rows(p, label, candidates, extra)
    return rows


sales_code_report('carrier_list', "Carrier List", 'Carrierlist.rpt',
    "Carrier", ['nline.carrier', 'nline.js.carrier', 'carrier'],
    columns=[('id', "Carrier ID"), ('description', "Carrier Name"),
        ('route', "Route"), ('instructions', "Instructions"),
        ('cod', "COD Charges", 'money')],
    extra={'route': ('route',), 'instructions': ('instructions',),
        'cod': ('cod_charge', 'cod_charges')})
sales_code_report('discount_class_list', "Discount Class List",
    'DiscountClassList.rpt', "Discount Class",
    ['nline.discount_class', 'nline.js.discount_class'],
    columns=CODE_COLUMNS + [('percent', "Percent", 'pct')],
    extra={'percent': ('percent', 'discount_percent', 'rate')})
sales_code_report('sales_rep_list', "Sales Rep List", 'Salesreplist.rpt',
    "Sales Rep", ['nline.sales_rep', 'nline.js.sales_rep'],
    columns=[('id', "Sales Rep ID"), ('description', "Name")])
sales_code_report('service_charge_list', "Service Charge List",
    'ServiceChargeList.rpt', "Service Charge",
    ['nline.service_charge', 'nline.js.service_charge'],
    columns=CODE_COLUMNS + [('amount', "Amount", 'money')],
    extra={'amount': ('amount', 'unit_price')})
sales_code_report('sic_code_list', "Standard Industry Code List",
    'Standardindustrycodelist.rpt', "SIC Code",
    ['nline.sic_code', 'nline.js.sic_code'])
sales_code_report('territory_list', "Territory List", 'TerritoryList.rpt',
    "Territory", ['nline.territory', 'nline.js.territory'])


def tax_rows(kind):
    "The taxes of Tryton as Jobshop's tax groups"
    Tax = Pool().get('account.tax')
    rows = []
    with Transaction().set_context(active_test=False):
        taxes = Tax.search([('company', '=', _company()),
                ('parent', '=', None)])
    for tax in taxes:
        account = tax.invoice_account
        rows.append({
                'date': tax.start_date,
                'description': tax.description or tax.name,
                'tax': tax.name,
                'account': account.code if account else '',
                'percent': float(tax.rate * 100) if tax.type == 'percentage'
                and tax.rate is not None else None,
                'amount': tax.amount if tax.type == 'fixed' else None,
                })
    return rows


TAX_COLUMNS = [('date', "Effective Date", 'date'),
    ('description', "Description"), ('tax', "Tax Name"),
    ('account', "Account ID"), ('percent', "Percent", 'pct')]


@report('sales_tax_group_list', "Sales Tax Group List", 'sales',
    'Salestaxgrouplist.rpt', ['account.tax'],
    [('group', "Tax Group ID")] + TAX_COLUMNS,
    filters=[f_range('tax', "Tax Name")], sort='tax', totals=[],
    advanced=True)
def sales_tax_group_list(desk, p):
    Group = first_model('nline.sales_tax_group')
    if Group is None:
        return tax_rows('sale')
    # Jobshop's sales tax groups (nline_js_sales)
    rows = []
    with Transaction().set_context(active_test=False):
        groups = Group.search([])
    for group in groups:
        for line in group.lines:
            rows.append({
                    'group': group.code,
                    'date': line.effective_date,
                    'description': line.description or group.description
                    or '',
                    'tax': line.tax_name or name(line.tax),
                    'account': line.account.code if line.account else '',
                    'percent': float(line.percent)
                    if line.percent is not None else None,
                    })
    return rows
