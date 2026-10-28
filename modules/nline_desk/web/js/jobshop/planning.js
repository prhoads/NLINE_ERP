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
            '.gx-label { position: sticky; left: 0; z-index: 2; width: 190px; ' +
                'height: 100%; background: var(--paper); border-right: ' +
                '1px solid var(--line); padding: 3px 6px; box-sizing: ' +
                'border-box; overflow: hidden; white-space: nowrap; ' +
                'text-overflow: ellipsis; }',
            '.gx-corner { position: sticky; left: 0; z-index: 4; width: 190px; ' +
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
            '.gx-empty { margin: 0 0 6px; padding: 6px 10px; border: 1px ' +
                'solid #e0c36a; background: #fff8dc; border-radius: 4px; ' +
                'font-size: 13px; }',
            '.gx-empty strong { margin-right: 4px; }',
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
            'table.pl-edit input[type=time] { width: 90px; }',
            '.pl-grid input.pl-cell { width: 80px; text-align: right; ' +
                'font: inherit; padding: 1px 3px; }',
            '.pl-totals { display: flex; gap: 14px; justify-content: ' +
                'flex-end; margin: 4px 0; }',
            '.pl-totals label { display: flex; gap: 6px; align-items: ' +
                'center; font-size: 13px; color: var(--muted); }',
            '.pl-totals input { width: 110px; text-align: right; }',
            '.pl-radios { display: flex; flex-direction: column; gap: 2px; ' +
                'font-size: 12.5px; justify-content: space-around; }',
            '.js-ctl .pl-radios input { width: auto; height: auto; ' +
                'margin: 0 4px 0 0; }',
            '.pl-radios label { justify-content: flex-start; }',
            '.pl-late { color: var(--bad); font-weight: 600; }',
            '.pl-radios label { display: flex; gap: 4px; align-items: ' +
                'center; white-space: nowrap; }',
            '.pl-sd { margin-top: 8px; }',
            '.pl-sd .pl-grid { max-height: 260px; }'
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

    /* grid(columns [{key, label, type: num|date|dt|check|text, cls(row),
     * edit (a number the user changes)}], {id, menu(event, rows),
     * open(row), empty, onselect(rows), onedit(row)}): click a row (Ctrl,
     * Shift for several), click a column header to sort (Shift:
     * descending), right-click for the options of the section;
     * browseItems() gives Jobshop's Browse menu items (Filter Including /
     * Excluding the right-clicked value, Filter by..., Remove Last
     * Filter, Remove Filters/Sort) */
    function grid(columns, options) {
        var rows = [];
        var selected = {};
        var anchor = null;
        var sort = null;
        var desc = false;
        var filters = [];
        var clicked = null;
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
            if (c.edit) {
                var input = el('input.pl-cell', {type: 'number', step: 'any',
                    value: v === null || v === undefined ? '' :
                        String(Math.round(v * 10000) / 10000),
                    onmousedown: function (event) {
                        event.stopPropagation();
                    },
                    onchange: function () {
                        row[c.key] = input.value === '' ? 0 :
                            parseFloat(input.value);
                        if (row.unit_mat_cost !== undefined &&
                                row.order_qty !== undefined) {
                            row.estimated_cost = (row.unit_mat_cost || 0) *
                                (row.order_qty || 0);
                        }
                        render();
                        if (options.onedit) {
                            options.onedit(row);
                        }
                    }});
                return el('td.num', input);
            }
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

        function text(row, c) {
            var v = value(row, c);
            if (c.type === 'date') {
                return v ? UI.date(v) : '';
            }
            if (c.type === 'num') {
                return num(v);
            }
            if (c.type === 'check') {
                return v ? 'Y' : 'N';
            }
            return v === null || v === undefined ? '' : String(v);
        }

        function filtered() {
            return rows.filter(function (row) {
                return filters.every(function (f) {
                    var c = columns.filter(function (x) {
                        return x.key === f.key;
                    })[0];
                    var t = text(row, c).toLowerCase();
                    var match = f.like ? t.indexOf(f.value.toLowerCase()) >=
                        0 : t === f.value.toLowerCase();
                    return f.exclude ? !match : match;
                });
            });
        }

        function sorted() {
            var list = filtered();
            if (!sort) {
                return list;
            }
            var c = columns.filter(function (x) {
                return x.key === sort;
            })[0];
            return list.sort(function (a, b) {
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
                var tr;
                tr = el('tr' + (selected[key(row)] ? '.sel' : ''), {
                    onmousedown: function (event) {
                        if (event.button === 2 && selected[key(row)]) {
                            return;
                        }
                        choose(list, index, event);
                    },
                    oncontextmenu: function (event) {
                        var td = event.target.closest('td');
                        var i = td ? Array.prototype.indexOf.call(
                            tr.children, td) - 1 : -1;
                        clicked = i >= 0 ? {column: columns[i], row: row} :
                            null;
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
                    columns.length + 1}, filters.length ? 'No line ' +
                    'matches the filters.' : options.empty ||
                    'Nothing to show.')));
            }
        }

        function addFilter(f) {
            filters.push(f);
            render();
        }

        function filterBy() {
            var column = select(columns.map(function (c) {
                return [c.key, c.label];
            }), clicked ? clicked.column.key : columns[0].key);
            var how = select([['in', 'Including'], ['ex', 'Excluding']],
                'in');
            var input = el('input', {type: 'text', value: clicked ?
                text(clicked.row, clicked.column) : ''});
            UI.modal('Filter by', el('div.pl-form', field('Column', column),
                field('Filter', how), field('Value (contains)', input,
                    'wide')), [{label: 'Cancel'}, {label: 'OK', primary:
                    true, onclick: function () {
                        addFilter({key: column.value, value: input.value,
                            like: true, exclude: how.value === 'ex'});
                    }}]);
        }

        function browseItems() {
            var items = [];
            if (clicked && clicked.column) {
                var c = clicked.column;
                var v = text(clicked.row, c);
                items.push({label: 'Filter Including', onclick: function () {
                    addFilter({key: c.key, value: v});
                }}, {label: 'Filter Excluding', onclick: function () {
                    addFilter({key: c.key, value: v, exclude: true});
                }});
            }
            items.push({label: 'Filter by...', onclick: filterBy});
            if (filters.length) {
                items.push({label: 'Remove Last Filter', onclick: function () {
                    filters.pop();
                    render();
                }});
            }
            items.push({label: 'Remove Filters/Sort', onclick: function () {
                filters = [];
                sort = null;
                render();
            }});
            return items;
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
            selection: selection,
            browseItems: browseItems
        };
    }

    /* Tabs: [{title, node}] -> {bar, show(i), current()}; the window's
     * tabs are the frame's (.tabs / .tab-pane), nested ones (a dialog's
     * Sales / Work / Purchase Orders) small ones of their own */
    function tabs(list, onshow, nested) {
        var current = 0;
        var bar = el(nested ? 'div.pl-tabs' : 'div.tabs', {role: 'tablist'});
        var buttons = list.map(function (t, i) {
            if (!nested) {
                t.node.classList.add('tab-pane', 'panel');
            }
            var b = el(nested ? 'button' : 'button.tab', {type: 'button',
                role: 'tab', onclick: function () {
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

    /* ---- Menus -------------------------------------------------------- */

    /* A Jobshop menu (ribbon ▾ menu or right-click popup) at a mouse event
     * or under a node: items [{label, onclick} | '-' | {label, items}] (a
     * submenu ▸ opens in its place) */
    function popup(where, items) {
        var x = 40, y = 80;
        if (where && where.clientX !== undefined) {
            x = where.clientX;
            y = where.clientY;
        } else if (where && where.getBoundingClientRect) {
            var rect = where.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom;
        }
        if (where && where.preventDefault) {
            where.preventDefault();
        }
        var at = {preventDefault: function () {}, clientX: x, clientY: y};
        if (NATIVE_MENUS) {
            UI.contextMenu(at, (function clean(list) {
                return list.filter(Boolean).map(function (item) {
                    return item !== '-' && item.items ? {label: item.label,
                        items: clean(item.items)} : item;
                });
            }(items)));
            return;
        }
        UI.contextMenu(at, items.filter(Boolean).map(function (item) {
            if (item !== '-' && item.items) {
                return {label: item.label + ' ▸', onclick: function () {
                    popup(at, item.items);
                }};
            }
            return item;
        }).filter(function (item) {
            return item === '-' || item.label;
        }));
    }

    /* A submenu: null when it has no item (the user may not use any) */
    function sub(label, items) {
        items = (items || []).filter(Boolean);
        return items.length ? {label: label, items: items} : null;
    }

    /* The frame's menus have submenus and check marks of their own (a
     * frame without them: ▸ reopens the menu, ✓ in the label) */
    var NATIVE_MENUS = !!UI.placedForm;

    function mark(on, label) {
        return NATIVE_MENUS ? label : (on ? '✓ ' : '   ') + label;
    }

    /* ---- Jobshop's layout ---------------------------------------------- */

    /* The fields of a dialog where Jobshop has them (its layout file:
     * at [l, t, r, b], split = the label's width; frames = its group
     * boxes, buttons = its buttons): spec {fields: [{label, at, split,
     * type ('boolean' for a check box), node}], frames, buttons}. Without
     * the frame's placedForm, a plain two-column form. */
    function placed(spec) {
        if (UI.placedForm) {
            return UI.placedForm(spec, function (f) {
                return {node: f.node};
            });
        }
        return el('div.pl-form', spec.fields.map(function (f) {
            return f.type === 'boolean' ? el('label.check', f.node,
                f.label) : el('label', f.label, f.node);
        }), (spec.buttons || []).map(function (b) {
            return el('button', {type: 'button', onclick: b.onclick},
                b.label);
        }));
    }

    function radioGroup(name, options, value) {
        return el('div.pl-radios', options.map(function (o) {
            return el('label', el('input', {type: 'radio', name: name,
                value: o[0], checked: o[0] === value || null}), ' ', o[1]);
        }));
    }

    function radioValue(root, name) {
        var r = root.querySelector('input[name="' + name + '"]:checked');
        return r ? r.value : null;
    }

    /* ---- Supply & Demand ---------------------------------------------- */

    /* Jobshop's Supply & Demand (dlgStockedPartNetting: StockedPartHorizon
     * Date, StockedPartSalesOrders / WorkOrders / PurchaseOrders): the
     * Horizon, the Part ID (another part can be chosen), its Inactive, Eng
     * Master Rev, Stock UM and Drawing ID / Rev, Refresh, and a tab of the
     * sales orders, work orders and purchase orders with their running
     * Demand / Supply and the Projected Available after each line.
     * -> {node, load(productId)} */
    function supplyDemandPane(options) {
        options = options || {};
        var product = null;
        var screens = {};
        allowedScreens(['orders', 'work-orders', 'purchase-orders']).then(
            function (s) {
                screens = s;
            });
        /* Horizon: empty, no horizon */
        var horizon = el('input', {type: 'date', title: 'Only the orders ' +
            'up to this date (empty: all)'});
        horizon.addEventListener('change', reload);
        var part = UI.picker('product.product', {placeholder: 'Part ID',
            label: 'Part ID', onselect: function (record) {
                product = record.id;
                reload();
            }});
        var description = el('input', {type: 'text', readonly: true});
        var inactive = el('input', {type: 'checkbox', disabled: true});
        var master = el('select');
        var stockUm = el('input', {type: 'text', readonly: true, size: 6});
        var drawing = el('input', {type: 'text', readonly: true, size: 14});
        var drawingRev = el('input', {type: 'text', readonly: true, size: 5});

        function open(kind) {
            return function (row) {
                if (kind === 'sale' && screens.orders) {
                    UI.openScreen('orders/' + row.sale, 'Order ' +
                        row.order_id);
                } else if (kind === 'production') {
                    if (screens['work-orders']) {
                        UI.openScreen('work-orders/' + row.production, 'WO ' +
                            row.number);
                    } else {
                        UI.openRecord('production', row.production,
                            row.number);
                    }
                } else if (kind === 'purchase' && screens['purchase-orders']) {
                    UI.openScreen('purchase-orders/' + row.purchase, 'PO ' +
                        row.order_id);
                }
            };
        }
        var proj = {key: 'projected', label: 'Projected Available',
            type: 'num', cls: function (r) {
                return r.projected < 0 ? 'red' : '';
            }};
        var sales = grid([
            {key: 'order_id', label: 'Order ID'},
            {key: 'line_no', label: 'Line No', type: 'num'},
            {key: 'status', label: 'Status'},
            {key: 'ship_date', label: 'Ship Date', type: 'date'},
            {key: 'demand_qty', label: 'Demand Qty', type: 'num'},
            proj,
            {key: 'drawing_id', label: 'Drawing ID'},
            {key: 'drawing_rev', label: 'Rev'},
            {key: 'eng_id', label: 'Eng Master Revision'},
            {key: 'links', label: 'Links'}
        ], {id: 'i', empty: 'No open sales order.', open: open('sale')});
        var works = grid([
            {key: 'coproduct', label: 'Co-Product', type: 'check'},
            {key: 'work_id', label: 'Work ID'},
            {key: 'lot_id', label: 'Lot ID'},
            {key: 'split_id', label: 'Split ID'},
            {key: 'sub_id', label: 'Sub ID'},
            {key: 'seq_no', label: 'Seq No', type: 'num'},
            {key: 'piece_no', label: 'Piece No', type: 'num'},
            {key: 'status', label: 'Status'},
            {key: 'release_date', label: 'Desired Release Date',
                type: 'date'},
            {key: 'want_date', label: 'Want Date', type: 'date'},
            {key: 'finish_date', label: 'Scheduled Finish Date',
                type: 'date'},
            {key: 'supply_qty', label: 'Supply Qty', type: 'num'},
            {key: 'demand_qty', label: 'Demand Qty', type: 'num'},
            proj,
            {key: 'drawing_id', label: 'Drawing ID'},
            {key: 'drawing_rev', label: 'Rev'},
            {key: 'eng_id', label: 'Eng Master Revision'}
        ], {id: 'i', empty: 'No open work order.', open: open('production')});
        var purchases = grid([
            {key: 'order_id', label: 'Order ID'},
            {key: 'line_no', label: 'Line No', type: 'num'},
            {key: 'status', label: 'Status'},
            {key: 'receive_date', label: 'Receive Date', type: 'date'},
            {key: 'supply_qty', label: 'Supply Qty', type: 'num'},
            proj,
            {key: 'drawing_id', label: 'Drawing ID'},
            {key: 'drawing_rev', label: 'Rev'},
            {key: 'links', label: 'Links'}
        ], {id: 'i', empty: 'No open purchase order.',
            open: open('purchase')});
        function total(label) {
            return el('input', {type: 'text', readonly: true, size: 10,
                'aria-label': label});
        }
        var soDemand = total('Demand'), woDemand = total('Demand'),
            woSupply = total('Supply'), poSupply = total('Supply');
        var panes = [
            {title: 'Sales Orders', node: el('div', sales.node,
                el('div.pl-totals', field('Demand', soDemand)))},
            {title: 'Work Orders', node: el('div', works.node,
                el('div.pl-totals', field('Supply', woSupply),
                    field('Demand', woDemand)))},
            {title: 'Purchase Orders', node: el('div', purchases.node,
                el('div.pl-totals', field('Supply', poSupply)))}];
        var t = tabs(panes, null, true);
        /* StockedPartHorizonDate */
        var node = el('div.pl-sd',
            placed({fields: [
                {label: 'Horizon', at: [12, 4, 180, 24], split: 60, node:
                    horizon},
                {label: 'Part ID', at: [188, 4, 432, 24], split: 84, node:
                    part.node},
                {label: '', at: [436, 4, 826, 24], split: 0, node:
                    description},
                {label: 'Inactive', at: [76, 26, 178, 46], type: 'boolean',
                    node: inactive},
                {label: 'Eng Master Rev', at: [182, 26, 363, 46], split: 90,
                    node: master},
                {label: 'Stock UM', at: [371, 27, 521, 47], split: 70, node:
                    stockUm},
                {label: 'Drawing ID/Rev', at: [529, 27, 742, 47], split: 93,
                    node: drawing},
                {label: '/', at: [744, 27, 826, 47], split: 11, node:
                    drawingRev}],
                buttons: [{label: 'Refresh', at: [832, 5, 925, 46],
                    onclick: reload}]}),
            t.bar, panes.map(function (p) {
                return p.node;
            }));
        t.show(0);

        function last(rows, key) {
            return rows.length ? num(rows[rows.length - 1][key]) : '0';
        }

        function reload() {
            if (!product) {
                return;
            }
            Rpc.desk('js_supply_demand', [product, horizon.value || null])
                .then(function (data) {
                    part.set(data.product, data.part_id);
                    part.input.title = data.description || '';
                    description.value = data.description || '';
                    inactive.checked = !!data.inactive;
                    UI.clear(master);
                    (data.masters.length ? data.masters : [data.eng_id ||
                        '']).forEach(function (m) {
                            master.appendChild(el('option', {selected:
                                m === data.eng_id || null}, m));
                        });
                    stockUm.value = data.stock_um || '';
                    drawing.value = data.drawing_id || '';
                    drawingRev.value = data.drawing_rev || '';
                    function index(rows) {
                        return rows.map(function (r, i) {
                            return Object.assign({i: i}, r);
                        });
                    }
                    sales.set(index(data.sales));
                    works.set(index(data.work_orders));
                    purchases.set(index(data.purchases));
                    soDemand.value = last(data.sales, 'demand');
                    woDemand.value = last(data.work_orders, 'demand');
                    woSupply.value = last(data.work_orders, 'supply');
                    poSupply.value = last(data.purchases, 'supply');
                }, failed);
        }

        return {node: node, load: function (id) {
            product = id;
            reload();
        }};
    }

    function supplyDemand(product) {
        var pane = supplyDemandPane();
        UI.modal('Supply & Demand', pane.node);
        widen();
        pane.load(product);
    }

    global.JobshopPlanning = {supplyDemand: supplyDemand};

    /* ---- Create New Work Order ---------------------------------------- */

    /* The dialog of Jobshop (NewWOLink) for a part: opts {want, quantity,
     * cards, description, status, salesId} -> Promise of the work order */
    function createWorkOrder(product, opts) {
        opts = opts || {};
        return Rpc.desk('js_planning_new_work_order', [product,
            opts.want || null, opts.quantity === undefined ? null :
            opts.quantity]).then(function (d) {
            return new Promise(function (resolve, reject) {
                var id = el('input', {type: 'text', maxlength: 15,
                    placeholder: 'Next'});
                /* Disabled in Jobshop too */
                var useSales = el('input', {type: 'checkbox', disabled: true});
                var lot = el('input', {type: 'text', maxlength: 3,
                    value: '1'});
                var split = el('input', {type: 'text', maxlength: 3,
                    value: '0'});
                var master = select(d.masters.map(function (m) {
                    return [m.id, m.name + (m.current ? ' (current)' : '')];
                }), d.product_bom);
                var release = el('input', {type: 'date', value:
                    d.release_date});
                var want = el('input', {type: 'date', value: d.want_date});
                var qty = el('input', {type: 'number', step: 'any', min: 0,
                    value: d.quantity});
                var rank = el('input', {type: 'number', min: 1, max: 999,
                    value: d.global_rank});
                var status = select([['Unreleased', 'Unreleased'],
                    ['Firm', 'Firm'], ['Hold', 'Hold'],
                    ['Released', 'Released']], opts.status || d.status);
                var forward = el('input', {type: 'checkbox'});
                var partInput = el('input', {type: 'text', readonly: true,
                    value: d.part_id, title: d.description});
                if (!d.masters.length) {
                    master = el('select', {disabled: true, title: 'No ' +
                        'engineering master: the work order has its header ' +
                        'card only.'});
                }
                /* NewWOLink */
                var body = placed({frames: [{label: '', at: [7, 150, 431,
                    245]}], fields: [
                    {label: 'New Work ID', at: [16, 10, 279, 30], split: 106,
                        node: id},
                    {label: 'Use Sales ID as Work ID', at: [287, 10, 436,
                        30], type: 'boolean', node: useSales},
                    {label: 'New Lot ID', at: [16, 32, 174, 52], split: 106,
                        node: lot},
                    {label: 'New Split ID', at: [16, 54, 174, 74],
                        split: 106, node: split},
                    {label: 'Part ID', at: [16, 76, 429, 96], split: 106,
                        node: partInput},
                    {label: 'Description', at: [16, 98, 429, 118],
                        split: 106, node: el('input', {type: 'text',
                            readonly: true, value: opts.description ||
                                d.description})},
                    {label: 'Eng Master Rev', at: [16, 120, 230, 140],
                        split: 106, node: master},
                    {label: 'Release Date', at: [16, 155, 230, 175],
                        split: 106, node: release},
                    {label: 'Status', at: [252, 155, 425, 175], split: 57,
                        node: status},
                    {label: 'Want Date', at: [16, 177, 230, 197], split: 106,
                        node: want},
                    {label: 'Order Qty', at: [16, 199, 230, 219], split: 106,
                        node: qty},
                    {label: 'Global Rank', at: [16, 221, 183, 241],
                        split: 106, node: rank},
                    {label: 'Forward Schedule', at: [200, 221, 400, 241],
                        type: 'boolean', node: forward}]});
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
                            global_rank: rank.value === '' ? null :
                                parseInt(rank.value, 10),
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

    /* ---- Create Purchase Order / Request For Quote for Supplier -------- */

    /* The suppliers of the rows (the part's or the service's), then Other:
     * a lookup; for stocked parts the quantities to order. what: 'po' or
     * 'rfq' */
    function purchaseDialog(kind, rows, idKey, what) {
        var rfq = what === 'rfq';
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
                    el('th', rfq ? 'Quote Qty' : 'Order Qty')),
                    rows.map(function (r) {
                        inputs[r[idKey]] = el('input', {type: 'number',
                            step: 'any', min: 0, value: r.order_qty ||
                                r.suggested});
                        return el('tr', el('td', r.part_id), el('td',
                            r.description), el('td.num', num(r.projected)),
                            el('td', inputs[r[idKey]]));
                    }));
            }
            var title = rfq ? 'Create Request For Quote for Supplier' :
                'Create Purchase Order for Supplier';
            var body = el('div',
                el('p.muted', rows.length + ' line(s) selected; identical ' +
                    'parts are one ' + (rfq ? 'request' : 'purchase order') +
                    ' line linked to each work order.'),
                el('div.pl-form', radios, el('label.check.wide', otherRadio,
                    ' Other: ', other.node)), qtyTable);
            UI.modal(title, body, [
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
                        values.unit_prices = {};
                        rows.forEach(function (r) {
                            values.quantities[r[idKey]] = parseFloat(
                                inputs[r[idKey]].value) || 0;
                            values.unit_prices[r[idKey]] = r.unit_mat_cost;
                        });
                    }
                    UI.service(rfq ? 'js_planning_rfq' :
                        'js_planning_purchase', values).then(resolve,
                        function (e) {
                            failed(e);
                            reject({cancelled: true});
                        });
                }}]);
            widen('pl-mid');
        });
    }

    /* ---- Material Planning -------------------------------------------- */

    /* The four tabs of Jobshop's Material Planning window (layout
     * VPlanning\Planning, in its order): Stocked/Fabricated Only Parts,
     * Non-Stocked Parts, Outside Services, Open Sales Order Lines. Their
     * right-click menus are Jobshop's popups (PopupStockParts,
     * PopupMatPlanning, PopupServicePlanning, PopupWOPlanning); the
     * ribbon's Planning Tools ▾ has them all (PopupPlanning). */
    Screens.materialPlanning = function (main) {
        style();
        var sections = [];
        var byId = {};
        var current = 0;
        var form = UI.form(main, {title: 'Material Planning', extra: [
            {label: 'Refresh', title: 'Refresh (F5)', onclick: function () {
                reload();
            }},
            {label: 'Planning Tools ▾', title: 'Jobshop\'s Planning Tools: ' +
                'the options of each section', onclick: function (event) {
                    var where = event.currentTarget || event.target;
                    ready.then(function () {
                        planningTools(where);
                    });
                }}]});
        var body = form.body;
        var planningTools = function () {};
        var ready = Promise.all([Rpc.desk('js_planning_access', []),
            allowedScreens(['orders', 'work-orders', 'purchase-orders',
                'parts', 'rfqs', 'customers'])]).then(function (r) {
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

            function quoted(result) {
                UI.toast('Request for quote ' + result.number + ' created',
                    'ok');
                if (screens.rfqs) {
                    UI.openScreen('rfqs/' + result.rfq, 'RFQ ' +
                        result.number);
                }
                reload();
            }

            function viewItems(s) {
                return s.views.map(function (v) {
                    return {checked: !!(s.view === v[0]), label: mark(s.view === v[0], v[1]), onclick:
                        function () {
                            s.setView(v[0]);
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

            function supplyItem(rows, label) {
                if (rows.length !== 1 || !rows[0].product) {
                    return null;
                }
                return {label: label || 'Supply and Demand...', onclick:
                    function () {
                        supplyDemand(rows[0].product);
                    }};
            }

            /* Open Sales Order Lines (PopupWOPlanning) */
            function soItems(rows) {
                var items = [];
                var s = byId.line;
                items = items.concat(s.grid.browseItems(), '-');
                items.push(sub('View', viewItems(s)));
                var fab = rows.length && rows.every(function (r) {
                    return r.fabricated;
                });
                var unlinked = rows.filter(function (r) {
                    return !r.fully_linked;
                });
                if (access.link && access.work_order && fab && onePart(rows) &&
                        unlinked.length) {
                    items.push(sub('Link Order Line to', [
                        sub('New Work Order w/Status', [['Unreleased',
                            'UnReleased...'], ['Firm', 'Firm...'],
                            ['Released', 'Release...']].map(function (st) {
                                return {label: st[1], onclick: function () {
                                    UI.service('js_planning_link', {lines:
                                        unlinked.map(function (r) {
                                            return r.line;
                                        }), status: st[0]}).then(made,
                                        failed);
                                }};
                            })),
                        {label: 'Existing Work Order...', onclick:
                            function () {
                                linkExisting(unlinked);
                            }}]));
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
                var sales = {};
                rows.forEach(function (r) {
                    sales[r.sale] = r;
                });
                var one = Object.keys(sales).length === 1 ? rows[0] : null;
                if (access.sale_status && one) {
                    items.push(sub('Change Sales Order Status',
                        one.status_changes.map(function (status) {
                            return {label: status + '...', onclick:
                                function () {
                                    changeStatus(one, status);
                                }};
                        })));
                }
                var purchased = rows.length && rows.every(function (r) {
                    return r.product && r.purchased;
                });
                if (access.purchase && purchased) {
                    items.push({label: 'Create Purchase Order for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('stocked', partRows(rows),
                                'product').then(bought, failed);
                        }});
                }
                if (access.rfq && purchased) {
                    items.push({label: 'Create Request For Quote for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('stocked', partRows(rows),
                                'product', 'rfq').then(quoted, failed);
                        }});
                }
                if (access.work_order && rows.length === 1 && fab) {
                    items.push({label: 'Create Work order...', onclick:
                        function () {
                            var r = rows[0];
                            createWorkOrder(r.product, {want:
                                r.desired_ship_date, quantity: r.qty_due,
                                description: r.description}).then(made,
                                failed);
                        }});
                }
                items.push('-');
                if (one && screens.orders) {
                    items.push({label: 'Open Sales Order...', onclick:
                        function () {
                            openSale(one);
                        }});
                }
                if (rows.length === 1) {
                    if (screens.customers) {
                        items.push({label: 'Open Customer...', onclick:
                            function () {
                                UI.openScreen('customers/' + rows[0].customer,
                                    rows[0].customer_id);
                            }});
                    } else {
                        items.push({label: 'Open Customer...', onclick:
                            function () {
                                UI.openRecord('party.party', rows[0].customer,
                                    rows[0].name);
                            }});
                    }
                    rows[0].links.forEach(function (l) {
                        items.push({label: 'Open Work Order ' + l.number,
                            onclick: function () {
                                openWorkOrder(l.id, l.number);
                            }});
                    });
                }
                items.push(supplyItem(rows));
                return items;
            }

            /* Rows of sales lines as the part rows of the PO / RFQ dialog */
            function partRows(rows) {
                var seen = {};
                return rows.filter(function (r) {
                    if (seen[r.product]) {
                        return false;
                    }
                    seen[r.product] = true;
                    return true;
                }).map(function (r) {
                    var qty = rows.filter(function (x) {
                        return x.product === r.product;
                    }).reduce(function (t, x) {
                        return t + Math.max(x.qty_due - x.linked_qty, 0);
                    }, 0);
                    return {product: r.product, part_id: r.part_id,
                        description: r.description, projected: r.projected,
                        order_qty: qty, supplier: null, supplier_id: ''};
                });
            }

            function changeStatus(one, status) {
                UI.confirm('Change Sales Order Status', 'Every line of ' +
                    'sales order ' + one.sales_id + ' takes the status ' +
                    status + '.').then(function (ok) {
                        if (!ok) {
                            return;
                        }
                        Rpc.desk('js_planning_sale_status', [one.sale,
                            status]).then(function () {
                                UI.toast('Sales order ' + one.sales_id +
                                    ': ' + status, 'ok');
                                reload();
                            }, failed);
                    });
            }

            /* Link Sales Order Line to Work Order (LinkableWOs) */
            function linkExisting(rows) {
                Rpc.desk('js_planning_link_targets', [rows[0].product]).then(
                    function (targets) {
                        if (!targets.length) {
                            UI.toast('No open work order of ' +
                                rows[0].part_id + '.', 'error');
                            return;
                        }
                        var g = grid([
                            {key: 'work_id', label: 'Work ID'},
                            {key: 'lot_id', label: 'Lot ID'},
                            {key: 'split_id', label: 'Split ID'},
                            {key: 'status', label: 'Order Status'},
                            {key: 'release_date', label: 'Release Date',
                                type: 'date'},
                            {key: 'want_date', label: 'Want Date',
                                type: 'date'},
                            {key: 'quantity', label: 'Desired Qty',
                                type: 'num'},
                            {key: 'available', label: 'Qty Available to ' +
                                'Link', type: 'num'},
                            {key: 'part_id', label: 'Part ID'},
                            {key: 'description', label: 'Description'}
                        ], {id: 'id', open: function (t) {
                            link(t.id);
                            if (closeLink) {
                                closeLink();
                            }
                        }});
                        var closeLink = null;
                        g.set(targets);
                        function link(id) {
                            UI.service('js_planning_link', {lines:
                                rows.map(function (r) {
                                    return r.line;
                                }), production: id}).then(function () {
                                    UI.toast('Linked', 'ok');
                                    reload();
                                }, failed);
                        }
                        closeLink = UI.modal('Link Sales Order Line to ' +
                            'Work Order',
                            el('div', el('p.muted', rows.length +
                                ' line(s) of ' + rows[0].part_id +
                                ': choose the work order.'), g.node), [
                                {label: 'Cancel'},
                                {label: 'Link', primary: true, onclick:
                                    function () {
                                        var t = g.selection()[0];
                                        if (!t) {
                                            UI.toast('Choose the work ' +
                                                'order.', 'error');
                                            return true;
                                        }
                                        link(t.id);
                                    }}]);
                        widen();
                    }, failed);
            }

            /* Non-Stocked Parts (PopupMatPlanning) */
            function nsItems(rows) {
                var items = [];
                var s = byId.card;
                items = items.concat(s.grid.browseItems(), '-');
                items.push(sub('View', viewItems(s)));
                var open = rows.filter(function (r) {
                    return !r.fully_linked;
                });
                var buyable = open.length && open.every(function (r) {
                    return !r.product || r.purchased;
                });
                if (access.purchase && buyable) {
                    items.push({label: 'Create Purchase Order for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('material', open, 'card').then(
                                bought, failed);
                        }});
                }
                if (access.rfq && buyable) {
                    items.push({label: 'Create Request For Quote for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('material', open, 'card', 'rfq')
                                .then(quoted, failed);
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
                items.push(requestItem(open, function (r) {
                    return r.net_qty - r.linked_po_qty;
                }));
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
                items.push({checked: !!(s.includeStocked), label: mark(s.includeStocked, 'Include Material ' +
                    'Demand for Stocked Parts'), onclick: function () {
                        s.includeStocked = !s.includeStocked;
                        s.load();
                    }});
                items.push('-');
                if (rows.length === 1 && screens['work-orders']) {
                    items.push({label: 'Issue Material...', onclick:
                        function () {
                            /* The work order's material cards: Issue there */
                            openWorkOrder(rows[0].root, rows[0].work_id);
                        }});
                }
                if (rows.length === 1) {
                    items.push({label: 'Open Work Order...', onclick:
                        function () {
                            openWorkOrder(rows[0].root, rows[0].work_id);
                        }});
                }
                items.push(supplyItem(rows));
                return items;
            }

            /* Outside Services (PopupServicePlanning) */
            function osItems(rows) {
                var items = [];
                var s = byId.work;
                items = items.concat(s.grid.browseItems(), '-');
                items.push(sub('View', viewItems(s)));
                var open = rows.filter(function (r) {
                    return !r.fully_linked;
                });
                if (access.purchase && open.length) {
                    items.push({label: 'Create Purchase Order for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('service', open, 'work').then(
                                bought, failed);
                        }});
                }
                if (access.rfq && open.length) {
                    items.push({label: 'Create Request For Quote for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('service', open, 'work', 'rfq')
                                .then(quoted, failed);
                        }});
                }
                items.push('-');
                if (rows.length === 1) {
                    items.push({label: 'Open Work Order...', onclick:
                        function () {
                            openWorkOrder(rows[0].root, rows[0].work_id);
                        }});
                    if (rows[0].purchase && screens['purchase-orders']) {
                        items.push({label: 'Open Purchase Order...', onclick:
                            function () {
                                openPurchase(rows[0].purchase,
                                    rows[0].po_link);
                            }});
                    }
                }
                return items;
            }

            /* Stocked/Fabricated Only Parts (PopupStockParts) */
            function spItems(rows) {
                var items = [];
                var s = byId.product;
                items = items.concat(s.grid.browseItems(), '-');
                items.push(sub('View', viewItems(s)));
                var purchased = rows.length && rows.every(function (r) {
                    return r.purchased;
                });
                if (access.purchase && purchased) {
                    items.push({label: 'Create Purchase Order for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('stocked', rows, 'product').then(
                                bought, failed);
                        }});
                }
                if (access.rfq && purchased) {
                    items.push({label: 'Create Request For Quote for ' +
                        'Supplier...', onclick: function () {
                            purchaseDialog('stocked', rows, 'product',
                                'rfq').then(quoted, failed);
                        }});
                }
                if (access.work_order && rows.length === 1 &&
                        rows[0].fabricated) {
                    items.push({label: 'Create Work order...', onclick:
                        function () {
                            createWorkOrder(rows[0].product, {quantity:
                                rows[0].order_qty || rows[0].order_point ||
                                rows[0].suggested, status: 'Firm'}).then(
                                made, failed);
                        }});
                }
                items.push(requestItem(rows, function (r) {
                    return r.order_qty || r.suggested;
                }));
                items.push('-');
                if (rows.length === 1 && screens.parts) {
                    items.push({label: 'Open Part...', onclick: function () {
                        UI.openRecord('product.product', rows[0].product,
                            rows[0].part_id);
                    }}, {label: 'View Notes for Part...', onclick:
                        function () {
                            partNotes(rows[0]);
                        }});
                }
                items.push(supplyItem(rows, 'Open Supply and Demand...'));
                return items;
            }

            /* Tools > View Notes for Part: the part's notes (Tryton notes) */
            function partNotes(row) {
                Rpc.searchRead('ir.note', [['resource', '=',
                    'product.product,' + row.product]], ['message',
                    'create_date'], {order: [['id', 'ASC']]}).then(
                    function (notes) {
                        UI.modal('Notes for Part ' + row.part_id, notes.length ?
                            el('div', notes.map(function (n) {
                                return el('p', n.message);
                            })) : el('p.muted', 'No notes for this part.'));
                    }, failed);
            }

            function menuOf(s) {
                return function (event, rows) {
                    popup(event, s.items(rows));
                };
            }

            function red(key) {
                return function (r) {
                    return r.late && key === 'order_by' ? 'red' : '';
                };
            }
            function projectedCls(r) {
                return r.projected !== null && r.projected < 0 ? 'red' : '';
            }

            sections = [
                {title: 'Stocked/Fabricated Only Parts', id: 'product',
                    view: 'short', views: [['all', 'View All'],
                        ['short', 'Short Only']],
                    rpc: function (s) {
                        var f = s.filters();
                        f.short_only = s.view === 'short';
                        return Rpc.desk('js_planning_stocked', [f]);
                    },
                    items: spItems, open: function (r) {
                        supplyDemand(r.product);
                    },
                    empty: 'No stocked part is short.',
                    columns: [
                        {key: 'inactive', label: 'Inactive', type: 'check'},
                        {key: 'rfq_exists', label: 'RFQ(s) Exists',
                            type: 'check'},
                        {key: 'po_exists', label: 'PO(s) Exist',
                            type: 'check'},
                        {key: 'part_id', label: 'Part ID'},
                        {key: 'description', label: 'Description'},
                        {key: 'fabricated', label: "Fab'd", type: 'check'},
                        {key: 'purchased', label: "Pur'd", type: 'check'},
                        {key: 'tool', label: 'Tool or Fixture',
                            type: 'check'},
                        {key: 'lead_time', label: 'Lead Time (Days)',
                            type: 'num'},
                        {key: 'horizon_date', label: 'Horizon Date',
                            type: 'date'},
                        {key: 'stock_um', label: 'Stock U/M'},
                        {key: 'unit_mat_cost', label: 'Unit Material Cost',
                            type: 'num', edit: true},
                        {key: 'order_qty', label: 'Order Quantity',
                            type: 'num', edit: true},
                        {key: 'estimated_cost', label: 'Estimated Total Cost',
                            type: 'num'},
                        {key: 'on_hold', label: 'Qty On Hold', type: 'num'},
                        {key: 'qty_available', label: 'Qty Available',
                            type: 'num'},
                        {key: 'net_demand', label: 'Net Demand', type: 'num'},
                        {key: 'total_supply', label: 'Total Supply',
                            type: 'num'},
                        {key: 'projected', label: 'Projected Available',
                            type: 'num', cls: function (r) {
                                return r.color === 'black' ? '' : r.color;
                            }},
                        {key: 'order_point', label: 'Order Point',
                            type: 'num'},
                        {key: 'safety_stock', label: 'Safety Stock Qty',
                            type: 'num'},
                        {key: 'restocking_level', label: 'Restocking Level',
                            type: 'num'},
                        {key: 'minimum_order_qty', label: 'Minimum Order Qty',
                            type: 'num'},
                        {key: 'multiple_order_qty', label: 'Order in ' +
                            'Multiples of', type: 'num'},
                        {key: 'product_code', label: 'Product Code'},
                        {key: 'commodity_code', label: 'Commodity Code'},
                        {key: 'pref1', label: 'Pref Supplier ID 1',
                            value: prefSupplier(0)},
                        {key: 'pref2', label: 'Pref Supplier ID 2',
                            value: prefSupplier(1)},
                        {key: 'pref3', label: 'Pref Supplier ID 3',
                            value: prefSupplier(2)},
                        {key: 'pref4', label: 'Pref Supplier ID 4',
                            value: prefSupplier(3)},
                        {key: 'pref5', label: 'Pref Supplier ID 5',
                            value: prefSupplier(4)},
                        {key: 'mfg_name', label: 'Mfg Name'},
                        {key: 'mfg_part_id', label: 'Mfg Part ID'}
                    ]},
                {title: 'Non-Stocked Parts', id: 'card', view: 'exclude',
                    views: [['all', 'View All'], ['exclude',
                        'Exclude Fully Linked']],
                    rpc: function (s) {
                        return Rpc.desk('js_planning_non_stocked',
                            s.includeStocked ? [s.view, true] : [s.view]);
                    },
                    items: nsItems, open: function (r) {
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
                        {key: 'eng_id', label: 'Eng Master Revision'},
                        {key: 'fabricated', label: "Fab'd", type: 'check'},
                        {key: 'purchased', label: "Pur'd", type: 'check'},
                        {key: 'stocked', label: "Stck'd", type: 'check'},
                        {key: 'tool', label: 'Tool or Fixture',
                            type: 'check'},
                        {key: 'calc_qty', label: 'Calc Qty (Stk U/M)',
                            type: 'num'},
                        {key: 'linked_rfq_qty', label: 'Linked RFQ Qty ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'linked_po_qty', label: 'Linked PO Qty ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'linked_received', label: 'Linked Qty ' +
                            'Received (Stk U/M)', type: 'num'},
                        {key: 'issued_qty', label: 'Issued Qty (Stk U/M)',
                            type: 'num'},
                        {key: 'net_qty', label: "Net Qty Req'd (Stk U/M)",
                            type: 'num'},
                        {key: 'qty_available', label: 'Qty Available ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'projected', label: 'Projected Available',
                            type: 'num', cls: projectedCls},
                        {key: 'stock_um', label: 'Stock U/M'},
                        {key: 'primary_loc_id', label: 'Primary Loc Id'},
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
                        {key: 'specifications', label: 'Specifications'},
                        {key: 'reference', label: 'Project/Reference Other'}
                    ]},
                {title: 'Outside Services', id: 'work', view: 'exclude',
                    views: [['all', 'View All'], ['exclude',
                        'Exclude Fully Linked']],
                    rpc: function (s) {
                        return Rpc.desk('js_planning_outside', [s.view]);
                    },
                    items: osItems, open: function (r) {
                        openWorkOrder(r.root, r.work_id);
                    },
                    empty: 'No outside service to buy.',
                    columns: [
                        {key: 'required_date', label: 'Required Date',
                            type: 'date'},
                        {key: 'transit_days', label: 'Lead Time',
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
                        {key: 'part_description', label: 'Part Description'},
                        {key: 'calc_qty', label: 'Calc Start Qty (Stk U/M)',
                            type: 'num'},
                        {key: 'linked_po_qty', label: 'Linked PO Qty ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'linked_rfq_qty', label: 'Linked RFQ Qty ' +
                            '(Stk U/M)', type: 'num'},
                        {key: 'linked_received', label: 'Linked Qty ' +
                            'Received (Stk U/M)', type: 'num'},
                        {key: 'net_qty', label: "Net Qty Req'd (Stk U/M)",
                            type: 'num'},
                        {key: 'stock_um', label: 'Stock U/M'},
                        {key: 'specifications', label: 'Specifications'},
                        {key: 'po_link', label: 'PO/Line Link Information'},
                        {key: 'length', label: 'Length', type: 'num'},
                        {key: 'width', label: 'Width', type: 'num'},
                        {key: 'height', label: 'Height', type: 'num'},
                        {key: 'usage_um', label: 'Usage U/M'},
                        {key: 'reference', label: 'Project/Reference Other'}
                    ]},
                {title: 'Open Sales Order Lines', id: 'line',
                    view: 'exclude', views: [['all', 'View All'],
                        ['exclude', 'Exclude Fully Linked']],
                    rpc: function (s) {
                        return Rpc.desk('js_planning_sales', [s.view]);
                    },
                    items: soItems, open: openSale,
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
                        {key: 'eng_id', label: 'Eng Master Revision'},
                        {key: 'fabricated', label: "Fab'd", type: 'check'},
                        {key: 'purchased', label: "Pur'd", type: 'check'},
                        {key: 'stock_um', label: 'Stock U/M'},
                        {key: 'order_qty', label: 'Order Qty', type: 'num'},
                        {key: 'shipped_qty', label: "Ship'd Qty",
                            type: 'num'},
                        {key: 'linked_qty', label: 'Linked Qty', type: 'num'},
                        {key: 'link_shipped_qty', label: 'Link Shipped Qty',
                            type: 'num'},
                        {key: 'qty_due', label: 'Qty Due', type: 'num'},
                        {key: 'qty_available', label: 'Qty Available',
                            type: 'num'},
                        {key: 'qty_on_hold', label: 'Qty On Hold',
                            type: 'num'},
                        {key: 'projected', label: 'Projected Available',
                            type: 'num', cls: projectedCls},
                        {key: 'wo_link', label: 'WO Link Information'},
                        {key: 'customer_part_id', label: 'Customer Part ID'},
                        {key: 'customer_id', label: 'Customer ID'},
                        {key: 'name', label: 'Customer Name'},
                        {key: 'description', label: 'Description'},
                        {key: 'pref_supplier_id', label: 'Preferred ' +
                            'Supplier ID'},
                        {key: 'message', label: 'Message', cls: function () {
                            return 'msg';
                        }}
                    ]}
            ];

            function prefSupplier(i) {
                return function (r) {
                    return (r.pref_suppliers || [])[i] || '';
                };
            }

            var panes = sections.map(function (s) {
                byId[s.id] = s;
                s.grid = grid(s.columns, {id: s.id, menu: menuOf(s),
                    open: s.open, empty: s.empty, onselect: function (rows) {
                        if (s.onselect) {
                            s.onselect(rows);
                        }
                    }, onedit: function () {
                        if (s.onedit) {
                            s.onedit();
                        }
                    }});
                s.status = el('span.muted', '');
                s.viewSelect = select(s.views, s.view);
                s.viewSelect.addEventListener('change', function () {
                    s.setView(s.viewSelect.value);
                });
                s.setView = function (view) {
                    s.view = view;
                    s.viewSelect.value = view;
                    if (s.shortOnly) {
                        s.shortOnly.checked = view === 'short';
                    }
                    s.load();
                };
                s.load = function () {
                    s.status.textContent = 'Loading...';
                    s.rpc(s).then(function (rows) {
                        s.grid.set(rows);
                        s.loaded = true;
                        s.status.textContent = rows.length + ' line(s)';
                        if (s.onedit) {
                            s.onedit();
                        }
                    }, function (e) {
                        s.status.textContent = '';
                        failed(e);
                    });
                };
                s.filters = function () {
                    return {};
                };
                if (s.id === 'product') {
                    return {title: s.title, node: stockedPane(s)};
                }
                return {title: s.title, node: el('div', el('div.pl-bar',
                    field('View', s.viewSelect), el('span.spacer'),
                    el('span.muted', 'Right-click a line for its options; ' +
                        'Ctrl/Shift+click for several.'), s.status),
                    s.grid.node)};
            });

            /* The Stocked/Fabricated Only Parts tab: the filters (part,
             * product code, commodity code, preferred supplier ranges,
             * Horizon, View Short Only, Use Part Leadtime (+ days) as
             * Horizon, Use Work Order Release Date, For: active / inactive,
             * fabricated / purchased), Refresh Grid, the grid, the Total
             * Estimated Cost of the selected rows and the selected part's
             * supply and demand */
            function stockedPane(s) {
                function range(label, model) {
                    var on = el('input', {type: 'checkbox'});
                    var from = UI.picker(model, {placeholder: 'From',
                        label: label + ' From'});
                    var to = UI.picker(model, {placeholder: 'To',
                        label: label + ' To'});
                    function code(p) {
                        var r = p.record();
                        return r ? String(r.rec_name).split(' ')[0] :
                            p.input.value.trim() || null;
                    }
                    return {on: on, label: label, fromNode: from.node,
                        toNode: to.node, from: function () {
                            return code(from);
                        }, to: function () {
                            return code(to);
                        }};
                }
                var part = range('Part ID', 'product.product');
                var code = range('Product Code', 'nline.product_code');
                var commodity = range('Commodity Code',
                    'nline.commodity_code');
                var supplier = range('Preferred Supplier ID', 'party.party');
                var horizon = el('input', {type: 'date', title: 'Only the ' +
                    'demand and supply up to this date (empty: all)'});
                var shortOnly = el('input', {type: 'checkbox', checked:
                    s.view === 'short' || null});
                s.shortOnly = shortOnly;
                shortOnly.addEventListener('change', function () {
                    s.setView(shortOnly.checked ? 'short' : 'all');
                });
                var useLead = el('input', {type: 'checkbox'});
                var plus = el('input', {type: 'number', min: 0, value: 0,
                    style: {width: '52px'}});
                var useRelease = el('input', {type: 'checkbox'});
                /* Not emulated: no temporary work orders in the ERP */
                var tempWos = el('input', {type: 'checkbox', disabled: true,
                    title: 'Not used: the ERP has no temporary work orders'});
                var group = 'pl-for-' + Date.now();
                var total = el('input', {type: 'text', readonly: true,
                    size: 14});
                var detail = supplyDemandPane({fixed: true});
                s.onselect = function (rows) {
                    if (rows.length === 1) {
                        detail.load(rows[0].product);
                    }
                    s.onedit();
                };
                s.onedit = function () {
                    var t = s.grid.selection().reduce(function (sum, r) {
                        return sum + (r.estimated_cost || 0);
                    }, 0);
                    total.value = UI.money ? UI.money(t) : num(t);
                };
                s.filters = function () {
                    function v(r, which) {
                        return r.on.checked ? r[which]() : null;
                    }
                    return {
                        part_from: v(part, 'from'), part_to: v(part, 'to'),
                        product_code_from: v(code, 'from'),
                        product_code_to: v(code, 'to'),
                        commodity_code_from: v(commodity, 'from'),
                        commodity_code_to: v(commodity, 'to'),
                        supplier_from: v(supplier, 'from'),
                        supplier_to: v(supplier, 'to'),
                        activity: radioValue(body, group + 'a'),
                        fabricated: radioValue(body, group + 'f'),
                        horizon: horizon.value || null,
                        use_leadtime: useLead.checked,
                        plus_days: parseInt(plus.value, 10) || 0,
                        use_release_date: useRelease.checked
                    };
                };
                function rangeFields(r, top, split) {
                    return [
                        {label: r.label, at: [9, top, 135, top + 20],
                            type: 'boolean', node: r.on},
                        {label: 'From', at: [139, top, 339, top + 20],
                            split: 60, node: r.fromNode},
                        {label: 'To', at: [347, top, 547, top + 20],
                            split: 60, node: r.toNode}];
                }
                /* MAT_PLAN_ORDER_PT */
                var filters = placed({
                    frames: [{label: 'For', at: [557, 5, 841, 114]},
                        {label: 'For', at: [557, 119, 682, 191]}],
                    fields: [].concat(
                        rangeFields(part, 5), rangeFields(code, 27),
                        rangeFields(commodity, 49), rangeFields(supplier, 71),
                        [{label: 'Horizon', at: [9, 93, 244, 113],
                            split: 111, node: horizon},
                        {label: 'View Short Only', at: [123, 115, 239, 131],
                            type: 'boolean', node: shortOnly},
                        {label: 'Use Part Leadtime (+', at: [123, 133, 244,
                            149], type: 'boolean', node: useLead},
                        {label: '', at: [245, 132, 279, 151], split: 0,
                            node: plus},
                        {label: 'days) as Horizon for Projected ' +
                            'Availability Calculation', at: [281, 133, 544,
                            149], split: 263, node: el('span')},
                        {label: 'Use Work Order Release Date for Material ' +
                            'Demand Date', at: [123, 153, 543, 170],
                            type: 'boolean', node: useRelease},
                        {label: 'Create Planned Temporary Work Orders for ' +
                            'Purchase Order Consolidation', at: [123, 172,
                            543, 189], type: 'boolean', node: tempWos},
                        {label: '', at: [562, 24, 835, 109], split: 0,
                            node: radioGroup(group + 'a', [
                                ['active_demand', 'All Active Parts and ' +
                                    'Inactive Parts with Demand'],
                                ['active_only', 'All Active Parts Only'],
                                ['inactive_only', 'All Inactive Parts Only'],
                                ['inactive_demand', 'Inactive Parts with ' +
                                    'Demand Only'],
                                ['all', 'All Active and Inactive Parts']],
                                'active_demand')},
                        {label: '', at: [562, 137, 674, 184], split: 0,
                            node: radioGroup(group + 'f', [
                                ['fabricated', 'Fabricated Parts'],
                                ['purchased', 'Purchased Parts'],
                                ['both', 'Both']], 'both')}]),
                    buttons: [{label: 'Refresh Grid', at: [706, 140, 819,
                        180], onclick: function () {
                            s.load();
                        }}]});
                return el('div', filters,
                    el('div.pl-bar', el('span.spacer'), s.status),
                    s.grid.node,
                    placed({fields: [{label: 'Total Estimated Cost of ' +
                        'Selected Row(s)', at: [209, 4, 546, 24],
                        split: 215, node: total}]}),
                    detail.node);
            }

            var t = tabs(panes, function (i) {
                current = i;
                if (!sections[i].loaded) {
                    sections[i].load();
                }
            });
            body.appendChild(t.bar);
            body.appendChild(el('div.tab-panes', panes.map(function (p) {
                return p.node;
            })));
            t.show(0);

            /* Planning Tools ▾ (PopupPlanning): each section's popup */
            planningTools = function (where) {
                popup(where, [
                    sub('Open Sales Orders', byId.line.items(
                        byId.line.grid.selection())),
                    sub('Non-Stocked Parts', byId.card.items(
                        byId.card.grid.selection())),
                    sub('Stocked Parts', byId.product.items(
                        byId.product.grid.selection())),
                    sub('Outside Services', byId.work.items(
                        byId.work.grid.selection()))]);
            };

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
            grid: true, info: false, tips: true, chart: 'resource',
            highlight: null, determinant: false, selected: null,
            viewType: 'resource', resource: '', view: '', workOrder: null,
            schedule: 'STANDARD'};
        var form = UI.form(main, {title: 'Scheduling', extra: [
            {label: 'Refresh', title: 'Refresh (F5)', onclick: function () {
                refresh();
            }},
            {label: 'Scheduling ▾', title: 'Scheduling (also the ' +
                'right-click of the schedule)', onclick: function (event) {
                    var where = event.currentTarget || event;
                    ready.then(function () {
                        optionsMenu(where, null);
                    });
                }},
            {label: 'Tools ▾', onclick: function (event) {
                var where = event.currentTarget || event;
                ready.then(function () {
                    toolsMenu(where);
                });
            }},
            {label: 'Options ▾', onclick: function (event) {
                popup(event.currentTarget || event, [
                    {checked: !!(state.info), label: mark(state.info, 'Right-click Info'), onclick:
                        function () {
                            state.info = !state.info;
                        }},
                    {checked: !!(state.tips), label: mark(state.tips, 'DataTips'), onclick:
                        function () {
                            state.tips = !state.tips;
                            drawChart();
                        }}]);
            }}]});
        var body = form.body;

        var header = el('div.pl-head');
        var resPane = el('div');
        var woPane = el('div');
        var chartPane = el('div');
        var compPane = el('div');
        var panes = [{title: 'Resource Details', node: resPane},
            {title: 'Work Order Details', node: woPane},
            {title: 'Schedule', node: chartPane},
            {title: 'Schedule Comparison', node: compPane}];
        var t = tabs(panes, function (i) {
            if (i === 0) {
                loadResources();
            } else if (i === 1) {
                loadWorkOrder();
            } else if (i === 2) {
                loadChart();
            } else {
                loadComparison();
            }
        });

        var ready = Promise.all([Rpc.desk('js_schedule_info', sched([])),
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

        /* The arguments with the schedule shown, when it is not STANDARD
         * (the services' default) */
        function sched(args) {
            return state.schedule && state.schedule !== 'STANDARD' ?
                args.concat([state.schedule]) : args;
        }

        function showHeader() {
            form.body.closest && setTitle();
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

        /* Jobshop's title: Scheduling :: <schedule> */
        function setTitle() {
            var title = main.querySelector('.ribbon-title');
            if (title) {
                title.textContent = 'Scheduling :: ' + info.code;
            }
        }

        function refreshInfo() {
            return Rpc.desk('js_schedule_info', sched([])).then(
                function (data) {
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
        var viewGroup = 'pl-vt-' + Date.now();
        var viewType = radioGroup(viewGroup, [['resource', 'Resource ID'],
            ['view', 'Shop View ID']], 'resource');
        var resourceSel = el('select');
        var resourceDescr = el('input', {type: 'text', readonly: true});
        var resGrid = null;
        var woSel = el('select');
        var woDescr = el('input', {type: 'text', readonly: true});
        var woHead = el('div');
        var woGrid = null;

        /* RESOURCE_OPERATIONS / WO_OPERATIONS */
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
                {key: 'schedule_id', label: 'Schedule ID'},
                {key: 'resource_id', label: 'Resource ID'}];
            if (withOrder) {
                cols.push({key: 'part_id', label: 'Part ID'},
                    {key: 'work_id', label: 'Work ID'},
                    {key: 'lot_id', label: 'Lot ID'},
                    {key: 'split_id', label: 'Split ID'});
            }
            return cols.concat([
                {key: 'sub_id', label: 'Sub ID'},
                {key: 'seq_no', label: 'Seq No', type: 'num'},
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
            if (rows.length === 1) {
                items.push({label: rows[0].operation || ('Seq ' +
                    rows[0].seq_no), onclick: function () {}}, '-');
            }
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
                '*All*'));
            resourceDescr.value = state.viewType === 'view' ? '' :
                'All Resources';
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
            args = sched(args);
            var r = info.resources.filter(function (x) {
                return x.id === id;
            })[0];
            if (state.viewType !== 'view') {
                resourceDescr.value = r ? r.description || r.name :
                    'All Resources';
            }
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
            Rpc.desk('js_schedule_work_order_details', sched([id])).then(function (d) {
                    state.workOrder = d;
                    woDescr.value = d.description || '';
                    woDescr.title = d.part || '';
                    function ro(value) {
                        return el('input', {type: 'text', readonly: true,
                            value: value === null || value === undefined ?
                                '' : value});
                    }
                    var missed = d.missed_days === null ||
                        d.missed_days === undefined ? '' : d.missed_days > 0 ?
                        d.missed_days + ' Day(s) Late' : d.missed_days < 0 ?
                        (-d.missed_days) + ' Day(s) Early' : 'On Time';
                    /* WO_DETAIL: the work order's dates */
                    woHead.appendChild(placed({frames: [{label: '', at: [7,
                        29, 508, 92]}], fields: [
                        {label: 'Want Date', at: [17, 44, 180, 64],
                            split: 79, node: ro(UI.date(d.want_date))},
                        {label: 'Release Date', at: [17, 66, 180, 86],
                            split: 79, node: ro(UI.date(d.release_date))},
                        {label: 'Finish Date', at: [191, 44, 349, 64],
                            split: 72, node: ro(dt(d.finish))},
                        {label: 'Start Date', at: [191, 66, 349, 86],
                            split: 72, node: ro(dt(d.start))},
                        {label: '', at: [351, 43, 441, 63], split: 0,
                            node: el('span' + (d.missed_days > 0 ?
                                '.pl-late' : ''), missed)},
                        {label: 'Rank', at: [355, 66, 424, 86], split: 39,
                            node: ro(d.rank)},
                        {label: 'Forward', at: [427, 66, 502, 86],
                            type: 'boolean', node: el('input', {type:
                                'checkbox', disabled: true, checked:
                                d.forward || null})}]}));
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
        var gxNote = el('div.gx-empty', {hidden: true});
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
            Rpc.desk('js_schedule_chart', sched([state.chart, ident, from,
                to, view])).then(function (data) {
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
            var left = 190;
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
                /* A resource shows its own name (Jobshop's Resource ID),
                 * the full name (shop / resource) and its units in the
                 * tooltip */
                var name = state.chart === 'resource' ? String(row.label)
                    .split(' / ').pop() : row.label;
                var line = el('div.gx-row', {style: {height: height + 'px',
                    width: (width + left) + 'px'}}, el('div.gx-label', {title:
                        row.label + (row.part ? ' ' + row.part : '') +
                        (state.chart === 'resource' ? ', ' + units +
                            ' unit(s)' : '')},
                    el('strong', name), row.part ? ' ' + row.part :
                        '', state.chart === 'resource' && units > 1 ?
                        el('span.muted', ' ×' + units) : null));
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
                            title: state.tips ? tip(b) : '',
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
            var bars = chartData.rows.some(function (row) {
                return row.bars && row.bars.length;
            });
            /* Nothing scheduled: say so above the chart (the outlined
             * boxes alone read as empty cells) */
            UI.clear(gxNote);
            gxNote.hidden = bars;
            if (!bars) {
                gxNote.appendChild(el('strong', info.scheduled_as_of ?
                    'No operations scheduled in this range.' :
                    'Nothing is scheduled yet: this schedule has never ' +
                    'been run.'));
                gxNote.appendChild(document.createTextNode(
                    (access.schedule ? 'Run Scheduling > Schedule All to ' +
                        'place the open work orders. ' : '') +
                    (state.chart === 'resource' && state.capacity ?
                        'The outlined boxes are each resource’s working ' +
                        'hours (capacity); days without a shift, such ' +
                        'as weekends, stay blank.' : '')));
            }
            if (!chartData.rows.length) {
                inner.appendChild(el('p.muted', {style: {padding: '10px'}},
                    state.chart === 'resource' ? 'No resources to show.' :
                        'No open work orders in this range.'));
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

        /* The Scheduling menu (also the right-click of the schedule):
         * Display Mode, Zoom, the schedule shown (STANDARD, the what-if
         * schedules), Operations, Capacity, Grid lines, the highlights,
         * Schedule All, Set Load Horizon, Export Schedule */
        function optionsMenu(event, bar) {
            var items = [];
            if (bar && state.info) {
                /* Right-click Info */
                items.push({label: bar.number + ' seq ' + (bar.seq_no ||
                    '') + ': ' + dt(bar.start) + ' - ' + dt(bar.finish),
                    onclick: function () {}}, '-');
            }
            function redraw() {
                if (t.current() === 2) {
                    drawChart();
                } else {
                    t.show(2);
                }
            }
            items.push(sub('Display Mode', ['day', 'week', 'month', 'year']
                .map(function (m) {
                    return {checked: !!(state.mode === m), label: mark(state.mode === m, m.charAt(0)
                        .toUpperCase() + m.slice(1)), onclick: function () {
                            state.mode = m;
                            modeSel.value = m;
                            redraw();
                        }};
                })));
            items.push(sub('Zoom', [['0.5', '50%'], ['1', '100%'],
                ['2', '200%'], ['4', '400%']].map(function (z) {
                    return {checked: !!(state.zoom === parseFloat(z[0])), label: mark(state.zoom === parseFloat(z[0]),
                        z[1]), onclick: function () {
                            state.zoom = parseFloat(z[0]);
                            zoomSel.value = z[0];
                            redraw();
                        }};
                })), '-');
            (info.schedules || ['STANDARD']).forEach(function (code) {
                items.push({checked: !!(state.schedule === code), label: mark(state.schedule === code, code),
                    onclick: function () {
                        showSchedule(code);
                    }});
            });
            items.push('-',
                {checked: !!(state.ops), label: mark(state.ops, 'Operations (F11)'), onclick:
                    function () {
                        state.ops = !state.ops;
                        redraw();
                    }},
                {checked: !!(state.capacity), label: mark(state.capacity, 'Capacity'), onclick:
                    function () {
                        state.capacity = !state.capacity;
                        redraw();
                    }},
                {checked: !!(state.grid), label: mark(state.grid, 'Grid lines'), onclick: function () {
                    state.grid = !state.grid;
                    redraw();
                }}, '-');
            var sel = bar || selectedBar();
            if (sel) {
                items.push({label: 'HighLight Work Order Immediate', onclick:
                    function () {
                        state.highlight = sel.root;
                        redraw();
                    }});
            }
            if (state.highlight) {
                items.push({label: 'Remove Highlight Immediate', onclick:
                    function () {
                        state.highlight = null;
                        state.determinant = false;
                        redraw();
                    }}, {checked: !!(state.determinant), label: mark(state.determinant,
                        'Highlight Determinant Path'), onclick: function () {
                            state.determinant = !state.determinant;
                            redraw();
                        }});
            }
            items.push('-');
            if (access.schedule) {
                items.push({label: 'Schedule All...', onclick: scheduleAll},
                    {label: 'Set Load Horizon', onclick: loadHorizon});
            }
            items.push({label: 'Export Schedule...', onclick: function () {
                Rpc.desk('js_schedule_export', sched(['tab'])).then(
                    download, failed);
            }});
            if (sel) {
                items.push('-');
                if (access.schedule) {
                    items.push({label: sel.frozen ? 'Unfreeze Operation' :
                        'Freeze Operation', onclick: function () {
                            freeze([sel.id], !sel.frozen);
                        }});
                }
                items.push({label: 'View Selected Work Order...', onclick:
                    function () {
                        openWorkOrder(sel.root, sel.number);
                    }}, {label: 'Work Order Details', onclick: function () {
                        woSel.value = String(sel.root);
                        t.show(1);
                    }});
            }
            popup(event, items);
        }

        /* The schedule the window shows (STANDARD or a what-if one) */
        function showSchedule(code) {
            state.schedule = code;
            refreshInfo().then(function () {
                fillResources();
                t.show(t.current());
            }, failed);
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
            var sel = selectedBar();
            var wo = woSel.value ? parseInt(woSel.value, 10) : sel ?
                sel.root : null;
            if (wo) {
                items.push({label: 'View Selected Work Order...', onclick:
                    function () {
                        openWorkOrder(wo);
                    }});
            }
            items.push({label: 'Weekly Calendars...', onclick:
                weeklyCalendar}, {label: 'Calendar Exceptions...', onclick:
                calendarExceptions});
            if (access.schedule && wo) {
                items.push('-', {label: 'Schedule Work Order', onclick:
                    function () {
                        scheduleWorkOrder(wo);
                    }}, {label: 'Delete Work Order Schedule', onclick:
                    function () {
                        UI.confirm('Delete Work Order Schedule', 'Take the ' +
                            'work order out of schedule ' + state.schedule +
                            '?').then(function (ok) {
                                if (!ok) {
                                    return;
                                }
                                Rpc.desk('js_schedule_delete_work_order',
                                    sched([wo])).then(function () {
                                        UI.toast('Work order schedule ' +
                                            'deleted', 'ok');
                                        refresh();
                                    }, failed);
                            });
                    }});
            }
            items.push('-', {label: 'Export Schedule to MS Project (XML)',
                onclick: function () {
                    Rpc.desk('js_schedule_export', sched(['xml']))
                        .then(download, failed);
                }}, {label: 'Export Schedule as CSV (MS Project)', onclick:
                function () {
                    Rpc.desk('js_schedule_export', sched(['csv']))
                        .then(download, failed);
                }});
            popup(event, items);
        }

        /* Schedule All Orders (Scheduler): Schedule ID (a new ID makes a
         * what-if schedule) and its Delete, Description, Infinite, Dates,
         * Work Orders to Schedule, Sort By, Schedule Started Work Orders,
         * Piece Scheduling, Retry Backward */
        function scheduleAll() {
            Rpc.desk('js_schedule_list', []).catch(function () {
                /* (a server without what-if schedules yet) */
                return [info];
            }).then(function (list) {
                var byCode = {};
                list.forEach(function (x) {
                    byCode[x.code] = x;
                });
                var g = 'pl-sa-' + Date.now();
                var listId = g + '-list';
                var code = el('input', {type: 'text', maxlength: 15, list:
                    listId, value: state.schedule});
                var datalist = el('datalist#' + listId, list.map(
                    function (x) {
                        return el('option', {value: x.code}, x.description);
                    }));
                var description = el('input', {type: 'text'});
                var infinite = el('input', {type: 'checkbox'});
                var now = info.now;
                var asOf = el('input', {type: 'datetime-local', min: now});
                var horizon = el('input', {type: 'number', min: 1});
                var hard = el('input', {type: 'checkbox'});
                var piece = el('input', {type: 'checkbox', title: 'Kept; ' +
                    'the scheduler does not split operations by piece'});
                var temp = el('input', {type: 'checkbox', disabled: true});
                var retry = el('input', {type: 'checkbox'});
                var keep = el('input', {type: 'checkbox'});
                var progress = el('p.muted', '');
                var modes = radioGroup(g + 'm', [['together', 'Released and ' +
                    'Firm Together (normal)'], ['released_first',
                    'Released then Firm'], ['released', 'Released Only']]);
                var sorts = radioGroup(g + 's', [['want', 'Order Want Date'],
                    ['priority', 'Priority Want Date']]);
                var starts = radioGroup(g + 'w', [['normal', 'Normally'],
                    ['first', "First, Don't Freeze Started Operations"],
                    ['first_freeze', 'First, Freeze Started Operations']]);
                function setRadio(group, value) {
                    Array.prototype.forEach.call(group.querySelectorAll(
                        'input'), function (r) {
                            r.checked = r.value === value;
                        });
                }
                function fill() {
                    var x = byCode[code.value.trim().toUpperCase()] ||
                        byCode.STANDARD || info;
                    description.value = x.description || '';
                    infinite.checked = !!x.infinite;
                    asOf.value = x.scheduled_as_of && x.scheduled_as_of >
                        now ? x.scheduled_as_of : now;
                    horizon.value = x.horizon || 730;
                    hard.checked = !!x.hard_release_dates;
                    piece.checked = !!x.piece_scheduling;
                    retry.checked = !!x.retry_backward;
                    keep.checked = !!x.keep_forward_dp;
                    keep.disabled = !retry.checked;
                    setRadio(modes, x.mode || 'together');
                    setRadio(sorts, x.sort_by || 'want');
                    setRadio(starts, x.started || 'normal');
                }
                code.addEventListener('change', fill);
                retry.addEventListener('change', function () {
                    keep.disabled = !retry.checked;
                });
                function deleteSchedule() {
                    var c = code.value.trim().toUpperCase();
                    if (!byCode[c] || c === 'STANDARD') {
                        UI.toast('Only a what-if schedule can be deleted.',
                            'error');
                        return;
                    }
                    UI.confirm('Delete Schedule', 'Delete schedule ' + c +
                        ' and its scheduled operations?').then(function (ok) {
                            if (!ok) {
                                return;
                            }
                            Rpc.desk('js_schedule_delete', [c]).then(
                                function () {
                                    delete byCode[c];
                                    code.value = 'STANDARD';
                                    fill();
                                    if (state.schedule === c) {
                                        showSchedule('STANDARD');
                                    }
                                    UI.toast('Schedule ' + c + ' deleted',
                                        'ok');
                                }, failed);
                        });
                }
                var buttons = [];
                if (access.delete_schedule !== false) {
                    buttons.push({label: 'Delete', at: [248, 8, 303, 34],
                        onclick: deleteSchedule});
                }
                var body = el('div', datalist, placed({
                    frames: [{label: 'Dates', at: [11, 80, 307, 166]},
                        {label: 'Work Orders to Schedule', at: [11, 171, 307,
                            249]},
                        {label: 'Sort By', at: [11, 253, 307, 322]},
                        {label: 'Schedule Started Work Orders', at: [11, 328,
                            307, 406]},
                        {label: 'Retry Backward Schedule after Forward ' +
                            'Schedule', at: [11, 460, 406, 560]}],
                    fields: [
                        {label: 'Schedule ID', at: [10, 12, 244, 32],
                            split: 75, node: code},
                        {label: 'Description', at: [10, 34, 244, 54],
                            split: 75, node: description},
                        {label: 'Infinite Schedule', at: [87, 58, 287, 78],
                            type: 'boolean', node: infinite},
                        {label: 'Schedule as of', at: [24, 100, 290, 120],
                            split: 100, node: asOf},
                        {label: 'Schedule Horizon', at: [24, 122, 182, 142],
                            split: 100, node: horizon},
                        {label: 'Days', at: [184, 122, 233, 142], split: 49,
                            node: el('span')},
                        {label: 'Treat Release Dates as Hard', at: [124, 144,
                            288, 164], type: 'boolean', node: hard},
                        {label: '', at: [24, 191, 257, 243], split: 0,
                            node: modes},
                        {label: '', at: [24, 273, 224, 308], split: 0,
                            node: sorts},
                        {label: '', at: [24, 348, 257, 400], split: 0,
                            node: starts},
                        {label: 'Piece Scheduling', at: [24, 412, 143, 432],
                            type: 'boolean', node: piece},
                        {label: 'Schedule Temporary Work Orders', at: [24,
                            432, 253, 452], type: 'boolean', node: temp},
                        {label: 'Retry Backward Schedule after Forward ' +
                            'Schedule (this process will use', at: [24, 480,
                            393, 500], type: 'boolean', node: retry},
                        {label: 'the forward schedule end date as the ' +
                            'backward schedule retry want date)', at: [42,
                            499, 400, 513], split: 358, node: el('span')},
                        {label: 'Keep Determinant Path From Forward ' +
                            'Schedule on Backward Retry', at: [50, 516, 396,
                            536], type: 'boolean', node: keep},
                        {label: '(all non-determinant path operations will ' +
                            'be rescheduled)', at: [70, 535, 378, 549],
                            split: 308, node: el('span')}],
                    buttons: buttons}), progress);
                fill();
                UI.modal('Schedule All Orders', body, [
                    {label: 'Cancel'},
                    {label: 'OK', primary: true, onclick: function (close) {
                        var c = code.value.trim().toUpperCase() ||
                            'STANDARD';
                        progress.textContent = 'Scheduling...';
                        Rpc.desk('js_schedule_all', [{schedule: c,
                            description: description.value,
                            as_of: asOf.value || null,
                            infinite: infinite.checked,
                            horizon: parseInt(horizon.value, 10) || 730,
                            hard_release_dates: hard.checked,
                            mode: radioValue(modes, g + 'm'),
                            sort_by: radioValue(sorts, g + 's'),
                            started: radioValue(starts, g + 'w'),
                            piece_scheduling: piece.checked,
                            retry_backward: retry.checked,
                            keep_forward_dp: retry.checked && keep.checked}])
                            .then(function (r) {
                                if (close) {
                                    close();
                                }
                                UI.toast(r.orders + ' work order(s), ' +
                                    r.operations + ' operation(s) ' +
                                    'scheduled; ' + r.late + ' late', 'ok');
                                showSchedule(c);
                            }, function (e) {
                                progress.textContent = '';
                                failed(e);
                            });
                        return true;
                    }}]);
                widen('pl-mid');
            }, failed);
        }

        function scheduleWorkOrder(id) {
            Rpc.desk('js_schedule_work_order', sched([id])).then(
                function () {
                    UI.toast('Work order scheduled', 'ok');
                    refresh();
                }, failed);
        }

        /* Set Load Horizon (dlgLoadHorizon) */
        function loadHorizon() {
            var days = el('input', {type: 'number', min: 1, value:
                info.load_horizon});
            UI.modal('Set Load Horizon', placed({fields: [{label: 'Load ' +
                'Horizon (days)', at: [17, 19, 171, 39], split: 112, node:
                days}]}), [{label: 'Cancel'}, {label: 'OK', primary: true,
                    onclick: function () {
                        Rpc.desk('js_schedule_settings', [{schedule:
                            state.schedule, load_horizon: parseInt(
                                days.value, 10) || 90}]).then(
                            function () {
                                refresh();
                            }, failed);
                    }}]);
        }

        /* Schedule Comparison: the STANDARD schedule and two what-if ones */
        var whatIf1 = el('select');
        var whatIf2 = el('select');
        var pctStd = el('input', {type: 'text', readonly: true});
        var pct1 = el('input', {type: 'text', readonly: true});
        var pct2 = el('input', {type: 'text', readonly: true});
        var compGrid = null;

        function loadComparison() {
            var others = (info.schedules || []).filter(function (c) {
                return c !== 'STANDARD';
            });
            [whatIf1, whatIf2].forEach(function (sel, i) {
                var keep = sel.value || others[i] || '';
                UI.clear(sel).appendChild(el('option', {value: ''}, ''));
                others.forEach(function (c) {
                    sel.appendChild(el('option', {value: c, selected: c ===
                        keep || null}, c));
                });
            });
            Rpc.desk('js_schedule_comparison', [whatIf1.value || null,
                whatIf2.value || null]).then(function (d) {
                    function pct(v) {
                        return v === null || v === undefined ? '' : v + '%';
                    }
                    pctStd.value = pct(d.percent_late.standard);
                    pct1.value = pct(d.percent_late.what_if_1);
                    pct2.value = pct(d.percent_late.what_if_2);
                    compGrid.set(d.rows);
                }, failed);
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
                                'Shift 2', 'Shift 3'].map(function (h) {
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
                            /* (Jobshop's weekly calendar has no
                             * capacities: the resource's shift capacities
                             * apply; a stored one stays as it is) */
                            table.appendChild(el('tr', el('td', day[1]),
                                el('td', c.start), el('td', c.s1),
                                el('td', c.s2), el('td', c.s3)));
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
                        shift_3: numOrNull(c.s3)
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
            UI.modal('Weekly Calendars', el('div', el('div.pl-form',
                field('Schedule ID', el('input', {type: 'text', readonly:
                    true, value: info.code})), field('Resource ID',
                    resource)), el('p.muted', 'Resource All: the shop\'s ' +
                    'calendar; a resource\'s own days replace it. Hours per ' +
                    'shift.'), table),
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
                                r.reason_code === x.id || null},
                                String(x.rec_name).split(' ')[0]);
                        })),
                    descr: el('input', {type: 'text', readonly: true})
                };
                c.reason.disabled = !editable;
                function describeReason() {
                    var x = reasons.filter(function (y) {
                        return String(y.id) === c.reason.value;
                    })[0];
                    c.descr.value = x ? x.rec_name : '';
                    c.reason.title = c.descr.value;
                }
                c.reason.addEventListener('change', describeReason);
                describeReason();
                c.tr = el('tr', {onclick: function () {
                    lines.forEach(function (l) {
                        l.tr.classList.toggle('sel', l === c);
                    });
                    c.selected = true;
                }}, el('td', c.start), el('td', c.end), el('td', c.sod),
                    el('td', c.s1), el('td', c.s2), el('td', c.s3),
                    el('td', c.c1), el('td', c.c2), el('td', c.c3),
                    el('td', c.reason), el('td', c.descr));
                return c;
            }
            function draw() {
                UI.clear(table).appendChild(el('tr', ['Start Date',
                    'End Date', 'Start of Day', 'Shift 1 Duration',
                    'Shift 2 Duration', 'Shift 3 Duration',
                    'Shift 1 Capacity', 'Shift 2 Capacity',
                    'Shift 3 Capacity', 'Reason Code', 'Description'].map(
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
                state.viewType = radioValue(viewType, viewGroup);
                fillResources();
                loadResources();
            });
            resourceSel.addEventListener('change', function () {
                loadResources();
            });
            if (!info.views.length) {
                Array.prototype.forEach.call(viewType.querySelectorAll(
                    'input'), function (r) {
                        r.disabled = r.value === 'view';
                    });
            }
            /* Resource: the view type, the resource and its description */
            resPane.appendChild(placed({frames: [{label: '', at: [7, 0, 130,
                55]}], fields: [
                {label: '', at: [18, 12, 126, 49], split: 0, node: viewType},
                {label: 'Shop Resource ID', at: [140, 12, 393, 32],
                    split: 100, node: resourceSel},
                {label: '', at: [242, 32, 653, 52], split: 0, node:
                    resourceDescr}],
                buttons: [{label: 'Schedule', at: [540, 8, 630, 30],
                    onclick: function () {
                        state.chart = 'resource';
                        bySel.value = 'resource';
                        t.show(2);
                    }}]}));
            resPane.appendChild(resGrid.node);

            woGrid = grid(opColumns(false), {id: 'id', menu: opMenu, open:
                function (r) {
                    openWorkOrder(r.root, r.work_id);
                }, empty: 'Choose a scheduled work order.'});
            fillWorkOrders();
            woSel.addEventListener('change', loadWorkOrder);
            woPane.appendChild(placed({fields: [
                {label: 'Work ID', at: [7, 11, 226, 32], split: 72, node:
                    woSel},
                {label: '', at: [234, 11, 504, 31], split: 0, node:
                    woDescr}]}));
            woPane.appendChild(el('div.pl-bar',
                el('span.spacer'), access.schedule ? el('button', {type:
                    'button', onclick: function () {
                        if (woSel.value) {
                            scheduleWorkOrder(parseInt(woSel.value, 10));
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
            chartPane.appendChild(gxNote);
            chartPane.appendChild(gx);

            /* Schedule Comparison (SCHED_COMP) */
            compGrid = grid([
                {key: 'work_id', label: 'Work ID'},
                {key: 'lot_id', label: 'Lot ID'},
                {key: 'split_id', label: 'Split ID'},
                {key: 'order_status', label: 'Order Status'},
                {key: 'part_id', label: 'Part ID'},
                {key: 'desired_qty', label: 'Desired Qty', type: 'num'},
                {key: 'hard_rls_date', label: 'Hard Rls Date', type: 'check'},
                {key: 'forward_schedule', label: 'Forward Schedule',
                    type: 'check'},
                {key: 'global_rank', label: 'Global Rank', type: 'num'},
                {key: 'release_date', label: 'Desired Release Date',
                    type: 'date'},
                {key: 'want_date', label: 'Desired Want Date', type: 'date'},
                {key: 'standard_start', label: 'Standard Start Date',
                    type: 'dt'},
                {key: 'standard_finish', label: 'Standard Finish Date',
                    type: 'dt'},
                {key: 'what_if_1_start', label: 'What If 1 Start Date',
                    type: 'dt'},
                {key: 'what_if_1_finish', label: 'What If 1 Finish Date',
                    type: 'dt'},
                {key: 'what_if_2_start', label: 'What If 2 Start Date',
                    type: 'dt'},
                {key: 'what_if_2_finish', label: 'What If 2 Finish Date',
                    type: 'dt'}
            ], {id: 'id', empty: 'Nothing scheduled: run Schedule All.',
                open: function (r) {
                    openWorkOrder(r.id, r.work_id);
                }, menu: function (event, rows) {
                    /* PopupSchedulingScheduleComp */
                    var items = compGrid.browseItems();
                    if (rows.length === 1) {
                        items = items.concat('-', {label: 'Open Work ' +
                            'Order...', onclick: function () {
                                openWorkOrder(rows[0].id, rows[0].work_id);
                            }});
                    }
                    popup(event, items);
                }});
            whatIf1.addEventListener('change', loadComparison);
            whatIf2.addEventListener('change', loadComparison);
            compPane.appendChild(placed({fields: [
                {label: 'Standard Schedule Percent Late', at: [14, 4, 237,
                    24], split: 174, node: pctStd},
                {label: 'What If 1 Percent Late', at: [249, 4, 448, 24],
                    split: 150, node: pct1},
                {label: 'What If 2 Percent Late', at: [460, 4, 659, 24],
                    split: 150, node: pct2}]}));
            compPane.appendChild(el('div.pl-bar', field('What If 1', whatIf1),
                field('What If 2', whatIf2)));
            compPane.appendChild(compGrid.node);

            body.appendChild(t.bar);
            body.appendChild(el('div.tab-panes', panes.map(function (p) {
                return p.node;
            })));
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
