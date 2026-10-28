# Purchasing — Jobshop's windows against the ERP

Sources: `C:\NLINE_ERP_dev\jobshop_analysis\layouts\VPurchasing\*.txt`
(cited as `layouts\…`), `jobshop_menus.txt` / `vjs_menus_raw.txt`, the
help topics, N-Line's Jobshop data (NLINE_VJS, read only, 28 Oct 2026). The
ERP side: `modules/nline_desk/web/js/jobshop/purchasing.js`,
`modules/nline_js_purchasing`. Status: `done`, `left: reason`, `shared:
needs <file>`. Sizes S / M / L.

## What N-Line's data uses (column profile of the PURCHASING_* tables)

- Never used (fields may stay, not built): alternate currency (every
  `ALT_CURRENCY_*`), piece dimensions (`LENGTH/WIDTH/HEIGHT/DIMENSIONS_UM`
  on RFQ, PO and receiver lines), `SUPPLIER.SIC_CODE`, `SUPPLIER.TAX_GROUP_ID`,
  `SUPPLIER.PAYB_GL_ACCT_ID`, `INCO_TERMS`, the footers (`*_FOOTER`), RFQ
  ship-to addresses, the RFQ slot tax groups, `PURCHASING_TAX_GROUP` /
  `PURCHASING_TAX` / `PURCHASING_ORDER_TAX` (0 rows), `SUPPLIER_SERVICE`
  (0 rows), `SUPPLIER_SERVICE_ID` on lines, `RECEIVER_LINE.INVOICE_ID`.
