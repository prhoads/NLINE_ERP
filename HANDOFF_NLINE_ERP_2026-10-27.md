# NLINE_ERP handoff, 27 Oct 2026

This note picks up from the 27 Oct session. It does not replace the two earlier notes; read those first for background:

- [`HANDOFF_NLINE_ERP_DEVELOPMENT.md`](HANDOFF_NLINE_ERP_DEVELOPMENT.md) (26 Oct). It has:
  - the goal: replace Jobshop and QuickBooks;
  - the owner's rules;
  - the server install;
  - how N-Line works today;
  - the cost estimates for the core revisions.
- [`NLINE_ERP_DEVELOPMENT_STATUS.md`](NLINE_ERP_DEVELOPMENT_STATUS.md) (26 Oct). It covers:
  - the 14 `nline_*` modules;
  - test results;
  - the local development loop.

Since those notes were written, the BI sign-on was added: the ERP is reached at `/ERP` on the N-Line BI server (nlvrdp01), signed in through BI. The live Home menu, desk config and Reconcile were also fixed.

Repo: `M:\NLINE_ERP`, branch `us-mssql`, pushed to `origin` (github prhoads/NLINE_ERP). It was clean at commit 629077a748 when this note was written. Run git with `git -c safe.directory='*' ...`, because the share trips git's ownership check.

---

## 1. Goals: the owner's order of development (verbatim, 27 Oct)

1. **Permissions.** "no error popups, users simply do not see options in the menu they are not authorized to use. If they do navigate to those screens manually, they get redirected back to home. Need user authority options (settable in the global admin panel) for how much they can create PO's for. And work order create and modify permissions."
2. **UI.** "To test UI properly, we do need some data in the ERP database, please move some from QBLocal and Jobshop. Don't ask me for numbers like Check numbers, this is a test database so make up the number if you can't find it. Once you have some data, start working through the engineering, manufacturing, and accounting screens with the goal of matching Jobshop of Eng + man, and QB on accounting."
3. **Data migration.** "Build a migration tool and advise your proposal on how to import data from Jobshop and establish a data "cutoff" at about 5 years ago, while still maintaining accessibility to older jobshop data"

Requests that came later in the session:

- emulate Jobshop's work order **Details** canvas: stacked cards, zoom, and right-click options (jump to the part, the PO, and so on);
- make the Tryton menu panel narrower and resizable.

## 2. Status

| # | Item | State |
|---|---|---|
| 1 | Permissions | **Done, live.** |
| 2a | Sample data from Jobshop + QBLocal | **Done locally. Live is partly loaded.** Customer invoices and checks are waiting on the owner's rerun (section 4). |
| 2b | Screen-by-screen match to Jobshop / QB | **In progress.** Engineering Master has an Operations tab; the work order card view (cascade) is built; the other screens are not reviewed yet. |
| 2c | Work order Details cards | **Cascade, colours, status letters and zoom are done and live.** The right-click menu and the legs are not done yet. |
| 3 | Migration tool + proposal | **Tool built (sample mode used). Proposal written** in `migration/README.md`; the owner has not approved it yet. |
| – | Resizable Tryton menu | **Done, live** (default 260 px; drag the edge; double-click resets). |

### 2.1 Permissions (done)

- **Menus and screens** (`windows/sao/custom.js`):
  - Screens a user may not use are left out of the menu.
  - A typed `#nline/...`, `/model/` or `/wizard/` address that isn't allowed goes back to Home with no message. Home is always allowed.
- **Per-user options** (`modules/nline_role/role.py`):
  - `res.user` fields:
    - `nline_po_limit`: Numeric; empty means no limit;
    - `nline_wo_create` and `nline_wo_modify`: Boolean.
  - `ModelAccess.get_access` takes away create, write and delete on `production` per those booleans. Use `refused = value is not None and not value`, because SQLite returns 0, not False.
  - `Purchase.nline_check_limit` runs in quote and confirm and in the desk's `purchase_order_save`. It compares the PO total, in company currency, to the limit.
  - Tests: `test_work_order_options`, `test_po_limit`, and in nline_nlbi `test_login_options`.
