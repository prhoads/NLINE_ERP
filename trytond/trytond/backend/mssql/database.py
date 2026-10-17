# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Microsoft SQL Server backend (SQL Server 2012 and later).

The URI has the form::

    mssql://user:password@host:port/?driver=ODBC+Driver+17+for+SQL+Server

Use ``mssql://@host/`` (no user) for Windows authentication.  A named
instance like ``localhost\\SQLEXPRESS`` can be given with the ``server`` query
parameter, e.g. ``mssql://user:pass@/?server=localhost%5CSQLEXPRESS``.
Other query parameters are passed as ODBC connection attributes.
"""
import datetime
import json
import logging
import os
import struct
import threading
import time
import urllib.parse
import warnings
from collections import defaultdict, deque
from decimal import Decimal

import pyodbc
from sql import Cast, Flavor, Table

from trytond.backend.database import DatabaseInterface, SQLType
from trytond.config import config, parse_uri

from . import dialect
from .dialect import MSSQLFlavor

__all__ = [
    'Database',
    'DatabaseIntegrityError', 'DatabaseDataError', 'DatabaseOperationalError']

logger = logging.getLogger(__name__)

_timeout = config.getint('database', 'timeout')
_maxconn = config.getint('database', 'maxconn', default=64)
_default_name = config.get('database', 'default_name', default='master')
_collation = config.get(
    'database', 'mssql_collation', default='Latin1_General_100_CS_AS')
# Only used to emulate an older server version (e.g. 110 for SQL Server 2012)
_compatibility_level = config.getint(
    'database', 'mssql_compatibility_level', default=0)
_default_driver = 'ODBC Driver 17 for SQL Server'

# Error numbers
_OPERATIONAL_ERRORS = {
    4060,  # cannot open database
    18456,  # login failed
    1205,  # deadlock victim
    1222,  # lock request time out
    3960,  # snapshot update conflict
    3961,  # snapshot conflict with DDL
    3966,  # snapshot transaction failed
    }
_INTEGRITY_ERRORS = {
    515,  # NULL into NOT NULL column
    547,  # constraint (foreign key or check) violation
    2601,  # duplicate key in unique index
    2627,  # unique constraint violation
    }
_DATA_ERRORS = {
    220, 232, 236, 237,  # arithmetic overflow
    241, 242,  # date/time conversion
    245, 248,  # conversion failed
    8114, 8115,  # conversion and overflow
    8134,  # divide by zero
    8152,  # string or binary data would be truncated
    }


class DatabaseIntegrityError(pyodbc.IntegrityError):
    pass


class DatabaseOperationalError(pyodbc.OperationalError):
    pass


class DatabaseDataError(pyodbc.DataError):
    pass


def _error_number(error):
    "Return the native error number of a pyodbc exception"
    for arg in error.args:
        if isinstance(arg, str):
            # Messages end with (number) (SQLExecDirectW)
            start = arg.rfind('(', 0, arg.rfind('(SQL'))
            if start >= 0:
                end = arg.find(')', start)
                try:
                    return int(arg[start + 1:end])
                except ValueError:
                    pass
    return None


def _translate(error):
    number = _error_number(error)
    if number in _OPERATIONAL_ERRORS:
        return DatabaseOperationalError(*error.args)
    elif number in _INTEGRITY_ERRORS:
        return DatabaseIntegrityError(*error.args)
    elif number in _DATA_ERRORS:
        return DatabaseDataError(*error.args)
    elif isinstance(error, pyodbc.OperationalError):
        return DatabaseOperationalError(*error.args)
    elif isinstance(error, pyodbc.IntegrityError):
        return DatabaseIntegrityError(*error.args)
    elif isinstance(error, pyodbc.DataError):
        return DatabaseDataError(*error.args)
    return error


_MAX_PARAMS = 2000
_LONG_STRING = 4000
_LONG_BINARY = 8000


class Cursor:
    "Wrap pyodbc cursor to adapt parameters, rows and errors"
    __slots__ = ('_cursor', '_connection')

    def __init__(self, connection, cursor):
        self._connection = connection
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        pass

    def execute(self, query, params=()):
        params = tuple(map(_adapt, params))
        sizes = None
        for i, value in enumerate(params):
            if ((isinstance(value, str) and len(value) > _LONG_STRING)
                    or (isinstance(value, bytes)
                        and len(value) > _LONG_BINARY)):
                if sizes is None:
                    sizes = [None] * len(params)
                if isinstance(value, str):
                    sizes[i] = (pyodbc.SQL_WVARCHAR, 0, 0)
                else:
                    sizes[i] = (pyodbc.SQL_VARBINARY, 0, 0)
        if len(params) > _MAX_PARAMS:
            # SQL Server supports at most 2100 parameters
            query = dialect.inline(query, params)
            params = ()
            sizes = None
        if sizes is not None:
            self._cursor.setinputsizes(sizes)
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug('%s %s', query, params)
        try:
            if params:
                self._cursor.execute(query, params)
            else:
                self._cursor.execute(query)
        except pyodbc.Error as exception:
            raise _translate(exception) from exception
        finally:
            if sizes is not None:
                self._cursor.setinputsizes(None)
        return self

    def executemany(self, query, seq_of_params):
        for params in seq_of_params:
            self.execute(query, params)

    def fetchone(self):
        try:
            row = self._cursor.fetchone()
        except pyodbc.ProgrammingError:
            if self._cursor.description is None:
                return None
            raise
        return tuple(row) if row is not None else None

    def fetchmany(self, size=None):
        if size is None:
            size = self._cursor.arraysize
        return [tuple(r) for r in self._cursor.fetchmany(size)]

    def fetchall(self):
        try:
            return [tuple(r) for r in self._cursor.fetchall()]
        except pyodbc.ProgrammingError:
            if self._cursor.description is None:
                return []
            raise

    def __iter__(self):
        if self._cursor.description is None:
            return iter(())
        return (tuple(r) for r in self._cursor)

    @property
    def description(self):
        return self._cursor.description

    @property
    def rowcount(self):
        if self._cursor.description is not None:
            # Number of selected rows is unknown before fetching
            return -1
        return self._cursor.rowcount

    @property
    def arraysize(self):
        return self._cursor.arraysize

    @arraysize.setter
    def arraysize(self, value):
        self._cursor.arraysize = value

    def close(self):
        self._cursor.close()


def _adapt(value):
    if isinstance(value, datetime.timedelta):
        return value.total_seconds()
    elif isinstance(value, datetime.datetime) and value.tzinfo:
        return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    elif isinstance(value, memoryview):
        return value.tobytes()
    elif isinstance(value, bytearray):
        return bytes(value)
    return value


class Connection:
    "Wrap pyodbc connection"
    __slots__ = ('_connection', 'database_name', 'isolation', 'used',
        '__weakref__')

    def __init__(self, connection, database_name):
        self._connection = connection
        self.database_name = database_name
        self.isolation = None
        self.used = False

    def cursor(self):
        return Cursor(self, self._connection.cursor())

    def commit(self):
        try:
            self._connection.commit()
        except pyodbc.Error as exception:
            raise _translate(exception) from exception
        finally:
            dialect.reset_transaction_timestamp(self)

    def rollback(self):
        try:
            self._connection.rollback()
        except pyodbc.Error as exception:
            raise _translate(exception) from exception
        finally:
            dialect.reset_transaction_timestamp(self)

    def close(self):
        try:
            self._connection.close()
        except pyodbc.Error:
            pass

    @property
    def autocommit(self):
        return self._connection.autocommit

    @autocommit.setter
    def autocommit(self, value):
        self._connection.autocommit = value

    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        if type is None:
            self.commit()
        else:
            self.rollback()


def _convert_time(value):
    # SQL_SS_TIME2: hour, minute, second as unsigned short, 2 bytes padding
    # and fraction in nanoseconds as unsigned int
    hour, minute, second, _, fraction = struct.unpack('<3HHI', value)
    return datetime.time(hour, minute, second, fraction // 1000)


def _convert_datetimeoffset(value):
    # year, month, day, hour, minute, second, fraction (ns), tz hour, tz min
    (year, month, day, hour, minute, second, fraction,
        tz_hour, tz_minute) = struct.unpack('<6hI2h', value)
    tzinfo = datetime.timezone(
        datetime.timedelta(hours=tz_hour, minutes=tz_minute))
    return datetime.datetime(year, month, day, hour, minute, second,
        fraction // 1000, tzinfo=tzinfo).astimezone(
        datetime.timezone.utc).replace(tzinfo=None)


_SQL_SS_TIME2 = -154
_SQL_SS_TIMESTAMPOFFSET = -155


def _convert_decimal(value):
    # SQL_NUMERIC_STRUCT: precision, scale, sign (1 is positive) and
    # 16 bytes little endian value
    scale = value[1]
    number = int.from_bytes(value[3:19], 'little')
    if not value[2]:
        number = -number
    result = Decimal(number).scaleb(-scale)
    # Remove trailing zeros added by the fixed scale like PostgreSQL
    if result.as_tuple().exponent < 0:
        result = result.normalize()
        if result.as_tuple().exponent > 0:
            result = result.quantize(1)
    return result


def _escape_identifier(name):
    return '[%s]' % name.replace(']', ']]')


class Database(DatabaseInterface):

    _lock = threading.RLock()
    _databases = defaultdict(dict)
    _list_cache = {}
    _list_cache_timestamp = {}
    flavor = MSSQLFlavor()
    # SQL Server supports at most 2100 parameters per statement and 1000 rows
    # per VALUES
    IN_MAX = 1000

    TYPES_MAPPING = {
        'BOOL': SQLType('BIT', 'BIT'),
        'BOOLEAN': SQLType('BIT', 'BIT'),
        'SMALLINT': SQLType('SMALLINT', 'SMALLINT'),
        'INTEGER': SQLType('INT', 'INT'),
        'BIGINT': SQLType('BIGINT', 'BIGINT'),
        'FLOAT': SQLType('FLOAT', 'FLOAT'),
        'REAL': SQLType('REAL', 'REAL'),
        'NUMERIC': SQLType('DECIMAL', 'DECIMAL(38, 15)'),
        'VARCHAR': SQLType('NVARCHAR', 'NVARCHAR(4000)'),
        'TEXT': SQLType('NVARCHAR', 'NVARCHAR(MAX)'),
        'DATE': SQLType('DATE', 'DATE'),
        'TIME': SQLType('TIME', 'TIME(6)'),
        'TIMESTAMP': SQLType('DATETIME2', 'DATETIME2(6)'),
        'DATETIME': SQLType('DATETIME2', 'DATETIME2(0)'),
        'INTERVAL': SQLType('FLOAT', 'FLOAT'),
        'BLOB': SQLType('VARBINARY', 'VARBINARY(MAX)'),
        'JSON': SQLType('NVARCHAR', 'NVARCHAR(MAX)'),
        'FULLTEXT': SQLType('NVARCHAR', 'NVARCHAR(MAX)'),
        }

    def __new__(cls, name=_default_name):
        with cls._lock:
            databases = cls._databases[os.getpid()]
            now = datetime.datetime.now()
            for database in list(databases.values()):
                if ((now - database._last_use).total_seconds() > _timeout
                        and database.name != name
                        and not database._used):
                    database.close()
            if name in databases:
                inst = databases[name]
            else:
                inst = DatabaseInterface.__new__(cls, name=name)
                inst._pool = deque()
                inst._used = 0
                inst._pool_lock = threading.Lock()
                inst._unique_indexable = {}
                inst._functions_checked = False
                databases[name] = inst
            inst._last_use = datetime.datetime.now()
            return inst

    def __init__(self, name=_default_name):
        super().__init__(name)

    @classmethod
    def _connection_string(cls, name):
        uri = parse_uri(config.get('database', 'uri'))
        if uri.path and uri.path != '/':
            warnings.warn("The path specified in the URI will be overridden")
        query = dict(urllib.parse.parse_qsl(uri.query))
        query = {k.lower(): v for k, v in query.items()}
        attributes = {}
        attributes['DRIVER'] = '{%s}' % query.pop('driver', _default_driver)
        server = query.pop('server', None)
        if not server:
            server = uri.hostname or 'localhost'
            if uri.port:
                server += ',%s' % uri.port
        attributes['SERVER'] = server
        if uri.username:
            attributes['UID'] = urllib.parse.unquote(uri.username)
            attributes['PWD'] = urllib.parse.unquote(uri.password or '')
        else:
            attributes['Trusted_Connection'] = 'yes'
        attributes['DATABASE'] = name
        # Tryton reads a cursor while executing other queries
        attributes['MARS_Connection'] = 'yes'
        attributes['APP'] = os.environ.get('TRYTOND_APPNAME', 'trytond')
        for key, value in query.items():
            attributes[key] = value

        def quote(value):
            if any(c in value for c in ';{}') and not value.startswith('{'):
                return '{%s}' % value.replace('}', '}}')
            return value
        return ';'.join(
            '%s=%s' % (k, quote(str(v))) for k, v in attributes.items())

    def _connect(self):
        connection = pyodbc.connect(
            self._connection_string(self.name), autocommit=False,
            timeout=config.getint('database', 'mssql_login_timeout',
                default=15))
        connection.add_output_converter(_SQL_SS_TIME2, _convert_time)
        connection.add_output_converter(
            _SQL_SS_TIMESTAMPOFFSET, _convert_datetimeoffset)
        connection.add_output_converter(pyodbc.SQL_DECIMAL, _convert_decimal)
        connection.add_output_converter(pyodbc.SQL_NUMERIC, _convert_decimal)
        cursor = connection.cursor()
        # Behave like the SQL standard
        cursor.execute(
            'SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; '
            'SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; '
            'SET CONCAT_NULL_YIELDS_NULL ON; SET ARITHABORT ON; '
            'SET NUMERIC_ROUNDABORT OFF; SET DATEFORMAT ymd; '
            'SET XACT_ABORT OFF; SET LOCK_TIMEOUT %d'
            % (config.getint('database', 'mssql_lock_timeout',
                    default=60000)))
        connection.commit()
        return Connection(connection, self.name)

    def connect(self):
        return self

    def get_connection(self, autocommit=False, readonly=False, ddl=False):
        if not self._functions_checked and self.name != _default_name:
            self._check_functions()
        retry = max(config.getint('database', 'retry'), _maxconn)
        for count in range(retry, -1, -1):
            conn = None
            with self._pool_lock:
                if self._pool:
                    conn = self._pool.pop()
                elif self._used >= _maxconn:
                    pass
                else:
                    self._used += 1
                    conn = False
            if conn is None:
                if count:
                    logger.info('waiting a connection')
                    time.sleep(1)
                    continue
                raise DatabaseOperationalError(
                    "No connection available for %s" % self.name)
            if conn is False:
                try:
                    conn = self._connect()
                except pyodbc.Error as exception:
                    with self._pool_lock:
                        self._used -= 1
                    logger.error(
                        'connection to "%s" failed', self.name, exc_info=True)
                    raise _translate(exception) from exception
                else:
                    logger.info('connection to "%s" succeeded', self.name)
            else:
                with self._pool_lock:
                    self._used += 1
            try:
                toggled = conn.autocommit != autocommit
                if toggled:
                    conn.autocommit = autocommit
                if not autocommit:
                    isolation = 'READ COMMITTED' if ddl else 'SNAPSHOT'
                    if conn.isolation != isolation or toggled:
                        # The level must be set and committed before the
                        # next transaction starts otherwise SQL Server may
                        # start it with the previous level
                        conn._connection.cursor().execute(
                            'SET TRANSACTION ISOLATION LEVEL %s' % isolation)
                        conn._connection.commit()
                        conn.isolation = isolation
                    else:
                        # Detect disconnection
                        conn._connection.cursor().execute('SELECT 1')
                        conn._connection.commit()
                else:
                    conn._connection.cursor().execute('SELECT 1')
            except pyodbc.Error:
                self.put_connection(conn, close=True)
                continue
            break
        return conn

    def put_connection(self, connection, close=False):
        if not close and not connection.autocommit:
            try:
                connection._connection.rollback()
            except pyodbc.Error:
                close = True
        with self._pool_lock:
            self._used -= 1
            if close or self._pool is None:
                connection.close()
            else:
                self._pool.append(connection)

    def close(self):
        with self._lock:
            logger.info('disconnection from "%s"', self.name)
            with self._pool_lock:
                while self._pool:
                    self._pool.pop().close()
            self._databases[os.getpid()].pop(self.name, None)

    @property
    def _used_connections(self):
        return self._used

    @classmethod
    def create(cls, connection, database_name):
        autocommit = connection.autocommit
        connection.autocommit = True
        try:
            cursor = connection.cursor()
            name = _escape_identifier(database_name)
            cursor.execute('CREATE DATABASE %s COLLATE %s' % (
                    name, _collation))
            cls._configure(cursor, database_name)
        finally:
            connection.autocommit = autocommit
        cls._list_cache.clear()

    @classmethod
    def _configure(cls, cursor, database_name):
        name = _escape_identifier(database_name)
        if _compatibility_level:
            cursor.execute('ALTER DATABASE %s SET COMPATIBILITY_LEVEL = %d'
                % (name, _compatibility_level))
        cursor.execute(
            'ALTER DATABASE %s SET ALLOW_SNAPSHOT_ISOLATION ON' % name)
        cursor.execute(
            'SELECT is_read_committed_snapshot_on FROM sys.databases '
            'WHERE name = ?', (database_name,))
        rcsi, = cursor.fetchone()
        if not rcsi:
            try:
                cursor.execute('ALTER DATABASE %s SET READ_COMMITTED_SNAPSHOT '
                    'ON WITH ROLLBACK AFTER 5' % name)
            except pyodbc.Error:
                logger.warning(
                    'Unable to set READ_COMMITTED_SNAPSHOT on "%s"',
                    database_name, exc_info=True)

    @classmethod
    def drop(cls, connection, database_name):
        with cls._lock:
            database = cls._databases[os.getpid()].get(database_name)
            if database:
                database.close()
        autocommit = connection.autocommit
        connection.autocommit = True
        try:
            cursor = connection.cursor()
            name = _escape_identifier(database_name)
            cursor.execute(
                'ALTER DATABASE %s SET SINGLE_USER WITH ROLLBACK IMMEDIATE'
                % name)
            cursor.execute('DROP DATABASE %s' % name)
        finally:
            connection.autocommit = autocommit
        cls._list_cache.clear()

    def get_version(self, connection):
        cursor = connection.cursor()
        cursor.execute("SELECT CAST(SERVERPROPERTY('ProductVersion') "
            "AS NVARCHAR(128))")
        version, = cursor.fetchone()
        return tuple(int(x) for x in version.split('.')[:3])

    _test_tables = ('ir_model', 'ir_model_field', 'ir_ui_view', 'ir_ui_menu',
        'res_user', 'res_group', 'ir_module', 'ir_module_dependency',
        'ir_translation', 'ir_lang', 'ir_configuration')

    def list(self, hostname=None):
        now = time.time()
        timeout = config.getint('session', 'timeout')
        res = self.__class__._list_cache.get(hostname)
        timestamp = self.__class__._list_cache_timestamp.get(hostname, now)
        if res and abs(timestamp - now) < timeout:
            return res

        connection = self.get_connection(autocommit=True)
        try:
            cursor = connection.cursor()
            cursor.execute('SELECT name FROM sys.databases '
                "WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') "
                'AND state = 0 AND HAS_DBACCESS(name) = 1 ORDER BY name')
            res = []
            for db_name, in cursor.fetchall():
                try:
                    if self._test(cursor, db_name, hostname=hostname):
                        res.append(db_name)
                except Exception:
                    logger.debug(
                        'Test failed for "%s"', db_name, exc_info=True)
                    continue
        finally:
            self.put_connection(connection, close=True)

        self.__class__._list_cache[hostname] = res
        self.__class__._list_cache_timestamp[hostname] = now
        return res

    def init(self):
        from trytond.modules import get_module_info

        Flavor.set(self.flavor)
        connection = self.get_connection(ddl=True)
        try:
            cursor = connection.cursor()
            self._check_collation(cursor)
            sql_file = os.path.join(os.path.dirname(__file__), 'init.sql')
            with open(sql_file) as fp:
                for statement in fp.read().split(';'):
                    if statement.strip():
                        cursor.execute(statement)
            self._install_functions(cursor)

            ir_module = Table('ir_module')
            ir_module_dependency = Table('ir_module_dependency')
            now = dialect.transaction_timestamp()
            for module in ['ir', 'res']:
                info = get_module_info(module)
                module_id = self.nextid(connection, 'ir_module')
                cursor.execute(*ir_module.insert(
                        [ir_module.id, ir_module.create_uid,
                            ir_module.create_date, ir_module.name,
                            ir_module.state],
                        [[module_id, 0, now, module, 'to activate']]))
                for dependency in info.get('depends', []):
                    cursor.execute(*ir_module_dependency.insert(
                            [ir_module_dependency.create_uid,
                                ir_module_dependency.create_date,
                                ir_module_dependency.module,
                                ir_module_dependency.name],
                            [[0, now, module_id, dependency]]))
            connection.commit()
        finally:
            self.put_connection(connection)

    def _check_functions(self):
        "Install the helper functions on Tryton database"
        with self._lock:
            if self._functions_checked:
                return
            try:
                conn = self._connect()
            except pyodbc.Error:
                # The error will be raised by get_connection
                return
            try:
                conn.autocommit = True
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT COUNT(*) FROM sys.tables WHERE name = 'ir_module'")
                if cursor.fetchone()[0]:
                    self._install_functions(cursor)
            finally:
                conn.close()
            self._functions_checked = True

    @classmethod
    def _install_functions(cls, cursor):
        "Create or update the helper functions"
        sql_file = os.path.join(os.path.dirname(__file__), 'functions.sql')
        with open(sql_file) as fp:
            content = fp.read()
        for statement in content.split('\nGO\n'):
            if not statement.strip():
                continue
            name = statement.split('dbo.', 1)[1].split('(', 1)[0]
            cursor.execute(
                "SELECT definition FROM sys.sql_modules "
                "WHERE object_id = OBJECT_ID(?)", ('dbo.' + name,))
            row = cursor.fetchone()
            if row and row[0].strip() == statement.strip():
                continue
            if row:
                cursor.execute('DROP FUNCTION dbo.%s' % name)
            cursor.execute(statement.strip())

    def _check_collation(self, cursor):
        cursor.execute(
            "SELECT CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') "
            "AS NVARCHAR(128))")
        collation, = cursor.fetchone()
        if '_CS_' not in collation.upper() and '_BIN' not in collation.upper():
            raise Exception(
                'The database "%s" uses the case insensitive collation "%s". '
                'Tryton needs a case sensitive collation, run: '
                'ALTER DATABASE [%s] COLLATE %s' % (
                    self.name, collation, self.name, _collation))
        cursor.execute(
            'SELECT snapshot_isolation_state FROM sys.databases '
            'WHERE name = DB_NAME()')
        state, = cursor.fetchone()
        if state != 1:
            raise Exception(
                'The database "%s" does not allow snapshot isolation, run: '
                'ALTER DATABASE [%s] SET ALLOW_SNAPSHOT_ISOLATION ON' % (
                    self.name, self.name))

    def test(self, hostname=None):
        try:
            connection = self.get_connection(autocommit=True)
        except Exception:
            logger.debug('Test failed for "%s"', self.name, exc_info=True)
            return False
        try:
            return self._test(
                connection.cursor(), self.name, hostname=hostname)
        finally:
            self.put_connection(connection, close=True)

    @classmethod
    def _test(cls, cursor, database_name, hostname=None):
        name = _escape_identifier(database_name)
        cursor.execute(
            'SELECT COUNT(*) FROM %s.INFORMATION_SCHEMA.TABLES '
            "WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN (%s)" % (
                name, ', '.join('?' * len(cls._test_tables))),
            cls._test_tables)
        count, = cursor.fetchone()
        if count != len(cls._test_tables):
            return False
        if hostname:
            try:
                cursor.execute(
                    'SELECT hostname FROM %s.dbo.ir_configuration' % name)
                hostnames = {h for h, in cursor.fetchall() if h}
                if hostnames and hostname not in hostnames:
                    return False
            except pyodbc.Error:
                pass
        return True

    @staticmethod
    def _sequence_name(table):
        if table.endswith('__history'):
            return table + '___id_seq'
        return table + '_id_seq'

    def nextid(self, connection, table, count=1):
        cursor = connection.cursor()
        sequence = self._sequence_name(table)
        if count == 1:
            cursor.execute(
                'SELECT NEXT VALUE FOR %s' % _escape_identifier(sequence))
            return cursor.fetchone()[0]
        cursor.execute(
            'DECLARE @first SQL_VARIANT; '
            'EXEC sys.sp_sequence_get_range @sequence_name = ?, '
            '@range_size = ?, @range_first_value = @first OUTPUT; '
            'SELECT CAST(@first AS BIGINT)', (sequence, count))
        first, = cursor.fetchone()
        return list(range(first, first + count))

    def setnextid(self, connection, table, value):
        if self.currid(connection, table) >= value:
            return
        cursor = connection.cursor()
        cursor.execute('ALTER SEQUENCE %s RESTART WITH %d' % (
                _escape_identifier(self._sequence_name(table)), int(value)))

    def currid(self, connection, table):
        cursor = connection.cursor()
        cursor.execute(
            'SELECT CAST(current_value AS BIGINT) FROM sys.sequences '
            'WHERE name = ?', (self._sequence_name(table),))
        return cursor.fetchone()[0]

    @classmethod
    def lock(cls, connection, table):
        cursor = connection.cursor()
        cursor.execute(
            'SELECT COUNT(*) FROM %s WITH (TABLOCKX, HOLDLOCK, NOWAIT) '
            'WHERE 1 = 0' % _escape_identifier(table))

    @classmethod
    def lock_records(cls, connection, table, ids):
        from trytond.tools import grouped_slice, reduce_ids
        Flavor.set(cls.flavor)
        sql_table = Table(table)
        cursor = connection.cursor()
        for sub_ids in grouped_slice(ids):
            where = reduce_ids(sql_table.id, sub_ids)
            query, params = tuple(sql_table.select(
                    sql_table.id, where=where))
            # Add the locking hint on the table
            query = query.replace(
                'FROM "%s" AS "a"' % table,
                'FROM "%s" AS "a" WITH (UPDLOCK, ROWLOCK, NOWAIT)' % table, 1)
            cursor.execute(query, params)
            cursor.fetchall()

    def lock_id(self, id, timeout=None):
        raise NotImplementedError

    def has_constraint(self, constraint):
        from trytond.model.modelsql import Check, Unique
        if isinstance(constraint, Check):
            return True
        elif isinstance(constraint, Unique):
            # Unique constraint can only be created on indexable columns
            key = (constraint.table._name,
                tuple(c.name for c in constraint.columns))
            result = self._unique_indexable.get(key)
            if result is None:
                from trytond.transaction import Transaction
                transaction = Transaction()
                # Use the connection of the transaction as it may hold
                # schema locks on the table
                if transaction.database is self and transaction.connection:
                    connection = transaction.connection
                    own = False
                else:
                    connection = self.get_connection(autocommit=True)
                    own = True
                try:
                    cursor = connection.cursor()
                    cursor.execute(
                        'SELECT COUNT(*) FROM sys.columns '
                        'WHERE object_id = OBJECT_ID(?) AND name IN (%s) '
                        'AND max_length != -1' % ', '.join(
                            '?' * len(key[1])),
                        (_escape_identifier(key[0]),) + key[1])
                    count, = cursor.fetchone()
                finally:
                    if own:
                        self.put_connection(connection)
                result = count == len(key[1])
                if result:
                    self._unique_indexable[key] = result
            return result
        return False

    def has_multirow_insert(self):
        return True

    def has_window_functions(self):
        return True

    def json_get(self, column, key=None):
        if key is None:
            return column
        # Values are stored by Tryton as compact JSON so the key is searched
        # with the same encoding
        return dialect.JSONGet(column, json.dumps(key))

    def json_get_number(self, column, key):
        "Return the number of the key or NULL"
        return Cast(dialect.TryCast(self.json_get(column, key), 'FLOAT'),
            'FLOAT')

    def sql_type(self, type_):
        if type_ in self.TYPES_MAPPING:
            return self.TYPES_MAPPING[type_]
        if type_.startswith('VARCHAR'):
            size = int(type_[len('VARCHAR('):-1])
            if size > 4000:
                return SQLType('NVARCHAR', 'NVARCHAR(MAX)')
            return SQLType('NVARCHAR', 'NVARCHAR(%d)' % size)
        return SQLType(type_, type_)

    def sql_format(self, type_, value):
        if value is None:
            return value
        if type_ == 'BLOB':
            if isinstance(value, (bytearray, memoryview)):
                return bytes(value)
        elif type_ == 'INTERVAL':
            if isinstance(value, datetime.timedelta):
                return value.total_seconds()
        elif type_ in ('INTEGER', 'BIGINT', 'SMALLINT'):
            if isinstance(value, (bool, float)):
                return int(value)
        return value

