# Engineering area: status

Module `modules/nline_js_engineering`, screens
`modules/nline_desk/web/js/jobshop/engineering.js` (and `js/workorder.js`),
data `migration/jobshop/engineering.py` (step `js_engineering`).

## What is built

Screens (routes pushed on `NLINE_ROUTES`):

| Route | Screen | Window |
|---|---|---|
| `work-orders/new`, `work-orders/<id>` | `jsWorkOrder` (also `Screens.workOrderWindow`) | Work Order window |
| `workorders/<id>` | `workorder` (workorder.js) | the Work Order window on its Details tab |
| `workorders` | `workorders` (workorder.js, unchanged) | open work orders list |
| `masters`, `masters/<id>` | `jsEngineeringMaster` (also `Screens.engineeringMaster`) | Engineering Master |
| `quote-masters`, `quote-masters/<id>` | `jsQuoteMaster` | Quote Master |
| `operation-templates` | `jsOperationTemplates` | Operation Templates |
| `quotes`, `quotes/<id>` | `jsQuotes` (also `Screens.quotes`) | Quotes |

One card canvas component, `NLJobshop.cards(pane, {kind, id, perm, ...})`
in engineering.js, draws the Details tab of the three master windows
(work order = production + legs; engineering / quote master = BOM + routing,
Leg/Detail materials drawn as legs from the component's own master).
The ribbon of each master window has **Tools ▾**, **View ▾**, **Options ▾**
menus acting on the selected card (click selects; Jobshop's dotted outline),
the cards' right-click menus are Jobshop's (below), Del deletes the selected
card when allowed, double-click edits.

Models / fields (all in nline_js_engineering):

- `production` (work order): `planning_status` (Firm/Hold), `order_status`
  (Function + searcher: Unreleased, Firm, Hold, Released, Closed,
  Cancelled), `received_quantity`, `printed_date`, `closed_date`,
  `engineered_by/date`, `drawing_number/revision/page/file`, `product_code`,
  `commodity_code`, `global_rank`, `forward_schedule`, `specifications`,
  `variables`; `create` fills the unit from the part; the build tree nodes
  carry the Jobshop fields (status, specs/drawing icons, step ids).
- `production.bom` (masters): `master_type` (engineering / quote),
  `description`, `desired_quantity`, the header fields above,
  `workorder_instructions`, `private`, `variables`, `part` and `routing`
  (Function).
- `production.bom.input` and `production.material_card` (materials):
  `qty_per_type`, `fixed_quantity`, `scrap_percent`, `dimensions`, drawing
  fields, `specifications`, `unit_cost`, `fixed_cost`, `supplier`,
  `required_date`; bom input `leg_detail` (Jobshop leg: work orders made
  from the master make that leg); a card copies them from its BOM line.
- `production.routing.step` and `production.work` (operations): the Jobshop
  operation fields (run type and run, load size, move hours, transit days,
  minimum move, preserved, scrap/yield, overrides, capacities, drawing,
  specs, the 10 cost fields), `description`, `template`,
  `extra_resources`; step `resource`; work `setup_duration`/`run_duration`
  (copied from the step on release). `production.routing.work_order`
  marks a work order's own copy of the operations.
- New: `nline.engineering.operation_template` (CodeTable + operation
  fields, resource, routing operation, service, supplier, setup hours,
  special instructions), `nline.engineering.operation_resource` (additional
  resources), `nline.engineering.variable`, `nline.quote`,
  `nline.quote.line`, `nline.quote.line.price` (quantities quoted),
  `nline.quote.charge`.

Desk RPCs (`nline.desk`, all `eng_*`, rights checked first): `eng_tree`,
`eng_operation`, `eng_operation_save`, `eng_material`, `eng_material_save`
(also several lines: Add Materials), `eng_leg_add`, `eng_card_delete`,
`eng_change_status`, `eng_work_order_ready` (afterSave: master, routing,
work center, moves, legs of the Leg/Detail materials), `eng_work_order_copy`,
`eng_printed`, `eng_schedule`, `eng_employees`, `eng_start_labor`,
`eng_purchase`, `eng_costs`, `eng_availability`, `eng_supply_demand`,
`eng_transactions`, `eng_sales_links`, `eng_variables(_save)`,
`eng_coproducts(_save)`, `eng_master_ready`, `eng_master_copy`,
`eng_quote_cost`, `eng_party_address`, `eng_quote_get`, `eng_quote_save`,
`eng_quote_win`, `eng_quote_lose`, `eng_quote_copy`, `eng_quote_printed`.
Scenario test `tests/scenario_nline_js_engineering.rst` covers them (25
tests pass).

## Decisions

- **Work order operations**: before release they are routing steps; the
  first change makes the work order its own copy of the master's routing
  (`work_order` routing) so the master never changes (Jobshop copies the
  master into the order). After release they are works. Unreleasing a
  released order keeps its works as its own routing (Tryton deletes works
  on draft).
- **Statuses**: Unreleased = draft (or request), Firm / Hold = draft +
  `planning_status`, Released = waiting/assigned/running, Closed = done,
  Cancelled = cancelled. A header or leg status change cascades to its legs
  (Jobshop's table). Closing assigns (forced when short, as Jobshop closes
  short), runs, finishes the operations (nline_wip) and receives. A Closed
  order cannot be reopened (Tryton has no done → draft). Operation: Closed
  = finish, Cancelled = delete (not started). Material: Closed = issue,
  Cancelled = cancel the move.
- **Master legs**: a master's leg is a Leg/Detail material made from the
  component's own master (pinned revision or current); Show Details/Costs
  walk into it. Editing it edits that master (Jobshop keeps legs inside one
  master; N-Line's masters were imported per part).
- **Quote masters** are BOMs of type quote with their own routing (linked
  by `routing.boms`, not by the part, so no work order picks them).
  Numbered 00001... The sales group may write them (access + record rules:
  default rule "quote masters only", production admins any master).
- **Quotes** are their own model (as in Jobshop; the old screen used draft
  sales). Numbering YYYY + 4 digits (N-Line's 20260971). Win = sales order
  of the open lines (the quantity In Total) and the charges, quoted and
  confirmed as the old "Create Sales Order" did; the quote is Won and keeps
  the link. Lose / Cancel with the reason. Print = a printable page
  (the report templates are the admin area's), sets Printed and Ready.
- Sales rep, territory, SIC, carrier, discount class and tax group of a
  quote are text codes until the sales area's models exist.
- Costs (Show Costs, quote Cost From): material = unit cost override or the
  part's cost; labor = setup/run hours × the operation's rate or the
  resource's hourly cost; burden from the operation's burden fields;
  service = the service's cost × quantity. Estimated only for masters;
  work orders show the actual (done moves, labor cycles) beside.
- Scheduling a work order: 8 hour working days of the operations' hours plus
  transit days, backward from the want date (forward when the start would
  be past, or with Forward Schedule), weekends skipped. The planning area's
  scheduler can replace it.
- View Drawing shows the path as a `file:///` link (a browser cannot start
  the program as Jobshop does).
- The quote's Quote tab is the header; the lines are on a **Quote Lines**
  tab right after it (UI.master tabs are fields or a custom render, not
  both).

## Checklist

### Estimating

- [x] What are Estimating Functions?
- [x] Quotes
  - [x] What are Quotes?
  - [x] Maintaining Quotes
  - [x] Copying Quotes (Copy: new Active quote with lines, prices, charges)
  - [x] Understanding the Estimating Process
  - [x] Entering Quote Line Information
  - [~] Quotes Field Level Descriptions — all fields; sales rep, territory,
    SIC, carrier, discount class, tax group are codes (no models yet);
    currency (ALT_CURRENCY) not emulated
  - [x] Quote Window Tab Information
    - [x] Quote Tab (header) + Quote Lines tab
    - [x] Sold To Tab
    - [x] Ship To Tab
    - [x] Dates Tab
    - [x] Details Tab
    - [x] Specs Tab (specifications and quote footer)
    - [x] Charges Tab
    - [x] Browse Tab
- [x] Quote Masters
  - [x] What are Quote Masters?
  - [x] Quote Master Field Level Descriptions
  - [x] Maintaining Quote Masters
  - [x] Information Cards
    - [x] Understanding Information Cards
    - [x] Right Click Info
    - [x] Data Tips Option
    - [~] Information Card Icons — Drawing (D), Specs (S), Additional
      Resources (R); the Picture icon is the Picture menu item
  - [x] Creating and Updating Quote Masters
    - [x] Building Quote Masters / a New Quote Master / Copying Into a New
      Quote Master (also from and into an engineering master)
    - [x] Details, Specs, Picture, Browse tabs
    - [x] Quote Master Operations (Operation, Specs, Costs, Additional
      Resources, Other tabs; templates)
    - [x] Materials (Material, Specs, Costs, Purchasing tabs)
    - [x] Adding Quote Master Legs / Leg Detail Specifications
    - [x] Editing and Copying Quote Masters
  - [x] Deleting Quote Masters / information / cards / pictures (Picture tab
    attachments are deleted in Tryton's attachments)
  - [x] Quote Master Costs and Details (indented details and costs)
  - [x] Viewing Material Availability
  - [x] Supply & Demand
- [-] Estimating Reports — the reports are the admin area's
  (`nline_js_admin`, "all Jobshop reports"); the quote prints as a page here

### Engineering

- [x] What are Engineering Functions?
- [x] Maintaining Engineering Masters and Work Orders
- [x] Engineering Masters
  - [x] What are Engineering Masters?
  - [~] Field Level Descriptions — Account Set ID not emulated (accounting
    stays QuickBooks)
  - [x] Information Cards (Right Click Info, Data Tips, icons as above)
  - [x] Creating / Building / Copying Into a New Engineering Master
  - [x] Details, Specs, Picture, Browse tabs (plus the former window's
    Operations list, Materials and Makes grids, after Notes; Show Costs is
    in Tools / the cards' menu)
  - [x] Operations (and their Specs / Costs / Other tabs)
  - [x] Materials and Tools/Fixtures (Specs, Costs, Purchasing)
  - [x] Adding Legs, Leg Detail Specifications
  - [x] Editing and Copying
  - [x] Deleting masters, information, cards, pictures
  - [x] Costs and Details (indented)
  - [x] Viewing Material Availability
  - [x] Supply & Demand
- [x] Operation Templates (Operation, Specs, Costs, Additional Resources,
  Other, Browse tabs; used by the operation window's Template ID, which
  fills the operation and shows the special instructions)
- [-] Engineering Reports — admin area

### Work Orders (the Shopfloor group's Work Order window)

- [x] What are Work Orders? / Supply & Demand
- [~] Work Order Window Field Level Descriptions — Lot/Split ID stay in the
  Work Order ID (`WO/lot.split`, as imported); Account Set ID not emulated
- [x] Creating Work Orders / Building a New Work Order (afterSave: master,
  operations, materials, legs)
- [x] Copying Into a New Work Order (with its legs)
- [x] Details, Specs, Picture, Browse tabs (+ Other, Notes)
- [x] Work Order Operations (Specs, Costs, Other tabs)
- [x] Materials and Tools/Fixtures
- [x] Adding Work Order Legs, Leg Detail Specifications (Add Leg/Detail,
  drag a master revision onto a card, Make leg, Remove leg)
- [x] Editing and Copying Work Orders
- [x] Information Cards (Right Click Info, Data Tips, icons)
- [x] Deleting Work Orders (unreleased or cancelled ones; Tryton's rule)
- [x] Work Order Costs and Details (indented, estimated and actual)
- [x] Additional Work Order Functions
  - [x] Changing the Status of Work Orders (Change Status ▸ on header,
    leg, operation and material cards)
  - [x] Purchasing Materials and Services (draft purchase order from the
    card's supplier or the part's; outside service purchase; Request Quote
    opens the RFQ screen when the user has it)
  - [x] Viewing Pictures and Drawings
  - [x] Material Availability
  - [x] Inventory Transactions
  - [x] Labor Transactions
  - [x] Sales Order Links
  - [x] Scheduling in the Work Order Window
  - [x] Setting Up Variables (Dimensions recalculate the quantities)
- [x] Kept from the old window: Release, Assign Stock, Start, Receive,
  Traveler (sets Printed Date), the explode after save, Jobshop status names

## Permissions

Every action is shown only when allowed: `get_access` on production,
production.bom, production.bom.input, production.material_card,
production.work, production.routing.step, stock.move, purchase.purchase,
production.work.cycle, company.employee, nline.quote, sale.sale, and
`UI.screenAllowed` for the screens a menu item opens. Ribbon buttons the
user may not use are hidden. The server checks again (`_check_*`), masters
marked Private refuse changes.

## For the integrator

- Module dependencies added to `nline_js_engineering/tryton.cfg`:
  account_invoice, company, party, product, production, production_routing,
  production_work, purchase, sale, stock; extras_depend
  nline_outside_service. New `message.xml`.
- `trytond-admin -u nline_js_engineering` on the databases (new tables and
  columns: production, production_bom, production_bom_input,
  production_material_card, production_routing, production_routing_step,
  production_work).
- Data: run step `js_engineering` (after masters / workorders): operation
  templates, the Jobshop fields of the imported masters (and Leg/Detail
  flags), the 9 quote masters, the quotes (sample: Active and Ready ones,
  ~750; full: since the cutoff). Note some quotes' Specs carry N-Line's wire
  instructions printed on quotes; they are copied as they are.
- Old desk quotes (draft sale quotations made by the former Quotes screen)
  stay sales orders in quotation; the new window does not show them.
- Bump the `?v=` of `js/workorder.js` and `js/jobshop/engineering.js` in
  `index.html`.

## Suggested shared-file changes

- `frame.js` `UI.master`: return `showTab(title)` and the controls (an
  onchange of a field, e.g. fill a quote's addresses when the customer is
  chosen); let `extra` items have `visible(record, access)`; a `timedelta`
  field type; a `fields` + `render` tab (the quote lines under the header).
- `frame.js` `UI.contextMenu`: submenus (`{label, items}`) and a checked
  state; engineering.js opens a second menu for "Change Status ▸".
- `UI.fieldControl`: pass `onselect` to the many2one picker.
- `nline_jobshop`: the Quote Masters menu is sales only; production users
  may want it too (engineers build quote masters).
- `nline_desk/shopfloor.py` `master_info` / `bom_costs` are no longer used
  by the masters window (eng_tree / eng_costs replace them); keep for other
  callers.

## Second pass (28 Oct): Jobshop's own window definitions

Analysis and gap tables: `docs/jobshop/analysis/engineering.md`.

Changed:

- Work Order, Engineering Master, Quote Master, Operation Template and Quote
  tabs are placed as Jobshop draws them (`at` / `split`, frames, the "!"
  drawing button) with the ID lookup in the tab (`idAt`, `idField`).
- Work order: Work/Lot/Split ID (Function fields `work_id`, `lot_id`,
  `split_id` on the number `WORK[/LOT][.SPLIT]`), Archived, Linked,
  Description, Created from Eng Master Rev (read-only once saved), Stock U/M,
  Project/Ref/Other, code descriptions, Treat Release Date as Hard, Schedule
  Start/Finish Date, User 0/1 (Other tab), Jobshop's Browse columns; File >
  New from Engineering / Quote Master (Tools menu); Set Work Order Release
  Date when releasing from Change Status.
- Decision: Schedule Work Order now writes Schedule Start / Finish Date and
  leaves Release / Want Date to the user (Jobshop); Treat Release Date as
  Hard keeps the start at the release date.
- Decision: a new work order takes the master's header (engineered by,
  drawing, codes, specs, user fields, global rank, description).
- Decision: the ribbon's Release / Assign Stock / Start / Receive / Traveler
  stay (N-Line extras; Release duplicates Change Status > Released but is the
  shop's one-click action).
- Cards: one menu in Jobshop's order; Cut / Copy / Paste (Cut deletes the
  card when pasted: cards are saved at once), Options > Copy Subordinates,
  Order / Find Materials By Reference, Resequence Materials for Operation,
  Request Quote/Purchase this Material/Service dialog with the PO links,
  Print / Print Preview of a leg, View > Purchase Order Links, Sales Order
  Links with Jobshop's columns.
- Masters: Revision / Locked / Inactive, Work Order Special Instructions on
  the header, Other tab (User 0/1, Tryton's master name).
- Operation templates: Inactive, Jobshop's labels and Browse, Copy gives a
  new ID (`<code>-1`; it failed before).
- Quotes: the Dates and Details tabs are on the Quote tab (Jobshop has one
  tab); the lines stay on the Quote Lines tab.
- Models: production `description`, `other_info`, `archived`,
  `hard_release_date`, `schedule_start_date`, `schedule_finish_date`;
  production and BOM `user_0`, `user_1`, `stock_um`,
  `product_code_description`, `commodity_code_description`; BOM and
  operation template `inactive`; production, BOM, template, quote
  `created_by`, `modified_by`; bom input and material card `reference`.
- RPCs: `eng_header`, `eng_po_links`, `eng_resequence`; `eng_purchase`
  writes `nline.purchase.link` when nline_js_purchasing is installed.
- Migration: `work_orders()` in step js_engineering; masters' USER_0/1,
  materials' REFERENCE.
- Tests: 25 pass (scenario extended: header copy, Work/Lot/Split, hard
  release scheduling, inactive, template copy, PO links, resequence).

## Screen review fixes (2026-10-28, SCREEN_REVIEW.md)

- Quotes: Customer ID shows the customer's ID (name in the tooltip);
  Quoted Leadtime in line (split 110, Jobshop's 154 left it off the column);
  the Sold to/Ship to box (read-only, from the Sold To / Ship To tabs);
  description boxes beside Sales Rep, Discount Class, Territory, SIC Code,
  FOB Point, Ship Via, Carrier, Terms, Tax Group; "..." (and F9) on the codes
  kept as text (Sales Rep, Discount Class, Territory, SIC Code, Carrier, Tax
  Group: Jobshop's lookup window on their code tables); tabs in Jobshop's
  order (... Specs, Notes, Charges); Sales Order moved from the Quote tab to
  the Quote Lines tab; Sold To / Ship To laid out as Jobshop (State/Postal,
  E-mail captions); Browse Customer ID = the ID.
- New quote fields `addr_etc`, `contact_mobile` (and `ship_` ones),
  `copy_notes` (Notes tab: Copy Notes to Sales Order; Win Quote copies the
  notes): the window shows them once the database has them (fields_get).
- Work Order: Created from Eng Master Rev = the master's Eng ID, read-only,
  no "..."; U/M shows Jobshop's IDs (EA for u: `stock_um`); Account Set ID +
  description (read-only: the part's account set, nline_js_admin's Account
  Sets); Browse Part ID = the ID, rows one line.
- Masters: Revision clear of the Part ID's "..."; Part ID shows the part's
  ID only; Account Set ID + description (read-only); "Part ID (new master)"
  removed: a new master's part is the Part ID typed in the ID field (as
  Jobshop); Operations tab removed (the cards show it); Materials / Makes
  stay after Jobshop's tabs (editable materials and co-products lists).
  Quote master without a part: U/M EA.
- Cards: header card = header line (card, number, status) + two lines (part
  ID, Eng, quantity; description), "..." instead of cut text; card headers
  "..." before their tags (full text in the tooltip); a card's text keeps out
  of the strip the next card leaves visible (no stray letters); masters'
  header "Master Eng A" (the part ID below).
- Operation Templates: Jobshop's sub-tabs General (costs, operation
  information, drawing, special instructions placed as Jobshop), Specs,
  Add'l Resources (Other = user-defined fields, unused at N-Line: left out);
  Transit Days in the Setup Hrs place for an outside service (Service ID
  set); Routing Operation (N-Line's) beside Preserved.
- Left: Quote Lines as Jobshop's editable grid with all its columns (L: the
  lines table works per quantity; kept), Supplier Svc ID (unused at N-Line).
