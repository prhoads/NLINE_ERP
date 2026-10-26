########################
N-Line Sales Cost Module
########################

The *N-Line Sales Cost Module* replaces the cost orders of Jobshop (numbered
like the sales order, carrying freight, crating, documentation, certificates
and tests) with an analytic account per sales order:

- when a sale is confirmed, an analytic account named after the sales order
  number (26-1368) is created under the *Cost Order Root* of the sale
  configuration and set on the sale lines, so the customer invoices carry it;
- the supplier bills (or purchase lines) for the order's freight, crating,
  certificates and tests are charged to that analytic account;
- the sale shows its revenue (posted customer invoices), the cost of the goods
  shipped, the supplier bills charged to it, the margin and the margin rate;
  the *Sales Order Costs* report lists them for all orders.
