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
            'td.nl-inv-nowrap { white-space: nowrap; }' +
            '.nl-inv-browse td:first-child, .nl-inv-browse td:nth-child(8)' +
            ' { white-space: nowrap; }' +
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
    /* An ID column (Work ID, Part ID, Drawing ID, Tracking No...): kept on
     * one line, as Jobshop's grids do */
    function idColumn(c) {
        return c.nowrap || /(^|\s)(ID|No|Number)$/.test(c.label || '');
    }

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
                return el('td' + (c.num || c.money ? '.num' : '') +
                    (idColumn(c) ? '.nl-inv-nowrap' : ''),
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
            UI.openScreen('work-orders/' + id, 'WO ' + number);
        } else if (kind === 'production.bom') {
            UI.openScreen('masters/' + id, number);
        } else if (kind === 'quote') {
            UI.openScreen('quotes/' + id, 'Quote ' + number);
        } else if (kind === 'rfq') {
            UI.openScreen('rfqs/' + id, 'RFQ ' + number);
        }
    }

    /* Which documents the user may open from the dialogs */
    var screensPrm = null;
    function screens() {
        if (!screensPrm) {
            screensPrm = Promise.all(['orders', 'purchase-orders',
                'work-orders', 'masters', 'parts', 'quotes', 'rfqs',
                'customer-window', 'supplier-window'].map(function (r) {
                    return Promise.resolve(UI.screenAllowed(r)).catch(
                        function () {
                            return false;
                        });
                })).then(function (r) {
                    return {sale: r[0], purchase: r[1], production: r[2],
                        'production.bom': r[3], masters: r[3], parts: r[4],
                        quote: r[5], rfq: r[6], customer: r[7],
                        supplier: r[8]};
                });
        }
        return screensPrm;
    }

    /* View > Where Used (PartWhereUsed.txt): the masters and work
     * orders using the part, Include Document Type check boxes */
    function whereUsed(templateId) {
        partDialog('Part Where Used', templateId, function (pane, id) {
            function box(label, checked) {
                var input = el('input', {type: 'checkbox'});
                input.checked = checked;
                return el('label', input, ' ' + label);
            }
            var masters = box('Engineering Master', true);
            var orders = box('Work Order', true);
            var quotes = box('Quote Master', false);
            var result = el('div');
            function load() {
                Promise.all([Rpc.desk('part_where_used', [id,
                    masters.firstChild.checked, orders.firstChild.checked,
                    quotes.firstChild.checked]), screens()]).then(
                    function (r) {
                        UI.clear(result).appendChild(dataTable([
                            {key: 'inactive', label: 'Inactive', bool: true},
                            {key: 'preserved', label: 'Preserved',
                                bool: true},
                            {key: 'created', label: 'Doc Creation Date',
                                date: true},
                            {key: 'type', label: 'Document Type'},
                            {key: 'document', label: 'Document ID'},
                            {key: 'status', label: 'Document Status'},
                            {key: 'part', label: 'Document Part ID'},
                            {key: 'description', label:
                                'Document Description'},
                            {key: 'sub_id', label: 'Sub ID'},
                            {key: 'operation', label: 'Seq No', num: true},
                            {key: 'piece', label: 'Piece No', num: true},
                            {key: 'material_status', label: 'Mat Status'},
                            {key: 'revision', label: 'Eng Rev'},
                            {key: 'material_description', label:
                                'Material Description'},
                            {key: 'quantity', label: 'Qty Per', num: true},
                            {key: 'unit', label: 'Usage U/M'},
                            {key: 'mfg_part_id', label: 'Mfg Part Id'},
                            {key: 'mfg_name', label: 'Mfg Name'},
                            {key: 'drawing', label: 'Drawing ID'},
                            {key: 'drawing_rev', label: 'Drawing Rev'},
                            {key: 'drawing_file', label: 'Drawing File'}],
                            r[0], {ondblclick: function (row) {
                                openDocument(row.model, row.id,
                                    row.document, r[1][row.model]);
                            }, empty: 'The part is not used.'}));
                    }, failed);
            }
            [masters, orders, quotes].forEach(function (b) {
                b.firstChild.addEventListener('change', load);
            });
            pane.appendChild(el('fieldset', el('legend',
                'Include Document Type'), masters, ' ', orders, ' ',
                quotes));
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

    /* View > Supply & Demand: Planning's dialog (the one kept, built on
     * Jobshop's layout; it takes the part's variant), else this one */
    function supplyDemand(templateId) {
        var planning = global.JobshopPlanning;
        if (planning && planning.supplyDemand) {
            if (!templateId) {
                planning.supplyDemand(null);
                return;
            }
            Rpc.model('product.template', 'read', [[templateId],
                ['products']]).then(function (rows) {
                    var products = rows[0] ? rows[0].products : [];
                    planning.supplyDemand(products.length ? products[0] :
                        null);
                }, failed);
            return;
        }
        ownSupplyDemand(templateId);
    }

    /* The fallback when the planning screens are not loaded */
    function ownSupplyDemand(templateId) {
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

    /* Material Availability of a work order (N-LineAvailability.txt,
     * N-Line's own layout of Jobshop's dialog): Release Date, Refresh,
     * the materials of the order and its legs (Level No) */
    function workOrderAvailability(productionId) {
        var release = el('input', {type: 'date', 'aria-label':
            'Release Date'});
        var box = el('div');
        var title = el('span');
        function load() {
            Rpc.desk('wo_material_availability', [productionId,
                release.value || null, true]).then(function (data) {
                    if (!release.value && data.release_date) {
                        release.value = String(data.release_date).slice(0, 10);
                    }
                    title.textContent = 'Material Availability for ' +
                        data.work_order + ' ' + data.part;
                    UI.clear(box).appendChild(dataTable([
                        {key: 'level', label: 'Level No', num: true},
                        {key: 'part_code', label: 'Part ID'},
                        {key: 'sub_id', label: 'Sub ID'},
                        {key: 'operation', label: 'Seq No', num: true},
                        {key: 'piece', label: 'Piece No', num: true},
                        {key: 'eng_master', label: 'Eng Master Revision'},
                        {key: 'description', label: 'Description'},
                        {key: 'status', label: 'Material Status'},
                        {key: 'required_date', label: 'Schedule Req\'d Date',
                            date: true},
                        {key: 'order_plan', label: 'Order Plan'},
                        {key: 'work_order', label: 'Work Order'},
                        {key: 'required', label: 'Qty Req\'d', num: true},
                        {key: 'issued', label: 'Qty Issued', num: true},
                        {key: 'due', label: 'Qty Due', num: true},
                        {key: 'projected', label: 'Projected Available',
                            num: true},
                        {key: 'short', label: '(Proj - Qty Due)', render:
                            function (row) {
                                return el('span' + (row.short < 0 ?
                                    '.nl-inv-bad' : ''), num(row.short));
                            }},
                        {key: 'lead_time', label: 'Lead Time', num: true},
                        {key: 'product_code', label: 'Product Code'},
                        {key: 'commodity_code', label: 'Commodity Code'},
                        {key: 'supplier', label: 'Pref Supplier ID'}],
                        data.rows, {empty: 'No materials.',
                            oncontextmenu: function (event, row) {
                                UI.contextMenu(event, [
                                    {label: 'Open Supply and Demand...',
                                        onclick: function () {
                                            supplyDemand(row.template);
                                        }},
                                    {label: 'Open Part...', onclick:
                                        function () {
                                            UI.openScreen('parts/' +
                                                row.template, row.part_code);
                                        }}]);
                            }}));
                }, failed);
        }
        wideModal('Material Availability', [el('h3', title),
            el('div.toolbar', el('label', 'Release Date ', release),
                el('button', {type: 'button', onclick: load}, 'Refresh')),
            box]);
        load();
    }

    global.JobshopInventory = {
        workOrderAvailability: workOrderAvailability,
        whereUsed: whereUsed,
        inventoryTxs: inventoryTxs,
        inventoryPieces: inventoryPieces,
        supplyDemand: supplyDemand,
        materialAvailability: materialAvailability,
        resetMaterialCosts: resetMaterialCosts
    };

    /* ---- Parts window ---------------------------------------------------- */

    /* The columns of the Part window's document tabs (PartSubTabs.txt) */
    var LINE_COLUMNS = {
        quote: [
            {key: 'number', label: 'Quote ID'},
            {key: 'party', label: 'Customer ID', title: 'party_name'},
            {key: 'date', label: 'Quote Date', date: true},
            {key: 'status', label: 'Quote Status'},
            {key: 'sales_rep', label: 'Sales Rep ID'},
            {key: 'sequence', label: 'Line No', num: true},
            {key: 'quantity', label: 'Quoted Qty', num: true},
            {key: 'unit', label: 'U/M'},
            {key: 'unit_price', label: 'Unit Price', money: true},
            {key: 'discount', label: 'Discount Percent', num: true},
            {key: 'multiple', label: 'Multiple Qtys', bool: true},
            {key: 'customer_part', label: 'Customer Part ID'},
            {key: 'product_code', label: 'Product Code'},
            {key: 'commodity_code', label: 'Commodity Code'},
            {key: 'drawing', label: 'Drawing ID'},
            {key: 'drawing_rev', label: 'Rev'},
            {key: 'eng_master', label: 'Eng Master Revision'}],
        sale: [
            {key: 'linked', label: 'Linked', bool: true},
            {key: 'number', label: 'Sales ID'},
            {key: 'party', label: 'Customer ID', title: 'party_name'},
            {key: 'date', label: 'Order Date', date: true},
            {key: 'status', label: 'Order Status'},
            {key: 'sales_rep', label: 'Sales Rep ID'},
            {key: 'reference', label: 'Customer PO Number'},
            {key: 'po_line', label: 'PO Line No'},
            {key: 'sequence', label: 'Line No', num: true},
            {key: 'line_status', label: 'Line Status'},
            {key: 'desired_date', label: 'Desired Ship Date', date: true},
            {key: 'quantity', label: 'Order Qty', num: true},
            {key: 'shipped', label: 'Shipped Qty', num: true},
            {key: 'unit', label: 'U/M'},
            {key: 'unit_price', label: 'Unit Price', money: true},
            {key: 'discount', label: 'Discount Percent', num: true},
            {key: 'amount', label: 'Order Amount', money: true},
            {key: 'shipped_amount', label: 'Shipped Amount', money: true},
            {key: 'last_shipped', label: 'Last Shipped Date', date: true},
            {key: 'customer_part', label: 'Customer Part ID'},
            {key: 'product_code', label: 'Product Code'},
            {key: 'commodity_code', label: 'Commodity Code'},
            {key: 'drawing', label: 'Drawing ID'},
            {key: 'drawing_rev', label: 'Rev'},
            {key: 'eng_master', label: 'Eng Master Revision'}],
        rfq: [
            {key: 'number', label: 'RFQ ID'},
            {key: 'date', label: 'RFQ Date', date: true},
            {key: 'status', label: 'RFQ Status'},
            {key: 'sequence', label: 'Line No', num: true},
            {key: 'quantity', label: 'Quote Qty', num: true},
            {key: 'unit', label: 'Purchase U/M'}].concat([1, 2, 3].map(
            function (n) {
                return [
                    {key: 'supplier_' + n, label: 'Supplier ID (' + n + ')'},
                    {key: 'unit_price_' + n, label: 'Unit Price (' + n + ')',
                        money: true},
                    {key: 'trade_discount_' + n, label: 'Disc Percent (' + n +
                        ')', num: true},
                    {key: 'delivery_date_' + n, label: 'Delivery Date (' + n +
                        ')', date: true},
                    {key: 'lead_time_' + n, label: 'Lead Time (days) (' + n +
                        ')', num: true}];
            }).reduce(function (a, b) {
                return a.concat(b);
            }, [])).concat([
            {key: 'multiple', label: 'Multiple Qtys', bool: true},
            {key: 'product_code', label: 'Product Code'},
            {key: 'commodity_code', label: 'Commodity Code'}]),
        purchase: [
            {key: 'linked', label: 'Linked', bool: true},
            {key: 'number', label: 'Purchase ID'},
            {key: 'party', label: 'Supplier ID', title: 'party_name'},
            {key: 'date', label: 'Order Date', date: true},
            {key: 'status', label: 'Order Status'},
            {key: 'buyer', label: 'Buyer'},
            {key: 'sequence', label: 'Line No', num: true},
            {key: 'line_status', label: 'Line Status'},
            {key: 'desired_date', label: 'Desired Receive Date', date: true},
            {key: 'quantity', label: 'Order Qty', num: true},
            {key: 'received', label: 'Received Qty', num: true},
            {key: 'unit', label: 'U/M'},
            {key: 'unit_price', label: 'Unit Price', money: true},
            {key: 'discount', label: 'Discount Percent', num: true},
            {key: 'fixed_charge', label: 'Fixed Charge', money: true},
            {key: 'amount', label: 'Order Amount', money: true},
            {key: 'received_amount', label: 'Received Amount', money: true},
            {key: 'last_received', label: 'Last Recv Date', date: true},
            {key: 'promise_date', label: 'Promise Date', date: true},
            {key: 'drawing', label: 'Drawing ID'},
            {key: 'drawing_rev', label: 'Rev'},
            {key: 'supplier_part', label: 'Supplier Part ID'},
            {key: 'mfg_name', label: 'Mfg Name'},
            {key: 'mfg_part_id', label: 'Mfg Part ID'},
            {key: 'product_code', label: 'Product Code'},
            {key: 'commodity_code', label: 'Commodity Code'}],
        production: [
            {key: 'number', label: 'Work ID'},
            {key: 'lot', label: 'Lot ID'},
            {key: 'split', label: 'Split ID'},
            {key: 'description', label: 'Description'},
            {key: 'date', label: 'Desired Want Date', date: true},
            {key: 'release_date', label: 'Desired Release Date', date: true},
            {key: 'status', label: 'Order Status'},
            {key: 'quantity', label: 'Desired Qty', num: true},
            {key: 'received', label: 'Received Qty', num: true},
            {key: 'unit_cost', label: 'Total Unit Cost', money: true},
            {key: 'start', label: 'Schedule Start Date', date: true},
            {key: 'finish', label: 'Schedule Finish Date', date: true},
            {key: 'drawing', label: 'Drawing ID'},
            {key: 'drawing_rev', label: 'Rev'},
            {key: 'eng_master', label: 'Eng Master Revision'}]
    };

    /* Jobshop's statuses of each document (the tabs' status menus) and
     * the ones shown when the window opens */
    var DOC_SETUP = {
        quote: {statuses: [['active', 'Active'], ['ready', 'Ready'],
            ['won', 'Won'], ['lost', 'Lost'], ['cancelled', 'Cancelled']],
            default: ['active'], model: 'nline.quote.line'},
        sale: {statuses: [['unreleased', 'Unreleased'], ['firm', 'Firm'],
            ['released', 'Released'], ['closed', 'Closed'], ['hold', 'Hold'],
            ['cancelled', 'Cancelled']], default: ['released'],
            model: 'sale.line'},
        rfq: {statuses: [['unreleased', 'Unreleased'], ['active', 'Active'],
            ['closed', 'Closed'], ['cancelled', 'Cancelled']],
            default: ['unreleased', 'active'], model: 'nline.rfq.line'},
        purchase: {statuses: [['unreleased', 'Unreleased'],
            ['unapproved', 'Unapproved'], ['firm', 'Firm'],
            ['released', 'Released'], ['closed', 'Closed'], ['hold', 'Hold'],
            ['cancelled', 'Cancelled']], default: ['released'],
            model: 'purchase.line'},
        production: {statuses: [['unreleased', 'Unreleased'],
            ['firm', 'Firm'], ['released', 'Released'], ['closed', 'Closed'],
            ['hold', 'Hold'], ['cancelled', 'Cancelled']],
            default: ['released'], model: 'production'}
    };

    /* The right-click "View All ... by Status of" of each tab (Jobshop's
     * popups) and the Tools item that opens the document */
    var LINE_MENUS = {
        quote: {view: 'View All Quote Lines for Part by Quote Status of',
            open: 'Open Quote...', screen: 'quote'},
        sale: {view: 'View All Order Lines for Part by Order Status of',
            open: 'Open Sales Order...', screen: 'sale'},
        rfq: {view: 'View All RFQ Lines for Part by RFQ Status of',
            open: 'Open Request For Quote...', screen: 'rfq'},
        purchase: {view: 'View All PO Lines for Part by Order Status of',
            open: 'Open Purchase Order...', screen: 'purchase'},
        production: {view: 'Work Orders by Status of',
            open: 'Open Work Order...', screen: 'production'}
    };

    /* A tab of the part's documents: Jobshop's grid, the right-click menu
     * choosing the status shown (one status or All) and opening the
     * document; double-click opens it too */
    function linesTab(kind, setup, allowed) {
        var statuses = setup.default.slice();
        var menu = LINE_MENUS[kind];
        return function render(pane, record) {
            var shown = el('span.muted');
            var selected = null;
            function open(row) {
                if (row && allowed[menu.screen]) {
                    openDocument(menu.screen, row.id, row.number, true);
                }
            }
            function contextMenu(event, row) {
                if (row) {
                    selected = row;
                }
                var items = [{label: menu.view, items: [{label: 'All',
                    checked: statuses[0] === 'all', onclick: function () {
                        statuses = ['all'];
                        load();
                    }}].concat(setup.statuses.map(function (s) {
                        return {label: s[1], checked: statuses.indexOf(
                            s[0]) >= 0, onclick: function () {
                                statuses = [s[0]];
                                load();
                            }};
                    }))}];
                if (allowed[menu.screen]) {
                    items.push('-', {label: menu.open, disabled: !selected,
                        onclick: function () {
                            open(selected);
                        }});
                }
                UI.contextMenu(event, items);
            }
            var box = el('div');
            function load() {
                shown.textContent = 'Showing: ' + (statuses[0] === 'all' ?
                    'All' : setup.statuses.filter(function (s) {
                        return statuses.indexOf(s[0]) >= 0;
                    }).map(function (s) {
                        return s[1];
                    }).join(', ')) + ' (right-click to change)';
                Rpc.desk('part_orders', [record.id, kind, statuses]).then(
                    function (rows) {
                        var table = dataTable(LINE_COLUMNS[kind], rows, {
                            ondblclick: allowed[menu.screen] ? open : null,
                            oncontextmenu: contextMenu,
                            empty: 'No lines in this status.'});
                        Array.prototype.forEach.call(table.querySelectorAll(
                            'tbody tr'), function (tr, i) {
                                tr.addEventListener('click', function () {
                                    selected = rows[i];
                                    Array.prototype.forEach.call(
                                        tr.parentNode.children, function (t) {
                                            t.classList.toggle('selected',
                                                t === tr);
                                        });
                                });
                            });
                        table.addEventListener('contextmenu', function (e) {
                            if (!e.defaultPrevented) {
                                contextMenu(e, null);
                            }
                        });
                        UI.clear(box).appendChild(table);
                    }, failed);
            }
            pane.appendChild(el('div.toolbar', shown));
            pane.appendChild(box);
            load();
        };
    }

    function breakColumns(head) {
        var columns = head.slice();
        for (var i = 1; i <= 10; i++) {
            columns.push({key: 'qty_' + i, label: 'Quantity Break ' + i,
                num: true}, {key: 'price_' + i, label: 'Unit Price ' + i,
                    money: true});
        }
        columns.push({key: 'default_price', label: 'Default Unit Price',
            money: true});
        return columns;
    }

    var PRICE_COLUMNS = {
        supplier: breakColumns([
            {key: 'party', label: 'Supplier ID'},
            {key: 'party_name', label: 'Name'},
            {key: 'code', label: 'Supplier Part ID'},
            {key: 'mfg_name', label: 'Mfg Name'},
            {key: 'mfg_part_id', label: 'Mfg Part ID'},
            {key: 'unit', label: 'Purchase UM'},
            {key: 'quote_type', label: 'Quote Type'},
            {key: 'quote_date', label: 'Quote Date', date: true},
            {key: 'expires', label: 'Quote Expires', date: true}]),
        service: breakColumns([
            {key: 'party', label: 'Supplier ID'},
            {key: 'party_name', label: 'Name'},
            {key: 'service', label: 'Service ID'},
            {key: 'code', label: 'Supplier Service ID'},
            {key: 'quote_type', label: 'Quote Type'},
            {key: 'quote_date', label: 'Quote Date', date: true},
            {key: 'expires', label: 'Quote Expires', date: true}]),
        customer: breakColumns([
            {key: 'party', label: 'Customer ID'},
            {key: 'party_name', label: 'Name'},
            {key: 'customer_part', label: 'Customer Part ID'},
            {key: 'unit', label: 'Selling UM'},
            {key: 'eng_master', label: 'Eng Master Revision'},
            {key: 'quote_type', label: 'Quote Type'},
            {key: 'quote_date', label: 'Quote Date', date: true},
            {key: 'expires', label: 'Quote Expires', date: true}]),
        discount: breakColumns([
            {key: 'party', label: 'Discount Class ID'},
            {key: 'party_name', label: 'Description'},
            {key: 'unit', label: 'Selling UM'},
            {key: 'quote_type', label: 'Quote Type'},
            {key: 'expires', label: 'Quote Expires', date: true}])
    };

    /* A pricing tab; right-click: Open Supplier... / Open Customer...
     * (PopupInventoryPartPrices) */
    function pricesTab(kind, allowed) {
        return function (pane, record) {
            Rpc.desk('part_prices', [record.id, kind]).then(function (rows) {
                var screen = kind === 'customer' ? 'customer' : kind ===
                    'discount' ? null : 'supplier';
                function open(row) {
                    if (screen && allowed[screen]) {
                        UI.openScreen((screen === 'customer' ?
                            'customer-window/' : 'supplier-window/') +
                            row.party_id, row.party_name);
                    }
                }
                pane.appendChild(dataTable(PRICE_COLUMNS[kind], rows, {
                    ondblclick: screen && allowed[screen] ? open : null,
                    oncontextmenu: screen && allowed[screen] ? function (
                            event, row) {
                        UI.contextMenu(event, [{label: screen === 'customer' ?
                            'Open Customer...' : 'Open Supplier...',
                            onclick: function () {
                                open(row);
                            }}]);
                    } : null,
                    empty: 'No prices for this part.'}));
            }, failed);
        };
    }

    /* Tracking Info: the tracking numbers on hand by location */
    function trackingTab(pane, record) {
        var all = el('input', {type: 'checkbox', 'aria-label': 'Show All'});
        var box = el('div');
        function load() {
            Rpc.desk('part_tracking', [record.id, all.checked]).then(
                function (rows) {
                    UI.clear(box).appendChild(dataTable([
                        {key: 'location', label: 'Location ID'},
                        {key: 'lot', label: 'Tracking No'},
                        {key: 'date', label: 'Tracking Date', date: true},
                        {key: 'quantity', label: 'Qty On Hand', num: true}],
                        rows, {empty: 'No tracking numbers on hand.'}));
                }, failed);
        }
        all.addEventListener('change', load);
        pane.appendChild(el('div.toolbar', el('label', all, ' Show All')));
        pane.appendChild(box);
        load();
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
        {name: 'inactive', label: 'Inactive', type: 'boolean'},
        {name: 'location', label: 'Location ID', type: 'many2one',
            model: 'stock.location', domain: [['type', '=', 'storage']]},
        {name: 'location_name', label: 'Description', type: 'char',
            readonly: true},
        {name: 'quantity', label: 'Qty On Hand', type: 'float',
            readonly: true},
        {name: 'primary', label: 'Primary', type: 'boolean',
            readonly: true},
        {name: 'issue_from', label: 'Issue From', type: 'boolean',
            readonly: true},
        {name: 'hold', label: 'Hold', type: 'boolean'},
        {name: 'last_counted', label: 'Last Counted On', type: 'date',
            readonly: true}];

    var CONVERSION_FIELDS = [
        {name: 'from_uom', label: 'From Unit ID', type: 'many2one',
            model: 'product.uom'},
        {name: 'from_name', label: 'From Unit Description', type: 'char',
            readonly: true},
        {name: 'to_uom', label: 'To Unit ID', type: 'many2one',
            model: 'product.uom'},
        {name: 'to_name', label: 'To Unit Description', type: 'char',
            readonly: true},
        {name: 'factor', label: 'Conversion', type: 'float'}];

    var STORAGE = [['type', '=', 'storage']];

    /* Jobshop's "!" button: open the file or link a field holds */
    function openLink(path) {
        path = (path || '').trim();
        if (!path) {
            UI.toast('No file to open.');
            return;
        }
        var link = /^[a-z]+:\/\//i.test(path) ? path : 'file:///' +
            path.replace(/\\/g, '/');
        UI.modal('Open File', [el('p', el('a', {href: link, target: '_blank',
            rel: 'noopener'}, path)), el('p.nl-inv-hint', 'A browser opens ' +
            'files of the network drives only when allowed; copy the path ' +
            'to open it in Explorer otherwise.')]);
    }

    /* The Part tab (Part.txt): the part's header, shown above the sub tabs
     * as in Jobshop */
    function partHeader(access) {
        return {title: 'Part', frames: [
            {label: 'Settings', at: [497, 0, 623, 183]},
            {label: 'Unit Costs (Stk UM)', at: [628, 0, 847, 183]}],
            fields: [
                {name: 'inactive', label: 'Inactive', type: 'boolean',
                    default: false, at: [423, 6, 495, 26]},
                {name: 'name', label: 'Description', type: 'char',
                    at: [6, 28, 489, 48], split: 135},
                {name: 'default_uom', label: 'Stock U/M', type: 'many2one',
                    model: 'product.uom', at: [6, 50, 259, 70], split: 135},
                {name: 'primary_location', label: 'Primary Loc ID',
                    type: 'many2one', model: 'stock.location', domain:
                    STORAGE, at: [6, 72, 259, 92], split: 135},
                {name: 'issue_from_location', label: 'Issue From Loc ID',
                    type: 'many2one', model: 'stock.location', domain:
                    STORAGE, at: [6, 94, 259, 114], split: 135},
                {name: 'sale_uom', label: 'Selling U/M', type: 'many2one',
                    model: 'product.uom', at: [274, 50, 488, 70],
                    split: 100},
                {name: 'purchase_uom', label: 'Purchase U/M',
                    type: 'many2one', model: 'product.uom',
                    at: [274, 72, 488, 92], split: 100},
                {name: 'usage_uom', label: 'Usage U/M', type: 'many2one',
                    model: 'product.uom', at: [274, 94, 488, 114],
                    split: 100},
                {name: 'engineering_revision', label: 'Eng Master Revision',
                    type: 'char', at: [6, 120, 275, 140], split: 135},
                {name: 'account_category', label: 'Account Set ID',
                    type: 'many2one', model: 'product.category',
                    domain: [['accounting', '=', true]],
                    readonly: !can(access, 'product.template', 'write'),
                    at: [6, 147, 275, 167], split: 135},
                {name: 'account_set_description', label: '', type: 'char',
                    readonly: true, at: [277, 147, 485, 167], split: 0},
                {name: 'expense_account_code', label: 'Expense Acct ID',
                    type: 'char', readonly: true, at: [6, 169, 275, 189],
                    split: 135},
                {name: 'expense_account_description', label: '',
                    type: 'char', readonly: true, at: [277, 169, 486, 189],
                    split: 0},
                {name: 'quantity_on_hand', label: 'Quantity on Hand',
                    type: 'float', readonly: true, at: [6, 191, 275, 211],
                    split: 135},
                {name: 'quantity_on_hold', label: 'Quantity on Hold',
                    type: 'float', readonly: true, at: [283, 191, 488, 211],
                    split: 91},
                {name: 'producible', label: 'Fabricated', type: 'boolean',
                    at: [507, 15, 608, 33]},
                {name: 'purchasable', label: 'Purchased', type: 'boolean',
                    at: [507, 34, 608, 52]},
                {name: 'stocked', label: 'Stocked', type: 'boolean',
                    at: [507, 52, 608, 70]},
                {name: 'tool_or_fixture', label: 'Tool/Fixture',
                    type: 'boolean', at: [507, 72, 608, 90]},
                {name: 'lot_tracked', label: 'Lot/Serial Tracked',
                    type: 'boolean', at: [507, 91, 616, 109]},
                {name: 'date_tracked', label: 'Date Tracked',
                    type: 'boolean', at: [522, 108, 611, 126]},
                {name: 'auto_issue', label: 'Auto Issue', type: 'boolean',
                    at: [507, 126, 608, 144]},
                {name: 'consumable', label: 'R+D/Consumable',
                    type: 'boolean', at: [507, 147, 613, 165]},
                {name: 'commissionable', label: 'Commissionable',
                    type: 'boolean', default: true, at: [507, 165, 608, 183]},
                {name: 'unit_material_cost', label: 'Material',
                    type: 'money', at: [633, 15, 826, 35], split: 100},
                {name: 'unit_labor_cost', label: 'Labor', type: 'money',
                    at: [633, 37, 826, 57], split: 100},
                {name: 'unit_burden_cost', label: 'Burden', type: 'money',
                    at: [633, 59, 826, 79], split: 100},
                {name: 'unit_service_cost', label: 'Service', type: 'money',
                    at: [633, 81, 826, 101], split: 100},
                {name: 'fixed_cost', label: 'Fixed Cost', type: 'money',
                    at: [633, 103, 826, 123], split: 100},
                {name: 'unit_cost', label: 'Unit Cost', type: 'money',
                    readonly: true, at: [633, 125, 826, 145], split: 100},
                {name: 'preserve_unit_costs', label: 'Preserve Unit Costs',
                    type: 'boolean', at: [633, 147, 745, 163]},
                {name: 'update_costs_from_po', label: 'Update on Receipt',
                    type: 'selection', options: [['system',
                        'System Setting'], ['always', 'Always'],
                        ['ask', 'Ask'], ['never', 'Never']],
                    default: 'system', at: [634, 165, 843, 185], split: 100},
                {name: 'preserve_unit_price', label: 'Preserve Unit Price',
                    type: 'boolean', at: [507, 191, 626, 211]},
                {name: 'list_price', label: 'Unit Price (Stk UM)',
                    type: 'money', at: [634, 191, 841, 211], split: 100}],
            buttons: []};
    }

    /* The General tab (PartSubTabs.txt GENERAL); the fields Tryton needs
     * that Jobshop has not follow below the layout */
    function generalTab(access) {
        var suppliers = [];
        var writeSuppliers = can(access, 'purchase.product_supplier',
            'create');
        [1, 2, 3, 4, 5].forEach(function (n) {
            var left = n <= 3 ? 21 : 421;
            var top = 282 + 22 * ((n - 1) % 3);
            suppliers.push({name: n === 1 ? 'preferred_supplier' :
                'preferred_supplier_' + n, label: 'Supplier ID ' + n,
                type: 'many2one', model: 'party.party', readonly:
                !writeSuppliers, at: [left, top, left + 220, top + 20],
                split: 111}, {name: 'supplier_name_' + n, label: '',
                type: 'char', readonly: true, split: 0, at: [left + 222,
                    top, left + (n <= 3 ? 390 : 392), top + 20]});
        });
        return {title: 'General', frames: [
            {label: 'Planning (All Quantities in Stock UM)',
                at: [9, 142, 820, 206]},
            {label: 'Piece Tracking', at: [10, 210, 821, 254]},
            {label: 'Preferred Suppliers', at: [10, 262, 821, 355]}],
            fields: [
                {name: 'record_created', label: 'Created by', type: 'char',
                    readonly: true, at: [11, 5, 358, 25]},
                {name: 'record_modified', label: 'Last Modified by',
                    type: 'char', readonly: true, at: [386, 5, 801, 25]},
                {name: 'drawing_number', label: 'Drawing ID/Rev',
                    type: 'char', at: [11, 27, 272, 46]},
                {name: 'drawing_revision', label: '/', type: 'char',
                    at: [278, 26, 357, 46], split: 10},
                {name: 'drawing_file', label: 'Drawing File', type: 'char',
                    at: [386, 27, 801, 47]},
                {name: 'mfg_name', label: 'Manufacturer', type: 'char',
                    at: [11, 48, 357, 68]},
                {name: 'mfg_part_id', label: 'Manufacturer\'s Part ID',
                    type: 'char', at: [386, 49, 801, 69]},
                {name: 'product_code', label: 'Product Code ID',
                    type: 'many2one', model: 'nline.product_code',
                    at: [11, 70, 357, 90]},
                {name: 'commodity_code', label: 'Commodity Code ID',
                    type: 'many2one', model: 'nline.commodity_code',
                    at: [386, 71, 801, 91]},
                {name: 'weight_uom', label: 'Weight U/M', type: 'many2one',
                    model: 'product.uom', at: [11, 92, 272, 112]},
                {name: 'weight', label: 'Net Weight', type: 'float',
                    at: [280, 92, 478, 112], split: 84},
                {name: 'ship_dimensions', label: 'Ship Dimensions',
                    type: 'char', at: [11, 114, 800, 134]},
                {name: 'lead_time_days', label: 'Leadtime (days)',
                    type: 'integer', at: [21, 160, 150, 180], split: 87},
                {name: 'safety_stock', label: 'Safety Stock Qty',
                    type: 'float', default: 0, at: [164, 160, 361, 180],
                    split: 106},
                {name: 'order_point', label: 'Order Point Qty',
                    type: 'float', at: [370, 160, 569, 180], split: 113},
                {name: 'maximum_stock_qty', label: 'Restocking Level',
                    type: 'float', at: [577, 160, 801, 180], split: 115},
                {name: 'minimum_order_qty', label: 'Minimum Order Qty',
                    type: 'float', default: 1, at: [164, 182, 361, 202],
                    split: 106},
                {name: 'multiple_order_qty', label: 'Order In Multiples Of',
                    type: 'float', default: 1, at: [370, 182, 569, 202],
                    split: 113},
                {name: 'maximum_order_qty', label: 'Maximum Order Qty',
                    type: 'float', at: [577, 182, 801, 202], split: 115},
                {name: 'piece_tracked', label: 'Part is Piece Tracked',
                    type: 'boolean', at: [22, 229, 154, 247]},
                {name: 'length_required', label: 'Length', type: 'boolean',
                    at: [156, 229, 232, 249]},
                {name: 'width_required', label: 'Width', type: 'boolean',
                    at: [234, 229, 310, 249]},
                {name: 'height_required', label: 'Height', type: 'boolean',
                    at: [312, 229, 382, 249]},
                {name: 'dimensions_uom', label: 'Dimensions U/M',
                    type: 'many2one', model: 'product.uom',
                    at: [386, 229, 606, 249]},
                {name: 'dimensions_uom_description', label: '',
                    type: 'char', readonly: true, split: 0,
                    at: [609, 229, 810, 249]}
            ].concat(suppliers).concat([
                /* Not in Jobshop: what Tryton needs of a part */
                {name: 'type', label: 'Type (ERP)', type: 'selection',
                    options: [['goods', 'Goods (stocked)'],
                        ['assets', 'Assets'], ['service', 'Service']],
                    default: 'goods'},
                {name: 'salable', label: 'Sold (ERP)', type: 'boolean'},
                {name: 'cost_price_method', label: 'Cost Method (ERP)',
                    type: 'selection', options: [['fixed', 'Fixed'],
                        ['average', 'Average'], ['fifo', 'FIFO']],
                    default: 'average'},
                {name: 'cost_price', label: 'Inventory Cost (average)',
                    type: 'money', readonly: true}]),
            buttons: [{label: '!', at: [801, 26, 821, 47], onclick:
                function () {
                    var input = document.querySelector(
                        'input[aria-label="Drawing File"]');
                    openLink(input && input.value);
                }}]};
    }

    /* The Other tab: Jobshop's user fields; those without a label in the
     * System Settings are disabled, as in Jobshop */
    function otherTab(count) {
        var fields = [], buttons = [];
        for (var n = 0; n < count; n++) {
            otherField(fields, buttons, n);
        }
        return {title: 'Other', fields: fields, buttons: buttons};
    }

    /* (labels: applyUserLabels once the System Settings are read) */
    function otherField(fields, buttons, n) {
        var label = 'User ' + n;
        var top = 1 + 21 * n;
        fields.push({name: 'user_' + n, label: label, type: 'char',
            readonly: true, at: [18, top, 387, top + 20], split: 130});
            buttons.push({label: '!', at: [387, top, 407, top + 20],
                onclick: function () {
                    var input = document.querySelector('input[aria-label="' +
                        label.replace(/"/g, '\\"') + '"]');
                    openLink(input && input.value);
                }});
    }

    /* Jobshop's user field captions (System Settings); a field without
     * one stays disabled, as in Jobshop */
    function applyUserLabels(main, tab, labels) {
        tab.fields.forEach(function (f) {
            var n = parseInt(f.name.slice(5), 10);
            var label = labels[n] || f.label;
            f.readonly = /^User \d+$/.test(label);
            var input = main.querySelector('input[aria-label="' + f.label +
                '"]');
            var caption = input && input.parentNode.querySelector(
                '.js-label');
            if (caption) {
                caption.textContent = label;
            }
            if (input) {
                /* (editable like the window's other fields) */
                var other = main.querySelector(
                    'input[aria-label="Description"]');
                input.disabled = f.readonly || Boolean(other &&
                    other.disabled);
                input.readOnly = f.readonly;
            }
        });
    }

    function instructionsTab() {
        var boxes = [
            ['quote_instructions', 'Estimating Quotes', 3, 5],
            ['sales_instructions', 'Sales Orders', 3, 87],
            ['shipping_instructions', 'Shipping', 3, 168],
            ['material_instructions', 'Material Cards', 3, 249],
            ['rfq_instructions', 'Request For Quotes', 416, 5],
            ['purchasing_instructions', 'Purchase Orders', 416, 87],
            ['receiving_instructions', 'Receiving', 416, 168]];
        return {title: 'Spec Instr.', frames: boxes.map(function (b) {
            return {label: b[1], at: [b[2], b[3], b[2] + 395, b[3] + 81]};
        }), fields: boxes.map(function (b) {
            return {name: b[0], label: b[1], type: 'text', split: 0,
                at: [b[2] + (b[2] > 3 ? 12 : 15), b[3] + 18, b[2] + 393,
                    b[3] + 74]};
        })};
    }

    /* Only the fields the server has (a module not yet updated) */
    function existingFields(tabs, names) {
        tabs.forEach(function (tab) {
            if (tab.fields) {
                tab.fields = tab.fields.filter(function (f) {
                    return names[f.name];
                });
            }
            if (tab.lines) {
                tab.lines.fields = tab.lines.fields.filter(function (f) {
                    return !tab.lines.known || tab.lines.known[f.name];
                });
            }
        });
        return tabs;
    }

    Screens.parts = function (main, params) {
        injectStyle();
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var models = ['product.template', 'stock.move', 'sale.line',
            'purchase.line', 'production', 'production.bom',
            'nline.js.part_location', 'nline.js.unit_conversion',
            'purchase.product_supplier', 'nline.quote.line',
            'nline.rfq.line', 'nline.sale_price'];
        /* (the System Settings' labels come after: the window shows
         * first) */
        Promise.all([UI.access(models), null, screens(), null,
            Rpc.model('product.template', 'fields_get', [[]]),
            Rpc.model('nline.js.part_location', 'fields_get', [[]])
                .catch(function () {
                    return {};
                })]).then(function (r) {
                build(r[0], r[1], r[2], r[3], r[4], r[5]);
            }, failed);

        function build(access, setup, allowed, lines, known, knownLoc) {
            var win = null;

            function current() {
                var record = win && win.record();
                return record ? record.id : null;
            }

            /* View / Tools: Jobshop's menus of the Part window */
            function viewItems() {
                var items = [];
                if (can(access, 'stock.move', 'read')) {
                    items.push({label: 'Inventory Txs', onclick: function () {
                        inventoryTxs(current());
                    }});
                }
                if (can(access, 'production.bom', 'read') ||
                        can(access, 'production', 'read')) {
                    items.push({label: 'Where Used...', onclick: function () {
                        whereUsed(current());
                    }});
                }
                if (can(access, 'stock.move', 'read')) {
                    items.push({label: 'Supply and Demand...', onclick:
                        function () {
                            supplyDemand(current());
                        }}, {label: 'Material Availability...', onclick:
                        function () {
                            materialAvailability(current());
                        }});
                }
                return items;
            }

            function toolItems() {
                var items = [];
                if (can(access, 'stock.move', 'read')) {
                    items.push({label: 'Inventory Pieces...', onclick:
                        function () {
                            inventoryPieces(current());
                        }});
                }
                if (can(access, 'stock.move', 'write') &&
                        can(access, 'production', 'write')) {
                    items.push({label: 'Reset Material Costs...', onclick:
                        function () {
                            resetMaterialCosts(current());
                        }});
                }
                if (allowed.masters) {
                    items.push({label: 'Open Eng Master for Part...',
                        onclick: editMaster});
                }
                return items;
            }

            /* Edit Master: the part's engineering master (its Eng Master
             * Revision, else the latest) */
            function editMaster() {
                var id = current();
                if (!id) {
                    UI.toast('No current part has been selected.', 'error');
                    return;
                }
                Rpc.searchRead('production.bom', [['outputs.product.template',
                    '=', id]], ['rec_name'], {order: [['id', 'DESC']],
                    limit: 20}).then(function (boms) {
                        var record = win.record() || {};
                        var rev = record.engineering_revision;
                        var bom = boms.filter(function (b) {
                            return rev && b.rec_name.indexOf('Rev ' +
                                rev) >= 0;
                        })[0] || boms[0];
                        if (bom) {
                            UI.openScreen('masters/' + bom.id, bom.rec_name);
                        } else if (allowed.masters) {
                            UI.openScreen('masters', 'Engineering Master');
                            UI.toast('The part has no engineering master: ' +
                                'create one.');
                        }
                    }, failed);
            }

            function copyPart(record, load) {
                if (!record) {
                    UI.toast('No current part has been selected.');
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
                            win.clear();
                        }, failed);
                    });
            }

            var extra = [];
            var view = viewItems(), tools = toolItems();
            if (view.length) {
                extra.push({label: 'View ▾', onclick: function () {
                    dropMenu(view);
                }});
            }
            if (tools.length) {
                extra.push({label: 'Tools ▾', onclick: function () {
                    dropMenu(tools);
                }});
            }
            /* Copy / Delete: shown by the window per the user's rights */
            if (can(access, 'product.template', 'create')) {
                extra.push({label: 'Copy', onclick: copyPart});
            }
            if (can(access, 'product.template', 'delete')) {
                extra.push({label: 'Delete', onclick: deletePart});
            }

            var header = partHeader(access);
            var other = otherTab(12);
            if (allowed.masters) {
                /* (Jobshop's button is 277,116-351,142, taller than its
                 * row; here the height of the Eng Master Revision field
                 * so the row reads as one line) */
                header.buttons.push({label: 'Edit Master',
                    at: [277, 120, 351, 140], onclick: editMaster});
            }
            var writeLoc = can(access, 'nline.js.part_location', 'write') &&
                can(access, 'product.template', 'write');
            var writeConv = can(access, 'nline.js.unit_conversion',
                'write') && can(access, 'product.template', 'write');
            var locationFields = LOCATION_FIELDS.filter(function (f) {
                return knownLoc[f.name] || !Object.keys(knownLoc).length;
            });
            var tabs = [header, generalTab(access),
                other, {picture: true},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', rows: 18, span: 6}]},
                {notes: true},
                writeConv ? {title: 'Unit Conv', lines: {
                    name: 'unit_conversions',
                    model: 'nline.js.unit_conversion',
                    inverse: 'template', fields: CONVERSION_FIELDS}} :
                    {title: 'Unit Conv', render: readLinesTab(
                        'nline.js.unit_conversion', 'template',
                        CONVERSION_FIELDS)},
                writeLoc ? {title: 'Locations', lines: {
                    name: 'part_locations', model: 'nline.js.part_location',
                    inverse: 'template', fields: locationFields}} :
                    {title: 'Locations', render: readLinesTab(
                        'nline.js.part_location', 'template',
                        locationFields)}];
            if (can(access, 'stock.move', 'read')) {
                tabs.push({title: 'Tracking Info', render: trackingTab});
            }
            tabs.push(instructionsTab());
            var docs = [['quote', 'Quote Lines'], ['sale', 'SO Lines'],
                ['rfq', 'RFQ Lines'], ['purchase', 'PO Lines'],
                ['production', 'Work Orders']];
            /* (strict: a model of a module not installed is not shown) */
            function readable(model) {
                return Boolean(access[model] && access[model].read);
            }
            docs.forEach(function (d) {
                if (readable(DOC_SETUP[d[0]].model)) {
                    tabs.push({title: d[1], render: linesTab(d[0],
                        DOC_SETUP[d[0]], allowed)});
                }
            });
            var prices = [['supplier', 'Supplier Part Prices'],
                ['service', 'Supplier Service Pricing'],
                ['customer', 'Customer Part Pricing'],
                ['discount', 'Discount Class Part Pricing']];
            prices.forEach(function (p) {
                if (readable(p[0] === 'supplier' || p[0] === 'service' ?
                        'purchase.product_supplier' : 'nline.sale_price')) {
                    tabs.push({title: p[1], render: pricesTab(p[0],
                        allowed)});
                }
            });
            existingFields(tabs, known);

            win = UI.master(main, {
                title: 'Parts',
                model: 'product.template',
                open: openId,
                label: 'Part ID',
                idAt: [6, 6, 417, 26],
                idSplit: 135,
                idField: 'code',
                order: [['code', 'ASC'], ['name', 'ASC']],
                /* Browse: Jobshop's Show All shows the inactive parts */
                browseShowAll: true,
                single: true,
                defaults: {type: 'goods'},
                extra: extra,
                tabs: tabs,
                browse: [
                    {name: 'code', label: 'Part ID', nowrap: true},
                    {name: 'name', label: 'Description'},
                    {name: 'producible', label: 'Fab\'d', type: 'boolean'},
                    {name: 'purchasable', label: 'Pur\'d', type: 'boolean'},
                    {name: 'stocked', label: 'Stocked', type: 'boolean'},
                    {name: 'tool_or_fixture', label: 'Tool/Fixture',
                        type: 'boolean'},
                    {name: 'default_uom', label: 'Stock U/M',
                        type: 'many2one'},
                    {name: 'drawing_number', label: 'Drawing ID',
                        nowrap: true},
                    /* (Jobshop's Browse: the codes' IDs only) */
                    {name: 'product_code.code', label: 'Product Code'},
                    {name: 'commodity_code.code', label: 'Commodity Code'},
                    {name: 'mfg_name', label: 'Mfg Name'},
                    {name: 'mfg_part_id', label: 'Mfg Part ID'},
                    {name: 'inactive', label: 'Inactive', type: 'boolean'}],
                beforeSave: function (values, record) {
                    /* An unchanged Stock U/M is not written (Tryton
                     * refuses any write of it once the part has moves) */
                    if (record && values.default_uom === record.default_uom) {
                        delete values.default_uom;
                    }
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
                    UI.setTitle('Parts :: ' + (record.code ||
                        record.rec_name));
                    costingState(record);
                    filterLocations();
                }
            });

            Rpc.desk('inventory_setup', []).then(function (setup) {
                applyUserLabels(main, other, setup.user_labels || []);
            }, function () {});

            /* The Browse grid (the last tab): IDs on one line (the frame
             * has no per-column option yet; its columns carry nowrap) */
            var browseTables = main.querySelectorAll('.tab-pane table.data');
            if (browseTables.length) {
                browseTables[browseTables.length - 1].classList.add(
                    'nl-inv-browse');
            }

            /* Jobshop draws the Part tab above the sub tabs: the header
             * stays while the sub tabs change; the Browse tab hides it */
            var tabBar = main.querySelector('.tabs');
            var panes = main.querySelector('.tab-panes');
            var headerPane = panes && panes.firstChild;
            var headerBox = headerPane && headerPane.querySelector(
                '.js-layout');
            if (tabBar && headerBox) {
                var pinned = el('div.panel.nl-inv-header', headerBox);
                tabBar.parentNode.insertBefore(pinned, tabBar);
                tabBar.firstChild.hidden = true;
                Array.prototype.forEach.call(tabBar.children, function (b) {
                    b.addEventListener('click', function () {
                        pinned.hidden = b.textContent === 'Browse';
                    });
                });
                var showGeneral = function () {
                    if (!headerPane.hidden) {
                        tabBar.children[1].click();
                    }
                };
                new MutationObserver(showGeneral).observe(headerPane,
                    {attributes: true, attributeFilter: ['hidden']});
                showGeneral();
            }

            /* Locations: Show All (the inactive part locations too) */
            var locPane = null;
            Array.prototype.forEach.call(tabBar ? tabBar.children : [],
                function (b, i) {
                    if (b.textContent === 'Locations') {
                        locPane = panes.children[i];
                    }
                });
            var showAll = el('input', {type: 'checkbox', 'aria-label':
                'Show All'});
            function filterLocations() {
                global.setTimeout(function () {
                    if (!locPane) {
                        return;
                    }
                    Array.prototype.forEach.call(locPane.querySelectorAll(
                        'tbody tr'), function (tr) {
                            var box = tr.querySelector(
                                'input[aria-label="Inactive"]');
                            tr.hidden = Boolean(box && box.checked &&
                                !showAll.checked);
                        });
                }, 400);
            }
            if (locPane) {
                showAll.addEventListener('change', filterLocations);
                locPane.insertBefore(el('div.toolbar', el('label', showAll,
                    ' Show All')), locPane.firstChild);
            }

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

            /* Right-click in the window: the View and Tools menus */
            main.addEventListener('contextmenu', function (event) {
                if (event.defaultPrevented || !current() ||
                        /^(INPUT|TEXTAREA|SELECT)$/.test(
                            event.target.tagName)) {
                    return;
                }
                UI.contextMenu(event, view.concat(tools.length && view.length ?
                    ['-'] : [], tools));
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
            UI.toast('Select a location first.');
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
        /* (Jobshop's read-only box, ADJ_AVAIL_QTY / TRANS_QTY_AVAIL) */
        var onHand = el('input.money', {type: 'text', readOnly: true,
            tabIndex: -1, 'aria-label': transfer ?
                'Qty. Avail. to Transfer' : 'Qty Available to Adjust'});
        var available = el('strong', '');
        var lot = el('input', {type: 'text', 'aria-label': 'Tracking No',
            list: 'nl-inv-lots-' + kind});
        var lots = el('datalist', {id: 'nl-inv-lots-' + kind});
        var lastCounted = el('input', {type: 'checkbox', 'aria-label':
            'Set Last Counted Date'});
        var note = el('textarea', {rows: 2, maxlength: 250, 'aria-label':
            'Transaction Note'});
        var partDescr = el('span.muted', '');
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
                    partDescr.textContent = (part.rec_name || '').replace(
                        /^\[[^\]]*\]\s*/, '');
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
                onHand.value = num(here.reduce(function (s, x) {
                    return s + x.quantity;
                }, 0)) + ' ' + unit.textContent;
                available.title = 'In all locations: ' + num(r.reduce(
                    function (s, x) {
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
            note.value = '';
            lastCounted.checked = false;
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
                UI.showError('You must enter an adjustment before ' +
                    'adding a row.');
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
                    '' : '',
                note: note.value.trim() || null,
                last_counted: transfer ? false : lastCounted.checked
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
            note.value = line.note || '';
            lastCounted.checked = Boolean(line.last_counted);
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
            var marker = {key: 'marker', label: 'Entry No', render:
                function (row) {
                    return el('span', {title: 'Not saved'},
                        pending.indexOf(row) === editing ? '✎' : '+');
                }};
            var part = {key: 'partName', label: 'Part ID', render:
                function (row) {
                    return UI.shortName('product.template', row.partName);
                }};
            var descr = {key: 'partDescr', label: 'Part Description',
                render: function (row) {
                    return (row.partName || '').replace(/^\[[^\]]*\]\s*/,
                        '');
                }};
            var columns = transfer ? [marker,
                {key: 'date', label: 'Date', date: true}, part, descr,
                {key: 'quantity', label: 'Quantity', num: true},
                {key: 'unit', label: 'U/M'},
                {key: 'reasonName', label: 'Reason Code'},
                {key: 'locationName', label: 'From Location'},
                {key: 'toName', label: 'To Location'},
                {key: 'lot', label: 'Tracking Number'},
                {key: 'note', label: 'Description'}] : [marker,
                {key: 'date', label: 'Date', date: true},
                {key: 'type', label: 'Type', render: function (row) {
                    return {in: 'Adjust In', out: 'Adjust Out'}[row.type];
                }}, part, descr,
                {key: 'quantity', label: 'Quantity', num: true},
                {key: 'unit', label: 'U/M'},
                {key: 'locationName', label: 'Location ID'},
                {key: 'reasonName', label: 'Reason Code'},
                {key: 'accountName', label: 'Account'},
                {key: 'material', label: 'Material Cost', money: true},
                {key: 'labor', label: 'Labor Cost', money: true},
                {key: 'burden', label: 'Burden Cost', money: true},
                {key: 'service', label: 'Service Cost', money: true},
                {key: 'lot', label: 'Tracking No'},
                {key: 'last_counted', label: 'Set Last Counted', bool: true},
                {key: 'note', label: 'Description'}];
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
                            {key: 'lot', label: 'Tracking Number'},
                            {key: 'note', label: 'Description'}]), rows, {
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
            transfer ? null : el('div', el('label.field', ' '), el('label',
                lastCounted, ' Set Last Counted Date')),
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Part ID'), partPick.node, partDescr),
            field('Location ID', location),
            field(transfer ? 'Qty. Avail. to Transfer' :
                'Qty Available to Adjust', onHand),
            field(transfer ? 'Transfer Qty' : 'Quantity', el('span',
                quantity, ' ', unit)),
            field('Tracking No', el('span', lot, lots)),
            field('Reason Code', reason),
            transfer ? null : (account ? field('Adj Acct ID', account) :
                null),
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Transaction Note'), note),
            transfer ? el('fieldset', {style: {gridColumn: 'span 3'}},
                el('legend', 'Transfer To'), field('Location ID',
                    toLocation)) : null);
        var costBox = transfer ? null : el('fieldset', el('legend',
            'Unit Cost per Quantity UM'), el('div.grid-form',
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
            el('button', {type: 'button', onclick: function () {
                save();
            }}, transfer ? 'Transfer' : 'Adjust'),
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
