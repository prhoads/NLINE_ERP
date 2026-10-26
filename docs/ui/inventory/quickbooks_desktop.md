# QuickBooks Desktop screen inventory

Source: *Mastering QuickBooks Desktop Level 1* learning manual (Real World Training, 2021), `C:\Users\qodbctask\Downloads\QBD-Level1-Manual-2021.pdf`. Screens shown are QuickBooks Desktop Pro/Premier 2021 with the "Buildem, Inc." sample company.

Purpose: a reference for rebuilding the N-Line ERP (Tryton) web UI so QuickBooks Desktop users find familiar screens, layouts and workflows.

**Page numbers** are the manual's printed page numbers ("p. 52"). PDF page = printed page + 8.

**Sources.** Anything not shown or described in the manual is marked **(general knowledge)**, meaning it comes from general QuickBooks Desktop knowledge. Level 1 is thin in places. It does not cover Estimates, Sales Orders, Item Receipts, Registers, Transfer Funds, Build Assemblies, the Vendor Credit apply flow beyond Pay Bills, or QuickZoom (see "Gaps").

---

## 1. Summary table

| Screen | Area | Purpose | Pages |
|---|---|---|---|
| Home Page (workflow diagram) | Navigation | Flowchart launcher for the common transaction workflows | 12, 16, 48, 52, 60, 61, 96, 153 |
| Insights tab (on Home window) | Navigation / dashboard | P&L, Income and Expense dashboard panels | 38 |
| Icon Bar (left / top) | Navigation | Shortcuts, open windows, balances, search | 12, 164 |
| Menu bar and shortcut menus | Navigation | Full access to every feature | 13 |
| Customer Center | Center | Customers & Jobs list with detail and transaction history | 13, 18, 48-50, 80-81 |
| New/Edit Customer | List entry | Customer master record (tabbed) | 49-50, 90 |
| New/Edit Job | List entry | Job (project) under a customer | 50 |
| Vendor Center | Center | Vendor list, detail and transactions | 96-97 |
| New/Edit Vendor | List entry | Vendor master record (tabbed) | 97 |
| Employee Center (Employees / Transactions / Payroll tabs) | Center | Employee list; Payroll Center sub-tab | 135, 131, 148, 153 |
| New/Edit Employee | List entry | Employee master and payroll setup (tabbed) | 135-138 |
| Inventory Center | Center | Inventory/assembly item list with detail and transactions | 192 |
| Report Center | Center / reports | Browse, preview and run reports; Memorized/Favorites/Recent tabs | 164, 172 |
| Bank Feeds Center | Center / banking | Online banking accounts, send items, messages | 112, 115 |
| Bank Feeds Transactions List | Banking | Match or add downloaded bank transactions | 116 |
| Add Rules Details (Bank Feed rule) | Banking | Rule for auto-categorising downloaded transactions | 116 |
| Chart of Accounts | Menu list | GL account list | 18, 28, 32-34 |
| Add New Account: Choose Account Type | List entry | Account-type picker wizard step | 32, 105 |
| Add New Account / Edit Account | List entry | GL account master | 32-33, 105 |
| Item List | Menu list | Items & Services list | 40, 43 |
| New/Edit Item (per type) | List entry | Item master (Service, Inventory Part, Non-inventory, Sales Tax Item, Sales Tax Group, etc.) | 42-44, 87-89 |
| Other Names List / Change Type | Menu list | Miscellaneous names; move to Customer/Vendor/Employee | 20-21 |
| Sales Tax Code List / Edit Sales Tax Code | Menu list | Taxable/non-taxable codes | 88 |
| Templates List | Menu list | Form templates: duplicate, download | 76 |
| Memorized Transaction List | Menu list | Recurring/memorized transactions | 84 |
| Memorized Report List | Menu list | Saved reports and report groups | 173 |
| Payroll Item List / Add-Edit Payroll Item wizard | Menu list | Payroll items (wages, deductions, taxes) | 133-134 |
| Create Invoices | Sales form | Bill a customer on account (A/R) | 40, 52-53, 125-126, 144 |
| Send Invoice (e-mail) | Dialog | E-mail a form as PDF | 53 |
| Select Invoices to Print / Print Invoices | Print dialog | Batch print forms | 54 |
| Receive Payments | Sales form | Record customer payment against open invoices | 55, 124 |
| Manage Bounced Check / Bounced Check Summary | Wizard | Reverse a bad customer check and record fees | 122 |
| Payments to Deposit | Dialog | Choose Undeposited Funds items to deposit | 56 |
| Make Deposits | Banking form | Bank deposit of payments and other funds | 56, 63 |
| Enter Sales Receipts | Sales form | Cash sale (paid at time of sale) | 60 |
| Customer A/R register (Statement Charges) | Register | Enter statement charges directly in A/R | 61-62 |
| Create Statements | Dialog | Generate/print/e-mail customer statements | 66-68, 123 |
| Print Preview | Dialog | Preview printed forms/statements | 67-68 |
| Create Credit Memos/Refunds | Sales form | Customer credit for prior sale | 64-65 |
| Apply Credit to Invoices (from credit memo) | Dialog | Apply credit memo to open invoices | 65 |
| Issue a Refund | Dialog | Refund a credit by check, cash or card | 66 |
| Apply Credits (from invoice) | Dialog | Apply available credits/deposits to an invoice | 125 |
| Income Tracker | Tracker | A/R dashboard: Unbilled / Unpaid / Paid | 58 |
| Invoice for Time & Expenses | Dialog | Pick customer:job with billable time/costs | 143 |
| Choose Billable Time and Costs (+ Options) | Dialog | Select billables to pull onto an invoice | 144 |
| Create Estimates | Sales form | Quote/estimate (Home Page icon only in manual) | 16 (icon) (general knowledge) |
| Create Sales Orders | Sales form | Order/backorder tracking (Premier+) | 5, 74 (general knowledge) |
| Enter Bills | Purchase form | Record a vendor bill (A/P); Credit mode = vendor credit | 98, 107, 194 |
| Bill Tracker | Tracker | A/P dashboard: Unbilled POs / Unpaid / Paid | 99 |
| Pay Bills | Purchase form | Select and pay open bills | 101, 107-108, 195 |
| Discount and Credits | Dialog | Apply vendor credits/discounts to a bill payment | 107-108 |
| Assign Check Numbers / Payment Summary | Dialog | Number and confirm bill-payment checks | 101, 108 |
| Select Checks to Print / Print Checks | Print dialog | Batch print checks (voucher/standard/wallet) | 102 |
| Write Checks | Banking form | Direct check/debit payment (no A/P) | 14, 103-104, 113, 119 |
| Enter Credit Card Charges | Banking form | Credit card purchase or refund | 106 |
| Create Purchase Orders | Purchase form | Order goods from a vendor | 193 |
| Open Purchase Orders (Receive) | Dialog | Choose PO(s) when receiving | 194 |
| Receive Inventory (with/without bill), Enter Bills Against Inventory | Purchase forms | Receive PO items | 16 (icons), 194 |
| Adjust Quantity/Value on Hand | Inventory form | Inventory count/value adjustment | 196 |
| Account registers (Check Register, A/R, etc.) | Register | Two-line ledger view per balance-sheet account | 18, 61 (general knowledge) |
| Make General Journal Entries | Accounting form | Debit/credit journal entry | 35-36 |
| Manage Sales Tax | Hub window | Sales tax setup, reports, adjust, pay | 86-94 |
| Sales Tax Adjustment | Dialog | Increase/decrease tax due | 93 |
| Pay Sales Tax | Dialog | Pay tax agencies | 94 |
| Begin Reconciliation | Banking dialog | Statement header for bank reconcile | 117 |
| Reconcile - (Account) | Banking form | Tick cleared items | 117 |
| Locate Discrepancies | Banking dialog | Undo/restart reconcile, discrepancy reports | 118 |
| Payroll Center: Pay Employees tab | Payroll | Run scheduled/unscheduled payroll | 148 |
| New Payroll Schedule | Payroll dialog | Define pay frequency and dates | 131 |
| Enter Payroll Information (step 1) | Payroll wizard | Hours per employee | 148 |
| Review and Create Paychecks (step 2) | Payroll wizard | Gross-to-net review | 149 |
| Review Paycheck / Preview Paycheck | Payroll dialog | Edit one paycheck | 149 |
| Confirmation and Next Steps (step 3) | Payroll wizard | Print paychecks/stubs | 150-152 |
| Payroll Center: Pay Liabilities tab / Liability Payment | Payroll | Pay payroll taxes and liabilities | 153-154 |
| Payroll Setup interview / Payroll Tax Form (941) | Payroll wizard | Setup interview; quarterly tax form interview | 130, 154 |
| Weekly Timesheet | Time | Enter hours per customer:job/service item | 141-142 |
| Select Timesheets to Print | Print dialog | Print timesheets | 142 |
| Report window (any report) | Reports | Report viewer with toolbar | 36-37, 45-46, 57, 69-70, 92, 109-110, 118, 120, 162, 165-170, 192, 196-197 |
| Modify Report (Customize Report) | Reports dialog | Display / Filters / Header-Footer / Fonts & Numbers | 37, 165-170 |
| Memorize Report | Reports dialog | Save report settings, optionally to a group | 172 |
| Process Multiple Reports | Reports dialog | Run/print a group of memorized reports | 174 |
| Export Report to Excel / Update Report | Reports dialog | Send report to Excel; refresh later | 175-178 |
| Company Snapshot | Dashboard | Customisable KPI/graph panels | 37-38 |
| QuickBooks Calendar / Add To Do | Productivity | Due dates, entered transactions, to-dos | 78-79 |
| Find (form Find, Simple/Advanced Find) | Search | Locate transactions | 79-81 |
| Search | Search | Global search across lists/transactions/menus | 81-82 |
| Memorize Transaction / Enter Memorized Transactions | Dialogs | Recurring transactions | 82-84 |
| Preferences (Edit > Preferences) | Settings | My/Company preferences by category | 15-16, 53, 81, 86, 100, 114, 132, 140, 143, 171, 186 |
| Forms customization: Basic Customization / Apply Design | Forms | Design (logo, fonts, colours) | 72-73 |
| Additional Customization / Layout Designer | Forms | Field/column layout of a template | 74-75 |
| Set Up Users / Add-Edit User wizard | Security | Users and access rights | 159-160, 187 |
| Set Closing Date and Password | Year-end | Lock prior periods | 186-188 |
| Accountant's Copy (Save / Import changes) | Year-end | Dividing-date copy for the accountant | 188-190 |
| Back Up / Open or Restore Company / Update QuickBooks / Product Information | Utilities | File maintenance | 10-11, 161, 180-184 |

94 rows; detailed entries are in section 3 (3.1-3.93), in a slightly different grouping. Some rows group closely related dialogs.

---

## 2. Common UI conventions

### 2.1 Home Page (workflow diagram) - p. 12, 16, 48, 52, 60, 61, 96, 153
- **How opened:** Icon Bar > My Shortcuts > **Home**. It opens by default at startup.
- **Layout:** a window with two tabs, **Home Page** and **Insights**. The main area holds stacked **flow panels**: **VENDORS**, **CUSTOMERS** and **EMPLOYEES**. A right column holds **COMPANY** and **BANKING** panels. Each panel shows icons joined by grey arrows that show the order of work.
  - VENDORS: Purchase Orders -> Receive Inventory -> Enter Bills Against Inventory; Enter Bills -> Pay Bills; Manage Sales Tax.
  - CUSTOMERS: Estimates -> Create Invoices -> Receive Payments -> (to Banking) Record Deposits. Also Create Sales Receipts -> Record Deposits; Accept Credit Cards; Statement Charges -> Finance Charges -> Statements; Refunds & Credits. An arrow runs from Enter Bills down into Create Invoices (billable expenses).
  - EMPLOYEES: Payroll Center, Enter Time -> Pay Employees -> Pay Liabilities -> Process Payroll Forms; HR Essentials and Insurance; Turn On Payroll.
  - COMPANY: Chart of Accounts, Inventory Activities (drop-down), Items & Services, Intuit Loan Finder / Get Financing, Web and Mobile Apps, Calendar.
  - BANKING: Record Deposits, Reconcile, Write Checks, Check Register, Print Checks, Enter Credit Card Charges.
