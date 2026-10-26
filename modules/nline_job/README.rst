#################
N-Line Job Module
#################

The *N-Line Job Module* adds the Jobs of Jobshop: a production that makes one
component into stock for several needs.

- Jobs are numbered with their own sequence, from 8780 (continuing Jobshop's
  numbers); their legs are numbered after them (8780/1...).
- The *Create Job* wizard lists every open need of a part not covered yet:
  the material cards of open work orders supplied from stock, the sale lines
  and the shortfall below the order point. The planner checks the needs, adds
  an extra quantity and picks the revision; one Job is created for the total.
- The coverage links show on each card and sale line which Job supplies it;
  the finished Job goes to stock and the cards are filled from stock.
- There are no sub-jobs: a card of a Job (or of its legs) can not be covered
  by another Job. A Job finishes its component with legs instead.
