# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Execute the queries rendered by the SQL Server dialect on the server

It checks that the rendered SQL is accepted by the version of the server
(SQL Server 2012 and later) and returns the same results as PostgreSQL."""
import datetime
import unittest
from array import array
from decimal import Decimal
from unittest.mock import patch

from sql import (
    Flavor, Literal, Null, Select, Table, Union, Values, With, Window)
from sql.aggregate import BoolAnd, BoolOr, Count, Max, Min, Sum
from sql.conditionals import Case, Coalesce, Greatest, Least, NullIf
from sql.functions import (
    CharLength, Ceil, CurrentTimestamp, DateTrunc, Div, Extract, LastValue,
    Lower, Mod, NthValue, Position, Round, RowNumber, Substring, Trim, Trunc,
    Upper)
from sql.operators import (
    Concat, Exists, ILike, Is, IsNot, Like, NotIn, Pow)

from trytond import backend
from trytond.tests.test_tryton import DB_NAME


@unittest.skipIf(backend.name != 'mssql', "SQL Server only")
class MSSQLDialectTestCase(unittest.TestCase):
    "Test SQL Server dialect"

    @classmethod
    def setUpClass(cls):
        import pyodbc

        from trytond.backend.mssql import dialect
        from trytond.backend.mssql.database import Database
        cls.dialect = dialect
        cls.name = '%s_dialect' % DB_NAME
        cls.admin = pyodbc.connect(
            Database._connection_string('master'), autocommit=True)
        cls._drop()
        cls.admin.execute(
            'CREATE DATABASE "%s" COLLATE Latin1_General_100_CS_AS' % cls.name)
        cls.connection = pyodbc.connect(
            Database._connection_string(cls.name), autocommit=True)
        cls.connection.execute(
            "CREATE TABLE t (id INT PRIMARY KEY, name NVARCHAR(100), "
            "active BIT, parent INT, amount DECIMAL(38, 15), d DATETIME2)")
        cls.connection.execute(
            "INSERT INTO t VALUES "
            "(1, N'Root', 1, NULL, 10.5, '2024-03-15 10:20:30.123456'), "
            "(2, N'child [a]', 0, 1, 2.25, '2024-03-16 00:00:00'), "
            "(3, N'Child_b', 1, 1, NULL, NULL), "
            "(4, N'grand', 1, 2, 1, '2023-12-31 23:59:59')")

    @classmethod
    def _drop(cls):
        cls.admin.execute(
            "IF DB_ID('%(name)s') IS NOT NULL BEGIN "
            'ALTER DATABASE "%(name)s" SET SINGLE_USER '
            'WITH ROLLBACK IMMEDIATE; '
            'DROP DATABASE "%(name)s" END' % {'name': cls.name})

    @classmethod
    def tearDownClass(cls):
        cls.connection.close()
        cls._drop()
        cls.admin.close()

    def test_queries(self):
        "Test queries"
        flavor = Flavor.get()
        Flavor.set(self.dialect.MSSQLFlavor())
        timestamp = patch.object(
            self.dialect, 'transaction_timestamp',
            lambda: datetime.datetime(2024, 1, 2, 3, 4, 5))
        timestamp.start()
        self.addCleanup(timestamp.stop)
        self.addCleanup(Flavor.set, flavor)
        connection = self.connection

        def check(label, query, expected=None):
            with self.subTest(label):
                sql_str, params = tuple(query)
                self.assertEqual(sql_str.count('?'), len(params), sql_str)
                cursor = connection.cursor()
                cursor.execute(sql_str, params)
                if cursor.description:
                    rows = [tuple(r) for r in cursor.fetchall()]
                else:
                    rows = cursor.rowcount
                if expected is not None:
                    self.assertEqual(rows, expected, sql_str)

        def rejected(label, query):
            with self.subTest(label):
                with self.assertRaises(NotImplementedError):
                    str(query)

        t = Table('t')
        t2 = Table('t')

        check('select bool column as value',
            t.select(t.id, t.active, where=t.active, order_by=t.id),
            [(1, True), (3, True), (4, True)])
        check('not bool column',
            t.select(t.id, where=~t.active), [(2,)])
        check('predicate as value',
            t.select(t.id, (t.parent == 1).as_('is_child'), order_by=t.id),
            [(1, None), (2, True), (3, True), (4, False)])
        check('literal true where',
            t.select(Count(Literal('*')), where=Literal(True)), [(4,)])
        check('literal false and',
            t.select(t.id, where=Literal(False) & (t.id == 1)), [])

        # Sub-queries in aggregates are applied
        t3 = Table('t')
        max_id = t3.select(Max(t3.id), where=t3.id < 100)
        check('aggregate with sub-query grouped',
            t.select(t.parent, Min(t.id * max_id + Literal(0)),
                where=t.id > 0, group_by=t.parent, order_by=t.parent),
            [(None, 4), (1, 8), (2, 16)])
        check('aggregate with sub-query and having',
            t.select(t.parent, where=t.id > 0, group_by=t.parent,
                having=Min(t.id * max_id) > 5, order_by=t.parent),
            [(1,), (2,)])
        children = t3.select(Count(Literal('*')), where=t3.parent == t.id)
        check('aggregate with correlated sub-query',
            t.select(Sum(Literal(0) + children), where=t.id < 100), [(3,)])
        check('aggregate with sub-query without from',
            Select([Max(Literal(0) + max_id)]), [(4,)])
        rejected('aggregate with IN sub-query',
            t.select(Sum(Case((t.id.in_(t3.select(t3.id)), 1), else_=0))))
        check('window with sub-query not applied',
            t.select(t.id, where=t.id == 1), [(1,)])
        check('group by constant only',
            t.select(Count(Literal('*')), group_by=[DateTrunc(None, t.d)]),
            [(4,)])
        check('group by constant only without row',
            t.select(Count(Literal('*')), where=t.id < 0,
                group_by=[DateTrunc(None, t.d)]), [])
        check('group by constant and column',
            t.select(t.parent, DateTrunc(None, t.d), Count(Literal('*')),
                group_by=[t.parent, DateTrunc(None, t.d)],
                order_by=t.parent),
            [(None, None, 1), (1, None, 2), (2, None, 1)])
        check('python bool param compare',
            t.select(t.id, where=(t.active == False)), [(2,)])
        check('literal bool value',
            t.select(Literal(True).as_('x'), where=t.id == 1), [(True,)])
        check('limit only',
            t.select(t.id, order_by=t.id.desc, limit=2), [(4,), (3,)])
        check('limit offset',
            t.select(t.id, order_by=t.id, limit=2, offset=1), [(2,), (3,)])
        check('offset no order',
            t.select(Count(Literal(1)), offset=0, limit=1), [(4,)])
        check('subquery order dropped',
            t.select(t.id, where=t.id.in_(
                    t2.select(t2.parent, order_by=t2.id)), order_by=t.id),
            [(1,), (2,)])
        check('subquery with limit',
            t.select(t.id, where=t.id.in_(
                    t2.select(t2.id, order_by=t2.id.desc, limit=1))), [(4,)])
        check('duplicate order',
            t.select(t.id, order_by=[t.id.asc, t.name, t.id.desc]),
            [(1,), (2,), (3,), (4,)])
        check('nulls first',
            t.select(t.id, order_by=[t.parent.nulls_first, t.id]),
            [(1,), (2,), (3,), (4,)])
        check('nulls last desc',
            t.select(t.id, order_by=[t.amount.desc.nulls_last, t.id]),
            [(1,), (2,), (4,), (3,)])
        check('concat with int',
            t.select(Concat(Concat(t.id, '/'), t.name), where=t.id == 1),
            [('1/Root',)])
        check('concat null propagates',
            t.select(Concat(t.name, t.parent), where=t.id == 1), [(None,)])
        check('like bracket literal',
            t.select(t.id, where=Like(t.name, '%[a]%')), [(2,)])
        check('like escape',
            t.select(t.id, where=Like(t.name, 'Child\\_%', escape='\\')), [(3,)])
        check('ilike',
            t.select(t.id, where=ILike(t.name, 'child%'), order_by=t.id),
            [(2,), (3,)])
        check('case sensitive equality',
            t.select(t.id, where=t.name == 'root'), [])
        check('in list with bools',
            t.select(t.id, where=t.active.in_([True]), order_by=t.id),
            [(1,), (3,), (4,)])
        check('in array',
            t.select(t.id, where=t.id.in_(array('l', [1, 3])), order_by=t.id),
            [(1,), (3,)])
        check('not in',
            t.select(t.id, where=NotIn(t.id, [1, 2, 3])), [(4,)])
        check('exists',
            t.select(t.id, where=Exists(
                    t2.select(t2.id, where=t2.parent == t.id)), order_by=t.id),
            [(1,), (2,)])
        check('case when bool',
            t.select(Case((t.active, 'a'), else_='i'), order_by=t.id),
            [('a',), ('i',), ('a',), ('a',)])
        check('case result predicate',
            t.select(Case((t.id == 1, t.parent == Null), else_=Literal(False)),
                order_by=t.id), [(True,), (False,), (False,), (False,)])
        check('coalesce',
            t.select(Coalesce(t.parent, 0), order_by=t.id),
            [(0,), (1,), (1,), (2,)])
        check('greatest least',
            t.select(Greatest(t.id, t.parent, 3), Least(t.id, t.parent),
                order_by=t.id), [(3, 1), (3, 1), (3, 1), (4, 2)])
        check('nullif', t.select(NullIf(t.id, 1), order_by=t.id),
            [(None,), (2,), (3,), (4,)])
        check('bool_and/bool_or group by',
            t.select(t.parent, BoolAnd(t.active), BoolOr(t.active),
                group_by=t.parent, order_by=t.parent),
            [(None, True, True), (1, False, True), (2, True, True)])
        check('aggregate filter',
            t.select(Count(Literal('*'), filter_=t.active)), [(3,)])
        check('sum decimal',
            t.select(Sum(t.amount)), [(Decimal('13.750000000000000'),)])
        check('group by alias',
            t.select(Coalesce(t.parent, 0).as_('p'), Count(Literal('*')),
                group_by=[Coalesce(t.parent, 0).as_('p')],
                order_by=[Coalesce(t.parent, 0).as_('p')]),
            [(0, 1), (1, 2), (2, 1)])
        check('window row_number',
            t.select(t.id, RowNumber(window=Window([t.parent], order_by=[t.id.desc])),
                order_by=t.id), [(1, 1), (2, 2), (3, 1), (4, 1)])
        wn = Window(
            [t.parent], order_by=[t.id.asc], frame='ROWS', start=0, end=1)
        check('nth_value lead',
            t.select(t.id, NthValue(t.id, 2, window=wn),
                NthValue(t.id, 1, window=wn), order_by=t.id),
            [(1, None, 1), (2, 3, 2), (3, None, 3), (4, None, 4)])
        wu = Window([t.parent], order_by=[t.id.asc],
            frame='ROWS', start=None, end=None)
        check('last_value unbounded',
            t.select(t.id, LastValue(t.id, window=wu), order_by=t.id),
            [(1, 1), (2, 3), (3, 3), (4, 4)])
        check('window running sum',
            t.select(t.id, Sum(t.id, window=Window([], order_by=[t.id],
                        frame='ROWS', start=None, end=0)), order_by=t.id),
            [(1, 1), (2, 3), (3, 6), (4, 10)])
        check('char length trailing spaces',
            t.select(CharLength(Concat(t.name, '  ')), where=t.id == 1), [(6,)])
        check('position/substring/trim',
            t.select(Position('oo', t.name), Substring(t.name, 2, 2),
                Substring(t.name, 3), Trim(Concat(' x', ' ')), where=t.id == 1),
            [(2, 'oo', 'ot', 'x')])
        check('upper/lower', t.select(Upper(t.name), Lower(t.name),
                where=t.id == 1), [('ROOT', 'root')])
        check('extract',
            t.select(Extract('YEAR', t.d), Extract('MONTH', t.d),
                Extract('DOW', t.d), Extract('WEEK', t.d), where=t.id == 1),
            [(2024, 3, 5, 11)])
        check('date_trunc',
            t.select(DateTrunc('month', t.d), DateTrunc('day', t.d),
                DateTrunc('week', t.d), where=t.id == 1),
            [(datetime.datetime(2024, 3, 1), datetime.datetime(2024, 3, 15),
                    datetime.datetime(2024, 3, 11))])
        check('current timestamp',
            t.select(CurrentTimestamp(), where=t.id == 1),
            [(datetime.datetime(2024, 1, 2, 3, 4, 5),)])
        check('math', t.select(Round(Literal(2.5)), Trunc(Literal(-2.7)),
                Mod(t.id, 3), Div(Literal(7), Literal(2)), Ceil(Literal(1.2)),
                Pow(t.id, 2), where=t.id == 4),
            [(3.0, -2.0, 1, 3, 2.0, 16)])
        check('is null / is not',
            t.select(t.id, where=Is(t.parent, None)), [(1,)])
        check('is true',
            t.select(t.id, where=Is(t.active, False)), [(2,)])
        check('is not true',
            t.select(t.id, where=IsNot(t.active, True)), [(2,)])
        check('union',
            Union(t.select(t.id, where=t.id == 1), t.select(t.id, where=t.id == 1),
                order_by=None), [(1,)])
        check('union limit',
            Union(t.select(t.id), t.select(t.id), limit=1), None)
        tree = With('id', recursive=True)
        tree.query = t.select(t.id, where=t.id == 2)
        tree.query |= t.join(tree, condition=t.parent == tree.id).select(t.id)
        check('recursive cte in subquery',
            t.select(t.id, where=t.id.in_(tree.select(tree.id, with_=[tree])),
                order_by=t.id), [(2,), (4,)])
        paths = With('id', 'path', recursive=True)
        paths.query = t.select(t.id, Concat(t.id, '/'), where=t.parent == Null)
        paths.query |= t.join(paths, condition=t.parent == paths.id).select(
            t.id, Concat(Concat(paths.path, t.id), '/'))
        check('recursive cte select',
            paths.select(paths.id, paths.path, with_=[paths], order_by=paths.id),
            [(1, '1/'), (2, '1/2/'), (3, '1/3/'), (4, '1/2/4/')])
        values = Values([[1, 'x'], [2, 'y']])
        check('values as from',
            values.select(values.column1, values.column2, order_by=values.column1),
            [(1, 'x'), (2, 'y')])
        check('join',
            t.join(t2, 'LEFT', condition=t.parent == t2.id).select(
                t.id, t2.name, order_by=t.id),
            [(1, None), (2, 'Root'), (3, 'Root'), (4, 'child [a]')])

        # DML
        check('insert multi values with bool',
            t.insert([t.id, t.name, t.active], [[10, 'x', True], [11, 'y', False]]),
            2)
        check('insert select ordered',
            t.insert([t.id, t.name], t2.select(t2.id + 100, t2.name,
                    where=t2.id > 10, order_by=t2.id)), 1)
        check('update with predicate value',
            t.update([t.active], [t.parent == Null], where=t.id == 10), 1)
        check('update from',
            t.update([t.name], [t2.name], from_=[t2],
                where=(t.id == 11) & (t2.id == 1)), 1)
        check('verify update', t.select(t.active, t.name, where=t.id.in_([10, 11]),
                order_by=t.id), [(True, 'x'), (False, 'Root')])
        paths2 = With('id', 'path', recursive=True)
        paths2.query = t.select(t.id, Concat(t.id, '/'), where=t.parent == Null)
        paths2.query |= t.join(paths2, condition=t.parent == paths2.id).select(
            t.id, Concat(Concat(paths2.path, t.id), '/'))
        check('update from recursive cte',
            t.update([t.name], [paths2.path], from_=[paths2],
                where=t.id == paths2.id, with_=[paths2]), 7)
        check('delete with subquery',
            t.delete(where=t.id.in_(t2.select(t2.id, where=t2.id >= 10))), 3)
        check('insert returning',
            t.insert([t.id, t.name], [[20, 'r']], returning=[t.id]), [(20,)])

