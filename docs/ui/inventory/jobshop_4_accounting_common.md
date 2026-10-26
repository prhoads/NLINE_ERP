# VISUAL Jobshop screen inventory, part 4: Accounting, Common, Appendixes

Source: `C:\Infor Global Solutions\VISUAL Jobshop\Help\VJSUserGuideEnu.pdf` (909 pp.).
Range covered: PDF pages 747-863 (Section 9 Accounting = ch. 42-45, Section 10 Common = ch. 46-49, Section 11 Appendixes A-E).
Page numbers below are **PDF page numbers** (1-based); the printed chapter page (e.g. "44-10") is given where useful.
Mapping rule: PDF page = chapter start + (printed page - 1). Chapter starts: ch42=749, ch43=757, ch44=765, ch45=777, ch46=781, ch47=785, ch48=793, ch49=799, App A=803, App B=819, App C=829, App D=847, App E=856.

Note on the product: this manual is the old Lilly Software "VISUAL Jobshop" (Win9x/2000 era, MDI app). It has **no general ledger**: Accounting is only a GL account list, account sets (posting profiles), period posting and a flat-file export to QuickBooks Pro / Peachtree / Pastel. That makes this section the natural bridge to the QuickBooks Desktop look-alike.

---

## 1. Summary table

| # | Screen | Module (Group bar) | Purpose | PDF pages |
|---|--------|--------------------|---------|-----------|
| 1 | Main Jobshop window (shell: menu bar, toolbar, navigation bar, status bar) | all | Application frame and launcher | 58-61 (ref), 803-817 |
| 2 | Accounts | Accounting | Grid of GL account IDs, descriptions, types | 749-756 |
| 3 | Account Sets (Account Sets tab + Browse tab) | Accounting | Named posting profile mapping each transaction class to GL accounts | 757-763, 841-843 |
| 4 | Account browse/lookup (from "..." buttons in Account Sets) | Accounting | Pick an account ID from the Accounts table | 759-762 |
| 5 | Account Interface - Account Periods tab | Accounting | Post/close accounting periods into journal batches | 765-773 |
| 6 | Close-current-period confirmation dialog | Accounting | Confirm locking prior period when posting current period | 772-773 |
| 7 | Account Interface - Export tab | Accounting | Export posted batches + customer/supplier masters to accounting package files | 774-776 |
| 8 | Save As dialog (Export To "..." button) | Accounting | Choose export file name per journal | 775-776 |
| 9 | "Blank file name" warning | Accounting | Validation when an Export To box is empty | 776 |
| 10 | Accounting Reports (in Reports window) | Accounting | 5 accounting report definitions | 777 |
| 11 | FOB Points table | Common | Maintain FOB points | 781 |
| 12 | Shipping Methods table | Common | Maintain ship-via methods | 781 |
| 13 | States/Provinces table | Common | US states / Canadian provinces (pre-populated) | 781-782 |
| 14 | Postal Codes table (+ Add Postal Code on-the-fly dialog) | Common | Zip -> city/state/country lookup | 782 (dialog: 92-93) |
| 15 | Product Codes table | Common | Sales product grouping codes | 782 |
| 16 | Commodity Codes table | Common | Purchase/commodity grouping codes | 782-783 |
| 17 | Status Reason Codes table | Common | Reason codes for adjustments, labor | 783 |
| 18 | Terms | Common | Payment terms rules (aging + discount) | 785-791 |
| 19 | Control Panel | Common | Applet launcher (Change Password, Printer Setup) | 793-794 |
| 20 | Change Password dialog (+ mismatch message) | Common | Change own Jobshop password | 794-795 |
| 21 | Print Setup dialog | Common | Windows printer setup | 796-797 |
| 22 | Common Reports (in Reports window) | Common | 9 list reports of common tables | 799 |
| 23 | File > Import (Customers / Suppliers / Parts) dialog | File menu (all) | Tab-delimited bulk import of masters | 856-860 |
| 24 | Custom Crystal Reports folder (not a screen; behaviour) | Reports | Override standard reports per PC | 863 |

Reference material in range (not screens, but specifies behaviour the screens must reproduce): Appendix A menu/shortcut map (803-817), Appendix B full report catalog (819-828), Appendix C costing/posting design (829-846), Appendix D functional flow chart and accounting transaction matrix (847-855), Appendix E account-type mapping to QuickBooks/Peachtree/Pastel (861-862).

---

## 2. Common UI conventions (look and feel)

Sources: Appendix A (803-817, in range) plus chapter 2 (57-98, outside range, read only to explain the conventions).

