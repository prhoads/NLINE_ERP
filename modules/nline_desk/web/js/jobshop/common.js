/* N-Line Jobshop emulation: common screens (module nline_js_common; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * The Common group bar: Free On Board Points, Shipping Methods,
 * States/Provinces, Postal Codes, Terms, Product Codes, Commodity Codes,
 * Reason Codes, Currency Codes, Alert Messages, User Control Panel.
 *
 * Jobshop's code tables are grids: every row a record, edited in place; the
 * row header shows a check mark on a changed row and a red X on a row marked
 * for deletion (Del); Save (Ctrl+S) saves them all at once. The grid is
 * window.JobshopCommon.codeTable(main, spec), for the other areas' tables
 * too (sales reps, territories, SIC codes...).
 *
 * Frame-wide prototypes for the other screens (docs/jobshop/analysis/
 * common.md, "Frame (all windows)"): gridTools (header sort, column size /
 * move, the Browse right-click: Filter Including / Excluding / by, Remove
 * Filters/Sort, Browse Filter dialog, Save widths and positions, Freeze
 * Columns, Export to Excel), filterDomain, preferences (File >
 * Preferences, route preferences), checkPostalCode / addStateProvince (Add
 * On the Fly), findReplace (Find and Replace), pictureTools (Edit >
 * Picture), watchAlerts. */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    /* ---- Style -------------------------------------------------------- */

    function style() {
        if (document.getElementById('nl-js-common-css')) {
            return;
        }
        document.head.appendChild(el('style#nl-js-common-css', [
            'table.code-table td { padding: 2px 4px; }',
            'table.code-table td input[type=text], table.code-table td ' +
                'select { width: 100%; box-sizing: border-box; }',
            'table.code-table th.row-head, table.code-table td.row-head ' +
                '{ width: 26px; text-align: center; padding: 0; }',
            'table.code-table td.row-head button { width: 24px; padding: ' +
                '2px 0; border: none; background: none; cursor: pointer; ' +
                'color: var(--muted); font-weight: 600; }',
            'table.code-table tr.changed td.row-head button ' +
                '{ color: var(--ok); }',
            'table.code-table tr.deleted td.row-head button ' +
                '{ color: var(--bad); }',
            'table.code-table tr.deleted td { opacity: .55; ' +
                'text-decoration: line-through; }',
            'table.code-table tr.selected td { background: ' +
                'var(--accent-soft); }',
            'table.code-table tr.inactive td { color: var(--muted); }',
            '.code-filters { display: flex; gap: 12px; align-items: ' +
                'center; flex-wrap: wrap; margin-bottom: 8px; }',
            '.code-filters label { display: inline-flex; gap: 6px; ' +
                'align-items: center; color: var(--muted); }',
            '.code-filters .picker { min-width: 220px; }',
            '.code-count { margin-left: auto; color: var(--muted); }',
            '.js-help { color: var(--muted); margin: 0 0 8px; }',
            '.alert-list td.num { white-space: nowrap; }',
            '.alert-list tr.unread td { font-weight: 600; }',
            '.cp-grid { display: grid; grid-template-columns: ' +
                'repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }',
            '.cp-grid section.panel h2 { margin-top: 0; font-size: 16px; }',
            '.cp-grid .grid-form { grid-template-columns: 1fr; }',
            '.alerts-home li { margin: 2px 0; }',
            /* Jobshop's grid: sortable, sizable, movable, freezable */
            'table.js-grid th.sortable { cursor: pointer; position: ' +
                'relative; user-select: none; }',
            'table.js-grid th .sort-mark { color: var(--muted); ' +
                'margin-left: 4px; font-size: 11px; }',
            'table.js-grid th .col-grip { position: absolute; top: 0; ' +
                'right: -3px; width: 7px; height: 100%; cursor: col-resize; ' +
                'z-index: 2; }',
            'table.js-grid th.drop-target { box-shadow: inset 3px 0 0 ' +
                'var(--accent, #f47b20); }',
            'table.js-grid .col-hidden { display: none; }',
            'table.js-grid .frozen { position: sticky; z-index: 1; ' +
                'background: var(--paper, #fff); }',
            'table.js-grid th.frozen { z-index: 3; }',
            '.js-dialog-tabs { display: flex; gap: 4px; margin-bottom: 8px; }',
            '.js-dialog-tabs button.active { background: var(--accent-soft); ' +
                'font-weight: 600; }',
            '.js-dialog table.data td { padding: 2px 4px; }',
            '.js-dialog table.data td input[type=text], .js-dialog ' +
                'table.data td select { width: 100%; box-sizing: ' +
                'border-box; }',
            '.js-dialog table.data tr.selected td { background: ' +
                'var(--accent-soft); }',
            '.js-pick-lists { display: grid; grid-template-columns: 1fr ' +
                'auto 1fr; gap: 8px; align-items: center; }',
            '.js-pick-lists select { width: 100%; min-width: 180px; }',
            '.js-pick-lists .mid { display: flex; flex-direction: column; ' +
                'gap: 6px; }',
            '.js-dialog .row { display: grid; grid-template-columns: ' +
                '130px 1fr; gap: 6px; align-items: center; margin: 4px 0; }',
            '.js-dialog textarea { width: 100%; box-sizing: border-box; }',
            '.js-prefs fieldset { border: 1px solid var(--line); ' +
                'border-radius: 4px; margin: 8px 0; }',
            '.js-prefs label.check { display: block; margin: 3px 0; }',
            '.js-prefs .cols { display: grid; grid-template-columns: ' +
                'repeat(auto-fit, minmax(300px, 1fr)); gap: 0 16px; }',
            '.js-prefs input[type=number] { width: 80px; }',
            '.js-prefs .js-note { font-size: 0.85em; color: var(--muted, ' +
                '#666); white-space: nowrap; }',
            '.pictures.stretch img { width: 100%; height: auto; }'
        ].join('\n')));
    }

    /* ---- Helpers ------------------------------------------------------ */

    function readFields(columns) {
        var names = [];
        columns.forEach(function (c) {
            if (c.type === 'many2one') {
                names.push(c.name, c.name + '.rec_name');
            } else if (c.name) {
                names.push(c.name);
            }
        });
        return names;
    }

    function m2o(record, name) {
        var id = record[name];
        var related = record[name + '.'];
        if (!id) {
            return null;
        }
        return {id: id, rec_name: related ? related.rec_name : String(id)};
    }

    function same(a, b) {
        return JSON.stringify(a === undefined ? null : a) ===
            JSON.stringify(b === undefined ? null : b);
    }

    function isTyping(node) {
        return node && (node.tagName === 'INPUT' || node.tagName ===
            'TEXTAREA' || node.tagName === 'SELECT');
    }

    /* ---- Storage per computer ----------------------------------------- */

    /* Jobshop keeps the grid layouts and the program preferences per
     * computer (its .ini file): here the browser's storage, which may be
     * missing (private window) — then nothing is kept */
    function stored(key, value) {
        try {
            if (value === undefined) {
                return JSON.parse(global.localStorage.getItem(key) || 'null');
            }
            if (value === null) {
                global.localStorage.removeItem(key);
            } else {
                global.localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) {
            /* no storage: the defaults */
        }
        return null;
    }

    /* ---- File > Preferences (Vmfg\Preferences) ------------------------- */

    var CARD_DEFAULTS = {cardMaterial: '#e5332a', cardToolFixture: '#f4c542',
        cardPhantom: '#b0b0b0', cardOperation: '#3ad14a',
        cardService: '#33d6f0'};
    var PREF_DEFAULTS = Object.assign({
        showHomeAtStartup: true, addOnFly: true, showAlertsAtStartup: true,
        checkAlerts: false, checkAlertsMinutes: 15, loadAvailToPromise: true,
        loadProjectedAvailable: true, autoBrowse: false,
        autoBrowseMinChars: 2, autoRefreshBrowse: true, browseMaxRows: 1000,
        browseMaxRowsWarning: true, confirmExit: false, confirmPrint: false,
        confirmSchedulingExit: true, showTooltips: true,
        showShortcuts: true, askPrintPackList: true, previewPackList: true,
        printPackList: false, askPrintReceiver: true, previewReceiver: true,
        printReceiver: false, saveSettingsOnExit: true,
        saveCurrentGroup: true, showNavigatorIcons: true, showTips: false,
        showToolsInStatusBar: true, resizeNavBar: false,
        navGrowthPercent: 0, customReportPath: ''}, CARD_DEFAULTS);
    var PREF_KEY = 'nline.jobshop.preferences';

    /* The user's program preferences on this computer (defaults filled) */
    function preferences() {
        return Object.assign({}, PREF_DEFAULTS, stored(PREF_KEY) || {});
    }

    /* ---- Jobshop's grid tools ----------------------------------------- */

    var CONDITIONS = [['lt', 'Less than'], ['le', 'Less than or Equal to'],
        ['ne', 'Not equal to'], ['eq', 'Equals'], ['gt', 'Greater than'],
        ['ge', 'Greater than or Equal to'], ['begins', 'Begins with'],
        ['contains', 'Contains'], ['ends', 'Ends with'],
        ['like', 'Matches (* ?)']];

    function cellText(td) {
        if (!td) {
            return '';
        }
        var select = td.querySelector('select');
        if (select) {
            var option = select.options[select.selectedIndex];
            return option ? option.textContent : '';
        }
        var box = td.querySelector('input[type=checkbox]');
        if (box) {
            return box.checked ? 'Y' : 'N';
        }
        var input = td.querySelector('input, textarea');
        if (input) {
            return input.value;
        }
        return td.textContent.trim();
    }

    function number(text) {
        var t = String(text).replace(/[,$\s%]/g, '');
        return t !== '' && !isNaN(Number(t)) ? Number(t) : null;
    }

    function compare(a, b) {
        var x = number(a), y = number(b);
        if (x !== null && y !== null) {
            return x - y;
        }
        return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
    }

    /* A Jobshop search pattern (* any text, ? one character) as a regular
     * expression; without a wildcard the text begins the value */
    function pattern(text) {
        var t = String(text);
        if (!/[*?]/.test(t)) {
            t += '*';
        }
        return new RegExp('^' + t.replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    }

    function test(filter, text) {
        var v = String(filter.value === null || filter.value === undefined ?
            '' : filter.value);
        var t = String(text);
        var lt = t.toLowerCase(), lv = v.toLowerCase();
        switch (filter.cond) {
        case 'lt': return compare(t, v) < 0;
        case 'le': return compare(t, v) <= 0;
        case 'gt': return compare(t, v) > 0;
        case 'ge': return compare(t, v) >= 0;
        case 'ne': return compare(t, v) !== 0;
        case 'begins': return lt.indexOf(lv) === 0;
        case 'contains': return lt.indexOf(lv) >= 0;
        case 'ends': return lv === '' || lt.slice(-lv.length) === lv;
        case 'like': return pattern(v).test(t);
        default: return compare(t, v) === 0;
        }
    }

    /* The filters of the Browse Filter dialog as a Tryton domain, for a
     * browse read from the server ({col: field name}); 'like' and the
     * text conditions become ilike */
    function filterDomain(filters, fieldOf) {
        var clauses = [];
        (filters || []).forEach(function (f) {
            var field = fieldOf(f.col);
            if (!field) {
                return;
            }
            var v = f.value;
            var ops = {lt: '<', le: '<=', gt: '>', ge: '>=', ne: '!=',
                eq: '='};
            var clause = ops[f.cond] ? [field, ops[f.cond], v] :
                f.cond === 'begins' ? [field, 'ilike', v + '%'] :
                f.cond === 'ends' ? [field, 'ilike', '%' + v] :
                f.cond === 'contains' ? [field, 'ilike', '%' + v + '%'] :
                [field, 'ilike', (/[*?]/.test(v) ? v : v + '*')
                    .replace(/\*/g, '%').replace(/\?/g, '_')];
            clauses.push({clause: clause, join: f.join});
        });
        if (!clauses.length) {
            return [];
        }
        /* Left to right, as the dialog reads: ((a and b) or c) ... */
        var result = [clauses[0].clause];
        for (var i = 1; i < clauses.length; i++) {
            result = [clauses[i - 1].join === 'or' ? 'OR' : 'AND', result,
                [clauses[i].clause]];
        }
        return result;
    }

    function download(name, text, type) {
        var blob = new global.Blob(['﻿' + text], {type: type ||
            'text/csv;charset=utf-8'});
        var a = el('a', {href: global.URL.createObjectURL(blob),
            download: name});
        document.body.appendChild(a);
        a.click();
        global.setTimeout(function () {
            global.URL.revokeObjectURL(a.href);
            a.remove();
        }, 1000);
    }

    function csvCell(v) {
        v = v === null || v === undefined ? '' : String(v);
        return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }

    /* Two lists: available / selected, Add -> / <- Remove / Up / Down
     * (VBrowse\Export, the Sorting tab of VBrowse\Filters). items: [[value,
     * label]]; selected: [values] -> {node, value()} */
    function pickLists(items, selected, availableTitle, selectedTitle) {
        var chosen = selected.slice();
        var available = el('select', {size: 12, multiple: true,
            'aria-label': availableTitle});
        var picked = el('select', {size: 12, multiple: true,
            'aria-label': selectedTitle});
        var labels = {};
        items.forEach(function (i) {
            labels[i[0]] = i[1];
        });
        function draw() {
            UI.clear(available);
            UI.clear(picked);
            items.forEach(function (i) {
                if (chosen.indexOf(i[0]) < 0) {
                    available.appendChild(el('option', {value: i[0]}, i[1]));
                }
            });
            chosen.forEach(function (v) {
                picked.appendChild(el('option', {value: v}, labels[v]));
            });
        }
        function values(select) {
            return Array.prototype.filter.call(select.options, function (o) {
                return o.selected;
            }).map(function (o) {
                return o.value;
            });
        }
        function move(step) {
            var v = values(picked);
            if (v.length !== 1) {
                return;
            }
            var at = chosen.indexOf(v[0]);
            var to = at + step;
            if (to < 0 || to >= chosen.length) {
                return;
            }
            chosen.splice(at, 1);
            chosen.splice(to, 0, v[0]);
            draw();
            picked.value = v[0];
        }
        function button(label, onclick) {
            return el('button', {type: 'button', onclick: onclick}, label);
        }
        draw();
        available.addEventListener('dblclick', function () {
            chosen = chosen.concat(values(available));
            draw();
        });
        picked.addEventListener('dblclick', function () {
            var v = values(picked);
            chosen = chosen.filter(function (c) {
                return v.indexOf(c) < 0;
            });
            draw();
        });
        return {
            node: el('div.js-pick-lists',
                el('label', el('div.muted', availableTitle), available),
                el('div.mid',
                    button('Add ->', function () {
                        chosen = chosen.concat(values(available));
                        draw();
                    }),
                    button('<- Remove', function () {
                        var v = values(picked);
                        chosen = chosen.filter(function (c) {
                            return v.indexOf(c) < 0;
                        });
                        draw();
                    }),
                    button('Up', function () {
                        move(-1);
                    }),
                    button('Down', function () {
                        move(1);
                    })),
                el('label', el('div.muted', selectedTitle), picked)),
            value: function () {
                return chosen.slice();
            }
        };
    }

    /* gridTools({table, key, title, offset (leading columns kept: the row
     * header), columns: [{label}], text(tr, col), pinned(tr), onchange(shown,
     * total)}) -> {apply(), applyRow(tr), menuItems(event, tr, col),
     * filterDialog(), exportDialog(), state(), removeFilters()}.
     *
     * Jobshop's grid and Browse functions on any table: header click sorts
     * A to Z (Shift+click Z to A), drag the header edge to size a column,
     * drag a header to move it; the Browse right-click items: Filter
     * Including / Excluding the clicked value, Filter by (* and ?), Remove
     * Filters/Sort, Sort Ascending / Descending, Browse Filter (Columns,
     * Filters, Sorting), Save widths and positions, Freeze/UnFreeze
     * Columns, Export to Excel. The layout (widths, positions, frozen,
     * visible columns, titles, saved filters and sorting) is kept per
     * computer under key. */
    function gridTools(spec) {
        style();
        var table = spec.table;
        var offset = spec.offset || 0;
        var columns = spec.columns;
        var head = table.tHead.rows[0];
        var body = table.tBodies[0];
        var storeKey = spec.key ? 'nline.grid.' + spec.key : null;
        var saved = (storeKey && stored(storeKey)) || {};
        var state = {
            filters: (saved.filters || []).slice(),
            sort: (saved.sort || []).slice(),
            hidden: Object.assign({}, saved.hidden || {}),
            titles: Object.assign({}, saved.titles || {}),
            widths: Object.assign({}, saved.widths || {}),
            order: saved.order && saved.order.length === columns.length ?
                saved.order.slice() : columns.map(function (c, i) {
                    return i;
                }),
            frozen: saved.frozen || 0
        };
        table.classList.add('js-grid');

        function tag(cells) {
            /* The logical column of each cell, from its first position */
            for (var i = offset; i < cells.length; i++) {
                if (cells[i].dataset.col === undefined) {
                    cells[i].dataset.col = String(i - offset);
                }
            }
        }

        function cellOf(tr, col) {
            for (var i = offset; i < tr.cells.length; i++) {
                if (tr.cells[i].dataset.col === String(col)) {
                    return tr.cells[i];
                }
            }
            return tr.cells[offset + col];
        }

        function text(tr, col) {
            return spec.text ? spec.text(tr, col) : cellText(cellOf(tr, col));
        }

        function pinned(tr) {
            return spec.pinned ? spec.pinned(tr) : false;
        }

        function arrange(tr) {
            var cells = Array.prototype.slice.call(tr.cells);
            tag(cells);
            var byCol = {};
            cells.slice(offset).forEach(function (c) {
                byCol[c.dataset.col] = c;
            });
            state.order.forEach(function (col) {
                var c = byCol[col];
                if (c) {
                    tr.appendChild(c);
                    c.classList.toggle('col-hidden', !!state.hidden[col]);
                }
            });
        }

        function shown(tr) {
            if (pinned(tr) || !state.filters.length) {
                return true;
            }
            var ok = test(state.filters[0], text(tr, state.filters[0].col));
            for (var i = 1; i < state.filters.length; i++) {
                var r = test(state.filters[i], text(tr, state.filters[i].col));
                ok = state.filters[i - 1].join === 'or' ? ok || r : ok && r;
            }
            return ok;
        }

        function header() {
            arrange(head);
            Array.prototype.forEach.call(head.cells, function (th, i) {
                if (i < offset) {
                    return;
                }
                var col = parseInt(th.dataset.col, 10);
                if (!th.dataset.ready) {
                    th.dataset.ready = '1';
                    th.dataset.label = th.textContent;
                    th.classList.add('sortable');
                    th.title = (th.title ? th.title + '\n' : '') + 'Click: ' +
                        'sort A to Z; Shift+click: Z to A; drag the edge to ' +
                        'size, the title to move';
                    th.draggable = true;
                    th.addEventListener('click', function (event) {
                        if (event.target.classList.contains('col-grip')) {
                            return;
                        }
                        state.sort = [[col, event.shiftKey ? 'desc' : 'asc']];
                        apply();
                    });
                    th.addEventListener('dragstart', function (event) {
                        event.dataTransfer.setData('text/plain', 'col:' + col);
                    });
                    th.addEventListener('dragover', function (event) {
                        event.preventDefault();
                        th.classList.add('drop-target');
                    });
                    th.addEventListener('dragleave', function () {
                        th.classList.remove('drop-target');
                    });
                    th.addEventListener('drop', function (event) {
                        event.preventDefault();
                        th.classList.remove('drop-target');
                        var data = event.dataTransfer.getData('text/plain');
                        var from = /^col:(\d+)$/.exec(data);
                        if (!from || parseInt(from[1], 10) === col) {
                            return;
                        }
                        var moved = parseInt(from[1], 10);
                        state.order.splice(state.order.indexOf(moved), 1);
                        state.order.splice(state.order.indexOf(col), 0, moved);
                        apply();
                    });
                    var grip = el('span.col-grip', {title: 'Drag to size'});
                    grip.addEventListener('mousedown', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        var start = event.clientX;
                        var width = th.getBoundingClientRect().width;
                        th.draggable = false;
                        function onMove(e) {
                            var w = Math.max(30, Math.round(width + e.clientX -
                                start));
                            state.widths[col] = w;
                            th.style.width = th.style.minWidth = w + 'px';
                        }
                        function onUp() {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            th.draggable = true;
                            freeze();
                        }
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });
                    th.appendChild(grip);
                }
                var label = state.titles[col] || th.dataset.label;
                var sort = state.sort.filter(function (s) {
                    return s[0] === col;
                })[0];
                var textNode = th.firstChild;
                if (textNode && textNode.nodeType === 3) {
                    textNode.nodeValue = label;
                }
                var mark = th.querySelector('.sort-mark');
                if (!mark) {
                    mark = el('span.sort-mark');
                    th.insertBefore(mark, th.querySelector('.col-grip'));
                }
                mark.textContent = sort ? (sort[1] === 'desc' ? '▼' : '▲') :
                    '';
                if (state.widths[col]) {
                    th.style.width = th.style.minWidth = state.widths[col] +
                        'px';
                }
            });
        }

        function freeze() {
            var frozen = state.frozen;
            Array.prototype.forEach.call(table.querySelectorAll('.frozen'),
                function (c) {
                    c.classList.remove('frozen');
                    c.style.left = '';
                });
            if (!frozen) {
                return;
            }
            var lefts = [];
            var visible = 0;
            Array.prototype.forEach.call(head.cells, function (th, i) {
                if (th.classList.contains('col-hidden')) {
                    return;
                }
                if (i >= offset) {
                    visible += 1;
                }
                if (i < offset || visible <= frozen) {
                    lefts[i] = th.offsetLeft;
                }
            });
            [head].concat(Array.prototype.slice.call(body.rows)).forEach(
                function (tr) {
                    Array.prototype.forEach.call(tr.cells, function (c, i) {
                        if (lefts[i] !== undefined) {
                            c.classList.add('frozen');
                            c.style.left = lefts[i] + 'px';
                        }
                    });
                });
        }

        function apply() {
            header();
            var rows = Array.prototype.slice.call(body.rows);
            var count = 0, total = 0;
            rows.forEach(function (tr) {
                arrange(tr);
                var ok = shown(tr);
                tr.hidden = !ok;
                if (!pinned(tr)) {
                    total += 1;
                    count += ok ? 1 : 0;
                }
            });
            if (state.sort.length) {
                var keep = rows.filter(pinned);
                rows.filter(function (tr) {
                    return !pinned(tr);
                }).map(function (tr, i) {
                    return {tr: tr, i: i, keys: state.sort.map(function (s) {
                        return text(tr, s[0]);
                    })};
                }).sort(function (a, b) {
                    for (var k = 0; k < state.sort.length; k++) {
                        var c = compare(a.keys[k], b.keys[k]);
                        if (c) {
                            return state.sort[k][1] === 'desc' ? -c : c;
                        }
                    }
                    return a.i - b.i;
                }).forEach(function (r) {
                    body.appendChild(r.tr);
                });
                keep.forEach(function (tr) {
                    body.appendChild(tr);
                });
            }
            freeze();
            if (spec.onchange) {
                spec.onchange(count, total);
            }
        }

        function applyRow(tr) {
            arrange(tr);
            tr.hidden = !shown(tr);
            if (state.frozen) {
                freeze();
            }
        }

        function save() {
            if (!storeKey) {
                return;
            }
            stored(storeKey, {widths: state.widths, order: state.order,
                frozen: state.frozen, hidden: state.hidden, titles:
                state.titles, filters: saved.filters || [],
                sort: saved.sort || []});
        }

        function saveFilters() {
            saved.filters = state.filters.slice();
            saved.sort = state.sort.slice();
            save();
        }

        function removeFilters() {
            state.filters = [];
            state.sort = [];
            apply();
        }

        function labelOf(col) {
            return state.titles[col] || columns[col].label;
        }

        function filterBy(col, value) {
            var input = el('input', {type: 'text', value: value || '',
                'aria-label': 'Filter by'});
            UI.modal('Filter by ' + labelOf(col), [el('p.muted', 'Enter ' +
                'text to filter for. Wild card characters (*, ?) are ' +
                'accepted.'), input], [
                {label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function () {
                    if (input.value !== '') {
                        state.filters.push({col: col, cond: 'like', value:
                            input.value, join: 'and'});
                        apply();
                    }
                }}]);
            input.select();
        }

        function exportDialog() {
            var visible = state.order.filter(function (c) {
                return !state.hidden[c];
            });
            var lists = pickLists(state.order.map(function (c) {
                return [String(c), labelOf(c)];
            }), visible.map(String), 'Available Columns', 'Selected Columns');
            var headers = el('input', {type: 'checkbox', checked: true});
            UI.modal('Select Columns to Export for ' + (spec.title || ''), [
                el('label', headers, ' First Row Contains Column Headers'),
                lists.node], [
                {label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function () {
                    var cols = lists.value().map(Number);
                    if (!cols.length) {
                        return true;
                    }
                    var lines = [];
                    if (headers.checked) {
                        lines.push(cols.map(function (c) {
                            return csvCell(labelOf(c));
                        }).join(','));
                    }
                    Array.prototype.forEach.call(body.rows, function (tr) {
                        if (tr.hidden || pinned(tr)) {
                            return;
                        }
                        lines.push(cols.map(function (c) {
                            return csvCell(text(tr, c));
                        }).join(','));
                    });
                    download((spec.title || 'Export').replace(/[\\/:*?"<>|]/g,
                        '-') + '.csv', lines.join('\r\n') + '\r\n');
                }}]);
        }

        /* Browse Filter (Ctrl+B; VBrowse\Filters): Columns, Filters,
         * Sorting; OK keeps them on this computer */
        function filterDialog() {
            var hidden = Object.assign({}, state.hidden);
            var titles = Object.assign({}, state.titles);
            var filters = state.filters.map(function (f) {
                return Object.assign({}, f);
            });
            var tabs = el('div.js-dialog-tabs');
            var panes = [];

            function tab(title, node) {
                var b = el('button', {type: 'button', onclick: function () {
                    panes.forEach(function (p, i) {
                        p.hidden = p !== node;
                        tabs.children[i].classList.toggle('active', p === node);
                    });
                }}, title);
                tabs.appendChild(b);
                panes.push(node);
                node.hidden = panes.length > 1;
                b.classList.toggle('active', panes.length === 1);
            }

            /* Columns: Visible, Column Description, Title; Clear */
            var colBody = el('tbody');
            function drawColumns() {
                UI.clear(colBody);
                state.order.forEach(function (c) {
                    var box = el('input', {type: 'checkbox', checked:
                        !hidden[c], 'aria-label': 'Visible'});
                    box.addEventListener('change', function () {
                        if (box.checked) {
                            delete hidden[c];
                        } else {
                            hidden[c] = true;
                        }
                    });
                    var title = el('input', {type: 'text', value: titles[c] ||
                        columns[c].label, 'aria-label': 'Title'});
                    title.addEventListener('input', function () {
                        titles[c] = title.value && title.value !==
                            columns[c].label ? title.value : undefined;
                        if (!titles[c]) {
                            delete titles[c];
                        }
                    });
                    colBody.appendChild(el('tr', el('td', box),
                        el('td', columns[c].label), el('td', title)));
                });
            }
            drawColumns();
            tab('Columns', el('div', el('table.data', el('thead', el('tr',
                el('th', 'Visible'), el('th', 'Column Description'),
                el('th', 'Title'))), colBody), el('div.toolbar',
                el('button', {type: 'button', onclick: function () {
                    hidden = {};
                    titles = {};
                    drawColumns();
                }}, 'Clear'))));

            /* Filters: Column Description, Condition, Value, And/Or */
            var filterBody = el('tbody');
            var picked = null;
            function options(list, value) {
                return list.map(function (o) {
                    var opt = el('option', {value: o[0]}, o[1]);
                    opt.selected = String(o[0]) === String(value);
                    return opt;
                });
            }
            function drawFilters() {
                UI.clear(filterBody);
                filters.concat([null]).forEach(function (f, i) {
                    var colSel = el('select', {'aria-label':
                        'Column Description'}, [el('option', {value: ''},
                        '')].concat(options(columns.map(function (c, n) {
                            return [n, c.label];
                        }), f ? f.col : '')));
                    var condSel = el('select', {'aria-label': 'Condition'},
                        options(CONDITIONS, f ? f.cond : 'eq'));
                    var value = el('input', {type: 'text', value: f ?
                        f.value : '', 'aria-label': 'Value'});
                    var join = el('select', {'aria-label': 'And/Or'},
                        options([['and', 'And'], ['or', 'Or']], f ? f.join :
                            'and'));
                    function update() {
                        if (colSel.value === '') {
                            return;
                        }
                        var row = {col: parseInt(colSel.value, 10), cond:
                            condSel.value, value: value.value, join:
                            join.value};
                        if (f) {
                            filters[i] = row;
                        } else {
                            filters.push(row);
                            drawFilters();
                        }
                    }
                    [colSel, condSel, join].forEach(function (n) {
                        n.addEventListener('change', update);
                    });
                    value.addEventListener('input', update);
                    var tr = el('tr' + (picked === i && f ? '.selected' : ''),
                        el('td.row-head', el('button', {type: 'button',
                            title: 'Select (Delete removes it)',
                            onclick: function () {
                                picked = f ? i : null;
                                drawFilters();
                            }}, f ? '' : '*')),
                        el('td', colSel), el('td', condSel), el('td', value),
                        el('td', join));
                    filterBody.appendChild(tr);
                });
            }
            drawFilters();
            tab('Filters', el('div', el('table.data.code-table', el('thead',
                el('tr', el('th.row-head', ''), el('th', 'Column Description'),
                    el('th', 'Condition'), el('th', 'Value'),
                    el('th', 'And/Or'))), filterBody), el('div.toolbar',
                el('button', {type: 'button', onclick: function () {
                    if (picked !== null) {
                        filters.splice(picked, 1);
                        picked = null;
                        drawFilters();
                    }
                }}, 'Delete'))));

            /* Sorting: Available / Selected columns */
            var sortLists = pickLists(columns.map(function (c, n) {
                return [String(n), c.label];
            }), state.sort.map(function (s) {
                return String(s[0]);
            }), 'Available Columns', 'Selected Columns');
            tab('Sorting', el('div', sortLists.node));

            function commit() {
                var dirs = {};
                state.sort.forEach(function (s) {
                    dirs[s[0]] = s[1];
                });
                state.hidden = hidden;
                state.titles = titles;
                state.filters = filters.filter(function (f) {
                    return f && f.col !== undefined;
                });
                state.sort = sortLists.value().map(function (v) {
                    var c = parseInt(v, 10);
                    return [c, dirs[c] || 'asc'];
                });
                apply();
            }
            UI.modal('Browse Filter' + (spec.title ? ' - ' + spec.title : ''),
                el('div.js-dialog', tabs, panes), [
                    {label: 'Cancel'},
                    {label: 'Apply', onclick: function () {
                        commit();
                        return true;
                    }},
                    {label: 'OK', primary: true, onclick: function () {
                        commit();
                        saveFilters();
                    }}]);
        }

        /* The Browse right-click items for a cell (tr, logical col) */
        function menuItems(tr, col) {
            var items = [];
            if (tr && col !== null && col !== undefined && !pinned(tr)) {
                var value = text(tr, col);
                items.push({label: 'Filter Including', onclick: function () {
                    state.filters.push({col: col, cond: 'eq', value: value,
                        join: 'and'});
                    apply();
                }}, {label: 'Filter Excluding', onclick: function () {
                    state.filters.push({col: col, cond: 'ne', value: value,
                        join: 'and'});
                    apply();
                }}, {label: 'Filter by…', onclick: function () {
                    filterBy(col, '');
                }});
            }
            items.push({label: 'Remove Filters/Sort', onclick: removeFilters});
            if (col !== null && col !== undefined) {
                items.push('-', {label: 'Sort Ascending', onclick: function () {
                    state.sort = [[col, 'asc']];
                    apply();
                }}, {label: 'Sort Descending', onclick: function () {
                    state.sort = [[col, 'desc']];
                    apply();
                }});
            }
            items.push('-', {label: 'Browse Filter… (Ctrl+B)',
                onclick: filterDialog});
            if (storeKey) {
                items.push({label: 'Save widths and positions', onclick:
                    function () {
                        save();
                        UI.toast('Column widths and positions saved', 'ok');
                    }});
            }
            items.push({label: 'Freeze/UnFreeze Columns',
                checked: !!state.frozen, onclick: function () {
                    if (state.frozen || col === null || col === undefined) {
                        state.frozen = 0;
                    } else {
                        var visible = state.order.filter(function (c) {
                            return !state.hidden[c];
                        });
                        state.frozen = visible.indexOf(col) + 1;
                    }
                    freeze();
                }}, '-', {label: 'Export to Excel…', onclick: exportDialog});
            return items;
        }

        /* The logical column of an event's cell, null outside the columns */
        function columnAt(event) {
            var td = event.target.closest ? event.target.closest('td, th') :
                null;
            if (!td || td.dataset.col === undefined) {
                return null;
            }
            return parseInt(td.dataset.col, 10);
        }

        apply();
        return {apply: apply, applyRow: applyRow, menuItems: menuItems,
            columnAt: columnAt, filterDialog: filterDialog,
            exportDialog: exportDialog, removeFilters: removeFilters,
            state: function () {
                return state;
            }};
    }

    /* ---- The code table grid ------------------------------------------ */

    /* codeTable(main, {title, model, help, columns: [{name, label, type,
     * model, domain, options, readonly, default (value or function),
     * scale (shown multiplied: 100 for a percent kept as a ratio),
     * invert (a check box showing the opposite: Inactive for active),
     * width}], order, domain, inactive (the model has "active": Jobshop's
     * Inactive column and Show inactive), filters: [{name, label, model
     * (many2one) | options (selection), value: {id, rec_name} | value,
     * clause(value) -> domain}], defaults (of a new row), rowMenu(record) ->
     * [{label, onclick}], validate(values, record) -> error text | null
     * (may change values), report: '<Jobshop report id>' (Print), key
     * (where the layout is kept; the model by default), limit}) ->
     * {reload(), filterValue(name), save(), tools}
     *
     * Jobshop's table window: the row header shows * on the new row, + on
     * a new row with data, a check mark on a changed row and a red X on a
     * row marked for deletion; Save (Ctrl+S) saves them all; F5 / Shift+F5
     * refresh; Del marks, Ins adds; Ctrl+B Browse Filter; the right-click
     * menu (Shift+right-click: the browser's own) has Add Row / Delete Row
     * and the Browse items (gridTools). */
    function codeTable(main, spec) {
        style();
        var columns = spec.columns.concat(spec.inactive ? [{name: 'active',
            label: 'Inactive', type: 'boolean', invert: true, default: true,
            width: '70px'}] : []);
        var rows = [];
        var selected = null;
        var rendering = false;
        var tools = null;
        var access = {read: true, write: false, create: false,
            delete: false};
        var body = el('tbody');
        var count = el('span.code-count');
        var search = el('input', {type: 'text', 'aria-label': 'Find',
            placeholder: 'Begins with (* any text, ? one character)'});
        /* Jobshop lists the inactive rows too, with Inactive checked */
        var showInactive = el('input', {type: 'checkbox', checked: true,
            'aria-label': 'Show inactive'});
        var filters = (spec.filters || []).map(function (f) {
            var control = UI.fieldControl({name: f.name, label: f.label,
                type: f.model ? 'many2one' : 'selection', model: f.model,
                options: f.options, domain: f.domain});
            control.set(f.value === undefined ? null : f.value);
            control.filter = f;
            var input = control.picker ? control.picker.input : control.node;
            input.addEventListener('change', function () {
                reload();
            });
            if (control.picker) {
                /* A chosen country reloads at once; a cleared one too */
                var pick = control.picker;
                input.addEventListener('input', function () {
                    if (!input.value) {
                        reload();
                    }
                });
                pick.input.addEventListener('blur', function () {
                    global.setTimeout(function () {
                        if (pick.value() !== control.last) {
                            reload();
                        }
                    }, 200);
                });
            }
            return control;
        });

        function filterValue(name) {
            var found = filters.filter(function (c) {
                return c.filter.name === name;
            })[0];
            if (!found) {
                return null;
            }
            if (found.picker) {
                var record = found.picker.record();
                return record ? {id: record.id, rec_name: record.rec_name} :
                    null;
            }
            return found.get();
        }

        function domain() {
            var result = (spec.domain || []).slice();
            filters.forEach(function (c) {
                var v = c.picker ? c.picker.value() : c.get();
                c.last = v;
                if (v !== null && v !== undefined && v !== '') {
                    result = result.concat(c.filter.clause ?
                        c.filter.clause(v) : [[c.filter.name, '=', v]]);
                }
            });
            /* Jobshop's search: the text begins the value; * any text,
             * ? one character */
            var text = search.value.trim();
            if (text) {
                if (!/[*?]/.test(text)) {
                    text += '*';
                }
                result.push(['rec_name', 'ilike', text.replace(/%/g, '\\%')
                    .replace(/_/g, '\\_').replace(/\*/g, '%')
                    .replace(/\?/g, '_')]);
            }
            return result;
        }

        function columnValue(row, c) {
            var v = row.controls[c.name].get();
            if (c.invert) {
                return !v;
            }
            if (c.scale && v !== null && v !== undefined) {
                var n = typeof v === 'object' ? parseFloat(v.decimal) :
                    Number(v);
                return global.Rpc.decimal(String(+(n / c.scale).toFixed(8)));
            }
            return v;
        }

        function setColumn(row, c, record) {
            var v = c.type === 'many2one' ? m2o(record, c.name) :
                record[c.name];
            if (c.invert) {
                v = !v;
            } else if (c.scale && v !== null && v !== undefined) {
                v = +(Number(v) * c.scale).toFixed(6);
            }
            row.controls[c.name].set(v);
        }

        function snapshot(row) {
            var values = {};
            columns.forEach(function (c) {
                if (!c.readonly) {
                    values[c.name] = columnValue(row, c);
                }
            });
            return values;
        }

        function changes(row) {
            var now = snapshot(row);
            var result = {};
            Object.keys(now).forEach(function (name) {
                if (!same(now[name], row.original[name])) {
                    result[name] = now[name];
                }
            });
            return result;
        }

        function blank(row) {
            var now = snapshot(row);
            return Object.keys(now).every(function (name) {
                return same(now[name], row.original[name]);
            });
        }

        function mark(row) {
            var changed = row.id ? Object.keys(changes(row)).length > 0 :
                !blank(row);
            row.tr.classList.toggle('changed', changed && !row.deleted);
            row.tr.classList.toggle('deleted', row.deleted);
            row.head.textContent = row.deleted ? '✕' : !row.id ?
                (changed ? '+' : '*') : changed ? '✔' : '';
            row.head.title = row.deleted ? 'Marked for deletion (Save ' +
                'deletes it; Del again keeps it)' : !row.id ? (changed ?
                'New, not saved' : 'New row') : changed ?
                'Changed, not saved' : 'Select (Del marks it for deletion)';
            if (!row.id && changed && rows[rows.length - 1] === row &&
                    access.create) {
                addRow(null);
            }
        }

        function dirty() {
            return rows.some(function (row) {
                return row.deleted || (row.id ? Object.keys(changes(row))
                    .length : !blank(row));
            });
        }

        function select(row) {
            if (selected && selected.tr) {
                selected.tr.classList.remove('selected');
            }
            selected = row;
            if (row) {
                row.tr.classList.add('selected');
            }
        }

        function toggleDelete(row) {
            if (!row || !access.delete) {
                return;
            }
            if (!row.id) {
                /* A new row: just cleared */
                if (rows[rows.length - 1] !== row) {
                    rows.splice(rows.indexOf(row), 1);
                    row.tr.remove();
                }
                return;
            }
            row.deleted = !row.deleted;
            mark(row);
        }

        function rowOf(tr) {
            return rows.filter(function (r) {
                return r.tr === tr;
            })[0];
        }

        function addRow(record) {
            var row = {id: record ? record.id : null, record: record,
                controls: {}, deleted: false};
            row.head = el('button', {type: 'button', onclick: function () {
                select(row);
                row.head.focus();
            }});
            var cells = columns.map(function (c) {
                var control = UI.fieldControl(Object.assign({}, c, {
                    type: c.scale ? 'float' : c.type}));
                control.field = c;
                row.controls[c.name] = control;
                if (record) {
                    setColumn(row, c, record);
                } else {
                    var d = typeof c.default === 'function' ? c.default() :
                        c.default;
                    d = d === undefined ? null : d;
                    control.set(c.invert ? !d : d);
                }
                return el('td', c.width ? {style: {width: c.width}} : null,
                    control.node);
            });
            row.tr = el('tr' + (record && record.active === false ?
                '.inactive' : ''), {
                onfocusin: function () {
                    select(row);
                },
                oninput: function () {
                    mark(row);
                },
                onchange: function () {
                    mark(row);
                }
            }, el('td.row-head', row.head), cells);
            /* New rows stay last and are never filtered out */
            row.tr.dataset.pinned = row.id ? '' : '1';
            /* A many2one chosen from its list fires no input event */
            columns.forEach(function (c) {
                var control = row.controls[c.name];
                if (control.picker) {
                    control.picker.input.addEventListener('blur', function () {
                        global.setTimeout(function () {
                            mark(row);
                        }, 200);
                    });
                }
            });
            row.original = snapshot(row);
            rows.push(row);
            body.appendChild(row.tr);
            lockRow(row);
            mark(row);
            if (tools && !rendering) {
                tools.applyRow(row.tr);
            }
            return row;
        }

        function lockRow(row) {
            var editable = row.id ? access.write : access.create;
            columns.forEach(function (c) {
                var node = row.controls[c.name].node;
                Array.prototype.forEach.call(node.matches('input, select, ' +
                    'textarea') ? [node] : node.querySelectorAll('input, ' +
                    'select, textarea, button'), function (n) {
                    n.disabled = !editable || Boolean(c.readonly);
                });
            });
        }

        var limit = spec.limit || preferences().browseMaxRows || null;
        var loaded = 0;

        function render(records) {
            rendering = true;
            UI.clear(body);
            rows = [];
            selected = null;
            records.forEach(addRow);
            if (access.create) {
                addRow(null);
            }
            rendering = false;
            loaded = records.length;
            if (tools) {
                tools.apply();
            } else {
                counted(loaded, loaded);
            }
            if (limit && loaded === limit &&
                    preferences().browseMaxRowsWarning) {
                UI.toast('Only the first ' + limit + ' rows are loaded ' +
                    '(File > Preferences > Maximum Browse Records)');
            }
        }

        function counted(shown, total) {
            var more = limit && loaded === limit ? '+' : '';
            count.textContent = (shown === total ? total + more :
                shown + ' of ' + total + more) + (total === 1 && !more ?
                ' row' : ' rows');
        }

        function reload() {
            var context = {};
            if (spec.inactive && showInactive.checked) {
                context.active_test = false;
            }
            var fields = readFields(columns.filter(function (c) {
                return c.name;
            }));
            if (spec.inactive && fields.indexOf('active') < 0) {
                fields.push('active');
            }
            /* Rpc.model adds the user's context: here with active_test */
            return global.Rpc.call('model.' + spec.model + '.search_read', [
                domain(), 0, limit, spec.order || null, fields,
                Object.assign({}, global.Rpc.context(), context)]).then(
                render, UI.showError);
        }

        function refresh() {
            if (!dirty()) {
                return reload();
            }
            return UI.confirm('Refresh', 'Discard the changes not saved?')
                .then(function (ok) {
                    if (ok) {
                        reload();
                    }
                });
        }

        function save() {
            var request = {'delete': [], write: [], create: []};
            var error = null;
            rows.forEach(function (row) {
                if (row.deleted) {
                    request['delete'].push(row.id);
                    return;
                }
                var values = row.id ? changes(row) : blank(row) ? null :
                    Object.assign({}, typeof spec.defaults === 'function' ?
                        spec.defaults() : spec.defaults || {}, snapshot(row));
                if (!values || !Object.keys(values).length) {
                    return;
                }
                if (spec.validate && !error) {
                    error = spec.validate(values, row.id ? Object.assign({},
                        row.record, snapshot(row)) : values);
                    if (error) {
                        select(row);
                        return;
                    }
                }
                if (row.id) {
                    request.write.push([row.id, values]);
                } else {
                    request.create.push(values);
                }
            });
            if (error) {
                UI.modal(spec.title, el('p', error));
                return Promise.resolve();
            }
            if (!request['delete'].length && !request.write.length &&
                    !request.create.length) {
                UI.toast('Nothing to save');
                return Promise.resolve();
            }
            return global.Rpc.desk('common_save_table', [spec.model,
                request]).then(function () {
                    UI.toast(spec.title + ' saved', 'ok');
                    return reload();
                }, UI.showError);
        }

        /* File > Print: the window's list report among the Common
         * reports (nline_js_admin); straight to it when that screen takes
         * the report in its route */
        var canPrint = false;
        function print() {
            var route = 'js-reports/common/' + spec.report;
            var direct = (global.NLINE_ROUTES || []).some(function (r) {
                return r[0].test('#/' + route);
            });
            UI.openScreen(direct ? route : 'js-reports/common',
                'Common Reports');
        }

        function addNew() {
            var last = rows[rows.length - 1];
            focusRow(last && !last.id && blank(last) ? last : addRow(null));
        }

        function menu(event, row, col) {
            var items = [];
            /* Jobshop's Edit Row popup */
            if (access.create) {
                items.push({label: 'Add Row', onclick: addNew});
            }
            if (access.delete && row && row.id) {
                items.push({label: row.deleted ? 'Undelete Row' :
                    'Delete Row', onclick: function () {
                        toggleDelete(row);
                    }});
            }
            if (row && row.id && spec.rowMenu) {
                var extra = spec.rowMenu(row.record, reload);
                if (extra && extra.length) {
                    items.push('-');
                    items = items.concat(extra);
                }
            }
            items.push('-');
            if (access.write || access.create || access.delete) {
                items.push({label: 'Save', onclick: save});
            }
            items.push({label: 'Refresh', onclick: refresh});
            if (canPrint) {
                items.push({label: 'Print', onclick: print});
            }
            items.push('-');
            items = items.concat(tools.menuItems(row ? row.tr : null, col));
            UI.contextMenu(event, items);
        }

        function focusRow(row) {
            var first = columns.filter(function (c) {
                return !c.readonly;
            })[0];
            if (first) {
                var c = row.controls[first.name];
                (c.picker ? c.picker.input : c.node).focus();
            }
            select(row);
        }

        var extra = [{label: 'Save', title: 'Save every change (Ctrl+S)',
            onclick: save}, {label: 'Delete', title: 'Mark the selected ' +
            'row for deletion (Del); Save deletes it', onclick: function () {
                toggleDelete(selected);
            }}, {label: 'Refresh', title: 'Read the table again (F5)',
            onclick: refresh}];
        if (spec.report) {
            extra.push({label: 'Print', title: 'The ' + spec.title +
                ' list report', onclick: print});
        }
        var form = UI.form(main, {title: spec.title, extra: extra});
        var pane = form.body;
        if (spec.help) {
            pane.appendChild(el('p.js-help', spec.help));
        }
        pane.appendChild(el('div.code-filters', filters.map(function (c) {
            return el('label', c.filter.label, c.node);
        }), el('label', el('span', 'Find'), search), spec.inactive ?
            el('label', showInactive, 'Show inactive') : null, count));
        var table = el('table.data.code-table', el('thead', el('tr',
            el('th.row-head', ''), columns.map(function (c) {
                return el('th', {title: c.help || ''}, c.label);
            }))), body);
        pane.appendChild(el('div.table-wrap', table));
        tools = gridTools({table: table, offset: 1, title: spec.title,
            key: spec.key || spec.model, columns: columns,
            pinned: function (tr) {
                return tr.dataset.pinned === '1';
            },
            onchange: counted});
        table.addEventListener('contextmenu', function (event) {
            /* Shift+right-click: the browser's menu (copy, paste) */
            if (event.shiftKey || event.target.closest('thead')) {
                if (!event.shiftKey) {
                    menu(event, null, tools.columnAt(event));
                }
                return;
            }
            var tr = event.target.closest('tr');
            var row = tr ? rowOf(tr) : null;
            if (row) {
                select(row);
            }
            menu(event, row, tools.columnAt(event));
        });

        var timer;
        search.addEventListener('input', function () {
            global.clearTimeout(timer);
            timer = global.setTimeout(reload, 250);
        });
        showInactive.addEventListener('change', reload);

        function onKey(event) {
            if (!body.isConnected) {
                document.removeEventListener('keydown', onKey);
                return;
            }
            if (document.querySelector('.overlay')) {
                return;
            }
            var key = event.key;
            var ctrl = event.ctrlKey || event.metaKey;
            if (ctrl && key.toLowerCase() === 's') {
                event.preventDefault();
                if (access.write || access.create || access.delete) {
                    save();
                }
            } else if (ctrl && key.toLowerCase() === 'b') {
                event.preventDefault();
                tools.filterDialog();
            } else if (key === 'F5') {
                event.preventDefault();
                refresh();
            } else if (key === 'Delete' && selected &&
                    (!isTyping(document.activeElement) || event.ctrlKey)) {
                event.preventDefault();
                toggleDelete(selected);
            } else if (key === 'Insert' && access.create) {
                event.preventDefault();
                addNew();
            }
        }
        document.addEventListener('keydown', onKey);

        /* Closing with changes not saved: Jobshop asks first. A desk
         * screen lives in a Tryton tab whose closing the page never sees
         * (no beforeunload; it would also block navigation): the Tryton
         * tab's close is the integrator's (analysis, Frame) */
        global.NLINE_DIRTY = global.NLINE_DIRTY || [];
        global.NLINE_DIRTY.push(function () {
            return body.isConnected && dirty();
        });

        UI.access([spec.model]).then(function (result) {
            var a = result[spec.model] || {};
            var writes = spec.writes !== false;
            access = {read: a.read !== false,
                write: a.write !== false && writes,
                create: a.create !== false && writes,
                delete: a.delete !== false && writes};
            if (form.allow) {
                form.allow(false, [].concat(access.write || access.create ||
                    access['delete'] ? [] : ['Save'], access['delete'] ? [] :
                    ['Delete'], ['Print']));
            }
            reload();
            if (spec.report) {
                UI.screenAllowed('js-reports/common').then(function (ok) {
                    canPrint = ok;
                    if (ok && form.allow) {
                        form.allow(false, [].concat(access.write ||
                            access.create || access['delete'] ? [] :
                            ['Save'], access['delete'] ? [] : ['Delete']));
                    }
                });
            }
        });
        return {reload: reload, filterValue: filterValue, save: save,
            tools: tools};
    }

    /* ---- The code tables of the Common group bar ---------------------- */

    var REASON_TYPES = [[null, ''], ['inventory', 'Inventory Adjustment'],
        ['labor', 'Labor Entry'], ['calendar', 'Calendar Exception'],
        ['employee', 'Employee Absence']];

    var CODES = {
        /* Jobshop's window title (the group bar says Free On Board Points) */
        fobPoints: {title: 'FOB Points', model: 'nline.fob_point',
            report: 'fob_point_list',
            help: 'The point where the title and the responsibility for ' +
                'a shipment pass to the customer; used by customers, ' +
                'suppliers, quotes, orders, shipping and invoicing.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'}]},
        shipVias: {title: 'Shipping Methods', model: 'nline.ship_via',
            report: 'shipping_method_list',
            help: 'The ways you ship (Overnight, Second Day Air, Customer ' +
                'Pickup, LTL, Best Way): the Ship Via of customers, ' +
                'suppliers, orders, shipping and invoicing.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'}]},
        productCodes: {title: 'Product Codes', model: 'nline.product_code',
            report: 'product_code_list',
            help: 'Codes for the products you make and sell, to group ' +
                'parts, masters and work orders and to sort reports.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'},
                {name: 'markup_percent', label: 'Markup %',
                    type: 'decimal', width: '110px',
                    help: 'Markup on the unit cost to get the unit price'}]},
        commodityCodes: {title: 'Commodity Codes',
            model: 'nline.commodity_code', report: 'commodity_code_list',
            help: 'Codes for the products you buy (or make against buy), ' +
                'for purchasing and the sales analysis.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '220px'},
                {name: 'description', label: 'Description', type: 'char'},
                {name: 'markup_percent', label: 'Markup %',
                    type: 'decimal', width: '110px',
                    help: 'Markup on the unit cost to get the unit price'}]},
        reasonCodes: {title: 'Status Reason Codes', model: 'nline.reason_code',
            report: 'reason_code_list',
            help: 'Status reasons for the transactions out of the ordinary: ' +
                'inventory adjustments, deviated or scrap quantities in ' +
                'labor entry.',
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '160px'},
                {name: 'description', label: 'Reason', type: 'char'},
                {name: 'reason_type', label: 'Type',
                    type: 'selection', width: '190px', default: 'inventory',
                    options: REASON_TYPES}]},
        /* VInventory\ReasonCode: the inventory window's own (ID, Reason) */
        inventoryReasonCodes: {title: 'Status Reason Codes',
            model: 'nline.reason_code', report: 'reason_code_list',
            key: 'nline.reason_code.inventory', inactive: false,
            domain: [['reason_type', '=', 'inventory']],
            defaults: {reason_type: 'inventory'},
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '160px'},
                {name: 'description', label: 'Reason', type: 'char'}]}
    };

    function codeScreen(key, route) {
        return function (main) {
            var spec = CODES[key];
            UI.setTitle(spec.title);
            codeTable(main, Object.assign({order: [['code', 'ASC']],
                inactive: true}, spec));
        };
    }

    Screens.jsFobPoints = codeScreen('fobPoints');
    Screens.jsShipVias = codeScreen('shipVias');
    Screens.jsProductCodes = codeScreen('productCodes');
    Screens.jsCommodityCodes = codeScreen('commodityCodes');
    Screens.jsReasonCodes = codeScreen('reasonCodes');
    Screens.jsInventoryReasonCodes = codeScreen('inventoryReasonCodes');

    /* ---- States/Provinces and Postal Codes ---------------------------- */

    /* The company's country (the filter's first value): the US when the
     * company has no address */
    var countryPrm = null;
    function homeCountry() {
        if (!countryPrm) {
            countryPrm = global.Rpc.searchRead('country.country', [['code',
                '=', 'US']], ['rec_name', 'code'], {limit: 1}).then(
                function (rows) {
                    return rows[0] ? {id: rows[0].id, rec_name:
                        rows[0].rec_name, code: rows[0].code} : null;
                }, function () {
                    return null;
                });
        }
        return countryPrm;
    }

    Screens.jsStates = function (main) {
        UI.setTitle('States/Provinces');
        homeCountry().then(function (country) {
            var table = codeTable(main, {title: 'States/Provinces',
                model: 'country.subdivision', inactive: true,
                report: 'state_province_list',
                order: [['code', 'ASC']],
                help: 'The states and provinces of the addresses of your ' +
                    'company, customers and suppliers (ISO codes: US-TX).',
                filters: [{name: 'country', label: 'Country',
                    model: 'country.country', value: country}],
                columns: [
                    {name: 'code', label: 'ID', type: 'char',
                        width: '140px'},
                    {name: 'name', label: 'Name', type: 'char'},
                    {name: 'country', label: 'Country', type: 'many2one',
                        model: 'country.country', width: '240px',
                        default: function () {
                            return table ? table.filterValue('country') :
                                country;
                        }}]});
        });
    };

    Screens.jsPostalCodes = function (main) {
        UI.setTitle('Postal Codes');
        homeCountry().then(function (country) {
            var table = codeTable(main, {title: 'Postal Codes',
                model: 'country.postal_code', report: 'postal_code_list',
                order: [['postal_code', 'ASC'], ['city', 'ASC']],
                help: 'Postal codes fill in the city and the state when ' +
                    'an address is entered.',
                validate: function (values, record) {
                    var code = (record.postal_code || '').trim();
                    return code.length < 5 ? 'Postal Codes must contain ' +
                        'at least 5 characters (' + (code || 'blank') +
                        ').' : null;
                },
                filters: [{name: 'country', label: 'Country',
                    model: 'country.country', value: country}],
                columns: [
                    {name: 'postal_code', label: 'Postal Code',
                        type: 'char', width: '140px'},
                    {name: 'city', label: 'City', type: 'char'},
                    {name: 'subdivision', label: 'State', type: 'many2one',
                        model: 'country.subdivision', width: '220px',
                        domain: country ? [['country', '=', country.id]] :
                            []},
                    {name: 'country', label: 'Country', type: 'many2one',
                        model: 'country.country', width: '220px',
                        default: function () {
                            return table ? table.filterValue('country') :
                                country;
                        }}]});
        });
    };

    /* ---- Terms --------------------------------------------------------- */

    /* Jobshop's terms_type, in its order and words */
    var AGE_TYPES = [[null, ''], ['age', 'Age in days'],
        ['day_next_month', 'Day of next month'],
        ['cod', 'Collect on delivery'], ['eom', 'End of this month']];

    /* Jobshop's rules for the days: zero on delivery, a day of the month
     * (1 to 31) for the next month / end of month */
    function termsValidate(values, record) {
        var error = null;
        [['net_type', 'net_days', 'Invoice Aging Days'], ['discount_type',
            'early_discount_days', 'Disc Aging Days']].forEach(function (r) {
            var type = record[r[0]], days = record[r[1]];
            if (type === 'cod' && days) {
                values[r[1]] = 0;
            } else if ((type === 'day_next_month') && days !== null &&
                    days !== undefined && (days < 1 || days > 31) && !error) {
                error = r[2] + ' of "' + (record.name || '') + '" is the ' +
                    'day of the month: 1 to 31.';
            } else if (days < 0 && !error) {
                error = r[2] + ' cannot be negative.';
            }
        });
        return error;
    }

    /* Takes over the Terms screen of company.js (same route): the payment
     * terms with Jobshop's columns; Due dates (right-click) still opens the
     * Tryton form of a term with several due dates */
    Screens.terms = function (main) {
        UI.setTitle('Terms');
        codeTable(main, {title: 'Terms',
            model: 'account.invoice.payment_term', inactive: true,
            report: 'terms_list',
            order: [['name', 'ASC']],
            validate: termsValidate,
            help: 'Conditions of payment of customers, suppliers, orders ' +
                'and invoices. A term with one due date follows its age ' +
                'type and days; right-click > Due dates for split payments.',
            columns: [
                {name: 'name', label: 'ID', type: 'char', width: '200px'},
                {name: 'net_type', label: 'Invoice Age Type',
                    type: 'selection', options: AGE_TYPES, default: 'age',
                    width: '160px'},
                {name: 'net_days', label: 'Invoice Aging Days',
                    type: 'integer', width: '90px'},
                {name: 'discount_type', label: 'Discount Age Type',
                    type: 'selection', options: AGE_TYPES, default: 'age',
                    width: '160px'},
                {name: 'early_discount_days', label: 'Disc Aging Days',
                    type: 'integer', width: '90px'},
                {name: 'early_discount_rate', label: 'Discount %',
                    type: 'decimal', scale: 100, width: '90px'},
                {name: 'description', label: 'Terms Description',
                    type: 'char'}],
            rowMenu: function (record) {
                return [{label: 'Due dates…', onclick: function () {
                    UI.openRecord('account.invoice.payment_term', record.id,
                        record.name);
                }}];
            }});
    };

    /* ---- Currency Codes ------------------------------------------------ */

    Screens.jsCurrencyCodes = function (main) {
        UI.setTitle('Currency Codes');
        codeTable(main, {title: 'Currency Codes', model: 'currency.currency',
            report: 'currency_code_list',
            inactive: true, order: [['code', 'ASC']],
            help: 'The currencies of the quotes, orders, invoices and ' +
                'purchase orders of foreign customers and suppliers. ' +
                'Exchange Rate: the units of the currency for one unit of ' +
                'the company currency (changing it adds today\'s rate).',
            defaults: {rounding: global.Rpc.decimal('0.01'), digits: 2},
            columns: [
                {name: 'code', label: 'ID', type: 'char', width: '80px'},
                {name: 'name', label: 'Name', type: 'char'},
                {name: 'symbol', label: 'Currency Symbol', type: 'char',
                    width: '90px'},
                {name: 'thousands_separator', label: 'Thousands Separator',
                    type: 'char', width: '90px', default: ','},
                {name: 'decimal_separator', label: 'Decimal Separator',
                    type: 'char', width: '90px', default: '.'},
                {name: 'exchange_rate', label: 'Exchange Rate',
                    type: 'decimal', width: '130px'}],
            rowMenu: function (record) {
                return [{label: 'Rate history…', onclick: function () {
                    UI.openRecord('currency.currency', record.id,
                        record.name);
                }}];
            }});
    };

    /* ---- Alert Messages ------------------------------------------------ */

    var ALERT_TYPES = [['so', 'Sales Order'], ['po', 'Purchase Order'],
        ['wo', 'Work Order'], ['qt', 'Quote'], ['cus', 'Customer'],
        ['shp', 'Shipper'], ['inv', 'Invoice'], ['sup', 'Supplier'],
        ['rfq', 'Request For Quote'], ['rec', 'Receiver'],
        ['em', 'Engineering Master'], ['ip', 'Inventory Part']];
    var ALERT_CHANGES = [['late', 'Item is Late'],
        ['hold', 'Released Status Changed to Hold'],
        ['cancelled', 'Released Status Changed to Cancelled'],
        ['released', 'UnReleased Status Changed to Released'],
        ['lab_hrs', 'Labor Hours Exceeds Estimate'],
        ['lab_cost', 'Labor Cost Exceeds Estimate'],
        ['mat_cost', 'Material Cost Exceeds Estimate'],
        ['deviated_qty', 'Deviated Quantity Reported'],
        ['note', 'Note Added (user option)'],
        ['unapproved', 'Status Changed to Waiting Approval'],
        ['wo_sched_late', 'Work Order Scheduled to Finish Late'],
        ['out_ser_beg', 'Outside Service Scheduled Start is Late'],
        ['out_ser_fin', 'Outside Service Scheduled Finish is Late'],
        ['promised', 'Open Quote Reached Promised Date'],
        ['followup', 'Open Quote Reached Follow Up Date'],
        ['expired', 'Open Quote has Expired'],
        ['expected_win', 'Open Quote Reached Expected Win Date'],
        ['credit_status', 'Credit Status Changed'],
        ['credit_limit', 'Order Limit Changed'],
        ['status_change', 'Status Changed'],
        ['line_status', 'Line Status Changed (Firm or Released Order)'],
        ['line_deleted', 'Line Deleted (Firm or Released Order)'],
        ['order_qty', 'Order Quantity Changed (Firm or Released Order)'],
        ['desired_ship', 'Desired Ship Date Changed (Firm or Released ' +
            'Order)'],
        ['shipped', 'Sales Order Shipped'],
        ['shipper_ret', 'Sales Order Returned'],
        ['invoiced', 'Shipment was Invoiced'],
        ['printed', 'Document was Printed'],
        ['received', 'Purchase Order Received'],
        ['receiver_ret', 'Purchase Order Returned'],
        ['desired_recv', 'Desired Receive On Date Changed (Firm or ' +
            'Released Order)'],
        ['desired_want', 'Desired Want Date Changed (Firm or Released ' +
            'Order)'],
        ['desired_rls', 'Desired Release Date Changed (Firm or Released ' +
            'Order)'],
        ['em_rev_change', 'Engineering Master Revision Changed'],
        ['cost_change', 'Cost Changed'],
        ['price_change', 'Price Changed'],
        ['prim_loc_change', 'Primary Location Changed'],
        ['new_em_created', 'New Engineering Master Created'],
        ['has_changed', 'Document has Changed']];

    /* VShared\UserMessages: Archived (check it to mark the message read),
     * Created On, Message; Show All; right-click Show Details, Open the
     * document, Delete; the Document column is the ERP's (the link) */
    function messagesTab(pane) {
        var showAll = el('input', {type: 'checkbox',
            'aria-label': 'Show All'});
        var body = el('tbody');
        var canDelete = false;
        UI.access(['nline.alert_message']).then(function (result) {
            canDelete = (result['nline.alert_message'] || {})['delete'] !==
                false;
        });

        function load() {
            return global.Rpc.desk('common_alerts', [showAll.checked,
                500]).then(function (rows) {
                    UI.clear(body);
                    rows.forEach(function (m) {
                        var box = el('input', {type: 'checkbox', checked:
                            !!m.archived, 'aria-label': 'Archived'});
                        box.addEventListener('change', function () {
                            archive([m.id], box.checked);
                        });
                        body.appendChild(el('tr' + (m.archived ? '' :
                            '.unread'), {title: [m.type_string,
                                m.change_string, m.subject].filter(Boolean)
                                .join(' · '),
                            oncontextmenu: function (event) {
                                if (!event.shiftKey) {
                                    messageMenu(event, m);
                                }
                            }, ondblclick: function () {
                                open(m);
                            }}, el('td', box),
                            el('td.num', m.date ? String(m.date)
                                .slice(0, 16) : ''),
                            el('td', m.message || m.subject || ''),
                            el('td', m.document ? el('a', {href: '#',
                                onclick: function (event) {
                                    event.preventDefault();
                                    open(m);
                                }}, m.document[2]) : '')));
                    });
                    if (!rows.length) {
                        body.appendChild(el('tr', {dataset: {pinned: '1'}},
                            el('td', {colspan: 4},
                            showAll.checked ? 'No messages.' :
                            'No unread messages.')));
                    }
                    if (tools) {
                        tools.apply();
                    }
                }, UI.showError);
        }

        function open(m) {
            if (m.document) {
                UI.openRecord(m.document[0], m.document[1], m.document[2]);
            } else {
                details(m);
            }
        }

        function archive(ids, archived) {
            global.Rpc.desk('common_archive_alerts', [ids, archived]).then(
                load, UI.showError);
        }

        /* Show Details…: every field of the message */
        function details(m) {
            function row(label, value) {
                return el('div.row', el('span.muted', label),
                    el('span', value || ''));
            }
            UI.modal('Alert Message', el('div.js-dialog', [
                row('Created On', m.date ? String(m.date).slice(0, 16) : ''),
                row('What', m.type_string), row('When', m.change_string),
                row('How', m.action_string || ''),
                row('To', m.recipient || ''), row('Subject', m.subject),
                row('Message', m.message),
                row('Document', m.document ? m.document[2] : ''),
                row('Archived', m.archived ? 'Yes' : 'No')]));
        }

        function remove(m) {
            UI.confirm('Delete', 'Delete this message?').then(function (ok) {
                if (ok) {
                    global.Rpc.model('nline.alert_message', 'delete', [[m.id]])
                        .then(load, UI.showError);
                }
            });
        }

        function messageMenu(event, m) {
            var items = [{label: 'Show Details…', onclick: function () {
                details(m);
            }}];
            if (m.document) {
                items.push({label: 'Open ' + m.type_string + '…', onclick:
                    function () {
                        open(m);
                    }});
            }
            items.push('-', {label: m.archived ? 'Mark Unread' :
                'Mark Read (Archived)', onclick: function () {
                    archive([m.id], !m.archived);
                }});
            if (canDelete) {
                items.push({label: 'Delete', onclick: function () {
                    remove(m);
                }});
            }
            items.push('-', {label: 'Refresh', onclick: refresh}, '-');
            var tr = event.target.closest('tr');
            UI.contextMenu(event, items.concat(tools.menuItems(tr,
                tools.columnAt(event))));
        }

        function refresh() {
            global.Rpc.desk('common_refresh_alerts', []).then(function (n) {
                if (n) {
                    UI.toast(n + ' new alert message' + (n === 1 ? '' :
                        's'), 'ok');
                }
                load();
            }, function () {
                load();
            });
        }

        showAll.addEventListener('change', load);
        pane.appendChild(el('div.code-filters',
            el('label', showAll, 'Show All'),
            el('button', {type: 'button', title: 'Raise the alerts now ' +
                'and read the messages again (F5)', onclick: refresh},
                'Refresh')));
        var table = el('table.data.alert-list', el('thead', el('tr',
            ['Archived', 'Created On', 'Message', 'Document'].map(
                function (h) {
                    return el('th', h);
                }))), body);
        pane.appendChild(el('div.table-wrap', table));
        var tools = gridTools({table: table, key: 'nline.alert_message',
            title: 'User Messages', pinned: function (tr) {
                return tr.dataset.pinned === '1';
            }, columns: [{label: 'Archived'},
                {label: 'Created On'}, {label: 'Message'},
                {label: 'Document'}]});
        refresh();
        return {load: load, refresh: refresh};
    }

    /* File > Alert Messages: Jobshop's User Messages and User Alerts */
    Screens.jsAlertMessages = function (main) {
        style();
        UI.setTitle('Alert Messages');
        var session = global.Rpc.session() || {};
        var me = session.user ? {id: session.user, rec_name: session.name ||
            session.login || ''} : null;
        var tabBar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        var tabs = [];

        function show(index) {
            tabs.forEach(function (t, i) {
                t.button.classList.toggle('active', i === index);
                t.button.setAttribute('aria-selected', i === index);
                t.pane.hidden = i !== index;
            });
            if (tabs[index].open) {
                tabs[index].open();
                tabs[index].open = null;
            }
        }

        function tab(title, open) {
            var t = {pane: el('div.tab-pane.panel', {role: 'tabpanel'}),
                open: open};
            t.button = el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(tabs.indexOf(t));
                }}, title);
            tabs.push(t);
            tabBar.appendChild(t.button);
            panes.appendChild(t.pane);
            return t;
        }

        main.appendChild(el('div.ribbon', el('span.ribbon-title',
            'Alert Messages')));
        main.appendChild(el('p.js-help', 'Messages from the alerts you ' +
            'set: the ERP raises "Item is Late" for sales, purchase and ' +
            'work orders every morning (Refresh raises them now). Check ' +
            'Archived when you have read one.'));
        main.appendChild(tabBar);
        main.appendChild(panes);
        var messages = tab('Messages', function () {
            messagesTab(messages.pane);
        });
        /* VShared\UserAlerts: What, When, How, From, To, Subject */
        var alerts = tab('Alerts', function () {
            UI.access(['res.user']).then(function (result) {
                var admin = (result['res.user'] || {}).write === true;
                function owner() {
                    var user = admin && table ? table.filterValue('user') :
                        null;
                    return user || me;
                }
                var table = codeTable(alerts.pane, {title: 'User Alerts',
                    model: 'nline.user_alert',
                    order: [['alert_type', 'ASC'], ['alert_change', 'ASC']],
                    help: 'What to tell you about, when and how. Manual: a ' +
                        'message here; Email: to the recipients too.',
                    domain: admin ? [] : me ? [['user', '=', me.id]] : [],
                    filters: admin ? [{name: 'user', label: 'User',
                        model: 'res.user', value: me}] : [],
                    defaults: function () {
                        var user = owner();
                        return user && admin ? {user: user.id} : {};
                    },
                    columns: [
                        {name: 'alert_type', label: 'What',
                            type: 'selection', options: ALERT_TYPES,
                            width: '170px', help: 'Alert Type: the item ' +
                                'to watch'},
                        {name: 'alert_change', label: 'When',
                            type: 'selection', options: ALERT_CHANGES,
                            default: 'late', width: '300px',
                            help: 'Alert Change: what triggers the message'},
                        {name: 'alert_action', label: 'How',
                            type: 'selection', options: [['manual',
                                'Manual'], ['email', 'Email']],
                            default: 'manual', width: '110px',
                            help: 'Alert Action'},
                        {name: 'user', label: 'From', type: 'many2one',
                            model: 'res.user', readonly: true,
                            width: '160px', default: owner,
                            help: 'The user the alert belongs to'},
                        {name: 'recipient', label: 'To', type: 'char',
                            help: 'Recipient: the email addresses (;)'},
                        {name: 'subject', label: 'Subject', type: 'char'},
                        {name: 'generated', label: 'Raised by the ERP',
                            type: 'boolean', readonly: true,
                            width: '80px'}]});
                /* The grid's ribbon sits inside the tab: no second title */
                var ribbon = alerts.pane.querySelector('.ribbon-title');
                if (ribbon) {
                    ribbon.textContent = '';
                }
            });
        });
        show(0);
    };

    /* For Home (the integrator's call): the user's unread alert messages,
     * newest first, in a container; resolves to their number. Nothing is
     * drawn when there are none. */
    function alertsPanel(container, limit) {
        style();
        return global.Rpc.desk('common_alerts', [false, limit || 8]).then(
            function (rows) {
                UI.clear(container);
                if (!rows.length) {
                    return 0;
                }
                container.appendChild(el('h3', 'Alert Messages'));
                container.appendChild(el('ul.alerts-home', rows.map(
                    function (m) {
                        return el('li', el('a', {href: '#', onclick:
                            function (event) {
                                event.preventDefault();
                                if (m.document) {
                                    UI.openRecord(m.document[0],
                                        m.document[1], m.document[2]);
                                } else {
                                    UI.openScreen('alert-messages',
                                        'Alert Messages');
                                }
                            }}, m.message || m.subject || m.change_string),
                            el('span.muted', ' ' + (m.date ? String(m.date)
                                .slice(0, 10) : '')));
                    })));
                container.appendChild(el('a', {href: '#', onclick: function (
                    event) {
                    event.preventDefault();
                    UI.openScreen('alert-messages', 'Alert Messages');
                }}, 'All alert messages'));
                return rows.length;
            }, function () {
                /* Without nline_js_common: no panel */
                UI.clear(container);
                return 0;
            });
    }

    function unreadAlerts() {
        return global.Rpc.desk('common_alert_count', []).catch(function () {
            return 0;
        });
    }

    /* ---- User Control Panel ------------------------------------------- */

    Screens.jsControlPanel = function (main) {
        style();
        UI.setTitle('User Control Panel');
        main.appendChild(el('div.ribbon', el('span.ribbon-title',
            'User Control Panel')));
        var grid = el('div.cp-grid');
        main.appendChild(grid);

        /* Change Password: N-Line BI's, never the ERP's */
        /* Back to the ERP (the Tryton client around the desk) afterwards */
        var here = '/';
        try {
            here = global.top.location.pathname + global.top.location.hash;
        } catch (e) {
            here = global.location.pathname + global.location.hash;
        }
        var password = el('section.panel', el('h2', 'Change Password'),
            el('p', 'You sign in to the ERP through N-Line BI: your ' +
                'password is your N-Line BI password and is changed there. ' +
                'The ERP keeps no password.'));
        if (global.Rpc.behindNlbi) {
            password.appendChild(el('p', el('a.button', {href:
                '/server/login?change=1&next=' + encodeURIComponent(here),
                target: '_top'}, 'Change your N-Line BI password…')));
        } else {
            password.appendChild(el('p.muted', 'Open the ERP from N-Line BI ' +
                '(its name menu > Change password…) to change it.'));
        }
        grid.appendChild(password);

        /* Preferences: what the user may change in Tryton */
        var prefs = el('section.panel', el('h2', 'Preferences'),
            el('p.muted', 'Loading…'));
        grid.appendChild(prefs);

        /* File > Preferences: Jobshop's program preferences */
        grid.appendChild(el('section.panel', el('h2', 'Program Preferences'),
            el('p', 'Add On the Fly, the alert messages check, the Browse ' +
                'limits, the confirmations, the card colors and the pack ' +
                'list / receiver printing: Jobshop\'s File > Preferences, ' +
                'kept on this computer.'),
            el('p', el('button', {type: 'button', onclick: function () {
                UI.openScreen('preferences', 'Preferences');
            }}, 'Preferences…'))));

        /* Printer setup: the browser's print dialog */
        grid.appendChild(el('section.panel', el('h2', 'Printer Setup'),
            el('p', 'Reports open as PDF in the browser. Print them with ' +
                'Ctrl+P (or the PDF viewer\'s printer button): choose the ' +
                'printer, the paper and the copies there. The printer ' +
                'settings are the computer\'s (Windows Settings > Printers).'),
            el('p', el('button', {type: 'button', onclick: function () {
                global.print();
            }}, 'Print Setup…'))));

        function select(options, value, blankLabel) {
            var node = el('select', [el('option', {value: ''},
                blankLabel || '')].concat(options.map(function (o) {
                    return el('option', {value: String(o[0])}, o[1]);
                })));
            node.value = value === null || value === undefined ? '' :
                String(value);
            return node;
        }

        function render(p) {
            UI.clear(prefs);
            prefs.appendChild(el('h2', 'Preferences'));
            var controls = {};
            var fields = [];
            function row(label, node, help) {
                fields.push(el('div', el('label.field', label), node,
                    help ? el('div.muted', help) : null));
            }
            row('Name', el('input', {type: 'text', value: p.name || '',
                readonly: true, 'aria-label': 'Name'}),
                'Your name and login come from N-Line BI.');
            row('Login', el('input', {type: 'text', value: p.login || '',
                readonly: true, 'aria-label': 'Login'}));
            controls.language = select(p.languages || [], p.language);
            row('Language', controls.language);
            controls.email = el('input', {type: 'text', value: p.email || '',
                'aria-label': 'Email'});
            row('Email', controls.email, 'Where the email alerts go.');
            controls.signature = el('textarea', {rows: 3,
                'aria-label': 'Signature'});
            controls.signature.value = p.signature || '';
            row('Signature', controls.signature);
            if (p.companies && p.companies.length > 1) {
                controls.company = select(p.companies, p.company ?
                    p.company[0] : null);
                row('Company', controls.company);
            }
            if (p.employees && p.employees.length) {
                controls.employee = select(p.employees, p.employee ?
                    p.employee[0] : null, '(none)');
                row('Employee', controls.employee, 'Who you are on labor ' +
                    'tickets and documents.');
            }
            if (p.warehouses && p.warehouses.length > 1) {
                controls.warehouse = select(p.warehouses, p.warehouse ?
                    p.warehouse[0] : null, '(none)');
                row('Warehouse', controls.warehouse);
            }
            prefs.appendChild(el('div.grid-form', fields));
            prefs.appendChild(el('div.toolbar', el('button.primary', {
                type: 'button', onclick: function () {
                    var values = {
                        language: controls.language.value || null,
                        email: controls.email.value || null,
                        signature: controls.signature.value || null
                    };
                    ['company', 'employee', 'warehouse'].forEach(
                        function (name) {
                            if (controls[name]) {
                                values[name] = controls[name].value ?
                                    parseInt(controls[name].value, 10) :
                                    null;
                            }
                        });
                    global.Rpc.desk('common_set_preferences', [values]).then(
                        function (saved) {
                            /* The screens' context follows at once; the
                             * other tabs on their next opening */
                            var session = global.Rpc.session();
                            if (session && session.context) {
                                session.context.language = saved.language;
                                ['company', 'employee', 'warehouse']
                                    .forEach(function (name) {
                                        if (saved[name] !== undefined) {
                                            session.context[name] =
                                                saved[name] ?
                                                saved[name][0] : null;
                                        }
                                    });
                            }
                            UI.toast('Preferences saved', 'ok');
                            render(saved);
                        }, UI.showError);
                }}, 'Save')));
        }

        global.Rpc.desk('common_preferences', []).then(render, function (e) {
            UI.clear(prefs).appendChild(el('h2', 'Preferences'));
            UI.showError(e);
        });
    };

    /* ---- File > Preferences: the Program Preferences window ------------ */

    /* Vmfg\Preferences, every control in Jobshop's places (leaving out
     * the desktop-only ones left empty gaps). Kept on this computer as
     * Jobshop's own were; JobshopCommon.preferences() gives them to the
     * screens that use them. The desktop-only ones (Save Settings / Current
     * Group on Exit, Navigator Menu Icons, Tips, the file paths, the status
     * bar and navigation bar sizing) are kept too; their tooltip says what
     * the browser does instead. */
    Screens.jsPreferences = function (main) {
        style();
        UI.setTitle('Preferences');
        var prefs = preferences();
        var controls = {};

        /* The bare control of a preference (placed by UI.placedForm) */
        function control(f) {
            var input;
            if (f.type === 'note') {
                /* Jobshop's read-only caption (type4, no value) */
                return {node: el('span.js-note', f.text)};
            }
            if (f.type === 'char') {
                input = el('input', {type: 'text', value: f.readonly ?
                    f.text : prefs[f.name] || '', readOnly: !!f.readonly,
                    maxLength: 64, 'aria-label': f.label});
                if (!f.readonly) {
                    controls[f.name] = {get: function () {
                        return input.value.trim();
                    }, set: function (v) {
                        input.value = v || '';
                    }};
                }
                return {node: input};
            }
            if (f.type === 'boolean') {
                input = el('input', {type: 'checkbox', checked:
                    !!prefs[f.name], 'aria-label': f.label});
                controls[f.name] = {get: function () {
                    return input.checked;
                }, set: function (v) {
                    input.checked = !!v;
                }};
            } else if (f.type === 'color') {
                input = el('input', {type: 'color', value: prefs[f.name],
                    'aria-label': f.label});
                controls[f.name] = {get: function () {
                    return input.value;
                }, set: function (v) {
                    input.value = v;
                }};
            } else {
                input = el('input', {type: 'number', min: 0, value:
                    prefs[f.name], 'aria-label': f.label});
                controls[f.name] = {get: function () {
                    var n = parseInt(input.value, 10);
                    return isNaN(n) || n < 0 ? PREF_DEFAULTS[f.name] : n;
                }, set: function (v) {
                    input.value = v;
                }};
            }
            return {node: input};
        }
        function b(name, label, at, help) {
            return {name: name, label: label, type: 'boolean', at: at,
                help: help};
        }
        var BROWSER = ' (a desktop setting of Jobshop\'s, kept here; ';
        function n(name, label, at, split, help) {
            return {name: name, label: label, type: 'integer', at: at,
                split: split, help: help};
        }
        function c(name, label, y) {
            return {name: name, label: label, type: 'color', at: [23, y, 182,
                y + 20], split: 114};
        }

        /* Vmfg\Preferences.txt, every control */
        var tabs = [
            {title: 'General', frames: [{label: 'Browse', at: [8, 200, 562,
                305]}, {label: 'Confirmation', at: [8, 307, 562, 380]},
                {label: 'File Paths', at: [8, 383, 562, 462]}],
                fields: [
                    b('saveSettingsOnExit', 'Save Settings on Exit',
                        [22, 5, 279, 25], 'Save Settings on Exit' + BROWSER +
                        'the browser keeps grid layouts as you change them)'),
                    b('saveCurrentGroup', 'Save Current Group on Exit',
                        [22, 26, 279, 46], 'Save Current Group on Exit' +
                        BROWSER + 'the desk remembers the area you used)'),
                    b('showHomeAtStartup', 'Show Home Page at Startup',
                        [22, 47, 279, 67]),
                    b('showNavigatorIcons', 'Show Navigator Menu Icons',
                        [22, 68, 279, 88], 'Show Navigator Menu Icons' +
                        BROWSER + 'the desk menus show their own icons)'),
                    b('showTips', 'Show Tips at Startup', [22, 89, 279, 109],
                        'Show Tips at Startup' + BROWSER + 'the desk has ' +
                        'tooltips instead of startup tips)'),
                    b('addOnFly', 'Add On the Fly', [22, 110, 279, 130]),
                    b('showAlertsAtStartup',
                        'Show User Alert Messages at Startup',
                        [22, 131, 279, 151]),
                    b('checkAlerts', 'Check for User Alert Messages',
                        [22, 152, 279, 172]),
                    n('checkAlertsMinutes', 'Interval in Minutes',
                        [47, 174, 213, 194], 110),
                    b('loadAvailToPromise',
                        'Load \'Available to Promise\' in Sales Orders',
                        [288, 5, 545, 25]),
                    b('loadProjectedAvailable',
                        'Load \'Projected Available\' in Supply and Demand',
                        [288, 26, 545, 46]),
                    b('autoBrowse', 'Auto Browse', [23, 222, 135, 242]),
                    n('autoBrowseMinChars',
                        'Minimum Characters Before Auto Browse',
                        [298, 222, 549, 242], 200),
                    b('autoRefreshBrowse',
                        'Auto Refresh Browse After Save or Delete',
                        [23, 244, 273, 264]),
                    n('browseMaxRows', 'Maximum Browse Records to Load',
                        [23, 266, 291, 286], 200,
                        '(Enter a \'0\' to load all rows)'),
                    {type: 'note', text: '(Enter a \'0\' to load all rows)',
                        at: [36, 286, 233, 301], split: 0},
                    b('browseMaxRowsWarning',
                        'Show Max Browse Records Warning',
                        [298, 266, 537, 286]),
                    b('confirmExit', 'Confirm Exit', [23, 332, 267, 352]),
                    b('confirmPrint', 'Confirm Forms Printed Successfully',
                        [23, 356, 280, 376]),
                    b('confirmSchedulingExit', 'Confirm Exit of Scheduling',
                        [275, 332, 532, 352]),
                    {name: 'iniPath', label: 'Initialization File Path',
                        type: 'char', readonly: true, at: [23, 408, 546, 428],
                        split: 153, text: 'This browser\'s storage on this ' +
                        'computer', help: 'Jobshop kept these settings in ' +
                        'an .ini file; the browser keeps them itself'},
                    {name: 'customReportPath', label: 'Custom Report Path',
                        type: 'char', at: [23, 432, 546, 452], split: 153,
                        help: 'Custom Report Path' + BROWSER + 'the ' +
                        'reports come from the server)'}]},
            {title: 'Toolbar', fields: [
                b('showTooltips', 'Show Tool Tips', [23, 11, 280, 31]),
                b('showShortcuts', 'Show Shortcuts in Tool Tips',
                    [48, 35, 305, 55]),
                b('showToolsInStatusBar',
                    'Show Tool Description in Status Bar', [23, 60, 280, 80],
                    'Show Tool Description in Status Bar' + BROWSER +
                    'the tool tip shows the description)'),
                b('resizeNavBar',
                    'Resize Navigation Bar as Main Window is Resized',
                    [23, 156, 350, 176], 'Resize Navigation Bar' + BROWSER +
                    'the desk\'s menu bar fits the window itself)'),
                n('navGrowthPercent', 'Growth Percentage', [48, 180, 248,
                    200], 139)]},
            {title: 'Card Colors', fields: [
                c('cardMaterial', 'Material Card', 11),
                c('cardToolFixture', 'Tool/Fixture Card', 38),
                c('cardPhantom', 'Phantom Card', 67),
                c('cardOperation', 'Operation Card', 96),
                c('cardService', 'Outside Service Card', 125)],
                buttons: [{label: 'Reset Defaults', at: [43, 163, 181, 192],
                    onclick: function () {
                        Object.keys(CARD_DEFAULTS).forEach(function (k) {
                            controls[k].set(CARD_DEFAULTS[k]);
                        });
                    }}]},
            {title: 'Shipping', fields: [
                b('askPrintPackList', 'Ask to Print / Preview Pack List',
                    [23, 11, 280, 31]),
                b('previewPackList', 'Preview Pack List', [23, 35, 280, 55]),
                b('printPackList', 'Print Pack List', [23, 60, 280, 80])]},
            {title: 'Receiving', fields: [
                b('askPrintReceiver', 'Ask to Print / Preview Receiver',
                    [23, 11, 280, 31]),
                b('previewReceiver', 'Preview Receiver', [23, 35, 280, 55]),
                b('printReceiver', 'Print Receiver', [23, 60, 280, 80])]}
        ];

        function save() {
            var values = {};
            Object.keys(controls).forEach(function (k) {
                values[k] = controls[k].get();
            });
            stored(PREF_KEY, values);
            UI.toast('Preferences saved on this computer', 'ok');
        }

        var form = UI.form(main, {title: 'Preferences', extra: [
            {label: 'Save', title: 'Keep these preferences on this ' +
                'computer (Ctrl+S)', onclick: save},
            {label: 'Cancel', title: 'Back to the saved preferences',
                onclick: function () {
                    var saved = preferences();
                    Object.keys(controls).forEach(function (k) {
                        controls[k].set(saved[k]);
                    });
                }}]});
        var bar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes.js-prefs');
        tabs.forEach(function (t, i) {
            var pane = el('div.tab-pane.panel', {role: 'tabpanel',
                hidden: i > 0});
            if (UI.placedForm) {
                pane.appendChild(UI.placedForm(t, control));
            } else {
                /* An older frame: one field per line */
                t.fields.forEach(function (f) {
                    pane.appendChild(el('label.check', control(f).node, ' ' +
                        f.label));
                });
                (t.buttons || []).forEach(function (bt) {
                    pane.appendChild(el('button', {type: 'button', onclick:
                        bt.onclick}, bt.label));
                });
            }
            var button = el('button.tab' + (i ? '' : '.active'), {type:
                'button', role: 'tab', onclick: function () {
                    Array.prototype.forEach.call(bar.children, function (x) {
                        x.classList.toggle('active', x === button);
                    });
                    Array.prototype.forEach.call(panes.children, function (p) {
                        p.hidden = p !== pane;
                    });
                }}, t.title);
            bar.appendChild(button);
            panes.appendChild(pane);
        });
        form.body.appendChild(el('p.js-help', 'Kept on this computer, as ' +
            'Jobshop kept them. Your language, email and employee are in ' +
            'the User Control Panel.'));
        form.body.appendChild(bar);
        form.body.appendChild(panes);
        document.addEventListener('keydown', function onKey(event) {
            if (!panes.isConnected) {
                document.removeEventListener('keydown', onKey);
                return;
            }
            if ((event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === 's') {
                event.preventDefault();
                save();
            }
        });
    };

    /* ---- Add On the Fly: postal codes and states ----------------------- */

    function countryOf(id) {
        if (!id) {
            return homeCountry();
        }
        return global.Rpc.searchRead('country.country', [['id', '=', id]],
            ['rec_name', 'code'], {limit: 1}).then(function (rows) {
                return rows[0] ? {id: rows[0].id, rec_name: rows[0].rec_name,
                    code: rows[0].code} : null;
            });
    }

    function mayCreate(model) {
        return UI.access([model]).then(function (result) {
            return (result[model] || {}).create !== false;
        }, function () {
            return false;
        });
    }

    /* Vmfg\AddStateProvince: "State or Province doesn't exist. Add now?"
     * ({code, name, country: id}) -> Promise of {id, rec_name} | null.
     * The ID becomes the ISO code with the country's (TX -> US-TX). */
    function addStateProvince(values) {
        values = values || {};
        return Promise.all([countryOf(values.country),
            mayCreate('country.subdivision')]).then(function (r) {
                var country = r[0];
                if (!r[1] || !country || !preferences().addOnFly) {
                    return null;
                }
                return new Promise(function (resolve) {
                    var id = el('input', {type: 'text', maxlength: 10,
                        value: values.code || '', 'aria-label': 'ID'});
                    var name = el('input', {type: 'text', maxlength: 50,
                        value: values.name || '', 'aria-label': 'Name'});
                    UI.modal('Add State/Province', el('div.js-dialog',
                        el('p', 'State or Province doesn\'t exist. Add now?'),
                        el('div.row', el('label', 'ID'), id),
                        el('div.row', el('label', 'Name'), name),
                        el('p.muted', 'Country: ' + country.rec_name)), [
                        {label: 'No', onclick: function () {
                            resolve(null);
                        }},
                        {label: 'Yes', primary: true, onclick: function () {
                            var code = id.value.trim().toUpperCase();
                            if (!code || !name.value.trim()) {
                                return true;
                            }
                            if (country.code && code.indexOf('-') < 0) {
                                code = country.code + '-' + code;
                            }
                            global.Rpc.model('country.subdivision', 'create',
                                [[{country: country.id, code: code, name:
                                    name.value.trim()}]]).then(function (ids) {
                                    resolve({id: ids[0], rec_name:
                                        name.value.trim()});
                                }, function (e) {
                                    UI.showError(e);
                                    resolve(null);
                                });
                        }}]);
                });
            });
    }

    /* The address's postal code (Jobshop's Add On the Fly): ({postal_code,
     * country: id}) -> Promise of {postal_code, city, subdivision: {id,
     * rec_name} | null, country: {id, rec_name}} when known or added (Vmfg\
     * AddPostalCode: "Postal Code Not Found. Add Now?"), null otherwise.
     * For the address forms of customers, suppliers and the company. */
    function checkPostalCode(values) {
        values = values || {};
        var code = (values.postal_code || '').trim();
        if (!code) {
            return Promise.resolve(null);
        }
        var domain = [['postal_code', '=', code]];
        if (values.country) {
            domain.push(['country', '=', values.country]);
        }
        function result(r) {
            return {postal_code: r.postal_code, city: r.city,
                subdivision: m2o(r, 'subdivision'), country: m2o(r,
                    'country')};
        }
        return global.Rpc.searchRead('country.postal_code', domain,
            ['postal_code', 'city', 'subdivision', 'subdivision.rec_name',
                'country', 'country.rec_name'], {limit: 1}).then(
            function (rows) {
                if (rows.length) {
                    return result(rows[0]);
                }
                return Promise.all([countryOf(values.country),
                    mayCreate('country.postal_code')]).then(function (r) {
                        if (!r[1] || !preferences().addOnFly) {
                            return null;
                        }
                        return addPostalCode(code, r[0], values);
                    });
            });
    }

    function addPostalCode(code, country, values) {
        return new Promise(function (resolve) {
            var city = el('input', {type: 'text', maxlength: 40, value:
                values.city || '', 'aria-label': 'City'});
            var postal = el('input', {type: 'text', maxlength: 10, value:
                code, 'aria-label': 'Postal Code'});
            var countryPick = UI.picker('country.country', {label: 'Country',
                placeholder: 'Country'});
            if (country) {
                countryPick.set(country.id, country.rec_name);
            }
            var state = UI.picker('country.subdivision', {label: 'State',
                placeholder: 'State', domain: country ? [['country', '=',
                    country.id]] : []});
            function create(subdivision) {
                return global.Rpc.model('country.postal_code', 'create', [[{
                    postal_code: postal.value.trim(), city: city.value.trim() ||
                        null, subdivision: subdivision ? subdivision.id : null,
                    country: countryPick.value()}]]).then(function () {
                        resolve({postal_code: postal.value.trim(), city:
                            city.value.trim() || null, subdivision:
                            subdivision, country: countryPick.record() ||
                            country});
                    }, function (e) {
                        UI.showError(e);
                        resolve(null);
                    });
            }
            UI.modal('Add Postal Code?', el('div.js-dialog',
                el('p', 'Postal Code Not Found. Add Now?'),
                el('div.row', el('label', 'City'), city),
                el('div.row', el('label', 'State'), state.node),
                el('div.row', el('label', 'Postal Code'), postal),
                el('div.row', el('label', 'Country'), countryPick.node)), [
                {label: 'No', onclick: function () {
                    resolve(null);
                }},
                {label: 'Yes', primary: true, onclick: function () {
                    if (postal.value.trim().length < 5) {
                        UI.toast('Postal Codes must contain at least 5 ' +
                            'characters', 'error');
                        return true;
                    }
                    if (!countryPick.value()) {
                        UI.toast('Choose the country', 'error');
                        return true;
                    }
                    var typed = state.input.value.trim();
                    if (!state.value() && typed) {
                        /* A state not in the list: Add State/Province */
                        addStateProvince({code: typed.length <= 3 ? typed :
                            '', name: typed.length > 3 ? typed : '',
                            country: countryPick.value()}).then(create);
                    } else {
                        create(state.record() ? {id: state.record().id,
                            rec_name: state.record().rec_name} : null);
                    }
                }}]);
        });
    }

    /* ---- Find and Replace (Vmfg\FindAndReplace) ------------------------ */

    /* findReplace(textarea): Jobshop's Find and Replace of the
     * specifications; OK puts the text back in the field, Cancel leaves it */
    function findReplace(target) {
        style();
        var work = el('textarea', {rows: 10, 'aria-label': 'Text to Search'});
        work.value = target.value;
        var find = el('textarea', {rows: 2, 'aria-label': 'Find What'});
        var replace = el('textarea', {rows: 2, 'aria-label': 'Replace With'});
        var matchCase = el('input', {type: 'checkbox'});
        var whole = el('input', {type: 'checkbox'});
        var selected = target.selectionStart !== target.selectionEnd ?
            target.value.slice(target.selectionStart, target.selectionEnd) :
            '';
        find.value = selected;

        function regex(global_) {
            if (!find.value) {
                UI.toast('No \'Find\' text entered for \'Find and Replace\'',
                    'error');
                return null;
            }
            var text = find.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (whole.checked) {
                text = '\\b' + text + '\\b';
            }
            return new RegExp(text, (global_ ? 'g' : '') + (matchCase.checked ?
                '' : 'i'));
        }
        function findFrom(start) {
            var re = regex(true);
            if (!re) {
                return false;
            }
            re.lastIndex = start;
            var m = re.exec(work.value);
            if (!m) {
                UI.toast('Finished searching text.');
                return false;
            }
            work.focus();
            work.setSelectionRange(m.index, m.index + m[0].length);
            return true;
        }
        function current() {
            var re = regex(false);
            var sel = work.value.slice(work.selectionStart, work.selectionEnd);
            return re && sel && new RegExp('^(?:' + re.source + ')$',
                re.flags).test(sel);
        }
        function button(label, onclick) {
            return el('button', {type: 'button', onclick: onclick}, label);
        }
        UI.modal('Find and Replace', el('div.js-dialog',
            el('label', el('div.muted', 'Text to Search'), work),
            el('div.toolbar',
                button('Find', function () {
                    findFrom(0);
                }),
                button('Find Next', function () {
                    findFrom(work.selectionEnd);
                }),
                button('Replace', function () {
                    if (current()) {
                        var at = work.selectionStart;
                        work.setRangeText(replace.value, at, work.selectionEnd,
                            'end');
                        findFrom(at + replace.value.length);
                    } else {
                        findFrom(work.selectionEnd);
                    }
                }),
                button('Replace All', function () {
                    var re = regex(true);
                    if (!re) {
                        return;
                    }
                    var n = (work.value.match(re) || []).length;
                    work.value = work.value.replace(re, function () {
                        return replace.value;
                    });
                    UI.toast('Finished replacing text (' + n + ').', 'ok');
                })),
            el('label', el('div.muted', 'Find What'), find),
            el('label', el('div.muted', 'Replace With'), replace),
            el('div', el('label.check', matchCase, ' Match Case '),
                el('label.check', whole, ' Whole Word Only'))), [
            {label: 'Cancel'},
            {label: 'OK', primary: true, onclick: function () {
                if (target.value !== work.value) {
                    target.value = work.value;
                    target.dispatchEvent(new global.Event('input',
                        {bubbles: true}));
                    target.dispatchEvent(new global.Event('change',
                        {bubbles: true}));
                }
            }}]);
        find.focus();
    }

    /* ---- Edit > Picture (Insert / Clear / Stretch to Fit) -------------- */

    /* pictureTools(list, {model, id, writes, reload}): Jobshop's Picture
     * menu on a Picture tab (the right-click menu and the items for Edit >
     * Picture): Insert Picture replaces the record's picture, Clear Picture
     * removes it, Stretch to Fit fills the tab (kept on this computer). A
     * prototype for frame.js pictureTab. -> {menuItems()} */
    function pictureTools(list, options) {
        style();
        var resource = options.model + ',' + options.id;
        var stretchKey = 'nline.picture.stretch.' + options.model;
        list.classList.toggle('stretch', !!stored(stretchKey));

        function images() {
            return global.Rpc.searchRead('ir.attachment', [['resource', '=',
                resource]], ['name'], {}).then(function (rows) {
                    return rows.filter(function (a) {
                        return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(
                            a.name || '');
                    }).map(function (a) {
                        return a.id;
                    });
                });
        }
        function insert() {
            var file = el('input', {type: 'file', accept: 'image/*'});
            file.addEventListener('change', function () {
                var f = file.files[0];
                if (!f) {
                    return;
                }
                var reader = new FileReader();
                reader.onload = function () {
                    var data = String(reader.result).split(',')[1];
                    images().then(function (old) {
                        return global.Rpc.model('ir.attachment', 'create',
                            [[{name: f.name, resource: resource, data: {
                                __class__: 'bytes', base64: data}}]]).then(
                            function () {
                                /* One picture per record, as Jobshop */
                                return old.length ? global.Rpc.model(
                                    'ir.attachment', 'delete', [old]) : null;
                            });
                    }).then(options.reload, UI.showError);
                };
                reader.readAsDataURL(f);
            });
            file.click();
        }
        function clear() {
            images().then(function (ids) {
                if (!ids.length) {
                    return;
                }
                UI.confirm('Clear Picture', 'Remove the picture?').then(
                    function (ok) {
                        if (ok) {
                            global.Rpc.model('ir.attachment', 'delete',
                                [ids]).then(options.reload, UI.showError);
                        }
                    });
            });
        }
        function stretch() {
            var on = !list.classList.contains('stretch');
            list.classList.toggle('stretch', on);
            stored(stretchKey, on || null);
        }
        function menuItems() {
            return (options.writes ? [{label: 'Insert Picture', onclick:
                insert}, {label: 'Clear Picture', onclick: clear}] : [])
                .concat([{label: 'Stretch to Fit', checked:
                    list.classList.contains('stretch'), onclick: stretch}]);
        }
        list.addEventListener('contextmenu', function (event) {
            UI.contextMenu(event, menuItems());
        });
        return {menuItems: menuItems, insert: insert, clear: clear,
            stretch: stretch};
    }

    /* ---- Checking for alert messages ----------------------------------- */

    /* watchAlerts(): Preferences > Show User Alert Messages at Startup and
     * Check for User Alert Messages every N minutes; for app.js to call
     * once when the desk starts. -> stop() */
    function watchAlerts() {
        var prefs = preferences();
        var last = null;
        var timer = null;
        function check(startup) {
            unreadAlerts().then(function (n) {
                if (n && (startup ? prefs.showAlertsAtStartup : n > last)) {
                    UI.toast('You have ' + n + ' unread alert message' +
                        (n === 1 ? '' : 's') + ' (File > Alert Messages)');
                }
                last = n;
            });
        }
        check(true);
        if (prefs.checkAlerts && prefs.checkAlertsMinutes > 0) {
            timer = global.setInterval(check, prefs.checkAlertsMinutes *
                60000);
        }
        return function () {
            global.clearInterval(timer);
        };
    }

    /* ---- Routes and the shared helpers -------------------------------- */

    routes.push(
        [/^#\/fob-points$/, 'jsFobPoints'],
        [/^#\/ship-vias$/, 'jsShipVias'],
        [/^#\/states$/, 'jsStates'],
        [/^#\/postal-codes$/, 'jsPostalCodes'],
        [/^#\/terms$/, 'terms'],
        [/^#\/product-codes$/, 'jsProductCodes'],
        [/^#\/commodity-codes$/, 'jsCommodityCodes'],
        [/^#\/reason-codes$/, 'jsReasonCodes'],
        [/^#\/reason-codes\/inventory$/, 'jsInventoryReasonCodes'],
        [/^#\/currency-codes$/, 'jsCurrencyCodes'],
        [/^#\/alert-messages$/, 'jsAlertMessages'],
        [/^#\/control-panel$/, 'jsControlPanel'],
        [/^#\/preferences$/, 'jsPreferences']);

    global.JobshopCommon = {
        codeTable: codeTable,
        gridTools: gridTools,
        filterDomain: filterDomain,
        preferences: preferences,
        checkPostalCode: checkPostalCode,
        addStateProvince: addStateProvince,
        findReplace: findReplace,
        pictureTools: pictureTools,
        watchAlerts: watchAlerts,
        alertsPanel: alertsPanel,
        unreadAlerts: unreadAlerts
    };
}(window));
