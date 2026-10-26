# VISUAL Jobshop screen inventory, part 3: Purchasing, Planning, Shopfloor

Source: `C:\Infor Global Solutions\VISUAL Jobshop\Help\VJSUserGuideEnu.pdf`, PDF pages 481-746 (Section 6 Purchasing, ch. 25-29; Section 7 Planning, ch. 30-32; Section 8 Shopfloor, ch. 33-41).
Page numbers below are **PDF page numbers**. The printed chapter-page number, such as "25-4", is given in brackets where useful.

Conventions that apply to every Jobshop window in this range, so they are not repeated per screen:
- Windows open from the **Outlook-style group bar** on the left (Purchasing / Planning / Shopfloor group) by clicking a **shortcut icon**. Shift+click opens a second instance of the same window (p. 627).
- Each document window is a **tabbed form**. The last tab is usually **Browse**, a grid list of all records of that type.
- An **ID field with a "..." button** opens a browse/lookup dialog that lists the records in a grid. You select a row and click OK, or double-click it. A `<Column>` header in angle brackets marks a grid column that has a lookup.
- Standard toolbar and File/Edit menu actions: **Save**; **Refresh (F5)**; **Clear Document**; **Copy Document / Paste Document**; **Edit > Delete Document**, which hard-deletes the record after a Yes/No confirm; **Edit > Delete** or the DELETE key on a grid row, which shows a red X on the row header and takes effect on Save. Row header markers: `*` new row, `+` new unsaved row, a check mark for a changed unsaved row, a red X for a row marked for delete.
- Closing a window with unsaved changes prompts you to save.
- Status values used throughout: **Unreleased, Hold, Cancelled, Firm, Released, Closed** (single-letter codes U/H/X/F/R/C). Only **Firm or Released** documents create demand or supply, appear in Receiving, or get scheduled.

## Summary table

| # | Screen | Module | Purpose | Pages |
|---|---|---|---|---|
| 1 | Purchase Order window | Purchasing | Create and maintain POs: header, line grid, tax and order totals | 483-499 |
| 2 | Purchase Order Line (Order Line) dialog | Purchasing | Enter or edit one PO line: part/service, qty, price, overrides, specs, WO links | 488-493, 545-546 |
| 3 | Supplier window | Purchasing | Supplier master: contact, account defaults, addresses, part and service price breaks | 501-518 |
| 4 | Purchasing Information Tables (Services, Purchasing Tax Groups) | Purchasing | Code tables for outside services and purchase tax groups | 519 |
| 5 | Receiving window | Purchasing | Receive open POs (creates a Receiver) and return received goods | 521-530 |
| 6 | Receiving Tools menu | Purchasing | Switch received/unreceived view; Receive, Return, Edit Receiver, Refresh | 529 |
| 7 | Print Receiver prompt | Purchasing | Yes/No prompt after a receipt to print the Receiver tag report | 526 |
| 8 | Purchasing Reports | Purchasing | 11 reports (PO, Receiver, supplier performance, and others) | 531-532 |
| 9 | Material Planning window | Planning | Planning workbench with 3 tabs (Open Sales Orders, Non-Stocked Parts, Stocked Parts) that creates and links WOs and POs | 535-565 |
| 10 | Planning Tools menu | Planning | View filters and actions for each Material Planning tab | 538-539, 550-552, 559-561 |
| 11 | Link Sales Order Line to Work Order dialog | Planning | Pick an existing WO to link to the selected SO line | 540-541 |
| 12 | Create New Work Order dialog | Planning | Quick-create a WO (optionally linked) from an SO line, demand line or stocked-part shortage | 542-548, 554-556, 562-565 |
| 13 | Scheduling window | Planning | Run the scheduler; view resource and WO schedule grids and a Gantt chart | 567-597 |
| 14 | Scheduling Options menu | Planning | Display mode, zoom, show/hide layers, highlights, Schedule All, tips | 588-597 |
| 15 | Set Load Horizon dialog | Planning | Number of days shown in the Gantt chart (default 90) | 579 |
| 16 | Schedule All Orders dialog | Planning | Parameters for a full scheduler run | 593-595 |
| 17 | Weekly Calendars window | Planning / Shopfloor | Shift start and hours per weekday for each schedule and resource | 598, 701 |
| 18 | Calendar Exceptions window | Planning / Shopfloor | Holidays, overtime and outages by date range, with shift hours and capacity | 598-602, 701 |
| 19 | Planning Reports | Planning | Material Netting, Order Point, Resource Schedule (dispatch), WO Shortage | 603-604 |
| 20 | Work Order window | Shopfloor | WO header plus a graphical bill-of-manufacture card diagram (Details tab) | 607-684 |
| 21 | Operation window | Shopfloor | Edit an operation or outside-service card: resource, times, costs, extra resources, scrap | 631-641 |
| 22 | Material window (also Tool/Fixture) | Shopfloor | Edit a material card: part, qty per, scrap, dimensions, costs, supplier | 642-648 |
| 23 | Leg/Detail window | Shopfloor | Edit a subassembly leg card | 649-653 |
| 24 | New Work Order from (Eng Master / Quote Master / Work Order) dialog | Shopfloor | Copy an entire master or WO into a new WO | 629-630 |
| 25 | Open a Picture File dialog | Shopfloor | Attach an image to the WO Picture tab | 625-626 |
| 26 | Show Details window | Shopfloor | Read-only tree of the WO structure plus a property grid | 663-666 |
| 27 | Show Costs window | Shopfloor | Indented costed BOM: estimated, actual, variance, projected costs and hours | 667-675 |
| 28 | Purchase Material dialog | Shopfloor | Create a PO (linked) for the selected material or service card | 677 |
| 29 | Material Availability dialog | Shopfloor | On-hand vs required for each WO material | 678-679 |
| 30 | Inventory Transactions dialog | Shopfloor | Issue history for a material or part | 679, 730 |
| 31 | Labor Transactions dialog | Shopfloor | Labor tickets posted against the open WO | 679-680 |
| 32 | Sales Order Line Links dialog | Shopfloor | SO lines linked to the open WO | 680 |
| 33 | Work Order Variables dialog | Shopfloor | Named variables used in material Dimensions formulas | 681-684 |
| 34 | Change Status submenu | Shopfloor | Cascade a status change to a card and its subordinates | 676 |
| 35 | Shop Resource window | Shopfloor | Resource master: type, schedule type, shift capacity, cost rates, burden | 685-701 |
| 36 | Reset Operation Costs dialog | Shopfloor | Push current resource rates into existing operations | 694-695 |
| 37 | Resource Where Used dialog | Shopfloor | Masters and WOs that use a resource | 698-700 |
| 38 | Shop Group window | Shopfloor | Define the member resources of a Group-type resource | 703-709 |
| 39 | Shop View window | Shopfloor | Named resource filter for schedules and reports | 711-716 |
| 40 | Labor Entry window (Labor Entry and Labor Reversal tabs) | Shopfloor | Post setup/run labor tickets and reverse them | 717-724 |
| 41 | Material Issues window | Shopfloor | Issue or return stock material to WO operations | 725-730 |
| 42 | Inventory Pieces dialog | Shopfloor | Piece-tracked stock by location and dimensions | 729 |
| 43 | Work Order Receipts window | Shopfloor | Receive finished WO output to stock, return it to the floor, close short | 731-735 |
| 44 | Employees window | Shopfloor | Employee clock numbers and labor cost rates | 737-741 |
| 45 | Shopfloor Reports | Shopfloor | 31 reports (Traveler, WIP, WO Cost, efficiency, and others) | 743-746 |
| 46 | Generic ID browse/lookup dialog | All | Grid lookup opened by any "..." button | 699, 706 |

