# Purchasing (nline_js_purchasing) — status

Module `modules/nline_js_purchasing`, screens
`modules/nline_desk/web/js/jobshop/purchasing.js`, data
`migration/jobshop/purchasing.py` (step `js_purchasing`). Tests:
`test.ps1 nline_js_purchasing` (module tests + scenario
`tests/scenario_nline_js_purchasing.rst`, all passing).

## Checklist (EMULATION.md, Purchasing)

- [x] What are Purchasing Functions? — the six screens below, routes pushed
  on `NLINE_ROUTES` (they replace the desk's `supplier-window`,
  `purchase-orders/new|<id>` and `receiving`).
- [x] Request for Quotes
  - [x] What are Requests for Quotes?
  - [x] Request for Quote Window Field Level Descriptions — route `rfqs`
    (`rfqs/<id>`), models `nline.rfq`, `nline.rfq.line`,
    `nline.rfq.line.price`, `nline.rfq.link`.
  - [x] RFQ Maintenance
    - [x] Accessing the Request for Quotes Window
    - [x] Editing Requests for Quotes (Save, Ctrl+S)
    - [x] Deleting Requests For Quotes (Delete Document; a line: row header
      + Del marks it, removed on save). An RFQ with purchase orders cannot be
      deleted (cancel it).
    - [x] Request for Quote Tab Information
      - [x] Using the Request for Quote Tab — header fields and the RFQ line
        table on the same tab; Preview/Create PO (menu button, Active RFQs,
        buyers only).
      - [x] Using the RFQ Ship To Tab (Supplier Address… / Clear Address)
      - [x] Using the RFQ Supplier 1, 2, and 3 Tabs — supplier, quote
        received, tax group, ref no, as of / expiration; the address and
        contact appear; the supplier's line table (quoted prices); the
        supplier's RFQ instructions pop up when chosen.
      - [~] Using the RFQ Specs Tab — header specs. Currency ID / exchange
        rate not emulated (N-Line buys in USD).
      - [x] Using the RFQ Browse Tab
    - [x] RFQ Lines
      - [x] RFQ Line Field Level Information
      - [x] Entering Request for Quote Lines (part / service, description,
        U/M, mfg, exp acct; double-click the row header for the line window)
      - [x] Entering RFQ Line Supplier Information (supplier part/service ID
        and tax group per supplier; quote quantities with each supplier's
        price, disc %, fixed charge, leadtime, delivery date, extension)
      - [x] Entering RFQ Line Specs
      - [x] Understanding RFQ Line Links (work order, seq, piece, qty; the
        Jobshop link text is kept when the work order is not in the ERP)
      - [~] Lead Time / Minimum Order Qty columns of the line table: shown
        from the supplier's price when the part is picked on a PO, not as
        RFQ columns. Length / width / height / dimension U/M (piece
        tracking) not emulated: N-Line does not piece-track.
