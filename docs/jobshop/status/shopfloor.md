# Jobshop emulation status: Shopfloor (nline_js_shopfloor)

Module `modules/nline_js_shopfloor` (`resource.py`, `employee.py`,
`labor.py`, `stock.py`, `desk.py`), screens
`nline_desk/web/js/jobshop/shopfloor.js`, data `migration/jobshop/shopfloor.py`.
Tests: `test.ps1 nline_js_shopfloor` (25 tests, scenario
`tests/scenario_nline_js_shopfloor.rst`: resources and their setup, shop
groups, shop views, calendars, employees table, material issues / returns /
close now / issue on the fly, labor entry with Jobshop costing (setup/run,
shift multiplier, fixed burden once), the earlier labor entry, indirect
labor, labor reversal, the terminal (clock in, scan, start, suspend, resume,
delete, post, save, clock out), employee delete denied, where used, reset
operation info, work order receipt partial / return / to completion with the
cost check, the migration on Jobshop-like rows run twice). JS: `jscheck.py` OK.

The Work Order window, its cards and the Work Orders subtree of the checklist
are the engineering area's; the Shopfloor reports are nline_js_admin's.

## Screens and routes

| Jobshop | Route | Screen | Takes over |
|---|---|---|---|
| Material Issues/Returns | `issues` | `jsMaterialIssues` | `Screens.materialIssues` |
| Work Order Receipts/Returns | `wo-receipts` | `jsWoReceipts` | `Screens.woReceipts` |
| Shop Resources | `resources`, `resources/<id>` | `jsResources` | `Screens.resources` |
| Shop Groups | `shop-groups`, `shop-groups/<id>` | `jsShopGroups` | new |
| Shop Views | `shop-views`, `shop-views/<id>` | `jsShopViews` | new |
| Labor Entry (+ Labor Reversal tab) | `labor` | `jsLaborEntry` | `Screens.laborEntry` |
| Labor Data Collection | `labor-collection` | `jsLaborCollection` | new |
| Employees | `employees`, `employees/<id>` | `jsEmployees` | `Screens.employees` |

## Checklist