### 2.1 Main window / launcher
- Classic MDI frame. Title bar "VISUAL Jobshop"; child windows open inside the Main Window, can be minimized to title stubs, cascaded or tiled (Window menu). SHIFT+click on a launcher icon opens a **second copy** of the same window.
- **Navigation Bar** (left, Outlook-97 style): stacked **Group bars** = Estimating, Engineering, Sales, Inventory, Purchasing, Planning, Shopfloor, Accounting, Common, Administration. Clicking a group bar slides it open to show large shortcut icons; each group ends with a **Reports** icon. Icons can be dragged between groups; admins can hide groups/icons per user. View > Small/Large Icons; View > Navigation Bar toggles it.
  - Accounting group: Accounts, Account Sets, Account Interface, Reports.
  - Common group: FOB Points, Shipping Methods, States/Provinces, Postal Codes, Product Codes, Commodity Codes, Status Reason Codes, Terms, Control Panel, Reports.
- **Status bar**: status/tooltip text at left, current user (e.g. ADMIN), CAPS/NUM/INS indicators; hovering the menu bar shows the database path.

### 2.2 Menu bar (contents change with the active window; Appendix A)
- **File**: New Document From > (Quote, Eng Master, Quote Master, Work Order); Open Document (Ctrl+O); Save (Ctrl+S); Save As; Refresh (F5); Printer Setup; Print Preview; Print (Ctrl+P); Send To; Preferences; Import > (Customers, Suppliers, Parts) [release notes]; Exit.
- **Edit**: Delete (Del, marks grid row); Clear Document (blank the form for a new record); Cut / Copy / Paste Document (whole-document copy, used to clone records); Delete Document (deletes whole record with Yes/No confirm); Picture > Insert / Clear / Stretch to Fit.
- **View**: Small Icons, Large Icons, Navigation Bar, Material Availability, Inventory Txs, Inventory Pieces, Where Used, Operations, Capacity, Grid Lines, Highlight Determinant Path.
- **Options**: Right-click Info, Data Tips, Set Load Horizon, Copy Subordinates.
- **Browse** (record navigation): Refresh Browse (Shift+F5), First (Ctrl+F), Previous (Ctrl+L), Next (Ctrl+N), Last (Ctrl+E), Browse Filter (Ctrl+B = Advanced Filtering and Sorting), Auto Browse (type-ahead toggle), Save Widths and Positions.
- **Tools** (context): Reset Material Costs, Add Details / Edit Details (line detail sub-grid), Re-number Lines, Add Operation (Ctrl+A), Add Material (Ctrl+M), Add Leg/Detail, Edit, Change Status > (UnReleased, Firm, Release, Close, Cancel), Show Details, Show Costs, Variables, Planning > (Open Sales Orders / Non-Stocked Parts / Stocked Parts submenus), Weekly Calendar, Calendar Exceptions, Scheduling > (Display Mode, Zoom, Operations, Capacity, Grid Lines, Highlight WO Immediate Shift+F11, Remove Highlight, Highlight Determinant Path, Schedule All, Right-click Info, Data Tips), Receiving > (Receiving View, Receive, Return, Edit Receiver > For Receiving/For Return, Refresh F5), Re-price Lines > (All Lines, Selected Lines).
- **Navigate**: visible on the main-window screenshot (same items as the Navigation bar); not listed in App. A.
- **Window**: Cascade, Tile Horizontally, Tile Vertically, Arrange Icons, Next, Previous, Close Window, Close All Windows, numbered list of open windows.
- **Help**: Contents and Index (F2), Technical Support, Upgrade License, About.
- Menus and toolbars are customizable (right-click > Customize: Toolbars/Commands tabs, drag commands, create named toolbars, dock/float).

### 2.3 Standard toolbar (from the main-window screenshot, p58)
Open, Save, Refresh | Clear Document (eraser) | Cut / Copy / Paste Document | Print-type icon | Edit Browse Filters | First, Previous, Next, Last record | Auto Browse toggle, Refresh Browse. Icons gray when unavailable; tooltips optionally show the shortcut.

### 2.4 Keyboard (App. A, 817)
F1 context help; F2 help contents; **F9 opens the lookup/sub-window for the focused field**; F10 focuses the menu bar; Esc cancels a dialog; Space presses the focused button / toggles a checkbox; Tab moves field to field; F5 refresh; Shift+F5 refresh browse. Access keys follow ALT, menu letter, item letter (e.g. ALT,F,O).

### 2.5 Two window archetypes
1. **Table window** (Accounts, Terms, all Common tables, Sales/Purchasing info tables): one tab, an editable grid. Type into the empty last row; row-header glyphs show state: **+** new unsaved, **check mark** edited unsaved, **red X** marked for delete (Del key or Edit > Delete). Nothing is committed until **Save**. Closing with unsaved rows prompts to save. Click a column header to sort descending, Shift+click ascending; drag column edges/headers, then Browse > Save Widths and Positions.
2. **Document window** (Account Sets and all business documents): header form on the first tab + a **Browse** tab with a searchable grid of all records. Title bar shows "Window :: ID" or ":: New". Primary ID field has a "..." browse button plus a dropdown of recently opened IDs; leaving the ID blank auto-numbers on save for numbered documents. Record navigation via Browse menu/toolbar. Delete whole record via Edit > Delete Document with confirm.