- Icons with a small down-arrow are **split buttons** that open a menu, for example Receive Inventory > *with bill / without bill*, Enter Time > *Use Weekly Timesheet / Time/Enter Single Activity*, and Invoices > *Invoice for Time & Expenses*.
- **Customisable:** Edit > Preferences > **Desktop View** > Company Preferences turns icons on or off (Invoices, Sales Receipts, Statements and Statement Charges, Enter Bills and Pay Bills). Icons tied to features (Estimates, Sales Tax, Sales Orders, Inventory, Payroll, Time Tracking) appear when those preferences are enabled (p. 16).
- **ERP takeaway:** the diagram is the main mental model for QB users. A flowchart landing page with clickable nodes per module is the strongest familiarity cue.

### 2.2 Insights tab - p. 38
- A tab on the Home window. It shows a company header with logo, name and date, then a carousel of dashboard panels with left/right arrows and dot paging. Panels include Profit & Loss (period drop-down, net income, income, expenses, bar/line chart), **Income** (Unpaid: open invoices / overdue; Paid last 30 days; "+ Create Invoice"), and **Expenses** (donut by account, "+ Create Bill"). Toolbar: print, refresh, **gear** (choose panels). Accrual/Cash toggle.

### 2.3 Icon Bar - p. 12, 164
- **View > Left Icon Bar / Top Icon Bar / Hide.** The left bar (dark) has a **Search Company or Help** box at the top. Below it, the **My Shortcuts** list: Home, My Company, Income Tracker, Calendar, Customers, Vendors, Employees, Docs, Reports, and others (user-editable). Section switchers at the bottom: **My Shortcuts**, **View Balances** (account balances), **Run Favorite Reports**, **Open Windows** (task-switcher list of open forms). A collapse arrow `<` hides it.

### 2.4 Centers (Customer / Vendor / Employee / Inventory) - p. 13, 18, 48, 80-81, 96, 135, 192
All centers share one layout:
- **Center toolbar:** New (Customer & Job / Vendor / Employee / Inventory Item) ▾, New Transactions ▾, Print ▾, Excel ▾, Word ▾, plus a center-specific button (Income Tracker, Bill Tracker, Manage Employee Information, Enter Time).
- **Left pane:** tabs **(Names) | Transactions** (Employee Center adds **Payroll**). A **View** filter drop-down (Active / All / with open balances / custom filter), a search box, and a grid **NAME | BALANCE TOTAL | ATTACH**. Jobs and sub-items are indented with a diamond.
- **Right top:** "(Customer/Vendor/Employee/Inventory) Information" panel with key fields (company, full name, terms, bill-to, phones, e-mail, website, Map | Directions links), **Attach** (paperclip) and **Edit** (pencil) buttons. A side column holds **NOTE** and **REPORTS FOR THIS ...** links (QuickReport, Open Balance, Show Estimates, Customer Snapshot; for vendors Order 1099 Forms / Order Checks; for employees Payroll Summary, Paid Time Off, Employee Pay history).
- **Right bottom:** tabs **Transactions | Contacts | To Do's | Notes | Sent Email**. The Transactions grid has filters SHOW (All Transactions / type), FILTER BY, DATE, and columns **TYPE | NUM | DATE | ACCOUNT | AMOUNT**. Footer buttons: **Manage Transactions ▾** (New / Edit / Delete...) and **Run Reports ▾**.
- **Double-click** a transaction row to open the form. Double-click a name to open Edit.
- **Transactions tab** (left) lists transaction types (Estimates, Invoices, Payments...). Pick one to see every transaction of that type with filters (p. 81).

### 2.5 Menu-based list windows (Chart of Accounts, Item List, Class, Sales Tax Code, Templates, Memorized, Payroll Item...) - p. 18, 22-26, 40
- **Top:** "Look for ... [ ] in [All fields ▾] **Search** **Reset** [ ] Search within results" (Item List and Chart of Accounts).
- **Grid** with sortable column headings. A **diamond** column on the left is used to drag rows (reorder, or indent to make a sub-account/sub-item). Clicking the top-left diamond restores the default order.
- **Bottom button bar of drop-down menus:** **(List Name) ▾** (New, Edit, Delete, Make Inactive, Re-sort List, Customize Columns, Use, Find in transactions, Print List), **Activities ▾** (related transactions, e.g. Write Checks, Make Deposits, Create Invoices), **Reports ▾** (QuickReport and list reports), **Excel ▾**, **Attach**, and a **[ ] Include inactive** checkbox.
- **Right-click** on a row shows the same commands as the (List Name) button (p. 13).
- **Add from form:** type a new name in any drop-down, press Tab, choose **Quick Add** or **Set Up** (p. 22).
- **Merge:** rename an entry to an existing name, then confirm Merge (p. 24).
- **Ctrl+U** uses the selected item, **Ctrl+Q** runs a QuickReport, **Ctrl+R** opens the register (p. 198).

### 2.6 Transaction form anatomy (ribbon forms) - p. 14, 52, 98, 103
- **Ribbon tabs:** **Main | Formatting | Send/Ship | Reports** (Sales Receipt adds **Payments**; Receive Payments has Main | Reports | Payments).
- **Main ribbon groups:** ◄ ► **Previous/Next arrows** and **Find**; **New**, **Save**, **Delete ▾** (Delete / Void), **Create a Copy**, **Memorize**, **Mark As Pending**; **Print ▾**, **Email ▾**, [ ] Print Later, [ ] Email Later; **Attach File**; then form-specific buttons (Add Time/Costs, Apply Credits, Receive Payments, Create a Batch, Refund/Credit; Select PO, Enter Time, Clear Splits, Recalculate, Batch Transactions, Reorder Reminder, Order Checks, Pay Bill).
- **Header band** (dark): CUSTOMER:JOB / VENDOR ▾, CLASS ▾, TEMPLATE ▾.
- **Body:** a large form title ("Invoice", "Bill", "Sales Receipt", "Purchase Order", "Credit Memo"), header fields (date, number, address blocks, terms, P.O. No.), a line-item **grid**, footer totals, Memo, Customer Tax Code.
- **Bottom buttons:** **Save & Close**, **Save & New** (default, highlighted), **Clear**. When editing a saved transaction, Clear becomes **Revert** (p. 14).
- **Right-hand history panel:** a collapsible `<` pane on sales and purchase forms. It shows the customer/vendor summary (open balance, active estimates, recent transactions, notes) and the selected transaction's related links. Toggle with the arrow at the right edge. **Ctrl+H** opens the transaction history (p. 198) **(panel contents: general knowledge; the manual only shows the collapsed tab)**.
- **Behaviour of the arrows:** ► = record and open a new blank form; ◄ = record and display the prior transaction (p. 14). Same as Previous/Next in older-style forms (Make Deposits, Timesheet, Adjust Inventory use a text toolbar: ◄ Previous ► Next, Save, Print ▾, Payments, History, Attach).
- **Expenses / Items tabs** on purchase forms (Enter Bills, Write Checks, Credit Card Charges, Liability Payment). Each tab shows its running total in the tab label ("Expenses $1,000.00 | Items $0.00").

### 2.7 Keyboard and QuickZoom - p. 20, 183, 198
- Ctrl+1 / F2: Product Information (version, list totals). Ctrl+F: Find. Ctrl+H: History. Ctrl+M: Memorize. Ctrl+O / Ctrl+V: copy/paste transaction in a register. Ctrl+Q: QuickReport. Ctrl+R: register. Ctrl+U: use list item. Tab / Shift+Tab: next/prior field. Ctrl+Tab: next open window. Esc: cancel/close. Ctrl+Z: undo field. Up/Down: move lines in the grid. Space: toggle checkmark. Ctrl+Up: scroll list entries while in a form. Alt+Down: open drop-down list.
- **Date and number fields:** `+`/`-` increment/decrement; **T** today, **M**/**H** start/end of month, **Y**/**R** start/end of year.
- **QuickZoom (general knowledge; trademark noted on p. 2 only):** in any report, the pointer becomes a magnifying-glass "Z" over amounts. Double-clicking drills from a summary report to a detail (transaction) report, and from a detail row to the original form. This drill-down chain (summary -> detail -> form) is how QB users investigate numbers and should be reproduced.

### 2.8 Other conventions
- **Three menu types:** the menu bar, right-click shortcut menus, and the buttons at the bottom of lists (p. 13).
- **Drop-down + Quick Add** everywhere names and items are chosen.
- **Single-user vs Multi-user mode:** some list and preference changes need single-user mode (p. 161).
- **Preferences** come in two tabs everywhere: **My Preferences** (per user) and **Company Preferences** (admin only).

---

## 3. Screen entries

### Navigation and dashboards

#### 3.1 Home Page
See 2.1. Pages 12, 16, 48, 52, 60, 61, 96, 153.

#### 3.2 Insights tab
See 2.2. Page 38.

#### 3.3 Icon Bar
See 2.3. Pages 12, 164.

#### 3.4 Company Snapshot
- **Opened:** Company > Company Snapshot.
- **Purpose:** customisable dashboard of KPI panels and graphs.
- **Layout:** tabs **Company | Payments | Customer**. Toolbar: Add Content ▾, Restore Default, "How do I customize this page?", Print, Search. Add Content opens a carousel strip of available panels (Customers Who Owe Money, Top Vendors by Expense, Vendors to Pay, Reminders, Income and Expense Trend, Prev Year Income Comparison...) with **Add** buttons and paging "1-12 of 12". **Done** closes the strip. The panels below are graphs or small grids (e.g. Customers Who Owe Money: CUSTOMER | DUE DATE | AMT DUE, with a Receive Payment link). Each panel has a ▾ menu (Print, Print Preview) and an **X** to remove it. Drag a panel header to reposition it.
- **Workflow:** 1. Open. 2. Add Content. 3. Browse with the arrows and click Add. 4. Done. 5. Drag panels and set panel options.
- **Links:** panel rows drill to the customer or transaction (general knowledge).
- **Pages:** 37-38.

#### 3.5 QuickBooks Calendar / Add To Do
- **Opened:** Home > Calendar icon (Company panel), or Icon Bar > Calendar.
- **Purpose:** shows per day what is due (bills, invoices, to-dos) and what was entered.
- **Layout:** toolbar with ◄ ► month, **Today**, day/week/month view toggles, "Select a date", SHOW (All Transactions ▾). Month grid with "Entered (n)" / "Due (n)" counts per day. Right side panel: **Upcoming: Next 7 days** and **Due: Past 60 days**, each grouped TO DO / TRANSACTIONS / INVOICES with amount and days. Bottom pane: transactions entered for the selected day (Checks: name, amount, number). **Add To Do** link.
- **Add To Do dialog:** TYPE (Task, Call...), PRIORITY, [ ] WITH (Customer/Vendor/Employee + name), DUE date, TIME, DETAILS, STATUS (Active/Done). Buttons OK, Cancel, Help.
- **Workflow:** Calendar > Add To Do > Type, Priority, Due > Details, Status > OK.
- **Pages:** 78-79.

#### 3.6 Search
- **Opened:** Edit > Search, or the Icon Bar search box.
- **Layout:** search field with a magnifier. Left: **Show Results From** tree (All Results (n) > Transactions > Checks, Inventory Adjustments, Invoices, Item Receipts, Purchase Orders; Customers; Vendors; Accounts; Items; Employees; Others). Right: result cards (type, number, to/for, amount, date, due date, bill-to). "Update search information" link.
- Preferences > Search sets the index update schedule.
- **Pages:** 81-82.

