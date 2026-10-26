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
        if (Rpc.behindNlbi) {
            /* The N-Line BI sign-in is the only one: sign in again with it */
            main.appendChild(el('div.login', el('div.panel',
                el('h1', 'Tryton ERP'),
                el('p', 'Signing in with your N-Line BI account…'))));
            Rpc.nlbiSignIn().then(function () {
                renderUser();
                Screens.afterLogin();
            }, function () {
                global.location.href = '/server/login?next=' +
                    encodeURIComponent(global.location.pathname);
            });
            return;
        }
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
                    try {
                        global.localStorage.setItem('nline.desk.database',
                            database.value);
                    } catch (e) {
                        /* Remembering the database is a convenience */
                    }
                    renderUser();
                    Screens.afterLogin();
                }, function (error) {
                    button.disabled = false;
                    UI.showError(error.type === 'server' ?
                        'Wrong user or password.' : error);
                });
        }},
            el('h1', 'Sign in to Tryton ERP'), el('p.muted', 'For N-Line Valves. The same sign-in opens the Tryton client.'),
            el('div', el('label.field', 'Database'), database),
            el('div', el('label.field', 'User'), login),
            el('div', el('label.field', 'Password'), password),
            button);
        main.appendChild(el('div.login', form));
        Rpc.databases().then(function (names) {
            var last = null;
            try {
                last = global.localStorage.getItem('nline.desk.database');
            } catch (e) {
                /* No storage: no remembered database */
            }
            (names || []).forEach(function (name) {
                database.appendChild(el('option', {value: name,
                    selected: name === last || null}, name));
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
                tile(Rpc.base + '/#' + encodeURIComponent(Rpc.session().database),
                    '\u{1F5C2}', 'Tryton ERP')))));
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

    var nlbiHeader = false;

    /* Through N-Line BI: its drop-ins, as in every N-Line BI app (Apps after
     * the name, then Claude, light / dark and the name menu) */
    function renderNlbiHeader() {
        if (nlbiHeader) {
            return;
        }
        nlbiHeader = true;
        var apps = UI.clear(document.getElementById('nl-apps'));
        var right = UI.clear(document.getElementById('nl-right'));
        right.classList.add('nl-right');
        apps.appendChild(el('span#apps-slot', {dataset: {btnClass:
            'nl-btn'}}));
        right.appendChild(el('span#claude-slot', {dataset: {app:
            'Tryton ERP', btnClass: 'nl-btn'}}));
        var theme = el('button.nl-btn.nl-theme', {type: 'button'});
        var paint = function () {
            var dark = NLineHeader.isDark();
            theme.textContent = dark ? '☀' : '☾';
            theme.title = dark ? 'Switch to light' : 'Switch to dark';
            theme.setAttribute('aria-label', theme.title);
        };
        theme.addEventListener('click', function () {
            NLineHeader.setTheme(NLineHeader.isDark() ? 'light' : 'dark');
            paint();
        });
        paint();
        right.appendChild(theme);
        right.appendChild(el('span#who-slot'));
        ['apps_menu.js', 'claude_panel.js', 'name_menu.js'].forEach(
            function (name) {
                document.head.appendChild(el('script', {type: 'module',
                    src: '/server/web/' + name}));
            });
    }

    function renderUser() {
        if (Rpc.behindNlbi) {
            renderNlbiHeader();
            return;
        }
        var apps = UI.clear(document.getElementById('nl-apps'));
        var right = UI.clear(document.getElementById('nl-right'));
        var session = Rpc.session();
        if (session && global.NLineHeader) {
            NLineHeader.mount({
                apps: apps,
                right: right,
                user: {name: session.name, login: session.login,
                    database: session.database},
                here: 'desk',
                onPreferences: function () {
                    /* The preferences are those of the Tryton client */
                    global.open(Rpc.base + '/#' + encodeURIComponent(session.database),
                        '_blank');
                },
                onSignOut: function () {
                    Rpc.logout().then(function () {
                        global.location.hash = '#/login';
                        renderUser();
                    });
                }
            });
        }
    }
    Screens.renderUser = renderUser;

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
            /* Back to the asked screen after signing in */
            pending = hash;
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
                document.title = 'Desk - Tryton ERP';
                return;
            }
        }
        main.appendChild(el('p', 'Page not found. ', el('a', {href: '#/'},
            'Home')));
    }

    var pending = null;
    Screens.afterLogin = function () {
        var target = pending || '#/';
        pending = null;
        global.location.hash = target;
    };

    global.addEventListener('hashchange', route);
    Rpc.restore();
    /* Signed in to the Tryton client already: no second sign-in */
    Rpc.adopt().then(function () {
        renderUser();
        route();
    }, function () {
        renderUser();
        route();
    });
}(window));
