# VISUAL Jobshop screen inventory, part 2: Engineering, Sales, Inventory

Source: Infor VISUAL Jobshop User Guide (`VJSUserGuideEnu.pdf`), pages 269-480 (Section 3 Engineering ch. 10-12, Section 4 Sales ch. 13-18, Section 5 Inventory ch. 19-24). Page numbers below are PDF page numbers (1-based), not the printed "10 - 2" style page labels.

## Conventions shared by all Jobshop document windows

These apply to almost every screen below, so the entries don't repeat them:

- **Opening a window**: click a *Group bar* in the left navigator (Engineering, Sales, Inventory, ...), then the shortcut icon. Hold SHIFT while clicking the icon to open a second copy of the same window, for example to drag cards between two masters.
- **Title bar** shows `<Window> :: New` or `<Window> :: <ID>`.
- **ID fields with a "..." button** open a browse/lookup table: a grid with columns, row headers, and double-click or OK to pick. Most IDs also have a dropdown. A blank ID on a new document means auto-number (prefix/suffix from System Settings).
- **Standard toolbar and File/Edit menu**: Save; Clear Document (blank the window for a new record); Copy Document / Paste Document (clone a whole record, with the ID cleared); Delete Document (asks for confirmation; refused if the record is referenced elsewhere); Refresh; Close Window (prompts to save unsaved changes).
- **Editable grids**: a row-header marker shows the row state. `*` is the new-row line, `+` is new and unsaved, a check mark is edited and unsaved, and a red X is marked for delete. DELETE on a row header marks the row; Save commits. A column header shown as `<Column>` in angle brackets can be double-clicked to browse for its value.
- **Browse tab**: most master windows end with a Browse tab, a sortable list of all records ("Advanced Browsing", ch. 2).
- **Specs tab**: free text. CTRL+ENTER starts a new line. Specs copy down to work orders and print on travellers and documents.
- **Picture tab**: right-click gives Insert Picture (opens the Open a Picture File dialog, with an Enable Preview checkbox; BMP, JPEG and GIF), Stretch to Fit and Clear Picture. Drag a rectangle to zoom into part of the picture.
- **Line-detail sub-windows** (Operation, Material, Order Line) have OK / Cancel / Apply. Values take effect when the field is left or Apply is clicked.

## Summary table

| # | Screen | Module | Purpose | Pages |
|---|---|---|---|---|
| 1 | Engineering Master window | Engineering | Header and tabs for a reusable BOM/routing template per part | 272-273, 284-293, 316-324 |
| 2 | Details tab: information-card canvas | Engineering (also used by Quote Master and Work Order) | Graphical bill of manufacture: header, operation, material, leg and service cards | 274-283, 287, 290-293, 317-323 |
| 3 | Operation window | Engineering | Add or edit a routing step (internal or outside service) | 294-304 |
| 4 | Material window (and Tool/Fixture) | Engineering | Add or edit a component on an operation | 305-311 |
| 5 | New Leg/Detail window | Engineering | Add a subassembly leg under an operation | 312-315 |
| 6 | Show Details window | Engineering | Read-only indented tree of the master's structure | 325-328 |
| 7 | Show Costs window | Engineering | Indented cost and hours rollup | 328-336 |
| 8 | Material Availability for Engineering Masters | Engineering | Snapshot of on-hand stock against the master's material requirements | 337-338 |
| 9 | Operation Templates window | Engineering | Reusable operation definitions (resource, times, costs) | 339-353 |
| 10 | Engineering report selection | Engineering | Five engineering reports | 355 |
| 11 | Sales Order window | Sales | Customer order header and lines with totals | 359-375 |
| 12 | Order Line window | Sales | Line detail: part, quantity, price, overrides, specs, work-order links | 364-368 |
| 13 | Create Sales Order from Quote dialog | Sales | Convert a quote into a sales order | 370-371 |
| 14 | Customers window | Sales | Customer master: contact, account/credit, defaults, ship-to addresses, prices | 377-391 |
| 15 | Customer Prices tab (quantity-break table) | Sales | Customer-specific part prices and quantity breaks | 384-389 |
| 16 | Sales Information Tables | Sales | Lookup tables: Service Charges, Tax Groups, Sales Reps, Territories, SIC, Carriers, Discount Classes | 393-395 |
| 17 | Shipping window | Sales | Ship (or return) sales order lines; creates the shipper and pack list | 397-408 |
| 18 | Invoicing window | Sales | Invoice shippers and returns; posts AR/revenue transactions | 409-416 |
| 19 | Sales report selection | Sales | 16 sales reports and lists | 417-418 |
| 20 | Parts window | Inventory | Item master: identity, planning, costing, locations, unit conversions | 421-440 |
| 21 | Part Where Used dialog | Inventory | Masters and work orders that use a part | 441-443 |
| 22 | Inventory Pieces dialog | Inventory | On-hand dimensional pieces of a piece-tracked part | 444, 476 |
| 23 | Inventory Transactions dialog | Inventory | Transaction history for one part | 445, 477 |
| 24 | Reset Material Costs dialog | Inventory | Push current part costs into masters and work orders | 446-447 |
| 25 | Units of Measure window | Inventory | UoM table | 449-454 |
| 26 | Unit Conversions window | Inventory | Global UoM conversion factors | 455-460 |
| 27 | Locations window | Inventory | Warehouse location table | 461-466 |
| 28 | Inventory Adjustments window (Adjustments and Transfers tabs) | Inventory | Adjust in/out and location-to-location transfers, entered as a batch | 467-478 |
| 29 | Inventory report selection | Inventory | 13 inventory reports | 479-480 |

---

## Section 3: Engineering

