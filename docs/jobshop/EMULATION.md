# VISUAL Jobshop emulation

The owner's direction (28 Oct 2026): emulate VISUAL Jobshop completely first —
every screen, every function, every right-click function — then decide where
to deviate. The stock Tryton screens that are not accounting and that the
Jobshop screens make redundant are hidden. The accounting side stays as the
QuickBooks emulation (Customers, Vendors, Banking, Company folders).

## Sources

- The live Jobshop on the development PC (OWNEROW), looked at read-only with
  computer use: the group bar, the menu bar, the right-click menus of the
  Details cards.
- Jobshop's own help, decompiled (`VjsEnu.chm`): `C:\NLINE_ERP_dev\jobshop_help`
  - `toc.txt` the table of contents (818 entries);
  - `topics\<Topic>.txt` one plain-text file per help topic (930); the
    `V<Module><Window>.txt` topics are the **field level descriptions** of
    each window (every field of every tab);
  - `reports.json` the 99 reports (name, group bar, .rpt, description);
  - `html\` the original pages and screenshots (`html\Graphics`).
  These are Infor's; they stay on the development PC, out of the repository.
- The Jobshop database (SQL Server `NLVDC01\VJS`, database `NLINE_VJS`,
  read-only, Windows sign-in) and the `*.schema` files in
  `C:\Infor Global Solutions\VISUAL Jobshop` for the data of each window.

## Jobshop's frame

- **Group bar** (left): Favorites, Inventory, Engineering, Estimating, Sales,
  Purchasing, Planning, Shopfloor, Accounting, Common, Executive Information,
  Administration. Items, in order:
  - Inventory: Parts, Units of Measure, Unit Conversions, Locations,
    Adjustments, Reports
  - Engineering: Masters, Operation Templates, Reports
  - Estimating: Quotes, Quote Masters, Reports
  - Sales: Customers, Sales Orders, Shipping, Invoicing, Service Charges,
    Tax Groups, Sales Reps, Territories, SIC Codes, Carriers, Discount
    Classes, Reports
  - Purchasing: Suppliers, Request For Quotes, Purchase Orders, Receiving,
    Services, Tax Groups, Reports
  - Planning: Material Planning, Scheduling, Reports
  - Shopfloor: Work Orders, Material Issues/Returns, Work Order
    Receipts/Returns, Shop Resources, Shop Groups, Shop Views, Labor Entry,
    Labor Data Collection, Employees, Reports
  - Accounting: Accounts, Account Sets, Accounting Calendar, Account
    Interface, Reports
  - Common: Free On Board Points, Shipping Methods, States/Provinces, Postal
    Codes, Terms, Product Codes, Commodity Codes, Reason Codes, Alert
    Messages, User Control Panel, Reports
  - Executive Information: Sales, Purchasing, Production, Financials
  - Administration: User Manager, Authority Manager, System Settings
  - Favorites: the user's own shortcuts (Tryton's menu favourites, the star)
- **Menu bar** (options vary with the window):
  - File: New Document From >, Open Document (Ctrl+O), Save (Ctrl+S), Save
    As, Send To, Refresh (F5), Print Preview, Print, Employee Clock In/Out,
    Alert Messages, Getting Started Wizard, Preferences, Exit
  - Edit: Delete (Del), Clear Document, Cut / Copy / Paste / Delete Document,
    Picture >, Find Materials By
  - View: Navigator bar, Favorites, Save widths and positions,
    Freeze/Unfreeze Columns, Inventory Txs, Labor Txs, Material
    Availability, Sales Order Links
  - Options: Right-click Info, DataTips, Copy Subordinates
  - Browse: Refresh Browse (Shift+F5), First (Ctrl+F), Previous (Ctrl+L),
    Next (Ctrl+N), Last (Ctrl+E), Browse Filter (Ctrl+B), Auto Browse
  - Tools (work order / master windows): Add Operation, Add Material, Add
    Materials, Add Leg/Detail, Edit, Variables, Co-Products, Schedule Work
    Order, Issue/Return Materials, Start Labor Ticket for Employee, Change
    Status >, Show Details, Show Costs, Indented Details / Costs...
  - Navigate: the group bar as a menu
  - Window: Cascade, Tile, Previous, Next, Close Window; Help
- **Work order / master window tabs**: Work Order (header), Details (the
  information cards), Other, Specs, Picture, Notes, Browse.
- **Card right-click menu** (operation / material / header card): Add
  Operation, Add Material, Add Materials, Add Leg/Detail, Variables, Schedule
  Work Order, Issue/Return Materials, Start Labor Ticket for Employee >,
  Edit, Delete, Print Preview, Print, Open Part, Open Material Supply and
  Demand, Open Resource, Open Eng Master for Part, Open Supplier, Request
  Quote/Purchase this Material/Service, Change Status > (UnReleased, Firm,
  Released, Closed, Cancelled), Picture, View Drawing, Show Details, Show
  Costs, Right-click Info, DataTips, Order Materials By >, Find Materials By >.

## How the emulation is built

- Each Jobshop area is one Tryton module, `modules/nline_js_<area>`, and one
  desk script, `modules/nline_desk/web/js/jobshop/<area>.js`:

  | Area | Module | Jobshop groups |
  |---|---|---|
  | common | nline_js_common | Common (+ the shared code tables) |
  | inventory | nline_js_inventory | Inventory |
  | sales | nline_js_sales | Sales |
  | purchasing | nline_js_purchasing | Purchasing |
  | engineering | nline_js_engineering | Engineering, Estimating, the Work Order window and its cards |
  | shopfloor | nline_js_shopfloor | Shopfloor (except the Work Order window) |
  | planning | nline_js_planning | Planning |
  | admin | nline_js_admin | Accounting, Executive Information, Administration, all Jobshop reports |

- `modules/nline_jobshop` makes the menu: the group bar, in Jobshop's order
  and names (`tools/gen_menus.py` → `jobshop.xml`), and hides the standard
  Tryton menus the Jobshop screens replace (sales, purchases, production,
  stock, products, parties; Administration > Superseded Menus shows one
  again). The QuickBooks folders stay in `nline_desk/tools/gen_menus.py`.
- A screen is a desk screen (`Screens.<name>`), its route pushed onto
  `window.NLINE_ROUTES` (`[/^#\/route$/, 'name']`); those routes come before
  the built-in ones, so an area may replace an existing screen at the same
  route.
- The maintenance windows use `UI.master` (frame.js): ID with lookup, tabs
  (`fields`, `lines`, `render`, `{picture: true}`, `{notes: true}`), the
  Browse tab (`browse: [columns]`), First / Previous / Next / Last, Save,
  Clear, Copy, Delete, `print: '<report>'`; rights from `get_access`.
- Server code for a screen: the area module extends `nline.desk`
  (`class Desk(metaclass=PoolMeta)`, RPCs in `__setup__`), checks rights
  with `cls._check_read / _check_create / _check_write`.
- Permissions (owner's rule): what a user may not use is not shown — no
  error popups. Menu items carry groups; buttons and right-click items
  follow `get_access` and `UI.screenAllowed`.
- Data from Jobshop: `migration/jobshop/<area>.py`, `def run(m)` with the
  `Migration` object of `migration/nline_migrate.py` (`m.js.rows(sql)`,
  `m.get(model)`, `m.count()`, `log()`), step `js_<area>`.

## Status

All eight areas were built on 28 Oct 2026. Each area's ticked checklist, decisions and gaps are in its status file: [common](status/common.md), [inventory](status/inventory.md), [sales](status/sales.md), [purchasing](status/purchasing.md), [engineering](status/engineering.md) (Engineering, Estimating, Work Order window), [shopfloor](status/shopfloor.md), [planning](status/planning.md), [admin](status/admin.md) (Accounting, Executive Information, Administration, all reports). The list below is the original inventory; the status files are the current truth.

Each checklist item is a Jobshop help topic (window, tab, function). `[x]`
done, `[~]` partly (see note), `[-]` not emulated on purpose (note why).

### Estimating (nline_js_engineering)

- [ ] What are Estimating Functions? (`What_are_Estimating_Functions.txt`)
- [ ] Quotes
  - [ ] What are Quotes? (`What_are_Quotes.txt`)
  - [ ] Maintaining Quotes (`Maintaining_Quotes.txt`)
  - [ ] Copying Quotes (`Copying_Quotes.txt`)
  - [ ] Understanding the Estimating Process (`Understanding_the_Estimating_Process.txt`)
  - [ ] Entering Quote Line Information (`Entering_Quote_Line_Information.txt`)
  - [ ] Quotes Field Level Descriptions (`VEstimatingQuote.txt`)
  - [ ] Quote Window Tab Information
    - [ ] Quote Tab (`Quotes_Understanding_the_Quote_Tab.txt`)
    - [ ] Sold To Tab (`Quotes_Understanding_the_Sold_To_Tab.txt`)
    - [ ] Ship To Tab (`Quotes_Understanding_the_Ship_To_Tab.txt`)
    - [ ] Dates Tab (`Quotes_Understanding_the_Dates_Tab.txt`)
    - [ ] Details Tab (`Quotes_Understanding_the_Details_Tab.txt`)
    - [ ] Specs Tab (`Quotes_Understanding_the_Specs_Tab.txt`)
    - [ ] Charges Tab (`Quotes_Understanding_the_Charges_Tab.txt`)
    - [ ] Browse Tab (`Quotes_Understanding_the_Browse_Tab.txt`)
- [ ] Quote Masters
  - [ ] What are Quote Masters? (`What_are_Quote_Masters.txt`)
  - [ ] Quote Master Field Level Descriptions (`VEstimatingQuoteMaster.txt`)
  - [ ] Maintaining Quote Masters (`Maintaining_Quote_Masters.txt`)
  - [ ] Information Cards
    - [ ] Understanding Information Cards (`Understanding_Information_Cards.txt`)
    - [ ] Right Click Info (`Right_Click_Info.txt`)
    - [ ] Data Tips Option (`Data_Tips_Option.txt`)
    - [ ] Information Card Icons (`Information_Card_Icons.txt`)
  - [ ] Creating and Updating Quote Masters
    - [ ] Building Quote Masters
      - [ ] Building Quote Masters (`Building_Quote_Masters.txt`)
      - [ ] Building a New Quote Master (`Building_a_New_Quote_Master.txt`)
      - [ ] Copying Into a New Quote Master (`Copying_Into_a_New_Quote_Master.txt`)
      - [ ] Quote Master Window Tab Information
        - [ ] Understanding the Quote Master Details Tab (`Understanding_the_Quote_Master_Details_Tab.txt`)
        - [ ] Understanding the Quote Master Specs Tab (`Understanding_the_Quote_Master_Specs_Tab.txt`)
        - [ ] Understanding the Quote Master Picture Tab (`Understanding_the_Quote_Master_Picture_Tab.txt`)
        - [ ] Understanding the Quote Master Browse Tab (`Understanding_the_Quote_Master_Browse_Tab.txt`)
    - [ ] Quote Master Operations
      - [ ] Adding Master Operations (`Adding_Quote_Master_Operations.txt`)
      - [ ] Using the Operation Specs Tab (`Using_the_Operation_Specs_Tab.txt`)
      - [ ] Using the Operation Costs Tab (`Using_the_Operation_Costs_Tab.txt`)
      - [ ] Using the Operation Additional Resources Tab (`Using_the_Operation_Additional_Resources_Tab.txt`)
      - [ ] Using the Operation Other Tab (`Using_the_Operation_Other_Tab.txt`)
    - [ ] Quote Master Materials and Tools/Fixtures
      - [ ] Adding Master Materials and Tools/Fixtures (`Adding_Quote_Master_Materials_and_Tools_Fixtures.txt`)
      - [ ] Understanding the Specs Tab (`Understanding_the_Specs_Tab_MaterialWindow.txt`)
      - [ ] Understanding the Costs Tab (`Understanding_the_Costs_Tab_MaterialWindow.txt`)
      - [ ] Understanding the Purchasing Tab (`Understanding_the_Purchasing_Tab_MaterialWindow.txt`)
    - [ ] Adding Quote Master Legs
      - [ ] Adding Quote Master Legs (`Adding_Quote_Master_Legs.txt`)
      - [ ] Using Leg Detail Specifications (`Using_Leg_Detail_Specifications.txt`)
    - [ ] Editing and Copying Quote Masters
      - [ ] Editing and Copying Existing Quote Master Information (`Editing_and_Copying_Existing_Quote_Master_Information.txt`)
      - [ ] Copying Existing Quote Masters (`Copying_Existing_Quote_Masters.txt`)
      - [ ] Editing Quote Master Information (`Editing_Quote_Master_Information.txt`)
  - [ ] Deleting Quote Masters
    - [ ] Deleting Quote Masters (`Deleting_Quote_Masters.txt`)
    - [ ] Deleting Quote Master Information (`Deleting_Quote_Master_Information.txt`)
    - [ ] Deleting Quote Master Information Cards (`Deleting_Quote_Master_Information_Cards.txt`)
    - [ ] Removing Pictures from Quote Masters (`Removing_Pictures_from_Quote_Masters.txt`)
  - [ ] Quote Master Costs and Details
    - [ ] Understanding Quote Master Costs and Details (`Understanding_Quote_Master_Costs_and_Details.txt`)
    - [ ] Viewing Quote Master Indented Details (`Viewing_Quote_Master_Indented_Details.txt`)
    - [ ] Viewing Quote Master Indented Costs (`Viewing_Quote_Master_Indented_Costs.txt`)
  - [ ] Viewing Material Availability (`Viewing_Material_Availability.txt`)
  - [ ] Supply & Demand (`What_is_Supply_&amp;_Demand.txt`)
- [ ] Estimating Reports
  - [ ] Estimating Reports (`Estimating_Reports.txt`)

### Engineering (nline_js_engineering)

- [ ] What are Engineering Functions? (`What_are_Engineering_Functions.txt`)
- [ ] Maintaining Engineering Masters and Work Orders (`Maintaining_Engineering_Masters_and_Work_Orders.txt`)
- [ ] Engineering Masters
  - [ ] What are Engineering Masters? (`What_are_Engineering_Masters_.txt`)
  - [ ] Engineering Master Window Field Level Descriptions (`VEngineeringMaster.txt`)
  - [ ] Information Cards
    - [ ] Right Click Info (`Right_Click_Info.txt`)
    - [ ] Data Tips Option (`Data_Tips_Option.txt`)
    - [ ] Information Card Icons (`Information_Card_Icons.txt`)
  - [ ] Creating and Updating Engineering Masters
    - [ ] Building Engineering Masters
      - [ ] Creating Engineering Masters (`Creating_Engineering_Masters.txt`)
      - [ ] Building a New Engineering Master (`Building_a_New_Engineering_Master.txt`)
      - [ ] Copying Into a New Engineering Master (`Copying_Into_a_New_Engineering_Master.txt`)
      - [ ] Engineering Master Window Tab Information
        - [ ] Understanding the Engineering Master Details tab (`Understanding_the_Engineering_Master_Details_tab.txt`)
        - [ ] Understanding the Engineering Master Specs tab (`Understanding_the_Engineering_Master_Specs_tab.txt`)
        - [ ] Understanding the Engineering Master Picture tab (`Understanding_the_Engineering_Master_Picture_tab.txt`)
        - [ ] Understanding the Engineering Master Browse tab (`Understanding_the_Engineering_Master_Browse_tab.txt`)
    - [ ] Engineering Master Operations
      - [ ] Adding Engineering Master and Work Order Operations (`Adding_Engineering_Master_and_Work_Order_Operations.txt`)
      - [ ] Using the Engineering Master and Work Order Operation Specs Tab (`Using_the_Engineering_Master_and_Work_Order_Operation_Specs_Tab.txt`)
      - [ ] Using the Operation Specs Tab (`Using_the_Operation_Specs_Tab.txt`)
      - [ ] Using the Operation Costs Tab (`Using_the_Operation_Costs_Tab.txt`)
      - [ ] Using the Operation Other Tab (`Using_the_Operation_Other_Tab.txt`)
    - [ ] Engineering Master Materials and Tools/Fixtures
      - [ ] Understanding the Specs Tab (`Understanding_the_Specs_Tab_MaterialWindow.txt`)
      - [ ] Understanding the Costs Tab (`Understanding_the_Costs_Tab_MaterialWindow.txt`)
      - [ ] Understanding the Purchasing Tab (`Understanding_the_Purchasing_Tab_MaterialWindow.txt`)
    - [ ] Adding Engineering Master Legs
      - [ ] Adding Master and Work Order Legs (`Adding_Master_and_Work_Order_Legs.txt`)
      - [ ] Using Leg Detail Specifications (`Using_Leg_Detail_Specifications.txt`)
    - [ ] Editing and Copying Engineering Masters
      - [ ] Editing and Copying Existing Engineering Master Information (`Editing_and_Copying_Existing_Engineering_Master_Information.txt`)
      - [ ] Copying Existing Engineering Masters (`Copying_Existing_Engineering_Masters.txt`)
      - [ ] Editing Engineering Masters (`Editing_Engineering_Masters.txt`)
  - [ ] Deleting Engineering Masters
    - [ ] Deleting Engineering Masters (`Deleting_Engineering_Masters.txt`)
    - [ ] Deleting Engineering Master Information (`Deleting_Engineering_Master_Information.txt`)
    - [ ] Deleting Engineering Master Information Cards (`Deleting_Engineering_Master_Information_Cards.txt`)
    - [ ] Removing Pictures from Engineering Masters (`Removing_Pictures_from_Engineering_Masters.txt`)
  - [ ] Engineering Master Costs and Details
    - [ ] Understanding Engineering Master Costs and Details (`Understanding_Engineering_Master_Costs_and_Details.txt`)
    - [ ] Viewing Indented Details (`Viewing_Engineering_Master_Indented_Details.txt`)
    - [ ] Viewing Indented Costs (`Viewing_Engineering_Master_Indented_Costs.txt`)
  - [ ] Viewing Material Availability (`Viewing_Engineering_Master_Material_Availability.txt`)
  - [ ] Supply & Demand (`What_is_Supply_&amp;_Demand.txt`)
- [ ] Operation Templates
  - [ ] What are Operation Templates? (`What_are_Operation_Templates_.txt`)
  - [ ] Operation Template Field Level Descriptions (`VEngineeringOperation.txt`)
  - [ ] Creating Operation Templates
    - [ ] Maintaining Operation Templates (`Maintaining_Operation_Templates.txt`)
    - [ ] Using the Operation Template Operation Tab (`Using_the_Operation_Template_Operation_Tab.txt`)
    - [ ] Using the Operation Template Specs Tab (`Using_the_Operation_Template_Specs_Tab.txt`)
    - [ ] Using the Operation Template Costs Tab (`Using_the_Operation_Template_Costs_Tab.txt`)
    - [ ] Using the Operation Template Additional Resources Tab (`Using_the_Operation_Template_Additional_Resources_Tab.txt`)
    - [ ] Using the Operation Template Other Tab (`Using_the_Operation_Template_Other_Tab.txt`)
    - [ ] Using the Operation Template Browse tab (`Using_the_Operation_Template_Browse_tab.txt`)
- [ ] Engineering Reports
  - [ ] Engineering Reports (`Engineering_Reports.txt`)

### Sales (nline_js_sales)

- [ ] What are Sales Functions? (`What_are_Sales_Functions.txt`)
- [ ] Sales Orders
  - [ ] What are Sales Orders? (`What_are_Sales_Orders_.txt`)
  - [ ] Sales Order Field Level Descriptions (`VSalesSalesOrder.txt`)
  - [ ] Sales Order Maintenance
    - [ ] Maintaining Sales Orders (`Maintaining_Sales_Orders.txt`)
    - [ ] Creating Sales Orders from Quotes (`Creating_Sales_Orders_from_Quotes.txt`)
    - [ ] Creating Sales Orders from Existing Sales Orders (`Creating_Sales_Orders_from_Existing_Sales_Orders.txt`)
    - [ ] Entering Sales Order Lines (`Entering_Sales_Order_Lines.txt`)
    - [ ] Editing and Viewing Sales Orders (`Editing_and_Viewing_Sales_Orders.txt`)
    - [ ] Deleting Sales Orders (`Deleting_Sales_Orders.txt`)
    - [ ] Sales Order Tab Information
      - [ ] Using the Sales Orders Sales Order Tab (`Using_the_Sales_Orders_Sales_Order_Tab.txt`)
      - [ ] Using the Sales Orders Sold To Tab (`Using_the_Sales_Orders_Sold_To_Tab.txt`)
      - [ ] Using the Sales Orders Ship To Tab (`Using_the_Sales_Orders_Ship_To_Tab.txt`)
      - [ ] Using the Sales Orders Details Tab (`Using_the_Sales_Orders_DetailsTab.txt`)
      - [ ] Using the Sales Orders Specs Tab (`Using_the_Sales_Orders_Specs_Tab.txt`)
      - [ ] Using the Sales Orders Charges Tab (`Using_the_Sales_Orders_Charges_Tab.txt`)
      - [ ] Using the Sales Orders Taxes Tab (`Using_the_Sales_Orders_Taxes_Tab.txt`)
      - [ ] Using the Sales Orders Shippers/Invoices Tab (`Using_the_Sales_Orders_Shippers_Invoices_Tab.txt`)
      - [ ] Using the Sales Orders Browse Tab (`Using_the_Sales_Orders_Browse_Tab.txt`)
- [ ] Customers
  - [ ] What are Customers? (`What_are_Customers_.txt`)
  - [ ] Customer Field Level Descriptions (`VSalesCustomer.txt`)
  - [ ] Customer Maintenance
    - [ ] Maintaining Customer Information (`Maintaining_Customer_Information.txt`)
    - [ ] Preparing Quantity/Break Tables (`Preparing_Quantity_Break_Tables.txt`)
    - [ ] Editing Customer Information (`Editing_Customer_Information.txt`)
    - [ ] Deleting Customers (`Deleting_Customers.txt`)
    - [ ] Customer Window Tab Information
      - [ ] Using the Customers Tab (`Using_the_Customer_Window_Customers_Tab.txt`)
      - [ ] Using the Account Tab (`Using_the_Customer_Window_Account_Tab.txt`)
      - [ ] Using the Details Tab (`Using_the_Customer_Window_Details_Tab.txt`)
      - [ ] Using the Addresses Tab (`Using_the_Customer_Window_Addresses_Tab.txt`)
      - [ ] Using the Prices Tab (`Using_the_Customer_Window_Prices_Tab.txt`)
      - [ ] Using the Notes Tab (`Using_the_Customer_Window_Notes_Tab.txt`)
      - [ ] Using the Sales Orders Tab (`Using_the_Customer_Window_Sales_Orders_Tab.txt`)
      - [ ] Using the Quotes Tab (`Using_the_Customer_Window_Quotes_Tab.txt`)
      - [ ] Using the Browse Tab (`Using_the_Customer_Window_Browse_Tab.txt`)
- [ ] Service Charges
  - [ ] Entering Service Charges (`Entering_Service_Charges.txt`)
  - [ ] Service Charge Field Level Descriptions (`VSalesServiceCharge.txt`)
- [ ] Tax Groups
  - [ ] Entering Tax Groups (`Entering_Tax_Groups.txt`)
  - [ ] Sales Tax Group Field Level Descriptions (`VSalesSalesTaxGroup.txt`)
- [ ] Sales Reps
  - [ ] Entering Sales Representatives (`Entering_Sales_Representatives.txt`)
  - [ ] Sales Representative Field Level Descriptions (`VSalesSalesRep.txt`)
- [ ] Territories
  - [ ] Entering Territories (`Entering_Territories.txt`)
  - [ ] Territory Field Level Descriptions (`VSalesTerritory.txt`)
- [ ] SIC Codes
  - [ ] Entering SIC Codes (`Entering_SIC_Codes.txt`)
  - [ ] SIC Codes Field Level Descriptions (`VSalesSic.txt`)
- [ ] Carriers
  - [ ] Entering Carriers (`Entering_Carriers.txt`)
  - [ ] Carrier Field Level Descriptions (`VSalesCarrier.txt`)
- [ ] Discount Classes
  - [ ] Entering Discount Classes (`Entering_Discount_Classes.txt`)
  - [ ] Discount Class Field Level Descriptions (`VSalesDiscountClass.txt`)
- [ ] Shipping
  - [ ] What is Shipping? (`What_is_Shipping_.txt`)
  - [ ] Shipping Field Level Descriptions (`VSalesShipping.txt`)
  - [ ] Shipment/Return Maintenance
    - [ ] Accessing the Shipping Window (`Accessing_the_Shipping_Window.txt`)
    - [ ] Shipping Parts (`Shipping_Parts.txt`)
    - [ ] Returning Parts (`Returning_Parts.txt`)
    - [ ] Entering Shipper Lines (`Entering_Shipper_Lines.txt`)
  - [ ] Shipping Window Tab Information
    - [ ] Understanding the Shipping Activity Tab (`Understanding_the_Shipping_Activity_Tab.txt`)
    - [ ] Understanding the Shipper Tab (`Understanding_the_Shipper_Tab.txt`)
    - [ ] Understanding the Sold To Tab (`Understanding_the_Shipping_Sold_To_Tab.txt`)
    - [ ] Understanding the Ship To Tab (`Understanding_the_Ship_To_Tab.txt`)
    - [ ] Understanding the Details Tab (`Understanding_the_Shipping_Details_Tab.txt`)
    - [ ] Understanding the Specs Tab (`Understanding_the_Shipping_Specs_Tab.txt`)
    - [ ] Understanding the Charges Tab (`Understanding_the_Shipping_Charges_Tab.txt`)
- [ ] Invoicing
  - [ ] What is Invoicing? (`What_is_Invoicing_.txt`)
  - [ ] Invoicing Field Level Descriptions (`VSalesInvoicing.txt`)
  - [ ] Invoicing Maintenance
    - [ ] Accessing the Invoicing Window (`Accessing_the_Invoicing_Window.txt`)
    - [ ] Invoicing Sales Orders (`Invoicing_Sales_Orders.txt`)
    - [ ] Processing Multiple Invoices (`Processing_Multiple_Invoices.txt`)
    - [ ] Issuing Credit Memos (`Issuing_Credit_Memos.txt`)
  - [ ] Invoicing Window Tab Information
    - [ ] Using the Invoicing Activity Tab (`Using_the_Invoicing_Activity_Tab.txt`)
    - [ ] Understanding the Invoice Tab (`Understanding_the_Invoicing_Invoice_Tab.txt`)
    - [ ] Understanding the Bill To Tab (`Understanding_the_Invoicing_Bill_To_Tab.txt`)
    - [ ] Understanding the Ship To Tab (`Understanding_the_Invoicing_Ship_To_Tab.txt`)
    - [ ] Understanding the Details Tab (`Understanding_the_Invoicing_Details_Tab.txt`)
    - [ ] Understanding the Specs Tab (`Understanding_the_Invoicing_Specs_Tab.txt`)
    - [ ] Understanding the Charges Tab (`Understanding_the_Invoicing_Charges_Tab.txt`)
    - [ ] Understanding the Taxes Tab (`Understanding_the_Invoicing_Taxes_Tab.txt`)
- [ ] Sales Reports
  - [ ] Sales Reports (`Sales_Reports.txt`)

### Inventory (nline_js_inventory)

- [ ] What are Inventory Functions? (`What_are_Inventory_Functions_.txt`)
- [ ] Parts
  - [ ] What are Parts? (`What_are_Parts_.txt`)
  - [ ] What is Lot Tracking? (`What_is_Lot_Tracking.txt`)
  - [ ] What is Supply & Demand? (`What_is_Supply_&amp;_Demand.txt`)
  - [ ] Parts Window Field Level Descriptions (`VInventoryPart.txt`)
  - [ ] Part Maintenance
    - [ ] Accessing Parts (`Accessing_Parts.txt`)
    - [ ] Copying Existing Part Information to a New Part ID (`Copying_Existing_Part_Information_to_a_New_Part_ID.txt`)
    - [ ] Editing Part Information (`Editing_Part_Information.txt`)
    - [ ] Deleting Parts (`Deleting_Parts.txt`)
    - [ ] Part Window Tab Information
      - [ ] Using the Part Tab (`Using_the_Parts_Part_Tab.txt`)
      - [ ] Using the General Tab (`Using_the_Parts_General_Tab.txt`)
      - [ ] Using the Costing Tab (`Using_the_Parts_Costing_Tab.txt`)
      - [ ] Using the Specs Tab (`Using_the_Parts_Specs_Tab.txt`)
      - [ ] Using the Picture Tab (`Using_the_Parts_Picture_Tab.txt`)
      - [ ] Using the Locations Tab (`Using_the_Parts_Locations_Tab.txt`)
      - [ ] Using the Unit Conversions Tab (`Using_the_Parts_Unit_Conversions_Tab.txt`)
      - [ ] Using the Sales Order Lines Tab (`Using_the_Parts_Sales_Order_Lines_Tab.txt`)
      - [ ] Using the Purchase Order Lines Tab (`Using_the_Parts_Purchase_Order_Lines_Tab.txt`)
      - [ ] Understanding the Work Orders Tab (`Understanding_the_Parts_Work_Orders_Tab.txt`)
      - [ ] Using the Browse Tab (`Using_the_Parts_Browse_Tab.txt`)
  - [ ] Where Used Part Information
    - [ ] Where Used Part Information (`Where_Used_Part_Information.txt`)
  - [ ] Inventory Pieces
    - [ ] Viewing Inventory Pieces (`Viewing_Inventory_Pieces.txt`)
  - [ ] Inventory Transactions
    - [ ] Viewing Inventory Transactions (`Viewing_Inventory_Transactions.txt`)
  - [ ] Material Costs
    - [ ] Resetting Material Costs (`Resetting_Material_Costs.txt`)
- [ ] Units of Measure
  - [ ] What are Units of Measure? (`What_are_Units_of_Measure_.txt`)
  - [ ] Unit of Measure Window Field Level Descriptions (`VInventoryUnit.txt`)
  - [ ] Units of Measure Maintenance
    - [ ] Accessing Units of Measure (`Accessing_Units_of_Measure.txt`)
    - [ ] Entering Units of Measure (`Entering_Units_of_Measure.txt`)
    - [ ] Editing Units of Measure (`Editing_Units_of_Measure.txt`)
    - [ ] Deleting Units of Measure (`Deleting_Units_of_Measure.txt`)
- [ ] Unit Conversions
  - [ ] What are Unit Conversions? (`What_are_Unit_Conversions_.txt`)
  - [ ] Unit Conversion Window Field Level Descriptions (`VInventoryUnitConversion.txt`)
  - [ ] Unit Conversion Maintenance
    - [ ] Accessing Unit Conversions (`Accessing_Unit_Conversions.txt`)
    - [ ] Configuring Unit Conversions (`Configuring_Unit_Conversions.txt`)
    - [ ] Editing Unit Conversions (`Editing_Unit_Conversions.txt`)
    - [ ] Deleting Unit Conversions (`Deleting_Unit_Conversions.txt`)
- [ ] Locations
  - [ ] What are Inventory Locations? (`What_are_Inventory_Locations_.txt`)
  - [ ] Inventory Location Window Field Level Descriptions (`VInventoryLocation.txt`)
  - [ ] Location Maintenance
    - [ ] Accessing Locations (`Accessing_Locations.txt`)
    - [ ] Entering Locations (`Entering_Locations.txt`)
    - [ ] Editing Locations (`Editing_Locations.txt`)
    - [ ] Deleting Locations (`Deleting_Locations.txt`)
- [ ] Adjustments
  - [ ] What are Inventory Adjustments? (`What_are_Inventory_Adjustments_.txt`)
  - [ ] Adjustments Window Field Level Descriptions (`VInventoryAdjustments.txt`)
  - [ ] Adjustment Maintenance
    - [ ] Accessing Inventory Adjustments (`Accessing_Inventory_Adjustments.txt`)
    - [ ] Entering Adjustments (`Entering_Adjustments.txt`)
    - [ ] Inventory Transfers (`Inventory_Transfers.txt`)
    - [ ] Editing Adjustments and Transfers (`Editing_Adjustments_and_Transfers.txt`)
    - [ ] Viewing Inventory Pieces (`Viewing_Inventory_Pieces.txt`)
    - [ ] Viewing Inventory Transactions (`Viewing_Inventory_Transactions.txt`)
    - [ ] Deleting Adjustments and Transfers (`Deleting_Adjustments_and_Transfers.txt`)
    - [ ] Adjustments Window Tab Information
      - [ ] Using the Adjustments Tab (`Using_the_Adjustments_Tab.txt`)
      - [ ] Using the Transfers Tab (`Using_the_Transfers_Tab.txt`)
      - [ ] Using the Physical Count Tab (`Using_the_Physical_Count_Tab.txt`)
- [ ] Inventory Reports
  - [ ] Inventory Reports (`Inventory_Reports.txt`)

### Purchasing (nline_js_purchasing)

- [ ] What are Purchasing Functions? (`What_are_Purchasing_Functions.txt`)
- [ ] Request for Quotes
  - [ ] What are Requests for Quotes? (`What_are_Requests_for_Quotes_.txt`)
  - [ ] Request for Quote Window Field Level Descriptions (`VPurchasingRequestForQuote.txt`)
  - [ ] RFQ Maintenance
    - [ ] Accessing the Request for Quotes Window (`Accessing_the_Request_for_Quotes_Window.txt`)
    - [ ] Editing Requests for Quotes (`Editing_Requests_for_Quotes.txt`)
    - [ ] Deleting Requests For Quotes (`Deleting_Requests_For_Quotes.txt`)
    - [ ] Request for Quote Tab Information
      - [ ] Using the Request for Quote Tab (`Using_the_Request_for_Quote_Tab.txt`)
      - [ ] Using the RFQ Ship To Tab (`Using_the_RFQ_Ship_To_Tab.txt`)
      - [ ] Using the RFQ Supplier 1, 2, and 3 Tabs (`Using_the_RFQ_Supplier_1,_2,_and_3_Tabs.txt`)
      - [ ] Using the RFQ Specs Tab (`Using_the_RFQ_Specs_Tab.txt`)
      - [ ] Using the RFQ Browse Tab (`Using_the_RFQ_Browse_Tab.txt`)
    - [ ] RFQ Lines
      - [ ] RFQ Line Field Level Information (`VPurchasingRequestForQuoteLine.txt`)
      - [ ] Entering Request for Quote Lines (`Entering_Request_for_Quote_Lines.txt`)
      - [ ] Entering RFQ Line Supplier Information (`Entering_RFQ_Line_Supplier_Information.txt`)
      - [ ] Entering RFQ Line Specs (`Entering_RFQ_Line_Specs.txt`)
      - [ ] Understanding RFQ Line Links (`Understanding_RFQ_Line_Links.txt`)
- [ ] Purchase Orders
  - [ ] What are Purchase Orders? (`What_are_Purchase_Orders_.txt`)
  - [ ] Purchase Order Window Field Level Descriptions (`VPurchasingPurchaseOrder.txt`)
  - [ ] Purchase Order Maintenance
    - [ ] Accessing the Purchase Order Window (`Accessing_the_Purchase_Order_Window.txt`)
    - [ ] Editing Purchase Orders (`Editing_Purchase_Orders.txt`)
    - [ ] Deleting Purchase Orders (`Deleting_Purchase_Orders.txt`)
    - [ ] Purchase Order Tab Information
      - [ ] Using the Purchase Order Tab (`Using_the_Purchasing_Purchase_Order_Tab.txt`)
      - [ ] Using the Purchase From Tab (`Using_the_Purchasing_Purchase_From_Tab.txt`)
      - [ ] Using the Ship To Tab (`Using_the_Purchasing_Ship_To_Tab.txt`)
      - [ ] Using the Details Tab (`Using_the_Purchasing_Details_Tab.txt`)
      - [ ] Using the Specs Tab (`Using_the_Purchasing_Specs_Tab.txt`)
      - [ ] Using the Taxes Tab (`Using_the_Purchasing_Taxes_Tab.txt`)
      - [ ] Using the Receivers Tab (`Using_the_Purchasing_Receivers_Tab.txt`)
      - [ ] Using the Browse Tab (`Using_the_Purchasing_Browse_Tab.txt`)
    - [ ] Purchase Order Lines
      - [ ] Purchase Line Field Level Information (`VPurchasingPurchaseLine.txt`)
      - [ ] Entering Purchase Order Lines (`Entering_Purchase_Order_Lines.txt`)
      - [ ] Using the Overrides Tab (`Using_the_PO_Lines_Overrides_Tab.txt`)
      - [ ] Using the Specs Tab (`Using_the_PO_Lines_Specs_Tab.txt`)
      - [ ] Using the Links Tab (`Using_the_PO_Lines_Links_Tab.txt`)
- [ ] Suppliers
  - [ ] What are Suppliers? (`What_are_Suppliers_.txt`)
  - [ ] Supplier Window Field Level Descriptions (`VPurchasingSupplier.txt`)
  - [ ] Supplier Maintenance
    - [ ] Accessing the Supplier Window (`Accessing_the_Supplier_Window.txt`)
    - [ ] Editing Suppliers (`Editing_Suppliers.txt`)
    - [ ] Deleting Suppliers (`Deleting_Suppliers.txt`)
    - [ ] Supplier Tab Information
      - [ ] Entering Supplier Information (`Using_the_Suppliers_Suppliers_Tab.txt`)
      - [ ] Using the Account Tab (`Using_the_Suppliers_Account_Tab.txt`)
      - [ ] Using the Addresses Tab (`Using_the_Suppliers_Addresses_Tab.txt`)
      - [ ] Using the Part Prices Tab (`Using_the_Supplier_Part_Prices_Tab.txt`)
      - [ ] Using the Service Prices Tab (`Using_the_Supplier_Service_Prices_Tab.txt`)
      - [ ] Using the Specs Tab (`Using_the_Suppliers_Specs_Tab.txt`)
      - [ ] Using the Notes Tab (`Using_the_Suppliers_Notes_Tab.txt`)
      - [ ] Using the Purchase Orders Tab (`Understanding_the_Suppliers_Purchase_Orders_Tab.txt`)
      - [ ] Using the Browse Tab (`Using_the_Suppliers_Browse_Tab.txt`)
- [ ] Services
  - [ ] What are Services? (`What_are_Services_.txt`)
  - [ ] Service Window Field Level Descriptions (`VPurchasingService.txt`)
- [ ] Tax Groups
  - [ ] What are Tax Groups? (`What_are_Tax_Groups_.txt`)
  - [ ] Tax Group Window Field Level Descriptions (`VPurchasingPurchasingTaxGroup.txt`)
- [ ] Receiving
  - [ ] What is Receiving? (`What_is_Receiving_.txt`)
  - [ ] Receiving Window Field Level Descriptions (`VPurchasingReceiving.txt`)
  - [ ] Receiving Maintenance
    - [ ] Accessing the Receiving Window (`Accessing_the_Receiving_Window.txt`)
    - [ ] Entering Receivers (`Entering_Receivers.txt`)
    - [ ] Applying Fixed Charges to Receiver Lines (`Applying_Fixed_Charges_to_Receiver_Lines.txt`)
    - [ ] Cancelling Receivers (`Cancelling_Receivers.txt`)
    - [ ] Returning Parts to Suppliers (`Returning_Parts_to_Suppliers.txt`)
    - [ ] Receiving Tab Information
      - [ ] Using the Receiving Activity Tab (`Using_the_Receiving_Activity_Tab.txt`)
      - [ ] Using the Receivers Tab (`Using_the_Receivers_Tab.txt`)
      - [ ] Using the Receive From Tab (`Using_the_Receive_From_Tab.txt`)
      - [ ] Using the Details Tab (`Using_the_Receivers_Details_Tab.txt`)
      - [ ] Using the Specifications Tab (`Using_the_Receiving_Specifications_Tab.txt`)
- [ ] Purchasing Reports
  - [ ] Purchasing Reports (`Purchasing_Reports.txt`)

### Planning (nline_js_planning)

- [ ] What are Planning Functions? (`What_are_Planning_Functions.txt`)
- [ ] Material Planning
  - [ ] What is Material Planning? (`What_is_Material_Planning_.txt`)
  - [ ] What is Supply & Demand? (`What_is_Supply_&amp;_Demand.txt`)
  - [ ] Material Planning Window Field Level Descriptions (`VPlanningPlanning.txt`)
  - [ ] Material Planning Maintenance
    - [ ] Accessing Material Planning (`Accessing_Material_Planning.txt`)
    - [ ] Open Sales Orders
      - [ ] Working with Open Sales Orders (`Working_with_Open_Sales_Orders.txt`)
      - [ ] Changing the Open Sales Orders View (`Changing_the_Open_Sales_Orders_View.txt`)
      - [ ] Linking Open Sales Orders (`Linking_Open_Sales_Orders.txt`)
      - [ ] Creating Unlinked Work Orders for Sales Order Lines (`Creating_Unlinked_Work_Orders_for_Sales_Order_Lines.txt`)
      - [ ] Changing the Status of Sales Orders (`Changing_the_Status_of_Sales_Orders.txt`)
    - [ ] Non-Stocked Parts
      - [ ] Working with Non-Stocked Parts (`Working_with_Non-Stocked_Parts.txt`)
      - [ ] Changing the Non-Stocked Parts View (`Changing_the_Non-Stocked_Parts_View.txt`)
      - [ ] Creating Linked Purchase Orders in the Non-Stocked Parts Section (`Creating_Linked_Purchase_Orders_in_the_Non-Stocked_Parts_Section.txt`)
    - [ ] Outside Services
      - [ ] Working with Outside Services (`Working_with_Outside_Services.txt`)
      - [ ] Changing the Outside Services View (`Changing_the_Outside_Services_View.txt`)
      - [ ] Creating Linked Purchase Orders for Outside Services (`Creating_Linked_Purchase_Orders_for_Outside_Services.txt`)
      - [ ] Viewing Linked Work Orders for Outside Services (`Viewing_Linked_Work_Orders_for_Outside_Services.txt`)
    - [ ] Stocked Parts
      - [ ] Working with Stocked Parts (`Working_with_Stocked_Parts.txt`)
      - [ ] Changing the Stocked Parts View (`Changing_the_Stocked_Parts_View.txt`)
      - [ ] Creating Purchase Orders for Your Purchased Stocked Parts (`Creating_Purchase_Orders_for_Your_Purchased_Stocked_Parts.txt`)
      - [ ] Creating Work Orders for Your Fabricated Stocked Parts (`Creating_Work_Orders_for_Your_Fabricated_Stocked_Parts.txt`)
- [ ] Scheduling
  - [ ] What is Scheduling? (`What_is_Scheduling_.txt`)
  - [ ] Schedule Components (`Schedule_Components.txt`)
  - [ ] The Jobshop Scheduler (`The_Jobshop_Scheduler.txt`)
  - [ ] Scheduling Window Field Level Descriptions (`VPlanningScheduling.txt`)
  - [ ] Exporting Your Schedule to MS Project (`Exporting_Your_Schedule_to_MS_Project.txt`)
  - [ ] Scheduler Maintenance
    - [ ] Accessing the Scheduler (`Accessing_the_Scheduler.txt`)
    - [ ] Working with the Scheduler (`Scheduling.txt`)
    - [ ] Viewing Resource Details (`Viewing_Resource_Details.txt`)
    - [ ] Viewing Work Order Details (`Viewing_Work_Order_Details.txt`)
    - [ ] Schedule Information (`Schedule_Information.txt`)
    - [ ] Working with Calendars (`Working_with_Calendars.txt`)
- [ ] Planning Reports
  - [ ] Planning Reports (`Planning_Reports.txt`)

### Shopfloor (nline_js_shopfloor)

- [ ] What are Shopfloor Functions? (`What_are_Shopfloor_Functions.txt`)
- [ ] Work Orders
  - [ ] What are Work Orders? (`What_are_Work_Orders_.txt`)
  - [ ] What is Supply & Demand? (`What_is_Supply_&amp;_Demand.txt`)
  - [ ] Work Order Window Field Level Descriptions (`VShopfloorWorkOrder.txt`)
  - [ ] Creating and Updating Work Orders
    - [ ] Building Work Orders
      - [ ] Creating Work Orders (`Creating_Work_Orders.txt`)
      - [ ] Building a New Work Order (`Building_a_New_Work_Order.txt`)
      - [ ] Copying Into a New Work Order (`Copying_Into_a_New_Work_Order.txt`)
      - [ ] Work Order Window Tab Information
        - [ ] Understanding the Details Tab (`Understanding_the_Work_Orders_Details_Tab.txt`)
        - [ ] Understanding the Specs Tab (`Understanding_the_Work_Orders_Specs_Tab.txt`)
        - [ ] Understanding the Picture Tab (`Understanding_the_Work_Orders_Picture_Tab.txt`)
        - [ ] Understanding the Browse Tab (`Understanding_the_Work_Orders_Browse_Tab.txt`)
    - [ ] Work Order Master Operations
      - [ ] Adding Engineering Master and Work Order Operations (`Adding_Engineering_Master_and_Work_Order_Operations.txt`)
      - [ ] Using the Operation Specs Tab (`Using_the_Operation_Specs_Tab.txt`)
      - [ ] Using the Operation Costs Tab (`Using_the_Operation_Costs_Tab.txt`)
      - [ ] Using the Operation Other Tab (`Using_the_Operation_Other_Tab.txt`)
    - [ ] Work Order Materials and Tools/Fixtures
      - [ ] Understanding the Specs Tab (`Understanding_the_Specs_Tab_MaterialWindow.txt`)
      - [ ] Understanding the Costs Tab (`Understanding_the_Costs_Tab_MaterialWindow.txt`)
      - [ ] Understanding the Purchasing Tab (`Understanding_the_Purchasing_Tab_MaterialWindow.txt`)
    - [ ] Adding Work Order Legs
      - [ ] Adding Work Order Legs (`Adding_Quote_Master_Legs.txt`)
      - [ ] Using Leg Detail Specifications (`Using_Leg_Detail_Specifications.txt`)
    - [ ] Editing and Copying Work Orders
      - [ ] Editing and Copying Existing Work Order Information (`Editing_and_Copying_Existing_Engineering_Master_Information.txt`)
      - [ ] Copying Existing Work Orders (`Copying_Existing_Engineering_Masters.txt`)
      - [ ] Editing Work Orders (`Editing_Engineering_Masters.txt`)
  - [ ] Information Cards
    - [ ] Understanding Information Cards (`Understanding_Information_Cards.txt`)
    - [ ] Right Click Info (`Right_Click_Info.txt`)
    - [ ] Data Tips Option (`Data_Tips_Option.txt`)
    - [ ] Information Card Icons (`Information_Card_Icons.txt`)
  - [ ] Deleting Work Orders
    - [ ] Deleting Work Orders (`Deleting_Work_Orders.txt`)
  - [ ] Work Order Costs and Details
    - [ ] Understanding Work Order Costs and Details (`Understanding_Work_Order_Costs_and_Details.txt`)
    - [ ] Viewing Indented Details (`Viewing_Work_Order_Indented_Details.txt`)
    - [ ] Viewing Indented Costs (`Viewing_Work_Order_Indented_Costs.txt`)
  - [ ] Additional Work Order Functions
    - [ ] Additional Work Order Functions (`Additional_Work_Order_Functions.txt`)
    - [ ] Changing the Status of Work Orders in the Work Order Window (`Changing_the_Status_of_Work_Orders_in_the_Work_Order_Window.txt`)
    - [ ] Purchasing Materials and Services in the Work Order Window (`Purchasing_Materials_and_Services_in_the_Work_Order_Window.txt`)
    - [ ] Viewing Pictures and Drawings (`Viewing_Pictures_and_Drawings.txt`)
    - [ ] Viewing Material Availability in the Work Order Window (`Viewing_Material_Availability_in_the_Work_Order_Window.txt`)
    - [ ] Viewing Inventory Transactions in the Work Order Window (`Viewing_Inventory_Transactions_in_the_Work_Order_Window.txt`)
    - [ ] Viewing Labor Transactions in the Work Order Window (`Viewing_Labor_Transactions_in_the_Work_Order_Window.txt`)
    - [ ] Viewing Sales Order Links in the Work Order Window (`Viewing_Sales_Order_Links_in_the_Work_Order_Window.txt`)
    - [ ] Scheduling in the Work Order Window (`Scheduling_in_the_Work_Order_Window.txt`)
    - [ ] Setting Up Variables in the Work Order Window (`Setting_Up_Variables_in_the_Work_Order_Window.txt`)
- [ ] Shop Resources
  - [ ] What are Shop Resources? (`What_are_Shop_Resources_.txt`)
  - [ ] Shop Resource Window Field Level Descriptions (`VShopfloorShopResource.txt`)
  - [ ] Shop Resource Maintenance
    - [ ] Accessing Shop Resources (`Accessing_Shop_Resources.txt`)
    - [ ] Resetting Operation Costs (`Resetting_Operation_Costs.txt`)
    - [ ] Editing Shop Resources (`Editing_Shop_Resources.txt`)
    - [ ] Deleting Shop Resources (`Deleting_Shop_Resources.txt`)
    - [ ] Shop Resources Tab Information
      - [ ] Understanding the Shop Resources Tab (`Understanding_the_Shop_Resources_Shop_Resources_Tab.txt`)
      - [ ] Understanding the Costs Tab (`Understanding_the_Shop_Resources_Costs_Tab.txt`)
      - [ ] Understanding the Browse Tab (`Understanding_the_Shop_Resources_Browse_Tab.txt`)
    - [ ] Viewing Where Used Resource Information (`Viewing_Where_Used_Resource_Information.txt`)
    - [ ] Working with Jobshop Resource Calendars (`Working_with_Jobshop_Resource_Calendars.txt`)
- [ ] Shop Groups
  - [ ] What are Shop Groups? (`What_are_Shop_Groups_.txt`)
  - [ ] Shop Group Window Field Level Descriptions (`VShopfloorShopGroup.txt`)
  - [ ] Shop Groups Maintenance
    - [ ] Accessing Shop Groups (`Accessing_Shop_Groups.txt`)
    - [ ] Entering Shop Group Information (`Entering_Shop_Group_Information.txt`)
    - [ ] Deleting Shop Groups (`Deleting_Shop_Groups.txt`)
- [ ] Shop Views
  - [ ] What are Shop Views? (`What_are_Shop_Views_.txt`)
  - [ ] Shop Views Window Field Level Descriptions (`VShopfloorShopView.txt`)
  - [ ] Shop Views Maintenance
    - [ ] Accessing Shop Views (`Accessing_Shop_Views.txt`)
    - [ ] Entering Shop Views (`Entering_Shop_Views.txt`)
    - [ ] Deleting Shop Views (`Deleting_Shop_Views.txt`)
- [ ] Labor Entry
  - [ ] What is Labor Entry? (`What_is_Labor_Entry_.txt`)
  - [ ] Labor Entry Window Field Level Descriptions (`VShopfloorLaborEntry.txt`)
  - [ ] Labor Entry Maintenance
    - [ ] Accessing Labor Entry (`Accessing_Labor_Entry.txt`)
    - [ ] Adding Labor to Work Orders (`Adding_Labor_to_Work_Orders.txt`)
    - [ ] Removing Labor from Work Orders (`Removing_Labor_from_Work_Orders.txt`)
- [ ] Labor Data Collection
  - [ ] What is Labor Data Collection? (`What_is_Labor_Data_Collection_.txt`)
  - [ ] Labor Data Collection Window Field Level Descriptions (`VShopfloorLaborEntry.txt`)
  - [ ] Installation
    - [ ] Installing Labor Data Collection (`Installing_Labor_Data_Collection.txt`)
    - [ ] Labor Data Collection System Requirements (`Labor_Data_Collection_System_Requirements.txt`)
    - [ ] Configuring the Hardware (`Configuring_the_Hardware.txt`)
    - [ ] Configuring the Software (`Configuring_the_Software.txt`)
  - [ ] Networking Stand-Alone Labor Data Collection (`Networking_Stand-Alone_Labor_Data_Collection.txt`)
  - [ ] Posting Labor
    - [ ] Posting Labor in VISUAL Jobshop (`Posting_Labor_in_VISUAL_Jobshop.txt`)
    - [ ] Reporting Completion Status (`Reporting_Completion_Status.txt`)
    - [ ] Costing Variables (`Costing_Variables.txt`)
    - [ ] Posting Setup Labor (`Posting_Setup_Labor.txt`)
    - [ ] Posting Run Labor (`Posting_Run_Labor.txt`)
  - [ ] Starting the Stand-Alone Labor Data Collection Function (`Starting_the_Stand-Alone_Labor_Data_Collection_Function.txt`)
  - [ ] Supervisory Functions
    - [ ] Integrated Supervisory Functions (`Using_the_Integrated_Module_s_Supervisory_Functions.txt`)
    - [ ] Supervisory Control (`Supervisory_Control.txt`)
    - [ ] Creating Reports with Barcodes (`Creating_Reports_with_Barcodes.txt`)
    - [ ] Effects of Authority Manager on the Labor Data Collection Module (`Effects_of_Authority_Manager_on_the_Labor_Data_Collection_Module.txt`)
    - [ ] Managing Labor Transactions (`Managing_Labor_Transactions.txt`)
  - [ ] Using the Labor Data Collection Windows
    - [ ] Using the Labor Data Collection Windows (`Using_the_Labor_Data_Collection_Windows.txt`)
    - [ ] Suspending Work Order Operations (`Suspending_Work_Order_Operations.txt`)
    - [ ] Posting to Work Order Operations (`Posting_to_Work_Order_Operations.txt`)
    - [ ] Saving Labor Transactions to the Database (`Saving_Labor_Transactions_to_the_Database.txt`)
    - [ ] Editing and Deleting Saved Labor Transactions (`Editing_and_Deleting_Saved_Labor_Transactions.txt`)
- [ ] Material Issues
  - [ ] What are Material Issues? (`What_are_Material_Issues_.txt`)
  - [ ] Material Issues Window Field Level Descriptions (`VShopfloorMaterialIssues.txt`)
  - [ ] Material Issue Maintenance
    - [ ] Accessing Material Issues (`Accessing_Material_Issues.txt`)
    - [ ] Issuing Material to Work Orders (`Issuing_Material_to_Work_Orders.txt`)
    - [ ] Viewing Inventory Pieces (`Viewing_Inventory_Pieces.txt`)
    - [ ] Viewing Inventory Transactions (`Viewing_Inventory_Transactions.txt`)
- [ ] Work Order Receipts
  - [ ] What are Work Order Receipts? (`What_are_Work_Order_Receipts_.txt`)
  - [ ] Work Order Receipts Window Field Level Descriptions (`VShopfloorWOReceipts.txt`)
  - [ ] Work Order Receipt Maintenance
    - [ ] Accessing Work Order Receipts (`Accessing_Work_Order_Receipts.txt`)
    - [ ] Receiving Work Orders (`Receiving_Work_Orders.txt`)
    - [ ] Returning Work Orders to the Shop Floor (`Returning_Work_Orders_to_the_Shop_Floor.txt`)
- [ ] Employees
  - [ ] What are Employees? (`What_are_Employees_.txt`)
  - [ ] Employee Window Field Level Descriptions (`VShopfloorEmployee.txt`)
  - [ ] Employee Maintenance
    - [ ] Accessing Employees (`Accessing_Employees.txt`)
    - [ ] Adding Employees (`Adding_Employees.txt`)
    - [ ] Editing Employee Information (`Editing_Employee_Information.txt`)
    - [ ] Deleting Employees (`Deleting_Employees.txt`)
- [ ] Shopfloor Reports
  - [ ] Shopfloor Reports (`Shopfloor_Reports.txt`)

### Accounting (nline_js_admin)

- [ ] What are Accounting Functions? (`What_are_Accounting_Functions_.txt`)
- [ ] MYOB Import Information (`MYOB_Import_Information.txt`)
- [ ] Peachtree Import Information (`Peachtree_Import_Information.txt`)
- [ ] QuickBooks Import Information (`QuickBooks_Import_Information.txt`)
- [ ] QuickBooks Automated Integration (`QuickBooks_Automated_Integration.txt`)
- [ ] Pastel Import Information (`Pastel_Import_Information.txt`)
- [ ] Accounts
  - [ ] What are Accounts? (`What_are_Accounts_.txt`)
  - [ ] Accounts Window Field Level Descriptions (`VAccountingAccount.txt`)
  - [ ] Account Maintenance
    - [ ] Accessing Accounts (`Accessing_Accounts.txt`)
    - [ ] Adding Accounts (`Adding_Accounts.txt`)
    - [ ] Editing Accounts (`Editing_Accounts.txt`)
    - [ ] Deleting Accounts (`Deleting_Accounts.txt`)
- [ ] Account Sets
  - [ ] What are Account Sets? (`What_are_Account_Sets_.txt`)
  - [ ] Account Set Window Field Level Descriptions (`VAccountingAccountSet.txt`)
  - [ ] Account Set Maintenance
    - [ ] Accessing Account Sets (`Accessing_Account_Sets.txt`)
    - [ ] Adding Account Sets (`Adding_Account_Sets.txt`)
    - [ ] Editing Account Sets (`Editing_Account_Sets.txt`)
    - [ ] Deleting Account Sets (`Deleting_Account_Sets.txt`)
- [ ] Account Interface
  - [ ] What is the Account Interface? (`What_is_the_Account_Interface_.txt`)
  - [ ] Account Interface Window Field Level Descriptions (`VAccountinginterface.txt`)
  - [ ] Accessing the Account Interface (`Accessing_the_Account_Interface.txt`)
  - [ ] Posting Accounts (`Posting_Accounts.txt`)
  - [ ] Exporting Account Information (`Exporting_Account_Information.txt`)
- [ ] Reports
  - [ ] Accounting Reports (`Accounting_Reports.txt`)

### Common (nline_js_common)

- [ ] What are Common Functions? (`What_are_Common_Functions.txt`)
- [ ] What are Free On Board Points?
  - [ ] What are Free On Board Points? (`What_are_Free_On_Board_Points_.txt`)
  - [ ] FOB Point Window Field Level Descriptions (`VSharedFOBPoint.txt`)
- [ ] What are Shipping Methods?
  - [ ] What are Shipping Methods? (`What_are_Shipping_Methods_.txt`)
  - [ ] Ship Via Window Field Level Descriptions (`VSharedShipVia.txt`)
- [ ] What are States/Provinces?
  - [ ] What are States/Provinces? (`What_are_States_Provinces_.txt`)
  - [ ] State Province Window Field Level Descriptions (`VSharedStateProvince.txt`)
- [ ] What are Postal Codes?
  - [ ] What are Postal Codes? (`What_are_Postal_Codes_.txt`)
  - [ ] Postal Codes Window Field Level Descriptions (`VSharedPostalCode.txt`)
- [ ] What are Terms?
  - [ ] What are Terms? (`What_are_Terms_.txt`)
  - [ ] Terms Window Field Level Descriptions (`VSharedTermsRules.txt`)
  - [ ] Terms Maintenance
    - [ ] Editing Terms (`Editing_Terms.txt`)
    - [ ] Deleting Terms (`Deleting_Terms.txt`)
- [ ] What are Product Codes?
  - [ ] What are Product Codes? (`What_are_Product_Codes_.txt`)
  - [ ] Product Code Window Field Level Descriptions (`VSharedProductCode.txt`)
- [ ] What are Commodity Codes?
  - [ ] What are Commodity Codes? (`What_are_Commodity_Codes_.txt`)
  - [ ] Commodity Code Window Field Level Descriptions (`VSharedCommodityCode.txt`)
- [ ] What are Status Reason Codes?
  - [ ] What are Status Reason Codes? (`What_are_Status_Reason_Codes_.txt`)
  - [ ] Reason Code Window Field Level Descriptions (`VSharedReasonCode.txt`)
- [ ] What are Currency Codes?
  - [ ] What are Currency Codes? (`What_are_Currency_Codes_.txt`)
  - [ ] Currency Codes Window Field Level Descriptions (`VSharedCurrencyCode.txt`)
  - [ ] Currency Code Maintenance
    - [ ] Entering Currency Codes (`Entering_Currency_Codes.txt`)
    - [ ] Specifying Currency Codes (`Specifying_Currency_Codes.txt`)
    - [ ] Using Alternate Currencies (`Using_Alternate_Currencies.txt`)
- [ ] What is the Jobshop Control Panel?
  - [ ] What is the Jobshop Control Panel? (`What_is_the_Jobshop_Control_Panel_.txt`)
  - [ ] Changing Your User Password (`Changing_Your_User_Password.txt`)
  - [ ] Change Password Dialog Field Level Descriptions (`VmfgChgPassword.txt`)
  - [ ] Setting Up Your Printer (`Setting_Up_Your_Printer.txt`)
- [ ] Common Reports
  - [ ] Common Reports (`Common_Reports.txt`)

## Reports (99, Jobshop_Report_List)


### Accounting (nline_js_admin)

- [ ] Account List (`AccountList.rpt`): Use the Account List report to print a list of your accounts. The information on this report includes: Account ID, Account Description, and Account Type. You ca
- [ ] Account Set List (`AccountSetList.rpt`): Use the Account Set List report to print a list of your account sets and the accounts they contain. This is a printable version of your Account Set window. You 
- [ ] Accounting Calendar (`AccountingCalendar.rpt`): Use the Accounting Calendar report to print your established account periods and their closed status. The information on this report includes: Year, Period, End
- [ ] Journal Batch Detail List (`JournalBatchDetail.rpt`): Use the Journal Batch detail List report to print a sorted list of your journal batch export files, by Account ID and date. The report includes the following: B
- [ ] Journal Batch List (`JournaltBatchList.rpt`): Use the Journal Batch List report to print a sorted list of your journal batches. The report contains the following information: Batch ID, Posting Date, Period/

### Common (nline_js_common)

- [ ] Commodity Code List (`Commoditycodelist.rpt`): Use the Commodity Code List to generate a printed list of your Commodity Code IDs and their associated Descriptions. You can access the Commodity Code List dire
- [ ] Currency Code List (`CurrencyCodeList.rpt`): The Currency Code List report generates a list of all the currencies and their associated codes within your database. The report includes: Currency ID, Name, Sy
- [ ] Currency Code List (`CurrencyCodeList.rpt`): Use the Currency Code List report to view a list of currency codes you use within your system. You can specify the sort criteria for the report. The information
- [ ] FOB Point List (`FOBPointList.rpt`): Use the FOB Point List report to generate a report with a list of Free on Board information, including the Free On Board ID and its Description. You can access 
- [ ] Payment Terms List (`TermsList.rpt`): Use the Payment Terms List report to generate a list of the Terms configured in the Common group bar. The Payment Terms List report includes the following infor
- [ ] Postal Code List (`PostalCodeList.rpt`): Use the Postal Code List report to generate a list of your Postal Codes and Zip Codes entered in the Common group bar of Infor VISUAL Jobshop. The information o
- [ ] Product Code List (`Productcodelist.rpt`): Use the Product Code List report to generate a list of Product Codes in your Jobshop system. The Product Code List report includes: Product Code ID, and Descrip
- [ ] Reason Code List (`Reasoncodelist.rpt`): Use the Reason Codes List report to prepare reports using your reason code information. Optionally, you can print the barcode values for your Reasons as well. T
- [ ] Shipping Method List (`Shippingmethodlist.rpt`): Use the Shipping Methods List create a list of your various Ship Via methods. Thie report includes: Ship Via IDs and Descriptions. You can access this report di
- [ ] State / Province List (`Stateprovincelist.rpt`): Use the State /Province List report to prepare reports using your states and provinces information. The report includes: State/Province IDs and associated Descr

### Engineering (nline_js_engineering)

- [ ] Engineering Master (`EngineeringMaster.rpt`): Use the Engineering Master report to print the nonfinancial portion of your engineering masters. The report includes: Part ID, Engineering ID, Desired Quantity,
- [ ] Engineering Master Cost (`EngineeringMasterCost.rpt`): Use the Engineering Master Cost report to print a list of the costs in an engineering master, excluding Outside Service costs. This report includes the followin
- [ ] Engineering Master List (`EngMasterList.rpt`): Use the Engineering Master List report to print a list of your engineering masters. Use this report to view: Part ID, Engineering ID, Description, and a printed
- [ ] List (`EngineeringMaterialList.rpt`): Use the Engineering Master Material List reports to print a list of the parts required for each of the engineering masters on your selected
- [ ] Operation Template List (`OperationTemplateList.rpt`): Use the Operation Template report to print a text version of your operation templates. You can access the Operation Template report directly from the Operation 

### Estimating (nline_js_engineering)

- [ ] Quote Form (`QuoteForm.rpt`): Use the Quote Form report to print quotes, each quote on its own page, that you can send to your customers. The Quote Form information includes: Quote Date, Quo
- [ ] Quote List (`QuoteList.rpt`): Use the Quote List report to print a list of your quotes. The information on the Quote List includes: Quote ID, Date, Expected Date, Expiration Date, Win Date, 
- [ ] Quote Master (`QuoteMaster.rpt`): Use the Quote Master report to print a report of the details that make up a quote master. The report details include: Part ID, Master ID, Desired Quantity, Acco
- [ ] Quote Master Cost (`QuoteMasterCost.rpt`): Use the Quote Master Cost report to print costs associated with your various Quote Masters. The Quote Master Cost report includes the following information: Par
- [ ] Quote Master List (`QuoteMasterList.rpt`): Use the Quote Master List report to generate a list and a text version of the Quote Masters in your system. The Quote Master }}--> }}-->List report includes: Qu
- [ ] Quote Proforma (`QuoteProforma.rpt`): Use the Quote Proforma report to help manage your backlog of open quotes. The Quote Proforma report consists of: Quote ID, Quote Date, Status, Customer Name, Co

