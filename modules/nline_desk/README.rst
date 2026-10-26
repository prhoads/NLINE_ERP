##################
N-Line Desk Module
##################

The *N-Line Desk Module* gives N-Line's staff the screens they know from
Jobshop and QuickBooks, as a web page served by the Tryton server itself at
``http://<server>:8000/desk/`` (same sign-in as the Tryton web client; nothing
runs on another server).

Screens:

- *Work Orders*: the Jobshop-like card view of a work order or Job. The
  operations are a diagonal stack of cards with the material cards used at
  each operation underneath; a leg branches off the card it supplies, at any
  depth; colors show the state, a red outline a short material. Dragging a
  revision of an engineering master from the left panel onto a material card
  of the same part makes the card a leg (the revision can be changed in the
  confirmation); a leg not released yet can be removed. *Release* releases
  the order with its legs and *Traveler* prints the traveler.
- *Enter Bills*, *Pay Bills* (open bills by due date with the early pay
  discount available, by check or ACH), *Write Checks* (a paper check with
  the amount in words, the payee address and the expense lines, with the cost
  order of each line), *Create Invoices*, *Receive Payments* (applied to open
  invoices into undeposited funds), *Make Deposits*, the *Check Register* of
  each bank account and the *Customer* and *Vendor Centers*.

The screens hold no posting logic: they call the ``nline.desk`` model whose
services create and post standard Tryton documents:

- a bill or an invoice is a posted ``account.invoice``;
- a check or an ACH payment is an ``account.payment`` of a payment journal with
  the *Check* (N-Line Check Print) or *Nacha* method, processed in a group and,
  for checks, succeeded at once: its clearing move credits the clearing account
  of the bank (outstanding checks) until the bank statement clears it;
- an early pay discount is a posted move from the payable to the *Early Pay
  Discount Account*, reconciled with the bill and its payment;
- a customer payment is a receivable ``account.payment`` whose clearing
  account is *Undeposited Funds*; a deposit moves the chosen receipts to the
  clearing account of the bank (deposit in transit) until the statement
  clears it;
- a write check is a posted bill paid by one check, so the 1099 and vendor
  history see it like any other payment.

Configuration (Accounting > Configuration > Desk): the early pay discount,
sales discount and undeposited funds accounts and the journal of the discount
and deposit entries. Each bank has a payment journal with the *Check* method,
its check sequence, its clearing account and journal and its *Bank GL
Account*; customer receipts use a *Manual* payment journal whose clearing
account is undeposited funds. Payment terms have an early pay discount rate
and days (2% 10 Net 30).

A Tryton warning (a back-dated invoice for example) is shown on the screen;
when the user continues, the service is called again with
``accept_warnings``.
