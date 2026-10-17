#######################
Account Tax US Module
#######################

The *Account Tax US Module* computes the US sales taxes by location.

The Texas rates are imported from the "taxrates.txt" file of the Comptroller
(Sales Tax EDI).  Each jurisdiction (state, city, county, special purpose
district and transit authority) keeps its rate history and its tax is created
when it is first used.  Each address can be linked to a tax location.

A tax marked *US Sales Tax by Location* is replaced, by a tax rule marked
*Apply US Sales Tax*, with the taxes of the location of the seller (default,
Texas presumes the sales of a single place of business are made there) or of
the delivery address.  Deliveries outside the state are not taxed.  Use
another tax rule without US sales tax for exempt customers.
