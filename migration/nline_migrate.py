#!/usr/bin/env python3
"""Import N-Line's data from VISUAL Jobshop and QuickBooks into the ERP

    python nline_migrate.py --config <trytond.conf> --database nline_test
        [--mode sample | full] [--cutoff 2021-11-01] [--steps base,parties,...]

Sources (SQL Server NLVDC01\\VJS, Windows sign-in):
- NLINE_VJS: VISUAL Jobshop (parties, parts, engineering masters, shop
  resources, work orders, sales and purchase orders)
- QBLocal: the QuickBooks mirror kept by QB_Direct (bills, invoices, checks)

Modes:
- sample: a small, realistic set to test the screens: the open work orders,
  sales and purchase orders, everything they use (parts, masters, parties),
  this year's open bills and invoices and the last 90 days of checks
- full: every active master record, and the transactions dated on or after
  --cutoff (see README.md: older ones stay readable in the Jobshop archive)

It can be run again: a record already imported (found by its Jobshop or
QuickBooks number) is kept, not duplicated. It writes through Tryton (proteus),
so every rule of the ERP applies. It never writes to Jobshop or QuickBooks.
"""
import argparse
import os
import datetime as dt
import re
import sys
import time
from collections import defaultdict
from decimal import Decimal

SQL_SERVER = r'NLVDC01\VJS'
JOBSHOP = 'NLINE_VJS'
QUICKBOOKS = 'QBLocal'
STEPS = ['base', 'parties', 'resources', 'parts', 'masters', 'sales',
    'purchases', 'workorders', 'bills', 'invoices', 'checks']
# The Jobshop emulation's data, area by area (migration/jobshop/<area>.py,
# def run(m)), after the documents they refer to
JS_AREAS = ['common', 'inventory', 'sales', 'purchasing', 'engineering',
    'shopfloor', 'planning', 'admin']
STEPS += ['js_' + a for a in JS_AREAS]
# The Common tables (terms, FOB points, ship vias...) before the parties use them
STEPS.remove('js_common')
STEPS.insert(1, 'js_common')
# One party per Jobshop customer / supplier (migration/jobshop/parties.py)
STEPS.insert(STEPS.index('js_inventory'), 'js_parties')
OPEN = ('RELEASED', 'UNRELEASED', 'FIRM', 'HOLD')
# The work center of the work orders: every Jobshop resource is under it
SHOP = "N-Line Shop"
# Jobshop units -> Tryton units (by symbol)
UNITS = {'EA': 'u', 'IN': 'in', 'FT': 'ft', 'LB': 'lb', 'LBS': 'lb'}
# Jobshop / QuickBooks terms -> the payment terms of the ERP
TERMS = {
    'NET 15 DAYS': "Net 15 Days", 'NET 30 DAYS': "Net 30 Days",
    'NET 45 DAYS': "Net 30 Days", 'NET 60 DAYS': "Net 60 Days",
    'NET 10': "Net 10", '2% 10 NET 30': "2% 10 Net 30",
    'COD': "Due on receipt", 'DUE ON RECEIPT': "Due on receipt",
    }


def log(message):
    print('%s %s' % (time.strftime('%H:%M:%S'), message), flush=True)


def norm(name):
    "A party name for matching across Jobshop and QuickBooks"
    name = re.sub(r'[^A-Z0-9 ]', ' ', (name or '').upper())
    words = [w for w in name.split() if w not in {
            'INC', 'LLC', 'LP', 'LTD', 'CO', 'CORP', 'CORPORATION',
            'COMPANY', 'THE', 'OF'}]
    return ' '.join(words)


def one_line(value, size=None):
    "A name on one line (Tryton refuses line breaks in names)"
    value = ' '.join(str(value or '').split())
    return value[:size] if size else value


def day(value):
    if value is None:
        return None
    return value.date() if isinstance(value, dt.datetime) else value


def dec(value, default=Decimal(0)):
    """A Jobshop number as a Decimal the ERP accepts: Jobshop keeps 6 to 8
    decimals (61.790000), the ERP's prices and rates 4"""
    if value is None:
        return default
    value = Decimal(str(value)).quantize(Decimal('0.0001')).normalize()
    # Without trailing zeros (0.0000 is refused by a field of 2 digits),
    # never in exponent form (1E+2)
    return value.quantize(Decimal(1)) if value == value.to_integral() \
        else value


class Source:
    "Read-only SQL Server connection to one database"

    def __init__(self, database, server=SQL_SERVER):
        import pyodbc
        self.connection = pyodbc.connect(
            'DRIVER={ODBC Driver 17 for SQL Server};SERVER=%s;DATABASE=%s;'
            'Trusted_Connection=yes;ApplicationIntent=ReadOnly;'
            % (server, database), timeout=30, readonly=True)

    def rows(self, sql, *params):
        cursor = self.connection.execute(sql, *params)
        names = [d[0] for d in cursor.description]
        return [dict(zip(names, r)) for r in cursor.fetchall()]


def chunks(values, size=500):
    values = list(values)
    for i in range(0, len(values), size):
        yield values[i:i + size]


def placeholders(values):
    return ','.join('?' * len(values))