### Inventory (nline_js_inventory)

- [ ] Inventory Location List (`WarehouseLocationList.rpt`): Use the Inventory Location List report to print a list of your inventory locations and their descriptions. You can access this report directly from the Location
- [ ] Inventory Transaction List (`InventoryTransaction.rpt`): Use the Inventory Transaction List report to print a list of the Inventory Transactions within your operation. The information on this report includes: Inventor
- [ ] Inventory Turns (`InventoryTurns.rpt`): Use the Inventory Turns report to print a managerial report for a range of parts over the last 6 months, the inventory value for the range of parts, and the ann
- [ ] Inventory Value (`InventoryValue.rpt`): Use the Inventory Value report to print a list, by Part ID, of all the individual FIFO layers for that part. The on-hand quantity and value of each FIFO layer a
- [ ] Content List (`LocationContentList.rpt`): Use the Location Content List report to view a list of all your locations, the parts/inventory each contains, and quantities for the inventory. The report inclu
- [ ] Lot Where Used Report (`LotWhereUsed.rpt`): Use the Lot Where Used report to view a list of lot tracked part transactions, and where they are or went. It is a sequential list of all inbound and outbound t
- [ ] Part List (`PartlistSimple.rpt`): Use the Part List report to create a list of your inventory parts, with only minimal details. For a more detailed list, see the Part report. The information on 
- [ ] Part Location List (`PartLocationList.rpt`): Use the Part Location List report to generate a list of inventory parts and their stock location. The Part Location List report includes the following: Part ID,
- [ ] Part (`Partlist.rpt`): Use the Part report to generate a list of inventory Parts and their attributes. The information on this report includes: Part ID, Description, General / Plannin
- [ ] Physical Count Form (`PhysicalCountForm.rpt`): Use the Physical Count Form report to print a list of your parts and their respective quantities. Use this report before you perform a Physical Inventory Count 
- [ ] Unit Conversions List (`UnitsConversionList.rpt`): Use the Unit Conversions List report to print a list of your unit conversions. Global unit conversions appear first, followed by part specific unit conversions.
- [ ] Units of Measure List (`UnitList.rpt`): Use the Unit of Measure List report to print a list of your units of measure. The Units of Measure List report includes: UM ID, Description, and Unit Scale. You
- [ ] Where Used (`WhereUsed.rpt`): Use the Where Used report to print a list of your parts and the engineering masters, quote masters, and work orders in which you have referenced them. The Where

