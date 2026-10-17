# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import logging
import re

from sql import Column, Flavor

from trytond.backend.table import (
    IndexTranslatorInterface, TableHandlerInterface)
from trytond.transaction import Transaction

from . import dialect

__all__ = ['TableHandler']

logger = logging.getLogger(__name__)
VARCHAR_SIZE_RE = re.compile(r'VARCHAR\(([0-9]+)\)')
# Maximum size of index key in SQL Server 2012
INDEX_KEY_MAX = 900


def _escape_identifier(name):
    return '[%s]' % name.replace(']', ']]')


def _ident(name):
    return _escape_identifier(name)


def _render(expression, predicate=False):
    "Render expression as T-SQL with inlined parameters"
    Flavor.set(Transaction().database.flavor)
    if predicate:
        expression = dialect.to_predicate(expression)
    else:
        expression = dialect.to_value(expression)
    return dialect.inline(str(expression), expression.params)


class TableHandler(TableHandlerInterface):
    namedatalen = 128
    index_translators = []

    def _init(self, model, history=False):
        super()._init(model, history=history)
        self.__columns = None
        self.__constraints = None
        self.__indexes = None
        self._model = model

        transaction = Transaction()
        cursor = transaction.connection.cursor()

        # Create new table if necessary
        if not self.table_exist(self.table_name):
            sequence = self.sequence_name
            if not self.__class__.sequence_exist(sequence):
                cursor.execute('CREATE SEQUENCE %s AS INT START WITH 1'
                    % _ident(sequence))
            column = '__id' if self.history else 'id'
            definition = (
                '%s INT NOT NULL CONSTRAINT %s '
                'DEFAULT (NEXT VALUE FOR %s), '
                'CONSTRAINT %s PRIMARY KEY (%s)') % (
                _ident(column),
                _ident(self.convert_name(self.table_name + '_id_def')),
                _ident(sequence),
                _ident(self.convert_name(self.table_name + '_pkey')),
                _ident(column))
            if self.history:
                definition += ', id INT'
            cursor.execute('CREATE TABLE %s (%s)' % (
                    _ident(self.table_name), definition))

    @classmethod
    def sequence_exist(cls, name):
        cursor = Transaction().connection.cursor()
        cursor.execute(
            'SELECT 1 FROM sys.sequences WHERE name = ?', (name,))
        return bool(cursor.fetchone())

    @classmethod
    def table_exist(cls, table_name):
        cursor = Transaction().connection.cursor()
        cursor.execute(
            "SELECT 1 FROM sys.tables WHERE name = ? "
            "AND schema_id = SCHEMA_ID('dbo')", (table_name,))
        return bool(cursor.fetchone())

    @classmethod
    def table_rename(cls, old_name, new_name):
        cursor = Transaction().connection.cursor()
        if (cls.table_exist(old_name)
                and not cls.table_exist(new_name)):
            cursor.execute('EXEC sp_rename ?, ?', (old_name, new_name))
        for old_seq, new_seq in [
                (old_name + '_id_seq', new_name + '_id_seq'),
                (old_name + '__history___id_seq',
                    new_name + '__history___id_seq')]:
            if (cls.sequence_exist(old_seq)
                    and not cls.sequence_exist(new_seq)):
                cursor.execute('EXEC sp_rename ?, ?', (old_seq, new_seq))
        old_history = old_name + '__history'
        new_history = new_name + '__history'
        if (cls.table_exist(old_history)
                and not cls.table_exist(new_history)):
            cursor.execute('EXEC sp_rename ?, ?', (old_history, new_history))

    def column_exist(self, column_name):
        return column_name in self._columns

    def column_rename(self, old_name, new_name):
        cursor = Transaction().connection.cursor()
        if self.column_exist(old_name):
            if not self.column_exist(new_name):
                cursor.execute('EXEC sp_rename ?, ?, ?', (
                        '%s.%s' % (_ident(self.table_name), _ident(old_name)),
                        new_name, 'COLUMN'))
                self._update_definitions(columns=True)
                if not self.history:
                    history_table = self.table_name + '__history'
                    if self.__class__.table_exist(history_table):
                        history_h = self.__class__(self._model, True)
                        history_h.column_rename(old_name, new_name)
            else:
                logger.warning(
                    'Unable to rename column %s on table %s to %s.',
                    old_name, self.table_name, new_name)

    @property
    def _columns(self):
        if self.__columns is None:
            cursor = Transaction().connection.cursor()
            cursor.execute(
                'SELECT c.name, t.name, c.is_nullable, c.max_length, '
                'c.precision, c.scale, d.name, d.definition '
                'FROM sys.columns AS c '
                'JOIN sys.types AS t ON t.user_type_id = c.user_type_id '
                'LEFT JOIN sys.default_constraints AS d '
                'ON d.object_id = c.default_object_id '
                'WHERE c.object_id = OBJECT_ID(?)',
                (_ident(self.table_name),))
            self.__columns = {}
            for (name, typname, nullable, max_length, precision, scale,
                    default_name, default) in cursor.fetchall():
                if typname in ('nvarchar', 'nchar'):
                    size = max_length // 2 if max_length > 0 else None
                elif typname in ('varchar', 'char', 'varbinary', 'binary'):
                    size = max_length if max_length > 0 else None
                else:
                    size = None
                self.__columns[name] = {
                    'typname': typname,
                    'notnull': not nullable,
                    'size': size,
                    'max': max_length == -1,
                    'precision': precision,
                    'scale': scale,
                    'default_name': default_name,
                    'default': default,
                    }
        return self.__columns

    @property
    def _constraints(self):
        if self.__constraints is None:
            cursor = Transaction().connection.cursor()
            cursor.execute(
                'SELECT name FROM sys.objects '
                'WHERE parent_object_id = OBJECT_ID(?) '
                "AND type IN ('C', 'F', 'PK', 'UQ', 'D') "
                'UNION '
                'SELECT name FROM sys.indexes '
                'WHERE object_id = OBJECT_ID(?) AND is_unique = 1 '
                'AND is_primary_key = 0',
                (_ident(self.table_name), _ident(self.table_name)))
            self.__constraints = [c for c, in cursor.fetchall()]
        return self.__constraints

    @property
    def _indexes(self):
        if self.__indexes is None:
            cursor = Transaction().connection.cursor()
            cursor.execute(
                'SELECT name FROM sys.indexes '
                'WHERE object_id = OBJECT_ID(?) AND name IS NOT NULL '
                'AND is_primary_key = 0 AND is_unique = 0',
                (_ident(self.table_name),))
            self.__indexes = [n for n, in cursor.fetchall()]
        return self.__indexes

    def _update_definitions(self, columns=None, constraints=None):
        if columns is None and constraints is None:
            columns = constraints = True
        if columns:
            self.__columns = None
        if constraints:
            self.__constraints = None
            self.__indexes = None

    def _column_definition(self, column_name, column_type=None):
        "Return the type definition of the existing column"
        column = self._columns[column_name]
        if column_type:
            return column_type
        typname = column['typname'].upper()
        if typname in ('NVARCHAR', 'VARCHAR', 'VARBINARY', 'NCHAR', 'CHAR',
                'BINARY'):
            if column['max']:
                return '%s(MAX)' % typname
            return '%s(%s)' % (typname, column['size'])
        elif typname in ('DECIMAL', 'NUMERIC'):
            return '%s(%s, %s)' % (
                typname, column['precision'], column['scale'])
        elif typname in ('DATETIME2', 'TIME'):
            return '%s(%s)' % (typname, column['scale'])
        return typname

    def _dependent_indexes(self, column_name):
        "Return the indexes and statistics using the column"
        cursor = Transaction().connection.cursor()
        cursor.execute(
            'SELECT DISTINCT i.name, i.is_unique FROM sys.indexes AS i '
            'JOIN sys.index_columns AS ic ON ic.object_id = i.object_id '
            'AND ic.index_id = i.index_id '
            'JOIN sys.columns AS c ON c.object_id = ic.object_id '
            'AND c.column_id = ic.column_id '
            'WHERE i.object_id = OBJECT_ID(?) AND c.name = ? '
            'AND i.is_primary_key = 0',
            (_ident(self.table_name), column_name))
        indexes = cursor.fetchall()
        # Filtered indexes also depend on the columns of their filter
        cursor.execute(
            'SELECT i.name, i.is_unique FROM sys.indexes AS i '
            'WHERE i.object_id = OBJECT_ID(?) AND i.has_filter = 1 '
            'AND i.filter_definition LIKE ?',
            (_ident(self.table_name), '%[[]' + column_name + ']%'))
        for row in cursor.fetchall():
            if row not in indexes:
                indexes.append(row)
        return indexes

    def _alter_column(self, column_name, definition, notnull):
        "Alter column type or nullability, dropping dependent indexes"
        cursor = Transaction().connection.cursor()
        dropped = []
        for name, unique in self._dependent_indexes(column_name):
            definition_sql = self._index_definition(name)
            cursor.execute('DROP INDEX %s ON %s' % (
                    _ident(name), _ident(self.table_name)))
            dropped.append(definition_sql)
        cursor.execute('ALTER TABLE %s ALTER COLUMN %s %s %s' % (
                _ident(self.table_name), _ident(column_name), definition,
                'NOT NULL' if notnull else 'NULL'))
        for definition_sql in dropped:
            if definition_sql:
                try:
                    cursor.execute(definition_sql)
                except Exception:
                    logger.warning(
                        'Unable to recreate index on %s: %s',
                        self.table_name, definition_sql, exc_info=True)
                    raise
        self._update_definitions(columns=True, constraints=True)

    def _index_definition(self, name):
        "Return the CREATE INDEX statement of an existing index"
        cursor = Transaction().connection.cursor()
        cursor.execute(
            'SELECT i.is_unique, i.filter_definition, i.index_id '
            'FROM sys.indexes AS i '
            'WHERE i.object_id = OBJECT_ID(?) AND i.name = ?',
            (_ident(self.table_name), name))
        row = cursor.fetchone()
        if not row:
            return None
        unique, filter_, index_id = row
        cursor.execute(
            'SELECT c.name, ic.is_descending_key, ic.is_included_column '
            'FROM sys.index_columns AS ic '
            'JOIN sys.columns AS c ON c.object_id = ic.object_id '
            'AND c.column_id = ic.column_id '
            'WHERE ic.object_id = OBJECT_ID(?) AND ic.index_id = ? '
            'ORDER BY ic.key_ordinal, ic.index_column_id',
            (_ident(self.table_name), index_id))
        keys, includes = [], []
        for column, descending, included in cursor.fetchall():
            if included:
                includes.append(_ident(column))
            else:
                keys.append(_ident(column) + (' DESC' if descending else ''))
        statement = 'CREATE %sINDEX %s ON %s (%s)' % (
            'UNIQUE ' if unique else '', _ident(name),
            _ident(self.table_name), ', '.join(keys))
        if includes:
            statement += ' INCLUDE (%s)' % ', '.join(includes)
        if filter_:
            statement += ' WHERE %s' % filter_
        return statement

    def alter_size(self, column_name, column_type):
        column = self._columns[column_name]
        self._alter_column(column_name,
            Transaction().database.sql_type(column_type).type
            if not column_type.startswith('N') else column_type,
            column['notnull'])

    def alter_type(self, column_name, column_type):
        column = self._columns[column_name]
        self._alter_column(column_name, column_type, column['notnull'])

    def column_is_type(self, column_name, type_, *, size=-1):
        db_type = self._columns[column_name]['typname'].upper()

        database = Transaction().database
        base_type = database.sql_type(type_).base.upper()
        if base_type == 'NVARCHAR' and (size is None or size >= 0):
            same_size = self._columns[column_name]['size'] == size
        else:
            same_size = True

        return base_type == db_type and same_size

    def db_default(self, column_name, value):
        column = self._columns[column_name]
        if value is None:
            test = None
        else:
            test = '(%s)' % dialect.literal(value)
        current = column['default']
        if current is not None:
            # SQL Server stores the expression with extra parenthesis
            current_value = current
            while (current_value.startswith('(')
                    and current_value.endswith(')')):
                inner = current_value[1:-1]
                if test is not None and '(%s)' % inner == test:
                    current_value = test
                    break
                current_value = inner
            if current_value == test or current == test:
                return
        elif test is None:
            return
        cursor = Transaction().connection.cursor()
        if column['default_name']:
            cursor.execute('ALTER TABLE %s DROP CONSTRAINT %s' % (
                    _ident(self.table_name), _ident(column['default_name'])))
        if value is not None:
            name = self.convert_name(
                'df_%s_%s' % (self.table_name, column_name))
            cursor.execute(
                'ALTER TABLE %s ADD CONSTRAINT %s DEFAULT %s FOR %s' % (
                    _ident(self.table_name), _ident(name), test,
                    _ident(column_name)))
        self._update_definitions(columns=True, constraints=True)

    def add_column(self, column_name, sql_type, default=None, comment=''):
        cursor = Transaction().connection.cursor()
        database = Transaction().database

        column_type = database.sql_type(sql_type)
        match = VARCHAR_SIZE_RE.match(sql_type)
        field_size = int(match.group(1)) if match else None

        if self.column_exist(column_name):
            base_type = column_type.base.lower()
            column = self._columns[column_name]
            typname = column['typname']
            if base_type != typname:
                if (typname, base_type) in [
                        ('nvarchar', 'nvarchar'),
                        ('date', 'datetime2'),
                        ('smallint', 'int'),
                        ('smallint', 'bigint'),
                        ('smallint', 'float'),
                        ('smallint', 'decimal'),
                        ('int', 'bigint'),
                        ('int', 'float'),
                        ('int', 'decimal'),
                        ('bigint', 'float'),
                        ('bigint', 'decimal'),
                        ('real', 'float'),
                        ('real', 'decimal'),
                        ('float', 'decimal'),
                        ]:
                    self.alter_type(column_name, column_type.type)
                elif (typname, base_type) in [
                        ('bigint', 'int'),
                        ('bigint', 'smallint'),
                        ('int', 'smallint'),
                        ('float', 'real'),
                        ]:
                    pass
                else:
                    logger.warning(
                        'Unable to migrate column %s on table %s '
                        'from %s to %s.',
                        column_name, self.table_name, typname, base_type)
            elif base_type == 'nvarchar':
                # Migrate size
                from_size = column['size']
                to_size = None if column_type.type.endswith('(MAX)') else (
                    field_size or 4000)
                if from_size == to_size:
                    pass
                elif from_size is None:
                    if to_size is not None:
                        logger.warning(
                            'Unable to migrate column %s on table %s '
                            'from nvarchar(max) to %s.',
                            column_name, self.table_name, column_type.type)
                elif to_size is None or from_size < to_size:
                    self.alter_size(column_name, column_type.type)
                else:
                    logger.warning(
                        'Unable to migrate column %s on table %s '
                        'from nvarchar(%s) to %s.',
                        column_name, self.table_name, from_size,
                        column_type.type)
            elif (base_type == 'datetime2'
                    and column['scale'] != (
                        0 if column_type.type.endswith('(0)') else 6)):
                self.alter_type(column_name, column_type.type)
            return

        cursor.execute('ALTER TABLE %s ADD %s %s NULL' % (
                _ident(self.table_name), _ident(column_name),
                column_type.type))

        if default:
            # check if table is non-empty:
            cursor.execute('SELECT TOP (1) 1 FROM %s' % _ident(
                    self.table_name))
            if cursor.fetchone():
                # Populate column with default values:
                value = default()
                if isinstance(value, bool):
                    value = int(value)
                cursor.execute('UPDATE %s SET %s = ?' % (
                        _ident(self.table_name), _ident(column_name)),
                    (value,))

        self._update_definitions(columns=True)

    def add_fk(self, column_name, reference, on_delete=None):
        # The ORM applies the CASCADE and SET NULL actions before deleting
        # records.  SQL Server rejects these actions for self referencing
        # tables and for multiple cascade paths, so NO ACTION is always used.
        name = self.convert_name(self.table_name + '_' + column_name + '_fkey')
        if name in self._constraints:
            return
        cursor = Transaction().connection.cursor()
        cursor.execute(
            'ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) '
            'REFERENCES %s (id)' % (
                _ident(self.table_name), _ident(name), _ident(column_name),
                _ident(reference)))
        self._update_definitions(constraints=True)

    def drop_fk(self, column_name, table=None):
        self.drop_constraint(column_name + '_fkey', table=table)

    def not_null_action(self, column_name, action='add'):
        if not self.column_exist(column_name):
            return
        column = self._columns[column_name]
        cursor = Transaction().connection.cursor()
        if action == 'add':
            if column['notnull']:
                return
            cursor.execute('SELECT TOP (1) 1 FROM %s WHERE %s IS NULL' % (
                    _ident(self.table_name), _ident(column_name)))
            if not cursor.fetchone():
                self._alter_column(
                    column_name, self._column_definition(column_name), True)
            else:
                logger.warning(
                    "Unable to set not null on column %s of table %s.\n"
                    "Try restarting one more time.\n"
                    "If that doesn't work update the records and restart "
                    "again.",
                    column_name, self.table_name)
        elif action == 'remove':
            if not column['notnull']:
                return
            self._alter_column(
                column_name, self._column_definition(column_name), False)
        else:
            raise Exception('Not null action not supported!')

    def add_constraint(self, ident, constraint):
        from trytond.model.modelsql import Check, Unique
        ident = self.convert_name(self.table_name + "_" + ident)
        if ident in self._constraints:
            # This constrain already exist
            return
        cursor = Transaction().connection.cursor()
        if isinstance(constraint, Unique):
            columns = [c.name for c in constraint.columns]
            if not all(self._indexable(c) for c in columns):
                logger.info(
                    'Unique constraint %s is validated by Tryton because '
                    'its columns can not be indexed', ident)
                return
            # Like the SQL standard, rows with NULL are always unique
            cursor.execute('CREATE UNIQUE INDEX %s ON %s (%s) WHERE %s' % (
                    _ident(ident), _ident(self.table_name),
                    ', '.join(map(_ident, columns)),
                    ' AND '.join(
                        '%s IS NOT NULL' % _ident(c) for c in columns)))
        elif isinstance(constraint, Check):
            cursor.execute('ALTER TABLE %s ADD CONSTRAINT %s CHECK (%s)' % (
                    _ident(self.table_name), _ident(ident),
                    _render(constraint.expression, predicate=True)))
        else:
            # Validated by Tryton as Database.has_constraint returns False
            return
        self._update_definitions(constraints=True)

    def _indexable(self, column_name):
        column = self._columns.get(column_name)
        if not column:
            return False
        if column['max']:
            return False
        return column['typname'] not in ('text', 'ntext', 'image', 'xml')

    def drop_constraint(self, ident, table=None):
        ident = self.convert_name((table or self.table_name) + "_" + ident)
        if ident not in self._constraints:
            return
        cursor = Transaction().connection.cursor()
        cursor.execute(
            'SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(?) '
            'AND name = ? AND is_unique = 1 AND is_unique_constraint = 0',
            (_ident(self.table_name), ident))
        if cursor.fetchone():
            cursor.execute('DROP INDEX %s ON %s' % (
                    _ident(ident), _ident(self.table_name)))
        else:
            cursor.execute('ALTER TABLE %s DROP CONSTRAINT %s' % (
                    _ident(self.table_name), _ident(ident)))
        self._update_definitions(constraints=True)

    def set_indexes(self, indexes):
        cursor = Transaction().connection.cursor()
        old = set(self._indexes)
        existing = set(self._indexes)
        for index in indexes:
            definition = self._index_create(index)
            if not definition:
                continue
            name, query = definition
            # Different indexes may have the same definition for SQL Server
            if name not in existing:
                cursor.execute(query)
                existing.add(name)
            old.discard(name)
        for name in old:
            if name.startswith('idx_') or name.endswith('_index'):
                cursor.execute('DROP INDEX %s ON %s' % (
                        _ident(name), _ident(self.table_name)))
        self.__indexes = None

    def _index_create(self, index):
        "Return name and CREATE INDEX statement for index or None"
        keys = []
        for expression, usage in index.expressions:
            if not isinstance(expression, Column):
                # Only columns can be indexed
                continue
            if usage.__class__.__name__ not in {
                    'Equality', 'Range', 'Similarity'}:
                continue
            name = expression.name
            if not self._indexable(name):
                continue
            order = usage.options.get('order', '')
            order = order.upper().replace('NULLS FIRST', '').replace(
                'NULLS LAST', '').strip()
            if order not in {'', 'ASC', 'DESC'}:
                order = ''
            if name not in {k for k, _ in keys}:
                keys.append((name, order))
        if not keys:
            return None
        includes = []
        for column in index.options.get('include', []):
            if (isinstance(column, Column)
                    and column.name in self._columns
                    and column.name not in {k for k, _ in keys}):
                includes.append(column.name)
        where = ''
        if index.options.get('where') is not None:
            where = self._index_where(index.options['where'])
        query = 'INDEX ON (%s)' % ', '.join(
            ('%s %s' % (_ident(k), o)).strip() for k, o in keys)
        if includes:
            query += ' INCLUDE (%s)' % ', '.join(map(_ident, includes))
        if where:
            query += ' WHERE ' + where
        name = IndexTranslatorInterface._get_name(query, [])
        name = '_'.join([self.table_name, name])
        name = 'idx_' + self.convert_name(name, reserved=len('idx_'))
        statement = 'CREATE INDEX %s ON %s (%s)' % (
            _ident(name), _ident(self.table_name),
            ', '.join(('%s %s' % (_ident(k), o)).strip() for k, o in keys))
        if includes:
            statement += ' INCLUDE (%s)' % ', '.join(map(_ident, includes))
        if where:
            statement += ' WHERE ' + where
        return name, statement

    def _index_where(self, where):
        "Return the filter of the index if SQL Server supports it"
        from sql.operators import (
            And, Equal, Greater, GreaterEqual, In, Less, LessEqual, NotEqual)
        simple = (Equal, NotEqual, Greater, GreaterEqual, Less, LessEqual, In)

        def supported(expression):
            if isinstance(expression, And):
                return all(supported(e) for e in expression)
            if isinstance(expression, simple):
                operands = expression._operands
                if not operands or not isinstance(operands[0], Column):
                    return False
                if not self._indexable(operands[0].name):
                    return False
                return all(
                    not isinstance(o, Column) for o in operands[1:])
            return False
        if not supported(where):
            return ''
        Flavor.set(Transaction().database.flavor)
        query = str(where)
        # Filtered index does not support parameters nor table alias
        return dialect.inline(query, where.params)

    def drop_column(self, column_name):
        if not self.column_exist(column_name):
            return
        cursor = Transaction().connection.cursor()
        for name, _ in self._dependent_indexes(column_name):
            cursor.execute('DROP INDEX %s ON %s' % (
                    _ident(name), _ident(self.table_name)))
        cursor.execute(
            'SELECT o.name FROM sys.objects AS o '
            'WHERE o.parent_object_id = OBJECT_ID(?) '
            "AND o.type IN ('C', 'F', 'D') AND o.object_id IN ("
            'SELECT d.object_id FROM sys.default_constraints AS d '
            'JOIN sys.columns AS c ON c.object_id = d.parent_object_id '
            'AND c.column_id = d.parent_column_id WHERE c.name = ? '
            'UNION SELECT fk.constraint_object_id '
            'FROM sys.foreign_key_columns AS fk '
            'JOIN sys.columns AS c ON c.object_id = fk.parent_object_id '
            'AND c.column_id = fk.parent_column_id WHERE c.name = ? '
            'UNION SELECT k.object_id FROM sys.check_constraints AS k '
            'JOIN sys.columns AS c ON c.object_id = k.parent_object_id '
            'AND c.column_id = k.parent_column_id WHERE c.name = ?)',
            (_ident(self.table_name), column_name, column_name, column_name))
        for name, in cursor.fetchall():
            cursor.execute('ALTER TABLE %s DROP CONSTRAINT %s' % (
                    _ident(self.table_name), _ident(name)))
        cursor.execute('ALTER TABLE %s DROP COLUMN %s' % (
                _ident(self.table_name), _ident(column_name)))
        self._update_definitions(columns=True, constraints=True)

    @classmethod
    def drop_table(cls, model, table, cascade=False):
        cursor = Transaction().connection.cursor()
        cursor.execute('DELETE FROM ir_model_data WHERE model = ?', (model,))
        if cascade:
            # Drop foreign keys referencing the table
            cursor.execute(
                'SELECT OBJECT_NAME(parent_object_id), name '
                'FROM sys.foreign_keys '
                'WHERE referenced_object_id = OBJECT_ID(?)',
                (_ident(table),))
            for parent, name in cursor.fetchall():
                cursor.execute('ALTER TABLE %s DROP CONSTRAINT %s' % (
                        _ident(parent), _ident(name)))
        cursor.execute('DROP TABLE %s' % _ident(table))
        for sequence in [table + '_id_seq', table + '___id_seq']:
            if cls.sequence_exist(sequence):
                cursor.execute('DROP SEQUENCE %s' % _ident(sequence))
