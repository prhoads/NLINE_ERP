# Moving N-Line's data into the ERP (proposal)

Tool: `nline_migrate.py` in this folder. It reads VISUAL Jobshop (`NLINE_VJS`)
and the QuickBooks mirror (`QBLocal`) on `NLVDC01\VJS`, read-only, and writes
through Tryton, so every rule of the ERP applies. It can be run again: what is
already there is kept, not duplicated.

    # test data (what the screens are tested with today)
    python nline_migrate.py --config <trytond.conf> --database nline_test --mode sample
    # the real move, at go-live
    python nline_migrate.py --config <trytond.conf> --database nline --mode full --cutoff 2021-01-01

## Proposal

### 1. Cutoff: 1 January 2021

About five years back, on a fiscal-year start, so every year in the ERP is
complete (2021–2025 plus 2026 to date) and year-over-year reports compare whole
years. Anything dated before it stays in Jobshop and QuickBooks (section 5).

### 2. Masters: everything still in use

| What | From | Rule |
|---|---|---|
| Customers, suppliers | Jobshop + QuickBooks | active, or used since the cutoff; matched by name across both systems |
| Parts | Jobshop `INVENTORY_PART` | active, or used since the cutoff |
| Engineering masters (BOM + routing) | `ENGINEERING_MASTER / MATERIAL / OPERATION` | every revision of those parts; the part's current revision first; pinned component revisions kept |
| Shop resources | `SHOPFLOOR_SHOP_RESOURCE` | active; hourly rate = run + burden per hour |
| Outside services | `PURCHASING_SERVICE` | the ones used by routings or purchase orders |
| Chart of accounts | already in the ERP (converted from QuickBooks) | QuickBooks names map to it by full path (`Bank Service Charges:TRANSACTION FEE`) |

### 3. The position on go-live day (live documents)

These become normal ERP documents that people keep working on:

- **Open work orders** with their material and operations, released ones released.
  Their Jobshop legs (`SUB_ID` > 0, fed through `SUBORD_SUB_ID`) become legs
  of the order, made from the master of the leg part and numbered as in Jobshop
  (`<work order>/<SUB_ID>`); a purchased part Jobshop pulled in as a leg stays
  supplied from stock.
- **Open sales orders** (remaining quantities) and **open purchase orders**.
- **Inventory on hand** per part and location, at Jobshop's cost (one stock count).
- **WIP**: the issued material and posted operations of the open work orders
  (Jobshop showed $466,295 on 23 Oct 2026), so job costs continue.
- **Open AR and AP** item by item (each unpaid invoice and bill with its due date).
- **GL balances** at go-live from QuickBooks (trial balance), checked to the cent.

### 4. History since the cutoff (read-only in the ERP)

Closed orders are history, not work: re-playing five years of closed work
orders, receipts and shipments through the ERP would re-create five years of
stock moves and postings that QuickBooks already holds, and every difference
would have to be explained. Instead:

- **Accounting**: one journal entry per month per account (QuickBooks' net
  activity), so monthly and yearly reports and comparisons work from 2021 on.
  The detail of a month stays one click away in QuickBooks (section 5).
- **Operations**: a history store in the ERP (a small module, `nline_history`)
  with the closed sales, purchase and work-order lines since the cutoff: date,
  order, customer / supplier, part, revision, quantity, price, actual cost.
  It feeds the part, customer and supplier screens (last price paid, cost
  history, what a customer bought, how long a job really took) and the
  reports, without touching stock or the books.

### 5. Older data: the Jobshop and QuickBooks archive

- `NLINE_VJS` stays on `NLVDC01\VJS` and is set **read-only** at go-live
  (`ALTER DATABASE NLINE_VJS SET READ_ONLY`), so it can never drift.
- An **Archive** screen in the ERP searches it by part, customer, supplier or
  order number and shows the Jobshop record (order, lines, work order card,
  receipts) through a read-only SQL login. No VISUAL licence is needed to look
  something up; one PC can keep VISUAL installed for the rare full screen.
- The QuickBooks company file is kept (read-only use) and `QBLocal` keeps its
  copy, for transaction detail before the cutoff.

### 6. How the move is checked

The tool prints what it made; after a full run a check report compares, per
area, the ERP to the sources: number of parts and masters, BOM lines per
master, open order lines and remaining quantities, inventory value, WIP value,
AR and AP totals per party, trial balance per account. Go-live waits for
every line to match.

### 7. Order of work

1. Now: sample data in `nline_test` (done with `--mode sample`) to finish the screens.
2. Masters in full into `nline_test`; people check parts and masters in the ERP.
3. `nline_history` and the Archive screen.
4. Dress rehearsal: full move into a copy, check report, timing.
5. Go-live weekend: stop Jobshop and QuickBooks entry, full move into `nline`,
   check report, set `NLINE_VJS` read-only.

## What the sample brings (`--mode sample`)

- the open work orders, sales and purchase orders created in the last year
- every part they use, down all levels of the current masters, with the
  masters (BOM + routing), suppliers and customers
- this year's unpaid QuickBooks bills and invoices, and the last 90 days of
  Chase 9807 checks (with their real check numbers)
- the desk settings the screens need (undeposited funds, the Desk journal,
  Customer Receipts and Chase 9807 Checks, next check number from QuickBooks)
