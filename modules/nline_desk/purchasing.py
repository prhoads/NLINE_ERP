# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""N-Line screens: Jobshop purchasing (UI upgrade phase 4)

The Jobshop Purchase Order window (lines linked to the work orders they
supply), Receiving (a receiver of the open purchase lines, partial
quantities kept on order) and returns to the supplier.
"""
import datetime as dt

from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .desk import _date, _decimal, accept_warnings


class DeskPurchasing(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['purchase_order_save', 'receive_items',
                'return_items']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['purchase_order_get', 'open_receipts',
                'received_items']:
            cls.__rpc__[name] = RPC()

    # ---- Purchase orders -------------------------------------------------

    @classmethod
    def purchase_order_get(cls, purchase):
        "Return a purchase order as the PO window shows it"
        cls._check_read('purchase.purchase')
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        try:
            Work = pool.get('production.work')
        except KeyError:
            Work = None
        purchase = Purchase(purchase)
        lines = []
        for line in purchase.lines:
            if line.type != 'line':
                continue
            received = sum(m.quantity for m in line.moves
                if m.state == 'done')
            links = []
            if Work and 'purchase_line' in Work._fields:
                for work in Work.search([('purchase_line', '=', line.id)]):
                    links.append({
                            'id': work.production.id,
                            'number': work.production.number
                            or str(work.production.id),
                            'operation': work.rec_name,
                            'state': work.production.state,
                            })
            lines.append({
                    'id': line.id,
                    'product': ({'id': line.product.id,
                            'rec_name': line.product.rec_name}
                        if line.product else None),
                    'description': line.description or '',
                    'quantity': line.quantity,
                    'received': received,
                    'unit': line.unit.rec_name if line.unit else '',
                    'unit_price': line.unit_price,
                    'amount': line.amount,
                    'delivery_date': getattr(line, 'delivery_date', None),
                    'links': links,
                    })
        return {
            'id': purchase.id,
            'number': purchase.number or '',
            'state': purchase.state,
            'party': {'id': purchase.party.id,
                'rec_name': purchase.party.rec_name},
            'purchase_date': purchase.purchase_date,
            'reference': purchase.reference or '',
            'description': purchase.description or '',
            'payment_term': purchase.payment_term.id
            if purchase.payment_term else None,
            'shipment_state': purchase.shipment_state,
            'invoice_state': purchase.invoice_state,
            'untaxed_amount': purchase.untaxed_amount,
            'tax_amount': purchase.tax_amount,
            'total_amount': purchase.total_amount,
            'lines': lines,
            }

    @classmethod
    def purchase_order_save(cls, values):
        """Create or change a draft purchase order
        values: id, party, purchase_date, reference, description,
        payment_term, lines (id, product, description, quantity,
        unit_price)"""
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        Line = pool.get('purchase.line')
        Party = pool.get('party.party')
        Product = pool.get('product.product')
        PaymentTerm = pool.get('account.invoice.payment_term')
        if values.get('id'):
            cls._check_create('purchase.line')
            purchase = Purchase(values['id'])
            if purchase.state != 'draft':
                raise ValidationError(gettext(
                        'nline_desk.msg_purchase_not_draft',
                        purchase=purchase.rec_name))
        else:
            cls._check_create('purchase.purchase')
            purchase = Purchase(company=cls._company())
        purchase.party = Party(values['party'])
        purchase.on_change_party()
        if values.get('purchase_date'):
            purchase.purchase_date = _date(values['purchase_date'])
        purchase.reference = values.get('reference') or None
        purchase.description = values.get('description') or None
        if values.get('payment_term'):
            purchase.payment_term = PaymentTerm(values['payment_term'])
        existing = {l.id: l for l in getattr(purchase, 'lines', []) or []
            if l.id and l.id > 0}
        lines, kept = [], set()
        for sequence, data in enumerate(values.get('lines', []), 1):
            if data.get('id') in existing:
                line = existing[data['id']]
                kept.add(line.id)
            else:
                line = Line(purchase=purchase, type='line')
            line.sequence = sequence
            product = Product(data['product']) if data.get('product') \
                else None
            if product and getattr(line, 'product', None) != product:
                line.product = product
                line.quantity = float(data.get('quantity') or 1)
                line.on_change_product()
            line.quantity = float(data.get('quantity') or 1)
            if product:
                line.on_change_quantity()
            if data.get('unit_price') not in (None, ''):
                line.unit_price = _decimal(data['unit_price'])
            if data.get('description'):
                line.description = data['description']
            lines.append(line)
        purchase.lines = lines
        purchase.save()
        # The user's PO limit (module nline_role)
        Purchase.nline_check_limit([Purchase(purchase.id)])
        to_delete = [l for i, l in existing.items() if i not in kept]
        if to_delete:
            Line.delete(to_delete)
        return cls.purchase_order_get(purchase.id)

    # ---- Receiving -------------------------------------------------------

    @classmethod
    def open_receipts(cls, supplier=None):
        "Return the purchase lines still to receive (their incoming moves)"
        cls._check_read('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        PurchaseLine = pool.get('purchase.line')
        domain = [
            ('origin', 'like', 'purchase.line,%'),
            ('state', '=', 'draft'),
            ('shipment', '=', None),
            ('from_location.type', '=', 'supplier'),
            ]
        result = []
        for move in Move.search(domain, order=[('planned_date', 'ASC'),
                    ('id', 'ASC')]):
            line = move.origin
            if not isinstance(line, PurchaseLine):
                continue
            purchase = line.purchase
            if supplier and purchase.party.id != supplier:
                continue
            result.append({
                    'move': move.id,
                    'purchase': purchase.id,
                    'number': purchase.number or str(purchase.id),
                    'supplier': purchase.party.id,
                    'supplier_name': purchase.party.rec_name,
                    'product': move.product.rec_name,
                    'quantity': move.quantity,
                    'unit': move.unit.rec_name,
                    'planned_date': move.planned_date,
                    })
        return result

    @classmethod
    @accept_warnings
    def receive_items(cls, values):
        """Receive the quantities of open purchase lines into the warehouse
        (a supplier shipment received and done); the rest stays on order
        values: date, reference, lines (move, quantity)"""
        cls._check_create('stock.shipment.in')
        pool = Pool()
        Move = pool.get('stock.move')
        Shipment = pool.get('stock.shipment.in')
        Purchase = pool.get('purchase.purchase')
        lines = [l for l in values['lines'] if float(l.get('quantity') or 0)]
        if not lines:
            raise ValidationError(gettext('nline_desk.msg_nothing_received'))
        moves = Move.browse([l['move'] for l in lines])
        suppliers = {m.origin.purchase.party for m in moves}
        warehouses = {m.origin.purchase.warehouse for m in moves}
        if len(suppliers) != 1 or len(warehouses) != 1:
            raise ValidationError(gettext(
                    'nline_desk.msg_receive_one_supplier'))
        date = _date(values.get('date'))
        purchases = set()
        for move, data in zip(moves, lines):
            quantity = float(data['quantity'])
            if quantity > move.quantity:
                quantity = move.quantity
            move.quantity = quantity
            if date:
                move.effective_date = date
            purchases.add(move.origin.purchase)
        Move.save(moves)
        shipment = Shipment(
            company=cls._company(),
            supplier=suppliers.pop(),
            warehouse=warehouses.pop(),
            reference=values.get('reference'),
            effective_date=date,
            )
        shipment.on_change_warehouse()
        shipment.save()
        Shipment.write([shipment], {
                'incoming_moves': [('add', [m.id for m in moves])],
                })
        Shipment.receive([shipment])
        shipment = Shipment(shipment.id)
        if shipment.state != 'done':
            Shipment.done([shipment])
        # The rest of a partial line back on order
        Purchase.process(list(purchases))
        return {'id': shipment.id, 'number': shipment.number,
            'lines': len(moves)}

    @classmethod
    def received_items(cls, supplier=None):
        "Return the received purchase moves of the last 90 days"
        cls._check_read('stock.move')
        pool = Pool()
        Move = pool.get('stock.move')
        Date = pool.get('ir.date')
        PurchaseLine = pool.get('purchase.line')
        domain = [
            ('origin', 'like', 'purchase.line,%'),
            ('state', '=', 'done'),
            ('from_location.type', '=', 'supplier'),
            ('effective_date', '>=', Date.today() - dt.timedelta(days=90)),
            ]
        result = []
        for move in Move.search(domain, order=[('effective_date', 'DESC'),
                    ('id', 'DESC')]):
            line = move.origin
            if not isinstance(line, PurchaseLine):
                continue
            if supplier and line.purchase.party.id != supplier:
                continue
            result.append({
                    'move': move.id,
                    'number': line.purchase.number or '',
                    'supplier': line.purchase.party.id,
                    'supplier_name': line.purchase.party.rec_name,
                    'product': move.product.rec_name,
                    'quantity': move.quantity,
                    'unit': move.unit.rec_name,
                    'date': move.effective_date,
                    'shipment': move.shipment.rec_name if move.shipment
                    else '',
                    })
        return result

    @classmethod
    @accept_warnings
    def return_items(cls, values):
        """Return received goods to the supplier (a supplier return
        shipment done)
        values: date, reference, lines (move: the received move,
        quantity)"""
        cls._check_create('stock.shipment.in.return')
        pool = Pool()
        Move = pool.get('stock.move')
        Return = pool.get('stock.shipment.in.return')
        lines = [l for l in values['lines'] if float(l.get('quantity') or 0)]
        if not lines:
            raise ValidationError(gettext('nline_desk.msg_nothing_received'))
        received = Move.browse([l['move'] for l in lines])
        suppliers = {m.origin.purchase.party for m in received}
        if len(suppliers) != 1:
            raise ValidationError(gettext(
                    'nline_desk.msg_receive_one_supplier'))
        supplier = suppliers.pop()
        # The goods went on from the input zone to the storage
        first = received[0]
        storage = (first.shipment.warehouse_storage
            if getattr(first.shipment, 'warehouse_storage', None)
            else first.to_location)
        moves = []
        for move, data in zip(received, lines):
            moves.append(Move(
                    product=move.product,
                    unit=move.unit,
                    quantity=min(float(data['quantity']), move.quantity),
                    from_location=storage,
                    to_location=move.from_location,
                    company=move.company,
                    unit_price=move.unit_price,
                    currency=move.currency,
                    planned_date=_date(values.get('date')),
                    ))
        shipment = Return(
            company=cls._company(),
            supplier=supplier,
            from_location=storage,
            to_location=received[0].from_location,
            reference=values.get('reference'),
            moves=moves,
            )
        shipment.save()
        Return.wait([shipment])
        with Transaction().set_context(_skip_warnings=True):
            Return.assign_try([shipment])
        shipment = Return(shipment.id)
        if shipment.state == 'assigned':
            Return.done([shipment])
        shipment = Return(shipment.id)
        return {'id': shipment.id, 'number': shipment.number,
            'state': shipment.state}
