# Sales area: Jobshop's windows against the ERP (analysis, 28 Oct 2026)

Sources: `C:\NLINE_ERP_dev\jobshop_analysis\layouts\VSales\*.txt` (cited
below as `VSales\<file>`), `jobshop_menus.txt`, `userguide.txt` ch. 13-17,
`erp_screens.txt` (the "is" side before this pass), NLINE_VJS (read-only
counts below). Code: `modules/nline_js_sales`,
`modules/nline_desk/web/js/jobshop/sales.js`, `migration/jobshop/sales.py`.

Status column: `done`, `left: reason`, `shared: needs <file>`.

## What N-Line's data uses (NLINE_VJS, 28 Oct)

| Table | Rows | Used | Never used (kept or left out, see gaps) |
|---|---|---|---|
| SALES_CUSTOMER | 266 | contact name 188, title 13, phone 126, fax 49, e-mail 35, mobile 2, ADDR_ETC 7, INACTIVE 70, POSTED (exported) 156, FOB 112, terms 202, recv acct 8, rev acct 5, specs 168, notes 8 | TAX_ID, TAX_GROUP, SIC, DISCOUNT_CLASS, CREDIT_LIMIT, CARRIER, currency, quote/sales instructions, footers, USER_0-23 |
| SALES_CUSTOMER_ADDRESS | 4 | name, address, contact, default | all overrides (tax, rep, FOB, ship via, carrier, discount), ADDR_ETC, mobile |
| SALES_CUSTOMER_PRICE / DISCOUNT_CLASS / DISCOUNT_PRICE | 0 | – | everything (Prices tabs, Discount Classes unused at N-Line) |
| SALES_SALES_ORDER | 1268 | status (1217 closed, 15 released, 12 unreleased, 3 hold, 21 cancelled), quote id 272, ship-to block 451, printed date 932, promise 40, FOB 495, ship via 76, specs 916, notes 33 | TAX_GROUP, DISCOUNT_CLASS, currency, USER_0-23 |
| SALES_ORDER_LINE | 4831 | drawing id/rev 2656, product code 3112, commodity 2037, account set 642, desired ship 102, promise 61, PO line 38, customer part 136, quote line no 705, commissionable 4812, specs 1057, progress billed 34, **USER_0 572 (drawing PDF path), USER_1 514 (its rev), USER_2 69 (a user)** | dimensions, line tax group, line ship via, alt currency, commission %, master rev, USER_3-33 |
| SALES_ORDER_LINK | 3115 | all | – |
| SALES_SHIPPER | 1669 | types SHIPMENT 1574, RETURN 77, PROGBILL 11, PROGCREDIT 2; shipped by 1270, payment due 1597, paid 251, posted 1626, tracking no 8 | tax group, currency, USER_0-23 |
| SALES_SHIPPER_LINE | 6724 | location 4592, weight 2884, tracking info 972, USER_0-2 (copied from the order line) | NMFC, package type, pallets, dimensions |
| SALES_SERVICE_CHARGE 20, CARRIER 2, SALESREP 8, TERRITORY 2, TAX_GROUP 1 | | ID, description/name | carrier code/route/COD/instructions, commission %, INACTIVE (reps: 4) |
| SALES_SIC, SALES_TAX, NMFC, PACKAGE_TYPE, BOL | 0 | – | unused at N-Line |

Selling U/M: 4795 of 4831 lines EA, ORDER_QTY = USER_ORDER_QTY on every
line: no unit conversion is used at N-Line.

## 1. Customers (`VSales\Customer.txt`, `CustomerSubTabs.txt`, `CustomerAddress.txt`)

