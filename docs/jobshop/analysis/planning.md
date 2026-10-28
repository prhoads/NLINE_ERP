# Planning: Jobshop's windows against the ERP (analysis, 28 Oct 2026)

Area `planning`: module `modules/nline_js_planning`, screens
`modules/nline_desk/web/js/jobshop/planning.js` (routes `#/planning`,
`#/scheduling`), data `migration/jobshop/planning.py`, status
`docs/jobshop/status/planning.md`.

Sources: `layouts\VPlanning\*.txt` (Planning, Netting, LinkableWOs,
NewWOLink, StockedPart*, Scheduling, Scheduler, dlgLoadHorizon),
`layouts\VShopFloor\WeeklyCalendar.txt`, `CalendarException.txt`,
`jobshop_menus.txt` (Popup* of the Planning group), user guide ch. 30-31,
help `VPlanning*.txt`, `dlgStockedPartNetting.txt`, the Jobshop database.

N-Line's data (NLINE_VJS, read-only):

- Scheduling is barely used: one schedule (STANDARD, last run 2020-03-19,
  finite, horizon 730, no what-if schedule), 3 rows of OPERATION_SCHED.
  26 work orders are Forward Schedule; every work order has a Global Rank.
- Calendars: 7 weekly rows (the shop's; no resource, no schedule, no
  capacities), no calendar exception.
- Parts: 15,611, only 4 Stocked, 497 inactive, 37 tool/fixture; Pref
  Supplier ID 2-5 filled on 3 parts (unused); Restocking Level
  (MAXIMUM_STOCK_QTY) never used.
- RFQs are used (107, the last 2025-10; 719 RFQ links), purchase order
  links 36,776, sales order links 3,115.
- WORK_ORDER.OTHER_INFO (Project/Reference/Other) is filled on 1,561 work
  orders: the ERP has no such field (see For the integrator).

## 1. Material Planning (`layouts\VPlanning\Planning.txt`)

Jobshop: four tabs, in this order:

1. **Stocked/Fabricated Only Parts** (MAT_PLAN_ORDER_PT): filter area —
   rows Part ID / Product Code / Commodity Code / Preferred Supplier ID
   (check box + From / To lookups), Horizon (date), View Short Only, Use
   Part Leadtime (+ N days) as Horizon..., Use Work Order Release Date for
   Material Demand Date, Create Planned Temporary Work Orders...; frame
   "For" (All Active and Inactive with Demand / Active Only / Inactive Only /
   Inactive with Demand Only / All), frame "For" (Fabricated / Purchased /
   Both), Refresh Grid. Grid 33 columns (Inactive, RFQ(s) Exists, PO(s)
   Exist, Part ID, Description, Fab'd, Pur'd, Tool or Fixture, Lead Time,
   Horizon Date, Stock U/M, Unit Material Cost (editable), Order Quantity
   (editable), Estimated Total Cost, Qty On Hold, Qty Available, Net Demand,
   Total Supply, Projected Available, Order Point, Safety Stock Qty,
   Restocking Level, Minimum Order Qty, Order in Multiples of, Product Code,
   Commodity Code, Pref Supplier ID 1-5, Mfg Name, Mfg Part ID), Total
   Estimated Cost of Selected Row(s); under it the selected part's supply
   and demand (StockedPartHorizonDate / SalesOrders / WorkOrders /
   PurchaseOrders panels).
2. **Non-Stocked Parts** (MAT_PLAN_NO_ORDER_PT): 39 columns.
3. **Outside Services** (SERVICE_PLANNING): 29 columns.
4. **Open Sales Order Lines** (MAT_PLAN_CUST_WO): 27 columns.

Menus: ribbon Planning Tools = PopupPlanning (Open Sales Orders ▸,
Non-Stocked Parts ▸, Stocked Parts ▸, Outside Services ▸); each grid's
right-click = PopupWOPlanning / PopupMatPlanning / PopupStockParts /
PopupServicePlanning: Browse (Filter Including, Filter Excluding, Filter
by, Remove Last Filter, Remove Filters/Sort, Save widths and positions),
View ▸, Link Order Line to ▸ (New Work Order w/Status ▸ UnReleased... /
Firm... / Release...; Existing Work Order...), Change Sales Order Status ▸,
Create Purchase Order for Supplier..., Create Request For Quote for
Supplier..., Create Work order..., Include Material Demand for Stocked
Parts, Issue Material..., Open Sales Order... / Customer... / Part... /
Work Order..., View Notes for Part..., (Open) Supply and Demand...

