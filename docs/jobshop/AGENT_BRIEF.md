# Brief for an area of the Jobshop emulation

Read `docs/jobshop/EMULATION.md` first (sources, Jobshop's frame, how the
emulation is built). This brief is what every area follows.

## Goal

The owner wants N-Line's ERP (Tryton 7.0, fork in `M:\NLINE_ERP`, branch
`us-mssql`) to emulate VISUAL Jobshop **completely**: every window, every tab,
every field that matters, every function and every right-click / Tools / View
menu option, with Jobshop's names, layout order and behaviour. "Do not stop to
ask for preferences": decide, note the decision in your status file, go on.
Only a truly insurmountable conflict is worth stopping for.

## Where Jobshop is described

- `C:\NLINE_ERP_dev\jobshop_help\toc.txt` — the help's table of contents.
- `C:\NLINE_ERP_dev\jobshop_help\topics\<Topic>.txt` — one topic per file.
  `V<Module><Window>.txt` = the field level description of a window (all its
  fields, tab by tab): the spec of each window. The `Using_the_...Tab`,
  `Understanding_...`, `Entering_...`, `Accessing_...` topics describe the
  functions. `reports.json` = the 99 reports.
- The Jobshop data: SQL Server `NLVDC01\VJS`, database `NLINE_VJS` (and
  `QBLocal` for QuickBooks), **read-only**, Windows sign-in, pyodbc with
  `ApplicationIntent=ReadOnly` (see `Source` in `migration/nline_migrate.py`).
  Table and column definitions: the `*.schema` files in
  `C:\Infor Global Solutions\VISUAL Jobshop`, or INFORMATION_SCHEMA.
- Do **not** use computer use or the browser pane (one screen, shared): the
  help and the database are enough. The integrator checks the screens.

## What you own (edit only these)

- `modules/nline_js_<area>/` — your Tryton module (already scaffolded:
  `<area>.py` lists `MODELS / WIZARDS / REPORTS`, `<area>.xml`, `tests/`).
  You may split into more `.py` / `.xml` / `view/*.xml` files; keep
  `__init__.py` registering from the lists, list xml files in `tryton.cfg`,
  add standard Tryton dependencies to `tryton.cfg` if you need them.
- `modules/nline_desk/web/js/jobshop/<area>.js` — your screens.
- `migration/jobshop/<area>.py` — `def run(m)`: imports your area's Jobshop
  data (code tables, the extra fields you add) into the ERP through proteus,
  re-runnable (match what exists, never duplicate). `m` is the `Migration` of
  `migration/nline_migrate.py`: `m.js.rows(sql, *params)` (Jobshop),
  `m.qb.rows(...)` (QuickBooks mirror), `m.get('model')` (proteus Model),
  `m.product(part_id)`, `m.js_party('C'|'V', id)`, `m.count(what)`,
  `m.context`, `m.sample` (sample mode: only what the sample's open orders
  use), and the module-level `log()`, `one_line()`, `day()`, `dec()`.
- `docs/jobshop/status/<area>.md` — your status: the checklist items of your
  area from EMULATION.md, ticked `[x]` / `[~]` (partly, say what is missing) /
  `[-]` (not emulated on purpose, say why), plus decisions and anything the
  integrator must do.

**Do not edit** shared files: `frame.js`, `ui.js`, `rpc.js`, `app.js`,
`index.html`, `desk.css`, any `modules/nline_desk/*.py|xml`, the other areas'
files, `modules/nline_jobshop/`, `migration/nline_migrate.py`,
`docs/jobshop/EMULATION.md`, `windows/`. If you need a change there, do it in
your own file (e.g. a helper in your JS file, a `PoolMeta` extension in your
module) and list the suggestion in your status file. CSS: inject a `<style>`
element from your JS file once (id `nl-js-<area>-css`) using the desk's CSS
variables (`--line`, `--muted`, `--paper`, `--ink`, `--accent-soft`, `--ok`,
`--bad`, `--leg`).

## How screens are built

- Register routes: `routes.push([/^#\/route$/, 'screenName'],
  [/^#\/route\/(\d+)$/, 'screenName'])` and define `Screens.screenName =
  function (main, params) {...}`. Your routes come before the built-in ones,
  so defining a route that already exists replaces that screen (that is how
  you take over an existing screen you own — keep everything it already
  does).
