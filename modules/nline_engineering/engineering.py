# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from trytond.i18n import gettext
from trytond.model import fields
from trytond.model.exceptions import ValidationError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction


def _revision(value):
    "Normalize a revision code: stripped and upper case, None when empty"
    value = (value or '').strip().upper()
    return value or None


class Template(metaclass=PoolMeta):
    __name__ = 'product.template'

    engineering_revision = fields.Char(
        "Current Revision",
        states={
            'invisible': ~Eval('producible'),
            },
        help="The engineering revision built by default "
        "(Jobshop part ENG_ID).\n"
        "The BOM of this revision is listed first on the product.")
    drawing_number = fields.Char("Drawing")
    drawing_revision = fields.Char("Drawing Revision")

    @classmethod
    def create(cls, vlist):
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            if 'engineering_revision' in values:
                values['engineering_revision'] = _revision(
                    values['engineering_revision'])
        templates = super().create(vlist)
        cls._sequence_boms(templates)
        return templates

    @classmethod
    def write(cls, *args):
        actions = iter(args)
        args = []
        to_order = []
        for templates, values in zip(actions, actions):
            if 'engineering_revision' in values:
                values = values.copy()
                values['engineering_revision'] = _revision(
                    values['engineering_revision'])
                to_order.extend(templates)
            args.extend((templates, values))
        super().write(*args)
        cls._sequence_boms(to_order)

    @classmethod
    def _sequence_boms(cls, templates):
        pool = Pool()
        Product = pool.get('product.product')
        products = [p for t in templates for p in t.products]
        if products:
            Product.sequence_boms(products)


class Product(metaclass=PoolMeta):
    __name__ = 'product.product'

    current_bom = fields.Function(fields.Many2One(
            'production.bom', "Current BOM",
            states={
                'invisible': ~Eval('producible'),
                }),
        'get_current_bom')

    def get_bom(self, revision=None):
        "Return the product BOM link of the revision (default: current)"
        pinned = _revision(revision)
        wanted = pinned or self.engineering_revision
        for product_bom in self.boms:
            if wanted and product_bom.bom.revision == wanted:
                return product_bom
        # Without a pinned revision the first BOM is the default one
        if not pinned and self.boms:
            return self.boms[0]

    def get_current_bom(self, name):
        product_bom = self.get_bom()
        return product_bom.bom.id if product_bom else None

    @classmethod
    def sequence_boms(cls, products):
        """Sequence the BOMs of the products: current revision first then the
        other revisions from the latest"""
        pool = Pool()
        ProductBom = pool.get('product.product-production.bom')
        to_save = []
        for product in products:
            current = product.engineering_revision

            def key(product_bom):
                revision = product_bom.bom.revision or ''
                return (
                    revision != current if current else False,
                    # Latest revision first: longer codes (AA) after Z
                    -len(revision), [-ord(c) for c in revision])
            for sequence, product_bom in enumerate(
                    sorted(product.boms, key=key), 1):
                if product_bom.sequence != sequence * 10:
                    product_bom.sequence = sequence * 10
                    to_save.append(product_bom)
        if to_save:
            with Transaction().set_context(_nline_ordering_boms=True):
                ProductBom.save(to_save)


class ProductBom(metaclass=PoolMeta):
    __name__ = 'product.product-production.bom'

    revision = fields.Function(
        fields.Char("Revision"), 'on_change_with_revision')

    @fields.depends('bom')
    def on_change_with_revision(self, name=None):
        return self.bom.revision if self.bom else None

    @classmethod
    def create(cls, vlist):
        product_boms = super().create(vlist)
        cls._sequence_products(product_boms)
        return product_boms

    @classmethod
    def write(cls, *args):
        super().write(*args)
        cls._sequence_products(sum(args[0:None:2], []))

    @classmethod
    def _sequence_products(cls, product_boms):
        pool = Pool()
        Product = pool.get('product.product')
        if Transaction().context.get('_nline_ordering_boms'):
            return
        products = {pb.product for pb in product_boms}
        if products:
            Product.sequence_boms(Product.browse(products))