- **Set in the BI Admin page:**
  - Each app declares `app.state.options`. The ERP proxy declares `po_limit`, `wo_create` and `wo_modify`.
  - The Admin page shows inputs for them per person, and `accounts.py` stores them in `u["options"][app]`.
  - The ERP proxy puts them in the signed sign-in token. `nline_nlbi` calls `User.set_nline_options` at each sign-in.
  - Repos, local commits with **no remote**:
    - `M:\N-Line_BI\Server`, commit fa4ba1e;
    - `M:\N-Line_BI\ERP`, commit cd285a2.
  - Both are deployed to nlvrdp01 and the BI web server was restarted.
- **Desk screens** (`nline_desk/web/js/frame.js`):
  - `UI.master` reads `ir.model.access.get_access` and disables or hides Save, Copy and Delete.
  - `UI.form`'s `allow()` hides Save & New / Save & Close. Alt+S and Alt+N follow it.
- **Verified locally:**
  - a typed address redirects to Home;
  - a $500 limit refuses a $1,000 PO;
  - with `wo_create` off, Work Order hides Save, Copy and Delete.

### 2.2 Migration tool and sample data

`migration/nline_migrate.py` uses proteus with direct trytond access. It reads SQL Server `NLVDC01\VJS` read-only with Windows auth (databases `NLINE_VJS` and `QBLocal`). It can be re-run: anything already imported is matched and kept.

```
python nline_migrate.py --config <trytond.conf> --database nline_test --mode sample|full
    [--cutoff 2021-01-01] [--steps base,parties,resources,parts,masters,sales,purchases,workorders,bills,invoices,checks]
```

What each step does:

| Step | What it does |
|---|---|
| base | Desk config: reconcile account 1499, clearing account 1005, DESK journal, Customer Receipts journal, "Chase 9807 Checks" journal (next number from QB, 13180). Product categories "Parts" and "Outside Services". Separate INV / CM / BILL / VC sequences per fiscal year. Units u / in / ft / lb set to 4 digits. COGS account type set to `stock=True`. |
| parties | Parties are matched by normalised name across Jobshop and QB. |
| resources | Each Jobshop resource becomes a work center with its own category, under the parent "N-Line Shop" (SHOP). Each operation gets the work center category of the same name. |
| parts | `template.code` = PART_ID. |
| masters | The BOM is named `"<code> <description>"`, with revision = ENG_ID. BOM inputs carry operation, piece and component revision. The routing gets its steps. |
| workorders | Number: `WORK_ID[/LOT][.SPLIT]`. The routing comes from the product-BOM link; work_center = shop. Jobshop RELEASED orders are released. |
| sales, purchases | Number written after save; released orders are quoted and confirmed. |
| bills, invoices, checks | Go through the desk services. If an account type is invalid, `line_account()` falls back to COGS / sales and puts "[QB: name]" in the line text. In sample mode, checks cover the last 90 days. |

- **Local nline_test** (SQLite, built by `C:\NLINE_ERP_dev\sample\build_local_test.ps1`), loaded 27 Oct:
  - 944 parts and 444 masters;
  - 590 work centers;
  - 180 work orders, all released;
  - 25 sales orders and 58 POs;
  - 227 bills, 16 invoices and a couple of checks.
  - All 48 desk screens were opened with no error banners.
- **Live nline_test** after the owner ran `update_nline_erp.ps1 -LoadSample`:
  - 954 products and 401 BOMs;
  - 180 productions;
  - 25 sales orders and 58 POs;
  - 257 bills.
  - The run stopped at customer invoices: live FY 2026 shared one invoice sequence. I fixed it through the live pass-through by giving fiscal year id 2 its own INV26- / CM26- / VC26- strict sequences.
  - Customer invoices and checks still need the rerun (section 4).

