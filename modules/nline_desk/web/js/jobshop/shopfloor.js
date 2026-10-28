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
                'rgba(232, 119, 34, .16); }',
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
            /* The terminal: the desk's own sizes (as every other screen;
             * Jobshop's window is a normal window too), larger buttons */
            '.ldc .ldc-scan { display: flex; gap: 10px; align-items: center; ' +
                'flex-wrap: wrap; }',
            '.ldc .ldc-scan input { width: 260px; }',
            '.ldc .ldc-who { margin: 8px 0; padding: 6px 10px; ' +
                'border: 1px solid var(--line); border-radius: 6px; ' +
                'background: var(--paper); display: flex; gap: 14px; ' +
                'align-items: center; flex-wrap: wrap; }',
            '.ldc .ldc-buttons { display: grid; grid-template-columns: ' +
                'repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; ' +
                'margin: 8px 0; max-width: 980px; }',
            '.ldc .ldc-buttons button { min-height: 38px; font-weight: 600; }',
            '.ldc .ldc-filter { display: flex; gap: 12px; flex-wrap: wrap; ' +
                'align-items: center; margin-top: 6px; }',
            '.ldc .ldc-filter label { display: inline-flex; gap: 6px; ' +
                'align-items: center; white-space: nowrap; }',
            '.ldc-legend { display: flex; gap: 12px; color: var(--muted); ' +
                'font-size: 13px; margin: 4px 0; }',
            '.ldc-legend i { display: inline-block; width: 14px; height: 14px; ' +
                'border: 1px solid var(--line); vertical-align: middle; ' +
                'margin-right: 4px; }',
            '.modal .sf-form { min-width: min(560px, 80vw); }',
            '.sf-form.sf-4 { grid-template-columns: repeat(4, ' +
                'minmax(150px, 1fr)); }',
            /* Jobshop's group boxes (VFrame) on a master window's tab */
            'fieldset.sf-frame { border: 1px solid var(--line); ' +
                'border-radius: 6px; padding: 6px 12px 10px; margin: 0 0 10px; ' +
                'display: grid; grid-template-columns: repeat(auto-fill, ' +
                'minmax(190px, 1fr)); gap: 8px 14px; grid-column: 1 / -1; }',
            'fieldset.sf-frame > legend { color: var(--muted); ' +
                'font-size: 13px; padding: 0 4px; }',
            'fieldset.sf-frame .sf-frame-note { grid-column: 1 / -1; ' +
                'color: var(--muted); font-size: 13px; }',
            '.sf-desc { color: var(--muted); align-self: center; }',
            /* A caption placed on its own in a Jobshop layout */
            '.js-ctl > .sf-cap { height: auto; flex: none; font-size: 12px; ' +
                'align-self: center; }',
            '.sf-lines-inline { margin-top: 12px; }',
            'table.sf-table th.sortable { cursor: pointer; }',
            'table.sf-table tr.filtered-out { display: none; }',
            '.sf-dialog-grid { max-height: 60vh; overflow: auto; }',
            /* The employee's Calendars tab: the two grids side by side */
            '.sf-cal { display: flex; gap: 16px; align-items: flex-start; ' +
                'flex-wrap: wrap; }',
            '.sf-cal > div { min-width: 0; }',
            '.sf-cal-week { flex: 0 0 auto; }',
            '.sf-cal-changes { flex: 1 1 560px; }',
            '.sf-cal-title { font-size: 12px; margin: 0 0 4px; }',
            '.sf-cal table.sf-table td input.money { width: 72px; }',
            '.sf-cal table.sf-table td input[type=date] { width: 130px; }',
            '.sf-cal table.sf-table td input[type=time] { width: 120px; }',
            '.sf-cal table.sf-table td .picker { min-width: 120px; }',
            /* The employee's picture box on the Employee tab */
            '.js-layout > .sf-picture { border: 1px solid var(--line); ' +
                'overflow: hidden; background: #fff; }',
            '.sf-picture > .toolbar, .sf-picture figcaption { display: none; }',
            '.sf-picture .pictures, .sf-picture figure { margin: 0; ' +
                'height: 100%; }',
            '.sf-picture img { width: 100%; height: 100%; object-fit: ' +
                'contain; }',
            '.sf-picture p.muted { margin: 4px; font-size: 12px; }'
        ].join('\n')));
    }

    /* ---- Helpers ------------------------------------------------------ */

    /* The field box of a master window's tab by its label (UI.master puts
     * each field in a div: label.field + control) */
    function fieldBox(pane, label) {
        /* Only the boxes still in the tab's grid: a label used twice (the
         * estimated and actual burdens) finds the one not in a frame yet */
        var grid = pane.querySelector('.grid-form');
        var found = null;
        Array.prototype.forEach.call(grid ? grid.children : [],
            function (box) {
                var l = box.querySelector(':scope > label.field');
                if (!found && l && l.textContent === label) {
                    found = box;
                }
            });
        return found;
    }

    /* Jobshop's group boxes: the named fields of the tab's grid into a
     * fieldset with the box's title, in place of the first of them;
     * groups: [{title, labels: [...], note}] */
    function frames(pane, groups) {
        groups.forEach(function (g) {
            var boxes = g.labels.map(function (l) {
                return fieldBox(pane, l);
            }).filter(Boolean);
            if (!boxes.length) {
                return;
            }
            var set = el('fieldset.sf-frame', el('legend', g.title));
            if (g.note) {
                set.appendChild(el('div.sf-frame-note', g.note));
            }
            boxes[0].parentNode.insertBefore(set, boxes[0]);
            boxes.forEach(function (b) {
                set.appendChild(b);
            });
        });
    }

    /* The panes of a master window: [tab button, pane] by title */
    function masterTab(main, title) {
        var buttons = main.querySelectorAll('.tabs > button.tab');
        var panes = main.querySelectorAll('.tab-panes > .tab-pane');
        for (var i = 0; i < buttons.length; i += 1) {
            if (buttons[i].textContent === title) {
                return {button: buttons[i], pane: panes[i]};
            }
        }
        return null;
    }

    /* Jobshop draws a window's grid on its first tab: the lines tab of
     * UI.master moved there (its tab button hidden) */
    function linesOnFirstTab(main, linesTitle) {
        var first = main.querySelector('.tab-panes > .tab-pane');
        var lines = masterTab(main, linesTitle);
        if (!first || !lines) {
            return;
        }
        var box = el('div.sf-lines-inline');
        while (lines.pane.firstChild) {
            box.appendChild(lines.pane.firstChild);
        }
        first.appendChild(box);
        lines.button.hidden = true;
        /* (not a tab any more: nothing finds or opens it as one) */
        lines.button.classList.remove('tab');
    }

    /* A read-only description beside a code (Jobshop's type4 field) */
    function descBeside(pane, label, text) {
        var box = fieldBox(pane, label);
        if (!box) {
            return null;
        }
        var d = el('span.sf-desc', text || '');
        box.appendChild(d);
        return d;
    }

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

    /* A grid; a heading "#..." is a number column, "@" breaks the heading
     * into two lines as Jobshop's grid titles do ("Hours@Worked") */
    function table(heads, body) {
        return el('div.table-wrap', el('table.data.sf-table', el('thead',
            el('tr', heads.map(function (h) {
                var parts = h.replace(/^#/, '').split('@');
                return el('th' + (/^#/.test(h) ? '.num' : ''),
                    parts.length > 1 ? [parts[0], el('br'), parts[1]] :
                        parts[0]);
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

    /* A read-only field and check box of a details dialog */
    function roField(label, value, cls) {
        return field(label, el('input', {type: 'text', readonly: true,
            value: value === null || value === undefined ? '' :
                String(value)}), cls);
    }

    function roCheck(label, checked) {
        return el('label.check', el('input', {type: 'checkbox',
            disabled: true, checked: Boolean(checked)}), ' ' + label);
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
        var showAll = check('Show all', false, load);
        var stocked = check('Stocked Parts Only', false, load);
        var form = UI.form(main, {title: 'Material Issues/Returns', extra: [
            {label: 'Save', title: 'Issue / return the marked lines ' +
                '(Ctrl+S)', onclick: save},
            {label: 'Refresh', title: 'Refresh (F5)', onclick: load}]});
        var body = form.body;
        form.allow(false, ['Save']);
        seq.addEventListener('change', load);
        /* Jobshop's &Issue button beside the work order */
        var issueButton = el('button.primary', {type: 'button', onclick:
            function () {
                save();
            }, hidden: true, title: 'Issue / return the marked lines'},
            'Issue');
        body.appendChild(el('div.panel', el('div.sf-head',
            field('Date', date), el('div.sf-checks', showAll.node)),
            el('div.sf-head', field('Work/Lot/Split ID', wo),
                field('Sub/Seq', seq), issueButton)));
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
            }}, 'Select All for Return'));
        var tbody = el('tbody');
        body.appendChild(info);
        body.appendChild(el('div.sf-checks', buttons, stocked.node));
        /* (Length / Width / Height and Tracking No/Quantity: no piece
         * dimensions or lot tracking at N-Line) */
        body.appendChild(table(['Issue', 'Close@Now', 'Sub ID', 'Seq@No',
            'Piece@No', 'Part ID', 'Description', 'Status',
            '#Issue Qty@(Usage UM)', 'Usage U/M', 'Location ID',
            '#Issued To Date@(Stock UM)', '#Qty Due@(Usage UM)',
            '#Location Qty@(Stock UM)', 'Avail', '#Qty On Hand@(Stock UM)',
            '#Qty Available@(Stock UM)', 'Linked', 'Tracked',
            'Eng Master@Revision'], tbody));
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
            issueButton.hidden = !editable;
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
                }, ondblclick: function (event) {
                    if (!/input|select|button/i.test(event.target.tagName)) {
                        issueDetails(r, row);
                    }
                }, title: 'Double-click: Issue Details'},
                    el('td', row.issue), el('td', row.close), td(r.sub),
                    td(r.seq), td(r.piece), td(r.code || r.part),
                    td(r.description), td(r.status), row.qtyCell, td(r.unit),
                    el('td', row.location.node), numTd(r.issued),
                    numTd(r.due), numTd(r.location_qty),
                    td(r.available ? 'Y' : 'N'), numTd(r.on_hand),
                    numTd(r.qty_available), td(yes(r.linked)),
                    td(yes(r.tracked)), td(r.revision)));
            });
            if (!rows.length) {
                emptyRow(tbody, 20, showAll.box.checked ? 'No material.' :
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
                el('td', location.node), el('td', {colspan: 9})));
        }

        /* Issue Details (Jobshop's IssueEntryDetails): the material and
         * what is being issued, read only (the quantity is the grid's) */
        function issueDetails(r, row) {
            var issueQty = parseNum(row.qty.value);
            UI.modal('Issue Details', [el('div.sf-form',
                roField('Part ID', r.code || r.part),
                roField('Description', r.description, 'wide'),
                roField('Location ID', row.location.input.value ||
                    r.location_name, 'wide'),
                el('fieldset.sf-frame', el('legend', 'Material Information'),
                    roField('Work/Lot/Split', data.number),
                    roCheck('Auto Issue', false),
                    roField('Sub/Seq/Piece', text(r.sub) + '/' +
                        text(r.seq) + '/' + text(r.piece)),
                    roField('Req’d', UI.date(r.required_date)),
                    roField('Part ID', r.code || r.part),
                    roField('Description', r.description),
                    roField('unLinked Qty Due', qty(r.due) + ' ' + r.unit),
                    roField('Calc Qty', qty(r.calc_qty) + ' ' + r.unit),
                    roField('Eng Master Rev', r.revision),
                    roField('Issued Qty', qty(r.issued) + ' ' + r.unit),
                    roField('Reference', r.reference),
                    roCheck('Linked', r.linked)),
                el('fieldset.sf-frame', el('legend', 'Issue Information'),
                    roField('Issue Quantity', issueQty === null ? '' :
                        qty(issueQty) + ' ' + r.unit),
                    roField('Qty Available to Issue', qty(r.location_qty) +
                        ' ' + r.unit),
                    roCheck('Close Short', row.close.checked)))]);
        }

        /* Jobshop's PopupMaterialIssues (+ Inventory Txs) */
        function menu(event, product, name) {
            UI.contextMenu(event, [
                {label: 'Inventory Pieces...', onclick: function () {
                    partQuantities(product);
                }},
                {label: 'Open Part...', onclick: function () {
                    openPart(product);
                }},
                '-',
                {label: 'Inventory Txs', onclick: function () {
                    partTransactions(product, name);
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

    /* ---- Material Issue Barcoding (route issues-bc) ------------------------ */

    /* Jobshop's scanner window: Add (scan the work order, choose the
     * material, the quantity) builds a list; Save issues it all */
    Screens.jsMaterialIssuesBC = function (main) {
        style();
        var entries = [];
        var allowed = false;
        var tbody = el('tbody');
        var form = UI.form(main, {title: 'Material Issue Barcoding',
            extra: []});
        var date = el('input', {type: 'date', 'aria-label': 'Date',
            value: UI.today()});
        var addButton = el('button', {type: 'button', onclick: add,
            hidden: true}, 'Add');
        var saveButton = el('button.primary', {type: 'button', onclick: save,
            hidden: true}, 'Save');
        form.body.appendChild(el('div.panel', el('div.sf-head',
            field('Date', date))));
        form.body.appendChild(table(['#Entry No', 'Close Now', 'Work ID',
            'Sub ID', 'Seq No', 'Piece No', 'Part ID', 'Description',
            '#Issue Qty (Usage UM)', '#Qty Due (Usage UM)', 'Usage U/M',
            'Location ID', '#Qty Available (Usage UM)', 'Linked', 'Tracked',
            ''], tbody));
        form.body.appendChild(el('div.toolbar', addButton, saveButton));
        shortcuts(form.body, {save: function () {
            if (allowed) {
                save();
            }
        }});
        rights(['stock.move']).then(function (r) {
            allowed = r['stock.move'].create;
            addButton.hidden = saveButton.hidden = !allowed;
            if (!allowed) {
                form.body.appendChild(el('p.sf-note',
                    'You may not issue material.'));
            }
            render();
        });

        function render() {
            UI.clear(tbody);
            entries.forEach(function (e, i) {
                tbody.appendChild(el('tr', numTd(i + 1),
                    td(yes(e.close_now)), td(e.number), td(e.r.sub),
                    td(e.r.seq), td(e.r.piece), td(e.r.code || e.r.part),
                    td(e.r.description), numTd(e.quantity), numTd(e.r.due),
                    td(e.r.unit), td(e.location_name),
                    numTd(e.r.location_qty), td(yes(e.r.linked)),
                    td(yes(e.r.tracked)), el('td.row-delete', el('button', {
                        type: 'button', title: 'Delete row', onclick:
                            function () {
                                entries.splice(i, 1);
                                render();
                            }}, '✕'))));
            });
            if (!entries.length) {
                emptyRow(tbody, 16, 'Add: scan the work order, then the ' +
                    'material.');
            }
        }

        function add() {
            var data = null;
            var scan = el('input', {type: 'text', autocomplete: 'off',
                'aria-label': 'Work order bar code', placeholder:
                    'Scan the work order (or work order/seq)'});
            var material = el('select', {'aria-label': 'Material'});
            var quantity = el('input.money', {type: 'text', 'aria-label':
                'Issue Qty'});
            var close = el('input', {type: 'checkbox', 'aria-label':
                'Close Now'});
            var location = storagePicker(null, '');
            var wo = woPicker(function (r) {
                loadLines(r.id, null);
            });
            function current() {
                return data ? data.rows[parseInt(material.value, 10)] : null;
            }
            material.addEventListener('change', function () {
                var r = current();
                quantity.value = r && r.due > 0 ? qty(r.due) : '';
                if (r) {
                    location.set(r.location, r.location_name);
                }
            });
            function loadLines(production, seq) {
                Rpc.desk('sf_material_lines', [production, {}]).then(
                    function (d) {
                        data = d;
                        UI.clear(material);
                        d.rows.forEach(function (r, i) {
                            if (seq === null || String(r.seq) === String(seq)) {
                                material.appendChild(el('option', {value: i},
                                    text(r.seq) + ' ' + (r.code || r.part) +
                                    ' - ' + qty(r.due) + ' ' + r.unit));
                            }
                        });
                        material.dispatchEvent(new Event('change'));
                        if (!d.open) {
                            UI.toast('Work order ' + d.number + ' is not ' +
                                'open', 'error');
                        }
                    }, failed);
            }
            scan.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter') {
                    return;
                }
                event.preventDefault();
                Rpc.desk('sf_operation_lookup', [scan.value]).then(
                    function (f) {
                        if (!f) {
                            UI.toast('Unknown work order "' + scan.value +
                                '"', 'error');
                            return;
                        }
                        wo.set(f.production, f.number);
                        loadLines(f.production, f.seq);
                        scan.value = '';
                        material.focus();
                    }, failed);
            });
            UI.modal('Issue Details', [el('div.sf-form',
                field('Work Order (scan)', scan, 'wide'),
                field('Work/Lot/Split', wo), field('Material', material,
                    'wide'), field('Issue Quantity', quantity),
                field('Location ID', location),
                el('label.check', close, ' Close Short'))], [
                {label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function () {
                    var r = current();
                    var q = parseNum(quantity.value);
                    if (!r || !data.open || (!q && !close.checked)) {
                        UI.toast('Choose an open work order’s material ' +
                            'and the quantity', 'error');
                        return true;
                    }
                    entries.push({production: data.id, number: data.number,
                        r: r, quantity: q || 0, close_now: close.checked,
                        location: location.value() || r.location,
                        location_name: location.input.value ||
                            r.location_name});
                    render();
                }}]);
            scan.focus();
        }

        function save() {
            if (!entries.length) {
                UI.toast('Add the material to issue first', 'error');
                return;
            }
            var byProduction = {};
            entries.forEach(function (e) {
                (byProduction[e.production] = byProduction[e.production] ||
                    []).push({product: e.r.product, moves: e.r.moves,
                        quantity: e.quantity, location: e.location,
                        close_now: e.close_now});
            });
            var ids = Object.keys(byProduction);
            var done = 0;
            (function next() {
                if (!ids.length) {
                    UI.toast(done + ' work order(s) issued', 'ok');
                    entries = [];
                    render();
                    return;
                }
                var id = ids.shift();
                UI.service('sf_material_save', {production: parseInt(id, 10),
                    date: date.value, lines: byProduction[id]}).then(
                    function () {
                        done += 1;
                        entries = entries.filter(function (e) {
                            return String(e.production) !== id;
                        });
                        next();
                    }, function (error) {
                        render();
                        failed(error);
                    });
            }());
        }
    };

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
        var after = el('input', {type: 'date', 'aria-label':
            'Created On or After'});
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
        var receiveButton = el('button.primary', {type: 'button', hidden: true,
            onclick: function () {
                save();
            }}, 'Receive/Return');
        body.appendChild(el('div.panel', el('div.sf-head',
            field('Date', date), receiveButton),
            el('fieldset.sf-frame', el('legend', 'Show'),
                el('label.check', openRadio,
                    ' Show All Currently Open Work Orders'),
                el('label.check', receivedRadio,
                    ' Show All Previously Received Work Orders'),
                linked.node, incomplete.node,
                field('Created On or After', after),
                el('div', el('button', {type: 'button', onclick: load},
                    'Refresh Grid')))));
        body.appendChild(el('p.sf-note', 'Receive the parts of a work order ' +
            'to stock (to completion closes it; Close Short closes it with ' +
            'fewer), or return received parts of an open work order to the ' +
            'shop floor. Right-click a column to filter or sort.'));
        var tbody = el('tbody');
        /* The grid's columns after the check boxes: [title, value, kind]
         * (Lot / Split: one work order an ID in the ERP, Sub = its leg;
         * Tracking No: no lot tracking at N-Line) */
        var COLS = [
            ['Work@Order ID', 'number'], ['Sub ID', 'sub'],
            ['Part ID', 'part'], ['Desired@Want Date', 'want_date', 'date'],
            ['#Desired@Quantity', 'desired', 'num'],
            ['#Linked@Quantity', 'linked', 'num'],
            ['#Received@Quantity', 'received', 'num'],
            ['For@Return', 'for_return', 'yes'], null,
            ['#Linked Qty@Received', 'linked_received', 'num'],
            ['Unit of@Measure', 'unit'], null,
            ['#Location@Qty Available', 'available', 'num'],
            ['#Qty Avail.@For Return', 'return_available', 'num'],
            ['Order Status', 'status'],
            ['Sched Finish@Date', 'finish_date', 'date'],
            ['Description', 'description'], ['Tracked', 'tracked', 'yes'],
            ['Eng Master@Revision', 'revision']];
        var filters = [];
        var sort = null;
        body.appendChild(table(['Transact@Now', 'Close@Short'].concat(
            COLS.map(function (c, i) {
                return c ? c[0] : i === 8 ? '#Rec/Rtn@Quantity' : 'Location';
            })), tbody));
        shortcuts(body, {save: function () {
            if (allowed.receive) {
                save();
            }
        }, refresh: load});

        rights(['stock.move']).then(function (r) {
            allowed.receive = r['stock.move'].create;
            form.allow(false, allowed.receive ? [] : ['Save']);
            receiveButton.hidden = !allowed.receive;
            load();
        });

        function load() {
            Rpc.desk('sf_receipt_lines', [{
                mode: receivedRadio.checked ? 'received' : 'open',
                exclude_linked: linked.box.checked,
                exclude_incomplete: incomplete.box.checked,
                created_after: after.value || null}]).then(
                function (list) {
                    rows = list.map(function (r) {
                        return {r: r};
                    });
                    render();
                }, failed);
        }

        function cell(c, r) {
            var v = r[c[1]];
            return c[2] === 'num' ? numTd(v) : c[2] === 'date' ?
                td(UI.date(v)) : c[2] === 'yes' ? td(yes(v)) : td(v);
        }

        function shownValue(c, r) {
            var v = r[c[1]];
            return c[2] === 'yes' ? (v ? 'Y' : 'N') : text(v);
        }

        /* WO Receipt Filters: the rows that pass the filters, sorted */
        function visible() {
            var list = rows.filter(function (row) {
                return filters.every(function (f) {
                    return (shownValue(f.col, row.r) === f.value) ===
                        f.include;
                });
            });
            if (sort) {
                list.sort(function (a, b) {
                    var x = a.r[sort.col[1]], y = b.r[sort.col[1]];
                    x = x === null || x === undefined ? '' : x;
                    y = y === null || y === undefined ? '' : y;
                    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
                });
            }
            return list;
        }

        function render() {
            UI.clear(tbody);
            visible().forEach(function (row) {
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
                    var cellIndex = event.target.closest('td') ?
                        event.target.closest('td').cellIndex - 2 : -1;
                    menu(event, r, COLS[cellIndex] || null);
                }}, el('td', row.transact), el('td', row.closeShort),
                    COLS.map(function (c, i) {
                        if (i === 8) {
                            return el('td', row.qty);
                        }
                        if (i === 11) {
                            return el('td', row.location.node);
                        }
                        if (c[1] === 'part') {
                            /* The part's ID, the name in its tooltip (the
                             * Description column has it too) */
                            return el('td', {title: r.part || ''},
                                UI.shortName('product.product', r.part));
                        }
                        if (c[1] === 'status') {
                            return td(r.status + (r.for_return &&
                                !r.can_return ? ' (closed)' : ''));
                        }
                        return cell(c, r);
                    })));
            });
            if (!tbody.children.length) {
                emptyRow(tbody, COLS.length + 2, receivedRadio.checked ?
                    'No received work order.' : 'No open work order.');
            }
        }

        /* Jobshop's PopupWOReceiptFilter (+ Inventory Txs, Receive All and
         * Close) */
        function menu(event, r, col) {
            var items = [];
            if (col) {
                var value = shownValue(col, r);
                items.push(
                    {label: 'Filter Including', onclick: function () {
                        filters.push({col: col, value: value, include: true});
                        render();
                    }},
                    {label: 'Filter Excluding', onclick: function () {
                        filters.push({col: col, value: value,
                            include: false});
                        render();
                    }},
                    {label: 'Remove Filters/Sort', disabled: !filters.length &&
                        !sort, onclick: function () {
                            filters = [];
                            sort = null;
                            render();
                        }},
                    {label: 'Sort Ascending', checked: Boolean(sort &&
                        sort.col === col && sort.dir === 1), onclick:
                        function () {
                            sort = {col: col, dir: 1};
                            render();
                        }},
                    {label: 'Sort Descending', checked: Boolean(sort &&
                        sort.col === col && sort.dir === -1), onclick:
                        function () {
                        sort = {col: col, dir: -1};
                        render();
                    }}, '-');
            }
            items.push(
                {label: 'Open Work Order...', onclick: function () {
                    UI.openScreen('work-orders/' + r.id);
                }},
                {label: 'Inventory Txs', onclick: function () {
                    partTransactions(r.product, r.part);
                }});
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
            var marked = visible().filter(function (row) {
                return row.transact && row.transact.checked;
            });
            /* ERROR_OverReceive: more than the work order still wants */
            var over = marked.filter(function (row) {
                return !row.r.for_return && (parseNum(row.qty.value) || 0) >
                    (row.r.desired || 0) - (row.r.received || 0) + 1e-9;
            });
            if (over.length) {
                UI.confirm('Work Order Receipts', 'The receive quantity is ' +
                    'greater than the work order outstanding quantity (' +
                    over.map(function (row) {
                        return row.r.number;
                    }).join(', ') + '). Continue?').then(function (ok) {
                        if (ok) {
                            transact(marked);
                        }
                    });
                return;
            }
            transact(marked);
        }

        function transact(marked) {
            var lines = marked.map(function (row) {
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

    /* View > Where Used... (Jobshop's Resource Where Used window) */
    var WHERE_USED_COLUMNS = [
        ['preserved', 'Preserved', 'yes'], ['created', 'Doc Creation Date',
            'date'], ['type', 'Document Type'], ['document', 'Document ID'],
        ['status', 'Doc Status'], ['engineered', 'Doc Engineered Date',
            'date'], ['sub', 'Sub ID'], ['seq', 'Seq No'],
        ['op_status', 'Op Status'], ['setup_hours', '#Setup Hrs', 'num'],
        ['run', '#Run', 'num'], ['run_type', 'Run Type'],
        ['load_size', '#Load Size Qty', 'num'], ['move_hours', '#Move Hrs',
            'num'], ['minimum_move_qty', '#Min Move Qty', 'num'],
        ['scrap_percent', '#Scrap/Yield Pct', 'num'],
        ['scrap_yield', 'Scrap/Yield Type'], ['fixed_scrap',
            '#Fixed Scrap Units', 'num'], ['drawing_id', 'Drawing ID'],
        ['drawing_rev', 'Drawing Rev'], ['drawing_page', 'Drawing Page'],
        ['drawing_file', 'Drawing File'], ['description', 'Description']];

    function whereUsed(record) {
        var resource = UI.picker('production.work.center', {label:
            'Resource ID', placeholder: 'Resource ID', onselect: function (r) {
                load(r.id);
            }});
        var descr = el('span.sf-desc');
        var masters = check('Engineering Master', true, show);
        var orders = check('Work Order', true, show);
        var quotes = check('Quote Master', true, show);
        var body = el('tbody');
        var rows = [];
        function load(id) {
            Rpc.desk('sf_resource_where_used', [id, {}]).then(function (r) {
                rows = r.rows;
                descr.textContent = r.description;
                show();
            }, failed);
        }
        if (record) {
            resource.set(record.id, record.name);
            load(record.id);
        }
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
                    }}, WHERE_USED_COLUMNS.map(function (c) {
                        var v = row[c[0]];
                        return c[2] === 'yes' ? td(yes(v)) : c[2] === 'num' ?
                            numTd(v) : c[2] === 'date' ? td(UI.date(v)) :
                            td(v);
                    })));
            });
            if (!body.children.length) {
                emptyRow(body, WHERE_USED_COLUMNS.length, 'Not used.');
            }
        }
        UI.modal('Resource Where Used', [
            el('div.sf-head', field('Resource ID', resource), descr,
                el('fieldset.sf-frame', el('legend', 'Include Document Type'),
                    masters.node, orders.node, quotes.node)),
            el('div.sf-dialog-grid', table(WHERE_USED_COLUMNS.map(
                function (c) {
                    return c[1];
                }), body))]);
    }

    /* Tools > Reset Operation Costs... */
    function resetCosts(record) {
        var current = el('input', {type: 'radio', name: 'sf-reset-res',
            checked: Boolean(record), disabled: !record});
        var all = el('input', {type: 'radio', name: 'sf-reset-res',
            checked: !record});
        var description = check('Description', false);
        var costs = check('Costs', true);
        /* No user fields on N-Line's resources: shown, not offered */
        var userFields = check('User Fields', false);
        userFields.box.disabled = true;
        var masters = check('Engineering Masters', true);
        var locked = check('Locked Engineering Masters', true);
        var templates = check('Operation Templates', true);
        var quotes = check('Quote Masters', true);
        var orders = check('Work Orders', true);
        var byStatus = check('According to Operation Status', false);
        var statuses = [['unreleased', 'Unreleased'], ['firm', 'Firmed'],
            ['released', 'Released'], ['closed', 'Closed'],
            ['cancelled', 'Cancelled'], ['all', 'All']].map(function (s) {
                var c = check(s[1], s[0] !== 'closed' &&
                    s[0] !== 'cancelled' && s[0] !== 'all');
                c.value = s[0];
                return c;
            });
        var byDate = check('According to W/O or Master Creation Date', false);
        var from = el('input', {type: 'date', 'aria-label': 'On or After'});
        var to = el('input', {type: 'date', 'aria-label': 'On or Before'});
        var byTemplate = check('According to Operation Template ID', false);
        var template = UI.picker('nline.engineering.operation_template', {
            label: 'Template ID', placeholder: 'Template ID'});
        masters.box.addEventListener('change', function () {
            locked.box.disabled = !masters.box.checked;
        });
        UI.modal('Reset Operation Costs', [
            el('fieldset.sf-frame', el('legend', 'Resources'),
                el('label.check', current, ' Current Resource Only' +
                    (record ? ' (' + record.name + ')' : '')),
                el('label.check', all, ' All Resources')),
            el('fieldset.sf-frame', el('legend', 'Information to Reset'),
                description.node, costs.node, userFields.node),
            el('fieldset.sf-frame', el('legend', 'Reset Information On'),
                masters.node, locked.node, templates.node, quotes.node,
                orders.node),
            el('fieldset.sf-frame', el('legend', 'Filters'), byStatus.node,
                el('div.sf-checks', statuses.map(function (s) {
                    return s.node;
                })), byDate.node, el('label', 'On or After ', from),
                el('label', 'On or Before ', to), byTemplate.node,
                field('Template ID', template)),
            el('p.sf-note', 'The operations take the current costs (and ' +
                'description) of their resource; the Tryton rate of a ' +
                'resource becomes its run cost plus run burden per hour. ' +
                'Without a status, the open work orders.')], [
            {label: 'Cancel'},
            {label: 'OK', primary: true, onclick: function () {
                Rpc.desk('sf_reset_operation_costs', [{
                    resource: current.checked && record ? record.id : null,
                    costs: costs.box.checked,
                    description: description.box.checked,
                    quotes: quotes.box.checked,
                    masters: masters.box.checked,
                    templates: templates.box.checked,
                    work_orders: orders.box.checked,
                    statuses: byStatus.box.checked ? statuses.filter(
                        function (s) {
                            return s.box.checked;
                        }).map(function (s) {
                            return s.value;
                        }) : null,
                    from_date: byDate.box.checked ? from.value || null : null,
                    to_date: byDate.box.checked ? to.value || null : null,
                    template: byTemplate.box.checked ? template.value() :
                        null
                }]).then(function (r) {
                    UI.toast(r.work_orders + ' work order, ' + r.masters +
                        ' master and ' + (r.templates || 0) + ' template ' +
                        'operation(s) reset, ' + r.resources +
                        ' resource rate(s)', 'ok');
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
        /* View > Where Used..., Tools > Reset Operation Costs... (Jobshop's
         * Weekly Calendars / Calendar Exceptions are the Scheduling
         * window's Tools: planning area) */
        var extra = [
            {label: 'Where Used...', onclick: function (record) {
                whereUsed(record);
            }}];
        if (canReset) {
            extra.push({label: 'Reset Operation Costs...',
                onclick: function (record) {
                    resetCosts(record);
                }});
        }
        var user = {type: 'many2one', model: 'res.user', readonly: true};
        UI.master(main, {
            title: 'Shop Resources',
            model: 'production.work.center',
            label: 'Shop Resource ID',
            idAt: [6, 4, 382, 24],
            idSplit: 132,
            idField: 'name',
            idLength: 15,
            browseShowAll: true,
            order: [['name', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            extra: extra,
            afterSave: setupResource,
            tabs: [
                {title: 'Shop Resources', frames: [
                    {label: 'Scheduling Attributes', at: [6, 72, 847, 160]},
                    {label: 'Capacity', at: [19, 159, 269, 251]},
                    {label: 'Special Instructions', at: [284, 159, 845, 251]}
                ], fields: [
                    {name: 'inactive', at: [392, 4, 464, 24], split: 100, label: 'Inactive', type: 'boolean',
                        default: false},
                    Object.assign({name: 'create_uid', at: [504, 4, 849, 24], split: 101,
                        label: 'Record Created by'}, user),
                    {name: 'description', at: [6, 26, 500, 46], split: 132, label: 'Description', type: 'char',
                        span: 2},
                    Object.assign({name: 'write_uid', at: [504, 26, 849, 46], split: 101,
                        label: 'Last Modified by'}, user),
                    {name: 'resource_type', at: [6, 48, 270, 68], split: 132, label: 'Type',
                        type: 'selection', options: RESOURCE_TYPES,
                        default: 'machine'},
                    {name: 'schedule_method', at: [19, 92, 283, 112], split: 120, label: 'Schedule Method',
                        type: 'selection', options: [['finite', 'Finite'],
                            ['infinite', 'Infinite']], default: 'infinite'},
                    {name: 'schedule_type', at: [19, 114, 283, 134], split: 120, label: 'Schedule Type',
                        type: 'selection', options: [['normal', 'Normal'],
                            ['discontinuous', 'Discontinuous']],
                        default: 'normal'},
                    {name: 'min_segment_size', at: [291, 114, 489, 134],
                        split: 86, label: 'Min segment size', type: 'float',
                        help: 'hours'},
                    {name: 'exclusivity', at: [19, 136, 283, 156], split: 120, label: 'Group Exclusivity',
                        type: 'selection', options: [['exclusive',
                            'Exclusive'], ['inclusive', 'Inclusive']],
                        default: 'inclusive'},
                    {name: 'shift_1_capacity', at: [34, 179, 205, 199], split: 105, label: 'Shift 1',
                        type: 'integer', default: 1},
                    {name: 'shift_2_capacity', at: [34, 201, 205, 221], split: 105, label: 'Shift 2',
                        type: 'integer'},
                    {name: 'shift_3_capacity', at: [34, 223, 205, 243], split: 105, label: 'Shift 3',
                        type: 'integer'},
                    {name: 'special_instructions', at: [298, 179, 831, 243], split: 0,
                        label: 'Special Instructions', type: 'text',
                        span: 3},
                    /* Tryton's own (not in Jobshop's window) */
                    {name: 'category', label: 'Category', type: 'many2one',
                        model: 'production.work.center.category'},
                    {name: 'warehouse', label: 'Warehouse', type: 'many2one',
                        model: 'stock.location', domain: [['type', '=',
                            'warehouse']]}]},
                {title: 'Costs', frames: [
                    {label: 'Labor Costs (Estimated Only)',
                        at: [8, 48, 822, 93]},
                    {label: 'Burden Costs (Estimated)', at: [8, 98, 820, 165]},
                    {label: 'Burden Costs (Actual)', at: [8, 170, 820, 242]}
                ], fields: [
                    {name: 'setup_per_hr', at: [21, 68, 257, 88], split: 120, label: 'Labor/Hour (setup)',
                        type: 'decimal'},
                    {name: 'run_per_hr', at: [283, 68, 519, 88], split: 120, label: 'Labor/Hour (run)',
                        type: 'decimal'},
                    {name: 'run_per_unit', at: [556, 68, 792, 88], split: 145,
                        label: 'Cost/Unit (labor or service)',
                        type: 'decimal'},
                    {name: 'bur_per_hr_setup', at: [21, 118, 257, 138], split: 120, label: 'Burden/Hour (setup)',
                        type: 'decimal'},
                    {name: 'bur_percent_setup', at: [283, 118, 519, 138], split: 150,
                        label: 'Percent of Total Labor (setup)',
                        type: 'decimal'},
                    {name: 'bur_per_oper', at: [556, 118, 792, 138], split: 120, label: 'Fixed Burden',
                        type: 'decimal'},
                    {name: 'bur_per_hr_run', at: [21, 140, 257, 160], split: 120, label: 'Burden/Hour (run)',
                        type: 'decimal'},
                    {name: 'bur_percent_run', at: [283, 140, 519, 160], split: 150,
                        label: 'Percent of Total Labor (run)',
                        type: 'decimal'},
                    {name: 'bur_per_unit_run', at: [556, 140, 792, 160], split: 120, label: 'Burden/Unit (run)',
                        type: 'decimal'},
                    {name: 'act_bur_per_hr_setup', at: [21, 190, 257, 210], split: 120,
                        label: 'Burden/Hour (setup)', type: 'decimal'},
                    {name: 'act_bur_percent_setup', at: [283, 190, 519, 210], split: 150,
                        label: 'Percent of Total Labor (setup)',
                        type: 'decimal'},
                    {name: 'act_bur_per_oper', at: [556, 190, 792, 210], split: 120, label: 'Fixed Burden',
                        type: 'decimal'},
                    {name: 'act_bur_per_hr_run', at: [21, 212, 257, 232], split: 120, label: 'Burden/Hour (run)',
                        type: 'decimal'},
                    {name: 'act_bur_percent_run', at: [283, 212, 519, 232], split: 150,
                        label: 'Percent of Total Labor (run)',
                        type: 'decimal'},
                    {name: 'act_bur_per_unit_run', at: [556, 212, 792, 232], split: 120,
                        label: 'Burden/Unit (run)', type: 'decimal'},
                    {name: 'cost_price', label: 'Cost rate', type: 'money'},
                    {name: 'cost_method', label: 'Cost per',
                        type: 'selection', options: [[null, ''],
                            ['hour', 'Hour'], ['cycle', 'Cycle']]}]}
            ],
            browse: [
                {name: 'name', label: 'ID'},
                {name: 'description', label: 'Description'},
                {name: 'resource_type', label: 'Type',
                    labels: TYPE_LABELS},
                {name: 'inactive', label: 'Inactive', type: 'boolean'}]
        });
        /* (Category, Warehouse, Cost rate / per: Tryton's own, below
         * Jobshop's layout) */
    }

    /* ---- Shop Groups ------------------------------------------------------ */

    Screens.jsShopGroups = function (main, params) {
        style();
        UI.master(main, {
            title: 'Shop Groups',
            model: 'production.work.center',
            label: 'Shop Group ID',
            idAt: [6, 4, 288, 24],
            idSplit: 120,
            idField: 'name',
            idLength: 15,
            domain: [['resource_type', '=', 'group']],
            order: [['name', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            /* A new shop group is a resource of type Group, scheduled
             * infinite and inclusive */
            defaults: {resource_type: 'group', schedule_method: 'infinite',
                schedule_type: 'normal'},
            afterSave: setupResource,
            /* Group Exclusivity is the members' (Shop Resources) */
            tabs: [
                {title: 'Shop Groups', fields: [
                    {name: 'description', label: 'Description', type: 'char',
                        at: [6, 26, 831, 46], split: 120}]},
                {title: 'Members', lines: {name: 'members',
                    model: 'nline.js.resource.member', inverse: 'group',
                    order: [['sequence', 'ASC']],
                    fields: [
                        {name: 'sequence', label: 'Seq No', type: 'integer'},
                        {name: 'resource', label: 'Resource ID',
                            type: 'many2one', model: 'production.work.center',
                            domain: [['resource_type', '!=', 'group']]},
                        {name: 'description', label: 'Description',
                            type: 'char', readonly: true},
                        {name: 'resource_type', label: 'Type',
                            type: 'selection', options: [[null, '']].concat(
                                RESOURCE_TYPES), readonly: true}]}}],
            browse: [
                {name: 'name', label: 'ID'},
                {name: 'description', label: 'Description'},
                {name: 'resource_type', label: 'Type', labels: TYPE_LABELS}]
        });
        /* Jobshop draws the members' grid on the Shop Groups tab */
        linesOnFirstTab(main, 'Members');
    };

    /* ---- Shop Views -------------------------------------------------------- */

    Screens.jsShopViews = function (main, params) {
        style();
        UI.master(main, {
            title: 'Shop Views',
            model: 'nline.js.shop_view',
            label: 'Shop View ID',
            idAt: [6, 4, 288, 24],
            idSplit: 140,
            idField: 'code',
            idLength: 15,
            order: [['code', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            tabs: [
                {title: 'Shop Views', fields: [
                    {name: 'description', label: 'Description', type: 'char',
                        at: [6, 26, 835, 46], split: 140}]},
                {title: 'Resources', lines: {name: 'resource_lines',
                    model: 'nline.js.shop_view.resource', inverse: 'view',
                    order: [['sequence', 'ASC']],
                    fields: [
                        {name: 'sequence', label: 'Seq No', type: 'integer'},
                        {name: 'resource', label: 'Resource ID',
                            type: 'many2one',
                            model: 'production.work.center'},
                        {name: 'description', label: 'Description',
                            type: 'char', readonly: true},
                        {name: 'resource_type', label: 'Type',
                            type: 'selection', options: [[null, '']].concat(
                                RESOURCE_TYPES), readonly: true}]}}],
            browse: [
                {name: 'code', label: 'ID'},
                {name: 'description', label: 'Description'}]
        });
        /* Jobshop draws the resources' grid on the Shop Views tab */
        linesOnFirstTab(main, 'Resources');
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
            fields: ['shift_no', 'clock_no', 'cost_per_hr',
                'setup_cost_per_hr', 'run_cost_per_hr'], onselect: onselect});
    }

    /* The employee's name of a picked employee ("CLOCK - Name") */
    function employeeName(r) {
        var name = r && r.rec_name ? String(r.rec_name) : '';
        if (r && r.clock_no && name.indexOf(r.clock_no + ' - ') === 0) {
            name = name.slice(r.clock_no.length + 3);
        }
        return name;
    }

    /* Jobshop's Pay Rate list: the employee's rates ("Base $ 20.00") */
    var PAY_RATES = [['base', 'Base', 'cost_per_hr'], ['setup', 'Setup',
        'setup_cost_per_hr'], ['run', 'Run', 'run_cost_per_hr']];
    var PAY_NAME = {base: 'Base', setup: 'Setup', run: 'Run'};

    function payRateOptions(s, r) {
        var keep = s.value;
        UI.clear(s).appendChild(el('option', {value: ''},
            '(the type’s rate)'));
        PAY_RATES.forEach(function (p) {
            var v = r ? r[p[2]] : null;
            s.appendChild(el('option', {value: p[0]}, p[1] + '   $ ' +
                (v === null || v === undefined || v === '' ? '-' :
                    UI.money(v))));
        });
        s.value = keep;
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
        var tabBar = null;
        form.allow(false, ['Save']);
        var body = form.body;
        var entry = {};
        var allowed = {post: false};
        rights(['nline.js.labor_ticket', 'production.work.cycle']).then(
            function (r) {
                allowed.post = r['nline.js.labor_ticket'].create &&
                    r['production.work.cycle'].create;
                form.allow(false, allowed.post ? [] : ['Save']);
                tabBar = tabs(body, [
                    {title: 'Labor Entry', render: function (pane) {
                        entryTab(pane, allowed, entry);
                    }},
                    {title: 'Labor Edit/Reverse', render: function (pane) {
                        reversalTab(pane, allowed, function (t) {
                            /* Edit: the reversed ticket's values back in
                             * Labor Entry to post the corrected one */
                            tabBar.show(0);
                            if (entry.fill) {
                                entry.fill(t);
                            }
                        });
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
        var employeeDesc = el('span.sf-desc');
        var payRate = el('select', {'aria-label': 'Pay Rate'});
        payRateOptions(payRate, null);
        var employee = employeePicker(function (r) {
            if (r && r.shift_no) {
                shiftNo.value = r.shift_no;
            }
            employeeDesc.textContent = employeeName(r);
            payRateOptions(payRate, r);
        });
        var shiftNo = el('input.money', {type: 'text', 'aria-label':
            'Shift No', value: '1'});
        var shiftType = select(SHIFT_TYPES, 'regular', 'Shift Type');
        var txType = select(TX_TYPES, 'run', 'Type');
        var resource = UI.picker('production.work.center', {label:
            'Resource ID', placeholder: 'Resource ID'});
        var ops = operationSelect(function (w) {
            opQty.value = w ? qty(Math.max((w.operation_qty || 0) -
                (w.completed_qty || 0), 0)) : '';
            cumQty.value = w ? qty(w.completed_qty) : '';
            if (w && w.resource_id) {
                resource.set(w.resource_id, w.resource);
            }
            renderOps();
        });
        var info = null;
        var wo = woPicker(function (r) {
            ops.load(r.id).then(function (i) {
                info = i;
                renderOps();
            });
        });
        /* Edit: the work order window at this operation */
        var editButton = el('button', {type: 'button', title:
            'Open the work order', onclick: function () {
                if (info) {
                    UI.openScreen('work-orders/' + info.id);
                }
            }}, 'Edit');
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
        var reasonDesc = el('span.sf-desc');
        var reason = UI.picker('nline.reason_code', {label: 'Reason Code',
            placeholder: 'Reason Code', domain: [['reason_type', 'in',
                [null, 'labor']]], onselect: function (r) {
                    reasonDesc.textContent = r ? r.rec_name : '';
                }});
        var description = el('textarea', {rows: 3, 'aria-label':
            'Description'});
        var completed = el('input', {type: 'checkbox', 'aria-label':
            'Completed'});
        var opQty = el('input.money', {type: 'text', readonly: true,
            'aria-label': 'Operation Qty'});
        /* (Jobshop's OP_COMPLETED_QTY: captioned "Completed Qty" too,
         * under Operation Qty) */
        var cumQty = el('input.money', {type: 'text', readonly: true,
            'aria-label': 'Completed Qty to date', title: 'The ' +
                'operation’s quantity completed so far'});
        var woField = field('Work/Lot/Split', wo);
        var opField = el('label', 'Sub/Seq', el('span.sf-checks', ops.node,
            editButton));
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

        /* Jobshop's rows: clock no + name; shift no, shift type, pay
         * rate; work/lot/split, sub/seq, Edit; type, resource; clock in,
         * hours; clock out, allocation; completed qty, completed, operation
         * qty; deviated qty, completed qty; reason code; description */
        /* Placed as Jobshop's LaborEntry layout (its units) */
        function ctl(label, node, at, split, type) {
            return {label: label, control: node, at: at, split: split,
                type: type};
        }
        var placed = [
            ctl('Employee Clock No', employee.node, [29, 4, 314, 24], 150),
            ctl('', employeeDesc, [316, 4, 740, 23], 0),
            ctl('Shift No', shiftNo, [29, 26, 224, 46], 150),
            ctl('Shift Type', shiftType, [250, 26, 425, 46], 71),
            ctl('Pay Rate', payRate, [451, 26, 654, 46], 65),
            ctl('Work/Lot/Split', wo.node, [29, 60, 449, 80], 150),
            /* (the Edit button in its own box: inside the Sub/Seq box it
             * wrapped under it, a stray line under Resource ID) */
            ctl('Sub/Seq', ops.node, [451, 60, 675, 80], 90),
            ctl('', editButton, [680, 58, 743, 83], 0),
            ctl('Type', txType, [29, 82, 314, 102], 150),
            ctl('Resource ID', resource.node, [451, 82, 673, 102], 90),
            ctl('Clock In', clockIn, [29, 104, 355, 124], 150),
            ctl('Hours Worked', hours, [451, 104, 632, 124], 90),
            ctl('Clock Out', clockOut, [29, 126, 355, 146], 150),
            ctl('Labor Allocation', alloc, [451, 126, 632, 146], 90),
            ctl('', el('span.sf-cap', '%'), [634, 126, 646, 146], 0),
            ctl('Completed Qty', completedQty, [29, 148, 314, 168], 150),
            ctl('Completed', completed, [316, 148, 412, 168], 88,
                'boolean'),
            ctl('Operation Qty', opQty, [451, 148, 632, 168], 90),
            ctl('Deviated Qty', deviatedQty, [29, 170, 314, 190], 150),
            ctl('Completed Qty', cumQty, [451, 170, 632, 190], 90),
            ctl('Reason Code', reason.node, [29, 192, 314, 212], 150),
            ctl('', reasonDesc, [316, 192, 744, 212], 0),
            ctl('', el('span.sf-cap', 'Description'), [29, 214, 157, 234],
                0),
            ctl('', description, [179, 214, 745, 321], 0, 'text')];
        pane.appendChild(el('div.panel', UI.placedForm({frames: [],
            fields: placed}, function (f) {
                return {node: f.control};
            }),
            el('div.toolbar', el('button', {type: 'button', onclick:
                function () {
                    newEntry();
                }}, 'New Entry'), allowed.post ? el('button.primary', {
                    type: 'button', onclick: function () {
                        entry.save();
                    }}, 'Save') : null)));
        /* The placed boxes that Type shows or hides */
        woField = wo.node.closest('.js-ctl') || woField;
        opField = ops.node.closest('.js-ctl') || opField;
        completedField = completedQty.closest('.js-ctl') || completedField;
        typeChanged();

        /* New Entry: an empty ticket for the same employee */
        function newEntry() {
            clockOut.value = '';
            hours.value = completedQty.value = deviatedQty.value = '';
            description.value = '';
            reason.set(null, '');
            reasonDesc.textContent = '';
            completed.checked = false;
            alloc.value = '100';
        }

        /* Labor Edit/Reverse > Edit: the ticket's values to post again */
        entry.fill = function (t) {
            if (t.employee) {
                employee.set(t.employee, t.clock_no);
                employeeDesc.textContent = t.name;
            }
            shiftNo.value = text(t.shift_no);
            shiftType.value = t.shift_type || 'regular';
            payRate.value = t.pay_rate || '';
            txType.value = t.type;
            typeChanged();
            if (t.resource_id) {
                resource.set(t.resource_id, t.resource);
            }
            if (t.production) {
                wo.set(t.production, t.number);
                ops.load(t.production, t.work).then(function (i) {
                    info = i;
                    renderOps();
                });
            }
            clockIn.value = t.clock_in ? t.clock_in.replace(' ', 'T') : '';
            clockOut.value = t.clock_out ? t.clock_out.replace(' ', 'T') :
                '';
            hours.value = qty(t.hours);
            alloc.value = qty(t.labor_percent);
            completedQty.value = qty(t.completed_qty);
            deviatedQty.value = qty(t.deviated_qty);
            reason.set(t.reason_code, t.reason);
            reasonDesc.textContent = t.reason || '';
            description.value = t.description || '';
            completed.checked = Boolean(t.completed);
        };
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
        pane.appendChild(table(['Entry@No', 'Transaction@Date',
            'Employee@Clock No', 'Employee@Name', 'Shift', 'Shift@Type',
            'Pay Rate', 'Work Order', 'Sub ID', 'Seq No', 'Resource ID',
            'Type', 'Completed', 'Clock In', 'Clock Out', '#Hours',
            '#Labor@Allocation %', '#Cumulative', '#Completed Qty',
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
                    td(PAY_NAME[t.pay_rate] || ''),
                    td(t.number), td(t.sub), td(t.seq), td(t.resource),
                    td(TYPE_NAME[t.type]),
                    td(yes(t.completed)), td(t.clock_in), td(t.clock_out),
                    numTd(t.hours), numTd(t.labor_percent),
                    numTd(cumulative), numTd(t.completed_qty),
                    numTd(t.deviated_qty), td(t.description), td(t.reason),
                    moneyTd(t.labor_cost), moneyTd(t.burden_cost)));
            });
            if (!posted.length) {
                emptyRow(tbody, 24, 'Nothing posted yet.');
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
                pay_rate: payRate.value || null,
                resource: resource.value(),
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
                reasonDesc.textContent = '';
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

    function reversalTab(pane, allowed, onedit) {
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
        /* Edit: reverse the ticket and post it again corrected (a saved
         * ticket's cost is in the work order: it is never changed) */
        var editButton = el('button', {type: 'button', hidden: !allowed.post,
            onclick: doEdit}, 'Edit');
        pane.appendChild(el('div.panel', el('div.sf-head', radios, selector,
            el('div.sf-checks', byDate.node, from, el('span', 'To'), to),
            el('button', {type: 'button', onclick: show}, 'Show')),
            el('div.toolbar', editButton, reverse)));
        pane.appendChild(table(['', 'Transaction Date', '#Completed Qty',
            'Work Order ID', 'Seq No', 'Clock No', 'Name', 'Shift',
            'Shift Type', 'Resource ID', 'Type', '#Hours',
            '#Labor Allocation %', 'Reversing', 'Clock In', 'Clock Out',
            'Description', '#Deviated Qty', 'Reason Code ID'], tbody));

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
                    td(t.shift_no), td(SHIFT_NAME[t.shift_type]),
                    td(t.resource), td(TYPE_NAME[t.type]), numTd(t.hours),
                    numTd(t.labor_percent), td(yes(t.reversing)),
                    td(t.clock_in), td(t.clock_out), td(t.description),
                    numTd(t.deviated_qty), td(t.reason));
                tbody.appendChild(tr);
            });
            if (!rows.length) {
                emptyRow(tbody, 19, 'Choose the labor to show, then Show.');
            }
        }
        render();

        function doEdit() {
            var chosen = rows.filter(function (r) {
                return r.selected;
            });
            if (chosen.length !== 1) {
                UI.toast('Click the one labor line to edit first', 'error');
                return;
            }
            var t = chosen[0].t;
            UI.confirm('Labor Edit', 'Edit reverses this labor ticket; ' +
                'post it again corrected on the Labor Entry tab. Labor ' +
                'tickets can only be reversed once. Continue?').then(
                function (ok) {
                    if (!ok) {
                        return;
                    }
                    Rpc.desk('sf_labor_reverse', [[t.id]]).then(function () {
                        show();
                        onedit(t);
                    }, failed);
                });
        }

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
        /* Clock In Date / To and Calculate Hours Worked for Running
         * Tickets (Jobshop's selection row) */
        var dateFrom = el('input', {type: 'date', 'aria-label':
            'Clock In Date'});
        var dateTo = el('input', {type: 'date', 'aria-label': 'To'});
        var calcHours = check('Calculate Hours Worked for Running Tickets',
            true, function () {
                render();
            });
        var dates = el('div.ldc-filter', el('label', 'Clock In Date ',
            dateFrom), el('label', 'To ', dateTo), calcHours.node,
            el('button', {type: 'button', onclick: function () {
                load();
            }}, 'Show'));
        var tbody = el('tbody');
        var buttons = {};
        var bar = el('div.ldc-buttons');
        main.appendChild(el('div.panel', el('div.ldc-scan',
            el('label', 'Employee Clock No '), badge, showButton), who,
            filter, dates));
        main.appendChild(bar);
        main.appendChild(el('div.ldc-legend',
            el('span', el('i', {style: {background: '#dff3dc'}}),
                'In progress'),
            el('span', el('i', {style: {background: '#fff4c2'}}),
                'Suspended'),
            el('span', el('i', {style: {background: 'var(--paper)'}}),
                'Post on Save')));
        main.appendChild(table(['', '#Entry@No', 'Susp-@ended',
            'Post@on Save', 'Employee@Clock No', 'Employee@Name', 'Shift',
            'Shift@Type', 'Work Order', 'Sub ID', 'Seq No', 'Resource ID',
            'Type', 'Clock In', 'Clock Out', '#Hours@Worked',
            '#Labor@Allocation %', '#Completed@Qty', '#Deviated@Qty',
            'Completed', 'Description', 'Reason Code@ID', '#Total@Est Hours',
            '#Total Hours@Worked'], tbody));

        /* Jobshop's buttons (+ Delete = the Del key, Clear = %CLEAR);
         * Close = done with this employee */
        [['Start', start], ['Edit', edit], ['Suspend', function () {
            post(true);
        }], ['Resume', resume], ['Post', function () {
            post(false);
        }], ['Save', save], ['Close', function () {
            state.employee = null;
            renderWho();
            load();
            badge.focus();
        }], ['Delete', remove], ['Clear', clear]].forEach(
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
            if (!String(value || '').trim()) {
                UI.toast('Scan or type the clock number first.');
                badge.focus();
                return;
            }
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
            var o = {kind: state.kind, from_date: dateFrom.value || null,
                to_date: dateTo.value || null};
            if (state.kind === 'employee') {
                o.employee = state.employee ? state.employee.id : -1;
            } else if (state.kind === 'work_order') {
                o.production = state.filterValue || -1;
            } else if (state.kind === 'resource') {
                o.resource = state.filterValue || -1;
            } else if (state.kind === 'date') {
                o.from_date = state.filterValue;
                o.to_date = dateTo.value || null;
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

        /* Hours of a running ticket: clock in to now (Calculate Hours
         * Worked for Running Tickets) */
        function runningHours(t) {
            if (t.state !== 'active' || !calcHours.box.checked ||
                    !t.clock_in) {
                return t.hours;
            }
            var since = new Date(t.clock_in.replace(' ', 'T'));
            return Math.max(0, Math.round((Date.now() - since) / 36000) /
                100);
        }

        function render() {
            UI.clear(tbody);
            state.rows.forEach(function (row, index) {
                var t = row.t;
                tbody.appendChild(el('tr.' + t.state + (row.selected ?
                    '.selected' : ''), {onclick: function () {
                        row.selected = !row.selected;
                        render();
                    }, title: t.operation || ''},
                    el('td.row-head', row.selected ? '▶' : ''),
                    numTd(index + 1), td(yes(t.state === 'suspended')),
                    td(yes(t.state === 'posted')), td(t.clock_no),
                    td(t.name), td(t.shift_no), td(SHIFT_NAME[t.shift_type]),
                    td(t.number), td(t.number ? t.sub : ''), td(t.seq),
                    td(t.resource), td(TYPE_NAME[t.type]), td(t.clock_in),
                    td(t.clock_out), numTd(runningHours(t)),
                    numTd(t.labor_percent), numTd(t.completed_qty),
                    numTd(t.deviated_qty), td(yes(t.completed)),
                    td(t.description), td(t.reason), numTd(t.est_hours),
                    numTd(t.total_hours)));
            });
            if (!state.rows.length) {
                emptyRow(tbody, 24, state.kind === 'employee' &&
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
            buttons.Close.hidden = !state.employee;
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
            if (c === 'CLOSE') {
                buttons.Close.click();
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
            /* WO Spec... / Seq Spec...: the work order's and the
             * operation's instructions (drawings: engineering area) */
            var specs = el('div.toolbar.wide',
                el('button', {type: 'button', onclick: function () {
                    var w = ops.current();
                    UI.modal('Seq Spec', [el('pre', {style: {whiteSpace:
                        'pre-wrap'}}, w && w.instructions ? w.instructions :
                        'No specification.')]);
                }}, 'Seq Spec...'));
            details('Labor Entry Details', [
                roField('Employee Clock No', state.employee.clock_no),
                roField('Name', state.employee.name),
                field('Shift No', shiftNo), field('Shift Type', shiftType),
                field('Work Order Operation (scan)', scan, 'wide'),
                field('Work/Lot/Split', wo), field('Sub/Seq', ops.node),
                el('div.wide', info), specs, field('Type', type),
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

    /* Employee Clock In/Clock Out (File menu) and Tools > Edit Ticket...:
     * one attendance ticket; ondone(row) after the save */
    function clockDialog(ticket, ondone) {
        var t = ticket || {};
        var employeeDesc = el('span.sf-desc', t.name || '');
        var employee = employeePicker(function (r) {
            employeeDesc.textContent = employeeName(r);
            if (r && r.shift_no) {
                shiftNo.value = r.shift_no;
            }
        });
        if (t.employee) {
            employee.set(t.employee, t.clock_no);
        }
        var shiftNo = el('select', {'aria-label': 'Shift No'},
            ['1', '2', '3'].map(function (n) {
                return el('option', {value: n}, n);
            }));
        shiftNo.value = text(t.shift_no || 1);
        var clockIn = dateTimeInput(t.id ? t.clock_in : now(), 'Clock In');
        var clockOut = dateTimeInput(t.clock_out, 'Clock Out');
        function reason(id, name) {
            var p = UI.picker('nline.reason_code', {label:
                'Early/Late Reason Code', placeholder: 'Reason Code'});
            if (id) {
                p.set(id, name);
            }
            return p;
        }
        var inReason = reason(t.in_reason_code, t.in_reason);
        var outReason = reason(t.out_reason_code, t.out_reason);
        var approved = el('input', {type: 'checkbox', checked:
            Boolean(t.approved), 'aria-label': 'Approved'});
        var exported = el('input', {type: 'checkbox', checked:
            Boolean(t.exported), 'aria-label': 'Exported'});
        var notes = el('textarea', {rows: 4, 'aria-label': 'Notes'},
            t.notes || '');
        UI.modal('Employee Clock In/Clock Out', [el('div.sf-form',
            field('Emp Clock No', employee), employeeDesc,
            field('Shift No', shiftNo), el('div'),
            field('Clock In', clockIn),
            field('Early/Late Reason Code', inReason),
            field('Clock Out', clockOut),
            field('Early/Late Reason Code', outReason),
            el('label.check', approved, ' Approved'),
            roField('Hours Worked', qty(t.hours)),
            roField('Approved By', t.approved_by),
            el('label.check', exported, ' Exported'),
            roField('Approved On', t.approved_date),
            roField('Exported Date', UI.date(t.exported_date)),
            field('Notes', notes, 'wide'))], [
            {label: 'Cancel'},
            {label: 'OK', primary: true, onclick: function () {
                if (!employee.value()) {
                    UI.toast('Choose the employee first', 'error');
                    return true;
                }
                Rpc.desk('sf_attendance_save', [{id: t.id || null,
                    employee: employee.value(), shift_no: shiftNo.value,
                    clock_in: dateTimeValue(clockIn),
                    clock_out: dateTimeValue(clockOut),
                    in_reason_code: inReason.value(),
                    out_reason_code: outReason.value(),
                    approved: approved.checked, exported: exported.checked,
                    notes: notes.value}]).then(function (row) {
                        UI.toast('Attendance ticket saved', 'ok');
                        if (ondone) {
                            ondone(row);
                        }
                    }, failed);
            }}]);
    }

    /* Tools > Who is In/Out... */
    function whoIsIn() {
        Rpc.desk('sf_who_is_in', []).then(function (list) {
            var body = el('tbody');
            list.forEach(function (r) {
                body.appendChild(el('tr', td(r.status), td(r.absence),
                    td(r.clock_no), td(r.name), td(r.shift_no),
                    td(r.shift_start), td(''), td(r.clock_in),
                    td(r.clock_out)));
            });
            if (!list.length) {
                emptyRow(body, 9, 'No employee.');
            }
            UI.modal('Who Is In/Out', [el('div.sf-dialog-grid', table([
                'Status', 'Absence Code', 'Employee Clock No',
                'Employee Name', 'Shift No', 'Shift Start',
                'Shift Start Grace', 'Clock In', 'Clock Out'], body))]);
        }, failed);
    }

    /* The attendance grid of Time and Attendance (all employees) and of
     * an employee's Attendance History tab */
    var SHOW_TICKETS = [['30', 'Last 30 Days'], ['60', 'Last 60 Days'],
        ['90', 'Last 90 Days'], ['120', 'Last 120 Days'], ['180',
            'Last 180 Days'], ['not_approved', 'Not Approved'],
        ['all', 'All']];

    function attendanceGrid(pane, options) {
        var a = options.access;
        var rows = [];
        var show = select(SHOW_TICKETS, '30', 'Show Tickets');
        var labor = check('Get Reported Labor Hours Worked for Attendance ' +
            'Tickets', false, load);
        show.addEventListener('change', load);
        var tbody = el('tbody');
        var head = [['approved', "Appr'd", 'yes'], ['transaction_date',
            'Transaction@Date', 'date']];
        if (!options.employee) {
            head.push(['clock_no', 'Employee@Clock No'], ['name',
                'Employee@Name'], ['title', 'Employee@Title']);
        }
        head.push(['shift_no', 'Shift@No'], ['shift_start', 'Shift Start'],
            ['start_grace', '#Start Grace@(mins)'], ['clock_in', 'Clock In'],
            ['in_reason', 'Started Late@Reason Code'], ['shift_end',
                'Shift End'], ['end_grace', '#End Grace@(mins)'],
            ['clock_out', 'Clock Out'], ['out_reason',
                'Left Early/Late@Reason Code'], ['hours', '#Hours@Worked',
                'num']);
        if (!options.employee) {
            head.push(['labor_hours', '#Labor Hrs@Worked', 'num']);
        }
        head.push(['approved_by', 'Approved By'], ['approved_date',
            'Approved On'], ['exported', 'Exported', 'yes'],
            ['exported_date', 'Exported@Date', 'date'], ['has_notes',
                'Has@Notes', 'yes']);
        pane.appendChild(el('div.sf-checks', field('Show Tickets', show),
            options.employee ? null : labor.node));
        pane.appendChild(el('div.sf-dialog-grid', table([''].concat(
            head.map(function (h) {
                return h[1];
            })), tbody)));

        function load() {
            Rpc.desk('sf_attendance', [{show: show.value, employee:
                options.employee || null, labor_hours: labor.box.checked}])
                .then(function (list) {
                    rows = list.map(function (r) {
                        return {r: r, selected: false};
                    });
                    render();
                }, failed);
        }

        function render() {
            UI.clear(tbody);
            rows.forEach(function (row) {
                var r = row.r;
                tbody.appendChild(el('tr' + (row.selected ? '.selected' : ''),
                    {onclick: function () {
                        row.selected = !row.selected;
                        render();
                    }, ondblclick: function () {
                        if (a.write) {
                            clockDialog(r, load);
                        }
                    }, oncontextmenu: function (event) {
                        if (!row.selected) {
                            rows.forEach(function (x) {
                                x.selected = x === row;
                            });
                            render();
                        }
                        menu(event, row);
                    }}, el('td.row-head', row.selected ? '▶' : ''),
                    head.map(function (h) {
                        var v = r[h[0]];
                        return h[2] === 'yes' ? td(yes(v)) : h[2] === 'num' ?
                            numTd(v) : h[2] === 'date' ? td(UI.date(v)) :
                            td(v);
                    })));
            });
            if (!rows.length) {
                emptyRow(tbody, head.length + 1, 'No attendance ticket.');
            }
        }

        function selected() {
            return rows.filter(function (r) {
                return r.selected;
            });
        }

        /* Jobshop's PopupAttendance / PopupAttendanceHistory */
        function menu(event, row) {
            var items = [];
            if (a.write) {
                items.push({label: 'Approve Ticket(s)', onclick: approve},
                    {label: 'Edit Ticket...', onclick: function () {
                        clockDialog(row.r, load);
                    }});
            }
            items.push({label: 'View Notes...', onclick: function () {
                UI.modal('Notes', [el('pre', {style: {whiteSpace:
                    'pre-wrap'}}, row.r.notes || 'No notes.')]);
            }});
            if (!options.employee && options.labor) {
                items.push('-', {label: 'Labor Txs', onclick: function () {
                    UI.openScreen('labor');
                }});
            }
            UI.contextMenu(event, items);
        }

        function approve() {
            var ids = selected().map(function (r) {
                return r.r.id;
            });
            if (!ids.length) {
                return;
            }
            Rpc.desk('sf_attendance_approve', [ids]).then(function () {
                UI.toast('Ticket(s) approved', 'ok');
                load();
            }, failed);
        }

        load();
        return {load: load, approve: approve, edit: function () {
            var row = selected()[0];
            if (row) {
                clockDialog(row.r, load);
            }
        }};
    }

    /* Time and Attendance (route time-attendance) */
    Screens.jsTimeAttendance = function (main) {
        style();
        rights(['nline.js.employee_time']).then(function (r) {
            var a = r['nline.js.employee_time'];
            var grid = null;
            var extra = [];
            if (a.create) {
                extra.push({label: 'Employee Clock In/Out...', title:
                    'File > Employee Clock In/Out', onclick: function () {
                        clockDialog(null, function () {
                            grid.load();
                        });
                    }});
            }
            if (a.write) {
                extra.push({label: 'Approve Ticket(s)', onclick: function () {
                    grid.approve();
                }}, {label: 'Edit Ticket...', onclick: function () {
                    grid.edit();
                }});
            }
            extra.push({label: 'Who is In/Out...', onclick: whoIsIn},
                {label: 'Refresh', title: 'Refresh (F5)', onclick:
                    function () {
                        grid.load();
                    }});
            var form = UI.form(main, {title: 'Time and Attendance',
                extra: extra});
            grid = attendanceGrid(form.body, {access: a, labor: true});
            shortcuts(form.body, {refresh: grid.load});
        });
    };

    /* Employees: Jobshop's list (Clock No, Name, Title, Phone, Shift No,
     * Inactive); Tools > Add Employee... / Edit Employee... (and a
     * double-click) open the Employees window of one employee */
    Screens.jsEmployees = function (main, params) {
        style();
        if (params && params[0] !== undefined && params[0] !== null) {
            /* employees/0: Add Employee */
            employeeWindow(main, parseInt(params[0], 10));
            return;
        }
        var a = {write: false, create: false};
        var rows = [];
        var chosen = null;
        var showInactive = check('Show Inactive', true, load);
        var tbody = el('tbody');
        rights(['company.employee', 'nline.js.employee_time']).then(
            function (r) {
                a = r['company.employee'];
                var t = r['nline.js.employee_time'];
                var extra = [];
                if (t.create) {
                    extra.push({label: 'Employee Clock In/Out...', onclick:
                        function () {
                            clockDialog(null);
                        }});
                }
                if (a.create) {
                    extra.push({label: 'Add Employee...', onclick:
                        function () {
                            UI.openScreen('employees/0');
                        }});
                }
                extra.push({label: 'Edit Employee...', onclick: function () {
                    if (chosen) {
                        UI.openScreen('employees/' + chosen.id);
                    } else {
                        UI.toast('Click an employee first', 'error');
                    }
                }}, {label: 'Refresh', title: 'Refresh (F5)', onclick:
                    load});
                var form = UI.form(main, {title: 'Employees', extra: extra});
                form.body.appendChild(el('div.sf-checks', showInactive.node));
                form.body.appendChild(table(['Clock No', 'Name', 'Title',
                    'Phone', '#Shift No', 'Inactive'], tbody));
                shortcuts(form.body, {refresh: load});
                load();
            });

        function load() {
            Rpc.desk('sf_employees', [showInactive.box.checked]).then(
                function (list) {
                    rows = list;
                    render();
                }, failed);
        }

        function render() {
            UI.clear(tbody);
            rows.forEach(function (e) {
                var tr = el('tr' + (chosen && chosen.id === e.id ?
                    '.selected' : ''), {title: 'Double-click: Edit Employee',
                    onclick: function () {
                        chosen = e;
                        render();
                    }, ondblclick: function () {
                        UI.openScreen('employees/' + e.id);
                    }, oncontextmenu: function (event) {
                        chosen = e;
                        render();
                        UI.contextMenu(event, [{label: 'Edit Employee...',
                            onclick: function () {
                                UI.openScreen('employees/' + e.id);
                            }}]);
                    }}, td(e.clock_no), td(e.name), td(e.title),
                    td(e.phone), numTd(e.shift_no), td(yes(e.inactive)));
                tbody.appendChild(tr);
            });
            if (!rows.length) {
                emptyRow(tbody, 6, 'No employee.');
            }
        }
    };
    Screens.employees = Screens.jsEmployees;

    /* The Employees window of one employee (Jobshop's EmployeeDetail):
     * Employee (with the picture), Calendars, Attendance History, Notes,
     * Browse */
    var CAL_WEEK = 'nline.js.calendar.week';
    var CAL_CHANGE = 'nline.js.calendar.change';

    function timeText(v) {
        return v ? String(v).slice(0, 5) : '';
    }

    function timeValue(input) {
        if (!input.value) {
            return null;
        }
        var p = input.value.split(':');
        return {__class__: 'time', hour: parseInt(p[0], 10), minute:
            parseInt(p[1], 10), second: 0, microsecond: 0};
    }

    function numInput(value, label) {
        return el('input.money', {type: 'text', 'aria-label': label,
            value: value === null || value === undefined ? '' : String(value)});
    }

    function numValue(input) {
        return input.value === '' ? null : parseNum(input.value);
    }

    /* Jobshop's Calendars tab (EmployeeDetailSubTabs): the employee's
     * weekly calendar (one row per day; Add Calendar / Delete Calendar)
     * beside its exceptions. The changes are kept here and written by the
     * window's Save (cal.save) */
    function employeeCalendars(pane, record, access, cal) {
        var weekRows = [];      /* {day, id, start, s1, s2, s3} */
        var weekGone = [];      /* ids of a deleted calendar */
        var changeRows = [];
        var changeGone = [];
        var weekBody = el('tbody');
        var changeBody = el('tbody');
        var editable = access.week && access.change;

        function weekRow(day, r) {
            r = r || {};
            var row = {day: day[0], id: r.id || null,
                start: el('input', {type: 'time', 'aria-label':
                    '1st Shift Start', value: timeText(r.start_of_day)}),
                s1: numInput(r.shift_1, 'Shift 1 Dur'),
                s2: numInput(r.shift_2, 'Shift 2 Dur'),
                s3: numInput(r.shift_3, 'Shift 3 Dur')};
            ['start', 's1', 's2', 's3'].forEach(function (k) {
                row[k].disabled = !editable;
            });
            weekRows.push(row);
            weekBody.appendChild(el('tr', td(day[1]), el('td', row.start),
                el('td', row.s1), el('td', row.s2), el('td', row.s3)));
        }

        /* The seven days always shown: an employee without a calendar of
         * his own works the shop's (Add Calendar copies it here) */
        function drawWeek(records) {
            var byDay = {};
            records.forEach(function (r) {
                byDay[r.day_of_week] = r;
            });
            UI.clear(weekBody);
            weekRows = [];
            DAYS.forEach(function (d) {
                weekRow(d, byDay[d[0]]);
            });
        }

        function changeRow(r) {
            r = r || {};
            var related = r['reason_code.'] || {};
            var desc = el('span.sf-desc', related.description || '');
            var reason = UI.picker('nline.reason_code', {label: 'Reason Code',
                placeholder: '', domain: [['reason_type', 'in', [null,
                    'calendar']]], fields: ['description'],
                onselect: function (x) {
                    desc.textContent = x ? x.description || '' : '';
                }});
            if (r.reason_code) {
                reason.set(r.reason_code, related.rec_name ||
                    String(r.reason_code));
            }
            var row = {id: r.id || null, reason: reason,
                from: el('input', {type: 'date', 'aria-label': 'Start Date',
                    value: r.start_date || ''}),
                to: el('input', {type: 'date', 'aria-label': 'End Date',
                    value: r.end_date || ''}),
                start: el('input', {type: 'time', 'aria-label':
                    '1st Shift Start', value: timeText(r.start_of_day)}),
                s1: numInput(r.shift_1, 'Shift 1 Dur'),
                s2: numInput(r.shift_2, 'Shift 2 Dur'),
                s3: numInput(r.shift_3, 'Shift 3 Dur')};
            ['from', 'to', 'start', 's1', 's2', 's3'].forEach(function (k) {
                row[k].disabled = !editable;
            });
            reason.input.disabled = !editable;
            var tr = el('tr', {onclick: function () {
                changeRows.forEach(function (x) {
                    x.tr.classList.toggle('selected', x === row);
                });
            }}, el('td', row.from), el('td', row.to), el('td', row.start),
                el('td', row.s1), el('td', row.s2), el('td', row.s3),
                el('td', reason.node), el('td', desc));
            row.tr = tr;
            changeRows.push(row);
            changeBody.appendChild(tr);
            return row;
        }

        function load() {
            Promise.all([
                Rpc.searchRead(CAL_WEEK, [['employee', '=', record.id]],
                    ['day_of_week', 'start_of_day', 'shift_1', 'shift_2',
                        'shift_3']),
                Rpc.searchRead(CAL_CHANGE, [['employee', '=', record.id]],
                    ['start_date', 'end_date', 'start_of_day', 'shift_1',
                        'shift_2', 'shift_3', 'reason_code',
                        'reason_code.rec_name', 'reason_code.description'],
                    {order: [['start_date', 'ASC']]})
            ]).then(function (r) {
                drawWeek(r[0]);
                UI.clear(changeBody);
                changeRows = [];
                r[1].forEach(changeRow);
            }, failed);
        }

        /* Add Calendar: the shop's calendar (no resource, no employee) as
         * the employee's own; Delete Calendar: back to the shop's */
        function addCalendar() {
            Rpc.searchRead(CAL_WEEK, [['resource', '=', null], ['employee',
                '=', null]], ['day_of_week', 'start_of_day', 'shift_1',
                'shift_2', 'shift_3']).then(function (shop) {
                    var byDay = {};
                    shop.forEach(function (r) {
                        byDay[r.day_of_week] = r;
                    });
                    weekRows.forEach(function (row) {
                        var s = byDay[row.day];
                        if (row.start.value || row.s1.value ||
                                row.s2.value || row.s3.value) {
                            return;
                        }
                        /* (no shop calendar: 8 hours Monday to Friday) */
                        row.start.value = s ? timeText(s.start_of_day) :
                            '07:00';
                        row.s1.value = s ? text(s.shift_1) : row.day === '0' ||
                            row.day === '1' ? '0' : '8';
                        row.s2.value = s ? text(s.shift_2) : '';
                        row.s3.value = s ? text(s.shift_3) : '';
                    });
                }, failed);
        }

        function deleteCalendar() {
            weekRows.forEach(function (row) {
                if (row.id) {
                    weekGone.push(row.id);
                    row.id = null;
                }
                row.start.value = row.s1.value = row.s2.value =
                    row.s3.value = '';
            });
        }

        function deleteException() {
            var row = changeRows.filter(function (x) {
                return x.tr.classList.contains('selected');
            })[0];
            if (!row) {
                UI.toast('Click the exception to delete first', 'error');
                return;
            }
            if (row.id) {
                changeGone.push(row.id);
            }
            changeRows.splice(changeRows.indexOf(row), 1);
            row.tr.remove();
        }

        cal.save = function (employeeId) {
            if (!editable || employeeId !== record.id) {
                return Promise.resolve();
            }
            var calls = [];
            var create = [];
            weekRows.forEach(function (row) {
                var v = {start_of_day: timeValue(row.start), shift_1:
                    numValue(row.s1), shift_2: numValue(row.s2), shift_3:
                    numValue(row.s3)};
                var empty = v.start_of_day === null && v.shift_1 === null &&
                    v.shift_2 === null && v.shift_3 === null;
                if (row.id && empty) {
                    weekGone.push(row.id);
                } else if (row.id) {
                    calls.push(Rpc.model(CAL_WEEK, 'write', [[row.id], v]));
                } else if (!empty) {
                    create.push(Object.assign({employee: employeeId,
                        day_of_week: row.day}, v));
                }
            });
            if (create.length) {
                calls.push(Rpc.model(CAL_WEEK, 'create', [create]));
            }
            if (weekGone.length) {
                calls.push(Rpc.model(CAL_WEEK, 'delete', [weekGone]));
            }
            var newChanges = [];
            var missing = false;
            changeRows.forEach(function (row) {
                var v = {start_date: row.from.value ? Rpc.date(
                    row.from.value) : null, end_date: row.to.value ?
                    Rpc.date(row.to.value) : null, start_of_day: timeValue(
                    row.start), shift_1: numValue(row.s1), shift_2:
                    numValue(row.s2), shift_3: numValue(row.s3),
                    reason_code: row.reason.value()};
                if (!row.id && !v.start_date && !v.end_date) {
                    return;
                }
                if (!v.start_date || !v.end_date) {
                    missing = true;
                } else if (row.id) {
                    calls.push(Rpc.model(CAL_CHANGE, 'write', [[row.id], v]));
                } else {
                    newChanges.push(Object.assign({employee: employeeId}, v));
                }
            });
            if (missing) {
                UI.toast('A calendar exception without its Start Date and ' +
                    'End Date was not saved', 'error');
            }
            if (newChanges.length) {
                calls.push(Rpc.model(CAL_CHANGE, 'create', [newChanges]));
            }
            if (changeGone.length) {
                calls.push(Rpc.model(CAL_CHANGE, 'delete', [changeGone]));
            }
            return Promise.all(calls);
        };

        var left = el('div.sf-cal-week', el('div.sf-cal-title',
            'Employee Calendar'), table(['Day of Week', '1st Shift Start',
            '#Shift 1@Dur', '#Shift 2@Dur', '#Shift 3@Dur'], weekBody),
            editable ? el('div.toolbar', el('button', {type: 'button',
                onclick: addCalendar}, 'Add Calendar'), el('button', {type:
                'button', onclick: deleteCalendar}, 'Delete Calendar')) :
                null);
        var right = el('div.sf-cal-changes', el('div.sf-cal-title',
            'Employee Calendar Exceptions'), table(['Start Date', 'End Date',
            '1st Shift Start', '#Shift 1@Dur', '#Shift 2@Dur', '#Shift 3@Dur',
            'Reason Code', 'Description'], changeBody),
            editable ? el('div.toolbar', el('button', {type: 'button',
                onclick: function () {
                    changeRow(null).from.focus();
                }}, 'Add Exception'), el('button', {type: 'button',
                onclick: deleteException}, 'Delete Exception')) : null);
        pane.appendChild(el('div.sf-cal', left, right));
        drawWeek([]);
        load();
    }

    /* The Picture tab's pane drawn in the Employee tab where Jobshop has
     * its picture box (EmployeeDetail PICTURE 595,119-724,221, caption at
     * 505,119); its tab button is hidden */
    function pictureOnFirstTab(main) {
        var first = masterTab(main, 'Employee');
        var pic = masterTab(main, 'Picture');
        var layout = first && first.pane.querySelector('.js-layout');
        if (!pic || !layout) {
            return;
        }
        function at(a) {
            return {left: 'calc(var(--u) * ' + a[0] + ')', top:
                'calc(var(--u) * ' + a[1] + ')', width: 'calc(var(--u) * ' +
                (a[2] - a[0]) + ')', height: 'calc(var(--u) * ' +
                (a[3] - a[1]) + ')'};
        }
        layout.appendChild(el('div.js-ctl', {style: at([505, 119, 585,
            139])}, el('span.sf-cap', 'Picture')));
        /* (a stand-in keeps the tab panes in step with the tab buttons) */
        var stand = el('div.tab-pane.panel', {hidden: true});
        pic.pane.parentNode.replaceChild(stand, pic.pane);
        pic.pane.className = 'sf-picture';
        pic.pane.hidden = false;
        pic.pane.removeAttribute('role');
        Object.assign(pic.pane.style, at([595, 119, 724, 221]));
        pic.pane.title = 'Right-click: Insert / Clear Picture';
        layout.appendChild(pic.pane);
        pic.button.hidden = true;
        pic.button.classList.remove('tab');
    }

    function employeeWindow(main, id) {
        var user = {type: 'many2one', model: 'res.user', readonly: true};
        var timeAccess = {write: false};
        var calAccess = {week: false, change: false};
        var cal = {};
        var ready = rights(['nline.js.employee_time', CAL_WEEK, CAL_CHANGE])
            .then(function (r) {
                timeAccess = r['nline.js.employee_time'];
                calAccess = {week: r[CAL_WEEK].write && r[CAL_WEEK].create &&
                    r[CAL_WEEK].delete, change: r[CAL_CHANGE].write &&
                    r[CAL_CHANGE].create && r[CAL_CHANGE].delete};
            });
        var first = null;
        UI.master(main, {
            title: 'Employees',
            model: 'company.employee',
            label: 'Clock No.',
            idAt: [19, 4, 259, 24],
            idSplit: 93,
            idField: 'clock_no',
            idLength: 15,
            order: [['clock_no', 'ASC']],
            open: id || null,
            defaults: {company: Rpc.context().company},
            /* (a new employee's person is made by the server) */
            beforeSave: function (values) {
                /* Shift No is Jobshop's drop-down list (1, 2, 3) */
                if (values.shift_no !== undefined) {
                    values.shift_no = values.shift_no ? parseInt(
                        values.shift_no, 10) : null;
                }
                return values;
            },
            /* The Calendars tab's changes go with the window's Save */
            afterSave: function (newId) {
                return cal.save ? cal.save(newId) : null;
            },
            onload: function (record) {
                stamps(record);
            },
            tabs: [
                {title: 'Employee', frames: [
                    {label: 'Labor Costs', at: [11, 222, 850, 267]},
                    {label: 'Burden Costs', at: [12, 270, 851, 318]}
                ], fields: [
                    {name: 'shift_no', at: [278, 4, 395, 24], split: 57, label: 'Shift No',
                        type: 'selection', options: [['1', '1'], ['2', '2'],
                            ['3', '3']], default: '1'},
                    {name: 'inactive', at: [432, 4, 495, 24], split: 100, label: 'Inactive', type: 'boolean',
                        default: false},
                    Object.assign({name: 'create_uid', at: [505, 4, 841, 24], split: 90, label: 'Created by'},
                        user),
                    {name: 'employee_name', at: [19, 26, 495, 46], split: 93, label: 'Name', type: 'char',
                        span: 3},
                    Object.assign({name: 'write_uid', at: [505, 26, 841, 46], split: 90,
                        label: 'Last Modified by'}, user),
                    {name: 'title', at: [19, 48, 495, 68], split: 93, label: 'Title', type: 'char', span: 3},
                    {name: 'phone', at: [505, 48, 841, 68], split: 90, label: 'Phone', type: 'char'},
                    {name: 'addr_1', at: [19, 70, 495, 90], split: 93, label: 'Address', type: 'char', span: 3},
                    {name: 'mobile', at: [505, 70, 841, 90], split: 90, label: 'Mobile', type: 'char'},
                    /* (Jobshop's second address line has no caption) */
                    {name: 'addr_2', at: [19, 92, 495, 112], split: 93, label: ' ', type: 'char',
                        span: 3},
                    {name: 'email', at: [505, 92, 841, 112], split: 90, label: 'E-mail', type: 'char'},
                    {name: 'city', at: [19, 114, 495, 134], split: 93, label: 'City', type: 'char', span: 3},
                    {name: 'state', at: [19, 136, 302, 156], split: 93, label: 'State/Postal', type: 'char'},
                    {name: 'postal_code', at: [306, 136, 495, 156], split: 0, label: 'Postal', type: 'char'},
                    {name: 'country', at: [19, 158, 495, 178], split: 93, label: 'Country', type: 'char'},
                    {name: 'addr_etc', at: [19, 180, 495, 200], split: 93, label: 'Etc.', type: 'char', span: 3},
                    {name: 'start_date', at: [19, 202, 238, 222], split: 93, label: 'Hire Date', type: 'date'},
                    {name: 'end_date', at: [279, 202, 489, 222], split: 93, label: 'Termination Date',
                        type: 'date'},
                    {name: 'cost_per_hr', at: [19, 242, 203, 262], split: 105, label: 'Base Cost Per Hr',
                        type: 'decimal'},
                    {name: 'setup_cost_per_hr', at: [225, 242, 409, 262], split: 94, label: 'Setup Cost Per Hr',
                        type: 'decimal'},
                    {name: 'run_cost_per_hr', at: [431, 242, 615, 262], split: 105, label: 'Run Cost Per Hr',
                        type: 'decimal'},
                    {name: 'cost_per_unit', at: [637, 242, 821, 262], split: 94, label: 'Cost Per Unit',
                        type: 'decimal'},
                    {name: 'bur_per_hr_setup', at: [20, 290, 204, 310], split: 105, label: 'Burden/Hour (setup)',
                        type: 'decimal'},
                    {name: 'bur_percent_setup', at: [206, 290, 301, 310], split: 50, label: 'Percent',
                        type: 'decimal', help: 'Burden percent of the setup labor'},
                    {name: 'bur_per_hr_run', at: [325, 290, 509, 310], split: 105, label: 'Burden/Hour (run)',
                        type: 'decimal'},
                    {name: 'bur_percent_run', at: [511, 290, 606, 310], split: 50, label: 'Percent',
                        type: 'decimal', help: 'Burden percent of the run labor'},
                    {name: 'bur_per_unit_run', at: [637, 290, 821, 310], split: 105, label: 'Burden/Unit (run)',
                        type: 'decimal'}]},
                /* (Department, Supervisor and Person: not in Jobshop's
                 * window; the person is made by the server) */
                {title: 'Calendars', render: function (pane, record) {
                    ready.then(function () {
                        employeeCalendars(pane, record, calAccess, cal);
                    });
                }},
                {title: 'Attendance History', render: function (pane,
                        record) {
                    attendanceGrid(pane, {access: timeAccess, employee:
                        record.id});
                }},
                {notes: true},
                {picture: true}],
            browse: [
                {name: 'inactive', label: 'Inactive', type: 'boolean'},
                {name: 'clock_no', label: 'Clock No'},
                {name: 'employee_name', label: 'Name'},
                {name: 'shift_no', label: 'Shift No'},
                {name: 'title', label: 'Title'},
                {name: 'phone', label: 'Phone'}]
        });
        pictureOnFirstTab(main);

        /* Created by / Last Modified by: Jobshop's read-only "user date"
         * text, no lookup */
        first = masterTab(main, 'Employee');
        function stampInput(label) {
            return first && first.pane.querySelector('input[aria-label="' +
                label + '"]');
        }
        ['Created by', 'Last Modified by'].forEach(function (label) {
            var input = stampInput(label);
            var browse = input && input.closest('.picker') &&
                input.closest('.picker').querySelector('.picker-browse');
            if (browse) {
                browse.hidden = true;
            }
        });
        function stamps(record) {
            Rpc.model('company.employee', 'read', [[record.id],
                ['create_date', 'write_date']]).then(function (rows) {
                    var r = rows[0] || {};
                    [['Created by', 'create_date'], ['Last Modified by',
                        'write_date']].forEach(function (s) {
                            var input = stampInput(s[0]);
                            if (input && input.value && r[s[1]]) {
                                input.value = input.value.split('  ')[0] +
                                    '  ' + UI.date(r[s[1]]) + ' ' +
                                    String(r[s[1]]).slice(11, 16);
                            }
                        });
                }, function () {});
        }
    }

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
        [/^#\/employees\/(\d+)$/, 'jsEmployees'],
        [/^#\/time-attendance$/, 'jsTimeAttendance'],
        [/^#\/issues-bc$/, 'jsMaterialIssuesBC']);
}(window));
