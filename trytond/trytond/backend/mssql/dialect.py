# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Render python-sql queries as Transact-SQL for SQL Server 2012 and later.

python-sql builds every statement from expression objects whose __str__ and
params are evaluated separately but in the same order.  Each override below
keeps that invariant: whatever is rendered gets its params emitted in the same
position.  The overrides are only active when the current flavor is
MSSQLFlavor, so the other backends are not affected.

Only features available in SQL Server 2012 are emitted.
"""
import datetime
import threading
from array import array
from collections import OrderedDict
from decimal import Decimal

import sql
import sql.aggregate as sql_aggregate
import sql.conditionals as sql_conditionals
import sql.functions as sql_functions
import sql.operators as sql_operators
from sql import (
    AliasManager, Cast, CombiningQuery, Delete, Expression, Flavor, From,
    Insert, Join, Literal, Null, Query, Select, SelectQuery, Update, Values,
    Window, With)

__all__ = ['MSSQLFlavor', 'active', 'inline', 'CAST_TYPES']

_local = threading.local()

# Mapping of type names used in Cast to SQL Server types.
# Unsized character and numeric types must get an explicit size because
# SQL Server defaults to 30 characters and DECIMAL(18, 0).
CAST_TYPES = {
    'VARCHAR': 'NVARCHAR(MAX)',
    'NVARCHAR': 'NVARCHAR(MAX)',
    'CHAR': 'NVARCHAR(MAX)',
    'CHARACTER VARYING': 'NVARCHAR(MAX)',
    'TEXT': 'NVARCHAR(MAX)',
    'NUMERIC': 'DECIMAL(38, 15)',
    'DECIMAL': 'DECIMAL(38, 15)',
    'INTEGER': 'INT',
    'INT4': 'INT',
    'INT8': 'BIGINT',
    'INT2': 'SMALLINT',
    'BOOLEAN': 'BIT',
    'BOOL': 'BIT',
    'DOUBLE PRECISION': 'FLOAT',
    'FLOAT8': 'FLOAT',
    'FLOAT4': 'REAL',
    'TIMESTAMP': 'DATETIME2',
    'DATETIME': 'DATETIME2',
    'INTERVAL': 'FLOAT',
    'BYTEA': 'VARBINARY(MAX)',
    'BLOB': 'VARBINARY(MAX)',
    'JSON': 'NVARCHAR(MAX)',
    'JSONB': 'NVARCHAR(MAX)',
    }


class MSSQLFlavor(Flavor):
    "Flavor marking the T-SQL rendering"

    def __init__(self, **kwargs):
        kwargs.setdefault('paramstyle', 'qmark')
        kwargs.setdefault('no_boolean', True)
        kwargs.setdefault('null_ordering', False)
        kwargs.setdefault('limitstyle', 'fetch')
        kwargs.setdefault('ilike', False)
        kwargs.setdefault('filter_', False)
        kwargs.setdefault('function_mapping', MAPPING)
        super().__init__(**kwargs)


def active():
    return isinstance(Flavor.get(), MSSQLFlavor)


# Predicates and values ------------------------------------------------------
# T-SQL has no boolean type: a predicate (e.g. a = b) can not be used where a
# value is expected and a BIT value can not be used where a predicate is
# expected.

def _predicate_classes():
    o = sql_operators
    return (
        o.And, o.Or, o.Not, o.Less, o.Greater, o.LessEqual, o.GreaterEqual,
        o.Equal, o.Between, o.IsDistinct, o.Is, o.Like, o.In, o.NotIn,
        o.Exists, _Predicate)


_PREDICATES = None


def is_predicate(expression):
    global _PREDICATES
    if _PREDICATES is None:
        _PREDICATES = _predicate_classes()
    if isinstance(expression, _PREDICATES):
        return True
    if isinstance(expression, bool):
        return True
    if isinstance(expression, Literal) and isinstance(expression.value, bool):
        return True
    return False


class _Predicate(Expression):
    "Use a BIT value as predicate"
    __slots__ = ('expression',)

    def __init__(self, expression):
        self.expression = expression

    def __str__(self):
        return '(%s = 1)' % _format_value(self.expression)

    @property
    def params(self):
        return _value_params(self.expression)


class _BoolLiteral(Expression):
    "Inline boolean constant"
    __slots__ = ('value', 'predicate')

    def __init__(self, value, predicate):
        self.value = value
        self.predicate = predicate

    def __str__(self):
        if self.predicate:
            return '(1 = 1)' if self.value else '(1 = 0)'
        return 'CAST(%s AS BIT)' % (1 if self.value else 0)

    @property
    def params(self):
        return ()


class _Value(Expression):
    "Use a predicate as BIT value keeping NULL for unknown"
    __slots__ = ('expression',)

    def __init__(self, expression):
        self.expression = expression

    def __str__(self):
        expression = _format_predicate(self.expression)
        return ('CASE WHEN %s THEN CAST(1 AS BIT) '
            'WHEN NOT %s THEN CAST(0 AS BIT) END' % (expression, expression))

    @property
    def params(self):
        return tuple(_predicate_params(self.expression)) * 2


def _bool_value(value):
    if isinstance(value, Literal):
        value = value.value
    return value


def to_value(operand):
    "Convert operand to be used as value"
    if isinstance(operand, (bool, Literal)) and isinstance(
            _bool_value(operand), bool):
        return _BoolLiteral(_bool_value(operand), predicate=False)
    if isinstance(operand, _Predicate):
        return operand.expression
    if is_predicate(operand):
        return _Value(operand)
    return operand


def to_predicate(operand):
    "Convert operand to be used as predicate"
    if isinstance(operand, (bool, Literal)) and isinstance(
            _bool_value(operand), bool):
        return _BoolLiteral(_bool_value(operand), predicate=True)
    if isinstance(operand, _Value):
        return operand.expression
    if isinstance(operand, (Expression, Query)) and not is_predicate(operand):
        return _Predicate(operand)
    return operand


def _format(operand):
    param = Flavor.get().param
    if isinstance(operand, Expression):
        if isinstance(operand, sql_operators.Operator) and not isinstance(
                operand, sql_operators.UnaryOperator):
            return '(%s)' % operand
        return str(operand)
    elif isinstance(operand, (Select, CombiningQuery)):
        return '(%s)' % operand
    elif isinstance(operand, (list, tuple)):
        return '(' + ', '.join(_format(o) for o in operand) + ')'
    return param


def _params(operand):
    if isinstance(operand, (Expression, Select, CombiningQuery)):
        return tuple(operand.params)
    elif isinstance(operand, (list, tuple)):
        p = []
        for o in operand:
            p.extend(_params(o))
        return tuple(p)
    elif isinstance(operand, array):
        return tuple(operand)
    return (operand,)


def _format_value(operand):
    return _format(to_value(operand))


def _value_params(operand):
    return _params(to_value(operand))


def _format_predicate(operand):
    operand = to_predicate(operand)
    if isinstance(operand, Expression):
        return '(%s)' % operand
    return _format(operand)


def _predicate_params(operand):
    return _params(to_predicate(operand))


# Literal inlining (DDL does not accept parameters) --------------------------

def literal(value):
    "Return value as T-SQL literal"
    if value is None:
        return 'NULL'
    elif isinstance(value, bool):
        return '1' if value else '0'
    elif isinstance(value, int):
        return str(value)
    elif isinstance(value, float):
        return repr(value)
    elif isinstance(value, Decimal):
        return str(value)
    elif isinstance(value, datetime.datetime):
        return "CAST('%s' AS DATETIME2)" % value.isoformat(' ')
    elif isinstance(value, datetime.date):
        return "CAST('%s' AS DATE)" % value.isoformat()
    elif isinstance(value, datetime.time):
        return "CAST('%s' AS TIME)" % value.isoformat()
    elif isinstance(value, datetime.timedelta):
        return repr(value.total_seconds())
    elif isinstance(value, bytes):
        return '0x' + value.hex()
    elif isinstance(value, str):
        return "N'%s'" % value.replace("'", "''")
    raise ValueError("Can not inline %r" % (value,))


def inline(query, params):
    "Replace qmark placeholders of query by params literals"
    params = list(params)
    result = []
    quote = None
    i = 0
    for char in query:
        if quote:
            if char == quote:
                quote = None
        elif char in ('"', "'", '['):
            quote = ']' if char == '[' else char
        elif char == '?':
            result.append(literal(params[i]))
            i += 1
            continue
        result.append(char)
    if i != len(params):
        raise ValueError("Wrong number of params")
    return ''.join(result)


# Patch helpers ---------------------------------------------------------------

def _patch(cls, name, function):
    original = cls.__dict__.get(name)
    if original is None:
        original = getattr(cls, name)

    if isinstance(original, property):
        def getter(self):
            if active():
                return function(self, original.fget)
            return original.fget(self)
        setattr(cls, name, property(getter, original.fset, original.fdel))
    elif isinstance(original, staticmethod):
        func = original.__func__

        def static(*args, **kwargs):
            if active():
                return function(func, *args, **kwargs)
            return func(*args, **kwargs)
        setattr(cls, name, staticmethod(static))
    else:
        def method(self, *args, **kwargs):
            if active():
                return function(self, original, *args, **kwargs)
            return original(self, *args, **kwargs)
        method.__name__ = name
        setattr(cls, name, method)


# Statement depth to detect sub-queries
def _depth():
    return getattr(_local, 'depth', 0)


class _Nested:
    def __enter__(self):
        _local.depth = _depth() + 1
        return _local.depth

    def __exit__(self, *args):
        _local.depth -= 1


# Select ----------------------------------------------------------------------

def _column(column):
    if isinstance(column, sql.As):
        expression = to_value(column.expression)
        return expression, column
    return to_value(column), None


def _select_order_by(select, depth):
    "Return the ORDER BY items and if OFFSET is needed"
    order_by = list(select.order_by or [])
    if (depth > 1 and order_by
            and select.limit is None and not select.offset):
        # ORDER BY is not allowed in sub-queries without TOP or OFFSET
        order_by = []
    return order_by


def _format_order(expression):
    if isinstance(expression, sql.Order):
        inner = expression.expression
        if isinstance(inner, SelectQuery):
            return '(%s) %s' % (inner, expression._sql)
        return '%s %s' % (_format_value(inner), expression._sql)
    elif isinstance(expression, sql.NullOrder):
        order = expression.expression
        if isinstance(order, sql.Order):
            inner = order.expression
        else:
            inner = order
        nulls = expression._case_values()
        return 'CASE WHEN %s IS NULL THEN %s ELSE %s END, %s' % (
            _format_value(inner), nulls[0], nulls[1], _format_order(order))
    elif isinstance(expression, sql.As):
        return str(expression)
    return _format_value(expression)


def _order_params(expression):
    if isinstance(expression, sql.Order):
        inner = expression.expression
        if isinstance(inner, SelectQuery):
            return tuple(inner.params)
        return _value_params(inner)
    elif isinstance(expression, sql.NullOrder):
        order = expression.expression
        if isinstance(order, sql.Order):
            inner = order.expression
        else:
            inner = order
        return _value_params(inner) + _order_params(order)
    elif isinstance(expression, sql.As):
        return ()
    return _value_params(expression)


def _limit_parts(select, order_by):
    "Return (top, order_by suffix)"
    top = ''
    suffix = ''
    if select.offset:
        if not order_by:
            if isinstance(select, CombiningQuery):
                suffix = ' ORDER BY 1'
            else:
                suffix = ' ORDER BY (SELECT NULL)'
        suffix += ' OFFSET %d ROWS' % select.offset
        if select.limit is not None:
            suffix += ' FETCH NEXT %d ROWS ONLY' % select.limit
    elif select.limit is not None:
        top = 'TOP (%d) ' % select.limit
    return top, suffix


# Common table expressions are only allowed at the start of the statement in
# SQL Server, so the ones of nested queries are collected and rendered first.

def _cte_begin():
    "Start collecting if not yet and return if it is the top-level"
    if getattr(_local, 'ctes', None) is None:
        _local.ctes = []
        return True
    return False


def _cte_end():
    _local.ctes = None


def _cte_register(query):
    if query.with_:
        for with_ in query.with_:
            if not any(w is with_ for w in _local.ctes):
                _local.ctes.append(with_)


def _cte_prefix():
    statements = []
    i = 0
    # Rendering a statement may register more expressions
    while i < len(_local.ctes):
        statements.append(_local.ctes[i].statement())
        i += 1
    if not statements:
        return ''
    return 'WITH ' + ', '.join(statements) + ' '


def _cte_prefix_params():
    p = []
    i = 0
    while i < len(_local.ctes):
        p.extend(_local.ctes[i].statement_params())
        i += 1
    return tuple(p)


class _Statement:
    "Context to render a statement with its common table expressions"

    def __init__(self, query, alias_exclude=None):
        self.query = query
        self.alias_exclude = alias_exclude

    def __enter__(self):
        self.nested = _Nested()
        self.depth = self.nested.__enter__()
        self.aliases = AliasManager(exclude=self.alias_exclude)
        self.aliases.__enter__()
        self.top = _cte_begin()
        self.union_all = getattr(_local, 'union_all', False)
        _local.union_all = False
        _cte_register(self.query)
        return self

    def __exit__(self, *args):
        _local.union_all = self.union_all
        if self.top:
            _cte_end()
        self.aliases.__exit__(*args)
        self.nested.__exit__(*args)


def _select_str(self, original):
    if self.distinct_on:
        raise NotImplementedError("DISTINCT ON is not supported")
    derived = getattr(_local, 'derived', False)
    _local.derived = False
    with _Statement(self) as statement:
        depth = statement.depth
        if self.from_ is not None:
            from_ = ' FROM %s' % self.from_
        else:
            from_ = ''
        distinct = 'DISTINCT ' if self.distinct else ''
        if self.columns:
            columns = []
            for i, column in enumerate(self.columns, 1):
                expression, as_ = _column(column)
                if isinstance(expression, (Select, CombiningQuery)):
                    formatted = '(%s)' % expression
                else:
                    formatted = str(expression)
                if as_ is not None:
                    formatted += ' AS %s' % as_
                elif derived and not isinstance(column, sql.Column):
                    formatted += ' AS "_column%d"' % i
                columns.append(formatted)
            columns = ', '.join(columns)
        else:
            columns = '*'
        where = ''
        if self.where is not None:
            where = ' WHERE ' + str(to_predicate(self.where))
        group_by = ''
        if self.group_by:
            group_by = ' GROUP BY ' + ', '.join(
                _format_value(_group_expression(self, e))
                for e in self.group_by)
        having = ''
        if self.having is not None:
            having = ' HAVING ' + str(to_predicate(self.having))
        order_by = _select_order_by(self, depth)
        order = ''
        if order_by:
            order = ' ORDER BY ' + ', '.join(map(_format_order, order_by))
        top, suffix = _limit_parts(self, order_by)
        query = ('SELECT %s%s%s%s' % (distinct, top, columns, from_)
            + where + group_by + having + order + suffix)
        if self.group_by:
            # SQL Server matches grouped expressions only if they are
            # textually equal, which is not the case with placeholders.
            query = inline(query, _select_body_params(self, depth))
        if statement.top:
            query = _cte_prefix() + query
        return query


def _group_expression(select, expression):
    "GROUP BY does not accept alias nor ordinal"
    if isinstance(expression, sql.As):
        for column in select.columns:
            if (isinstance(column, sql.As)
                    and column.output_name == expression.output_name):
                return column.expression
        return expression.expression
    return expression


def _select_params(self, original):
    with _Statement(self) as statement:
        if self.group_by:
            p = []
        else:
            p = list(_select_body_params(self, statement.depth))
        if statement.top:
            p = list(_cte_prefix_params()) + p
    return tuple(p)


def _select_body_params(self, depth):
    p = []
    if True:
        for column in self.columns:
            expression, _ = _column(column)
            p.extend(expression.params)
        if self.from_ is not None:
            p.extend(self.from_.params)
        if self.where is not None:
            p.extend(to_predicate(self.where).params)
        if self.group_by:
            for expression in self.group_by:
                p.extend(_value_params(_group_expression(self, expression)))
        if self.having is not None:
            p.extend(to_predicate(self.having).params)
        for expression in _select_order_by(self, depth):
            p.extend(_order_params(expression))
    return tuple(p)


# Combining queries -----------------------------------------------------------

def _combining_str(self, original):
    if self.all_ and self._operator != 'UNION':
        raise NotImplementedError("%s ALL is not supported" % self._operator)
    union_all = getattr(_local, 'union_all', False)
    with _Statement(self) as statement:
        depth = statement.depth
        all_ = self.all_ or (union_all and self._operator == 'UNION')
        operator = ' %s %s' % (self._operator, 'ALL ' if all_ else '')
        # Nested combining queries of recursive expression use also ALL
        _local.union_all = union_all
        # Members are always considered as sub-queries
        _local.depth += 1
        try:
            queries = operator.join(map(str, self.queries))
        finally:
            _local.depth -= 1
        order_by = _select_order_by(self, depth)
        order = ''
        if order_by:
            order = ' ORDER BY ' + ', '.join(map(_format_order, order_by))
        top, suffix = _limit_parts(self, order_by)
        if top:
            # TOP can not be applied on combining query
            if not order_by:
                order = ' ORDER BY 1'
            suffix = ' OFFSET 0 ROWS FETCH NEXT %d ROWS ONLY' % self.limit
        query = queries + order + suffix
        if statement.top:
            query = _cte_prefix() + query
        return query


def _combining_params(self, original):
    p = []
    union_all = getattr(_local, 'union_all', False)
    with _Statement(self) as statement:
        depth = statement.depth
        _local.union_all = union_all
        _local.depth += 1
        try:
            for q in self.queries:
                p.extend(q.params)
        finally:
            _local.depth -= 1
        for expression in _select_order_by(self, depth):
            p.extend(_order_params(expression))
        if statement.top:
            p = list(_cte_prefix_params()) + p
    return tuple(p)


# With ------------------------------------------------------------------------

def _with_statement(self, original):
    columns = (' (%s)' % ', '.join('"%s"' % c for c in self.columns)
        if self.columns else '')
    _local.depth += 1
    # SQL Server requires UNION ALL between anchor and recursive members
    union_all, _local.union_all = (
        getattr(_local, 'union_all', False), self.recursive)
    try:
        return '"%s"%s AS (%s)' % (self.alias, columns, self.query)
    finally:
        _local.depth -= 1
        _local.union_all = union_all


def _with_statement_params(self, original):
    _local.depth += 1
    union_all, _local.union_all = (
        getattr(_local, 'union_all', False), self.recursive)
    try:
        return self.query.params
    finally:
        _local.depth -= 1
        _local.union_all = union_all


# From and Values -------------------------------------------------------------

def _from_str(self, original):
    def format_(from_):
        template = '%s'
        if isinstance(from_, Query):
            template = '(%s)'
        alias = getattr(from_, 'alias', None)
        columns_definitions = getattr(from_, 'columns_definitions', None)
        if isinstance(from_, Select):
            # SQL Server requires a name for each column of derived table
            _local.derived = True
        if isinstance(from_, Values):
            width = len(from_[0]) if len(from_) else 0
            columns = ', '.join(
                '"column%d"' % (i + 1) for i in range(width))
            return (template + ' AS "%s" (%s)') % (from_, alias, columns)
        elif isinstance(from_, sql.Lateral):
            raise NotImplementedError("LATERAL is not supported")
        elif (alias and columns_definitions
                and not isinstance(columns_definitions, sql.Column)):
            raise NotImplementedError(
                "Column definitions are not supported")
        elif alias:
            return (template + ' AS "%s"') % (from_, alias)
        return template % from_
    _local.depth += 1
    try:
        return ', '.join(map(format_, self))
    finally:
        _local.depth -= 1


def _from_params(self, original):
    _local.depth += 1
    try:
        p = []
        for from_ in self:
            p.extend(from_.params)
        return tuple(p)
    finally:
        _local.depth -= 1


def _values_str(self, original):
    return 'VALUES ' + ', '.join(
        '(%s)' % ', '.join(_format_value(v) for v in row)
        for row in self)


def _values_params(self, original):
    p = []
    for row in self:
        for value in row:
            p.extend(_value_params(value))
    return tuple(p)


# Join ------------------------------------------------------------------------

def _join_str(self, original):
    join = '%s %s JOIN %s' % (
        From([self.left]), self.type_, From([self.right]))
    if self.condition is not None:
        join += ' ON %s' % to_predicate(self.condition)
    elif self.type_ not in {'CROSS'}:
        join += ' ON (1 = 1)'
    return join


def _join_params(self, original):
    p = []
    for item in (self.left, self.right):
        p.extend(From([item]).params)
    if self.condition is not None:
        p.extend(to_predicate(self.condition).params)
    return tuple(p)


# Insert / Update / Delete ----------------------------------------------------

def _returning_str(returning):
    columns = []
    for column in returning:
        if not isinstance(column, sql.Column):
            raise NotImplementedError("Only columns can be returned")
        columns.append('INSERTED.%s' % column.column_name)
    return ' OUTPUT ' + ', '.join(columns)


def _insert_str(self, original):
    if self.on_conflict:
        raise NotImplementedError("ON CONFLICT is not supported")
    with _Statement(self) as statement:
        columns = ''
        if self.columns:
            columns = ' (' + ', '.join(
                c.column_name for c in self.columns) + ')'
        output = ''
        if self.returning:
            output = _returning_str(self.returning)
        if isinstance(self.values, Query):
            _local.depth -= 1
            try:
                values = ' %s' % self.values
            finally:
                _local.depth += 1
        elif self.values is None:
            values = ' DEFAULT VALUES'
        query = 'INSERT INTO %s' % self.table + columns + output + values
        if statement.top:
            query = _cte_prefix() + query
        return query


def _insert_params(self, original):
    p = []
    with _Statement(self) as statement:
        if isinstance(self.values, Query):
            _local.depth -= 1
            try:
                p.extend(self.values.params)
            finally:
                _local.depth += 1
        if statement.top:
            p = list(_cte_prefix_params()) + p
    return tuple(p)


def _update_str(self, original):
    columns = [c.column_name for c in self.columns]
    with _Statement(self) as statement:
        alias = self.table.alias
        values = ', '.join('%s = %s' % (c, _format_value(v))
            for c, v in zip(columns, self.values))
        output = ''
        if self.returning:
            output = _returning_str(self.returning)
        from_ = ' FROM %s AS "%s"' % (self.table, alias)
        if self.from_:
            from_ += ', %s' % self.from_
        where = ''
        if self.where is not None:
            where = ' WHERE ' + str(to_predicate(self.where))
        query = 'UPDATE "%s" SET ' % alias + values + output + from_ + where
        if statement.top:
            query = _cte_prefix() + query
        return query


def _update_params(self, original):
    p = []
    with _Statement(self) as statement:
        self.table.alias
        for value in self.values:
            p.extend(_value_params(value))
        if self.from_:
            p.extend(self.from_.params)
        if self.where is not None:
            p.extend(to_predicate(self.where).params)
        if statement.top:
            p = list(_cte_prefix_params()) + p
    return tuple(p)


def _delete_str(self, original):
    if self.returning:
        raise NotImplementedError("RETURNING is not supported on DELETE")
    with _Statement(self, alias_exclude=[self.table]) as statement:
        where = ''
        if self.where is not None:
            where = ' WHERE ' + str(to_predicate(self.where))
        query = 'DELETE FROM %s' % self.table + where
        if statement.top:
            query = _cte_prefix() + query
        return query


def _delete_params(self, original):
    p = []
    with _Statement(self, alias_exclude=[self.table]) as statement:
        if self.where is not None:
            p.extend(to_predicate(self.where).params)
        if statement.top:
            p = list(_cte_prefix_params()) + p
    return tuple(p)


# Operators -------------------------------------------------------------------

def _logical(operator):
    o = sql_operators
    return isinstance(operator, (o.And, o.Or, o.Not))


def _convert_operand(operator, operand):
    o = sql_operators
    if _logical(operator):
        return to_predicate(operand)
    elif isinstance(operator, o.Exists):
        return operand
    return to_value(operand)


def _operator_format(self, original, operand, param=None):
    operand = _convert_operand(self, operand)
    if isinstance(operand, (_Predicate, _Value, _BoolLiteral)):
        return '(%s)' % operand
    return original(self, operand, param)


def _operator_params(self, original):
    p = []
    for operand in self._operands:
        operand = _convert_operand(self, operand)
        if isinstance(operand, (Expression, Select, CombiningQuery)):
            p.extend(operand.params)
        elif isinstance(operand, (list, tuple)):
            p.extend(_params([_convert_operand(self, o) for o in operand]))
        elif isinstance(operand, array):
            p.extend(operand)
        else:
            p.append(operand)
    return tuple(p)


def _concat_str(self, original):
    return '(%s + %s)' % (
        _concat_operand(self.left), _concat_operand(self.right))


def _concat_operand(operand):
    operand = to_value(operand)
    if isinstance(operand, str):
        return 'CAST(? AS NVARCHAR(MAX))'
    elif isinstance(operand, sql_operators.Concat):
        return str(operand)
    return 'CAST(%s AS NVARCHAR(MAX))' % _format(operand)


def _concat_params(self, original):
    p = []
    for operand in (self.left, self.right):
        p.extend(_params(to_value(operand)))
    return tuple(p)


def _escape_like_value(value, escape):
    # [ is a wildcard for SQL Server but not for the SQL standard
    if escape:
        return value.replace('[', escape + '[')
    return value.replace('[', '[[]')


def _like_params(self, original):
    left, right = self._operands
    p = list(_params(to_value(left)))
    right = to_value(right)
    if isinstance(right, str):
        p.append(_escape_like_value(right, self.escape))
    elif isinstance(right, sql_functions.Upper) and isinstance(right.args[0], str):
        p.append(_escape_like_value(right.args[0], self.escape))
    else:
        p.extend(_params(right))
    if self.escape:
        p.append(self.escape)
    return tuple(p)


def _like_str(self, original):
    left, right = self._operands
    result = '%s %s %s' % (
        _format_value(left), self._operator, _format_value(right))
    if self.escape:
        result += ' ESCAPE ?'
    return result


def _is_str(self, original):
    if self.right is None:
        return '%s %s NULL' % (_format_value(self.left), self._operator)
    value = 1 if self.right else 0
    test = '%s = %s' % (_format_value(self.left), value)
    if self._operator == 'IS NOT':
        return '(%s IS NULL OR NOT %s)' % (
            _format_value(self.left), test)
    return test


def _is_params(self, original):
    params = _value_params(self.left)
    if self.right is not None and self._operator == 'IS NOT':
        return params * 2
    return params


def _is_distinct_str(self, original):
    test = 'EXISTS (SELECT %s INTERSECT SELECT %s)' % (
        _format_value(self.left), _format_value(self.right))
    if isinstance(self, sql_operators.IsNotDistinct):
        return test
    return 'NOT ' + test


def _is_distinct_params(self, original):
    return _value_params(self.left) + _value_params(self.right)


def _unary_function(name):
    def str_(self, original):
        return '%s(%s)' % (name, _format_value(self.operand))
    return str_


def _unary_params(self, original):
    return _value_params(self.operand)


def _pow_str(self, original):
    return 'POWER(%s, %s)' % (
        _format_value(self.left), _format_value(self.right))


def _binary_params(self, original):
    return _value_params(self.left) + _value_params(self.right)


def _cbrt_str(self, original):
    return 'POWER(CAST(%s AS FLOAT), CAST(1 AS FLOAT) / 3)' % (
            _format_value(self.operand))


def _xor_str(self, original):
    return '(%s ^ %s)' % (_format_value(self.left), _format_value(self.right))


# Conditionals ----------------------------------------------------------------

def _case_str(self, original):
    case = 'CASE '
    for cond, result in self.whens:
        case += 'WHEN %s THEN %s ' % (
            _format_predicate(cond), _format_value(result))
    if self.else_ is not None:
        case += 'ELSE %s ' % _format_value(self.else_)
    return case + 'END'


def _case_params(self, original):
    p = []
    for cond, result in self.whens:
        p.extend(_predicate_params(cond))
        p.extend(_value_params(result))
    if self.else_ is not None:
        p.extend(_value_params(self.else_))
    return tuple(p)


def _coalesce_str(self, original):
    return (self._conditional
        + '(' + ', '.join(map(_format_value, self.values)) + ')')


def _coalesce_params(self, original):
    p = []
    for value in self.values:
        p.extend(_value_params(value))
    return tuple(p)


def _greatest_str(self, original):
    # GREATEST and LEAST are not available before SQL Server 2022
    aggregate = 'MAX' if isinstance(self, sql_conditionals.Greatest) else 'MIN'
    return '(SELECT %s("v") FROM (VALUES %s) AS "g" ("v"))' % (
        aggregate, ', '.join('(%s)' % _format_value(v) for v in self.values))


# Aggregates ------------------------------------------------------------------

_AGGREGATES = {
    'BOOL_AND': 'MIN',
    'BOOL_OR': 'MAX',
    'EVERY': 'MIN',
    'Stddev': 'STDEV',
    'VARIANCE': 'VAR',
    }


def _aggregate_expression(self):
    expression = self.expression
    if self.filter_ is not None:
        expression = sql_conditionals.Case(
            (self.filter_, self._case_expression))
    expression = to_value(expression)
    if self._sql in {'BOOL_AND', 'BOOL_OR', 'EVERY'}:
        expression = Cast(expression, 'INT')
    return expression


def _aggregate_str(self, original):
    if self._sql in {'BIT_AND', 'BIT_OR'}:
        raise NotImplementedError("%s is not supported" % self._sql)
    if self.order_by or self.within:
        raise NotImplementedError("Ordered aggregate is not supported")
    function = _AGGREGATES.get(self._sql, self._sql)
    quantifier = 'DISTINCT ' if self.distinct else ''
    aggregate = '%s(%s%s)' % (
        function, quantifier, _format(_aggregate_expression(self)))
    if self._sql in {'BOOL_AND', 'BOOL_OR', 'EVERY'}:
        aggregate = 'CAST(%s AS BIT)' % aggregate
    if self.window:
        aggregate += ' OVER (%s)' % self.window
    return aggregate


def _aggregate_params(self, original):
    p = list(_params(_aggregate_expression(self)))
    if self.window:
        p.extend(self.window.params)
    return tuple(p)


def _window_str(self, original):
    partition = ''
    if self.partition:
        partition = 'PARTITION BY ' + ', '.join(
            map(_format_value, self.partition))
    order_by = ''
    if self.order_by:
        order_by = ' ORDER BY ' + ', '.join(map(_format_order, self.order_by))

    def format_(frame, direction):
        if frame is None:
            return 'UNBOUNDED %s' % direction
        elif not frame:
            return 'CURRENT ROW'
        elif frame < 0:
            return '%d PRECEDING' % abs(frame)
        else:
            return '%d FOLLOWING' % abs(frame)
    frame = ''
    if self.frame:
        if self.frame == 'GROUPS':
            raise NotImplementedError("GROUPS frame is not supported")
        frame = ' %s BETWEEN %s AND %s' % (
            self.frame, format_(self.start, 'PRECEDING'),
            format_(self.end, 'FOLLOWING'))
    if self.exclude:
        raise NotImplementedError("EXCLUDE is not supported")
    return (partition + order_by + frame).strip()


def _window_params(self, original):
    p = []
    if self.partition:
        for expression in self.partition:
            p.extend(_value_params(expression))
    if self.order_by:
        for expression in self.order_by:
            p.extend(_order_params(expression))
    return tuple(p)


def _window_alias(self, original):
    # Named windows are not supported so they are always inlined
    return ''


# Cast ------------------------------------------------------------------------

def _cast_type(typename):
    return CAST_TYPES.get(typename.upper().strip(), typename)


def _cast_str(self, original):
    if isinstance(self.expression, Expression):
        value = _format_value(self.expression)
    else:
        value = Flavor.get().param
    return 'CAST(%s AS %s)' % (value, _cast_type(self.typename))


def _cast_params(self, original):
    if isinstance(self.expression, Expression):
        return _value_params(self.expression)
    return (self.expression,)


# Functions -------------------------------------------------------------------

def _function_format(func, value):
    value = to_value(value)
    if isinstance(value, (_Value, _BoolLiteral)):
        return str(value)
    return func(value)


def _function_params(self, original):
    Mapping = Flavor.get().function_mapping.get(self.__class__)
    if Mapping:
        return Mapping(*self.args).params
    p = []
    for arg in self.args:
        p.extend(_value_params(arg))
    return tuple(p)


class _Function(sql_functions.Function):
    __slots__ = ()


def _simple(name):
    class Mapped(_Function):
        __slots__ = ()
        _function = name
    Mapped.__name__ = name
    return Mapped


class _Ceil(_Function):
    __slots__ = ()
    _function = 'CEILING'


class _Ln(_Function):
    __slots__ = ()
    _function = 'LOG'


class _Log(_Function):
    __slots__ = ()

    def __str__(self):
        if len(self.args) == 1:
            return 'LOG10(%s)' % _format_value(self.args[0])
        # LOG(b, x) of PostgreSQL is LOG(x, b) in SQL Server
        return 'LOG(%s, %s)' % (
            _format_value(self.args[1]), _format_value(self.args[0]))

    @property
    def params(self):
        if len(self.args) == 1:
            return _value_params(self.args[0])
        return _value_params(self.args[1]) + _value_params(self.args[0])


class _Mod(_Function):
    __slots__ = ()

    def __str__(self):
        return '(%s %% %s)' % tuple(map(_format_value, self.args))


class _Div(_Function):
    __slots__ = ()

    def __str__(self):
        # Integer division truncated toward zero like PostgreSQL DIV
        return 'ROUND(%s / %s, 0, 1)' % tuple(map(_format_value, self.args))


class _Random(_Function):
    __slots__ = ()
    _function = 'RAND'


class _Trunc(_Function):
    __slots__ = ()

    def __str__(self):
        if len(self.args) == 1:
            return 'ROUND(%s, 0, 1)' % _format_value(self.args[0])
        return 'ROUND(%s, %s, 1)' % tuple(map(_format_value, self.args))


class _Round(_Function):
    __slots__ = ()

    def __str__(self):
        if len(self.args) == 1:
            return 'ROUND(%s, 0)' % _format_value(self.args[0])
        return 'ROUND(%s, %s)' % tuple(map(_format_value, self.args))


class _CharLength(_Function):
    __slots__ = ()

    def __str__(self):
        # LEN ignores trailing spaces
        return "(LEN(CAST(%s AS NVARCHAR(MAX)) + N'.') - 1)" % (
            _format_value(self.args[0]))


class _OctetLength(_Function):
    __slots__ = ()
    _function = 'DATALENGTH'


class _BitLength(_Function):
    __slots__ = ()

    def __str__(self):
        return '(DATALENGTH(%s) * 8)' % _format_value(self.args[0])


class _Position(_Function):
    __slots__ = ()

    def __str__(self):
        return 'CHARINDEX(%s, %s)' % tuple(map(_format_value, self.args))


class _Substring(_Function):
    __slots__ = ()

    def __str__(self):
        args = list(map(_format_value, self.args))
        if len(args) == 2:
            args.append('2147483647')
        return 'SUBSTRING(%s, %s, %s)' % tuple(args)


class _Overlay(_Function):
    __slots__ = ()

    def __str__(self):
        string, placing, from_ = map(_format_value, self.args[:3])
        if len(self.args) > 3:
            for_ = _format_value(self.args[3])
            return 'STUFF(%s, %s, %s, %s)' % (string, from_, for_, placing)
        return 'STUFF(%s, %s, LEN(%s), %s)' % (
            string, from_, placing, placing)

    @property
    def params(self):
        string, placing, from_ = self.args[:3]
        p = list(_value_params(string)) + list(_value_params(from_))
        if len(self.args) > 3:
            p.extend(_value_params(self.args[3]))
            p.extend(_value_params(placing))
        else:
            p.extend(_value_params(placing))
            p.extend(_value_params(placing))
        return tuple(p)


class _Trim(Expression):
    __slots__ = ('string', 'position', 'characters')

    def __init__(self, string, position='BOTH', characters=' '):
        self.string = string
        self.position = position
        self.characters = characters

    def __str__(self):
        value = _format_value(self.string)
        if self.characters != ' ':
            return "dbo.tryton_trim(%s, ?, '%s')" % (value, self.position)
        if self.position == 'LEADING':
            return 'LTRIM(%s)' % value
        elif self.position == 'TRAILING':
            return 'RTRIM(%s)' % value
        return 'LTRIM(RTRIM(%s))' % value

    @property
    def params(self):
        params = _value_params(self.string)
        if self.characters != ' ':
            params += (self.characters,)
        return params


class _Extract(Expression):
    __slots__ = ('field', 'expression')
    _parts = {
        'YEAR': 'year',
        'MONTH': 'month',
        'DAY': 'day',
        'HOUR': 'hour',
        'MINUTE': 'minute',
        'DOY': 'dayofyear',
        'QUARTER': 'quarter',
        'MILLISECONDS': 'millisecond',
        'MICROSECONDS': 'microsecond',
        }

    def __init__(self, field, expression):
        self.field = field.upper()
        self.expression = expression

    def __str__(self):
        value = _format_value(self.expression)
        field = self.field
        if field in self._parts:
            return 'DATEPART(%s, %s)' % (self._parts[field], value)
        elif field == 'SECOND':
            return ('(DATEPART(second, %s) '
                '+ DATEPART(microsecond, %s) / 1000000.0)' % (value, value))
        elif field == 'DOW':
            # Sunday is 0 independently of DATEFIRST
            return '((DATEPART(weekday, %s) + @@DATEFIRST - 1) %% 7)' % value
        elif field == 'ISODOW':
            return ('(((DATEPART(weekday, %s) + @@DATEFIRST - 2) %% 7) + 1)'
                % value)
        elif field == 'WEEK':
            return 'DATEPART(iso_week, %s)' % value
        elif field == 'EPOCH':
            # Exact decimal seconds without DATEDIFF(second) overflow
            return ("(CAST(DATEDIFF(day, '1970-01-01', %s) AS DECIMAL(20, 6))"
                " * 86400"
                " + DATEDIFF(second, CAST(CAST(%s AS DATE) AS DATETIME2), %s)"
                " + CAST(DATEPART(microsecond, %s) AS DECIMAL(20, 6))"
                " / 1000000)" % (value, value, value, value))
        elif field == 'DECADE':
            return '(DATEPART(year, %s) / 10)' % value
        elif field == 'CENTURY':
            return '((DATEPART(year, %s) + 99) / 100)' % value
        elif field == 'MILLENNIUM':
            return '((DATEPART(year, %s) + 999) / 1000)' % value
        elif field == 'ISOYEAR':
            return ('DATEPART(year, DATEADD(day, 26 - DATEPART(iso_week, %s),'
                ' %s))' % (value, value))
        raise NotImplementedError("EXTRACT %s is not supported" % field)

    @property
    def params(self):
        p = _value_params(self.expression)
        field = self.field
        if field == 'EPOCH':
            return p * 4
        if field in {'SECOND', 'ISOYEAR'}:
            return p * 2
        return p


class _DateTrunc(Expression):
    __slots__ = ('unit', 'expression')
    _units = {
        'microseconds', 'milliseconds', 'second', 'minute', 'hour', 'day',
        'week', 'month', 'quarter', 'year', 'decade', 'century', 'millennium'}

    def __init__(self, unit, expression):
        self.unit = unit
        self.expression = expression

    def __str__(self):
        if not isinstance(self.unit, str):
            raise NotImplementedError("DATE_TRUNC unit must be a constant")
        unit = self.unit.lower()
        if unit in {'microsecond', 'millisecond', 'seconds', 'minutes',
                'hours', 'days', 'weeks', 'months', 'quarters', 'years'}:
            unit = {'microsecond': 'microseconds',
                'millisecond': 'milliseconds'}.get(unit, unit.rstrip('s'))
        value = _format_value(self.expression)
        if unit in {'microseconds', 'milliseconds'}:
            return 'CAST(%s AS DATETIME2)' % value
        elif unit == 'second':
            return 'CAST(CAST(%s AS DATETIME2(0)) AS DATETIME2)' % value
        elif unit in {'minute', 'hour', 'day', 'month', 'quarter', 'year'}:
            return ("CAST(DATEADD(%s, DATEDIFF(%s, '2000-01-01', %s), "
                "'2000-01-01') AS DATETIME2)" % (unit, unit, value))
        elif unit == 'week':
            # 2000-01-03 is a Monday
            return ("CAST(DATEADD(week, DATEDIFF(day, '2000-01-03', %s) / 7, "
                "'2000-01-03') AS DATETIME2)" % value)
        raise NotImplementedError("DATE_TRUNC %s is not supported" % unit)

    @property
    def params(self):
        return _value_params(self.expression)


class _CurrentDate(Expression):
    __slots__ = ()

    def __str__(self):
        return 'CAST(?  AS DATE)'

    @property
    def params(self):
        return (transaction_timestamp(),)


class _CurrentTimestamp(Expression):
    "Timestamp of the transaction like PostgreSQL"
    __slots__ = ()

    def __str__(self):
        return 'CAST(? AS DATETIME2)'

    @property
    def params(self):
        return (transaction_timestamp(),)


class _ClockTimestamp(Expression):
    __slots__ = ()

    def __str__(self):
        return 'SYSUTCDATETIME()'

    @property
    def params(self):
        return ()


class _Cbrt(_Function):
    __slots__ = ()

    def __str__(self):
        value = _format_value(self.args[0])
        return ('SIGN(%s) * POWER(CAST(ABS(%s) AS FLOAT), CAST(1 AS FLOAT) / 3)'
            % (value, value))

    @property
    def params(self):
        return _value_params(self.args[0]) * 2


class _ToChar(_Function):
    "TO_CHAR for date and time using FORMAT of SQL Server 2012"
    __slots__ = ()
    # PostgreSQL patterns to .NET custom format, longest first
    _patterns = [
        ('HH24', 'HH'), ('HH12', 'hh'), ('HH', 'hh'), ('MI', 'mm'),
        ('SS', 'ss'), ('US', 'ffffff'), ('MS', 'fff'),
        ('AM', 'tt'), ('PM', 'tt'), ('am', 'tt'), ('pm', 'tt'),
        ('YYYY', 'yyyy'), ('YY', 'yy'), ('Month', 'MMMM'), ('Mon', 'MMM'),
        ('MM', 'MM'), ('Day', 'dddd'), ('Dy', 'ddd'), ('DD', 'dd'),
        ]

    @classmethod
    def _convert(cls, pattern):
        result = []
        i = 0
        while i < len(pattern):
            for source, target in cls._patterns:
                if pattern.startswith(source, i):
                    result.append(target)
                    i += len(source)
                    break
            else:
                char = pattern[i]
                if char.isalpha() or char in '%\\':
                    result.append('\\' + char)
                else:
                    result.append(char)
                i += 1
        return ''.join(result)

    def __str__(self):
        value, pattern = self.args
        if not isinstance(pattern, str):
            raise NotImplementedError("TO_CHAR pattern must be a constant")
        return "FORMAT(%s, ?, 'en-US')" % _format_value(value)

    @property
    def params(self):
        value, pattern = self.args
        return _value_params(value) + (self._convert(pattern),)


class _AtTimeZone(Expression):
    """Convert timestamp between time zones

    Tryton converts naive UTC timestamp into the naive local timestamp with
    AtTimeZone(AtTimeZone(column, 'utc'), timezone).  SQL Server 2012 has no
    time zone support so the conversion uses the UTC offsets computed by
    Python for the transitions of the time zone.
    """
    __slots__ = ('field', 'zone')

    def __init__(self, field, zone):
        self.field = field
        self.zone = zone

    @property
    def _utc(self):
        return isinstance(self.zone, str) and self.zone.upper() == 'UTC'

    def __str__(self):
        if not isinstance(self.zone, str):
            raise NotImplementedError("Time zone must be a constant")
        if self._utc:
            return _format_value(self.field)
        if not (isinstance(self.field, sql_functions.AtTimeZone)
                and isinstance(self.field.zone, str)
                and self.field.zone.upper() == 'UTC'):
            raise NotImplementedError(
                "Only conversion from UTC is supported")
        value = _format_value(self.field)
        return 'DATEADD(second, %s, %s)' % (
            _utc_offset_case(value, self.zone), value)

    @property
    def params(self):
        if self._utc:
            return _value_params(self.field)
        params = _value_params(self.field)
        count = len(_utc_offsets(self.zone)) - 1
        return params * (count + 1)


_offsets_cache = {}


def _utc_offsets(zone, start=1970, end=2100):
    """Return the list of (UTC start, offset in seconds) of the time zone
    The first item has no start"""
    key = (zone, start, end)
    if key in _offsets_cache:
        return _offsets_cache[key]
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(zone)
    utc = datetime.timezone.utc

    def offset(moment):
        return int(moment.astimezone(tz).utcoffset().total_seconds())

    moment = datetime.datetime(start, 1, 1, tzinfo=utc)
    stop = datetime.datetime(end, 1, 1, tzinfo=utc)
    step = datetime.timedelta(days=1)
    current = offset(moment)
    result = [(None, current)]
    while moment < stop:
        following = moment + step
        value = offset(following)
        if value != current:
            # Find the transition minute
            low, high = moment, following
            while high - low > datetime.timedelta(minutes=1):
                middle = low + (high - low) / 2
                middle = middle.replace(second=0, microsecond=0)
                if middle == low:
                    break
                if offset(middle) == current:
                    low = middle
                else:
                    high = middle
            result.append((high.replace(tzinfo=None), value))
            current = value
        moment = following
    _offsets_cache[key] = result
    return result


def _utc_offset_case(value, zone):
    offsets = _utc_offsets(zone)
    if len(offsets) == 1:
        return str(offsets[0][1])
    case = 'CASE'
    # Search from the most recent transition
    for start, offset in reversed(offsets[1:]):
        case += " WHEN %s >= '%s' THEN %d" % (
            value, start.isoformat(' '), offset)
    case += ' ELSE %d END' % offsets[0][1]
    return case


def transaction_timestamp():
    "Return the UTC timestamp of the current transaction like PostgreSQL"
    from trytond.transaction import Transaction
    connection = Transaction().connection
    timestamps = _local.__dict__.get('timestamps')
    if timestamps is None:
        timestamps = _local.timestamps = {}
    key = id(connection)
    value = timestamps.get(key)
    if value is None:
        value = timestamps[key] = datetime.datetime.now(
            datetime.timezone.utc).replace(tzinfo=None)
    return value


def reset_transaction_timestamp(connection):
    "Reset the timestamp when the transaction of the connection ends"
    timestamps = _local.__dict__.get('timestamps')
    if timestamps:
        timestamps.pop(id(connection), None)


class TryCast(Expression):
    "Cast returning NULL on failure (SQL Server 2012)"
    __slots__ = ('expression', 'typename')

    def __init__(self, expression, typename):
        self.expression = expression
        self.typename = typename

    def __str__(self):
        return 'TRY_CAST(%s AS %s)' % (
            _format_value(self.expression), _cast_type(self.typename))

    @property
    def params(self):
        return _value_params(self.expression)


class JSONGet(Expression):
    "JSON text of the value of the key"
    __slots__ = ('column', 'key')

    def __init__(self, column, key):
        self.column = column
        self.key = key

    def __str__(self):
        return 'dbo.tryton_json_get(%s, ?)' % _format_value(self.column)

    @property
    def params(self):
        return _value_params(self.column) + (self.key,)


MAPPING = {
    sql_functions.Ceil: _Ceil,
    sql_functions.Ln: _Ln,
    sql_functions.Log: _Log,
    sql_functions.Mod: _Mod,
    sql_functions.Div: _Div,
    sql_functions.Random: _Random,
    sql_functions.Trunc: _Trunc,
    sql_functions.Round: _Round,
    sql_functions.CharLength: _CharLength,
    sql_functions.OctetLength: _OctetLength,
    sql_functions.BitLength: _BitLength,
    sql_functions.Position: _Position,
    sql_functions.Substring: _Substring,
    sql_functions.Overlay: _Overlay,
    sql_functions.Trim: _Trim,
    sql_functions.Extract: _Extract,
    sql_functions.DateTrunc: _DateTrunc,
    sql_functions.CurrentDate: _CurrentDate,
    sql_functions.CurrentTimestamp: _CurrentTimestamp,
    sql_functions.Now: _CurrentTimestamp,
    sql_functions.TransactionTimestamp: _CurrentTimestamp,
    sql_functions.StatementTimestamp: _ClockTimestamp,
    sql_functions.ClockTimestamp: _ClockTimestamp,
    sql_functions.Localtimestamp: _CurrentTimestamp,
    sql_functions.ToChar: _ToChar,
    sql_functions.AtTimeZone: _AtTimeZone,
    sql_functions.Atan2: _simple('ATN2'),
    sql_functions.Cbrt: _Cbrt,
    sql_functions.SetSeed: _simple('RAND'),
    }


def _patch_all():
    if getattr(sql, '_trytond_mssql_patched', False):
        return
    o = sql_operators

    _patch(Select, '__str__', _select_str)
    _patch(Select, 'params', _select_params)
    _patch(CombiningQuery, '__str__', _combining_str)
    _patch(CombiningQuery, 'params', _combining_params)
    _patch(With, 'statement', _with_statement)
    _patch(With, 'statement_params', _with_statement_params)
    _patch(From, '__str__', _from_str)
    _patch(From, 'params', _from_params)
    _patch(Values, '__str__', _values_str)
    _patch(Values, 'params', _values_params)
    _patch(Join, '__str__', _join_str)
    _patch(Join, 'params', _join_params)
    _patch(Insert, '__str__', _insert_str)
    _patch(Insert, 'params', _insert_params)
    _patch(Update, '__str__', _update_str)
    _patch(Update, 'params', _update_params)
    _patch(Delete, '__str__', _delete_str)
    _patch(Delete, 'params', _delete_params)

    _patch(o.Operator, '_format', _operator_format)
    _patch(o.Operator, 'params', _operator_params)
    _patch(o.Concat, '__str__', _concat_str)
    _patch(o.Concat, 'params', _concat_params)
    _patch(o.Like, '__str__', _like_str)
    _patch(o.Like, 'params', _like_params)
    _patch(o.Is, '__str__', _is_str)
    _patch(o.Is, 'params', _is_params)
    _patch(o.IsDistinct, '__str__', _is_distinct_str)
    _patch(o.IsDistinct, 'params', _is_distinct_params)
    _patch(o.Abs, '__str__', _unary_function('ABS'))
    _patch(o.Abs, 'params', _unary_params)
    _patch(o.SquareRoot, '__str__', _unary_function('SQRT'))
    _patch(o.SquareRoot, 'params', _unary_params)
    _patch(o.CubeRoot, '__str__', _cbrt_str)
    _patch(o.CubeRoot, 'params', _unary_params)
    _patch(o.Pow, '__str__', _pow_str)
    _patch(o.Pow, 'params', _binary_params)
    _patch(o.BXor, '__str__', _xor_str)
    _patch(o.BXor, 'params', _binary_params)

    _patch(sql_conditionals.Case, '__str__', _case_str)
    _patch(sql_conditionals.Case, 'params', _case_params)
    _patch(sql_conditionals.Coalesce, '__str__', _coalesce_str)
    _patch(sql_conditionals.Coalesce, 'params', _coalesce_params)
    _patch(sql_conditionals.Greatest, '__str__', _greatest_str)
    _patch(sql_conditionals.Least, '__str__', _greatest_str)

    _patch(sql_aggregate.Aggregate, '__str__', _aggregate_str)
    _patch(sql_aggregate.Aggregate, 'params', _aggregate_params)
    _patch(Window, '__str__', _window_str)
    _patch(Window, 'params', _window_params)
    _patch(Window, 'alias', _window_alias)
    _patch(Window, 'has_alias', lambda self, original: False)

    _patch(Cast, '__str__', _cast_str)
    _patch(Cast, 'params', _cast_params)

    _patch(sql_functions.Function, '_format', _function_format)
    _patch(sql_functions.Function, 'params', _function_params)
    sql._trytond_mssql_patched = True


_patch_all()
