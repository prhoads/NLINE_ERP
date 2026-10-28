# Handoff: a full analysis of VISUAL Jobshop with computer use (28 Oct 2026)

For a new session. The goal: look at the real VISUAL Jobshop, screen by screen and
function by function, compare it with N-Line's Jobshop emulation in the ERP, and close
the gaps. The owner's direction (28 Oct): **emulate Jobshop completely first, then decide
where to deviate; do not stop to ask for preferences** unless a conflict is
insurmountable.

## Read first

1. [`HANDOFF_NLINE_ERP_2026-10-28.md`](HANDOFF_NLINE_ERP_2026-10-28.md): what the
   emulation is, how it is built, how to test and deploy (and the 27 Oct handoff it
   points to).
2. [`docs/jobshop/EMULATION.md`](docs/jobshop/EMULATION.md): the inventory taken from
   Jobshop's help, its frame (group bar, menus, card right-click menu) and the
   architecture (one module `nline_js_<area>` + one script `web/js/jobshop/<area>.js`
   per area, `nline_jobshop` for the menu).
3. `docs/jobshop/status/<area>.md`: what each area built, decided and left out.
4. [`docs/jobshop/AGENT_BRIEF.md`](docs/jobshop/AGENT_BRIEF.md): the rules the area
   builders followed; reuse it if you hand areas to sub-agents again.

The first pass was built from Jobshop's **help** (`C:\NLINE_ERP_dev\jobshop_help`: TOC,
one text file per topic, `V*.txt` = every window's fields) and its **database**. It has
**not** yet been checked against the running program, except the group bar, the menu
bar and the work order card menus. That is this session's job.

## Jobshop on this PC: strictly read-only

- VISUAL Jobshop Premier 6.1.2 runs on this PC (OWNEROW), usually open and signed in as
  PRHOADS, on the **live production database** `NLINE_VJS` (NLVDC01\VJS). People work in
  it every day.
- **Never change anything in it.** No Save / Ctrl+S, no Delete, no Change Status, no
  Issue / Receive / Post / Ship / Invoice, no OK on a dialog that edits, no Getting
  Started Wizard, no Preferences changes, no Print (Print Preview is fine). Open a dialog
  to read it, then Cancel or Esc. If you are not sure a click only reads, do not click.
  Leave the windows as you found them where you can.
- Computer use: `request_access` for "VISUAL Jobshop"; `open_application("VISUAL
  Jobshop")` brings it forward; its title-bar maximize button maximizes it.
- **A masked window covers the middle of the screen** (about x 146–714, y 146–684 of the
  1456×819 frame on 28 Oct, almost certainly the Claude app itself): what is behind it
  is not visible. Work around it:
  - zoom Jobshop's card canvas (toolbar magnifier) or scroll so the target lands
    outside it;
  - right-click near the right side so menus open into the visible area;
  - check `switch_display` for a second monitor;
  - or ask the owner once to move or minimize the Claude window to another monitor.
- The group bar: clicking a group header moves the headers below it to the bottom of the
  bar, so their positions change after each click. Take a screenshot before clicking.
  Use `zoom` to read the small text.

## What to capture, window by window

Go through the group bar in Jobshop's order (Inventory, Engineering, Estimating, Sales,
Purchasing, Planning, Shopfloor, Accounting, Common, Executive Information,
Administration; the Favorites group too). For each window:

- **Layout:** each tab, in order; each field's label, position, kind (text, list,
  check, date, "..." lookup) and whether it is read-only; default values; what fills in
  when another field changes (choosing a part, a customer...).
- **Menus:** the toolbar buttons, and the menu bar's options while this window is
  active (File, Edit, View, Options, Browse, Tools, Navigate), noting which are greyed.
- **Right-click menus:** on tables, cards, fields and tab headers.
- **Dialogs:** the dialogs each option opens (read them, then Cancel): their fields,
  buttons and checks.
- **Browse:** the Browse tab's columns, filters, sort and the advanced filter dialog.
- **Behaviour:** keyboard shortcuts, colours and status letters, what a double-click
  opens, and how the window reacts to an empty or new record.
- **Work Order, Engineering Master and Quote Master** deserve the most time: the Details
  cards (header / operation / material / leg-detail / service cards; Right-click Info,
  DataTips, card icons; how legs hang and are drawn; zoom), every Tools / View / Options
  item, the indented details and costs, material availability, supply & demand.
