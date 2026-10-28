# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The selection dialogs of the Jobshop reports, as Jobshop draws them

Jobshop's own dialog definitions (layouts VReports/*.vml) give each
report's selection fields: the ID / date ranges (a frame with From / To),
the "For" radio groups (Active ... Only / Inactive ... Only / Both), the
status lists and the check boxes, in the dialog's order. This file puts the
filters of the report definitions (report_*.py) in that order with
Jobshop's captions and adds the selections Jobshop has; the filters Jobshop
has not are kept after them (extras).

A spec item is either (existing filter key, Jobshop caption) or a new
filter. A range on a value the report's rows do not carry is not applied
and says so under the report (reports.apply_filters).
"""
from .reports import (
    REPORTS, WORK_ORDER_STATUSES, f_active, f_check, f_date, f_dates,
    f_radio, f_range, f_status)

QUOTE_STATUSES = [['Active', "Active"], ['Ready', "Ready"], ['Won', "Won"],
    ['Lost', "Lost"], ['Cancelled', "Cancelled"]]


def _stocked():
    return f_radio('stocked', "For", ("Stocked Parts Only",
            "Non-Stocked Parts Only"), '_stocked', default='both')


def _codes():
    return [f_range('product_code', "Product Code ID"),
        f_range('commodity_code', "Commodity Code ID")]


WO = "Work/Lot/Split ID"

# report id: the selections of Jobshop's dialog, in its order
DIALOGS = {
    # Accounting
    'account_list': [('id', "Account ID")],
    'account_set_list': [('set', "Account Set ID")],
    'accounting_calendar': [f_dates('end_date', "Period End Date")],
    'journal_batch_list': [('batch', "Journal Batch ID")],
    'journal_batch_detail': [('batch', "Journal Batch ID"),
        ('posting_date', "Posting Date"), ('account', "Account ID"),
        f_range('work_order', WO),
        f_check('expanded', "Print in Expanded Format", default=True)],
    # Common
    'commodity_code_list': [('id', "Commodity Code ID")],
    'currency_code_list': [('id', "Currency Code ID")],
    'fob_point_list': [('id', "Free on Board ID")],
    'terms_list': [('id', "Terms ID")],
    'postal_code_list': [('id', "Postal Code ID")],
    'product_code_list': [('id', "Product Code ID")],
    'reason_code_list': [('id', "Reason Code ID"),
        f_active("Reason Codes", column='active')],
    'shipping_method_list': [('id', "Ship Via ID")],
    'state_province_list': [('id', "State/Province ID")],
    # Engineering
    'engineering_master': [('part', "Part ID / Eng ID"),
        ('master', "Eng ID")],
    'engineering_master_cost': [('part', "Part ID / Eng ID"),
        ('master', "Eng ID")],
    'eng_master_list': [('part', "Part ID / Eng ID"), ('master', "Eng ID")],
    'engineering_material_list': [('part', "Part ID / Eng ID")],
    'operation_template_list': [('id', "Operation Template ID")],
    # Estimating
    'quote_form': [('quote', "Quote ID"), f_range('customer', "Customer ID"),
        ('date', "Quote Date"),
        f_status('status', "Status", QUOTE_STATUSES)],
    'quote_list': [('quote', "Quote ID"), ('customer', "Customer ID"),
        ('date', "Quote Date"), ('status', "Status")],
    'quote_master': [('master', "Quote Master ID"),
        f_range('part', "Part ID")],
    'quote_master_cost': [('master', "Quote Master ID"),
        f_range('part', "Part ID")],
    'quote_master_list': [('master', "Quote Master ID"),
        f_range('part', "Part ID"),
        f_range('commodity_code', "Commodity Code ID"),
        f_range('product_code', "Product Code ID")],
    'quote_proforma': [('quote', "Quote ID"),
        f_range('customer', "Customer ID")],
    # Inventory
    'warehouse_location_list': [('id', "Location ID")],
    'inventory_transaction_list': [('part', "Part ID"),
        f_range('sales_order', "Sales Order ID"),
        ('date', "Transaction Date"),
        f_range('purchase_order', "Purchase Order ID"),
        f_range('location', "Location ID"),
        f_range('account_set', "Account Set ID"),
        f_range('work_order', WO), f_range('lot', "Tracking Number"),
        ('class', "Type")],
    'inventory_turns': [('part', "Part ID"), f_active("Parts"),
        f_range('product_code', "Product Code ID"), _stocked(),
        f_range('commodity_code', "Commodity Code ID")],
    'inventory_value': [('part', "Part ID"), _stocked(),
        f_range('location', "Location ID"), f_active("Parts")] + _codes() + [
        ('as_of', "As Of Date")],
    'location_content_list': [('location', "Location ID")],
    'lot_where_used': [('part', "Part ID"), ('lot', "Tracking Number")],
    'part_list': [('part', "Part ID"), _stocked()] + _codes() + [
        f_active("Parts")],
    'part_list_simple': [('part', "Part ID"), f_active("Parts"),
        f_range('product_code', "Product Code ID"), _stocked(),
        f_range('commodity_code', "Commodity Code ID")],
    'part_location_list': [('part', "Part ID"), f_active("Parts"),
        _stocked()],
    'physical_count_form': [('location', "Location ID"), f_active("Parts"),
        ('part', "Part ID"), _stocked(),
        f_range('product_code', "Product Code"),
        f_range('commodity_code', "Commodity Code"),
        f_check('hide_quantity', "Hide Quantity on Hand")],
    'units_conversion_list': [f_range('part', "Part ID")],
    'unit_list': [('id', "Unit ID")],
    'where_used': [('part', "Part ID")],
    # Planning
    'material_netting': [('part', "Part ID")] + _codes() + [
        f_active("Parts")],
    'resource_schedule': [('resource', "Shop Resource ID"),
        f_range('wo', WO), ('start', "Schedule Start Date"),
        f_status('status', "Order Status", WORK_ORDER_STATUSES)],
    # Purchasing
    'parts_by_supplier': [('supplier', "Supplier ID"),
        f_active("Suppliers")],
    'purchase_order': [('po', "Purchase Order ID")],
    'purchase_order_detail': [('po', "Purchase Order ID"),
        ('supplier', "Supplier ID"), ('status', "Status")],
    'purchase_order_list': [('po', "Purchase Order ID"),
        ('supplier', "Supplier ID"), ('date', "Date"), ('status', "Status")],
    'receiver': [('receiver', "Receiver ID"),
        f_range('po', "Purchase Order ID"), ('date', "Received Date")],
    'receiver_list': [('receiver', "Receiver ID"), ('date', "Received Date"),
        f_range('po', "Purchase Order ID")],
    'service_list': [('id', "Service ID")],
    'supplier_delivery_performance': [('supplier', "Supplier ID"),
        ('date', "Date"), f_range('part', "Part ID"),
        f_active("Suppliers")],
    'supplier_list': [('supplier', "Supplier ID"), f_active("Suppliers")],
    'supplier_price_performance': [('supplier', "Supplier ID"),
        f_active("Suppliers"), ('date', "Date"), ('part', "Part ID")],
    'supplier_part_price_list': [('part', "Part ID"),
        ('supplier', "Supplier ID"), f_active("Suppliers")],
    'purchase_tax_group_list': [('tax', "Tax Group ID")],
    # Sales
    'line_backlog': [('order', "Order ID"), ('customer', "Customer ID")]
    + _codes(),
    'backlog': [('order', "Order ID"), ('customer', "Customer ID"),
        f_date('horizon', "Desired Ship Date On or Before", default=None)],
    'carrier_list': [('id', "Carrier ID")],
    'customer_list': [('customer', "Customer ID"), f_active("Customers")],
    'discount_class_list': [('id', "Discount Class ID")],
    'invoice': [f_range('shipper', "Shipper ID"), ('invoice', "Invoice ID"),
        ('date', "Invoice Date"), ('customer', "Customer ID"),
        f_range('sales_rep', "Sales Rep ID")],
    'invoice_list': [f_range('shipper', "Shipper ID"),
        ('invoice', "Invoice ID"), ('date', "Invoice Date"),
        ('customer', "Customer ID"), f_range('sales_rep', "Sales Rep ID"),
        f_range('territory', "Territory ID")],
    'pack_list': [('shipper', "Shipper ID")],
    'sales_analysis': [('date', "Shipped Date"),
        f_range('product_code', "Product Code ID")],
    'sales_order_acknowledgement': [('order', "Sales Order ID"),
        f_range('customer', "Customer ID")],
    'sales_order_detail': [('order', "Sales Order ID"),
        ('customer', "Customer ID"), ('date', "Order Date"),
        ('status', "Order Status")],
    'sales_order_list': [('order', "Sales Order ID"),
        ('customer', "Customer ID"), ('date', "Order Date"),
        ('status', "Order Status")],
    'sales_rep_list': [('id', "Sales Rep ID")],
    'sales_tax_group_list': [('tax', "Tax Group ID")],
    'sales_gross_margin': [('date', "Ship Date"),
        f_range('commodity_code', "Commodity Code ID"),
        ('customer', "Customer ID"), f_range('sic', "SIC Code ID"),
        f_range('order', "Sales Order ID"),
        f_range('territory', "Territory ID"), f_range('part', "Part ID"),
        f_range('sales_rep', "Sales Rep ID"),
        f_range('product_code', "Product Code ID")],
    'service_charge_list': [('id', "Service Charge ID")],
    'shipper_list': [('shipper', "Shipper ID"),
        f_range('order', "Sales Order ID"), ('date', "Shipped Date")],
    'sic_code_list': [('id', "SIC ID")],
    'territory_list': [('id', "Territory ID")],
    # Shopfloor
    'calendar_change_list': [('id', "Resource ID")],
    'calendar_week_list': [('id', "Resource ID")],
    'customer_throughput': [f_range('wo', WO), f_active("Customers")],
    'cut_list': [('wo', WO)],
    'employee_efficiency': [('clock', "Employee Clock No"), ('date', "Date"),
        ('resource', "Resource ID"), f_active("Employees")],
    'employee_label': [('clock', "ID Range"), f_active("Employees")],
    'employee_list': [('clock', "ID Range"), f_active("Employees")],
    'employee_throughput': [('clock', "Employee Clock Number"), ('wo', WO),
        ('date', "Labor Ticket Transaction Date"), f_active("Employees")],
    'labor_analysis': [('wo', WO), f_active("Employees"),
        ('date', "Transaction Date"), ('resource', "Resource ID"),
        ('clock', "Employee Clock No")],
    'labor_list': [('clock', "Employee Clock No"), ('date', "Clock In Date"),
        f_active("Employees")],
    'labor_transaction': [('date', "Transaction Date"),
        ('clock', "Employee Clock No"), f_active("Employees"), ('wo', WO),
        f_range('reason', "Reason Code")],
    'pick_list': [('wo', WO), f_range('part', "Part ID")] + _codes(),
    'production_brief': [('date', "Transaction Date"), ('wo', WO),
        f_range('part', "Part ID")] + _codes(),
    'quality_tracking_graph': [('date', "Labor Ticket Date"),
        f_range('product_code', "Product Code ID"), ('wo', WO),
        f_range('commodity_code', "Commodity Code ID"),
        f_range('part', "Part ID"), ('clock', "Employee Clock No")],
    'quality_variance': [('date', "Transaction Date"),
        ('clock', "Employee Clock No"), ('resource', "Resource ID"),
        f_active("Employees")],
    'resource_efficiency': [('resource', "Resource ID")],
    'resource_throughput': [('resource', "Resource ID"),
        f_range('part', "Part ID"), ('wo', WO), ('date', "Transaction Date")],
    'resource_utilization': [('resource', "Resource ID")],
    'resource_where_used': [('resource', "Resource ID")],
    'schedule_performance': [('wo', WO), f_range('part', "Part ID"),
        f_dates('close_date', "Closed Date"),
        ('status', "Work Order Status")],
    'shop_resource_list': [('id', "Shop Resource ID")],
    'shop_view_list': [('id', "Shop View ID")],
    'traveler': [('wo', WO), ('status', "Status")],
    'wip_value': [('wo', WO), ('part', "Part ID"),
        f_status('status', "Order Status", WORK_ORDER_STATUSES)],
    'work_order_cost': [('wo', WO), f_range('part', "Part ID"),
        ('status', "Status")],
    'work_order_history': [('wo', WO), f_range('part', "Part ID"),
        ('status', "Order Status")],
    'work_order_list': [('wo', WO), f_range('part', "Part ID"),
        ('status', "Status")],
    }

# The .rpt of N-Line's installed Jobshop where the help names another
RPT = {
    'terms_list': 'TermsRuleList.rpt',
    }

def jobshop_filters(report_id, filters):
    """The filters of a report in Jobshop's dialog order: Jobshop's first
    (captions as Jobshop's), then the extras"""
    spec = DIALOGS.get(report_id)
    if not spec:
        return filters
    by_key = {f['key']: f for f in filters}
    result, used = [], set()
    for item in spec:
        if isinstance(item, tuple):
            key, label = item
            if key not in by_key:
                continue
            f = dict(by_key[key])
            f['label'] = label
            f['jobshop'] = True
        else:
            key = item['key']
            if key in by_key or key in used:
                continue
            f = dict(item)
            f['jobshop'] = True
        used.add(key)
        result.append(f)
    for f in filters:
        if f['key'] not in used:
            result.append(dict(f, jobshop=False))
    return result


def apply():
    "Put Jobshop's dialogs on the report definitions (once, at import)"
    for report_id, definition in REPORTS.items():
        definition.filters = jobshop_filters(report_id, definition.filters)
        if report_id in RPT:
            definition.rpt = RPT[report_id]