- [x] Purchase Orders — routes `purchase-orders/new` (`?supplier=<id>`
  preset) and `purchase-orders/<id>`; RPCs `js_po_get / js_po_save /
  js_po_status / js_po_delete / js_po_printed` built on the desk's
  `purchase_order_get / purchase_order_save` (so the PO limit check
  `Purchase.nline_check_limit` of nline_role runs on every save, quote and
  confirm).
  - [x] What are Purchase Orders?
  - [x] Purchase Order Window Field Level Descriptions
  - [x] Purchase Order Maintenance
    - [x] Accessing the Purchase Order Window
    - [x] Editing Purchase Orders — [~] the lines change while the order is
      Unreleased (Tryton keeps a confirmed purchase's lines); on a released
      order the header's Jobshop fields, the line overrides, specs, links
      and Closed still change.
    - [x] Deleting Purchase Orders (not after a receipt: only Unreleased,
      Firm, Hold or Cancelled orders)
    - [x] Purchase Order Tab Information
      - [x] Using the Purchase Order Tab — Order ID typed or next number,
        supplier (fills terms, buyer, FOB, ship via, tax group, freight,
        specs; shows its PO instructions), order / receive-on dates, Change
        Status (Unreleased, Hold, Firm, Released, Closed, Cancelled — only
        the statuses the order may take), the line table with Lines / Tax /
        Total.
      - [~] Using the Purchase From Tab — the supplier address chosen and
        shown (name, address, contact); not free text as in Jobshop (edit
        the supplier's address instead).
      - [x] Using the Ship To Tab (drop ship: Supplier Address… / Clear)
      - [x] Using the Details Tab (promise, printed, last received, buyer,
        FOB, ship via, tax group, terms, freight terms, payable account)
      - [x] Using the Specs Tab
      - [x] Using the Taxes Tab (each tax with its group, account, percent,
        amount)
      - [x] Using the Receivers Tab (receipts and returns; right-click
        filters the statuses; double-click opens the receiver)
      - [x] Using the Browse Tab
    - [x] Purchase Order Lines
      - [x] Purchase Line Field Level Information (supplier part/service ID,
        mfg name / part ID, qty, unit price from the supplier's prices (break
        or up-to table, as of / expires), fixed charge, trade discount %,
        received qty)
      - [x] Entering Purchase Order Lines
      - [x] Using the Overrides Tab (product code, commodity code, recv date,
        promise date, last received, tax group, expense account, line Closed)
      - [x] Using the Specs Tab
      - [~] Using the Links Tab — work order / seq / piece / service
        operation / qty links (`nline.purchase.link`), plus, read-only, the
        outside operations of the line (`production.work.purchase_line`,
        nline_outside_service) and the material cards Material Planning
        linked (`nline.js.purchase_link`). Receiving does not issue linked
        material to the work order (see below).
- [x] Suppliers — route `supplier-window` (`supplier-window/<id>`); UI.master
  on party.party, suppliers only (`is_supplier`).
  - [x] What are Suppliers?
  - [x] Supplier Window Field Level Descriptions
  - [x] Supplier Maintenance
    - [x] Accessing the Supplier Window
    - [x] Editing Suppliers
    - [x] Deleting Suppliers (Tryton refuses a party in use)
    - [x] Supplier Tab Information
      - [x] Entering Supplier Information (ID = party code, inactive, name,
        address / address 2 / city / state / postal / country / etc. = the
        first address, contact name and title, phone / fax / e-mail / web URL
        = contact mechanisms; Web URL button)
      - [x] Using the Account Tab (opened, exported + date, last order date,
        our customer ID, buyer, FOB, ship via, terms, freight terms, tax
        group, tax ID number, tax exempt, expense and payable accounts, open
        balance)
      - [x] Using the Addresses Tab (all the party's addresses with a contact
        each; the first one is the Suppliers tab's address)
      - [x] Using the Part Prices Tab (product suppliers: supplier part ID,
        mfg, type break / up-to, as of, expires, quoted, leadtime, min /
        multiple qty, quantity breaks)
      - [x] Using the Service Prices Tab (same, on the SVC-<id> services,
        with the part serviced)
      - [x] Using the Specs Tab (+ RFQ / PO instructions)
      - [x] Using the Notes Tab
      - [x] Using the Purchase Orders Tab (Released by default, right-click
        status filter, double-click opens)
      - [x] Using the Browse Tab
  - The desk's old Suppliers screen kept: Invoices (bills) tab, open
    balance; New PO button for buyers.
- [x] Services — route `services` (`services/<id>`): the outside services
  (product templates of type service, code `SVC-<id>`, category "Outside
  Services"); ID, Description, Active; the suppliers' prices of the service.
  - [x] What are Services?
  - [x] Service Window Field Level Descriptions
- [x] Tax Groups — route `purchase-tax-groups`: a tax group is a Tryton tax
  (type none) of the tax group `JS-PURCHASE` ("Jobshop Purchasing"), each
  of its taxes a child percentage tax (name, description, effective date,
  account, percent). A later tax of the same name ends the earlier one the
  day before. Applied on the lines as their taxes (line's group, else the
  order's; none for a tax-exempt supplier).
  - [x] What are Tax Groups?
  - [x] Tax Group Window Field Level Descriptions
- [x] Receiving — route `receiving` (`?purchase=<id>`, `?receipt=<id>`,
  `?return=<id>`)
  - [x] What is Receiving?
  - [x] Receiving Window Field Level Descriptions
  - [x] Receiving Maintenance
    - [x] Accessing the Receiving Window
    - [x] Entering Receivers — double-click a released order: a receiver of
      its open lines to the full quantity (nothing saved until Receive);
      partial quantities, unit price, disc %, fixed charge, location (the
      line's storage location), status Unapproved / Approved, invoice ID /
      date, due date; Receive makes a supplier shipment done, the rest stays
      on order; prints the receiver. Right-click > Receive receives an order
      to completion. Prices and fixed charges change after receipt until the
      receiver is Exported (the receipt's cost follows: Tryton recomputes
      the cost price).
    - [x] Applying Fixed Charges to Receiver Lines (Tools: equally, by
      quantity, by cost; add to / replace)
    - [x] Cancelling Receivers — Cancel Receiver gives back to the supplier
      what is left of a processed receiver and expects it again on the
      order (Jobshop: return, then re-release the order).
    - [x] Returning Parts to Suppliers — View Received Orders, double-click,
      return quantities (a supplier return shipment, done; each return line
      knows the receipt line it returns; the order stays closed).
    - [x] Receiving Tab Information
      - [x] Using the Receiving Activity Tab (Unreceived: order, desired
        recv, supplier, message late / due; Received: order, supplier, order
        date, status, last received, each receiver)
      - [x] Using the Receivers Tab
      - [x] Using the Receive From Tab
      - [x] Using the Details Tab
      - [x] Using the Specifications Tab
  - [-] Receiving a line linked to a work order does not issue it to the
    work order (Jobshop's automatic issue): the shop issues it from stock
    (Material Issues). To do with the Shopfloor / Engineering areas.
  - [-] Lot / tracking, piece tracking, alternate currency: not used by
    N-Line.
- [-] Purchasing Reports — the admin area owns the reports (EMULATION.md).
  The Print buttons use Tryton's purchase report and restocking list.

## Models and fields added

- `party.party`: `is_supplier`, `supplier_inactive`, `supplier_contact`,
  `supplier_contact_title`, `supplier_open_date`, `supplier_exported`,
  `supplier_exported_date`, `supplier_last_order_date` (function),
  `supplier_our_customer_id`, `supplier_buyer`, `supplier_fob_point`,
  `supplier_ship_via`, `supplier_tax_group`, `supplier_tax_id_number`,
  `supplier_tax_exempt`, `supplier_expense_account`,
  `supplier_freight_terms`, `supplier_specifications`,
  `supplier_rfq_instructions`, `supplier_po_instructions`; function fields
  with setters `supplier_address_1/_2/_etc`, `supplier_city/_state/
  _postal_code/_country`, `supplier_phone/_fax/_email/_web_url`. All named
  `supplier_*` (the Sales area uses `customer_*`). At module update the
  parties with purchases or product suppliers become `is_supplier`; a new
  purchase makes its party a supplier.
- `party.address`: `site_contact_name/_title/_phone/_fax/_email` (Sales uses
  `ship_to_*`).
- `purchase.product_supplier`: `mfg_name`, `mfg_part_id`, `price_type`,
  `as_of_date`, `expiration_date`, `quote_date`, `minimum_quantity`,
  `multiple_quantity`, `service_part`; out of its dates it is not matched;
  up-to tables match on `purchase.product_supplier.price` too.
- `purchase.purchase`: `jobshop_status` (function, searchable), `hold`,
  `buyer`, `fob_point`, `ship_via`, `tax_group`, `freight_terms`,
  `payable_account` (on the bills), `promise_date`, `printed_date`,
  `specifications`, `rfq`, `last_received_date`, `received_amount`,
  `ship_to_*`.
- `purchase.line`: `line_type`, `list_unit_price`, `trade_discount`,
  `fixed_charge` (the line's unit price = price less discount plus the fixed
  charge per unit, so Tryton's totals are Jobshop's extensions),
  `supplier_part_code`, `mfg_name`, `mfg_part_id`, `product_code`,
  `commodity_code`, `promise_date`, `tax_group`, `expense_account` (on the
  bill line), `line_closed`, `line_status`, `received_quantity`,
  `last_received_date`, `specifications`, `rfq_line`, `links`.
- `stock.shipment.in` / `stock.shipment.in.return`: `receiver_status`,
  `purchase`, `supplier_invoice`, `invoiced_date`, `payment_due_date`,
  `receiver_exported(_date)`, `specifications`, `receiver_user`.
- `stock.move`: `receiver_unit_price`, `receiver_discount`,
  `receiver_fixed_charge`, `returned_move`.
- New: `nline.rfq` (+ company rule, sequence "Request for Quote", 00001…),
  `nline.rfq.line`, `nline.rfq.line.price`, `nline.rfq.link`,
  `nline.purchase.link`; read for everyone, write for
  `purchase.group_purchase` and `res.group_admin`.
- `account.tax.group` `JS-PURCHASE` (data, noupdate).

## Data (migration/jobshop/purchasing.py)

- Services: all 34 `PURCHASING_SERVICE` rows through `m.service()` (code
  SVC-<id>), description and inactive kept up to date.
- Tax groups: `PURCHASING_TAX_GROUP` / `PURCHASING_TAX` (none in N-Line's
  Jobshop today) through `js_tax_group_save`, matched by ID.
- Supplier fields: the suppliers already imported (sample) or the active
  ones / ordered since the cutoff (full); alternate addresses
  (`PURCHASING_SUPPLIER_ADDRESS`), notes (ir.note).
- Supplier part prices (`PURCHASING_SUPPLIER_PART`, 10 rows) and service
  prices (`PURCHASING_SUPPLIER_SERVICE`, none): matched by supplier + part +
  supplier part ID (the codeless preferred supplier the parts step made is
  completed).
- RFQs: sample — Active / Unreleased RFQs of the last year (9); full — RFQs
  since the cutoff and every open one; matched by RFQ ID; lines, quoted
  quantities and prices, links (work order by number, Jobshop text kept).
- The purchase orders already imported (number = Jobshop PO ID): buyer, FOB,
  ship via, freight, promise / receive-on date, specs, ship to, hold, tax
  group, RFQ; lines: quoted price, disc, fixed charge, supplier's ids, mfg,
  product / commodity codes, promise date, specs, closed, RFQ line, links.

## Decisions

- Receivers are Tryton supplier shipments: a receiver is saved only when
  Receive is clicked (no draft receivers), so "Cancelled" on a new receiver
  is simply Clear; on a processed one it is Cancel Receiver.
- Firm = quotation (no stock moves yet): only Released orders appear in
  Receiving, as Jobshop's Entering Receivers says.
- Closed by hand: the open moves are cancelled and ignored (Tryton's
  shipment exception handling), the order becomes Closed.
- Fixed charges and discounts are folded into the unit price Tryton keeps
  (4 decimals), the quoted price stays on the line.

## For the integrator

- New Tryton dependencies of nline_js_purchasing: account, account_invoice,
  company, party, product, production, production_work, purchase, stock
  (all already installed through nline_desk). Update the module
  (`trytond-admin -u nline_js_purchasing`) on nline_test.
- Run step `js_purchasing` after `parties`, `parts`, `purchases`,
  `workorders` and `js_common` (FOB / ship via / product / commodity codes
  are looked up by code, so import them first).
- Suggestions for shared files:
  - app.js: the built-in routes `^#\/purchase-orders\/new$` and
    `^#\/receiving$` do not match a query (`?…`); the desk's own Clear
    (`purchase-orders/new?<time>`) showed "Page not found". The Jobshop
    routes here accept a query.
  - nline_jobshop gen_menus: the Suppliers, Purchase Orders and Receiving
    items still use the desk's actions (`desk:supplier_window`, …) whose
    routes these screens now take over — nothing to change, but the
    "Purchase Order Entry" name could become "Purchase Orders".
  - Two link models exist for purchase lines and work orders:
    `nline.purchase.link` (this area: work order / seq / piece / operation,
    also for RFQ-made and imported POs) and `nline.js.purchase_link`
    (Planning: material card). The PO window shows both; one model would be
    better (planning could write `nline.purchase.link` with its card's
    production / operation / piece).
  - Issuing linked receipts to the work order (Jobshop) needs the Shopfloor
    area's issue service; Receiving could call it after Receive.

## Second pass: Jobshop's own layouts (28 Oct 2026)

Analysis and gap tables: `docs/jobshop/analysis/purchasing.md` (66 gaps,
46 closed). What changed:

- Placed layouts (frame.js `at` / `split` / `frames`, `UI.placedForm` in
  this file's `fieldsPane`): Suppliers / General / Other / Special
  Instructions tabs, the PO header + Details frame (under the lines), the
  Order Line window, the RFQ header and Supplier tabs, the Receiver frame +
  Details, the Receiver Line window, the Tax Group tab. Supplier ID is the
  tab's first field (`idAt`, `idField`, `idLength`).
- Descriptions beside codes (`describe()`: the full name of the picker
  without its ID); Created by / Last Modified by (`stamp()`).
- Ribbon `Tools ▾` / `View ▾` menus (docWindow `menus`), right-click popups
  with real submenus and checked statuses: Supplier PO / RFQ tabs, PO
  Receivers, Receiving Activity, Receiver Lines, RFQ supplier lines.
- New windows: Purchase Order Lines, Work Order Links, RFQ Lines, Receiver
  Lines, Receiver Line (Edit Details), Supplier Prices of a service.
- PO line grid in Jobshop's columns (Part ID and Service ID apart, Line
  Status Open/Closed); Notes tabs on PO, RFQ, receivers; Receiving Browse;
  horizon date; Close Short; Services is one grid; Tax Group Inactive.
- Fields: `party.supplier_mobile`, `supplier_user_0..2`;
  `purchase.purchase.user_0..2`; `purchase.line.drawing`,
  `drawing_revision`, `user_0`, `user_1`; `nline.rfq.line.user_0/1`.
  RPC `js_rfq_update_pricing`. Migration imports them (CONTACT_MOBILE,
  USER_*, DRAWING_ID/REV).
- Decisions: user field labels from Jobshop's purchasing settings
  (N-LINE FIELD, NOTES:, AUDIT DATE:); the line user fields hold the part's
  drawing file and revision, labelled as the part's (Eng Parts List, Part
  Number Rev). RFQ lines keep one Part/Service picker. Receiver header user
  fields not emulated (copies of the PO's, last used 2009).

## Third pass: screen review fixes (28 Oct 2026)

Details in `analysis/purchasing.md` "Screen review fixes".

- New fields (module update needed): `purchase.purchase.purchase_from_name,
  _address_1, _address_2, _city, _state, _postal_code, _country, _etc,
  _contact, _title, _phone, _fax, _email, _mobile` (Jobshop's Purchase From
  tab, the order's own copy); `ship_to_mobile`, `ship_to_supplier` (char),
  `ship_to_address_no` (integer) on purchase.purchase and nline.rfq
  (ShipToMixin). `js_po_get` sends `purchase_from` (the order's copy, else
  the supplier's address) and `purchase_from_default`; `_js_address` sends
  `mobile`; `js_receiving_activity` (unreceived) sends `order_date`,
  `status`, `last_received_date` and finds Desired Recv on the lines.
  `js_rfq_save` keeps ship-to fields the screen does not send.
- Migration: PURCHASE_ORDER NAME / ADDR_1 / … / CONTACT_MOBILE into
  `purchase_from_*`, SHIPTO_CONTACT_MOBILE, SHIPTO_ADDR_NO; the desired
  receive date of released orders (order `delivery_date`, line
  `delivery_date_store`) — before only draft orders had it, so the
  Receiving Activity's Desired Recv was blank. Re-run `js_purchasing`.
- Screens: see the table. Until the module update, the JS works with the
  old server (Purchase From falls back to the supplier's address; the
  new fields are ignored on save; Desired Recv / the order grid's dates
  stay blank).
- Decision: Purchase From is now editable per order (Jobshop), filled
  from the supplier when it is chosen; the Name's "…" picks another
  address of the supplier (also sets the order's invoice address while
  unreleased).
- Not done: Part Prices header + Quantities grid (L), Copy Notes to
  Receiver, SIC / currency (unused), receiver and RFQ Other tabs (unused).
- The purchase order report still prints the supplier's address, not the
  order's Purchase From copy (reports are shared; suggest the integrator
  uses `purchase_from_*` when set).

