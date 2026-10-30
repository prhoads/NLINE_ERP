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
    /* An address tab as Jobshop lays it out (PurchaseOrderSubTabs Purchase
     * From / Ship To): the address on the left, the contact on the right.
     * prefix: the fields' names; street: Address 1 / 2 / Etc. are lines of
     * one text field (the Ship To's) instead of fields of their own */
    function addressFields(prefix, street) {
        var a1 = street ? '_addr_1' : 'address_1';
        var a2 = street ? '_addr_2' : 'address_2';
        var etc = street ? '_addr_etc' : 'etc';
        return [
            {name: prefix + 'name', label: 'Name', type: 'char',
                at: [12, 10, 432, 30], split: 72},
            {name: prefix + a1, label: 'Address', type: 'char',
                at: [12, 32, 453, 52], split: 72},
            {name: prefix + a2, label: '', type: 'char',
                at: [84, 54, 453, 74], split: 0},
            {name: prefix + 'city', label: 'City', type: 'char',
                at: [12, 76, 453, 96], split: 72},
            {name: prefix + 'state', label: 'State/Postal', type: 'char',
                at: [12, 98, 248, 118], split: 72},
            {name: prefix + 'postal_code', label: '', type: 'char',
                at: [250, 98, 450, 118], split: 0},
            {name: prefix + 'country', label: 'Country', type: 'char',
                at: [12, 120, 453, 140], split: 72},
            {name: prefix + etc, label: 'Etc.', type: 'char',
                at: [12, 142, 453, 162], split: 72},
            {name: prefix + 'contact', label: 'Contact', type: 'char',
                at: [474, 10, 804, 30], split: 72},
            {name: prefix + 'title', label: 'Title', type: 'char',
                at: [474, 32, 804, 52], split: 72},
            {name: prefix + 'phone', label: 'Phone', type: 'char',
                at: [474, 54, 804, 74], split: 72},
            {name: prefix + 'fax', label: 'Fax', type: 'char',
                at: [474, 76, 804, 96], split: 72},
            {name: prefix + 'email', label: 'E-mail', type: 'char',
                at: [474, 98, 804, 118], split: 72},
            {name: prefix + 'mobile', label: 'Mobile', type: 'char',
                at: [474, 120, 804, 140], split: 72}];
    }
    var ADDRESS_KEYS = ['name', 'address_1', 'address_2', 'city', 'state',
        'postal_code', 'country', 'etc', 'contact', 'title', 'phone', 'fax',
        'email', 'mobile'];

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
            '.jsp-head > input, .jsp-head > select { width: auto;',
            '  flex: 0 0 auto; }',
            '.jsp-lines td span[title], table.data td span[title] {',
            '  white-space: nowrap; }',
            '.jsp-status { font-weight: 600; padding: 2px 8px;',
            '  border: 1px solid var(--line); border-radius: 4px; }',
            '.jsp-status.st-released, .jsp-status.st-active,',
            '.jsp-status.st-approved { color: var(--ok); }',
            '.jsp-status.st-cancelled, .jsp-status.st-hold,',
            '.jsp-status.st-late { color: var(--bad); }',
            '.jsp-lines td input, .jsp-lines td select { min-width: 60px; }',
            '.jsp-lines td select { min-width: 90px; }',
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
            '.modal:has(.jsp-dialog) { max-width: 96vw;',
            '  width: min(1180px, 96vw); }',
            '.jsp-dialog .tab-pane { max-height: 60vh; overflow: auto; }',
            'tr.jsp-click { cursor: default; }',
            'tr.jsp-late td { color: var(--bad); }',
            '.jsp-check { white-space: nowrap; }',
            '.jsp-desc { display: block; font-size: 12px; margin-top: 2px;',
            '  min-height: 1em; overflow: hidden; text-overflow: ellipsis;',
            '  white-space: nowrap; }',
            /* In Jobshop's placed layout: the description box to the
             * right of its code, as Jobshop's read-only type4 control */
            '.js-ctl .jsp-desc { position: absolute; left: calc(100% + 4px);',
            '  top: 0; margin: 0; width: calc(var(--u, 1.5px) * 170);',
            '  line-height: 1.9; padding: 0 4px; border: 1px solid',
            '  var(--line); border-radius: 3px; background: var(--paper);',
            '  color: var(--muted); }',
            '.js-ctl .jsp-desc:empty { visibility: hidden; }',
            '.jsp-placed { position: absolute; }',
            '.jsp-placed .jsp-descbox { width: 100%; height: 100%;',
            '  box-sizing: border-box; background: var(--paper);',
            '  color: var(--ink); }',
            '.jsp-stamp { font-size: 12px; color: var(--muted);',
            '  display: flex; gap: 14px; flex-wrap: wrap; }',
            '.jsp-boxes { display: grid; grid-template-columns:',
            '  repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;',
            '  margin-top: 10px; }',
            '.jsp-boxes h3 { margin: 0 0 4px; font-size: 12px;',
            '  color: var(--muted); }',
            '.jsp-radio { display: block; margin: 4px 0; }',
            '.jsp-two { display: grid; grid-template-columns: 46fr 54fr;',
            '  gap: 10px; align-items: start; }',
            '.jsp-two > .table-wrap { overflow: auto; max-height: 70vh; }',
            '@media (max-width: 900px) { .jsp-two { grid-template-columns:',
            '  1fr; } }',
            '.jsp-lines td.jsp-cb, .jsp-lines th.jsp-cb { text-align: center;',
            '  width: 34px; }'
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
    function fieldsPane(fields, tab) {
        var controls = {};
        var grid;
        if (UI.placedForm && fields.some(function (f) {
            return f.at;
        })) {
            /* Placed where Jobshop's layout has them (frame.js) */
            grid = UI.placedForm({fields: fields, frames: tab && tab.frames,
                buttons: tab && tab.buttons}, function (f) {
                    var c = UI.fieldControl(f);
                    c.field = f;
                    controls[f.name] = c;
                    return c;
                });
        } else {
            grid = el('div.grid-form');
            fields.forEach(function (f) {
                var c = UI.fieldControl(f);
                c.field = f;
                controls[f.name] = c;
                grid.appendChild(el('div', f.span ? {style: {gridColumn:
                    'span ' + f.span}} : null, el('label.field', f.label),
                    c.node));
            });
        }
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
                            var dot = c.name.indexOf('.');
                            if (dot > 0) {
                                /* A field of a related record: party.code */
                                v = (row[c.name.slice(0, dot + 1)] || {})[
                                    c.name.slice(dot + 1)];
                            }
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

    /* A Jobshop menu (ribbon Tools / View, or a right-click popup) at a
     * mouse event or under a node: items [{label, onclick} | '-' |
     * {label, items}] (a submenu ▸ opens in its place) */
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
        /* (UI.contextMenu draws the submenus beside their item) */
        UI.contextMenu(at, items.filter(Boolean));
    }

    /* "X by Status of ▸": one status (or All) at a time, the current one
     * marked */
    function statusItems(statuses, labels, current, choose) {
        return statuses.map(function (s) {
            return {label: labels[s] || 'All', checked: s === current,
                onclick: function () {
                    choose(s);
                }};
        });
    }

    /* Jobshop's read-only description beside a code (FOB Point ID, Terms
     * ID, Part ID...): the field shows the ID with the full name in its
     * tooltip; the description is the name without the ID. Not in grids
     * (they have their own Description columns). */
    function describe(container, places) {
        places = places || {};
        function update(input) {
            var box = input.closest('.picker');
            if (!box || box.closest('td') || !box.parentNode) {
                return;
            }
            var at = places[input.getAttribute('aria-label')];
            if (at === false) {
                /* (the window's ID: Jobshop has the Inactive box there) */
                return;
            }
            var layout = input.closest('.js-layout');
            var span = box.nextElementSibling;
            if (at && layout) {
                /* Jobshop's own box (type4) where its layout has it */
                span = box.jspDesc;
                if (!span) {
                    span = el('input.jsp-descbox', {type: 'text',
                        readonly: true, tabindex: -1, 'aria-label':
                            input.getAttribute('aria-label') +
                            ' description'});
                    var holder = el('div.js-ctl.jsp-placed', {style: {
                        left: 'calc(var(--u) * ' + at[0] + ')',
                        top: 'calc(var(--u) * ' + at[1] + ')',
                        width: 'calc(var(--u) * ' + (at[2] - at[0]) + ')',
                        height: 'calc(var(--u) * ' + (at[3] - at[1]) +
                            ')'}}, span);
                    layout.appendChild(holder);
                    box.jspDesc = span;
                }
            } else if (!span || !span.classList.contains('jsp-desc')) {
                span = el('span.jsp-desc.muted');
                box.parentNode.insertBefore(span, box.nextSibling);
            }
            var id = input.value || '';
            /* (a picker without a tooltip: its text is the full name) */
            var full = input.title || (at ? id : '');
            var text = '';
            if (full && id && full !== id) {
                if (full.indexOf('[' + id + ']') === 0) {
                    text = full.slice(id.length + 2);
                } else if (full.indexOf(id) === 0) {
                    text = full.slice(id.length);
                } else {
                    text = full;
                }
                text = text.replace(/^\s*-\s*/, '').trim();
            } else if (at && full === id) {
                /* (a code table without IDs, e.g. Terms: its name) */
                text = full;
            }
            if (span.tagName === 'INPUT') {
                span.value = text;
            } else {
                span.textContent = text;
            }
            span.title = text;
        }
        new MutationObserver(function (records) {
            records.forEach(function (r) {
                if (r.target.tagName === 'INPUT') {
                    update(r.target);
                }
            });
        }).observe(container, {attributes: true, attributeFilter: ['title'],
            subtree: true});
        function refresh() {
            Array.prototype.forEach.call(container.querySelectorAll(
                '.picker input'), function (input) {
                    if (input.title || places[input.getAttribute(
                            'aria-label')]) {
                        update(input);
                    }
                });
        }
        /* (a value set without a tooltip change: after a choice, a load) */
        container.addEventListener('focusout', function () {
            global.setTimeout(refresh, 300);
        });
        refresh();
        return refresh;
    }

    /* Created by / Last Modified by of a record (Jobshop's header) */
    function stamp(node, model, id) {
        UI.clear(node);
        if (!id) {
            return;
        }
        Rpc.searchRead(model, [['id', '=', id]], ['create_uid.rec_name',
            'create_date', 'write_uid.rec_name', 'write_date']).then(
            function (rows) {
                var r = rows[0];
                if (!r) {
                    return;
                }
                function who(user, when) {
                    return [(r[user + '.'] || {}).rec_name, r[when] ?
                        UI.date(r[when]) + ' ' + String(r[when]).slice(11,
                            16) : ''].filter(Boolean).join(' ');
                }
                node.appendChild(el('span', 'Created by ' +
                    who('create_uid', 'create_date')));
                if (r.write_date) {
                    node.appendChild(el('span', 'Last Modified by ' +
                        who('write_uid', 'write_date')));
                }
            }, function () {});
    }

    /* The part ID of a product as Jobshop shows it (full name: tooltip) */
    function partId(value) {
        var name = m2oText(value);
        return name ? el('span', {title: name}, UI.shortName(
            'product.product', name)) : '';
    }

    /* The Purchase Order Lines / Receiver Lines / RFQ Lines dialogs: a
     * read-only grid; double-click or right-click > Open… opens the
     * document */
    function linesDialog(title, heads, rows, options) {
        options = options || {};
        var close = null;
        close = UI.modal(title, el('div.jsp-dialog', table(heads, rows.map(
            options.cells), {
                onopen: options.open ? function (i) {
                    if (close) {
                        close();
                    }
                    options.open(rows[i]);
                } : null,
                oncontext: options.menu ? function (event, i) {
                    popup(event, options.menu(rows[i]));
                } : null,
                empty: options.empty || 'None.'})), [{label: 'Close',
                    primary: true}]);
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

    /* A supplier address (party.address) as Jobshop's address fields */
    function addressOf(id) {
        return Rpc.searchRead('party.address', [['id', '=', id]],
            ['party_name', 'party.rec_name', 'party.code', 'sequence',
                'street', 'city', 'postal_code', 'subdivision.code',
                'country.name', 'site_contact_name', 'site_contact_title',
                'site_contact_phone', 'site_contact_fax',
                'site_contact_email']).then(function (rows) {
                    var r = rows[0] || {};
                    var street = (r.street || '').split('\n');
                    var party = r['party.'] || {};
                    return {id: r.id, name: r.party_name || party.rec_name,
                        address_1: street[0] || '', address_2: street[1] ||
                            '', etc: street.slice(2).join(' '),
                        city: r.city, state: r['subdivision.'] ?
                            r['subdivision.'].code.split('-').pop() : '',
                        postal_code: r.postal_code, country: r['country.'] ?
                            r['country.'].name : '',
                        contact: r.site_contact_name,
                        title: r.site_contact_title,
                        phone: r.site_contact_phone,
                        fax: r.site_contact_fax,
                        email: r.site_contact_email, supplier: party.code ||
                            '', address_no: r.sequence};
                });
    }

    /* Jobshop's Export Contact to Outlook: the contact as a vCard file
     * (Outlook and the other address books open it) */
    function exportContact(a) {
        function esc(v) {
            return String(v || '').replace(/([,;\\])/g, '\\$1');
        }
        var who = a.contact || a.name || 'Contact';
        var card = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + esc(who),
            'ORG:' + esc(a.name), a.title ? 'TITLE:' + esc(a.title) : null,
            a.phone ? 'TEL;TYPE=WORK,VOICE:' + esc(a.phone) : null,
            a.fax ? 'TEL;TYPE=WORK,FAX:' + esc(a.fax) : null,
            a.mobile ? 'TEL;TYPE=CELL:' + esc(a.mobile) : null,
            a.email ? 'EMAIL;TYPE=INTERNET:' + esc(a.email) : null,
            'ADR;TYPE=WORK:;;' + esc([a.address_1, a.address_2, a.etc]
                .filter(Boolean).join(', ')) + ';' + esc(a.city) + ';' +
                esc(a.state) + ';' + esc(a.postal_code) + ';' +
                esc(a.country), 'END:VCARD'].filter(Boolean).join('\r\n');
        var link = el('a', {href: URL.createObjectURL(new Blob([card],
            {type: 'text/vcard'})), download: who.replace(/[^\w .-]+/g,
                '') + '.vcf'});
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    /* The buttons of a placed pane follow the window's lock */
    function lockButtons(node, on) {
        Array.prototype.forEach.call(node.querySelectorAll('button.js-btn'),
            function (b) {
                b.disabled = !on && !b.jspAlways;
            });
    }

    /* A Ship To tab (PO and RFQ): Jobshop's placed fields; the Name's
     * "..." drops ship to an address of a supplier (Ship To Supplier ID,
     * Address No), Clear Address, Export Contact to Outlook */
    function shipToTab(kind) {
        var c = null;
        var fields = addressFields('ship_to_', true).concat([
            {name: 'ship_to_supplier', label: 'Ship To Supplier ID',
                type: 'char', readonly: true, at: [462, 142, 662, 162],
                split: 100},
            {name: 'ship_to_address_no', label: 'Address No', type: 'char',
                readonly: true, at: [669, 142, 831, 162], split: 75}]);
        var current = function () {
            var a = {};
            ADDRESS_KEYS.forEach(function (k) {
                var key = {address_1: '_addr_1', address_2: '_addr_2',
                    etc: '_addr_etc'}[k] || k;
                a[k] = c['ship_to_' + key].get() || '';
            });
            return a;
        };
        var buttons = [
            {label: '\u2026', at: [433, 10, 453, 30], onclick: function () {
                UI.browse('party.address', {title:
                    'Drop ship to the address of',
                    domain: [['party.is_supplier', '=', true]],
                    columns: [{field: 'party.code', label: 'Supplier ID'},
                        {field: 'party.rec_name', label: 'Name'},
                        {field: 'sequence', label: 'Addr No'},
                        {field: 'rec_name', label: 'Address'}]}).then(
                    function (record) {
                        addressOf(record.id).then(fill, UI.showError);
                    }, function () {});
            }},
            {label: 'Clear Address', at: kind === 'rfq' ?
                [342, 169, 537, 199] : [171, 167, 366, 197],
                onclick: function () {
                    fill({});
                }}];
        if (kind !== 'rfq') {
            buttons.push({label: 'Export Contact to Outlook',
                at: [581, 167, 776, 197], onclick: function () {
                    exportContact(current());
                }});
        }
        var pane = fieldsPane(fields, {buttons: buttons});
        c = pane.controls;
        function fill(a) {
            ADDRESS_KEYS.forEach(function (k) {
                var key = {address_1: '_addr_1', address_2: '_addr_2',
                    etc: '_addr_etc'}[k] || k;
                c['ship_to_' + key].set(a[k] || '');
            });
            c.ship_to_supplier.set(a.supplier || '');
            c.ship_to_address_no.set(a.address_no || '');
        }
        return {
            node: el('div', pane.node, el('p.muted', 'Empty: your company ' +
                'address prints on the order.')),
            set: function (data) {
                pane.set(data);
                /* Address 1 / 2 / Etc.: the lines of the stored address */
                var lines = String(data && data.ship_to_street || '')
                    .split('\n');
                c.ship_to__addr_1.set(lines[0] || '');
                c.ship_to__addr_2.set(lines[1] || '');
                c.ship_to__addr_etc.set(lines.slice(2).join(' '));
            },
            get: function (values) {
                pane.get(values);
                values.ship_to_street = [values.ship_to__addr_1,
                    values.ship_to__addr_2, values.ship_to__addr_etc]
                    .filter(Boolean).join('\n');
                delete values.ship_to__addr_1;
                delete values.ship_to__addr_2;
                delete values.ship_to__addr_etc;
                values.ship_to_supplier = c.ship_to_supplier.get() || '';
                var no = c.ship_to_address_no.get();
                values.ship_to_address_no = no ? parseInt(no, 10) || null :
                    null;
                return values;
            },
            lock: function (on) {
                pane.lock(on);
                lockButtons(pane.node, on);
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
                /* (min: the cell's least width, so values are not cut) */
                if (c.min) {
                    control.node.style.minWidth = c.min + 'px';
                }
                return el('td' + (c.num ? '.num' : ''), c.width || c.min ?
                    {style: {width: c.width || null, minWidth: c.min ?
                        c.min + 'px' : null}} : null, control.node);
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
                    var p = fieldsPane(t.fields, t);
                    p.set(data);
                    p.lock(editable);
                    return {title: t.title, node: p.node, pane: p};
                }
                return {title: t.title, node: t.node};
            });
            tabSet(holder, panes);
            describe(holder);
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
                        /* Jobshop's columns, then the type and prices */
                        var heads = kind === 'service' ? ['Service ID',
                            'Part ID', 'Supplier Service ID', 'As Of',
                            'Expires', 'Service Description', 'Type',
                            'Prices'] : ['Part ID', 'Purchase U/M',
                            'Supplier Part ID', 'Mfg Name', 'Mfg Part ID',
                            'As of', 'Expires', 'Part Description', 'Type',
                            'Prices'];
                        var cells = rows.map(function (r) {
                            var prices = r.prices.map(function (p) {
                                return (p.quantity ? (r.price_type === 'upto' ?
                                    '≤' : '≥') + num(p.quantity) :
                                    (r.price_type === 'upto' ? 'more' :
                                        'base')) + ': ' + num(p.unit_price);
                            }).join('  ');
                            var type = r.price_type === 'upto' ? 'Up-to-Qty' :
                                'Break';
                            return kind === 'service' ? [partId(r.product),
                                partId(r.service_part), r.code,
                                UI.date(r.as_of_date),
                                UI.date(r.expiration_date), r.description,
                                type, prices] : [partId(r.product),
                                UI.shortName('product.uom', r.unit), r.code,
                                r.mfg_name, r.mfg_part_id,
                                UI.date(r.as_of_date),
                                UI.date(r.expiration_date), r.description,
                                type, prices];
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

    var PO_FILTER = ['all', 'unreleased', 'firm', 'released', 'closed',
        'hold', 'cancelled'];
    var RFQ_FILTER = ['all', 'unreleased', 'active', 'closed', 'cancelled'];
    var RFQ_LABEL = {unreleased: 'Unreleased', active: 'Active',
        closed: 'Closed', cancelled: 'Cancelled'};

    function openPo(id, number) {
        UI.openScreen('purchase-orders/' + id, 'PO ' + (number || ''));
    }

    /* Jobshop's Purchase Order Lines window (View > Purchase Order Lines /
     * All Purchase Order Lines by Order Status of): the lines of a domain */
    function poLinesDialog(title, domain) {
        var fields = ['purchase.number', 'purchase.party.code',
            'purchase.party.id', 'purchase.buyer', 'purchase.purchase_date',
            'purchase.jobshop_status', 'sequence', 'line_status', 'line_type',
            'quantity', 'received_quantity', 'product.rec_name',
            'description', 'unit.rec_name', 'list_unit_price', 'unit_price',
            'trade_discount', 'fixed_charge', 'amount', 'promise_date',
            'last_received_date', 'supplier_part_code', 'mfg_name',
            'mfg_part_id', 'product_code.rec_name',
            'commodity_code.rec_name', 'links'];
        Rpc.searchRead('purchase.line', domain.concat([['type', '=',
            'line']]), fields, {limit: 500, order: [['purchase', 'DESC'],
                ['sequence', 'ASC']]}).then(function (rows) {
            function rel(row, name) {
                var parts = name.split('.');
                var v = row;
                parts.forEach(function (p, i) {
                    v = v ? (i < parts.length - 1 ? v[p + '.'] : v[p]) :
                        null;
                });
                return v;
            }
            linesDialog(title, ['Linked', 'Purchase ID', 'Supplier ID',
                'Buyer', 'Order Date', 'Order Status', 'Line No',
                'Line Status', 'Type', {label: 'Order Qty', num: true},
                {label: 'Received Qty', num: true}, 'Part ID', 'Service ID',
                'Description', 'Purchase U/M', {label: 'Unit Price',
                    num: true}, {label: 'Disc %', num: true},
                {label: 'Fixed Charge', num: true}, {label: 'Order Amount',
                    num: true}, {label: 'Received Amount', num: true},
                'Promise Date', 'Last Recv Date', 'Supplier Part ID',
                'Mfg Name', 'Mfg Part ID', 'Product Code', 'Commodity Code'],
                rows, {
                    cells: function (r) {
                        var product = rel(r, 'product.rec_name');
                        var short = product ? UI.shortName('product.product',
                            product) : '';
                        var price = r.list_unit_price !== null &&
                            r.list_unit_price !== undefined ?
                            r.list_unit_price : r.unit_price;
                        return [(r.links || []).length ? '✔' : '',
                            rel(r, 'purchase.number'),
                            rel(r, 'purchase.party.code'),
                            rel(r, 'purchase.buyer'),
                            UI.date(rel(r, 'purchase.purchase_date')),
                            PO_STATUS[rel(r, 'purchase.jobshop_status')] || '',
                            String(r.sequence || ''),
                            r.line_status === 'closed' ? 'Closed' : 'Open',
                            r.line_type === 'service' ? 'Service' : 'Part',
                            num(r.quantity), num(r.received_quantity),
                            r.line_type === 'service' ? '' : short,
                            r.line_type === 'service' ? short : '',
                            r.description, UI.shortName('product.uom',
                                rel(r, 'unit.rec_name')), num(price),
                            num(r.trade_discount), num(r.fixed_charge),
                            UI.money(r.amount), UI.money(Math.round(
                                (r.received_quantity || 0) *
                                Number(r.unit_price || 0) * 100) / 100),
                            UI.date(r.promise_date),
                            UI.date(r.last_received_date),
                            r.supplier_part_code, r.mfg_name, r.mfg_part_id,
                            UI.shortName('nline.product_code',
                                rel(r, 'product_code.rec_name')),
                            UI.shortName('nline.commodity_code',
                                rel(r, 'commodity_code.rec_name'))];
                    },
                    open: function (r) {
                        openPo(r['purchase.'].id, rel(r, 'purchase.number'));
                    },
                    menu: function (r) {
                        return [
                            {label: 'View Work Order Links...', onclick:
                                function () {
                                    poLinkDialog(r);
                                }},
                            '-',
                            {label: 'Open Purchase Order...', onclick:
                                function () {
                                    openPo(r['purchase.'].id,
                                        rel(r, 'purchase.number'));
                                }},
                            {label: 'Open Supplier...', onclick: function () {
                                UI.openScreen('supplier-window/' +
                                    rel(r, 'purchase.party.id'), 'Supplier');
                            }}];
                    },
                    empty: 'No purchase order line.'});
        }, UI.showError);
    }

    /* View > Work Order Links of a purchase line */
    function poLinkDialog(line) {
        Rpc.searchRead('nline.purchase.link', [['purchase_line', '=',
            line.id]], ['production.rec_name', 'operation', 'piece',
            'quantity', 'received_quantity', 'reference',
            'work.rec_name'], {}).then(function (rows) {
            linesDialog('Work Order Links', ['Work ID', 'Seq No',
                'Piece No', {label: 'Quantity', num: true},
                {label: 'Received Quantity', num: true}, 'Operation'], rows, {
                    cells: function (k) {
                        return [(k['production.'] || {}).rec_name ||
                            k.reference, k.operation, k.piece,
                            num(k.quantity), num(k.received_quantity),
                            (k['work.'] || {}).rec_name];
                    },
                    empty: 'The line supplies no work order.'});
        }, UI.showError);
    }

    /* The supplier's purchase orders (Released by default); right-click:
     * Jobshop's PopupSupplierPurchaseOrders */
    function supplierPurchasesTab(pane, record) {
        var shown = 'released';
        function load() {
            Rpc.desk('js_supplier_purchases', [record.id, shown === 'all' ?
                SUPPLIER_STATUSES : [shown]]).then(function (rows) {
                    UI.clear(pane);
                    pane.appendChild(el('p.muted', 'Purchase orders by ' +
                        'status of: ' + (PO_STATUS[shown] || 'All') +
                        ' (right-click for the menu)'));
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
                            openPo(rows[i].id, rows[i].number);
                        }, oncontext: function (event, i) {
                            menu(event, rows[i]);
                        }, empty: 'No purchase order.'});
                    holder.addEventListener('contextmenu', function (event) {
                        if (!event.defaultPrevented) {
                            menu(event, null);
                        }
                    });
                    pane.appendChild(holder);
                }, UI.showError);
        }
        function menu(event, row) {
            popup(event, [
                {label: 'Purchase Orders by Status of', items: statusItems(
                    PO_FILTER, PO_STATUS, shown, function (s) {
                        shown = s;
                        load();
                    })},
                row ? {label: 'Purchase Order Lines...', onclick: function () {
                    poLinesDialog('Purchase Order Lines - ' + row.number,
                        [['purchase', '=', row.id]]);
                }} : null,
                {label: 'All Purchase Order Lines by Order Status of',
                    items: statusItems(PO_FILTER, PO_STATUS, null,
                        function (s) {
                            poLinesDialog('Purchase Order Lines - ' +
                                (record.code || record.rec_name) + ' (' +
                                (PO_STATUS[s] || 'All') + ')', [['purchase.party',
                                    '=', record.id]].concat(s === 'all' ? [] :
                                    [['purchase.jobshop_status', '=', s]]));
                        })},
                row ? '-' : null,
                row ? {label: 'Open Purchase Order...', onclick: function () {
                    openPo(row.id, row.number);
                }} : null]);
        }
        load();
    }

    /* The requests for quote the supplier is on (any of the 3 suppliers);
     * right-click: Jobshop's PopupSupplierRequestForQuotes */
    function supplierRfqsTab(pane, record) {
        var shown = 'all';
        function domain() {
            return [['OR', ['supplier_1', '=', record.id],
                ['supplier_2', '=', record.id],
                ['supplier_3', '=', record.id]]];
        }
        function load() {
            Rpc.searchRead('nline.rfq', domain().concat(shown === 'all' ? [] :
                [['status', '=', shown]]), ['number', 'status', 'rfq_date',
                'desired_receive_date', 'due_date', 'buyer'], {limit: 300,
                    order: [['rfq_date', 'DESC'], ['id', 'DESC']]}).then(
                function (rows) {
                    UI.clear(pane);
                    pane.appendChild(el('p.muted', 'RFQs by status of: ' +
                        (RFQ_LABEL[shown] || 'All') + ' (right-click for ' +
                        'the menu)'));
                    var holder = table(['ID', 'RFQ Status', 'RFQ Date',
                        'Receive On Date', 'Due Date', 'Buyer'],
                        rows.map(function (r) {
                            return [r.number, RFQ_LABEL[r.status] || r.status,
                                UI.date(r.rfq_date),
                                UI.date(r.desired_receive_date),
                                UI.date(r.due_date), r.buyer];
                        }), {onopen: function (i) {
                            UI.openScreen('rfqs/' + rows[i].id, 'RFQ ' +
                                rows[i].number);
                        }, oncontext: function (event, i) {
                            menu(event, rows[i]);
                        }, empty: 'No request for quote.'});
                    holder.addEventListener('contextmenu', function (event) {
                        if (!event.defaultPrevented) {
                            menu(event, null);
                        }
                    });
                    pane.appendChild(holder);
                }, UI.showError);
        }
        function menu(event, row) {
            popup(event, [
                {label: 'RFQs by Status of', items: statusItems(RFQ_FILTER,
                    RFQ_LABEL, shown, function (s) {
                        shown = s;
                        load();
                    })},
                row ? {label: 'RFQ Lines...', onclick: function () {
                    rfqLinesDialog('Request For Quote Lines - ' + row.number,
                        [['line.rfq', '=', row.id]], record.id);
                }} : null,
                {label: 'All RFQ Lines by RFQ Status of', items: statusItems(
                    RFQ_FILTER, RFQ_LABEL, null, function (s) {
                        rfqLinesDialog('Request For Quote Lines (' +
                            (RFQ_LABEL[s] || 'All') + ')', [['OR',
                                ['line.rfq.supplier_1', '=', record.id],
                                ['line.rfq.supplier_2', '=', record.id],
                                ['line.rfq.supplier_3', '=', record.id]]]
                            .concat(s === 'all' ? [] : [['line.rfq.status',
                                '=', s]]), record.id);
                    })},
                row ? '-' : null,
                row ? {label: 'Open RFQ...', onclick: function () {
                    UI.openScreen('rfqs/' + row.id, 'RFQ ' + row.number);
                }} : null]);
        }
        load();
    }

    /* Jobshop's Request For Quote Lines window: one row per quoted
     * quantity, the three suppliers' prices side by side */
    function rfqLinesDialog(title, domain) {
        var fields = ['line.rfq.id', 'line.rfq.number', 'line.rfq.rfq_date',
            'line.rfq.status', 'line.sequence', 'quantity',
            'line.unit.rec_name', 'line.rfq.supplier_1.code',
            'line.rfq.supplier_2.code', 'line.rfq.supplier_3.code',
            'line.product_code.rec_name', 'line.commodity_code.rec_name'];
        [1, 2, 3].forEach(function (s) {
            fields.push('unit_price_' + s, 'trade_discount_' + s,
                'delivery_date_' + s);
        });
        Rpc.searchRead('nline.rfq.line.price', domain, fields, {limit: 500,
            order: [['line', 'DESC'], ['quantity', 'ASC']]}).then(
            function (rows) {
                function rel(row, name) {
                    var parts = name.split('.');
                    var v = row;
                    parts.forEach(function (p, i) {
                        v = v ? (i < parts.length - 1 ? v[p + '.'] : v[p]) :
                            null;
                    });
                    return v;
                }
                var heads = ['RFQ ID', 'RFQ Date', 'RFQ Status', 'Line No',
                    {label: 'Quote Qty', num: true}, 'Purchase U/M'];
                [1, 2, 3].forEach(function (s) {
                    heads.push('Supplier ID (' + s + ')', {label:
                        'Unit Price (' + s + ')', num: true}, {label:
                        'Disc % (' + s + ')', num: true},
                        'Delivery Date (' + s + ')');
                });
                heads.push('Product Code', 'Commodity Code');
                linesDialog(title, heads, rows, {
                    cells: function (r) {
                        var cells = [rel(r, 'line.rfq.number'),
                            UI.date(rel(r, 'line.rfq.rfq_date')),
                            RFQ_LABEL[rel(r, 'line.rfq.status')] || '',
                            String(rel(r, 'line.sequence') || ''),
                            num(r.quantity), UI.shortName('product.uom',
                                rel(r, 'line.unit.rec_name'))];
                        [1, 2, 3].forEach(function (s) {
                            cells.push(rel(r, 'line.rfq.supplier_' + s +
                                '.code'), num(r['unit_price_' + s]),
                                num(r['trade_discount_' + s]),
                                UI.date(r['delivery_date_' + s]));
                        });
                        cells.push(UI.shortName('nline.product_code',
                            rel(r, 'line.product_code.rec_name')),
                            UI.shortName('nline.commodity_code',
                                rel(r, 'line.commodity_code.rec_name')));
                        return cells;
                    },
                    open: function (r) {
                        UI.openScreen('rfqs/' + rel(r, 'line.rfq.id'), 'RFQ ' +
                            rel(r, 'line.rfq.number'));
                    },
                    menu: function (r) {
                        return [{label: 'Open RFQ...', onclick: function () {
                            UI.openScreen('rfqs/' + rel(r, 'line.rfq.id'),
                                'RFQ ' + rel(r, 'line.rfq.number'));
                        }}];
                    },
                    empty: 'No request for quote line.'});
            }, UI.showError);
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

    /* ---- Suppliers, modern view (UI.docPage) ---------------------------
     * The supplier as a master record: name and ID, what needs attention
     * (inactive, no terms, no contact, no address, late orders), its open
     * purchase orders, cards of the address, contact, purchasing defaults,
     * accounting, specs and user fields; the paper trail = its latest
     * orders and receipts. Loaded and saved as party.party (the classic
     * window's fields). */

    var SUPPLIER_CHAR = ['code', 'name', 'supplier_address_1',
        'supplier_address_2', 'supplier_city', 'supplier_state',
        'supplier_postal_code', 'supplier_country', 'supplier_address_etc',
        'supplier_contact', 'supplier_contact_title', 'supplier_phone',
        'supplier_fax', 'supplier_email', 'supplier_mobile',
        'supplier_web_url', 'supplier_buyer', 'supplier_our_customer_id',
        'supplier_tax_id_number', 'supplier_specifications',
        'supplier_rfq_instructions', 'supplier_po_instructions',
        'supplier_user_0', 'supplier_user_1', 'supplier_user_2',
        'supplier_open_date', 'supplier_last_order_date',
        'supplier_exported_date', 'supplier_inactive', 'supplier_exported',
        'supplier_tax_exempt', 'supplier_freight_terms', 'payable'];
    var SUPPLIER_M2O = ['supplier_payment_term', 'supplier_tax_group',
        'supplier_fob_point', 'supplier_ship_via', 'supplier_expense_account',
        'account_payable'];

    function m2oOf(record, name) {
        var related = record[name + '.'];
        return record[name] ? {id: record[name], rec_name: related ?
            related.rec_name : String(record[name])} : null;
    }

    function loadSupplier(id) {
        return Rpc.model('party.party', 'read', [[id],
            SUPPLIER_CHAR.concat(SUPPLIER_M2O, SUPPLIER_M2O.map(function (n) {
                return n + '.rec_name';
            }), ['rec_name'])]).then(function (rows) {
                var d = rows[0];
                SUPPLIER_M2O.forEach(function (n) {
                    d[n] = m2oOf(d, n);
                    delete d[n + '.'];
                });
                /* Its orders and latest receipts (none if not allowed) */
                return Promise.all([
                    Rpc.desk('js_supplier_purchases', [id,
                        SUPPLIER_STATUSES]).catch(function () {
                            return [];
                        }),
                    Rpc.searchRead('stock.shipment.in', [['supplier', '=', id],
                        ['state', '=', 'done']], ['number', 'effective_date',
                        'reference', 'supplier_invoice'], {limit: 5, order: [
                            ['effective_date', 'DESC'], ['id', 'DESC']]})
                        .catch(function () {
                            return [];
                        })]).then(function (all) {
                    d.purchases = all[0];
                    d.receipts = all[1];
                    return d;
                });
            });
    }

    function supplierModern(main, openId) {
        var access = {};
        var screens = {};
        var page;
        Promise.all([UI.access(['party.party', 'purchase.purchase',
            'nline.rfq']), UI.screenAllowed('purchase-orders/new'),
            UI.screenAllowed('rfqs')]).then(function (all) {
                access = all[0] || {};
                screens = {po: all[1], rfq: all[2]};
                if (page) {
                    page.render();
                }
            });
        function can(model, right) {
            return Boolean(access[model] && access[model][right]);
        }
        function mayWrite(d) {
            return can('party.party', d && d.id ? 'write' : 'create');
        }
        function canPo() {
            return can('purchase.purchase', 'create') && screens.po;
        }
        function canRfq() {
            return can('nline.rfq', 'create') && screens.rfq;
        }
        function money(v) {
            return UI.money(n0(v), true);
        }
        function newPo(d) {
            UI.openScreen('purchase-orders/new?supplier=' + d.id, 'New PO');
        }
        function newRfq(d) {
            UI.openScreen('rfqs?supplier=' + d.id, 'New RFQ');
        }
        function edit(title, fields, d) {
            UI.docEdit(title, fields, d).then(function (v) {
                page.save(v).then(null, function () {});
            }, function () {});
        }
        function openPurchases(d) {
            return (d.purchases || []).filter(function (p) {
                return p.status !== 'closed' && p.status !== 'cancelled';
            });
        }
        function late(p) {
            var due = p.promise_date || p.delivery_date;
            return p.status === 'released' && due && due < today() &&
                n0(p.received_amount) < n0(p.total_amount);
        }
        function address(d) {
            return [d.supplier_address_1, d.supplier_address_2,
                d.supplier_address_etc, [d.supplier_city, d.supplier_state,
                    d.supplier_postal_code].filter(Boolean).join(' '),
                d.supplier_country].filter(Boolean).join(', ');
        }
        function web(d) {
            var url = d.supplier_web_url;
            global.open(/^https?:/i.test(url) ? url : 'http://' + url,
                '_blank', 'noopener');
        }

        var CONTACT = [
            {name: 'supplier_contact', label: 'Contact', type: 'char'},
            {name: 'supplier_contact_title', label: 'Title', type: 'char'},
            {name: 'supplier_phone', label: 'Phone', type: 'char'},
            {name: 'supplier_fax', label: 'Fax', type: 'char'},
            {name: 'supplier_email', label: 'E-mail', type: 'char'},
            {name: 'supplier_mobile', label: 'Mobile', type: 'char'},
            {name: 'supplier_web_url', label: 'Web URL', type: 'char'}];
        var ADDRESS = [
            {name: 'supplier_address_1', label: 'Address', type: 'char'},
            {name: 'supplier_address_2', label: 'Address 2', type: 'char'},
            {name: 'supplier_city', label: 'City', type: 'char'},
            {name: 'supplier_state', label: 'State', type: 'char'},
            {name: 'supplier_postal_code', label: 'Postal code',
                type: 'char'},
            {name: 'supplier_country', label: 'Country', type: 'char'},
            {name: 'supplier_address_etc', label: 'Etc.', type: 'char'}];

        page = UI.docPage(main, {
            title: 'Supplier',
            crumbs: ['Purchasing', 'Suppliers'],
            model: 'party.party', label: 'Supplier ID',
            domain: [['is_supplier', '=', true]],
            order: [['code', 'ASC'], ['name', 'ASC']],
            openId: openId,
            load: loadSupplier,
            /* (party.party writes only the fields it gets: the changes) */
            values: function () {
                return {};
            },
            save: function (values, d) {
                Object.keys(values).forEach(function (k) {
                    if (values[k] === undefined) {
                        delete values[k];
                    }
                });
                if (d.id) {
                    return Rpc.model('party.party', 'write', [[d.id], values])
                        .then(function () {
                            return loadSupplier(d.id);
                        });
                }
                if (!values.name) {
                    return Promise.reject({message: 'Enter the supplier\'s ' +
                        'name first.'});
                }
                if (!values.code) {
                    delete values.code;
                }
                return Rpc.model('party.party', 'create', [[Object.assign({
                    is_supplier: true, supplier_open_date: Rpc.date(today())},
                    values)]]).then(function (ids) {
                        UI.setTitle('Supplier');
                        return loadSupplier(ids[0]);
                    });
            },
            blank: function () {
                return {id: null, name: '', code: '', purchases: [],
                    receipts: [], supplier_open_date: today()};
            },
            head: function (d) {
                var last = d.supplier_last_order_date;
                return {
                    title: d.name || 'New supplier',
                    chips: d.code ? [d.code] : [],
                    sub: [d.id ? null : 'Not saved yet',
                        d.supplier_open_date ? 'supplier since ' +
                            UI.date(d.supplier_open_date) : null,
                        last ? 'last order ' + UI.date(last) : d.id ?
                            'no order yet' : null,
                        d.supplier_buyer ? 'buyer ' + d.supplier_buyer : null],
                    amount: d.id ? {value: money(d.payable), label:
                        'open balance' + (d.supplier_payment_term ? ' · ' +
                            d.supplier_payment_term.rec_name : '')} : null
                };
            },
            status: function (d) {
                if (!d.id) {
                    return [];
                }
                return [d.supplier_inactive ? {text: 'Inactive', tone: 'bad'} :
                    {text: 'Active', tone: 'ok'},
                    d.supplier_tax_exempt ? {text: 'Tax exempt'} : null,
                    d.supplier_exported ? {text: 'Exported ' + UI.date(
                        d.supplier_exported_date)} : null,
                    {text: openPurchases(d).length + ' open orders'}]
                    .filter(Boolean);
            },
            actions: function (d) {
                if (!d.id) {
                    return [mayWrite(d) ? {label: 'Name the supplier',
                        primary: true, onclick: function () {
                            edit('New supplier', [
                                {name: 'name', label: 'Name', type: 'char',
                                    wide: true},
                                {name: 'code', label: 'Supplier ID (blank: ' +
                                    'the next number)', type: 'char'}], d);
                        }} : null];
                }
                return [
                    canPo() && !d.supplier_inactive ? {label: 'New purchase ' +
                        'order', key: 'o', primary: true, onclick: newPo} :
                        null,
                    canRfq() && !d.supplier_inactive ? {label: 'Request a ' +
                        'quote', key: 'q', onclick: newRfq} : null,
                    d.supplier_web_url ? {label: 'Web site', onclick: web} :
                        null];
            },
            more: function (d) {
                if (!d.id) {
                    return [];
                }
                return [
                    mayWrite(d) ? {label: d.supplier_inactive ? 'Make active' :
                        'Make inactive', onclick: function () {
                            page.save({supplier_inactive:
                                !d.supplier_inactive}).then(null,
                                function () {});
                        }} : null,
                    {label: 'Part and service prices', onclick: function () {
                        toClassic(main, 'supplier', 'jsSupplierWindow',
                            [d.id]);
                    }},
                    {label: 'Addresses', onclick: function () {
                        toClassic(main, 'supplier', 'jsSupplierWindow',
                            [d.id]);
                    }},
                    '-',
                    {label: 'Classic view', onclick: function () {
                        toClassic(main, 'supplier', 'jsSupplierWindow',
                            [d.id]);
                    }}].filter(Boolean);
            },
            attention: function (d) {
                var out = [];
                var w = mayWrite(d);
                if (!d.id) {
                    return [{tone: 'info', title: 'Name the supplier',
                        detail: 'A supplier needs its name before it can be ' +
                            'saved; the ID is the next number if left blank.',
                        action: w ? {label: 'Name it', onclick: function () {
                            edit('New supplier', [
                                {name: 'name', label: 'Name', type: 'char',
                                    wide: true},
                                {name: 'code', label: 'Supplier ID (blank: ' +
                                    'the next number)', type: 'char'}], d);
                        }} : null}];
                }
                if (d.supplier_inactive) {
                    out.push({tone: 'bad', title: 'Inactive', detail: 'It is ' +
                        'left out of the supplier lookups: no new order or ' +
                        'quote request goes to it.', action: w ? {label:
                            'Make active', onclick: function () {
                                page.save({supplier_inactive: false}).then(
                                    null, function () {});
                            }} : null});
                }
                if (!d.supplier_payment_term) {
                    out.push({tone: 'warn', title: 'No payment terms',
                        detail: 'New purchase orders would have no terms.',
                        action: w ? {label: 'Set terms', onclick: function () {
                            edit('Payment terms', [{name:
                                'supplier_payment_term', label: 'Terms',
                                type: 'many2one', model:
                                    'account.invoice.payment_term'}], d);
                        }} : null});
                }
                if (!d.supplier_contact && !d.supplier_phone &&
                        !d.supplier_email) {
                    out.push({tone: 'warn', title: 'No contact', detail:
                        'No contact name, phone or e-mail to send orders to.',
                        action: w ? {label: 'Add contact', onclick:
                            function () {
                                edit('Contact', CONTACT, d);
                            }} : null});
                }
                if (!d.supplier_address_1 && !d.supplier_city) {
                    out.push({tone: 'warn', title: 'No address', detail:
                        'Orders print without the supplier\'s address.',
                        action: w ? {label: 'Add address', onclick:
                            function () {
                                edit('Address', ADDRESS, d);
                            }} : null});
                }
                var lates = openPurchases(d).filter(late);
                if (lates.length) {
                    out.push({tone: 'bad', icon: 'clock', title: lates.length +
                        (lates.length > 1 ? ' orders are' : ' order is') +
                        ' late', detail: lates.slice(0, 5).map(function (p) {
                            return 'PO ' + p.number + ' (' + UI.date(
                                p.promise_date || p.delivery_date) + ')';
                        }).join(', '), action: {label: 'Open PO ' +
                            lates[0].number, onclick: function () {
                                openPo(lates[0].id, lates[0].number);
                            }}});
                }
                return out;
            },
            sections: [{title: 'Open purchase orders', note: function (d) {
                var open = openPurchases(d);
                var due = open.reduce(function (a, p) {
                    return a + n0(p.total_amount) - n0(p.received_amount);
                }, 0);
                return open.length ? money(due) + ' still to come' : '';
            }, visible: function (d) {
                return Boolean(d.id);
            }, render: function (pane, d) {
                var open = openPurchases(d);
                UI.docLines(pane, {
                    items: open,
                    kind: function () {
                        return {icon: 'doc', tone: 'part'};
                    },
                    title: function (p) {
                        return 'PO ' + p.number;
                    },
                    chips: function (p) {
                        var due = p.promise_date || p.delivery_date;
                        return [{text: PO_STATUS[p.status] || p.status, tone:
                            p.status === 'released' ? 'accent' : p.status ===
                            'hold' ? 'warn' : null},
                            'ordered ' + UI.date(p.purchase_date),
                            due ? {text: (p.promise_date ? 'promised ' :
                                'wanted ') + UI.date(due) + (late(p) ?
                                ', late' : ''), tone: late(p) ? 'bad' :
                                null} : null];
                    },
                    progress: function (p) {
                        var t = n0(p.total_amount), r = n0(p.received_amount);
                        return {done: r, total: t, label: money(r) +
                            ' received'};
                    },
                    right: function (p) {
                        return [money(p.total_amount), p.last_received_date ?
                            'last in ' + UI.date(p.last_received_date) : ''];
                    },
                    onclick: function (p) {
                        openPo(p.id, p.number);
                    },
                    empty: 'No open purchase order.',
                    add: canPo() && !d.supplier_inactive ? {placeholder:
                        'Start a purchase order', onclick: function () {
                            newPo(d);
                        }} : null,
                    footer: [open.length + ' open', 'Total ' + money(
                        open.reduce(function (a, p) {
                            return a + n0(p.total_amount);
                        }, 0))]
                });
            }}],
            cards: [
                {title: 'Address', rows: function (d) {
                    return [['Name', d.name], ['Address', address(d)]];
                }, fields: [{name: 'name', label: 'Name', type: 'char'}]
                    .concat(ADDRESS), editable: mayWrite},
                {title: 'Contact', rows: function (d) {
                    return [['Contact', [d.supplier_contact,
                        d.supplier_contact_title].filter(Boolean)
                        .join(', ')], ['Phone', d.supplier_phone],
                        ['Fax', d.supplier_fax], ['E-mail', d.supplier_email],
                        ['Mobile', d.supplier_mobile],
                        ['Web', d.supplier_web_url]];
                }, fields: CONTACT, editable: mayWrite},
                {title: 'Purchasing defaults', rows: function (d) {
                    return [['Terms', d.supplier_payment_term &&
                        d.supplier_payment_term.rec_name],
                        ['Buyer', d.supplier_buyer],
                        ['Ship via', d.supplier_ship_via &&
                            UI.shortName('nline.ship_via',
                                d.supplier_ship_via.rec_name)],
                        ['FOB', d.supplier_fob_point && UI.shortName(
                            'nline.fob_point', d.supplier_fob_point.rec_name)],
                        ['Freight', (FREIGHT.filter(function (f) {
                            return f[0] === d.supplier_freight_terms;
                        })[0] || [])[1]],
                        ['Tax group', d.supplier_tax_group &&
                            d.supplier_tax_group.rec_name],
                        ['Our customer ID', d.supplier_our_customer_id]];
                }, fields: [
                    {name: 'supplier_payment_term', label: 'Terms',
                        type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'supplier_buyer', label: 'Buyer', type: 'char'},
                    {name: 'supplier_ship_via', label: 'Ship via',
                        type: 'many2one', model: 'nline.ship_via'},
                    {name: 'supplier_fob_point', label: 'FOB point',
                        type: 'many2one', model: 'nline.fob_point'},
                    {name: 'supplier_freight_terms', label: 'Freight terms',
                        type: 'selection', options: FREIGHT},
                    {name: 'supplier_tax_group', label: 'Tax group',
                        type: 'many2one', model: 'account.tax',
                        domain: TAX_GROUP_DOMAIN},
                    {name: 'supplier_tax_exempt', label: 'Tax exempt',
                        type: 'boolean'},
                    {name: 'supplier_our_customer_id', label:
                        'Our customer ID', type: 'char'}],
                    editable: mayWrite},
                {title: 'Accounting', rows: function (d) {
                    return [['Payable', d.account_payable &&
                        d.account_payable.rec_name],
                        ['Expense', d.supplier_expense_account &&
                            d.supplier_expense_account.rec_name],
                        ['Tax ID number', d.supplier_tax_id_number],
                        ['Opened', d.supplier_open_date ? UI.date(
                            d.supplier_open_date) : null],
                        ['Exported', d.supplier_exported ? 'Yes' +
                            (d.supplier_exported_date ? ', ' + UI.date(
                                d.supplier_exported_date) : '') : 'No']];
                }, fields: [
                    {name: 'account_payable', label: 'Payable account',
                        type: 'many2one', model: 'account.account', domain: [
                            ['type.payable', '=', true],
                            ['closed', '!=', true]]},
                    {name: 'supplier_expense_account', label:
                        'Expense account', type: 'many2one',
                        model: 'account.account', domain: EXPENSE_DOMAIN},
                    {name: 'supplier_tax_id_number', label: 'Tax ID number',
                        type: 'char'},
                    {name: 'supplier_open_date', label: 'Account opened',
                        type: 'date'},
                    {name: 'supplier_exported', label: 'Exported',
                        type: 'boolean'}],
                    editable: mayWrite},
                {title: 'Specs and instructions', rows: function (d) {
                    function cut(t) {
                        return t ? String(t).slice(0, 160) : null;
                    }
                    return [['Specs', cut(d.supplier_specifications)],
                        ['On quote requests', cut(
                            d.supplier_rfq_instructions)],
                        ['On orders', cut(d.supplier_po_instructions)]];
                }, fields: [
                    {name: 'supplier_specifications', label: 'Specs',
                        type: 'text'},
                    {name: 'supplier_rfq_instructions', label:
                        'Special instructions on quote requests',
                        type: 'text'},
                    {name: 'supplier_po_instructions', label:
                        'Special instructions on purchase orders',
                        type: 'text'}], editable: mayWrite},
                /* Jobshop's user fields N-Line fills (Other tab) */
                {title: 'Other', rows: function (d) {
                    return [['N-Line field', d.supplier_user_0],
                        ['Notes', d.supplier_user_1],
                        ['Audit date', d.supplier_user_2]];
                }, fields: [
                    {name: 'supplier_user_0', label: 'N-Line field',
                        type: 'char'},
                    {name: 'supplier_user_1', label: 'Notes', type: 'char'},
                    {name: 'supplier_user_2', label: 'Audit date',
                        type: 'char'}], editable: mayWrite}
            ],
            trail: function (d) {
                if (!d.id) {
                    return [];
                }
                var rows = [{done: Boolean(d.supplier_open_date), text:
                    'Account opened', when: d.supplier_open_date ?
                        UI.date(d.supplier_open_date) : 'not set'}];
                (d.purchases || []).slice(0, 5).forEach(function (p) {
                    rows.push({done: true, text: 'PO ' + p.number + ' · ' +
                        (PO_STATUS[p.status] || p.status) + ' · ' +
                        money(p.total_amount), when: UI.date(p.purchase_date),
                        onclick: function () {
                            openPo(p.id, p.number);
                        }});
                });
                (d.receipts || []).forEach(function (r) {
                    rows.push({done: true, text: 'Received ' + (r.number ||
                        r.id) + (r.reference ? ' · slip ' + r.reference :
                            '') + (r.supplier_invoice ? ' · bill ' +
                                r.supplier_invoice : ''), when: UI.date(
                        r.effective_date), onclick: function () {
                            UI.openScreen('receiving?receipt=' + r.id,
                                'Receiver ' + (r.number || ''));
                        }});
                });
                if (!(d.purchases || []).length) {
                    rows.push({text: 'No purchase order yet'});
                }
                rows.push({text: 'Notes', onclick: function () {
                    var pane = el('div', {style: {minWidth: '480px'}});
                    UI.notesTab(pane, 'party.party', d.id, mayWrite(d));
                    UI.modal('Notes: ' + d.name, pane);
                }});
                return rows;
            },
            keys: {
                o: {label: 'new purchase order', run: function (d) {
                    if (d.id && canPo() && !d.supplier_inactive) {
                        newPo(d);
                    }
                }},
                q: {label: 'request a quote', run: function (d) {
                    if (d.id && canRfq() && !d.supplier_inactive) {
                        newRfq(d);
                    }
                }}
            },
            classic: function (d) {
                toClassic(main, 'supplier', 'jsSupplierWindow', d && d.id ?
                    [d.id] : []);
            }
        });
        return page;
    }

    Screens.jsSupplierWindow = function (main, params) {
        var host = docHost(main, 'supplier');
        if (host) {
            supplierModern(host, params && params[0] ? parseInt(params[0],
                10) : null);
            return;
        }
        classicSupplierWindow(main, params);
    };

    function classicSupplierWindow(main, params) {
        css();
        Promise.all([rights(['purchase.product_supplier',
            'purchase.purchase', 'nline.rfq']),
            UI.screenAllowed('purchase-orders/new'),
            UI.screenAllowed('rfqs')]).then(function (all) {
            var r = all[0];
            var canPrices = r['purchase.product_supplier'].write &&
                r['purchase.product_supplier'].create;
            /* (what the user may not open is not offered) */
            var canPo = r['purchase.purchase'].create && all[1];
            var canRfq = r['nline.rfq'].create && all[2];
            var stampNode = el('span.jsp-stamp');
            var refreshDesc = null;
            function toolsButton() {
                return Array.prototype.filter.call(main.querySelectorAll(
                    '.ribbon button'), function (b) {
                        return b.textContent === 'Tools ▾';
                    })[0];
            }
            UI.master(main, {
                title: 'Suppliers',
                model: 'party.party',
                label: 'Supplier ID',
                domain: [['is_supplier', '=', true]],
                order: [['code', 'ASC'], ['name', 'ASC']],
                open: params && params[0] ? parseInt(params[0], 10) : null,
                defaults: {is_supplier: true, supplier_open_date:
                    Rpc.date(UI.today())},
                /* Jobshop's ID field: the first field of the first tab */
                idAt: [18, 30, 391, 50],
                idSplit: 120,
                idField: 'code',
                idLength: 15,
                tabs: [
                    /* Jobshop's Suppliers tab (layouts VPurchasing\
                     * Supplier): the address on the left, the contact on
                     * the right, the account dates below */
                    {title: 'Suppliers', frames: [
                        {label: '', at: [10, 49, 451, 214]},
                        {label: '', at: [459, 49, 820, 214]}], fields: [
                        {name: 'supplier_inactive', label: 'Inactive',
                            type: 'boolean', default: false,
                            at: [393, 30, 455, 50]},
                        {name: 'name', label: 'Name', type: 'char',
                            at: [18, 52, 443, 72], split: 120},
                        {name: 'supplier_address_1', label: 'Address',
                            type: 'char', at: [18, 74, 443, 94], split: 120},
                        {name: 'supplier_address_2', label: '',
                            type: 'char', at: [138, 96, 443, 116], split: 0},
                        {name: 'supplier_city', label: 'City', type: 'char',
                            at: [18, 118, 361, 138], split: 120},
                        {name: 'supplier_state', label: 'State/Postal',
                            type: 'char', at: [18, 140, 254, 160],
                            split: 120},
                        {name: 'supplier_postal_code', label: '',
                            type: 'char', at: [256, 140, 361, 160],
                            split: 0},
                        {name: 'supplier_country', label: 'Country',
                            type: 'char', at: [18, 162, 361, 182],
                            split: 120},
                        {name: 'supplier_address_etc', label: 'Etc.',
                            type: 'char', at: [18, 184, 443, 204],
                            split: 120},
                        {name: 'supplier_contact', label: 'Contact',
                            type: 'char', at: [467, 52, 809, 72], split: 120},
                        {name: 'supplier_contact_title', label: 'Title',
                            type: 'char', at: [467, 74, 809, 94], split: 120},
                        {name: 'supplier_phone', label: 'Phone',
                            type: 'char', at: [467, 96, 809, 116],
                            split: 120},
                        {name: 'supplier_fax', label: 'Fax', type: 'char',
                            at: [467, 118, 809, 138], split: 120},
                        {name: 'supplier_email', label: 'E-mail',
                            type: 'char', at: [467, 140, 809, 160],
                            split: 120},
                        {name: 'supplier_mobile', label: 'Mobile',
                            type: 'char', at: [467, 162, 809, 182],
                            split: 120},
                        {name: 'supplier_web_url', label: 'Web URL',
                            type: 'char', at: [467, 184, 809, 204],
                            split: 120},
                        {name: 'supplier_open_date', label:
                            'Account Opened Date', type: 'date',
                            at: [20, 220, 261, 240], split: 120},
                        {name: 'supplier_last_order_date', label:
                            'Last Order Date', type: 'date', readonly: true,
                            at: [263, 220, 493, 240], split: 105},
                        {name: 'supplier_exported', label: 'Exported',
                            type: 'boolean', at: [540, 220, 627, 240]},
                        {name: 'supplier_exported_date', label: 'Date',
                            type: 'date', readonly: true,
                            at: [634, 220, 809, 240], split: 46}]},
                    /* (Jobshop's first frame ends at 113, through the Tax
                     * ID row: the frames here enclose their rows) */
                    {title: 'General', frames: [
                        {label: '', at: [11, 7, 760, 137]},
                        {label: '', at: [11, 143, 762, 349]}], fields: [
                        {name: 'supplier_buyer', label: 'Buyer',
                            type: 'char', at: [21, 10, 336, 30], split: 140},
                        {name: 'supplier_our_customer_id', label:
                            'Our Customer ID', type: 'char',
                            at: [21, 32, 336, 52], split: 140},
                        {name: 'supplier_payment_term', label: 'Terms ID',
                            type: 'many2one',
                            model: 'account.invoice.payment_term',
                            at: [22, 69, 337, 89], split: 140},
                        {name: 'supplier_tax_group', label:
                            'Default Tax Group', type: 'many2one',
                            model: 'account.tax', domain: TAX_GROUP_DOMAIN,
                            at: [22, 91, 337, 111], split: 140},
                        {name: 'supplier_tax_id_number', label:
                            'Tax ID Number', type: 'char',
                            at: [22, 113, 337, 133], split: 140},
                        {name: 'supplier_tax_exempt', label: 'Tax Exempt',
                            type: 'boolean', at: [339, 113, 514, 133]},
                        {name: 'supplier_freight_terms', label:
                            'Freight Terms', type: 'selection',
                            options: FREIGHT, at: [22, 151, 337, 172],
                            split: 140},
                        {name: 'supplier_fob_point', label: 'FOB Point ID',
                            type: 'many2one', model: 'nline.fob_point',
                            at: [22, 174, 337, 194], split: 140},
                        {name: 'supplier_ship_via', label: 'Ship Via ID',
                            type: 'many2one', model: 'nline.ship_via',
                            at: [22, 196, 337, 216], split: 140},
                        {name: 'supplier_expense_account', label:
                            'Expense Acct ID', type: 'many2one',
                            model: 'account.account', domain: [['type',
                                '!=', null], ['closed', '!=', true]],
                            at: [22, 259, 337, 279], split: 140},
                        {name: 'account_payable', label:
                            'Payable Acct ID', type: 'many2one',
                            model: 'account.account', domain: [
                                ['type.payable', '=', true],
                                ['closed', '!=', true]],
                            at: [22, 281, 337, 301], split: 140},
                        /* (SIC Code ID and Alternate Currency ID are unused
                         * at N-Line: their rows stay empty. The open
                         * balance, not in Jobshop, sits under the frame) */
                        {name: 'payable', label: 'Open balance',
                            type: 'money', readonly: true,
                            at: [22, 357, 337, 377], split: 140}]},
                    /* User defined fields N-Line fills (labels of
                     * Jobshop's purchasing settings) */
                    {title: 'Other', frames: [{label: 'User Defined Fields',
                        at: [7, 4, 824, 271]}], fields: [
                        {name: 'supplier_user_0', label: 'N-LINE FIELD',
                            type: 'char', at: [21, 24, 391, 44], split: 110},
                        {name: 'supplier_user_1', label: 'NOTES:',
                            type: 'char', at: [21, 45, 391, 65], split: 110},
                        {name: 'supplier_user_2', label: 'AUDIT DATE:',
                            type: 'char', at: [21, 66, 391, 86],
                            split: 110}]},
                    {title: 'Addresses', lines: {name: 'addresses',
                        model: 'party.address', inverse: 'party',
                        order: [['sequence', 'ASC'], ['id', 'ASC']],
                        fields: [
                            {name: 'sequence', label: 'Addr No',
                                type: 'integer', readonly: true},
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
                                'Contact E-mail', type: 'char'}]}},
                    {title: 'Part Prices', render: pricesTab('part',
                        canPrices)},
                    {title: 'Service Prices', render: pricesTab('service',
                        canPrices)},
                    {title: 'Specs', fields: [
                        {name: 'supplier_specifications', label:
                            'Specifications', type: 'text', span: 4,
                            rows: 12}]},
                    {title: 'Special Instructions', frames: [
                        {label: 'Request For Quotes', at: [3, 5, 407, 164]},
                        {label: 'Purchase Orders', at: [416, 5, 820, 164]}],
                        fields: [
                        {name: 'supplier_rfq_instructions', label: '',
                            type: 'text', at: [18, 25, 392, 157], split: 0},
                        {name: 'supplier_po_instructions', label: '',
                            type: 'text', at: [428, 25, 806, 157],
                            split: 0}]},
                    {notes: true},
                    {title: 'Request For Quotes', render: supplierRfqsTab},
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
                onload: function (record) {
                    stamp(stampNode, 'party.party', record.id);
                    if (refreshDesc) {
                        refreshDesc();
                    }
                },
                extra: [
                    {label: 'New View', title: 'The modern supplier page',
                        onclick: function (record) {
                            UI.setDocView('supplier', 'modern');
                            Screens.jsSupplierWindow(main, record ?
                                [record.id] : []);
                        }},
                    {label: 'Tools ▾', onclick: function (record) {
                        popup(toolsButton(), [
                            canRfq ? {label: 'Create RFQ for Supplier...',
                                onclick: function () {
                                    UI.openScreen('rfqs' + (record ?
                                        '?supplier=' + record.id : ''),
                                        'New RFQ');
                                }} : null,
                            canPo ? {label:
                                'Create Purchase Order for Supplier...',
                                onclick: function () {
                                    UI.openScreen('purchase-orders/new' +
                                        (record ? '?supplier=' + record.id :
                                            ''), 'New PO');
                                }} : null,
                            '-',
                            {label: 'Web URL', onclick: function () {
                                if (record && record.supplier_web_url) {
                                    var url = record.supplier_web_url;
                                    global.open(/^https?:/i.test(url) ? url :
                                        'http://' + url, '_blank',
                                        'noopener');
                                } else {
                                    UI.toast('No Web URL on this supplier.');
                                }
                            }}]);
                    }}],
                beforeSave: function (values) {
                    delete values.payable;
                    if (!values.code) {
                        delete values.code;
                    }
                    return values;
                }
            });
            /* Created by / Last Modified by: the top row of the Suppliers
             * tab, as in Jobshop */
            var layout = main.querySelector('.js-layout');
            var masterHead = main.querySelector('.master-head');
            if (layout) {
                stampNode.style.position = 'absolute';
                stampNode.style.left = 'calc(var(--u) * 470)';
                stampNode.style.top = 'calc(var(--u) * 6)';
                layout.appendChild(stampNode);
            } else if (masterHead) {
                masterHead.appendChild(stampNode);
            }
            /* Jobshop's description boxes of the General tab (type4) */
            refreshDesc = describe(main, {'Supplier ID': false,
                'Terms ID': [339, 69, 736, 89],
                'Default Tax Group': [339, 92, 736, 112],
                'FOB Point ID': [339, 174, 736, 194],
                'Ship Via ID': [339, 196, 736, 216],
                'Expense Acct ID': [339, 259, 736, 279],
                'Payable Acct ID': [339, 281, 736, 301]});
        }, UI.showError);
    }

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
            return {label: item.label, title: item.title, onclick: function (
                    event) {
                /* (not offered without its document: no-op if clicked) */
                if (item.visible && !item.visible(data, access)) {
                    return;
                }
                item.onclick(data, api, event);
            }};
        });
        /* Jobshop's Tools / View menus of the window */
        (o.menus || []).forEach(function (menu) {
            extra.push({label: menu.label + ' ▾', title: menu.label,
                onclick: function (event) {
                    popup(event && event.currentTarget, menu.items(data,
                        api, access));
                }});
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
        /* The lookup: Jobshop's columns for the table (frame.js), else
         * this window's Browse columns */
        var known = UI.lookups && UI.lookups.get(o.model, o.domain);
        var id = UI.picker(o.model, {label: o.label, placeholder: o.label,
            domain: o.domain, order: o.order, lookupColumns: known ?
                undefined : o.browse, lookupTitle: known ? undefined :
                o.title + 's', onselect: function (r) {
                load(r.id);
            }});
        var status = el('span.jsp-status', '');
        var stampNode = el('span.jsp-stamp');
        var head = el('div.panel.jsp-head', el('label.field', o.label),
            id.node, status, o.headExtra || null, stampNode);
        body.appendChild(head);
        var holder = el('div');
        body.appendChild(holder);
        var built = (o.tabs || []).map(function (t) {
            if (t.fields) {
                var p = fieldsPane(t.fields, t);
                var under = t.render ? el('div.jsp-sub') : null;
                /* Fields under the tab's table (Jobshop's Details frame) */
                var p2 = t.after ? fieldsPane(t.after, {frames:
                    t.afterFrames}) : null;
                return {title: t.title, node: el('div', p.node, under,
                    p2 ? el('div.jsp-sub', p2.node) : null),
                    panes: [p].concat(p2 ? [p2] : []), spec: t,
                    renderNode: under};
            }
            return {title: t.title, node: el('div'), spec: t, panes: []};
        });
        var browse = o.browse ? browseTab(o.model, o.browse, {
            domain: o.domain, order: o.order, open: function (rid) {
                load(rid);
                tabs.show(0);
            }}) : null;
        if (browse) {
            built.push({title: 'Browse', node: browse.node,
                onshow: browse.onshow, panes: []});
        }
        var tabs = tabSet(holder, built);
        /* places: Jobshop's description boxes (describe) */
        var refreshDesc = describe(holder, o.places);
        var api = {
            data: function () {
                return data;
            },
            reload: function () {
                return data ? load(data.id) : null;
            },
            load: function (rid) {
                return load(rid);
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
                    b.panes.forEach(function (p) {
                        Object.assign(all, p.controls);
                    });
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
                b.panes.forEach(function (pane) {
                    pane.lock(on);
                    if (o.lockField) {
                        Object.keys(pane.controls).forEach(function (n) {
                            var off = o.lockField(n, data);
                            if (off) {
                                var node = pane.controls[n].node;
                                Array.prototype.forEach.call(
                                    node.querySelectorAll ?
                                    node.querySelectorAll(
                                        'input, select, textarea, button') :
                                    [], function (x) {
                                        x.disabled = true;
                                    });
                                if (/^(INPUT|SELECT|TEXTAREA)$/.test(
                                        node.tagName)) {
                                    node.disabled = true;
                                }
                            }
                        });
                    }
                });
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
                b.panes.forEach(function (pane) {
                    pane.set(d || (o.defaults ? o.defaults() : {}));
                });
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
            stamp(stampNode, o.model, d && d.id);
            if (o.onshow) {
                o.onshow(d, api);
            }
            if (d && d.id && o.titleOf) {
                UI.setTitle(o.titleOf(d));
            }
            lock();
            refreshDesc();
        }

        function load(rid) {
            /* (a failure in show is shown too, not lost in the promise) */
            return o.load(rid).then(show).then(null, function (error) {
                if (global.console) {
                    global.console.error(error);
                }
                UI.showError(error);
            });
        }

        function clear() {
            show(null);
        }

        function collect() {
            var values = data ? Object.assign({}, {id: data.id}) : {};
            built.forEach(function (b) {
                b.panes.forEach(function (pane) {
                    pane.get(values);
                });
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
        /* (for the test battery and debugging) */
        global.NLPurchasingLast = api;
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

    var LINE_STATUS = [['open', 'Open'], ['closed', 'Closed']];
    var PART_DOMAIN = [['purchasable', '=', true], ['type', '!=', 'service']];
    var SERVICE_DOMAIN = [['purchasable', '=', true], ['type', '=',
        'service']];
    var EXPENSE_DOMAIN = [['type', '!=', null], ['closed', '!=', true]];

    /* The Order Line window (Jobshop's PurchaseLine): Purchase Order Line
     * (the line, Purchasing and Receiving frames), Other (user fields),
     * Specs, Links */
    function poLineDialog(row, editable, linesEditable) {
        var d = Object.assign({}, row.data, valuesOfRow(row));
        d.product = d.part || d.service || d.product;
        var service = Boolean(d.service) || d.line_type === 'service';
        var links = linksGrid(editable);
        links.set(d.js_links || []);
        var fixed = !linesEditable;
        return tabDialog('Order Line - [' + (d.sequence || 'New') + ']', [
            /* Placed as Jobshop's PurchaseLine layout (the unused Dimensions
             * and Alternate Currency frames left out, Receiving moved up) */
            {title: 'Purchase Order Line', frames: [
                {label: '', at: [10, 30, 878, 199]},
                {label: 'Purchasing', at: [10, 204, 876, 316]},
                {label: 'Receiving', at: [10, 320, 876, 388]}], fields: [
                {name: 'sequence', label: 'Line No', type: 'integer',
                    readonly: true, at: [18, 36, 193, 56], split: 120},
                {name: 'line_status', label: 'Line Status',
                    type: 'selection', options: LINE_STATUS,
                    at: [264, 36, 420, 56], split: 69},
                {name: 'line_type', label: 'PO Line Type', type: 'selection',
                    options: LINE_TYPES, readonly: true,
                    at: [500, 36, 689, 56], split: 80},
                {name: service ? 'service_part' : 'product', label: 'Part ID',
                    type: 'many2one', model: 'product.product',
                    readonly: true, at: [18, 67, 484, 87], split: 120},
                {name: 'rfq_number', label: 'RFQ ID', type: 'char',
                    readonly: true, at: [500, 67, 742, 87], split: 80},
                {name: 'rfq_line_no', label: 'RFQ Line No', type: 'integer',
                    readonly: true, at: [754, 67, 869, 87], split: 74},
                {name: 'description', label: 'Description', type: 'char',
                    readonly: fixed, at: [18, 89, 868, 109], split: 120},
                {name: service ? 'none' : 'supplier_part_code', label:
                    'Supplier Part ID', type: 'char', readonly: service,
                    at: [18, 111, 265, 131], split: 120},
                {name: service ? 'product' : 'none_service', label:
                    'Service ID', type: 'many2one', model: 'product.product',
                    readonly: true, at: [284, 111, 542, 131], split: 80},
                {name: service ? 'supplier_part_code' : 'none_code', label:
                    'Supplier Service ID', type: 'char', readonly: !service,
                    at: [562, 111, 868, 131], split: 123},
                {name: 'mfg_name', label: 'Mfg Name', type: 'char',
                    at: [18, 133, 400, 153], split: 120},
                {name: 'mfg_part_id', label: 'Mfg Part ID', type: 'char',
                    at: [443, 133, 868, 153], split: 120},
                {name: 'drawing', label: 'Drawing ID/Rev', type: 'char',
                    at: [18, 155, 349, 175], split: 120},
                {name: 'drawing_revision', label: '/', type: 'char',
                    at: [351, 155, 442, 175], split: 10},
                {name: 'product_code', label: 'Product Code ID',
                    type: 'many2one', model: 'nline.product_code',
                    at: [19, 177, 242, 197], split: 120},
                {name: 'commodity_code', label: 'Commodity Code ID',
                    type: 'many2one', model: 'nline.commodity_code',
                    at: [443, 177, 666, 197], split: 120},
                {name: 'quantity', label: 'Order Qty', type: 'float',
                    readonly: fixed, at: [17, 226, 250, 246], split: 120},
                {name: 'unit', label: 'Purchase U/M', type: 'many2one',
                    model: 'product.uom', readonly: true,
                    at: [283, 226, 530, 246], split: 120},
                {name: 'unit_price', label: 'Unit Price', type: 'decimal',
                    readonly: fixed, at: [17, 248, 250, 268], split: 120},
                {name: 'trade_discount', label: 'Trade Discount %',
                    type: 'decimal', readonly: fixed,
                    at: [283, 248, 483, 268], split: 120},
                {name: 'fixed_charge', label: 'Fixed Charge',
                    type: 'decimal', readonly: fixed,
                    at: [578, 248, 825, 268], split: 120},
                {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                    model: 'account.tax', domain: TAX_GROUP_DOMAIN,
                    readonly: fixed, at: [18, 270, 251, 290], split: 120},
                {name: 'extension', label: 'Extension', type: 'char',
                    readonly: true, at: [578, 270, 825, 290], split: 120},
                {name: 'expense_account', label: 'Expense Acct ID',
                    type: 'many2one', model: 'account.account',
                    domain: EXPENSE_DOMAIN, at: [443, 292, 666, 312],
                    split: 120},
                {name: 'receive_date', label: 'Desired Receive Date',
                    type: 'date', readonly: fixed, at: [17, 342, 250, 362],
                    split: 120},
                {name: 'last_received_date', label: 'Last Received Date',
                    type: 'date', readonly: true, at: [283, 342, 516, 362],
                    split: 120},
                {name: 'promise_date', label: 'Promised Date', type: 'date',
                    at: [17, 364, 250, 384], split: 120},
                {name: 'received', label: 'Received Qty', type: 'float',
                    readonly: true, at: [283, 364, 516, 384], split: 120},
                {name: 'received_amount_text', label: 'Received Amount',
                    type: 'char', readonly: true, at: [578, 364, 825, 384],
                    split: 120}]},
            /* User defined fields N-Line fills on the lines (the part's
             * drawing file and revision) */
            {title: 'Other', fields: [
                {name: 'user_0', label: 'Eng Parts List', type: 'char',
                    span: 4},
                {name: 'user_1', label: 'Part Number Rev', type: 'char'}]},
            {title: 'Specs', fields: [
                {name: 'specifications', label: 'Specifications', type:
                    'text', span: 4, rows: 12}]},
            {title: 'Links', node: el('div', links.node,
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
        ], Object.assign({}, d, {
            extension: UI.money(lineAmount(d)),
            received_amount_text: d.received_amount !== undefined &&
                d.received_amount !== null ? UI.money(d.received_amount) : '',
            service_part: d.service_part || null}), editable).then(
            function (values) {
                values.links = plainValues({l: links.values()}).l;
                ['none', 'none_service', 'none_code', 'extension',
                    'received_amount_text', 'rfq_number', 'rfq_line_no',
                    'service_part'].forEach(function (k) {
                        delete values[k];
                    });
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

    /* The Order Lines of a purchase order, Jobshop's columns: a part line
     * has its Part ID, a service line its Service ID */
    function poLines(pane, data, api) {
        var supplier = function () {
            var c = api.controls().party;
            return c ? c.get() : null;
        };
        var totals = el('div.jsp-totals');
        var grid = editGrid([
            {name: 'sequence', label: 'Line No', type: 'integer', num: true,
                width: '56px'},
            {name: 'line_status', label: 'Line Status', type: 'selection',
                options: LINE_STATUS, default: 'open', min: 90},
            /* Jobshop's drop-down: a part line has a Part ID, a service
             * line a Service ID (the other one clears) */
            {name: 'line_type', label: 'PO Line Type', type: 'selection',
                options: [['part', 'Part'], ['service', 'Service']],
                default: 'part', min: 90, onchange: function (row) {
                    var kind = row.controls.line_type.get();
                    row.controls[kind === 'service' ? 'part' : 'service']
                        .set(null);
                    update();
                }},
            {name: 'receive_date', label: 'Line Desired Receive Date',
                type: 'date'},
            {name: 'last_received_date', label: 'Last Recv\'d Date',
                type: 'display', format: function (v) {
                    return UI.date(v);
                }},
            {name: 'quantity', label: 'Order Qty', type: 'float', num: true,
                default: 1, onchange: function (row) {
                    reprice(row);
                }},
            {name: 'received', label: 'Total Recv\'d Qty', type: 'display',
                num: true, format: function (v) {
                    return v ? num(v) : '';
                }},
            {name: 'part', label: 'Part ID', type: 'many2one',
                model: 'product.product', min: 180, domain: PART_DOMAIN,
                onchange: function (row, record) {
                    choose(row, record, 'part');
                }},
            {name: 'service', label: 'Service ID', type: 'many2one',
                model: 'product.product', min: 130,
                domain: SERVICE_DOMAIN, onchange: function (row, record) {
                    choose(row, record, 'service');
                }},
            {name: 'description', label: 'Description', type: 'char',
                min: 240},
            {name: 'unit', label: 'Purchase U/M', type: 'display',
                format: function (v) {
                    return UI.shortName('product.uom', m2oText(v));
                }},
            {name: 'unit_price', label: 'Unit Price', type: 'decimal',
                num: true, onchange: update},
            {name: 'trade_discount', label: 'Trade Disc %', type: 'decimal',
                num: true, onchange: update},
            {name: 'fixed_charge', label: 'Fixed Charge', type: 'decimal',
                num: true, onchange: update},
            {name: 'amount', label: 'Extension', type: 'display', num: true,
                format: function (v, row) {
                    return UI.money(lineAmount(valuesOfRow(row)));
                }},
            {name: 'expense_account', label: 'Exp Acct ID',
                type: 'many2one', model: 'account.account',
                domain: EXPENSE_DOMAIN, min: 200},
            {name: 'promise_date', label: 'Promise Date', type: 'date'},
            {name: 'linked', label: 'Linked', type: 'display',
                format: function (v, row) {
                    return (row.data.js_links || []).length ||
                        (row.data.work_links || []).length ||
                        (row.data.planning_links || []).length ? '✔' : '';
                }},
            {name: 'mfg_name', label: 'Mfg Name', type: 'char', min: 130},
            {name: 'mfg_part_id', label: 'Mfg Part Id', type: 'char',
                min: 130}
        ], {
            onopen: function (row) {
                var linesEditable = !data || data.lines_editable;
                poLineDialog(row, api.editable(), linesEditable).then(
                    function (values) {
                        if (values.product && row.controls.service.get()) {
                            values.service = values.product;
                        } else if (values.product) {
                            values.part = values.product;
                        }
                        delete values.product;
                        applyToRow(row, values);
                        row.data.js_links = values.links;
                        update();
                    }, function () {});
            },
            onchange: update,
            newRow: function () {
                var rows = grid.rows();
                var last = rows.length ? (rows[rows.length - 1].controls
                    .sequence.get() || rows.length) : 0;
                return {sequence: last + 1, quantity: 1, line_status: 'open'};
            }
        });
        function update() {
            var sum = 0;
            grid.rows().forEach(function (row) {
                row.controls.amount.set(null);
                row.controls.linked.set(null);
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
        function choose(row, record, kind) {
            if (!record) {
                return;
            }
            /* A line is a part or a service: the other ID clears */
            row.controls[kind === 'part' ? 'service' : 'part'].set(null);
            row.controls.line_type.set(kind);
            Rpc.desk('js_supplier_price', [supplier(), record.id,
                row.controls.quantity.get() || 1, null]).then(function (q) {
                row.controls.description.set(q.description);
                row.controls.unit.set(q.unit);
                row.data.unit = q.unit;
                if (q.unit_price !== null) {
                    row.controls.unit_price.set(q.unit_price);
                }
                row.data.supplier_part_code = q.code;
                if (q.mfg_name) {
                    row.controls.mfg_name.set(q.mfg_name);
                }
                if (q.mfg_part_id) {
                    row.controls.mfg_part_id.set(q.mfg_part_id);
                }
                if (q.minimum_quantity && (row.controls.quantity.get() ||
                        0) < q.minimum_quantity) {
                    UI.toast('Minimum order quantity of ' +
                        record.rec_name + ': ' + num(q.minimum_quantity));
                }
                update();
            }, UI.showError);
        }
        function productOf(row) {
            return row.controls.part.get() || row.controls.service.get();
        }
        function reprice(row) {
            var product = productOf(row);
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
            var service = l.line_type === 'service';
            return Object.assign({}, l, {unit_price: l.list_unit_price,
                line_type: service ? 'service' : 'part',
                part: service ? null : l.product,
                service: service ? l.product : null,
                work_links: l.links, links: undefined});
        }) : []);
        if (!data) {
            grid.addRow({sequence: 1, quantity: 1, line_status: 'open'});
        }
        pane.appendChild(grid.node);
        /* Tax / Total: under the Details frame, as Jobshop has them */
        var host = pane.parentNode;
        if (host) {
            Array.prototype.forEach.call(host.querySelectorAll(
                ':scope > .jsp-totals'), function (old) {
                    host.removeChild(old);
                });
            host.appendChild(totals);
        } else {
            pane.appendChild(totals);
        }
        update();
        return {
            get: function (values) {
                values.lines = grid.values().filter(function (v) {
                    return v.part || v.service || v.description;
                }).map(function (v) {
                    v.product = v.part || v.service || null;
                    v.line_closed = v.line_status === 'closed' &&
                        !((v.received || 0) >= (v.quantity || 0) &&
                            v.received);
                    v.links = v.links || (v.js_links || []).map(function (k) {
                        return {id: k.id, production: k.production,
                            operation: k.operation, piece: k.piece,
                            work: k.work, quantity: k.quantity,
                            reference: k.reference};
                    });
                    ['part', 'service', 'js_links', 'planning_links',
                        'work_links', 'amount', 'received', 'line_status',
                        'line_type', 'linked', 'last_received_date',
                        'received_amount', 'rfq_number', 'rfq_line_no'
                    ].forEach(function (k) {
                        delete v[k];
                    });
                    return plainValues(v);
                });
            },
            lock: function (on, d) {
                grid.lock(on && (!d || d.lines_editable));
            },
            rows: function () {
                return grid.rows();
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
            }), {empty: 'No tax: choose a Tax Group ID under the order ' +
                'lines on the Purchase Order tab (or on a line).'}));
        return null;
    }

    var RECEIVER_FILTER = ['all', 'unapproved', 'approved', 'cancelled'];
    var RECEIVER_LABEL = {unapproved: 'Unapproved', approved: 'Approved',
        cancelled: 'Cancelled'};

    function openReceiver(r) {
        UI.openScreen('receiving?' + r.kind + '=' + r.id, 'Receiver ' +
            r.number);
    }

    /* Jobshop's Receiver Lines window: the lines of receivers (each read
     * through js_receiver_get) */
    function receiverLinesDialog(title, receivers) {
        Promise.all((receivers || []).map(function (r) {
            return Rpc.desk('js_receiver_get', [r.kind, r.id]);
        })).then(function (all) {
            var rows = [];
            all.forEach(function (r) {
                r.lines.forEach(function (l) {
                    rows.push({receiver: r, line: l});
                });
            });
            linesDialog(title, ['Transacted', 'Receiver ID',
                'Receiver Status', 'Receiver Type', 'Line No', 'PO Line No',
                'Part ID', 'Service ID', 'Description', {label:
                    'Rec/Rtn Qty (Pur U/M)', num: true}, 'Purchase U/M',
                {label: 'Unit Price', num: true}, {label: 'Received Amount',
                    num: true}], rows, {
                    cells: function (x) {
                        var r = x.receiver, l = x.line;
                        return [r.transacted ? '✔' : '', r.number,
                            RECEIVER_LABEL[r.receiver_status] || '',
                            r.kind === 'return' ? 'Return' : 'Receipt',
                            String(l.line_no), l.po_line_no === null ? '' :
                                String(l.po_line_no),
                            l.line_type === 'service' ? '' :
                                partId(l.product),
                            l.line_type === 'service' ? partId(l.product) :
                                '', l.description, num(l.quantity),
                            UI.shortName('product.uom', l.unit),
                            num(l.unit_price), UI.money(l.amount)];
                    },
                    open: function (x) {
                        openReceiver({kind: x.receiver.kind, id:
                            x.receiver.id, number: x.receiver.number});
                    },
                    empty: 'No receiver line.'});
        }, UI.showError);
    }

    /* The Receivers tab of a purchase order; right-click: Jobshop's
     * PopupPurchaseOrderReceivers */
    function poReceivers(pane, data) {
        if (!data) {
            pane.appendChild(el('p.muted', 'Save the purchase order first.'));
            return null;
        }
        var shown = 'all';
        function render() {
            UI.clear(pane);
            var rows = data.receivers.filter(function (r) {
                return shown === 'all' || r.status === shown;
            });
            pane.appendChild(el('p.muted', 'Receivers by status of: ' +
                (RECEIVER_LABEL[shown] || 'All') + ' (right-click for the ' +
                'menu)'));
            var holder = table(['ID', 'Status', 'Type', 'Received Date',
                {label: 'Received Amount', num: true}, 'Invoice ID',
                'Invoiced Date'], rows.map(function (r) {
                    return [r.number, RECEIVER_LABEL[r.status] || r.status,
                        r.kind === 'return' ? 'Return' : 'Receipt',
                        UI.date(r.date), UI.money(r.amount),
                        r.supplier_invoice, UI.date(r.invoiced_date)];
                }), {onopen: function (i) {
                    openReceiver(rows[i]);
                }, oncontext: function (event, i) {
                    menu(event, rows[i]);
                }, empty: 'No receiver yet.'});
            holder.addEventListener('contextmenu', function (event) {
                if (!event.defaultPrevented) {
                    menu(event, null);
                }
            });
            pane.appendChild(holder);
        }
        function menu(event, row) {
            popup(event, [
                {label: 'Receivers by Status of', items: statusItems(
                    RECEIVER_FILTER, RECEIVER_LABEL, shown, function (s) {
                        shown = s;
                        render();
                    })},
                row ? {label: 'Receiver Lines...', onclick: function () {
                    receiverLinesDialog('Receiver Lines - ' + row.number,
                        [row]);
                }} : null,
                {label: 'All Receiver Lines by Receiver Status of',
                    items: statusItems(RECEIVER_FILTER, RECEIVER_LABEL, null,
                        function (s) {
                            receiverLinesDialog('Receiver Lines - ' +
                                data.number + ' (' + (RECEIVER_LABEL[s] ||
                                    'All') + ')', data.receivers.filter(
                                function (r) {
                                    return s === 'all' || r.status === s;
                                }));
                        })},
                row ? '-' : null,
                row ? {label: 'Open Receiver...', onclick: function () {
                    openReceiver(row);
                }} : null]);
        }
        render();
        return null;
    }

    /* Jobshop's Purchase From tab: the order's own copy of the supplier's
     * address, editable; the Name's "..." picks another address of the
     * supplier, Restore Default Address takes the supplier's again */
    function purchaseFrom(pane, data, api) {
        var invoiceAddress = data && data.invoice_address ?
            data.invoice_address.id : null;
        var c = null;
        var pf = fieldsPane(addressFields('purchase_from_', false), {buttons: [
            {label: '\u2026', at: [433, 10, 453, 30], onclick: function () {
                var party = api.controls().party.get();
                if (!party) {
                    UI.toast('Choose the Supplier ID first.');
                    return;
                }
                UI.browse('party.address', {title: 'Addresses of the ' +
                    'supplier', domain: [['party', '=', party]],
                    columns: [{field: 'sequence', label: 'Addr No'},
                        {field: 'rec_name', label: 'Address'}]}).then(
                    function (record) {
                        addressOf(record.id).then(function (a) {
                            fill(a);
                            api.changed();
                        }, UI.showError);
                    }, function () {});
            }},
            {label: 'Restore Default Address', at: [177, 167, 372, 197],
                onclick: function () {
                    var party = api.controls().party.get();
                    if (!party) {
                        return;
                    }
                    Rpc.desk('js_supplier_defaults', [party]).then(
                        function (s) {
                            fill(s.address || {name: s.name});
                            api.changed();
                        }, UI.showError);
                }},
            {label: 'Export Contact to Outlook', at: [581, 167, 776, 197],
                onclick: function () {
                    var a = {};
                    ADDRESS_KEYS.forEach(function (k) {
                        a[k] = c['purchase_from_' + k].get() || '';
                    });
                    exportContact(a);
                }}]});
        c = pf.controls;
        function fill(a) {
            ADDRESS_KEYS.forEach(function (k) {
                c['purchase_from_' + k].set(a[k] || '');
            });
            if (a.id) {
                invoiceAddress = a.id;
            }
        }
        /* The order's own copy, else the supplier's address (an order
         * saved before the copy existed) */
        var own = data && ADDRESS_KEYS.some(function (k) {
            return data['purchase_from_' + k];
        });
        if (own) {
            pf.set(data);
        } else {
            fill(data && data.purchase_from || {});
        }
        pane.appendChild(pf.node);
        api.purchaseFromFill = fill;
        return {
            get: function (values) {
                pf.get(values);
                if (invoiceAddress) {
                    values.invoice_address = invoiceAddress;
                }
            },
            lock: function (on) {
                pf.lock(on);
                lockButtons(pf.node, on);
            }
        };
    }

    function shipToRender(pane, data) {
        var tab = shipToTab('po');
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

    /* Terms ID as {id, rec_name} (an older server sends the id only) */
    function poTerms(d) {
        if (!d || typeof d.payment_term !== 'number') {
            return d;
        }
        return Rpc.searchRead('account.invoice.payment_term', [['id', '=',
            d.payment_term]], ['rec_name']).then(function (rows) {
                d.payment_term = rows.length ? {id: rows[0].id, rec_name:
                    rows[0].rec_name} : null;
                return d;
            });
    }

    /* The Purchase From / Ship To boxes of the Purchase Order tab */
    function poTexts(d) {
        if (!d) {
            return d;
        }
        var a = d.purchase_from || {};
        d.purchase_from_text = [a.name, a.address_1, a.address_2, a.etc,
            [a.city, a.state, a.postal_code].filter(Boolean).join(' '),
            a.country].filter(Boolean).join('\n');
        d.ship_to_text = [d.ship_to_name, d.ship_to_street,
            [d.ship_to_city, d.ship_to_state, d.ship_to_postal_code]
                .filter(Boolean).join(' '), d.ship_to_country]
            .filter(Boolean).join('\n') || '(our address)';
        return d;
    }

    /* ---- The Purchase Order, modern view (UI.docPage) ------------------- */

    /* The box of a modern page (UI.docPage) in the screen, or null when the
     * window shows its classic view (name: the window, UI.docView). The
     * page lives in its own box: once the screen changes (another window,
     * Classic view) the box leaves the document and the page's single keys
     * (P, R, A...) stop with it; #main keeps no dp-main look for the next
     * screen either */
    function docHost(main, name) {
        UI.clear(main);
        main.classList.remove('dp-main');
        if (!UI.docPage || UI.docView(name || 'po') !== 'modern') {
            return null;
        }
        var host = el('div.dp-host');
        main.appendChild(host);
        /* The page's background over the whole screen while it is shown */
        main.classList.add('dp-main');
        if (global.MutationObserver) {
            var watch = new global.MutationObserver(function () {
                if (host.parentNode !== main) {
                    main.classList.remove('dp-main');
                    watch.disconnect();
                }
            });
            watch.observe(main, {childList: true});
        }
        return host;
    }

    /* Classic view: the window as Jobshop draws it, in the screen (not in
     * the modern page's box, which leaves with its keys) */
    function toClassic(host, name, screen, params) {
        UI.setDocView(name, 'classic');
        Screens[screen](host.classList.contains('dp-host') && host.parentNode ?
            host.parentNode : host, params);
    }

    function today() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,
            '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function n0(value) {
        var n = parseFloat(value);
        return isNaN(n) ? 0 : n;
    }

    /* The payload js_po_save expects: the whole order (it writes every
     * header field it gets); the lines without their links (kept) */
    function poValues(d) {
        var values = Object.assign({}, d);
        values.lines = (d.lines || []).map(function (l) {
            var line = Object.assign({}, l);
            /* js_po_save takes unit_price as Jobshop's quoted price (before
             * the trade discount and the fixed charge): the line's list
             * price, not the effective price js_po_get also sends */
            if (l.list_unit_price !== null && l.list_unit_price !==
                    undefined) {
                line.unit_price = l.list_unit_price;
            }
            delete line.links;
            delete line.js_links;
            delete line.planning_links;
            return line;
        });
        return values;
    }

    function poModern(main, openId, presetSupplier) {
        var access = {};
        var page;
        UI.access(['purchase.purchase', 'purchase.line',
            'stock.shipment.in']).then(function (a) {
                access = a || {};
                if (page) {
                    page.render();
                }
            });
        /* (nothing is offered before the rights are known: what the user
         * may not do is not shown) */
        function can(model, right) {
            return Boolean(access[model] && access[model][right]);
        }

        function mayWrite(d) {
            return can('purchase.purchase', d && d.id ? 'write' : 'create');
        }

        function lineKind(l) {
            if (l.line_type === 'service') {
                return {icon: 'service', tone: 'service'};
            }
            if (!l.product) {
                return {icon: 'charge', tone: 'charge'};
            }
            return {icon: 'part', tone: 'part'};
        }

        function money(v) {
            return '$' + UI.money(n0(v));
        }

        function problems(d) {
            var out = [];
            (d.lines || []).forEach(function (l) {
                if (!n0(l.unit_price) && !n0(l.fixed_charge) &&
                        l.line_status !== 'closed') {
                    out.push({line: l, what: 'price'});
                }
            });
            return out;
        }

        function editLine(d, l) {
            var released = !d.lines_editable;
            var fields = [
                {name: 'description', label: 'Description', type: 'char',
                    wide: true, readonly: released},
                {name: 'product', label: 'Part or service', type: 'many2one',
                    model: 'product.product', readonly: released,
                    domain: [['purchasable', '=', true]]},
                {name: 'quantity', label: 'Order qty', type: 'float',
                    readonly: released},
                {name: 'unit_price', label: 'Unit price', type: 'float',
                    readonly: released},
                {name: 'trade_discount', label: 'Trade disc %',
                    type: 'float', readonly: released},
                {name: 'fixed_charge', label: 'Fixed charge', type: 'float',
                    readonly: released},
                {name: 'receive_date', label: 'Wanted by', type: 'date'},
                {name: 'promise_date', label: 'Promised', type: 'date'},
                {name: 'supplier_part_code', label: 'Supplier part ID',
                    type: 'char'},
                {name: 'expense_account', label: 'Expense account',
                    type: 'many2one', model: 'account.account'},
                {name: 'line_closed', label: 'Closed (nothing more ' +
                    'expected)', type: 'boolean'}];
            /* (the order's own lines stay as they were if the save is
             * refused) */
            UI.docEdit('Line ' + (l.sequence || ''), fields, Object.assign(
                {}, l, {unit_price: l.list_unit_price !== null &&
                    l.list_unit_price !== undefined ? l.list_unit_price :
                    l.unit_price})).then(
                function (values) {
                    page.save({lines: poValues(d).lines.map(function (x) {
                        return x.id === l.id && x.sequence === l.sequence ?
                            Object.assign(x, values) : x;
                    })});
                }, function () {});
        }

        function addLine(d) {
            if (!d.lines_editable) {
                UI.toast('A released order keeps its lines: add them on ' +
                    'a new order', 'error');
                return;
            }
            UI.docEdit('Add a line', [
                {name: 'product', label: 'Part or service', type: 'many2one',
                    model: 'product.product', domain: [['purchasable', '=',
                        true]]},
                {name: 'description', label: 'Description (a charge ' +
                    'without a part)', type: 'char', wide: true},
                {name: 'quantity', label: 'Order qty', type: 'float'},
                {name: 'unit_price', label: 'Unit price', type: 'float'},
                {name: 'receive_date', label: 'Wanted by', type: 'date'}],
                {quantity: 1, receive_date: d.delivery_date}).then(
                function (values) {
                    if (!values.product && !values.description) {
                        UI.toast('Choose a part or type a description',
                            'error');
                        return;
                    }
                    page.save({lines: poValues(d).lines.concat([
                        Object.assign({id: null, line_status: 'open'},
                            values)])});
                }, function () {});
        }

        function print(d) {
            Rpc.desk('js_po_printed', [d.id]).then(function () {
                return Rpc.report('purchase.purchase', [d.id]);
            }).then(function (r) {
                UI.openReport(r, 'Purchase Order');
                page.reload();
            }, UI.showError);
        }

        function receive(d) {
            UI.openScreen('receiving?purchase=' + d.id, 'Receiving');
        }

        function setStatus(d, status) {
            var go = function () {
                UI.service('js_po_status', d.id, [status]).then(function () {
                    page.reload();
                }, failed);
            };
            if (status === 'cancelled' || status === 'closed') {
                UI.confirm('Change status', 'Set purchase order ' + d.number +
                    ' to ' + PO_STATUS[status] + '?').then(function (ok) {
                        if (ok) {
                            go();
                        }
                    });
            } else {
                go();
            }
        }

        page = UI.docPage(main, {
            title: 'Purchase Order',
            crumbs: ['Purchasing', 'Purchase orders'],
            model: 'purchase.purchase', label: 'Order ID',
            order: [['purchase_date', 'DESC'], ['id', 'DESC']],
            openId: openId,
            load: function (id) {
                return Rpc.desk('js_po_get', [id]).then(poTerms).then(
                    poTexts);
            },
            save: function (values) {
                if (!values.party) {
                    return Promise.reject({message: 'Choose the supplier ' +
                        'first.'});
                }
                return UI.service('js_po_save', values).then(poTerms).then(
                    function (d) {
                        return poTexts(d);
                    });
            },
            values: poValues,
            route: function (d) {
                return 'purchase-orders/' + d.id;
            },
            blank: function () {
                return {id: null, number: '', party: presetSupplier || null,
                    purchase_date: today(), delivery_date: today(),
                    jobshop_status: 'unreleased', editable: true,
                    lines_editable: true, lines: [], freight_terms: 'billed'};
            },
            head: function (d) {
                var due = d.delivery_date;
                var late = due && due < today() && d.jobshop_status !==
                    'closed' && d.jobshop_status !== 'cancelled';
                var isToday = due === today();
                return {
                    title: d.party ? (d.party_name || d.party.rec_name) :
                        'New purchase order',
                    chips: d.party_code ? [d.party_code] : [],
                    sub: [d.number ? 'PO ' + d.number : 'Not saved yet',
                        d.purchase_date ? 'ordered ' + UI.date(
                            d.purchase_date) + (d.buyer ? ' by ' + d.buyer :
                                '') : null,
                        due ? {text: (late ? 'wanted ' : isToday ?
                            'wanted today, ' : 'wanted by ') + UI.date(due) +
                            (late ? ', late' : ''), tone: late ? 'bad' :
                            isToday ? 'warn' : null, icon: 'clock'} : null],
                    amount: {value: money(d.total_amount), label:
                        (d.lines || []).length + ' lines' + (d.payment_term ?
                            ' · ' + d.payment_term.rec_name : '')}
                };
            },
            status: function (d) {
                var tone = {released: 'accent', closed: 'ok', hold: 'warn',
                    cancelled: 'bad'}[d.jobshop_status];
                return [{text: PO_STATUS[d.jobshop_status] || 'Unreleased',
                    tone: tone}, {text: d.printed_date ? 'Printed ' +
                        UI.date(d.printed_date) : 'Not printed'}];
            },
            actions: function (d) {
                if (!d.id) {
                    return [];
                }
                var released = d.jobshop_status === 'released';
                return [
                    {label: 'Print', key: 'p', onclick: print},
                    (d.statuses || []).indexOf('released') >= 0 &&
                        can('purchase.purchase', 'write') ? {label: 'Release',
                            primary: !released, onclick: function () {
                                setStatus(d, 'released');
                            }} : null,
                    released && can('stock.shipment.in', 'create') ?
                        {label: 'Receive', key: 'r', primary: true,
                            onclick: receive} : null];
            },
            more: function (d) {
                if (!d.id) {
                    return [];
                }
                return [
                    {label: 'Change status', items: (d.statuses || []).map(
                        function (s) {
                            return {label: PO_STATUS[s], onclick: function () {
                                setStatus(d, s);
                            }};
                        })},
                    {label: 'Open supplier', onclick: function () {
                        UI.openScreen('supplier-window/' + d.party.id,
                            'Supplier');
                    }},
                    d.rfq ? {label: 'Open RFQ', onclick: function () {
                        UI.openScreen('rfqs/' + d.rfq.id, 'RFQ');
                    }} : null,
                    '-',
                    {label: 'Classic view', onclick: function () {
                        toClassic(main, 'po', 'jsPurchaseOrder', [d.id]);
                    }}].filter(Boolean);
            },
            attention: function (d) {
                var out = [];
                if (!d.party) {
                    out.push({tone: 'info', title: 'Choose the supplier',
                        detail: 'The order needs a supplier before it can ' +
                            'be saved.', action: {label: 'Choose',
                            onclick: function () {
                                UI.docEdit('Supplier', [{name: 'party',
                                    label: 'Supplier', type: 'many2one',
                                    model: 'party.party', domain: [[
                                        'is_supplier', '=', true]]}], d)
                                    .then(function (v) {
                                        page.save({party: v.party});
                                    }, function () {});
                            }}});
                }
                problems(d).forEach(function (p) {
                    out.push({tone: 'warn', title: 'Line ' +
                        (p.line.sequence || '') + ' has no price',
                        detail: 'It would be received at $0 and understate ' +
                            'the cost.', action: {label: 'Set price',
                            onclick: function () {
                                editLine(d, p.line);
                            }}});
                });
                var due = d.delivery_date;
                if (d.id && d.jobshop_status === 'released' &&
                        !d.promise_date && due && due <= today()) {
                    out.push({tone: 'warn', icon: 'clock', title: 'No ' +
                        'promised date from the supplier', detail: 'Wanted ' +
                        UI.date(due) + (d.printed_date ? '.' : '; the ' +
                            'order has not been printed or sent yet.'),
                        action: {label: 'Set promised date', onclick:
                            function () {
                                UI.docEdit('Promised date', [{name:
                                    'promise_date', label: 'Promised',
                                    type: 'date'}], d).then(function (v) {
                                        page.save(v);
                                    }, function () {});
                            }}});
                }
                if (d.jobshop_status === 'unreleased' && d.id &&
                        (d.lines || []).length) {
                    out.push({tone: 'info', title: 'Not released yet',
                        detail: 'Receiving and planning see it once it is ' +
                            'released.', action: (d.statuses || []).indexOf(
                            'released') >= 0 ? {label: 'Release',
                            onclick: function () {
                                setStatus(d, 'released');
                            }} : null});
                }
                return out;
            },
            tracker: function (d) {
                if (!d.id) {
                    return null;
                }
                var total = n0(d.total_amount);
                var received = n0(d.received_amount);
                var billed = (d.receivers || []).filter(function (r) {
                    return r.invoiced_date || r.supplier_invoice;
                }).length;
                return {title: 'Order, receipt and bill', note: 'three-way ' +
                    'match', steps: [
                    {label: 'Ordered', value: money(total), state: 'done'},
                    {label: 'Received', value: money(received), state:
                        received >= total && total ? 'done' : received ?
                            'now' : 'todo'},
                    {label: 'Billed', value: billed ? billed +
                        ' receiver(s)' : '$0.00', state: billed ? 'now' :
                        'todo'},
                    {label: 'Closed', value: d.jobshop_status === 'closed' ?
                        'yes' : 'no', state: d.jobshop_status === 'closed' ?
                        'done' : 'todo'}]};
            },
            sections: [{title: "What's on order", note: function (d) {
                return d.lines_editable ? 'Click a line to change it' :
                    'Released: click a line for its dates';
            }, render: function (pane, d) {
                UI.docLines(pane, {
                    items: (d.lines || []).slice().sort(function (a, b) {
                        return (a.sequence || 0) - (b.sequence || 0);
                    }),
                    kind: lineKind,
                    title: function (l) {
                        return l.description || (l.product &&
                            l.product.rec_name) || 'Line';
                    },
                    chips: function (l) {
                        var c = [];
                        if (l.product) {
                            c.push(UI.shortName('product.product',
                                l.product.rec_name));
                        }
                        if (!n0(l.unit_price) && !n0(l.fixed_charge)) {
                            c.push({text: 'no price', tone: 'warn'});
                        }
                        if (l.line_status === 'closed') {
                            c.push({text: 'closed', tone: 'ok'});
                        }
                        if (l.promise_date) {
                            c.push('promised ' + UI.date(l.promise_date));
                        }
                        return c;
                    },
                    progress: function (l) {
                        var q = n0(l.quantity), r = n0(l.received);
                        return {done: r, total: q, label: r + ' of ' + q +
                            ' back'};
                    },
                    right: function (l) {
                        return [money(l.amount), n0(l.quantity) + ' × ' +
                            money(l.unit_price), !n0(l.unit_price) &&
                            !n0(l.fixed_charge) ? 'warn' : null];
                    },
                    onclick: function (l) {
                        editLine(d, l);
                    },
                    add: d.lines_editable && d.party ? {placeholder:
                        'Add a part, service or charge', onclick:
                        function () {
                            addLine(d);
                        }} : null,
                    footer: ['Lines ' + money(d.untaxed_amount), 'Tax ' +
                        money(d.tax_amount), 'Total ' + money(d.total_amount)]
                });
            }}],
            cards: [
                {title: 'Supplier', rows: function (d) {
                    return [['Name', d.purchase_from_name || (d.party &&
                        d.party.rec_name)],
                        ['Address', [d.purchase_from_address_1,
                            d.purchase_from_address_2, [d.purchase_from_city,
                                d.purchase_from_state,
                                d.purchase_from_postal_code].filter(Boolean)
                                .join(' ')].filter(Boolean).join(', ')],
                        ['Contact', d.purchase_from_contact],
                        ['Phone', d.purchase_from_phone],
                        ['E-mail', d.purchase_from_email]];
                }, fields: [
                    {name: 'purchase_from_contact', label: 'Contact',
                        type: 'char'},
                    {name: 'purchase_from_phone', label: 'Phone',
                        type: 'char'},
                    {name: 'purchase_from_email', label: 'E-mail',
                        type: 'char'},
                    {name: 'reference', label: 'Supplier quote ref',
                        type: 'char'}], editable: mayWrite},
                {title: 'Delivery', rows: function (d) {
                    return [['Ship to', d.ship_to_summary ||
                        d.ship_to_name || 'Our address'],
                        ['Wanted by', d.delivery_date ? UI.date(
                            d.delivery_date) : null],
                        ['Promised', d.promise_date ? UI.date(
                            d.promise_date) : null],
                        ['Ship via', d.ship_via && d.ship_via.rec_name],
                        ['FOB', d.fob_point && d.fob_point.rec_name],
                        ['Freight', d.freight_terms ? d.freight_terms
                            .charAt(0).toUpperCase() + d.freight_terms
                            .slice(1) : null]];
                }, fields: [
                    {name: 'delivery_date', label: 'Wanted by', type: 'date'},
                    {name: 'promise_date', label: 'Promised', type: 'date'},
                    {name: 'ship_via', label: 'Ship via', type: 'many2one',
                        model: 'nline.ship_via'},
                    {name: 'fob_point', label: 'FOB point', type: 'many2one',
                        model: 'nline.fob_point'},
                    {name: 'freight_terms', label: 'Freight terms',
                        type: 'selection', options: [['billed', 'Billed'],
                            ['collect', 'Collect'], ['prepaid', 'Prepaid']]}],
                    editable: function (d) {
                        return d.editable !== false && mayWrite(d);
                    }},
                {title: 'Terms and accounting', rows: function (d) {
                    return [['Terms', d.payment_term &&
                        d.payment_term.rec_name],
                        ['Buyer', d.buyer],
                        ['Tax group', d.tax_group && d.tax_group.rec_name],
                        ['Payable', d.payable_account &&
                            d.payable_account.rec_name],
                        ['Order date', d.purchase_date ? UI.date(
                            d.purchase_date) : null]];
                }, fields: [
                    {name: 'payment_term', label: 'Terms', type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'buyer', label: 'Buyer', type: 'char'},
                    {name: 'tax_group', label: 'Tax group', type: 'many2one',
                        model: 'account.tax'},
                    {name: 'payable_account', label: 'Payable account',
                        type: 'many2one', model: 'account.account'},
                    {name: 'purchase_date', label: 'Order date',
                        type: 'date'}],
                    editable: function (d) {
                        return d.editable !== false && mayWrite(d);
                    }},
                {title: 'Specs and notes', rows: function (d) {
                    return [['Specs', d.specifications ?
                        String(d.specifications).slice(0, 160) : null],
                        ['Memo', d.description]];
                }, fields: [
                    {name: 'specifications', label: 'Specs', type: 'text'},
                    {name: 'description', label: 'Memo', type: 'char'}],
                    editable: mayWrite}
            ],
            trail: function (d) {
                if (!d.id) {
                    return [];
                }
                var status = d.jobshop_status;
                var receivers = d.receivers || [];
                return [
                    {done: status !== 'unreleased' && status !== 'hold',
                        text: 'Released', when: status === 'released' ||
                            status === 'closed' ? '' : 'not yet'},
                    {done: Boolean(d.printed_date), text: 'Printed / sent',
                        when: d.printed_date ? UI.date(d.printed_date) :
                            'not yet'},
                    {done: receivers.length > 0, text: 'Receivers',
                        when: receivers.length ? receivers.length + ' · last ' +
                            UI.date(d.last_received_date) : 'none yet'},
                    {done: status === 'closed', text: 'Closed', when:
                        status === 'closed' ? '' : 'open'},
                    {text: 'Notes', onclick: function () {
                        UI.modal('Notes: PO ' + d.number, el('div', {ref:
                            null}, (function () {
                                var pane = el('div', {style: {minWidth:
                                    '480px'}});
                                UI.notesTab(pane, 'purchase.purchase', d.id,
                                    true);
                                return pane;
                            }())));
                    }}];
            },
            keys: {
                p: {label: 'print', run: function (d) {
                    if (d.id) {
                        print(d);
                    }
                }},
                r: {label: 'receive', run: function (d) {
                    if (d.jobshop_status === 'released') {
                        receive(d);
                    }
                }},
                a: {label: 'add a line', run: function (d) {
                    addLine(d);
                }}
            },
            classic: function (d) {
                toClassic(main, 'po', 'jsPurchaseOrder', d && d.id ? [d.id] :
                    []);
            }
        });
        return page;
    }

    /* The Purchase Order window: the modern page (default) or Jobshop's
     * classic window (More > Classic view; its ribbon's New View goes
     * back) */
    Screens.jsPurchaseOrder = function (main, params) {
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var query = (global.location.hash.split('?')[1] || '');
        var preset = /(?:^|&)supplier=(\d+)/.exec(query);
        var host = docHost(main);
        if (host) {
            var supplier = preset ? {id: parseInt(preset[1], 10),
                rec_name: ''} : null;
            var page = poModern(host, openId, supplier);
            if (supplier) {
                /* (the new order's headline: the supplier's name) */
                Rpc.searchRead('party.party', [['id', '=', supplier.id]],
                    ['rec_name']).then(function (rows) {
                        supplier.rec_name = rows.length ? rows[0].rec_name :
                            '';
                        page.render();
                    }, function () {});
            }
            return;
        }
        classicPurchaseOrder(main, openId, preset);
    };

    function classicPurchaseOrder(main, openId, preset) {
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
            /* The description boxes of the Details frame (positions in
             * its own pane: Jobshop's top less 416); the supplier's name
             * is in the Purchase From box, not beside its ID */
            places: {'Supplier ID': false,
                'FOB Point ID': [239, 28, 418, 48],
                'Ship Via ID': [239, 50, 418, 70],
                'Tax Group ID': [239, 72, 418, 92],
                'Terms ID': [655, 6, 834, 26],
                'Payable Acct ID': [655, 50, 834, 70]},
            load: function (id) {
                return Rpc.desk('js_po_get', [id]).then(poTerms).then(
                    poTexts);
            },
            save: function (values, data) {
                return UI.service('js_po_save', values).then(poTerms).then(
                    poTexts);
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
                /* (the Status shows Unreleased, as the header badge) */
                return {purchase_date: UI.today(), delivery_date: UI.today(),
                    jobshop_status: 'unreleased'};
            },
            /* Jobshop's Purchase Order tab: the order frame, the Order
             * Lines, then the Details frame (layouts VPurchasing\
             * PurchaseOrder); its other sub-tabs follow as tabs */
            tabs: [
                {title: 'Purchase Order', frames: [
                    {label: '', at: [7, 4, 841, 145]}], fields: [
                    {name: 'number', label: 'Order ID', type: 'char',
                        at: [17, 6, 253, 26], split: 100,
                        help: 'Blank: the next number'},
                    {name: 'party', label: 'Supplier ID', type: 'many2one',
                        model: 'party.party', domain: SUPPLIER_DOMAIN,
                        at: [17, 28, 251, 48], split: 100},
                    {name: 'purchase_date', label: 'Order Date',
                        type: 'date', at: [17, 50, 228, 70], split: 100},
                    {name: 'delivery_date', label: 'Receive On Date',
                        type: 'date', at: [17, 72, 228, 92], split: 100},
                    {name: 'jobshop_status', label: 'Status',
                        type: 'selection', readonly: true, options:
                            Object.keys(PO_STATUS).map(function (k) {
                                return [k, PO_STATUS[k]];
                            }), at: [17, 94, 228, 114], split: 100},
                    {name: 'reference', label: 'Supplier Quote Ref',
                        type: 'char', at: [17, 116, 251, 136], split: 100},
                    /* (captions above the boxes: ADDRESSES_LABEL) */
                    {name: 'purchase_from_text', label: 'Purchase From',
                        type: 'text', readonly: true,
                        at: [262, 27, 432, 136], split: 170},
                    {name: 'ship_to_text', label: 'Ship To', type: 'text',
                        readonly: true, at: [441, 27, 611, 136],
                        split: 170},
                    {name: 'promise_date', label: 'Promised Date',
                        type: 'date', at: [618, 50, 832, 70], split: 105},
                    {name: 'last_received_date', label: 'Last Recv\'d Date',
                        type: 'date', readonly: true,
                        at: [618, 72, 832, 92], split: 105},
                    {name: 'printed_date', label: 'Printed Date',
                        type: 'char', readonly: true,
                        at: [618, 116, 832, 136], split: 105}],
                    render: poLines,
                    afterFrames: [{label: '', at: [8, 0, 842, 100]}],
                    after: [
                    {name: 'buyer', label: 'Buyer', type: 'char',
                        at: [17, 6, 233, 26], split: 105},
                    {name: 'fob_point', label: 'FOB Point ID',
                        type: 'many2one', model: 'nline.fob_point',
                        at: [17, 28, 233, 48], split: 105},
                    {name: 'ship_via', label: 'Ship Via ID',
                        type: 'many2one', model: 'nline.ship_via',
                        at: [17, 50, 233, 70], split: 105},
                    {name: 'tax_group', label: 'Tax Group ID',
                        type: 'many2one', model: 'account.tax',
                        domain: TAX_GROUP_DOMAIN, at: [17, 72, 233, 92],
                        split: 105},
                    {name: 'payment_term', label: 'Terms ID',
                        type: 'many2one',
                        model: 'account.invoice.payment_term',
                        at: [427, 6, 650, 26], split: 120},
                    {name: 'freight_terms', label: 'Freight Terms',
                        type: 'selection', options: FREIGHT,
                        at: [427, 28, 650, 49], split: 120},
                    {name: 'payable_account', label: 'Payable Acct ID',
                        type: 'many2one', model: 'account.account',
                        domain: [['type.payable', '=', true],
                            ['closed', '!=', true]],
                        at: [427, 50, 650, 70], split: 120},
                    {name: 'rfq', label: 'Request For Quote ID',
                        type: 'many2one', model: 'nline.rfq',
                        readonly: true, at: [427, 72, 650, 92],
                        split: 120}]},
                {title: 'Purchase From', render: purchaseFrom},
                {title: 'Ship To', render: shipToRender},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', span: 4, rows: 14}]},
                {title: 'Notes', render: function (pane, data) {
                    if (!data || !data.id) {
                        pane.appendChild(el('p.muted', 'Save the purchase ' +
                            'order first.'));
                        return null;
                    }
                    UI.notesTab(pane, 'purchase.purchase', data.id,
                        Boolean(data.editable));
                    return null;
                }},
                {title: 'Taxes', render: poTaxes},
                {title: 'Receivers', render: poReceivers},
                /* User defined fields N-Line fills (labels of Jobshop's
                 * purchasing settings) */
                {title: 'Other', frames: [{label: 'User Defined Fields',
                    at: [7, 4, 824, 271]}], fields: [
                    {name: 'user_0', label: 'N-LINE FIELD', type: 'char',
                        at: [21, 24, 391, 44], split: 110},
                    {name: 'user_1', label: 'NOTES:', type: 'char',
                        at: [21, 45, 391, 65], split: 110},
                    {name: 'user_2', label: 'AUDIT DATE:', type: 'char',
                        at: [21, 66, 391, 86], split: 110},
                    /* (Tryton's memo of the order: not in Jobshop's
                     * window, kept here under the user fields) */
                    {name: 'description', label: 'Memo', type: 'char',
                        at: [21, 285, 391, 305], split: 110}]}
            ],
            browse: [
                {name: 'number', label: 'Order ID'},
                {name: 'party.code', label: 'Supplier ID'},
                {name: 'party.name', label: 'Name'},
                {name: 'purchase_date', label: 'Order Date', type: 'date'},
                {name: 'jobshop_status', label: 'Status',
                    labels: PO_STATUS}],
            menus: [
                {label: 'Tools', items: function (data, a, access) {
                    if (!data) {
                        return [{label: '(open a purchase order first)', disabled: true, onclick: function () {}}];
                    }
                    return [
                        data.jobshop_status === 'released' &&
                            access['stock.shipment.in'] &&
                            access['stock.shipment.in'].create ?
                            {label: 'Receive Purchase Order...',
                                onclick: function () {
                                    UI.openScreen('receiving?purchase=' +
                                        data.id, 'Receiving');
                                }} : null,
                        {label: 'Open Supplier...', onclick: function () {
                            UI.openScreen('supplier-window/' +
                                data.party.id, 'Supplier');
                        }},
                        data.rfq ? {label: 'Open RFQ...', onclick:
                            function () {
                                UI.openScreen('rfqs/' + data.rfq.id, 'RFQ');
                            }} : null];
                }},
                {label: 'View', items: function (data) {
                    if (!data) {
                        return [{label: '(open a purchase order first)', disabled: true, onclick: function () {}}];
                    }
                    return [
                        {label: 'Purchase Order Lines...', onclick:
                            function () {
                                poLinesDialog('Purchase Order Lines - ' +
                                    data.number, [['purchase', '=',
                                        data.id]]);
                            }},
                        {label: 'Receiver Lines...', onclick: function () {
                            receiverLinesDialog('Receiver Lines - ' +
                                data.number, data.receivers);
                        }}];
                }}],
            extra: [
                {label: 'New View', title: 'The modern purchase order page',
                    onclick: function (data) {
                        UI.setDocView('po', 'modern');
                        Screens.jsPurchaseOrder(main, data && data.id ?
                            [data.id] : []);
                    }},
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
                    if (api.purchaseFromFill) {
                        api.purchaseFromFill(s.address || {name: s.name});
                    }
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
            /* (after the window's own first show, which waits on the
             * rights: else that show clears the supplier again) */
            Promise.all([Rpc.searchRead('party.party', [['id', '=',
                parseInt(preset[1], 10)]], ['rec_name']), rights(
                ['purchase.purchase'])]).then(function (all) {
                var rows = all[0];
                global.setTimeout(function () {
                    if (rows.length && !api.data()) {
                        controls.party.set(rows[0]);
                        partyPicker.input.dispatchEvent(new Event('blur'));
                    }
                }, 0);
            }, UI.showError);
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
                domain: SUPPLIER_DOMAIN, at: [16, 5, 408, 25], split: 100},
            {name: 'quote_received_' + slot, label: 'Quote Received',
                type: 'boolean', at: [411, 5, 521, 25]},
            {name: 'tax_group_' + slot, label: 'Tax Group ID',
                type: 'many2one', model: 'account.tax',
                domain: TAX_GROUP_DOMAIN, at: [16, 27, 227, 47], split: 100},
            {name: 'reference_' + slot, label: 'Supplier Ref No',
                type: 'char', at: [16, 49, 227, 69], split: 100},
            {name: 'as_of_date_' + slot, label: 'As Of Date', type: 'date',
                at: [16, 71, 229, 91], split: 100},
            {name: 'expiration_date_' + slot, label: 'Expiration Date',
                type: 'date', at: [16, 93, 229, 113], split: 100}].concat(
            /* The supplier's address (read-only, fraSupplier frame) */
            addressFields('slot_' + slot + '_', false).map(function (f) {
                var at = f.at.slice();
                at[0] += 5;
                at[1] += 115;
                at[2] = at[0] === 17 ? 458 : at[2] + 5;
                at[3] += 115;
                return Object.assign({}, f, {readonly: true, at: at});
            }));
    }

    /* A Supplier tab: the header fields, the address, and the supplier's
     * line table (its quoted prices of each quantity) */
    function rfqSupplierTab(slot) {
        return function (pane, data, api) {
            var fields = fieldsPane(slotFields(slot), {frames: [
                {label: '', at: [12, 115, 830, 280]}]});
            fields.set(data);
            var lines = el('div.jsp-sub');
            pane.appendChild(fields.node);
            pane.appendChild(lines);
            function showAddress(a) {
                a = a || {};
                ADDRESS_KEYS.forEach(function (k) {
                    fields.controls['slot_' + slot + '_' + k].set(a[k] ||
                        '');
                });
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
            /* The supplier's line table (Jobshop's columns); a check box
             * selects rows for Tools > Update Supplier Pricing from Selected
             * Rows (right-click) */
            var rows = [];
            var picks = [];
            (data ? data.lines : []).forEach(function (line) {
                line.prices.forEach(function (p) {
                    var service = line.line_type === 'service';
                    var pick = el('input', {type: 'checkbox', 'aria-label':
                        'Select'});
                    picks.push({box: pick, price: p.id, quoted:
                        p['unit_price_' + slot] !== null &&
                        p['unit_price_' + slot] !== undefined});
                    rows.push([pick, String(line.sequence || ''), service ?
                        'Service' : 'Part', num(p.quantity),
                        service ? '' : partId(line.product),
                        service ? partId(line.product) : '',
                        line.description, UI.shortName('product.uom',
                            m2oText(line.unit)), num(p['unit_price_' + slot]),
                        num(p['trade_discount_' + slot]),
                        num(p['fixed_charge_' + slot]),
                        UI.money(p['amount_' + slot]),
                        service ? '' : line['supplier_code_' + slot],
                        service ? line['supplier_code_' + slot] : '',
                        line.mfg_name, line.mfg_part_id,
                        UI.date(p['delivery_date_' + slot]),
                        num(p['lead_time_' + slot])]);
                });
            });
            lines.appendChild(el('h3', 'Quoted prices (enter them on the ' +
                'lines: double-click a line on the Request For Quote tab)'));
            var holder = table(['', 'Line No', 'Line Type',
                {label: 'Quote Qty', num: true}, 'Part ID', 'Service ID',
                'Description', 'Purchase U/M', {label: 'Unit Price',
                    num: true}, {label: 'Trade Disc %', num: true},
                {label: 'Fixed Charge', num: true},
                {label: 'Extension', num: true}, 'Supplier Part ID',
                'Supplier Service ID', 'Mfg Name', 'Mfg Part ID',
                'Delivery Date', {label: 'Lead Time (days)', num: true}],
                rows, {empty: 'No line yet.'});
            var canPrice = api.access()['purchase.product_supplier'];
            if (data && data['supplier_' + slot] && canPrice &&
                    canPrice.write && canPrice.create) {
                holder.addEventListener('contextmenu', function (event) {
                    popup(event, [{label:
                        'Update Supplier Pricing from Selected Rows',
                        onclick: function () {
                            var ids = picks.filter(function (k) {
                                return k.box.checked && k.quoted;
                            }).map(function (k) {
                                return k.price;
                            });
                            if (!ids.length) {
                                UI.toast('Check the rows with a quoted ' +
                                    'price first.');
                                return;
                            }
                            Rpc.desk('js_rfq_update_pricing', [data.id, slot,
                                ids]).then(function (done) {
                                UI.toast(done.length + ' supplier price(s) ' +
                                    'updated', 'ok');
                            }, UI.showError);
                        }}]);
                });
            }
            lines.appendChild(holder);
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
        /* (the grid's Part ID / Service ID: one product in the dialog) */
        d.product = d.part || d.service || null;
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
            {title: 'Other', fields: [
                {name: 'user_0', label: 'Eng Parts List', type: 'char',
                    span: 4},
                {name: 'user_1', label: 'Part Number Rev', type: 'char'}]},
            {title: 'Specs', fields: [
                {name: 'specifications', label: 'Specifications', type:
                    'text', span: 4, rows: 10}]},
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
            {name: 'line_status', label: 'Line Status', type: 'selection',
                options: LINE_STATUS, default: 'open'},
            {name: 'line_type', label: 'Line Type', type: 'selection',
                options: LINE_TYPES, default: 'part', min: 120,
                onchange: function (row) {
                    var kind = row.controls.line_type.get();
                    row.controls[kind === 'service' ? 'part' : 'service']
                        .set(null);
                }},
            {name: 'desired_receive_date', label: 'Line Desired Receive Date',
                type: 'date'},
            {name: 'lead_time', label: 'Lead Time (days)', type: 'display',
                num: true, format: function (v) {
                    return v === null || v === undefined ? '' : String(v);
                }},
            {name: 'minimum_order_qty', label: 'Minimum Order Qty',
                type: 'display', num: true, format: function (v) {
                    return v ? num(v) : '';
                }},
            {name: 'quote_qtys', label: 'Quote Qty(s)...', type: 'display',
                format: function (v, row) {
                    return (row.data.prices || []).map(function (p) {
                        return num(p.quantity);
                    }).join(', ');
                }},
            /* Jobshop's two columns: a part line has its Part ID, a
             * service line its Service ID (choosing one clears the other) */
            {name: 'part', label: 'Part ID', type: 'many2one',
                model: 'product.product', min: 180, domain: PART_DOMAIN,
                onchange: function (row, record) {
                    rfqChoose(row, record, 'part');
                }},
            {name: 'service', label: 'Service ID', type: 'many2one',
                model: 'product.product', min: 130, domain: SERVICE_DOMAIN,
                onchange: function (row, record) {
                    rfqChoose(row, record, 'service');
                }},
            {name: 'description', label: 'Description', type: 'char',
                min: 240},
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
                        var service = (values.line_type ||
                            row.controls.line_type.get()) === 'service';
                        values.part = service ? null : values.product;
                        values.service = service ? values.product : null;
                        delete values.product;
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
        function rfqChoose(row, record, kind) {
            if (!record) {
                return;
            }
            row.controls[kind === 'part' ? 'service' : 'part'].set(null);
            row.controls.line_type.set(kind);
            Rpc.desk('js_supplier_price', [null, record.id, 1,
                null]).then(function (q) {
                row.controls.description.set(q.description);
                row.controls.unit.set(q.unit);
                row.data.drawing = q.drawing;
                row.data.drawing_revision = q.drawing_revision;
            }, UI.showError);
        }
        grid.set(data ? data.lines.map(function (l) {
            var service = l.line_type === 'service';
            return Object.assign({}, l, {part: service ? null : l.product,
                service: service ? l.product : null});
        }) : []);
        pane.appendChild(grid.node);
        pane.appendChild(el('p.muted', 'Double-click a row header to ' +
            'enter the quote quantities, each supplier\'s prices, the ' +
            'specs and the work order links of the line.'));
        return {
            get: function (values) {
                values.lines = grid.values().filter(function (v) {
                    return v.part || v.service || v.description;
                }).map(function (v) {
                    v.product = v.part || v.service || null;
                    delete v.part;
                    delete v.service;
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

    /* May the request become a purchase order (Preview / Create PO)? */
    function rfqMayCreatePo(data, access) {
        return Boolean(data && data.status === 'active' &&
            access['purchase.purchase'] &&
            access['purchase.purchase'].create);
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
        var tab = shipToTab('rfq');
        tab.set(data);
        pane.appendChild(tab.node);
        return {get: tab.get, lock: tab.lock};
    }

    /* ---- Request For Quote, modern view (UI.docPage) -------------------
     * Headline: what is being quoted (the first line's part); the quotes
     * of the three suppliers side by side, one click to enter a supplier's
     * quote, Create PO from the best one. Loaded and saved with js_rfq_get
     * / js_rfq_save (the whole request: it writes every field it gets). */

    var RFQ_SLOTS = [1, 2, 3];

    /* The payload js_rfq_save expects: the whole request, the lines with
     * their quantities and prices; their links stay as they are */
    function rfqValues(d) {
        var values = Object.assign({}, d);
        values.lines = (d.lines || []).map(function (l) {
            var line = Object.assign({}, l);
            line.prices = (l.prices || []).map(function (p) {
                return Object.assign({}, p);
            });
            delete line.links;
            delete line.purchase_lines;
            return line;
        });
        RFQ_SLOTS.forEach(function (s) {
            delete values['address_' + s];
        });
        delete values.purchases;
        return values;
    }

    function rfqModern(main, openId, preset) {
        var access = {};
        var page;
        UI.access(['nline.rfq', 'purchase.purchase',
            'purchase.product_supplier']).then(function (a) {
                access = a || {};
                if (page) {
                    page.render();
                }
            });
        function can(model, right) {
            return Boolean(access[model] && access[model][right]);
        }
        function mayWrite(d) {
            return can('nline.rfq', d && d.id ? 'write' : 'create');
        }
        function money(v) {
            return UI.money(n0(v), true);
        }
        function priced(p, s) {
            return p && p['unit_price_' + s] !== null &&
                p['unit_price_' + s] !== undefined;
        }
        function slots(d) {
            return RFQ_SLOTS.filter(function (s) {
                return d['supplier_' + s];
            });
        }
        function who(d, s) {
            var p = d['supplier_' + s];
            return p ? (d['supplier_code_' + s] || p.rec_name) : 'Supplier ' +
                s;
        }
        /* A supplier's quote is in: Quote Received ticked, or a price on
         * every line */
        function quoted(d, s) {
            return Boolean(d['quote_received_' + s]) || ((d.lines || [])
                .length > 0 && (d.lines || []).every(function (l) {
                    return (l.prices || []).some(function (p) {
                        return priced(p, s);
                    });
                }));
        }
        function unquotedLines(d) {
            return (d.lines || []).filter(function (l) {
                return l.line_status !== 'closed' && !(l.purchase_lines ||
                    []).length && !slots(d).some(function (s) {
                        return (l.prices || []).some(function (p) {
                            return priced(p, s);
                        });
                    });
            });
        }
        /* The cheapest supplier of a price row: {slot, amount} | null */
        function best(d, p) {
            var out = null;
            slots(d).forEach(function (s) {
                if (priced(p, s) && (!out || n0(p['amount_' + s]) <
                        out.amount)) {
                    out = {slot: s, amount: n0(p['amount_' + s])};
                }
            });
            return out;
        }
        function bestTotal(d) {
            return (d.lines || []).reduce(function (a, l) {
                var b = best(d, (l.prices || [])[0]);
                return a + (b ? b.amount : 0);
            }, 0);
        }
        function lineName(l) {
            return l.description || (l.product && l.product.rec_name) ||
                'Line ' + (l.sequence || '');
        }
        function qtyText(l) {
            return (l.prices || []).map(function (p) {
                return num(p.quantity);
            }).join(', ');
        }
        function late(d) {
            return d.due_date && d.due_date < today() && d.status === 'active';
        }
        function setStatus(d, status) {
            var go = function () {
                page.save({status: status}).then(null, function () {});
            };
            if (status === 'cancelled' || status === 'closed') {
                UI.confirm('Change status', 'Set request for quote ' +
                    d.number + ' to ' + RFQ_LABEL[status] + '?').then(
                    function (ok) {
                        if (ok) {
                            go();
                        }
                    });
            } else {
                go();
            }
        }
        function print(d) {
            Rpc.desk('js_rfq_printed', [d.id]).then(function () {
                UI.toast('Printed date set; the RFQ form is in Purchasing ' +
                    'Reports');
                page.reload();
            }, UI.showError);
        }
        function mayOrder(d) {
            return rfqMayCreatePo(d, access);
        }
        function createPo(d) {
            rfqCreatePo(d, {reload: function () {
                return page.reload();
            }});
        }

        /* The line dialog (new or changed): part, description, the quote
         * quantities as "1, 10, 50" */
        function editLine(d, l) {
            var isNew = !l;
            l = l || {id: null, sequence: (d.lines || []).reduce(function (a,
                x) {
                return Math.max(a, x.sequence || 0);
            }, 0) + 1, line_type: 'part', line_status: 'open', prices: [
                {quantity: 1}], desired_receive_date: d.desired_receive_date};
            var item = Object.assign({}, l, {quantities: qtyText(l)});
            var locked = (l.purchase_lines || []).length > 0;
            var fields = [
                {name: 'product', label: 'Part or service', type: 'many2one',
                    model: 'product.product', domain: [['purchasable', '=',
                        true]], readonly: locked},
                {name: 'description', label: 'Description', type: 'char',
                    wide: true},
                {name: 'quantities', label: 'Quote quantities (e.g. 1, 10, ' +
                    '50)', type: 'char'},
                {name: 'desired_receive_date', label: 'Wanted by',
                    type: 'date'},
                {name: 'mfg_name', label: 'Mfg name', type: 'char'},
                {name: 'mfg_part_id', label: 'Mfg part ID', type: 'char'},
                {name: 'line_status', label: 'Line status', type: 'selection',
                    options: LINE_STATUS}];
            if (!isNew && !locked) {
                fields.push({name: 'remove', label: 'Remove this line',
                    type: 'boolean'});
            }
            UI.docEdit(isNew ? 'Add a part or service to quote' : 'Line ' +
                (l.sequence || ''), fields, item).then(function (v) {
                    var lines = rfqValues(d).lines;
                    if (v.remove) {
                        page.save({lines: lines.filter(function (x) {
                            return x.id !== l.id;
                        })}).then(null, function () {});
                        return;
                    }
                    if (!v.product && !v.description) {
                        UI.toast('Choose a part or type a description',
                            'error');
                        return;
                    }
                    var qtys = String(v.quantities || '1').split(/[,;\s]+/)
                        .map(parseNum).filter(function (q) {
                            return q;
                        });
                    var line = Object.assign({}, isNew ? l : lines.filter(
                        function (x) {
                            return x.id === l.id;
                        })[0], {product: v.product, description:
                            v.description, desired_receive_date:
                            v.desired_receive_date, mfg_name: v.mfg_name,
                        mfg_part_id: v.mfg_part_id, line_status:
                            v.line_status || 'open'});
                    line.prices = (qtys.length ? qtys : [1]).map(function (q) {
                        return (line.prices || []).filter(function (p) {
                            return n0(p.quantity) === q;
                        })[0] || {quantity: q};
                    });
                    var oldProduct = l.product && l.product.id;
                    var changed = v.product && v.product !== oldProduct;
                    var ready = changed ? Promise.all([
                        Rpc.searchRead('product.product', [['id', '=',
                            v.product]], ['type']),
                        Rpc.desk('js_supplier_price', [null, v.product, 1,
                            null])]).then(function (all) {
                                var p = all[0][0] || {};
                                var q = all[1] || {};
                                line.line_type = p.type === 'service' ?
                                    'service' : 'part';
                                line.description = line.description ||
                                    q.description;
                                line.unit = q.unit || line.unit;
                                line.drawing = q.drawing || line.drawing;
                                line.drawing_revision = q.drawing_revision ||
                                    line.drawing_revision;
                            }) : Promise.resolve();
                    ready.then(function () {
                        page.save({lines: isNew ? lines.concat([line]) :
                            lines.map(function (x) {
                                return x.id === l.id ? line : x;
                            })}).then(null, function () {});
                    }, UI.showError);
                }, function () {});
        }

        /* Enter a supplier's quote: its reference and dates, a unit price
         * and lead time per line and quantity */
        function enterQuote(d, s) {
            var item = {reference: d['reference_' + s], as_of_date:
                d['as_of_date_' + s] || today(), expiration_date:
                d['expiration_date_' + s]};
            var fields = [
                {name: 'reference', label: 'Supplier quote ref', type: 'char'},
                {name: 'as_of_date', label: 'Quoted on', type: 'date'},
                {name: 'expiration_date', label: 'Good until', type: 'date'}];
            (d.lines || []).forEach(function (l, i) {
                (l.prices || []).forEach(function (p, j) {
                    var key = 'p' + i + '_' + j;
                    var what = 'Line ' + l.sequence + ' · ' + (l.product ?
                        UI.shortName('product.product', l.product.rec_name) :
                        lineName(l)) + ' · qty ' + num(p.quantity);
                    item[key] = p['unit_price_' + s];
                    item[key + 'l'] = p['lead_time_' + s];
                    fields.push({name: key, label: what + ': unit price',
                        type: 'float'}, {name: key + 'l', label:
                        'lead time (days)', type: 'integer'});
                });
            });
            UI.docEdit('Quote from ' + who(d, s), fields, item).then(
                function (v) {
                    var lines = rfqValues(d).lines;
                    lines.forEach(function (l, i) {
                        l.prices.forEach(function (p, j) {
                            p['unit_price_' + s] = v['p' + i + '_' + j];
                            p['lead_time_' + s] = v['p' + i + '_' + j + 'l'];
                        });
                    });
                    var changes = {lines: lines};
                    changes['reference_' + s] = v.reference;
                    changes['as_of_date_' + s] = v.as_of_date;
                    changes['expiration_date_' + s] = v.expiration_date;
                    changes['quote_received_' + s] = true;
                    page.save(changes).then(null, function () {});
                }, function () {});
        }
        function chooseSuppliers(d) {
            UI.docEdit('Suppliers', RFQ_SLOTS.map(function (s) {
                return {name: 'supplier_' + s, label: 'Supplier ' + s,
                    type: 'many2one', model: 'party.party',
                    domain: SUPPLIER_DOMAIN};
            }), d).then(function (v) {
                page.save(v).then(null, function () {});
            }, function () {});
        }
        function missing(d) {
            return slots(d).filter(function (s) {
                return !quoted(d, s);
            });
        }

        page = UI.docPage(main, {
            title: 'Request For Quote',
            crumbs: ['Purchasing', 'Requests for quote'],
            model: 'nline.rfq', label: 'RFQ ID',
            order: [['rfq_date', 'DESC'], ['number', 'DESC']],
            openId: openId,
            load: function (id) {
                return Rpc.desk('js_rfq_get', [id]);
            },
            save: function (values) {
                return UI.service('js_rfq_save', values);
            },
            values: rfqValues,
            blank: function () {
                return {id: null, number: '', rfq_date: today(), due_date:
                    today(), status: 'unreleased', lines: [], purchases: [],
                    supplier_1: preset || null, freight_terms: null};
            },
            head: function (d) {
                var lines = d.lines || [];
                var first = lines[0];
                var due = d.due_date;
                var isToday = due === today() && d.status === 'active';
                var b = bestTotal(d);
                return {
                    title: first ? lineName(first) + (lines.length > 1 ?
                        ' and ' + (lines.length - 1) + ' more' : '') :
                        'New request for quote',
                    chips: first && first.product ? [UI.shortName(
                        'product.product', first.product.rec_name)] : [],
                    sub: [d.number ? 'RFQ ' + d.number : 'Not saved yet',
                        d.rfq_date ? 'requested ' + UI.date(d.rfq_date) +
                            (d.buyer ? ' by ' + d.buyer : '') : null,
                        due ? {text: (late(d) ? 'quotes were due ' :
                            isToday ? 'quotes due today, ' :
                                'quotes due ') + UI.date(due) + (late(d) ?
                            ', late' : ''), tone: late(d) ? 'bad' : isToday ?
                            'warn' : null, icon: 'clock'} : null,
                        slots(d).map(function (s) {
                            return who(d, s);
                        }).join(', ') || null],
                    amount: {value: b ? money(b) : '—', label: b ?
                        'best quotes at the first quantity' :
                        'no quote yet'}
                };
            },
            status: function (d) {
                var tone = {active: 'accent', closed: 'ok', cancelled: 'bad'}[
                    d.status];
                var n = slots(d).length;
                return [{text: RFQ_LABEL[d.status] || 'Unreleased', tone: tone},
                    {text: d.printed_date ? 'Printed ' + UI.date(
                        d.printed_date) : 'Not printed'},
                    n ? {text: (n - missing(d).length) + ' of ' + n +
                        ' quotes in', tone: missing(d).length ? null : 'ok'} :
                        null].filter(Boolean);
            },
            actions: function (d) {
                if (!d.id) {
                    return [];
                }
                var w = mayWrite(d);
                var gaps = missing(d);
                return [
                    {label: 'Print', key: 'p', onclick: print},
                    w && d.status === 'unreleased' ? {label: 'Mark sent',
                        primary: true, title: 'Active (awaiting quote)',
                        onclick: function () {
                            setStatus(d, 'active');
                        }} : null,
                    w && d.status === 'active' && slots(d).length ? {label:
                        'Enter quote', key: 'q', primary: !mayOrder(d) ||
                        gaps.length === slots(d).length, onclick:
                        function () {
                            enterQuote(d, gaps.length ? gaps[0] :
                                slots(d)[0]);
                        }} : null,
                    mayOrder(d) && gaps.length < slots(d).length ? {label:
                        'Create PO', key: 'o', primary: true, onclick:
                        createPo} : null];
            },
            more: function (d) {
                if (!d.id) {
                    return [];
                }
                var w = mayWrite(d);
                var price = access['purchase.product_supplier'];
                return [
                    w ? {label: 'Change status', items: RFQ_STATUS.map(
                        function (s) {
                            return {label: s[1], checked: d.status === s[0],
                                onclick: function () {
                                    setStatus(d, s[0]);
                                }};
                        })} : null,
                    w && slots(d).length ? {label: 'Enter quote from',
                        items: slots(d).map(function (s) {
                            return {label: who(d, s), checked: quoted(d, s),
                                onclick: function () {
                                    enterQuote(d, s);
                                }};
                        })} : null,
                    price && price.write && price.create && slots(d).some(
                        function (s) {
                            return quoted(d, s);
                        }) ? {label: 'Keep quoted prices on file',
                        items: slots(d).filter(function (s) {
                            return quoted(d, s);
                        }).map(function (s) {
                            return {label: who(d, s), onclick: function () {
                                var ids = [];
                                d.lines.forEach(function (l) {
                                    l.prices.forEach(function (p) {
                                        if (priced(p, s)) {
                                            ids.push(p.id);
                                        }
                                    });
                                });
                                Rpc.desk('js_rfq_update_pricing', [d.id, s,
                                    ids]).then(function (done) {
                                        UI.toast(done.length + ' supplier ' +
                                            'price(s) updated', 'ok');
                                    }, UI.showError);
                            }};
                        })} : null,
                    slots(d).length ? {label: 'Open supplier', items:
                        slots(d).map(function (s) {
                            return {label: who(d, s), onclick: function () {
                                UI.openScreen('supplier-window/' +
                                    d['supplier_' + s].id, 'Supplier');
                            }};
                        })} : null,
                    can('nline.rfq', 'delete') && !d.purchases.length ? {
                        label: 'Delete', onclick: function () {
                            UI.confirm('Delete', 'Delete request for quote ' +
                                d.number + '? It cannot be recovered.').then(
                                function (ok) {
                                    if (ok) {
                                        Rpc.desk('js_rfq_delete', [d.id])
                                            .then(function () {
                                                UI.toast('Deleted', 'ok');
                                                page.clear();
                                            }, UI.showError);
                                    }
                                });
                        }} : null,
                    '-',
                    {label: 'Classic view', onclick: function () {
                        toClassic(main, 'rfq', 'jsRfq', [d.id]);
                    }}].filter(Boolean);
            },
            attention: function (d) {
                var out = [];
                var w = mayWrite(d);
                if (!slots(d).length) {
                    out.push({tone: 'info', title: 'Choose the suppliers',
                        detail: 'Up to three suppliers quote on the same ' +
                            'lines.', action: w ? {label: 'Choose',
                            onclick: function () {
                                chooseSuppliers(d);
                            }} : null});
                }
                if (!(d.lines || []).length) {
                    out.push({tone: 'info', title: 'Nothing to quote yet',
                        detail: 'Add the parts or services and their ' +
                            'quantities.', action: w ? {label: 'Add a line',
                            onclick: function () {
                                editLine(d, null);
                            }} : null});
                }
                if (d.id && d.status === 'unreleased' && slots(d).length &&
                        (d.lines || []).length) {
                    out.push({tone: 'info', title: 'Not sent yet', detail:
                        'Print it for the suppliers, then mark it sent ' +
                            '(Active, awaiting quote).', action: w ? {label:
                            'Mark sent', onclick: function () {
                                setStatus(d, 'active');
                            }} : null});
                }
                if (d.status === 'active') {
                    missing(d).forEach(function (s) {
                        if (d.due_date && d.due_date <= today()) {
                            out.push({tone: late(d) ? 'bad' : 'warn', icon:
                                'clock', title: 'No quote from ' + who(d, s),
                                detail: 'Quotes ' + (late(d) ? 'were ' : '') +
                                    'due ' + UI.date(d.due_date) + '.',
                                action: w ? {label: 'Enter quote', onclick:
                                    function () {
                                        enterQuote(d, s);
                                    }} : null});
                        }
                    });
                    slots(d).forEach(function (s) {
                        var until = d['expiration_date_' + s];
                        if (quoted(d, s) && until && until < today()) {
                            out.push({tone: 'warn', title: 'The quote from ' +
                                who(d, s) + ' expired', detail: 'Good until ' +
                                UI.date(until) + '.', action: w ? {label:
                                    'Enter new quote', onclick: function () {
                                        enterQuote(d, s);
                                    }} : null});
                        }
                    });
                    var bare = unquotedLines(d);
                    if (bare.length && slots(d).length) {
                        out.push({tone: 'warn', title: bare.length +
                            (bare.length > 1 ? ' lines have' : ' line has') +
                            ' no quote yet', detail: bare.slice(0, 4).map(
                                function (l) {
                                    return 'line ' + l.sequence;
                                }).join(', ') + (bare.length > 4 ? '…' : ''),
                            action: w ? {label: 'Enter quote', onclick:
                                function () {
                                    var gaps = missing(d);
                                    enterQuote(d, gaps.length ? gaps[0] :
                                        slots(d)[0]);
                                }} : null});
                    }
                    if (slots(d).length && !missing(d).length &&
                            !d.purchases.length) {
                        out.push({tone: 'info', title: 'All quotes are in',
                            detail: 'Order from the best one.', action:
                                mayOrder(d) ? {label: 'Create PO', onclick:
                                    function () {
                                        createPo(d);
                                    }} : null});
                    }
                }
                return out;
            },
            tracker: function (d) {
                if (!d.id) {
                    return null;
                }
                var n = slots(d).length;
                var inn = n - missing(d).length;
                var sent = d.status !== 'unreleased';
                return {title: 'Request, quotes and order', steps: [
                    {label: 'Requested', value: UI.date(d.rfq_date), state:
                        'done'},
                    {label: 'Sent', value: sent ? (d.printed_date ?
                        UI.date(d.printed_date) : 'yes') : 'no', state:
                        sent ? 'done' : 'now'},
                    {label: 'Quoted', value: inn + ' of ' + n, state: n &&
                        inn === n ? 'done' : !sent ? 'todo' : late(d) ? 'bad' :
                        'now'},
                    {label: 'Ordered', value: d.purchases.length ?
                        d.purchases.map(function (p) {
                            return 'PO ' + p.number;
                        }).join(', ') : 'no', state: d.purchases.length ?
                        'done' : 'todo'},
                    {label: 'Closed', value: d.status === 'closed' ? 'yes' :
                        d.status === 'cancelled' ? 'cancelled' : 'no', state:
                        d.status === 'closed' ? 'done' : d.status ===
                        'cancelled' ? 'bad' : 'todo'}]};
            },
            sections: [{title: 'What is being quoted', note: function (d) {
                return mayWrite(d) ? 'Click a line to change it' : '';
            }, render: function (pane, d) {
                var n = slots(d).length;
                UI.docLines(pane, {
                    items: (d.lines || []).slice().sort(function (a, b) {
                        return (a.sequence || 0) - (b.sequence || 0);
                    }),
                    kind: function (l) {
                        return l.line_type === 'service' ? {icon: 'service',
                            tone: 'service'} : {icon: 'part', tone: 'part'};
                    },
                    title: lineName,
                    chips: function (l) {
                        var c = [];
                        if (l.product) {
                            c.push(UI.shortName('product.product',
                                l.product.rec_name));
                        }
                        c.push('qty ' + qtyText(l));
                        (l.purchase_lines || []).forEach(function (p) {
                            c.push({text: 'on PO ' + p.number, tone: 'ok'});
                        });
                        if (l.line_status === 'closed') {
                            c.push({text: 'closed', tone: 'ok'});
                        }
                        if (l.desired_receive_date) {
                            c.push('wanted ' + UI.date(
                                l.desired_receive_date));
                        }
                        return c;
                    },
                    progress: function (l) {
                        if (!n) {
                            return null;
                        }
                        var inn = slots(d).filter(function (s) {
                            return (l.prices || []).some(function (p) {
                                return priced(p, s);
                            });
                        }).length;
                        return {done: inn, total: n, label: inn + ' of ' + n +
                            ' quoted'};
                    },
                    right: function (l) {
                        var p = (l.prices || [])[0];
                        var b = best(d, p);
                        return b ? [money(b.amount), 'best: ' + who(d, b.slot) +
                            ' at ' + num(p.quantity)] : ['—', 'no quote'];
                    },
                    onclick: mayWrite(d) ? function (l) {
                        editLine(d, l);
                    } : null,
                    add: mayWrite(d) ? {placeholder: 'Add a part or service ' +
                        'to quote', onclick: function () {
                            editLine(d, null);
                        }} : null,
                    footer: [(d.lines || []).length + ' lines', 'Best ' +
                        money(bestTotal(d))]
                });
            }}, {title: 'Quotes side by side', note: 'the lowest of each ' +
                'quantity is marked', visible: function (d) {
                return slots(d).length > 0 && (d.lines || []).length > 0;
            }, render: function (pane, d) {
                var w = mayWrite(d);
                var head = el('tr', el('th', 'Line'), el('th', 'Part / ' +
                    'description'), el('th.num', 'Qty'), slots(d).map(
                    function (s) {
                        return el('th.num', w ? el('a', {href: '#', title:
                            'Enter the quote from ' + who(d, s), onclick:
                            function (event) {
                                event.preventDefault();
                                enterQuote(d, s);
                            }}, who(d, s)) : who(d, s));
                    }));
                var body = el('tbody');
                d.lines.forEach(function (l) {
                    (l.prices || []).forEach(function (p, j) {
                        /* (best: only against another supplier's price) */
                        var b = slots(d).filter(function (s) {
                            return priced(p, s);
                        }).length > 1 ? best(d, p) : null;
                        body.appendChild(el('tr', el('td', j ? '' :
                            String(l.sequence)), el('td', j ? '' :
                            (l.product ? el('span', {title: lineName(l)},
                                UI.shortName('product.product',
                                    l.product.rec_name)) : lineName(l))),
                            el('td.num', num(p.quantity)), slots(d).map(
                                function (s) {
                                    if (!priced(p, s)) {
                                        return el('td.num.dp-muted', '—');
                                    }
                                    return el('td.num', el('div',
                                        b && b.slot === s ? UI.docChip(
                                            'best', 'ok') : null, ' ',
                                        money(p['amount_' + s])),
                                        el('div.dp-muted', money(
                                            p['unit_price_' + s]) + ' ea' +
                                            (p['lead_time_' + s] ? ' · ' +
                                                p['lead_time_' + s] + ' d' :
                                                '')));
                                })));
                    });
                });
                pane.appendChild(el('div.table-wrap', el('table.data',
                    el('thead', head), body)));
            }}],
            cards: [
                {title: 'Suppliers', rows: function (d) {
                    return RFQ_SLOTS.map(function (s) {
                        var p = d['supplier_' + s];
                        if (!p && s > 1) {
                            return null;
                        }
                        return ['Supplier ' + s, p ? el('span', {title:
                            p.rec_name}, who(d, s) + (quoted(d, s) ?
                                ' · quoted' + (d['reference_' + s] ? ' (' +
                                    d['reference_' + s] + ')' : '') : '')) :
                            null];
                    });
                }, fields: RFQ_SLOTS.map(function (s) {
                    return {name: 'supplier_' + s, label: 'Supplier ' + s,
                        type: 'many2one', model: 'party.party',
                        domain: SUPPLIER_DOMAIN};
                }), editable: mayWrite},
                {title: 'Delivery', rows: function (d) {
                    return [['Wanted by', d.desired_receive_date ? UI.date(
                        d.desired_receive_date) : null],
                        ['Ship to', d.ship_to_name || 'Our address'],
                        ['Ship via', d.ship_via && UI.shortName(
                            'nline.ship_via', d.ship_via.rec_name)],
                        ['FOB', d.fob_point && UI.shortName('nline.fob_point',
                            d.fob_point.rec_name)],
                        ['Freight', (FREIGHT.filter(function (f) {
                            return f[0] === d.freight_terms;
                        })[0] || [])[1]]];
                }, fields: [
                    {name: 'desired_receive_date', label: 'Wanted by',
                        type: 'date'},
                    {name: 'ship_via', label: 'Ship via', type: 'many2one',
                        model: 'nline.ship_via'},
                    {name: 'fob_point', label: 'FOB point', type: 'many2one',
                        model: 'nline.fob_point'},
                    {name: 'freight_terms', label: 'Freight terms',
                        type: 'selection', options: FREIGHT}],
                    editable: mayWrite},
                {title: 'Terms and dates', rows: function (d) {
                    return [['RFQ date', d.rfq_date ? UI.date(d.rfq_date) :
                        null], ['Quotes due', d.due_date ? UI.date(
                            d.due_date) : null],
                        ['Buyer', d.buyer],
                        ['Terms', d.payment_term && d.payment_term.rec_name],
                        ['Payable', d.payable_account &&
                            d.payable_account.rec_name]];
                }, fields: [
                    {name: 'number', label: 'RFQ ID (blank: the next number)',
                        type: 'char'},
                    {name: 'rfq_date', label: 'RFQ date', type: 'date'},
                    {name: 'due_date', label: 'Quotes due', type: 'date'},
                    {name: 'buyer', label: 'Buyer', type: 'char'},
                    {name: 'payment_term', label: 'Terms', type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'payable_account', label: 'Payable account',
                        type: 'many2one', model: 'account.account', domain: [
                            ['type.payable', '=', true],
                            ['closed', '!=', true]]}],
                    editable: mayWrite},
                {title: 'Specs', rows: function (d) {
                    return [['Specs', d.specifications ?
                        String(d.specifications).slice(0, 200) : null]];
                }, fields: [{name: 'specifications', label: 'Specs',
                    type: 'text'}], editable: mayWrite}
            ],
            trail: function (d) {
                if (!d.id) {
                    return [];
                }
                var rows = [
                    {done: true, text: 'Requested', when: UI.date(d.rfq_date)},
                    {done: Boolean(d.printed_date), text: 'Printed', when:
                        d.printed_date ? UI.date(d.printed_date) : 'not yet'},
                    {done: d.status !== 'unreleased', text: 'Sent (active)',
                        when: d.status === 'unreleased' ? 'not yet' : ''}];
                slots(d).forEach(function (s) {
                    rows.push({done: quoted(d, s), text: 'Quote from ' +
                        who(d, s) + (d['reference_' + s] ? ' · ' +
                            d['reference_' + s] : ''), when: quoted(d, s) ?
                        UI.date(d['as_of_date_' + s]) : 'waiting'});
                });
                d.purchases.forEach(function (p) {
                    rows.push({done: true, text: 'PO ' + p.number + ' · ' +
                        p.party + ' · ' + (PO_STATUS[p.status] || ''),
                        onclick: function () {
                            openPo(p.id, p.number);
                        }});
                });
                rows.push({done: d.status === 'closed', text: 'Closed', when:
                    d.status === 'closed' ? '' : 'open'});
                rows.push({text: 'Notes', onclick: function () {
                    var pane = el('div', {style: {minWidth: '480px'}});
                    UI.notesTab(pane, 'nline.rfq', d.id, mayWrite(d));
                    UI.modal('Notes: RFQ ' + d.number, pane);
                }});
                return rows;
            },
            keys: {
                p: {label: 'print', run: function (d) {
                    if (d.id) {
                        print(d);
                    }
                }},
                a: {label: 'add a line', run: function (d) {
                    if (mayWrite(d)) {
                        editLine(d, null);
                    }
                }},
                q: {label: 'enter a quote', run: function (d) {
                    var gaps = missing(d);
                    if (d.id && mayWrite(d) && slots(d).length) {
                        enterQuote(d, gaps.length ? gaps[0] : slots(d)[0]);
                    }
                }},
                o: {label: 'create PO', run: function (d) {
                    if (mayOrder(d)) {
                        createPo(d);
                    }
                }}
            },
            classic: function (d) {
                toClassic(main, 'rfq', 'jsRfq', d && d.id ? [d.id] : []);
            }
        });
        return page;
    }

    Screens.jsRfq = function (main, params) {
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var query = (global.location.hash.split('?')[1] || '');
        var preset = /(?:^|&)supplier=(\d+)/.exec(query);
        var host = docHost(main, 'rfq');
        if (!host) {
            classicRfq(main, params);
            return;
        }
        if (preset && !openId) {
            /* Suppliers > Request a quote: a new request with the supplier
             * as Supplier 1 */
            Rpc.searchRead('party.party', [['id', '=', parseInt(preset[1],
                10)]], ['rec_name', 'code']).then(function (rows) {
                    rfqModern(host, null, rows.length ? {id: rows[0].id,
                        rec_name: rows[0].rec_name} : null);
                }, function () {
                    rfqModern(host, null, null);
                });
            return;
        }
        rfqModern(host, openId, null);
    };

    function classicRfq(main, params) {
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var statusLabel = {};
        RFQ_STATUS.forEach(function (s) {
            statusLabel[s[0]] = s[1];
        });
        var query = (global.location.hash.split('?')[1] || '');
        var preset = /(?:^|&)supplier=(\d+)/.exec(query);
        var rfqApi = docWindow(main, {
            title: 'Request For Quote',
            model: 'nline.rfq',
            label: 'RFQ ID',
            order: [['rfq_date', 'DESC'], ['number', 'DESC']],
            rights: ['nline.rfq', 'purchase.purchase',
                'purchase.product_supplier'],
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
                /* Placed as Jobshop's RequestForQuote layout; the RFQ
                 * Lines sub-tab under it */
                {title: 'Request For Quote', fields: [
                    {name: 'number', label: 'RFQ ID', type: 'char',
                        at: [17, 6, 257, 26], split: 110,
                        help: 'Blank: the next number'},
                    {name: 'rfq_date', label: 'RFQ Date', type: 'date',
                        at: [17, 28, 257, 48], split: 110},
                    {name: 'desired_receive_date', label: 'Desired Recv Date',
                        type: 'date', at: [16, 50, 256, 70], split: 110},
                    {name: 'status', label: 'RFQ Status', type: 'selection',
                        options: RFQ_STATUS, at: [16, 72, 256, 92],
                        split: 110},
                    {name: 'fob_point', label: 'FOB Point ID',
                        type: 'many2one', model: 'nline.fob_point',
                        at: [16, 94, 256, 114], split: 110},
                    {name: 'ship_via', label: 'Ship Via ID',
                        type: 'many2one', model: 'nline.ship_via',
                        at: [16, 116, 256, 136], split: 110},
                    {name: 'payment_term', label: 'Terms ID',
                        type: 'many2one',
                        model: 'account.invoice.payment_term',
                        at: [16, 138, 256, 158], split: 110},
                    {name: 'payable_account', label: 'Payable Acct ID',
                        type: 'many2one', model: 'account.account',
                        domain: [['type.payable', '=', true],
                            ['closed', '!=', true]],
                        at: [16, 160, 256, 180], split: 110},
                    {name: 'due_date', label: 'Quote Due Date',
                        type: 'date', at: [397, 6, 627, 26], split: 105},
                    {name: 'freight_terms', label: 'Freight Terms',
                        type: 'selection', options: FREIGHT,
                        at: [397, 28, 627, 49], split: 105},
                    {name: 'buyer', label: 'Buyer', type: 'char',
                        at: [397, 51, 627, 71], split: 105},
                    {name: 'printed_date', label: 'Printed Date',
                        type: 'char', readonly: true,
                        at: [397, 73, 627, 93], split: 105}],
                    /* Jobshop's button (btnCreatePO): greyed unless the
                     * request is active */
                    buttons: [{label: 'Preview / Create PO',
                        at: [655, 22, 786, 64], onclick: function () {
                            if (rfqMayCreatePo(rfqApi.data(),
                                    rfqApi.access())) {
                                rfqCreatePo(rfqApi.data(), rfqApi);
                            }
                        }}],
                    render: rfqLines},
                {title: 'Supplier 1', render: rfqSupplierTab(1)},
                {title: 'Supplier 2', render: rfqSupplierTab(2)},
                {title: 'Supplier 3', render: rfqSupplierTab(3)},
                {title: 'Ship To', render: rfqShipTo},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', span: 4, rows: 12}]},
                {title: 'Notes', render: function (pane, data) {
                    if (!data || !data.id) {
                        pane.appendChild(el('p.muted', 'Save the request ' +
                            'for quote first.'));
                        return null;
                    }
                    UI.notesTab(pane, 'nline.rfq', data.id, true);
                    return null;
                }},
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
                {name: 'supplier_1.code', label: 'Supplier 1 ID'},
                {name: 'supplier_2.code', label: 'Supplier 2 ID'},
                {name: 'supplier_3.code', label: 'Supplier 3 ID'}],
            /* Jobshop's description boxes beside the codes */
            places: {'Supplier ID': false,
                'FOB Point ID': [258, 94, 629, 114],
                'Ship Via ID': [258, 116, 629, 136],
                'Terms ID': [258, 138, 629, 158],
                'Payable Acct ID': [258, 160, 629, 180],
                'Tax Group ID': [233, 27, 474, 47]},
            onshow: function (data, a) {
                var button = Array.prototype.filter.call(
                    main.querySelectorAll('button.js-btn'), function (b) {
                        return b.textContent === 'Preview / Create PO';
                    })[0];
                if (button) {
                    /* (no right to make orders: not offered at all) */
                    var po = a.access()['purchase.purchase'];
                    button.hidden = !(po && po.create);
                    button.disabled = !rfqMayCreatePo(data, a.access());
                }
            },
            extra: [
                {label: 'New View', title: 'The modern request for quote page',
                    onclick: function (data) {
                        UI.setDocView('rfq', 'modern');
                        Screens.jsRfq(main, data && data.id ? [data.id] : []);
                    }},
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
        /* Suppliers > Tools > Create RFQ for Supplier: a new request with
         * the supplier as Supplier 1 */
        if (preset && !openId) {
            /* (after the window's own first show, which waits on the
             * rights too) */
            Promise.all([Rpc.searchRead('party.party', [['id', '=',
                parseInt(preset[1], 10)]], ['rec_name']), rights(
                ['nline.rfq'])]).then(function (all) {
                var rows = all[0];
                if (rows.length) {
                    rfqApi.show({rfq_date: UI.today(), due_date: UI.today(),
                        status: 'unreleased', lines: [], purchases: [],
                        supplier_1: {id: rows[0].id, rec_name:
                            rows[0].rec_name}});
                }
            }, UI.showError);
        }
    }

    /* ======================================================================
     * Receiving
     * ==================================================================== */

    /* Tools > Apply Fixed Charges: spread a charge over the receiver lines */
    function applyFixedCharges(lines, done) {
        var amount = el('input.money', {type: 'text', 'aria-label':
            'Charge Amount'});
        /* Jobshop's dialog: Charge Amount, Method and How to Apply radio
         * groups */
        function radios(name, options) {
            var box = el('fieldset.jsp-sub', el('legend', name));
            options.forEach(function (o, i) {
                box.appendChild(el('label.jsp-radio', el('input', {type:
                    'radio', name: 'jsp-' + name, value: o[0], checked:
                        i === 0}), ' ' + o[1]));
            });
            return {node: box, value: function () {
                var on = box.querySelector('input:checked');
                return on ? on.value : options[0][0];
            }};
        }
        var how = radios('Method', [['equal',
            'Apply Equally Across All Lines'], ['quantity',
            'Apportion by Quantity (Stock UM)'], ['cost',
            'Apportion by Cost']]);
        var mode = radios('How to Apply', [['add', 'Add to Fixed Charge'],
            ['replace', 'Replace Fixed Charge']]);
        UI.modal('Apply Fixed Charges Across Receiver Lines', [el('div',
            el('label.field', 'Charge Amount'), amount), how.node,
            mode.node], [
            {label: 'Cancel'},
            {label: 'OK', primary: true, onclick: function () {
                var charge = parseNum(amount.value);
                var live = lines.filter(function (l) {
                    return !l.deleted;
                });
                if (!charge || !live.length) {
                    return true;
                }
                var weights = live.map(function (l) {
                    var v = l.values();
                    if (how.value() === 'quantity') {
                        return parseNum(v.receive_quantity) || 0;
                    }
                    if (how.value() === 'cost') {
                        var base = (parseNum(v.receive_quantity) || 0) *
                            (parseNum(v.unit_price) || 0) * (1 -
                                (parseNum(v.discount) || 0) / 100);
                        return mode.value() === 'add' ? base +
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
                    var fixed = mode.value() === 'add' ?
                        (parseNum(v.fixed_charge) || 0) + share : share;
                    l.setFixed(Math.round(fixed * 100) / 100);
                });
                done();
            }}]);
    }

    /* ---- Receiving, modern view (UI.docPage) ---------------------------
     * Nothing open: what waits to be received (late first) and what came
     * in lately. A receiver as a document: the supplier as headline, the
     * lines received, the three-way match of the order, this receipt and
     * the supplier's bill; Receive, Enter bill, Return and Cancel as
     * actions. A receiver is opened by its key: 'new:<purchase>',
     * 'receipt:<id>' or 'return:<id>' (a plain id: a receipt). Loaded and
     * saved with the classic window's RPCs (js_receiver_*). */

    function receiverKey(key) {
        if (typeof key === 'number' || /^\d+$/.test(String(key))) {
            return {kind: 'receipt', id: parseInt(key, 10)};
        }
        var m = /^(new|receipt|return):(\d+)$/.exec(String(key || ''));
        return m ? {kind: m[1], id: parseInt(m[2], 10)} : null;
    }

    /* The receiver with its order (js_po_get) and the supplier's bill in
     * accounting (account.invoice of the receiver's Invoice ID); id is the
     * key, shipment the receiver's own id */
    function loadReceiver(key) {
        var k = receiverKey(key);
        if (!k) {
            return Promise.reject({message: 'No such receiver: ' + key});
        }
        var get = k.kind === 'new' ? Rpc.desk('js_receiver_new', [k.id]) :
            Rpc.desk('js_receiver_get', [k.kind, k.id]);
        return get.then(receiverExtras);
    }

    function receiverExtras(d) {
        d.shipment = d.id;
        d.id = d.id ? d.kind + ':' + d.id : null;
        d.lines = d.lines || [];
        var po = d.purchase ? Rpc.desk('js_po_get', [d.purchase]).catch(
            function () {
                return null;
            }) : Promise.resolve(null);
        var bill = d.supplier_invoice && d.supplier ? Rpc.searchRead(
            'account.invoice', [['type', '=', 'in'], ['party', '=',
                d.supplier.id], ['OR', ['reference', '=', d.supplier_invoice],
                ['number', '=', d.supplier_invoice]]], ['number', 'reference',
                'invoice_date', 'total_amount', 'amount_to_pay', 'state'],
            {limit: 1, order: [['id', 'DESC']]}).then(function (rows) {
                return rows[0] || null;
            }, function () {
                return null;
            }) : Promise.resolve(null);
        return Promise.all([po, bill]).then(function (all) {
            d.po = all[0];
            d.bill = all[1];
            d.poLines = {};
            ((d.po && d.po.lines) || []).forEach(function (l) {
                d.poLines[l.sequence] = l;
            });
            return d;
        });
    }

    function receivingModern(main, openKey) {
        var access = {};
        var page, spec;
        UI.access(['stock.shipment.in', 'stock.shipment.in.return',
            'purchase.purchase']).then(function (a) {
                access = a || {};
                if (page) {
                    page.render();
                }
            });
        function can(model, right) {
            return Boolean(access[model] && access[model][right]);
        }
        function canReceive() {
            return can('stock.shipment.in', 'create');
        }
        function canReturn() {
            return can('stock.shipment.in.return', 'create');
        }
        function mayWrite(d) {
            return Boolean(d && d.shipment && can(d.kind === 'return' ?
                'stock.shipment.in.return' : 'stock.shipment.in', 'write'));
        }
        function isNew(d) {
            return d && !d.board && !d.transacted;
        }
        function live(d) {
            return d && d.kind === 'receipt' && d.transacted &&
                d.receiver_status !== 'cancelled';
        }
        function money(v) {
            return UI.money(n0(v), true);
        }
        function amountOf(d, l) {
            if (!isNew(d) && l.amount !== undefined && l.amount !== null) {
                return n0(l.amount);
            }
            var q = isNew(d) ? n0(l.receive_quantity) : n0(l.quantity);
            return Math.round((q * n0(l.unit_price) * (1 - n0(l.discount) /
                100) + n0(l.fixed_charge)) * 100) / 100;
        }
        function total(d) {
            return d.lines.reduce(function (a, l) {
                return a + amountOf(d, l);
            }, 0);
        }
        function poLine(d, l) {
            return l.po_line_no !== null && l.po_line_no !== undefined ?
                d.poLines[l.po_line_no] : null;
        }
        /* The order's price of a line (Jobshop's quoted price and trade
         * discount) when the receiver's differs */
        function priceGap(d, l) {
            var p = poLine(d, l);
            if (!p || d.kind !== 'receipt') {
                return null;
            }
            var ordered = n0(p.list_unit_price !== undefined &&
                p.list_unit_price !== null ? p.list_unit_price :
                p.unit_price);
            if (Math.abs(ordered - n0(l.unit_price)) > 0.00001 ||
                    Math.abs(n0(p.trade_discount) - n0(l.discount)) >
                    0.00001) {
                return {price: ordered, discount: n0(p.trade_discount)};
            }
            return null;
        }
        function billGap(d) {
            if (!d.bill) {
                return null;
            }
            var diff = n0(d.bill.total_amount) - total(d);
            return Math.abs(diff) > 0.005 ? diff : null;
        }
        function returned(d) {
            return d.lines.reduce(function (a, l) {
                return a + n0(l.returned_quantity);
            }, 0);
        }
        function orderedAmount(d) {
            var seen = {};
            return d.lines.reduce(function (a, l) {
                var p = poLine(d, l);
                if (!p || seen[p.id]) {
                    return a;
                }
                seen[p.id] = true;
                return a + n0(p.amount);
            }, 0);
        }
        function show(key) {
            return page.load(key);
        }
        function print(d) {
            Rpc.report('stock.shipment.in.restocking_list', [d.shipment])
                .then(function (rep) {
                    UI.openReport(rep, 'Receiver');
                }, UI.showError);
        }
        function openPoOf(d) {
            openPo(d.purchase, d.purchase_number);
        }

        /* Receive: the date, packing slip and status (and the bill if it
         * came with the goods), then the quantities go into stock */
        function receive(d) {
            var lines = d.lines.filter(function (l) {
                return n0(l.receive_quantity) > 0;
            });
            if (!lines.length) {
                UI.toast('Enter the quantity of at least one line', 'error');
                return;
            }
            UI.docEdit('Receive PO ' + d.purchase_number, [
                {name: 'received_date', label: 'Received', type: 'date'},
                {name: 'reference', label: 'Packing slip', type: 'char'},
                {name: 'receiver_status', label: 'Receiver status',
                    type: 'selection', options: RECEIVER_STATUS.slice(0, 2)},
                {name: 'supplier_invoice', label: 'Supplier invoice ID (if ' +
                    'the bill came with it)', type: 'char', wide: true},
                {name: 'invoiced_date', label: 'Invoiced', type: 'date'},
                {name: 'payment_due_date', label: 'Payment due',
                    type: 'date'}], d, el('p.dp-muted', lines.length +
                    ' line(s), ' + money(total(d)) + '. What is not ' +
                    'received stays on order unless the line is closed ' +
                    'short.')).then(function (v) {
                        var values = plainValues(Object.assign({purchase:
                            d.purchase, specifications: d.specifications},
                            v));
                        values.lines = lines.map(function (l) {
                            return plainValues({move: l.move,
                                receive_quantity: n0(l.receive_quantity),
                                unit_price: l.unit_price, discount:
                                l.discount, fixed_charge: l.fixed_charge,
                                location: l.location ? l.location.id ||
                                    l.location : null,
                                close_short: Boolean(l.close_short)});
                        });
                        UI.service('js_receiver_receive', values).then(
                            function (done) {
                                UI.toast('Receiver ' + done.number +
                                    ' received', 'ok');
                                show('receipt:' + done.id).then(function () {
                                    UI.confirm('Print', 'Print the ' +
                                        'receiver?').then(function (ok) {
                                            if (ok) {
                                                print({shipment: done.id});
                                            }
                                        });
                                });
                            }, failed);
                    }, function () {});
        }

        function enterBill(d) {
            UI.docEdit('Supplier bill', [
                {name: 'supplier_invoice', label: 'Supplier invoice ID',
                    type: 'char', wide: true},
                {name: 'invoiced_date', label: 'Invoiced', type: 'date'},
                {name: 'payment_due_date', label: 'Payment due',
                    type: 'date'}], d).then(function (v) {
                        page.save(v).then(null, function () {});
                    }, function () {});
        }

        function returnGoods(d) {
            var item = {received_date: today(), reference: ''};
            var fields = [
                {name: 'received_date', label: 'Returned', type: 'date'},
                {name: 'reference', label: 'RMA / reference', type: 'char'}];
            var open = d.lines.filter(function (l) {
                return n0(l.receive_quantity) - n0(l.returned_quantity) > 0;
            });
            open.forEach(function (l, i) {
                var left = n0(l.receive_quantity) - n0(l.returned_quantity);
                fields.push({name: 'q' + i, label: 'Line ' + l.line_no +
                    ' · ' + (l.product ? UI.shortName('product.product',
                        l.product.rec_name) : l.description) +
                    ': quantity back (up to ' + num(left) + ' ' +
                    UI.shortName('product.uom', l.unit) + ')', type: 'float',
                    wide: true});
            });
            if (!open.length) {
                UI.toast('Everything on this receiver went back already',
                    'error');
                return;
            }
            UI.docEdit('Return to ' + d.supplier.rec_name, fields, item,
                el('p.dp-muted', 'The goods leave stock for the supplier; ' +
                    'the order stays as it is. To expect them again, use ' +
                    'Cancel receiver instead.')).then(function (v) {
                    var lines = open.map(function (l, i) {
                        return {move: l.move, receive_quantity: v['q' + i]};
                    }).filter(function (x) {
                        return n0(x.receive_quantity) > 0;
                    });
                    if (!lines.length) {
                        UI.toast('Enter a quantity to give back', 'error');
                        return;
                    }
                    UI.service('js_receiver_return', plainValues({receiver:
                        d.shipment, received_date: v.received_date,
                        reference: v.reference, receiver_status: 'approved',
                        lines: lines})).then(function (back) {
                            UI.toast('Return ' + back.number + ' done', 'ok');
                            show('return:' + back.id);
                        }, failed);
                }, function () {});
        }

        function cancelReceiver(d) {
            UI.confirm('Cancel receiver', 'Give back to the supplier all ' +
                'that is left of receiver ' + d.number + ' and expect it ' +
                'again on the order?').then(function (ok) {
                    if (ok) {
                        Rpc.desk('js_receiver_cancel', [d.shipment]).then(
                            function (r) {
                                UI.toast('Receiver ' + r.number +
                                    ' cancelled', 'ok');
                                page.reload();
                            }, UI.showError);
                    }
                });
        }

        /* A line: the quantities and prices of a new receiver (kept here
         * until Receive), the prices of a saved one until it is exported,
         * else what it shows */
        function editLine(d, l) {
            var priced = isNew(d) || (mayWrite(d) && !d.receiver_exported &&
                d.kind === 'receipt');
            var fields = [
                {name: 'description', label: 'Description', type: 'char',
                    wide: true, readonly: true},
                {name: 'receive_quantity', label: (isNew(d) ? 'Receive' :
                    d.kind === 'return' ? 'Returned' : 'Received') + ' qty (' +
                    UI.shortName('product.uom', l.unit) + ')', type: 'float',
                    readonly: !isNew(d)},
                {name: 'unit_price', label: 'Unit price', type: 'float',
                    readonly: !priced},
                {name: 'discount', label: 'Trade disc %', type: 'float',
                    readonly: !priced},
                {name: 'fixed_charge', label: 'Fixed charge', type: 'float',
                    readonly: !priced},
                {name: 'location', label: 'Location', type: 'many2one',
                    model: 'stock.location', domain: [['type', '=',
                        'storage']], readonly: !isNew(d)}];
            if (isNew(d)) {
                fields.push({name: 'close_short', label: 'Close short ' +
                    '(nothing more expected on the line)', type: 'boolean'});
            }
            var p = poLine(d, l);
            var info = el('p.dp-muted', [p ? 'PO line ' + p.sequence + ': ' +
                num(p.quantity) + ' ordered at ' + money(
                    p.list_unit_price !== undefined && p.list_unit_price !==
                    null ? p.list_unit_price : p.unit_price) + (n0(
                    p.trade_discount) ? ' less ' + num(p.trade_discount) +
                    '%' : '') + ', ' + num(p.received) + ' received to date.' :
                null, l.mfg_name || l.mfg_part_id ? ' Mfg: ' + [l.mfg_name,
                    l.mfg_part_id].filter(Boolean).join(' ') + '.' : null,
                (l.links || []).length ? ' Supplies ' + l.links.map(
                    function (k) {
                        return k.production;
                    }).join(', ') + '.' : null].filter(Boolean).join(''));
            UI.docEdit('Line ' + l.line_no + (l.product ? ' · ' +
                UI.shortName('product.product', l.product.rec_name) : ''),
                fields, l, info).then(function (v) {
                    if (!priced) {
                        return;
                    }
                    if (isNew(d)) {
                        var picked = fields.filter(function (f) {
                            return !f.readonly;
                        });
                        picked.forEach(function (f) {
                            l[f.name] = v[f.name];
                        });
                        if (v.location && typeof v.location === 'number') {
                            l.location = {id: v.location, rec_name: (l.location &&
                                l.location.id === v.location) ?
                                l.location.rec_name : String(v.location)};
                            Rpc.searchRead('stock.location', [['id', '=',
                                v.location]], ['rec_name']).then(
                                function (rows) {
                                    if (rows.length) {
                                        l.location.rec_name =
                                            rows[0].rec_name;
                                        page.render();
                                    }
                                }, function () {});
                        }
                        page.render();
                        return;
                    }
                    page.save({lines: lineValues(d).map(function (x) {
                        return x.move === l.move ? Object.assign(x, {
                            unit_price: v.unit_price, discount: v.discount,
                            fixed_charge: v.fixed_charge}) : x;
                    })}).then(null, function () {});
                }, function () {});
        }

        function lineValues(d) {
            return d.lines.map(function (l) {
                return {move: l.move, unit_price: l.unit_price, discount:
                    l.discount, fixed_charge: l.fixed_charge};
            });
        }

        function fixedCharge(d) {
            var lines = isNew(d) ? d.lines : lineValues(d).map(function (x, i) {
                return Object.assign(x, {receive_quantity:
                    d.lines[i].receive_quantity});
            });
            applyFixedCharges(lines.map(function (l) {
                return {deleted: isNew(d) && !n0(l.receive_quantity),
                    values: function () {
                        return l;
                    }, setFixed: function (v) {
                        l.fixed_charge = v;
                    }};
            }), function () {
                if (isNew(d)) {
                    page.render();
                } else {
                    page.save({lines: lines.map(function (x) {
                        return {move: x.move, unit_price: x.unit_price,
                            discount: x.discount, fixed_charge:
                                x.fixed_charge};
                    })}).then(null, function () {});
                }
            });
        }

        /* ---- what waits (nothing open) ---- */
        function board() {
            var b = {id: null, board: true, rows: null, recent: null};
            Promise.all([
                Rpc.desk('js_receiving_activity', ['unreceived', null]),
                Rpc.desk('js_receiving_activity', ['received', null]).catch(
                    function () {
                        return [];
                    })]).then(function (all) {
                        b.rows = all[0];
                        b.recent = all[1].slice(0, 15);
                        if (page && page.data() === b) {
                            page.render();
                        }
                    }, UI.showError);
            return b;
        }
        function due(rows, test) {
            return (rows || []).filter(function (r) {
                return test(r.desired_date);
            });
        }

        var CARDS = [
            {title: 'Receiver', rows: function (d) {
                return [['Number', d.number || 'not received yet'],
                    [d.kind === 'return' ? 'Returned' : 'Received',
                        d.received_date ? UI.date(d.received_date) : null],
                    [d.kind === 'return' ? 'RMA / reference' : 'Packing slip',
                        d.reference],
                    ['Status', RECEIVER_LABEL[d.receiver_status]],
                    ['Received by', d.received_by]];
            }, fields: [
                {name: 'receiver_status', label: 'Receiver status',
                    type: 'selection', options: RECEIVER_STATUS.slice(0, 2)}],
                editable: function (d) {
                    return mayWrite(d) && d.receiver_status !== 'cancelled';
                }},
            {title: 'Supplier bill', rows: function (d) {
                return [['Invoice ID', d.supplier_invoice],
                    ['Invoiced', d.invoiced_date ? UI.date(d.invoiced_date) :
                        null],
                    ['Payment due', d.payment_due_date ? UI.date(
                        d.payment_due_date) : null],
                    ['In accounting', d.bill ? d.bill.number + ' · ' +
                        money(d.bill.total_amount) + (n0(
                            d.bill.amount_to_pay) ? ', ' + money(
                            d.bill.amount_to_pay) + ' open' : ', paid') :
                        d.supplier_invoice ? 'not found' : null],
                    ['Exported', d.receiver_exported ? 'Yes' + (
                        d.receiver_exported_date ? ', ' + UI.date(
                            d.receiver_exported_date) : '') : 'No']];
            }, fields: [
                {name: 'supplier_invoice', label: 'Supplier invoice ID',
                    type: 'char'},
                {name: 'invoiced_date', label: 'Invoiced', type: 'date'},
                {name: 'payment_due_date', label: 'Payment due',
                    type: 'date'},
                {name: 'receiver_exported', label: 'Exported',
                    type: 'boolean'}],
                editable: mayWrite},
            {title: 'Received from', rows: function (d) {
                var a = d.receive_from || {};
                return [['Name', a.name], ['Address', [a.address_1,
                    a.address_2, [a.city, a.state, a.postal_code].filter(
                        Boolean).join(' '), a.country].filter(Boolean)
                    .join(', ')], ['Contact', a.contact], ['Phone', a.phone],
                    ['E-mail', a.email]];
            }},
            {title: 'Order', rows: function (d) {
                return [['Purchase order', d.purchase_number],
                    ['Ordered', d.order_date ? UI.date(d.order_date) : null],
                    ['Buyer', d.buyer],
                    ['Terms', d.payment_term && d.payment_term.rec_name],
                    ['Ship via', d.ship_via && UI.shortName('nline.ship_via',
                        d.ship_via.rec_name)],
                    ['FOB', d.fob_point && UI.shortName('nline.fob_point',
                        d.fob_point.rec_name)],
                    ['Tax group', d.tax_group && d.tax_group.rec_name]];
            }},
            {title: 'Specs', rows: function (d) {
                return [['Specs', d.specifications ? String(d.specifications)
                    .slice(0, 200) : null]];
            }, fields: [{name: 'specifications', label: 'Specs',
                type: 'text'}], editable: mayWrite}];

        function trail(d) {
            var rows = [];
            if (d.purchase) {
                rows.push({done: true, text: 'Ordered: PO ' +
                    d.purchase_number, when: UI.date(d.order_date),
                    onclick: function () {
                        openPoOf(d);
                    }});
            }
            rows.push({done: Boolean(d.transacted), text: d.kind ===
                'return' ? 'Returned ' + d.number : d.transacted ?
                'Received ' + d.number + (d.received_by ? ' by ' +
                    d.received_by : '') : 'Not received yet', when:
                d.transacted ? UI.date(d.received_date) : ''});
            if (returned(d)) {
                rows.push({done: true, text: num(returned(d)) +
                    ' given back to the supplier'});
            }
            if (d.kind === 'receipt' && d.transacted) {
                rows.push({done: Boolean(d.supplier_invoice), text: 'Billed' +
                    (d.supplier_invoice ? ': ' + d.supplier_invoice : ''),
                    when: d.invoiced_date ? UI.date(d.invoiced_date) :
                        'not yet'});
                rows.push({done: Boolean(d.receiver_exported), text:
                    'Exported to accounting', when: d.receiver_exported ?
                        UI.date(d.receiver_exported_date) : 'not yet'});
            }
            if (d.receiver_status === 'cancelled') {
                rows.push({done: true, text: 'Cancelled: expected again on ' +
                    'the order'});
            }
            ((d.po && d.po.receivers) || []).forEach(function (r) {
                if (r.kind + ':' + r.id !== d.id) {
                    rows.push({text: (r.kind === 'return' ? 'Return ' :
                        'Other receiver ') + r.number + ' · ' + money(
                            r.amount), when: UI.date(r.date), onclick:
                        function () {
                            show(r.kind + ':' + r.id);
                        }});
                }
            });
            if (d.shipment) {
                rows.push({text: 'Notes', onclick: function () {
                    var pane = el('div', {style: {minWidth: '480px'}});
                    UI.notesTab(pane, d.kind === 'return' ?
                        'stock.shipment.in.return' : 'stock.shipment.in',
                        d.shipment, mayWrite(d));
                    UI.modal('Notes: receiver ' + d.number, pane);
                }});
            }
            return rows;
        }

        spec = {
            title: 'Receiver',
            crumbs: ['Purchasing', 'Receiving'],
            model: 'stock.shipment.in', label: 'Receiver ID',
            domain: [['state', '=', 'done']],
            order: [['effective_date', 'DESC'], ['id', 'DESC']],
            openId: openKey,
            load: function (key) {
                return loadReceiver(key).then(function (d) {
                    spec.cards = CARDS;
                    spec.trail = trail;
                    return d;
                });
            },
            values: function (d) {
                return {kind: d.kind, id: d.shipment, receiver_status:
                    d.receiver_status, supplier_invoice: d.supplier_invoice,
                    invoiced_date: d.invoiced_date, payment_due_date:
                    d.payment_due_date, receiver_exported:
                    d.receiver_exported, specifications: d.specifications,
                    lines: lineValues(d)};
            },
            save: function (values) {
                return UI.service('js_receiver_save', plainValues(values))
                    .then(receiverExtras);
            },
            blank: function () {
                spec.cards = [];
                spec.trail = null;
                return board();
            },
            head: function (d) {
                if (d.board) {
                    var late = due(d.rows, function (x) {
                        return x && x < today();
                    }).length;
                    var now = due(d.rows, function (x) {
                        return x === today();
                    }).length;
                    return {title: 'Receiving', sub: d.rows ? [
                        d.rows.length + ' orders to receive',
                        late ? {text: late + ' late', tone: 'bad',
                            icon: 'clock'} : null,
                        now ? {text: now + ' due today', tone: 'warn'} :
                            null] : ['Loading…']};
                }
                return {
                    title: d.supplier ? d.supplier.rec_name : 'Receiver',
                    chips: d.supplier_code ? [d.supplier_code] : [],
                    sub: [d.shipment ? (d.kind === 'return' ? 'Return ' :
                        'Receiver ') + d.number : 'New receiver, not ' +
                        'received yet', d.purchase_number ? 'PO ' +
                        d.purchase_number : null,
                        d.transacted ? (d.kind === 'return' ? 'returned ' :
                            'received ') + UI.date(d.received_date) +
                            (d.received_by ? ' by ' + d.received_by : '') :
                            null,
                        d.reference ? (d.kind === 'return' ? 'RMA ' :
                            'slip ') + d.reference : null],
                    amount: {value: money(total(d)), label: d.lines.length +
                        ' lines' + (isNew(d) ? ' to receive' : '')}
                };
            },
            status: function (d) {
                if (d.board) {
                    return [];
                }
                if (isNew(d)) {
                    return [{text: 'Not received', tone: 'warn'}];
                }
                var tone = {approved: 'ok', unapproved: 'warn', cancelled:
                    'bad'}[d.receiver_status];
                return [d.kind === 'return' ? {text: 'Return', tone:
                    'accent'} : null, {text: RECEIVER_LABEL[
                    d.receiver_status] || '', tone: tone},
                    d.kind === 'receipt' ? (d.supplier_invoice ? {text:
                        'Billed ' + d.supplier_invoice, tone: billGap(d) ?
                            'warn' : null} : {text: 'Not billed'}) : null,
                    d.receiver_exported ? {text: 'Exported'} : null]
                    .filter(Boolean);
            },
            actions: function (d) {
                if (d.board) {
                    return [{label: 'Refresh', onclick: function () {
                        page.clear();
                    }}];
                }
                if (isNew(d)) {
                    return [canReceive() ? {label: 'Receive', key: 'r',
                        primary: true, onclick: receive} : null];
                }
                return [
                    d.kind === 'receipt' ? {label: 'Print', key: 'p',
                        onclick: print} : null,
                    live(d) && mayWrite(d) ? {label: 'Enter bill', key: 'b',
                        primary: !d.supplier_invoice, onclick: enterBill} :
                        null,
                    live(d) && canReturn() ? {label: 'Return', onclick:
                        returnGoods} : null];
            },
            more: function (d) {
                if (d.board) {
                    return [{label: 'Classic view', onclick: function () {
                        toClassic(main, 'receiving', 'jsReceiving', []);
                    }}];
                }
                return [
                    d.purchase ? {label: 'Open purchase order', onclick:
                        function () {
                            openPoOf(d);
                        }} : null,
                    d.purchase ? {label: 'Purchase order lines', onclick:
                        function () {
                            poLinesDialog('Purchase Order Lines - ' +
                                d.purchase_number, [['purchase', '=',
                                    d.purchase]]);
                        }} : null,
                    d.supplier ? {label: 'Open supplier', onclick:
                        function () {
                            UI.openScreen('supplier-window/' + d.supplier.id,
                                'Supplier');
                        }} : null,
                    (isNew(d) && canReceive()) || (live(d) && mayWrite(d) &&
                        !d.receiver_exported) ? {label: 'Apply a fixed charge',
                        onclick: function () {
                            fixedCharge(d);
                        }} : null,
                    live(d) && canReturn() && mayWrite(d) ? {label: 'Cancel ' +
                        'receiver', onclick: function () {
                            cancelReceiver(d);
                        }} : null,
                    {label: 'All receiving', onclick: function () {
                        page.clear();
                    }},
                    '-',
                    {label: 'Classic view', onclick: function () {
                        toClassic(main, 'receiving', 'jsReceiving', []);
                    }}].filter(Boolean);
            },
            attention: function (d) {
                var out = [];
                if (d.board) {
                    var late = due(d.rows, function (x) {
                        return x && x < today();
                    });
                    if (late.length) {
                        out.push({tone: 'bad', icon: 'clock', title:
                            late.length + (late.length > 1 ?
                                ' orders are' : ' order is') + ' late',
                            detail: late.slice(0, 4).map(function (r) {
                                return 'PO ' + r.number + ' ' +
                                    r.supplier_name + ' (' + r.message + ')';
                            }).join(', '), action: canReceive() ? {label:
                                'Receive PO ' + late[0].number, onclick:
                                function () {
                                    show('new:' + late[0].purchase);
                                }} : null});
                    }
                    return out;
                }
                if (isNew(d)) {
                    d.lines.forEach(function (l) {
                        if (n0(l.receive_quantity) > 0 && !n0(l.unit_price) &&
                                !n0(l.fixed_charge)) {
                            out.push({tone: 'warn', title: 'Line ' +
                                l.line_no + ' has no price', detail: 'It ' +
                                'would go into stock at $0.', action: {label:
                                    'Set price', onclick: function () {
                                        editLine(d, l);
                                    }}});
                        }
                        var q = n0(l.receive_quantity);
                        if (q > 0 && q < n0(l.quantity) && !l.close_short) {
                            out.push({tone: 'info', title: 'Line ' +
                                l.line_no + ' comes in short', detail:
                                num(q) + ' of ' + num(l.quantity) + ': the ' +
                                'rest stays on order.', action: {label:
                                    'Close short', onclick: function () {
                                        l.close_short = true;
                                        page.render();
                                    }}});
                        }
                    });
                    if (!d.lines.length) {
                        out.push({tone: 'info', title: 'Nothing left to ' +
                            'receive on this order'});
                    }
                    return out;
                }
                if (d.receiver_status === 'cancelled') {
                    out.push({tone: 'bad', title: 'Cancelled', detail: 'What ' +
                        'was left went back; the order expects it again.'});
                    return out;
                }
                if (d.receiver_status === 'unapproved' && mayWrite(d)) {
                    out.push({tone: 'warn', title: 'Not approved', action: {
                        label: 'Approve', onclick: function () {
                            page.save({receiver_status: 'approved'}).then(null,
                                function () {});
                        }}});
                }
                if (d.kind !== 'receipt') {
                    return out;
                }
                d.lines.forEach(function (l) {
                    var gap = priceGap(d, l);
                    if (gap) {
                        out.push({tone: 'warn', title: 'Line ' + l.line_no +
                            ' was received at ' + money(l.unit_price) +
                            (n0(l.discount) ? ' less ' + num(l.discount) +
                                '%' : ''), detail: 'The order says ' + money(
                            gap.price) + (gap.discount ? ' less ' +
                                num(gap.discount) + '%' : '') + '.',
                            action: mayWrite(d) && !d.receiver_exported ? {
                                label: 'Use the order\'s price', onclick:
                                    function () {
                                        page.save({lines: lineValues(d).map(
                                            function (x) {
                                                return x.move === l.move ?
                                                    Object.assign(x, {
                                                        unit_price:
                                                            gap.price,
                                                        discount:
                                                            gap.discount}) :
                                                    x;
                                            })}).then(null, function () {});
                                    }} : null});
                    }
                });
                if (!d.supplier_invoice) {
                    out.push({tone: 'warn', title: 'No supplier bill yet',
                        detail: 'Enter the supplier\'s invoice ID when the ' +
                            'bill comes, to close the three-way match.',
                        action: mayWrite(d) ? {label: 'Enter bill', onclick:
                            function () {
                                enterBill(d);
                            }} : null});
                } else if (billGap(d)) {
                    out.push({tone: 'warn', title: 'Bill ' + d.bill.number +
                        ' is ' + money(d.bill.total_amount) + ', the ' +
                        'receiver ' + money(total(d)), detail: 'A bill may ' +
                            'cover other receivers or charges too: check ' +
                            'before paying.'});
                } else if (!d.bill) {
                    out.push({tone: 'info', title: 'Bill ' +
                        d.supplier_invoice + ' is not in accounting yet',
                        detail: 'No supplier bill of ' + d.supplier.rec_name +
                            ' has that number or reference.'});
                }
                return out;
            },
            tracker: function (d) {
                if (d.board || d.kind !== 'receipt' || !d.po) {
                    return null;
                }
                var billed = d.bill ? n0(d.bill.total_amount) : null;
                return {title: 'Order, receipt and bill', note: 'three-way ' +
                    'match', steps: [
                    {label: 'Ordered (these lines)', value: money(
                        orderedAmount(d)), state: 'done'},
                    {label: 'Received here', value: money(total(d)), state:
                        d.transacted ? (d.receiver_status === 'cancelled' ?
                            'bad' : 'done') : 'now'},
                    {label: 'Billed', value: billed !== null ? money(billed) +
                        ' (' + d.bill.number + ')' : d.supplier_invoice ||
                        'no', state: billed !== null ? (billGap(d) ? 'bad' :
                            'done') : d.supplier_invoice ? 'now' : 'todo'},
                    {label: 'Exported', value: d.receiver_exported ? UI.date(
                        d.receiver_exported_date) || 'yes' : 'no', state:
                        d.receiver_exported ? 'done' : 'todo'}]};
            },
            sections: [
                {title: 'Waiting to be received', note: 'click an order to ' +
                    'receive it', visible: function (d) {
                    return d.board;
                }, render: function (pane, d) {
                    if (!d.rows) {
                        pane.appendChild(el('p.dp-muted.dp-pad', 'Loading…'));
                        return;
                    }
                    UI.docLines(pane, {
                        items: d.rows,
                        kind: function (r) {
                            return {icon: 'truck', tone: r.late ? 'bad' :
                                'part'};
                        },
                        title: function (r) {
                            return r.supplier_name;
                        },
                        chips: function (r) {
                            return ['PO ' + r.number, r.supplier_code !==
                                r.supplier_name ? r.supplier_code : null,
                                r.message ? {text: r.message, tone: r.late ?
                                    'bad' : r.message === 'Due today' ?
                                    'warn' : null} : null];
                        },
                        right: function (r) {
                            return [UI.date(r.desired_date), r.lines +
                                ' line(s) open'];
                        },
                        onclick: canReceive() ? function (r) {
                            show('new:' + r.purchase);
                        } : null,
                        empty: 'Nothing to receive: no released order waits.'
                    });
                }},
                {title: 'Received lately', visible: function (d) {
                    return d.board && (d.recent || []).length > 0;
                }, render: function (pane, d) {
                    UI.docLines(pane, {
                        items: d.recent,
                        kind: function (r) {
                            return r.kind === 'return' ? {icon: 'truck', tone:
                                'charge'} : {icon: 'ok', tone: 'ok'};
                        },
                        title: function (r) {
                            return r.supplier_name;
                        },
                        chips: function (r) {
                            return [(r.kind === 'return' ? 'Return ' :
                                'Receiver ') + r.receiver_number,
                                r.number ? 'PO ' + r.number : null,
                                r.receiver_status !== 'approved' ? {text:
                                    RECEIVER_LABEL[r.receiver_status] || '',
                                    tone: 'warn'} : null];
                        },
                        right: function (r) {
                            return [UI.date(r.date), ''];
                        },
                        onclick: function (r) {
                            show(r.kind + ':' + r.receiver);
                        }
                    });
                }},
                {title: 'What came in', note: function (d) {
                    return isNew(d) ? 'Click a line to change its quantity ' +
                        'or price; nothing is saved until Receive' :
                        d.kind === 'return' ? 'What went back' :
                            'Click a line for its details';
                }, visible: function (d) {
                    return !d.board;
                }, render: function (pane, d) {
                    UI.docLines(pane, {
                        items: d.lines,
                        kind: function (l) {
                            return l.line_type === 'service' ? {icon:
                                'service', tone: 'service'} : {icon: 'part',
                                tone: 'part'};
                        },
                        title: function (l) {
                            return l.description || (l.product &&
                                l.product.rec_name) || 'Line ' + l.line_no;
                        },
                        chips: function (l) {
                            var c = [];
                            if (l.product) {
                                c.push(UI.shortName('product.product',
                                    l.product.rec_name));
                            }
                            if (l.po_line_no !== null && l.po_line_no !==
                                    undefined) {
                                c.push('PO line ' + l.po_line_no);
                            }
                            if (l.location) {
                                c.push(UI.shortName('stock.location',
                                    l.location.rec_name));
                            }
                            if (!n0(l.unit_price) && !n0(l.fixed_charge)) {
                                c.push({text: 'no price', tone: 'warn'});
                            }
                            if (priceGap(d, l)) {
                                c.push({text: 'price differs from PO', tone:
                                    'warn'});
                            }
                            if (n0(l.returned_quantity)) {
                                c.push({text: num(l.returned_quantity) +
                                    ' returned', tone: 'warn'});
                            }
                            if (l.close_short) {
                                c.push({text: 'close short', tone: 'warn'});
                            }
                            return c;
                        },
                        progress: function (l) {
                            if (isNew(d)) {
                                return {done: n0(l.receive_quantity), total:
                                    n0(l.quantity), label: 'receiving ' +
                                    num(l.receive_quantity || 0) + ' of ' +
                                    num(l.quantity) + ' open'};
                            }
                            var p = poLine(d, l);
                            return p ? {done: n0(p.received), total:
                                n0(p.quantity), label: num(p.received) +
                                ' of ' + num(p.quantity) + ' ordered in'} :
                                null;
                        },
                        right: function (l) {
                            var q = isNew(d) ? l.receive_quantity : l.quantity;
                            return [money(amountOf(d, l)), num(q || 0) + ' ' +
                                UI.shortName('product.uom', l.unit) + ' × ' +
                                money(l.unit_price), !n0(l.unit_price) &&
                                !n0(l.fixed_charge) ? 'warn' : null];
                        },
                        onclick: function (l) {
                            editLine(d, l);
                        },
                        footer: [d.lines.length + ' lines', 'Total ' +
                            money(total(d))]
                    });
                }},
                {title: 'Three-way match', note: 'order · this receipt · ' +
                    'bill', visible: function (d) {
                    return !d.board && d.kind === 'receipt' && Boolean(d.po) &&
                        d.lines.length > 0;
                }, render: function (pane, d) {
                    var body = el('tbody');
                    d.lines.forEach(function (l) {
                        var p = poLine(d, l);
                        var gap = priceGap(d, l);
                        var q = isNew(d) ? l.receive_quantity : l.quantity;
                        body.appendChild(el('tr',
                            el('td', String(l.line_no)),
                            el('td', l.product ? el('span', {title:
                                l.product.rec_name}, UI.shortName(
                                    'product.product', l.product.rec_name)) :
                                l.description),
                            el('td.num', p ? num(p.quantity) + ' @ ' + money(
                                p.list_unit_price !== undefined &&
                                p.list_unit_price !== null ?
                                    p.list_unit_price : p.unit_price) : '—'),
                            el('td.num', num(q || 0) + ' @ ' + money(
                                l.unit_price)),
                            el('td.num', p ? num(p.received) + ' of ' +
                                num(p.quantity) : '—'),
                            el('td', gap ? UI.docChip('price differs',
                                'warn') : p ? UI.docChip('matches', 'ok') :
                                '')));
                    });
                    var gapBill = billGap(d);
                    body.appendChild(el('tr', el('td', ''), el('td',
                        el('b', 'Bill')), el('td.num', money(
                            orderedAmount(d))), el('td.num', money(total(d))),
                        el('td.num', d.bill ? money(d.bill.total_amount) +
                            ' (' + d.bill.number + ')' : d.supplier_invoice ||
                            'not billed'),
                        el('td', d.bill ? (gapBill ? UI.docChip(
                            'differs by ' + money(gapBill), 'warn') :
                            UI.docChip('matches', 'ok')) : '')));
                    pane.appendChild(el('div.table-wrap', el('table.data',
                        el('thead', el('tr', el('th', 'Line'), el('th',
                            'Part'), el('th.num', 'Ordered'), el('th.num',
                            'Received here'), el('th.num',
                            'Received to date'), el('th', 'Check'))),
                        body)));
                }}],
            cards: [],
            trail: null,
            keys: {
                r: {label: 'receive', run: function (d) {
                    if (isNew(d) && canReceive()) {
                        receive(d);
                    }
                }},
                p: {label: 'print', run: function (d) {
                    if (d.shipment && d.kind === 'receipt') {
                        print(d);
                    }
                }},
                b: {label: 'enter bill', run: function (d) {
                    if (live(d) && mayWrite(d)) {
                        enterBill(d);
                    }
                }}
            },
            classic: function () {
                toClassic(main, 'receiving', 'jsReceiving', []);
            }
        };
        page = UI.docPage(main, spec);
        return page;
    }

    Screens.jsReceiving = function (main, params) {
        var host = docHost(main, 'receiving');
        if (!host) {
            classicReceiving(main, params);
            return;
        }
        var query = (global.location.hash.split('?')[1] || '');
        var open = /(receipt|return)=(\d+)/.exec(query);
        var po = /purchase=(\d+)/.exec(query);
        receivingModern(host, open ? open[1] + ':' + open[2] : po ?
            'new:' + po[1] : null);
    };

    function classicReceiving(main) {
        css();
        var query = (global.location.hash.split('?')[1] || '');
        var form = UI.form(main, {title: 'Receiving', extra: [
            {label: 'New View', title: 'The modern receiving page',
                onclick: function () {
                    UI.setDocView('receiving', 'modern');
                    Screens.jsReceiving(main);
                }},
            {label: 'Refresh', title: 'Refresh (F5)', onclick: function () {
                loadActivity();
            }},
            {label: 'Tools ▾', title: 'Tools', onclick: function (event) {
                popup(event.currentTarget, toolsItems());
            }},
            {label: 'View ▾', title: 'View', onclick: function (event) {
                popup(event.currentTarget, viewItems());
            }}]});
        var body = form.body;
        var access = {};
        /* Jobshop: Show Purchase Orders with a Desired Receive Date On or
         * Before (blank: all) */
        var horizon = el('input', {type: 'date', 'aria-label':
            'Desired Receive Date On or Before'});
        horizon.addEventListener('change', function () {
            loadActivity();
        });
        var view = el('select', {'aria-label': 'Receiving View'},
            el('option', {value: 'unreceived'}, 'View Unreceived Orders'),
            el('option', {value: 'received'}, 'View Received Orders'));
        var supplier = UI.picker('party.party', {placeholder:
            'All suppliers', label: 'Supplier', domain: [['is_supplier',
                '=', true]], onselect: function () {
                loadActivity();
            }});
        body.appendChild(el('div.panel.jsp-head', el('label.field',
            'Show Purchase Orders with a Desired Receive Date On or Before'),
            horizon, el('label.field', 'Receiving View'), view,
            el('label.field', 'Supplier'),
            supplier.node, el('button', {type: 'button', onclick:
                function () {
                    supplier.set(null, '');
                    loadActivity();
                }}, 'All')));
        var activityPane = el('div');
        var receiverPane = el('div');
        var linesPane = el('div');
        var fromPane = el('div');
        var detailsPane = el('div');
        var specsPane = el('div');
        var notesPane = el('div');
        var browsePane = el('div');
        /* Jobshop's tabs: Receiving Activity, Receiver (its Details frame
         * under the lines), the Receiver's sub-tabs, Browse */
        /* The Receiver tab: the receiver frame, its sub-tabs (Receiver
         * Lines, Receive From, Specs, Notes: ReceivingSubTabs), the
         * Details frame. (Jobshop's Other tab holds receiver user fields
         * N-Line has not used since 2009: not shown) */
        var subHolder = el('div.jsp-sub');
        var tabs = tabSet(body, [
            {title: 'Receiving Activity', node: activityPane},
            {title: 'Receiver', node: el('div', receiverPane, subHolder,
                el('div.jsp-sub', detailsPane))},
            {title: 'Browse', node: browsePane, onshow: function () {
                loadBrowse();
            }}]);
        tabSet(subHolder, [
            {title: 'Receiver Lines', node: linesPane},
            {title: 'Receive From', node: fromPane},
            {title: 'Specs', node: specsPane},
            {title: 'Notes', node: notesPane}]);
        describe(body);
        var receiver = null;
        var lineState = [];
        var headFields = null, detailFields = null, specFields = null;

        function loadActivity() {
            Rpc.desk('js_receiving_activity', [view.value,
                supplier.value()]).then(function (rows) {
                UI.clear(activityPane);
                if (view.value === 'unreceived' && horizon.value) {
                    rows = rows.filter(function (r) {
                        return !r.desired_date || String(r.desired_date)
                            .slice(0, 10) <= horizon.value;
                    });
                }
                /* Jobshop's two grids: GRID_RECEIVING (the orders to
                 * receive, or the receivers) and GRID_ORDER (their
                 * purchase orders) */
                var unreceived = view.value === 'unreceived';
                var left = table(['Purchase Order ID', 'Receiver ID',
                    'Desired Recv', 'Return', 'Supplier', 'Message'],
                    rows.map(function (r) {
                        return [r.number, r.receiver_number || '',
                            UI.date(r.desired_date), el('input', {type:
                                'checkbox', disabled: true, checked:
                                r.kind === 'return', 'aria-label':
                                'Return'}), r.supplier_name, unreceived ?
                                r.message : RECEIVER_LABEL[
                                    r.receiver_status] || ''];
                    }), {
                    onopen: function (i) {
                        if (unreceived) {
                            openNew(rows[i].purchase);
                        } else {
                            openSaved(rows[i].kind, rows[i].receiver);
                        }
                    },
                    rowClass: function (i) {
                        return rows[i].late ? 'jsp-late' : '';
                    },
                    oncontext: function (event, i) {
                        popup(event, activityMenu(rows[i]));
                    },
                    empty: unreceived ? 'Nothing to receive: no released ' +
                        'order waits.' : 'No receiver in the last year.'});
                var seen = {};
                var orders = rows.filter(function (r) {
                    if (!r.purchase || seen[r.purchase]) {
                        return false;
                    }
                    seen[r.purchase] = true;
                    return true;
                });
                var right = table(['Order ID', 'Supplier ID', 'Name',
                    'Order Date', 'Status', 'Last Received Date'],
                    orders.map(function (r) {
                        return [r.number, r.supplier_code, r.supplier_name,
                            UI.date(r.order_date), PO_STATUS[r.status] || '',
                            UI.date(r.last_received_date)];
                    }), {
                    onopen: function (i) {
                        UI.openScreen('purchase-orders/' + orders[i].purchase,
                            'PO ' + orders[i].number);
                    },
                    oncontext: function (event, i) {
                        popup(event, activityMenu(orders[i]));
                    },
                    empty: 'None.'});
                left.classList.add('jsp-receiving');
                right.classList.add('jsp-orders');
                activityPane.appendChild(el('div.jsp-two', left, right));
                activityPane.appendChild(el('p.muted', unreceived ?
                    'Double-click an order to make its receiver; ' +
                    'right-click > Receive receives it to completion. ' +
                    'Double-click an order on the right to open it.' :
                    'Double-click a receiver to open it.'));
            }, UI.showError);
        }

        /* Jobshop's PopupReceiving */
        function activityMenu(row) {
            var received = Boolean(row.receiver);
            return [
                {label: 'Receiving View', items: [
                    ['unreceived', 'View Unreceived Orders'],
                    ['received', 'View Received Orders']].map(function (v) {
                        return {label: v[1], checked: view.value === v[0],
                            onclick: function () {
                                view.value = v[0];
                                loadActivity();
                            }};
                    })},
                '-',
                !received && canReceive() ? {label: 'Receive', onclick:
                    function () {
                        receiveAll(row.purchase);
                    }} : null,
                received && row.kind === 'receipt' && canReturn() ? {label:
                    'Return', onclick: function () {
                        openSaved(row.kind, row.receiver);
                    }} : null,
                received ? {label: 'Edit Receiver', onclick: function () {
                    openSaved(row.kind, row.receiver);
                }} : (canReceive() ? {label: 'Edit Receiver', onclick:
                    function () {
                        openNew(row.purchase);
                    }} : null),
                '-',
                row.purchase ? {label: 'Open Purchase Order...', onclick:
                    function () {
                        UI.openScreen('purchase-orders/' + row.purchase,
                            'PO ' + row.number);
                    }} : null,
                row.purchase ? {label: 'Purchase Order Lines...', onclick:
                    function () {
                        poLinesDialog('Purchase Order Lines - ' + row.number,
                            [['purchase', '=', row.purchase]]);
                    }} : null];
        }

        function canReturn() {
            return Boolean(access['stock.shipment.in.return'] &&
                access['stock.shipment.in.return'].create);
        }

        /* The ribbon's Tools / View menus */
        function toolsItems() {
            var m = mode();
            var items = [];
            if (m && m !== 'view' && receiver && !receiver.receiver_exported) {
                items.push({label: 'Apply Fixed Charge...', onclick:
                    function () {
                        applyFixedCharges(lineState, lineRecompute);
                    }});
            }
            if (receiver && receiver.id && receiver.kind === 'receipt') {
                items.push({label: 'Print Receiver...', onclick: printIt});
            }
            if (receiver && receiver.purchase) {
                items.push({label: 'Open Purchase Order...', onclick:
                    function () {
                        UI.openScreen('purchase-orders/' + receiver.purchase,
                            'PO ' + receiver.purchase_number);
                    }});
            }
            return items.length ? items : [{label: '(open a receiver first)', disabled: true, onclick: function () {}}];
        }

        function viewItems() {
            if (!receiver || !receiver.purchase) {
                return [{label: '(open a receiver first)', disabled: true, onclick: function () {}}];
            }
            return [{label: 'Purchase Order Lines...', onclick: function () {
                poLinesDialog('Purchase Order Lines - ' +
                    receiver.purchase_number, [['purchase', '=',
                        receiver.purchase]]);
            }}];
        }

        function printIt() {
            Rpc.report('stock.shipment.in.restocking_list',
                [receiver.id]).then(function (rep) {
                UI.openReport(rep, 'Receiver');
            }, UI.showError);
        }

        /* The Browse tab: the receivers and returns of the last year */
        function loadBrowse() {
            Rpc.desk('js_receiving_activity', ['received', null]).then(
                function (rows) {
                    UI.clear(browsePane).appendChild(table(['Receiver ID',
                        'Purchase Order ID', 'Supplier Name',
                        'Receiver Status', 'Receiver Type'],
                        rows.map(function (r) {
                            return [r.receiver_number, r.number,
                                r.supplier_name, RECEIVER_LABEL[
                                    r.receiver_status] || '',
                                r.kind === 'return' ? 'Return' : 'Receipt'];
                        }), {onopen: function (i) {
                            openSaved(rows[i].kind, rows[i].receiver);
                        }, empty: 'No receiver in the last year.'}));
                }, UI.showError);
        }

        var lineRecompute = function () {};

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
                tabs.select('Receiver');
            }, UI.showError);
        }

        function openSaved(kind, id) {
            return Rpc.desk('js_receiver_get', [kind, id]).then(function (r) {
                showReceiver(r);
                tabs.select('Receiver');
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
            /* Jobshop's Close Short: a partial receipt closes the line */
            var short = el('input', {type: 'checkbox', 'aria-label':
                'Close Short', disabled: m !== 'receive'});
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
                            location.value(), close_short: short.checked};
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
            var tr = el('tr', {oncontextmenu: function (event) {
                popup(event, lineMenu(line));
            }, ondblclick: function () {
                lineDialog(line);
            }}, marker, el('td.jsp-cb', short),
                el('td.num', String(line.line_no)),
                el('td.num', line.po_line_no === null ? '' :
                    String(line.po_line_no)),
                el('td', UI.date(line.desired_date)),
                el('td', line.line_type === 'part' ? partId(line.product) :
                    ''),
                el('td', line.line_type === 'service' ?
                    partId(line.product) : ''),
                el('td', line.description),
                el('td.num', num(line.stock_quantity)),
                el('td', UI.shortName('product.uom', line.stock_unit)),
                el('td.num', qty),
                el('td', UI.shortName('product.uom', line.unit)),
                el('td.num', price), el('td.num', disc), el('td.num', fixed),
                el('td.num', amount),
                el('td', location.node),
                el('td', line.mfg_name || ''),
                el('td', line.mfg_part_id || ''),
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
            UI.clear(linesPane);
            UI.clear(fromPane);
            UI.clear(detailsPane);
            UI.clear(specsPane);
            UI.clear(notesPane);
            var m = mode();
            /* Placed as Jobshop's Receiver tab (layouts VPurchasing\
             * Receiving): the receiver frame, then the lines, then the
             * Details frame */
            headFields = fieldsPane([
                {name: 'number', label: 'Receiver ID', type: 'char',
                    readonly: true, at: [17, 10, 275, 30], split: 100},
                {name: 'purchase_number', label: 'Order ID', type: 'char',
                    readonly: true, at: [17, 32, 275, 52], split: 100},
                {name: 'supplier_code', label: 'Supplier ID', type: 'char',
                    readonly: true, at: [17, 54, 275, 74], split: 100},
                {name: 'order_date', label: 'Order Date', type: 'date',
                    readonly: true, at: [17, 76, 228, 96], split: 100},
                {name: 'received_date', label: m === 'return' ?
                    'Return Date' : 'Received Date', type: 'date',
                    readonly: m === 'view', at: [17, 98, 228, 118],
                    split: 100},
                {name: 'receiver_status', label: 'Receiver Status',
                    type: 'selection', options: RECEIVER_STATUS.filter(
                        function (s) {
                            return s[0] !== 'cancelled' ||
                                r.receiver_status === 'cancelled';
                        }), at: [17, 120, 228, 140], split: 100},
                {name: 'reference', label: m === 'return' ?
                    'RMA / Reference' : 'Packing Slip', type: 'char',
                    readonly: m === 'view', at: [289, 10, 483, 30],
                    split: 90},
                {name: 'supplier_invoice', label: 'Invoice ID',
                    type: 'char', at: [515, 54, 754, 74], split: 120},
                {name: 'invoiced_date', label: 'Invoiced Date',
                    type: 'date', at: [515, 76, 754, 96], split: 120},
                {name: 'payment_due_date', label: 'Payment Due Date',
                    type: 'date', at: [515, 98, 754, 118], split: 120},
                {name: 'receiver_exported', label: 'Exported',
                    type: 'boolean', at: [515, 120, 590, 140]},
                {name: 'receiver_exported_date', label: 'Date',
                    type: 'date', readonly: true, at: [601, 120, 754, 140],
                    split: 31}], {frames: [{label: '',
                        at: [7, 1, 844, 146]}]});
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
            lineRecompute = recompute;
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
            linesPane.appendChild(el('div.table-wrap', el(
                'table.data.jsp-lines', el('thead', el('tr', el('th.jsp-row',
                    ''), el('th.jsp-cb', 'Close Short'),
                    el('th.num', 'Line No'), el('th.num', 'PO Line No'),
                    el('th', 'Line Desired Receive Date'),
                    el('th', 'Part ID'), el('th', 'Service ID'),
                    el('th', 'Description'), el('th.num',
                        'Receive Qty (Stk U/M)'), el('th', 'Stock U/M'),
                    el('th.num', m === 'return' ? 'Return Qty (pur UM)' :
                        'Rec/Rtn Qty (Pur U/M)'), el('th', 'Purchase U/M'),
                    el('th.num', 'Unit Price'), el('th.num', 'Disc %'),
                    el('th.num', 'Fixed Charge'), el('th.num',
                        'Received Amount'), el('th', 'Location ID'),
                    el('th', 'Mfg Name'), el('th', 'Mfg Part Id'),
                    el('th.num', 'Returned'))), tbody)));
            if (m === 'receive') {
                linesPane.appendChild(el('p.muted', 'Not saved until ' +
                    'you click Receive: then the quantities go into stock ' +
                    'and what is left stays on order.'));
            } else if (m === 'return') {
                linesPane.appendChild(el('p.muted', 'Enter the ' +
                    'quantities to give back and click Return; the order ' +
                    'stays closed. Cancel Receiver gives back all that is ' +
                    'left and expects it again on the order.'));
            }
            fromPane.appendChild(addressBlock(r.receive_from));
            fromPane.appendChild(el('p.muted', 'Change the address on the ' +
                'Purchase From tab of the purchase order.'));
            detailFields = fieldsPane([
                {name: 'buyer', label: 'Buyer', type: 'char',
                    readonly: true, at: [19, 24, 230, 44], split: 100},
                {name: 'fob_point', label: 'FOB Point ID', type: 'many2one',
                    model: 'nline.fob_point', readonly: true,
                    at: [19, 46, 230, 66], split: 100},
                {name: 'ship_via', label: 'Ship Via ID', type: 'many2one',
                    model: 'nline.ship_via', readonly: true,
                    at: [19, 68, 230, 88], split: 100},
                {name: 'received_by', label: 'Received By', type: 'char',
                    readonly: true, at: [19, 90, 397, 110], split: 100},
                {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                    model: 'account.tax', readonly: true,
                    at: [411, 24, 645, 44], split: 120},
                {name: 'payment_term', label: 'Terms ID', type: 'many2one',
                    model: 'account.invoice.payment_term', readonly: true,
                    at: [411, 46, 645, 66], split: 120},
                {name: 'payable_account', label: 'Payable Acct ID',
                    type: 'many2one', model: 'account.account',
                    readonly: true, at: [411, 68, 645, 88], split: 120}],
                {frames: [{label: 'Details', at: [7, 0, 844, 114]}]});
            detailFields.set(r);
            detailsPane.appendChild(detailFields.node);
            specFields = fieldsPane([{name: 'specifications', label:
                'Specifications', type: 'text', span: 4, rows: 10}]);
            specFields.set(r);
            specsPane.appendChild(specFields.node);
            var shipModel = r.kind === 'return' ? 'stock.shipment.in.return' :
                'stock.shipment.in';
            if (r.id) {
                UI.notesTab(notesPane, shipModel, r.id, Boolean(
                    access[shipModel] && access[shipModel].write));
            } else {
                notesPane.appendChild(el('p.muted', 'Receive first.'));
            }
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
        /* Receiver Lines right-click (Jobshop's PopupReceiverLines) */
        function lineMenu(line) {
            var items = [{label: 'Edit Details...', onclick: function () {
                lineDialog(line);
            }}];
            if (line.product && line.line_type === 'part') {
                if (global.NLJobshop && global.NLJobshop.supplyDemand) {
                    items.push({label: 'View Supply and Demand...', onclick:
                        function () {
                            global.NLJobshop.supplyDemand(line.product.id);
                        }});
                }
                items.push({label: 'Open Part...', onclick: function () {
                    Rpc.searchRead('product.product', [['id', '=',
                        line.product.id]], ['template']).then(function (p) {
                        if (p.length) {
                            UI.openScreen('parts/' + p[0].template,
                                'Part');
                        }
                    }, UI.showError);
                }});
            }
            return items;
        }

        /* The Receiver Line window (Jobshop's ReceiverLine), read only
         * here: the prices change in the line table */
        function lineDialog(line) {
            var d = Object.assign({}, line, {
                po_line: line.po_line_no, part: line.line_type === 'part' ?
                    UI.shortName('product.product', m2oText(line.product)) :
                    '', service: line.line_type === 'service' ?
                    UI.shortName('product.product', m2oText(line.product)) :
                    '',
                received_amount: UI.money(line.amount !== undefined ?
                    line.amount : 0),
                location_text: m2oText(line.location)});
            tabDialog('Receiver Line - [' + line.line_no + ']', [
                {title: 'Receiver Line', frames: [
                    {label: '', at: [10, 30, 882, 192]},
                    {label: 'Receiving', at: [10, 194, 882, 258]},
                    {label: 'Purchasing', at: [10, 262, 881, 346]}],
                    fields: [
                    {name: 'line_no', label: 'Receiver Line No',
                        type: 'integer', at: [17, 36, 179, 56], split: 100},
                    {name: 'po_line', label: 'PO Line No', type: 'integer',
                        at: [223, 36, 378, 56], split: 80},
                    {name: 'part', label: 'Part ID', type: 'char',
                        at: [17, 58, 378, 78], split: 100},
                    {name: 'description', label: 'Description', type: 'char',
                        at: [17, 80, 861, 100], split: 100},
                    {name: 'service', label: 'Service ID', type: 'char',
                        at: [17, 102, 264, 122], split: 100},
                    {name: 'supplier_part_code', label: 'Supplier Part ID',
                        type: 'char', at: [304, 102, 551, 122], split: 110},
                    {name: 'mfg_name', label: 'Mfg Name', type: 'char',
                        at: [17, 124, 435, 144], split: 100},
                    {name: 'mfg_part_id', label: 'Mfg Part Id', type: 'char',
                        at: [447, 124, 862, 144], split: 100},
                    {name: 'drawing', label: 'Drawing ID/Rev', type: 'char',
                        at: [17, 147, 330, 167], split: 100},
                    {name: 'drawing_revision', label: '/', type: 'char',
                        at: [332, 147, 435, 167], split: 10},
                    {name: 'product_code', label: 'Product Code ID',
                        type: 'char', at: [17, 169, 433, 189], split: 100},
                    {name: 'commodity_code', label: 'Commodity Code ID',
                        type: 'char', at: [447, 169, 863, 189], split: 110},
                    {name: 'quantity', label: 'Rec/Rtn Qty', type: 'float',
                        at: [17, 213, 241, 233], split: 100},
                    {name: 'unit', label: 'Purchase U/M', type: 'char',
                        at: [253, 213, 434, 233], split: 90},
                    {name: 'stock_quantity', label: 'Received Qty (Stk U/M)',
                        type: 'float', at: [448, 213, 647, 233], split: 130},
                    {name: 'stock_unit', label: 'Stock U/M', type: 'char',
                        at: [659, 213, 858, 233], split: 70},
                    {name: 'location_text', label: 'Location ID',
                        type: 'char', at: [17, 235, 600, 255], split: 100},
                    {name: 'unit_price', label: 'Unit Price', type: 'float',
                        at: [17, 276, 241, 296], split: 100},
                    {name: 'discount', label: 'Trade Discount %',
                        type: 'float', at: [253, 276, 434, 296], split: 100},
                    {name: 'fixed_charge', label: 'Fixed Charge',
                        type: 'float', at: [448, 276, 647, 296], split: 90},
                    {name: 'received_amount', label: 'Received Amount',
                        type: 'char', at: [659, 276, 859, 296], split: 100},
                    {name: 'tax_group', label: 'Tax Group ID', type: 'char',
                        at: [17, 298, 434, 318], split: 100},
                    {name: 'expense_account', label: 'Exp Account ID',
                        type: 'char', at: [448, 320, 869, 340],
                        split: 100}].map(function (f) {
                        return Object.assign({readonly: true}, f);
                    })},
                {title: 'Other', fields: [
                    {name: 'user_0', label: 'Eng Parts List', type: 'char',
                        readonly: true, span: 4},
                    {name: 'user_1', label: 'Part Number Rev', type: 'char',
                        readonly: true}]},
                {title: 'Specs', fields: [
                    {name: 'specifications', label: 'Specifications',
                        type: 'text', readonly: true, span: 4, rows: 10}]},
                {title: 'Links', node: table(['Work ID', 'Seq No',
                    'Piece No', {label: 'Quantity', num: true},
                    {label: 'Received Quantity', num: true},
                    'Order Status'], (line.links || []).map(function (k) {
                        return [k.production, k.operation, k.piece,
                            num(k.quantity), num(k.received_quantity),
                            k.state];
                    }), {empty: 'The line supplies no work order.'})}
            ], d, false).then(function () {}, function () {});
        }

        /* (the Details frame shares the Receiver tab: one message) */
        [receiverPane, fromPane, specsPane].forEach(function (p) {
            p.appendChild(el('p.muted', 'Double-click an order in ' +
                'Receiving Activity.'));
        });
    }

    /* ======================================================================
     * Services
     * ==================================================================== */

    /* Jobshop's Services window is one grid: ID, Description, Inactive
     * (add a row, Del marks one deleted, Save). A service is a Tryton
     * service product SVC-<ID>; the grid shows the Jobshop ID. Right-click
     * or double-click a row: the suppliers' prices of the service. */
    Screens.jsServices = function (main) {
        css();
        Promise.all([Rpc.desk('js_service_defaults', []),
            rights(['product.template', 'purchase.product_supplier'])]).then(
            function (all) {
            var defaults = all[0];
            var access = all[1]['product.template'];
            var prefix = defaults.prefix;
            delete defaults.prefix;
            if (!defaults.account_category) {
                delete defaults.account_category;
            }
            var canSave = access.write || access.create;
            var form = UI.form(main, {title: 'Services', extra: [
                {label: 'Refresh', title: 'Refresh (F5)', onclick: load}],
                onClear: load, onSave: canSave ? function () {
                    return save();
                } : null});
            var grid = editGrid([
                {name: 'code', label: 'ID', type: 'char', width: '180px'},
                {name: 'name', label: 'Description', type: 'char'},
                {name: 'inactive', label: 'Inactive', type: 'boolean',
                    width: '70px'}], {
                addLabel: 'Add service',
                deletable: Boolean(access['delete']),
                onopen: function (row) {
                    if (row.data.id) {
                        supplierPrices(row.data);
                    }
                },
                onadd: function (row) {
                    row.tr.addEventListener('contextmenu', function (event) {
                        if (row.data.id) {
                            popup(event, [{label: 'Supplier Prices...',
                                onclick: function () {
                                    supplierPrices(row.data);
                                }}]);
                        }
                    });
                }});
            form.body.appendChild(grid.node);
            keys(grid.node, canSave ? save : null, load);

            function load() {
                Rpc.searchRead('product.template', [['type', '=', 'service'],
                    ['code', 'like', prefix + '%'], ['active', 'in',
                        [true, false]]], ['code', 'name', 'active'],
                    {order: [['code', 'ASC']]}).then(function (rows) {
                    grid.set(rows.map(function (r) {
                        return {id: r.id, code: (r.code || '').slice(
                            prefix.length), name: r.name, inactive:
                                !r.active};
                    }));
                    grid.lock(canSave);
                }, UI.showError);
            }

            function save() {
                var calls = [];
                grid.rows().forEach(function (row) {
                    if (row.deleted) {
                        if (row.data.id) {
                            calls.push(Rpc.model('product.template', 'delete',
                                [[row.data.id]]));
                        }
                        return;
                    }
                    var code = (row.controls.code.get() || '').trim();
                    var name = row.controls.name.get() || code;
                    if (!code) {
                        return;
                    }
                    var values = {code: prefix + code, name: name,
                        active: !row.controls.inactive.get()};
                    if (row.data.id) {
                        if (access.write && (code !== row.data.code ||
                                name !== row.data.name || values.active ===
                                Boolean(row.data.inactive))) {
                            calls.push(Rpc.model('product.template', 'write',
                                [[row.data.id], values]));
                        }
                    } else if (access.create) {
                        calls.push(Rpc.model('product.template', 'create',
                            [[Object.assign({}, defaults, values)]]));
                    }
                });
                return Promise.all(calls).then(function () {
                    UI.toast('Services saved', 'ok');
                    load();
                }, function (error) {
                    UI.showError(error);
                    load();
                });
            }

            function supplierPrices(service) {
                Rpc.searchRead('purchase.product_supplier',
                    [['template', '=', service.id]], ['party.code',
                        'party.rec_name', 'code', 'service_part.rec_name',
                        'as_of_date', 'expiration_date', 'price_type'],
                    {order: [['id', 'ASC']]}).then(function (rows) {
                    linesDialog('Supplier Prices - ' + service.code,
                        ['Supplier ID', 'Supplier Service ID', 'Part ID',
                            'As Of', 'Expires', 'Type'], rows, {
                            cells: function (r) {
                                return [(r['party.'] || {}).code ||
                                    (r['party.'] || {}).rec_name, r.code,
                                    UI.shortName('product.product',
                                        (r['service_part.'] || {}).rec_name),
                                    UI.date(r.as_of_date),
                                    UI.date(r.expiration_date),
                                    r.price_type === 'upto' ? 'Up-to-Qty' :
                                        'Break'];
                            },
                            empty: 'No supplier quoted this service: ' +
                                'enter the prices on the Service Prices ' +
                                'tab of the supplier.'});
                }, UI.showError);
            }

            load();
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
            title: 'Purchasing Tax Groups',
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
            /* Jobshop's one tab: the group's fields and its Taxes grid */
            tabs: [
                {title: 'Purchasing Tax Group', fields: [
                    {name: 'name', label: 'Tax Group ID', type: 'char',
                        at: [14, 12, 264, 32], split: 120},
                    {name: 'inactive', label: 'Inactive', type: 'boolean',
                        at: [270, 12, 451, 32]},
                    {name: 'description', label: 'Description', type: 'char',
                        at: [14, 34, 828, 54], split: 120}],
                    render: taxesTab}],
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
