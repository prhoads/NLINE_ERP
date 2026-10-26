########################
N-Line Build Tree Module
########################

The *N-Line Build Tree Module* shows the structure of the work orders:

- the *Build Tree* menu lists the open work orders and Jobs with their legs
  as an expandable tree, flagging the orders with a short material;
- a material card supplied from stock (or by a Job) is *short* when the
  warehouse does not hold its quantity yet;
- the *Traveler* report prints every leg, operation and card in Jobshop
  order: each operation followed by the cards used at it and each leg under
  the card it supplies, with the work center or the outside supplier, the
  purchase and its expected date;
- ``production.get_build_tree`` returns the same tree as data for the
  graphical work order screen.
