# Jobshop emulation: Accounting, Executive Information, Administration, Reports (nline_js_admin)

Module `modules/nline_js_admin`, screens `modules/nline_desk/web/js/jobshop/admin.js`,
data `migration/jobshop/admin.py` (step `js_admin`). Tests:
`tests/scenario_nline_js_admin.rst` (every RPC; the 98 reports all run; filters,
advanced filters and sorts, groups/subtotals, gaps) — `test.ps1 nline_js_admin`:
25 tests OK. Also run once (scratch script, not in the repo) with all eight
`nline_js_*` modules installed together: the 98 reports, the 4 dashboards and
the admin RPCs run without error.

## What is built

| Route | Screen | Server |
|---|---|---|
| `account-sets`, `account-sets/<id>` | `Screens.jsAccountSets` (UI.master on `product.category` with accounting) | `jsadmin_account_set_fields` |
| `accounting-calendar` | `Screens.jsAccountingCalendar` | `jsadmin_calendar`, `jsadmin_calendar_action`, `jsadmin_fiscalyear_create` |
| `account-interface` | `Screens.jsAccountInterface` | `jsadmin_interface`, `jsadmin_interface_post`, `jsadmin_interface_export` |
| `exec/sales|purchasing|production|financials` | `Screens.jsExec` (tiles + SVG charts) | `jsadmin_exec` |
| `users` | `Screens.jsUsers` (User Manager) | `jsadmin_users`, `jsadmin_user_save`, `jsadmin_role_save` |
| `authorities` | `Screens.jsAuthorities` (Authority Manager) | `jsadmin_authorities`, `jsadmin_authority_set` |
| `system-settings` | `Screens.jsSystemSettings` | `jsadmin_settings`, `jsadmin_settings_save` |
| `js-reports/<group>`, `js-reports/<group>/<report id>` | `Screens.jsReports` (Report Selection, dialog, printed report) | `jsadmin_report_list`, `jsadmin_report_run` |

Models / fields:
- `nline.js.journal_batch` (Batch ID, period, sub ledger = journal, posting /
  posted / exported dates, moves, debit, credit) — read for all, write for
  `account.group_account`; company rule. Sequence type "Journal Batch" and the
  sequence `sequence_journal_batch` (noupdate, changed in System Settings).
- `account.move.js_batch` (allowed on posted moves: `_check_modify_exclude`).
- `product.category`: `js_description` and the 16 Jobshop accounts Tryton has
  no place for (`js_inv_labor_account` ... `js_payable_account`).
- `nline.desk.configuration`: `js_accounting_interfaced`, `js_period_type`,
  `js_inventory_account_set`, `js_purchasing_account_set`,
  `js_sales_account_set`, `js_batch_sequence`, `js_update_cost`,
  `js_allow_negative`, `js_receiver_approved`, `js_prevent_run_labor`,
  `js_lock_clock_in`.

## Checklist

### Accounting

- [x] What are Accounting Functions? — Accounts (desk chart of accounts, as before), Account Sets, Accounting Calendar, Account Interface, Reports.
- [-] MYOB / Peachtree / Pastel Import Information — N-Line's books are Tryton itself; the export files are CSV.
- [~] QuickBooks Import Information / QuickBooks Automated Integration — the Account Interface exports CSV files (GL batches, invoices, receivers, customers, suppliers); there is no IIF / automated QuickBooks push (the books are Tryton now).
- [x] Accounts (`VAccountingAccount`, Accessing/Adding/Editing/Deleting Accounts) — the existing desk Accounts screen (not changed); Account List report.
- [x] Account Sets
  - [x] What are Account Sets? / `VAccountingAccountSet` — an account set is a product category with accounting. Its 21 Jobshop accounts in the window's order, on tabs Account Set / Inventory / WIP / Cost of Goods Sold / Purchasing / Sales / Labor. Inventory Material = `account_stock`, CGS Material = `account_stock_out`, Purchase Order Accrual = `account_stock_in`, Purchase Expense = `account_expense`, Sales Revenue = `account_revenue` (Tryton posts to these, marked *); the other 16 are stored (`js_*_account`) for the reports — decision: Tryton posts WIP to the WIP account of the accounting configuration (nline_wip), labor/burden are not split.
  - [x] Accessing / Adding / Editing / Deleting Account Sets — UI.master (ID lookup, First/Previous/Next/Last, Save, Clear, Copy, Delete per rights, Browse tab), extra "Account Set List" opens the report.
