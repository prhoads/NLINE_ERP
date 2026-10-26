#########################
N-Line Check Print Module
#########################

The *N-Line Check Print Module* prints supplier checks from payments:

- a payment journal with the *Check* process method has a check sequence
  (the numbers of the bank account), the bank account and, for blank stock,
  the MICR routing and account numbers;
- processing payments numbers one check per payee: all the bills paid to a
  supplier in the group are on the same check;
- the *Checks* report of the payment group prints QuickBooks-style voucher
  checks on letter paper: the check on top with the date, the payee, the
  amount in figures and in words ("One Thousand Two Hundred Thirty-Four and
  56/100"), the address and the memo, then two stubs listing the bills paid.
  The MICR line is printed only when the journal asks for it (blank stock with
  the MICR E-13B font and magnetic toner).