### 2.6 Field-entry conventions
- "..." **Table Browse button** beside a field opens a lookup table; type a search value (wildcards `*`, `?`) and Find; double-click a row to return it. Grid column titles shown as `<Part ID>` are buttons that open the same lookup.
- **Auto Browse** type-ahead fills the first matching ID as you type.
- Numeric fields accept arithmetic expressions (+ - * / ( ) **) evaluated on Tab/Enter.
- Date fields: typed or dropdown calendar (today circled red; right-click header > Go to today).
- Required-field validation happens on save with a message box.
- Postal code not on file triggers an **Add Postal Code** prompt (city, state "..." lookup, country) on the fly.
- **Advanced Filtering and Sorting** (Ctrl+B / Edit Browse Filters icon): Filters tab grid (Column Description, Condition [<, <=, <>, =, >, >=, Begins with, Contains, Ends with], Value, And/Or), column visibility checkboxes, Sorting tab (Available/Selected columns, Add/Remove/Up/Down), Use Settings for All, Restore Settings; per-PC.
- Program Preferences (File > Preferences): save settings on exit, remember current group, auto browse, auto-refresh browse after save/delete, confirm exit, tooltip options.

### 2.7 Reports convention
Every group's **Reports** icon opens the Reports window listing that group's reports; select a report, set filters/sorting (same Advanced Filtering grid), Preview or Print; Print Preview window has page navigation, zoom, print and export (ch. 5, PDF 143-168). Custom Crystal reports placed in `...\Reports\Custom` with the identical file name override the standard one on that PC (863).

---

## 3. Section 9 - Accounting

### 3.1 Accounts (table window)
- **Open**: Accounting group bar > Accounts icon. Close via window X (prompts to save).
- **Purpose**: Maintain the GL account IDs that Jobshop posts to; must match the external accounting package's chart exactly.
- **Layout**: Single tab "Accounts"; grid columns **ID** (<=15 alphanumeric), **Description** (<=60), **Type** (dropdown: Asset, Equity, Liability, Expense, Revenue). Sample rows: ADJ, CGS_BUR, CGS_LAB, CGS_MAT, CGS_SER, EXP, INV_BUR/LAB/MAT/SER, MATAX. No totals.
- **Actions**: Save (toolbar/File); Delete (Del key or File/Edit > Delete marks red X, then Save). Standard table-window row glyphs.
- **Rules**: at least one account per required role: Assets for receivables and inventory/WIP (mat/lab/bur/svc); Liabilities for purchase accrual, payables, sales tax; Expenses for inventory adjustment, purchase expense, factory burden, factory labor, COGS (mat/lab/bur/svc), purchase tax; at least one Revenue. Do not delete accounts that have postings (referential integrity, unrecoverable).
- **Workflow**: 1) click empty ID cell, type ID; 2) Tab, description; 3) Tab, pick Type; 4) repeat; 5) Save. Edit = click cell, change, Save. Delete = select row header, Del, Save.
- **Links**: feeds Account Sets lookups; Customer import Recv/Rev GL Acct, Supplier import Payb/Expense GL Acct; Account List report.
- **Pages**: 749-756.

### 3.2 Account Sets (document window)
- **Open**: Accounting group bar > Account Sets icon. Title "Account Set :: New" / ":: <ID>".
- **Purpose**: A named set of GL accounts (a posting profile) applied to transactions; assigned per Part (Parts > Costing), per Shop Resource (Costs section), per work order header (override), with a global default in System Settings > Inventory.
- **Resolution order**: transaction-level override (e.g., WO header account set) > part/resource account set > system default. A WO material issue debits WIP using the WO's set and credits inventory using the part's set (843).
- **Layout**: Tabs **Account Sets** | **Browse**.
  - Header: **Account Set ID** ("..." browse + recent-ID dropdown, <=15), **Description** ("..." , <=60).
  - Panel (unlabeled, two columns), each a "..." button + account box: Inventory Adjustment (expense), Purchase Expense (expense), Purchase Accrual (liability), Payables (liability) | Sales Revenue (revenue), Receivables (asset), Applied Factory Burden (expense), Applied Factory Labor (expense).
  - Group **Inventory**: Material, Labor, Burden, Service.
  - Group **WIP**: Material, Labor, Burden, Service.
  - Group **Cost Of Goods Sold**: Material, Labor, Burden, Service.
  - (Appendix C also lists Indirect Labor as "not used"; Appendix E lists Purchase Tax and Sales Tax account roles.)
  - Browse tab: searchable grid of all account sets.
- **Actions**: Save; Account Set ID button to load existing; Edit > Delete Document (Yes/No confirm); Clear Document for new; Browse navigation.
- **Workflow (add)**: 1) enter ID; 2) description; 3) for each role click "..." and pick an account; 4) fill Inventory, WIP, COGS groups; 5) Save. Edit: pick set via ID button, change accounts, Save. Delete: load, Edit > Delete Document, Yes.
- **Links**: Accounts (lookup source); Parts, Shop Resources, Work Orders, System Settings (consumers); Account Set List report.
- **Pages**: 757-763; role definitions 841-843.