- [x] What are Shopfloor Functions? (`What_are_Shopfloor_Functions.txt`)
- [-] Work Orders (whole subtree) — the engineering area's (Work Order window, cards, routes `work-orders/*`, `workorders/*`). This area gives it: `production.work` labor fields (`setup_completed`, `run_completed`, `completed_quantity`, `deviated_quantity`, `setup_hours`, `run_hours`, `operation_quantity`, `operation_closed`, `labor_tickets`) for the cards' status, View > Labor Txs (`sf_labor_tickets` with `kind: 'work_order'`), View > Inventory Txs (`sf_part_transactions`), Issue/Return Materials (route `issues`) and Start Labor Ticket for Employee (`sf_dc_start` or `sf_labor_post`).
- [x] Shop Resources
  - [x] What are Shop Resources? (`What_are_Shop_Resources_.txt`)
  - [x] Shop Resource Window Field Level Descriptions (`VShopfloorShopResource.txt`) — Shop Resources tab: ID, Description, Resource Type (Machine, Assembly Area, General Area, Contractor, Group, Team/Individual), Schedule Method, Schedule Type, Group Exclusivity, Min Segment Size, Shift 1/2/3 Capacity, Auto Report, Special Instructions (+ Tryton's Category, Warehouse, Active); Costs tab: Labor/Hour (Setup), Labor Run Per Hour, Labor Cost/Unit, Bur/Hr (Setup), Bur Percent Setup, Bur Per Hr Run, Bur Percent Run, Bur Per Unit Run, Bur Per Oper, the actual burden columns of the schema (ACT_BUR_*, "Fixed Burden" = ACT_BUR_PER_OPER), and Tryton's cost rate / per; Browse: ID, Description, Resource Type. Account Set ID: `[-]` (Premier; account sets are QuickBooks').
  - [x] Shop Resource Maintenance
    - [x] Accessing Shop Resources (`Accessing_Shop_Resources.txt`)
    - [x] Resetting Operation Costs (`Resetting_Operation_Costs.txt`) — Reset Operation Info (shown to who may change resources): current / all resources, quote master / engineering master / work order operations, by operation status, by creation date. The operations take the resource's costs into the engineering area's operation cost fields (`setup_cost_hour`, `run_cost_hour`, `run_cost_unit`, `setup_burden_hour`, `run_burden_hour`, `burden_unit`, `burden_operation`, `setup/run_burden_percent`, when present) and a `reset_operation_costs(records)` classmethod is called on works / steps if a module defines it; the work center's Tryton rate becomes run/hr + run burden/hr. Without a status only open work orders are reset.
    - [x] Editing Shop Resources (`Editing_Shop_Resources.txt`)
    - [x] Deleting Shop Resources (`Deleting_Shop_Resources.txt`) — Delete per rights (Tryton refuses one in use)
    - [x] Shop Resources Tab Information
      - [x] Understanding the Shop Resources Tab (`Understanding_the_Shop_Resources_Shop_Resources_Tab.txt`)
      - [x] Understanding the Costs Tab (`Understanding_the_Shop_Resources_Costs_Tab.txt`)
      - [x] Understanding the Browse Tab (`Understanding_the_Shop_Resources_Browse_Tab.txt`)
    - [x] Viewing Where Used Resource Information (`Viewing_Where_Used_Resource_Information.txt`) — Where Used: quote masters, engineering masters (routing steps on the resource — the engineering area's `step.resource`, else the operation's work center category), work orders; check boxes filter; double-click opens
    - [x] Working with Jobshop Resource Calendars (`Working_with_Jobshop_Resource_Calendars.txt`) — Weekly Calendar and Calendar Exceptions tabs (`nline.js.calendar.week` / `.change`: day, shift 1-3 hours and capacities; start/end dates, reason code). Lines without a resource = the shop's default week (System Settings). Start of day is stored (migration) but not edited in the grid (no time widget in frame.js). The scheduler that reads them is the planning area's.
- [x] Shop Groups
  - [x] What are Shop Groups? (`What_are_Shop_Groups_.txt`)
  - [x] Shop Group Window Field Level Descriptions (`VShopfloorShopGroup.txt`) — a shop group is a work center of type Group (new one: Infinite, Inclusive): ID, Description, Group Exclusivity; Members: Seq # (10, 20...), Resource ID, Description, Resource Type; a group cannot be a member (no nesting), nor its own
  - [x] Shop Groups Maintenance
    - [x] Accessing Shop Groups (`Accessing_Shop_Groups.txt`)
    - [x] Entering Shop Group Information (`Entering_Shop_Group_Information.txt`)
    - [x] Deleting Shop Groups (`Deleting_Shop_Groups.txt`) — deletes the group resource; a member line deleted with ✕
- [x] Shop Views
  - [x] What are Shop Views? (`What_are_Shop_Views_.txt`)
  - [x] Shop Views Window Field Level Descriptions (`VShopfloorShopView.txt`) — `nline.js.shop_view` (ID, Description) and its resources (Seq #, Resource ID, Description, Type; a duplicate resource refused)
  - [x] Shop Views Maintenance
    - [x] Accessing Shop Views (`Accessing_Shop_Views.txt`)
    - [x] Entering Shop Views (`Entering_Shop_Views.txt`)
    - [x] Deleting Shop Views (`Deleting_Shop_Views.txt`)
- [x] Labor Entry
  - [x] What is Labor Entry? (`What_is_Labor_Entry_.txt`)
  - [x] Labor Entry Window Field Level Descriptions (`VShopfloorLaborEntry.txt`) — Labor Entry tab: Employee Clock No, Shift No (the employee's), Shift Type (Regular 1x, Overtime 1.5x, Double 2x, Triple 3x), Transaction Type (Setup hides Completed Qty; Indirect hides the work order), Work/Lot/Split, Sub/Seq, Clock In (8:00 today, then the last Clock Out), Clock Out, Hours Worked (from the clock), Labor Allocation %, Completed Qty, Deviated Qty (needs a reason code), Reason Code (Labor type), Description, Completed, Operation Qty, Completed Qty to date; the labor table of the session (Entry No ... Cumulative ... Labor/Burden cost). Lot/Split: `[-]` (Tryton has one work order per ID; Sub = the leg number).
  - [x] Labor Entry Maintenance
    - [x] Accessing Labor Entry (`Accessing_Labor_Entry.txt`)
    - [x] Adding Labor to Work Orders (`Adding_Labor_to_Work_Orders.txt`) — Save posts a ticket (`sf_labor_post`); the earlier screen's operations table and quick hours post (`labor_entry`, now a ticket too) are kept
    - [x] Removing Labor from Work Orders (`Removing_Labor_from_Work_Orders.txt`) — Labor Reversal tab: All / Employee / Work Order / Resource, Transaction Date from/to, Show, click rows, Reverse; reversed and reversing rows yellow
- [x] Labor Data Collection
  - [x] What is Labor Data Collection? (`What_is_Labor_Data_Collection_.txt`)
  - [x] Labor Data Collection Window Field Level Descriptions (`VShopfloorLaborEntry.txt`)
  - [-] Installation
    - [-] Installing Labor Data Collection (`Installing_Labor_Data_Collection.txt`) — a web page: nothing to install; open `#/labor-collection` on the terminal
    - [-] Labor Data Collection System Requirements (`Labor_Data_Collection_System_Requirements.txt`) — a browser
    - [-] Configuring the Hardware (`Configuring_the_Hardware.txt`) — any keyboard-wedge scanner (types and presses Enter)
    - [-] Configuring the Software (`Configuring_the_Software.txt`)
  - [-] Networking Stand-Alone Labor Data Collection (`Networking_Stand-Alone_Labor_Data_Collection.txt`) — the terminal is the ERP itself
  - [x] Posting Labor
    - [x] Posting Labor in VISUAL Jobshop (`Posting_Labor_in_VISUAL_Jobshop.txt`)
    - [x] Reporting Completion Status (`Reporting_Completion_Status.txt`) — Completed closes the setup / the run; the operation closes when the run is complete or the completed quantity reaches the work order quantity (`operation_closed`)
    - [x] Costing Variables (`Costing_Variables.txt`) — employee Cost/Hr (setup / run rates when set), Cost/Unit; resource burden (actual columns first, then estimated; the employee's burden when the resource has none); the resource's labor rates when the employee has none; shift multipliers 1 / 1.5 / 2 / 3
    - [x] Posting Setup Labor (`Posting_Setup_Labor.txt`) — labor = cost/hr × hours × multiplier × allocation; burden = burden/hr × hours + burden % × labor + fixed burden (first ticket of the operation)
    - [x] Posting Run Labor (`Posting_Run_Labor.txt`) — + cost/unit × completed qty (labor) and burden/unit × completed qty
  - [x] Starting the Stand-Alone Labor Data Collection Function (`Starting_the_Stand-Alone_Labor_Data_Collection_Function.txt`) — the menu item (no separate login or license)
  - [x] Supervisory Functions
    - [x] Integrated Supervisory Functions (`Using_the_Integrated_Module_s_Supervisory_Functions.txt`)
    - [x] Supervisory Control (`Supervisory_Control.txt`) — Start, Edit, Suspend, Resume, Post, Save, Delete, Clear; Clock In / Clock Out of the employee (File > Employee Clock In/Out, `nline.js.employee_time`)
    - [~] Creating Reports with Barcodes (`Creating_Reports_with_Barcodes.txt`) — the terminal reads the bar codes: badge = clock number; traveler operation = `<work order>/<seq>` or `<work order>/<sub>/<seq>` (Code 39, `*...*` stripped); command bar codes `*%START*`, `%SUSPEND`, `%RESUME`, `%POST`, `%EDIT`, `%STOP`, `%CLEAR`, `%SAVE`, `%CLOSE`, `%APPLY`, `%OK`, `%CANCEL` (ButtonBarCodes.doc). Printing them on the Traveler, Employee Label, Pick/Cut List, Reason Code List is the reports area's (nline_js_admin; Traveler `production.traveler` of nline_build_tree).
    - [x] Effects of Authority Manager on the Labor Data Collection Module (`Effects_of_Authority_Manager_on_the_Labor_Data_Collection_Module.txt`) — with the Labor Entry menu the Employee / Work Order / Resource / Date / All selections; without it only the employee's own labor; buttons per the rights on `nline.js.labor_ticket`, `production.work.cycle`, `nline.js.employee_time`
    - [x] Managing Labor Transactions (`Managing_Labor_Transactions.txt`) — green in progress, yellow suspended, white post on save; multi-select by tapping rows; Edit Details; Del / Delete with confirmation
  - [x] Using the Labor Data Collection Windows
    - [x] Using the Labor Data Collection Windows (`Using_the_Labor_Data_Collection_Windows.txt`) — Start: Labor Entry Details (scan the traveler or choose Work/Lot/Split and Sub/Seq, Type, Shift No/Type, Clock In = now); Spec = the resource's special instructions (first 255 characters). Drawing button `[-]`: the engineering area's drawings.
    - [x] Suspending Work Order Operations (`Suspending_Work_Order_Operations.txt`) — a posted line and a yellow suspended line; Resume clocks in again
    - [x] Posting to Work Order Operations (`Posting_to_Work_Order_Operations.txt`)
    - [x] Saving Labor Transactions to the Database (`Saving_Labor_Transactions_to_the_Database.txt`) — Save: posted lines become costed labor tickets and done work cycles
    - [x] Editing and Deleting Saved Labor Transactions (`Editing_and_Deleting_Saved_Labor_Transactions.txt`) — a saved ticket cannot be deleted (server), only reversed in Labor Entry
- [x] Material Issues
  - [x] What are Material Issues? (`What_are_Material_Issues_.txt`)
  - [x] Material Issues Window Field Level Descriptions (`VShopfloorMaterialIssues.txt`) — Date, Work ID, Sub/Seq, Show All, Stocked Parts Only; Select All, UnSelect All, Select All For Return; table: Issue, Close Now, Sub ID, Seq No, Piece No, Part ID, Description, Status, Issue Qty (red over the location quantity), Usage U/M, Location ID, Issued To Date, Qty Due, Location Qty, Available, Qty on Hand, Linked, Tracked; an empty last row adds a part not on the work order (issued on the fly). Length/Width/Height and Tracking No/Quantity `[-]`: no piece or lot tracking in the ERP (Linked/Tracked shown empty).
  - [x] Material Issue Maintenance
    - [x] Accessing Material Issues (`Accessing_Material_Issues.txt`)
    - [x] Issuing Material to Work Orders (`Issuing_Material_to_Work_Orders.txt`) — partial issues split the move; a negative quantity returns to stock (an output of the production at the issued cost: Tryton takes it off the work order's cost); Close Now cancels what is left. The earlier `issue_material` RPC is kept.
    - [x] Viewing Inventory Pieces (`Viewing_Inventory_Pieces.txt`) — right-click > Inventory Pieces: the part's stock by location (no pieces in the ERP)
    - [x] Viewing Inventory Transactions (`Viewing_Inventory_Transactions.txt`) — right-click > Inventory Txs; Open Part
- [x] Work Order Receipts
  - [x] What are Work Order Receipts? (`What_are_Work_Order_Receipts_.txt`)
  - [x] Work Order Receipts Window Field Level Descriptions (`VShopfloorWOReceipts.txt`) — Date, Show All Currently Open / Previously Received Work Orders, Exclude Fully Linked, Exclude Not Fully Completed; table: Transact Now, Close Short, Work Order ID, Sub ID, Part ID, Desired, Linked, Received Qty, For Return, Rec/Rtn Qty, U/M, Location, Qty Available, Order Status, Description, Tracked (`[-]` lot)
  - [x] Work Order Receipt Maintenance
    - [x] Accessing Work Order Receipts (`Accessing_Work_Order_Receipts.txt`)
    - [x] Receiving Work Orders (`Receiving_Work_Orders.txt`) — partial receipt (that much of the output done now at the cost so far; Tryton prices all outputs again at the close), to completion or Close Short (the work order done; its unfinished operations finished by nline_wip's Finish when installed, else empty cycles). Right-click > Receive All and Close keeps the earlier `work_order_receive`.
    - [~] Returning Work Orders to the Shop Floor (`Returning_Work_Orders_to_the_Shop_Floor.txt`) — while the work order is open (received in part): an input of the part back into the work order (its value back in WIP) and as much more to receive; the received parts then carry the whole work order cost again (`Production.set_cost` override in stock.py). A closed (done) work order cannot be reopened in Tryton: it is listed but not offered for return.
- [x] Employees
  - [x] What are Employees? (`What_are_Employees_.txt`)
  - [x] Employee Window Field Level Descriptions (`VShopfloorEmployee.txt`) — Jobshop's table: Clock No (upper case, no spaces), Name, Shift No, Cost Per Hr, Setup / Run Cost/Hr, Cost Per Unit, Department, Title, Hire Date, Termination Date, Inactive (Show Inactive); row header + / ✔ / ✕; Details (the earlier Employee window kept, + burden, picture, notes)
  - [x] Employee Maintenance
    - [x] Accessing Employees (`Accessing_Employees.txt`)
    - [x] Adding Employees (`Adding_Employees.txt`) — a new row makes the person (party) and the employee
    - [x] Editing Employee Information (`Editing_Employee_Information.txt`)
    - [x] Deleting Employees (`Deleting_Employees.txt`) — Del marks; not offered for an employee with labor (Delete Denied; the server refuses too)
- [-] Shopfloor Reports (`Shopfloor_Reports.txt`) — nline_js_admin (all Jobshop reports)

## Models and fields

- `production.work.center` (+): `description`, `resource_type`, `schedule_method`, `schedule_type`, `exclusivity`, `min_segment_size`, `shift_1/2/3_capacity`, `auto_reporting`, `special_instructions`, `setup_per_hr`, `run_per_hr`, `run_per_unit`, `bur_per_hr_setup`, `bur_percent_setup`, `bur_per_hr_run`, `bur_percent_run`, `bur_per_unit_run`, `bur_per_oper`, `act_bur_*` (6), `members`, `calendar_weeks`, `calendar_changes`; search by description too.
- `nline.js.resource.member` (Shop Group members), `nline.js.shop_view` (CodeTable) + `nline.js.shop_view.resource`, `nline.js.calendar.week`, `nline.js.calendar.change`.
- `company.employee` (+): `clock_no` (unique per company), `shift_no`, `department`, `title`, `cost_per_hr`, `setup_cost_per_hr`, `run_cost_per_hr`, `cost_per_unit`, `bur_per_hr_setup`, `bur_per_hr_run`, `bur_per_unit_run`, `bur_percent_setup`, `bur_percent_run`, `inactive`; rec_name "CLOCK - Name"; delete refused with labor.
- `nline.js.employee_time` (clock in / out).
- `nline.js.labor_ticket` (SHOPFLOOR_LABOR_TRAN): employee, shift, shift type, setup/run/indirect, work order, operation, resource, dates, clock in/out, hours, allocation, completed/deviated qty, reason, description, completed, state (in progress / suspended / post on save / saved), reversing / reversal_of / reversed, the rates and labor / burden cost, the work cycle. Company rule.
- `production.work` (+, function fields): see the Work Orders line above.
- `stock.move` (+): `material_return`, `receipt_return`. `production.set_cost` (+): parts returned to the shop floor.
- Access: read for all; write/create/delete `production.group_production`.

## RPCs (nline.desk)

Reads: `sf_material_lines`, `sf_part_quantities`, `sf_part_transactions`, `sf_receipt_lines`, `sf_resource_where_used`, `sf_employees`, `sf_work_order_operations`, `sf_labor_tickets`, `sf_dc_employee`, `sf_dc_tickets`, `sf_operation_lookup`.
Writes: `sf_material_save`, `sf_receipt_save`, `sf_resource_setup`, `sf_reset_operation_costs`, `sf_employees_save`, `sf_labor_post`, `sf_labor_reverse`, `sf_dc_start`, `sf_dc_post` (with `suspend`), `sf_dc_resume`, `sf_dc_edit`, `sf_dc_delete`, `sf_dc_save`, `sf_clock`; `labor_entry` overridden (a ticket now, same return + `ticket`). Kept as they are: `issue_material`, `work_order_receive`, `labor_cancel`, `work_order_info`, `open_work_orders`. Date-times go to and from the screens as local `YYYY-MM-DD HH:MM` (company time zone).

## Decisions

- A resource is a work center (as the migration made them); a shop group is a work center of type Group, so groups appear in Shop Resources as in Jobshop.
- Labor goes to work orders that are open (Tryton waiting / assigned / running = Firm / Released); closed and cancelled ones refuse it (Jobshop's FAQ).
- A saved ticket on an operation is a done `production.work.cycle` whose cost is the ticket's labor + burden; when no Jobshop rate is set anywhere (employee, resource), Tryton's work center rate costs it (the earlier behaviour). Reversal: a reversing ticket and a cycle of the opposite cost (Tryton refuses negative durations: the operation's cycle hours stay, the tickets' hours net out).
- The terminal's tickets live server-side (not in the PC's memory as in Jobshop), so a supervisor sees them from any desk; Start runs the operation's cycle (the Work Order window shows it Started).
- Receipts of work orders linked to sales lines are received too (Tryton ships from stock); Linked Qty is shown; the default receipt quantity is desired − received.
- `OPCOMPLETE` (Jobshop's "operation complete" clock number) is imported inactive.
- Not imported: the 30 labor transactions of 2005 (their work orders are not in the ERP), the employee password (never stored).

## For the integrator

- Module dependencies (tryton.cfg): company, ir, nline_desk, nline_js_common, party, product, production, production_routing, production_work, res, stock — no new standard module to activate.
- Data step `js_shopfloor` (`migration/jobshop/shopfloor.py`) after `resources`; re-runnable.
- Menus: Employees is `company.group_employee_admin`, Labor Data Collection `production.group_production` (nline_jobshop): shop floor users need group_production to use the terminal (labor tickets, clock in).
- Engineering: the Work Order window can show `production.work.operation_closed` / `setup_completed` / `run_completed` / `completed_quantity` on the cards; `production.received_quantity` (nline_js_engineering) counts the outputs — the net received is outputs − `receipt_return` inputs (and outputs with `material_return` are not the part).
- Planning (scheduling): resource capacity / schedule method / exclusivity / members / shop views / calendars are here (`production.work.center` fields, `nline.js.calendar.*`, `nline.js.shop_view`).
- Reports (admin): Employee Label / Traveler bar codes: badge `*<clock no>*`, operation `*<work order>/<seq>*` (or `/<sub>/<seq>`), commands `*%START*`...; Labor List / Labor Transaction / Labor Analysis / Employee Efficiency read `nline.js.labor_ticket`; Calendar Week / Exception lists read `nline.js.calendar.*`; Employee List reads the employee fields above.
- Suggested shared change: frame.js `fieldControl` has no `time` type (calendar start of day) and no `datetime` type (the shop screens use their own `datetime-local` inputs).
