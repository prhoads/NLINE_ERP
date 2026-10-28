# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The services behind the Jobshop Purchasing screens (js/jobshop/
purchasing.js): Suppliers (part and service prices, purchase orders),
Request For Quotes, Purchase Orders, Receiving, Tax Groups, Services.

Every call checks the user's Tryton rights first; the documents are
Tryton's (purchases, supplier shipments and returns, product suppliers,
taxes)."""
import datetime as dt
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.modules.product import price_digits
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .purchase import SHIP_TO_FIELDS
from .rfq import SLOTS

PRICE_QUANTUM = Decimal(1) / 10 ** price_digits[1]

READS = ['js_supplier_purchases', 'js_supplier_prices', 'js_supplier_price',
    'js_po_get', 'js_receiving_activity', 'js_receiver_new',
    'js_receiver_get', 'js_tax_group_get', 'js_rfq_get',
    'js_service_defaults', 'js_supplier_defaults']
WRITES = ['js_supplier_price_save', 'js_supplier_price_delete',
    'js_po_save', 'js_po_status', 'js_po_delete', 'js_po_printed',
    'js_receiver_receive', 'js_receiver_save', 'js_receiver_return',
    'js_receiver_cancel', 'js_tax_group_save', 'js_tax_group_delete',
    'js_rfq_save', 'js_rfq_delete', 'js_rfq_create_po', 'js_rfq_printed']


def _date(value):
    if isinstance(value, str):
        return dt.date.fromisoformat(value[:10]) if value else None
    if isinstance(value, dt.datetime):
        return value.date()
    return value


def _dec(value, default=None):
    if value is None or value == '':
        return default
    return Decimal(str(value))


def _float(value, default=0.0):
    if value is None or value == '':
        return default
    return float(value)


def _m2o(record):
    if not record:
        return None
    return {'id': record.id, 'rec_name': record.rec_name}


def _id(value):
    "The id of a many2one value from the screen: an id or {id, rec_name}"
    if isinstance(value, dict):
        value = value.get('id')
    return int(value) if value else None


def effective_price(price, discount, fixed, quantity):
    """The unit price Tryton keeps for a Jobshop line: the quoted price less
    the trade discount plus the fixed charge spread on the quantity"""
    price = price or Decimal(0)
    cost = price * (1 - (discount or Decimal(0)) / 100)
    if fixed and quantity:
        cost += fixed / Decimal(str(quantity))
    return cost.quantize(PRICE_QUANTUM)


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
    def _js_user_name(cls):
        "Jobshop's user name of the one who does it (Received By)"
        user = Pool().get('res.user')(Transaction().user)
        return user.login.upper() if user.login else user.name

    # ---- Suppliers ---------------------------------------------------------

    @classmethod
    def js_supplier_defaults(cls, party):
        """What a new purchase order or RFQ takes from the supplier
        (Jobshop fills them when the supplier is chosen)"""
        cls._check_read('party.party')
        party = Pool().get('party.party')(party)
        address = party.addresses[0] if party.addresses else None
        return {
            'id': party.id,
            'code': party.code or '',
            'name': party.name,
            'payment_term': _m2o(party.supplier_payment_term),
            'fob_point': _m2o(party.supplier_fob_point),
            'ship_via': _m2o(party.supplier_ship_via),
            'tax_group': _m2o(party.supplier_tax_group),
            'tax_exempt': bool(party.supplier_tax_exempt),
            'buyer': party.supplier_buyer or '',
            'freight_terms': party.supplier_freight_terms,
            'specifications': party.supplier_specifications or '',
            'rfq_instructions': party.supplier_rfq_instructions or '',
            'po_instructions': party.supplier_po_instructions or '',
            'address': cls._js_address(address, party),
            'inactive': bool(party.supplier_inactive),
            }

    @classmethod
    def _js_address(cls, address, party=None):
        "An address as Jobshop's Purchase From / Receive From fields"
        if not address:
            return {'id': None, 'name': party.name if party else ''}
        lines = (address.street or '').splitlines()
        contact = {}
        if party:
            for mechanism in party.contact_mechanisms:
                contact.setdefault(mechanism.type, mechanism.value)
        return {
            'id': address.id,
            'rec_name': address.rec_name,
            'name': address.party_name or (party.name if party else ''),
            'address_1': lines[0] if lines else '',
            'address_2': lines[1] if len(lines) > 1 else '',
            'etc': '\n'.join(lines[2:]),
            'city': address.city or '',
            'state': (address.subdivision.code.split('-')[-1]
                if address.subdivision else ''),
            'postal_code': address.postal_code or '',
            'country': address.country.name if address.country else '',
            'contact': (address.site_contact_name
                or (party.supplier_contact if party else '') or ''),
            'title': (address.site_contact_title
                or (party.supplier_contact_title if party else '') or ''),
            'phone': address.site_contact_phone or contact.get('phone', ''),
            'fax': address.site_contact_fax or contact.get('fax', ''),
            'email': address.site_contact_email or contact.get('email', ''),
            }

    @classmethod
    def js_supplier_purchases(cls, party, statuses=None):
        """The supplier's purchase orders (Suppliers > Purchase Orders tab):
        the released ones unless other statuses are asked"""
        cls._check_read('purchase.purchase')
        Purchase = Pool().get('purchase.purchase')
        statuses = statuses or ['released']
        purchases = Purchase.search([
                ('party', '=', party),
                ('jobshop_status', 'in', statuses),
                ], order=[('purchase_date', 'DESC'), ('id', 'DESC')],
            limit=500)
        return [{
                'id': p.id,
                'number': p.number or '',
                'status': p.jobshop_status,
                'purchase_date': p.purchase_date,
                'delivery_date': p.delivery_date,
                'promise_date': p.promise_date,
                'total_amount': p.total_amount,
                'received_amount': p.received_amount,
                'last_received_date': p.last_received_date,
                } for p in purchases]

    @classmethod
    def _price_row(cls, product_supplier):
        ps = product_supplier
        product = ps.product or (ps.template.products[0]
            if ps.template.products else None)
        prices = sorted(ps.prices, key=lambda p: p.quantity)
        if ps.price_type == 'upto':
            # The open row (any quantity above) last, as Jobshop shows it
            prices = ([p for p in prices if p.quantity]
                + [p for p in prices if not p.quantity])
        return {
            'id': ps.id,
            'product': _m2o(product),
            'description': ps.template.name,
            'service_part': _m2o(ps.service_part),
            'code': ps.code or '',
            'unit': ps.unit.rec_name if ps.unit else '',
            'mfg_name': ps.mfg_name or '',
            'mfg_part_id': ps.mfg_part_id or '',
            'price_type': ps.price_type,
            'as_of_date': ps.as_of_date,
            'expiration_date': ps.expiration_date,
            'quote_date': ps.quote_date,
            'lead_time': ps.lead_time.days if ps.lead_time else None,
            'minimum_quantity': ps.minimum_quantity,
            'multiple_quantity': ps.multiple_quantity,
            'prices': [{'quantity': p.quantity, 'unit_price': p.unit_price}
                for p in prices],
            }

    @classmethod
    def js_supplier_prices(cls, party, kind='part'):
        """The supplier's quoted prices: kind 'part' (Part Prices tab) or
        'service' (Service Prices tab)"""
        cls._check_read('purchase.product_supplier')
        ProductSupplier = Pool().get('purchase.product_supplier')
        records = ProductSupplier.search([
                ('party', '=', party),
                ('template.type', '=' if kind == 'service' else '!=',
                    'service'),
                ], order=[('template.code', 'ASC'), ('id', 'ASC')])
        return [cls._price_row(r) for r in records]

    @classmethod
    def js_supplier_price_save(cls, values):
        """Create or change a supplier's quote of a part or a service
        values: id, party, product, service_part, code, mfg_name,
        mfg_part_id, price_type, as_of_date, expiration_date, quote_date,
        lead_time (days), minimum_quantity, multiple_quantity, prices
        [{quantity, unit_price}]"""
        pool = Pool()
        ProductSupplier = pool.get('purchase.product_supplier')
        Price = pool.get('purchase.product_supplier.price')
        Product = pool.get('product.product')
        if values.get('id'):
            cls._check_write('purchase.product_supplier')
            record = ProductSupplier(values['id'])
        else:
            cls._check_create('purchase.product_supplier')
            product = Product(_id(values['product']))
            record = ProductSupplier(
                party=_id(values['party']), template=product.template,
                product=product)
        record.code = values.get('code') or None
        record.mfg_name = values.get('mfg_name') or None
        record.mfg_part_id = values.get('mfg_part_id') or None
        record.price_type = values.get('price_type') or 'break'
        record.as_of_date = _date(values.get('as_of_date'))
        record.expiration_date = _date(values.get('expiration_date'))
        record.quote_date = _date(values.get('quote_date'))
        lead = values.get('lead_time')
        record.lead_time = (dt.timedelta(days=int(lead))
            if lead not in (None, '') else None)
        record.minimum_quantity = _float(values.get('minimum_quantity'), None)
        record.multiple_quantity = _float(
            values.get('multiple_quantity'), None)
        record.service_part = _id(values.get('service_part'))
        record.save()
        Price.delete(list(record.prices))
        rows = [r for r in values.get('prices', [])
            if r.get('unit_price') not in (None, '')]
        rows = [{'quantity': _float(r.get('quantity')),
                'unit_price': _dec(r['unit_price'])} for r in rows]
        # Tryton takes the last matching row: a break table goes up, an
        # up-to table down (the open row first)
        rows.sort(key=lambda r: r['quantity'],
            reverse=record.price_type == 'upto')
        if record.price_type == 'upto':
            rows.sort(key=lambda r: bool(r['quantity']))
        Price.create([dict(r, product_supplier=record.id, sequence=i)
                for i, r in enumerate(rows, 1)])
        return cls._price_row(ProductSupplier(record.id))

    @classmethod
    def js_supplier_price_delete(cls, ids):
        ProductSupplier = Pool().get('purchase.product_supplier')
        cls._check_write('purchase.product_supplier')
        ModelAccess = Pool().get('ir.model.access')
        ModelAccess.check('purchase.product_supplier', 'delete')
        ProductSupplier.delete(ProductSupplier.browse(ids))
        return True

    @classmethod
    def js_supplier_price(cls, party, product, quantity=1, date=None):
        """The quoted price and supplier's ids of a part or service for an
        order line (Jobshop fills them from the supplier's prices)"""
        cls._check_read('product.product')
        pool = Pool()
        Product = pool.get('product.product')
        product = Product(product)
        quantity = _float(quantity, 1.0) or 1.0
        result = {
            'product': _m2o(product),
            'description': product.name,
            'line_type': 'service' if product.type == 'service' else 'part',
            'unit': _m2o(product.purchase_uom or product.default_uom),
            'unit_price': None,
            'code': '',
            'mfg_name': '',
            'mfg_part_id': '',
            'lead_time': None,
            'minimum_quantity': None,
            'multiple_quantity': None,
            'drawing': getattr(product, 'drawing_number', None) or '',
            'drawing_revision': getattr(product, 'drawing_revision', None)
            or '',
            }
        if not party:
            return result
        with Transaction().set_context(purchase_date=_date(date)):
            found = [ps for ps in product.product_suppliers_used(
                    party=int(party))]
        if found:
            ps = found[0]
            result.update({
                    'unit_price': ps.jobshop_price(quantity),
                    'code': ps.code or '',
                    'mfg_name': ps.mfg_name or '',
                    'mfg_part_id': ps.mfg_part_id or '',
                    'lead_time': ps.lead_time.days if ps.lead_time else None,
                    'minimum_quantity': ps.minimum_quantity,
                    'multiple_quantity': ps.multiple_quantity,
                    })
        return result

    # ---- Purchase orders -------------------------------------------------

    @classmethod
    def _po_statuses(cls, purchase):
        "The statuses the order may be changed to (Change Status menu)"
        state = purchase.state
        if state == 'draft':
            result = ['firm', 'released', 'cancelled']
            result.append('unreleased' if purchase.hold else 'hold')
        elif state == 'quotation':
            result = ['unreleased', 'released', 'cancelled']
            if not purchase.hold:
                result.append('hold')
        elif state == 'cancelled':
            result = ['unreleased']
        elif state in {'confirmed', 'processing'}:
            result = ['closed'] if purchase.jobshop_status == 'released' \
                else []
        else:
            result = []
        return result

    @classmethod
    def _po_taxes(cls, purchase):
        "The Taxes tab: each tax of the order with its amount"
        pool = Pool()
        Tax = pool.get('account.tax')
        result = {}
        for line in purchase.lines:
            if line.type != 'line' or not line.taxes:
                continue
            with Transaction().set_context(**purchase._get_tax_context()):
                computed = Tax.compute(Tax.browse(line.taxes),
                    line.unit_price or Decimal(0), line.quantity or 0,
                    purchase.tax_date if hasattr(purchase, 'tax_date')
                    else purchase.purchase_date)
            for value in computed:
                tax = value['tax']
                key = tax.id
                group = tax.parent or tax
                if key not in result:
                    result[key] = {
                        'tax_group': group.name,
                        'name': tax.name,
                        'description': tax.description,
                        'account': (tax.invoice_account.rec_name
                            if tax.invoice_account else ''),
                        'percent': (tax.rate * 100 if tax.rate is not None
                            else None),
                        'amount': Decimal(0),
                        }
                result[key]['amount'] += value['amount']
        for row in result.values():
            row['amount'] = purchase.currency.round(row['amount'])
        return list(result.values())

    @classmethod
    def _po_receivers(cls, purchase):
        "The Receivers tab: the receipts and returns of the order"
        pool = Pool()
        Return = pool.get('stock.shipment.in.return')
        rows = []
        for shipment in purchase.shipments:
            rows.append(cls._receiver_summary(shipment, 'receipt'))
        for shipment in Return.search([('purchase', '=', purchase.id)]):
            rows.append(cls._receiver_summary(shipment, 'return'))
        rows.sort(key=lambda r: (r['date'] or dt.date.min, r['id']))
        return rows

    @classmethod
    def _receiver_summary(cls, shipment, kind):
        moves = (shipment.incoming_moves if kind == 'receipt'
            else shipment.moves)
        amount = sum((m.receiver_amount() for m in moves), Decimal(0))
        return {
            'id': shipment.id,
            'kind': kind,
            'number': shipment.number or str(shipment.id),
            'status': shipment.receiver_status,
            'state': shipment.state,
            'date': shipment.effective_date or shipment.planned_date,
            'amount': amount,
            'supplier_invoice': shipment.supplier_invoice or '',
            'invoiced_date': shipment.invoiced_date,
            }

    @classmethod
    def js_po_get(cls, purchase):
        "Return a purchase order as the Jobshop Purchase Order window shows it"
        cls._check_read('purchase.purchase')
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        data = cls.purchase_order_get(purchase)
        purchase = Purchase(purchase)
        party = purchase.party
        data.update({
                'jobshop_status': purchase.jobshop_status,
                'hold': bool(purchase.hold),
                'party_code': party.code or '',
                'party_name': party.name,
                'delivery_date': purchase.delivery_date,
                'buyer': purchase.buyer or '',
                'fob_point': _m2o(purchase.fob_point),
                'ship_via': _m2o(purchase.ship_via),
                'tax_group': _m2o(purchase.tax_group),
                'freight_terms': purchase.freight_terms,
                'payable_account': _m2o(purchase.payable_account),
                'promise_date': purchase.promise_date,
                'printed_date': purchase.printed_date,
                'last_received_date': purchase.last_received_date,
                'received_amount': purchase.received_amount,
                'specifications': purchase.specifications or '',
                'rfq': _m2o(purchase.rfq),
                'invoice_address': _m2o(purchase.invoice_address),
                'purchase_from': cls._js_address(
                    purchase.invoice_address, party),
                'statuses': cls._po_statuses(purchase),
                'lines_editable': purchase.state == 'draft',
                'editable': purchase.state not in {'done', 'cancelled'},
                'deletable': purchase.state in {
                    'draft', 'quotation', 'cancelled'},
                'taxes': cls._po_taxes(purchase),
                'receivers': cls._po_receivers(purchase),
                })
        for name in SHIP_TO_FIELDS:
            data[name] = getattr(purchase, name) or ''
        lines = {l.id: l for l in purchase.lines}
        try:
            # The material cards Material Planning links (nline_js_planning)
            PlanningLink = pool.get('nline.js.purchase_link')
        except KeyError:
            PlanningLink = None
        for row in data['lines']:
            line = lines[row['id']]
            row.update({
                    'sequence': line.sequence,
                    'line_type': line.line_type,
                    'product': _m2o(line.product),
                    'unit': _m2o(line.unit),
                    'list_unit_price': (line.list_unit_price
                        if line.list_unit_price is not None
                        else line.unit_price),
                    'trade_discount': line.trade_discount,
                    'fixed_charge': line.fixed_charge,
                    'supplier_part_code': line.supplier_part_code or '',
                    'mfg_name': line.mfg_name or '',
                    'mfg_part_id': line.mfg_part_id or '',
                    'product_code': _m2o(line.product_code),
                    'commodity_code': _m2o(line.commodity_code),
                    'receive_date': line.delivery_date_store,
                    'promise_date': line.promise_date,
                    'last_received_date': line.last_received_date,
                    'received': line.received_quantity,
                    'tax_group': _m2o(line.tax_group),
                    'expense_account': _m2o(line.expense_account),
                    'line_status': line.line_status,
                    'line_closed': bool(line.line_closed),
                    'specifications': line.specifications or '',
                    'rfq_line': _m2o(line.rfq_line),
                    'planning_links': [{
                            'production': _m2o(k.production),
                            'card': k.card.rec_name if k.card else '',
                            'quantity': k.quantity,
                            } for k in (PlanningLink.search([
                                        ('purchase_line', '=', line.id)])
                            if PlanningLink else [])],
                    'js_links': [{
                            'id': k.id,
                            'production': _m2o(k.production),
                            'operation': k.operation,
                            'piece': k.piece,
                            'work': _m2o(k.work),
                            'quantity': k.quantity,
                            'received_quantity': k.received_quantity,
                            'reference': k.reference or '',
                            } for k in line.links],
                    })
        return data

    @classmethod
    def _po_line_values(cls, data, purchase):
        "The Jobshop fields of a purchase line from the screen"
        values = {
            'list_unit_price': _dec(data.get('unit_price')),
            'trade_discount': _dec(data.get('trade_discount')),
            'fixed_charge': _dec(data.get('fixed_charge')),
            'supplier_part_code': data.get('supplier_part_code') or None,
            'mfg_name': data.get('mfg_name') or None,
            'mfg_part_id': data.get('mfg_part_id') or None,
            'product_code': _id(data.get('product_code')),
            'commodity_code': _id(data.get('commodity_code')),
            'promise_date': _date(data.get('promise_date')),
            'tax_group': _id(data.get('tax_group')),
            'expense_account': _id(data.get('expense_account')),
            'specifications': data.get('specifications') or None,
            }
        if 'rfq_line' in data:
            values['rfq_line'] = _id(data.get('rfq_line'))
        return values

    @classmethod
    def _po_line_taxes(cls, purchase, line):
        "The taxes of a line: its tax group, else the order's"
        group = line.tax_group or purchase.tax_group
        if purchase.party.supplier_tax_exempt:
            return []
        if group:
            return [group.id]
        return None

    @classmethod
    def _save_links(cls, Link, owner_field, owner, rows):
        "Replace the links of a purchase or RFQ line with the screen's"
        kept = []
        for row in rows or []:
            values = {
                owner_field: owner.id,
                'production': _id(row.get('production')),
                'operation': (int(row['operation'])
                    if row.get('operation') not in (None, '') else None),
                'piece': (int(row['piece'])
                    if row.get('piece') not in (None, '') else None),
                'work': _id(row.get('work')),
                'quantity': _float(row.get('quantity'), None),
                'reference': row.get('reference') or None,
                }
            if row.get('id'):
                link = Link(row['id'])
                values.pop(owner_field)
                Link.write([link], values)
                kept.append(link.id)
            else:
                kept.append(Link.create([values])[0].id)
        old = Link.search([(owner_field, '=', owner.id),
                ('id', 'not in', kept)])
        if old:
            Link.delete(old)

    @classmethod
    def js_po_save(cls, values):
        """Create or change a purchase order from the Jobshop window
        values: id, number, party, purchase_date, delivery_date, reference,
        description, payment_term, buyer, fob_point, ship_via, tax_group,
        freight_terms, payable_account, promise_date, specifications,
        invoice_address, ship_to_*, lines [{id, product, description,
        quantity, unit_price, trade_discount, fixed_charge,
        supplier_part_code, mfg_name, mfg_part_id, product_code,
        commodity_code, receive_date, promise_date, tax_group,
        expense_account, line_closed, specifications, links}]
        The lines change only on an unreleased order (Tryton keeps a
        released order's lines); the header's Jobshop fields always."""
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        Line = pool.get('purchase.line')
        Link = pool.get('nline.purchase.link')
        purchase = Purchase(values['id']) if values.get('id') else None
        lines_in = values.get('lines') or []
        if purchase is None or purchase.state == 'draft':
            core = {
                'id': purchase.id if purchase else None,
                'party': _id(values['party']),
                'purchase_date': _date(values.get('purchase_date')),
                'reference': values.get('reference') or None,
                'description': values.get('description') or None,
                'payment_term': _id(values.get('payment_term')),
                'lines': [{
                        'id': l.get('id'),
                        'product': _id(l.get('product')),
                        'description': l.get('description') or None,
                        'quantity': _float(l.get('quantity'), 1.0) or 1.0,
                        'unit_price': (str(effective_price(
                                    _dec(l.get('unit_price')),
                                    _dec(l.get('trade_discount')),
                                    _dec(l.get('fixed_charge')),
                                    _float(l.get('quantity'), 1.0)))
                            if l.get('unit_price') not in (None, '')
                            else None),
                        } for l in lines_in],
                }
            data = cls.purchase_order_save(core)
            purchase = Purchase(data['id'])
            line_ids = [l['id'] for l in data['lines']]
        else:
            cls._check_write('purchase.purchase')
            if purchase.state in {'done', 'cancelled'}:
                raise ValidationError(gettext(
                        'nline_js_purchasing.msg_po_not_editable',
                        purchase=purchase.rec_name))
            line_ids = [l.get('id') for l in lines_in]
        header = {
            'buyer': values.get('buyer') or None,
            'fob_point': _id(values.get('fob_point')),
            'ship_via': _id(values.get('ship_via')),
            'tax_group': _id(values.get('tax_group')),
            'freight_terms': values.get('freight_terms') or None,
            'payable_account': _id(values.get('payable_account')),
            'promise_date': _date(values.get('promise_date')),
            'specifications': values.get('specifications') or None,
            }
        for name in SHIP_TO_FIELDS:
            if name in values:
                header[name] = values.get(name) or None
        if purchase.state == 'draft':
            header['delivery_date'] = _date(values.get('delivery_date'))
            if 'invoice_address' in values:
                header['invoice_address'] = _id(values.get('invoice_address'))
        if 'rfq' in values and not purchase.rfq:
            header['rfq'] = _id(values.get('rfq'))
        number = (values.get('number') or '').strip()
        if number and number != (purchase.number or ''):
            # Jobshop: an Order ID typed by the user
            if Purchase.search([('number', '=', number),
                        ('id', '!=', purchase.id)]):
                raise ValidationError(gettext(
                        'nline_js_purchasing.msg_po_number_used',
                        number=number))
            header['number'] = number
        Purchase.write([purchase], header)
        purchase = Purchase(purchase.id)
        draft = purchase.state == 'draft'
        to_ignore = []
        for data, line_id in zip(lines_in, line_ids):
            if not line_id:
                continue
            line = Line(line_id)
            if line.purchase != purchase:
                continue
            line_values = cls._po_line_values(data, purchase)
            line_values['line_closed'] = bool(data.get('line_closed'))
            if draft:
                receive = _date(data.get('receive_date'))
                line_values['delivery_date_edit'] = bool(receive)
                line_values['delivery_date_store'] = receive
            else:
                # The quoted price stays as ordered on a released order
                for name in ['list_unit_price', 'trade_discount',
                        'fixed_charge', 'tax_group']:
                    line_values.pop(name, None)
            Line.write([line], line_values)
            line = Line(line_id)
            if draft:
                taxes = cls._po_line_taxes(purchase, line)
                if taxes is not None:
                    Line.write([line], {'taxes': [('remove',
                                    [t.id for t in line.taxes]),
                                ('add', taxes)]})
            elif line.line_closed:
                # Closed by hand: the rest is not expected any more
                to_ignore += [m for m in line.moves
                    if m.state == 'draft' and not m.shipment]
            if 'links' in data:
                cls._save_links(Link, 'purchase_line', line, data['links'])
        if to_ignore:
            cls._ignore_moves(to_ignore)
        Purchase.nline_check_limit([Purchase(purchase.id)])
        return cls.js_po_get(purchase.id)

    @classmethod
    def _ignore_moves(cls, moves):
        "Stop expecting the moves of released lines (Jobshop's close)"
        pool = Pool()
        Move = pool.get('stock.move')
        Line = pool.get('purchase.line')
        Purchase = pool.get('purchase.purchase')
        Move.cancel(moves)
        lines = {}
        for move in moves:
            lines.setdefault(move.origin, []).append(move.id)
        for line, ids in lines.items():
            Line.write([line], {'moves_ignored': [('add', ids)]})
        Purchase.process(list({l.purchase for l in lines}))

    @classmethod
    def js_po_status(cls, purchase, status):
        """Change the Jobshop status of a purchase order (Change Status)"""
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        cls._check_write('purchase.purchase')
        purchase = Purchase(purchase)
        if status not in cls._po_statuses(purchase):
            raise ValidationError(gettext(
                    'nline_js_purchasing.msg_po_status',
                    purchase=purchase.rec_name, status=status))
        state = purchase.state
        if status == 'hold':
            Purchase.write([purchase], {'hold': True})
        elif status == 'unreleased':
            Purchase.write([purchase], {'hold': False})
            if state in {'quotation', 'cancelled'}:
                Purchase.draft([purchase])
        elif status == 'firm':
            Purchase.write([purchase], {'hold': False})
            Purchase.quote([purchase])
        elif status == 'released':
            Purchase.write([purchase], {'hold': False})
            if state == 'draft':
                Purchase.quote([purchase])
            Purchase.confirm([Purchase(purchase.id)])
        elif status == 'cancelled':
            Purchase.cancel([purchase])
        elif status == 'closed':
            moves = [m for l in purchase.lines for m in l.moves
                if m.state == 'draft' and not m.shipment]
            if moves:
                cls._ignore_moves(moves)
        return cls.js_po_get(purchase.id)

    @classmethod
    def js_po_delete(cls, purchase):
        """Delete a purchase order not released yet (Edit > Delete
        Document)"""
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        ModelAccess = pool.get('ir.model.access')
        ModelAccess.check('purchase.purchase', 'delete')
        purchase = Purchase(purchase)
        if purchase.state not in {'draft', 'quotation', 'cancelled'}:
            raise ValidationError(gettext(
                    'nline_js_purchasing.msg_po_delete',
                    purchase=purchase.rec_name))
        if purchase.state != 'cancelled':
            Purchase.cancel([purchase])
        Purchase.delete([Purchase(purchase.id)])
        return True

    @classmethod
    def js_po_printed(cls, purchase):
        "Stamp the Printed Date of a purchase order"
        Purchase = Pool().get('purchase.purchase')
        cls._check_read('purchase.purchase')
        with Transaction().set_context(_check_access=False):
            Purchase.write([Purchase(purchase)],
                {'printed_date': dt.datetime.now()})
        return True

    # ---- Receiving -------------------------------------------------------

    @classmethod
    def _open_moves(cls, purchase):
        "The moves of a purchase still to receive"
        return [m for l in purchase.lines if l.type == 'line'
            for m in l.moves if m.state == 'draft' and not m.shipment
            and m.from_location.type == 'supplier']

    @classmethod
    def js_receiving_activity(cls, view='unreceived', supplier=None):
        """The Receiving Activity tab: the released orders still to receive
        (unreceived) or the receivers of the last year (received)"""
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        Shipment = pool.get('stock.shipment.in')
        Return = pool.get('stock.shipment.in.return')
        Date = pool.get('ir.date')
        cls._check_read('purchase.purchase', 'stock.shipment.in')
        today = Date.today()
        rows = []
        if view == 'unreceived':
            domain = [('state', 'in', ['confirmed', 'processing'])]
            if supplier:
                domain.append(('party', '=', supplier))
            for purchase in Purchase.search(domain):
                moves = cls._open_moves(purchase)
                if not moves:
                    continue
                dates = [m.planned_date for m in moves if m.planned_date]
                desired = min(dates) if dates else purchase.delivery_date
                if not desired:
                    message = ''
                elif desired < today:
                    message = 'Late %s days' % (today - desired).days
                elif desired == today:
                    message = 'Due today'
                else:
                    message = 'Due in %s days' % (desired - today).days
                rows.append({
                        'purchase': purchase.id,
                        'number': purchase.number or str(purchase.id),
                        'desired_date': desired,
                        'supplier': purchase.party.id,
                        'supplier_code': purchase.party.code or '',
                        'supplier_name': purchase.party.name,
                        'message': message,
                        'late': bool(desired and desired < today),
                        'lines': len(moves),
                        })
            rows.sort(key=lambda r: (r['desired_date'] or dt.date.max,
                    r['number']))
            return rows
        since = today - dt.timedelta(days=365)
        domain = [('effective_date', '>=', since), ('state', '=', 'done')]
        if supplier:
            domain.append(('supplier', '=', supplier))
        for kind, Model in [('receipt', Shipment), ('return', Return)]:
            for shipment in Model.search(domain,
                    order=[('effective_date', 'DESC'), ('id', 'DESC')],
                    limit=500):
                purchase = shipment.purchase
                if not purchase and kind == 'receipt':
                    purchases = {m.origin.purchase
                        for m in shipment.incoming_moves
                        if m.origin and hasattr(m.origin, 'purchase')}
                    purchase = purchases.pop() if len(purchases) == 1 \
                        else None
                rows.append({
                        'kind': kind,
                        'receiver': shipment.id,
                        'receiver_number': shipment.number or '',
                        'purchase': purchase.id if purchase else None,
                        'number': purchase.number if purchase else '',
                        'supplier': shipment.supplier.id,
                        'supplier_code': shipment.supplier.code or '',
                        'supplier_name': shipment.supplier.name,
                        'order_date': (purchase.purchase_date
                            if purchase else None),
                        'status': (purchase.jobshop_status
                            if purchase else ''),
                        'receiver_status': shipment.receiver_status,
                        'last_received_date': (purchase.last_received_date
                            if purchase else None),
                        'date': shipment.effective_date,
                        })
        rows.sort(key=lambda r: (r['date'] or dt.date.min, r['receiver']),
            reverse=True)
        return rows

    @classmethod
    def _receiver_head(cls, purchase):
        party = purchase.party
        return {
            'purchase': purchase.id,
            'purchase_number': purchase.number or str(purchase.id),
            'supplier': _m2o(party),
            'supplier_code': party.code or '',
            'order_date': purchase.purchase_date,
            'receive_from': cls._js_address(purchase.invoice_address, party),
            'buyer': purchase.buyer or '',
            'fob_point': _m2o(purchase.fob_point),
            'ship_via': _m2o(purchase.ship_via),
            'tax_group': _m2o(purchase.tax_group),
            'payment_term': _m2o(purchase.payment_term),
            'payable_account': _m2o(purchase.payable_account),
            }

    @classmethod
    def _stock_quantity(cls, move):
        pool = Pool()
        Uom = pool.get('product.uom')
        return Uom.compute_qty(move.unit, move.quantity,
            move.product.default_uom)

    @classmethod
    def js_receiver_new(cls, purchase):
        """A new receiver of a released order (double-click in Receiving
        Activity): the open lines to the full quantity, nothing saved"""
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        cls._check_read('purchase.purchase')
        purchase = Purchase(purchase)
        Date = pool.get('ir.date')
        data = cls._receiver_head(purchase)
        data.update({
                'id': None,
                'kind': 'receipt',
                'number': '',
                'received_date': Date.today(),
                'receiver_status': 'approved',
                'reference': '',
                'supplier_invoice': '',
                'invoiced_date': None,
                'payment_due_date': None,
                'receiver_exported': False,
                'specifications': purchase.specifications or '',
                'transacted': False,
                'storage': _m2o(purchase.warehouse.storage_location
                    if purchase.warehouse else None),
                })
        lines = []
        for index, move in enumerate(cls._open_moves(purchase), 1):
            line = move.origin
            received_before = any(m.state == 'done' for m in line.moves)
            lines.append({
                    'move': move.id,
                    'line_no': index,
                    'po_line_no': line.sequence,
                    'product': _m2o(move.product),
                    'line_type': line.line_type,
                    'description': line.description or move.product.name,
                    'quantity': move.quantity,
                    'stock_quantity': cls._stock_quantity(move),
                    'stock_unit': move.product.default_uom.rec_name,
                    'unit': move.unit.rec_name,
                    'receive_quantity': move.quantity,
                    'unit_price': (line.list_unit_price
                        if line.list_unit_price is not None
                        else line.unit_price),
                    'discount': line.trade_discount,
                    # The PO's fixed charge once, on the first receipt
                    'fixed_charge': (None if received_before
                        else line.fixed_charge),
                    'location': data['storage'],
                    'specifications': line.specifications or '',
                    })
        data['lines'] = lines
        return data

    @classmethod
    def js_receiver_get(cls, kind, shipment):
        "A saved receiver (receipt) or return as the Receivers tab shows it"
        pool = Pool()
        Shipment = pool.get('stock.shipment.in')
        Return = pool.get('stock.shipment.in.return')
        Move = pool.get('stock.move')
        Model = Shipment if kind == 'receipt' else Return
        cls._check_read(Model.__name__)
        shipment = Model(shipment)
        moves = (shipment.incoming_moves if kind == 'receipt'
            else shipment.moves)
        purchase = shipment.purchase
        if not purchase:
            purchases = {m.origin.purchase for m in moves
                if m.origin and hasattr(m.origin, 'purchase')}
            purchase = purchases.pop() if len(purchases) == 1 else None
        data = cls._receiver_head(purchase) if purchase else {
            'purchase': None, 'purchase_number': '',
            'supplier': _m2o(shipment.supplier),
            'supplier_code': shipment.supplier.code or '',
            'receive_from': cls._js_address(None, shipment.supplier)}
        returned = {}
        if kind == 'receipt' and moves:
            for back in Move.search([
                        ('returned_move', 'in', [m.id for m in moves]),
                        ('state', '!=', 'cancelled')]):
                returned[back.returned_move.id] = (
                    returned.get(back.returned_move.id, 0) + back.quantity)
        locations = {}
        if kind == 'receipt':
            for move in shipment.inventory_moves:
                if move.origin and move.origin.__name__ == 'stock.move':
                    locations[move.origin.id] = move.to_location
        lines = []
        for index, move in enumerate(moves, 1):
            line = move.origin if move.origin and \
                move.origin.__name__ == 'purchase.line' else None
            if not line and move.returned_move and move.returned_move.origin:
                line = move.returned_move.origin
            lines.append({
                    'move': move.id,
                    'line_no': index,
                    'po_line_no': line.sequence if line else None,
                    'product': _m2o(move.product),
                    'line_type': ('service' if move.product.type == 'service'
                        else 'part'),
                    'description': ((line.description if line else None)
                        or move.product.name),
                    'quantity': move.quantity,
                    'stock_quantity': cls._stock_quantity(move),
                    'stock_unit': move.product.default_uom.rec_name,
                    'unit': move.unit.rec_name,
                    'receive_quantity': move.quantity,
                    'returned_quantity': returned.get(move.id, 0),
                    'unit_price': (move.receiver_unit_price
                        if move.receiver_unit_price is not None
                        else move.unit_price),
                    'discount': move.receiver_discount,
                    'fixed_charge': move.receiver_fixed_charge,
                    'amount': move.receiver_amount(),
                    'location': _m2o(locations.get(move.id)
                        or (move.to_location if kind == 'receipt'
                            else move.from_location)),
                    'specifications': (line.specifications or '')
                    if line else '',
                    })
        data.update({
                'id': shipment.id,
                'kind': kind,
                'number': shipment.number or str(shipment.id),
                'received_date': (shipment.effective_date
                    or shipment.planned_date),
                'receiver_status': shipment.receiver_status,
                'reference': shipment.reference or '',
                'supplier_invoice': shipment.supplier_invoice or '',
                'invoiced_date': shipment.invoiced_date,
                'payment_due_date': shipment.payment_due_date,
                'receiver_exported': bool(shipment.receiver_exported),
                'receiver_exported_date': shipment.receiver_exported_date,
                'specifications': shipment.specifications or '',
                'received_by': (shipment.received_by.rec_name if getattr(
                        shipment, 'received_by', None) else
                    shipment.receiver_user or ''),
                'transacted': shipment.state == 'done',
                'state': shipment.state,
                'lines': lines,
                'total': sum((l['amount'] for l in lines), Decimal(0)),
                })
        return data

    @classmethod
    def js_receiver_receive(cls, values):
        """Receive a released order (the Receive button): the quantities
        into stock (a supplier shipment done), the rest stays on order
        values: purchase, received_date, reference, receiver_status,
        supplier_invoice, invoiced_date, payment_due_date, specifications,
        lines [{move, receive_quantity, unit_price, discount, fixed_charge,
        location}]"""
        pool = Pool()
        Move = pool.get('stock.move')
        Shipment = pool.get('stock.shipment.in')
        Purchase = pool.get('purchase.purchase')
        Location = pool.get('stock.location')
        cls._check_create('stock.shipment.in')
        purchase = Purchase(values['purchase'])
        open_moves = {m.id: m for m in cls._open_moves(purchase)}
        date = _date(values.get('received_date')) or \
            pool.get('ir.date').today()
        moves, targets = [], {}
        for data in values.get('lines', []):
            move = open_moves.get(int(data['move']))
            quantity = _float(data.get('receive_quantity'))
            if not move or quantity <= 0:
                continue
            quantity = min(quantity, move.quantity)
            move.quantity = quantity
            move.effective_date = date
            move.receiver_unit_price = _dec(data.get('unit_price'),
                move.unit_price)
            move.receiver_discount = _dec(data.get('discount'))
            move.receiver_fixed_charge = _dec(data.get('fixed_charge'))
            move.unit_price = move.receiver_cost()
            moves.append(move)
            if _id(data.get('location')):
                targets[move] = _id(data['location'])
        if not moves:
            raise ValidationError(gettext('nline_desk.msg_nothing_received'))
        Move.save(moves)
        head = dict(
            company=purchase.company,
            supplier=purchase.party,
            warehouse=purchase.warehouse,
            reference=values.get('reference') or None,
            effective_date=date,
            purchase=purchase,
            receiver_status=values.get('receiver_status') or 'approved',
            supplier_invoice=values.get('supplier_invoice') or None,
            invoiced_date=_date(values.get('invoiced_date')),
            payment_due_date=_date(values.get('payment_due_date')),
            specifications=values.get('specifications') or None,
            receiver_user=cls._js_user_name(),
            )
        shipment = Shipment(**head)
        shipment.on_change_warehouse()
        shipment.save()
        Shipment.write([shipment], {
                'incoming_moves': [('add', [m.id for m in moves])],
                })
        with Transaction().set_context(_skip_warnings=True):
            Shipment.receive([shipment])
            shipment = Shipment(shipment.id)
            # Jobshop's Location ID: each line to its own location
            storage = shipment.warehouse_storage
            for move in shipment.inventory_moves:
                origin = move.origin
                target = targets.get(origin) if origin else None
                if target and target != move.to_location.id:
                    location = Location(target)
                    if storage and Location.search([
                                ('id', '=', location.id),
                                ('parent', 'child_of', [storage.id]),
                                ]):
                        move.to_location = location
                        move.save()
            if shipment.state != 'done':
                Shipment.done([shipment])
        # The rest of a partial line back on order
        Purchase.process([purchase])
        return cls.js_receiver_get('receipt', shipment.id)

    @classmethod
    def js_receiver_save(cls, values):
        """Change a processed receiver: its status, the supplier's invoice,
        the specifications and, until it is exported, its prices and fixed
        charges (the receipt's cost follows)
        values: kind, id, receiver_status, supplier_invoice, invoiced_date,
        payment_due_date, receiver_exported, specifications, lines [{move,
        unit_price, discount, fixed_charge}]"""
        pool = Pool()
        Shipment = pool.get('stock.shipment.in')
        Return = pool.get('stock.shipment.in.return')
        Move = pool.get('stock.move')
        kind = values.get('kind') or 'receipt'
        Model = Shipment if kind == 'receipt' else Return
        cls._check_write(Model.__name__)
        shipment = Model(values['id'])
        status = values.get('receiver_status') or shipment.receiver_status
        if status == 'cancelled' and shipment.receiver_status != 'cancelled':
            # Cancelling takes the goods back out (js_receiver_cancel)
            status = shipment.receiver_status
        exported = bool(values.get('receiver_exported'))
        head = {
            'receiver_status': status,
            'supplier_invoice': values.get('supplier_invoice') or None,
            'invoiced_date': _date(values.get('invoiced_date')),
            'payment_due_date': _date(values.get('payment_due_date')),
            'specifications': values.get('specifications') or None,
            'receiver_exported': exported,
            }
        if exported and not shipment.receiver_exported:
            head['receiver_exported_date'] = pool.get('ir.date').today()
        elif not exported:
            head['receiver_exported_date'] = None
        if not shipment.receiver_exported:
            moves = {m.id: m for m in (shipment.incoming_moves
                    if kind == 'receipt' else shipment.moves)}
            changed = []
            for data in values.get('lines', []):
                move = moves.get(int(data['move']))
                if not move:
                    continue
                move.receiver_unit_price = _dec(data.get('unit_price'),
                    move.receiver_unit_price)
                move.receiver_discount = _dec(data.get('discount'))
                move.receiver_fixed_charge = _dec(data.get('fixed_charge'))
                cost = move.receiver_cost()
                if cost != move.unit_price:
                    move.unit_price = cost
                changed.append(move)
            if changed:
                with Transaction().set_context(_check_access=False):
                    Move.save(changed)
        Model.write([shipment], head)
        return cls.js_receiver_get(kind, shipment.id)

    @classmethod
    def _return_moves(cls, received, quantities, date, reference, status,
            purchase=None):
        """Give received goods back to the supplier: a supplier return
        shipment done; each return line knows the receipt line it returns"""
        pool = Pool()
        Move = pool.get('stock.move')
        Return = pool.get('stock.shipment.in.return')
        supplier = received[0].from_location
        first = received[0]
        storage = (first.shipment.warehouse_storage
            if first.shipment and getattr(
                first.shipment, 'warehouse_storage', None)
            else first.to_location)
        moves = []
        for move, quantity in zip(received, quantities):
            moves.append(Move(
                    product=move.product,
                    unit=move.unit,
                    quantity=quantity,
                    from_location=storage,
                    to_location=supplier,
                    company=move.company,
                    unit_price=move.unit_price,
                    currency=move.currency,
                    planned_date=date,
                    returned_move=move,
                    receiver_unit_price=move.receiver_unit_price,
                    receiver_discount=move.receiver_discount,
                    ))
        party = first.shipment.supplier if first.shipment else (
            first.origin.purchase.party)
        shipment = Return(
            company=first.company,
            supplier=party,
            from_location=storage,
            to_location=supplier,
            reference=reference or None,
            purchase=purchase,
            receiver_status=status or 'approved',
            receiver_user=cls._js_user_name(),
            moves=moves,
            )
        shipment.save()
        with Transaction().set_context(_skip_warnings=True):
            Return.wait([shipment])
            Return.assign_try([shipment])
            shipment = Return(shipment.id)
            if shipment.state == 'assigned':
                Return.done([shipment])
        return Return(shipment.id)

    @classmethod
    def _returnable(cls, move):
        Move = Pool().get('stock.move')
        back = sum(m.quantity for m in Move.search([
                    ('returned_move', '=', move.id),
                    ('state', '!=', 'cancelled')]))
        return move.quantity - back

    @classmethod
    def js_receiver_return(cls, values):
        """Return parts of a receiver to the supplier (Receiving > View
        Received Orders > Return); the order stays closed
        values: receiver, received_date, reference, receiver_status, lines
        [{move, receive_quantity}]"""
        pool = Pool()
        Shipment = pool.get('stock.shipment.in')
        cls._check_create('stock.shipment.in.return')
        shipment = Shipment(values['receiver'])
        moves = {m.id: m for m in shipment.incoming_moves
            if m.state == 'done'}
        received, quantities = [], []
        for data in values.get('lines', []):
            move = moves.get(int(data['move']))
            quantity = _float(data.get('receive_quantity'))
            if not move or quantity <= 0:
                continue
            if quantity > cls._returnable(move) + 1e-9:
                raise ValidationError(gettext(
                        'nline_js_purchasing.msg_return_quantity',
                        product=move.product.rec_name,
                        quantity=cls._returnable(move)))
            received.append(move)
            quantities.append(quantity)
        if not received:
            raise ValidationError(gettext('nline_desk.msg_nothing_received'))
        purchase = shipment.purchase or (received[0].origin.purchase
            if received[0].origin else None)
        back = cls._return_moves(received, quantities,
            _date(values.get('received_date')), values.get('reference'),
            values.get('receiver_status'), purchase)
        return cls.js_receiver_get('return', back.id)

    @classmethod
    def js_receiver_cancel(cls, receiver):
        """Cancel a processed receiver: what is left of it goes back to the
        supplier and its lines are expected again on the order (Jobshop:
        return, then re-release the order)"""
        pool = Pool()
        Shipment = pool.get('stock.shipment.in')
        Move = pool.get('stock.move')
        Purchase = pool.get('purchase.purchase')
        cls._check_write('stock.shipment.in')
        cls._check_create('stock.shipment.in.return')
        shipment = Shipment(receiver)
        if shipment.receiver_status == 'cancelled':
            return cls.js_receiver_get('receipt', shipment.id)
        received, quantities = [], []
        for move in shipment.incoming_moves:
            if move.state != 'done':
                continue
            left = cls._returnable(move)
            if left > 0:
                received.append(move)
                quantities.append(left)
        purchase = shipment.purchase
        if received:
            cls._return_moves(received, quantities, None,
                shipment.reference, 'cancelled', purchase)
            # Expected again from the supplier
            again = []
            for move, quantity in zip(received, quantities):
                if move.origin and move.origin.__name__ == 'purchase.line':
                    again.append(Move(
                            product=move.product, unit=move.unit,
                            quantity=quantity,
                            from_location=move.from_location,
                            to_location=move.to_location,
                            company=move.company,
                            unit_price=move.origin.unit_price,
                            currency=move.currency,
                            planned_date=move.origin.delivery_date,
                            origin=move.origin,
                            ))
                    purchase = purchase or move.origin.purchase
            if again:
                Move.save(again)
        Shipment.write([shipment], {'receiver_status': 'cancelled'})
        if purchase:
            Purchase.process([purchase])
        return cls.js_receiver_get('receipt', shipment.id)

    # ---- Tax groups ------------------------------------------------------

    @classmethod
    def _tax_group_record(cls):
        TaxGroup = Pool().get('account.tax.group')
        groups = TaxGroup.search([('code', '=', 'JS-PURCHASE')], limit=1)
        if groups:
            return groups[0]
        group, = TaxGroup.create([{'name': "Jobshop Purchasing",
                    'code': 'JS-PURCHASE', 'kind': 'purchase'}])
        return group

    @classmethod
    def js_tax_group_get(cls, tax):
        "A Jobshop purchasing tax group: a Tryton tax with its taxes"
        cls._check_read('account.tax')
        Tax = Pool().get('account.tax')
        tax = Tax(tax)
        children = sorted(tax.childs, key=lambda t: (t.name,
                t.start_date or dt.date.min))
        return {
            'id': tax.id,
            'name': tax.name,
            'description': tax.description,
            'taxes': [{
                    'id': t.id,
                    'name': t.name,
                    'description': t.description,
                    'start_date': t.start_date,
                    'end_date': t.end_date,
                    'account': _m2o(t.invoice_account),
                    'percent': (t.rate * 100).normalize()
                    if t.rate is not None else None,
                    } for t in children],
            }

    @classmethod
    def js_tax_group_save(cls, values):
        """Create or change a purchasing tax group
        values: id, name, description, taxes [{id, name, description,
        start_date, account, percent}]. A tax of the same name with a later
        effective date ends the earlier one the day before."""
        pool = Pool()
        Tax = pool.get('account.tax')
        company = cls._company()
        if values.get('id'):
            cls._check_write('account.tax')
            parent = Tax(values['id'])
            Tax.write([parent], {'name': values['name'],
                    'description': values.get('description')
                    or values['name']})
        else:
            cls._check_create('account.tax')
            parent, = Tax.create([{
                        'name': values['name'],
                        'description': values.get('description')
                        or values['name'],
                        'type': 'none',
                        'group': cls._tax_group_record().id,
                        'company': company.id,
                        }])
        rows = []
        for row in values.get('taxes', []):
            if not row.get('name'):
                continue
            if not _id(row.get('account')):
                raise ValidationError(gettext(
                        'nline_js_purchasing.msg_tax_account',
                        tax=row['name']))
            rows.append(row)
        # The end of each tax: the day before the next of its name
        by_name = {}
        for row in rows:
            by_name.setdefault(row['name'], []).append(row)
        ends = {}
        for name, same in by_name.items():
            same.sort(key=lambda r: _date(r.get('start_date'))
                or dt.date.min)
            for current, following in zip(same, same[1:]):
                start = _date(following.get('start_date'))
                ends[id(current)] = (start - dt.timedelta(days=1)
                    if start else None)
        kept = []
        for i, row in enumerate(rows, 1):
            account = _id(row['account'])
            tax_values = {
                'name': row['name'],
                'description': row.get('description') or row['name'],
                'start_date': _date(row.get('start_date')),
                'end_date': ends.get(id(row)),
                'rate': (_dec(row.get('percent'), Decimal(0))
                    / 100),
                'invoice_account': account,
                'credit_note_account': account,
                'sequence': i,
                }
            if row.get('id'):
                Tax.write([Tax(row['id'])], tax_values)
                kept.append(int(row['id']))
            else:
                tax, = Tax.create([dict(tax_values, type='percentage',
                            parent=parent.id, company=company.id)])
                kept.append(tax.id)
        old = [t for t in Tax(parent.id).childs if t.id not in kept]
        if old:
            Tax.delete(old)
        return cls.js_tax_group_get(parent.id)

    @classmethod
    def js_tax_group_delete(cls, tax):
        pool = Pool()
        Tax = pool.get('account.tax')
        ModelAccess = pool.get('ir.model.access')
        ModelAccess.check('account.tax', 'delete')
        Tax.delete([Tax(tax)])
        return True

    # ---- Services --------------------------------------------------------

    @classmethod
    def js_service_defaults(cls):
        """The values of a new Jobshop service: a purchasable service of
        the "Outside Services" category, code SVC-<id>"""
        pool = Pool()
        Category = pool.get('product.category')
        Uom = pool.get('product.uom')
        cls._check_read('product.template')
        categories = Category.search([('name', '=', "Outside Services")],
            limit=1)
        units = Uom.search([('symbol', '=', 'u')], limit=1)
        return {
            'type': 'service',
            'purchasable': True,
            'account_category': categories[0].id if categories else None,
            'default_uom': units[0].id if units else None,
            'list_price': {'__class__': 'Decimal', 'decimal': '0'},
            'prefix': 'SVC-',
            }

    # ---- Requests for quote ----------------------------------------------

    @classmethod
    def js_rfq_get(cls, rfq):
        "A request for quote as the Jobshop Request for Quote window shows it"
        cls._check_read('nline.rfq')
        pool = Pool()
        RFQ = pool.get('nline.rfq')
        rfq = RFQ(rfq)
        data = {
            'id': rfq.id,
            'number': rfq.number or '',
            'rfq_date': rfq.rfq_date,
            'due_date': rfq.due_date,
            'desired_receive_date': rfq.desired_receive_date,
            'status': rfq.status,
            'fob_point': _m2o(rfq.fob_point),
            'ship_via': _m2o(rfq.ship_via),
            'payment_term': _m2o(rfq.payment_term),
            'payable_account': _m2o(rfq.payable_account),
            'freight_terms': rfq.freight_terms,
            'buyer': rfq.buyer or '',
            'printed_date': rfq.printed_date,
            'specifications': rfq.specifications or '',
            'purchases': [{'id': p.id, 'number': p.number or str(p.id),
                    'party': p.party.rec_name,
                    'status': p.jobshop_status} for p in rfq.purchases],
            'lines': [],
            }
        for name in SHIP_TO_FIELDS:
            data[name] = getattr(rfq, name) or ''
        for slot in SLOTS:
            party = getattr(rfq, 'supplier_%s' % slot)
            data['supplier_%s' % slot] = _m2o(party)
            data['supplier_code_%s' % slot] = party.code if party else ''
            data['address_%s' % slot] = (cls._js_address(
                    party.addresses[0] if party.addresses else None, party)
                if party else None)
            for name in ['quote_received', 'reference', 'as_of_date',
                    'expiration_date']:
                value = getattr(rfq, '%s_%s' % (name, slot))
                data['%s_%s' % (name, slot)] = (value if value is not None
                    else ('' if name == 'reference' else None))
            data['tax_group_%s' % slot] = _m2o(
                getattr(rfq, 'tax_group_%s' % slot))
        for line in rfq.lines:
            row = {
                'id': line.id,
                'sequence': line.sequence,
                'line_type': line.line_type,
                'line_status': line.line_status,
                'product': _m2o(line.product),
                'service_part': _m2o(line.service_part),
                'description': line.description or '',
                'unit': _m2o(line.unit),
                'mfg_name': line.mfg_name or '',
                'mfg_part_id': line.mfg_part_id or '',
                'product_code': _m2o(line.product_code),
                'commodity_code': _m2o(line.commodity_code),
                'desired_receive_date': line.desired_receive_date,
                'expense_account': _m2o(line.expense_account),
                'specifications': line.specifications or '',
                'drawing': line.drawing or '',
                'drawing_revision': line.drawing_revision or '',
                'linked': line.linked,
                'po_line_exists': line.po_line_exists,
                'purchase_lines': [{'id': l.id,
                        'purchase': l.purchase.id,
                        'number': l.purchase.number or str(l.purchase.id)}
                    for l in line.purchase_lines],
                'prices': [],
                'links': [{
                        'id': k.id,
                        'production': _m2o(k.production),
                        'operation': k.operation,
                        'piece': k.piece,
                        'work': _m2o(k.work),
                        'quantity': k.quantity,
                        'reference': k.reference or '',
                        } for k in line.links],
                }
            for slot in SLOTS:
                row['supplier_code_%s' % slot] = getattr(
                    line, 'supplier_code_%s' % slot) or ''
                row['tax_group_%s' % slot] = _m2o(
                    getattr(line, 'tax_group_%s' % slot))
            for price in line.prices:
                prow = {'id': price.id, 'quantity': price.quantity}
                for slot in SLOTS:
                    for name in ['lead_time', 'unit_price',
                            'trade_discount', 'fixed_charge',
                            'delivery_date']:
                        prow['%s_%s' % (name, slot)] = getattr(
                            price, '%s_%s' % (name, slot))
                    prow['amount_%s' % slot] = price.amount(slot)
                row['prices'].append(prow)
            data['lines'].append(row)
        return data

    @classmethod
    def js_rfq_save(cls, values):
        """Create or change a request for quote with its lines, their
        quantities, quoted prices and links (the screen sends them all)"""
        pool = Pool()
        RFQ = pool.get('nline.rfq')
        Line = pool.get('nline.rfq.line')
        Price = pool.get('nline.rfq.line.price')
        Link = pool.get('nline.rfq.link')
        head = {
            'number': (values.get('number') or '').strip() or None,
            'rfq_date': _date(values.get('rfq_date')),
            'due_date': _date(values.get('due_date')),
            'desired_receive_date': _date(values.get('desired_receive_date')),
            'status': values.get('status') or 'unreleased',
            'fob_point': _id(values.get('fob_point')),
            'ship_via': _id(values.get('ship_via')),
            'payment_term': _id(values.get('payment_term')),
            'payable_account': _id(values.get('payable_account')),
            'freight_terms': values.get('freight_terms') or None,
            'buyer': values.get('buyer') or None,
            'specifications': values.get('specifications') or None,
            }
        for name in SHIP_TO_FIELDS:
            head[name] = values.get(name) or None
        for slot in SLOTS:
            head['supplier_%s' % slot] = _id(values.get('supplier_%s' % slot))
            head['quote_received_%s' % slot] = bool(
                values.get('quote_received_%s' % slot))
            head['tax_group_%s' % slot] = _id(
                values.get('tax_group_%s' % slot))
            head['reference_%s' % slot] = values.get(
                'reference_%s' % slot) or None
            head['as_of_date_%s' % slot] = _date(
                values.get('as_of_date_%s' % slot))
            head['expiration_date_%s' % slot] = _date(
                values.get('expiration_date_%s' % slot))
        if not head['rfq_date']:
            head.pop('rfq_date')
        if values.get('id'):
            cls._check_write('nline.rfq')
            rfq = RFQ(values['id'])
            if not head['number']:
                head.pop('number')
            RFQ.write([rfq], head)
        else:
            cls._check_create('nline.rfq')
            head['company'] = cls._company().id
            rfq, = RFQ.create([head])
        kept = []
        for sequence, row in enumerate(values.get('lines', []), 1):
            line_values = {
                'sequence': int(row.get('sequence') or sequence),
                'line_type': row.get('line_type') or 'part',
                'line_status': row.get('line_status') or 'open',
                'product': _id(row.get('product')),
                'service_part': _id(row.get('service_part')),
                'description': row.get('description') or None,
                'unit': _id(row.get('unit')),
                'mfg_name': row.get('mfg_name') or None,
                'mfg_part_id': row.get('mfg_part_id') or None,
                'product_code': _id(row.get('product_code')),
                'commodity_code': _id(row.get('commodity_code')),
                'desired_receive_date': _date(
                    row.get('desired_receive_date')),
                'expense_account': _id(row.get('expense_account')),
                'specifications': row.get('specifications') or None,
                'drawing': row.get('drawing') or None,
                'drawing_revision': row.get('drawing_revision') or None,
                }
            for slot in SLOTS:
                line_values['supplier_code_%s' % slot] = row.get(
                    'supplier_code_%s' % slot) or None
                line_values['tax_group_%s' % slot] = _id(
                    row.get('tax_group_%s' % slot))
            if row.get('id'):
                line = Line(row['id'])
                if line.rfq != rfq:
                    continue
                Line.write([line], line_values)
            else:
                line, = Line.create([dict(line_values, rfq=rfq.id)])
            kept.append(line.id)
            prices_kept = []
            for prow in row.get('prices', []):
                if prow.get('quantity') in (None, ''):
                    continue
                price_values = {'quantity': _float(prow['quantity'])}
                for slot in SLOTS:
                    lead = prow.get('lead_time_%s' % slot)
                    price_values['lead_time_%s' % slot] = (int(lead)
                        if lead not in (None, '') else None)
                    for name in ['unit_price', 'trade_discount',
                            'fixed_charge']:
                        price_values['%s_%s' % (name, slot)] = _dec(
                            prow.get('%s_%s' % (name, slot)))
                    price_values['delivery_date_%s' % slot] = _date(
                        prow.get('delivery_date_%s' % slot))
                if prow.get('id'):
                    price = Price(prow['id'])
                    Price.write([price], price_values)
                else:
                    price, = Price.create([dict(price_values,
                                line=line.id)])
                prices_kept.append(price.id)
            old = Price.search([('line', '=', line.id),
                    ('id', 'not in', prices_kept)])
            if old:
                Price.delete(old)
            if 'links' in row:
                cls._save_links(Link, 'line', line, row['links'])
        old = Line.search([('rfq', '=', rfq.id), ('id', 'not in', kept)])
        if old:
            Line.delete(old)
        return cls.js_rfq_get(rfq.id)

    @classmethod
    def js_rfq_delete(cls, rfq):
        pool = Pool()
        RFQ = pool.get('nline.rfq')
        ModelAccess = pool.get('ir.model.access')
        ModelAccess.check('nline.rfq', 'delete')
        RFQ.delete([RFQ(rfq)])
        return True

    @classmethod
    def js_rfq_printed(cls, rfq):
        RFQ = Pool().get('nline.rfq')
        cls._check_read('nline.rfq')
        with Transaction().set_context(_check_access=False):
            RFQ.write([RFQ(rfq)], {'printed_date': dt.datetime.now()})
        return True

    @classmethod
    def js_rfq_create_po(cls, values):
        """Make the purchase order of a supplier's quote (Preview/Create PO)
        values: rfq, slot (1, 2 or 3), lines [{line, price}] (the quoted
        quantity of each line to order; all the open lines with a quote of
        the supplier when not given). The request closes."""
        pool = Pool()
        RFQ = pool.get('nline.rfq')
        Line = pool.get('nline.rfq.line')
        Price = pool.get('nline.rfq.line.price')
        cls._check_write('nline.rfq')
        rfq = RFQ(values['rfq'])
        slot = int(values.get('slot') or 1)
        party = getattr(rfq, 'supplier_%s' % slot)
        if not party:
            raise ValidationError(gettext(
                    'nline_js_purchasing.msg_rfq_no_supplier',
                    rfq=rfq.rec_name, slot=slot))
        chosen = []
        if values.get('lines'):
            for row in values['lines']:
                if not row.get('price'):
                    continue
                line = Line(row['line'])
                price = Price(row['price'])
                if line.rfq != rfq or price.line != line:
                    continue
                chosen.append((line, price))
        else:
            for line in rfq.lines:
                if line.line_status != 'open' or line.purchase_lines:
                    continue
                quoted = [p for p in line.prices
                    if getattr(p, 'unit_price_%s' % slot) is not None]
                if quoted:
                    chosen.append((line, quoted[0]))
        if not chosen:
            raise ValidationError(gettext(
                    'nline_js_purchasing.msg_rfq_no_quote',
                    rfq=rfq.rec_name, supplier=party.rec_name))
        lines = []
        for line, price in chosen:
            lines.append({
                    'product': line.product.id if line.product else None,
                    'description': line.description
                    or (line.product.name if line.product else None),
                    'quantity': price.quantity,
                    'unit_price': getattr(price, 'unit_price_%s' % slot),
                    'trade_discount': getattr(
                        price, 'trade_discount_%s' % slot),
                    'fixed_charge': getattr(price, 'fixed_charge_%s' % slot),
                    'supplier_part_code': getattr(
                        line, 'supplier_code_%s' % slot),
                    'mfg_name': line.mfg_name,
                    'mfg_part_id': line.mfg_part_id,
                    'product_code': (line.product_code.id
                        if line.product_code else None),
                    'commodity_code': (line.commodity_code.id
                        if line.commodity_code else None),
                    'receive_date': (getattr(price, 'delivery_date_%s' % slot)
                        or line.desired_receive_date),
                    'tax_group': (getattr(line, 'tax_group_%s' % slot)
                        or getattr(rfq, 'tax_group_%s' % slot)),
                    'expense_account': (line.expense_account.id
                        if line.expense_account else None),
                    'specifications': line.specifications,
                    'rfq_line': line.id,
                    'links': [{
                            'production': k.production.id
                            if k.production else None,
                            'operation': k.operation,
                            'piece': k.piece,
                            'work': k.work.id if k.work else None,
                            'quantity': k.quantity,
                            'reference': k.reference,
                            } for k in line.links],
                    })
        for row in lines:
            if row['tax_group'] is not None and not isinstance(
                    row['tax_group'], int):
                row['tax_group'] = row['tax_group'].id
        head = {
            'party': party.id,
            'purchase_date': pool.get('ir.date').today(),
            'delivery_date': rfq.desired_receive_date,
            'reference': getattr(rfq, 'reference_%s' % slot),
            'payment_term': (rfq.payment_term.id if rfq.payment_term
                else (party.supplier_payment_term.id
                    if party.supplier_payment_term else None)),
            'buyer': rfq.buyer,
            'fob_point': rfq.fob_point.id if rfq.fob_point else None,
            'ship_via': rfq.ship_via.id if rfq.ship_via else None,
            'tax_group': (getattr(rfq, 'tax_group_%s' % slot).id
                if getattr(rfq, 'tax_group_%s' % slot) else None),
            'freight_terms': rfq.freight_terms,
            'payable_account': (rfq.payable_account.id
                if rfq.payable_account else None),
            'specifications': rfq.specifications,
            'rfq': rfq.id,
            'lines': lines,
            }
        for name in SHIP_TO_FIELDS:
            head[name] = getattr(rfq, name)
        data = cls.js_po_save(head)
        # Closed: a purchase order was made from one of the quotes
        RFQ.write([rfq], {'status': 'closed'})
        for line, _ in chosen:
            if line.line_status != 'closed':
                Line.write([line], {'line_status': 'closed'})
        return data