#### 3.7 Find (form Find / Simple / Advanced)
- **Opened:** the **Find** button on a form ribbon (context-specific, e.g. "Find Invoices"), or Edit > Find (Ctrl+F) with **Simple** and **Advanced** tabs.
- **Form Find:** Customer:Job, Date from-to, Invoice #, Amount. Buttons Find, Cancel, Advanced.
- **Simple Find:** Transaction Type, Customer:Job, Date, Number, Amount. Results grid at the bottom. **Go To** opens the selected transaction. **Advanced (general knowledge):** filter list (any report filter) plus a results grid with **Go To**, **Report** and **Export**.
- **Pages:** 79-81.

### Centers

#### 3.8 Customer Center
- **Opened:** Icon Bar > Customers; Customers > Customer Center.
- **Purpose:** master list of customers and jobs with full transaction history.
- **Layout:** see 2.4. Toolbar: **New Customer & Job ▾** (New Customer, Add Job, Add Multiple Customer:Jobs), **New Transactions ▾** (Estimates, Invoices, Sales Receipts, Statement Charges, Receive Payments, Credit Memos/Refunds), Print ▾, Excel ▾, Word ▾, **Income Tracker**. Left grid: NAME | BALANCE TOTAL | ATTACH, with jobs and sub-jobs indented beneath customers. View drop-down: Active Customers / All / with open balances / custom filter. Right: Customer Information (Company Name, Full Name, Terms, Bill To, Main/Work Phone, Mobile, Main Email, Website, Map | Directions). Side: NOTE, REPORTS FOR THIS CUSTOMER (QuickReport, Open Balance, Show Estimates, Customer Snapshot). Bottom tabs Transactions (SHOW / FILTER BY / DATE; TYPE | NUM | DATE | ACCOUNT | AMOUNT), Contacts, To Do's, Notes, Sent Email. Footer: Manage Transactions ▾, Run Reports ▾.
- **Workflow (add):** 1. Customers & Jobs tab. 2. New Customer & Job ▾ > New Customer. 3. Fill in tabs. 4. OK.
- **Delete:** Edit > Delete Customer:Job. **Inactive:** Edit, then tick "Customer is inactive".
- **Links:** double-click a transaction to open the form. QuickReport and Open Balance open reports.
- **Pages:** 13, 18, 48-50, 80-81, 90.

#### 3.9 New / Edit Customer
- **Opened:** Customer Center > New Customer, or the Edit (pencil) button. Also Quick Add > Set Up from a form.
- **Layout:** header CUSTOMER NAME, CURRENT BALANCE (opening balance on New), "How do I adjust the current balance?". Vertical tabs on the left:
  - **Address Info:** Company Name, Full Name (Mr./First/M.I./Last), Job Title, Main Phone, Alt. Phone, Mobile, Fax (labels are drop-downs), Main Email, CC Email, Website, Other 1. ADDRESS DETAILS: Invoice/Bill To (edit pencil), **Copy >>**, Ship To ▾ (multiple, + / edit / delete), [x] Default shipping address.
  - **Payment Settings:** Account No., Credit Limit, Payment Terms, Price Level, Preferred Delivery Method, Preferred Payment Method, Add Online Payment Link to Invoices; Credit Card Information (number, exp date, name on card, address, ZIP).
  - **Sales Tax Settings:** Tax Code, Tax Item, Resale No. (p. 90).
  - **Additional Info:** Customer Type, Rep, Custom Fields.
  - **Job Info** (on customers without jobs, general knowledge).
- **Buttons:** OK, Cancel, Help; [ ] Customer is inactive.
- **Pages:** 49-50, 90.

#### 3.10 New / Edit Job
- **Opened:** Customer Center > select customer > New Customer & Job ▾ > Add Job.
- **Layout:** JOB NAME, CUSTOMER ▾ (parent), CURRENT BALANCE. Tabs Address Info, Payment Settings, Additional Info, **Job Info** (Job Description, Job Type, Job Status (Pending/Awarded/In progress/Closed/Not awarded), Start Date, Projected End Date, End Date).
- **Purpose:** track income and expense per project. Jobs appear indented under the customer as "Customer:Job".
- **Pages:** 50.

#### 3.11 Vendor Center
- **Opened:** Icon Bar > Vendors; Vendors > Vendor Center.
- **Layout:** like the Customer Center. Toolbar: **New Vendor ▾**, **New Transactions ▾** (Enter Bills, Pay Bills, Purchase Orders, Receive Items & Enter Bill, Receive Items, Enter Bill for Received Items), Print ▾, Excel ▾, Word ▾, **Bill Tracker**. Left: Vendors | Transactions tabs; NAME | BALANCE TOTAL | ATTACH. Vendor Information: Company Name, Full Name, Vendor Type, Account No., Terms, Billed From, Main/Alt Phone, Fax, Main Email. Side: QuickReport, Open Balance, **Order 1099 Forms**, **Order Checks**. Bottom tabs are the same as the Customer Center.
- **Pages:** 96-97.

#### 3.12 New / Edit Vendor
- **Layout:** VENDOR NAME, OPENING BALANCE / AS OF. Tabs **Address Info** (company, name, phones, e-mail, Billed From, Shipped From), **Payment Settings** (Account No., Payment Terms, Print Name on Check As, Credit Limit, Billing Rate Level), **Tax Settings** (Vendor Tax ID, [ ] Vendor eligible for 1099), **Account Settings** (pre-fill expense accounts), **Additional Info** (Vendor Type, Custom Fields).
- The manual shows only the Address Info and Payment Settings screenshots. The other tabs are **(general knowledge)**.
- **Pages:** 97.

#### 3.13 Employee Center
- **Opened:** Icon Bar > Employees; Employees > Employee Center. The Payroll Center is the **Payroll** tab of the same window (Employees > Payroll Center, or the Home > Payroll Center icon).
- **Layout:** toolbar: New Employee..., Manage Employee Information ▾, Print ▾, Enter Time ▾, Excel ▾, Word ▾. Left tabs **Employees | Transactions | Payroll**; grid NAME | ATTACH; Active Employees filter. Right: Employee Information (Full Name, Address, Main/Alt Phone, Mobile, Fax, Main Email, Map | Directions); NOTE; Reports: QuickReport, Payroll Summary, Paid Time Off, Employee Pay history.
- **Pages:** 135.

#### 3.14 New / Edit Employee
- **Layout:** INFORMATION FOR (name). Vertical tabs:
  - **Personal:** Legal Name (title/first/M/last), Print on Checks As, SSN, Gender, Date of Birth, Marital Status, U.S. Citizen, Ethnicity; Disability, I-9 Form, Military panels.
  - **Address & Contact**.
  - **Additional Info** (custom fields).
  - **Payroll Info:** pay frequency, payroll schedule, Earnings grid (item, rate), Additions/Deductions/Company Contributions grid, buttons **Taxes...** (Federal / State / Other tabs) and **Sick/Vacation...**.
  - **Employment Info:** hire date, release date, type.
  - **Workers' Comp**.
- **Buttons:** OK, Cancel, Help; [ ] Employee is inactive.
- **Pages:** 135-138.

#### 3.15 Inventory Center
- **Opened:** Vendors > Inventory Activities > Inventory Center; Home > Inventory Activities ▾.
- **Layout:** toolbar New Inventory Item ▾, New Transactions ▾, Print ▾, Excel ▾. Left: filter "Active Inventory, Assembly"; grid NAME | PRICE. Right: **Inventory Information** (Name, Description, Preferred Vendor, Unit of Measure, Mfg Part No, Average Cost, Cost, Sales Price; Reorder Pt (Min), Max, Quantity On Hand, Quantity on Sales Orders, Quantity on POs, Reserved for Assemblies, Quantity Available). Bottom tabs Transactions (TYPE | NUM | DATE | ACCOUNT | AMOUNT) and Notes. Footer: Manage Transactions ▾, Run Reports ▾.
- **Pages:** 192.

#### 3.16 Report Center
- **Opened:** Icon Bar > Reports; Reports > Report Center.
- **Layout:** top tabs **Standard | Memorized | Favorites | Recent | Contributed** and a Search box. View toggles (carousel / list / grid). Left: report groups (Company & Financial, Customers & Receivables, Sales, Jobs Time & Mileage, Vendors & Payables, Purchases, Inventory, Employees & Payroll, Banking, Accountant & Taxes, Budgets & Forecasts, List). Centre: a carousel of report thumbnails with a sample preview, title and a one-line question ("What checks have been written..."). Under the preview: **Dates** ▾, from/to, and icons **Run**, **Fave**, **Help**.
- **Workflow:** 1. Pick a group. 2. Browse. 3. Set dates. 4. Run.
- **Memorized tab:** groups on the left, reports on the right, Run (p. 172).
- **Pages:** 164, 172.

### Lists

#### 3.17 Chart of Accounts
- **Opened:** Home > Chart of Accounts; Lists > Chart of Accounts (Ctrl+A, general knowledge).
- **Layout:** "Look for account name or number" + Search, Reset. Grid: diamond | NAME | ⚡ (online/bank feed) | TYPE | BALANCE TOTAL | ATTACH. Sub-accounts are indented. Bottom: **Account ▾**, **Activities ▾**, **Reports ▾**, **Attach**, [ ] Include inactive.
- **Actions:** double-click a balance-sheet account to open its **register**. Double-click an income or expense account to open a QuickReport (general knowledge). Drag the diamond to make a sub-account (p. 34). Five account levels are supported.
- **Pages:** 18, 28, 32-34.

#### 3.18 Add New Account: Choose Account Type
- **Layout:** radio groups: "Categorize money your business earns or spends" (Income, Expense) and "Or, track the value of your assets and liabilities" (Fixed Asset, Bank, Loan, Credit Card, Equity). "Other Account Types <select> ▾" covers A/R, Other Current Asset, Other Asset, A/P, Other Current Liability, Long Term Liability, COGS, Other Income and Other Expense. A right panel explains the selected type with examples. Buttons **Continue**, Cancel; "Help me choose the right account type".
- **Pages:** 32, 105. Account-type table on p. 31.

#### 3.19 Add New Account / Edit Account
- **Layout:** Account Type ▾, Account Name, [ ] Subaccount of ▾. OPTIONAL: Description, Note, (Bank: Account No., Routing No.), Tax-Line Mapping, **Enter Opening Balance...**. Buttons **Save & Close**, **Save & New**, Cancel.
- **Pages:** 32-33, 105.

#### 3.20 Item List
- **Opened:** Home > Items & Services; Lists > Item List.
- **Layout:** Look for [ ] in [All fields ▾] Search / Reset / [ ] Search within results. Grid: NAME | DESCRIPTION | TYPE | ACCOUNT | TOTAL QUANTITY ON HAND | PRICE | ATTACH (sub-items indented). Bottom: **Item ▾**, **Activities ▾**, **Reports ▾**, **Excel ▾**, **Attach**, [ ] Include inactive.
- **Pages:** 40, 43.

#### 3.21 New / Edit Item
- **Opened:** Item List > Item ▾ > New / Edit Item.
- **Layout (Inventory Part):** TYPE ▾ with a description. Item Name/Number, [ ] Subitem of ▾, Manufacturer's Part Number. UNIT OF MEASURE (Enable...). PURCHASE INFORMATION: Description on Purchase Transactions, Cost, COGS Account, Preferred Vendor. SALES INFORMATION: Description on Sales Transactions, Sales Price, Tax Code, Income Account. INVENTORY INFORMATION: Asset Account, Reorder Point (Min/Max), On Hand, Average Cost, On P.O. (and On Sales Order). Right buttons: OK, Cancel, Notes, Custom Fields, Spelling; [ ] Item is inactive.
- **Variants:**
  - Service and Non-inventory have a "[ ] This service is used in assemblies or is performed by a subcontractor or partner" checkbox, which splits purchase and sales info (p. 44).
  - **Sales Tax Item:** name, description, tax rate %, Tax Agency (vendor) (p. 87).
  - **Sales Tax Group:** grid TAX ITEM | RATE | TAX AGENCY | DESCRIPTION with a Group Rate total (p. 88).
