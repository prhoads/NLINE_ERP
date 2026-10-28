# Jobshop emulation status: Common (nline_js_common)

Module `modules/nline_js_common`, screens `nline_desk/web/js/jobshop/common.js`,
data `migration/jobshop/common.py`. Tests: `test.ps1 nline_js_common` (25 tests,
scenario `tests/scenario_nline_js_common.rst`: code tables, table save, terms,
currencies, postal codes, alerts and the rights on them, preferences, the
migration on Jobshop-like rows, run twice). JS: `jscheck.py` OK.

## Checklist

- [x] What are Common Functions? (`What_are_Common_Functions.txt`)
- [x] What are Free On Board Points?
  - [x] What are Free On Board Points? (`What_are_Free_On_Board_Points_.txt`)
  - [x] FOB Point Window Field Level Descriptions (`VSharedFOBPoint.txt`) — route `fob-points`, ID, Description (+ Active)
- [x] What are Shipping Methods?
  - [x] What are Shipping Methods? (`What_are_Shipping_Methods_.txt`)
  - [x] Ship Via Window Field Level Descriptions (`VSharedShipVia.txt`) — route `ship-vias`
- [x] What are States/Provinces?
  - [x] What are States/Provinces? (`What_are_States_Provinces_.txt`)
  - [x] State Province Window Field Level Descriptions (`VSharedStateProvince.txt`) — route `states`, Tryton `country.subdivision` (ID = ISO code `US-TX`, Name, Country), filtered by country (the US first)
- [x] What are Postal Codes?
  - [x] What are Postal Codes? (`What_are_Postal_Codes_.txt`) — "on the fly" fill of city/state: Tryton's address already completes the city and subdivision from `country.postal_code`
  - [x] Postal Codes Window Field Level Descriptions (`VSharedPostalCode.txt`) — route `postal-codes`, Tryton `country.postal_code` (ID, City, State, Country)
- [x] What are Terms?
  - [x] What are Terms? (`What_are_Terms_.txt`)
  - [x] Terms Window Field Level Descriptions (`VSharedTermsRules.txt`) — route `terms` (takes over `Screens.terms` of company.js): ID, Invoice Age Type, Invoice Aging Days, Discount Age Type, Disc Aging Days, Discount %, Terms Description (+ Active); right-click > Due dates… keeps the old screen's function (the Tryton form of the lines)
  - [x] Terms Maintenance
    - [x] Editing Terms (`Editing_Terms.txt`) — edit in the grid, check mark in the row header, Save
    - [x] Deleting Terms (`Deleting_Terms.txt`) — Del marks the row (red X), Save deletes
- [x] What are Product Codes?
  - [x] What are Product Codes? (`What_are_Product_Codes_.txt`)
  - [x] Product Code Window Field Level Descriptions (`VSharedProductCode.txt`) — route `product-codes` (+ Markup % of the schema)
- [x] What are Commodity Codes?
  - [x] What are Commodity Codes? (`What_are_Commodity_Codes_.txt`)
  - [x] Commodity Code Window Field Level Descriptions (`VSharedCommodityCode.txt`) — route `commodity-codes` (+ Markup %)
- [x] What are Status Reason Codes?
  - [x] What are Status Reason Codes? (`What_are_Status_Reason_Codes_.txt`)
  - [x] Reason Code Window Field Level Descriptions (`VSharedReasonCode.txt`) — route `reason-codes`: ID, Reason (+ Reason Type of the schema)
- [~] What are Currency Codes?
  - [x] What are Currency Codes? (`What_are_Currency_Codes_.txt`)
  - [x] Currency Codes Window Field Level Descriptions (`VSharedCurrencyCode.txt`) — route `currency-codes`, Tryton `currency.currency`: ID, Name, Currency Symbol, Thousands Separator, Decimal Separator, Exchange Rate (+ Active); right-click > Rate history…
  - [~] Currency Code Maintenance
    - [x] Entering Currency Codes (`Entering_Currency_Codes.txt`) — Tools > Import from QuickBooks `[-]`: QuickBooks Canada only, N-Line's QuickBooks is US
    - [~] Specifying Currency Codes (`Specifying_Currency_Codes.txt`) — the Alternate Currency ID of customers/suppliers is the sales/purchasing areas' (Tryton has the party's currency per document)
    - [~] Using Alternate Currencies (`Using_Alternate_Currencies.txt`) — Tryton's documents carry their currency and convert at the rate; the forms' number format with the separators is for the report owners (admin)