### 3.3 Account lookup dialog (Table Browse)
- **Open**: any "..." button in Account Sets (also F9 on the field).
- **Purpose/Layout**: Standard lookup table of Accounts (ID, Description, Type) with Search box + Find (wildcards). Double-click returns the ID. Manual implies the list is filtered by the type each role expects ("from your expense accounts table").
- **Pages**: 759-762; convention 77-78.

### 3.4 Account Interface (document window, two tabs)
- **Open**: Accounting group bar > Account Interface icon.
- **Purpose**: Close/post accounting periods into journal batches and export batches to the external accounting package.
- **Concepts**: Posting builds a **Batch ID** of all unposted/changed inventory transactions dated on/before the period end, valued and mapped to accounts via account sets. Each batch has a **Posting Date** (day batch was created; used to select batches for export) and a **Posted Date** (period end date the entries carry into the GL). Three journals: **Inventory Transactions** (adjustments, issues, labor/burden, services, PO/WO receipts, shipment costs; imported as General Journal), **Accounts Receivable Invoices** (from shipments/returns; imported as AR invoices), **Purchase Receipts** (imported as AP invoices/bills; offsets Purchase Accrual). Periods themselves are defined in Administration > System Settings > Accounting.

#### Tab A: Account Periods
- **Layout**: Group **Transactions** with two radio buttons: "Post to Period End Date of <previous period end>" and "Post to Period End Date of <current period end>"; **Post** button. Grid below: **Fiscal Year**, **Period**, **Last Day**, **Closed** (checkbox, read-only).
- **Workflow (first use)**: 1) first radio preselected; click Post to close the earliest period; 2) repeat selecting the next open period until the current period end is later than today.
- **Workflow (normal)**: either post current-period activity **to the previous period end** (catch-up of back-dated transactions; only transactions dated on/before that end are posted, all stamped with that end date, so closed-period reports in the GL never change), or post **to the current period end** -> confirmation dialog (3.5) -> period closed but still accepts transactions, prior period locked, next period opened. Can post to the current period repeatedly during the month. Posting cannot be undone.
- **Strict rule** (845): a period must be closed before its successor ends, or new transactions are refused (only if the accounting interface is used).

#### Tab B: Export
- **Layout**: **Accounting Package** dropdown (Peachtree Complete Accounting for Windows, QuickBooks Pro version 6.0, Pastel Partner). Group **Posting Dates**: From [date+checkbox], To [date+checkbox], **Re-Export All in Date Range** checkbox. Group **Options**: five rows, each checkbox + "Export To:" "..." button + filename box: Inventory Transactions, Accounts Receivable Invoices, Purchase Receipts, Customer Information, Supplier Information (filename box disabled until its checkbox is ticked). **Export** button.
- **Workflow**: 1) pick package; 2) set posting-date range; 3) optionally Re-Export All (otherwise each batch exports once only); 4) tick journals/masters; 5) for each, click "..." -> Save As dialog -> enter file name -> Save; 6) click Export. QuickBooks output = tab-delimited **.iif**; Peachtree = comma-separated with the extension you give. Empty filename -> warning (3.7).
- **Links**: System Settings (periods), Labor Entry / Adjustments etc. (sources), Journal Batch List / Journal Batch Detail List reports (to inspect batches), Appendix C/D.
- **Pages**: 765-776.

### 3.5 Close-period confirmation dialog
- Message box "VISUAL Jobshop": the accounting period for the current date is about to be closed; the prior period will be locked; continue? **Yes** posts, **No** cancels. Page 772-773.

### 3.6 Save As dialog (Export To)
- Standard Windows file Save As (File name, Save). Selected path is written into the Export To box. Pages 775-776.

### 3.7 "Blank file name" warning
- Message box: blank file name; all export types must export to a valid file name. OK returns to Export tab. Page 776.

### 3.8 Accounting Reports
- **Open**: Accounting group bar > Reports icon (Reports window, ch. 5 conventions).
- **Reports**: Accounting Calendar (periods and closed status); Account List; Account Set List (sets with their accounts); Journal Batch Detail List (batch detail by account and date); Journal Batch List.
- **Workflow**: select report, optional Advanced Filter/Sort, Preview or Print.
- **Pages**: 777.

---

## 4. Section 10 - Common

### 4.1 Common Information Tables (7 table windows)
All are standard **table windows** (convention 2.5) opened from the **Common** group bar; grids save with Save, delete with Del + Save. The manual (ch. 46) describes purpose only, no column lists; columns below are inferred from usage and the import specs (App. E) and should be checked against the live app if available.

