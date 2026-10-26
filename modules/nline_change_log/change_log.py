# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime as dt
from itertools import groupby

from sql import Column, Literal
from sql.conditionals import Coalesce

from trytond.model import ModelView, fields
from trytond.pool import Pool, PoolMeta
from trytond.tools import grouped_slice, reduce_ids
from trytond.transaction import Transaction
from trytond.wizard import Button, StateTransition, StateView, Wizard

# Fields that change on every save and say nothing to the user
SKIPPED_FIELDS = {
    'id', 'create_uid', 'create_date', 'write_uid', 'write_date'}


def history_mixin(name):
    "Return a PoolMeta class turning on the history of the model"
    class History(metaclass=PoolMeta):
        __name__ = name

        @classmethod
        def __setup__(cls):
            cls._history = True
            super().__setup__()
    # __name__ is the model name, only the qualified name is set
    History.__qualname__ = (
        ''.join(p.capitalize() for p in name.replace('.', '_').split('_'))
        + 'History')
    return History


TRACKED = {
    # module: models
    'account': [
        'account.move', 'account.move.line', 'account.account',
        'account.journal'],
    'account_invoice': [
        'account.invoice', 'account.invoice.line', 'account.invoice.tax',
        'account.invoice.payment_term'],
    'account_payment': ['account.payment', 'account.payment.group'],
    'account_statement': ['account.statement', 'account.statement.line'],
    'party': ['party.party', 'party.address'],
    'product': ['product.template', 'product.product'],
    'production': ['production', 'production.bom', 'production.bom.input'],
    'purchase': ['purchase.purchase', 'purchase.line'],
    'sale': ['sale.sale', 'sale.line'],
    }


def tracked_models():
    "Return the names of the tracked models of the activated modules"
    pool = Pool()
    names = []
    for models in TRACKED.values():
        for name in models:
            try:
                Model = pool.get(name)
            except KeyError:
                continue
            if getattr(Model, '_history', False):
                names.append(name)
    return names


class ChangeLogLine(ModelView):
    "Change Log Line"
    __name__ = 'nline.change_log.line'

    date = fields.DateTime("Date", readonly=True)
    user = fields.Char("User", readonly=True)
    action = fields.Selection([
            ('create', "Created"),
            ('write', "Changed"),
            ('delete', "Deleted"),
            ], "Action", readonly=True)
    model = fields.Char("Model", readonly=True)
    record = fields.Char("Record", readonly=True)
    record_id = fields.Integer("ID", readonly=True)
    field = fields.Char("Field", readonly=True)
    old_value = fields.Char("Old Value", readonly=True)
    new_value = fields.Char("New Value", readonly=True)

    @classmethod
    def get_changes(cls, model_name, ids=None, start=None, end=None):
        """Return the changes of the records of the model as dictionaries:
        date, user, action, model, record, record_id, field, old_value and
        new_value, the latest first"""
        pool = Pool()
        Model = pool.get(model_name)
        User = pool.get('res.user')
        if not getattr(Model, '_history', False):
            return []
        cursor = Transaction().connection.cursor()
        history = Model.__table_history__()
        columns = [f for f, field in Model._fields.items()
            if field.sql_type() and not hasattr(field, 'set')]
        date = Coalesce(history.write_date, history.create_date)

        where = Literal(True)
        if start:
            where &= date >= start
        if end:
            where &= date < end
        if ids is None:
            # Take the records changed in the period with all their versions
            cursor.execute(*history.select(
                    history.id, where=where, group_by=[history.id]))
            ids = [i for i, in cursor]
        rows = []
        for sub_ids in grouped_slice(ids):
            cursor.execute(*history.select(
                    *[getattr(history, c) for c in columns],
                    date.as_('__date'),
                    where=reduce_ids(history.id, sub_ids),
                    order_by=[
                        history.id.asc, date.asc,
                        Column(history, '__id').asc]))
            names = columns + ['__date']
            rows.extend(dict(zip(names, r)) for r in cursor)

        users = {}

        def user_name(user_id):
            if user_id not in users:
                users[user_id] = User(user_id).rec_name if user_id else ''
            return users[user_id]

        model_label = Model.__names__()['model']
        changes = []
        for record_id, versions in groupby(rows, key=lambda r: r['id']):
            previous = None
            for version in versions:
                version_date = cls._to_datetime(version['__date'])
                in_period = ((not start or version_date >= start)
                    and (not end or version_date < end))
                deleted = version.get('create_date') is None
                base = {
                    'date': version_date,
                    'user': user_name(
                        version.get('write_uid') or version.get('create_uid')),
                    'model': model_label,
                    'record_id': record_id,
                    'record': cls._record_name(
                        Model, version if not deleted else previous,
                        record_id),
                    }
                if previous is None and not deleted:
                    if in_period:
                        changes.append(dict(base, action='create',
                                field=None, old_value=None, new_value=None))
                elif deleted:
                    if in_period:
                        changes.append(dict(base, action='delete',
                                field=None, old_value=None, new_value=None))
                else:
                    for name in columns:
                        if name in SKIPPED_FIELDS or name.endswith('_cache'):
                            continue
                        old, new = previous.get(name), version.get(name)
                        if old == new:
                            continue
                        if in_period:
                            field = Model._fields[name]
                            changes.append(dict(base, action='write',
                                    field=field.string,
                                    old_value=cls._format(field, old),
                                    new_value=cls._format(field, new)))
                previous = version if not deleted else None
        changes.sort(key=lambda c: c['date'], reverse=True)
        return changes

    @staticmethod
    def _to_datetime(value):
        if isinstance(value, str):
            # SQLite returns COALESCE as text
            for format_ in ['%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S']:
                try:
                    return dt.datetime.strptime(value, format_)
                except ValueError:
                    continue
        return value

    @classmethod
    def _record_name(cls, Model, values, record_id):
        if values:
            for name in [Model._rec_name, 'number', 'name', 'code']:
                if name in Model._fields and values.get(name):
                    return str(values[name])
        try:
            return Model(record_id).rec_name
        except Exception:
            return '%s,%s' % (Model.__name__, record_id)

    @classmethod
    def _format(cls, field, value):
        pool = Pool()
        if value is None:
            return ''
        if field._type == 'many2one':
            Target = pool.get(field.model_name)
            try:
                return Target(value).rec_name
            except Exception:
                return '%s,%s' % (field.model_name, value)
        if field._type in {'selection', 'multiselection'} and isinstance(
                field.selection, (list, tuple)):
            return dict(field.selection).get(value, str(value))
        if field._type == 'boolean':
            return 'Yes' if value else 'No'
        return str(value)


