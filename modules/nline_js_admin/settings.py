# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop System Settings

The tabs of Jobshop's System Settings window on top of Tryton: the company
(Address), the accounting calendar (Accounting), the automatic numbering of
the documents (Tryton sequences of sales, purchases, shipments, productions,
invoices and journal batches) and the defaults of each area: the N-Line
Desk configuration and Tryton's sale / purchase configurations.
"""
from trytond.model import fields
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Id
from trytond.rpc import RPC
from trytond.transaction import Transaction


def _account_set(string):
    return fields.Many2One('product.category', string,
        domain=[('accounting', '=', True)], ondelete='SET NULL',
        help="The account set Jobshop uses when none is given.")


class Configuration(metaclass=PoolMeta):
    __name__ = 'nline.desk.configuration'
    js_accounting_interfaced = fields.Boolean(
        "Accounting System Interfaced")
    js_period_type = fields.Selection([
            ('monthly', "Monthly"),
            ('quarterly', "Quarterly"),
            ], "Period Type")
    js_inventory_account_set = _account_set("Inventory Default Account Set")
    js_purchasing_account_set = _account_set(
        "Purchasing Default Account Set")
    js_sales_account_set = _account_set("Sales Default Account Set")
    js_batch_sequence = fields.Many2One('ir.sequence',
        "Journal Batch Sequence",
        domain=[('sequence_type', '=',
                Id('nline_js_admin', 'sequence_type_journal_batch'))],
        help="The numbers of the journal batches of the Account Interface.")
    js_update_cost = fields.Selection([
            ('never', "Never Update"),
            ('prompt', "Prompt to Update When Costs Are Different"),
            ('always', "Always Update When Costs Are Different"),
            ], "Update Part Unit Material Cost Upon Purchase Receipt")
    js_allow_negative = fields.Boolean(
        "Allow Non Lot Tracked Parts to be Shipped and Issued Negative")
    js_receiver_approved = fields.Boolean(
        "Set Receiver Status to 'Approved' Upon Receipt")
    js_prevent_run_labor = fields.Boolean(
        "Prevent Run Labor Entry in Data Collection")
    js_lock_clock_in = fields.Boolean(
        "Lock Labor Data Collection Clock In and Clock Out Fields")

    @classmethod
    def default_js_period_type(cls):
        return 'monthly'

    @classmethod
    def default_js_update_cost(cls):
        return 'never'

    @classmethod
    def default_js_allow_negative(cls):
        return True

    @classmethod
    def default_js_batch_sequence(cls):
        ModelData = Pool().get('ir.model.data')
        try:
            return ModelData.get_id('nline_js_admin', 'sequence_journal_batch')
        except KeyError:
            return None


# The automatic numbering of System Settings: key, tab, label, the model of
# the configuration and its field (None: the fiscal year's invoice numbers)
NUMBERING = [
    ('quote', 'Estimating', "Quote / Sales Order",
        'sale.configuration', 'sale_sequence'),
    ('batch', 'Inventory', "Journal Batch",
        'nline.desk.configuration', 'js_batch_sequence'),
    ('inventory', 'Inventory', "Physical Inventory",
        'stock.configuration', 'inventory_sequence'),
    ('internal', 'Inventory', "Internal Transfer",
        'stock.configuration', 'shipment_internal_sequence'),
    ('purchase', 'Purchasing', "Purchase Order",
        'purchase.configuration', 'purchase_sequence'),
    ('receiver', 'Purchasing', "Receiver",
        'stock.configuration', 'shipment_in_sequence'),
    ('supplier_return', 'Purchasing', "Supplier Return",
        'stock.configuration', 'shipment_in_return_sequence'),
    ('shipper', 'Sales', "Shipper",
        'stock.configuration', 'shipment_out_sequence'),
    ('customer_return', 'Sales', "Customer Return",
        'stock.configuration', 'shipment_out_return_sequence'),
    ('invoice', 'Sales', "Invoice", None, 'out_invoice_sequence'),
    ('credit', 'Sales', "Credit Memo", None, 'out_credit_note_sequence'),
    ('work_order', 'Shopfloor', "Work Order",
        'production.configuration', 'production_sequence'),
    ('job', 'Shopfloor', "Job", 'production.configuration', 'job_sequence'),
    ]

# The defaults of the areas: key, tab, label, model, field
OPTIONS = [
    ('accounting_interfaced', 'Accounting', 'nline.desk.configuration',
        'js_accounting_interfaced'),
    ('period_type', 'Accounting', 'nline.desk.configuration',
        'js_period_type'),
    ('early_discount_account', 'Accounting', 'nline.desk.configuration',
        'early_discount_account'),
    ('sales_discount_account', 'Accounting', 'nline.desk.configuration',
        'sales_discount_account'),
    ('undeposited_account', 'Accounting', 'nline.desk.configuration',
        'undeposited_account'),
    ('deposit_journal', 'Accounting', 'nline.desk.configuration',
        'deposit_journal'),
    ('inventory_account_set', 'Inventory', 'nline.desk.configuration',
        'js_inventory_account_set'),
    ('update_cost', 'Inventory', 'nline.desk.configuration',
        'js_update_cost'),
    ('allow_negative', 'Inventory', 'nline.desk.configuration',
        'js_allow_negative'),
    ('purchasing_account_set', 'Purchasing', 'nline.desk.configuration',
        'js_purchasing_account_set'),
    ('receiver_approved', 'Purchasing', 'nline.desk.configuration',
        'js_receiver_approved'),
    ('purchase_invoice_method', 'Purchasing', 'purchase.configuration',
        'purchase_invoice_method'),
    ('sales_account_set', 'Sales', 'nline.desk.configuration',
        'js_sales_account_set'),
    ('sale_invoice_method', 'Sales', 'sale.configuration',
        'sale_invoice_method'),
    ('sale_shipment_method', 'Sales', 'sale.configuration',
        'sale_shipment_method'),
    ('prevent_run_labor', 'Shopfloor', 'nline.desk.configuration',
        'js_prevent_run_labor'),
    ('lock_clock_in', 'Shopfloor', 'nline.desk.configuration',
        'js_lock_clock_in'),
    ]


class DeskSettings(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.__rpc__['jsadmin_settings'] = RPC()
        cls.__rpc__['jsadmin_settings_save'] = RPC(readonly=False)

    @classmethod
    def _settings_record(cls, model):
        Model = Pool().get(model)
        return Model(1)

    @classmethod
    def _invoice_numbering(cls):
        "The invoice numbering of the current fiscal year"
        pool = Pool()
        FiscalYear = pool.get('account.fiscalyear')
        Date = pool.get('ir.date')
        company = cls._company()
        with Transaction().set_context(company=company.id):
            today = Date.today()
        years = FiscalYear.search([
                ('company', '=', company.id),
                ('start_date', '<=', today),
                ('end_date', '>=', today),
                ], limit=1)
        if not years or not getattr(years[0], 'invoice_sequences', None):
            return None
        return years[0].invoice_sequences[0]

    @classmethod
    def _sequence_of(cls, model, field):
        "The sequence of the numbering (or None) and its holder"
        pool = Pool()
        if model is None:
            holder = cls._invoice_numbering()
            return (getattr(holder, field, None) if holder else None), holder
        try:
            Model = pool.get(model)
        except KeyError:
            return None, None
        if field not in Model._fields:
            return None, None
        holder = Model(1)
        if isinstance(Model._fields[field], fields.MultiValue):
            value = holder.get_multivalue(field, company=cls._company().id)
        else:
            value = getattr(holder, field, None)
        return value, holder

    @staticmethod
    def _sequence_values(sequence):
        if not sequence:
            return None
        return {
            'id': sequence.id,
            'model': sequence.__name__,
            'name': sequence.name,
            'prefix': sequence.prefix or '',
            'suffix': sequence.suffix or '',
            'padding': sequence.padding or 0,
            'number_next': sequence.number_next,
            'sample': sequence.on_change_with_preview()
            if hasattr(sequence, 'on_change_with_preview') else '',
            'type': sequence.type,
            }

    @staticmethod
    def _value(value):
        if hasattr(value, 'id'):
            return {'id': value.id, 'rec_name': value.rec_name}
        return value

    @classmethod
    def jsadmin_settings(cls):
        """The System Settings window: company (Address tab), numbering,
        the defaults of each tab and the current / next periods"""
        cls._check_read('nline.desk.configuration', 'ir.sequence')
        pool = Pool()
        Period = pool.get('account.period')
        Date = pool.get('ir.date')
        company = cls._company()
        party = company.party
        address = party.addresses[0] if party.addresses else None
        result = {
            'company': {
                'party': party.id,
                'address': address.id if address else None,
                'name': party.name,
                'street': address.street if address else '',
                'city': address.city if address else '',
                'subdivision': cls._value(address.subdivision)
                if address and address.subdivision else None,
                'postal_code': address.postal_code if address else '',
                'country': cls._value(address.country)
                if address and address.country else None,
                'phone': party.phone or '',
                'fax': party.fax or '',
                'website': party.website or '',
                },
            'numbering': [],
            'options': {},
            'fields': {},
            }
        for key, tab, label, model, field in NUMBERING:
            sequence, holder = cls._sequence_of(model, field)
            if holder is None and model is not None:
                continue
            result['numbering'].append({
                    'key': key,
                    'tab': tab,
                    'label': label,
                    'sequence': cls._sequence_values(sequence),
                    })
        for key, tab, model, field in OPTIONS:
            try:
                Model = pool.get(model)
            except KeyError:
                continue
            if field not in Model._fields:
                continue
            record = Model(1)
            if hasattr(record, 'get_multivalue') and isinstance(
                    Model._fields[field], fields.MultiValue):
                value = record.get_multivalue(field, company=company.id)
            else:
                value = getattr(record, field, None)
            definition = Model._fields[field]
            info = {
                'tab': tab,
                'label': definition.string,
                'type': definition._type,
                }
            if definition._type == 'many2one':
                info['model'] = definition.get_target().__name__
            if definition._type == 'selection':
                selection = definition.selection
                if isinstance(selection, str):
                    selection = getattr(Model, selection)()
                info['options'] = [list(s) for s in selection]
            result['fields'][key] = info
            result['options'][key] = cls._value(value)
        with Transaction().set_context(company=company.id):
            today = Date.today()
        periods = Period.search([
                ('company', '=', company.id),
                ('type', '=', 'standard'),
                ('end_date', '>=', today),
                ], order=[('start_date', 'ASC')], limit=2)
        result['current_period_end'] = periods[0].end_date \
            if periods else None
        result['next_period_end'] = periods[1].end_date \
            if len(periods) > 1 else None
        return result

    @classmethod
    def jsadmin_settings_save(cls, values):
        """Save the System Settings window
        values: company {name, street, city, subdivision, postal_code,
        country, phone, fax, website}, numbering {key: {prefix, suffix,
        padding, number_next}}, options {key: value}"""
        pool = Pool()
        if values.get('company'):
            cls._save_company(values['company'])
        for key, changes in (values.get('numbering') or {}).items():
            spec = [n for n in NUMBERING if n[0] == key]
            if not spec:
                continue
            _, _, _, model, field = spec[0]
            sequence, _ = cls._sequence_of(model, field)
            if not sequence:
                continue
            cls._check_write(sequence.__name__)
            Sequence = pool.get(sequence.__name__)
            write = {}
            for name in ['prefix', 'suffix']:
                if name in changes:
                    write[name] = changes[name] or None
            if 'padding' in changes:
                write['padding'] = int(changes['padding'] or 0)
            if changes.get('number_next') not in (None, ''):
                write['number_next'] = int(changes['number_next'])
            if write:
                Sequence.write([sequence], write)
        options = values.get('options') or {}
        by_model = {}
        for key, tab, model, field in OPTIONS:
            if key not in options:
                continue
            try:
                Model = pool.get(model)
            except KeyError:
                continue
            if field not in Model._fields:
                continue
            value = options[key]
            if isinstance(value, dict):
                value = value.get('id')
            by_model.setdefault(model, {})[field] = value
        for model, write in by_model.items():
            cls._check_write(model)
            Model = pool.get(model)
            record = Model(1)
            for field, value in write.items():
                setattr(record, field, value)
            record.save()
        return cls.jsadmin_settings()

    @classmethod
    def _save_company(cls, values):
        pool = Pool()
        Party = pool.get('party.party')
        Address = pool.get('party.address')
        Mechanism = pool.get('party.contact_mechanism')
        cls._check_write('party.party', 'party.address')
        party = cls._company().party
        if values.get('name') and values['name'] != party.name:
            Party.write([party], {'name': values['name']})
        address = party.addresses[0] if party.addresses else Address(
            party=party)
        for name in ['street', 'city', 'postal_code']:
            if name in values:
                setattr(address, name, values[name] or None)
        for name in ['subdivision', 'country']:
            if name in values:
                value = values[name]
                setattr(address, name, value.get('id')
                    if isinstance(value, dict) else value)
        address.save()
        for type_ in ['phone', 'fax', 'website']:
            if type_ not in values:
                continue
            value = (values[type_] or '').strip()
            current = [m for m in party.contact_mechanisms
                if m.type == type_]
            if current and value:
                if current[0].value != value:
                    Mechanism.write([current[0]], {'value': value})
            elif current and not value:
                Mechanism.delete([current[0]])
            elif value:
                Mechanism.create([{
                            'party': party.id, 'type': type_,
                            'value': value}])
