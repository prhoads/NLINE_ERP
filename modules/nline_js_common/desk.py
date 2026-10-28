# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""The desk services of the Jobshop Common screens: the user's alert
messages (File > Alert Messages, Home) and the User Control Panel"""
from trytond.config import config
from trytond.i18n import gettext
from trytond.model.exceptions import AccessError
from trytond.pool import Pool, PoolMeta
from trytond.rpc import RPC
from trytond.transaction import Transaction

# The tables the code table grid (common.js codeTable) saves, besides the
# CodeTable models of every Jobshop area
TABLES = {'country.subdivision', 'country.postal_code',
    'account.invoice.payment_term', 'currency.currency', 'nline.user_alert'}

# The preferences a user changes in the User Control Panel. Never the
# password: N-Line BI signs people in and keeps their passwords.
PREFERENCES = ['language', 'email', 'signature', 'company', 'employee',
    'warehouse']


class Desk(metaclass=PoolMeta):
    __name__ = 'nline.desk'

    @classmethod
    def __setup__(cls):
        super().__setup__()
        for name in [
                'common_save_table', 'common_archive_alerts',
                'common_refresh_alerts', 'common_set_preferences']:
            cls.__rpc__[name] = RPC(readonly=False)
        for name in [
                'common_alerts', 'common_alert_count',
                'common_preferences']:
            cls.__rpc__[name] = RPC()

    # ---- The code table grid ---------------------------------------------

    @classmethod
    def common_save_table(cls, model, changes):
        """Save the changes of a Jobshop table window at once, as Jobshop's
        Save does: {delete: [ids], write: [[id, values]], create: [values]}.
        Return the ids created."""
        from .common import CodeTable
        pool = Pool()
        try:
            Model = pool.get(model)
        except KeyError:
            Model = None
        if Model is None or not (model in TABLES
                or issubclass(Model, CodeTable)):
            raise AccessError(gettext(
                    'nline_js_common.msg_table_not_allowed', model=model))
        to_delete = [int(i) for i in changes.get('delete') or []]
        to_write = changes.get('write') or []
        to_create = changes.get('create') or []
        if to_delete:
            ModelAccess = pool.get('ir.model.access')
            ModelAccess.check(model, 'delete')
            Model.delete(Model.browse(to_delete))
        if to_write:
            cls._check_write(model)
            args = []
            for record_id, values in to_write:
                args.extend([Model.browse([int(record_id)]), values])
            Model.write(*args)
        created = []
        if to_create:
            cls._check_create(model)
            created = Model.create(to_create)
        return [r.id for r in created]

    # ---- Alert Messages --------------------------------------------------

    @classmethod
    def common_alerts(cls, archived=False, limit=100):
        """The user's alert messages, newest first (the unread ones unless
        archived is true): [{id, date, type, change, subject, message,
        document: [model, id, name] | None, archived}]"""
        pool = Pool()
        Message = pool.get('nline.alert_message')
        cls._check_read('nline.alert_message')
        domain = [('user', '=', Transaction().user)]
        if not archived:
            domain.append(('archived', '=', False))
        result = []
        for message in Message.search(domain, limit=limit):
            document = None
            if message.document and message.document.id >= 0:
                try:
                    document = [message.document.__name__,
                        message.document.id, message.document.rec_name]
                except Exception:
                    # A document deleted or out of the user's rights
                    document = None
            result.append({
                    'id': message.id,
                    'date': message.create_date,
                    'type': message.alert_type,
                    'type_string': message.alert_type_string,
                    'change': message.alert_change,
                    'change_string': message.alert_change_string,
                    'subject': message.subject,
                    'message': message.message,
                    'document': document,
                    'archived': message.archived,
                    })
        return result

    @classmethod
    def common_alert_count(cls):
        "The number of the user's unread alert messages (Home)"
        Message = Pool().get('nline.alert_message')
        cls._check_read('nline.alert_message')
        return Message.search_count([
                ('user', '=', Transaction().user),
                ('archived', '=', False),
                ])

    @classmethod
    def common_archive_alerts(cls, ids, archived=True):
        "Mark the user's messages read (archived) or unread again"
        Message = Pool().get('nline.alert_message')
        cls._check_write('nline.alert_message')
        messages = Message.search([
                ('id', 'in', [int(i) for i in ids]),
                ('user', '=', Transaction().user),
                ])
        if messages:
            Message.write(messages, {'archived': bool(archived)})
        return len(messages)

    @classmethod
    def common_refresh_alerts(cls):
        "Raise the user's alerts now; return the number of new messages"
        Message = Pool().get('nline.alert_message')
        cls._check_read('nline.user_alert')
        return len(Message.generate([Transaction().user]))

    # ---- User Control Panel --------------------------------------------

    @classmethod
    def common_preferences(cls):
        """The user's preferences and what they may choose from; where the
        password is changed (N-Line BI)"""
        pool = Pool()
        User = pool.get('res.user')
        Lang = pool.get('ir.lang')
        user = User(Transaction().user)

        def ref(record):
            return [record.id, record.rec_name] if record else None

        def choices(records):
            return [[r.id, r.rec_name] for r in records]

        result = {
            'name': user.name,
            'login': user.login,
            'email': user.email,
            'signature': user.signature,
            'language': user.language.code if user.language else None,
            'languages': [[l.code, l.name] for l in Lang.search([
                        ('translatable', '=', True)])],
            }
        if hasattr(user, 'company'):
            result['company'] = ref(user.company)
            result['companies'] = choices(user.companies)
            result['employee'] = ref(user.employee)
            result['employees'] = choices(user.employees)
        if hasattr(user, 'warehouse'):
            Location = pool.get('stock.location')
            result['warehouse'] = ref(user.warehouse)
            result['warehouses'] = choices(Location.search([
                        ('type', '=', 'warehouse')]))
        methods = config.get('session', 'authentications', default='password')
        result['nlbi_sign_on'] = 'nlbi' in methods
        return result

    @classmethod
    def common_set_preferences(cls, values):
        """Save the preferences the User Control Panel changes (only those:
        never the password nor the groups); return them again"""
        User = Pool().get('res.user')
        allowed = set(PREFERENCES) & set(
            User._preferences_fields + User._context_fields)
        clean = {k: v for k, v in (values or {}).items() if k in allowed}
        if clean:
            # As Tryton's own set_preferences RPC: a user writes their own
            # preferences without the rights on res.user
            with Transaction().set_context(_check_access=False):
                User.set_preferences(clean)
        return cls.common_preferences()


MODELS = [Desk]
