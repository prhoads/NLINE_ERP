# NLINE_ERP development handoff

Written 26 Oct 2026 at the end of the evaluation conversation (install, ERP evaluation, US-practice tests, OFBiz comparison). It is meant to let a new session start the development work without that conversation. Everything here was checked against code, data or test runs unless it says otherwise.

Owner: Peter Rhoads (N-Line Valves, Houston TX). Repo: https://github.com/prhoads/NLINE_ERP, branch `us-mssql` (this clone: `M:\NLINE_ERP`).

---

## 1. Goal

Turn the NLINE_ERP Tryton fork into **one system that replaces both Visual Jobshop (manufacturing, inventory) and QuickBooks (AP, AR, GL)**. Removing the Jobshop-to-QuickBooks hand-off, where records get orphaned, is the main point.

Three streams of work:

1. **Backend accounting and manufacturing changes** in the Tryton fork: WIP accounting, operation costs (internal and external) rolled up through legs, back-dated invoices, rounding, change log and other US-practice gaps.
2. **Jobshop-like work order UI**: the graphical card view, built by dragging engineering masters onto material cards.
3. **QuickBooks-like accounting data entry UI**: Write Checks that looks like a paper check, Enter Bills, Pay Bills, Receive Payments, Create Invoices, register, reconcile.

## 2. Owner's rules and preferences (follow these)

- **Replace both systems.** Never propose keeping QuickBooks for any function or exporting to it.
- **No radical departures** from how N-Line works in Jobshop and QuickBooks today: keep order types, numbering, leg and Job rules.
- **Keep-out rule, as it now stands.** Originally: accounting, inventory and WIP use standard Tryton, with no custom accounting code, and custom modules post only through standard methods. On 25–26 Oct the owner asked how hard the core revisions are (WIP, back-dating, rounding) and costed them (section 6). **The new session should confirm with the owner which core revisions are approved before writing posting code.** Engineering data, work-order structure and UI are fair game.
- **Pedigreed engine.** Tryton was chosen over the alternatives (section 10). SlowBooks Pro 2026 (github VonHoltenCodes/SlowBooks-Pro-2026) is a reference only for how QuickBooks-style screens should look and behave, never as code or engine.
- **Licenses:** OSI-approved only. Odoo is excluded (the owner distrusts its treatment of free users), and so are source-available licenses (BSL and similar) and open-core.
- **Python and database-neutral SQL** (python-sql) are why Tryton is valued: they fit N-Line's Python BI tools (FastAPI and pyodbc on nlvrdp01), and the whole toolset can ship as one bundle.
- **Usability counts as much as data fit.** Judge the daily screens from the user's seat. Staff are trained on QuickBooks' metaphors (the check looks like a paper check, the register like a checkbook) and on Jobshop's graphical work order. Plan hands-on walkthroughs with the accounts specialist and a planner.
- **Do the tests yourself.** The owner does not want task lists handed to them. Run tests, report results with evidence.
- Server-side steps on NLVDC01 are run by the owner over RDP: the qodbctask account has no WinRM, admin-share or SQL sysadmin rights there. Give exact commands when that is needed.

## 3. Current installation

