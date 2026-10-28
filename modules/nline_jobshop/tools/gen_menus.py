"""Generate nline_jobshop/jobshop.xml: VISUAL Jobshop's group bar as the
Tryton menu (docs/jobshop/EMULATION.md).

    python tools/gen_menus.py

Each group of the Jobshop navigation bar is a top menu, with its items in
Jobshop's order and names. An item opens an N-Line desk screen: an existing
nline_desk screen (desk:<id>, its action url_desk_<id>) or a Jobshop screen
of this emulation (its action url_js_<id> made here). The standard Tryton
menus the Jobshop screens replace (sales, purchases, production, stock,
products, parties) are hidden (Administration > Superseded Menus shows them
again). Edit GROUPS / SCREENS / HIDE here, never jobshop.xml.
"""
import os
import sys

P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(
                __file__))), 'jobshop.xml')
ACC = 'account.group_account'
PROD = 'production.group_production'
STOCK = 'stock.group_stock'
SALE = 'sale.group_sale'
PURCHASE = 'purchase.group_purchase'
ADMIN = 'res.group_admin'
EMPLOYEE = 'company.group_employee_admin'

# The Jobshop screens made here: id: (name, route, writes, group)
SCREENS = {
    # Inventory
    'units': ('Units of Measure', 'units', True, None),
    'unit_conversions': ('Unit Conversions', 'unit-conversions', True,
        None),
    'locations': ('Locations', 'locations', True, STOCK),
    'adjustments': ('Adjustments', 'adjustments', True, STOCK),
    'reports_inventory': ('Inventory Reports', 'js-reports/inventory',
        False, None),
    # Engineering
    'operation_templates': ('Operation Templates', 'operation-templates',
        True, PROD),
    'reports_engineering': ('Engineering Reports', 'js-reports/engineering',
        False, None),
    # Estimating
    'quote_masters': ('Quote Masters', 'quote-masters', True, None),
    'reports_estimating': ('Estimating Reports', 'js-reports/estimating',
        False, None),
    # Sales
    'service_charges': ('Service Charges', 'service-charges', True, SALE),
    'sales_tax_groups': ('Sales Tax Groups', 'sales-tax-groups', True,
        SALE),
    'sales_reps': ('Sales Reps', 'sales-reps', True, SALE),
    'territories': ('Territories', 'territories', True, SALE),
    'sic_codes': ('SIC Codes', 'sic-codes', True, SALE),
    'carriers': ('Carriers', 'carriers', True, SALE),
    'discount_classes': ('Discount Classes', 'discount-classes', True,
        SALE),
    'reports_sales': ('Sales Reports', 'js-reports/sales', False, None),
    # Purchasing
    'rfqs': ('Request For Quotes', 'rfqs', True, PURCHASE),
    'services': ('Services', 'services', True, PURCHASE),
    'purchase_tax_groups': ('Purchasing Tax Groups', 'purchase-tax-groups',
        True, PURCHASE),
    'reports_purchasing': ('Purchasing Reports', 'js-reports/purchasing',
        False, None),
    # Planning
    'reports_planning': ('Planning Reports', 'js-reports/planning', False,
        None),
    # Shopfloor
    'shop_groups': ('Shop Groups', 'shop-groups', True, PROD),
    'shop_views': ('Shop Views', 'shop-views', True, PROD),
    'labor_collection': ('Labor Data Collection', 'labor-collection', True,
        PROD),
    'reports_shopfloor': ('Shopfloor Reports', 'js-reports/shopfloor',
        False, None),
    # Accounting
    'account_sets': ('Account Sets', 'account-sets', True, ACC),
    'accounting_calendar': ('Accounting Calendar', 'accounting-calendar',
        True, ACC),
    'account_interface': ('Account Interface', 'account-interface', True,
        ACC),
    'reports_accounting': ('Accounting Reports', 'js-reports/accounting',
        False, ACC),
    # Common
    'fob_points': ('Free On Board Points', 'fob-points', True, None),
    'ship_vias': ('Shipping Methods', 'ship-vias', True, None),
    'states': ('States/Provinces', 'states', True, None),
    'postal_codes': ('Postal Codes', 'postal-codes', True, None),
    'product_codes': ('Product Codes', 'product-codes', True, None),
    'commodity_codes': ('Commodity Codes', 'commodity-codes', True, None),
    'reason_codes': ('Reason Codes', 'reason-codes', True, None),
    'alert_messages': ('Alert Messages', 'alert-messages', True, None),
    'currency_codes': ('Currency Codes', 'currency-codes', True, None),
    'control_panel': ('User Control Panel', 'control-panel', False, None),
    'reports_common': ('Common Reports', 'js-reports/common', False, None),
    # Executive Information
    'exec_sales': ('Sales', 'exec/sales', False, SALE),
    'exec_purchasing': ('Purchasing', 'exec/purchasing', False, PURCHASE),
    'exec_production': ('Production', 'exec/production', False, PROD),
    'exec_financials': ('Financials', 'exec/financials', False, ACC),
    # Administration
    'users': ('User Manager', 'users', True, ADMIN),
    'authorities': ('Authority Manager', 'authorities', True, ADMIN),
    'system_settings': ('System Settings', 'system-settings', True, ADMIN),
}