- [x] Accounting Calendar (`VAccountinginterface` Account Periods, `VReportsAccountingCalendar`) — fiscal years and their periods: Period, Name, Start, Last Day, Status, unposted moves; Close (with the open periods before it, as Jobshop), Reopen, Lock; Close / Reopen Fiscal Year; New Fiscal Year (end date, monthly / quarterly) made from the latest one with Tryton's Renew Fiscal Year (sequences renewed).
- [x] Account Interface
  - [x] What is the Account Interface? / `VAccountinginterface` / Accessing the Account Interface
  - [x] Posting Accounts — "Post to Previous / Current Period End Date of": posts the draft moves (stock, production, labor, invoices) of the open periods up to that date and gathers the posted moves without a batch into one journal batch per period and journal (Jobshop's sub ledger). The unposted / unbatched moves are listed by period / journal (open a move with a double-click).
  - [x] Exporting Account Information — From / To, Re-Export All in Date Range, For Batch ID, Rolled-up by Account ID or Individual Transaction Details; Posted Inventory Transactions (GL), Invoices (AR), Receivers (AP), Customer and Supplier Information → CSV files downloaded; the GL export marks the batches exported (not again unless Re-Export).
- [x] Accounting Reports (`Accounting_Reports.txt`) — Account List, Account Set List, Accounting Calendar, Journal Batch List, Journal Batch Detail List.

### Executive Information

- [x] Sales — bookings (month, year to date), backlog (open lines value), late order lines, shipments, invoiced, open quotes; charts: bookings vs shipments, invoiced, top customers.
- [x] Purchasing — open POs, open PO value, late PO lines, ordered, receipts; charts: ordered vs received, top suppliers; payables aging only for users who read the accounting.
- [x] Production — open / late work orders, WIP value (issued material + labor), completed, labor hours; charts: completed, hours, open by status, hours by resource; the late work orders table.
- [x] Financials — cash (bank accounts of the payment journals), AR, AR over 30 days, AP, revenue, net income YTD; charts: revenue vs expenses, cash, AR and AP aging.
- Last 6 / 12 / 24 months, Refresh (F5), Print. Plain SVG charts.

### Administration

- [x] User Manager (`vmfgUserManager`, `VmfgEditUser`, `VmfgEditGroup`, Setting_Up_Users, Adding_Users, Adding_Roles, Assigning_Users_to_Roles) — Users (User ID = login, Full Name, N-Line Role, Roles, PO Limit, Active) and Roles (Tryton groups with their users); User Properties (User ID, Full Name, Email, Active, N-Line Role, PO Limit, May Create / Change Work Orders, Roles); Role Properties (name, users, Add User with the role preset). Never a password: the users sign in through N-Line BI (a user made here has no password and can only sign in through BI).
  - [-] Changing Passwords Through the User Manager / Setting User Passwords — on purpose: N-Line BI signs people in; no password is set or stored.
- [x] Authority Manager (`VmfgUserAuthority`, Selecting_User_Authorities, Assigning_User_Authorities, Authority_Status_Icons, Starting_Jobshop_s_User_Authority_Manager) — By Role or User, Authority Tree View (by group bar folder) or flat, All Users matrix (screens × users, click a cell). A screen = a menu of nline_jobshop / nline_desk; allowed when the user is in a group of the menu, of each folder above it and of its action (as Tryton shows menus). By user: Allow gives the least used group of the menu, Deny takes the menu's groups away from the user. By role: Allow adds the group to the menu (and to its folders / action where they need groups), Deny removes it (never the menu's last group: that would open it to everyone). A menu with no group shows "Allow (everyone)". Functions of a user: PO Limit, May Create / Change Work Orders (nline_role's options).
  - [-] Effects of Authority Manager on the Labor Data Collection Module — the shopfloor area's.
- [x] System Settings (`VmfgSettings`, Entering_*_Settings) — tabs Address (company party: name, address, state, postal, country, phone, fax, web URL), Accounting (Accounting System Interfaced, Period Type, the desk's discount / undeposited accounts and deposit journal, Automatic Date Generation: Auto makes the fiscal year), Estimating (Quote / Sales Order numbering: Tryton numbers both alike), Inventory (default account set, Update Part Unit Material Cost Upon Purchase Receipt, Allow Non Lot Tracked Parts Negative, current / next period end, Journal Batch / Physical Inventory / Internal Transfer numbering), Purchasing (default account set, Receiver Approved Upon Receipt, invoice method, PO / Receiver / Supplier Return numbering), Sales (default account set, invoice and shipment methods, Shipper / Customer Return / Invoice / Credit Memo numbering of the current fiscal year), Shopfloor (Prevent Run Labor Entry, Lock Clock In/Out, Work Order and Job numbering). Each numbering: Next Sequential Number, Prefix, Suffix, No. of Decimal Places, Show Leading Zeros, Sample (live). Save (Ctrl+S) only for who may write.
  - [~] The Jobshop-only settings (update cost on receipt, negative issue, receiver approved, prevent run labor, lock clock in, default account sets, accounting interfaced) are stored on `nline.desk.configuration`; the areas that do those transactions must read them (not enforced here).
  - [-] General tab (program / layout / report / help paths), Logo, User Defined Field labels (the inventory area keeps `part_user_labels`) — not applicable in the web app / other areas.

### Reports (98 + the duplicate Currency Code List)

All the reports of `reports.json` are in the engine (report_*.py), with Jobshop's
names, group bars and .rpt: Inventory 13, Engineering 5, Estimating 6, Sales 19,
Purchasing 12, Planning 2, Shopfloor 27, Accounting 5, Common 9 (the help lists
Currency Code List twice: one report). The four truncated names of reports.json
are given in full: Engineering Master Material List, Location Content List,
Parts & Services by Supplier, Supplier Prices by Part List.

- [x] Jobshop_Report_List / each group's `*_Reports` topic — `js-reports/<group>` lists the group's reports the user may run (read access on the models the report reads; a group with none shows nothing).
- [x] Preparing_Reports — the dialog: ID ranges (From / To), date ranges (period choice + From / To), statuses, options, check boxes, As-of dates, Sort By (+ descending), Subtotals; Preview (F5 / double-click the report); Save Filters / Restore Defaults (kept per browser: Using_Saved_Report_Filters, Restoring_Default_Report_Settings).
- [x] Advanced_Filtering_and_Sorting_Reports / `VBrowseadvancedreportfilters` — on the reports Jobshop lists: filters (column, condition =, !=, <, <=, >, >=, contains, not contains, starts with, is empty, is not empty, value, And/Or) and sorts (columns, descending, Up / Down / Remove).
- [x] Printing / Previewing / Exporting Reports — the report page (company, title, the ranges as subtitle, printed date; group headers, subtotals, report total; the graph of the graphical reports; the gaps at the bottom), Print (landscape for the wide reports), Export (CSV); double-click a row opens its document. Employee Label prints three across (Avery 5160).
- [-] Creating_Your_Own_Reports / Customizing / Modifying_Existing_Reports / custom report folders (Crystal) — not emulated.

Data gaps (the reports show what exists; the gap is printed under the report):
- Inventory: one cost price per part in Tryton (no FIFO layers, no material / labor / burden / service split) — Inventory Value, Inventory Transaction List.
- Engineering / Estimating: burden rates and outside service prices are not on the masters (labor = work center cost per hour).
- Shopfloor: without nline_js_shopfloor the labor comes from Tryton's work cycles (no setup/run type, shift, quantities, burden); with it, from `nline.js.labor_ticket`. Resource capacity from the resource's weekly calendar (else 40 h). Cut List lists the piece-tracked parts' unissued materials with the card's dimensions.
- Sales Gross Margin / throughput: cost of a shipped part = its cost price (not split).
- Quotes: from `nline.quote` when nline_js_engineering is installed, else the Tryton sales not confirmed; quote masters = BOMs of master type 'quote'.

The fields and models of the other areas used when installed (by name, so a
rename there must be mirrored here): `nline.quote`, `production.bom.master_type /
desired_quantity / part / routing`, `nline.engineering.operation_template`,
`nline.js.labor_ticket`, `company.employee.clock_no / shift_no`,
`production.work.center.description / resource_type / shift_1_capacity /
calendar_weeks`, `nline.js.shop_view`, `nline.js.calendar.week / .change`,
`nline.js.schedule.operation` (Resource Schedule = last scheduler run),
`nline.js.unit_conversion`, `nline.js.part_location.hold`,
`product.template.product_code / commodity_code / piece_tracked`,
`stock.move.reason_code`, `sale.sale.sales_rep / territory / ship_via /
js_carrier / fob_point / freight_terms / promise_date`, `party.party.sales_rep /
territory / customer_sic_code / is_supplier / supplier_contact(_title) /
contact_title`, `purchase.purchase.buyer / fob_point / ship_via / promise_date`,
`purchase.product_supplier.mfg_name / mfg_part_id / as_of_date /
expiration_date / price_type`, `nline.sales_rep`, `nline.territory`,
`nline.sic_code`, `nline.carrier`, `nline.discount_class`,
`nline.service_charge`, `nline.sales_tax_group`, `nline.fob_point`,
`nline.ship_via`, `nline.product_code`, `nline.commodity_code`,
`nline.reason_code`, `currency.currency.thousands_separator /
decimal_separator / exchange_rate`, `account.invoice.payment_term.net_days`.

## Decisions

- Jobshop "Role" = Tryton group (as asked); the N-Line role (nline_role, set
  from the BI Admin page) is shown and can be chosen, but N-Line BI sets it
  again at each sign-in, with the PO limit and work order options. Groups a
  role gave come back at the next sign-in if removed here; groups added here
  stay (nline_role keeps hand-added groups). Nothing in the sign-in sync was
  changed.
- Authority Manager by role edits `ir.ui.menu` groups: a menu group defined
  in nline_jobshop's XML that is removed here may come back when that module
  is updated (Tryton re-creates its XML records). Allowing by user is the
  durable way (user groups).
- Journal batches: Tryton posts most moves at once (stock, labor), so "Post"
  mostly batches already posted moves; a draft move (a journal entry, a
  production move left draft) is posted first.
- Fiscal year creation needs a previous fiscal year (Tryton's Renew Fiscal
  Year): the first one is made in Tryton (or by the migration's base step).
- The report descriptions of the help are Infor's: they are not copied into
  the code; the dialog shows the report's name and .rpt.
- Migration (`js_admin`): the DEFAULT account set fills the empty accounts of
  the "Parts" category (others become categories named by their ID); Jobshop
  account IDs are matched by code, else by name; the defaults of System
  Settings (account sets, next batch number 549 with Jobshop's padding) are
  set when empty. The accounting calendar is compared only (logged): the
  Tryton periods are made by the base step and closed by the accountant
  (closing old periods here would stop the import of older documents).
  Not run against nline_test / live (brief); the migration code is not
  covered by a test.

## For the integrator

- Module dependencies (tryton.cfg): account, account_invoice, account_product,
  company, ir, nline_desk, nline_js_common, nline_role, party, product,
  production, purchase, res, sale, stock — all already installed with
  nline_desk. New model / fields: update the module (`-u nline_js_admin`).
- Data: run step `js_admin` after `base` (it uses `m.parts_category`).
- Suggested shared-file changes:
  - frame.js `UI.master`: return the form's `allow` (or accept `hidden` extra
    buttons) so a screen can hide an extra button by rights later (Account
    Sets' "Account Set List" is shown to everyone who opens the window).
  - accounting.js Report Center: a link to the Jobshop reports
    (`js-reports/accounting`).
  - The other areas' windows can print their list report with
    `UI.openScreen('js-reports/<group>/<report id>')` (ids: see
    `jsadmin_report_list`), e.g. `js-reports/common/fob_point_list`,
    `js-reports/sales/sales_order_list`, `js-reports/shopfloor/traveler`.
  - EMULATION.md: tick the Accounting section and the 99 reports as above;
    add Executive Information and Administration items.