| Table | Purpose | Likely columns | Used by | Pages |
|-------|---------|----------------|---------|-------|
| FOB Points | Point where title/responsibility passes to customer | ID, Description | Customers, Suppliers, POs, Quotes, SOs, Shipping, Invoicing (printed on docs) | 781 |
| Shipping Methods | Ship Via values (Overnight, 2nd Day Air, Pickup, LTL, Best Way) | ID, Description | Customers, Suppliers, POs, SOs, Invoicing, Shipping | 781 |
| States/Provinces | Pre-loaded US states and Canadian provinces | ID (<=10), Name | Address entry everywhere | 781-782 |
| Postal Codes | Zip/postal code -> City, State, Country auto-fill; also added on the fly via Add Postal Code dialog | Postal Code (<=10), City, State, Country | All address blocks; imports (dynamic validation) | 782; dialog 92-93 |
| Product Codes | Group items you sell; report sorting; overridable on quote/SO/PO lines and shippers | ID (<=15), Description | Quote/Eng Masters, Parts, Planning, WOs, lines | 782 |
| Commodity Codes | Group items you buy (or in-house vs outsourced); overridable on lines | ID (<=15), Description | Parts, lines, purchasing | 782-783 |
| Status Reason Codes | Explain nonstandard transactions (e.g., Machine Maintenance) | ID, Description | Adjustments, Labor Entry; reason-sorted reports (Quality, Labor Analysis) | 783 |

### 4.2 Terms (table window)
- **Open**: Common group bar > Terms icon.
- **Purpose**: Payment terms rules for customers, suppliers, quotes, SOs, POs, invoices (customer default overridable per order).
- **Layout**: Single tab "Terms"; grid columns **ID**, **Invoice Age Type** (dropdown), **Invoice Aging Days**, **Discount Age Type** (dropdown), **Disc Aging Days**, **Disc Percent**, **Terms Description** (<=47). Example: `2%` / Age in days / 30 / Age in days / 10 / 2.000 / "2%10 Net 30".
- Age type values: Age in days (enter N days); Day of next month (enter day number); Collect on delivery (enter 0); End of this month (enter day). Same list for discount.
- **Workflow**: 1) type ID in empty row; 2) pick invoice age type; 3) enter aging days/day; 4) pick discount age type; 5) discount days; 6) discount percent; 7) description; 8) Save. Edit/delete per table convention.
- **Links**: Customers, Suppliers, Quotes, Sales Orders, Purchase Orders, Invoicing; Payment Terms List report; imports (Terms Rule ID).
- **Pages**: 785-791.

### 4.3 Control Panel
- **Open**: Common group bar > Control Panel icon.
- **Purpose**: Small icon-view window holding two applets: **Change Password**, **Printer Setup** (double-click to open).
- **Pages**: 793-794.

### 4.4 Change Password dialog
- **Open**: Control Panel > double-click Change Password.
- **Layout**: Old Password, New Password, Confirm Password (masked); **OK**, **Cancel**.
- **Workflow**: 1) old password; 2) new; 3) confirm; 4) OK (effective next login). Mismatch -> message "The new password and the confirm password do not match!" (OK, re-enter). Cancel keeps old password.
- **Links**: Administration user setup (ch. 3, PDF 103-107).
- **Pages**: 794-795.

### 4.5 Print Setup dialog
- **Open**: Control Panel > double-click Printer Setup (also File > Printer Setup).
- Standard Windows printer setup; OK applies immediately. Pages 796-797.

### 4.6 Common Reports
- **Open**: Common group bar > Reports.
- **Reports**: Commodity Code List, Company Information, FOB Point List, Postal Code List, Product Code List, Reason Code List, Shipping Method List, States/Provinces List, Payment Terms List.
- **Pages**: 799.

---

## 5. Section 11 - Appendixes (screens and behaviour)

