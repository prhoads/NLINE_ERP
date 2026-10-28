/* N-Line Jobshop emulation: planning screens (module nline_js_planning; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * The Planning group bar: Material Planning (#/planning: Open Sales Orders,
 * Non-Stocked Parts, Outside Services, Stocked Parts, Supply & Demand) and
 * Scheduling (#/scheduling: Resource Details, Work Order Details, Schedule,
 * the scheduler, calendars, export to MS Project). Both replace the desk's
 * earlier screens of these routes and keep what they did (work orders and
 * purchases from the needs, the Gantt chart where a work order is dragged
 * to new dates). The services are nline.desk js_planning_* / js_schedule_*
 * (module nline_js_planning). What the user may not do is not shown. */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    routes.push(
        [/^#\/planning$/, 'materialPlanning'],
        [/^#\/scheduling$/, 'scheduling']);

    /* ---- Style -------------------------------------------------------- */

    function style() {
        if (document.getElementById('nl-js-planning-css')) {
            return;
        }
        document.head.appendChild(el('style#nl-js-planning-css', [
            '.pl-tabs { display: flex; gap: 2px; border-bottom: 1px solid ' +
                'var(--line); margin-bottom: 8px; flex-wrap: wrap; }',
            '.pl-tabs button { border-radius: 6px 6px 0 0; }',
            '.pl-tabs button.active { font-weight: 600; background: ' +
                'var(--paper); border-bottom-color: var(--paper); }',
            '.pl-bar { display: flex; gap: 12px; align-items: center; ' +
                'flex-wrap: wrap; margin: 4px 0 8px; }',
            '.pl-bar label { display: flex; gap: 5px; align-items: center; ' +
                'color: var(--muted); font-size: 13px; }',
            '.pl-bar .spacer { flex: 1; }',
            '.pl-filters { display: grid; grid-template-columns: repeat(' +
                'auto-fill, minmax(220px, 1fr)); gap: 6px 14px; margin: ' +
                '4px 0 8px; padding: 8px; border: 1px solid var(--line); ' +
                'border-radius: 6px; background: var(--paper); }',
            '.pl-filters label { display: flex; gap: 5px; align-items: ' +
                'center; font-size: 13px; color: var(--muted); }',
            '.pl-filters input[type=text] { width: 90px; }',
            '.pl-grid { overflow: auto; max-height: calc(100vh - 230px); ' +
                'border: 1px solid var(--line); background: var(--paper); }',
            '.pl-grid table { border-collapse: collapse; width: max-content; ' +
                'min-width: 100%; font-size: 12.5px; }',
            '.pl-grid th { position: sticky; top: 0; background: ' +
                'var(--table-head, var(--paper)); color: var(--muted); ' +
                'font-weight: 600; text-align: left; padding: 4px 6px; ' +
                'border-bottom: 1px solid var(--line); white-space: nowrap; ' +
                'cursor: pointer; user-select: none; z-index: 1; }',
            '.pl-grid th.num, .pl-grid td.num { text-align: right; }',
            '.pl-grid td { padding: 3px 6px; border-bottom: 1px solid ' +
                'var(--line); white-space: nowrap; }',
            '.pl-grid td.rh { width: 18px; color: var(--muted); ' +
                'text-align: center; }',
            '.pl-grid tr.sel td { background: var(--accent-soft); }',
            '.pl-grid tr.sel td.rh { color: var(--accent); font-weight: 700; }',
            '.pl-grid td.red { color: var(--bad); font-weight: 600; }',
            '.pl-grid td.blue { color: #1f5fbf; font-weight: 600; }',
            '.pl-grid td.msg { color: var(--bad); }',
            '.pl-grid td.empty { color: var(--muted); padding: 10px; }',
            '.pl-form { display: grid; grid-template-columns: 1fr 1fr; ' +
                'gap: 8px 14px; }',
            '.pl-form label { display: flex; flex-direction: column; ' +
                'gap: 3px; font-size: 13px; color: var(--muted); }',
            '.pl-form label.check { flex-direction: row; align-items: ' +
                'center; gap: 6px; }',
            '.pl-form .wide { grid-column: span 2; }',
            '.pl-form input[readonly] { background: var(--accent-soft); }',
            '.modal.pl-wide { max-width: 980px; }',
            '.modal.pl-mid { max-width: 680px; }',
            '.pl-head { display: flex; gap: 18px; flex-wrap: wrap; ' +
                'margin: 4px 0 8px; font-size: 13px; }',
            '.pl-head span { color: var(--muted); }',
            '.pl-head strong { color: var(--ink); }',
            /* The schedule (Gantt) */
            '.gx { position: relative; overflow: auto; height: ' +
                'calc(100vh - 250px); border: 1px solid var(--line); ' +
                'background: var(--paper); font-size: 12px; }',
            '.gx-inner { position: relative; }',
            '.gx-dates { position: sticky; top: 0; z-index: 3; height: 34px; ' +
                'background: var(--paper); border-bottom: 1px solid ' +
                'var(--line); }',
            '.gx-tick { position: absolute; top: 17px; height: 17px; ' +
                'border-left: 1px solid var(--line); padding-left: 2px; ' +
                'color: var(--muted); overflow: hidden; font-size: 11px; }',
            '.gx-day { position: absolute; top: 0; height: 17px; ' +
                'border-left: 1px solid var(--line); padding-left: 3px; ' +
                'overflow: hidden; white-space: nowrap; font-weight: 600; }',
            '.gx-day.today { background: #2f6fd0; color: #fff; }',
            '.gx-row { position: relative; border-bottom: 1px solid ' +
                'var(--line); }',
            '.gx-label { position: sticky; left: 0; z-index: 2; width: 170px; ' +
                'height: 100%; background: var(--paper); border-right: ' +
                '1px solid var(--line); padding: 3px 6px; box-sizing: ' +
                'border-box; overflow: hidden; white-space: nowrap; ' +
                'text-overflow: ellipsis; }',
            '.gx-corner { position: sticky; left: 0; z-index: 4; width: 170px; ' +
                'height: 34px; background: var(--paper); border-right: 1px ' +
                'solid var(--line); padding: 2px 6px; box-sizing: border-box; ' +
                'font-size: 11px; }',
            '.gx-cap { position: absolute; background: rgba(255,255,255,.9); ' +
                'border: 1px solid #c8d0d8; box-sizing: border-box; }',
            '.gx-grid { position: absolute; top: 0; bottom: 0; width: 0; ' +
                'border-left: 1px dotted #c8d0d8; }',
            '.gx-now { position: absolute; top: 0; bottom: 0; width: 0; ' +
                'border-left: 2px solid #2f6fd0; z-index: 1; }',
            '.gx-bar { position: absolute; height: 16px; background: #9cc8f0; ' +
                'border: 1px solid #4f8fc8; border-radius: 3px; box-sizing: ' +
                'border-box; overflow: hidden; white-space: nowrap; ' +
                'font-size: 10.5px; padding: 0 2px; color: #102030; ' +
                'cursor: default; z-index: 1; }',
            '.gx-bar.late { background: #ef8a80; border-color: #c03a2e; }',
            '.gx-bar.frozen { background: #4169e1; border-color: #2a46a0; ' +
                'color: #fff; }',
            '.gx-bar.hi { background: #f7e463; border-color: #b8a21c; }',
            '.gx-bar.det { background: #6cc66c; border-color: #2e8b2e; }',
            '.gx-bar.det.late { background: #9a9a3a; border-color: #66661c; ' +
                'color: #fff; }',
            '.gx-bar.sel { outline: 2px dashed #333; outline-offset: 1px; }',
            '.gx-want { position: absolute; height: 6px; border: 1px dashed ' +
                'var(--muted); border-radius: 3px; box-sizing: border-box; ' +
                'cursor: ew-resize; background: rgba(120,120,120,.12); }',
            '.gx-legend { display: flex; gap: 12px; flex-wrap: wrap; ' +
                'font-size: 12px; color: var(--muted); margin: 4px 0; }',
            '.gx-legend i { display: inline-block; width: 14px; height: 10px; ' +
                'border-radius: 2px; margin-right: 4px; vertical-align: ' +
                'middle; }',
            'table.pl-edit { border-collapse: collapse; font-size: 12.5px; }',
            'table.pl-edit th { text-align: left; color: var(--muted); ' +
                'padding: 3px 4px; font-weight: 600; }',
            'table.pl-edit td { padding: 2px 4px; }',
            'table.pl-edit input { width: 64px; }',
            'table.pl-edit input[type=date] { width: 130px; }',
            'table.pl-edit input[type=time] { width: 90px; }'
        ].join('\n')));
    }

    /* ---- Helpers ------------------------------------------------------ */

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function num(v) {
        if (v === null || v === undefined || v === '') {
            return '';
        }
        return String(Math.round(v * 10000) / 10000);
    }

    function dt(iso) {
        if (!iso) {
            return '';
        }
        var s = String(iso).replace('T', ' ');
        return UI.date(s.slice(0, 10)) + (s.length > 10 ? ' ' +
            s.slice(11, 16) : '');
    }

    function time(iso) {
        return new Date(String(iso).replace(' ', 'T') +
            (String(iso).length <= 10 ? 'T00:00' : '')).getTime();
    }

    function isoLocal(ms) {
        var d = new Date(ms);
        function p(n) {
            return String(n).padStart(2, '0');
        }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' +
            p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /* The last modal opened gets a wider box */
    function widen(cls) {
        var boxes = document.querySelectorAll('.modal');
        if (boxes.length) {
            boxes[boxes.length - 1].classList.add(cls || 'pl-wide');
        }
    }

    function field(label, control, cls) {
        return el('label' + (cls ? '.' + cls : ''), label, control);
    }

    function select(options, value) {
        return el('select', options.map(function (o) {
            return el('option', {value: o[0], selected: String(o[0]) ===
                String(value) || null}, o[1]);
        }));
    }

    /* The screens the user's menus open (Open Sales Order, Open Work Order,
     * ...): an option is shown only when its screen is allowed */
    function allowedScreens(names) {
        return Promise.all(names.map(function (name) {
            return UI.screenAllowed(name).catch(function () {
                return false;
            });
        })).then(function (values) {
            var result = {};
            names.forEach(function (name, i) {
                result[name] = values[i];
            });
            return result;
        });
    }

    function download(file) {
        var url = global.URL.createObjectURL(new Blob([file.content],
            {type: file.mimetype + ';charset=utf-8'}));
        var a = el('a', {href: url, download: file.filename});
        document.body.appendChild(a);
        a.click();
        a.remove();
        global.setTimeout(function () {
            global.URL.revokeObjectURL(url);
        }, 2000);
    }

    /* ---- The Jobshop grid --------------------------------------------- */

    /* grid(columns [{key, label, type: num|date|dt|check|text, cls(row)}],
     * {id, menu(event, rows), open(row), empty, onselect(rows)}): click a
     * row (Ctrl, Shift for several), click a column header to sort (Shift:
     * descending), right-click for the options of the section */
    function grid(columns, options) {
        var rows = [];
        var selected = {};
        var anchor = null;
        var sort = null;
        var desc = false;
        var head = el('tr', el('th', ''), columns.map(function (c) {
            return el('th' + (c.type === 'num' ? '.num' : ''), {
                title: 'Click to sort, Shift+click descending',
                onclick: function (event) {
                    sort = c.key;
                    desc = event.shiftKey;
                    render();
                }}, c.label);
        }));
        var body = el('tbody');
        var node = el('div.pl-grid', el('table', el('thead', head), body));

        function key(row) {
            return String(row[options.id]);
        }

        function value(row, c) {
            return c.value ? c.value(row) : row[c.key];
        }

        function cell(row, c) {
            var v = value(row, c);
            var cls = c.cls ? c.cls(row) : '';
            var text;
            if (c.type === 'check') {
                text = v ? '☑' : '☐';
            } else if (c.type === 'num') {
                text = num(v);
            } else if (c.type === 'date') {
                text = v ? UI.date(v) : '';
            } else if (c.type === 'dt') {
                text = dt(v);
            } else {
                text = v === null || v === undefined ? '' : String(v);
            }
            if (c.render) {
                return el('td' + (cls ? '.' + cls : ''), c.render(row));
            }
            return el('td' + (c.type === 'num' ? '.num' : '') +
                (cls ? '.' + cls : ''), text);
        }

        function sorted() {
            if (!sort) {
                return rows;
            }
            var c = columns.filter(function (x) {
                return x.key === sort;
            })[0];
            return rows.slice().sort(function (a, b) {
                var x = value(a, c), y = value(b, c);
                x = x === null || x === undefined ? '' : x;
                y = y === null || y === undefined ? '' : y;
                var r = typeof x === 'number' && typeof y === 'number' ?
                    x - y : String(x).localeCompare(String(y), undefined,
                        {numeric: true});
                return desc ? -r : r;
            });
        }

        function render() {
            UI.clear(body);
            var list = sorted();
            list.forEach(function (row, index) {
                var tr = el('tr' + (selected[key(row)] ? '.sel' : ''), {
                    onmousedown: function (event) {
                        if (event.button === 2 && selected[key(row)]) {
                            return;
                        }
                        choose(list, index, event);
                    },
                    oncontextmenu: function (event) {
                        if (options.menu) {
                            options.menu(event, selection());
                        } else {
                            event.preventDefault();
                        }
                    },
                    ondblclick: function () {
                        if (options.open) {
                            options.open(row);
                        }
                    }}, el('td.rh', selected[key(row)] ? '▶' : ''),
                    columns.map(function (c) {
                        return cell(row, c);
                    }));
                body.appendChild(tr);
            });
            if (!list.length) {
                body.appendChild(el('tr', el('td.empty', {colspan:
                    columns.length + 1}, options.empty || 'Nothing to show.')));
            }
        }

        function choose(list, index, event) {
            var k = key(list[index]);
            if (event.shiftKey && anchor !== null) {
                var from = Math.min(anchor, index);
                var to = Math.max(anchor, index);
                if (!event.ctrlKey) {
                    selected = {};
                }
                for (var i = from; i <= to; i++) {
                    selected[key(list[i])] = true;
                }
            } else if (event.ctrlKey || event.metaKey) {
                if (selected[k]) {
                    delete selected[k];
                } else {
                    selected[k] = true;
                }
                anchor = index;
            } else {
                selected = {};
                selected[k] = true;
                anchor = index;
            }
            render();
            if (options.onselect) {
                options.onselect(selection());
            }
        }

        function selection() {
            return rows.filter(function (r) {
                return selected[key(r)];
            });
        }

        render();
        return {
            node: node,
            set: function (list) {
                rows = list || [];
                var keep = {};
                rows.forEach(function (r) {
                    if (selected[key(r)]) {
                        keep[key(r)] = true;
                    }
                });
                selected = keep;
                render();
            },
            rows: function () {
                return rows;
            },
            selection: selection
        };
    }

    /* Tabs: [{title, node}] -> {bar, show(i), current()} */
    function tabs(list, onshow) {
        var current = 0;
        var bar = el('div.pl-tabs', {role: 'tablist'});
        var buttons = list.map(function (t, i) {
            var b = el('button', {type: 'button', role: 'tab', onclick:
                function () {
                    show(i);
                }}, t.title);
            bar.appendChild(b);
            return b;
        });

        function show(i) {
            current = i;
            buttons.forEach(function (b, j) {
                b.classList.toggle('active', j === i);
            });
            list.forEach(function (t, j) {
                t.node.hidden = j !== i;
            });
            if (onshow) {
                onshow(i);
            }
        }
        return {bar: bar, show: show, current: function () {
            return current;
        }};
    }

    /* ---- Supply & Demand ---------------------------------------------- */

    function supplyDemand(product) {
        Rpc.desk('js_supply_demand', [product]).then(function (data) {
            var sales = grid([
                {key: 'order_id', label: 'Order ID'},
                {key: 'line_no', label: 'Line No', type: 'num'},
                {key: 'status', label: 'Status'},
                {key: 'ship_date', label: 'Ship Date', type: 'date'},
                {key: 'demand_qty', label: 'Demand Qty', type: 'num'},
                {key: 'links', label: 'Links', type: 'num'},
                {key: 'demand', label: 'Demand', type: 'num'}
            ], {id: 'i', empty: 'No open sales order.'});
            sales.set(data.sales.map(function (r, i) {
                return Object.assign({i: i}, r);
            }));
            var works = grid([
                {key: 'work_id', label: 'Work ID'},
                {key: 'lot_id', label: 'Lot ID'},
                {key: 'split_id', label: 'Split ID'},
                {key: 'sub_id', label: 'Sub ID'},
                {key: 'seq_no', label: 'Seq No', type: 'num'},
                {key: 'piece_no', label: 'Piece No', type: 'num'},
                {key: 'status', label: 'Order Status'},
                {key: 'want_date', label: 'Desired Want Date', type: 'date'},
                {key: 'finish_date', label: 'Sched Finish Date',
                    type: 'date'},
                {key: 'supply_qty', label: 'Supply Qty', type: 'num'},
                {key: 'demand_qty', label: 'Demand Qty', type: 'num'},
                {key: 'supply', label: 'Supply', type: 'num'},
                {key: 'demand', label: 'Demand', type: 'num'}
            ], {id: 'i', empty: 'No open work order.'});
            works.set(data.work_orders.map(function (r, i) {
                return Object.assign({i: i}, r);
            }));
            var purchases = grid([
                {key: 'order_id', label: 'Order ID'},
                {key: 'line_no', label: 'Line No', type: 'num'},
                {key: 'status', label: 'Status'},
                {key: 'receive_date', label: 'Receive Date', type: 'date'},
                {key: 'supply_qty', label: 'Supply Qty', type: 'num'},
                {key: 'links', label: 'Links', type: 'num'},
                {key: 'supply', label: 'Supply', type: 'num'}
            ], {id: 'i', empty: 'No open purchase order.'});
            purchases.set(data.purchases.map(function (r, i) {
                return Object.assign({i: i}, r);
            }));
            var panes = [
                {title: 'Sales Orders', node: sales.node},
                {title: 'Work Orders', node: works.node},
                {title: 'Purchase Orders', node: purchases.node}];
            var t = tabs(panes);
            UI.modal('Supply & Demand', [
                el('div.pl-head', el('span', 'Part ID ',
                    el('strong', data.part_id)), el('span', 'Description ',
                    el('strong', data.description || '')),
                    el('span', 'On hand ', el('strong', num(data.on_hand) +
                        ' ' + data.stock_um))),
                t.bar, panes.map(function (p) {
                    return p.node;
                })]);
            widen();
            t.show(0);
        }, failed);
    }

    global.JobshopPlanning = {supplyDemand: supplyDemand};

    /* ---- Create New Work Order ---------------------------------------- */

    /* The dialog of Jobshop for a part: opts {want, quantity, cards,
     * description} -> Promise of the work order made */
    function createWorkOrder(product, opts) {
        opts = opts || {};
        return Rpc.desk('js_planning_new_work_order', [product,
            opts.want || null, opts.quantity === undefined ? null :
            opts.quantity]).then(function (d) {
            return new Promise(function (resolve, reject) {
                var id = el('input', {type: 'text', placeholder: 'Next'});
                var lot = el('input', {type: 'text', value: '1'});
                var split = el('input', {type: 'text', value: '0'});
                var master = select(d.masters.map(function (m) {
                    return [m.id, m.name + (m.current ? ' (current)' : '')];
                }), d.product_bom);
                var release = el('input', {type: 'date', value:
                    d.release_date});
                var want = el('input', {type: 'date', value: d.want_date});
                var qty = el('input', {type: 'number', step: 'any', min: 0,
                    value: d.quantity});
                var status = select([['Unreleased', 'Unreleased'],
                    ['Firm', 'Firm'], ['Hold', 'Hold'],
                    ['Released', 'Released']], opts.status || d.status);
                var forward = el('input', {type: 'checkbox'});
                var body = el('div.pl-form',
                    field('New Work Order ID', id),
                    field('New Lot ID', lot),
                    field('New Split ID', split),
                    field('Part ID', el('input', {type: 'text', readonly:
                        true, value: d.part_id})),
                    field('Description', el('input', {type: 'text',
                        readonly: true, value: opts.description ||
                            d.description}), 'wide'),
                    d.masters.length ? field('Copy Eng ID', master, 'wide') :
                        el('p.muted.wide', 'No engineering master: the ' +
                            'work order has its header card only.'),
                    field('Release Date', release),
                    field('Want Date', want),
                    field('Order Qty', qty),
                    field('Status', status),
                    field(el('span', 'Forward Schedule from Release Date'),
                        forward, 'check wide'));
                UI.modal('Create New Work Order', body, [
                    {label: 'Cancel', onclick: function () {
                        reject({cancelled: true});
                    }},
                    {label: 'Create', primary: true, onclick: function () {
                        var values = {
                            product: product,
                            quantity: parseFloat(qty.value) || 0,
                            work_id: id.value.trim() || null,
                            lot_id: lot.value.trim() || '1',
                            split_id: split.value.trim() || '0',
                            product_bom: d.masters.length ?
                                parseInt(master.value, 10) : null,
                            release_date: release.value || null,
                            want_date: want.value || null,
                            status: status.value,
                            forward: forward.checked,
                            cards: opts.cards || []
                        };
                        if (values.quantity <= 0) {
                            UI.toast('Enter the order quantity.', 'error');
                            return true;
                        }
                        UI.service('js_planning_create_work_order', values)
                            .then(resolve, function (e) {
                                failed(e);
                                reject({cancelled: true});
                            });
                    }}]);
                widen('pl-mid');
            });
        });
    }

    /* ---- Create Purchase Order for supplier --------------------------- */

    /* The suppliers of the rows (the part's or the service's), then Other:
     * a lookup; for stocked parts the quantities to order */
    function purchaseDialog(kind, rows, idKey) {
        return new Promise(function (resolve, reject) {
            var seen = {};
            var choices = [];
            rows.forEach(function (r) {
                if (r.supplier && !seen[r.supplier]) {
                    seen[r.supplier] = true;
                    choices.push([r.supplier, r.supplier_id]);
                }
            });
            var group = 'pl-sup-' + Date.now();
            var radios = choices.map(function (c, i) {
                return el('label.check', el('input', {type: 'radio', name:
                    group, value: c[0], checked: i === 0 || null}), ' ', c[1]);
            });
            var otherRadio = el('input', {type: 'radio', name: group, value:
                'other', checked: choices.length ? null : true});
            var other = UI.picker('party.party', {placeholder: 'Supplier',
                label: 'Other supplier', onselect: function () {
                    otherRadio.checked = true;
                }});
            var inputs = {};
            var qtyTable = null;
            if (kind === 'stocked') {
                qtyTable = el('table.pl-edit', el('tr', el('th', 'Part ID'),
                    el('th', 'Description'), el('th', 'Projected'),
                    el('th', 'Order Qty')), rows.map(function (r) {
                        inputs[r[idKey]] = el('input', {type: 'number',
                            step: 'any', min: 0, value: r.suggested});
                        return el('tr', el('td', r.part_id), el('td',
                            r.description), el('td.num', num(r.projected)),
                            el('td', inputs[r[idKey]]));
                    }));
            }
            var body = el('div',
                el('p.muted', rows.length + ' line(s) selected; identical ' +
                    'parts are one purchase order line linked to each ' +
                    'work order.'),
                el('div.pl-form', radios, el('label.check.wide', otherRadio,
                    ' Other: ', other.node)), qtyTable);
            UI.modal('Create Purchase Order for supplier', body, [
                {label: 'Cancel', onclick: function () {
                    reject({cancelled: true});
                }},
                {label: 'Create', primary: true, onclick: function () {
                    var picked = document.querySelector('input[name="' +
                        group + '"]:checked');
                    var supplier = picked && picked.value !== 'other' ?
                        parseInt(picked.value, 10) : other.value();
                    if (!supplier) {
                        UI.toast('Choose the supplier.', 'error');
                        return true;
                    }
                    var values = {kind: kind, supplier: supplier,
                        rows: rows.map(function (r) {
                            return r[idKey];
                        })};
                    if (kind === 'stocked') {
                        values.quantities = {};
                        rows.forEach(function (r) {
                            values.quantities[r[idKey]] = parseFloat(
                                inputs[r[idKey]].value) || 0;
                        });
                    }
                    UI.service('js_planning_purchase', values).then(resolve,
                        function (e) {
                            failed(e);
                            reject({cancelled: true});
                        });
                }}]);
            widen('pl-mid');
        });
    }

    /* ---- Material Planning -------------------------------------------- */

    Screens.materialPlanning = function (main) {
        style();
        var sections = [];
        var current = 0;
        var form = UI.form(main, {title: 'Material Planning', extra: [
            {label: 'Refresh', title: 'Refresh (F5)', onclick: function () {
                reload();
            }},
            {label: 'Planning Tools', title: 'The options of the section ' +
                '(also on the right-click of the table)', onclick:
                function (event) {
                    var s = sections[current];
                    s.menu(event, s.grid.selection());
                }}]});
        var body = form.body;
        Promise.all([Rpc.desk('js_planning_access', []), allowedScreens([
            'orders', 'work-orders', 'purchase-orders', 'parts'])]).then(
            function (r) {
                build(r[0], r[1]);
            }, failed);

        function reload() {
            if (sections[current]) {
                sections[current].load();
            }
        }

        function build(access, screens) {
            function openSale(row) {
                if (screens.orders) {
                    UI.openScreen('orders/' + row.sale, 'Order ' +
                        row.sales_id);
                }
            }

            function openWorkOrder(id, number) {
                if (screens['work-orders']) {
                    UI.openScreen('work-orders/' + id, 'WO ' + (number || id));
                } else {
                    UI.openRecord('production', id, number);
                }
            }

            function openPurchase(id, number) {
                if (screens['purchase-orders']) {
                    UI.openScreen('purchase-orders/' + id, 'PO ' +
                        (number || id));
                }
            }

            function made(result) {
                UI.toast('Work order ' + result.number + ' created', 'ok');
                openWorkOrder(result.id, result.number);
                reload();
            }

            function bought(result) {
                UI.toast('Purchase order ' + result.number + ' created',
                    'ok');
                openPurchase(result.purchase, result.number);
                reload();
            }

            function viewItems(s) {
                return s.views.map(function (v) {
                    return {label: (s.view === v[0] ? '✓ ' : '') +
                        'View: ' + v[1], onclick: function () {
                            s.view = v[0];
                            s.viewSelect.value = v[0];
                            s.load();
                        }};
                });
            }

            function onePart(rows) {
                return rows.length && rows.every(function (r) {
                    return r.product && r.product === rows[0].product;
                });
            }

            function requestItem(rows, quantity) {
                /* No supplier: a purchase request (the desk's earlier
                 * planning) */
                if (!access.request || rows.length !== 1 || !rows[0].product ||
                        !rows[0].purchased || rows[0].supplier) {
                    return null;
                }
                return {label: 'Create Purchase Request', onclick: function () {
                    UI.service('plan_purchase', {product: rows[0].product,
                        quantity: quantity(rows[0])}).then(function () {
                            UI.toast('Purchase request created', 'ok');
                            reload();
                        }, failed);
                }};
            }

            function partItems(rows) {
                var items = [];
                if (rows.length === 1 && rows[0].product) {
                    items.push({label: 'View Supply and Demand', onclick:
                        function () {
                            supplyDemand(rows[0].product);
                        }});
                    if (screens.parts) {
                        items.push({label: 'Open Part', onclick: function () {
                            UI.openRecord('product.product', rows[0].product,
                                rows[0].part_id);
                        }});
                    }
                }
                return items;
            }

            /* Open Sales Orders */
            function soMenu(event, rows) {
                var items = [];
                var fab = rows.length && rows.every(function (r) {
                    return r.fabricated;
                });
                var unlinked = rows.filter(function (r) {
                    return !r.fully_linked;
                });
                if (access.link && access.work_order && fab && onePart(rows) &&
                        unlinked.length) {
                    ['Unreleased', 'Firm', 'Released'].forEach(function (s) {
                        items.push({label: 'Link Order Line To: New Work ' +
                            'Order with Status ' + s, onclick: function () {
                                UI.service('js_planning_link', {lines:
                                    unlinked.map(function (r) {
                                        return r.line;
                                    }), status: s}).then(made, failed);
                            }});
                    });
                    items.push({label: 'Link Order Line To: Existing Work ' +
                        'Order...', onclick: function () {
                            linkExisting(unlinked);
                        }});
                }
                if (access.link && rows.some(function (r) {
                    return r.links.length;
                })) {
                    items.push({label: 'Break Links to Work Orders',
                        onclick: function () {
                            UI.confirm('Break links', 'Unlink the selected ' +
                                'lines from their work orders? The work ' +
                                'orders stay.').then(function (ok) {
                                    if (!ok) {
                                        return;
                                    }
                                    Rpc.desk('js_planning_unlink', [{lines:
                                        rows.map(function (r) {
                                            return r.line;
                                        })}]).then(reload, failed);
                                });
                        }});
                }
                if (access.work_order && rows.length === 1 && fab) {
                    items.push({label: 'Create Work Order...', onclick:
                        function () {
                            var r = rows[0];
                            createWorkOrder(r.product, {want:
                                r.desired_ship_date, quantity: r.qty_due,
                                description: r.description}).then(made,
                                failed);
                        }});
                }
                items.push('-');
                var sales = {};
                rows.forEach(function (r) {
                    sales[r.sale] = r;
                });
                var one = Object.keys(sales).length === 1 ? rows[0] : null;
                if (access.sale_status && one) {
                    one.status_changes.forEach(function (status) {
                        items.push({label: 'Change Sales Order Status: ' +
                            status, onclick: function () {
                                UI.confirm('Change Sales Order Status',
                                    'Every line of sales order ' +
                                    one.sales_id + ' takes the status ' +
                                    status + '.').then(function (ok) {
                                        if (!ok) {
                                            return;
                                        }
                                        Rpc.desk('js_planning_sale_status', [
                                            one.sale, status]).then(
                                            function () {
                                                UI.toast('Sales order ' +
                                                    one.sales_id + ': ' +
                                                    status, 'ok');
                                                reload();
                                            }, failed);
                                    });
                            }});
                    });
                }
                items.push('-');
                items = items.concat(viewItems(sections[0]));
                items.push('-');
                if (one && screens.orders) {
                    items.push({label: 'Open Sales Order', onclick:
                        function () {
                            openSale(one);
                        }});
                }
                if (rows.length === 1) {
                    rows[0].links.forEach(function (l) {
                        items.push({label: 'Open Work Order ' + l.number,
                            onclick: function () {
                                openWorkOrder(l.id, l.number);
                            }});
                    });
                    items.push({label: 'Open Customer', onclick: function () {
                        UI.openRecord('party.party', rows[0].customer,
                            rows[0].name);
                    }});
                }
                UI.contextMenu(event, items.concat(partItems(rows)));
            }

            function linkExisting(rows) {
                Rpc.desk('js_planning_link_targets', [rows[0].product]).then(
                    function (targets) {
                        if (!targets.length) {
                            UI.toast('No open work order of ' +
                                rows[0].part_id + '.', 'error');
                            return;
                        }
                        var choice = select(targets.map(function (t) {
                            return [t.id, t.number + ' - ' + t.status +
                                ' - qty ' + num(t.quantity) + (t.want_date ?
                                    ' - want ' + UI.date(t.want_date) : '')];
                        }));
                        UI.modal('Link to Existing Work Order', el('div',
                            el('p.muted', rows.length + ' line(s) of ' +
                                rows[0].part_id), field('Work Order',
                                choice)), [
                            {label: 'Cancel'},
                            {label: 'Link', primary: true, onclick:
                                function () {
                                    UI.service('js_planning_link', {lines:
                                        rows.map(function (r) {
                                            return r.line;
                                        }), production: parseInt(
                                            choice.value, 10)}).then(
                                        function () {
                                            UI.toast('Linked', 'ok');
                                            reload();
                                        }, failed);
                                }}]);
                    }, failed);
            }

            /* Non-Stocked Parts */
            function nsMenu(event, rows) {
                var items = [];
                var open = rows.filter(function (r) {
                    return !r.fully_linked;
                });
                if (access.purchase && open.length && open.every(function (r) {
                    return !r.product || r.purchased;
                })) {
                    items.push({label: 'Create Purchase Order for supplier...',
                        onclick: function () {
                            purchaseDialog('material', open, 'card').then(
                                bought, failed);
                        }});
                }
                if (access.work_order && open.length && onePart(open) &&
                        open[0].fabricated) {
                    items.push({label: 'Create Work Order...', onclick:
                        function () {
                            var qty = open.reduce(function (t, r) {
                                return t + r.net_qty;
                            }, 0);
                            createWorkOrder(open[0].product, {want:
                                open[0].required_date, quantity: qty,
                                cards: open.map(function (r) {
                                    return r.card;
                                })}).then(made, failed);
                        }});
                }
                var request = requestItem(open, function (r) {
                    return r.net_qty - r.linked_po_qty;
                });
                if (request) {
                    items.push(request);
                }
                if (access.link && access.purchase && rows.some(function (r) {
                    return r.po_link && !r.job;
                })) {
                    items.push({label: 'Break Links to Purchase Orders',
                        onclick: function () {
                            Rpc.desk('js_planning_unlink', [{cards: rows.map(
                                function (r) {
                                    return r.card;
                                }), purchases: true}]).then(reload, failed);
                        }});
                }
                items.push('-');
                items = items.concat(viewItems(sections[1]));
                items.push('-');
                if (rows.length === 1) {
                    items.push({label: 'Open Work Order', onclick: function () {
                        openWorkOrder(rows[0].root, rows[0].work_id);
                    }});
                }
                UI.contextMenu(event, items.concat(partItems(rows)));
            }

            /* Outside Services */
            function osMenu(event, rows) {
                var items = [];
                var open = rows.filter(function (r) {
                    return !r.fully_linked;
                });
                if (access.purchase && open.length) {
                    items.push({label: 'Create Purchase Order for supplier...',
                        onclick: function () {
                            purchaseDialog('service', open, 'work').then(
                                bought, failed);
                        }});
                }
                items.push('-');
                items = items.concat(viewItems(sections[2]));
                items.push('-');
                if (rows.length === 1) {
                    items.push({label: 'Open Work Order', onclick: function () {
                        openWorkOrder(rows[0].root, rows[0].work_id);
                    }});
                    if (rows[0].purchase && screens['purchase-orders']) {
                        items.push({label: 'Open Purchase Order', onclick:
                            function () {
                                openPurchase(rows[0].purchase,
                                    rows[0].po_link);
                            }});
                    }
                }
                UI.contextMenu(event, items);
            }

            /* Stocked Parts */
            function spMenu(event, rows) {
                var items = [];
                if (access.purchase && rows.length && rows.every(function (r) {
                    return r.purchased;
                })) {
                    items.push({label: 'Create Purchase Order for supplier...',
                        onclick: function () {
                            purchaseDialog('stocked', rows, 'product').then(
                                bought, failed);
                        }});
                }
                if (access.work_order && rows.length === 1 &&
                        rows[0].fabricated) {
                    items.push({label: 'Create Work Order...', onclick:
                        function () {
                            createWorkOrder(rows[0].product, {quantity:
                                rows[0].order_point || rows[0].suggested,
                                status: 'Firm'}).then(made, failed);
                        }});
                }
                var request = requestItem(rows, function (r) {
                    return r.suggested;
                });
                if (request) {
                    items.push(request);
                }
                items.push('-');
                items = items.concat(viewItems(sections[3]));
                items.push('-');
                UI.contextMenu(event, items.concat(partItems(rows)));
            }

            function red(key) {
                return function (r) {
                    return r.late && key === 'order_by' ? 'red' : '';
                };
            }

            sections = [
                {title: 'Open Sales Orders', id: 'line', view: 'exclude',
                    views: [['all', 'View All'], ['exclude',
                        'Exclude Fully Linked']],
                    rpc: function (s) {
                        return Rpc.desk('js_planning_sales', [s.view]);
                    },
                    menu: soMenu, open: openSale,
                    empty: 'No open sales order line to plan.',
                    columns: [
                        {key: 'desired_ship_date', label: 'Desired Ship Date',
                            type: 'date'},
                        {key: 'lead_time', label: 'Lead Time (Days)',
                            type: 'num'},
                        {key: 'order_by', label: 'Order By Date',
                            type: 'date', cls: red('order_by')},
                        {key: 'sales_id', label: 'Sales ID'},
                        {key: 'line_no', label: 'Line No', type: 'num'},
                        {key: 'line_status', label: 'Line Status'},
                        {key: 'order_status', label: 'Order Status'},
                        {key: 'part_id', label: 'Part ID'},
                        {key: 'fabricated', label: "Fab'd", type: 'check'},
                        {key: 'purchased', label: "Pur'd", type: 'check'},
                        {key: 'stock_um', label: 'Stock U/M'},
                        {key: 'order_qty', label: 'Order Qty', type: 'num'},
                        {key: 'shipped_qty', label: "Ship'd Qty",
                            type: 'num'},
                        {key: 'linked_qty', label: 'Linked Qty', type: 'num'},
                        {key: 'qty_due', label: 'Qty Due', type: 'num'},
                        {key: 'qty_available', label: 'Qty Available',
                            type: 'num'},
                        {key: 'qty_on_hold', label: 'Qty On Hold',
                            type: 'num'},
                        {key: 'wo_link', label: 'WO Link Information'},
                        {key: 'customer_part_id', label: 'Customer Part ID'},
                        {key: 'customer_id', label: 'Customer ID'},
                        {key: 'name', label: 'Name'},
                        {key: 'description', label: 'Description'},
                        {key: 'message', label: 'Message', cls: function () {
                            return 'msg';
                        }}
                    ]},
                {title: 'Non-Stocked Parts', id: 'card', view: 'exclude',
                    views: [['all', 'View All'], ['exclude',
                        'Exclude Fully Linked']],
                    rpc: function (s) {
                        return Rpc.desk('js_planning_non_stocked', [s.view]);
                    },
                    menu: nsMenu, open: function (r) {
                        openWorkOrder(r.root, r.work_id);
                    },
                    empty: 'No open work order needs a non-stocked part.',
                    columns: [
                        {key: 'required_date', label: 'Required Date',
                            type: 'date'},
                        {key: 'lead_time', label: 'Lead Time (Days)',
                            type: 'num'},
                        {key: 'order_by', label: 'Order By Date',
                            type: 'date', cls: red('order_by')},
                        {key: 'work_id', label: 'Work ID'},
                        {key: 'lot_id', label: 'Lot ID'},
                        {key: 'split_id', label: 'Split ID'},
                        {key: 'sub_id', label: 'Sub ID'},
                        {key: 'seq_no', label: 'Seq No', type: 'num'},
                        {key: 'piece_no', label: 'Piece No', type: 'num'},
                        {key: 'part_id', label: 'Part ID'},
                        {key: 'fabricated', label: "Fab'd", type: 'check'},
                        {key: 'purchased', label: "Pur'd", type: 'check'},
                        {key: 'tool', label: 'Tool or Fixture',
                            type: 'check'},
                        {key: 'calc_qty', label: 'Calc Qty (Stk U/M)',
                            type: 'num'},
                        {key: 'linked_po_qty', label: 'Linked PO Qty ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'issued_qty', label: 'Issued Qty (Stk U/M)',
                            type: 'num'},
                        {key: 'net_qty', label: "Net Qty Req'd (Stk U/M)",
                            type: 'num'},
                        {key: 'linked_received', label: 'Linked Qty ' +
                            'Received (Stk U/M)', type: 'num'},
                        {key: 'qty_available', label: 'Qty Available ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'stock_um', label: 'Stock U/M'},
                        {key: 'po_link', label: 'PO/Line Link Information'},
                        {key: 'length', label: 'Length', type: 'num'},
                        {key: 'width', label: 'Width', type: 'num'},
                        {key: 'height', label: 'Height', type: 'num'},
                        {key: 'usage_um', label: 'Usage U/M'},
                        {key: 'supplier_id', label: 'Supplier ID'},
                        {key: 'supplier_part_id', label: 'Supplier Part ID'},
                        {key: 'mfg_name', label: 'Mfg Name'},
                        {key: 'mfg_part_id', label: 'Mfg Part ID'},
                        {key: 'material_status', label: 'Material Status'},
                        {key: 'order_status', label: 'Order Status'},
                        {key: 'description', label: 'Description'},
                        {key: 'specifications', label: 'Specifications'}
                    ]},
                {title: 'Outside Services', id: 'work', view: 'exclude',
                    views: [['all', 'View All'], ['exclude',
                        'Exclude Fully Linked']],
                    rpc: function (s) {
                        return Rpc.desk('js_planning_outside', [s.view]);
                    },
                    menu: osMenu, open: function (r) {
                        openWorkOrder(r.root, r.work_id);
                    },
                    empty: 'No outside service to buy.',
                    columns: [
                        {key: 'required_date', label: 'Required Date',
                            type: 'date'},
                        {key: 'transit_days', label: 'Transit Days',
                            type: 'num'},
                        {key: 'order_by', label: 'Order By Date',
                            type: 'date', cls: red('order_by')},
                        {key: 'order_status', label: 'Work Order Status'},
                        {key: 'work_id', label: 'Work ID'},
                        {key: 'lot_id', label: 'Lot ID'},
                        {key: 'split_id', label: 'Split ID'},
                        {key: 'sub_id', label: 'Sub ID'},
                        {key: 'seq_no', label: 'Seq No', type: 'num'},
                        {key: 'operation_status', label: 'Operation Status'},
                        {key: 'service_id', label: 'Service ID'},
                        {key: 'supplier_id', label: 'Supplier ID'},
                        {key: 'supplier_service_id', label: 'Supplier ' +
                            'Service ID'},
                        {key: 'operation', label: 'Operation Description'},
                        {key: 'part_id', label: 'Header/Leg Part ID'},
                        {key: 'calc_qty', label: 'Calc Start Qty (Stk U/M)',
                            type: 'num'},
                        {key: 'linked_po_qty', label: 'Linked PO Qty ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'linked_received', label: 'Linked Qty ' +
                            'Received (Stk U/M)', type: 'num'},
                        {key: 'net_qty', label: "Net Qty Req'd (Stk U/M)",
                            type: 'num'},
                        {key: 'stock_um', label: 'Stock U/M'},
                        {key: 'specifications', label: 'Specifications'},
                        {key: 'po_link', label: 'PO/Line Link Information'},
                        {key: 'usage_um', label: 'Usage U/M'}
                    ]},
                {title: 'Stocked Parts', id: 'product', view: 'short',
                    views: [['all', 'View All'], ['short', 'Short Only']],
                    rpc: function (s) {
                        var f = s.filters();
                        f.short_only = s.view === 'short';
                        return Rpc.desk('js_planning_stocked', [f]);
                    },
                    menu: spMenu, open: function (r) {
                        supplyDemand(r.product);
                    },
                    empty: 'No stocked part is short.',
                    columns: [
                        {key: 'part_id', label: 'Part ID'},
                        {key: 'description', label: 'Description'},
                        {key: 'fabricated', label: 'Fabricated',
                            type: 'check'},
                        {key: 'purchased', label: 'Purchased', type: 'check'},
                        {key: 'lead_time', label: 'Planning Leadtime',
                            type: 'num'},
                        {key: 'stock_um', label: 'Stock UM'},
                        {key: 'on_hold', label: 'On Hold Qty', type: 'num'},
                        {key: 'on_hand', label: 'On Hand Qty', type: 'num'},
                        {key: 'net_demand', label: 'Net Demand', type: 'num'},
                        {key: 'total_supply', label: 'Total Supply',
                            type: 'num'},
                        {key: 'projected', label: 'Projected On Hand Qty',
                            type: 'num', cls: function (r) {
                                return r.color === 'black' ? '' : r.color;
                            }},
                        {key: 'order_point', label: 'Order Point',
                            type: 'num'},
                        {key: 'safety_stock', label: 'Safety Stock Qty',
                            type: 'num'},
                        {key: 'product_code', label: 'Product Code'},
                        {key: 'commodity_code', label: 'Commodity Code'},
                        {key: 'supplier_id', label: 'Pref Supplier ID'},
                        {key: 'mfg_name', label: 'Mfg Name'},
                        {key: 'mfg_part_id', label: 'Mfg Part ID'}
                    ]}
            ];

            var panes = sections.map(function (s, index) {
                s.grid = grid(s.columns, {id: s.id, menu: s.menu, open: s.open,
                    empty: s.empty});
                s.status = el('span.muted', '');
                s.viewSelect = select(s.views, s.view);
                s.viewSelect.addEventListener('change', function () {
                    s.view = s.viewSelect.value;
                    s.load();
                });
                s.load = function () {
                    s.status.textContent = 'Loading...';
                    s.rpc(s).then(function (rows) {
                        s.grid.set(rows);
                        s.loaded = true;
                        s.status.textContent = rows.length + ' line(s)';
                    }, function (e) {
                        s.status.textContent = '';
                        failed(e);
                    });
                };
                s.filters = function () {
                    return {};
                };
                var filters = null;
                if (index === 3) {
                    filters = stockedFilters(s);
                }
                return {title: s.title, node: el('div', el('div.pl-bar',
                    field('View', s.viewSelect), el('span.spacer'),
                    el('span.muted', 'Right-click a line for its options; ' +
                        'Ctrl/Shift+click for several.'), s.status),
                    filters, s.grid.node)};
            });

            function stockedFilters(s) {
                function range(label) {
                    var on = el('input', {type: 'checkbox'});
                    var from = el('input', {type: 'text', placeholder:
                        'From'});
                    var to = el('input', {type: 'text', placeholder: 'To'});
                    return {on: on, from: from, to: to, node: el('label', on,
                        label, from, to)};
                }
                var part = range('Part ID');
                var code = range('Product Code');
                var commodity = range('Commodity Code');
                var supplier = range('Pref Supplier ID');
                var activity = select([['active', 'Active Parts Only'],
                    ['inactive', 'Inactive Parts Only'], ['both', 'Both']],
                    'active');
                var horizonOn = el('input', {type: 'checkbox'});
                var horizon = el('input', {type: 'date'});
                s.filters = function () {
                    function v(r, which) {
                        return r.on.checked ? r[which].value.trim() || null :
                            null;
                    }
                    return {
                        part_from: v(part, 'from'), part_to: v(part, 'to'),
                        product_code_from: v(code, 'from'),
                        product_code_to: v(code, 'to'),
                        commodity_code_from: v(commodity, 'from'),
                        commodity_code_to: v(commodity, 'to'),
                        supplier_from: v(supplier, 'from'),
                        supplier_to: v(supplier, 'to'),
                        activity: activity.value,
                        horizon: horizonOn.checked && horizon.value ?
                            horizon.value : null
                    };
                };
                return el('div.pl-filters', part.node, code.node,
                    commodity.node, supplier.node, field('', activity),
                    el('label', horizonOn, 'Horizon', horizon),
                    el('div', el('button', {type: 'button', onclick:
                        function () {
                            s.load();
                        }}, 'Apply')));
            }

            var t = tabs(panes, function (i) {
                current = i;
                if (!sections[i].loaded) {
                    sections[i].load();
                }
            });
            body.appendChild(t.bar);
            panes.forEach(function (p) {
                body.appendChild(p.node);
            });
            t.show(0);

            document.addEventListener('keydown', function (event) {
                if (!body.isConnected) {
                    return;
                }
                if (event.key === 'F5') {
                    event.preventDefault();
                    reload();
                }
            });
        }
    };

    /* ---- Scheduling ----------------------------------------------------- */

    var HOUR = 3600 * 1000;
    var DAY = 24 * HOUR;
    /* Pixels per hour of each display mode */
    var MODES = {day: 40, week: 6, month: 1.5, year: 0.25};
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
        'Sep', 'Oct', 'Nov', 'Dec'];
    var JS_DAYS = [['0', 'Saturday'], ['1', 'Sunday'], ['2', 'Monday'],
        ['3', 'Tuesday'], ['4', 'Wednesday'], ['5', 'Thursday'],
        ['6', 'Friday']];

    function tryTime(value) {
        /* A Tryton time (JSON {__class__: 'time'}) as HH:MM */
        if (!value) {
            return '';
        }
        if (typeof value === 'object') {
            return String(value.hour).padStart(2, '0') + ':' +
                String(value.minute).padStart(2, '0');
        }
        return String(value).slice(0, 5);
    }

    function toTime(text) {
        if (!text) {
            return null;
        }
        var p = text.split(':');
        return {__class__: 'time', hour: +p[0], minute: +p[1], second: 0,
            microsecond: 0};
    }

    function numOrNull(input) {
        return input.value === '' ? null : parseFloat(input.value);
    }

    function intOrNull(input) {
        return input.value === '' ? null : parseInt(input.value, 10);
    }

    Screens.scheduling = function (main) {
        style();
        var info = null;
        var access = {};
        var screens = {};
        var state = {mode: 'week', zoom: 1, ops: true, capacity: true,
            grid: true, info: false, chart: 'resource', highlight: null,
            determinant: false, selected: null, viewType: 'resource',
            resource: '', view: '', workOrder: null};
        var form = UI.form(main, {title: 'Scheduling', extra: [
            {label: 'Refresh', title: 'Refresh (F5)', onclick: function () {
                refresh();
            }},
            {label: 'Scheduling', title: 'Scheduling Options (also the ' +
                'right-click of the schedule)', onclick: function (event) {
                    optionsMenu(event, null);
                }},
            {label: 'Tools', onclick: function (event) {
                toolsMenu(event);
            }}]});
        var body = form.body;

        var header = el('div.pl-head');
        var resPane = el('div');
        var woPane = el('div');
        var chartPane = el('div');
        var panes = [{title: 'Resource Details', node: resPane},
            {title: 'Work Order Details', node: woPane},
            {title: 'Schedule', node: chartPane}];
        var t = tabs(panes, function (i) {
            if (i === 0) {
                loadResources();
            } else if (i === 1) {
                loadWorkOrder();
            } else {
                loadChart();
            }
        });

        Promise.all([Rpc.desk('js_schedule_info', []),
            Rpc.desk('js_planning_access', []),
            allowedScreens(['work-orders'])]).then(function (r) {
                info = r[0];
                access = r[1];
                screens = r[2];
                build();
            }, failed);

        function openWorkOrder(id, number) {
            if (screens['work-orders']) {
                UI.openScreen('work-orders/' + id, 'WO ' + (number || id));
            } else {
                UI.openRecord('production', id, number);
            }
        }

        function showHeader() {
            UI.clear(header).appendChild(el('span', 'Schedule ID ',
                el('strong', info.code)));
            header.appendChild(el('span', el('strong',
                info.infinite ? 'Infinite' : 'Finite')));
            header.appendChild(el('span', 'Scheduled as of ', el('strong',
                info.scheduled_as_of ? dt(info.scheduled_as_of) :
                    'never: run Schedule All')));
            header.appendChild(el('span', 'Load horizon ', el('strong',
                info.load_horizon + ' days')));
        }

        function refreshInfo() {
            return Rpc.desk('js_schedule_info', []).then(function (data) {
                info = data;
                showHeader();
                fillWorkOrders();
            });
        }

        function refresh() {
            refreshInfo().then(function () {
                t.show(t.current());
            }, failed);
        }

        /* Resource Details */
        var viewType = select([['resource', 'Shop Resource'],
            ['view', 'Shop View']], 'resource');
        var resourceSel = el('select');
        var resGrid = null;
        var woSel = el('select');
        var woHead = el('div.pl-head');
        var woGrid = null;

        function opColumns(withOrder) {
            var cols = [
                {key: 'frozen', label: 'Frozen', render: function (r) {
                    if (!access.schedule) {
                        return r.frozen ? '☑' : '☐';
                    }
                    return el('input', {type: 'checkbox', checked: r.frozen ||
                        null, onchange: function (event) {
                            freeze([r.id], event.target.checked);
                        }});
                }},
                {key: 'resource_id', label: 'Resource ID'}];
            if (withOrder) {
                cols.push({key: 'work_id', label: 'Work ID'},
                    {key: 'lot_id', label: 'Lot ID'},
                    {key: 'split_id', label: 'Split ID'});
            }
            return cols.concat([
                {key: 'sub_id', label: 'Sub ID'},
                {key: 'seq_no', label: 'Seq No', type: 'num'},
                {key: 'operation', label: 'Operation'},
                {key: 'unit_no', label: 'Unit No', type: 'num'},
                {key: 'start', label: 'Start Date', type: 'dt'},
                {key: 'finish', label: 'Finish Date', type: 'dt'},
                {key: 'qty', label: 'Qty', type: 'num'},
                {key: 'cmp_qty', label: 'Cmp Qty', type: 'num'},
                {key: 'status', label: 'Status'},
                {key: 'could_start', label: 'Could Start Date', type: 'dt',
                    cls: function (r) {
                        return r.could_early ? 'red' : '';
                    }},
                {key: 'could_finish', label: 'Could Finish Date',
                    type: 'dt'},
                {key: 'want_date', label: 'Want Date', type: 'date'},
                {key: 'determinant', label: 'Determinant', type: 'check'},
                {key: 'forward', label: 'Forward', type: 'check'},
                {key: 'late', label: 'Late', type: 'check', cls: function (r) {
                    return r.late ? 'red' : '';
                }}]);
        }

        function opMenu(event, rows) {
            var items = [];
            if (access.schedule && rows.length) {
                items.push({label: 'Freeze', onclick: function () {
                    freeze(rows.map(function (r) {
                        return r.id;
                    }), true);
                }}, {label: 'Unfreeze', onclick: function () {
                    freeze(rows.map(function (r) {
                        return r.id;
                    }), false);
                }});
            }
            if (rows.length === 1) {
                items.push({label: 'Show in Schedule', onclick: function () {
                    state.selected = rows[0].id;
                    state.highlight = rows[0].root;
                    t.show(2);
                }}, {label: 'Open Work Order', onclick: function () {
                    openWorkOrder(rows[0].root, rows[0].work_id);
                }});
            }
            UI.contextMenu(event, items);
        }

        function freeze(ids, frozen) {
            Rpc.desk('js_schedule_freeze', [ids, frozen]).then(function () {
                UI.toast((frozen ? 'Frozen: ' : 'Unfrozen: ') + ids.length +
                    ' operation(s)', 'ok');
                t.show(t.current());
            }, failed);
        }

        function fillResources() {
            UI.clear(resourceSel).appendChild(el('option', {value: ''},
                'All'));
            var list = state.viewType === 'view' ? info.views.map(
                function (v) {
                    return [v.id, v.name];
                }) : info.resources.map(function (r) {
                    return [r.id, r.name];
                });
            list.forEach(function (o) {
                resourceSel.appendChild(el('option', {value: o[0]}, o[1]));
            });
        }

        function fillWorkOrders() {
            var keep = woSel.value;
            UI.clear(woSel).appendChild(el('option', {value: ''},
                'Choose a work order'));
            info.work_orders.forEach(function (w) {
                woSel.appendChild(el('option', {value: w.id, selected:
                    String(w.id) === keep || null}, w.number));
            });
        }

        function loadResources() {
            var id = resourceSel.value ? parseInt(resourceSel.value, 10) :
                null;
            var args = state.viewType === 'view' ? [null, id] : [id, null];
            Rpc.desk('js_schedule_resource_details', args).then(function (rows) {
                resGrid.set(rows);
            }, failed);
        }

        function loadWorkOrder() {
            var id = woSel.value ? parseInt(woSel.value, 10) : null;
            UI.clear(woHead);
            if (!id) {
                woGrid.set([]);
                return;
            }
            Rpc.desk('js_schedule_work_order_details', [id]).then(function (d) {
                state.workOrder = d;
                [['Part ID', d.part], ['Want Date', UI.date(d.want_date)],
                    ['Release Date', UI.date(d.release_date)],
                    ['Start Date', dt(d.start)], ['Finish Date', dt(d.finish)],
                    ['Rank', d.rank === null ? '' : d.rank],
                    ['Status', d.status],
                    ['Forward', d.forward ? 'Yes' : 'No'],
                    ['Frozen', d.frozen ? 'Yes' : 'No'],
                    ['Late', d.late ? 'Yes' : 'No']].forEach(function (p) {
                        woHead.appendChild(el('span', p[0] + ' ',
                            el('strong', String(p[1]))));
                    });
                woGrid.set(d.operations);
            }, failed);
        }

        /* The Schedule (Gantt) */
        var modeSel = select([['day', 'Day'], ['week', 'Week'],
            ['month', 'Month'], ['year', 'Year']], state.mode);
        var zoomSel = select([['0.5', '50%'], ['1', '100%'], ['2', '200%'],
            ['4', '400%']], '1');
        var bySel = select([['resource', 'By Resource'],
            ['work_order', 'By Work Order']], 'resource');
        var gx = el('div.gx');
        var chartData = null;

        function pxh() {
            return MODES[state.mode] * state.zoom;
        }

        function loadChart() {
            var from = UI.addDays(info.today, -7);
            var to = UI.addDays(info.today, info.load_horizon || 90);
            var ident = null;
            var view = null;
            if (state.chart === 'resource') {
                if (state.viewType === 'view' && resourceSel.value) {
                    view = parseInt(resourceSel.value, 10);
                } else if (resourceSel.value) {
                    ident = parseInt(resourceSel.value, 10);
                }
            } else if (woSel.value && t.current() === 2 &&
                    state.chartWorkOrder) {
                ident = parseInt(woSel.value, 10);
            }
            Rpc.desk('js_schedule_chart', [state.chart, ident, from, to,
                view]).then(function (data) {
                    chartData = data;
                    drawChart();
                }, failed);
        }

        function barClass(b) {
            var cls = '.gx-bar';
            if (b.frozen) {
                cls += '.frozen';
            } else if (state.highlight === b.root && state.determinant &&
                    b.determinant) {
                cls += '.det' + (b.late ? '.late' : '');
            } else if (state.highlight === b.root) {
                cls += '.hi';
            } else if (b.late) {
                cls += '.late';
            }
            if (state.selected === b.id) {
                cls += '.sel';
            }
            return cls;
        }

        function tip(b) {
            return b.number + ' ' + (b.seq_no || '') + ' ' + b.operation +
                ' (' + b.resource_id + ', unit ' + b.unit_no + ')\n' +
                'Start ' + dt(b.start) + '\nFinish ' + dt(b.finish) +
                '\nQty ' + num(b.qty) + ', ' + num(b.hours) + ' h' +
                (b.late ? '\nLate: want ' + UI.date(b.want_date) : '') +
                (b.frozen ? '\nFrozen' : '');
        }

        function drawChart() {
            UI.clear(gx);
            if (!chartData) {
                return;
            }
            var start = time(chartData.from);
            var end = time(chartData.to) + DAY;
            var px = pxh();
            var width = (end - start) / HOUR * px;
            var left = 170;
            var inner = el('div.gx-inner', {style: {width: (width + left) +
                'px'}});
            function x(ms) {
                return left + (ms - start) / HOUR * px;
            }
            /* The date bar */
            var dates = el('div.gx-dates', {style: {width: (width + left) +
                'px'}}, el('div.gx-corner', el('strong', chartData.schedule),
                el('div.muted', chartData.description)));
            var d = new Date(start);
            var lastMonth = -1;
            for (var ms = start; ms < end; ms += DAY) {
                d = new Date(ms);
                var today = isoLocal(ms).slice(0, 10) === info.today;
                if (state.mode === 'year') {
                    if (d.getMonth() !== lastMonth) {
                        lastMonth = d.getMonth();
                        dates.appendChild(el('div.gx-day', {style: {left:
                            x(ms) + 'px', width: (30 * 24 * px) + 'px'}},
                            MONTHS[d.getMonth()] + ' ' + d.getFullYear()));
                    }
                } else {
                    dates.appendChild(el('div.gx-day' + (today ? '.today' :
                        ''), {style: {left: x(ms) + 'px', width: (24 * px) +
                        'px'}}, state.mode === 'day' ? UI.date(isoLocal(ms)
                            .slice(0, 10)) : (d.getDate() === 1 || ms ===
                                start ? MONTHS[d.getMonth()] + ' ' : '') +
                            d.getDate()));
                }
                if (state.mode === 'day') {
                    for (var h = 0; h < 24; h++) {
                        dates.appendChild(el('div.gx-tick', {style: {left:
                            x(ms + h * HOUR) + 'px', width: px + 'px'}},
                            String(h).padStart(2, '0')));
                    }
                } else if (state.mode !== 'year') {
                    dates.appendChild(el('div.gx-tick', {style: {left: x(ms) +
                        'px', width: (24 * px) + 'px'}}, ['Su', 'Mo', 'Tu',
                        'We', 'Th', 'Fr', 'Sa'][d.getDay()]));
                }
            }
            inner.appendChild(dates);
            var barH = 18;
            chartData.rows.forEach(function (row) {
                var units = state.chart === 'resource' ? Math.max(row.units ||
                    1, 1 + row.bars.reduce(function (m, b) {
                        return Math.max(m, b.unit_no || 0);
                    }, 0)) : 1;
                var height = Math.max(units * barH + 6, 26) +
                    (state.chart === 'work_order' ? 8 : 0);
                var line = el('div.gx-row', {style: {height: height + 'px',
                    width: (width + left) + 'px'}}, el('div.gx-label', {title:
                        row.label + (row.part ? ' ' + row.part : '')},
                    el('strong', row.label), row.part ? ' ' + row.part :
                        '', state.chart === 'resource' ? el('div.muted',
                            units + ' unit(s)') : null));
                if (state.grid) {
                    for (var g = start; g < end; g += DAY) {
                        line.appendChild(el('div.gx-grid', {style: {left:
                            x(g) + 'px'}}));
                    }
                }
                if (state.capacity && row.capacity) {
                    row.capacity.forEach(function (c) {
                        c.windows.forEach(function (w) {
                            var s = time(w.start), e = time(w.end);
                            line.appendChild(el('div.gx-cap', {title:
                                dt(w.start) + ' - ' + dt(w.end).slice(-5) +
                                ', ' + w.units + ' unit(s)', style: {left:
                                    x(s) + 'px', width: Math.max((e - s) /
                                    HOUR * px, 1) + 'px', top: '3px',
                                    height: (Math.min(w.units, units) * barH) +
                                    'px'}}));
                        });
                    });
                }
                if (state.chart === 'work_order' && row.release_date &&
                        row.want_date) {
                    wantBar(line, row, x, px, units * barH + 4);
                }
                if (state.ops) {
                    row.bars.forEach(function (b) {
                        var s = time(b.start), e = time(b.finish);
                        var unit = state.chart === 'resource' ? b.unit_no || 0 :
                            0;
                        var bar = el('div' + barClass(b), {
                            title: tip(b),
                            style: {left: x(s) + 'px', width: Math.max((e -
                                s) / HOUR * px, 3) + 'px', top: (4 + unit *
                                barH) + 'px'},
                            onclick: function () {
                                state.selected = b.id;
                                drawChart();
                            },
                            ondblclick: function () {
                                openWorkOrder(b.root, b.number);
                            },
                            oncontextmenu: function (event) {
                                state.selected = b.id;
                                optionsMenu(event, b);
                                drawChart();
                            }}, state.chart === 'resource' ? b.number :
                                (b.seq_no || '') + ' ' + b.resource_id);
                        line.appendChild(bar);
                    });
                }
                inner.appendChild(line);
            });
            var now = time(info.now);
            if (now >= start && now <= end) {
                inner.appendChild(el('div.gx-now', {style: {left: x(now) +
                    'px'}}));
            }
            if (!chartData.rows.length) {
                inner.appendChild(el('p.muted', {style: {padding: '10px'}},
                    'Nothing scheduled in the load horizon: run Schedule ' +
                    'All (Scheduling > Schedule All).'));
            }
            gx.appendChild(inner);
            gx.oncontextmenu = function (event) {
                if (event.target === gx || event.target === inner ||
                        /gx-(row|cap|grid)/.test(event.target.className)) {
                    optionsMenu(event, null);
                }
            };
        }

        /* The work order's release and want dates: dragged, the work order
         * gets new dates (the desk's earlier Gantt) */
        function wantBar(line, row, x, px, top) {
            var s = time(row.release_date), e = time(row.want_date) + DAY;
            var bar = el('div.gx-want', {title: 'Release ' +
                UI.date(row.release_date) + ', want ' + UI.date(row.want_date) +
                (access.move ? ': drag to move the work order' : ''), style: {
                    left: x(s) + 'px', width: Math.max((e - s) / HOUR * px, 4) +
                        'px', top: top + 'px'}});
            line.appendChild(bar);
            if (!access.move) {
                return;
            }
            bar.addEventListener('mousedown', function (event) {
                var x0 = event.clientX;
                var days = 0;
                event.preventDefault();
                function move(ev) {
                    days = Math.round((ev.clientX - x0) / (24 * px));
                    bar.style.transform = 'translateX(' + (days * 24 * px) +
                        'px)';
                }
                function up() {
                    global.removeEventListener('mousemove', move);
                    global.removeEventListener('mouseup', up);
                    if (!days) {
                        bar.style.transform = '';
                        return;
                    }
                    Rpc.desk('reschedule', [{production: row.id, start:
                        UI.addDays(row.release_date, days), end:
                        UI.addDays(row.want_date, days)}]).then(function () {
                            UI.toast(row.label + ' moved ' + days +
                                ' day(s)', 'ok');
                            loadChart();
                        }, function (error) {
                            bar.style.transform = '';
                            failed(error);
                        });
                }
                global.addEventListener('mousemove', move);
                global.addEventListener('mouseup', up);
            });
        }

        function check(on, label) {
            return (on ? '✓ ' : '') + label;
        }

        /* Scheduling Options (the right-click of the schedule) */
        function optionsMenu(event, bar) {
            var items = [];
            if (bar && state.info) {
                /* Right-click Info */
                items.push({label: bar.number + ' seq ' + (bar.seq_no ||
                    '') + ': ' + dt(bar.start) + ' - ' + dt(bar.finish),
                    onclick: function () {}}, '-');
            }
            if (access.schedule) {
                items.push({label: 'Schedule All...', onclick: scheduleAll});
            }
            items.push('-');
            ['day', 'week', 'month', 'year'].forEach(function (m) {
                items.push({label: check(state.mode === m, 'Display Mode: ' +
                    m.charAt(0).toUpperCase() + m.slice(1)), onclick:
                    function () {
                        state.mode = m;
                        modeSel.value = m;
                        t.show(2);
                    }});
            });
            items.push({label: 'Zoom In', onclick: function () {
                state.zoom = Math.min(state.zoom * 2, 4);
                zoomSel.value = String(state.zoom);
                t.show(2);
            }}, {label: 'Zoom Out', onclick: function () {
                state.zoom = Math.max(state.zoom / 2, 0.5);
                zoomSel.value = String(state.zoom);
                t.show(2);
            }}, '-',
                {label: check(state.ops, 'Operations (F11)'), onclick:
                    function () {
                        state.ops = !state.ops;
                        drawChart();
                    }},
                {label: check(state.capacity, 'Capacity'), onclick:
                    function () {
                        state.capacity = !state.capacity;
                        drawChart();
                    }},
                {label: check(state.grid, 'Grid Lines'), onclick: function () {
                    state.grid = !state.grid;
                    drawChart();
                }}, '-');
            var sel = bar || selectedBar();
            if (sel) {
                items.push({label: 'Highlight Work Order Immediate', onclick:
                    function () {
                        state.highlight = sel.root;
                        drawChart();
                    }});
            }
            if (state.highlight) {
                items.push({label: 'Remove Highlight Immediate', onclick:
                    function () {
                        state.highlight = null;
                        state.determinant = false;
                        drawChart();
                    }}, {label: check(state.determinant,
                        'Highlight Determinant Path'), onclick: function () {
                            state.determinant = !state.determinant;
                            drawChart();
                        }});
            }
            items.push({label: check(state.info, 'Right-click Info'), onclick:
                function () {
                    state.info = !state.info;
                }}, '-');
            if (sel) {
                if (access.schedule) {
                    items.push({label: sel.frozen ? 'Unfreeze Operation' :
                        'Freeze Operation', onclick: function () {
                            freeze([sel.id], !sel.frozen);
                        }});
                }
                items.push({label: 'Open Work Order ' + sel.number, onclick:
                    function () {
                        openWorkOrder(sel.root, sel.number);
                    }}, {label: 'Work Order Details', onclick: function () {
                        woSel.value = String(sel.root);
                        t.show(1);
                    }});
            }
            UI.contextMenu(event, items);
        }

        function selectedBar() {
            if (!chartData || !state.selected) {
                return null;
            }
            var found = null;
            chartData.rows.forEach(function (r) {
                r.bars.forEach(function (b) {
                    if (b.id === state.selected) {
                        found = b;
                    }
                });
            });
            return found;
        }

        /* Tools */
        function toolsMenu(event) {
            var items = [];
            if (access.schedule) {
                items.push({label: 'Schedule All...', onclick: scheduleAll});
                if (woSel.value) {
                    items.push({label: 'Schedule Work Order', onclick:
                        scheduleWorkOrder});
                }
            }
            items.push('-', {label: 'Weekly Calendar...', onclick:
                weeklyCalendar}, {label: 'Calendar Exceptions...', onclick:
                calendarExceptions});
            if (access.schedule) {
                items.push({label: 'Set Load Horizon...', onclick:
                    loadHorizon});
            }
            items.push('-', {label: 'Export Schedule to MS Project (XML)',
                onclick: function () {
                    Rpc.desk('js_schedule_export', ['xml']).then(download,
                        failed);
                }}, {label: 'Export Schedule as CSV', onclick: function () {
                    Rpc.desk('js_schedule_export', ['csv']).then(download,
                        failed);
                }});
            UI.contextMenu(event, items);
        }

        function scheduleAll() {
            var now = info.now;
            var asOf = el('input', {type: 'datetime-local', min: now, value:
                info.scheduled_as_of && info.scheduled_as_of > now ?
                    info.scheduled_as_of : now});
            var infinite = el('input', {type: 'checkbox', checked:
                info.infinite || null});
            var hard = el('input', {type: 'checkbox', checked:
                info.hard_release_dates || null});
            var sortBy = select([['want', 'Order Want Date'],
                ['priority', 'Priority Want Date']], info.sort_by);
            var started = select([['normal', 'Normally'],
                ['first', "First, Don't Freeze Started Operations"],
                ['first_freeze', 'First, Freeze Started Operations']],
                info.started);
            var progress = el('p.muted', '');
            UI.modal('Schedule All Orders', el('div.pl-form',
                field('Schedule ID', el('input', {type: 'text', readonly: true,
                    value: info.code})),
                field('Schedule as of', asOf),
                field(el('span', 'Infinite Schedule'), infinite, 'check'),
                field(el('span', 'Treat Release Dates as Hard'), hard,
                    'check'),
                field('Sort By', sortBy),
                field('Schedule Started Work Orders', started),
                el('p.muted.wide', 'Firm and Released work orders are ' +
                    'scheduled forward on the calendars; a finite schedule ' +
                    'loads the finite resources up to their capacity. ' +
                    'Frozen operations do not move.'), progress), [
                    {label: 'Cancel'},
                    {label: 'OK', primary: true, onclick: function (close) {
                        progress.textContent = 'Scheduling...';
                        Rpc.desk('js_schedule_all', [{as_of: asOf.value ||
                            null, infinite: infinite.checked,
                            hard_release_dates: hard.checked, sort_by:
                            sortBy.value, started: started.value}]).then(
                            function (r) {
                                close();
                                UI.toast(r.orders + ' work order(s), ' +
                                    r.operations + ' operation(s) ' +
                                    'scheduled; ' + r.late + ' late', 'ok');
                                refresh();
                            }, function (e) {
                                progress.textContent = '';
                                failed(e);
                            });
                        return true;
                    }}]);
            widen('pl-mid');
        }

        function scheduleWorkOrder() {
            var id = parseInt(woSel.value, 10);
            Rpc.desk('js_schedule_work_order', [id]).then(function () {
                UI.toast('Work order scheduled', 'ok');
                refresh();
            }, failed);
        }

        function loadHorizon() {
            var days = el('input', {type: 'number', min: 1, value:
                info.load_horizon});
            UI.modal('Set Load Horizon', field('Set Load Horizon (Days)',
                days), [{label: 'Cancel'}, {label: 'OK', primary: true,
                    onclick: function () {
                        Rpc.desk('js_schedule_settings', [{load_horizon:
                            parseInt(days.value, 10) || 90}]).then(
                            function () {
                                refresh();
                            }, failed);
                    }}]);
        }

        function resourceChooser(onchange) {
            var sel = el('select', el('option', {value: ''}, 'All'),
                info.resources.map(function (r) {
                    return el('option', {value: r.id}, r.name);
                }));
            sel.addEventListener('change', onchange);
            return sel;
        }

        /* Weekly Calendar (Shopfloor's calendars) */
        function weeklyCalendar() {
            var editable = access.calendar;
            var table = el('table.pl-edit');
            var rows = {};
            var resource = resourceChooser(load);
            function load() {
                var id = resource.value ? parseInt(resource.value, 10) : null;
                Rpc.searchRead('nline.js.calendar.week', [['resource', '=',
                    id], ['employee', '=', null]], ['day_of_week',
                    'start_of_day', 'shift_1', 'shift_2', 'shift_3',
                    'shift_1_capacity', 'shift_2_capacity',
                    'shift_3_capacity']).then(function (records) {
                        var byDay = {};
                        records.forEach(function (r) {
                            byDay[r.day_of_week] = r;
                        });
                        UI.clear(table).appendChild(el('tr',
                            ['Day of Week', '1st Shift Start', 'Shift 1',
                                'Shift 2', 'Shift 3', 'Cap 1', 'Cap 2',
                                'Cap 3'].map(function (h) {
                                    return el('th', h);
                                })));
                        JS_DAYS.forEach(function (day) {
                            var r = byDay[day[0]] || {};
                            var c = {
                                id: r.id || null,
                                start: el('input', {type: 'time', value:
                                    tryTime(r.start_of_day)}),
                                s1: el('input', {type: 'number', step: 'any',
                                    value: r.shift_1 === undefined ||
                                        r.shift_1 === null ? '' : r.shift_1}),
                                s2: el('input', {type: 'number', step: 'any',
                                    value: r.shift_2 === undefined ||
                                        r.shift_2 === null ? '' : r.shift_2}),
                                s3: el('input', {type: 'number', step: 'any',
                                    value: r.shift_3 === undefined ||
                                        r.shift_3 === null ? '' : r.shift_3}),
                                c1: el('input', {type: 'number', value:
                                    r.shift_1_capacity === undefined ||
                                    r.shift_1_capacity === null ? '' :
                                        r.shift_1_capacity}),
                                c2: el('input', {type: 'number', value:
                                    r.shift_2_capacity === undefined ||
                                    r.shift_2_capacity === null ? '' :
                                        r.shift_2_capacity}),
                                c3: el('input', {type: 'number', value:
                                    r.shift_3_capacity === undefined ||
                                    r.shift_3_capacity === null ? '' :
                                        r.shift_3_capacity})
                            };
                            ['start', 's1', 's2', 's3', 'c1', 'c2', 'c3']
                                .forEach(function (k) {
                                    c[k].disabled = !editable;
                                });
                            rows[day[0]] = c;
                            table.appendChild(el('tr', el('td', day[1]),
                                el('td', c.start), el('td', c.s1),
                                el('td', c.s2), el('td', c.s3),
                                el('td', c.c1), el('td', c.c2),
                                el('td', c.c3)));
                        });
                    }, failed);
            }
            function save() {
                var id = resource.value ? parseInt(resource.value, 10) : null;
                var calls = [];
                Object.keys(rows).forEach(function (day) {
                    var c = rows[day];
                    var values = {
                        start_of_day: toTime(c.start.value),
                        shift_1: numOrNull(c.s1), shift_2: numOrNull(c.s2),
                        shift_3: numOrNull(c.s3),
                        shift_1_capacity: intOrNull(c.c1),
                        shift_2_capacity: intOrNull(c.c2),
                        shift_3_capacity: intOrNull(c.c3)
                    };
                    if (c.id) {
                        calls.push(Rpc.model('nline.js.calendar.week',
                            'write', [[c.id], values]));
                    } else if (values.shift_1 || values.shift_2 ||
                            values.shift_3) {
                        calls.push(Rpc.model('nline.js.calendar.week',
                            'create', [[Object.assign({day_of_week: day,
                                resource: id}, values)]]));
                    }
                });
                return Promise.all(calls).then(function () {
                    UI.toast('Weekly calendar saved: run Schedule All to ' +
                        'use it', 'ok');
                    load();
                }, failed);
            }
            UI.modal('Weekly Calendar', el('div', el('div.pl-form',
                field('Schedule ID', el('input', {type: 'text', readonly:
                    true, value: info.code})), field('Resource ID',
                    resource)), el('p.muted', 'Resource All: the shop\'s ' +
                    'calendar; a resource\'s own days replace it. Hours per ' +
                    'shift; capacity empty: the resource\'s.'), table),
                editable ? [{label: 'Close'}, {label: 'Apply', primary: true,
                    onclick: function () {
                        save();
                        return true;
                    }}] : [{label: 'Close', primary: true}]);
            widen('pl-mid');
            load();
        }

        /* Calendar Exceptions */
        function calendarExceptions() {
            var editable = access.calendar;
            var table = el('table.pl-edit');
            var lines = [];
            var deleted = [];
            var reasons = [];
            var resource = resourceChooser(load);
            Rpc.searchRead('nline.reason_code', [], ['rec_name']).then(
                function (r) {
                    reasons = r;
                }, function () {});
            function rowOf(r) {
                function input(type, value) {
                    var i = el('input', {type: type, step: type === 'number' ?
                        'any' : null, value: value === undefined ||
                        value === null ? '' : value});
                    i.disabled = !editable;
                    return i;
                }
                var c = {
                    id: r.id || null,
                    start: input('date', r.start_date || UI.today()),
                    end: input('date', r.end_date || UI.today()),
                    sod: input('time', tryTime(r.start_of_day)),
                    s1: input('number', r.shift_1),
                    s2: input('number', r.shift_2),
                    s3: input('number', r.shift_3),
                    c1: input('number', r.shift_1_capacity),
                    c2: input('number', r.shift_2_capacity),
                    c3: input('number', r.shift_3_capacity),
                    reason: el('select', el('option', {value: ''}, ''),
                        reasons.map(function (x) {
                            return el('option', {value: x.id, selected:
                                r.reason_code === x.id || null}, x.rec_name);
                        }))
                };
                c.reason.disabled = !editable;
                c.tr = el('tr', {onclick: function () {
                    lines.forEach(function (l) {
                        l.tr.classList.toggle('sel', l === c);
                    });
                    c.selected = true;
                }}, el('td', c.start), el('td', c.end), el('td', c.sod),
                    el('td', c.s1), el('td', c.s2), el('td', c.s3),
                    el('td', c.c1), el('td', c.c2), el('td', c.c3),
                    el('td', c.reason));
                return c;
            }
            function draw() {
                UI.clear(table).appendChild(el('tr', ['Start Date',
                    'End Date', 'Start of Day', 'Shift 1', 'Shift 2',
                    'Shift 3', 'Cap 1', 'Cap 2', 'Cap 3', 'Reason'].map(
                    function (h) {
                        return el('th', h);
                    })));
                lines.forEach(function (l) {
                    table.appendChild(l.tr);
                });
            }
            function load() {
                var id = resource.value ? parseInt(resource.value, 10) : null;
                deleted = [];
                Rpc.searchRead('nline.js.calendar.change', [['resource', '=',
                    id], ['employee', '=', null]], ['start_date', 'end_date',
                    'start_of_day', 'shift_1', 'shift_2', 'shift_3',
                    'shift_1_capacity', 'shift_2_capacity',
                    'shift_3_capacity', 'reason_code']).then(
                    function (records) {
                        lines = records.map(rowOf);
                        draw();
                    }, failed);
            }
            function apply() {
                var id = resource.value ? parseInt(resource.value, 10) : null;
                var calls = [];
                lines.forEach(function (c) {
                    var values = {
                        start_date: c.start.value ? Rpc.date(c.start.value) :
                            null,
                        end_date: c.end.value ? Rpc.date(c.end.value) : null,
                        start_of_day: toTime(c.sod.value),
                        shift_1: numOrNull(c.s1), shift_2: numOrNull(c.s2),
                        shift_3: numOrNull(c.s3),
                        shift_1_capacity: intOrNull(c.c1),
                        shift_2_capacity: intOrNull(c.c2),
                        shift_3_capacity: intOrNull(c.c3),
                        reason_code: c.reason.value ? parseInt(c.reason.value,
                            10) : null
                    };
                    if (c.id) {
                        calls.push(Rpc.model('nline.js.calendar.change',
                            'write', [[c.id], values]));
                    } else {
                        calls.push(Rpc.model('nline.js.calendar.change',
                            'create', [[Object.assign({resource: id},
                                values)]]));
                    }
                });
                if (deleted.length) {
                    calls.push(Rpc.model('nline.js.calendar.change', 'delete',
                        [deleted]));
                }
                return Promise.all(calls).then(function () {
                    UI.toast('Calendar exceptions saved: run Schedule All ' +
                        'to use them', 'ok');
                    load();
                }, failed);
            }
            var buttons = el('div.pl-bar', el('button', {type: 'button',
                onclick: function () {
                    lines.push(rowOf({}));
                    draw();
                }}, 'Insert'), el('button', {type: 'button', onclick:
                function () {
                    lines = lines.filter(function (l) {
                        if (l.selected && l.id) {
                            deleted.push(l.id);
                        }
                        return !l.selected;
                    });
                    draw();
                }}, 'Delete'));
            UI.modal('Calendar Exceptions', el('div', el('div.pl-form',
                field('Schedule ID', el('input', {type: 'text', readonly: true,
                    value: info.code})), field('Resource ID', resource)),
                el('p.muted', 'Hours per shift for the dates (0: no work); ' +
                    'enter capacities only to change the resource\'s.'),
                editable ? buttons : null, table),
                editable ? [{label: 'Close'}, {label: 'Apply', primary: true,
                    onclick: function () {
                        apply();
                        return true;
                    }}] : [{label: 'Close', primary: true}]);
            widen();
            load();
        }

        function build() {
            body.appendChild(header);
            showHeader();
            resGrid = grid(opColumns(true), {id: 'id', menu: opMenu, open:
                function (r) {
                    openWorkOrder(r.root, r.work_id);
                }, empty: 'Nothing scheduled: run Schedule All.'});
            fillResources();
            viewType.addEventListener('change', function () {
                state.viewType = viewType.value;
                fillResources();
                loadResources();
            });
            resourceSel.addEventListener('change', function () {
                loadResources();
            });
            if (!info.views.length) {
                viewType.disabled = true;
            }
            resPane.appendChild(el('div.pl-bar', field('View Type', viewType),
                field('Shop Resource ID / Shop View ID', resourceSel),
                el('span.spacer'), el('button', {type: 'button', onclick:
                    function () {
                        state.chart = 'resource';
                        bySel.value = 'resource';
                        t.show(2);
                    }}, 'Schedule')));
            resPane.appendChild(resGrid.node);

            woGrid = grid(opColumns(false), {id: 'id', menu: opMenu, open:
                function (r) {
                    openWorkOrder(r.root, r.work_id);
                }, empty: 'Choose a scheduled work order.'});
            fillWorkOrders();
            woSel.addEventListener('change', loadWorkOrder);
            woPane.appendChild(el('div.pl-bar', field('Work ID', woSel),
                el('span.spacer'), access.schedule ? el('button', {type:
                    'button', onclick: function () {
                        if (woSel.value) {
                            scheduleWorkOrder();
                        }
                    }}, 'Schedule Work Order') : null, el('button', {type:
                    'button', onclick: function () {
                        if (woSel.value) {
                            state.chart = 'work_order';
                            state.chartWorkOrder = true;
                            state.highlight = parseInt(woSel.value, 10);
                            bySel.value = 'work_order';
                            t.show(2);
                        }
                    }}, 'Schedule'), el('button', {type: 'button', onclick:
                    function () {
                        if (woSel.value) {
                            openWorkOrder(parseInt(woSel.value, 10));
                        }
                    }}, 'Open Work Order')));
            woPane.appendChild(woHead);
            woPane.appendChild(woGrid.node);

            modeSel.addEventListener('change', function () {
                state.mode = modeSel.value;
                drawChart();
            });
            zoomSel.addEventListener('change', function () {
                state.zoom = parseFloat(zoomSel.value);
                drawChart();
            });
            bySel.addEventListener('change', function () {
                state.chart = bySel.value;
                state.chartWorkOrder = false;
                loadChart();
            });
            chartPane.appendChild(el('div.pl-bar', field('Display Mode',
                modeSel), field('Zoom', zoomSel), field('View', bySel),
                el('span.spacer'), el('div.gx-legend',
                    el('span', el('i', {style: {background: '#9cc8f0'}}),
                        'Scheduled'),
                    el('span', el('i', {style: {background: '#ef8a80'}}),
                        'Late'),
                    el('span', el('i', {style: {background: '#f7e463'}}),
                        'Work order immediate'),
                    el('span', el('i', {style: {background: '#6cc66c'}}),
                        'Determinant path'),
                    el('span', el('i', {style: {background: '#4169e1'}}),
                        'Frozen'),
                    el('span', el('i', {style: {background: '#fff',
                        border: '1px solid #c8d0d8'}}), 'Capacity'))));
            chartPane.appendChild(gx);

            body.appendChild(t.bar);
            panes.forEach(function (p) {
                body.appendChild(p.node);
            });
            t.show(0);

            document.addEventListener('keydown', function (event) {
                if (!body.isConnected) {
                    return;
                }
                if (event.key === 'F5') {
                    event.preventDefault();
                    refresh();
                } else if (event.key === 'F11' && t.current() === 2) {
                    event.preventDefault();
                    state.ops = !state.ops;
                    drawChart();
                }
            });
        }
    };
}(window));
