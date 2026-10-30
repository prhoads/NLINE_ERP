# Inventory (nline_js_inventory) — status

Module `modules/nline_js_inventory`, screens `nline_desk/web/js/jobshop/inventory.js`,
data `migration/jobshop/inventory.py`. Tests: `test.ps1 nline_js_inventory`
(scenario `tests/scenario_nline_js_inventory.rst`, also runs the migration
against a stand-in Jobshop) — passing; `jscheck.py` OK.

## Checklist

- [x] What are Inventory Functions? — the five windows below (routes `parts`,
  `units`, `unit-conversions`, `locations`, `adjustments`).
- [x] Parts
  - [x] What are Parts? — `product.template` (Part ID = `code`, one variant).
  - [x] What is Lot Tracking? — Lot Tracked = stock_lot's `lot_required` on
    every location type (function field `lot_tracked`); refused while the part
    has stock on hand (Jobshop's rule). Tracking No on adjustments, transfers
    and counts = `stock.lot`.
  - [x] What is Supply & Demand? — View > Supply & Demand (tabs Sales Orders,
    Work Orders, Purchase Orders; RPC `part_supply_demand`), also on
    `window.JobshopInventory.supplyDemand(templateId)` for the other areas.
  - [x] Parts Window Field Level Descriptions (`VInventoryPart`) — see the
    fields below.
  - [x] Part Maintenance
    - [x] Accessing Parts — `#/parts`, `#/parts/<template id>`, the 11 tabs in
      Jobshop's order (+ Notes, Premier).
    - [x] Copying Existing Part Information to a New Part ID — Copy asks the
      new Part ID (RPC `part_copy`: everything but Part ID and its stock
      locations).
    - [x] Editing Part Information — Save / Ctrl+S.
    - [x] Deleting Parts — Delete (RPC `part_delete`) refuses a part used in
      moves, orders, masters, work orders or invoices ("mark it Inactive").
    - [x] Part Window Tab Information
      - [x] Part tab — Part ID, Inactive, Description, Stock U/M, Engineering
        Master (`engineering_revision`), Commodity / Product Code, Weight U/M,
        Net Weight, Ship Dimensions, Drawing ID / Rev / File, Manufacturer,
        Manufacturer Part ID, Type, Fabricated, Purchased, Sold, Stocked,
        Tool/Fixture, Auto Issue, Consumable, Lot Tracked.
      - [x] General tab — Primary / Issue From Location, Preferred Supplier
        (first `purchase.product_supplier`), Leadtime, Order Point, Safety
        Stock, Min / Max / Multiple order qty, Max stock, Purchase / Selling /
        Usage U/M, piece tracking flags and Dimensions U/M, User Defined 1-10
        (labels: `nline.desk.configuration.part_user_labels`, imported from
        Jobshop's System Settings).
      - [x] Costing tab — Material, Labor, Burden, Service, Fixed Cost, Unit
        Cost (sum), Unit Price, Inventory Cost (Tryton's average, read-only),
        Cost Method, Account Set ID (= accounting category). Labor / burden /
        service read-only on a purchased-only part, fixed cost on a
        fabricated-only part.
      - [x] Specs tab — `specifications`.
      - [x] Picture tab — frame's picture tab (attachments).
      - [x] Locations tab — `nline.js.part_location` (Location ID,
        Description, Hold, Qty On Hand, Primary, Issue From, Last Counted);
        a part location is added automatically when a move brings the part
        into a storage location (Jobshop's behaviour).
      - [x] Unit Conversions tab — the part's `nline.js.unit_conversion`.
      - [x] Sales Order Lines tab — RPC `part_orders(…, 'sale', statuses)`;
        right-click / "Status..." changes the statuses shown (Released by
        default); double-click opens the order (when the user may).
      - [x] Purchase Order Lines tab — same, `'purchase'`.
      - [x] Work Orders tab — same, `'production'`.
      - [x] Browse tab — Jobshop's columns; inactive parts included (Show All).
  - [x] Where Used Part Information — View > Where Used (Eng Masters / Work
    Orders check boxes; RPC `part_where_used`).
  - [~] Inventory Pieces — View > Inventory Pieces shows the stock by location
    and tracking number (RPC `inventory_pieces`). Dimensional piece tracking
    (lengths / widths / heights of each piece) is not kept: no N-Line part is
    piece tracked (0 of 15,611); the flags are kept on the part.
  - [x] Inventory Transactions — View > Inventory Txs (RPC
    `inventory_transactions`: Jobshop class ADJUSTMENT / TRANSFER / ISSUE /
    WO_RECEIPT / PO_RECEIPT / SHIPMENT, in/out, location, lot, cost, document,
    reason).
  - [~] Material Costs — Tools > Reset Material Costs (RPC
    `reset_material_costs`): resets the cost of the not-done work order
    materials to the part's current cost, by status and creation dates.
    Masters have no material cost of their own in Tryton (they use the part's
    live), and description / specs / drawing / supplier of a material are read
    from the part, so there is nothing else to reset. Quote masters: not in
    this area.
- [x] Units of Measure (`#/units`) — Jobshop's table: ID (= symbol),
  Description (= name), Unit Scale (= digits / rounding), Inactive; a new unit
  without a category gets a category of its own. Delete refused when used.
  RPCs `units_list` / `units_save`.
- [x] Unit Conversions (`#/unit-conversions`) — the general conversions (no
  part); status bar shows the sentence. RPCs `conversions_list` /
  `conversions_save`; `unit_convert(qty, from, to, template)`.
- [x] Locations (`#/locations`) — storage locations under the warehouse's
  storage: Location ID (= code), Description (= name), Inactive; Inventory Txs
  of the selected location. Delete refused when the location has moves. RPCs
  `locations_list` / `locations_save`.
- [x] Adjustments (`#/adjustments`)
  - [x] What are Inventory Adjustments?
  - [x] Adjustments Window Field Level Descriptions (`VInventoryAdjustments`).
  - [x] Accessing Inventory Adjustments.
  - [x] Entering Adjustments — Adjustments tab: Type, Date, Part ID, Quantity,
    Location ID, On Hand, Available, Tracking No, Reason Code, Adj Account ID,
    unit costs; New Adjustment adds to the table, Save (Ctrl+S) posts the
    table: a done move from / to lost and found (`adjustments_post`). Never
    leaves a location negative. Adjust In at value updates the average cost.
  - [x] Inventory Transfers — Transfers tab (`transfers_post`): done move
    between storage locations.
  - [x] Editing Adjustments and Transfers — only the unsaved table lines
    (click a line); saved ones are corrected by the inverse transaction.
  - [x] Viewing Inventory Pieces / Transactions — View menu of the window.
  - [x] Deleting Adjustments and Transfers — Del on an unsaved line.
  - [x] Adjustments Window Tab Information
    - [x] Adjustments tab, [x] Transfers tab
    - [x] Physical Count tab — filters (location / part / product code /
      commodity code ranges, active / inactive / both), Adjustment Type, Reason
      Code, Date, Zero Adjust In Costs, Refresh Count Quantity, Refresh Costs,
      Select / UnSelect All; Save Counts keeps the counts in draft
      `stock.inventory` (one per location), Adjust confirms them
      (`count_sheet`, `count_save`); Last Counted on the part locations.
- [-] Inventory Reports — the admin area builds all Jobshop reports
  (`js-reports/inventory`); the data is available through the RPCs above.

## Second pass (28 Oct 2026): Jobshop's own window definitions

Analysis and gap tables: `docs/jobshop/analysis/inventory.md`. Changes:

- Parts window rebuilt on N-Line's installed layout (Part.txt +
  PartSubTabs.txt): the Part header (placed fields, Settings and Unit Costs
  group boxes, Part ID lookup in place, Edit Master) stays above the 18 sub
  tabs (General, Other, Picture, Specs, Notes, Unit Conv, Locations,
  Tracking Info, Spec Instr., Quote / SO / RFQ / PO Lines, Work Orders, the
  four pricing tabs); the Browse tab hides it. Browse: Jobshop's columns and
  Show All. View / Tools menus in Jobshop's captions and order.
- New part fields: date_tracked, commissionable, preserve_unit_costs,
  preserve_unit_price, update_costs_from_po, user_10, user_11 (N-Line's
  data; no label in Jobshop, shown disabled as "User 10/11"), 7
  *_instructions, quantity_on_hand / quantity_on_hold, preferred_supplier_2
  ..5, read-only texts (record_created / modified, account set and expense
  account, dimensions U/M, supplier names). Part location `inactive`
  (Locations Show All). stock.move `transaction_note`.
- Jobshop's part rules (classPartEditor) on save of the fields concerned:
  R+D/Consumable, piece tracked, lot tracked + auto issue, Issue From on
  hold, Primary / Issue From an inactive part location. The migration
  skips them (context `nline_js_no_part_rules`).
- RPCs (partinfo.py): part_orders (quote, sale, rfq, purchase, production;
  Jobshop statuses incl. Hold / Firm / Unapproved / All, through the areas'
  status fields), part_prices, part_tracking, part_lines_setup,
  wo_material_availability (N-LineAvailability). part_where_used: Quote
  Master + Jobshop's columns. adjustments_post: last_counted, note.
- Adjustments: Set Last Counted Date, Transaction Note, Qty Available to
  Adjust / Qty. Avail. to Transfer, Adjust / Transfer buttons, Jobshop's
  grid columns. Locations: no Warehouse column.
- Decisions: Type / Sold / Cost Method / Inventory Cost stay (marked
  "(ERP)", Tryton needs them). Part IDs are not limited to Jobshop's
  characters (N-Line has 30+ such parts). The ID lookup no longer lists
  inactive parts; the Browse Show All does (Jobshop). The "!" button of a
  user field opens its value as a file link.
- Left: Edit Tracking Information dialog, the save warnings (need a
  frame change), piece tracking dimensions (unused), Physical Count's
  inactive part-location filter / columns, PhysicalCountBC, the PO link
  columns of Material Availability, the full Reset Material Costs dialog.

## Models and fields (for the other areas)

- `product.template` (PoolMeta): `inactive` (function on `active`),
  `stocked`, `tool_or_fixture`, `auto_issue`, `lot_tracked` (function on
  `lot_required`), `product_code`, `commodity_code`, `weight`, `weight_uom`
  (same names and types as product_measurements, not installed),
  `ship_dimensions`, `drawing_file`, `mfg_name`, `mfg_part_id`,
  `primary_location`, `issue_from_location`, `preferred_supplier` (function on
  the first product supplier), `lead_time_days`, `order_point`,
  `safety_stock`, `minimum_order_qty`, `maximum_order_qty`,
  `multiple_order_qty`, `maximum_stock_qty`, `piece_tracked`,
  `length_required`, `width_required`, `height_required`, `dimensions_uom`,
  `usage_uom`, `user_0`..`user_9`, `unit_material_cost`, `unit_labor_cost`,
  `unit_burden_cost`, `unit_service_cost`, `fixed_cost`, `unit_cost`
  (function), `specifications`, `part_locations`, `unit_conversions`.
  Reused: `code`, `name`, `default_uom`, `producible`, `purchasable`,
  `salable`, `consumable`, `list_price`, `account_category`, `sale_uom`,
  `purchase_uom`, nline_engineering's `engineering_revision`,
  `drawing_number`, `drawing_revision`. The Part ID (code) is unique.
- `nline.js.part_location` (template, location, hold, last_counted; quantity /
  primary / issue_from functions).
- `nline.js.unit_conversion` (template or none, from_uom, to_uom, factor;
  `factor_between()` / `convert()`: same unit, Tryton category, the part's
  then the general conversions, direct or reciprocal, also between units of
  two categories through a conversion of those categories).
- `stock.move` (PoolMeta): `reason_code` (nline.reason_code),
  `adjustment` (in / out / transfer), `adjustment_account`; `get_js_class()`.
- `stock.shipment.in`: receipts go to the part's primary location when it is
  in the warehouse's storage.
- `nline.desk.configuration.part_user_labels`.
- Access: the two new models read for everyone, write for `stock.group_stock`
  and `product.group_product_admin`.

## Decisions

- Unit conversions across Tryton categories: a model of its own; Tryton's sale
  and purchase lines still take a unit of the part's category (their domain).
  `nline.js.unit_conversion.convert()` / RPC `unit_convert` are there for the
  sales and purchasing areas when they let a line use another unit (they
  convert the quantity to a unit of the category); the standard lines are not
  changed here.
- Jobshop's single warehouse = Tryton's default warehouse; Jobshop locations =
  storage locations under its storage location.
- Adjust In / Out = done moves to / from the warehouse's lost and found; a
  physical count = `stock.inventory` (Tryton's count, posted by confirm).
  Jobshop's FIFO layer "at value" is the average cost recomputed with the
  value adjusted in; the "revalue" count type sets the average cost to the
  count's unit cost.
- Primary location as default: done for receipts (shipment in). Shipments
  and production issues keep Tryton's assignment from the warehouse storage
  (picking from children), which finds the part wherever it is.
- The old Parts tabs Stock / Where Used / Transactions are now Jobshop's
  View menu dialogs (Material Availability, Where Used, Inventory Txs) and the
  Locations tab; `part_info` (nline_desk) is unchanged and no longer used by
  this screen.
- Inactive parts are shown in the ID lookup and the Browse tab (Jobshop's
  Show All); the Inactive check box is `not active`.
- Physical count "Save" keeps the counts as draft inventories; reopening the
  tab shows the saved counts.

## Data (migration/jobshop/inventory.py)

Units (only those with a description or used; EA/IN/FT/LBS/HR/SQ in/Gal mapped
to Tryton's units, others made in a category of their own), the 186 locations,
the part user labels, the part fields above for every part the base step made
(product / commodity codes made when missing), preferred suppliers 2-5, part
notes (`NOTES` -> one ir.note), the unit conversions (part and general), the
part locations with stock or on hold. Opening balances (QTY_ON_HAND as
adjustments at the part's unit cost) only with `NLINE_JS_INVENTORY_BALANCES=1`
— run once at cutover.

## For the integrator

- Module dependencies: nline_js_inventory now also lists account,
  nline_engineering, product, production, purchase, sale, stock (all already
  under nline_desk). Activate / update `nline_js_inventory` on the databases.
- Migration step `js_inventory` (after `js_common`).
- Suggested shared changes: (1) frame.js `form.allow()` resets the hidden
  state of every extra button, so a screen cannot hide its own extra buttons
  after the fact — this screen builds its extras from the rights before
  calling `UI.master`; (2) `UI.master` could offer an `onclear` hook and a
  `clear()` in its return value (the Part window reloads the route after a
  delete); (3) the Home tile "Inventory Counts" (stock.act_inventory_form)
  could point to `#/adjustments` (Physical Count tab).
- Other areas: `window.JobshopInventory.{whereUsed, inventoryTxs,
  inventoryPieces, supplyDemand, materialAvailability, resetMaterialCosts}`
  (template id) for "Open Material Supply and Demand", "Material
  Availability" and "Open Part" (`UI.openScreen('parts/<template id>')`).

## Screenshot review fixes (28 Oct, second pass)

- Part tab: the Edit Master button is the height of the Eng Master Revision
  field (277,120-351,140; Jobshop's 116-142 is taller than the row).
- Part Browse: Part ID / Drawing ID on one line; Product Code and Commodity
  Code show the code's ID only (`product_code.code`), as Jobshop's Browse.
- Part tab grids (Quote/SO/RFQ/PO lines, Work Orders...): ID / No columns
  stay on one line (`idColumn` in `dataTable`).
- SO / PO / RFQ Lines: Line No falls back to the line's place in the order
  when its sequence is empty (`partinfo._line_no`, as the Sales and
  Purchasing windows number lines).
- Adjustments / Transfers: Qty Available to Adjust / Qty. Avail. to
  Transfer is Jobshop's read-only box (was bare text).
- Review claims not taken: the Locations grid's Primary / Issue From / Hold /
  Last Counted On columns are in Jobshop's layout (PartSubTabs.txt
  GRID PART_LOCATION has 8 columns); the Other tab's unlabelled User N fields
  stay, disabled, as Jobshop draws them — N-Line's data has values in them
  (e.g. User 10 on part 332-00582-001-01-2).

## Modern page (29 Oct 2026, owner's design; `docpage.js`)

- Parts (`parts`, `parts/<id>`) opens the modern page by default
  (`partsModern` in `inventory.js`); More > Classic view switches to
  Jobshop's window (`classicParts`, unchanged), whose ribbon has "New View"
  back (per browser, `UI.docView('part')`).
- Header: description, Part ID chip; sub-line product code · U/M · drawing;
  the unit cost on the right. Status chips Active/Inactive, Fabricated,
  Purchased, Stocked, Tool/fixture, Lot tracked. One main action: Order
  more (purchased part below order point / safety stock), Create master
  (fabricated part without one), else Supply & demand. "•••": Inventory
  Txs, Where Used, Material Availability, Inventory Pieces, Reset Material
  Costs, Open drawing file, Copy, Delete, Classic view — per the user's rights.
- Needs your attention: inactive but on open orders, no unit cost, below
  safety stock, at/below order point, negative on hand, fabricated without
  an engineering master, purchased without a preferred supplier, stocked
  without a primary location — each with its fix.
- Tracker: On hand → On order → Allocated → Available (`part_availability`).
- Sections: Open orders (SO / WO / PO lines from `part_supply_demand`,
  click opens the order), Where used (engineering masters,
  `part_where_used`), Locations (`nline.js.part_location`: qty, primary,
  issue from, hold, last counted).
- Cards with a pencil: Part (description, U/M, flags, inactive), Costs,
  Planning, Purchasing, Engineering and drawing, Accounting, Specs. Saves
  write only the fields that changed (Tryton refuses an unchanged Stock U/M
  once the part has moves).
- Paper trail: created, last modified, last received / issued / shipped
  (from `inventory_transactions`), last counted, Inventory transactions,
  Notes. Keys: S supply & demand, W where used, T transactions, E master.
- New part: New, then "Enter the part" asks Part ID, description, Stock U/M
  and the kind flags.
- Adjustments / Transfers / Physical Count stay entry grids (unchanged).
- No server change.
