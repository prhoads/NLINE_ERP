/* N-Line Desk: login, navigation and home */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    /* Inside a Tryton tab (custom.js): one screen, no header; other
     * screens open in their own Tryton tab */
    var EMBED = /[?&]embed=1(&|$)/.test(global.location.search);
    Screens.embedded = EMBED;
    if (!EMBED && global.top === global) {
        /* No separate desk: the screen opens in its Tryton tab */
        try {
            global.sessionStorage.setItem('nline.open',
                (global.location.hash || '').replace(/^#\/?/, ''));
        } catch (e) {
            /* No storage: Tryton opens Home */
        }
        global.location.replace(Rpc.base + '/');
        return;
    }
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

    /* The Home tab: the workflows, as on the QuickBooks Home Page; only the
     * tiles of the menus the user sees (nline.desk.home) */
    var ICONS = {
        'Purchase Orders': '\u{1F6D2}', 'Receive Items': '\u{1F4E6}',
        'Enter Bills': '\u{1F4C4}', 'Pay Bills': '\u{1F4B5}',
        'Sales Orders': '\u{1F4DD}', 'Ship': '\u{1F69A}',
        'Create Invoices': '\u{1F9FE}', 'Receive Payments': '\u{1F4B3}',
        'Make Deposits': '\u{1F3E6}', 'Bills of Materials': '\u{1F4CB}',
        'Work Orders': '\u{1F527}', 'Productions': '\u{1F3ED}',
        'Inventory Counts': '\u{1F522}', 'Write Checks': '✍',
        'Check Register': '\u{1F4D2}', 'Bank Statements': '\u{1F4C3}',
        'Chart of Accounts': '\u{1F5C2}', 'Journal Entries': '\u{1F4D3}',
        'Balance Sheet': '⚖', 'Income Statement': '\u{1F4C8}',
        'Customer Center': '\u{1F465}', 'Vendor Center': '\u{1F3E2}',
        'Parts': '\u2699', 'Sales Receipts': '\u{1F9FE}',
        'Credit Memos': '\u21A9', 'Statements': '\u{1F4C4}',
        'Income Tracker': '\u{1F4CA}', 'Vendor Credits': '\u21A9',
        'Bill Tracker': '\u{1F4CA}', 'Credit Card Charges': '\u{1F4B3}',
        'Reconcile': '\u2714', 'Report Center': '\u{1F4C8}',
        'Items': '\u{1F4E6}',
        'Order Entry': '\u{1F4DD}',
        'Shipping': '\u{1F69A}',
        'Invoicing': '\u{1F9FE}',
        'Customers': '\u{1F465}',
        'Bills Against Inventory': '\u{1F4C4}',
        'Suppliers': '\u{1F3ED}',
        'Engineering Master': '\u{1F4D0}',
        'Work Order': '\u{1F527}',
        'Material Issues': '\u{1F4E4}',
        'Labor Entry': '\u23F1',
        'Work Order Receipts': '\u{1F4E5}',
        'Shop Resources': '\u{1F3ED}',
        'Employees': '\u{1F477}',
        'Quotes': '\u{1F4AC}',
        'Material Planning': '\u{1F4CB}',
        'Scheduling': '\u{1F4C5}',
        'Terms': '\u{1F4C6}',
        'Lists': '\u{1F4C3}',
        'Set Closing Date': '\u{1F512}'
    };

    function tile(item) {
        return el('a.tile', {href: '#', onclick: function (event) {
            event.preventDefault();
            if (item.route !== null) {
                UI.openScreen(item.route);
            } else {
                UI.openAction(item.action);
            }
        }}, el('span.icon', {'aria-hidden': 'true'},
            ICONS[item.label] || '▢'), item.label);
    }

    Screens.home = function (main) {
        main = UI.form(main, {title: 'Home'}).body;
        var board = el('div.home');
        /* The user's unread Jobshop alerts (nothing when there are none) */
        if (global.JobshopCommon && global.JobshopCommon.alertsPanel) {
            var alerts = el('div');
            main.appendChild(alerts);
            global.JobshopCommon.alertsPanel(alerts, 5);
        }
        main.appendChild(board);
        Rpc.desk('home', []).then(function (sections) {
            sections.forEach(function (section) {
                var flow = el('div.flow' + (section.flow ? '.arrows' : ''));
                section.tiles.forEach(function (item, index) {
                    if (section.flow && index) {
                        flow.appendChild(el('span.arrow', {'aria-hidden':
                            'true'}, '→'));
                    }
                    flow.appendChild(tile(item));
                });
                board.appendChild(el('section.panel' + (section.flow ?
                    '.flow-section' : ''), el('h2', section.title), flow));
            });
            if (!sections.length) {
                board.appendChild(el('p.muted', 'Nothing to show: ask an ' +
                    'administrator for access.'));
            }
        }, UI.showError);
    };

    function renderNav(route) {
        var nav = UI.clear(document.getElementById('nav'));
        if (EMBED || !Rpc.session()) {
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
        if (EMBED) {
            return;
        }
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
        [/^#\/vendors$/, 'vendors'],
        [/^#\/sales-receipts\/new$/, 'salesReceipt'],
        [/^#\/credits\/new$/, 'creditMemo'],
        [/^#\/vendor-credits\/new$/, 'vendorCredit'],
        [/^#\/statements$/, 'statements'],
        [/^#\/cards\/new$/, 'creditCard'],
        [/^#\/journal\/new$/, 'journalEntry'],
        [/^#\/accounts$/, 'accounts'],
        [/^#\/accounts\/(\d+)$/, 'accountRegister'],
        [/^#\/reconcile$/, 'reconcile'],
        [/^#\/income-tracker$/, 'incomeTracker'],
        [/^#\/bill-tracker$/, 'billTracker'],
        [/^#\/items$/, 'items'],
        [/^#\/reports$/, 'reportCenter'],
        [/^#\/reports\/(\w+)$/, 'report'],
        [/^#\/customer-window$/, 'customerWindow'],
        [/^#\/supplier-window$/, 'supplierWindow'],
        [/^#\/parts$/, 'parts'],
        [/^#\/parts\/(\d+)$/, 'parts'],
        [/^#\/orders\/new$/, 'salesOrder'],
        [/^#\/orders\/(\d+)$/, 'salesOrder'],
        [/^#\/shipping$/, 'shipping'],
        [/^#\/invoicing$/, 'invoicing'],
        [/^#\/purchase-orders\/new$/, 'purchaseOrder'],
        [/^#\/purchase-orders\/(\d+)$/, 'purchaseOrder'],
        [/^#\/receiving$/, 'receiving'],
        [/^#\/bill-receipts$/, 'billReceipts'],
        [/^#\/work-orders\/new$/, 'workOrderWindow'],
        [/^#\/work-orders\/(\d+)$/, 'workOrderWindow'],
        [/^#\/labor$/, 'laborEntry'],
        [/^#\/issues$/, 'materialIssues'],
        [/^#\/wo-receipts$/, 'woReceipts'],
        [/^#\/masters$/, 'engineeringMaster'],
        [/^#\/masters\/(\d+)$/, 'engineeringMaster'],
        [/^#\/resources$/, 'resources'],
        [/^#\/resources\/(\d+)$/, 'resources'],
        [/^#\/employees$/, 'employees'],
        [/^#\/planning$/, 'materialPlanning'],
        [/^#\/scheduling$/, 'scheduling'],
        [/^#\/quotes$/, 'quotes'],
        [/^#\/terms$/, 'terms'],
        [/^#\/lists$/, 'lists'],
        [/^#\/lists\/(\w+)$/, 'list'],
        [/^#\/import$/, 'importData'],
        [/^#\/closing$/, 'closing'],
        [/^#\/settings$/, 'settings'],
        [/^#\/company-info$/, 'companyInfo']
    ];

    /* The colour of each area (as its menu icons, nline_desk/tools/
     * gen_icons.py) and the screens of each */
    var AREA_COLORS = {
        home: '#e8650a', inventory: '#d98a06', engineering: '#1d5fd1',
        estimating: '#6d3fd0', sales: '#14924a', purchasing: '#0b85a4',
        planning: '#4248c9', shopfloor: '#c62828', accounting: '#0e7d68',
        common: '#5c6878', executive: '#b88600', admin: '#39475c',
        customers: '#18915a', vendors: '#cf6b16', banking: '#244f9e',
        company: '#2f746f'
    };
    var AREA_SCREENS = {
        inventory: 'parts units unit-conversions locations adjustments items',
        engineering: 'masters operation-templates',
        estimating: 'quotes quote-masters',
        sales: 'customer-window orders shipping invoicing service-charges ' +
            'sales-tax-groups sales-reps territories sic-codes carriers ' +
            'discount-classes',
        purchasing: 'supplier-window rfqs purchase-orders receiving ' +
            'services purchase-tax-groups',
        planning: 'planning scheduling',
        shopfloor: 'work-orders workorders issues wo-receipts resources ' +
            'shop-groups shop-views labor labor-collection employees',
        accounting: 'accounts account-sets accounting-calendar ' +
            'account-interface',
        common: 'fob-points ship-vias states postal-codes terms ' +
            'product-codes commodity-codes reason-codes alert-messages ' +
            'currency-codes control-panel',
        executive: 'exec',
        admin: 'users authorities system-settings',
        customers: 'customers income-tracker invoices sales-receipts ' +
            'credits payments statements',
        vendors: 'vendors bill-tracker bill-receipts bills vendor-credits',
        banking: 'checks deposits cards register reconcile',
        company: 'reports company-info settings lists list import closing ' +
            'journal'
    };
    function areaOf(hash) {
        var parts = hash.replace(/^#\/?/, '').replace(/\?.*$/, '')
            .split('/');
        if (parts[0] === 'js-reports') {
            /* A group's reports: that group's colour */
            return {admin: 'accounting'}[parts[1]] || parts[1] || 'admin';
        }
        for (var area in AREA_SCREENS) {
            if (AREA_SCREENS[area].split(' ').indexOf(parts[0]) >= 0) {
                return area;
            }
        }
        return 'home';
    }
    function showArea(hash) {
        var color = AREA_COLORS[areaOf(hash)] || AREA_COLORS.home;
        document.documentElement.style.setProperty('--area', color);
    }

    /* The routes of the Jobshop screens (js/jobshop/*.js push them on
     * window.NLINE_ROUTES) first: they may replace a screen above */
    function allRoutes() {
        return (global.NLINE_ROUTES || []).concat(ROUTES);
    }

    /* The Tryton tab of a screen: a work order card stays in the work
     * orders tab */
    function tabOf(hash) {
        var routes = allRoutes();
        for (var i = 0; i < routes.length; i++) {
            if (hash.replace(/\?.*$/, '').match(routes[i][0])) {
                return routes[i][1].replace(/^workorder$/, 'workorders');
            }
        }
        return null;
    }

    function toTryton(message) {
        global.parent.postMessage(message, global.location.origin);
    }

    var shownHash = null;
    var frameTab = null;

    function route() {
        var hash = global.location.hash || '#/';
        if (EMBED) {
            if (!Rpc.session()) {
                UI.clear(document.getElementById('main')).appendChild(
                    el('p', 'Sign in to Tryton ERP first, then open this ' +
                        'screen again from the menu.'));
                return;
            }
            var tab = tabOf(hash);
            if (frameTab === null) {
                frameTab = tab;
            } else if (tab !== frameTab) {
                /* Save & Close: the screen is done, its tab closes */
                global.history.replaceState(null, '', shownHash);
                toTryton({nline: 'close'});
                return;
            }
            shownHash = hash;
        }
        if (!Rpc.session() && hash !== '#/login') {
            /* Back to the asked screen after signing in */
            pending = hash;
            global.location.hash = '#/login';
            return;
        }
        var main = UI.clear(document.getElementById('main'));
        renderNav(hash);
        showArea(hash);
        var routes = allRoutes();
        for (var i = 0; i < routes.length; i++) {
            /* A screen's ?query (e.g. a new document's Clear) does not
             * change the screen */
            var match = hash.match(routes[i][0]) ||
                hash.replace(/\?.*$/, '').match(routes[i][0]);
            if (match) {
                var screen = Screens[routes[i][1]];
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

    /* The mouse wheel scrolls the scroll bars in series: the innermost box
     * that can still move that way, then the one around it, then the page
     * (the browser keeps one wheel motion on the box it started in). Ctrl
     * is the cards' zoom; Shift scrolls sideways. */
    function canScroll(node, dx, dy, isPage) {
        var style = global.getComputedStyle(node);
        /* (the page scrolls whatever its overflow says) */
        if (isPage) {
            style = {overflowX: 'auto', overflowY: 'auto'};
        }
        var y = /(auto|scroll)/.test(style.overflowY) &&
            node.scrollHeight > node.clientHeight + 1 && (dy > 0 ?
                node.scrollTop + node.clientHeight < node.scrollHeight - 1 :
                dy < 0 && node.scrollTop > 0);
        var x = /(auto|scroll)/.test(style.overflowX) &&
            node.scrollWidth > node.clientWidth + 1 && (dx > 0 ?
                node.scrollLeft + node.clientWidth < node.scrollWidth - 1 :
                dx < 0 && node.scrollLeft > 0);
        return y || x;
    }
    document.addEventListener('wheel', function (event) {
        if (event.ctrlKey || event.defaultPrevented) {
            return;
        }
        var unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ?
            global.innerHeight : 1;
        var dx = event.deltaX * unit, dy = event.deltaY * unit;
        if (event.shiftKey && !dx) {
            dx = dy;
            dy = 0;
        }
        var page = document.scrollingElement || document.documentElement;
        for (var node = event.target; node && node.nodeType === 1 &&
                node !== page && node !== document.body;
                node = node.parentElement) {
            if (canScroll(node, dx, dy)) {
                event.preventDefault();
                node.scrollTop += dy;
                node.scrollLeft += dx;
                return;
            }
        }
        if (canScroll(page, dx, dy, true)) {
            event.preventDefault();
            page.scrollTop += dy;
            page.scrollLeft += dx;
        }
    }, {passive: false});
    if (EMBED) {
        /* A link to another screen opens it in a new Tryton tab */
        document.addEventListener('click', function (event) {
            var link = event.target.closest && event.target.closest('a[href]');
            if (!link || event.defaultPrevented) {
                return;
            }
            var href = link.getAttribute('href');
            if (href.indexOf('#/') === 0 && tabOf(href) !== frameTab) {
                event.preventDefault();
                toTryton({nline: 'open', route: href.slice(2)});
            }
        });
    }
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
