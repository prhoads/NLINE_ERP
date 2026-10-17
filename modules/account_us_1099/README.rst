#######################
Account US 1099 Module
#######################

The *Account US 1099 Module* computes the payments to report on Forms
1099-NEC and 1099-MISC, exports them as CSV files for the IRIS Taxpayer Portal
of the IRS and prints the recipient copies (Copy B) as substitute statements.

The payments are computed on the cash basis: the posted moves of the calendar
year with an account checked as *1099 Payment Account* (bank and payment
clearing accounts, not credit card accounts) are taken and the amount is the
debit minus the credit of the lines of the recipient on the payable and
expense accounts of those moves, so the refunds received are deducted.

The recipients are the parties with a *1099 Box*. Their taxpayer
identification number is taken from their EIN, SSN, ITIN or ATIN identifier.

The thresholds of each box are configurable by year.
