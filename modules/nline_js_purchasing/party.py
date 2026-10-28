# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The Jobshop supplier fields of a party (Suppliers window)

The supplier fields are named supplier_* so they never meet the customer
fields the Sales area adds to the same party."""
from sql import Union
from sql.aggregate import Max

from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction

FREIGHT_TERMS = [
    (None, ''),
    ('billed', "Billed"),
    ('collect', "Collect"),
    ('prepaid', "Prepaid"),
    ]

# The tax groups of Jobshop purchasing: account.tax parents of this group
TAX_GROUP_DOMAIN = [
    ('parent', '=', None),
    ('group.code', '=', 'JS-PURCHASE'),
    ]

# Jobshop's contact fields kept as the party's contact mechanisms
CONTACT_TYPES = {
    'supplier_phone': 'phone',
    'supplier_fax': 'fax',
    'supplier_email': 'email',
    'supplier_mobile': 'mobile',
    'supplier_web_url': 'website',
    }
ADDRESS_FIELDS = ['supplier_address_1', 'supplier_address_2',
    'supplier_address_etc', 'supplier_city', 'supplier_state',
    'supplier_postal_code', 'supplier_country']


class Party(metaclass=PoolMeta):
    __name__ = 'party.party'

    is_supplier = fields.Boolean(
        "Supplier", help="Listed in the Jobshop Suppliers window.")
    supplier_inactive = fields.Boolean(
        "Inactive Supplier",
        help="No new orders: left out of the supplier lookups.")
    supplier_contact = fields.Char("Supplier Contact")
    supplier_contact_title = fields.Char("Supplier Contact Title")
    supplier_open_date = fields.Date("Supplier Account Opened")
    supplier_exported = fields.Boolean(
        "Supplier Exported",
        help="Exported to the accounting application.")
    supplier_exported_date = fields.Date("Supplier Exported Date")
    supplier_last_order_date = fields.Function(
        fields.Date("Last Order Date"), 'get_supplier_last_order_date')
    supplier_our_customer_id = fields.Char(
        "Our Customer ID", help="The ID the supplier knows us by.")
    supplier_buyer = fields.Char("Buyer")
    supplier_fob_point = fields.Many2One(
        'nline.fob_point', "FOB Point", ondelete='SET NULL')
    supplier_ship_via = fields.Many2One(
        'nline.ship_via', "Ship Via", ondelete='SET NULL')
    supplier_tax_group = fields.Many2One(
        'account.tax', "Purchasing Tax Group", ondelete='SET NULL',
        domain=TAX_GROUP_DOMAIN)
    supplier_tax_id_number = fields.Char("Supplier Tax ID Number")
    supplier_tax_exempt = fields.Boolean(
        "Tax Exempt", help="Purchases from this supplier carry no tax.")
    supplier_expense_account = fields.Many2One(
        'account.account', "Expense Account", ondelete='SET NULL',
        domain=[
            ('closed', '!=', True),
            ('company', '=', Eval('context', {}).get('company', -1)),
            ])
    supplier_freight_terms = fields.Selection(
        FREIGHT_TERMS, "Freight Terms")
    supplier_specifications = fields.Text(
        "Supplier Specifications",
        help="Copied to the Specs of the purchase orders to this supplier.")
    supplier_rfq_instructions = fields.Text(
        "RFQ Instructions",
        help="Shown when the supplier is put on a request for quote.")
    supplier_po_instructions = fields.Text(
        "PO Instructions",
        help="Shown when the supplier is put on a purchase order.")

    # The Suppliers tab: the first address and the contact as Jobshop has
    # them on the supplier
    supplier_address_1 = fields.Function(fields.Char("Address"),
        'get_supplier_address', setter='set_supplier_address')
    supplier_address_2 = fields.Function(fields.Char("Address 2"),
        'get_supplier_address', setter='set_supplier_address')
    supplier_address_etc = fields.Function(fields.Char("Etc."),
        'get_supplier_address', setter='set_supplier_address')
    supplier_city = fields.Function(fields.Char("City"),
        'get_supplier_address', setter='set_supplier_address')
    supplier_state = fields.Function(fields.Char("State"),
        'get_supplier_address', setter='set_supplier_address')
    supplier_postal_code = fields.Function(fields.Char("Postal Code"),
        'get_supplier_address', setter='set_supplier_address')
    supplier_country = fields.Function(fields.Char("Country"),
        'get_supplier_address', setter='set_supplier_address')
    supplier_phone = fields.Function(fields.Char("Phone"),
        'get_supplier_contact', setter='set_supplier_contact')
    supplier_fax = fields.Function(fields.Char("Fax"),
        'get_supplier_contact', setter='set_supplier_contact')
    supplier_email = fields.Function(fields.Char("Contact E-Mail"),
        'get_supplier_contact', setter='set_supplier_contact')
    supplier_mobile = fields.Function(fields.Char("Mobile"),
        'get_supplier_contact', setter='set_supplier_contact')
    supplier_web_url = fields.Function(fields.Char("Web URL"),
        'get_supplier_contact', setter='set_supplier_contact')

    # The Other tab: Jobshop's user defined fields N-Line fills (labels of
    # PURCHASING_OBJECT_GLOBAL: N-LINE FIELD, NOTES:, AUDIT DATE:)
    supplier_user_0 = fields.Char("N-Line Field")
    supplier_user_1 = fields.Char("Notes (user field)")
    supplier_user_2 = fields.Char("Audit Date")

    @classmethod
    def __register__(cls, module_name):
        super().__register__(module_name)
        # The parties already bought from are suppliers
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        ProductSupplier = pool.get('purchase.product_supplier')
        party = cls.__table__()
        purchase = Purchase.__table__()
        product_supplier = ProductSupplier.__table__()
        cursor = Transaction().connection.cursor()
        cursor.execute(*party.update(
                [party.is_supplier], [True],
                where=party.id.in_(Union(
                        purchase.select(purchase.party),
                        product_supplier.select(product_supplier.party)))
                & ((party.is_supplier == False)  # noqa: E712
                    | (party.is_supplier == None))))  # noqa: E711

    @classmethod
    def default_is_supplier(cls):
        return False

    @classmethod
    def default_supplier_inactive(cls):
        return False

    @classmethod
    def default_supplier_exported(cls):
        return False

    @classmethod
    def default_supplier_tax_exempt(cls):
        return False

    @classmethod
    def get_supplier_last_order_date(cls, parties, name):
        pool = Pool()
        Purchase = pool.get('purchase.purchase')
        purchase = Purchase.__table__()
        cursor = Transaction().connection.cursor()
        result = {p.id: None for p in parties}
        cursor.execute(*purchase.select(
                purchase.party, Max(purchase.purchase_date),
                where=purchase.party.in_(list(result))
                & (purchase.state != 'cancelled'),
                group_by=[purchase.party]))
        for party, date in cursor:
            result[party] = date
        return result

    def _supplier_address(self):
        return self.addresses[0] if self.addresses else None

    def get_supplier_address(self, name):
        address = self._supplier_address()
        if not address:
            return None
        if name in {'supplier_address_1', 'supplier_address_2',
                'supplier_address_etc'}:
            lines = (address.street or '').splitlines()
            index = {'supplier_address_1': 0, 'supplier_address_2': 1,
                'supplier_address_etc': 2}[name]
            if name == 'supplier_address_etc':
                return '\n'.join(lines[2:]) or None
            return lines[index] if len(lines) > index else None
        if name == 'supplier_city':
            return address.city
        if name == 'supplier_postal_code':
            return address.postal_code
        if name == 'supplier_state':
            if address.subdivision:
                return address.subdivision.code.split('-')[-1]
            return None
        if name == 'supplier_country':
            return address.country.name if address.country else None

    @classmethod
    def set_supplier_address(cls, parties, name, value):
        pool = Pool()
        Address = pool.get('party.address')
        Country = pool.get('country.country')
        Subdivision = pool.get('country.subdivision')
        for party in parties:
            # Fresh: an earlier setter of the same save may have made it
            address = cls(party.id)._supplier_address()
            if not address:
                address = Address(party=party, street=None, country=None,
                    subdivision=None)
            if name in {'supplier_address_1', 'supplier_address_2',
                    'supplier_address_etc'}:
                lines = (getattr(address, 'street', None) or '').splitlines()
                lines += [''] * (3 - len(lines))
                index = {'supplier_address_1': 0, 'supplier_address_2': 1,
                    'supplier_address_etc': 2}[name]
                lines = lines[:2] + ['\n'.join(lines[2:])]
                lines[index] = ' '.join((value or '').split()) \
                    if index < 2 else (value or '')
                address.street = '\n'.join(lines).rstrip('\n') or None
            elif name == 'supplier_city':
                address.city = value or None
            elif name == 'supplier_postal_code':
                address.postal_code = value or None
            elif name == 'supplier_country':
                country = None
                if value:
                    countries = Country.search(['OR',
                            ('name', 'ilike', value.strip()),
                            ('code', '=', value.strip().upper()),
                            ('code3', '=', value.strip().upper()),
                            ], limit=1)
                    country = countries[0] if countries else None
                address.country = country
                if (country and address.subdivision
                        and address.subdivision.country != country):
                    address.subdivision = None
            elif name == 'supplier_state':
                subdivision = None
                if value:
                    code = value.strip().upper()
                    domain = [('code', 'like', '%-' + code)]
                    if address.country:
                        domain.append(('country', '=', address.country.id))
                    else:
                        domain.append(('country.code', '=', 'US'))
                    found = Subdivision.search(domain, limit=1)
                    subdivision = found[0] if found else None
                address.subdivision = subdivision
                if subdivision and not address.country:
                    address.country = subdivision.country
            address.save()

    def get_supplier_contact(self, name):
        kind = CONTACT_TYPES[name]
        for mechanism in self.contact_mechanisms:
            if mechanism.type == kind:
                return mechanism.value
        return None

    @classmethod
    def set_supplier_contact(cls, parties, name, value):
        pool = Pool()
        Mechanism = pool.get('party.contact_mechanism')
        kind = CONTACT_TYPES[name]
        for party in parties:
            found = [m for m in cls(party.id).contact_mechanisms
                if m.type == kind]
            if found and not value:
                Mechanism.delete(found[:1])
            elif found:
                if found[0].value != value:
                    found[0].value = value
                    found[0].save()
            elif value:
                Mechanism(party=party, type=kind, value=value).save()

    @classmethod
    def copy(cls, parties, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('supplier_exported', False)
        default.setdefault('supplier_exported_date', None)
        return super().copy(parties, default=default)


class Address(metaclass=PoolMeta):
    __name__ = 'party.address'

    # Jobshop keeps a contact on each alternate address of a supplier
    site_contact_name = fields.Char("Contact Name")
    site_contact_title = fields.Char("Contact Title")
    site_contact_phone = fields.Char("Contact Phone")
    site_contact_fax = fields.Char("Contact Fax")
    site_contact_email = fields.Char("Contact E-Mail")
