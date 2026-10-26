# NLINE_ERP development status

Written 26 Oct 2026, continuing `HANDOFF_NLINE_ERP_DEVELOPMENT.md`. Everything below was built in this checkout (`us-mssql`) and tested locally on SQLite with the test suites and scenarios listed; nothing is deployed to NLVDC01 yet and nothing is committed.

## 1. What was built

Fourteen new modules in `modules\nline_*`, one behaviour-neutral change to core (`account_invoice`), and an installer update.

| Module | What it does | Handoff section |
|---|---|---|
| `nline_engineering` | BOM revision code, current revision on the part (its BOM listed first and used by default), pinned component revision, operation and piece on BOM lines, drawing number and revision on parts and BOMs | 7 (#1) |
| `nline_wip` | Real-time WIP: components issued to a production debit the WIP account, the goods produced credit it at full cost; each finished work cycle (planned hours x work-center rate) debits WIP and credits *Applied Shop Cost*; legs pass production to production through a WIP location at their cost (no stock receipt, no posting), at any depth; setup and run time per routing step, *Finish* button records the planned hours | 6.1 changes 1-2, roll-up |
| `nline_outside_service` | Outside operation per routing step (supplier, service, quantity): a purchase line per outside work, grouped by supplier; the bill debits WIP; the production cost uses the posted bill instead of the PO; a bill posted after the production is done posts its difference from WIP to *Production Variance*; *Receive* finishes the outside work | 6.1 change 3, 7 (#3) |
| `nline_work_order` | Sales work order numbered WO-yyNNNN-NN from the sales order and line; a material card beside each input (origin of the input move) with operation, piece and pinned revision; *Make Leg* (revision picker, pinned revision proposed) and *Remove Leg*; legs numbered WO-.../1, /2 across the whole order; release and cancel passed down to legs; a production can't be done before its legs | 7 (#2) |
| `nline_job` | Jobs numbered from 8780; *Create Job* wizard listing uncovered needs (work-order cards, sales lines, order-point shortfall), extra quantity, revision; coverage links on cards and sales lines; no sub-jobs | 7 (#4) |
| `nline_build_tree` | Build tree (expandable legs), shortage flag, printed traveler in Jobshop order (each operation, then its cards, each leg under its card), `production.get_build_tree` for the card screen | 7 (#5) |
| `nline_sales_cost` | Cost order = analytic account per confirmed sales order, set on its lines; sales order cost view: revenue, cost of goods shipped, supplier bills charged, margin and margin rate | 7 (#6) |
| `nline_check_print` | *Check* payment process method with a check sequence per bank; one check per payee; voucher-check report (amount in words, payee address, memo, two stubs, optional MICR line) | 6.4, 7 (#7) |
| `nline_invoice_backdate` | Allows a customer invoice dated before one already numbered (numbers stay gapless) | 6.2 |
| `nline_currency_round` | Half-up rounding of amounts (explicit roundings kept) | 6.3 |
| `nline_change_log` | Tryton record history on moves, invoices, payments, statements, parties, products, BOMs, productions, purchases and sales, and a *Change Log* (who, when, field, old and new value), also from *Relate* on a record | 6.4 |
| `nline_customer_statement` | Customer statement: balance forward, every invoice, credit memo and payment with a running balance, aging (current, 1-30, 31-60, 61-90, over 90) and amount due | 6.4 |
| `nline_account` | Reopening a period reopens its journal-periods (a Tryton gap found by CR-5); exemption / resale certificate on the customer with a warning when an untaxed invoice is posted on an expired one; Texas sales tax return worksheet (Form 01-114) by local authority code | 6.4 |
| `nline_desk` | The web screens (section 3) and the `nline.desk` services they call; early pay discount on payment terms | 8, 9 |

Core change: `account_invoice/invoice.py` — the "invoice number after a later-dated invoice" check moved from the middle of `set_number` into its own method `check_number_date` (same behaviour; `nline_invoice_backdate` overrides it). The core `account_invoice` suite passes after the change (49 tests).

`windows/install.py` now installs the N-Line modules and copies the desk screens into `windows/sao/desk`, which the server's `install_nline_erp.ps1` already mirrors to `G:\NLINE_ERP\sao`.

## 2. Test results

### Module suites (SQLite, `C:\NLINE_ERP_dev\scripts\test.ps1`)

All fourteen suites pass (standard Tryton module checks plus one scenario each). Key figures proved by the scenarios:

- **WIP with legs** (`nline_wip`): casting $100 x2 + machining 2 h x $50 in the body leg = $300, rolled into the valve with bolts $20 and assembly 2 h x $50: valve **$420**, unit cost $210, **WIP nets to $0.00**, applied shop cost -$200.
- **Outside operations** (`nline_outside_service`): heat treat PO 2 x $40; bill posted at 2 x $45 before the production is done: cost **$390** (uses the bill), WIP $0.00. Second production billed after done at $85 vs $80: **$5.00 to variance**, WIP $0.00.
- **Work order from a sale** (`nline_work_order`): sales order 26-1367 line 2 -> **WO-261367-02**; body card pins Rev A, leg **/1** from Rev A, core leg **/2** nested under it; release passes down; valve cost **$260** = all materials + all operations through two leg levels; WIP $0.00.
- **Job**: one Job (**8780**) for 2 work-order cards + 1 spare sales line + 1 extra = qty 4; covered needs not proposed again; a Job's card can't be covered by another Job.
- **Checks**: three bills, two payees -> checks **10234** (two bills) and **10235**; "One Thousand Two Hundred Thirty-Four and 56/100".
- **Desk services**: 2% 10 Net 30 bill paid by check with **$20** discount, bill paid; write check; invoice -> receipt in undeposited funds -> deposit; register **-980, -1,130, +1,370**.

### US-practice tests re-run (`C:\NLINE_ERP_dev\us_tests\run_us_tests_v2.py`)

The 18 tests of the handoff, with the new modules activated: **14 Pass, 0 Fail, 4 Needs decision** (before: 13 Pass, 4 Fail, 1 Needs decision).

| ID | Before | Now |
|---|---|---|
| ST-7 rounding | Fail ($165.62) | **Pass** ($165.63, half-up) |
| STM-1 customer statement | Fail (dunning letter only) | **Pass** (statement with running balance and aging) |
| CR-4 change log | Fail | **Pass** (10 field changes with user and time on the corrected bill) |
| CR-5 back-dated invoice | Fail (blocker) | **Pass** (Sept 20 invoice posted as INV26-00010 after October invoices) |
| ST-3 exempt customer | Pass, no certificate field | Pass, certificate on the customer, expired one warns |
| ST-6 tax by jurisdiction | Pass, no return form | Pass, Texas return worksheet printed |
| ST-4, ST-5, CB-1, BK-2 | | Needs decision (freight taxability, use tax, cash basis, bank feed: CPA / owner) |

CR-5 first failed again for a different reason: after CR-3 closes and reopens September, Tryton leaves the journal-periods closed. `nline_account` fixes this (reopening a period reopens its journal-periods).

### Desk screens (local demo server, browser)

Demo database built by `C:\NLINE_ERP_dev\demo\build_demo.py`, served by `start_demo.cmd` on http://localhost:8790/desk/. Checked in the browser: sign-in, home, work order list, card view of a work order with two leg levels, **drag of 332-02000 Rev A onto the body card made leg WO-261368-01/1 with its own operations and cards**, Write Checks (check 10235, amount in words, payee address, printed check), Enter Bills, Pay Bills (2% discount, check 10236), Create Invoices, Receive Payments (two invoices), Make Deposits ($6,195.00), Check Register (running balance), Customer Center.

## 3. Findings

- **Back-dating split** (QBLocal, last 230 invoices): 142 back-dated, **94 within the same month**, 48 into an earlier month. Monthly sequences would fix only a third, so the direct change (`nline_invoice_backdate`) is the one that works.
- **Plaid sync** (BK-2): `Chase_SyncLog` ends on 17 Jun 2026 with successful syncs and no errors; the sync stopped running, it did not fail. The Plaid tool has since been retired in favour of the Chase worker on the attendant PC (bank access isolated there), so the ERP feed should come from that worker (OFX/CSV statements or its QBLocal transaction tables imported on NLVDC01), not from a Plaid port.
- Reopening a period in standard Tryton leaves its journal-periods closed (fixed in `nline_account`).

## 4. Decisions needed from the owner

1. **Approve the core revisions** before activating them on a live database: real-time WIP (`nline_wip`, `nline_outside_service`), back-dated invoices (`nline_invoice_backdate`), half-up rounding (`nline_currency_round`). They are separate modules: nothing changes until a module is activated.
2. **Costing method** for made parts: average (built and tested) or FIFO.
3. **Work-center rates** (internal operation cost per hour) and setup/run hours per routing step: needed before internal operations cost anything.
4. **UI hosting**: built as static pages served by the Tryton server on NLVDC01 itself (`/desk/`), so nothing depends on nlvrdp01. Confirm.
5. **Bank feed**: from the Chase worker (recommended, keeps bank access isolated) rather than a Plaid port.
6. **Accounts** for the new postings (the demo uses: 1410 Work in Progress, 5900 Applied Shop Cost, 5910 Production Variance, a clearing account per bank for outstanding checks and deposits in transit, Undeposited Funds, 7060 Early Pay Discount, 4900 Sales Discounts) — map them to the N-Line chart with the CPA.
7. The Jobshop "Details" screenshots, to match the card view more closely (the current layout follows the handoff's description).
8. CPA: freight taxability (ST-4), use tax (ST-5), cash basis (CB-1).

## 5. Deploying to nline_test (owner, on NLVDC01 over RDP)

After the changes are committed and pushed to `us-mssql`:

    G:\NLINE_ERP\stop_nline_erp.ps1
    cd G:\NLINE_ERP\src
    git -c safe.directory=* pull
    powershell -ExecutionPolicy Bypass -File G:\NLINE_ERP\install_nline_erp.ps1
    $env:TZ = 'UTC'; $env:TRYTOND_TZ = 'America/Chicago'
    G:\NLINE_ERP\venv\Scripts\python.exe G:\NLINE_ERP\venv\Scripts\trytond-admin -c G:\NLINE_ERP\trytond.conf -d nline_test -m -u nline_engineering nline_work_order nline_job nline_build_tree nline_sales_cost nline_check_print nline_change_log nline_customer_statement nline_account nline_desk --activate-dependencies
    G:\NLINE_ERP\stop_nline_erp.ps1 -Restart

Checked locally on a fresh database: it activates those modules and, as a dependency of the work orders, `nline_wip`, which posts nothing differently until a *Production WIP Account* is set in the accounting configuration (do not set it before approval). After the approvals of section 4, set the WIP accounts and add `nline_outside_service nline_invoice_backdate nline_currency_round` to the `-u` list. The screens are then at `http://nlvdc01:8000/desk/`.

The new modules have not run on SQL Server yet (no sysadmin here); the first activation on `nline_test` is that test. `windows\validate_sqlserver.py` can be pointed at them too.

## 6. Next steps

- Hands-on walkthroughs with the accounts specialist and a planner on `nline_test`.
- Bank reconcile screen (statement ending balance, tick cleared checks and deposits; the clearing accounts are already in place) and statement import from the Chase worker.
- Engineering data import from Jobshop (masters with ENG_ID, cards with SEQ_NO/PIECE_NO/SUBORD_ENG_ID, drawings) into `nline_engineering`.
- Make Deposits / Receive Payments discount column; customer statement emailing; ACH (Nacha) file download button on Pay Bills.
- Card view fidelity against the Jobshop screenshots.

## 7. Local development loop

- Python 3.12 64-bit venv: `C:\NLINE_ERP_dev\venv` (regular installs; `scripts\test.ps1 <module>...` mirrors `modules\nline_*` and `account_invoice` into it and runs the suites on in-memory SQLite).
- Demo server: `C:\NLINE_ERP_dev\demo\start_demo.cmd` (launch configuration `nline-erp-demo`, port 8790, user admin, its password in `demo\adminpass.txt`, local only).
- US tests: `run_us_tests_v2.py C:\NLINE_ERP_dev\us_tests <results.json>`.
