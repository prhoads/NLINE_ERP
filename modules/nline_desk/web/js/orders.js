/* N-Line screens: Jobshop order to cash (UI upgrade phase 3): the
 * Customers and Parts windows, Customer Order Entry (lines linked to their
 * work orders), Shipping and Invoicing */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    var CONTACT_TYPES = [['phone', 'Phone'], ['mobile', 'Mobile'],
        ['email', 'E-Mail'], ['fax', 'Fax'], ['website', 'Website'],
        ['other', 'Other']];

    var ADDRESS_FIELDS = [
        {name: 'party_name', label: 'Name', type: 'char'},
        {name: 'street', label: 'Street', type: 'char'},
        {name: 'city', label: 'City', type: 'char'},
        {name: 'postal_code', label: 'Zip', type: 'char'},
        {name: 'invoice', label: 'Bill To', type: 'boolean'},
        {name: 'delivery', label: 'Ship To', type: 'boolean'}];

    function documentsTab(model, domain, columns, open) {
        return function (pane, record) {
            Rpc.searchRead(model, domain(record), columns.map(function (c) {
                return c[0];
            }), {limit: 200, order: [['id', 'DESC']]}).then(function (rows) {
                var body = el('tbody');
                rows.forEach(function (row) {
                    body.appendChild(el('tr', {title: 'Double-click to open',
                        ondblclick: function () {
                            open(row);
                        }}, columns.map(function (c) {
                            var v = row[c[0]];
                            return el('td' + (c[2] ? '.num' : ''), c[2] ?
                                UI.money(v) : /date/.test(c[0]) ?
                                    UI.date(v) : v === null ? '' : String(v));
                        })));
                });
                if (!rows.length) {
                    body.appendChild(el('tr', el('td', {colspan:
                        columns.length}, 'None.')));
                }
                pane.appendChild(el('div.table-wrap', el('table.data',
                    el('thead', el('tr', columns.map(function (c) {
                        return el('th' + (c[2] ? '.num' : ''), c[1]);
                    }))), body)));
            }, UI.showError);
        };
    }

    /* ---- Customers / Suppliers windows ------------------------------- */

    function partyWindow(main, kind) {
        var customer = kind === 'customer';
        UI.master(main, {
            title: customer ? 'Customers' : 'Suppliers',
            model: 'party.party',
            label: customer ? 'Customer ID' : 'Supplier ID',
            order: [['name', 'ASC']],
            tabs: [
                {title: 'General', fields: [
                    {name: 'name', label: 'Name', type: 'char', span: 2},
                    {name: 'code', label: 'Code', type: 'char',
                        readonly: true},
                    {name: 'active', label: 'Active', type: 'boolean',
                        default: true}]},
                {title: 'Addresses', lines: {name: 'addresses',
                    model: 'party.address', inverse: 'party',
                    fields: ADDRESS_FIELDS}},
                {title: 'Contacts', lines: {name: 'contact_mechanisms',
                    model: 'party.contact_mechanism', inverse: 'party',
                    fields: [
                        {name: 'type', label: 'Type', type: 'selection',
                            options: CONTACT_TYPES},
                        {name: 'value', label: 'Value', type: 'char'},
                        {name: 'name', label: 'Contact', type: 'char'}]}},
                {title: 'Account', fields: customer ? [
                    {name: 'customer_payment_term', label: 'Terms',
                        type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'receivable', label: 'Open balance',
                        type: 'money', readonly: true}] : [
                    {name: 'supplier_payment_term', label: 'Terms',
                        type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'payable', label: 'Open balance',
                        type: 'money', readonly: true}]},
                {title: customer ? 'Orders' : 'Purchase Orders',
                    render: documentsTab(customer ? 'sale.sale' :
                        'purchase.purchase', function (record) {
                            return [['party', '=', record.id]];
                        }, [['number', 'Order'], [customer ? 'sale_date' :
                            'purchase_date', 'Date'], ['reference',
                            'Reference'], ['state', 'Status'],
                            ['total_amount', 'Total', true]],
                        function (row) {
                            if (customer) {
                                UI.openScreen('orders/' + row.id,
                                    'Order ' + (row.number || row.id));
                            } else {
                                UI.openScreen('purchase-orders/' + row.id,
                                    'PO ' + (row.number || row.id));
                            }
                        })},
                {title: 'Invoices', render: documentsTab('account.invoice',
                    function (record) {
                        return [['party', '=', record.id], ['type', '=',
                            customer ? 'out' : 'in']];
                    }, [['number', 'Number'], ['invoice_date', 'Date'],
                        ['reference', 'Reference'], ['state', 'Status'],
                        ['total_amount', 'Total', true],
                        ['amount_to_pay', 'Open', true]], function (row) {
                        UI.openRecord('account.invoice', row.id, row.number);
                    })}
            ],
            browse: [
                {name: 'name', label: 'Name'},
                {name: 'code', label: 'Code'},
                {name: customer ? 'receivable' : 'payable', label:
                    'Balance', type: 'money'}],
            beforeSave: function (values) {
                delete values.receivable;
                delete values.payable;
                return values;
            }
        });
    }

    Screens.customerWindow = function (main) {
        partyWindow(main, 'customer');
    };

    Screens.supplierWindow = function (main) {
        partyWindow(main, 'supplier');
    };

    /* ---- Parts window --------------------------------------------------- */

    Screens.parts = function (main, params) {
        function info(render) {
            return function (pane, record) {
                Rpc.desk('part_info', [record.id]).then(function (data) {
                    render(pane, data);
                }, UI.showError);
            };
        }

        function table(pane, heads, rows) {
            var body = el('tbody');
            rows.forEach(function (row) {
                body.appendChild(row);
            });
            if (!rows.length) {
                body.appendChild(el('tr', el('td', {colspan: heads.length},
                    'None.')));
            }
            pane.appendChild(el('div.table-wrap', el('table.data',
                el('thead', el('tr', heads.map(function (h) {
                    return el('th', h);
                }))), body)));
        }

        UI.master(main, {
            title: 'Parts',
            model: 'product.template',
            open: params && params[0] ? parseInt(params[0], 10) : null,
            label: 'Part ID',
            order: [['name', 'ASC']],
            tabs: [
                {title: 'General', fields: [
                    {name: 'name', label: 'Description', type: 'char',
                        span: 2},
                    {name: 'code', label: 'Part ID (code)', type: 'char'},
                    {name: 'type', label: 'Type', type: 'selection',
                        options: [['goods', 'Goods (stocked)'],
                            ['assets', 'Assets'], ['service', 'Service']],
                        default: 'goods'},
                    {name: 'default_uom', label: 'Unit', type: 'many2one',
                        model: 'product.uom'},
                    {name: 'engineering_revision', label: 'Revision',
                        type: 'char'},
                    {name: 'drawing_number', label: 'Drawing', type: 'char'},
                    {name: 'drawing_revision', label: 'Drawing revision',
                        type: 'char'},
                    {name: 'salable', label: 'Sold', type: 'boolean'},
                    {name: 'purchasable', label: 'Purchased',
                        type: 'boolean'},
                    {name: 'producible', label: 'Fabricated',
                        type: 'boolean'},
                    {name: 'active', label: 'Active', type: 'boolean',
                        default: true}]},
                {title: 'Costing', fields: [
                    {name: 'list_price', label: 'Unit price', type: 'money'},
                    {name: 'cost_price', label: 'Unit cost', type: 'money'},
                    {name: 'cost_price_method', label: 'Cost method',
                        type: 'selection', options: [['fixed', 'Fixed'],
                            ['average', 'Average'], ['fifo', 'FIFO']]}]},
                {title: 'Stock', render: info(function (pane, data) {
                    table(pane, ['Part', 'On hand', 'Forecast', 'Unit'],
                        data.stock.map(function (s) {
                            return el('tr', el('td', s.product),
                                el('td.num', String(s.on_hand)),
                                el('td.num', String(s.forecast)),
                                el('td', s.unit));
                        }));
                })},
                {title: 'Where Used', render: info(function (pane, data) {
                    table(pane, ['Used in', 'Name', 'Qty', 'Status'],
                        data.where_used.map(function (w) {
                            return el('tr', {ondblclick: function () {
                                UI.openRecord(w.model, w.id, w.name);
                            }}, el('td', w.kind), el('td', w.name),
                                el('td.num', String(w.quantity)),
                                el('td', w.state));
                        }));
                })},
                {title: 'Transactions', render: info(function (pane, data) {
                    table(pane, ['Date', 'From', 'To', 'Qty', 'Cost',
                        'Origin', 'Status'], data.moves.map(function (m) {
                            return el('tr', {ondblclick: function () {
                                UI.openRecord('stock.move', m.id, m.origin);
                            }}, el('td', UI.date(m.date)), el('td', m.from),
                                el('td', m.to),
                                el('td.num', String(m.quantity)),
                                el('td.num', m.cost === null ? '' :
                                    UI.money(m.cost)),
                                el('td', m.origin), el('td', m.state));
                        }));
                })}
            ],
            browse: [
                {name: 'code', label: 'Part ID'},
                {name: 'name', label: 'Description'},
                {name: 'type', label: 'Type'},
                {name: 'list_price', label: 'Price', type: 'money'}]
        });
    };

    /* ---- Customer Order Entry ------------------------------------------- */

    Screens.salesOrder = function (main, params) {
        var order = null;
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var form = UI.form(main, {title: 'Customer Order Entry',
            kind: 'customer',
            find: {model: 'sale.sale', title: 'Find orders',
                order: [['sale_date', 'DESC'], ['id', 'DESC']],
                columns: [{field: 'number', label: 'Order'},
                    {field: 'sale_date', label: 'Date'},
                    {field: 'rec_name', label: 'Customer'},
                    {field: 'total_amount', label: 'Total', money: true},
                    {field: 'state', label: 'Status'}]},
            extra: [
                {label: 'Quote', onclick: function () {
                    workflow('quote');
                }},
                {label: 'Confirm', onclick: function () {
                    workflow('confirm');
                }},
                {label: 'Print', onclick: function () {
                    if (order) {
                        Rpc.report('sale.sale', [order.id]).then(function (r) {
                            UI.openReport(r, 'Order');
                        }, UI.showError);
                    }
                }}],
            onSave: function () {
                return save();
            },
            onClear: function () {
                global.location.hash = '#/orders/new?' + Date.now();
            }});
        main = form.body;
        var number = el('strong', 'New order');
        var status = el('span.badge.open', 'draft');
        var customer = UI.picker('party.party', {placeholder: 'Customer',
            label: 'Customer', fields: ['customer_payment_term'],
            onselect: function (record) {
                form.showParty(record.id);
                if (record.customer_payment_term) {
                    term.value = record.customer_payment_term;
                }
                shipTo.set(null, '');
            }});
        var shipTo = UI.picker('party.address', {placeholder: 'Ship to',
            label: 'Ship to'});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Order date'});
        var desired = el('input', {type: 'date', 'aria-label':
            'Desired ship date'});
        var po = el('input', {type: 'text', 'aria-label': 'Customer PO'});
        var term = el('select', {'aria-label': 'Terms'}, el('option',
            {value: ''}, ''));
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var total = el('div.big-total', '$0.00');
        var linesPanel = el('div');
        var links = el('div');
        var grid = null;
        Rpc.searchRead('account.invoice.payment_term', [], ['name'],
            {order: [['name', 'ASC']]}).then(function (rows) {
            rows.forEach(function (row) {
                term.appendChild(el('option', {value: row.id}, row.name));
            });
            if (order) {
                term.value = order.payment_term || '';
            }
        });
        main.appendChild(el('div.panel', el('div.grid-form',
                el('div', el('label.field', 'Order ID'), number, ' ', status),
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Customer'), customer.node),
                el('div', el('label.field', 'Order date'), date),
                el('div', el('label.field', 'Desired ship date'), desired),
                el('div', el('label.field', 'Customer PO'), po),
                el('div', el('label.field', 'Terms'), term),
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Ship to'), shipTo.node)),
            el('h2', 'Lines'), linesPanel,
            el('div.grid-form', {style: {marginTop: '12px'}},
                el('div', {style: {gridColumn: 'span 2'}},
                    el('label.field', 'Memo'), memo), el('div'),
                el('div', el('label.field', 'Total'), total)),
            el('h2', 'Links: work orders of the lines'), links));

        function newGrid(lines) {
            grid = UI.grid({total: 'amount', required: 'part',
                onchange: function (sum) {
                    total.textContent = UI.money(sum, true);
                }, columns: [
                    {key: 'part', label: 'Part', width: '24%', kind: 'picker',
                        picker: {model: 'product.product', domain: [
                            ['salable', '=', true]], placeholder: 'Part',
                            fields: ['list_price'],
                            onselect: function (record, controls) {
                                controls.description.value = record.rec_name
                                    .replace(/^\[[^\]]*\]\s*/, '');
                                if (record.list_price) {
                                    controls.price.value = UI.money(
                                        record.list_price);
                                }
                            }}},
                    {key: 'description', label: 'Description'},
                    {key: 'quantity', label: 'Qty', width: '9%',
                        kind: 'number', default: '1'},
                    {key: 'price', label: 'Unit Price', width: '13%',
                        kind: 'money'},
                    {key: 'amount', label: 'Amount', width: '13%',
                        kind: 'computed', compute: function (v) {
                            return Math.round((v.quantity || 0) *
                                (v.price || 0) * 100) / 100;
                        }}
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
                controls.quantity.value = String(line.quantity);
                controls.price.value = UI.money(line.unit_price);
                controls.part.lineId = line.id;
            });
            grid.update();
            UI.clear(linesPanel).appendChild(grid.node);
        }

        function readOnlyLines(lines) {
            grid = null;
            var body = el('tbody');
            lines.forEach(function (line) {
                body.appendChild(el('tr', el('td', line.product ?
                    line.product.rec_name : ''), el('td', line.description),
                    el('td.num', String(line.quantity)),
                    el('td.num', UI.money(line.unit_price)),
                    el('td.num', UI.money(line.amount))));
            });
            UI.clear(linesPanel).appendChild(el('div.table-wrap',
                el('table.data', el('thead', el('tr', el('th', 'Part'),
                    el('th', 'Description'), el('th.num', 'Qty'),
                    el('th.num', 'Unit Price'), el('th.num', 'Amount'))),
                    body)));
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
                        UI.openScreen('workorders/' + l.id, 'WO ' +
                            l.number);
                    }}, (l.job ? 'Job ' : 'WO ') + l.number + ' (' +
                        l.state + ')'));
                    cell.appendChild(el('span', ' '));
                });
                var confirmed = order.state === 'confirmed' ||
                    order.state === 'processing';
                body.appendChild(el('tr', el('td', line.product ?
                    line.product.rec_name : ''),
                    el('td.num', String(line.quantity)),
                    el('td', UI.date(line.shipping_date)), cell,
                    el('td', confirmed && !line.links.length ?
                        el('button', {type: 'button', onclick: function () {
                            UI.service('sale_line_work_order', line.id).then(
                                function (wo) {
                                    UI.toast('Work order ' + wo.number +
                                        ' created', 'ok');
                                    load(order.id);
                                }, failed);
                        }}, 'New WO') : null)));
            });
            links.appendChild(el('div.table-wrap', el('table.data',
                el('thead', el('tr', el('th', 'Part'), el('th.num', 'Qty'),
                    el('th', 'Ship date'), el('th', 'Work orders'),
                    el('th', ''))), body)));
            if (order.state === 'draft' || order.state === 'quotation') {
                links.appendChild(el('p.muted', 'Confirm the order to ' +
                    'create the work orders of its lines.'));
            }
        }

        function show(data) {
            order = data;
            number.textContent = data.number || ('#' + data.id);
            status.textContent = data.state;
            status.className = 'badge ' + (data.state === 'done' ? 'paid' :
                'open');
            customer.set(data.party.id, data.party.rec_name);
            form.showParty(data.party.id);
            date.value = data.sale_date || '';
            desired.value = data.shipping_date || '';
            po.value = data.reference;
            memo.value = data.description;
            term.value = data.payment_term || '';
            shipTo.set(data.shipment_address && data.shipment_address.id,
                data.shipment_address && data.shipment_address.rec_name);
            total.textContent = UI.money(data.total_amount, true);
            if (data.state === 'draft') {
                newGrid(data.lines);
            } else {
                readOnlyLines(data.lines);
            }
            renderLinks();
            UI.setTitle('Order ' + (data.number || data.id));
        }

        function load(id) {
            return Rpc.desk('sale_order_get', [id]).then(show, UI.showError);
        }

        function save() {
            if (order && order.state !== 'draft') {
                UI.showError('Only a draft order can change here.');
                return;
            }
            if (!customer.value()) {
                UI.showError('Choose the customer.');
                return;
            }
            var lines = grid.controls().filter(function (c) {
                return c.part.value();
            }).map(function (c) {
                return {
                    id: c.part.lineId || null,
                    product: c.part.value(),
                    description: c.description.value || null,
                    quantity: UI.parseMoney(c.quantity.value) || 1,
                    unit_price: c.price.value === '' ? null :
                        String(UI.parseMoney(c.price.value))
                };
            });
            return UI.service('sale_order_save', {id: order ? order.id : null,
                party: customer.value(), sale_date: date.value || null,
                shipping_date: desired.value || null,
                reference: po.value || null, description: memo.value || null,
                payment_term: term.value ? parseInt(term.value, 10) : null,
                shipment_address: shipTo.value(), lines: lines}).then(
                function (data) {
                    UI.toast('Order ' + (data.number || data.id) + ' saved',
                        'ok');
                    show(data);
                }, failed);
        }

        function workflow(button) {
            if (!order) {
                UI.showError('Save the order first.');
                return;
            }
            var steps = button === 'confirm' && order.state === 'draft' ?
                ['quote', 'confirm'] : [button];
            var run = steps.reduce(function (promise, step) {
                return promise.then(function () {
                    return Rpc.model('sale.sale', step, [[order.id]]);
                });
            }, Promise.resolve());
            run.then(function () {
                UI.toast('Order ' + (order.number || order.id) + ': ' +
                    button, 'ok');
                load(order.id);
            }, UI.showError);
        }

        if (openId) {
            load(openId);
        } else {
            newGrid([]);
            renderLinks();
        }
    };

    /* ---- Shipping --------------------------------------------------------- */

    var SHIP_STEPS = {
        waiting: [['assign_try', 'Assign Stock']],
        assigned: [['pick', 'Pick'], ['pack', 'Pack'], ['done', 'Ship']],
        picked: [['pack', 'Pack'], ['done', 'Ship']],
        packed: [['done', 'Ship']]
    };

    Screens.shipping = function (main) {
        main = UI.form(main, {title: 'Shipping'}).body;
        var list = el('tbody');
        var detail = el('div.center-detail', el('p.muted',
            'Choose a shipment to ship.'));
        var showDone = el('input', {type: 'checkbox', id: 'ship-done'});
        main.appendChild(el('div.toolbar', showDone, el('label', {for:
            'ship-done'}, ' include shipped (last 30 days)')));
        main.appendChild(el('div.center', el('div.panel.center-list',
            el('div.table-wrap', el('table.data', el('thead', el('tr',
                el('th', 'Shipment'), el('th', 'Customer'), el('th', 'Date'),
                el('th', 'Status'))), list))), detail));
        var active = null;

        function load() {
            var states = ['waiting', 'assigned', 'picked', 'packed'];
            var domain = showDone.checked ? ['OR', ['state', 'in', states],
                [['state', '=', 'done'], ['effective_date', '>=',
                    Rpc.date(UI.addDays(UI.today(), -30))]]] :
                [['state', 'in', states]];
            Rpc.searchRead('stock.shipment.out', domain, ['number',
                'customer', 'customer.rec_name', 'planned_date', 'state',
                'reference'], {order: [['planned_date', 'ASC']], limit: 300})
                .then(function (rows) {
                    UI.clear(list);
                    rows.forEach(function (row) {
                        list.appendChild(el('tr' + (row.id === active ?
                            '.active' : ''), {onclick: function () {
                                active = row.id;
                                show(row.id);
                                load();
                            }}, el('td', row.number || String(row.id)),
                            el('td', (row['customer.'] || {}).rec_name),
                            el('td', UI.date(row.planned_date)),
                            el('td', el('span.badge.open', row.state))));
                    });
                    if (!rows.length) {
                        list.appendChild(el('tr', el('td', {colspan: 4},
                            'Nothing to ship.')));
                    }
                }, UI.showError);
        }

        function show(id) {
            Rpc.model('stock.shipment.out', 'read', [[id], ['number',
                'state', 'customer.rec_name', 'delivery_address.rec_name',
                'planned_date', 'reference', 'outgoing_moves',
                'inventory_moves']]).then(function (rows) {
                    var s = rows[0];
                    UI.clear(detail);
                    detail.appendChild(el('h2', {style: {marginTop: 0}},
                        'Shipment ' + (s.number || s.id), ' ',
                        el('span.badge.open', s.state)));
                    detail.appendChild(el('p', (s['customer.'] || {})
                        .rec_name || '', el('br'), (s['delivery_address.'] ||
                        {}).rec_name || ''));
                    var buttons = el('div.toolbar');
                    (SHIP_STEPS[s.state] || []).forEach(function (step) {
                        buttons.appendChild(el('button' + (step[0] === 'done'
                            ? '.primary' : ''), {type: 'button', onclick:
                            function () {
                                Rpc.model('stock.shipment.out', step[0],
                                    [[id]]).then(function () {
                                        UI.toast('Shipment ' + (s.number ||
                                            id) + ': ' + step[1], 'ok');
                                        show(id);
                                        load();
                                    }, UI.showError);
                            }}, step[1]));
                    });
                    [['stock.shipment.out.picking_list', 'Picking List'],
                        ['stock.shipment.out.delivery_note', 'Packing List']]
                        .forEach(function (r) {
                            buttons.appendChild(el('button', {type: 'button',
                                onclick: function () {
                                    Rpc.report(r[0], [id]).then(function (x) {
                                        UI.openReport(x, r[1]);
                                    }, UI.showError);
                                }}, r[1]));
                        });
                    detail.appendChild(buttons);
                    var moves = (s.outgoing_moves || []).concat(
                        s.inventory_moves || []);
                    Rpc.model('stock.move', 'read', [moves, ['product.rec_name',
                        'quantity', 'unit.rec_name', 'from_location.rec_name',
                        'to_location.rec_name', 'state']]).then(function (ms) {
                        var body = el('tbody');
                        ms.forEach(function (m) {
                            body.appendChild(el('tr',
                                el('td', (m['product.'] || {}).rec_name),
                                el('td.num', String(m.quantity) + ' ' +
                                    ((m['unit.'] || {}).rec_name || '')),
                                el('td', (m['from_location.'] || {})
                                    .rec_name),
                                el('td', (m['to_location.'] || {}).rec_name),
                                el('td', m.state)));
                        });
                        detail.appendChild(el('div.table-wrap',
                            el('table.data', el('thead', el('tr',
                                el('th', 'Part'), el('th.num', 'Qty'),
                                el('th', 'From'), el('th', 'To'),
                                el('th', 'Status'))), body)));
                    }, UI.showError);
                }, UI.showError);
        }
        showDone.addEventListener('change', load);
        load();
    };

    /* ---- Invoicing ---------------------------------------------------------- */

    Screens.invoicing = function (main) {
        main = UI.form(main, {title: 'Invoicing', extra: [
            {label: 'Post Selected', onclick: function () {
                postSelected();
            }}]}).body;
        var body = el('tbody');
        var rows = [];
        main.appendChild(el('p.muted', 'The invoices of shipped orders ' +
            'wait here as drafts: check them, then post and print.'));
        main.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', ''), el('th', 'Customer'), el('th', 'Date'),
                el('th', 'Reference'), el('th', 'Origin'),
                el('th.num', 'Total'), el('th', ''))), body)));

        function load() {
            Rpc.searchRead('account.invoice', [['type', '=', 'out'],
                ['state', '=', 'draft']], ['party.rec_name', 'invoice_date',
                'reference', 'origins', 'total_amount'], {order: [['id',
                'ASC']], limit: 300}).then(function (result) {
                    rows = result;
                    UI.clear(body);
                    rows.forEach(function (row) {
                        row.box = el('input', {type: 'checkbox',
                            'aria-label': 'Post'});
                        body.appendChild(el('tr', el('td', row.box),
                            el('td', (row['party.'] || {}).rec_name),
                            el('td', UI.date(row.invoice_date)),
                            el('td', row.reference || ''),
                            el('td', row.origins || ''),
                            el('td.num', UI.money(row.total_amount)),
                            el('td', el('button', {type: 'button', onclick:
                                function () {
                                    UI.openRecord('account.invoice', row.id,
                                        'Draft invoice');
                                }}, 'Open'))));
                    });
                    if (!rows.length) {
                        body.appendChild(el('tr', el('td', {colspan: 7},
                            'No invoice waiting.')));
                    }
                }, UI.showError);
        }

        function postSelected() {
            var ids = rows.filter(function (r) {
                return r.box.checked;
            }).map(function (r) {
                return r.id;
            });
            if (!ids.length) {
                UI.showError('Tick the invoices to post.');
                return;
            }
            Rpc.model('account.invoice', 'post', [ids]).then(function () {
                UI.toast(ids.length + ' invoice(s) posted', 'ok');
                Rpc.report('account.invoice', ids).then(function (r) {
                    UI.openReport(r, 'Invoices');
                }, function () {});
                load();
            }, UI.showError);
        }
        load();
    };
}(window));