### 1. Engineering Master window
- **Open**: Engineering group bar > **Engineering Master** icon. The title shows `Master :: New` or `Master :: <Part>/<Master ID>`. (p272)
- **Purpose**: Engineering master = reusable bill of manufacture (routing and BOM) for a part. It is copied into quote masters and work orders. It has no effect on the scheduler. (p271)
- **Layout**: five tabs.
  - *Engineering Master* (header; p272, p285-286):
    - Part ID [...] with a dropdown, then `/` Engineering Master ID (a blank ID auto-numbers).
    - Description [...]; Quantity (default 1.0000).
    - Product Code ID [...]; Commodity Code ID [...].
    - Engineered By (60 chars); Engineered Date (calendar, defaults to today).
    - Drawing ID / Rev / Page; Drawing File [...] with an open/view button; Account Set ID [...].
    - Global Rank, plus a Forward Schedule checkbox. Both apply only once the master is copied to a work order.
    - Picking a Part ID fills Description, Product Code, Commodity, Drawing and Account Set. Overrides stay on the master only.
  - *Details*: the card canvas (screen 2).
  - *Specs*: free text; prints on the Engineering Master report.
  - *Picture*: picture area.
  - *Browse*: list of masters.
- **Toolbar and menus**: Save, Clear Document, Copy Document / Paste Document (only into a blank master; the ID is not copied), Delete Document (Edit menu). The Edit menu also has Cut/Copy/Paste for cards.
  - Options menu: Right-click Info, Data Tips, Copy Subordinates.
  - Tools menu: Show Details, Show Costs. View menu: Material Availability.
  - Window menu: Tile Horizontally.
- **Workflow (new from scratch)** (p285-289):
  1. Type a Master ID or leave it blank to auto-number.
  2. Pick a Part ID.
  3. Set Quantity.
  4. Fill Engineered By/Date, Global Rank, Forward Schedule.
  5. Details tab: add operations and services, then legs, then materials and tools.
  6. Add detail on each card.
  7. Specs and Picture tabs.
  8. Save.
- **Four ways to create a master** (p284):
  - from scratch;
  - drag cards from another engineering master (two windows tiled);
  - drag cards from a work order or quote master;
  - New Document From.
- **Edit**: pick a Master ID with [...]; double-click a card to edit it; Save. (p319-320)
- **Delete**: Edit > Delete Document > Yes. This cannot be undone. (p322)
- **Links**: Operation, Material and Leg windows; Show Details; Show Costs; Material Availability; the Part (the master ID is stored on Part.Engineering Master); Operation Templates; Engineering reports. Copies go to and from Quote Master and Work Order.

### 2. Details tab: information-card canvas
- **Open**: the Details tab of the Engineering Master window. The same canvas is used in Quote Master and Work Order. (p274)
- **Purpose**: Visual bill of manufacture. Cards are stacked with an offset (each one up and to the right), and legs hang below parent operations, joined by a line.
- **Card types and colours** (p274-281):

  | Card | Colour | Line 1 | Line 2 | Line 3 |
  |---|---|---|---|---|
  | Header | White, at the bottom | Part ID, Master ID, description | Quantity | – |
  | Leg/Detail | White, under its parent operation | Sub ID, Part ID, description | Required quantity (type, quantity per, scrap) | – |
  | Operation | Green | Seq #, Resource ID, resource description | Setup, run and move hours | Units out / units in (calculated start/end quantity) |
  | Service (outside operation) | Blue | Service #, Service ID, name | Move hours, transit days | Units out / units in |
  | Material | Red | Piece #, Part ID, description | Calculated quantity in stock UoM | – |
  | Tool/Fixture | Red | Piece #, Tool ID | Quantity (Fixed Qty = 1 means one per operation) | – |

- **Card icons**: one-click shortcuts.
  - Drawing: launches the drawing file.
  - Specs: opens that card's Specs tab.
  - Picture: on a header card opens the Picture tab; on a material card opens the part's picture.
  - Additional Resources: opens the Operation window at Add'l Resources.
- **Right-click menu on a card**: Add Operation (header card), Add Material (operation card), Add Leg/Detail (operation card), Edit, Cut, Copy, Paste, Delete, Show Details, Show Costs, Right-click Info, Data Tips.
- **View modes** (toolbar or Options menu):
  - Right-click Info: right-clicking a card shows an enlarged card. The normal right-click menu is disabled while this mode is on.
  - Data Tips: hovering a card shows a tooltip with the full lines; the header tooltip includes the start of the Specs text.
- **Editing rules** (p290-293, 317-318, 323):
  - Drag a card, inside the window or to a second tiled window, to copy it. A plus cursor shows valid drop targets: operation onto header or operation; material onto operation; leg onto operation. Releasing on an invalid spot cancels the drag.
  - Copy, Cut and Paste act on the selected card (shown with a dotted outline). The Copy Subordinates option includes child cards.
  - Cut or Delete greys the card and its children (marked for delete); repeating the command un-marks it. Save commits.
  - Double-clicking a card opens its edit window.
- **Links**: Operation, Material and Leg windows; Show Details and Show Costs.

### 3. Operation window
- **Open**: right-click a header card > **Add Operation**, or double-click an operation card. Title: `Operation - <part>[<seq>] - New`. (p294)
- **Purpose**: Define one routing step. Selecting the Contractor resource makes it an outside service.
- **Layout** (five tabs, with OK / Cancel / Apply):
  - *Operation*:
    - Template ID [...]: fills the fields from an operation template; locked once saved.
    - Seq No: auto-assigned as the highest in the leg + 10; must be unique within the leg.
    - Description (60 chars); Resource ID [...].
    - Service ID [...], Supplier ID [...] and Supplier Service ID: enabled only when Resource = Contractor.
    - Setup Hrs (becomes Transit Days for a contractor); Run; Run Type (HRS/PC, PCS/HR, MIN/PC, PCS/MIN, LOADS/HR, HRS/LOAD).
    - Load Size Qty (needed for the load run types); Move Hrs; Min Move Qty (lets operations overlap). (p295-298)
  - *Specs*: text that prints on the traveller.
  - *Costs*: override fields. Setup/hr, Run/hr, Run/unit, Run/operation; Setup bur/hr, Run bur/hr, Burden/hr, Burden/per (operator); Setup %, Run %; Preserved checkbox (protects these values from a cost reset). (p299-300)
  - *Add'l Resources*: grid with columns Resource ID, Step (Setup/Run/Both), Duration %, Justification (At Start/At End), Schedule Type (Normal/Discontinuous), Min Size. These are used for scheduling only, not for cost. (p301-302)
  - *Other*: Scrap or Yield mode; Scrap/Yield %; Fixed Scrap Units; Calculated Start Qty and Calculated End Qty (read-only); Override Start Qty and Override End Qty; Minimum capacity and Maximum capacity (up to 255 units). (p302-304)
