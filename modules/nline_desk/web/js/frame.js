/* N-Line screens: the building blocks shared by every screen, after
 * QuickBooks Desktop and VISUAL Jobshop (docs/ui/UI_UPGRADE_PLAN.md):
 * - UI.form: the transaction form (ribbon with Find, Save & Close,
 *   Save & New, Clear; the history panel of the customer or vendor)
 * - UI.grid: the line grid (row markers, totals, Enter to the next cell,
 *   a new row after the last one)
 * - UI.browse: the "..." lookup (F9 in any lookup field, * wildcards)
 * - UI.center: list on the left, detail and transactions on the right
 * - UI.openRecord / UI.openScreen / UI.openAction: open in a Tryton tab */
(function (global) {
    'use strict';

    var el = UI.el;

    /* ---- Opening other screens -------------------------------------- */

    function toTryton(message) {
        if (global.parent !== global) {
            global.parent.postMessage(message, global.location.origin);
            return true;
        }
        return false;
    }

    /* A Tryton record in a Tryton tab (or the Tryton client outside it) */
    function openRecord(model, id, name) {
        if (!toTryton({nline: 'record', model: model, id: id,
                name: name || ''})) {
            var session = global.Rpc.session();
            global.open(global.Rpc.base + '/#' + encodeURIComponent(
                session.database) + '/model/' + model + '/' + id, '_blank');
        }
    }

    /* An N-Line screen, by its route (e.g. 'bills/new') */
    function openScreen(route, name) {
        if (!toTryton({nline: 'open', route: route, name: name || ''})) {
            global.location.hash = '#/' + route;
        }
    }

    /* The name of the screen's Tryton tab (e.g. the report's title) */
    function setTitle(name) {
        toTryton({nline: 'title', name: name});
    }

    /* A Tryton action (ir.action id): a list, a report, a wizard */
    function openAction(action) {
        if (!toTryton({nline: 'action', action: action})) {
            var session = global.Rpc.session();
            global.open(global.Rpc.base + '/#' + encodeURIComponent(
                session.database), '_blank');
        }
    }

    /* ---- The lookup: "..." and F9 ------------------------------------ */

    /* browse(model, {title, domain, columns: [{field, label, money}],
     * order}) -> Promise of the chosen record (rejected on Cancel) */
    /* Jobshop's search text: "AB" begins with AB, "*AB" contains it, "?" is
     * any one character */
    function jobshopLike(text) {
        text = (text || '').trim();
        if (!text) {
            return null;
        }
        /* (an open end always: Jobshop's text is a beginning) */
        return (/\*$/.test(text) ? text : text + '*').replace(/%/g, '\\%')
            .replace(/\*/g, '%').replace(/\?/g, '_');
    }

    /* The user's Preferences (common.js), defaults when not loaded */
    function preference(name, fallback) {
        var common = global.JobshopCommon;
        var value = common && common.preferences ?
            common.preferences()[name] : undefined;
        return value === undefined ? fallback : value;
    }

    /* Jobshop's lookup columns per table (its Browse definitions), for a
     * "..." anywhere: {title, columns: [{name, label, type ('date',
     * 'money', 'float', 'boolean'), labels, w (width), search (false: not
     * searched)}]}; or a function of the lookup's domain (Customers or
     * Suppliers). UI.lookups.register(model, spec) adds or replaces one.
     * Tables without one show the ID and the Description (the two parts
     * of the record's name). */
    var PO_LOOKUP_STATUS = {unreleased: 'Unreleased', firm: 'Firm',
        released: 'Released', closed: 'Closed', cancelled: 'Cancelled'};
    var WO_LOOKUP_STATUS = {unreleased: 'Unreleased', firm: 'Firm',
        hold: 'Hold', released: 'Released', closed: 'Closed',
        cancelled: 'Cancelled'};
    var LOOKUPS = {
        'purchase.purchase': {title: 'Purchase Orders', columns: [
            {name: 'number', label: 'ID', w: 90},
            {name: 'party.code', label: 'Supplier ID', w: 110},
            {name: 'party.name', label: 'Name', w: 190},
            {name: 'reference', label: 'Supplier Quote Ref', w: 130},
            {name: 'buyer', label: 'Buyer', w: 60},
            {name: 'purchase_date', label: 'Order Date', type: 'date',
                w: 85},
            {name: 'delivery_date', label: 'Desired Recv Date',
                type: 'date', w: 85},
            {name: 'jobshop_status', label: 'Status', labels:
                PO_LOOKUP_STATUS, search: false, w: 80}]},
        'sale.sale': {title: 'Customer Orders', columns: [
            {name: 'number', label: 'ID', w: 90},
            {name: 'party.code', label: 'Customer ID', w: 110},
            {name: 'party.name', label: 'Name', w: 190},
            {name: 'reference', label: 'Customer PO Ref', w: 130},
            {name: 'sale_date', label: 'Order Date', type: 'date', w: 85},
            {name: 'shipping_date', label: 'Desired Ship Date',
                type: 'date', w: 85},
            {name: 'js_status', label: 'Status', search: false, w: 80}]},
        'nline.quote': {title: 'Quotes', columns: [
            {name: 'number', label: 'ID', w: 90},
            {name: 'party.code', label: 'Customer ID', w: 110},
            {name: 'name', label: 'Name', w: 190},
            {name: 'customer_reference', label: 'Customer RFQ Ref', w: 130},
            {name: 'quote_date', label: 'Quote Date', type: 'date', w: 85},
            {name: 'status', label: 'Status', search: false, w: 80}]},
        'nline.rfq': {title: 'Requests for Quote', columns: [
            {name: 'number', label: 'ID', w: 90},
            {name: 'rfq_date', label: 'Quote Date', type: 'date', w: 85},
            {name: 'due_date', label: 'Due Date', type: 'date', w: 85},
            {name: 'supplier_1.code', label: 'Supplier 1 ID', w: 110},
            {name: 'supplier_2.code', label: 'Supplier 2 ID', w: 110},
            {name: 'supplier_3.code', label: 'Supplier 3 ID', w: 110},
            {name: 'status', label: 'Status', search: false, w: 80}]},
        'production': {title: 'Work Orders', columns: [
            {name: 'number', label: 'ID', w: 110},
            {name: 'product.code', label: 'Part ID', w: 130},
            {name: 'description', label: 'Description', w: 220},
            {name: 'quantity', label: 'Desired Qty', type: 'float',
                search: false, w: 80},
            {name: 'planned_date', label: 'Want Date', type: 'date', w: 85},
            {name: 'order_status', label: 'Status', labels:
                WO_LOOKUP_STATUS, search: false, w: 80}]},
        'product.product': {title: 'Parts', columns: [
            {name: 'code', label: 'ID', w: 150},
            {name: 'name', label: 'Description', w: 260},
            {name: 'producible', label: 'Fab\'d', type: 'boolean', w: 45},
            {name: 'purchasable', label: 'Pur\'d', type: 'boolean', w: 45},
            {name: 'default_uom.symbol', label: 'Stock U/M', w: 70,
                search: false},
            {name: 'drawing_number', label: 'Drawing ID', w: 110}]},
        'product.template': {title: 'Parts', columns: [
            {name: 'code', label: 'ID', w: 150},
            {name: 'name', label: 'Description', w: 260},
            {name: 'producible', label: 'Fab\'d', type: 'boolean', w: 45},
            {name: 'purchasable', label: 'Pur\'d', type: 'boolean', w: 45},
            {name: 'default_uom.symbol', label: 'Stock U/M', w: 70,
                search: false}]},
        'party.party': function (domain) {
            var text = JSON.stringify(domain || []);
            if (/supplier/.test(text) && !/customer/.test(text)) {
                return {title: 'Suppliers', columns: [
                    {name: 'code', label: 'ID', w: 120},
                    {name: 'name', label: 'Name', w: 220},
                    {name: 'supplier_city', label: 'City', w: 110},
                    {name: 'supplier_state', label: 'State', w: 50},
                    {name: 'supplier_phone', label: 'Phone', w: 110},
                    {name: 'supplier_buyer', label: 'Buyer', w: 60}]};
            }
            if (/customer/.test(text)) {
                return {title: 'Customers', columns: [
                    {name: 'code', label: 'ID', w: 120},
                    {name: 'name', label: 'Name', w: 220},
                    {name: 'sold_to_city', label: 'City', w: 110},
                    {name: 'sold_to_subdivision.code', label: 'State',
                        w: 50, search: false},
                    {name: 'customer_phone', label: 'Phone', w: 110}]};
            }
            return {title: 'Customers and Suppliers', columns: [
                {name: 'code', label: 'ID', w: 120},
                {name: 'name', label: 'Name', w: 260}]};
        },
        'company.employee': {title: 'Employees', columns: [
            {name: 'party.code', label: 'ID', w: 100},
            {name: 'employee_name', label: 'Name', w: 200},
            {name: 'clock_no', label: 'Clock No', w: 70},
            {name: 'title', label: 'Title', w: 120},
            {name: 'shift_no', label: 'Shift', search: false, w: 45}]},
        'production.work.center': {title: 'Shop Resources', columns: [
            {name: 'name', label: 'ID', w: 130},
            {name: 'description', label: 'Description', w: 240},
            {name: 'resource_type', label: 'Type', search: false, w: 90}]},
        'stock.shipment.out': {title: 'Shippers', columns: [
            {name: 'number', label: 'Packlist ID', w: 100},
            {name: 'customer.code', label: 'Customer ID', w: 110},
            {name: 'customer.name', label: 'Name', w: 190},
            {name: 'reference', label: 'Reference', w: 120},
            {name: 'effective_date', label: 'Shipped Date', type: 'date',
                w: 85},
            {name: 'js_tracking_number', label: 'Tracking No', w: 120}]},
        'stock.shipment.in': {title: 'Receivers', columns: [
            {name: 'number', label: 'Receiver ID', w: 100},
            {name: 'supplier.code', label: 'Supplier ID', w: 110},
            {name: 'supplier.name', label: 'Name', w: 190},
            {name: 'purchase.number', label: 'Purchase Order ID', w: 110},
            {name: 'reference', label: 'Reference', w: 120},
            {name: 'effective_date', label: 'Received Date', type: 'date',
                w: 85}]},
        'account.invoice': {title: 'Invoices', columns: [
            {name: 'number', label: 'Invoice ID', w: 100},
            {name: 'party.code', label: 'Customer ID', w: 110},
            {name: 'party.name', label: 'Name', w: 190},
            {name: 'reference', label: 'Reference', w: 120},
            {name: 'invoice_date', label: 'Invoice Date', type: 'date',
                w: 85},
            {name: 'total_amount', label: 'Total', type: 'money',
                search: false, w: 90}]},
        'production.bom': {title: 'Engineering Masters', columns: [
            {name: 'part.code', label: 'Part ID', w: 150},
            {name: 'revision', label: 'Eng ID', w: 60},
            {name: 'description', label: 'Description', w: 260},
            {name: 'drawing_number', label: 'Drawing ID', w: 110}]},
        'product.uom': {title: 'Units of Measure', columns: [
            {name: 'symbol', label: 'ID', w: 90},
            {name: 'name', label: 'Description', w: 220},
            {name: 'category.name', label: 'Category', w: 120,
                search: false}]},
        'stock.location': {title: 'Locations', columns: [
            {name: 'code', label: 'ID', w: 110},
            {name: 'name', label: 'Description', w: 240},
            {name: 'type', label: 'Type', search: false, w: 90}]}
    };

    /* Tables whose lookup columns Tryton cannot search (computed): the
     * search looks at the name (ID and name) only */
    var NAME_ONLY = {};

    function lookupSpec(model, domain) {
        var spec = LOOKUPS[model];
        return typeof spec === 'function' ? spec(domain) : spec;
    }

    var lookups = {
        register: function (model, spec) {
            LOOKUPS[model] = spec;
        },
        get: lookupSpec
    };

    /* A read value, also through a relation ("party.code": Tryton reads
     * it as row["party."].code) */
    function readValue(row, name) {
        if (row[name] !== undefined || name.indexOf('.') < 0) {
            return row[name];
        }
        var parts = name.split('.');
        var value = row;
        for (var i = 0; i < parts.length && value; i++) {
            value = i < parts.length - 1 ? value[parts[i] + '.'] :
                value[parts[i]];
        }
        return value;
    }

    /* The record's name split in Jobshop's ID and Description */
    function nameParts(name) {
        name = name || '';
        var at = name.indexOf(' - ');
        return at > 0 ? [name.slice(0, at), name.slice(at + 3)] :
            [name, ''];
    }

    /* browse(model, {title, domain, columns, order, text (typed so far),
     * current (the record id shown now)}) -> Promise of the chosen record
     * (rejected on Cancel). Jobshop's lookup window: the table's Browse
     * columns in a grid (header click sorts, drag sizes, right-click
     * filters, Export), Search with Find and Refresh, OK / Cancel; a
     * double-click or Enter takes the row. */
    function browse(model, options) {
        options = options || {};
        var spec = lookupSpec(model, options.domain) || {};
        var columns = (options.columns || spec.columns || [
            {name: 'rec_name', label: 'ID', part: 0, w: 160},
            {name: 'rec_name', label: 'Description', part: 1, w: 300,
                search: false}]).map(function (c) {
                    /* (the old {field, money} columns) */
                    return c.field ? {name: c.field, label: c.label, type:
                        c.money ? 'money' : c.type, w: c.w} : c;
                });
        var fields = ['rec_name'];
        columns.forEach(function (c) {
            if (c.type === 'many2one') {
                fields.push(c.name, c.name + '.rec_name');
            } else if (fields.indexOf(c.name) < 0) {
                fields.push(c.name);
            }
        });
        var title = options.lookupTitle || spec.title || options.title ||
            'Find';

        function cell(row, c) {
            var v = c.part !== undefined ? nameParts(row.rec_name)[c.part] :
                c.type === 'many2one' ? (row[c.name + '.'] || {}).rec_name :
                readValue(row, c.name);
            var num = c.type === 'money' || c.type === 'float' ||
                c.type === 'integer';
            var text = v === null || v === undefined || v === false ? '' :
                c.type === 'money' ? UI.money(v) :
                c.type === 'date' || !c.type && /^\d{4}-\d\d-\d\d$/.test(
                    v) ? UI.date(v) :
                c.type === 'boolean' ? (v ? '✔' : '') :
                c.labels ? (c.labels[v] || String(v)) :
                c.type === 'many2one' ? UI.shortName('', v) : String(v);
            return el('td' + (num ? '.num' : c.type === 'boolean' ?
                '.center' : ''), text);
        }

        return new Promise(function (resolve, reject) {
            var search = el('input', {type: 'text', 'aria-label': 'Search',
                value: options.text || ''});
            var body = el('tbody');
            var table = el('table.data.lookup-grid', el('thead', el('tr',
                [el('th.row-head')].concat(columns.map(function (c) {
                    return el('th', {style: {width: (c.w || 120) + 'px'}},
                        c.label);
                })))), body);
            var gridBox = el('div.lookup-grid-box', table);
            var count = el('span.lookup-count');
            var tools = null;
            var loaded = false;
            var done = false;
            var overlay;

            function rows() {
                return Array.prototype.filter.call(body.rows, function (tr) {
                    return tr.record && tr.style.display !== 'none' &&
                        !tr.hidden;
                });
            }

            function activeRow() {
                return body.querySelector('tr.active');
            }

            function activate(tr) {
                var old = activeRow();
                if (old) {
                    old.classList.remove('active');
                }
                if (tr) {
                    tr.classList.add('active');
                    tr.scrollIntoView({block: 'nearest'});
                }
            }

            function finish(record) {
                if (done) {
                    return;
                }
                done = true;
                overlay.remove();
                global.document.removeEventListener('keydown', keys, true);
                if (record) {
                    resolve(record);
                } else {
                    reject({cancelled: true});
                }
            }

            function load(nameOnly) {
                var domain = (options.domain || []).slice();
                var text = jobshopLike(search.value);
                var wide = false;
                if (text) {
                    /* The name and the text columns (a computed column
                     * Tryton cannot search: the name only, see below) */
                    var or = ['OR', ['rec_name', 'ilike', text]];
                    columns.forEach(function (c) {
                        if (!nameOnly && !NAME_ONLY[model] &&
                                c.search !== false && c.part === undefined &&
                                !c.labels && (!c.type || c.type === 'char')) {
                            or.push([c.name, 'ilike', text]);
                            wide = true;
                        }
                    });
                    domain.push(or);
                }
                var limit = preference('browseMaxRows', 1000) || null;
                count.textContent = 'Loading...';
                global.Rpc.searchRead(model, domain, fields, {limit: limit,
                    order: options.order || spec.order}).then(function (
                        records) {
                    UI.clear(body);
                    records.forEach(function (record) {
                        var tr = el('tr', {
                            onclick: function () {
                                activate(tr);
                            },
                            ondblclick: function () {
                                finish(record);
                            }
                        }, [el('td.row-head')].concat(columns.map(function (
                            c) {
                            return cell(record, c);
                        })));
                        tr.record = record;
                        body.appendChild(tr);
                    });
                    loaded = true;
                    if (tools) {
                        tools.apply();
                    }
                    var shown = rows();
                    var current = options.current && shown.filter(function (
                        tr) {
                        return tr.record.id === options.current;
                    })[0];
                    activate(current || shown[0]);
                    count.textContent = shown.length + (limit &&
                        records.length >= limit ? '+' : '') + ' record' +
                        (shown.length === 1 ? '' : 's');
                }, function (error) {
                    if (wide) {
                        NAME_ONLY[model] = true;
                        load(true);
                        return;
                    }
                    count.textContent = '';
                    UI.showError(error);
                });
            }

            function move(by) {
                var shown = rows();
                var at = shown.indexOf(activeRow());
                activate(shown[Math.max(0, Math.min(shown.length - 1,
                    (at < 0 ? 0 : at) + by))]);
            }

            /* Arrows, Page Up/Down, Home/End move; Enter takes the row
             * (or runs a search not run yet); Esc cancels; F5 refreshes */
            function keys(event) {
                if (done || global.document.querySelector('.ctx-menu') ||
                        overlay.nextElementSibling) {
                    return;
                }
                var page = Math.max(1, Math.floor(gridBox.clientHeight /
                    24) - 1);
                var by = {ArrowDown: 1, ArrowUp: -1, PageDown: page,
                    PageUp: -page}[event.key];
                if (by) {
                    move(by);
                } else if ((event.key === 'Home' || event.key === 'End') &&
                        event.target !== search) {
                    var shown = rows();
                    activate(event.key === 'Home' ? shown[0] :
                        shown[shown.length - 1]);
                } else if (event.key === 'Enter') {
                    if (event.target === search && search.dataset.dirty) {
                        delete search.dataset.dirty;
                        global.clearTimeout(timer);
                        load();
                    } else if (activeRow()) {
                        finish(activeRow().record);
                    }
                } else if (event.key === 'Escape') {
                    finish(null);
                } else if (event.key === 'F5') {
                    load();
                } else {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
            }

            var timer;
            search.addEventListener('input', function () {
                search.dataset.dirty = '1';
                global.clearTimeout(timer);
                timer = global.setTimeout(function () {
                    delete search.dataset.dirty;
                    load();
                }, 300);
            });

            function button(label, onclick, primary) {
                return el('button' + (primary ? '.primary' : ''), {type:
                    'button', onclick: onclick}, label);
            }

            var win = el('div.lookup-win', {role: 'dialog', 'aria-label':
                title},
                el('div.lookup-title', el('span', title), el(
                    'button.lookup-x', {type: 'button', title: 'Cancel (Esc)',
                        'aria-label': 'Close', onclick: function () {
                            finish(null);
                        }}, '×')),
                el('div.lookup-tabs', el('span.lookup-tab', 'Browse')),
                gridBox,
                el('div.lookup-bar',
                    el('label', 'Search'), search,
                    button('Find', function () {
                        global.clearTimeout(timer);
                        load();
                    }),
                    button('Refresh', function () {
                        load();
                    }),
                    el('span.lookup-gap'),
                    button('OK', function () {
                        if (activeRow()) {
                            finish(activeRow().record);
                        }
                    }, true),
                    button('Cancel', function () {
                        finish(null);
                    })),
                el('div.lookup-status', el('span',
                    'Right click within the grid to open a right click ' +
                    'menu, if available.'), count));
            overlay = el('div.overlay.lookup-overlay', win);
            global.document.body.appendChild(overlay);
            global.document.addEventListener('keydown', keys, true);
            if (global.JobshopCommon && global.JobshopCommon.gridTools) {
                tools = global.JobshopCommon.gridTools({table: table,
                    offset: 1, key: 'lookup.' + model + '.' + title, title:
                    title, columns: columns, onchange: function (shown,
                        total) {
                        if (loaded) {
                            count.textContent = shown + ' of ' + total +
                                ' records';
                        }
                    }});
            }
            table.addEventListener('contextmenu', function (event) {
                var tr = event.target.closest('tbody tr');
                if (tr && tr.record) {
                    activate(tr);
                } else {
                    tr = null;
                }
                UI.contextMenu(event, [
                    {label: 'Select', disabled: !tr, onclick: function () {
                        finish(tr.record);
                    }},
                    {label: 'Refresh', shortcut: 'F5', onclick: function () {
                        load();
                    }}
                ].concat(tools ? ['-'].concat(tools.menuItems(tr,
                    tools.columnAt(event))) : []));
            });
            search.focus();
            search.select();
            load();
        });
    }

    /* ---- The transaction form ---------------------------------------- */

    /* form(main, {title, kind: 'vendor'|'customer', find: {model, domain,
     * columns, title}, onSave(andNew) -> Promise, onClear, extra: [{label,
     * onclick}]}) -> {body, showParty(id)}.
     * Alt+S Save & Close, Alt+N Save & New, Alt+R Clear, Ctrl+F Find. */
    function form(main, options) {
        var saving = false;

        function save(andNew) {
            if (saving || !options.onSave) {
                return;
            }
            saving = true;
            Promise.resolve(options.onSave(andNew)).then(function () {
                saving = false;
            }, function () {
                saving = false;
            });
        }

        function find() {
            if (!options.find) {
                return;
            }
            browse(options.find.model, options.find).then(function (record) {
                openRecord(options.find.model, record.id, record.rec_name);
            }, function () {});
        }

        function button(label, title, onclick, primary) {
            return el('button' + (primary ? '.primary' : ''), {type: 'button',
                title: title, onclick: onclick}, label);
        }

        var saveNew = button('Save & New', 'Save and start a new one ' +
            '(Alt+N)', function () {
                save(true);
            });
        var saveClose = button('Save & Close', 'Save and close (Alt+S)',
            function () {
                save(false);
            }, true);
        var extraButtons = {};

        var ribbon = el('div.ribbon', {role: 'toolbar', 'aria-label':
                options.title},
            el('span.ribbon-title', options.title),
            options.find ? button('Find', 'Find a previous one (Ctrl+F)',
                find) : null,
            (options.extra || []).map(function (item) {
                extraButtons[item.label] = button(item.label,
                    item.title || item.label, item.onclick);
                return extraButtons[item.label];
            }),
            el('span.spacer'),
            options.onClear ? button('Clear', 'Clear the form (Alt+R)',
                options.onClear) : null,
            options.onSave ? saveNew : null,
            options.onSave ? saveClose : null);

        var body = el('div.form-main');
        var side = el('aside.history', {'aria-label': 'History'});
        var layout = el('div.form-layout' + (options.kind ? '' :
            '.no-history'), body, options.kind ? side : null);
        main.appendChild(ribbon);
        main.appendChild(layout);

        if (options.kind) {
            side.appendChild(el('p.muted', 'Choose a ' + options.kind +
                ' to see their balance and recent transactions.'));
        }

        global.document.addEventListener('keydown', function (event) {
            if (!ribbon.isConnected) {
                return;
            }
            var key = event.key.toLowerCase();
            if (event.altKey && key === 's') {
                event.preventDefault();
                if (!saveClose.hidden) {
                    save(false);
                }
            } else if (event.altKey && key === 'n') {
                event.preventDefault();
                if (!saveNew.hidden) {
                    save(true);
                }
            } else if (event.altKey && key === 'r' && options.onClear) {
                event.preventDefault();
                options.onClear();
            } else if ((event.ctrlKey || event.metaKey) && key === 'f' &&
                    options.find) {
                event.preventDefault();
                find();
            } else if ((event.ctrlKey || event.metaKey) && key === 's' &&
                    options.onSaveStay && !saveClose.hidden) {
                /* Jobshop's File > Save (Ctrl+S): saved, the window stays
                 * on the record */
                event.preventDefault();
                if (!saving) {
                    saving = true;
                    Promise.resolve(options.onSaveStay()).then(function () {
                        saving = false;
                    }, function () {
                        saving = false;
                    });
                }
            } else if (key === 'f5' && !event.shiftKey && options.onRefresh) {
                /* File > Refresh (F5): back to the saved record */
                event.preventDefault();
                options.onRefresh();
            } else if ((event.ctrlKey || event.metaKey) && key === 'p' &&
                    extraButtons.Print && !extraButtons.Print.hidden) {
                event.preventDefault();
                extraButtons.Print.click();
            } else if (key === 'delete' && options.onDelete &&
                    extraButtons.Delete && !extraButtons.Delete.hidden &&
                    !/^(INPUT|SELECT|TEXTAREA)$/.test(
                        (global.document.activeElement || {}).tagName ||
                        '') && !global.document.querySelector('.overlay')) {
                /* Edit > Delete (Del) outside a field */
                event.preventDefault();
                options.onDelete();
            }
        });

        /* The history panel: balance and recent transactions */
        function showParty(id) {
            if (!options.kind) {
                return;
            }
            if (!id) {
                UI.clear(side).appendChild(el('p.muted', 'Choose a ' +
                    options.kind + '.'));
                return;
            }
            global.Rpc.desk('party_center', [id, options.kind]).then(
                function (data) {
                    UI.clear(side);
                    side.appendChild(el('h3', data.name));
                    side.appendChild(el('div.history-balance',
                        el('span.muted', 'Open balance'),
                        el('strong', UI.money(data.balance, true))));
                    side.appendChild(el('h4', 'Recent transactions'));
                    var list = el('ul.history-list');
                    data.transactions.slice(0, 8).forEach(function (t) {
                        var model = t.type === 'payment' ? 'account.payment' :
                            'account.invoice';
                        list.appendChild(el('li', el('a', {href: '#',
                            onclick: function (event) {
                                event.preventDefault();
                                openRecord(model, t.id, t.number);
                            }}, UI.date(t.date) + ' ' + t.type + ' ' +
                                (t.number || '')),
                            el('span.num', UI.money(t.amount))));
                    });
                    if (!data.transactions.length) {
                        list.appendChild(el('li.muted', 'None yet.'));
                    }
                    side.appendChild(list);
                    side.appendChild(el('a', {href: '#/' + (options.kind ===
                        'customer' ? 'customers' : 'vendors')},
                        options.kind === 'customer' ? 'Customer Center' :
                            'Vendor Center'));
                }, function () {
                    UI.clear(side);
                });
        }

        /* Show only what the user may do: canSave false hides the save
         * buttons, hidden the extra buttons of these labels */
        var hiddenByAllow = {};
        function allow(canSave, hidden) {
            saveNew.hidden = saveClose.hidden = !canSave;
            Object.keys(extraButtons).forEach(function (label) {
                var button = extraButtons[label];
                if ((hidden || []).indexOf(label) >= 0) {
                    if (!button.hidden) {
                        hiddenByAllow[label] = true;
                        button.hidden = true;
                    }
                } else if (hiddenByAllow[label]) {
                    /* Shown again only what this hid: a button the screen
                     * hid itself stays hidden */
                    delete hiddenByAllow[label];
                    button.hidden = false;
                }
            });
        }

        return {body: body, ribbon: ribbon, showParty: showParty,
            allow: allow};
    }

    /* ---- The line grid ------------------------------------------------ */

    /* grid({columns: [{key, label, width, kind: 'text'|'money'|'number'|
     * 'date'|'check'|'picker'|'computed', picker: {model, domain,
     * placeholder, fields,
     * onselect(record, controls)}, compute(values) -> number}], total: key,
     * onchange(total)}) -> {node, rows(), total(), addRow(values), clear()}.
     * A row is a {key: control}; the last column's Enter adds a row. */
    function grid(options) {
        var columns = options.columns;
        var lastAmount = columns.filter(function (c) {
            return c.kind === 'money' || c.kind === 'number';
        }).pop();
        var body = el('tbody');
        var totalCell = el('td.num', '0.00');
        var rows = [];

        function value(control, column) {
            if (column.kind === 'computed') {
                return control.amount || 0;
            }
            if (column.kind === 'picker') {
                return control.value();
            }
            if (column.kind === 'money' || column.kind === 'number') {
                return UI.parseMoney(control.value);
            }
            if (column.kind === 'check') {
                return control.checked;
            }
            if (column.kind === 'date') {
                return control.value || null;
            }
            return control.value;
        }

        function update() {
            rows.forEach(function (row) {
                columns.forEach(function (column) {
                    if (column.kind !== 'computed') {
                        return;
                    }
                    var values = {};
                    columns.forEach(function (c) {
                        if (c.kind !== 'computed') {
                            values[c.key] = value(row.controls[c.key], c);
                        }
                    });
                    var control = row.controls[column.key];
                    control.amount = column.compute(values) || 0;
                    control.textContent = control.amount ?
                        UI.money(control.amount) : '';
                });
            });
            var sum = total();
            totalCell.textContent = UI.money(sum);
            if (options.onchange) {
                options.onchange(sum);
            }
        }

        function total() {
            if (!options.total) {
                return 0;
            }
            var column = columns.filter(function (c) {
                return c.key === options.total;
            })[0];
            return rows.reduce(function (sum, row) {
                return sum + value(row.controls[options.total], column);
            }, 0);
        }

        function addRow(values) {
            var row = {controls: {}, edited: false};
            var marker = el('td.marker', {title: 'New line'}, '+');
            var cells = columns.map(function (column, index) {
                var control;
                if (column.kind === 'computed') {
                    control = el('span');
                    row.controls[column.key] = control;
                    return el('td.num', {style: column.width ? {width:
                        column.width} : null}, control);
                } else if (column.kind === 'picker') {
                    control = UI.picker(column.picker.model, Object.assign({
                        label: column.label}, column.picker, {
                            onselect: function (record) {
                                if (!row.edited) {
                                    row.edited = true;
                                    marker.textContent = '✎';
                                }
                                if (column.picker.onselect) {
                                    column.picker.onselect(record,
                                        row.controls);
                                }
                                update();
                            }}));
                } else if (column.kind === 'money') {
                    control = UI.moneyInput({'aria-label': column.label});
                } else if (column.kind === 'date' || column.kind ===
                        'check') {
                    control = el('input', {type: column.kind === 'date' ?
                        'date' : 'checkbox', 'aria-label': column.label});
                } else {
                    control = el('input', {type: 'text', 'aria-label':
                        column.label, inputmode: column.kind === 'number' ?
                        'decimal' : null});
                    if (column.kind === 'number') {
                        control.classList.add('money');
                    }
                }
                row.controls[column.key] = control;
                if (column.default !== undefined) {
                    if (column.kind === 'check') {
                        control.checked = !!column.default;
                    } else {
                        control.value = column.default;
                    }
                }
                var input = control.input || control;
                input.addEventListener('input', function () {
                    if (!row.edited) {
                        row.edited = true;
                        marker.textContent = '✎';
                        marker.title = 'Edited';
                    }
                    if (column.kind === 'money' || column.kind ===
                            'number') {
                        update();
                    }
                });
                input.addEventListener('keydown', function (event) {
                    if (event.key !== 'Enter' || event.defaultPrevented) {
                        return;
                    }
                    event.preventDefault();
                    var next = columns.slice(index + 1).filter(function (c) {
                        return c.kind !== 'computed';
                    })[0];
                    if (next) {
                        var target = row.controls[next.key];
                        (target.input || target).focus();
                    } else {
                        var after = rows[rows.indexOf(row) + 1] ||
                            addRow();
                        var first = after.controls[columns[0].key];
                        (first.input || first).focus();
                    }
                });
                if (column.kind === 'money' || column.kind === 'number') {
                    input.addEventListener('blur', function () {
                        update();
                        /* A filled last line gets a new one after it */
                        var key = options.total || column.key;
                        if (column === lastAmount &&
                                rows[rows.length - 1] === row &&
                                value(row.controls[key], columns.filter(
                                    function (c) {
                                        return c.key === key;
                                    })[0])) {
                            addRow();
                        }
                    });
                }
                return el('td', {style: column.width ? {width:
                    column.width} : null}, control.node || control);
            });
            var tr = el('tr', marker, cells, el('td.row-delete',
                el('button', {type: 'button', title: 'Delete line',
                    'aria-label': 'Delete line', onclick: function () {
                        rows.splice(rows.indexOf(row), 1);
                        tr.remove();
                        if (!rows.length) {
                            addRow();
                        }
                        update();
                    }}, '✕')));
            row.tr = tr;
            Object.keys(values || {}).forEach(function (key) {
                var control = row.controls[key];
                var v = values[key];
                if (control && control.set) {
                    control.set(v.id, v.rec_name);
                } else if (control && control.type === 'checkbox') {
                    control.checked = !!v;
                } else if (control) {
                    control.value = v === null || v === undefined ? '' :
                        control.type === 'date' ? String(v).slice(0, 10) : v;
                }
            });
            rows.push(row);
            body.appendChild(tr);
            if (values) {
                update();
            }
            return row;
        }

        addRow();
        var totalIndex = columns.map(function (c) {
            return c.key;
        }).indexOf(options.total);
        return {
            node: el('div.table-wrap', el('table.data.lines',
                el('thead', el('tr', el('th.marker', ''), columns.map(
                    function (c) {
                        return el('th' + (c.kind === 'money' ||
                            c.kind === 'number' ? '.num' : ''), c.label);
                    }), el('th', ''))), body,
                options.total ? el('tfoot', el('tr', el('td', {colspan:
                    totalIndex + 1}, 'Total'), totalCell, el('td',
                    {colspan: columns.length - totalIndex}, ''))) :
                    null)),
            update: update,
            /* The lines with a value in a column of options.required (the
             * total column by default), as {key: value} */
            rows: function () {
                var required = options.required || options.total;
                return rows.filter(function (row) {
                    if (!required) {
                        return true;
                    }
                    var column = columns.filter(function (c) {
                        return c.key === required;
                    })[0];
                    return value(row.controls[required], column);
                }).map(function (row) {
                    var result = {};
                    columns.forEach(function (column) {
                        result[column.key] = value(row.controls[column.key],
                            column);
                    });
                    return result;
                });
            },
            controls: function () {
                return rows.map(function (row) {
                    return row.controls;
                });
            },
            total: total,
            addRow: addRow,
            clear: function () {
                rows.slice().forEach(function (row) {
                    row.tr.remove();
                });
                rows.length = 0;
                addRow();
                update();
            }
        };
    }

    /* ---- The center ---------------------------------------------------- */

    /* center(main, {title, list(text) -> Promise [{id, name, amount}],
     * amountLabel, detail(id, pane), actions: [{label, route}]}) */
    function center(main, options) {
        var search = el('input', {type: 'text', placeholder: 'Search',
            'aria-label': 'Search'});
        var list = el('div.party-list', {role: 'listbox', 'aria-label':
            options.title});
        var detail = el('div.center-detail', el('p.muted',
            options.empty || 'Choose one on the left.'));
        main.appendChild(el('div.ribbon', el('span.ribbon-title',
            options.title), el('span.spacer'),
            (options.actions || []).map(function (action) {
                return el('button', {type: 'button', onclick: function () {
                    openScreen(action.route);
                }}, action.label);
            })));
        main.appendChild(el('div.center', el('div.panel.center-list',
            search, el('div.center-head', el('span', 'Name'),
                el('span', options.amountLabel || 'Balance')), list),
            detail));
        var activeId = null;

        function load() {
            options.list(search.value.trim()).then(function (rows) {
                UI.clear(list);
                rows.forEach(function (row) {
                    list.appendChild(el('div.party-row' + (row.id ===
                        activeId ? '.active' : ''), {
                        role: 'option',
                        tabindex: 0,
                        onclick: function () {
                            choose(row.id, this);
                        },
                        onkeydown: function (event) {
                            if (event.key === 'Enter') {
                                choose(row.id, this);
                            }
                        }
                    }, el('span', row.name), el('span.num',
                        UI.money(row.amount))));
                });
                if (!rows.length) {
                    list.appendChild(el('p.muted', 'Nothing found.'));
                }
            }, UI.showError);
        }

        function choose(id, node) {
            activeId = id;
            list.querySelectorAll('.active').forEach(function (n) {
                n.classList.remove('active');
            });
            node.classList.add('active');
            options.detail(id, UI.clear(detail));
        }

        var timer;
        search.addEventListener('input', function () {
            global.clearTimeout(timer);
            timer = global.setTimeout(load, 250);
        });
        load();
        return {reload: load};
    }

    /* ---- The report viewer ------------------------------------------- */

    var PERIODS = [
        ['this-month', 'This Month'], ['last-month', 'Last Month'],
        ['this-quarter', 'This Quarter'], ['this-year', 'This Year'],
        ['last-year', 'Last Year'], ['all', 'All'], ['custom', 'Custom']];

    function iso(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,
            '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function period(name) {
        var now = new Date(), y = now.getFullYear(), m = now.getMonth();
        var q = Math.floor(m / 3) * 3;
        switch (name) {
            case 'this-month':
                return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
            case 'last-month':
                return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
            case 'this-quarter':
                return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))];
            case 'this-year':
                return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
            case 'last-year':
                return [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11,
                    31))];
            default:
                return ['', ''];
        }
    }

    function csvValue(v) {
        v = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(v) ? '"' + v.split('"').join('""') + '"' : v;
    }

    /* report(main, {name, title, dates: 'range'|'asof'|'none', period,
     * params}): the QuickBooks report window: Dates, Refresh, Print, Export
     * (CSV); double-click a row to see its detail (QuickZoom) */
    function report(main, options) {
        var range = options.dates !== 'asof' && options.dates !== 'none';
        var choice = el('select', {'aria-label': 'Dates'}, PERIODS.filter(
            function (p) {
                return range || p[0] !== 'all';
            }).map(function (p) {
                return el('option', {value: p[0]}, p[1]);
            }));
        var from = el('input', {type: 'date', 'aria-label': 'From'});
        var to = el('input', {type: 'date', 'aria-label': 'To'});
        var head = el('div.report-head');
        var table = el('table.data.report');
        var data = null;
        choice.value = options.period || (range ? 'this-year' : 'custom');

        function setPeriod() {
            if (choice.value === 'custom') {
                if (!range && !to.value) {
                    to.value = UI.today();
                }
                return;
            }
            var dates = period(choice.value);
            from.value = dates[0];
            to.value = range ? dates[1] : (dates[1] || UI.today());
        }

        function load() {
            global.Rpc.desk('report', [options.name, Object.assign({
                from_date: range ? from.value || null : null,
                to_date: to.value || null}, options.params || {})]).then(
                function (result) {
                    data = result;
                    setTitle(data.title);
                    render();
                }, UI.showError);
        }

        function render() {
            UI.clear(head).appendChild(el('div.report-company',
                global.Rpc.context()['company.rec_name'] || ''));
            head.appendChild(el('div.report-title', data.title));
            head.appendChild(el('div.report-subtitle', data.subtitle || ''));
            UI.clear(table);
            table.appendChild(el('thead', el('tr', el('th', ''),
                data.columns.map(function (c) {
                    return el('th' + (c.money ? '.num' : ''), c.label);
                }))));
            var body = el('tbody');
            data.rows.forEach(function (row) {
                body.appendChild(el('tr' + (row.total ? '.total' : '') +
                    (row.drill ? '.drill' : ''), {
                    title: row.drill ? 'Double-click to see the detail' :
                        null,
                    ondblclick: function () {
                        drill(row.drill, row.label);
                    }}, el('td', {style: {paddingLeft: (8 + row.level * 18) +
                        'px'}}, row.label),
                    row.values.map(function (v, i) {
                        var c = data.columns[i] || {};
                        return el('td' + (c.money ? '.num' : ''), c.money ?
                            UI.money(v) : v === null || v === undefined ?
                            '' : String(v));
                    })));
            });
            if (!data.rows.length) {
                body.appendChild(el('tr', el('td', {colspan:
                    data.columns.length + 1}, 'Nothing to report.')));
            }
            table.appendChild(body);
        }

        function drill(target, label) {
            if (!target) {
                return;
            }
            if (target.type === 'account') {
                openScreen('accounts/' + target.id, label);
            } else if (target.type === 'party') {
                openRecord('party.party', target.id, label);
            } else if (target.type === 'record') {
                openRecord(target.model, target.id, label);
            } else if (target.type === 'screen') {
                openScreen(target.route, label);
            }
        }

        function csv() {
            if (!data) {
                return;
            }
            var lines = [[''].concat(data.columns.map(function (c) {
                return c.label;
            })).map(csvValue).join(',')];
            data.rows.forEach(function (row) {
                lines.push([new Array(row.level + 1).join('  ') + row.label]
                    .concat(row.values).map(csvValue).join(','));
            });
            var link = el('a', {href: global.URL.createObjectURL(new Blob(
                [lines.join('\r\n')], {type: 'text/csv'})), download:
                data.title.replace(/\W+/g, '_') + '.csv'});
            global.document.body.appendChild(link);
            link.click();
            link.remove();
        }

        choice.addEventListener('change', function () {
            setPeriod();
            load();
        });
        [from, to].forEach(function (input) {
            input.addEventListener('change', function () {
                choice.value = 'custom';
                load();
            });
        });
        main.appendChild(el('div.ribbon', {role: 'toolbar'},
            el('span.ribbon-title', options.title),
            options.dates === 'none' ? null :
                el('label.ribbon-field', 'Dates ', choice),
            range ? el('label.ribbon-field', 'From ', from) : null,
            options.dates === 'none' ? null :
                el('label.ribbon-field', range ? 'To ' : 'As of ', to),
            el('span.spacer'),
            el('button', {type: 'button', onclick: load}, 'Refresh'),
            el('button', {type: 'button', onclick: function () {
                global.print();
            }}, 'Print'),
            el('button', {type: 'button', onclick: csv}, 'Export')));
        main.appendChild(el('div.report-page', head, table));
        setPeriod();
        load();
        return {reload: load};
    }

    /* ---- The maintenance window (Jobshop) ------------------------------ */

    /* The control of a field of a master: {node, get(), set(value)};
     * field: {name, label, type: 'char'|'text'|'integer'|'float'|'money'|
     * 'boolean'|'date'|'selection'|'many2one', options: [[value, label]],
     * model, domain, readonly, span} */
    function fieldControl(f) {
        var input, get, set;
        var attrs = {'aria-label': f.label};
        if (f.readonly) {
            attrs.readonly = true;
            attrs.disabled = f.type === 'boolean' || f.type === 'selection' ?
                true : null;
        }
        if (f.type === 'many2one') {
            var picker = UI.picker(f.model, {label: f.label, placeholder:
                f.placeholder || '', domain: f.domain});
            if (f.readonly) {
                picker.input.readOnly = true;
            }
            return {
                node: picker.node,
                get: function () {
                    return picker.value();
                },
                set: function (value) {
                    if (value && typeof value === 'object') {
                        picker.set(value.id, value.rec_name);
                    } else {
                        picker.set(null, '');
                    }
                },
                picker: picker
            };
        }
        if (f.type === 'boolean') {
            input = el('input', Object.assign({type: 'checkbox'}, attrs));
            get = function () {
                return input.checked;
            };
            set = function (value) {
                input.checked = !!value;
            };
        } else if (f.type === 'selection') {
            input = el('select', attrs, (f.options || []).map(function (o) {
                return el('option', {value: o[0] === null ? '' : o[0]},
                    o[1]);
            }));
            get = function () {
                return input.value === '' ? null : input.value;
            };
            set = function (value) {
                input.value = value === null || value === undefined ? '' :
                    value;
            };
        } else if (f.type === 'radio') {
            /* Jobshop's radio group (layout type3): options [[value,
             * label]], one under the other (f.inline: side by side) */
            var group = 'r' + Math.random().toString(36).slice(2);
            var radios = (f.options || []).map(function (o) {
                return el('input', {type: 'radio', name: group, value:
                    o[0] === null ? '' : o[0], disabled: f.readonly ? true :
                    null});
            });
            input = el('div.js-radio' + (f.inline ? '.inline' : ''), {role:
                'radiogroup', 'aria-label': f.label}, radios.map(
                function (r, i) {
                    return el('label', r, ' ' + f.options[i][1]);
                }));
            get = function () {
                var on = radios.filter(function (r) {
                    return r.checked;
                })[0];
                return on && on.value !== '' ? on.value : null;
            };
            set = function (value) {
                radios.forEach(function (r) {
                    r.checked = r.value === (value === null || value ===
                        undefined ? '' : String(value));
                });
            };
        } else if (f.type === 'text') {
            input = el('textarea', Object.assign({rows: f.rows || 4}, attrs));
            get = function () {
                return input.value || null;
            };
            set = function (value) {
                input.value = value || '';
            };
        } else if (f.type === 'money') {
            input = UI.moneyInput(attrs);
            get = function () {
                return input.value === '' ? null :
                    global.Rpc.decimal(UI.parseMoney(input.value));
            };
            set = function (value) {
                input.value = value === null || value === undefined ? '' :
                    UI.money(value);
            };
        } else {
            input = el('input', Object.assign({type: f.type === 'date' ?
                'date' : f.type === 'time' ? 'time' : 'text'}, attrs));
            if (f.type === 'integer' || f.type === 'float' ||
                    f.type === 'decimal') {
                input.classList.add('money');
            }
            get = function () {
                if (input.value === '') {
                    return null;
                }
                if (f.type === 'integer') {
                    return parseInt(input.value, 10);
                }
                if (f.type === 'float') {
                    return parseFloat(input.value);
                }
                if (f.type === 'decimal') {
                    return global.Rpc.decimal(input.value);
                }
                if (f.type === 'date') {
                    return global.Rpc.date(input.value);
                }
                if (f.type === 'time') {
                    /* Tryton's encoding of a datetime.time */
                    var hm = input.value.split(':');
                    return {__class__: 'time', hour: parseInt(hm[0], 10),
                        minute: parseInt(hm[1], 10), second: 0,
                        microsecond: 0};
                }
                return input.value;
            };
            set = function (value) {
                input.value = value === null || value === undefined ? '' :
                    f.type === 'date' ? String(value).slice(0, 10) : value;
            };
        }
        return {node: input, get: get, set: set};
    }

    /* The fields to read for a list of field definitions */
    function readFields(fields) {
        var names = [];
        fields.forEach(function (f) {
            if (f.type === 'many2one') {
                names.push(f.name, f.name + '.rec_name');
            } else if (f.name) {
                names.push(f.name);
            }
        });
        return names;
    }

    /* The value of a read many2one: {id, rec_name} */
    function m2o(record, name) {
        var id = record[name];
        var related = record[name + '.'];
        if (!id) {
            return null;
        }
        return {id: id, rec_name: related ? related.rec_name : String(id)};
    }

    /* master(main, {title, model, label (of the ID), domain, order,
     * tabs: [{title, fields: [...]} | {title, lines: {model, inverse,
     * fields: [...]}} | {title, render(pane, record)}], browse: [columns],
     * defaults, writes (false: read-only window)}): the Jobshop window: ID
     * with "..." lookup (blank ID = new), tabs, the Browse tab last, Save,
     * Clear, Copy, Delete; Browse rows open with a double-click */
    /* Jobshop's window layout (its Layouts\*.vml): a field placed with
     * at: [left, top, right, bottom] in Jobshop's units, its label inside
     * that box (split: the label's width, default 120; 0 = no label), a
     * check box with its caption on the right; tab.frames [{label, at}] are
     * Jobshop's group boxes, tab.buttons [{label, at, onclick}] its buttons.
     * Fields without at follow in the usual grid below. The units scale
     * with the pane's width (--u px per unit). */
    function jobshopPlaced(tab) {
        return (tab.fields || []).some(function (f) {
            return f.at;
        });
    }

    function placedForm(tab, makeControl) {
        var box = el('div.js-layout');
        var rest = el('div.grid-form');
        var bottom = 0, right = 0;
        function place(at) {
            bottom = Math.max(bottom, at[3]);
            right = Math.max(right, at[2]);
            return {left: 'calc(var(--u) * ' + at[0] + ')',
                top: 'calc(var(--u) * ' + at[1] + ')',
                width: 'calc(var(--u) * ' + (at[2] - at[0]) + ')',
                height: 'calc(var(--u) * ' + (at[3] - at[1]) + ')'};
        }
        (tab.frames || []).forEach(function (fr) {
            box.appendChild(el('fieldset.js-frame', {style: place(fr.at)},
                el('legend', fr.label)));
        });
        (tab.fields || []).forEach(function (f) {
            var c = makeControl(f);
            if (!f.at) {
                rest.appendChild(el('div', f.span ? {style: {gridColumn:
                    'span ' + f.span}} : null, el('label.field', f.label),
                    c.node));
                return;
            }
            var check = f.type === 'boolean';
            var split = f.split === undefined ? 120 : f.split;
            var label = f.label && (check || split) ? el('label.js-label',
                check ? null : {style: {width: 'calc(var(--u) * ' + split +
                    ')'}}, f.label) : null;
            var node = el('div.js-ctl' + (check ? '.js-check' : '') +
                (f.type === 'text' || f.type === 'radio' ? '.js-multi' :
                    ''), {style: place(f.at),
                title: f.help || ''}, check ? [c.node, label] : [label,
                c.node]);
            box.appendChild(node);
        });
        (tab.buttons || []).forEach(function (b) {
            box.appendChild(el('button.js-btn', {type: 'button', style:
                place(b.at), onclick: b.onclick}, b.label));
        });
        box.style.height = 'calc(var(--u) * ' + (bottom + 8) + ')';
        function scale() {
            var width = box.clientWidth || box.parentNode &&
                box.parentNode.clientWidth || 0;
            if (width) {
                box.style.setProperty('--u', Math.max(1.25, Math.min(1.9,
                    (width - 8) / (right + 8))).toFixed(3) + 'px');
            }
        }
        scale();
        global.addEventListener('resize', scale);
        /* (the pane is hidden until its tab shows: measure then) */
        if (global.ResizeObserver) {
            new global.ResizeObserver(scale).observe(box);
        }
        return rest.children.length ? el('div', box, rest) : box;
    }

    function master(main, options) {
        var record = null;
        var controls = {};
        var lineTabs = [];
        var allFields = [];
        var id = UI.picker(options.model, {label: options.label || 'ID',
            placeholder: options.label || 'ID', domain: options.domain,
            order: options.order,
            /* The lookup: Jobshop's columns for the table, else this
             * window's Browse columns */
            lookupColumns: lookupSpec(options.model, options.domain) ?
                undefined : options.browse, lookupTitle: lookupSpec(
                options.model, options.domain) ? undefined :
                options.title + 's',
            onselect: function (r) {
                load(r.id);
            }});
        var status = el('span.muted', 'New');
        var tabBar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');

        function save(andNew) {
            var values = {};
            Object.keys(controls).forEach(function (name) {
                var c = controls[name];
                if (!c.field.readonly) {
                    values[name] = c.get();
                }
            });
            lineTabs.forEach(function (t) {
                values[t.name] = t.changes();
            });
            /* Jobshop's ID field (options.idField): typed in the lookup
             * itself for a new record */
            if (options.idField && !controls[options.idField] && !record &&
                    id.input.value.trim()) {
                values[options.idField] = id.input.value.trim();
            }
            /* beforeSave may change the values, or return a promise (a
             * Jobshop "Continue?" question): rejected, nothing is saved */
            var ready;
            try {
                ready = Promise.resolve(options.beforeSave ?
                    options.beforeSave(values, record) : null);
            } catch (error) {
                ready = Promise.reject(error);
            }
            var call = ready.then(function (changed) {
                values = changed || values;
                return record ? global.Rpc.model(options.model, 'write',
                    [[record.id], values]).then(function () {
                        return record.id;
                    }) : global.Rpc.model(options.model, 'create', [[
                        Object.assign({}, options.defaults || {}, values)]])
                    .then(function (ids) {
                        return ids[0];
                    });
            });
            return call.then(function (newId) {
                return Promise.resolve(options.afterSave ?
                    options.afterSave(newId) : null).then(function () {
                        return newId;
                    });
            }).then(function (newId) {
                UI.toast(options.title + ' saved', 'ok');
                if (andNew) {
                    clear();
                } else {
                    load(newId);
                }
                if (browseLoaded) {
                    browseLoad();
                }
            }, function (error) {
                /* (a beforeSave that declined: no message) */
                if (error !== undefined && error !== null && error !==
                        false) {
                    UI.showError(error);
                }
            });
        }

        /* What the user may do on the model (Tryton's access: roles, the
         * work order options...): the rest is not shown */
        var access = {create: true, write: true, delete: true};

        function lock() {
            var editable = record ? access.write : access.create;
            Object.keys(controls).forEach(function (name) {
                var c = controls[name];
                Array.prototype.forEach.call(c.node.querySelectorAll(
                    'input, select, textarea, button'), function (node) {
                    node.disabled = !editable || Boolean(c.field.readonly);
                });
            });
            if (form.allow) {
                form.allow(editable, [].concat(
                    access.create ? [] : ['Copy'],
                    access.delete && record ? [] : ['Delete']));
            }
        }

        function clear() {
            record = null;
            id.set(null, '');
            status.textContent = access.create ? 'New' : '';
            Object.keys(controls).forEach(function (name) {
                var c = controls[name];
                c.set(c.field.default !== undefined ? c.field.default : null);
            });
            lineTabs.forEach(function (t) {
                t.set([]);
            });
            customTabs.forEach(function (t) {
                UI.clear(t.pane).appendChild(el('p.muted',
                    'Save or choose one first.'));
            });
            lock();
        }

        function load(recordId) {
            global.Rpc.model(options.model, 'read', [[recordId],
                readFields(allFields).concat(['rec_name'],
                    options.idField && !controls[options.idField] ?
                        [options.idField] : [])]).then(
                function (rows) {
                    record = rows[0];
                    /* Jobshop shows the ID (idField), the name as its
                     * tooltip */
                    id.set(record.id, options.idField &&
                        record[options.idField] ? record[options.idField] :
                        record.rec_name);
                    if (options.idField) {
                        id.input.title = record.rec_name;
                    }
                    status.textContent = '';
                    Object.keys(controls).forEach(function (name) {
                        var c = controls[name];
                        c.set(c.field.type === 'many2one' ? m2o(record,
                            name) : record[name]);
                    });
                    lineTabs.forEach(function (t) {
                        t.load(record.id);
                    });
                    customTabs.forEach(function (t) {
                        t.render(UI.clear(t.pane), record);
                    });
                    if (options.onload) {
                        options.onload(record);
                    }
                    lock();
                }, UI.showError);
        }

        function copy() {
            if (!record) {
                return;
            }
            /* Jobshop's Save As: a copy needs its own ID */
            if (options.idField) {
                var input = el('input', {type: 'text', 'aria-label':
                    'New ' + (options.label || 'ID'),
                    maxlength: options.idLength || null});
                UI.modal('Save As', [el('label.field', 'New ' +
                    (options.label || 'ID')), input], [
                    {label: 'Cancel'},
                    {label: 'OK', primary: true, onclick: function () {
                        var value = input.value.trim();
                        if (!value) {
                            input.focus();
                            return true;
                        }
                        var defaults = {};
                        defaults[options.idField] = value;
                        copyWith(defaults);
                    }}]);
                return;
            }
            copyWith({});
        }

        function copyWith(defaults) {
            global.Rpc.model(options.model, 'copy', [[record.id],
                defaults]).then(function (ids) {
                    UI.toast(options.title + ' copied', 'ok');
                    load(ids[0]);
                }, UI.showError);
        }

        function remove() {
            if (!record) {
                return;
            }
            UI.confirm('Delete', 'Delete ' + record.rec_name + '?').then(
                function (ok) {
                    if (!ok) {
                        return;
                    }
                    global.Rpc.model(options.model, 'delete', [[record.id]])
                        .then(function () {
                            UI.toast('Deleted', 'ok');
                            clear();
                            if (browseLoaded && preference(
                                    'autoRefreshBrowse', true)) {
                                browseLoad();
                            }
                        }, UI.showError);
                });
        }

        var writes = options.writes !== false;
        var extra = (options.extra || []).map(function (item) {
            return {label: item.label, onclick: function () {
                item.onclick(record, load);
            }};
        });
        if (writes && !options.single) {
            extra = extra.concat([{label: 'Copy', onclick: copy},
                {label: 'Delete', onclick: remove}]);
        }
        if (options.print) {
            /* File > Print: the window's report of the record */
            extra.unshift({label: 'Print', onclick: function () {
                if (record) {
                    global.Rpc.report(options.print, [record.id]).then(
                        function (r) {
                            UI.openReport(r, options.title);
                        }, UI.showError);
                }
            }});
        }
        var form = UI.form(main, {title: options.title, extra: extra,
            onClear: clear, onSave: writes ? function (andNew) {
                return save(andNew);
            } : null, onSaveStay: writes ? function () {
                return save(false);
            } : null, onRefresh: function () {
                if (record) {
                    load(record.id);
                }
                if (browseLoaded) {
                    browseLoad();
                }
            }, onDelete: writes && !options.single ? remove : null});
        main = form.body;

        /* Browse > First / Previous / Next / Last: through the records in
         * the window's order */
        function step(where) {
            global.Rpc.model(options.model, 'search', [options.domain || [],
                0, null, options.order || null]).then(function (ids) {
                    if (!ids.length) {
                        return;
                    }
                    var at = record ? ids.indexOf(record.id) : -1;
                    var to = where === 'first' ? 0 : where === 'last' ?
                        ids.length - 1 : where === 'next' ?
                        Math.min(ids.length - 1, at + 1) :
                        Math.max(0, at < 0 ? ids.length - 1 : at - 1);
                    load(ids[to]);
                }, UI.showError);
        }
        /* (the owner wants no record navigation buttons: options.nav true
         * to show them) */
        var nav = !options.nav ? null : el('span.record-nav',
            [['first', '⏮', 'First record'], ['previous', '◀',
                'Previous record'], ['next', '▶', 'Next record'],
                ['last', '⏭', 'Last record']].map(function (b) {
                return el('button', {type: 'button', title: b[2],
                    'aria-label': b[2], onclick: function () {
                        step(b[0]);
                    }}, b[1]);
            }));
        /* options.idAt: the ID lookup sits in the first tab where Jobshop
         * has it (no header bar above the tabs) */
        if (!options.idAt) {
            main.appendChild(el('div.panel.master-head',
                el('label.field', options.label || 'ID'), id.node, status,
                nav));
        }

        var customTabs = [];
        var tabs = (options.tabs || []).map(function (tab) {
            /* The tabs every Jobshop window has */
            if (tab.picture) {
                return {title: tab.title || 'Picture', render: function (pane,
                        r) {
                    pictureTab(pane, options.model, r.id, writes);
                }};
            }
            if (tab.notes) {
                return {title: tab.title || 'Notes', render: function (pane,
                        r) {
                    notesTab(pane, options.model, r.id, writes);
                }};
            }
            return tab;
        }).concat(options.browse ? [{
            title: 'Browse', browse: options.browse}] : []);

        function show(index) {
            Array.prototype.forEach.call(tabBar.children, function (b, i) {
                b.classList.toggle('active', i === index);
                b.setAttribute('aria-selected', i === index);
            });
            Array.prototype.forEach.call(panes.children, function (p, i) {
                p.hidden = i !== index;
            });
            if (tabs[index].browse && !browseLoaded) {
                browseLoad();
            }
        }

        var browseLoaded = false;
        var browseTools = null;
        var browseBody = el('tbody');
        var browseSearch = el('input', {type: 'text', placeholder:
            'Search (* for any text)', 'aria-label': 'Search'});
        /* Jobshop's Browse "Show All" (the inactive records too) */
        var browseAll = options.browseShowAll ? el('input', {type:
            'checkbox', onchange: function () {
                browseLoad();
            }}) : null;

        function browseLoad() {
            browseLoaded = true;
            var domain = (options.domain || []).slice();
            /* browseShowAll: true (Tryton's active) or {field} (a Jobshop
             * Inactive flag of the record's own, e.g. customer_inactive) */
            var inactiveField = options.browseShowAll &&
                options.browseShowAll.field;
            if (browseAll && browseAll.checked && !inactiveField) {
                /* (a domain on active turns Tryton's active test off) */
                domain.push(['active', 'in', [true, false]]);
            } else if (browseAll && !browseAll.checked && inactiveField) {
                domain.push([inactiveField, '!=', true]);
            }
            var text = jobshopLike(browseSearch.value);
            if (text) {
                domain.push(['rec_name', 'ilike', text]);
            }
            var columns = options.browse;
            /* Preferences: Maximum Browse Records to Load (0 = all) */
            var limit = preference('browseMaxRows', 1000) || null;
            global.Rpc.searchRead(options.model, domain, readFields(columns),
                {limit: limit, order: options.order}).then(function (rows) {
                    UI.clear(browseBody);
                    rows.forEach(function (row) {
                        browseBody.appendChild(el('tr', {title:
                            'Double-click to open', ondblclick: function () {
                                load(row.id);
                                show(0);
                            }}, columns.map(function (c) {
                                var v = c.type === 'many2one' ? (m2o(row,
                                    c.name) || {}).rec_name : readValue(row,
                                    c.name);
                                return el('td' + (c.type === 'money' ||
                                    c.type === 'float' ? '.num' : '') +
                                    (c.nowrap ? '.nowrap' : ''),
                                    c.type === 'money' ? UI.money(v) :
                                    c.type === 'date' ? UI.date(v) :
                                    c.labels ? (c.labels[v] || v || '') :
                                    c.type === 'boolean' ? (v ? '✔' :
                                        '') : v === null || v === undefined ?
                                    '' : String(v));
                            })));
                    });
                    if (browseTools) {
                        browseTools.apply();
                    }
                    if (limit && rows.length >= limit &&
                            preference('browseMaxRowsWarning', true)) {
                        UI.toast('Only the first ' + limit + ' records are ' +
                            'shown (File > Preferences)');
                    }
                }, UI.showError);
        }

        tabs.forEach(function (tab, index) {
            tabBar.appendChild(el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(index);
                }}, tab.title));
            var pane = el('div.tab-pane.panel', {role: 'tabpanel'});
            if (tab.fields && jobshopPlaced(tab)) {
                pane.appendChild(placedForm(tab, function (f) {
                    var c = fieldControl(f);
                    c.field = f;
                    controls[f.name] = c;
                    allFields.push(f);
                    return c;
                }));
            } else if (tab.fields) {
                var grid = el('div.grid-form');
                tab.fields.forEach(function (f) {
                    var c = fieldControl(f);
                    c.field = f;
                    controls[f.name] = c;
                    allFields.push(f);
                    grid.appendChild(el('div', f.span ? {style: {gridColumn:
                        'span ' + f.span}} : null, el('label.field', f.label),
                        c.node));
                });
                pane.appendChild(grid);
            } else if (tab.lines) {
                lineTabs.push(linesTab(pane, tab.lines));
            } else if (tab.browse) {
                var timer;
                browseSearch.addEventListener('input', function () {
                    global.clearTimeout(timer);
                    timer = global.setTimeout(browseLoad, 250);
                });
                pane.appendChild(el('div.toolbar', browseAll ? el('label',
                    browseAll, ' Show All') : null, el('div', {style: {width:
                    '320px'}}, browseSearch)));
                var browseTable = el('table.data', el('thead', el('tr',
                    tab.browse.map(function (c) {
                        return el('th', c.label);
                    }))), browseBody);
                pane.appendChild(el('div.table-wrap', browseTable));
                /* Jobshop's Browse tools (common.js): header sort, column
                 * sizes and order, the right-click filters, Browse Filter
                 * (Ctrl+B), Export */
                if (global.JobshopCommon && global.JobshopCommon.gridTools) {
                    browseTools = global.JobshopCommon.gridTools({table:
                        browseTable, key: 'browse.' + options.model, title:
                        options.title, columns: tab.browse});
                    browseTable.addEventListener('contextmenu', function (
                            event) {
                        if (event.shiftKey) {
                            return;
                        }
                        var tr = event.target.closest('tbody tr');
                        UI.contextMenu(event, [{label: 'Refresh Browse ' +
                            '(Shift+F5)', onclick: browseLoad}, '-'].concat(
                            browseTools.menuItems(tr, browseTools.columnAt(
                                event))));
                    });
                }
            } else if (tab.render) {
                customTabs.push({pane: pane, render: tab.render});
                pane.appendChild(el('p.muted', 'Save or choose one first.'));
            }
            if (tab.fields && tab.render) {
                /* Fields with a grid under them (a quote's lines on its
                 * Quote tab) */
                var below = el('div.tab-below');
                pane.appendChild(below);
                customTabs.push({pane: below, render: tab.render});
            }
            panes.appendChild(pane);
        });
        main.appendChild(tabBar);
        main.appendChild(panes);
        global.document.addEventListener('keydown', function (event) {
            if (!tabBar.isConnected || !options.browse) {
                return;
            }
            var key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 'b' &&
                    browseTools) {
                /* Browse > Browse Filter (Ctrl+B) */
                event.preventDefault();
                show(tabs.length - 1);
                browseTools.filterDialog();
            } else if (key === 'f5' && event.shiftKey) {
                /* Browse > Refresh Browse (Shift+F5) */
                event.preventDefault();
                browseLoad();
            }
        });
        if (options.idAt) {
            var layout = panes.firstChild && panes.firstChild.querySelector(
                '.js-layout');
            var at = options.idAt;
            var idBox = el('div.js-ctl.master-id', {style: {
                left: 'calc(var(--u) * ' + at[0] + ')',
                top: 'calc(var(--u) * ' + at[1] + ')',
                width: 'calc(var(--u) * ' + (at[2] - at[0]) + ')',
                height: 'calc(var(--u) * ' + (at[3] - at[1]) + ')'}},
                el('label.js-label', {style: {width: 'calc(var(--u) * ' +
                    (options.idSplit === undefined ? 120 :
                        options.idSplit) + ')'}}, options.label || 'ID'),
                id.node);
            if (layout) {
                layout.appendChild(idBox);
            } else {
                main.insertBefore(el('div.panel.master-head',
                    el('label.field', options.label || 'ID'), id.node,
                    status), tabBar);
            }
        }
        show(0);
        clear();
        if (options.open) {
            load(options.open);
        }
        global.Rpc.model('ir.model.access', 'get_access', [[options.model]])
            .then(function (result) {
                var a = result[options.model] || {};
                access = {create: a.create !== false && writes,
                    write: a.write !== false && writes,
                    delete: a.delete !== false && writes};
                if (!record) {
                    status.textContent = access.create ? 'New' : '';
                }
                lock();
            }, function () {
                /* Unknown: the server still refuses what is not allowed */
            });
        return {load: load, clear: clear, record: function () {
            return record;
        }};
    }

    /* The Picture tab: the images attached to the record (Tryton
     * attachments), added from a file */
    function pictureTab(pane, model, id, writes) {
        var resource = model + ',' + id;
        var list = el('div.pictures');
        function load() {
            global.Rpc.searchRead('ir.attachment', [['resource', '=',
                resource]], ['name', 'data', 'link', 'type'], {order:
                [['id', 'ASC']]}).then(function (rows) {
                    UI.clear(list);
                    var shown = rows.filter(function (a) {
                        return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(
                            a.name || '') && a.data;
                    });
                    shown.forEach(function (a) {
                        var type = /\.svg$/i.test(a.name) ? 'image/svg+xml' :
                            'image/' + a.name.split('.').pop().toLowerCase()
                            .replace('jpg', 'jpeg');
                        list.appendChild(el('figure.picture',
                            el('img', {src: 'data:' + type + ';base64,' +
                                a.data.base64, alt: a.name}),
                            el('figcaption', a.name)));
                    });
                    if (!shown.length) {
                        list.appendChild(el('p.muted', 'No picture.'));
                    }
                }, UI.showError);
        }
        var file = el('input', {type: 'file', accept: 'image/*',
            'aria-label': 'Add a picture'});
        file.addEventListener('change', function () {
            var f = file.files[0];
            if (!f) {
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                var data = String(reader.result).split(',')[1];
                global.Rpc.model('ir.attachment', 'create', [[{name: f.name,
                    resource: resource, data: {__class__: 'bytes',
                        base64: data}}]]).then(function () {
                    file.value = '';
                    load();
                }, UI.showError);
            };
            reader.readAsDataURL(f);
        });
        /* Jobshop's Edit > Picture (common.js): Insert Picture (replaces),
         * Clear Picture, Stretch to Fit; also the right-click on the
         * picture */
        var common = global.JobshopCommon;
        if (common && common.pictureTools) {
            var tools = common.pictureTools(list, {model: model, id: id,
                writes: writes, reload: load});
            pane.appendChild(el('div.toolbar', tools.menuItems().map(
                function (item) {
                    return el('button', {type: 'button', onclick:
                        function () {
                            item.onclick();
                        }}, item.label);
                })));
        } else {
            pane.appendChild(el('div.toolbar', writes ? el('label',
                'Add picture ', file) : null));
        }
        pane.appendChild(list);
        load();
    }

    /* The Notes tab: the record's notes (Tryton notes), newest first */
    function notesTab(pane, model, id, writes) {
        var resource = model + ',' + id;
        var list = el('div.notes');
        var text = el('textarea', {rows: 3, 'aria-label': 'New note',
            placeholder: 'New note'});
        function load() {
            global.Rpc.searchRead('ir.note', [['resource', '=', resource]],
                ['message', 'create_date', 'create_uid.rec_name'], {order:
                    [['id', 'DESC']]}).then(function (rows) {
                    UI.clear(list);
                    rows.forEach(function (n) {
                        list.appendChild(el('div.note',
                            el('div.muted', (n['create_uid.'] ?
                                n['create_uid.'].rec_name + ' · ' : '') +
                                String(n.create_date || '').slice(0, 16)),
                            el('div', n.message)));
                    });
                    if (!rows.length) {
                        list.appendChild(el('p.muted', 'No notes.'));
                    }
                }, UI.showError);
        }
        if (writes) {
            pane.appendChild(el('div', text, el('div.toolbar', el('button', {
                type: 'button', onclick: function () {
                    if (!text.value.trim()) {
                        return;
                    }
                    global.Rpc.model('ir.note', 'create', [[{resource:
                        resource, message: text.value.trim()}]]).then(
                        function () {
                            text.value = '';
                            load();
                        }, UI.showError);
                }}, 'Add note'))));
        }
        pane.appendChild(list);
        load();
    }

    /* A tab of related lines (one2many) edited in a grid: their changes as
     * the one2many actions of the parent's write */
    function linesTab(pane, spec) {
        var body = el('tbody');
        var rows = [];
        var removed = [];

        function addRow(line) {
            var row = {id: line ? line.id : null, controls: {}};
            var tr = el('tr', spec.fields.map(function (f) {
                var c = fieldControl(f);
                c.field = f;
                row.controls[f.name] = c;
                if (line) {
                    c.set(f.type === 'many2one' ? m2o(line, f.name) :
                        line[f.name]);
                }
                return el('td', c.node);
            }), el('td.row-delete', el('button', {type: 'button',
                title: 'Delete line', 'aria-label': 'Delete line',
                onclick: function () {
                    if (row.id) {
                        removed.push(row.id);
                    }
                    rows.splice(rows.indexOf(row), 1);
                    tr.remove();
                }}, '✕')));
            rows.push(row);
            body.appendChild(tr);
        }

        pane.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', spec.fields.map(function (f) {
                return el('th', f.label);
            }), el('th', ''))), body)));
        pane.appendChild(el('div.toolbar', el('button', {type: 'button',
            onclick: function () {
                addRow(null);
            }}, 'Add line')));

        return {
            name: spec.name,
            set: function (lines) {
                UI.clear(body);
                rows = [];
                removed = [];
                lines.forEach(addRow);
            },
            load: function (parentId) {
                var self = this;
                global.Rpc.searchRead(spec.model, [[spec.inverse, '=',
                    parentId]], readFields(spec.fields), {order:
                    spec.order}).then(function (lines) {
                        self.set(lines);
                    }, UI.showError);
            },
            changes: function () {
                var actions = [];
                var create = [];
                rows.forEach(function (row) {
                    var values = {};
                    spec.fields.forEach(function (f) {
                        if (!f.readonly) {
                            values[f.name] = row.controls[f.name].get();
                        }
                    });
                    if (row.id) {
                        actions.push(['write', [row.id], values]);
                    } else if (Object.keys(values).some(function (k) {
                        return values[k] !== null && values[k] !== '' &&
                            values[k] !== false;
                    })) {
                        create.push(values);
                    }
                });
                if (create.length) {
                    actions.push(['create', create]);
                }
                if (removed.length) {
                    actions.push(['delete', removed]);
                }
                return actions;
            }
        };
    }

    /* ---- What the user may do: menus and model rights ----------------- */

    /* The desk screens of the user's menus (ir.ui.menu.nline_allowed),
     * read once per session */
    var allowedPrm = null, allowedFor = null;
    function allowed() {
        var session = global.Rpc.session();
        var key = session ? session.session || session.userId || 1 : null;
        if (!allowedPrm || allowedFor !== key) {
            allowedFor = key;
            allowedPrm = global.Rpc.model('ir.ui.menu', 'nline_allowed', [])
                .catch(function () {
                    /* A server without module nline_role: no restriction */
                    return {all: true};
                });
        }
        return allowedPrm;
    }

    /* Promise of true when a menu of the user opens the screen of the route
     * ("parts/12" is the Parts screen, "orders/12" Customer Order Entry), as
     * the Tryton client checks an address typed by hand */
    function screenAllowed(route) {
        var family = route.replace(/\?.*$/, '').split('/')[0];
        return allowed().then(function (allow) {
            return Boolean(allow.all || (allow.urls || []).some(function (url) {
                var at = url.indexOf('#/');
                return at >= 0 && url.substr(at + 2).replace(/\?.*$/, '')
                    .split('/')[0] === family;
            }));
        });
    }

    /* Promise of {model: {read, write, create, delete}} */
    function access(models) {
        return global.Rpc.model('ir.model.access', 'get_access', [models])
            .catch(function () {
                return {};
            });
    }

    /* ---- Right-click menu ------------------------------------------- */

    /* contextMenu(event, items): items are {label, onclick} or '-' (a
     * separator); {label, items} opens a submenu beside it (Jobshop's
     * "Change Status >"), {checked: true} shows a tick, {disabled: true}
     * greys it, {shortcut: 'Ctrl+S'} shows the key on the right; the
     * menus close on a choice, a click elsewhere or Esc */
    var openMenus = [];
    function closeMenu(level) {
        level = typeof level === 'number' ? level : 0;
        while (openMenus.length > level) {
            openMenus.pop().remove();
        }
    }
    function clean(items) {
        items = (items || []).filter(Boolean);
        return items.filter(function (item, i) {
            /* No separator first, last or twice */
            return item !== '-' || (i > 0 && i < items.length - 1 &&
                items[i - 1] !== '-');
        });
    }
    function showMenu(items, x, y, level) {
        closeMenu(level);
        items = clean(items);
        if (!items.length) {
            return null;
        }
        var menu = el('div.ctx-menu', {role: 'menu'}, items.map(
            function (item) {
                if (item === '-') {
                    return el('div.ctx-sep', {role: 'separator'});
                }
                var sub = item.items && clean(item.items);
                var button = el('button.ctx-item' + (sub ? '.ctx-parent' :
                    ''), {type: 'button', role: 'menuitem', disabled:
                    item.disabled ? true : null, 'aria-haspopup': sub ?
                    'menu' : null}, item.checked ? '✓ ' : '', item.label +
                    (sub && !/▸$/.test(item.label) ? ' ▸' : ''),
                    item.shortcut ? el('span.ctx-key', item.shortcut) : null);
                function openSub() {
                    var box = button.getBoundingClientRect();
                    var child = showMenu(sub, box.right - 2, box.top,
                        level + 1);
                    if (child) {
                        var first = child.querySelector('.ctx-item');
                        return first;
                    }
                    return null;
                }
                if (sub) {
                    button.addEventListener('mouseenter', openSub);
                    button.addEventListener('click', function () {
                        var first = openSub();
                        if (first) {
                            first.focus();
                        }
                    });
                    button.addEventListener('keydown', function (e) {
                        if (e.key === 'ArrowRight' || e.key === 'Enter') {
                            e.preventDefault();
                            var first = openSub();
                            if (first) {
                                first.focus();
                            }
                        }
                    });
                } else {
                    button.addEventListener('mouseenter', function () {
                        closeMenu(level + 1);
                    });
                    button.addEventListener('click', function () {
                        closeMenu();
                        if (item.onclick) {
                            item.onclick();
                        }
                    });
                }
                return button;
            }));
        document.body.appendChild(menu);
        var box = menu.getBoundingClientRect();
        menu.style.left = Math.max(0, Math.min(x, global.innerWidth -
            box.width - 4)) + 'px';
        menu.style.top = Math.max(0, Math.min(y, global.innerHeight -
            box.height - 4)) + 'px';
        openMenus.push(menu);
        menu.addEventListener('keydown', function (e) {
            var buttons = Array.prototype.slice.call(
                menu.querySelectorAll('.ctx-item:not([disabled])'));
            var at = buttons.indexOf(document.activeElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) +
                    buttons.length) % buttons.length].focus();
            } else if (e.key === 'ArrowLeft' && level > 0) {
                e.preventDefault();
                closeMenu(level);
                var parent = openMenus[level - 1];
                var back = parent && parent.querySelector('.ctx-parent');
                if (back) {
                    back.focus();
                }
            }
        });
        return menu;
    }
    function contextMenu(event, items) {
        event.preventDefault();
        var menu = showMenu(items, event.clientX, event.clientY, 0);
        var first = menu && menu.querySelector('.ctx-item:not([disabled])');
        if (first) {
            first.focus();
        }
    }
    document.addEventListener('mousedown', function (event) {
        if (openMenus.length && !openMenus.some(function (m) {
            return m.contains(event.target);
        })) {
            closeMenu();
        }
    }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeMenu();
        }
    });
    global.addEventListener('blur', closeMenu);
    global.addEventListener('hashchange', closeMenu);

    Object.assign(UI, {
        screenAllowed: screenAllowed,
        pictureTab: pictureTab,
        notesTab: notesTab,
        access: access,
        contextMenu: contextMenu,
        closeMenu: closeMenu,
        master: master,
        placedForm: placedForm,
        fieldControl: fieldControl,
        report: report,
        setTitle: setTitle,
        browse: browse,
        lookups: lookups,
        form: form,
        grid: grid,
        center: center,
        openRecord: openRecord,
        openScreen: openScreen,
        openAction: openAction
    });
}(window));
