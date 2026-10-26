#########################
N-Line Engineering Module
#########################

The *N-Line Engineering Module* adds the engineering data of Jobshop to the
products and bills of material:

- the revision code of each BOM (Jobshop master ENG_ID) and the current
  revision of the product (part ENG_ID), whose BOM is listed first and so is
  the one used by default;
- the operation, the piece number and the pinned component revision of each
  BOM input (material card SEQ_NO, PIECE_NO and SUBORD_ENG_ID), an empty
  revision meaning the current revision of the component;
- the drawing number and revision on the products and the BOMs.

The masters stay single-level: the structure of an order is built on the order
by making legs from the components.