class ChangeLogStart(ModelView):
    "Change Log"
    __name__ = 'nline.change_log.start'

    model = fields.Selection('get_models', "Model", required=True)
    from_date = fields.Date("From Date", required=True)
    to_date = fields.Date("To Date", required=True)
    record_id = fields.Integer(
        "Record ID", help="Leave empty for every record of the model.")

    @classmethod
    def get_models(cls):
        pool = Pool()
        names = tracked_models()
        return [(n, pool.get(n).__names__()['model']) for n in names]

    @classmethod
    def default_from_date(cls):
        pool = Pool()
        Date = pool.get('ir.date')
        return Date.today().replace(day=1)

    @classmethod
    def default_to_date(cls):
        pool = Pool()
        Date = pool.get('ir.date')
        return Date.today()


class ChangeLogResult(ModelView):
    "Change Log"
    __name__ = 'nline.change_log.result'

    lines = fields.One2Many(
        'nline.change_log.line', None, "Changes", readonly=True)


class ChangeLog(Wizard):
    "Change Log"
    __name__ = 'nline.change_log'
    start_state = 'check'
    check = StateTransition()
    start = StateView(
        'nline.change_log.start',
        'nline_change_log.change_log_start_view_form', [
            Button("Cancel", 'end', 'tryton-cancel'),
            Button("Show", 'result', 'tryton-ok', default=True),
            ])
    result = StateView(
        'nline.change_log.result',
        'nline_change_log.change_log_result_view_form', [
            Button("Close", 'end', 'tryton-close', default=True),
            ])

    def transition_check(self):
        if self.model and self.model.__name__ in tracked_models():
            return 'result'
        return 'start'

    def default_result(self, fields):
        pool = Pool()
        Line = pool.get('nline.change_log.line')
        if self.model and self.model.__name__ in tracked_models():
            changes = Line.get_changes(
                self.model.__name__, ids=[r.id for r in self.records])
        else:
            start = dt.datetime.combine(self.start.from_date, dt.time())
            end = dt.datetime.combine(
                self.start.to_date + dt.timedelta(days=1), dt.time())
            ids = [self.start.record_id] if self.start.record_id else None
            changes = Line.get_changes(
                self.start.model, ids=ids, start=start, end=end)
        return {'lines': changes}
