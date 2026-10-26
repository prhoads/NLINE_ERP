#############################
N-Line Outside Service Module
#############################

The *N-Line Outside Service Module* buys outside operations (outside
machining, heat treat, coating, inspection) per routing step instead of per
production as the standard outsourcing does:

- a routing step gets a supplier, a service and a service quantity per unit of
  the BOM output;
- when a production is waiting, one purchase line is created for each work of
  an outside step, grouped by supplier into draft purchases, linked to the
  production so its amount is added to the production cost;
- the work shows the supplier, the purchase and the expected date, and the
  *Receive* button finishes it when the goods come back (no time is charged);
- the supplier bill of such a line debits the *Production WIP Account*;
- once the quantity is billed on posted bills, the production cost uses the
  bill amount instead of the purchase amount, so WIP clears exactly;
- a bill posted after the production is done posts its difference with the
  cost included from WIP to the *Production Variance Account*.
