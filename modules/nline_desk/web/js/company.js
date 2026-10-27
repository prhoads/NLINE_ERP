/* N-Line screens: company and setup (UI upgrade phase 7): Terms, the code
 * tables (Lists), Import of customers, suppliers and parts (CSV), Closing
 * Date, the screens' Settings and the Company information */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    /* ---- Terms ------------------------------------------------------------ */

    Screens.terms = function (main) {
        UI.master(main, {
            title: 'Terms',
            model: 'account.invoice.payment_term',
            label: 'Terms',
            order: [['name', 'ASC']],
            extra: [{label: 'Due dates', onclick: function (record) {
                if (record) {
                    UI.openRecord('account.invoice.payment_term', record.id,
                        record.rec_name);
                }
            }}],
            tabs: [{title: 'Terms', fields: [
                {name: 'name', label: 'Name', type: 'char', span: 2},
                {name: 'early_discount_rate', label:
                    'Early pay discount (0.02 = 2%)', type: 'decimal'},
                {name: 'early_discount_days', label: 'If paid within (days)',
                    type: 'integer'},
                {name: 'description', label: 'Description', type: 'text',
                    span: 4},
                {name: 'active', label: 'Active', type: 'boolean',
                    default: true}]}],
            browse: [
                {name: 'name', label: 'Terms'},
                {name: 'early_discount_rate', label: 'Discount'},
                {name: 'early_discount_days', label: 'Days'}]
        });
    };

    /* ---- Lists (code tables) ---------------------------------------------- */

    var LISTS = {
        uom: {title: 'Units of Measure', model: 'product.uom', fields: [
            {name: 'name', label: 'Name', type: 'char'},
            {name: 'symbol', label: 'Symbol', type: 'char'},
            {name: 'category', label: 'Category', type: 'many2one',
                model: 'product.uom.category'},
            {name: 'factor', label: 'Factor (to the category base)',
                type: 'float'},
            {name: 'rate', label: 'Rate', type: 'float'},
            {name: 'rounding', label: 'Rounding', type: 'float'},
            {name: 'active', label: 'Active', type: 'boolean',
                default: true}]},
        part_classes: {title: 'Part Categories', model: 'product.category',
            fields: [
                {name: 'name', label: 'Name', type: 'char', span: 2},
                {name: 'parent', label: 'Parent', type: 'many2one',
                    model: 'product.category'}]},
        party_categories: {title: 'Customer / Supplier Categories',
            model: 'party.category', fields: [
                {name: 'name', label: 'Name', type: 'char', span: 2},
                {name: 'parent', label: 'Parent', type: 'many2one',
                    model: 'party.category'},
                {name: 'active', label: 'Active', type: 'boolean',
                    default: true}]},
        resource_types: {title: 'Resource Types',
            model: 'production.work.center.category', fields: [
                {name: 'name', label: 'Name', type: 'char', span: 2}]},
        locations: {title: 'Locations', model: 'stock.location', fields: [
            {name: 'name', label: 'Name', type: 'char', span: 2},
            {name: 'code', label: 'Code', type: 'char'},
            {name: 'type', label: 'Type', type: 'selection', options: [
                ['storage', 'Storage'], ['view', 'View'],
                ['warehouse', 'Warehouse'], ['production', 'Production'],
                ['supplier', 'Supplier'], ['customer', 'Customer'],
                ['lost_found', 'Lost and Found']], default: 'storage'},
            {name: 'parent', label: 'Parent', type: 'many2one',
                model: 'stock.location'},
            {name: 'active', label: 'Active', type: 'boolean',
                default: true}]},
        account_types: {title: 'Account Types', model: 'account.account.type',
            writes: false, fields: [
                {name: 'name', label: 'Name', type: 'char', span: 2},
                {name: 'statement', label: 'Statement', type: 'char'}]}
    };

    Screens.lists = function (main) {
        main = UI.form(main, {title: 'Lists'}).body;
        main.appendChild(el('div.report-center', el('section.panel',
            el('h2', 'Lists'), Object.keys(LISTS).map(function (key) {
                return el('a.report-link', {href: '#', onclick: function (
                    event) {
                    event.preventDefault();
                    UI.openScreen('lists/' + key, LISTS[key].title);
                }}, el('strong', LISTS[key].title),
                    el('span.muted', LISTS[key].model));
            }))));
    };

    Screens.list = function (main, params) {
        var spec = LISTS[params[0]];
        if (!spec) {
            main.appendChild(el('p', 'Unknown list.'));
            return;
        }
        UI.setTitle(spec.title);
        UI.master(main, {
            title: spec.title,
            model: spec.model,
            label: spec.title,
            writes: spec.writes,
            order: [['name', 'ASC']],
            tabs: [{title: spec.title, fields: spec.fields}],
            browse: spec.fields.filter(function (f) {
                return f.type !== 'boolean';
            }).slice(0, 4)
        });
    };

    /* ---- Import (CSV) ---------------------------------------------------------- */

    var IMPORTS = {
        customers: ['name', 'street', 'city', 'postal_code', 'phone',
            'email'],
        suppliers: ['name', 'street', 'city', 'postal_code', 'phone',
            'email'],
        parts: ['code', 'name', 'type', 'unit', 'list_price', 'cost_price',
            'salable', 'purchasable', 'producible']
    };

    /* A CSV text as rows of cells (quotes and commas handled) */
    function parseCsv(text) {
        var rows = [], row = [], cell = '', quoted = false;
        for (var i = 0; i < text.length; i++) {
            var c = text[i];
            if (quoted) {
                if (c === '"' && text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else if (c === '"') {
                    quoted = false;
                } else {
                    cell += c;
                }
            } else if (c === '"') {
                quoted = true;
            } else if (c === ',' || c === '\t') {
                row.push(cell);
                cell = '';
            } else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') {
                    i++;
                }
                row.push(cell);
                cell = '';
                if (row.some(function (v) {
                    return v !== '';
                })) {
                    rows.push(row);
                }
                row = [];
            } else {
                cell += c;
            }
        }
        row.push(cell);
        if (row.some(function (v) {
            return v !== '';
        })) {
            rows.push(row);
        }
        return rows;
    }

    function truthy(v) {
        return /^(1|y|yes|true|x)$/i.test(String(v || '').trim());
    }

    Screens.importData = function (main) {
        main = UI.form(main, {title: 'Import'}).body;
        var kind = el('select', {'aria-label': 'Import'},
            el('option', {value: 'customers'}, 'Customers'),
            el('option', {value: 'suppliers'}, 'Suppliers'),
            el('option', {value: 'parts'}, 'Parts'));
        var file = el('input', {type: 'file', accept: '.csv,.txt,.tsv',
            'aria-label': 'File'});
        var text = el('textarea', {rows: 6, 'aria-label': 'CSV',
            placeholder: 'Or paste the rows here, the first row naming ' +
                'the columns'});
        var help = el('p.muted');
        var preview = el('div');
        var records = [];
        main.appendChild(el('div.panel', el('div.grid-form',
                el('div', el('label.field', 'Import'), kind),
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'File (CSV or tab separated)'), file)),
            help, text, el('div.toolbar', el('button', {type: 'button',
                onclick: read}, 'Preview'), el('span.spacer'),
                el('button.primary', {type: 'button', onclick: run},
                    'Import'))));
        main.appendChild(preview);

        function showHelp() {
            help.textContent = 'Columns: ' + IMPORTS[kind.value].join(', ') +
                (kind.value === 'parts' ? ' (type: goods or service; unit: ' +
                    'its name or symbol, e.g. u; yes/no flags)' : '') + '.';
        }

        function read() {
            var rows = parseCsv(text.value);
            if (rows.length < 2) {
                UI.showError('Paste or choose a file with a header row and ' +
                    'at least one row.');
                return;
            }
            var header = rows[0].map(function (h) {
                return h.trim().toLowerCase().replace(/\s+/g, '_');
            });
            var columns = IMPORTS[kind.value];
            var unknown = header.filter(function (h) {
                return columns.indexOf(h) < 0;
            });
            records = rows.slice(1).map(function (row) {
                var r = {};
                header.forEach(function (h, i) {
                    r[h] = (row[i] || '').trim();
                });
                return r;
            }).filter(function (r) {
                return r.name;
            });
            var body = el('tbody');
            records.slice(0, 50).forEach(function (r) {
                body.appendChild(el('tr', columns.map(function (c) {
                    return el('td', r[c] || '');
                })));
            });
            UI.clear(preview).appendChild(el('h2', records.length +
                ' row(s) to import' + (unknown.length ? ' (ignored ' +
                    'columns: ' + unknown.join(', ') + ')' : '')));
            preview.appendChild(el('div.table-wrap', el('table.data',
                el('thead', el('tr', columns.map(function (c) {
                    return el('th', c);
                }))), body)));
        }

        function partyValues(r) {
            var values = {name: r.name};
            if (r.street || r.city || r.postal_code) {
                values.addresses = [['create', [{street: r.street || null,
                    city: r.city || null, postal_code: r.postal_code ||
                    null}]]];
            }
            var contacts = [];
            if (r.phone) {
                contacts.push({type: 'phone', value: r.phone});
            }
            if (r.email) {
                contacts.push({type: 'email', value: r.email});
            }
            if (contacts.length) {
                values.contact_mechanisms = [['create', contacts]];
            }
            return values;
        }

        function partValues(r, units) {
            var unit = units[(r.unit || 'u').toLowerCase()] ||
                units.unit || units.u;
            var values = {name: r.name, code: r.code || null,
                type: r.type === 'service' ? 'service' : 'goods',
                default_uom: unit,
                list_price: global.Rpc.decimal(UI.parseMoney(r.list_price)),
                salable: truthy(r.salable),
                purchasable: truthy(r.purchasable),
                producible: truthy(r.producible),
                products: [['create', [{}]]]};
            if (r.cost_price) {
                values.cost_price = global.Rpc.decimal(UI.parseMoney(
                    r.cost_price));
            }
            return values;
        }

        function run() {
            if (!records.length) {
                read();
                if (!records.length) {
                    return;
                }
            }
            var parts = kind.value === 'parts';
            var units = Promise.resolve({});
            if (parts) {
                units = Rpc.searchRead('product.uom', [], ['name', 'symbol'])
                    .then(function (rows) {
                        var map = {};
                        rows.forEach(function (u) {
                            map[u.name.toLowerCase()] = u.id;
                            map[(u.symbol || '').toLowerCase()] = u.id;
                        });
                        return map;
                    });
            }
            units.then(function (map) {
                var values = records.map(function (r) {
                    return parts ? partValues(r, map) : partyValues(r);
                });
                var model = parts ? 'product.template' : 'party.party';
                var batches = [];
                for (var i = 0; i < values.length; i += 50) {
                    batches.push(values.slice(i, i + 50));
                }
                var done = 0;
                return batches.reduce(function (promise, batch) {
                    return promise.then(function () {
                        return Rpc.model(model, 'create', [batch]).then(
                            function (ids) {
                                done += ids.length;
                            });
                    });
                }, Promise.resolve()).then(function () {
                    UI.toast(done + ' ' + kind.value + ' imported', 'ok');
                    records = [];
                    UI.clear(preview);
                    text.value = '';
                }, function (error) {
                    UI.toast(done + ' imported before the error', 'error');
                    UI.showError(error);
                });
            });
        }

        file.addEventListener('change', function () {
            if (file.files[0]) {
                file.files[0].text().then(function (content) {
                    text.value = content;
                    read();
                });
            }
        });
        kind.addEventListener('change', function () {
            showHelp();
            records = [];
            UI.clear(preview);
        });
        showHelp();
    };

    /* ---- Closing Date -------------------------------------------------------- */

    Screens.closing = function (main) {
        main = UI.form(main, {title: 'Set Closing Date'}).body;
        var date = el('input', {type: 'date', 'aria-label': 'Closing date'});
        var body = el('tbody');
        main.appendChild(el('div.panel', el('p', 'Close the books through ' +
            'a date: no entry can be posted in the closed periods any more ' +
            '(all their entries must be posted).'), el('div.toolbar',
            el('label.field', 'Closing date'), date, el('button.primary', {
                type: 'button', onclick: function () {
                    if (!date.value) {
                        UI.showError('Choose the closing date.');
                        return;
                    }
                    UI.confirm('Set Closing Date', 'Close every period ' +
                        'ending on or before ' + UI.date(date.value) + '?')
                        .then(function (ok) {
                            if (!ok) {
                                return;
                            }
                            Rpc.desk('close_periods', [date.value]).then(
                                function (count) {
                                    UI.toast(count + ' period(s) closed',
                                        'ok');
                                    load();
                                }, UI.showError);
                        });
                }}, 'Close Periods'))));
        main.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', 'Fiscal year'), el('th', 'Period'),
                el('th', 'From'), el('th', 'To'), el('th', 'Status'))),
            body)));

        function load() {
            Rpc.desk('periods', []).then(function (rows) {
                UI.clear(body);
                rows.forEach(function (p) {
                    body.appendChild(el('tr', el('td', p.fiscalyear),
                        el('td', p.name), el('td', UI.date(p.start_date)),
                        el('td', UI.date(p.end_date)),
                        el('td', el('span.badge.' + (p.state === 'open' ?
                            'open' : 'paid'), p.state))));
                });
            }, UI.showError);
        }
        load();
    };

    /* ---- Settings and Company information --------------------------------------- */

    Screens.settings = function (main) {
        UI.master(main, {
            title: 'N-Line Settings',
            model: 'nline.desk.configuration',
            label: 'Settings',
            open: 1,
            single: true,
            tabs: [{title: 'Accounts', fields: [
                {name: 'undeposited_account', label: 'Undeposited funds',
                    type: 'many2one', model: 'account.account', span: 2},
                {name: 'deposit_journal', label: 'Deposit journal',
                    type: 'many2one', model: 'account.journal', span: 2},
                {name: 'early_discount_account', label:
                    'Early pay discounts taken', type: 'many2one',
                    model: 'account.account', span: 2},
                {name: 'sales_discount_account', label:
                    'Sales discounts given', type: 'many2one',
                    model: 'account.account', span: 2}]}]
        });
    };

    Screens.companyInfo = function (main) {
        UI.master(main, {
            title: 'Company Information',
            model: 'company.company',
            label: 'Company',
            open: Rpc.context().company,
            single: true,
            tabs: [{title: 'Company', fields: [
                {name: 'party', label: 'Company (name, addresses)',
                    type: 'many2one', model: 'party.party', span: 2,
                    readonly: true},
                {name: 'currency', label: 'Currency', type: 'many2one',
                    model: 'currency.currency', readonly: true},
                {name: 'timezone', label: 'Time zone', type: 'char'},
                {name: 'header', label: 'Report header', type: 'text',
                    span: 2},
                {name: 'footer', label: 'Report footer', type: 'text',
                    span: 2}]}],
            extra: [{label: 'Name & Addresses', onclick: function (record) {
                if (record && record.party) {
                    UI.openRecord('party.party', record.party,
                        record.rec_name);
                }
            }}]
        });
    };
}(window));
