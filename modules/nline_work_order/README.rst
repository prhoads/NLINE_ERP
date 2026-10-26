########################
N-Line Work Order Module
########################

The *N-Line Work Order Module* reproduces the work order structure of
Jobshop on the standard productions:

- a production made for a sales line is numbered like the Jobshop sales work
  order: WO-<sales order digits>-<line position> (WO-261367-02 for the second
  line of sales order 26-1367); the number can be changed while the
  production is a request or a draft;
- each input gets a *material card* (the origin of the input move) with the
  operation, the piece and the pinned revision of its BOM line;
- *Make Leg* on the card of a producible component creates a leg: a child
  production of the card quantity from the chosen revision (the pinned one is
  proposed), numbered after the work order (WO-261367-02/1, /2...) at any
  depth. The leg output goes to the production WIP location of the warehouse
  and supplies the card at its cost (see the N-Line WIP module);
- *Remove Leg* deletes a leg not yet released and supplies the card from
  stock again;
- releasing (wait) or cancelling a production does the same to its legs, and
  a production can not be done before its legs.

The engineering masters stay single-level: the structure is built on the order
by the planner.
