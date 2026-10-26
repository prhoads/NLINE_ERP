# VISUAL Jobshop UI inventory, part 1: Getting Started and Estimating

Source: `C:\Infor Global Solutions\VISUAL Jobshop\Help\VJSUserGuideEnu.pdf`, PDF pages 25-268 (Section 1 Getting Started, ch. 1-6; Section 2 Estimating, ch. 7-9). Page numbers below are **PDF page numbers**, with the printed chapter page in brackets where useful (e.g. 176 [7-2]).

Scope: every window, dialog and important popup described in this range. Field lists come from the text plus the screenshots. Where the text and a screenshot disagree, both are noted.

## Summary table

| # | Screen | Module / group bar | Purpose | Pages |
|---|---|---|---|---|
| 1 | Log In dialog | Startup | Pick user, password, database | 44, 53-55 |
| 2 | Database Wizard (Welcome) | Log In > Database Wizard | Hub for register/create/maintain/copy database | 45, 48, 51, 136 |
| 3 | Register Database / Connection Settings / Success | Database Wizard | Register an existing (shared) database | 45-48 |
| 4 | Create Database / Enter Password / Confirm Settings / License Number | Database Wizard | Create a new empty database | 48-50 |
| 5 | Maintain Database / Details / Confirm | Database Wizard | Change path/description, unregister | 51-52 |
| 6 | Copy Database / Copy To / Ready To Copy | Database Wizard | Copy a database (practice copy) | 136-137 |
| 7 | Serial number prompt | First login | Enter license serial | 55 |
| 8 | Jobshop main window (desktop shell) | Application | MDI shell: menus, toolbar, navigation bar, status bar | 57-64 |
| 9 | Customize (Toolbars / Commands) + New Toolbar | Right-click on menu/toolbar | Customize menu bar and toolbars | 66-72 |
| 10 | Table Browse (lookup) dialog | Any `...` ID button or `<Column>` header | Pick a record from a table, with search/wildcards | 77-78 |
| 11 | Calendar drop-down | Any date field | Date picker | 79-80 |
| 12 | Advanced Browse Filters (Columns / Filters / Sorting) | Toolbar "Edit Browse Filters" in any window with a browse | Choose browse columns, filters, sort | 81-89 |
| 13 | Information table window (generic maintenance grid) | Group bar icons, e.g. Common > Commodity Code | Add/edit/delete basic code tables | 90-96 |
| 14 | Add Postal Code dialog | Auto popup on unknown zip | Add postal code on the fly | 92-93, 112 |
| 15 | Program Preferences | File > Program Preferences | Per-user program options | 97-98 |
| 16 | Control Panel + Change Password | Common > Control Panel | User changes own password | 56, 106 |
| 17 | User Manager | Administration > User Manager | List users and roles | 103-106 |
| 18 | Role Properties - New | User Manager: Tools > Add Role | Create a role | 103 |
| 19 | User Properties (New / edit) and Add New User | User Manager: Tools > Add User, double-click, Add | Create/edit user, set password and role | 104-106 |
| 20 | Authority Manager | Administration > Authority Manager | Allow/deny menu items per role | 107-109 |
| 21 | System Settings (8 tabs) | Administration > System Settings | Company info, logo, fiscal periods, auto-numbering, default account sets, shop calendar | 110-124 |
| 22 | Open a Picture File dialog | Right-click > Insert Picture | Choose BMP/GIF/JPEG | 114, 217 |
| 23 | Reports selection window (e.g. Common Reports) | `<Group>` > Reports icon | Icon list of reports in a group | 144-145, 148 |
| 24 | Report window (range / sort) | Double-click a report | Set From/To ID range and Sort By, preview/print | 146-151 |
| 25 | Advanced Filters (report variant) | Report toolbar | Report filters and sort | 152-159 |
| 26 | Print Document (Windows print dialog) | Print icon | Print a report | 160-161 |
| 27 | Print Preview | Report toolbar Print Preview | Page through, print, export, zoom | 162-167 |
| 28 | Export File + format options + Number and Date Format + Choose Export File | Print Preview > Export | Export report to file (CSV etc.) | 164-166 |
| 29 | Tutorial (CBT) | Help > Computer Based Training | Training program (external) | 138 |
| 30 | Quotes window (8 tabs) | Estimating > Quotes | Create and manage customer quotes | 176-199 |
| 31 | Quote Line window (4 tabs) | Quotes: double-click row header / Add Detail | Edit one quote line, its quantities and prices | 180-189, 198 |
| 32 | Cost From dialog | Quote Line > Prices > Cost From button | Choose cost basis: Part / Quote Master / Engineering Master | 185-186 |
| 33 | Quote Master window (5 tabs) | Estimating > Quote Master | Build an estimating bill of manufacture (no Part ID needed) | 201-252 |
| 34 | Details canvas (information cards) | Quote Master > Details tab | Graphical routing/BOM editor | 204-212, 218-221, 245-246, 251 |
| 35 | Operation window (5 tabs) | Details: right-click header/op > Add Operation, or double-click op card | Define an operation or outside service | 223-233 |
| 36 | Material window (4 tabs) | Details: right-click op > Add Material | Define material or tool/fixture on an operation | 234-239 |
| 37 | Leg/Detail window (2 tabs) | Details: right-click op > Add Leg/Detail | Define a subassembly leg | 240-243 |
| 38 | New Quote From Engineering Master | File > New Document From > Eng Master | Create quote master as copy of an engineering master | 221-222 |
| 39 | Show Details window | Tools > Show Details | Read-only indented tree of the master | 253-256 |
| 40 | Show Costs window | Tools > Show Costs | Indented cost/hours rollup | 256-263 |
| 41 | Material Availability for Quote Masters | View > Material Availability | Snapshot of on-hand vs required materials | 264-265 |
| 42 | Part picture popup | Picture icon on a material card | Show part picture | 212 |
| 43 | Estimating reports (6) | Estimating > Reports | Quote Form, Quote List, Quote Master, Quote Master Cost, Quote Master List, Quote Proforma | 267 |

