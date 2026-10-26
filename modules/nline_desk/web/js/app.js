/* N-Line Desk: login, navigation and home */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var NAV = [
        ['#/', 'Home'],
        ['#/workorders', 'Work Orders'],
        ['#/bills/new', 'Enter Bills'],
        ['#/bills/pay', 'Pay Bills'],
        ['#/checks/new', 'Write Checks'],
        ['#/invoices/new', 'Create Invoices'],
        ['#/payments/receive', 'Receive Payments'],
        ['#/deposits/new', 'Make Deposits'],
        ['#/register', 'Check Register'],
        ['#/customers', 'Customers'],
        ['#/vendors', 'Vendors']
    ];

    Screens.login = function (main) {
        var database = el('select', {'aria-label': 'Database'});
        var login = el('input', {type: 'text', value: 'admin',
            autocomplete: 'username', 'aria-label': 'User'});
        var password = el('input', {type: 'password',
            autocomplete: 'current-password', 'aria-label': 'Password'});
        var button = el('button.primary', {type: 'submit'}, 'Sign in');
        var form = el('form.panel', {onsubmit: function (event) {
            event.preventDefault();
            button.disabled = true;
            Rpc.login(database.value, login.value, password.value).then(
                function () {
                    global.location.hash = '#/';
                    renderUser();
                }, function (error) {
                    button.disabled = false;
                    UI.showError(error.type === 'server' ?
                        'Wrong user or password.' : error);
                });
        }},
            el('h1', 'Sign in to N-Line ERP'),
            el('div', el('label.field', 'Database'), database),
            el('div', el('label.field', 'User'), login),
            el('div', el('label.field', 'Password'), password),
            button);
        main.appendChild(el('div.login', form));
        Rpc.databases().then(function (names) {
            (names || []).forEach(function (name) {
                database.appendChild(el('option', {value: name}, name));
            });
            if (!names || !names.length) {
                database.appendChild(el('option', {value: ''},
                    '(no database)'));
            }
        }, function () {
            database.appendChild(el('option', {value: 'nline'}, 'nline'));
        });
        password.focus();
    };

    function tile(href, icon, label) {
        return el('a', {href: href}, el('span.icon', {'aria-hidden': 'true'},
            icon), label);
    }

    function arrow() {
        return el('span.arrow', {'aria-hidden': 'true'}, '→');
    }

    Screens.home = function (main) {
        main.appendChild(el('h1', 'Home'));
        main.appendChild(el('div.home',
            el('div.panel', el('h2', 'Vendors'), el('div.flow',
                tile('#/bills/new', '\u{1F4C4}', 'Enter Bills'), arrow(),
                tile('#/bills/pay', '\u{1F4B5}', 'Pay Bills'),
                tile('#/checks/new', '✍', 'Write Checks'),
                tile('#/vendors', '\u{1F465}', 'Vendor Center'))),
            el('div.panel', el('h2', 'Customers'), el('div.flow',
                tile('#/invoices/new', '\u{1F9FE}', 'Create Invoices'),
                arrow(),
                tile('#/payments/receive', '\u{1F4B3}', 'Receive Payments'),
                arrow(),
                tile('#/deposits/new', '\u{1F3E6}', 'Make Deposits'),
                tile('#/customers', '\u{1F465}', 'Customer Center'))),
            el('div.panel', el('h2', 'Banking'), el('div.flow',
                tile('#/register', '\u{1F4D2}', 'Check Register'),
                tile('#/checks/new', '✍', 'Write Checks'),
                tile('#/deposits/new', '\u{1F3E6}', 'Make Deposits'))),
            el('div.panel', el('h2', 'Manufacturing'), el('div.flow',
                tile('#/workorders', '\u{1F527}', 'Work Orders'),
                tile('/#', '\u{1F5C2}', 'Full ERP client')))));
    };

    function renderNav(route) {
        var nav = UI.clear(document.getElementById('nav'));
        if (!Rpc.session()) {
            return;
        }
        NAV.forEach(function (item) {
            var active = item[0] === '#/' ? route === '#/' :
                route.indexOf(item[0]) === 0;
            nav.appendChild(el('a' + (active ? '.active' : ''),
                {href: item[0]}, item[1]));
        });
    }

    function renderUser() {
        var box = UI.clear(document.getElementById('user'));
        var session = Rpc.session();
        if (session) {
            box.appendChild(document.createTextNode(session.name + ' · ' +
                session.database));
            box.appendChild(el('button', {type: 'button', onclick:
                function () {
                    Rpc.logout().then(function () {
                        global.location.hash = '#/login';
                        renderUser();
                    });
                }}, 'Sign out'));
        }
    }

    var ROUTES = [
        [/^#\/login$/, 'login'],
        [/^#\/?$/, 'home'],
        [/^#\/workorders$/, 'workorders'],
        [/^#\/workorders\/(\d+)$/, 'workorder'],
        [/^#\/bills\/new$/, 'enterBill'],
        [/^#\/bills\/pay$/, 'payBills'],
        [/^#\/checks\/new$/, 'writeCheck'],
        [/^#\/invoices\/new$/, 'createInvoice'],
        [/^#\/payments\/receive$/, 'receivePayment'],
        [/^#\/deposits\/new$/, 'makeDeposit'],
        [/^#\/register$/, 'register'],
        [/^#\/customers$/, 'customers'],
        [/^#\/vendors$/, 'vendors']
    ];

    function route() {
        var hash = global.location.hash || '#/';
        if (!Rpc.session() && hash !== '#/login') {
            global.location.hash = '#/login';
            return;
        }
        var main = UI.clear(document.getElementById('main'));
        renderNav(hash);
        for (var i = 0; i < ROUTES.length; i++) {
            var match = hash.match(ROUTES[i][0]);
            if (match) {
                var screen = Screens[ROUTES[i][1]];
                try {
                    screen(main, match.slice(1));
                } catch (error) {
                    UI.showError(error);
                }
                document.title = 'N-Line Desk';
                return;
            }
        }
        main.appendChild(el('p', 'Page not found. ', el('a', {href: '#/'},
            'Home')));
    }

    global.addEventListener('hashchange', route);
    Rpc.restore();
    renderUser();
    route();
}(window));