- **Item types (p. 42):** Service, Inventory Part, Non-inventory Part, Inventory Assembly, Other Charge, Subtotal, Group, Discount, Payment, Sales Tax Item, Sales Tax Group.
- **Pages:** 42-44, 87-89.

#### 3.22 Other Names List / Change Type
- **Opened:** Lists > Other Names List. Bottom button Other Names ▾ > Edit Other Name > **Change Type** (radio Customer / Vendor / Employee) > OK. The move is permanent.
- **Pages:** 20-21.

#### 3.23 Sales Tax Code List / Edit Sales Tax Code
- **Opened:** Manage Sales Tax > Open Sales Tax Code List; Lists > Sales Tax Code List.
- **List grid:** CODE | DESCRIPTION | TAXABLE (✓). Bottom: Sales Tax Code ▾, Activities ▾, Reports ▾, [ ] Include inactive.
- **Edit dialog:** Sales Tax Code (max 3 chars), Description, (•) Taxable / Non-Taxable, [ ] inactive. OK/Cancel.
- **Pages:** 88.

#### 3.24 Templates List
- **Opened:** Lists > Templates. Bottom **Templates ▾** button: New, Edit, Duplicate (opens a Select Template Type dialog), Delete, Make Inactive, **Download Templates** (opens a web gallery), Import/Export.
- **Pages:** 76.

#### 3.25 Memorized Transaction List
- **Opened:** Lists > Memorized Transaction List (Ctrl+T, general knowledge). Grid: Transaction Name | Type | Source Account | Amount | Frequency | Auto | Next Date. Bottom button **Memorized Transaction ▾**: New Group, Edit Memorized Transaction (opens the Schedule dialog), Delete, Enter Transaction.
- Double-click opens the transaction. Edit it, then Edit > Memorize > **Replace**, then Esc and No, so the change is saved without posting.
- **Pages:** 84.

#### 3.26 Memorized Report List
- **Opened:** Reports > Memorized Reports > Memorized Report List. Bottom **Memorized Report ▾**: New Group, Edit, Delete, Import/Export Template. Drag the diamond to put a report under a group.
- **Pages:** 173.

#### 3.27 Payroll Item List / Add-Edit Payroll Item
- **Opened:** Employees > Manage Payroll Items > View/Edit Payroll Item List, or > New Payroll Item.
- **Wizard:** EZ Setup / Custom Setup > item type (Compensation, Insurance Benefits, Retirement Benefits, Paid Time Off, Other Additions, Other Deductions, Custom) > successive pages > Finish.
- **Pages:** 133-134.

### Customers and sales

#### 3.28 Create Invoices
- **Opened:** Home > Create Invoices (Invoices ▾); Customers > Create Invoices (Ctrl+I, general knowledge); Customer Center > New Transactions.
- **Purpose:** bill a customer who pays later (debits A/R).
- **Layout:**
  - Ribbon Main (2.6) plus **Add Time/Costs**, **Apply Credits**, **Receive Payments**, **Create a Batch**, **Refund/Credit**.
  - Header band: CUSTOMER:JOB ▾, (CLASS ▾), TEMPLATE ▾ (Intuit Service / Product / Professional / custom).
  - Body: title **Invoice**; DATE; INVOICE #; BILL TO; (SHIP TO on product template); P.O. NO.; TERMS ▾ (plus REP, SHIP, VIA, F.O.B. on the product template).
  - Grid: **ITEM | QUANTITY | DESCRIPTION | RATE | (CLASS) | AMOUNT | TAX**. Time-billed invoices add SERVICED date.
  - Footer: online-payment toggle ("Your customer can't pay this invoice online / Turn on"); CUSTOMER MESSAGE ▾; TAX ▾ (sales tax item) and rate %; totals **TAX**, **TOTAL**, **PAYMENTS APPLIED**, **BALANCE DUE**; MEMO; CUSTOMER TAX CODE ▾.
  - Right: collapsible history panel.
  - Buttons: Save & Close, Save & New, Clear/Revert.
- Subtotal, Discount and Group items are used inline. A Discount line applies to the line above it or to a Subtotal (p. 53 product invoice).
- **Workflow:** 1. Create Invoices. 2. Pick Customer:Job (address, terms and tax fill in). 3. Choose template. 4. Enter lines. 5. Optionally Print Later or Email. 6. Save & Close/New.
- **Links:**
  - Apply Credits opens 3.42.
  - Add Time/Costs opens 3.45.
  - Receive Payments opens 3.31 for this invoice.
  - Email opens 3.29.
  - Formatting tab opens 3.88-3.89.
  - Reports tab: Transaction History, Transaction Journal (general knowledge).
- **Pages:** 40, 52-53, 125-126, 144.

#### 3.29 Send Invoice (e-mail)
- **Layout:** FROM ▾, TO, Cc/Bcc, ATTACH (generated PDF with size, plus paperclip for more), TEMPLATE ▾, SUBJECT, BODY (from template), Check Spelling, Send. The e-mail template is set in Preferences > Send Forms.
- **Pages:** 53.

#### 3.30 Select Invoices to Print / Print Invoices
- **Opened:** File > Print Forms > Invoices (and Sales Receipts, Credit Memos, Checks, Paychecks, Pay Stubs, Labels...).
- **Select dialog:** A/R Account ▾; "There are N invoices to print for $X"; grid ✓ | DATE | TYPE | NO. | CUSTOMER | TEMPLATE | AMOUNT. Buttons OK, Cancel, Help, Select All, Select None, Print Labels.
- **Print dialog:** tabs Settings | Fonts. Printer name, Options..., Printer type; Print on: Intuit Preprinted / Blank paper / Letterhead; [ ] Do not print lines; copies; Collate. Buttons Print, Cancel, Help, Preview, Align. Then a "Print ... - Confirmation" dialog to mark reprints.
- **Pages:** 54.

#### 3.31 Receive Payments
- **Opened:** Home > Receive Payments; Customers > Receive Payments; Receive Payments button on an invoice.
- **Purpose:** record a customer payment and apply it to open invoices.
- **Layout:**
  - Ribbon Main: Find, New, Delete, Print ▾, Email ▾, Attach File, **Look up Customer/Invoice**, **Un-Apply Payment**, **Discounts And Credits**, **Record Bounced Check**, [ ] Process payment, Add Credit Card Processing. Other ribbon tabs: Reports, Payments.
  - Body: title **Customer Payment**; CUSTOMER BALANCE (top right); RECEIVED FROM ▾; PAYMENT AMOUNT; DATE; CHECK #/REFERENCE #. Payment method tiles: **CASH | CHECK | (card) | e-CHECK | MORE ▾**. Link "Where does this payment go?".
  - Grid: **✓ | DATE | (JOB) | NUMBER | ORIG. AMT. | AMT. DUE | PAYMENT**, with a Totals row.
  - Footer right: **AMOUNTS FOR SELECTED INVOICES**: Amount Due, Applied, Discount and Credits Applied.
  - Footer left on under/over payment: **UNDERPAYMENT $x**, "When finished: (•) Leave this as an underpayment / ( ) Write off the extra amount", View Customer Contact Information. On overpayment: "Leave the credit to be used later / Refund the amount to the customer" (p. 124).
  - MEMO. Buttons Save & Close, Save & New, Clear.
- **Workflow:** 1. Pick customer. 2. Enter amount (auto-applies oldest first) or tick invoices. 3. Choose method and reference. 4. Handle under/overpayment. 5. Save. By default the payment goes to **Undeposited Funds**.
- **Customer deposit flow (p. 123-124):** receive the payment with no invoice, "Leave the credit to be used later", then Payment Credit info box, then apply later on the invoice.
- **Links:** Discounts And Credits opens a discount/credits dialog. Record Bounced Check opens 3.32. Leads to Make Deposits.
- **Pages:** 55, 122, 124.

#### 3.32 Manage Bounced Check / Bounced Check Summary
- **Opened:** Receive Payments > find the payment with ◄ > Main > Record Bounced Check.
- **Step 1:** "What did the bank charge you?" BANK FEE, DATE, EXPENSE ACCOUNT ▾; "How much do you want to charge your customer?" CUSTOMER FEE. Back / **Next** / Finish / Help / Cancel.
- **Step 2 (summary):** lists 1. invoices marked unpaid; 2. fees deducted from the bank account; 3. invoice created for the customer fee. **Finish**.
- **Pages:** 122.

#### 3.33 Payments to Deposit
- **Opened:** Home > Record Deposits, when Undeposited Funds holds items.
- **Layout:** SELECT VIEW: View payment method type ▾ (All types / Cash and Check / card types), Sort payments by ▾. SELECT PAYMENTS TO DEPOSIT grid: ✓ | DATE | TIME | TYPE | NO. | PAYMENT METHOD | NAME | AMOUNT. "n of n payments selected for deposit", Payments Subtotal. Buttons Select All, Select None, OK, Cancel, Help.
- **Pages:** 56, 63.

#### 3.34 Make Deposits
- **Opened:** after Payments to Deposit; Banking > Make Deposits.
- **Layout:** toolbar ◄ Previous ► Next, Save, Print ▾ (Deposit Slip / Deposit Summary), **Payments** (reopens 3.33), History, Attach. Header: Deposit To ▾, Date, Memo. "Click Payments to select customer payments..." Grid: **RECEIVED FROM | FROM ACCOUNT | MEMO | CHK NO. | PMT METH. | (CLASS) | AMOUNT**. Deposit Subtotal. Cash-back section: Cash back goes to ▾, Cash back memo, Cash back amount. **Deposit Total**. Save & Close, Save & New, Clear.
- **Method 4 (lump-sum income):** add lines directly with FROM ACCOUNT = an income account. No items or sales tax are possible (p. 63).
- **Pages:** 56, 63.

#### 3.35 Enter Sales Receipts
- **Opened:** Home > Create Sales Receipts; Customers > Enter Sales Receipts.
- **Purpose:** a sale paid in full at the time of sale (no A/R).
- **Layout:**
  - Ribbon: Main | Formatting | Send/Ship | Reports | Payments. Same buttons as the invoice plus Add time/costs and [ ] Process payment.
  - Header: CUSTOMER:JOB ▾, TEMPLATE ▾.
  - Body: title **Sales Receipt**; payment tiles CASH | CHECK | CREDIT DEBIT | e-CHECK | MORE; DATE; SALE NO.; SOLD TO; CHECK NO.
  - Grid: **ITEM | DESCRIPTION | QTY | RATE | AMOUNT | TAX**.
  - Footer: TAX ▾ and rate, TOTAL; CUSTOMER MESSAGE; MEMO; CUSTOMER TAX CODE.
  - Save & Close / Save & New / Clear.
- **Workflow:** Customer, payment method, lines, Save. The receipt goes to Undeposited Funds, then Make Deposits.
- **Pages:** 60.

#### 3.36 Customer A/R register ("Customer:Job - Accounts Receivable"), Statement Charges
- **Opened:** Home > Statement Charges; Customers > Enter Statement Charges.
- **Layout:** toolbar Print..., Edit Transaction, Time/Costs..., QuickReport. Customer:Job ▾. Two-line register grid: line 1 **DATE | NUMBER | ITEM | QTY | RATE | AMT CHRG | AMT PAID | BALANCE**; line 2 **TYPE | DESCRIPTION | BILLED DATE | DUE DATE**. Existing INV/PMT rows are shown read-only. Footer: [ ] 1-Line, [ ] Show open balance, Sort by ▾, ENDING BALANCE, **Record**, **Restore**.
- **Limits:** no sales tax, discounts, group items or progress invoicing (p. 62).
- **Pages:** 61-62.

#### 3.37 Create Statements
- **Opened:** Home > Statements; Customers > Create Statements.
- **Layout:**
  - SELECT STATEMENT OPTIONS: Statement Date; ( ) Statement Period From-To / ( ) All open transactions as of Statement Date; [ ] Include only transactions over N days past due.
  - SELECT CUSTOMERS: All / Multiple / One Customer ▾ / Customers of Type / Preferred Send Method; **View Selected Customers...**
  - SELECT ADDITIONAL OPTIONS: Template ▾ + Customize; Create One Statement (Per Customer / Per Job); [ ] Show invoice item details; [ ] Print by billing zip; [ ] Print due date on transactions; "Do not create statements" with a zero balance / with a balance less than / with no account activity / for inactive customers. **Assess Finance Charges...**
  - Buttons Preview, Print, E-mail, Close, Help.
