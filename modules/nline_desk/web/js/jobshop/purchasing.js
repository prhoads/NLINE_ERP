/* N-Line Jobshop emulation: purchasing screens (module nline_js_purchasing; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * Suppliers (supplier-window), Request For Quotes (rfqs), Purchase Orders
 * (purchase-orders/new, purchase-orders/<id>), Receiving (receiving),
 * Services (services) and Tax Groups (purchase-tax-groups), as the
 * Purchasing group bar of VISUAL Jobshop has them. The server side is
 * nline.desk js_* (modules/nline_js_purchasing/desk.py). */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    var PO_STATUS = {unreleased: 'Unreleased', hold: 'Hold', firm: 'Firm',
        released: 'Released', closed: 'Closed', cancelled: 'Cancelled'};
    var RFQ_STATUS = [['unreleased', 'Unreleased'],
        ['active', 'Active (Awaiting Quote)'], ['closed', 'Closed'],
        ['cancelled', 'Cancelled']];
    var RECEIVER_STATUS = [['unapproved', 'Unapproved'],
        ['approved', 'Approved'], ['cancelled', 'Cancelled']];
    var FREIGHT = [[null, ''], ['billed', 'Billed'], ['collect', 'Collect'],
        ['prepaid', 'Prepaid']];
    var LINE_TYPES = [['part', 'Part Order'], ['service', 'Service Order']];
    var PRICE_TYPES = [['break', 'Break Table'], ['upto', 'Up-to-Qty Table']];
    var TAX_GROUP_DOMAIN = [['parent', '=', null],
        ['group.code', '=', 'JS-PURCHASE']];
    var SUPPLIER_DOMAIN = [['is_supplier', '=', true],
        ['supplier_inactive', '=', false]];
    var SHIP_TO = [
        {name: 'ship_to_name', label: 'Name', type: 'char', span: 2},
        {name: 'ship_to_street', label: 'Address', type: 'text', span: 2,
            rows: 3},
        {name: 'ship_to_city', label: 'City', type: 'char'},
        {name: 'ship_to_state', label: 'State', type: 'char'},
        {name: 'ship_to_postal_code', label: 'Postal Code', type: 'char'},
        {name: 'ship_to_country', label: 'Country', type: 'char'},
        {name: 'ship_to_contact', label: 'Contact', type: 'char'},
        {name: 'ship_to_title', label: 'Title', type: 'char'},
        {name: 'ship_to_phone', label: 'Phone', type: 'char'},
        {name: 'ship_to_fax', label: 'Fax', type: 'char'},
        {name: 'ship_to_email', label: 'E-mail', type: 'char'}];

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    /* The look of these screens, once, with the desk's colours */
    function css() {
        if (document.getElementById('nl-js-purchasing-css')) {
            return;
        }
        var style = document.createElement('style');
        style.id = 'nl-js-purchasing-css';
        style.textContent = [
            '.jsp-head { display: flex; flex-wrap: wrap; gap: 10px;',
            '  align-items: center; margin-bottom: 10px; }',
            '.jsp-head .picker { min-width: 240px; }',
            '.jsp-status { font-weight: 600; padding: 2px 8px;',
            '  border: 1px solid var(--line); border-radius: 4px; }',
            '.jsp-status.st-released, .jsp-status.st-active,',
            '.jsp-status.st-approved { color: var(--ok); }',
            '.jsp-status.st-cancelled, .jsp-status.st-hold,',
            '.jsp-status.st-late { color: var(--bad); }',
            '.jsp-lines td input, .jsp-lines td select { min-width: 60px; }',
            '.jsp-lines td.num input { text-align: right; }',
            '.jsp-lines tr.jsp-deleted td { text-decoration: line-through;',
            '  color: var(--muted); }',
            '.jsp-lines tr.jsp-active td { background: var(--accent-soft); }',
            '.jsp-lines th.jsp-row, .jsp-lines td.jsp-row { width: 22px;',
            '  color: var(--muted); cursor: pointer; text-align: center; }',
            '.jsp-totals { display: flex; gap: 18px; justify-content: flex-end;',
            '  margin-top: 8px; }',
            '.jsp-totals strong { font-variant-numeric: tabular-nums; }',
            '.jsp-address { line-height: 1.5; white-space: pre-line;',
            '  border: 1px solid var(--line); border-radius: 4px;',
            '  padding: 8px 10px; background: var(--paper); min-height: 60px; }',
            '.jsp-split { display: grid; grid-template-columns: 1fr 1fr;',
            '  gap: 14px; }',
            '@media (max-width: 700px) { .jsp-split { grid-template-columns:',
            '  1fr; } }',
            '.jsp-sub { margin-top: 12px; }',
            '.jsp-sub h3 { margin: 0 0 6px; font-size: 13px; color: var(--muted); }',
            '.jsp-dialog { min-width: min(820px, 92vw); }',
            '.jsp-dialog .tab-pane { max-height: 60vh; overflow: auto; }',
            'tr.jsp-click { cursor: default; }',
            'tr.jsp-late td { color: var(--bad); }',
            '.jsp-check { white-space: nowrap; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function num(value, digits) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        var n = Number(value);
        if (isNaN(n)) {
            return String(value);
        }
        return digits === undefined ? String(Math.round(n * 10000) / 10000) :
            n.toFixed(digits);
    }

    function parseNum(text) {
        if (text === null || text === undefined || String(text).trim() ===
                '') {
            return null;
        }
        var n = UI.parseMoney(String(text));
        return isNaN(n) ? null : n;
    }

    function m2oText(value) {
        return value && value.rec_name ? value.rec_name : '';
    }

    /* A read-only table: heads [label | {label, num}], rows [[cells]],
     * options {onopen(index), oncontext(event, index), empty} */
    function table(heads, rows, options) {
        options = options || {};
        var body = el('tbody');
        rows.forEach(function (cells, index) {
            body.appendChild(el('tr.jsp-click', {
                title: options.onopen ? 'Double-click to open' : null,
                ondblclick: options.onopen ? function () {
                    options.onopen(index);
                } : null,
                oncontextmenu: options.oncontext ? function (event) {
                    options.oncontext(event, index);
                } : null,
                className: options.rowClass ? options.rowClass(index) : ''
            }, cells.map(function (cell, i) {
                var head = heads[i];
                var isNum = head && head.num;
                return el('td' + (isNum ? '.num' : ''), cell === null ||
                    cell === undefined ? '' : cell);
            })));
        });
        if (!rows.length) {
            body.appendChild(el('tr', el('td', {colspan: heads.length},
                options.empty || 'None.')));
        }
        return el('div.table-wrap', el('table.data', el('thead', el('tr',
            heads.map(function (h) {
                return el('th' + (h.num ? '.num' : ''), h.label || h);
            }))), body));
    }

    /* Fields laid out as a Jobshop tab: {controls, node, set(data),
     * get(values), lock(editable)} */
    function fieldsPane(fields) {
        var controls = {};
        var grid = el('div.grid-form');
        fields.forEach(function (f) {
            var c = UI.fieldControl(f);
            c.field = f;
            controls[f.name] = c;
            grid.appendChild(el('div', f.span ? {style: {gridColumn: 'span ' +
                f.span}} : null, el('label.field', f.label), c.node));
        });
        return {
            controls: controls,
            node: grid,
            set: function (data) {
                Object.keys(controls).forEach(function (name) {
                    var c = controls[name];
                    var value = data ? data[name] : undefined;
                    if (value === undefined) {
                        value = c.field.default !== undefined ?
                            c.field.default : null;
                    }
                    c.set(value);
                });
            },
            get: function (values) {
                Object.keys(controls).forEach(function (name) {
                    var c = controls[name];
                    if (!c.field.readonly) {
                        /* A many2one as {id, rec_name}: the desk services
                         * take either, a dialog shows it again */
                        var rec = c.picker && c.picker.record();
                        values[name] = c.picker ? (rec ? {id: rec.id,
                            rec_name: rec.rec_name} : null) : c.get();
                    }
                });
                return values;
            },
            lock: function (editable) {
                Object.keys(controls).forEach(function (name) {
                    var c = controls[name];
                    Array.prototype.forEach.call(c.node.querySelectorAll(
                        'input, select, textarea, button'), function (node) {
                        node.disabled = !editable || Boolean(c.field.readonly);
                    });
                });
            }
        };
    }

    /* Tabs in a container: [{title, node}] -> {show(index), select(title)} */
    function tabSet(container, tabs) {
        var bar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        function show(index) {
            Array.prototype.forEach.call(bar.children, function (b, i) {
                b.classList.toggle('active', i === index);
                b.setAttribute('aria-selected', i === index);
            });
            Array.prototype.forEach.call(panes.children, function (p, i) {
                p.hidden = i !== index;
            });
            if (tabs[index].onshow) {
                tabs[index].onshow();
            }
        }
        tabs.forEach(function (tab, index) {
            bar.appendChild(el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(index);
                }}, tab.title));
            var pane = el('div.tab-pane.panel', {role: 'tabpanel'}, tab.node);
            /* (its element: tab.pane is the tab's fields) */
            tab.paneNode = pane;
            panes.appendChild(pane);
        });
        container.appendChild(bar);
        container.appendChild(panes);
        show(0);
        return {
            show: show,
            select: function (title) {
                tabs.forEach(function (t, i) {
                    if (t.title === title) {
                        show(i);
                    }
                });
            },
            tabs: tabs
        };
    }

    /* The access of the user to models, once per screen */
    function rights(models) {
        return UI.access(models).then(function (result) {
            var out = {};
            models.forEach(function (model) {
                var a = result[model] || {};
                out[model] = {read: a.read !== false, write: a.write !== false,
                    create: a.create !== false, 'delete': a['delete'] !== false};
            });
            return out;
        });
    }

    /* Jobshop's keyboard: Ctrl+S saves, F5 refreshes */
    function keys(node, save, refresh) {
        document.addEventListener('keydown', function (event) {
            if (!node.isConnected) {
                return;
            }
            var key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 's' && save) {
                event.preventDefault();
                save();
            } else if (event.key === 'F5' && refresh && !event.shiftKey) {
                event.preventDefault();
                refresh();
            }
        });
    }

    /* The Browse tab of a document window: a searchable list, double-click
     * opens. columns [{name, label, type, labels}] */
    function browseTab(model, columns, options) {
        var body = el('tbody');
        var search = el('input', {type: 'text', placeholder:
            'Search (* for any text)', 'aria-label': 'Search'});
        var loaded = false;
        function fieldsOf() {
            var names = [];
            columns.forEach(function (c) {
                names.push(c.name);
                if (c.type === 'many2one') {
                    names.push(c.name + '.rec_name');
                }
            });
            return names;
        }
        function load() {
            loaded = true;
            var domain = (options.domain || []).slice();
            var text = search.value.trim().replace(/\*/g, '%');
            if (text) {
                domain.push(['rec_name', 'ilike', text.indexOf('%') >= 0 ?
                    text : '%' + text + '%']);
            }
            Rpc.searchRead(model, domain, fieldsOf(), {limit: 300,
                order: options.order}).then(function (rows) {
                UI.clear(body);
                rows.forEach(function (row) {
                    body.appendChild(el('tr.jsp-click', {title:
                        'Double-click to open', ondblclick: function () {
                            options.open(row.id);
                        }}, columns.map(function (c) {
                            var v = row[c.name];
                            if (c.type === 'many2one') {
                                v = row[c.name + '.'] ?
                                    row[c.name + '.'].rec_name : '';
                            } else if (c.labels) {
                                v = c.labels[v] || v || '';
                            } else if (c.type === 'money') {
                                v = UI.money(v);
                            } else if (c.type === 'date') {
                                v = UI.date(v);
                            } else if (c.type === 'boolean') {
                                v = v ? '✔' : '';
                            }
                            return el('td' + (c.type === 'money' ? '.num' :
                                ''), v === null || v === undefined ? '' :
                                String(v));
                        })));
                });
                if (!rows.length) {
                    body.appendChild(el('tr', el('td', {colspan:
                        columns.length}, 'Nothing found.')));
                }
            }, UI.showError);
        }
        var timer;
        search.addEventListener('input', function () {
            global.clearTimeout(timer);
            timer = global.setTimeout(load, 250);
        });
        return {
            node: el('div', el('div.toolbar', el('div', {style: {width:
                '320px'}}, search), el('button', {type: 'button', title:
                'Refresh Browse (Shift+F5)', onclick: load}, 'Refresh')),
                el('div.table-wrap', el('table.data', el('thead', el('tr',
                    columns.map(function (c) {
                        return el('th', c.label);
                    }))), body))),
            onshow: function () {
                if (!loaded) {
                    load();
                }
            },
            reload: function () {
                if (loaded) {
                    load();
                }
            }
        };
    }

    /* First / Previous / Next / Last through a model's records */
    function navButtons(model, domain, order, current, open) {
        function step(where) {
            Rpc.model(model, 'search', [domain || [], 0, null, order ||
                null]).then(function (ids) {
                if (!ids.length) {
                    return;
                }
                var at = current() ? ids.indexOf(current()) : -1;
                var to = where === 'first' ? 0 : where === 'last' ?
                    ids.length - 1 : where === 'next' ?
                    Math.min(ids.length - 1, at + 1) :
                    Math.max(0, at < 0 ? ids.length - 1 : at - 1);
                open(ids[to]);
            }, UI.showError);
        }
        return el('span.record-nav', [['first', '⏮', 'First (Ctrl+F)'],
            ['previous', '◀', 'Previous (Ctrl+L)'], ['next', '▶',
                'Next (Ctrl+N)'], ['last', '⏭', 'Last (Ctrl+E)']].map(
            function (b) {
                return el('button', {type: 'button', title: b[2],
                    'aria-label': b[2], onclick: function () {
                        step(b[0]);
                    }}, b[1]);
            }));
    }

    /* An address as Jobshop's Purchase From / Receive From block */
    function addressBlock(a) {
        if (!a) {
            return el('div.jsp-address.muted', 'No address.');
        }
        var lines = [a.name, a.address_1, a.address_2, a.etc,
            [a.city, a.state, a.postal_code].filter(Boolean).join(' '),
            a.country].filter(Boolean);
        var contact = [a.contact, a.title].filter(Boolean).join(', ');
        return el('div.jsp-split', el('div.jsp-address', lines.join('\n')),
            el('div.jsp-address', [contact ? 'Contact: ' + contact : '',
                a.phone ? 'Phone: ' + a.phone : '', a.fax ? 'Fax: ' + a.fax :
                    '', a.email ? 'E-mail: ' + a.email : ''].filter(Boolean)
                .join('\n') || 'No contact.'));
    }

    /* A Ship To tab: the fields, "Supplier Address..." (drop ship to an
     * address of a supplier) and "Clear Address" */
    function shipToTab(editable) {
        var pane = fieldsPane(SHIP_TO);
        var buttons = el('div.toolbar');
        function fill(address) {
            var c = pane.controls;
            c.ship_to_name.set(address.name || '');
            c.ship_to_street.set([address.address_1, address.address_2,
                address.etc].filter(Boolean).join('\n'));
            c.ship_to_city.set(address.city || '');
            c.ship_to_state.set(address.state || '');
            c.ship_to_postal_code.set(address.postal_code || '');
            c.ship_to_country.set(address.country || '');
            c.ship_to_contact.set(address.contact || '');
            c.ship_to_title.set(address.title || '');
            c.ship_to_phone.set(address.phone || '');
            c.ship_to_fax.set(address.fax || '');
            c.ship_to_email.set(address.email || '');
        }
        buttons.appendChild(el('button', {type: 'button', onclick: function () {
            UI.browse('party.address', {title: 'Drop ship to the address of',
                domain: [['party.is_supplier', '=', true]],
                columns: [{field: 'party.rec_name', label: 'Supplier'},
                    {field: 'rec_name', label: 'Address'}]}).then(
                function (record) {
                    Rpc.searchRead('party.address', [['id', '=', record.id]],
                        ['party_name', 'party.rec_name', 'street', 'city',
                            'postal_code', 'subdivision.code',
                            'country.name', 'site_contact_name',
                            'site_contact_title', 'site_contact_phone',
                            'site_contact_fax', 'site_contact_email']).then(
                        function (rows) {
                            var r = rows[0];
                            var street = (r.street || '').split('\n');
                            fill({name: r.party_name || (r['party.'] || {})
                                .rec_name, address_1: street[0],
                                address_2: street[1], etc: street.slice(2)
                                    .join('\n'), city: r.city,
                                state: r['subdivision.'] ?
                                    r['subdivision.'].code.split('-').pop() :
                                    '', postal_code: r.postal_code,
                                country: r['country.'] ? r['country.'].name :
                                    '', contact: r.site_contact_name,
                                title: r.site_contact_title,
                                phone: r.site_contact_phone,
                                fax: r.site_contact_fax,
                                email: r.site_contact_email});
                        }, UI.showError);
                }, function () {});
        }}, 'Supplier Address…'), el('button', {type: 'button', onclick:
            function () {
                fill({});
            }}, 'Clear Address'), el('span.muted',
            'Empty: your company address prints on the order.'));
        return {
            node: el('div', buttons, pane.node),
            set: pane.set,
            get: pane.get,
            lock: function (on) {
                pane.lock(on);
                Array.prototype.forEach.call(buttons.querySelectorAll(
                    'button'), function (b) {
                    b.disabled = !on;
                });
            }
        };
    }

    /* An editable grid of rows: columns [{name, label, type, model, domain,
     * options, num, width, readonly, onchange(row)}] built with
     * UI.fieldControl; rows keep their data (id...) in row.data.
     * options {onopen(row), onadd(row), extra(row) -> nodes, deletable} */
    function editGrid(columns, options) {
        options = options || {};
        var body = el('tbody');
        var rows = [];
        var editable = true;
        function addRow(data) {
            var row = {data: data || {}, controls: {}, deleted: false};
            var marker = el('td.jsp-row', {title: 'Row: double-click to ' +
                'open the line, Del marks it deleted', tabindex: 0,
                ondblclick: function () {
                    if (options.onopen) {
                        options.onopen(row);
                    }
                },
                onkeydown: function (event) {
                    if (event.key === 'Delete' && editable &&
                            options.deletable !== false) {
                        toggleDelete(row);
                    }
                }}, '▸');
            row.marker = marker;
            var cells = columns.map(function (c) {
                if (c.type === 'display') {
                    var span = el('span');
                    row.controls[c.name] = {node: span, field: c,
                        get: function () {
                            return null;
                        },
                        set: function (v) {
                            span.textContent = c.format ? c.format(v, row) :
                                v === null || v === undefined ? '' :
                                    String(v);
                        }};
                    return el('td' + (c.num ? '.num' : ''), span);
                }
                var control = UI.fieldControl(c);
                control.field = c;
                row.controls[c.name] = control;
                var input = control.picker ? control.picker.input :
                    control.node;
                if (c.onchange) {
                    if (control.picker) {
                        var picker = control.picker;
                        var chosen = picker.value();
                        input.addEventListener('blur', function () {
                            global.setTimeout(function () {
                                if (picker.value() !== chosen) {
                                    chosen = picker.value();
                                    c.onchange(row, picker.record());
                                }
                            }, 200);
                        });
                    } else {
                        input.addEventListener('change', function () {
                            c.onchange(row);
                        });
                    }
                }
                return el('td' + (c.num ? '.num' : ''), c.width ? {style:
                    {width: c.width}} : null, control.node);
            });
            var tr = el('tr', marker, cells, options.extra ?
                el('td', options.extra(row)) : null);
            row.tr = tr;
            columns.forEach(function (c) {
                var v = row.data[c.name];
                row.controls[c.name].set(v === undefined ? (c.default !==
                    undefined ? c.default : null) : v);
            });
            rows.push(row);
            body.appendChild(tr);
            lockRow(row);
            if (options.onadd) {
                options.onadd(row);
            }
            return row;
        }
        function toggleDelete(row) {
            row.deleted = !row.deleted;
            row.tr.classList.toggle('jsp-deleted', row.deleted);
            if (options.onchange) {
                options.onchange();
            }
        }
        function lockRow(row) {
            columns.forEach(function (c) {
                var node = row.controls[c.name].node;
                Array.prototype.forEach.call(node.querySelectorAll ?
                    node.querySelectorAll('input, select, textarea, button') :
                    [], function (n) {
                    n.disabled = !editable || Boolean(c.readonly);
                });
                if (node.tagName === 'INPUT' || node.tagName === 'SELECT' ||
                        node.tagName === 'TEXTAREA') {
                    node.disabled = !editable || Boolean(c.readonly);
                }
            });
        }
        var addButton = el('button', {type: 'button', onclick: function () {
            var row = addRow(options.newRow ? options.newRow() : {});
            var first = row.tr.querySelector('input, select');
            if (first) {
                first.focus();
            }
        }}, options.addLabel || 'Add line');
        var node = el('div', el('div.table-wrap', el('table.data.jsp-lines',
            el('thead', el('tr', el('th.jsp-row', ''), columns.map(
                function (c) {
                    return el('th' + (c.num ? '.num' : ''), c.label);
                }), options.extra ? el('th', '') : null)), body)),
            el('div.toolbar', addButton, options.deletable === false ? null :
                el('span.muted', 'Select a row header and press Del to ' +
                    'mark the line for deletion.')));
        return {
            node: node,
            set: function (list) {
                UI.clear(body);
                rows = [];
                (list || []).forEach(addRow);
            },
            rows: function () {
                return rows;
            },
            addRow: addRow,
            /* The rows as values (deleted ones left out) */
            values: function () {
                return rows.filter(function (r) {
                    return !r.deleted;
                }).map(function (r) {
                    var v = Object.assign({}, r.data);
                    columns.forEach(function (c) {
                        if (c.type !== 'display' && !c.readonly) {
                            v[c.name] = r.controls[c.name].get();
                        }
                    });
                    return v;
                });
            },
            lock: function (on) {
                editable = on;
                addButton.hidden = !on;
                rows.forEach(lockRow);
            }
        };
    }

    /* A dialog with tabs of fields: tabs [{title, fields} | {title, node}],
     * returns Promise of the values (rejected on Cancel) */
    function tabDialog(title, tabs, data, editable) {
        return new Promise(function (resolve, reject) {
            var holder = el('div.jsp-dialog');
            var panes = tabs.map(function (t) {
                if (t.fields) {
                    var p = fieldsPane(t.fields);
                    p.set(data);
                    p.lock(editable);
                    return {title: t.title, node: p.node, pane: p};
                }
                return {title: t.title, node: t.node};
            });
            tabSet(holder, panes);
            UI.modal(title, holder, editable ? [
                {label: 'Cancel', onclick: function () {
                    reject({cancelled: true});
                }},
                {label: 'OK', primary: true, onclick: function () {
                    var values = Object.assign({}, data);
                    panes.forEach(function (p) {
                        if (p.pane) {
                            p.pane.get(values);
                        }
                    });
                    resolve(values);
                }}] : [{label: 'Close', primary: true, onclick: function () {
                    reject({cancelled: true});
                }}]);
        });
    }

    /* The value of a field control for the server: dates as ISO text,
     * numbers as numbers */
    function plain(value) {
        if (value && value.__class__ === 'date') {
            return value.year + '-' + String(value.month).padStart(2, '0') +
                '-' + String(value.day).padStart(2, '0');
        }
        if (value && value.__class__ === 'Decimal') {
            return value.decimal;
        }
        return value;
    }

    function plainValues(values) {
        var out = {};
        Object.keys(values).forEach(function (k) {
            var v = values[k];
            if (Array.isArray(v)) {
                out[k] = v.map(function (x) {
                    return x && typeof x === 'object' && !x.__class__ ?
                        plainValues(x) : plain(x);
                });
            } else if (v && typeof v === 'object' && !v.__class__ &&
                    v.id === undefined) {
                out[k] = plainValues(v);
            } else {
                out[k] = plain(v);
            }
        });
        return out;
    }

    /* Links tab (PO line / RFQ line): the work orders the line supplies */
    function linksGrid(editable) {
        var grid = editGrid([
            {name: 'production', label: 'Work Order', type: 'many2one',
                model: 'production', width: '22%'},
            {name: 'operation', label: 'Seq No', type: 'integer', num: true},
            {name: 'piece', label: 'Piece No', type: 'integer', num: true},
            {name: 'work', label: 'Operation (service)', type: 'many2one',
                model: 'production.work'},
            {name: 'quantity', label: 'Quantity', type: 'float', num: true},
            {name: 'received_quantity', label: 'Received Qty',
                type: 'display', num: true},
            {name: 'reference', label: 'Jobshop Link', type: 'char'}],
            {addLabel: 'Add link'});
        grid.lock(editable);
        return grid;
    }

    /* ======================================================================
     * Suppliers
     * ==================================================================== */

    var SUPPLIER_STATUSES = ['unreleased', 'firm', 'released', 'hold',
        'closed', 'cancelled'];

    /* Part Prices / Service Prices: the supplier's quotes */
    function pricesTab(kind, canWrite) {
        return function (pane, record) {
            function load() {
                Rpc.desk('js_supplier_prices', [record.id, kind]).then(
                    function (rows) {
                        UI.clear(pane);
                        var heads = kind === 'service' ? ['Service ID',
                            'Part ID', 'Supplier Service ID', 'Quoted',
                            'Description', 'Type', 'Prices'] : ['Part ID',
                            'Description', 'Purchase U/M',
                            'Supplier Part ID', 'Mfg Name', 'Mfg Part ID',
                            'Type', 'As Of', 'Expires', 'Prices'];
                        var cells = rows.map(function (r) {
                            var prices = r.prices.map(function (p) {
                                return (p.quantity ? (r.price_type === 'upto' ?
                                    '≤' : '≥') + num(p.quantity) :
                                    (r.price_type === 'upto' ? 'more' :
                                        'base')) + ': ' + num(p.unit_price);
                            }).join('  ');
                            var type = r.price_type === 'upto' ? 'Up-to-Qty' :
                                'Break';
                            return kind === 'service' ? [m2oText(r.product),
                                m2oText(r.service_part), r.code,
                                UI.date(r.quote_date), r.description, type,
                                prices] : [m2oText(r.product), r.description,
                                r.unit, r.code, r.mfg_name, r.mfg_part_id,
                                type, UI.date(r.as_of_date),
                                UI.date(r.expiration_date), prices];
                        });
                        pane.appendChild(table(heads, cells, {
                            onopen: function (i) {
                                edit(rows[i]);
                            },
                            oncontext: function (event, i) {
                                UI.contextMenu(event, [
                                    {label: canWrite ? 'Edit' : 'Open',
                                        onclick: function () {
                                            edit(rows[i]);
                                        }}].concat(canWrite ? [
                                    {label: 'Delete', onclick: function () {
                                        remove(rows[i]);
                                    }}] : []));
                            }}));
                        if (canWrite) {
                            pane.appendChild(el('div.toolbar', el('button', {
                                type: 'button', onclick: function () {
                                    edit({prices: [], price_type: 'break'});
                                }}, kind === 'service' ? 'Add service price' :
                                'Add part price')));
                        }
                    }, UI.showError);
            }
            function remove(row) {
                UI.confirm('Delete', 'Delete this quote of ' +
                    m2oText(row.product) + '?').then(function (ok) {
                    if (ok) {
                        Rpc.desk('js_supplier_price_delete', [[row.id]]).then(
                            load, UI.showError);
                    }
                });
            }
            function edit(row) {
                var breaks = editGrid([
                    {name: 'quantity', label: 'Quantity', type: 'float',
                        num: true},
                    {name: 'unit_price', label: 'Unit Price',
                        type: 'decimal', num: true}], {addLabel: 'Add row'});
                breaks.set(row.prices.length ? row.prices : [{}]);
                breaks.lock(canWrite);
                var fields = [
                    {name: 'product', label: kind === 'service' ?
                        'Service ID' : 'Part ID', type: 'many2one',
                        model: 'product.product', span: 2,
                        readonly: Boolean(row.id), domain: kind ===
                            'service' ? [['type', '=', 'service'],
                            ['purchasable', '=', true]] : [['type', '!=',
                            'service'], ['purchasable', '=', true]]},
                    {name: 'code', label: kind === 'service' ?
                        'Supplier Service ID' : 'Supplier Part ID',
                        type: 'char'}];
                if (kind === 'service') {
                    fields.push({name: 'service_part', label: 'Part ID',
                        type: 'many2one', model: 'product.product'});
                } else {
                    fields.push({name: 'mfg_name', label: 'Mfg Name',
                        type: 'char'}, {name: 'mfg_part_id',
                        label: 'Mfg Part ID', type: 'char'});
                }
                fields.push(
                    {name: 'price_type', label: 'Type', type: 'selection',
                        options: PRICE_TYPES},
                    {name: 'as_of_date', label: 'As Of', type: 'date'},
                    {name: 'expiration_date', label: 'Expires',
                        type: 'date'},
                    {name: 'quote_date', label: 'Quoted', type: 'date'},
                    {name: 'lead_time', label: 'Leadtime (days)',
                        type: 'integer'},
                    {name: 'minimum_quantity', label: 'Minimum Order Qty',
                        type: 'float'},
                    {name: 'multiple_quantity', label: 'Order in Multiples Of',
                        type: 'float'});
                tabDialog(kind === 'service' ? 'Service Price' : 'Part Price',
                    [{title: kind === 'service' ? 'Service Prices' :
                        'Part Prices', fields: fields},
                    {title: 'Quantities', node: el('div', el('p.muted',
                        'Break Table: the first row (no quantity) is the ' +
                        'base price, each row a price from its quantity ' +
                        'on. Up-to-Qty Table: a price up to each ' +
                        'quantity, the last row (no quantity) for any ' +
                        'quantity above.'), breaks.node)}], row,
                    canWrite).then(function (values) {
                    values = plainValues(values);
                    values.party = record.id;
                    values.prices = plainValues({p: breaks.values()}).p;
                    if (!values.product) {
                        UI.showError('Choose the ' + (kind === 'service' ?
                            'service.' : 'part.'));
                        return;
                    }
                    UI.service('js_supplier_price_save', values).then(
                        function () {
                            UI.toast('Price saved', 'ok');
                            load();
                        }, failed);
                }, function () {});
            }
            load();
        };
    }

    /* The supplier's purchase orders, Released unless the right-click
     * filter shows other statuses */
    function supplierPurchasesTab(pane, record) {
        var shown = ['released'];
        function load() {
            Rpc.desk('js_supplier_purchases', [record.id, shown]).then(
                function (rows) {
                    UI.clear(pane);
                    pane.appendChild(el('p.muted', 'Showing: ' +
                        shown.map(function (s) {
                            return PO_STATUS[s];
                        }).join(', ') + ' (right-click to filter)'));
                    var holder = table([{label: 'ID'}, 'Order Status',
                        'Order Date', 'Receive On Date', 'Promise Date',
                        {label: 'Order Amount', num: true},
                        {label: 'Received Amount', num: true},
                        'Last Recv Date'], rows.map(function (r) {
                            return [r.number, PO_STATUS[r.status] || r.status,
                                UI.date(r.purchase_date),
                                UI.date(r.delivery_date),
                                UI.date(r.promise_date),
                                UI.money(r.total_amount),
                                UI.money(r.received_amount),
                                UI.date(r.last_received_date)];
                        }), {onopen: function (i) {
                            UI.openScreen('purchase-orders/' + rows[i].id,
                                'PO ' + rows[i].number);
                        }, oncontext: filter, empty: 'No purchase order.'});
                    holder.addEventListener('contextmenu', filter);
                    pane.appendChild(holder);
                }, UI.showError);
        }
        function filter(event) {
            UI.contextMenu(event, SUPPLIER_STATUSES.map(function (s) {
                var on = shown.indexOf(s) >= 0;
                return {label: (on ? '✔ ' : '   ') + PO_STATUS[s],
                    onclick: function () {
                        if (on) {
                            shown = shown.filter(function (x) {
                                return x !== s;
                            });
                        } else {
                            shown.push(s);
                        }
                        if (!shown.length) {
                            shown = ['released'];
                        }
                        load();
                    }};
            }));
        }
        load();
    }

    function supplierBills(pane, record) {
        Rpc.searchRead('account.invoice', [['party', '=', record.id],
            ['type', '=', 'in']], ['number', 'invoice_date', 'reference',
            'state', 'total_amount', 'amount_to_pay'], {limit: 200, order:
            [['id', 'DESC']]}).then(function (rows) {
            pane.appendChild(table(['Number', 'Date', 'Reference', 'Status',
                {label: 'Total', num: true}, {label: 'Open', num: true}],
                rows.map(function (r) {
                    return [r.number, UI.date(r.invoice_date), r.reference,
                        r.state, UI.money(r.total_amount),
                        UI.money(r.amount_to_pay)];
                }), {onopen: function (i) {
                    UI.openRecord('account.invoice', rows[i].id,
                        rows[i].number);
                }, empty: 'No bill.'}));
        }, UI.showError);
    }

    Screens.jsSupplierWindow = function (main, params) {
        css();
        rights(['purchase.product_supplier', 'purchase.purchase']).then(
            function (r) {
            var canPrices = r['purchase.product_supplier'].write &&
                r['purchase.product_supplier'].create;
            var canPo = r['purchase.purchase'].create;
            UI.master(main, {
                title: 'Suppliers',
                model: 'party.party',
                label: 'Supplier ID',
                domain: [['is_supplier', '=', true]],
                order: [['code', 'ASC'], ['name', 'ASC']],
                open: params && params[0] ? parseInt(params[0], 10) : null,
                defaults: {is_supplier: true, supplier_open_date:
                    Rpc.date(UI.today())},
                tabs: [
                    {title: 'Suppliers', fields: [
                        {name: 'code', label: 'Supplier ID', type: 'char'},
                        {name: 'supplier_inactive', label: 'Inactive',
                            type: 'boolean', default: false},
                        {name: 'name', label: 'Name', type: 'char', span: 2},
                        {name: 'supplier_address_1', label: 'Address',
                            type: 'char', span: 2},
                        {name: 'supplier_address_2', label: '(Address 2)',
                            type: 'char', span: 2},
                        {name: 'supplier_city', label: 'City', type: 'char'},
                        {name: 'supplier_state', label: 'State',
                            type: 'char'},
                        {name: 'supplier_postal_code', label: 'Postal Code',
                            type: 'char'},
                        {name: 'supplier_country', label: 'Country',
                            type: 'char'},
                        {name: 'supplier_address_etc', label: 'Etc.',
                            type: 'char', span: 2},
                        {name: 'supplier_contact', label: 'Contact Name',
                            type: 'char'},
                        {name: 'supplier_contact_title', label: 'Title',
                            type: 'char'},
                        {name: 'supplier_phone', label: 'Phone',
                            type: 'char'},
                        {name: 'supplier_fax', label: 'Fax', type: 'char'},
                        {name: 'supplier_email', label: 'Contact E-Mail',
                            type: 'char'},
                        {name: 'supplier_web_url', label: 'Web URL',
                            type: 'char'}]},
                    {title: 'Account', fields: [
                        {name: 'supplier_open_date', label:
                            'Account Opened Date', type: 'date'},
                        {name: 'supplier_exported', label: 'Exported',
                            type: 'boolean'},
                        {name: 'supplier_exported_date', label: 'Date',
                            type: 'date', readonly: true},
                        {name: 'supplier_last_order_date', label:
                            'Last Order Date', type: 'date', readonly: true},
                        {name: 'supplier_our_customer_id', label:
                            'Our Customer ID', type: 'char'},
                        {name: 'supplier_buyer', label: 'Buyer',
                            type: 'char'},
                        {name: 'supplier_fob_point', label: 'FOB Point',
                            type: 'many2one', model: 'nline.fob_point'},
                        {name: 'supplier_ship_via', label: 'Ship Via',
                            type: 'many2one', model: 'nline.ship_via'},
                        {name: 'supplier_payment_term', label: 'Terms ID',
                            type: 'many2one',
                            model: 'account.invoice.payment_term'},
                        {name: 'supplier_freight_terms', label:
                            'Freight Terms', type: 'selection',
                            options: FREIGHT},
                        {name: 'supplier_tax_group', label: 'Tax Group ID',
                            type: 'many2one', model: 'account.tax',
                            domain: TAX_GROUP_DOMAIN},
                        {name: 'supplier_tax_id_number', label:
                            'Tax ID Number', type: 'char'},
                        {name: 'supplier_tax_exempt', label: 'Tax Exempt',
                            type: 'boolean'},
                        {name: 'supplier_expense_account', label:
                            'Expense Acct ID', type: 'many2one',
                            model: 'account.account', domain: [['type',
                                '!=', null], ['closed', '!=', true]]},
                        {name: 'account_payable', label:
                            'Payable Account ID', type: 'many2one',
                            model: 'account.account', domain: [
                                ['type.payable', '=', true],
                                ['closed', '!=', true]]},
                        {name: 'payable', label: 'Open balance',
                            type: 'money', readonly: true}]},
                    {title: 'Addresses', lines: {name: 'addresses',
                        model: 'party.address', inverse: 'party',
                        order: [['sequence', 'ASC'], ['id', 'ASC']],
                        fields: [
                            {name: 'party_name', label: 'Name',
                                type: 'char'},
                            {name: 'street', label: 'Address 1 / 2 / Etc.',
                                type: 'text', rows: 2},
                            {name: 'city', label: 'City', type: 'char'},
                            {name: 'subdivision', label: 'State',
                                type: 'many2one',
                                model: 'country.subdivision'},
                            {name: 'postal_code', label: 'Postal Code',
                                type: 'char'},
                            {name: 'country', label: 'Country',
                                type: 'many2one', model: 'country.country'},
                            {name: 'site_contact_name', label: 'Contact Name',
                                type: 'char'},
                            {name: 'site_contact_title', label:
                                'Contact Title', type: 'char'},
                            {name: 'site_contact_phone', label:
                                'Contact Phone', type: 'char'},
                            {name: 'site_contact_fax', label: 'Contact Fax',
                                type: 'char'},
                            {name: 'site_contact_email', label:
                                'Contact E-Mail', type: 'char'}]}},
                    {title: 'Part Prices', render: pricesTab('part',
                        canPrices)},
                    {title: 'Service Prices', render: pricesTab('service',
                        canPrices)},
                    {title: 'Specs', fields: [
                        {name: 'supplier_specifications', label:
                            'Specifications (copied to the purchase ' +
                            'orders)', type: 'text', span: 4, rows: 8},
                        {name: 'supplier_rfq_instructions', label:
                            'Special instructions for requests for quote',
                            type: 'text', span: 2, rows: 4},
                        {name: 'supplier_po_instructions', label:
                            'Special instructions for purchase orders',
                            type: 'text', span: 2, rows: 4}]},
                    {notes: true},
                    {title: 'Purchase Orders', render: supplierPurchasesTab},
                    {title: 'Invoices', render: supplierBills}
                ],
                browse: [
                    {name: 'code', label: 'Supplier ID'},
                    {name: 'name', label: 'Name'},
                    {name: 'supplier_address_1', label: 'Address 1'},
                    {name: 'supplier_address_2', label: 'Address 2'},
                    {name: 'supplier_city', label: 'City'},
                    {name: 'supplier_state', label: 'State'},
                    {name: 'supplier_postal_code', label: 'Postal Code'}],
                extra: [
                    {label: 'Web URL', onclick: function (record) {
                        if (record && record.supplier_web_url) {
                            var url = record.supplier_web_url;
                            global.open(/^https?:/i.test(url) ? url :
                                'http://' + url, '_blank', 'noopener');
                        }
                    }},
                    canPo ? {label: 'New PO', onclick: function (record) {
                        UI.openScreen('purchase-orders/new' + (record ?
                            '?supplier=' + record.id : ''), 'New PO');
                    }} : null].filter(Boolean),
                beforeSave: function (values) {
                    delete values.payable;
                    if (!values.code) {
                        delete values.code;
                    }
                    return values;
                }
            });
        }, UI.showError);
    };

    /* ======================================================================
     * Document windows (PO, RFQ, receivers, tax groups): an ID lookup,
     * tabs, Save / Clear / Delete, Browse, loaded and saved through desk
     * RPCs
     * ==================================================================== */

    /* docWindow(main, {title, model, label, domain, order, load(id) ->
     * Promise data, save(values) -> Promise data, remove(data) -> Promise,
     * tabs [{title, fields} | {title, render(pane, data, api) -> {get(values),
     * lock(on)}}], browse [columns], extra [{label, onclick(data, api)}],
     * defaults() -> data, onshow(data, api), writeModel, openId, title(data)}
     */
    function docWindow(main, o) {
        css();
        var data = null;
        var access = {create: false, write: false, 'delete': false};
        var dirty = false;
        var extra = (o.extra || []).map(function (item) {
            return {label: item.label, title: item.title, onclick: function () {
                item.onclick(data, api);
            }};
        });
        if (o.remove) {
            extra.push({label: 'Delete', title: 'Delete Document',
                onclick: function () {
                    remove();
                }});
        }
        var form = UI.form(main, {title: o.title, extra: extra,
            onClear: function () {
                clear();
            }, onSave: o.save ? function (andNew) {
                return save(andNew);
            } : null});
        var body = form.body;
        var id = UI.picker(o.model, {label: o.label, placeholder: o.label,
            domain: o.domain, order: o.order, onselect: function (r) {
                load(r.id);
            }});
        var status = el('span.jsp-status', '');
        var head = el('div.panel.jsp-head', el('label.field', o.label),
            id.node, navButtons(o.model, o.domain, o.order, function () {
                return data ? data.id : null;
            }, load), status, o.headExtra || null);
        body.appendChild(head);
        var holder = el('div');
        body.appendChild(holder);
        var built = (o.tabs || []).map(function (t) {
            if (t.fields) {
                var p = fieldsPane(t.fields);
                var under = t.render ? el('div.jsp-sub') : null;
                return {title: t.title, node: el('div', p.node, under),
                    pane: p, spec: t, renderNode: under};
            }
            return {title: t.title, node: el('div'), spec: t};
        });
        var browse = o.browse ? browseTab(o.model, o.browse, {
            domain: o.domain, order: o.order, open: function (rid) {
                load(rid);
                tabs.show(0);
            }}) : null;
        if (browse) {
            built.push({title: 'Browse', node: browse.node,
                onshow: browse.onshow});
        }
        var tabs = tabSet(holder, built);
        var api = {
            data: function () {
                return data;
            },
            reload: function () {
                return data ? load(data.id) : null;
            },
            show: function (d) {
                show(d);
            },
            editable: function () {
                return editable();
            },
            access: function () {
                return access;
            },
            select: function (title) {
                tabs.select(title);
            },
            changed: function () {
                dirty = true;
            },
            controls: function () {
                var all = {};
                built.forEach(function (b) {
                    if (b.pane) {
                        Object.assign(all, b.pane.controls);
                    }
                });
                return all;
            },
            form: form
        };

        function editable() {
            var allowed = data ? access.write : access.create;
            return Boolean(allowed && (!o.editable || o.editable(data)));
        }

        function lock() {
            var on = editable();
            built.forEach(function (b) {
                if (b.pane) {
                    b.pane.lock(on);
                    if (o.lockField) {
                        Object.keys(b.pane.controls).forEach(function (n) {
                            var off = o.lockField(n, data);
                            if (off) {
                                Array.prototype.forEach.call(
                                    b.pane.controls[n].node.querySelectorAll ?
                                    b.pane.controls[n].node.querySelectorAll(
                                        'input, select, textarea, button') :
                                    [], function (x) {
                                        x.disabled = true;
                                    });
                                if (/^(INPUT|SELECT|TEXTAREA)$/.test(
                                        b.pane.controls[n].node.tagName)) {
                                    b.pane.controls[n].node.disabled = true;
                                }
                            }
                        });
                    }
                }
                if (b.state && b.state.lock) {
                    b.state.lock(on, data);
                }
            });
            var hidden = [];
            if (!(access['delete'] && data && (!o.deletable ||
                    o.deletable(data)))) {
                hidden.push('Delete');
            }
            (o.extra || []).forEach(function (item) {
                if (item.visible && !item.visible(data, access)) {
                    hidden.push(item.label);
                }
            });
            form.allow(on, hidden);
        }

        function show(d) {
            data = d;
            dirty = false;
            id.set(d && d.id ? d.id : null, d ? (o.recName ? o.recName(d) :
                d.number || d.name || '') : '');
            built.forEach(function (b) {
                if (b.pane) {
                    b.pane.set(d || (o.defaults ? o.defaults() : {}));
                }
                if (b.spec && b.spec.render) {
                    b.state = b.spec.render(UI.clear(b.renderNode || b.node),
                        d, api) || null;
                }
            });
            if (o.status) {
                var s = o.status(d);
                status.textContent = s ? s[1] : '';
                status.className = 'jsp-status' + (s ? ' st-' + s[0] : '');
                status.hidden = !s;
            }
            if (o.onshow) {
                o.onshow(d, api);
            }
            if (d && d.id && o.titleOf) {
                UI.setTitle(o.titleOf(d));
            }
            lock();
        }

        function load(rid) {
            return o.load(rid).then(show, UI.showError);
        }

        function clear() {
            show(null);
        }

        function collect() {
            var values = data ? Object.assign({}, {id: data.id}) : {};
            built.forEach(function (b) {
                if (b.pane) {
                    b.pane.get(values);
                }
                if (b.state && b.state.get) {
                    b.state.get(values);
                }
            });
            return plainValues(values);
        }

        function save(andNew) {
            if (!editable()) {
                return;
            }
            var values = collect();
            if (o.check) {
                var problem = o.check(values, data);
                if (problem) {
                    UI.showError(problem);
                    return;
                }
            }
            return Promise.resolve(o.save(values, data)).then(function (d) {
                UI.toast(o.title + ' saved', 'ok');
                if (andNew) {
                    clear();
                } else if (d) {
                    show(d);
                }
                if (browse) {
                    browse.reload();
                }
                return d;
            }, failed);
        }

        function remove() {
            if (!data) {
                return;
            }
            UI.confirm('Delete Document', 'Delete ' + o.title + ' ' +
                (data.number || data.name || '') + '? It cannot be ' +
                'recovered.').then(function (ok) {
                if (ok) {
                    o.remove(data).then(function () {
                        UI.toast('Deleted', 'ok');
                        clear();
                        if (browse) {
                            browse.reload();
                        }
                    }, UI.showError);
                }
            });
        }

        api.save = save;
        keys(head, function () {
            save(false);
        }, function () {
            if (data) {
                load(data.id);
            }
        });
        clear();
        rights(o.rights || [o.model]).then(function (r) {
            var a = r[o.writeModel || o.model];
            access = {create: a.create, write: a.write, 'delete': a['delete']};
            (o.rights || []).forEach(function (m) {
                access[m] = r[m];
            });
            if (o.openId) {
                load(o.openId);
            } else {
                show(data);
            }
        }, UI.showError);
        return api;
    }

    /* ======================================================================
     * Purchase Orders
     * ==================================================================== */

    /* The PO Line window: Purchase Order Line, Overrides, Specs, Links */
    function poLineDialog(row, editable, linesEditable, supplier) {
        var d = Object.assign({}, row.data, {}, valuesOfRow(row));
        var links = linksGrid(editable);
        links.set(d.js_links || []);
        return tabDialog('Purchase Order Line ' + (d.sequence || ''), [
            {title: 'Purchase Order Line', fields: [
                {name: 'line_type', label: 'PO Line Type', type: 'selection',
                    options: LINE_TYPES, readonly: !linesEditable},
                {name: 'product', label: d.line_type === 'service' ?
                    'Service ID' : 'Part ID', type: 'many2one',
                    model: 'product.product', span: 2, readonly: true},
                {name: 'description', label: 'Description', type: 'text',
                    span: 2, rows: 2, readonly: !linesEditable},
                {name: 'supplier_part_code', label: d.line_type ===
                    'service' ? 'Supplier Service ID' : 'Supplier Part ID',
                    type: 'char'},
                {name: 'mfg_name', label: 'Mfg Name', type: 'char'},
                {name: 'mfg_part_id', label: 'Mfg Part ID', type: 'char'},
                {name: 'quantity', label: 'Order Qty', type: 'float',
                    readonly: !linesEditable},
                {name: 'unit', label: 'Purchase U/M', type: 'many2one',
                    model: 'product.uom', readonly: true},
                {name: 'unit_price', label: 'Unit Price', type: 'decimal',
                    readonly: !linesEditable},
                {name: 'fixed_charge', label: 'Fixed Charge',
                    type: 'decimal', readonly: !linesEditable},
                {name: 'trade_discount', label: 'Trade Discount %',
                    type: 'decimal', readonly: !linesEditable},
                {name: 'received', label: 'Received Quantity', type: 'float',
                    readonly: true}]},
            {title: 'Overrides', fields: [
                {name: 'product_code', label: 'Product Code ID',
                    type: 'many2one', model: 'nline.product_code'},
                {name: 'commodity_code', label: 'Commodity Code ID',
                    type: 'many2one', model: 'nline.commodity_code'},
                {name: 'receive_date', label: 'Recv Date', type: 'date',
                    readonly: !linesEditable},
                {name: 'promise_date', label: 'Promise Date', type: 'date'},
                {name: 'last_received_date', label: 'Last Received Date',
                    type: 'date', readonly: true},
                {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                    model: 'account.tax', domain: TAX_GROUP_DOMAIN,
                    readonly: !linesEditable},
                {name: 'expense_account', label: 'Expense G/L Account ID',
                    type: 'many2one', model: 'account.account',
                    domain: [['type', '!=', null], ['closed', '!=', true]]},
                {name: 'line_closed', label: 'Line Status: Closed',
                    type: 'boolean'}]},
            {title: 'Specs', fields: [
                {name: 'specifications', label: 'Specifications (print on ' +
                    'the purchase order)', type: 'text', span: 4, rows: 10}]},
            {title: 'Links', node: el('div', el('p.muted', 'The work ' +
                'orders this line supplies. The link quantities cannot ' +
                'exceed the line quantity.'), links.node,
                (d.work_links || []).length ? el('div.jsp-sub',
                    el('h3', 'Outside operations bought by this line'),
                    table(['Work Order', 'Operation', 'Status'],
                        d.work_links.map(function (k) {
                            return ['WO ' + k.number, k.operation, k.state];
                        }))) : null,
                (d.planning_links || []).length ? el('div.jsp-sub',
                    el('h3', 'Material cards linked by Material Planning'),
                    table(['Work Order', 'Material Card',
                        {label: 'Quantity', num: true}],
                        d.planning_links.map(function (k) {
                            return [m2oText(k.production), k.card,
                                num(k.quantity)];
                        }))) : null)}
        ], d, editable).then(function (values) {
            values.links = plainValues({l: links.values()}).l;
            return values;
        });
    }

    function valuesOfRow(row) {
        var out = {};
        Object.keys(row.controls).forEach(function (name) {
            var c = row.controls[name];
            if (c.field.type !== 'display') {
                var v = c.get();
                if (c.field.type === 'many2one') {
                    var rec = c.picker && c.picker.record();
                    v = v ? {id: v, rec_name: rec ? rec.rec_name : ''} : null;
                }
                out[name] = plain(v);
            }
        });
        return out;
    }

    function applyToRow(row, values) {
        Object.keys(values).forEach(function (name) {
            if (row.controls[name] && row.controls[name].field.type !==
                    'display') {
                row.controls[name].set(values[name]);
            }
        });
        row.data = Object.assign({}, row.data, values);
    }

    function lineAmount(v) {
        var qty = parseNum(v.quantity) || 0;
        var price = parseNum(v.unit_price) || 0;
        var disc = parseNum(v.trade_discount) || 0;
        var fixed = parseNum(v.fixed_charge) || 0;
        return Math.round((qty * price * (1 - disc / 100) + fixed) * 100) /
            100;
    }

    /* The line item table of a purchase order */
    function poLines(pane, data, api) {
        var supplier = function () {
            var c = api.controls().party;
            return c ? c.get() : null;
        };
        var totals = el('div.jsp-totals');
        var grid = editGrid([
            {name: 'sequence', label: 'Line No', type: 'integer', num: true,
                width: '56px'},
            {name: 'line_type', label: 'PO Line Type', type: 'selection',
                options: LINE_TYPES, default: 'part'},
            {name: 'quantity', label: 'Order Qty', type: 'float', num: true,
                default: 1, onchange: function (row) {
                    reprice(row);
                }},
            {name: 'product', label: 'Part ID / Service ID',
                type: 'many2one', model: 'product.product', width: '20%',
                domain: [['purchasable', '=', true]],
                onchange: function (row, record) {
                    choose(row, record);
                }},
            {name: 'description', label: 'Description', type: 'char'},
            {name: 'unit', label: 'Purchase U/M', type: 'display',
                format: function (v) {
                    return m2oText(v);
                }},
            {name: 'unit_price', label: 'Unit Price', type: 'decimal',
                num: true, onchange: update},
            {name: 'trade_discount', label: 'Disc %', type: 'decimal',
                num: true, onchange: update},
            {name: 'fixed_charge', label: 'Fixed Charge', type: 'decimal',
                num: true, onchange: update},
            {name: 'line_status', label: 'Line Status', type: 'display'},
            {name: 'amount', label: 'Extension', type: 'display', num: true,
                format: function (v, row) {
                    return UI.money(lineAmount(valuesOfRow(row)));
                }},
            {name: 'received', label: 'Received', type: 'display', num: true,
                format: function (v) {
                    return v ? num(v) : '';
                }},
            {name: 'expense_account', label: 'Exp Acct ID',
                type: 'many2one', model: 'account.account',
                domain: [['type', '!=', null], ['closed', '!=', true]]}
        ], {
            onopen: function (row) {
                var linesEditable = !data || data.lines_editable;
                poLineDialog(row, api.editable(), linesEditable,
                    supplier()).then(function (values) {
                    applyToRow(row, values);
                    update();
                }, function () {});
            },
            onchange: update,
            newRow: function () {
                var rows = grid.rows();
                var last = rows.length ? (rows[rows.length - 1].controls
                    .sequence.get() || rows.length) : 0;
                return {sequence: last + 1, line_type: 'part', quantity: 1};
            }
        });
        function update() {
            var sum = 0;
            grid.rows().forEach(function (row) {
                row.controls.amount.set(null);
                if (!row.deleted) {
                    sum += lineAmount(valuesOfRow(row));
                }
            });
            var tax = data ? data.tax_amount : 0;
            UI.clear(totals).appendChild(el('span', 'Lines ',
                el('strong', UI.money(sum, true))));
            totals.appendChild(el('span', 'Tax ', el('strong',
                UI.money(tax || 0, true))));
            totals.appendChild(el('span', 'Total ', el('strong',
                UI.money(sum + (tax || 0), true))));
            if (data && Math.abs(sum - (data.untaxed_amount || 0)) > 0.005) {
                totals.appendChild(el('span.muted', '(tax as saved)'));
            }
        }
        function choose(row, record) {
            if (!record) {
                return;
            }
            Rpc.desk('js_supplier_price', [supplier(), record.id,
                row.controls.quantity.get() || 1, null]).then(function (q) {
                row.controls.description.set(q.description);
                row.controls.line_type.set(q.line_type);
                row.controls.unit.set(q.unit);
                row.data.unit = q.unit;
                if (q.unit_price !== null) {
                    row.controls.unit_price.set(q.unit_price);
                }
                row.data.supplier_part_code = q.code;
                row.data.mfg_name = q.mfg_name;
                row.data.mfg_part_id = q.mfg_part_id;
                if (q.minimum_quantity && (row.controls.quantity.get() ||
                        0) < q.minimum_quantity) {
                    UI.toast('Minimum order quantity of ' +
                        record.rec_name + ': ' + num(q.minimum_quantity));
                }
                update();
            }, UI.showError);
        }
        function reprice(row) {
            var product = row.controls.product.get();
            if (product && supplier()) {
                Rpc.desk('js_supplier_price', [supplier(), product,
                    row.controls.quantity.get() || 1, null]).then(
                    function (q) {
                        if (q.unit_price !== null) {
                            row.controls.unit_price.set(q.unit_price);
                        }
                        update();
                    }, UI.showError);
            } else {
                update();
            }
        }
        grid.set(data ? data.lines.map(function (l) {
            /* (links: the outside operations the line buys, shown) */
            return Object.assign({}, l, {unit_price: l.list_unit_price,
                line_status: l.line_status === 'closed' ? 'Closed' :
                    'Open', work_links: l.links, links: undefined});
        }) : []);
        if (!data) {
            grid.addRow({sequence: 1, line_type: 'part', quantity: 1});
        }
        pane.appendChild(grid.node);
        pane.appendChild(totals);
        update();
        return {
            get: function (values) {
                values.lines = grid.values().filter(function (v) {
                    return v.product || v.description;
                }).map(function (v) {
                    v.links = v.links || (v.js_links || []).map(function (k) {
                        return {id: k.id, production: k.production,
                            operation: k.operation, piece: k.piece,
                            work: k.work, quantity: k.quantity,
                            reference: k.reference};
                    });
                    delete v.js_links;
                    delete v.planning_links;
                    delete v.work_links;
                    delete v.amount;
                    delete v.received;
                    delete v.line_status;
                    return plainValues(v);
                });
            },
            lock: function (on, d) {
                grid.lock(on && (!d || d.lines_editable));
            }
        };
    }

    function poTaxes(pane, data) {
        if (!data) {
            pane.appendChild(el('p.muted', 'Save the purchase order first.'));
            return null;
        }
        pane.appendChild(table(['Tax Group ID', 'Tax Name', 'Description',
            'Account ID', {label: 'Tax Percent', num: true},
            {label: 'Tax Amount', num: true}], data.taxes.map(function (t) {
                return [t.tax_group, t.name, t.description, t.account,
                    num(t.percent), UI.money(t.amount)];
            }), {empty: 'No tax: choose a Tax Group on the Details tab ' +
                '(or on a line\'s Overrides).'}));
        return null;
    }

    function poReceivers(pane, data) {
        if (!data) {
            pane.appendChild(el('p.muted', 'Save the purchase order first.'));
            return null;
        }
        var shown = {approved: true, unapproved: true, cancelled: true};
        function render() {
            UI.clear(pane);
            var rows = data.receivers.filter(function (r) {
                return shown[r.status];
            });
            var holder = table(['ID', 'Status', 'Type', 'Received Date',
                {label: 'Received Amount', num: true}, 'Invoice ID',
                'Invoiced Date'], rows.map(function (r) {
                    return [r.number, (RECEIVER_STATUS.filter(function (s) {
                        return s[0] === r.status;
                    })[0] || [0, r.status])[1], r.kind === 'return' ?
                        'Return' : 'Receipt', UI.date(r.date),
                        UI.money(r.amount), r.supplier_invoice,
                        UI.date(r.invoiced_date)];
                }), {onopen: function (i) {
                    UI.openScreen('receiving?' + rows[i].kind + '=' +
                        rows[i].id, 'Receiver ' + rows[i].number);
                }, empty: 'No receiver yet.'});
            holder.addEventListener('contextmenu', function (event) {
                UI.contextMenu(event, RECEIVER_STATUS.map(function (s) {
                    return {label: (shown[s[0]] ? '✔ ' : '   ') + s[1],
                        onclick: function () {
                            shown[s[0]] = !shown[s[0]];
                            render();
                        }};
                }));
            });
            pane.appendChild(holder);
        }
        render();
        return null;
    }

    function purchaseFrom(pane, data, api) {
        var block = el('div');
        var address = UI.picker('party.address', {label: 'Address',
            placeholder: 'The supplier\'s address',
            onselect: function () {
                api.changed();
            }});
        function refresh() {
            UI.clear(block);
            if (data && data.purchase_from) {
                block.appendChild(addressBlock(data.purchase_from));
            } else {
                block.appendChild(el('p.muted', 'The supplier\'s name and ' +
                    'address appear here.'));
            }
        }
        if (data && data.invoice_address) {
            address.set(data.invoice_address.id,
                data.invoice_address.rec_name);
        }
        pane.appendChild(el('div.grid-form', el('div', {style: {gridColumn:
            'span 2'}}, el('label.field', 'Purchase from address'),
            address.node)));
        pane.appendChild(el('div.jsp-sub', block));
        refresh();
        return {
            get: function (values) {
                if (address.value()) {
                    values.invoice_address = address.value();
                }
            },
            lock: function (on, d) {
                address.input.disabled = !on || Boolean(d &&
                    !d.lines_editable);
            }
        };
    }

    function shipToRender(pane, data) {
        var tab = shipToTab(true);
        tab.set(data);
        pane.appendChild(tab.node);
        return {get: tab.get, lock: function (on) {
            tab.lock(on);
        }};
    }

    function changeStatus(data, api, status) {
        if (!data) {
            return;
        }
        var go = function () {
            UI.service('js_po_status', data.id, [status]).then(function (d) {
                UI.toast('PO ' + d.number + ' ' + PO_STATUS[d.jobshop_status],
                    'ok');
                api.show(d);
            }, failed);
        };
        if (status === 'cancelled' || status === 'closed') {
            UI.confirm('Change Status', 'Set purchase order ' + data.number +
                ' to ' + PO_STATUS[status] + '?' + (status === 'closed' ?
                    ' What is not received yet is not expected any more.' :
                    '')).then(function (ok) {
                if (ok) {
                    go();
                }
            });
        } else {
            go();
        }
    }

    Screens.jsPurchaseOrder = function (main, params) {
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var query = (global.location.hash.split('?')[1] || '');
        var preset = /(?:^|&)supplier=(\d+)/.exec(query);
        var statusButton = el('button', {type: 'button', title:
            'Change Status', hidden: true}, 'Change Status ▾');
        var api = docWindow(main, {
            title: 'Purchase Order',
            model: 'purchase.purchase',
            label: 'Order ID',
            order: [['purchase_date', 'DESC'], ['id', 'DESC']],
            rights: ['purchase.purchase', 'purchase.line',
                'stock.shipment.in'],
            openId: openId,
            headExtra: statusButton,
            load: function (id) {
                return Rpc.desk('js_po_get', [id]);
            },
            save: function (values, data) {
                return UI.service('js_po_save', values);
            },
            remove: function (data) {
                return Rpc.desk('js_po_delete', [data.id]);
            },
            deletable: function (data) {
                return data && data.deletable;
            },
            editable: function (data) {
                return !data || data.editable;
            },
            lockField: function (name, data) {
                /* A released order keeps its supplier, dates and terms */
                return data && !data.lines_editable && ['party',
                    'purchase_date', 'delivery_date', 'payment_term',
                    'reference', 'description', 'number'].indexOf(name) >= 0;
            },
            status: function (data) {
                var s = data ? data.jobshop_status : 'unreleased';
                return [s, PO_STATUS[s]];
            },
            titleOf: function (data) {
                return 'PO ' + data.number;
            },
            onshow: function (data, a) {
                /* Change Status: only when the order may change */
                statusButton.hidden = !(data && data.statuses &&
                    data.statuses.length && a.access().write);
            },
            check: function (values) {
                if (!values.party) {
                    return 'Choose the Supplier ID.';
                }
                return null;
            },
            defaults: function () {
                return {purchase_date: UI.today(), delivery_date: UI.today()};
            },
            tabs: [
                {title: 'Purchase Order', fields: [
                    {name: 'number', label: 'Order ID (blank: next number)',
                        type: 'char'},
                    {name: 'party', label: 'Supplier ID', type: 'many2one',
                        model: 'party.party', domain: SUPPLIER_DOMAIN,
                        span: 2},
                    {name: 'purchase_date', label: 'Order Date',
                        type: 'date'},
                    {name: 'delivery_date', label: 'Receive On Date',
                        type: 'date'},
                    {name: 'reference', label: 'Supplier Quote Ref',
                        type: 'char'},
                    {name: 'description', label: 'Memo', type: 'char',
                        span: 2}], render: poLines},
                {title: 'Details', fields: [
                    {name: 'promise_date', label: 'Promise Date',
                        type: 'date'},
                    {name: 'printed_date', label: 'Printed Date',
                        type: 'char', readonly: true},
                    {name: 'last_received_date', label: 'Last Received Date',
                        type: 'date', readonly: true},
                    {name: 'buyer', label: 'Buyer', type: 'char'},
                    {name: 'fob_point', label: 'FOB Point ID',
                        type: 'many2one', model: 'nline.fob_point'},
                    {name: 'ship_via', label: 'Ship Via ID',
                        type: 'many2one', model: 'nline.ship_via'},
                    {name: 'tax_group', label: 'Tax Group ID',
                        type: 'many2one', model: 'account.tax',
                        domain: TAX_GROUP_DOMAIN},
                    {name: 'payment_term', label: 'Terms ID',
                        type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'freight_terms', label: 'Freight Terms',
                        type: 'selection', options: FREIGHT},
                    {name: 'payable_account', label: 'Payable Acct ID',
                        type: 'many2one', model: 'account.account',
                        domain: [['type.payable', '=', true],
                            ['closed', '!=', true]]},
                    {name: 'rfq', label: 'Request for Quote',
                        type: 'many2one', model: 'nline.rfq',
                        readonly: true}]},
                {title: 'Purchase From', render: purchaseFrom},
                {title: 'Ship To', render: shipToRender},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications (print ' +
                        'on the purchase order, saved only on this order)',
                        type: 'text', span: 4, rows: 12}]},
                {title: 'Taxes', render: poTaxes},
                {title: 'Receivers', render: poReceivers}
            ],
            browse: [
                {name: 'number', label: 'Order ID'},
                {name: 'party', label: 'Supplier', type: 'many2one'},
                {name: 'purchase_date', label: 'Order Date', type: 'date'},
                {name: 'jobshop_status', label: 'Status',
                    labels: PO_STATUS},
                {name: 'total_amount', label: 'Total', type: 'money'}],
            extra: [
                {label: 'Print', title: 'Print the purchase order',
                    visible: function (data) {
                        return Boolean(data);
                    },
                    onclick: function (data) {
                        if (!data) {
                            return;
                        }
                        Rpc.desk('js_po_printed', [data.id]).then(
                            function () {
                                return Rpc.report('purchase.purchase',
                                    [data.id]);
                            }).then(function (r) {
                                UI.openReport(r, 'Purchase Order');
                                api.reload();
                            }, UI.showError);
                    }},
                {label: 'Receive', title: 'Open Receiving for this order',
                    visible: function (data, access) {
                        return Boolean(data && data.jobshop_status ===
                            'released' && access['stock.shipment.in'] &&
                            access['stock.shipment.in'].create);
                    },
                    onclick: function (data) {
                        UI.openScreen('receiving?purchase=' + data.id,
                            'Receiving');
                    }},
                {label: 'Copy', title: 'Copy to a new purchase order',
                    visible: function (data, access) {
                        return Boolean(data && access.create);
                    },
                    onclick: function (data, a) {
                        var copy = Object.assign({}, data, {id: null,
                            number: '', jobshop_status: 'unreleased',
                            lines_editable: true, editable: true,
                            receivers: [], taxes: [], printed_date: null,
                            last_received_date: null,
                            lines: data.lines.map(function (l) {
                                return Object.assign({}, l, {id: null,
                                    received: 0, line_status: 'open',
                                    js_links: []});
                            })});
                        a.show(copy);
                        UI.toast('Copied: save to make the new order');
                    }}]
        });
        /* Jobshop: choosing the supplier fills the terms, buyer, FOB, ship
         * via, tax group, specs, and shows its purchasing instructions */
        var controls = api.controls();
        var partyPicker = controls.party.picker;
        var lastParty = null;
        partyPicker.input.addEventListener('blur', function () {
            global.setTimeout(function () {
                var party = partyPicker.value();
                if (!party || party === lastParty || (api.data() &&
                        api.data().party && api.data().party.id === party)) {
                    lastParty = party;
                    return;
                }
                lastParty = party;
                Rpc.desk('js_supplier_defaults', [party]).then(function (s) {
                    controls.payment_term.set(s.payment_term);
                    controls.fob_point.set(s.fob_point);
                    controls.ship_via.set(s.ship_via);
                    controls.tax_group.set(s.tax_group);
                    controls.freight_terms.set(s.freight_terms);
                    if (s.buyer) {
                        controls.buyer.set(s.buyer);
                    }
                    if (s.specifications && !controls.specifications.get()) {
                        controls.specifications.set(s.specifications);
                    }
                    if (s.po_instructions) {
                        UI.modal('Purchasing instructions: ' + s.name,
                            el('p', {style: {whiteSpace: 'pre-line'}},
                                s.po_instructions));
                    }
                }, UI.showError);
            }, 250);
        });
        if (preset && !openId) {
            Rpc.searchRead('party.party', [['id', '=', parseInt(preset[1],
                10)]], ['rec_name']).then(function (rows) {
                if (rows.length) {
                    controls.party.set(rows[0]);
                    partyPicker.input.dispatchEvent(new Event('blur'));
                }
            });
        }
        /* Change Status: the statuses the order may take */
        statusButton.addEventListener('click', function (event) {
            var data = api.data();
            if (!data) {
                return;
            }
            UI.contextMenu(event, data.statuses.map(function (s) {
                return {label: PO_STATUS[s], onclick: function () {
                    changeStatus(data, api, s);
                }};
            }));
        });
    };

    /* ======================================================================
     * Request For Quotes
     * ==================================================================== */

    function slotFields(slot) {
        return [
            {name: 'supplier_' + slot, label: 'Supplier ID',
                type: 'many2one', model: 'party.party',
                domain: SUPPLIER_DOMAIN, span: 2},
            {name: 'quote_received_' + slot, label: 'Quote Received',
                type: 'boolean'},
            {name: 'tax_group_' + slot, label: 'Tax Group ID',
                type: 'many2one', model: 'account.tax',
                domain: TAX_GROUP_DOMAIN},
            {name: 'reference_' + slot, label: 'Supplier Ref No',
                type: 'char'},
            {name: 'as_of_date_' + slot, label: 'As Of Date', type: 'date'},
            {name: 'expiration_date_' + slot, label: 'Expiration Date',
                type: 'date'}];
    }

    /* A Supplier tab: the header fields, the address, and the supplier's
     * line table (its quoted prices of each quantity) */
    function rfqSupplierTab(slot) {
        return function (pane, data, api) {
            var fields = fieldsPane(slotFields(slot));
            fields.set(data);
            var address = el('div.jsp-sub');
            var lines = el('div.jsp-sub');
            pane.appendChild(fields.node);
            pane.appendChild(address);
            pane.appendChild(lines);
            function showAddress(a) {
                UI.clear(address).appendChild(addressBlock(a));
            }
            showAddress(data ? data['address_' + slot] : null);
            var picker = fields.controls['supplier_' + slot].picker;
            picker.input.addEventListener('blur', function () {
                global.setTimeout(function () {
                    var party = picker.value();
                    if (!party) {
                        showAddress(null);
                        return;
                    }
                    Rpc.desk('js_supplier_defaults', [party]).then(
                        function (s) {
                            showAddress(s.address);
                            if (s.tax_group && !fields.controls['tax_group_' +
                                    slot].get()) {
                                fields.controls['tax_group_' + slot].set(
                                    s.tax_group);
                            }
                            if (s.rfq_instructions && (!data ||
                                    !data['supplier_' + slot] ||
                                    data['supplier_' + slot].id !== party)) {
                                UI.modal('RFQ instructions: ' + s.name,
                                    el('p', {style: {whiteSpace:
                                        'pre-line'}}, s.rfq_instructions));
                            }
                        }, UI.showError);
                }, 250);
            });
            var rows = [];
            (data ? data.lines : []).forEach(function (line) {
                line.prices.forEach(function (p) {
                    rows.push([String(line.sequence || ''), line.line_type ===
                        'service' ? 'Service' : 'Part', num(p.quantity),
                        line.line_type === 'part' ? m2oText(line.product) :
                            '', line.line_type === 'service' ?
                            m2oText(line.product) : '', line.description,
                        m2oText(line.unit), num(p['unit_price_' + slot]),
                        num(p['fixed_charge_' + slot]),
                        UI.money(p['amount_' + slot]),
                        line['supplier_code_' + slot], line.mfg_name,
                        line.mfg_part_id]);
                });
            });
            lines.appendChild(el('h3', 'Supplier Line Table (enter the ' +
                'quoted prices on the lines: double-click a line on the ' +
                'Request for Quote tab)'));
            lines.appendChild(table(['Line No', 'Line Type',
                {label: 'Quote Qty', num: true}, 'Part ID', 'Service ID',
                'Description', 'Purchase U/M', {label: 'Unit Price',
                    num: true}, {label: 'Fixed Charge', num: true},
                {label: 'Extension', num: true}, 'Supplier Part/Service ID',
                'Mfg Name', 'Mfg Part ID'], rows, {empty: 'No line yet.'}));
            return {
                get: fields.get,
                lock: function (on) {
                    fields.lock(on);
                }
            };
        };
    }

    /* The RFQ Line window: Request for Quote Line, Suppliers (quoted
     * prices per quantity), Specs, Links */
    function rfqLineDialog(row, data, slotsData, editable) {
        var d = Object.assign({}, row.data, valuesOfRow(row));
        var priceCols = [{name: 'quantity', label: 'Quote Qty',
            type: 'float', num: true}];
        [1, 2, 3].forEach(function (slot) {
            var who = slotsData[slot] ? m2oText(slotsData[slot]) :
                'Supplier ' + slot;
            if (!slotsData[slot]) {
                return;
            }
            priceCols.push(
                {name: 'unit_price_' + slot, label: who + ': Unit Price',
                    type: 'decimal', num: true},
                {name: 'trade_discount_' + slot, label: 'Disc %',
                    type: 'decimal', num: true},
                {name: 'fixed_charge_' + slot, label: 'Fixed Charge',
                    type: 'decimal', num: true},
                {name: 'lead_time_' + slot, label: 'Leadtime',
                    type: 'integer', num: true},
                {name: 'delivery_date_' + slot, label: 'Delivery',
                    type: 'date'});
        });
        var prices = editGrid(priceCols, {addLabel: 'Add quantity'});
        prices.set(d.prices && d.prices.length ? d.prices : [{quantity: 1}]);
        prices.lock(editable);
        var links = linksGrid(editable);
        links.set(d.links || []);
        var supplierFields = [];
        [1, 2, 3].forEach(function (slot) {
            if (slotsData[slot]) {
                supplierFields.push(
                    {name: 'supplier_code_' + slot, label: m2oText(
                        slotsData[slot]) + ': Supplier Part/Service ID',
                        type: 'char', span: 2},
                    {name: 'tax_group_' + slot, label: 'Tax Group ID',
                        type: 'many2one', model: 'account.tax',
                        domain: TAX_GROUP_DOMAIN});
            }
        });
        return tabDialog('Request for Quote Line ' + (d.sequence || ''), [
            {title: 'Request for Quote Line', fields: [
                {name: 'sequence', label: 'Line No', type: 'integer'},
                {name: 'line_type', label: 'Line Type', type: 'selection',
                    options: LINE_TYPES},
                {name: 'desired_receive_date', label: 'Recv Date',
                    type: 'date'},
                {name: 'product', label: 'Part ID / Service ID',
                    type: 'many2one', model: 'product.product', span: 2,
                    readonly: true},
                {name: 'service_part', label: 'Part ID (serviced)',
                    type: 'many2one', model: 'product.product'},
                {name: 'description', label: 'Description', type: 'text',
                    span: 2, rows: 2},
                {name: 'mfg_name', label: 'Mfg Name', type: 'char'},
                {name: 'mfg_part_id', label: 'Mfg Part ID', type: 'char'},
                {name: 'unit', label: 'Purchase U/M', type: 'many2one',
                    model: 'product.uom'},
                {name: 'product_code', label: 'Product Code ID',
                    type: 'many2one', model: 'nline.product_code'},
                {name: 'commodity_code', label: 'Commodity Code ID',
                    type: 'many2one', model: 'nline.commodity_code'},
                {name: 'expense_account', label: 'Expense Acct ID',
                    type: 'many2one', model: 'account.account',
                    domain: [['type', '!=', null], ['closed', '!=', true]]},
                {name: 'drawing', label: 'Drawing ID', type: 'char'},
                {name: 'drawing_revision', label: 'Rev #', type: 'char'},
                {name: 'line_status', label: 'Status', type: 'selection',
                    options: [['open', 'Open'], ['closed', 'Closed']]}]},
            {title: 'Suppliers', node: el('div', supplierFields.length ?
                null : el('p.muted', 'Enter the suppliers on the Supplier ' +
                    '1, 2 and 3 tabs first.'), (function () {
                    var p = fieldsPane(supplierFields);
                    p.set(d);
                    p.lock(editable);
                    rfqLineDialog.pane = p;
                    return p.node;
                }()), el('h3', 'Quote Quantities and Prices'),
                prices.node)},
            {title: 'Specs', fields: [
                {name: 'specifications', label: 'Specifications (saved ' +
                    'on this RFQ line, not on the supplier)', type: 'text',
                    span: 4, rows: 10}]},
            {title: 'Links', node: el('div', el('p.muted', 'The work ' +
                'orders this line is for (they go on to the purchase ' +
                'order line).'), links.node)}
        ], d, editable).then(function (values) {
            if (rfqLineDialog.pane) {
                rfqLineDialog.pane.get(values);
            }
            values.prices = plainValues({p: prices.values()}).p;
            values.links = plainValues({l: links.values()}).l;
            return values;
        });
    }

    function rfqLines(pane, data, api) {
        var slots = function () {
            var c = api.controls();
            var out = {};
            [1, 2, 3].forEach(function (s) {
                var src = (data || {})['supplier_' + s];
                out[s] = src || null;
            });
            return out;
        };
        var grid = editGrid([
            {name: 'sequence', label: 'Line No', type: 'integer', num: true,
                width: '56px'},
            {name: 'line_type', label: 'Line Type', type: 'selection',
                options: LINE_TYPES, default: 'part'},
            {name: 'quote_qtys', label: 'Quote Qty(s)', type: 'display',
                format: function (v, row) {
                    return (row.data.prices || []).map(function (p) {
                        return num(p.quantity);
                    }).join(', ');
                }},
            {name: 'product', label: 'Part ID / Service ID',
                type: 'many2one', model: 'product.product', width: '20%',
                domain: [['purchasable', '=', true]],
                onchange: function (row, record) {
                    if (!record) {
                        return;
                    }
                    Rpc.desk('js_supplier_price', [null, record.id, 1,
                        null]).then(function (q) {
                        row.controls.description.set(q.description);
                        row.controls.line_type.set(q.line_type);
                        row.controls.unit.set(q.unit);
                        row.data.drawing = q.drawing;
                        row.data.drawing_revision = q.drawing_revision;
                    }, UI.showError);
                }},
            {name: 'description', label: 'Description', type: 'char'},
            {name: 'unit', label: 'Purchase U/M', type: 'many2one',
                model: 'product.uom'},
            {name: 'mfg_name', label: 'Mfg Name', type: 'char'},
            {name: 'mfg_part_id', label: 'Mfg Part ID', type: 'char'},
            {name: 'expense_account', label: 'Exp Acct ID',
                type: 'many2one', model: 'account.account',
                domain: [['type', '!=', null], ['closed', '!=', true]]},
            {name: 'linked', label: 'Linked', type: 'display',
                format: function (v, row) {
                    return (row.data.links || []).length ? '✔' : '';
                }},
            {name: 'po_line_exists', label: 'PO Line Exists',
                type: 'display', format: function (v, row) {
                    return (row.data.purchase_lines || []).map(function (p) {
                        return 'PO ' + p.number;
                    }).join(', ');
                }}
        ], {
            onopen: function (row) {
                rfqLineDialog(row, data, slots(), api.editable()).then(
                    function (values) {
                        applyToRow(row, values);
                        row.controls.quote_qtys.set(null);
                        row.controls.linked.set(null);
                    }, function () {});
            },
            newRow: function () {
                var rows = grid.rows();
                return {sequence: rows.length + 1, line_type: 'part',
                    prices: [{quantity: 1}], links: []};
            }
        });
        grid.set(data ? data.lines : []);
        pane.appendChild(grid.node);
        pane.appendChild(el('p.muted', 'Double-click a row header to ' +
            'enter the quote quantities, each supplier\'s prices, the ' +
            'specs and the work order links of the line.'));
        return {
            get: function (values) {
                values.lines = grid.values().filter(function (v) {
                    return v.product || v.description;
                }).map(function (v) {
                    delete v.quote_qtys;
                    delete v.linked;
                    delete v.po_line_exists;
                    delete v.purchase_lines;
                    return plainValues(v);
                });
            },
            lock: function (on) {
                grid.lock(on);
            }
        };
    }

    /* Preview/Create PO: choose the supplier and each line's quantity */
    function rfqCreatePo(data, api) {
        if (!data) {
            return;
        }
        var slots = [1, 2, 3].filter(function (s) {
            return data['supplier_' + s];
        });
        if (!slots.length) {
            UI.showError('Enter a supplier on the Supplier tabs first.');
            return;
        }
        var slotSelect = el('select', {'aria-label': 'Supplier'},
            slots.map(function (s) {
                return el('option', {value: s}, 'Supplier ' + s + ': ' +
                    m2oText(data['supplier_' + s]));
            }));
        var body = el('tbody');
        var choices = [];
        function render() {
            var slot = parseInt(slotSelect.value, 10);
            UI.clear(body);
            choices = [];
            data.lines.forEach(function (line) {
                if (line.line_status !== 'open' ||
                        line.purchase_lines.length) {
                    return;
                }
                var select = el('select', {'aria-label': 'Quantity'},
                    el('option', {value: ''}, '(do not order)'),
                    line.prices.filter(function (p) {
                        return p['unit_price_' + slot] !== null &&
                            p['unit_price_' + slot] !== undefined;
                    }).map(function (p, i) {
                        return el('option', {value: p.id, selected: i ===
                            0}, num(p.quantity) + ' @ ' + num(p['unit_price_' +
                                slot]) + ' = ' + UI.money(p['amount_' +
                                    slot]));
                    }));
                choices.push({line: line.id, select: select});
                body.appendChild(el('tr', el('td', String(line.sequence)),
                    el('td', m2oText(line.product) || line.description),
                    el('td', select)));
            });
            if (!choices.length) {
                body.appendChild(el('tr', el('td', {colspan: 3},
                    'No open line without a purchase order.')));
            }
        }
        slotSelect.addEventListener('change', render);
        render();
        UI.modal('Preview/Create PO', [el('label.field', 'Order from'),
            slotSelect, el('div.table-wrap', {style: {marginTop: '10px'}},
                el('table.data', el('thead', el('tr', el('th', 'Line'),
                    el('th', 'Part / Service'), el('th',
                        'Quantity to order'))), body))], [
            {label: 'Cancel'},
            {label: 'Create PO', primary: true, onclick: function () {
                var lines = choices.filter(function (c) {
                    return c.select.value;
                }).map(function (c) {
                    return {line: c.line, price: parseInt(c.select.value,
                        10)};
                });
                if (!lines.length) {
                    UI.showError('Choose the quantity of at least one ' +
                        'line.');
                    return true;
                }
                UI.service('js_rfq_create_po', {rfq: data.id, slot:
                    parseInt(slotSelect.value, 10), lines: lines}).then(
                    function (po) {
                        UI.toast('PO ' + po.number + ' created', 'ok');
                        api.reload();
                        UI.openScreen('purchase-orders/' + po.id, 'PO ' +
                            po.number);
                    }, failed);
            }}]);
    }

    function rfqShipTo(pane, data) {
        var tab = shipToTab(true);
        tab.set(data);
        pane.appendChild(tab.node);
        return {get: tab.get, lock: tab.lock};
    }

    Screens.jsRfq = function (main, params) {
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var statusLabel = {};
        RFQ_STATUS.forEach(function (s) {
            statusLabel[s[0]] = s[1];
        });
        docWindow(main, {
            title: 'Request for Quote',
            model: 'nline.rfq',
            label: 'RFQ ID',
            order: [['rfq_date', 'DESC'], ['number', 'DESC']],
            rights: ['nline.rfq', 'purchase.purchase'],
            openId: openId,
            load: function (id) {
                return Rpc.desk('js_rfq_get', [id]);
            },
            save: function (values) {
                return UI.service('js_rfq_save', values);
            },
            remove: function (data) {
                return Rpc.desk('js_rfq_delete', [data.id]);
            },
            deletable: function (data) {
                return data && !data.purchases.length;
            },
            status: function (data) {
                var s = data ? data.status : 'unreleased';
                return [s, statusLabel[s]];
            },
            titleOf: function (data) {
                return 'RFQ ' + data.number;
            },
            defaults: function () {
                return {rfq_date: UI.today(), due_date: UI.today(),
                    status: 'unreleased'};
            },
            tabs: [
                {title: 'Request for Quote', fields: [
                    {name: 'number', label: 'RFQ ID (blank: next number)',
                        type: 'char'},
                    {name: 'rfq_date', label: 'RFQ Date', type: 'date'},
                    {name: 'due_date', label: 'Quote Due Date',
                        type: 'date'},
                    {name: 'desired_receive_date', label: 'Desired Recv Date',
                        type: 'date'},
                    {name: 'status', label: 'RFQ Status', type: 'selection',
                        options: RFQ_STATUS},
                    {name: 'fob_point', label: 'FOB Point ID',
                        type: 'many2one', model: 'nline.fob_point'},
                    {name: 'ship_via', label: 'Ship Via ID',
                        type: 'many2one', model: 'nline.ship_via'},
                    {name: 'payment_term', label: 'Terms ID',
                        type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'payable_account', label: 'Payable Acct ID',
                        type: 'many2one', model: 'account.account',
                        domain: [['type.payable', '=', true],
                            ['closed', '!=', true]]},
                    {name: 'freight_terms', label: 'Freight Terms',
                        type: 'selection', options: FREIGHT},
                    {name: 'buyer', label: 'Buyer', type: 'char'},
                    {name: 'printed_date', label: 'Printed Date',
                        type: 'char', readonly: true}], render: rfqLines},
                {title: 'Ship To', render: rfqShipTo},
                {title: 'Supplier 1', render: rfqSupplierTab(1)},
                {title: 'Supplier 2', render: rfqSupplierTab(2)},
                {title: 'Supplier 3', render: rfqSupplierTab(3)},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', span: 4, rows: 12}]},
                {title: 'Purchase Orders', render: function (pane, data) {
                    pane.appendChild(table(['Order ID', 'Supplier',
                        'Status'], (data ? data.purchases : []).map(
                        function (p) {
                            return [p.number, p.party, PO_STATUS[p.status]];
                        }), {onopen: function (i) {
                            var p = data.purchases[i];
                            UI.openScreen('purchase-orders/' + p.id, 'PO ' +
                                p.number);
                        }, empty: 'No purchase order made from this ' +
                            'request yet.'}));
                    return null;
                }}
            ],
            browse: [
                {name: 'number', label: 'RFQ ID'},
                {name: 'rfq_date', label: 'Quote Date', type: 'date'},
                {name: 'status', label: 'Quote Status', labels: statusLabel},
                {name: 'due_date', label: 'Due Date', type: 'date'},
                {name: 'supplier_1', label: 'Supplier 1', type: 'many2one'}],
            extra: [
                {label: 'Preview/Create PO', title: 'Make the purchase ' +
                    'order of a supplier\'s quote',
                    visible: function (data, access) {
                        return Boolean(data && data.status === 'active' &&
                            access['purchase.purchase'] &&
                            access['purchase.purchase'].create);
                    },
                    onclick: rfqCreatePo},
                {label: 'Print', visible: function (data) {
                    return Boolean(data);
                }, onclick: function (data, api) {
                    Rpc.desk('js_rfq_printed', [data.id]).then(function () {
                        UI.toast('Printed date set; the RFQ form is in ' +
                            'Purchasing Reports');
                        api.reload();
                    }, UI.showError);
                }}]
        });
    };

    /* ======================================================================
     * Receiving
     * ==================================================================== */

    /* Tools > Apply Fixed Charges: spread a charge over the receiver lines */
    function applyFixedCharges(lines, done) {
        var amount = el('input.money', {type: 'text', 'aria-label':
            'Charge Amount'});
        var how = el('select', {'aria-label': 'Apportion'},
            el('option', {value: 'equal'}, 'Apply Equally Across All Lines'),
            el('option', {value: 'quantity'},
                'Apportion by Quantity (Stock UM)'),
            el('option', {value: 'cost'}, 'Apportion by Cost'));
        var mode = el('select', {'aria-label': 'Add or replace'},
            el('option', {value: 'add'}, 'Add to Fixed Charge'),
            el('option', {value: 'replace'}, 'Replace Fixed Charge'));
        UI.modal('Apply Fixed Charges', [el('div.grid-form',
            el('div', el('label.field', 'Charge Amount'), amount),
            el('div', el('label.field', 'Apply'), how),
            el('div', el('label.field', 'Then'), mode))], [
            {label: 'Cancel'},
            {label: 'Apply', primary: true, onclick: function () {
                var charge = parseNum(amount.value);
                var live = lines.filter(function (l) {
                    return !l.deleted;
                });
                if (!charge || !live.length) {
                    return true;
                }
                var weights = live.map(function (l) {
                    var v = l.values();
                    if (how.value === 'quantity') {
                        return parseNum(v.receive_quantity) || 0;
                    }
                    if (how.value === 'cost') {
                        var base = (parseNum(v.receive_quantity) || 0) *
                            (parseNum(v.unit_price) || 0) * (1 -
                                (parseNum(v.discount) || 0) / 100);
                        return mode.value === 'add' ? base +
                            (parseNum(v.fixed_charge) || 0) : base;
                    }
                    return 1;
                });
                var total = weights.reduce(function (a, b) {
                    return a + b;
                }, 0) || live.length;
                var given = 0;
                live.forEach(function (l, i) {
                    var share = i === live.length - 1 ?
                        Math.round((charge - given) * 100) / 100 :
                        Math.round(charge * weights[i] / total * 100) / 100;
                    given += share;
                    var v = l.values();
                    var fixed = mode.value === 'add' ?
                        (parseNum(v.fixed_charge) || 0) + share : share;
                    l.setFixed(Math.round(fixed * 100) / 100);
                });
                done();
            }}]);
    }

    Screens.jsReceiving = function (main) {
        css();
        var query = (global.location.hash.split('?')[1] || '');
        var form = UI.form(main, {title: 'Receiving', extra: [
            {label: 'Refresh', title: 'Refresh (F5)', onclick: function () {
                loadActivity();
            }}]});
        var body = form.body;
        var access = {};
        var view = el('select', {'aria-label': 'Receiving View'},
            el('option', {value: 'unreceived'}, 'View Unreceived Orders'),
            el('option', {value: 'received'}, 'View Received Orders'));
        var supplier = UI.picker('party.party', {placeholder:
            'All suppliers', label: 'Supplier', domain: [['is_supplier',
                '=', true]], onselect: function () {
                loadActivity();
            }});
        body.appendChild(el('div.panel.jsp-head', el('label.field',
            'Receiving View'), view, el('label.field', 'Supplier'),
            supplier.node, el('button', {type: 'button', onclick:
                function () {
                    supplier.set(null, '');
                    loadActivity();
                }}, 'All')));
        var activityPane = el('div');
        var receiverPane = el('div');
        var fromPane = el('div');
        var detailsPane = el('div');
        var specsPane = el('div');
        var tabs = tabSet(body, [
            {title: 'Receiving Activity', node: activityPane},
            {title: 'Receivers', node: receiverPane},
            {title: 'Receive From', node: fromPane},
            {title: 'Details', node: detailsPane},
            {title: 'Specifications', node: specsPane}]);
        var receiver = null;
        var lineState = [];
        var headFields = null, detailFields = null, specFields = null;

        function loadActivity() {
            Rpc.desk('js_receiving_activity', [view.value,
                supplier.value()]).then(function (rows) {
                UI.clear(activityPane);
                if (view.value === 'unreceived') {
                    activityPane.appendChild(table(['Purchase Order ID',
                        'Receiver ID', 'Desired Recv', 'Return', 'Supplier',
                        'Message'], rows.map(function (r) {
                            return [r.number, '', UI.date(r.desired_date),
                                '', r.supplier_name, r.message];
                        }), {
                        onopen: function (i) {
                            openNew(rows[i].purchase);
                        },
                        rowClass: function (i) {
                            return rows[i].late ? 'jsp-late' : '';
                        },
                        oncontext: function (event, i) {
                            UI.contextMenu(event, canReceive() ? [
                                {label: 'Receive', onclick: function () {
                                    receiveAll(rows[i].purchase);
                                }},
                                {label: 'Open Receiver', onclick: function () {
                                    openNew(rows[i].purchase);
                                }}, '-',
                                {label: 'Open Purchase Order', onclick:
                                    function () {
                                        UI.openScreen('purchase-orders/' +
                                            rows[i].purchase, 'PO ' +
                                            rows[i].number);
                                    }}] : [{label: 'Open Purchase Order',
                                        onclick: function () {
                                            UI.openScreen('purchase-orders/' +
                                                rows[i].purchase);
                                        }}]);
                        },
                        empty: 'Nothing to receive: no released order ' +
                            'waits.'}));
                    activityPane.appendChild(el('p.muted', 'Double-click an ' +
                        'order to make its receiver; right-click > Receive ' +
                        'receives it to completion.'));
                } else {
                    activityPane.appendChild(table(['Order ID',
                        'Supplier ID', 'Name', 'Order Date', 'Status',
                        'Last Received Date', 'Receiver', 'Type',
                        'Receiver Status'], rows.map(function (r) {
                            return [r.number, r.supplier_code,
                                r.supplier_name, UI.date(r.order_date),
                                PO_STATUS[r.status] || '',
                                UI.date(r.last_received_date),
                                r.receiver_number, r.kind === 'return' ?
                                    'Return' : 'Receipt',
                                r.receiver_status];
                        }), {onopen: function (i) {
                            openSaved(rows[i].kind, rows[i].receiver);
                        }, empty: 'No receiver in the last year.'}));
                }
            }, UI.showError);
        }

        function canReceive() {
            return Boolean(access['stock.shipment.in'] &&
                access['stock.shipment.in'].create);
        }

        function receiveAll(purchase) {
            Rpc.desk('js_receiver_new', [purchase]).then(function (r) {
                UI.service('js_receiver_receive', plainValues(r)).then(
                    function (done) {
                        UI.toast('Receiver ' + done.number + ' received',
                            'ok');
                        showReceiver(done);
                        loadActivity();
                    }, failed);
            }, UI.showError);
        }

        function openNew(purchase) {
            Rpc.desk('js_receiver_new', [purchase]).then(function (r) {
                showReceiver(r);
                tabs.select('Receivers');
            }, UI.showError);
        }

        function openSaved(kind, id) {
            return Rpc.desk('js_receiver_get', [kind, id]).then(function (r) {
                showReceiver(r);
                tabs.select('Receivers');
            }, UI.showError);
        }

        /* What can be done with the receiver shown */
        function mode() {
            if (!receiver) {
                return null;
            }
            if (!receiver.transacted) {
                return 'receive';
            }
            if (receiver.kind === 'receipt' && receiver.receiver_status !==
                    'cancelled') {
                return 'return';
            }
            return 'view';
        }

        function lineRow(line, tbody, recompute) {
            var m = mode();
            var qty = el('input.money', {type: 'text', 'aria-label':
                'Rec/Rtn Qty', value: m === 'return' ? '' :
                    num(line.receive_quantity)});
            var price = el('input.money', {type: 'text', 'aria-label':
                'Unit Price', value: num(line.unit_price)});
            var disc = el('input.money', {type: 'text', 'aria-label':
                'Disc %', value: num(line.discount)});
            var fixed = el('input.money', {type: 'text', 'aria-label':
                'Fixed Charge', value: num(line.fixed_charge)});
            var location = UI.picker('stock.location', {label: 'Location',
                domain: [['type', '=', 'storage']]});
            if (line.location) {
                location.set(line.location.id, line.location.rec_name);
            }
            var amount = el('span');
            var priced = !receiver.receiver_exported && m !== 'view';
            qty.disabled = m === 'view';
            price.disabled = disc.disabled = fixed.disabled = !priced;
            location.input.disabled = m !== 'receive';
            var state = {
                line: line,
                deleted: false,
                values: function () {
                    return {move: line.move, receive_quantity:
                        parseNum(qty.value), unit_price: parseNum(
                            price.value), discount: parseNum(disc.value),
                        fixed_charge: parseNum(fixed.value), location:
                            location.value()};
                },
                setFixed: function (v) {
                    fixed.value = num(v);
                    update();
                }
            };
            function update() {
                var v = state.values();
                var q = m === 'receive' ? (v.receive_quantity || 0) :
                    line.quantity;
                amount.textContent = UI.money(Math.round((q *
                    (v.unit_price || 0) * (1 - (v.discount || 0) / 100) +
                    (v.fixed_charge || 0)) * 100) / 100);
                recompute();
            }
            [qty, price, disc, fixed].forEach(function (i) {
                i.addEventListener('input', update);
            });
            var marker = el('td.jsp-row', {tabindex: 0, title:
                'Del marks the line for deletion', onkeydown: function (e) {
                    if (e.key === 'Delete' && m === 'receive') {
                        state.deleted = !state.deleted;
                        tr.classList.toggle('jsp-deleted', state.deleted);
                        recompute();
                    }
                }}, '▸');
            var tr = el('tr', marker, el('td.num', String(line.line_no)),
                el('td.num', line.po_line_no === null ? '' :
                    String(line.po_line_no)),
                el('td', line.line_type === 'part' ? m2oText(line.product) :
                    ''),
                el('td', line.line_type === 'service' ?
                    m2oText(line.product) : ''),
                el('td', line.description),
                el('td.num', num(line.stock_quantity)),
                el('td', line.stock_unit),
                el('td.num', qty),
                el('td', line.unit),
                el('td.num', price), el('td.num', disc), el('td.num', fixed),
                el('td.num', amount),
                el('td', location.node),
                el('td.num', line.returned_quantity ?
                    num(line.returned_quantity) : ''));
            tbody.appendChild(tr);
            state.amount = function () {
                return parseNum(amount.textContent) || 0;
            };
            update();
            return state;
        }

        function showReceiver(r) {
            receiver = r;
            UI.clear(receiverPane);
            UI.clear(fromPane);
            UI.clear(detailsPane);
            UI.clear(specsPane);
            var m = mode();
            headFields = fieldsPane([
                {name: 'number', label: 'Receiver ID', type: 'char',
                    readonly: true},
                {name: 'purchase_number', label: 'Order ID', type: 'char',
                    readonly: true},
                {name: 'supplier_code', label: 'Supplier ID', type: 'char',
                    readonly: true},
                {name: 'order_date', label: 'Order Date', type: 'date',
                    readonly: true},
                {name: 'received_date', label: m === 'return' ?
                    'Return Date' : 'Receive Date', type: 'date',
                    readonly: m === 'view'},
                {name: 'receiver_status', label: 'Receiver Status',
                    type: 'selection', options: RECEIVER_STATUS.filter(
                        function (s) {
                            return s[0] !== 'cancelled' ||
                                r.receiver_status === 'cancelled';
                        })},
                {name: 'reference', label: m === 'return' ?
                    'RMA / Reference' : 'Packing Slip', type: 'char',
                    readonly: m === 'view'},
                {name: 'received_by', label: 'Received By', type: 'char',
                    readonly: true}]);
            headFields.set(Object.assign({}, r, m === 'return' ? {
                received_date: UI.today(), reference: '',
                receiver_status: 'approved'} : {}));
            var total = el('strong');
            var tbody = el('tbody');
            lineState = [];
            function recompute() {
                var sum = lineState.filter(function (s) {
                    return !s.deleted;
                }).reduce(function (a, s) {
                    return a + s.amount();
                }, 0);
                total.textContent = UI.money(sum, true);
            }
            r.lines.forEach(function (line) {
                lineState.push(lineRow(line, tbody, recompute));
            });
            recompute();
            var buttons = el('div.toolbar');
            if (m === 'receive' && canReceive()) {
                buttons.appendChild(el('button.primary', {type: 'button',
                    onclick: doReceive}, 'Receive'));
            }
            if (m === 'return' && access['stock.shipment.in.return'] &&
                    access['stock.shipment.in.return'].create) {
                buttons.appendChild(el('button.primary', {type: 'button',
                    onclick: doReturn}, 'Return'));
                if (access['stock.shipment.in'] &&
                        access['stock.shipment.in'].write) {
                    buttons.appendChild(el('button', {type: 'button',
                        onclick: doCancel}, 'Cancel Receiver'));
                }
            }
            if (m !== 'view' && !r.receiver_exported) {
                buttons.appendChild(el('button', {type: 'button',
                    onclick: function () {
                        applyFixedCharges(lineState, recompute);
                    }}, 'Tools: Apply Fixed Charges…'));
            }
            if (r.id && access[r.kind === 'return' ?
                    'stock.shipment.in.return' : 'stock.shipment.in'] &&
                    access[r.kind === 'return' ? 'stock.shipment.in.return' :
                        'stock.shipment.in'].write) {
                buttons.appendChild(el('button', {type: 'button',
                    onclick: doSave}, 'Save'));
            }
            if (r.id && r.kind === 'receipt') {
                buttons.appendChild(el('button', {type: 'button',
                    onclick: function () {
                        Rpc.report('stock.shipment.in.restocking_list',
                            [r.id]).then(function (rep) {
                            UI.openReport(rep, 'Receiver');
                        }, UI.showError);
                    }}, 'Print Receiver'));
            }
            if (r.purchase) {
                buttons.appendChild(el('button', {type: 'button',
                    onclick: function () {
                        UI.openScreen('purchase-orders/' + r.purchase, 'PO ' +
                            r.purchase_number);
                    }}, 'Open Purchase Order'));
            }
            buttons.appendChild(el('span.spacer'));
            buttons.appendChild(el('span', 'Total ', total));
            receiverPane.appendChild(headFields.node);
            receiverPane.appendChild(buttons);
            receiverPane.appendChild(el('div.table-wrap', el(
                'table.data.jsp-lines', el('thead', el('tr', el('th.jsp-row',
                    ''), el('th.num', 'Line No'), el('th.num', 'PO Line No'),
                    el('th', 'Part ID'), el('th', 'Service ID'),
                    el('th', 'Description'), el('th.num',
                        'Received Qty (Stk U/M)'), el('th', 'Stock U/M'),
                    el('th.num', m === 'return' ? 'Rtn Qty (Pur U/M)' :
                        'Rec/Rtn Qty (Pur U/M)'), el('th', 'Purchase U/M'),
                    el('th.num', 'Unit Price'), el('th.num', 'Disc %'),
                    el('th.num', 'Fixed Charge'), el('th.num',
                        'Received Amount'), el('th', 'Location ID'),
                    el('th.num', 'Returned'))), tbody)));
            if (m === 'receive') {
                receiverPane.appendChild(el('p.muted', 'Not saved until ' +
                    'you click Receive: then the quantities go into stock ' +
                    'and what is left stays on order.'));
            } else if (m === 'return') {
                receiverPane.appendChild(el('p.muted', 'Enter the ' +
                    'quantities to give back and click Return; the order ' +
                    'stays closed. Cancel Receiver gives back all that is ' +
                    'left and expects it again on the order.'));
            }
            fromPane.appendChild(addressBlock(r.receive_from));
            fromPane.appendChild(el('p.muted', 'Change the address on the ' +
                'Purchase From tab of the purchase order.'));
            detailFields = fieldsPane([
                {name: 'payment_due_date', label: 'Payment Due Date',
                    type: 'date'},
                {name: 'receiver_exported', label: 'Exported',
                    type: 'boolean'},
                {name: 'receiver_exported_date', label: 'Date',
                    type: 'date', readonly: true},
                {name: 'supplier_invoice', label: 'Invoice ID',
                    type: 'char'},
                {name: 'invoiced_date', label: 'Invoiced Date',
                    type: 'date'},
                {name: 'buyer', label: 'Buyer', type: 'char',
                    readonly: true},
                {name: 'fob_point', label: 'FOB Point', type: 'many2one',
                    model: 'nline.fob_point', readonly: true},
                {name: 'ship_via', label: 'Ship Via', type: 'many2one',
                    model: 'nline.ship_via', readonly: true},
                {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                    model: 'account.tax', readonly: true},
                {name: 'payment_term', label: 'Terms ID', type: 'many2one',
                    model: 'account.invoice.payment_term', readonly: true},
                {name: 'payable_account', label: 'Payable Acct ID',
                    type: 'many2one', model: 'account.account',
                    readonly: true}]);
            detailFields.set(r);
            detailsPane.appendChild(detailFields.node);
            specFields = fieldsPane([{name: 'specifications', label:
                'Specifications', type: 'text', span: 4, rows: 10}]);
            specFields.set(r);
            specsPane.appendChild(specFields.node);
            var editable = (m === 'receive' && canReceive()) || (r.id &&
                access['stock.shipment.in'] &&
                access['stock.shipment.in'].write);
            headFields.lock(editable);
            detailFields.lock(editable);
            specFields.lock(editable);
            UI.setTitle('Receiver ' + (r.number || 'new'));
        }

        function headValues() {
            var values = {};
            headFields.get(values);
            detailFields.get(values);
            specFields.get(values);
            return plainValues(values);
        }

        function doReceive() {
            var values = Object.assign(headValues(), {purchase:
                receiver.purchase, lines: lineState.filter(function (s) {
                    return !s.deleted;
                }).map(function (s) {
                    return plainValues(s.values());
                })});
            if (!values.lines.some(function (l) {
                return l.receive_quantity > 0;
            })) {
                UI.showError('Enter the quantity of at least one line.');
                return;
            }
            UI.service('js_receiver_receive', values).then(function (done) {
                UI.toast('Receiver ' + done.number + ' received', 'ok');
                showReceiver(done);
                loadActivity();
                UI.confirm('Print', 'Print the receiver?').then(function (ok) {
                    if (ok) {
                        Rpc.report('stock.shipment.in.restocking_list',
                            [done.id]).then(function (rep) {
                            UI.openReport(rep, 'Receiver');
                        }, UI.showError);
                    }
                });
            }, failed);
        }

        function doReturn() {
            var values = Object.assign(headValues(), {receiver: receiver.id,
                lines: lineState.map(function (s) {
                    return plainValues(s.values());
                })});
            UI.service('js_receiver_return', values).then(function (back) {
                UI.toast('Return ' + back.number + ' done', 'ok');
                showReceiver(back);
                loadActivity();
            }, failed);
        }

        function doCancel() {
            UI.confirm('Cancel Receiver', 'Give back to the supplier all ' +
                'that is left of receiver ' + receiver.number + ' and ' +
                'expect it again on the order?').then(function (ok) {
                if (ok) {
                    Rpc.desk('js_receiver_cancel', [receiver.id]).then(
                        function (r) {
                            UI.toast('Receiver ' + r.number + ' cancelled',
                                'ok');
                            showReceiver(r);
                            loadActivity();
                        }, UI.showError);
                }
            });
        }

        function doSave() {
            var values = Object.assign(headValues(), {id: receiver.id,
                kind: receiver.kind, lines: lineState.map(function (s) {
                    return plainValues(s.values());
                })});
            if (mode() === 'return') {
                /* The head shows the next return: keep the receiver's own */
                values.received_date = receiver.received_date;
                values.reference = receiver.reference;
                values.receiver_status = receiver.receiver_status;
            }
            UI.service('js_receiver_save', values).then(function (r) {
                UI.toast('Receiver ' + r.number + ' saved', 'ok');
                showReceiver(r);
            }, failed);
        }

        view.addEventListener('change', loadActivity);
        keys(activityPane, null, loadActivity);
        rights(['stock.shipment.in', 'stock.shipment.in.return']).then(
            function (r) {
                access = r;
                loadActivity();
                var open = /(receipt|return)=(\d+)/.exec(query);
                var po = /purchase=(\d+)/.exec(query);
                if (open) {
                    view.value = 'received';
                    loadActivity();
                    openSaved(open[1], parseInt(open[2], 10));
                } else if (po) {
                    openNew(parseInt(po[1], 10));
                }
            }, UI.showError);
        [receiverPane, fromPane, detailsPane, specsPane].forEach(function (p) {
            p.appendChild(el('p.muted', 'Double-click an order in ' +
                'Receiving Activity.'));
        });
    };

    /* ======================================================================
     * Services
     * ==================================================================== */

    Screens.jsServices = function (main, params) {
        css();
        Rpc.desk('js_service_defaults', []).then(function (defaults) {
            var prefix = defaults.prefix;
            delete defaults.prefix;
            if (!defaults.account_category) {
                delete defaults.account_category;
            }
            UI.master(main, {
                title: 'Services',
                model: 'product.template',
                label: 'Service ID',
                domain: [['type', '=', 'service'], ['code', 'like',
                    prefix + '%']],
                order: [['code', 'ASC']],
                open: params && params[0] ? parseInt(params[0], 10) : null,
                defaults: defaults,
                tabs: [
                    {title: 'Services', fields: [
                        {name: 'code', label: 'ID (' + prefix + '…)',
                            type: 'char'},
                        {name: 'name', label: 'Description', type: 'char',
                            span: 2},
                        {name: 'active', label: 'Active (clear for ' +
                            'Inactive)', type: 'boolean', default: true}]},
                    {title: 'Supplier Prices', render: function (pane,
                            record) {
                        Rpc.searchRead('purchase.product_supplier',
                            [['template', '=', record.id]],
                            ['party.rec_name', 'code', 'service_part.rec_name',
                                'quote_date', 'price_type'], {order:
                                [['id', 'ASC']]}).then(function (rows) {
                            pane.appendChild(table(['Supplier',
                                'Supplier Service ID', 'Part ID', 'Quoted',
                                'Type'], rows.map(function (r) {
                                    return [(r['party.'] || {}).rec_name,
                                        r.code,
                                        (r['service_part.'] || {}).rec_name,
                                        UI.date(r.quote_date),
                                        r.price_type === 'upto' ?
                                            'Up-to-Qty' : 'Break'];
                                }), {empty: 'No supplier quoted this ' +
                                    'service: enter the prices on the ' +
                                    'Service Prices tab of the supplier.'}));
                        }, UI.showError);
                    }}],
                browse: [
                    {name: 'code', label: 'ID'},
                    {name: 'name', label: 'Description'}],
                beforeSave: function (values) {
                    if (values.code && values.code.indexOf(prefix) !== 0) {
                        values.code = prefix + values.code;
                    }
                    return values;
                }
            });
        }, UI.showError);
    };

    /* ======================================================================
     * Tax Groups (purchasing): Tryton taxes of the "Jobshop Purchasing"
     * group, each tax of the group a child tax
     * ==================================================================== */

    function taxesTab(pane, data) {
        var grid = editGrid([
            {name: 'name', label: 'Tax Name', type: 'char'},
            {name: 'description', label: 'Description', type: 'char'},
            {name: 'start_date', label: 'Effective', type: 'date'},
            {name: 'end_date', label: 'Until', type: 'display',
                format: function (v) {
                    return v ? UI.date(v) : '';
                }},
            {name: 'account', label: 'Account ID', type: 'many2one',
                model: 'account.account', domain: [['type.statement', '=',
                    'balance'], ['closed', '!=', true]]},
            {name: 'percent', label: 'Percent', type: 'decimal', num: true}],
            {addLabel: 'Add tax', newRow: function () {
                return {start_date: UI.today()};
            }});
        grid.set(data ? data.taxes : []);
        pane.appendChild(grid.node);
        pane.appendChild(el('p.muted', 'Percent: 15 for 15%. A tax of the ' +
            'same name with a later Effective date replaces it from that ' +
            'date.'));
        return {
            get: function (values) {
                values.taxes = grid.values().map(function (v) {
                    delete v.end_date;
                    return plainValues(v);
                });
            },
            lock: function (on) {
                grid.lock(on);
            }
        };
    }

    Screens.jsPurchaseTaxGroups = function (main, params) {
        docWindow(main, {
            title: 'Tax Groups',
            model: 'account.tax',
            label: 'Tax Group ID',
            domain: TAX_GROUP_DOMAIN,
            order: [['name', 'ASC']],
            openId: params && params[0] ? parseInt(params[0], 10) : null,
            recName: function (d) {
                return d.name;
            },
            load: function (id) {
                return Rpc.desk('js_tax_group_get', [id]);
            },
            save: function (values) {
                return UI.service('js_tax_group_save', values);
            },
            remove: function (data) {
                return Rpc.desk('js_tax_group_delete', [data.id]);
            },
            check: function (values) {
                return values.name ? null : 'Enter the Tax Group ID.';
            },
            tabs: [
                {title: 'Purchasing Tax Group', fields: [
                    {name: 'name', label: 'Tax Group ID', type: 'char'},
                    {name: 'description', label: 'Description', type: 'char',
                        span: 3}]},
                {title: 'Taxes', render: taxesTab}],
            browse: [
                {name: 'name', label: 'Tax Group ID'},
                {name: 'description', label: 'Description'}]
        });
    };

    /* Purchasing routes (before the desk's: they replace its Suppliers,
     * Purchase Order and Receiving screens) */
    routes.push(
        [/^#\/supplier-window(?:\?.*)?$/, 'jsSupplierWindow'],
        [/^#\/supplier-window\/(\d+)$/, 'jsSupplierWindow'],
        [/^#\/rfqs(?:\?.*)?$/, 'jsRfq'],
        [/^#\/rfqs\/(\d+)$/, 'jsRfq'],
        [/^#\/purchase-orders\/new(?:\?.*)?$/, 'jsPurchaseOrder'],
        [/^#\/purchase-orders\/(\d+)$/, 'jsPurchaseOrder'],
        [/^#\/receiving(?:\?.*)?$/, 'jsReceiving'],
        [/^#\/services(?:\?.*)?$/, 'jsServices'],
        [/^#\/services\/(\d+)$/, 'jsServices'],
        [/^#\/purchase-tax-groups(?:\?.*)?$/, 'jsPurchaseTaxGroups'],
        [/^#\/purchase-tax-groups\/(\d+)$/, 'jsPurchaseTaxGroups']);
}(window));
