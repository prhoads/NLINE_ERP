# Jobshop emulation status: Planning (nline_js_planning)

Module `modules/nline_js_planning`, screens `nline_desk/web/js/jobshop/planning.js`
(routes `#/planning` = Material Planning, `#/scheduling` = Scheduling: they take
over `Screens.materialPlanning` / `Screens.scheduling` of `js/planning.js`),
data `migration/jobshop/planning.py` (step `js_planning`).
Tests: `test.ps1 nline_js_planning` (25 tests, OK 28 Oct; scenario
`tests/scenario_nline_js_planning.rst`: the four Material Planning sections,
linking / unlinking, Create New Work Order, sales order status, purchase orders
for materials (linked), services and stocked parts, Supply & Demand, Schedule
All finite on the calendar, a calendar exception, Schedule Work Order, Freeze,
the chart, the MS Project XML / CSV export, the settings, the migration on
Jobshop-like rows run twice). JS: `jscheck.py` OK.

## Checklist

- [x] What are Planning Functions? (`What_are_Planning_Functions.txt`)
- [x] Material Planning
  - [x] What is Material Planning? (`What_is_Material_Planning_.txt`)
  - [x] What is Supply & Demand? (`What_is_Supply_&amp;_Demand.txt`) — dialog with the Sales Orders, Work Orders and Purchase Orders tabs (running Demand / Supply), right-click "View Supply and Demand" (and double-click on a Stocked Parts line); exported as `JobshopPlanning.supplyDemand(productId)` for the other areas (`desk.js_supply_demand`)
  - [x] Material Planning Window Field Level Descriptions (`VPlanningPlanning.txt`) — every column of the four sections, in Jobshop's order; Order By Date in red when past; Projected On Hand red / blue / black on safety stock and order point; Message in red ("Short", "Not linked to a work order")
  - [x] Material Planning Maintenance
    - [x] Accessing Material Planning (`Accessing_Material_Planning.txt`) — four tabs, Refresh (F5), Planning Tools button = the right-click menu of the current section
    - [x] Open Sales Orders
      - [x] Working with Open Sales Orders (`Working_with_Open_Sales_Orders.txt`) — lines of the Firm (quotation) and Released (confirmed, processing) sales orders still to ship
      - [x] Changing the Open Sales Orders View (`Changing_the_Open_Sales_Orders_View.txt`) — View: View All / Exclude Fully Linked (default), in the bar and the right-click
      - [x] Linking Open Sales Orders (`Linking_Open_Sales_Orders.txt`) — Link Order Line To: New Work Order with Status Unreleased / Firm / Released, Existing Work Order...; only fabricated parts; several lines of one part = one work order (a Job of nline_job covering them); + Break Links to Work Orders (the "Breaking or Unlinking" topic)
      - [x] Creating Unlinked Work Orders for Sales Order Lines (`Creating_Unlinked_Work_Orders_for_Sales_Order_Lines.txt`) — Create New Work Order dialog: New Work Order ID (empty: the sequence), Lot ID, Split ID (number `<ID>/<lot>.<split>` as the migration), Part ID, Description, Copy Eng ID (the part's masters), Release Date (want less lead time), Want Date, Order Qty (Qty Due), Status, Forward Schedule from Release Date (engineering's `forward_schedule`)
      - [~] Changing the Status of Sales Orders (`Changing_the_Status_of_Sales_Orders.txt`) — "Change Sales Order Status: X" for the statuses the order may take (nline_js_sales `sales_order_status`: Unreleased, Firm, Released, Hold, Closed, Cancelled); a released order being processed can not go back to Firm / Unreleased (Tryton's workflow), those are not offered
    - [x] Non-Stocked Parts
      - [x] Working with Non-Stocked Parts (`Working_with_Non-Stocked_Parts.txt`) — material cards of the open work orders (and legs) for parts not stocked; cards supplied by a leg are not demand; cards covered by a Job show "WO <job>"
      - [x] Changing the Non-Stocked Parts View (`Changing_the_Non-Stocked_Parts_View.txt`) — View All / Exclude Fully Linked; column header click sorts (Shift: descending)
      - [x] Creating Linked Purchase Orders in the Non-Stocked Parts Section (`Creating_Linked_Purchase_Orders_in_the_Non-Stocked_Parts_Section.txt`) — Create Purchase Order for supplier...: the parts' suppliers or Other (lookup); identical parts consolidated to one line, linked to each work order (nline_js_purchasing's `nline.purchase.link`); minimum / multiple order quantity applied; the Purchase Order window opens. + Create Work Order (a Job covering the cards), Create Purchase Request (no supplier: the earlier desk's), Break Links to Purchase Orders
    - [x] Outside Services
      - [x] Working with Outside Services (`Working_with_Outside_Services.txt`) — outside operations (routing step with a supplier) of the open work orders not finished
      - [x] Changing the Outside Services View (`Changing_the_Outside_Services_View.txt`)
      - [x] Creating Linked Purchase Orders for Outside Services (`Creating_Linked_Purchase_Orders_for_Outside_Services.txt`) — one PO for the chosen supplier, the line linked to the operation (`production.work.purchase_line`, nline_outside_service); note nline_outside_service already buys them when a work order is released
      - [x] Viewing Linked Work Orders for Outside Services (`Viewing_Linked_Work_Orders_for_Outside_Services.txt`) — Open Work Order (+ Open Purchase Order)
    - [x] Stocked Parts
      - [x] Working with Stocked Parts (`Working_with_Stocked_Parts.txt`) — On Hand, Net Demand (open WO cards + open SO lines), Total Supply (open PO lines + open WOs), Projected, colors; filters Part ID / Product Code / Commodity Code / Pref Supplier ID ranges, Active / Inactive / Both, Horizon, Short Only
      - [x] Changing the Stocked Parts View (`Changing_the_Stocked_Parts_View.txt`) — View All / Short Only (projected at or below max(order point, safety stock, 0))
      - [x] Creating Purchase Orders for Your Purchased Stocked Parts (`Creating_Purchase_Orders_for_Your_Purchased_Stocked_Parts.txt`) — quantity per part in the dialog (suggested: up to the order point's target)
      - [x] Creating Work Orders for Your Fabricated Stocked Parts (`Creating_Work_Orders_for_Your_Fabricated_Stocked_Parts.txt`) — Order Qty = the order point, status Firm
- [x] Scheduling
  - [x] What is Scheduling? (`What_is_Scheduling_.txt`)
  - [x] Schedule Components (`Schedule_Components.txt`) — load vs capacity (units per shift), work order inputs (setup + run hours of the operation, less the hours already reported; outside service = its supplier's lead time in days, or the PO line's delivery date), resource inputs (calendar, shift capacities, Schedule Method finite / infinite of the Shop Resource), outputs (start / finish per unit, could start / finish, determinant path)
  - [~] The Jobshop Scheduler (`The_Jobshop_Scheduler.txt`) — backward from the want date, forward when Forward Schedule or when backward would start before the as-of date (or the release date when hard), Retry Backward (see Decisions); finite or infinite; no discontinuous operations, no additional resources, no min/max units per operation, no minimum move quantity overlap (Piece Scheduling is stored only)
  - [x] Scheduling Window Field Level Descriptions (`VPlanningScheduling.txt`) — Resource Details (View Type, Shop Resource ID / Shop View ID or All, Frozen editable, Resource ID, Work/Lot/Split/Sub ID, Seq No, Unit No, Start, Finish, Qty, Cmp Qty, Status, Could Start (red when earlier), Could Finish, Want Date, Determinant, Forward, Late), Work Order Details (Work ID, Want / Release / Finish / Start dates, Rank, Forward, Frozen + the grid), Schedule tab
  - [x] Exporting Your Schedule to MS Project (`Exporting_Your_Schedule_to_MS_Project.txt`) — Tools > Export Schedule to MS Project (XML): a Project XML (MSPDI) file, a summary task per work order, a task per operation (Start No Earlier Than its start, predecessor the previous operation), the resources and their assignments; Tools > Export Schedule as CSV (Project's import map)
  - [x] Scheduler Maintenance
    - [x] Accessing the Scheduler (`Accessing_the_Scheduler.txt`) — bar colors: light blue, yellow (immediate), green (determinant), olive (late determinant), red (late), royal blue (frozen)
    - [x] Working with the Scheduler (`Scheduling.txt`) — Schedule All dialog (Schedule ID, Schedule as of (not before now), Infinite, Treat Release Dates as Hard, Sort By Order Want Date / Priority Want Date (global rank), Schedule Started Work Orders Normally / First, Don't Freeze / First, Freeze); Set Load Horizon (default 90 days); Schedule Work Order (Tools, and `desk.js_schedule_work_order` for the Work Order window)
    - [x] Viewing Resource Details (`Viewing_Resource_Details.txt`)
    - [x] Viewing Work Order Details (`Viewing_Work_Order_Details.txt`)
    - [x] Schedule Information (`Schedule_Information.txt`) — schedule name, date bar (today in blue; Day mode hours 00-23, Week/Month days, Year months), operations, white capacity boxes per shift and units, resource names; Display Mode Day / Week / Month / Year, Zoom, Operations (F11), Capacity, Grid Lines, Highlight Work Order Immediate / Remove Highlight Immediate, Highlight Determinant Path, Right-click Info, Data Tips (the bar's tooltip), Freeze / Unfreeze; double-click opens the work order; By Work Order view keeps the earlier desk chart's drag of a work order's release / want dates (dashed bar)
    - [x] Working with Calendars (`Working_with_Calendars.txt`) — Tools > Weekly Calendar... and Calendar Exceptions... (Insert, Delete, Apply) edit the Shopfloor area's `nline.js.calendar.week` / `nline.js.calendar.change` (All = the shop's, or one resource)
- [-] Planning Reports
  - [-] Planning Reports (`Planning_Reports.txt`) — the reports are the admin area's (nline_js_admin); Resource Schedule can read `nline.js.schedule.operation`

## What it adds

- Models: `nline.js.schedule` (STANDARD and Jobshop's settings, load horizon),
  `nline.js.schedule.operation` (the scheduler's output, Jobshop's
  OPERATION_SCHED: production, root, work or routing step, resource, unit,
  start, finish, could start / finish, determinant, frozen, started).
  Access: read for all, write for `production.group_production`.
- Desk RPCs (`nline.desk`): `js_planning_access`, `js_planning_sales`,
  `js_planning_link`, `js_planning_unlink`, `js_planning_link_targets`,
  `js_planning_new_work_order`, `js_planning_create_work_order`,
  `js_planning_sale_status`, `js_planning_non_stocked`, `js_planning_outside`,
  `js_planning_stocked`, `js_planning_purchase`, `js_supply_demand`,
  `js_schedule_info`, `js_schedule_settings`, `js_schedule_all`,
  `js_schedule_work_order`, `js_schedule_freeze`,
  `js_schedule_resource_details`, `js_schedule_work_order_details`,
  `js_schedule_chart`, `js_schedule_export`. The earlier `planning`,
  `plan_work_order`, `plan_purchase`, `schedule`, `reschedule` of
  nline_desk stay (the screen uses `plan_purchase` and `reschedule`).
- No calendar model: the Shopfloor area's (`nline_js_shopfloor`) is used; no
  link model: nline_js_purchasing's `nline.purchase.link` (links made by
  Material Planning have production + seq no + piece no of the card).

## Second pass (28 Oct 2026, from Jobshop's own layouts)

Analysis and gap tables: `docs/jobshop/analysis/planning.md` (37 gaps, 30
done). Changed:

- Material Planning: tabs in Jobshop's order and names (Stocked/Fabricated
  Only Parts, Non-Stocked Parts, Outside Services, Open Sales Order Lines);
  the stocked filter area placed as the layout (frame `UI.placedForm`), all
  grid columns of the layouts, editable Unit Material Cost / Order Quantity
  with the Total Estimated Cost, the selected part's Supply & Demand under
  the grid; Jobshop's popups with submenus and Browse filters; Create
  Request For Quote for Supplier (`js_planning_rfq`); Include Material
  Demand for Stocked Parts; LinkableWOs grid; NewWOLink placed with Global
  Rank; Supply & Demand as dlgStockedPartNetting (horizon, part change,
  projected available, drawing).
- Scheduling: backward scheduling; what-if schedules and the Schedule
  Comparison tab; Schedule All with every option of the Scheduler layout;
  Jobshop's Scheduling / Tools / Options menus; Resource / Work Order
  Details as laid out; tab-delimited Export Schedule; Delete Work Order
  Schedule; Weekly Calendars / Calendar Exceptions with Jobshop's columns.
- Fields: `nline.js.schedule.mode`, `piece_scheduling`, `retry_backward`,
  `keep_forward_dp`; `nline.js.schedule.operation.forward`.

## Decisions

- Work order status = nline_js_engineering's `order_status` (Firm / Hold =
  `planning_status` on a draft). Material demand and supply count every open
  work order (request ... running), as the earlier desk planning; the
  scheduler schedules Firm and Released only (Jobshop).
- The scheduler schedules as Jobshop: backward from the end of the want
  date (the last operation first, each on the unit with the latest start);
  when the backward schedule would start before the as-of date (or the
  release date when hard), or the work order is Forward Schedule, forward
  (as soon as possible, or from the release date) — Forward is then checked
  on its operations; Retry Backward reschedules backward from the forward
  end date (Keep Determinant Path keeps the forward path's flags). A work
  order without want date goes forward. Legs: forward, before the parent's
  operation they feed; backward, ending at that operation's start.
- What-if schedules: Schedule All under a new Schedule ID copies
  STANDARD's settings; Material Planning and the Work Order dates read
  STANDARD only (Jobshop). The Schedule Comparison's What If 1 / 2 are
  chosen among the other schedules.
- Tab order of Material Planning follows the layout file (the user guide of
  2007 lists Open Sales Orders first; 6.1.2's window has Stocked/Fabricated
  Only Parts first).
- Supply & Demand: Planning's dialog is the one to keep (see the analysis).
- A finite schedule loads only the finite resources (Shop Resource Schedule
  Method finite; Jobshop's default and the import's is infinite); each
  operation stays on one unit (Jobshop) and takes the unit with the earliest
  finish. Capacity: the calendar row's, else the resource's shift capacity
  (1 / 0 / 0 when empty). No calendar at all: Monday to Friday 7:00, 8 hours.
- Dates of the schedule are the shop's local time (company time zone), stored
  as they are.
- Open sales orders: Firm (quotation) lines count their whole quantity (no
  shipment yet). Qty On Hold is 0 (no hold locations yet).
- Sales order status changes go through nline_js_sales's `sales_order_status`.
- Stocked = Inventory's `stocked` when the module is installed, else "has an
  order point"; lead time, order point, safety stock, codes, Mfg come from the
  Inventory area's part fields when present (`lead_time_days`,
  `order_point`, `safety_stock`, `product_code`, `commodity_code`,
  `preferred_supplier`, `mfg_name`, `mfg_part_id`, `tool_or_fixture`,
  `minimum_order_qty`, `multiple_order_qty`), else Tryton's (order point,
  production / supplier lead times).
- Cmp Qty of an operation is the work order quantity once the operation is
  finished (Tryton works have no completed quantity).

## For the integrator

- Dependencies added to `tryton.cfg`: nline_job, nline_js_engineering,
  nline_js_purchasing, nline_js_sales, nline_js_shopfloor,
  nline_outside_service, nline_work_order, production_routing,
  production_work, purchase, purchase_request, sale, sale_supply_production,
  stock, stock_supply. Activate / update `nline_js_planning`.
- Data: run step `js_planning` after `js_shopfloor` (it imports the STANDARD
  schedule's settings; the calendars come with js_shopfloor). Then run
  Scheduling > Schedule All once.
- Suggestions for shared / other files:
  - nline_js_purchasing `desk.py` reads `nline.js.purchase_link` (never
    defined now): the planning links are in `nline.purchase.link` already,
    that branch can go.
  - The Work Order window (engineering) can call
    `Rpc.desk('js_schedule_work_order', [id])` for Tools > Schedule Work
    Order and `js_schedule_work_order_details` for the scheduled dates.
  - Inventory's Part window has its own Supply & Demand dialog; one of the two
    could be dropped (`JobshopPlanning.supplyDemand(productId)` or
    `JobshopInventory.supplyDemand(templateId)`).
  - nline_desk's Home tile / old `js/planning.js` screens are now shadowed by
    the jobshop routes; the Quotes screen in `js/planning.js` is untouched.
- Not emulated: Shop View scheduling filter works only with nline_js_shopfloor
  shop views (it is a dependency); employee calendars and calendar breaks are
  not used by the scheduler; Number of Shifts in the schedule header.

## Screenshot review fixes (2026-10-28)

- Schedule tab: when no operation is scheduled (the test copy: the schedule
  was never run) a banner above the chart says so, how to run Schedule All
  (with the schedule right), and that the outlined boxes are each
  resource's working hours and shift-less days (weekends) stay blank.
  Resource rows show the resource's own name (the "N-Line Shop /" parent
  and the unit count in the tooltip, "×n" when more than one unit); the
  name column is 190 px. The clipped "n unit(s)" second line is gone.
- Supply & Demand header (StockedPartHorizonDate): Part ID, Stock UM and
  Drawing ID/Rev start a few units right of the control before them (their
  Jobshop boxes touch).
