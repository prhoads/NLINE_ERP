###############################
Account Payroll Paychex Module
###############################

The *Account Payroll Paychex Module* imports the PDF "General Ledger Report by
Check Date" of Paychex Flex as a draft account move dated on the check date.

Each line of the report is posted to the account set in the *Paychex
Mappings*.  Unknown lines are added to the mappings and the import stops
until their account is set.  The report must be balanced and match its
totals.  A report can be imported only once.
