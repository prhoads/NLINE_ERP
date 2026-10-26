################
N-Line Role Module
################

The *N-Line Role Module* gives each user one role, a set of Tryton groups:

- Accounting User: accounting and manufacturing, read-only
- Accounts Specialist: accounting and manufacturing
- Production User: manufacturing, read-only
- Production Specialist: manufacturing
- Admin: every group

Giving a role gives its groups and takes away the groups of the previous role;
groups added by hand stay. The administrator changes the groups of a role under
*Administration > Users > N-Line Roles*, which updates the users of the role.

People signing in through N-Line BI get the role chosen for them on the BI
Admin page at each sign-in (module ``nline_nlbi``).

The group *N-Line Read Only* (in the read-only roles) makes its users
read-only everywhere: they see the menus of their other groups but cannot
create, change or delete records nor click record buttons (post, confirm...).
They still save their own screen settings, searches and exports and print
reports.
