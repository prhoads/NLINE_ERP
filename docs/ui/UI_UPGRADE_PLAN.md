# UI upgrade plan: Tryton ERP that works like QuickBooks and Jobshop

Source: the screen inventories in `docs/ui/inventory/` (VISUAL Jobshop user guide, 909 pages: 4 files, 142 screens; QuickBooks Desktop Level 1 manual: 1 file, 94 screens).

## How the new screens are built (decided 2026-10-27)

- Everything stays inside Tryton: each N-Line screen opens in a Tryton tab from the left menu, like a Tryton screen. It is a page of `nline_desk/web` shown in the tab (`custom.js` `Sao.Tab.NLine`); links to other screens open their own tab, and Save & Close closes the tab.
- Menus show only what the user's role may open. Read-only roles do not see screens that write (actions flagged `nline_writes`) nor wizards. A Tryton or N-Line address typed by hand opens only what the user's menus open.
- Standard Tryton screens stay as they are. An N-Line screen that replaces one is listed under Administration > Superseded Menus, where the administrator hides the old one.

## Building blocks first (used by every screen)

Both products share a small set of patterns. Build them once in `web/js/ui.js`:

| Block | QuickBooks | Jobshop | Notes |
|---|---|---|---|
| Transaction form ribbon | Previous / Next, Save & Close, Save & New, Clear, Print, Email; history side panel | ID box with "..." lookup, blank ID = next number, Save/Clear/Copy | One form frame for bills, invoices, POs, sales orders, work orders |
| Line grid | Expenses / Items tabs, totals footer | Row markers (+ new, check edited, red X deleted), Save commits all | Keyboard entry, lookups in cells |
| Lookup | Type-ahead lists | "..." button / F9 browse with wildcards | Same control everywhere |
| Center | List left, detail + transactions right | Window with tabs ending in a Browse list | Customer, Vendor, Item/Part, Employee centers |
| Home | Workflow flowchart (Vendors, Customers, Employees, Company, Banking) | Navigation bar groups | A "Home" tab opened at sign-in |
| Report viewer | Customize (Display, Filters, Header, Fonts), memorize, drill-down to the form | Report list per group, range/sort, preview, export | One viewer for every report |
| Card canvas | — | Colour-coded operation/material/leg cards (engineering master, quote master, work order) | Extends today's Work Order cards |

## Screens by phase

Done before the plan: Enter Bills, Pay Bills, Write Checks, Create Invoices, Receive Payments, Make Deposits, Check Register, Customer Center, Vendor Center, Work Orders (cards).

1. **Foundations (done 2026-10-28).** `web/js/frame.js`: `UI.form` (ribbon: Find, Clear, Save & New, Save & Close, Alt+S / Alt+N / Alt+R / Ctrl+F; history panel of the customer or vendor), `UI.grid` (row markers, totals, Enter to the next cell), `UI.browse` ("..." and F9 in every lookup field, * wildcards), `UI.center`, `UI.openRecord/openScreen/openAction`. Home tab (`nline.desk.home`, tiles only for the menus the user sees) opened at sign-in. Menus Home, Customers, Vendors, Banking, Shop Floor, Engineering, Inventory, Company first; the standard top menus are proposed under Superseded Menus. All existing screens on the frame; the invoice item grid moves to `UI.grid` with phase 2. The report viewer comes with the Report Center in phase 2.
   Original phase 1 scope: The building blocks above; the Home tab; the menus regrouped as QuickBooks/Jobshop users expect (Customers, Vendors, Banking, Company, Engineering, Sales, Inventory, Purchasing, Shopfloor). The existing screens move onto the new form frame.
2. **QuickBooks daily accounting.** Sales Receipts, Credit Memos/Refunds (+ apply credits), Statements, Enter Credit Card Charges, Make General Journal Entries, Chart of Accounts with registers, Reconcile, Income Tracker, Bill Tracker, Item List, Report Center (P&L, Balance Sheet, A/R and A/P aging, with drill-down to the form).
3. **Jobshop order to cash.** Customers window, Sales Order with lines linked to work orders, Shipping, Invoicing from shipments; Parts window (where used, transactions, availability).
4. **Jobshop purchasing.** Supplier window, Purchase Order (lines linked to work orders), Receiving (receiver + returns), QuickBooks Receive Inventory / Enter Bills Against Inventory on the same data.
5. **Jobshop shop floor.** Work Order window on the card canvas, Engineering Master, Operation/Material/Leg editors, Show Details, Show Costs, Labor Entry and Reversal, Material Issues, Work Order Receipts, Shop Resources, Employees.
6. **Planning and estimating.** Material Planning workbench, Scheduling with a Gantt chart, calendars; Quotes and Quote Master (cost from part / quote master / engineering master), Create Sales Order from Quote.
7. **Company and setup.** Terms, code tables, import of customers/suppliers/parts, preferences, closing date.

## Status (2026-10-30): all seven phases built

Every phase is built, tested (nline_desk: 31 tests, one scenario per phase: `tests/scenario_nline_desk_*.rst`) and checked in the browser on the demo. Server code per phase: `accounting.py` (2), `sales.py` (3), `purchasing.py` (4), `shopfloor.py` (5), `planning.py` (6), `company.py` (7); screens in `web/js/accounting.js`, `orders.js`, `purchasing.js`, `shopfloor.js`, `planning.js`, `company.js`; menus generated by `tools/gen_menus.py` (48 screens, 8 folders). The Jobshop maintenance window is `UI.master` (ID with lookup, tabs, line tabs, Browse, Copy/Delete), the report viewer `UI.report`.

Not done, or done more simply than the original:
- Previous/Next arrows of the QuickBooks forms (Find opens earlier documents).
- Credit memos apply whole, to an invoice of at least their amount; no partial application or refund check.
- Reconcile clears through a bank statement in Tryton (needs a statement journal for the bank account); no discrepancy report.
- Labor reversal cancels tickets not done yet; a posted ticket is corrected in Tryton.
- Material Issues / Work Order Receipts receive the whole work order (no partial receipt, no close short).
- Scheduling is infinite capacity (like the Jobshop standard scheduler); no calendars or exceptions (Tryton has none).
- Quote Master is the Engineering Master (Tryton has one kind of BOM); quotes have one quantity per line (no quantity breaks).
- The card canvas edits stay in Work Orders (cards); the operation/material/leg editors are the Tryton forms opened from it.
- Reports: Profit & Loss, Balance Sheet, A/R and A/P aging; other reports are Tryton's.

Not planned unless asked: QuickBooks payroll (Paychex module already exists), bank feeds, sales tax hub (N-Line sales are mostly tax-exempt), Accountant's Copy, the Jobshop database wizard and Crystal custom reports (Tryton reports replace them).

## Notes from the inventories

- Jobshop has no general ledger: it exports posted periods to QuickBooks. In Tryton both sides share one ledger, so Jobshop's Account Interface / Export screens are not rebuilt; its Account Sets map to Tryton's product account categories.
- QuickBooks Level 1 does not cover Estimates, Sales Orders, Build Assemblies or Item Receipts; those entries are from general QuickBooks knowledge. For the manufacturing side the Jobshop screens lead.
- The Jobshop card canvas (pages 204-212, 610-618) is the hardest screen; its read-only Show Details tree and Show Costs grid come first.