- **Reports:** each group's Reports item, the report list and its selection dialog
  (Print Preview only).

Use real records to see real behaviour: e.g. WO-261357-01 (one leg), WO-261365-02 (three
legs, one nested), 332-00582-001-01-2 (master).

## Compare with the emulation

- The ERP's local test copy: http://localhost:8790/ (SQLite `nline_test`, Jobshop
  sample data loaded). The browser pane signs in without a password through a local test
  session:
  - run `C:\NLINE_ERP_dev\scripts\dev_session.py admin`;
  - stage its JSON as `C:\NLINE_ERP_dev\webroot\dev_session.json`;
  - in the page, fetch it into `localStorage['sao_session_nline_test']`;
  - delete the file.

  The test user `shoptest` (production only, work order create/modify off) is made with
  `make_test_user.py`.
- For each Jobshop window open the same screen in the ERP (the menu is Jobshop's group
  bar) and record the differences.
- Write one file per area, `docs/jobshop/analysis/<area>.md`, with:
  - per window, what Jobshop shows (with the menu paths);
  - a gap table: missing / different / extra, each with where to fix it (file,
    function) and a size (S / M / L).

  Keep Jobshop screenshots out of the repository: save them under
  `C:\NLINE_ERP_dev\jobshop_analysis\`.
- Then **close the gaps**:
  - If you work alone, fix the small ones as you go.
  - The bigger ones can go area by area to sub-agents, with the brief and the
    disjoint-files rule, as before; the integrator owns frame.js, ui.js, app.js,
    index.html, desk.css, the menu generators and the migration tool.

## The owner's feedback so far (already done; keep it that way)

- Part / master / code fields show the ID only; the full name is in the tooltip
  (`UI.shortName`).
- No First / Previous / Next / Last buttons on any screen.
- The work order lookup lists work orders, not their legs.
- Work order cards:
  - the header card is the size of the others;
  - a leg hangs off its **operation** card, beside the parent stack, with a short
    straight line;
  - no list of masters beside the cards.
- The mouse wheel scrolls the scroll bars in series (inner, then outer).
- Colour:
  - a coloured icon tile per menu item, in its area's colour;
  - navy actions and N-Line orange, no teal;
  - each window's ribbon in its area's colour.
- Header: "Tryton ERP", with "for" (handwritten) and the N-Line Valves logo under it; the
  N-Line valve photo beside them.

## Testing and deploying

- Tests: `powershell -File C:\NLINE_ERP_dev\scripts\test.ps1 <module>...`; JavaScript
  syntax: `C:\NLINE_ERP_dev\venv\Scripts\python.exe C:\NLINE_ERP_dev\scripts\jscheck.py`.
  Bump `?v=` in `modules/nline_desk/web/index.html` (and `windows/sao/index.html` for
  custom.js / .css) on every web change.
- Local server: create `C:\NLINE_ERP_dev\local_servers\restart.erp` to restart it (it
  re-syncs the modules and the desk files); update modules with `trytond-admin -u` on
  `C:\NLINE_ERP_dev\demo\trytond.conf`.
- Live (NLVDC01, owner allows live changes in this phase):
  - commit and push `us-mssql`;
  - `git -C \\NLVDC01\NLINE_ERP\src pull`;
  - web files only: robocopy `src\modules\nline_desk\web` to `sao\desk` and
    `src\windows\sao\{custom.js, custom.css, index.html, images}` to `sao` (a page
    reload, no restart);
  - Python or module data: if the owner has set up the update watcher (the folder
    `\\NLVDC01\NLINE_ERP\requests` exists), run
    `powershell -File C:\NLINE_ERP_dev\scripts\request_live_update.ps1` and read its
    result; otherwise ask the owner to run
    `G:\NLINE_ERP\quick_update_nline_erp.ps1` on NLVDC01.

## Open with the owner (as of 28 Oct)

- One-time setup of the update watcher (`G:\NLINE_ERP\src\windows\setup_update_watcher.ps1`).
- A module update on live (watcher or quick update) to apply the coloured menu icons and
  remove the duplicate Home menu.
- Approval of the migration proposal (`migration/README.md`).