- Maintenance windows: `UI.master(main, {title, model, label, order, domain,
  open: params && params[0] ? parseInt(params[0], 10) : null, tabs: [...],
  browse: [columns], extra: [{label, onclick(record, load)}], print,
  defaults, beforeSave, afterSave, onload})`. Tabs: `{title, fields: [{name,
  label, type: char|text|integer|float|decimal|money|boolean|date|selection|
  many2one, model, domain, options, readonly, span, default}]}`, `{title,
  lines: {name, model, inverse, fields}}`, `{title, render(pane, record)}`,
  `{picture: true}`, `{notes: true}`. It gives the ID lookup, First /
  Previous / Next / Last, Save / Clear / Copy / Delete per the user's rights
  and the Browse tab. Read `modules/nline_desk/web/js/frame.js` (master,
  form, grid, browse, report, linesTab), `ui.js` (el, modal, confirm, toast,
  picker, money, date), and the existing screens in `js/*.js` to match their
  style (ES5: `var`, `function`; 4-space indent; short comments that say
  why). `UI.contextMenu(event, items)` gives Jobshop's right-click menus
  (items `{label, onclick}` or `'-'`); `UI.screenAllowed(route)` and
  `UI.access(models)` tell what the user may open / do; `UI.openScreen
  ('route/id')` opens a screen in a Tryton tab; `UI.openRecord(model, id)`.
- Server side: extend `nline.desk` in your module
  (`class Desk(metaclass=PoolMeta): __name__ = 'nline.desk'`; RPCs in
  `__setup__`: `cls.__rpc__[name] = RPC(readonly=False)` for writes, `RPC()`
  for reads), check rights first with `cls._check_read/_check_create/
  _check_write(model)`, call from JS with `Rpc.desk('method', [args])`.
  Plain model calls: `Rpc.model(model, method, args)`, `Rpc.searchRead(
  model, domain, fields, {limit, order})`.
- Data Jobshop has and Tryton has not: add fields to the Tryton models
  (`PoolMeta`) or new models (`ModelSQL, ModelView`; code tables inherit
  `trytond.modules.nline_js_common.common.CodeTable`). Name fields plainly
  (e.g. `sales_rep`), but grep the other `nline_js_*` modules first so two
  areas do not add the same field name to the same model. New models: give
  them `ir.model.access` (read for everyone; write/create/delete for your
  area's group: `sale.group_sale`, `purchase.group_purchase`,
  `stock.group_stock`, `production.group_production`,
  `account.group_account`, `res.group_admin`).
- Reuse what Tryton and the N-Line modules already do (sales, purchases,
  stock moves, productions, works, routings, BOMs, invoices, nline_engineering
  revisions, nline_work_order legs and material cards, nline_wip,
  nline_outside_service, nline_job...). Emulate Jobshop's screen on top of
  them; add models only for what has no equivalent.
- Permissions (owner's rule, strict): a user never sees an option they may
  not use — no error popups. Hide buttons / menu items / tabs per
  `UI.access` / `UI.screenAllowed` / `get_access`; the menus of your screens
  already carry groups (nline_jobshop). Server checks stay (they are the
  guard), the UI just never offers what would be refused.
- Jobshop shortcuts where a browser allows them (Ctrl+S save, F5 refresh,
  Del delete, Alt+S / Alt+N already in UI.form).

## Testing

- Server: `powershell -ExecutionPolicy Bypass -File
  C:\NLINE_ERP_dev\scripts\test.ps1 nline_js_<area>` (in-memory SQLite; it
  mirrors the modules into the dev venv first). Add a proteus scenario test
  (`tests/scenario_nline_js_<area>.rst` + `tests/test_scenario.py`, as in
  `modules/nline_change_log/tests`) covering your desk RPCs and models.
- JavaScript: `C:\NLINE_ERP_dev\venv\Scripts\python.exe
  C:\NLINE_ERP_dev\scripts\jscheck.py <your js file>` (syntax).
- Data: you may run your `migration/jobshop/<area>.py` logic only against an
  in-memory test database in a test, never against `nline_test` or live.
- Do not start, stop or restart servers, do not run `trytond-admin` on any
  database, do not commit (the integrator commits), do not touch NLVDC01.
- Never write to Jobshop or QuickBooks. Never touch bank / payment tools
  (Chase, NACHA). Never store passwords.

## Report back

End with: what you built (screens, routes, RPCs, models, fields), what is
partial or left, the suggested shared-file changes, and anything the
integrator must run (module dependencies added, data steps). Keep it short;
the details go in your status file.
