/* N-Line Desk: JSON-RPC client of the Tryton server (same origin)
 *
 * Tryton encodes dates, datetimes, decimals and bytes as objects with a
 * __class__ key; they are decoded to Date-like strings, Numbers and base64.
 */
(function (global) {
    'use strict';

    var session = null;

    function storageGet(key) {
        try {
            return JSON.parse(global.sessionStorage.getItem(key));
        } catch (e) {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            if (value === null) {
                global.sessionStorage.removeItem(key);
            } else {
                global.sessionStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) {
            /* Private mode: the session lasts as long as the page */
        }
    }

    function pad(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function revive(key, value) {
        if (value && typeof value === 'object' && value.__class__) {
            switch (value.__class__) {
                case 'date':
                    return value.year + '-' + pad(value.month) + '-' +
                        pad(value.day);
                case 'datetime':
                    return value.year + '-' + pad(value.month) + '-' +
                        pad(value.day) + ' ' + pad(value.hour) + ':' +
                        pad(value.minute);
                case 'Decimal':
                    return parseFloat(value.decimal);
                case 'bytes':
                    return {base64: value.base64};
                case 'timedelta':
                    return value.seconds;
            }
        }
        return value;
    }

    function RpcError(type, message, description, args) {
        this.type = type;
        this.message = message;
        this.description = description || '';
        this.args = args || [];
    }
    RpcError.prototype.toString = function () {
        return this.message + (this.description ? ' ' + this.description : '');
    };

    function call(method, params) {
        var headers = {'Content-Type': 'application/json'};
        var database = session ? session.database : null;
        if (session && session.key) {
            headers.Authorization = 'Session ' + global.btoa(
                session.login + ':' + session.user + ':' + session.key);
        }
        var url = '/' + (database ? encodeURIComponent(database) + '/' : '');
        return global.fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({id: Date.now(), method: method,
                params: params || []})
        }).then(function (response) {
            if (response.status === 401 || response.status === 403) {
                throw new RpcError('session', 'Your session has expired.');
            }
            return response.text();
        }).then(function (text) {
            var data = JSON.parse(text, revive);
            if (data.error) {
                var error = data.error;
                if (Array.isArray(error)) {
                    var type = error[0];
                    var detail = error[1] || [];
                    if (type === 'UserWarning') {
                        throw new RpcError('warning', detail[1], detail[2],
                            detail);
                    }
                    if (type === 'UserError') {
                        throw new RpcError('user', detail[0], detail[1],
                            detail);
                    }
                    throw new RpcError('server', String(type),
                        JSON.stringify(detail).slice(0, 400));
                }
                throw new RpcError('server', String(error));
            }
            return data.result;
        });
    }

    var Rpc = {
        RpcError: RpcError,
        call: call,
        session: function () {
            return session;
        },
        context: function () {
            return session ? session.context : {};
        },
        restore: function () {
            session = storageGet('nline.desk.session');
            return session;
        },
        login: function (database, login, password) {
            session = {database: database};
            return call('common.db.login', [login, {password: password},
                'en']).then(function (result) {
                session = {
                    database: database,
                    login: login,
                    user: result[0],
                    key: result[1],
                    context: {}
                };
                return call('model.res.user.get_preferences', [true, {}]);
            }).then(function (preferences) {
                session.context = preferences;
                session.name = preferences.user_name || login;
                storageSet('nline.desk.session', session);
                return session;
            }, function (error) {
                session = null;
                throw error;
            });
        },
        logout: function () {
            var promise = session ? call('common.db.logout', []) :
                Promise.resolve();
            session = null;
            storageSet('nline.desk.session', null);
            return promise.catch(function () {});
        },
        databases: function () {
            return call('common.db.list', []);
        },
        /* model.<model>.<method>(args..., context) */
        model: function (model, method, args) {
            var params = (args || []).slice();
            params.push(Rpc.context());
            return call('model.' + model + '.' + method, params);
        },
        searchRead: function (model, domain, fields, options) {
            options = options || {};
            return Rpc.model(model, 'search_read', [domain || [],
                options.offset || 0, options.limit || null,
                options.order || null, fields]);
        },
        desk: function (method, args) {
            return Rpc.model('nline.desk', method, args);
        },
        report: function (name, ids, data) {
            var params = [ids, data || {}, Rpc.context()];
            return call('report.' + name + '.execute', params);
        },
        date: function (iso) {
            /* Encode an ISO date for Tryton */
            var parts = iso.split('-');
            return {__class__: 'date', year: +parts[0], month: +parts[1],
                day: +parts[2]};
        }
    };

    global.Rpc = Rpc;
}(window));
