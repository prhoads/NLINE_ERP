#################
N-Line WIP Module
#################

The *N-Line WIP Module* posts productions through a work in progress account
in real time, as N-Line's job cost is material plus operations rolled up
through any number of legs:

- the components issued to a production (storage to production) debit the
  *Production WIP Account* of the accounting configuration instead of the
  stock out account of the product;
- the goods produced (production to storage) credit the WIP account at their
  production cost instead of the stock in account;
- each finished work cycle with a cost (hours by work center rate) debits WIP
  and credits the *Production Applied Cost Account*;
- the output of a leg goes to the *Production WIP* location of the warehouse
  (a production location inside the warehouse), so it is not received into
  stock and is not posted. The parent input linked to it by *WIP Source* is
  done when the leg is done and is valued at the leg's cost, so the cost rolls
  up at any depth. A production can not be done before the legs supplying it.

The routing steps have a setup time and a run time per unit. Each work gets
the planned duration (setup plus run time by quantity) and the *Finish* button
records a cycle of that duration when no time was recorded. Actual times can
be recorded with the standard cycles instead.

Without a WIP account configured the standard postings are kept.
