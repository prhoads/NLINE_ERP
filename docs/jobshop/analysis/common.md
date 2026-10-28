# Jobshop analysis: Common (nline_js_common)

Sources: `C:\NLINE_ERP_dev\jobshop_analysis\layouts\VShared\*.txt`,
`Vmfg\AddPostalCode|AddStateProvince|Preferences|chgPassword|FindAndReplace|QuickAddLines.txt`,
`VInventory\ReasonCode.txt`, `VBrowse\Browse|Filters|Export.txt`,
`jobshop_menus.txt` / `vjs_menus_raw.txt` (status bar texts), `userguide.txt`
ch. 2 (The Jobshop Window: tables, sorting, columns, preferences,
advanced filtering, Add On the Fly), ch. 46-49, Appendix A (shortcuts),
`Domains.schema` (enumerations), the help topics, and N-Line's Jobshop data
(`SHARED_*` tables, read-only). `erp_screens.txt` did not exist when this
was written: the "ERP now" side is read from the code.

Decisions taken here (the owner's rule: emulate first):
- The Common windows stay Jobshop table windows (one grid, edit in place,
  Save): that is what the layouts are (one `GRID ... add delete` per window,
  no placed fields), so `UI.placedForm` / `idAt` do not apply to them.
- Jobshop's own captions win: window titles from `MESSAGE_ProgramTitle`
  (FOB Points, Status Reason Codes, User Alerts / User Messages), column
  titles (Inactive, Type, Postal Code, What / When / How / From / To),
  enumeration texts from `Domains.schema` ("Age in days", "End of this month").
- Inactive rows are listed (Jobshop lists them with Inactive checked); "Show
  inactive" stays as an ERP extra, checked by default.
- Search (Find box, Filter by): Jobshop's rule, the text begins the value,
  `*` any text, `?` one character.
- Grid layouts, browse filters and program preferences are kept per
  computer (browser storage), as Jobshop kept them in its .ini / per PC.
- The one-line help under each title and the Find box are ERP extras, kept.

## Data at N-Line (SHARED_*)

| Table | Rows | Note |
|---|---|---|
| FOB_POINT | 38 | 18 inactive |
| SHIP_VIA | 39 | 2 inactive |
| PRODUCT_CODE / COMMODITY_CODE | 24 / 75 | MARKUP_PERCENT never used (0 everywhere) |
| REASON_CODE | 20 | REASON_TYPE always INVENTORY (Labor / Calendar / Employee unused) |
| TERMS_RULE | 38 | all AGE / AGE, no discount %, NET_DAYS empty (days come from the ID) |
| CURRENCY_CODE | 0 | unused at N-Line |
| STATE_PROVINCE / POSTAL_CODE | 111 / 600 | many states are cities or typos |
| USER_ALERT / USER_MESSAGE | 0 / 19 | messages from 2016; alerts unused |

## 1. Free On Board Points (`VShared\FOBPoint.txt`)

Jobshop: title "FOB Points"; one grid `GRID_FOB` add/delete: ID (w118) |
Description (w227) | Inactive (check). Menus: File Save (Ctrl+S) / Refresh
(F5) / Print / Print Preview; Edit Delete (Del), Add Row / Delete Row (Edit
Row popup). Row header: `*` new row, `+` new with data, check mark changed,
red X marked for deletion. Header click sorts A-Z, Shift+click Z-A; columns
sized / moved, Browse > Save widths and positions. Closing with unsaved
rows asks to save.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | title FOB Points | Free On Board Points | common.js CODES.fobPoints | S | done |
| 2 | different | Inactive check | Active check (inverted) | codeTable `invert` column | S | done |
| 3 | different | inactive rows listed | hidden unless Show inactive | Show inactive checked by default | S | done |
| 4 | different | `+` on a new row with data | ✔ | codeTable mark() | S | done |
| 5 | different | popup Add Row / Delete Row | Insert Row (Ins) / Delete Row (Del) | codeTable menu() | S | done |
| 6 | missing | header click sort, Shift+click | none | gridTools | M | done |
| 7 | missing | column size / move, Save widths and positions | none | gridTools (kept per computer) | M | done |
| 8 | missing | Freeze/UnFreeze Columns, Export to Excel, Filter Including / Excluding / by, Remove Filters/Sort, Browse Filter (Ctrl+B) | none | gridTools in the grid's right-click | M | done |
| 9 | missing | unsaved rows: ask before closing | nothing | needs the Tryton tab close (frame); codeTable registers `window.NLINE_DIRTY` | M | shared: needs app.js |
| 10 | extra | — | help line, Find box | kept | — | kept |

## 2. Shipping Methods (`VShared\ShipVia.txt`)

Same grid: ID | Description | Inactive. Gaps 2-10 of FOB Points apply and
are done the same way (codeTable). Title already "Shipping Methods".

## 3. States/Provinces (`VShared\StateProvince.txt`, `Vmfg\AddStateProvince.txt`)

Jobshop: ID (w127) | Name (w289). Add State/Province dialog (on the fly):
"State or Province doesn't exist. Add now?" ID (len10), Name (len50), Yes /
No.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | extra | — | Country column + Country filter, Active | Tryton's subdivisions need the country; kept | — | kept |
| 2 | different | ID "TX" | ISO "US-TX" | decision (status file) | — | kept |
| 3 | missing | Add State/Province dialog | none | `JobshopCommon.addStateProvince({code, name, country})` (ID TX becomes US-TX) | M | done (callers: sales/purchasing address forms) |
| 4 | different | Inactive | Active | codeTable | S | done |
| 5 | grid tools | as FOB Points 4-9 | | codeTable | | done |

## 4. Postal Codes (`VShared\PostalCode.txt`, `Vmfg\AddPostalCode.txt`)

Jobshop: Postal Code (w107) | City (w195) | State (lookup, w54) | Country
(free text, w197); `ERROR_TooShort` "Postal Codes must contain at least 5
characters". Add Postal Code? dialog: "Postal Code Not Found. Add Now?",
City (len15), State (lookup), Postal Code (len10), Country (len15), Yes /
No; when the state is unknown, Add State/Province follows. Known code:
address city and state fill in (Tryton's address already does).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | column "Postal Code" | "ID" | label | S | done |
| 2 | missing | at least 5 characters | none | codeTable `validate` | S | done |
| 3 | different | Country free text | Country many2one + filter | kept (Tryton) | — | kept |
| 4 | missing | Add Postal Code? on the fly (Preferences > Add On the Fly) | none | `JobshopCommon.checkPostalCode({postal_code, country})` | M | done (callers: address forms, see integrator) |
| 5 | grid tools | as FOB Points 4-9 | | codeTable | | done |

## 5. Terms (`VShared\TermsRules.txt`; route `terms`)

Jobshop: ID (w80) | Invoice Age Type (list) | Invoice Aging Days | Discount
Age Type (list) | Disc Aging Days | Discount % | Terms Description |
Inactive. Age types (`terms_type`): Age in days, Day of next month, Collect
on delivery, End of this month (that order). Rules (guide ch. 47): COD
needs 0 days; Day of next month / End of month take a day of the month.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | type texts and order | "Age in Days", "Collect on Delivery" first, "End of Month" | common.js AGE_TYPES, terms.py AGE_TYPES | S | done |
| 2 | missing | COD = 0 days; day of month 1-31 | none | `termsValidate` | S | done |
| 3 | different | Inactive | Active | codeTable | S | done |
| 4 | extra | — | right-click Due dates… (split terms) | kept (the old screen's function) | — | kept |
| 5 | grid tools | as FOB Points 4-9 | | | | done |

## 6. Product Codes / 7. Commodity Codes (`ProductCode.txt`, `CommodityCode.txt`)

ID (w110) | Description (w272) | Markup % (w75) | Inactive. Matches; Active
became Inactive; grid tools as FOB Points. Markup % unused at N-Line.

## 8. Reason Codes (`VShared\ReasonCode.txt`, `VInventory\ReasonCode.txt`)

Jobshop: title "Status Reason Codes"; ID (w93) | Reason (w333) | Type (list:
Inventory Adjustment, Labor Entry, Calendar Exception, Employee Absence) |
Inactive. The Inventory window's own: ID | Reason only.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | title Status Reason Codes | Reason Codes | CODES.reasonCodes | S | done |
| 2 | different | column "Type" | "Reason Type" | label | S | done |
| 3 | missing | VInventory window (ID, Reason; inventory reasons) | none | route `reason-codes/inventory` | S | done (inventory area may link it) |
| 4 | different | Inactive | Active | codeTable | S | done |

## 9. Alert Messages (File > Alert Messages: `UserMessages.txt`, `UserAlerts.txt`)

User Messages: Show All (check); grid (delete only): Archived (check, the
user ticks it) | Created On | Message. Popup `[User Messages]`: Show
Details…, Open Customer / Quote / Sales Order / Shipper / Invoice /
Supplier / RFQ / Purchase Order / Receiver / Work Order…, Delete.
User Alerts (title "User Alerts", tab "Alerts"): What (alert type) | When
(alert change) | How (Manual / Email) | From | To | Subject.

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | columns Archived / Created On / Message | select box, Date, Alert Type, Alert Change, Subject, Message, Document | Archived check (saves at once), Created On, Message; Document link kept as extra; type / change / subject in the row tooltip and Show Details | S | done |
| 2 | different | "Show All" | "Show archived" | label | S | done |
| 3 | missing | Show Details… | none | dialog | S | done (action / recipient: new keys of `common_alerts`) |
| 4 | missing | Delete | none | right-click Delete (own messages: the rule) | S | done |
| 5 | extra | — | Mark Read / Mark Unread buttons | replaced by the Archived check; kept in the right-click | — | done |
| 6 | different | tab "Alerts", columns What / When / How / From / To / Subject | "My Alerts", Alert Type / Change / Action / Recipient / Subject | labels; From = the alert's user (read-only) | S | done |
| 7 | extra | — | "Raised by the ERP" column | kept (tells which alerts work) | — | kept |
| 8 | missing | the other 38 alert changes raise nothing | — | the areas' events (status changes, costs...) | L | left: needs each area's hooks |
| 9 | missing | Email action sends mail | kept only | needs an SMTP setup | M | left: no mail server configured |

## 10. Currency Codes (`VShared\CurrencyCode.txt`)

ID | Name | Currency Symbol | Thousands Separator | Decimal Separator |
Exchange Rate | Inactive: matches (Active became Inactive). Unused at N-Line.

## 11. User Control Panel (`Vmfg\Controlpanel`) and File > Preferences (`Vmfg\Preferences.txt`)

Jobshop's Control Panel: an icon view (Change Password, Printer Setup; its
popup View Large/Small Icons / List / Details, Arrange Icons by Name /
Description, Auto Arrange, Line up Icons). Change Password: Old / New /
Confirm Password. Preferences (File > Preferences): General (Save Settings
on Exit, Save Current Group on Exit, Show Home Page at Startup, Show
Navigator Menu Icons, Show Tips at Startup, Add On the Fly, Show User Alert
Messages at Startup, Check for User Alert Messages + Interval in Minutes,
Load 'Available to Promise' in Sales Orders, Load 'Projected Available' in
Supply and Demand; Browse: Auto Browse, Minimum Characters Before Auto
Browse, Auto Refresh Browse After Save or Delete, Maximum Browse Records to
Load (0 = all), Show Max Browse Records Warning; Confirmation: Confirm Exit,
Confirm Forms Printed Successfully, Confirm Exit of Scheduling; File
Paths), Toolbar (Show Tool Tips, Show Shortcuts in Tool Tips, Show Tool
Description in Status Bar, Resize Navigation Bar + Growth %), Card Colors
(Material, Tool/Fixture, Phantom, Operation, Outside Service; Reset
Defaults), Shipping (Ask to Print / Preview Pack List, Preview, Print),
Receiving (same for the Receiver).

| # | Gap | Jobshop | ERP before | Fix | Size | Status |
|---|---|---|---|---|---|---|
| 1 | different | Change Password dialog | N-Line BI's page | decision: no password in the ERP | — | kept |
| 2 | different | icon view | panels | kept (two functions, no icons to arrange) | — | kept |
| 3 | missing | File > Preferences window | none | route `preferences` (Program Preferences: General, Toolbar, Card Colors, Shipping, Receiving), Control Panel button | M | done |
| 4 | omitted | Save Settings / Current Group on Exit, Navigator Menu Icons, Tips, File Paths, status bar, navigation bar sizing | — | no browser meaning | — | `[-]` |
| 5 | wiring | each preference used by its screen | — | `JobshopCommon.preferences()`; used now: Add On the Fly (on-the-fly dialogs), Maximum Browse Records + warning (code tables), alert checks (`watchAlerts`) | M | partly: the rest in "For the integrator" |

## 12. Frame (all windows)

What frame.js gives today (`UI.form`, `UI.master`, `pictureTab`,
`contextMenu`): a ribbon of buttons (no menu bar), Alt+S / Alt+N / Alt+R /
Ctrl+F; `UI.master`: ID lookup, tabs, Browse tab (search box `%text%`, 300
rows, double-click opens), Save / Clear / Copy / Delete / Print; the
record navigation only with `options.nav` (off: the owner's rule — First /
Previous / Next / Last are NOT to be added, nor their Ctrl+F/L/N/E keys);
Picture tab: list of image attachments and "Add picture"; `contextMenu`
flat items (no submenus, no check marks, no shortcut column).

| # | Jobshop (menus, shortcut) | ERP now | Proposed change (file, function) | Size |
|---|---|---|---|---|
| F1 | File: Save Ctrl+S, Refresh F5, Print Ctrl+P, Print Preview, Printer Setup | Alt+S Save & Close; no Ctrl+S / F5 / Ctrl+P in UI.form | frame.js `form()` keydown: Ctrl+S = `save(false)` without closing (Jobshop's Save stays on the record); F5 = `options.onRefresh` (UI.master: `load(record.id)` / `browseLoad()`); Ctrl+P = the Print extra button's onclick when shown | S |
| F2 | File > Alert Messages…, Preferences… | not in the frame | app.js: menu/shortcut entries opening `alert-messages` and `preferences` (both routes exist in common.js); `JobshopCommon.watchAlerts()` once at start-up in the top desk window | S |
| F3 | Edit: Delete (Del), Clear, Copy / Delete Document | Delete / Clear / Copy buttons | frame.js `master()`: Del key (focus not in a field) = `remove()` when shown | S |
| F4 | Edit > Picture: Insert Picture, Clear Picture, Stretch to Fit (also the Picture tab's right-click) | "Add picture" adds one more image; no Clear, no Stretch | frame.js `pictureTab()`: call `JobshopCommon.pictureTools(list, {model, id, writes, reload: load})` after building `list` (prototype in common.js: Insert replaces the picture, Clear removes it, Stretch to Fit kept per computer) and drop the "Add picture" input, or keep it as the Insert button | S |
| F5 | Browse tab right-click (`PopupBrowseFilter`): Filter Including, Filter Excluding, Filter by, Remove Filters/Sort, Save widths and positions, Sort Ascending, Sort Descending, Export to Excel…; Browse menu: Refresh Browse (Shift+F5), Browse Filter… (Ctrl+B), Freeze/UnFreeze Columns | none (search box only) | frame.js `master()` after building the Browse table: `var tools = JobshopCommon.gridTools({table: browseTable, key: options.model, title: options.title, columns: options.browse});` call `tools.apply()` at the end of `browseLoad()`'s render; `table.addEventListener('contextmenu', e => UI.contextMenu(e, [{label: 'Refresh Browse', onclick: browseLoad}, '-'].concat(tools.menuItems(e.target.closest('tr'), tools.columnAt(e)))))`; keydown Ctrl+B = `tools.filterDialog()`, Shift+F5 = `browseLoad()`. gridTools filters the loaded rows; for a server-side filter pass `JobshopCommon.filterDomain(tools.state().filters, col => options.browse[col].name)` into `browseLoad()`'s domain | M |
| F6 | Browse search: "A" = begins with A, `*A` contains, `?` one character | `%text%` (contains) | frame.js `browse()` (lookup) and `browseLoad()`: `text = /[*?]/.test(t) ? t : t + '*'`, then `*`→`%`, `?`→`_` (as codeTable's `domain()`) | S |
| F7 | Maximum Browse Records to Load (Preferences, 0 = all) + warning; Auto Refresh Browse After Save or Delete | fixed 300; refreshed after save only when loaded | `browseLoad()`: `limit: JobshopCommon.preferences().browseMaxRows || null`, toast when reached and `browseMaxRowsWarning`; after `remove()` too when `autoRefreshBrowse` | S |
| F8 | Auto Browse (Browse menu toggle; Preferences: on at start, minimum characters) | picker searches as you type | ui.js `picker()`: honour `minChars = preferences().autoBrowseMinChars` before searching | S |
| F9 | Closing a window with unsaved changes asks to save | Tryton closes the tab | app.js / the Tryton tab bridge: before closing a desk tab ask `window.NLINE_DIRTY.some(f => f())` (codeTable registers its check there) and confirm | M |
| F10 | Menu items show their shortcut; submenus (Picture >) | flat `contextMenu` items | done by the integrator (`{label, items}` submenus, `{checked}`, `{disabled}`); left: a right-aligned shortcut column (`item.shortcut`) | S |
| F11 | Window: Cascade / Tile / Arrange / Next / Previous / Close / Close All; View: Small / Large Icons, Navigator bar, Favorites; Help: Contents (F2), About | Tryton's own tabs, menu, favourites | `[-]` Tryton's client does these; nothing to add | — |
| F12 | Browse: First / Previous / Next / Last (Ctrl+F / L / N / E) | off (`options.nav`) | keep off (owner) | — |
| F13 | Find and Replace (Vmfg\FindAndReplace: Text to Search, Find What, Replace With; Find, Find Next, Replace, Replace All, OK, Cancel; Match Case, Whole Word Only) in the Specifications | none | prototype `JobshopCommon.findReplace(textarea)`: engineering / sales / purchasing add it to their Specs tab's right-click ("Find and Replace…"); `Show this Dialog` / `Update options` belong to the engineering bulk update and are left out | S |
| F14 | Quick Add Lines (Vmfg\QuickAddLines; Tools > Quick Add Lines… of Quotes and Sales Orders): top grid Line No (ro), Desired Ship Date, Part ID, Description, Quantity, <Selling UM>, Unit Price, Trade Discount %, Extension (ro), In Proforma; Parts List grid Part ID, Description, Stock UM, Selling UM, Unit Price, Fab'd, Pur'd, Product Code, Commodity Code (searchable, filterable); Add Selected Rows | none | sales.js (and engineering.js for quotes): a modal with the two grids; the Parts List can be a `JobshopCommon.codeTable`-like read-only grid with `gridTools` for the filtering; "Add Selected Rows" appends lines to the order's lines grid | L |
| F15 | Ctrl+B Browse Filter dialog layout (VBrowse\Filters: Columns Visible / Column Description / Title + Clear; Filters Column Description / Condition / Value / And-Or + Delete; Sorting Available / Selected + Add / Remove / Up / Down) and Export (VBrowse\Export: First Row Contains Column Headers, Available / Selected Columns, Add / Remove / Up / Down) | none | in `gridTools.filterDialog()` / `exportDialog()` (common.js) — reuse with F5 | done in common.js |

## For the integrator

- Module update for nline_js_common (field labels only: `account.invoice.
  payment_term` age type texts; `nline.alert_message.alert_action_string`;
  `common_alerts` returns `action`, `action_string`, `recipient`). No new
  model, no new field in the database.
- Menus (`nline_jobshop`): File > Preferences… → `desk/index.html#/preferences`
  (everyone); the Inventory group may link `#/reason-codes/inventory`.
- Frame: F1-F10 above (frame.js `form`, `master`, `browse`, `pictureTab`;
  ui.js `picker`, `contextMenu`; app.js start-up and tab close).
- Address forms (sales customers, purchasing suppliers, admin company): on
  the postal code's change call `JobshopCommon.checkPostalCode({postal_code,
  country})` and fill city / subdivision / country from the result.
- Preferences consumers: engineering cards `cardMaterial`, `cardToolFixture`,
  `cardPhantom`, `cardOperation`, `cardService` (CSS of `.node.card.*`);
  sales `loadAvailToPromise`, `askPrintPackList` / `previewPackList` /
  `printPackList`; purchasing `askPrintReceiver` / `previewReceiver` /
  `printReceiver`; inventory `loadProjectedAvailable`; planning
  `confirmSchedulingExit`; admin reports `confirmPrint`; frame `autoBrowse`,
  `autoBrowseMinChars`, `autoRefreshBrowse`, `browseMaxRows`,
  `browseMaxRowsWarning`, `showTooltips`, `showShortcuts`, `confirmExit`,
  `showHomeAtStartup`.

## Gap count

Found 52 (windows 1-11: 37, frame F1-F15: 15). Closed 40 (all the windows'
S/M gaps, F13 and F15 as prototypes). Left 12: alert changes without events
(L), email sending, unsaved-close prompt and frame F1-F12 items that need
shared files (listed above), Quick Add Lines (sales, L).

## Test results

Unit tests: `test.ps1 nline_js_common` — 25 tests OK (scenario extended:
`common_alerts` action / action_string / recipient, a user deleting their
own message). `jscheck.py common.js` OK.

Click-through (local server, copy of common.js in the web root):

- `run_battery.py` on the 13 Common routes did not complete: the runs
  crashed in the harness, not in a screen (`WinError 10053/10054` — Chrome's
  connection closed — and `Inspected target navigated or closed`, at random
  points while other batteries ran on the shared server). What did run
  showed no error dialog, no console exception; Save gives "Nothing to
  save", Print opens `js-reports/common/<report>`, the lookups open their
  dialogs. Findings from these runs, fixed:
  - the grid's "close with unsaved changes" `beforeunload` blocked the
    harness's navigation (a page dialog) after Delete marked a row: removed;
    the check is offered to the frame as `window.NLINE_DIRTY` (F9);
  - the empty "No unread messages." row of Messages was filterable: pinned;
  - "1 rows" -> "1 row";
  - Freeze and Stretch to Fit use the frame's new `{checked}` items.
  Harness notes for the integrator: buttons hidden until `get_access`
  answers (Save / Delete / Print) are recorded "missing" when the harness
  enumerates before the answer; the row-header buttons of a code table (one
  per row: "Select") make ~40 actions per table; `UI.openScreen` from a
  ribbon button is recorded as "nothing" in some runs although stubbed.
- A targeted check of my own (same CDP harness, `mytest.py` in my
  scratchpad) on fob-points, ship-vias, states, postal-codes, terms,
  product-codes, commodity-codes, reason-codes, reason-codes/inventory,
  currency-codes, alert-messages: every grid loads with Jobshop's columns
  (Inactive last), Shift+click on a header sorts Z-A (▼), the right-click
  has Add Row / Delete Row / (window items) / Save / Refresh / Print /
  Filter Including / Filter Excluding / Filter by… / Remove Filters/Sort /
  Sort Ascending / Descending / Browse Filter… / Save widths and positions /
  Freeze/UnFreeze Columns / Export to Excel…; Filter Including leaves "1 of
  N rows" (plus the new row), Remove Filters/Sort restores N, Freeze pins
  the columns up to the clicked one, the Browse Filter dialog shows Columns
  / Filters / Sorting, the Export dialog "Select Columns to Export for
  <title>"; no page error, no console error.
- Screenshots checked: Preferences (placed as Vmfg\Preferences: General
  with the Browse and Confirmation boxes, Toolbar, Card Colors, Shipping,
  Receiving), User Control Panel, Alert Messages > Alerts (What, When, How,
  From, To, Subject), FOB Points with its right-click.
- Not live locally until the module update: the Show Details "How" / "To"
  lines (new `common_alerts` keys) and the age type texts.
- Test data: the local states list has 2 US subdivisions only (countries'
  subdivisions not imported in nline_test).