### Planning (nline_js_planning)

- [ ] Material Netting (`MaterialNetting.rpt`): Use the Material Netting report to view and print Sales Order line and Work Order demand versus Purchase Order and Work Order supply for any active and incomple
- [ ] Resource Schedule (`ResourceSchedule.rpt`): Use the Resource Schedule report to print a list of the work order operations scheduled to run on each resource at a given period of time. You may want to run t

### Purchasing (nline_js_purchasing)

- [ ] Supplier (`Partsbysupplier.rpt`): Use the Parts & Services by Supplier report to generate a list of suppliers and the parts for which you and the supplier have established price breaks. The info
- [ ] Purchase Order (`PurchaseOrder.rpt`): Use the Purchase Order report to print your purchase orders to mail or fax to your suppliers. The Purchase Order report includes: Purchase Order Date, Purchase 
- [ ] Purchase Order Detail (`PurchaseOrderDetail.rpt`): Use the Purchase Order Detail report to print an extensive detailed report of your purchase orders. The Purchase Order Detail report includes: PO Number, Suppli
- [ ] Purchase Order List (`PurchaseOrderList.rpt`): Use the Purchase Order List report to print a compact list of your purchase orders. The Purchase Order List report includes: Purchase ID, Status, Order Date, De
- [ ] Receiver (`Receiving.rpt`): Use the Receiver report to print your receivers. You can use your Receivers to document purchase receipt information and tag your incoming material with vital i
- [ ] Receiver List (`ReceiverList.rpt`): Use the Receiver List report to print a detailed list of all of your Receivers, open or closed. The information on the Receiver List report includes: Receiver I
- [ ] Service List (`ServiceList.rpt`): Use the Service List report to print a list of your supplier services. This report consists of: Service IDs and Descriptions. You can access the Service List Re
- [ ] Supplier Delivery Performance (`SupplierDeliveryPerformance.rpt`): Use the Supplier Delivery Performance report to print a report describing the performance of your suppliers, based on the desired receive on dates from your pur
- [ ] Supplier List (`SupplierList.rpt`): Use the Supplier List report to print a text version of your Suppliers window information. The Supplier List report includes: Supplier ID, Name, Address Informa
- [ ] Supplier Price Performance (`SupplierPricePerformance.rpt`): Use the Supplier Price Performance report to print a detail report of your suppliers prices against the quantity you have purchased in the past. The informatio
- [ ] List (`SupplierPartPriceList.rpt`): Use the Supplier Prices by Part List to print out your Supplier Prices. Jobshop sorts the Supplier Prices based on the Part ID. The Supplier Prices by Part List
- [ ] Tax Group List (`PurchaseSalesTaxGroupList.rpt`): Use the Tax Group List report to print a list of your purchase tax groups. The Tax Group List report includes: Effective Date, Description, Tax Name, Account ID

