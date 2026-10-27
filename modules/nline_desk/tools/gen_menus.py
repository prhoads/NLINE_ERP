"""Generate the N-Line menus of nline_desk/menu.xml (the QuickBooks /
Jobshop grouping of the UI upgrade, docs/ui/UI_UPGRADE_PLAN.md).

    python tools/gen_menus.py

Rewrites the block between "BEGIN N-Line menus" and "END N-Line menus":
the ir.action.url of each N-Line screen (opened in a Tryton tab by
custom.js), the folders and their items, and the groups of each item. Edit
SCREENS and FOLDERS here, never the generated block.
"""
import os

P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(
                __file__))), 'menu.xml')
ACC = 'account.group_account'
PROD = 'production.group_production'
STOCK = 'stock.group_stock'
SALE = 'sale.group_sale'
PURCHASE = 'purchase.group_purchase'

# N-Line screens: id: (name, route, writes, group of the action)
SCREENS = {
    'home': ('Home', '', False, None),
    'customers': ('Customer Center', 'customers', False, ACC),
    'customer_window': ('Customers', 'customer-window', False, None),
    'orders': ('Customer Order Entry', 'orders/new', True, SALE),
    'shipping': ('Shipping', 'shipping', True, STOCK),
    'invoicing': ('Invoicing', 'invoicing', True, ACC),
    'invoices': ('Create Invoices', 'invoices/new', True, ACC),
    'sales_receipts': ('Enter Sales Receipts', 'sales-receipts/new', True,
        ACC),
    'credits': ('Credit Memos/Refunds', 'credits/new', True, ACC),
    'receive': ('Receive Payments', 'payments/receive', True, ACC),
    'statements': ('Create Statements', 'statements', False, ACC),
    'income_tracker': ('Income Tracker', 'income-tracker', False, ACC),
    'vendors': ('Vendor Center', 'vendors', False, ACC),
    'supplier_window': ('Suppliers', 'supplier-window', False, None),
    'purchase_orders': ('Purchase Order Entry', 'purchase-orders/new', True,
        PURCHASE),
    'receiving': ('Receiving', 'receiving', True, STOCK),
    'bill_receipts': ('Enter Bills Against Inventory', 'bill-receipts', True,
        ACC),
    'bills': ('Enter Bills', 'bills/new', True, ACC),
    'vendor_credits': ('Enter Vendor Credits', 'vendor-credits/new', True,
        ACC),
    'pay_bills': ('Pay Bills', 'bills/pay', True, ACC),
    'bill_tracker': ('Bill Tracker', 'bill-tracker', False, ACC),
    'checks': ('Write Checks', 'checks/new', True, ACC),
    'deposits': ('Make Deposits', 'deposits/new', True, ACC),
    'cards': ('Enter Credit Card Charges', 'cards/new', True, ACC),
    'register': ('Check Register', 'register', False, ACC),
    'reconcile': ('Reconcile', 'reconcile', True, ACC),
    'workorders': ('Work Orders (cards)', 'workorders', False, PROD),
    'work_order': ('Work Order', 'work-orders/new', False, PROD),
    'labor': ('Labor Entry', 'labor', True, PROD),
    'issues': ('Material Issues', 'issues', True, PROD),
    'wo_receipts': ('Work Order Receipts', 'wo-receipts', True, PROD),
    'masters': ('Engineering Master', 'masters', False, PROD),
    'resources': ('Shop Resources', 'resources', False, PROD),
    'employees': ('Employees', 'employees', False, None),
    'items': ('Item List', 'items', False, None),
    'parts': ('Parts', 'parts', False, None),
    'accounts': ('Chart of Accounts', 'accounts', False, ACC),
    'journal': ('Make General Journal Entries', 'journal/new', True, ACC),
    'reports': ('Report Center', 'reports', False, None),
}