---

## Section 6: Purchasing

### 1. Purchase Order window
- **Open:** Purchasing group bar > **Orders** shortcut. It is also opened pre-filled from Material Planning (Create Purchase Order for supplier) and from the Work Order window (Purchase this material/service).
- **Purpose:** Create and maintain purchase orders for inventory parts, description-only (non-inventory) parts and subcontract services.
- **Layout:** title "Purchase Order :: <ID>". There are 7 tabs:
  - **Purchase Order**:
    - Header fields: Order ID (with "..." and dropdown; auto-numbered from a prefix and suffix if left blank, max 30 characters), Supplier ID (...), Date, Receive On (date; sets the order in the Receiving list), Status (Unreleased, Hold, Cancelled, Firm, Released, Closed).
    - A **Purchase From** panel on the right shows the "Ship to sold to address".
    - **Line grid** columns: Line #, PO Line Type, Order Qty, `<Part ID>`, `<Service ID>`, Description, `<Purchase UM>`, Unit Price, Line Status, Extension.
    - **Footer totals:** Tax, Order Total.
  - **Purchase From**: supplier name, address and contact (defaults from the Supplier record; editable for this PO).
  - **Ship To**: alternate ship-to name and address. If Name is blank, the printed PO uses the company address. Used for drop-ship.
  - **Details**:
    - Dates (each with a checkbox): Promised, Printed (set automatically when the PO is printed), Last Received (set automatically by Receiving).
    - Fields: Buyer, FOB Point ID, Ship Via ID, Tax Group ID, Terms ID, Freight Terms (dropdown, e.g. "Billed"). All default from the supplier.
  - **Specs**: free-text comments that print on the PO (Ctrl+Enter for a new line).
  - **Taxes**: grid with Tax Group ID, Tax Name, Description, Account ID, Tax Percent, Tax Amount. It fills automatically from the supplier, header and line tax groups.
  - **Browse**: list of POs.
