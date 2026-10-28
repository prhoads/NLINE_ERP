# Jobshop emulation: Sales (nline_js_sales)

Module `modules/nline_js_sales`, screens `modules/nline_desk/web/js/jobshop/sales.js`,
data `migration/jobshop/sales.py` (step `js_sales`). Tests:
`tests/scenario_nline_js_sales.rst` (RPCs, models, and the migration run twice
on rows shaped like Jobshop's) — `test.ps1 nline_js_sales`: 25 tests OK.

## Checklist

- [x] What are Sales Functions? — the group bar's Sales items all open a window below.
- [x] Sales Orders
  - [x] What are Sales Orders? / Field Level Descriptions (`VSalesSalesOrder`, `VSalesSalesLine`)
  - [x] Sales Order Maintenance
    - [x] Maintaining Sales Orders — route `orders/new`, `orders/<id>` (takes over the desk's Customer Order Entry: lines, Quote/Confirm (now Change Status > Firm / Released), Print, links to work orders and New WO all kept).
    - [~] Creating Sales Orders from Quotes — "New From Quote" copies a Tryton quotation (state draft/quotation) into a new order with Quote ID = the quote's number. Decision: until the Estimating area has its own quote model, a Jobshop quote is a Tryton sale in quotation. The quote is left as it is (Jobshop marks it Won: no such state). Quote-master work orders are not created on copy (New WO on the Links does it after release).
    - [x] Creating Sales Orders from Existing Sales Orders — "Copy" (Edit > Copy Document): a new unreleased order with the lines, details and charges; the Order ID is given on save (typed or automatic).
    - [x] Entering Sales Order Lines — Part, Description, Customer Part ID, Order Qty, Unit Price, Disc %, Extension; right-click a line: Line Overrides and Specs (Customer PO Line #, Promise Date, Product Code, Commodity Code, Tax Group, Specifications), Reset Unit Price from Customer.
    - [x] Editing and Viewing Sales Orders — a released order keeps its lines read-only (Tryton) but its Details, Specs, Charges, PO number, desired ship date and the lines' overrides/specs still change, as in Jobshop.
    - [x] Deleting Sales Orders — Delete (Edit > Delete Document) for an unreleased / firm / cancelled order only (`sales_order_delete`); a released one is closed or cancelled instead. Line delete = the grid's ✕ (draft).
    - [x] Sales Order Tab Information
      - [x] Sales Order Tab (Order ID typed or automatic, Customer ID, Order Date, Desired Ship Date, PO No, Status badge, Terms, lines, totals, work order links)
      - [x] Sold To Tab (read-only, the customer's bill-to address)
      - [x] Ship To Tab (ship-to address chooser + address)
      - [x] Details Tab (Promise Date, Last Shipped Date, Sales Rep, Territory, FOB, Ship Via, Carrier, Tax Group, Freight Terms, Discount Class, Quote ID; filled from the customer / its default ship-to address when the customer is chosen)
      - [x] Specs Tab
      - [x] Charges Tab (Service Charge ID, Description, Amount, Tax Group, Apply, Revenue Account, Applied Amount)
      - [x] Taxes Tab (Tax Group, Tax Name, Description, Account, Percent, Taxable, Amount)
      - [x] Shippers/Invoices Tab (shipments, returns, invoices; double-click opens Shipping / Invoicing)
      - [x] Browse Tab
  - Change status (Tools > Change Status): Unreleased, Firm, Released, Hold, Closed, Cancelled (`sales_order_status`).
- [x] Customers — route `customer-window` (and `customer-window/<id>`), takes over the desk's window (its Addresses, Contacts, Terms, open balance, Orders and Invoices tabs are kept).
  - [x] What are Customers? / Customer Field Level Descriptions (`VSalesCustomer`)
  - [x] Maintaining / Editing / Deleting Customers (UI.master: ID lookup, First/Prev/Next/Last, Save, Copy, Delete per rights)
  - [x] Preparing Quantity/Break Tables — Prices tab: part, selling U/M, customer part ID, Type (Break / Up-to-Qty), As Of, Expires, Use Part Price, Default Price and the Qty Break / Unit Price table; used by "Reset Unit Price from Customer" (customer table, then the discount class's, then the part's price less the class's discount %).
  - [x] Customer Window Tab Information
    - [x] Customers Tab (ID, Name, Active, main address = Tryton's first address through function fields, Title, Phone/Fax/E-mail from the contacts)
    - [x] Account Tab (Opened, Last Order, Supplier ID (Ours), Receivables Account, Terms, Freight Terms, Credit Status, Order Limit, open balance, open orders)
    - [x] Details Tab (Sales Rep, Territory, FOB, Ship Via, Carrier, SIC, Discount Class, Tax ID, Tax Group, Tax Exempt; the quote / sales order instructions and the footers, Specifications)
    - [x] Addresses Tab (Default Ship To, name, contact, address, phones, Tax Exempt, Tax Group, Tax ID, Sales Rep, Territory, FOB, Ship Via, Carrier, Discount Class)
    - [x] Prices Tab
    - [x] Notes Tab (Tryton notes; the Jobshop NOTES text is imported as a note)
    - [x] Sales Orders Tab (Released by default, right-click: other statuses / Show All; double-click opens the order)
    - [~] Quotes Tab — the customer's Tryton quotations (draft / quotation); Jobshop's Lost/Won/Ready statuses, lead time and won/loss reason belong to the Estimating area's quotes.
    - [~] Browse Tab — no "Show All" check box (UI.master browses active records).
- [x] Service Charges — route `service-charges` (ID, Description, Amount, Revenue Account).
- [x] Tax Groups — route `sales-tax-groups`: tax group with its Taxes lines (Tax Name, Description, Effective, Account, Tax Percent). Each line with an account is kept as a Tryton tax (`account.tax`, percentage, the account on invoices and credit notes, start date = Effective), made / updated on save; a line can also point to an existing Tryton tax. The group gives the taxes effective at the order date (latest effective per tax name).
- [x] Sales Reps — route `sales-reps` (ID, Name, Commission %).
- [x] Territories — route `territories`.
- [x] SIC Codes — route `sic-codes`.
- [x] Carriers — route `carriers` (ID, Name, Carrier Code, Route, COD Charge, Shipper Instructions).
- [x] Discount Classes — route `discount-classes` (ID, Description, Discount Percent, Prices tab with the quantity breaks).
- [x] Shipping — route `shipping` (and `shipping/<id>`), takes over the desk's window (the step buttons Assign Stock / Pick / Pack / Ship, Picking List, Packing List, "include shipped" are kept: View Shipped Orders).
  - [x] What is Shipping? / Shipping Field Level Descriptions (`VSalesShipping`, `VSalesShipperLine`)
  - [x] Accessing the Shipping Window
  - [x] Shipping Parts — Ship (button, or right-click Ship on the activity list): ship quantities per line; less than ordered back-orders the rest on a new shipper (0 = the whole line); stock is assigned when there is, forced otherwise (Jobshop ships whatever the quantity on hand); asks to print the packing list. Hold / closed orders are not shipped; credit status Hold Shipments asks to accept.
  - [x] Returning Parts — right-click a shipped order > Mark for Return… (or Return… on its shipper): return quantities per line → a return order (Tryton's return sale, linked line by line to the shipped lines) and its return shipper, received with "Receive Return".
  - [~] Entering Shipper Lines — ship quantity per line on the Shipper tab; carton count, shipping weight, location override, tracking (lot) numbers are not emulated (no N-Line use; Tryton's stock_package / lots modules are not installed).
  - [x] Shipping Window Tab Information: Shipping Activity, Shipper, Sold To, Ship To, Details (Order Date, Shipped Date, FOB, Ship Via, Carrier, Tracking Number, Freight Terms, Tax Group, Terms, Discount Class, Invoice IDs/dates), Specs (printed note on the shipper), Charges (the order's charges still to invoice: amount and Apply).
- [x] Invoicing — route `invoicing` (and `invoicing/<id>`), takes over the desk's window (draft list, Post Selected with printing kept).
  - [x] What is Invoicing? / Invoicing Field Level Descriptions (`VSalesInvoicing`)
  - [x] Accessing the Invoicing Window
  - [x] Invoicing Sales Orders — Invoice tab: Save, Invoice (post + print), Print.
  - [x] Processing Multiple Invoices — tick on the Invoicing Activity tab, Post Selected.
  - [x] Issuing Credit Memos — return orders' credit notes wait on the Invoicing Activity tab (type Return); "Credit Memo" on a posted invoice makes a draft credit note (Tryton's credit).
  - [x] Invoicing Window Tab Information: Invoicing Activity, Invoice (lines with Ship Qty / Unit Price editable while draft, totals Charge / Tax / Total), Bill To, Ship To, Details, Specs (the invoice's comment), Charges (add / change / remove on the draft invoice), Taxes.
- [-] Sales Reports — the admin area builds all Jobshop reports (`js-reports/sales`).

## Decisions

- Jobshop statuses on Tryton's sale: `js_status` (function, searchable) = Unreleased (draft), Firm (quotation), Released (confirmed / processing), Closed (done, or the `js_closed` flag), Cancelled; Hold is the `js_hold` flag. Line status `js_line_status` = Open / Closed (shipped to completion) / Cancelled.
- Trade discount: the line keeps `gross_unit_price` and `trade_discount`; Tryton's `unit_price` is the net price, so amounts, taxes and invoices stay Tryton's.
- Charges (`nline.sale_charge`) live on the order; an applied, not yet invoiced charge becomes a line of the order's next invoice (`Sale.create_invoice`), or of its draft invoice when there is one (invoice method "on order" makes it at release). The invoice line's origin is the charge.
- Tax groups: the order's (or line's) tax group replaces the products' customer taxes on draft orders; a tax exempt customer / ship-to address gets no taxes.
- Credit: Hold Orders and the Order Limit are warnings to accept on save (Jobshop prompts), Hold Shipments a warning on ship.
- Field names shared with suppliers are prefixed `customer_` on party.party (`customer_fob_point`, `customer_ship_via`, `customer_tax_group`, `customer_tax_exempt`, `customer_freight_terms`, `customer_sic_code`, `customer_tax_id_number`, `customer_open_date`, `customer_specs`) so Purchasing can add its own. Address fields are `ship_to_*`. Carrier is `js_carrier` on sale and shipment (Tryton's carrier module would add `carrier`).
- The Customers tab's address fields (`sold_to_*`) are function fields on the party's first address.

## For the integrator

- `nline_js_sales/tryton.cfg` depends now also on `account`, `account_invoice`, `country`, `party`, `product`, `sale`, `stock` (all already installed with nline_desk). Update the module (`trytond-admin -u nline_js_sales`) — new tables and columns on party, address, sale, sale line, shipment.
- Data: step `js_sales` after `js_common` (it makes FOB points / ship vias / product and commodity codes a customer or order uses that the common step did not import) and after `sales` (orders by number). It only updates customers already imported as parties (by Jobshop ID = party code).
- `nline_desk`'s `sale_order_get` / `sale_order_save` are extended (super() kept): the old screen's calls still work; `sale_order_save` now accepts warnings (`accept_warnings`).
- Suggestions for shared files: none required. `js/orders.js`'s `customerWindow`, `salesOrder`, `shipping`, `invoicing` are superseded by sales.js at the same routes (they could be removed from orders.js later). Planning's "Changing the Status of Sales Orders" can call `sales_order_status(sale, status)`.