**Migration proposal** (`migration/README.md`, approval pending):

- Cutoff is 1 Jan 2021.
- All masters still in use are imported.
- The go-live position comes in as live documents: open orders, inventory, WIP, open AR/AP and GL balances.
- History since the cutoff is read-only:
  - accounting as monthly GL totals;
  - operations in a new `nline_history` module.
- `NLINE_VJS` is set read-only, with an Archive screen to look up older Jobshop records.
- A check report runs before go-live.

### 2.3 Jobshop-like screens

- **Engineering Master** (`web/js/shopfloor.js`):
  - New Operations tab, fed by the `master_info(bom)` RPC in `shopfloor.py`. Columns: Seq, Operation / material, Qty, Unit, Setup h, Run h, Outside service.
  - On the Materials tab, operation, piece and component revision can be edited.
- **Work Order:**
  - Statuses use Jobshop names: request = Planned, draft = Unreleased, waiting = Released, running = Started, done = Closed.
  - The **Details** button opens `workorders/<id>` (`web/js/workorder.js`), which follows Jobshop's cascade:
    - one stack per production or leg, all on a common bottom line;
    - stack order: loose cards, then for each operation its materials (by piece) followed by the operation;
    - each next card sits 14 px right and 20 px up, and earlier cards lie on top;
    - green operations `(R/C/U) seq - name`; cyan outside operations and closed cards; red materials `(R/C) piece - code`, with no seq;
    - zoom with − / % / + / 100% or Ctrl+wheel; the view opens scrolled to the bottom.
- **Tryton menu width** (`custom.js` `menuEdge()` plus `custom.css`):
  - CSS var `--nl-menu-w`, 160–600 px;
  - saved in localStorage `nline.menu.width`.

## 3. Next steps, in order

1. **Confirm the owner's rerun** of invoices and checks on live (section 4). Then check the live counts: customer invoices around 16, and checks.
2. **Legs in the migration.** Import Jobshop legs (`SUB_ID <> '0'`) as child productions (nline_work_order legs), so they show as their own stacks in the cascade, linked from the material card they feed.
3. **Right-click menu on cards** (`workorder.js`): open the part, the engineering master, the PO or outside service, and the sales order; issue material; finish the operation. Check every action with `get_access`, and hide the ones the user may not use (no popups).
4. **Screen-by-screen match.** Work through Engineering and Manufacturing against Jobshop, then Accounting against QuickBooks: Write Checks, Enter Bills, Pay Bills, Receive Payments, Create Invoices, register, Reconcile. Use the sample data. Fix what differs.
5. **Migration, after the owner approves the proposal:**
   - full masters into nline_test;
   - `nline_history` and the Archive screen;
   - the check report;
   - a dress rehearsal.
6. Delete the duplicate live Home menu **328**, but only after making sure the official Home menu (re-created by `-u nline_desk`) exists and works.

## 4. Waiting on the owner

- **Rerun on NLVDC01** (PowerShell, as admin):
  ```
  $env:TZ='UTC'; $env:TRYTOND_TZ='America/Chicago'; G:\NLINE_ERP\venv\Scripts\python.exe G:\NLINE_ERP\src\migration\nline_migrate.py --config G:\NLINE_ERP\trytond.conf --database nline_test --steps base,invoices,checks
  ```
  I don't know whether it has been run.
- **Approval of the migration proposal** (cutoff 2021-01-01, read-only history, Archive screen).
- **"Build legs and the right-click menu next?"** was offered; there was no answer yet. Continue anyway: it is the requested Jobshop feature.
- **Computer use to explore Jobshop.** The owner turned it on, but this session started before that, so no tools appeared. A new session should have them: load them with `ToolSearch` query "computer". Jobshop runs on this PC, logged in. Use it only to look at Jobshop (Details canvas, right-click menus); never change Jobshop data.
- From the 26 Oct notes, still open: which core revisions (WIP posting, back-dating, rounding) are approved before any posting code is written.