- **Toolbar/menu:** Save; File > Print (prints the PO and sets Printed Date); Edit > Delete Document (blocked if any receipts exist); Edit > Delete on a line row, then Save; Clear.
- **Workflow:**
  1. Leave Order ID blank to auto-number, or type an ID.
  2. Pick a Supplier ID. Name and address fill in.
  3. Set Date and Receive On.
  4. Set Status. It must be Firm or Released to appear in Receiving and in planning supply.
  5. Double-click a blank row header to open the **PO Line dialog** (#2). Repeat for each line.
  6. Review the Purchase From, Ship To, Details, Specs and Taxes tabs.
  7. Save, then print.
- **Rules:** A Released PO cannot be edited. A PO with receipts cannot be deleted. Status changes to Closed automatically when the PO is fully received.
- **Links:** PO Line dialog, Supplier lookup, Receiving, Purchase Order report.
- **Pages:** 483-499 [25-1 to 25-17].

### 2. Purchase Order Line dialog ("Order Line - [PO - line]")
- **Open:** Double-click a row header in the PO line grid. Also the route for breaking links (Links tab, p. 545).
- **Purpose:** Enter and edit one PO line.
- **Layout:** 4 tabs plus **OK / Cancel / Apply** buttons.
  - **Purchase Order Line**:
    - Line # (dropdown); PO Line Type (**Part order** default or **Service order**).
    - Part ID (...); Description (required if there is no Part ID); Supplier Part ID (...; filtered to this supplier's price records); Mfg Name; Mfg Part ID; Service ID (...); Supplier Service ID.
    - Order Qty, Unit Price (defaults from supplier price breaks; may prompt "reset unit price?"), Trade Discount %, Purchase UM (...; a UM conversion is needed if it differs from the stocking UM), Fixed Charge (spread over the receipt qty when costing).
    - Length, Width, Height and Dimension UM (enabled only for piece-tracked parts).
  - **Overrides**: Product Code ID, Commodity Code ID, Tax Group ID, Recv Date, Promised Date, Last Received Date (each date has a checkbox), Expense Acct ID, Line Status (Open, ...). These apply to this line only.
  - **Specs**: line comments.
  - **Links**: grid with `<Work ID>`, Lot ID, Split ID, Sub ID, `<Seq #>`, `<Piece #>`, Part ID, Quantity. Selecting a WO fills Lot, Split and Sub. Seq # is shown for service lines and is filtered to Contractor operations. Piece # fills Part and Qty. If the WO requirement is larger than the line qty, you are prompted to increase the order qty.
- **Workflow:**
  1. Choose the line type.
  2. Pick a part or service, or type a description only.
  3. Enter qty. Price defaults; override if needed.
  4. Optionally override codes and dates.
  5. Optionally link to a WO material or service operation. Description-only lines **must** be linked fully.
  6. Click OK.
- **Unlinking:** On the Links tab, select the row, press DELETE (red X), click OK, then save the PO.
- **Pages:** 488-493, 545-546.

### 3. Supplier window
- **Open:** Purchasing group bar > **Suppliers** shortcut.
- **Purpose:** Supplier (vendor) master record. Its defaults drive POs, and its price breaks drive PO prices and master/WO material costs.
- **Layout:** The screenshot shows 7 tabs (the text says 6; the extra one is **Notes**).
  - **Suppliers**:
    - Supplier ID (..., dropdown; max 15 characters).
    - Name and Address block: Name (with "..."), 2 address lines, City, State/Postal (State dropdown plus Zip with "..."; an unknown zip prompts you to add it to the zip table), Country, extra address lines.
    - Contact block: Contact, Title, Phone, Fax, E-mail (button opens the mail client), Web URL (button opens the browser).
  - **Account**: Account Opened and Last Order (dates, auto-maintained); Buyer, FOB Point ID, Ship Via ID; Terms ID, Expense Acct ID, Payable Acct ID, Default Tax Group, Tax ID Number, Tax Exempt checkbox.
  - **Addresses**: grid of alternate ship-from addresses and contacts. Columns: Addr #, Name, Address 1, Address 2, City, State, Postal Code, Country, Address...
  - **Part Prices**:
    - Header: Part ID (...), Purchase U/M (...), Supplier Part ID, Mfg Name, Mfg Part ID.
    - Price block: Type (**Break table** or **Up-to-Qty table**), As of (date), Expires (date), and a Quantity / Unit Price break grid.
    - A bottom summary grid lists the parts quoted: Part ID, Purchase U/M, Quoted, Part Description.
    - Uniqueness key: Part + Purchase UM + Supplier Part + Mfg Name + Mfg Part ID.
  - **Service Prices**: same structure, keyed by Service ID + Part ID, plus Supplier Service ID. The summary grid has Service ID, Part ID, Quoted, Service Description. Service prices affect PO prices only, not master costs.
  - **Notes**.
  - **Browse**.
- **Toolbar/menu:** Save; Edit > Delete Document (only if the supplier is unused); DELETE on a price row, then Save.
- **Workflow:**
  1. Enter an ID, name and address.
  2. Enter contacts.
  3. On Account, set terms, accounts and tax defaults.
  4. Add alternate addresses.
  5. Enter part and service price breaks with validity dates.
  6. Save.
- **Notes:**
  - Break-table semantics: in a Break table the first qty cell is blank; in an Up-to table the last qty cell is blank. A missing last price gives a price of 0.
  - Out-of-date quotes fall back to the Part price.
  - Edits do not change existing documents.
- **Links:** Used by the PO window, the Material window Purchasing tab, Material Planning supplier picks, and the Operation window (Contractor supplier).
- **Pages:** 501-518 [26-1 to 26-18].

### 4. Purchasing Information Tables (Services; Purchasing Tax Groups)
- **Open:** Purchasing information tables. Only described in prose; there is no screenshot or field list in this range. The general table pattern is in chapter 3/4, outside this range.
- **Purpose:**
  - **Services**: each outside process (welding, plating) is its own Service ID, used on PO service lines and Contractor operations.
  - **Purchasing Tax Groups**: a set of taxes for each purchasing tax obligation.
- **Pages:** 519 [27-1].

### 5. Receiving window
- **Open:** Purchasing group bar > **Receiving** shortcut. It opens on the list of unreceived Firm or Released POs.
- **Purpose:** Receive PO goods into stock or straight to linked WOs, and return received goods to the supplier. Each receipt creates a **Receiver ID**.
- **Layout:** 5 tabs.
  - **Receiving Activity**: grid with Purchase Order ID, Receiver ID, Desired Recv (the earlier of the header and line dates), Supplier, Message (e.g. "7 days late", shown in red). It shows either unreceived or received orders.
  - **Receiver**:
    - Header: Receiver ID (..., dropdown; auto-numbered on first view), Order ID, Supplier ID, Date, Receive On, Status (**Unapproved / Approved / Cancelled**; Approved is the default on save).
    - A large caption reads "Receipt" or "Return", with a Purchase From address box and a **Receive** button (or **Return**).
    - Grid columns: Line #, Part ID, Service ID, Description, Receive Qty (stock UM), Stock UM, Receive Qty (purchase UM), Purchase UM, Unit Price, `<Location ID>`, Transacted (checkbox).
  - **Receive From**: supplier address and contact override.
  - **Details**: override dates, FOB, Ship Via, Tax Group, Terms, Discount Class.
  - **Specs**: copied from the PO.
- **Toolbar:** Receiving Tools dropdown (#6); Refresh; Save. Right-click a row on the Activity grid and choose **Receive** to receive the whole order in one step.
- **Workflow (receive):**
  1. Double-click a PO on the Activity tab. The Receiver tab opens pre-filled.
  2. Adjust Receive Qty for a partial receipt, and adjust Location and price.
  3. Click **Receive**. Inventory transactions post. Linked lines are received to stock and then issued immediately to the linked WO operations in link order. Any excess goes to the default location. Service and description-only lines must be linked, or use an Expense ID.
  4. Answer the "Print Receiver?" prompt.
  5. The Receive button greys out and Transacted is checked. The PO, or its fully received lines, closes.
  6. Refresh the Activity list. A partially received PO reappears with the remaining qty.
- **Workflow (return):**
  1. Tools > Receiving View = View received orders.
  2. Double-click the receiver.
  3. Set the status.
  4. Click **Return**. Stock is removed and the PO stays Closed.
- **Rules:**
  - A processed Receiver cannot be edited. To correct one: Return it, reopen the PO, set it back to Released, save, and receive again.
  - Viewing a PO assigns a Receiver ID. Set the receiver to Cancelled to abandon it.
- **Links:** PO window, Receiver report, linked Work Orders (material issue), Part locations.
- **Pages:** 521-530 [28-1 to 28-10].

### 6. Receiving Tools menu (toolbar dropdown, or Tools > Receiving)
- Receiving View dropdown: **View unreceived orders / View received orders**.
- **Receive**, **Return**, **Edit Receiver...** (submenu), **Refresh (F5)**.
- **Pages:** 529.

### 7. Print Receiver prompt
- A Yes/No prompt after Receive. Yes prints the Receiver report to the default printer, laid out so it can be cut into per-link material tags.
- **Pages:** 526, 531.

### 8. Purchasing Reports (report selection dialogs; common report UI is in chapter 5)
- Parts and Service by Supplier (price breaks); **Purchase Order** (printable PO); Purchase Order Detail (with cost and receiving data); Purchase Order List; **Receiver** (tags: supplier, PO, linked job, location); Receiver List; Service List; **Supplier Delivery Performance** (promised vs actual, with a graph); Supplier List; **Supplier Price Performance** (price vs qty over time, with a graph); Tax Group List.
- **Pages:** 531-532 [29-1, 29-2].

---

## Section 7: Planning

### 9. Material Planning window
- **Open:** Planning group bar > **Material Planning** shortcut.
- **Purpose:** One workbench to link SO lines to WOs and to net demand against supply, then create WOs or POs. This is a simplified MRP; the user repeats it as needed.
- **Layout:** 3 tabs. Columns sort by clicking a header (Shift+click for descending). Shift and Ctrl give multi-select.
  - **Open Sales Orders**: Firm or Released SO lines. Grid columns: Desired Ship Date, Sales ID, Line No, Line Status, Order Status, Part ID, Fab'd (checkbox), Pur'd (checkbox), Lead Time (Days), Order Qty, Ship'd Qty, Qty Due, ... **WO Link Information**. Default view excludes fully linked lines. Only parts with the Fabricated flag can be linked.
  - **Non-Stocked Parts**: WO and SO demand for non-stocked parts (no Part ID, or Stocked not checked) and description-only material on Firm or Released orders. Rows show Work Order, Lot, Split, Sub, Seq and Piece, plus Part ID and Supplier ID; the full column list is not shown in the manual.
  - **Stocked Parts**: supply and demand netted by Part ID. Columns described: Qty On Hand (excludes Hold locations), Net Demand (Firm/Released WOs and SOs), Total Supply (open POs and WOs), **Projected On Hand** = On Hand + Supply - Demand, Order Point. Projected On Hand is colour-coded: **red** at or below safety stock, **blue** above safety stock but at or below the order point, **black** above the order point. Default view is shortages only.
- **Toolbar:** **Planning Tools** dropdown (#10); Refresh.
- **Workflow:**
  1. On Open SOs, link each SO line to an existing or new WO, or change the SO status.
  2. On Non-Stocked, select lines and create linked POs (grouped by supplier) or linked WOs.
  3. On Stocked (Short Only), create POs for purchased parts or WOs for fabricated parts.
  4. Refresh. New WOs can create new component demand, so repeat.
- **Links:** Create New WO dialog, Link SO Line dialog, PO window (opens pre-filled), Sales Order and PO windows (where links are broken), Material Netting and Order Point reports.
- **Pages:** 535-565 [30-1 to 30-31].

### 10. Planning Tools menu (toolbar dropdown)
- Top level: **Open Sales Orders >**, **Non-Stocked Parts >**, **Stocked Parts >**. Only the submenu for the active tab is enabled.
- **Open Sales Orders submenu:** View (**View All / Exclude Fully Linked**); **Link Order Line to >** (Work Order... opens the Link dialog; or a status Unreleased/Firm/Released creates a new linked WO); **Create Work order...** (unlinked); **Change Sales Order Status >** (status list; applies to the whole SO, not a single line).
- **Non-Stocked Parts submenu:** View; **Create Purchase order for supplier... >** (the part's default supplier name, or an **Other:** dropdown listing all suppliers); **Create Work Order...**.
- **Stocked Parts submenu:** View (**View All / Short Only**); Create Purchase order for supplier...; Create Work Order....
- A warning "Selected rows are fully linked." appears if the line is already linked.
- **Pages:** 538-539, 541-542, 549-552, 559-562.

### 11. Link Sales Order Line to Work Order dialog
- **Open:** Planning Tools > Open Sales Orders > Link Order Line To > Work Order.
- **Layout:** grid with Work ID, Lot ID, Split ID, Order Status, Release Date, Want Date, Desired Qty, ...; a **Show Fully Linked Work Orders** checkbox; OK and Cancel.
- **Workflow:**
  1. Select the WO row.
  2. Click OK.
  3. Refresh. The link shows in the WO Link Information column.
- **Pages:** 540-541.

### 12. Create New Work Order dialog
- **Open:** Planning Tools > Link Order Line To > (status), or Create Work Order..., on any of the 3 tabs.
- **Fields:**
  - New Work ID (blank = next number), New Lot ID (blank = 1), New Split ID (0).
  - Part ID and Description (read-only).
  - Copy Eng ID: the engineering master to copy. With no master, a header-only WO is created.
  - Release Date: Want Date minus lead time; from Non-Stocked it is calculated by the scheduler.
  - Want Date: the SO Desired Ship Date or the scheduler need date.
  - Status: Firm by default from Stocked; the chosen status when creating a linked WO.
  - Order Qty: the SO Qty Due, the demand qty or the Order Point qty. Any qty above demand goes to stock.
  - **Forward Schedule from release date** checkbox.
  - Buttons: Create, Cancel.
- **Pages:** 542-548, 554-556, 562-565.

### 13. Scheduling window ("Scheduling :: STANDARD")
- **Open:** Planning group bar > **Scheduling** shortcut.
- **Purpose:** Run the scheduler (the standard edition is **infinite capacity** only; finite needs the Premium edition) and view the schedule. Dates from the STANDARD schedule feed the WO header cards and Material Planning.
- **Layout:** 3 tabs.
  - **Resource Details**: a Shop Resource ID dropdown (*All*, or a single resource). Grid columns: Resource ID, Work ID, Lot ID, Split ID, Sub ID, Seq #, Start Date, Finish Date, Qty, Cmp Qty, Status.
  - **Work Order Details**: a Work ID dropdown and the same grid filtered to one WO.
  - **Schedule**: Gantt chart.
    - Top left: the schedule name with a checkbox, and the shift numbers "123".
    - Date bar: today is highlighted blue. It shows hours 00-23 in Day mode, day numbers in Week and Month mode, and month names in Year mode.
    - Resource names are listed on the left, with small white available-capacity boxes for each shift and white shift-capacity bars.
    - Operation bars are labelled "WO/Lot(Seq)". Colours: **light blue** normal, **red** late, **yellow** highlighted WO, **green** determinant path, **olive** late determinant path.
    - Clicking a bar gives it a dashed selection border.
- **Menus:** Tools > Scheduling (#14); Tools > **Weekly Calendar** (#17); Tools > **Calendar Exceptions** (#18); Options > **Set Load Horizon** (#15).
- **Workflow:**
  1. Scheduling icon dropdown > **Schedule All...** (#16).
  2. Choose a resource or WO on the details tabs.
  3. Click the Schedule tab to see the Gantt chart.
  4. Highlight a WO or its determinant path to analyse lateness.
  5. Adjust calendars, exceptions, priorities, or add resources, and re-run.
- **Pages:** 567-597 [31-1 to 31-31]. Concepts are on pp. 567-576: load vs capacity, backward/forward scheduling, operation duration = setup + qty x run + move, min move qty overlap, discontinuous operations, min/max units, priority 1-999, determinant path.

### 14. Scheduling Options menu
- **Open:** right-click in the Schedule tab, Tools > Scheduling, or the toolbar Scheduling icon.
- **Items:**
  - Display Mode (Day / Week / Month / Year); Zoom (%).
  - Toggles: **Operations** (F11), **Capacity**, **Grid lines**.
  - **HighLight Work Order Immediate** (Shift+F11), **Remove Highlight Immediate**, **Highlight Determinant Path** (toggle).
  - **Schedule All...**.
  - **Right-click Info** (a popup on right-click showing WO, start and finish), **DataTips** (a hover tooltip with the same data).
- **Pages:** 588-597.

### 15. Set Load Horizon dialog
- Options > Set Load Horizon. One field: number of days (default 90). OK.
- **Pages:** 579.

### 16. Schedule All Orders dialog
- **Fields:**
  - Schedule ID (STANDARD, read-only); **Infinite Schedule** checkbox (locked on in the standard edition).
  - Dates: **Schedule as of** (date-time; defaults to the last run date), **Treat Release Dates as Hard**.
  - Sort By: **Order Want Date / Priority Want Date**.
  - Schedule started work orders: **Normally / First, Don't Freeze Started Operations / First, Freeze Started Operations**.
  - Buttons: OK, Cancel. A progress bar runs at the bottom.
- **Pages:** 593-595.

### 17. Weekly Calendars window
- **Open:** Tools > Weekly Calendar (Scheduling window or Shop Resource context). The default comes from System Settings.
- **Layout:** Schedule ID dropdown (** All **), Resource ID dropdown (** All **). Grid columns: Day of Week, 1st Shift Start, Shift 1, Shift 2, Shift 3 (hours). Buttons: OK, Cancel, Apply.
- **Pages:** 598, 701.

### 18. Calendar Exceptions window
- **Open:** Tools > Calendar Exceptions.
- **Layout:** Schedule ID and Resource ID dropdowns (default All). Grid columns: Start Date, End Date, 1st Shift Start, Shift 1/2/3 Duration, Shift 1/2/3 Capacity. Buttons: **Insert, Delete, OK, Cancel, Apply**.
- **Workflow:**
  1. Optionally filter to one resource.
  2. Click Insert. A new row defaults to today.
  3. Enter the start and end dates and the shift start.
  4. Enter durations. Use 0 to block a shift.
  5. Enter capacities only to override a resource's capacity; leave them blank for a shop-wide exception.
  6. Click Apply, then OK.
- **Pages:** 598-602, 701.

### 19. Planning Reports
- **Material Netting** (SO and WO demand vs PO and WO supply, by Part ID range); **Order Point** (stocked parts vs order points); **Resource Schedule** (dispatch list; late operations in red); **Work Order Shortage** (unissued material on Firm/Released WOs, with on hand, on order and missing).
- **Pages:** 603-604.

---

## Section 8: Shopfloor

### 20. Work Order window
- **Open:** Shopfloor group bar > **Work Order** shortcut (Shift+click opens a second window for drag-copy).
- **Purpose:** Define and track a production order. It has the same card-diagram routing/BOM as Engineering and Quote Masters, plus status, dates and actuals.
- **Layout:** 5 tabs.
  - **Work Order**:
    - Work/Lot/Split ID (... plus 3 boxes; `<auto number>`), Part ID (...), Description.
    - Quantity, Order Status, Release Date, Want Date; read-only Rec'd Qty, Printed Date, Close Date.
    - Engineered By, Engineered Date, Drawing ID/Rev/Page, Drawing File (... plus an open button).
    - Product Code ID, Commodity Code ID, Account Set ID; Global Rank (0-100, default 50, 0 is highest); **Forward Schedule** checkbox.
  - **Details**: the graphical bill of manufacture made of **information cards**:
    - **Header card** (white, bottom). 4 lines: [status letter] Job/Lot and description; qty; want and release dates (after scheduling: ±days early or late, want date (scheduled finish), release date (scheduled start)); qty received. A black progress bar shows receipt progress.
    - **Operation cards** (green = inside, **blue** = outside service/contractor). 3 lines: Seq, Resource and description; setup, run and move hours; start and end qty. A fuchsia progress bar shows completion.
    - **Material cards** and **Tool/Fixture cards** (red). 2 lines: Piece #, Part and description; required qty (and issued qty).
    - **Leg/Detail cards** (white, joined to the parent operation by a line). 2 lines: Sub ID, Part and description; required qty.
    - Card icons: File (opens the drawing), Specs, Picture, Additional Resources.
  - **Specs**: work instructions; these print on the Traveler.
  - **Picture**: right-click > Insert Picture / Stretch to Fit / Clear Picture; drag a rectangle to zoom.
  - **Browse**.
- **Right-click on a card / Details area:**
  - Add Operation..., Add Material..., Add Leg/Detail..., Edit (or double-click).
  - Cut (marks for delete; grey), Copy, Paste, Delete.
  - Right-click Info (large card popup), Data Tips, Show Details, Show Costs, Purchase this material/service.
- **Menus:**
  - File > **New Document From > Eng Master / Quote Master / Work Order** (#24); Save.
  - Edit > Copy Document / Paste Document / Clear Document / Delete Document (blocked if the WO has material or labor transactions or SO/PO links) / Cut / Copy / Paste / Delete.
  - Options > **Copy Subordinates** (toggle), Right-click Info, Data Tips.
  - Tools > **Change Status** (#34), **Purchase this material/service** (#28), **Schedule...** (schedules this WO only), **Variables** (#33), Show Details, Show Costs.
  - View > **Picture**, **View Drawing**, **Material Availability...** (#29), **Inventory Txs...** (#30), **Labor Txs...** (#31), **Sales Order Links...** (#32).
  - Toolbar: Show Details, Show Costs, Right-click Info and Data Tips icons; Copy, Paste and Clear Document.
  - Window > Tile Horizontally (used for drag-copy between two WO windows).
- **Workflow (build from scratch):**
  1. Enter or leave blank the WO, Lot and Split IDs.
  2. Pick a Part. Codes, drawing and account set default.
  3. Enter qty, Engineered By, Global Rank and Forward Schedule.
  4. On Details, right-click the header and **Add Operation**s (and services) to build the structure, then add Legs.
  5. Add Materials and Tools to the operations.
  6. Fill in the card details.
  7. Enter Specs and a Picture.
  8. Save.
  9. Set the status to Firm or Released and schedule.
- **Other ways to build:** copy by dragging cards from another WO, Eng Master or Quote Master window (paste rules: operation onto header or operation; material onto operation; leg onto operation); New Document From; Copy/Paste Document into a blank WO.
- **Pages:** 607-684 [33-1 to 33-78].

### 21. Operation window ("Operation - <WO>/<Lot>/<Split>/<Sub>/<Seq> - [New]")
- **Open:** Right-click the header or a leg card > Add Operation, or double-click an operation card.
- **Layout:** 5 tabs plus OK, Cancel, Apply.
  - **Operation**:
    - Template ID (...; locked after save), Seq # (auto +10; unique within the leg), Description, Resource ID (...).
    - Contractor-only fields: Service ID (...), Supplier ID (...), Supplier Service ID.
    - Setup Hrs (becomes **Transit Days** for a contractor), Run, Run Type (HRS/PC, PCS/HR, MIN/PC, PCS/MIN, LOADS/HR, HRS/LOAD), Load Size Qty, Move Hrs, Min Move Qty.
  - **Specs**.
  - **Costs**: Setup/hr, Run/hr, Run/unit, Run/operation; Setup bur/hr, Run bur/hr, Burden/unit, Burden/oper; Setup %, Run %; **Preserved** checkbox (set automatically on override; protects the values from Reset). A contractor only has Run/unit and Run/operation.
  - **Add'l Resources**: grid with `<Resource ID>`, Step (Setup/Run/Both), Duration %, Justification (At Start/At End), Sched Type (Normal/Discontinuous), Min Size. These are for scheduling only and add no cost.
  - **Other**: Scrap or Yield %, Scrap mode / Yield mode, Fixed Scrap Units; Calc'd Start Qty and Calc'd End Qty (read-only); Override Start Qty, Override End Qty; Min Capacity, Max Capacity (1-255 units).
- **Pages:** 631-641 (cost and hours formulas on pp. 670-673).

### 22. Material window (also used for Tool/Fixture cards)
- **Open:** Right-click an operation card > Add Material, or double-click a material card.
- **Layout:** 4 tabs.
  - **Material**: Part ID (... ; optional), Piece # (auto +10), Reference, Description, Qty Per, Type (Start quantity / End quantity), Fixed Qty, Scrap %, Issued Qty (read-only), Dimensions (a formula using WO variables; non-piece-tracked parts only), Length/Width/Height (piece-tracked parts), Usage U/M (...; needs a UM conversion).
  - **Specs**.
  - **Costs**: Unit cost (material / labor / burden / service), Fixed cost, Burden %, Burden/unit, Preserved. Values are auto-updated from supplier price breaks on save when the purchasing fields match.
  - **Purchasing**: Supplier ID (...), Supplier Part ID (...), Mfg Name, Mfg Part ID.
- **Pages:** 642-648.

### 23. Leg/Detail window
- **Open:** Right-click an operation > Add Leg/Detail, or double-click a leg card.
- **Layout:** 2 tabs.
  - **Leg/Detail**: Part ID (...), Fab, Pur and Tool/Fixt flags (read-only), Piece No, Description, Sub ID (auto), Qty Per, Type, Fixed Qty, Reference, Scrap %, Dimensions, Length/Width/Height, Usage U/M.
  - **Specs**.
- **Purpose:** A subassembly built within the same WO. Use a material card instead if the subassembly is stocked.
- **Pages:** 649-653.

### 24. New Work Order from ... dialog
- **Open:** File > New Document From > Eng Master / Quote Master / Work Order, with a blank WO open.
- **Layout:** one ID field with "..." (e.g. Quote Master ID); buttons Copy and Cancel. Copy creates, auto-numbers and saves the new WO.
- **Pages:** 629-630.

### 25. Open a Picture File dialog
- Standard file-open dialog with an **Enable Preview** checkbox. Opened from Picture tab > right-click > Insert Picture.
- **Pages:** 625-626.

### 26. Show Details window ("Details")
- **Open:** Toolbar Show Details, Tools > Show Details, or right-click in Details.
- **Layout:** The left pane is an expandable tree of the cards. Icons: grey gear = header, green hammer = internal operation, blue hammer = outside operation, red bolt = material, card icon = leg. The right pane is a Name/Value property grid for the selected card (e.g. Quote Master ID, Sub ID, Seq #, Resource ID, Run Type, Transit Days, Scrap/Yield Type, Template ID, Drawing, Capacity Usage Max/Min, Scheduling type, Supplier ID, ...). Read-only.
- **Pages:** 663-666.

### 27. Show Costs window ("Costs")
- **Open:** Toolbar Show Costs, Tools > Show Costs, or right-click in Details.
- **Layout:** menu bar Edit and View (Exit). Indented tree grid with columns: Detail, Quantity, Estimated, Actual, Variance, Projected, Estimated Total Hours, Actual Total Hours, Variance Total Hours.
- **View menu toggles:** Show Estimated / Actual / Variance / Projected Cost Detail (adds Unit, Material, Labor, Burden and Service columns); Show Estimated / Actual / Variance Hours Detail (adds Setup and Run columns). Clicking a column header also expands it.
- Hovering a cell shows a data tip with the cost or hours breakdown (5 s).
- **Pages:** 667-675.

### 28. Purchase Material dialog ("Purchase Material :: <WO card> - <Part>")
- **Open:** Select a material or service card > Tools or right-click > **Purchase this material/service**.
- **Layout:**
  - Upper grid: Workorder ID, Sub ID, Seq No, Pc No, Net Qty Req'd, Net P...
  - Fields: Req'd Qty, Req'd Pcs, **Link to Each Material** checkbox (default on), **Create Purchase Order** button.
  - Lower panel "Existing Purchase Order Links for the selected material": Total Qty Required, Total Qty Issued, and a grid with Order ID, Line No, Supplier ID, Supplier Part ID, Order Qty (SKU), Rec'd Qty (SKU)...
  - Close button.
- **Workflow:**
  1. Review the need.
  2. Click Create Purchase Order. The PO window opens pre-filled and linked.
  3. Complete the PO.
- **Pages:** 677.

### 29. Material Availability dialog ("Material Availability for Work Order :: <WO>")
- **Open:** View > Material Availability...
- **Layout:** grid with Part ID, Sub ID, Seq No, Piece No, Qty Req'd, Qty Issued, On Hand, Projected Available (negative values in red). Close button.
- **Pages:** 678-679.

### 30. Inventory Transactions dialog
- **Open:** View > Inventory Txs... (Work Order window or Material Issues window).
- **Layout:** grid with Sub Id, Seq No, Piece No, Issue Datetime, Issued Qty, Act Mat Cost, Act Lab Cost, Act Bur Cost, Act Ser Cost... When opened from Material Issues it has a Part ID selector (...).
- **Pages:** 679, 730.

### 31. Labor Transactions dialog
- **Open:** View > Labor Txs...
- **Layout:** grid with Sub Id, Seq No, Resource Id, Operation Step, Setup Completed, Run Completed, Transaction date...
- **Pages:** 679-680.

### 32. Sales Order Line Links dialog ("Sales Order Line Links for Work Order :: <WO>")
- **Open:** View > Sales Order Links...
- **Layout:** grid with Sales Order ID, Line No, Customer ID, Customer Name, Link Qty, Sales Order Qty, Shipped Qty, Line Status. Close button.
- **Pages:** 680.

### 33. Work Order Variables dialog
- **Open:** Tools > Variables.
- **Layout:** grid with Name (max 30 characters) and Value (6 decimals); buttons OK, Cancel, Delete.
- **Purpose:** Variables are referenced in material and leg **Dimensions** formulas. Operators: `+ - * / ** ( )`. Example: `THICKNESS*WIDTH*INDEX*DENSITY/PARTSPERHIT`.
- **Pages:** 681-684.

### 34. Change Status submenu
- **Open:** Tools > Change Status, with a card selected.
- **Cascade rules:** a header change applies to all cards; a leg change applies to its subordinates; an operation or material change applies to that card only. Closed or Cancelled cards are skipped. The change applies on Save.
- **Pages:** 676.

### 35. Shop Resource window
- **Open:** Shopfloor group bar > **Shop Resources** shortcut.
- **Purpose:** A schedulable, costed asset such as a machine, work center, person or contractor.
- **Layout:** 3 tabs.
  - **Resources**: Resource ID (..., dropdown; max 15 characters), Description (...; max 60 characters), Resource Type (Machine, Assembly Area, General Area, Contractor, Group, Individual/Team), Schedule Method (Infinite/Finite; greyed out unless Premium), Schedule Type (Normal / Discontinuous, with a minimum segment), Exclusivity (Inclusive/Exclusive; for groups). Capacity panel: Shift 1, Shift 2, Shift 3 units (0-255).
  - **Costs**: Setup per Hour, Run per Hour, Run per Unit; Burden per Hour (Setup) with a %, Burden per Hour (Run) with a %, Burden per Unit (Run), Fixed Burden; Account Set ID (...). Most cost fields are greyed out for the Contractor type.
  - **Browse**.
- **Menus:** Tools > **Reset Operation Costs...** (#36); View > **Where Used** (#37); Edit > Delete Document (with a warning about data integrity if the resource is in use). Weekly Calendar and Calendar Exceptions are per resource (#17, #18).
- **Workflow:**
  1. Enter the ID, type, scheduling options and shift capacity.
  2. Enter cost and burden rates.
  3. Save.
  4. After a rate change, run Reset Operation Costs.
- **Pages:** 685-701 (group and schedule algorithm table on p. 690).

### 36. Reset Operation Costs dialog
- **Fields:**
  - **Current Resource Only / All Resources**.
  - Reset costs on: Quote Master, Engineering Master and Work Order Operations (checkboxes).
  - According to Operation Status (Unreleased, Firmed, Released, Closed, Cancelled, All).
  - According to Operation Template ID (Template ID ...).
  - According to W/O or Master Creation Date (On or After, On or Before).
  - Buttons: OK, Cancel; progress bar.
- Operations marked Preserved are skipped.
- **Pages:** 694-695.

### 37. Resource Where Used dialog
- **Open:** View > Where Used.
- **Layout:** Resource ID (...) with the description shown below it. Include Document Type checkboxes: Engineering Master, Quote Master, Work Order. Grid columns: Document Type, Document ID, Sub ID, Seq No, Setup Hrs, Run, Run Type, Load... Close button.
- **Pages:** 698-700.

### 38. Shop Group window
- **Open:** Shopfloor group bar > **Shop Groups** shortcut.
- **Layout:** tabs Shop Groups and Browse. Shop Group ID (..., dropdown; lists Group-type resources, and a new ID automatically creates a Group resource), Description (...). Grid columns: Seq # (auto 10), `<Resource ID>`, Description.
- **Workflow:**
  1. Pick or enter a group.
  2. Add member resources in priority order. The lowest Seq is preferred for Exclusive groups.
  3. Save.
- Delete Document also deletes the Group resource.
- **Pages:** 703-709.

### 39. Shop View window
- **Open:** Shopfloor group bar > **Shop Views** shortcut.
- **Layout:** tabs Shop Views and Browse. Shop View ID (max 15 characters), Description. Grid columns: Seq #, `<Resource ID>`, Description.
- **Purpose:** A named resource subset (e.g. "ASSY") used to filter the Scheduling window and reports.
- **Pages:** 711-716.

### 40. Labor Entry window
- **Open:** Shopfloor group bar > **Labor Entry** shortcut.
- **Purpose:** Post labor tickets (actual labor and burden cost, and completion qty) against Firm or Released WO operations.
- **Layout:** 2 tabs.
  - **Labor Entry**:
    - Header: **New** button, Transaction Date, Employee Clock No (...), Type (**Setup / Run**; changes which fields are enabled), Shift No.
    - Body: Work/Lot/Split (... plus 3 boxes), Sub/Seq (... plus 2 boxes; opens the Work Order List dialog and warns if the operation is not open), Clock In and Clock Out (date and time; default 8:00 AM), Shift Type (Regular 1x, Overtime 1.5x, Double 2x, Triple 3x), Completed Qty, Deviated Qty (scrap; Run only), Completed checkbox (setup or run complete), Description (deviation note), Reason Code (...), Operation Qty and Completed Qty (read-only to date).
    - Bottom ticket grid: Entry No, Transaction Date, Employee Clock No, Type, Work Order, Sub ID, Seq No, Hours, Cumulative, Clock In, ...
  - **Labor Reversal**:
    - Filter options: **All / Employee / Work Order / Resource**, each with a matching ID selector (Clock No, Work Order + Lot + Split, or Resource ID); Transaction Date with a checkbox.
    - Buttons: **Show**, **Reverse**.
    - Grid columns: Transaction Date, Completed Qty, Work Order ID, Seq No, Clock No, Resource... Reversed rows show in red.
- **Workflow (entry):**
  1. Click New. Set the date, employee, Setup/Run type and shift.
  2. Pick the WO and then the Sub/Seq.
  3. Enter clock in and out times and the shift type.
  4. Enter the completed qty and any deviated qty with a reason.
  5. Check Completed if done.
  6. Save. Cost = hours x employee rate x shift multiplier, plus resource rates.
- **Workflow (reversal):**
  1. Choose a filter.
  2. Click Show.
  3. Select a row.
  4. Click Reverse.
  5. Save.
- **Pages:** 717-724.

### 41. Material Issues window
- **Open:** Shopfloor group bar > **Material Issues** shortcut.
- **Purpose:** Issue stock material to WO operations, or return it with a negative qty. Linked PO receipts issue automatically. You can also add material "on the fly" for time-and-material jobs.
- **Layout:** single tab.
  - Header: Date, **Show all** checkbox (include already-issued rows), Work/Lot/Split ID (... plus dropdowns; Firm or Released WOs only).
  - Buttons: **Select All**, **UnSelect All**, **Select All for Return**.
  - Grid columns: Issue On Save (checkbox), Sub ID, Seq No, Piece No, `<Part ID>`, Issue Qty (red if on hand is short), Length, Width, Height, `<Usage U/M>`, Close Now (checkbox; closes the requirement). Typing in a blank row adds a new material card to the WO.
- **Menus:** View > **Inventory Pieces** (#42), View > **Inventory Txs...** (#30).
- **Workflow:**
  1. Pick the WO. Open requirements load into the grid.
  2. Adjust Issue Qty. A partial issue leaves the balance open.
  3. Tick Close Now where needed.
  4. Save.
- **Pages:** 725-730.

### 42. Inventory Pieces dialog
- **Open:** View > Inventory Pieces (Material Issues).
- **Layout:** Part ID (...) with the description below it. Grid columns: Part ID, Location ID, Length, Width, Height, Dimensions U/M, Piece Count.
- **Pages:** 729.

### 43. Work Order Receipts window
- **Open:** Shopfloor group bar > **Work Order Receipts** shortcut.
- **Purpose:** Receive finished output of unlinked WOs into inventory, return received qty to the floor (which reopens the WO), and close WOs short.
- **Layout:** single tab.
  - Option buttons: **Show All Currently Open Work Orders / Show All Previously Received Work Orders**.
  - Grid columns: Transact Now, For Return, Close Short (checkboxes), WorkOrder ID, Lot ID, Split ID, Part ID, Desired Quantity, Received Quantity, Rec/Rtn Quantity, `<Location>` (defaults to the primary location).
- **Workflow (receive):**
  1. Find the WO row.
  2. Adjust the location and qty. Editing auto-ticks Transact Now.
  3. Save. Parts and costs move to stock, and a fully received WO closes.
- **Workflow (return):**
  1. Choose Show Previously Received.
  2. Select the row, location and qty.
  3. Save. The WO is re-released.
  4. Note: an unknown location is added to the part, possibly with negative on-hand.
- **Pages:** 731-735.

### 44. Employees window
- **Open:** Shopfloor group bar > **Employees** shortcut.
- **Layout:** single editable grid with Clock No (max 15 characters), Name (max 50 characters), Shift #, Cost/Hr, Cost/Unit.
- **Workflow:**
  1. Type a row.
  2. Save.
  3. Edit in place, then Save. To delete: DELETE, then Save. Deletion is denied if the employee has labor tickets.
- **Pages:** 737-741.

### 45. Shopfloor Reports
- Calendar Exception List; Calendar Week List; Customer Throughput (linked WOs only); **Cut List** (piece-tracked material by size); Employee Efficiency; Employee List; Employee Throughput; Labor Analysis; Labor Transaction; Labor List; **Pick List**; **Production** (daily made, scrapped and received); Quality Tracking Graph; Quality Performance (PPM by reason); Resource Efficiency; Resource Throughput; **Resource Utilization**; Resource Where Used; **Schedule Performance**; Shop Cost Performance; Shop Resource List; Shop View List; **Traveler** (the printed WO, including specs); **WIP Value**; Work Order Audit; **Work Order Cost** (estimate vs actual by material, labor, burden and service); Work Order History; Work Order List (by status).
- **Pages:** 743-746.

### 46. Generic ID browse/lookup dialog
- **Open:** Any "..." button next to an ID field, or a `<Column>` cell in a grid.
- **Layout:** title "<Entity> browse". A sortable grid of the records, with a vertical scroll bar; OK and Cancel.
- **Workflow:** Click a row header and click OK, or double-click the row.
- A Work Order browse lists each Lot/Split as its own row. The Sub/Seq lookup opens a "Work Order List" dialog of the operations.
- **Pages:** 699-700, 706, 720.

---

## Cross-screen workflows

1. **Stock replenishment purchase:** Material Planning > Stocked Parts (Short Only) > select rows, using Shift/Ctrl to group by supplier > Create Purchase Order for supplier > **PO window** opens pre-filled (identical parts consolidated into one line) > set status Firm/Released, save, print **Purchase Order report** > **Receiving**: double-click the PO > adjust qty and location > Receive > print the **Receiver** > PO closes when complete. Optionally run **Supplier Delivery/Price Performance** reports afterwards.

2. **Job-linked purchase (make-to-order material or outside service):** Starts from one of:
   - Material Planning > Non-Stocked Parts > Create Purchase Order for supplier;
   - Work Order window > card > Purchase this material/service > **Purchase Material** dialog > Create Purchase Order;
   - the PO Line **Links** tab, filled in manually.

   Then: the PO line is linked to the WO/Lot/Split/Sub/Seq/Piece > Receiving: Receive puts the goods into stock and immediately issues them to the linked WO operations in link order, with any excess to stock. Service lines complete the Contractor operation. No separate Material Issue is needed. Returns go through Receiving Tools > View received orders > Return. Correcting a receipt: Return, reopen the PO as Released, receive again.

3. **Sales order to production:** Sales Order (outside this range) set to Firm/Released > Material Planning > Open Sales Orders > Link Order Line To > Work Order (**Link dialog**) or a status (**Create New WO dialog**; release date = ship date minus lead time; copies the engineering master) > the WO is created and linked > the WO's component demand appears on the Non-Stocked/Stocked tabs > create component WOs and POs > repeat until no shortages. A linked WO ships directly to the SO without going through stock. Links are broken from the SO or PO line Links tab.

4. **Work order build and release:** Work Order window: from scratch (Add Operation / Material / Leg via right-click), drag-copy from another master, or New Document From > Eng/Quote Master/WO > fill in the **Operation / Material / Leg** windows > Show Costs to check the estimate > Change Status to Firm/Released > Tools > Schedule..., or wait for the Schedule All run > print the **Traveler**, Pick List and Cut List.

5. **Schedule, then dispatch, then labor ticket:** Maintain the Shop Resources (capacity, calendars), Shop Groups and Shop Views > Scheduling > Schedule All Orders (as-of date, sort, frozen started operations) > review the Resource Details / WO Details grids and the Gantt chart (late = red, determinant path = green) > fix with Calendar Exceptions, Global Rank or resources and re-run > print the **Resource Schedule (dispatch)** report > operators work > **Labor Entry**: Setup ticket, then Run tickets with completed and deviated qty, and Completed checked > completion feeds back into the scheduler (prorated remaining time, setup skipped once done) and into WO actual cost > errors are undone with **Labor Reversal**.

6. **Material to the floor:** For unlinked stock material, use **Material Issues** (pick the WO, Issue Qty, Close Now, Save). Returns use a negative qty or Select All for Return. Check shortages with WO > View > Material Availability or the Work Order Shortage report. History: View > Inventory Txs.

7. **Finish and close:** **Work Order Receipts** (Transact Now; location) moves the finished qty and its cost into stock and closes the WO when it is complete. Close Short ends a WO early. Returns re-release the WO. Review the WO Cost, WIP Value, Production and efficiency reports. Show Costs gives estimate vs actual vs variance for each card.

8. **Cost maintenance loop:** Supplier Part Prices update the master and WO material unit costs on save (unless Preserved). Shop Resource rate changes are pushed with Reset Operation Costs. Employee Cost/Hr times the Labor Entry shift multiplier gives actual labor cost.

## Notes for the N-Line ERP emulation
- These are the core document windows: **PO, Supplier, Receiving, Material Planning, Scheduling, Work Order (card diagram), Labor Entry, Material Issues, WO Receipts**. Everything else is a dialog or a code table.
- The **WO card diagram** (Details tab) is the most distinctive UI. Each card's colour and line format is specified above (pp. 610-618) and needs a graphical canvas, not a grid.
- **Linking** (PO line or SO line to WO/Lot/Split/Sub/Seq/Piece) is the key data concept that drives automatic issue on receipt and direct shipment.
- The standard Jobshop scheduler is **infinite capacity** only. Finite is a Premium option and is greyed out in the screenshots.