# The group bar: (id, name, icon, [(item id, 'desk:<id>' | 'js:<id>',
# groups of the menu item)]), in Jobshop's order
GROUPS = [
    ('inventory', 'Inventory', 'tryton-stock', [
        ('parts', 'desk:parts', [], 'Parts'),
        ('units', 'js:units', []),
        ('unit_conversions', 'js:unit_conversions', []),
        ('locations', 'js:locations', [STOCK]),
        ('adjustments', 'js:adjustments', [STOCK]),
        ('reports', 'js:reports_inventory', [], 'Reports'),
        ]),
    ('engineering', 'Engineering', 'tryton-product', [
        ('masters', 'desk:masters', [PROD], 'Masters'),
        ('operation_templates', 'js:operation_templates', [PROD]),
        ('reports', 'js:reports_engineering', [], 'Reports'),
        ]),
    ('estimating', 'Estimating', 'tryton-sale', [
        ('quotes', 'desk:quotes', [SALE], 'Quotes'),
        ('quote_masters', 'js:quote_masters', [SALE, PROD]),
        ('reports', 'js:reports_estimating', [], 'Reports'),
        ]),
    ('sales', 'Sales', 'tryton-sale', [
        ('customers', 'desk:customer_window', [], 'Customers'),
        ('orders', 'desk:orders', [SALE], 'Sales Orders'),
        ('shipping', 'desk:shipping', [STOCK]),
        ('invoicing', 'desk:invoicing', [ACC]),
        ('service_charges', 'js:service_charges', [SALE]),
        ('tax_groups', 'js:sales_tax_groups', [SALE], 'Tax Groups'),
        ('sales_reps', 'js:sales_reps', [SALE]),
        ('territories', 'js:territories', [SALE]),
        ('sic_codes', 'js:sic_codes', [SALE]),
        ('carriers', 'js:carriers', [SALE]),
        ('discount_classes', 'js:discount_classes', [SALE]),
        ('reports', 'js:reports_sales', [], 'Reports'),
        ]),
    ('purchasing', 'Purchasing', 'tryton-purchase', [
        ('suppliers', 'desk:supplier_window', [], 'Suppliers'),
        ('rfqs', 'js:rfqs', [PURCHASE]),
        ('purchase_orders', 'desk:purchase_orders', [PURCHASE], 'Purchase Orders'),
        ('receiving', 'desk:receiving', [STOCK]),
        ('services', 'js:services', [PURCHASE]),
        ('tax_groups', 'js:purchase_tax_groups', [PURCHASE], 'Tax Groups'),
        ('reports', 'js:reports_purchasing', [], 'Reports'),
        ]),
    ('planning', 'Planning', 'tryton-production', [
        ('planning', 'desk:planning', [PROD]),
        ('scheduling', 'desk:scheduling', [PROD]),
        ('reports', 'js:reports_planning', [], 'Reports'),
        ]),
    ('shopfloor', 'Shopfloor', 'tryton-production', [
        ('work_orders', 'desk:work_order', [PROD], 'Work Orders'),
        ('issues', 'desk:issues', [PROD], 'Material Issues/Returns'),
        ('wo_receipts', 'desk:wo_receipts', [PROD], 'Work Order Receipts/Returns'),
        ('resources', 'desk:resources', [PROD]),
        ('shop_groups', 'js:shop_groups', [PROD]),
        ('shop_views', 'js:shop_views', [PROD]),
        ('labor', 'desk:labor', [PROD]),
        ('labor_collection', 'js:labor_collection', [PROD]),
        ('employees', 'desk:employees', [EMPLOYEE]),
        ('reports', 'js:reports_shopfloor', [], 'Reports'),
        ]),
    ('accounting', 'Accounting', 'tryton-account', [
        ('accounts', 'desk:accounts', [ACC], 'Accounts'),
        ('account_sets', 'js:account_sets', [ACC]),
        ('accounting_calendar', 'js:accounting_calendar', [ACC]),
        ('account_interface', 'js:account_interface', [ACC]),
        ('reports', 'js:reports_accounting', [ACC], 'Reports'),
        ]),
    ('common', 'Common', 'tryton-list', [
        ('fob_points', 'js:fob_points', []),
        ('ship_vias', 'js:ship_vias', []),
        ('states', 'js:states', []),
        ('postal_codes', 'js:postal_codes', []),
        ('terms', 'desk:terms', [ACC, SALE, PURCHASE]),
        ('product_codes', 'js:product_codes', []),
        ('commodity_codes', 'js:commodity_codes', []),
        ('reason_codes', 'js:reason_codes', []),
        ('alert_messages', 'js:alert_messages', []),
        ('currency_codes', 'js:currency_codes', []),
        ('control_panel', 'js:control_panel', []),
        ('reports', 'js:reports_common', [], 'Reports'),
        ]),
    ('executive', 'Executive Information', 'tryton-board', [
        ('sales', 'js:exec_sales', [SALE]),
        ('purchasing', 'js:exec_purchasing', [PURCHASE]),
        ('production', 'js:exec_production', [PROD]),
        ('financials', 'js:exec_financials', [ACC]),
        ]),
    ('administration', 'Administration', 'tryton-settings', [
        ('users', 'js:users', [ADMIN]),
        ('authorities', 'js:authorities', [ADMIN]),
        ('system_settings', 'js:system_settings', [ADMIN]),
        ]),
]

