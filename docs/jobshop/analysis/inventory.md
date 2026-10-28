# Inventory — Jobshop's windows against the ERP

Sources: `C:\NLINE_ERP_dev\jobshop_analysis\layouts\VInventory\*.txt`
(N-Line's installed layouts), `jobshop_menus.txt` / `vjs_menus_raw.txt`
(classPartEditor strings, lines 16808-16965), `userguide.txt` ch. 19-23,
the Jobshop database (NLINE_VJS, read-only, 28 Oct 2026). ERP side: the
code (`erp_screens.txt` was not written yet when this was made).
Real record used: part template 941 (`332-00582-001-01-2`).

Size: S < 1 h, M a few hours, L a day or more. Status: `done`,
`left: reason`, `shared: needs ...`.

## What N-Line's data uses (INVENTORY_PART, 15,611 parts)

| Column | Parts using it | Note |
|---|---|---|
| USER_0 / USER_1 (Eng Parts List / Part Number Rev) | 15,404 / 15,400 | labelled, LINK on (the `!` opens the PDF) |
| USER_10 / USER_11 | 14,662 / 12,842 | **no label** in System Settings (Jobshop shows them disabled); filled by N-Line's P&V transfer tool: short description / material |
| USER_2..USER_4 | 0 | labelled (Material Note, WO Links, QA Approval) but empty |
| USER_5..9, USER_12..33 | 0 | unused at N-Line |
| COMMISSIONABLE | 13,004 | |
| PRIVATE_UNIT_COSTS / PRIVATE_UNIT_PRICE | 2,050 / 197 | |
| UPDATE_COSTS_FROM_PO | all (SYSTEM 5,238, ALWAYS 108, ASK 2,918, NEVER 7,347) | |
| LOT_TRACKED / DATE_TRACKED | 4,398 / 4 | |
| PURCHASING_ / MATERIAL_INSTRUCTIONS | 12 / 12 | the other five instruction texts: 0 |
| PIECE_TRACKED, DIMENSIONS_UM, SAFETY_STOCK, ORDER_POINT, MAX_STOCK, EXP_GL_ACCT_ID, BITMAP | 0 | unused at N-Line (kept) |
| STOCKED / CONSUMABLE | 4 / 1 | |
| PREF_SUPPLIER_ID 1 / 2 / 3 / 4 / 5 | 222 / 3 / 3 / 0 / 0 | |
| INVENTORY_PART_LOCATION.INACTIVE | 5,741 of 25,188 (38 with stock) | 314 parts have an inactive primary location (Jobshop's own rule refuses that today) |
| PURCHASING_SUPPLIER_PART / SALES_DISCOUNT_PRICE | 10 / 0 rows | |
| Rule breakers | 5 parts lot tracked + auto issue, 1 consumable + stocked | the migration skips the part rules |

## 1. Parts (`VInventory\Part.txt` + `PartSubTabs.txt`)

Jobshop: top-level tabs **Part** and **Browse**. The Part tab is the
header (Part ID with lookup, Inactive, Description, Stock / Selling /
Purchase / Usage U/M, Primary / Issue From Loc ID, Eng Master Revision +
**Edit Master** button, Account Set ID + description, Expense Acct ID
(read-only) + description, Quantity on Hand / on Hold (read-only); group
**Settings**: Fabricated, Purchased, Stocked, Tool/Fixture, Lot/Serial
Tracked, Date Tracked, Auto Issue, R+D/Consumable, Commissionable; group
**Unit Costs (Stk UM)**: Material, Labor, Burden, Service, Fixed Cost,
Unit Cost (RO), Preserve Unit Costs, Update on Receipt (list), Preserve
Unit Price, Unit Price (Stk UM)) with 18 sub tabs under it: General, Other,
Picture, Specs, Notes, Unit Conv, Locations, Tracking Info, Spec Instr.,
Quote Lines, SO Lines, RFQ Lines, PO Lines, Work Orders, Supplier Part
Prices, Supplier Service Pricing, Customer Part Pricing, Discount Class
Part Pricing. Browse: Show All + 12 columns (Part ID, Description, Fab'd,
Pur'd, Stocked, Tool/Fixture, Stock U/M, Drawing ID, Product Code,
Commodity Code, Mfg Name, Mfg Part ID).

Menus (Part window): View > Inventory Txs, Where Used..., Supply and
Demand..., Material Availability...; Tools > Inventory Pieces..., Reset
Material Costs..., Open Eng Master for Part..., Add Note, Edit Tracking
Information... Right-click popups of the sub tabs:
PopupQuoteLinesForPartByStatus (All/Active/Cancelled/Lost/Ready/Won),
PopupOrderLinesForPartByOrderStatus (All/Unreleased/Firm/Released/Closed/
Hold/Cancelled), PopupPOLinesForPartByStatus (+Unapproved),
PopupPartWorkOrders (Work Orders by Status of + Open Work Order...),
PopupInventoryPartPrices (Open Supplier... / Open Customer...).
Behaviour (classPartEditor): the rules in the gap table (#15); the
Locations / Tracking Info "Show All"; the document tabs are newest first
(`order by L.SALES_ID desc, L.LINE_NO`); Tracking Info = the receipts not
used up (Show All: all receipts).

| # | Gap | Jobshop | ERP before | Fix (file, function) | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | Part header above 18 sub tabs | 11 flat tabs from the 2007 user guide (Part / General / Costing ...) | inventory.js `partHeader`, pinned above the tab bar in `Screens.parts` | L | done |
| 2 | different | fields placed as Jobshop (rows, splits, group boxes) | grid of fields | `at`/`split`/`frames` on the Part, General, Other, Spec Instr. tabs; `idAt` for Part ID | M | done |
| 3 | missing | Date Tracked, Commissionable, Preserve Unit Costs, Preserve Unit Price, Update on Receipt | — | part.py new fields; migration | S | done |
| 4 | missing | Quantity on Hand / on Hold | — | part.py `get_quantities` | S | done |
| 5 | missing | Edit Master button / Tools > Open Eng Master for Part... | — | inventory.js `editMaster` (the master of the Eng Master Revision, else the latest) | S | done |
| 6 | missing | Account Set description, Expense Acct ID + description (RO) | — | part.py `get_descriptions` (Expense Acct = the account set's expense account; EXP_GL_ACCT_ID unused at N-Line) | S | done |
| 7 | missing | Supplier ID 2-5 with their names | only Preferred Supplier | part.py `preferred_supplier_2..5`, `supplier_name_1..5` | M | done |
| 8 | missing | Created by / Last Modified by | — | part.py `record_created/modified` | S | done |
| 9 | different | Other tab: USER_0..33, disabled when not labelled, `!` link buttons | User Defined 1-10 in General | `otherTab`: USER_0..11 placed, unlabelled ones read-only, `!` opens the path; `user_10`, `user_11` added (N-Line data) | M | done (12-33: unused at N-Line) |
| 10 | missing | Spec Instr. tab (7 texts in group boxes) | — | part.py 7 Text fields, `instructionsTab`; migration | S | done |
| 11 | missing | Quote Lines, RFQ Lines tabs | — | partinfo.py `_js_lines_quote/_rfq`, `linesTab` | M | done |
| 12 | different | SO / PO / WO columns and status menus (one status or All, Hold, Unapproved, Firm) | fewer columns, multi-select Status... button | partinfo.py `part_orders` (the areas' js_status / jobshop_status / order_status), LINE_COLUMNS, submenu | M | done |
| 13 | missing | Supplier Part Prices, Supplier Service Pricing, Customer Part Pricing, Discount Class Part Pricing | — | partinfo.py `part_prices`, `pricesTab` (+ Open Supplier / Customer) | M | done |
| 14 | missing | Tracking Info tab (+ Show All) | — | partinfo.py `part_tracking`, `trackingTab` | S | done |
| 15 | missing | rules: consumable not stocked/lot/auto/piece; piece not fabricated/lot/auto; lot not auto issue; Issue From not a Hold location; Primary/Issue From not an inactive part location | none | part.py `check_part_rules`, PartLocation.validate | M | done |
| 16 | missing | Locations: Inactive column + Show All; caption "Last Counted On"; Jobshop's column order | — | part.py `inactive`; `LOCATION_FIELDS`, Show All filter | S | done |
| 17 | different | Unit Conv columns (no "Means") | extra Means column | CONVERSION_FIELDS | S | done |
| 18 | different | Browse: Show All, Jobshop's 12 columns | inactive always in, Unit Price extra | `browseShowAll`, browse columns (Inactive kept last) | S | done |
| 19 | different | View / Tools menu items | View: Where Used, Inv Txs, Pieces, Mat Avail, S&D; Tools: Reset | `viewItems`/`toolItems` in Jobshop's order and captions | S | done |
| 20 | extra | — | Type, Sold, Cost Method, Inventory Cost | kept (Tryton needs them), below the General layout marked "(ERP)" | — | done (kept on purpose) |
| 21 | missing | Tools > Add Note | Notes tab has Add | frame's Notes tab | — | done (Notes tab) |
| 22 | missing | Tools > Edit Tracking Information... (SetLotTrack) | — | the tracking number is entered on each transaction; Tracking Info shows them | M | left: tracking numbers are entered per transaction; a separate editor is not needed for N-Line's flow |
| 23 | missing | Warnings: safety > order point, min > max, no conversion between U/M and Stock UM, "Turning Lot Tracking back on..." | — | — | S | left: the frame's beforeSave cannot ask (it would need a promise); listed for the integrator |
| 24 | missing | Part ID characters `[A-Z0-9_.-]` | — | — | S | left on purpose: 30+ N-Line parts have spaces, `/`, `+`, lower case |
| 25 | missing | Picture: Insert / Clear / Fit | frame's Picture tab | — | — | done (frame) |
| 26 | different | Stock U/M not writable once used | write refused whenever saved | beforeSave drops an unchanged Stock U/M | S | done (battery found it) |

## 2. Part Where Used (`PartWhereUsed.txt`)

Part ID + description; Include Document Type: Engineering Master, Work
Order, Quote Master; grid of 27 columns.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | Quote Master check box | — | desk.py `part_where_used(..., quote_masters)` (production.bom master_type) | S | done |
| 2 | different | 27 columns (Inactive, Preserved, Doc Creation Date, Document Type/ID/Status/Part ID/Description, Sub/Seq/Piece, Mat Status, Eng Rev, Material Description, Qty Per, Usage U/M, Mfg, Drawing...) | 9 | `whereUsed` columns; Qty Per Type / Fixed Qty / Scrap % / Doc Engineered Date not shown | S | done (4 columns left: no data in Tryton's BOM input) |

## 3. Material Availability (`Availability.txt`, `MultiLevelAvailability.txt`, `N-LineAvailability.txt`)

These are the **work order's** dialog (Release Date, Refresh, materials of
the order). N-Line's custom layout: Level No first, then Part / Sub / Seq /
Piece / Eng Rev / Description / Material Status / Req'd Date / Order Plan /
Work Order / Purchase Order / Order Status / Qty Req'd / Issued / Due /
Projected Available / (Proj - Qty Due) / Lead Time / codes / Pref Supplier
/ RFQ Exists / PO supplier, line, dates, quantities / Multiple Links.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | WO dialog in N-Line's layout, multi-level, Release Date + Refresh | engineering.js `availabilityDialog` (7 columns); inventory's part-level numbers | partinfo.py `wo_material_availability`, `JobshopInventory.workOrderAvailability(productionId)` | L | done (shared: engineering.js should call it) |
| 2 | missing | PO link columns (Purchase Order, Supplier, Line No/Status, Desired Recv / Promise Date, Order / Linked / Recvd Qty, Multiple Links, RFQ Exists) | — | needs nline.purchase.link (purchasing) | M | left: next pass, once the purchasing link model is settled |
| 3 | kept | — | Part window View > Material Availability (part numbers) | kept: Jobshop has no part-level dialog of that name, but it is the quick "can I make it" view | — | done (kept) |

## 4. Supply and Demand

Jobshop: `ID_VIEW_SUPPLY_AND_DEMAND` from the Part window, Work Order Links,
Stocked Parts. The ERP had three dialogs (inventory, engineering,
planning). Decision (integrator, 28 Oct): **Planning's
`JobshopPlanning.supplyDemand(productId)` is the one kept** (Jobshop's
layout: horizon, part change, Sub/Seq/Piece, Projected Available, totals).
Inventory's View > Supply and Demand... and every caller in inventory.js
(`JobshopInventory.supplyDemand(templateId)`, Material Availability) now
call it with the part's variant; inventory's own dialog is only the
fallback when planning.js is not loaded. The RPC `part_supply_demand`
(desk.py, also used by `part_availability`) can be removed later once
Material Availability reads Planning's numbers.

## 5. Reset Material Costs (`ResetMaterialCosts.txt`)

| # | Gap | Jobshop | ERP | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | 4 choices (Reset Part Information on Material Cards / Part Costs from Masters / Implode Costs / Reset Master Information from Part), options per field, Specifications find/replace, Reset on Eng/Quote Masters / Work Orders, filters WO status / material status / creation date / Material Eng ID | costs of open WO materials only, status + date filters | — | L | left: in the ERP a material card reads description, specs, drawing, supplier from the part (nothing to copy); masters use the part's cost live; Implode = engineering's cost roll-up |

## 6. Units of Measure (`Unit.txt`)

Grid ID, Description, Unit Scale, Inactive (add / delete).

| # | Gap | Jobshop | ERP | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | extra | — | Category, Factor (new rows only) | kept: Tryton converts within a category | — | done (kept) |

## 7. Unit Conversions (`UnitConversion.txt`)

Grid <From Unit ID> (lookup), From Unit Description (RO), <To Unit ID>,
To Unit Description (RO), Conversion. ERP matches (+ the sentence in the
status bar). No gap.

## 8. Locations (`Warehouse.txt`)

Grid Location ID, Description, Inactive.

| # | Gap | Jobshop | ERP | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | extra | — | Warehouse column | removed (one warehouse) | S | done |
| 2 | extra | — | ribbon Inventory Txs | kept (useful, harmless) | — | done (kept) |

## 9. Adjustments (`Adjustments.txt`, `PhysicalCountBC.txt`)

Adjustments tab: Type, Date, Set Last Counted Date; Part ID + description;
Location ID, Qty Available to Adjust; L/W/H (piece tracking); Quantity +
U/M; Tracking No; Reason Code + description; Adj Acct ID + description;
Transaction Note; Unit Cost per Quantity UM (Material, Labor, Burden,
Service); New Adjustment, Adjust; grid of 22 columns. Transfers tab:
Date, Part ID, Location ID, L/W/H, Transfer Qty, Qty. Avail. to Transfer,
Tracking No, Reason Code, Transaction Note, Transfer To Location ID; New
Transfer, Transfer; grid of 15 columns. Physical Count tab: filters
(Location / Part / Product Code / Commodity Code ranges), Active/Inactive
parts, Active/Inactive part locations, Refresh Grid, Adjustment Type,
Reason Code, Date, Zero Adjust In Costs, Refresh Count Quantity, Refresh
Costs, Select / UnSelect All, Adjust; grid of 14 columns.
PhysicalCountBC is the bar-code count entry (one part/location at a time).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | Set Last Counted Date | — | desk.py `_js_set_last_counted`, check box, grid column | S | done |
| 2 | missing | Transaction Note (INV_TRAN.DESCRIPTION) | — | stock.py `transaction_note`; adjust + transfer; Description column | S | done |
| 3 | different | "Qty Available to Adjust" / "Qty. Avail. to Transfer" of the location | On Hand (location) + Available (all) | captions; the all-locations total in the tooltip | S | done |
| 4 | missing | Adjust / Transfer buttons in the tab | ribbon Save only | buttons added (ribbon Save kept) | S | done |
| 5 | different | grid columns (Entry No, Part Description, the 4 costs, Set Last Counted, Description) | 9 columns | `renderTable` columns | S | done |
| 6 | missing | Length / Width / Height (piece tracking) | — | — | — | left: no part is piece tracked at N-Line |
| 7 | missing | Physical Count: "Inactive Part Locations" radio, Inactive Part / Part-Loc columns, Adjustment Account column | — | — | M | left: next pass |
| 8 | missing | PhysicalCountBC (bar-code entry) | — | — | M | left: N-Line counts with the count sheet |

## 10. Status Reason Codes (`ReasonCode.txt`)

In VInventory but the same as `VShared\ReasonCode`; the common area owns
`nline.reason_code` and `#/reason-codes` (common.js). Not changed here.
N-Line's 20 codes are all REASON_TYPE INVENTORY.

## For the integrator

- Module `nline_js_inventory` update on the databases: new fields on
  `product.template` (date_tracked, commissionable, preserve_unit_costs,
  preserve_unit_price, update_costs_from_po, user_10, user_11, 7
  `*_instructions`, function fields), `nline.js.part_location.inactive`,
  `stock.move.transaction_note`; new file `partinfo.py` (RPCs
  `part_lines_setup`, `part_prices`, `part_tracking`,
  `wo_material_availability`; `part_orders` moved there, new kinds quote /
  rfq; `part_where_used` takes `quote_masters`). Until the update, the
  local server answers 403 to the new RPCs (the desk shows "session
  expired").
- Re-run migration step `js_inventory` (new fields, user 10/11 labels,
  inactive part locations). It writes with context
  `nline_js_no_part_rules` (N-Line has parts that break Jobshop's rules).
- engineering.js: the Work Order window's View > Material Availability
  should call `window.JobshopInventory.workOrderAvailability(productionId)`
  (N-Line's layout); its Supply and Demand should call Planning's
  `JobshopPlanning.supplyDemand(productId)` (the one kept).
- frame.js: `beforeSave` cannot ask a question (Jobshop's "Safety stock
  quantity is greater than order point quantity. Continue?"): allow it to
  return a promise (false = cancel). Also a thrown error in beforeSave
  leaves the form's `saving` flag stuck.

## Test results

- Server: `test.ps1 nline_js_inventory` — 25 tests OK (scenario extended:
  Supplier ID 2, part rules, Set Last Counted / Transaction Note, Quantity
  on Hand / Hold, part_orders with All / work order statuses,
  part_lines_setup, part_prices, part_tracking, wo_material_availability,
  migration of USER_11, COMMISSIONABLE, UPDATE_COSTS_FROM_PO,
  PURCHASING_INSTRUCTIONS, PRIVATE_UNIT_COSTS, inactive part locations).
- `jscheck.py inventory.js` OK.
- Battery (`run_battery.py`, port 9342, local server **before** the module
  update, so the new RPCs answer 403 / old signatures):
  - parts/941: every tab, menu, lookup, `!` button, right-click and
    submenu reached; distinct failures left: Supply and Demand (403 on the
    old server; now goes to Planning's dialog), Quote Lines / RFQ Lines
    ("quote" / "rfq" unknown to the old `part_orders`). Both go away with
    the module update. Fixed during the runs: Save refused "cannot change
    the default unit of measure" (unchanged Stock U/M no longer written),
    screen too slow for the battery (System Settings labels now load after
    the window), Copy with no part (toast), "!" with an empty value (toast).
  - units, unit-conversions, reason-codes/inventory: no errors.
  - locations: Inventory Txs without a selected row now a toast.
  - adjustments: New Adjustment / New Transfer without a part shows
    Jobshop's "You must enter an adjustment before adding a row." (kept:
    Jobshop's own error); no other error.
- To redo after the integrator's module update and restart: the parts/941
  battery (the new tabs read the new RPCs).
