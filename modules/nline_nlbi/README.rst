########################
N-Line BI Sign-in Module
########################

The *N-Line BI Sign-in Module* lets the N-Line BI web server sign people in to
Tryton: the BI server serves the ERP at ``https://nlvrdp01:8765/ERP/`` with
its one sign-in, and when a page signs in through it, it sends a token signed
with a secret shared with this server instead of a password.

Configuration of trytond.conf::

    [session]
    authentications = nlbi,password

    [nlbi]
    secret = <the ERP_SECRET of the BI server's ERP app>

A person signed in to N-Line BI with access to the ERP gets a Tryton user of
the same login on the first sign-in, without groups: an administrator gives
the groups in Tryton. An inactive Tryton user is refused.

The password method stays after ``nlbi``: the ERP keeps opening directly on
its own server with a Tryton password when the BI server is down.