# Folders: (id, name, icon, [(item id, 'screen:<id>' or action, groups)])
FOLDERS = [
    ('customers', 'Customers', 'tryton-sale', [
        ('customers', 'screen:customers', [ACC]),
        ('income_tracker', 'screen:income_tracker', [ACC]),
        ('customer_window', 'screen:customer_window', []),
        ('orders', 'screen:orders', [SALE]),
        ('shipping', 'screen:shipping', [STOCK]),
        ('invoicing', 'screen:invoicing', [ACC]),
        ('sales', 'sale.act_sale_form', [SALE]),
        ('invoices', 'screen:invoices', [ACC]),
        ('sales_receipts', 'screen:sales_receipts', [ACC]),
        ('credits', 'screen:credits', [ACC]),
        ('receive', 'screen:receive', [ACC]),
        ('statements', 'screen:statements', [ACC]),
        ('shipments_out', 'stock.act_shipment_out_form', [STOCK]),
        ('invoices_out', 'account_invoice.act_invoice_out_form', [ACC]),
        ]),
    ('vendors', 'Vendors', 'tryton-purchase', [
        ('vendors', 'screen:vendors', [ACC]),
        ('bill_tracker', 'screen:bill_tracker', [ACC]),
        ('supplier_window', 'screen:supplier_window', []),
        ('purchase_orders', 'screen:purchase_orders', [PURCHASE]),
        ('receiving', 'screen:receiving', [STOCK]),
        ('bill_receipts', 'screen:bill_receipts', [ACC]),
        ('purchases', 'purchase.act_purchase_form', [PURCHASE]),
        ('requests', 'purchase_request.act_purchase_request_form',
            ['purchase_request.group_purchase_request']),
        ('shipments_in', 'stock.act_shipment_in_form', [STOCK]),
        ('bills', 'screen:bills', [ACC]),
        ('vendor_credits', 'screen:vendor_credits', [ACC]),
        ('pay_bills', 'screen:pay_bills', [ACC]),
        ('invoices_in', 'account_invoice.act_invoice_in_form', [ACC]),
        ]),
    ('banking', 'Banking', 'tryton-bank', [
        ('checks', 'screen:checks', [ACC]),
        ('deposits', 'screen:deposits', [ACC]),
        ('cards', 'screen:cards', [ACC]),
        ('register', 'screen:register', [ACC]),
        ('reconcile', 'screen:reconcile', [ACC]),
        ('statements', 'account_statement.act_statement_form',
            ['account_statement.group_statement']),
        ]),
    ('shopfloor', 'Shop Floor', 'tryton-production', [
        ('workorders', 'screen:workorders', [PROD]),
        ('work_order', 'screen:work_order', [PROD]),
        ('labor', 'screen:labor', [PROD]),
        ('issues', 'screen:issues', [PROD]),
        ('wo_receipts', 'screen:wo_receipts', [PROD]),
        ('resources', 'screen:resources', [PROD]),
        ('employees', 'screen:employees', ['company.group_employee_admin']),
        ('productions', 'production.act_production_list', [PROD]),
        ('jobs', 'nline_job.act_job_list', [PROD]),
        ('works', 'production_work.act_work_list', [PROD]),
        ]),
    ('engineering', 'Engineering', 'tryton-product', [
        ('part_window', 'screen:parts', []),
        ('masters', 'screen:masters', [PROD]),
        ('parts', 'product.act_template_form', []),
        ('boms', 'production.act_bom_list', [PROD]),
        ('routings', 'production_routing.act_routing_list', [PROD]),
        ('operations', 'production_routing.act_operation_list', [PROD]),
        ('work_centers', 'production_work.act_work_center_list', [PROD]),
        ]),
    ('inventory', 'Inventory', 'tryton-stock', [
        ('items', 'screen:items', []),
        ('locations', 'stock.act_location_tree', [STOCK]),
        ('inventories', 'stock.act_inventory_form', [STOCK]),
        ('internal', 'stock.act_shipment_internal_form', [STOCK]),
        ('moves', 'stock.act_move_form', [STOCK]),
        ]),
    ('company', 'Company', 'tryton-account', [
        ('reports', 'screen:reports', []),
        ('accounts', 'screen:accounts', [ACC]),
        ('journal', 'screen:journal', [ACC]),
        ('moves', 'account.act_move_form', [ACC]),
        ('general_ledger', 'account.act_general_ledger_account_form', [ACC]),
        ('balance_sheet', 'account.act_account_balance_sheet_tree', [ACC]),
        ('income_statement', 'account.act_account_income_statement_tree',
            [ACC]),
        ('aged_balance', 'account.act_aged_balance_list', [ACC]),
        ]),
]


def generate():
    out = ['''        <!-- BEGIN N-Line menus (generated by tools/gen_menus.py: edit
             it, not this block). The QuickBooks / Jobshop grouping first in
             the menu; the N-Line screens open in a Tryton tab (custom.js);
             each item only for the groups that may use it, the screens that
             write hidden from read-only users -->
''']
    for sid, (name, route, writes, group) in SCREENS.items():
        out.append('''        <record model="ir.action.url" id="url_desk_%s">
            <field name="name">%s</field>
            <field name="nline_writes" eval="%s"/>
            <field name="url">desk/index.html#/%s</field>
        </record>
''' % (sid, name, writes, route))
        if group:
            out.append('''        <record model="ir.action-res.group" id="url_desk_%s_group">
            <field name="action" ref="url_desk_%s"/>
            <field name="group" ref="%s"/>
        </record>
''' % (sid, sid, group))
    out.append('''
        <menuitem action="url_desk_home" sequence="1" id="menu_desk_home"
            icon="tryton-board"/>
''')
    for seq, (fid, fname, icon, items) in enumerate(FOLDERS, start=2):
        out.append('''
        <menuitem name="%s" sequence="%d" id="menu_nl_%s" icon="%s"/>
''' % (fname, seq, fid, icon))
        for iseq, (iid, target, groups) in enumerate(items, start=1):
            if target.startswith('screen:'):
                mid = 'menu_desk_%s' % target[7:]
                action = 'url_desk_%s' % target[7:]
            else:
                mid = 'menu_nl_%s_%s' % (fid, iid)
                action = target
            out.append('''        <menuitem parent="menu_nl_%s" action="%s"
            sequence="%d" id="%s"/>
''' % (fid, action, iseq * 10, mid))
            for g in groups:
                out.append('''        <record model="ir.ui.menu-res.group" id="%s_%s">
            <field name="menu" ref="%s"/>
            <field name="group" ref="%s"/>
        </record>
''' % (mid, g.split('.')[-1], mid, g))
    out.append('''        <!-- END N-Line menus -->
''')
    return ''.join(out)


def main():
    s = open(P, encoding='utf-8').read()
    start = s.index('        <!-- BEGIN N-Line menus')
    end = s.index('        <!-- END N-Line menus -->\n') + len(
        '        <!-- END N-Line menus -->\n')
    s = s[:start] + generate() + s[end:]
    open(P, 'w', encoding='utf-8', newline='\n').write(s)
    print('menu.xml: %d screens, %d folders' % (len(SCREENS), len(FOLDERS)))


if __name__ == '__main__':
    main()
