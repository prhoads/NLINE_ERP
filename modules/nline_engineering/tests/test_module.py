# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.model.exceptions import ValidationError
from trytond.modules.company.tests import CompanyTestMixin
from trytond.pool import Pool
from trytond.tests.test_tryton import ModuleTestCase, with_transaction


def create_part(name, revision=None, producible=True):
    pool = Pool()
    Template = pool.get('product.template')
    Uom = pool.get('product.uom')
    unit, = Uom.search([('name', '=', 'Unit')])
    template, = Template.create([{
                'name': name,
                'type': 'goods',
                'producible': producible,
                'default_uom': unit.id,
                'engineering_revision': revision,
                'products': [('create', [{}])],
                }])
    return template.products[0]


def create_bom(product, revision, inputs=()):
    pool = Pool()
    BOM = pool.get('production.bom')
    ProductBom = pool.get('product.product-production.bom')
    unit = product.default_uom
    bom, = BOM.create([{
                'name': product.template.name,
                'revision': revision,
                'outputs': [('create', [{
                                'product': product.id,
                                'unit': unit.id,
                                'quantity': 1,
                                }])],
                'inputs': [('create', [dict(
                                {'unit': i['product'].default_uom.id,
                                    'quantity': 1},
                                **dict(i, product=i['product'].id))
                            for i in inputs])],
                }])
    ProductBom.create([{'product': product.id, 'bom': bom.id}])
    return bom


class NlineEngineeringTestCase(CompanyTestMixin, ModuleTestCase):
    'Test N-Line Engineering module'
    module = 'nline_engineering'

    @with_transaction()
    def test_current_revision_first(self):
        "Test the BOM of the current revision is listed first"
        pool = Pool()
        Product = pool.get('product.product')
        Template = pool.get('product.template')

        part = create_part('323-02275', revision='b')
        self.assertEqual(part.engineering_revision, 'B')
        bom_a = create_bom(part, 'A')
        bom_c = create_bom(part, 'C')
        bom_b = create_bom(part, 'b')
        part = Product(part.id)

        self.assertEqual(bom_b.revision, 'B')
        self.assertEqual(bom_b.rec_name, '323-02275 Rev B')
        self.assertEqual([pb.bom for pb in part.boms], [bom_b, bom_c, bom_a])
        self.assertEqual(part.current_bom, bom_b)

        Template.write([part.template], {'engineering_revision': 'A'})
        part = Product(part.id)
        self.assertEqual([pb.bom for pb in part.boms], [bom_a, bom_c, bom_b])
        self.assertEqual(part.current_bom, bom_a)

    @with_transaction()
    def test_no_current_revision(self):
        "Test the latest revision is first without current revision"
        pool = Pool()
        Product = pool.get('product.product')

        part = create_part('332-01000')
        bom_a = create_bom(part, 'A')
        bom_b = create_bom(part, 'B')
        part = Product(part.id)
        self.assertEqual([pb.bom for pb in part.boms], [bom_b, bom_a])
        self.assertEqual(part.current_bom, bom_b)
        self.assertEqual(part.get_bom('A').bom, bom_a)
        self.assertIsNone(part.get_bom('Z'))

    @with_transaction()
    def test_revision_unique(self):
        "Test a product has only one BOM per revision"
        part = create_part('323-02275', revision='A')
        create_bom(part, 'A')
        with self.assertRaises(ValidationError):
            create_bom(part, 'a')

    @with_transaction()
    def test_bom_copy_clears_revision(self):
        "Test a copied BOM has no revision"
        pool = Pool()
        BOM = pool.get('production.bom')
        part = create_part('323-02275', revision='A')
        bom = create_bom(part, 'A')
        copy, = BOM.copy([bom])
        self.assertIsNone(copy.revision)

    @with_transaction()
    def test_input_pinned_revision(self):
        "Test the component BOM of an input follows the pinned revision"
        pool = Pool()
        BOM = pool.get('production.bom')
        Product = pool.get('product.product')

        body = create_part('332-02000', revision='B')
        body_a = create_bom(body, 'A')
        body_b = create_bom(body, 'B')
        seat = create_part('105-00010', producible=False)
        valve = create_part('VALVE-1', revision='A')
        bom = create_bom(valve, 'A', inputs=[
                {'product': Product(seat.id), 'operation': 20, 'piece': 1},
                {'product': Product(body.id), 'operation': 10, 'piece': 2,
                    'component_revision': ' a '},
                {'product': Product(body.id), 'operation': 10, 'piece': 1},
                ])
        bom = BOM(bom.id)

        self.assertEqual(
            [(i.operation, i.piece) for i in bom.inputs],
            [(10, 1), (10, 2), (20, 1)])
        current, pinned, purchased = bom.inputs
        self.assertEqual(pinned.component_revision, 'A')
        self.assertEqual(pinned.component_bom, body_a)
        self.assertEqual(current.component_revision, None)
        self.assertEqual(current.component_bom, body_b)
        self.assertIsNone(purchased.component_bom)

    @with_transaction()
    def test_drawing(self):
        "Test drawing fields on product and BOM"
        pool = Pool()
        Product = pool.get('product.product')
        part = create_part('323-02275', revision='A')
        part.template.drawing_number = 'D-323-02275'
        part.template.drawing_revision = '3'
        part.template.save()
        part = Product(part.id)
        self.assertEqual(part.drawing_number, 'D-323-02275')
        self.assertEqual(
            Product.search([('drawing_number', '=', 'D-323-02275')]), [part])


del ModuleTestCase
