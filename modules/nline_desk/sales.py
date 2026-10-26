# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""N-Line screens: Jobshop order to cash (UI upgrade phase 3)

The Jobshop Customer Order window (header and lines, each line linked to the
work order that builds it), and the Parts window's information: where the
part is used, its stock transactions and its availability.
"""
from trytond.i18n import gettext
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

from .desk import _date, _decimal


class DeskSales(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['sale_order_save', 'sale_line_work_order']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in ['sale_order_get', 'part_info']:
            cls.__rpc__[name] = RPC()

    # ---- Customer orders -------------------------------------------------

    @classmethod
    def sale_order_get(cls, sale):
        "Return a sale order as the order window shows it"
        cls._check_read('sale.sale')
        Sale = Pool().get('sale.sale')
        sale = Sale(sale)
        lines = []
        for line in sale.lines:
            if line.type != 'line':
                continue
            productions = getattr(line, 'productions', []) or []
            coverages = getattr(line, 'job_coverages', []) or []
            links = [{'id': p.id, 'number': p.number or str(p.id),
                    'state': p.state} for p in productions]
            links += [{
                    'id': c.job.id,
                    'number': c.job.number or str(c.job.id),
                    'state': c.job.state,
                    'job': True,
                    } for c in coverages]
            lines.append({
                    'id': line.id,
                    'product': ({'id': line.product.id,
                            'rec_name': line.product.rec_name}
                        if line.product else None),
                    'description': line.description or '',
                    'quantity': line.quantity,
                    'unit': line.unit.rec_name if line.unit else '',
                    'unit_price': line.unit_price,
                    'amount': line.amount,
                    'shipping_date': line.shipping_date,
                    'links': links,
                    })
        return {
            'id': sale.id,
            'number': sale.number or '',
            'state': sale.state,
            'party': {'id': sale.party.id, 'rec_name': sale.party.rec_name},
            'sale_date': sale.sale_date,
            'shipping_date': sale.shipping_date,
            'reference': sale.reference or '',
            'description': sale.description or '',
            'payment_term': sale.payment_term.id if sale.payment_term
            else None,
            'shipment_address': ({'id': sale.shipment_address.id,
                    'rec_name': sale.shipment_address.rec_name}
                if sale.shipment_address else None),
            'shipment_state': sale.shipment_state,
            'invoice_state': sale.invoice_state,
            'untaxed_amount': sale.untaxed_amount,
            'tax_amount': sale.tax_amount,
            'total_amount': sale.total_amount,
            'lines': lines,
            }

    @classmethod
    def sale_order_save(cls, values):
        """Create or change a draft sale order
        values: id, party, sale_date, reference, description, payment_term,
        shipment_address, shipping_date (desired), lines (id, product,
        description, quantity, unit_price)"""
        pool = Pool()
        Sale = pool.get('sale.sale')
        Line = pool.get('sale.line')
        Party = pool.get('party.party')
        Product = pool.get('product.product')
        PaymentTerm = pool.get('account.invoice.payment_term')
        Address = pool.get('party.address')
        if values.get('id'):
            cls._check_create('sale.line')
            sale = Sale(values['id'])
            if sale.state != 'draft':
                raise ValidationError(gettext(
                        'nline_desk.msg_sale_not_draft', sale=sale.rec_name))
        else:
            cls._check_create('sale.sale')
            sale = Sale(company=cls._company())
        sale.party = Party(values['party'])
        sale.on_change_party()
        if values.get('sale_date'):
            sale.sale_date = _date(values['sale_date'])
        sale.reference = values.get('reference') or None
        sale.description = values.get('description') or None
        if values.get('payment_term'):
            sale.payment_term = PaymentTerm(values['payment_term'])
        sale.shipping_date = _date(values.get('shipping_date'))
        if values.get('shipment_address'):
            sale.shipment_address = Address(values['shipment_address'])
        existing = {l.id: l for l in getattr(sale, 'lines', []) or []
            if l.id and l.id > 0}
        lines, kept = [], set()
        for sequence, data in enumerate(values.get('lines', []), 1):
            if data.get('id') in existing:
                line = existing[data['id']]
                kept.add(line.id)
            else:
                line = Line(sale=sale, type='line')
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
        sale.lines = lines
        sale.save()
        to_delete = [l for i, l in existing.items() if i not in kept]
        if to_delete:
            Line.delete(to_delete)
        return cls.sale_order_get(sale.id)

    @classmethod
    def sale_line_work_order(cls, line):
        """Create the work order that builds a confirmed sale line (the
        Links tab's "New" of Jobshop), from the part's engineering master"""
        cls._check_create('production')
        pool = Pool()
        SaleLine = pool.get('sale.line')
        Production = pool.get('production')
        line = SaleLine(line)
        if line.sale.state not in {'confirmed', 'processing'}:
            raise ValidationError(gettext(
                    'nline_desk.msg_sale_not_confirmed',
                    sale=line.sale.rec_name))
        product = line.product
        if not product or not product.producible:
            raise ValidationError(gettext(
                    'nline_desk.msg_not_producible',
                    product=product.rec_name if product else ''))
        if getattr(line, 'productions', None):
            raise ValidationError(gettext(
                    'nline_desk.msg_line_has_work_order',
                    line=line.rec_name))
        get_bom = getattr(product, 'get_bom', None)
        product_bom = get_bom() if get_bom else (
            product.boms[0] if product.boms else None)
        warehouse = line.warehouse or line.sale.warehouse
        production = Production(
            company=line.sale.company,
            warehouse=warehouse,
            location=warehouse.production_location,
            product=product,
            bom=product_bom.bom if product_bom else None,
            unit=line.unit,
            quantity=line.quantity,
            planned_date=line.shipping_date,
            state='request',
            origin=line,
            )
        if product_bom and hasattr(Production, 'routing'):
            production.routing = product_bom.routing
        if hasattr(production, 'set_planned_start_date'):
            production.set_planned_start_date()
        production.save()
        Production.set_moves([production])
        return {
            'id': production.id,
            'number': production.number or str(production.id),
            }

    # ---- Parts -----------------------------------------------------------

    @classmethod
    def part_info(cls, template):
        """Return the part's variants with their stock, where the part is
        used (masters and open work orders) and its last stock moves"""
        cls._check_read('product.template')
        pool = Pool()
        Template = pool.get('product.template')
        Product = pool.get('product.product')
        Move = pool.get('stock.move')
        template = Template(template)
        products = list(template.products)
        result = {'stock': [], 'where_used': [], 'moves': []}
        with Transaction().set_context(
                locations=cls._warehouse_ids(), with_childs=True):
            for product in Product.browse(products):
                result['stock'].append({
                        'product': product.rec_name,
                        'on_hand': product.quantity,
                        'forecast': product.forecast_quantity,
                        'unit': template.default_uom.rec_name,
                        })
        try:
            Input = pool.get('production.bom.input')
            Card = pool.get('production.material_card')
        except KeyError:
            Input = Card = None
        ids = [p.id for p in products]
        if Input:
            for bom_input in Input.search([('product', 'in', ids)]):
                result['where_used'].append({
                        'kind': 'Master',
                        'model': 'production.bom',
                        'id': bom_input.bom.id,
                        'name': bom_input.bom.rec_name,
                        'quantity': bom_input.quantity,
                        'state': '',
                        })
        if Card:
            for card in Card.search([
                        ('product', 'in', ids),
                        ('production.state', 'not in', ['done',
                                'cancelled']),
                        ]):
                result['where_used'].append({
                        'kind': 'Work Order',
                        'model': 'production',
                        'id': card.production.id,
                        'name': card.production.rec_name,
                        'quantity': card.quantity,
                        'state': card.production.state,
                        })
        for move in Move.search([('product', 'in', ids)],
                order=[('effective_date', 'DESC'), ('planned_date', 'DESC'),
                    ('id', 'DESC')], limit=100):
            result['moves'].append({
                    'id': move.id,
                    'date': move.effective_date or move.planned_date,
                    'from': move.from_location.rec_name,
                    'to': move.to_location.rec_name,
                    'quantity': move.quantity,
                    'state': move.state,
                    'origin': move.origin.rec_name if move.origin else '',
                    'cost': move.cost_price if getattr(move, 'cost_price',
                        None) is not None else None,
                    })
        return result

    @classmethod
    def _warehouse_ids(cls):
        Location = Pool().get('stock.location')
        return [l.id for l in Location.search([('type', '=', 'warehouse')])]
