# Shopfloor area: Jobshop 6.1.2 windows vs the ERP

Sources: `C:\NLINE_ERP_dev\jobshop_analysis\layouts\VShopFloor\*.txt` (the
program's own layouts), `jobshop_menus.txt` / `vjs_menus_raw.txt`, the help
(`VShopfloor*.txt`), the user guide (Release 1: chapters 34-40, older than
6.1.2 where they differ), and N-Line's data (`NLINE_VJS`, read only).
ERP side: `modules/nline_desk/web/js/jobshop/shopfloor.js`,
`modules/nline_js_shopfloor/*.py` (the dump `erp_screens.txt` was not
written when this was done: the code is the "is" side).

Jobshop 6.1.2's Shopfloor group bar (Vjs.exe strings 5270-5282): Work Orders
(engineering area), **Material Issues, Material Issue Barcoding, Work Order
Receipts, Shop Resources, Shop Groups, Shop Views, Labor Entry, Labor Data
Collection, Employees, Time and Attendance**, Reports (admin area).

## What N-Line's Jobshop data uses

| Table | Rows | Used |
|---|---|---|
| SHOPFLOOR_SHOP_RESOURCE | 633 (ASSEMBLY 371, CONTRACTOR 202, TEAM 54, MACHINE 6) | ID, description, type, costs. **Never**: INACTIVE (0), USER_0..23 (0), ACCOUNT_SET_ID (0), special instructions (0) |
| SHOPFLOOR_RESOURCE_MEMBER / SHOP_VIEW | 0 / 0 | shop groups and shop views unused |
| SHOPFLOOR_CALENDAR_WEEK | 7 | the shop's default week (Mon-Fri 07:00, 8 h); no resource or employee calendars; CALENDAR_CHANGE / BREAK 0 |
| SHOPFLOOR_DIRECT_EMPLOYEE | 2 (KIRSCH G, OPCOMPLETE) | clock no, name, shift; **never**: address, phone, mobile, e-mail, title, costs, notes, picture |
| SHOPFLOOR_EMPLOYEE_TIME | 0 | Time and Attendance unused |
| SHOPFLOOR_LABOR_TRAN | 30 (2005-2023) | labor practically unused |
| SHOPFLOOR_ISSUE_TRAN | 64 230 | material issues: the area's real work |
| SHOPFLOOR_MATERIAL | 62 144 | piece no on all; SUBORD_ENG_ID on 2 146 (Eng Master Revision shown); LENGTH/WIDTH/HEIGHT 0, AUTO_ISSUE 0; REFERENCE 2 823 |

Unused at N-Line (kept or noted, not built further): user-defined fields of
resources (Other tab: unused, not emulated), Account Set ID (QuickBooks
emulation), piece dimensions and lot tracking (Length/Width/Height,
Tracking No columns: not shown), piece tracking, the data collection
license / wizard modes.

---

## 1. Material Issues (`layouts\VShopFloor\MaterialIssues.txt`)

Jobshop: one tab. Row 1 Date, Show all; row 2 Work/Lot/Split ID (lookup) /
Lot / Split, **&Issue** button; row 3 Sub/Seq (lookup); a frame with Select
All, UnSelect All, Select All for Return, Stocked Parts Only. Grid (add,
delete): Issue, Close Now, Sub ID, Seq No, Piece No, Part ID, Description,
Status, Issue Qty (Usage UM), Length, Width, Height, Usage U/M, Location ID,
Issued To Date (Stock UM), Qty Due (Usage UM), Location Qty (Stock UM),
Avail, Qty On Hand, Qty Available, Linked, Tracked, Tracking No/Quantity,
Eng Master Revision. Popup (PopupMaterialIssues): Inventory Pieces...,
Open Part.... Double-click / Tools > Issue Material...: Issue Details
(`IssueEntryDetails.txt`: Part ID + description, Location ID, Material
Information frame: Work/Lot/Split, Auto Issue, Sub/Seq/Piece, Req'd, Part
ID, unLinked Qty Due, Calc Qty, Eng Master Rev, Issued Qty, Length/Width/
Height, Reference, Linked; Issue Information frame: piece location and
dimensions, Issue Quantity, Qty Available to Issue, Tracking No, Close
Short). Message: "(Work qty * Mat qty per) - Issued qty - Linked qty =
Quantity due".

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | Date + Show all on row 1, Work/Lot/Split ID + Issue button row 2, Sub/Seq row 3 | one row: Date, Work Order ID, Sub/Seq, checks | shopfloor.js `jsMaterialIssues` header | S | done |
| 2 | missing | &Issue button | ribbon Save only | Issue button (hidden without rights) | S | done |
| 3 | different | "Select All for Return"; Stocked Parts Only beside the buttons | "Select All For Return"; with the date | labels / position | S | done |
| 4 | missing | Qty Available (Stock UM) column | - | `sf_material_lines` `qty_available` (warehouse on hand less assigned moves) | S | done |
| 5 | missing | Eng Master Revision column | - | `revision` = material card `component_revision` | S | done |
| 6 | different | column titles with (Stock UM)/(Usage UM), "Avail" Y/N, "Qty On Hand" | Available Yes/No, short titles | titles | S | done |
| 7 | missing | Issue Details dialog (double-click) | - | `issueDetails()` read-only dialog; RPC adds `required_date`, `reference`, `calc_qty` | M | done |
| 8 | different | popup Inventory Pieces..., Open Part... | Inventory Pieces, Inventory Txs, Open Part | Jobshop's two first, Inventory Txs kept below | S | done |
| 9 | missing | Lot / Split lists | - | one work order an ID in Tryton (decision: Sub = leg) | - | left: no lots/splits |
| 10 | missing | Length/Width/Height, Tracking No/Quantity, piece location | - | unused at N-Line (0 rows) | - | left: unused |
| 11 | missing | Sub/Seq lookup | select of the operations | a select of the work order's operations is the lookup | - | done (as is) |

## 2. Material Issue Barcoding (`MaterialIssuesBC.txt`) — new

Jobshop: a grid (delete) Entry No, Close Now, Work ID, Lot ID, Split ID, Sub
ID, Seq No, Piece No, Part ID, Description, Issue Qty, Qty Due, Usage U/M,
Location ID, Qty Available, Length/Width/Height, Linked, Tracked, Tracking
No; buttons &Add (the details dialog: scan) and &Save.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | the window | - | route `issues-bc`, `Screens.jsMaterialIssuesBC`: Add = Issue Details (scan `<work order>` or `<wo>/<seq>`, choose the material, quantity, location, Close Short), ✕ deletes a row, Save issues per work order (`sf_material_save`) | M | done (menu item: integrator) |

## 3. Work Order Receipts (`WOReceipts.txt`)

Jobshop: Date, &Receive/Return button; frame: Show All Currently Open / Show
All Previously Received (radio), Exclude Fully Linked, Exclude Not Fully
Completed, Created On or After, Refresh Grid. Grid: Transact Now, Close
Short, Work Order ID, Lot ID, Split ID, Part ID, Desired Want Date, Desired
Quantity, Linked Quantity, Received Quantity, For Return, Rec/Rtn Quantity,
Linked Qty Received, Unit of Measure, Location (lookup), Location Qty
Available, Qty Avail. For Return, Order Status, Sched Finish Date,
Description, Tracked, Tracking No, Eng Master Revision. Popup
(PopupWOReceiptFilter): Filter Including, Filter Excluding, Filter by,
Remove Filters/Sort, Save widths, Sort Ascending, Sort Descending, Open
Work Order.... Messages: over-receive "Continue?", over-return refused.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | Created On or After + Refresh Grid | - | `sf_receipt_lines` `created_after`; button | S | done |
| 2 | missing | Receive/Return button | ribbon Save | button | S | done |
| 3 | missing | Desired Want Date, Linked Qty Received, Qty Avail. For Return, Sched Finish Date, Eng Master Revision | - | RPC `want_date`, `linked_received`, `return_available`, `finish_date`, `revision` | S | done |
| 4 | different | Desired/Linked/Received **Quantity**, Unit of Measure, Location Qty Available | short titles | titles | S | done |
| 5 | missing | popup filters / sort | Open Work Order, Inventory Txs | Filter Including/Excluding (the clicked cell), Remove Filters/Sort, Sort Ascending/Descending, Open Work Order... (+ kept items) | M | done |
| 6 | missing | over-receive confirmation | - | confirm before the save | S | done |
| 7 | different | Lot ID, Split ID | Sub ID | decision (no lots/splits) | - | left |
| 8 | missing | Filter by..., Save widths and positions | - | Filter by = Filter Including in practice; column widths not saved (no grid layout store) | M | left: needs a shared grid-layout store |

## 4. Shop Resources (`ShopResource.txt`, `ShopResourceSubTabs.txt`)

Jobshop tabs: **Shop Resources** (Shop Resource ID + lookup, Inactive,
Record Created by, Description, Last Modified by, Type; frame Scheduling
Attributes: Schedule Method, Schedule Type, Min segment size [hours], Group
Exclusivity; frame Capacity: Shift 1/2/3; frame Special Instructions),
**Costs** (note; frames Labor Costs (Estimated Only): Labor/Hour (setup),
Labor/Hour (run), Cost/Unit (labor or service); Burden Costs (Estimated):
Burden/Hour (setup), Percent of Total Labor (setup), Fixed Burden, Burden/
Hour (run), Percent of Total Labor (run), Burden/Unit (run); Burden Costs
(Actual): same six; Account Set ID), **Other** (User 0-23 with ! links),
**Browse** (ID, Description, Type, Inactive). Menus: View > Where Used...,
Tools > Reset Operation Costs.... Dialogs: Resource Where Used
(`ResourceWhereUsed.txt`), Reset Operation Costs (`ResetOperationCosts.txt`).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | ID in the first tab (no header bar), fields at Jobshop's places, frames | grid of fields, ID header | `idAt`/`at`/`split`/`frames` from the layout | M | done |
| 2 | missing | Inactive check box | Active (Tryton) | `production.work.center.inactive` (function on `active`, setter, searcher) | S | done |
| 3 | missing | Record Created by / Last Modified by | - | `create_uid` / `write_uid` read only | S | done |
| 4 | different | "Type", "Min segment size" + hours, "Shift 1/2/3" | Resource Type, Min Segment Size, Shift 1 Capacity... | labels | S | done |
| 5 | extra | - | Auto Report | not on 6.1.2's window: dropped from the screen (field kept) | S | done |
| 6 | extra | - | Category, Warehouse, Tryton cost rate / per | Tryton's own: kept below Jobshop's layout | - | done (kept) |
| 7 | different | Costs labels and order (setup, run, unit; burden rows) | own labels | Jobshop's labels, order, frames | S | done |
| 8 | extra | - | Weekly Calendar / Calendar Exceptions tabs | Jobshop has them as Scheduling > Tools dialogs (planning area has them): tabs dropped | S | done |
| 9 | missing | Other tab (User 0-23) | - | unused at N-Line | - | left: unused |
| 10 | missing | Account Set ID | - | QuickBooks emulation | - | left: by rule |
| 11 | different | Browse: ID, Description, Type, Inactive | ID, Description, Resource Type | columns | S | done |
| 12 | different | menu "Where Used...", "Reset Operation Costs..." | Where Used, Reset Operation Info | labels | S | done |
| 13 | different | Where Used: Resource ID lookup + description, Include Document Type frame (Engineering Master, Work Order, Quote Master), 23 columns (Preserved ... Description) | Type, ID, Part, Seq, Operation, Status | `whereUsed()`, `sf_resource_where_used` + `_operation_columns` | M | done |
| 14 | missing | Reset: Information to Reset (Description, Costs, User Fields), Locked Engineering Masters, Operation Templates, All status, According to Operation Template ID | - | dialog + `sf_reset_operation_costs` (`costs`, `description`, `templates`, `template`, status `all`) | M | done (User Fields shown disabled: unused; "locked" masters: no lock in the ERP, all masters reset) |

## 5. Shop Groups (`ShopGroup.txt`)

Jobshop: tab Shop Groups: Shop Group ID, Description, grid Seq No, <Resource
ID>, Description, Type; Browse: ID, Description, Type.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | grid on the first tab | separate Members tab | `linesOnFirstTab()` | S | done |
| 2 | extra | - | Group Exclusivity | it is the resources' (Shop Resources): dropped from the window | S | done |
| 3 | different | Seq No, Type; Browse Type = resource type | Seq #, Resource Type; Browse Type = exclusivity | labels, browse | S | done |
| 4 | different | ID in the tab | header | `idAt`, `idField: 'name'` | S | done |

## 6. Shop Views (`ShopView.txt`)

Same shape as Shop Groups (Shop View ID, Description, grid Seq No, Resource
ID, Description, Type; Browse ID, Description). Gaps 1, 3, 4 as above:
done. Unused at N-Line (0 views).

## 7. Labor Entry (`LaborEntry.txt`)

Jobshop tab **Labor Entry**: Employee Clock No (lookup) + name; Shift No,
Shift Type, Pay Rate (Base $ / Setup $ / Run $); Work/Lot/Split (lookup) /
Lot / Split, Sub/Seq (lookup) / Seq, Edit; Type, Resource ID (lookup);
Clock In, Hours Worked; Clock Out, Labor Allocation %; Completed Qty,
Completed, Operation Qty; Deviated Qty, Completed Qty; Reason Code +
reason; Description (multi-line); &New Entry, &Save; grid (delete) Entry
No, Transaction Date, Employee Clock No, Employee Name, Shift, Shift Type,
Pay Rate, Work Order, Sub ID, Seq No, Resource ID, Type, Completed, Clock
In, Clock Out, Hours, Labor Allocation %, Cumulative, Completed Qty,
Deviated Qty, Description, Reason Code. Tab **Labor Edit/Reverse**: All /
... radio, Key (lookup) / Lot / Split, Transaction Date / To, Show, Edit,
Reverse; grid Transaction Date ... Reason Code ID. Messages: "Labor ticket
has already been reversed! Labor tickets can only be reversed once.",
"Delete Unsaved Transaction(s)?".

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | Pay Rate | - | `nline.js.labor_ticket.pay_rate` (base/setup/run; empty = the type's rate), costing uses it; list shows the employee's rates | M | done |
| 2 | missing | Resource ID on the ticket | from the operation only | resource lookup (default the operation's) | S | done |
| 3 | missing | the employee's name beside the clock no; reason beside the code | - | read-only descriptions | S | done |
| 4 | different | "Type"; layout rows as Jobshop | "Transaction Type"; a grid | `UI.placedForm` with LaborEntry's boxes | M | done |
| 5 | missing | Edit button by Sub/Seq | - | opens the work order | S | done |
| 6 | missing | New Entry, Save buttons | ribbon Save | buttons | S | done |
| 7 | different | Description multi-line | one line | textarea | S | done |
| 8 | missing | grid Pay Rate, Resource ID | - | columns | S | done |
| 9 | extra | - | Operations of the work order table, Labor/Burden cost columns | kept (the earlier screen's quick view, the costs posted) | - | done (kept) |
| 10 | different | tab "Labor Edit/Reverse" with Edit | "Labor Reversal" | renamed; Edit = reverse the ticket and bring its values back to Labor Entry to post corrected (a saved ticket's cost is in the work order) | M | done |
| 11 | missing | reversal grid Shift, Shift Type | - | columns | S | done |
| 12 | missing | Lot / Split | - | no lots/splits | - | left |

## 8. Labor Data Collection (`LaborEntryBC.txt`, `LaborEntryDetails.txt`)

Jobshop: radio (All / Employee / ...), Key (lookup), Clock In Date / To,
Calculate Hours Worked for Running Tickets, Show; grid (delete) Entry No,
Suspended, Post on Save, Employee Clock No, Employee Name, Shift, Shift
Type, Work Order, Sub ID, Seq No, Resource ID, Type, Clock In, Clock Out,
Hours Worked, Labor Allocation %, Completed Qty, Deviated Qty, Completed,
Description, Reason Code ID, Total Est Hours, Total Hours Worked; Start,
Edit, Suspend, Resume, Post, Save, Close. Labor Entry Details: Employee
Clock No + name, Shift No/Type, Work/Lot/Split, Sub/Seq, Edit, Resource ID,
Type, Completed, Clock In/Out, Hours Worked, Completed/Deviated Qty, Reason
Code, Labor Allocation, Operation Qty, Completed Qty, Description; WO
Drawing/Spec, Leg Drawing/Spec, Seq Drawing/Spec buttons.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | grid columns (23) in Jobshop's order | 14 own columns | columns; RPC `est_hours`, `total_hours`, `pay_rate`, `instructions` | S | done |
| 2 | missing | Clock In Date / To, Calculate Hours Worked for Running Tickets, Show | Date radio only | added (running hours = clock in to now) | S | done |
| 3 | missing | Close button | Done in the employee box | Close (and %CLOSE) | S | done |
| 4 | different | Labor Entry Details: clock no + name, Seq Spec... | Start dialog without them | added; WO/Leg Spec and Drawing buttons: engineering area's drawings / specs | S | done (drawings left: engineering) |
| 5 | extra | - | Delete, Clear buttons | Del key and %CLEAR command of Jobshop as buttons: kept | - | done (kept) |
| 6 | missing | Data Collection Wizard, Simple, Resource Center, N-Line's **ArmNaut Labor Collection Wizard** | - | Jobshop's alternative terminal modes (Preferences); N-Line's ArmNaut wizard is one page: Clock No, Work/Lot/Split, Shift No/Type, Sub/Seq, Completed Qty, Operation Qty, Operation Type, Deviated Qty, Completed?, Reason Code, Clock In/Out, Hours, Description, Start Ticket / Stop Ticket. Labor is unused at N-Line since 2023 (30 tickets): not built | L | left: unused (the terminal does the same) |

## 9. Employees (`Employee.txt`, `EmployeeDetail.txt`, `EmployeeDetailSubTabs.txt`)

Jobshop 6.1.2: **Employees** list (read-only grid Clock No, Name, Title,
Phone, Shift No, Inactive; Tools > Add Employee..., Edit Employee...; File >
Employee Clock In/Out...), and the **Employees** window of one employee:
tab Employee (Clock No. lookup, Shift No list, Inactive, Created by, Last
Modified by, Name, Title, Address (2 lines), City, State/Postal, Country,
Etc., Hire Date, Termination Date, Phone, Mobile, E-mail, Picture; frames
Labor Costs: Base / Setup / Run Cost Per Hr, Cost Per Unit; Burden Costs:
Burden/Hour (setup), Percent, Burden/Hour (run), Percent, Burden/Unit
(run)), tab Calendars (Employee Calendar grid Day of Week, 1st Shift Start,
Shift 1-3 Dur, Add / Delete Calendar; Employee Calendar Exceptions grid
Start/End Date, 1st Shift Start, Shift 1-3 Dur, Reason Code, Description),
tab Attendance History (Show Tickets, grid Appr'd ... Has Notes; popup
Approve Ticket, Edit Ticket..., View Notes...), tab Notes (Add Note), Browse
(Inactive, Clock No, Name, Shift No, Title, Phone).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | a read-only list + the employee window | an editable table (from the older help) + Details | list (`jsEmployees`), double-click / Edit Employee... / Add Employee... open `employees/<id>` (`employees/0` new) | M | done (`sf_employees_save` kept for the API) |
| 2 | missing | Name, Address 1/2, City, State, Postal, Country, Etc., Phone, Mobile, E-mail | Person (party) only | `company.employee` function fields `employee_name`, `addr_1`, `addr_2`, `city`, `state`, `postal_code`, `country`, `addr_etc`, `phone`, `mobile`, `email` read/written on the party (first address, contact mechanisms); a new employee makes its party (`create`) | M | done |
| 3 | missing | Created by / Last Modified by | - | read only, "user  date time", no "..." (fix pass 28 Oct) | S | done |
| 4 | different | Jobshop's layout, ID in the tab, frames | grid | `idAt`, `at`, `frames` | M | done |
| 5 | missing | Calendars tab | - | own render tab `employeeCalendars()`: Employee Calendar (always the 7 days, Day of Week read-only, 1st Shift Start, Shift 1-3 Dur; Add Calendar = the shop's calendar or 8 h Mon-Fri, Delete Calendar) beside Employee Calendar Exceptions (Start/End Date, 1st Shift Start, Shift 1-3 Dur, Reason Code with "...", Description; Add / Delete Exception); written by the window's Save (`afterSave`) | M | done (fix pass 28 Oct: the day grid was empty, grids stacked) |
| 6 | missing | Attendance History tab | - | `attendanceGrid()` + `sf_attendance` | M | done |
| 7 | different | Picture on the Employee tab | Picture tab | `pictureOnFirstTab()`: the Picture tab's pane moved into the Employee tab at 595,119-724,221 with its caption; tools on the right-click | S | done |
| 8 | extra | - | Department, Supervisor, Person | off the window (not in Jobshop's; the person is made by the server; the data stays) | - | done |
| 9 | different | Shift No a list | integer | drop-down 1 / 2 / 3 (`beforeSave` makes it the integer); labels Address 2 blank, State/Postal, Percent as Jobshop | S | done |

## 10. Time and Attendance (`TimeAndAttendance.txt`, `EmployeeClockInOut.txt`, `EmployeeWhoIsInOut.txt`) — new

Jobshop: Show Tickets (Last 30/60/90/120/180 Days, Not Approved, All), Get
Reported Labor Hours Worked for Attendance Tickets; grid Appr'd,
Transaction Date, Employee Clock No, Name, Title, Shift No, Shift Start,
Start Grace, Clock In, Started Late Reason Code, Shift End, End Grace, Clock
Out, Left Early/Late Reason Code, Hours Worked, Labor Hrs Worked, Approved
By, Approved On, Exported, Exported Date, Has Notes. Popup: Filter...,
Approve Ticket(s), Edit Ticket..., View Notes..., View > Labor Txs. Tools:
Who is In/Out... (Status, Absence Code, Clock No, Name, Shift No, Shift
Start, Shift Start Grace, Clock In, Clock Out). File > Employee Clock
In/Out... (Emp Clock No + name, Shift No, Clock In + Early/Late Reason Code,
Clock Out + reason, Approved, Approved By, Approved On, Hours Worked,
Exported, Exported Date, Notes).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | the window | clock in/out on the terminal only | route `time-attendance`, `Screens.jsTimeAttendance`; RPCs `sf_attendance`, `sf_attendance_save`, `sf_attendance_approve`, `sf_who_is_in` | M | done (menu item: integrator) |
| 2 | missing | Approved On, Exported, Exported Date, Transaction Date | - | `nline.js.employee_time.approved_date`, `exported`, `exported_date`, `transaction_date` (the clock out's date), `approve()` | S | done |
| 3 | missing | Shift Start / End | - | from the employee's or the shop's weekly calendar | S | done |
| 4 | missing | Start / End Grace | - | Jobshop's settings (none at N-Line): empty | - | left: unused |
| 5 | missing | Filter popup items | - | the grid is small (unused at N-Line) | S | left |

## 11. Calendars (`WeeklyCalendar.txt`, `CalendarException.txt`)

Jobshop opens them from the Scheduling window (Tools > Weekly Calendars...,
Calendar Exceptions...): the planning area's dialogs (planning.js
`weeklyCalendar`, `calendarExceptions`) on this area's models
(`nline.js.calendar.week` / `.change`). Resource tabs dropped here (gap 4.8);
employee calendars on the Employees window (9.5).

## 12. Shopfloor Work Orders (`ShopfloorWorkOrders.txt`)

A read-only list (Work ID, Lot, Split, Order Status, Desired Qty, Received
Qty, Release Date, Want Date): the Work Order window's list / Browse —
engineering area. Not built here.

## 13. N-Line's AntaDashboard (`AntaDashboard.txt`)

An N-Line customisation (not in the group bar): grid Sales ID, Work ID,
Notes (editable), Part ID, Customer, Dept. (commodity code), WANTED (want
date), FINISH (line ship date), Original Quantity, Balance Quantity, KIT
STG, KIT in PROD, Build Completion %, Cost Per (unit price), Total. A
production dashboard of open sales-order work orders: belongs to planning /
sales (an "open orders by work order" report); noted, not built.

---

## Gap count

Found 79 (the rows above); closed 60; left 19 (lots/splits 4, unused at
N-Line 7, by rule 1, shared / other areas 5, small 2).

## For the integrator

- Module update `nline_js_shopfloor` (new fields): `production.work.center.inactive` (function), `company.employee` function fields `employee_name`, `addr_1`, `addr_2`, `city`, `state`, `postal_code`, `country`, `addr_etc`, `phone`, `mobile`, `email` and One2Many `calendar_weeks`, `calendar_changes`; `nline.js.employee_time` `approved_date`, `exported`, `exported_date` (columns) and `transaction_date` (function); `nline.js.labor_ticket.pay_rate` (column).
- New RPCs: `sf_attendance`, `sf_who_is_in` (read), `sf_attendance_save`, `sf_attendance_approve` (write).
- Menus (nline_jobshop): **Material Issue Barcoding** `#/issues-bc` (after Material Issues; group stock/production as Material Issues) and **Time and Attendance** `#/time-attendance` (after Employees; `company.group_employee_admin`, read for production), File > Employee Clock In/Out... is in both windows.
- frame.js: a `time` field type (1st Shift Start of the calendars); the Picture placed on a tab (`{picture: true, at}`) would let the Employee tab show it where Jobshop does.
- Planning: the Weekly Calendars / Calendar Exceptions dialogs are now the only place to edit resource calendars (Jobshop's way).

## Test results

- `test.ps1 nline_js_shopfloor`: 25 tests OK (scenario extended: pay rate,
  employee person fields and calendars, a new employee making its party,
  Time and Attendance save / approve / export / Who is In/Out, Inactive of
  a resource, Where Used columns, Reset Operation Costs of the description
  only). `jscheck.py shopfloor.js`: OK.
- Battery (`run_battery.py`, port 9346, the new JS against the server
  WITHOUT this pass's Python: the module update is the integrator's):
  - issues, issues-bc, shop-groups, shop-views, labor-collection: no error.
  - labor, wo-receipts: only the screens' own validation toasts ("Choose the
    employee first", "Check Transact Now on the lines first") when Save is
    clicked on an empty screen (Jobshop shows the same kind of message);
    "missing" lookups / rows = the battery's index on a screen that draws
    after its rights load and an empty grid: not failures.
  - resources: Browse "'inactive'" error and employees/5, time-attendance
    errors ("'employee_name'", "'addr_1'", unknown `sf_attendance` /
    `sf_who_is_in`): the new fields / RPCs of this pass, not on the local
    server yet. Resources Save & New on an empty window: the "Name required"
    message (as Jobshop's).
  - To re-run after the module update: `set BAT_PORT=9346` then
    `run_battery.py issues issues-bc wo-receipts resources shop-groups
    shop-views labor labor-collection employees employees/5
    time-attendance`.
