# Jobshop analysis: Accounting, Executive Information, Administration, Reports (admin)

Sources: `C:\NLINE_ERP_dev\jobshop_analysis\layouts\` (cited below),
`jobshop_menus.txt` / `vjs_menus_raw.txt` (PopupAuthority, PopupPermission),
`userguide.txt` ch. 3 (users, authorities), ch. 44 (Account Interface), the
Jobshop database (read-only: `LSA_SETTINGS`, `LSA_ROLE*`, `*_OBJECT_GLOBAL`,
`SHARED_COMPANY`, `*_NEXT_*_ID`) and `C:\Infor Global Solutions\VISUAL
Jobshop\Reports\*.rpt` (the reports N-Line's installation has). ERP side:
the code (`modules/nline_js_admin`, `web/js/jobshop/admin.js`); the
`erp_screens.txt` dump was not available when this was written.

Status column: `done`, `left: reason`, `shared: needs <file>`.

## What N-Line's data says

- Roles: ADMIN (16 users), OFFICE (1), PUBLIC (1), WHSE (3); PURCH, SALES,
  SHOP have no users. `LSA_ROLE_AUTH` (data authority, PopupAuthority) is
  FLAGS 255 (full) on `*.*.*` for every role: **data authorities unused at
  N-Line**.
- `LSA_SETTINGS` holds the Authority Manager's menu permissions as
  `<ROLE>_<item>` = 0 Allowed / 1 Denied / 2 Read Only (329 items: group
  bars, windows, `...Reports`, every report `<Rpt>_Report`, functions
  `CanDelete`, `AddNotes`, `EditNotes`, `ReopenStatus`, `CanSeeUnitPrice`,
  `ImportFromFile`, `OrderDate`...). Used: OFFICE is denied Common,
  Estimating, Inventory, Planning, Shared Reports; WHSE has read-only
  windows.
- `LSA_SETTINGS` also has the System Settings switches (allow negative =
  True, update part cost from receiver = Prompt, color code late WO = True,
  don't auto-mark shipper lines = True, remove inactive logins = True; the
  rest False). Shift grace 10/10 min (`SHOPFLOOR_OBJECT_GLOBAL`).
- Company: name, address, phone, fax, web URL only; **Contact block and Ship
  To unused**. No user alerts (`SHARED_USER_ALERT` 0 rows), no calendar
  breaks (0 rows), no part auto numbering.
- Numbering used: quotes (prefix 2026, 4 digits), quote masters (prefix 22,
  5 digits), RFQ (5 digits), journal batch (next 549, 5 digits).
- User defined field labels: parts (5), suppliers (7), customers (1) - the
  inventory / purchasing / sales areas own them; shop resources none.

## Accounts (`VAccounting\Account.txt`)

Jobshop: one tab, a grid (ID, Description, Type list, Inactive check), add /
delete rows. ERP: the desk chart of accounts (QuickBooks emulation, not
rebuilt, as the brief says).

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | editable grid | desk Accounts screen | - | L | left: accounting stays the QuickBooks emulation |

## Account Sets (`VAccounting\AccountSet.txt`)

Jobshop: tab Account Sets: Account Set ID (lookup) 12,5; Description 12,27;
frames Purchasing (Purchase Expense, Purchase Accrual, Payables), Sales
(Sales Revenue, Receivables), Labor and Burden (Applied Factory Lab, Applied
Factory Bur, Indirect Factory Lab), Inventory (Inventory Adjustment;
Material, Labor | Burden, Service), WIP (Material, Labor | Burden, Service),
Cost Of Goods Sold (same); every account has the lookup. Browse: ID,
Description.

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | one tab, 6 frames | 6 tabs + Notes | admin.js `jsAccountSets`: one placed tab, `frames`, `at`/`split` from the layout | S | done |
| 2 | different | captions "Material", "Applied Factory Lab"... | "Inventory Material G/L Account ID" | Jobshop's captions (+ `*` on the five Tryton posts to) | S | done |
| 3 | different | ID is the first field | header bar + duplicate field | `idAt`, `idSplit`, `idField`, `idLength` | S | done |
| 4 | extra | Browse ID, Description | + Sales Revenue, Purchase Expense | Jobshop's two columns | S | done |
| 5 | extra | - | Account Set List button | kept (Jobshop prints it from the window's Print) | - | done |

## Accounting Calendar (`VAccounting\AccountingCalendar.txt`, `Vmfg\AccountPeriods.txt`)

Jobshop: tab General: frame Automatic Accounting Period Generation (Monthly /
Quarterly radio, Fiscal Year, End Date, Auto Gen Periods), frame Accounting
Periods: grid Fiscal Year, Period (RO), End Date, Posted (check, RO). Error
"There must always be at least 2 open accounting periods."

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | generation frame on the window | "New Fiscal Year" modal | `jsAccountingCalendar`: the frame on top (radio, Fiscal Year, End Date, Auto Gen Periods) | S | done |
| 2 | different | one grid of all years: Fiscal Year, Period, End Date, Posted | one year at a time (select) | all periods, Jobshop's 4 columns first; Name, Status, Unposted Moves, Close / Reopen / Lock kept after | M | done |
| 3 | missing | End Date editable in the grid, add/delete rows | Tryton periods made by Renew Fiscal Year | - | M | left: Tryton's periods are made per fiscal year; editing dates of posted periods is not safe |
| 4 | missing | "at least 2 open periods" check | - | - | S | left: Tryton allows closing; the accountant closes (decision kept) |

## Account Interface (`VAccounting\Interface.txt`, user guide ch. 44)

Jobshop: tab Account Periods: frame Transactions (radio Post to Period End
Date of [previous] / [current]), Post; grid Fiscal Year, Period, Last Day,
Posted. Tab Export: Accounting Package (RO list), frame Period End Posting
Dates (From, To, Re-Export All in Date Range), frame Options: Posted Inventory
Transactions (GL) + Export To; For Batch ID + batch lookup + its posting date;
Rolled-up / Individual radio; Invoices (AR), Receivers (AP), Customer
Information (+ Substitute Customer Name for Customer ID), Supplier
Information (+ Substitute Supplier Name...), Labor Tickets (QB only),
Attendance Tickets (CSV, Select Export Columns), each with Export To; Export.

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | 2 tabs | one page | `jsAccountInterface` + `tabbed()` helper | S | done |
| 2 | missing | periods grid on Account Periods | - | grid Fiscal Year, Period, Last Day, Posted | S | done |
| 3 | missing | Export To file name per option | fixed names | text box per option names the downloaded file | S | done |
| 4 | missing | Substitute Customer / Supplier Name for ID | - | check boxes; `jsadmin_interface_export` `name_as_id` | S | done |
| 5 | missing | batch posting date beside the batch | number + description | the posting date beside | S | done |
| 6 | different | Accounting Package list (QuickBooks, Peachtree...) | - | read-only "CSV files" | S | done |
| 7 | missing | Labor Tickets / Attendance Tickets export | - | - | M | left: QuickBooks-integrated only in Jobshop (disabled at N-Line); attendance belongs to shopfloor |
| 8 | extra | - | Transactions Not Posted, Journal Batches | kept (Account Periods / Export tabs) | - | done |

## Executive Information (`VExecutive\*.txt`)

Jobshop: each window is a list of lines "Total Value of [status list]
<documents> from [date] to [date] [value ...]" (the "..." lists them):
Sales: Quotes (+ Use Proforma), Sales Orders, Backlogged SO, Late SO, SO on
Hold. Purchasing: Purchase Orders, Late POs, UnCommitted Materials on open
POs. Production: Projected Value of WOs, Overage Amount of WOs, Late WOs, WOs
on Hold. Financials: Invoiced Shippers from/to, Current Inventory value, WIP.

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | the lines with status / dates / value | tiles and charts | new RPC `jsadmin_exec_values` (executive_values.py), `execLines()` in admin.js on top; choices kept per browser | M | done |
| 2 | missing | "..." drill-down | - | opens the report listing the documents | S | done |
| 3 | extra | - | tiles, charts, late WO table | kept under the lines | - | done |
| 4 | different | title "Executive Sales Information" | "Executive Information - Sales" | Jobshop's titles | S | done |
| 5 | different | "on hold" | - | sales on hold = `sale.on_hold` / customer `credit_hold`, WO `on_hold` when another area adds them (else 0) | S | done (0 until those fields exist) |

## User Manager (`Vmfg\EditUser.txt`, `EditGroup.txt`, `chgPassword.txt`)

Jobshop: User Properties: User ID, Full Name, Password, Confirm Password, Role
Name (one role); Role Properties: Role Name, Users frame (grid User ID,
Name; Add, Remove), OK / Cancel. Change Password dialog.

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | Role Properties users grid + Add / Remove | check-box list | grid, Add (choose a user), Remove (selected row) | S | done |
| 2 | different | caption "Role Name" | "Role" / "Roles" | Jobshop's caption | S | done |
| 3 | missing | Password / Confirm / Change Password | - | - | - | left: on purpose (N-Line BI signs in; no password stored) |
| 4 | different | one role per user | several Tryton groups | - | - | left: decision (role = Tryton group) |

## Authority Manager (`Vmfg\Authorities.txt`, menus PopupPermission / PopupAuthority)

Jobshop: role list + tree of the group bars / windows / functions / reports
with an icon each; PopupPermission (right-click): Access Allowed, Access
Denied, Access Read Only; PopupAuthority (data authority): Set to FULL /
SELECT / INSERT / UPDATE / DELETE authority, Remove all authority.

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | right-click Access Allowed / Denied | click only | `UI.contextMenu` with the current one ticked | S | done |
| 2 | missing | Access Read Only | - | - | L | left: Tryton has no read-only per menu (model access is per group, not per window); not offered |
| 3 | missing | PopupAuthority (data authorities) | - | - | L | left: unused at N-Line (all roles FLAGS 255) |
| 4 | missing | function authorities (CanDelete, AddNotes, CanSeeUnitPrice...) and per-report authorities | reports by model read access | - | L | left: would need a permission model read by every area's screens |

## System Settings (`Vmfg\Settings.txt`, `CompanyInfo.txt`, `DefaultAccountSets.txt`, `Preferences.txt`)

Jobshop tabs: Address, Logo, Accounting, Estimating, Inventory, Purchasing,
Sales, Shopfloor, Labor and Attendance, User Alerts, General, Individual
Privacy.

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | missing | Labor and Attendance tab (6 labor checks, grace minutes, reason codes required, adjust radio) | 2 checks on Shopfloor | new config fields `js_labor_closed_wo`, `js_warn_labor_estimate`, `js_single_clock_in`, `js_close_op_run_complete`, `js_shift_start_grace`, `js_shift_end_grace`, `js_ta_reason_required`, `js_adjust_to_shift`; tab added | M | done |
| 2 | missing | General tab options (inactive items, WO colour coding x2, shipper lines, create WO, sync user fields) | - | `js_no_inactive_items`, `js_color_late_want`, `js_color_late_release`, `js_no_auto_mark_shipper`, `js_no_auto_create_wo`, `js_sync_udefs` | S | done |
| 3 | missing | Inventory: log cost changes, log adjustments, inactive part notes, log planning changes | - | `js_log_cost_changes`, `js_log_adjustments`, `js_inactive_part_notes`, `js_log_planning_changes` | S | done |
| 4 | missing | Sales: Number of Days Early Order Lines Can Ship | - | `js_ship_early_days` | S | done |
| 5 | missing | the values of N-Line's Jobshop | - | migration `settings(m)` copies LSA_SETTINGS + grace minutes | S | done |
| 6 | missing | Address: Contact block, Ship To frame | - | - | M | left: unused at N-Line |
| 7 | missing | Logo tab | - | - | M | left: Tryton company has no report logo in the desk; reports print the company name |
| 8 | missing | User Alerts tab | - | - | M | left: unused at N-Line (0 alerts) |
| 9 | missing | Individual Privacy (GDPR redaction) | - | - | L | left: not applicable (US company) |
| 10 | missing | Quote Master numbering, RFQ numbering, Part auto numbering | - | - | M | left: quote masters / RFQs are the engineering / purchasing areas' sequences; part auto numbering unused |
| 11 | missing | Browse ... Created On or After dates (4 tabs) | - | - | S | left: the frame's Browse has its own filters |
| 12 | missing | user-defined field grids (parts, suppliers, customers, resources) | - | - | M | shared: the inventory / purchasing / sales areas own their labels |
| 13 | missing | Shopfloor calendar / exceptions grids | - | - | M | shared: shopfloor area (calendar week / change models) |
| 14 | different | settings frames placed as Jobshop | grid per tab | - | M | left: data-driven tabs; frames not placed yet |
| 15 | n/a | Preferences (per user: auto browse, card colours, print prompts) | - | - | - | left: browser / frame behaviour, not settings |

## Reports (every group's Reports item; `layouts\VReports\*.txt`)

Report window (Jobshop): selection dialog per report, Preview / Print /
Export, Page Range dialog (`Vmfg\PageRange.txt`: All / Page Range From To),
Advanced filter / sort dialog (`VReports\AdvSortSelect.txt`), Add / Edit /
Remove Custom Report (`VReports\AddReport.txt`).

| # | Gap | Jobshop | ERP now | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | each range in a frame captioned with the field, From over To | label / From / To rows | `reportDialog`: frames, Sort By line | S | done |
| 2 | different | captions and order of the selections per report | ERP's own | `report_dialogs.py` DIALOGS: Jobshop's order and captions for all 98, extras kept after | M | done |
| 3 | missing | "For" radio groups (Active / Inactive / Both; Stocked / Non-Stocked / Both; Approved) | - | engine filter type `radio` (`f_radio`, `f_active`), rows carry `_active` / `_stocked`; parts, parties, employees, reason codes | M | done |
| 4 | missing | ranges Jobshop has (Product / Commodity Code, Sales Order, PO, Location, Work/Lot/Split, Sales Rep, Territory, SIC...) | - | added to the dialogs; rows carry the keys where Tryton has them; a range on a value the rows do not carry is not applied and says so under the report | M | done |
| 5 | missing | Journal Batch Detail "Print in Expanded Format" | - | unchecked = rolled up per batch and account | S | done |
| 6 | missing | Backlog "Desired Ship Date On or Before" | - | done in `backlog` | S | done |
| 7 | missing | Physical Count "Hide Quantity on Hand" | - | blind count | S | done |
| 8 | missing | 9 reports of N-Line's installed Jobshop not in the help: Customer Delivery Performance, Sales Rep Commission, PO Line Backlog, Inventory Aging, Part Label, Warehouse Location Label, Engineering Master BOM, Work Order Status, Employee Attendance History | - | `report_extra.py` | M | done |
| 9 | missing | Order Point, Date Tracked Inventory, RFQ Line Detail, Request For Quote Form, Quote Master BOM, Individual Privacy | - | - | M | left: no order points / date tracking / RFQ data in Tryton yet (purchasing area), quote master BOM like Engineering Master BOM later |
| 10 | different | Payment Terms List .rpt | TermsList.rpt | TermsRuleList.rpt (installed name) | S | done |
| 11 | missing | Print Bar Codes, Print Copies (Sales Order Ack), Traveler's 8 print options, Inventory Value Settings checks / Expanded | - | - | M | left: print options of the Crystal forms; the form reports of the areas print their documents |
| 12 | missing | Page Range dialog | - | - | S | left: the browser's print dialog has the page range |
| 13 | missing | Custom reports (Add / Edit / Remove) | - | - | L | left: Crystal reports, not emulated |
| 14 | extra | - | Sort By on every report, Subtotals | kept | - | done |

## For the integrator

- Update module `nline_js_admin` (new fields on `nline.desk.configuration`:
  the 19 `js_*` settings above; new RPC `jsadmin_exec_values`; 9 reports).
- Data: re-run step `js_admin` (now also copies the System Settings from
  `LSA_SETTINGS`).
- frame.js `placedForm`: a `radio` field type (Jobshop's type3) would let the
  report dialogs and System Settings be placed exactly from the layouts.

## Test results

- `nline_js_admin` unittest (in-memory SQLite, module mirrored by hand: the
  `test.ps1 -ExecutionPolicy Bypass` call was refused here): 25 tests OK.
  The scenario now also covers `jsadmin_exec_values` (4 windows), the 107
  reports, the radio filters, a selection not applied (gap), Expanded
  Format, TermsRuleList.rpt, PO Line Backlog, Work Order Status,
  Engineering Master BOM. `jscheck.py admin.js`: OK.
- Click battery (`run_battery.py`, port 9561; local server still runs the
  old Python, so only the JS is new there): account-sets,
  accounting-calendar, account-interface, exec/*, users, authorities,
  system-settings, js-reports/accounting.
  - Fixed: `STATE is not defined` (Accounting Calendar, Account Interface:
    lost when the screens were rewritten); Authority Manager by role offered
    Deny where the server refuses it ("This is the only role of the screen")
    or where the role allows through a folder: now shown, not clickable.
  - Expected until the module is updated: exec/* log a 403 for
    `jsadmin_exec_values` (the lines then stay hidden, the dashboard shows).
  - Account Sets renders with Jobshop's frames (shotsccount-sets).
- Report loop (own script on the harness's Cdp: every report of the 9 group
  bars, open its dialog, Print Preview): 96 of 98 OK on the old server;
  Employee List / Employee Label failed ("company.employee has no attribute
  active" on nline_test): fixed (`attr(employee, 'active')`), to recheck
  after the module update. The 9 new reports and the new dialog filters are
  only on the new Python (tests above), not yet on the local server.
- Note for the integrator: two battery runs on ports 9347/9348 collided with
  other agents' Chrome (pages navigated under them); 9561/9562 were clean.