### Sales (nline_js_sales)

- [ ] Backlog by Order Line (`LineBacklog.rpt`): Use the Backlog by Order Line report to view each sales order line whose shipped quantity is less than the order line quantity. The Backlog by Order Line report
- [ ] Backlog by Sales Order (`Backlog.rpt`): Use the Backlog report to print a list of Backlogged Sales Orders. The Backlog report totals unshipped sales order lines with a status of Firmed and Released. J
- [ ] Carrier List (`Carrierlist.rpt`): Use the Carrier List report to print a list of Carriers. The Carrier List report includes: Carrier ID, Carrier Name, Shipper ID, Route, Instructions, and COD Ch
- [ ] Customer List (`CustomerList.rpt`): Use the Customer List report to generate a printable version of the Customer window information. The Customer List report includes: Customer ID, Customer Name, 
- [ ] Discount Class List (`DiscountClassList.rpt`): Use the Discount Class List report to print a list of Discount Class IDs, Descriptions, and Percentages. You can access this report directly from the Discount C
- [ ] Invoice (`Invoice.rpt`): Use the Invoice report to formally request payment from your customer. Typically, you generate your invoices automatically from the Invoicing window. Use the In
- [ ] Invoice List (`InvoiceList.rpt`): Use the Invoice List report to print a text list of your invoices. The Invoice List report includes the following: Invoice ID, Invoice Date, Customer, Contact, 
- [ ] Pack List (`PackList.rpt`): Use the Pack List report to generate Sales Order Pack Lists. The information on the Pack List report includes: Shipper ID, Sales Order Number, Shipped Date, Sol
- [ ] Sales Analysis (`SalesAnalysis.rpt`): Use the Sales Analysis report to view Sales Amounts and Percentages of Total Sales, and Bookings totals, Jobshop calculates a Bookings to Sales Ratio to allow y
- [ ] Sales Order Acknowledgement (`SalesOrderAcknowledgement.rpt`): Use the Sales Order Acknowledgment report to document sales orders.
- [ ] Sales Order Detail (`SalesOrderDetail.rpt`): Use the Sales Order Detail report to print a financial detail of your sales orders. The Sales Order Detail report includes: Order Date, Desired Shop Date, Statu
- [ ] Sales Order List (`Salesorderlist.rpt`): Use the Sales Order List report to print a text list of Sales Orders. The Sales Order List includes the following information: Sales Order ID, Order Date, Statu
- [ ] Sales Rep List (`Salesreplist.rpt`): Use the Sales Representative List report to print a text list of your Sales Representative IDs and their names. You can access the Sales Rep List directly from 
- [ ] Sales Tax Group List (`Salestaxgrouplist.rpt`): Use the Sales Tax Group List report to print a list of your Sales Tax Groups. The information on the Sales Tax Group List report includes: Effective Date, Descr
- [ ] Sales, Gross Margin and Throughput (`SalesGrossMargin.rpt`): Use the Sales, Gross Margin and Throughput Brief report to prepare a brief of Sales, Gross Margin and Throughput for analysis and management
- [ ] Service Charge List (`ServiceChargeList.rpt`): Use the Service Charge List report to generate a list of your Service Charge IDs, Description, and }}--> }}-->Amount. You can print this report directly from th
- [ ] Shipper List (`Shipperlist.rpt`): Use the Shipper List to print a text list of your shippers. This report includes: Ship to, Contact, Sold to, Contact, Shipper ID, Type, Amount, Terms, Freight, 
- [ ] Standard Industry Code List (`Standardindustrycodelist.rpt`): Use the Standard Industry Code List report to print a list of your Standard Industry Classification Codes. The report contains the SIC Code IDs and Descriptions
- [ ] Territory List (`TerritoryList.rpt`): Use the Territory List report to print your Territory IDs and their associated Descriptions. You can access the Territory List report directly from the Territor

