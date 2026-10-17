# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime
from decimal import Decimal

from trytond.i18n import gettext
from trytond.model import (
    DeactivableMixin, ModelSQL, ModelView, Unique, fields)
from trytond.model.exceptions import ValidationError
from trytond.exceptions import UserError
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction
from trytond.wizard import Button, StateTransition, StateView, Wizard

from . import texas

JURISDICTION_TYPES = [
    ('state', "State"),
    ('city', "City"),
    ('county', "County"),
    ('special', "Special Purpose District"),
    ('transit', "Transit Authority"),
    ]
LOCAL_RATE_CAP = texas.LOCAL_RATE_CAP


class Configuration(metaclass=PoolMeta):
    __name__ = 'account.configuration'
    us_sales_tax_account = fields.Many2One(
        'account.account', "Sales Tax Account",
        domain=[
            ('type.statement', '=', 'balance'),
            ('closed', '!=', True),
            ],
        help="The account where the US sales taxes are recorded.")
    us_sales_tax_sourcing = fields.Selection([
            ('origin', "Seller Location"),
            ('destination', "Delivery Address"),
            ], "Sales Tax Sourcing",
        help="The location used for the local sales taxes.\n"
        "Texas presumes the sales of a seller with a single place of "
        "business are made at that location.")
    us_sales_tax_origin = fields.Many2One(
        'account.tax.us.location', "Seller Tax Location",
        help="The tax location of the place of business.")

    @classmethod
    def default_us_sales_tax_sourcing(cls):
        return 'origin'


class Jurisdiction(DeactivableMixin, ModelSQL, ModelView):
    "US Sales Tax Jurisdiction"
    __name__ = 'account.tax.us.jurisdiction'
    company = fields.Many2One('company.company', "Company", required=True)
    subdivision = fields.Many2One(
        'country.subdivision', "State", required=True)
    type = fields.Selection(JURISDICTION_TYPES, "Type", required=True)
    code = fields.Char("Code", required=True,
        help="The code of the jurisdiction for the tax return.")
    name = fields.Char("Name", required=True)
    rates = fields.One2Many(
        'account.tax.us.jurisdiction.rate', 'jurisdiction', "Rates")
    rate = fields.Function(
        fields.Numeric("Current Rate", digits=(14, 10)), 'get_rate')
    tax = fields.Many2One(
        'account.tax', "Tax", readonly=True,
        help="The tax created when the jurisdiction is used.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('code_unique', Unique(t, t.company, t.subdivision, t.code),
                'account_tax_us.msg_jurisdiction_code_unique'),
            ]
        cls._order.insert(0, ('code', 'ASC'))

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    def get_rec_name(self, name):
        return '%s (%s)' % (self.name, self.code)

    def get_rate(self, name, date=None):
        pool = Pool()
        Date = pool.get('ir.date')
        if date is None:
            date = Date.today()
        for rate in sorted(
                self.rates, key=lambda r: r.start_date, reverse=True):
            if rate.start_date <= date:
                return rate.rate

    def set_rate(self, rate, start_date):
        "Record the rate from start_date and return if changed"
        pool = Pool()
        Rate = pool.get('account.tax.us.jurisdiction.rate')
        current = None
        for record in sorted(self.rates, key=lambda r: r.start_date):
            if record.start_date <= start_date:
                current = record
        if current and current.rate == rate:
            return False
        if current and current.start_date == start_date:
            current.rate = rate
            current.save()
        else:
            Rate(jurisdiction=self, start_date=start_date, rate=rate).save()
        return True

    def get_tax(self):
        "Return the tax of the jurisdiction, creating or updating it"
        pool = Pool()
        Tax = pool.get('account.tax')
        Configuration = pool.get('account.configuration')
        config = Configuration(1)
        account = config.us_sales_tax_account
        if not account:
            raise UserError(gettext('account_tax_us.msg_no_sales_tax_account'))
        description = '%s %s %s' % (
            self.subdivision.code.split('-')[-1], self.name, self.code)
        if not self.tax:
            tax = Tax(
                name=description[:64],
                description=description,
                company=self.company,
                type='none',
                childs=[])
            tax.save()
            self.tax = tax
            self.save()
        tax = self.tax
        rates = sorted(self.rates, key=lambda r: r.start_date)
        children = {c.start_date: c for c in tax.childs}
        to_save = []
        for i, rate in enumerate(rates):
            end_date = None
            if i + 1 < len(rates):
                end_date = rates[i + 1].start_date - datetime.timedelta(1)
            child = children.get(rate.start_date)
            if child is None:
                child = Tax(
                    parent=tax,
                    company=self.company,
                    name=('%s %s%%' % (
                            description, rate.rate * 100)).replace(
                        '.0000000000', '')[:64],
                    description='%s %s' % (description, rate.start_date),
                    type='percentage',
                    start_date=rate.start_date,
                    end_date=end_date,
                    rate=rate.rate,
                    invoice_account=account,
                    credit_note_account=account)
                to_save.append(child)
            elif child.rate != rate.rate or child.end_date != end_date:
                child.rate = rate.rate
                child.end_date = end_date
                to_save.append(child)
        if to_save:
            Tax.save(to_save)
        return tax


