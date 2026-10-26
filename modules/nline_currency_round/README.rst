############################
N-Line Currency Round Module
############################

The *N-Line Currency Round Module* rounds amounts half up (0.005 to 0.01) as
QuickBooks and US practice do, instead of the half to even default of Tryton.
A caller asking explicitly for another rounding keeps it.

The difference is at most one cent and only on exact half cents, for example
the 8.25% Texas tax of 2,007.58 is 165.63 instead of 165.62.
