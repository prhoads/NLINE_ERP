# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The services of the Jobshop Sales windows: Sales Orders (on top of the
desk's Customer Order Entry: sale_order_get / sale_order_save keep doing
what they did), Shipping and Invoicing"""
import datetime as dt
from decimal import Decimal

from trytond.exceptions import UserWarning
from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.modules.nline_desk.desk import _date, _decimal, accept_warnings
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

# The Jobshop fields of the order header the window sends (many2one: id)
HEADER_M2O = {
    'sales_rep': 'nline.sales_rep',
    'territory': 'nline.territory',
    'fob_point': 'nline.fob_point',
    'ship_via': 'nline.ship_via',
    'js_carrier': 'nline.carrier',
    'tax_group': 'nline.sales_tax_group',
    'discount_class': 'nline.discount_class',
    }
HEADER_OTHER = ['freight_terms', 'js_specs', 'js_quote', 'promise_date']
LINE_M2O = {
    'product_code': 'nline.product_code',
    'commodity_code': 'nline.commodity_code',
    'line_tax_group': 'nline.sales_tax_group',
    }
LINE_OTHER = ['customer_part', 'customer_po_line', 'gross_unit_price',
    'trade_discount', 'promise_date', 'js_line_specs']
CHARGE_FIELDS = ['service_charge', 'description', 'amount', 'tax_group',
    'apply', 'account']
SHIPPER_M2O = {
    'js_carrier': 'nline.carrier',
    'fob_point': 'nline.fob_point',
    'ship_via': 'nline.ship_via',
    }


def _ref(record):
    return {'id': record.id, 'rec_name': record.rec_name} if record else None


def _address(address, party=None):
    "A Sold To / Ship To / Bill To tab"
    if not address:
        return {'name': party.rec_name if party else ''}
    return {
        'id': address.id,
        'name': address.party_name or (address.party.rec_name
            if address.party else ''),
        'street': address.street or '',
        'city': address.city or '',
        'state': address.subdivision.rec_name if address.subdivision
        else '',
        'postal_code': address.postal_code or '',
        'country': address.country.rec_name if address.country else '',
        'contact': address.ship_to_contact or '',
        'title': address.ship_to_title or '',
        'phone': address.ship_to_phone or (address.party.phone
            if address.party else '') or '',
        'fax': address.ship_to_fax or (address.party.fax
            if address.party else '') or '',
        'email': address.ship_to_email or (address.party.email
            if address.party else '') or '',
        'full': address.full_address,
        }


class Desk(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['sales_order_copy', 'sales_order_status',
                'sales_order_delete', 'sales_ship', 'sales_return',
                'sales_return_receive', 'sales_invoice_save',
                'sales_credit_memo']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['sales_order_defaults', 'sales_price',
                'sales_shipping_activity', 'sales_shipper_get',
                'sales_invoicing_activity', 'sales_invoice_get']:
            cls.__rpc__[name] = RPC()

    # ---- Sales Orders -----------------------------------------------------

    @classmethod
    def sale_order_get(cls, sale):
        "The order as the Jobshop Sales Order window shows it, all tabs"
        result = super().sale_order_get(sale)
        pool = Pool()
        Sale = pool.get('sale.sale')
        Product = pool.get('product.product')
        sale = Sale(result['id'])
        lines = {l.id: l for l in sale.lines}
        products = list({l.product for l in sale.lines if l.product})
        with Transaction().set_context(
                locations=cls._warehouse_ids(), with_childs=True):
            available = {p.id: p.quantity for p in Product.browse(products)}
        for number, data in enumerate(result['lines'], 1):
            line = lines[data['id']]
            data.update({
                    'line_no': number,
                    'customer_part': line.customer_part or '',
                    'customer_po_line': line.customer_po_line or '',
                    'gross_unit_price': line.gross_unit_price
                    if line.gross_unit_price is not None else line.unit_price,
                    'trade_discount': line.trade_discount or Decimal(0),
                    'promise_date': line.promise_date,
                    'product_code': _ref(line.product_code),
                    'commodity_code': _ref(line.commodity_code),
                    'line_tax_group': _ref(line.line_tax_group),
                    'js_line_specs': line.js_line_specs or '',
                    'js_line_status': line.js_line_status,
                    'shipped_quantity': line.js_shipped_quantity,
                    'last_shipped_date': line.js_last_shipped_date,
                    'available': available.get(line.product.id)
                    if line.product else None,
                    })
        party = sale.party
        result.update({
                'js_status': sale.js_status,
                'js_hold': sale.js_hold,
                'js_quote': sale.js_quote or '',
                'promise_date': sale.promise_date,
                'freight_terms': sale.freight_terms,
                'js_specs': sale.js_specs or '',
                'last_shipped_date': sale.js_last_shipped_date,
                'shipped_amount': sale.js_shipped_amount,
                'charges_amount': sale.js_charges_amount,
                'order_amount': (sale.total_amount or Decimal(0))
                + sale.js_charges_amount,
                'invoice_method': sale.invoice_method,
                'sold_to': _address(sale.invoice_address
                    or party.address_get(type='invoice'), party),
                'ship_to': _address(sale.shipment_address, party),
                'credit_status': party.credit_status,
                'charges': [cls._charge(c) for c in sale.charges],
                'taxes': cls._sale_taxes(sale),
                'shippers': cls._sale_documents(sale),
                })
        for name in HEADER_M2O:
            result[name] = _ref(getattr(sale, name))
        return result

    @classmethod
    def _charge(cls, charge):
        return {
            'id': charge.id,
            'service_charge': _ref(charge.service_charge),
            'description': charge.description or '',
            'amount': charge.amount,
            'tax_group': _ref(charge.tax_group),
            'apply': charge.apply,
            'account': _ref(charge.account),
            'applied_amount': charge.applied_amount,
            'invoice': _ref(charge.invoice),
            'shipment': _ref(charge.shipment),
            }

    @classmethod
    def _sale_taxes(cls, sale):
        "The Taxes tab: the order's taxes by Jobshop tax group and name"
        pool = Pool()
        Line = pool.get('nline.sales_tax_group.line')
        taxes = []
        for value in sale._get_taxes().values():
            tax_id = value['tax']
            groups = Line.search([('tax', '=', tax_id)], limit=1)
            line = groups[0] if groups else None
            tax = pool.get('account.tax')(tax_id)
            taxes.append({
                    'tax_group': line.group.code if line else '',
                    'tax_name': line.tax_name if line else tax.name,
                    'description': value.get('description') or tax.description,
                    'account': pool.get('account.account')(
                        value['account']).rec_name if value.get('account')
                    else '',
                    'percent': (tax.rate or Decimal(0)) * 100
                    if tax.type == 'percentage' else None,
                    'base': value['base'],
                    'amount': value['amount'],
                    })
        return taxes

    @classmethod
    def _sale_documents(cls, sale):
        "The Shippers/Invoices tab"
        rows = []
        for shipment in sale.shipments:
            rows.append({
                    'model': shipment.__name__, 'id': shipment.id,
                    'number': shipment.number or str(shipment.id),
                    'type': 'Shipment', 'state': shipment.state,
                    'date': shipment.effective_date or shipment.planned_date,
                    'amount': cls._moves_amount(shipment.outgoing_moves),
                    })
        for shipment in sale.shipment_returns:
            rows.append({
                    'model': shipment.__name__, 'id': shipment.id,
                    'number': shipment.number or str(shipment.id),
                    'type': 'Return', 'state': shipment.state,
                    'date': shipment.effective_date or shipment.planned_date,
                    'amount': -cls._moves_amount(shipment.incoming_moves),
                    })
        for invoice in sale.invoices:
            rows.append({
                    'model': 'account.invoice', 'id': invoice.id,
                    'number': invoice.number or '',
                    'type': 'Invoice' if invoice.total_amount >= 0
                    else 'Credit Memo',
                    'state': invoice.state, 'date': invoice.invoice_date,
                    'amount': invoice.total_amount,
                    })
        return rows

    @classmethod
    def _moves_amount(cls, moves):
        amount = Decimal(0)
        for move in moves:
            if move.unit_price is not None and move.state != 'cancelled':
                amount += Decimal(str(move.quantity)) * move.unit_price
        return amount.quantize(Decimal('0.01'))

    @classmethod
    def sales_order_defaults(cls, party):
        """The order's Details, ship to and terms for the customer (and its
        credit warning), as Jobshop fills them when the customer is chosen"""
        cls._check_read('sale.sale')
        pool = Pool()
        Sale = pool.get('sale.sale')
        Party = pool.get('party.party')
        party = Party(party)
        sale = Sale(company=cls._company(), party=party)
        sale.on_change_party()
        result = {
            'payment_term': sale.payment_term.id if sale.payment_term
            else None,
            'shipment_address': _ref(sale.shipment_address),
            'freight_terms': sale.freight_terms,
            'js_specs': getattr(sale, 'js_specs', None) or '',
            'credit_status': party.credit_status,
            'credit_limit': party.credit_limit,
            'tax_exempt': party.customer_tax_exempt,
            'sold_to': _address(party.address_get(type='invoice'), party),
            'ship_to': _address(sale.shipment_address, party),
            }
        for name in HEADER_M2O:
            result[name] = _ref(getattr(sale, name, None))
        return result

    @classmethod
    def sales_price(cls, party, product, quantity=1, date=None):
        """Reset unit price from customer: the customer's price break, the
        discount class's, then the part's price less the class's discount"""
        cls._check_read('sale.sale')
        pool = Pool()
        Party = pool.get('party.party')
        Product = pool.get('product.product')
        price, discount, customer_part, source = Party(party).sale_price(
            Product(product), float(quantity or 1), _date(date))
        return {
            'gross_unit_price': price,
            'trade_discount': discount,
            'customer_part': customer_part or '',
            'source': source,
            }

    @classmethod
    @accept_warnings
    def sale_order_save(cls, values):
        """Save the order of the Sales Order window: a draft one entirely
        (the desk's save, then the Jobshop fields), a released one its
        Details, Specs and Charges (what Jobshop lets change after release)
        values: as the desk's save, plus number, the HEADER fields, the
        lines' LINE fields and charges"""
        pool = Pool()
        Sale = pool.get('sale.sale')
        cls._check_write('sale.sale')
        lines = values.get('lines') or []
        for data in lines:
            if data.get('gross_unit_price') not in (None, ''):
                gross = _decimal(data['gross_unit_price'])
                discount = _decimal(data.get('trade_discount'))
                data['unit_price'] = str((gross * (1 - discount / 100))
                    .quantize(Decimal('0.0001')))
        if values.get('id') and Sale(values['id']).state != 'draft':
            sale = Sale(values['id'])
        else:
            cls._check_credit(values)
            core = {k: v for k, v in values.items() if k in {
                    'id', 'party', 'sale_date', 'shipping_date', 'reference',
                    'description', 'payment_term', 'shipment_address'}}
            core['lines'] = [{k: v for k, v in l.items() if k in {
                        'id', 'product', 'description', 'quantity',
                        'unit_price'}} for l in lines]
            sale = Sale(super().sale_order_save(core)['id'])
            cls._save_order_lines(sale, lines)
        cls._save_order_header(sale, values)
        cls._save_charges(sale, values.get('charges'))
        if sale.state != 'draft':
            cls._save_released_lines(sale, lines)
        return cls.sale_order_get(sale.id)

    @classmethod
    def _check_credit(cls, values):
        "Jobshop's credit status and order limit: a warning to accept"
        pool = Pool()
        Party = pool.get('party.party')
        Warning = pool.get('res.user.warning')
        party = Party(values['party'])
        if party.credit_status == 'hold_orders':
            key = Warning.format('nline_js_sales_hold_orders', [party])
            if Warning.check(key):
                raise UserWarning(key, gettext(
                        'nline_js_sales.msg_credit_hold_orders',
                        party=party.rec_name))
        if party.credit_limit:
            amount = sum((Decimal(str(l.get('quantity') or 0))
                    * _decimal(l.get('unit_price'))
                    for l in values.get('lines') or []), Decimal(0))
            amount += sum((_decimal(c.get('amount'))
                    for c in values.get('charges') or []), Decimal(0))
            if amount > party.credit_limit:
                key = Warning.format('nline_js_sales_credit_limit', [party])
                if Warning.check(key):
                    raise UserWarning(key, gettext(
                            'nline_js_sales.msg_credit_limit',
                            party=party.rec_name, amount=amount,
                            limit=party.credit_limit))

    @classmethod
    def _save_order_header(cls, sale, values):
        pool = Pool()
        Sale = pool.get('sale.sale')
        write = {}
        number = (values.get('number') or '').strip()
        if number and number != (sale.number or ''):
            if Sale.search([('number', '=', number), ('id', '!=', sale.id)]):
                raise ValidationError(gettext(
                        'nline_js_sales.msg_order_number_used',
                        number=number))
            write['number'] = number
        for name in HEADER_M2O:
            if name in values:
                value = values[name]
                write[name] = value.get('id') if isinstance(value, dict) \
                    else value
        for name in HEADER_OTHER:
            if name in values:
                value = values[name]
                write[name] = _date(value) if name.endswith('date') \
                    else (value or None)
        if sale.state != 'draft':
            # The documents' references may still change (Jobshop)
            for name in ['reference', 'description']:
                if name in values:
                    write[name] = values[name] or None
            if 'shipping_date' in values:
                write['shipping_date'] = _date(values['shipping_date'])
        if write:
            Sale.write([sale], write)

    @classmethod
    def _line_values(cls, data, released=False):
        write = {}
        for name in LINE_M2O:
            if name in data:
                value = data[name]
                write[name] = value.get('id') if isinstance(value, dict) \
                    else value
        for name in LINE_OTHER:
            if released and name in {'gross_unit_price', 'trade_discount'}:
                continue
            if name in data:
                value = data[name]
                if name.endswith('date'):
                    value = _date(value) or None
                elif name in {'gross_unit_price', 'trade_discount'}:
                    value = None if value in (None, '') else _decimal(value)
                else:
                    value = value or None
                write[name] = value
        return write

    @classmethod
    def _save_order_lines(cls, sale, lines):
        "The Jobshop fields of the draft order's lines and their taxes"
        pool = Pool()
        Line = pool.get('sale.line')
        sale = pool.get('sale.sale')(sale.id)
        by_sequence = {l.sequence: l for l in sale.lines}
        to_write = []
        for sequence, data in enumerate(lines, 1):
            line = by_sequence.get(sequence)
            if not line:
                continue
            write = cls._line_values(data)
            group = None
            if write.get('line_tax_group'):
                group = pool.get('nline.sales_tax_group')(
                    write['line_tax_group'])
            elif sale.tax_group:
                group = sale.tax_group
            if sale.tax_exempt:
                write['taxes'] = [('remove', [t.id for t in line.taxes])]
            elif group:
                taxes = group.get_taxes(sale.sale_date)
                write['taxes'] = [
                    ('remove', [t.id for t in line.taxes]),
                    ('add', [t.id for t in taxes])]
            if write:
                to_write.extend([[line], write])
        if to_write:
            Line.write(*to_write)

    @classmethod
    def _save_released_lines(cls, sale, lines):
        "What Jobshop lets change on the lines of a released order"
        pool = Pool()
        Line = pool.get('sale.line')
        by_id = {l.id: l for l in sale.lines}
        to_write = []
        for data in lines:
            line = by_id.get(data.get('id'))
            if line:
                write = cls._line_values(data, released=True)
                if write:
                    to_write.extend([[line], write])
        if to_write:
            Line.write(*to_write)

    @classmethod
    def _save_charges(cls, sale, charges):
        """The Charges tab: charges [{id, service_charge, description,
        amount, tax_group, apply, account}]; an invoiced charge stays"""
        if charges is None:
            return
        pool = Pool()
        Charge = pool.get('nline.sale_charge')
        cls._check_write('nline.sale_charge')
        existing = {c.id: c for c in sale.charges}
        kept, to_save = set(), []
        for data in charges:
            charge = existing.get(data.get('id'))
            if charge:
                kept.add(charge.id)
                if charge.invoice_line:
                    continue
            else:
                if not data.get('service_charge'):
                    continue
                charge = Charge(sale=sale)
            for name in CHARGE_FIELDS:
                if name not in data:
                    continue
                value = data[name]
                if isinstance(value, dict):
                    value = value.get('id')
                if name == 'amount':
                    value = _decimal(value)
                elif name == 'apply':
                    value = bool(value)
                elif name in {'service_charge', 'tax_group', 'account'}:
                    model = {'service_charge': 'nline.service_charge',
                        'tax_group': 'nline.sales_tax_group',
                        'account': 'account.account'}[name]
                    value = pool.get(model)(value) if value else None
                setattr(charge, name, value)
            if not charge.id or charge.id < 0:
                if not getattr(charge, 'description', None):
                    charge.description = charge.service_charge.description
                if getattr(charge, 'account', None) is None:
                    charge.account = charge.service_charge.account
            to_save.append(charge)
        Charge.save(to_save)
        to_delete = [c for i, c in existing.items()
            if i not in kept and not c.invoice_line]
        if to_delete:
            Charge.delete(to_delete)
        Charge.apply_to_draft_invoices(to_save)

    @classmethod
    def sales_order_copy(cls, source, kind='order'):
        """Edit > Copy Document / File > New Document From > Quote: a new
        unreleased order with the source's lines (Jobshop gives it a new ID
        when saved)"""
        cls._check_create('sale.sale')
        pool = Pool()
        Sale = pool.get('sale.sale')
        Date = pool.get('ir.date')
        source = Sale(source)
        if kind == 'quote' and source.state not in {'draft', 'quotation'}:
            raise ValidationError(gettext(
                    'nline_js_sales.msg_not_a_quote', sale=source.rec_name))
        default = {
            'sale_date': Date.today(),
            'js_quote': (source.number or str(source.id))
            if kind == 'quote' else source.js_quote,
            'reference': source.reference if kind == 'quote' else None,
            }
        sale, = Sale.copy([source], default=default)
        return cls.sale_order_get(sale.id)

    @classmethod
    def sales_order_status(cls, sale, status):
        """Change Status: Jobshop's status from Tryton's states
        (Unreleased: draft, Firm: quotation, Released: confirmed), Hold and
        a manual Close as flags, Cancelled"""
        cls._check_write('sale.sale')
        pool = Pool()
        Sale = pool.get('sale.sale')
        sale = Sale(sale)
        if status == 'hold':
            Sale.write([sale], {'js_hold': True})
            return cls.sale_order_get(sale.id)
        flags = {'js_hold': False}
        if status != 'closed':
            flags['js_closed'] = False
        if status == 'unreleased':
            if sale.state == 'quotation':
                Sale.draft([sale])
            elif sale.state == 'cancelled':
                Sale.draft([sale])
            elif sale.state != 'draft':
                cls._refuse_status(sale, status)
        elif status == 'firm':
            if sale.state == 'draft':
                Sale.quote([sale])
            elif sale.state != 'quotation':
                cls._refuse_status(sale, status)
        elif status == 'released':
            if sale.state == 'draft':
                Sale.quote([sale])
            if sale.state in {'draft', 'quotation'}:
                Sale.confirm([sale])
            elif sale.state not in {'confirmed', 'processing'}:
                cls._refuse_status(sale, status)
        elif status == 'closed':
            if sale.state in {'draft', 'quotation', 'cancelled'}:
                cls._refuse_status(sale, status)
            flags['js_closed'] = sale.state != 'done'
        elif status == 'cancelled':
            if sale.state in {'draft', 'quotation'}:
                Sale.cancel([sale])
            elif sale.state != 'cancelled':
                cls._refuse_status(sale, status)
        else:
            cls._refuse_status(sale, status)
        Sale.write([Sale(sale.id)], flags)
        return cls.sale_order_get(sale.id)

    @classmethod
    def _refuse_status(cls, sale, status):
        raise ValidationError(gettext('nline_js_sales.msg_status_refused',
                sale=sale.rec_name, status=status,
                state=sale.state))

    @classmethod
    def sales_order_delete(cls, sale):
        """Edit > Delete Document: an order nothing was shipped or invoiced
        on (unreleased or firm)"""
        pool = Pool()
        Sale = pool.get('sale.sale')
        ModelAccess = pool.get('ir.model.access')
        ModelAccess.check('sale.sale', 'delete')
        sale = Sale(sale)
        if sale.state not in {'draft', 'quotation', 'cancelled'}:
            raise ValidationError(gettext(
                    'nline_js_sales.msg_order_not_deletable',
                    sale=sale.rec_name))
        if sale.state != 'cancelled':
            Sale.cancel([sale])
        Sale.delete([sale])
        return True

    # ---- Shipping ---------------------------------------------------------

    @classmethod
    def sales_shipping_activity(cls, shipped=False):
        """The Shipping Activity tab: the shippers to ship (View Unshipped
        Orders) or shipped in the last 90 days (View Shipped Orders), and
        the returns to receive"""
        cls._check_read('stock.shipment.out')
        pool = Pool()
        Shipment = pool.get('stock.shipment.out')
        Return = pool.get('stock.shipment.out.return')
        Date = pool.get('ir.date')
        today = Date.today()
        if shipped:
            domain = [('state', '=', 'done'),
                ('effective_date', '>=', today - dt.timedelta(days=90))]
            order = [('effective_date', 'DESC')]
        else:
            domain = [('state', 'in',
                    ['draft', 'waiting', 'assigned', 'picked', 'packed'])]
            order = [('planned_date', 'ASC')]
        rows = []
        for shipment in Shipment.search(domain, order=order, limit=500):
            rows.append(cls._activity_row(shipment, False, today))
        if not shipped:
            for shipment in Return.search(
                    [('state', 'in', ['draft', 'received'])],
                    order=[('planned_date', 'ASC')], limit=200):
                rows.append(cls._activity_row(shipment, True, today))
        return rows

    @classmethod
    def _shipment_sales(cls, shipment):
        sales = []
        for move in shipment.moves:
            sale = getattr(move, 'sale', None)
            if sale and sale not in sales:
                sales.append(sale)
        return sales

    @classmethod
    def _activity_row(cls, shipment, is_return, today):
        sales = cls._shipment_sales(shipment)
        planned = shipment.planned_date
        messages = []
        if any(s.js_hold for s in sales):
            messages.append('On hold')
        if any(s.party.credit_status == 'hold_shipments' for s in sales):
            messages.append('Credit: hold shipments')
        if (not is_return and shipment.state != 'done' and planned
                and planned < today):
            messages.append('%s days late' % (today - planned).days)
        return {
            'id': shipment.id,
            'model': shipment.__name__,
            'number': shipment.number or str(shipment.id),
            'return': is_return,
            'state': shipment.state,
            'sales': [{'id': s.id, 'number': s.number or str(s.id)}
                for s in sales],
            'customer': shipment.customer.rec_name,
            'reference': ', '.join(filter(None,
                    (s.reference for s in sales))) or shipment.reference
            or '',
            'planned_date': planned,
            'effective_date': shipment.effective_date,
            'message': '; '.join(messages),
            }

    @classmethod
    def sales_shipper_get(cls, shipment, model='stock.shipment.out'):
        "A shipper (or return) with all the tabs of the Shipping window"
        cls._check_read(model)
        pool = Pool()
        Shipment = pool.get(model)
        Product = pool.get('product.product')
        shipment = Shipment(shipment)
        is_return = model == 'stock.shipment.out.return'
        sales = cls._shipment_sales(shipment)
        moves = shipment.incoming_moves if is_return \
            else shipment.outgoing_moves
        products = list({m.product for m in moves})
        location = shipment.warehouse_storage if not is_return \
            else shipment.warehouse.storage_location
        with Transaction().set_context(locations=[location.id],
                with_childs=True):
            available = {p.id: p.quantity for p in Product.browse(products)}
        lines = []
        for number, move in enumerate(moves, 1):
            sale_line = move.origin if move.origin and \
                move.origin.__name__ == 'sale.line' else None
            lines.append({
                    'move': move.id,
                    'line_no': number,
                    'sale': sale_line.sale.number if sale_line else '',
                    'so_line_no': sale_line.sequence if sale_line else None,
                    'desired_date': (sale_line.shipping_date
                        if sale_line else move.planned_date),
                    'product': _ref(move.product),
                    'description': (sale_line.description if sale_line
                        else '') or move.product.rec_name,
                    'customer_part': sale_line.customer_part or ''
                    if sale_line else '',
                    'quantity': move.quantity,
                    'ordered': abs(sale_line.quantity) if sale_line
                    else move.quantity,
                    'unit': move.unit.rec_name,
                    'unit_price': move.unit_price,
                    'location': location.rec_name,
                    'available': available.get(move.product.id),
                    'state': move.state,
                    'specs': sale_line.js_line_specs or '' if sale_line
                    else '',
                    })
        sale = sales[0] if sales else None
        charges = []
        for s in sales:
            charges += [cls._charge(c) for c in s.charges
                if not c.invoice_line or c.shipment == shipment]
        invoices = []
        for s in sales:
            invoices += [i for i in s.invoices if i not in invoices]
        address = shipment.delivery_address if not is_return \
            else shipment.contact_address
        result = {
            'id': shipment.id,
            'model': model,
            'return': is_return,
            'number': shipment.number or str(shipment.id),
            'state': shipment.state,
            'sales': [{'id': s.id, 'number': s.number or str(s.id),
                    'js_status': s.js_status} for s in sales],
            'customer': _ref(shipment.customer),
            'reference': (sale.reference if sale else None)
            or shipment.reference or '',
            'order_date': sale.sale_date if sale else None,
            'planned_date': shipment.planned_date,
            'effective_date': shipment.effective_date,
            'sold_to': _address(shipment.customer.address_get(
                    type='invoice'), shipment.customer),
            'ship_to': _address(address, shipment.customer),
            'payment_term': sale.payment_term.rec_name
            if sale and sale.payment_term else '',
            'tax_group': _ref(sale.tax_group) if sale else None,
            'discount_class': _ref(sale.discount_class) if sale else None,
            'invoices': [{'id': i.id, 'number': i.number or '',
                    'state': i.state, 'date': i.invoice_date}
                for i in invoices],
            'lines': lines,
            'charges': charges,
            'js_specs': '',
            'js_tracking_number': '',
            'freight_terms': sale.freight_terms if sale else None,
            }
        if not is_return:
            result.update({
                    'js_specs': shipment.js_specs or (sale.js_specs
                        if sale else '') or '',
                    'js_tracking_number': shipment.js_tracking_number or '',
                    'freight_terms': shipment.freight_terms or (
                        sale.freight_terms if sale else None),
                    })
            for name in SHIPPER_M2O:
                value = getattr(shipment, name) or (
                    getattr(sale, name) if sale else None)
                result[name] = _ref(value)
        return result

    @classmethod
    @accept_warnings
    def sales_ship(cls, values):
        """Save a shipper and, with ship, ship it: values id, lines [{move,
        quantity}] (less than ordered: the rest is back ordered on a new
        shipper, 0: all of it), the Details overrides, js_specs,
        js_tracking_number, effective_date, charges [{id, amount, apply}]"""
        pool = Pool()
        Shipment = pool.get('stock.shipment.out')
        Move = pool.get('stock.move')
        Sale = pool.get('sale.sale')
        Charge = pool.get('nline.sale_charge')
        Warning = pool.get('res.user.warning')
        cls._check_write('stock.shipment.out')
        shipment = Shipment(values['id'])
        sales = cls._shipment_sales(shipment)
        if values.get('ship'):
            for sale in sales:
                if sale.js_hold or sale.js_closed:
                    raise ValidationError(gettext(
                            'nline_js_sales.msg_order_on_hold',
                            sale=sale.rec_name))
                if sale.party.credit_status == 'hold_shipments':
                    key = Warning.format('nline_js_sales_hold_shipments',
                        [shipment])
                    if Warning.check(key):
                        raise UserWarning(key, gettext(
                                'nline_js_sales.msg_credit_hold_shipments',
                                party=sale.party.rec_name))

        # Header overrides
        write = {}
        for name in SHIPPER_M2O:
            if name in values:
                value = values[name]
                write[name] = value.get('id') if isinstance(value, dict) \
                    else value
        for name in ['freight_terms', 'js_specs', 'js_tracking_number',
                'reference']:
            if name in values:
                write[name] = values[name] or None
        if values.get('effective_date'):
            write['effective_date'] = _date(values['effective_date'])
        if write:
            Shipment.write([shipment], write)

        # Ship quantities: a smaller one leaves the rest to a back order
        quantities = {l['move']: float(l['quantity'])
            for l in values.get('lines') or [] if l.get('move')}
        changed = {m: q for m in shipment.outgoing_moves
            for i, q in quantities.items()
            if m.id == i and q != m.quantity}
        if changed:
            if shipment.state not in {'draft', 'waiting', 'assigned'}:
                raise ValidationError(gettext(
                        'nline_js_sales.msg_shipper_quantity_locked',
                        shipment=shipment.rec_name))
            state = shipment.state
            if state != 'draft':
                Shipment.draft([shipment])
            to_delete = []
            for move, quantity in changed.items():
                if quantity <= 0:
                    to_delete.append(move)
                else:
                    Move.write([move], {'quantity': quantity})
            if to_delete:
                Move.delete(to_delete)
            shipment = Shipment(shipment.id)
            if shipment.outgoing_moves and state != 'draft':
                Shipment.wait([shipment])
            Sale.process(sales)

        # The charges applied on this shipment
        for data in values.get('charges') or []:
            charge = Charge(data['id'])
            if charge.invoice_line:
                continue
            charge_write = {}
            if 'amount' in data:
                charge_write['amount'] = _decimal(data['amount'])
            if 'apply' in data:
                charge_write['apply'] = bool(data['apply'])
            if charge_write:
                Charge.write([charge], charge_write)

        shipment = Shipment(shipment.id)
        if values.get('ship') and shipment.outgoing_moves:
            if shipment.state == 'draft':
                Shipment.wait([shipment])
            if shipment.state == 'waiting':
                Shipment.assign_try([shipment])
                shipment = Shipment(shipment.id)
                if shipment.state == 'waiting':
                    # Jobshop ships from stock whatever the quantity on hand
                    Shipment.assign_force([shipment])
            shipment = Shipment(shipment.id)
            if shipment.state == 'assigned':
                Shipment.pick([shipment])
            shipment = Shipment(shipment.id)
            if shipment.state == 'picked':
                Shipment.pack([shipment])
            shipment = Shipment(shipment.id)
            if shipment.state == 'packed':
                Shipment.done([shipment])
            pending = [c for s in sales for c in s.charges if c.pending]
            if pending:
                Charge.write(pending, {'shipment': shipment.id})
            Sale.process([Sale(s.id) for s in sales])
            Charge.apply_to_draft_invoices(pending)
        return cls.sales_shipper_get(shipment.id)

    @classmethod
    def sales_return(cls, values):
        """Return parts of a shipped order (Marking a Sales Order for
        Return): values sale, lines [{line, quantity}]. Makes the return
        order (Tryton's return sale, the quantities negative) and confirms
        it: its return shipper waits on the Shipping Activity tab, its
        credit memo on the Invoicing one"""
        cls._check_create('sale.sale')
        pool = Pool()
        Sale = pool.get('sale.sale')
        Line = pool.get('sale.line')
        sale = Sale(values['sale'])
        quantities = {l['line']: float(l['quantity'])
            for l in values.get('lines') or [] if float(l.get('quantity')
                or 0) > 0}
        if not quantities:
            raise ValidationError(gettext(
                    'nline_js_sales.msg_return_nothing'))
        for line in sale.lines:
            if line.id in quantities and \
                    quantities[line.id] > line.js_shipped_quantity:
                raise ValidationError(gettext(
                        'nline_js_sales.msg_return_too_much',
                        line=line.rec_name))
        returned, = Sale.copy([sale], default={
                'origin': str(sale),
                'lines': [],
                'charges': [],
                'js_quote': None,
                'reference': sale.reference,
                })
        to_copy = [l for l in sale.lines if l.id in quantities]
        for line in to_copy:
            Line.copy([line], default={
                    'sale': returned.id,
                    'quantity': -quantities[line.id],
                    'js_return_of': line.id,
                    })
        Sale.quote([returned])
        Sale.confirm([returned])
        # Now, not after the call (the queue): the window shows its shipper
        Sale.process([Sale(returned.id)])
        returned = Sale(returned.id)
        return {
            'sale': {'id': returned.id, 'number': returned.number},
            'returns': [{'id': s.id, 'number': s.number}
                for s in returned.shipment_returns],
            }

    @classmethod
    def sales_return_receive(cls, shipment):
        "Receive a return shipper: the parts go back into stock"
        cls._check_write('stock.shipment.out.return')
        pool = Pool()
        Return = pool.get('stock.shipment.out.return')
        Sale = pool.get('sale.sale')
        shipment = Return(shipment)
        if shipment.state == 'draft':
            Return.receive([shipment])
        shipment = Return(shipment.id)
        if shipment.state == 'received':
            Return.done([shipment])
        sales = cls._shipment_sales(shipment)
        if sales:
            Sale.process(sales)
        return cls.sales_shipper_get(shipment.id,
            'stock.shipment.out.return')

    # ---- Invoicing --------------------------------------------------------

    @classmethod
    def sales_invoicing_activity(cls):
        """The Invoicing Activity tab: the invoices of shipped orders and
        the credit memos of returns waiting as drafts"""
        cls._check_read('account.invoice')
        pool = Pool()
        Invoice = pool.get('account.invoice')
        rows = []
        for invoice in Invoice.search([('type', '=', 'out'),
                    ('state', '=', 'draft')], order=[('id', 'ASC')],
                limit=500):
            rows.append(cls._invoice_row(invoice))
        return rows

    @classmethod
    def _invoice_shipments(cls, invoice):
        shipments = []
        for line in invoice.lines:
            for move in getattr(line, 'stock_moves', []) or []:
                if move.shipment and move.shipment not in shipments:
                    shipments.append(move.shipment)
        return shipments

    @classmethod
    def _invoice_row(cls, invoice):
        sales = list(getattr(invoice, 'sales', []) or [])
        shipments = cls._invoice_shipments(invoice)
        return {
            'id': invoice.id,
            'number': invoice.number or '',
            'party': invoice.party.rec_name,
            'invoice_date': invoice.invoice_date,
            'reference': invoice.reference or '',
            'sales': [{'id': s.id, 'number': s.number or str(s.id)}
                for s in sales],
            'shippers': [{'id': s.id, 'model': s.__name__,
                    'number': s.number or str(s.id),
                    'date': s.effective_date} for s in shipments],
            'type': 'Return' if invoice.total_amount < 0 else 'Shipment',
            'total_amount': invoice.total_amount,
            }

    @classmethod
    def sales_invoice_get(cls, invoice):
        "An invoice with all the tabs of the Invoicing window"
        cls._check_read('account.invoice')
        pool = Pool()
        Invoice = pool.get('account.invoice')
        Charge = pool.get('nline.sale_charge')
        invoice = Invoice(invoice)
        sales = list(getattr(invoice, 'sales', []) or [])
        sale = sales[0] if sales else None
        charge_lines = {l.origin.id: l for l in invoice.lines
            if l.origin and l.origin.__name__ == 'nline.sale_charge'}
        lines = []
        for number, line in enumerate(invoice.lines, 1):
            if line.type != 'line' or line.id in [
                    l.id for l in charge_lines.values()]:
                continue
            origin = line.origin if line.origin and \
                line.origin.__name__ == 'sale.line' else None
            lines.append({
                    'id': line.id,
                    'line_no': number,
                    'product': _ref(line.product),
                    'description': line.description or '',
                    'quantity': line.quantity,
                    'unit': line.unit.rec_name if line.unit else '',
                    'unit_price': line.unit_price,
                    'trade_discount': origin.trade_discount
                    if origin else Decimal(0),
                    'amount': line.amount,
                    'sale': origin.sale.number if origin else '',
                    })
        charges = []
        for charge in Charge.browse(list(charge_lines)):
            data = cls._charge(charge)
            data['amount'] = charge_lines[charge.id].unit_price
            charges.append(data)
        shipments = cls._invoice_shipments(invoice)
        ship_to = sale.shipment_address if sale else None
        result = {
            'id': invoice.id,
            'number': invoice.number or '',
            'state': invoice.state,
            'type': 'Return' if invoice.total_amount < 0 else 'Shipment',
            'party': _ref(invoice.party),
            'invoice_date': invoice.invoice_date,
            'reference': invoice.reference or '',
            'description': invoice.description or '',
            'payment_term': _ref(invoice.payment_term),
            'comment': invoice.comment or '',
            'sales': [{'id': s.id, 'number': s.number or str(s.id),
                    'sale_date': s.sale_date} for s in sales],
            'shippers': [{'id': s.id, 'model': s.__name__,
                    'number': s.number or str(s.id),
                    'date': s.effective_date} for s in shipments],
            'bill_to': _address(invoice.invoice_address, invoice.party),
            'ship_to': _address(ship_to, invoice.party),
            'lines': lines,
            'charges': charges,
            'taxes': [{
                    'description': t.description or '',
                    'account': t.account.rec_name if t.account else '',
                    'percent': (t.tax.rate * 100) if t.tax and
                    t.tax.type == 'percentage' else None,
                    'base': t.base,
                    'amount': t.amount,
                    } for t in invoice.taxes],
            'untaxed_amount': invoice.untaxed_amount,
            'tax_amount': invoice.tax_amount,
            'charges_amount': sum((c['amount'] or Decimal(0)
                    for c in charges), Decimal(0)),
            'total_amount': invoice.total_amount,
            'amount_to_pay': invoice.amount_to_pay,
            'receivable': invoice.account.rec_name if invoice.account
            else '',
            }
        for name in ['fob_point', 'ship_via', 'js_carrier', 'tax_group',
                'discount_class', 'freight_terms']:
            value = getattr(sale, name, None) if sale else None
            result[name] = value if name == 'freight_terms' else _ref(value)
        return result

    @classmethod
    def sales_invoice_save(cls, values):
        """Change a draft invoice of the Invoicing window: values id,
        invoice_date, reference, description, comment (Specs),
        payment_term, lines [{id, quantity, unit_price, description}],
        charges [{id, service_charge, description, amount, tax_group}]"""
        pool = Pool()
        Invoice = pool.get('account.invoice')
        InvoiceLine = pool.get('account.invoice.line')
        Charge = pool.get('nline.sale_charge')
        cls._check_write('account.invoice')
        invoice = Invoice(values['id'])
        if invoice.state != 'draft':
            raise ValidationError(gettext(
                    'nline_js_sales.msg_invoice_not_draft',
                    invoice=invoice.rec_name))
        write = {}
        for name in ['reference', 'description', 'comment']:
            if name in values:
                write[name] = values[name] or None
        if 'invoice_date' in values:
            write['invoice_date'] = _date(values['invoice_date']) or None
        if values.get('payment_term'):
            value = values['payment_term']
            write['payment_term'] = value.get('id') if isinstance(value,
                dict) else value
        if write:
            Invoice.write([invoice], write)
        by_id = {l.id: l for l in invoice.lines}
        to_write = []
        for data in values.get('lines') or []:
            line = by_id.get(data.get('id'))
            if not line:
                continue
            line_write = {}
            if data.get('quantity') not in (None, ''):
                line_write['quantity'] = float(data['quantity'])
            if data.get('unit_price') not in (None, ''):
                line_write['unit_price'] = _decimal(data['unit_price'])
            if 'description' in data:
                line_write['description'] = data['description'] or None
            if line_write:
                to_write.extend([[line], line_write])
        if to_write:
            InvoiceLine.write(*to_write)

        if values.get('charges') is not None:
            sales = list(getattr(invoice, 'sales', []) or [])
            charge_lines = {l.origin.id: l for l in invoice.lines
                if l.origin and l.origin.__name__ == 'nline.sale_charge'}
            kept = set()
            for data in values['charges']:
                if data.get('id') in charge_lines:
                    kept.add(data['id'])
                    line = charge_lines[data['id']]
                    if 'amount' in data:
                        InvoiceLine.write([line], {
                                'unit_price': _decimal(data['amount'])})
                        Charge.write([Charge(data['id'])], {
                                'amount': _decimal(data['amount'])})
                    continue
                if not data.get('service_charge') or not sales:
                    continue
                service = pool.get('nline.service_charge')(
                    data['service_charge']['id']
                    if isinstance(data['service_charge'], dict)
                    else data['service_charge'])
                group = data.get('tax_group')
                if isinstance(group, dict):
                    group = group.get('id')
                charge, = Charge.create([{
                            'sale': sales[0].id,
                            'service_charge': service.id,
                            'description': data.get('description')
                            or service.description,
                            'amount': _decimal(data.get('amount')
                                if data.get('amount') not in (None, '')
                                else service.amount),
                            'tax_group': group,
                            'account': service.account.id
                            if service.account else None,
                            'apply': True,
                            }])
                charge.get_invoice_line_values(invoice).save()
                kept.add(charge.id)
            removed = [l for i, l in charge_lines.items() if i not in kept]
            if removed:
                InvoiceLine.delete(removed)
                # Not applied any more: it waits for the next invoice
                Charge.write([Charge(i) for i in charge_lines
                        if i not in kept], {'apply': False})
        Invoice.update_taxes([Invoice(invoice.id)])
        return cls.sales_invoice_get(invoice.id)

    @classmethod
    def sales_credit_memo(cls, invoice):
        """Issue a credit memo for a posted invoice (a draft to check and
        post on the Invoicing window)"""
        cls._check_create('account.invoice')
        pool = Pool()
        Invoice = pool.get('account.invoice')
        invoice = Invoice(invoice)
        if invoice.type != 'out' or invoice.state not in {'posted', 'paid'}:
            raise ValidationError(gettext(
                    'nline_js_sales.msg_credit_memo_posted',
                    invoice=invoice.rec_name))
        credit, = Invoice.credit([invoice])
        return cls.sales_invoice_get(credit.id)