- **Statement types shown:** All Open Transactions; Activity Based with Invoice Summary; Activity Based with Invoice Item Detail.
- **Pages:** 66-68, 123.

#### 3.38 Print Preview
- Toolbar Print, Prev page, Next page, Zoom Out, Help, Close. Used for statements and forms.
- **Pages:** 67-68.

#### 3.39 Create Credit Memos/Refunds
- **Opened:** Home > Refunds & Credits; Customers > Create Credit Memos/Refunds; Refund/Credit button on an invoice.
- **Layout:** like the invoice. Ribbon: Main | Formatting | Reports, plus **Use credit to give refund** and **Use credit to apply to invoice**. Title **Credit Memo**; DATE; CREDIT NO.; CUSTOMER address; P.O. NO. Grid ITEM | DESCRIPTION | QTY | RATE | AMOUNT | TAX. Footer TAX, TOTAL, **REMAINING CREDIT**, memo, tax code.
- **On save** without choosing an action, a dialog offers: Retain as available credit / Give a refund / Apply to an invoice (general knowledge).
- **Pages:** 64-65.

#### 3.40 Apply Credit to Invoices (from a credit memo)
- **Header:** Customer:Job, Ref. No., Date, Original Amt., Remaining Credit.
- **Grid:** ✓ | DATE | JOB | NUMBER | ORIG. AMT. | AMT. DUE | AMT. APPLIED, with Totals.
- **Buttons:** Clear Selections, Done, Cancel.
- **Pages:** 65.

#### 3.41 Issue a Refund
- **Fields:** A refund is due to, Refund Amount, Date, Ref/Check No. (To Print), Issue this refund via ▾ (Check/Cash/card), Account ▾, Ending Balance, Address, Memo, [x] To be printed. OK/Cancel.
- Creates a check in the bank register.
- **Pages:** 66.

#### 3.42 Apply Credits (from an invoice)
- **Opened:** Create Invoices > Apply Credits.
- **Layout:** INVOICE header (Customer:Job, Number, Date, Original Amt.; Amount Due, Discount Used, Credits Used, Balance Due). **Credits** tab: AVAILABLE CREDITS grid ✓ | DATE | CREDIT NO. | CUSTOMER:JOB | CREDIT AMT. | AMT. TO USE | CREDIT BALANCE, Totals. Note: only unused credits applicable to this invoice are shown. Clear, Done, Cancel. (A previously-applied credits section also exists, general knowledge.)
- **Pages:** 125-126.

#### 3.43 Income Tracker
- **Opened:** Customers > Income Tracker; Icon Bar; Customer Center toolbar.
- **Purpose:** an A/R work queue.
- **Layout:**
  - Top: coloured **money bar** tiles. UNBILLED: n Estimates, n Time & Expenses (and Sales Orders). UNPAID: n Open Invoices, n Overdue. PAID: n paid last 30 days. Clicking a tile filters the grid.
  - Filters: CUSTOMER:JOB ▾, TYPE ▾, STATUS ▾, DATE ▾.
  - Grid: ☐ | CUSTOMER | TYPE | NUMBER | DATE | DUE DATE | AMOUNT | OPEN BALANCE | LAST SENT DATE | STATUS | **ACTION ▾**. Per-row actions depend on type: Receive Payment, Print, Email, Convert to Invoice, Mark as Inactive.
  - Footer: **Batch Actions ▾** (Print, Email), Manage Transactions ▾, "Showing 1-45 of 45".
- **Pages:** 58.

#### 3.44 Invoice for Time & Expenses
- **Opened:** Home > Invoices ▾ > Invoice for Time & Expenses (needs the Time & Expenses preference "Create invoices from a list of time and expenses", Premier+).
- **Layout:** Date Range From/To, Template ▾, Select All. Grid ✓ | CUSTOMER:JOB | TIME | EXPENSES | MILEAGE | ITEMS | TOTAL. [x] Let me select specific billables for this Customer:Job. Buttons Help, **Create Invoice**, Close.
- **Pages:** 143.

#### 3.45 Choose Billable Time and Costs (+ Options for Transferring Billable Time)
- **Opened:** from 3.44 or the invoice's Add Time/Costs.
- **Layout:** "Time and Costs For: (job)". Tabs **Time ($) | Expenses ($) | Mileage ($) | Items ($)**. Clear All, **Options...**. Time grid ✓ | DATE | EMPLOYEE | SERVICE ITEM | HOURS | RATE | AMOUNT | NOTES | HIDE. [ ] Print selected time and costs as one invoice item. Total billable time and costs. OK/Cancel/Help.
- **Options dialog:** (•) Enter a separate line per activity (transfer notes / item descriptions / both) or ( ) Combine activities with the same service items.
- **Pages:** 144-145.

#### 3.46 Create Estimates (general knowledge)
- **Opened:** Home > Estimates (icon shown p. 16, 24); Customers > Create Estimates. Requires the Jobs & Estimates preference.
- **Layout:** like the invoice. Title **Estimate**; ESTIMATE NO.; NAME/ADDRESS; grid ITEM | DESCRIPTION | QTY | (COST | MARKUP) | RATE | TOTAL | TAX; [ ] Mark as Inactive. Ribbon buttons **Create Invoice** (full or progress invoicing by % or by line) and **Create Sales Order** / **Create Purchase Order** (Premier).
- **Note:** the Income Tracker shows estimates as UNBILLED. The Level 1 manual has no walkthrough.

#### 3.47 Create Sales Orders (general knowledge)
- **Premier+ (p. 5)**, and in the forms-customization list (p. 74, 81). Title **Sales Order**; S.O. NO.; grid ITEM | ORDERED | DESCRIPTION | RATE | AMOUNT | INVOICED | BACKORDERED | CLOSED. Ribbon **Create Invoice**, **Create Purchase Order**. Not walked through in Level 1.

### Vendors and purchases

#### 3.48 Enter Bills
- **Opened:** Home > Enter Bills; Vendors > Enter Bills; Receive Inventory with Bill; Bill Tracker > Convert to Bill.
- **Purpose:** record a vendor bill to pay later (credits A/P). In **Credit** mode it records a vendor credit memo.
- **Layout:**
  - Ribbon Main: Find, New, Save, Delete, Create a Copy, Memorize, Print, Attach File, **Select PO**, **Enter Time**, Clear Splits, Recalculate, **Pay Bill**. Reports tab.
  - Radio **(•) Bill ( ) Credit**; [x] **Bill Received** (unchecked = item receipt).
  - Body: title **Bill**; VENDOR ▾; ADDRESS; DATE; REF. NO.; AMOUNT DUE; BILL DUE; TERMS ▾; DISCOUNT DATE; MEMO.
  - Tabs: **Expenses $x | Items $y**. Expenses grid: ACCOUNT | AMOUNT | MEMO | CUSTOMER:JOB | BILLABLE? (| CLASS). Items grid: ITEM | DESCRIPTION | QTY | COST | AMOUNT | CUSTOMER:JOB | BILLABLE? | PO NO.
  - Under the Items grid: **Clear Qtys**, **Show PO**.
  - Right history panel. Save & Close / Save & New / Clear.
- **Workflow:** Vendor (terms and due date fill from the vendor), ref/amount, split lines on Expenses/Items, Save.
- **Links:** Pay Bill opens 3.50. Select PO opens 3.57. Lines marked billable feed 3.45.
- **Pages:** 98, 107, 194.

#### 3.49 Bill Tracker
- **Opened:** Vendors > Bill Tracker; Vendor Center toolbar.
- **Layout:** money bar UNBILLED (n Purchase Orders), UNPAID (n Open Bills, n Overdue), PAID (paid last 30 days). Filters VENDOR, TYPE, STATUS, DATE, GROUP BY. Grid ☐ | VENDOR | TYPE | NUMBER | DATE | DUE DATE | STATUS | AMOUNT | OPEN BALANCE | ACTION ▾. Row actions: Convert to Bill (PO), Pay Bill, Copy, Close PO. Footer: Batch Actions ▾, Manage Transactions ▾, paging.
- **Pages:** 99.

#### 3.50 Pay Bills
- **Opened:** Home > Pay Bills; Vendors > Pay Bills; Pay Bill on a bill.
- **Layout:**
  - SELECT BILLS TO BE PAID: Show bills ( ) Due on or before [date] / (•) Show all bills; Filter By ▾ (vendor); Sort By ▾.
  - Grid: ☑ | DATE DUE | VENDOR | REF. NO. | DISC. DATE | AMT. DUE | DISC. USED | CREDITS USED | AMT. TO PAY, with Totals. **Clear Selections**.
  - DISCOUNT & CREDIT INFORMATION FOR HIGHLIGHTED BILL: Vendor, Bill Ref. No., Terms, Sugg. Discount, Number of Credits, Total Credits Available; buttons **Go to Bill**, **Set Discount**, **Set Credits**.
  - PAYMENT: Date; Method ▾ (Check / Credit Card / Online); (•) To be printed / ( ) Assign check number; Account ▾ and Ending Balance.
  - **Pay Selected Bills**, Cancel.
- **Preferences:** Bills > Automatically use credits / discounts, Default Discount Account (p. 100).
- **Workflow:** filter, tick bills, adjust amounts, set credits/discounts, choose method and account, Pay Selected Bills, then **Payment Summary** (Pay More Bills / **Print Checks** / Done).
- **Pages:** 100-101, 107-108, 195.

#### 3.51 Discount and Credits (vendor)
- **Header:** Vendor, Ref. No., Date, Original Amt.; Amount Due, Discount Used, Credits Used, Amt. To Pay.
- **Tabs:** **Discount** (discount date, terms, suggested discount, amount, discount account) and **Credits** (grid ✓ | DATE | REF. NO. | CREDIT AMT. | AMT. TO USE | CREDIT BALANCE, Totals, Clear).
- **Buttons:** Done, Cancel, Help.
- **Pages:** 107-108.

#### 3.52 Assign Check Numbers / Payment Summary
- **Assign Check Numbers:** Payment Account; ( ) Let QuickBooks assign / (•) Let me assign below; grid CHECK NO. | DATE | PAYEE | AMOUNT.
- **Payment Summary:** payment date, account, method, list of payments, Pay More Bills, Print Checks, Done.
- **Pages:** 101, 108.

#### 3.53 Select Checks to Print / Print Checks
- **Opened:** Home > Print Checks; File > Print Forms > Checks; Payment Summary > Print Checks.
- **Select dialog:** Bank Account ▾, First Check Number, "There are N checks to print for $X", grid ✓ | DATE | PAYEE | AMOUNT. Buttons Order Checks, OK, Cancel, Help, Select All, Select None.
- **Print Checks:** tabs Settings | Fonts | Partial Page. Printer name/type; CHECK STYLE (•) Voucher / Standard / Wallet with thumbnails; copies; Collate; Print company name and address; Use logo; Print Signature Image. Buttons Print, Cancel, Help, Logo, Signature. Then Print Checks - Confirmation (mark any to reprint).
- **Pages:** 102.

#### 3.54 Write Checks
- **Opened:** Home > Write Checks; Banking > Write Checks (Ctrl+W, general knowledge).
- **Purpose:** pay directly without A/P. Also used for debit-card payments (No. = "DEBIT") and online payments.
- **Layout:**
  - Ribbon Main: Find, New, Save, Delete, Create a Copy, Memorize, Print ▾, [ ] **Print Later**, [ ] **Pay Online**, Attach File, Select PO, Enter Time, Clear Splits, Recalculate, Batch Transactions, Reorder Reminder, Order Checks. Reports tab.
  - Header: BANK ACCOUNT ▾, ENDING BALANCE.
  - Check face: NO. (TO PRINT when Print Later), DATE, PAY TO THE ORDER OF ▾, $ amount, amount in words "...DOLLARS", ADDRESS, MEMO.
  - Tabs Expenses / Items with the same grids as Enter Bills.
  - Save & Close / Save & New / Clear.