- User defined fields (labels in `PURCHASING_OBJECT_GLOBAL`: USER_0
  "N-LINE FIELD", USER_1 "NOTES:", USER_2 "AUDIT DATE:"; USER_3..6 labelled
  but empty): SUPPLIER USER_0 114 (supplier category: "MACHINING SERVICES",
  "RAW MATERIAL SUPPLIER"…), USER_1 3, USER_2 89 (audit dates);
  PURCHASE_ORDER USER_0 19, USER_1 3, USER_2 357 (2006–2009); ORDER_LINE
  USER_0 5000 (the part's drawing file `R:\NLine_Released\…pdf`), USER_1
  4770 (revision letter), in use today; RFQ_LINE the same pair (450);
  RECEIVER / RECEIVER_LINE copies of the PO's. Emulated: supplier, PO, PO
  line, RFQ line (the receiver line shows its PO line's).
- Used and new to the ERP now: `CONTACT_MOBILE` (47 suppliers),
  `ORDER_LINE.DRAWING_ID/REV` (10 265 lines), PO / RFQ / receiver notes
  (602 / 2 / 90), `RECEIVER_LINE.TRACKING_INFO` (9 286, lot numbers),
  `ACCOUNT_SET_ID` (accounting: noted only).

## 1. Suppliers (`layouts\VPurchasing\Supplier.txt`, `SupplierSubTabs.txt`)

Jobshop: tabs Suppliers (Created / Last Modified by; Supplier ID lookup,
Inactive; left frame Name, Address ×2, City, State/Postal, Country, Etc.;
right frame Contact, Title, Phone, Fax, E-mail, Mobile, Web URL; row
Account Opened Date, Last Order Date, Exported + Date), sub-tabs General
(Buyer, Our Customer ID; Terms ID, Default Tax Group, Tax ID Number, Tax
Exempt; Freight Terms, FOB Point ID, Ship Via ID, SIC Code ID; Expense /
Payable Acct ID; Alternate Currency ID — each code with its description),
Other (USER_0..23), Addresses (grid Addr No … Contact Mobile), Part Prices
(fields + Quantities grid + price list grid), Service Prices, Specs, Special
Instructions (RFQ / PO frames), Notes, Request For Quotes (grid ID, RFQ
Status, RFQ Date, Receive On Date, Due Date, Buyer), Purchase Orders (grid
ID, Order Status, Order / Receive On / Promise Date, Order / Received
Amount, Last Recv Date); Browse (Show All; Supplier ID, Name, Address 1/2,
City, State, Postal Code). Popups: PopupSupplierPurchaseOrders (Purchase
Orders by Status of ▸, Purchase Order Lines…, All Purchase Order Lines by
Order Status of ▸, Open Purchase Order…), PopupSupplierRequestForQuotes
(RFQs by Status of ▸, RFQ Lines…, All RFQ Lines by RFQ Status of ▸, Open
RFQ…), the lines windows `SupplierPurchaseOrderLines.txt` /
`SupplierRFQLines.txt` (PopupPurchaseOrderLines, PopupRFQLines). Tools:
Create RFQ for Supplier…, Create Purchase Order for Supplier….

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|------------|-----|------|--------|
| 1 | different | ID lookup is the first field of the Suppliers tab | header bar | `UI.master idAt/idSplit/idField/idLength` (jsSupplierWindow) | S | done |
| 2 | different | fields placed in two frames + account row | grid in another order, dates on Account tab | `at`/`split`/`frames` from the layout | M | done |
| 3 | missing | Mobile | — | `party.supplier_mobile` (contact mechanism mobile), migration CONTACT_MOBILE | S | done |
| 4 | different | labels Contact, E-mail | Contact Name, Contact E-Mail | relabelled | S | done |
| 5 | missing | Created by / Last Modified by | — | `stamp()` (create/write user + date) in the tab's top row | S | done |
| 6 | different | tab General | "Account" | renamed, Jobshop's order and positions; codes with their description beside (`describe()`) | M | done |
| 7 | missing | Other tab (user fields) | — | `supplier_user_0..2` (N-LINE FIELD, NOTES:, AUDIT DATE:) + migration; USER_3..23 unused | M | done |
| 8 | different | Specs and Special Instructions are two tabs | one Specs tab | split; instructions in Jobshop's two frames | S | done |
| 9 | missing | Request For Quotes tab + popup + RFQ Lines window | — | `supplierRfqsTab`, `rfqLinesDialog` | M | done |
| 10 | different | PO tab popup: by Status of ▸ (one status), PO Lines…, All PO Lines by Order Status ▸, Open PO… | status toggles only | `supplierPurchasesTab` menu, `poLinesDialog` (Jobshop's columns, its own popup: View Work Order Links…, Open Purchase Order…, Open Supplier…) | M | done |
| 11 | different | Part Prices columns Part ID, Purchase U/M, Supplier Part ID, Mfg, As of, Expires, Part Description | other order, Quoted | reordered; Service Prices: As Of / Expires | S | done |
| 12 | missing | Tools: Create RFQ / Create PO for Supplier | "New PO", "Web URL" buttons | `Tools ▾` (Create RFQ for Supplier…, Create Purchase Order for Supplier…, Web URL), shown per rights and screen access; `rfqs?supplier=` presets Supplier 1 | S | done |
| 13 | missing | Addresses: Addr No, Contact Mobile | — | Addr No = the address's `sequence` (read-only column); SUPPLIER_ADDRESS.CONTACT_MOBILE unused | S | done (Mobile: unused) |
| 14 | missing | SIC Code ID, Alternate Currency ID | — | unused at N-Line | — | left: unused |
| 15 | missing | Browse "Show All" | — | inactive is `supplier_inactive`, not `active`: the browse shows all suppliers already | S | left: n/a |
| 16 | extra | Invoices tab, Open balance | — | kept (the desk's, owner asked earlier) | — | kept |

## 2. Request For Quotes (`RequestForQuote.txt`, `RequestForQuoteSubTabs.txt`, `RequestForQuoteLine.txt`, `QuoteQuantities.txt`, `CreatePurchaseOrderFromRFQ.txt`)

Jobshop: tab Request For Quote (Created/Modified; RFQ ID, RFQ Date,
Desired Recv Date, RFQ Status, FOB / Ship Via / Terms / Payable with
descriptions; right: Quote Due Date, Freight Terms, Buyer, Printed Date;
button Preview / Create PO; sub-tabs RFQ Lines (Line No, Line Status, Line
Type, Line Desired Receive Date, Lead Time, Minimum Order Qty, Quote
Qty(s)…, Part ID, Service ID, Description, Purchase U/M, Mfg Name, Mfg Part
ID, Exp Acct ID, Linked, PO Line Exists), Ship To, Other, Specs, Notes (+
Copy Notes to Purchase Order)); Supplier 1/2/3 (Supplier ID, Quote
Received, Tax Group, Supplier Ref No, As Of, Expiration, currency; address
frame; supplier line grid with editable prices; popup PopupRFQSupplierLines
"Update Supplier Pricing from Selected Rows"); Browse (RFQ ID, Quote Date,
Quote Status, Due Date, Supplier 1/2/3 ID). Line window: Request For Quote
Line, Suppliers, Other, Specs, Links.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|------------|-----|------|--------|
| 1 | different | header placed, Jobshop's order | grid | `at`/`split` | S | done |
| 2 | different | tab order RFQ, Supplier 1-3, (sub) Ship To, Specs, Notes | Ship To before suppliers | reordered | S | done |
| 3 | missing | Notes tab | — | `UI.notesTab` on nline.rfq | S | done |
| 4 | missing | RFQ Lines: Line Status, Line Desired Receive Date, Lead Time, Minimum Order Qty | — | grid columns; lead time / min qty from the part (`js_rfq_get`) | S | done |
| 5 | different | Part ID and Service ID columns | one "Part ID / Service ID" | two columns (one clears the other, Line Type follows) | S | done |
| 6 | missing | Supplier grid columns Trade Disc %, Delivery Date, Lead Time, separate Supplier Part / Service ID | fewer | added | S | done |
| 7 | missing | Update Supplier Pricing from Selected Rows | — | check boxes + right-click; RPC `js_rfq_update_pricing` (break table of the quoted quantities) | M | done |
| 8 | different | supplier prices edited in the supplier grid | in the line window | kept (line window) | M | left: same data |
| 9 | different | Preview/Create PO dialog: grid of all lines × 3 suppliers, Include?, totals per supplier | supplier select + quantity per line | kept | M | left: works, simpler |
| 10 | missing | Browse Supplier 1/2/3 ID | Supplier 1 only | 3 columns (codes) | S | done |
| 11 | missing | Line window Other tab (USER_0/1) | — | `nline.rfq.line.user_0/1` + migration, Other tab of the line window | S | done |
| 12 | missing | Copy Notes to Purchase Order | — | 2 RFQs use it | S | left: unused |
| 13 | missing | Currency, dimensions, Account Set ID | — | unused / accounting | — | left |

## 3. Purchase Orders (`PurchaseOrder.txt`, `PurchaseOrderSubTabs.txt`, `PurchaseLine.txt`, `PurchaseOrderLines.txt`, `PurchaseOrderReceiverLines.txt`)

Jobshop: tab Purchase Order (frame: Order ID, Supplier ID, Order Date,
Receive On Date, Status, Supplier Quote Ref; Purchase From and Ship To
address boxes; Promised, Last Recv'd, Printed Date; sub-tabs Order Lines,
Purchase From, Ship To, Specs, Notes, Taxes, Receivers; Details frame
Buyer, FOB, Ship Via, Tax Group | Terms, Freight Terms, Payable Acct,
Request For Quote ID; Tax / Total), Other, Browse (Order ID, Supplier ID,
Name, Order Date, Status). Order line grid: Line No, Line Status, PO Line
Type, Line Desired Receive Date, Last Recv'd Date, Order Qty, Total Recv'd
Qty, Part ID, Service ID, Description, Purchase U/M, Unit Price, Trade
Disc %, Fixed Charge, Extension, Exp Acct ID, Promise Date, Linked, Mfg
Name, Mfg Part Id. Order Line window: one tab with frames (line, Purchasing,
Dimensions, Receiving, Alternate Currency), Other, Specs, Links. Receivers
popup PopupPurchaseOrderReceivers. Status menu PopupStatus.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|------------|-----|------|--------|
| 1 | different | header frame placed, Status field, address boxes, Promised / Last Recv'd / Printed on the header | grid + Details tab | `at`, read-only Status, Purchase From / Ship To boxes (`poTexts`) | M | done |
| 2 | different | Details frame under the lines | Details tab | `after` fields under the line grid (docWindow) | M | done |
| 3 | different | line grid columns and order; Part ID and Service ID columns; Line Status list | combined product, status display | Jobshop's columns; Part ID / Service ID pickers (one clears the other); Line Status Open/Closed (closes by hand) | M | done |
| 4 | different | Order Line window one tab with frames, RFQ ID / Line No, Drawing ID/Rev, Extension, Received Amount | 2 tabs | placed tab; `purchase.line.drawing/drawing_revision` | M | done |
| 5 | missing | Other tab (PO and line user fields) | — | `purchase.purchase.user_0..2`, `purchase.line.user_0/1` (Eng Parts List, Part Number Rev), migration | M | done |
| 6 | missing | Notes tab | — | `UI.notesTab` on purchase.purchase | S | done |
| 7 | missing | Receivers popup (by Status of ▸, Receiver Lines…, All Receiver Lines by Status ▸, Open Receiver…) | toggles | `poReceivers` menu, `receiverLinesDialog` | M | done |
| 8 | missing | View: Purchase Order Lines…, Receiver Lines…; Tools: Receive…, Open Supplier…, Open RFQ… | — | ribbon `Tools ▾` / `View ▾` (docWindow `menus`) | S | done |
| 9 | different | Browse Supplier ID, Name | Supplier rec_name, Total | `party.code`, `party.name` (dotted columns) | S | done |
| 10 | different | Purchase From editable per order | the supplier's address | `purchase.purchase.purchase_from_*` (Name … Mobile), placed tab, Name "…" picks a supplier address, filled from the supplier when chosen; migration NAME/ADDR_1… | M | done |
| 11 | missing | Restore Default Address / Export Contact to Outlook | — | buttons placed; Export = a vCard (.vcf) download | S | done |
| 12 | missing | Copy Notes to Receiver | — | 50 POs | S | left: notes stay on the PO |
| 13 | different | lines editable while released | Tryton keeps a confirmed purchase's lines | known gap | L | left: Tryton |
| 14 | missing | unit conversions on purchase lines | — | known gap (purchase U/M = part's) | L | left |
| 15 | missing | Alternate Currency frame, Dimensions frame | — | unused | — | left |

## 4. Receiving (`Receiving.txt`, `ReceivingSubTabs.txt`, `ReceiverLine.txt`, `ApplyFreightCharge.txt`, `UpdatePartCostsFromReceiver.txt`)

Jobshop: Receiving Activity (Show Purchase Orders with a Desired Receive
Date On or Before; grids of orders to receive / received), Receiver (frame
Receiver ID, Order ID, Supplier ID, Order Date, Received Date, Receiver
Status; Created/Modified; Purchase From box; Invoice ID, Invoiced Date,
Payment Due Date, Exported + Date; Receive button; sub-tabs Receiver Lines
(Close Short, Line No, PO Line No, Line Desired Receive Date, Part ID,
Service ID, Description, Receive Qty (Stk U/M), Stock U/M, Rec/Rtn Qty,
Purchase U/M, Unit Price, Disc %, Fixed Charge, Received Amount, Location
ID, Tracked, Tracking No/Quantity…, Mfg Name, Mfg Part Id), Receive From,
Specs, Notes; Details frame Buyer, FOB, Ship Via, Received By | Tax Group,
Terms, Payable), Other, Browse (Receiver ID, PO ID, Supplier Name, Status,
Type). PopupReceiving: Receiving View, filters, Receive, Return, Edit
Receiver, Open Purchase Order…, Purchase Order Lines…. PopupReceiverLines:
Edit Details…, View Supply and Demand…, Open Part…. Tools: Apply Fixed
Charge… (dialog: Charge Amount, Method radios, How to Apply radios).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|------------|-----|------|--------|
| 1 | missing | Desired Receive Date On or Before | — | date filter on the activity | S | done |
| 2 | different | tabs Receiving Activity, Receiver, Receive From, Specs, Notes, Browse | Receivers, Details, Specifications | renamed; Details frame under the lines; Notes and Browse added | M | done |
| 3 | different | receiver frame placed; invoice fields in it | grid; invoice on Details | `at` from the layout | S | done |
| 4 | missing | Close Short | — | check box; `js_receiver_receive` cancels the rest and closes the line | M | done |
| 5 | missing | Line Desired Receive Date, Mfg Name, Mfg Part Id columns | — | `_receiver_line_extra` | S | done |
| 6 | missing | PopupReceiving items | Receive / Open Receiver / Open PO | Receiving View ▸, Receive, Return, Edit Receiver, Open Purchase Order…, Purchase Order Lines… | S | done |
| 7 | missing | PopupReceiverLines + Receiver Line window | — | Edit Details… (placed read-only window: line, Receiving, Purchasing, Other, Specs, Links), View Supply and Demand… (engineering's dialog when loaded), Open Part… | M | done |
| 8 | different | Apply Fixed Charge dialog radios, ribbon Tools | inline button, selects | Tools ▾ > Apply Fixed Charge…, radios, OK / Cancel | S | done |
| 9 | missing | Tracked / Tracking No/Quantity… | — | lot tracking belongs to inventory (stock_lot) | L | left: needs lots |
| 10 | missing | Update Part Costs From Receiver dialog | — | part costs are inventory's (`unit_material_cost`) | M | left: inventory |
| 11 | missing | Created / Modified by on the receiver | — | — | S | left |
| 12 | missing | Other tab (receiver user fields) | — | copies of the PO's, last used 2009 | — | left: unused |

## 5. Services (`Service.txt`)

Jobshop: one grid ID, Description, Inactive (add, delete).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|------------|-----|------|--------|
| 1 | different | one editable grid | master window with tabs | `jsServices` grid: ID (without SVC-), Description, Inactive; Del marks, Save | M | done |
| 2 | extra | — | Supplier Prices tab | kept as right-click / double-click "Supplier Prices…" | S | done |

## 6. Tax Groups (`PurchasingTaxGroup.txt`, `SalesTaxGroup.txt`)

Jobshop "Purchasing Tax Groups": Tax Group ID, Inactive, Description and
the Taxes grid (Tax Name, Description, Effective, Account ID, Percent) on
one tab; Browse (Inactive, Tax Group ID, Description).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|------------|-----|------|--------|
| 1 | missing | Inactive | — | account.tax `active` (`js_tax_group_get/save`) | S | done |
| 2 | different | taxes grid on the same tab, placed fields | Taxes tab | `render` under placed fields | S | done |
| 3 | different | title Purchasing Tax Groups | Tax Groups | renamed | S | done |
| 4 | extra | Until column | — | kept (the end date the next tax sets) | — | kept |

## Gap count

Found 66: closed 46, left 20 (8 unused at N-Line, 5 decisions / low value,
4 need another area or Tryton: lot tracking, part costs, lines of released
orders, unit conversions; 3 small: RFQ Part/Service split, receiver
created-by, address number).

## For the integrator

- Module update `nline_js_purchasing` (new fields): `party.party`
  `supplier_mobile` (function), `supplier_user_0..2`; `purchase.purchase`
  `user_0..2`; `purchase.line` `drawing`, `drawing_revision`, `user_0`,
  `user_1`; `nline.rfq.line` `user_0`, `user_1`. New RPC
  `js_rfq_update_pricing` (write). Rerun step `js_purchasing` to fill them.
- The local PO loads in ~5 s (`js_po_get` on SQLite); the battery's 1 s wait
  clicks before it: the purchasing battery ran with a longer wait
  (scratchpad `pur_battery.py`). Suggest the battery wait for
  `window.NLPurchasingLast.data()` (set by the docWindow screens) or a
  generic "loading" flag in frame.js.
- `run_battery.py` crashes printing "▸" on a cp1252 console: run it with
  `PYTHONIOENCODING=utf-8` (or `sys.stdout.reconfigure(encoding='utf-8')`).
- frame.js master with `idAt`: the Supplier ID lookup shows the party's
  rec_name (the name), not its code; Jobshop shows the ID. Suggest the ID
  picker show `idField` (code) with the name in the tooltip.
- `global.NLPurchasingLast` (the last purchasing document window's api) is
  set for the battery; a generic "screen loaded" flag in frame.js would let
  the battery wait on every screen.

## Test results (28 Oct 2026)

- `test.ps1 nline_js_purchasing`: 25 tests OK (scenario extended: PO user
  fields, line drawing / user fields, receiver line extras, Update Supplier
  Pricing from Selected Rows, Close Short). `jscheck.py purchasing.js`: OK.
- Battery (`tools/run_battery.py` with a longer wait, scratchpad
  `pur_battery.py`; the server still has the old module: new fields not
  live):
  - `rfqs`, `purchase-orders/58`, `purchase-orders/new`, `receiving`,
    `services`, `purchase-tax-groups`: every tab, ribbon button, ▾ menu item,
    submenu, lookup, right-click item and Browse double-click works; no
    console exception. Remaining dialogs are the screens' own validation
    ("Choose the Supplier ID." / "Enter the Tax Group ID." on an empty new
    document) and Print's report blocked as a pop-up in headless Chrome.
  - Fixed from the first run: Receive / Copy / RFQ Print clicked without a
    loaded document threw (ribbon actions now no-op when not offered); a
    failure while showing a document was lost in the promise (now shown);
    Terms ID empty on a PO (the desk sends the id only: `js_po_get` now
    sends {id, rec_name}, the screen looks it up meanwhile); receiving head
    inputs full width; Part IDs wrapping; dialogs narrower than their
    placed layout.
  - `supplier-window/77`: with the real file every action shows the error
    `'supplier_mobile'` until the module is updated (new fields). Run with
    stand-in fields (webroot copy only, then restored): all tabs, Tools ▾
    items, lookups, the PO / RFQ tab popups and their submenus, the PO / RFQ
    lines windows, Part / Service price dialogs: no error.
  - Probed by hand (CDP): the Receiver tab of a released PO (placed frame,
    Close Short, line right-click > Edit Details… window), the Order Line
    window, the RFQ header.
- To redo after the module update: `supplier-window/77` with the real file.

## Screen review fixes (28 Oct 2026, `SCREEN_REVIEW.md`)

| Route | Finding | Done |
|-------|---------|------|
| purchase-orders_new | [broken] Status blank | defaults `jobshop_status: unreleased` |
| purchase-orders_58/new | [broken] clipped line cells | per-column `min` widths in `editGrid` (Line Status, PO Line Type, Part/Service ID, Description, Exp Acct ID, Mfg) |
| purchase-orders_58 | Purchase From / Ship To tabs | placed as PurchaseOrderSubTabs: editable fields, Restore Default Address, Clear Address, Export Contact to Outlook, Ship To Mobile / Ship To Supplier ID / Address No (new fields); Address 1 / 2 / Etc. split from the stored Ship To text |
| purchase-orders_58 | Tax / Total above the Details frame | moved under it |
| purchase-orders_58 | captions "Purchase From" / "Ship To" | on the address boxes |
| purchase-orders_58 | extra Memo | moved to the Other tab (Tryton's description; kept) |
| purchase-orders_58 | PO Line Type plain text | drop-down Part / Service |
| purchase-orders_58 | Taxes empty text names a Details tab | reworded |
| purchase-orders_58 | Details frame descriptions | FOB / Ship Via / Tax Group / Terms / Payable boxes (`describe` places) |
| purchase-orders_58 | Copy Notes to Receiver, Notes as one field | left: notes stay the ERP's note log (decision of the first pass) |
| supplier-window_77 | [broken] Tax ID row across frames | frames enclose their rows (7–137, 143–349) |
| supplier-window_77 | description boxes (General) | Terms, Tax Group, FOB, Ship Via, Expense, Payable placed at Jobshop's type4 boxes |
| supplier-window_77 | SIC Code, Alternate Currency | left: unused at N-Line (rows empty); Open balance moved under the frame |
| supplier-window_77 | Inactive missing | was there; the supplier's name box beside the ID removed (`describe` skips the ID) |
| supplier-window_77 | Part Prices header + Quantities grid | left: L (prices are a grid per supplier; the price dialog has the quantities) |
| supplier-window_77 | Addresses Addr No / Mobile / split address | Addr No added; Mobile unused; Address 1/2/Etc. stay one text (Tryton's street) |
| supplier-window_77 | extra Invoices tab | kept (real function), after Jobshop's tabs |
| receiving | [broken] message twice | once (Details frame shares the Receiver tab) |
| receiving | [broken] Desired Recv blank, Return blank | Return = check box; Desired Recv = the moves' date, else the lines' desired date, else the order's (server; migration now writes released orders' desired dates) |
| receiving | GRID_ORDER missing | second grid: Order ID, Supplier ID, Name, Order Date, Status, Last Received Date (needs the module update for the dates/status) |
| receiving | tab order | Receiver tab holds the sub-tabs Receiver Lines, Receive From, Specs, Notes; Other left (receiver user fields unused since 2009) |
| rfqs | description boxes, Preview / Create PO button | placed (FOB, Ship Via, Terms, Payable; button greyed unless Active, hidden without the right to make orders); right column at Jobshop's 397 |
| rfqs | Part ID / Service ID merged | split |
| rfqs | Supplier n address one box | Jobshop's read-only Name … Mobile fields in the frame; Tax Group description box |
| rfqs | Supplier n Currency / Exchange Rate | left: unused at N-Line |
| rfqs | Supplier n grid "adds" columns | reviewer wrong: they are in RequestForQuote.txt GRID SUPPLIER_1_LINE |
| rfqs | extra Purchase Orders tab, Other missing | kept (real function, after Jobshop's tabs); RFQ header user fields unused |