class JurisdictionRate(ModelSQL, ModelView):
    "US Sales Tax Jurisdiction Rate"
    __name__ = 'account.tax.us.jurisdiction.rate'
    jurisdiction = fields.Many2One(
        'account.tax.us.jurisdiction', "Jurisdiction", required=True,
        ondelete='CASCADE')
    start_date = fields.Date("Start Date", required=True)
    rate = fields.Numeric("Rate", digits=(14, 10), required=True,
        domain=[('rate', '>=', 0), ('rate', '<', 1)])

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__access__.add('jurisdiction')
        cls._order.insert(0, ('start_date', 'DESC'))


class Location(DeactivableMixin, ModelSQL, ModelView):
    "US Sales Tax Location"
    __name__ = 'account.tax.us.location'
    company = fields.Many2One('company.company', "Company", required=True)
    subdivision = fields.Many2One(
        'country.subdivision', "State", required=True)
    name = fields.Char("Name", required=True,
        help="The city or place name.")
    county = fields.Char("County")
    state_jurisdiction = fields.Many2One(
        'account.tax.us.jurisdiction', "State Tax", required=True,
        domain=[
            ('company', '=', Eval('company', -1)),
            ('subdivision', '=', Eval('subdivision', -1)),
            ('type', '=', 'state'),
            ])
    jurisdictions = fields.Many2Many(
        'account.tax.us.location-jurisdiction', 'location', 'jurisdiction',
        "Local Jurisdictions",
        domain=[
            ('company', '=', Eval('company', -1)),
            ('subdivision', '=', Eval('subdivision', -1)),
            ('type', '!=', 'state'),
            ])
    local_rate = fields.Function(
        fields.Numeric("Local Rate", digits=(14, 10)), 'get_local_rate')
    manual = fields.Boolean("Manual",
        help="Check to keep the jurisdictions when importing new rates.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('name', 'ASC'), ('county', 'ASC')]

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')

    def get_rec_name(self, name):
        if self.county:
            return '%s (%s County)' % (self.name, self.county)
        return self.name

    @classmethod
    def search_rec_name(cls, name, clause):
        _, operator, value = clause[:3]
        if operator.startswith('!') or operator.startswith('not '):
            bool_op = 'AND'
        else:
            bool_op = 'OR'
        return [bool_op,
            ('name', operator, value),
            ('county', operator, value),
            ]

    def get_local_rate(self, name):
        return sum(
            (j.rate or Decimal(0) for j in self.jurisdictions), Decimal(0))

    @classmethod
    def validate_fields(cls, locations, field_names):
        super().validate_fields(locations, field_names)
        cls.check_cap(locations, field_names)

    @classmethod
    def check_cap(cls, locations, field_names=None):
        if field_names and not (field_names & {'jurisdictions', 'manual'}):
            return
        for location in locations:
            if location.manual and location.local_rate > LOCAL_RATE_CAP:
                raise ValidationError(gettext(
                        'account_tax_us.msg_location_over_cap',
                        location=location.rec_name))

    def get_tax_ids(self):
        if self.local_rate > LOCAL_RATE_CAP:
            raise UserError(gettext(
                    'account_tax_us.msg_location_over_cap',
                    location=self.rec_name))
        jurisdictions = [self.state_jurisdiction] + list(self.jurisdictions)
        return [j.get_tax().id for j in jurisdictions]


class LocationJurisdiction(ModelSQL):
    "US Sales Tax Location - Jurisdiction"
    __name__ = 'account.tax.us.location-jurisdiction'
    location = fields.Many2One(
        'account.tax.us.location', "Location", required=True,
        ondelete='CASCADE')
    jurisdiction = fields.Many2One(
        'account.tax.us.jurisdiction', "Jurisdiction", required=True,
        ondelete='CASCADE')


class Tax(metaclass=PoolMeta):
    __name__ = 'account.tax'
    us_sales_tax = fields.Boolean(
        "US Sales Tax by Location",
        help="Check to replace this tax by the state and local taxes of the "
        "location with the tax rules applying US sales tax.")


class TaxRule(metaclass=PoolMeta):
    __name__ = 'account.tax.rule'
    us_sales_tax = fields.Boolean(
        "Apply US Sales Tax",
        help="Check to replace the US sales tax by the taxes of the "
        "location.")

    def apply(self, tax, pattern):
        pool = Pool()
        Tax = pool.get('account.tax')
        Address = pool.get('party.address')
        pattern = pattern.copy()
        from_address = pattern.pop('us_from_address', None)
        to_address = pattern.pop('us_to_address', None)
        tax_ids = super().apply(tax, pattern)
        if not self.us_sales_tax or not tax_ids:
            return tax_ids
        result = []
        for tax_ in Tax.browse(tax_ids):
            if tax_.us_sales_tax:
                result.extend(self.us_location_tax_ids(
                        Address(from_address) if from_address else None,
                        Address(to_address) if to_address else None))
            else:
                result.append(tax_.id)
        return result

    @classmethod
    def us_location_tax_ids(cls, from_address, to_address):
        "Return the taxes of the location for the sale"
        pool = Pool()
        Configuration = pool.get('account.configuration')
        config = Configuration(1)
        origin = config.us_sales_tax_origin
        if not origin:
            raise UserError(gettext('account_tax_us.msg_no_origin_location'))
        state = origin.subdivision
        if to_address:
            # No tax of the state when delivered elsewhere
            if to_address.country and to_address.country != state.country:
                return []
            if to_address.subdivision and to_address.subdivision != state:
                return []
        if config.us_sales_tax_sourcing == 'destination':
            location = to_address.us_tax_location if to_address else None
            if not location:
                raise UserError(gettext(
                        'account_tax_us.msg_address_no_location',
                        address=to_address.rec_name if to_address else ''))
        else:
            location = None
            if from_address:
                location = from_address.us_tax_location
            location = location or origin
        return location.get_tax_ids()


class Address(metaclass=PoolMeta):
    __name__ = 'party.address'
    us_tax_location = fields.Many2One(
        'account.tax.us.location', "Sales Tax Location",
        domain=[
            ('subdivision', '=', Eval('subdivision', -1)),
            ],
        states={
            'invisible': ~Eval('subdivision'),
            },
        help="The location of the address for the US sales tax.")

    @fields.depends('city', 'subdivision', 'us_tax_location')
    def on_change_city(self):
        self.us_tax_location = self._guess_us_tax_location()

    @fields.depends('city', 'subdivision', 'us_tax_location')
    def on_change_subdivision(self):
        self.us_tax_location = self._guess_us_tax_location()

    def _guess_us_tax_location(self):
        pool = Pool()
        Location = pool.get('account.tax.us.location')
        if (self.us_tax_location
                and self.us_tax_location.subdivision == self.subdivision):
            return self.us_tax_location
        if not self.city or not self.subdivision:
            return None
        locations = Location.search([
                ('subdivision', '=', self.subdivision.id),
                ('name', 'ilike', self.city.strip()),
                ], limit=2)
        if len(locations) == 1:
            return locations[0]


class InvoiceLine(metaclass=PoolMeta):
    __name__ = 'account.invoice.line'

    @fields.depends('invoice', '_parent_invoice.invoice_address',
        '_parent_invoice.company', 'origin')
    def _get_tax_rule_pattern(self):
        pool = Pool()
        try:
            SaleLine = pool.get('sale.line')
        except KeyError:
            SaleLine = None
        pattern = super()._get_tax_rule_pattern()
        from_address = to_address = None
        if (SaleLine and isinstance(self.origin, SaleLine)
                and self.origin.id >= 0):
            sale = self.origin.sale
            to_address = sale.shipment_address
            if sale.warehouse and sale.warehouse.address:
                from_address = sale.warehouse.address
        elif self.invoice:
            to_address = self.invoice.invoice_address
        pattern['us_from_address'] = from_address.id if from_address else None
        pattern['us_to_address'] = to_address.id if to_address else None
        return pattern


class SaleLine(metaclass=PoolMeta):
    __name__ = 'sale.line'

    @fields.depends('sale', 'warehouse', '_parent_sale.shipment_address')
    def _get_tax_rule_pattern(self):
        pattern = super()._get_tax_rule_pattern()
        from_address = to_address = None
        if self.warehouse and self.warehouse.address:
            from_address = self.warehouse.address
        if self.sale and self.sale.shipment_address:
            to_address = self.sale.shipment_address
        pattern['us_from_address'] = from_address.id if from_address else None
        pattern['us_to_address'] = to_address.id if to_address else None
        return pattern


class ImportTexasStart(ModelView):
    "Import Texas Sales Tax Rates"
    __name__ = 'account.tax.us.import_texas.start'
    company = fields.Many2One('company.company', "Company", required=True)
    file = fields.Binary("Rate File", required=True,
        help='The "taxrates.txt" file of the Texas Comptroller.')

    @classmethod
    def default_company(cls):
        return Transaction().context.get('company')


class ImportTexasResult(ModelView):
    "Import Texas Sales Tax Rates"
    __name__ = 'account.tax.us.import_texas.result'
    quarter = fields.Char("Quarter", readonly=True)
    jurisdictions = fields.Integer("Jurisdictions", readonly=True)
    changed = fields.Integer("Changed Rates", readonly=True)
    locations = fields.Integer("Locations", readonly=True)
    over_cap = fields.Integer("Locations to Review", readonly=True,
        help="Locations with overlapping jurisdictions over the 2% cap.")


class ImportTexas(Wizard):
    "Import Texas Sales Tax Rates"
    __name__ = 'account.tax.us.import_texas'
    start = StateView('account.tax.us.import_texas.start',
        'account_tax_us.import_texas_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Import", 'import_', 'tryton-ok', default=True),
            ])
    import_ = StateTransition()
    result = StateView('account.tax.us.import_texas.result',
        'account_tax_us.import_texas_result_view_form', [
            Button("Close", 'end', 'tryton-close', default=True),
            ])

    def transition_import_(self):
        pool = Pool()
        Jurisdiction = pool.get('account.tax.us.jurisdiction')
        Location = pool.get('account.tax.us.location')

        company = self.start.company
        try:
            rates = texas.parse(bytes(self.start.file))
        except texas.TexasRateError as exception:
            raise UserError(gettext(
                    'account_tax_us.msg_rate_file_invalid',
                    error=str(exception))) from exception
        state = self.get_texas()
        start_date = rates.start_date

        jurisdictions = {
            j.code: j for j in Jurisdiction.search([
                    ('company', '=', company.id),
                    ('subdivision', '=', state.id),
                    ], order=[])}
        new = []
        for code, values in [('TX', texas.Jurisdiction(
                        type='state', code='TX', name="Texas",
                        rate=rates.state_rate))] + sorted(
                rates.jurisdictions.items()):
            if code not in jurisdictions:
                jurisdiction = Jurisdiction(
                    company=company, subdivision=state, code=code,
                    rates=[])
                new.append(jurisdiction)
                jurisdictions[code] = jurisdiction
            jurisdiction = jurisdictions[code]
            jurisdiction.type = values.type
            jurisdiction.name = values.name
        Jurisdiction.save(list(jurisdictions.values()))
        changed = 0
        for code, values in [('TX', texas.Jurisdiction(
                        type='state', code='TX', name="Texas",
                        rate=rates.state_rate))] + sorted(
                rates.jurisdictions.items()):
            jurisdiction = jurisdictions[code]
            if jurisdiction.set_rate(values.rate, start_date):
                changed += 1
                if jurisdiction.tax:
                    jurisdiction.get_tax()

        locations = {
            (l.name, l.county or ''): l for l in Location.search([
                    ('company', '=', company.id),
                    ('subdivision', '=', state.id),
                    ], order=[])}
        to_save = []
        seen = set()
        for values in rates.locations:
            key = (values.name, values.county or '')
            if key in seen:
                continue
            seen.add(key)
            location = locations.get(key)
            if location is None:
                location = Location(
                    company=company, subdivision=state, name=values.name,
                    county=values.county or None, manual=False)
            elif location.manual:
                continue
            location.state_jurisdiction = jurisdictions['TX']
            location.jurisdictions = [
                jurisdictions[j.code] for j in values.jurisdictions]
            location.active = True
            to_save.append(location)
        Location.save(to_save)
        self.result.quarter = rates.label
        self.result.jurisdictions = len(jurisdictions)
        self.result.changed = changed
        self.result.locations = len(seen)
        self.result.over_cap = sum(1 for l in rates.locations if l.over_cap)
        return 'result'

    @classmethod
    def get_texas(cls):
        "Return the subdivision of Texas, created if the countries are not "
        "imported (trytond_import_countries uses the same codes)"
        pool = Pool()
        Country = pool.get('country.country')
        Subdivision = pool.get('country.subdivision')
        states = Subdivision.search([('code', '=', 'US-TX')], limit=1)
        if states:
            return states[0]
        countries = Country.search([('code', '=', 'US')], limit=1)
        if countries:
            country, = countries
        else:
            country = Country(
                code='US', code3='USA', code_numeric='840',
                name="United States")
            country.save()
        state = Subdivision(
            country=country, code='US-TX', name="Texas", type='state')
        state.save()
        return state

    def default_result(self, fields):
        return {
            'quarter': self.result.quarter,
            'jurisdictions': self.result.jurisdictions,
            'changed': self.result.changed,
            'locations': self.result.locations,
            'over_cap': self.result.over_cap,
            }


class Party(metaclass=PoolMeta):
    __name__ = 'party.party'
    us_tax_exemption_certificate = fields.Char(
        "Sales Tax Exemption Certificate",
        help="The number or reference of the resale or exemption "
        "certificate received from the customer.")
    us_tax_exemption_date = fields.Date(
        "Exemption Certificate Date",
        states={
            'invisible': ~Eval('us_tax_exemption_certificate'),
            })