class BOM(metaclass=PoolMeta):
    __name__ = 'production.bom'

    revision = fields.Char(
        "Revision",
        help="The engineering revision of the master (Jobshop ENG_ID).")
    drawing_number = fields.Char("Drawing")
    drawing_revision = fields.Char("Drawing Revision")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.inputs.order = [
            ('operation', 'ASC'),
            ('piece', 'ASC'),
            ('id', 'ASC'),
            ]

    def get_rec_name(self, name):
        if self.revision:
            return '%s Rev %s' % (self.name, self.revision)
        return self.name

    @classmethod
    def search_rec_name(cls, name, clause):
        return ['OR',
            ('name',) + tuple(clause[1:]),
            ('revision',) + tuple(clause[1:]),
            ]

    @classmethod
    def create(cls, vlist):
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            if 'revision' in values:
                values['revision'] = _revision(values['revision'])
        return super().create(vlist)

    @classmethod
    def write(cls, *args):
        pool = Pool()
        ProductBom = pool.get('product.product-production.bom')
        actions = iter(args)
        args = []
        reordered = []
        for boms, values in zip(actions, actions):
            if 'revision' in values:
                values = values.copy()
                values['revision'] = _revision(values['revision'])
                reordered.extend(boms)
            args.extend((boms, values))
        super().write(*args)
        if reordered:
            ProductBom._sequence_products(ProductBom.search([
                        ('bom', 'in', [b.id for b in reordered]),
                        ]))

    @classmethod
    def validate(cls, boms):
        super().validate(boms)
        for bom in boms:
            bom.check_revision_unique()

    def check_revision_unique(self):
        "Check that a product has only one BOM per revision"
        if not self.revision:
            return
        for output in self.outputs:
            others = self.search([
                    ('id', '!=', self.id),
                    ('revision', '=', self.revision),
                    ('outputs.product', '=', output.product.id),
                    ], limit=1)
            if others:
                other, = others
                raise ValidationError(gettext(
                        'nline_engineering.msg_bom_revision_unique',
                        product=output.product.rec_name,
                        revision=self.revision,
                        bom=other.rec_name))

    @classmethod
    def copy(cls, boms, default=None):
        default = default.copy() if default is not None else {}
        # A copy is the start of a new revision
        default.setdefault('revision', None)
        return super().copy(boms, default=default)


class BOMInput(metaclass=PoolMeta):
    __name__ = 'production.bom.input'

    operation = fields.Integer(
        "Operation",
        help="The operation sequence the material is used at "
        "(Jobshop SEQ_NO).")
    piece = fields.Integer(
        "Piece", help="The piece number on the operation (Jobshop PIECE_NO).")
    component_revision = fields.Char(
        "Component Revision",
        help="The revision of the component to use "
        "(Jobshop SUBORD_ENG_ID).\n"
        "Leave empty to use the current revision of the component.")
    component_bom = fields.Function(fields.Many2One(
            'production.bom', "Component BOM"),
        'get_component_bom')

    @classmethod
    def default_operation(cls):
        return 10

    @classmethod
    def create(cls, vlist):
        vlist = [v.copy() for v in vlist]
        for values in vlist:
            if 'component_revision' in values:
                values['component_revision'] = _revision(
                    values['component_revision'])
        return super().create(vlist)

    @classmethod
    def write(cls, *args):
        actions = iter(args)
        args = []
        for inputs, values in zip(actions, actions):
            if 'component_revision' in values:
                values = values.copy()
                values['component_revision'] = _revision(
                    values['component_revision'])
            args.extend((inputs, values))
        super().write(*args)

    def get_component_product_bom(self):
        "Return the product BOM link of the component at the pinned revision"
        if self.product:
            return self.product.get_bom(self.component_revision)

    def get_component_bom(self, name):
        product_bom = self.get_component_product_bom()
        return product_bom.bom.id if product_bom else None
