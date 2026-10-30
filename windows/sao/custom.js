/* Tryton ERP for N-Line Valves: the branding of the Tryton web client
 *
 * The client loads custom.js and custom.css from its folder by design, so the
 * client itself is not changed. This adds the title and tagline and the
 * header of the N-Line BI apps (Apps, Claude, light / dark, name menu).
 *
 * Two ways to open the ERP:
 * - through the N-Line BI web server, https://nlvrdp01:8765/ERP/ (the usual
 *   way): its one sign-in, saved browser password, Apps menu, name menu and
 *   Claude panel (/server/web/*.js). The client's addresses get the /ERP
 *   prefix and the Tryton sign-in is the N-Line BI one (the BI server signs
 *   it, module nline_nlbi): no Tryton sign-in dialog.
 * - directly on the ERP server, http://nlvdc01:8000/ (when N-Line BI is
 *   down): Tryton's own sign-in, shared with the N-Line Desk, and the same
 *   header from desk/shared/nline_header.js.
 *
 * The N-Line screens (bills, checks, payments, work order cards...) open in
 * Tryton tabs like any Tryton screen: their menus are ir.action.url to
 * desk/index.html#/<screen>, shown here in a frame without the desk's header.
 * An address typed by hand opens only what the user's menus open
 * (ir.ui.menu.nline_allowed, module nline_role): anything else opens Home.
 */