- **Server:** NLVDC01 (10.50.38.5, domain controller, Windows Server 2012 R2). Install folder `G:\NLINE_ERP` (share `\\NLVDC01\NLINE_ERP`, mapped as O: on the qodbctask PC). Source clone in `G:\NLINE_ERP\src`.
- **Database:** SQL Server Express 2012, instance `localhost\VJS` (the same instance as Jobshop's NLINE_VJS and the QuickBooks mirror QBLocal). Databases `nline` (live, empty, untouched) and `nline_test` (trials). Collation Latin1_General_100_CS_AS, snapshot isolation on. Express limits: 10 GB per database, about 1.4 GB memory, 4 cores; 2012 is out of support, so plan an upgrade.
- **Runs as** `N-LINEVALVES\svc_nline` via scheduled tasks "NLINE ERP Server" (waitress, port 8000, firewall open to 10.50.38.0/24) and "NLINE ERP Cron". Users open http://nlvdc01:8000/.
- **Scripts** in `G:\NLINE_ERP`:

  | Script | Purpose |
  |---|---|
  | `install_nline_erp.ps1` | Install or update |
  | `create_database.py` | Create a database; `--owner`, `--name` |
  | `init_database.ps1` | Initialise a database; `-Database` |
  | `start_nline_erp.bat`, `start_nline_cron.bat` | Start the server and cron |
  | `setup_service.ps1` | Create the scheduled tasks |
  | `stop_nline_erp.ps1` | Stop, or `-Restart` |
  | `setup_us_tests.ps1` / `.py` | Build the nline_test test company (below) |
  | `README.md` | Install and update steps |

- **Windows gotchas:**
  - Set `TZ=UTC` and `TRYTOND_TZ=America/Chicago` before Python starts.
  - `trytond-admin` and `trytond-cron` have no .exe; run them as `venv\Scripts\python.exe venv\Scripts\trytond-admin ...`.
  - Stopping the scheduled task leaves Python running; use `stop_nline_erp.ps1`.
  - Python 3.12 at `C:\Program Files\Python312` is a robocopy of a per-user install, because MSI installs are blocked on the domain controller.
- **Fork contents:**
  - Tryton 7.0 LTS plus a custom `mssql` backend (about 3,087 lines; validated with `windows\validate_sqlserver.py`).
  - N-Line US modules, all only in this fork:
    - `account_us`: chart `account_us.nline`, converted from QuickBooks;
    - `account_tax_us`: Texas Comptroller rate import and `us_sales_tax` rules;
    - `account_us_1099`;
    - `account_payment_nacha`: Chase ACH;
    - `account_payroll_paychex`.
  - The web client (sao) is built and served by waitress.
- **nline_test setup** (`setup_us_tests.ps1 -Origin <city> [-RatesFile <path>]`):
  - Activates account_statement_ofx, account_statement_rule, account_deposit, sale_advance_payment, account_dunning_letter and account_tax_cash.
  - Creates company "N-Line Valves (TEST)", fiscal year 2026 with four strict sequences (INV26-, CM26-, BILL26-, VC26-), payment terms incl. 2% 10 Net 30, journals "Chase 9807 Operating" (1004) and "Chase 9773 Receiving" (1003), Texas tax (account 2010), and a dunning procedure.
  - Adds TEST customers (Houston TX, Tulsa OK, Exempt TX), TEST vendors (ACH, 2% 10 Net 30) and TEST items.
  - It is not run on the server yet; the tests below ran locally.

## 4. How N-Line works today (the behavior to reproduce)

Figures are from read-only queries of NLINE_VJS (Jobshop) and QBLocal (QuickBooks mirror), 12 months to 23 Oct 2026.

### Order types (keep meaning and numbering)

| Order | Numbering | Last 12 months | Meaning |
|---|---|---|---|
| Sales work order | `WO-yyNNNN-NN` from the sales order and line (digits can differ: WO-261327-02 is on sales order 26-1367) | 76 (74 tied to a sales line, 16 with legs) | Builds the valve or kit a customer ordered |
| Job | numeric, 8564 and up (continue from the last, about 8779) | 214 (81 of 108 received fed sales work orders, up to 3 each) | Makes one component into stock for several sales lines |
| Cost order | the sales order number (26-1368), one lot per sales line | 62 | Carries freight, crating, documentation, certificates and tests. Records no cost in Jobshop today; costs arrive as QuickBooks bills |

### Work order structure rules

- **Engineering masters stay single-level** to match PV (the PDM). Multi-level structure is built on the order by hand: the planner turns a material card into a **leg** by dragging a master onto it. Legs are identified in Jobshop by SUB_ID. A leg copies the operations of that part's master at the card's pinned revision. Leg parts are never received into inventory; only leg 0 is.
- **Leg rule:** sales work order legs are for 332-series parts (body subassembly, actuator) as a *working rule*, **not a system check**. Planners can make a leg from any engineering BOM; last year there were also legs on cores, retainers, sleeves, heads and a plug.
- **Jobs consolidate** the need for one component across several sales lines, and finish their component with as many legs as needed, at any depth. **No sub-jobs:** a Job's output never feeds another Job.
- Jobshop's Fabricated and Purchased checkboxes are material-planning flags (many parts have both); they map to Tryton's Producible and Purchasable.
- Example: WO-261341-02 has 6 legs built on cards, 2 nested under leg 3. Leg 3's eight operations match the Rev B master of 323-02275.

### Engineering data (Jobshop fields to add to Tryton)

| Jobshop field | Use | Tryton addition |
|---|---|---|
| Master ENG_ID (A, B, C…) | 13,683 part revisions; 2,710 parts have 2 or more | Revision code on the BOM |
| Part ENG_ID (current revision) | Set on 9,180 parts | Current revision on the product (sets the BOM list order) |
| Material card SUBORD_ENG_ID (pinned revision) | 16,750 cards; 191 pin a non-current revision | Component revision on each BOM line (empty = current) |
| Material card SEQ_NO, PIECE_NO | Every card; 96% at operation 10 | Operation and piece number on each BOM line |
| Drawing ID and revision | On 13,516 of 14,179 masters and 14,686 parts | Drawing number and revision on product and BOM |

Not used (0 of 96,004 cards): scrap percent, fixed quantity, phantom, auto-issue, effective dates.

### Operations

- **Internal operation:** done on N-Line's own machines (machining, assembly, test).
- **External operation:** done by an outside vendor (outside machining, heat treat, coating, inspection). **These are the most common.** In Jobshop, a purchase links to an operation (341 links; 457 service operations mid-routing) or to a material card for buying a part for the job (380 links).
- **Labor:** none recorded (no labor tickets since March 2023). The owner's decision of 26 Oct 2026: **a job's cost must be material + operations (internal and external), rolled up through any number of legs.** Internal operation cost = planned hours × work-center rate, since time isn't tracked. Actual hours can replace planned later without rework.
- Open WIP in Jobshop on 23 Oct 2026: $466,295.
- 76 parts are both bought and made: $336,340 of work-order completions and $114,914 of PO receipts last year. 51 parts are used in builds and also sold as spares.

### Accounting practice (QuickBooks today)

- **Accrual basis** already.
- **Back-dating is normal:** 142 of the last 230 customer invoices were dated before an invoice already entered, by up to 124 days. Not yet measured: how many cross into an earlier month versus earlier within the same month (it decides the numbering approach, section 6.2).
- **Sales tax:** customers are mostly out of state or exempt/resale; QuickBooks invoices currently charge no tax. Texas taxes freight on a taxable sale, so freight should be taxable when the sale is.
- **Use tax:** not self-assessed. Vendors charge Texas tax on their bills (QuickBooks account 51800); one $52 Comptroller payment.
- **Chase bank data comes through Plaid**, not file downloads:
  - QBLocal tables Chase_9807, Chase_9773, Chase_1275, Chase_9807_Plaid and Chase_SyncLog (17,967 syncs, 28 Oct 2025 to 17 Jun 2026, **none since 17 Jun**, cause not investigated).
  - Accounts: 9807 operating, 9773 receiving, 1275.
  - The existing Plaid sync is Python and could be ported.
- **The owner rates as disadvantages:** no full customer statement (all activity with a running balance), and no field-level change log (rated a big disadvantage).
- Early-pay discounts: 2% 10 Net 30 from some vendors, about 7 bills a year.

## 5. Test results so far

### Tryton 7.0 US-practice tests

Run 24 Oct 2026, locally on the same code with an SQLite test database, via proteus. Script: `O:\us_tests\run_us_tests.py`; results `O:\us_tests\results.json`; files `chase_test_oct2026.qfx` (synthetic) and `dunning_letter.odt`.

Totals: 13 Pass, 4 Fail, 1 Needs decision.

| ID | Test | Result | Notes |
|---|---|---|---|
| ST-1 | Taxable Texas sale | Pass | $2,500 Houston = $206.25 (8.25%) |
| ST-2 | Out-of-state sale | Pass | No tax |
| ST-3 | Exempt / resale customer | Pass | Exemption rule; no field for the certificate |
| ST-4 | Freight on a taxable sale | Pass | Set the freight category taxable: $218.62 on $2,650 (CPA to confirm) |
| ST-5 | Use tax | Pass | Not used |
| ST-6 | Tax by jurisdiction | Pass | Recorded per Texas jurisdiction; no return form |
| ST-7 | Half-cent rounding | **Fail** | $165.62 instead of $165.63; half-to-even, not configurable |
| CB-1 | Cash basis | Pass | N-Line is accrual |
| BK-1 | OFX import | Pass | Chase-style OFX file |
| BK-2 | Chase feed | **Needs decision** | No Plaid or live feed; port the Plaid sync |
| BK-3 | Match and close a statement | Pass | |
| STM-1 | Customer statement | **Fail** | Past-due (dunning) letter only |
| DS-1 | 2% 10 discount | Pass | Write-off on the pay screen posts to 7060 |
| CR-1 | Fix a posted bill | Pass | Edit refused; credit cancels the bill |
| CR-2 | Fix a posted invoice | Pass | Credit note, no numbering gaps |
| CR-3 | Close a month | Pass | Posting into a closed month refused; can reopen |
| CR-4 | Change log | **Fail** | Created, written, validated and posted by whom and when only |
| CR-5 | Back-dated customer invoice | **Fail (blocker)** | Refused once a later-dated invoice in the same sequence is numbered |

### Apache OFBiz 24.09.07 (comparison system)

Tested 25 Oct 2026. Report: `N:\reports\OFBiz fit check\OFBiz fit check.md`; screenshots in `N:\reports\OFBiz fit check\screens\`.

- **Strengths:** WIP worked out of the box: material and operation costs into WIP 142000, out to finished goods, $0 net, body $650 rolled into a valve at $1,640. Back-dating allowed; half-up rounding; per-jurisdiction tax.
- **Fails:** customer statements, OFX and Plaid, discount write-off (posts nothing), change log (off for accounting), outside operations (label only), graphical work order.
- **Concerns:** Java, and SQL Server untested.
- Kept Tryton because of Python and database neutrality, SQL Server already running, and the US modules already in the fork.

Related research is in N:\ (nlvrdp01's C:\N-Line_BI):
- `N:\reports\Tryton WIP stock accounting.md`: deep research confirming Tryton's single stock-in/out account per category since 5.6 (issue7273, "Use only 3 stock accounts").
- `N:\reports\Other open source ERP candidates.md`: the candidate sweep.

## 6. Backend work: core revisions (owner asked for difficulty; estimates only)

Code locations are in this repo, `modules\...`. Line numbers are for the current `us-mssql` checkout.

### 6.1 WIP accounting with operation costs and leg roll-up (about 3–3½ weeks incl. outside operations)

- **Where the account is chosen:** `account_stock_continental/stock.py` (178 lines), method `Move._get_account_stock_move_lines(type_)` at line 14.
  - It uses `product.account_stock_in_used` for `in_*` types and `account_stock_out_used` for `out_*`.
  - `_get_account_stock_move_type()` (line 69) already returns `'out_production'` (storage→production) and `'in_production'` (production→storage), at lines 90–93.
  - A (production→production) move gets no type and so posts nothing, which is correct for leg output passed straight into its parent.
- **Change 1, the WIP switch (about 3 days):** an extension module (PoolMeta) overrides `_get_account_stock_move_lines` so `out_production` debits a WIP account and `in_production` credits it. Add a WIP account field on the account category or the company account configuration.
- **Change 2, internal operation cost (about 1 week):**
  - Tryton adds operation cost into the produced item's cost (`production_work/production.py` `get_cost`, line 32: material plus `work.cost`), but **nothing posts it to the GL**.
  - With only Change 1, WIP would be credited for operation cost it was never debited for.
  - Fix: when a work (operation) is finished, post debit WIP / credit "Applied shop cost", using planned hours × work-center rate. With no time tracking, auto-fill the cycle duration from the routing step. Later actual hours use the same posting.
- **Change 3, external operations per operation (about 1–1½ weeks + 2 days):**
  - Standard `production_outsourcing` (`production.py`, 246 lines) outsources a **whole production per routing** (supplier and service on the routing). It creates a PO on `wait()` and adds `purchase_lines` amounts into `get_cost`.
  - N-Line needs **per-operation** outside services. Add supplier, service product and lead days to routing steps, and create one PO line per outside operation linked to the production via the module's existing `purchase_lines` link.
  - Point the outside-services account category's expense account at WIP (configuration), so the vendor bill debits WIP.
  - Adjust the cost to use the posted bill amount when present, so WIP clears exactly when the bill differs from the PO.
  - A work with an outside service shows its PO and expected date, and can be marked finished on receipt.
  - The redesign spec called this module `nline_outside_service`.
- **Roll-up through legs:**
  - Each leg is a child production. Its output is valued at material + operations, and the parent consumes it at that value, at any depth.
  - Write scenario tests: a valve with two levels of legs, mixed internal and external operations. Prove parent cost = all materials + all operations, and that WIP nets to $0.
- **Costing method:** average or FIFO for made parts. Fixed/standard cost would need a variance posting.
- **Alternatives considered:**
  - A month-end WIP reclass journal (no code, manual, correct only at month end).
  - Porting NaN-tic's `account_stock_continental_location` (no 7.0 branch, third-party).
  - Owner's latest direction: real-time WIP like OFBiz.

### 6.2 Back-dated customer invoices (about 1 day)

- The check is in `account_invoice/invoice.py`, in the numbering method, around lines 1220–1235. After `get_next_number()`, for `type == 'out'` it searches the same sequence for an invoice with a later `invoice_date` and raises `InvoiceNumberError` (`msg_invoice_number_after`).
- It is in the middle of a long method, so the cleanest fix is a **direct patch in the fork** (delete or flag-guard about 15 lines). No upstream test asserts it.
- **No-code alternative:** per-period invoice sequences (`account.fiscalyear.invoice_sequence` has a `period` field). Each month gets its own series, so back-dating into an earlier month works; within the same month it is still refused. Numbers become like INV2610-0001. Measure the QuickBooks split first (section 4).

### 6.3 Half-cent rounding (1–2 days)

- `currency/currency.py`, `Currency.round(amount, rounding=decimal.ROUND_HALF_EVEN, opposite=False)` at line 160.
- An extension override defaulting to `ROUND_HALF_UP` is about 10 lines but affects about 216 call sites.
- The only explicit caller is `account/tax.py:1268` (`opposite=True`), and the opposites map already handles HALF_UP.
- Run the full test suites. Impact is at most 1¢, and only on exact half cents.

### 6.4 Other accounting gaps (add-ons, no posting changes)

- **Change log (about 1 week):** Tryton's built-in record history (`_history = True`, `trytond/model/modelsql.py` line 280) keeps every saved version. Turn it on for account.invoice, invoice lines, account.move and lines, and payments. Add a "what changed" report (old and new values, who, when).
- **Customer statement (1–2 weeks):** a read-only report with all activity, a running balance and aging per customer, emailed or printed.
- **Chase bank feed (1–3 weeks):** port the existing Python Plaid sync to create `account.statement` lines; matching and posting stay standard. OFX import already works as a fallback. Also investigate why the Plaid sync stopped on 17 Jun 2026.
- **Check printing:** Tryton has none. Needs a check template (amount in words, payee and address, MICR layout per the bank stock); the redesign spec called it `nline_check_print`.
- **Exempt certificates:** add a certificate number and expiry on the party/tax rule.
- **Texas return:** a quarterly report from per-jurisdiction tax lines.

### Estimate summary (owner asked, not yet approved)

| Piece | Effort |
|---|---|
| WIP switch | ~3 days |
| Internal operation posting | ~1 week |
| Per-operation outside services + bill-amount correction | ~1½ weeks |
| Leg roll-up scenario tests | ~3 days |
| Back-dating patch + rounding override | ~2–3 days |
| **Core total** | **about 4 weeks** |
| Statement, change log, Plaid, checks | about 4–7 weeks more |

## 7. Backend work: manufacturing structure (from the 23 Oct redesign spec)

Seven N-Line modules, in build order:

| # | Module | Adds | Size |
|---|---|---|---|
| 1 | nline_engineering | BOM revision code, current revision on product, pinned component revision, operation and piece on BOM lines, drawing number and revision | Small |
| 2 | nline_work_order | Material cards (a record beside the standard input move, pointing to it), *Make as leg* / *Remove leg*, parent and leg numbering (WO-261341-02/1, /2…), release and finish passed down to legs, staging of finished legs | Large |
| 3 | nline_outside_service | Per-operation service purchase (see 6.1, Change 3); *Create purchase* on a card with direct-PO supply | Medium |
| 4 | nline_job | *Create Job* wizard, coverage links from Jobs to cards and sales lines, no-sub-job checks, Job numbering | Medium |
| 5 | nline_build_tree | Build tree screen and printed traveler (every leg, operation and card in Jobshop order) | Medium |
| 6 | nline_sales_cost | Cost order per sales order: an analytic account created on sale confirmation, and a sales order cost view (supplier bills, cost of goods shipped, revenue, margin) | Small |
| 7 | nline_check_print | Printed supplier checks | Small |

Dependencies: 1 and 7 can start at once; 2 depends on 1; 3, 4 and 5 depend on 2; 6 depends only on the analytic modules.

Standard modules to switch on in nline_test first: production, production_routing, production_work, production_outsourcing, production_split, sale_supply_production, analytic_account, analytic_sale, analytic_purchase, analytic_invoice, account_deposit, account_statement_ofx, account_statement_rule.

How the pieces work:
- **Sales work order:**
  - Confirming a sales line for a valve set to *supply on sale* creates a production request (standard sale_supply_production) whose origin is the line.
  - The planner picks the BOM revision (default: current), and the request becomes WO-yyNNNN-NN.
  - One material card is created per BOM line, carrying operation, piece, quantity and pinned revision.
- **Make as leg:**
  - On a card for a fabricated part, the planner picks a revision (pinned one preselected). A child production is created for the card's quantity, numbered under the parent, with the card as origin.
  - Releasing the parent releases its legs, each with works from its own routing.
  - The redesign planned leg output to a staging location, issued straight to the parent card. Reconsider passing it directly production→production so it stays in WIP (6.1).
  - The parent can't finish until every leg is done.
- **Job:**
  - The *Create Job* wizard lists every open uncovered need for a part: cards on open sales work orders set to Job supply, sales lines, and shortfall below the order point.
  - The planner ticks needs, adds extra quantity and picks the revision; one Job is created for the total.
  - Coverage links show on each card which Job supplies it.
  - The finished Job goes to stock, and cards are filled from stock.
  - Automatic proposals (stock_supply_production) stay off at first.
- **Works (operation cards):** standard production_work, plus the Jobshop operation number (10, 20…), instructions text, a begin-traceability flag and the outside service.

Redesign open questions still unanswered:
- Keep the WO-yyNNNN-NN format exactly?
- Is the sales order cost view the right content?
- Is a *Make as leg* button acceptable, or is drag-and-drop required? The answer is now drag-and-drop, see section 8.

## 8. Front end: Jobshop-like work order UI

What Jobshop's work order "Details" tab is:
- A graphical card view: diagonal stacks of operation cards, material cards on them, and legs branching off, colored by status.
- It is also the editing surface: users **drag engineering masters onto material cards** to add legs.
- The owner called it "very intuitive" and considers it a key requirement. Screenshots of it were shared in the earlier conversation; ask the owner for them again.

Tryton's web client (sao) shows forms, lists and trees only; it cannot drag onto cards. Approach agreed in principle:
- **Build a custom web front end over Tryton**, keeping every stock and accounting action in Tryton through its JSON-RPC API (or proteus server-side).
- A natural fit is N-Line's existing Python stack (FastAPI on nlvrdp01) plus a JavaScript canvas or SVG card view. Decide hosting: the ERP runs on NLVDC01, and nothing for the ERP may depend on nlvrdp01.
- Views:
  - The **card view** of a work order and its legs, with status colors.
  - A **master/BOM browser** panel to drag from.
  - **Drop a master onto a card** = *Make as leg* with a revision picker.
  - The **build tree** (expand and collapse) per sales line, with shortages flagged and coverage by Jobs.
  - **Printed traveler** with every leg, operation and card.
- The redesign spec's build tree mock-up and the Jobshop WO screenshot are the visual references.

## 9. Front end: QuickBooks-like accounting data entry

Daily QuickBooks screens to reproduce (validate the list with the accounts specialist):
- **Write Checks:** looks like a paper check, with an expense/item grid underneath.
- **Enter Bills, Pay Bills:** select open bills, discount, bank account, check or ACH.
- **Create Invoices, Receive Payments:** apply to open invoices, deposit to undeposited funds or a bank account.
- **Make Deposits, check register, Reconcile.**
- **Customer and vendor centers** with transaction history; **statements**.

Approach:
- Same as section 8: a custom UI layer that calls standard Tryton services (account.invoice, account.payment and the payment wizards, account.statement, reconciliation). No posting logic in the UI.
- SlowBooks Pro 2026 (QuickBooks 2003-style, source-available, one main developer) is a **screen reference only**.
- Payments: ACH through the fork's `account_payment_nacha` (Chase); checks through the new check print.

## 10. Decisions log

- 23 Oct: installed on NLVDC01 (not nlvrdp01), database on the VJS instance.
- 23 Oct: Tryton rejected for the WIP limitation; ERPNext, metasfresh, iDempiere, Axelor, Odoo looked at and rejected (ERPNext: no graphical work-order builder, weak tree views, MariaDB/Linux only; Odoo excluded).
- 24 Oct: strategy shifted to "a pedigreed open-source accounting engine plus a Jobshop clone plus QuickBooks-style screens". LedgerSMB was considered (US-native, but Perl and PostgreSQL only; porting to SQL Server ruled out). SlowBooks is reference-only.
- 24 Oct: US-practice tests on Tryton (results in section 5).
- 24 Oct: wider sweep. Only Apache OFBiz passed the hard rules. Rejected:
  - xTuple (free edition discontinued 2019);
  - Dolibarr (no stock or WIP posting to the GL);
  - Carbon and qcadoo (open-core);
  - Aureus ERP (no inventory GL);
  - Openbravo and Compiere (dead).
- 25 Oct: OFBiz hands-on test (section 5).
- 26 Oct: owner asked how hard Tryton core revisions are and set job-cost requirements: material + internal and external operations rolled up through legs, external operations most common. **This handoff assumes development continues on the Tryton fork.**

## 11. Suggested first steps for the new session

1. Confirm with the owner:
   - which core revisions are approved: WIP (6.1), back-dating patch versus monthly sequences (6.2), rounding (6.3);
   - average versus FIFO costing;
   - the work-center rates to use;
   - the UI hosting choice.
2. Measure the back-dating split (earlier month versus same month) from QBLocal.
3. Set up a local dev and test loop:
   - Python 3.12 64-bit venv with this fork, SQLite in-memory databases, proteus scenario scripts.
   - The earlier test harness is `O:\us_tests\run_us_tests.py`; the 64-bit Python used was `C:\Users\qodbctask\AppData\Local\Python\pythoncore-3.12-64`.
   - The default `python` on the qodbctask PC is 32-bit 3.13 and can't install some wheels.
4. Build in this order:
   - **nline_engineering**;
   - the **WIP switch, internal-operation posting and per-operation outside services**, with leg roll-up scenario tests (match OFBiz's result: WIP nets to $0, full cost rolls up);
   - **nline_work_order** (legs);
   - **nline_job**;
   - then the UI layers.
5. Re-run the 18 US-practice tests after each core change, and add tests for statements and the change log.
6. Deploy to `nline_test` on NLVDC01 (owner runs the server commands over RDP); hands-on walkthroughs with the accounts specialist and a planner before go-live.

## 12. Reference files

| What | Where |
|---|---|
| Install and update steps | `G:\NLINE_ERP\README.md` (O:\README.md) |
| Upstream Windows guide | `G:\NLINE_ERP\src\windows\INSTALL_WINDOWS.md` |
| US test harness, results | `O:\us_tests\` |
| OFBiz fit check, screenshots, test component | `N:\reports\OFBiz fit check\` |
| Tryton WIP research | `N:\reports\Tryton WIP stock accounting.md`, `N:\research_notes\Tryton WIP stock accounting\` |
| Open-source ERP sweep | `N:\reports\Other open source ERP candidates.md` |
| Claude Docs (earlier account; may not be visible from another account) | Redesign spec https://claude.ai/artifact/3TNi2jU6BFodbZxyHEBbBQ · US tests https://claude.ai/artifact/9YD4iFmJf9PT4yARThVsgo · Jobshop fit-gap https://claude.ai/artifact/7UtkLfHfWe74pyBPwUCn1h |
| Jobshop database | NLINE_VJS on NLVDC01\VJS (read-only queries) |
| QuickBooks mirror | QBLocal on NLVDC01\VJS (incl. Chase/Plaid tables) |