---

## Section 1: Getting Started

### 1. Log In dialog
- **Opened by**: Start VISUAL Jobshop (desktop shortcut or Start > Programs > VISUAL Jobshop). Pages 44, 53-55.
- **Purpose**: Authenticate and choose the database for the session.
- **Layout**: User (first run defaults to ADMIN), Password (masked, case-sensitive), Database drop-down (registered databases by description; defaults to last used, first time "Demo Database"). Buttons: OK, Cancel, Database / Database Wizard, Details / No Details (Details expands a bottom panel with the selected database's path/server info).
- **Workflow**: 1. Type user and password. 2. Pick database. 3. Optional Details. 4. OK. First login to a database asks for the serial number (screen 7). Jobshop desktop opens.
- **Links**: Database Wizard (2). After login: Control Panel > Change Password (16) is the first admin task.

### 2. Database Wizard (Welcome)
- **Opened by**: Database Wizard button on the Log In dialog. Pages 45, 48, 51, 136.
- **Purpose**: Wizard hub for database administration.
- **Layout**: Option buttons: Register Existing Database (default), Create New Database, Maintain Database, Copy Database. Next / Cancel.
- **Links**: Leads to screens 3, 4, 5, 6. Every path ends with a Success dialog and returns to Log In.

### 3. Register Database > Connection Settings > Success
- **Pages**: 45-48.
- **Purpose**: Point this PC at an existing (usually shared) database.
- **Layout (Register Database)**: Database Type drop-down (SQL Server/MSDE or Microsoft Access), Server/Path, Description (this is the text shown in the Log In drop-down), Database Name (SQL), Database Password (SQL). Then Connection Settings page (Finish); an error box appears if the server/database cannot be found; then Success (OK).
- **Workflow**: 1. Wizard > Register Existing > Next. 2. Enter type, path, description (and name/password for SQL). 3. Next > Finish > OK. The database now appears in Log In.

### 4. Create Database > Enter Password > Confirm Settings > License Number > Success
- **Pages**: 48-50.
- **Layout**: Create Database: Database Type, Server/Path (browse; "(local)" option for SQL), Description, Server Administration ID and Password (SQL only). Enter Password: Jobshop Admin Password, Re-type Password. Confirm Settings: Finish (progress bar). License Number prompt. Success: OK.
- **Workflow**: Wizard > Create New > type/path/description > admin password > Finish > license > OK.

### 5. Maintain Database > Details > Confirm Settings
- **Pages**: 51-52.
- **Layout**: Maintain Database: list of registered databases. Details: Path/Server, Description, Delete button (only unregisters, does not delete the file). Confirm Settings, Success.
- **Workflow**: Pick database > Next > edit or Delete > Next > Next > OK.

### 6. Copy Database > Copy To > Ready To Copy
- **Pages**: 136-137.
- **Layout**: Copy Database: Choose Database button and drop-down (source), Jobshop Admin Password (for the new copy), Database Password (SQL). Copy To: Server/Path button (destination folder), Description. Ready To Copy: summary, Finish (progress), Success.
- **Purpose**: Make a practice/test copy before live use.

### 7. Serial number prompt
- **Page**: 55. Single field (serial/license number) + OK; shown on the first login to a database. Barely documented.

### 8. Jobshop main window (desktop shell)
- **Pages**: 57-64 (labelled diagram on 58).
- **Purpose**: MDI container that hosts every function window.
- **Layout**:
  - Title bar: "VISUAL Jobshop - <active window>". Right-click menu: Restore, Move, Size, Minimize, Maximize, Close.
  - Menu bar: menus change with the active window; options without authority are hidden; unavailable ones are greyed. Keyboard shortcuts are shown next to items (e.g. Ctrl+S Save, Ctrl+O Open).
  - Toolbar(s): context-sensitive icons; tooltips with optional shortcut; the description shows in the status bar. Named toolbars include Standard and Browse.
  - Navigation Bar (left, Outlook-style): Group Bars (named in the manual: Estimating, Engineering, Sales, Inventory, Purchasing, Planning, Shopfloor, Accounting, Common, Administration), each with shortcut icons that open windows. Icons can be dragged between groups but not removed. View menu: Navigation Bar (show/hide), Large Icons / Small Icons. If the bar is hidden, use the Navigation menu.
  - Main window area: child windows (minimize/restore/maximize/resize; minimized windows show as title stubs at the bottom). Window menu: Tile Horizontally etc.
  - Status bar: status message (left), User, Caps, Num, Ins/Rep indicators; hovering the menu bar shows a tooltip with the database path.
- **Behaviors**: Shift+click a shortcut icon opens a second copy of a window (used to copy between masters). Keeping a window minimized keeps its browse data cached.
- **Generic entry conventions (apply to every screen)** (75-81):
  - Required fields prompt on save (e.g. a part needs a stocking U/M).
  - ID boxes: leave blank to auto-number on save (Quotes, Quote Masters, POs, Receivers, Sales Orders, Shippers, Invoices, Work Orders). Primary ID boxes have a drop-down of recently opened IDs (most recent at the bottom).
  - Auto Browse (toolbar toggle "Enable/Disable Auto Browse"): type-ahead fills the first matching ID.
  - Number fields work as calculators (+ - * / () **), evaluated on Tab/Enter.
  - `...` table browse buttons and `<Column>` header buttons open the Table Browse dialog (10).
  - Grid row headers: double-click (or Edit Details toolbar icon) opens the line detail window; Add Detail icon adds a line. Row header symbols: `+` new unsaved, check mark changed unsaved, red `X` marked for delete (removed on Save), `*` new-row placeholder.
  - Drop-down lists inside grids appear only when the cell has focus.
  - Check boxes (multi-select, Space toggles), option buttons (single choice).
- **Links**: Every other screen opens inside this shell.

### 9. Customize (Toolbars / Commands) and New Toolbar
- **Opened by**: Right-click the menu bar or toolbar > Customize. Pages 66-72.
- **Layout**: Toolbars tab (list of toolbars with check boxes; New button). Commands tab: Categories list (left) and Commands icons (right). Close. New Toolbar dialog: name + OK.
- **Workflow**: Drag a command icon onto the menu bar or a toolbar to add it; drag it off to remove it. Toolbars/menu bar can be docked or floated by dragging the gripper; double-clicking the gripper toggles between the last two positions.

### 10. Table Browse (lookup) dialog
- **Opened by**: Any `...` button next to an ID field, or a `<Column Title>` button in a grid header. Pages 77-78.
- **Purpose**: Choose a value from a database table.
- **Layout**: Search box + Find button; result grid. Wildcards: `*` (any string, e.g. `*A` = contains A), `?` (one character, e.g. `??L`).
- **Workflow**: 1. Click the button. 2. Optionally type a search and Find. 3. Double-click a row to copy it into the field and close.
- **Links**: Filtering/sorting of these browses is set in Advanced Browse Filters (12) with "Use Settings For All".

### 11. Calendar drop-down
- **Page**: 79-80. Month grid; left/right arrows; click the month name for a month list and the year for a year scroller; today circled red, last selection highlighted blue; right-click the header > "Go to today". Date fields in screenshots also have an enable check box.

### 12. Advanced Browse Filters window (Columns / Filters / Sorting)
- **Opened by**: Toolbar "Edit Browse Filters" in a window that has a Browse tab (title e.g. "Advanced Browse Filters for Parts"/"for Customers"). Pages 81-89.
- **Purpose**: Per-PC configuration of a window's browse grid: visible columns, filter rows, sort.
- **Layout**:
  - Columns tab: grid of Visible (check box), Column Description, Title; Clear button.
  - Filters tab: grid of Column Description (drop-down of table columns), Condition (Less than, Less than or Equal to, Not equal to, Equals, Greater than, Greater than or Equal to, Begins with, Contains, Ends with), Value, And/Or. Delete button.
  - Sorting tab: Available Columns list, Add-> / <-Remove, Selected Columns list, Up / Down.
  - Footer: Use Settings For All (apply to every lookup of that table), Restore Defaults, OK, Cancel, Apply. Own toolbar with Save (File > Save).
- **Workflow**: 1. Tick the columns to show. 2. Add filter rows. 3. Add sort columns and order them. 4. Save, Apply or OK.
- **Notes**: Settings are stored per computer, not per user.

### 13. Information table window (generic maintenance grid)
- **Opened by**: Group bar shortcut, e.g. Common > Commodity Code. Pages 90-96.
- **Purpose**: Maintain simple code tables (Commodity Codes, Product Codes, Units of Measure, Carriers, Territories, SIC Codes, FOB Points, Shipping Methods, States/Provinces, Postal Codes, Terms, Status Reason Codes, etc.; listed on 130-133).
- **Layout**: Single editable grid (ID, Description, other columns per table); standard row-header markers.
- **Actions**: Save (toolbar / File > Save); Edit > Delete or the Delete key marks rows; click a column header to sort descending, Shift+click to sort ascending; drag column edges/headers, then Browse > Save Widths and Positions.
- **Workflow**: Type into the blank row, Tab across, Save. Closing with unsaved changes prompts to save.

### 14. Add Postal Code dialog
- **Opened by**: Automatically, when an address gets a zip that is not in the Postal Code table. Pages 92-93, 112.
- **Layout**: Postal Code (prefilled), City, State (button to pick from States/Provinces, or type), Country. Yes (add) / No (skip).

### 15. Program Preferences
- **Opened by**: File > Program Preferences. Pages 97-98.
- **Layout**: General section: Save Settings on Exit, Save Current Group on Exit, Auto Browse, Auto Refresh Browse After Save or Delete, Confirm Exit, Confirm Exit of Scheduling. Toolbar section: Show Tool Tips, Show Shortcuts in Tool Tips, Show Tool Description in Status Bar.

### 16. Control Panel + Change Password
- **Opened by**: Common group bar > Control Panel > Change Password icon. Pages 56, 106 (details in ch. 48, outside this range).
- **Layout**: Change Password dialog: Old Password, New Password, Confirm Password, OK.

### 17. User Manager
- **Opened by**: Administration group bar > User Manager. Pages 103-106.
- **Layout**: Top list with columns Users, Full Name, Role. Bottom pane: Roles shown as icons.
- **Toolbar / Tools menu**: Add User, Add Role. Double-click a user to edit (User Properties).
- **Workflow**: 1. Add roles. 2. Add users and give each one role. 3. Set authorities per role in the Authority Manager (20).

### 18. Role Properties - New
- **Page**: 103. Role Name + OK/Cancel.

### 19. User Properties (New / edit) and Add New User
- **Pages**: 104-106.
- **Layout**: User ID, Full Name, Password, Confirm Password, Role Name (drop-down; exactly one role per user). OK/Cancel. Passwords: 1-8 characters, must start with a letter, no spaces, case-sensitive. The first login needs a non-blank password. "Add New User" (Add button) has the same fields.

### 20. Authority Manager
- **Opened by**: Administration > Authority Manager. Pages 107-109.
- **Layout**: Role Name drop-down; "Menu Selections" tab with a tree of modules (Estimating, Engineering, Sales, Inventory, Purchasing, Planning, Shopfloor, Accounting, Common...) expandable to windows/menu items, each with a green check (Access) or red no-entry (Deny) icon.
- **Toolbar / Tools menu**: Allow Access, Access Denied; Save.
- **Workflow**: Pick role > select a node (a whole section or an expanded window) > Allow/Deny > Save. Denied options disappear from that role's menus. Only ADMIN has everything.

### 21. System Settings
- **Opened by**: Administration > System Settings. Pages 110-124.
- **Purpose**: Company-wide defaults and auto-numbering.
- **Tabs and fields**:
  - **Address**: Name, Address (2 lines), City, State/Zip (state drop-down + zip with browse), Country, extra line; Phone, Fax, Web URL (button opens the browser). (111-113)
  - **Logo**: picture box; right-click > Insert Picture (or Edit > Picture > Insert Picture) opens Open a Picture File (22). Recommended size up to 170x100 px. Printed on reports. (113-114)
  - **Accounting**: "Automatic Date Generation": Fiscal Year, End Date, Auto button (generates 12 periods). Grid: Fiscal Year, Period, Last Day, Closed. At most 12 periods a year; periods must not overlap; closed periods are locked. (115-116)
  - **Estimating**: Quote Auto Numbering and Quote Master Auto Numbering panels, each with Next sequential number, Alphanumeric Prefix (up to 4), Alphanumeric Suffix (up to 4), # of Decimal Digits, Show leading zeroes, and a live "Sample Quote #" / "Sample Quote Master" preview. (116-119)
  - **Inventory**: Accounting System Interfaced check box; Accounting Interface panel: Default Account Set ID (browse), Current Period End Date, Next Period End Date (read-only); Batch Auto Numbering panel (same pattern, Sample Batch #). (119-120)
  - **Purchasing**: Default Account Set ID; PO and Receiver auto-numbering panels. (121)
  - **Sales**: Default Account Set ID; Sales Order, Shipper (and receiver/invoice) auto-numbering. The manual warns that invoice numbering must differ from the external accounting package. (122-123)
  - **Shopfloor**: Work Order Auto Numbering panel; Scheduling panel: Standard Schedule ID (STANDARD), weekly grid of Day of Week, 1st Shift Start (time spinner with show/hide check), Shift 1, Shift 2, Shift 3 hours (24 h total per day). Default: 8 h first shift from 7:00 AM. (123-124)
- **Actions**: Save (toolbar / File > Save) per tab; Close Window.
- **Links**: Account Sets / Accounts windows (ch. 42-43, outside range); Account Interface (ch. 44) for closing periods; resource calendars (ch. 34).

### 22. Open a Picture File dialog
- **Pages**: 114, 217. Standard file-open dialog for BMP/GIF/JPEG with an "Enable Preview" check box and a thumbnail preview.

### 23. Reports selection window (e.g. "Common Reports")
- **Opened by**: Any group bar > Reports shortcut. Pages 144-145, 148.
- **Layout**: Explorer-style icon list of the group's reports. Right-click: View (Large Icons, Small Icons, List, Details), Arrange Icons (By Name, By Description, Auto Arrange), Line Up Icons.
- **Workflow**: Double-click a report. If saved advanced filters exist, it asks whether to use them (Yes opens Advanced Filters). Then the Report window (24) opens.

### 24. Report window (range / sort)
- **Pages**: 146-151 (example "Postal Code List").
- **Layout**: Menus File, Edit, Options, Help. Toolbar: Show Print Preview, Print Current Document, Save (store settings as this report's default), Clear, Restore Default Settings, Advanced Filters and Sorting (greyed when the report does not support it). Body: ID Range panel with From and To (each with a `...` browse); SortBy drop-down (options depend on the report).
- **Workflow**: 1. Set the From/To range (blank To = everything after From). 2. Pick Sort By. 3. Preview, adjust, then print. 4. Optionally Save the settings.
- **Links**: Advanced Filters (25), Print Preview (27), Print (26).

### 25. Advanced Filters (report variant)
- **Pages**: 152-159. Same window as screen 12 (Filters / Sorting tabs; Delete button; Save), plus conditions **Is Null** and **Is Not Null**; its toolbar adds Print Preview, Print, Clear the Current Document (asks Yes/No/Cancel to save) and Restore Default Settings. Saved settings are per computer.

### 26. Print Document dialog
- **Pages**: 160-161. Standard Windows print dialog (depends on the printer).

### 27. Print Preview window
- **Pages**: 162-167.
- **Layout**: Toolbar: Beginning of Report, Previous Page, page indicator "1 of 1+" (the + means still building), Next Page, End of Report, Build Halt (stop), Print, Export File, Magnification drop-down (e.g. 100%), "Total: N" record count, progress (% and "N of N"). Report canvas with scroll bars. The report header shows the company logo/name, the report title, and "Selection" / "Order By".
- **Workflow**: Page through > Print or Export > close to return to the Report window.

### 28. Export File + format dialog + Number and Date Format + Choose Export File
- **Pages**: 164-166.
- **Layout**: Export: Format drop-down (Crystal export formats, e.g. Character Separated Values), Destination drop-down, OK. A format-specific options dialog follows (e.g. Character-Separated Values: separator settings), then Number and Date Format, then a Save As dialog that defaults the filename to the report name and the extension to the format.

### 29. Tutorial (CBT)
- **Page**: 138. Help > Computer Based Training; runs from the CD next to Jobshop. Not a business screen.

Other items in the range: Ch. 5 (168) says the ~80 reports are Crystal Reports 8 files, customizable outside the program; Ch. 6 (169-172) is troubleshooting/support text only (no screens).

---

## Section 2: Estimating

### 30. Quotes window
- **Opened by**: Estimating group bar > Quotes. Title "Quote :: New" or "Quote :: <ID>". Pages 176-199.
- **Purpose**: Multi-line customer quotations; each line can quote several quantities with a price each.
- **Tabs** (the text lists Quote, Sold to, Ship to, Dates, Details, Specs, Charges, Browse; several screenshots show an **Other** tab in place of Details, and the order varies, e.g. Quote | Sold to | Ship to | Dates | Other | Specs | Charges | Browse):
  - **Quote** (header + lines):
    - Header: Quote ID (`...` browse + MRU drop-down; blank shows "<auto number>"; up to 15 chars), Customer ID (bold = required; `...` browse; must exist), Quote Date (default today), Purchase Order No (15 chars; carries to the sales order), Status drop-down: Active (being estimated, default), Ready (to quote), Won (order taken; set automatically when a sales order is created from the quote), Lost (order lost), Cancelled. Right panel: read-only "Sold to/Ship to" address summary.
    - Line grid columns: Line No, `<Part ID>`, Quantities Quoted (colon-separated list, e.g. 10:50:100), `<Selling U/M>`, Cost from, Description, Drawing ID, Rev, `<Product Code>`, `<Commodity Code>` (more off-screen).
  - **Sold to**: Sold to Name, Address, Addr 2, City, State/Zip, Country, Addr Etc; Contact, Title, Phone, Fax, E-Mail (button opens the mail client addressed to the customer). Filled from the customer.
  - **Ship to**: Name (`...` to pick a ship-to address), Address (2 lines), City, State/Zip, Country, extra line; Contact, Title, Phone, Fax, E-mail button; Format (address format, e.g. United States).
  - **Dates**: Ship On (copies to the sales order Ship Date), Follow Up, Expires (prints), Expected (order date), Won/Loss (date), Won/Loss Reason, Printed (date-time; set automatically by File > Print); Quoted Leadtime (days; prints), Win Probability (1-100%). Each date has an enable check box.
  - **Details** (or "Other"): Our Supplier ID, SIC Code ID, Carrier ID; Sales Rep ID, Territory ID, FOB Point ID, Ship Via ID; Freight Terms (drop-down, e.g. Billed), Terms ID, Discount Class ID, Tax Group ID, Tax ID + Exempt check box. Filled from the customer's defaults.
  - **Specs**: free-text memo (Ctrl+Enter for a new line); prints in the quote header area.
  - **Charges**: grid `<Service Charge ID>`, Description, Amount, `<Tax Group ID>`, `<Revenue Acct ID>`; each charge prints as a separate line on the quote.
  - **Browse**: list of quotes (columns set with Advanced Browse Filters, 12).
- **Toolbar / menus**: Save (Ctrl+S); Add Detail (new line) and Edit Details (open line); Copy the Current Document / Clear the Current Document / Paste the Clipboard Document (Edit > Copy/Clear/Paste Document); Delete Current Document (Edit > Delete Document, with confirm); Edit > Delete (mark the selected line for deletion); Refresh (File > Refresh; asks to save); Edit Browse Filters; Auto Browse toggle; File > Print (prints the Quote Form and stamps Printed).
- **Workflow (new quote)**:
  1. Leave Quote ID blank (auto number) or type one; pick the Customer ID (fills Sold to, Ship to and Details).
  2. Set Date, PO No, Status.
  3. Double-click a blank row header (or Add Detail) to open Quote Line (31); add quantities and prices; Apply/OK.
  4. Review Sold to / Ship to; fill Dates (follow-up, expiry, leadtime, win %).
  5. Check Details; type Specs; add Charges.
  6. Save. Print the Quote Form.
- **Other procedures**: Copy quote (open > Copy Document > Clear > Paste Document > new or blank ID > Save) (194-195); edit any time (196); record win/loss on the Dates tab (196); delete a quote (197); delete a line (Edit > Delete + Save) (197-198).
- **Links**: Customer window (ch. 14), Quote Line (31), Quote Master (33, via Cost From), Sales Order (copy quote to sales order; Status becomes Won), Estimating reports (43).

### 31. Quote Line window
- **Opened by**: Quotes > double-click a line row header, or the Add Detail / Edit Details icon. Title "Quote Line :: [<QuoteID> - <Line>]". Pages 180-189, 198-199.
- **Tabs**:
  - **Quote Line**: Line No (drop-down; blank = auto), Part ID (`...`), Quantities Quoted (read-only, built from Prices), Customer Part ID (`...`; from the customer's price list), Description (70 chars; enough on its own for a description-only line), Selling U/M (`...`, required); Revenue Acct ID (`...`), Account Set ID (`...`) as optional per-line overrides.
  - **Overrides**: Product code (`...`), Commodity code (`...`), Drawing ID / Rev (prints); Tax Group (`...`; defaults from the customer), Ship date, Promised (copies to the sales order).
  - **Specs**: line memo; prints under the line.
  - **Prices**:
    - Grid: Quantity, Calc'd Unit Cost, Calc'd Unit Price, Quoted Unit Price (prints), Trade Disc % (defaults from the customer discount), In Proforma (check box; include in the Proforma report).
    - Buttons under the grid: Recalc, Lookup Price (only when Cost From = Part; uses customer prices, then discount class, then the part's price), Delete.
    - Cost From button + display (e.g. "Quote Master New"); "Replace quoted unit price during recalc" check box.
    - Panel "Markup percent and dollars for the currently selected quantity": rows Purchased Material, Fabricated Material, Labor Cost, Burden Cost, Service Cost; columns GSA %, Markup %, Markup $. Buttons Save Markups as Default, Get Default Markups.
  - Footer: OK, Cancel, Apply.
- **Pricing math (187-189)**: Calc'd Unit Cost = master unit cost per quantity x (1 + GSA%); Calc'd Unit Price = Calc'd Unit Cost x (1 + Markup%) + Markup$ / Quantity, applied per cost component. Markups only apply when Cost From is a Quote or Engineering Master. Markups are specific to each quantity row.
- **Workflow**:
  1. Pick a Part (or type a description only); set U/M.
  2. Overrides: dates, tax group.
  3. Prices: Cost From (32); type quantities.
  4. Either type the Quoted Unit Price, use Lookup Price, or select a row, enter GSA/markups and press Recalc.
  5. Adjust the quoted price; set Trade Disc and In Proforma.
  6. Apply, then OK.
- **Delete a single quantity**: select the price row header and press the Delete key (not Edit > Delete, which deletes the whole line). Then OK and Refresh/save (198-199).

### 32. Cost From dialog
- **Opened by**: Quote Line > Prices > Cost From button. Pages 185-186.
- **Layout**: Option buttons Part / Quote Master (pick an existing one, or let Jobshop create a blank placeholder quote master referenced by this line; you must save and exit the quote before editing it) / Engineering Master (Eng ID drop-down for the line's part). OK.
- **Effect**: When the quote is copied to a sales order, a Quote Master cost basis is automatically copied into a new work order.

### 33. Quote Master window
- **Opened by**: Estimating group bar > Quote Master; also created automatically by Cost From. Title "Quote Master :: <ID>". Pages 201-252.
- **Purpose**: Estimating bill of manufacture (routing + materials) that does not need a Part ID and does not affect scheduling. It can become a work order.
- **Tabs**:
  - **Quote Master** (header): Quote Master ID (`...` + MRU; "<auto number>"), Part ID (`...`, optional), Description; Quantity (default 1.0000), Product Code ID, Commodity Code ID; Engineered By (60 chars), Engineered Date, Drawing ID/Rev/Page (3 boxes), Drawing File (`...` + open button); Account Set ID, Global Rank, Forward Schedule check box (both only matter once it becomes a work order). Part-derived fields can be overridden locally.
  - **Details**: graphical card canvas (34).
  - **Specs**: memo; prints on the Quote Master report.
  - **Picture**: image; right-click Insert Picture / Stretch to Fit / Clear Picture.
  - **Browse**: list of quote masters.
- **Menus / toolbar**:
  - File > New Document From > Eng Master (and other masters/work orders) (38); Save.
  - Edit: Cut, Copy, Paste, Delete (cards); Copy Document, Paste Document (only into a blank master), Clear Document, Delete Document.
  - Options: Right-click Info, Data Tips, Copy Subordinates.
  - Tools: Show Details (39), Show Costs (40).
  - View: Material Availability (41).
  - Window: Tile Horizontally.
- **Ways to build** (213): from scratch; drag cards from another quote master, engineering master or work order; New Document From; Copy/Paste Document.
- **Workflow (from scratch)** (214-217):
  1. ID (blank = auto), optional Part, Quantity, Engineered By/Date, Global Rank.
  2. Details: add operations/services, then legs.
  3. Add materials/tools to operations.
  4. Fill the detail of each card.
  5. Specs, Picture.
  6. Save.
- **Links**: Quotes (cost basis), Engineering Master and Work Order windows (copy source/target), Operation Templates (ch. 11), Parts (ch. 19), Shop Resources (ch. 34).

### 34. Details canvas (information cards)
- **Location**: Quote Master > Details tab (the same control is used by Engineering Masters and Work Orders). Pages 204-212, 218-221, 245-246, 251.
- **Card types and colours**:
  - Header (white, bottom): QM ID, Part, description / quantity, start of specs.
  - Leg/Detail (white, at the bottom of a leg, attached by a line to its parent operation): Sub ID, Part, description / required quantity.
  - Operation (green, inside): Seq #, Resource ID, description / setup, run and move hours / units out and in.
  - Service (blue, outside operation): service #, Service ID, name / move hours and transit days / units out and in.
  - Material and Tool/Fixture (red): piece #, Part or Tool ID, description / calculated quantity.
  - Cards are stacked diagonally (up-right), operations behind the header and materials in front of their operation.
- **Card icons**: Drawing (opens the drawing file in its Windows application), Specs (jumps to the Specs tab), Picture (header: Picture tab; material: part picture popup), Additional Resources (opens the Operation window at the Add'l Resources tab).
- **Right-click menu**: Add Operation (on header/operation), Add Material (on operation), Add Leg/Detail (on operation), Edit (or double-click), Cut, Copy, Paste, Delete (toggles grey "marked for delete"; removed on Save; deleting an operation removes its subordinates), Right-click Info (enlarged card on right-click; toggle off from the toolbar/Options menu), Data Tips (hover tooltip), Show Details, Show Costs.
- **Paste rules**: material onto operation, operation onto header (or operation), leg onto operation. Copy Subordinates includes children.
- **Drag-copy between windows**: open two windows (Shift+icon), Window > Tile Horizontally, then drag a card. The cursor shows `+` on valid targets; releasing the button elsewhere cancels the drag. Dragging an operation copies its legs and materials.

### 35. Operation window
- **Opened by**: Right-click header/operation > Add Operation, or double-click an operation card. Title "Operation - <QM>(<seq>) - New". Pages 223-233.
- **Tabs**:
  - **Operation**: Template ID (`...`; locked after save), Seq No (auto +10; unique within the leg), Description (60), Resource ID (`...`, bold), Service ID, Supplier ID, Supplier Svc ID (enabled only when the resource is "Contractor"); Setup Hrs (becomes Transit Days for a contractor), Run, Run Type (Hours per Piece, Pieces per Hour, Minutes per Piece, Pieces per Minute, Loads per Hour, Hours per Load), Load Size Qty (for load types), Move Hrs, Min Move Qty (allows overlapping operations).
  - **Specs**: memo (copies to the work order traveler); Drawing ID/Rev/Page, Drawing File.
  - **Costs**: Setup/hr, Run/hr, Run/unit, Run/operation; Setup bur/hr, Run bur/hr, Burden/unit, Burden/oper (the text says "Burden per hour" and "Burden per operator"); Setup %, Run %; Preserved (set automatically when overridden; protects against Reset Material/Resource Costs). A contractor enables only Run/unit and Run/operation.
  - **Add'l Resources**: grid `<Resource ID>`, Step (Setup/Run/Both), Duration %, Justification (At Start/At End), Sched Type (Normal/Discontinuous), Min Size. Used for scheduling only; costs are not added.
  - **Other**: Scrap or Yield % with Scrap mode / Yield mode option, Fixed Scrap Units; Calc'd Start Qty, Calc'd End Qty (read-only); Override Start Qty, Override End Qty; Min Capacity, Max Capacity (up to 255; both default 1).
- **Buttons**: OK, Cancel, Apply. Then Save the master.

### 36. Material window
- **Opened by**: Right-click an operation > Add Material, or double-click a material card. Title "Material :: <QM>/<seq>/<piece> [New]". Pages 234-239.
- **Tabs**:
  - **Material**: Part ID (`...`, optional), Fab / Pur / Tool/Fixt check boxes (Tool/Fixt makes it a tool/fixture card), Piece # (auto +10; unique within the operation), Description, Qty Per, Type (Start quantity / End quantity of the parent operation), Fixed Qty, Reference (e.g. balloon number), Scrap %, Dimensions (expression with variables; not for piece-tracked parts), Length / Width / Height (dimensional parts), Usage U/M (`...`; needs a unit conversion; required when there is no Part ID).
  - **Specs**: memo (copies to the work order traveler).
  - **Costs**: Unit Cost Material, Labor, Burden, Service; Fixed Cost; Burden %; Burden/Unit; Preserved. Supplier-specific pricing can overwrite the costs on save unless Preserved is ticked.
  - **Purchasing**: Supplier ID (`...`), Supplier Part ID (`...`), Mfg Name, Mfg Part ID.
- **Buttons**: OK, Cancel, Apply.

### 37. Leg/Detail window
- **Opened by**: Right-click an operation > Add Leg/Detail. Title "Leg/Detail - <QM> New". Pages 240-243.
- **Layout**: Leg/Detail tab: Part ID (`...`) or description only, Fab / Pur / Tool/Fixt, Piece # (shares numbering with that operation's materials), Sub ID (auto, read-only), Description, Qty Per (default 1), Type (Start/End quantity), Fixed Qty, Reference, Scrap %, Dimensions, Length/Width/Height, Usage U/M. Specs tab: memo. OK, Cancel, Apply.
- **Rule**: a subassembly built at the same time as its parent must be a leg; a subassembly built ahead and stocked should be a material.

### 38. New Quote From Engineering Master dialog
- **Opened by**: File > New Document From > Eng Master (with a blank quote master open). Pages 221-222.
- **Layout**: Part ID and Engineering ID selectors (a part can have several engineering masters); Copy button.
- **Effect**: Copies the whole structure, auto-numbers and saves the new quote master. The menu implies the same for other source document types, but only Eng Master is shown.

### 39. Show Details window
- **Opened by**: Tools > Show Details, its toolbar icon, or right-click in Details. Pages 253-256.
- **Layout**: Left pane: tree of cards (icons: grey gear = header, green hammer = inside operation, blue hammer = outside operation, red bolt = material, card icon = leg). Right pane: the selected card's fields. Read-only. Close window.

### 40. Show Costs window
- **Opened by**: Tools > Show Costs, its toolbar icon, or right-click in Details. Title "Costs". Pages 256-263.
- **Layout**: Indented tree-grid with columns Detail, Quantity, Estimated (total cost), Estimated Total Hours. Clicking the Estimated Total Hours header expands it to Estimated Setup Hours and Estimated Run Hours. Clicking the Estimated header expands it to Estimated Unit, Material, Labor, Burden and Service costs. Hovering a cell shows a data tip with the material/labor/burden/service split or the setup/run hours (closes after 5 s). Close or View > Exit.
- **Rollup rules (260-262)**:
  - Run hours by run type, from the operation's Calc'd End Qty: x Run (Hours per Piece); / Run (Pieces per Hour); x Run / 60 (Minutes per Piece); / Run / 60 (Pieces per Minute); ceil(qty / Load Size) x Run (Hours per Load); ceil(qty / Load Size) / Run (Loads per Hour).
  - Header hours are not summed, because operations can run in parallel. Legs sum their subordinate operations.
  - Operation labor = Setup hrs x Setup$/hr + Run hrs x Run$/hr + Run$/unit x end qty + Run$/operation.
  - Operation burden = setup and run burden per hour + burden/unit x end qty + fixed burden + Setup% and Run% of setup and run cost.
  - Service cost = Run$/unit x end qty + Run$/operation.
  - Material cost = qty x unit material cost + fixed cost. Material burden adds Burden% of all unit costs and Burden/Unit.
  - Header and leg costs are the sums of their subordinates.

### 41. Material Availability for Quote Masters
- **Opened by**: View > Material Availability. Pages 264-265.
- **Layout**: Grid with columns Part ID, Sub ID, Seq No, Piece No, Qty Req'd, Qty Issued (always blank for a quote master), On Hand, Projected Available (red negative = short, blue = covered), Required Date ("Not Scheduled"), Description. Close button.
- **Links**: Material Planning (ch. 30) gives the time-phased view.

### 42. Part picture popup
- **Page**: 212. Opened by the Picture icon on a material card; shows the part's picture; Close.

### 43. Estimating reports
- **Opened by**: Estimating group bar > Reports (screens 23-28). Page 267.
- **Reports**: Quote Form (customer-ready quote; printing stamps the Printed date), Quote List, Quote Master (structure, includes Specs), Quote Master Cost, Quote Master List, Quote Proforma (backlog of open quotes; uses the In Proforma lines and Win Probability).
- **Documentation**: one line each. The selection fields for each report are not described.

---

## Cross-screen workflows

### A. First-time setup (pages 32-33, 44-56, 103-124)
1. Install, then Log In as ADMIN/ADMIN on the Demo database.
2. Database Wizard: Create New (or Register Existing shared) database; Copy Database for a practice copy.
3. Control Panel > Change Password for ADMIN.
4. User Manager: add Roles, add Users (one role each). Authority Manager: allow/deny menu items per role.
5. Accounts and Account Sets (ch. 42-43), then System Settings: Address, Logo, Accounting periods (Auto), Estimating/Inventory/Purchasing/Sales/Shopfloor auto-numbering, default account sets, shop calendar.

### B. Implementation data-load order (pages 127-134)
1. In order: User Manager > Control (Authority) Manager > Address > Logo > Accounts > Account Sets > Accounting > Estimating > Inventory > Purchasing > Sales settings.
2. Any order: Service Charges, Sales Tax Groups, Sales Reps, Territories, SIC Codes, Commodity Codes, Carriers, Units of Measure, Services, Purchasing Tax Groups, Shop Resources, Employees, FOB Points, Shipping Methods (plus States, Postal Codes, Product Codes, Terms, Status Reason Codes).
3. Operation Templates, Unit Conversions (plus Locations, Shop Groups).
4. Shop Views, then Suppliers (without pricing), then Parts.
5. Supplier part/service pricing, Discount Classes.
6. Customers, then Engineering Masters.
7. Adjust in opening inventory (Adjustments), practise on a copy, then go live.

### C. Quote > Quote Master > Sales Order > Work Order (estimating flow, pages 139, 175, 185, 201)
1. (Optional) Quote Master: build a description-only routing/BOM from scratch or copy from an Engineering Master, Work Order or another Quote Master (drag cards or New Document From). Check Show Costs and Material Availability.
2. Quotes: header + customer; add lines in Quote Line; on Prices set Cost From = Part (Lookup Price), Quote Master (a blank one is created if none is chosen) or Engineering Master. Enter several quantities, GSA/markups, Recalc, set the quoted prices.
3. Fill Dates (follow-up, expires, leadtime, win %), Specs and Charges; Status Active, then Ready; print the Quote Form (Estimating reports).
4. Follow up: record Won/Loss date and reason; manage the backlog with Quote List and Quote Proforma.
5. On order: copy the quote to a Sales Order (PO No, Ship On, Promised dates carry over; Status becomes Won). A Quote Master cost basis is copied automatically into a new Work Order; the Quote Master Global Rank and Forward Schedule then take effect.

### D. Full order cycle referenced in Ch. 4 (pages 139-141; screens documented in later sections)
Adjustments > Quote Masters > Quotes > Sales Orders > Work Orders (traveler) > Scheduling > Material Planning (create/link WOs to SOs; consolidate POs; order point/safety stock) > Purchase Orders (link to WOs) > Receiving (to stock or straight to the job) > Material Issues > Labor Entry > Work Order Receipts (linked WO output goes straight to the shipper) > Shipping (pack list) > Invoicing > Account Interface (post, batch, export to accounting).

### E. Reporting pattern (pages 144-167)
Group bar > Reports > double-click a report > (use saved advanced filters?) > Report window: From/To range + Sort By, optional Advanced Filters/Sorting > Print Preview (page, zoom, halt) > Print or Export (format > destination > options > number/date format > filename). Save stores the settings per computer.

### F. Common record pattern used by every document window (pages 75-89, 194-199, 244-252)
ID browse or MRU to open > edit across tabs > grid lines through row-header double-click detail windows > Save (Ctrl+S). Copy/Clear/Paste Document to clone. Delete Document with confirm. Row deletions are marked with a red X and applied on Save. Browse tab columns, filters and sorting are configured in Advanced Browse Filters.