Jobshop: tab **Customers** (header: Customer ID lookup, Inactive, Exported,
Date | frame 1: Name, Address (2 lines), City, State/Postal, Country, Etc. |
frame 2: Contact, Title, Phone, Fax, E-mail, Mobile, Acct Opened | Credit
Status, Last Order Date, Credit Limit, Total Released Orders), sub-tabs
**General** (Created by, Last Modified by, Supplier ID (ours), Terms ID,
Default Tax Group, Tax ID Number, Tax Exempt, Freight Terms, FOB Point ID,
Ship Via ID, Carrier ID, Sales Rep ID, Sales Territory ID, Discount Class ID,
SIC Code ID, Receivables Acct ID, Revenue Acct ID, Alternate Currency ID;
each code with its description), **Other** (USER_0-23), **Addresses** (grid
25 columns), **Prices** (Part ID, Selling U/M, Customer Part ID, Eng Master
Rev, Type, Do Not Use Price Breaks..., As of, Expires, Quantities grid,
Prices grid), **Specs**, **Special Instructions** (Estimating Quotes / Sales
Orders frames), **Notes**, **Quotes** (ID, Customer Reference, Shipto Name,
Status, Quote Date, Expiration Date, Quoted Lead Time, Won/Loss Date,
Won/Loss Reason), **Sales Orders** (13 columns); **Browse** (Show All;
Customer ID, Name, Address 1, Address 2, City, State, Postal Code).
Popups: PopupCustSalesOrders (View Sales Orders by Status of ▸ All /
Unreleased / Firm / Released / Closed / Hold / Cancelled, Sales Order
Lines..., Open Sales Order..., Open Quote...), PopupCustOrderLinesByStatus
(the Sales Order Lines window `CustomerOrderLines.txt`), PopupCustQuotes
(View Quotes by Status of ▸, View Quote Lines... `CustomerQuoteLines.txt`,
Open Quote...).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| C1 | ID in a header bar, duplicate ID field | ID lookup first field of the Customers tab | head bar + RO ID field | `customerWindow`: `idAt/idSplit/idField:'code'` | S | done |
| C2 | Fields not where Jobshop has them | two frames, positions | grid | placed `at`/`split` on Customers, General, Specs, Special Instructions | M | done |
| C3 | Inactive / Exported / Date missing | check boxes + RO date | Tryton Active (deactivates the party for purchasing too) | `party.customer_inactive`, `customer_exported`, `customer_exported_date` (set on export tick); Active dropped from the window | S | done |
| C4 | Contact, Mobile missing; Phone/Fax/E-mail read-only | editable | RO from contacts | `customer_contact`; `customer_phone/fax/email/mobile` function fields writing the first contact mechanism of the type | M | done |
| C5 | Account tab / Details tab are not Jobshop's | General tab | Account + Details | merged into General in Jobshop's order; Credit Status, Last Order, Credit Limit, Total Released Orders moved to the Customers tab | M | done |
| C6 | Description beside each code | type4 controls | none | `describe()` places a read-only box at Jobshop's place, from the picker's full name | S | done |
| C7 | Revenue Acct ID, Alternate Currency ID | fields | – | accounting stays the QuickBooks emulation; currency unused | – | left: accounting / unused |
| C8 | Other tab (USER_0-23) | 24 user fields | – | unused at N-Line | – | left: unused |
| C9 | Addresses grid columns / order | Addr No, Default, Name, Contact, Title, Address 1, 2, City, State, Postal, Country, Etc., Phone, Fax, E-mail, Mobile, Tax Exempt, Tax Group, Tax ID, Rep, Territory, FOB, Ship Via, Carrier, Discount Class | no Addr No, other order | Jobshop order, Addr No (= sequence, RO); Address is one Tryton text (Address 1/2 together); Etc. and Mobile unused on addresses; Tryton's Bill To / Ship To flags kept at the end | S | done |
| C10 | Addresses double-click dialog `CustomerAddress.txt` | dialog | inline grid | the grid edits every column of the dialog | M | left: grid kept (same fields) |
| C11 | Prices labels / columns | Do Not Use Price Breaks..., Part Description, Quantity | Use Part Price, Quoted | Jobshop labels and Prices grid columns | S | done (data unused) |
| C12 | Eng Master Rev on prices | list | – | unused at N-Line (0 price rows) | – | left: unused |
| C13 | Specs and Special Instructions tabs | own tabs | in Details | own tabs, placed; the footers stay on Special Instructions (no Jobshop tab shows them; data unused) | S | done |
| C14 | Quotes tab = Tryton quotations | Estimating quotes | sale.sale draft | `customerQuotesTab` reads `nline.quote` (engineering's model, read only) with Jobshop's columns + PopupCustQuotes (status submenu, View Quote Lines..., Open Quote...) | M | done |
| C15 | Sales Orders tab columns / popup | 13 columns; View ... by Status of ▸, Sales Order Lines..., Open Sales Order..., Open Quote... | 10 columns; Show <status> | Contact Name, ShipTo Name, Sales Rep added; the popup with a real submenu; Sales Order Lines window (`orderLinesDialog`, RPC `sales_order_lines`) | M | done |
| C16 | Browse columns | Address 1, Address 2 | Address, Balance | `sold_to_address_1/2` function fields; Balance dropped | S | done |
| C17 | Browse "Show All" | inactive customers hidden unless Show All | – | frame's `browseShowAll` filters Tryton's active, not Jobshop's Inactive (`customer_inactive`) | S | shared: needs frame.js `browseShowAll` with a domain option (e.g. `browseHidden: [['customer_inactive','=',false]]`) |
| C18 | Contacts / Invoices tabs | – | desk's | kept (extra, at the end) | – | done (kept) |
| C19 | ID lookup lists suppliers too | customers only | all parties | no customer flag on party (purchasing has `is_supplier`); left | S | left: needs a customer flag decision |

## 2. Sales Orders (`SalesOrder.txt`, `SalesOrderSubTabs.txt`, `SalesLine.txt`, `SalesCharge.txt`, `SalesOrderLines.txt`, `SalesOrderShipperLines.txt`, `NewSalesOrderFrom.txt`, `CreateSalesOrderFromQuote.txt`)

Jobshop: tab **Sales Order**: header frame (Order ID lookup, Equip List,
Customer ID + name, Order Date, Desired Ship Date, Purchase Order No,
Status (list), Promised Date | Sold to / Ship to blocks | Created by, Last
Modified by, Last Ship'd Date, Printed Date, Quote ID, Shipped Amount),
sub-tabs **Order Lines** (31 columns), **Sold To**, **Ship To**, **Specs**,
**Notes** (+ Copy Notes to Shipper), **Charges**, **Taxes**,
**Shippers/Invoices** (9 columns); under them Sales Rep / Territory / FOB /
Ship Via / Carrier | Terms / Freight Terms / Discount Class / Tax Group /
Receivables Acct (each with description), Alternate Currency frame,
Commission, Lines / Charges / Tax / Total. Tabs **Other** (USER_0-23),
**Browse** (Order ID, Customer ID, PO Ref#, Order Date, Status).
Menus: File > New Document From > Quote...; Edit > Copy / Paste / Delete
Document; Tools > Add Details, Edit Details, Re-number Lines, Change Status
▸ (UnReleased..., Firm..., Release..., Close..., Cancel...), Re-price Lines
▸ (All Lines, Selected Lines). Line popup (PopupCustWOLinks): Add Details...,
Edit Details..., Copy Line, Paste Line, Work Order Links, View All Quote /
Order / PO Lines for Part by Status of ▸, Open Part..., Open Part Supply and
Demand..., Material Availability..., Create RFQ for Part..., Purchase
Part..., Add Sub-Components, Calculate Sales Order Line Price.
Shippers/Invoices popup (PopupSalesOrderShippers): View Shippers by Shipper
Status of ▸, View Shipper Lines..., View All Shipper Lines by Shipper Status
of ▸, Open Shipper..., Open Invoice... Order Line window: General (Line No,
PO Line No, Line Status, Quote Line No, Part ID, Eng Master Rev, Calculate
Unit Price from Master, Description, Customer Part ID, Drawing ID/Rev,
Product Code, Commodity Code, Order Qty, U/M, Unit Price, Trade Discount %,
Extension, Commissionable, Commission %, Tax Group, Account Set, Revenue
Acct, dimensions, Desired Ship Date + Get Estimated, Ship'd Qty, Promised
Date, Last Shipped, Ship Via, Ship Dimensions, Progress Billed / Applied
Billed / Ship'd Amount, Alt currency), Other (USER_0-33), Specs, Links
(New, Work ID, Lot, Split, Quantity, Shipped Qty, Status, Description,
Desired / Scheduled Finish; Auto Number check box).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| S1 | Header layout | placed frame | grid + Terms + Memo | `UI.placedForm` header at Jobshop's places (Memo kept below) | M | done |
| S2 | Customer name beside the ID | type4 | – | read-only box | S | done |
| S3 | Status is a list | Status list on the header | badge + Change Status button | Status select (allowed changes run `sales_order_status`, confirm for Close/Cancel; a new order's status applied after the first save); Tools > Change Status kept with Jobshop's captions | S | done |
| S4 | Promised Date, Quote ID, Last Ship'd, Shipped Amount on header | header | Details tab | moved | S | done |
| S5 | Printed Date | header | – | `sale.js_printed_date`, set by Print (`sales_order_printed`), imported | S | done |
| S6 | Created / Last Modified by | header | – | from create/write user and date (`_who`) | S | done |
| S7 | Sold to / Ship to blocks | header text | tabs only | header blocks + tabs | S | done |
| S8 | Details are under the sub-tabs, not a tab | below | Details tab | placed form under the sub-tabs (Terms moved there), descriptions beside | M | done |
| S9 | Totals | Lines / Charges / Tax / Total | totals row | placed totals | S | done |
| S10 | Notes sub-tab | Notes | – | `UI.notesTab` on sale.sale; Copy Notes to Shipper unused (1 order) | S | done |
| S11 | Sub-tab order | Order Lines, Sold To, Ship To, Specs, Notes, Charges, Taxes, Shippers/Invoices | Details/Links/Browse mixed | Jobshop's order; main tabs Sales Order, Browse | S | done |
| S12 | Order Lines grid (draft) columns | 31 | 7 | PO Line No, U/M added; the rest (status, dates, avail., shipped, codes, drawing...) in the Order Line window and the released lines table; desk grid has no date/check columns | M | left: frame grid has text/number/picker kinds only (shared: date & check kinds in `UI.grid`) |
| S13 | Released lines table columns | 31 | 13 | 22 Jobshop columns (alt currency, commission, master rev, quotes exist, new WO, use sales ID: unused/left) | S | done |
| S14 | Order Line window | 4 tabs, ~40 fields | modal of 6 overrides | `lineWindow`: General (placed, frames), Other (User 0-2 + "!" opens the drawing file), Specs, Links (+ New Work Order) | M | done |
| S15 | Line fields missing | Drawing ID/Rev, Commissionable, Quote Line No, desired ship date per line, USER_0-2 | – | `sale.line.drawing_id/drawing_rev/commissionable/quote_line_no/js_desired_date/user_0..2`; the line's desired date drives the move's planned date (`planned_shipping_date`) | M | done |
| S16 | U/M of a line; unit conversion | selling U/M per line | product's sale U/M only | U/M column (sent as `unit`, same category as the part); `sales_price` prices the part in that U/M (context `uom`); cross-category conversions unused at N-Line | M | done |
| S17 | Commission %, Account Set, Revenue Acct, dimensions, Ship Via per line, Ship Dimensions, Eng Master Rev, Calculate Unit Price from Master, Get Estimated Desired Ship Date | fields | – | unused at N-Line or accounting (Account Set: QuickBooks emulation); master price calc belongs to Estimating | – | left: unused / accounting |
| S18 | Progress billing | Progress Billed / Applied amounts, PROGBILL shippers (11) | – | Tryton has no progress billing here | L | left: 11 shippers in 2026 data, needs a decision |
| S19 | Line popup | 15 items | 3 | Add Details..., Edit Details..., Copy Line, Paste Line, Work Order Links..., View All Quote / Order / PO Lines for Part by Status of ▸ (RPCs `sales_order_lines`, `sales_part_lines`), Open Part..., Calculate Sales Order Line Price | M | done |
| S20 | Supply and Demand, Material Availability, Create RFQ / Purchase Part, Add Sub-Components | popup | – | other areas' dialogs (inventory / purchasing / engineering) | M | shared: needs their dialogs exported (e.g. `UI.partSupplyDemand(product)`) |
| S21 | Double-click a line opens the Order Line window | yes | – | done (draft and released) | S | done |
| S22 | New From Quote copied Tryton quotations | Create Sales Order from Quote dialog on an Estimating quote | Tryton sale in quotation | `fromQuote` → lookup of `nline.quote` (Active/Ready) → dialog (Quote ID, Sales Order ID, Customer, Order Date, Quoted Leadtime, Desired Ship Date, PO No, Status; lines Include?, Order Qty, part, U/M, price, disc, Create WO From, leadtime, desired date, proj. avail, stock U/M) → `sales_order_from_quote` (price of the quantity break reached, codes, drawing, specs, quote line no; quote set Won with the order; engineering files untouched) | M | done |
| S23 | Create WO from quote master on copy | Jobshop makes WOs | – | New Work Order on the line's Links after release | M | left: noted (the planning/engineering WO creation) |
| S24 | Copy / Paste Document | Copy then Paste on a cleared window | Copy makes the new order at once | kept (one step), captions "Copy Document" / "Delete Document" | S | done |
| S25 | Re-price Lines ▸ All / Selected | Tools | Reset Prices button | ribbon "Re-price Lines" ▾ All Lines / Selected Lines (selected = right-click Calculate) | S | done |
| S26 | Re-number Lines | Tools | – | ERP lines are always numbered 1..n in order | – | left: not needed |
| S27 | Shippers/Invoices columns / popup | 9 columns, popup | 5 columns, one Open | per shipper with its Jobshop status, invoice ID / date / amount, credit applied (`_sale_documents`); PopupSalesOrderShippers with submenus, View Shipper Lines... (`sales_shipper_lines`), Open Shipper / Invoice | M | done |
| S28 | Taxes columns | Tax Group, Name, Description, Account, Percent, Amount | + Taxable | order Jobshop's, Taxable kept last | S | done |
| S29 | Browse columns | 5 | 7 | Jobshop's 5 | S | done |
| S30 | Other tab USER_0-23 (order) | user fields | – | unused at N-Line | – | left: unused |
| S31 | Equip List button, Alternate Currency, Commission | header / frames | – | unused at N-Line | – | left: unused |
| S32 | Sales order header still a desk form (head bar of UI.form) | no bar | UI.form ribbon + find | the ribbon is the window's menu; the ID is the first placed field | – | done |

## 3. Shipping (`Shipping.txt`, `ShippingSubTabs.txt`, `ShipperLine.txt`, `ShipperCharge.txt`, `ShipperOrderLines.txt`, `PackageType.txt`, `nmfc.txt`, `HDH_UnpricedShipperLines.txt`)

Jobshop: **Shipping Activity** (Show Sales Orders with a Desired Ship Date
On or Before [date], Show Only Orders where 'Some Can Ship'; grid Some Can
Ship, Sales Order ID, Shipper ID, Return, Desired Ship, Carrier ID,
Customer, PO Ref No, Ship To Name, Message; a second grid of orders),
**Shipper** (header frame: Shipper ID, Sales Order ID, Customer ID, Shipped
Date, PO No, Status | Ship/Return button, Sold to / Ship to | Created by,
Last Modified by, Order Date, Invoice Printed Date, Payment Due Date,
Invoice ID, Invoiced Date; sub-tabs Shipper Lines (Close Short, Line No, SO
Line No, Line Desired Ship Date, Part ID, Description, Could Ship Qty, Ship
Qty (stock U/M), Stock U/M, Ship/Rtn Qty (selling U/M), Selling U/M,
Location, Loc Qty Avail, Ship Via, Transacted, Tracked, Lot Tracking...,
Linked, Eng Master Rev), Sold To, Ship To, Specs, Notes, Charges; details
FOB / Ship Via / Carrier / Tracking No / Shipped By | Tax Group / Terms /
Freight Terms / Discount Class / Receivables Acct), **Other**, **Browse**
(Shipper ID, Sales Order ID, Customer Name, Shipper Status, Shipper Type).
PopupShipping: Filter..., Ship, Return, Edit Shipper, Open Sales Order...,
Sales Order Lines... Package Types and NMFC code grids. N-Line's own
`HDH_UnpricedShipperLines`: "Set Shipper Line Unit Price" (Shipped Date,
Customer ID, Sales ID, Sales Line No, Shipper ID, Line No, Customer PO, PO
Line No, Shipped Qty, Unit Price editable).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| H1 | Tabs | Shipping Activity, Shipper (with sub-tabs), Other, Browse | 7 flat tabs | Activity, Shipper (header + sub-tabs Shipper Lines, Sold To, Ship To, Specs, Notes, Charges + details), Browse | M | done |
| H2 | Activity filters | horizon date, Some Can Ship only | View select | both (RPC `sales_shipping_activity(shipped, horizon, can_ship_only)`); the view select kept | S | done |
| H3 | Activity columns | Some Can Ship, Carrier ID, Ship To Name | – | added (stock of the parts in the warehouse) | S | done |
| H4 | Second grid (orders) | GRID_ORDER | – | its use is not described in the guide / help | – | left: unknown purpose |
| H5 | PopupShipping | Ship, Return, Edit Shipper, Open Sales Order..., Sales Order Lines... | Open, Ship, Receive Return, Mark for Return | Jobshop's captions; Sales Order Lines... (`orderLinesDialog`); View Unshipped / Shipped as checked items | S | done |
| H6 | Shipper header placed; Ship/Return button | frame | info grid | placed header with the Ship / Return button | M | done |
| H7 | Status | Unapproved / Approved / Cancelled (invoice approval) | Tryton state | `_shipper_status` (Approved = its invoice posted) | S | done |
| H8 | Invoice ID, Invoiced Date, Payment Due Date, Shipped By | header / details | Invoice IDs only | from the shipment's own invoices (stock moves), Shipped By = who did it | S | done |
| H9 | Invoice Printed Date | header | – | Tryton keeps no print date | S | left: shown empty |
| H10 | Shipper Lines columns | 19 | 12 | Close Short, Could Ship, stock qty / U/M, selling qty / U/M, Linked added in Jobshop's order; Ship Via per line, Tracked, Lot Tracking (972 lines have tracking text), Eng Master Rev left | M | done / left: lots not installed (Tryton stock_lot) |
| H11 | Close Short | check box: ship less, close the line | always back order | `sales_ship` lines `close_short` → `_close_short` cancels the back order moves (ignored by the order), closes the line, cancels an emptied back order shipper | M | done |
| H12 | Notes sub-tab | Notes | – | `UI.notesTab` on the shipment | S | done |
| H13 | Shipper line dialog `ShipperLine.txt` (weight, cartons, location override, tracking) | dialog | – | weight used (2884 lines) but no ERP field; packages not installed | L | left: needs stock_package / weight fields (inventory) |
| H14 | Shipper charges (own charges) | SHIPPER_CHARGE add/delete | the order's charges | kept: order charges applied on the shipment | M | left: design decision kept |
| H15 | Browse | 5 columns | – | Browse tab (`sales_shipper_browse`) | S | done |
| H16 | Package Types, NMFC | code grids | – | unused at N-Line (0 rows) | – | left: unused |
| H17 | Other tab | USER_0-23 | – | unused at N-Line | – | left: unused |
| H18 | Set Shipper Line Unit Price (N-Line custom) | grid | – | Invoicing ribbon + popup "Set Shipper Line Unit Price" (`sales_unpriced_lines` / `sales_unpriced_save`: the draft invoice lines of shipped order lines at price 0) | M | done |

## 4. Invoicing (`Invoicing.txt`, `InvoicingSubTabs.txt`)

Jobshop: **Invoicing Activity** (Shipper ID, Order ID, Name, Shipped Date,
Shipped Amount, Shipper Type), **Invoice** (header: Invoice ID lookup,
Shipper ID, Sales Order ID, Customer ID, Shipped Date, PO No, Status; type,
Bill to / Ship to, Invoice button; Created / Modified, Payment Due Date,
Order Date, Invoice Printed Date, Invoiced Date, Exported + Date, Paid
Amount, Paid; sub-tabs Invoice Lines (16 columns), Bill To, Ship To, Specs,
Notes, Charges, Taxes; details FOB / Ship Via / Carrier / Freight Terms |
Tax Group / Terms / Discount Class / Receivables Acct; totals), **Other**,
**Browse** (Invoice ID, Shipper ID, Sales Order ID, Customer Name, Shipper
Status, Shipper Type, Posted). PopupInvoicing: Filter..., Invoice, Edit
Invoice, Open Sales Order...

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| I1 | Tabs | Activity, Invoice (sub-tabs), Other, Browse | 8 flat tabs | Activity, Invoice (placed header, sub-tabs, details, totals), Browse | M | done |
| I2 | Activity columns | Shipped Amount, no Reference | Reference, Amount | Jobshop's | S | done |
| I3 | Popup | Invoice, Edit Invoice, Open Sales Order... | Open, Invoice | Jobshop's (+ Set Shipper Line Unit Price) | S | done |
| I4 | Invoice ID lookup on the header | field | "Find an invoice" | placed Invoice ID lookup | S | done |
| I5 | Payment Due, Paid Amount, Paid | header | – | from lines to pay / amount to pay | S | done |
| I6 | Exported + Date, Invoice Printed Date | header | – | QuickBooks emulation (accounting) | – | left: accounting |
| I7 | Invoice Lines columns | PO Line, stock / selling qty and U/M, Transacted | 9 | added | S | done |
| I8 | Notes sub-tab | Notes | – | `UI.notesTab` on the invoice | S | done |
| I9 | Browse | 7 columns | – | `sales_invoice_browse` | S | done |
| I10 | Alternate currency, Applied Billed Amount | fields | – | unused / progress billing (S18) | – | left |

## 5. Code tables

| # | Window | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| K1 | Service Charges (`ServiceCharge.txt`) | one editable grid: ID, Description, Amount, Account ID, Inactive | master form + Browse | `codeGrid` (all rows, Inactive = not active, Add Row / delete, Save) | M | done |
| K2 | Sales Reps (`SalesRep.txt`) | grid: ID, Name, Commission Percent, Inactive | master | `codeGrid` | S | done |
| K3 | Territories (`Territory.txt`) | grid: ID, Description, Inactive | master | `codeGrid` | S | done |
| K4 | SIC Codes (`SIC.txt`) | grid | master | `codeGrid` (0 rows at N-Line) | S | done |
| K5 | Carriers (`Carrier.txt`) | grid: ID, Name, Shipper Instructions, Carrier Code, Route, COD Charge, Inactive | master | `codeGrid` | S | done |
| K6 | Tax Groups (`SalesTaxGroup.txt`) | ID + Inactive + Description, taxes grid on the same tab; Browse Inactive, ID, Description | ID, Description, Active; Taxes tab | ID placed (`idAt`), Active beside it, Description placed; "Percent"; Browse Inactive column (`inactive` function field) | S | done; taxes grid on its own tab: left (could use the frame's fields+render tab) |
| K7 | Discount Classes (`DiscountClass.txt`) | Created / Modified, ID, Inactive, Description, Discount %, Part Prices frame | Prices tab | placed fields, "Part Prices" tab, Browse Inactive | S | done (data unused) |
| K8 | Inactive check box | Inactive | Active | Tryton's active shown as "Active (not Inactive)" on the forms; grids show Jobshop's Inactive | S | done |

## Menus

The sales menus of `jobshop_menus.txt` are covered above: PopupShipping
(H5), PopupShipperStatus / PopupShipperLinesByStatus /
PopupSalesOrderShippers (S27), PopupInvoicing (I3), PopupCustSalesStatus /
PopupCustSalesOrders / PopupCustOrderLinesByStatus (C15), PopupSalesOrderLines
(the Sales Order Lines window's own popup: All Order Lines by Order Status
of ▸, Open Sales Order..., Open Customer...), PopupCustWOLinks (S19),
PopupCustQuotes (C14); the Browse filter items (Filter Including /
Excluding / by, Remove Filters, Save widths, Export to Excel) belong to the
frame's Browse (shared).

## Counts

Gaps found: 87 (Customers 19, Sales Orders 32, Shipping 18, Invoicing 10,
code tables 8). Closed: 56. Left: 31 (unused at N-Line 13, accounting 4,
shared / other areas 5, needs a decision or Tryton module 9).

## Screen review fixes (SCREEN_REVIEW.md, 28 Oct, second pass)

Supersedes the rows above where they differ (S10, S13, S17 commission % and
line ship via, H-rows on the shipper header, invoicing header).

| Route | Finding | Status |
|---|---|---|
| shipping_3 | [broken] Shipper Lines rows wrapping | done: line grids `nowrap`, Description clipped (full text in the tooltip), Part ID = ID with the name as tooltip |
| shipping_3 | Shipper Lines columns Ship Via, Tracked, Lot Tracking No/Quantity; Line Desired Ship Date blank | done (desired date falls back to the order's; Tracked / Lot from the part / move when Tryton has them); Eng Master Revision left: no master on a shipper line (unused) |
| shipping_3 | Status a text box; Sold to / Ship to captions; SHIP_OR_RETURN drawn as input; Customer ID shows the name | done (read-only list, captions, a caption beside the Ship button, `customer_code` from the server) |
| shipping_3 | Shipping Activity: GRID_ORDER missing, Some Can Ship a check box, Desired Ship / Carrier blank, extra Status | done (released orders grid beside it, double-click opens the order; check boxes; desired falls back to the order's; Status column removed). Carrier is blank where the order has none (data) |
| shipping_3 | Other tab | left: USER_0-23 unused at N-Line |
| shipping | Terms ID / Receivables Acct ID description boxes | done |
| shipping | Ship To tab editable (Clear Address) | left: shows the shipment's delivery address read-only in Jobshop's layout; the address is chosen on the order |
| orders_25 | [broken] Receivables Acct ID clipped, no description | done: code + description box (orders, shipping, invoicing) |
| orders_25 | Terms ID a drop-down | done: lookup + description box (the terms' description, else its name: Tryton terms have no code) |
| orders_25 | Customer ID shows the name | already the ID (party code) on the current frame |
| orders_25 | Sold to / Ship to captions | done |
| orders_25 | extra Memo field | done: removed from the header (Tryton's description is kept on save) |
| orders_25 | Sold To / Ship To read-only | done: the order's own address `js_sold_*` / `js_ship_*` (14 fields each, editable, Jobshop's layout), filled from the customer / ship to address until saved; Restore Default Address, Ship To Name lookup (the customer's addresses), Add New (makes a ship to address of the customer), Clear Address, Ship To Customer ID / Address No, Export Contact to Outlook (a vCard file). The header boxes follow the tabs |
| orders_25 | Notes: Copy Notes to Shipper | done: `js_copy_notes`; shipping copies the order's notes to the shipper |
| orders_25 / orders_new | Order Lines grid columns | done: Line No, PO Line No, Line Status, Line Desired Ship Date, Last Shipped Date, Avail. to Promise, Part ID, Description, U/M, Order Qty, Unit Price, Trade Disc%, Extension, Specs, Product Code, Commodity Code, Linked, Commissionable, Commission Percent, Commission, Customer Part ID, Drawing ID, Drawing Rev, Ship Via, Quote(s) Exist (draft grid editable, released table read-only). New fields `sale.line.commission_percent`, `js_ship_via`. Left: Alt Currency columns (no currency at N-Line), New Work Order / Use Sales ID as Work ID (the ERP makes the work order from the line's right-click), Eng Master Revision (no master link on the line) |
| orders_25 | Equip List button | left: not documented in the user guide / help, unused |
| orders_25 | Charges: Applied Amount / Applied to columns | kept: they show which invoice took the charge (real function) |
| orders_25 | (found while testing) Save deleted the lines without a part | fixed: description lines are kept |
| customer-window_67 | [broken] General misalignment from Freight Terms down | done: Jobshop's own layout steps 2 units (19 vs 17); aligned to 17 |
| customer-window_67 | Created by / Last Modified by with "..." and no date | done: read-only "user mm/dd/yyyy hh:mm" |
| customer-window_67 | Terms ID description empty; extra Open balance / Open Orders | done (description filled; extras removed: the customer card shows the balance) |
| customer-window_67 | Revenue Acct ID, Alternate Currency ID | left: accounting (QuickBooks emulation) / currency unused |
| customer-window_67 | Customers tab Address one box | done: Address 1 / Address 2 fields (setter on `sold_to_address_1/2`) |
| customer-window_67 | [broken] Addresses grid narrow, Addr No empty | widths: integrator's desk.css; Addr No = the address ID (N-Line's addresses have no sequence) |
| customer-window_67 | Addresses: Address 2, Etc., Contact Mobile; Other tab; Prices header | left: Tryton keeps one street text; Etc. / Mobile / USER fields / prices unused at N-Line (0 price rows) |
| customer-window_67 | extra Contacts / Invoices tabs | kept after Jobshop's tabs (contact mechanisms, invoice history) |
| invoicing_273 | Invoice Printed Date, Exported + Date | done: `account.invoice.js_printed_date` (set on print / post, allowed on posted invoices), Exported = posted, Date = the move's post date |
| invoicing_273 | Bill to / Ship to show only the name; captions | done (falls back to the customer's invoice / delivery address) |
| invoicing_273 | Invoice Lines: Shipped Amount, Applied Billed Amount; extra Order column; Ship Qty / Unit Price editable | done (read-only as Jobshop; Set Shipper Line Unit Price prices unpriced lines) |
| invoicing_273 | "Open in Tryton" button; Status a text box | done (removed; read-only list) |
| invoicing_273 | Bill To editable; Other tab | left: the invoice's address is accounting's; USER fields unused |
| discount-classes / sales-tax-groups | "Active (not Inactive)" | done: Jobshop's Inactive (written back as Tryton's Active) |
| discount-classes | Part ID / Selling U/M pricing on the main tab | left: Part Prices tab kept (0 rows at N-Line) |

## For the integrator

- 28 Oct (screen review): update `nline_js_sales` again: new fields
  sale `js_sold_*` / `js_ship_*` (14 each), `js_copy_notes`; sale.line
  `commission_percent`, `js_ship_via`; account.invoice `js_printed_date`;
  setters on party `sold_to_address_1/2`. New RPC `sales_invoice_printed`.
  Then rerun step `js_sales` (imports the order address block,
  COPY_NOTES, line COMMISSION_PERCENT / SHIP_VIA).

- Module update `nline_js_sales` (new fields: party `customer_inactive`,
  `customer_exported`, `customer_exported_date`, `customer_contact`, function
  fields `customer_phone/fax/email/mobile`, `sold_to_address_1/2`; sale
  `js_printed_date`; sale.line `js_desired_date`, `drawing_id`,
  `drawing_rev`, `commissionable`, `quote_line_no`, `user_0`, `user_1`,
  `user_2`; `inactive` function field on the code tables; 4 messages). Then
  rerun step `js_sales` (imports the new fields).
- New RPCs: `sales_order_printed`, `sales_quote_get`, `sales_order_from_quote`,
  `sales_order_lines`, `sales_part_lines`, `sales_shipper_lines`,
  `sales_shipper_browse`, `sales_invoice_browse`, `sales_unpriced_lines`,
  `sales_unpriced_save`; `sales_price` takes an optional unit;
  `sales_shipping_activity` takes horizon and can_ship_only; `sales_ship`
  lines take `close_short`.
- Quotes: `sales_order_from_quote` uses `nline.quote` when nline_js_engineering
  is installed (no dependency added; a clear message otherwise).
- frame.js: `browseShowAll` with a domain (C17); `UI.grid` date / check
  column kinds (S12); a way to call other areas' part dialogs from a line
  popup (S20).

## Test results

- `test.ps1 nline_js_sales`: 25 tests OK (scenario extended: Order Line
  fields, printed date, contact fields, exported date, order lines window,
  Some Can Ship, shipper status, Shippers/Invoices rows, shipper lines,
  shipper browse, Close Short; the migration with the new columns).
  `sales_order_from_quote` is not in the scenario (nline_js_engineering is
  not a dependency of this module's test).
- `jscheck.py sales.js`: OK.
- Battery (`run_battery.py`, port 9343, local server still on the OLD
  nline_js_sales Python, 28 Oct): orders/25, orders/new, shipping,
  shipping/3, invoicing, invoicing/273 run through (service charges, tax
  groups, reps, discount classes, customer-window/67 still running when this
  was written). Findings:
  - every call to a NEW service (`sales_shipper_browse`,
    `sales_invoice_browse`, `sales_unpriced_lines`, `sales_order_lines`)
    answers "Your session has expired" (403: the method is unknown to the
    old module) — expected until the module is updated; the Customers
    window reads the new party fields and needs the update too. Rerun the
    battery after the integrator's update.
  - "Choose the customer" on Save of orders/25: the battery clicks before
    the order has loaded (a probe with 6 s wait shows 26-1371 with its 5
    lines loaded, no console error) — timing, not a defect.
  - "Tick the invoices to post" on Post Selected with nothing ticked: now a
    toast, not an error dialog (fixed).
  - Invoice / Print "blocked by the browser": headless Chrome blocks the
    report pop-up (harness), not a defect.
  - orders/25 screenshot checked: header, sub-tabs, details with
    descriptions and totals placed as Jobshop's layout; shipping activity
    with the horizon / Some Can Ship controls.