### 5.1 File > Import dialog (Customers / Suppliers / Parts) - App. E release notes
- **Open**: File > Import > Customers | Suppliers | Parts.
- **Purpose**: Bulk create/update masters from a tab-delimited file (e.g. from Excel). New IDs create records; existing IDs are overwritten.
- **Layout**: list of importable columns with checkboxes (in fixed order), "First Row Contains Column Headers" checkbox, **Import** button (opens file-open dialog).
- **Workflow**: 1) make sure validated reference data exists (UoM, locations, product/commodity codes, territories, SIC, reps, terms, FOB, ship via, tax groups, accounts...); 2) build the file in the required column order; 3) File > Import > type; 4) tick columns, set header option; 5) Import, pick file, Open; 6) fix rejected rows (foreign values in validated fields are reported and skipped; new postal codes prompt to add); 7) repeat. Not easily reversible; wrong records are removed with Edit > Delete Document.
- **Field specs** (useful as master-data field lists):
  - Parts (37 fields): ID(30, req), Stock U/M(req), Primary Location ID(req), Description(60), Weight, Weight U/M, Planning Leadtime, Order Point, Eng ID, Product Code, Commodity Code, Mfg Name, Mfg Part ID, Fabricated, Purchased, Stocked, Safety Stock Qty, Tool or Fixture, Auto Issue, Drawing ID, Drawing Rev, Drawing File, Pref Supplier ID, Auto Issue Loc ID, Unit Mat/Lab/Bur/Ser Cost, Fixed Cost, Unit Price, Account Set ID, Piece Tracked, Length/Height/Width Reqd, Dimensions UM, Ship Dimensions.
  - Customers (33): ID(15, req), Name, Addr 1, Addr 2, City, State, Postal Code, Country, Contact Name/Title/Phone/Fax/E-mail, Salesrep ID, Addr Etc, Territory, FOB Point, Ship Via, Terms Rule ID, Freight Terms (BILLED/COLLECT/PREPAID), Tax ID Number, Tax Exempt, Tax Group ID, SIC Code, Discount Class ID, Credit Status (APPROVED/HOLD_ORDERS/HOLD_SHIPMENTS), Credit (Order) Limit, Our Supplier ID, Carrier ID, Recv GL Acct ID, Rev GL Acct ID, Last Order Date, Open Date.
  - Suppliers (26): ID(15, req), Name, Addr 1-2, City, State/Province, Postal Code, Country, Contact Name/Title/Phone/Fax/Email, Addr Etc, FOB Point, Ship Via, Buyer, Terms Rule ID, Tax ID Number, Tax Group, Payb GL Acct ID, Expense GL Acct ID, Web URL, Last Order Date, Open Date, Tax Exempt.
- **Pages**: 856-860.

### 5.2 Appendix A - menu and shortcut map
Folded into section 2.2/2.4 above. Pages 803-817.

### 5.3 Appendix B - full report catalog (all modules)
Every report is run from its group's Reports window (selection = Advanced Filter/Sort + Preview/Print). Grouped by likely module:
- **Accounting**: Accounting Calendar, Account List, Account Set List, Journal Batch Detail List, Journal Batch List.
- **Common**: Commodity Code List, Company Information, FOB Point List, Postal Code List, Product Code List, Reason Code List, Shipping Method List, States/Provinces List, Payment Terms List.
- **Estimating**: Quote Form, Quote List, Quote Master, Quote Master Cost, Quote Master List, Quote Proforma (open-quote backlog).
- **Engineering**: Engineering Master, Engineering Master Cost, Engineering Master List, Engineering Master Material List, Operation Template List, Where Used, Resource Where Used.
- **Sales**: Backlog (firmed/released unshipped lines, grand total), Carrier List, Customer List, Customer Throughput, Discount Class List, Invoice, Invoice List, Pack List, Sales Analysis (bookings:shipments), Sales Gross Margin and Throughput Brief, Sales Order Acknowledgment, Sales Order Detail, Sales Order List, Sales Representative List, Sales Tax Group List, Shipper List, SIC Codes List, Territory List.
- **Inventory**: Inventory Location List, Inventory Transaction List, Inventory Turns, Inventory Value (FIFO layers), Location Content List, Order Point, Part Report, Part List, Part Location List, Physical Count Form, Unit Conversions List, Units of Measure List.
- **Purchasing**: Parts and Service by Supplier, Purchase Order, Purchase Order Detail, Purchase Order List, Receiver (auto-prompted after receiving; cut-apart tags), Receiver List, Service Charges List, Service List, Supplier Delivery Performance (graph), Supplier List, Supplier Price Performance (graph), Tax Group List.
- **Planning**: Material Netting, Resource Schedule (dispatch list; late in red), Resource Utilization (graph), Calendar Exception List, Calendar Week List, Schedule Performance.
- **Shopfloor**: Cut List, Employee Efficiency, Employee List, Employee Throughput, Labor Analysis, Labor Transaction, Labor List, Pick List, Production Report, Quality Performance (PPM, graph), Quality Tracking Graph, Resource Efficiency, Resource Throughput, Run Time Variance, Shop Cost Performance, Shop Resource List, Shop View List, Traveler (printed WO), WIP Value, Work Order Audit, Work Order Cost (estimate vs actual), Work Order History, Work Order List.
- Pages 819-828.

### 5.4 Appendix C - costing and posting rules that screens must honour
- Actual FIFO costing **by location**, four cost buckets kept separate through all BOM levels: material, labor, burden, service. Burden never applies to services.
- No transaction can be deleted; mistakes are corrected with returns/reversals. Late cost changes (e.g., a missing labor ticket) ripple forward through WO receipts, issues, downstream WOs and COGS. Closing a WO flushes/adjusts to actual.
- Links (PO line -> WO requirement/operation; SO line -> WO) override FIFO layer selection.
- Piece-tracked parts cost by shape (L/W/H) and location.
- Posting snapshot tables: INV_TRAN_POST -> JOURNAL_DETAIL -> JOURNAL_SUMMARY -> JOURNAL_BATCH (drill-down chain for the batch reports). All amounts positive in the inventory journal file.
- Export is one-way, by date range, optionally re-exporting already exported records.
- Pages 829-846.

