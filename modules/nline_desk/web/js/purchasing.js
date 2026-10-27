/* N-Line screens: Jobshop purchasing (UI upgrade phase 4): Purchase Order
 * (lines linked to the work orders they supply), Receiving and returns,
 * Bills from receipts (QuickBooks Enter Bills Against Inventory) */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    /* ---- Purchase Order ------------------------------------------------- */

    Screens.purchaseOrder = function (main, params) {
        var order = null;
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var form = UI.form(main, {title: 'Purchase Order', kind: 'vendor',
            find: {model: 'purchase.purchase', title: 'Find purchase orders',
                order: [['purchase_date', 'DESC'], ['id', 'DESC']],
                columns: [{field: 'number', label: 'PO'},
                    {field: 'purchase_date', label: 'Date'},
                    {field: 'rec_name', label: 'Supplier'},
                    {field: 'total_amount', label: 'Total', money: true},
                    {field: 'state', label: 'Status'}]},
            extra: [
                {label: 'Quote', onclick: function () {
                    workflow(['quote']);
                }},
                {label: 'Release', onclick: function () {
                    workflow(order && order.state === 'draft' ?
                        ['quote', 'confirm'] : ['confirm']);
                }},
                {label: 'Print', onclick: function () {
                    if (order) {
                        Rpc.report('purchase.purchase', [order.id]).then(
                            function (r) {
                                UI.openReport(r, 'Purchase Order');
                            }, UI.showError);
                    }
                }},
                {label: 'Receive', onclick: function () {
                    UI.openScreen('receiving');
                }}],
            onSave: function () {
                return save();
            },
            onClear: function () {
                global.location.hash = '#/purchase-orders/new?' + Date.now();
            }});
        main = form.body;
        var number = el('strong', 'New PO');
        var status = el('span.badge.open', 'draft');
        var supplier = UI.picker('party.party', {placeholder: 'Supplier',
            label: 'Supplier', fields: ['supplier_payment_term'],
            onselect: function (record) {
                form.showParty(record.id);
                if (record.supplier_payment_term) {
                    term.value = record.supplier_payment_term;
                }
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Order date'});
        var ref = el('input', {type: 'text', 'aria-label':
            'Supplier reference'});
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
                el('div', el('label.field', 'PO ID'), number, ' ', status),
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Supplier'), supplier.node),
                el('div', el('label.field', 'Order date'), date),
                el('div', el('label.field', 'Supplier reference'), ref),
                el('div', el('label.field', 'Terms'), term)),
            el('h2', 'Lines'), linesPanel,
            el('div.grid-form', {style: {marginTop: '12px'}},
                el('div', {style: {gridColumn: 'span 2'}},
                    el('label.field', 'Memo'), memo), el('div'),
                el('div', el('label.field', 'Total'), total)),
            el('h2', 'Receipts and work orders of the lines'), links));

        function newGrid(lines) {
            grid = UI.grid({total: 'amount', required: 'part',
                onchange: function (sum) {
                    total.textContent = UI.money(sum, true);
                }, columns: [
                    {key: 'part', label: 'Part / Service', width: '26%',
                        kind: 'picker', picker: {model: 'product.product',
                            domain: [['purchasable', '=', true]],
                            placeholder: 'Part'}},
                    {key: 'description', label: 'Description'},
                    {key: 'quantity', label: 'Qty', width: '9%',
                        kind: 'number', default: '1'},
                    {key: 'price', label: 'Unit Cost', width: '13%',
                        kind: 'money'},
                    {key: 'amount', label: 'Amount', width: '13%',
                        kind: 'computed', compute: function (v) {
                            return Math.round((v.quantity || 0) *
                                (v.price || 0) * 100) / 100;
                        }}
                ]});
            (lines || []).forEach(function (line, index) {
                var controls = index ? grid.addRow().controls :
                    grid.controls()[0];
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
                    el('th.num', 'Unit Cost'), el('th.num', 'Amount'))),
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
                    }}, 'WO ' + l.number + ' ' + l.operation));
                    cell.appendChild(el('span', ' '));
                });
                body.appendChild(el('tr', el('td', line.product ?
                    line.product.rec_name : ''),
                    el('td.num', String(line.quantity)),
                    el('td.num', String(line.received)), cell));
            });
            links.appendChild(el('div.table-wrap', el('table.data',
                el('thead', el('tr', el('th', 'Part'), el('th.num',
                    'Ordered'), el('th.num', 'Received'),
                    el('th', 'For work orders'))), body)));
        }

        function show(data) {
            order = data;
            number.textContent = data.number || ('#' + data.id);
            status.textContent = data.state;
            supplier.set(data.party.id, data.party.rec_name);
            form.showParty(data.party.id);
            date.value = data.purchase_date || '';
            ref.value = data.reference;
            memo.value = data.description;
            term.value = data.payment_term || '';
            total.textContent = UI.money(data.total_amount, true);
            if (data.state === 'draft') {
                newGrid(data.lines);
            } else {
                readOnlyLines(data.lines);
            }
            renderLinks();
            UI.setTitle('PO ' + (data.number || data.id));
        }

        function load(id) {
            return Rpc.desk('purchase_order_get', [id]).then(show,
                UI.showError);
        }

        function save() {
            if (order && order.state !== 'draft') {
                UI.showError('Only a draft purchase order can change here.');
                return;
            }
            if (!supplier.value()) {
                UI.showError('Choose the supplier.');
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
            return UI.service('purchase_order_save', {id: order ? order.id :
                null, party: supplier.value(), purchase_date: date.value ||
                null, reference: ref.value || null, description:
                memo.value || null, payment_term: term.value ?
                parseInt(term.value, 10) : null, lines: lines}).then(
                function (data) {
                    UI.toast('PO ' + (data.number || data.id) + ' saved',
                        'ok');
                    show(data);
                }, failed);
        }

        function workflow(steps) {
            if (!order) {
                UI.showError('Save the purchase order first.');
                return;
            }
            steps.reduce(function (promise, step) {
                return promise.then(function () {
                    return Rpc.model('purchase.purchase', step, [[order.id]]);
                });
            }, Promise.resolve()).then(function () {
                UI.toast('PO ' + (order.number || order.id) + ' updated',
                    'ok');
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

    /* ---- Receiving ------------------------------------------------------- */

    Screens.receiving = function (main) {
        main = UI.form(main, {title: 'Receiving'}).body;
        var supplier = UI.picker('party.party', {placeholder:
            'All suppliers', label: 'Supplier', onselect: function () {
                load();
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Received date'});
        var ref = el('input', {type: 'text', 'aria-label':
            'Packing slip'});
        var mode = el('select', {'aria-label': 'Show'},
            el('option', {value: 'receive'}, 'Unreceived lines'),
            el('option', {value: 'return'}, 'Received lines (return)'));
        var body = el('tbody');
        var head = el('thead');
        var rows = [];
        var action = el('button.primary', {type: 'button', onclick: run},
            'Receive');
        main.appendChild(el('div.panel', el('div.grid-form',
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Supplier'), supplier.node),
            el('div', el('label.field', 'Show'), mode),
            el('div', el('label.field', 'Date'), date),
            el('div', el('label.field', 'Packing slip / RMA'), ref))));
        main.appendChild(el('div.table-wrap', el('table.data', head, body)));
        main.appendChild(el('div.toolbar', el('button', {type: 'button',
            onclick: function () {
                rows.forEach(function (r) {
                    r.qty.value = String(r.data.quantity);
                });
            }}, 'Fill all quantities'), el('span.spacer'), action));

        function load() {
            var returns = mode.value === 'return';
            action.textContent = returns ? 'Return to supplier' : 'Receive';
            UI.clear(head).appendChild(el('tr', el('th', 'PO'),
                el('th', 'Supplier'), el('th', 'Part'),
                el('th', returns ? 'Received' : 'Due'),
                el('th.num', returns ? 'Received qty' : 'Open qty'),
                el('th.num', returns ? 'Return qty' : 'Receive qty')));
            Rpc.desk(returns ? 'received_items' : 'open_receipts',
                [supplier.value()]).then(function (data) {
                    UI.clear(body);
                    rows = data.map(function (d) {
                        var qty = el('input.money', {type: 'text',
                            'aria-label': 'Quantity'});
                        body.appendChild(el('tr', el('td', d.number),
                            el('td', d.supplier_name), el('td', d.product),
                            el('td', UI.date(returns ? d.date :
                                d.planned_date)),
                            el('td.num', d.quantity + ' ' + d.unit),
                            el('td', {style: {width: '120px'}}, qty)));
                        return {data: d, qty: qty};
                    });
                    if (!rows.length) {
                        body.appendChild(el('tr', el('td', {colspan: 6},
                            returns ? 'Nothing received lately.' :
                                'Nothing to receive.')));
                    }
                }, UI.showError);
        }

        function run() {
            var lines = rows.filter(function (r) {
                return parseFloat(r.qty.value) > 0;
            }).map(function (r) {
                return {move: r.data.move, quantity:
                    parseFloat(r.qty.value)};
            });
            if (!lines.length) {
                UI.showError('Enter the quantity of at least one line.');
                return;
            }
            var returns = mode.value === 'return';
            UI.service(returns ? 'return_items' : 'receive_items', {
                date: date.value, reference: ref.value || null,
                lines: lines}).then(function (result) {
                    UI.toast((returns ? 'Return ' : 'Receiver ') +
                        (result.number || result.id) + ' done', 'ok');
                    if (!returns) {
                        Rpc.report('stock.shipment.in.restocking_list',
                            [result.id]).then(function (r) {
                                UI.openReport(r, 'Receiver');
                            }, function () {});
                    }
                    load();
                }, failed);
        }
        mode.addEventListener('change', load);
        load();
    };

    /* ---- Bills from receipts ------------------------------------------------ */

    Screens.billReceipts = function (main) {
        main = UI.form(main, {title: 'Enter Bills Against Inventory'}).body;
        var body = el('tbody');
        main.appendChild(el('p.muted', 'The bills of received purchase ' +
            'orders wait here as drafts: enter the vendor\'s bill number ' +
            'and date, then post.'));
        main.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', 'Vendor'), el('th', 'Origin'),
                el('th', 'Bill date'), el('th', 'Bill No.'),
                el('th.num', 'Total'), el('th', ''))), body)));

        function load() {
            Rpc.searchRead('account.invoice', [['type', '=', 'in'],
                ['state', '=', 'draft']], ['party.rec_name', 'origins',
                'reference', 'invoice_date', 'total_amount'], {order:
                [['id', 'ASC']], limit: 300}).then(function (rows) {
                    UI.clear(body);
                    rows.forEach(function (row) {
                        var date = el('input', {type: 'date', value:
                            row.invoice_date || UI.today(), 'aria-label':
                            'Bill date'});
                        var ref = el('input', {type: 'text', value:
                            row.reference || '', 'aria-label': 'Bill No.'});
                        body.appendChild(el('tr',
                            el('td', (row['party.'] || {}).rec_name),
                            el('td', row.origins || ''), el('td', date),
                            el('td', ref),
                            el('td.num', UI.money(row.total_amount)),
                            el('td', el('button', {type: 'button', onclick:
                                function () {
                                    UI.openRecord('account.invoice', row.id,
                                        'Draft bill');
                                }}, 'Open'), ' ', el('button.primary', {
                                    type: 'button', onclick: function () {
                                        post(row, date.value, ref.value);
                                    }}, 'Post'))));
                    });
                    if (!rows.length) {
                        body.appendChild(el('tr', el('td', {colspan: 6},
                            'No bill waiting.')));
                    }
                }, UI.showError);
        }

        function post(row, date, ref) {
            Rpc.model('account.invoice', 'write', [[row.id], {
                invoice_date: Rpc.date(date), reference: ref || null}])
                .then(function () {
                    return Rpc.model('account.invoice', 'post', [[row.id]]);
                }).then(function () {
                    UI.toast('Bill posted', 'ok');
                    load();
                }, UI.showError);
        }
        load();
    };
}(window));