- [x] What is the Jobshop Control Panel?
  - [x] What is the Jobshop Control Panel? (`What_is_the_Jobshop_Control_Panel_.txt`) — route `control-panel`
  - [x] Changing Your User Password (`Changing_Your_User_Password.txt`) — explained and linked to N-Line BI's change password page (`/server/login?change=1&next=…`, shown when the desk runs behind N-Line BI); the ERP stores and sets no password
  - [-] Change Password Dialog Field Level Descriptions (`VmfgChgPassword.txt`) — no Old/New/Confirm fields on purpose: passwords belong to N-Line BI sign-on
  - [~] Setting Up Your Printer (`Setting_Up_Your_Printer.txt`) — explained: reports open as PDF and print through the browser's dialog (Print Setup… opens it); no printer setting in the ERP
- [~] Common Reports
  - [~] Common Reports (`Common_Reports.txt`) — the reports are nline_js_admin's; each Common window has Print, which opens `js-reports/common` (or `js-reports/common/<report id>` when such a route exists)

Not in the help's Common section, asked for in the brief:

- [~] Alert Messages (File > Alert Messages; Jobshop's `SHARED_USER_ALERT` / `SHARED_USER_MESSAGE`; the help has no topic) — route `alert-messages`:
  - Messages tab: the user's unread messages (Show archived for all), Mark Read / Mark Unread, Refresh, double-click or the link opens the document; right-click menu
  - My Alerts tab: the user's alerts (Alert Type, Alert Change, Alert Action, Recipient, Subject; every Jobshop type and change); an administrator chooses the user
  - The ERP raises "Item is Late" for sales orders (shipping date passed, not sent), purchase orders (delivery date passed, not received) and work orders (planned date passed, not done): cron every morning at 5:30 and on Refresh, once per user, document and change
  - Missing: the other 38 changes (status changes, costs over estimate, …) are stored but nothing raises them yet; the Email action does not send mail (the recipient is kept)

## Second pass (28 Oct 2026): Jobshop's own window definitions

Analysis and gap tables: `docs/jobshop/analysis/common.md` (layouts,
menus, user guide; frame-wide items for the integrator).

Changed:
- codeTable (every Jobshop table window, other areas' too): Jobshop's
  Inactive column (was Active), inactive rows listed by default, row header
  `*` / `+` / check / X, popup Add Row / Delete Row, Find = "begins with"
  with `*` and `?`, `validate` hook, Maximum Browse Records from the
  preferences, Ctrl+B, F5 / Shift+F5; the grid tools on every table
  (`JobshopCommon.gridTools`): header click sort (Shift: Z-A), column size
  and move, Filter Including / Excluding / by, Remove Filters/Sort, Sort
  Ascending / Descending, Browse Filter dialog (Columns / Filters / Sorting),
  Save widths and positions, Freeze/UnFreeze Columns, Export to Excel (the
  Export dialog, CSV) — kept per computer.
- Titles and captions from the layouts: FOB Points, Status Reason Codes,
  column Type, Postal Code (and its 5-character rule), Terms age types in
  Jobshop's words and order ("Age in days", "Day of next month",
  "Collect on delivery", "End of this month") with the COD = 0 days and day
  1-31 rules; route `reason-codes/inventory` (VInventory\ReasonCode: ID,
  Reason).
- Alert Messages: Messages tab as User Messages (Archived check, Created
  On, Message, + Document; Show All; right-click Show Details…, Open…,
  Delete); Alerts tab as User Alerts (What, When, How, From, To, Subject).
  `common_alerts` also returns action, action_string, recipient.
- File > Preferences: route `preferences` (General, Toolbar, Card Colors,
  Shipping, Receiving placed as Jobshop draws them, `UI.placedForm`), per
  computer; `JobshopCommon.preferences()`. The Control Panel links it.
- Prototypes for the frame / other areas: `checkPostalCode` and
  `addStateProvince` (Add On the Fly dialogs), `findReplace` (Find and
  Replace), `pictureTools` (Insert / Clear / Stretch to Fit), `watchAlerts`
  (alert check at start-up / every N minutes), `filterDomain`.
- No new model or database field; labels changed (module update).

## Built

- Models: `nline.fob_point`, `nline.ship_via`, `nline.product_code` (+ `markup_percent`), `nline.commodity_code` (+ `markup_percent`), `nline.reason_code` (+ `reason_type`; description labelled "Reason"), `nline.user_alert`, `nline.alert_message`
- Fields added: `account.invoice.payment_term`: `net_type`, `net_days`, `discount_type` (`early_discount_days` labelled Disc Aging Days; `early_discount` follows the discount age type); `currency.currency`: `thousands_separator`, `decimal_separator`, `exchange_rate` (function: today's rate; setting it writes today's `currency.currency.rate`)
- Terms rule: a term created without lines gets one remainder line from its age type/days; changing the age type/days of a term with one line rebuilds it (Age in Days = N days, Collect on Delivery = 0, Day of Next Month = day N of the next month, End of Month = the month's last day). A term with several lines keeps them.
- Rights: code tables read by all; write/create/delete for res.group_admin and FOB/ship via: sale, purchase, stock; product/commodity: sale, purchase, product admin, production; reason: stock, production. Subdivisions and postal codes: + sale, purchase. Currencies and rates: + account admin. Alerts/messages: everyone their own (ir.rule on `user_id`), administrators all; messages are created by the ERP (create: admin only).
- RPCs on `nline.desk`: `common_save_table(model, {delete, write, create})` (one transaction; the CodeTable models of every area and the Common tables only), `common_alerts(archived, limit)`, `common_alert_count()`, `common_archive_alerts(ids, archived)`, `common_refresh_alerts()`, `common_preferences()`, `common_set_preferences(values)` (only language, email, signature, company, employee, warehouse; never password or groups)
- JS: `window.JobshopCommon.codeTable(main, spec)` — the Jobshop table window (row header ✔ changed / ✕ marked for deletion, Save Ctrl+S, Refresh F5, Del, Ins, right-click Insert/Delete Row, Save, Refresh, Print; Find box; Show inactive; filters; rights from `get_access`: no Save/Delete/new row for who may not). Other areas can use it for their code tables (sales reps, territories, SIC codes…).
- JS for Home: `JobshopCommon.alertsPanel(container, limit)` draws the user's unread alert messages (nothing when none; resolves to their number), `JobshopCommon.unreadAlerts()` resolves to the unread count.

## Data (`migration/jobshop/common.py`, step `js_common`)

- FOB points (38), ship vias (39), product codes (24), commodity codes (75), reason codes (20): by ID (trimmed), description, inactive, markup %, reason type
- Terms (38 in Jobshop): matched by name (case-insensitive) or made; Jobshop's net days are empty, so the days come from the ID ("Net 60 Days" = 60) for made terms and for existing ones that say "Net N"; the others (VISA, 50/50, …) are made "Age in Days 0" and keep any lines they already have
- States/provinces (111): matched to Tryton's ISO subdivisions (US, CA, MX, BR, AU, GB; by code or name) and only listed when unknown (most are cities or typos: "Houston", "97000"); needs the countries imported (`trytond_import_countries`), else skipped with a message
- Postal codes (600): country from Jobshop's free text (USA, UK, Brasil, …; blank = US), state matched within it; unknown countries skipped
- Currency codes: Jobshop has none; the code is ready
- User alerts (0) and unread user messages (19, from 2016): for the users the ERP has with the same login only

## Decisions

- The Common windows are Jobshop table windows (one grid, edit in place, Save), not `UI.master` forms: that is how Jobshop shows them (Editing/Deleting Terms describe the row header marks).
- States/Provinces and Postal Codes are Tryton's `country.subdivision` and `country.postal_code` (both in 7.0), not new models; the State/Province ID is the ISO code.
- Terms stay `account.invoice.payment_term` (the menu keeps `nline_desk.url_desk_terms`, account group); the Jobshop ID is its name.
- Exchange rate: Tryton's meaning (units of the currency per one company currency), which is what Jobshop's own example gives (1 / 0.83).
- Passwords: never in the ERP; the Control Panel links to N-Line BI.

## For the integrator

- Module dependencies of nline_js_common (tryton.cfg): account_invoice, company, country, currency, ir, nline_desk, party, product, production, purchase, res, sale, stock. Update the module on the databases (new models, fields, access, rules, the cron `nline.alert_message|generate_all`).
- Menu: add Currency Codes (`desk/index.html#/currency-codes`) to the Common group bar (after Reason Codes, as Jobshop's International module); the Terms menu is restricted to the account group — Jobshop's sales and purchasing people use terms too (only account admins may change them, Tryton's access).
- Home: call `JobshopCommon.alertsPanel(node)` to show the user's unread alerts (it draws nothing when there are none).
- nline_js_admin: `terms_list` could print `net_type` / `net_days` (Jobshop's Invoice Age Type and Days) instead of the largest delta; `currency_code_list` could use `thousands_separator` / `decimal_separator` / `exchange_rate`; a route `#/js-reports/common/<report id>` would let each window's Print open its report directly (common.js uses it when it exists).
- nline_migrate.py: with js_common making every Jobshop term, the `TERMS` map (NET 45 DAYS -> Net 30 Days) could go and `js_common` could run before `parties` so customers and suppliers get their own Jobshop terms.
- The cron runs only where `trytond-cron` runs.

## Screenshot review fixes (28 Oct, second pass)

- File > Preferences: every control of Vmfg\Preferences in its place (Save
  Settings / Current Group on Exit, Navigator Menu Icons, Tips at Startup,
  the "(Enter a '0' to load all rows)" note, the File Paths box, the
  Toolbar tab's status bar / navigation bar settings): leaving the
  desktop-only ones out left empty gaps. They are kept on this computer;
  their tooltips say what the browser does instead.
- Migration `postal_codes`: fills the State of postal codes made before the
  ERP had the subdivisions (a re-run after `trytond_import_countries`).
  On nline_test the State column is blank because only US-OK and US-TX
  exist there (data step, not code).
