/* N-Line Jobshop emulation: engineering screens (module nline_js_engineering;
 * see docs/jobshop/EMULATION.md and docs/jobshop/status/engineering.md).
 *
 * Jobshop's three "master" windows share the information cards of their
 * Details tab (JS.cards below): the Work Order window (a production, its
 * legs child productions), the Engineering Master (a BOM and its routing)
 * and the Quote Master (a BOM of type quote). Also the Operation Templates
 * and the Quotes window.
 *
 * Routes: work-orders/new, work-orders/<id>, workorders/<id> (the work
 * order on its Details tab), masters, masters/<id>, quote-masters,
 * quote-masters/<id>, operation-templates, quotes, quotes/<id>. */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];
    var JS = global.NLJobshop = global.NLJobshop || {};

    routes.push(
        [/^#\/work-orders\/new$/, 'jsWorkOrder'],
        [/^#\/work-orders\/(\d+)$/, 'jsWorkOrder'],
        [/^#\/workorders\/(\d+)$/, 'workorder'],
        [/^#\/masters$/, 'jsEngineeringMaster'],
        [/^#\/masters\/(\d+)$/, 'jsEngineeringMaster'],
        [/^#\/quote-masters$/, 'jsQuoteMaster'],
        [/^#\/quote-masters\/(\d+)$/, 'jsQuoteMaster'],
        [/^#\/operation-templates$/, 'jsOperationTemplates'],
        [/^#\/operation-templates\/(\d+)$/, 'jsOperationTemplates'],
        [/^#\/quotes$/, 'jsQuotes'],
        [/^#\/quotes\/(\d+)$/, 'jsQuotes']);

    /* ---- Style (the desk's variables) ------------------------------------ */

    if (!document.getElementById('nl-js-engineering-css')) {
        document.head.appendChild(el('style', {id: 'nl-js-engineering-css'},
            '.node.card.selected, .node.prod.selected { outline: 2px dashed ' +
            'var(--ink); outline-offset: 1px; }\n' +
            '.node .icons { display: inline-flex; gap: 2px; margin-left: 4px; }\n' +
            '.node .icons button { font-size: 9.5px; line-height: 12px; ' +
            'padding: 0 3px; min-width: 0; border: 1px solid var(--line); ' +
            'background: var(--paper); color: var(--ink); cursor: pointer; }\n' +
            '.nl-eng-tabs { display: flex; gap: 2px; border-bottom: 1px solid ' +
            'var(--line); margin-bottom: 8px; flex-wrap: wrap; }\n' +
            '.nl-eng-tabs button { border: 1px solid var(--line); border-bottom: 0; ' +
            'background: var(--paper); padding: 3px 10px; }\n' +
            '.nl-eng-tabs button.active { background: var(--accent-soft); ' +
            'font-weight: 600; }\n' +
            '.nl-eng-form { display: grid; grid-template-columns: repeat(3, ' +
            'minmax(150px, 1fr)); gap: 6px 12px; min-width: 560px; }\n' +
            '.nl-eng-form .wide { grid-column: 1 / -1; }\n' +
            '.nl-eng-split { display: grid; grid-template-columns: 1fr 1fr; ' +
            'gap: 12px; min-width: 720px; max-height: 60vh; }\n' +
            '.nl-eng-split > div { overflow: auto; border: 1px solid var(--line); ' +
            'padding: 6px; }\n' +
            '.nl-eng-tree div { cursor: pointer; white-space: nowrap; ' +
            'padding: 1px 4px; }\n' +
            '.nl-eng-tree div.active { background: var(--accent-soft); }\n' +
            '.nl-eng-tree .k-op { color: var(--ok); }\n' +
            '.nl-eng-tree .k-mat { color: var(--bad); }\n' +
            '.nl-eng-tree .k-leg { color: var(--leg); font-weight: 600; }\n' +
            '.nl-eng-info { position: fixed; z-index: 1001; background: ' +
            'var(--paper); color: var(--ink); border: 1px solid var(--line); ' +
            'box-shadow: 0 6px 18px rgba(0,0,0,.25); padding: 8px 10px; ' +
            'font-size: 12px; max-width: 360px; white-space: pre-line; }\n' +
            '.nl-eng-scroll { max-height: 60vh; overflow: auto; min-width: ' +
            '640px; }\n' +
            '.nl-eng-pressed { box-shadow: inset 0 0 0 2px var(--accent-soft); ' +
            'font-weight: 600; }\n' +
            'tr.nl-lvl-0 td { font-weight: 600; }\n' +
            /* Browse rows one line high (Jobshop's grid) */
            '.nl-eng-browse table.data td { white-space: nowrap; ' +
            'max-width: 460px; overflow: hidden; text-overflow: ellipsis; }\n' +
            /* Cards: the header card's text in two lines (not cut); the
             * header line's text cut with "..." before its tags; a card
             * under another keeps its text out of the strip that shows */
            '.node.prod .bd { line-height: 1.3; padding-top: 2px; }\n' +
            '.node.prod .bd > div { overflow: hidden; white-space: nowrap; ' +
            'text-overflow: ellipsis; }\n' +
            '.node .hd > .t { min-width: 0; overflow: hidden; ' +
            'text-overflow: ellipsis; white-space: nowrap; }\n' +
            '.node .hd > .tag, .node .hd > .icons { flex: none; }\n' +
            '.node.card .bd { padding-right: 18px; overflow: hidden; }\n' +
            /* A multi-line field with its label beside it (the address) */
            '.js-ctl.js-multi.nl-eng-row { flex-direction: row; ' +
            'align-items: flex-start; }\n' +
            '.js-ctl.js-multi.nl-eng-row > .js-label { padding: 3px 6px 0 0; }\n' +
            '.js-ctl .picker .picker-browse { flex: none; height: 100%; }\n' +
            /* A placed radio group: the buttons beside their captions
             * (desk.css sizes every placed input to the box) */
            '.js-ctl .js-radio label { display: flex; align-items: center; ' +
            'gap: 6px; }\n' +
            '.js-ctl .js-radio input[type=radio] { width: auto; height: ' +
            'auto; flex: none; margin: 0; }\n' +
            '.nl-eng-muted { color: var(--muted); }\n'));
    }

    /* The "!" button beside a Drawing File (tab.buttons): View Drawing */
    function drawingButton(main, at) {
        return {label: '!', at: at, onclick: function () {
            var input = main.querySelector('input[aria-label="Drawing File"]');
            viewDrawing(input && input.value);
        }};
    }

    /* ---- Small helpers ------------------------------------------------------ */

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function num(v, digits) {
        if (v === null || v === undefined || v === '') {
            return '';
        }
        var n = Number(v);
        return isNaN(n) ? String(v) : String(Math.round(n * Math.pow(10,
            digits === undefined ? 4 : digits)) / Math.pow(10,
            digits === undefined ? 4 : digits));
    }

    function money(v) {
        return v === null || v === undefined ? '' : UI.money(v);
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

    function td(v, numeric) {
        return el('td' + (numeric ? '.num' : ''), v === null ||
            v === undefined ? '' : String(v));
    }

    function code(name) {
        var match = /^\[([^\]]+)\]\s*(.*)$/.exec(name || '');
        return match ? {code: match[1], name: match[2]} : {code: '',
            name: name || ''};
    }

    /* A menu at a button (the ribbon's Tools / View / Options menus) */
    function menuAt(button, items) {
        var box = button.getBoundingClientRect();
        UI.contextMenu({preventDefault: function () {}, clientX: box.left,
            clientY: box.bottom}, items.filter(Boolean));
    }

    /* A submenu (Jobshop's "Change Status >"): a second menu where the
     * first one was */
    var lastXY = {x: 100, y: 100};
    document.addEventListener('contextmenu', function (event) {
        lastXY = {x: event.clientX, y: event.clientY};
    }, true);
    document.addEventListener('mousedown', function (event) {
        if (event.target.closest && event.target.closest('.ribbon')) {
            lastXY = {x: event.clientX, y: event.clientY + 20};
        }
    }, true);
    function submenu(label, items) {
        items = items.filter(Boolean);
        if (!items.length) {
            return null;
        }
        return {label: label + ' ▸', onclick: function () {
            UI.contextMenu({preventDefault: function () {}, clientX:
                lastXY.x + 40, clientY: lastXY.y}, items);
        }};
    }

    /* Hide the ribbon buttons of these labels (what the user may not do) */
    function hideRibbon(main, labels, hidden) {
        Array.prototype.forEach.call(main.querySelectorAll('.ribbon button'),
            function (button) {
                if (labels.indexOf(button.textContent) >= 0) {
                    button.hidden = hidden;
                }
            });
    }

    /* What the user may open and do, read once per screen */
    var SCREENS = ['work-orders', 'workorders', 'parts', 'masters',
        'quote-masters', 'resources', 'orders', 'purchase-orders', 'issues',
        'labor', 'planning', 'rfqs', 'supplier-window', 'vendors',
        'operation-templates', 'quotes'];
    var MODELS = ['production', 'production.bom', 'production.bom.input',
        'production.material_card', 'production.work',
        'production.routing.step', 'stock.move', 'purchase.purchase',
        'production.work.cycle', 'nline.quote', 'sale.sale',
        'nline.engineering.operation_template', 'company.employee'];
    function permissions() {
        return Promise.all([Promise.all(SCREENS.map(UI.screenAllowed)),
            UI.access(MODELS)]).then(function (result) {
                var perm = {screens: {}, access: result[1] || {}};
                SCREENS.forEach(function (screen, i) {
                    perm.screens[screen] = result[0][i];
                });
                perm.can = function (model, mode) {
                    var a = perm.access[model];
                    return Boolean(a && a[mode]);
                };
                perm.screen = function (name) {
                    return Boolean(perm.screens[name]);
                };
                return perm;
            });
    }
    JS.permissions = permissions;

    function opener(perm, screen, path, label) {
        return perm.screen(screen) ? {label: label, onclick: function () {
            UI.openScreen(path);
        }} : null;
    }

    /* ---- Dialogs with Jobshop's tabs ---------------------------------------- */

    /* A control of a dialog field: UI.fieldControl, or a picker with an
     * onselect (the operation template) */
    function control(f) {
        if (f.type === 'many2one' && f.onselect) {
            var picker = UI.picker(f.model, {label: f.label, domain: f.domain,
                onselect: f.onselect});
            return {node: picker.node, get: picker.value, set: function (v) {
                if (v && typeof v === 'object') {
                    picker.set(v.id, v.rec_name);
                } else {
                    picker.set(null, '');
                }
            }, picker: picker};
        }
        return UI.fieldControl(f);
    }

    /* dialog(title, tabs: [{title, fields: [...]} | {title, render(pane,
     * values)}], values, onSave(values) -> Promise, {readonly, tab}) */
    function dialog(title, tabs, values, onSave, options) {
        options = options || {};
        var controls = {};
        var bar = el('div.nl-eng-tabs', {role: 'tablist'});
        var panes = el('div');
        var getters = [];
        tabs.forEach(function (tab, i) {
            var pane = el('div', {hidden: i ? true : null});
            bar.appendChild(el('button', {type: 'button', role: 'tab',
                onclick: function () {
                    show(i);
                }}, tab.title));
            if (tab.fields) {
                var grid = el('div.nl-eng-form');
                tab.fields.forEach(function (f) {
                    var c = control(f);
                    c.field = f;
                    controls[f.name] = c;
                    if (values && values[f.name] !== undefined) {
                        c.set(values[f.name]);
                    } else if (f.default !== undefined) {
                        c.set(f.default);
                    }
                    if (options.readonly || f.readonly) {
                        Array.prototype.forEach.call(c.node.querySelectorAll ?
                            c.node.querySelectorAll('input, select, textarea, ' +
                                'button') : [], function (n) {
                                n.disabled = true;
                            });
                        if (c.node.disabled !== undefined) {
                            c.node.disabled = true;
                        }
                    }
                    grid.appendChild(el('div' + (f.span || f.type === 'text' ?
                        '.wide' : ''), el('label.field', f.label), c.node));
                });
                pane.appendChild(grid);
            } else if (tab.render) {
                var getter = tab.render(pane, values || {});
                if (getter) {
                    getters.push(getter);
                }
            }
            panes.appendChild(pane);
        });
        function show(index) {
            Array.prototype.forEach.call(bar.children, function (b, i) {
                b.classList.toggle('active', i === index);
            });
            Array.prototype.forEach.call(panes.children, function (p, i) {
                p.hidden = i !== index;
            });
        }
        show(options.tab || 0);
        function collect() {
            var result = {};
            Object.keys(controls).forEach(function (name) {
                var c = controls[name];
                if (!c.field.readonly) {
                    result[name] = c.get();
                    /* A many2one keeps its name ({id, rec_name}: the server
                     * takes either) */
                    if (c.picker && result[name]) {
                        result[name] = {id: result[name], rec_name:
                            c.picker.input.value};
                    }
                }
            });
            getters.forEach(function (g) {
                Object.assign(result, g());
            });
            return result;
        }
        var buttons = options.readonly || !onSave ? [{label: 'Close',
            primary: true}] : [{label: 'Cancel'}, {label: 'OK', primary: true,
                onclick: function (close) {
                    Promise.resolve(onSave(collect())).then(function () {
                        close();
                    }, failed);
                    return true;
                }}];
        UI.modal(title, [tabs.length > 1 ? bar : null, panes], buttons);
        return {controls: controls, show: show};
    }
    JS.dialog = dialog;

    function rowsGrid(columns, rows) {
        /* An editable little grid (Additional Resources, Add Materials,
         * Variables, Co-Products): {node, get()} */
        var body = el('tbody');
        var lines = [];
        function add(row) {
            var line = {id: row && row.id, controls: {}};
            var tr = el('tr', columns.map(function (f) {
                var c = control(f);
                c.field = f;
                line.controls[f.name] = c;
                if (row && row[f.name] !== undefined) {
                    c.set(row[f.name]);
                } else if (f.default !== undefined) {
                    c.set(f.default);
                }
                return el('td', c.node);
            }), el('td.row-delete', el('button', {type: 'button', title:
                'Delete line', 'aria-label': 'Delete line', onclick:
                function () {
                    lines.splice(lines.indexOf(line), 1);
                    tr.remove();
                }}, '✕')));
            lines.push(line);
            body.appendChild(tr);
        }
        (rows || []).forEach(add);
        var node = el('div', el('div.table-wrap', el('table.data', el('thead',
            el('tr', columns.map(function (f) {
                return el('th', f.label);
            }), el('th', ''))), body)), el('div.toolbar', el('button', {
                type: 'button', onclick: function () {
                    add(null);
                }}, 'Add line')));
        return {node: node, add: add, get: function () {
            return lines.map(function (line) {
                var row = {id: line.id || null};
                Object.keys(line.controls).forEach(function (name) {
                    row[name] = line.controls[name].get();
                });
                return row;
            });
        }};
    }

    var RUN_TYPES = [['hrs_pc', 'Hours per Piece'], ['pcs_hr',
        'Pieces per Hour'], ['min_pc', 'Minutes per Piece'], ['pcs_min',
        'Pieces per Minute'], ['loads_hr', 'Loads per Hour'], ['hrs_load',
        'Hours per Load']];
    var RESOURCE_FIELDS = [
        {name: 'resource', label: 'Resource ID', type: 'many2one',
            model: 'production.work.center'},
        {name: 'step_type', label: 'Step', type: 'selection', default: 'both',
            options: [['setup', 'Setup'], ['run', 'Run'], ['both', 'Both']]},
        {name: 'duration_percent', label: 'Duration %', type: 'float',
            default: 100},
        {name: 'justification', label: 'Justification', type: 'selection',
            default: 'start', options: [['start', 'At Start'],
                ['end', 'At End']]}];
    var OP_SPECS = [
        {name: 'drawing_number', label: 'Drawing ID', type: 'char'},
        {name: 'drawing_revision', label: 'Rev', type: 'char'},
        {name: 'drawing_page', label: 'Page', type: 'char'},
        {name: 'drawing_file', label: 'Drawing File', type: 'char', span: 3},
        {name: 'specifications', label: 'Specifications', type: 'text'}];
    var OP_COSTS = [
        ['setup_cost_hour', 'Setup Per Hr'], ['run_cost_hour', 'Run Per Hr'],
        ['run_cost_unit', 'Run Per Unit'], ['run_cost_operation',
            'Run Per Operation'], ['setup_burden_hour',
            'Setup Burden Per Hour'], ['run_burden_hour',
            'Run Burden Per Hour'], ['burden_unit', 'Burden Per Unit'],
        ['burden_operation', 'Burden Per Operation'],
        ['setup_burden_percent', 'Setup Percentage'],
        ['run_burden_percent', 'Run Percentage']].map(function (p) {
            return {name: p[0], label: p[1], type: 'float'};
        });
    var OP_OTHER = [
        {name: 'scrap_yield', label: 'Scrap or Yield', type: 'selection',
            options: [['scrap', 'Scrap'], ['yield', 'Yield']],
            default: 'scrap'},
        {name: 'scrap_percent', label: 'Scrap/Yield %', type: 'float'},
        {name: 'fixed_scrap', label: 'Fixed Scrap Units', type: 'float'},
        {name: 'override_start_qty', label: 'Override Start Qty',
            type: 'float'},
        {name: 'override_end_qty', label: 'Override End Qty', type: 'float'},
        {name: 'minimum_capacity', label: 'Minimum Capacity',
            type: 'integer'},
        {name: 'maximum_capacity', label: 'Maximum Capacity',
            type: 'integer'}];

    /* The Operation window: Operation, Specs, Costs, Additional Resources,
     * Other (Adding_Engineering_Master_and_Work_Order_Operations) */
    function operationDialog(values, onSave, options) {
        var resources;
        var d = dialog(values.id ? 'Operation ' + (values.sequence || '') :
            'Add Operation', [
            {title: 'Operation', fields: [
                {name: 'sequence', label: 'Seq No', type: 'integer'},
                {name: 'resource', label: 'Resource ID', type: 'many2one',
                    model: 'production.work.center'},
                {name: 'template', label: 'Template ID', type: 'many2one',
                    model: 'nline.engineering.operation_template',
                    onselect: function (record) {
                        applyTemplate(record.id);
                    }},
                {name: 'description', label: 'Description', type: 'char',
                    span: 2},
                {name: 'preserved', label: 'Preserved', type: 'boolean'},
                {name: 'service', label: 'Service ID', type: 'many2one',
                    model: 'product.product', domain: [['type', '=',
                        'service']]},
                {name: 'supplier', label: 'Supplier ID', type: 'many2one',
                    model: 'party.party'},
                {name: 'transit_days', label: 'Transit Days',
                    type: 'integer'},
                {name: 'setup_hours', label: 'Setup Hours', type: 'float'},
                {name: 'run', label: 'Run', type: 'float'},
                {name: 'run_type', label: 'Run Type', type: 'selection',
                    options: RUN_TYPES, default: 'hrs_pc'},
                {name: 'load_size', label: 'Load Size Qty', type: 'float'},
                {name: 'move_hours', label: 'Move Hrs', type: 'float'},
                {name: 'minimum_move_qty', label: 'Minimum Move Qty',
                    type: 'float'}]},
            {title: 'Specs', fields: OP_SPECS},
            {title: 'Costs', fields: OP_COSTS},
            {title: 'Additional Resources', render: function (pane, v) {
                resources = rowsGrid(RESOURCE_FIELDS, v.resources || []);
                pane.appendChild(resources.node);
                return function () {
                    return {resources: resources.get()};
                };
            }},
            {title: 'Other', fields: OP_OTHER}
        ], values, onSave, options);

        /* A template fills the operation (Template ID) */
        function applyTemplate(id) {
            Rpc.desk('eng_operation', ['template', id]).then(function (t) {
                Object.keys(d.controls).forEach(function (name) {
                    if (name === 'sequence' || name === 'template' ||
                            t[name] === undefined) {
                        return;
                    }
                    if (name === 'description' && d.controls.preserved.get()) {
                        return;
                    }
                    d.controls[name].set(t[name]);
                });
                (t.resources || []).forEach(function (r) {
                    resources.add({resource: r.resource, step_type:
                        r.step_type, duration_percent: r.duration_percent,
                        justification: r.justification});
                });
                if (t.special_instructions) {
                    UI.modal('Special Instructions', el('p', {style:
                        {whiteSpace: 'pre-line'}}, t.special_instructions));
                }
            }, UI.showError);
        }
        return d;
    }
    JS.operationDialog = operationDialog;

    var MAT_FIELDS = [
        {name: 'product', label: 'Part ID', type: 'many2one',
            model: 'product.product', span: 2},
        {name: 'quantity', label: 'Qty Per', type: 'float', default: 1},
        {name: 'unit', label: 'U/M', type: 'many2one', model: 'product.uom'},
        {name: 'operation', label: 'Seq No', type: 'integer'},
        {name: 'piece', label: 'Piece No', type: 'integer'},
        {name: 'qty_per_type', label: 'Qty Per Type', type: 'selection',
            options: [['start', 'Start'], ['end', 'End']], default: 'start'},
        {name: 'fixed_quantity', label: 'Fixed Qty', type: 'float'},
        {name: 'scrap_percent', label: 'Scrap %', type: 'float'},
        {name: 'reference', label: 'Reference', type: 'char', span: 2},
        {name: 'dimensions', label: 'Dimensions (variables)', type: 'char'},
        {name: 'component_revision', label: 'Eng ID (pinned revision)',
            type: 'char'}];

    /* The Material window: Material, Specs, Costs, Purchasing
     * (Understanding_the_*_Tab_MaterialWindow) */
    function materialDialog(values, onSave, options) {
        var fields = MAT_FIELDS.slice();
        if (options && options.master) {
            fields.push({name: 'leg_detail', label: 'Leg/Detail (made in a ' +
                'leg of the work orders)', type: 'boolean'});
        }
        return dialog(values.id ? 'Material ' + (values.product ?
            values.product.rec_name : '') : 'Add Material', [
            {title: 'Material', fields: fields},
            {title: 'Specs', fields: OP_SPECS},
            {title: 'Costs', fields: [
                {name: 'unit_cost', label: 'Unit Material Cost (empty: ' +
                    'the part cost' + (values.cost_price !== undefined ? ' ' +
                        UI.money(values.cost_price) : '') + ')',
                    type: 'float', span: 2},
                {name: 'fixed_cost', label: 'Fixed Cost', type: 'float'}]},
            {title: 'Purchasing', fields: [
                {name: 'supplier', label: 'Supplier ID', type: 'many2one',
                    model: 'party.party', span: 2},
                {name: 'required_date', label: 'Required Date',
                    type: 'date'}]}
        ], values, onSave, options);
    }
    JS.materialDialog = materialDialog;

    /* ---- Views of a work order or master ------------------------------------ */

    /* Show Costs / Indented Costs (Viewing_*_Indented_Costs) */
    function costsDialog(kind, id, title) {
        var qty = el('input.money', {type: 'text', 'aria-label': 'Quantity',
            style: {width: '90px'}});
        var body = el('div.nl-eng-scroll');
        function load() {
            Rpc.desk('eng_costs', [kind, id, kind === 'bom' && qty.value ?
                parseFloat(qty.value) : null]).then(function (c) {
                    qty.value = c.quantity;
                    var heads = ['Card', '#Qty', 'U/M', '#Material', '#Labor',
                        '#Burden', '#Service', '#Total'];
                    if (kind === 'production') {
                        heads.push('#Actual');
                    }
                    UI.clear(body).appendChild(table(heads, c.rows.map(
                        function (r) {
                            var cells = [el('td', {style: {paddingLeft:
                                (6 + r.level * 16) + 'px'}}, r.label),
                                td(num(r.quantity), true), td(r.unit),
                                td(money(r.material), true),
                                td(money(r.labor), true),
                                td(money(r.burden), true),
                                td(money(r.service), true),
                                td(money(r.total), true)];
                            if (kind === 'production') {
                                cells.push(td(money(r.actual), true));
                            }
                            return el('tr.nl-lvl-' + r.level + (r.kind ===
                                'leg' || r.kind === 'header' ? '.total' : ''),
                                cells);
                        })));
                    body.appendChild(el('p', 'Total ' + UI.money(c.total,
                        true) + ' · per unit ' + UI.money(c.unit, true) +
                        (c.actual !== null ? ' · actual ' + UI.money(c.actual,
                            true) : '')));
                }, UI.showError);
        }
        UI.modal('Show Costs: ' + title, [kind === 'bom' ? el('div.toolbar',
            el('label.field', 'Quantity'), qty, el('button', {type: 'button',
                onclick: load}, 'Recalculate')) : null, body]);
        load();
    }

    /* Show Details / Indented Details: the cards as an indented list, the
     * chosen card's details on the right */
    function detailsDialog(tree, describe) {
        var left = el('div.nl-eng-tree');
        var right = el('div');
        function line(text, kind, level, data, info) {
            var row = el('div.k-' + kind, {style: {paddingLeft: (4 + level *
                16) + 'px'}}, text);
            row.addEventListener('click', function () {
                Array.prototype.forEach.call(left.children, function (c) {
                    c.classList.remove('active');
                });
                row.classList.add('active');
                UI.clear(right).appendChild(infoList(info));
            });
            left.appendChild(row);
        }
        function walk(node, level) {
            line((node.number || '') + ' ' + (node.product || ''), level ?
                'leg' : 'head', level, node, describe('prod', node, node));
            order(node).forEach(function (item) {
                if (item.kind === 'op') {
                    line((item.data.sequence || '') + ' ' + (item.data.operation
                        || ''), 'op', level + 1, item.data, describe('op',
                            item.data, node));
                } else {
                    line((item.data.piece || '') + ' ' + item.data.product,
                        item.data.leg ? 'leg' : 'mat', level + 2, item.data,
                        describe('mat', item.data, node));
                    if (item.data.leg) {
                        walk(item.data.leg, level + 3);
                    }
                }
            });
        }
        walk(tree, 0);
        UI.modal('Show Details', el('div.nl-eng-split', left, right));
        if (left.firstChild) {
            left.firstChild.click();
        }
    }

    function infoList(rows) {
        return el('dl.details-grid', rows.filter(function (row) {
            return row[1] !== null && row[1] !== undefined && row[1] !== '';
        }).map(function (row) {
            return [el('dt', row[0]), el('dd', String(row[1]))];
        }).reduce(function (a, b) {
            return a.concat(b);
        }, []));
    }

    function availabilityDialog(kind, id) {
        /* A work order: Inventory's Material Availability (N-Line's own
         * Jobshop layout) */
        if (kind === 'production' && global.JobshopInventory &&
                global.JobshopInventory.workOrderAvailability) {
            global.JobshopInventory.workOrderAvailability(id);
            return;
        }
        Rpc.desk('eng_availability', [kind, id]).then(function (rows) {
            UI.modal('Material Availability', el('div.nl-eng-scroll', table([
                'Seq', 'Piece', 'Part', '#Required', 'U/M', '#On hand',
                '#Available', 'Status'], rows.map(function (r) {
                    return el('tr' + (r.short ? '.short' : ''), td(r.operation),
                        td(r.piece), td(r.product), td(num(r.required), true),
                        td(r.unit), td(num(r.on_hand), true),
                        td(num(r.available), true), el('td', r.issued ?
                            'Issued' : r.short ? el('strong', {style: {color:
                                'var(--bad)'}}, 'SHORT') : 'Available'));
                }), 'No material.')));
        }, UI.showError);
    }

    function supplyDemandDialog(productId) {
        /* The one Supply & Demand dialog: Planning's */
        if (global.JobshopPlanning && global.JobshopPlanning.supplyDemand) {
            global.JobshopPlanning.supplyDemand(productId);
            return;
        }
        Rpc.desk('eng_supply_demand', [productId]).then(function (r) {
            UI.modal('Supply and Demand: ' + r.product, el('div.nl-eng-scroll',
                table(['Date', 'Kind', 'Document', '#Supply', '#Demand',
                    '#Balance'], r.rows.map(function (row) {
                        return el('tr', td(UI.date(row.date)), td(row.kind),
                            td(row.document), td(num(row.supply), true),
                            td(num(row.demand), true), el('td.num' +
                                (row.balance < 0 ? '.bad' : ''),
                                num(row.balance)));
                    }))));
        }, UI.showError);
    }
    JS.supplyDemand = supplyDemandDialog;

    function transactionsDialog(id, which) {
        Rpc.desk('eng_transactions', [id]).then(function (r) {
            if (which === 'inventory') {
                UI.modal('Inventory Transactions', el('div.nl-eng-scroll',
                    table(['Date', 'Work Order', 'Type', 'Part', '#Qty',
                        'U/M', 'Location', '#Cost'], r.inventory.map(
                        function (t) {
                            return el('tr', td(UI.date(t.date)),
                                td(t.work_order), td(t.kind), td(t.product),
                                td(num(t.quantity), true), td(t.unit),
                                td(t.location), td(money(t.cost), true));
                        }), 'No inventory transaction.')));
            } else {
                UI.modal('Labor Transactions', el('div.nl-eng-scroll',
                    table(['Date', 'Work Order', 'Operation', 'Employee',
                        '#Hours', '#Cost', 'Status'], r.labor.map(function (t) {
                            return el('tr', td(UI.date(t.date)),
                                td(t.work_order), td(t.operation),
                                td(t.employee), td(num(t.hours, 2), true),
                                td(money(t.cost), true), td(t.state));
                        }), 'No labor transaction.')));
            }
        }, UI.showError);
    }

    /* View > Sales Order Links (VShopFloor WOSalesLinks: Sales Order Line
     * Links for Work Order) */
    function salesLinksDialog(id, perm, number) {
        Rpc.desk('eng_sales_links', [id]).then(function (rows) {
            UI.modal('Sales Order Line Links for Work Order :: ' + (number ||
                ''), table(['Sales Order ID', 'Line No', 'Customer ID',
                'Customer Name', '#Link Qty', '#Sales Order Qty',
                '#Shipped Qty', 'Line Status'], rows.map(function (r) {
                    var customer = code(r.customer);
                    return el('tr', el('td', perm.screen('orders') ? el('a', {
                        href: '#', onclick: function (event) {
                            event.preventDefault();
                            UI.openScreen('orders/' + r.sale_id);
                        }}, r.sale) : r.sale), td(r.line_no),
                        td(customer.code || customer.name),
                        td(customer.code ? customer.name : ''),
                        td(num(r.link_quantity), true),
                        td(num(r.quantity) + ' ' + r.unit, true),
                        td(num(r.shipped), true), td(r.state));
                }), 'The work order is not linked to a sales order line.'));
        }, UI.showError);
    }

    /* View > Purchase Order Links (VShopFloor WOPOLinks), of the work order
     * or of one card */
    function poLinksTable(rows, perm) {
        return table(['Order ID', 'Line No', 'Supplier ID',
            'Part / Service', 'Work Order', 'Seq No', 'Pc No',
            '#Order Qty', '#Linked Qty', "#Rec'd Qty", 'Status'],
            rows.map(function (r) {
                return el('tr', el('td', perm.screen('purchase-orders') ?
                    el('a', {href: '#', onclick: function (event) {
                        event.preventDefault();
                        UI.openScreen('purchase-orders/' + r.purchase_id);
                    }}, r.purchase) : r.purchase), td(r.line_no),
                    td(code(r.supplier).code || r.supplier), td(r.product),
                    td(r.work_order), td(r.operation), td(r.piece),
                    td(num(r.order_qty) + ' ' + r.unit, true),
                    td(num(r.linked_qty), true), td(num(r.received_qty), true),
                    td(r.state));
            }), 'No purchase order is linked.');
    }
    function poLinksDialog(id, perm, number) {
        Rpc.desk('eng_po_links', [id, null, null]).then(function (rows) {
            UI.modal('Purchase Order Links for ' + (number || ''),
                el('div.nl-eng-scroll', poLinksTable(rows, perm)));
        }, UI.showError);
    }

    /* View Drawing: the drawing file the card references */
    function viewDrawing(path) {
        if (!path) {
            UI.toast('No drawing file on this card.', 'error');
            return;
        }
        var link = /^[a-z]+:\/\//i.test(path) ? path : 'file:///' +
            path.replace(/\\/g, '/');
        UI.modal('View Drawing', [el('p', 'Drawing file:'), el('p', el('a', {
            href: link, target: '_blank', rel: 'noopener'}, path)),
            el('p.nl-eng-muted', 'A browser opens files of the network ' +
                'drives only when allowed; copy the path to open it in ' +
                'Explorer otherwise.')]);
    }

    /* Picture: the pictures of a record (its Picture tab) */
    function pictureDialog(model, id, title) {
        var pane = el('div', {style: {minWidth: '420px'}});
        UI.modal('Picture: ' + title, pane);
        UI.pictureTab(pane, model, id, false);
    }

    /* ---- The information cards (Details tab) --------------------------- */

    var CARD_W = 230, CARD_H = 64, STEP_X = 14, STEP_Y = 20;
    /* The header card is a card like the others (as in Jobshop) */
    var PROD_W = CARD_W, PROD_H = CARD_H, LEG_GAP = 32, MARGIN = 16;
    /* Where a leg's line leaves its operation card: below the card stacked
     * behind it, through the card's visible right edge */
    var LEG_LINE_Y = CARD_H - 10;
    var STATUS = {unreleased: 'Unreleased', firm: 'Firm', hold: 'Hold',
        released: 'Released', closed: 'Closed', cancelled: 'Cancelled'};
    var LETTER = {unreleased: 'U', firm: 'F', hold: 'H', released: 'R',
        closed: 'C', cancelled: 'X'};

    var materialOrder = 'sequence';

    /* The cards of a work order or a master in Jobshop's order: for each
     * operation (by sequence) its material cards (by piece, or the chosen
     * Order Materials By), then the operation */
    function order(node) {
        var works = (node.works || []).slice().sort(function (a, b) {
            return (a.sequence || 0) - (b.sequence || 0);
        });
        var cards = (node.cards || []).slice().sort(function (a, b) {
            if (materialOrder === 'part') {
                return String(a.product).localeCompare(String(b.product));
            }
            if (materialOrder === 'description') {
                return String(a.description || '').localeCompare(
                    String(b.description || ''));
            }
            if (materialOrder === 'reference') {
                return String(a.reference || '').localeCompare(
                    String(b.reference || ''));
            }
            return (a.operation || 0) - (b.operation || 0) ||
                (a.piece || 0) - (b.piece || 0);
        });
        var byWork = works.map(function () {
            return [];
        });
        var loose = [];
        cards.forEach(function (card) {
            var index = -1;
            works.forEach(function (work, i) {
                if (work.sequence !== null &&
                        (card.operation || 0) >= work.sequence) {
                    index = i;
                }
            });
            (index < 0 ? loose : byWork[index]).push(card);
        });
        var result = loose.map(function (card) {
            return {kind: 'mat', data: card};
        });
        works.forEach(function (work, i) {
            byWork[i].forEach(function (card) {
                result.push({kind: 'mat', data: card});
            });
            result.push({kind: 'op', data: work});
        });
        return result;
    }

    /* The positions of the cards of an order or master and its legs. As in
     * Jobshop a leg hangs off the OPERATION its material is used at: its
     * stack stands right beside the parent stack, its header card level with
     * that operation card, so the line between them is straight. Legs of
     * legs the same way, each further right. */
    function layout(tree) {
        var nodes = [], links = [];

        /* Place the stack of node with its header card's top at (x, y);
         * return the right edge of the stack and of its legs */
        function place(node, parentCard, x, y) {
            var items = order(node);
            var n = items.length;
            var z = n + 2;
            var prod = {kind: 'prod', x: x, y: y, w: PROD_W, h: PROD_H, z: z,
                data: node, card: parentCard};
            nodes.push(prod);
            items.forEach(function (item, i) {
                item.node = {kind: item.kind, x: x + (i + 1) * STEP_X,
                    y: y - (i + 1) * STEP_Y, w: CARD_W, h: CARD_H,
                    z: z - i - 1, data: item.data, root: node};
                nodes.push(item.node);
            });
            var right = x + Math.max(PROD_W, n * STEP_X + CARD_W);
            var legsRight = -Infinity;
            items.forEach(function (item, i) {
                if (item.kind !== 'mat' || !item.data.leg) {
                    return;
                }
                /* The operation the material is used at: the next operation
                 * card of the stack (the material itself when none) */
                var op = item;
                for (var j = i + 1; j < n; j++) {
                    if (items[j].kind === 'op') {
                        op = items[j];
                        break;
                    }
                }
                /* Close to the trunk: the leg climbs parallel to the stack
                 * just right of the operation; a next leg right of the
                 * legs already placed */
                var lineY = op.node.y + LEG_LINE_Y;
                var legX = Math.max(op.node.x + CARD_W + LEG_GAP,
                    legsRight + LEG_GAP);
                var legRight = place(item.data.leg, item.data, legX,
                    lineY - PROD_H / 2);
                links.push({from: op.node, to: nodes.filter(
                    function (m) {
                        return m.kind === 'prod' && m.data === item.data.leg;
                    })[0]});
                legsRight = legRight;
                right = Math.max(right, legRight);
            });
            return right;
        }

        var right = place(tree, null, 0, 0);
        /* Into view: the highest card at the top margin */
        var top = Math.min.apply(null, nodes.map(function (m) {
            return m.y;
        }));
        var bottom = 0;
        nodes.forEach(function (m) {
            m.x += MARGIN;
            m.y += MARGIN - top;
            bottom = Math.max(bottom, m.y + m.h);
        });
        return {nodes: nodes, links: links, width: right + 2 * MARGIN,
            height: bottom + MARGIN};
    }

    /* cards(pane, {kind: 'production'|'bom', id, perm, title, onHeader(),
     * masters: true (the drag-a-master panel), onChange(tree)}) ->
     * {reload, menu(name), tree()} */
    function cards(pane, opts) {
        var perm = opts.perm;
        var kind = opts.kind;
        var tree = null, shown = null, sizer = null, zoom = 1;
        var selected = null;
        var rightInfo = false, dataTips = false;
        var canvasWrap = el('div.canvas-wrap');
        var zoomLabel = el('span.muted', {style: {minWidth: '42px',
            textAlign: 'center'}}, '100%');
        var info = el('span.muted');
        var toolbar = el('div.legend',
            el('span', el('i.card-op'), 'operation'),
            el('span', el('i.card-out'), 'outside service'),
            el('span', el('i.card-mat'), 'material'),
            el('span', el('i.card-closed'), 'closed (C)'),
            el('span', el('i', {style: {borderLeft: '5px solid var(--leg)'}}),
                'leg'),
            kind === 'production' ? el('span', el('i', {style: {boxShadow:
                '0 0 0 2px var(--bad)'}}), 'short') : null,
            info,
            el('span.spacer'),
            el('button', {type: 'button', title: 'Zoom out', 'aria-label':
                'Zoom out', onclick: function () {
                    setZoom(zoom / 1.25);
                }}, '−'),
            zoomLabel,
            el('button', {type: 'button', title: 'Zoom in', 'aria-label':
                'Zoom in', onclick: function () {
                    setZoom(zoom * 1.25);
                }}, '+'),
            el('button', {type: 'button', title: 'Actual size', onclick:
                function () {
                    setZoom(1);
                }}, '100%'));
        var mastersPanel = null, masterList = null;
        if (opts.masters) {
            var masterSearch = el('input', {type: 'text', placeholder:
                'Search masters (part or name)', 'aria-label':
                'Search masters'});
            masterList = el('div');
            mastersPanel = el('div.panel.masters',
                el('h2', {style: {marginTop: 0}}, 'Engineering masters'),
                el('p.muted', {style: {fontSize: '12px', margin: '0 0 8px'}},
                    'Drag a revision onto a material card of the same part ' +
                    'to make it a leg.'),
                masterSearch, el('div', {style: {height: '8px'}}),
                masterList);
            var mtimer;
            masterSearch.addEventListener('input', function () {
                clearTimeout(mtimer);
                mtimer = setTimeout(function () {
                    loadMasters(masterSearch.value.trim());
                }, 250);
            });
        }
        pane.appendChild(mastersPanel ? el('div.wo-layout', mastersPanel,
            el('div', toolbar, canvasWrap)) : el('div', toolbar, canvasWrap));

        var masters = [];
        function loadMasters(text) {
            Rpc.desk('masters', [text || '', 40]).then(function (result) {
                masters = result;
                UI.clear(masterList);
                result.forEach(function (master) {
                    var parts = code(master.name);
                    masterList.appendChild(el('div.master',
                        el('div.name', parts.code || parts.name),
                        el('div.meta', parts.code ? parts.name : '',
                            master.drawing ? ' · ' + master.drawing : ''),
                        el('div.revs', master.masters.map(function (m) {
                            var chip = el('span.rev' + (m.current ? '.current' :
                                ''), {draggable: 'true', title: 'Rev ' +
                                (m.revision || '-') + ': ' + m.inputs +
                                ' material(s), ' + m.operations +
                                ' operation(s)'}, 'Rev ' + (m.revision ||
                                    '-'));
                            chip.addEventListener('dragstart', function (event) {
                                event.dataTransfer.effectAllowed = 'copy';
                                event.dataTransfer.setData(
                                    'application/x-nline-master',
                                    String(m.product_bom));
                                event.dataTransfer.setData(
                                    'application/x-nline-product-' +
                                    master.product, '1');
                                event.dataTransfer.setData('text/plain',
                                    master.name + ' Rev ' + (m.revision || ''));
                            });
                            return chip;
                        }))));
                });
                if (!result.length) {
                    masterList.appendChild(el('p.muted', 'No master found.'));
                }
            }, UI.showError);
        }

        function load() {
            return Rpc.desk('eng_tree', [kind, opts.id]).then(function (t) {
                tree = t;
                render();
                if (opts.onChange) {
                    opts.onChange(t);
                }
                return t;
            }, UI.showError);
        }
        function done(result) {
            if (result && typeof result === 'object' && result.cards) {
                tree = result;
                render();
                return result;
            }
            return load();
        }

        /* ---- What the user may do ------------------------------------- */

        function isOpen(node) {
            return kind === 'bom' || ['request', 'draft', 'waiting',
                'assigned', 'running'].indexOf(node.state) >= 0;
        }
        function editable(node) {
            node = node || tree;
            if (kind === 'bom') {
                return perm.can('production.bom', 'write') && !tree.private;
            }
            return perm.can('production', 'write') && ['request', 'draft',
                'waiting'].indexOf(node.state) >= 0;
        }
        function opsEditable(node) {
            node = node || tree;
            if (kind === 'bom') {
                return editable(node);
            }
            return perm.can('production', 'write') && isOpen(node);
        }
        function released(node) {
            return ['waiting', 'assigned', 'running'].indexOf(
                (node || tree).state) >= 0;
        }

        /* ---- Actions ----------------------------------------------------- */

        function parentOf(n) {
            return n.root || n.data;
        }

        function addOperation(node) {
            node = node || tree;
            operationDialog({}, function (values) {
                return Rpc.desk('eng_operation_save', [kind, node.id, null,
                    values]).then(function () {
                        return load();
                    });
            });
        }
        function editOperation(op, node, tab) {
            var opKind = op.kind === 'work' ? 'work' : 'step';
            var id = opKind === 'work' ? op.id : op.step_id;
            Rpc.desk('eng_operation', [opKind, id]).then(function (values) {
                operationDialog(values, opsEditable(node) ? function (v) {
                    return Rpc.desk('eng_operation_save', [kind, node.id, id,
                        v]).then(done);
                } : null, {readonly: !opsEditable(node), tab: tab});
            }, UI.showError);
        }
        function addMaterial(node, op) {
            node = node || tree;
            materialDialog({operation: op ? op.sequence : null},
                function (values) {
                    return Rpc.desk('eng_material_save', [kind, node.id, null,
                        values]).then(done);
                }, {master: kind === 'bom'});
        }
        function addMaterials(node, op) {
            node = node || tree;
            var grid = rowsGrid([
                {name: 'product', label: 'Part ID', type: 'many2one',
                    model: 'product.product'},
                {name: 'quantity', label: 'Qty Per', type: 'float',
                    default: 1},
                {name: 'unit', label: 'U/M', type: 'many2one',
                    model: 'product.uom'},
                {name: 'operation', label: 'Seq No', type: 'integer',
                    default: op ? op.sequence : undefined}], []);
            for (var i = 0; i < 5; i++) {
                grid.add(null);
            }
            UI.modal('Add Materials', grid.node, [{label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function (close) {
                    var lines = grid.get().filter(function (r) {
                        return r.product;
                    });
                    if (!lines.length) {
                        return;
                    }
                    Rpc.desk('eng_material_save', [kind, node.id, null,
                        {lines: lines}]).then(function (r) {
                            close();
                            done(r);
                        }, failed);
                    return true;
                }}]);
        }
        function editMaterial(card, node, tab) {
            var matKind = kind === 'bom' ? 'input' : 'card';
            Rpc.desk('eng_material', [matKind, card.id]).then(function (v) {
                var may = editable(node);
                materialDialog(v, may ? function (values) {
                    return Rpc.desk('eng_material_save', [kind, node.id,
                        card.id, values]).then(done);
                } : null, {readonly: !may, master: kind === 'bom', tab: tab});
            }, UI.showError);
        }
        function addLeg(node, op) {
            node = node || tree;
            var product = UI.picker('product.product', {label: 'Part ID',
                domain: [['producible', '=', true]], onselect: function (r) {
                    revisions(r.id);
                }});
            var revision = el('select', {'aria-label': 'Eng ID'});
            var qty = el('input.money', {type: 'text', value: '1',
                'aria-label': 'Qty Per'});
            var seq = el('input.money', {type: 'text', value: op ?
                op.sequence : '', 'aria-label': 'Seq No'});
            function revisions(productId) {
                Rpc.searchRead('product.product-production.bom', [['product',
                    '=', productId]], ['bom.revision', 'bom.rec_name'], {
                        order: [['sequence', 'ASC']]}).then(function (rows) {
                        UI.clear(revision);
                        rows.forEach(function (row, i) {
                            revision.appendChild(el('option', {value: row.id,
                                selected: i === 0 || null}, 'Eng ID ' +
                                ((row['bom.'] || {}).revision || '-') +
                                (i === 0 ? ' (current)' : '')));
                        });
                        if (!rows.length) {
                            revision.appendChild(el('option', {value: ''},
                                'No engineering master'));
                        }
                    }, UI.showError);
            }
            UI.modal('Add Leg/Detail', [el('p.nl-eng-muted', kind === 'bom' ?
                'The part is made in a leg of each work order of this master, ' +
                'from its own engineering master.' : 'The part is made in a ' +
                'leg of this work order from its engineering master.'),
                el('div.nl-eng-form', el('div', el('label.field', 'Part ID'),
                    product.node), el('div', el('label.field', 'Eng ID'),
                    revision), el('div', el('label.field', 'Qty Per'), qty),
                    el('div', el('label.field', 'Seq No'), seq))], [
                {label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function (close) {
                    if (!product.value() || !revision.value) {
                        UI.toast('Choose a fabricated part with a master.',
                            'error');
                        return true;
                    }
                    Rpc.desk('eng_leg_add', [kind, node.id, {product:
                        product.value(), product_bom: parseInt(revision.value,
                            10), quantity: parseFloat(qty.value) || 1,
                        operation: seq.value ? parseInt(seq.value, 10) :
                            null}]).then(function (r) {
                            close();
                            done(r);
                        }, failed);
                    return true;
                }}]);
        }
        function makeLeg(card, productBom) {
            Rpc.desk('masters', ['', 500]).then(function (all) {
                var master = all.filter(function (m) {
                    return m.product === card.product_id;
                })[0];
                if (!master) {
                    UI.toast('No master for ' + card.product, 'error');
                    return;
                }
                var select = el('select', {'aria-label': 'Revision'},
                    master.masters.map(function (m) {
                        var sel = productBom ? m.product_bom === productBom :
                            (card.revision ? m.revision === card.revision :
                                m.current);
                        return el('option', {value: m.product_bom, selected:
                            sel || null}, 'Rev ' + (m.revision || '-') +
                            (m.current ? ' (current)' : ''));
                    }));
                UI.modal('Make leg', [el('p', 'Make ', el('strong',
                    card.product), ' (' + card.quantity + ' ' + card.unit +
                    ') in a leg of ' + tree.number + '.'),
                    el('label.field', 'Revision'), select], [{label: 'Cancel'},
                    {label: 'Make leg', primary: true, onclick: function () {
                        Rpc.desk('make_leg', [card.id, parseInt(select.value,
                            10)]).then(function () {
                                UI.toast('Leg made for ' + card.product, 'ok');
                                load();
                            }, UI.showError);
                    }}]);
            }, UI.showError);
        }
        function removeLeg(card) {
            UI.confirm('Remove leg', 'Remove the leg of ' + card.product +
                ' and supply the card from stock?').then(function (ok) {
                    if (ok) {
                        Rpc.desk('eng_card_delete', ['leg', card.id]).then(
                            load, UI.showError);
                    }
                });
        }
        function deleteCard(n) {
            var d = n.data;
            if (n.kind === 'op') {
                return Rpc.desk('eng_card_delete', [d.kind === 'work' ?
                    'work' : 'step', d.kind === 'work' ? d.id : d.step_id,
                    kind, n.root.id]);
            }
            if (n.kind === 'mat') {
                return d.supply === 'leg' && kind === 'production' ?
                    Rpc.desk('eng_card_delete', ['leg', d.id]) :
                    Rpc.desk('eng_card_delete', [kind === 'bom' ? 'input' :
                        'card', d.id]);
            }
            return Rpc.desk('eng_card_delete', [kind === 'bom' ? 'input' :
                'leg', n.card.id, kind, opts.id]);
        }
        function remove(n) {
            var d = n.data;
            var what = n.kind === 'op' ? 'operation ' + (d.sequence || '') +
                ' ' + d.operation : n.kind === 'mat' ? 'material ' +
                d.product : 'leg ' + d.number;
            UI.confirm('Delete', 'Delete the ' + what + '?').then(function (ok) {
                if (ok) {
                    deleteCard(n).then(load, UI.showError);
                }
            });
        }
        function changeStatus(target, status) {
            if (target.kind === 'production' && status === 'released' &&
                    !target.dated) {
                /* Vmfg dlgReleaseDate: Set Work Order Release Date */
                var node = (shown && shown.nodes || []).filter(function (x) {
                    return x.kind === 'prod' && x.data.id === target.id;
                })[0];
                var date = el('input', {type: 'date', 'aria-label':
                    'Release Date', value: String((node && node.data
                        .planned_start_date) || new Date().toISOString())
                        .slice(0, 10)});
                UI.modal('Set Work Order Release Date', el('div',
                    el('label.field', 'Release Date'), date), [
                    {label: 'Cancel'},
                    {label: 'OK', primary: true, onclick: function (close) {
                        Rpc.model('production', 'write', [[target.id], {
                            planned_start_date: date.value ? Rpc.date(
                                date.value) : null}]).then(function () {
                                close();
                                changeStatus({kind: target.kind, id:
                                    target.id, dated: true}, status);
                            }, UI.showError);
                        return true;
                    }}]);
                return;
            }
            UI.service('eng_change_status', {kind: target.kind, id:
                target.id, status: status}).then(function () {
                    UI.toast('Status: ' + (STATUS[status] || status), 'ok');
                    load();
                    if (opts.onHeader) {
                        opts.onHeader();
                    }
                }, failed);
        }
        function statusMenu(n) {
            if (kind !== 'production' || !perm.can('production', 'write')) {
                return null;
            }
            var d = n.data;
            if (n.kind === 'prod') {
                var s = d.order_status;
                if (s === 'closed') {
                    return null;
                }
                return submenu('Change Status', ['unreleased', 'firm', 'hold',
                    'released', 'closed', 'cancelled'].filter(function (x) {
                        return x !== s && !(s === 'cancelled' &&
                            x === 'closed');
                    }).map(function (x) {
                        return {label: STATUS[x], onclick: function () {
                            changeStatus({kind: 'production', id: d.id}, x);
                        }};
                    }));
            }
            if (n.kind === 'op' && d.kind === 'work' && d.id &&
                    ['finished', 'done'].indexOf(d.state) < 0) {
                return submenu('Change Status', [{label: 'Closed', onclick:
                    function () {
                        changeStatus({kind: 'work', id: d.id}, 'closed');
                    }}, ['request', 'draft'].indexOf(d.state) >= 0 ? {label:
                        'Cancelled', onclick: function () {
                            changeStatus({kind: 'work', id: d.id},
                                'cancelled');
                        }} : null]);
            }
            if (n.kind === 'mat' && d.supply !== 'leg' && d.state !== 'done' &&
                    d.state !== 'cancelled' && perm.can('stock.move',
                        'create')) {
                return submenu('Change Status', [released(n.root) ? {label:
                    'Closed (issued)', onclick: function () {
                        changeStatus({kind: 'card', id: d.id}, 'closed');
                    }} : null, {label: 'Cancelled', onclick: function () {
                        changeStatus({kind: 'card', id: d.id}, 'cancelled');
                    }}]);
            }
            return null;
        }
        function laborMenu(n) {
            var d = n.data;
            if (kind !== 'production' || n.kind !== 'op' || d.kind !== 'work' ||
                    !d.id || !released(n.root) || ['finished', 'done'].indexOf(
                        d.state) >= 0 || !perm.can('production.work.cycle',
                            'create') || !perm.can('company.employee', 'read')) {
                return null;
            }
            return {label: 'Start Labor Ticket for Employee ▸', onclick:
                function () {
                    var at = {x: lastXY.x + 40, y: lastXY.y};
                    Rpc.desk('eng_employees', []).then(function (rows) {
                        UI.contextMenu({preventDefault: function () {},
                            clientX: at.x, clientY: at.y}, rows.length ?
                            rows.map(function (e) {
                                return {label: e.name, onclick: function () {
                                    Rpc.desk('eng_start_labor', [d.id, e.id])
                                        .then(function () {
                                            UI.toast('Labor ticket started for ' +
                                                e.name, 'ok');
                                            load();
                                        }, UI.showError);
                                }};
                            }) : [{label: '(no employee)', onclick:
                                function () {}}]);
                    }, UI.showError);
                }};
        }
        function purchase(target, id) {
            Rpc.desk('eng_purchase', [target, id]).then(function (pid) {
                UI.toast('Purchase order made', 'ok');
                if (perm.screen('purchase-orders')) {
                    UI.openScreen('purchase-orders/' + pid);
                }
                load();
            }, UI.showError);
        }
        function schedule() {
            Rpc.desk('eng_schedule', [tree.id, null]).then(function (r) {
                UI.toast('Scheduled: ' + r.hours + ' h, start ' +
                    UI.date(r.start) + ', finish ' + UI.date(r.finish), 'ok');
                if (opts.onHeader) {
                    opts.onHeader();
                }
                load();
            }, UI.showError);
        }
        /* Print / Print Preview of the work order or of a leg: its
         * traveler (Printed Date) */
        function traveler(id) {
            id = typeof id === 'number' ? id : tree.id;
            Rpc.report('production.traveler', [id]).then(function (r) {
                UI.openReport(r, 'Traveler');
                Rpc.desk('eng_printed', [id]).then(function () {
                    if (opts.onHeader) {
                        opts.onHeader();
                    }
                }, function () {});
            }, UI.showError);
        }
        function variables() {
            var model = kind === 'bom' ? 'bom' : 'production';
            Rpc.desk('eng_variables', [model, tree.id]).then(function (rows) {
                var grid = rowsGrid([{name: 'name', label: 'Name',
                    type: 'char'}, {name: 'value', label: 'Value',
                    type: 'float'}], rows);
                var may = kind === 'bom' ? editable() : editable(tree);
                UI.modal('Variables', [el('p.nl-eng-muted', 'A material whose ' +
                    'Dimensions use the variables (e.g. LENGTH * WIDTH) gets ' +
                    'its quantity from them.'), grid.node], may ? [
                    {label: 'Cancel'}, {label: 'OK', primary: true, onclick:
                        function (close) {
                            Rpc.desk('eng_variables_save', [model, tree.id,
                                grid.get()]).then(function (r) {
                                    close();
                                    done(r);
                                }, failed);
                            return true;
                        }}] : [{label: 'Close', primary: true}]);
            }, UI.showError);
        }
        function coproducts() {
            var model = kind === 'bom' ? 'bom' : 'production';
            Rpc.desk('eng_coproducts', [model, tree.id]).then(function (rows) {
                var grid = rowsGrid([{name: 'product', label: 'Co-Product Part',
                    type: 'many2one', model: 'product.product'}, {name:
                    'quantity', label: 'Qty', type: 'float', default: 1},
                    {name: 'unit', label: 'U/M', type: 'many2one',
                        model: 'product.uom'}], rows);
                var may = kind === 'bom' ? editable() : (perm.can('production',
                    'write') && ['request', 'draft'].indexOf(tree.state) >= 0);
                UI.modal('Co-Products', grid.node, may ? [{label: 'Cancel'},
                    {label: 'OK', primary: true, onclick: function (close) {
                        Rpc.desk('eng_coproducts_save', [model, tree.id,
                            grid.get()]).then(function () {
                                close();
                                load();
                            }, failed);
                        return true;
                    }}] : [{label: 'Close', primary: true}]);
            }, UI.showError);
        }

        /* ---- The details of a card (Show Details, Right-click Info,
         * DataTips) -------------------------------------------------------- */

        function describe(what, d, root) {
            if (what === 'prod') {
                return [
                    [kind === 'bom' ? (d.master_type === 'quote' ?
                        'Quote Master ID' : 'Master') : 'Work Order ID',
                        d.number],
                    ['Part ID', d.product],
                    ['Description', d.description],
                    ['Eng ID', d.revision],
                    ['Quantity', num(d.quantity) + ' ' + (d.unit || '')],
                    ['Status', kind === 'bom' ? (d.private ? 'Private' : '') :
                        STATUS[d.order_status] || d.state],
                    ['Release Date', UI.date(d.planned_start_date)],
                    ['Want Date', UI.date(d.planned_date)],
                    ["Rec'd Qty", d.received_quantity],
                    ['For', d.origin],
                    ['Drawing', d.drawing_number],
                    ['Drawing File', d.drawing_file],
                    ['Cost', d.cost !== null && d.cost !== undefined ?
                        UI.money(d.cost) : ''],
                    ['Short', kind === 'production' ? (d.shortage ? 'Yes' :
                        'No') : '']];
            }
            if (what === 'op') {
                return [
                    ['Seq No', d.sequence],
                    ['Resource ID', d.work_center || d.operation],
                    ['Description', d.description],
                    ['Work Order', kind === 'production' ? root.number : ''],
                    ['Status', d.state],
                    ['Setup Hours', d.setup_hours ? num(d.setup_hours, 2) : ''],
                    ['Run', d.run ? num(d.run) + ' ' + ((RUN_TYPES.filter(
                        function (r) {
                            return r[0] === d.run_type;
                        })[0] || [])[1] || '') : ''],
                    ['Planned hours', d.planned_duration ?
                        num(d.planned_duration, 2) : ''],
                    ['Service ID', d.service],
                    ['Supplier', d.supplier],
                    ['Purchase order', d.purchase],
                    ['Expected', UI.date(d.expected_date)],
                    ['Additional resources', d.resources || ''],
                    ['Cost', d.cost !== null && d.cost !== undefined ?
                        UI.money(d.cost) : '']];
            }
            return [
                ['Seq No', d.operation],
                ['Piece No', d.piece],
                ['Part ID', d.product],
                ['Description', d.description],
                ['Quantity', num(d.quantity) + ' ' + d.unit],
                ['Pinned Eng ID', d.revision],
                ['Supply', d.supply === 'leg' ? 'Leg' + (d.leg ? ' ' +
                    d.leg.number : '') : d.supply === 'job' ? 'Job ' +
                    (d.job || '') : 'Stock'],
                ['Supplier', d.supplier],
                ['Status', d.state],
                ['Short', kind === 'production' ? (d.short ? 'Yes' : 'No') :
                    '']];
        }
        function infoText(n) {
            return describe(n.kind, n.data, n.root || n.data).filter(
                function (row) {
                    return row[1] !== null && row[1] !== undefined &&
                        row[1] !== '';
                }).map(function (row) {
                    return row[0] + ': ' + row[1];
                }).join('\n');
        }
        var infoBox = null;
        function closeInfo() {
            if (infoBox) {
                infoBox.remove();
                infoBox = null;
            }
        }
        document.addEventListener('mousedown', closeInfo, true);
        function showInfo(event, n) {
            closeInfo();
            infoBox = el('div.nl-eng-info', infoText(n));
            infoBox.style.left = Math.min(event.clientX + 12,
                global.innerWidth - 370) + 'px';
            infoBox.style.top = Math.max(4, event.clientY - 10) + 'px';
            document.body.appendChild(infoBox);
        }

        /* ---- Jobshop's right-click menus ---------------------------------- */

        /* One menu per card, in Jobshop's order (jobshop_menus [Work Order]
         * / [Engineering]); an item the card or the user cannot use is not
         * shown. N-Line's own items follow, after a line. */
        var clipboard = null;
        var copySubordinates = false;
        function sameNode(a, b) {
            return Boolean(a && b && a.kind === b.kind && a.data.id ===
                b.data.id && a.data.step_id === b.data.step_id);
        }

        function options() {
            return [
                {label: (rightInfo ? '✔ ' : '') + 'Right-click Info',
                    onclick: function () {
                        rightInfo = !rightInfo;
                        UI.toast('Right-click Info ' + (rightInfo ? 'on: ' +
                            'right-click a card for its details (the Options ' +
                            'menu turns it off)' : 'off'), 'ok');
                    }},
                {label: (dataTips ? '✔ ' : '') + (kind === 'production' ?
                    'Data Tips' : 'DataTips'), onclick: function () {
                        dataTips = !dataTips;
                        render();
                    }}];
        }
        function orderFind() {
            return [
                submenu('Order Materials By', [['sequence', 'Piece No'],
                    ['part', 'Part ID'], ['description', 'Description'],
                    ['reference', 'Reference']].map(function (o) {
                        return {label: (materialOrder === o[0] ? '✔ ' : '') +
                            o[1], onclick: function () {
                                materialOrder = o[0];
                                render();
                            }};
                    })),
                submenu('Find Materials By', [['part', 'Part ID'],
                    ['description', 'Description'], ['reference',
                        'Reference']].map(function (o) {
                        return {label: o[1] + '...', onclick: function () {
                            find(o[0]);
                        }};
                    }))];
        }
        function views(n) {
            var d = n.data;
            var picture = n.kind === 'prod' ? function () {
                pictureDialog(kind === 'bom' ? 'production.bom' :
                    'production', d.id, d.number);
            } : n.kind === 'mat' && d.template_id ? function () {
                pictureDialog('product.template', d.template_id, d.product);
            } : null;
            return [
                picture ? {label: 'Picture...', onclick: picture} : null,
                /* (greyed without a drawing file, as Jobshop's) */
                {label: 'View Drawing...', disabled: !d.drawing_file,
                    onclick: function () {
                        viewDrawing(d.drawing_file);
                    }},
                {label: 'Show Details...', onclick: function () {
                    detailsDialog(tree, describe);
                }},
                {label: 'Show Costs...', onclick: function () {
                    costsDialog(kind, tree.id, tree.number);
                }}];
        }
        function adds(node, op) {
            var may = opsEditable(node);
            var mayMat = editable(node) && (kind === 'bom' || perm.can(
                'production.material_card', 'write'));
            return [
                may ? {label: 'Add Operation...', onclick: function () {
                    addOperation(node);
                }} : null,
                mayMat ? {label: 'Add Material...', onclick: function () {
                    addMaterial(node, op);
                }} : null,
                mayMat ? {label: 'Add Materials...', onclick: function () {
                    addMaterials(node, op);
                }} : null,
                mayMat && (kind === 'bom' || perm.can('production',
                    'create')) ? {label: 'Add Leg/Detail...', onclick:
                    function () {
                        addLeg(node, op);
                    }} : null];
        }
        function variablesItem(n) {
            var d = n.data;
            if (n.kind !== 'prod') {
                return null;
            }
            return kind === 'bom' || (!n.card && editable(d)) ? {label:
                'Variables...', onclick: variables} : null;
        }

        /* Cut / Copy / Paste of cards (Copying and Pasting Information
         * Cards): a material onto an operation, an operation onto a header
         * (or a leg's), a leg onto an operation. Cut moves the card: it is
         * deleted once pasted (the cards are saved at once here, Jobshop
         * deletes the cut cards when the order is saved). */
        function clipKind(n) {
            if (n.kind === 'prod') {
                return n.card ? 'leg' : null;
            }
            return n.kind === 'mat' && n.data.supply === 'leg' &&
                kind === 'production' ? 'leg' : n.kind;
        }
        function canCut(n) {
            var item = menuDelete(n);
            return Boolean(item);
        }
        function clipItems(n) {
            var what = clipKind(n);
            var target = clipboard ? (clipboard.what === 'mat' || clipboard
                .what === 'leg' ? n.kind === 'op' : clipboard.what === 'op' ?
                n.kind === 'prod' : false) : false;
            var node = n.kind === 'prod' ? n.data : n.root;
            var mayPaste = target && (clipboard.what === 'op' ?
                opsEditable(node) : editable(node));
            return [
                what && canCut(n) ? {label: clipboard && clipboard.cut &&
                    sameNode(clipboard.n, n) ? '✔ Cut' : 'Cut', onclick: function () {
                        clipboard = clipboard && clipboard.cut &&
                            sameNode(clipboard.n, n) ? null : {what: what, n: n,
                                cut: true};
                        render();
                    }} : null,
                what ? {label: 'Copy', onclick: function () {
                    clipboard = {what: what, n: n, cut: false};
                    UI.toast('Copied: paste it on ' + (what === 'op' ?
                        'a header card' : 'an operation card') + '.', 'ok');
                    render();
                }} : null,
                mayPaste ? {label: 'Paste', onclick: function () {
                    paste(n);
                }} : null];
        }
        function stripMaterial(v) {
            var out = {};
            Object.keys(v).forEach(function (k) {
                if (['id', 'kind', 'state', 'supply', 'cost_price']
                        .indexOf(k) < 0) {
                    out[k] = v[k];
                }
            });
            if (kind !== 'bom') {
                delete out.leg_detail;
            }
            out.piece = null;
            return out;
        }
        function copyMaterial(source, targetRoot, sequence) {
            var srcKind = kind === 'bom' ? 'input' : 'card';
            return Rpc.desk('eng_material', [srcKind, source.id]).then(
                function (v) {
                    var values = stripMaterial(v);
                    values.operation = sequence;
                    return Rpc.desk('eng_material_save', [kind, targetRoot.id,
                        null, values]);
                });
        }
        function copyLeg(card, targetRoot, sequence) {
            if (kind === 'bom') {
                return copyMaterial(card, targetRoot, sequence);
            }
            return Rpc.desk('eng_leg_add', [kind, targetRoot.id, {product:
                card.product_id, quantity: card.quantity, operation:
                sequence}]);
        }
        function copyOperation(op, targetRoot, sourceRoot) {
            var opKind = op.kind === 'work' ? 'work' : 'step';
            var id = opKind === 'work' ? op.id : op.step_id;
            return Rpc.desk('eng_operation', [opKind, id]).then(function (v) {
                var values = {};
                Object.keys(v).forEach(function (k) {
                    if (['id', 'kind', 'sequence', 'state', 'planned_hours']
                            .indexOf(k) < 0) {
                        values[k] = v[k];
                    }
                });
                values.resources = (v.resources || []).map(function (r) {
                    return {resource: r.resource, step_type: r.step_type,
                        duration_percent: r.duration_percent,
                        justification: r.justification};
                });
                return Rpc.desk('eng_operation_save', [kind, targetRoot.id,
                    null, values]);
            }).then(function (t) {
                if (!copySubordinates) {
                    return t;
                }
                /* Copy Subordinates: the operation's materials and legs */
                var sequence = Math.max.apply(null, (t.works || []).map(
                    function (w) {
                        return w.sequence || 0;
                    }).concat([0]));
                var cards = (sourceRoot.cards || []).filter(function (c) {
                    return c.operation === op.sequence;
                });
                return cards.reduce(function (p, c) {
                    return p.then(function () {
                        return c.supply === 'leg' ? copyLeg(c, targetRoot,
                            sequence) : copyMaterial(c, targetRoot, sequence);
                    });
                }, Promise.resolve());
            });
        }
        function paste(n) {
            var clip = clipboard;
            var call;
            if (clip.what === 'op') {
                call = copyOperation(clip.n.data, n.data, clip.n.root);
            } else if (clip.what === 'leg') {
                call = copyLeg(clip.n.kind === 'prod' ? clip.n.card :
                    clip.n.data, n.root, n.data.sequence);
            } else {
                call = copyMaterial(clip.n.data, n.root, n.data.sequence);
            }
            call.then(function () {
                if (!clip.cut) {
                    return null;
                }
                clipboard = null;
                return deleteCard(clip.n);
            }).then(function () {
                UI.toast('Pasted', 'ok');
                load();
            }, function (error) {
                failed(error);
                load();
            });
        }

        /* Request Quote/Purchase this Material/Service (VShopFloor
         * PurchaseMaterial / PurchaseService): the card, its purchase order
         * links, Create Request For Quote and Create Purchase Order */
        function purchaseDialog(n) {
            var d = n.data;
            var isWork = n.kind === 'op';
            var target = isWork ? 'work' : 'card';
            Rpc.desk('eng_po_links', [tree.id, target, d.id]).then(
                function (rows) {
                    var facts = isWork ? [['Workorder ID', n.root.number],
                        ['Seq #', d.sequence], ['Operation', d.operation],
                        ['Supplier ID', d.supplier], ['Service', d.service],
                        ['Description', d.description]] : [
                        ['Workorder ID', n.root.number], ['Seq No',
                            d.operation], ['Pc No', d.piece], ['Part',
                            d.product], ["Req'd Qty", num(d.quantity) + ' ' +
                            (d.unit || '')], ['Supplier ID', d.supplier],
                        ['Reference', d.reference]];
                    var mayPo = perm.can('purchase.purchase', 'create') &&
                        d.state !== 'done' && !(isWork && d.purchase_id);
                    var buttons = [{label: 'Close'}];
                    if (perm.screen('rfqs')) {
                        buttons.push({label: 'Create Request For Quote',
                            onclick: function () {
                                UI.openScreen('rfqs');
                            }});
                    }
                    if (mayPo) {
                        buttons.push({label: 'Create Purchase Order',
                            primary: true, onclick: function () {
                                purchase(target, d.id);
                            }});
                    }
                    UI.modal((isWork ? 'Purchase Service :: ' :
                        'Purchase Material :: ') + n.root.number + ' - ' +
                        (isWork ? d.sequence : d.product), [infoList(facts),
                        el('h3', 'Existing Purchase Order Links for the ' +
                            'selected ' + (isWork ? 'service operation' :
                                'material')), poLinksTable(rows, perm)],
                        buttons);
                }, UI.showError);
        }

        /* The Delete item of a card (also the Del key and Cut) */
        function menuDelete(n) {
            var d = n.data;
            if (n.kind === 'prod') {
                if (!n.card) {
                    return null;
                }
                var mayLeg = kind === 'production' ? ['request', 'draft']
                    .indexOf(d.state) >= 0 && perm.can('production', 'delete') :
                    editable();
                return mayLeg ? {label: 'Delete', onclick: function () {
                    remove(n);
                }} : null;
            }
            if (n.kind === 'op') {
                var closed = d.state === 'done' || d.state === 'finished';
                return opsEditable(n.root) && !closed && (d.kind !== 'work' ||
                    ['request', 'draft'].indexOf(d.state) >= 0) ? {label:
                        'Delete', onclick: function () {
                            remove(n);
                        }} : null;
            }
            return editable(n.root) && d.state !== 'done' && (kind === 'bom' ||
                perm.can('production.material_card', 'delete')) ? {label:
                    'Delete', onclick: function () {
                        remove(n);
                    }} : null;
        }
        function editItem(n) {
            var d = n.data;
            if (n.kind === 'prod') {
                return {label: 'Edit...', onclick: function () {
                    if (!n.card && opts.onEdit) {
                        opts.onEdit();
                    } else if (kind === 'production') {
                        UI.openScreen('work-orders/' + d.id);
                    } else {
                        UI.openScreen((d.master_type === 'quote' ?
                            'quote-masters/' : 'masters/') + d.id);
                    }
                }};
            }
            if (n.kind === 'op') {
                var closed = d.state === 'done' || d.state === 'finished';
                return {label: opsEditable(n.root) && !closed ? 'Edit...' :
                    'View...', onclick: function () {
                        editOperation(d, n.root);
                    }};
            }
            return {label: editable(n.root) && d.state !== 'done' ?
                'Edit...' : 'View...', onclick: function () {
                    editMaterial(d, n.root);
                }};
        }
        function openItems(n) {
            var d = n.kind === 'prod' && n.card ? Object.assign({}, n.data,
                {template_id: n.data.template_id}) : n.data;
            var isOp = n.kind === 'op';
            var masterId = n.kind === 'prod' ? (kind === 'production' ?
                d.bom_id : null) : (d.master_bom_id || null);
            return [
                !isOp && d.template_id ? opener(perm, 'parts', 'parts/' +
                    d.template_id, 'Open Part...') : null,
                kind === 'production' && !isOp && d.product_id ? {label:
                    'Open Material Supply and Demand...', onclick: function () {
                        supplyDemandDialog(d.product_id);
                    }} : null,
                isOp && d.work_center_id ? opener(perm, 'resources',
                    'resources/' + d.work_center_id, 'Open Resource...') :
                    null,
                masterId ? opener(perm, 'masters', 'masters/' + masterId,
                    'Open Eng Master for Part...') : null,
                d.supplier ? opener(perm, 'supplier-window', 'supplier-window',
                    'Open Supplier...') : null];
        }
        function menuOf(n) {
            var d = n.data;
            var root = n.kind === 'prod' ? d : n.root;
            var isHeader = n.kind === 'prod';
            var isOp = n.kind === 'op';
            var closed = d.state === 'done' || d.state === 'finished';
            var items;
            if (kind === 'production') {
                var buys = (isOp && d.outside && d.kind === 'work' &&
                    !closed) || (n.kind === 'mat' && d.supply === 'stock' &&
                        d.state !== 'done');
                items = adds(root, isOp ? d : null).concat([
                    variablesItem(n),
                    isHeader && !n.card && perm.can('production', 'write') &&
                        isOpen(d) ? {label: 'Schedule Work Order', onclick:
                            schedule} : null,
                    !isHeader && released(root) && !(n.kind === 'mat' &&
                        d.supply === 'leg') ? opener(perm, 'issues', 'issues',
                            'Issue/Return Materials...') : null,
                    laborMenu(n),
                    editItem(n)
                ], clipItems(n), [
                    menuDelete(n),
                    isHeader ? {label: 'Print Preview', onclick: function () {
                        traveler(d.id);
                    }} : null,
                    isHeader ? {label: 'Print...', onclick: function () {
                        traveler(d.id);
                    }} : null
                ], openItems(n), [
                    buys && (perm.can('purchase.purchase', 'create') ||
                        perm.screen('rfqs') || perm.can('purchase.purchase',
                            'read')) ? {label: 'Request Quote/Purchase this ' +
                                'Material/Service...', onclick: function () {
                                    purchaseDialog(n);
                                }} : null,
                    statusMenu(n)
                ], views(n), options(), orderFind());
                /* N-Line's own items */
                items = items.concat(['-',
                    isHeader ? {label: 'Co-Products...', onclick: coproducts} :
                        null,
                    isHeader && d.sale_id ? opener(perm, 'orders', 'orders/' +
                        d.sale_id, 'Open Sales Order') : null,
                    isHeader && !n.card ? {label: 'Sales Order Links',
                        onclick: function () {
                            salesLinksDialog(d.id, perm, d.number);
                        }} : null,
                    isOp && d.purchase_id ? opener(perm, 'purchase-orders',
                        'purchase-orders/' + d.purchase_id,
                        'Open Purchase Order') : null,
                    n.kind === 'mat' && d.leg ? {label: 'Go to leg ' +
                        d.leg.number, onclick: function () {
                            goTo(d.leg.id);
                        }} : null,
                    n.kind === 'mat' && editable(root) && d.producible &&
                        d.supply === 'stock' && perm.can('production',
                            'create') ? {label: 'Make leg...', onclick:
                                function () {
                                    makeLeg(d, null);
                                }} : null,
                    n.kind === 'mat' && d.supply === 'leg' && (!d.leg ||
                        ['request', 'draft'].indexOf(d.leg.state) >= 0) &&
                        perm.can('production', 'delete') ? {label:
                            'Remove leg', onclick: function () {
                                removeLeg(d);
                            }} : null]);
            } else {
                items = adds(root, isOp ? d : null).concat([
                    variablesItem(n),
                    editItem(n)
                ], clipItems(n), [menuDelete(n)], openItems(n), [
                    isOp && d.outside || n.kind === 'mat' ? opener(perm,
                        'rfqs', 'rfqs', 'Create Request For Quote for ' +
                        'Supplier...') : null
                ], views(n), options(), orderFind(), [
                    isOp && editable(root) ? {label: 'Resequence Materials ' +
                        'for Operation', onclick: function () {
                            Rpc.desk('eng_resequence', ['bom', root.id,
                                d.sequence, 10]).then(done, UI.showError);
                        }} : null,
                    '-',
                    isHeader ? {label: 'Co-Products...', onclick: coproducts} :
                        null]);
            }
            /* No line at the end, nor two in a row */
            items = items.filter(Boolean).filter(function (item, i, all) {
                return item !== '-' || (i > 0 && all[i - 1] !== '-' &&
                    i < all.length - 1);
            });
            return items;
        }

        function find(by) {
            var input = el('input', {type: 'text', 'aria-label': 'Find'});
            UI.modal('Find Materials By ' + (by === 'part' ? 'Part ID' :
                by === 'reference' ? 'Reference' : 'Description'), input, [
                {label: 'Cancel'},
                {label: 'Find', primary: true, onclick: function () {
                    var text = input.value.trim().toLowerCase();
                    var hit = shown && shown.nodes.filter(function (n) {
                        return n.kind === 'mat' && String((by === 'part' ?
                            n.data.product : by === 'reference' ?
                            n.data.reference : n.data.description) || '')
                            .toLowerCase().indexOf(text) >= 0;
                    })[0];
                    if (!hit) {
                        UI.toast('No material found.', 'error');
                        return;
                    }
                    select(hit);
                    reveal(hit);
                }}]);
        }

        function reveal(target) {
            if (!target || !target.el) {
                return;
            }
            canvasWrap.scrollLeft = Math.max(0, target.x * zoom -
                canvasWrap.clientWidth / 3);
            canvasWrap.scrollTop = Math.max(0, (target.y + target.h) * zoom -
                canvasWrap.clientHeight + 40);
            target.el.classList.remove('flash');
            void target.el.offsetWidth;
            target.el.classList.add('flash');
        }
        function goTo(id) {
            reveal(shown && shown.nodes.filter(function (n) {
                return n.kind === 'prod' && n.data.id === id;
            })[0]);
        }
        function select(n) {
            if (selected && selected.el) {
                selected.el.classList.remove('selected');
            }
            selected = n;
            if (n && n.el) {
                n.el.classList.add('selected');
            }
        }

        /* ---- Drawing the cards ----------------------------------------- */

        function icons(d, n) {
            var list = [];
            if (d.drawing_file) {
                list.push(el('button', {type: 'button', title: 'Drawing',
                    onclick: function (event) {
                        event.stopPropagation();
                        viewDrawing(d.drawing_file);
                    }}, 'D'));
            }
            if (d.has_specs) {
                list.push(el('button', {type: 'button', title: 'Specs',
                    onclick: function (event) {
                        event.stopPropagation();
                        if (n.kind === 'op') {
                            editOperation(d, n.root, 1);
                        } else if (n.kind === 'mat') {
                            editMaterial(d, n.root, 1);
                        } else if (opts.onSpecs) {
                            opts.onSpecs();
                        }
                    }}, 'S'));
            }
            if (n.kind === 'op' && d.resources) {
                list.push(el('button', {type: 'button', title:
                    'Additional Resources', onclick: function (event) {
                        event.stopPropagation();
                        editOperation(d, n.root, 3);
                    }}, 'R'));
            }
            return list.length ? el('span.icons', list) : null;
        }
        function pos(n) {
            return {left: n.x + 'px', top: n.y + 'px', width: n.w + 'px',
                height: n.h + 'px', zIndex: n.z};
        }
        function statusOf(root) {
            return kind === 'bom' ? 'unreleased' : root.order_status ||
                'unreleased';
        }
        /* A card's header text, "..." when long (the full text its
         * tooltip) */
        function cardHead(text) {
            return el('span.t', {title: text}, text);
        }
        function prodNode(n) {
            var d = n.data;
            var parts = code(d.product);
            /* The header line: the card (a master by its Eng ID, a quote
             * master by its ID, a work order or leg by its number) and its
             * status; the part's ID, quantity and description below in two
             * lines, never cut mid-way ("..." when long) */
            var head = kind === 'bom' ? (d.master_type === 'quote' ?
                'Quote Master ' + (d.number || '') : 'Master' +
                (d.revision ? ' Eng ' + d.revision : '')) : (n.card ?
                'Leg ' : (d.job ? 'Job ' : 'WO ')) + d.number +
                ' · ' + (STATUS[d.order_status] || d.state) +
                (d.shortage ? ' · SHORT' : '');
            if (kind === 'bom' && d.order_status === 'inactive') {
                head += ' · Inactive';
            }
            head = '(' + (LETTER[statusOf(d)] || 'U') + ') ' + head;
            return el('div.node.prod', {style: pos(n), title: (parts.code ?
                parts.code + ' ' : '') + parts.name},
                el('div.hd', el('span.t', {title: head}, head), icons(d, n)),
                el('div.bd' + (kind === 'bom' ? '' : '.st-' + (d.state ||
                    'draft')), el('div.l1', (parts.code ? parts.code +
                    ' · ' : '') + (kind !== 'bom' && d.revision ? 'Eng ' +
                    d.revision + ' · ' : '') + num(d.quantity) + ' ' +
                    jobshopUnit(d.unit)), el('div.l2', parts.name)));
        }
        function opNode(n) {
            var w = n.data;
            var where = w.outside ? (w.supplier || 'Outside') +
                (w.purchase ? ' · ' + w.purchase : '') +
                (w.expected_date ? ' · due ' + UI.date(w.expected_date) :
                    '') : (w.description || w.work_center || '') +
                (w.planned_duration ? ' · ' + num(w.planned_duration, 2) +
                    ' h' : '');
            var closed = w.state === 'done' || w.state === 'finished';
            return el('div.node.card.op' + (w.outside ? '.outside' : '') +
                (closed ? '.closed' : ''), {style: pos(n)},
                el('div.hd', cardHead('(' + (closed ? 'C' :
                    LETTER[statusOf(n.root)] || 'U') + ') ' + (w.sequence !==
                    null ? w.sequence + ' - ' : '') + (w.work_center ||
                    w.operation)), w.outside ?
                    el('span.tag', 'OUTSIDE') : null, icons(w, n)),
                el('div.bd', where || ' '));
        }
        function matNode(n) {
            var c = n.data;
            var parts = code(c.product);
            var classes = '.node.card.mat' + (c.state === 'done' ?
                '.closed' : '') + (c.supply === 'leg' ? '.leg' : '') +
                (c.short ? '.short' : '');
            var droppable = kind === 'production' && editable(n.root) &&
                c.producible && c.supply === 'stock' &&
                perm.can('production', 'create');
            var tag = c.supply === 'leg' ? 'LEG' : c.supply === 'job' ?
                'JOB ' + (c.job || '') : c.short ? 'SHORT' : 'STOCK';
            var node = el('div' + classes + (droppable ? '.droppable' : ''),
                {style: pos(n)},
                el('div.hd', cardHead('(' + (c.state === 'done' ? 'C' :
                    LETTER[statusOf(n.root)] || 'U') + ') ' + (c.piece ?
                    c.piece + ' - ' : '') + (parts.code || parts.name)),
                    el('span.tag', tag), icons(c, n)),
                el('div.bd', num(c.quantity) + ' ' + jobshopUnit(c.unit) +
                    (c.revision ?
                    ' · Eng ' + c.revision : '') + ' · ' + (parts.code ?
                    parts.name : '')));
            if (droppable) {
                var type = 'application/x-nline-product-' + c.product_id;
                node.addEventListener('dragover', function (event) {
                    var types = Array.prototype.slice.call(
                        event.dataTransfer.types);
                    if (types.indexOf('application/x-nline-master') < 0) {
                        return;
                    }
                    var ok = types.indexOf(type) >= 0;
                    node.classList.toggle('drop-ok', ok);
                    node.classList.toggle('drop-no', !ok);
                    if (ok) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                    }
                });
                node.addEventListener('dragleave', function () {
                    node.classList.remove('drop-ok', 'drop-no');
                });
                node.addEventListener('drop', function (event) {
                    event.preventDefault();
                    node.classList.remove('drop-ok', 'drop-no');
                    makeLeg(c, parseInt(event.dataTransfer.getData(
                        'application/x-nline-master'), 10));
                });
            }
            return node;
        }

        function render() {
            if (!tree) {
                return;
            }
            info.textContent = kind === 'production' ? ((tree.origin ?
                'For ' + tree.origin + ' · ' : '') + 'Want ' +
                UI.date(tree.planned_date)) : (tree.private ? 'Private' : '');
            var plan = layout(tree);
            var canvas = el('div.canvas', {style: {width: plan.width + 'px',
                height: plan.height + 'px'}});
            var svgNS = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', plan.width);
            svg.setAttribute('height', plan.height);
            plan.links.forEach(function (link) {
                /* Straight: from the operation's top line to the leg's
                 * header card, level with it (layout) */
                var sx = link.from.x + link.from.w;
                var sy = link.from.y + LEG_LINE_Y;
                var tx = link.to.x;
                var path = document.createElementNS(svgNS, 'path');
                path.setAttribute('d', 'M' + sx + ' ' + sy + ' L' + tx + ' ' +
                    sy);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#333');
                path.setAttribute('stroke-width', '1.5');
                path.setAttribute('marker-end', 'url(#nl-eng-arrow)');
                svg.appendChild(path);
            });
            var defs = document.createElementNS(svgNS, 'defs');
            defs.innerHTML = '<marker id="nl-eng-arrow" viewBox="0 0 10 10" ' +
                'refX="9" refY="5" markerWidth="7" markerHeight="7" ' +
                'orient="auto"><path d="M0 0 L10 5 L0 10 z" ' +
                'fill="#333"/></marker>';
            svg.appendChild(defs);
            canvas.appendChild(svg);
            var keep = selected;
            selected = null;
            plan.nodes.forEach(function (n) {
                var node = n.kind === 'prod' ? prodNode(n) : n.kind === 'op' ?
                    opNode(n) : matNode(n);
                n.el = node;
                if (clipboard && clipboard.cut && sameNode(clipboard.n, n)) {
                    /* Cut: gray until pasted */
                    node.style.opacity = '0.45';
                }
                if (dataTips) {
                    node.title = infoText(n);
                }
                node.addEventListener('click', function () {
                    select(n);
                });
                node.addEventListener('dblclick', function () {
                    if (n.kind === 'op') {
                        editOperation(n.data, n.root);
                    } else if (n.kind === 'mat') {
                        editMaterial(n.data, n.root);
                    } else if (!n.card && opts.onEdit) {
                        opts.onEdit();
                    }
                });
                node.addEventListener('contextmenu', function (event) {
                    event.stopPropagation();
                    select(n);
                    if (rightInfo) {
                        event.preventDefault();
                        showInfo(event, n);
                        return;
                    }
                    UI.contextMenu(event, menuOf(n));
                });
                if (keep && keep.kind === n.kind && keep.data.id ===
                        n.data.id && keep.data.step_id === n.data.step_id) {
                    selected = n;
                    node.classList.add('selected');
                }
                canvas.appendChild(node);
            });
            canvas.addEventListener('contextmenu', function (event) {
                /* The empty Details area: the header's menu */
                if (rightInfo) {
                    event.preventDefault();
                    return;
                }
                UI.contextMenu(event, menuOf(plan.nodes[0]));
            });
            sizer = el('div.canvas-sizer');
            sizer.appendChild(canvas);
            UI.clear(canvasWrap).appendChild(sizer);
            shown = plan;
            applyZoom();
            canvasWrap.scrollTop = canvasWrap.scrollHeight;
        }
        function applyZoom() {
            if (!sizer || !shown) {
                return;
            }
            var canvas = sizer.firstChild;
            canvas.style.transform = 'scale(' + zoom + ')';
            canvas.style.transformOrigin = '0 0';
            sizer.style.width = shown.width * zoom + 'px';
            sizer.style.height = shown.height * zoom + 'px';
            zoomLabel.textContent = Math.round(zoom * 100) + '%';
        }
        function setZoom(value) {
            zoom = Math.min(2.5, Math.max(0.3, value));
            applyZoom();
        }
        canvasWrap.addEventListener('scroll', UI.closeMenu);
        canvasWrap.addEventListener('wheel', function (event) {
            if (event.ctrlKey) {
                event.preventDefault();
                setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
            }
        }, {passive: false});
        /* Del deletes the selected card (when allowed) */
        canvasWrap.tabIndex = 0;
        canvasWrap.addEventListener('keydown', function (event) {
            if (event.key === 'Delete' && selected) {
                var item = menuOf(selected).filter(function (i) {
                    return i !== '-' && i.label === 'Delete';
                })[0];
                if (item) {
                    item.onclick();
                }
            }
        });

        if (opts.masters) {
            loadMasters('');
        }
        load();

        /* The Tools / View / Options menus of the window act on the selected
         * card, or the header */
        function target() {
            return selected || (shown && shown.nodes[0]);
        }
        return {
            reload: load,
            tree: function () {
                return tree;
            },
            tools: function () {
                var n = target();
                if (!n) {
                    return [];
                }
                /* The card's Tools items (Jobshop's Tools / Edit / Status
                 * commands), in the right-click menu's order */
                var keepLabels = /^(✔ )?(Add |Variables|Schedule|Issue|Start Labor|Edit|View\.\.\.|Cut|Copy$|Paste|Delete|Open |Request Quote|Create Request|Change Status|Order Materials|Find Materials|Resequence|Co-Products|Make leg|Remove leg|Go to leg)/;
                return menuOf(n).filter(function (i) {
                    return i !== '-' && keepLabels.test(i.label) &&
                        i.label !== 'Open Sales Order';
                });
            },
            view: function () {
                var n = target();
                var d = n ? n.data : null;
                return (n ? views(n) : []).concat([
                    kind === 'production' ? {label: 'Labor Txs', onclick:
                        function () {
                            transactionsDialog(tree.id, 'labor');
                        }} : null,
                    kind === 'production' ? {label: 'Inventory Txs', onclick:
                        function () {
                            transactionsDialog(tree.id, 'inventory');
                        }} : null,
                    {label: 'Material Availability...', onclick: function () {
                        availabilityDialog(kind, n && n.kind === 'prod' &&
                            n.card ? n.data.id : tree.id);
                    }},
                    kind === 'production' ? {label: 'Sales Order Links',
                        onclick: function () {
                            salesLinksDialog(tree.id, perm, tree.number);
                        }} : null,
                    kind === 'production' ? {label: 'Purchase Order Links',
                        onclick: function () {
                            poLinksDialog(tree.id, perm, tree.number);
                        }} : null,
                    d && d.product_id ? {label: (kind === 'production' ?
                        'Open Material Supply and Demand... (' :
                        'Supply and Demand... (') + (code(d.product).code ||
                            d.product) + ')', onclick: function () {
                            supplyDemandDialog(d.product_id);
                        }} : null]).filter(Boolean);
            },
            options: function () {
                return options().concat([{label: (copySubordinates ? '✔ ' :
                    '') + 'Copy Subordinates', onclick: function () {
                        copySubordinates = !copySubordinates;
                        UI.toast('Copy Subordinates ' + (copySubordinates ?
                            'on' : 'off'), 'ok');
                    }}]);
            }
        };
    }
    JS.cards = cards;

    /* The ribbon's Tools / View / Options menus of a window with cards */
    function cardMenus(get, extraTools) {
        function current() {
            return get();
        }
        return [
            {label: 'Tools ▾', onclick: function () {
                var c = current();
                var items = (extraTools ? extraTools() : []).concat(c ? ['-']
                    .concat(c.tools()) : []);
                menuAt(document.activeElement || document.body, items);
            }},
            {label: 'View ▾', onclick: function () {
                var c = current();
                if (!c) {
                    UI.toast('Open the Details tab of a saved record first.',
                        'error');
                    return;
                }
                menuAt(document.activeElement || document.body, c.view());
            }},
            {label: 'Options ▾', onclick: function () {
                var c = current();
                if (!c) {
                    UI.toast('Open the Details tab of a saved record first.',
                        'error');
                    return;
                }
                menuAt(document.activeElement || document.body, c.options());
            }}];
    }

    /* Open a tab of a UI.master window by its title */
    function showTab(main, title) {
        Array.prototype.forEach.call(main.querySelectorAll('.tabs .tab'),
            function (b) {
                if (b.textContent === title) {
                    b.click();
                }
            });
    }

    /* ---- Jobshop layout boxes the frame's fields cannot be ------------------- */

    /* The pane of a UI.master tab by its title (tabs and panes in order) */
    function tabPane(main, title) {
        var buttons = Array.prototype.slice.call(main.querySelectorAll(
            '.tabs .tab'));
        var panes = main.querySelector('.tab-panes');
        for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].textContent === title && panes) {
                return panes.children[i];
            }
        }
        return null;
    }

    /* A read-only box placed in a tab's Jobshop layout (frame.js
     * placedForm's units): a description beside a code (layout type4), the
     * quote's Sold to/Ship to; {label, split, multi} -> the input */
    function placeBox(pane, at, opts) {
        opts = opts || {};
        var box = pane && pane.querySelector('.js-layout');
        if (!box) {
            return el('input');
        }
        var input = opts.multi ? el('textarea', {readonly: true, tabindex: -1,
            'aria-label': opts.label || 'Description'}) : el('input', {type:
            'text', readonly: true, tabindex: -1, 'aria-label': opts.label ||
            'Description'});
        var split = opts.split || 0;
        var u = function (v) {
            return 'calc(var(--u) * ' + v + ')';
        };
        box.appendChild(el('div.js-ctl' + (opts.multi ? '.js-multi' : ''),
            {style: {left: u(at[0]), top: u(at[1]), width: u(at[2] - at[0]),
                height: u(at[3] - at[1])}},
            split || opts.multi && opts.label ? el('label.js-label', split ?
                {style: {width: u(split)}} : null, opts.label) : null,
            input));
        return input;
    }

    /* A code kept as text (e.g. the quote's Sales Rep ID) with Jobshop's
     * "..." lookup on its code table (F9 too) and its description box:
     * {input (the field), model, descr (placeBox input), writable()} ->
     * {refresh()} */
    function codeLookup(opts) {
        var input = opts.input;
        if (!input) {
            return {refresh: function () {}};
        }
        var shown = null;
        function refresh() {
            var value = input.value.trim();
            if (value === shown) {
                return;
            }
            shown = value;
            if (!opts.descr) {
                return;
            }
            if (!value) {
                opts.descr.value = '';
                return;
            }
            Rpc.searchRead(opts.model, [['code', '=', value]],
                ['description'], {limit: 1}).then(function (rows) {
                    if (shown === value) {
                        opts.descr.value = rows.length ?
                            rows[0].description || '' : '';
                    }
                }, function () {});
        }
        function lookup() {
            if (input.readOnly || input.disabled) {
                return;
            }
            UI.browse(opts.model, {title: input.getAttribute('aria-label'),
                text: input.value.trim()}).then(function (record) {
                    return Rpc.searchRead(opts.model, [['id', '=',
                        record.id]], ['code']);
                }).then(function (rows) {
                    if (rows && rows[0]) {
                        input.value = rows[0].code;
                        input.dispatchEvent(new Event('input', {bubbles:
                            true}));
                        refresh();
                        input.focus();
                    }
                }, function () {});
        }
        var more = el('button.picker-browse', {type: 'button', tabindex: -1,
            title: 'Look up (F9)', 'aria-label': 'Look up', onclick:
                lookup}, '…');
        var parent = input.parentNode;
        var wrap = el('div.picker');
        parent.replaceChild(wrap, input);
        wrap.appendChild(input);
        wrap.appendChild(more);
        input.addEventListener('keydown', function (event) {
            if (event.key === 'F9') {
                event.preventDefault();
                lookup();
            }
        });
        input.addEventListener('change', refresh);
        return {refresh: function () {
            more.disabled = input.disabled || input.readOnly ||
                (opts.writable ? !opts.writable() : false);
            refresh();
        }};
    }

    /* Jobshop's U/M: the ERP's unit symbols back to Jobshop's IDs (the
     * migration's UNITS: EA -> u) */
    function jobshopUnit(symbol) {
        return symbol === 'u' ? 'EA' : (symbol || '').toUpperCase();
    }

    /* The window's Clear / Save & New empty the record: run fn after */
    function afterClear(main, fn) {
        Array.prototype.forEach.call(main.querySelectorAll('button'),
            function (b) {
                var label = b.textContent.trim();
                if (label === 'Clear' || label === 'Save & New') {
                    b.addEventListener('click', function () {
                        setTimeout(fn, label === 'Clear' ? 50 : 1500);
                    });
                }
            });
    }

    /* Account Set ID (layout ACCOUNT_SET_ID, read-only here): the part's
     * account set, i.e. its accounting category (the Account Sets window,
     * nline_js_admin); accounting stays the QuickBooks emulation */
    function accountSet(pane, at, split, descrAt) {
        var id = placeBox(pane, at, {label: 'Account Set ID', split: split});
        var descr = placeBox(pane, descrAt, {label:
            'Account Set Description'});
        return function (productId) {
            id.value = '';
            descr.value = '';
            if (!productId) {
                return;
            }
            Rpc.model('product.product', 'read', [[productId],
                ['template']]).then(function (rows) {
                    var template = rows[0] && rows[0].template;
                    return template ? Rpc.model('product.template', 'read',
                        [[template], ['account_category',
                            'account_category.rec_name']]) : [];
                }).then(function (rows) {
                    var row = rows[0] || {};
                    if (!row.account_category) {
                        return;
                    }
                    id.value = (row['account_category.'] || {}).rec_name ||
                        '';
                    Rpc.model('product.category', 'read', [[
                        row.account_category], ['js_description']]).then(
                        function (cats) {
                            descr.value = (cats[0] || {}).js_description ||
                                '';
                        }, function () {});
                }, function () {});
        };
    }

    /* Browse rows one line high (IDs never wrap) */
    function browseOneLine(main) {
        var pane = tabPane(main, 'Browse');
        if (pane) {
            pane.classList.add('nl-eng-browse');
        }
    }

    /* ---- Work Order window --------------------------------------------------- */

    var WO_STATUS = [['unreleased', 'Unreleased'], ['firm', 'Firm'],
        ['hold', 'Hold'], ['released', 'Released'], ['closed', 'Closed'],
        ['cancelled', 'Cancelled']];
    var TRYTON_STATE = {request: 'Planned', draft: 'Unreleased',
        waiting: 'Released', assigned: 'Released (stock assigned)',
        running: 'Started', done: 'Closed', cancelled: 'Cancelled'};
    /* The header fields of the Work Order, Engineering Master and Quote
     * Master tabs (Jobshop's captions; the "/" fields are Rev / Page) */
    var HEADER_FIELDS = [
        {name: 'engineered_by', label: 'Engineered By', type: 'char'},
        {name: 'engineered_date', label: 'Engineered Date', type: 'date'},
        {name: 'drawing_number', label: 'Drawing ID/Rev/Page', type: 'char'},
        {name: 'drawing_revision', label: '/', type: 'char'},
        {name: 'drawing_page', label: '/', type: 'char'},
        {name: 'drawing_file', label: 'Drawing File', type: 'char'},
        {name: 'product_code', label: 'Product Code ID', type: 'many2one',
            model: 'nline.product_code'},
        {name: 'commodity_code', label: 'Commodity Code ID',
            type: 'many2one', model: 'nline.commodity_code'},
        {name: 'global_rank', label: 'Global Rank', type: 'integer',
            default: 50},
        {name: 'forward_schedule', label: 'Forward Schedule',
            type: 'boolean'}];
    /* Jobshop's USER_0 / USER_1 (filled by N-Line's sign-off; no labels
     * set up in Jobshop, so read-only here) */
    var USER_FIELDS = [
        {name: 'user_0', label: 'User 0', type: 'char', readonly: true},
        {name: 'user_1', label: 'User 1', type: 'char', readonly: true}];

    /* File > New document from > Engineering Master / Quote Master
     * (VShopFloor NewWOFromMaster / NewWOfromQuoteMaster) */
    function newWorkOrderFrom(type, done) {
        var product = UI.picker('product.product', {label: 'Part ID',
            domain: [['producible', '=', true]], onselect: function (r) {
                revisions(r.id);
            }});
        var revision = el('select', {'aria-label': 'Eng ID'});
        var master = UI.picker('production.bom', {label: 'Quote Master ID',
            domain: [['master_type', '=', 'quote']]});
        function revisions(productId) {
            Rpc.searchRead('product.product-production.bom', [['product', '=',
                productId], ['bom.master_type', '=', 'engineering']],
                ['bom', 'bom.revision'], {order: [['sequence', 'ASC']]}).then(
                function (rows) {
                    UI.clear(revision);
                    rows.forEach(function (row, i) {
                        revision.appendChild(el('option', {value: row.bom,
                            selected: i === 0 || null}, ((row['bom.'] ||
                                {}).revision || '-') + (i === 0 ?
                                ' (current)' : '')));
                    });
                }, UI.showError);
        }
        var body = type === 'quote' ? el('div.nl-eng-form', el('div',
            el('label.field', 'Quote Master ID'), master.node)) :
            el('div.nl-eng-form', el('div', el('label.field', 'Part ID'),
                product.node), el('div', el('label.field', 'Eng ID'),
                revision));
        UI.modal(type === 'quote' ? 'New Work Order from Quote Master' :
            'New Work Order from Engineering Master', body, [
            {label: 'Cancel'},
            {label: 'Copy', primary: true, onclick: function (close) {
                var bom = type === 'quote' ? master.value() :
                    parseInt(revision.value, 10);
                if (!bom) {
                    UI.toast(type === 'quote' ? 'Choose a quote master.' :
                        'Choose a part with an engineering master.', 'error');
                    return true;
                }
                Rpc.model('production.bom', 'read', [[bom], ['part']]).then(
                    function (rows) {
                        var part = (rows[0] || {}).part || product.value();
                        if (!part) {
                            throw new Error('The master makes no part.');
                        }
                        return Rpc.model('production', 'create', [[{
                            product: part, bom: bom, quantity: 1}]]);
                    }).then(function (ids) {
                        return Rpc.desk('eng_work_order_ready', [ids[0]])
                            .then(function () {
                                close();
                                done(ids[0]);
                            });
                    }).then(null, failed);
                return true;
            }}]);
    }

    Screens.jsWorkOrder = function (main, params, options) {
        var perm = null;
        var details = null;
        var win = null;
        var record = null;
        permissions().then(function (p) {
            perm = p;
            hideRibbon(main, ['Release', 'Assign Stock', 'Start', 'Receive'],
                !p.can('production', 'write'));
            hideRibbon(main, ['Copy'], !p.can('production', 'create'));
            hideRibbon(main, ['Delete'], !p.can('production', 'delete'));
        });

        function workflow(button, label) {
            return {label: label, onclick: function (r, load) {
                if (!r) {
                    UI.toast('Choose or save a work order first.', 'error');
                    return;
                }
                Rpc.model('production', button, [[r.id]]).then(function () {
                    UI.toast('Work order ' + (r.number || r.id) + ': ' + label,
                        'ok');
                    load(r.id);
                }, UI.showError);
            }};
        }
        function reloadHeader() {
            if (win && record) {
                win.load(record.id);
            }
        }

        /* The Work Order tab as Jobshop draws it
         * (layouts\VShopFloor\WorkOrder.txt; Account Set ID: accounting
         * stays QuickBooks) */
        var headerTab = [
            {name: 'created_by', label: 'Created by', type: 'char',
                readonly: true, at: [7, 4, 309, 24], split: 120},
            {name: 'modified_by', label: 'Last Modified by', type: 'char',
                readonly: true, at: [314, 4, 628, 24], split: 100},
            {name: 'lot_id', label: '/', type: 'char', default: '1',
                at: [295, 40, 348, 60], split: 13},
            {name: 'split_id', label: '/', type: 'char', default: '0',
                at: [351, 40, 404, 60], split: 12},
            {name: 'archived', label: 'Archived', type: 'boolean',
                at: [415, 40, 513, 60], split: 104},
            {name: 'linked', label: 'Linked', type: 'boolean',
                readonly: true, at: [541, 40, 628, 60], split: 75},
            {name: 'product', label: 'Part ID', type: 'many2one',
                model: 'product.product', domain: [['producible', '=',
                    true]], at: [7, 62, 404, 82], split: 120},
            /* (read-only, as in Jobshop: the master's Eng ID, set by
             * eng_work_order_ready; the onload shows the revision) */
            {name: 'bom', label: 'Created from Eng Master Rev',
                type: 'many2one', model: 'production.bom', readonly: true,
                at: [415, 62, 628, 82], split: 160},
            {name: 'description', label: 'Description', type: 'char',
                at: [7, 84, 628, 104], split: 120},
            {name: 'quantity', label: 'Quantity', type: 'float', default: 1,
                at: [8, 120, 265, 140], split: 120},
            {name: 'stock_um', label: 'U/M', type: 'char', readonly: true,
                at: [267, 120, 624, 140], split: 0},
            {name: 'order_status', label: 'Order Status',
                type: 'selection', readonly: true, options: WO_STATUS,
                at: [8, 142, 265, 162], split: 120},
            {name: 'planned_start_date', label: 'Release Date',
                type: 'date', at: [8, 164, 265, 184], split: 120},
            {name: 'planned_date', label: 'Want Date', type: 'date',
                at: [8, 186, 265, 206], split: 120},
            {name: 'received_quantity', label: "Rec'd Qty",
                type: 'float', readonly: true, at: [399, 142, 627, 162],
                split: 73},
            {name: 'printed_date', label: 'Printed Date',
                type: 'char', readonly: true, at: [399, 164, 627, 184],
                split: 73},
            {name: 'closed_date', label: 'Close Date', type: 'date',
                readonly: true, at: [399, 186, 627, 206], split: 73},
            {name: 'engineered_by', label: 'Engineered By', type: 'char',
                at: [7, 224, 626, 244], split: 120},
            {name: 'engineered_date', label: 'Engineered Date',
                type: 'date', at: [7, 246, 264, 266], split: 120},
            {name: 'drawing_number', label: 'Drawing ID/Rev/Page',
                type: 'char', at: [7, 268, 434, 288], split: 120},
            {name: 'drawing_revision', label: '/', type: 'char',
                at: [436, 268, 543, 288], split: 10},
            {name: 'drawing_page', label: '/', type: 'char',
                at: [545, 268, 628, 288], split: 10},
            {name: 'drawing_file', label: 'Drawing File', type: 'char',
                at: [7, 290, 605, 310], split: 120},
            {name: 'other_info', label: 'Project/Ref/Other', type: 'char',
                at: [7, 312, 628, 332], split: 120},
            {name: 'product_code', label: 'Product Code ID',
                type: 'many2one', model: 'nline.product_code',
                at: [7, 351, 300, 371], split: 120},
            {name: 'product_code_description', label: '', type: 'char',
                readonly: true, at: [302, 351, 626, 371], split: 0},
            {name: 'commodity_code', label: 'Commodity Code ID',
                type: 'many2one', model: 'nline.commodity_code',
                at: [7, 373, 300, 393], split: 120},
            {name: 'commodity_code_description', label: '', type: 'char',
                readonly: true, at: [302, 373, 626, 393], split: 0},
            {name: 'global_rank', label: 'Global Rank', type: 'integer',
                default: 50, at: [7, 436, 183, 456], split: 120},
            {name: 'forward_schedule', label: 'Forward Schedule',
                type: 'boolean', at: [197, 436, 353, 456], split: 90},
            {name: 'hard_release_date', label: 'Treat Release Date as Hard',
                type: 'boolean', at: [358, 436, 622, 456], split: 92},
            {name: 'schedule_start_date', label: 'Schedule Start Date',
                type: 'char', readonly: true, at: [7, 458, 300, 478],
                split: 120},
            {name: 'schedule_finish_date', label: 'Schedule Finish Date',
                type: 'char', readonly: true, at: [358, 458, 622, 478],
                split: 122}];

        win = UI.master(main, {
            title: 'Work Order',
            model: 'production',
            label: 'Work/Lot/Split ID',
            /* Jobshop's ID field: the first of the Work Order tab */
            idAt: [7, 40, 292, 60],
            idSplit: 120,
            idField: 'work_id',
            /* The work orders, not their legs (WO-.../1): a leg opens from
             * its card, as in Jobshop */
            domain: [['parent', '=', null]],
            order: [['number', 'DESC']],
            single: true,
            open: params && params[0] ? parseInt(params[0], 10) : null,
            extra: [
                /* (N-Line's buttons, kept: Jobshop has them as Change
                 * Status > Release and the traveler report) */
                workflow('wait', 'Release'),
                workflow('assign_try', 'Assign Stock'),
                workflow('run', 'Start'),
                {label: 'Receive', onclick: function (r, load) {
                    if (!r) {
                        UI.toast('Choose a work order first.', 'error');
                        return;
                    }
                    UI.service('work_order_receive', {production: r.id})
                        .then(function (x) {
                            UI.toast('Work order ' + x.state, 'ok');
                            load(r.id);
                        }, failed);
                }},
                {label: 'Traveler', onclick: function (r, load) {
                    if (!r) {
                        UI.toast('Choose a work order first.', 'error');
                        return;
                    }
                    Rpc.report('production.traveler', [r.id]).then(
                        function (x) {
                            UI.openReport(x, 'Traveler');
                            Rpc.desk('eng_printed', [r.id]).then(
                                function () {
                                    load(r.id);
                                }, function () {});
                        }, UI.showError);
                }},
                {label: 'Copy', onclick: function (r) {
                    if (!r) {
                        UI.toast('Choose a work order first.', 'error');
                        return;
                    }
                    UI.confirm('Copy', 'Copy ' + r.rec_name + ' into a new ' +
                        'work order (its operations, materials and legs)?')
                        .then(function (ok) {
                            if (ok) {
                                Rpc.desk('eng_work_order_copy', [r.id]).then(
                                    function (id) {
                                        UI.toast('Work order copied', 'ok');
                                        win.load(id);
                                    }, UI.showError);
                            }
                        });
                }},
                {label: 'Delete', onclick: function (r) {
                    if (!r) {
                        UI.toast('Choose a work order first.', 'error');
                        return;
                    }
                    UI.confirm('Delete', 'Delete the work order ' +
                        r.rec_name + ' with its legs? Only an unreleased or ' +
                        'cancelled work order can be deleted.').then(
                        function (ok) {
                            if (ok) {
                                Rpc.model('production', 'delete', [[r.id]])
                                    .then(function () {
                                        UI.toast('Deleted', 'ok');
                                        UI.clear(main);
                                        Screens.jsWorkOrder(main, []);
                                    }, UI.showError);
                            }
                        });
                }}
            ].concat(cardMenus(function () {
                return details;
            }, function () {
                var may = perm && perm.can('production', 'create');
                return may ? [
                    {label: 'New Work Order from Engineering Master...',
                        onclick: function () {
                            newWorkOrderFrom('engineering', function (id) {
                                win.load(id);
                            });
                        }},
                    {label: 'New Work Order from Quote Master...',
                        onclick: function () {
                            newWorkOrderFrom('quote', function (id) {
                                win.load(id);
                            });
                        }}] : [];
            })),
            afterSave: function (id) {
                return Rpc.desk('eng_work_order_ready', [id]);
            },
            onload: function (r) {
                record = r;
                UI.setTitle('Work Order :: ' + (r.number || r.id));
                /* The Lot / Split ID are set when the order is made
                 * (Jobshop: read-only then); after the window's own lock */
                setTimeout(function () {
                    var parts = main.querySelectorAll('input[aria-label="/"]');
                    [parts[0], parts[1]].forEach(function (input) {
                        if (input) {
                            input.disabled = true;
                        }
                    });
                }, 0);
                showMasterRev(r.bom);
                showUnit();
                fillAccountSet(r.product);
            },
            tabs: [
                {title: 'Work Order', fields: headerTab, buttons: [
                    drawingButton(main, [608, 290, 628, 310])]},
                {title: 'Details', render: function (pane, r) {
                    details = null;
                    permissions().then(function (p) {
                        /* (no list of masters beside the cards: the owner
                         * found it distracting; right-click > Make leg) */
                        details = cards(pane, {kind: 'production', id: r.id,
                            perm: p,
                            onHeader: reloadHeader,
                            onEdit: function () {
                                showTab(main, 'Work Order');
                            },
                            onSpecs: function () {
                                showTab(main, 'Specs');
                            }});
                    });
                }},
                {title: 'Other', fields: USER_FIELDS.concat([
                    {name: 'state', label: 'Tryton state', type: 'selection',
                        readonly: true, options: Object.keys(TRYTON_STATE)
                            .map(function (k) {
                                return [k, TRYTON_STATE[k]];
                            })},
                    {name: 'warehouse', label: 'Warehouse', type: 'many2one',
                        model: 'stock.location', domain: [['type', '=',
                            'warehouse']]},
                    {name: 'location', label: 'Production location',
                        type: 'many2one', model: 'stock.location',
                        domain: [['type', '=', 'production']]},
                    {name: 'work_center', label: 'Work center',
                        type: 'many2one', model: 'production.work.center'},
                    {name: 'unit', label: 'U/M', type: 'many2one',
                        model: 'product.uom', readonly: true},
                    {name: 'routing', label: 'Operations (routing)',
                        type: 'many2one', model: 'production.routing',
                        readonly: true},
                    {name: 'parent', label: 'Leg of', type: 'many2one',
                        model: 'production', readonly: true},
                    {name: 'leg_index', label: 'Leg (Sub ID)',
                        type: 'integer', readonly: true}])},
                {title: 'Specs', fields: [{name: 'specifications', label:
                    'Specifications', type: 'text', rows: 14}]},
                {picture: true},
                {notes: true}
            ],
            browse: [
                {name: 'work_id', label: 'WorkOrder ID'},
                {name: 'lot_id', label: 'Lot ID'},
                {name: 'split_id', label: 'Split ID'},
                {name: 'product.code', label: 'Part ID'},
                {name: 'description', label: 'Description'},
                {name: 'quantity', label: 'Quantity', type: 'float'},
                {name: 'order_status', label: 'Status', labels: {
                    unreleased: 'Unreleased', firm: 'Firm', hold: 'Hold',
                    released: 'Released', closed: 'Closed',
                    cancelled: 'Cancelled'}}]
        });
        /* Created from Eng Master Rev: the master's Eng ID only, no
         * lookup (Jobshop's read-only ENG_ID) */
        var revInput = main.querySelector(
            'input[aria-label="Created from Eng Master Rev"]');
        if (revInput && revInput.parentNode.querySelector(
                '.picker-browse')) {
            revInput.parentNode.querySelector('.picker-browse').style
                .display = 'none';
        }
        function showMasterRev(bom) {
            if (!revInput) {
                return;
            }
            revInput.value = '';
            if (bom) {
                Rpc.model('production.bom', 'read', [[bom], ['revision',
                    'rec_name']]).then(function (rows) {
                        revInput.value = (rows[0] || {}).revision || '';
                        revInput.title = (rows[0] || {}).rec_name || '';
                    }, function () {});
            }
        }
        function showUnit() {
            var um = main.querySelector('input[aria-label="U/M"]');
            if (um) {
                um.value = jobshopUnit(um.value);
            }
        }
        var fillAccountSet = accountSet(tabPane(main, 'Work Order'),
            [7, 395, 300, 415], 120, [302, 395, 626, 415]);
        afterClear(main, function () {
            fillAccountSet(null);
            showMasterRev(null);
        });
        browseOneLine(main);
        if (options && options.tab) {
            showTab(main, options.tab);
        }
    };
    /* (the shop floor's name of the window) */
    Screens.workOrderWindow = Screens.jsWorkOrder;

    /* ---- Engineering Master and Quote Master windows ------------------------ */

    function masterWindow(main, params, type) {
        var quote = type === 'quote';
        var details = null;
        var win = null;
        var part = null;
        var title = quote ? 'Quote Master' : 'Engineering Master';
        /* The header tab as Jobshop draws it (layouts\VEngineering\
         * Master.txt, VEstimating\QuoteMaster.txt; the ID lookup is the
         * window's, at Part ID / Quote Master ID; Account Set ID: accounting
         * stays QuickBooks) */
        var Y = quote ? {qty: 97, pc: 119, cc: 141, eb: 163, ed: 185,
            dr: 207, df: 230, gr: 273} : {qty: 78, pc: 100, cc: 122, eb: 144,
            ed: 166, dr: 188, df: 210, gr: 254};
        var R = quote ? 840 : 765;
        var headerTab = [
            {name: 'created_by', label: 'Created by', type: 'char',
                readonly: true, at: quote ? [7, 5, 293, 25] : [7, 7, 324, 27],
                split: 120},
            {name: 'modified_by', label: 'Last Modified by', type: 'char',
                readonly: true, at: quote ? [418, 5, 840, 25] :
                    [332, 7, 762, 27], split: 100},
            quote ? {name: 'part', label: 'Part ID', type: 'many2one',
                model: 'product.product', domain: [['producible', '=',
                    true]], at: [7, 53, 840, 73], split: 120} : null,
            /* (a little right of Jobshop's 474: the label clear of the
             * Part ID's "..." button) */
            quote ? null : {name: 'revision', label: 'Revision',
                type: 'char', at: [479, 34, 603, 54], split: 56},
            quote ? null : {name: 'private', label: 'Locked',
                type: 'boolean', at: [615, 34, 677, 54]},
            quote ? null : {name: 'inactive', label: 'Inactive',
                type: 'boolean', at: [692, 34, 762, 54]},
            {name: 'description', label: 'Description', type: 'char',
                at: quote ? [7, 75, 840, 95] : [7, 56, 762, 76], split: 120},
            {name: 'desired_quantity', label: 'Quantity', type: 'float',
                default: 1, at: [7, Y.qty, quote ? 263 : 253, Y.qty + 20],
                split: 120},
            {name: 'stock_um', label: 'U/M', type: 'char', readonly: true,
                at: [quote ? 265 : 255, Y.qty, R, Y.qty + 20], split: 0},
            {name: 'product_code', label: 'Product Code ID',
                type: 'many2one', model: 'nline.product_code',
                at: [7, Y.pc, quote ? 263 : 253, Y.pc + 20], split: 120},
            {name: 'product_code_description', label: '', type: 'char',
                readonly: true, at: [quote ? 265 : 255, Y.pc, R, Y.pc + 20],
                split: 0},
            {name: 'commodity_code', label: 'Commodity Code ID',
                type: 'many2one', model: 'nline.commodity_code',
                at: [7, Y.cc, quote ? 263 : 253, Y.cc + 20], split: 120},
            {name: 'commodity_code_description', label: '', type: 'char',
                readonly: true, at: [quote ? 265 : 255, Y.cc, R, Y.cc + 20],
                split: 0},
            {name: 'engineered_by', label: 'Engineered By', type: 'char',
                at: [7, Y.eb, quote ? 646 : 415, Y.eb + 20], split: 120},
            {name: 'engineered_date', label: 'Engineered Date',
                type: 'date', at: [7, Y.ed, quote ? 263 : 253, Y.ed + 20],
                split: 120},
            {name: 'drawing_number', label: 'Drawing ID/Rev/Page',
                type: 'char', at: [7, Y.dr, 516, Y.dr + 20], split: 120},
            {name: 'drawing_revision', label: '/', type: 'char',
                at: [518, Y.dr, 645, Y.dr + 20], split: 10},
            {name: 'drawing_page', label: '/', type: 'char',
                at: [647, Y.dr, 716, Y.dr + 20], split: 10},
            {name: 'drawing_file', label: 'Drawing File', type: 'char',
                at: [7, Y.df, quote ? 818 : 695, Y.df + 20], split: 120},
            {name: 'global_rank', label: 'Global Rank', type: 'integer',
                default: 50, at: [7, Y.gr, quote ? 165 : 169, Y.gr + 20],
                split: 120},
            {name: 'forward_schedule', label: 'Forward Schedule',
                type: 'boolean', at: [quote ? 173 : 175, Y.gr, quote ? 448 :
                    398, Y.gr + 20]},
            {name: 'workorder_instructions', label: '', type: 'text',
                at: quote ? [17, 323, 836, 419] : [18, 302, 755, 419],
                split: 0}
            /* (a new engineering master's part: the Part ID typed in the
             * ID field, as in Jobshop; beforeSave) */
        ].filter(Boolean);
        var headerFrames = [{label: 'Work Order Special Instructions',
            at: quote ? [7, 303, 846, 430] : [4, 282, 765, 429]}];
        var headerButtons = [drawingButton(main, quote ?
            [820, 230, 840, 250] : [697, 210, 717, 230])];
        permissions().then(function (p) {
            hideRibbon(main, ['Copy'], !p.can('production.bom', 'create'));
            hideRibbon(main, ['Delete'], !p.can('production.bom', 'delete'));
        });
        function copyInto(r, intoType) {
            var revision = el('input', {type: 'text', 'aria-label': 'Eng ID'});
            var product = UI.picker('product.product', {label: 'Part ID',
                domain: [['producible', '=', true]]});
            if (r['part.']) {
                product.set(r.part, r['part.'].rec_name);
            }
            UI.modal(intoType === 'quote' ? 'Copy Into a New Quote Master' :
                'Copy Into a New Engineering Master', el('div.nl-eng-form',
                el('div', el('label.field', 'Part ID'), product.node),
                intoType === 'quote' ? null : el('div', el('label.field',
                    'Eng ID'), revision)), [{label: 'Cancel'}, {label: 'OK',
                    primary: true, onclick: function (close) {
                        Rpc.desk('eng_master_copy', [r.id, {master_type:
                            intoType, product: product.value(), revision:
                            revision.value || null}]).then(function (id) {
                                close();
                                UI.toast(title + ' copied', 'ok');
                                if (intoType === type) {
                                    win.load(id);
                                } else {
                                    UI.openScreen((intoType === 'quote' ?
                                        'quote-masters/' : 'masters/') + id);
                                }
                            }, failed);
                        return true;
                    }}]);
        }
        win = UI.master(main, {
            title: title,
            model: 'production.bom',
            label: quote ? 'Quote Master ID' : 'Part ID',
            /* Jobshop's ID field, the first of the header tab */
            idAt: quote ? [7, 31, 405, 51] : [7, 34, 474, 54],
            idSplit: 120,
            idField: quote ? 'name' : null,
            domain: [['master_type', '=', type]],
            order: [['name', 'ASC'], ['revision', 'ASC']],
            defaults: {master_type: type},
            single: true,
            open: params && params[0] ? parseInt(params[0], 10) : null,
            extra: [
                {label: 'Copy', onclick: function (r) {
                    if (r) {
                        copyInto(r, type);
                    }
                }},
                {label: 'Delete', onclick: function (r) {
                    if (!r) {
                        return;
                    }
                    UI.confirm('Delete', 'Delete the ' + title.toLowerCase() +
                        ' ' + r.rec_name + '?').then(function (ok) {
                            if (ok) {
                                Rpc.model('production.bom', 'delete', [[r.id]])
                                    .then(function () {
                                        UI.toast('Deleted', 'ok');
                                        UI.clear(main);
                                        masterWindow(main, [], type);
                                    }, UI.showError);
                            }
                        });
                }}
            ].concat(cardMenus(function () {
                return details;
            }, function () {
                var r = win && win.record();
                return r ? [
                    {label: quote ? 'Copy Into a New Engineering Master' :
                        'Copy Into a New Quote Master', onclick: function () {
                            copyInto(r, quote ? 'engineering' : 'quote');
                        }},
                    quote ? null : {label: 'Make a Work Order', onclick:
                        function () {
                            UI.openScreen('work-orders/new');
                        }}] : [];
            })),
            beforeSave: function (values, record) {
                /* The part is set once, by eng_master_ready */
                part = values.part;
                delete values.part;
                if (!values.name) {
                    values.name = '-';
                }
                if (quote || record) {
                    return values;
                }
                /* A new engineering master: the Part ID typed in the ID
                 * field (Jobshop's Part ID + Revision make a master) */
                var typed = idInput ? idInput.value.trim() : '';
                if (!typed) {
                    return Promise.reject(new Error(
                        'Type the Part ID of the new master.'));
                }
                return Rpc.searchRead('product.product', [['code', '=',
                    typed], ['producible', '=', true]], ['id'], {limit: 1})
                    .then(function (rows) {
                        if (!rows.length) {
                            throw new Error('Part ID ' + typed + ' is not a ' +
                                'part that is made (Fabricated).');
                        }
                        part = rows[0].id;
                        return values;
                    });
            },
            afterSave: function (id) {
                return Rpc.desk('eng_master_ready', [id, part]);
            },
            onload: function (r) {
                UI.setTitle((quote ? 'Quote Master :: ' : 'Master :: ') +
                    r.rec_name);
                showUnit();
                /* (an engineering master's part is not one of its
                 * fields here: read it) */
                Rpc.model('production.bom', 'read', [[r.id], ['part',
                    'part.code']]).then(function (rows) {
                        var row = rows[0] || {};
                        fillAccountSet(row.part);
                        /* Part ID: the part's ID only (the revision has
                         * its own field), the master's name its tooltip */
                        var partCode = (row['part.'] || {}).code;
                        if (!quote && idInput && partCode) {
                            idInput.value = partCode;
                            idInput.title = r.rec_name;
                        }
                    }, function () {});
            },
            tabs: [
                {title: title, fields: headerTab, frames: headerFrames,
                    buttons: headerButtons},
                {title: 'Details', render: function (pane, r) {
                    details = null;
                    permissions().then(function (p) {
                        if (quote) {
                            /* A quote master is the sales group's */
                            p.access['production.bom'] = Object.assign({},
                                p.access['production.bom'], {write: p.can(
                                    'production.bom', 'write') || p.can(
                                    'nline.quote', 'write')});
                        }
                        details = cards(pane, {kind: 'bom', id: r.id,
                            perm: p,
                            onEdit: function () {
                                showTab(main, title);
                            },
                            onSpecs: function () {
                                showTab(main, 'Specs');
                            }});
                    });
                }},
                {title: 'Other', fields: USER_FIELDS.concat(quote ? [] : [
                    {name: 'name', label: 'Master name (Tryton)',
                        type: 'char'}])},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', rows: 14}]},
                {picture: true},
                {notes: true},
                /* (N-Line's tabs after Jobshop's: the master's materials
                 * and what it makes (co-products) as editable lists; the
                 * cards edit the same) */
                {title: 'Materials', lines: {name: 'inputs',
                    model: 'production.bom.input', inverse: 'bom',
                    order: [['operation', 'ASC'], ['piece', 'ASC']],
                    fields: [
                        {name: 'operation', label: 'Seq', type: 'integer'},
                        {name: 'piece', label: 'Piece', type: 'integer'},
                        {name: 'product', label: 'Part', type: 'many2one',
                            model: 'product.product'},
                        {name: 'quantity', label: 'Qty per', type: 'float'},
                        {name: 'unit', label: 'U/M', type: 'many2one',
                            model: 'product.uom'},
                        {name: 'component_revision', label: 'Pinned Eng ID',
                            type: 'char'},
                        {name: 'leg_detail', label: 'Leg', type: 'boolean'}]}},
                {title: 'Makes', lines: {name: 'outputs',
                    model: 'production.bom.output', inverse: 'bom',
                    fields: [
                        {name: 'product', label: 'Part', type: 'many2one',
                            model: 'product.product'},
                        {name: 'quantity', label: 'Qty', type: 'float'},
                        {name: 'unit', label: 'U/M', type: 'many2one',
                            model: 'product.uom'}]}}
            ],
            /* Jobshop's Browse columns (Part ID, Eng ID, Description; the
             * quote masters': ID, Part, Description, Quantity, Engineered
             * Date) */
            browse: quote ? [
                {name: 'name', label: 'Quote Master ID'},
                {name: 'part.code', label: 'Part ID'},
                {name: 'description', label: 'Description'},
                {name: 'desired_quantity', label: 'Quantity', type: 'float'},
                {name: 'engineered_date', label: 'Engineered Date',
                    type: 'date'}] : [
                {name: 'part.code', label: 'Part ID'},
                {name: 'revision', label: 'Eng ID'},
                {name: 'description', label: 'Description'},
                {name: 'desired_quantity', label: 'Quantity', type: 'float'},
                {name: 'engineered_date', label: 'Engineered Date',
                    type: 'date'}]
        });
        var headPane = tabPane(main, title);
        var idInput = headPane && headPane.querySelector(
            'input[aria-label="' + (quote ? 'Quote Master ID' : 'Part ID') +
            '"]');
        function showUnit() {
            var um = main.querySelector('input[aria-label="U/M"]');
            if (um) {
                um.value = jobshopUnit(um.value) || (quote ? 'EA' : '');
            }
        }
        var fillAccountSet = accountSet(headPane, quote ?
            [7, 251, 263, 271] : [7, 232, 253, 252], 120, quote ?
            [265, 251, 840, 271] : [255, 232, 765, 252]);
        afterClear(main, function () {
            fillAccountSet(null);
        });
        browseOneLine(main);
    }

    Screens.jsEngineeringMaster = function (main, params) {
        masterWindow(main, params, 'engineering');
    };
    Screens.engineeringMaster = Screens.jsEngineeringMaster;
    Screens.jsQuoteMaster = function (main, params) {
        masterWindow(main, params, 'quote');
    };

    /* ---- Operation Templates --------------------------------------------------- */

    Screens.jsOperationTemplates = function (main, params) {
        /* (layouts\VEngineering\OperationTemplate.txt: the ID lookup is
         * the window's; Supplier Svc ID unused at N-Line) */
        var opTab = [
            {name: 'created_by', label: 'Created by', type: 'char',
                readonly: true, at: [7, 7, 386, 27], split: 97},
            {name: 'modified_by', label: 'Last Modified by', type: 'char',
                readonly: true, at: [403, 7, 748, 27], split: 120},
            {name: 'inactive', label: 'Inactive', type: 'boolean',
                at: [250, 32, 330, 52]},
            {name: 'description', label: 'Description', type: 'char',
                at: [7, 54, 748, 74], split: 97},
            {name: 'resource', label: 'Resource ID', type: 'many2one',
                model: 'production.work.center', at: [7, 76, 390, 96],
                split: 97},
            {name: 'service', label: 'Service ID', type: 'many2one',
                model: 'product.product', domain: [['type', '=',
                    'service']], at: [7, 98, 390, 118], split: 97},
            {name: 'supplier', label: 'Supplier ID', type: 'many2one',
                model: 'party.party', at: [402, 76, 747, 96], split: 125},
            {name: 'setup_hours', label: 'Setup Hrs', type: 'float',
                at: [7, 127, 183, 147], split: 97},
            {name: 'run', label: 'Run', type: 'float',
                at: [7, 149, 183, 169], split: 97},
            {name: 'run_type', label: 'Run Type', type: 'selection',
                options: RUN_TYPES, default: 'hrs_pc',
                at: [7, 171, 260, 191], split: 97},
            {name: 'load_size', label: 'Load Size Qty', type: 'float',
                at: [7, 193, 183, 213], split: 97},
            {name: 'move_hours', label: 'Move Hrs', type: 'float',
                at: [402, 127, 608, 147], split: 125},
            {name: 'minimum_move_qty', label: 'Min Move Qty',
                type: 'float', at: [402, 149, 608, 169], split: 125},
            {name: 'minimum_capacity', label: 'Min Capacity Usage',
                type: 'integer', at: [402, 171, 608, 191], split: 125},
            {name: 'maximum_capacity', label: 'Max Capacity Usage',
                type: 'integer', at: [402, 193, 608, 213], split: 125},
            {name: 'preserved', label: 'Preserved', type: 'boolean',
                at: [7, 219, 122, 239]},
            /* Jobshop's Transit Days takes the Setup Hrs place for an
             * outside service (shown by the Service ID below) */
            {name: 'transit_days', label: 'Transit Days', type: 'integer',
                at: [7, 127, 183, 147], split: 97},
            /* (N-Line's: the routing operation of the steps made from the
             * template; beside Preserved) */
            {name: 'operation', label: 'Routing Operation',
                type: 'many2one', model: 'production.routing.operation',
                at: [402, 219, 747, 239], split: 125}];
        /* Jobshop's General sub-tab (OperationTemplateSubTabs.txt): the
         * costs, the operation information, the special instructions */
        var generalTab = [
            ['setup_cost_hour', 'Labor/Hour (setup)', 26, 24, 211],
            ['run_cost_hour', 'Labor/Hour (run)', 26, 46, 211],
            ['run_cost_unit', 'Labor/Unit (run)', 26, 68, 211],
            ['run_cost_operation', 'Fixed Labor', 26, 90, 211],
            ['setup_burden_hour', 'Burden/Hour (setup)', 217, 24, 402],
            ['run_burden_hour', 'Burden/Hour (run)', 217, 46, 402],
            ['burden_unit', 'Burden/Unit (run)', 217, 68, 402],
            ['burden_operation', 'Fixed Burden', 217, 90, 402]
        ].map(function (p) {
            return {name: p[0], label: p[1], type: 'float', at: [p[2], p[3],
                p[4], p[3] + 20], split: 110};
        }).concat([
            {name: 'setup_burden_percent', label: 'Setup %', type: 'float',
                at: [408, 24, 548, 44], split: 80},
            {name: 'run_burden_percent', label: 'Run %', type: 'float',
                at: [408, 46, 548, 66], split: 80},
            {name: 'scrap_percent', label: 'Scrap or Yield %', type: 'float',
                at: [26, 140, 224, 160], split: 120},
            {name: 'fixed_scrap', label: 'Fixed Scrap Units', type: 'float',
                at: [26, 162, 224, 182], split: 120},
            {name: 'override_start_qty', label: 'Override Start Qty',
                type: 'float', at: [26, 184, 226, 204], split: 120},
            {name: 'scrap_yield', label: '', type: 'radio', options: [
                ['scrap', 'Scrap'], ['yield', 'Yield']], default: 'scrap',
                at: [317, 143, 491, 178], split: 0},
            {name: 'override_end_qty', label: 'Override End Qty',
                type: 'float', at: [317, 183, 472, 203], split: 97},
            {name: 'drawing_number', label: 'Drawing ID/Rev/Page',
                type: 'char', at: [26, 214, 315, 234], split: 120},
            {name: 'drawing_revision', label: '/', type: 'char',
                at: [317, 214, 402, 234], split: 10},
            {name: 'drawing_page', label: '/', type: 'char',
                at: [404, 214, 471, 234], split: 10},
            {name: 'drawing_file', label: 'Drawing File', type: 'char',
                at: [26, 236, 453, 256], split: 120},
            {name: 'special_instructions', label: '', type: 'text',
                at: [26, 285, 559, 333], split: 0}]);
        var win = UI.master(main, {
            title: 'Operation Templates',
            model: 'nline.engineering.operation_template',
            label: 'Template ID',
            idAt: [7, 32, 241, 52],
            idSplit: 97,
            idField: 'code',
            order: [['code', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            print: null,
            onload: function (r) {
                UI.setTitle('Operation Template :: ' + r.code);
                setTimeout(serviceSlot, 0);
            },
            /* Jobshop's sub-tabs in its order: General, Specs, Add'l
             * Resources (its Other tab holds only the user-defined fields,
             * unused at N-Line) */
            tabs: [
                {title: 'Operation', fields: opTab},
                {title: 'General', fields: generalTab, frames: [
                    {label: 'Costs', at: [12, 4, 573, 116]},
                    {label: 'Operation Information', at: [12, 120, 573,
                        261]},
                    {label: 'Special Instructions', at: [12, 266, 573,
                        334]}], buttons: [drawingButton(main,
                        [455, 236, 475, 256])]},
                {title: 'Specs', fields: [{name: 'specifications', label:
                    'Specifications', type: 'text', rows: 14}]},
                {title: 'Add\'l Resources', lines: {name:
                    'extra_resources', model:
                    'nline.engineering.operation_resource',
                    inverse: 'template', fields: RESOURCE_FIELDS}}
            ],
            /* Jobshop's Browse: ID, Description, Inactive (+ N-Line's
             * resource and hours) */
            browse: [
                {name: 'code', label: 'ID'},
                {name: 'description', label: 'Description'},
                {name: 'inactive', label: 'Inactive', type: 'boolean'},
                {name: 'resource', label: 'Resource ID', type: 'many2one'},
                {name: 'setup_hours', label: 'Setup Hrs', type: 'float'},
                {name: 'run', label: 'Run', type: 'float'}]
        });
        /* Setup Hrs or, for an outside service (a Service ID), Transit
         * Days in the same place */
        function slot(label) {
            var input = main.querySelector('input[aria-label="' + label +
                '"]');
            return input ? input.closest('.js-ctl') : null;
        }
        function serviceSlot() {
            var service = main.querySelector('input[aria-label="Service ID"]');
            var outside = Boolean(service && service.value.trim());
            var setup = slot('Setup Hrs'), transit = slot('Transit Days');
            if (setup && transit) {
                setup.style.display = outside ? 'none' : '';
                transit.style.display = outside ? '' : 'none';
            }
        }
        var serviceInput = main.querySelector(
            'input[aria-label="Service ID"]');
        if (serviceInput) {
            serviceInput.addEventListener('blur', function () {
                setTimeout(serviceSlot, 300);
            });
        }
        afterClear(main, serviceSlot);
        serviceSlot();
        browseOneLine(main);
        return win;
    };

    /* ---- Quotes ------------------------------------------------------------------- */

    var QUOTE_STATUS = [['active', 'Active'], ['ready', 'Ready'],
        ['won', 'Won'], ['lost', 'Lost'], ['cancelled', 'Cancelled']];
    var COST_FROM = [['engineering', 'Engineering Master'], ['quote',
        'Quote Master'], ['part', 'Part'], ['none', 'None']];

    /* The Sold To / Ship To tab as Jobshop draws it (layouts\VEstimating\
     * QuoteSubTabs.txt; Address = its two address lines; Etc. and Mobile
     * when the module has them: extra) */
    function address(prefix, label, extra) {
        return [
            {name: prefix + 'name', label: 'Name', type: 'char',
                at: [12, 5, 441, 25], split: 72},
            {name: prefix + 'street', label: 'Address', type: 'text',
                rows: 2, at: [12, 27, 441, 69], split: 72},
            {name: prefix + 'city', label: 'City', type: 'char',
                at: [12, 71, 441, 91], split: 72},
            {name: prefix + 'state', label: 'State/Postal', type: 'char',
                at: [12, 93, 277, 113], split: 72},
            {name: prefix + 'postal_code', label: 'Postal Code',
                type: 'char', at: [280, 93, 441, 113], split: 0},
            {name: prefix + 'country', label: 'Country', type: 'char',
                at: [12, 115, 441, 135], split: 72},
            extra ? {name: prefix + 'addr_etc', label: 'Etc.', type: 'char',
                at: [12, 137, 441, 157], split: 72} : null,
            {name: prefix + 'contact_name', label: 'Contact', type: 'char',
                at: [461, 5, 812, 25], split: 61},
            {name: prefix + 'contact_title', label: 'Title', type: 'char',
                at: [461, 27, 812, 47], split: 61},
            {name: prefix + 'contact_phone', label: 'Phone', type: 'char',
                at: [461, 49, 812, 69], split: 61},
            {name: prefix + 'contact_fax', label: 'Fax', type: 'char',
                at: [461, 71, 812, 91], split: 61},
            {name: prefix + 'contact_email', label: 'E-mail', type: 'char',
                at: [461, 93, 812, 113], split: 61},
            extra ? {name: prefix + 'contact_mobile', label: 'Mobile',
                type: 'char', at: [461, 115, 812, 135], split: 61} : null
        ].filter(Boolean).map(function (f) {
            /* (the two tabs' labels are the same: the Ship To's say so to
             * a screen reader through the field's help) */
            f.help = label + f.label;
            return f;
        });
    }

    /* The quote lines (Quote tab table): part, Quantities Quoted, Cost From,
     * the unit cost and price of each quantity */
    function quoteLines(pane, record, writable) {
        var lines = [];
        var body = el('tbody');
        var total = el('strong', '');
        var markup = el('input.money', {type: 'text', value: '35',
            'aria-label': 'Markup %', style: {width: '70px'}});

        function priceOf(p) {
            var price = p.unit_price !== null && p.unit_price !== undefined &&
                p.unit_price !== '' ? Number(p.unit_price) :
                Number(p.calc_unit_price || 0);
            return price * (1 - (Number(p.trade_discount) || 0) / 100);
        }
        function totalOf(line) {
            var p = line.prices.filter(function (x) {
                return x.in_total;
            })[0] || line.prices[0];
            return p ? priceOf(p) * Number(p.quantity || 0) : 0;
        }
        function render() {
            UI.clear(body);
            var sum = 0;
            lines.forEach(function (line, i) {
                sum += totalOf(line);
                body.appendChild(el('tr', {ondblclick: function () {
                    edit(i);
                }},
                    td(line.line_no || ''),
                    td(line.product ? line.product.rec_name : ''),
                    td(line.description),
                    td(line.prices.map(function (p) {
                        return num(p.quantity);
                    }).join('; ')),
                    td((COST_FROM.filter(function (c) {
                        return c[0] === line.cost_from;
                    })[0] || ['', ''])[1]),
                    td(line.prices.map(function (p) {
                        return UI.money(priceOf(p));
                    }).join('; '), true),
                    td(UI.money(totalOf(line)), true),
                    td(line.status),
                    el('td', writable ? [el('button', {type: 'button',
                        onclick: function () {
                            edit(i);
                        }}, 'Edit'), el('button', {type: 'button', title:
                        'Delete line', onclick: function () {
                            lines.splice(i, 1);
                            render();
                        }}, '✕')] : el('button', {type: 'button', onclick:
                        function () {
                            edit(i);
                        }}, 'View'))));
            });
            if (!lines.length) {
                body.appendChild(el('tr', el('td', {colspan: 9},
                    'No line yet.')));
            }
            total.textContent = UI.money(sum, true);
        }
        function cost(line, price) {
            return Rpc.desk('eng_quote_cost', [{product: line.product ?
                line.product.id : null, cost_from: line.cost_from, bom:
                line.bom ? line.bom.id : null, quote_master: line.quote_master ?
                line.quote_master.id : null, quantity: price.quantity ||
                1}]).then(function (c) {
                    var pct = function (v, d) {
                        return 1 + (v === null || v === undefined || v === '' ?
                            d : Number(v)) / 100;
                    };
                    var m = UI.parseMoney(markup.value) || 0;
                    price.unit_cost = Number(c.unit_cost);
                    price.calc_unit_price = Math.round((Number(c.material) *
                        pct(price.material_markup, m) + Number(c.fabricated) *
                        pct(price.fab_markup, m) + Number(c.labor) *
                        pct(price.labor_markup, m) + Number(c.burden) *
                        pct(price.burden_markup, m) + Number(c.service) *
                        pct(price.service_markup, m)) * 100) / 100;
                    return price;
                });
        }
        function edit(index) {
            var line = index === null ? {cost_from: 'engineering', status:
                'open', prices: [{quantity: 1, in_total: true}]} :
                JSON.parse(JSON.stringify(lines[index]));
            var grid;
            dialog(index === null ? 'Add Quote Line' : 'Quote Line ' +
                (line.line_no || ''), [
                {title: 'Line', fields: [
                    {name: 'product', label: 'Part ID', type: 'many2one',
                        model: 'product.product', domain: [['salable', '=',
                            true]], span: 2},
                    {name: 'description', label: 'Description', type: 'char',
                        span: 3},
                    {name: 'customer_part', label: 'Customer Part ID',
                        type: 'char'},
                    {name: 'unit', label: 'Selling U/M', type: 'many2one',
                        model: 'product.uom'},
                    {name: 'status', label: 'Line Status', type: 'selection',
                        options: [['open', 'Open'], ['closed', 'Closed']]},
                    {name: 'cost_from', label: 'Cost From', type: 'selection',
                        options: COST_FROM},
                    {name: 'bom', label: 'Engineering Master', type:
                        'many2one', model: 'production.bom', domain: [[
                            'master_type', '=', 'engineering']]},
                    {name: 'quote_master', label: 'Quote Master', type:
                        'many2one', model: 'production.bom', domain: [[
                            'master_type', '=', 'quote']]},
                    {name: 'drawing_number', label: 'Drawing ID',
                        type: 'char'},
                    {name: 'drawing_revision', label: 'Rev', type: 'char'},
                    {name: 'product_code', label: 'Product Code', type:
                        'many2one', model: 'nline.product_code'},
                    {name: 'commodity_code', label: 'Commodity Code', type:
                        'many2one', model: 'nline.commodity_code'},
                    {name: 'desired_ship_date', label: 'Ship Date',
                        type: 'date'},
                    {name: 'promise_date', label: 'Promise Date',
                        type: 'date'},
                    {name: 'win_probability', label: 'Win Probability %',
                        type: 'float'}]},
                {title: 'Quantities Quoted', render: function (p, v) {
                    grid = rowsGrid([
                        {name: 'quantity', label: 'Qty', type: 'float'},
                        {name: 'unit_cost', label: 'Unit Cost', type: 'float',
                            readonly: true},
                        {name: 'calc_unit_price', label: 'Calc Unit Price',
                            type: 'float', readonly: true},
                        {name: 'unit_price', label: 'Unit Price',
                            type: 'float'},
                        {name: 'trade_discount', label: 'Trade Disc %',
                            type: 'float'},
                        {name: 'leadtime', label: 'Leadtime', type: 'integer'},
                        {name: 'in_total', label: 'In Total',
                            type: 'boolean'},
                        {name: 'in_proforma', label: 'In Proforma',
                            type: 'boolean'}], v.prices || []);
                    p.appendChild(grid.node);
                    p.appendChild(el('p.nl-eng-muted', 'Enter the ' +
                        'quantities; Calculate prices fills the unit cost ' +
                        'and the calculated price (Cost From, markup ' +
                        markup.value + '%) of each.'));
                    return function () {
                        return {prices: grid.get()};
                    };
                }},
                {title: 'Specs', fields: [{name: 'specifications', label:
                    'Specs', type: 'text', rows: 8}]}
            ], line, writable ? function (values) {
                var merged = Object.assign({}, line, values);
                merged.prices = values.prices.filter(function (p) {
                    return p.quantity;
                });
                /* Jobshop calculates each quantity's cost from the master */
                return Promise.all(merged.prices.map(function (p) {
                    return cost(merged, p);
                })).then(function () {
                    if (index === null) {
                        lines.push(merged);
                    } else {
                        lines[index] = merged;
                    }
                    render();
                });
            } : null, {readonly: !writable});
        }
        function save() {
            return Rpc.desk('eng_quote_save', [record.id, lines.map(
                function (line) {
                    var row = Object.assign({}, line);
                    ['product', 'unit', 'bom', 'quote_master', 'product_code',
                        'commodity_code'].forEach(function (n) {
                        row[n] = row[n] && typeof row[n] === 'object' ?
                            row[n].id : row[n] || null;
                    });
                    return row;
                })]).then(function (result) {
                    lines = result;
                    render();
                    UI.toast('Quote lines saved', 'ok');
                }, UI.showError);
        }
        function recalc() {
            Promise.all(lines.map(function (line) {
                return Promise.all(line.prices.map(function (p) {
                    return cost(line, p);
                }));
            })).then(render, UI.showError);
        }
        pane.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', ['Line No', 'Part ID', 'Description', 'Quantities Quoted',
                'Cost From', 'Unit Prices', 'Amount', 'Status', ''].map(
                function (h) {
                    return el('th', h);
                }))), body)));
        pane.appendChild(el('div.toolbar', writable ? [el('button', {type:
            'button', onclick: function () {
                edit(null);
            }}, 'Add line'), el('label.field', 'Markup %'), markup,
            el('button', {type: 'button', onclick: recalc},
                'Calculate prices'), el('button.primary', {type: 'button',
                onclick: save}, 'Save lines')] : null, el('span.spacer'),
            el('label.field', 'Total of the lines'), total));
        Rpc.desk('eng_quote_get', [record.id]).then(function (result) {
            lines = result;
            render();
        }, UI.showError);
    }

    /* Print Quote: the quote as a printable page (the Quote Form) */
    function printQuote(record) {
        Promise.all([Rpc.desk('eng_quote_get', [record.id]),
            Rpc.searchRead('nline.quote.charge', [['quote', '=', record.id]],
                ['description', 'amount'])]).then(function (r) {
                var esc = function (s) {
                    return String(s === null || s === undefined ? '' : s)
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;');
                };
                var rows = r[0].map(function (l) {
                    return l.prices.map(function (p, i) {
                        var price = p.unit_price !== null ? p.unit_price :
                            p.calc_unit_price || 0;
                        return '<tr><td>' + (i ? '' : esc(l.line_no)) +
                            '</td><td>' + (i ? '' : esc(l.product ?
                                l.product.rec_name : '') + '<br>' +
                            esc(l.description)) + '</td><td class="n">' +
                            esc(p.quantity) + '</td><td class="n">' +
                            esc(UI.money(price)) + '</td><td class="n">' +
                            esc(UI.money(price * p.quantity)) + '</td></tr>';
                    }).join('');
                }).join('') + r[1].map(function (c) {
                    return '<tr><td></td><td>' + esc(c.description) +
                        '</td><td></td><td></td><td class="n">' +
                        esc(UI.money(c.amount)) + '</td></tr>';
                }).join('');
                var w = global.open('', '_blank');
                if (!w) {
                    UI.showError('Allow pop-ups to print the quote.');
                    return;
                }
                w.document.write('<!doctype html><title>Quote ' +
                    esc(record.number) + '</title><style>body{font:13px ' +
                    'sans-serif;margin:24px}table{width:100%;border-collapse:' +
                    'collapse}td,th{border-bottom:1px solid #ccc;padding:4px;' +
                    'text-align:left;vertical-align:top}.n{text-align:right}' +
                    '</style><h1>Quote ' + esc(record.number) + '</h1><p>' +
                    esc(UI.date(record.quote_date)) + '<br>' +
                    esc(record.name) + '<br>' + esc(record.street).replace(
                        /\n/g, '<br>') + '<br>' + esc(record.city) + ' ' +
                    esc(record.state) + ' ' + esc(record.postal_code) +
                    '</p><p>Your reference: ' + esc(record.customer_reference) +
                    '</p><table><tr><th>Line</th><th>Part / Description</th>' +
                    '<th class="n">Qty</th><th class="n">Unit Price</th>' +
                    '<th class="n">Amount</th></tr>' + rows + '</table><p>' +
                    esc(record.specifications).replace(/\n/g, '<br>') +
                    '</p><p>' + esc(record.footer).replace(/\n/g, '<br>') +
                    '</p>');
                w.document.close();
                w.print();
                Rpc.desk('eng_quote_printed', [record.id]).then(function () {},
                    function () {});
            }, UI.showError);
    }

    Screens.jsQuotes = function (main, params) {
        /* Etc., Mobile and Copy Notes to Sales Order are new fields of
         * the module: shown once the database has them */
        Rpc.model('nline.quote', 'fields_get', [['copy_notes', 'addr_etc',
            'contact_mobile']]).then(function (f) {
                quoteWindow(main, params, Boolean(f && f.copy_notes));
            }, function () {
                quoteWindow(main, params, false);
            });
    };

    function quoteWindow(main, params, extra) {
        var perm = null;
        var win = null;
        permissions().then(function (p) {
            perm = p;
            hideRibbon(main, ['Win Quote', 'Lose Quote', 'Cancel Quote',
                'Addresses from Customer'], !p.can('nline.quote', 'write'));
            hideRibbon(main, ['Win Quote'], !(p.can('nline.quote', 'write') &&
                p.can('sale.sale', 'create')));
        });
        function lose(r, status) {
            var reason = el('input', {type: 'text', 'aria-label':
                'Won/Loss Reason'});
            UI.modal(status === 'cancelled' ? 'Cancel Quote' : 'Lose Quote', [
                el('label.field', 'Won/Loss Reason'), reason], [
                {label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function () {
                    Rpc.desk('eng_quote_lose', [r.id, reason.value || null,
                        status]).then(function () {
                            win.load(r.id);
                        }, UI.showError);
                }}]);
        }
        win = UI.master(main, {
            title: 'Quotes',
            model: 'nline.quote',
            label: 'Quote ID',
            idAt: [14, 27, 257, 47],
            idSplit: 110,
            idField: 'number',
            order: [['quote_date', 'DESC'], ['number', 'DESC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            extra: [
                {label: 'Print Quote', onclick: function (r, load) {
                    if (r) {
                        printQuote(r);
                        setTimeout(function () {
                            load(r.id);
                        }, 1500);
                    }
                }},
                {label: 'Win Quote', onclick: function (r) {
                    if (!r) {
                        return;
                    }
                    UI.confirm('Win Quote', 'Make the sales order of quote ' +
                        r.number + ' (the quantities In Total of its open ' +
                        'lines and its charges)?').then(function (ok) {
                            if (!ok) {
                                return;
                            }
                            Rpc.desk('eng_quote_win', [r.id, true]).then(
                                function (sale) {
                                    UI.toast('Sales order made from the quote',
                                        'ok');
                                    win.load(r.id);
                                    if (perm && perm.screen('orders')) {
                                        UI.openScreen('orders/' + sale,
                                            'Order');
                                    }
                                }, UI.showError);
                        });
                }},
                {label: 'Lose Quote', onclick: function (r) {
                    if (r) {
                        lose(r, 'lost');
                    }
                }},
                {label: 'Cancel Quote', onclick: function (r) {
                    if (r) {
                        lose(r, 'cancelled');
                    }
                }},
                {label: 'Addresses from Customer', onclick: function (r) {
                    if (!r || !r.party) {
                        return;
                    }
                    Rpc.desk('eng_party_address', [r.party]).then(function (a) {
                        var values = Object.assign({}, a);
                        values.payment_term = a.payment_term ?
                            a.payment_term.id : null;
                        return Rpc.model('nline.quote', 'write', [[r.id],
                            values]);
                    }).then(function () {
                        win.load(r.id);
                    }, UI.showError);
                }}],
            tabs: [
                /* The Quote tab as Jobshop draws it (layouts/VEstimating/
                 * Quote.txt; its quote lines grid is the Quote Lines tab,
                 * so the Details part moves up; Currency not emulated) */
                {title: 'Quote', frames: [
                    {label: '', at: [3, 3, 869, 182]},
                    {label: '', at: [8, 190, 416, 381]},
                    {label: '', at: [423, 190, 835, 292]}],
                    fields: [
                    {name: 'created_by', label: 'Created by', type: 'char', readonly: true, at: [14, 4, 393, 24],
                        split: 110},
                    {name: 'modified_by', label: 'Last Modified by', type: 'char', readonly: true, at: [478, 4, 829, 24],
                        split: 120},
                    {name: 'party', label: 'Customer ID', type: 'many2one', model: 'party.party', at: [14, 49, 239, 69],
                        split: 110},
                    {name: 'quote_date', label: 'Quote Date', type: 'date', at: [14, 71, 239, 91],
                        split: 110},
                    {name: 'customer_reference', label: 'Customer Reference', type: 'char', at: [14, 93, 239, 113],
                        split: 110},
                    {name: 'status', label: 'Status', type: 'selection', options: QUOTE_STATUS, default: 'active', at: [14, 115, 239, 135],
                        split: 110},
                    {name: 'desired_ship_date', label: 'Ship On', type: 'date', at: [14, 137, 239, 157],
                        split: 110},
                    /* (split 110, not Jobshop's 154: in line with the
                     * other fields; the label still fits) */
                    {name: 'quoted_leadtime', label: 'Quoted Leadtime (days)', type: 'integer', at: [14, 159, 239, 179],
                        split: 110},
                    {name: 'win_probability', label: 'Win Probability Percent', type: 'float', at: [269, 159, 466, 179],
                        split: 133},
                    {name: 'promise_date', label: 'Promised', type: 'date', at: [478, 27, 717, 47],
                        split: 120},
                    {name: 'followup_date', label: 'Follow Up', type: 'date', at: [478, 49, 717, 69],
                        split: 120},
                    {name: 'expiration_date', label: 'Expires', type: 'date', at: [478, 71, 717, 91],
                        split: 120},
                    {name: 'expected_win_date', label: 'Expected', type: 'date', at: [478, 93, 717, 113],
                        split: 120},
                    {name: 'won_loss_date', label: 'Won/Loss', type: 'date', at: [478, 115, 717, 135],
                        split: 120},
                    {name: 'won_loss_reason', label: 'Won/Loss Reason', type: 'char', at: [478, 137, 831, 157],
                        split: 120},
                    {name: 'printed_date', label: 'Printed', type: 'char', readonly: true, at: [478, 159, 717, 179],
                        split: 120},
                    {name: 'our_supplier_id', label: 'Our Supplier ID', type: 'char', at: [14, 200, 231, 220],
                        split: 120},
                    {name: 'sales_rep', label: 'Sales Rep ID', type: 'char', at: [14, 222, 231, 242],
                        split: 120},
                    {name: 'discount_class', label: 'Discount Class ID', type: 'char', at: [14, 244, 231, 264],
                        split: 120},
                    {name: 'territory', label: 'Territory ID', type: 'char', at: [14, 266, 231, 286],
                        split: 120},
                    {name: 'sic_code', label: 'SIC Code ID', type: 'char', at: [14, 288, 231, 308],
                        split: 120},
                    {name: 'fob_point', label: 'FOB Point ID', type: 'many2one', model: 'nline.fob_point', at: [14, 310, 231, 330],
                        split: 120},
                    {name: 'ship_via', label: 'Ship Via ID', type: 'many2one', model: 'nline.ship_via', at: [14, 332, 231, 352],
                        split: 120},
                    {name: 'carrier', label: 'Carrier ID', type: 'char', at: [14, 354, 231, 374],
                        split: 120},
                    {name: 'freight_terms', label: 'Freight Terms', type: 'selection', options: [[null, ''], ['billed', 'Billed'], ['collect', 'Collect'], ['prepaid', 'Prepaid']], at: [429, 200, 668, 220],
                        split: 120},
                    {name: 'payment_term', label: 'Terms ID', type: 'many2one', model: 'account.invoice.payment_term', at: [429, 222, 668, 242],
                        split: 120},
                    {name: 'tax_group', label: 'Tax Group ID', type: 'char', at: [429, 244, 668, 264],
                        split: 120},
                    {name: 'tax_id_number', label: 'Tax ID', type: 'char', at: [429, 266, 668, 286],
                        split: 120},
                    {name: 'tax_exempt', label: 'Exempt', type: 'boolean', at: [675, 266, 794, 286],
                        split: 100},
                    {name: 'total_amount', label: 'Total', type: 'money', readonly: true, at: [649, 364, 833, 384],
                        split: 59}]},
                /* (the won quote's sales order: N-Line's, here instead of
                 * on the Quote tab, which Jobshop draws without it) */
                {title: 'Quote Lines', fields: [
                    {name: 'sale', label: 'Sales Order', type: 'many2one',
                        model: 'sale.sale', readonly: true}],
                    render: function (pane, r) {
                    var writable = perm ? perm.can('nline.quote', 'write') :
                        true;
                    quoteLines(pane, r, writable && ['active', 'ready'].indexOf(
                        r.status) >= 0);
                }},
                {title: 'Sold To', fields: address('', 'Sold To ', extra)},
                {title: 'Ship To', fields: address('ship_', 'Ship To ', extra)},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', rows: 10},
                    {name: 'footer', label: 'Quote Footer', type: 'text',
                        rows: 4}]},
                /* Jobshop's order: Notes, then Charges */
                extra ? {title: 'Notes', fields: [
                    {name: 'copy_notes', label: 'Copy Notes to Sales Order',
                        type: 'boolean', at: [15, 4, 338, 24]}],
                    render: function (pane, r) {
                        UI.notesTab(pane, 'nline.quote', r.id, perm ?
                            perm.can('nline.quote', 'write') : true);
                    }} : {notes: true},
                {title: 'Charges', lines: {name: 'charges', model:
                    'nline.quote.charge', inverse: 'quote', fields: [
                        {name: 'service_charge', label: 'Service Charge ID',
                            type: 'char'},
                        {name: 'description', label: 'Description',
                            type: 'char'},
                        {name: 'amount', label: 'Amount', type: 'money'},
                        {name: 'product', label: 'Service (sales order)',
                            type: 'many2one', model: 'product.product',
                            domain: [['type', '=', 'service']]},
                        {name: 'tax_group', label: 'Tax Group ID',
                            type: 'char'}]}}
            ],
            onload: function (r) {
                showCustomer(r.party);
                showTerms(r.payment_term);
                refreshBoxes();
            },
            browse: [
                {name: 'number', label: 'Quote ID'},
                {name: 'party.code', label: 'Customer ID'},
                {name: 'customer_reference', label: 'PO Ref #'},
                {name: 'quote_date', label: 'Quote Date', type: 'date'},
                {name: 'status', label: 'Status', labels: {active: 'Active',
                    ready: 'Ready', won: 'Won', lost: 'Lost',
                    cancelled: 'Cancelled'}},
                {name: 'total_amount', label: 'Total', type: 'money'}]
        });

        var quotePane = tabPane(main, 'Quote');
        /* Customer ID: the customer's ID (its name in the tooltip) */
        var customer = quotePane && quotePane.querySelector(
            'input[aria-label="Customer ID"]');
        function showCustomer(party) {
            if (!customer || !party) {
                return;
            }
            Rpc.searchRead('party.party', [['id', '=', party]], ['code',
                'rec_name']).then(function (rows) {
                    if (rows[0] && rows[0].code) {
                        customer.value = rows[0].code;
                        customer.title = rows[0].rec_name;
                    }
                }, function () {});
        }
        /* Sold to/Ship to: the two addresses of the Sold To / Ship To tabs
         * (read-only, layout ADDRESSES) */
        var addresses = placeBox(quotePane, [266, 34, 466, 153], {label:
            'Sold to/Ship to', multi: true});
        function tabValues(title, labels) {
            var pane = tabPane(main, title);
            return labels.map(function (label) {
                var input = pane && pane.querySelector('[aria-label="' +
                    label + '"]');
                return input ? input.value.trim() : '';
            });
        }
        function addressText(title) {
            var v = tabValues(title, ['Name', 'Address', 'City',
                'State/Postal', 'Postal Code']);
            return [v[0], v[1], [v[2], [v[3], v[4]].filter(Boolean).join(
                ' ')].filter(Boolean).join(', ')].filter(Boolean).join('\n');
        }
        /* The descriptions beside the codes (layout *_DESCR) and the "..."
         * of the codes kept as text */
        function field(label) {
            return quotePane && quotePane.querySelector('input[aria-label="' +
                label + '"]');
        }
        var writable = function () {
            return perm ? perm.can('nline.quote', 'write') : false;
        };
        var codes = [
            ['Sales Rep ID', 'nline.sales_rep', 222],
            ['Discount Class ID', 'nline.discount_class', 244],
            ['Territory ID', 'nline.territory', 266],
            ['SIC Code ID', 'nline.sic_code', 288],
            ['Carrier ID', 'nline.carrier', 354]
        ].map(function (c) {
            return codeLookup({input: field(c[0]), model: c[1], writable:
                writable, descr: placeBox(quotePane, [233, c[2], 409, c[2] +
                    20], {label: c[0].replace(/ ID$/, '') + ' Description'})});
        }).concat([codeLookup({input: field('Tax Group ID'), model:
            'nline.sales_tax_group', writable: writable, descr: placeBox(
                quotePane, [670, 244, 824, 264], {label:
                    'Tax Group Description'})})]);
        /* (FOB Point, Ship Via are lookups already: their names; the
         * Terms' description is read with the record) */
        var terms = placeBox(quotePane, [670, 222, 824, 242], {label:
            'Terms Description'});
        function showTerms(id) {
            terms.value = '';
            if (id) {
                Rpc.model('account.invoice.payment_term', 'read', [[id],
                    ['description']]).then(function (rows) {
                        terms.value = (rows[0] || {}).description || '';
                    }, function () {});
            }
        }
        var named = [['FOB Point ID', [233, 310, 409, 330]],
            ['Ship Via ID', [233, 332, 409, 352]]].map(function (c) {
                return {input: field(c[0]), descr: placeBox(quotePane, c[1],
                    {label: c[0].replace(/ ID$/, '') + ' Description'})};
            });
        function refreshBoxes() {
            var sold = addressText('Sold To');
            var ship = addressText('Ship To');
            addresses.value = sold + (ship && ship !== sold ? '\n\nShip to:\n' +
                ship : '');
            codes.forEach(function (c) {
                c.refresh();
            });
            named.forEach(function (c) {
                if (!c.input) {
                    return;
                }
                /* The lookup shows the ID, its tooltip the full name
                 * ("ID - Description"); Terms show their name */
                var full = c.input.title || c.input.value;
                var at = full.indexOf(' - ');
                c.descr.value = at > 0 && c.input.value ? full.slice(at + 3) :
                    '';
            });
        }
        main.addEventListener('focusout', function () {
            setTimeout(refreshBoxes, 300);
        });
        afterClear(main, function () {
            showTerms(null);
            refreshBoxes();
        });
        /* Address: its label beside the two lines, as Jobshop */
        Array.prototype.forEach.call(main.querySelectorAll(
            'textarea[aria-label="Address"]'), function (t) {
                var ctl = t.closest('.js-ctl');
                if (ctl) {
                    ctl.classList.add('nl-eng-row');
                }
            });
        browseOneLine(main);
    }
    /* (the planning screen's name of the window) */
    Screens.quotes = Screens.jsQuotes;
}(window));
