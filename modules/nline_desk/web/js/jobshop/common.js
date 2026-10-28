/* N-Line Jobshop emulation: common screens (module nline_js_common; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * The Common group bar: Free On Board Points, Shipping Methods,
 * States/Provinces, Postal Codes, Terms, Product Codes, Commodity Codes,
 * Reason Codes, Currency Codes, Alert Messages, User Control Panel.
 *
 * Jobshop's code tables are grids: every row a record, edited in place; the
 * row header shows a check mark on a changed row and a red X on a row marked
 * for deletion (Del); Save (Ctrl+S) saves them all at once. The grid is
 * window.JobshopCommon.codeTable(main, spec), for the other areas' tables
 * too (sales reps, territories, SIC codes...). */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    /* ---- Style -------------------------------------------------------- */

    function style() {
        if (document.getElementById('nl-js-common-css')) {
            return;
        }
        document.head.appendChild(el('style#nl-js-common-css', [
            'table.code-table td { padding: 2px 4px; }',
            'table.code-table td input[type=text], table.code-table td ' +
                'select { width: 100%; box-sizing: border-box; }',
            'table.code-table th.row-head, table.code-table td.row-head ' +
                '{ width: 26px; text-align: center; padding: 0; }',
            'table.code-table td.row-head button { width: 24px; padding: ' +
                '2px 0; border: none; background: none; cursor: pointer; ' +
                'color: var(--muted); font-weight: 600; }',
            'table.code-table tr.changed td.row-head button ' +
                '{ color: var(--ok); }',
            'table.code-table tr.deleted td.row-head button ' +
                '{ color: var(--bad); }',
            'table.code-table tr.deleted td { opacity: .55; ' +
                'text-decoration: line-through; }',
            'table.code-table tr.selected td { background: ' +
                'var(--accent-soft); }',
            'table.code-table tr.inactive td { color: var(--muted); }',
            '.code-filters { display: flex; gap: 12px; align-items: ' +
                'center; flex-wrap: wrap; margin-bottom: 8px; }',
            '.code-filters label { display: inline-flex; gap: 6px; ' +
                'align-items: center; color: var(--muted); }',
            '.code-filters .picker { min-width: 220px; }',
            '.code-count { margin-left: auto; color: var(--muted); }',
            '.js-help { color: var(--muted); margin: 0 0 8px; }',
            '.alert-list td.num { white-space: nowrap; }',
            '.alert-list tr.unread td { font-weight: 600; }',
            '.cp-grid { display: grid; grid-template-columns: ' +
                'repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }',
            '.cp-grid section.panel h2 { margin-top: 0; font-size: 16px; }',
            '.cp-grid .grid-form { grid-template-columns: 1fr; }',
            '.alerts-home li { margin: 2px 0; }'
        ].join('\n')));
    }

    /* ---- Helpers ------------------------------------------------------ */

    function readFields(columns) {
        var names = [];
        columns.forEach(function (c) {
            if (c.type === 'many2one') {
                names.push(c.name, c.name + '.rec_name');
            } else if (c.name) {
                names.push(c.name);
            }
        });
        return names;
    }

    function m2o(record, name) {
        var id = record[name];
        var related = record[name + '.'];
        if (!id) {
            return null;
        }
        return {id: id, rec_name: related ? related.rec_name : String(id)};
    }

    function same(a, b) {
        return JSON.stringify(a === undefined ? null : a) ===
            JSON.stringify(b === undefined ? null : b);
    }

    function isTyping(node) {
        return node && (node.tagName === 'INPUT' || node.tagName ===
            'TEXTAREA' || node.tagName === 'SELECT');
    }

    /* ---- The code table grid ------------------------------------------ */

    /* codeTable(main, {title, model, help, columns: [{name, label, type,
     * model, domain, options, readonly, default (value or function),
     * scale (shown multiplied: 100 for a percent kept as a ratio),
     * width}], order, domain, inactive (the model has "active": an Active
     * column and Show inactive), filters: [{name, label, model (many2one)
     * | options (selection), value: {id, rec_name} | value, clause(value)
     * -> domain}], defaults (of a new row), rowMenu(record) -> [{label,
     * onclick}], report: '<Jobshop report id>' (Print), limit}) ->
     * {reload(), filterValue(name), save()} */
    function codeTable(main, spec) {
        style();
        var columns = spec.columns.concat(spec.inactive ? [{name: 'active',
            label: 'Active', type: 'boolean', default: true}] : []);
        var rows = [];
        var selected = null;
        var access = {read: true, write: false, create: false,
            delete: false};
        var body = el('tbody');
        var count = el('span.code-count');
        var search = el('input', {type: 'text', 'aria-label': 'Search',
            placeholder: 'Search (* for any text)'});
        var showInactive = el('input', {type: 'checkbox',
            'aria-label': 'Show inactive'});
        var filters = (spec.filters || []).map(function (f) {
            var control = UI.fieldControl({name: f.name, label: f.label,
                type: f.model ? 'many2one' : 'selection', model: f.model,
                options: f.options, domain: f.domain});
            control.set(f.value === undefined ? null : f.value);
            control.filter = f;
            var input = control.picker ? control.picker.input : control.node;
            input.addEventListener('change', function () {
                reload();
            });
            if (control.picker) {
                /* A chosen country reloads at once; a cleared one too */
                var pick = control.picker;
                input.addEventListener('input', function () {
                    if (!input.value) {
                        reload();
                    }
                });
                pick.input.addEventListener('blur', function () {
                    global.setTimeout(function () {
                        if (pick.value() !== control.last) {
                            reload();
                        }
                    }, 200);
                });
            }
            return control;
        });

        function filterValue(name) {
            var found = filters.filter(function (c) {
                return c.filter.name === name;
            })[0];
            if (!found) {
                return null;
            }
            if (found.picker) {
                var record = found.picker.record();
                return record ? {id: record.id, rec_name: record.rec_name} :
                    null;
            }
            return found.get();
        }

        function domain() {
            var result = (spec.domain || []).slice();
            filters.forEach(function (c) {
                var v = c.picker ? c.picker.value() : c.get();
                c.last = v;
                if (v !== null && v !== undefined && v !== '') {
                    result = result.concat(c.filter.clause ?
                        c.filter.clause(v) : [[c.filter.name, '=', v]]);
                }
            });
            var text = search.value.trim().replace(/\*/g, '%');
            if (text) {
                result.push(['rec_name', 'ilike', text.indexOf('%') >= 0 ?
                    text : '%' + text + '%']);
            }
            return result;
        }

        function columnValue(row, c) {
            var v = row.controls[c.name].get();
            if (c.scale && v !== null && v !== undefined) {
                var n = typeof v === 'object' ? parseFloat(v.decimal) :
                    Number(v);
                return global.Rpc.decimal(String(+(n / c.scale).toFixed(8)));
            }
            return v;
        }

        function setColumn(row, c, record) {
            var v = c.type === 'many2one' ? m2o(record, c.name) :
                record[c.name];
            if (c.scale && v !== null && v !== undefined) {
                v = +(Number(v) * c.scale).toFixed(6);
            }
            row.controls[c.name].set(v);
        }

        function snapshot(row) {
            var values = {};
            columns.forEach(function (c) {
                if (!c.readonly) {
                    values[c.name] = columnValue(row, c);
                }
            });
            return values;
        }

        function changes(row) {
            var now = snapshot(row);
            var result = {};
            Object.keys(now).forEach(function (name) {
                if (!same(now[name], row.original[name])) {
                    result[name] = now[name];
                }
            });
            return result;
        }

        function blank(row) {
            var now = snapshot(row);
            return Object.keys(now).every(function (name) {
                return same(now[name], row.original[name]);
            });
        }

        function mark(row) {
            var changed = row.id ? Object.keys(changes(row)).length > 0 :
                !blank(row);
            row.tr.classList.toggle('changed', changed && !row.deleted);
            row.tr.classList.toggle('deleted', row.deleted);
            row.head.textContent = row.deleted ? '✕' : changed ? '✔' :
                row.id ? '' : '*';
            row.head.title = row.deleted ? 'Marked for deletion (Save ' +
                'deletes it; Del again keeps it)' : changed ?
                'Changed, not saved' : row.id ? 'Select (Del marks it for ' +
                'deletion)' : 'New row';
            if (!row.id && changed && rows[rows.length - 1] === row &&
                    access.create) {
                addRow(null);
            }
        }

        function dirty() {
            return rows.some(function (row) {
                return row.deleted || (row.id ? Object.keys(changes(row))
                    .length : !blank(row));
            });
        }

        function select(row) {
            if (selected && selected.tr) {
                selected.tr.classList.remove('selected');
            }
            selected = row;
            if (row) {
                row.tr.classList.add('selected');
            }
        }

        function toggleDelete(row) {
            if (!row || !access.delete) {
                return;
            }
            if (!row.id) {
                /* A new row: just cleared */
                if (rows[rows.length - 1] !== row) {
                    rows.splice(rows.indexOf(row), 1);
                    row.tr.remove();
                }
                return;
            }
            row.deleted = !row.deleted;
            mark(row);
        }

        function addRow(record) {
            var row = {id: record ? record.id : null, record: record,
                controls: {}, deleted: false};
            row.head = el('button', {type: 'button', onclick: function () {
                select(row);
                row.head.focus();
            }, oncontextmenu: function (event) {
                select(row);
                menu(event, row);
            }});
            var cells = columns.map(function (c) {
                var control = UI.fieldControl(Object.assign({}, c, {
                    type: c.scale ? 'float' : c.type}));
                control.field = c;
                row.controls[c.name] = control;
                if (record) {
                    setColumn(row, c, record);
                } else {
                    var d = typeof c.default === 'function' ? c.default() :
                        c.default;
                    control.set(d === undefined ? null : d);
                }
                return el('td', c.width ? {style: {width: c.width}} : null,
                    control.node);
            });
            row.tr = el('tr' + (record && record.active === false ?
                '.inactive' : ''), {
                onfocusin: function () {
                    select(row);
                },
                oninput: function () {
                    mark(row);
                },
                onchange: function () {
                    mark(row);
                },
                oncontextmenu: function (event) {
                    if (!isTyping(event.target)) {
                        select(row);
                        menu(event, row);
                    }
                }
            }, el('td.row-head', row.head), cells);
            /* A many2one chosen from its list fires no input event */
            columns.forEach(function (c) {
                var control = row.controls[c.name];
                if (control.picker) {
                    control.picker.input.addEventListener('blur', function () {
                        global.setTimeout(function () {
                            mark(row);
                        }, 200);
                    });
                }
            });
            row.original = snapshot(row);
            rows.push(row);
            body.appendChild(row.tr);
            lockRow(row);
            mark(row);
            return row;
        }

        function lockRow(row) {
            var editable = row.id ? access.write : access.create;
            columns.forEach(function (c) {
                var node = row.controls[c.name].node;
                Array.prototype.forEach.call(node.matches('input, select, ' +
                    'textarea') ? [node] : node.querySelectorAll('input, ' +
                    'select, textarea, button'), function (n) {
                    n.disabled = !editable || Boolean(c.readonly);
                });
            });
        }

        function render(records) {
            UI.clear(body);
            rows = [];
            selected = null;
            records.forEach(addRow);
            if (access.create) {
                addRow(null);
            }
            count.textContent = records.length + (records.length ===
                (spec.limit || 1000) ? '+' : '') + ' rows';
        }

        function reload() {
            var context = {};
            if (spec.inactive && showInactive.checked) {
                context.active_test = false;
            }
            var fields = readFields(columns.filter(function (c) {
                return c.name;
            }));
            if (spec.inactive && fields.indexOf('active') < 0) {
                fields.push('active');
            }
            /* Rpc.model adds the user's context: here with active_test */
            return global.Rpc.call('model.' + spec.model + '.search_read', [
                domain(), 0, spec.limit || 1000, spec.order || null, fields,
                Object.assign({}, global.Rpc.context(), context)]).then(
                render, UI.showError);
        }

        function refresh() {
            if (!dirty()) {
                return reload();
            }
            return UI.confirm('Refresh', 'Discard the changes not saved?')
                .then(function (ok) {
                    if (ok) {
                        reload();
                    }
                });
        }

        function save() {
            var request = {'delete': [], write: [], create: []};
            rows.forEach(function (row) {
                if (row.deleted) {
                    request['delete'].push(row.id);
                } else if (row.id) {
                    var values = changes(row);
                    if (Object.keys(values).length) {
                        request.write.push([row.id, values]);
                    }
                } else if (!blank(row)) {
                    request.create.push(Object.assign({}, typeof spec
                        .defaults === 'function' ? spec.defaults() :
                        spec.defaults || {}, snapshot(row)));
                }
            });
            if (!request['delete'].length && !request.write.length &&
                    !request.create.length) {
                UI.toast('Nothing to save');
                return Promise.resolve();
            }
            return global.Rpc.desk('common_save_table', [spec.model,
                request]).then(function () {
                    UI.toast(spec.title + ' saved', 'ok');
                    return reload();
                }, UI.showError);
        }

        /* File > Print: the window's list report among the Common
         * reports (nline_js_admin); straight to it when that screen takes
         * the report in its route */
        var canPrint = false;
        function print() {
            var route = 'js-reports/common/' + spec.report;
            var direct = (global.NLINE_ROUTES || []).some(function (r) {
                return r[0].test('#/' + route);
            });
            UI.openScreen(direct ? route : 'js-reports/common',
                'Common Reports');
        }

        function menu(event, row) {
            var items = [];
            if (access.create) {
                items.push({label: 'Insert Row (Ins)', onclick: function () {
                    var last = rows[rows.length - 1];
                    var target = last && !last.id && blank(last) ? last :
                        addRow(null);
                    focusRow(target);
                }});
            }
            if (access.delete && row && row.id) {
                items.push({label: row.deleted ? 'Undelete Row (Del)' :
                    'Delete Row (Del)', onclick: function () {
                        toggleDelete(row);
                    }});
            }
            if (row && row.id && spec.rowMenu) {
                var extra = spec.rowMenu(row.record, reload);
                if (extra && extra.length) {
                    items.push('-');
                    items = items.concat(extra);
                }
            }
            items.push('-');
            if (access.write || access.create || access.delete) {
                items.push({label: 'Save (Ctrl+S)', onclick: save});
            }
            items.push({label: 'Refresh (F5)', onclick: refresh});
            if (canPrint) {
                items.push({label: 'Print', onclick: print});
            }
            UI.contextMenu(event, items);
        }

        function focusRow(row) {
            var first = columns.filter(function (c) {
                return !c.readonly;
            })[0];
            if (first) {
                var c = row.controls[first.name];
                (c.picker ? c.picker.input : c.node).focus();
            }
            select(row);
        }

        var extra = [{label: 'Save', title: 'Save every change (Ctrl+S)',
            onclick: save}, {label: 'Delete', title: 'Mark the selected ' +
            'row for deletion (Del); Save deletes it', onclick: function () {
                toggleDelete(selected);
            }}, {label: 'Refresh', title: 'Read the table again (F5)',
            onclick: refresh}];
        if (spec.report) {
            extra.push({label: 'Print', title: 'The ' + spec.title +
                ' list report', onclick: print});
        }
        var form = UI.form(main, {title: spec.title, extra: extra});
        var pane = form.body;
        if (spec.help) {
            pane.appendChild(el('p.js-help', spec.help));
        }
        pane.appendChild(el('div.code-filters', filters.map(function (c) {
            return el('label', c.filter.label, c.node);
        }), el('label', el('span', 'Find'), search), spec.inactive ?
            el('label', showInactive, 'Show inactive') : null, count));
        pane.appendChild(el('div.table-wrap', el('table.data.code-table',
            el('thead', el('tr', el('th.row-head', ''), columns.map(
                function (c) {
                    return el('th', {title: c.help || ''}, c.label);
                }))), body)));

        var timer;
        search.addEventListener('input', function () {
            global.clearTimeout(timer);
            timer = global.setTimeout(reload, 250);
        });
        showInactive.addEventListener('change', reload);

        function onKey(event) {
            if (!body.isConnected) {
                document.removeEventListener('keydown', onKey);
                return;
            }
            var key = event.key;
            if ((event.ctrlKey || event.metaKey) && key.toLowerCase() ===
                    's') {
                event.preventDefault();
                if (access.write || access.create || access.delete) {
                    save();
                }
            } else if (key === 'F5' && !event.shiftKey) {
                event.preventDefault();
                refresh();
            } else if (key === 'Delete' && selected &&
                    (!isTyping(document.activeElement) || event.ctrlKey)) {
                event.preventDefault();
                toggleDelete(selected);
            } else if (key === 'Insert' && access.create) {
                event.preventDefault();
                var last = rows[rows.length - 1];
                focusRow(last && !last.id && blank(last) ? last :
                    addRow(null));
            }
        }
        document.addEventListener('keydown', onKey);

        UI.access([spec.model]).then(function (result) {
            var a = result[spec.model] || {};
            var writes = spec.writes !== false;
            access = {read: a.read !== false,
                write: a.write !== false && writes,
                create: a.create !== false && writes,
                delete: a.delete !== false && writes};
            if (form.allow) {
                form.allow(false, [].concat(access.write || access.create ||
                    access['delete'] ? [] : ['Save'], access['delete'] ? [] :
                    ['Delete'], ['Print']));
            }
            reload();
            if (spec.report) {
                UI.screenAllowed('js-reports/common').then(function (ok) {
                    canPrint = ok;
                    if (ok && form.allow) {
                        form.allow(false, [].concat(access.write ||
                            access.create || access['delete'] ? [] :
                            ['Save'], access['delete'] ? [] : ['Delete']));
                    }
                });
            }
        });
        return {reload: reload, filterValue: filterValue, save: save};
    }

    /* ---- The code tables of the Common group bar ---------------------- */

    var CODES = {
        fobPoints: {title: 'Free On Board Points', model: 'nline.fob_point',
            report: 'fob_point_list',
            help: 'The point where the title and the responsibility for ' +
                'a shipment pass to the customer; used by customers, ' +
                'suppliers, quotes, orders, shipping and invoicing.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'}]},
        shipVias: {title: 'Shipping Methods', model: 'nline.ship_via',
            report: 'shipping_method_list',
            help: 'The ways you ship (Overnight, Second Day Air, Customer ' +
                'Pickup, LTL, Best Way): the Ship Via of customers, ' +
                'suppliers, orders, shipping and invoicing.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'}]},
        productCodes: {title: 'Product Codes', model: 'nline.product_code',
            report: 'product_code_list',
            help: 'Codes for the products you make and sell, to group ' +
                'parts, masters and work orders and to sort reports.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'},
                {name: 'markup_percent', label: 'Markup %',
                    type: 'decimal', width: '110px',
                    help: 'Markup on the unit cost to get the unit price'}]},
        commodityCodes: {title: 'Commodity Codes',
            model: 'nline.commodity_code', report: 'commodity_code_list',
            help: 'Codes for the products you buy (or make against buy), ' +
                'for purchasing and the sales analysis.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'},
                {name: 'markup_percent', label: 'Markup %',
                    type: 'decimal', width: '110px',
                    help: 'Markup on the unit cost to get the unit price'}]},
        reasonCodes: {title: 'Reason Codes', model: 'nline.reason_code',
            report: 'reason_code_list',
            help: 'Status reasons for the transactions out of the ordinary: ' +
                'inventory adjustments, deviated or scrap quantities in ' +
                'labor entry.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '160px'},
                {name: 'description', label: 'Reason', type: 'char'},
                {name: 'reason_type', label: 'Reason Type',
                    type: 'selection', width: '190px', default: 'inventory',
                    options: [[null, ''],
                        ['inventory', 'Inventory Adjustment'],
                        ['labor', 'Labor Entry'],
                        ['calendar', 'Calendar Exception'],
                        ['employee', 'Employee Absence']]}]}
    };

    function codeScreen(key, route) {
        return function (main) {
            var spec = CODES[key];
            UI.setTitle(spec.title);
            codeTable(main, Object.assign({order: [['code', 'ASC']],
                inactive: true}, spec));
        };
    }

    Screens.jsFobPoints = codeScreen('fobPoints');
    Screens.jsShipVias = codeScreen('shipVias');
    Screens.jsProductCodes = codeScreen('productCodes');
    Screens.jsCommodityCodes = codeScreen('commodityCodes');
    Screens.jsReasonCodes = codeScreen('reasonCodes');

    /* ---- States/Provinces and Postal Codes ---------------------------- */

    /* The company's country (the filter's first value): the US when the
     * company has no address */
    var countryPrm = null;
    function homeCountry() {
        if (!countryPrm) {
            countryPrm = global.Rpc.searchRead('country.country', [['code',
                '=', 'US']], ['rec_name'], {limit: 1}).then(function (rows) {
                    return rows[0] ? {id: rows[0].id, rec_name:
                        rows[0].rec_name} : null;
                }, function () {
                    return null;
                });
        }
        return countryPrm;
    }

    Screens.jsStates = function (main) {
        UI.setTitle('States/Provinces');
        homeCountry().then(function (country) {
            var table = codeTable(main, {title: 'States/Provinces',
                model: 'country.subdivision', inactive: true,
                report: 'state_province_list',
                order: [['code', 'ASC']],
                help: 'The states and provinces of the addresses of your ' +
                    'company, customers and suppliers (ISO codes: US-TX).',
                filters: [{name: 'country', label: 'Country',
                    model: 'country.country', value: country}],
                columns: [
                    {name: 'code', label: 'ID', type: 'char',
                        width: '140px'},
                    {name: 'name', label: 'Name', type: 'char'},
                    {name: 'country', label: 'Country', type: 'many2one',
                        model: 'country.country', width: '240px',
                        default: function () {
                            return table ? table.filterValue('country') :
                                country;
                        }}]});
        });
    };

    Screens.jsPostalCodes = function (main) {
        UI.setTitle('Postal Codes');
        homeCountry().then(function (country) {
            var table = codeTable(main, {title: 'Postal Codes',
                model: 'country.postal_code', report: 'postal_code_list',
                order: [['postal_code', 'ASC'], ['city', 'ASC']],
                help: 'Postal codes fill in the city and the state when ' +
                    'an address is entered.',
                filters: [{name: 'country', label: 'Country',
                    model: 'country.country', value: country}],
                columns: [
                    {name: 'postal_code', label: 'ID', type: 'char',
                        width: '140px'},
                    {name: 'city', label: 'City', type: 'char'},
                    {name: 'subdivision', label: 'State', type: 'many2one',
                        model: 'country.subdivision', width: '220px',
                        domain: country ? [['country', '=', country.id]] :
                            []},
                    {name: 'country', label: 'Country', type: 'many2one',
                        model: 'country.country', width: '220px',
                        default: function () {
                            return table ? table.filterValue('country') :
                                country;
                        }}]});
        });
    };

    /* ---- Terms --------------------------------------------------------- */

    var AGE_TYPES = [[null, ''], ['age', 'Age in Days'],
        ['cod', 'Collect on Delivery'], ['day_next_month',
            'Day of Next Month'], ['eom', 'End of Month']];

    /* Takes over the Terms screen of company.js (same route): the payment
     * terms with Jobshop's columns; Due dates (right-click) still opens the
     * Tryton form of a term with several due dates */
    Screens.terms = function (main) {
        UI.setTitle('Terms');
        codeTable(main, {title: 'Terms',
            model: 'account.invoice.payment_term', inactive: true,
            report: 'terms_list',
            order: [['name', 'ASC']],
            help: 'Conditions of payment of customers, suppliers, orders ' +
                'and invoices. A term with one due date follows its age ' +
                'type and days; right-click > Due dates for split payments.',
            columns: [
                {name: 'name', label: 'ID', type: 'char', width: '200px'},
                {name: 'net_type', label: 'Invoice Age Type',
                    type: 'selection', options: AGE_TYPES, default: 'age',
                    width: '160px'},
                {name: 'net_days', label: 'Invoice Aging Days',
                    type: 'integer', width: '90px'},
                {name: 'discount_type', label: 'Discount Age Type',
                    type: 'selection', options: AGE_TYPES, default: 'age',
                    width: '160px'},
                {name: 'early_discount_days', label: 'Disc Aging Days',
                    type: 'integer', width: '90px'},
                {name: 'early_discount_rate', label: 'Discount %',
                    type: 'decimal', scale: 100, width: '90px'},
                {name: 'description', label: 'Terms Description',
                    type: 'char'}],
            rowMenu: function (record) {
                return [{label: 'Due dates…', onclick: function () {
                    UI.openRecord('account.invoice.payment_term', record.id,
                        record.name);
                }}];
            }});
    };

    /* ---- Currency Codes ------------------------------------------------ */

    Screens.jsCurrencyCodes = function (main) {
        UI.setTitle('Currency Codes');
        codeTable(main, {title: 'Currency Codes', model: 'currency.currency',
            report: 'currency_code_list',
            inactive: true, order: [['code', 'ASC']],
            help: 'The currencies of the quotes, orders, invoices and ' +
                'purchase orders of foreign customers and suppliers. ' +
                'Exchange Rate: the units of the currency for one unit of ' +
                'the company currency (changing it adds today\'s rate).',
            defaults: {rounding: global.Rpc.decimal('0.01'), digits: 2},
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '80px'},
                {name: 'name', label: 'Name', type: 'char'},
                {name: 'symbol', label: 'Currency Symbol', type: 'char',
                    width: '90px'},
                {name: 'thousands_separator', label: 'Thousands Separator',
                    type: 'char', width: '90px', default: ','},
                {name: 'decimal_separator', label: 'Decimal Separator',
                    type: 'char', width: '90px', default: '.'},
                {name: 'exchange_rate', label: 'Exchange Rate',
                    type: 'decimal', width: '130px'}],
            rowMenu: function (record) {
                return [{label: 'Rate history…', onclick: function () {
                    UI.openRecord('currency.currency', record.id,
                        record.name);
                }}];
            }});
    };

    /* ---- Alert Messages ------------------------------------------------ */

    var ALERT_TYPES = [['so', 'Sales Order'], ['po', 'Purchase Order'],
        ['wo', 'Work Order'], ['qt', 'Quote'], ['cus', 'Customer'],
        ['shp', 'Shipper'], ['inv', 'Invoice'], ['sup', 'Supplier'],
        ['rfq', 'Request For Quote'], ['rec', 'Receiver'],
        ['em', 'Engineering Master'], ['ip', 'Inventory Part']];
    var ALERT_CHANGES = [['late', 'Item is Late'],
        ['hold', 'Released Status Changed to Hold'],
        ['cancelled', 'Released Status Changed to Cancelled'],
        ['released', 'UnReleased Status Changed to Released'],
        ['lab_hrs', 'Labor Hours Exceeds Estimate'],
        ['lab_cost', 'Labor Cost Exceeds Estimate'],
        ['mat_cost', 'Material Cost Exceeds Estimate'],
        ['deviated_qty', 'Deviated Quantity Reported'],
        ['note', 'Note Added (user option)'],
        ['unapproved', 'Status Changed to Waiting Approval'],
        ['wo_sched_late', 'Work Order Scheduled to Finish Late'],
        ['out_ser_beg', 'Outside Service Scheduled Start is Late'],
        ['out_ser_fin', 'Outside Service Scheduled Finish is Late'],
        ['promised', 'Open Quote Reached Promised Date'],
        ['followup', 'Open Quote Reached Follow Up Date'],
        ['expired', 'Open Quote has Expired'],
        ['expected_win', 'Open Quote Reached Expected Win Date'],
        ['credit_status', 'Credit Status Changed'],
        ['credit_limit', 'Order Limit Changed'],
        ['status_change', 'Status Changed'],
        ['line_status', 'Line Status Changed (Firm or Released Order)'],
        ['line_deleted', 'Line Deleted (Firm or Released Order)'],
        ['order_qty', 'Order Quantity Changed (Firm or Released Order)'],
        ['desired_ship', 'Desired Ship Date Changed (Firm or Released ' +
            'Order)'],
        ['shipped', 'Sales Order Shipped'],
        ['shipper_ret', 'Sales Order Returned'],
        ['invoiced', 'Shipment was Invoiced'],
        ['printed', 'Document was Printed'],
        ['received', 'Purchase Order Received'],
        ['receiver_ret', 'Purchase Order Returned'],
        ['desired_recv', 'Desired Receive On Date Changed (Firm or ' +
            'Released Order)'],
        ['desired_want', 'Desired Want Date Changed (Firm or Released ' +
            'Order)'],
        ['desired_rls', 'Desired Release Date Changed (Firm or Released ' +
            'Order)'],
        ['em_rev_change', 'Engineering Master Revision Changed'],
        ['cost_change', 'Cost Changed'],
        ['price_change', 'Price Changed'],
        ['prim_loc_change', 'Primary Location Changed'],
        ['new_em_created', 'New Engineering Master Created'],
        ['has_changed', 'Document has Changed']];

    function messagesTab(pane) {
        var showArchived = el('input', {type: 'checkbox',
            'aria-label': 'Show archived'});
        var body = el('tbody');
        var messages = [];
        var checks = {};

        function chosen() {
            return messages.filter(function (m) {
                return checks[m.id] && checks[m.id].checked;
            }).map(function (m) {
                return m.id;
            });
        }

        function load() {
            return global.Rpc.desk('common_alerts', [showArchived.checked,
                500]).then(function (rows) {
                    messages = rows;
                    checks = {};
                    UI.clear(body);
                    rows.forEach(function (m) {
                        checks[m.id] = el('input', {type: 'checkbox',
                            'aria-label': 'Select'});
                        body.appendChild(el('tr' + (m.archived ? '' :
                            '.unread'), {oncontextmenu: function (event) {
                                messageMenu(event, m);
                            }, ondblclick: function () {
                                open(m);
                            }}, el('td', checks[m.id]),
                            el('td.num', m.date ? String(m.date)
                                .slice(0, 16) : ''),
                            el('td', m.type_string), el('td', m.change_string),
                            el('td', m.subject || ''), el('td', m.message || ''),
                            el('td', m.document ? el('a', {href: '#',
                                onclick: function (event) {
                                    event.preventDefault();
                                    open(m);
                                }}, m.document[2]) : '')));
                    });
                    if (!rows.length) {
                        body.appendChild(el('tr', el('td', {colspan: 7},
                            showArchived.checked ? 'No messages.' :
                            'No unread messages.')));
                    }
                }, UI.showError);
        }

        function open(m) {
            if (m.document) {
                UI.openRecord(m.document[0], m.document[1], m.document[2]);
            }
        }

        function archive(ids, archived) {
            if (!ids.length) {
                UI.toast('Select messages first');
                return;
            }
            global.Rpc.desk('common_archive_alerts', [ids, archived]).then(
                load, UI.showError);
        }

        function messageMenu(event, m) {
            UI.contextMenu(event, [
                m.document ? {label: 'Open ' + m.type_string, onclick:
                    function () {
                        open(m);
                    }} : null,
                {label: m.archived ? 'Mark Unread' : 'Mark Read (Archive)',
                    onclick: function () {
                        archive([m.id], !m.archived);
                    }},
                '-',
                {label: 'Refresh (F5)', onclick: refresh}
            ].filter(Boolean));
        }

        function refresh() {
            global.Rpc.desk('common_refresh_alerts', []).then(function (n) {
                if (n) {
                    UI.toast(n + ' new alert message' + (n === 1 ? '' :
                        's'), 'ok');
                }
                load();
            }, function () {
                load();
            });
        }

        showArchived.addEventListener('change', load);
        pane.appendChild(el('div.code-filters',
            el('button', {type: 'button', onclick: function () {
                archive(chosen(), true);
            }}, 'Mark Read'),
            el('button', {type: 'button', onclick: function () {
                archive(chosen(), false);
            }}, 'Mark Unread'),
            el('button', {type: 'button', onclick: refresh}, 'Refresh'),
            el('label', showArchived, 'Show archived')));
        pane.appendChild(el('div.table-wrap', el('table.data.alert-list',
            el('thead', el('tr', ['', 'Date', 'Alert Type', 'Alert Change',
                'Subject', 'Message', 'Document'].map(function (h) {
                    return el('th', h);
                }))), body)));
        refresh();
        return {load: load, refresh: refresh};
    }

    Screens.jsAlertMessages = function (main) {
        style();
        UI.setTitle('Alert Messages');
        var session = global.Rpc.session() || {};
        var me = session.user ? {id: session.user, rec_name: session.name ||
            session.login || ''} : null;
        var tabBar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        var tabs = [];

        function show(index) {
            tabs.forEach(function (t, i) {
                t.button.classList.toggle('active', i === index);
                t.button.setAttribute('aria-selected', i === index);
                t.pane.hidden = i !== index;
            });
            if (tabs[index].open) {
                tabs[index].open();
                tabs[index].open = null;
            }
        }

        function tab(title, open) {
            var t = {pane: el('div.tab-pane.panel', {role: 'tabpanel'}),
                open: open};
            t.button = el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(tabs.indexOf(t));
                }}, title);
            tabs.push(t);
            tabBar.appendChild(t.button);
            panes.appendChild(t.pane);
            return t;
        }

        main.appendChild(el('div.ribbon', el('span.ribbon-title',
            'Alert Messages')));
        main.appendChild(el('p.js-help', 'Messages from the alerts you ' +
            'set: the ERP raises "Item is Late" for sales, purchase and ' +
            'work orders every morning (Refresh raises them now). Mark ' +
            'them read to archive them.'));
        main.appendChild(tabBar);
        main.appendChild(panes);
        var messages = tab('Messages', function () {
            messagesTab(messages.pane);
        });
        var alerts = tab('My Alerts', function () {
            UI.access(['res.user']).then(function (result) {
                var admin = (result['res.user'] || {}).write === true;
                var table = codeTable(alerts.pane, {title: 'My Alerts',
                    model: 'nline.user_alert',
                    order: [['alert_type', 'ASC'], ['alert_change', 'ASC']],
                    help: 'What to tell you about. Manual: a message here; ' +
                        'Email: the recipients too.',
                    domain: admin ? [] : me ? [['user', '=', me.id]] : [],
                    filters: admin ? [{name: 'user', label: 'User',
                        model: 'res.user', value: me}] : [],
                    defaults: function () {
                        var user = admin && table ? table.filterValue('user') :
                            null;
                        return user ? {user: user.id} : {};
                    },
                    columns: [
                        {name: 'alert_type', label: 'Alert Type',
                            type: 'selection', options: ALERT_TYPES,
                            width: '170px'},
                        {name: 'alert_change', label: 'Alert Change',
                            type: 'selection', options: ALERT_CHANGES,
                            default: 'late', width: '300px'},
                        {name: 'alert_action', label: 'Alert Action',
                            type: 'selection', options: [['manual',
                                'Manual'], ['email', 'Email']],
                            default: 'manual', width: '110px'},
                        {name: 'recipient', label: 'Recipient',
                            type: 'char'},
                        {name: 'subject', label: 'Subject', type: 'char'},
                        {name: 'generated', label: 'Raised by the ERP',
                            type: 'boolean', readonly: true,
                            width: '80px'}]});
                /* The grid's ribbon sits inside the tab: no second title */
                var ribbon = alerts.pane.querySelector('.ribbon-title');
                if (ribbon) {
                    ribbon.textContent = '';
                }
            });
        });
        show(0);
    };

    /* For Home (the integrator's call): the user's unread alert messages,
     * newest first, in a container; resolves to their number. Nothing is
     * drawn when there are none. */
    function alertsPanel(container, limit) {
        style();
        return global.Rpc.desk('common_alerts', [false, limit || 8]).then(
            function (rows) {
                UI.clear(container);
                if (!rows.length) {
                    return 0;
                }
                container.appendChild(el('h3', 'Alert Messages'));
                container.appendChild(el('ul.alerts-home', rows.map(
                    function (m) {
                        return el('li', el('a', {href: '#', onclick:
                            function (event) {
                                event.preventDefault();
                                if (m.document) {
                                    UI.openRecord(m.document[0],
                                        m.document[1], m.document[2]);
                                } else {
                                    UI.openScreen('alert-messages',
                                        'Alert Messages');
                                }
                            }}, m.message || m.subject || m.change_string),
                            el('span.muted', ' ' + (m.date ? String(m.date)
                                .slice(0, 10) : '')));
                    })));
                container.appendChild(el('a', {href: '#', onclick: function (
                    event) {
                    event.preventDefault();
                    UI.openScreen('alert-messages', 'Alert Messages');
                }}, 'All alert messages'));
                return rows.length;
            }, function () {
                /* Without nline_js_common: no panel */
                UI.clear(container);
                return 0;
            });
    }

    function unreadAlerts() {
        return global.Rpc.desk('common_alert_count', []).catch(function () {
            return 0;
        });
    }

    /* ---- User Control Panel ------------------------------------------- */

    Screens.jsControlPanel = function (main) {
        style();
        UI.setTitle('User Control Panel');
        main.appendChild(el('div.ribbon', el('span.ribbon-title',
            'User Control Panel')));
        var grid = el('div.cp-grid');
        main.appendChild(grid);

        /* Change Password: N-Line BI's, never the ERP's */
        /* Back to the ERP (the Tryton client around the desk) afterwards */
        var here = '/';
        try {
            here = global.top.location.pathname + global.top.location.hash;
        } catch (e) {
            here = global.location.pathname + global.location.hash;
        }
        var password = el('section.panel', el('h2', 'Change Password'),
            el('p', 'You sign in to the ERP through N-Line BI: your ' +
                'password is your N-Line BI password and is changed there. ' +
                'The ERP keeps no password.'));
        if (global.Rpc.behindNlbi) {
            password.appendChild(el('p', el('a.button', {href:
                '/server/login?change=1&next=' + encodeURIComponent(here),
                target: '_top'}, 'Change your N-Line BI password…')));
        } else {
            password.appendChild(el('p.muted', 'Open the ERP from N-Line BI ' +
                '(its name menu > Change password…) to change it.'));
        }
        grid.appendChild(password);

        /* Preferences: what the user may change in Tryton */
        var prefs = el('section.panel', el('h2', 'Preferences'),
            el('p.muted', 'Loading…'));
        grid.appendChild(prefs);

        /* Printer setup: the browser's print dialog */
        grid.appendChild(el('section.panel', el('h2', 'Printer Setup'),
            el('p', 'Reports open as PDF in the browser. Print them with ' +
                'Ctrl+P (or the PDF viewer\'s printer button): choose the ' +
                'printer, the paper and the copies there. The printer ' +
                'settings are the computer\'s (Windows Settings > Printers).'),
            el('p', el('button', {type: 'button', onclick: function () {
                global.print();
            }}, 'Print Setup…'))));

        function select(options, value, blankLabel) {
            var node = el('select', [el('option', {value: ''},
                blankLabel || '')].concat(options.map(function (o) {
                    return el('option', {value: String(o[0])}, o[1]);
                })));
            node.value = value === null || value === undefined ? '' :
                String(value);
            return node;
        }

        function render(p) {
            UI.clear(prefs);
            prefs.appendChild(el('h2', 'Preferences'));
            var controls = {};
            var fields = [];
            function row(label, node, help) {
                fields.push(el('div', el('label.field', label), node,
                    help ? el('div.muted', help) : null));
            }
            row('Name', el('input', {type: 'text', value: p.name || '',
                readonly: true, 'aria-label': 'Name'}),
                'Your name and login come from N-Line BI.');
            row('Login', el('input', {type: 'text', value: p.login || '',
                readonly: true, 'aria-label': 'Login'}));
            controls.language = select(p.languages || [], p.language);
            row('Language', controls.language);
            controls.email = el('input', {type: 'text', value: p.email || '',
                'aria-label': 'Email'});
            row('Email', controls.email, 'Where the email alerts go.');
            controls.signature = el('textarea', {rows: 3,
                'aria-label': 'Signature'});
            controls.signature.value = p.signature || '';
            row('Signature', controls.signature);
            if (p.companies && p.companies.length > 1) {
                controls.company = select(p.companies, p.company ?
                    p.company[0] : null);
                row('Company', controls.company);
            }
            if (p.employees && p.employees.length) {
                controls.employee = select(p.employees, p.employee ?
                    p.employee[0] : null, '(none)');
                row('Employee', controls.employee, 'Who you are on labor ' +
                    'tickets and documents.');
            }
            if (p.warehouses && p.warehouses.length > 1) {
                controls.warehouse = select(p.warehouses, p.warehouse ?
                    p.warehouse[0] : null, '(none)');
                row('Warehouse', controls.warehouse);
            }
            prefs.appendChild(el('div.grid-form', fields));
            prefs.appendChild(el('div.toolbar', el('button.primary', {
                type: 'button', onclick: function () {
                    var values = {
                        language: controls.language.value || null,
                        email: controls.email.value || null,
                        signature: controls.signature.value || null
                    };
                    ['company', 'employee', 'warehouse'].forEach(
                        function (name) {
                            if (controls[name]) {
                                values[name] = controls[name].value ?
                                    parseInt(controls[name].value, 10) :
                                    null;
                            }
                        });
                    global.Rpc.desk('common_set_preferences', [values]).then(
                        function (saved) {
                            /* The screens' context follows at once; the
                             * other tabs on their next opening */
                            var session = global.Rpc.session();
                            if (session && session.context) {
                                session.context.language = saved.language;
                                ['company', 'employee', 'warehouse']
                                    .forEach(function (name) {
                                        if (saved[name] !== undefined) {
                                            session.context[name] =
                                                saved[name] ?
                                                saved[name][0] : null;
                                        }
                                    });
                            }
                            UI.toast('Preferences saved', 'ok');
                            render(saved);
                        }, UI.showError);
                }}, 'Save')));
        }

        global.Rpc.desk('common_preferences', []).then(render, function (e) {
            UI.clear(prefs).appendChild(el('h2', 'Preferences'));
            UI.showError(e);
        });
    };

    /* ---- Routes and the shared helpers -------------------------------- */

    routes.push(
        [/^#\/fob-points$/, 'jsFobPoints'],
        [/^#\/ship-vias$/, 'jsShipVias'],
        [/^#\/states$/, 'jsStates'],
        [/^#\/postal-codes$/, 'jsPostalCodes'],
        [/^#\/terms$/, 'terms'],
        [/^#\/product-codes$/, 'jsProductCodes'],
        [/^#\/commodity-codes$/, 'jsCommodityCodes'],
        [/^#\/reason-codes$/, 'jsReasonCodes'],
        [/^#\/currency-codes$/, 'jsCurrencyCodes'],
        [/^#\/alert-messages$/, 'jsAlertMessages'],
        [/^#\/control-panel$/, 'jsControlPanel']);

    global.JobshopCommon = {
        codeTable: codeTable,
        alertsPanel: alertsPanel,
        unreadAlerts: unreadAlerts
    };
}(window));