## 5. How to work here

- **Local loop:**
  - Code lives in `M:\NLINE_ERP`; the dev venv is `C:\NLINE_ERP_dev\venv`. Module list: `sync_modules.txt`; `stock_lot` was added on 27 Oct.
  - The local servers are kept alive by the scheduled task "N-Line local test servers" (`C:\NLINE_ERP_dev\local_servers\keep_local_servers.ps1`):
    - ERP `http://localhost:8790` (SQLite nline_test);
    - test BI `http://localhost:8771/ERP/`;
    - live pass-through `http://live.localhost:8775/ERP/`, which goes to nlvrdp01.
  - To restart one, create `restart.erp` or `restart.nlbi` in that folder. Don't start servers from the sandbox.
- **Web changes:**
  - Bump `?v=` in `modules/nline_desk/web/index.html` on every change. It is now `20261031h`.
  - Write files without a BOM: use `[IO.File]::WriteAllText`, not `Set-Content -Encoding utf8`.
- **Deploying to live** (the owner allows live fixes during early development):
  1. Commit and push `us-mssql`.
  2. `git pull` in `\\NLVDC01\NLINE_ERP\src`.
  3. Static web: robocopy `src\modules\nline_desk\web` to `\\NLVDC01\NLINE_ERP\sao\desk`, and copy `windows\sao\custom.js` and `custom.css` to `\\NLVDC01\NLINE_ERP\sao\`. Only a page reload is needed.
  4. Python module changes need the owner on NLVDC01: `powershell -ExecutionPolicy Bypass -File G:\NLINE_ERP\update_nline_erp.ps1` (optional `-Modules a,b` and `-LoadSample`).
- **Import gotchas already solved; don't relearn them:**
  - A production with a routing needs a work center.
  - Release looks for centers by category *under* the production's work center.
  - Continental stock accounts need `type.stock`.
  - Invoice lines need expense / revenue account types.
  - Each fiscal year needs separate invoice sequences, or `check_number_date` fails.
  - Use `one_line()` on Jobshop names (they contain line breaks).
  - `ntext` can't be DISTINCT; use an IN subquery.
- **Don'ts:**
  - Never touch bank or payment tools (Chase, NACHA).
  - Never enter or store the owner's passwords.
  - Never log the ERP secret.
  - Don't sign out of Tryton on live: it signs the owner out of BI too.
  - Give the owner short PowerShell commands.
  - Make up test numbers instead of asking.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 6. Key files

| File | What |
|---|---|
| `modules/nline_role/role.py`, `view/user_form.xml` | PO limit, work order rights |
| `modules/nline_nlbi/user.py` | Options applied at sign-in |
| `modules/nline_desk/desk.py`, `purchasing.py`, `planning.py`, `shopfloor.py` | Desk RPCs and write checks |
| `modules/nline_desk/web/js/frame.js` | Desk UI framework (master, form, browse, lock) |
| `modules/nline_desk/web/js/shopfloor.js` | Engineering Master, Work Order |
| `modules/nline_desk/web/js/workorder.js`, `web/css/desk.css` | Card cascade (Details) |
| `windows/sao/custom.js`, `custom.css` | Tryton client: menu filter, Home redirect, menu width |
| `windows/update_nline_erp.ps1` | Server update (+ `-LoadSample`) |
| `migration/nline_migrate.py`, `migration/README.md` | Migration tool and proposal |
| `M:\N-Line_BI\Server\host\nline_bi_host\{app,signin,accounts}.py`, `web/admin.js` | BI Admin per-app options |
| `M:\N-Line_BI\ERP\erp_web\service\erp_proxy\app.py` | ERP options and sign-in token |
| `C:\NLINE_ERP_dev\sample\build_local_test.ps1` | Builds the local SQLite nline_test |