### 5.5 Appendix D - functional flow and accounting transaction matrix
- Flow chart (850-851): Quote -> Sales Order -> Work Order -> Ship -> Invoice, with Purchasing/Receiving, Material Issues, Labor Entry, WO Receipts, Adjustments, Scheduling, Planning (Open SOs / Stocked / Non-stocked), and Account Interface export to the 3rd-party package (AR, AP, inventory transactions).
- Linking rules (848): must link service PO lines to WO service operations and description-only SO lines to WOs; description-only PO material must be linked or expensed; SO lines cannot link to PO lines. Only items with Part ID + UoM + preferred location can be stocked.
- Transaction matrix (852-855), "where performed" -> debit / credit:

| Code | Transaction | Screen | Debit | Credit |
|------|-------------|--------|-------|--------|
| A | Ship from inventory | Sales/Shipping | Receivables; COGS (M/L/B/S) | Sales Revenue, Sales Tax; Inventory (M/L/B/S) |
| B | Customer return to inventory | Shipping | Sales Revenue, Sales Tax; Inventory | Receivables; COGS |
| C | Ship linked SO line from WO | Shipping | Receivables; COGS | Revenue, Tax; WIP |
| D | Return linked SO line to WO | Shipping | WIP | COGS |
| E | Adjust in | Inventory/Adjustments | Inventory | Inventory Adjustments |
| F | Adjust out (cannot go negative) | Adjustments | Inventory Adjustments | Inventory |
| G | Transfer between locations | Adjustments, Transfers tab | (no GL effect) | |
| H | PO receipt to inventory | Purchasing/Receiving | Inventory Material; PO Accruals | PO Accruals; Payables |
| I | PO receipt to linked WO (material/service) | Receiving | WIP Material/Service; PO Accruals | PO Accruals; Payables |
| J | Receipt of description-only expensed material | Receiving | Purchase Expense; PO Accruals | PO Accruals; Payables |
| K | Return to supplier from inventory | Receiving | PO Accruals; Payables | Inventory Material; PO Accruals |
| L | Return to supplier from linked WO | Receiving | PO Accruals; Payables | WIP; PO Accruals |
| M | Issue to WO | Shopfloor/Material Issues | WIP | Inventory |
| N | Issue-return to inventory (negative qty) | Material Issues | Inventory | WIP |
| O | WO receipt to inventory ("Transact Now", "Close short") | Shopfloor/WO Receipts | Inventory | WIP |
| P | Receipt-return to WO ("For Return") | WO Receipts | WIP | Inventory |
| Q | Post labor (firm/released ops only) | Shopfloor/Labor Entry | WIP Labor & Burden | Applied Factory Labor & Burden |
| R | Reverse labor | Labor Entry, Reversal tab | Applied Factory Labor & Burden | WIP Labor & Burden |

### 5.6 Appendix E - account-type mapping to accounting packages
Account ID limits: Jobshop 1-15 alphanumeric; QuickBooks Pro 1-31; Peachtree 1-15; Pastel 7-char numeric "XXX/YYY". Mapping of each Jobshop role to QuickBooks type: Inventory Adjustment, Purchase Expense, Applied Factory Burden/Labor, Purchase Tax -> Expense; Purchase Accrual, Sales Tax -> Other Current Liability; Payables -> Accounts Payable; Sales Revenue -> Income; Receivables -> Accounts Receivable; Inventory and WIP (M/L/B/S) -> Other Current Asset; COGS (M/L/B/S) -> Cost of Goods Sold. Supported packages: QuickBooks Pro 6/2000/2001, Peachtree Complete, Pastel Partner 5. Pages 861-862.

### 5.7 Custom reports (behaviour)
Copy a standard Crystal report into `...\VISUAL Jobshop\Reports\Custom` with the same file name (plus logo.bmp); it then runs instead of the standard one on that PC (or for users whose reports path in Administration > System Settings > General points there). Page 863.

---

## 6. Screens named in the TOC that fall OUTSIDE pages 747-863 (cross-check list)

PDF page numbers computed from chapter starts (verified by footer scan). Chapter starts: ch1=27, ch2=57, ch3=99, ch4=125, ch5=143, ch6=169, ch7=175, ch8=201, ch9=267, ch10=271, ch11=339, ch12=355, ch13=359, ch14=377, ch15=393, ch16=397, ch17=409, ch18=417, ch19=421, ch20=449, ch21=455, ch22=461, ch23=467, ch24=479, ch25=483, ch26=501, ch27=519, ch28=521, ch29=531, ch30=535, ch31=567, ch32=603, ch33=607, ch34=685, ch35=703, ch36=711, ch37=717, ch38=725, ch39=731, ch40=737, ch41=743.