- **Workflow**:
  1. Pick a template, or pick a resource.
  2. Adjust Seq, times and run type.
  3. Fill Specs.
  4. Override costs if needed.
  5. Add additional resources.
  6. Set scrap and capacity.
  7. Click OK.
  8. Save the master.
- **Links**: Operation Template lookup, Resource table, Service and Supplier tables.

### 4. Material window (also used for tools/fixtures)
- **Open**: right-click an operation card > **Add Material**, or double-click a material card. Title: `Material - <part>/<sub>/<seq> - [New]`. (p305)
- **Purpose**: A component consumed at an operation. A Part ID is optional; without one, a description and a Usage U/M are required.
- **Layout** (four tabs, with OK / Cancel / Apply):
  - *Material*:
    - Part ID [...]; Piece # (operation's highest + 10, must be unique).
    - Reference (for example a drawing balloon number); Qty Per (default 1); Type (Start quantity / End quantity of the parent operation).
    - Fixed Qty (fixed scrap per run); Scrap %.
    - Dimensions (an expression with variables; not for piece-tracked parts); Length/Width/Height (for dimension-tracked parts); Usage U/M [...] (needs a conversion from the stock UoM). (p306-308)
  - *Specs*.
  - *Costs*: Unit Cost Material, Labor, Burden and Service; Fixed Cost; Preserved (set automatically when costs are typed). Material cost auto-updates from supplier price breaks on save unless Preserved is set. (p309-310)
  - *Purchasing*: Supplier ID [...], Supplier Part ID [...], and manufacturer fields (filled automatically). (p310-311)
- **Workflow**:
  1. Pick a part.
  2. Enter Qty Per and Type.
  3. Enter scrap.
  4. Enter dimensions or Usage U/M if needed.
  5. Fill Specs.
  6. Override costs if needed.
  7. Change the supplier if needed.
  8. Click OK.
  9. Save the master.

### 5. New Leg/Detail window
- **Open**: right-click an operation card > **Add Leg/Detail**. (p312)
- **Purpose**: A subassembly built within the same job (as opposed to a stocked subassembly, which would be a material card).
- **Layout**:
  - *Leg/Detail* tab: Sub ID (auto), Part ID [...] or a description only, Qty Per (default 1), Type (Start/End qty), Fixed Quantity, Reference, Scrap %, Dimensions, Length/Width/Height, Usage U/M, Piece # (shares the numbering series with the operation's materials).
  - *Specs* tab.
  - OK / Cancel. (p313-315)
- **Workflow**:
  1. Add the leg.
  2. The leg's own header card appears; add operations and materials under it in the same way as the top level.
  3. Save.

### 6. Show Details window
- **Open**: Tools > Show Details, the toolbar icon, or right-click the Details canvas. (p325)
- **Purpose**: Read-only explorer-style view of the structure.
- **Layout**: two panes.
  - Left: a tree with +/- expanders. Icons: header = grey gear; outside operation = blue hammer; internal operation = green hammer; material = red bolt; leg = card icon.
  - Right: the selected card's fields. (p326-328)
- **Actions**: expand or collapse nodes; select a node to view it. No editing; close the window to edit.

### 7. Show Costs window
- **Open**: Tools > Show Costs, the toolbar icon, or right-click the canvas. The window title is "Costs". (p328-329)
- **Purpose**: Indented cost and hours rollup for the current master, including unsaved overrides.
- **Layout**: tree-grid. Columns: Detail (indented with icons), Quantity, Estimated (total cost), Estimated Total Hours.
  - Click the *Estimated* header to expand it into Est. Unit, Material, Labor, Burden and Service.
  - Click the *Estimated Total Hours* header to expand it into Est. Setup Hours and Est. Run Hours.
  - Status bar (CAPS/NUM/INS); menu has Exit. (p330-333)
- **Data tips**: hovering a cost cell shows the Material/Labor/Burden/Service split; hovering an hours cell shows Setup/Run (auto-closes after 5 s). (p335-336)
- **Calculation rules** (p332-335):
  - Run hours by Run Type, using the calculated end quantity:

    | Run Type | Run hours |
    |---|---|
    | Hours per Piece | qty × run |
    | Pieces per Hour | qty / run |
    | Minutes per Piece | qty × run / 60 |
    | Pieces per Minute | qty / run / 60 |
    | Hours per Load | ceil(qty / load) × run |
    | Loads per Hour | ceil(qty / load) / run |

  - Header hours are not summed (operations can run in parallel). A leg's hours are the sum of its subordinate operations.
  - Operation labor = setup hours × setup $/hr + run hours × run $/hr + $/unit × qty + $/operation.
  - Operation burden = setup bur/hr × setup hours + run bur/hr × run hours + burden/unit × qty + fixed burden + setup % × setup labor + run % × run labor.
  - Material cost = qty × unit material + fixed cost. Labor, burden and service are calculated the same way (qty × unit cost), and the material's burden can also carry a percentage.
  - Header and leg totals are sums of their subordinates.
- **Use for the rebuild**: this is the cost-rollup report or tree view.

