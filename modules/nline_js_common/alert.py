# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Alert Messages (File > Alert Messages; SHARED_USER_ALERT and
SHARED_USER_MESSAGE): the alerts a user sets ("tell me when a purchase order
is late") and the messages they trigger. Each user sees only their own."""
from trytond.model import ModelSQL, ModelView, Unique, fields
from trytond.pool import Pool, PoolMeta
from trytond.transaction import Transaction

# Jobshop's alert_type, alert_change, alert_action (Domains.schema)
ALERT_TYPES = [
    ('so', "Sales Order"),
    ('po', "Purchase Order"),
    ('wo', "Work Order"),
    ('qt', "Quote"),
    ('cus', "Customer"),
    ('shp', "Shipper"),
    ('inv', "Invoice"),
    ('sup', "Supplier"),
    ('rfq', "Request For Quote"),
    ('rec', "Receiver"),
    ('em', "Engineering Master"),
    ('ip', "Inventory Part"),
    ]
ALERT_CHANGES = [
    ('hold', "Released Status Changed to Hold"),
    ('cancelled', "Released Status Changed to Cancelled"),
    ('released', "UnReleased Status Changed to Released"),
    ('late', "Item is Late"),
    ('lab_hrs', "Labor Hours Exceeds Estimate"),
    ('lab_cost', "Labor Cost Exceeds Estimate"),
    ('mat_cost', "Material Cost Exceeds Estimate"),
    ('deviated_qty', "Deviated Quantity Reported"),
    ('note', "Note Added (user option)"),
    ('unapproved', "Status Changed to Waiting Approval"),
    ('wo_sched_late', "Work Order Scheduled to Finish Late"),
    ('out_ser_beg', "Outside Service Scheduled Start is Late"),
    ('out_ser_fin', "Outside Service Scheduled Finish is Late"),
    ('promised', "Open Quote Reached Promised Date"),
    ('followup', "Open Quote Reached Follow Up Date"),
    ('expired', "Open Quote has Expired"),
    ('expected_win', "Open Quote Reached Expected Win Date"),
    ('credit_status', "Credit Status Changed"),
    ('credit_limit', "Order Limit Changed"),
    ('status_change', "Status Changed"),
    ('line_status', "Line Status Changed (Firm or Released Order)"),
    ('line_deleted', "Line Deleted (Firm or Released Order)"),
    ('order_qty', "Order Quantity Changed (Firm or Released Order)"),
    ('desired_ship', "Desired Ship Date Changed (Firm or Released Order)"),
    ('shipped', "Sales Order Shipped"),
    ('shipper_ret', "Sales Order Returned"),
    ('invoiced', "Shipment was Invoiced"),
    ('printed', "Document was Printed"),
    ('received', "Purchase Order Received"),
    ('receiver_ret', "Purchase Order Returned"),
    ('desired_recv',
        "Desired Receive On Date Changed (Firm or Released Order)"),
    ('desired_want', "Desired Want Date Changed (Firm or Released Order)"),
    ('desired_rls',
        "Desired Release Date Changed (Firm or Released Order)"),
    ('em_rev_change', "Engineering Master Revision Changed"),
    ('cost_change', "Cost Changed"),
    ('price_change', "Price Changed"),
    ('prim_loc_change', "Primary Location Changed"),
    ('new_em_created', "New Engineering Master Created"),
    ('has_changed', "Document has Changed"),
    ]
ALERT_ACTIONS = [
    ('manual', "Manual"),
    ('email', "Email"),
    ]

# The documents of the alert types the ERP has
DOCUMENTS = {
    'so': 'sale.sale',
    'po': 'purchase.purchase',
    'wo': 'production',
    'cus': 'party.party',
    'sup': 'party.party',
    'inv': 'account.invoice',
    'shp': 'stock.shipment.out',
    'rec': 'stock.shipment.in',
    'ip': 'product.product',
    }
# The alerts the ERP raises by itself (the cron and Refresh): type, change
GENERATED = {('so', 'late'), ('po', 'late'), ('wo', 'late')}


class UserAlert(ModelSQL, ModelView):
    "User Alert"
    __name__ = 'nline.user_alert'
    user = fields.Many2One(
        'res.user', "User", required=True, ondelete='CASCADE')
    alert_type = fields.Selection(ALERT_TYPES, "Alert Type", required=True,
        help="What item to watch.")
    alert_change = fields.Selection(
        ALERT_CHANGES, "Alert Change", required=True,
        help="What about the item triggers the message.")
    alert_action = fields.Selection(
        ALERT_ACTIONS, "Alert Action", required=True,
        help="How the user is told: a message in the ERP (Manual) or an "
        "email too.")
    recipient = fields.Char(
        "Recipient",
        help="The email addresses the message goes to, separated by "
        "semicolons.")
    subject = fields.Char("Subject")
    generated = fields.Function(fields.Boolean(
            "Raised by the ERP",
            help="The ERP raises this alert by itself (the others wait for "
            "their screens)."), 'get_generated')

    @classmethod
    def __setup__(cls):
        super().__setup__()
        t = cls.__table__()
        cls._sql_constraints += [
            ('alert_unique',
                Unique(t, t.user, t.alert_type, t.alert_change,
                    t.alert_action),
                'nline_js_common.msg_alert_unique'),
            ]
        cls._order = [('user', 'ASC'), ('alert_type', 'ASC'),
            ('alert_change', 'ASC')]

    @staticmethod
    def default_user():
        return Transaction().user or None

    @staticmethod
    def default_alert_action():
        return 'manual'

    @staticmethod
    def default_alert_change():
        return 'late'

    def get_generated(self, name):
        return (self.alert_type, self.alert_change) in GENERATED

    def get_rec_name(self, name):
        return '%s: %s' % (self.alert_type_string, self.alert_change_string)

    alert_type_string = alert_type.translated('alert_type')
    alert_change_string = alert_change.translated('alert_change')


class AlertMessage(ModelSQL, ModelView):
    "Alert Message"
    __name__ = 'nline.alert_message'
    user = fields.Many2One(
        'res.user', "User", required=True, ondelete='CASCADE')
    alert_type = fields.Selection(ALERT_TYPES, "Alert Type", required=True)
    alert_change = fields.Selection(
        ALERT_CHANGES, "Alert Change", required=True)
    alert_action = fields.Selection(
        ALERT_ACTIONS, "Alert Action", required=True)
    document = fields.Reference(
        "Document", selection='get_documents',
        help="The document the message is about.")
    recipient = fields.Char("Recipient")
    subject = fields.Char("Subject")
    message = fields.Char("Message")
    sent_on = fields.DateTime(
        "Sent On", help="When the email was sent.")
    archived = fields.Boolean(
        "Archived", help="Read: not shown with the unread messages.")
    jobshop_identity = fields.Char(
        "Jobshop Record",
        help="The RECORD_IDENTITY of the message imported from Jobshop.")

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls._order = [('create_date', 'DESC'), ('id', 'DESC')]

    alert_type_string = alert_type.translated('alert_type')
    alert_change_string = alert_change.translated('alert_change')
    alert_action_string = alert_action.translated('alert_action')

    @staticmethod
    def default_user():
        return Transaction().user or None

    @staticmethod
    def default_alert_action():
        return 'manual'

    @staticmethod
    def default_archived():
        return False

    @classmethod
    def get_documents(cls):
        pool = Pool()
        Model = pool.get('ir.model')
        names = sorted(set(DOCUMENTS.values()))
        models = Model.search([('model', 'in', names)])
        return [(None, '')] + [(m.model, m.name) for m in models]

    def get_rec_name(self, name):
        return self.subject or self.message or str(self.id)

    # ---- raising the alerts --------------------------------------------

    @classmethod
    def _late(cls, alert_type, today):
        "The late documents of a type: [(document, its number)]"
        pool = Pool()
        if alert_type == 'so':
            Sale = pool.get('sale.sale')
            sales = Sale.search([
                    ('state', 'in', ['confirmed', 'processing']),
                    ('shipment_state', '!=', 'sent'),
                    ('shipping_date', '<', today),
                    ])
            return [(s, s.number or s.reference or str(s.id))
                for s in sales]
        if alert_type == 'po':
            Purchase = pool.get('purchase.purchase')
            purchases = Purchase.search([
                    ('state', 'in', ['confirmed', 'processing']),
                    ('shipment_state', '!=', 'received'),
                    ('delivery_date', '<', today),
                    ])
            return [(p, p.number or p.reference or str(p.id))
                for p in purchases]
        if alert_type == 'wo':
            Production = pool.get('production')
            productions = Production.search([
                    ('state', 'in', [
                            'request', 'draft', 'waiting', 'assigned',
                            'running']),
                    ('planned_date', '<', today),
                    ])
            return [(p, p.number or str(p.id)) for p in productions]
        return []

    @classmethod
    def generate(cls, users=None):
        """Raise the messages of the alerts the ERP watches (late sales,
        purchase and work orders) once per user, document and change.
        Return the new messages."""
        pool = Pool()
        Alert = pool.get('nline.user_alert')
        Date = pool.get('ir.date')
        today = Date.today()
        domain = [['OR'] + [[
                    ('alert_type', '=', t), ('alert_change', '=', c)]
                for t, c in sorted(GENERATED)]]
        if users is not None:
            domain.append(('user', 'in', [int(u) for u in users]))
        to_create = []
        with Transaction().set_context(_check_access=False):
            alerts = Alert.search(domain)
            late = {}
            for alert in alerts:
                if alert.alert_type not in late:
                    late[alert.alert_type] = cls._late(
                        alert.alert_type, today)
                documents = late[alert.alert_type]
                if not documents:
                    continue
                refs = [str(d) for d, _ in documents]
                known = {str(m.document) for m in cls.search([
                            ('user', '=', alert.user.id),
                            ('alert_change', '=', alert.alert_change),
                            ('document', 'in', refs),
                            ])}
                label = dict(ALERT_TYPES)[alert.alert_type]
                for document, number in documents:
                    if str(document) in known:
                        continue
                    to_create.append({
                            'user': alert.user.id,
                            'alert_type': alert.alert_type,
                            'alert_change': alert.alert_change,
                            'alert_action': alert.alert_action,
                            'document': str(document),
                            'recipient': alert.recipient,
                            'subject': alert.subject or '%s Overdue' % (
                                alert.alert_type.upper()),
                            'message': "%s '%s' is late." % (
                                label, number),
                            })
            return cls.create(to_create) if to_create else []

    @classmethod
    def generate_all(cls):
        "The cron: every user's alerts"
        cls.generate()


class Rule(metaclass=PoolMeta):
    __name__ = 'ir.rule'

    @classmethod
    def _get_context(cls, model_name):
        context = super()._get_context(model_name)
        if model_name in {'nline.user_alert', 'nline.alert_message'}:
            context['user_id'] = Transaction().user
        return context

    @classmethod
    def _get_cache_key(cls, model_name):
        key = super()._get_cache_key(model_name)
        if model_name in {'nline.user_alert', 'nline.alert_message'}:
            key = (*key, Transaction().user)
        return key


class Cron(metaclass=PoolMeta):
    __name__ = 'ir.cron'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        cls.method.selection.append(
            ('nline.alert_message|generate_all', "Raise Alert Messages"))


MODELS = [UserAlert, AlertMessage, Rule, Cron]