(function () {
    'use strict';

    var BASE = location.pathname.replace(/\/[^\/]*$/, '');
    var BEHIND_NLBI = BASE !== '';

    document.write(
        '<script src="desk/shared/nline_header.js?v=20261027c"><\/script>' +
        /* The menu pane's icons and the user's Menu Layout (menuprefs.js) */
        '<script src="desk/js/menuicons.js?v=20261105a"><\/script>' +
        '<script src="desk/js/menuprefs.js?v=20261105a"><\/script>');

    Sao.config.title = 'Tryton ERP';
    /* The client paints every icon in its first colour (teal): Tryton's own
     * icons in slate; the N-Line menu icons keep their colours (their shapes
     * carry their own fills, nline_desk/tools/gen_icons.py) */
    Sao.config.icon_colors = ['#3e4a5c', '#3e4a5c', '#e8650a'];

    if (BEHIND_NLBI) {
        /* The client's absolute addresses ('/' + database + '/') under /ERP */
        var ajax = jQuery.ajax;
        jQuery.ajax = function (url, options) {
            if (typeof url === 'object') {
                options = url;
                url = undefined;
            }
            options = options || {};
            var target = url !== undefined ? url : options.url;
            if (typeof target === 'string' && target.charAt(0) === '/' &&
                    target.indexOf(BASE + '/') !== 0) {
                target = BASE + target;
            }
            if (url !== undefined) {
                return ajax.call(this, target, options);
            }
            options.url = target;
            return ajax.call(this, options);
        };

        /* The N-Line BI sign-in in place of the Tryton dialog: the BI server
         * replaces the parameters of the sign-in with its signed token */
        Sao.Session.get_credentials = function () {
            var dfd = jQuery.Deferred();
            ajax.call(jQuery, {
                url: BASE + '/nlbi/config',
                dataType: 'json'
            }).then(function (config) {
                var session = new Sao.Session(config.database, config.login);
                if (location.hash.replace(/^#!?/, '').split('/', 1)[0] !==
                        config.database) {
                    location.hash = '#' + config.database;
                }
                if (session.session) {
                    dfd.resolve(session);
                } else {
                    session.do_login().then(function () {
                        dfd.resolve(session);
                    }, function () {
                        dfd.reject();
                    });
                }
            }, function () {
                location.href = '/server/login?next=' +
                    encodeURIComponent(location.pathname + location.hash);
                dfd.reject();
            });
            return dfd.promise();
        };
    } else {
        /* Opened without a database: sign in silently with the last one
         * used by Tryton or the desk when the browser still has its session */
        try {
            var database = localStorage.getItem('nline.desk.database');
            if ((!location.hash || location.hash === '#') && database &&
                    localStorage.getItem('sao_session_' + database)) {
                location.hash = '#' + database;
            }
        } catch (e) {
            /* No storage: the sign-in dialog asks */
        }
    }

    var userMenu = Sao.user_menu;
    Sao.user_menu = function (preferences) {
        userMenu.apply(this, arguments);
        /* Signed in without a screen to open: the Home tab */
        setTimeout(function () {
            /* A desk address opened directly: its screen in a tab */
            var asked = null;
            try {
                asked = sessionStorage.getItem('nline.open');
                sessionStorage.removeItem('nline.open');
            } catch (e) {
                /* No storage: nothing asked */
            }
            if (asked) {
                openScreen(asked, NAMES[screenOf(asked)] || null);
                return;
            }
            var hash = location.hash.replace(/^#!?/, '');
            if (!Sao.Tab.tabs.length && hash.indexOf('/') < 0) {
                openScreen('', 'Home');
            }
        }, 300);
        menuPrefsText = preferences && preferences.nline_menu_prefs || null;
        loadMenus();
        var session = Sao.Session.current_session;
        if (BEHIND_NLBI || !window.NLineHeader || !session) {
            return;
        }
        NLineHeader.mount({
            apps: document.getElementById('nl-apps'),
            right: document.getElementById('nl-right'),
            user: {
                /* "Administrator [USD]": the name without the currency */
                name: (preferences.status_bar || session.login).replace(
                    /\s*\[[^\]]*\]\s*$/, ''),
                login: session.login,
                database: session.database
            },
            here: 'erp',
            onPreferences: function () {
                Sao.preferences();
            },
            onSignOut: function () {
                Sao.logout();
            }
        });
    };

    /* ---- The N-Line screens in Tryton tabs ---------------------------- */
    var DESK = 'desk/index.html#/';
    var NAMES = {
        'workorders': 'Work Orders (cards)',
        'bills/new': 'Enter Bills',
        'bills/pay': 'Pay Bills',
        'checks/new': 'Write Checks',
        'invoices/new': 'Create Invoices',
        'payments/receive': 'Receive Payments',
        'deposits/new': 'Make Deposits',
        'register': 'Check Register',
        'customers': 'Customer Center',
        'vendors': 'Vendor Center',
        '': 'Home',
        'sales-receipts/new': 'Enter Sales Receipts',
        'credits/new': 'Credit Memos/Refunds',
        'vendor-credits/new': 'Vendor Credits',
        'statements': 'Create Statements',
        'cards/new': 'Credit Card Charges',
        'journal/new': 'General Journal Entries',
        'accounts': 'Chart of Accounts',
        'reconcile': 'Reconcile',
        'income-tracker': 'Income Tracker',
        'bill-tracker': 'Bill Tracker',
        'items': 'Item List',
        'reports': 'Report Center',
        'customer-window': 'Customers',
        'supplier-window': 'Suppliers',
        'parts': 'Parts',
        'orders/new': 'Customer Order Entry',
        'shipping': 'Shipping',
        'invoicing': 'Invoicing',
        'purchase-orders/new': 'Purchase Order',
        'receiving': 'Receiving',
        'bill-receipts': 'Bills Against Inventory',
        'work-orders/new': 'Work Order',
        'labor': 'Labor Entry',
        'issues': 'Material Issues',
        'wo-receipts': 'Work Order Receipts',
        'masters': 'Engineering Master',
        'resources': 'Shop Resources',
        'employees': 'Employees',
        'planning': 'Material Planning',
        'scheduling': 'Scheduling',
        'quotes': 'Quotes',
        'terms': 'Terms',
        'lists': 'Lists',
        'import': 'Import',
        'closing': 'Set Closing Date',
        'settings': 'N-Line Settings',
        'company-info': 'Company Information',
        /* The Jobshop emulation (nline_jobshop) */
        'units': 'Units of Measure',
        'unit-conversions': 'Unit Conversions',
        'locations': 'Locations',
        'adjustments': 'Adjustments',
        'js-reports/inventory': 'Inventory Reports',
        'operation-templates': 'Operation Templates',
        'js-reports/engineering': 'Engineering Reports',
        'quote-masters': 'Quote Masters',
        'js-reports/estimating': 'Estimating Reports',
        'service-charges': 'Service Charges',
        'sales-tax-groups': 'Sales Tax Groups',
        'sales-reps': 'Sales Reps',
        'territories': 'Territories',
        'sic-codes': 'SIC Codes',
        'carriers': 'Carriers',
        'discount-classes': 'Discount Classes',
        'js-reports/sales': 'Sales Reports',
        'rfqs': 'Request For Quotes',
        'services': 'Services',
        'purchase-tax-groups': 'Purchasing Tax Groups',
        'js-reports/purchasing': 'Purchasing Reports',
        'js-reports/planning': 'Planning Reports',
        'shop-groups': 'Shop Groups',
        'shop-views': 'Shop Views',
        'labor-collection': 'Labor Data Collection',
        'js-reports/shopfloor': 'Shopfloor Reports',
        'account-sets': 'Account Sets',
        'accounting-calendar': 'Accounting Calendar',
        'account-interface': 'Account Interface',
        'js-reports/accounting': 'Accounting Reports',
        'fob-points': 'Free On Board Points',
        'ship-vias': 'Shipping Methods',
        'states': 'States/Provinces',
        'postal-codes': 'Postal Codes',
        'product-codes': 'Product Codes',
        'commodity-codes': 'Commodity Codes',
        'reason-codes': 'Reason Codes',
        'alert-messages': 'Alert Messages',
        'control-panel': 'User Control Panel',
        'js-reports/common': 'Common Reports',
        'exec/sales': 'Sales',
        'exec/purchasing': 'Purchasing',
        'exec/production': 'Production',
        'exec/financials': 'Financials',
        'users': 'User Manager',
        'authorities': 'Authority Manager',
        'system-settings': 'System Settings',
        'currency-codes': 'Currency Codes',
        'menu-layout': 'Menu Layout'
    };

    /* Screens with a tab per item: a register per account, a tab per
     * report */
    var PER_ITEM = ['accounts', 'reports', 'orders', 'purchase-orders',
        'work-orders', 'lists'];

    /* The screen of a route: "workorders/12?x" is the work orders screen,
     * "accounts/12" the register of account 12 */
    function screenOf(route) {
        route = route.replace(/\?.*$/, '');
        for (var name in NAMES) {
            if (route === name || (route.indexOf(name + '/') === 0 &&
                    PER_ITEM.indexOf(name.split('/')[0]) < 0)) {
                return name;
            }
        }
        return route;
    }

    /* Allowed: a menu opens the screen, or the screen of its items */
    function screenAllowed(allow, screen) {
        /* Home: everyone */
        return allow.all || screen === '' || allow.urls.some(function (url) {
            if (url.indexOf(DESK) !== 0) {
                return false;
            }
            var menu = screenOf(url.substr(DESK.length));
            var family = menu.split('/')[0];
            return menu === screen || (PER_ITEM.indexOf(family) >= 0 &&
                screen.indexOf(family + '/') === 0);
        });
    }

    var allowedPrm = null, allowedSession = null;
    function allowed() {
        var session = Sao.Session.current_session;
        if (!allowedPrm || allowedSession !== (session && session.session)) {
            allowedSession = session && session.session;
            allowedPrm = Sao.rpc({
                method: 'model.ir.ui.menu.nline_allowed',
                params: [{}]
            }, session, true, false).then(function (result) {
                return result;
            }, function () {
                /* A server without module nline_role: no restriction */
                return jQuery.when({all: true});
            });
        }
        return allowedPrm;
    }

    /* A screen the user may not open: no message, back to Home (the menus
     * already leave it out) */
    function refuse() {
        if (location.hash.indexOf('/nline/') >= 0 ||
                location.hash.indexOf('/model/') >= 0 ||
                location.hash.indexOf('/wizard/') >= 0) {
            history.replaceState(null, '', location.pathname +
                location.search + '#' + location.hash.replace(
                    /^#!?/, '').split('/', 1)[0]);
        }
        openScreen('', 'Home');
    }

    Sao.Tab.NLine = Sao.class_(Sao.Tab, {
        class_: 'tab-nline',
        init: function (attributes) {
            Sao.Tab.NLine._super.init.call(this, attributes);
            this.route = attributes.route;
            this.screen_name = screenOf(this.route);
            this.set_name(attributes.name || NAMES[this.screen_name] ||
                this.route);
            this.create_tabcontent();
            this.main.css('padding-top', 0);
            this.frame = jQuery('<iframe/>', {
                'class': 'nl-screen',
                'title': this.name,
                /* (the page itself is never taken from the cache: its
                 * scripts carry their version) */
                'src': BASE + '/' + DESK.replace('#/', '?embed=1&t=' +
                    Date.now() + '#/') + this.route
            });
            this.content.append(this.frame);
        },
        create_toolbar: function () {
            return jQuery('<span/>');
        },
        compare: function (attributes) {
            return Boolean(attributes) &&
                attributes.nline_screen === this.screen_name;
        },
        get_url: function () {
            return 'nline/' + this.route;
        },
        /* Jobshop asks before closing a window with unsaved changes: the
         * screen registers its checks in window.NLINE_DIRTY */
        _close_allowed: function () {
            var dirty = false;
            try {
                var win = this.frame[0].contentWindow;
                dirty = (win.NLINE_DIRTY || []).some(function (check) {
                    return check();
                });
            } catch (e) {
                dirty = false;
            }
            if (!dirty) {
                return jQuery.when();
            }
            return Sao.common.sur.run(
                'This window has unsaved changes. Close it without saving?');
        },
        reload: function () {
            this.frame[0].contentWindow.location.reload();
        },
        refresh_resources: function () {
        },
        update_resources: function () {
        }
    });

    function openScreen(route, name) {
        var screen = screenOf(route);
        allowed().then(function (allow) {
            if (!screenAllowed(allow, screen)) {
                refuse();
                return;
            }
            for (var i = 0; i < Sao.Tab.tabs.length; i++) {
                var other = Sao.Tab.tabs[i];
                if (other instanceof Sao.Tab.NLine &&
                        other.compare({nline_screen: screen})) {
                    jQuery('#tablist').find('a[href="#' + other.id + '"]')
                        .tab('show');
                    return;
                }
            }
            Sao.Tab.add(new Sao.Tab.NLine({route: route, name: name}));
        });
    }

    var execAction = Sao.Action.exec_action;
    Sao.Action.exec_action = function (action) {
        if (action && action.type === 'ir.action.url' && action.url &&
                action.url.indexOf(DESK) === 0) {
            openScreen(action.url.substr(DESK.length), action.name);
            return;
        }
        return execAction.apply(this, arguments);
    };

    /* An address typed by hand (or a bookmark): only what the menus open */
    var openUrl = Sao.open_url;
    Sao.open_url = function (url) {
        var self = this, args = arguments;
        if (url === undefined) {
            url = location.hash.substr(1);
        }
        var path = url.split(';')[0].split('/');
        var type = path[1], name = decodeURIComponent(path[2] || '');
        if (type === 'nline') {
            openScreen(decodeURIComponent(path.slice(2).join('/')));
            return;
        }
        if (type !== 'model' && type !== 'wizard') {
            return openUrl.apply(self, args);
        }
        allowed().then(function (allow) {
            if (allow.all || (type === 'model' ? allow.models :
                    allow.wizards).indexOf(name) >= 0) {
                openUrl.apply(self, args);
            } else {
                refuse();
            }
        });
    };

    /* A message of a screen (e.g. "Bill 12 posted"), kept after its tab
     * closed */
    function toast(message, kind) {
        var box = jQuery('#nl-toasts');
        if (!box.length) {
            box = jQuery('<div/>', {'id': 'nl-toasts',
                'aria-live': 'polite'}).appendTo('body');
        }
        var item = jQuery('<div/>', {'class': 'nl-toast ' + kind,
            'text': message}).appendTo(box);
        setTimeout(function () {
            item.fadeOut(400, function () {
                item.remove();
            });
        }, kind === 'error' ? 8000 : 4000);
    }

    /* From a screen: open another one in its own tab, or close (Save & Close) */
    window.addEventListener('message', function (event) {
        var data = event.data;
        if (event.origin !== location.origin || !data || !data.nline) {
            return;
        }
        if (data.nline === 'open' && typeof data.route === 'string') {
            openScreen(data.route, data.name ? String(data.name) : null);
        } else if (data.nline === 'record' && data.model && data.id) {
            Sao.Tab.create({
                model: String(data.model),
                res_id: Number(data.id),
                mode: ['form', 'tree'],
                view_ids: [],
                domain: [],
                context: {},
                name: String(data.name || '')
            });
        } else if (data.nline === 'title' && data.name) {
            Sao.Tab.tabs.forEach(function (tab) {
                if (tab.frame && tab.frame[0].contentWindow === event.source) {
                    tab.set_name(String(data.name));
                }
            });
        } else if (data.nline === 'menu-prefs') {
            /* Settings > Menu Layout saved (or previewed): draw the menu */
            menuPrefsText = typeof data.prefs === 'string' ? data.prefs :
                menuPrefsText;
            showCategory(currentCategory());
        } else if (data.nline === 'toast' && data.message) {
            toast(String(data.message), String(data.kind || ''));
        } else if (data.nline === 'action' && data.action) {
            Sao.Action.execute(Number(data.action), {}, {});
        } else if (data.nline === 'close') {
            Sao.Tab.tabs.slice().forEach(function (tab) {
                if (tab.frame && tab.frame[0].contentWindow === event.source) {
                    tab.close();
                }
            });
        }
    });

    function module(src) {
        var script = document.createElement('script');
        script.type = 'module';
        script.src = src;
        document.head.appendChild(script);
    }

    /* The menu's width: drag its right edge (double-click: back to the
     * default); kept per browser */
    function menuEdge() {
        var root = document.documentElement;
        var key = 'nline.menu.width';
        var set = function (width) {
            width = Math.max(160, Math.min(600, Math.round(width)));
            root.style.setProperty('--nl-menu-w', width + 'px');
            return width;
        };
        try {
            var saved = parseInt(localStorage.getItem(key), 10);
            if (saved) {
                set(saved);
            }
        } catch (e) {
            /* No storage: the default width */
        }
        var edge = jQuery('<div/>', {'id': 'nl-menu-edge',
            'title': 'Drag to change the menu width (double-click: default)',
            'role': 'separator', 'aria-orientation': 'vertical'});
        jQuery('#menu').after(edge);
        edge.on('mousedown', function (event) {
            event.preventDefault();
            var left = jQuery('#menu').offset().left;
            var width = null;
            jQuery('body').addClass('nl-resizing');
            jQuery(document).on('mousemove.nlmenu', function (move) {
                width = set(move.pageX - left);
            }).on('mouseup.nlmenu', function () {
                jQuery(document).off('.nlmenu');
                jQuery('body').removeClass('nl-resizing');
                if (width) {
                    try {
                        localStorage.setItem(key, String(width));
                    } catch (e) {
                        /* No storage: this page only */
                    }
                }
            });
        });
        edge.on('dblclick', function () {
            root.style.removeProperty('--nl-menu-w');
            try {
                localStorage.removeItem(key);
            } catch (e) {
                /* No storage */
            }
        });
    }

    /* ---- Category tabs, the menu list per tab, the window list --------- */

    /* The broad categories across the top, as in every N-Line BI app; the
     * menu pane lists every window of the chosen one's top menus, flat (no
     * folders to open), Home first. A top menu not listed here shows under
     * Admin. */
    var CATEGORIES = [
        ['Inventory/Engineering', ['Inventory', 'Engineering', 'Products',
            'Inventory & Stock', 'Productions']],
        ['Quotation/Sales', ['Estimating', 'Sales', 'Customers']],
        ['RFQ/Purchasing', ['Purchasing', 'Vendors', 'Purchases']],
        ['Shopfloor', ['Shopfloor', 'Planning']],
        ['Accounting', ['Accounting', 'Company', 'Banking', 'Financial',
            'Executive Information', 'Currencies', 'Banks']],
        ['Settings', ['My Settings', 'Common', 'Companies', 'Parties']],
        ['Admin', ['Administration', 'System Administration']]
    ];
    var ALWAYS = ['Home'];
    var menus = null;           /* the user's menus, by id */
    var tops = [];              /* the top menus, in order */

    function store(key, value) {
        try {
            if (value === undefined) {
                return JSON.parse(localStorage.getItem(key) || 'null');
            }
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* No storage: this page only */
        }
        return null;
    }

    function userKey(what) {
        var session = Sao.Session.current_session;
        return 'nline.' + what + '.' + (session ? session.database + '.' +
            session.login : '');
    }

    /* Settings > Menu Layout: the user's layout (res.user
     * nline_menu_prefs, menuprefs.js); an older per-browser list of hidden
     * menus until one is saved */
    var menuPrefsText = null;
    function prefs() {
        var p = window.NLineMenu ? NLineMenu.parse(menuPrefsText) : {
            hidden: [], icons: {}, colors: {}};
        if (!menuPrefsText) {
            p.hidden = store(userKey('menu.hidden')) || [];
        }
        return p;
    }

    function hiddenMenus() {
        return prefs().hidden;
    }

    function categoryOf(name) {
        for (var i = 0; i < CATEGORIES.length; i++) {
            if (CATEGORIES[i][1].indexOf(name) >= 0) {
                return CATEGORIES[i][0];
            }
        }
        return ALWAYS.indexOf(name) >= 0 ? null : 'Admin';
    }

    function currentCategory() {
        return store(userKey('category')) || CATEGORIES[0][0];
    }

    /* A menu's icon: drawn in the user's colours (menuprefs.js), else the
     * server's */
    function icon(img, menu) {
        var url = window.NLineMenu && NLineMenu.iconUrl(menu, prefs());
        if (url) {
            img.attr('src', url);
        } else if (menu.icon) {
            Sao.common.ICONFACTORY.get_icon_url(menu.icon).then(function (u) {
                img.attr('src', u);
            });
        }
        return img;
    }

    function openMenu(id) {
        Sao.Action.exec_keyword('tree_open', {model: 'ir.ui.menu', id: id},
            null, false);
    }

    /* The windows of a menu, depth first, each with its folder path (a
     * sub-folder becomes a heading, not a folder to open); a window met
     * before in the same list is left out (the same window in two
     * folders) */
    function windowsOf(menu, path, hidden, seen, out) {
        (menu.children || []).forEach(function (child) {
            if (hidden.indexOf(child.id) >= 0) {
                return;
            }
            if (child.action && !seen[child.action]) {
                seen[child.action] = true;
                out.push({menu: child, path: path});
            }
            /* (a folder that is a window itself lists once: its
             * children are its variants) */
            if (child.children.length && !child.action) {
                windowsOf(child, path.slice(0, 1).concat([child.name]),
                    hidden, seen, out);
            }
        });
        return out;
    }

    function menuRow(menu, kind) {
        var row = jQuery('<a/>', {'href': '#', 'class': 'nl-mi' +
            (kind ? ' ' + kind : ''), 'title': menu.name})
            .append(icon(jQuery('<img/>', {'class': 'nl-mi-icon',
                'alt': ''}), menu), jQuery('<span/>', {
                'text': menu.name}));
        row.click(function (event) {
            event.preventDefault();
            jQuery('#nl-menu .nl-mi.on').removeClass('on');
            row.addClass('on');
            openMenu(menu.id);
        });
        return row;
    }

    /* The menu list of a category */
    function showCategory(category) {
        store(userKey('category'), category);
        jQuery('#nl-cats a').each(function () {
            jQuery(this).toggleClass('on', this.dataset.cat === category);
        });
        jQuery('#nl-menu-tools').toggle(category === 'Settings');
        var list = jQuery('#nl-menu').empty();
        if (!menus) {
            return;
        }
        var hidden = hiddenMenus();
        var seen = {};
        /* Top menus of the same name (e.g. Banking) as one group */
        var groups = [], byName = {};
        tops.forEach(function (top) {
            if (hidden.indexOf(top.id) >= 0) {
                return;
            }
            var cat = categoryOf(top.name);
            if (cat === null) {
                list.append(menuRow(top, 'nl-mi-home'));
                return;
            }
            if (cat !== category) {
                return;
            }
            if (!byName[top.name]) {
                byName[top.name] = [];
                groups.push(byName[top.name]);
            }
            byName[top.name].push(top);
        });
        groups.forEach(function (group) {
            var items = [];
            group.forEach(function (top) {
                if (top.action && !seen[top.action]) {
                    seen[top.action] = true;
                    items.push({menu: top, path: [top.name]});
                }
                windowsOf(top, [top.name], hidden, seen, items);
            });
            /* One heading per folder, its windows under it */
            var order = [], under = {};
            items.forEach(function (item) {
                var title = item.path.join(' › ');
                if (!under[title]) {
                    under[title] = [];
                    order.push({title: title, sub: item.path.length > 1});
                }
                under[title].push(item.menu);
            });
            order.forEach(function (heading) {
                list.append(jQuery('<div/>', {'class': 'nl-mh' +
                    (heading.sub ? ' nl-mh-sub' : ''),
                    'text': heading.title}));
                under[heading.title].forEach(function (menu) {
                    list.append(menuRow(menu));
                });
            });
        });
    }

    function categoryBar() {
        var bar = jQuery('<nav/>', {'id': 'nl-cats',
            'aria-label': 'Categories'});
        CATEGORIES.forEach(function (cat) {
            bar.append(jQuery('<a/>', {'href': '#', 'text': cat[0]})
                .attr('data-cat', cat[0])
                .click(function (event) {
                    event.preventDefault();
                    showCategory(cat[0]);
                }));
        });
        jQuery('#main').before(bar);
    }

    /* The user's menus (what their groups may open), once per sign-in */
    function loadMenus() {
        var session = Sao.Session.current_session;
        Sao.rpc({
            method: 'model.ir.ui.menu.search_read',
            params: [[], 0, null, [['sequence', 'ASC'], ['id', 'ASC']],
                ['name', 'parent', 'icon', 'action'], {}]
        }, session).then(function (rows) {
            menus = {};
            tops = [];
            rows.forEach(function (row) {
                row.children = [];
                menus[row.id] = row;
            });
            rows.forEach(function (row) {
                if (row.parent && menus[row.parent]) {
                    menus[row.parent].children.push(row);
                } else if (!row.parent) {
                    tops.push(row);
                }
            });
            var have = {};
            tops.forEach(function (top) {
                have[categoryOf(top.name)] = true;
            });
            jQuery('#nl-cats a').each(function () {
                jQuery(this).toggle(Boolean(have[this.dataset.cat]));
            });
            var wanted = currentCategory();
            if (!have[wanted]) {
                wanted = CATEGORIES.filter(function (cat) {
                    return have[cat[0]];
                }).map(function (cat) {
                    return cat[0];
                })[0] || CATEGORIES[0][0];
            }
            showCategory(wanted);
        });
    }

    /* The bottom of the menu pane: the Action search (Tryton's global
     * search: type part of a window's or a record's name to open it) and
     * the open windows, one short row each (Jobshop's window list), in
     * place of the tabs along the top */
    function windowList() {
        var panel = jQuery('<div/>', {'id': 'nl-windows'}).append(
            jQuery('<div/>', {'id': 'nl-search'}).append(
                jQuery('#global-search').attr('title', 'Search: type part ' +
                    'of a window or a record name to open it')
),
            jQuery('<div/>', {'class': 'nl-win-head'}).append(
                jQuery('<span/>', {'text': 'Open Windows'}),
                jQuery('<span/>', {'class': 'nl-win-count'})),
            jQuery('<ul/>', {'class': 'nl-win-list', 'role': 'tablist'}));
        jQuery('.row-offcanvas').append(panel);
        var list = panel.find('ul');
        var root = document.documentElement;

        function draw() {
            list.empty();
            var items = jQuery('#tablist > li');
            items.each(function () {
                var li = jQuery(this);
                var link = li.children('a');
                var name = link.clone().children('.close').remove().end()
                    .text().trim();
                var row = jQuery('<li/>', {
                    'class': li.hasClass('active') ? 'on' : '',
                    'title': name, 'role': 'tab',
                    'aria-selected': li.hasClass('active')
                }).append(jQuery('<span/>', {'class': 'nl-win-name',
                    'text': name}), jQuery('<button/>', {
                    'type': 'button', 'class': 'nl-win-close',
                    'title': 'Close', 'aria-label': 'Close ' + name,
                    'html': '&times;'
                }).click(function (event) {
                    event.stopPropagation();
                    li.find('.close').first().click();
                })).on('click', function () {
                    link.tab('show');
                }).on('auxclick', function (event) {
                    if (event.button === 1) {
                        li.find('.close').first().click();
                    }
                });
                list.append(row);
            });
            panel.find('.nl-win-count').text(items.length ?
                String(items.length) : '');
            panel.toggleClass('empty', !items.length);
            root.style.setProperty('--nl-win-h', panel.outerHeight() + 'px');
        }
        /* The client fills the search box later: name what it does */
        new MutationObserver(function () {
            panel.find('#global-search input').attr('placeholder',
                'Find a window or record');
        }).observe(panel.find('#nl-search')[0], {childList: true,
            subtree: true});
        new MutationObserver(draw).observe(document.getElementById(
            'tablist'), {childList: true, subtree: true, attributes: true,
            attributeFilter: ['class'], characterData: true});
        draw();
    }

    jQuery(function () {
        menuEdge();
        categoryBar();
        /* The menu list in place of the client's folder tree (which
         * stays, hidden: the client keeps it up to date) */
        jQuery('#menu').before(jQuery('<nav/>', {'id': 'nl-menu',
            'aria-label': 'Menu'}));
        windowList();
        /* The menu pane always shown: no hiding it by the name */
        jQuery('.row-offcanvas').addClass('active');
        jQuery('[data-toggle="offcanvas"]').off('click')
            .removeAttr('data-toggle');
        /* Settings: Menu Layout, at the right of the category bar */
        jQuery('#nl-cats').append(jQuery('<span/>', {'id': 'nl-menu-tools'})
            .append(jQuery('<button/>', {'type': 'button',
                'class': 'nl-menu-tool', 'text': 'Menu Layout...',
                'title': 'Choose the menu items, colours and icons'})
                .click(function () {
                    openScreen('menu-layout', 'Menu Layout');
                })).hide());
        /* The name on two lines: "Tryton ERP", under it "for" (handwritten)
         * and N-Line's logo; N-Line's valve beside them */
        var title = jQuery('#title');
        var box = jQuery('<span/>', {'class': 'nl-brandbox'});
        title.before(box);
        box.append(title, jQuery('<span/>', {
            'class': 'nl-sub hidden-xs'
        }).append(jQuery('<span/>', {
            'class': 'nl-for', 'text': 'for'
        }), jQuery('<img/>', {
            'class': 'nl-logo', 'src': 'images/nline-logo.png',
            'alt': 'N-Line Valves'
        })));
        box.after(jQuery('<img/>', {
            'class': 'nl-valve hidden-xs', 'src': 'images/nline-valve.png',
            'alt': ''
        }));
        var apps = jQuery('<div/>', {
            'id': 'nl-apps',
            'class': 'navbar-text nl-apps-slot'
        });
        jQuery('.navbar-brand').after(apps);
        var right = jQuery('<span/>', {'id': 'nl-right'});
        jQuery('#user-preferences').before(jQuery('<li/>', {
            'class': 'nl-right-item'
        }).append(right));
        if (BEHIND_NLBI) {
            /* The N-Line BI drop-ins, as in every N-Line BI app: Apps right
             * after the name, then Claude, light / dark and the name menu */
            apps.append(jQuery('<span/>', {
                'id': 'apps-slot',
                'data-btn-class': 'nl-btn'
            }));
            right.addClass('nl-right');
            right.append(jQuery('<span/>', {
                'id': 'claude-slot',
                'data-app': 'Tryton ERP',
                'data-btn-class': 'nl-btn'
            }));
            var theme = jQuery('<button/>', {
                'type': 'button',
                'class': 'nl-btn nl-theme'
            });
            var paint = function () {
                var dark = window.NLineHeader && NLineHeader.isDark();
                theme.text(dark ? '☀' : '☾')
                    .attr('title', dark ? 'Switch to light' :
                        'Switch to dark')
                    .attr('aria-label', dark ? 'Switch to light' :
                        'Switch to dark');
            };
            theme.click(function () {
                NLineHeader.setTheme(NLineHeader.isDark() ? 'light' : 'dark');
                paint();
            });
            paint();
            right.append(theme);
            /* "Settings..." of the name menu: the Tryton preferences */
            right.append(jQuery('<button/>', {
                'type': 'button',
                'id': 'nl-preferences',
                'hidden': 'hidden'
            }).click(function () {
                Sao.preferences();
            }));
            right.append(jQuery('<span/>', {
                'id': 'who-slot',
                'data-settings': '#nl-preferences'
            }));
            module('/server/web/apps_menu.js');
            module('/server/web/claude_panel.js');
            module('/server/web/name_menu.js');
        }
    });
}());