### 8. Material Availability for Engineering Masters
- **Open**: View > Material Availability... (with a master open). (p337)
- **Purpose**: Point-in-time view of on-hand stock against the master's material requirements.
- **Grid columns**: Part ID, Sub ID, Seq No, Piece No, Qty Req'd, Qty Issued (always blank for a master), On Hand, Projected Available (red when negative, blue when sufficient), Required Date ("Not Scheduled" for a master), Description. Close button. (p337-338)
- **Links**: Material Planning (ch. 30, outside this range).

### 9. Operation Templates window
- **Open**: Engineering group bar > **Operation Types** icon. (p340)
- **Purpose**: Standard operation definitions that fill the Operation window in masters and work orders.
- **Layout**: six tabs.
  - *Operation*: Template ID (15 chars), Description (60), Resource ID [...], Service ID [...] and Supplier ID [...] (contractor resource only), Supplier Service ID, Setup Hours (or Transit Days), Run Time, Run Type, Load Size Qty, Move Hours, Min Move Qty.
  - *Specs*: text, plus Drawing ID/Rev/Page (20 chars) and Drawing File [...] (128 chars, chosen with a file search dialog).
  - *Costs*: Setup/hr, Run/hr, Run/unit, Run/operation, Setup bur/hr, Run bur/hr, Burden/unit, Burden/oper, Setup %, Run %, Preserved. Defaults come from the shop resource.
  - *Add'l Resources*: same grid as on the Operation window.
  - *Other*: scrap/yield mode and %, Fixed Scrap Units, Start Qty and End Qty overrides, Min/Max capacity.
  - *Browse*. (p340-351)
- **Actions**: Save; Template ID [...] to edit; File > Delete Document. Cost changes reach existing masters and work orders only through Reset Material Costs / Reset Operation Costs. (p352-353)
- **Workflow**:
  1. Enter the ID and description.
  2. Pick the resource (and service/supplier if outside).
  3. Enter times.
  4. Fill Specs and drawing.
  5. Set costs.
  6. Add additional resources.
  7. Set scrap and capacity.
  8. Save.

### 10. Engineering report selection
- **Open**: the Reports menu (the report dialog is described in ch. 5, outside this range). (p355)
- **Reports**:
  - Engineering Master (non-financial routing and BOM);
  - Engineering Master Cost;
  - Engineering Master Material List (abridged);
  - Engineering Master List;
  - Operation Template List.
- Each report can be filtered (by customer, territory, product, and so on), previewed and printed.

---

## Section 4: Sales

