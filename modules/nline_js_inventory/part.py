# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The Jobshop part (INVENTORY_PART) on the Tryton product template

Jobshop's part fields Tryton has are reused: Part ID = template code,
Description = name, Stock U/M = default UoM, Fabricated = producible,
Purchased = purchasable, Unit Price = list price, Account Set = account
category, Engineering Master / Drawing ID / Rev = nline_engineering's fields.
The others are added here. A part location (INVENTORY_PART_LOCATION) and a
unit conversion (INVENTORY_UNITS_CONVERSION) are models of their own.
"""
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.model.exceptions import ValidationError
from trytond.modules.product import price_digits, round_price
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction

# Lot Tracked: a lot on every move of the part (stock_lot's lot_required)
LOT_ALL = ['supplier', 'customer', 'lost_found', 'storage', 'production']
USER_FIELDS = 10
COSTS = ['unit_material_cost', 'unit_labor_cost', 'unit_burden_cost',
    'unit_service_cost']


def on_hand(location_ids, product_ids, grouping=('product',),
        with_childs=True):
    """The quantities on hand today {(location, product[, lot]): qty} of
    the products in the locations (and their children)"""
    pool = Pool()
    Product = pool.get('product.product')
    Date = pool.get('ir.date')
    if not location_ids or not product_ids:
        return {}
    with Transaction().set_context(stock_date_end=Date.today(),
            forecast=False, stock_assign=False):
        return Product.products_by_location(
            list(location_ids), with_childs=with_childs, grouping=grouping,
            grouping_filter=(list(product_ids),))


class Template(metaclass=PoolMeta):
    __name__ = 'product.template'

    # ---- Part tab --------------------------------------------------------
    inactive = fields.Function(fields.Boolean(
            "Inactive",
            help="The part is kept but not used (Jobshop Inactive)."),
        'get_inactive', setter='set_inactive', searcher='search_inactive')
    stocked = fields.Boolean(
        "Stocked",
        help="Normally kept in stock: managed with an order point and a "
        "safety stock, listed with the stocked parts in Material Planning.")
    tool_or_fixture = fields.Boolean(
        "Tool/Fixture",
        help="A tool or fixture used to make other parts, issued to a work "
        "order and returned to stock.")
    auto_issue = fields.Boolean(
        "Auto Issue",
        help="Issued to work orders from the Issue From location.")
    lot_tracked = fields.Function(fields.Boolean(
            "Lot Tracked",
            help="Every receipt, issue, shipment and adjustment of the part "
            "needs a tracking number (lot).\n"
            "The part must have no stock on hand to change it."),
        'get_lot_tracked', setter='set_lot_tracked',
        searcher='search_lot_tracked')
    product_code = fields.Many2One(
        'nline.product_code', "Product Code", ondelete='RESTRICT')
    commodity_code = fields.Many2One(
        'nline.commodity_code', "Commodity Code", ondelete='RESTRICT')
    weight = fields.Float("Net Weight", digits=(16, 4))
    weight_uom = fields.Many2One(
        'product.uom', "Weight U/M", ondelete='RESTRICT')
    ship_dimensions = fields.Char(
        "Ship Dimensions", help="Printed on the packing lists.")
    drawing_file = fields.Char(
        "Drawing File", help="The path of the drawing file.")
    mfg_name = fields.Char("Manufacturer")
    mfg_part_id = fields.Char("Manufacturer Part ID")
    # ---- General tab -----------------------------------------------------
    primary_location = fields.Many2One(
        'stock.location', "Primary Location", ondelete='RESTRICT',
        domain=[('type', '=', 'storage')],
        help="The default location to receive, issue and ship the part.")
    issue_from_location = fields.Many2One(
        'stock.location', "Issue From Location", ondelete='RESTRICT',
        domain=[('type', '=', 'storage')],
        help="The location the part is normally issued from.")
    preferred_supplier = fields.Function(fields.Many2One(
            'party.party', "Preferred Supplier",
            help="The first supplier of the part."),
        'get_preferred_supplier', setter='set_preferred_supplier')
    lead_time_days = fields.Integer(
        "Leadtime (days)",
        help="The calendar days needed to obtain the part.")
    order_point = fields.Float(
        "Order Point", digits=(16, 4),
        help="Replenish when the stock on hand is at or below this quantity.")
    safety_stock = fields.Float(
        "Safety Stock Qty", digits=(16, 4),
        help="The minimum stock to keep.")
    minimum_order_qty = fields.Float("Minimum Order Qty", digits=(16, 4))
    maximum_order_qty = fields.Float("Maximum Order Qty", digits=(16, 4))
    multiple_order_qty = fields.Float("Order in Multiples Of", digits=(16, 4))
    maximum_stock_qty = fields.Float("Maximum Stock Qty", digits=(16, 4))
    piece_tracked = fields.Boolean(
        "Part is Piece Tracked",
        help="The stock is tracked by dimensioned pieces.")
    length_required = fields.Boolean("Length")
    width_required = fields.Boolean("Width")
    height_required = fields.Boolean("Height")
    dimensions_uom = fields.Many2One(
        'product.uom', "Dimensions U/M", ondelete='RESTRICT')
    usage_uom = fields.Many2One(
        'product.uom', "Usage U/M", ondelete='RESTRICT',
        help="The default unit of the part on material cards.")
    # User defined fields 1 to 10 (labels: nline.desk.configuration)
    user_0 = fields.Char("User Defined 1")
    user_1 = fields.Char("User Defined 2")
    user_2 = fields.Char("User Defined 3")
    user_3 = fields.Char("User Defined 4")
    user_4 = fields.Char("User Defined 5")
    user_5 = fields.Char("User Defined 6")
    user_6 = fields.Char("User Defined 7")
    user_7 = fields.Char("User Defined 8")
    user_8 = fields.Char("User Defined 9")
    user_9 = fields.Char("User Defined 10")
    # ---- Costing tab -----------------------------------------------------
    unit_material_cost = fields.Numeric(
        "Unit Material Cost", digits=price_digits)
    unit_labor_cost = fields.Numeric("Unit Labor Cost", digits=price_digits)
    unit_burden_cost = fields.Numeric("Unit Burden Cost", digits=price_digits)
    unit_service_cost = fields.Numeric(
        "Unit Service Cost", digits=price_digits)
    fixed_cost = fields.Numeric(
        "Fixed Cost", digits=price_digits,
        help="Added once to every order of the part.")
    unit_cost = fields.Function(fields.Numeric(
            "Unit Cost", digits=price_digits,
            help="Material + labor + burden + service."),
        'get_unit_cost')
    # ---- Specs, Locations, Unit Conversions tabs ------------------------
    specifications = fields.Text("Specifications")
    part_locations = fields.One2Many(
        'nline.js.part_location', 'template', "Locations")
    unit_conversions = fields.One2Many(
        'nline.js.unit_conversion', 'template', "Unit Conversions")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in ['stocked', 'tool_or_fixture', 'auto_issue',
                'piece_tracked', 'length_required', 'width_required',
                'height_required']:
            getattr(cls, name).states = {
                'invisible': ~Eval('type').in_(['goods', 'assets']),
                }

    @classmethod
    def default_stocked(cls):
        return False

    @classmethod
    def default_tool_or_fixture(cls):
        return False

    @classmethod
    def default_auto_issue(cls):
        return False

    @classmethod
    def default_piece_tracked(cls):
        return False

    @classmethod
    def default_minimum_order_qty(cls):
        return 1

    @classmethod
    def default_multiple_order_qty(cls):
        return 1

    @classmethod
    def default_safety_stock(cls):
        return 0

    def get_inactive(self, name):
        return not self.active

    @classmethod
    def set_inactive(cls, templates, name, value):
        cls.write(templates, {'active': not value})

    @classmethod
    def search_inactive(cls, name, clause):
        _, operator, value = clause
        if operator in ('=', '!='):
            active = not value if operator == '=' else bool(value)
            return [('active', '=', active)]
        return []

    def get_lot_tracked(self, name):
        return bool(self.lot_required) and set(LOT_ALL) <= set(
            self.lot_required)

    @classmethod
    def set_lot_tracked(cls, templates, name, value):
        pool = Pool()
        Location = pool.get('stock.location')
        to_change = [t for t in templates if t.lot_tracked != bool(value)]
        if not to_change:
            return
        # Jobshop: only a part with nothing on hand changes
        warehouses = Location.search([('type', '=', 'warehouse')])
        quantities = on_hand([w.id for w in warehouses],
            [p.id for t in to_change for p in t.products])
        for template in to_change:
            if any(quantities.get((w.id, p.id))
                    for w in warehouses for p in template.products):
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_lot_tracked_on_hand',
                        part=template.rec_name))
        cls.write(to_change, {'lot_required': LOT_ALL if value else []})

    @classmethod
    def search_lot_tracked(cls, name, clause):
        _, operator, value = clause
        positive = (operator == '=') == bool(value)
        domain = [('lot_required', 'in', ['storage'])]
        return domain if positive else ['NOT', domain]

    def get_preferred_supplier(self, name):
        for supplier in getattr(self, 'product_suppliers', []):
            if supplier.active and not supplier.product:
                return supplier.party.id

    @classmethod
    def set_preferred_supplier(cls, templates, name, value):
        pool = Pool()
        ProductSupplier = pool.get('purchase.product_supplier')
        if not value:
            return
        to_save = []
        for template in templates:
            suppliers = [s for s in template.product_suppliers
                if not s.product]
            if suppliers and suppliers[0].party.id == value:
                continue
            found = [s for s in suppliers if s.party.id == value]
            first = min([s.sequence for s in suppliers
                    if s.sequence is not None] or [10])
            supplier = found[0] if found else ProductSupplier(
                template=template, party=value)
            # First in sequence order: the preferred one
            supplier.sequence = first - 1
            to_save.append(supplier)
        if to_save:
            ProductSupplier.save(to_save)

    def get_unit_cost(self, name):
        return round_price(
            sum((getattr(self, n) or Decimal(0)) for n in COSTS))

    @classmethod
    def validate(cls, templates):
        super().validate(templates)
        cls.check_part_id(templates)

    @classmethod
    def check_part_id(cls, templates):
        "Jobshop: a Part ID is unique"
        codes = {t.code for t in templates if t.code}
        if not codes:
            return
        with Transaction().set_context(active_test=False):
            others = cls.search([('code', 'in', list(codes))])
        seen = {}
        for template in others:
            if template.code in seen:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_part_id_unique',
                        part=template.code))
            seen[template.code] = template

    @classmethod
    def copy(cls, templates, default=None):
        default = default.copy() if default is not None else {}
        # The stock locations stay with the original part
        default.setdefault('part_locations', None)
        return super().copy(templates, default=default)


class PartLocation(ModelSQL, ModelView):
    "Part Location"
    __name__ = 'nline.js.part_location'

    template = fields.Many2One(
        'product.template', "Part", required=True, ondelete='CASCADE')
    location = fields.Many2One(
        'stock.location', "Location ID", required=True, ondelete='CASCADE',
        domain=[('type', '=', 'storage')])
    location_name = fields.Function(
        fields.Char("Description"), 'get_location_name')
    hold = fields.Boolean(
        "Hold",
        help="The stock in this location is on hold (quarantine): not used "
        "by supply and demand.")
    quantity = fields.Function(
        fields.Float("Qty On Hand", digits=(16, 4)), 'get_quantity')
    primary = fields.Function(fields.Boolean("Primary"), 'get_flags')
    issue_from = fields.Function(fields.Boolean("Issue From"), 'get_flags')
    last_counted = fields.Date("Last Counted", readonly=True)

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('location_unique', Unique(t, t.template, t.location),
                'nline_js_inventory.msg_part_location_unique'),
            ]
        cls._order = [('template', 'ASC'), ('location', 'ASC')]

    @classmethod
    def default_hold(cls):
        return False

    def get_location_name(self, name):
        return self.location.name if self.location else None

    def get_flags(self, name):
        field = {'primary': 'primary_location',
            'issue_from': 'issue_from_location'}[name]
        return getattr(self.template, field) == self.location

    @classmethod
    def get_quantity(cls, part_locations, name):
        result = {p.id: 0.0 for p in part_locations}
        products = {pr.id: p.template for p in part_locations
            for pr in p.template.products}
        locations = list({p.location.id for p in part_locations})
        if not products or not locations:
            return result
        quantities = on_hand(locations, list(products))
        for part_location in part_locations:
            for (location, product), quantity in quantities.items():
                if (location == part_location.location.id
                        and products.get(product) == part_location.template):
                    result[part_location.id] += quantity
        return result

    def get_rec_name(self, name):
        return '%s @ %s' % (self.template.rec_name, self.location.rec_name)

    @classmethod
    def ensure(cls, pairs):
        "Create the part locations of (template, location) pairs if missing"
        pairs = {(int(t), int(l)) for t, l in pairs}
        if not pairs:
            return
        existing = set()
        for part_location in cls.search([
                    ('template', 'in', list({t for t, _ in pairs})),
                    ('location', 'in', list({l for _, l in pairs})),
                    ]):
            existing.add(
                (part_location.template.id, part_location.location.id))
        missing = pairs - existing
        if missing:
            cls.create([{'template': t, 'location': l}
                    for t, l in sorted(missing)])


class UnitConversion(ModelSQL, ModelView):
    """Unit Conversion

    Jobshop's conversion between two units of measure, for one part or (no
    part) for every part. Tryton converts only within a unit category: this
    converts across categories (a box of 10 each, pounds of a bar per inch);
    the reciprocal is implied."""
    __name__ = 'nline.js.unit_conversion'

    template = fields.Many2One(
        'product.template', "Part", ondelete='CASCADE',
        help="Empty: the conversion applies to every part.")
    from_uom = fields.Many2One(
        'product.uom', "From Unit ID", required=True, ondelete='CASCADE')
    from_name = fields.Function(
        fields.Char("From Description"), 'get_uom_name')
    to_uom = fields.Many2One(
        'product.uom', "To Unit ID", required=True, ondelete='CASCADE')
    to_name = fields.Function(fields.Char("To Description"), 'get_uom_name')
    factor = fields.Float(
        "Conversion", required=True, digits=(16, 8),
        help="The to-units per from-unit: from-units times this are "
        "to-units.")
    sentence = fields.Function(fields.Char("Means"), 'get_sentence')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('conversion_unique', Unique(t, t.template, t.from_uom, t.to_uom),
                'nline_js_inventory.msg_conversion_unique'),
            ]
        cls._order = [('template', 'ASC NULLS FIRST'), ('from_uom', 'ASC'),
            ('to_uom', 'ASC')]

    @classmethod
    def default_factor(cls):
        return 1.0

    def get_uom_name(self, name):
        uom = self.from_uom if name == 'from_name' else self.to_uom
        return uom.name if uom else None

    def get_sentence(self, name):
        if not self.from_uom or not self.to_uom:
            return ''
        return '1 %s = %s %s' % (self.from_uom.symbol,
            ('%.8f' % (self.factor or 0)).rstrip('0').rstrip('.'),
            self.to_uom.symbol)

    def get_rec_name(self, name):
        sentence = self.sentence
        if self.template:
            return '%s: %s' % (self.template.rec_name, sentence)
        return sentence

    @classmethod
    def validate(cls, conversions):
        super().validate(conversions)
        for conversion in conversions:
            if not conversion.factor or conversion.factor <= 0:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_conversion_factor',
                        conversion=conversion.rec_name))
            if conversion.from_uom == conversion.to_uom:
                raise ValidationError(gettext(
                        'nline_js_inventory.msg_conversion_same_unit',
                        conversion=conversion.rec_name))

    @classmethod
    def factor_between(cls, from_uom, to_uom, template=None):
        """The factor from from_uom to to_uom, None when Jobshop could not
        convert: same unit, Tryton's category, the part's conversions then
        the general ones (direct or reciprocal)"""
        pool = Pool()
        Uom = pool.get('product.uom')
        from_uom, to_uom = Uom(int(from_uom)), Uom(int(to_uom))
        if from_uom == to_uom:
            return 1.0
        if from_uom.category == to_uom.category:
            return Uom.compute_qty(from_uom, 1.0, to_uom, round=False)
        template_id = int(template) if template else None
        for part in ([template_id] if template_id else []) + [None]:
            for conversion in cls.search([
                        ('template', '=', part),
                        ['OR', [
                                ('from_uom', '=', from_uom.id),
                                ('to_uom', '=', to_uom.id),
                                ], [
                                ('from_uom', '=', to_uom.id),
                                ('to_uom', '=', from_uom.id),
                                ]],
                        ], limit=1):
                if conversion.from_uom == from_uom:
                    return conversion.factor
                return 1.0 / conversion.factor
        # Through the category of each unit: a conversion between any
        # units of the two categories
        for part in ([template_id] if template_id else []) + [None]:
            for conversion in cls.search([
                        ('template', '=', part),
                        ['OR', [
                                ('from_uom.category', '=', from_uom.category.id),
                                ('to_uom.category', '=', to_uom.category.id),
                                ], [
                                ('from_uom.category', '=', to_uom.category.id),
                                ('to_uom.category', '=', from_uom.category.id),
                                ]],
                        ], limit=1):
                if conversion.from_uom.category == from_uom.category:
                    start, end = conversion.from_uom, conversion.to_uom
                    factor = conversion.factor
                else:
                    start, end = conversion.to_uom, conversion.from_uom
                    factor = 1.0 / conversion.factor
                return (Uom.compute_qty(from_uom, 1.0, start, round=False)
                    * factor
                    * Uom.compute_qty(end, 1.0, to_uom, round=False))

    @classmethod
    def convert(cls, quantity, from_uom, to_uom, template=None, round=True):
        "The quantity in to_uom, None when no conversion is known"
        pool = Pool()
        Uom = pool.get('product.uom')
        factor = cls.factor_between(from_uom, to_uom, template)
        if factor is None or quantity is None:
            return None
        result = quantity * factor
        return Uom(int(to_uom)).round(result) if round else result


class Configuration(metaclass=PoolMeta):
    __name__ = 'nline.desk.configuration'

    part_user_labels = fields.Text(
        "Part User Defined Labels",
        help="The labels of the part's user defined fields, one per line "
        "(Jobshop System Settings, Inventory tab).")