# The standard Tryton menus (not accounting) the Jobshop screens replace:
# (menu xml id, replaced by)
HIDE = [
    ('sale.menu_sale', 'Sales'),
    ('purchase.menu_purchase', 'Purchasing'),
    ('production.menu_production', 'Engineering, Shopfloor, Planning'),
    ('stock.menu_stock', 'Inventory'),
    ('product.menu_main_product', 'Inventory > Parts'),
    ('party.menu_party', 'Sales > Customers, Purchasing > Suppliers'),
    ('nline_build_tree.menu_build_tree', 'Shopfloor > Work Orders'),
]


# The icons (nline_desk/tools/gen_icons.py): each group a tile in its area's
# colour, each item the same colour with its own symbol
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
                os.path.dirname(os.path.abspath(__file__)))), 'nline_desk',
        'tools'))
import gen_icons  # noqa: E402

AREA = {'inventory': 'inventory', 'engineering': 'engineering',
    'estimating': 'estimating', 'sales': 'sales', 'purchasing': 'purchasing',
    'planning': 'planning', 'shopfloor': 'shopfloor',
    'accounting': 'accounting', 'common': 'common', 'executive': 'executive',
    'administration': 'admin'}
GROUP_SYMBOL = {'inventory': 'box', 'engineering': 'tree',
    'estimating': 'calc', 'sales': 'tryton-sale',
    'purchasing': 'tryton-purchase', 'planning': 'tryton-date',
    'shopfloor': 'factory', 'accounting': 'tryton-account', 'common': 'list',
    'executive': 'gauge', 'administration': 'shield'}
ITEM_SYMBOL = {
    'inventory': {'parts': 'tryton-product', 'units': 'ruler',
        'unit_conversions': 'swap', 'locations': 'place',
        'adjustments': 'tune'},
    'engineering': {'masters': 'tree', 'operation_templates': 'wrench'},
    'estimating': {'quotes': 'doc', 'quote_masters': 'calc'},
    'sales': {'customers': 'people', 'orders': 'tryton-sale',
        'shipping': 'tryton-shipment-out', 'invoicing': 'tryton-invoice',
        'service_charges': 'receipt', 'tax_groups': 'percent',
        'sales_reps': 'person', 'territories': 'map', 'sic_codes': 'list',
        'carriers': 'tryton-carrier', 'discount_classes': 'tag'},
    'purchasing': {'suppliers': 'tryton-party', 'rfqs': 'tryton-send',
        'purchase_orders': 'tryton-purchase',
        'receiving': 'tryton-shipment-in', 'services': 'wrench',
        'tax_groups': 'percent'},
    'planning': {'planning': 'grid', 'scheduling': 'tryton-date'},
    'shopfloor': {'work_orders': 'factory', 'issues': 'tryton-export',
        'wo_receipts': 'tryton-import', 'resources': 'tryton-production',
        'shop_groups': 'grid', 'shop_views': 'list',
        'labor': 'tryton-timesheet', 'labor_collection': 'touch',
        'employees': 'person'},
    'accounting': {'accounts': 'tryton-account', 'account_sets': 'list',
        'accounting_calendar': 'tryton-date', 'account_interface': 'swap'},
    'common': {'fob_points': 'flag', 'ship_vias': 'tryton-carrier',
        'states': 'map', 'postal_codes': 'tryton-email', 'terms': 'doc',
        'product_codes': 'tag', 'commodity_codes': 'list',
        'reason_codes': 'tryton-question', 'alert_messages': 'bell',
        'currency_codes': 'tryton-currency', 'control_panel': 'person'},
    'executive': {'sales': 'trend', 'purchasing': 'tryton-purchase',
        'production': 'gauge', 'financials': 'report'},
    'administration': {'users': 'people', 'authorities': 'shield',
        'system_settings': 'tune'},
}


