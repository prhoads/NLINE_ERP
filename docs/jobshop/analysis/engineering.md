# Engineering area: Jobshop against the ERP

Sources: `C:\NLINE_ERP_dev\jobshop_analysis\layouts\` (cited per window),
`jobshop_menus.txt` ([Engineering], [Work Order], [Show Details], [Order
Materials By], [Find Materials By], [Start Labor Ticket For], PopupStatus),
`userguide.txt` ch. 7-11 and 33, the Jobshop database (read-only). The ERP
dump `erp_screens.txt` was not written when this was done: the "ERP now"
column comes from the code (`js/jobshop/engineering.js`,
`modules/nline_js_engineering`).

Size: S (< 1 h), M (a few hours), L (a day or more). Status: `done`,
`left: reason`, `shared: needs <file>`.

## N-Line's data (what is used)

| Field | Use at N-Line (SHOPFLOOR_WORK_ORDER, 10 630 orders) |
|---|---|
| LOT_ID / SPLIT_ID | lot not 1 on 1 330, split not 0 on 17: used |
| ARCHIVED | never set (field kept, unused at N-Line) |
| HARD_RLS_DATE | 3 orders |
| OTHER_INFO (Project/Ref/Other) | 1 561 orders (e.g. "WO-261357-01, INVENTORY") |
| ENG_ID | 4 980 |
| ACCOUNT_SET_ID | 790 (accounting stays QuickBooks: not built) |
| SCHED_START/FINISH_DATE | 1 577 |
| USER_0 / USER_1 | 7 823 / 7 808: released drawing PDF and its revision (N-Line's sign-off); USER_2..33 never used; no labels set up in SHOPFLOOR_OBJECT_GLOBAL |
| Masters USER_0 / USER_1 | 13 062 of 14 179 (same meaning) |
| Master INACTIVE / PRIVATE | 18 / 18 |
| Material REFERENCE | 2 823 work order materials (e.g. "JOB 8751"), 4 master materials |
| Template SUPPLIER_SERVICE_ID | never used (4 templates) |

## 1. Engineering Masters (`layouts\VEngineering\Master.txt`)

Jobshop: tabs Engineering Master, Details, Other, Specs, Picture, Notes,
Browse. Header rows: Created by / Last Modified by; Part ID (ID, lookup) /
Revision / Locked / Inactive; Description; Quantity + Stock U/M; Product Code
ID + description; Commodity Code ID + description; Engineered By; Engineered
Date; Drawing ID / Rev / Page; Drawing File + "!"; Account Set ID +
description; Global Rank / Forward Schedule; frame "Work Order Special
Instructions" (multi-line). Browse: Part ID, Eng ID, Description (+ Show All).
Popup: [Engineering] (below, "Cards").

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| M1 | different | ID lookup is the first field of the tab (Part ID) | ID bar above the tabs ("Master (Part ID / Eng ID)") | `masterWindow` `idAt`, label Part ID | S | done |
| M2 | missing | Created by / Last Modified by | - | `StampMixin.created_by/modified_by` (Function), placed | S | done |
| M3 | different | Revision, Locked, Inactive | Eng ID, Private, Active | labels; `InactiveMixin.inactive` (Function, setter, searcher) | S | done |
| M4 | missing | Stock U/M, code descriptions beside the codes | - | `stock_um`, `product_code_description`, `commodity_code_description` (Function) | S | done |
| M5 | different | Work Order Special Instructions on the header (frame) | on Specs tab | moved, `tab.frames` | S | done |
| M6 | missing | "!" beside Drawing File | - | `tab.buttons` -> View Drawing | S | done |
| M7 | different | field positions | auto grid | `at`/`split` from the layout | S | done |
| M8 | missing | Other tab (user fields) | - | Other tab: User 0 / User 1 read-only (+ Tryton's master name) | S | done |
| M9 | extra | - | Operations, Materials, Makes tabs | kept (owner's earlier request) | - | done |
| M10 | missing | Account Set ID | - | accounting stays QuickBooks | - | left: by decision |
| M11 | missing | Browse "Show All" (inactive masters) | - | needs a frame browse option | S | shared: needs frame.js browse filter |
| M12 | extra | - | Master name (Tryton BOM name) | on the Other tab | - | done |
| M13 | missing | Part ID of a NEW master next to Revision | the ID lookup finds existing masters | "Part ID (new master)" field under the placed ones | S | done |

## 2. Material / Leg Detail / Operation dialogs (`Material.txt`, `LegDetail.txt`, `Operation.txt`)

| # | Gap | Jobshop | ERP | Fix | Size | Status |
|---|---|---|---|---|---|---|
| D1 | missing | Material Reference | - | `MaterialMixin.reference`, in the dialog, migrated | S | done |
| D2 | missing | Fab/Pur/Tool flags, Calc/Issued/Avail Qty, Auto Issue, Phantom, Length/Width/Height, unit labor/burden/service costs, unit price, burden %, discontinue/effective dates, supplier part, Mfg name/part, Linked | - | the dialog shows N-Line's used fields; the rest unused or computed elsewhere | L | left: dialog is a 4-tab form, not Jobshop's layout; next pass |
| D3 | different | Material window laid out as Jobshop | grid form | `dialog()` could use `UI.placedForm` | M | left: next pass |
| D4 | missing | Operation window layout (Operation.txt) | grid form | same as D3 | M | left: next pass |

## 3. Operation Templates (`OperationTemplate.txt`, `OperationTemplateSubTabs.txt`)

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| T1 | different | ID lookup in the tab | ID bar | `idAt`, `idField: 'code'` | S | done |
| T2 | missing | Created by / Last Modified by | - | StampMixin | S | done |
| T3 | different | Inactive | Active | `inactive` | S | done |
| T4 | different | Setup Hrs, Min Move Qty, Min/Max Capacity Usage on the Operation tab | Setup Hours, Minimum Move Qty, capacities on Other | labels, placed | S | done |
| T5 | missing | Supplier Svc ID | - | unused at N-Line | - | left: unused |
| T6 | different | Browse: ID, Description, Inactive | + Resource, Setup, Run, Active | Jobshop's first, N-Line's after | S | done |
| T7 | bug | Copy: "The ID must be unique" | copy failed | `OperationTemplate.copy` gives `<code>-1` | S | done |
| T8 | missing | Where Used (`OperTemplateWhereUsed.txt`), Reset Operation Template Info | - | | M | left: next pass |

## 4. Quotes (`VEstimating\Quote.txt`, `QuoteLine.txt`, `QuoteCharge.txt`, `QuoteQuoteLines.txt`)

Jobshop: one Quote tab (header frame, quote lines grid with sub-tabs,
Details frames), Other, Browse.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| Q1 | different | ID in the tab | ID bar | `idAt`, `idField: 'number'` | S | done |
| Q2 | different | header + dates + details on the Quote tab | Quote, Dates, Details tabs | one placed Quote tab (Dates and Details tabs removed); the lines grid stays the Quote Lines tab, so the Details part moves up | M | done |
| Q3 | missing | Created by / Last Modified by | - | StampMixin on nline.quote | S | done |
| Q4 | missing | Sold to/Ship to address box | Sold To / Ship To tabs | kept as tabs | - | left: tabs hold the editable addresses |
| Q5 | different | Sales Rep, Discount Class, Territory, SIC, Carrier, Tax Group: lookups with description | text codes | the sales area's models | M | shared: needs nline_js_sales models |
| Q6 | missing | Currency ID / Exchange Rate | - | not emulated | - | left: single currency |
| Q7 | missing | Quote lines grid on the Quote tab | own tab | `UI.master` cannot mix | M | shared: needs frame.js fields+render tab |

## 5. Quote Masters (`VEstimating\QuoteMaster.txt`)

Same window as the engineering master (Quote Master ID instead of
Part/Revision). Gaps M1-M8 apply and are done the same way (`idAt` at Quote
Master ID, `idField: 'name'`). Browse: Quote Master ID, Part ID,
Description, Quantity, Engineered Date: done.

## 6. Work Order window (`VShopFloor\WorkOrder.txt` and dialogs)

Jobshop tabs: Work Order, Details, Other, Specs, Picture, Notes, Browse
(ERP: same order).

### Work Order tab

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| W1 | missing | Created by / Last Modified by | - | StampMixin | S | done |
| W2 | different | Work/Lot/Split ID on one row (ID lookup, Lot, Split) | Work Order ID bar + `number` | `idAt` + `work_id/lot_id/split_id` Function fields with setter on the number (`WORK[/LOT][.SPLIT]`, as imported); Lot/Split read-only once saved | M | done |
| W3 | missing | Archived | - | `archived` (unused at N-Line) | S | done |
| W4 | missing | Linked (read-only) | - | `linked` (Function: root's origin is a sales line) | S | done |
| W5 | different | Created from Eng Master Rev (read-only) | editable "Engineering Master (Eng ID)" | placed beside Part ID, read-only once saved (new orders: File > New from Eng/Quote Master) | S | done |
| W6 | missing | Description (the order's own) | part name only | `production.description` (part's name by default, the master's description when made from it) | S | done |
| W7 | different | Quantity + Stock U/M (read-only) | editable U/M | `stock_um`; the U/M field moved to Other (read-only) | S | done |
| W8 | different | Close Date | Closed Date | label | S | done |
| W9 | different | Engineered By, Date, Drawing ID/Rev/Page in one row, Drawing File + "!" | grid | placed, `tab.buttons` | S | done |
| W10 | missing | Project/Ref/Other | - | `other_info`, migrated | S | done |
| W11 | missing | code descriptions beside Product / Commodity Code | - | Function fields | S | done |
| W12 | missing | Account Set ID | - | QuickBooks | - | left: by decision |
| W13 | missing | Treat Release Date as Hard | - | `hard_release_date`; Schedule Work Order never starts before the release date | S | done |
| W14 | missing | Schedule Start / Finish Date (read-only) | Schedule Work Order overwrote Release / Want Date | `schedule_start_date/finish_date`; `eng_schedule` writes them, the desired dates stay the user's | M | done |
| W15 | different | header copied from the master into a new order | not copied | `eng_work_order_ready` copies `HEADER_COPY` + description + global rank | S | done |
| W16 | different | positions | grid | `at`/`split` | S | done |
| W17 | extra | - | ribbon Release / Assign Stock / Start / Receive / Traveler | kept: Release duplicates Change Status > Released but is the one-click action the shop uses; Assign Stock / Start / Receive have no Jobshop button; Traveler = Print of the header card. Decision: keep all, noted as N-Line extras | - | done |
| W18 | missing | Browse: WorkOrder ID, Lot ID, Split ID, Part ID, Description, Quantity, Status | Number, Part, Qty, Want Date, Status | Jobshop's columns | S | done |
| W19 | missing | Other tab user fields | Tryton state etc. | User 0 / User 1 read-only on top (labels not set up in Jobshop), Tryton fields after | S | done |
| W20 | missing | File > New document from > Engineering Master / Quote Master (`NewWOFromMaster.txt`, `NewWOfromQuoteMaster.txt`) | - | Tools menu items with the two dialogs (Part ID + Eng ID / Quote Master ID, Copy) | M | done |
| W21 | missing | Set Work Order Release Date (`Vmfg\dlgReleaseDate.txt`) when releasing | - | asked by Change Status > Released | S | done |

### Details cards (popup [Work Order] / [Engineering])

Jobshop's popup order (WO): Add Operation..., Add Material..., Add
Materials..., Add Leg/Detail..., Variables..., Schedule Work Order,
Issue/Return Materials..., Start Labor Ticket for Employee >, Edit..., Cut,
Copy, Paste, Delete, Print Preview, Print..., Open Part..., Open Material
Supply and Demand..., Open Resource..., Open Eng Master for Part..., Open
Supplier..., Request Quote/Purchase this Material/Service..., Change Status >,
Picture..., View Drawing..., Show Details..., Show Costs..., Right-click Info,
Data Tips, Order Materials By > (Piece No, Part ID, Description, Reference),
Find Materials By > (Part ID..., Description..., Reference...). Masters: the
same without the work order items, with Create Request For Quote for
Supplier... and Resequence Materials for Operation. Options: Copy
Subordinates.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| C1 | different | one menu in Jobshop's order | per-card menus, own order | `menuOf` rebuilt in Jobshop's order; N-Line items (Co-Products, Sales Order Links, Open Sales Order / Purchase Order, Go to leg, Make leg, Remove leg) after a line | M | done |
| C2 | missing | Cut / Copy / Paste of cards (material -> operation, operation -> header, leg -> operation) | - | `clipItems`, `paste`; Cut grays the card, deleted once pasted (cards save at once here) | M | done |
| C3 | missing | Options > Copy Subordinates | - | copies the operation's materials and legs with it | S | done |
| C4 | missing | Order / Find Materials By Reference | - | `reference` on the card nodes | S | done |
| C5 | different | "Piece No" | "Seq/Piece No" | label | S | done |
| C6 | missing | Resequence Materials for Operation (masters) | - | `eng_resequence` (10, 20, ...) | S | done |
| C7 | different | Request Quote/Purchase this Material/Service... opens Purchase Material / Purchase Service (card, existing PO links, Create Request For Quote, Create Purchase Order) | two items "Purchase this Material", "Request Quote..." | `purchaseDialog` + `eng_po_links`; `eng_purchase` writes the purchasing area's `nline.purchase.link` when installed | M | done |
| C8 | missing | Print Preview / Print of a leg | header only | traveler of the card's order or leg | S | done |
| C9 | different | "..." captions, Data Tips (WO) / DataTips (masters) | plain | Jobshop's captions | S | done |
| C10 | missing | View > Purchase Order Links (`WOPOLinks.txt`) | - | `poLinksDialog` | S | done |
| C11 | different | Sales Order Links columns (Sales Order ID, Line No, Customer ID/Name, Link/SO/Shipped Qty, Line Status) | Sales Order, Customer, Line, Qty, Ship Date | columns, `eng_sales_links` returns line no, link and shipped qty | S | done |
| C12 | different | View menu: Picture, View Drawing, Show Details, Show Costs, Labor Txs, Inventory Txs, Material Availability, Sales Order Links, Purchase Order Links, Open Material Supply and Demand | Indented Details/Costs labels, other order | Jobshop's order and captions | S | done |
| C13 | bug | Options ▾ did nothing without a record | silent | toast as View does | S | done |
| C14 | missing | Update Work Order Costs, Reset Operation/Material Costs, Change Transit Days | - | costs are computed live here | M | left: next pass |
| C15 | missing | right-click submenus as real submenus | second menu at the pointer | `UI.contextMenu` submenus | S | shared: needs frame.js contextMenu submenus |

## For the integrator

- `trytond-admin -u nline_js_engineering` (new columns): production
  `description`, `other_info`, `archived`, `hard_release_date`,
  `schedule_start_date`, `schedule_finish_date`, `user_0`, `user_1`;
  production_bom `user_0`, `user_1`; production_bom_input and
  production_material_card `reference`. New Function fields (no columns):
  `work_id/lot_id/split_id`, `linked`, `created_by/modified_by`,
  `stock_um`, `*_code_description`, `inactive`.
- New desk RPCs: `eng_header`, `eng_po_links` (reads), `eng_resequence`
  (write).
- Data: rerun step `js_engineering` (new `work_orders()`: the Work Order tab
  fields, schedule dates, user fields and the materials' Reference of the
  imported orders; masters get USER_0/1 and Reference).
- Copy `js/jobshop/engineering.js` to the web roots and bump its `?v=`.
- Shared wishes: M11, Q7, C15 above.

## Test results

- `test.ps1 nline_js_engineering`: see the status file (scenario covers the
  new fields and RPCs).
- `jscheck.py engineering.js`: OK.
- Click-through battery (`run_battery.py`, port 9341): the baseline run of
  the old screens found on `operation-templates` the Copy error (T7, fixed);
  every tab, lookup, ribbon item and Browse opened without error. The new
  screens read the new fields, so they can only be battery-tested after the
  module update on the local server (integrator).