class Migration:

    def __init__(self, args):
        from proteus import Model, config as pconfig
        self.args = args
        self.config = pconfig.set_trytond(args.database,
            config_file=args.config)
        self.Model = Model
        User = Model.get('res.user')
        self.config._context = dict(User.get_preferences(True, {}),
            _skip_warnings=True)
        self.context = self.config.context
        self.js = Source(JOBSHOP, args.sql_server)
        self.qb = Source(QUICKBOOKS, args.sql_server)
        self.sample = args.mode == 'sample'
        self.cutoff = args.cutoff
        self.counts = defaultdict(int)
        # What the steps found or made, by source key
        self.parties = {}           # norm(name) -> party
        self.party_by_js = {}       # ('C' | 'V', Jobshop id) -> party
        self.products = {}          # Jobshop part id -> product
        self.wanted_parts = set()
        self.terms = {}
        Company = Model.get('company.company')
        self.company, = Company.find([], limit=1)

    def get(self, name):
        return self.Model.get(name)

    def count(self, what, n=1):
        self.counts[what] += n

    # ---- base: the settings the screens need ------------------------------

    def account(self, code):
        Account = self.get('account.account')
        found = Account.find([('code', '=', code)], limit=1)
        return found[0] if found else None

    def step_base(self):
        Account = self.get('account.account')
        Journal = self.get('account.journal')
        PaymentJournal = self.get('account.payment.journal')
        Sequence = self.get('ir.sequence')
        SequenceType = self.get('ir.sequence.type')
        DeskConfig = self.get('nline.desk.configuration')
        Category = self.get('product.category')
        PaymentTerm = self.get('account.invoice.payment_term')
        for term in PaymentTerm.find([]):
            self.terms[term.name] = term

        undeposited = self.account('1499')
        if undeposited and not undeposited.reconcile:
            undeposited.reconcile = True
            undeposited.save()
        bank = self.account('1004')
        clearing = Account.find([('name', '=', "Chase 9807 Clearing")])
        if clearing:
            clearing, = clearing
        else:
            clearing, = bank.duplicate(default={
                    'name': "Chase 9807 Clearing", 'code': '1005',
                    'reconcile': True})
        journals = Journal.find([('code', '=', 'DESK')])
        if journals:
            desk_journal, = journals
        else:
            desk_journal = Journal(name="Desk", type='general', code='DESK')
            desk_journal.save()
        desk = DeskConfig(1)
        desk.undeposited_account = desk.undeposited_account or undeposited
        desk.deposit_journal = desk.deposit_journal or desk_journal
        desk.early_discount_account = (desk.early_discount_account
            or self.account('7060'))
        desk.sales_discount_account = (desk.sales_discount_account
            or self.account('48300'))
        desk.save()
        if not PaymentJournal.find([('name', '=', "Customer Receipts")]):
            PaymentJournal(name="Customer Receipts", process_method='manual',
                clearing_account=undeposited,
                clearing_journal=desk_journal).save()
        if not PaymentJournal.find([('name', '=', "Chase 9807 Checks")]):
            # The next check number of the 9807 checkbook in QuickBooks
            last, = self.qb.rows(
                "select max(cast(RefNumber as int)) n from [Check] "
                "where AccountRefFullName like '%9807' "
                "and RefNumber not like '%[^0-9]%' "
                "and len(RefNumber) between 3 and 6")
            check_type, = SequenceType.find([('name', '=', "Check")])
            sequence = Sequence(name="Chase 9807 Checks",
                sequence_type=check_type,
                number_next=(last['n'] or 10000) + 1)
            sequence.save()
            PaymentJournal(name="Chase 9807 Checks", process_method='check',
                check_sequence=sequence, clearing_account=clearing,
                clearing_journal=desk_journal, bank_account=bank).save()
            log("Chase 9807 Checks journal: next check %s"
                % sequence.number_next)

        # The category of the Jobshop parts (stock valued, sold, bought)
        categories = Category.find([('name', '=', "Parts")])
        if categories:
            self.parts_category, = categories
        else:
            names = {a.name: a for a in Account.find([('name', 'in', [
                            "Inventory Asset", "Cost of Goods Sold",
                            "Sales - Manufactor Goods"])])}
            cogs = names["Cost of Goods Sold"]
            if not cogs.type.stock:
                # The counterpart of stock moves (account_us chart, before
                # its type template had it)
                AccountType = self.get('account.account.type')
                AccountType.write([cogs.type.id], {'stock': True},
                    self.context)
                cogs.reload()
            self.parts_category = Category(name="Parts", accounting=True,
                account_stock=names["Inventory Asset"],
                account_stock_in=cogs,
                account_stock_out=cogs,
                account_expense=names["Cost of Goods Sold"],
                account_revenue=names["Sales - Manufactor Goods"])
            self.parts_category.save()
        services = Category.find([('name', '=', "Outside Services")])
        if services:
            self.service_category, = services
        else:
            self.service_category = Category(name="Outside Services",
                accounting=True,
                account_expense=self.parts_category.account_expense)
            self.service_category.save()
        for year in self.years():
            self.fiscal_year(year)

        # Jobshop keeps quantities to 4 decimals (2.875 in of bar, 0.25 of a
        # casting): the units of the parts do too
        Uom = self.get('product.uom')
        for uom in Uom.find([('symbol', 'in', sorted(set(UNITS.values())))]):
            if uom.digits < 4:
                Uom.write([uom.id], {'digits': 4, 'rounding': 0.0001},
                    self.context)

    def years(self):
        this = dt.date.today().year
        first = this if self.sample else self.cutoff.year
        return range(first, this + 1)

    def fiscal_year(self, year):
        "A fiscal year with monthly periods and its own invoice numbers"
        FiscalYear = self.get('account.fiscalyear')
        if FiscalYear.find([('start_date', '<=', dt.date(year, 6, 1)),
                    ('end_date', '>=', dt.date(year, 6, 1))]):
            return
        from trytond.modules.account.tests.tools import create_fiscalyear
        SequenceStrict = self.get('ir.sequence.strict')
        SequenceType = self.get('ir.sequence.type')
        invoice_type, = SequenceType.find([('name', '=', "Invoice")],
            limit=1)
        fiscalyear = create_fiscalyear(self.company, today=(
                dt.date(year, 1, 1), dt.date(year, 12, 31)))
        short = str(year)[2:]

        def series(name, prefix):
            sequence = SequenceStrict(name="%s %s" % (name, year),
                sequence_type=invoice_type, company=self.company,
                prefix=prefix + short + '-', padding=5)
            sequence.save()
            return sequence
        numbering, = fiscalyear.invoice_sequences
        numbering.out_invoice_sequence = series("Customer invoices", 'INV')
        numbering.out_credit_note_sequence = series(
            "Customer credit notes", 'CM')
        numbering.in_invoice_sequence = series("Supplier bills", 'BILL')
        numbering.in_credit_note_sequence = series("Supplier credits", 'VC')
        fiscalyear.save()
        fiscalyear.click('create_period')
        log("fiscal year %s created" % year)

    def term(self, name):
        key = (name or '').strip().upper()
        return self.terms.get(TERMS.get(key, '')) or self.terms.get(
            (name or '').strip())

    # ---- parties ------------------------------------------------------------

    def load_parties(self):
        Party = self.get('party.party')
        for party in Party.find([]):
            self.parties.setdefault(norm(party.name), party)

    def party(self, name, code=None, **values):
        "The party of this name, made when missing"
        Party = self.get('party.party')
        key = norm(name)
        party = self.parties.get(key)
        if party:
            return party
        party = Party(name=one_line(name, 120))
        if code and not Party.find([('code', '=', code)]):
            party.code = code
        address, = party.addresses
        for field in ['street', 'city', 'postal_code']:
            if values.get(field):
                setattr(address, field, values[field])
        for field in ['customer_payment_term', 'supplier_payment_term']:
            if values.get(field):
                setattr(party, field, values[field])
        if values.get('phone'):
            party.contact_mechanisms.new(type='phone', value=values['phone'])
        if values.get('email'):
            party.contact_mechanisms.new(type='email', value=values['email'])
        party.save()
        self.parties[key] = party
        self.count('parties')
        return party

    def jobshop_party(self, kind, row):
        "A Jobshop customer (C) or supplier (V) row as a party"
        street = '\n'.join(filter(None, [row.get('ADDR_1'),
                    row.get('ADDR_2')]))
        term = self.term(row.get('TERMS_RULE_ID'))
        party = self.party(row['NAME'] or row['ID'], code=row['ID'],
            street=street, city=row.get('CITY'),
            postal_code=row.get('POSTAL_CODE'),
            phone=row.get('CONTACT_PHONE'), email=row.get('CONTACT_EMAIL'),
            **{('customer_payment_term' if kind == 'C'
                    else 'supplier_payment_term'): term})
        self.party_by_js[kind, row['ID']] = party
        return party

    def step_parties(self):
        self.load_parties()
        if self.sample:
            customers = self.js.rows("""
                select * from SALES_CUSTOMER where ID in (
                    select CUSTOMER_ID from SALES_SALES_ORDER
                    where ORDER_STATUS in ('RELEASED', 'UNRELEASED', 'HOLD')
                    and RECORD_CREATED >= ?)""", self.sample_since)
            suppliers = self.js.rows("""
                select distinct s.ID from PURCHASING_SUPPLIER s
                where s.ID in (select SUPPLIER_ID from PURCHASING_PURCHASE_ORDER
                    where ORDER_STATUS in ('RELEASED', 'UNRELEASED', 'FIRM',
                        'HOLD'))
                or s.ID in (select PREF_SUPPLIER_ID from INVENTORY_PART p
                    where p.ID in (%s))""" % ','.join(
                    "'%s'" % p.replace("'", "''")
                    for p in sorted(self.wanted_parts) or ['']))
            ids = [s['ID'] for s in suppliers]
            suppliers = []
            for part in chunks(ids):
                suppliers += self.js.rows(
                    "select * from PURCHASING_SUPPLIER where ID in (%s)"
                    % placeholders(part), *part)
        else:
            customers = self.js.rows(
                "select * from SALES_CUSTOMER where isnull(INACTIVE, 0) = 0 "
                "or LAST_ORDER_DATE >= ?", self.cutoff)
            suppliers = self.js.rows(
                "select * from PURCHASING_SUPPLIER where isnull(INACTIVE, 0) "
                "= 0 or LAST_ORDER_DATE >= ?", self.cutoff)
        for row in customers:
            self.jobshop_party('C', row)
        for row in suppliers:
            self.jobshop_party('V', row)
        log("parties: %s customers, %s suppliers read"
            % (len(customers), len(suppliers)))

    def js_party(self, kind, jobshop_id):
        "The party of a Jobshop customer / supplier id, read when missing"
        party = self.party_by_js.get((kind, jobshop_id))
        if party:
            return party
        # The party already made for this ID (a step run on its own has
        # not loaded them: it made a second one, numbered)
        found = self.get('party.party').find([('code', '=', jobshop_id)])
        if found:
            self.party_by_js[kind, jobshop_id] = found[0]
            return found[0]
        if not self.parties:
            self.load_parties()
        table = 'SALES_CUSTOMER' if kind == 'C' else 'PURCHASING_SUPPLIER'
        rows = self.js.rows("select * from %s where ID = ?" % table,
            jobshop_id)
        if not rows:
            return self.party(jobshop_id, code=jobshop_id)
        return self.jobshop_party(kind, rows[0])

    # ---- shop resources ---------------------------------------------------

    def step_resources(self):
        WorkCenter = self.get('production.work.center')
        Operation = self.get('production.routing.operation')
        Category = self.get('production.work.center.category')
        self.centers = {c.name: c for c in WorkCenter.find([])}
        self.operations = {o.name: o for o in Operation.find([])}
        self.center_categories = {c.name: c for c in Category.find([])}
        # A Jobshop operation runs on its own resource: each resource is a
        # category of one work center, which the operation of the same name
        # asks for (so each step of a work order gets its resource)
        # under one shop center, the work center of the work orders, where
        # Tryton looks for the resource of each step
        shop = self.centers.get(SHOP)
        if not shop:
            shop = WorkCenter(name=SHOP)
            shop.save()
            self.centers[SHOP] = shop
        self.shop = shop
        for name, center in self.centers.items():
            values = {}
            if name != SHOP and not center.category:
                values['category'] = self.center_category(name).id
            if name != SHOP and not center.parent:
                values['parent'] = shop.id
            if values:
                WorkCenter.write([center.id], values, self.context)
        for name, operation in self.operations.items():
            if name in self.centers and not operation.work_center_category:
                Operation.write([operation.id], {
                        'work_center_category':
                        self.center_category(name).id}, self.context)
        for row in self.js.rows("select * from SHOPFLOOR_SHOP_RESOURCE "
                "where isnull(INACTIVE, 0) = 0"):
            self.work_center(row)
        log("resources: %s work centers" % len(self.centers))

    def work_center(self, row):
        WorkCenter = self.get('production.work.center')
        name = row['ID']
        if name in self.centers:
            return self.centers[name]
        center = WorkCenter(name=name, category=self.center_category(name),
            parent=self.shop)
        rate = (dec(row.get('RUN_PER_HR')) + dec(row.get('BUR_PER_HR_RUN')))
        if rate:
            center.cost_method = 'hour'
            center.cost_price = rate.quantize(Decimal('0.0001'))
        center.save()
        self.centers[name] = center
        self.count('work centers')
        return center

    def center_category(self, name):
        Category = self.get('production.work.center.category')
        if name not in self.center_categories:
            category = Category(name=name)
            category.save()
            self.center_categories[name] = category
        return self.center_categories[name]

    def operation(self, name):
        Operation = self.get('production.routing.operation')
        name = one_line(name, 60) or 'Operation'
        if name not in self.operations:
            operation = Operation(name=name)
            if name in self.centers:
                operation.work_center_category = self.center_category(name)
            operation.save()
            self.operations[name] = operation
        return self.operations[name]

    # ---- parts ----------------------------------------------------------------

    def want_sample_parts(self):
        "The parts of the open orders and of their masters (all levels)"
        parts = set()
        for sql in [
                "select PART_ID from SHOPFLOOR_WORK_ORDER where SUB_ID = '0' "
                "and ORDER_STATUS in ('RELEASED', 'UNRELEASED', 'FIRM') "
                "and PART_ID is not null and RECORD_CREATED >= ?",
                "select l.PART_ID from SALES_ORDER_LINE l join "
                "SALES_SALES_ORDER o on o.ID = l.SALES_ID where "
                "o.ORDER_STATUS in ('RELEASED', 'UNRELEASED', 'HOLD') "
                "and l.PART_ID is not null and o.RECORD_CREATED >= ?",
                "select l.PART_ID from PURCHASING_ORDER_LINE l join "
                "PURCHASING_PURCHASE_ORDER o on o.ID = l.PURCHASE_ID where "
                "o.ORDER_STATUS in ('RELEASED', 'UNRELEASED', 'FIRM', 'HOLD') "
                "and l.PART_ID is not null and o.RECORD_CREATED >= ?"]:
            parts |= {r['PART_ID'] for r in self.js.rows(sql,
                    self.sample_since)}
        # Down the current masters
        todo = set(parts)
        while todo:
            found = set()
            for part in chunks(todo):
                found |= {r['SUBORD_PART_ID'] for r in self.js.rows("""
                    select m.SUBORD_PART_ID from ENGINEERING_MATERIAL m
                    join INVENTORY_PART p on p.ID = m.PART_ID
                        and p.ENG_ID = m.ENG_ID
                    where m.PART_ID in (%s) and m.SUB_ID = '0'
                    and m.SUBORD_PART_ID is not null""" % placeholders(part),
                        *part)}
            todo = found - parts
            parts |= found
        return parts

    def step_parts(self):
        self.load_products()
        if self.sample:
            ids = sorted(self.wanted_parts)
            rows = []
            for part in chunks(ids):
                rows += self.js.rows("select * from INVENTORY_PART where "
                    "ID in (%s)" % placeholders(part), *part)
        else:
            rows = self.js.rows(
                "select * from INVENTORY_PART where isnull(INACTIVE, 0) = 0")
        salable = {r['PART_ID'] for r in self.js.rows(
                "select distinct PART_ID from SALES_ORDER_LINE "
                "where PART_ID is not null")}
        for i, row in enumerate(rows, 1):
            self.part(row, row['ID'] in salable)
            if i % 250 == 0:
                log("parts: %s of %s" % (i, len(rows)))
        log("parts: %s read" % len(rows))

    def unit(self, symbol):
        Uom = self.get('product.uom')
        if not hasattr(self, '_units'):
            self._units = {}
        symbol = UNITS.get((symbol or 'EA').strip().upper(), 'u')
        if symbol not in self._units:
            found = Uom.find([('symbol', '=', symbol)], limit=1)
            self._units[symbol] = found[0] if found else Uom.find([
                    ('symbol', '=', 'u')], limit=1)[0]
        return self._units[symbol]

    def part(self, row, salable=False):
        Template = self.get('product.template')
        code = row['ID']
        if code in self.products:
            return self.products[code]
        cost = sum(dec(row.get(f)) for f in ['UNIT_MAT_COST',
                'UNIT_LAB_COST', 'UNIT_BUR_COST', 'UNIT_SER_COST'])
        template = Template(
            name=one_line(row.get('DESCRIPTION'), 120) or code,
            type='goods',
            default_uom=self.unit(row.get('STOCK_UM')),
            producible=bool(row.get('FABRICATED')),
            purchasable=bool(row.get('PURCHASED')),
            salable=salable,
            list_price=dec(row.get('UNIT_PRICE')).quantize(
                Decimal('0.0001')),
            cost_price_method='average',
            account_category=self.parts_category,
            engineering_revision=row.get('ENG_ID'),
            drawing_number=row.get('DRAWING_ID'),
            drawing_revision=row.get('DRAWING_REV_NO'))
        # The Jobshop part id is the part's code (one variant per part)
        template.code = code
        product, = template.products
        product.cost_price = cost.quantize(Decimal('0.0001'))
        if row.get('PREF_SUPPLIER_ID') and template.purchasable:
            supplier = template.product_suppliers.new()
            supplier.party = self.js_party('V', row['PREF_SUPPLIER_ID'])
        template.save()
        product, = template.products
        self.products[code] = product
        self.count('parts')
        return product

    def product(self, code):
        "The product of a Jobshop part id, read when missing"
        if not code:
            return None
        if code in self.products:
            return self.products[code]
        rows = self.js.rows("select * from INVENTORY_PART where ID = ?", code)
        if not rows:
            return None
        return self.part(rows[0])

    def service(self, service_id, supplier=None):
        "A purchased outside service (heat treat, coating...)"
        Template = self.get('product.template')
        code = 'SVC-%s' % service_id
        if code in self.products:
            return self.products[code]
        rows = self.js.rows("select * from PURCHASING_SERVICE where ID = ?",
            service_id)
        name = service_id
        if rows:
            row = rows[0]
            name = row.get('DESCRIPTION') or row.get('NAME') or service_id
        template = Template(name=one_line(name, 120), type='service',
            default_uom=self.unit('EA'), purchasable=True,
            list_price=Decimal(0), account_category=self.service_category)
        template.code = code
        product, = template.products
        if supplier:
            template.product_suppliers.new(party=supplier)
        template.save()
        product, = template.products
        self.products[code] = product
        self.count('services')
        return product

    # ---- engineering masters ----------------------------------------------------

    def load_products(self):
        if not self.products:
            Product = self.get('product.product')
            Template = self.get('product.template')
            # (first imports put the part id on the variant)
            for product in Product.find([('suffix_code', '!=', None),
                        ('template.code', '=', None)]):
                code = product.suffix_code
                Product.write([product.id], {'suffix_code': None},
                    self.context)
                Template.write([product.template.id], {'code': code},
                    self.context)
            self.products = {p.code: p for p in Product.find([
                        ('code', '!=', None)])}

    def step_masters(self):
        BOM = self.get('production.bom')
        self.load_products()
        self.boms = {(b.outputs[0].product.code if b.outputs else None,
                    b.revision): b for b in BOM.find([])}
        if not hasattr(self, 'centers'):
            self.step_resources()
        renamed = [(b, self.master_name(b.outputs[0].product))
            for b in self.boms.values() if b.outputs
            and b.outputs[0].product.code
            and not b.name.startswith(b.outputs[0].product.code)]
        for bom, name in renamed:
            BOM.write([bom.id], {'name': name}, self.context)
        products = [p for p in self.products.values()
            if p.template.producible]
        for i, product in enumerate(products, 1):
            self.master(product.code, product.template.engineering_revision)
            if i % 100 == 0:
                log("masters: %s of %s" % (i, len(products)))
        log("masters: %s parts" % len(products))

    @staticmethod
    def master_name(product):
        "Jobshop names a master by its part: <part id> <description>"
        return ('%s %s' % (product.code, product.template.name))[:100]

    def master(self, part_id, eng_id):
        "The BOM and routing of a Jobshop engineering master (main leg)"
        BOM = self.get('production.bom')
        Routing = self.get('production.routing')
        ProductBom = self.get('product.product-production.bom')
        if not eng_id or (part_id, eng_id) in self.boms:
            return self.boms.get((part_id, eng_id))
        product = self.product(part_id)
        heads = self.js.rows("select * from ENGINEERING_MASTER where "
            "PART_ID = ? and ENG_ID = ? and SUB_ID = '0'", part_id, eng_id)
        if not product or not heads:
            return None
        head = heads[0]
        bom = BOM(name=self.master_name(product), revision=eng_id,
            drawing_number=head.get('DRAWING_ID'),
            drawing_revision=head.get('DRAWING_REV_NO'))
        for row in self.js.rows("select * from ENGINEERING_MATERIAL where "
                "PART_ID = ? and ENG_ID = ? and SUB_ID = '0' "
                "order by SEQ_NO, PIECE_NO", part_id, eng_id):
            component = self.product(row['SUBORD_PART_ID'])
            if not component or component == product:
                continue
            line = bom.inputs.new(product=component,
                quantity=float(row['QTY_PER'] or 1))
            line.operation = row['SEQ_NO']
            line.piece = row['PIECE_NO']
            if row.get('SUBORD_ENG_ID') and row['SUBORD_ENG_ID'] != (
                    component.template.engineering_revision):
                line.component_revision = row['SUBORD_ENG_ID']
        bom.outputs.new(product=product, quantity=1)
        bom.save()
        self.boms[part_id, eng_id] = bom
        self.count('masters')

        steps = self.js.rows("select * from ENGINEERING_OPERATION where "
            "PART_ID = ? and ENG_ID = ? and SUB_ID = '0' order by SEQ_NO",
            part_id, eng_id)
        routing = None
        if steps:
            routing = Routing(name=("%s Rev %s" % (part_id, eng_id))[:100])
            routing.boms.append(BOM(bom.id))
            for row in steps:
                step = routing.steps.new(
                    operation=self.operation(row['RESOURCE_ID']),
                    sequence=row['SEQ_NO'])
                if hasattr(step, 'setup_duration'):
                    if row.get('SETUP_HRS'):
                        step.setup_duration = dt.timedelta(
                            hours=float(row['SETUP_HRS']))
                    if row.get('RUN_HRS'):
                        step.run_duration = dt.timedelta(
                            hours=float(row['RUN_HRS']))
                if row.get('SERVICE_ID') and hasattr(step, 'service'):
                    supplier = self.js_party('V', row['SUPPLIER_ID']) \
                        if row.get('SUPPLIER_ID') else None
                    step.supplier = supplier
                    step.service = self.service(row['SERVICE_ID'], supplier)
            routing.save()
        current = product.template.engineering_revision == eng_id
        link = ProductBom(bom=BOM(bom.id), routing=routing)
        product = self.get('product.product')(product.id)
        link.sequence = 0 if current else 10
        product.boms.append(link)
        product.save()
        self.products[part_id] = product
        return bom

    # ---- sales and purchase orders ----------------------------------------------

    def orders(self, table, extra=''):
        if self.sample:
            return self.js.rows("select * from %s where ORDER_STATUS in "
                "('RELEASED', 'UNRELEASED', 'FIRM', 'HOLD') and "
                "RECORD_CREATED >= ? %s order by ID" % (table, extra),
                self.sample_since)
        return self.js.rows("select * from %s where ORDER_DATE >= ? and "
            "ORDER_STATUS <> 'CANCELLED' %s order by ID" % (table, extra),
            self.cutoff)

    def step_sales(self):
        self.load_products()
        Sale = self.get('sale.sale')
        done = {s.number for s in Sale.find([('number', '!=', None)])}
        for head in self.orders('SALES_SALES_ORDER'):
            if head['ID'] in done:
                continue
            party = self.js_party('C', head['CUSTOMER_ID'])
            sale = Sale(party=party, reference=head.get('CUSTOMER_PO_REF'),
                sale_date=day(head['ORDER_DATE']),
                description=one_line(head.get('NAME'), 100) or None)
            if head.get('TERMS_RULE_ID') and self.term(head['TERMS_RULE_ID']):
                sale.payment_term = self.term(head['TERMS_RULE_ID'])
            lines = self.js.rows("select * from SALES_ORDER_LINE where "
                "SALES_ID = ? order by LINE_NO", head['ID'])
            for row in lines:
                line = sale.lines.new()
                product = self.product(row.get('PART_ID'))
                if product and product.template.salable:
                    line.product = product
                else:
                    line.description = (row.get('DESCRIPTION')
                        or row.get('PART_ID') or 'Line')
                line.quantity = float(row['ORDER_QTY'] or 1)
                line.unit_price = dec(row.get('UNIT_PRICE')).quantize(
                    Decimal('0.0001'))
            if not sale.lines:
                continue
            sale.save()
            Sale.write([sale.id], {'number': head['ID']}, self.context)
            sale.reload()
            if head['ORDER_STATUS'] in ('RELEASED', 'CLOSED'):
                sale.click('quote')
                sale.click('confirm')
            self.count('sales orders')
        log("sales orders: %s" % self.counts['sales orders'])

    def step_purchases(self):
        self.load_products()
        Purchase = self.get('purchase.purchase')
        done = {p.number for p in Purchase.find([('number', '!=', None)])}
        for head in self.orders('PURCHASING_PURCHASE_ORDER'):
            if head['ID'] in done:
                continue
            party = self.js_party('V', head['SUPPLIER_ID'])
            purchase = Purchase(party=party,
                purchase_date=day(head['ORDER_DATE']),
                reference=head.get('SUPPLIER_QUOTE_REF'))
            if head.get('TERMS_RULE_ID') and self.term(head['TERMS_RULE_ID']):
                purchase.payment_term = self.term(head['TERMS_RULE_ID'])
            for row in self.js.rows("select * from PURCHASING_ORDER_LINE "
                    "where PURCHASE_ID = ? order by LINE_NO", head['ID']):
                line = purchase.lines.new()
                product = None
                if row.get('SERVICE_ID'):
                    product = self.service(row['SERVICE_ID'], party)
                elif row.get('PART_ID'):
                    product = self.product(row['PART_ID'])
                    if product and not product.template.purchasable:
                        product = None
                if product:
                    line.product = product
                line.description = (row.get('DESCRIPTION')
                    or row.get('PART_ID') or row.get('SERVICE_ID') or 'Line')
                line.quantity = float(row['ORDER_QTY'] or 1)
                line.unit_price = dec(row.get('UNIT_PRICE')).quantize(
                    Decimal('0.0001'))
            if not purchase.lines:
                continue
            purchase.save()
            Purchase.write([purchase.id], {'number': head['ID']}, self.context)
            purchase.reload()
            if head['ORDER_STATUS'] in ('RELEASED', 'CLOSED'):
                purchase.click('quote')
                purchase.click('confirm')
            self.count('purchase orders')
        log("purchase orders: %s" % self.counts['purchase orders'])

    # ---- work orders ----------------------------------------------------------------

    def step_workorders(self):
        Production = self.get('production')
        Location = self.get('stock.location')
        warehouse, = Location.find([('type', '=', 'warehouse')], limit=1)
        existing = {p.number: p for p in Production.find([
                    ('number', '!=', None)])}
        done = set(existing)
        if not hasattr(self, 'centers'):
            self.step_resources()
        if not hasattr(self, 'boms'):
            self.step_masters()
        statuses = ('RELEASED', 'UNRELEASED', 'FIRM') if self.sample else (
            'RELEASED', 'UNRELEASED', 'FIRM', 'HOLD')
        rows = self.js.rows("select * from SHOPFLOOR_WORK_ORDER where "
            "SUB_ID = '0' and PART_ID is not null and ORDER_STATUS in (%s) "
            "and RECORD_CREATED >= ? order by WORK_ID, LOT_ID, SPLIT_ID"
            % placeholders(statuses), *statuses,
            self.sample_since if self.sample else self.cutoff)
        for row in rows:
            number = row['WORK_ID'] + ('' if row['LOT_ID'] in ('1', None)
                else '/' + row['LOT_ID']) + ('' if row['SPLIT_ID'] in (
                    '0', None) else '.' + row['SPLIT_ID'])
            if number in done:
                # Released in Jobshop, still draft here (earlier runs)
                production = existing.get(number)
                if production and production.state == 'draft' and                         row['ORDER_STATUS'] == 'RELEASED':
                    if production.routing and production.work_center !=                             self.shop:
                        production.work_center = self.shop
                        production.save()
                    self.release(production, number)
                if production:
                    self.legs(production, row)
                continue
            product = self.product(row['PART_ID'])
            if not product or not product.template.producible:
                continue
            bom = self.master(row['PART_ID'], row.get('ENG_ID')
                or product.template.engineering_revision)
            production = Production(number=number, company=self.company,
                warehouse=warehouse, location=warehouse.production_location)
            production.product = product
            if bom:
                production.bom = bom
                # The routing of the master, as the desk's work orders do
                link = next((l for l in self.get('product.product')(
                            product.id).boms if l.bom.id == bom.id), None)
                if link and link.routing:
                    production.routing = link.routing
            production.quantity = float(row['DESIRED_QTY'] or 1)
            if getattr(production, 'routing', None):
                production.work_center = self.shop
            if day(row.get('DESIRED_RLS_DATE')):
                production.planned_start_date = day(row['DESIRED_RLS_DATE'])
            if day(row.get('DESIRED_WANT_DATE')):
                production.planned_date = day(row['DESIRED_WANT_DATE'])
            production.save()
            if row['ORDER_STATUS'] == 'RELEASED':
                self.release(production, number)
            self.legs(production, row)
            done.add(number)
            self.count('work orders')
        log("work orders: %s, legs: %s" % (self.counts['work orders'],
                self.counts['legs']))

    def wip_location(self, warehouse):
        "The location legs deliver to their parent through (nline_wip)"
        if warehouse.production_wip_location:
            return warehouse.production_wip_location
        Location = self.get('stock.location')
        wip = Location(name="Production WIP", type='production',
            parent=warehouse)
        wip.save()
        warehouse.production_wip_location = wip
        warehouse.save()
        return wip

    def legs(self, production, row):
        """The legs of a Jobshop work order as legs of the production.

        A Jobshop leg is the SUB_ID of its operations and materials; the
        material it feeds (in the main leg or another leg) has its number in
        SUBORD_SUB_ID. Each is made from the master of its part, as the desk
        does when a master is dropped on the card, and keeps its Jobshop
        number (<work order>/<SUB_ID>)."""
        feeds = self.js.rows("select SUB_ID, SEQ_NO, PIECE_NO, SUBORD_SUB_ID, "
            "SUBORD_PART_ID, SUBORD_ENG_ID from SHOPFLOOR_MATERIAL where "
            "WORK_ID = ? and LOT_ID = ? and SPLIT_ID = ? and "
            "SUBORD_SUB_ID is not null and SUBORD_PART_ID is not null",
            row['WORK_ID'], row['LOT_ID'], row['SPLIT_ID'])
        if not feeds:
            return
        Production = self.get('production')
        Card = self.get('production.material_card')
        Desk = self.get('nline.desk')
        production.reload()
        if production.state not in ('request', 'draft', 'waiting'):
            return
        self.wip_location(production.warehouse)
        made = {'0': production}
        for leg in Production.find([
                    ('parent', 'child_of', [production.id], 'parent'),
                    ('id', '!=', production.id)]):
            made[str(leg.leg_index)] = leg
        todo = sorted(feeds, key=lambda r: int(r['SUBORD_SUB_ID']))
        while todo:
            # A leg can feed another leg: make its parent first
            ready = [r for r in todo if r['SUB_ID'] in made]
            if not ready:
                log("work order %s: legs %s feed no leg imported" % (
                        production.number,
                        ', '.join(r['SUBORD_SUB_ID'] for r in todo)))
                break
            for feed in ready:
                todo.remove(feed)
                sub = feed['SUBORD_SUB_ID']
                if sub in made:
                    continue
                parent = made[feed['SUB_ID']]
                leg = self.make_leg(production, parent, feed, Card, Desk)
                if leg:
                    made[sub] = leg
                    self.count('legs')

    def make_leg(self, root, parent, feed, Card, Desk):
        Production = self.get('production')
        part = feed['SUBORD_PART_ID']
        product = self.product(part)
        where = "work order %s leg %s (%s)" % (root.number,
            feed['SUBORD_SUB_ID'], part)
        if not product or not product.template.producible:
            log("%s: not a fabricated part, left on stock" % where)
            return None
        bom = self.master(part, feed.get('SUBORD_ENG_ID')
            or product.template.engineering_revision)
        product = self.get('product.product')(product.id)
        link = next((l for l in product.boms if bom and l.bom.id == bom.id),
            None)
        if not link:
            log("%s: no engineering master, left on stock" % where)
            return None
        cards = [c for c in Card.find([
                    ('production', '=', parent.id),
                    ('supply', '=', 'stock')])
            if c.product.id == product.id]
        if not cards:
            log("%s: no material card of the part on %s" % (where,
                    parent.number))
            return None
        card = next((c for c in cards if c.piece == feed['PIECE_NO']),
            cards[0])
        try:
            Desk.make_leg(card.id, link.id, self.context)
        except Exception as error:
            log("%s: not made: %s" % (where, error))
            return None
        card.reload()
        leg = Production(card.leg.id)
        # Jobshop's leg number, whatever the order they were made in
        index = int(feed['SUBORD_SUB_ID'])
        if leg.leg_index != index:
            Production.write([leg.id], {'leg_index': index,
                    'number': '%s/%s' % (root.number, index)}, self.context)
            leg.reload()
        return leg

    def release(self, production, number):
        try:
            production.click('wait')
            self.count('work orders released')
        except Exception as error:
            log("work order %s not released: %s" % (number, error))

    # ---- QuickBooks: bills, invoices, checks ---------------------------------------

    def accounts_by_path(self):
        "QuickBooks account full names (A:B) -> ERP accounts"
        if hasattr(self, '_paths'):
            return self._paths
        Account = self.get('account.account')
        accounts = Account.find([])
        by_id = {a.id: a for a in accounts}
        paths = {}
        for account in accounts:
            names, parent = [], account
            while parent and parent.parent:
                names.insert(0, parent.name)
                parent = by_id.get(parent.parent.id)
            paths.setdefault(':'.join(names).upper(), account)
            paths.setdefault(account.name.upper(), account)
        self._paths = paths
        return paths

    def qb_account(self, full_name, fallback=None):
        paths = self.accounts_by_path()
        name = (full_name or '').upper()
        return (paths.get(name) or paths.get(name.split(':')[-1])
            or fallback)

    def line_account(self, full_name, kind, description):
        """The account of a bill (expense) or invoice (revenue) line: a
        QuickBooks account Tryton refuses on such a line (Purchase Accrual,
        a liability) goes to COGS / sales, its name kept in the text"""
        account = self.qb_account(full_name)
        if account and getattr(account.type, kind):
            return account.id, description
        fallback = self.parts_category.account_expense if kind == 'expense'             else self.parts_category.account_revenue
        return fallback.id, '%s [QB: %s]' % (description, full_name)

    def qb_party(self, name):
        return self.party(name)

    def desk(self, method, values, *args):
        Desk = self.get('nline.desk')
        values = dict(values, accept_warnings=True)
        return getattr(Desk, method)(values, *(args + (self.context,)))

    def qb_since(self):
        return dt.date(dt.date.today().year, 1, 1) if self.sample \
            else self.cutoff

    def step_bills(self):
        Invoice = self.get('account.invoice')
        self.load_parties()
        done = {(i.party.id, i.reference) for i in Invoice.find([
                    ('type', '=', 'in')])}
        where = "IsPaid = 0 and TxnDate >= ?" if self.sample else \
            "TxnDate >= ?"
        for bill in self.qb.rows("select * from Bill where %s order by "
                "TxnDate" % where, self.qb_since()):
            party = self.qb_party(bill['VendorRefFullName'])
            if (party.id, bill['RefNumber']) in done:
                continue
            lines = []
            for row in self.qb.rows("select * from BillExpenseLine where "
                    "TxnID = ? order by ExpenseLineSeqNo", bill['TxnID']):
                if not row['ExpenseLineAmount']:
                    continue
                account, text = self.line_account(
                    row['ExpenseLineAccountRefFullName'], 'expense',
                    row['ExpenseLineMemo'] or bill['Memo'] or 'Expense')
                lines.append({'account': account, 'description': text,
                        'quantity': 1,
                        'unit_price': str(row['ExpenseLineAmount'])})
            for row in self.qb.rows("select * from BillItemLine where "
                    "TxnID = ? order by ItemLineSeqNo", bill['TxnID']):
                if not row['ItemLineAmount']:
                    continue
                account, text = self.line_account('Purchase Accrual',
                    'expense', row['ItemLineDesc']
                    or row['ItemLineItemRefFullName'] or 'Item')
                lines.append({'account': account, 'description': text,
                        'quantity': 1,
                        'unit_price': str(row['ItemLineAmount'])})
            if not lines or sum(Decimal(l['unit_price']) for l in lines) <= 0:
                continue
            term = self.term(bill.get('TermsRefFullName'))
            self.desk('enter_bill', {'party': party.id,
                    'date': day(bill['TxnDate']),
                    'reference': bill['RefNumber'], 'memo': bill['Memo'],
                    'payment_term': term.id if term else None,
                    'lines': lines})
            done.add((party.id, bill['RefNumber']))
            self.count('bills')
        log("bills: %s" % self.counts['bills'])

    def step_invoices(self):
        Invoice = self.get('account.invoice')
        self.load_parties()
        sales = self.qb_account('Sales - Manufactor Goods')
        items = {r['FullName'].upper(): r for r in self.qb.rows(
                "select FullName, IncomeAccountRefFullName, "
                "SalesOrPurchaseAccountRefFullName, "
                "SalesAndPurchaseIncomeAccountRefFullName from Item")}
        done = {(i.party.id, i.reference) for i in Invoice.find([
                    ('type', '=', 'out')])}
        where = "IsPaid = 0 and TxnDate >= ?" if self.sample else \
            "TxnDate >= ?"
        for invoice in self.qb.rows("select * from Invoice where %s order "
                "by TxnDate" % where, self.qb_since()):
            party = self.qb_party(invoice['CustomerRefFullName'])
            reference = invoice['PONumber'] or invoice['RefNumber']
            if (party.id, reference) in done:
                continue
            lines = []
            for row in self.qb.rows("select * from InvoiceLine where "
                    "TxnID = ? order by InvoiceLineSeqNo", invoice['TxnID']):
                if not row['InvoiceLineAmount']:
                    continue
                item = items.get((row['InvoiceLineItemRefFullName']
                        or '').upper()) or {}
                account, text = self.line_account(
                    item.get('IncomeAccountRefFullName')
                    or item.get('SalesAndPurchaseIncomeAccountRefFullName')
                    or item.get('SalesOrPurchaseAccountRefFullName')
                    or sales.name, 'revenue', row['InvoiceLineDesc']
                    or row['InvoiceLineItemRefFullName'] or 'Item')
                quantity = row['InvoiceLineQuantity'] or 1
                lines.append({'account': account, 'description': text,
                        'quantity': 1,
                        'unit_price': str(row['InvoiceLineAmount']),
                        'memo_quantity': str(quantity)})
            if not lines or sum(Decimal(l['unit_price']) for l in lines) <= 0:
                continue
            for line in lines:
                line.pop('memo_quantity')
            term = self.term(invoice.get('TermsRefFullName'))
            self.desk('create_invoice', {'party': party.id,
                    'date': day(invoice['TxnDate']), 'reference': reference,
                    'memo': invoice['Memo'] or 'QuickBooks invoice %s'
                    % invoice['RefNumber'],
                    'payment_term': term.id if term else None,
                    'lines': lines})
            done.add((party.id, reference))
            self.count('invoices')
        log("invoices: %s" % self.counts['invoices'])

    def step_checks(self):
        PaymentJournal = self.get('account.payment.journal')
        Payment = self.get('account.payment')
        Sequence = self.get('ir.sequence')
        self.load_parties()
        journal, = PaymentJournal.find([('name', '=', "Chase 9807 Checks")])
        sequence = Sequence(journal.check_sequence.id)
        done = {p.check_number for p in Payment.find([
                    ('journal', '=', journal.id)])
            if getattr(p, 'check_number', None)}
        since = (dt.date.today() - dt.timedelta(days=90)) if self.sample \
            else self.cutoff
        checks = self.qb.rows("select * from [Check] where AccountRefFullName "
            "like '%9807' and RefNumber not like '%[^0-9]%' and TxnDate >= ? "
            "order by cast(RefNumber as int)", since)
        last = sequence.number_next
        for check in checks:
            if check['RefNumber'] in done or not check['Amount']:
                continue
            lines = []
            for row in self.qb.rows("select * from CheckExpenseLine where "
                    "TxnID = ? order by ExpenseLineSeqNo", check['TxnID']):
                if not row['ExpenseLineAmount']:
                    continue
                account, text = self.line_account(
                    row['ExpenseLineAccountRefFullName'], 'expense',
                    row['ExpenseLineMemo'] or check['Memo'] or 'Expense')
                lines.append({'account': account, 'description': text,
                        'amount': str(row['ExpenseLineAmount'])})
            if not lines:
                continue
            sequence.number_next = int(check['RefNumber'])
            sequence.save()
            party = self.qb_party(check['PayeeEntityRefFullName']
                or 'Unknown payee')
            self.desk('write_check', {'journal': journal.id,
                    'party': party.id, 'date': day(check['TxnDate']),
                    'memo': check['Memo'] or 'Check %s' % check['RefNumber'],
                    'lines': lines})
            self.count('checks')
        # Back to the next check number of the checkbook
        sequence.reload()
        sequence.number_next = max(last, sequence.number_next)
        sequence.save()
        log("checks: %s" % self.counts['checks'])

    def step_jobshop(self, area):
        "The data of a Jobshop emulation area (migration/jobshop/<area>.py)"
        import importlib
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            module = importlib.import_module('jobshop.' + area)
        except ModuleNotFoundError:
            log("jobshop %s: no data to import yet" % area)
            return
        # Run alone (--steps js_...), the areas still find the parties and
        # parts imported by earlier runs (both steps keep what exists)
        if area != 'common' and not self.party_by_js:
            self.step_parties()
        self.load_products()
        module.run(self)

    # ---- run ----------------------------------------------------------------------

    def run(self, steps):
        # The open orders of the last year are the sample
        self.sample_since = dt.date.today() - dt.timedelta(days=365)
        if 'base' in steps or not hasattr(self, 'parts_category'):
            self.step_base()
        if self.sample:
            self.wanted_parts = self.want_sample_parts()
            log("sample: %s parts in the open orders and their masters"
                % len(self.wanted_parts))
        for step in STEPS[1:]:
            if step in steps:
                started = time.time()
                if step.startswith('js_'):
                    self.step_jobshop(step[3:])
                else:
                    getattr(self, 'step_' + step)()
                log("step %s done in %.0f s" % (step, time.time() - started))
        log("made: " + ', '.join('%s %s' % (n, what)
                for what, n in sorted(self.counts.items())) or 'nothing new')


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--config', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--mode', choices=['sample', 'full'],
        default='sample')
    parser.add_argument('--cutoff', type=dt.date.fromisoformat,
        default=dt.date(dt.date.today().year - 5, 1, 1),
        help="full mode: the first day of the transactions brought over "
        "(default: January 1st five years ago)")
    parser.add_argument('--steps', default=','.join(STEPS),
        help="comma separated, in this order: %s" % ','.join(STEPS))
    parser.add_argument('--sql-server', default=SQL_SERVER)
    args = parser.parse_args()
    steps = [s for s in args.steps.split(',') if s]
    unknown = set(steps) - set(STEPS)
    if unknown:
        sys.exit("Unknown steps: %s" % ', '.join(sorted(unknown)))
    Migration(args).run(steps)


if __name__ == '__main__':
    main()
