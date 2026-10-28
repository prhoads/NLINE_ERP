/* N-Line Jobshop emulation: shopfloor screens (module nline_js_shopfloor; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * The Shopfloor group bar except the Work Order window (engineering area):
 * Material Issues/Returns, Work Order Receipts/Returns, Shop Resources, Shop
 * Groups, Shop Views, Labor Entry (with Labor Reversal), Labor Data
 * Collection (the shop floor terminal, for a touch screen and a bar code
 * scanner) and Employees. The services are nline.desk sf_* (module
 * nline_js_shopfloor, desk.py). What the user may not do is not shown. */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    /* ---- Style -------------------------------------------------------- */

    function style() {
        if (document.getElementById('nl-js-shopfloor-css')) {
            return;
        }
        document.head.appendChild(el('style#nl-js-shopfloor-css', [
            '.sf-head { display: flex; gap: 14px; align-items: end; ' +
                'flex-wrap: wrap; margin-bottom: 10px; }',
            '.sf-head > label, .sf-head > div { display: flex; ' +
                'flex-direction: column; gap: 3px; }',
            '.sf-head label.check, .sf-checks label { flex-direction: row; ' +
                'align-items: center; gap: 6px; color: var(--muted); }',
            '.sf-head .picker { min-width: 260px; }',
            '.sf-checks { display: flex; gap: 14px; flex-wrap: wrap; ' +
                'align-items: center; }',
            'table.sf-table td { padding: 2px 5px; white-space: nowrap; }',
            'table.sf-table td input[type=text] { width: 90px; }',
            'table.sf-table td .picker { min-width: 170px; }',
            'table.sf-table td.short input { color: var(--bad); ' +
                'font-weight: 600; }',
            'table.sf-table tr.selected td { background: var(--accent-soft); }',
            'table.sf-table tr.reversed td, table.sf-table tr.suspended td ' +
                '{ background: #fff4c2; }',
            'table.sf-table tr.active td { background: #dff3dc; }',
            'table.sf-table tr.posted td { background: var(--paper); }',
            'table.sf-table tr.selected td { box-shadow: inset 0 0 0 9999px ' +
                'rgba(29, 107, 85, .16); }',
            'table.sf-table tr.deleted td { opacity: .5; text-decoration: ' +
                'line-through; }',
            'table.sf-table td.row-head { width: 24px; text-align: center; ' +
                'color: var(--muted); font-weight: 600; cursor: pointer; }',
            'table.sf-table tr.changed td.row-head { color: var(--ok); }',
            'table.sf-table tr.deleted td.row-head { color: var(--bad); }',
            '.sf-tabs { display: flex; gap: 2px; border-bottom: 1px solid ' +
                'var(--line); margin-bottom: 10px; }',
            '.sf-tabs button { border-radius: 6px 6px 0 0; }',
            '.sf-tabs button.active { font-weight: 600; background: ' +
                'var(--paper); }',
            '.sf-form { display: grid; grid-template-columns: repeat(auto-fill, ' +
                'minmax(170px, 1fr)); gap: 8px 14px; margin-bottom: 10px; }',
            '.sf-form label { display: flex; flex-direction: column; gap: 3px; ' +
                'font-size: 13px; color: var(--muted); }',
            '.sf-form label.check { flex-direction: row; align-items: center; }',
            '.sf-form input, .sf-form select, .sf-form textarea { color: ' +
                'var(--ink); }',
            '.sf-form .wide { grid-column: span 2; }',
            '.sf-note { color: var(--muted); margin: 4px 0 8px; }',
            /* The terminal: big targets for a touch screen */
            '.ldc { font-size: 17px; }',
            '.ldc input, .ldc select, .ldc button { font-size: 18px; ' +
                'min-height: 44px; }',
            '.ldc .ldc-scan { display: flex; gap: 10px; align-items: center; ' +
                'flex-wrap: wrap; }',
            '.ldc .ldc-scan input { width: 320px; }',
            '.ldc .ldc-who { margin: 10px 0; padding: 10px 14px; ' +
                'border: 1px solid var(--line); border-radius: 8px; ' +
                'background: var(--paper); display: flex; gap: 14px; ' +
                'align-items: center; flex-wrap: wrap; }',
            '.ldc .ldc-who strong { font-size: 22px; }',
            '.ldc .ldc-buttons { display: grid; grid-template-columns: ' +
                'repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; ' +
                'margin: 10px 0; }',
            '.ldc .ldc-buttons button { min-height: 64px; font-size: 20px; ' +
                'font-weight: 600; }',
            '.ldc table.sf-table td { padding: 10px 8px; font-size: 16px; }',
            '.ldc .ldc-filter { display: flex; gap: 12px; flex-wrap: wrap; ' +
                'align-items: center; }',
            '.ldc .ldc-filter label { display: inline-flex; gap: 6px; ' +
                'align-items: center; }',
            '.ldc .ldc-filter input[type=radio] { width: 24px; height: 24px; ' +
                'min-height: 0; }',
            '.ldc-legend { display: flex; gap: 12px; color: var(--muted); ' +
                'font-size: 13px; margin: 4px 0; }',
            '.ldc-legend i { display: inline-block; width: 14px; height: 14px; ' +
                'border: 1px solid var(--line); vertical-align: middle; ' +
                'margin-right: 4px; }',
            '.modal .sf-form { min-width: min(560px, 80vw); }',
            '.modal.ldc-modal input, .modal.ldc-modal select, ' +
                '.modal.ldc-modal button { font-size: 18px; min-height: 42px; }'
        ].join('\n')));
    }

    /* ---- Helpers ------------------------------------------------------ */

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function pad(n) {
        return (n < 10 ? '0' : '') + n;
    }

    /* Now as the server's 'YYYY-MM-DD HH:MM' (local time) */
    function now() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' +
            pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' +
            pad(d.getMinutes());
    }

    /* A datetime-local input of a 'YYYY-MM-DD HH:MM' value */
    function dateTimeInput(value, label) {
        var input = el('input', {type: 'datetime-local', 'aria-label': label});
        input.value = value ? String(value).replace(' ', 'T').slice(0, 16) :
            '';
        return input;
    }

    function dateTimeValue(input) {
        return input.value ? input.value.replace('T', ' ') : null;
    }

    function text(v) {
        return v === null || v === undefined ? '' : String(v);
    }

    function qty(v) {
        if (v === null || v === undefined || v === '') {
            return '';
        }
        return String(Math.round(v * 10000) / 10000);
    }

    function parseNum(value) {
        var v = parseFloat(String(value || '').replace(/[,\s]/g, ''));
        return isNaN(v) ? null : v;
    }

    function td(value, cls) {
        return el('td' + (cls ? '.' + cls : ''), value === null ||
            value === undefined ? '' : value);
    }

    function numTd(value) {
        return el('td.num', qty(value));
    }

    function moneyTd(value) {
        return el('td.num', value === null || value === undefined ? '' :
            UI.money(value));
    }

    function yes(v) {
        return v ? '✔' : '';
    }

    function table(heads, body) {
        return el('div.table-wrap', el('table.data.sf-table', el('thead',
            el('tr', heads.map(function (h) {
                return el('th' + (/^#/.test(h) ? '.num' : ''),
                    h.replace(/^#/, ''));
            }))), body));
    }

    function emptyRow(body, span, message) {
        body.appendChild(el('tr', el('td', {colspan: span}, message)));
    }

    function check(label, checked, onchange) {
        var box = el('input', {type: 'checkbox', checked: checked});
        if (onchange) {
            box.addEventListener('change', onchange);
        }
        return {node: el('label.check', box, ' ' + label), box: box};
    }

    function field(label, control, cls) {
        return el('label' + (cls ? '.' + cls : ''), label, control.node ||
            control);
    }

    /* A simple tab bar of panes: [{title, render(pane)}] */
    function tabs(main, list) {
        var bar = el('div.sf-tabs', {role: 'tablist'});
        var panes = el('div');
        var shown = [];
        list.forEach(function (tab, index) {
            var button = el('button', {type: 'button', role: 'tab',
                onclick: function () {
                    show(index);
                }}, tab.title);
            bar.appendChild(button);
            var pane = el('div', {role: 'tabpanel', hidden: true});
            panes.appendChild(pane);
            shown.push(false);
            tab.button = button;
            tab.pane = pane;
        });
        function show(index) {
            list.forEach(function (tab, i) {
                tab.button.classList.toggle('active', i === index);
                tab.pane.hidden = i !== index;
            });
            if (!shown[index]) {
                shown[index] = true;
                list[index].render(list[index].pane);
            } else if (list[index].onshow) {
                list[index].onshow();
            }
        }
        main.appendChild(bar);
        main.appendChild(panes);
        show(0);
        return {show: show};
    }

    /* Ctrl+S / F5 on a screen while it is shown */
    function shortcuts(node, keys) {
        document.addEventListener('keydown', function (event) {
            if (!node.isConnected) {
                return;
            }
            var key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 's' && keys.save) {
                event.preventDefault();
                keys.save();
            } else if (event.key === 'F5' && keys.refresh) {
                event.preventDefault();
                keys.refresh();
            } else if (event.key === 'Delete' && keys.del &&
                    !/input|textarea|select/i.test(
                        (document.activeElement || {}).tagName || '')) {
                event.preventDefault();
                keys.del();
            }
        });
    }

    /* What the user may do on these models: {model: {read, write, create,
     * delete}} (unknown: allowed, the server still refuses) */
    function rights(models) {
        return UI.access(models).then(function (result) {
            var out = {};
            models.forEach(function (m) {
                var a = result[m] || {};
                out[m] = {read: a.read !== false, write: a.write !== false,
                    create: a.create !== false, delete: a.delete !== false};
            });
            return out;
        });
    }

    var OPEN_WO = [['state', 'in', ['waiting', 'assigned', 'running']]];

    function woPicker(onselect, domain) {
        return UI.picker('production', {label: 'Work Order ID',
            placeholder: 'Work Order ID', domain: domain || OPEN_WO,
            order: [['number', 'ASC']], onselect: onselect});
    }

    function storagePicker(id, name, onselect) {
        var p = UI.picker('stock.location', {label: 'Location ID',
            placeholder: 'Location', domain: [['type', '=', 'storage']],
            onselect: onselect});
        if (id) {
            p.set(id, name);
        }
        return p;
    }

    /* View > Inventory Pieces: a part's stock by location */
    function partQuantities(product) {
        Rpc.desk('sf_part_quantities', [product]).then(function (r) {
            var body = el('tbody');
            r.rows.forEach(function (row) {
                body.appendChild(el('tr', td(row.location), numTd(row.quantity),
                    td(row.unit)));
            });
            if (!r.rows.length) {
                emptyRow(body, 3, 'No stock.');
            }
            body.appendChild(el('tr.total', td('Total'), numTd(r.total),
                td('')));
            UI.modal('Inventory Pieces - ' + r.part, [table(['Location',
                '#Quantity', 'U/M'], body)]);
        }, failed);
    }

    /* View > Inventory Txs: a part's inventory transactions */
    function partTransactions(product, name) {
        Rpc.desk('sf_part_transactions', [product]).then(function (rows) {
            var body = el('tbody');
            rows.forEach(function (row) {
                body.appendChild(el('tr', td(UI.date(row.date)), td(row.type),
                    td(row.document), td(row.from), td(row.to),
                    numTd(row.quantity), td(row.unit), moneyTd(row.cost)));
            });
            if (!rows.length) {
                emptyRow(body, 8, 'No transaction.');
            }
            UI.modal('Inventory Transactions - ' + (name || ''), [
                el('div', {style: {maxHeight: '60vh', overflow: 'auto'}},
                    table(['Date', 'Type', 'Document', 'From', 'To', '#Qty',
                        'U/M', '#Unit cost'], body))]);
        }, failed);
    }

    function openPart(product) {
        UI.screenAllowed('parts').then(function (ok) {
            if (ok) {
                UI.openScreen('parts/' + product);
            } else {
                UI.openRecord('product.product', product);
            }
        });
    }

    /* ---- Material Issues/Returns ----------------------------------------- */

    Screens.jsMaterialIssues = function (main) {
        style();
        var allowed = {issue: false};
        var current = null;
        var data = null;
        var rows = [];
        var date = el('input', {type: 'date', 'aria-label': 'Date',
            value: UI.today()});
        var wo = woPicker(function (r) {
            current = r.id;
            load();
        });
        var seq = el('select', {'aria-label': 'Sub/Seq'},
            el('option', {value: ''}, 'All'));
        var showAll = check('Show All', false, load);
        var stocked = check('Stocked Parts Only', false, load);
        var form = UI.form(main, {title: 'Material Issues/Returns', extra: [
            {label: 'Save', title: 'Issue / return the marked lines ' +
                '(Ctrl+S)', onclick: save},
            {label: 'Refresh', title: 'Refresh (F5)', onclick: load}]});
        var body = form.body;
        form.allow(false, ['Save']);
        seq.addEventListener('change', load);
        body.appendChild(el('div.panel', el('div.sf-head',
            field('Date', date), field('Work Order ID', wo),
            field('Sub/Seq', seq),
            el('div.sf-checks', showAll.node, stocked.node))));
        var info = el('p.sf-note', 'Choose a firm or released work order.');
        var buttons = el('div.toolbar',
            el('button', {type: 'button', onclick: function () {
                select('issue');
            }}, 'Select All'),
            el('button', {type: 'button', onclick: function () {
                select('none');
            }}, 'UnSelect All'),
            el('button', {type: 'button', onclick: function () {
                select('return');
            }}, 'Select All For Return'));
        var tbody = el('tbody');
        body.appendChild(info);
        body.appendChild(buttons);
        body.appendChild(table(['Issue', 'Close Now', 'Sub ID', 'Seq No',
            'Piece No', 'Part ID', 'Description', 'Status',
            '#Issue Qty (Usage UM)', 'Usage U/M', 'Location ID',
            '#Issued To Date', '#Qty Due', '#Location Qty', 'Available',
            '#Qty on Hand', 'Linked', 'Tracked'], tbody));
        buttons.hidden = true;
        shortcuts(body, {save: function () {
            if (allowed.issue) {
                save();
            }
        }, refresh: load});

        rights(['stock.move']).then(function (r) {
            allowed.issue = r['stock.move'].create;
            form.allow(false, allowed.issue ? [] : ['Save']);
            render();
        });

        function load() {
            if (!current) {
                return;
            }
            Rpc.desk('sf_material_lines', [current, {
                show_all: showAll.box.checked,
                stocked_only: stocked.box.checked,
                operation: seq.value || null}]).then(function (d) {
                    data = d;
                    var keep = seq.value;
                    UI.clear(seq).appendChild(el('option', {value: ''},
                        'All'));
                    d.operations.forEach(function (s) {
                        seq.appendChild(el('option', {value: s}, '0/' + s));
                    });
                    seq.value = keep;
                    rows = d.rows.map(function (r) {
                        return {r: r};
                    });
                    render();
                }, failed);
        }

        function rowControls(row) {
            var r = row.r;
            row.issue = el('input', {type: 'checkbox', 'aria-label':
                'Issue'});
            row.close = el('input', {type: 'checkbox', 'aria-label':
                'Close Now'});
            row.qty = el('input.money', {type: 'text', 'aria-label':
                'Issue Qty', value: r.due > 0 ? qty(r.due) : ''});
            row.location = storagePicker(r.location, r.location_name);
            row.qtyCell = el('td', row.qty);
            function mark() {
                var v = parseNum(row.qty.value);
                row.issue.checked = v !== null && v !== 0;
                short();
            }
            function short() {
                var v = parseNum(row.qty.value) || 0;
                row.qtyCell.classList.toggle('short', v > 0 &&
                    v > (r.location_qty || 0));
            }
            row.qty.addEventListener('input', mark);
            short();
        }

        function render() {
            UI.clear(tbody);
            if (!data) {
                return;
            }
            info.textContent = 'Work order ' + data.number + ' - ' +
                data.part + ' - ' + qty(data.quantity) + ' - ' + data.status +
                (data.open ? '' : ' (closed: nothing can be issued)');
            var editable = allowed.issue && data.open;
            buttons.hidden = !editable;
            form.allow(false, editable ? [] : ['Save']);
            rows.forEach(function (row) {
                var r = row.r;
                rowControls(row);
                [row.issue, row.close, row.qty, row.location.input].forEach(
                    function (c) {
                        c.disabled = !editable;
                    });
                tbody.appendChild(el('tr', {oncontextmenu: function (event) {
                    menu(event, r.product, r.part);
                }}, el('td', row.issue), el('td', row.close), td(r.sub),
                    td(r.seq), td(r.piece), td(r.code || r.part),
                    td(r.description), td(r.status), row.qtyCell, td(r.unit),
                    el('td', row.location.node), numTd(r.issued),
                    numTd(r.due), numTd(r.location_qty),
                    td(r.available ? 'Yes' : 'No'), numTd(r.on_hand),
                    td(yes(r.linked)), td(yes(r.tracked))));
            });
            if (!rows.length) {
                emptyRow(tbody, 18, showAll.box.checked ? 'No material.' :
                    'Everything is issued (Show All shows the issued ' +
                    'materials).');
            }
            if (editable) {
                addRow();
            }
        }

        /* An empty row: a part not on the work order, issued on the fly
         * (Jobshop adds a material card) */
        function addRow() {
            var product = UI.picker('product.product', {label: 'Part ID',
                placeholder: 'Add a part', domain: [['type', 'in', ['goods',
                    'assets']]]});
            var q = el('input.money', {type: 'text', 'aria-label':
                'Issue Qty'});
            var location = storagePicker(null, '');
            var row = {extra: true, product: product, qty: q,
                location: location, issue: el('input', {type: 'checkbox'}),
                close: {checked: false}};
            q.addEventListener('input', function () {
                row.issue.checked = parseNum(q.value) !== null;
            });
            rows.push(row);
            tbody.appendChild(el('tr', el('td', row.issue), el('td'),
                el('td'), el('td'), el('td'),
                el('td', {colspan: 3}, product.node), el('td', q), el('td'),
                el('td', location.node), el('td', {colspan: 7})));
        }

        function menu(event, product, name) {
            UI.contextMenu(event, [
                {label: 'Inventory Pieces', onclick: function () {
                    partQuantities(product);
                }},
                {label: 'Inventory Txs', onclick: function () {
                    partTransactions(product, name);
                }},
                '-',
                {label: 'Open Part', onclick: function () {
                    openPart(product);
                }}]);
        }

        function select(how) {
            rows.forEach(function (row) {
                if (row.extra) {
                    return;
                }
                if (how === 'none') {
                    row.issue.checked = false;
                } else if (how === 'issue') {
                    row.issue.checked = row.r.due > 0;
                    row.qty.value = row.r.due > 0 ? qty(row.r.due) : '';
                } else if (how === 'return') {
                    row.issue.checked = row.r.issued > 0;
                    row.qty.value = row.r.issued > 0 ? qty(-row.r.issued) :
                        '';
                }
                row.qty.dispatchEvent(new Event('input'));
                row.issue.checked = how === 'none' ? false :
                    row.issue.checked;
            });
        }

        function save() {
            if (!data || !data.open) {
                return;
            }
            var lines = [];
            rows.forEach(function (row) {
                var v = parseNum(row.qty.value);
                if (row.extra) {
                    if (row.issue.checked && row.product.value() && v) {
                        lines.push({product: row.product.value(), quantity: v,
                            location: row.location.value()});
                    }
                    return;
                }
                if ((row.issue.checked && v) || row.close.checked) {
                    lines.push({product: row.r.product, moves: row.r.moves,
                        quantity: row.issue.checked ? v || 0 : 0,
                        location: row.location.value() || row.r.location,
                        close_now: row.close.checked});
                }
            });
            if (!lines.length) {
                UI.toast('Mark the lines to issue or return first', 'error');
                return;
            }
            UI.service('sf_material_save', {production: current,
                date: date.value, lines: lines}).then(function (r) {
                    UI.toast(r.issued + ' issued, ' + r.returned +
                        ' returned' + (r.closed ? ', ' + r.closed +
                        ' closed' : ''), 'ok');
                    load();
                }, failed);
        }
    };
    Screens.materialIssues = Screens.jsMaterialIssues;

    /* ---- Work Order Receipts/Returns --------------------------------------- */

    Screens.jsWoReceipts = function (main) {
        style();
        var allowed = {receive: false};
        var rows = [];
        var date = el('input', {type: 'date', 'aria-label': 'Date',
            value: UI.today()});
        var openRadio = el('input', {type: 'radio', name: 'sf-rcv-mode',
            checked: true});
        var receivedRadio = el('input', {type: 'radio', name: 'sf-rcv-mode'});
        var linked = check('Exclude Fully Linked', false, load);
        var incomplete = check('Exclude Not Fully Completed', false, load);
        [openRadio, receivedRadio].forEach(function (r) {
            r.addEventListener('change', load);
        });
        var form = UI.form(main, {title: 'Work Order Receipts/Returns',
            extra: [
                {label: 'Save', title: 'Receive / return the marked work ' +
                    'orders (Ctrl+S)', onclick: save},
                {label: 'Refresh', title: 'Refresh (F5)', onclick: load}]});
        var body = form.body;
        form.allow(false, ['Save']);
        body.appendChild(el('div.panel', el('div.sf-head', field('Date', date),
            el('div.sf-checks',
                el('label.check', openRadio,
                    ' Show All Currently Open Work Orders'),
                el('label.check', receivedRadio,
                    ' Show All Previously Received Work Orders'),
                linked.node, incomplete.node))));
        body.appendChild(el('p.sf-note', 'Receive the parts of a work order ' +
            'to stock (to completion closes it; Close Short closes it with ' +
            'fewer), or return received parts of an open work order to the ' +
            'shop floor.'));
        var tbody = el('tbody');
        body.appendChild(table(['Transact Now', 'Close Short',
            'Work Order ID', 'Sub ID', 'Part ID', '#Desired Qty',
            '#Linked Qty', '#Received Qty', 'For Return', '#Rec/Rtn Qty',
            'U/M', 'Location', '#Qty Available', 'Order Status',
            'Description', 'Tracked'], tbody));
        shortcuts(body, {save: function () {
            if (allowed.receive) {
                save();
            }
        }, refresh: load});

        rights(['stock.move']).then(function (r) {
            allowed.receive = r['stock.move'].create;
            form.allow(false, allowed.receive ? [] : ['Save']);
            load();
        });

        function load() {
            Rpc.desk('sf_receipt_lines', [{
                mode: receivedRadio.checked ? 'received' : 'open',
                exclude_linked: linked.box.checked,
                exclude_incomplete: incomplete.box.checked}]).then(
                function (list) {
                    rows = list.map(function (r) {
                        return {r: r};
                    });
                    render();
                }, failed);
        }

        function render() {
            UI.clear(tbody);
            rows.forEach(function (row) {
                var r = row.r;
                var editable = allowed.receive && (!r.for_return ||
                    r.can_return);
                row.transact = el('input', {type: 'checkbox', 'aria-label':
                    'Transact Now', disabled: !editable});
                row.closeShort = el('input', {type: 'checkbox', 'aria-label':
                    'Close Short', disabled: !editable || r.for_return});
                row.qty = el('input.money', {type: 'text', 'aria-label':
                    'Rec/Rtn Qty', value: qty(r.quantity),
                    disabled: !editable});
                row.location = storagePicker(r.location, r.location_name);
                row.location.input.disabled = !editable;
                row.qty.addEventListener('input', function () {
                    row.transact.checked = true;
                });
                tbody.appendChild(el('tr', {oncontextmenu: function (event) {
                    menu(event, r);
                }}, el('td', row.transact), el('td', row.closeShort),
                    td(r.number), td(r.sub), td(r.part), numTd(r.desired),
                    numTd(r.linked), numTd(r.received),
                    td(yes(r.for_return)), el('td', row.qty), td(r.unit),
                    el('td', row.location.node), numTd(r.available),
                    td(r.status + (r.for_return && !r.can_return ?
                        ' (closed)' : '')), td(r.description),
                    td(yes(r.tracked))));
            });
            if (!rows.length) {
                emptyRow(tbody, 16, receivedRadio.checked ?
                    'No received work order.' : 'No open work order.');
            }
        }

        function menu(event, r) {
            var items = [
                {label: 'Open Work Order', onclick: function () {
                    UI.openScreen('work-orders/' + r.id);
                }},
                {label: 'Inventory Txs', onclick: function () {
                    partTransactions(r.product, r.part);
                }}];
            if (allowed.receive && !r.for_return) {
                /* The earlier one-click receipt: everything, then closed */
                items.push('-', {label: 'Receive All and Close',
                    onclick: function () {
                        UI.service('work_order_receive', {production: r.id})
                            .then(function (x) {
                                UI.toast('Work order ' + r.number + ' ' +
                                    x.state, 'ok');
                                load();
                            }, failed);
                    }});
            }
            UI.contextMenu(event, items);
        }

        function save() {
            var lines = rows.filter(function (row) {
                return row.transact.checked;
            }).map(function (row) {
                return {production: row.r.id, quantity: parseNum(
                    row.qty.value) || 0, location: row.location.value(),
                    close_short: row.closeShort.checked,
                    'return': row.r.for_return};
            });
            if (!lines.length) {
                UI.toast('Check Transact Now on the lines first', 'error');
                return;
            }
            UI.service('sf_receipt_save', {date: date.value, lines: lines})
                .then(function (result) {
                    UI.toast(result.length + ' work order(s) transacted',
                        'ok');
                    load();
                }, failed);
        }
    };
    Screens.woReceipts = Screens.jsWoReceipts;

    /* ---- Shop Resources ------------------------------------------------- */

    var RESOURCE_TYPES = [['machine', 'Machine'], ['assembly',
        'Assembly Area'], ['general', 'General Area'], ['contractor',
        'Contractor'], ['group', 'Group'], ['team', 'Team/Individual']];
    var TYPE_LABELS = {};
    RESOURCE_TYPES.forEach(function (t) {
        TYPE_LABELS[t[0]] = t[1];
    });
    var DAYS = [['0', 'Saturday'], ['1', 'Sunday'], ['2', 'Monday'],
        ['3', 'Tuesday'], ['4', 'Wednesday'], ['5', 'Thursday'],
        ['6', 'Friday']];
    var CAL_FIELDS = [
        {name: 'shift_1', label: 'Shift 1 Hrs', type: 'float'},
        {name: 'shift_2', label: 'Shift 2 Hrs', type: 'float'},
        {name: 'shift_3', label: 'Shift 3 Hrs', type: 'float'},
        {name: 'shift_1_capacity', label: 'Shift 1 Cap', type: 'integer'},
        {name: 'shift_2_capacity', label: 'Shift 2 Cap', type: 'integer'},
        {name: 'shift_3_capacity', label: 'Shift 3 Cap', type: 'integer'}];

    function setupResource(id) {
        return Rpc.desk('sf_resource_setup', [id]);
    }

    /* View > Where Used */
    function whereUsed(record) {
        if (!record) {
            UI.toast('Choose a resource first', 'error');
            return;
        }
        var quotes = check('Quote Masters', true, show);
        var masters = check('Engineering Masters', true, show);
        var orders = check('Work Orders', true, show);
        var body = el('tbody');
        var rows = [];
        Rpc.desk('sf_resource_where_used', [record.id, {}]).then(function (r) {
            rows = r.rows;
            show();
        }, failed);
        function show() {
            UI.clear(body);
            rows.filter(function (row) {
                return row.type === 'Work Order' ? orders.box.checked :
                    row.type === 'Quote Master' ? quotes.box.checked :
                    masters.box.checked;
            }).forEach(function (row) {
                body.appendChild(el('tr', {title: 'Double-click to open',
                    ondblclick: function () {
                        if (row.model === 'production') {
                            UI.openScreen('work-orders/' + row.id);
                        } else {
                            UI.openRecord(row.model, row.id);
                        }
                    }}, td(row.type), td(row.document), td(row.part),
                    td(row.seq), td(row.operation), td(row.status)));
            });
            if (!body.children.length) {
                emptyRow(body, 6, 'Not used.');
            }
        }
        UI.modal('Resource Where Used - ' + record.name, [
            el('div.sf-checks', quotes.node, masters.node, orders.node),
            el('div', {style: {maxHeight: '60vh', overflow: 'auto'}},
                table(['Type', 'ID', 'Part', 'Seq #', 'Operation', 'Status'],
                    body))]);
    }

    /* Tools > Reset Operation Info */
    function resetCosts(record) {
        var current = el('input', {type: 'radio', name: 'sf-reset-res',
            checked: Boolean(record), disabled: !record});
        var all = el('input', {type: 'radio', name: 'sf-reset-res',
            checked: !record});
        var quotes = check('Quote Master Operations', true);
        var masters = check('Engineering Master Operations', true);
        var orders = check('Work Order Operations', true);
        var byStatus = check('According to Operation Status', false);
        var statuses = [['unreleased', 'Unreleased'], ['firm', 'Firmed'],
            ['released', 'Released'], ['closed', 'Closed'],
            ['cancelled', 'Cancelled']].map(function (s) {
                var c = check(s[1], s[0] !== 'closed' &&
                    s[0] !== 'cancelled');
                c.value = s[0];
                return c;
            });
        var byDate = check('According to W/O or Master Creation Date', false);
        var from = el('input', {type: 'date', 'aria-label': 'On or After'});
        var to = el('input', {type: 'date', 'aria-label': 'On or Before'});
        UI.modal('Reset Operation Costs', [
            el('div.sf-checks', el('label.check', current,
                ' Current Resource Only' + (record ? ' (' + record.name +
                ')' : '')), el('label.check', all, ' All Resources')),
            el('div.sf-checks', quotes.node, masters.node, orders.node),
            el('div.sf-checks', byStatus.node, statuses.map(function (s) {
                return s.node;
            })),
            el('div.sf-checks', byDate.node, el('label', 'On or After ', from),
                el('label', 'On or Before ', to)),
            el('p.sf-note', 'The operations take the current costs of ' +
                'their resource; the Tryton rate of a resource becomes its ' +
                'run cost plus run burden per hour. Without a status, the ' +
                'open work orders.')], [
            {label: 'Cancel'},
            {label: 'OK', primary: true, onclick: function () {
                Rpc.desk('sf_reset_operation_costs', [{
                    resource: current.checked && record ? record.id : null,
                    quotes: quotes.box.checked,
                    masters: masters.box.checked,
                    work_orders: orders.box.checked,
                    statuses: byStatus.box.checked ? statuses.filter(
                        function (s) {
                            return s.box.checked;
                        }).map(function (s) {
                            return s.value;
                        }) : null,
                    from_date: byDate.box.checked ? from.value || null : null,
                    to_date: byDate.box.checked ? to.value || null : null
                }]).then(function (r) {
                    UI.toast(r.work_orders + ' work order and ' +
                        r.masters + ' master operation(s) reset, ' +
                        r.resources + ' resource rate(s)', 'ok');
                }, failed);
            }}]);
    }

    Screens.jsResources = function (main, params) {
        style();
        rights(['production.work.center']).then(function (r) {
            resourceWindow(main, params, r['production.work.center'].write);
        });
    };
    Screens.resources = Screens.jsResources;

    function resourceWindow(main, params, canReset) {
        var extra = [
            {label: 'Where Used', onclick: function (record) {
                whereUsed(record);
            }}];
        if (canReset) {
            extra.push({label: 'Reset Operation Info',
                onclick: function (record) {
                    resetCosts(record);
                }});
        }
        UI.master(main, {
            title: 'Shop Resources',
            model: 'production.work.center',
            label: 'Shop Resource ID',
            order: [['name', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            extra: extra,
            afterSave: setupResource,
            tabs: [
                {title: 'Shop Resources', fields: [
                    {name: 'name', label: 'Shop Resource ID', type: 'char'},
                    {name: 'description', label: 'Description', type: 'char',
                        span: 2},
                    {name: 'resource_type', label: 'Resource Type',
                        type: 'selection', options: RESOURCE_TYPES,
                        default: 'machine'},
                    {name: 'schedule_method', label: 'Schedule Method',
                        type: 'selection', options: [['finite', 'Finite'],
                            ['infinite', 'Infinite']], default: 'infinite'},
                    {name: 'schedule_type', label: 'Schedule Type',
                        type: 'selection', options: [['normal', 'Normal'],
                            ['discontinuous', 'Discontinuous']],
                        default: 'normal'},
                    {name: 'exclusivity', label: 'Group Exclusivity',
                        type: 'selection', options: [['exclusive',
                            'Exclusive'], ['inclusive', 'Inclusive']],
                        default: 'inclusive'},
                    {name: 'min_segment_size', label: 'Min Segment Size',
                        type: 'float'},
                    {name: 'shift_1_capacity', label: 'Shift 1 Capacity',
                        type: 'integer', default: 1},
                    {name: 'shift_2_capacity', label: 'Shift 2 Capacity',
                        type: 'integer'},
                    {name: 'shift_3_capacity', label: 'Shift 3 Capacity',
                        type: 'integer'},
                    {name: 'auto_reporting', label: 'Auto Report',
                        type: 'boolean'},
                    {name: 'category', label: 'Category', type: 'many2one',
                        model: 'production.work.center.category'},
                    {name: 'warehouse', label: 'Warehouse', type: 'many2one',
                        model: 'stock.location', domain: [['type', '=',
                            'warehouse']]},
                    {name: 'active', label: 'Active', type: 'boolean',
                        default: true},
                    {name: 'special_instructions',
                        label: 'Special Instructions', type: 'text',
                        span: 3}]},
                {title: 'Costs', fields: [
                    {name: 'setup_per_hr', label: 'Labor/Hour (Setup)',
                        type: 'decimal'},
                    {name: 'run_per_hr', label: 'Labor Run Per Hour',
                        type: 'decimal'},
                    {name: 'run_per_unit', label: 'Labor Cost/Unit',
                        type: 'decimal'},
                    {name: 'bur_per_hr_setup', label: 'Bur/Hr (Setup)',
                        type: 'decimal'},
                    {name: 'bur_percent_setup', label: 'Bur Percent Setup',
                        type: 'decimal'},
                    {name: 'bur_per_hr_run', label: 'Bur Per Hr Run',
                        type: 'decimal'},
                    {name: 'bur_percent_run', label: 'Bur Percent Run',
                        type: 'decimal'},
                    {name: 'bur_per_unit_run', label: 'Bur Per Unit Run',
                        type: 'decimal'},
                    {name: 'bur_per_oper', label: 'Bur Per Oper',
                        type: 'decimal'},
                    {name: 'act_bur_per_hr_setup',
                        label: 'Actual Bur/Hr (Setup)', type: 'decimal'},
                    {name: 'act_bur_percent_setup',
                        label: 'Actual Bur % Setup', type: 'decimal'},
                    {name: 'act_bur_per_hr_run', label: 'Actual Bur/Hr Run',
                        type: 'decimal'},
                    {name: 'act_bur_percent_run', label: 'Actual Bur % Run',
                        type: 'decimal'},
                    {name: 'act_bur_per_unit_run',
                        label: 'Actual Bur/Unit Run', type: 'decimal'},
                    {name: 'act_bur_per_oper', label: 'Fixed Burden',
                        type: 'decimal'},
                    {name: 'cost_price', label: 'Tryton cost rate',
                        type: 'money'},
                    {name: 'cost_method', label: 'Tryton cost per',
                        type: 'selection', options: [[null, ''],
                            ['hour', 'Hour'], ['cycle', 'Cycle']]}]},
                {title: 'Weekly Calendar', lines: {name: 'calendar_weeks',
                    model: 'nline.js.calendar.week', inverse: 'resource',
                    order: [['day_of_week', 'ASC']],
                    fields: [{name: 'day_of_week', label: 'Day',
                        type: 'selection', options: DAYS}].concat(
                        CAL_FIELDS)}},
                {title: 'Calendar Exceptions', lines: {
                    name: 'calendar_changes',
                    model: 'nline.js.calendar.change', inverse: 'resource',
                    order: [['start_date', 'DESC']],
                    fields: [{name: 'start_date', label: 'Start Date',
                        type: 'date'}, {name: 'end_date', label: 'End Date',
                        type: 'date'}].concat(CAL_FIELDS, [{
                            name: 'reason_code', label: 'Reason Code',
                            type: 'many2one', model: 'nline.reason_code',
                            domain: [['reason_type', 'in', [null,
                                'calendar']]]}])}}
            ],
            browse: [
                {name: 'name', label: 'ID'},
                {name: 'description', label: 'Description'},
                {name: 'resource_type', label: 'Resource Type',
                    labels: TYPE_LABELS}]
        });
    }

    /* ---- Shop Groups ------------------------------------------------------ */

    Screens.jsShopGroups = function (main, params) {
        style();
        UI.master(main, {
            title: 'Shop Groups',
            model: 'production.work.center',
            label: 'Shop Group ID',
            domain: [['resource_type', '=', 'group']],
            order: [['name', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            /* A new shop group is a resource of type Group, scheduled
             * infinite and inclusive */
            defaults: {resource_type: 'group', schedule_method: 'infinite',
                schedule_type: 'normal'},
            afterSave: setupResource,
            tabs: [
                {title: 'Shop Group', fields: [
                    {name: 'name', label: 'Shop Group ID', type: 'char'},
                    {name: 'description', label: 'Description', type: 'char',
                        span: 2},
                    {name: 'exclusivity', label: 'Group Exclusivity',
                        type: 'selection', options: [['inclusive',
                            'Inclusive'], ['exclusive', 'Exclusive']],
                        default: 'inclusive'}]},
                {title: 'Members', lines: {name: 'members',
                    model: 'nline.js.resource.member', inverse: 'group',
                    order: [['sequence', 'ASC']],
                    fields: [
                        {name: 'sequence', label: 'Seq #', type: 'integer'},
                        {name: 'resource', label: 'Resource ID',
                            type: 'many2one', model: 'production.work.center',
                            domain: [['resource_type', '!=', 'group']]},
                        {name: 'description', label: 'Description',
                            type: 'char', readonly: true},
                        {name: 'resource_type', label: 'Resource Type',
                            type: 'selection', options: [[null, '']].concat(
                                RESOURCE_TYPES), readonly: true}]}}],
            browse: [
                {name: 'name', label: 'ID'},
                {name: 'description', label: 'Description'},
                {name: 'exclusivity', label: 'Type', labels: {
                    exclusive: 'Exclusive', inclusive: 'Inclusive'}}]
        });
    };

    /* ---- Shop Views -------------------------------------------------------- */

    Screens.jsShopViews = function (main, params) {
        style();
        UI.master(main, {
            title: 'Shop Views',
            model: 'nline.js.shop_view',
            label: 'Shop View ID',
            order: [['code', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            tabs: [
                {title: 'Shop View', fields: [
                    {name: 'code', label: 'Shop View ID', type: 'char'},
                    {name: 'description', label: 'Description', type: 'char',
                        span: 2}]},
                {title: 'Resources', lines: {name: 'resource_lines',
                    model: 'nline.js.shop_view.resource', inverse: 'view',
                    order: [['sequence', 'ASC']],
                    fields: [
                        {name: 'sequence', label: 'Seq #', type: 'integer'},
                        {name: 'resource', label: 'Resource ID',
                            type: 'many2one',
                            model: 'production.work.center'},
                        {name: 'description', label: 'Description',
                            type: 'char', readonly: true},
                        {name: 'resource_type', label: 'Resource Type',
                            type: 'selection', options: [[null, '']].concat(
                                RESOURCE_TYPES), readonly: true}]}}],
            browse: [
                {name: 'code', label: 'ID'},
                {name: 'description', label: 'Description'}]
        });
    };

    /* ---- Labor: shared parts -------------------------------------------------- */

    var SHIFT_TYPES = [['regular', 'Regular (1x)'], ['overtime',
        'Overtime (1.5x)'], ['double', 'Double (2x)'], ['triple',
        'Triple (3x)']];
    var TX_TYPES = [['setup', 'Setup'], ['run', 'Run'], ['indirect',
        'Indirect']];
    var TYPE_NAME = {setup: 'Setup', run: 'Run', indirect: 'Indirect'};
    var SHIFT_NAME = {regular: 'Regular', overtime: 'Overtime',
        double: 'Double', triple: 'Triple'};

    function select(options, value, label) {
        var s = el('select', {'aria-label': label}, options.map(function (o) {
            return el('option', {value: o[0]}, o[1]);
        }));
        if (value !== undefined) {
            s.value = value;
        }
        return s;
    }

    function employeePicker(onselect) {
        return UI.picker('company.employee', {label: 'Employee Clock No',
            placeholder: 'Clock No', domain: [['inactive', '=', false]],
            fields: ['shift_no', 'clock_no'], onselect: onselect});
    }

    /* The reason codes of labor (Common > Reason Codes, type Labor Entry) */
    function reasonPicker() {
        return UI.picker('nline.reason_code', {label: 'Reason Code',
            placeholder: 'Reason Code', domain: [['reason_type', 'in',
                [null, 'labor']]]});
    }

    /* The Sub/Seq choice of a work order's operations */
    function operationSelect(onchange) {
        var s = el('select', {'aria-label': 'Sub/Seq'},
            el('option', {value: ''}, '-'));
        var works = [];
        s.addEventListener('change', function () {
            onchange(current());
        });
        function current() {
            var id = parseInt(s.value, 10);
            return works.filter(function (w) {
                return w.id === id;
            })[0] || null;
        }
        return {
            node: s,
            current: current,
            load: function (production, workId) {
                UI.clear(s).appendChild(el('option', {value: ''}, '-'));
                works = [];
                if (!production) {
                    onchange(null);
                    return Promise.resolve(null);
                }
                return Rpc.desk('sf_work_order_operations', [production])
                    .then(function (info) {
                        works = info.works;
                        works.forEach(function (w) {
                            s.appendChild(el('option', {value: w.id},
                                w.sub + '/' + text(w.seq) + ' ' + w.name +
                                (w.resource ? ' @ ' + w.resource : '') +
                                (w.closed ? ' (closed)' : '')));
                        });
                        if (workId) {
                            s.value = workId;
                        } else if (works.length === 1) {
                            s.value = works[0].id;
                        }
                        onchange(current());
                        return info;
                    }, failed);
            }
        };
    }

    /* ---- Labor Entry ------------------------------------------------------ */

    Screens.jsLaborEntry = function (main) {
        style();
        var form = UI.form(main, {title: 'Labor Entry', extra: [
            {label: 'Save', title: 'Post the labor ticket (Ctrl+S)',
                onclick: function () {
                    if (entry.save) {
                        entry.save();
                    }
                }}]});
        form.allow(false, ['Save']);
        var body = form.body;
        var entry = {};
        var allowed = {post: false};
        rights(['nline.js.labor_ticket', 'production.work.cycle']).then(
            function (r) {
                allowed.post = r['nline.js.labor_ticket'].create &&
                    r['production.work.cycle'].create;
                form.allow(false, allowed.post ? [] : ['Save']);
                tabs(body, [
                    {title: 'Labor Entry', render: function (pane) {
                        entryTab(pane, allowed, entry);
                    }},
                    {title: 'Labor Reversal', render: function (pane) {
                        reversalTab(pane, allowed);
                    }}]);
            });
        shortcuts(body, {save: function () {
            if (allowed.post && entry.save) {
                entry.save();
            }
        }});
    };
    Screens.laborEntry = Screens.jsLaborEntry;

    function entryTab(pane, allowed, entry) {
        var lastOut = null;
        var posted = [];
        var employee = employeePicker(function (r) {
            if (r && r.shift_no) {
                shiftNo.value = r.shift_no;
            }
        });
        var shiftNo = el('input.money', {type: 'text', 'aria-label':
            'Shift No', value: '1'});
        var shiftType = select(SHIFT_TYPES, 'regular', 'Shift Type');
        var txType = select(TX_TYPES, 'run', 'Transaction Type');
        var ops = operationSelect(function (w) {
            opQty.value = w ? qty(Math.max((w.operation_qty || 0) -
                (w.completed_qty || 0), 0)) : '';
            cumQty.value = w ? qty(w.completed_qty) : '';
            renderOps();
        });
        var info = null;
        var wo = woPicker(function (r) {
            ops.load(r.id).then(function (i) {
                info = i;
                renderOps();
            });
        });
        var clockIn = dateTimeInput(UI.today() + ' 08:00', 'Clock In');
        var clockOut = dateTimeInput(null, 'Clock Out');
        var hours = el('input.money', {type: 'text', 'aria-label':
            'Hours Worked'});
        var alloc = el('input.money', {type: 'text', 'aria-label':
            'Labor Allocation', value: '100'});
        var completedQty = el('input.money', {type: 'text', 'aria-label':
            'Completed Qty'});
        var deviatedQty = el('input.money', {type: 'text', 'aria-label':
            'Deviated Qty'});
        var reason = reasonPicker();
        var description = el('input', {type: 'text', 'aria-label':
            'Description'});
        var completed = el('input', {type: 'checkbox', 'aria-label':
            'Completed'});
        var opQty = el('input.money', {type: 'text', readonly: true,
            'aria-label': 'Operation Qty'});
        var cumQty = el('input.money', {type: 'text', readonly: true,
            'aria-label': 'Completed Qty to date'});
        var woField = field('Work/Lot/Split', wo);
        var opField = field('Sub/Seq', ops.node);
        var completedField = field('Completed Qty', completedQty);

        /* Hours from the clock times */
        function computeHours() {
            var a = clockIn.value ? new Date(clockIn.value) : null;
            var b = clockOut.value ? new Date(clockOut.value) : null;
            if (a && b && b > a) {
                hours.value = qty(Math.round((b - a) / 36000) / 100);
            }
        }
        [clockIn, clockOut].forEach(function (i) {
            i.addEventListener('change', computeHours);
        });
        function typeChanged() {
            var t = txType.value;
            completedField.hidden = t !== 'run';
            woField.hidden = opField.hidden = t === 'indirect';
        }
        txType.addEventListener('change', typeChanged);

        pane.appendChild(el('div.panel', el('div.sf-form',
            field('Employee Clock No', employee, 'wide'),
            field('Shift No', shiftNo), field('Shift Type', shiftType),
            field('Transaction Type', txType), woField, opField,
            field('Clock In', clockIn), field('Clock Out', clockOut),
            field('Hours Worked', hours), field('Labor Allocation %', alloc),
            completedField, field('Deviated Qty', deviatedQty),
            field('Reason Code', reason), field('Description', description,
                'wide'),
            el('label.check', completed, ' Completed'),
            field('Operation Qty', opQty),
            field('Completed Qty (to date)', cumQty))));
        typeChanged();
        if (!allowed.post) {
            pane.appendChild(el('p.sf-note', 'You may look at the labor ' +
                'but not post it.'));
        }

        /* The work order's operations: hours so far, quick post of hours
         * (the earlier Labor Entry) and the running tickets */
        var opsBody = el('tbody');
        pane.appendChild(el('h3', 'Operations of the work order'));
        pane.appendChild(table(['Sub/Seq', 'Operation', 'Resource', 'Status',
            '#Op Qty', '#Completed', '#Setup h', '#Run h', ''], opsBody));
        function renderOps() {
            UI.clear(opsBody);
            if (!info) {
                emptyRow(opsBody, 9, 'Choose a work order.');
                return;
            }
            info.works.forEach(function (w) {
                opsBody.appendChild(el('tr', {onclick: function () {
                    ops.node.value = w.id;
                    ops.node.dispatchEvent(new Event('change'));
                }, title: 'Click to choose this operation'},
                    td(w.sub + '/' + text(w.seq)), td(w.name),
                    td(w.resource), td(w.closed ? 'Closed' : w.state),
                    numTd(w.operation_qty), numTd(w.completed_qty),
                    numTd(w.setup_hours), numTd(w.run_hours),
                    td(w.instructions ? 'ⓘ' : '')));
            });
            if (!info.works.length) {
                emptyRow(opsBody, 9, 'No operation: the master has no ' +
                    'routing.');
            }
        }
        renderOps();

        /* The labor posted in this session (Jobshop's labor table) */
        var tbody = el('tbody');
        pane.appendChild(el('h3', 'Labor posted'));
        pane.appendChild(table(['Entry No', 'Transaction Date',
            'Employee Clock No', 'Employee Name', 'Shift', 'Shift Type',
            'Work Order ID', 'Sub ID', 'Seq No', 'Transaction Type',
            'Completed', 'Clock In', 'Clock Out', '#Hours',
            '#Labor Allocation %', '#Cumulative', '#Completed Qty',
            '#Deviated Qty', 'Description', 'Reason Code', '#Labor',
            '#Burden'], tbody));
        function renderPosted() {
            UI.clear(tbody);
            var cumulative = 0;
            posted.forEach(function (t, i) {
                cumulative += t.hours || 0;
                tbody.appendChild(el('tr', td(i + 1),
                    td(t.transaction_date), td(t.clock_no), td(t.name),
                    td(t.shift_no), td(SHIFT_NAME[t.shift_type]),
                    td(t.number), td(t.sub), td(t.seq), td(TYPE_NAME[t.type]),
                    td(yes(t.completed)), td(t.clock_in), td(t.clock_out),
                    numTd(t.hours), numTd(t.labor_percent),
                    numTd(cumulative), numTd(t.completed_qty),
                    numTd(t.deviated_qty), td(t.description), td(t.reason),
                    moneyTd(t.labor_cost), moneyTd(t.burden_cost)));
            });
            if (!posted.length) {
                emptyRow(tbody, 22, 'Nothing posted yet.');
            }
        }
        renderPosted();

        entry.save = function () {
            if (!allowed.post) {
                return;
            }
            var w = ops.current();
            var values = {
                employee: employee.value(),
                shift_no: shiftNo.value,
                shift_type: shiftType.value,
                type: txType.value,
                work: txType.value === 'indirect' ? null : (w ? w.id : null),
                clock_in: dateTimeValue(clockIn),
                clock_out: dateTimeValue(clockOut),
                hours: parseNum(hours.value),
                labor_percent: parseNum(alloc.value),
                completed_qty: txType.value === 'run' ? parseNum(
                    completedQty.value) : null,
                deviated_qty: parseNum(deviatedQty.value),
                reason_code: reason.value(),
                description: description.value || null,
                completed: completed.checked
            };
            if (!values.employee) {
                UI.toast('Choose the employee first', 'error');
                return;
            }
            UI.service('sf_labor_post', values).then(function (t) {
                posted.push(t);
                renderPosted();
                UI.toast('Labor ticket posted: ' + qty(t.hours) + ' h, ' +
                    UI.money((t.labor_cost || 0) + (t.burden_cost || 0),
                        true), 'ok');
                /* The next entry starts where this one ended */
                lastOut = values.clock_out;
                clockIn.value = lastOut ? lastOut.replace(' ', 'T') :
                    clockIn.value;
                clockOut.value = '';
                hours.value = completedQty.value = deviatedQty.value = '';
                description.value = '';
                reason.set(null, '');
                completed.checked = false;
                if (info) {
                    ops.load(info.id, w ? w.id : null).then(function (i) {
                        info = i;
                        renderOps();
                    });
                }
            }, failed);
        };
    }

    function reversalTab(pane, allowed) {
        var kinds = [['all', 'All'], ['employee', 'Employee'], ['work_order',
            'Work Order'], ['resource', 'Resource']];
        var kind = 'all';
        var radios = el('div.sf-checks');
        var employee = employeePicker();
        var wo = woPicker(null, []);
        var resource = UI.picker('production.work.center', {label:
            'Resource ID', placeholder: 'Resource ID'});
        var byDate = check('Transaction Date', false);
        var from = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Transaction Date'});
        var to = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'To'});
        var selector = el('div');
        kinds.forEach(function (k) {
            var r = el('input', {type: 'radio', name: 'sf-rev-kind',
                checked: k[0] === 'all'});
            r.addEventListener('change', function () {
                kind = k[0];
                UI.clear(selector);
                if (kind === 'employee') {
                    selector.appendChild(field('Clock No', employee));
                } else if (kind === 'work_order') {
                    selector.appendChild(field('Work Order ID', wo));
                } else if (kind === 'resource') {
                    selector.appendChild(field('Resource ID', resource));
                }
            });
            radios.appendChild(el('label.check', r, ' ' + k[1]));
        });
        var rows = [];
        var tbody = el('tbody');
        var reverse = el('button.primary', {type: 'button', onclick: doReverse,
            hidden: !allowed.post}, 'Reverse');
        pane.appendChild(el('div.panel', el('div.sf-head', radios, selector,
            el('div.sf-checks', byDate.node, from, el('span', 'To'), to),
            el('button', {type: 'button', onclick: show}, 'Show'), reverse)));
        pane.appendChild(table(['', 'Transaction Date', '#Completed Qty',
            'Work Order ID', 'Seq No', 'Clock No', 'Name', 'Resource ID',
            'Type', '#Hours', '#Labor Allocation %', 'Reversing', 'Clock In',
            'Clock Out', 'Description', '#Deviated Qty', 'Reason Code ID'],
            tbody));

        function show() {
            Rpc.desk('sf_labor_tickets', [{kind: kind,
                employee: employee.value(), production: wo.value(),
                resource: resource.value(),
                from_date: byDate.box.checked ? from.value : null,
                to_date: byDate.box.checked ? to.value : null}]).then(
                function (list) {
                    rows = list.map(function (t) {
                        return {t: t, selected: false};
                    });
                    render();
                }, failed);
        }

        function render() {
            UI.clear(tbody);
            rows.forEach(function (row) {
                var t = row.t;
                var tr = el('tr' + (t.reversed || t.reversing ? '.reversed' :
                    '') + (row.selected ? '.selected' : ''), {
                    onclick: function () {
                        if (t.reversed || t.reversing) {
                            return;
                        }
                        row.selected = !row.selected;
                        render();
                    }}, el('td.row-head', row.selected ? '▶' : ''),
                    td(t.transaction_date), numTd(t.completed_qty),
                    td(t.number), td(t.seq), td(t.clock_no), td(t.name),
                    td(t.resource), td(TYPE_NAME[t.type]), numTd(t.hours),
                    numTd(t.labor_percent), td(yes(t.reversing)),
                    td(t.clock_in), td(t.clock_out), td(t.description),
                    numTd(t.deviated_qty), td(t.reason));
                tbody.appendChild(tr);
            });
            if (!rows.length) {
                emptyRow(tbody, 17, 'Choose the labor to show, then Show.');
            }
        }
        render();

        function doReverse() {
            var ids = rows.filter(function (r) {
                return r.selected;
            }).map(function (r) {
                return r.t.id;
            });
            if (!ids.length) {
                UI.toast('Click the labor lines to reverse first', 'error');
                return;
            }
            UI.confirm('Labor Reversal', 'Reverse ' + ids.length +
                ' labor transaction(s)?').then(function (ok) {
                    if (!ok) {
                        return;
                    }
                    Rpc.desk('sf_labor_reverse', [ids]).then(function (r) {
                        UI.toast(r.length + ' labor transaction(s) reversed',
                            'ok');
                        show();
                    }, failed);
                });
        }
    }

    /* ---- Labor Data Collection (the terminal) -------------------------------- */

    var COMMANDS = ['START', 'SUSPEND', 'RESUME', 'POST', 'EDIT', 'STOP',
        'CLEAR', 'SAVE', 'CLOSE', 'APPLY', 'OK', 'CANCEL'];

    /* A command bar code (ButtonBarCodes: *%START*...) */
    function command(value) {
        var m = /^\*?%([A-Z]+)\*?$/.exec(String(value || '').trim()
            .toUpperCase());
        return m && COMMANDS.indexOf(m[1]) >= 0 ? m[1] : null;
    }

    Screens.jsLaborCollection = function (screen) {
        style();
        /* A node of its own: the shortcuts stop when the screen goes */
        var main = el('div.ldc');
        screen.appendChild(main);
        var state = {employee: null, supervisor: false, write: false,
            remove: false, rows: [], kind: 'employee', modal: null};
        main.appendChild(el('div.ribbon', el('span.ribbon-title',
            'Labor Data Collection'), el('span.spacer'),
            el('span.muted', 'Scan your badge, then the traveler')));
        var badge = el('input', {type: 'text', 'aria-label':
            'Employee Clock No', placeholder: 'Employee Clock No',
            autocomplete: 'off'});
        var showButton = el('button.primary', {type: 'button',
            onclick: function () {
                lookup(badge.value);
            }}, 'Show');
        var who = el('div.ldc-who', el('span.muted', 'No employee.'));
        var filter = el('div.ldc-filter');
        var filterValue = el('span');
        var tbody = el('tbody');
        var buttons = {};
        var bar = el('div.ldc-buttons');
        main.appendChild(el('div.panel', el('div.ldc-scan',
            el('label', 'Employee Clock No '), badge, showButton), who,
            filter));
        main.appendChild(bar);
        main.appendChild(el('div.ldc-legend',
            el('span', el('i', {style: {background: '#dff3dc'}}),
                'In progress'),
            el('span', el('i', {style: {background: '#fff4c2'}}),
                'Suspended'),
            el('span', el('i', {style: {background: 'var(--paper)'}}),
                'Post on Save')));
        main.appendChild(table(['', 'Clock No', 'Name', 'Work Order ID',
            'Sub/Seq', 'Operation', 'Resource', 'Type', 'Clock In',
            'Clock Out', '#Hours', '#Completed Qty', '#Deviated Qty',
            'Suspended', 'Post on Save'], tbody));

        [['Start', start], ['Edit', edit], ['Suspend', function () {
            post(true);
        }], ['Resume', resume], ['Post', function () {
            post(false);
        }], ['Save', save], ['Delete', remove], ['Clear', clear]].forEach(
            function (b) {
                buttons[b[0]] = el('button', {type: 'button', onclick: b[1]},
                    b[0]);
                bar.appendChild(buttons[b[0]]);
            });
        buttons.Save.classList.add('primary');

        badge.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                var c = command(badge.value);
                if (c) {
                    badge.value = '';
                    run(c);
                } else {
                    lookup(badge.value);
                }
            }
        });
        shortcuts(main, {save: function () {
            if (state.write) {
                save();
            }
        }, refresh: load, del: function () {
            if (state.remove) {
                remove();
            }
        }});

        /* Who may see whom (Authority Manager): with Labor Entry, every
         * selection; without it, only the employee's own labor */
        Promise.all([UI.screenAllowed('labor'), rights([
            'nline.js.labor_ticket', 'production.work.cycle',
            'nline.js.employee_time'])]).then(function (r) {
                state.supervisor = r[0];
                var a = r[1];
                state.write = a['nline.js.labor_ticket'].create &&
                    a['production.work.cycle'].create;
                state.remove = a['nline.js.labor_ticket'].delete;
                state.clock = a['nline.js.employee_time'].create;
                renderFilter();
                renderButtons();
                load();
            });
        badge.focus();

        function renderFilter() {
            UI.clear(filter);
            if (!state.supervisor) {
                return;
            }
            [['employee', 'Employee'], ['work_order', 'Work Order'],
                ['resource', 'Resource'], ['date', 'Date'], ['all', 'All']]
                .forEach(function (k) {
                    var r = el('input', {type: 'radio', name: 'sf-ldc-kind',
                        checked: state.kind === k[0]});
                    r.addEventListener('change', function () {
                        state.kind = k[0];
                        renderFilterValue();
                        load();
                    });
                    filter.appendChild(el('label', r, k[1]));
                });
            filter.appendChild(filterValue);
            renderFilterValue();
        }

        function renderFilterValue() {
            UI.clear(filterValue);
            state.filterValue = null;
            if (state.kind === 'work_order') {
                var wo = woPicker(function (r) {
                    state.filterValue = r.id;
                    load();
                });
                filterValue.appendChild(wo.node);
            } else if (state.kind === 'resource') {
                var res = UI.picker('production.work.center', {label:
                    'Resource ID', placeholder: 'Resource ID',
                    onselect: function (r) {
                        state.filterValue = r.id;
                        load();
                    }});
                filterValue.appendChild(res.node);
            } else if (state.kind === 'date') {
                var d = el('input', {type: 'date', value: UI.today(),
                    'aria-label': 'Date'});
                state.filterValue = d.value;
                d.addEventListener('change', function () {
                    state.filterValue = d.value;
                    load();
                });
                filterValue.appendChild(d);
            }
        }

        function lookup(value) {
            var c = command(value);
            if (c) {
                run(c);
                return;
            }
            Rpc.desk('sf_dc_employee', [value]).then(function (e) {
                badge.value = '';
                if (!e) {
                    UI.toast('No active employee with clock number "' +
                        value + '"', 'error');
                    return;
                }
                state.employee = e;
                state.kind = 'employee';
                renderFilter();
                renderWho();
                load();
            }, failed);
        }

        function renderWho() {
            UI.clear(who);
            var e = state.employee;
            if (!e) {
                who.appendChild(el('span.muted', 'No employee.'));
                return;
            }
            who.appendChild(el('strong', e.name));
            who.appendChild(el('span', e.clock_no + ' · shift ' +
                text(e.shift_no)));
            who.appendChild(el('span.muted', e.clocked_in ? 'Clocked in ' +
                e.clocked_in : 'Not clocked in'));
            if (state.clock) {
                who.appendChild(el('button', {type: 'button', onclick:
                    function () {
                        clock(e.clocked_in ? 'out' : 'in');
                    }}, e.clocked_in ? 'Clock Out' : 'Clock In'));
            }
            who.appendChild(el('button', {type: 'button', onclick:
                function () {
                    state.employee = null;
                    renderWho();
                    load();
                    badge.focus();
                }}, 'Done'));
        }

        function clock(action) {
            Rpc.desk('sf_clock', [{employee: state.employee.id,
                action: action, at: now()}]).then(function () {
                    UI.toast(state.employee.name + ' clocked ' + action,
                        'ok');
                    lookup(state.employee.clock_no || String(
                        state.employee.id));
                }, failed);
        }

        function options() {
            var o = {kind: state.kind};
            if (state.kind === 'employee') {
                o.employee = state.employee ? state.employee.id : -1;
            } else if (state.kind === 'work_order') {
                o.production = state.filterValue || -1;
            } else if (state.kind === 'resource') {
                o.resource = state.filterValue || -1;
            } else if (state.kind === 'date') {
                o.from_date = state.filterValue;
            }
            return o;
        }

        function load() {
            if (state.kind === 'employee' && !state.employee) {
                state.rows = [];
                render();
                return;
            }
            Rpc.desk('sf_dc_tickets', [options()]).then(function (list) {
                var selected = {};
                state.rows.forEach(function (r) {
                    if (r.selected) {
                        selected[r.t.id] = true;
                    }
                });
                state.rows = list.map(function (t) {
                    return {t: t, selected: Boolean(selected[t.id])};
                });
                render();
            }, failed);
        }

        function selection(states) {
            return state.rows.filter(function (r) {
                return r.selected && (!states || states.indexOf(
                    r.t.state) >= 0);
            });
        }

        function render() {
            UI.clear(tbody);
            state.rows.forEach(function (row) {
                var t = row.t;
                tbody.appendChild(el('tr.' + t.state + (row.selected ?
                    '.selected' : ''), {onclick: function () {
                        row.selected = !row.selected;
                        render();
                    }}, el('td.row-head', row.selected ? '▶' : ''),
                    td(t.clock_no), td(t.name), td(t.number),
                    td(t.number ? t.sub + '/' + text(t.seq) : ''),
                    td(t.operation), td(t.resource), td(TYPE_NAME[t.type]),
                    td(t.clock_in), td(t.clock_out), numTd(t.hours),
                    numTd(t.completed_qty), numTd(t.deviated_qty),
                    td(yes(t.state === 'suspended')),
                    td(yes(t.state === 'posted'))));
            });
            if (!state.rows.length) {
                emptyRow(tbody, 15, state.kind === 'employee' &&
                    !state.employee ? 'Scan your badge.' :
                    'No labor in progress.');
            }
            renderButtons();
        }

        function renderButtons() {
            var any = function (states) {
                return selection(states).length > 0;
            };
            var posted = state.rows.some(function (r) {
                return r.t.state === 'posted';
            });
            buttons.Start.hidden = !state.write || !state.employee;
            buttons.Edit.hidden = !state.write || !any();
            buttons.Suspend.hidden = !state.write || !any(['active']);
            buttons.Post.hidden = !state.write || !any(['active']);
            buttons.Resume.hidden = !state.write || !any(['suspended']);
            buttons.Save.hidden = !state.write || !posted;
            buttons.Delete.hidden = !state.remove || !any();
            buttons.Clear.hidden = !state.rows.some(function (r) {
                return r.selected;
            });
        }

        /* Command bar codes scanned anywhere on the terminal */
        function run(c) {
            if (state.modal && (c === 'OK' || c === 'APPLY')) {
                state.modal.ok();
                return;
            }
            if (state.modal && c === 'CANCEL') {
                state.modal.cancel();
                return;
            }
            var map = {START: start, EDIT: edit, SUSPEND: function () {
                post(true);
            }, RESUME: resume, POST: function () {
                post(false);
            }, STOP: function () {
                post(false);
            }, SAVE: save, CLEAR: clear, CLOSE: function () {
                state.employee = null;
                renderWho();
                load();
            }};
            var b = {START: 'Start', EDIT: 'Edit', SUSPEND: 'Suspend',
                RESUME: 'Resume', POST: 'Post', STOP: 'Post', SAVE: 'Save',
                CLEAR: 'Clear', CLOSE: null}[c];
            if (map[c] && (b === null || !buttons[b].hidden)) {
                map[c]();
            }
        }

        function clear() {
            state.rows.forEach(function (r) {
                r.selected = false;
            });
            render();
        }

        /* The Labor Entry Details dialog of the terminal */
        function details(title, controls, onok) {
            var close;
            state.modal = {
                ok: function () {
                    if (onok() !== true && close) {
                        close();
                    }
                    state.modal = null;
                },
                cancel: function () {
                    if (close) {
                        close();
                    }
                    state.modal = null;
                }
            };
            close = UI.modal(title, [el('div.sf-form', controls)], [
                {label: 'Cancel', onclick: function () {
                    state.modal = null;
                }},
                {label: 'OK', primary: true, onclick: function () {
                    var keep = onok();
                    if (keep !== true) {
                        state.modal = null;
                    }
                    return keep;
                }}]);
            var box = document.querySelector('.overlay:last-child .modal');
            if (box) {
                box.classList.add('ldc-modal');
            }
        }

        /* Commands typed in a dialog's scan field */
        function scanField(input, onvalue) {
            input.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter') {
                    return;
                }
                event.preventDefault();
                var c = command(input.value);
                if (c) {
                    input.value = '';
                    run(c);
                } else {
                    onvalue(input.value);
                }
            });
        }

        function start() {
            if (!state.employee) {
                badge.focus();
                return;
            }
            var scan = el('input', {type: 'text', 'aria-label':
                'Traveler bar code', placeholder: 'Scan the traveler',
                autocomplete: 'off'});
            var info = el('div.muted');
            var ops = operationSelect(function (w) {
                UI.clear(info);
                if (w) {
                    info.appendChild(el('span', 'Operation qty ' +
                        qty(w.operation_qty) + ', completed ' +
                        qty(w.completed_qty) + (w.closed ? ' (closed)' :
                            '')));
                    if (w.instructions) {
                        info.appendChild(el('div', 'Spec: ' +
                            w.instructions.slice(0, 255)));
                    }
                }
            });
            var wo = woPicker(function (r) {
                ops.load(r.id);
            });
            var type = select(TX_TYPES, 'run', 'Type');
            var shiftNo = el('input', {type: 'text', 'aria-label': 'Shift No',
                value: text(state.employee.shift_no || 1)});
            var shiftType = select(SHIFT_TYPES, 'regular', 'Shift Type');
            var clockIn = dateTimeInput(now(), 'Clock In');
            scanField(scan, function (value) {
                Rpc.desk('sf_operation_lookup', [value]).then(function (f) {
                    if (!f) {
                        UI.toast('Unknown traveler bar code "' + value + '"',
                            'error');
                        return;
                    }
                    wo.set(f.production, f.number);
                    ops.load(f.production, f.work);
                    scan.value = '';
                    type.focus();
                }, failed);
            });
            details('Labor Entry Details - Start', [
                field('Work Order Operation (scan)', scan, 'wide'),
                field('Work/Lot/Split', wo), field('Sub/Seq', ops.node),
                el('div.wide', info), field('Type', type),
                field('Shift No', shiftNo), field('Shift Type', shiftType),
                field('Clock In', clockIn)], function () {
                    var w = ops.current();
                    if (type.value !== 'indirect' && !w) {
                        UI.toast('Scan or choose the operation', 'error');
                        return true;
                    }
                    Rpc.desk('sf_dc_start', [{employee: state.employee.id,
                        work: type.value === 'indirect' ? null : w.id,
                        type: type.value, shift_no: shiftNo.value,
                        shift_type: shiftType.value,
                        clock_in: dateTimeValue(clockIn)}]).then(function () {
                            UI.toast('Started', 'ok');
                            load();
                        }, failed);
                });
            scan.focus();
        }

        /* Post (or Suspend): the clock out and what was completed */
        function post(suspend) {
            var rows = selection(['active']);
            if (!rows.length) {
                return;
            }
            var clockOut = dateTimeInput(now(), 'Clock Out');
            var one = rows.length === 1 ? rows[0].t : null;
            var completedQty = el('input', {type: 'text', 'aria-label':
                'Completed Qty'});
            var deviatedQty = el('input', {type: 'text', 'aria-label':
                'Deviated Qty'});
            var reason = reasonPicker();
            var description = el('input', {type: 'text', 'aria-label':
                'Description'});
            var completed = el('input', {type: 'checkbox', 'aria-label':
                'Completed'});
            var controls = [field('Clock Out', clockOut)];
            if (one) {
                controls.push(
                    field('Operation Qty', el('input', {type: 'text',
                        readonly: true, value: qty(one.operation_qty)})),
                    field('Completed Qty (to date)', el('input', {type:
                        'text', readonly: true, value:
                        qty(one.operation_completed_qty)})));
                if (one.type === 'run') {
                    controls.push(field('Completed Qty', completedQty));
                }
                controls.push(field('Deviated Qty', deviatedQty),
                    field('Reason Code', reason),
                    field('Description', description, 'wide'),
                    el('label.check', completed, ' Completed'));
            } else {
                controls.push(el('p.wide.sf-note', rows.length +
                    ' operations: the same clock out for all, no ' +
                    'quantities (Edit them before the Save).'));
            }
            details('Labor Entry Details - ' + (suspend ? 'Suspend' : 'Post'),
                controls, function () {
                    var dev = parseNum(deviatedQty.value);
                    if (one && dev && !reason.value()) {
                        UI.toast('A deviated quantity needs a reason code',
                            'error');
                        return true;
                    }
                    Rpc.desk('sf_dc_post', [{
                        clock_out: dateTimeValue(clockOut),
                        suspend: suspend,
                        tickets: rows.map(function (r) {
                            return one ? {id: r.t.id,
                                completed_qty: parseNum(completedQty.value),
                                deviated_qty: dev,
                                reason_code: reason.value(),
                                description: description.value || null,
                                completed: completed.checked} : {id: r.t.id};
                        })}]).then(function () {
                            UI.toast(suspend ? 'Suspended' :
                                'Posted: Save to record it', 'ok');
                            load();
                        }, failed);
                });
            if (one && one.type === 'run') {
                completedQty.focus();
            }
        }

        function resume() {
            var rows = selection(['suspended']);
            if (!rows.length) {
                return;
            }
            var clockIn = dateTimeInput(now(), 'Clock In');
            details('Labor Entry Details - Resume', [
                field('Clock In', clockIn)], function () {
                    Rpc.desk('sf_dc_resume', [{ids: rows.map(function (r) {
                        return r.t.id;
                    }), clock_in: dateTimeValue(clockIn)}]).then(function () {
                        UI.toast('Resumed', 'ok');
                        load();
                    }, failed);
                });
        }

        /* Edit Details of lines not saved yet */
        function edit() {
            var rows = selection();
            if (!rows.length) {
                return;
            }
            var t = rows[0].t;
            var type = select(TX_TYPES, t.type, 'Type');
            var shiftNo = el('input', {type: 'text', value: text(t.shift_no),
                'aria-label': 'Shift No'});
            var shiftType = select(SHIFT_TYPES, t.shift_type, 'Shift Type');
            var clockIn = dateTimeInput(t.clock_in, 'Clock In');
            var clockOut = dateTimeInput(t.clock_out, 'Clock Out');
            var completedQty = el('input', {type: 'text', value:
                qty(t.completed_qty), 'aria-label': 'Completed Qty'});
            var deviatedQty = el('input', {type: 'text', value:
                qty(t.deviated_qty), 'aria-label': 'Deviated Qty'});
            var reason = reasonPicker();
            if (t.reason_code) {
                reason.set(t.reason_code, t.reason);
            }
            var description = el('input', {type: 'text', value:
                t.description, 'aria-label': 'Description'});
            var completed = el('input', {type: 'checkbox', checked:
                t.completed, 'aria-label': 'Completed'});
            details('Edit Details' + (rows.length > 1 ? ' (' + rows.length +
                ' lines)' : ''), [field('Type', type),
                field('Shift No', shiftNo), field('Shift Type', shiftType),
                field('Clock In', clockIn), field('Clock Out', clockOut),
                field('Completed Qty', completedQty),
                field('Deviated Qty', deviatedQty),
                field('Reason Code', reason),
                field('Description', description, 'wide'),
                el('label.check', completed, ' Completed')], function () {
                    Rpc.desk('sf_dc_edit', [{tickets: rows.map(function (r) {
                        var values = {id: r.t.id, type: type.value,
                            shift_no: shiftNo.value,
                            shift_type: shiftType.value,
                            completed_qty: parseNum(completedQty.value),
                            deviated_qty: parseNum(deviatedQty.value),
                            reason_code: reason.value(),
                            description: description.value || null,
                            completed: completed.checked};
                        if (rows.length === 1) {
                            values.clock_in = dateTimeValue(clockIn);
                            values.clock_out = r.t.state === 'active' ? null :
                                dateTimeValue(clockOut);
                        }
                        return values;
                    })}]).then(function () {
                        UI.toast('Changed', 'ok');
                        load();
                    }, failed);
                });
        }

        function remove() {
            var rows = selection();
            if (!rows.length) {
                return;
            }
            UI.confirm('Delete', 'Delete ' + rows.length + ' labor ' +
                'line(s)? They cannot be restored.').then(function (ok) {
                    if (!ok) {
                        return;
                    }
                    Rpc.desk('sf_dc_delete', [rows.map(function (r) {
                        return r.t.id;
                    })]).then(function () {
                        UI.toast('Deleted', 'ok');
                        load();
                    }, failed);
                });
        }

        function save() {
            var ids = state.rows.filter(function (r) {
                return r.t.state === 'posted';
            }).map(function (r) {
                return r.t.id;
            });
            if (!ids.length) {
                return;
            }
            Rpc.desk('sf_dc_save', [ids]).then(function (saved) {
                UI.toast(saved.length + ' labor transaction(s) saved', 'ok');
                load();
            }, failed);
        }
    };

    /* ---- Employees ---------------------------------------------------------- */

    var EMP_COLUMNS = [
        {name: 'clock_no', label: 'Clock No', type: 'char'},
        {name: 'name', label: 'Name', type: 'char', width: '180px'},
        {name: 'shift_no', label: 'Shift No', type: 'integer'},
        {name: 'cost_per_hr', label: 'Cost Per Hr', type: 'number'},
        {name: 'setup_cost_per_hr', label: 'Setup Cost/Hr', type: 'number'},
        {name: 'run_cost_per_hr', label: 'Run Cost/Hr', type: 'number'},
        {name: 'cost_per_unit', label: 'Cost Per Unit', type: 'number'},
        {name: 'department', label: 'Department', type: 'char'},
        {name: 'title', label: 'Title', type: 'char'},
        {name: 'start_date', label: 'Hire Date', type: 'date'},
        {name: 'end_date', label: 'Termination Date', type: 'date'},
        {name: 'inactive', label: 'Inactive', type: 'boolean'}];

    Screens.jsEmployees = function (main, params) {
        style();
        var a = {write: false, create: false, delete: false};
        var rows = [];
        var showInactive = check('Show Inactive', true, load);
        var form = UI.form(main, {title: 'Employees', extra: [
            {label: 'Save', title: 'Save the table (Ctrl+S)', onclick: save},
            {label: 'Refresh', title: 'Refresh (F5)', onclick: load},
            {label: 'Details', title: 'The chosen employee in full',
                onclick: function () {
                    var row = rows.filter(function (r) {
                        return r.selected && r.e.id;
                    })[0];
                    if (row) {
                        details(row.e.id);
                    }
                }}]});
        form.allow(false, ['Save', 'Details']);
        var body = form.body;
        var gridPane = el('div');
        var detailPane = el('div', {hidden: true});
        body.appendChild(gridPane);
        body.appendChild(detailPane);
        gridPane.appendChild(el('div.sf-checks', showInactive.node,
            el('span.sf-note', 'Clock numbers scanned by Labor Data ' +
                'Collection: all caps, no spaces.')));
        var tbody = el('tbody');
        gridPane.appendChild(el('div.table-wrap', el('table.data.sf-table',
            el('thead', el('tr', el('th', ''), EMP_COLUMNS.map(function (c) {
                return el('th' + (c.type === 'number' ||
                    c.type === 'integer' ? '.num' : ''), c.label);
            }))), tbody)));
        shortcuts(gridPane, {save: function () {
            if (a.write || a.create) {
                save();
            }
        }, refresh: load, del: function () {
            var row = rows.filter(function (r) {
                return r.selected;
            })[0];
            if (row) {
                toggleDelete(row);
            }
        }});

        rights(['company.employee']).then(function (r) {
            a = r['company.employee'];
            form.allow(false, [].concat(a.write || a.create ? [] : ['Save']));
            load();
            if (params && params[0]) {
                details(parseInt(params[0], 10));
            }
        });

        function load() {
            Rpc.desk('sf_employees', [showInactive.box.checked]).then(
                function (list) {
                    rows = list.map(function (e) {
                        return {e: e};
                    });
                    render();
                }, failed);
        }

        function control(c, value, onchange) {
            var input;
            if (c.type === 'boolean') {
                input = el('input', {type: 'checkbox', checked: value,
                    'aria-label': c.label});
                input.addEventListener('change', onchange);
            } else {
                input = el('input' + (c.type === 'number' ||
                    c.type === 'integer' ? '.money' : ''), {type: c.type ===
                    'date' ? 'date' : 'text', 'aria-label': c.label,
                    value: value === null || value === undefined ? '' :
                        c.type === 'date' ? String(value).slice(0, 10) :
                            String(value)});
                if (c.width) {
                    input.style.width = c.width;
                }
                input.addEventListener('input', onchange);
                if (c.name === 'clock_no') {
                    input.addEventListener('blur', function () {
                        input.value = input.value.toUpperCase().replace(
                            /\s+/g, '');
                    });
                }
            }
            return input;
        }

        function value(c, input) {
            if (c.type === 'boolean') {
                return input.checked;
            }
            if (c.type === 'number') {
                return input.value === '' ? null : parseNum(input.value);
            }
            if (c.type === 'integer') {
                return input.value === '' ? null : parseInt(input.value, 10);
            }
            return input.value === '' ? null : input.value;
        }

        function renderRow(row) {
            var editable = row.e.id ? a.write : a.create;
            row.controls = {};
            var head = el('td.row-head', {title: 'Click to choose; Del ' +
                'marks for deletion'}, row.deleted ? '✕' : row.changed ? '✔' :
                row.e.id ? '' : '+');
            var tr = el('tr' + (row.deleted ? '.deleted' : '') +
                (row.changed ? '.changed' : '') + (row.selected ?
                '.selected' : ''), head, EMP_COLUMNS.map(function (c) {
                    var input = control(c, row.e[c.name], function () {
                        if (!row.changed) {
                            row.changed = true;
                            tr.classList.add('changed');
                            head.textContent = '✔';
                        }
                        if (!row.e.id && row === rows[rows.length - 1]) {
                            addEmpty();
                        }
                    });
                    input.disabled = !editable;
                    row.controls[c.name] = input;
                    return el('td', input);
                }));
            head.addEventListener('click', function () {
                rows.forEach(function (r) {
                    r.selected = r === row;
                });
                Array.prototype.forEach.call(tbody.children, function (t) {
                    t.classList.toggle('selected', t === tr);
                });
                form.allow(a.write || a.create, [].concat(
                    a.write || a.create ? [] : ['Save'],
                    row.e.id ? [] : ['Details']));
            });
            tr.addEventListener('contextmenu', function (event) {
                var items = [];
                if (row.e.id) {
                    items.push({label: 'Details', onclick: function () {
                        details(row.e.id);
                    }});
                }
                if (a.delete && row.e.id && !row.e.has_labor) {
                    items.push({label: row.deleted ? 'Undelete' : 'Delete',
                        onclick: function () {
                            toggleDelete(row);
                        }});
                }
                UI.contextMenu(event, items);
            });
            row.tr = tr;
            return tr;
        }

        function render() {
            UI.clear(tbody);
            rows.forEach(function (row) {
                tbody.appendChild(renderRow(row));
            });
            if (a.create) {
                addEmpty();
            }
        }

        function addEmpty() {
            var row = {e: {shift_no: 1, inactive: false}};
            rows.push(row);
            tbody.appendChild(renderRow(row));
        }

        /* Del: marks the row (Jobshop: "Delete Denied" when it has labor,
         * so it is not offered) */
        function toggleDelete(row) {
            if (!a.delete || !row.e.id || row.e.has_labor) {
                return;
            }
            row.deleted = !row.deleted;
            var tr = row.tr;
            row.tr = null;
            tbody.replaceChild(renderRow(row), tr);
        }

        function save() {
            var changed = [], deleted = [];
            rows.forEach(function (row) {
                if (row.deleted) {
                    deleted.push(row.e.id);
                    return;
                }
                if (!row.changed) {
                    return;
                }
                var values = {id: row.e.id || null};
                EMP_COLUMNS.forEach(function (c) {
                    values[c.name] = value(c, row.controls[c.name]);
                });
                if (!values.id && !values.name && !values.clock_no) {
                    return;
                }
                changed.push(values);
            });
            if (!changed.length && !deleted.length) {
                UI.toast('Nothing changed', 'ok');
                return;
            }
            Rpc.desk('sf_employees_save', [{rows: changed, 'delete':
                deleted}]).then(function (r) {
                    UI.toast('Employees saved: ' + r.saved + ' saved, ' +
                        r.deleted + ' deleted', 'ok');
                    load();
                }, failed);
        }

        /* The employee in full (the earlier Employees window, with the
         * Jobshop fields): person, dates, burden, notes */
        function details(id) {
            gridPane.hidden = true;
            detailPane.hidden = false;
            UI.clear(detailPane);
            var back = el('div.toolbar', el('button', {type: 'button',
                onclick: function () {
                    detailPane.hidden = true;
                    gridPane.hidden = false;
                    load();
                }}, '◀ Employees table'));
            detailPane.appendChild(back);
            var holder = el('div');
            detailPane.appendChild(holder);
            UI.master(holder, {
                title: 'Employee',
                model: 'company.employee',
                label: 'Employee',
                open: id,
                defaults: {company: Rpc.context().company},
                tabs: [
                    {title: 'Employee', fields: [
                        {name: 'party', label: 'Person', type: 'many2one',
                            model: 'party.party', span: 2},
                        {name: 'clock_no', label: 'Clock No', type: 'char'},
                        {name: 'shift_no', label: 'Shift No',
                            type: 'integer'},
                        {name: 'department', label: 'Department',
                            type: 'char'},
                        {name: 'title', label: 'Title', type: 'char'},
                        {name: 'start_date', label: 'Hire Date',
                            type: 'date'},
                        {name: 'end_date', label: 'Termination Date',
                            type: 'date'},
                        {name: 'supervisor', label: 'Supervisor',
                            type: 'many2one', model: 'company.employee'},
                        {name: 'inactive', label: 'Inactive',
                            type: 'boolean'}]},
                    {title: 'Costs', fields: [
                        {name: 'cost_per_hr', label: 'Base Cost/Hr',
                            type: 'decimal'},
                        {name: 'setup_cost_per_hr', label: 'Setup Cost/Hr',
                            type: 'decimal'},
                        {name: 'run_cost_per_hr', label: 'Run Cost/Hr',
                            type: 'decimal'},
                        {name: 'cost_per_unit', label: 'Cost/Unit',
                            type: 'decimal'},
                        {name: 'bur_per_hr_setup', label: 'Burden/Hr (Setup)',
                            type: 'decimal'},
                        {name: 'bur_percent_setup',
                            label: 'Burden % (Setup)', type: 'decimal'},
                        {name: 'bur_per_hr_run', label: 'Burden/Hr (Run)',
                            type: 'decimal'},
                        {name: 'bur_percent_run', label: 'Burden % (Run)',
                            type: 'decimal'},
                        {name: 'bur_per_unit_run', label: 'Burden/Unit (Run)',
                            type: 'decimal'}]},
                    {picture: true},
                    {notes: true}],
                browse: [
                    {name: 'clock_no', label: 'Clock No'},
                    {name: 'party', label: 'Employee', type: 'many2one'},
                    {name: 'start_date', label: 'Hire Date', type: 'date'},
                    {name: 'end_date', label: 'Termination Date',
                        type: 'date'}]
            });
        }
    };
    Screens.employees = Screens.jsEmployees;

    routes.push(
        [/^#\/issues$/, 'jsMaterialIssues'],
        [/^#\/wo-receipts$/, 'jsWoReceipts'],
        [/^#\/resources$/, 'jsResources'],
        [/^#\/resources\/(\d+)$/, 'jsResources'],
        [/^#\/shop-groups$/, 'jsShopGroups'],
        [/^#\/shop-groups\/(\d+)$/, 'jsShopGroups'],
        [/^#\/shop-views$/, 'jsShopViews'],
        [/^#\/shop-views\/(\d+)$/, 'jsShopViews'],
        [/^#\/labor$/, 'jsLaborEntry'],
        [/^#\/labor-collection$/, 'jsLaborCollection'],
        [/^#\/employees$/, 'jsEmployees'],
        [/^#\/employees\/(\d+)$/, 'jsEmployees']);
}(window));
