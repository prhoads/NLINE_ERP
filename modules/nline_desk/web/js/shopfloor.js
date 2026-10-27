/* N-Line screens: Jobshop shop floor (UI upgrade phase 5): the Work Order
 * window (operations and labor, materials, outputs, Show Costs, the card
 * diagram), Labor Entry, Material Issues, Work Order Receipts, the
 * Engineering Master with its cost rollup, Shop Resources and Employees */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function table(heads, rows, empty) {
        var body = el('tbody');
        rows.forEach(function (row) {
            body.appendChild(row);
        });
        if (!rows.length) {
            body.appendChild(el('tr', el('td', {colspan: heads.length},
                empty || 'None.')));
        }
        return el('div.table-wrap', el('table.data', el('thead', el('tr',
            heads.map(function (h) {
                return el('th' + (/^#/.test(h) ? '.num' : ''),
                    h.replace(/^#/, ''));
            }))), body));
    }

    function num(v) {
        return el('td.num', v === null || v === undefined ? '' : String(v));
    }

    function money(v) {
        return el('td.num', v === null || v === undefined ? '' :
            UI.money(v));
    }

    /* ---- Work Order window ------------------------------------------------ */

    function infoTab(render) {
        return function (pane, record) {
            Rpc.desk('work_order_info', [record.id]).then(function (info) {
                render(pane, info);
            }, UI.showError);
        };
    }

    function workflow(button, label) {
        return {label: label, onclick: function (record, load) {
            if (!record) {
                UI.showError('Choose or save a work order first.');
                return;
            }
            Rpc.model('production', button, [[record.id]]).then(function () {
                UI.toast('Work order ' + (record.number || record.id) +
                    ': ' + label, 'ok');
                load(record.id);
            }, UI.showError);
        }};
    }

    Screens.workOrderWindow = function (main, params) {
        UI.master(main, {
            title: 'Work Order',
            model: 'production',
            label: 'Work Order ID',
            order: [['id', 'DESC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            extra: [
                workflow('wait', 'Release'),
                workflow('assign_try', 'Assign Stock'),
                workflow('run', 'Start'),
                {label: 'Receive', onclick: function (record, load) {
                    if (record) {
                        UI.service('work_order_receive', {production: record.id}).then(
                            function (r) {
                                UI.toast('Work order ' + r.state, 'ok');
                                load(record.id);
                            }, failed);
                    }
                }},
                {label: 'Details', onclick: function (record) {
                    if (record) {
                        UI.openScreen('workorders/' + record.id);
                    }
                }},
                {label: 'Traveler', onclick: function (record) {
                    if (record) {
                        Rpc.report('production.traveler', [record.id]).then(
                            function (r) {
                                UI.openReport(r, 'Traveler');
                            }, UI.showError);
                    }
                }}],
            afterSave: function (id) {
                return Rpc.desk('work_order_explode', [id]);
            },
            onload: function (record) {
                UI.setTitle('WO ' + (record.number || record.id));
            },
            tabs: [
                {title: 'Header', fields: [
                    {name: 'number', label: 'Number', type: 'char',
                        readonly: true},
                    {name: 'state', label: 'Status', type: 'char',
                        readonly: true},
                    {name: 'product', label: 'Part', type: 'many2one',
                        model: 'product.product', domain: [['producible',
                            '=', true]], span: 2},
                    {name: 'bom', label: 'Engineering master',
                        type: 'many2one', model: 'production.bom', span: 2},
                    {name: 'quantity', label: 'Quantity', type: 'float'},
                    {name: 'unit', label: 'Unit', type: 'many2one',
                        model: 'product.uom'},
                    {name: 'warehouse', label: 'Warehouse', type: 'many2one',
                        model: 'stock.location', domain: [['type', '=',
                            'warehouse']]},
                    {name: 'location', label: 'Production location',
                        type: 'many2one', model: 'stock.location',
                        domain: [['type', '=', 'production']]},
                    {name: 'planned_start_date', label: 'Start date',
                        type: 'date'},
                    {name: 'planned_date', label: 'Want date', type: 'date'}
                ]},
                {title: 'Operations', render: infoTab(function (pane, info) {
                    pane.appendChild(table(['Operation', 'Resource',
                        'Status', '#Hours', '#Labor cost', 'Tickets'],
                        info.works.map(function (w) {
                            return el('tr', el('td', w.name),
                                el('td', w.work_center), el('td', w.state),
                                num(w.hours), money(w.cost),
                                el('td', w.cycles.map(function (c) {
                                    return (c.hours === null ? '' : c.hours +
                                        ' h ') + c.state + (c.by ? ' (' +
                                        c.by + ')' : '');
                                }).join(', ')));
                        }), 'No operation: the master has no routing.'));
                    pane.appendChild(el('div.toolbar', el('button', {
                        type: 'button', onclick: function () {
                            UI.openScreen('labor');
                        }}, 'Labor Entry')));
                })},
                {title: 'Materials', render: infoTab(function (pane, info) {
                    pane.appendChild(table(['Part', '#Qty', 'Unit', 'From',
                        'Status', '#Cost'], info.materials.map(function (m) {
                            return el('tr', el('td', m.product),
                                num(m.quantity), el('td', m.unit),
                                el('td', m.from), el('td', m.state),
                                money(m.cost));
                        })));
                    pane.appendChild(el('div.toolbar', el('button', {
                        type: 'button', onclick: function () {
                            UI.openScreen('issues');
                        }}, 'Material Issues')));
                })},
                {title: 'Outputs', render: infoTab(function (pane, info) {
                    pane.appendChild(table(['Part', '#Qty', 'Unit', 'To',
                        'Status'], info.outputs.map(function (m) {
                            return el('tr', el('td', m.product),
                                num(m.quantity), el('td', m.unit),
                                el('td', m.to), el('td', m.state));
                        })));
                })},
                {title: 'Costs', render: infoTab(function (pane, info) {
                    var c = info.costs;
                    pane.appendChild(table(['Cost', '#Estimated',
                        '#Actual'], [
                            el('tr', el('td', 'Material'),
                                money(c.material_estimated),
                                money(c.material_actual)),
                            el('tr', el('td', 'Labor'), el('td'),
                                money(c.labor_actual)),
                            el('tr.total', el('td', 'Total'),
                                money(c.material_estimated),
                                money(c.total_actual))]));
                    if (info.origin) {
                        pane.appendChild(el('p.muted', 'For ' + info.origin));
                    }
                })}
            ],
            browse: [
                {name: 'number', label: 'Work Order'},
                {name: 'product', label: 'Part', type: 'many2one'},
                {name: 'quantity', label: 'Qty', type: 'float'},
                {name: 'planned_date', label: 'Want date', type: 'date'},
                {name: 'state', label: 'Status'}]
        });
    };

    /* A work order chooser of the open work orders */
    function chooser(states, onchange) {
        var select = el('select', {'aria-label': 'Work order'},
            el('option', {value: ''}, 'Choose a work order'));
        Rpc.desk('open_work_orders', [states]).then(function (rows) {
            rows.forEach(function (r) {
                select.appendChild(el('option', {value: r.id}, r.number +
                    ' - ' + r.product + ' (' + r.quantity + ' ' + r.unit +
                    ', ' + r.state + ')'));
            });
        }, UI.showError);
        select.addEventListener('change', function () {
            onchange(select.value ? parseInt(select.value, 10) : null);
        });
        return select;
    }

    /* ---- Labor Entry -------------------------------------------------------- */

    Screens.laborEntry = function (main) {
        main = UI.form(main, {title: 'Labor Entry'}).body;
        var detail = el('div');
        var current = null;
        main.appendChild(el('div.panel', el('label.field', 'Work order'),
            chooser(['waiting', 'assigned', 'running'], function (id) {
                current = id;
                load();
            })));
        main.appendChild(detail);

        function load() {
            UI.clear(detail);
            if (!current) {
                return;
            }
            Rpc.desk('work_order_info', [current]).then(function (info) {
                UI.clear(detail);
                detail.appendChild(table(['Operation', 'Resource', 'Status',
                    '#Hours so far', 'Hours to post', '', 'Tickets'],
                    info.works.map(function (w) {
                        var hours = el('input.money', {type: 'text',
                            'aria-label': 'Hours'});
                        var post = el('button.primary', {type: 'button',
                            onclick: function () {
                                UI.service('labor_entry', {work: w.id,
                                    hours: UI.parseMoney(hours.value)}).then(
                                    function (r) {
                                        UI.toast('Labor ticket: ' + r.hours +
                                            ' h, ' + UI.money(r.cost || 0,
                                                true), 'ok');
                                        load();
                                    }, failed);
                            }}, 'Post');
                        var tickets = el('td');
                        w.cycles.forEach(function (c) {
                            tickets.appendChild(el('span', (c.hours === null ?
                                '' : c.hours + ' h ') + c.state + ' '));
                            if (c.state === 'running' || c.state ===
                                    'draft') {
                                tickets.appendChild(el('button', {type:
                                    'button', onclick: function () {
                                        Rpc.desk('labor_cancel', [c.id]).then(
                                            load, UI.showError);
                                    }}, 'Reverse'));
                            }
                        });
                        return el('tr', el('td', w.name),
                            el('td', w.work_center), el('td', w.state),
                            num(w.hours), el('td', {style: {width:
                                '110px'}}, hours), el('td', post), tickets);
                    }), 'No operation: the master has no routing.'));
            }, UI.showError);
        }
    };

    /* ---- Material Issues ---------------------------------------------------- */

    Screens.materialIssues = function (main) {
        main = UI.form(main, {title: 'Material Issues'}).body;
        var detail = el('div');
        var current = null;
        var rows = [];
        main.appendChild(el('div.panel', el('label.field', 'Work order'),
            chooser(['waiting', 'assigned', 'running'], function (id) {
                current = id;
                load();
            })));
        main.appendChild(detail);

        function load() {
            UI.clear(detail);
            if (!current) {
                return;
            }
            Rpc.desk('work_order_info', [current]).then(function (info) {
                rows = info.materials.filter(function (m) {
                    return m.state !== 'done' && m.state !== 'cancelled';
                }).map(function (m) {
                    return {m: m, qty: el('input.money', {type: 'text',
                        value: String(m.quantity), 'aria-label':
                        'Quantity to issue'})};
                });
                detail.appendChild(table(['Part', '#Required', 'Unit',
                    'From', 'Status', 'Issue qty'], rows.map(function (r) {
                        return el('tr', el('td', r.m.product),
                            num(r.m.quantity), el('td', r.m.unit),
                            el('td', r.m.from), el('td', r.m.state),
                            el('td', {style: {width: '120px'}}, r.qty));
                    }), 'Everything is issued.'));
                detail.appendChild(el('div.toolbar', el('span.spacer'),
                    el('button.primary', {type: 'button', onclick: issue},
                        'Issue')));
            }, UI.showError);
        }

        function issue() {
            var lines = rows.filter(function (r) {
                return parseFloat(r.qty.value) > 0;
            }).map(function (r) {
                return {move: r.m.id, quantity: parseFloat(r.qty.value)};
            });
            UI.service('issue_material', {lines: lines}).then(function (r) {
                UI.toast(r.moves + ' material(s) issued', 'ok');
                load();
            }, failed);
        }
    };

    /* ---- Work Order Receipts ---------------------------------------------- */

    Screens.woReceipts = function (main) {
        main = UI.form(main, {title: 'Work Order Receipts'}).body;
        var body = el('div');
        main.appendChild(el('p.muted', 'Receive the finished parts of a ' +
            'work order to stock: its remaining materials are issued and ' +
            'the work order is closed.'));
        main.appendChild(body);

        function load() {
            Rpc.desk('open_work_orders', [['waiting', 'assigned',
                'running']]).then(function (rows) {
                    UI.clear(body).appendChild(table(['Work order', 'Part',
                        '#Qty', 'Unit', 'Status', ''], rows.map(function (r) {
                            return el('tr', el('td', r.number),
                                el('td', r.product), num(r.quantity),
                                el('td', r.unit), el('td', r.state),
                                el('td', el('button.primary', {type: 'button',
                                    onclick: function () {
                                        UI.service('work_order_receive',
                                            {production: r.id}).then(function (x) {
                                                UI.toast('Work order ' +
                                                    r.number + ' ' + x.state,
                                                    'ok');
                                                load();
                                            }, failed);
                                    }}, 'Receive to stock')));
                        }), 'No open work order.'));
                }, UI.showError);
        }
        load();
    };

    /* ---- Engineering Master ------------------------------------------------- */

    var IO_FIELDS = [
        {name: 'product', label: 'Part', type: 'many2one',
            model: 'product.product'},
        {name: 'quantity', label: 'Qty per', type: 'float'},
        {name: 'unit', label: 'Unit', type: 'many2one',
            model: 'product.uom'}];

    Screens.engineeringMaster = function (main) {
        UI.master(main, {
            title: 'Engineering Master',
            model: 'production.bom',
            label: 'Master ID',
            order: [['name', 'ASC']],
            tabs: [
                {title: 'Header', fields: [
                    {name: 'name', label: 'Name', type: 'char', span: 2},
                    {name: 'revision', label: 'Revision', type: 'char'},
                    {name: 'drawing_number', label: 'Drawing',
                        type: 'char'},
                    {name: 'drawing_revision', label: 'Drawing revision',
                        type: 'char'},
                    {name: 'active', label: 'Active', type: 'boolean',
                        default: true}]},
                {title: 'Materials', lines: {name: 'inputs',
                    model: 'production.bom.input', inverse: 'bom',
                    fields: IO_FIELDS}},
                {title: 'Makes', lines: {name: 'outputs',
                    model: 'production.bom.output', inverse: 'bom',
                    fields: IO_FIELDS}},
                {title: 'Show Costs', render: function (pane, record) {
                    Rpc.desk('bom_costs', [record.id, 1]).then(function (c) {
                        pane.appendChild(table(['Part', '#Qty', 'Unit',
                            '#Unit cost', '#Cost'], c.rows.map(function (r) {
                                return el('tr' + (r.fabricated ? '.total' :
                                    ''), el('td', {style: {paddingLeft: (8 +
                                    r.level * 18) + 'px'}}, r.product),
                                    num(r.quantity), el('td', r.unit),
                                    money(r.unit_cost), money(r.cost));
                            }).concat([el('tr.total', el('td',
                                'Material cost of one'), el('td'), el('td'),
                                el('td'), money(c.total))])));
                    }, UI.showError);
                }}
            ],
            browse: [
                {name: 'name', label: 'Master'},
                {name: 'revision', label: 'Revision'},
                {name: 'drawing_number', label: 'Drawing'}]
        });
    };

    /* ---- Shop Resources and Employees -------------------------------------- */

    Screens.resources = function (main) {
        UI.master(main, {
            title: 'Shop Resources',
            model: 'production.work.center',
            label: 'Resource ID',
            order: [['name', 'ASC']],
            tabs: [{title: 'Resource', fields: [
                {name: 'name', label: 'Name', type: 'char', span: 2},
                {name: 'category', label: 'Category', type: 'many2one',
                    model: 'production.work.center.category'},
                {name: 'warehouse', label: 'Warehouse', type: 'many2one',
                    model: 'stock.location', domain: [['type', '=',
                        'warehouse']]},
                {name: 'cost_price', label: 'Cost rate', type: 'money'},
                {name: 'cost_method', label: 'Cost per', type: 'selection',
                    options: [['hour', 'Hour'], ['cycle', 'Cycle']]},
                {name: 'active', label: 'Active', type: 'boolean',
                    default: true}]}],
            browse: [
                {name: 'name', label: 'Resource'},
                {name: 'category', label: 'Category', type: 'many2one'},
                {name: 'cost_price', label: 'Rate', type: 'money'},
                {name: 'cost_method', label: 'Per'}]
        });
    };

    Screens.employees = function (main) {
        UI.master(main, {
            title: 'Employees',
            model: 'company.employee',
            label: 'Employee',
            defaults: {company: Rpc.context().company},
            tabs: [{title: 'Employee', fields: [
                {name: 'party', label: 'Person', type: 'many2one',
                    model: 'party.party', span: 2},
                {name: 'start_date', label: 'Start date', type: 'date'},
                {name: 'end_date', label: 'End date', type: 'date'}]}],
            browse: [
                {name: 'party', label: 'Employee', type: 'many2one'},
                {name: 'start_date', label: 'Start', type: 'date'},
                {name: 'end_date', label: 'End', type: 'date'}]
        });
    };
}(window));
