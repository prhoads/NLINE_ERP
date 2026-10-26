/* N-Line screens: the building blocks shared by every screen, after
 * QuickBooks Desktop and VISUAL Jobshop (docs/ui/UI_UPGRADE_PLAN.md):
 * - UI.form: the transaction form (ribbon with Find, Save & Close,
 *   Save & New, Clear; the history panel of the customer or vendor)
 * - UI.grid: the line grid (row markers, totals, Enter to the next cell,
 *   a new row after the last one)
 * - UI.browse: the "..." lookup (F9 in any lookup field, * wildcards)
 * - UI.center: list on the left, detail and transactions on the right
 * - UI.openRecord / UI.openScreen / UI.openAction: open in a Tryton tab */
(function (global) {
    'use strict';

    var el = UI.el;

    /* ---- Opening other screens -------------------------------------- */

    function toTryton(message) {
        if (global.parent !== global) {
            global.parent.postMessage(message, global.location.origin);
            return true;
        }
        return false;
    }

    /* A Tryton record in a Tryton tab (or the Tryton client outside it) */
    function openRecord(model, id, name) {
        if (!toTryton({nline: 'record', model: model, id: id,
                name: name || ''})) {
            var session = global.Rpc.session();
            global.open(global.Rpc.base + '/#' + encodeURIComponent(
                session.database) + '/model/' + model + '/' + id, '_blank');
        }
    }

    /* An N-Line screen, by its route (e.g. 'bills/new') */
    function openScreen(route) {
        if (!toTryton({nline: 'open', route: route})) {
            global.location.hash = '#/' + route;
        }
    }

    /* A Tryton action (ir.action id): a list, a report, a wizard */
    function openAction(action) {
        if (!toTryton({nline: 'action', action: action})) {
            var session = global.Rpc.session();
            global.open(global.Rpc.base + '/#' + encodeURIComponent(
                session.database), '_blank');
        }
    }

    /* ---- The lookup: "..." and F9 ------------------------------------ */

    /* browse(model, {title, domain, columns: [{field, label, money}],
     * order}) -> Promise of the chosen record (rejected on Cancel) */
    function browse(model, options) {
        options = options || {};
        var columns = options.columns || [{field: 'rec_name',
            label: 'Name'}];
        var fields = columns.map(function (c) {
            return c.field;
        });
        if (fields.indexOf('rec_name') < 0) {
            fields.push('rec_name');
        }
        return new Promise(function (resolve, reject) {
            var search = el('input', {type: 'text', 'aria-label': 'Search',
                placeholder: 'Search (* for any text)'});
            var body = el('tbody');
            var records = [];
            var active = 0;

            function render() {
                UI.clear(body);
                records.forEach(function (record, index) {
                    body.appendChild(el('tr' + (index === active ?
                        '.active' : ''), {
                        onclick: function () {
                            active = index;
                            render();
                        },
                        ondblclick: function () {
                            pick(record);
                        }
                    }, columns.map(function (c) {
                        var value = record[c.field];
                        return el('td' + (c.money ? '.num' : ''),
                            c.money ? UI.money(value) : value === null ||
                            value === undefined ? '' : String(value));
                    })));
                });
                if (!records.length) {
                    body.appendChild(el('tr', el('td', {colspan:
                        columns.length}, 'Nothing found.')));
                }
                var row = body.querySelector('tr.active');
                if (row) {
                    row.scrollIntoView({block: 'nearest'});
                }
            }

            function load() {
                var domain = (options.domain || []).slice();
                var text = search.value.trim().replace(/\*/g, '%');
                if (text) {
                    domain.push(['rec_name', 'ilike', text.indexOf('%') >=
                        0 ? text : '%' + text + '%']);
                }
                global.Rpc.searchRead(model, domain, fields, {limit: 100,
                    order: options.order}).then(function (rows) {
                    records = rows;
                    active = 0;
                    render();
                }, UI.showError);
            }

            var close;

            function pick(record) {
                close();
                resolve(record);
            }

            var timer;
            search.addEventListener('input', function () {
                global.clearTimeout(timer);
                timer = global.setTimeout(load, 200);
            });
            search.addEventListener('keydown', function (event) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    active = Math.max(0, Math.min(records.length - 1,
                        active + (event.key === 'ArrowDown' ? 1 : -1)));
                    render();
                    event.preventDefault();
                } else if (event.key === 'Enter' && records[active]) {
                    event.preventDefault();
                    pick(records[active]);
                } else if (event.key === 'Escape') {
                    close();
                    reject({cancelled: true});
                }
            });
            close = UI.modal(options.title || 'Find', [search,
                el('div.browse', el('table.data', el('thead', el('tr',
                    columns.map(function (c) {
                        return el('th' + (c.money ? '.num' : ''), c.label);
                    }))), body))], [
                {label: 'Cancel', onclick: function () {
                    reject({cancelled: true});
                }},
                {label: 'OK', primary: true, onclick: function () {
                    if (records[active]) {
                        resolve(records[active]);
                        return;
                    }
                    return true;
                }}
            ]);
            search.focus();
            load();
        });
    }

    /* ---- The transaction form ---------------------------------------- */

    /* form(main, {title, kind: 'vendor'|'customer', find: {model, domain,
     * columns, title}, onSave(andNew) -> Promise, onClear, extra: [{label,
     * onclick}]}) -> {body, showParty(id)}.
     * Alt+S Save & Close, Alt+N Save & New, Alt+R Clear, Ctrl+F Find. */
    function form(main, options) {
        var saving = false;

        function save(andNew) {
            if (saving || !options.onSave) {
                return;
            }
            saving = true;
            Promise.resolve(options.onSave(andNew)).then(function () {
                saving = false;
            }, function () {
                saving = false;
            });
        }

        function find() {
            if (!options.find) {
                return;
            }
            browse(options.find.model, options.find).then(function (record) {
                openRecord(options.find.model, record.id, record.rec_name);
            }, function () {});
        }

        function button(label, title, onclick, primary) {
            return el('button' + (primary ? '.primary' : ''), {type: 'button',
                title: title, onclick: onclick}, label);
        }

        var ribbon = el('div.ribbon', {role: 'toolbar', 'aria-label':
                options.title},
            el('span.ribbon-title', options.title),
            options.find ? button('Find', 'Find a previous one (Ctrl+F)',
                find) : null,
            (options.extra || []).map(function (item) {
                return button(item.label, item.title || item.label,
                    item.onclick);
            }),
            el('span.spacer'),
            options.onClear ? button('Clear', 'Clear the form (Alt+R)',
                options.onClear) : null,
            options.onSave ? button('Save & New', 'Save and start a new ' +
                'one (Alt+N)', function () {
                    save(true);
                }) : null,
            options.onSave ? button('Save & Close', 'Save and close (Alt+S)',
                function () {
                    save(false);
                }, true) : null);

        var body = el('div.form-main');
        var side = el('aside.history', {'aria-label': 'History'});
        var layout = el('div.form-layout' + (options.kind ? '' :
            '.no-history'), body, options.kind ? side : null);
        main.appendChild(ribbon);
        main.appendChild(layout);

        if (options.kind) {
            side.appendChild(el('p.muted', 'Choose a ' + options.kind +
                ' to see their balance and recent transactions.'));
        }

        global.document.addEventListener('keydown', function (event) {
            if (!ribbon.isConnected) {
                return;
            }
            var key = event.key.toLowerCase();
            if (event.altKey && key === 's') {
                event.preventDefault();
                save(false);
            } else if (event.altKey && key === 'n') {
                event.preventDefault();
                save(true);
            } else if (event.altKey && key === 'r' && options.onClear) {
                event.preventDefault();
                options.onClear();
            } else if ((event.ctrlKey || event.metaKey) && key === 'f' &&
                    options.find) {
                event.preventDefault();
                find();
            }
        });

        /* The history panel: balance and recent transactions */
        function showParty(id) {
            if (!options.kind) {
                return;
            }
            if (!id) {
                UI.clear(side).appendChild(el('p.muted', 'Choose a ' +
                    options.kind + '.'));
                return;
            }
            global.Rpc.desk('party_center', [id, options.kind]).then(
                function (data) {
                    UI.clear(side);
                    side.appendChild(el('h3', data.name));
                    side.appendChild(el('div.history-balance',
                        el('span.muted', 'Open balance'),
                        el('strong', UI.money(data.balance, true))));
                    side.appendChild(el('h4', 'Recent transactions'));
                    var list = el('ul.history-list');
                    data.transactions.slice(0, 8).forEach(function (t) {
                        var model = t.type === 'payment' ? 'account.payment' :
                            'account.invoice';
                        list.appendChild(el('li', el('a', {href: '#',
                            onclick: function (event) {
                                event.preventDefault();
                                openRecord(model, t.id, t.number);
                            }}, UI.date(t.date) + ' ' + t.type + ' ' +
                                (t.number || '')),
                            el('span.num', UI.money(t.amount))));
                    });
                    if (!data.transactions.length) {
                        list.appendChild(el('li.muted', 'None yet.'));
                    }
                    side.appendChild(list);
                    side.appendChild(el('a', {href: '#/' + (options.kind ===
                        'customer' ? 'customers' : 'vendors')},
                        options.kind === 'customer' ? 'Customer Center' :
                            'Vendor Center'));
                }, function () {
                    UI.clear(side);
                });
        }

        return {body: body, ribbon: ribbon, showParty: showParty};
    }

    /* ---- The line grid ------------------------------------------------ */

    /* grid({columns: [{key, label, width, kind: 'text'|'money'|'number'|
     * 'picker', picker: {model, domain, placeholder, fields}}], total: key,
     * onchange(total)}) -> {node, rows(), total(), addRow(values), clear()}.
     * A row is a {key: control}; the last column's Enter adds a row. */
    function grid(options) {
        var columns = options.columns;
        var body = el('tbody');
        var totalCell = el('td.num', '0.00');
        var rows = [];

        function value(control, column) {
            if (column.kind === 'picker') {
                return control.value();
            }
            if (column.kind === 'money' || column.kind === 'number') {
                return UI.parseMoney(control.value);
            }
            return control.value;
        }

        function update() {
            var sum = total();
            totalCell.textContent = UI.money(sum);
            if (options.onchange) {
                options.onchange(sum);
            }
        }

        function total() {
            if (!options.total) {
                return 0;
            }
            var column = columns.filter(function (c) {
                return c.key === options.total;
            })[0];
            return rows.reduce(function (sum, row) {
                return sum + value(row.controls[options.total], column);
            }, 0);
        }

        function addRow(values) {
            var row = {controls: {}, edited: false};
            var marker = el('td.marker', {title: 'New line'}, '+');
            var cells = columns.map(function (column, index) {
                var control;
                if (column.kind === 'picker') {
                    control = UI.picker(column.picker.model, Object.assign({
                        label: column.label}, column.picker));
                } else if (column.kind === 'money') {
                    control = UI.moneyInput({'aria-label': column.label});
                } else {
                    control = el('input', {type: 'text', 'aria-label':
                        column.label, inputmode: column.kind === 'number' ?
                        'decimal' : null});
                    if (column.kind === 'number') {
                        control.classList.add('money');
                    }
                }
                row.controls[column.key] = control;
                var input = control.input || control;
                input.addEventListener('input', function () {
                    if (!row.edited) {
                        row.edited = true;
                        marker.textContent = '✎';
                        marker.title = 'Edited';
                    }
                    if (column.kind === 'money' || column.kind ===
                            'number') {
                        update();
                    }
                });
                input.addEventListener('keydown', function (event) {
                    if (event.key !== 'Enter' || event.defaultPrevented) {
                        return;
                    }
                    event.preventDefault();
                    var next = columns[index + 1];
                    if (next) {
                        var target = row.controls[next.key];
                        (target.input || target).focus();
                    } else {
                        var after = rows[rows.indexOf(row) + 1] ||
                            addRow();
                        var first = after.controls[columns[0].key];
                        (first.input || first).focus();
                    }
                });
                if (column.kind === 'money' || column.kind === 'number') {
                    input.addEventListener('blur', function () {
                        update();
                        if (rows[rows.length - 1] === row &&
                                value(control, column)) {
                            addRow();
                        }
                    });
                }
                return el('td', {style: column.width ? {width:
                    column.width} : null}, control.node || control);
            });
            var tr = el('tr', marker, cells, el('td.row-delete',
                el('button', {type: 'button', title: 'Delete line',
                    'aria-label': 'Delete line', onclick: function () {
                        rows.splice(rows.indexOf(row), 1);
                        tr.remove();
                        if (!rows.length) {
                            addRow();
                        }
                        update();
                    }}, '✕')));
            row.tr = tr;
            Object.keys(values || {}).forEach(function (key) {
                var control = row.controls[key];
                var v = values[key];
                if (control && control.set) {
                    control.set(v.id, v.rec_name);
                } else if (control) {
                    control.value = v;
                }
            });
            rows.push(row);
            body.appendChild(tr);
            if (values) {
                update();
            }
            return row;
        }

        addRow();
        var totalIndex = columns.map(function (c) {
            return c.key;
        }).indexOf(options.total);
        return {
            node: el('div.table-wrap', el('table.data.lines',
                el('thead', el('tr', el('th.marker', ''), columns.map(
                    function (c) {
                        return el('th' + (c.kind === 'money' ||
                            c.kind === 'number' ? '.num' : ''), c.label);
                    }), el('th', ''))), body,
                options.total ? el('tfoot', el('tr', el('td', {colspan:
                    totalIndex + 1}, 'Total'), totalCell, el('td',
                    {colspan: columns.length - totalIndex}, ''))) :
                    null)),
            /* The lines with a value in a column of options.required (the
             * total column by default), as {key: value} */
            rows: function () {
                var required = options.required || options.total;
                return rows.filter(function (row) {
                    if (!required) {
                        return true;
                    }
                    var column = columns.filter(function (c) {
                        return c.key === required;
                    })[0];
                    return value(row.controls[required], column);
                }).map(function (row) {
                    var result = {};
                    columns.forEach(function (column) {
                        result[column.key] = value(row.controls[column.key],
                            column);
                    });
                    return result;
                });
            },
            controls: function () {
                return rows.map(function (row) {
                    return row.controls;
                });
            },
            total: total,
            addRow: addRow,
            clear: function () {
                rows.slice().forEach(function (row) {
                    row.tr.remove();
                });
                rows.length = 0;
                addRow();
                update();
            }
        };
    }

    /* ---- The center ---------------------------------------------------- */

    /* center(main, {title, list(text) -> Promise [{id, name, amount}],
     * amountLabel, detail(id, pane), actions: [{label, route}]}) */
    function center(main, options) {
        var search = el('input', {type: 'text', placeholder: 'Search',
            'aria-label': 'Search'});
        var list = el('div.party-list', {role: 'listbox', 'aria-label':
            options.title});
        var detail = el('div.center-detail', el('p.muted',
            options.empty || 'Choose one on the left.'));
        main.appendChild(el('div.ribbon', el('span.ribbon-title',
            options.title), el('span.spacer'),
            (options.actions || []).map(function (action) {
                return el('button', {type: 'button', onclick: function () {
                    openScreen(action.route);
                }}, action.label);
            })));
        main.appendChild(el('div.center', el('div.panel.center-list',
            search, el('div.center-head', el('span', 'Name'),
                el('span', options.amountLabel || 'Balance')), list),
            detail));
        var activeId = null;

        function load() {
            options.list(search.value.trim()).then(function (rows) {
                UI.clear(list);
                rows.forEach(function (row) {
                    list.appendChild(el('div.party-row' + (row.id ===
                        activeId ? '.active' : ''), {
                        role: 'option',
                        tabindex: 0,
                        onclick: function () {
                            choose(row.id, this);
                        },
                        onkeydown: function (event) {
                            if (event.key === 'Enter') {
                                choose(row.id, this);
                            }
                        }
                    }, el('span', row.name), el('span.num',
                        UI.money(row.amount))));
                });
                if (!rows.length) {
                    list.appendChild(el('p.muted', 'Nothing found.'));
                }
            }, UI.showError);
        }

        function choose(id, node) {
            activeId = id;
            list.querySelectorAll('.active').forEach(function (n) {
                n.classList.remove('active');
            });
            node.classList.add('active');
            options.detail(id, UI.clear(detail));
        }

        var timer;
        search.addEventListener('input', function () {
            global.clearTimeout(timer);
            timer = global.setTimeout(load, 250);
        });
        load();
        return {reload: load};
    }

    Object.assign(UI, {
        browse: browse,
        form: form,
        grid: grid,
        center: center,
        openRecord: openRecord,
        openScreen: openScreen,
        openAction: openAction
    });
}(window));