| Screen / dialog | Chapter | PDF page |
|-----------------|---------|----------|
| Installation / shared database setup / Create New Database / Maintain Database / first start (login) | 1 | 36, 43-44, 48, 51, 53 |
| Main Jobshop window (title, menu, toolbar, navigation, status bars) | 2 | 58-62 |
| Customize (menus/toolbars), New Toolbar | 2 | 66-71 |
| Navigation Bar / Group bars | 2 | 73-74 |
| Field conventions, Table Browse lookup, calendar | 2 | 75-81 |
| Advanced Filtering and Sorting (Advanced Filters window) | 2 | 81-89 |
| Information table windows (generic) | 2 | 90-96 |
| Add Postal Code (on the fly) | 2 | 92-93 |
| Program Preferences | 2 | 97-98 |
| Roles / Users / add users to roles | 3 | 103-105 |
| Change Password (admin) | 3 | 106 |
| User Authority Manager | 3 | 107-108 |
| System Settings (Address, Logo, Accounts/Account Sets, Accounting, Auto Numbering, Inventory, Purchasing, Sales, Shopfloor) | 3 | 110-123 |
| Copy database / Tutorial program | 4 | 136, 138 |
| Reports window (+ right-click menu, report toolbar) | 5 | 144-148 |
| Report Advanced Filtering and Sorting | 5 | 152-159 |
| Print Preview window / export report | 5 | 162-167 |
| Quotes window (prepare, copy, won/loss) | 7 | 176-198 |
| Quote Masters window, Info cards, Right-click Info, Data Tips | 8 | 202-213 |
| New Document From | 8 | 221 |
| Add Operation / Add Material & Tools / Add Leg dialogs (QM) | 8 | 223, 234, 240 |
| View Details / View Costs / Material Availability (QM) | 8 | 253, 256, 264 |
| Estimating Reports | 9 | 267 |
| Engineering Masters window (+ info cards, operations, materials, legs, details, costs, material availability) | 10 | 272-338 |
| Operation Templates (+ Browse) | 11 | 340-353 |
| Engineering Reports | 12 | 355 |
| Sales Orders window (entry, from quote, from previous SO, re-price lines) | 13 | 360-374 |
| Customers window, Quantity Break Tables | 14 | 378-391 |
| Sales Information Tables | 15 | 393 |
| Shipping window (ship, partial, cancel shipper, returns) | 16 | 398-407 |
| Invoicing window (single, multiple) | 17 | 410-416 |
| Sales Reports | 18 | 417 |
| Parts window, Where Used, Inventory Pieces, Inventory Transactions, Reset Material Costs | 19 | 422-447 |
| Units of Measure | 20 | 450 |
| Unit Conversions | 21 | 456 |
| Locations | 22 | 462 |
| Adjustments (adjust, transfers, pieces, transactions) | 23 | 468-478 |
| Inventory Reports | 24 | 479 |
| Purchase Orders window | 25 | 484-498 |
| Suppliers window | 26 | 502-518 |
| Purchasing Information Tables | 27 | 519 |
| Receiving window (receive, cancel receiver, return) | 28 | 522-529 |
| Purchasing Reports | 29 | 531 |
| Material Planning (Open SOs, Non-stocked, Stocked sections) | 30 | 536-564 |
| Scheduling window, Set Load Horizon, Resource Details, WO Details, Weekly Calendar, Calendar Exceptions | 31 | 577-601 |
| Planning Reports | 32 | 603 |
| Work Orders window (+ info cards, ops, materials, legs, details, costs, change status, purchasing, material availability, inventory/labor transactions, SO links, scheduling, variables) | 33 | 608-681 |
| Shop Resources (+ reset operation costs, where used, calendars) | 34 | 686-702 |
| Shop Groups | 35 | 704 |
| Shop Views | 36 | 712 |
| Labor Entry (add, reverse) | 37 | 718-722 |
| Material Issues (issue, returns, pieces, transactions) | 38 | 726-730 |
| Work Order Receipts | 39 | 732-734 |
| Employees | 40 | 738 |
| Shopfloor Reports | 41 | 743 |

TOC discrepancies noticed: the TOC titles Appendix E "Release Notes" but numbers it D-1, and omits Appendix D "Functional Flow and Transactions" (present at PDF 847-855); TOC lists ch. 45 as "Account Reports" while the section divider says "Accounting Reports". The release notes (856-863) add File > Import and custom-reports behaviour not in the TOC.

---

## 7. Notes for the N-Line rebuild
- Jobshop's accounting is a sub-ledger with export, not a GL. For the Tryton UI, map: Accounts -> account.account list (ID/Description/Type grid); Account Sets -> a posting-profile form with the 20 role fields grouped Inventory / WIP / COGS; Account Interface -> period close + journal batch export; Terms -> account.invoice.payment_term grid with the 4 age types.
- The QuickBooks-facing pieces (IIF export, account-type mapping in App. E, AR invoice / AP bill / general journal split) are the natural hand-off point to the QuickBooks Desktop emulation.
- Keep the table-window row-state glyphs (+, check, red X) and explicit Save; keep "..." lookups with F9 and wildcard search; keep Browse First/Prev/Next/Last with Ctrl+F/L/N/E. Users coming from Jobshop rely on these.
