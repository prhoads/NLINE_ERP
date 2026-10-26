#####################
N-Line Account Module
#####################

The *N-Line Account Module* adds accounting conveniences N-Line needs without
changing any posting:

- reopening a closed period also reopens its journal-periods (standard Tryton
  closes them with the period but leaves them closed on reopening, so no entry
  could be posted in the reopened month);
- the sales tax exemption or resale certificate of a customer (type, number,
  state, date and expiry), with a warning when an invoice without tax is
  posted for a customer whose certificate is missing or expired;
- the *Texas Sales Tax Return* worksheet (Form 01-114) of a period from the
  posted tax lines: total sales, taxable sales, taxable purchases, state tax,
  and the amount subject to tax and the tax of each local authority code.
