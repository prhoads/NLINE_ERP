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

Done today: Enter Bills, Pay Bills, Write Checks, Create Invoices, Receive Payments, Make Deposits, Check Register, Customer Center, Vendor Center, Work Orders (cards).

1. **Foundations.** The building blocks above; the Home tab; the menus regrouped as QuickBooks/Jobshop users expect (Customers, Vendors, Banking, Company, Engineering, Sales, Inventory, Purchasing, Shopfloor). The existing screens move onto the new form frame.
2. **QuickBooks daily accounting.** Sales Receipts, Credit Memos/Refunds (+ apply credits), Statements, Enter Credit Card Charges, Make General Journal Entries, Chart of Accounts with registers, Reconcile, Income Tracker, Bill Tracker, Item List, Report Center (P&L, Balance Sheet, A/R and A/P aging, with drill-down to the form).
3. **Jobshop order to cash.** Customers window, Sales Order with lines linked to work orders, Shipping, Invoicing from shipments; Parts window (where used, transactions, availability).
4. **Jobshop purchasing.** Supplier window, Purchase Order (lines linked to work orders), Receiving (receiver + returns), QuickBooks Receive Inventory / Enter Bills Against Inventory on the same data.
5. **Jobshop shop floor.** Work Order window on the card canvas, Engineering Master, Operation/Material/Leg editors, Show Details, Show Costs, Labor Entry and Reversal, Material Issues, Work Order Receipts, Shop Resources, Employees.
6. **Planning and estimating.** Material Planning workbench, Scheduling with a Gantt chart, calendars; Quotes and Quote Master (cost from part / quote master / engineering master), Create Sales Order from Quote.
7. **Company and setup.** Terms, code tables, import of customers/suppliers/parts, preferences, closing date.

Not planned unless asked: QuickBooks payroll (Paychex module already exists), bank feeds, sales tax hub (N-Line sales are mostly tax-exempt), Accountant's Copy, the Jobshop database wizard and Crystal custom reports (Tryton reports replace them).

## Notes from the inventories

- Jobshop has no general ledger: it exports posted periods to QuickBooks. In Tryton both sides share one ledger, so Jobshop's Account Interface / Export screens are not rebuilt; its Account Sets map to Tryton's product account categories.
- QuickBooks Level 1 does not cover Estimates, Sales Orders, Build Assemblies or Item Receipts; those entries are from general QuickBooks knowledge. For the manufacturing side the Jobshop screens lead.
- The Jobshop card canvas (pages 204-212, 610-618) is the hardest screen; its read-only Show Details tree and Show Costs grid come first.
