/* N-Line screens: Jobshop planning and estimating (UI upgrade phase 6):
 * Material Planning, Scheduling (Gantt chart) and Quotes (cost from the
 * part or its engineering master, markup, converted to an order) */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function n(v) {
        return el('td.num', v === null || v === undefined ? '' :
            String(Math.round(v * 100) / 100));
    }

    function wrap(heads, rows, empty) {
        var body = el('tbody');
        rows.forEach(function (r) {
            body.appendChild(r);
        });
        if (!rows.length) {
            body.appendChild(el('tr', el('td', {colspan: heads.length},
                empty)));
        }
        return el('div.table-wrap', el('table.data', el('thead', el('tr',
            heads.map(function (h) {
                return el('th' + (/^#/.test(h) ? '.num' : ''),
                    h.replace(/^#/, ''));
            }))), body));
    }

    /* ---- Material Planning ------------------------------------------------ */

    Screens.materialPlanning = function (main) {
        main = UI.form(main, {title: 'Material Planning', extra: [
            {label: 'Refresh', onclick: function () {
                load();
            }}]}).body;
        var tabBar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        var titles = ['Open Sales Orders', 'Work Order Materials',
            'Stocked Parts'];
        var paneList = titles.map(function (title, index) {
            tabBar.appendChild(el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(index);
                }}, title));
            var pane = el('div.tab-pane.panel', {role: 'tabpanel'});
            panes.appendChild(pane);
            return pane;
        });
        main.appendChild(tabBar);
        main.appendChild(panes);

        function show(index) {
            Array.prototype.forEach.call(tabBar.children, function (b, i) {
                b.classList.toggle('active', i === index);
            });
            paneList.forEach(function (p, i) {
                p.hidden = i !== index;
            });
        }

        function makeWO(product, quantity, date) {
            UI.service('plan_work_order', {product: product, quantity:
                quantity, date: date || null}).then(function (r) {
                    UI.toast('Work order ' + r.number + ' created', 'ok');
                    UI.openScreen('work-orders/' + r.id, 'WO ' + r.number);
                    load();
                }, failed);
        }

        function buy(product, quantity) {
            UI.service('plan_purchase', {product: product, quantity:
                quantity}).then(function (r) {
                    if (r.purchase) {
                        UI.toast('Added to purchase order ' + (r.number ||
                            r.purchase), 'ok');
                        UI.openScreen('purchase-orders/' + r.purchase,
                            'PO ' + (r.number || r.purchase));
                    } else {
                        UI.toast('No supplier: purchase request created',
                            'ok');
                    }
                    load();
                }, failed);
        }

        function load() {
            Rpc.desk('planning', []).then(function (data) {
                UI.clear(paneList[0]).appendChild(wrap(['Order', 'Customer',
                    'Part', '#Qty', 'Ship date', '#On hand', '#Forecast',
                    ''], data.sales.map(function (s) {
                        return el('tr', el('td', s.number), el('td', s.party),
                            el('td', s.product_name), n(s.quantity),
                            el('td', UI.date(s.date)), n(s.on_hand),
                            n(s.forecast), el('td', el('button', {type:
                                'button', onclick: function () {
                                    UI.service('sale_line_work_order',
                                        s.line).then(function (r) {
                                            UI.toast('Work order ' + r.number +
                                                ' created', 'ok');
                                            load();
                                        }, failed);
                                }}, 'Create WO')));
                    }), 'Every open order line has its work order.'));
                UI.clear(paneList[1]).appendChild(wrap(['Part', '#Required',
                    '#On hand', '#On order', '#Short', 'Need date',
                    'For work orders', ''], data.materials.map(function (m) {
                        var actions = el('td');
                        if (m.short > 0 && m.purchasable) {
                            actions.appendChild(el('button', {type: 'button',
                                onclick: function () {
                                    buy(m.product, m.short);
                                }}, 'Purchase'));
                        }
                        if (m.short > 0 && m.producible) {
                            actions.appendChild(el('button', {type: 'button',
                                onclick: function () {
                                    makeWO(m.product, m.short, m.date);
                                }}, 'Create WO'));
                        }
                        return el('tr' + (m.short > 0 ? '.short' : ''),
                            el('td', m.product_name + ' (' + m.unit + ')'),
                            n(m.required), n(m.on_hand), n(m.on_order),
                            n(m.short), el('td', UI.date(m.date)),
                            el('td', m.orders), actions);
                    }), 'No open work order needs material.'));
                UI.clear(paneList[2]).appendChild(wrap(['Part', 'Supply',
                    '#Minimum', '#Target', '#On hand', '#Forecast', '#Short',
                    ''], data.stocked.map(function (s) {
                        return el('tr' + (s.short > 0 ? '.short' : ''),
                            el('td', s.product_name), el('td', s.type),
                            n(s.min), n(s.target), n(s.on_hand),
                            n(s.forecast), n(s.short), el('td', s.short > 0 ?
                                el('button', {type: 'button', onclick:
                                    function () {
                                        if (s.type === 'production') {
                                            makeWO(s.product, s.short);
                                        } else {
                                            buy(s.product, s.short);
                                        }
                                    }}, s.type === 'production' ?
                                    'Create WO' : 'Purchase') : null));
                    }), 'No order point (Inventory > Order Points).'));
            }, UI.showError);
        }
        show(0);
        load();
    };

    /* ---- Scheduling (Gantt) ---------------------------------------------- */

    var DAY = 24 * 3600 * 1000;

    function day(iso) {
        return new Date(String(iso).slice(0, 10) + 'T12:00:00').getTime();
    }

    function isoDay(time) {
        var d = new Date(time);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,
            '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    Screens.scheduling = function (main) {
        main = UI.form(main, {title: 'Scheduling'}).body;
        var horizon = el('select', {'aria-label': 'Load horizon'},
            [30, 60, 90, 180].map(function (d) {
                return el('option', {value: d, selected: d === 60 || null},
                    d + ' days');
            }));
        var chart = el('div.gantt');
        main.appendChild(el('div.toolbar', el('label.field', 'Horizon'),
            horizon, el('span.spacer'), el('span.muted',
                'Drag a bar to move the work order; double-click to open ' +
                'it. Red: past its want date.')));
        main.appendChild(chart);
        horizon.addEventListener('change', load);

        function load() {
            var from = UI.addDays(UI.today(), -7);
            var to = UI.addDays(UI.today(), parseInt(horizon.value, 10));
            Rpc.desk('schedule', [from, to]).then(function (data) {
                render(data, day(from), day(to));
            }, UI.showError);
        }

        function render(data, start, end) {
            UI.clear(chart);
            var days = Math.round((end - start) / DAY) + 1;
            var scale = el('div.gantt-scale');
            for (var i = 0; i < days; i++) {
                var d = new Date(start + i * DAY);
                scale.appendChild(el('div.gantt-day' + (d.getDay() === 0 ||
                    d.getDay() === 6 ? '.weekend' : '') + (isoDay(start +
                    i * DAY) === UI.today() ? '.today' : ''), {title:
                    UI.date(isoDay(start + i * DAY))}, d.getDate() === 1 ||
                    i === 0 ? (d.getMonth() + 1) + '/' + d.getDate() :
                    String(d.getDate())));
            }
            chart.style.setProperty('--days', days);
            chart.appendChild(el('div.gantt-row.gantt-head',
                el('div.gantt-label', 'Work order'), scale));
            data.rows.forEach(function (row) {
                var s = Math.max(day(row.start), start);
                var e = Math.min(day(row.end), end);
                var bar = el('div.gantt-bar.' + row.state + (row.late ?
                    '.late' : ''), {
                    title: row.number + ' ' + row.product + ' x' +
                        row.quantity + ' (' + row.state + ')' +
                        (row.resources.length ? ' - ' +
                            row.resources.join(', ') : ''),
                    style: {
                        left: ((s - start) / DAY / days * 100) + '%',
                        width: (Math.max(1, (e - s) / DAY + 1) / days * 100) +
                            '%'
                    },
                    ondblclick: function () {
                        UI.openScreen('work-orders/' + row.id, 'WO ' +
                            row.number);
                    }
                }, row.number);
                drag(bar, row, days);
                chart.appendChild(el('div.gantt-row', el('div.gantt-label',
                    el('strong', row.number), ' ', row.product),
                    el('div.gantt-track', bar)));
            });
            if (!data.rows.length) {
                chart.appendChild(el('p.muted', 'No open work order in ' +
                    'the horizon.'));
            }
        }

        function drag(bar, row, days) {
            bar.addEventListener('mousedown', function (event) {
                var track = bar.parentNode.getBoundingClientRect();
                var x0 = event.clientX;
                var moved = 0;
                event.preventDefault();

                function move(e) {
                    moved = Math.round((e.clientX - x0) / track.width * days);
                    bar.style.transform = 'translateX(' + (moved *
                        track.width / days) + 'px)';
                }

                function up() {
                    global.removeEventListener('mousemove', move);
                    global.removeEventListener('mouseup', up);
                    if (!moved) {
                        bar.style.transform = '';
                        return;
                    }
                    Rpc.desk('reschedule', [{production: row.id,
                        start: isoDay(day(row.start) + moved * DAY),
                        end: isoDay(day(row.end) + moved * DAY)}]).then(
                        function () {
                            UI.toast(row.number + ' moved ' + moved +
                                ' day(s)', 'ok');
                            load();
                        }, function (error) {
                            bar.style.transform = '';
                            UI.showError(error);
                        });
                }
                global.addEventListener('mousemove', move);
                global.addEventListener('mouseup', up);
            });
        }
        load();
    };

    /* ---- Quotes --------------------------------------------------------- */

    Screens.quotes = function (main) {
        var order = null;
        var form = UI.form(main, {title: 'Quotes', kind: 'customer',
            find: {model: 'sale.sale', title: 'Find quotes',
                domain: [['state', 'in', ['draft', 'quotation']]],
                order: [['sale_date', 'DESC'], ['id', 'DESC']],
                columns: [{field: 'number', label: 'Quote'},
                    {field: 'sale_date', label: 'Date'},
                    {field: 'rec_name', label: 'Customer'},
                    {field: 'total_amount', label: 'Total', money: true},
                    {field: 'state', label: 'Status'}]},
            extra: [
                {label: 'Print Quote', onclick: function () {
                    if (order) {
                        Rpc.report('sale.sale', [order.id]).then(function (r) {
                            UI.openReport(r, 'Quote');
                        }, UI.showError);
                    }
                }},
                {label: 'Create Sales Order', onclick: function () {
                    convert();
                }}],
            onSave: function () {
                return save();
            },
            onClear: function () {
                global.location.hash = '#/quotes?' + Date.now();
            }});
        main = form.body;
        var number = el('strong', 'New quote');
        var customer = UI.picker('party.party', {placeholder: 'Customer',
            label: 'Customer', onselect: function (record) {
                form.showParty(record.id);
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Quote date'});
        var ref = el('input', {type: 'text', 'aria-label':
            'Customer RFQ'});
        var markup = el('input.money', {type: 'text', value: '35',
            'aria-label': 'Markup %'});
        var basis = el('select', {'aria-label': 'Cost from'},
            el('option', {value: 'master'}, 'Engineering master'),
            el('option', {value: 'part'}, 'Part cost'));
        var total = el('div.big-total', '$0.00');
        var grid = UI.grid({total: 'amount', required: 'part',
            onchange: function (sum) {
                total.textContent = UI.money(sum, true);
            }, columns: [
                {key: 'part', label: 'Part', width: '28%', kind: 'picker',
                    picker: {model: 'product.product', domain: [['salable',
                        '=', true]], placeholder: 'Part',
                        onselect: function (record, controls) {
                            cost(record.id, controls);
                        }}},
                {key: 'quantity', label: 'Qty', width: '8%', kind: 'number',
                    default: '1'},
                {key: 'cost', label: 'Unit Cost', width: '13%',
                    kind: 'money'},
                {key: 'price', label: 'Unit Price', width: '13%',
                    kind: 'money'},
                {key: 'amount', label: 'Amount', width: '13%',
                    kind: 'computed', compute: function (v) {
                        return Math.round((v.quantity || 0) * (v.price || 0) *
                            100) / 100;
                    }}
            ]});

        function cost(product, controls) {
            Rpc.desk('quote_cost', [product, 1, basis.value]).then(
                function (c) {
                    controls.cost.value = UI.money(c.unit_cost);
                    controls.price.value = UI.money(Math.round(c.unit_cost *
                        (1 + UI.parseMoney(markup.value) / 100) * 100) / 100);
                    grid.update();
                }, UI.showError);
        }

        main.appendChild(el('div.panel', el('div.grid-form',
                el('div', el('label.field', 'Quote ID'), number),
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Customer'), customer.node),
                el('div', el('label.field', 'Quote date'), date),
                el('div', el('label.field', 'Customer RFQ'), ref),
                el('div', el('label.field', 'Cost from'), basis),
                el('div', el('label.field', 'Markup %'), markup)),
            el('h2', 'Lines'), grid.node,
            el('div.toolbar', el('button', {type: 'button', onclick:
                function () {
                    grid.controls().forEach(function (c) {
                        if (c.part.value()) {
                            cost(c.part.value(), c);
                        }
                    });
                }}, 'Recalculate prices'), el('span.spacer'),
                el('label.field', 'Total'), total)));

        function save() {
            if (!customer.value()) {
                UI.showError('Choose the customer.');
                return;
            }
            var lines = grid.controls().filter(function (c) {
                return c.part.value();
            }).map(function (c) {
                return {id: c.part.lineId || null, product: c.part.value(),
                    quantity: UI.parseMoney(c.quantity.value) || 1,
                    unit_price: String(UI.parseMoney(c.price.value))};
            });
            if (order && ['draft', 'quotation'].indexOf(order.state) < 0) {
                UI.showError('This quote is an order now: change it in ' +
                    'Customer Order Entry.');
                return;
            }
            /* A quote sent is back to draft to change it */
            var reopen = order && order.state === 'quotation' ?
                Rpc.model('sale.sale', 'draft', [[order.id]]) :
                Promise.resolve();
            return reopen.then(function () {
                return UI.service('sale_order_save', {id: order ? order.id :
                    null,
                party: customer.value(), sale_date: date.value || null,
                    reference: ref.value || null, lines: lines});
            }).then(function (data) {
                    order = data;
                    number.textContent = data.number || ('#' + data.id);
                    data.lines.forEach(function (line, i) {
                        var c = grid.controls()[i];
                        if (c) {
                            c.part.lineId = line.id;
                        }
                    });
                    return Rpc.model('sale.sale', 'quote', [[data.id]]);
                }).then(function () {
                    if (order) {
                        order.state = 'quotation';
                        UI.toast('Quote ' + (order.number || order.id) +
                            ' saved', 'ok');
                    }
                }, failed);
        }

        function convert() {
            if (!order) {
                UI.showError('Save the quote first.');
                return;
            }
            Rpc.model('sale.sale', 'confirm', [[order.id]]).then(function () {
                UI.toast('Sales order created from the quote', 'ok');
                UI.openScreen('orders/' + order.id, 'Order ' +
                    (order.number || order.id));
            }, UI.showError);
        }
    };
}(window));