Dialogs: Link Sales Order Line to Work Order (LinkableWOs grid: Work /
Lot / Split ID, Order Status, Release Date, Want Date, Desired Qty, Qty
Available to Link, Part ID, Description); Create New Work Order (NewWOLink:
New Work ID, Use Sales ID as Work ID (disabled), New Lot ID, New Split ID,
Part ID, Description, Eng Master Rev, Release Date, Status, Want Date,
Order Qty, Global Rank, Forward Schedule); Supply & Demand
(dlgStockedPartNetting: Horizon, Part ID (lookup), description, Inactive,
Eng Master Rev, Stock UM, Drawing ID / Rev, Refresh; tabs Sales Orders
(Order ID, Line No, Status, Ship Date, Demand Qty, Projected Available,
Drawing ID, Rev, Eng Master Revision, Links; Demand), Work Orders
(Co-Product, Work / Lot / Split / Sub ID, Seq No, Piece No, Status, Desired
Release Date, Want Date, Scheduled Finish Date, Supply Qty, Demand Qty,
Projected Available, Drawing ID, Rev, Eng Master Revision; Supply, Demand),
Purchase Orders (Order ID, Line No, Status, Receive Date, Supply Qty,
Projected Available, Drawing ID, Rev, Links; Supply)).

Behaviour: Order By Date = date less lead time, red when past; Projected
red at/below safety stock, blue at/below order point; Message red; column
header click sorts (Shift: descending); double-click opens the order (Supply
& Demand for a stocked part); fully linked lines left out by default.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|-----------|-----|------|--------|
| 1 | different | tab order Stocked/Fabricated Only Parts, Non-Stocked Parts, Outside Services, Open Sales Order Lines | Open Sales Orders first, "Stocked Parts" last | planning.js `sections` | S | done |
| 2 | missing | Stocked filter area as laid out (check + From/To lookups, Horizon, View Short Only, Use Part Leadtime + days, Use WO Release Date, Temp WOs, two For frames, Refresh Grid) | text ranges, Active/Inactive/Both, Horizon check, Apply | planning.js `stockedPane` (placed), material.py `js_planning_stocked` (activity 5 options, fabricated, use_leadtime/plus_days, use_release_date) | M | done (Temp WOs: left, no temporary work orders in the ERP; disabled as in a Jobshop without them) |
| 3 | missing | stocked grid columns Inactive, RFQ(s) Exists, PO(s) Exist, Tool or Fixture, Horizon Date, Unit Material Cost, Order Quantity, Estimated Total Cost, Qty Available, Restocking Level, Minimum Order Qty, Order in Multiples of, Pref Supplier ID 1-5; labels Fab'd / Pur'd / Lead Time (Days) / Projected Available | 17 columns | `js_planning_stocked`, `_planning_part`, `_js_open_purchases`; JS columns | M | done (Pref Supplier 2-5 and Restocking Level unused at N-Line) |
| 4 | missing | Unit Material Cost and Order Quantity editable, Estimated Total Cost, Total Estimated Cost of Selected Row(s) | — | grid `edit` cells; PO uses them (`unit_prices`) | M | done |
| 5 | missing | selected part's supply & demand under the grid | — | `supplyDemandPane({fixed})` | M | done |
| 6 | missing | Non-Stocked columns Eng Master Revision, Stck'd, Linked RFQ Qty, Projected Available, Primary Loc Id, Project/Reference Other; column order | missing / other order | `js_planning_non_stocked`, `_js_rfq_quantities`, `_js_projected` | M | done (Project/Reference: shared, needs the work order field) |
| 7 | different | Outside Services "Lead Time", Part Description, Linked RFQ Qty, Length/Width/Height, Project/Reference | "Transit Days", missing | `js_planning_outside`; JS | S | done (L/W/H empty: services have none) |
| 8 | missing | Open SO Eng Master Revision, Link Shipped Qty, Projected Available, Customer Name, Preferred Supplier ID | missing, "Name" | `js_planning_sales` | S | done |
| 9 | different | popups with submenus: View ▸, Link Order Line to ▸ New Work Order w/Status ▸ / Existing..., Change Sales Order Status ▸ | flat items | `popup` / `sub` (frame's submenus) | S | done |
| 10 | missing | Browse filters (Including, Excluding, Filter by, Remove Last, Remove Filters/Sort) | — | `grid.browseItems` | M | done |
| 11 | missing | Browse > Save widths and positions | — | — | S | left: the desk keeps no grid layouts (frame) |
| 12 | missing | Create Purchase Order for Supplier... on Open Sales Order Lines | — | `soItems` / `partRows` | S | done |
| 13 | missing | Create Request For Quote for Supplier... (4 sections) | — | new RPC `js_planning_rfq` (nline_js_purchasing's `js_rfq_save`, RFQ links) | M | done |
| 14 | missing | Include Material Demand for Stocked Parts (Non-Stocked) | — | `js_planning_non_stocked(view, include_stocked)` | S | done |
| 15 | missing | Issue Material... | — | opens the work order (its material cards issue) | S | done (partial: no issue dialog of planning's own) |
| 16 | missing | Open Customer... / Open Part... / View Notes for Part... | Open Customer only | `soItems`, `spItems`, `partNotes` (ir.note) | S | done |
| 17 | different | Link to existing work order: LinkableWOs grid with Qty Available to Link | a drop-down | `linkExisting`; `js_planning_link_targets` (lot, split, release date, available, part, description) | M | done |
| 18 | different | Create New Work Order labels/order, Use Sales ID as Work ID (disabled), Eng Master Rev, Global Rank, placed as Jobshop | other labels, no rank | `createWorkOrder` (placed), `_js_new_production` global_rank | S | done |
| 19 | missing | Supply & Demand: Horizon, Part ID change, Inactive, Eng Master Rev, Stock UM, Drawing ID/Rev, Refresh, Projected Available, Drawing / Rev / Eng columns, Co-Product, Desired Release Date, Links text, totals | part header, running totals | `js_supply_demand(product, horizon)`, `supplyDemandPane` | M | done (Co-Product always unchecked: no co-products in the ERP) |
| 20 | missing | Netting window (Planning / Detail / Summary / Browse) | — | — | L | left: no menu or group bar item of 6.1.2 opens it and the help has no topic; Supply & Demand and the Material Netting report (admin) cover it |
| 21 | different | Qty On Hold | 0 | — | M | left: no hold locations yet (inventory) |
| 22 | extra | Break Links to Work Orders / Purchase Orders, Create Purchase Request, Open Purchase Order | — | kept (ERP functions the owner had) | — | kept |
| 23 | different | Stocked tab read every part (20 s on nline_test) | — | `js_planning_stocked` searches stocked parts only; `_js_prefetch_points` | S | done |

## 2. Scheduling (`layouts\VPlanning\Scheduling.txt`, `Scheduler.txt`, `dlgLoadHorizon.txt`)

Jobshop: title "Scheduling :: <schedule>"; tabs Resource Details (radio
Resource ID / Shop View ID, Shop Resource ID or Shop View ID list, the
resource's description; grid Frozen, Schedule ID, Resource ID, Part ID,
Work / Lot / Split / Sub ID, Seq No, Unit No, Start, Finish, Qty, Cmp Qty,
Status, Could Start, Could Finish, Want Date, Determinant, Forward, Late),
Work Order Details (Work ID lookup + description; frame Want Date, Release
Date, Finish Date, Start Date, Days Early/Late, Rank, Forward; grid as
above without Part / Work / Lot / Split), Schedule (VSched), Schedule
Comparison (Standard / What If 1 / What If 2 Percent Late; grid Work /
Lot / Split ID, Order Status, Part ID, Desired Qty, Hard Rls Date, Forward
Schedule, Global Rank, Desired Release / Want Date, Standard / What If 1 /
What If 2 Start and Finish; popup PopupSchedulingScheduleComp).

Menus: Scheduling (Display Mode, Zoom, STANDARD / Schedule 2 / Schedule 3,
Operations, Capacity, Grid lines, HighLight Work Order Immediate, Remove
Highlight Immediate, Highlight Determinant Path, Schedule All..., Set Load
Horizon, Export Schedule... (tab delimited)); Tools (View Selected Work
Order..., Weekly Calendars..., Calendar Exceptions..., Schedule Work Order,
Delete Work Order Schedule); Options (Right-click Info, DataTips); Other
(Schedule to Print...).

Schedule All Orders (Scheduler): Schedule ID (lookup; a new ID = a what-if
schedule) + Delete, Description, Infinite Schedule; Dates (Schedule as of,
Schedule Horizon days, Treat Release Dates as Hard); Work Orders to
Schedule (Released and Firm Together / Released then Firm / Released
Only); Sort By; Schedule Started Work Orders; Piece Scheduling; Schedule
Temporary Work Orders (disabled); Retry Backward Schedule after Forward
Schedule + Keep Determinant Path. Set Load Horizon: Load Horizon (days).

Behaviour: backward from the want date (forward from the release date when
Forward Schedule, or when backward would start before the as-of date).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|-----------|-----|------|--------|
| 24 | missing | backward scheduling from the want date, forward fallback | forward only | scheduler.py `backward`, `schedule_back`, `place_back`, `Calendar.consume_back`, `rollback` | L | done |
| 25 | missing | Schedule All: Description, Delete, Schedule Horizon, Work Orders to Schedule, Piece Scheduling, Temp WOs (disabled), Retry Backward + Keep DP; placed as Jobshop | 5 settings | schedule.py fields `mode`, `piece_scheduling`, `retry_backward`, `keep_forward_dp`; `js_schedule_settings`; JS `scheduleAll` | M | done (Piece Scheduling stored, not used: no minimum move quantity) |
| 26 | missing | what-if schedules (new Schedule ID, Delete, menu STANDARD / other schedules) | STANDARD only | `_js_schedule(code, create)`, `js_schedule_list`, `js_schedule_delete`, every read RPC takes the schedule | M | done |
| 27 | missing | Schedule Comparison tab | — | `js_schedule_comparison`, JS tab + popup | M | done |
| 28 | different | Resource Details radio + description, columns Schedule ID, Part ID; no Operation column | select, Operation column | JS `opColumns`, placed header; `_js_op` schedule_id, part_id | S | done (the operation's name is the first right-click line) |
| 29 | different | Work Order Details: Work ID + description, the dates frame, Days Early/Late, Rank, Forward | text spans with extra Part/Status/Frozen/Late | JS `loadWorkOrder` (placed); `missed_days` | S | done |
| 30 | different | Forward column = the operation was scheduled forward | the work order's Forward Schedule flag | `nline.js.schedule.operation.forward` | S | done |
| 31 | missing | Display Mode ▸, Zoom ▸, Grid lines, Export Schedule... (tab delimited), View Selected Work Order..., Delete Work Order Schedule, Options menu (Right-click Info, DataTips) | partial | JS `optionsMenu`, `toolsMenu`, Options ▾; `js_schedule_export('tab')`, `js_schedule_delete_work_order` | S | done |
| 32 | missing | Other > Schedule to Print... | — | — | M | left: reports are the admin area's (Resource Schedule) |
| 33 | different | rights Can Schedule All / Edit / Save / Run STANDARD Schedule | one right (create scheduled operations) | — | M | left: one right (production group) until Jobshop's authorities exist |
| 34 | different | Set Load Horizon label "Load Horizon (days)" | "Set Load Horizon (Days)" | JS `loadHorizon` | S | done |

## 3. Weekly Calendars / Calendar Exceptions (`layouts\VShopFloor\WeeklyCalendar.txt`, `CalendarException.txt`)

Opened from Scheduling's Tools (Planning's dialogs; the data is the
Shopfloor area's `nline.js.calendar.week` / `.change`, also on its Shop
Resource window). Jobshop: Schedule ID and Resource ID lists; weekly grid
Day of Week, 1st Shift Start, Shift 1-3 (no capacities); exceptions grid
(add / delete) Start Date, End Date, Start of Day, Shift 1-3 Duration,
Shift 1-3 Capacity, Reason Code (lookup), Description.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|-----|---------|-----------|-----|------|--------|
| 35 | different | title "Weekly Calendars", no capacity columns | Cap 1-3 columns | JS `weeklyCalendar` (stored capacities stay) | S | done |
| 36 | different | exception columns "Shift n Duration", "Shift n Capacity", Reason Code + Description | Shift n / Cap n / Reason | JS `calendarExceptions` | S | done |
| 37 | different | calendars per schedule (Schedule ID list) | the shop's calendars, Schedule ID read-only | — | M | left: unused at N-Line (no calendar of a schedule) |

## Totals

37 gaps found: 30 done, 7 left (11, 20, 21, 32, 33, 37, and the temporary
work orders of 2), plus the shared Project/Reference field.

## For the integrator

- Module update `nline_js_planning` (new fields: `nline.js.schedule.mode`,
  `piece_scheduling`, `retry_backward`, `keep_forward_dp`;
  `nline.js.schedule.operation.forward`; messages `msg_schedule_unknown`,
  `msg_schedule_standard`). Then run step `js_planning` again (imports
  MODE / PIECE_SCHEDULING / RETRY_BACKWARD / KEEP_FORWARD_DP) and Schedule
  All once (the existing rows have Forward unchecked until rescheduled).
- New / changed RPCs (nline.desk): `js_planning_rfq`;
  `js_planning_non_stocked(view, include_stocked)`;
  `js_supply_demand(product, horizon)` (returns `linked_qty`, Links as
  text); `js_schedule_list`, `js_schedule_delete`,
  `js_schedule_delete_work_order`, `js_schedule_comparison`; optional
  trailing `schedule` (Schedule ID) on `js_schedule_info`,
  `_resource_details`, `_work_order_details`, `_chart`, `_export` (+
  format `tab`), `_work_order`; `js_schedule_settings` / `_all` take
  `schedule` and `description`. The JS sends the new arguments only when
  they differ from the defaults, so it also runs on the old module.
- Supply & Demand duplicate: keep **Planning's**
  (`JobshopPlanning.supplyDemand(productId)`): it is Jobshop's dialog of
  the Planning layouts (dlgStockedPartNetting / StockedPart*: Horizon,
  part change, Sub / Seq / Piece No, Projected Available, Drawing,
  totals). Inventory's View > Open Part Supply and Demand... could call
  it (`JobshopPlanning.supplyDemand(product id of the template)`) and drop
  `part_supply_demand` (inventory.js `supplyDemand`, nline_js_inventory
  desk.py) — not edited by me.
- Engineering: Jobshop's work order Project/Reference/Other
  (WORK_ORDER.OTHER_INFO, filled on 1,561 work orders) has no ERP field.
  If one is added to `production` (e.g. `other_info`), Planning shows it
  already (`_js_reference` reads `other_info` / `project_reference` /
  `reference`).
- The Work Order window (engineering) can call
  `Rpc.desk('js_schedule_work_order', [id])` and
  `js_schedule_delete_work_order` for its Tools.

## Test results

- `test.ps1 nline_js_planning`: 25 tests OK (scenario extended: RFQ from
  Non-Stocked, include stocked, link targets' available quantity, stocked
  filters / new columns, Supply & Demand projected, backward schedule,
  forward fallback, Days Early/Late, what-if schedule + comparison +
  delete, Delete Work Order Schedule, tab export, migration of MODE /
  RETRY_BACKWARD). `jscheck.py planning.js`: OK.
- Battery (`run_battery.py planning scheduling`, local server still on the
  OLD module, new JS):
  - scheduling: every ribbon menu item, Set Load Horizon, Weekly
    Calendars, Calendar Exceptions, exports, tabs and buttons ran without
    error. Schedule All showed "session expired" before the
    `js_schedule_list` fallback was added (that RPC is not on the old
    module); fixed. Fixed during the runs: the menus opened before the
    window had loaded (`info` null) — the ribbon menus now wait for it.
  - planning: no error, no console exception. Many "missing" results are
    timing: the old module's Stocked tab takes ~20 s and Non-Stocked ~14 s
    on nline_test (the battery reloads the screen per action); fixed in
    the module (stocked parts only, order points read at once), effective
    after the module update. Fixed during the runs: tabs are now the
    frame's (`.tabs` / `.tab-pane`), Planning Tools ▾ waits for the
    window, the Horizon fields, radio groups.
  - Re-run both routes after the module update.
- Probe used: `jobshop_analysis\tools\probe_planning.py` (loads a route,
  evaluates an expression, screenshot).