### Shopfloor (nline_js_shopfloor)

- [ ] Calendar Exception List (`CalendarChangeList.rpt`): Use the Calendar Exception List report to print a list of your calendar exceptions. The Calendar Exception list includes: Resource ID, Start and End Dates for t
- [ ] Calendar Week List (`CalendarWeekList.rpt`): Use the Calendar Week List report to print a list of your the normally scheduled time for each resource. This report includes the following information: Resourc
- [ ] Customer Throughput (`CustomerThroughput.rpt`): Use the Customer Throughput report to print a report listing the calculated throughput (shop rate) of jobs over a defined period of time, listed by customer. On
- [ ] Cut List (`CutList.rpt`): Use the Cut List report to print a list of material requirements and operation specifications for piece tracked items. Only unissued, piece
- [ ] Employee Efficiency (`EmployeeEfficiency.rpt`): Use the Employee Efficiency report to print reports and graphs comparing estimated versus actual hours of effort for your employees. Jobshop only calculates emp
- [ ] Employee Label (`EmployeeLabel.rpt`): Use the Employee Label report to generate barcode labels for scanning. The Employee Label report uses the labor data collection module and can print using any A
- [ ] Employee List (`EmployeeList.rpt`): Use the Employee List report to print a list of your employees, including Clock Number, Employee Name, Shift, Cost/Hour, and Cost/Unit information. You can acce
- [ ] Employee Throughput (`EmployeeThroughput.rpt`): Use the Employee Throughput report to print a report of the calculated throughput (shop rate) of jobs, listed by employee, over a defined length of time. The Em
- [ ] Labor Analysis (`Runtimevar.rpt`): Use the Labor Analysis report to view setup and runtime estimates, actuals, and variances. You can also view the efficiency percentages for employees or resourc
- [ ] Labor List (`LaborList.rpt`): Use the Labor List report to print a summarized list of your labor transactions within your operation. This report includes the following information: Clock Num
- [ ] Labor Transaction (`Labor.rpt`): Use the Labor Transaction report to print a detailed list of your labor transactions by work order. The Transaction report contains the following information: W
- [ ] Pick List (`PickList.rpt`): Use the Pick List report to print a list of non-piece tracked parts for a particular work order or group of work orders. The Pick List report includes the follo
- [ ] Production (`ProductionBrief.rpt`): Use the Production report to print a report you can use to help track and manage your shop production. This report details what parts you received into inventor
- [ ] Quality Tracking Graph (`QualityTrackingGraph.rpt`): Use the Quality Tracking Graph report to print a graph displaying reasons of nonconforming material and scrap over time. The Quality Tracking Graph includes the
- [ ] Quality Variance (`Qualityvar.rpt`): Use the Quality Performance report to print a report displaying reasons for scrapped or nonconforming material review parts over a defined time period. The Qual
- [ ] Resource Efficiency (`ResourceEfficiency.rpt`): Use the Resource Efficiency report to print a report that compares estimated versus actual hours of effort for resources or groups of resources. The information
- [ ] Resource Throughput (`ResourceThroughput.rpt`): Use the Resource Throughput report to print a report listing the calculated throughput (shop rate) of jobs over a defined period of time listed by resource. The
- [ ] Resource Utilization (`ResourceUtilization.rpt`): Use the Resource Utilization report to print a graphical view of a range of resources in your operation. The graph displays the Percent Utilized on a weekly bas
- [ ] Resource Where Used (`ResourceWhereUsed.rpt`): Use the Resource Where Used report to determine the work orders and masters that use each resource specified in the selected range. The report includes, for eac
- [ ] Schedule Performance (`SchedulePerformance.rpt`): Use the Schedule Performance report to generate a performance brief, based on the last run of the schedule, for your shop conformance to Want and Start Dates fo
- [ ] Shop Resource List (`Shopresourcelist.rpt`): Use the Shop Resource List report to print a text version of your Shop Resource window information. The Shop Resource List report includes: Resource ID, Descrip
- [ ] Shop View List (`Shopviewlist.rpt`): Use the Shop View List report to generate a list of your Shop Views and the operations that make up each of them. The Shop View List report includes: Sequence N
- [ ] Traveler (`Traveller.rpt`): Use the Traveler report to print the information required to manufacture specific parts or products on your shop floor. A Traveler report is the printed version
- [ ] WIP Value (`WIPValue.rpt`): Use the WIP Value report to print a list of the value of Work In Progress by Work Order ID. The WIP Value report shows the value of any parts you are making tha
- [ ] Work Order Cost (`WorkOrderCost.rpt`): Use the Work Order Cost report to print a detailed report of costs applied to your work orders. The Work Order Cost report includes: Part ID, Description, Statu
- [ ] Work Order History (`WorkOrderHistory.rpt`): Use the Work Order History report to print a list of all work order transactions listed by Material Cost, Labor Cost, Service Cost, Burden Cost, and Total Cost.
- [ ] Work Order List (`WorkOrderList.rpt`): Use the Work Order List report to print a list of your work orders. You can run the Work Order List report based on work order status. The Work Order List repor
