# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Sign-in through the N-Line BI web server

The N-Line BI web server serves the ERP at /ERP/ and signs its people in once
for every app. When a page asks Tryton to sign in through it, the BI server
replaces the parameters with a token it signs with the secret shared with this
server (trytond.conf):

    [session]
    authentications = nlbi,password

    [nlbi]
    secret = <the same secret as ERP_SECRET on the BI server>

The token is "<base64 json>.<hmac sha256 hex>", the json holding login, name,
database, time, role and options (po_limit, wo_create, wo_modify). It is valid for max_age seconds (120). A person signed
in to N-Line BI with access to the ERP gets a Tryton user of the same login on
the first sign-in, and at each sign-in the N-Line role (module nline_role) of
their access on the BI Admin page.

Without a token, the next method (password) is used, so the ERP still opens
directly on its own server with a Tryton password.
"""
import base64
import hashlib
import hmac
import json
import logging
import time

from trytond.config import config
from trytond.pool import Pool, PoolMeta
from trytond.transaction import Transaction

logger = logging.getLogger(__name__)


def sign(payload, secret):
    "Return the token of the payload (used by the BI server and the tests)"
    data = base64.urlsafe_b64encode(
        json.dumps(payload, sort_keys=True).encode()).decode()
    digest = hmac.new(secret.encode(), data.encode(), hashlib.sha256)
    return '%s.%s' % (data, digest.hexdigest())


def verify(token, secret, max_age=120, now=None):
    "Return the payload of a valid token, else None"
    if not token or not secret or '.' not in token:
        return None
    data, digest = token.rsplit('.', 1)
    expected = hmac.new(
        secret.encode(), data.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, digest):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(data.encode()))
    except ValueError:
        return None
    now = time.time() if now is None else now
    if not isinstance(payload, dict) or abs(
            now - float(payload.get('time') or 0)) > max_age:
        return None
    return payload


class User(metaclass=PoolMeta):
    __name__ = 'res.user'

    @classmethod
    def _login_nlbi(cls, login, parameters):
        token = parameters.get('nlbi_token')
        if not token:
            return None
        secret = config.get('nlbi', 'secret', default='')
        payload = verify(token, secret,
            max_age=config.getint('nlbi', 'max_age', default=120))
        database = Transaction().database.name
        if (not payload or payload.get('login') != login
                or payload.get('database') != database):
            logger.warning("N-Line BI sign-in refused for %s", login)
            return None
        with Transaction().set_context(active_test=False):
            users = cls.search([('login', '=', login)], limit=1)
        if users:
            user, = users
            if not user.active:
                logger.warning("N-Line BI sign-in of inactive user %s", login)
                return None
        else:
            with Transaction().set_user(0):
                values = {
                    'login': login,
                    'name': payload.get('name') or login,
                    }
                values.update(cls._nlbi_company_values())
                user, = cls.create([values])
            logger.info("Tryton user %s created by N-Line BI sign-in", login)
        if 'role' in payload:
            # The role of the BI Admin page; an unknown one gives no groups
            if not cls.set_nline_role(user, payload['role']):
                logger.warning("N-Line BI sign-in of %s: no Tryton role %r",
                    login, payload['role'])
        if isinstance(payload.get('options'), dict):
            # The authority of the BI Admin page (PO limit, work orders)
            cls.set_nline_options(user, payload['options'])
        return user.id

    @classmethod
    def _nlbi_company_values(cls):
        "The company of a new user: N-Line's when the database has only one"
        pool = Pool()
        try:
            Company = pool.get('company.company')
        except KeyError:
            return {}
        companies = Company.search([], limit=2)
        if len(companies) != 1:
            return {}
        company, = companies
        return {
            'companies': [('add', [company.id])],
            'company': company.id,
            }