- **Void/Delete:** Edit > Void Check / Delete Check (or Void Bill Pmt-Check). Voiding a prior-period check offers an automatic adjusting entry in the current period (p. 119).
- **Pages:** 14, 103-104, 113, 119.

#### 3.55 Enter Credit Card Charges
- **Opened:** Home > Enter Credit Card Charges; Banking > Enter Credit Card Charges.
- **Layout:**
  - Ribbon: Find, New, Save, Delete, Create a Copy, Memorize, Attach File, **Download Card Charges**, Select PO, Enter Time, Clear Splits, Recalculate, Batch Transactions.
  - CREDIT CARD ▾ (credit card account); (•) Purchase/Charge ( ) Refund/Credit; ENDING BALANCE.
  - Title **Credit Card Purchase/Charge**: PURCHASED FROM ▾, DATE, REF NO, AMOUNT, MEMO.
  - Expenses / Items tabs. Link "Ready to pay a credit card bill?". Save & Close / Save & New / Clear.
- **Pages:** 105-106.

#### 3.56 Create Purchase Orders
- **Opened:** Home > Purchase Orders; Vendors > Create Purchase Orders. Requires the Inventory & PO preference.
- **Layout:**
  - Ribbon Main | Formatting | Reports: Find, New, Save, Delete, Create a Copy, Memorize, **Mark As Closed**, Print, Email, [ ] Print Later, [ ] Email Later, Attach File, **Create Item Receipts**, **Select Items Receipt**.
  - Header band: VENDOR ▾, (CLASS ▾), DROP SHIP TO ▾, TEMPLATE ▾.
  - Body: title **Purchase Order**; DATE; P.O. NO.; VENDOR address; SHIP TO ▾ address; EXPECTED date.
  - Grid **ITEM | DESCRIPTION | QTY | RATE | CUSTOMER | AMOUNT** (and RCV'D, CLSD after receipts, general knowledge).
  - TOTAL; VENDOR MESSAGE; MEMO. Save & Close / Save & New / Clear.
- **Pages:** 193.

#### 3.57 Open Purchase Orders (receive against PO)
- **Opened:** automatically when a vendor with open POs is chosen on Enter Bills / Receive Inventory ("Open PO's Exist", Yes), or with the Select PO button.
- **Layout:** Vendor ▾; "Select a Purchase Order to receive"; grid ✓ | DATE | PO NO. | MEMO; OK, Cancel, Help.
- **Pages:** 194.

#### 3.58 Receive Inventory / Enter Bills Against Inventory
- **Opened:** Home > Receive Inventory ▾ > **Receive Inventory with Bill** (opens Enter Bills with PO lines filled in) or **Receive Inventory without Bill** (Enter Bills form in **Item Receipt** mode, "Bill Received" unchecked, general knowledge). Home > **Enter Bills Against Inventory** converts an item receipt into a bill (general knowledge).
- **Workflow (with bill):** 1. Pick vendor. 2. Yes to open POs. 3. Tick PO(s). 4. OK. 5. Adjust qty/cost, add freight lines (Items tab now shows the PO NO. column). 6. Save & Close.
- **Pages:** 16 (icons), 194.

#### 3.59 Adjust Quantity/Value on Hand
- **Opened:** Home > Inventory Activities ▾ > Adjust Quantity/Value on Hand; Vendors > Inventory Activities.
- **Layout:** toolbar ◄ Previous ► Next, Attach. Adjustment Type ▾ (Quantity / Total Value / Quantity and Total Value), Adjustment Date, Adjustment Account ▾, Reference No., Customer:Job ▾ (and Class). **Find & Select Items...**. Grid **ITEM | DESCRIPTION | QTY ON HAND | NEW QUANTITY | QTY DIFFERENCE** (value columns in value mode). Memo; ITEM INFO AFTER ADJUSTMENT (Quantity on Hand, Avg Cost per Item, Value); Total Value of Adjustment; Number of Item Adjustments. Save & Close / Save & New / Clear.
- Works with the **Physical Inventory Worksheet** report (Item, Description, Preferred Vendor, Quantity On Hand, Physical Count blank line).
- **Pages:** 196.

### Accounting, banking and sales tax

#### 3.60 Make General Journal Entries
- **Opened:** Company > Make General Journal Entries; Accountant menu (general knowledge).
- **Layout:** ribbon Main | Reports: Find, New, Save, Delete, Create a Copy, Memorize, **Reverse**, Print, Attach File. DATE, ENTRY NO. (and [ ] ADJUSTING ENTRY in Premier/Accountant, general knowledge). Grid **ACCOUNT | DEBIT | CREDIT | MEMO | NAME | BILLABLE?** (| CLASS) with a **Totals** row; debits must equal credits. Save & Close / Save & New / Clear.
- **Pages:** 35-36.

#### 3.61 Manage Sales Tax (hub)
- **Opened:** Home > Manage Sales Tax; Vendors > Sales Tax > Manage Sales Tax.
- **Purpose:** a step-by-step hub. **Get Started** section: Sales Tax Preferences button, Open Sales Tax Code List, View Sales Tax Items. **Prepare and Pay** section: links Sales Tax Liability, Sales Tax Revenue Summary; **Pay Sales Tax** button; Adjust Sales Tax Due. Close button. The hub layout is **(general knowledge)**; the manual shows only the dialogs it launches.
- **Pages:** 86-94.

#### 3.62 Sales Tax Adjustment
- **Fields:** Adjustment Date, Entry No., Sales Tax Vendor ▾, Adjustment Account ▾, ADJUSTMENT (•) Increase / ( ) Reduce Sales Tax By, Amount, Memo. OK/Cancel/Help.
- **Pages:** 93.

#### 3.63 Pay Sales Tax
- **Layout:** Pay From Account ▾, Check Date, Show sales tax due through, Starting Check No. Grid **PAY ✓ | ITEM | VENDOR | AMT. DUE | AMT. PAID**, Totals. Buttons Clear Selections, Adjust, OK, Cancel, Help; Ending Bank Balance; [ ] To be printed.
- **Pages:** 94.

#### 3.64 Begin Reconciliation
- **Opened:** Home > Reconcile; Banking > Reconcile.
- **Layout:** Account ▾ ("last reconciled on ..."), Statement Date, Beginning Balance (read-only), Ending Balance; "What if my beginning balance doesn't match my statement?" Service Charge + Date + Account ▾; Interest Earned + Date + Account ▾. Buttons **Locate Discrepancies**, **Undo Last Reconciliation**, **Continue**, Cancel, Help.
- **Pages:** 117.

#### 3.65 Reconcile - (Account)
- **Layout:** "For period: date"; [x] Hide transactions after the statement's end date. Two side-by-side grids: **Checks and Payments** (✓ | DATE | CHK # | PAYEE | AMOUNT) and **Deposits and Other Credits** (✓ | DATE | CHK # | MEMO | TYPE | AMOUNT).
- **Under the grids:** [x] Highlight Marked, **Mark All**, **Unmark All**, **Go To** (opens the transaction), **Columns to Display...**.
- **Footer:** Beginning Balance; Items you have marked cleared: n Deposits and Other Credits, n Checks and Payments; **Modify** (back to Begin). Right: Service Charge, Interest Earned, Ending Balance, Cleared Balance, **Difference**. Buttons **Reconcile Now**, **Leave**.
- **After:** Select Reconciliation Report (Summary / Detail / Both), Display or Print. The result is a Reconciliation Detail report.
- **Pages:** 117-118.

#### 3.66 Locate Discrepancies
- **Layout:** Account ▾, last reconciled date, beginning balance. Buttons **Discrepancy Report**, **Previous Reports**, Undo Last Reconciliation, Restart Reconciliation, Cancel.
- **Pages:** 118.

#### 3.67 Bank Feeds Center
- **Opened:** Banking > Bank Feeds > Bank Feeds Center. Setup: Banking > Bank Feeds > Set Up Bank Feed for an Account (wizard).
- **Layout:** toolbar Add Account, Rules. Left: BANK ACCOUNTS cards (bank name, balance, account ending, last update; "In QuickBooks" account and balance). Right: **Account Information**: bank balance vs. QuickBooks ending balance, last update, refresh/gear. "N transactions are waiting to be added to QuickBooks" with a **Transaction List** button. Read messages from your bank (Messages Received, Payment Inquiry Responses, Alerts). Send items to your bank (Online Checks, Bill Payments, Messages, Payment Inquiries, Payment Cancellations) with **Send Items** and **Create New ▾**. Manage your account (Contact your bank, Disable bank feeds).
- **Preference:** Checking > Bank Feeds: Express Mode (rules automatic, ask before rule) vs Classic Mode (Register) (p. 114).
- **Pages:** 112-115.

#### 3.68 Transactions List (Bank Feeds)
- **Layout:** toolbar Back, Rules. Summary tiles **NEW TO QUICKBOOKS: n NEED YOUR REVIEW** | **IN YOUR REGISTER: n AUTO-MATCHED**. Filters STATUS ▾, TYPE ▾, FROM/TO dates. Grid ☐ | STATUS (Rev / Auto / Rule) | TYPE | DATE | NO. | DOWNLOADED AS | PAYEE | ACCOUNT | PAYMENT | DEPOSIT | **ACTION ▾** (Add/Edit, Quick Add, Add More Details, Match, Ignore). Footer **Batch Actions ▾**. Payee and Account are editable inline to accept.
- **Pages:** 116.

#### 3.69 Bank Feed Rules / Add Rules Details
- **Rules list:** Manage Rules ▾ > Add New; double-click to edit.
- **Rule dialog:** RULE NAME; WHEN... DESCRIPTION [starts with ▾] [text] (+ conditions); DO THIS... [Rename ▾] THE PAYEE FIELD TO [payee ▾] (+ actions, e.g. set account). Save, Cancel.
- **Pages:** 116.

#### 3.70 Account registers (general knowledge)
- Opened from the Chart of Accounts (double-click), Home > Check Register, or Ctrl+R.
- Two-line register: DATE | NUMBER | PAYEE | PAYMENT | ✓ | DEPOSIT | BALANCE; second line TYPE | ACCOUNT | MEMO. Footer: Splits, 1-Line, Sort by, Record, Restore, Go to, Print, Edit Transaction, QuickReport.
- The customer A/R register (3.36) is the only register screenshot in the manual.

### Payroll and time

#### 3.71 Payroll Center: Pay Employees tab
- **Opened:** Home > Payroll Center or Pay Employees; Employees > Payroll Center.
- **Layout:**
  - Toolbar: My Payroll Service, Time Tracking, Payroll Updates, Payroll Items, Hiring Forms ▾, Payroll Setup, Preferences, Support, Help.
  - Left: SUBSCRIPTION STATUSES and a mini calendar.
  - Right sub-tabs **Pay Employees | Pay Liabilities | File Forms**.
  - **Create Paychecks** grid: PROCESS PAYROLL BY | STATUS | PAYROLL SCHEDULE | PAY PERIOD | CHECK DATE. Buttons **Payroll Schedules ▾** (New, Edit, Delete), **Start Unscheduled Payroll**, **Start Scheduled Payroll**.
  - **Recent Payrolls** grid: DATE | STATUS | PAYCHECK COUNT | GROSS PAY | NET PAY.
  - Print ▾: Print Paychecks / Print/Email Paystubs.
- **Pages:** 131, 148, 151-152.

#### 3.72 New Payroll Schedule
- **Fields:** schedule name; How often (Weekly / Biweekly / Semimonthly / Monthly); per-paycheck rows: paycheck day of month, pay period ending; next check date; next pay period end date; [ ] Schedule is inactive. OK.
- Then "Assign Payroll Schedule" (Yes/No to assign all employees with that frequency).
- **Pages:** 131.

#### 3.73 Enter Payroll Information (step 1 of 3)
- **Header:** three-step breadcrumb (1 Enter Payroll Information -> 2 Review & Create Paychecks -> 3 Print & Distribute Paychecks).
- **PAYROLL INFORMATION:** Payroll Schedule, Employees Selected to Pay, Pay Period Ends, Check Date, Bank Account ▾, Bank Account Balance.
- **CHECK OPTIONS:** ( ) Print paychecks on check stock / ( ) Handwrite & Assign check numbers, First Check#.
- **Grid:** ✓ | EMPLOYEE | HOURLY RATE | OVERTIME | VACATION | SICK HOURS | SALARY | TOTAL HOURS. Buttons Uncheck All, **Open Paycheck Detail...**, Sort By ▾, Show/Hide Columns, Finish Later, **Continue**.
- **Pages:** 148.

#### 3.74 Review and Create Paychecks (step 2)
- Same header and options.
- **Grid:** Employee | Gross Pay | Taxes | Deductions | Net Pay | Employer Taxes | Contributions | Total Hours | Direct Dep, with a totals row.
- **Buttons:** Open Paycheck Detail..., < Back, Finish Later, **Create Paychecks**.
- **Pages:** 149.

#### 3.75 Review Paycheck (Paycheck Detail)
- **Opened:** click an employee name, or Open Paycheck Detail.
- **Layout:** Pay Period from-to, [ ] Use Direct Deposit.
  - **Earnings** grid: ITEM NAME | RATE | HOURS | CUSTOMER:JOB | (CLASS).
  - Right: Sick/Vacation available/accrued, [ ] Do not accrue.
  - **Other Payroll Items** grid: ITEM NAME | RATE | QUANTITY.
  - **Employee Summary** grid: ITEM NAME | AMOUNT | YTD.
  - **Company Summary** grid: ITEM NAME | AMOUNT | YTD.
  - Check Amount.
  - Buttons OK, Cancel, Help; (•) Lock Net Pay / ( ) Unlock Net Pay; [ ] Enter net/Calculate gross.
- **Pages:** 149.

#### 3.76 Confirmation and Next Steps (step 3)
- "You have successfully created N paychecks: n for printing, n for direct deposit". Buttons **Print Paychecks**, **Print Pay Stubs**; [ ] Do not advance the dates of this payroll schedule; Close.
- **Pages:** 150-152.

#### 3.77 Pay Liabilities tab / Liability Payment
- **Opened:** Home > Pay Liabilities; Payroll Center > Pay Liabilities.
- **Tab layout:** **Pay Taxes & Other Liabilities** grid ✓ | DUE DATE | STATUS (n Days / Overdue) | PAYMENT | METHOD | PERIOD | AMOUNT DUE; Total Selected Items; **View/Pay**. **Payment History** grid: DATE | TYPE | STATUS | CHECK NO | PERIOD/PAYEE | PAYMENT | ACCOUNT | AMOUNT.
- **Liability Payment - (Bank) window:** a check-style form ("Payment 1 of n", Print). Bank Account, Ending Balance, Print As, Pay to the Order of, No., Date, $, words, Address, Memo; Period; (•) E-payment / Check; [x] To be printed. Tabs **Expenses $ | Payroll Liabilities $** (for penalties/interest). Save & Close, then Payment Summary.
- **Pages:** 153-154.

#### 3.78 Payroll Setup interview / Payroll Tax Form
- **Payroll Setup:** Employees > Payroll Setup. A guided multi-page interview (company, employees, taxes, year-to-date). Only the entry screen is described **(details general knowledge)** (p. 130).
- **Tax Form:** Home > Process Payroll Forms > Select Payroll Form (Quarterly Form 941/Schedule B) > Create Form > Select Filing Period > the **Payroll Tax Form** window. It is a scrolling interview with checkboxes and fields. Buttons: View details about this form, View filing and printing instructions, << Previous, Next >>, Save and Close, Save as PDF, Print for Your Records, **Check for Errors**, Submit Form; [x] Automatically create an archive.
- **Pages:** 130, 154.

#### 3.79 Weekly Timesheet
- **Opened:** Home > Enter Time ▾ > Use Weekly Timesheet; Employees > Enter Time.
- **Layout:** toolbar ◄ Previous ► Next, Print ▾, Edit Single Activity. Title **Timesheet**; NAME ▾ (employee, vendor or other name); WEEK OF (date range + calendar). Grid **CUSTOMER:JOB | SERVICE ITEM | PAYROLL ITEM (employees only) | NOTES | CLASS | M | TU | W | TH | F | SA | SU | TOTAL | BILLABLE?** with a daily Totals row. [ ] Wrap text in Notes field. Buttons **Copy Last Sheet**, Save & Close, Save & New, Clear.
- **Pages:** 141.

#### 3.80 Select Timesheets to Print
- **Opened:** Timesheet > Print ▾ > Print. Dates from/to, list of timesheets to tick, OK, then Print.
- **Pages:** 142.

### Reports

#### 3.81 Report window (all reports)
- **Opened:** Reports menu (group > report), Report Center > Run, list Reports ▾ buttons, center "Run Reports".
- **Layout:**
  - Toolbar: **Customize Report**, Comment on Report, Share Template, **Memorize**, **Print ▾** (Report / Save as PDF), **E-mail ▾**, **Excel ▾** (Create New Worksheet / Update Existing), **Hide Header**, **Collapse Rows / Expand Rows**, **Refresh**.
  - Second row: **Dates ▾** (This Month-to-date, Last Month, This Fiscal Year-to-date, Custom...), From, To, **Show Columns ▾** (Total only, Month, Quarter, Customer:Job, Class...), **Sort By ▾**; on some reports [ ] options (e.g. Stock Status: Use avail qty to reorder, Hide zero QOH, Full Assemblies).
  - Third row: **Report Basis (•) Accrual ( ) Cash**, **Show Filters**.
  - Header: run date/time and basis (left), company name, report title, date range (centre).
  - Body: indented rows with ▼ collapse arrows per group, subtotal and total rows; columns resized and reordered by dragging headers (diamond).
- **Behaviour:** double-click an amount for QuickZoom (general knowledge, 2.7).
- **Reports shown in the manual:**
  - Balance Sheet Prev Year Comparison (p. 36); Profit & Loss Standard by month / % of income / cash basis (p. 37).
  - Sales by Item Summary, Purchases by Item Summary (p. 45); Item Profitability (p. 46).
  - Open Invoices, Collections Report (p. 57); Sales by Customer Summary (p. 69-70).
  - Sales Tax Revenue Summary and Sales Tax Liability (p. 92).
  - Expenses by Vendor Summary, Unpaid Bills Detail, Vendor Balance Detail, A/P Aging Summary (p. 109-110).
  - Reconciliation Detail (p. 118); Missing Checks (p. 120); Audit Trail (p. 162).
  - Time by Name, Time by Job Detail, Job Profitability Detail (p. 145-146, 156); Payroll Summary (p. 155).
  - Customer Phone List / Balances and Credit Limits (p. 165, 170); Open Invoices group output (p. 174).
  - Inventory Stock Status by Item (p. 192), Physical Inventory Worksheet (p. 196), Open Purchase Orders Detail, Inventory Valuation Summary (p. 197).
  - List reports (Reports > List, p. 26).

#### 3.82 Modify Report (Customize Report)
- **Opened:** Customize Report on any report.
- **Tabs:**
  - **Display:** report date range, report basis, COLUMNS checklist with search, Sort by ▾, Sort in Ascending/Descending, "Add subcolumns for" (Previous Period, Previous Year, % of Row, % of Column, % of Income, % of Expense; time reports: Billed / Unbilled / Not Billable; payroll: Hours, Rate), Advanced...
  - **Filters:** CHOOSE FILTER list (Account, Amount, Date, Name, Item, Class, Rep, Terms, Credit Limit...) with filter-specific controls; CURRENT FILTER CHOICES grid FILTER | SET TO; Remove Selected Filter.
  - **Header/Footer:** company name, report title, subtitle, date prepared, time prepared, report basis, print header on pages after first, page number, extra footer line, alignment.
  - **Fonts & Numbers:** Change Font For list + Change Font...; show negative numbers (normally / in parentheses / with trailing minus; in bright red); show all numbers divided by 1000, except zero amounts, without cents.
- **Buttons:** Revert, OK, Cancel, Help.
- **Pages:** 37, 165-170. Report-wide defaults are in Preferences > Reports & Graphs > Format (p. 171).

#### 3.83 Memorize Report
- **Fields:** Name; [ ] Save in Memorized Report Group ▾; [ ] Share this report template with others. OK/Cancel.
- Later: Report Center > Memorized tab, or Reports > Memorized Reports.
- **Pages:** 172-173.

#### 3.84 Process Multiple Reports
- **Opened:** Reports > Process Multiple Reports.
- **Layout:** (•) Memorized Reports / ( ) Commented Reports; Select Memorized Reports From ▾ (group); grid ✓ | REPORT | DATE RANGE | FROM | TO (dates editable per row); "n report(s) selected". Buttons **Display**, **Print**, **Email**, Cancel, Help.
- **Pages:** 174.

#### 3.85 Export Report to Excel / Update Report
- **Export dialog:** (•) Create new worksheet (in new or existing workbook) / ( ) Update an existing worksheet / CSV; **Advanced...** (preserve formatting, freeze panes, auto-outline, filters, space between columns...); **Export**.
- **Update:** in Excel, QuickBooks tab > Update Report (Browse company file, date range, Update).
- **Pages:** 175-178.

### Forms customization

#### 3.86 Basic Customization / Apply Design
- **Opened:** a form > Formatting tab > **Customize Design** (QuickBooks Forms Customization, a web designer, may carry a fee) and **Manage Templates**. Basic Customization: logo, fonts, colours, company info fields (general knowledge).
- **Apply Design dialog:** text explaining that copies of templates are made; grid ✓ | Form | Template (Invoice, Credit Memo, Sales Receipt, Purchase Order, Stmt Charge, Estimate, Sales Order); Select All, Clear All, Show All Templates; DESIGN PREVIEW pane; Apply, Cancel.
- **Pages:** 72-73.

#### 3.87 Additional Customization / Layout Designer
- **Opened:** Formatting > **Customize Data Layout**.
- **Layout:** SELECTED TEMPLATE name, [ ] Template is inactive. Tabs **Header | Columns | Prog Cols | Footer | Print**. Each tab is a grid of fields with **Screen ✓ | Print ✓ | Title** (rename label):
  - Header: Default Title, Date, Invoice Number, Bill To, Ship To, P.O. No., S.O. No., Terms, Due Date, REP, Account Number, Ship Date, Ship Via, FOB, Project/Job, Other.
  - Footer: Message, Subtotal, Sales Tax, Total, Payments/Credits, Balance Due, Customer Total Balance, Job Total Balance, Long text (disclaimer).
  - The right PREVIEW pane updates live.
  - Buttons Help, Default, "When should I check Screen or Print?", **Basic Customization...**, **Layout Designer...**, Print Preview..., OK, Cancel.
- **Layout Designer:** a WYSIWYG canvas to move and resize fields and text boxes on the printed form (general knowledge for controls).
- **Pages:** 74-75. Tip on p. 126: add a Payments/Credits footer field and rename it "Down Payment".

### Productivity

#### 3.88 Memorize Transaction / Enter Memorized Transactions
- **Opened:** Edit > Memorize (Form) (Ctrl+M) on any form.
- **Memorize Transaction:** Name; ( ) Add to my Reminders List / ( ) Do Not Remind Me / ( ) Automate Transaction Entry / ( ) Add to Group; How Often ▾, Next Date, Number Remaining, Days In Advance To Enter, Group Name ▾. OK/Cancel.
- **Enter Memorized Transactions** (at startup): "You have N memorized transactions to be entered now"; grid SELECT ALL ✓ | TRANSACTION NAME | TYPE | ACCOUNT | FREQUENCY | DATE | AMOUNT; buttons **Enter Checked Now**, **Enter All Later**.
- **Pages:** 82-84.

### Settings, security and utilities

#### 3.89 Preferences
- **Opened:** Edit > Preferences.
- **Layout:**
  - Left category list with icons: Accounting, Bills, Calendar, Checking, Desktop View, Finance Charge, General, Integrated Applications, Items & Inventory, Jobs & Estimates, Multiple Currencies, Payments, Payroll & Employees, Reminders, Reports & Graphs, Sales & Customers, Sales Tax, Search, Send Forms, Service Connection, Spelling, Tax: 1099, Time & Expenses.
  - Centre tabs **My Preferences | Company Preferences**.
  - Right buttons OK, Cancel, Help, Default, and an "Also See:" list of related categories.
- **Category content shown in the manual:**
  - **General / My:** Enter moves between fields, auto-open drop-downs, beep, auto decimal, warn when editing/deleting, auto-recall last transaction or pre-fill accounts, default date (today / last entered), keep custom item info (p. 15).
  - **Desktop View / Company:** Home Page feature toggles (p. 16).
  - **Sales Tax / Company:** Do you charge sales tax; Add sales tax item; most common tax item; taxable/non-taxable codes; when you owe (accrual/cash); pay frequency (p. 86).
  - **Bills / Company:** auto-use credits/discounts, default discount account (p. 100).
  - **Checking / Company:** print account names on voucher, warn on duplicate check numbers, autofill payee account number, default accounts for paychecks and liabilities, Bank Feeds Express vs Classic mode (p. 114).
  - **Payroll & Employees / Company:** payroll product, Employee Defaults button (p. 132).
  - **Time & Expenses / Company:** track time, first day of work week, mark all time billable, create invoices from a list of time and expenses, track reimbursed expenses as income, default markup % and account (p. 140, 143).
  - **Reports & Graphs / Company:** accrual/cash default, aging from due/transaction date, Format... (header/footer, fonts) (p. 171).
  - **Accounting / Company:** use account numbers, require accounts, class tracking, auto-assign JE number, warn on Retained Earnings, date warnings (past/future days), **Closing Date > Set Date/Password** (p. 186).
  - **Search / Company:** index update (p. 81).
  - **Send Forms:** e-mail templates (p. 53).
- **Pages:** 15-16, 53, 81, 86, 100, 114, 132, 140, 143, 171, 186.

#### 3.90 Set Up Users / user wizard
- **Opened:** Company > Set Up Users and Passwords > Set Up Users (Enterprise: Company > Users > Set Up Users and Roles).
- **Administrator setup:** Administrator's Name, Password, Confirm, Challenge Question/Answer, Next, Finish.
- **User List dialog (general knowledge for layout):** Add User, Edit User, Delete User, View User, Close.
- **Add User wizard:** User Name, Password, Confirm, [ ] add to license, Next. Access: Selected areas / All areas / External Accountant. Then per-area pages: Sales & A/R, Purchases & A/P, Checking & Credit Cards, Time Tracking, Payroll, Sensitive Accounting, Sensitive Financial Reporting, **Changing or Deleting Transactions** (incl. before the closing date). Each page offers No Access / Full Access / Selective Access (create, create & print, create & reports). Finish.
- **Enterprise Roles:** User Name, Password, Available Roles -> Add -> Assigned Roles.
- **Pages:** 158-160, 187-188.

#### 3.91 Set Closing Date and Password
- **Opened:** Company > Set Closing Date (opens Preferences > Accounting > Company) > **Set Date/Password**.
- **Dialog:** explanation text; DATE: [ ] Exclude estimates, sales orders and purchase orders from closing date restrictions; Closing Date. PASSWORD: Closing Date Password, Confirm Password. Pointer to the Closing Date Exception Report. OK/Cancel.
- **Pages:** 186-188.

#### 3.92 Accountant's Copy
- **Opened:** File > Send Company File > Accountant's Copy > Save File (or Client Activities) / Import Accountant's Changes from File / Remove Restrictions.
- **Save wizard:** Accountant's Copy vs Portable/Backup, Next, **Dividing Date** (End of last tax year / last quarter / month / Custom), Next, save location, OK.
- **Pages:** 188-190.

#### 3.93 File utilities
- **New Company / QuickBooks Setup:** File > New Company. Express Start / Detailed Start (Advanced Setup) / Other Options; then the QuickBooks Setup window with "Start Working" (add customers/vendors/items) (p. 10-11).
- **Back Up Company:** File > Back Up Company > Create Local Backup. Wizard: Local / Online; **Options** (location, add date/time, limit backups, remind every N closings, verify data); When (Save it now / now and schedule / only schedule); schedule options; Save; Finish (p. 180-181).
- **Open or Restore Company:** File > Open or Restore Company. Wizard: Open a company file / Restore a backup copy / Restore portable file / Convert; Local vs Online backup; choose file; Restore To; then QuickBooks Login (User Name, Password) (p. 161, 182).
- **Switch to Multi-user Mode:** File menu toggle (p. 161).
- **Update QuickBooks Desktop:** Help > Update QuickBooks Desktop. Tabs Overview / Options (Automatic Update Yes/No, Shared Download, update list) / Update Now (Get Updates, Reset Update) (p. 183-184).
- **Product Information:** F2 / Ctrl+1. Version, license, list counts, file size and location, DB server (p. 20, 183).
- **Pages:** 10-11, 161, 180-184.

---

## 4. Cross-screen workflows

**Sales, Method 1 (A/R invoice):** p. 52-56
1. (Optional, general knowledge) **Create Estimates** -> Create Invoice from the estimate (full or progress).
2. **Create Invoices** (Customer:Job, items, Save; Print Later / Email).
3. Batch print or e-mail (File > Print Forms > Invoices; Income Tracker Batch Actions).
4. **Receive Payments** (apply to invoices; under/overpayment choices) -> Undeposited Funds.
5. **Record Deposits** -> Payments to Deposit -> **Make Deposits** -> bank register.
6. Monitor in **Income Tracker**, Open Invoices, Collections and A/R Aging reports.

**Sales, Method 2 (cash sale):** **Enter Sales Receipts** -> Undeposited Funds -> **Make Deposits** (p. 60).

**Sales, Method 3 (statement billing):** **Statement Charges** (A/R register) -> Finance Charges -> **Create Statements** (print/e-mail) -> **Receive Payments** -> **Make Deposits** (p. 61-62, 66-67).

**Sales, Method 4 (lump-sum):** **Make Deposits** with income accounts on the lines (p. 63).

**Returns and credits:** **Create Credit Memos/Refunds** -> either **Apply Credit to Invoices**, **Issue a Refund** (creates a check; then Print Checks), or retain the credit -> later **Apply Credits** from Create Invoices (p. 64-66).

**Customer deposit / down payment:** **Receive Payments** with no invoice ("Leave the credit to be used later") -> **Make Deposits** -> later **Create Invoices** > **Apply Credits** (show as "Down Payment" via Additional Customization) (p. 123-126).

**Bounced customer check:** **Receive Payments** (find with ◄) -> **Record Bounced Check** -> fees and summary -> invoices reopen and a fee invoice is created (p. 122).

**Time billing:** **Weekly Timesheet** (billable ✓) -> Invoices ▾ **Invoice for Time & Expenses** -> **Choose Billable Time and Costs** (+ Options) -> **Create Invoices** -> receive and deposit. Billable expense lines on Enter Bills, Write Checks and Credit Card Charges also flow into Choose Billable Time and Costs (Expenses tab) (p. 141-145).

**Purchasing with inventory:** p. 193-195
1. **Create Purchase Orders** (Home > Purchase Orders).
2. **Receive Inventory with Bill**, or Receive Inventory without Bill (Item Receipt) followed by **Enter Bills Against Inventory** (general knowledge for the split path).
3. **Open Purchase Orders** dialog -> **Enter Bills** (PO lines, freight).
4. **Pay Bills** (credits/discounts) -> Payment Summary -> **Print Checks**.
5. Monitor with **Bill Tracker**, Open Purchase Orders Detail, Inventory Stock Status, Inventory Valuation.
6. Count with the **Physical Inventory Worksheet** -> **Adjust Quantity/Value on Hand**.

**Accounts payable without PO:** **Enter Bills** -> **Pay Bills** -> **Print Checks** (p. 98-102). Vendor credit: Enter Bills in **Credit** mode -> Pay Bills > **Set Credits** -> Discount and Credits (p. 107-108).

**No A/P (direct payment):** **Write Checks** (Print Later or hand-written / DEBIT / Pay Online) -> **Print Checks** or **Bank Feeds Center > Send Items** (p. 103-104, 113, 115).

**Credit card:** **Enter Credit Card Charges** (or Download Card Charges / Bank Feeds) -> pay the card bill by Write Checks to the card account, or via Reconcile of the card account (general knowledge) (p. 105-106).

**Bank feeds and reconcile:** Set Up Bank Feed -> **Bank Feeds Center** -> **Transactions List** (Add/Match per row, **Rules**) -> **Begin Reconciliation** -> **Reconcile** (Mark cleared, Difference 0) -> Reconcile Now -> Reconciliation report. **Locate Discrepancies** for problems. Void vs delete checks from Write Checks (p. 112-119).

**Sales tax:** Preferences (Sales Tax) -> Sales Tax Items/Groups -> **Sales Tax Code List** -> tax code on Items and on Customers -> invoices compute tax -> **Manage Sales Tax**: Liability / Revenue Summary reports -> **Sales Tax Adjustment** -> **Pay Sales Tax** (p. 86-94).

**Payroll:** Payroll Setup interview -> Payroll Items -> Employees -> **Payroll Schedule** -> (Weekly Timesheet hours) -> **Pay Employees**: Enter Payroll Information -> Review and Create Paychecks (Paycheck Detail) -> Confirmation -> **Print Paychecks / Pay Stubs** -> **Pay Liabilities** (View/Pay -> Liability Payment) -> **Process Payroll Forms** (941) -> Payroll Summary / Job Profitability (p. 128-156).

**Period close:** Reports (P&L, Balance Sheet, Audit Trail) -> **Make General Journal Entries** for adjustments -> **Set Closing Date and Password** -> restrict users (Set Up Users > Changing or Deleting Transactions) -> **Accountant's Copy** (dividing date) -> Import Accountant's Changes (p. 162, 186-190).

**Recurring work:** any form -> **Memorize** (Automate) -> **Enter Memorized Transactions** prompt at startup; Calendar and Reminders show what is due (p. 78, 82-84).

**Reporting loop:** Report Center or Reports menu -> report window -> **Customize Report** (Display / Filters / Header-Footer / Fonts) -> **Memorize** (into a group) -> **Process Multiple Reports** -> Print / E-mail / **Excel** (later Update Report). Drill down by QuickZoom from summary to detail to the source form (p. 164-178).

---

## 5. Gaps (manual thin; filled from general knowledge or not covered)
- **QuickZoom:** not explained (trademark mention only). It is a core drill-down behaviour; described in 2.7 from general knowledge.
- **Estimates, Sales Orders, Item Receipts, Enter Bills Against Inventory, Build Assemblies, Transfer Funds, account registers, Finance Charges, Vendor Credit apply dialogs outside Pay Bills, Class List, Price Levels, Units of Measure:** not walked through in Level 1 (Level 2 material). Entries 3.46, 3.47, 3.58 (partial) and 3.70 are general knowledge. For a manufacturer (N-Line), Build Assemblies and Sales Orders matter and need another source.
- **Transaction history side panel:** visible only as a collapsed `<` tab on forms. Its contents are general knowledge.
- **Manage Sales Tax hub, Vendor tabs beyond Address/Payment, Employee Payroll Info detail, Payroll Setup interview pages, Layout Designer controls, Advanced Find, User List dialog:** the manual shows the action but not the full window. Filled from general knowledge as marked.
- **Keyboard list (p. 198)** is the manual's own and is authoritative. Ctrl+I/Ctrl+W/Ctrl+A/Ctrl+T shortcuts are general knowledge.
