/* N-Line Jobshop emulation: sales screens (module nline_js_sales; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * Jobshop's Sales group bar: Customers, Sales Orders, Shipping, Invoicing
 * and the code tables (Service Charges, Tax Groups, Sales Reps,
 * Territories, SIC Codes, Carriers, Discount Classes). The first four take
 * over the desk's screens of js/orders.js at the same routes and keep what
 * they did. */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    routes.push(
        [/^#\/customer-window$/, 'customerWindow'],
        [/^#\/customer-window\/(\d+)$/, 'customerWindow'],
        [/^#\/orders\/new$/, 'salesOrder'],
        [/^#\/orders\/(\d+)$/, 'salesOrder'],
        [/^#\/shipping$/, 'shipping'],
        [/^#\/shipping\/(\d+)$/, 'shipping'],
        [/^#\/invoicing$/, 'invoicing'],
        [/^#\/invoicing\/(\d+)$/, 'invoicing'],
        [/^#\/service-charges$/, 'jsServiceCharges'],
        [/^#\/service-charges\/(\d+)$/, 'jsServiceCharges'],
        [/^#\/sales-tax-groups$/, 'jsSalesTaxGroups'],
        [/^#\/sales-tax-groups\/(\d+)$/, 'jsSalesTaxGroups'],
        [/^#\/sales-reps$/, 'jsSalesReps'],
        [/^#\/sales-reps\/(\d+)$/, 'jsSalesReps'],
        [/^#\/territories$/, 'jsTerritories'],
        [/^#\/territories\/(\d+)$/, 'jsTerritories'],
        [/^#\/sic-codes$/, 'jsSicCodes'],
        [/^#\/sic-codes\/(\d+)$/, 'jsSicCodes'],
        [/^#\/carriers$/, 'jsCarriers'],
        [/^#\/carriers\/(\d+)$/, 'jsCarriers'],
        [/^#\/discount-classes$/, 'jsDiscountClasses'],
        [/^#\/discount-classes\/(\d+)$/, 'jsDiscountClasses']);

    /* ---- Shared helpers ---------------------------------------------- */

    var CSS = [
        '.js-sales-tabs { margin-top: 8px; }',
        '.js-sales .lines-ro td.num, .js-sales .lines-ro th.num ' +
            '{ text-align: right; }',
        '.js-sales tr.selected td { background: var(--accent-soft); }',
        '.js-sales .js-status { margin-left: 8px; }',
        '.js-sales .js-late { color: var(--bad); }',
        '.js-sales .js-totals { display: flex; gap: 24px; ' +
            'justify-content: flex-end; margin-top: 8px; }',
        '.js-sales .js-totals div { text-align: right; }',
        '.js-sales .js-address { white-space: pre-line; }',
        '.js-sales input.js-qty { width: 7em; text-align: right; }',
        '.js-sales td input, .js-sales td select { width: 100%; ' +
            'box-sizing: border-box; }',
        '.js-sales td input[type=checkbox] { width: auto; }',
        '.js-sales .js-prices { display: grid; ' +
            'grid-template-columns: 2fr 1fr; gap: 12px; }',
        '.js-sales .js-empty { color: var(--muted); }',
        '.js-sales .js-readonly { color: var(--muted); }'
    ].join('\n');

    function injectCss() {
        if (!global.document.getElementById('nl-js-sales-css')) {
            global.document.head.appendChild(el('style',
                {id: 'nl-js-sales-css'}, CSS));
        }
    }

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function name(v) {
        return v && typeof v === 'object' ? v.rec_name || '' :
            v === null || v === undefined ? '' : String(v);
    }

    function num(v) {
        return v === null || v === undefined || v === '' ? '' :
            String(Math.round(Number(v) * 10000) / 10000);
    }

    function idOf(v) {
        return v && typeof v === 'object' ? v.id : v || null;
    }

    function iso(v) {
        /* A date control's value (Rpc.date) back to ISO for the services */
        if (!v) {
            return null;
        }
        if (typeof v === 'string') {
            return v;
        }
        if (v.__class__ === 'date') {
            var pad = function (n) {
                return (n < 10 ? '0' : '') + n;
            };
            return v.year + '-' + pad(v.month) + '-' + pad(v.day);
        }
        return String(v).slice(0, 10);
    }

    function label(options, value) {
        var found = options.filter(function (o) {
            return o[0] === value;
        })[0];
        return found ? found[1] : value || '';
    }

    var JS_STATUS = [['unreleased', 'Unreleased'], ['firm', 'Firm'],
        ['released', 'Released'], ['hold', 'Hold'], ['closed', 'Closed'],
        ['cancelled', 'Cancelled']];
    var LINE_STATUS = [['open', 'Open'], ['closed', 'Closed'],
        ['cancelled', 'Cancelled']];
    var FREIGHT_TERMS = [[null, ''], ['billed', 'Billed'],
        ['collect', 'Collect'], ['prepaid', 'Prepaid']];
    var CREDIT_STATUS = [['approved', 'Approved'],
        ['hold_orders', 'Hold Orders'], ['hold_shipments', 'Hold Shipments']];
    var QUOTE_TYPES = [['break', 'Break table'], ['up_to', 'Up-to-Qty table']];

    /* Jobshop's tabs: [{title, build(pane)}] -> {show(index), panes} */
    function tabs(main, specs) {
        var bar = el('div.tabs.js-sales-tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        var nodes = [];
        var current = 0;
        function show(index) {
            current = index;
            Array.prototype.forEach.call(bar.children, function (b, i) {
                b.classList.toggle('active', i === index);
                b.setAttribute('aria-selected', i === index);
            });
            nodes.forEach(function (p, i) {
                p.hidden = i !== index;
            });
            if (specs[index].onshow) {
                specs[index].onshow(nodes[index]);
            }
        }
        specs.forEach(function (spec, index) {
            var button = el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(index);
                }}, spec.title);
            spec.button = button;
            bar.appendChild(button);
            var pane = el('div.tab-pane.panel', {role: 'tabpanel'});
            nodes.push(pane);
            panes.appendChild(pane);
            if (spec.build) {
                spec.build(pane);
            }
        });
        main.appendChild(bar);
        main.appendChild(panes);
        show(0);
        return {show: show, panes: nodes, current: function () {
            return current;
        }};
    }

    /* A data table: columns [{label, num}], rows [{cells: [...], ondblclick,
     * oncontextmenu, className}] */
    function table(columns, rows, empty) {
        var body = el('tbody');
        rows.forEach(function (row) {
            body.appendChild(el('tr' + (row.className ? '.' + row.className :
                ''), {title: row.ondblclick ? 'Double-click to open' : null,
                ondblclick: row.ondblclick || null,
                oncontextmenu: row.oncontextmenu || null,
                onclick: row.onclick || null}, row.cells.map(
                function (cell, i) {
                    return el('td' + (columns[i] && columns[i].num ?
                        '.num' : ''), cell === null || cell === undefined ?
                        '' : cell);
                })));
        });
        if (!rows.length) {
            body.appendChild(el('tr', el('td.js-empty', {colspan:
                columns.length}, empty || 'None.')));
        }
        return el('div.table-wrap', el('table.data.lines-ro', el('thead',
            el('tr', columns.map(function (c) {
                return el('th' + (c.num ? '.num' : ''), c.label);
            }))), body));
    }

    /* A grid of field controls (UI.fieldControl): {node, get(), set(data),
     * controls} where data holds {name: value | {id, rec_name}} */
    function fieldGrid(fields) {
        var controls = {};
        var grid = el('div.grid-form', fields.map(function (f) {
            var c = UI.fieldControl(f);
            c.field = f;
            controls[f.name] = c;
            return el('div', f.span ? {style: {gridColumn: 'span ' +
                f.span}} : null, el('label.field', f.label), c.node);
        }));
        return {
            node: grid,
            controls: controls,
            set: function (data) {
                fields.forEach(function (f) {
                    var v = data ? data[f.name] : null;
                    controls[f.name].set(v === undefined ? (f.default !==
                        undefined ? f.default : null) : v);
                });
            },
            get: function () {
                var values = {};
                fields.forEach(function (f) {
                    if (!f.readonly) {
                        var v = controls[f.name].get();
                        values[f.name] = f.type === 'date' ? iso(v) :
                            f.type === 'money' || f.type === 'decimal' ?
                                (v ? v.decimal : null) : v;
                    }
                });
                return values;
            },
            lock: function (editable) {
                fields.forEach(function (f) {
                    Array.prototype.forEach.call(controls[f.name].node
                        .querySelectorAll ? controls[f.name].node
                        .querySelectorAll('input, select, textarea, button') :
                        [], function (n) {
                            n.disabled = !editable || Boolean(f.readonly);
                        });
                    var n = controls[f.name].node;
                    if (n.matches && n.matches('input, select, textarea')) {
                        n.disabled = !editable || Boolean(f.readonly);
                    }
                });
            }
        };
    }

    var ADDRESS_ROWS = [['name', 'Name'], ['street', 'Address'],
        ['city', 'City'], ['state', 'State'], ['postal_code', 'Postal Code'],
        ['country', 'Country'], ['contact', 'Contact'], ['title', 'Title'],
        ['phone', 'Phone'], ['fax', 'Fax'], ['email', 'E-mail']];

    /* A Sold To / Ship To / Bill To tab (read-only, as in Jobshop) */
    function addressPane(pane, address, note) {
        UI.clear(pane);
        address = address || {};
        pane.appendChild(el('div.grid-form', ADDRESS_ROWS.map(function (r) {
            return el('div', r[0] === 'street' ? {style: {gridColumn:
                'span 2'}} : null, el('label.field', r[1]),
                el('div.js-address', address[r[0]] || ''));
        })));
        if (note) {
            pane.appendChild(el('p.muted', note));
        }
    }

    /* The Charges tab: rows of service charges.
     * options: {editable, adding, fields: ['amount', 'apply', ...]}
     * -> {node, set(charges), values()} */
    function chargesEditor(options) {
        var body = el('tbody');
        var rows = [];
        var node = el('div');
        var editable = options.editable;

        function addRow(charge) {
            charge = charge || {};
            var locked = !editable || Boolean(charge.invoice) &&
                !options.invoiceEdit;
            var service = UI.picker('nline.service_charge', {label:
                'Service Charge ID', placeholder: 'Service Charge ID',
                fields: ['description', 'amount', 'account',
                    'account.rec_name'], onselect: function (r) {
                    description.value = r.description || '';
                    amount.value = UI.money(r.amount || 0);
                    if (r.account) {
                        account.set(r.account, (r['account.'] || {})
                            .rec_name);
                    }
                }});
            service.set(idOf(charge.service_charge), name(
                charge.service_charge));
            var description = el('input', {type: 'text', 'aria-label':
                'Description', value: charge.description || ''});
            var amount = UI.moneyInput({'aria-label': 'Amount'});
            amount.value = charge.amount === undefined || charge.amount ===
                null ? '' : UI.money(charge.amount);
            var group = UI.picker('nline.sales_tax_group', {label:
                'Tax Group ID', placeholder: 'Tax Group'});
            group.set(idOf(charge.tax_group), name(charge.tax_group));
            var apply = el('input', {type: 'checkbox', 'aria-label': 'Apply'});
            apply.checked = charge.apply === undefined ? true :
                Boolean(charge.apply);
            var account = UI.picker('account.account', {label:
                'Revenue Account ID', placeholder: 'Revenue Account',
                domain: [['type.revenue', '=', true]]});
            account.set(idOf(charge.account), name(charge.account));
            var row = {id: charge.id || null, charge: charge, service: service,
                description: description, amount: amount, group: group,
                apply: apply, account: account};
            [service.input, description, amount, group.input, apply,
                account.input].forEach(function (n) {
                    n.disabled = locked;
                });
            if (charge.id) {
                /* An existing charge keeps its service charge */
                service.input.disabled = true;
            }
            var tr = el('tr', el('td', service.node), el('td', description),
                el('td', amount), el('td', group.node), el('td', apply),
                el('td', account.node),
                el('td.num', charge.applied_amount ?
                    UI.money(charge.applied_amount) : ''),
                el('td', charge.invoice ? name(charge.invoice) || 'Invoiced' :
                    charge.shipment ? name(charge.shipment) : ''),
                el('td.row-delete', locked ? null : el('button', {type:
                    'button', title: 'Delete charge', 'aria-label':
                    'Delete charge', onclick: function () {
                        rows.splice(rows.indexOf(row), 1);
                        tr.remove();
                    }}, '✕')));
            rows.push(row);
            body.appendChild(tr);
        }

        node.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', 'Service Charge ID'), el('th', 'Description'),
                el('th.num', 'Amount'), el('th', 'Tax Group ID'),
                el('th', 'Apply'), el('th', 'Revenue Account ID'),
                el('th.num', 'Applied Amount'), el('th', 'Applied to'),
                el('th', ''))), body)));
        var add = el('button', {type: 'button', onclick: function () {
            addRow(null);
        }}, 'Add charge');
        node.appendChild(el('div.toolbar', add));
        return {
            node: node,
            set: function (charges, canEdit) {
                if (canEdit !== undefined) {
                    editable = canEdit;
                }
                add.hidden = !editable || options.adding === false;
                UI.clear(body);
                rows = [];
                (charges || []).forEach(addRow);
            },
            values: function () {
                return rows.filter(function (r) {
                    return r.id || r.service.value();
                }).map(function (r) {
                    return {
                        id: r.id,
                        service_charge: r.service.value(),
                        description: r.description.value || null,
                        amount: r.amount.value === '' ? null :
                            String(UI.parseMoney(r.amount.value)),
                        tax_group: r.group.value(),
                        apply: r.apply.checked,
                        account: r.account.value()
                    };
                });
            }
        };
    }

    /* Right-click menu for a button: UI.contextMenu at the button */
    function menuAt(button, items) {
        var box = button.getBoundingClientRect();
        UI.contextMenu({preventDefault: function () {}, clientX: box.left,
            clientY: box.bottom}, items);
    }

    /* What the user may do: {model: {read, write, create, delete}} with
     * true when unknown (the server still refuses) */
    function rights(models) {
        return UI.access(models).then(function (result) {
            var r = {};
            models.forEach(function (m) {
                var a = result[m] || {};
                r[m] = {read: a.read !== false, write: a.write !== false,
                    create: a.create !== false, delete: a.delete !== false};
            });
            return r;
        });
    }

    function openOrder(id, number) {
        UI.openScreen('orders/' + id, 'Order ' + (number || id));
    }

    /* ---- Code tables ---------------------------------------------------- */

    function codeTable(main, params, options) {
        injectCss();
        var fields = [
            {name: 'code', label: 'ID', type: 'char'},
            {name: 'description', label: options.descriptionLabel ||
                'Description', type: 'char', span: 2}
        ].concat(options.fields || []).concat([
            {name: 'active', label: 'Active', type: 'boolean',
                default: true}]);
        UI.master(main, {
            title: options.title,
            model: options.model,
            label: options.label,
            order: [['code', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            tabs: [{title: options.tab || options.title, fields: fields}]
                .concat(options.tabs || []),
            browse: [{name: 'code', label: options.label},
                {name: 'description', label: options.descriptionLabel ||
                    'Description'}].concat(options.browse || [])
        });
        main.classList.add('js-sales');
    }

    Screens.jsServiceCharges = function (main, params) {
        codeTable(main, params, {title: 'Service Charges',
            model: 'nline.service_charge', label: 'Service Charge ID',
            fields: [
                {name: 'amount', label: 'Amount', type: 'money'},
                {name: 'account', label: 'Revenue Account ID',
                    type: 'many2one', model: 'account.account',
                    domain: [['type.revenue', '=', true]]}],
            browse: [{name: 'amount', label: 'Amount', type: 'money'},
                {name: 'account', label: 'Account ID', type: 'many2one'}]});
    };

    Screens.jsSalesTaxGroups = function (main, params) {
        codeTable(main, params, {title: 'Sales Tax Groups',
            model: 'nline.sales_tax_group', label: 'Tax Group ID',
            tab: 'Tax Group',
            tabs: [{title: 'Taxes', lines: {name: 'lines',
                model: 'nline.sales_tax_group.line', inverse: 'group',
                order: [['tax_name', 'ASC'], ['effective_date', 'ASC']],
                fields: [
                    {name: 'tax_name', label: 'Tax Name', type: 'char'},
                    {name: 'description', label: 'Description',
                        type: 'char'},
                    {name: 'effective_date', label: 'Effective',
                        type: 'date'},
                    {name: 'account', label: 'Account ID',
                        type: 'many2one', model: 'account.account',
                        domain: [['type', '!=', null],
                            ['closed', '!=', true]]},
                    {name: 'percent', label: 'Tax Percent',
                        type: 'decimal'},
                    /* The Tryton tax the line is (made from the line when
                     * it has an account) */
                    {name: 'tax', label: 'Tryton Tax', type: 'many2one',
                        model: 'account.tax'}]}}]});
    };

    Screens.jsSalesReps = function (main, params) {
        codeTable(main, params, {title: 'Sales Reps',
            model: 'nline.sales_rep', label: 'Sales Rep ID',
            tab: 'Sales Representative', descriptionLabel: 'Name',
            fields: [{name: 'commission', label: 'Commission %',
                type: 'decimal'}]});
    };

    Screens.jsTerritories = function (main, params) {
        codeTable(main, params, {title: 'Territories',
            model: 'nline.territory', label: 'Territory ID',
            tab: 'Territory'});
    };

    Screens.jsSicCodes = function (main, params) {
        codeTable(main, params, {title: 'SIC Codes',
            model: 'nline.sic_code', label: 'SIC Code', tab: 'SIC Code'});
    };

    Screens.jsCarriers = function (main, params) {
        codeTable(main, params, {title: 'Carriers', model: 'nline.carrier',
            label: 'Carrier ID', tab: 'Carrier', descriptionLabel: 'Name',
            fields: [
                {name: 'carrier_code', label: 'Carrier Code', type: 'char'},
                {name: 'route', label: 'Route', type: 'char'},
                {name: 'cod_charge', label: 'COD Charge', type: 'money'},
                {name: 'instructions', label: 'Shipper Instructions',
                    type: 'text', span: 3}],
            browse: [{name: 'carrier_code', label: 'Carrier Code'},
                {name: 'route', label: 'Route'}]});
    };

    Screens.jsDiscountClasses = function (main, params) {
        codeTable(main, params, {title: 'Discount Classes',
            model: 'nline.discount_class', label: 'Discount Class ID',
            tab: 'Discount Class',
            fields: [{name: 'discount_percent', label: 'Discount Percent',
                type: 'decimal'}],
            tabs: [{title: 'Prices', render: function (pane, record) {
                pricesTab(pane, 'discount_class', record.id);
            }}],
            browse: [{name: 'discount_percent', label: 'Discount %',
                type: 'float'}]});
    };

    /* ---- Prices: the quantity / price break tables -------------------- */

    /* The Prices tab of a customer (owner 'party') or a discount class:
     * the table of quoted parts (upper part) and, for the selected one, its
     * Quantities (Qty Break, Unit Price), saved with "Save Prices" */
    function pricesTab(pane, owner, ownerId) {
        var listPane = el('div');
        var editPane = el('div.panel');
        pane.appendChild(el('div.js-prices', listPane, editPane));
        var writable = false;

        function load(selectId) {
            Rpc.searchRead('nline.sale_price', [[owner, '=', ownerId]],
                ['product', 'product.rec_name', 'unit', 'unit.rec_name',
                    'customer_part', 'quote_type', 'as_of', 'expires',
                    'use_part_price', 'default_unit_price', 'breaks',
                    'create_date'], {order: [['id', 'ASC']]}).then(
                function (prices) {
                    UI.clear(listPane).appendChild(table([
                        {label: 'Part ID'}, {label: 'Customer Part ID'},
                        {label: 'Selling U/M'}, {label: 'Type'},
                        {label: 'As Of'}, {label: 'Expires'},
                        {label: 'Quoted'}],
                        prices.map(function (p) {
                            return {cells: [(p['product.'] || {}).rec_name,
                                p.customer_part || '',
                                (p['unit.'] || {}).rec_name || '',
                                label(QUOTE_TYPES, p.quote_type),
                                UI.date(p.as_of), UI.date(p.expires),
                                UI.date(p.create_date)],
                                className: p.id === selectId ? 'selected' :
                                    '', onclick: function () {
                                    edit(p);
                                    load(p.id);
                                }};
                        }), 'No price break table yet.'));
                    if (writable) {
                        listPane.appendChild(el('div.toolbar', el('button', {
                            type: 'button', onclick: function () {
                                edit(null);
                            }}, 'New price break table')));
                    }
                    var selected = prices.filter(function (p) {
                        return p.id === selectId;
                    })[0];
                    if (!selectId) {
                        UI.clear(editPane).appendChild(el('p.muted',
                            'Choose a part to see its quantities.'));
                    } else if (selected) {
                        edit(selected);
                    }
                }, UI.showError);
        }

        function edit(price) {
            UI.clear(editPane);
            var head = fieldGrid([
                {name: 'product', label: 'Part ID', type: 'many2one',
                    model: 'product.product', domain: [['salable', '=',
                        true]], span: 2},
                {name: 'unit', label: 'Selling U/M', type: 'many2one',
                    model: 'product.uom'},
                {name: 'customer_part', label: 'Customer Part ID',
                    type: 'char'},
                {name: 'quote_type', label: 'Type', type: 'selection',
                    options: QUOTE_TYPES, default: 'break'},
                {name: 'as_of', label: 'As Of', type: 'date'},
                {name: 'expires', label: 'Expires', type: 'date'},
                {name: 'default_unit_price', label: 'Default Price',
                    type: 'decimal'},
                {name: 'use_part_price', label: 'Use Part Price',
                    type: 'boolean'}]);
            var data = price ? Object.assign({}, price, {
                product: price.product ? {id: price.product, rec_name:
                    (price['product.'] || {}).rec_name} : null,
                unit: price.unit ? {id: price.unit, rec_name: (price[
                    'unit.'] || {}).rec_name} : null}) : null;
            head.set(data);
            head.lock(writable);
            editPane.appendChild(el('h3', {style: {marginTop: 0}},
                'Quantities'));
            editPane.appendChild(head.node);
            var body = el('tbody');
            var breaks = [];
            function addBreak(b) {
                var qty = el('input.js-qty', {type: 'text', value: b ?
                    num(b.quantity) : '', 'aria-label': 'Qty Break'});
                var unitPrice = el('input.js-qty', {type: 'text', value: b ?
                    num(b.unit_price) : '', 'aria-label': 'Unit Price'});
                qty.disabled = unitPrice.disabled = !writable;
                var row = {id: b ? b.id : null, qty: qty, price: unitPrice};
                var tr = el('tr', el('td', qty), el('td', unitPrice),
                    el('td.row-delete', writable ? el('button', {type:
                        'button', 'aria-label': 'Delete break',
                        onclick: function () {
                            breaks.splice(breaks.indexOf(row), 1);
                            tr.remove();
                        }}, '✕') : null));
                breaks.push(row);
                body.appendChild(tr);
            }
            editPane.appendChild(el('div.table-wrap', el('table.data',
                el('thead', el('tr', el('th.num', 'Qty Break'),
                    el('th.num', 'Unit Price'), el('th', ''))), body)));
            var buttons = el('div.toolbar');
            editPane.appendChild(buttons);
            if (writable) {
                buttons.appendChild(el('button', {type: 'button',
                    onclick: function () {
                        addBreak(null);
                    }}, 'Add quantity'));
                buttons.appendChild(el('button.primary', {type: 'button',
                    onclick: save}, 'Save Prices'));
                if (price) {
                    buttons.appendChild(el('button', {type: 'button',
                        onclick: function () {
                            UI.confirm('Delete', 'Delete the price break ' +
                                'table of this part?').then(function (ok) {
                                if (ok) {
                                    Rpc.model('nline.sale_price', 'delete',
                                        [[price.id]]).then(function () {
                                            load(null);
                                        }, UI.showError);
                                }
                            });
                        }}, 'Delete'));
                }
            }
            if (price && price.breaks && price.breaks.length) {
                Rpc.searchRead('nline.sale_price.break', [['price', '=',
                    price.id]], ['quantity', 'unit_price'], {order:
                    [['quantity', 'ASC']]}).then(function (rows) {
                        rows.forEach(addBreak);
                    }, UI.showError);
            } else if (writable) {
                addBreak(null);
            }

            function save() {
                var values = head.get();
                if (!values.product) {
                    UI.showError('Choose the part.');
                    return;
                }
                values[owner] = ownerId;
                values.default_unit_price = values.default_unit_price ?
                    Rpc.decimal(values.default_unit_price) : null;
                values.as_of = values.as_of ? Rpc.date(values.as_of) : null;
                values.expires = values.expires ? Rpc.date(values.expires) :
                    null;
                var create = [], actions = [];
                breaks.forEach(function (b) {
                    if (b.qty.value === '' || b.price.value === '') {
                        return;
                    }
                    var v = {quantity: parseFloat(b.qty.value), unit_price:
                        Rpc.decimal(UI.parseMoney(b.price.value))};
                    if (b.id) {
                        actions.push(['write', [b.id], v]);
                    } else {
                        create.push(v);
                    }
                });
                if (create.length) {
                    actions.push(['create', create]);
                }
                var kept = breaks.map(function (b) {
                    return b.id;
                });
                var removed = (price && price.breaks || []).filter(
                    function (i) {
                        return kept.indexOf(i) < 0;
                    });
                if (removed.length) {
                    actions.push(['delete', removed]);
                }
                values.breaks = actions;
                var call = price ? Rpc.model('nline.sale_price', 'write',
                    [[price.id], values]).then(function () {
                        return price.id;
                    }) : Rpc.model('nline.sale_price', 'create', [[values]])
                    .then(function (ids) {
                        return ids[0];
                    });
                call.then(function (id) {
                    UI.toast('Prices saved', 'ok');
                    load(id);
                }, UI.showError);
            }
        }

        rights(['nline.sale_price']).then(function (r) {
            writable = r['nline.sale_price'].write &&
                r['nline.sale_price'].create;
            load(null);
        });
    }

    /* ---- Customers ------------------------------------------------------- */

    var CONTACT_TYPES = [['phone', 'Phone'], ['mobile', 'Mobile'],
        ['email', 'E-Mail'], ['fax', 'Fax'], ['website', 'Website'],
        ['other', 'Other']];

    function documentsTab(model, domain, columns, open) {
        return function (pane, record) {
            Rpc.searchRead(model, domain(record), columns.map(function (c) {
                return c[0];
            }), {limit: 300, order: [['id', 'DESC']]}).then(function (rows) {
                pane.appendChild(table(columns.map(function (c) {
                    return {label: c[1], num: c[2]};
                }), rows.map(function (row) {
                    return {ondblclick: open ? function () {
                        open(row);
                    } : null, cells: columns.map(function (c) {
                        var v = row[c[0]];
                        return c[2] ? UI.money(v) : c[3] ? label(c[3], v) :
                            /date/.test(c[0]) ? UI.date(v) : v === null ||
                            v === undefined ? '' : String(v);
                    })};
                })));
            }, UI.showError);
        };
    }

    /* The Sales Orders tab: Released orders first, other statuses from the
     * right-click menu (as Jobshop) */
    function customerOrdersTab(pane, record) {
        var status = ['released'];
        var holder = el('div');
        pane.appendChild(el('p.muted', 'Right-click the list to show the ' +
            'orders of other statuses.'));
        pane.appendChild(holder);
        var allowed = false;
        UI.screenAllowed('orders').then(function (ok) {
            allowed = ok;
        });

        function load() {
            var domain = [['party', '=', record.id]];
            if (status) {
                domain.push(['js_status', 'in', status]);
            }
            Rpc.searchRead('sale.sale', domain, ['number', 'js_status',
                'reference', 'sale_date', 'shipping_date', 'promise_date',
                'js_last_shipped_date', 'total_amount', 'js_shipped_amount',
                'js_quote'], {limit: 300, order: [['sale_date', 'DESC'],
                    ['id', 'DESC']]}).then(function (rows) {
                    var node = table([{label: 'Order ID'}, {label: 'Status'},
                        {label: 'Purchase Order Number'},
                        {label: 'Order Date'}, {label: 'Desired Ship Date'},
                        {label: 'Promise Date'}, {label: 'Last Shipped Date'},
                        {label: 'Order Amount', num: true},
                        {label: 'Shipped Amount', num: true},
                        {label: 'Quote ID'}], rows.map(function (row) {
                        return {ondblclick: function () {
                            if (allowed) {
                                openOrder(row.id, row.number);
                            }
                        }, cells: [row.number || String(row.id),
                            label(JS_STATUS, row.js_status),
                            row.reference || '', UI.date(row.sale_date),
                            UI.date(row.shipping_date),
                            UI.date(row.promise_date),
                            UI.date(row.js_last_shipped_date),
                            UI.money(row.total_amount),
                            UI.money(row.js_shipped_amount),
                            row.js_quote || '']};
                    }), 'No ' + (status ? status.map(function (s) {
                        return label(JS_STATUS, s);
                    }).join(', ') : '') + ' order.');
                    UI.clear(holder).appendChild(node);
                }, UI.showError);
        }
        holder.addEventListener('contextmenu', function (event) {
            UI.contextMenu(event, JS_STATUS.map(function (s) {
                return {label: 'Show ' + s[1], onclick: function () {
                    status = [s[0]];
                    load();
                }};
            }).concat(['-', {label: 'Show All', onclick: function () {
                status = null;
                load();
            }}]));
        });
        load();
    }

    Screens.customerWindow = function (main, params) {
        injectCss();
        var openOrders = false, openInvoices = false;
        UI.screenAllowed('orders').then(function (ok) {
            openOrders = ok;
        });
        UI.screenAllowed('invoicing').then(function (ok) {
            openInvoices = ok;
        });
        var ref = function (field, label, model, extra) {
            return Object.assign({name: field, label: label,
                type: 'many2one', model: model}, extra || {});
        };
        UI.master(main, {
            title: 'Customers',
            model: 'party.party',
            label: 'Customer ID',
            order: [['name', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            tabs: [
                {title: 'Customers', fields: [
                    {name: 'code', label: 'ID', type: 'char',
                        readonly: true},
                    {name: 'name', label: 'Name', type: 'char', span: 2},
                    {name: 'active', label: 'Active', type: 'boolean',
                        default: true},
                    {name: 'sold_to_street', label: 'Address',
                        type: 'text', rows: 2, span: 2},
                    {name: 'sold_to_city', label: 'City', type: 'char'},
                    ref('sold_to_subdivision', 'State',
                        'country.subdivision'),
                    {name: 'sold_to_postal_code', label: 'Postal Code',
                        type: 'char'},
                    ref('sold_to_country', 'Country', 'country.country'),
                    {name: 'sold_to_name', label: 'Etc. (attention)',
                        type: 'char'},
                    {name: 'contact_title', label: 'Title', type: 'char'},
                    {name: 'phone', label: 'Phone', type: 'char',
                        readonly: true},
                    {name: 'fax', label: 'Fax', type: 'char',
                        readonly: true},
                    {name: 'email', label: 'Contact E-Mail', type: 'char',
                        readonly: true}]},
                /* Kept from the desk's window: the contacts (phone, fax,
                 * e-mail above come from here) */
                {title: 'Contacts', lines: {name: 'contact_mechanisms',
                    model: 'party.contact_mechanism', inverse: 'party',
                    fields: [
                        {name: 'type', label: 'Type', type: 'selection',
                            options: CONTACT_TYPES},
                        {name: 'value', label: 'Value', type: 'char'},
                        {name: 'name', label: 'Contact', type: 'char'}]}},
                {title: 'Account', fields: [
                    {name: 'customer_open_date', label: 'Account Opened Date',
                        type: 'date'},
                    {name: 'customer_last_order_date',
                        label: 'Last Order Date', type: 'date',
                        readonly: true},
                    {name: 'our_supplier_id', label: 'Supplier ID (Ours)',
                        type: 'char'},
                    ref('account_receivable', 'Receivables Account ID',
                        'account.account',
                        {domain: [['type.receivable', '=', true]]}),
                    ref('customer_payment_term', 'Terms ID',
                        'account.invoice.payment_term'),
                    {name: 'customer_freight_terms', label: 'Freight Terms',
                        type: 'selection', options: FREIGHT_TERMS},
                    {name: 'credit_status', label: 'Credit Status',
                        type: 'selection', options: CREDIT_STATUS,
                        default: 'approved'},
                    {name: 'credit_limit', label: 'Order Limit',
                        type: 'money'},
                    {name: 'receivable', label: 'Open balance',
                        type: 'money', readonly: true},
                    {name: 'customer_open_orders', label: 'Total Open Orders',
                        type: 'money', readonly: true},
                    {name: 'customer_open_order_count', label: 'Open Orders',
                        type: 'integer', readonly: true}]},
                {title: 'Details', fields: [
                    ref('sales_rep', 'Sales Rep ID', 'nline.sales_rep'),
                    ref('territory', 'Territory', 'nline.territory'),
                    ref('customer_fob_point', 'FOB Point',
                        'nline.fob_point'),
                    ref('customer_ship_via', 'Ship VIA', 'nline.ship_via'),
                    ref('carrier', 'Carrier ID', 'nline.carrier'),
                    ref('customer_sic_code', 'SIC Code', 'nline.sic_code'),
                    ref('discount_class', 'Discount Class',
                        'nline.discount_class'),
                    {name: 'customer_tax_id_number', label: 'Tax ID Number',
                        type: 'char'},
                    ref('customer_tax_group', 'Tax Group ID',
                        'nline.sales_tax_group'),
                    {name: 'customer_tax_exempt', label: 'Tax Exempt',
                        type: 'boolean'},
                    {name: 'quote_instructions',
                        label: 'Special Instructions for Quotes',
                        type: 'text', rows: 2, span: 2},
                    {name: 'sales_instructions',
                        label: 'Special Instructions for Sales Orders',
                        type: 'text', rows: 2, span: 2},
                    {name: 'quote_footer', label: 'Quote Footer',
                        type: 'text', rows: 2, span: 2},
                    {name: 'sales_order_footer', label: 'Sales Order Footer',
                        type: 'text', rows: 2, span: 2},
                    {name: 'shipper_footer', label: 'Shipper Footer',
                        type: 'text', rows: 2, span: 2},
                    {name: 'invoice_footer', label: 'Invoice Footer',
                        type: 'text', rows: 2, span: 2},
                    {name: 'customer_specs', label: 'Specifications',
                        type: 'text', rows: 3, span: 4}]},
                {title: 'Addresses', lines: {name: 'addresses',
                    model: 'party.address', inverse: 'party',
                    order: [['sequence', 'ASC'], ['id', 'ASC']],
                    fields: [
                        {name: 'ship_to_default', label: 'Default Ship To',
                            type: 'boolean'},
                        {name: 'party_name', label: 'Name', type: 'char'},
                        {name: 'ship_to_contact', label: 'Contact Name',
                            type: 'char'},
                        {name: 'ship_to_title', label: 'Contact Title',
                            type: 'char'},
                        {name: 'street', label: 'Address', type: 'char'},
                        {name: 'city', label: 'City', type: 'char'},
                        ref('subdivision', 'State', 'country.subdivision'),
                        {name: 'postal_code', label: 'Postal Code',
                            type: 'char'},
                        ref('country', 'Country', 'country.country'),
                        {name: 'ship_to_phone', label: 'Contact Phone',
                            type: 'char'},
                        {name: 'ship_to_fax', label: 'Contact Fax',
                            type: 'char'},
                        {name: 'ship_to_email', label: 'Contact E-Mail',
                            type: 'char'},
                        {name: 'invoice', label: 'Bill To',
                            type: 'boolean'},
                        {name: 'delivery', label: 'Ship To',
                            type: 'boolean'},
                        {name: 'ship_to_tax_exempt', label: 'Tax Exempt',
                            type: 'boolean'},
                        ref('ship_to_tax_group', 'Tax Group ID',
                            'nline.sales_tax_group'),
                        {name: 'ship_to_tax_id_number',
                            label: 'Tax ID Number', type: 'char'},
                        ref('ship_to_sales_rep', 'Sales Rep',
                            'nline.sales_rep'),
                        ref('ship_to_territory', 'Territory ID',
                            'nline.territory'),
                        ref('ship_to_fob_point', 'FOB Point',
                            'nline.fob_point'),
                        ref('ship_to_ship_via', 'Ship Via ID',
                            'nline.ship_via'),
                        ref('ship_to_carrier', 'Carrier ID',
                            'nline.carrier'),
                        ref('ship_to_discount_class', 'Discount Class ID',
                            'nline.discount_class')]}},
                {title: 'Prices', render: function (pane, record) {
                    pricesTab(pane, 'party', record.id);
                }},
                {notes: true},
                {title: 'Sales Orders', render: customerOrdersTab},
                {title: 'Quotes', render: documentsTab('sale.sale',
                    function (record) {
                        return [['party', '=', record.id],
                            ['state', 'in', ['draft', 'quotation']]];
                    }, [['number', 'ID'], ['reference', 'Customer Reference'],
                        ['js_status', 'Status', false, JS_STATUS],
                        ['sale_date', 'Quote Date'],
                        ['shipping_date', 'Desired Ship Date'],
                        ['total_amount', 'Amount', true]], function (row) {
                        if (openOrders) {
                            openOrder(row.id, row.number);
                        }
                    })},
                /* Kept from the desk's window */
                {title: 'Invoices', render: documentsTab('account.invoice',
                    function (record) {
                        return [['party', '=', record.id],
                            ['type', '=', 'out']];
                    }, [['number', 'Number'], ['invoice_date', 'Date'],
                        ['reference', 'Reference'], ['state', 'Status'],
                        ['total_amount', 'Total', true],
                        ['amount_to_pay', 'Open', true]], function (row) {
                        if (openInvoices) {
                            UI.openScreen('invoicing/' + row.id, 'Invoice ' +
                                (row.number || row.id));
                        } else {
                            UI.openRecord('account.invoice', row.id,
                                row.number);
                        }
                    })}
            ],
            browse: [
                {name: 'code', label: 'ID'},
                {name: 'name', label: 'Name'},
                {name: 'sold_to_street', label: 'Address'},
                {name: 'sold_to_city', label: 'City'},
                {name: 'sold_to_subdivision', label: 'State',
                    type: 'many2one'},
                {name: 'sold_to_postal_code', label: 'Postal Code'},
                {name: 'receivable', label: 'Balance', type: 'money'}],
            beforeSave: function (values) {
                ['receivable', 'customer_open_orders',
                    'customer_open_order_count', 'customer_last_order_date',
                    'phone', 'fax', 'email'].forEach(function (n) {
                        delete values[n];
                    });
                return values;
            }
        });
        main.classList.add('js-sales');
    };

    /* ---- Sales Orders ----------------------------------------------------- */

    var DETAIL_FIELDS = [
        {name: 'promise_date', label: 'Promise Date', type: 'date'},
        {name: 'last_shipped_date', label: 'Last Shipped Date', type: 'date',
            readonly: true},
        {name: 'sales_rep', label: 'Sales Rep ID', type: 'many2one',
            model: 'nline.sales_rep'},
        {name: 'territory', label: 'Territory ID', type: 'many2one',
            model: 'nline.territory'},
        {name: 'fob_point', label: 'FOB Point ID', type: 'many2one',
            model: 'nline.fob_point'},
        {name: 'ship_via', label: 'Ship Via ID', type: 'many2one',
            model: 'nline.ship_via'},
        {name: 'js_carrier', label: 'Carrier ID', type: 'many2one',
            model: 'nline.carrier'},
        {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
            model: 'nline.sales_tax_group'},
        {name: 'freight_terms', label: 'Freight Terms', type: 'selection',
            options: FREIGHT_TERMS},
        {name: 'discount_class', label: 'Discount Class ID',
            type: 'many2one', model: 'nline.discount_class'},
        {name: 'js_quote', label: 'Quote ID', type: 'char'}];

    var LINE_DETAIL_FIELDS = [
        {name: 'customer_po_line', label: 'Customer PO Line #',
            type: 'char'},
        {name: 'promise_date', label: 'Promise Date', type: 'date'},
        {name: 'product_code', label: 'Product Code ID', type: 'many2one',
            model: 'nline.product_code'},
        {name: 'commodity_code', label: 'Commodity Code ID',
            type: 'many2one', model: 'nline.commodity_code'},
        {name: 'line_tax_group', label: 'Tax Group ID', type: 'many2one',
            model: 'nline.sales_tax_group'},
        {name: 'js_line_specs', label: 'Specifications', type: 'text',
            span: 3}];

    Screens.salesOrder = function (main, params) {
        injectCss();
        var order = null;
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var can = {save: true, create: true, delete: true, workOrder: true,
            charges: true};
        var screens = {shipping: false, invoicing: false, workorders: false};
        var form = UI.form(main, {title: 'Sales Order',
            kind: 'customer',
            find: {model: 'sale.sale', title: 'Find orders',
                order: [['sale_date', 'DESC'], ['id', 'DESC']],
                columns: [{field: 'number', label: 'Order ID'},
                    {field: 'sale_date', label: 'Order Date'},
                    {field: 'rec_name', label: 'Customer'},
                    {field: 'reference', label: 'PO Ref #'},
                    {field: 'total_amount', label: 'Total', money: true},
                    {field: 'js_status', label: 'Status'}]},
            extra: [
                {label: 'New From Quote', title: 'File > New Document ' +
                    'From > Quote', onclick: fromQuote},
                {label: 'Copy', title: 'Edit > Copy Document: a new order ' +
                    'with the lines of this one', onclick: copyOrder},
                {label: 'Change Status', title: 'Tools > Change Status',
                    onclick: function (event) {
                        statusMenu(event.currentTarget);
                    }},
                {label: 'Reset Prices', title: 'Reset unit price from ' +
                    'customer (all lines)', onclick: resetPrices},
                {label: 'Print', title: 'Print the acknowledgement',
                    onclick: function () {
                        if (order) {
                            Rpc.report('sale.sale', [order.id]).then(
                                function (r) {
                                    UI.openReport(r, 'Order');
                                }, UI.showError);
                        }
                    }},
                {label: 'Delete', title: 'Edit > Delete Document',
                    onclick: deleteOrder}],
            onSave: function () {
                return save();
            },
            onClear: function () {
                global.location.hash = '#/orders/new?' + Date.now();
            }});
        main = form.body;
        main.classList.add('js-sales');

        /* Sales Order tab: the header and the lines */
        var number = el('input', {type: 'text', 'aria-label': 'Order ID',
            placeholder: '(automatic)'});
        var status = el('span.badge.open.js-status', 'Unreleased');
        var customer = UI.picker('party.party', {placeholder: 'Customer ID',
            label: 'Customer ID', fields: ['customer_payment_term'],
            onselect: function (record) {
                form.showParty(record.id);
                customerDefaults(record.id);
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Order Date'});
        var desired = el('input', {type: 'date', 'aria-label':
            'Desired Ship Date'});
        var po = el('input', {type: 'text', 'aria-label':
            'Purchase Order No'});
        var term = el('select', {'aria-label': 'Terms'}, el('option',
            {value: ''}, ''));
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var total = el('div.big-total', '$0.00');
        var totals = el('div.js-totals');
        var linesPanel = el('div');
        var links = el('div');
        var grid = null;

        /* The other tabs */
        var shipTo = UI.picker('party.address', {placeholder: 'Ship to',
            label: 'Ship To address', onselect: function () {
                showShipTo(null);
            }});
        var details = fieldGrid(DETAIL_FIELDS);
        var specs = el('textarea', {rows: 10, 'aria-label': 'Specifications',
            style: {width: '100%'}});
        var charges = chargesEditor({editable: true});
        var soldToPane, shipToPane, taxesPane, docsPane, browsePane;
        var shipToAddress = el('div');

        Rpc.searchRead('account.invoice.payment_term', [], ['name'],
            {order: [['name', 'ASC']]}).then(function (rows) {
            rows.forEach(function (row) {
                term.appendChild(el('option', {value: row.id}, row.name));
            });
            if (order) {
                term.value = order.payment_term || '';
            }
        });

        var orderTabs = tabs(main, [
            {title: 'Sales Order', build: function (pane) {
                pane.appendChild(el('div.grid-form',
                    el('div', el('label.field', 'Order ID'), number, status),
                    el('div', {style: {gridColumn: 'span 2'}},
                        el('label.field', 'Customer ID'), customer.node),
                    el('div', el('label.field', 'Order Date'), date),
                    el('div', el('label.field', 'Desired Ship Date'),
                        desired),
                    el('div', el('label.field', 'Purchase Order No'), po),
                    el('div', el('label.field', 'Terms'), term),
                    el('div', el('label.field', 'Memo'), memo)));
                pane.appendChild(el('h2', 'Lines'));
                pane.appendChild(el('p.muted', 'Right-click a line for its ' +
                    'overrides, specs and price.'));
                pane.appendChild(linesPanel);
                pane.appendChild(el('div.grid-form', {style: {marginTop:
                    '12px'}}, el('div', {style: {gridColumn: 'span 3'}},
                        totals), el('div', el('label.field', 'Total'),
                        total)));
                pane.appendChild(el('h2', 'Links: work orders of the lines'));
                pane.appendChild(links);
            }},
            {title: 'Sold To', build: function (pane) {
                soldToPane = pane;
                addressPane(pane, null, 'The customer\'s bill to address ' +
                    '(change it in the Customers window).');
            }},
            {title: 'Ship To', build: function (pane) {
                shipToPane = pane;
                pane.appendChild(el('div.grid-form', el('div', {style:
                    {gridColumn: 'span 2'}}, el('label.field',
                    'Ship To address'), shipTo.node)));
                pane.appendChild(shipToAddress);
            }},
            {title: 'Details', build: function (pane) {
                pane.appendChild(details.node);
            }},
            {title: 'Specs', build: function (pane) {
                pane.appendChild(el('p.muted', 'Printed at the bottom of ' +
                    'the Sales Order Acknowledgement; saved on this order ' +
                    'only.'));
                pane.appendChild(specs);
            }},
            {title: 'Charges', build: function (pane) {
                pane.appendChild(el('p.muted', 'Applied charges go on the ' +
                    'next invoice of the order.'));
                pane.appendChild(charges.node);
            }},
            {title: 'Taxes', build: function (pane) {
                taxesPane = pane;
            }},
            {title: 'Shippers/Invoices', build: function (pane) {
                docsPane = pane;
            }},
            {title: 'Browse', build: function (pane) {
                browsePane = pane;
            }, onshow: function () {
                browse();
            }}
        ]);
        charges.set([], true);
        details.set({});

        /* Rights: what is not allowed is not shown */
        rights(['sale.sale', 'sale.line', 'nline.sale_charge', 'production'])
            .then(function (r) {
                can.save = r['sale.sale'].write && r['sale.line'].create;
                can.create = r['sale.sale'].create;
                can['delete'] = r['sale.sale']['delete'];
                can.workOrder = r.production.create;
                can.charges = r['nline.sale_charge'].write &&
                    r['nline.sale_charge'].create;
                applyRights();
            });
        ['shipping', 'invoicing', 'workorders'].forEach(function (s) {
            UI.screenAllowed(s).then(function (ok) {
                screens[s] = ok;
            });
        });

        function applyRights() {
            var hidden = [];
            if (!can.create) {
                hidden.push('New From Quote', 'Copy');
            }
            if (!can.save) {
                hidden.push('Change Status', 'Reset Prices');
            }
            if (!can['delete'] || !order || ['unreleased', 'firm',
                    'cancelled'].indexOf(order.js_status) < 0) {
                hidden.push('Delete');
            }
            if (!order) {
                hidden.push('Copy', 'Change Status', 'Print');
            }
            if (order && order.state !== 'draft') {
                hidden.push('Reset Prices');
            }
            form.allow(order ? can.save : can.create, hidden);
            if (order) {
                charges.set(order.charges, can.save && can.charges);
            } else if (!can.create || !can.charges) {
                charges.set([], false);
            }
            details.lock(can.save);
            specs.disabled = !can.save;
        }

        function customerDefaults(partyId) {
            Rpc.desk('sales_order_defaults', [partyId]).then(function (d) {
                if (d.payment_term) {
                    term.value = d.payment_term;
                }
                shipTo.set(idOf(d.shipment_address),
                    name(d.shipment_address));
                details.set(Object.assign(details.get(), d));
                ['sales_rep', 'territory', 'fob_point', 'ship_via',
                    'js_carrier', 'tax_group', 'discount_class'].forEach(
                    function (n) {
                        details.controls[n].set(d[n]);
                    });
                if (!specs.value && d.js_specs) {
                    specs.value = d.js_specs;
                }
                addressPane(soldToPane, d.sold_to);
                showShipTo(d.ship_to);
                if (d.credit_status === 'hold_orders') {
                    UI.toast('Credit status: Hold Orders', 'error');
                } else if (d.credit_status === 'hold_shipments') {
                    UI.toast('Credit status: Hold Shipments', 'error');
                }
            }, UI.showError);
        }

        function showShipTo(address) {
            if (address) {
                addressPane(shipToAddress, address);
                return;
            }
            var id = shipTo.value();
            if (!id) {
                addressPane(shipToAddress, null, 'The sold to address is ' +
                    'used.');
                return;
            }
            Rpc.model('party.address', 'read', [[id], ['party_name',
                'street', 'city', 'postal_code', 'subdivision.rec_name',
                'country.rec_name', 'ship_to_contact', 'ship_to_title',
                'ship_to_phone', 'ship_to_fax', 'ship_to_email']]).then(
                function (rows) {
                    var a = rows[0];
                    addressPane(shipToAddress, {name: a.party_name,
                        street: a.street, city: a.city, postal_code:
                            a.postal_code, state: (a['subdivision.'] || {})
                            .rec_name, country: (a['country.'] || {})
                            .rec_name, contact: a.ship_to_contact, title:
                            a.ship_to_title, phone: a.ship_to_phone, fax:
                            a.ship_to_fax, email: a.ship_to_email});
                }, UI.showError);
        }

        function extension(v) {
            return Math.round((v.quantity || 0) * (v.price || 0) *
                (1 - (v.discount || 0) / 100) * 100) / 100;
        }

        function priceFor(controls) {
            var partyId = customer.value();
            var product = controls.part.value();
            if (!partyId || !product) {
                return Promise.resolve();
            }
            return Rpc.desk('sales_price', [partyId, product,
                UI.parseMoney(controls.quantity.value) || 1,
                date.value || null]).then(function (p) {
                    controls.price.value = UI.money(p.gross_unit_price);
                    controls.discount.value = num(p.trade_discount);
                    if (p.customer_part) {
                        controls.customer_part.value = p.customer_part;
                    }
                    grid.update();
                }, UI.showError);
        }

        function newGrid(lines) {
            grid = UI.grid({total: 'amount', required: 'part',
                onchange: function () {
                    updateTotals();
                }, columns: [
                    {key: 'part', label: 'Part ID', width: '22%',
                        kind: 'picker', picker: {model: 'product.product',
                            domain: [['salable', '=', true]],
                            placeholder: 'Part', fields: ['list_price'],
                            onselect: function (record, controls) {
                                controls.description.value = record.rec_name
                                    .replace(/^\[[^\]]*\]\s*/, '');
                                if (record.list_price) {
                                    controls.price.value = UI.money(
                                        record.list_price);
                                }
                                priceFor(controls);
                            }}},
                    {key: 'description', label: 'Description'},
                    {key: 'customer_part', label: 'Customer Part ID',
                        width: '11%'},
                    {key: 'quantity', label: 'Order Qty', width: '8%',
                        kind: 'number', default: '1'},
                    {key: 'price', label: 'Unit Price', width: '11%',
                        kind: 'money'},
                    {key: 'discount', label: 'Disc %', width: '7%',
                        kind: 'number', default: '0'},
                    {key: 'amount', label: 'Extension', width: '11%',
                        kind: 'computed', compute: extension}
                ]});
            var first = true;
            (lines || []).forEach(function (line) {
                var row = first ? null : grid.addRow();
                var controls = row ? row.controls : grid.controls()[0];
                first = false;
                if (line.product) {
                    controls.part.set(line.product.id, line.product.rec_name);
                }
                controls.description.value = line.description;
                controls.customer_part.value = line.customer_part || '';
                controls.quantity.value = String(line.quantity);
                controls.price.value = UI.money(line.gross_unit_price);
                controls.discount.value = num(line.trade_discount);
                controls.part.lineId = line.id;
                controls.part.extra = line;
            });
            grid.update();
            UI.clear(linesPanel).appendChild(grid.node);
            grid.node.addEventListener('contextmenu', function (event) {
                var tr = event.target.closest('tbody tr');
                if (!tr) {
                    return;
                }
                var index = Array.prototype.indexOf.call(tr.parentNode
                    .children, tr);
                var controls = grid.controls()[index];
                if (!controls) {
                    return;
                }
                UI.contextMenu(event, [
                    {label: 'Line Overrides and Specs…', onclick: function () {
                        lineDetails(controls.part.extra || {}, true,
                            function (values) {
                                controls.part.extra = Object.assign(
                                    controls.part.extra || {}, values);
                            });
                    }},
                    {label: 'Reset Unit Price from Customer', onclick:
                        function () {
                            priceFor(controls);
                        }},
                    controls.part.value() ? {label: 'Open Part', onclick:
                        function () {
                            UI.openScreen('parts', 'Parts');
                        }} : '-']);
            });
        }

        /* The overrides of a line (Jobshop's Sales Order Line window:
         * Overrides and Specs tabs) */
        function lineDetails(line, editable, done) {
            var g = fieldGrid(LINE_DETAIL_FIELDS);
            g.set(line);
            g.lock(editable);
            var info = line.id ? el('p.muted', 'Line ' + (line.line_no ||
                '') + ': shipped ' + num(line.shipped_quantity || 0) +
                ', status ' + label(LINE_STATUS, line.js_line_status) +
                (line.last_shipped_date ? ', last shipped ' +
                    UI.date(line.last_shipped_date) : '') +
                (line.available !== null && line.available !== undefined ?
                    ', available ' + num(line.available) : '')) : null;
            UI.modal('Sales Order Line ' + (line.line_no || ''), [info,
                g.node], editable ? [
                {label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function () {
                    var values = g.get();
                    LINE_DETAIL_FIELDS.forEach(function (f) {
                        if (f.type === 'many2one') {
                            var c = g.controls[f.name];
                            values[f.name] = c.get() ? {id: c.get(),
                                rec_name: c.picker.input.value} : null;
                        }
                    });
                    done(values);
                }}] : [{label: 'Close', primary: true}]);
        }

        function readOnlyLines(lines) {
            grid = null;
            UI.clear(linesPanel).appendChild(table([
                {label: 'Line No'}, {label: 'Line Status'},
                {label: 'Desired Ship'}, {label: 'Available', num: true},
                {label: 'Order Qty', num: true}, {label: 'Part ID'},
                {label: 'Description'}, {label: 'Customer Part ID'},
                {label: 'Unit Price', num: true}, {label: 'Disc %', num: true},
                {label: 'Extension', num: true},
                {label: 'Shipped Qty', num: true}, {label: 'Specs'}],
                lines.map(function (line) {
                    return {
                        oncontextmenu: function (event) {
                            UI.contextMenu(event, [{label: can.save ?
                                'Line Overrides and Specs…' :
                                'Line Overrides and Specs', onclick:
                                function () {
                                    lineDetails(line, can.save,
                                        function (values) {
                                            Object.assign(line, values);
                                            line.changed = true;
                                            save();
                                        });
                                }}]);
                        },
                        cells: [String(line.line_no), label(LINE_STATUS,
                            line.js_line_status), UI.date(line.shipping_date),
                            num(line.available), num(line.quantity),
                            line.product ? line.product.rec_name : '',
                            line.description, line.customer_part,
                            UI.money(line.gross_unit_price),
                            num(line.trade_discount), UI.money(line.amount),
                            num(line.shipped_quantity),
                            line.js_line_specs ? '✔' : '']};
                })));
        }

        function updateTotals() {
            var lineTotal = grid ? grid.total() : order ?
                Number(order.untaxed_amount) : 0;
            var chargeTotal = charges.values().reduce(function (s, c) {
                return s + (c.amount ? Number(c.amount) : 0);
            }, 0);
            var tax = order ? Number(order.tax_amount || 0) : 0;
            UI.clear(totals).appendChild(el('div', el('div', el('span.muted',
                'Lines '), UI.money(lineTotal)), el('div', el('span.muted',
                'Charges '), UI.money(chargeTotal)), el('div',
                el('span.muted', 'Tax '), UI.money(tax))));
            total.textContent = UI.money(lineTotal + chargeTotal + (grid ?
                0 : tax), true);
        }

        function renderLinks() {
            UI.clear(links);
            if (!order) {
                links.appendChild(el('p.muted', 'Save the order first.'));
                return;
            }
            var body = el('tbody');
            order.lines.forEach(function (line) {
                var cell = el('td');
                line.links.forEach(function (l) {
                    cell.appendChild(el('a', {href: '#', onclick: function (
                        event) {
                        event.preventDefault();
                        if (screens.workorders) {
                            UI.openScreen('workorders/' + l.id, 'WO ' +
                                l.number);
                        }
                    }}, (l.job ? 'Job ' : 'WO ') + l.number + ' (' +
                        l.state + ')'));
                    cell.appendChild(el('span', ' '));
                });
                var confirmed = order.state === 'confirmed' ||
                    order.state === 'processing';
                body.appendChild(el('tr', el('td', String(line.line_no)),
                    el('td', line.product ? line.product.rec_name : ''),
                    el('td.num', String(line.quantity)),
                    el('td', UI.date(line.shipping_date)), cell,
                    el('td', confirmed && !line.links.length &&
                        can.workOrder ? el('button', {type: 'button',
                            onclick: function () {
                                UI.service('sale_line_work_order', line.id)
                                    .then(function (wo) {
                                        UI.toast('Work order ' + wo.number +
                                            ' created', 'ok');
                                        load(order.id);
                                    }, failed);
                            }}, 'New WO') : null)));
            });
            links.appendChild(el('div.table-wrap', el('table.data',
                el('thead', el('tr', el('th', 'Line No'), el('th', 'Part'),
                    el('th.num', 'Qty'), el('th', 'Ship date'),
                    el('th', 'Work orders'), el('th', ''))), body)));
            if (order.state === 'draft' || order.state === 'quotation') {
                links.appendChild(el('p.muted', 'Release the order to ' +
                    'create the work orders of its lines.'));
            }
        }

        function renderTaxes() {
            UI.clear(taxesPane);
            var taxes = order ? order.taxes : [];
            taxesPane.appendChild(table([{label: 'Tax Group ID'},
                {label: 'Tax Name'}, {label: 'Description'},
                {label: 'Account ID'}, {label: 'Tax Percent', num: true},
                {label: 'Taxable', num: true},
                {label: 'Tax Amount', num: true}], taxes.map(function (t) {
                    return {cells: [t.tax_group, t.tax_name, t.description,
                        t.account, num(t.percent), UI.money(t.base),
                        UI.money(t.amount)]};
                }), order ? 'No tax on this order.' : 'Save the order ' +
                'first.'));
        }

        function renderDocuments() {
            UI.clear(docsPane);
            var rows = order ? order.shippers : [];
            docsPane.appendChild(table([{label: 'Shipper / Invoice ID'},
                {label: 'Type'}, {label: 'Status'}, {label: 'Date'},
                {label: 'Amount', num: true}], rows.map(function (d) {
                    var open = function () {
                        if (d.model === 'account.invoice') {
                            if (screens.invoicing) {
                                UI.openScreen('invoicing/' + d.id,
                                    'Invoice ' + d.number);
                            } else {
                                UI.openRecord(d.model, d.id, d.number);
                            }
                        } else if (d.model === 'stock.shipment.out' &&
                                screens.shipping) {
                            UI.openScreen('shipping/' + d.id, 'Shipper ' +
                                d.number);
                        } else {
                            UI.openRecord(d.model, d.id, d.number);
                        }
                    };
                    return {ondblclick: open, oncontextmenu: function (e) {
                        UI.contextMenu(e, [{label: 'Open ' + d.type,
                            onclick: open}]);
                    }, cells: [d.number, d.type, d.state, UI.date(d.date),
                        UI.money(d.amount)]};
                }), order ? 'Nothing shipped or invoiced yet.' :
                'Save the order first.'));
        }

        function browse() {
            var search = el('input', {type: 'text', placeholder:
                'Search (* for any text)', 'aria-label': 'Search'});
            var holder = el('div');
            function run() {
                var text = search.value.trim().replace(/\*/g, '%');
                var domain = text ? [['rec_name', 'ilike', text.indexOf(
                    '%') >= 0 ? text : '%' + text + '%']] : [];
                Rpc.searchRead('sale.sale', domain, ['number',
                    'party.rec_name', 'party.code', 'reference', 'sale_date',
                    'js_status', 'total_amount'], {limit: 300, order:
                    [['sale_date', 'DESC'], ['id', 'DESC']]}).then(
                    function (rows) {
                        UI.clear(holder).appendChild(table([
                            {label: 'Order ID'}, {label: 'Customer ID'},
                            {label: 'Customer'}, {label: 'PO Ref #'},
                            {label: 'Order Date'}, {label: 'Status'},
                            {label: 'Amount', num: true}],
                            rows.map(function (row) {
                                return {ondblclick: function () {
                                    load(row.id);
                                    orderTabs.show(0);
                                }, cells: [row.number || String(row.id),
                                    (row['party.'] || {}).code || '',
                                    (row['party.'] || {}).rec_name || '',
                                    row.reference || '',
                                    UI.date(row.sale_date),
                                    label(JS_STATUS, row.js_status),
                                    UI.money(row.total_amount)]};
                            })));
                    }, UI.showError);
            }
            var timer;
            search.addEventListener('input', function () {
                global.clearTimeout(timer);
                timer = global.setTimeout(run, 250);
            });
            UI.clear(browsePane).appendChild(el('div.toolbar', el('div',
                {style: {width: '320px'}}, search)));
            browsePane.appendChild(holder);
            run();
        }

        function show(data) {
            order = data;
            number.value = data.number || '';
            number.disabled = data.state !== 'draft';
            status.textContent = label(JS_STATUS, data.js_status);
            status.className = 'badge js-status ' + (data.js_status ===
                'closed' ? 'paid' : 'open');
            customer.set(data.party.id, data.party.rec_name);
            customer.input.disabled = data.state !== 'draft';
            form.showParty(data.party.id);
            date.value = data.sale_date || '';
            desired.value = data.shipping_date || '';
            po.value = data.reference;
            memo.value = data.description;
            term.value = data.payment_term || '';
            [date, term].forEach(function (n) {
                n.disabled = data.state !== 'draft';
            });
            shipTo.set(data.shipment_address && data.shipment_address.id,
                data.shipment_address && data.shipment_address.rec_name);
            shipTo.input.disabled = data.state !== 'draft';
            details.set(data);
            specs.value = data.js_specs || '';
            addressPane(soldToPane, data.sold_to);
            addressPane(shipToAddress, data.ship_to);
            if (data.state === 'draft') {
                newGrid(data.lines);
            } else {
                readOnlyLines(data.lines);
            }
            renderLinks();
            renderTaxes();
            renderDocuments();
            applyRights();
            updateTotals();
            total.textContent = UI.money(data.order_amount, true);
            UI.setTitle('Order ' + (data.number || data.id));
        }

        function load(id) {
            return Rpc.desk('sale_order_get', [id]).then(show, UI.showError);
        }

        function lineExtra(extra) {
            var values = {};
            LINE_DETAIL_FIELDS.forEach(function (f) {
                if (extra && extra[f.name] !== undefined) {
                    values[f.name] = f.type === 'many2one' ?
                        idOf(extra[f.name]) : f.type === 'date' ?
                        iso(extra[f.name]) : extra[f.name];
                }
            });
            return values;
        }

        function headerValues() {
            var values = details.get();
            delete values.last_shipped_date;
            values.js_specs = specs.value || null;
            values.charges = charges.values();
            values.reference = po.value || null;
            values.description = memo.value || null;
            values.shipping_date = desired.value || null;
            return values;
        }

        function save() {
            if (!customer.value()) {
                UI.showError('Choose the customer.');
                return;
            }
            var values = headerValues();
            if (!order || order.state === 'draft') {
                values.lines = grid.controls().filter(function (c) {
                    return c.part.value();
                }).map(function (c) {
                    return Object.assign(lineExtra(c.part.extra), {
                        id: c.part.lineId || null,
                        product: c.part.value(),
                        description: c.description.value || null,
                        customer_part: c.customer_part.value || null,
                        quantity: UI.parseMoney(c.quantity.value) || 1,
                        gross_unit_price: c.price.value === '' ? null :
                            String(UI.parseMoney(c.price.value)),
                        trade_discount: String(UI.parseMoney(
                            c.discount.value) || 0)
                    });
                });
                Object.assign(values, {
                    id: order ? order.id : null,
                    number: number.value || null,
                    party: customer.value(), sale_date: date.value || null,
                    payment_term: term.value ? parseInt(term.value, 10) :
                        null,
                    shipment_address: shipTo.value()});
            } else {
                values.id = order.id;
                values.party = order.party.id;
                values.lines = order.lines.filter(function (l) {
                    return l.changed;
                }).map(function (l) {
                    return Object.assign(lineExtra(l), {id: l.id});
                });
            }
            return UI.service('sale_order_save', values).then(
                function (data) {
                    UI.toast('Order ' + (data.number || data.id) + ' saved',
                        'ok');
                    if (!order) {
                        global.history.replaceState(null, '', '#/orders/' +
                            data.id);
                    }
                    show(data);
                }, failed);
        }

        function statusMenu(button) {
            if (!order) {
                return;
            }
            var allowedNext = {
                unreleased: ['firm', 'released', 'hold', 'cancelled'],
                firm: ['unreleased', 'released', 'hold', 'cancelled'],
                released: ['hold', 'closed'],
                hold: order.state === 'draft' ? ['unreleased', 'firm',
                    'released', 'cancelled'] : order.state === 'quotation' ?
                    ['firm', 'released', 'cancelled'] : ['released',
                        'closed'],
                closed: order.state === 'done' ? [] : ['released'],
                cancelled: ['unreleased']
            }[order.js_status] || [];
            menuAt(button, allowedNext.map(function (s) {
                return {label: label(JS_STATUS, s), onclick: function () {
                    var ask = s === 'cancelled' || s === 'closed' ?
                        UI.confirm('Change Status', 'Set order ' +
                            (order.number || order.id) + ' to ' +
                            label(JS_STATUS, s) + '?') :
                        Promise.resolve(true);
                    ask.then(function (ok) {
                        if (!ok) {
                            return;
                        }
                        Rpc.desk('sales_order_status', [order.id, s]).then(
                            function (data) {
                                UI.toast('Order ' + (data.number ||
                                    data.id) + ': ' + label(JS_STATUS, s),
                                    'ok');
                                show(data);
                            }, UI.showError);
                    });
                }};
            }));
        }

        function copyOrder() {
            if (!order) {
                return;
            }
            Rpc.desk('sales_order_copy', [order.id, 'order']).then(
                function (data) {
                    UI.toast('Copied to a new order', 'ok');
                    global.history.replaceState(null, '', '#/orders/' +
                        data.id);
                    show(data);
                }, UI.showError);
        }

        function fromQuote() {
            UI.browse('sale.sale', {title: 'Create Sales Order from Quote',
                domain: [['state', 'in', ['draft', 'quotation']]],
                order: [['sale_date', 'DESC']],
                columns: [{field: 'number', label: 'Quote ID'},
                    {field: 'rec_name', label: 'Customer'},
                    {field: 'sale_date', label: 'Date'},
                    {field: 'total_amount', label: 'Amount', money: true}]})
                .then(function (quote) {
                    return Rpc.desk('sales_order_copy', [quote.id, 'quote'])
                        .then(function (data) {
                            UI.toast('New order from quote ' +
                                (quote.number || quote.id), 'ok');
                            global.history.replaceState(null, '',
                                '#/orders/' + data.id);
                            show(data);
                        });
                }).catch(failed);
        }

        function resetPrices() {
            if (!grid) {
                return;
            }
            Promise.all(grid.controls().filter(function (c) {
                return c.part.value();
            }).map(priceFor)).then(function () {
                UI.toast('Unit prices reset from the customer', 'ok');
            });
        }

        function deleteOrder() {
            if (!order) {
                return;
            }
            UI.confirm('Delete Document', 'Delete order ' + (order.number ||
                order.id) + '? It can not be recovered.').then(function (ok) {
                if (!ok) {
                    return;
                }
                Rpc.desk('sales_order_delete', [order.id]).then(function () {
                    UI.toast('Order deleted', 'ok');
                    global.location.hash = '#/orders/new?' + Date.now();
                }, UI.showError);
            });
        }

        global.document.addEventListener('keydown', function onKey(event) {
            if (!main.isConnected) {
                global.document.removeEventListener('keydown', onKey);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() ===
                    's') {
                event.preventDefault();
                if (order ? can.save : can.create) {
                    save();
                }
            } else if (event.key === 'F5' && order) {
                event.preventDefault();
                load(order.id);
            }
        });

        if (openId) {
            load(openId);
        } else {
            newGrid([]);
            renderLinks();
            renderTaxes();
            renderDocuments();
            addressPane(shipToAddress, null);
            updateTotals();
        }
    };

    /* ---- Shipping ---------------------------------------------------------- */

    var SHIP_STEPS = {
        waiting: [['assign_try', 'Assign Stock']],
        assigned: [['pick', 'Pick'], ['pack', 'Pack'], ['done', 'Ship']],
        picked: [['pack', 'Pack'], ['done', 'Ship']],
        packed: [['done', 'Ship']]
    };

    Screens.shipping = function (main, params) {
        injectCss();
        var form = UI.form(main, {title: 'Shipping'});
        main = form.body;
        main.classList.add('js-sales');
        var shipped = false;
        var shipper = null;
        var can = {write: true, create: true, sale: true};
        var activityPane, shipperPane, soldToPane, shipToPane;
        var detailsGrid = fieldGrid([
            {name: 'order_date', label: 'Order Date', type: 'date',
                readonly: true},
            {name: 'effective_date', label: 'Shipped Date', type: 'date'},
            {name: 'fob_point', label: 'FOB Point', type: 'many2one',
                model: 'nline.fob_point'},
            {name: 'ship_via', label: 'Ship Via', type: 'many2one',
                model: 'nline.ship_via'},
            {name: 'js_carrier', label: 'Carrier ID', type: 'many2one',
                model: 'nline.carrier'},
            {name: 'js_tracking_number', label: 'Shipment Tracking Number',
                type: 'char'},
            {name: 'freight_terms', label: 'Freight Terms',
                type: 'selection', options: FREIGHT_TERMS},
            {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                model: 'nline.sales_tax_group', readonly: true},
            {name: 'payment_term', label: 'Terms Rule ID', type: 'char',
                readonly: true},
            {name: 'discount_class', label: 'Discount Class ID',
                type: 'many2one', model: 'nline.discount_class',
                readonly: true},
            {name: 'invoice_ids', label: 'Invoice ID', type: 'char',
                readonly: true},
            {name: 'invoice_dates', label: 'Invoiced Date', type: 'char',
                readonly: true}]);
        var specs = el('textarea', {rows: 10, style: {width: '100%'},
            'aria-label': 'Specifications'});
        var charges = chargesEditor({editable: true, adding: false});
        var qtyInputs = [];

        var shipTabs = tabs(main, [
            {title: 'Shipping Activity', build: function (pane) {
                activityPane = pane;
            }},
            {title: 'Shipper', build: function (pane) {
                shipperPane = pane;
                pane.appendChild(el('p.muted', 'Double-click an order on ' +
                    'the Shipping Activity tab.'));
            }},
            {title: 'Sold To', build: function (pane) {
                soldToPane = pane;
            }},
            {title: 'Ship To', build: function (pane) {
                shipToPane = pane;
            }},
            {title: 'Details', build: function (pane) {
                pane.appendChild(detailsGrid.node);
            }},
            {title: 'Specs', build: function (pane) {
                pane.appendChild(el('p.muted', 'Printed on the packing ' +
                    'list.'));
                pane.appendChild(specs);
            }},
            {title: 'Charges', build: function (pane) {
                pane.appendChild(el('p.muted', 'The charges of the order ' +
                    'still to invoice: the applied ones go on the ' +
                    'invoice of this shipment.'));
                pane.appendChild(charges.node);
            }}
        ]);
        charges.set([], false);

        rights(['stock.shipment.out', 'stock.shipment.out.return',
            'sale.sale']).then(function (r) {
                can.write = r['stock.shipment.out'].write;
                can.returns = r['stock.shipment.out.return'].write;
                can.sale = r['sale.sale'].create;
                loadActivity();
                if (shipper) {
                    showShipper(shipper);
                }
            });

        function loadActivity() {
            Rpc.desk('sales_shipping_activity', [shipped]).then(
                function (rows) {
                    UI.clear(activityPane);
                    var mode = el('select', {'aria-label': 'View'},
                        el('option', {value: 'unshipped'},
                            'View Unshipped Orders'),
                        el('option', {value: 'shipped'},
                            'View Shipped Orders'));
                    mode.value = shipped ? 'shipped' : 'unshipped';
                    mode.addEventListener('change', function () {
                        shipped = mode.value === 'shipped';
                        loadActivity();
                    });
                    activityPane.appendChild(el('div.toolbar', mode,
                        el('span.muted', ' Right-click an order to ship ' +
                            'or return it.')));
                    activityPane.appendChild(table([
                        {label: 'Sales Order ID'}, {label: 'Shipper ID'},
                        {label: 'Return'}, {label: 'Desired Ship'},
                        {label: 'Customer Name'}, {label: 'PO Ref No'},
                        {label: 'Status'}, {label: 'Message'}],
                        rows.map(function (row) {
                            var open = function () {
                                loadShipper(row.id, row.model);
                                shipTabs.show(1);
                            };
                            return {ondblclick: open, oncontextmenu:
                                function (event) {
                                    activityMenu(event, row, open);
                                }, cells: [row.sales.map(function (s) {
                                    return s.number;
                                }).join(', '), row.number, row['return'] ?
                                    '✔' : '', UI.date(row.planned_date),
                                    row.customer, row.reference, row.state,
                                    el('span' + (/late|hold/i.test(
                                        row.message) ? '.js-late' : ''),
                                        row.message)]};
                        }), shipped ? 'Nothing shipped in the last 90 days.' :
                        'Nothing to ship.'));
                }, UI.showError);
        }

        function activityMenu(event, row, open) {
            var items = [{label: 'Open', onclick: open}];
            if (!row['return'] && row.state !== 'done' && can.write) {
                items.push({label: 'Ship', onclick: function () {
                    Rpc.desk('sales_shipper_get', [row.id, row.model]).then(
                        function (data) {
                            ship(data, true);
                        }, UI.showError);
                }});
            }
            if (row['return'] && row.state !== 'done' && can.returns) {
                items.push({label: 'Receive Return', onclick: function () {
                    receive(row.id);
                }});
            }
            if (!row['return'] && row.state === 'done' && can.sale &&
                    row.sales.length) {
                items.push('-', {label: 'Mark for Return…', onclick:
                    function () {
                        returnDialog(row.sales[0]);
                    }});
            }
            items.push('-', {label: shipped ? 'View Unshipped Orders' :
                'View Shipped Orders', onclick: function () {
                    shipped = !shipped;
                    loadActivity();
                }});
            UI.contextMenu(event, items);
        }

        function loadShipper(id, model) {
            return Rpc.desk('sales_shipper_get', [id, model ||
                'stock.shipment.out']).then(showShipper, UI.showError);
        }

        function showShipper(data) {
            shipper = data;
            var editable = can.write && !data['return'] &&
                ['draft', 'waiting', 'assigned'].indexOf(data.state) >= 0;
            UI.clear(shipperPane);
            shipperPane.appendChild(el('div.grid-form',
                el('div', el('label.field', 'Shipper ID'),
                    el('strong', data.number), ' ', el('span.badge' +
                        (data.state === 'done' ? '.paid' : '.open'),
                        data.state), data['return'] ? el('span.badge.open',
                        'Return') : null),
                el('div', el('label.field', 'Sales Order ID'),
                    data.sales.map(function (s) {
                        return el('a', {href: '#', onclick: function (e) {
                            e.preventDefault();
                            openOrder(s.id, s.number);
                        }}, s.number + ' (' + label(JS_STATUS,
                            s.js_status) + ') ');
                    })),
                el('div', el('label.field', 'Customer ID'),
                    name(data.customer)),
                el('div', el('label.field', 'Shipped Date'),
                    UI.date(data.effective_date) || '—'),
                el('div', el('label.field', 'Purchase Order Number'),
                    data.reference),
                el('div', el('label.field', 'Invoice Status'),
                    data.invoices.length ? data.invoices.map(function (i) {
                        return (i.number || 'draft') + ' (' + i.state + ')';
                    }).join(', ') : 'Unapproved')));
            qtyInputs = [];
            shipperPane.appendChild(table([{label: 'Line No'},
                {label: 'SO Line No'}, {label: 'Line Desired Ship Date'},
                {label: 'Part ID'}, {label: 'Description'},
                {label: 'Customer Part ID'}, {label: 'Ordered', num: true},
                {label: data['return'] ? 'Return Qty' : 'Ship Qty',
                    num: true}, {label: 'U/M'}, {label: 'Location'},
                {label: 'Qty Available', num: true}, {label: 'Transacted'}],
                data.lines.map(function (line) {
                    var qty = el('input.js-qty', {type: 'text', value:
                        num(line.quantity), 'aria-label': 'Ship Qty'});
                    qty.disabled = !editable;
                    qtyInputs.push({move: line.move, input: qty,
                        quantity: line.quantity});
                    return {cells: [String(line.line_no),
                        line.so_line_no === null ? '' :
                            String(line.so_line_no),
                        UI.date(line.desired_date), name(line.product),
                        line.description, line.customer_part,
                        num(line.ordered), qty, line.unit, line.location,
                        num(line.available), line.state === 'done' ? '✔' :
                            '']};
                })));
            if (editable) {
                shipperPane.appendChild(el('p.muted', 'Ship less than the ' +
                    'quantity to back order the rest (0: the whole line).'));
            }
            var buttons = el('div.toolbar');
            if (editable) {
                buttons.appendChild(el('button', {type: 'button', onclick:
                    function () {
                        ship(data, false);
                    }}, 'Save'));
                buttons.appendChild(el('button.primary', {type: 'button',
                    onclick: function () {
                        ship(data, true);
                    }}, 'Ship'));
            }
            if (!data['return'] && can.write) {
                /* The step by step buttons of the desk's window */
                (SHIP_STEPS[data.state] || []).forEach(function (step) {
                    buttons.appendChild(el('button', {type: 'button',
                        onclick: function () {
                            Rpc.model('stock.shipment.out', step[0],
                                [[data.id]]).then(function () {
                                    UI.toast('Shipper ' + data.number + ': ' +
                                        step[1], 'ok');
                                    loadShipper(data.id);
                                    loadActivity();
                                }, UI.showError);
                        }}, step[1]));
                });
            }
            if (data['return'] && data.state !== 'done' && can.returns) {
                buttons.appendChild(el('button.primary', {type: 'button',
                    onclick: function () {
                        receive(data.id);
                    }}, 'Receive Return'));
            }
            if (!data['return']) {
                [['stock.shipment.out.picking_list', 'Picking List'],
                    ['stock.shipment.out.delivery_note', 'Packing List']]
                    .forEach(function (r) {
                        buttons.appendChild(el('button', {type: 'button',
                            onclick: function () {
                                Rpc.report(r[0], [data.id]).then(function (x) {
                                    UI.openReport(x, r[1]);
                                }, UI.showError);
                            }}, r[1]));
                    });
            }
            if (!data['return'] && data.state === 'done' && can.sale &&
                    data.sales.length) {
                buttons.appendChild(el('button', {type: 'button', onclick:
                    function () {
                        returnDialog(data.sales[0]);
                    }}, 'Return…'));
            }
            shipperPane.appendChild(buttons);
            addressPane(soldToPane, data.sold_to);
            addressPane(shipToPane, data.ship_to);
            detailsGrid.set(Object.assign({}, data, {
                invoice_ids: data.invoices.map(function (i) {
                    return i.number || 'draft';
                }).join(', '),
                invoice_dates: data.invoices.map(function (i) {
                    return UI.date(i.date);
                }).join(', ')}));
            detailsGrid.lock(can.write && !data['return'] &&
                data.state !== 'done' && data.state !== 'cancelled');
            specs.value = data.js_specs || '';
            specs.disabled = !(can.write && !data['return']);
            charges.set(data.charges, can.write && !data['return'] &&
                data.state !== 'done');
            UI.setTitle('Shipper ' + data.number);
        }

        function ship(data, doShip) {
            var values = {id: data.id, ship: doShip};
            if (shipper && shipper.id === data.id) {
                Object.assign(values, detailsGrid.get());
                delete values.order_date;
                delete values.payment_term;
                delete values.invoice_ids;
                delete values.invoice_dates;
                values.js_specs = specs.value || null;
                values.charges = charges.values().filter(function (c) {
                    return c.id;
                });
                values.lines = qtyInputs.map(function (q) {
                    return {move: q.move, quantity: q.input.value === '' ?
                        q.quantity : UI.parseMoney(q.input.value)};
                });
            }
            UI.service('sales_ship', values).then(function (result) {
                UI.toast('Shipper ' + result.number + (doShip ? ' shipped' :
                    ' saved'), 'ok');
                showShipper(result);
                loadActivity();
                if (doShip) {
                    UI.confirm('Packing List', 'Print the packing list?')
                        .then(function (ok) {
                            if (ok) {
                                Rpc.report('stock.shipment.out.delivery_note',
                                    [result.id]).then(function (x) {
                                        UI.openReport(x, 'Packing List');
                                    }, UI.showError);
                            }
                        });
                }
            }, failed);
        }

        function receive(id) {
            Rpc.desk('sales_return_receive', [id]).then(function (data) {
                UI.toast('Return ' + data.number + ' received', 'ok');
                showShipper(data);
                shipTabs.show(1);
                loadActivity();
            }, UI.showError);
        }

        /* Marking a Sales Order for Return: the quantities to return */
        function returnDialog(sale) {
            Rpc.desk('sale_order_get', [sale.id]).then(function (order) {
                var inputs = [];
                var rows = order.lines.filter(function (l) {
                    return l.shipped_quantity > 0;
                }).map(function (l) {
                    var input = el('input.js-qty', {type: 'text', value: '0',
                        'aria-label': 'Return Qty'});
                    inputs.push({line: l.id, input: input});
                    return {cells: [String(l.line_no), l.product ?
                        l.product.rec_name : '', l.description,
                        num(l.shipped_quantity), input]};
                });
                UI.modal('Return parts of order ' + (order.number ||
                    order.id), [el('p.muted', 'Makes a return order and ' +
                    'its return shipper; receive it on the Shipping ' +
                    'Activity tab, its credit memo waits on Invoicing.'),
                    table([{label: 'Line No'}, {label: 'Part ID'},
                        {label: 'Description'}, {label: 'Shipped', num: true},
                        {label: 'Return Qty', num: true}], rows,
                        'Nothing shipped on this order.')], [
                    {label: 'Cancel'},
                    {label: 'Return', primary: true, onclick: function () {
                        var lines = inputs.map(function (i) {
                            return {line: i.line, quantity:
                                UI.parseMoney(i.input.value) || 0};
                        }).filter(function (l) {
                            return l.quantity > 0;
                        });
                        Rpc.desk('sales_return', [{sale: order.id, lines:
                            lines}]).then(function (result) {
                                UI.toast('Return order ' + result.sale.number +
                                    ' made', 'ok');
                                shipped = false;
                                loadActivity();
                                shipTabs.show(0);
                            }, UI.showError);
                    }}]);
            }, UI.showError);
        }

        global.document.addEventListener('keydown', function onKey(event) {
            if (!main.isConnected) {
                global.document.removeEventListener('keydown', onKey);
                return;
            }
            if (event.key === 'F5') {
                event.preventDefault();
                loadActivity();
                if (shipper) {
                    loadShipper(shipper.id, shipper.model);
                }
            }
        });

        if (params && params[0]) {
            loadShipper(parseInt(params[0], 10)).then(function () {
                shipTabs.show(1);
            });
        }
    };

    /* ---- Invoicing ------------------------------------------------------------ */

    Screens.invoicing = function (main, params) {
        injectCss();
        var form = UI.form(main, {title: 'Invoicing', extra: [
            {label: 'Post Selected', title: 'Tools > Invoicing > Invoice: ' +
                'post and print the ticked invoices', onclick: function () {
                    postSelected();
                }}]});
        main = form.body;
        main.classList.add('js-sales');
        var invoice = null;
        var activity = [];
        var can = {write: true, create: true};
        var activityPane, invoicePane, billToPane, shipToPane, taxesPane;
        var details = fieldGrid([
            {name: 'order_date', label: 'Order Date', type: 'date',
                readonly: true},
            {name: 'invoice_date', label: 'Invoiced Date', type: 'date'},
            {name: 'payment_term', label: 'Terms Rule ID', type: 'many2one',
                model: 'account.invoice.payment_term'},
            {name: 'receivable', label: 'Receivables Account ID',
                type: 'char', readonly: true},
            {name: 'fob_point', label: 'FOB Point', type: 'many2one',
                model: 'nline.fob_point', readonly: true},
            {name: 'ship_via', label: 'Ship Via', type: 'many2one',
                model: 'nline.ship_via', readonly: true},
            {name: 'js_carrier', label: 'Carrier ID', type: 'many2one',
                model: 'nline.carrier', readonly: true},
            {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                model: 'nline.sales_tax_group', readonly: true},
            {name: 'freight_terms', label: 'Freight Terms',
                type: 'selection', options: FREIGHT_TERMS, readonly: true},
            {name: 'discount_class', label: 'Discount Class ID',
                type: 'many2one', model: 'nline.discount_class',
                readonly: true}]);
        var specs = el('textarea', {rows: 10, style: {width: '100%'},
            'aria-label': 'Specifications'});
        var charges = chargesEditor({editable: true, invoiceEdit: true});
        var lineInputs = [];
        var reference = el('input', {type: 'text', 'aria-label':
            'Purchase Order Number'});
        var finder = UI.picker('account.invoice', {label: 'Invoice ID',
            placeholder: 'Invoice ID (any status)', domain: [['type', '=',
                'out']], onselect: function (r) {
                    loadInvoice(r.id);
                }});

        var invoiceTabs = tabs(main, [
            {title: 'Invoicing Activity', build: function (pane) {
                activityPane = pane;
            }},
            {title: 'Invoice', build: function (pane) {
                invoicePane = pane;
            }},
            {title: 'Bill To', build: function (pane) {
                billToPane = pane;
            }},
            {title: 'Ship To', build: function (pane) {
                shipToPane = pane;
            }},
            {title: 'Details', build: function (pane) {
                pane.appendChild(details.node);
            }},
            {title: 'Specs', build: function (pane) {
                pane.appendChild(el('p.muted', 'Printed on the invoice.'));
                pane.appendChild(specs);
            }},
            {title: 'Charges', build: function (pane) {
                pane.appendChild(charges.node);
            }},
            {title: 'Taxes', build: function (pane) {
                taxesPane = pane;
            }}
        ]);
        charges.set([], false);
        renderInvoice();

        rights(['account.invoice']).then(function (r) {
            can.write = r['account.invoice'].write;
            can.create = r['account.invoice'].create;
            form.allow(true, can.write ? [] : ['Post Selected']);
            loadActivity();
            if (invoice) {
                showInvoice(invoice);
            }
        });

        function loadActivity() {
            Rpc.desk('sales_invoicing_activity', []).then(function (rows) {
                activity = rows;
                UI.clear(activityPane);
                activityPane.appendChild(el('p.muted', 'The invoices of ' +
                    'shipped orders and the credit memos of returns wait ' +
                    'here as drafts: check them, then tick and post.'));
                activityPane.appendChild(table([{label: ''},
                    {label: 'Shipper ID'}, {label: 'Order ID'},
                    {label: 'Name'}, {label: 'Ship Date'},
                    {label: 'Reference'}, {label: 'Amount', num: true},
                    {label: 'Shipper Type'}], rows.map(function (row) {
                        row.box = el('input', {type: 'checkbox',
                            'aria-label': 'Post'});
                        row.box.hidden = !can.write;
                        var open = function () {
                            loadInvoice(row.id);
                            invoiceTabs.show(1);
                        };
                        return {ondblclick: open, oncontextmenu: function (e) {
                            UI.contextMenu(e, [{label: 'Open', onclick:
                                open}].concat(can.write ? [{label:
                                'Invoice (post and print)', onclick:
                                function () {
                                    post([row.id]);
                                }}] : []));
                        }, cells: [row.box, row.shippers.map(function (s) {
                            return s.number;
                        }).join(', '), row.sales.map(function (s) {
                            return s.number;
                        }).join(', '), row.party,
                            row.shippers.map(function (s) {
                                return UI.date(s.date);
                            }).join(', '), row.reference,
                            UI.money(row.total_amount), row.type]};
                    }), 'No invoice waiting.'));
            }, UI.showError);
        }

        function loadInvoice(id) {
            return Rpc.desk('sales_invoice_get', [id]).then(showInvoice,
                UI.showError);
        }

        function renderInvoice() {
            UI.clear(invoicePane);
            invoicePane.appendChild(el('div.grid-form', el('div', {style:
                {gridColumn: 'span 2'}}, el('label.field',
                'Find an invoice'), finder.node)));
            if (!invoice) {
                invoicePane.appendChild(el('p.muted', 'Double-click an ' +
                    'invoice on the Invoicing Activity tab, or find one.'));
                return;
            }
            var data = invoice;
            var draft = data.state === 'draft' && can.write;
            reference.value = data.reference || '';
            reference.disabled = !draft;
            invoicePane.appendChild(el('div.grid-form',
                el('div', el('label.field', 'Invoice ID'),
                    el('strong', data.number || '(when posted)'), ' ',
                    el('span.badge' + (data.state === 'draft' ? '.open' :
                        '.paid'), data.state)),
                el('div', el('label.field', 'Shipper ID'),
                    data.shippers.map(function (s) {
                        return s.number;
                    }).join(', ')),
                el('div', el('label.field', 'Sales Order ID'),
                    data.sales.map(function (s) {
                        return el('a', {href: '#', onclick: function (e) {
                            e.preventDefault();
                            openOrder(s.id, s.number);
                        }}, s.number + ' ');
                    })),
                el('div', el('label.field', 'Customer ID'),
                    name(data.party)),
                el('div', el('label.field', 'Shipped Date'),
                    data.shippers.map(function (s) {
                        return UI.date(s.date);
                    }).join(', ')),
                el('div', el('label.field', 'Purchase Order Number'),
                    reference),
                el('div', el('label.field', 'Invoice Status'),
                    data.state === 'draft' ? 'Unapproved' : 'Approved')));
            lineInputs = [];
            invoicePane.appendChild(table([{label: 'Line No'},
                {label: 'Part ID'}, {label: 'Description'},
                {label: 'Order'}, {label: 'Ship Qty', num: true},
                {label: 'U/M'}, {label: 'Unit Price', num: true},
                {label: 'Disc %', num: true}, {label: 'Extension',
                    num: true}], data.lines.map(function (line) {
                    var qty = el('input.js-qty', {type: 'text', value:
                        num(line.quantity), 'aria-label': 'Ship Qty'});
                    var price = UI.moneyInput({'aria-label': 'Unit Price'});
                    price.value = UI.money(line.unit_price);
                    qty.disabled = price.disabled = !draft;
                    lineInputs.push({id: line.id, qty: qty, price: price});
                    return {cells: [String(line.line_no), name(line.product),
                        line.description, line.sale, qty, line.unit, price,
                        num(line.trade_discount), UI.money(line.amount)]};
                })));
            invoicePane.appendChild(el('div.js-totals',
                el('div', el('div.muted', 'Lines'),
                    UI.money(data.untaxed_amount - data.charges_amount)),
                el('div', el('div.muted', 'Charge'),
                    UI.money(data.charges_amount)),
                el('div', el('div.muted', 'Tax'), UI.money(data.tax_amount)),
                el('div', el('div.muted', 'Total'),
                    el('strong', UI.money(data.total_amount, true)))));
            var buttons = el('div.toolbar');
            if (draft) {
                buttons.appendChild(el('button', {type: 'button', onclick:
                    saveInvoice}, 'Save'));
                buttons.appendChild(el('button.primary', {type: 'button',
                    onclick: function () {
                        saveInvoice().then(function () {
                            post([data.id]);
                        });
                    }}, 'Invoice'));
            }
            buttons.appendChild(el('button', {type: 'button', onclick:
                function () {
                    Rpc.report('account.invoice', [data.id]).then(
                        function (r) {
                            UI.openReport(r, 'Invoice');
                        }, UI.showError);
                }}, 'Print'));
            if (data.state !== 'draft' && data.state !== 'cancelled' &&
                    can.create) {
                buttons.appendChild(el('button', {type: 'button', onclick:
                    function () {
                        UI.confirm('Credit Memo', 'Issue a credit memo for ' +
                            'invoice ' + data.number + '?').then(
                            function (ok) {
                                if (!ok) {
                                    return;
                                }
                                Rpc.desk('sales_credit_memo', [data.id]).then(
                                    function (memo) {
                                        UI.toast('Credit memo made: check ' +
                                            'and post it', 'ok');
                                        showInvoice(memo);
                                        loadActivity();
                                    }, UI.showError);
                            });
                    }}, 'Credit Memo'));
            }
            buttons.appendChild(el('button', {type: 'button', onclick:
                function () {
                    UI.openRecord('account.invoice', data.id, data.number);
                }}, 'Open in Tryton'));
            invoicePane.appendChild(buttons);
        }

        function showInvoice(data) {
            invoice = data;
            var draft = data.state === 'draft' && can.write;
            renderInvoice();
            addressPane(billToPane, data.bill_to);
            addressPane(shipToPane, data.ship_to);
            details.set(Object.assign({}, data, {order_date: data.sales
                .length ? data.sales[0].sale_date : null}));
            details.lock(draft);
            specs.value = data.comment || '';
            specs.disabled = !draft;
            charges.set(data.charges, draft);
            UI.clear(taxesPane).appendChild(table([{label: 'Description'},
                {label: 'Account ID'}, {label: 'Tax Percent', num: true},
                {label: 'Taxable', num: true}, {label: 'Tax Amount',
                    num: true}], data.taxes.map(function (t) {
                    return {cells: [t.description, t.account, num(t.percent),
                        UI.money(t.base), UI.money(t.amount)]};
                }), 'No tax.'));
            UI.setTitle('Invoice ' + (data.number || data.id));
        }

        function saveInvoice() {
            var d = details.get();
            return UI.service('sales_invoice_save', {id: invoice.id,
                invoice_date: d.invoice_date, payment_term: d.payment_term,
                reference: reference.value || null,
                comment: specs.value || null,
                lines: lineInputs.map(function (l) {
                    return {id: l.id, quantity: UI.parseMoney(l.qty.value),
                        unit_price: String(UI.parseMoney(l.price.value))};
                }),
                charges: charges.values()}).then(function (data) {
                    UI.toast('Invoice saved', 'ok');
                    showInvoice(data);
                    loadActivity();
                    return data;
                }, function (error) {
                    failed(error);
                    throw error;
                });
        }

        function post(ids) {
            Rpc.model('account.invoice', 'post', [ids]).then(function () {
                UI.toast(ids.length + ' invoice(s) posted', 'ok');
                Rpc.report('account.invoice', ids).then(function (r) {
                    UI.openReport(r, 'Invoices');
                }, function () {});
                loadActivity();
                if (invoice && ids.indexOf(invoice.id) >= 0) {
                    loadInvoice(invoice.id);
                }
            }, UI.showError);
        }

        function postSelected() {
            var ids = activity.filter(function (r) {
                return r.box && r.box.checked;
            }).map(function (r) {
                return r.id;
            });
            if (!ids.length) {
                UI.showError('Tick the invoices to post.');
                return;
            }
            post(ids);
        }

        global.document.addEventListener('keydown', function onKey(event) {
            if (!main.isConnected) {
                global.document.removeEventListener('keydown', onKey);
                return;
            }
            if (event.key === 'F5') {
                event.preventDefault();
                loadActivity();
                if (invoice) {
                    loadInvoice(invoice.id);
                }
            } else if ((event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === 's' && invoice &&
                    invoice.state === 'draft' && can.write) {
                event.preventDefault();
                saveInvoice();
            }
        });

        if (params && params[0]) {
            loadInvoice(parseInt(params[0], 10)).then(function () {
                invoiceTabs.show(1);
            });
        }
    };
}(window));
