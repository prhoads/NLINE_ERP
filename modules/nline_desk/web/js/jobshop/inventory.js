/* N-Line Jobshop emulation: inventory screens (module nline_js_inventory; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * Inventory group bar: Parts (parts, parts/<template id>), Units of Measure
 * (units), Unit Conversions (unit-conversions), Locations (locations),
 * Adjustments (adjustments: Adjustments, Transfers, Physical Count). The
 * Part window's View / Tools dialogs (Where Used, Inventory Txs, Inventory
 * Pieces, Supply & Demand, Material Availability, Reset Material Costs) are
 * on window.JobshopInventory for the other areas' windows. */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    /* An optional ?... after the route: a screen reopened empty */
    routes.push(
        [/^#\/parts(?:\?.*)?$/, 'parts'],
        [/^#\/parts\/(\d+)$/, 'parts'],
        [/^#\/units(?:\?.*)?$/, 'jsUnits'],
        [/^#\/unit-conversions(?:\?.*)?$/, 'jsUnitConversions'],
        [/^#\/locations(?:\?.*)?$/, 'jsLocations'],
        [/^#\/adjustments(?:\?.*)?$/, 'jsAdjustments']);

    /* ---- Style ------------------------------------------------------------ */

    function injectStyle() {
        if (document.getElementById('nl-js-inventory-css')) {
            return;
        }
        document.head.appendChild(el('style', {id: 'nl-js-inventory-css'},
            '.nl-inv-wide.modal { max-width: 1100px; }' +
            '.nl-inv-wide .modal-body { max-height: 70vh; overflow: auto; }' +
            '.nl-inv-grid td.marker { width: 22px; text-align: center;' +
            ' color: var(--muted); cursor: pointer; user-select: none; }' +
            '.nl-inv-grid tr.selected td { background: var(--accent-soft); }' +
            '.nl-inv-grid tr.deleted td { text-decoration: line-through;' +
            ' color: var(--muted); }' +
            '.nl-inv-grid tr.deleted td.marker { color: var(--bad);' +
            ' text-decoration: none; }' +
            '.nl-inv-grid td input[type=text] { width: 100%; }' +
            '.nl-inv-status { border-top: 1px solid var(--line);' +
            ' padding: 4px 8px; font-size: 12px; color: var(--muted);' +
            ' min-height: 20px; }' +
            '.nl-inv-filter { display: grid; grid-template-columns:' +
            ' auto 1fr 1fr; gap: 6px 10px; align-items: center; }' +
            '.nl-inv-total td { font-weight: 600; border-top: 2px solid' +
            ' var(--line); }' +
            '.nl-inv-hint { font-size: 12px; color: var(--muted);' +
            ' margin: 4px 0; }' +
            '.nl-inv-numbers { display: grid; grid-template-columns:' +
            ' repeat(auto-fit, minmax(150px, 1fr)); gap: 8px 14px; }' +
            '.nl-inv-numbers div { border: 1px solid var(--line);' +
            ' border-radius: 4px; padding: 6px 10px; }' +
            '.nl-inv-numbers strong { display: block; font-size: 18px; }' +
            '.nl-inv-bad { color: var(--bad); }' +
            '.nl-inv-ok { color: var(--ok); }' +
            'tr.nl-inv-pending td.marker { color: var(--ok); }'));
    }

    /* ---- Helpers ------------------------------------------------------------ */

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function num(value, digits) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        var n = Number(value);
        if (isNaN(n)) {
            return String(value);
        }
        if (digits === undefined) {
            return String(Math.round(n * 10000) / 10000);
        }
        return n.toFixed(digits);
    }

    function text(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    /* May the user do perm on model? Unknown (no answer) = yes: the server
     * still refuses what is not allowed */
    function can(access, model, perm) {
        var a = access && access[model];
        return a ? a[perm] !== false : true;
    }

    /* A read-only table: columns [{key, label, num, money, date, bool,
     * render(row)}], rows; options {ondblclick(row), oncontextmenu(event,
     * row), empty, total: [keys]} */
    function dataTable(columns, rows, options) {
        options = options || {};
        var body = el('tbody');
        rows.forEach(function (row) {
            body.appendChild(el('tr', {
                title: options.ondblclick ? 'Double-click to open' : null,
                ondblclick: options.ondblclick ? function () {
                    options.ondblclick(row);
                } : null,
                oncontextmenu: options.oncontextmenu ? function (event) {
                    options.oncontextmenu(event, row);
                } : null
            }, columns.map(function (c) {
                var v = c.render ? c.render(row) : row[c.key];
                if (v && v.nodeType) {
                    return el('td', v);
                }
                return el('td' + (c.num || c.money ? '.num' : ''),
                    c.money ? (v === null || v === undefined ? '' :
                        UI.money(v)) : c.date ? UI.date(v) : c.bool ?
                        (v ? '✔' : '') : c.num ? num(v) : text(v));
            })));
        });
        if (!rows.length) {
            body.appendChild(el('tr', el('td', {colspan: columns.length},
                options.empty || 'None.')));
        }
        var foot = null;
        if (options.total && rows.length) {
            foot = el('tfoot', el('tr.nl-inv-total', columns.map(
                function (c, i) {
                    if (options.total.indexOf(c.key) >= 0) {
                        var sum = rows.reduce(function (s, r) {
                            return s + (Number(r[c.key]) || 0);
                        }, 0);
                        return el('td.num', c.money ? UI.money(sum) :
                            num(sum));
                    }
                    return el('td', i === 0 ? 'Total' : '');
                })));
        }
        return el('div.table-wrap', el('table.data', el('thead', el('tr',
            columns.map(function (c) {
                return el('th' + (c.num || c.money ? '.num' : ''), c.label);
            }))), body, foot));
    }

    /* A modal wider than the desk's default, for the Jobshop dialogs */
    function wideModal(title, body, buttons) {
        var close = UI.modal(title, body, buttons || [{label: 'Close',
            primary: true}]);
        var boxes = document.querySelectorAll('.overlay .modal');
        if (boxes.length) {
            boxes[boxes.length - 1].classList.add('nl-inv-wide');
        }
        return close;
    }

    /* Small tabs inside a dialog: defs [{title, render(pane)}] */
    function miniTabs(defs) {
        var bar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        var rendered = [];
        function show(index) {
            Array.prototype.forEach.call(bar.children, function (b, i) {
                b.classList.toggle('active', i === index);
                b.setAttribute('aria-selected', i === index);
            });
            Array.prototype.forEach.call(panes.children, function (p, i) {
                p.hidden = i !== index;
            });
            if (!rendered[index] && defs[index].render) {
                rendered[index] = true;
                defs[index].render(panes.children[index]);
            }
        }
        defs.forEach(function (def, index) {
            bar.appendChild(el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(index);
                }}, def.title));
            panes.appendChild(el('div.tab-pane.panel', {role: 'tabpanel'},
                def.node || null));
        });
        if (defs.length) {
            show(0);
        }
        return {node: el('div', bar, panes), show: show};
    }

    /* A menu under a ribbon button (File / View / Tools of Jobshop) */
    function dropMenu(items) {
        var target = document.activeElement;
        var box = target && target.tagName === 'BUTTON' ?
            target.getBoundingClientRect() : {left: 200, bottom: 120};
        UI.contextMenu({preventDefault: function () {}, clientX: box.left,
            clientY: box.bottom}, items);
    }

    /* Jobshop's Ctrl+S: the screen's primary button, while it is shown */
    function ctrlS(main, action) {
        document.addEventListener('keydown', function (event) {
            if (!main.isConnected) {
                return;
            }
            var key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 's') {
                event.preventDefault();
                action();
            }
        });
    }

    /* The part picker of the dialogs (Jobshop's Part ID button) */
    function partPicker(onselect, initial) {
        var picker = UI.picker('product.template', {label: 'Part ID',
            placeholder: 'Part ID', domain: [['active', 'in', [true,
                false]]], onselect: onselect});
        if (initial) {
            picker.set(initial.id, initial.rec_name);
        }
        return picker;
    }

    function partName(templateId) {
        return Rpc.model('product.template', 'read', [[templateId],
            ['rec_name']]).then(function (rows) {
                return rows[0] ? {id: templateId, rec_name: rows[0].rec_name}
                    : {id: templateId, rec_name: String(templateId)};
            });
    }

    /* A dialog showing one part, with the Part ID button to choose
     * another: render(pane, templateId) */
    function partDialog(title, templateId, render) {
        var pane = el('div');
        var picker = partPicker(function (record) {
            show(record.id);
        });
        function show(id) {
            UI.clear(pane);
            if (!id) {
                pane.appendChild(el('p.muted', 'Choose a part.'));
                return;
            }
            render(pane, id);
        }
        wideModal(title, [el('div.toolbar', el('label.field', 'Part ID'),
            el('div', {style: {minWidth: '320px'}}, picker.node)), pane]);
        if (templateId) {
            partName(templateId).then(function (r) {
                picker.set(r.id, r.rec_name);
            });
        }
        show(templateId);
    }

    /* ---- The Part window's dialogs ------------------------------------- */

    function openDocument(kind, id, number, allowed) {
        if (!allowed) {
            return;
        }
        if (kind === 'sale') {
            UI.openScreen('orders/' + id, 'Order ' + number);
        } else if (kind === 'purchase') {
            UI.openScreen('purchase-orders/' + id, 'PO ' + number);
        } else if (kind === 'production') {
            UI.openScreen('workorders/' + id, 'WO ' + number);
        } else if (kind === 'production.bom') {
            UI.openScreen('masters/' + id, number);
        }
    }

    /* Which documents the user may open from the dialogs */
    var screensPrm = null;
    function screens() {
        if (!screensPrm) {
            screensPrm = Promise.all(['orders', 'purchase-orders',
                'workorders', 'masters', 'parts'].map(UI.screenAllowed))
                .then(function (r) {
                    return {sale: r[0], purchase: r[1], production: r[2],
                        'production.bom': r[3], parts: r[4]};
                });
        }
        return screensPrm;
    }

    /* View > Where Used: the masters and work orders using the part */
    function whereUsed(templateId) {
        partDialog('Part Where Used', templateId, function (pane, id) {
            var masters = el('input', {type: 'checkbox', checked: true,
                id: 'nl-wu-m'});
            var orders = el('input', {type: 'checkbox', checked: true,
                id: 'nl-wu-w'});
            var result = el('div');
            function load() {
                Promise.all([Rpc.desk('part_where_used', [id,
                    masters.checked, orders.checked]), screens()]).then(
                    function (r) {
                        UI.clear(result).appendChild(dataTable([
                            {key: 'type', label: 'Doc Type'},
                            {key: 'document', label: 'Document ID'},
                            {key: 'part', label: 'Part'},
                            {key: 'revision', label: 'Rev'},
                            {key: 'operation', label: 'Seq No', num: true},
                            {key: 'piece', label: 'Piece No', num: true},
                            {key: 'quantity', label: 'Qty Per', num: true},
                            {key: 'unit', label: 'Usage U/M'},
                            {key: 'status', label: 'Status'}], r[0], {
                                ondblclick: function (row) {
                                    openDocument(row.model, row.id,
                                        row.document, r[1][row.model]);
                                }}));
                    }, failed);
            }
            masters.addEventListener('change', load);
            orders.addEventListener('change', load);
            pane.appendChild(el('div.toolbar', masters, el('label',
                {for: 'nl-wu-m'}, 'Eng Masters'), orders, el('label',
                {for: 'nl-wu-w'}, 'Work Orders')));
            pane.appendChild(result);
            load();
        });
    }

    var TX_COLUMNS = [
        {key: 'date', label: 'Date', date: true},
        {key: 'class', label: 'Class'},
        {key: 'type', label: 'In/Out'},
        {key: 'part', label: 'Part ID'},
        {key: 'quantity', label: 'Qty', num: true},
        {key: 'unit', label: 'U/M'},
        {key: 'location', label: 'Location'},
        {key: 'lot', label: 'Tracking No'},
        {key: 'cost', label: 'Unit Cost', money: true},
        {key: 'value', label: 'Value', money: true},
        {key: 'document', label: 'Document'},
        {key: 'reason', label: 'Reason'},
        {key: 'state', label: 'Status'}];

    /* View > Inventory Txs */
    function inventoryTxs(templateId) {
        partDialog('Inventory Transactions', templateId, function (pane, id) {
            Rpc.desk('inventory_transactions', [id, null, 500]).then(
                function (rows) {
                    pane.appendChild(dataTable(TX_COLUMNS, rows, {
                        ondblclick: function (row) {
                            UI.openRecord('stock.move', row.id,
                                row.document || row.part);
                        }}));
                }, failed);
        });
    }

    /* View > Inventory Pieces: the stock by location and tracking number */
    function inventoryPieces(templateId) {
        partDialog('Inventory Pieces', templateId, function (pane, id) {
            Rpc.desk('inventory_pieces', [id]).then(function (data) {
                if (!data.piece_tracked) {
                    pane.appendChild(el('p.nl-inv-hint', 'This part is not ' +
                        'piece tracked: its stock by location and ' +
                        'tracking number.'));
                }
                pane.appendChild(dataTable([
                    {key: 'location', label: 'Location ID'},
                    {key: 'lot', label: 'Tracking No'},
                    {key: 'quantity', label: 'Qty', num: true},
                    {key: 'unit', label: 'U/M'},
                    {key: 'length', label: 'Length', num: true},
                    {key: 'width', label: 'Width', num: true},
                    {key: 'height', label: 'Height', num: true},
                    {key: 'dimensions_uom', label: 'Dimensions U/M'}],
                    data.rows, {total: ['quantity'], empty: 'Nothing in ' +
                        'stock.'}));
            }, failed);
        });
    }

    /* View > Supply & Demand: sales orders, work orders, purchase orders */
    function supplyDemand(templateId) {
        partDialog('Supply & Demand', templateId, function (pane, id) {
            Promise.all([Rpc.desk('part_supply_demand', [id]), screens()])
                .then(function (r) {
                    var data = r[0], allowed = r[1];
                    function open(kind) {
                        return function (row) {
                            openDocument(kind, row.id, row.number,
                                allowed[kind]);
                        };
                    }
                    var tabs = miniTabs([
                        {title: 'Sales Orders', node: dataTable([
                            {key: 'number', label: 'Order ID'},
                            {key: 'sequence', label: 'Line No', num: true},
                            {key: 'status', label: 'Status'},
                            {key: 'date', label: 'Ship Date', date: true},
                            {key: 'demand', label: 'Demand Qty', num: true},
                            {key: 'linked', label: 'Links', bool: true}],
                            data.sales, {ondblclick: open('sale'),
                                total: ['demand']})},
                        {title: 'Work Orders', node: dataTable([
                            {key: 'number', label: 'Work ID'},
                            {key: 'status', label: 'Order Status'},
                            {key: 'date', label: 'Desired Want Date',
                                date: true},
                            {key: 'finish', label: 'Scheduled Finish Date',
                                date: true},
                            {key: 'supply', label: 'Supply Qty', num: true},
                            {key: 'demand', label: 'Demand Qty', num: true}],
                            data.work_orders, {ondblclick: open('production'),
                                total: ['supply', 'demand']})},
                        {title: 'Purchase Orders', node: dataTable([
                            {key: 'number', label: 'Order ID'},
                            {key: 'sequence', label: 'Line No', num: true},
                            {key: 'status', label: 'Status'},
                            {key: 'date', label: 'Receive Date', date: true},
                            {key: 'supply', label: 'Supply Qty', num: true},
                            {key: 'linked', label: 'Links', bool: true}],
                            data.purchases, {ondblclick: open('purchase'),
                                total: ['supply']})}]);
                    pane.appendChild(tabs.node);
                    pane.appendChild(el('p.nl-inv-hint', 'Quantities in ' +
                        data.unit + '. Reference only: change the orders ' +
                        'in their windows.'));
                }, failed);
        });
    }

    /* View > Material Availability of the part */
    function materialAvailability(templateId) {
        partDialog('Material Availability', templateId, function (pane, id) {
            Rpc.desk('part_availability', [id]).then(function (a) {
                function box(label, value, kind) {
                    return el('div', el('span.muted', label), el('strong' +
                        (kind ? '.' + kind : ''), num(value) + ' ' + a.unit));
                }
                pane.appendChild(el('div.nl-inv-numbers',
                    box('On Hand', a.on_hand),
                    box('On Hold', a.on_hold),
                    box('Available', a.available),
                    box('Supply (open orders)', a.supply),
                    box('Demand (open orders)', a.demand),
                    box('Projected', a.projected, a.projected < 0 ?
                        'nl-inv-bad' : 'nl-inv-ok'),
                    a.order_point !== null ? box('Order Point',
                        a.order_point) : null,
                    a.safety_stock ? box('Safety Stock', a.safety_stock) :
                        null));
                if (a.below_order_point) {
                    pane.appendChild(el('p.nl-inv-bad', 'At or below the ' +
                        'order point: replenish this part.'));
                }
                pane.appendChild(el('div.toolbar', el('button', {type:
                    'button', onclick: function () {
                        supplyDemand(id);
                    }}, 'Supply & Demand...')));
            }, failed);
        });
    }

    /* Tools > Reset Material Costs: the work orders' material costs from
     * the part's current cost */
    function resetMaterialCosts(templateId) {
        var current = el('input', {type: 'radio', name: 'nl-rmc', id:
            'nl-rmc-c', checked: Boolean(templateId)});
        var all = el('input', {type: 'radio', name: 'nl-rmc', id: 'nl-rmc-a',
            checked: !templateId});
        if (!templateId) {
            current.disabled = true;
        }
        var byStatus = el('input', {type: 'checkbox', id: 'nl-rmc-s'});
        var statuses = [['unreleased', 'Unreleased'], ['released',
            'Released'], ['closed', 'Closed'], ['cancelled', 'Cancelled'],
            ['all', 'All']].map(function (s) {
                return {value: s[0], box: el('input', {type: 'checkbox',
                    checked: s[0] === 'released'}), label: s[1]};
            });
        var byDate = el('input', {type: 'checkbox', id: 'nl-rmc-d'});
        var after = el('input', {type: 'date', 'aria-label': 'On or After'});
        var before = el('input', {type: 'date', 'aria-label':
            'On or Before'});
        UI.modal('Reset Material Costs', [
            el('div.toolbar', current, el('label', {for: 'nl-rmc-c'},
                'Current Material Only'), all, el('label', {for: 'nl-rmc-a'},
                'All Materials')),
            el('p.nl-inv-hint', 'Reset information on: Work Order ' +
                'operations (engineering masters use the part\'s cost ' +
                'directly). Costs only: the description, specifications, ' +
                'drawing and supplier of a material are read from the part.'),
            el('div.toolbar', byStatus, el('label', {for: 'nl-rmc-s'},
                'According to Material Status')),
            el('div.toolbar', statuses.map(function (s) {
                return el('label', s.box, ' ' + s.label);
            })),
            el('div.toolbar', byDate, el('label', {for: 'nl-rmc-d'},
                'According to W/O Creation Date')),
            el('div.toolbar', el('label', 'On or After ', after),
                el('label', 'On or Before ', before))], [
            {label: 'Cancel'},
            {label: 'OK', primary: true, onclick: function () {
                var values = {template: current.checked ? templateId : null};
                if (byStatus.checked) {
                    values.statuses = statuses.filter(function (s) {
                        return s.box.checked;
                    }).map(function (s) {
                        return s.value;
                    });
                }
                if (byDate.checked) {
                    values.from_date = after.value || null;
                    values.to_date = before.value || null;
                }
                Rpc.desk('reset_material_costs', [values]).then(
                    function (r) {
                        UI.toast(r.reset + ' of ' + r.materials +
                            ' material(s) reset', 'ok');
                    }, failed);
            }}]);
    }

    global.JobshopInventory = {
        whereUsed: whereUsed,
        inventoryTxs: inventoryTxs,
        inventoryPieces: inventoryPieces,
        supplyDemand: supplyDemand,
        materialAvailability: materialAvailability,
        resetMaterialCosts: resetMaterialCosts
    };

    /* ---- Parts window ---------------------------------------------------- */

    var STATUS_CHOICES = {
        sale: [['unreleased', 'Unreleased'], ['firm', 'Firm'],
            ['released', 'Released'], ['closed', 'Closed'],
            ['cancelled', 'Cancelled']],
        purchase: [['unreleased', 'Unreleased'], ['firm', 'Firm'],
            ['released', 'Released'], ['closed', 'Closed'],
            ['cancelled', 'Cancelled']],
        production: [['unreleased', 'Unreleased'], ['released', 'Released'],
            ['closed', 'Closed'], ['cancelled', 'Cancelled']]
    };

    var ORDER_COLUMNS = {
        sale: [
            {key: 'linked', label: 'Linked', bool: true},
            {key: 'number', label: 'Sales ID'},
            {key: 'party', label: 'Customer ID'},
            {key: 'status', label: 'Order Status'},
            {key: 'sequence', label: 'Line No', num: true},
            {key: 'line_status', label: 'Line Status'},
            {key: 'quantity', label: 'Order Qty', num: true},
            {key: 'shipped', label: 'Shipped Qty', num: true},
            {key: 'unit', label: 'U/M'},
            {key: 'unit_price', label: 'Unit Price', money: true},
            {key: 'amount', label: 'Order Amount', money: true},
            {key: 'shipped_amount', label: 'Shipped Amount', money: true},
            {key: 'date', label: 'Ship Date', date: true},
            {key: 'reference', label: 'Customer PO'}],
        purchase: [
            {key: 'linked', label: 'Linked', bool: true},
            {key: 'number', label: 'Purchase ID'},
            {key: 'party', label: 'Supplier ID'},
            {key: 'status', label: 'Order Status'},
            {key: 'buyer', label: 'Buyer'},
            {key: 'sequence', label: 'Line No', num: true},
            {key: 'quantity', label: 'Order Qty', num: true},
            {key: 'received', label: 'Received Qty', num: true},
            {key: 'unit', label: 'U/M'},
            {key: 'unit_price', label: 'Unit Price', money: true},
            {key: 'amount', label: 'Order Amount', money: true},
            {key: 'received_amount', label: 'Received Amount',
                money: true},
            {key: 'last_received', label: 'Last Received Date', date: true},
            {key: 'date', label: 'Promise Date', date: true}],
        production: [
            {key: 'number', label: 'Work ID'},
            {key: 'description', label: 'Description'},
            {key: 'status', label: 'Order Status'},
            {key: 'quantity', label: 'Desired Qty', num: true},
            {key: 'received', label: 'Received Qty', num: true},
            {key: 'unit_cost', label: 'Projected Unit Cost', money: true},
            {key: 'date', label: 'Desired Want Date', date: true},
            {key: 'start', label: 'Schedule Start Date', date: true},
            {key: 'finish', label: 'Schedule Finish Date', date: true}]
    };

    /* A tab of the part's orders; right-click changes the statuses shown
     * (Released by default, as in Jobshop) */
    function ordersTab(kind, allowed) {
        var statuses = ['released'];
        return function render(pane, record) {
            var label = STATUS_CHOICES[kind].filter(function (s) {
                return statuses.indexOf(s[0]) >= 0;
            }).map(function (s) {
                return s[1];
            }).join(', ');
            function menu(event) {
                UI.contextMenu(event, STATUS_CHOICES[kind].map(function (s) {
                    var on = statuses.indexOf(s[0]) >= 0;
                    return {label: (on ? '✔ ' : '    ') + s[1], onclick:
                        function () {
                            if (on) {
                                statuses.splice(statuses.indexOf(s[0]), 1);
                            } else {
                                statuses.push(s[0]);
                            }
                            render(UI.clear(pane), record);
                        }};
                }).concat(['-', {label: 'All', onclick: function () {
                    statuses = STATUS_CHOICES[kind].map(function (s) {
                        return s[0];
                    });
                    render(UI.clear(pane), record);
                }}]));
            }
            pane.appendChild(el('div.toolbar', el('span.muted',
                'Showing: ' + (label || 'nothing')), el('button', {type:
                    'button', onclick: function (event) {
                        menu(event);
                    }}, 'Status...')));
            Rpc.desk('part_orders', [record.id, kind, statuses]).then(
                function (rows) {
                    pane.appendChild(dataTable(ORDER_COLUMNS[kind], rows, {
                        ondblclick: allowed ? function (row) {
                            openDocument(kind, row.id, row.number, true);
                        } : null,
                        oncontextmenu: menu}));
                    pane.lastChild.addEventListener('contextmenu',
                        function (event) {
                            if (!event.defaultPrevented) {
                                menu(event);
                            }
                        });
                }, failed);
        };
    }

    /* A read-only list tab (the user may not change the lines) */
    function readLinesTab(model, inverse, fields) {
        return function (pane, record) {
            var names = [];
            fields.forEach(function (f) {
                names.push(f.name);
                if (f.type === 'many2one') {
                    names.push(f.name + '.rec_name');
                }
            });
            Rpc.searchRead(model, [[inverse, '=', record.id]], names, {})
                .then(function (rows) {
                    pane.appendChild(dataTable(fields.map(function (f) {
                        return {key: f.name, label: f.label, num: f.type ===
                            'float', bool: f.type === 'boolean', render:
                            f.type === 'many2one' ? function (row) {
                                return (row[f.name + '.'] || {}).rec_name ||
                                    '';
                            } : null};
                    }), rows));
                }, failed);
        };
    }

    var LOCATION_FIELDS = [
        {name: 'location', label: 'Location ID', type: 'many2one',
            model: 'stock.location', domain: [['type', '=', 'storage']]},
        {name: 'location_name', label: 'Description', type: 'char',
            readonly: true},
        {name: 'hold', label: 'Hold', type: 'boolean'},
        {name: 'quantity', label: 'Qty On Hand', type: 'float',
            readonly: true},
        {name: 'primary', label: 'Primary', type: 'boolean',
            readonly: true},
        {name: 'issue_from', label: 'Issue From', type: 'boolean',
            readonly: true},
        {name: 'last_counted', label: 'Last Counted', type: 'date',
            readonly: true}];

    var CONVERSION_FIELDS = [
        {name: 'from_uom', label: 'From Unit ID', type: 'many2one',
            model: 'product.uom'},
        {name: 'from_name', label: 'From Description', type: 'char',
            readonly: true},
        {name: 'to_uom', label: 'To Unit ID', type: 'many2one',
            model: 'product.uom'},
        {name: 'to_name', label: 'To Description', type: 'char',
            readonly: true},
        {name: 'factor', label: 'Conversion', type: 'float'},
        {name: 'sentence', label: 'Means', type: 'char', readonly: true}];

    var STORAGE = [['type', '=', 'storage']];

    Screens.parts = function (main, params) {
        injectStyle();
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var models = ['product.template', 'stock.move', 'sale.line',
            'purchase.line', 'production', 'production.bom',
            'nline.js.part_location', 'nline.js.unit_conversion',
            'purchase.product_supplier'];
        Promise.all([UI.access(models), Rpc.desk('inventory_setup', [])
            .catch(function () {
                return null;
            }), screens()]).then(function (r) {
                build(r[0], r[1], r[2]);
            }, failed);

        function build(access, setup, allowed) {
            var labels = setup ? setup.user_labels : [];
            var win = null;

            function current() {
                var record = win && win.record();
                return record ? record.id : null;
            }

            /* View: Jobshop's View menu of the Part window */
            function viewItems() {
                var items = [];
                if (can(access, 'production.bom', 'read') ||
                        can(access, 'production', 'read')) {
                    items.push({label: 'Where Used', onclick: function () {
                        whereUsed(current());
                    }});
                }
                if (can(access, 'stock.move', 'read')) {
                    items.push({label: 'Inventory Txs', onclick: function () {
                        inventoryTxs(current());
                    }}, {label: 'Inventory Pieces', onclick: function () {
                        inventoryPieces(current());
                    }}, '-', {label: 'Material Availability', onclick:
                        function () {
                            materialAvailability(current());
                        }}, {label: 'Supply & Demand', onclick: function () {
                        supplyDemand(current());
                    }});
                }
                return items;
            }

            function toolItems() {
                var items = [];
                if (can(access, 'stock.move', 'write') &&
                        can(access, 'production', 'write')) {
                    items.push({label: 'Reset Material Costs...', onclick:
                        function () {
                            resetMaterialCosts(current());
                        }});
                }
                return items;
            }

            function copyPart(record, load) {
                if (!record) {
                    UI.showError('Choose the part to copy first.');
                    return;
                }
                var code = el('input', {type: 'text', 'aria-label':
                    'New Part ID'});
                UI.modal('Copy to a New Part ID', [el('p', 'Copy all the ' +
                    'information of ' + record.rec_name + ' except its ' +
                    'Part ID into a new part.'), el('label.field',
                    'New Part ID'), code], [{label: 'Cancel'}, {label:
                    'Copy', primary: true, onclick: function () {
                        if (!code.value.trim()) {
                            return true;
                        }
                        Rpc.desk('part_copy', [record.id, code.value.trim()])
                            .then(function (newId) {
                                UI.toast('Part ' + code.value.trim() +
                                    ' created', 'ok');
                                load(newId);
                            }, failed);
                    }}]);
            }

            function deletePart(record) {
                if (!record) {
                    return;
                }
                UI.confirm('Delete Document', 'Delete part ' +
                    record.rec_name + '? It cannot be recovered.').then(
                    function (ok) {
                        if (!ok) {
                            return;
                        }
                        Rpc.desk('part_delete', [record.id]).then(function () {
                            UI.toast('Part deleted', 'ok');
                            global.location.hash = '#/parts?' + Date.now();
                        }, failed);
                    });
            }

            var extra = [];
            var view = viewItems(), tools = toolItems();
            if (view.length) {
                extra.push({label: 'View', onclick: function () {
                    dropMenu(view);
                }});
            }
            if (tools.length) {
                extra.push({label: 'Tools', onclick: function () {
                    dropMenu(tools);
                }});
            }
            /* Copy / Delete: shown by the window per the user's rights */
            extra.push({label: 'Copy', onclick: copyPart},
                {label: 'Delete', onclick: deletePart});

            var userFields = [];
            for (var i = 0; i < 10; i++) {
                userFields.push({name: 'user_' + i, label: labels[i] ||
                    'User Defined ' + (i + 1), type: 'char'});
            }

            var tabs = [
                {title: 'Part', fields: [
                    {name: 'code', label: 'Part ID', type: 'char'},
                    {name: 'inactive', label: 'Inactive', type: 'boolean',
                        default: false},
                    {name: 'name', label: 'Description', type: 'char',
                        span: 2},
                    {name: 'default_uom', label: 'Stock U/M',
                        type: 'many2one', model: 'product.uom'},
                    {name: 'engineering_revision', label: 'Engineering Master',
                        type: 'char'},
                    {name: 'commodity_code', label: 'Commodity Code ID',
                        type: 'many2one', model: 'nline.commodity_code'},
                    {name: 'product_code', label: 'Product Code ID',
                        type: 'many2one', model: 'nline.product_code'},
                    {name: 'weight_uom', label: 'Weight U/M',
                        type: 'many2one', model: 'product.uom'},
                    {name: 'weight', label: 'Net Weight', type: 'float'},
                    {name: 'ship_dimensions', label: 'Ship Dimensions',
                        type: 'char'},
                    {name: 'drawing_number', label: 'Drawing ID',
                        type: 'char'},
                    {name: 'drawing_revision', label: 'Rev', type: 'char'},
                    {name: 'drawing_file', label: 'Drawing File', type: 'char',
                        span: 2},
                    {name: 'mfg_name', label: 'Manufacturer', type: 'char'},
                    {name: 'mfg_part_id', label: 'Manufacturer Part ID',
                        type: 'char'},
                    {name: 'type', label: 'Type', type: 'selection',
                        options: [['goods', 'Goods (stocked)'],
                            ['assets', 'Assets'], ['service', 'Service']],
                        default: 'goods'},
                    {name: 'producible', label: 'Fabricated',
                        type: 'boolean'},
                    {name: 'purchasable', label: 'Purchased',
                        type: 'boolean'},
                    {name: 'salable', label: 'Sold', type: 'boolean'},
                    {name: 'stocked', label: 'Stocked', type: 'boolean'},
                    {name: 'tool_or_fixture', label: 'Tool/Fixture',
                        type: 'boolean'},
                    {name: 'auto_issue', label: 'Auto Issue',
                        type: 'boolean'},
                    {name: 'consumable', label: 'Consumable',
                        type: 'boolean'},
                    {name: 'lot_tracked', label: 'Lot Tracked',
                        type: 'boolean'}]},
                {title: 'General', fields: [
                    {name: 'primary_location', label: 'Primary Location ID',
                        type: 'many2one', model: 'stock.location',
                        domain: STORAGE},
                    {name: 'issue_from_location',
                        label: 'Issue From Location ID', type: 'many2one',
                        model: 'stock.location', domain: STORAGE},
                    {name: 'preferred_supplier', label: 'Preferred Supplier ID',
                        type: 'many2one', model: 'party.party',
                        readonly: !can(access, 'purchase.product_supplier',
                            'create')},
                    {name: 'lead_time_days', label: 'Leadtime (days)',
                        type: 'integer'},
                    {name: 'order_point', label: 'Order Point',
                        type: 'float'},
                    {name: 'safety_stock', label: 'Safety Stock Qty',
                        type: 'float', default: 0},
                    {name: 'minimum_order_qty', label: 'Minimum Order Qty',
                        type: 'float', default: 1},
                    {name: 'maximum_order_qty', label: 'Maximum Order Qty',
                        type: 'float'},
                    {name: 'multiple_order_qty', label: 'Order in Multiples Of',
                        type: 'float', default: 1},
                    {name: 'maximum_stock_qty', label: 'Maximum Stock Qty',
                        type: 'float'},
                    {name: 'purchase_uom', label: 'Purchase U/M',
                        type: 'many2one', model: 'product.uom'},
                    {name: 'sale_uom', label: 'Selling U/M',
                        type: 'many2one', model: 'product.uom'},
                    {name: 'usage_uom', label: 'Usage U/M',
                        type: 'many2one', model: 'product.uom'},
                    {name: 'piece_tracked', label: 'Part is Piece Tracked',
                        type: 'boolean'},
                    {name: 'length_required', label: 'Length',
                        type: 'boolean'},
                    {name: 'width_required', label: 'Width',
                        type: 'boolean'},
                    {name: 'height_required', label: 'Height',
                        type: 'boolean'},
                    {name: 'dimensions_uom', label: 'Dimensions U/M',
                        type: 'many2one', model: 'product.uom'}
                ].concat(userFields)},
                {title: 'Costing', fields: [
                    {name: 'unit_material_cost', label: 'Material',
                        type: 'money'},
                    {name: 'unit_labor_cost', label: 'Labor', type: 'money'},
                    {name: 'unit_burden_cost', label: 'Burden',
                        type: 'money'},
                    {name: 'unit_service_cost', label: 'Service',
                        type: 'money'},
                    {name: 'fixed_cost', label: 'Fixed Cost', type: 'money'},
                    {name: 'unit_cost', label: 'Unit Cost', type: 'money',
                        readonly: true},
                    {name: 'list_price', label: 'Unit Price', type: 'money'},
                    {name: 'cost_price', label: 'Inventory Cost (average)',
                        type: 'money', readonly: true},
                    {name: 'cost_price_method', label: 'Cost Method',
                        type: 'selection', options: [['fixed', 'Fixed'],
                            ['average', 'Average'], ['fifo', 'FIFO']],
                        default: 'average'},
                    {name: 'account_category', label: 'Account Set ID',
                        type: 'many2one', model: 'product.category',
                        domain: [['accounting', '=', true]]}]},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', rows: 16, span: 6}]},
                {picture: true},
                {notes: true},
                can(access, 'nline.js.part_location', 'write') &&
                    can(access, 'product.template', 'write') ?
                    {title: 'Locations', lines: {name: 'part_locations',
                        model: 'nline.js.part_location', inverse: 'template',
                        fields: LOCATION_FIELDS}} :
                    {title: 'Locations', render: readLinesTab(
                        'nline.js.part_location', 'template',
                        LOCATION_FIELDS)},
                can(access, 'nline.js.unit_conversion', 'write') &&
                    can(access, 'product.template', 'write') ?
                    {title: 'Unit Conversions', lines: {
                        name: 'unit_conversions',
                        model: 'nline.js.unit_conversion',
                        inverse: 'template', fields: CONVERSION_FIELDS}} :
                    {title: 'Unit Conversions', render: readLinesTab(
                        'nline.js.unit_conversion', 'template',
                        CONVERSION_FIELDS)}];
            if (can(access, 'sale.line', 'read')) {
                tabs.push({title: 'Sales Order Lines', render: ordersTab(
                    'sale', allowed.sale)});
            }
            if (can(access, 'purchase.line', 'read')) {
                tabs.push({title: 'Purchase Order Lines', render: ordersTab(
                    'purchase', allowed.purchase)});
            }
            if (can(access, 'production', 'read')) {
                tabs.push({title: 'Work Orders', render: ordersTab(
                    'production', allowed.production)});
            }

            win = UI.master(main, {
                title: 'Parts',
                model: 'product.template',
                open: openId,
                label: 'Part ID',
                order: [['code', 'ASC'], ['name', 'ASC']],
                /* Inactive parts too (Jobshop's Show All) */
                domain: [['active', 'in', [true, false]]],
                single: true,
                defaults: {type: 'goods'},
                extra: extra,
                tabs: tabs,
                browse: [
                    {name: 'inactive', label: 'Inactive', type: 'boolean'},
                    {name: 'code', label: 'Part ID'},
                    {name: 'name', label: 'Description'},
                    {name: 'producible', label: 'Fabricated',
                        type: 'boolean'},
                    {name: 'purchasable', label: 'Purchased',
                        type: 'boolean'},
                    {name: 'stocked', label: 'Stocked', type: 'boolean'},
                    {name: 'tool_or_fixture', label: 'Tool or Fixture',
                        type: 'boolean'},
                    {name: 'default_uom', label: 'Stock UM',
                        type: 'many2one'},
                    {name: 'drawing_number', label: 'Drawing ID'},
                    {name: 'product_code', label: 'Product Code',
                        type: 'many2one'},
                    {name: 'commodity_code', label: 'Commodity Code',
                        type: 'many2one'},
                    {name: 'mfg_name', label: 'Mfg Name'},
                    {name: 'mfg_part_id', label: 'Mfg Part ID'},
                    {name: 'list_price', label: 'Unit Price',
                        type: 'money'}],
                beforeSave: function (values) {
                    /* Tryton needs the purchase and selling units of a
                     * purchased / sold part: the stock unit by default */
                    if (values.purchasable && !values.purchase_uom) {
                        values.purchase_uom = values.default_uom;
                    }
                    if (values.salable && !values.sale_uom) {
                        values.sale_uom = values.default_uom;
                    }
                    return values;
                },
                onload: function (record) {
                    UI.setTitle('Part ' + (record.code || record.rec_name));
                    costingState(record);
                }
            });

            /* Costing: a purchased only part has no labor, burden or
             * service; a fabricated only part no fixed cost */
            function costingState(record) {
                var purchasedOnly = record.purchasable && !record.producible;
                var fabricatedOnly = record.producible &&
                    !record.purchasable;
                [['Labor', purchasedOnly], ['Burden', purchasedOnly],
                    ['Service', purchasedOnly],
                    ['Fixed Cost', fabricatedOnly]].forEach(function (c) {
                        var input = main.querySelector('input[aria-label="' +
                            c[0] + '"]');
                        if (input) {
                            input.readOnly = c[1];
                            input.title = c[1] ? 'Not used for this part' :
                                '';
                        }
                    });
            }

            /* Right-click in the window: the View menu */
            main.addEventListener('contextmenu', function (event) {
                if (event.defaultPrevented || !current() || !view.length ||
                        /^(INPUT|TEXTAREA|SELECT)$/.test(
                            event.target.tagName)) {
                    return;
                }
                UI.contextMenu(event, view.concat(tools.length ? ['-'] : [],
                    tools));
            });

            ctrlS(main, function () {
                var save = main.querySelector('.ribbon button.primary');
                if (save && !save.hidden) {
                    save.click();
                }
            });
        }
    };

    /* ---- The table windows (Units, Unit Conversions, Locations) ---------- */

    /* gridWindow(main, {title, columns: [{key, label, type: 'char'|'int'|
     * 'float'|'bool'|'m2o'|'show', model, domain, fields, newOnly,
     * value(row) for 'show', onselect(record, row)}], load() -> Promise
     * rows, save({rows, deleted}) -> Promise rows, rights {create, write,
     * delete}, status(row) -> text, help}): Jobshop's table maintenance
     * window: a row per record, a new row at the end, Del marks the
     * selected row for deletion (red X), Save (Ctrl+S) saves them all, F5
     * refreshes */
    function gridWindow(main, spec) {
        injectStyle();
        var rights = spec.rights;
        var rows = [];
        var selected = null;
        var body = el('tbody');
        var status = el('div.nl-inv-status');
        var saveButton = el('button.primary', {type: 'button', title:
            'Save (Ctrl+S)', onclick: save}, 'Save');
        var canSave = rights.create || rights.write || rights.delete;
        main.appendChild(el('div.ribbon', {role: 'toolbar'},
            el('span.ribbon-title', spec.title),
            el('button', {type: 'button', title: 'Refresh (F5)', onclick:
                load}, 'Refresh'),
            rights.delete ? el('button', {type: 'button', title:
                'Mark the selected row for deletion (Del)', onclick:
                function () {
                    toggleDelete(selected);
                }}, 'Delete') : null,
            (spec.extra || []).map(function (b) {
                return el('button', {type: 'button', onclick: b.onclick},
                    b.label);
            }),
            el('span.spacer'), canSave ? saveButton : null));
        if (spec.help) {
            main.appendChild(el('p.nl-inv-hint', spec.help));
        }
        main.appendChild(el('div.table-wrap.nl-inv-grid', el('table.data',
            el('thead', el('tr', el('th', ''), spec.columns.map(function (c) {
                return el('th' + (c.type === 'int' || c.type === 'float' ?
                    '.num' : ''), c.label);
            }))), body), status));

        function control(c, row, value) {
            var editable = row.id ? rights.write && !c.newOnly :
                rights.create;
            var node, get, set;
            if (c.type === 'show') {
                node = el('span');
                set = function () {
                    node.textContent = text(c.value(row));
                };
                get = function () {
                    return null;
                };
            } else if (c.type === 'm2o') {
                var picker = UI.picker(c.model, {label: c.label, domain:
                    c.domain, fields: c.fields, onselect: function (record) {
                        if (c.onselect) {
                            c.onselect(record, row);
                        }
                        touched(row);
                    }});
                picker.input.disabled = !editable;
                node = picker.node;
                row.records = row.records || {};
                get = function () {
                    return picker.value();
                };
                set = function (v) {
                    if (v && typeof v === 'object') {
                        picker.set(v.id, v.rec_name);
                    } else {
                        picker.set(null, '');
                    }
                };
                node.addEventListener('input', function () {
                    touched(row);
                });
            } else if (c.type === 'bool') {
                node = el('input', {type: 'checkbox', 'aria-label': c.label,
                    onchange: function () {
                        touched(row);
                    }});
                node.disabled = !editable;
                get = function () {
                    return node.checked;
                };
                set = function (v) {
                    node.checked = Boolean(v);
                };
            } else {
                node = el('input', {type: 'text', 'aria-label': c.label,
                    inputmode: c.type === 'int' || c.type === 'float' ?
                        'decimal' : null, oninput: function () {
                            touched(row);
                        }});
                if (c.type === 'int' || c.type === 'float') {
                    node.classList.add('money');
                }
                node.disabled = !editable;
                get = function () {
                    if (node.value.trim() === '') {
                        return null;
                    }
                    if (c.type === 'int') {
                        return parseInt(node.value, 10);
                    }
                    if (c.type === 'float') {
                        return parseFloat(node.value);
                    }
                    return node.value;
                };
                set = function (v) {
                    node.value = text(v);
                };
            }
            set(value);
            return {node: node, get: get, set: set, column: c};
        }

        function touched(row) {
            if (!row.state) {
                row.state = row.id ? 'edited' : 'new';
                row.marker.textContent = row.id ? '✎' : '+';
            }
            if (!row.id && rows[rows.length - 1] === row && rights.create) {
                addRow(null);
            }
            refreshShow(row);
            showStatus(row);
        }

        function refreshShow(row) {
            Object.keys(row.controls).forEach(function (key) {
                var c = row.controls[key];
                if (c.column.type === 'show') {
                    c.set();
                }
            });
        }

        function showStatus(row) {
            status.textContent = row && spec.status ? spec.status(row) || '' :
                '';
        }

        function select(row) {
            selected = row;
            rows.forEach(function (r) {
                r.tr.classList.toggle('selected', r === row);
            });
            showStatus(row);
        }

        function toggleDelete(row) {
            if (!row) {
                return;
            }
            if (!row.id) {
                if (rows[rows.length - 1] !== row) {
                    rows.splice(rows.indexOf(row), 1);
                    row.tr.remove();
                }
                return;
            }
            if (!rights.delete) {
                return;
            }
            row.deleted = !row.deleted;
            row.tr.classList.toggle('deleted', row.deleted);
            row.marker.textContent = row.deleted ? '✕' : row.state ? '✎' :
                '';
        }

        function addRow(data) {
            var row = {id: data ? data.id : null, data: data || {},
                controls: {}};
            row.marker = el('td.marker', {title: 'Select the row (Del ' +
                'marks it for deletion)', onclick: function () {
                    select(row);
                }}, '');
            row.value = function (key) {
                return row.controls[key] ? row.controls[key].get() : null;
            };
            var cells = spec.columns.map(function (c) {
                var ctl = control(c, row, data ? data[c.key] : null);
                row.controls[c.key] = ctl;
                return el('td', ctl.node);
            });
            row.tr = el('tr', {onfocusin: function () {
                select(row);
            }}, row.marker, cells);
            if (row.id) {
                row.tr.dataset.id = row.id;
            }
            refreshShow(row);
            rows.push(row);
            body.appendChild(row.tr);
            return row;
        }

        function render(data) {
            UI.clear(body);
            rows = [];
            selected = null;
            data.forEach(addRow);
            if (rights.create) {
                addRow(null);
            }
            showStatus(null);
        }

        function load() {
            spec.load().then(render, failed);
        }

        function save() {
            var changed = [];
            var deleted = [];
            rows.forEach(function (row) {
                if (row.deleted) {
                    deleted.push(row.id);
                    return;
                }
                if (!row.state) {
                    return;
                }
                var values = {id: row.id};
                spec.columns.forEach(function (c) {
                    if (c.type !== 'show') {
                        values[c.key] = row.controls[c.key].get();
                    }
                });
                changed.push(values);
            });
            if (!changed.length && !deleted.length) {
                UI.toast('Nothing to save');
                return;
            }
            var go = deleted.length ? UI.confirm('Delete', 'Delete ' +
                deleted.length + ' row(s) marked with a red X? They cannot ' +
                'be recovered.') : Promise.resolve(true);
            go.then(function (ok) {
                if (!ok) {
                    return;
                }
                spec.save({rows: changed, deleted: deleted}).then(
                    function (data) {
                        UI.toast(spec.title + ' saved', 'ok');
                        render(data);
                    }, failed);
            });
        }

        document.addEventListener('keydown', function (event) {
            if (!main.isConnected) {
                return;
            }
            var key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 's') {
                event.preventDefault();
                if (canSave) {
                    save();
                }
            } else if (event.key === 'F5') {
                event.preventDefault();
                load();
            } else if (event.key === 'Delete' && selected &&
                    document.activeElement && document.activeElement
                    .tagName !== 'INPUT') {
                event.preventDefault();
                toggleDelete(selected);
            }
        });
        load();
        return {reload: load};
    }

    function rightsOf(access, model) {
        return {create: can(access, model, 'create'),
            write: can(access, model, 'write'),
            delete: can(access, model, 'delete')};
    }

    /* ---- Units of Measure --------------------------------------------- */

    Screens.jsUnits = function (main) {
        UI.setTitle('Units of Measure');
        UI.access(['product.uom', 'product.uom.category']).then(
            function (access) {
                var rights = rightsOf(access, 'product.uom');
                gridWindow(main, {
                    title: 'Units of Measure',
                    rights: rights,
                    help: 'Unit Scale: the decimals of the quantities in ' +
                        'this unit (0 to 4). A new unit without a category ' +
                        'gets one of its own: convert it to other units ' +
                        'with Unit Conversions.',
                    columns: [
                        {key: 'symbol', label: 'ID', type: 'char'},
                        {key: 'name', label: 'Description', type: 'char'},
                        {key: 'digits', label: 'Unit Scale', type: 'int'},
                        {key: 'category', label: 'Category', type: 'm2o',
                            model: 'product.uom.category', newOnly: true},
                        {key: 'factor', label: 'Factor (to the category\'s ' +
                            'base unit)', type: 'float', newOnly: true},
                        {key: 'inactive', label: 'Inactive', type: 'bool'}],
                    load: function () {
                        return Rpc.desk('units_list', []);
                    },
                    save: function (values) {
                        return Rpc.desk('units_save', [values]);
                    }
                });
            });
    };

    /* ---- Unit Conversions -------------------------------------------------- */

    function conversionSentence(row) {
        var from = row.records && row.records.from ||
            (row.data.from_uom || {}).rec_name;
        var to = row.records && row.records.to ||
            (row.data.to_uom || {}).rec_name;
        var factor = row.value('factor');
        if (!from || !to || !factor) {
            return '';
        }
        return 'From-units × ' + factor + ' = to-units: 1 ' + from + ' = ' +
            factor + ' ' + to + ' (and 1 ' + to + ' = ' + num(1 / factor, 8)
            .replace(/\.?0+$/, '') + ' ' + from + ')';
    }

    Screens.jsUnitConversions = function (main) {
        UI.setTitle('Unit Conversions');
        UI.access(['nline.js.unit_conversion']).then(function (access) {
            gridWindow(main, {
                title: 'Unit Conversions',
                rights: rightsOf(access, 'nline.js.unit_conversion'),
                help: 'The conversions of every part (a part\'s own are ' +
                    'on its Unit Conversions tab). Conversion: the factor ' +
                    'by which you multiply the From unit to get the To ' +
                    'unit; the opposite conversion is implied.',
                columns: [
                    {key: 'from_uom', label: 'From Unit ID', type: 'm2o',
                        model: 'product.uom', fields: ['symbol', 'name'],
                        onselect: function (record, row) {
                            row.records = row.records || {};
                            row.records.from = record.symbol ||
                                record.rec_name;
                            row.records.fromName = record.name ||
                                record.rec_name;
                        }},
                    {key: 'from_name', label: 'From Unit Description',
                        type: 'show', value: function (row) {
                            return row.records && row.records.fromName ||
                                row.data.from_name;
                        }},
                    {key: 'to_uom', label: 'To Unit ID', type: 'm2o',
                        model: 'product.uom', fields: ['symbol', 'name'],
                        onselect: function (record, row) {
                            row.records = row.records || {};
                            row.records.to = record.symbol ||
                                record.rec_name;
                            row.records.toName = record.name ||
                                record.rec_name;
                        }},
                    {key: 'to_name', label: 'To Unit Description',
                        type: 'show', value: function (row) {
                            return row.records && row.records.toName ||
                                row.data.to_name;
                        }},
                    {key: 'factor', label: 'Conversion', type: 'float'}],
                status: function (row) {
                    if (row.data && row.data.sentence && !row.state) {
                        return row.data.sentence;
                    }
                    return conversionSentence(row);
                },
                load: function () {
                    return Rpc.desk('conversions_list', [null]);
                },
                save: function (values) {
                    values.template = null;
                    return Rpc.desk('conversions_save', [values]);
                }
            });
        });
    };

    /* ---- Locations ------------------------------------------------------- */

    Screens.jsLocations = function (main) {
        UI.setTitle('Locations');
        UI.access(['stock.location', 'stock.move']).then(function (access) {
            var extra = [];
            if (can(access, 'stock.move', 'read')) {
                extra.push({label: 'Inventory Txs', onclick: function () {
                    var row = main.querySelector('.nl-inv-grid tr.selected');
                    var id = row && row.dataset.id;
                    locationTxs(id ? parseInt(id, 10) : null);
                }});
            }
            gridWindow(main, {
                title: 'Locations',
                rights: rightsOf(access, 'stock.location'),
                help: 'The physical places where the parts are kept, in ' +
                    'the warehouse\'s storage.',
                extra: extra,
                columns: [
                    {key: 'code', label: 'Location ID', type: 'char'},
                    {key: 'name', label: 'Description', type: 'char'},
                    {key: 'warehouse', label: 'Warehouse', type: 'show',
                        value: function (row) {
                            return row.data.warehouse || '';
                        }},
                    {key: 'inactive', label: 'Inactive', type: 'bool'}],
                load: function () {
                    return Rpc.desk('locations_list', []);
                },
                save: function (values) {
                    return Rpc.desk('locations_save', [values]);
                }
            });
        });
    };

    /* The inventory transactions of a location */
    function locationTxs(locationId) {
        if (!locationId) {
            UI.showError('Select a location first.');
            return;
        }
        Rpc.desk('inventory_transactions', [null, locationId, 500]).then(
            function (rows) {
                wideModal('Inventory Transactions', dataTable(TX_COLUMNS,
                    rows, {ondblclick: function (row) {
                        UI.openRecord('stock.move', row.id, row.part);
                    }}));
            }, failed);
    }

    /* ---- Adjustments ------------------------------------------------------- */

    Screens.jsAdjustments = function (main) {
        injectStyle();
        UI.setTitle('Adjustments');
        Promise.all([UI.access(['stock.move', 'stock.inventory',
            'account.account', 'stock.lot']), Rpc.desk('inventory_setup',
            [])]).then(function (r) {
                build(r[0], r[1]);
            }, failed);

        function build(access, setup) {
            var tabs = [];
            var active = {part: null};
            var ribbonView = el('button', {type: 'button', onclick:
                function () {
                    var id = active.part;
                    dropMenu([
                        {label: 'Inventory Pieces', onclick: function () {
                            inventoryPieces(id);
                        }},
                        {label: 'Inventory Txs', onclick: function () {
                            inventoryTxs(id);
                        }}]);
                }}, 'View');
            var doButton = el('button.primary', {type: 'button', title:
                'Save: transact the lines of the table (Ctrl+S)'}, 'Save');
            main.appendChild(el('div.ribbon', {role: 'toolbar'},
                el('span.ribbon-title', 'Adjustments'),
                can(access, 'stock.move', 'read') ? ribbonView : null,
                el('span.spacer'), doButton));

            var current = null;
            if (can(access, 'stock.move', 'create')) {
                tabs.push({title: 'Adjustments', node: adjustTab(setup,
                    access, active, 'adjust')});
                tabs.push({title: 'Transfers', node: adjustTab(setup,
                    access, active, 'transfer')});
            }
            if (can(access, 'stock.inventory', 'create')) {
                tabs.push({title: 'Physical Count', node: countTab(setup,
                    active)});
            }
            if (!tabs.length) {
                main.appendChild(el('p.muted', 'You may not adjust ' +
                    'inventory.'));
                doButton.hidden = true;
                return;
            }
            var bar = miniTabs(tabs.map(function (t) {
                return {title: t.title, node: t.node.node};
            }));
            /* The Save of the ribbon runs the shown tab's Save */
            var shownIndex = 0;
            Array.prototype.forEach.call(bar.node.querySelectorAll(
                '.tabs .tab'), function (b, i) {
                    b.addEventListener('click', function () {
                        shownIndex = i;
                    });
                });
            current = function () {
                return tabs[shownIndex].node;
            };
            doButton.addEventListener('click', function () {
                current().save();
            });
            main.appendChild(bar.node);
            ctrlS(main, function () {
                current().save();
            });
        }
    };

    /* The Adjustments (kind 'adjust') or Transfers ('transfer') tab: the
     * entry, the table of the entries waiting to be saved (a + in the row
     * header, click a row to edit it, Del to remove it) and the last saved
     * ones */
    function adjustTab(setup, access, active, kind) {
        var transfer = kind === 'transfer';
        var pending = [];
        var editing = null;
        var stockRows = [];
        var part = null;
        var type = el('select', {'aria-label': 'Type'},
            el('option', {value: 'in'}, 'Adjust In'),
            el('option', {value: 'out'}, 'Adjust Out'));
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var quantity = el('input.money', {type: 'text', inputmode: 'decimal',
            'aria-label': transfer ? 'Transfer Qty' : 'Quantity'});
        var unit = el('span.muted', '');
        var onHand = el('strong', '');
        var available = el('strong', '');
        var lot = el('input', {type: 'text', 'aria-label': 'Tracking No',
            list: 'nl-inv-lots-' + kind});
        var lots = el('datalist', {id: 'nl-inv-lots-' + kind});
        var reason = UI.picker('nline.reason_code', {label: 'Reason Code',
            placeholder: 'Reason Code'});
        var account = can(access, 'account.account', 'read') ?
            UI.picker('account.account', {label: 'Adj Account ID',
                placeholder: 'Adj Account ID', domain: [['type', '!=',
                    null]]}) : null;
        var location = UI.picker('stock.location', {label: 'Location ID',
            placeholder: 'Location ID', domain: STORAGE, onselect:
                function () {
                    showStock();
                }});
        var toLocation = UI.picker('stock.location', {label:
            'To Location ID', placeholder: 'To Location ID',
            domain: STORAGE});
        var costs = {};
        ['material', 'labor', 'burden', 'service'].forEach(function (c) {
            costs[c] = UI.moneyInput({'aria-label': c});
        });
        var partPick = UI.picker('product.template', {label: 'Part ID',
            placeholder: 'Part ID', domain: [['type', '=', 'goods']],
            onselect: function (record) {
                choosePart(record.id);
            }});
        var tableBox = el('div');
        var historyBox = el('div');

        function field(label, node) {
            return el('div', el('label.field', label), node.node || node);
        }

        function choosePart(id, keep) {
            active.part = id;
            Rpc.model('product.template', 'read', [[id], ['rec_name',
                'default_uom.symbol', 'primary_location',
                'primary_location.rec_name', 'unit_material_cost',
                'unit_labor_cost', 'unit_burden_cost', 'unit_service_cost',
                'lot_tracked', 'products']]).then(function (rows) {
                    part = rows[0];
                    unit.textContent = (part['default_uom.'] || {}).symbol ||
                        '';
                    if (!keep) {
                        if (part.primary_location) {
                            location.set(part.primary_location,
                                (part['primary_location.'] || {}).rec_name);
                        }
                        costs.material.value = part.unit_material_cost ?
                            UI.money(part.unit_material_cost) : '';
                        costs.labor.value = part.unit_labor_cost ?
                            UI.money(part.unit_labor_cost) : '';
                        costs.burden.value = part.unit_burden_cost ?
                            UI.money(part.unit_burden_cost) : '';
                        costs.service.value = part.unit_service_cost ?
                            UI.money(part.unit_service_cost) : '';
                    }
                    lot.required = Boolean(part.lot_tracked);
                    lot.placeholder = part.lot_tracked ? 'Required' : '';
                    showStock();
                }, failed);
        }

        function showStock() {
            if (!part) {
                return;
            }
            Rpc.desk('location_stock', [part.id, null]).then(function (r) {
                stockRows = r;
                var loc = location.value();
                var here = r.filter(function (s) {
                    return s.location === loc;
                });
                onHand.textContent = num(here.reduce(function (s, x) {
                    return s + x.quantity;
                }, 0)) + ' ' + unit.textContent;
                available.textContent = num(r.reduce(function (s, x) {
                    return s + x.quantity;
                }, 0)) + ' ' + unit.textContent;
                UI.clear(lots);
                here.forEach(function (s) {
                    if (s.lot) {
                        lots.appendChild(el('option', {value: s.lot},
                            num(s.quantity)));
                    }
                });
            }, failed);
        }

        function clearEntry() {
            editing = null;
            quantity.value = '';
            lot.value = '';
            reason.set(null, '');
            if (account) {
                account.set(null, '');
            }
            toLocation.set(null, '');
            renderTable();
        }

        function entry() {
            var qty = UI.parseMoney(quantity.value);
            if (!part) {
                UI.showError('Choose the part.');
                return null;
            }
            if (!qty || qty <= 0) {
                UI.showError('Enter the quantity, in the part\'s stock ' +
                    'unit of measure.');
                return null;
            }
            if (!location.value()) {
                UI.showError('Choose the location.');
                return null;
            }
            if (transfer && !toLocation.value()) {
                UI.showError('Choose the location to transfer to.');
                return null;
            }
            var line = {
                type: transfer ? 'transfer' : type.value,
                date: date.value || UI.today(),
                template: part.id,
                partName: part.rec_name,
                unit: unit.textContent,
                quantity: qty,
                location: location.value(),
                locationName: (location.record() || {}).rec_name || '',
                lot: lot.value.trim() || null,
                reason_code: reason.value(),
                reasonName: (reason.record() || {}).rec_name || '',
                account: account ? account.value() : null,
                accountName: account ? (account.record() || {}).rec_name ||
                    '' : ''
            };
            if (transfer) {
                line.to_location = toLocation.value();
                line.toName = (toLocation.record() || {}).rec_name || '';
            } else if (line.type === 'in') {
                ['material', 'labor', 'burden', 'service'].forEach(
                    function (c) {
                        line[c] = costs[c].value === '' ? null :
                            String(UI.parseMoney(costs[c].value));
                    });
            }
            return line;
        }

        function add() {
            var line = entry();
            if (!line) {
                return;
            }
            if (editing !== null) {
                pending[editing] = line;
            } else {
                pending.push(line);
            }
            clearEntry();
        }

        function edit(index) {
            var line = pending[index];
            editing = index;
            if (!transfer) {
                type.value = line.type;
            }
            date.value = line.date;
            partPick.set(line.template, line.partName);
            quantity.value = String(line.quantity);
            location.set(line.location, line.locationName);
            lot.value = line.lot || '';
            reason.set(line.reason_code, line.reasonName);
            if (account) {
                account.set(line.account, line.accountName);
            }
            if (transfer) {
                toLocation.set(line.to_location, line.toName);
            }
            choosePart(line.template, true);
            renderTable();
        }

        function renderTable() {
            var columns = [
                {key: 'marker', label: '', render: function (row) {
                    return el('span', {title: 'Not saved'},
                        pending.indexOf(row) === editing ? '✎' : '+');
                }},
                {key: 'date', label: 'Date', date: true},
                {key: 'type', label: 'Type', render: function (row) {
                    return {in: 'Adjust In', out: 'Adjust Out',
                        transfer: 'Transfer'}[row.type];
                }},
                {key: 'partName', label: 'Part ID'},
                {key: 'quantity', label: 'Quantity', num: true},
                {key: 'unit', label: 'U/M'}].concat(transfer ? [
                    {key: 'locationName', label: 'From Location'},
                    {key: 'toName', label: 'To Location'}] : [
                    {key: 'locationName', label: 'Location ID'}]).concat([
                {key: 'reasonName', label: 'Reason Code'},
                {key: 'lot', label: 'Tracking Number'}]).concat(transfer ?
                    [] : [{key: 'accountName', label: 'Account'},
                        {key: 'material', label: 'Material', money: true}]);
            var tableNode = dataTable(columns, pending, {
                empty: 'Enter a line above and click ' + (transfer ?
                    'New Transfer.' : 'New Adjustment.'),
                ondblclick: function (row) {
                    edit(pending.indexOf(row));
                }});
            Array.prototype.forEach.call(tableNode.querySelectorAll(
                'tbody tr'), function (tr, i) {
                    if (!pending[i]) {
                        return;
                    }
                    tr.classList.add('nl-inv-pending');
                    tr.tabIndex = 0;
                    tr.addEventListener('click', function () {
                        edit(i);
                    });
                    tr.addEventListener('keydown', function (event) {
                        if (event.key === 'Delete') {
                            event.preventDefault();
                            pending.splice(i, 1);
                            if (editing === i) {
                                editing = null;
                            }
                            renderTable();
                        }
                    });
                });
            UI.clear(tableBox).appendChild(el('h3', 'Lines to save'));
            tableBox.appendChild(tableNode);
            tableBox.appendChild(el('p.nl-inv-hint', 'Click a line to ' +
                'change it, Del removes it. Nothing is saved until Save: a ' +
                'saved ' + (transfer ? 'transfer' : 'adjustment') + ' is ' +
                'corrected by the inverse one.'));
        }

        function history() {
            Rpc.desk('adjustments_history', [transfer ? 'transfer' :
                'adjustment', 50]).then(function (rows) {
                    UI.clear(historyBox).appendChild(el('h3', transfer ?
                        'Last transfers' : 'Last adjustments'));
                    historyBox.appendChild(dataTable([
                        {key: 'entry', label: 'Entry No', num: true},
                        {key: 'date', label: 'Date', date: true},
                        {key: 'type', label: 'Type'},
                        {key: 'part', label: 'Part ID'},
                        {key: 'description', label: 'Part Description'},
                        {key: 'quantity', label: 'Quantity', num: true},
                        {key: 'unit', label: 'U/M'}].concat(transfer ? [
                            {key: 'from', label: 'From Location'},
                            {key: 'to', label: 'To Location'}] : [
                            {key: 'location', label: 'Location ID'},
                            {key: 'account', label: 'Account'},
                            {key: 'cost', label: 'Unit Cost', money: true}])
                        .concat([{key: 'reason', label: 'Reason Code'},
                            {key: 'lot', label: 'Tracking Number'}]), rows, {
                                ondblclick: function (row) {
                                    UI.openRecord('stock.move', row.entry,
                                        row.part);
                                }}));
                }, failed);
        }

        function save() {
            if (!pending.length) {
                /* The line being entered is saved too, as in Jobshop */
                if (part && quantity.value) {
                    add();
                }
                if (!pending.length) {
                    UI.toast('Nothing to save');
                    return;
                }
            }
            Rpc.desk(transfer ? 'transfers_post' : 'adjustments_post', [{
                lines: pending.map(function (l) {
                    var line = {};
                    Object.keys(l).forEach(function (k) {
                        if (!/Name$/.test(k) && k !== 'unit') {
                            line[k] = l[k];
                        }
                    });
                    return line;
                })}]).then(function (result) {
                    UI.toast(result.length + (transfer ? ' transfer(s)' :
                        ' adjustment(s)') + ' saved', 'ok');
                    pending = [];
                    clearEntry();
                    showStock();
                    history();
                }, failed);
        }

        var form = el('div.grid-form',
            transfer ? null : field('Type', type),
            field('Date', date),
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Part ID'), partPick.node),
            field(transfer ? 'Location ID (from)' : 'Location ID', location),
            field('On Hand (location)', onHand),
            field(transfer ? 'Qty. Avail. to Transfer (all locations)' :
                'Available (all locations)', available),
            field(transfer ? 'Transfer Qty' : 'Quantity', el('span',
                quantity, ' ', unit)),
            field('Tracking No', el('span', lot, lots)),
            field('Reason Code', reason),
            transfer ? field('Transfer To: Location ID', toLocation) :
                (account ? field('Adj Account ID', account) : null));
        var costBox = transfer ? null : el('fieldset', el('legend',
            'Unit Cost (Adjust In)'), el('div.grid-form',
            field('Material', costs.material), field('Labor', costs.labor),
            field('Burden', costs.burden), field('Service', costs.service)));
        type.addEventListener('change', function () {
            if (costBox) {
                costBox.hidden = type.value !== 'in';
            }
        });
        var node = el('div', form, costBox, el('div.toolbar',
            el('button', {type: 'button', onclick: add}, transfer ?
                'New Transfer' : 'New Adjustment'),
            el('button', {type: 'button', onclick: clearEntry}, 'Clear')),
            tableBox, historyBox);
        renderTable();
        history();
        return {node: node, save: save};
    }

    /* The Physical Count tab: filters, the count table, Save (keep the
     * counts) and Adjust (post them) */
    function countTab(setup, active) {
        var rows = [];
        function range(label) {
            var on = el('input', {type: 'checkbox', 'aria-label': label});
            var from = el('input', {type: 'text', 'aria-label': label +
                ' From', placeholder: 'From'});
            var to = el('input', {type: 'text', 'aria-label': label +
                ' To', placeholder: 'To'});
            return {on: on, from: from, to: to, node: [el('label', on, ' ' +
                label), from, to]};
        }
        var locationRange = range('Location ID');
        var partRange = range('Part ID');
        var productRange = range('Product Code');
        var commodityRange = range('Commodity Code');
        var activeChoice = el('select', {'aria-label': 'Parts'},
            el('option', {value: 'active'}, 'Active Parts Only'),
            el('option', {value: 'inactive'}, 'Inactive Parts Only'),
            el('option', {value: 'both'}, 'Both'));
        var method = el('select', {'aria-label': 'Adjustment Type'},
            el('option', {value: 'over'}, 'Adjust Out Over Quantity at ' +
                'FIFO Cost, Adjust In at Value'),
            el('option', {value: 'revalue'}, 'Adjust Out On Hand Quantity ' +
                'at FIFO Cost, Adjust In at Value'));
        var reason = UI.picker('nline.reason_code', {label: 'Reason Code',
            placeholder: 'Reason Code'});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var tableBox = el('div');

        function filters() {
            var f = {active: activeChoice.value};
            [['location', locationRange], ['part', partRange],
                ['product_code', productRange],
                ['commodity_code', commodityRange]].forEach(function (r) {
                    if (r[1].on.checked) {
                        f[r[0] + '_from'] = r[1].from.value.trim() || null;
                        f[r[0] + '_to'] = r[1].to.value.trim() || null;
                    }
                });
            return f;
        }

        function load(keepCounts) {
            Rpc.desk('count_sheet', [filters()]).then(function (data) {
                if (keepCounts) {
                    var old = {};
                    rows.forEach(function (r) {
                        old[r.location + '/' + r.product + '/' + r.lot] = r;
                    });
                    data.forEach(function (r) {
                        var o = old[r.location + '/' + r.product + '/' +
                            r.lot];
                        if (o && o.adjust) {
                            r.count = o.count;
                            r.adjust = true;
                        }
                    });
                }
                rows = data;
                render();
            }, failed);
        }

        function render() {
            var body = el('tbody');
            rows.forEach(function (row) {
                var box = el('input', {type: 'checkbox', 'aria-label':
                    'Adjust', checked: Boolean(row.adjust), onchange:
                        function () {
                            row.adjust = box.checked;
                        }});
                var count = el('input.money', {type: 'text', inputmode:
                    'decimal', 'aria-label': 'Count Qty', value:
                    num(row.count), oninput: function () {
                        row.count = UI.parseMoney(count.value);
                        row.adjust = box.checked = true;
                    }});
                var costCells = ['material', 'labor', 'burden', 'service']
                    .map(function (c) {
                        var input = UI.moneyInput({'aria-label': c});
                        input.value = row[c] === null || row[c] === undefined ?
                            '' : UI.money(row[c]);
                        input.addEventListener('input', function () {
                            row[c] = input.value === '' ? null :
                                UI.parseMoney(input.value);
                            row.adjust = box.checked = true;
                        });
                        return el('td', input);
                    });
                var diff = (row.count || 0) - row.on_hand;
                body.appendChild(el('tr', {onclick: function () {
                    active.part = row.template;
                }}, el('td', box), el('td', row.location_code),
                    el('td', row.inactive ? '✔' : ''), el('td', row.part),
                    el('td', row.description), el('td', row.lot),
                    el('td.num', num(row.on_hand)), el('td', row.unit),
                    el('td', count), el('td.num' + (diff ? '.nl-inv-bad' :
                        ''), diff ? num(diff) : ''), costCells));
            });
            if (!rows.length) {
                body.appendChild(el('tr', el('td', {colspan: 14},
                    'Nothing to count in these filters: Refresh Grid.')));
            }
            UI.clear(tableBox).appendChild(el('div.table-wrap',
                el('table.data', el('thead', el('tr', ['Adjust', 'Location',
                    'Inactive', 'Part ID', 'Description', 'Tracking No',
                    'On Hand Quantity', 'Stock U/M', 'Count Quantity',
                    'Difference', 'Unit Cost Material', 'Unit Cost Labor',
                    'Unit Cost Burden', 'Unit Cost Service'].map(
                        function (h) {
                            return el('th', h);
                        }))), body)));
        }

        function lines() {
            return rows.filter(function (r) {
                return r.adjust;
            }).map(function (r) {
                return {location: r.location, product: r.product, lot:
                    r.lot || null, count: r.count || 0,
                    material: r.material, labor: r.labor,
                    burden: r.burden, service: r.service};
            });
        }

        function post(adjust) {
            var selected = lines();
            if (!selected.length) {
                UI.toast('Tick the lines to ' + (adjust ? 'adjust' :
                    'save'));
                return;
            }
            var go = adjust ? UI.confirm('Adjust', 'Adjust the inventory ' +
                'of ' + selected.length + ' line(s) to their count?') :
                Promise.resolve(true);
            go.then(function (ok) {
                if (!ok) {
                    return;
                }
                Rpc.desk('count_save', [{lines: selected, adjust: adjust,
                    date: date.value || null, reason_code: reason.value(),
                    method: method.value}]).then(function (result) {
                        UI.toast(adjust ? 'Inventory adjusted (' +
                            result.moves + ' change(s))' : 'Counts saved',
                            'ok');
                        load(false);
                    }, failed);
            });
        }

        function zeroCosts() {
            rows.forEach(function (r) {
                if ((r.count || 0) > r.on_hand) {
                    r.material = r.labor = r.burden = r.service = 0;
                }
            });
            render();
        }

        function setAll(value) {
            rows.forEach(function (r) {
                r.adjust = value;
            });
            render();
        }

        var node = el('div',
            el('div.nl-inv-filter', locationRange.node, partRange.node,
                productRange.node, commodityRange.node),
            el('div.toolbar', activeChoice, el('button', {type: 'button',
                onclick: function () {
                    load(false);
                }}, 'Refresh Grid')),
            el('div.grid-form',
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Adjustment Type'), method),
                el('div', el('label.field', 'Reason Code'), reason.node),
                el('div', el('label.field', 'Date'), date)),
            el('div.toolbar',
                el('button', {type: 'button', onclick: zeroCosts},
                    'Zero Adjust In Costs'),
                el('button', {type: 'button', onclick: function () {
                    load(true);
                }}, 'Refresh Count Quantity'),
                el('button', {type: 'button', onclick: function () {
                    var keep = rows;
                    Rpc.desk('count_sheet', [filters()]).then(
                        function (data) {
                            var costs = {};
                            data.forEach(function (d) {
                                costs[d.product] = d;
                            });
                            keep.forEach(function (r) {
                                var d = costs[r.product];
                                if (d) {
                                    r.material = d.material;
                                    r.labor = d.labor;
                                    r.burden = d.burden;
                                    r.service = d.service;
                                }
                            });
                            render();
                        }, failed);
                }}, 'Refresh Costs'),
                el('button', {type: 'button', onclick: function () {
                    setAll(true);
                }}, 'Select All'),
                el('button', {type: 'button', onclick: function () {
                    setAll(false);
                }}, 'UnSelect All'),
                el('span.spacer'),
                el('button', {type: 'button', title: 'Keep the counts ' +
                    'without adjusting', onclick: function () {
                        post(false);
                    }}, 'Save Counts'),
                el('button.primary', {type: 'button', onclick: function () {
                    post(true);
                }}, 'Adjust')),
            tableBox);
        render();
        return {node: node, save: function () {
            post(false);
        }};
    }
}(window));
