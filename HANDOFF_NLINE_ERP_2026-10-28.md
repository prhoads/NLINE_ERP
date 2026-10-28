# NLINE_ERP handoff, 28 Oct 2026 — the VISUAL Jobshop emulation

Read first: [`HANDOFF_NLINE_ERP_2026-10-27.md`](HANDOFF_NLINE_ERP_2026-10-27.md)
(how to work here, deploy, don'ts) and
[`docs/jobshop/EMULATION.md`](docs/jobshop/EMULATION.md) (the plan, sources,
architecture).

## The owner's direction (28 Oct, verbatim in essence)

Emulate VISUAL Jobshop **completely first** — every screen, every function,
every right-click function — then decide where to deviate. Remove the stock
Tryton (non-accounting) views made redundant. Do not stop to ask for
preferences unless a conflict is insurmountable.

## What exists now

- **Inventory of Jobshop**: the help (`VjsEnu.chm`) decompiled to
  `C:\NLINE_ERP_dev\jobshop_help` (TOC, one text file per topic, the field
  level descriptions `V*.txt`, `reports.json`); the live group bar, menu bar
  and card right-click menus captured with computer use. All in
  EMULATION.md.
- **Menu = Jobshop's group bar** (module `nline_jobshop`,
  `tools/gen_menus.py`): Inventory, Engineering, Estimating, Sales,
  Purchasing, Planning, Shopfloor, Accounting, Common, Executive Information,
  Administration, Jobshop's item names and order. QuickBooks folders
  (Customers, Vendors, Banking, Company) follow. Hidden for everyone
  (Administration > Superseded Menus to show again): sale, purchase,
  production, stock, product, party menus, Build Tree.
- **Eight area modules** `nline_js_<area>` + `web/js/jobshop/<area>.js`,
  each with its status file `docs/jobshop/status/<area>.md` (ticked
  checklist, decisions, gaps — the current truth):
  common, inventory, sales, purchasing, engineering (Engineering,
  Estimating, the Work Order window and the shared card canvas), shopfloor,
  planning, admin (Jobshop Accounting, Executive Information, Administration,
  the 98 reports).
- **Shared desk features** (frame.js): record navigation, Picture and Notes
  tabs, Print, `UI.contextMenu`, `UI.screenAllowed`, `UI.access`; area routes
  on `window.NLINE_ROUTES` take precedence; Home shows unread Jobshop alerts.
- **Data**: `migration/jobshop/<area>.py`, steps `js_<area>` (js_common runs
  right after base). Locally loaded in sample mode.

## Verified (local nline_test)

- All 9 new modules activate; the Jobshop data steps run (after fixes:
  Jobshop's 6-decimal numbers, inactive codes, unsaved proteus ids, the
  RFQ sample, steps run alone now load the party cache).
- All 67 Jobshop routes render with no error; real records (WO with legs,
  part, SO, PO, master, quote, customer, supplier, resource, RFQ) open and
  every tab renders.
- Permissions: a production-only user sees only their menus; with work
  order create/modify off, the Work Order window and its card menus offer
  only viewing.
- Module tests: see the commit after this note (all area suites).

## Not verified / known gaps

- **Live (MSSQL) not updated yet** — the owner must run the update (below).
  The areas were only tested on SQLite; MSSQL-specific failures may show
  there (e.g. ordering with NULLS LAST, SQL functions in reports).
- Each status file lists its gaps; the main ones: backward scheduling;
  lot/split/piece tracking; unit conversions not applied on sale/purchase
  lines; a closed work order cannot be reopened (Tryton); PO lines editable
  only while Unreleased (Tryton); Sales "New From Quote" still copies Tryton
  quotations (should use `nline.quote`); quote code fields (sales rep,
  territory…) are text, not links to the sales code tables; Inventory and
  Planning both have a Supply & Demand dialog (keep one); the old screens in
  `js/orders.js`, `js/shopfloor.js`, `js/planning.js`, `js/purchasing.js` are
  superseded at the same routes and can be deleted.
- Local test sign-in for the browser pane without a password:
  `C:\NLINE_ERP_dev\scripts\dev_session.py <login>` (writes a Tryton
  session; stage it in the web root, fetch it into localStorage
  `sao_session_nline_test`, delete the file). Test user `shoptest`
  (production only, WO create/modify off) via `make_test_user.py`.

## Owner action (NLVDC01, PowerShell as admin)

```
powershell -ExecutionPolicy Bypass -File G:\NLINE_ERP\update_nline_erp.ps1 -Modules nline_build_tree,nline_desk,nline_jobshop -LoadSample
```

(`-Modules` because the running copy of the script still has the old default
list; `--activate-dependencies` brings in the eight `nline_js_*` modules;
`-LoadSample` runs every step again, including the new `js_*` ones, keeping
what exists.)

## Next

1. Confirm the live update; fix what MSSQL reveals.
2. Walk the owner/team through the Jobshop screens; collect deviations.
3. Close the gaps above, area by area (status files).
4. Migration proposal approval still pending (from 27 Oct).

## Live updates without the owner (28 Oct)

- `windows\quick_update_nline_erp.ps1`: copies only the modules / web files whose
  CONTENT changed; restart only for Python, `trytond-admin -u` only for the modules
  whose data (xml, cfg, csv, po, view) changed. The full `update_nline_erp.ps1` stays
  for new standard modules or a damaged install.
- Watcher: scheduled task `NLINE ERP Update Watcher` on NLVDC01 (every minute, as
  SYSTEM; SYSTEM is db_owner of the ERP databases), set up once by the owner with
  `windows\setup_update_watcher.ps1`. From the development PC:
  `powershell -File C:\NLINE_ERP_dev\scripts\request_live_update.ps1 [-WhatIf]` (push
  first): pulls `\\NLVDC01\NLINE_ERP\src`, drops `requests\update.request`, waits for
  `requests\update.result` and prints the log (`requests\logs`).