def group_icon(gid):
    return gen_icons.icon(AREA[gid], GROUP_SYMBOL[gid])


def item_icon(gid, iid):
    "Reports are a chart; any other item its own symbol"
    symbol = 'report' if iid == 'reports' else ITEM_SYMBOL[gid][iid]
    return gen_icons.icon(AREA[gid], symbol)


for _gid, _gname, _icon, _items in GROUPS:
    group_icon(_gid)
    for _item in _items:
        item_icon(_gid, _item[0])
ICONS_USED = dict(gen_icons.ICONS)


def generate():
    out = ['''<?xml version="1.0"?>
<!-- This file is part of Tryton.  The COPYRIGHT file at the top level of
this repository contains the full copyright notices and license terms. -->
<!-- Generated by tools/gen_menus.py: edit it, not this file -->
<tryton>
    <data>
''']
    for sid, (name, route, writes, group) in SCREENS.items():
        out.append('''        <record model="ir.action.url" id="url_js_%s">
            <field name="name">%s</field>
            <field name="nline_writes" eval="%s"/>
            <field name="url">desk/index.html#/%s</field>
        </record>
''' % (sid, name, writes, route))
        if group:
            out.append('''        <record model="ir.action-res.group" id="url_js_%s_group">
            <field name="action" ref="url_js_%s"/>
            <field name="group" ref="%s"/>
        </record>
''' % (sid, sid, group))
    for seq, (gid, gname, icon, items) in enumerate(GROUPS, start=2):
        out.append('''
        <menuitem name="%s" sequence="%d" id="menu_js_%s" icon="%s"/>
''' % (gname, seq, gid, group_icon(gid)))
        for iseq, item in enumerate(items, start=1):
            iid, target, groups = item[:3]
            # Jobshop's name of the item (default: the action's)
            label = ' name="%s"' % item[3] if len(item) > 3 else ''
            kind, sid = target.split(':')
            action = ('nline_desk.url_desk_%s' if kind == 'desk'
                else 'url_js_%s') % sid
            mid = 'menu_js_%s_%s' % (gid, iid)
            out.append('''        <menuitem parent="menu_js_%s" action="%s"%s
            icon="%s" sequence="%d" id="%s"/>
''' % (gid, action, label, item_icon(gid, iid), iseq * 10, mid))
            for g in groups:
                out.append('''        <record model="ir.ui.menu-res.group" id="%s_%s">
            <field name="menu" ref="%s"/>
            <field name="group" ref="%s"/>
        </record>
''' % (mid, g.split('.')[-1], mid, g))
    out.append('''    </data>
    <data noupdate="1">
        <!-- Hidden for everyone; Administration > Superseded Menus shows
             them again -->
''')
    for menu, by in HIDE:
        out.append('''        <record model="nline.desk.menu" id="hide_%s">
            <field name="menu" ref="%s"/>
            <field name="superseded_by">%s</field>
            <field name="hidden" eval="True"/>
        </record>
''' % (menu.replace('.', '_'), menu, by))
    out.append('''    </data>
</tryton>
''')
    return ''.join(out)


def main():
    open(P, 'w', encoding='utf-8', newline='\n').write(generate())
    print('jobshop.xml: %d screens, %d groups, %d hidden menus' % (
            len(SCREENS), len(GROUPS), len(HIDE)))


if __name__ == '__main__':
    main()