### 11. Sales Order window
- **Open**: Sales group bar > **Orders** icon. Title: `Sales Order :: New`. (p360)
- **Purpose**: Record a customer purchase order as lines with staggered dates. Lines can be filled from stock or from linked work orders.
- **Layout**: eight tabs.
  - *Sales Order* (main; p360, p362):
    - Header:
      - Order ID [...] (dropdown, `<auto number>`, 30 chars).
      - **Customer ID** [...] (required).
      - Order Date (calendar).
      - Purchase Order No.
      - Status: Unreleased / Hold / Cancelled / Firm / Released / Closed. Firm and Released make lines visible to Planning, the Backlog report and Shipping. Closed is set automatically when all lines ship.
    - Read-only *Sold to/Ship to* address box on the right.
    - **Lines grid**: Line No, Order Qty, `<Part ID>`, Description, `<U/M>`, Unit Price, Disc%, Extension, Specs (checkbox).
    - Footer totals: Charge, Tax, Total.
  - *Sold To*: customer name, address and contact (filled from the customer, can be overridden).
  - *Ship To*: alternate address picked from the customer's addresses.
  - *Details*: current and past ship dates (Desired Ship Date sets the order's position in Shipping), sales rep, territory, FOB, ship via, terms, and so on.
  - *Specs*: order-level text.
  - *Charges*: service charges (copied from the quote, can be added or overridden).
  - *Taxes*: from the customer's tax group plus line taxes.
  - *Browse*. (p360-361)
- **Toolbar and menus**:
  - Save; Clear Document; Copy Document / Paste Document (duplicate an order).
  - File > New Document From > Quote (screen 13).
  - Tools > Re-price Lines > All Lines / Selected Lines (re-runs price lookup).
  - Order ID [...] to open an existing order. (p370-375)
- **Save-time checks**:
  - Customer order limit exceeded: a warning, which the user can accept or deny.
  - Credit status "Hold Orders": the status must be changed or acknowledged before the order saves.
  - Closing the window at that point discards the order. (p368-369)
- **Workflow**:
  1. Leave the Order ID blank to auto-number.
  2. Pick the customer.
  3. Enter the PO number.
  4. Set the status.
  5. Double-click a blank row header to open the Order Line window (screen 12); repeat for each line.
  6. Optionally override Sold to / Ship to / Details / Specs / Charges.
  7. Save.
  8. Print the Sales Order Acknowledgment.
- **Links**: Order Line, Customers, Quote (create from quote), Work Orders (through line links), Shipping, Planning, Backlog report.

### 12. Order Line window
- **Open**: double-click a line row header in the Sales Order grid. Title: `Order Line - [<order> - <line>]`. (p364)
- **Layout**: four tabs, with OK / Cancel / Apply.
  - *General* (also labelled "Sales Order Line"):
    - Line No (dropdown); Part ID [...]; Description; Customer Part ID [...] (list of this customer's part numbers).
    - Order Qty; Unit of Measure [...]; Unit Price; Trade Discount %.
    - Read-only: Ship'd Qty, Ship'd Amount, Extension.
    - Length/Width/Height and Dimensions U/M [...] (piece-tracked parts).
  - *Overrides*: Product Code, Commodity Code, Drawing ID/Rev, Tax Group ID, Ship Date (an earlier date here wins in Shipping), Promised Date, Revenue Account ID, Account Set ID, Status. (p366-367)
  - *Specs*: line spec, defaulted from the part. Edits are saved to the order only.
  - *Links*: grid with columns `<Work ID>`, Lot ID, Split ID, New (checkbox), Quantity, Status, Description. (p367-368)
    - Ticking New and clicking OK creates a work order from the part's Engineering Master (header card only if there is none) and links it. The new WO ID shows in the status bar.
    - Double-clicking `<Work ID>` links the line to an existing work order. Many lines can link to one work order.
    - A description-only (non-part) line must be fully linked to work orders before the order can be saved.
- **Pricing popup**: on entering Order Qty, the "Reset Unit Price from Customer?" dialog asks Yes/No. Yes uses customer-specific pricing. No uses the part's unit price. (p365)
- **Workflow**:
  1. Pick a part (or a customer part).
  2. Enter the quantity.
  3. Answer the price prompt.
  4. Enter a discount if any.
  5. Click Apply, which calculates the Extension.
  6. Overrides and Specs if needed.
  7. Links to a new or existing work order.
  8. Click OK.

### 13. Create Sales Order from Quote dialog
- **Open**: Sales Order window > File > New Document From... > Quote. (p370)
- **Layout**: a Quote ID [...] lookup (Quotes browse) and a Copy button.
- **Workflow**:
  1. Pick the quote.
  2. Click Copy. The order fills from the quote (no Order ID is assigned).
  3. Set the ID or leave it blank.
  4. Edit as needed.
  5. Save. Quote lines that were costed from a quote master automatically create work orders. (p370-371)

### 14. Customers window
- **Open**: Sales group bar > **Customer** icon. Title: `Customers - New`. (p378)
- **Purpose**: Customer master record. Its values feed sales orders, shipping and invoicing.
- **Layout**: six tabs, plus Notes, which appears in later screenshots.
  - *Customers* (p378, p380-381):
    - Customer ID [...] (dropdown, unique).
    - Name [...], Address (three lines), City, State/Zip (Zip [...] fills city, state and country; an unknown zip can be added on the fly), Country, Etc.
    - Contact, Title, Phone, Fax, E-mail [...] (opens the e-mail client).
  - *Account* (p381-382):
    - Account Opened Date; Last Order Date (set automatically); Supplier ID (ours).
    - Revenue Acct ID [...]; Receivables Acct ID [...]; Terms ID [...].
    - Freight Terms (Billed / Collect / Prepaid).
    - Credit Status (Approved / Hold Orders / Hold Shipments); Order Limit.
  - *Details* (p383-384): Sales Rep ID [...], Sales Territory ID [...]; FOB Point ID [...], Ship Via ID [...], Carrier ID [...]; SIC Code ID [...], Discount Class ID [...]; Tax ID Number, Default Tax Group [...], Tax Exempt checkbox (warns if tax is applied).
  - *Addresses*: grid of alternate ship-to addresses and contacts (wide; scrolls horizontally). (p384)
  - *Prices*: see screen 15.
  - *Browse*.
- **Actions**: Save; Customer ID [...] to edit; File > Delete Document (blocked if the customer is referenced). (p390-391)
- **Workflow**:
  1. Enter the ID.
  2. Enter name and address.
  3. Enter the contact.
  4. Account tab: accounts, terms, credit.
  5. Details tab: rep, ship and tax defaults.
  6. Addresses tab.
  7. Prices tab.
  8. Save.

### 15. Customer Prices tab (quantity-break table)
- **Open**: the Prices tab of the Customers window. (p385)
- **Layout**:
  - Top grid (filled as parts are entered): Part ID, Customer Part ID, Selling U/M, Quoted, Part Description.
  - Middle: Part ID [...], Selling UM [...] (needs a valid conversion), Customer Part ID.
  - Bottom left: break grid with columns Quantity and Unit Price.
  - Bottom right: Type (Break table / Up-to-Qty table), As of (date with checkbox), Expires (date with checkbox). (p386-388)
- **Rules**:
  - Price precedence: customer-specific price, then discount-class price, then the part's unit price.
  - Prices are used only between the As of and Expires dates.
  - Break table: leave the top quantity cell blank. Up-to table: leave the bottom quantity cell blank (that row is the price for anything above). A missing last price gives a price of 0.
  - Used by "Reset unit price from customer" and by Look-up Price on the Quote Line.
- **Workflow**:
  1. Pick the part.
  2. Enter the selling UoM and customer part number.
  3. Choose the table type.
  4. Enter the dates.
  5. Enter quantity/price rows.
  6. Save.

### 16. Sales Information Tables
- **Open**: Sales group bar (table windows; ch. 15 describes them only in concept). (p393-395)
- **Tables** (each is a simple ID/description grid window of the same type as Units of Measure):

  | Table | What it holds |
  |---|---|
  | Service Charges | Extra charges added to orders, shippers and invoices. Each charge prints as a separate invoice line and stays editable until invoicing. |
  | Tax Groups | Set of taxes for a place. Tax lines carry an Effective date, so future rates can be set up in advance. |
  | Sales Representatives | Used for analysis only; no commission payment. |
  | Territories | Sales territories. |
  | SIC Codes | Industry classification; a free label. |
  | Carriers | Freight carriers. |
  | Discount Classes | Discount structures assigned to customers, with per-part quantity-break tables. |

- **Links**: lookup sources for the Customers Details tab and for the Sales Order Details, Charges and Taxes tabs.

### 17. Shipping window
- **Open**: Sales group bar > **Shipping** icon. It opens on the list of unshipped orders. (p398)
- **Purpose**: Ship order lines. Shipping does all of the following:
  - issues finished goods from stock, or receives and ships straight from linked work orders (closing the work order when it is complete);
  - creates the Shipper ID and pack list;
  - backorders the remainder.
  It also handles customer returns.
- **Layout**: eight tabs.
  - *Shipping Activity*:
    - Grid columns: Sales Order ID, Shipper ID, Return (checkbox), Desired Ship, Customer, Message (for example "75 days late" in red, "Partial Shipment").
    - The view toggles between View Unshipped Orders and View Shipped Orders, through the toolbar Shipping Tools dropdown or Tools > Shipping. (p398, p405-406)
  - *Shipper* (p400-402):
    - Header: Shipper ID [...] (auto-assigned), Sales Order ID, Customer ID, Shipped Date, Purchase Order No.
    - Invoice Status: Unapproved / Approved / Cancelled.
    - "Shipment" / "Sold to/Ship to" address panel, with a **Ship** button (or **Return** for returns).
    - Lines grid: Line No, Part ID, Description, Ship Qty (stock U/M), Stock U/M, Ship/Rtn Qty (selling U/M), Selling U/M, Unit Price, Warehouse, Location, Quantity Available, Transacted (checkbox).
    - Footer: Charge, Tax, Total.
  - *Sold to*, *Ship to*, *Details* (dates, FOB, ship via, tax group, terms, discount class): overrides.
  - *Specs* (from the order).
  - *Taxes* (read-only).
  - *Charges* (editable).
- **Actions**:
  - Double-click a row, or right-click > **Ship**, which ships without editing and sets the status to Approved automatically.
  - Ship button; Return button; Save; Refresh (toolbar / File).
  - Line edit: double-click a line row header.
  - Cancel a shipper: set Invoice Status = Cancelled, then Save. Do this when the order changed after a shipper was assigned. (p403-404)
- **Rules**:
  - One location per line per shipper. The default is the part's primary location.
  - Shipping more than is available drives stock negative, and a manual adjustment is needed.
  - A partial shipment leaves the line open, and it reappears as a backorder line without a Shipper ID.
- **Workflow (ship)** (p400-403):
  1. Double-click the order.
  2. Override tabs if needed.
  3. Set Invoice Status = Approved.
  4. Check Quantity Available against Ship Qty and reduce the ship quantity if short.
  5. Set the location for unlinked lines.
  6. Click Ship.
  7. At the prompt "Print Pack List?", choose Yes or No.
  8. Click Refresh.
- **Workflow (return)** (p405-408):
  1. Switch to View Shipped Orders.
  2. Double-click the order; a new Return shipper is created (several can be made for staggered returns).
  3. Set the invoice status.
  4. Click Return (or later, from View Unshipped Orders, double-click the return shipper and click Return).
  5. Stock goes back to the original location or work order.
- **Links**: Sales Order, Inventory (transactions), Work Order (receipt and close), Pack List report, Invoicing.

### 18. Invoicing window
- **Open**: Sales group bar > **Invoicing** icon. It opens on the list of uninvoiced shippers and returns. (p410)
- **Purpose**: Turn shippers and returns into invoices or credit memos. Saving debits A/R and credits revenue, and the transactions are queued for posting to the external accounting package. (p409)
- **Layout**: eight tabs.
  - *Invoicing Activity*: grid columns Shipper ID, Order ID, Name, Shipped Date, Shipped Amount, Shipper Type (Shipment / Return). Multi-select with SHIFT/CTRL. (p412)
  - *Invoice*:
    - Header: Shipper ID [...], Sales Order ID, Customer ID, Shipped Date, Purchase Order No., Invoice Status, Sold To/Ship To panel, **Invoice** button.
    - Lines grid: Line, Part ID, Description, Ship Qty (stock U/M), Stock U/M, Ship Qty (sell U/M), Selling U/M, Unit Price, Warehouse, Location, Quantity Available, Transacted. Totals at the bottom.
  - *Sold to*, *Ship to*, *Details*: overrides.
  - *Specs*.
  - *Taxes*: read-only; tax changes are made on the sales order.
  - *Charges*: editable.
- **Actions**: Invoice button; Tools > Invoicing > Invoice (batch, no editing); Cancel Printing.
- **Workflow (single)** (p412-414):
  1. Double-click the shipper.
  2. Override tabs if needed.
  3. Set Invoice Status = Approved.
  4. Click Invoice.
  5. At the print prompt, click OK; the invoice prints.
  6. At "Printed correctly?", Yes assigns the Invoice ID and posts the GL lines. No leaves the shipper uninvoiced so it can be fixed and reprinted.
- **Workflow (batch)** (p415-416):
  1. Select several rows.
  2. Choose Tools > Invoicing > Invoice.
  3. Print and confirm each invoice in turn.

### 19. Sales report selection
- **Open**: the Reports menu. (p417-418)
- **Reports**:
  - Backlog: Firm and Released unshipped lines, with a grand total.
  - Carrier List, Customer List, Discount Class List.
  - Invoice (reprint), Invoice List, Pack List.
  - Sales Analysis: by period and category, with a bookings-to-shipments ratio.
  - Sales, Gross Margin and Throughput Brief.
  - Sales Order Acknowledgment, Sales Order Detail, Sales Order List.
  - Sales Representative List, Sales Tax Group List, Service Charges List, Shipper List, SIC Codes List, Territory List.

---

## Section 5: Inventory

### 20. Parts window
- **Open**: Inventory group bar > **Parts** icon. Title: `Parts :: New`. (p422)
- **Purpose**: Item master for everything that is sold, stocked, made or bought. Materials without a Part ID are allowed elsewhere in Jobshop but are not covered by this window.
- **Layout**: eight tabs.
  - *Part* (p424-428):
    - **Part ID** [...] (dropdown, 30 chars, required); Description [...] (60 chars).
    - **Stock U/M** [...]: required, and locked once the part has been used.
    - Engineering Master: the default master ID used to auto-create work orders.
    - Commodity Code ID [...]; Product Code ID [...]; Weight U/M [...]; Net Weight; Ship Dimensions.
    - Drawing ID/Rev; Drawing File [...] (with a view button); Manufacturer; Manufacturer Part ID.
    - **Settings** group: Fabricated, Purchased, Stocked (enables Order Point and Safety Stock; drives Material Planning), Tool/Fixture, Auto Issue.
  - *General* (p428-430):
    - Primary Location ID [...] (required; the default for receive, issue and ship); Auto Issue Loc ID [...]; Preferred Supplier ID [...].
    - **Planning** group: Leadtime (days), Order Point Qty, Safety Stock Qty.
    - **Piece Tracking** group: Part is Piece Tracked, then Length / Width / Height checkboxes and Dimensions U/M [...].
  - *Costing* (p431-432):
    - Unit Costs group: Material, Labor, Burden, Service, Fixed Cost, and Unit Cost (calculated).
    - Unit Price (the default selling price); Account Set ID [...].
    - Purchased-only parts disable Labor, Burden and Service. Fabricated-only parts disable Fixed Cost.
  - *Specs*: text.
  - *Picture*: BMP, JPEG or GIF.
  - *Locations*: grid with columns `<Location ID>`, Description, Hold (checkbox; locks the location's stock from transactions), Qty On Hand (read-only), Primary, Auto Issue (info only). Rows are added automatically on receipt. A row can be deleted only if unused. (p434, p440)
  - *Unit Conversions*: grid with columns `<From Unit ID>`, From Unit Description, `<To Unit ID>`, To Unit Description, Conversion. These are part-specific conversions (for example box to each). (p435)
  - *Browse*.
- **Menus**:
  - Save; Clear Document; Copy Document / Paste Document (clone the part without its ID); Edit > Delete Document (blocked if the part is used; the manual advises renaming it "Obsolete" instead).
  - View: Where Used, Inventory Pieces, Inventory Txs.
  - Tools: Reset Material Costs.
- **Validation**: on save, missing required fields raise a message box, for example "Stock UM required." (p435)
- **Workflow**:
  1. Enter the ID, description and Stock UM.
  2. Set the Settings flags.
  3. General tab: locations, supplier, planning, piece tracking.
  4. Costing tab: unit costs and price.
  5. Specs and Picture tabs.
  6. Unit Conversions tab.
  7. Save.
  8. Clear Document for the next part.
- **Piece-tracking example**: aluminium plate stocked by the pound and used by the square inch. Length × Width gives square inches, which are converted to pounds and multiplied by Qty Per, then scrap is added. The resulting Calc Qty appears on the material card and the traveller. (p429-431)

### 21. Part Where Used dialog
- **Open**: Parts window > View > Where Used... (p441)
- **Layout**:
  - Part ID [...] and description at the top.
  - "Include Document Type" checkboxes: Engineering Master, Quote Master, Work Order.
  - Grid columns: Document Type, Document ID, Sub ID, Seq No, Piece No, Qty Per, Qty Per Type, Fixed Qty.
  - Close button.
- **Workflow**:
  1. Open the dialog with a part selected (or pick one with [...] from the Parts browse).
  2. Untick document types to filter.
  3. Click Close. (p441-443)
- **Links**: the listed masters and work orders (by ID).

### 22. Inventory Pieces dialog
- **Open**: Parts > View > Inventory Pieces. The same dialog is also documented under Adjustments. (p444, p476)
- **Layout**: Part ID [...] and description; grid columns Part ID, Location ID, Length, Width, Height, Dimensions U/M, Piece Count.

### 23. Inventory Transactions dialog
- **Open**: Parts > View > Inventory Txs... The same dialog is also documented under Adjustments. (p445, p477)
- **Layout**: Part ID [...] and description; grid columns Transaction Date, Location ID, Service ID, Work ID, Lot ID, Split ID, Sub ID, Seq... The grid is wider than the screenshot shows and scrolls horizontally.
- **Use for the rebuild**: the per-item stock ledger, comparable to QuickBooks "QuickReport" on an item.

### 24. Reset Material Costs dialog
- **Open**: Parts > Tools > Reset Material Costs... (p446)
- **Layout**:
  - Scope: Current Material Only / All Materials (radio buttons).
  - "Reset costs on": Quote Master Operations, Engineering Master Operations, Work Order Operations.
  - According to Material Status: Unreleased, Firmed, Released, Closed, Cancelled, All.
  - According to W/O or Master Creation Date: On or After [date], On or Before [date].
  - OK / Cancel. (p446-447)
- **Behaviour**: copies the current part costs into the selected material cards. Cards marked Preserved are skipped.

### 25. Units of Measure window
- **Open**: Inventory group bar > **Units of Measure** icon. (p450)
- **Layout**: an editable table with columns ID, Description, Unit Scale (0-4 decimals; for example EA = 0, KG = 3). (p451-452)
- **Workflow**: type into the new row, tab through the columns, Save. To edit, click a cell and change it. To delete, select the row header, press DELETE (red X), then Save.

### 26. Unit Conversions window
- **Open**: Inventory group bar > **Unit Conversions** icon. (p456)
- **Layout**: grid with columns `<From Unit ID>`, From description (auto), `<To Unit ID>`, To description (auto), Conversion (up to 8 digits; from × factor = to).
  - Double-click a `<...>` header to browse Units of Measure.
  - The reverse conversion is derived automatically. (p457-458)
- **Scope**: global conversions here. Part-specific conversions are on the Parts > Unit Conversions tab.

### 27. Locations window
- **Open**: Inventory group bar > **Location** icon. (p462)
- **Layout**: grid with columns Location ID, Description. There is a single default warehouse. (p463)
- **Workflow**: add, edit or delete rows the same way as Units of Measure.

### 28. Inventory Adjustments window (Adjustments and Transfers tabs)
- **Open**: Inventory group bar > **Adjustments** icon. The window title is "Inventory Adjustments". (p468)
- **Purpose**: Manual inventory changes (including the opening balance) and location-to-location moves.
  - Lines are entered as a batch: **New** adds a line, and **Save** commits the whole batch.
  - Saved lines cannot be edited or deleted. A mistake is corrected by entering the reverse transaction.
  - Adjustments affect FIFO cost layers. (p467, p471, p475, p478)
- **Adjustments tab** (p469-471):
  - Header: New button; Type (Adjust In / Adjust Out); Date.
  - Part ID [...]; Quantity (stock UoM; an adjust-out cannot drive a location negative); Location ID [...]; Reason Code [...].
  - On Hand and Available (read-only); Length / Width / Height.
  - Adj Acct ID [...] (overrides the default account).
  - Unit Cost group: Material, Labor, Burden, Service.
  - Batch grid (read-only): Date, Type, Part ID, Part Description, Quantity, U/M, Location ID, Reason Code, Account, Account Description.
- **Transfers tab** (p472-474):
  - New button; Date (warning: do not date before the last accounting post).
  - Part ID [...]; From Location ID [...]; Transfer Qty (cannot exceed Qty Avail. to Transfer); Reason Code [...]; Length / Width / Height.
  - "Transfer To" group: Location ID [...]; Account Set ID [...].
  - Batch grid: Entry No, Date, Part ID, Part Description, Quantity, U/M, Reason Code, From Location, To Location...
- **Workflow**:
  1. Pick the type and date.
  2. Pick the part, which fills the fields.
  3. Enter quantity and location.
  4. Enter the account and reason.
  5. Click New for the next line.
  6. Review the grid; click a row header to edit an unsaved line, or press DELETE to mark it.
  7. Save.
- **Links**: Inventory Pieces and Inventory Transactions dialogs; Parts.

### 29. Inventory report selection
- **Open**: the Reports menu. (p479-480)
- **Reports**:
  - Inventory Transaction List.
  - Inventory Turns (last 6 months, annualised).
  - Inventory Value (FIFO layers by part and location; combine with the WIP Value report for a full valuation).
  - Location Content List.
  - Part Report (full attributes, filtered by part, product or commodity code range); Part List.
  - Part Location List; Physical Count Form.
  - Units of Measure List; Unit Conversions List; Inventory Location List.
  - Where Used.

---

## Cross-screen workflows

1. **Product definition (engineering)**:
   1. Parts (create the part, its UoM, locations and costs).
   2. Operation Templates (standard operations).
   3. Engineering Master: header, then Details canvas, then Add Operation (template or resource), Add Material, and Add Leg/Detail for subassemblies.
   4. Show Costs to check the rollup.
   5. Save. The master ID is written to Part.Engineering Master.
   6. Engineering Master and Material List reports.
2. **Master copying**: masters move freely between Engineering Master, Quote Master and Work Order.
   - Drag cards between two tiled windows, or Copy Document / Paste Document into a blank document.
   - The intended flow: engineers design an engineering master, copy it to a quote master to add costing, then copy that to a work order for production. (p271, p290)
3. **Quote to order to work order**:
   1. Quote.
   2. Sales Order > File > New Document From > Quote. Lines that were costed from a quote master automatically create work orders.
   3. Or, on Order Line > Links, tick New: a work order is created from the part's default Engineering Master and linked.
   4. Or link the line to an existing work order (many lines can share one).
   5. Firm or Released status exposes the lines to Planning and Shipping.
4. **Order to shipment to invoice (order-to-cash)**:
   1. Sales Order (Firm or Released).
   2. Shipping > Shipping Activity (unshipped, sorted by Desired Ship date): double-click the order, set Invoice Status = Approved, confirm quantities and locations, click Ship.
      - Linked work order quantities are received and shipped first, then stock.
      - Partial quantities are backordered.
   3. Print the Pack List.
   4. Invoicing > Invoicing Activity: double-click the shipper (or batch-select), click Invoice, print, confirm. The Invoice ID is assigned and AR/revenue transactions are posted for export to accounting.
   5. The order closes when all lines have shipped.
5. **Customer return to credit memo**:
   1. Shipping > View Shipped Orders: double-click the order to create a Return shipper (one or more).
   2. Click Return; stock goes back to the original location or work order.
   3. Invoicing: the Return shipper (Shipper Type = Return) is invoiced as a credit.
6. **Pricing chain**: Customer Prices (customer-specific breaks, dated), then Discount Class breaks, then Part Unit Price.
   - Applied when the Order Line asks "Reset unit price from customer" and on Tools > Re-price Lines.
   - Customer Credit Status and Order Limit are checked when the sales order is saved.
7. **Inventory setup and maintenance**:
   1. Units of Measure, then Unit Conversions (global), then Locations.
   2. Parts (stock UoM, primary location, part-specific conversions).
   3. Adjustments, Adjust In (opening balances), and Transfers as needed.
   4. Check with View > Inventory Txs / Inventory Pieces; report with the Inventory Value, Part Location and Physical Count reports.
   5. To correct a saved transaction, post the reverse adjustment.
8. **Cost maintenance**: when part or resource costs change, update Parts > Costing or the Operation Templates, then run Tools > Reset Material Costs (or Reset Operation Costs, ch. 34) to push the new costs into quote masters, engineering masters and work orders. Material and operation cards marked Preserved are skipped.

## Notes for the Tryton rebuild
- The standard Jobshop document-window pattern repeats on almost every screen, so it is worth building once as a shared component:
  - an ID box with a [...] lookup button and auto-numbering;
  - tabbed sections ending in a Browse tab;
  - Copy Document, Clear Document and Paste Document commands;
  - grid row-state markers;
  - Specs and Picture tabs.
- Shipping and Invoicing are "activity list + document" windows. The first tab is a work queue; double-clicking a row loads the document tabs. The equivalent in our app would be a list view with a split or form view and a Ship or Invoice action.
- The engineering card canvas (stacked cards, colour-coded, drag-and-drop) is the most distinctive UI in this range. The Show Details tree and the Show Costs tree-grid are the practical fallbacks if a canvas is too costly to build.
- Manual inconsistencies:
  - The Customers window is described as having six tabs, but some screenshots also show a Notes tab.
  - The Operation Templates window is opened from an icon labelled "Operation Types".
  - The manual uses "Delete Document" under both the File and Edit menus.
