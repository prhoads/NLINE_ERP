/* N-Line Jobshop emulation: sales screens (module nline_js_sales; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * Jobshop's Sales group bar: Customers, Sales Orders, Shipping, Invoicing
 * and the code tables (Service Charges, Tax Groups, Sales Reps,
 * Territories, SIC Codes, Carriers, Discount Classes). The first four take
 * over the desk's screens of js/orders.js at the same routes and keep what
 * they did. */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    routes.push(
        [/^#\/customer-window$/, 'customerWindow'],
        [/^#\/customer-window\/(\d+)$/, 'customerWindow'],
        [/^#\/orders\/new$/, 'salesOrder'],
        [/^#\/orders\/(\d+)$/, 'salesOrder'],
        [/^#\/shipping$/, 'shipping'],
        [/^#\/shipping\/(\d+)$/, 'shipping'],
        [/^#\/invoicing$/, 'invoicing'],
        [/^#\/invoicing\/(\d+)$/, 'invoicing'],
        [/^#\/service-charges$/, 'jsServiceCharges'],
        [/^#\/service-charges\/(\d+)$/, 'jsServiceCharges'],
        [/^#\/sales-tax-groups$/, 'jsSalesTaxGroups'],
        [/^#\/sales-tax-groups\/(\d+)$/, 'jsSalesTaxGroups'],
        [/^#\/sales-reps$/, 'jsSalesReps'],
        [/^#\/sales-reps\/(\d+)$/, 'jsSalesReps'],
        [/^#\/territories$/, 'jsTerritories'],
        [/^#\/territories\/(\d+)$/, 'jsTerritories'],
        [/^#\/sic-codes$/, 'jsSicCodes'],
        [/^#\/sic-codes\/(\d+)$/, 'jsSicCodes'],
        [/^#\/carriers$/, 'jsCarriers'],
        [/^#\/carriers\/(\d+)$/, 'jsCarriers'],
        [/^#\/discount-classes$/, 'jsDiscountClasses'],
        [/^#\/discount-classes\/(\d+)$/, 'jsDiscountClasses']);

    /* ---- Shared helpers ---------------------------------------------- */

    var CSS = [
        '.js-sales-tabs { margin-top: 8px; }',
        '.js-sales .lines-ro td.num, .js-sales .lines-ro th.num ' +
            '{ text-align: right; }',
        '.js-sales tr.selected td { background: var(--accent-soft); }',
        '.js-sales .js-status { margin-left: 8px; }',
        '.js-sales .js-late { color: var(--bad); }',
        '.js-sales .js-totals { display: flex; gap: 24px; ' +
            'justify-content: flex-end; margin-top: 8px; }',
        '.js-sales .js-totals div { text-align: right; }',
        '.js-sales .js-address { white-space: pre-line; }',
        '.js-sales input.js-qty { width: 7em; text-align: right; }',
        '.js-sales td input, .js-sales td select { width: 100%; ' +
            'box-sizing: border-box; }',
        '.js-sales td input[type=checkbox] { width: auto; }',
        '.js-sales .js-prices { display: grid; ' +
            'grid-template-columns: 2fr 1fr; gap: 12px; }',
        '.js-sales .js-empty { color: var(--muted); }',
        '.js-sales .js-readonly { color: var(--muted); }',
        /* Line grids: one text line per row, the description clipped
         * (its full text in the tooltip); the grid scrolls sideways */
        '.js-sales table.js-nowrap th, .js-sales table.js-nowrap td ' +
            '{ white-space: nowrap; }',
        '.js-sales .js-clip { display: inline-block; max-width: 24em; ' +
            'overflow: hidden; text-overflow: ellipsis; ' +
            'vertical-align: bottom; }',
        '.js-sales table.lines td input[readonly] { background: ' +
            'transparent; border-color: transparent; }'
    ].join('\n');

    function injectCss() {
        if (!global.document.getElementById('nl-js-sales-css')) {
            global.document.head.appendChild(el('style',
                {id: 'nl-js-sales-css'}, CSS));
        }
    }

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function name(v) {
        return v && typeof v === 'object' ? v.rec_name || '' :
            v === null || v === undefined ? '' : String(v);
    }

    function num(v) {
        return v === null || v === undefined || v === '' ? '' :
            String(Math.round(Number(v) * 10000) / 10000);
    }

    function idOf(v) {
        return v && typeof v === 'object' ? v.id : v || null;
    }

    function iso(v) {
        /* A date control's value (Rpc.date) back to ISO for the services */
        if (!v) {
            return null;
        }
        if (typeof v === 'string') {
            return v;
        }
        if (v.__class__ === 'date') {
            var pad = function (n) {
                return (n < 10 ? '0' : '') + n;
            };
            return v.year + '-' + pad(v.month) + '-' + pad(v.day);
        }
        return String(v).slice(0, 10);
    }

    function label(options, value) {
        var found = options.filter(function (o) {
            return o[0] === value;
        })[0];
        return found ? found[1] : value || '';
    }

    var JS_STATUS = [['unreleased', 'Unreleased'], ['firm', 'Firm'],
        ['released', 'Released'], ['hold', 'Hold'], ['closed', 'Closed'],
        ['cancelled', 'Cancelled']];
    var LINE_STATUS = [['open', 'Open'], ['closed', 'Closed'],
        ['cancelled', 'Cancelled']];
    var FREIGHT_TERMS = [[null, ''], ['billed', 'Billed'],
        ['collect', 'Collect'], ['prepaid', 'Prepaid']];
    var CREDIT_STATUS = [['approved', 'Approved'],
        ['hold_orders', 'Hold Orders'], ['hold_shipments', 'Hold Shipments']];
    var QUOTE_TYPES = [['break', 'Break table'], ['up_to', 'Up-to-Qty table']];

    /* Jobshop's tabs: [{title, build(pane)}] -> {show(index), panes} */
    function tabs(main, specs) {
        var bar = el('div.tabs.js-sales-tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        var nodes = [];
        var current = 0;
        function show(index) {
            current = index;
            Array.prototype.forEach.call(bar.children, function (b, i) {
                b.classList.toggle('active', i === index);
                b.setAttribute('aria-selected', i === index);
            });
            nodes.forEach(function (p, i) {
                p.hidden = i !== index;
            });
            if (specs[index].onshow) {
                specs[index].onshow(nodes[index]);
            }
        }
        specs.forEach(function (spec, index) {
            var button = el('button.tab', {type: 'button', role: 'tab',
                onclick: function () {
                    show(index);
                }}, spec.title);
            spec.button = button;
            bar.appendChild(button);
            var pane = el('div.tab-pane.panel', {role: 'tabpanel'});
            nodes.push(pane);
            panes.appendChild(pane);
            if (spec.build) {
                spec.build(pane);
            }
        });
        main.appendChild(bar);
        main.appendChild(panes);
        show(0);
        return {show: show, panes: nodes, current: function () {
            return current;
        }};
    }

    /* A data table: columns [{label, num}], rows [{cells: [...], ondblclick,
     * oncontextmenu, className}]; nowrap: one text line per row (a line
     * grid: use clip() for long text) */
    function clip(text) {
        text = text === null || text === undefined ? '' : String(text);
        return el('span.js-clip', {title: text}, text);
    }

    function check(on) {
        return on ? '✔' : '';
    }

    function table(columns, rows, empty, nowrap) {
        var body = el('tbody');
        rows.forEach(function (row) {
            body.appendChild(el('tr' + (row.className ? '.' + row.className :
                ''), {title: row.ondblclick ? 'Double-click to open' : null,
                ondblclick: row.ondblclick || null,
                oncontextmenu: row.oncontextmenu || null,
                onclick: row.onclick || null}, row.cells.map(
                function (cell, i) {
                    return el('td' + (columns[i] && columns[i].num ?
                        '.num' : ''), cell === null || cell === undefined ?
                        '' : cell);
                })));
        });
        if (!rows.length) {
            body.appendChild(el('tr', el('td.js-empty', {colspan:
                columns.length}, empty || 'None.')));
        }
        return el('div.table-wrap', el('table.data.lines-ro' + (nowrap ?
            '.js-nowrap' : ''), el('thead',
            el('tr', columns.map(function (c) {
                return el('th' + (c.num ? '.num' : ''), c.label);
            }))), body));
    }

    /* A grid of field controls (UI.fieldControl): {node, get(), set(data),
     * controls} where data holds {name: value | {id, rec_name}} */
    function fieldGrid(fields, layout) {
        var controls = {};
        var grid;
        /* layout {frames, custom: {name: control}}: placed as Jobshop
         * (fields with at), else the plain grid */
        if (layout && UI.placedForm) {
            grid = UI.placedForm({fields: fields, frames: layout.frames ||
                [], buttons: layout.buttons || []}, function (f) {
                    var c = layout.custom && layout.custom[f.name] ||
                        UI.fieldControl(f);
                    c.field = f;
                    controls[f.name] = c;
                    return c;
                });
        } else {
            grid = el('div.grid-form', fields.map(function (f) {
                var c = layout && layout.custom && layout.custom[f.name] ||
                    UI.fieldControl(f);
                c.field = f;
                controls[f.name] = c;
                return el('div', f.span ? {style: {gridColumn: 'span ' +
                    f.span}} : null, el('label.field', f.label), c.node);
            }));
        }
        return {
            node: grid,
            controls: controls,
            set: function (data) {
                fields.forEach(function (f) {
                    if (f.custom) {
                        return;
                    }
                    var v = data ? data[f.name] : null;
                    controls[f.name].set(v === undefined ? (f.default !==
                        undefined ? f.default : null) : v);
                });
            },
            get: function () {
                var values = {};
                fields.forEach(function (f) {
                    if (!f.readonly && !f.custom) {
                        var v = controls[f.name].get();
                        values[f.name] = f.type === 'date' ? iso(v) :
                            f.type === 'money' || f.type === 'decimal' ?
                                (v ? v.decimal : null) : v;
                    }
                });
                return values;
            },
            lock: function (editable) {
                fields.forEach(function (f) {
                    if (f.custom) {
                        return;
                    }
                    Array.prototype.forEach.call(controls[f.name].node
                        .querySelectorAll ? controls[f.name].node
                        .querySelectorAll('input, select, textarea, button') :
                        [], function (n) {
                            n.disabled = !editable || Boolean(f.readonly);
                        });
                    var n = controls[f.name].node;
                    if (n.matches && n.matches('input, select, textarea')) {
                        n.disabled = !editable || Boolean(f.readonly);
                    }
                });
            }
        };
    }

    /* Jobshop's Sold To / Ship To / Bill To tab (SalesOrderSubTabs,
     * ShippingSubTabs, InvoicingSubTabs): [part, caption, at, split]; the
     * second address line and the postal code sit beside the label column */
    var ADDRESS_LAYOUT = [
        ['name', 'Name', [12, 4, 456, 24], 72],
        ['addr_1', 'Address', [12, 26, 456, 46], 72],
        ['addr_2', '', [84, 48, 456, 68], 0],
        ['city', 'City', [12, 70, 456, 90], 72],
        ['state', 'State/Postal', [12, 92, 291, 112], 72],
        ['postal', '', [294, 92, 456, 112], 0],
        ['country', 'Country', [12, 114, 456, 134], 72],
        ['etc', 'Etc.', [12, 136, 456, 156], 72],
        ['contact', 'Contact', [477, 4, 807, 24], 59],
        ['title', 'Title', [477, 26, 807, 46], 59],
        ['phone', 'Phone', [477, 48, 807, 68], 59],
        ['fax', 'Fax', [477, 70, 807, 90], 59],
        ['email', 'E-mail', [477, 92, 807, 112], 59],
        ['mobile', 'Mobile', [477, 114, 807, 134], 59]];
    var ADDRESS_PARTS = ADDRESS_LAYOUT.map(function (r) {
        return r[0];
    });

    /* The address fields of a tab (name = prefix + part) */
    function addressFields(prefix, readonly) {
        return ADDRESS_LAYOUT.map(function (r) {
            return {name: prefix + r[0], label: r[1] || (r[0] === 'addr_2' ?
                'Address 2' : 'Postal Code'), type: 'char', readonly:
                Boolean(readonly), at: r[2], split: r[1] ? r[3] : 0};
        });
    }

    /* A Tryton address (desk.py _address) as the tab's parts */
    function addressParts(a, mobile) {
        a = a || {};
        var street = String(a.street || '').split(/\r?\n/).filter(Boolean);
        return {name: a.name || '', addr_1: street[0] || '',
            addr_2: street.slice(1).join(', '), city: a.city || '',
            state: a.state || '', postal: a.postal_code || '',
            country: a.country || '', etc: '', contact: a.contact || '',
            title: a.title || '', phone: a.phone || '', fax: a.fax || '',
            email: a.email || '', mobile: mobile || ''};
    }

    /* The header's address box text from the parts */
    function partsText(p) {
        if (!p) {
            return '';
        }
        return [p.name, p.addr_1, p.addr_2, [p.city, p.state, p.postal]
            .filter(Boolean).join(' '), p.country, p.etc].filter(Boolean)
            .join('\n');
    }

    function prefixed(prefix, parts) {
        var out = {};
        ADDRESS_PARTS.forEach(function (k) {
            out[prefix + k] = parts ? parts[k] || '' : '';
        });
        return out;
    }

    function unprefixed(prefix, values) {
        var out = {};
        ADDRESS_PARTS.forEach(function (k) {
            out[k] = values[prefix + k] || '';
        });
        return out;
    }

    /* Export Contact to Outlook: the contact as a vCard file */
    function exportContact(p) {
        if (!p.contact && !p.name) {
            UI.toast('No contact to export', 'error');
            return;
        }
        var esc = function (v) {
            return String(v || '').replace(/([,;\\])/g, '\\$1');
        };
        var card = ['BEGIN:VCARD', 'VERSION:3.0',
            'FN:' + esc(p.contact || p.name), 'ORG:' + esc(p.name),
            p.title ? 'TITLE:' + esc(p.title) : null,
            p.phone ? 'TEL;TYPE=WORK,VOICE:' + esc(p.phone) : null,
            p.fax ? 'TEL;TYPE=WORK,FAX:' + esc(p.fax) : null,
            p.mobile ? 'TEL;TYPE=CELL:' + esc(p.mobile) : null,
            p.email ? 'EMAIL;TYPE=INTERNET:' + esc(p.email) : null,
            'ADR;TYPE=WORK:;;' + esc([p.addr_1, p.addr_2].filter(Boolean)
                .join(', ')) + ';' + esc(p.city) + ';' + esc(p.state) + ';' +
                esc(p.postal) + ';' + esc(p.country), 'END:VCARD']
            .filter(Boolean).join('\r\n');
        var link = el('a', {href: global.URL.createObjectURL(new global.Blob(
            [card], {type: 'text/vcard'})), download: (p.contact || p.name)
            .replace(/[^\w .-]+/g, '_') + '.vcf'});
        global.document.body.appendChild(link);
        link.click();
        link.remove();
    }

    /* A Sold To / Ship To / Bill To tab shown read-only (a shipper's or
     * an invoice's: the customer's address) in Jobshop's layout */
    function addressPane(pane, address, note, mobile) {
        if (!pane) {
            return;
        }
        UI.clear(pane);
        var parts = addressParts(address, mobile);
        var grid = fieldGrid(addressFields('', true), {buttons: [
            {label: 'Export Contact to Outlook', at: [581, 167, 776, 197],
                onclick: function () {
                    exportContact(parts);
                }}]});
        grid.set(parts);
        grid.lock(false);
        pane.appendChild(grid.node);
        if (note) {
            pane.appendChild(el('p.muted', note));
        }
    }

    /* The Charges tab: rows of service charges.
     * options: {editable, adding, fields: ['amount', 'apply', ...]}
     * -> {node, set(charges), values()} */
    function chargesEditor(options) {
        var body = el('tbody');
        var rows = [];
        var node = el('div');
        var editable = options.editable;

        function addRow(charge) {
            charge = charge || {};
            var locked = !editable || Boolean(charge.invoice) &&
                !options.invoiceEdit;
            var service = UI.picker('nline.service_charge', {label:
                'Service Charge ID', placeholder: 'Service Charge ID',
                fields: ['description', 'amount', 'account',
                    'account.rec_name'], onselect: function (r) {
                    description.value = r.description || '';
                    amount.value = UI.money(r.amount || 0);
                    if (r.account) {
                        account.set(r.account, (r['account.'] || {})
                            .rec_name);
                    }
                }});
            service.set(idOf(charge.service_charge), name(
                charge.service_charge));
            var description = el('input', {type: 'text', 'aria-label':
                'Description', value: charge.description || ''});
            var amount = UI.moneyInput({'aria-label': 'Amount'});
            amount.value = charge.amount === undefined || charge.amount ===
                null ? '' : UI.money(charge.amount);
            var group = UI.picker('nline.sales_tax_group', {label:
                'Tax Group ID', placeholder: 'Tax Group'});
            group.set(idOf(charge.tax_group), name(charge.tax_group));
            var apply = el('input', {type: 'checkbox', 'aria-label': 'Apply'});
            apply.checked = charge.apply === undefined ? true :
                Boolean(charge.apply);
            var account = UI.picker('account.account', {label:
                'Revenue Account ID', placeholder: 'Revenue Account',
                domain: [['type.revenue', '=', true]]});
            account.set(idOf(charge.account), name(charge.account));
            var row = {id: charge.id || null, charge: charge, service: service,
                description: description, amount: amount, group: group,
                apply: apply, account: account};
            [service.input, description, amount, group.input, apply,
                account.input].forEach(function (n) {
                    n.disabled = locked;
                });
            if (charge.id) {
                /* An existing charge keeps its service charge */
                service.input.disabled = true;
            }
            var tr = el('tr', el('td', service.node), el('td', description),
                el('td', amount), el('td', group.node), el('td', apply),
                el('td', account.node),
                el('td.num', charge.applied_amount ?
                    UI.money(charge.applied_amount) : ''),
                el('td', charge.invoice ? name(charge.invoice) || 'Invoiced' :
                    charge.shipment ? name(charge.shipment) : ''),
                el('td.row-delete', locked ? null : el('button', {type:
                    'button', title: 'Delete charge', 'aria-label':
                    'Delete charge', onclick: function () {
                        rows.splice(rows.indexOf(row), 1);
                        tr.remove();
                    }}, '✕')));
            rows.push(row);
            body.appendChild(tr);
        }

        node.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', 'Service Charge ID'), el('th', 'Description'),
                el('th.num', 'Amount'), el('th', 'Tax Group ID'),
                el('th', 'Apply'), el('th', 'Revenue Account ID'),
                el('th.num', 'Applied Amount'), el('th', 'Applied to'),
                el('th', ''))), body)));
        var add = el('button', {type: 'button', onclick: function () {
            addRow(null);
        }}, 'Add charge');
        node.appendChild(el('div.toolbar', add));
        return {
            node: node,
            set: function (charges, canEdit) {
                if (canEdit !== undefined) {
                    editable = canEdit;
                }
                add.hidden = !editable || options.adding === false;
                UI.clear(body);
                rows = [];
                (charges || []).forEach(addRow);
            },
            values: function () {
                return rows.filter(function (r) {
                    return r.id || r.service.value();
                }).map(function (r) {
                    return {
                        id: r.id,
                        service_charge: r.service.value(),
                        description: r.description.value || null,
                        amount: r.amount.value === '' ? null :
                            String(UI.parseMoney(r.amount.value)),
                        tax_group: r.group.value(),
                        apply: r.apply.checked,
                        account: r.account.value()
                    };
                });
            }
        };
    }

    /* Right-click menu for a button: UI.contextMenu at the button */
    function menuAt(button, items) {
        var box = button.getBoundingClientRect();
        UI.contextMenu({preventDefault: function () {}, clientX: box.left,
            clientY: box.bottom}, items);
    }

    /* A menu item that opens a submenu (Jobshop's "... of ▸") at the same
     * place: UI.contextMenu has one level */
    function submenu(event, label, items) {
        return {label: label, items: items};
    }

    /* Jobshop's read-only description beside a code (type4): a span after
     * each lookup of the labels, kept equal to the code's full name (the
     * picker's tooltip) */
    function placeAt(at) {
        return {left: 'calc(var(--u) * ' + at[0] + ')',
            top: 'calc(var(--u) * ' + at[1] + ')',
            width: 'calc(var(--u) * ' + (at[2] - at[0]) + ')',
            height: 'calc(var(--u) * ' + (at[3] - at[1]) + ')'};
    }

    /* labels: [code field label, Jobshop's box of the description (its
     * type4 control) or null] */
    function describe(root, labels) {
        labels.forEach(function (pair) {
            var lab = typeof pair === 'string' ? pair : pair[0];
            var at = typeof pair === 'string' ? null : pair[1];
            Array.prototype.forEach.call(root.querySelectorAll(
                '.picker input[aria-label="' + lab + '"]'), function (input) {
                var layout = input.closest('.js-layout');
                var box = input.closest('.js-ctl') || input.closest(
                    '.grid-form > div');
                if (!box || box.dataset.described) {
                    return;
                }
                box.dataset.described = '1';
                var desc;
                if (at && layout) {
                    desc = el('div.js-ctl.js-desc', {style: placeAt(at)},
                        el('input', {type: 'text', readonly: true,
                            tabindex: -1, 'aria-label': lab +
                                ' description'}));
                    layout.appendChild(desc);
                } else {
                    desc = el('div.js-desc.muted');
                    box.appendChild(desc);
                }
                var update = function () {
                    var full = input.title || '';
                    var cut = full.indexOf(' - ');
                    var text = cut > 0 ? full.slice(cut + 3) : '';
                    var field = desc.querySelector('input');
                    if (field) {
                        field.value = text;
                    } else {
                        desc.textContent = text;
                    }
                };
                new global.MutationObserver(update).observe(input,
                    {attributes: true, attributeFilter: ['title']});
                update();
            });
        });
    }

    /* "1200 - Accounts Receivable": the code (the ID field) */
    function codeOf(v) {
        var n = name(v);
        var at = n.indexOf(' - ');
        return at > 0 ? n.slice(0, at) : n;
    }

    function descOf(v) {
        var n = name(v);
        var at = n.indexOf(' - ');
        return at > 0 ? n.slice(at + 3) : '';
    }

    /* A desk service of this module: when the local server does not have
     * it yet (module not updated) the window says so instead of failing */
    function desk(method, args) {
        return Rpc.desk(method, args).catch(function (error) {
            var text = String(error && (error.message || error) || '');
            if (/not found|has no attribute|Unknown|RPC/i.test(text) &&
                    text.indexOf(method) >= 0) {
                UI.toast('Update module nline_js_sales: ' + method +
                    ' is missing', 'error');
                error.cancelled = true;
            }
            throw error;
        });
    }

    /* Jobshop's shipper statuses */
    var SHIPPER_STATUS = [['unapproved', 'Unapproved'],
        ['approved', 'Approved'], ['cancelled', 'Cancelled']];

    /* A modal with Jobshop's tabs: specs [{title, node}] */
    function tabbedModal(title, specs, buttons) {
        var holder = el('div.js-sales');
        tabs(holder, specs.map(function (s) {
            return {title: s.title, build: function (pane) {
                pane.appendChild(s.node);
            }};
        }));
        return UI.modal(title, [holder], buttons);
    }

    /* A read-only list dialog of rows (the "... Lines..." windows) */
    function listDialog(title, columns, rows, options) {
        options = options || {};
        UI.modal(title, [el('div.js-sales', table(columns, rows,
            options.empty || 'None.'))], [{label: 'Close', primary: true}]);
    }

    /* The Sales Order Lines window (customer's, part's, order's) by order
     * status, with its right-click menu (PopupSalesOrderLines) */
    function orderLinesDialog(title, filters, statuses) {
        desk('sales_order_lines', [Object.assign({}, filters, {statuses:
            statuses})]).then(function (rows) {
            var columns = ['Linked', 'Sales ID', 'Customer ID',
                'Ship To Name', 'Sales Rep ID', 'Order Date', 'Order Status',
                'Desired Ship Date', 'Customer PO No', 'PO Line No',
                'Line No', 'Line Status', 'Order Qty', 'Shipped Qty',
                'Part ID', 'Description', 'U/M', 'Unit Price',
                'Discount Percent', 'Order Amount', 'Shipped Amount',
                'Customer Part ID', 'Product Code', 'Commodity Code',
                'Drawing ID', 'Rev'].map(function (l) {
                    return {label: l, num: /Qty|Price|Amount|Percent/.test(
                        l)};
                });
            listDialog(title + (statuses ? ' (' + statuses.map(function (s) {
                return label(JS_STATUS, s);
            }).join(', ') + ')' : ' (All)'), columns, rows.map(function (r) {
                var open = function () {
                    UI.closeMenu();
                    openOrder(r.sale.id, r.sale.number);
                };
                return {ondblclick: open, oncontextmenu: function (event) {
                    UI.contextMenu(event, [
                        submenu(event, 'All Order Lines by Order Status of',
                            statusItems(function (s) {
                                orderLinesDialog(title, filters, s);
                            })),
                        {label: 'Open Sales Order...', onclick: open},
                        {label: 'Open Customer...', onclick: function () {
                            UI.openScreen('customer-window', 'Customers');
                        }}]);
                }, cells: [r.linked ? '✔' : '', r.sale.number, r.customer,
                    r.ship_to_name, r.sales_rep, UI.date(r.order_date),
                    label(JS_STATUS, r.order_status),
                    UI.date(r.line_desired_date || r.desired_ship_date),
                    r.reference, r.po_line, r.line_no, label(LINE_STATUS,
                        r.line_status), num(r.quantity),
                    num(r.shipped_quantity), name(r.product), r.description,
                    r.unit, UI.money(r.unit_price), num(r.trade_discount),
                    UI.money(r.amount), UI.money(r.shipped_amount),
                    r.customer_part, r.product_code, r.commodity_code,
                    r.drawing_id, r.drawing_rev]};
            }), {empty: 'No order line.'});
        }, failed);
    }

    /* View ... by Status of: All, then each Jobshop order status */
    function statusItems(onpick) {
        return [{label: 'All', onclick: function () {
            onpick(null);
        }}].concat(JS_STATUS.map(function (s) {
            return {label: s[1], onclick: function () {
                onpick([s[0]]);
            }};
        }));
    }

    /* View All Quote / PO Lines for Part by Status of */
    function partLinesDialog(kind, product) {
        var statuses = kind === 'quote' ? [['active', 'Active'],
            ['cancelled', 'Cancelled'], ['lost', 'Lost'], ['ready', 'Ready'],
            ['won', 'Won']] : [['draft', 'Unreleased'],
            ['quotation', 'Firm'], ['confirmed', 'Released'],
            ['processing', 'Released (receiving)'], ['done', 'Closed'],
            ['cancelled', 'Cancelled']];
        return function (event) {
            return submenu(event, kind === 'quote' ?
                'View All Quote Lines for Part by Quote Status of' :
                'View All PO Lines for Part by Order Status of',
                [['', 'All']].concat(statuses).map(function (s) {
                    return {label: s[1], onclick: function () {
                        desk('sales_part_lines', [kind, product, s[0] ?
                            [s[0]] : null]).then(function (rows) {
                            if (kind === 'quote') {
                                listDialog('Quote Lines', ['Quote ID',
                                    'Customer ID', 'Quote Date',
                                    'Quote Status', 'Line No', 'Part ID',
                                    'Description', 'Customer Part ID',
                                    'Product Code', 'Commodity Code',
                                    'Desired Ship Date'].map(function (l) {
                                        return {label: l};
                                    }), rows.map(function (r) {
                                        return {ondblclick: function () {
                                            UI.openScreen('quotes/' +
                                                r.quote.id, 'Quote ' +
                                                r.quote.number);
                                        }, cells: [r.quote.number, r.customer,
                                            UI.date(r.quote_date), label(
                                                statuses, r.status),
                                            r.line_no, name(r.product),
                                            r.description, r.customer_part,
                                            r.product_code, r.commodity_code,
                                            UI.date(r.desired_ship_date)]};
                                    }), {empty: 'No quote line.'});
                            } else {
                                listDialog('Purchase Order Lines', [
                                    {label: 'Order ID'}, {label: 'Supplier'},
                                    {label: 'Order Date'}, {label: 'Status'},
                                    {label: 'Qty', num: true}, {label: 'U/M'},
                                    {label: 'Unit Price', num: true},
                                    {label: 'Desired Recv Date'},
                                    {label: 'Description'}],
                                    rows.map(function (r) {
                                        return {cells: [r.purchase.number,
                                            r.supplier, UI.date(r.order_date),
                                            label(statuses, r.status),
                                            num(r.quantity), r.unit,
                                            UI.money(r.unit_price),
                                            UI.date(r.delivery_date),
                                            r.description]};
                                    }), {empty: 'No purchase order line.'});
                            }
                        }, failed);
                    }};
                }));
        };
    }

    /* What the user may do: {model: {read, write, create, delete}} with
     * true when unknown (the server still refuses) */
    function rights(models) {
        return UI.access(models).then(function (result) {
            var r = {};
            models.forEach(function (m) {
                var a = result[m] || {};
                r[m] = {read: a.read !== false, write: a.write !== false,
                    create: a.create !== false, delete: a.delete !== false};
            });
            return r;
        });
    }

    function openOrder(id, number) {
        UI.openScreen('orders/' + id, 'Order ' + (number || id));
    }

    /* ---- Code tables ---------------------------------------------------- */

    /* A code table window with its own tab (Tax Groups, Discount
     * Classes): the ID lookup placed where Jobshop has it (options.idAt),
     * its Inactive box beside it, the Description; options.place: the
     * boxes of active / description */
    function codeTable(main, params, options) {
        injectCss();
        var place = options.place || {};
        var fields = [
            /* Jobshop's Inactive: the model's Inactive (Tryton's Active
             * reversed), written back as Active (beforeSave) */
            Object.assign({name: 'inactive', label: 'Inactive',
                type: 'boolean', default: false}, place.active ?
                {at: place.active} : {}),
            Object.assign({name: 'description', label:
                options.descriptionLabel || 'Description', type: 'char',
                span: 2}, place.description ? {at: place.description,
                    split: options.idSplit} : {})
        ].concat(options.fields || []);
        var master = {
            title: options.title,
            model: options.model,
            label: options.label,
            order: [['code', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            tabs: [{title: options.tab || options.title, fields: fields,
                frames: options.frames}].concat(options.tabs || []),
            browse: [{name: 'code', label: options.label},
                {name: 'description', label: options.descriptionLabel ||
                    'Description'}].concat(options.browse || []),
            beforeSave: function (values) {
                if ('inactive' in values) {
                    values.active = !values.inactive;
                    delete values.inactive;
                }
                ['create_uid', 'write_uid'].forEach(function (n) {
                    delete values[n];
                });
                return values;
            },
            onload: function (record) {
                fillWho(main, options.model, record.id);
            }
        };
        if (options.idAt) {
            master.idAt = options.idAt;
            master.idSplit = options.idSplit;
            master.idField = 'code';
        } else {
            fields.unshift({name: 'code', label: options.label || 'ID',
                type: 'char'});
        }
        UI.master(main, master);
        main.classList.add('js-sales');
    }

    /* Jobshop's one-grid code table windows (Service Charges, Sales Reps,
     * Territories, SIC Codes, Carriers): every row, active or not, edited
     * in place; add / delete rows, Save. columns [field spec] */
    function codeGrid(main, options) {
        injectCss();
        var model = options.model;
        var can = {write: false, create: false, 'delete': false};
        var rows = [], removed = [];
        var body = el('tbody');
        var form = UI.form(main, {title: options.title, onSave: function () {
            return save();
        }, onClear: function () {
            load();
        }});
        main = form.body;
        main.classList.add('js-sales');
        var add = el('button', {type: 'button', onclick: function () {
            addRow(null);
        }}, 'Add Row');
        var fields = options.columns;
        main.appendChild(el('div.panel', el('h3', {style: {marginTop: 0}},
            options.tab || options.title),
            el('div.table-wrap', el('table.data', el('thead', el('tr',
                fields.map(function (f) {
                    return el('th' + (f.type === 'money' || f.type ===
                        'decimal' ? '.num' : ''), f.label);
                }), el('th', ''))), body)), el('div.toolbar', add)));

        function addRow(record) {
            var row = {id: record ? record.id : null, controls: {}};
            var editable = record ? can.write : can.create;
            var tr = el('tr', fields.map(function (f) {
                var c = UI.fieldControl(f);
                row.controls[f.name] = c;
                if (record) {
                    /* Inactive: the reverse of the record's active */
                    var v = f.name === 'inactive' ? !record.active :
                        record[f.name];
                    if (f.type === 'many2one') {
                        v = v ? {id: v, rec_name: (record[f.name + '.'] ||
                            {}).rec_name} : null;
                    }
                    c.set(v);
                } else if (f.default !== undefined) {
                    c.set(f.default);
                }
                Array.prototype.forEach.call(c.node.querySelectorAll ?
                    c.node.querySelectorAll('input, select, textarea, ' +
                        'button') : [], function (n) {
                        n.disabled = !editable;
                    });
                if (c.node.matches && c.node.matches(
                        'input, select, textarea')) {
                    c.node.disabled = !editable;
                }
                return el('td', c.node);
            }), el('td.row-delete', can['delete'] || !record ? el('button',
                {type: 'button', title: 'Delete Row', 'aria-label':
                    'Delete Row', onclick: function () {
                        if (row.id) {
                            removed.push(row.id);
                        }
                        rows.splice(rows.indexOf(row), 1);
                        tr.remove();
                    }}, '✕') : null));
            rows.push(row);
            body.appendChild(tr);
        }

        function load() {
            var names = [];
            fields.forEach(function (f) {
                names.push(f.name === 'inactive' ? 'active' : f.name);
                if (f.type === 'many2one') {
                    names.push(f.name + '.rec_name');
                }
            });
            Rpc.searchRead(model, [['active', 'in', [true, false]]], names,
                {order: [['code', 'ASC']]}).then(function (records) {
                    UI.clear(body);
                    rows = [];
                    removed = [];
                    records.forEach(addRow);
                    add.hidden = !can.create;
                }, UI.showError);
        }

        function save() {
            var create = [], writes = [];
            rows.forEach(function (row) {
                var values = {};
                fields.forEach(function (f) {
                    var v = row.controls[f.name].get();
                    values[f.name] = f.type === 'money' || f.type ===
                        'decimal' ? (v === null || v === undefined || v ===
                            '' ? null : Rpc.decimal(typeof v === 'object' &&
                            v.decimal !== undefined ? v.decimal : v)) : v;
                });
                if ('inactive' in values) {
                    values.active = !values.inactive;
                    delete values.inactive;
                }
                if (row.id) {
                    if (can.write) {
                        writes.push([row.id], values);
                    }
                } else if (values.code) {
                    create.push(values);
                }
            });
            var calls = [];
            if (writes.length) {
                calls.push(function () {
                    return Rpc.model(model, 'write', writes);
                });
            }
            if (create.length) {
                calls.push(function () {
                    return Rpc.model(model, 'create', [create]);
                });
            }
            if (removed.length) {
                calls.push(function () {
                    return Rpc.model(model, 'delete', [removed]);
                });
            }
            return calls.reduce(function (p, call) {
                return p.then(call);
            }, Promise.resolve()).then(function () {
                UI.toast(options.title + ' saved', 'ok');
                load();
            }, UI.showError);
        }

        rights([model]).then(function (r) {
            can = r[model];
            form.allow(can.write || can.create, []);
            load();
        });
    }

    Screens.jsServiceCharges = function (main) {
        codeGrid(main, {title: 'Service Charges',
            model: 'nline.service_charge', columns: [
                {name: 'code', label: 'ID', type: 'char'},
                {name: 'description', label: 'Description', type: 'char'},
                {name: 'amount', label: 'Amount', type: 'decimal'},
                {name: 'account', label: 'Account ID', type: 'many2one',
                    model: 'account.account',
                    domain: [['type.revenue', '=', true]]},
                {name: 'inactive', label: 'Inactive', type: 'boolean'}]});
    };

    Screens.jsSalesTaxGroups = function (main, params) {
        codeTable(main, params, {title: 'Sales Tax Groups',
            model: 'nline.sales_tax_group', label: 'Tax Group ID',
            tab: 'Sales Tax Group', idAt: [14, 4, 264, 24], idSplit: 120,
            place: {active: [266, 4, 453, 24],
                description: [14, 26, 833, 46]},
            browse: [{name: 'inactive', label: 'Inactive',
                type: 'boolean'}],
            tabs: [{title: 'Taxes', lines: {name: 'lines',
                model: 'nline.sales_tax_group.line', inverse: 'group',
                order: [['tax_name', 'ASC'], ['effective_date', 'ASC']],
                fields: [
                    {name: 'tax_name', label: 'Tax Name', type: 'char'},
                    {name: 'description', label: 'Description',
                        type: 'char'},
                    {name: 'effective_date', label: 'Effective',
                        type: 'date'},
                    {name: 'account', label: 'Account ID',
                        type: 'many2one', model: 'account.account',
                        domain: [['type', '!=', null],
                            ['closed', '!=', true]]},
                    {name: 'percent', label: 'Percent',
                        type: 'decimal'},
                    /* The Tryton tax the line is (made from the line when
                     * it has an account) */
                    {name: 'tax', label: 'Tryton Tax', type: 'many2one',
                        model: 'account.tax'}]}}]});
    };

    Screens.jsSalesReps = function (main) {
        codeGrid(main, {title: 'Sales Representatives', tab: 'Sales Reps',
            model: 'nline.sales_rep', columns: [
                {name: 'code', label: 'ID', type: 'char'},
                {name: 'description', label: 'Name', type: 'char'},
                {name: 'commission', label: 'Commission Percent',
                    type: 'decimal'},
                {name: 'inactive', label: 'Inactive', type: 'boolean'}]});
    };

    Screens.jsTerritories = function (main) {
        codeGrid(main, {title: 'Sales Territories', tab: 'Territories',
            model: 'nline.territory', columns: [
                {name: 'code', label: 'ID', type: 'char'},
                {name: 'description', label: 'Description', type: 'char'},
                {name: 'inactive', label: 'Inactive', type: 'boolean'}]});
    };

    Screens.jsSicCodes = function (main) {
        codeGrid(main, {title: 'Standard Industry Codes',
            tab: 'Standard Industry Classification Codes',
            model: 'nline.sic_code', columns: [
                {name: 'code', label: 'ID', type: 'char'},
                {name: 'description', label: 'Description', type: 'char'},
                {name: 'inactive', label: 'Inactive', type: 'boolean'}]});
    };

    Screens.jsCarriers = function (main) {
        codeGrid(main, {title: 'Carriers', model: 'nline.carrier',
            columns: [
                {name: 'code', label: 'ID', type: 'char'},
                {name: 'description', label: 'Name', type: 'char'},
                {name: 'instructions', label: 'Shipper Instructions',
                    type: 'text', rows: 1},
                {name: 'carrier_code', label: 'Carrier Code', type: 'char'},
                {name: 'route', label: 'Route', type: 'char'},
                {name: 'cod_charge', label: 'COD Charge', type: 'decimal'},
                {name: 'inactive', label: 'Inactive', type: 'boolean'}]});
    };

    Screens.jsDiscountClasses = function (main, params) {
        codeTable(main, params, {title: 'Discount Classes',
            model: 'nline.discount_class', label: 'Discount Class ID',
            tab: 'Discount Class', idAt: [13, 34, 290, 54], idSplit: 144,
            place: {active: [292, 34, 364, 54],
                description: [13, 56, 833, 76]},
            fields: [
                {name: 'create_uid', label: 'Created by', type: 'char',
                    readonly: true, at: [13, 4, 417, 24], split: 144},
                {name: 'write_uid', label: 'Last Modified by',
                    type: 'char', readonly: true, at: [430, 4, 834, 24],
                    split: 126},
                {name: 'discount_percent', label: 'Discount %',
                type: 'decimal', at: [13, 78, 272, 98], split: 144}],
            tabs: [{title: 'Part Prices', render: function (pane, record) {
                pricesTab(pane, 'discount_class', record.id);
            }}],
            browse: [{name: 'discount_percent', label: 'Discount %',
                type: 'float'}, {name: 'inactive', label: 'Inactive',
                type: 'boolean'}]});
    };

    /* ---- Prices: the quantity / price break tables -------------------- */

    /* The Prices tab of a customer (owner 'party') or a discount class:
     * the table of quoted parts (upper part) and, for the selected one, its
     * Quantities (Qty Break, Unit Price), saved with "Save Prices" */
    function pricesTab(pane, owner, ownerId) {
        var listPane = el('div');
        var editPane = el('div.panel');
        pane.appendChild(el('div.js-prices', listPane, editPane));
        var writable = false;

        function load(selectId) {
            Rpc.searchRead('nline.sale_price', [[owner, '=', ownerId]],
                ['product', 'product.rec_name', 'unit', 'unit.rec_name',
                    'customer_part', 'quote_type', 'as_of', 'expires',
                    'use_part_price', 'default_unit_price', 'breaks',
                    'create_date'], {order: [['id', 'ASC']]}).then(
                function (prices) {
                    UI.clear(listPane).appendChild(table([
                        {label: 'Do Not Use Price Breaks'}, {label: 'Part ID'},
                        {label: 'Selling U/M'}, {label: 'Customer Part ID'},
                        {label: 'As Of'}, {label: 'Expires'},
                        {label: 'Part Description'}],
                        prices.map(function (p) {
                            var part = (p['product.'] || {}).rec_name || '';
                            return {cells: [p.use_part_price ? '✔' : '',
                                UI.shortName('product.product', part),
                                (p['unit.'] || {}).rec_name || '',
                                p.customer_part || '',
                                UI.date(p.as_of), UI.date(p.expires),
                                part.replace(/^\[[^\]]*\]\s*/, '')],
                                className: p.id === selectId ? 'selected' :
                                    '', onclick: function () {
                                    edit(p);
                                    load(p.id);
                                }};
                        }), 'No price break table yet.'));
                    if (writable) {
                        listPane.appendChild(el('div.toolbar', el('button', {
                            type: 'button', onclick: function () {
                                edit(null);
                            }}, 'New price break table')));
                    }
                    var selected = prices.filter(function (p) {
                        return p.id === selectId;
                    })[0];
                    if (!selectId) {
                        UI.clear(editPane).appendChild(el('p.muted',
                            'Choose a part to see its quantities.'));
                    } else if (selected) {
                        edit(selected);
                    }
                }, UI.showError);
        }

        function edit(price) {
            UI.clear(editPane);
            var head = fieldGrid([
                {name: 'product', label: 'Part ID', type: 'many2one',
                    model: 'product.product', domain: [['salable', '=',
                        true]], span: 2},
                {name: 'unit', label: 'Selling U/M', type: 'many2one',
                    model: 'product.uom'},
                {name: 'customer_part', label: 'Customer Part ID',
                    type: 'char'},
                {name: 'quote_type', label: 'Type', type: 'selection',
                    options: QUOTE_TYPES, default: 'break'},
                {name: 'as_of', label: 'As of', type: 'date'},
                {name: 'expires', label: 'Expires', type: 'date'},
                {name: 'default_unit_price', label: 'Default Unit Price',
                    type: 'decimal'},
                {name: 'use_part_price', label: 'Do Not Use Price Breaks ' +
                    'During Price Lookup', type: 'boolean'}]);
            var data = price ? Object.assign({}, price, {
                product: price.product ? {id: price.product, rec_name:
                    (price['product.'] || {}).rec_name} : null,
                unit: price.unit ? {id: price.unit, rec_name: (price[
                    'unit.'] || {}).rec_name} : null}) : null;
            head.set(data);
            head.lock(writable);
            editPane.appendChild(el('h3', {style: {marginTop: 0}},
                'Quantities'));
            editPane.appendChild(head.node);
            var body = el('tbody');
            var breaks = [];
            function addBreak(b) {
                var qty = el('input.js-qty', {type: 'text', value: b ?
                    num(b.quantity) : '', 'aria-label': 'Qty Break'});
                var unitPrice = el('input.js-qty', {type: 'text', value: b ?
                    num(b.unit_price) : '', 'aria-label': 'Unit Price'});
                qty.disabled = unitPrice.disabled = !writable;
                var row = {id: b ? b.id : null, qty: qty, price: unitPrice};
                var tr = el('tr', el('td', qty), el('td', unitPrice),
                    el('td.row-delete', writable ? el('button', {type:
                        'button', 'aria-label': 'Delete break',
                        onclick: function () {
                            breaks.splice(breaks.indexOf(row), 1);
                            tr.remove();
                        }}, '✕') : null));
                breaks.push(row);
                body.appendChild(tr);
            }
            editPane.appendChild(el('div.table-wrap', el('table.data',
                el('thead', el('tr', el('th.num', 'Quantity'),
                    el('th.num', 'Unit Price'), el('th', ''))), body)));
            var buttons = el('div.toolbar');
            editPane.appendChild(buttons);
            if (writable) {
                buttons.appendChild(el('button', {type: 'button',
                    onclick: function () {
                        addBreak(null);
                    }}, 'Add quantity'));
                buttons.appendChild(el('button.primary', {type: 'button',
                    onclick: save}, 'Save Prices'));
                if (price) {
                    buttons.appendChild(el('button', {type: 'button',
                        onclick: function () {
                            UI.confirm('Delete', 'Delete the price break ' +
                                'table of this part?').then(function (ok) {
                                if (ok) {
                                    Rpc.model('nline.sale_price', 'delete',
                                        [[price.id]]).then(function () {
                                            load(null);
                                        }, UI.showError);
                                }
                            });
                        }}, 'Delete'));
                }
            }
            if (price && price.breaks && price.breaks.length) {
                Rpc.searchRead('nline.sale_price.break', [['price', '=',
                    price.id]], ['quantity', 'unit_price'], {order:
                    [['quantity', 'ASC']]}).then(function (rows) {
                        rows.forEach(addBreak);
                    }, UI.showError);
            } else if (writable) {
                addBreak(null);
            }

            function save() {
                var values = head.get();
                if (!values.product) {
                    UI.showError('Choose the part.');
                    return;
                }
                values[owner] = ownerId;
                values.default_unit_price = values.default_unit_price ?
                    Rpc.decimal(values.default_unit_price) : null;
                values.as_of = values.as_of ? Rpc.date(values.as_of) : null;
                values.expires = values.expires ? Rpc.date(values.expires) :
                    null;
                var create = [], actions = [];
                breaks.forEach(function (b) {
                    if (b.qty.value === '' || b.price.value === '') {
                        return;
                    }
                    var v = {quantity: parseFloat(b.qty.value), unit_price:
                        Rpc.decimal(UI.parseMoney(b.price.value))};
                    if (b.id) {
                        actions.push(['write', [b.id], v]);
                    } else {
                        create.push(v);
                    }
                });
                if (create.length) {
                    actions.push(['create', create]);
                }
                var kept = breaks.map(function (b) {
                    return b.id;
                });
                var removed = (price && price.breaks || []).filter(
                    function (i) {
                        return kept.indexOf(i) < 0;
                    });
                if (removed.length) {
                    actions.push(['delete', removed]);
                }
                values.breaks = actions;
                var call = price ? Rpc.model('nline.sale_price', 'write',
                    [[price.id], values]).then(function () {
                        return price.id;
                    }) : Rpc.model('nline.sale_price', 'create', [[values]])
                    .then(function (ids) {
                        return ids[0];
                    });
                call.then(function (id) {
                    UI.toast('Prices saved', 'ok');
                    load(id);
                }, UI.showError);
            }
        }

        rights(['nline.sale_price']).then(function (r) {
            writable = r['nline.sale_price'].write &&
                r['nline.sale_price'].create;
            load(null);
        });
    }

    /* ---- Customers ------------------------------------------------------- */

    var CONTACT_TYPES = [['phone', 'Phone'], ['mobile', 'Mobile'],
        ['email', 'E-Mail'], ['fax', 'Fax'], ['website', 'Website'],
        ['other', 'Other']];

    function documentsTab(model, domain, columns, open) {
        return function (pane, record) {
            Rpc.searchRead(model, domain(record), columns.map(function (c) {
                return c[0];
            }), {limit: 300, order: [['id', 'DESC']]}).then(function (rows) {
                pane.appendChild(table(columns.map(function (c) {
                    return {label: c[1], num: c[2]};
                }), rows.map(function (row) {
                    return {ondblclick: open ? function () {
                        open(row);
                    } : null, cells: columns.map(function (c) {
                        var v = row[c[0]];
                        return c[2] ? UI.money(v) : c[3] ? label(c[3], v) :
                            /date/.test(c[0]) ? UI.date(v) : v === null ||
                            v === undefined ? '' : String(v);
                    })};
                })));
            }, UI.showError);
        };
    }

    /* The Sales Orders tab: Released orders first, "View Sales Orders by
     * Status of" and the other commands of Jobshop's right-click menu
     * (PopupCustSalesOrders) */
    function customerOrdersTab(pane, record) {
        var status = ['released'];
        var holder = el('div');
        pane.appendChild(el('p.muted', 'Right-click the list: View Sales ' +
            'Orders by Status of, Sales Order Lines, Open Sales Order.'));
        pane.appendChild(holder);
        var allowed = false;
        UI.screenAllowed('orders').then(function (ok) {
            allowed = ok;
        });

        function menu(event, row) {
            UI.contextMenu(event, [
                submenu(event, 'View Sales Orders by Status of',
                    statusItems(function (s) {
                        status = s;
                        load();
                    })),
                {label: 'Sales Order Lines...', onclick: function () {
                    orderLinesDialog('Sales Order Lines - ' +
                        record.rec_name, {party: record.id}, status);
                }},
                allowed && row ? {label: 'Open Sales Order...', onclick:
                    function () {
                        openOrder(row.id, row.number);
                    }} : '-',
                row && row.js_quote ? {label: 'Open Quote...', onclick:
                    function () {
                        Rpc.searchRead('nline.quote', [['number', '=',
                            row.js_quote]], ['number'], {limit: 1}).then(
                            function (q) {
                                if (q.length) {
                                    UI.openScreen('quotes/' + q[0].id,
                                        'Quote ' + q[0].number);
                                } else {
                                    UI.toast('Quote ' + row.js_quote +
                                        ' is not in the ERP', 'error');
                                }
                            }, UI.showError);
                    }} : '-']);
        }

        function load() {
            var domain = [['party', '=', record.id]];
            if (status) {
                domain.push(['js_status', 'in', status]);
            }
            Rpc.searchRead('sale.sale', domain, ['number', 'js_status',
                'reference', 'sale_date', 'shipping_date', 'promise_date',
                'js_last_shipped_date', 'total_amount', 'js_shipped_amount',
                'js_quote', 'sales_rep.code',
                'shipment_address.party_name'], {limit: 300, order:
                    [['sale_date', 'DESC'], ['id', 'DESC']]}).then(
                function (rows) {
                    var node = table([{label: 'Order ID'}, {label: 'Status'},
                        {label: 'Contact Name'}, {label: 'ShipTo Name'},
                        {label: 'Sales Rep'}, {label: 'Purchase Order No'},
                        {label: 'Order Date'}, {label: 'Desired Ship Date'},
                        {label: 'Promise Date'}, {label: 'Last Shipped Date'},
                        {label: 'Order Amount', num: true},
                        {label: 'Shipped Amount', num: true},
                        {label: 'Quote ID'}], rows.map(function (row) {
                        return {ondblclick: function () {
                            if (allowed) {
                                openOrder(row.id, row.number);
                            }
                        }, oncontextmenu: function (event) {
                            event.stopPropagation();
                            menu(event, row);
                        }, cells: [row.number || String(row.id),
                            label(JS_STATUS, row.js_status),
                            record.customer_contact || '',
                            (row['shipment_address.'] || {}).party_name || '',
                            (row['sales_rep.'] || {}).code || '',
                            row.reference || '', UI.date(row.sale_date),
                            UI.date(row.shipping_date),
                            UI.date(row.promise_date),
                            UI.date(row.js_last_shipped_date),
                            UI.money(row.total_amount),
                            UI.money(row.js_shipped_amount),
                            row.js_quote || '']};
                    }), 'No ' + (status ? status.map(function (s) {
                        return label(JS_STATUS, s);
                    }).join(', ') : '') + ' order.');
                    UI.clear(holder).appendChild(node);
                }, UI.showError);
        }
        holder.addEventListener('contextmenu', function (event) {
            menu(event, null);
        });
        load();
    }

    /* The Quotes tab: the customer's Estimating quotes (PopupCustQuotes:
     * View Quotes by Status of, View Quote Lines..., Open Quote...) */
    var QUOTE_STATUS = [['active', 'Active'], ['cancelled', 'Cancelled'],
        ['lost', 'Lost'], ['ready', 'Ready'], ['won', 'Won']];

    function customerQuotesTab(pane, record) {
        var status = null;
        var holder = el('div');
        pane.appendChild(holder);
        var allowed = false;
        UI.screenAllowed('quotes').then(function (ok) {
            allowed = ok;
        });

        function menu(event, row) {
            UI.contextMenu(event, [
                submenu(event, 'View Quotes by Status of', [{label: 'All',
                    onclick: function () {
                        status = null;
                        load();
                    }}].concat(QUOTE_STATUS.map(function (s) {
                        return {label: s[1], onclick: function () {
                            status = [s[0]];
                            load();
                        }};
                    }))),
                {label: 'View Quote Lines...', onclick: function () {
                    var domain = [['quote.party', '=', record.id]];
                    if (status) {
                        domain.push(['quote.status', 'in', status]);
                    }
                    Rpc.searchRead('nline.quote.line', domain,
                        ['quote.number', 'quote.quote_date',
                            'quote.status', 'line_no', 'product.rec_name',
                            'description', 'customer_part',
                            'product_code.code', 'commodity_code.code',
                            'desired_ship_date'], {limit: 500, order:
                            [['quote', 'DESC'], ['line_no', 'ASC']]}).then(
                        function (rows) {
                            listDialog('Quote Lines', ['Quote ID',
                                'Customer ID', 'Quote Date', 'Quote Status',
                                'Line No', 'Part ID', 'Description',
                                'Customer Part ID', 'Product Code',
                                'Commodity Code', 'Desired Ship Date'].map(
                                function (l) {
                                    return {label: l};
                                }), rows.map(function (r) {
                                    var q = r['quote.'] || {};
                                    return {cells: [q.number, record.code,
                                        UI.date(q.quote_date), label(
                                            QUOTE_STATUS, q.status),
                                        r.line_no, UI.shortName(
                                            'product.product', (r[
                                                'product.'] || {}).rec_name),
                                        r.description, r.customer_part,
                                        (r['product_code.'] || {}).code,
                                        (r['commodity_code.'] || {}).code,
                                        UI.date(r.desired_ship_date)]};
                                }), {empty: 'No quote line.'});
                        }, UI.showError);
                }},
                allowed && row ? {label: 'Open Quote...', onclick:
                    function () {
                        UI.openScreen('quotes/' + row.id, 'Quote ' +
                            row.number);
                    }} : '-']);
        }

        function load() {
            var domain = [['party', '=', record.id]];
            if (status) {
                domain.push(['status', 'in', status]);
            }
            Rpc.searchRead('nline.quote', domain, ['number',
                'customer_reference', 'ship_name', 'status', 'quote_date',
                'expiration_date', 'quoted_leadtime', 'won_loss_date',
                'won_loss_reason'], {limit: 300, order: [['quote_date',
                    'DESC'], ['id', 'DESC']]}).then(function (rows) {
                    UI.clear(holder).appendChild(table([{label: 'ID'},
                        {label: 'Customer Reference'},
                        {label: 'Shipto Name'}, {label: 'Status'},
                        {label: 'Quote Date'}, {label: 'Expiration Date'},
                        {label: 'Quoted Lead Time', num: true},
                        {label: 'Won/Loss Date'}, {label: 'Won/Loss Reason'}],
                        rows.map(function (row) {
                            return {ondblclick: function () {
                                if (allowed) {
                                    UI.openScreen('quotes/' + row.id,
                                        'Quote ' + row.number);
                                }
                            }, oncontextmenu: function (event) {
                                event.stopPropagation();
                                menu(event, row);
                            }, cells: [row.number, row.customer_reference,
                                row.ship_name, label(QUOTE_STATUS,
                                    row.status), UI.date(row.quote_date),
                                UI.date(row.expiration_date),
                                row.quoted_leadtime, UI.date(
                                    row.won_loss_date), row.won_loss_reason]};
                        }), 'No quote.'));
                }, function () {
                    UI.clear(holder).appendChild(el('p.muted',
                        'The Estimating quotes are not available.'));
                });
        }
        holder.addEventListener('contextmenu', function (event) {
            menu(event, null);
        });
        load();
    }

    /* The Customers window: the Customers tab (Jobshop's header), then
     * General, Addresses, Prices, Specs, Special Instructions, Notes,
     * Quotes, Sales Orders (and the desk's Contacts and Invoices) */
    /* Jobshop's "user mm/dd/yyyy hh:mm" (Created by / Last Modified by) */
    function whoText(user, when) {
        if (!when) {
            return name(user);
        }
        var pad = function (n) {
            return (n < 10 ? '0' : '') + n;
        };
        var d = typeof when === 'string' ? new Date(when.replace(' ', 'T')) :
            when.__class__ ? new Date(when.year, when.month - 1, when.day,
                when.hour || 0, when.minute || 0) : new Date(when);
        if (isNaN(d.getTime())) {
            return name(user);
        }
        return (name(user) + ' ' + pad(d.getMonth() + 1) + '/' +
            pad(d.getDate()) + '/' + d.getFullYear() + ' ' +
            pad(d.getHours()) + ':' + pad(d.getMinutes())).trim();
    }

    /* Created by / Last Modified by of a placed window: the user and
     * when (the fields create_uid / write_uid placed as read-only text) */
    function fillWho(main, model, id) {
        Rpc.model(model, 'read', [[id], ['create_uid.rec_name',
            'create_date', 'write_uid.rec_name', 'write_date']]).then(
            function (rows) {
                var r = rows[0] || {};
                var set = function (lab, text) {
                    var input = main.querySelector('input[aria-label="' +
                        lab + '"]');
                    if (input) {
                        input.value = text;
                    }
                };
                set('Created by', whoText(r['create_uid.'], r.create_date));
                set('Last Modified by', r.write_date ? whoText(
                    r['write_uid.'], r.write_date) : '');
            }, function () {});
    }

    /* The Customers window after a record loads: who / when, the Terms
     * ID's and the Receivables Acct ID's description boxes */
    function customerLoaded(main, record) {
        var input = function (lab) {
            return main.querySelector('input[aria-label="' + lab + '"]');
        };
        Rpc.model('party.party', 'read', [[record.id], ['create_uid.rec_name',
            'create_date', 'write_uid.rec_name', 'write_date',
            'customer_payment_term.rec_name',
            'customer_payment_term.description',
            'account_receivable.rec_name']]).then(function (rows) {
                var r = rows[0] || {};
                var created = input('Created by');
                var modified = input('Last Modified by');
                if (created) {
                    created.value = whoText(r['create_uid.'], r.create_date);
                }
                if (modified) {
                    modified.value = r.write_date ? whoText(r['write_uid.'],
                        r.write_date) : '';
                }
                var term = r['customer_payment_term.'];
                var termDesc = input('Terms ID description');
                if (termDesc) {
                    termDesc.value = term ? term.description ||
                        term.rec_name || '' : '';
                }
                var account = input('Receivables Acct ID');
                var full = name(r['account_receivable.']);
                if (account && full) {
                    account.value = codeOf(full);
                    account.title = full;
                }
            }, function () {});
    }

    function classicCustomerWindow(main, params) {
        injectCss();
        var openInvoices = false;
        UI.screenAllowed('invoicing').then(function (ok) {
            openInvoices = ok;
        });
        var ref = function (field, label, model, extra) {
            return Object.assign({name: field, label: label,
                type: 'many2one', model: model}, extra || {});
        };
        UI.master(main, {
            title: 'Customers',
            model: 'party.party',
            label: 'Customer ID',
            idAt: [7, 4, 439, 24],
            idSplit: 105,
            idField: 'code',
            order: [['name', 'ASC']],
            open: params && params[0] ? parseInt(params[0], 10) : null,
            tabs: [
                {title: 'Customers', frames: [
                    {label: '', at: [7, 25, 448, 186]},
                    {label: '', at: [461, 25, 831, 165]}], fields: [
                    {name: 'customer_inactive', label: 'Inactive',
                        type: 'boolean', at: [441, 4, 517, 24]},
                    {name: 'customer_exported', label: 'Exported',
                        type: 'boolean', at: [564, 4, 646, 24]},
                    {name: 'customer_exported_date', label: 'Date',
                        type: 'date', readonly: true, at: [666, 4, 825, 24],
                        split: 56},
                    {name: 'name', label: 'Name', type: 'char',
                        at: [19, 32, 439, 52], split: 93},
                    {name: 'sold_to_address_1', label: 'Address',
                        type: 'char', at: [19, 54, 439, 74], split: 93},
                    {name: 'sold_to_address_2', label: 'Address 2',
                        type: 'char', at: [112, 76, 439, 96], split: 0},
                    {name: 'sold_to_city', label: 'City', type: 'char',
                        at: [19, 98, 439, 118], split: 93},
                    ref('sold_to_subdivision', 'State/Postal',
                        'country.subdivision', {at: [19, 120, 225, 140],
                            split: 93}),
                    {name: 'sold_to_postal_code', label: '/',
                        type: 'char', at: [227, 120, 356, 140], split: 10},
                    ref('sold_to_country', 'Country', 'country.country',
                        {at: [19, 142, 439, 162], split: 93}),
                    {name: 'sold_to_name', label: 'Etc.', type: 'char',
                        at: [19, 164, 439, 184], split: 93},
                    {name: 'customer_contact', label: 'Contact',
                        type: 'char', at: [473, 32, 824, 52], split: 93},
                    {name: 'contact_title', label: 'Title', type: 'char',
                        at: [473, 54, 824, 74], split: 93},
                    {name: 'customer_phone', label: 'Phone', type: 'char',
                        at: [473, 76, 824, 96], split: 93},
                    {name: 'customer_fax', label: 'Fax', type: 'char',
                        at: [473, 98, 824, 118], split: 93},
                    {name: 'customer_email', label: 'E-mail', type: 'char',
                        at: [473, 120, 824, 140], split: 93},
                    {name: 'customer_mobile', label: 'Mobile', type: 'char',
                        at: [473, 142, 824, 162], split: 93},
                    {name: 'customer_open_date', label: 'Acct Opened',
                        type: 'date', at: [473, 164, 676, 184], split: 93},
                    {name: 'credit_status', label: 'Credit Status',
                        type: 'selection', options: CREDIT_STATUS,
                        default: 'approved', at: [19, 191, 228, 211],
                        split: 93},
                    {name: 'customer_last_order_date',
                        label: 'Last Order Date', type: 'date',
                        readonly: true, at: [235, 191, 431, 211], split: 90},
                    {name: 'credit_limit', label: 'Credit Limit',
                        type: 'money', at: [436, 191, 601, 211], split: 64},
                    {name: 'customer_open_orders',
                        label: 'Total Released Orders', type: 'money',
                        readonly: true, at: [605, 191, 824, 211],
                        split: 120}]},
                {title: 'General', fields: [
                    /* Jobshop's "user date" texts (filled in onload) */
                    {name: 'create_uid', label: 'Created by', type: 'char',
                        readonly: true, at: [17, 4, 396, 24], split: 140},
                    {name: 'write_uid', label: 'Last Modified by',
                        type: 'char', readonly: true, at: [463, 4, 813, 24],
                        split: 93},
                    {name: 'our_supplier_id', label: 'Supplier ID (ours)',
                        type: 'char', at: [17, 26, 337, 46], split: 140},
                    ref('customer_payment_term', 'Terms ID',
                        'account.invoice.payment_term',
                        {at: [17, 48, 337, 68], split: 140}),
                    ref('customer_tax_group', 'Default Tax Group',
                        'nline.sales_tax_group',
                        {at: [17, 70, 337, 90], split: 140}),
                    {name: 'customer_tax_id_number', label: 'Tax ID Number',
                        type: 'char', at: [17, 92, 337, 112], split: 140},
                    {name: 'customer_tax_exempt', label: 'Tax Exempt',
                        type: 'boolean', at: [342, 92, 461, 112]},
                    {name: 'customer_freight_terms', label: 'Freight Terms',
                        type: 'selection', options: FREIGHT_TERMS,
                        at: [17, 114, 337, 134], split: 140},
                    ref('customer_fob_point', 'FOB Point ID',
                        'nline.fob_point', {at: [17, 136, 337, 156],
                            split: 140}),
                    ref('customer_ship_via', 'Ship Via ID', 'nline.ship_via',
                        {at: [17, 158, 337, 178], split: 140}),
                    ref('carrier', 'Carrier ID', 'nline.carrier',
                        {at: [17, 180, 337, 200], split: 140}),
                    ref('sales_rep', 'Sales Rep ID', 'nline.sales_rep',
                        {at: [17, 202, 337, 222], split: 140}),
                    ref('territory', 'Sales Territory ID', 'nline.territory',
                        {at: [17, 224, 337, 244], split: 140}),
                    ref('discount_class', 'Discount Class ID',
                        'nline.discount_class', {at: [17, 246, 337, 266],
                            split: 140}),
                    ref('customer_sic_code', 'SIC Code ID',
                        'nline.sic_code', {at: [17, 268, 337, 288],
                            split: 140}),
                    ref('account_receivable', 'Receivables Acct ID',
                        'account.account',
                        {domain: [['type.receivable', '=', true]],
                            at: [17, 290, 337, 310], split: 140})]},
                {title: 'Addresses', lines: {name: 'addresses',
                    model: 'party.address', inverse: 'party',
                    order: [['sequence', 'ASC'], ['id', 'ASC']],
                    fields: [
                        /* (the address's ID: N-Line's addresses have no
                         * sequence; the Sales Order's Address No) */
                        {name: 'id', label: 'Addr No',
                            type: 'integer', readonly: true},
                        {name: 'ship_to_default', label: 'Default Ship To',
                            type: 'boolean'},
                        {name: 'party_name', label: 'Name', type: 'char'},
                        {name: 'ship_to_contact', label: 'Contact Name',
                            type: 'char'},
                        {name: 'ship_to_title', label: 'Contact Title',
                            type: 'char'},
                        {name: 'street', label: 'Address', type: 'char'},
                        {name: 'city', label: 'City', type: 'char'},
                        ref('subdivision', 'State', 'country.subdivision'),
                        {name: 'postal_code', label: 'Postal Code',
                            type: 'char'},
                        ref('country', 'Country', 'country.country'),
                        {name: 'ship_to_phone', label: 'Contact Phone',
                            type: 'char'},
                        {name: 'ship_to_fax', label: 'Contact Fax',
                            type: 'char'},
                        {name: 'ship_to_email', label: 'Contact E-mail',
                            type: 'char'},
                        {name: 'ship_to_tax_exempt', label: 'Tax Exempt',
                            type: 'boolean'},
                        ref('ship_to_tax_group', 'Tax Group ID',
                            'nline.sales_tax_group'),
                        {name: 'ship_to_tax_id_number',
                            label: 'Tax ID Number', type: 'char'},
                        ref('ship_to_sales_rep', 'Sales Rep ID',
                            'nline.sales_rep'),
                        ref('ship_to_territory', 'Territory ID',
                            'nline.territory'),
                        ref('ship_to_fob_point', 'FOB Point ID',
                            'nline.fob_point'),
                        ref('ship_to_ship_via', 'Ship Via ID',
                            'nline.ship_via'),
                        ref('ship_to_carrier', 'Carrier ID',
                            'nline.carrier'),
                        ref('ship_to_discount_class', 'Discount Class ID',
                            'nline.discount_class'),
                        /* Tryton's: which addresses bill / ship */
                        {name: 'invoice', label: 'Bill To',
                            type: 'boolean'},
                        {name: 'delivery', label: 'Ship To',
                            type: 'boolean'}]}},
                {title: 'Prices', render: function (pane, record) {
                    pricesTab(pane, 'party', record.id);
                }},
                {title: 'Specs', fields: [
                    {name: 'customer_specs', label: 'Specifications',
                        type: 'text', at: [4, 4, 754, 456], split: 0}]},
                {title: 'Special Instructions', frames: [
                    {label: 'Estimating Quotes', at: [3, 4, 407, 163]},
                    {label: 'Sales Orders', at: [416, 4, 820, 163]}],
                    fields: [
                    {name: 'quote_instructions', label: 'Estimating Quotes',
                        type: 'text', at: [18, 24, 396, 156], split: 0},
                    {name: 'sales_instructions', label: 'Sales Orders',
                        type: 'text', at: [428, 24, 806, 156], split: 0},
                    /* The footers printed on the documents */
                    {name: 'quote_footer', label: 'Quote Footer',
                        type: 'text', rows: 2, span: 2},
                    {name: 'sales_order_footer', label: 'Sales Order Footer',
                        type: 'text', rows: 2, span: 2},
                    {name: 'shipper_footer', label: 'Shipper Footer',
                        type: 'text', rows: 2, span: 2},
                    {name: 'invoice_footer', label: 'Invoice Footer',
                        type: 'text', rows: 2, span: 2}]},
                {notes: true},
                {title: 'Quotes', render: customerQuotesTab},
                {title: 'Sales Orders', render: customerOrdersTab},
                /* Kept from the desk's window: the contacts (Phone, Fax,
                 * E-mail, Mobile above are the first of each type) */
                {title: 'Contacts', lines: {name: 'contact_mechanisms',
                    model: 'party.contact_mechanism', inverse: 'party',
                    fields: [
                        {name: 'type', label: 'Type', type: 'selection',
                            options: CONTACT_TYPES},
                        {name: 'value', label: 'Value', type: 'char'},
                        {name: 'name', label: 'Contact', type: 'char'}]}},
                {title: 'Invoices', render: documentsTab('account.invoice',
                    function (record) {
                        return [['party', '=', record.id],
                            ['type', '=', 'out']];
                    }, [['number', 'Number'], ['invoice_date', 'Date'],
                        ['reference', 'Reference'], ['state', 'Status'],
                        ['total_amount', 'Total', true],
                        ['amount_to_pay', 'Open', true]], function (row) {
                        if (openInvoices) {
                            UI.openScreen('invoicing/' + row.id, 'Invoice ' +
                                (row.number || row.id));
                        } else {
                            UI.openRecord('account.invoice', row.id,
                                row.number);
                        }
                    })}
            ],
            extra: [{label: 'New View', onclick: function (record) {
                UI.setDocView('customer', 'modern');
                Screens.customerWindow(main, record ? [record.id] : []);
            }}],
            browse: [
                {name: 'code', label: 'Customer ID'},
                {name: 'name', label: 'Name'},
                {name: 'sold_to_address_1', label: 'Address 1'},
                {name: 'sold_to_address_2', label: 'Address 2'},
                {name: 'sold_to_city', label: 'City'},
                {name: 'sold_to_subdivision', label: 'State',
                    type: 'many2one'},
                {name: 'sold_to_postal_code', label: 'Postal Code'}],
            beforeSave: function (values) {
                ['receivable', 'customer_open_orders',
                    'customer_open_order_count', 'customer_last_order_date',
                    'customer_exported_date', 'create_uid', 'write_uid']
                    .forEach(function (n) {
                        delete values[n];
                    });
                return values;
            },
            onload: function (record) {
                customerLoaded(main, record);
            }
        });
        main.classList.add('js-sales');
        describe(main, [['Terms ID', [339, 48, 802, 68]],
            ['Default Tax Group', [339, 70, 802, 90]],
            ['FOB Point ID', [339, 136, 802, 156]],
            ['Ship Via ID', [339, 158, 802, 178]],
            ['Carrier ID', [339, 180, 802, 200]],
            ['Sales Rep ID', [339, 202, 802, 222]],
            ['Sales Territory ID', [339, 224, 802, 244]],
            ['Discount Class ID', [339, 246, 802, 266]],
            ['SIC Code ID', [339, 268, 802, 288]],
            ['Receivables Acct ID', [339, 290, 802, 310]]]);
    }

    /* ---- Sales Orders ----------------------------------------------------- */

    /* The Sales Order tab below its sub-tabs (Jobshop's layout, moved up
     * by 372 units: the sub-tabs are not drawn in the layout) */
    var DETAIL_FIELDS = [
        {name: 'sales_rep', label: 'Sales Rep ID', type: 'many2one',
            model: 'nline.sales_rep', at: [11, 8, 240, 28], split: 120},
        {name: 'territory', label: 'Sales Territory ID', type: 'many2one',
            model: 'nline.territory', at: [11, 30, 240, 50], split: 120},
        {name: 'fob_point', label: 'FOB Point ID', type: 'many2one',
            model: 'nline.fob_point', at: [11, 52, 240, 72], split: 120},
        {name: 'ship_via', label: 'Ship Via ID', type: 'many2one',
            model: 'nline.ship_via', at: [11, 74, 240, 94], split: 120},
        {name: 'js_carrier', label: 'Carrier ID', type: 'many2one',
            model: 'nline.carrier', at: [11, 96, 240, 116], split: 120},
        {name: 'payment_term', label: 'Terms ID', type: 'many2one',
            custom: true, at: [438, 8, 668, 28], split: 130},
        {name: 'payment_term_descr', label: 'Terms description',
            type: 'char', readonly: true, at: [670, 8, 838, 28], split: 0},
        {name: 'freight_terms', label: 'Freight Terms', type: 'selection',
            options: FREIGHT_TERMS, at: [438, 30, 668, 50], split: 130},
        {name: 'discount_class', label: 'Discount Class ID',
            type: 'many2one', model: 'nline.discount_class',
            at: [438, 52, 668, 72], split: 130},
        {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
            model: 'nline.sales_tax_group', at: [438, 74, 668, 94],
            split: 130},
        {name: 'receivable', label: 'Receivables Acct ID', type: 'char',
            readonly: true, at: [438, 96, 668, 116], split: 130},
        {name: 'receivable_descr', label: 'Receivables description',
            type: 'char', readonly: true, at: [670, 96, 838, 116], split: 0},
        {name: 'lines_total', label: 'Lines', type: 'char', readonly: true,
            at: [635, 121, 838, 141], split: 80},
        {name: 'charges_total', label: 'Charges', type: 'char',
            readonly: true, at: [635, 143, 838, 163], split: 80},
        {name: 'tax_total', label: 'Tax', type: 'char', readonly: true,
            at: [635, 165, 838, 185], split: 80},
        {name: 'order_total', label: 'Total', type: 'char', readonly: true,
            at: [635, 187, 838, 207], split: 80}];
    var DETAIL_DESCRIPTIONS = [['Sales Rep ID', [242, 8, 417, 28]],
        ['Sales Territory ID', [242, 30, 417, 50]],
        ['FOB Point ID', [242, 52, 417, 72]],
        ['Ship Via ID', [242, 74, 417, 94]],
        ['Carrier ID', [242, 96, 417, 116]],
        ['Discount Class ID', [670, 52, 838, 72]],
        ['Tax Group ID', [670, 74, 838, 94]]];

    /* The Order Line window (VSales SalesLine): General, Other, Specs,
     * Links; the fields a line keeps beside the grid's */
    var LINE_DETAIL_FIELDS = [
        {name: 'customer_po_line', label: 'PO Line No', type: 'char',
            at: [212, 34, 339, 54], split: 70},
        {name: 'customer_part', label: 'Customer Part ID', type: 'char',
            at: [17, 100, 424, 120], split: 120},
        {name: 'drawing_id', label: 'Drawing ID/Rev', type: 'char',
            at: [433, 100, 770, 120], split: 120},
        {name: 'drawing_rev', label: '/', type: 'char',
            at: [772, 100, 852, 120], split: 10},
        {name: 'product_code', label: 'Product Code ID', type: 'many2one',
            model: 'nline.product_code', at: [17, 123, 240, 143],
            split: 120},
        {name: 'commodity_code', label: 'Commodity Code ID',
            type: 'many2one', model: 'nline.commodity_code',
            at: [433, 123, 656, 143], split: 120},
        {name: 'commissionable', label: 'Commissionable', type: 'boolean',
            at: [16, 213, 130, 233]},
        {name: 'line_tax_group', label: 'Tax Group ID', type: 'many2one',
            model: 'nline.sales_tax_group', at: [433, 213, 656, 233],
            split: 120},
        {name: 'js_desired_date', label: 'Desired Ship Date', type: 'date',
            at: [18, 328, 263, 348], split: 120},
        {name: 'promise_date', label: 'Promised Date', type: 'date',
            at: [18, 350, 263, 370], split: 120}];
    var LINE_OTHER_FIELDS = [
        {name: 'user_0', label: 'User 0', type: 'char',
            at: [23, 24, 393, 44], split: 60},
        {name: 'user_1', label: 'User 1', type: 'char',
            at: [23, 45, 393, 65], split: 60},
        {name: 'user_2', label: 'User 2', type: 'char',
            at: [23, 66, 393, 86], split: 60}];
    var LINE_SPEC_FIELDS = [{name: 'js_line_specs', label: 'Specifications',
        type: 'text', at: [4, 4, 902, 400], split: 0}];
    var LINE_ALL_FIELDS = LINE_DETAIL_FIELDS.concat(LINE_OTHER_FIELDS,
        LINE_SPEC_FIELDS);

    /* A read-only placed text of the Order Line window */
    function infoField(name, label, at, split) {
        return {name: name, label: label, type: 'char', readonly: true,
            at: at, split: split === undefined ? 120 : split};
    }

    function classicSalesOrder(main, params) {
        injectCss();
        var root = main;
        var order = null;
        var copied = null;
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        var can = {save: true, create: true, delete: true, workOrder: true,
            charges: true};
        var screens = {shipping: false, invoicing: false, workorders: false,
            parts: false};
        var form = UI.form(main, {title: 'Sales Orders',
            kind: 'customer',
            find: {model: 'sale.sale', title: 'Find orders',
                order: [['sale_date', 'DESC'], ['id', 'DESC']],
                columns: [{field: 'number', label: 'Order ID'},
                    {field: 'sale_date', label: 'Order Date'},
                    {field: 'rec_name', label: 'Customer'},
                    {field: 'reference', label: 'PO Ref #'},
                    {field: 'total_amount', label: 'Total', money: true},
                    {field: 'js_status', label: 'Status'}]},
            extra: [
                {label: 'New View', title: 'The modern sales order page',
                    onclick: function () {
                        UI.setDocView('so', 'modern');
                        Screens.salesOrder(root, order ? [order.id] : []);
                    }},
                {label: 'New From Quote', title: 'File > New Document ' +
                    'From > Quote...', onclick: fromQuote},
                {label: 'Copy Document', title: 'Edit > Copy Document: a ' +
                    'new order with the lines of this one',
                    onclick: copyOrder},
                {label: 'Delete Document', title: 'Edit > Delete Document',
                    onclick: deleteOrder},
                {label: 'Add Details', title: 'Tools > Add Details: a new ' +
                    'line in the Order Line window', onclick: function () {
                        addDetails();
                    }},
                {label: 'Change Status', title: 'Tools > Change Status',
                    onclick: function (event) {
                        statusMenu(event.currentTarget);
                    }},
                {label: 'Re-price Lines', title: 'Tools > Re-price Lines',
                    onclick: function (event) {
                        menuAt(event.currentTarget, [
                            {label: 'All Lines', onclick: resetPrices},
                            {label: 'Selected Lines', onclick: function () {
                                UI.toast('Right-click a line: Calculate ' +
                                    'Sales Order Line Price', 'ok');
                            }}]);
                    }},
                {label: 'Print', title: 'Print the acknowledgement',
                    onclick: printOrder}],
            onSave: function () {
                return save();
            },
            onClear: function () {
                global.location.hash = '#/orders/new?' + Date.now();
            }});
        main = form.body;
        main.classList.add('js-sales');

        /* The header (Jobshop's fraOrderHeader) */
        var number = el('input', {type: 'text', 'aria-label': 'Order ID',
            placeholder: '(automatic)'});
        var customer = UI.picker('party.party', {placeholder: 'Customer ID',
            label: 'Customer ID', fields: ['customer_payment_term', 'code',
                'name'], onselect: function (record) {
                customerName.value = record.name || record.rec_name || '';
                form.showParty(record.id);
                customerDefaults(record.id);
            }});
        var customerName = el('input', {type: 'text', readonly: true,
            tabindex: -1, 'aria-label': 'Customer name'});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Order Date'});
        var desired = el('input', {type: 'date', 'aria-label':
            'Desired Ship Date'});
        var po = el('input', {type: 'text', 'aria-label':
            'Purchase Order No'});
        var statusSel = el('select', {'aria-label': 'Status'},
            JS_STATUS.map(function (s) {
                return el('option', {value: s[0]}, s[1]);
            }));
        var promise = el('input', {type: 'date', 'aria-label':
            'Promised Date'});
        var soldToText = el('textarea', {readonly: true, tabindex: -1,
            'aria-label': 'Sold to'});
        var shipToText = el('textarea', {readonly: true, tabindex: -1,
            'aria-label': 'Ship to'});
        var info = {};
        ['created_by', 'modified_by', 'last_shipped', 'printed', 'quote',
            'shipped_amount'].forEach(function (n) {
                info[n] = el('input', {type: 'text', readonly: true,
                    tabindex: -1, 'aria-label': n});
            });
        /* Tryton's description (the desk's Memo): not in Jobshop's window,
         * kept as it is on save */
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        /* Terms ID: a lookup with its description beside it */
        var term = UI.picker('account.invoice.payment_term', {label:
            'Terms ID', placeholder: 'Terms ID', fields: ['description'],
            onselect: function (record) {
                termDescription(record);
            }});
        var copyNotes = el('input', {type: 'checkbox', 'aria-label':
            'Copy Notes to Shipper'});
        var linesPanel = el('div');

        function plain(node) {
            return {node: node};
        }
        var header = UI.placedForm ? UI.placedForm({frames: [{label: '',
            at: [7, 4, 850, 164]}], fields: [
                {name: 'number', label: 'Order ID', at: [17, 4, 247, 24],
                    split: 100},
                {name: 'customer', label: 'Customer ID',
                    at: [17, 26, 247, 46], split: 100},
                {name: 'customer_name', label: '', at: [250, 26, 492, 46],
                    split: 0},
                {name: 'date', label: 'Order Date', at: [17, 48, 247, 68],
                    split: 100},
                {name: 'desired', label: 'Desired Ship Date',
                    at: [17, 70, 247, 90], split: 100},
                {name: 'po', label: 'Purchase Order No',
                    at: [17, 92, 247, 112], split: 100},
                {name: 'status', label: 'Status', at: [17, 114, 247, 134],
                    split: 100},
                {name: 'promise', label: 'Promised Date',
                    at: [17, 136, 247, 156], split: 100},
                {name: 'sold_to', label: 'Sold to', type: 'text',
                    at: [256, 51, 421, 153], split: 100},
                {name: 'ship_to', label: 'Ship to', type: 'text',
                    at: [425, 51, 586, 153], split: 100},
                {name: 'created_by', label: 'Created by',
                    at: [503, 4, 831, 24], split: 100},
                {name: 'modified_by', label: 'Last Modified by',
                    at: [503, 26, 831, 46], split: 100},
                {name: 'last_shipped', label: "Last Ship'd Date",
                    at: [601, 70, 829, 90], split: 100},
                {name: 'printed', label: 'Printed Date',
                    at: [601, 92, 829, 112], split: 100},
                {name: 'quote', label: 'Quote ID', at: [601, 114, 829, 134],
                    split: 100},
                {name: 'shipped_amount', label: 'Shipped Amount',
                    at: [601, 136, 829, 156], split: 100}]}, function (f) {
                    return plain({number: number, customer: customer.node,
                        customer_name: customerName, date: date,
                        desired: desired, po: po, status: statusSel,
                        promise: promise, sold_to: soldToText,
                        ship_to: shipToText}[f.name] ||
                        info[f.name]);
                }) : el('div.grid-form', [['Order ID', number],
                ['Customer ID', customer.node], ['Order Date', date],
                ['Desired Ship Date', desired], ['Purchase Order No', po],
                ['Status', statusSel], ['Promised Date', promise],
                ['Memo', memo]].map(function (p) {
                    return el('div', el('label.field', p[0]), p[1]);
                }));

        var details = fieldGrid(DETAIL_FIELDS, {custom: {payment_term:
            plain(term.node)}});
        /* The Sold To / Ship To tabs: the order's own address (Jobshop's
         * NAME, ADDR_1... of the order), the customer's by default */
        var soldTo = fieldGrid(addressFields('js_sold_'), {buttons: [
            {label: 'Restore Default Address', at: [172, 167, 367, 190],
                onclick: restoreSoldTo},
            {label: 'Export Contact to Outlook', at: [581, 167, 776, 197],
                onclick: function () {
                    exportContact(unprefixed('js_sold_', soldTo.get()));
                }}]});
        var shipFields = addressFields('js_ship_');
        shipFields[0] = Object.assign({}, shipFields[0], {custom: true,
            type: 'many2one'});
        shipFields.push(
            {name: 'ship_customer', label: 'Ship To Customer ID',
                type: 'char', readonly: true, at: [477, 136, 631, 156],
                split: 114},
            {name: 'ship_addr_no', label: 'Address No', type: 'char',
                readonly: true, at: [670, 136, 791, 156], split: 84});
        /* Ship To Name: typed, or a ship to address of the customer
         * looked up (it fills the tab) */
        var shipToOptions = {placeholder: '', label: 'Ship To Name',
            fields: ['party_name', 'party.code'], domain: [['id', '=', -1]],
            onselect: function (record) {
                pickShipTo(record.id);
            }};
        var shipTo = UI.picker('party.address', shipToOptions);
        shipTo.input.addEventListener('input', refreshAddressBoxes);
        var shipToGrid = fieldGrid(shipFields, {custom: {js_ship_name: {
            node: shipTo.node}}, buttons: [
            {label: 'Add New', at: [154, 165, 249, 191], onclick: addShipTo},
            {label: 'Clear Address', at: [264, 165, 359, 191],
                onclick: clearShipTo},
            {label: 'Export Contact to Outlook', at: [581, 167, 776, 197],
                onclick: function () {
                    exportContact(shipParts());
                }}]});
        var specs = el('textarea', {rows: 14, 'aria-label': 'Specifications',
            style: {width: '100%'}});
        var charges = chargesEditor({editable: true});
        var taxesPane, docsPane, browsePane, notesPane;
        var grid = null;

        var subTabs;
        var orderTabs = tabs(main, [
            {title: 'Sales Order', build: function (pane) {
                pane.appendChild(header);
                var holder = el('div');
                pane.appendChild(holder);
                subTabs = tabs(holder, [
                    {title: 'Order Lines', build: function (p) {
                        p.appendChild(el('p.muted', 'Double-click a line ' +
                            'for its Order Line window; right-click for ' +
                            'the line commands.'));
                        p.appendChild(linesPanel);
                    }},
                    {title: 'Sold To', build: function (p) {
                        p.appendChild(soldTo.node);
                    }},
                    {title: 'Ship To', build: function (p) {
                        p.appendChild(shipToGrid.node);
                    }},
                    {title: 'Specs', build: function (p) {
                        p.appendChild(specs);
                    }},
                    {title: 'Notes', build: function (p) {
                        p.appendChild(el('label', {style: {display:
                            'inline-flex', gap: '6px', alignItems: 'center',
                            margin: '0 0 6px 0'}}, copyNotes,
                            'Copy Notes to Shipper'));
                        notesPane = el('div');
                        p.appendChild(notesPane);
                        notesPane.appendChild(el('p.muted',
                            'Save the order first.'));
                    }},
                    {title: 'Charges', build: function (p) {
                        p.appendChild(el('p.muted', 'Applied charges go on ' +
                            'the next invoice of the order.'));
                        p.appendChild(charges.node);
                    }},
                    {title: 'Taxes', build: function (p) {
                        taxesPane = p;
                    }},
                    {title: 'Shippers/Invoices', build: function (p) {
                        docsPane = p;
                    }}
                ]);
                pane.appendChild(el('div', {style: {marginTop: '8px'}},
                    details.node));
            }},
            {title: 'Browse', build: function (pane) {
                browsePane = pane;
            }, onshow: function () {
                browse();
            }}
        ]);
        describe(main, DETAIL_DESCRIPTIONS);
        charges.set([], true);
        details.set({});

        /* Rights: what is not allowed is not shown */
        rights(['sale.sale', 'sale.line', 'nline.sale_charge', 'production'])
            .then(function (r) {
                can.save = r['sale.sale'].write && r['sale.line'].create;
                can.create = r['sale.sale'].create;
                can['delete'] = r['sale.sale']['delete'];
                can.workOrder = r.production.create;
                can.charges = r['nline.sale_charge'].write &&
                    r['nline.sale_charge'].create;
                applyRights();
            });
        ['shipping', 'invoicing', 'workorders', 'parts'].forEach(
            function (s) {
                UI.screenAllowed(s).then(function (ok) {
                    screens[s] = ok;
                });
            });

        function applyRights() {
            var hidden = [];
            if (!can.create) {
                hidden.push('New From Quote', 'Copy Document');
            }
            if (!can.save) {
                hidden.push('Change Status', 'Re-price Lines',
                    'Add Details');
            }
            if (!can['delete'] || !order || ['unreleased', 'firm',
                    'cancelled'].indexOf(order.js_status) < 0) {
                hidden.push('Delete Document');
            }
            if (!order) {
                hidden.push('Copy Document', 'Change Status', 'Print');
            }
            if (order && order.state !== 'draft') {
                hidden.push('Re-price Lines', 'Add Details');
            }
            form.allow(order ? can.save : can.create, hidden);
            if (order) {
                charges.set(order.charges, can.save && can.charges);
            } else if (!can.create || !can.charges) {
                charges.set([], false);
            }
            details.lock(can.save);
            term.input.disabled = !can.save || Boolean(order &&
                order.state !== 'draft');
            specs.disabled = !can.save;
            copyNotes.disabled = !(order ? can.save : can.create);
            statusSel.disabled = !(order ? can.save : can.create);
            [po, desired, promise, memo].forEach(function (n) {
                n.disabled = !(order ? can.save : can.create);
            });
            var edit = order ? can.save : can.create;
            soldTo.lock(edit);
            shipToGrid.lock(edit);
            shipTo.input.disabled = !edit;
            [soldTo.node, shipToGrid.node].forEach(function (n) {
                Array.prototype.forEach.call(n.querySelectorAll(
                    'button.js-btn'), function (b) {
                        b.hidden = !edit && !/Outlook/.test(b.textContent);
                    });
            });
        }

        /* Terms ID: the description box (the terms' description, else
         * its name: N-Line's terms have no separate code) */
        function termDescription(record) {
            var box = details.controls.payment_term_descr;
            if (!record) {
                box.set('');
                return;
            }
            box.set(record.description || record.rec_name || '');
            if (record.description === undefined) {
                Rpc.model('account.invoice.payment_term', 'read',
                    [[record.id], ['description', 'rec_name']]).then(
                    function (rows) {
                        if (rows[0] && term.value() === record.id) {
                            if (!term.input.value) {
                                term.set(record.id, rows[0].rec_name);
                            }
                            box.set(rows[0].description ||
                                rows[0].rec_name || '');
                        }
                    }, function () {});
            }
        }

        function setTerm(id, recName) {
            term.set(id || null, recName || '');
            termDescription(id ? {id: id, rec_name: recName} : null);
        }

        /* The Sold To / Ship To tabs and the header's boxes */
        var shipAddressId = null;
        function shipParts() {
            var parts = unprefixed('js_ship_', shipToGrid.get());
            parts.name = shipTo.input.value;
            return parts;
        }

        function refreshAddressBoxes() {
            var sold = unprefixed('js_sold_', soldTo.get());
            var ship = shipParts();
            soldToText.value = partsText(sold);
            var empty = ADDRESS_PARTS.every(function (k) {
                return !ship[k];
            });
            shipToText.value = partsText(empty ? sold : ship);
        }
        [soldTo.node, shipToGrid.node].forEach(function (n) {
            n.addEventListener('input', refreshAddressBoxes);
        });

        function fillSoldTo(parts) {
            soldTo.set(prefixed('js_sold_', parts));
            refreshAddressBoxes();
        }

        function fillShipTo(parts, address, customerCode) {
            shipAddressId = address ? idOf(address) : null;
            shipToGrid.set(Object.assign(prefixed('js_ship_', parts), {
                ship_customer: shipAddressId ? customerCode ||
                    customer.input.value : '',
                ship_addr_no: shipAddressId ? String(shipAddressId) : ''}));
            shipTo.set(shipAddressId, parts ? parts.name : '');
            if (!shipAddressId) {
                shipTo.input.value = parts ? parts.name || '' : '';
            }
            refreshAddressBoxes();
        }

        function setShipDomain(partyId) {
            shipToOptions.domain = [['party', '=', partyId || -1]];
        }

        /* Restore Default Address: the customer's (Sold To tab) */
        function restoreSoldTo() {
            if (!customer.value()) {
                return;
            }
            Rpc.desk('sales_order_defaults', [customer.value()]).then(
                function (d) {
                    fillSoldTo(addressParts(d.sold_to, d.customer_mobile));
                }, UI.showError);
        }

        /* Ship To Name's lookup: a ship to address of the customer */
        function pickShipTo(id) {
            Rpc.model('party.address', 'read', [[id], ['party_name',
                'street', 'city', 'postal_code', 'subdivision.rec_name',
                'country.rec_name', 'ship_to_contact', 'ship_to_title',
                'ship_to_phone', 'ship_to_fax', 'ship_to_email',
                'party.code', 'party.rec_name']]).then(function (rows) {
                    var a = rows[0];
                    var party = a['party.'] || {};
                    fillShipTo(addressParts({name: a.party_name ||
                        party.rec_name, street: a.street, city: a.city,
                        postal_code: a.postal_code, state:
                            (a['subdivision.'] || {}).rec_name, country:
                            (a['country.'] || {}).rec_name, contact:
                            a.ship_to_contact, title: a.ship_to_title,
                        phone: a.ship_to_phone, fax: a.ship_to_fax,
                        email: a.ship_to_email}), {id: id}, party.code);
                }, UI.showError);
        }

        /* Add New: the tab's address becomes a new ship to address of
         * the customer */
        function addShipTo() {
            var p = shipParts();
            if (!customer.value() || !p.name) {
                UI.showError('Choose the customer and type the ship to ' +
                    'name first.');
                return;
            }
            Rpc.model('party.address', 'create', [[{party: customer.value(),
                party_name: p.name, street: [p.addr_1, p.addr_2].filter(
                    Boolean).join('\n') || null, city: p.city || null,
                postal_code: p.postal || null, ship_to_contact: p.contact ||
                    null, ship_to_title: p.title || null, ship_to_phone:
                    p.phone || null, ship_to_fax: p.fax || null,
                ship_to_email: p.email || null}]]).then(function (ids) {
                    UI.toast('Ship to address added to the customer', 'ok');
                    fillShipTo(p, {id: ids[0]});
                }, UI.showError);
        }

        function clearShipTo() {
            fillShipTo(null, null);
        }

        function customerDefaults(partyId) {
            setShipDomain(partyId);
            Rpc.desk('sales_order_defaults', [partyId]).then(function (d) {
                if (d.payment_term) {
                    setTerm(d.payment_term, null);
                }
                ['sales_rep', 'territory', 'fob_point', 'ship_via',
                    'js_carrier', 'tax_group', 'discount_class'].forEach(
                    function (n) {
                        details.controls[n].set(d[n]);
                    });
                details.controls.freight_terms.set(d.freight_terms);
                if (!specs.value && d.js_specs) {
                    specs.value = d.js_specs;
                }
                fillSoldTo(addressParts(d.sold_to, d.customer_mobile));
                fillShipTo(d.shipment_address ? addressParts(d.ship_to) :
                    null, d.shipment_address);
                if (d.credit_status === 'hold_orders') {
                    UI.toast('Customer has a hold type credit status', 'error');
                } else if (d.credit_status === 'hold_shipments') {
                    UI.toast('Credit status: Hold Shipments', 'error');
                }
            }, UI.showError);
        }

        function extension(v) {
            return Math.round((v.quantity || 0) * (v.price || 0) *
                (1 - (v.discount || 0) / 100) * 100) / 100;
        }

        function priceFor(controls) {
            var partyId = customer.value();
            var product = controls.part.value();
            if (!partyId || !product) {
                return Promise.resolve();
            }
            var args = [partyId, product, UI.parseMoney(
                controls.quantity.value) || 1, date.value || null];
            if (controls.unit.value()) {
                args.push(controls.unit.value());
            }
            return Rpc.desk('sales_price', args).then(function (p) {
                controls.price.value = UI.money(p.gross_unit_price);
                controls.discount.value = num(p.trade_discount);
                if (p.customer_part) {
                    controls.customer_part.value = p.customer_part;
                }
                grid.update();
            }, UI.showError);
        }

        /* Jobshop's ORDER_LINE grid (SalesOrderSubTabs.txt), in its order;
         * Order Qty (not a column of the layout file, the grid's quantity)
         * after U/M. ro: shown, not typed (Jobshop's readonly columns) */
        var RO_KEYS = ['line_no', 'line_status', 'last_shipped', 'available',
            'specs', 'linked', 'quotes'];

        function lineCommission(v) {
            var pct = parseFloat(String(v.commission_pct || '')
                .replace(/,/g, '')) || 0;
            return Math.round(extension(v) * pct) / 100;
        }

        /* A grid row's controls from a line */
        function fillRow(controls, line) {
            if (line.product) {
                controls.part.set(line.product.id, line.product.rec_name);
            }
            if (line.unit && typeof line.unit === 'object') {
                controls.unit.set(line.unit.id, line.unit.rec_name);
            }
            controls.line_no.value = line.line_no ? String(line.line_no) : '';
            controls.po_line.value = line.customer_po_line || '';
            controls.description.value = line.description || '';
            controls.description.title = line.description || '';
            controls.quantity.value = String(line.quantity || 1);
            controls.price.value = UI.money(line.gross_unit_price);
            controls.discount.value = num(line.trade_discount);
            controls.part.lineId = line.id || null;
            controls.part.extra = line;
            fillRowExtra(controls, line);
        }

        /* The columns the Order Line window also edits */
        function fillRowExtra(controls, line) {
            controls.line_status.value = line.id ? label(LINE_STATUS,
                line.js_line_status) || 'Open' : '';
            controls.desired.value = iso(line.js_desired_date) || '';
            controls.last_shipped.value = UI.date(line.last_shipped_date);
            controls.available.value = num(line.available);
            controls.specs.checked = Boolean(line.js_line_specs);
            controls.product_code.set(idOf(line.product_code),
                name(line.product_code));
            controls.commodity_code.set(idOf(line.commodity_code),
                name(line.commodity_code));
            controls.linked.checked = Boolean((line.links || []).length ||
                (line.link_details || []).length);
            controls.commissionable.checked = line.commissionable ===
                undefined ? true : Boolean(line.commissionable);
            controls.commission_pct.value = num(line.commission_percent);
            controls.customer_part.value = line.customer_part || '';
            controls.drawing_id.value = line.drawing_id || '';
            controls.drawing_rev.value = line.drawing_rev || '';
            controls.ship_via.set(idOf(line.js_ship_via),
                name(line.js_ship_via));
            controls.quotes.checked = Boolean(line.quotes_exist);
        }

        function lockRow(controls) {
            controls.description.style.minWidth = '20em';
            RO_KEYS.forEach(function (k) {
                var c = controls[k];
                if (c.type === 'checkbox') {
                    c.disabled = true;
                } else {
                    c.readOnly = true;
                }
                c.tabIndex = -1;
            });
        }

        function newGrid(lines) {
            var codePicker = function (model, placeholder) {
                return {model: model, placeholder: placeholder};
            };
            grid = UI.grid({total: 'amount', required: 'part',
                onchange: function () {
                    updateTotals();
                }, columns: [
                    {key: 'line_no', label: 'Line No', width: '4em'},
                    {key: 'po_line', label: 'PO Line No', width: '5em'},
                    {key: 'line_status', label: 'Line Status', width: '6em'},
                    {key: 'desired', label: 'Line Desired Ship Date',
                        kind: 'date'},
                    {key: 'last_shipped', label: 'Last Shipped Date',
                        width: '7em'},
                    {key: 'available', label: 'Avail. to Promise (stk U/M)',
                        width: '6em'},
                    {key: 'part', label: 'Part ID', kind: 'picker',
                        width: '10em', picker: {model: 'product.product',
                            domain: [['salable', '=', true]],
                            placeholder: 'Part', fields: ['list_price'],
                            onselect: function (record, controls) {
                                controls.description.value = record.rec_name
                                    .replace(/^\[[^\]]*\]\s*/, '');
                                if (record.list_price) {
                                    controls.price.value = UI.money(
                                        record.list_price);
                                }
                                priceFor(controls);
                            }}},
                    {key: 'description', label: 'Description',
                        width: '20em'},
                    {key: 'unit', label: 'U/M', kind: 'picker',
                        picker: {model: 'product.uom', placeholder: 'U/M'}},
                    {key: 'quantity', label: 'Order Qty', kind: 'number',
                        default: '1'},
                    {key: 'price', label: 'Unit Price', kind: 'money'},
                    {key: 'discount', label: 'Trade Disc%', kind: 'number',
                        default: '0'},
                    {key: 'amount', label: 'Extension', kind: 'computed',
                        compute: extension},
                    {key: 'specs', label: 'Specs', kind: 'check'},
                    {key: 'product_code', label: 'Product Code',
                        kind: 'picker', picker: codePicker(
                            'nline.product_code', 'Product Code')},
                    {key: 'commodity_code', label: 'Commodity Code',
                        kind: 'picker', picker: codePicker(
                            'nline.commodity_code', 'Commodity Code')},
                    {key: 'linked', label: 'Linked', kind: 'check'},
                    {key: 'commissionable', label: 'Commissionable',
                        kind: 'check', default: true},
                    {key: 'commission_pct', label: 'Commission Percent',
                        width: '6em'},
                    {key: 'commission', label: 'Commission',
                        kind: 'computed', compute: lineCommission},
                    {key: 'customer_part', label: 'Customer Part ID'},
                    {key: 'drawing_id', label: 'Drawing ID'},
                    {key: 'drawing_rev', label: 'Drawing Rev', width: '5em'},
                    {key: 'ship_via', label: 'Ship Via', kind: 'picker',
                        picker: codePicker('nline.ship_via', 'Ship Via')},
                    {key: 'quotes', label: 'Quote(s) Exist', kind: 'check'}
                ]});
            var first = true;
            (lines || []).forEach(function (line) {
                var row = first ? null : grid.addRow();
                var controls = row ? row.controls : grid.controls()[0];
                first = false;
                fillRow(controls, line);
            });
            grid.controls().forEach(lockRow);
            grid.update();
            UI.clear(linesPanel).appendChild(grid.node);
            grid.node.querySelector('table').classList.add('js-nowrap');
            /* Rows the grid adds (Enter, a filled last line) */
            new global.MutationObserver(function () {
                grid.controls().forEach(lockRow);
            }).observe(grid.node.querySelector('tbody'), {childList: true});
            grid.node.addEventListener('input', function (event) {
                if (event.target.getAttribute('aria-label') ===
                        'Commission Percent') {
                    grid.update();
                }
            });
            grid.node.addEventListener('contextmenu', function (event) {
                var controls = rowControls(event);
                if (controls) {
                    lineMenu(event, controls.part.extra || {}, controls);
                }
            });
            grid.node.addEventListener('dblclick', function (event) {
                var controls = rowControls(event);
                if (controls) {
                    editDraftLine(controls);
                }
            });
        }

        function rowControls(event) {
            var tr = event.target.closest('tbody tr');
            if (!tr || !grid) {
                return null;
            }
            var index = Array.prototype.indexOf.call(tr.parentNode
                .children, tr);
            return grid.controls()[index] || null;
        }

        function pickerRef(p) {
            return p.value() ? {id: p.value(), rec_name: p.input.title ||
                p.input.value} : null;
        }

        /* The values of a draft grid row as a line */
        function rowLine(controls) {
            var extra = controls.part.extra || {};
            return Object.assign({}, extra, {
                product: controls.part.value() ? {id: controls.part.value(),
                    rec_name: controls.part.input.title ||
                        controls.part.input.value} : null,
                unit: controls.unit.value() ? {id: controls.unit.value(),
                    rec_name: controls.unit.input.value} : extra.unit,
                customer_po_line: controls.po_line.value,
                description: controls.description.value,
                customer_part: controls.customer_part.value,
                quantity: UI.parseMoney(controls.quantity.value) || 1,
                gross_unit_price: UI.parseMoney(controls.price.value),
                trade_discount: UI.parseMoney(controls.discount.value) || 0,
                amount: controls.amount.amount,
                js_desired_date: controls.desired.value || null,
                product_code: pickerRef(controls.product_code),
                commodity_code: pickerRef(controls.commodity_code),
                commissionable: controls.commissionable.checked,
                commission_percent: controls.commission_pct.value === '' ?
                    null : String(UI.parseMoney(controls.commission_pct
                        .value)),
                drawing_id: controls.drawing_id.value,
                drawing_rev: controls.drawing_rev.value,
                js_ship_via: pickerRef(controls.ship_via)
            });
        }

        function editDraftLine(controls) {
            lineWindow(rowLine(controls), can.save || !order, function (v) {
                controls.part.extra = Object.assign(controls.part.extra ||
                    {}, v);
                if (v.customer_po_line !== undefined) {
                    controls.po_line.value = v.customer_po_line || '';
                }
                fillRowExtra(controls, Object.assign(rowLine(controls), v));
                grid.update();
            });
        }

        function addDetails() {
            if (!grid) {
                return;
            }
            var last = grid.controls()[grid.controls().length - 1];
            var controls = last && !last.part.value() ? last :
                grid.addRow().controls;
            editDraftLine(controls);
        }

        /* The right-click menu of a line (Jobshop's PopupCustWOLinks) */
        function lineMenu(event, line, controls) {
            var draft = Boolean(controls);
            var product = draft ? controls.part.value() :
                idOf(line.product);
            var items = [];
            if (draft && can.save) {
                items.push({label: 'Add Details...', onclick: addDetails});
            }
            items.push({label: 'Edit Details...', onclick: function () {
                if (draft) {
                    editDraftLine(controls);
                } else {
                    releasedLine(line);
                }
            }});
            items.push({label: 'Copy Line', onclick: function () {
                copied = draft ? rowLine(controls) : Object.assign({}, line);
                UI.toast('Line copied', 'ok');
            }});
            if (draft && copied && can.save) {
                items.push({label: 'Paste Line', onclick: function () {
                    var target = grid.controls()[grid.controls().length - 1];
                    if (target.part.value()) {
                        target = grid.addRow().controls;
                    }
                    var paste = Object.assign({}, copied, {id: null});
                    fillRow(target, paste);
                    target.part.extra = Object.assign({}, paste, {id: null,
                        links: [], link_details: []});
                    grid.update();
                }});
            }
            items.push('-', {label: 'Work Order Links...', onclick:
                function () {
                    linksDialog(draft ? rowLine(controls) : line);
                }});
            if (product) {
                items.push(partLinesDialog('quote', product)(event),
                    submenu(event,
                        'View All Order Lines for Part by Order Status of',
                        statusItems(function (s) {
                            orderLinesDialog('Order Lines for Part',
                                {product: product}, s);
                        })),
                    partLinesDialog('purchase', product)(event));
                if (screens.parts) {
                    items.push({label: 'Open Part...', onclick: function () {
                        UI.openScreen('parts/' + product, 'Part');
                    }});
                }
            }
            if (draft && can.save) {
                items.push('-', {label: 'Calculate Sales Order Line Price',
                    onclick: function () {
                        priceFor(controls);
                    }});
            }
            UI.contextMenu(event, items);
        }

        /* Work Order Links...: the work orders of the line (the Order
         * Line window's Links tab) */
        function linksNode(line, close) {
            var details = line.link_details || (line.links || []).map(
                function (l) {
                    return {id: l.id, number: l.number, state: l.state};
                });
            var node = el('div', table([{label: 'Work ID'},
                {label: 'Quantity', num: true}, {label: 'Status'},
                {label: 'Description'}, {label: 'Desired Finish Date'},
                {label: 'Scheduled Finish Date'}], details.map(function (l) {
                    return {ondblclick: function () {
                        if (screens.workorders) {
                            if (close) {
                                close();
                            }
                            UI.openScreen('workorders/' + l.id, 'WO ' +
                                l.number);
                        }
                    }, cells: [l.number, num(l.quantity), l.state,
                        l.description, UI.date(l.planned_date),
                        UI.date(l.planned_end_date)]};
                }), 'Not linked to a work order.'));
            var released = order && (order.state === 'confirmed' ||
                order.state === 'processing');
            if (line.id && released && !details.length && can.workOrder) {
                node.appendChild(el('div.toolbar', el('button', {type:
                    'button', onclick: function () {
                        UI.service('sale_line_work_order', line.id).then(
                            function (wo) {
                                UI.toast('Work order ' + wo.number +
                                    ' created', 'ok');
                                if (close) {
                                    close();
                                }
                                load(order.id);
                            }, failed);
                    }}, 'New Work Order')));
            } else if (!released) {
                node.appendChild(el('p.muted', 'Release the order to ' +
                    'create the work order of the line.'));
            }
            return node;
        }

        function linksDialog(line) {
            var close = UI.modal('Work Order Links - line ' + (line.line_no ||
                ''), [el('div.js-sales', linksNode(line, function () {
                    close();
                }))], [{label: 'Close', primary: true}]);
        }

        /* The Order Line window: General (the grid's values read-only and
         * the line's overrides), Other (User 0-2), Specs, Links */
        function lineWindow(line, editable, done) {
            var general = fieldGrid([
                infoField('line_no', 'Line No', [17, 34, 188, 54], 70),
                infoField('line_status', 'Line Status', [360, 34, 579, 54],
                    80),
                infoField('quote_line_no', 'Quote Line No',
                    [691, 34, 852, 54], 90),
                infoField('part', 'Part ID', [17, 56, 493, 76]),
                infoField('description', 'Description', [17, 78, 852, 98]),
                infoField('quantity', 'Order Qty', [17, 169, 262, 189]),
                infoField('unit', 'Unit of Measure', [308, 169, 544, 189],
                    110),
                infoField('price', 'Unit Price', [17, 191, 262, 211]),
                infoField('discount', 'Trade Discount %',
                    [308, 191, 544, 211], 110),
                infoField('amount', 'Extension', [616, 191, 850, 211], 80),
                infoField('shipped', "Ship'd Qty", [448, 328, 607, 348], 80),
                infoField('last_shipped', 'Last Shipped',
                    [448, 350, 607, 370], 80),
                infoField('shipped_amount', "Ship'd Amount",
                    [616, 394, 850, 414], 110)].concat(LINE_DETAIL_FIELDS),
                {frames: [{label: '', at: [9, 34, 862, 147]},
                    {label: 'Sales', at: [9, 147, 862, 258]},
                    {label: 'Shipping', at: [9, 305, 862, 416]}]});
            var other = fieldGrid(LINE_OTHER_FIELDS, {frames: [{label:
                'User Defined Fields', at: [7, 4, 831, 100]}], buttons: [
                {label: '!', at: [393, 24, 413, 44], onclick: function () {
                    var path = other.controls.user_0.get();
                    if (path) {
                        global.open('file:///' + String(path).replace(
                            /\\/g, '/'), '_blank');
                    }
                }}]});
            var spec = fieldGrid(LINE_SPEC_FIELDS, {});
            var data = Object.assign({}, line, {
                line_status: label(LINE_STATUS, line.js_line_status) ||
                    'Open',
                part: line.product ? line.product.rec_name : '',
                quantity: num(line.quantity),
                unit: name(line.unit),
                price: UI.money(line.gross_unit_price),
                discount: num(line.trade_discount),
                amount: UI.money(line.amount),
                shipped: num(line.shipped_quantity || 0),
                last_shipped: UI.date(line.last_shipped_date),
                shipped_amount: UI.money(line.shipped_amount || 0),
                commissionable: line.commissionable === undefined ? true :
                    line.commissionable
            });
            [general, other, spec].forEach(function (g) {
                g.set(data);
                g.lock(editable);
            });
            describe(general.node, [['Product Code ID', [242, 123, 425, 143]],
                ['Commodity Code ID', [658, 123, 854, 143]],
                ['Tax Group ID', [658, 213, 854, 233]]]);
            tabbedModal('Order Line - [' + (line.line_no || 'new') + ']', [
                {title: 'General', node: general.node},
                {title: 'Other', node: other.node},
                {title: 'Specs', node: spec.node},
                {title: 'Links', node: linksNode(line, null)}
            ], editable ? [
                {label: 'Cancel'},
                {label: 'OK', primary: true, onclick: function () {
                    var values = Object.assign(general.get(), other.get(),
                        spec.get());
                    ['line_no', 'line_status', 'quote_line_no', 'part',
                        'description', 'quantity', 'unit', 'price',
                        'discount', 'amount', 'shipped', 'last_shipped',
                        'shipped_amount'].forEach(function (n) {
                            delete values[n];
                        });
                    LINE_ALL_FIELDS.forEach(function (f) {
                        if (f.type === 'many2one') {
                            var c = general.controls[f.name];
                            values[f.name] = c && c.get() ? {id: c.get(),
                                rec_name: c.picker.input.title ||
                                    c.picker.input.value} : null;
                        }
                    });
                    done(values);
                }}] : [{label: 'Close', primary: true}]);
        }

        function releasedLine(line) {
            lineWindow(line, can.save, function (values) {
                Object.assign(line, values);
                line.changed = true;
                save();
            });
        }

        function readOnlyLines(lines) {
            grid = null;
            UI.clear(linesPanel).appendChild(table([
                {label: 'Line No'}, {label: 'PO Line No'},
                {label: 'Line Status'}, {label: 'Line Desired Ship Date'},
                {label: 'Last Shipped Date'},
                {label: 'Avail. to Promise (stk U/M)', num: true},
                {label: 'Part ID'}, {label: 'Description'}, {label: 'U/M'},
                {label: 'Order Qty', num: true},
                {label: 'Total Shipped Qty', num: true},
                {label: 'Unit Price', num: true},
                {label: 'Trade Disc%', num: true},
                {label: 'Extension', num: true}, {label: 'Specs'},
                {label: 'Product Code'}, {label: 'Commodity Code'},
                {label: 'Linked'}, {label: 'Commissionable'},
                {label: 'Commission Percent', num: true},
                {label: 'Commission', num: true},
                {label: 'Customer Part ID'}, {label: 'Drawing ID'},
                {label: 'Drawing Rev'}, {label: 'Ship Via'},
                {label: 'Quote(s) Exist'}],
                lines.map(function (line) {
                    var pct = Number(line.commission_percent || 0);
                    return {
                        ondblclick: function () {
                            releasedLine(line);
                        },
                        oncontextmenu: function (event) {
                            lineMenu(event, line, null);
                        },
                        cells: [String(line.line_no), line.customer_po_line,
                            label(LINE_STATUS, line.js_line_status),
                            UI.date(line.js_desired_date ||
                                line.shipping_date),
                            UI.date(line.last_shipped_date),
                            num(line.available),
                            line.product ? el('span', {title:
                                line.product.rec_name}, UI.shortName(
                                'product.product', line.product.rec_name)) :
                                '',
                            clip(line.description),
                            name(line.unit) || line.unit,
                            num(line.quantity), num(line.shipped_quantity),
                            UI.money(line.gross_unit_price),
                            num(line.trade_discount), UI.money(line.amount),
                            check(line.js_line_specs),
                            codeOf(line.product_code),
                            codeOf(line.commodity_code),
                            check((line.links || []).length ||
                                (line.link_details || []).length),
                            check(line.commissionable),
                            num(line.commission_percent),
                            pct ? UI.money(Number(line.amount || 0) * pct /
                                100) : '',
                            line.customer_part, line.drawing_id,
                            line.drawing_rev, codeOf(line.js_ship_via),
                            check(line.quotes_exist)]};
                }), 'No line.', true));
        }

        function updateTotals() {
            var lineTotal = grid ? grid.total() : order ?
                Number(order.untaxed_amount) : 0;
            var chargeTotal = charges.values().reduce(function (s, c) {
                return s + (c.amount ? Number(c.amount) : 0);
            }, 0);
            var tax = order ? Number(order.tax_amount || 0) : 0;
            details.controls.lines_total.set(UI.money(lineTotal));
            details.controls.charges_total.set(UI.money(chargeTotal));
            details.controls.tax_total.set(UI.money(tax));
            details.controls.order_total.set(UI.money(lineTotal +
                chargeTotal + (grid && !order ? 0 : tax)));
        }

        function renderTaxes() {
            UI.clear(taxesPane);
            var taxes = order ? order.taxes : [];
            taxesPane.appendChild(table([{label: 'Tax Group ID'},
                {label: 'Tax Name'}, {label: 'Description'},
                {label: 'Account ID'}, {label: 'Tax Percent', num: true},
                {label: 'Tax Amount', num: true},
                {label: 'Taxable', num: true}], taxes.map(function (t) {
                    return {cells: [t.tax_group, t.tax_name, t.description,
                        t.account, num(t.percent), UI.money(t.amount),
                        UI.money(t.base)]};
                }), order ? 'No tax on this order.' : 'Save the order ' +
                'first.'));
        }

        function openDocument(d, invoice) {
            if (invoice) {
                if (screens.invoicing) {
                    UI.openScreen('invoicing/' + invoice.id, 'Invoice ' +
                        (invoice.number || invoice.id));
                } else {
                    UI.openRecord('account.invoice', invoice.id,
                        invoice.number);
                }
            } else if (d.model === 'stock.shipment.out' && screens.shipping) {
                UI.openScreen('shipping/' + d.id, 'Shipper ' + d.number);
            } else {
                UI.openRecord(d.model, d.id, d.number);
            }
        }

        function shipperLines(statuses) {
            desk('sales_shipper_lines', [order.id, statuses]).then(
                function (rows) {
                    listDialog('Shipper Lines', ['Transacted', 'Shipper ID',
                        'Shipper Status', 'Shipper Type', 'Shipped Date',
                        'Line No', 'Sales Line No', 'Part ID', 'Description',
                        'Shipped Qty', 'U/M', 'Unit Price', 'Shipped Amount',
                        'Customer Part ID', 'Product Code',
                        'Commodity Code'].map(function (l) {
                            return {label: l, num: /Qty|Price|Amount/.test(
                                l)};
                        }), rows.map(function (r) {
                            return {cells: [r.transacted ? '✔' : '',
                                r.shipper.number, label(SHIPPER_STATUS,
                                    r.status), r.type, UI.date(
                                    r.shipped_date), r.line_no,
                                r.sales_line_no, name(r.product),
                                r.description, num(r.quantity), r.unit,
                                UI.money(r.unit_price), UI.money(r.amount),
                                r.customer_part, r.product_code,
                                r.commodity_code]};
                        }), {empty: 'No shipper line.'});
                }, failed);
        }

        var docsStatus = null;
        function renderDocuments() {
            UI.clear(docsPane);
            var rows = (order ? order.shippers : []).filter(function (d) {
                return !docsStatus || docsStatus.indexOf(d.status) >= 0;
            });
            var shipperStatusItems = function (onpick) {
                return [{label: 'All', onclick: function () {
                    onpick(null);
                }}].concat(SHIPPER_STATUS.map(function (s) {
                    return {label: s[1], onclick: function () {
                        onpick([s[0]]);
                    }};
                }));
            };
            var menu = function (event, d) {
                event.stopPropagation();
                if (!order) {
                    return;
                }
                UI.contextMenu(event, [
                    submenu(event, 'View Shippers by Shipper Status of',
                        shipperStatusItems(function (s) {
                            docsStatus = s;
                            renderDocuments();
                        })),
                    {label: 'View Shipper Lines...', onclick: function () {
                        shipperLines(null);
                    }},
                    submenu(event,
                        'View All Shipper Lines by Shipper Status of',
                        shipperStatusItems(shipperLines)),
                    d && d.model !== 'account.invoice' ? {label:
                        'Open Shipper...', onclick: function () {
                            openDocument(d, null);
                        }} : '-',
                    d && d.invoice ? {label: 'Open Invoice...', onclick:
                        function () {
                            openDocument(d, d.invoice);
                        }} : '-']);
            };
            var node = table([{label: 'Shipper ID'}, {label: 'Status'},
                {label: 'Type'}, {label: 'Shipped Amount', num: true},
                {label: 'Shipped Date'}, {label: 'Invoice ID'},
                {label: 'Invoiced Date'},
                {label: 'Credit Amount Applied', num: true},
                {label: 'Invoiced Amount (incl. taxes & charges)',
                    num: true}], rows.map(function (d) {
                    return {ondblclick: function () {
                        openDocument(d, d.model === 'account.invoice' ?
                            d.invoice || d : null);
                    }, oncontextmenu: function (e) {
                        menu(e, d);
                    }, cells: [d.model === 'account.invoice' ? '' :
                        d.number, label(SHIPPER_STATUS, d.status) || d.state,
                        d.type, UI.money(d.amount), UI.date(d.shipped_date ||
                            d.date), d.invoice_number || (d.model ===
                            'account.invoice' ? d.number : ''),
                        UI.date(d.invoiced_date), UI.money(
                            d.credit_applied || 0), UI.money(
                            d.invoiced_amount)]};
                }), order ? 'Nothing shipped or invoiced yet.' :
                'Save the order first.');
            node.addEventListener('contextmenu', function (e) {
                menu(e, null);
            });
            docsPane.appendChild(node);
        }

        function browse() {
            var search = el('input', {type: 'text', placeholder:
                'Search (* for any text)', 'aria-label': 'Search'});
            var holder = el('div');
            function run() {
                var text = search.value.trim().replace(/\*/g, '%');
                var domain = text ? [['rec_name', 'ilike', text.indexOf(
                    '%') >= 0 ? text : '%' + text + '%']] : [];
                Rpc.searchRead('sale.sale', domain, ['number',
                    'party.code', 'reference', 'sale_date', 'js_status'],
                    {limit: 300, order: [['sale_date', 'DESC'],
                        ['id', 'DESC']]}).then(
                    function (rows) {
                        UI.clear(holder).appendChild(table([
                            {label: 'Order ID'}, {label: 'Customer ID'},
                            {label: 'PO Ref#'}, {label: 'Order Date'},
                            {label: 'Status'}],
                            rows.map(function (row) {
                                return {ondblclick: function () {
                                    load(row.id);
                                    orderTabs.show(0);
                                }, cells: [row.number || String(row.id),
                                    (row['party.'] || {}).code || '',
                                    row.reference || '',
                                    UI.date(row.sale_date),
                                    label(JS_STATUS, row.js_status)]};
                            })));
                    }, UI.showError);
            }
            var timer;
            search.addEventListener('input', function () {
                global.clearTimeout(timer);
                timer = global.setTimeout(run, 250);
            });
            UI.clear(browsePane).appendChild(el('div.toolbar', el('div',
                {style: {width: '320px'}}, search)));
            browsePane.appendChild(holder);
            run();
        }

        function show(data) {
            order = data;
            number.value = data.number || '';
            number.disabled = data.state !== 'draft';
            statusSel.value = data.js_status;
            customer.set(data.party.id, data.party.rec_name);
            customer.input.disabled = data.state !== 'draft';
            customerName.value = data.customer_name || data.party.rec_name;
            form.showParty(data.party.id);
            date.value = data.sale_date || '';
            desired.value = data.shipping_date || '';
            promise.value = data.promise_date || '';
            po.value = data.reference;
            memo.value = data.description;
            setTerm(idOf(data.payment_term_ref || data.payment_term),
                name(data.payment_term_ref));
            date.disabled = data.state !== 'draft';
            info.created_by.value = data.created_by || '';
            info.modified_by.value = data.modified_by || '';
            info.last_shipped.value = UI.date(data.last_shipped_date);
            info.printed.value = UI.date(data.js_printed_date);
            info.quote.value = data.js_quote || '';
            info.shipped_amount.value = UI.money(data.shipped_amount || 0);
            details.set(Object.assign({}, data, {
                receivable: codeOf(data.receivable),
                receivable_descr: descOf(data.receivable)}));
            specs.value = data.js_specs || '';
            copyNotes.checked = Boolean(data.js_copy_notes);
            /* The order's own addresses, else the customer's (as Jobshop
             * copies them onto a new order) */
            setShipDomain(data.party.id);
            var stored = function (prefix) {
                return ADDRESS_PARTS.some(function (k) {
                    return data[prefix + k];
                });
            };
            fillSoldTo(stored('js_sold_') ? unprefixed('js_sold_', data) :
                addressParts(data.sold_to, data.customer_mobile));
            var shipAddress = data.shipment_address && data.shipment_address
                .id ? data.shipment_address : null;
            fillShipTo(stored('js_ship_') ? unprefixed('js_ship_', data) :
                shipAddress ? addressParts(data.ship_to) : null, shipAddress,
                data.customer_code);
            if (data.state === 'draft') {
                newGrid(data.lines);
            } else {
                readOnlyLines(data.lines);
            }
            UI.clear(notesPane);
            UI.notesTab(notesPane, 'sale.sale', data.id, can.save);
            renderTaxes();
            renderDocuments();
            applyRights();
            updateTotals();
            details.controls.order_total.set(UI.money(data.order_amount));
            UI.setTitle('Sales Order :: ' + (data.number || data.id));
        }

        function load(id) {
            return Rpc.desk('sale_order_get', [id]).then(show, UI.showError);
        }

        function lineExtra(extra) {
            var values = {};
            LINE_ALL_FIELDS.forEach(function (f) {
                if (extra && extra[f.name] !== undefined) {
                    values[f.name] = f.type === 'many2one' ?
                        idOf(extra[f.name]) : f.type === 'date' ?
                        iso(extra[f.name]) : extra[f.name];
                }
            });
            return values;
        }

        function headerValues() {
            var values = details.get();
            ['receivable', 'lines_total', 'charges_total', 'tax_total',
                'order_total', 'payment_term'].forEach(function (n) {
                    delete values[n];
                });
            values.js_specs = specs.value || null;
            values.js_copy_notes = copyNotes.checked;
            Object.assign(values, soldTo.get(), prefixed('js_ship_',
                shipParts()));
            values.charges = charges.values();
            values.reference = po.value || null;
            values.description = memo.value || null;
            values.shipping_date = desired.value || null;
            values.promise_date = promise.value || null;
            return values;
        }

        function save() {
            if (!customer.value()) {
                UI.showError('Choose the customer.');
                return;
            }
            var values = headerValues();
            var wanted = statusSel.value;
            if (!order || order.state === 'draft') {
                /* A line without a part (a description line, as Jobshop
                 * allows) is kept too: dropped, the save deleted it */
                values.lines = grid.controls().filter(function (c) {
                    return c.part.value() || c.part.lineId ||
                        c.description.value.trim();
                }).map(function (c) {
                    var row = rowLine(c);
                    return Object.assign(lineExtra(c.part.extra),
                        lineExtra(row), {
                        commission_percent: row.commission_percent,
                        js_ship_via: idOf(row.js_ship_via),
                        id: c.part.lineId || null,
                        product: c.part.value(),
                        unit: c.unit.value() || undefined,
                        description: c.description.value || null,
                        customer_part: c.customer_part.value || null,
                        customer_po_line: c.po_line.value || null,
                        quantity: UI.parseMoney(c.quantity.value) || 1,
                        gross_unit_price: c.price.value === '' ? null :
                            String(UI.parseMoney(c.price.value)),
                        trade_discount: String(UI.parseMoney(
                            c.discount.value) || 0)
                    });
                });
                Object.assign(values, {
                    id: order ? order.id : null,
                    number: number.value || null,
                    party: customer.value(), sale_date: date.value || null,
                    payment_term: term.value() || null,
                    shipment_address: shipAddressId});
            } else {
                values.id = order.id;
                values.party = order.party.id;
                values.lines = order.lines.filter(function (l) {
                    return l.changed;
                }).map(function (l) {
                    return Object.assign(lineExtra(l), {id: l.id});
                });
            }
            return UI.service('sale_order_save', values).then(
                function (data) {
                    UI.toast('Order ' + (data.number || data.id) + ' saved',
                        'ok');
                    if (!order) {
                        global.history.replaceState(null, '', '#/orders/' +
                            data.id);
                    }
                    show(data);
                    /* The Status chosen on a new order */
                    if (wanted && wanted !== data.js_status &&
                            data.js_status === 'unreleased') {
                        changeStatus(wanted);
                    }
                }, failed);
        }

        function changeStatus(s) {
            if (!order) {
                return;
            }
            var ask = s === 'cancelled' || s === 'closed' ?
                UI.confirm('Change Status', 'Set order ' +
                    (order.number || order.id) + ' to ' +
                    label(JS_STATUS, s) + '?') : Promise.resolve(true);
            ask.then(function (ok) {
                if (!ok) {
                    statusSel.value = order.js_status;
                    return;
                }
                Rpc.desk('sales_order_status', [order.id, s]).then(
                    function (data) {
                        UI.toast('Order ' + (data.number || data.id) + ': ' +
                            label(JS_STATUS, s), 'ok');
                        show(data);
                    }, function (error) {
                        statusSel.value = order.js_status;
                        UI.showError(error);
                    });
            });
        }

        statusSel.addEventListener('change', function () {
            if (order && statusSel.value !== order.js_status) {
                changeStatus(statusSel.value);
            }
        });

        function allowedNext() {
            return {
                unreleased: ['firm', 'released', 'hold', 'cancelled'],
                firm: ['unreleased', 'released', 'hold', 'cancelled'],
                released: ['hold', 'closed'],
                hold: order.state === 'draft' ? ['unreleased', 'firm',
                    'released', 'cancelled'] : order.state === 'quotation' ?
                    ['firm', 'released', 'cancelled'] : ['released',
                        'closed'],
                closed: order.state === 'done' ? [] : ['released'],
                cancelled: ['unreleased']
            }[order.js_status] || [];
        }

        function statusMenu(button) {
            if (!order) {
                return;
            }
            var names = {unreleased: 'UnReleased...', firm: 'Firm...',
                released: 'Release...', hold: 'Hold...', closed: 'Close...',
                cancelled: 'Cancel...'};
            menuAt(button, allowedNext().map(function (s) {
                return {label: names[s], onclick: function () {
                    changeStatus(s);
                }};
            }));
        }

        function printOrder() {
            if (!order) {
                return;
            }
            Rpc.report('sale.sale', [order.id]).then(function (r) {
                UI.openReport(r, 'Order');
                desk('sales_order_printed', [order.id]).then(function () {
                    info.printed.value = UI.date(UI.today());
                }, function () {});
            }, UI.showError);
        }

        function copyOrder() {
            if (!order) {
                return;
            }
            Rpc.desk('sales_order_copy', [order.id, 'order']).then(
                function (data) {
                    UI.toast('Copied to a new order', 'ok');
                    global.history.replaceState(null, '', '#/orders/' +
                        data.id);
                    show(data);
                }, UI.showError);
        }

        /* File > New Document From > Quote: Jobshop's Create Sales Order
         * from Quote dialog on an Estimating quote */
        function fromQuote() {
            UI.browse('nline.quote', {title: 'Quote ID',
                domain: [['status', 'in', ['active', 'ready']]],
                order: [['quote_date', 'DESC']],
                columns: [{field: 'number', label: 'Quote ID'},
                    {field: 'rec_name', label: 'Customer'},
                    {field: 'quote_date', label: 'Quote Date'},
                    {field: 'total_amount', label: 'Total', money: true}]})
                .then(function (quote) {
                    return desk('sales_quote_get', [quote.id]).then(
                        quoteDialog);
                }).catch(failed);
        }

        function quoteDialog(quote) {
            var head = fieldGrid([
                {name: 'quote', label: 'Quote ID', type: 'char',
                    readonly: true, at: [14, 4, 244, 24], split: 110},
                {name: 'number', label: 'Sales Order ID', type: 'char',
                    at: [14, 26, 244, 46], split: 110},
                {name: 'customer', label: 'Customer ID', type: 'char',
                    readonly: true, at: [14, 48, 244, 68], split: 110},
                {name: 'sale_date', label: 'Order Date', type: 'date',
                    at: [14, 70, 244, 90], split: 110},
                {name: 'leadtime', label: 'Quoted Leadtime (days)',
                    type: 'char', readonly: true, at: [249, 70, 474, 90],
                    split: 130},
                {name: 'shipping_date', label: 'Desired Ship Date',
                    type: 'date', at: [14, 92, 244, 112], split: 110},
                {name: 'reference', label: 'Purchase Order No',
                    type: 'char', at: [14, 114, 244, 134], split: 110},
                {name: 'status', label: 'Status', type: 'selection',
                    options: JS_STATUS.filter(function (s) {
                        return s[0] !== 'closed';
                    }), at: [14, 136, 244, 156], split: 110}], {});
            head.set({quote: quote.number, customer: name(quote.party),
                sale_date: UI.today(), leadtime: quote.quoted_leadtime ===
                    null ? '' : String(quote.quoted_leadtime),
                shipping_date: quote.desired_ship_date,
                reference: quote.customer_reference, status: 'unreleased'});
            var inputs = [];
            var rows = quote.lines.map(function (l) {
                var include = el('input', {type: 'checkbox',
                    'aria-label': 'Include'});
                include.checked = l.include;
                var qty = el('input.js-qty', {type: 'text', value:
                    num(l.quantity), 'aria-label': 'Order Qty'});
                var when = el('input', {type: 'date', value:
                    l.desired_ship_date || '', 'aria-label':
                        'Desired Ship Date'});
                inputs.push({id: l.id, include: include, qty: qty,
                    when: when});
                return {cells: [include, l.line_no, qty, name(l.product) ?
                    UI.shortName('product.product', name(l.product)) : '',
                    l.description, name(l.unit), UI.money(l.unit_price),
                    num(l.trade_discount), l.cost_from === 'quote' &&
                        l.quote_master ? 'Quote Master ' +
                        name(l.quote_master) : l.cost_from === 'engineering'
                        ? 'Engineering Master' : 'Part',
                    l.leadtime === null ? '' : l.leadtime, when,
                    num(l.available), l.stock_unit]};
            });
            var lines = table([{label: 'Include?'}, {label: 'Line No'},
                {label: 'Order Qty'}, {label: 'Part ID'},
                {label: 'Description'}, {label: 'Selling U/M'},
                {label: 'Unit Price', num: true}, {label: 'Disc%', num: true},
                {label: 'Create WO From'}, {label: 'Leadtime (days)'},
                {label: 'Desired Ship Date'},
                {label: 'Proj Avail (stk U/M)', num: true},
                {label: 'Stock U/M'}], rows, 'The quote has no line.');
            UI.modal('Create Sales Order from Quote', [el('div.js-sales',
                head.node, lines)], [
                {label: 'Cancel'},
                {label: 'Copy', primary: true, onclick: function () {
                    var v = head.get();
                    desk('sales_order_from_quote', [{quote: quote.id,
                        number: v.number || null, sale_date: v.sale_date,
                        shipping_date: v.shipping_date,
                        reference: v.reference, status: v.status,
                        lines: inputs.map(function (i) {
                            return {id: i.id, include: i.include.checked,
                                quantity: UI.parseMoney(i.qty.value) || 0,
                                desired_ship_date: i.when.value || null};
                        })}]).then(function (data) {
                            UI.toast('Sales order ' + (data.number ||
                                data.id) + ' made from quote ' +
                                quote.number, 'ok');
                            global.history.replaceState(null, '',
                                '#/orders/' + data.id);
                            show(data);
                        }, failed);
                }}]);
        }

        function resetPrices() {
            if (!grid) {
                return;
            }
            Promise.all(grid.controls().filter(function (c) {
                return c.part.value();
            }).map(priceFor)).then(function () {
                UI.toast('Unit prices reset from the customer', 'ok');
            });
        }

        function deleteOrder() {
            if (!order) {
                return;
            }
            UI.confirm('Delete Document', 'Delete order ' + (order.number ||
                order.id) + '? It can not be recovered.').then(function (ok) {
                if (!ok) {
                    return;
                }
                Rpc.desk('sales_order_delete', [order.id]).then(function () {
                    UI.toast('Order deleted', 'ok');
                    global.location.hash = '#/orders/new?' + Date.now();
                }, UI.showError);
            });
        }

        global.document.addEventListener('keydown', function onKey(event) {
            if (!main.isConnected) {
                global.document.removeEventListener('keydown', onKey);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() ===
                    's') {
                event.preventDefault();
                if (order ? can.save : can.create) {
                    save();
                }
            } else if (event.key === 'F5' && order) {
                event.preventDefault();
                load(order.id);
            }
        });

        if (openId) {
            load(openId);
        } else {
            newGrid([]);
            renderTaxes();
            renderDocuments();
            fillSoldTo(null);
            fillShipTo(null, null);
            updateTotals();
        }
    }

    /* ---- Shipping ---------------------------------------------------------- */

    var SHIP_STEPS = {
        waiting: [['assign_try', 'Assign Stock']],
        assigned: [['pick', 'Pick'], ['pack', 'Pack'], ['done', 'Ship']],
        picked: [['pack', 'Pack'], ['done', 'Ship']],
        packed: [['done', 'Ship']]
    };

    function shortCode(v) {
        return name(v).split(' - ')[0];
    }

    /* The Shipping window: Shipping Activity, Shipper (header, its sub-tabs
     * Shipper Lines, Sold To, Ship To, Specs, Notes, Charges, the details
     * under them), Browse */
    function classicShipping(main, params, isReturn) {
        injectCss();
        var root = main;
        var form = UI.form(main, {title: 'Shipping', extra: [
            {label: 'New View', title: 'The shipper as a document',
                onclick: function () {
                    if (!shipper) {
                        UI.toast('Double-click a shipper: it opens as a ' +
                            'document', 'ok');
                        UI.setDocView('shipper', 'modern');
                        return;
                    }
                    UI.setDocView('shipper', 'modern');
                    global.history.replaceState(null, '', '#/shipping/' +
                        shipper.id + (shipper['return'] ? '?return=1' : ''));
                    Screens.shipping(root, [shipper.id], shipper['return']);
                }}]});
        main = form.body;
        main.classList.add('js-sales');
        var shipped = false;
        var horizon = el('input', {type: 'date', 'aria-label':
            'Show Sales Orders with a Desired Ship Date On or Before'});
        var canShipOnly = el('input', {type: 'checkbox', 'aria-label':
            'Show Only Orders where \'Some Can Ship\''});
        var shipper = null;
        var can = {write: true, create: true, sale: true, returns: true};
        var screens = {orders: false};
        UI.screenAllowed('orders').then(function (ok) {
            screens.orders = ok;
        });
        var activityPane, shipperPane, browsePane;
        var linesPane, soldToPane, shipToPane, notesPane;
        /* Jobshop's SHIP_OR_RETURN: a caption beside the Ship button */
        var shipOrReturn = el('span', {style: {display: 'flex',
            alignItems: 'center', justifyContent: 'flex-end', height: '100%',
            fontWeight: '600'}}, 'Ship');
        var head = fieldGrid([
            {name: 'number', label: 'Shipper ID', type: 'char',
                readonly: true, at: [17, 4, 233, 24], split: 100},
            {name: 'sales_text', label: 'Sales Order ID', type: 'char',
                readonly: true, at: [17, 26, 233, 46], split: 100},
            {name: 'customer_code', label: 'Customer ID', type: 'char',
                readonly: true, at: [17, 48, 233, 68], split: 100},
            {name: 'effective_date', label: 'Shipped Date', type: 'date',
                at: [17, 70, 233, 90], split: 100},
            {name: 'reference', label: 'Purchase Order No', type: 'char',
                readonly: true, at: [17, 92, 233, 112], split: 100},
            {name: 'js_shipper_status', label: 'Status', type: 'selection',
                options: SHIPPER_STATUS, readonly: true,
                at: [17, 114, 233, 134], split: 100},
            {name: 'ship_or_return', label: '', type: 'char', custom: true,
                readonly: true, at: [265, 31, 415, 59], split: 0},
            {name: 'sold_to_text', label: 'Sold to', type: 'text',
                readonly: true, at: [248, 65, 418, 137], split: 165},
            {name: 'ship_to_text', label: 'Ship to', type: 'text',
                readonly: true, at: [421, 65, 591, 137], split: 165},
            {name: 'created_by', label: 'Created by', type: 'char',
                readonly: true, at: [249, 4, 549, 24], split: 97},
            {name: 'modified_by', label: 'Last Modified by', type: 'char',
                readonly: true, at: [554, 4, 840, 24], split: 96},
            {name: 'order_date', label: 'Order Date', type: 'date',
                readonly: true, at: [601, 26, 840, 46], split: 120},
            {name: 'printed_date', label: 'Invoice Printed Date',
                type: 'char', readonly: true, at: [601, 48, 840, 68],
                split: 120},
            {name: 'payment_due', label: 'Payment Due Date', type: 'date',
                readonly: true, at: [601, 70, 840, 90], split: 120},
            {name: 'invoice_id', label: 'Invoice ID', type: 'char',
                readonly: true, at: [601, 92, 840, 112], split: 120},
            {name: 'invoiced_date', label: 'Invoiced Date', type: 'date',
                readonly: true, at: [601, 114, 840, 134], split: 120}],
            {frames: [{label: '', at: [7, 4, 850, 143]}], custom: {
                ship_or_return: {node: shipOrReturn}}, buttons: [
                {label: 'Ship', at: [423, 30, 541, 60], onclick: function () {
                    if (!shipper) {
                        return;
                    }
                    if (shipper['return']) {
                        receive(shipper.id);
                    } else {
                        ship(shipper, true);
                    }
                }}]});
        var detailsGrid = fieldGrid([
            {name: 'fob_point', label: 'FOB Point ID', type: 'many2one',
                model: 'nline.fob_point', at: [12, 8, 236, 28], split: 120},
            {name: 'ship_via', label: 'Ship Via ID', type: 'many2one',
                model: 'nline.ship_via', at: [12, 30, 236, 50], split: 120},
            {name: 'js_carrier', label: 'Carrier ID', type: 'many2one',
                model: 'nline.carrier', at: [12, 52, 236, 72], split: 120},
            {name: 'js_tracking_number', label: 'Shipment Tracking No',
                type: 'char', at: [12, 74, 425, 94], split: 120},
            {name: 'shipped_by', label: 'Shipped By', type: 'char',
                readonly: true, at: [12, 96, 337, 116], split: 120},
            {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                model: 'nline.sales_tax_group', readonly: true,
                at: [442, 8, 662, 28], split: 130},
            {name: 'payment_term', label: 'Terms ID', type: 'char',
                readonly: true, at: [442, 30, 662, 50], split: 130},
            {name: 'payment_term_descr', label: 'Terms description',
                type: 'char', readonly: true, at: [664, 30, 840, 50],
                split: 0},
            {name: 'freight_terms', label: 'Freight Terms',
                type: 'selection', options: FREIGHT_TERMS,
                at: [442, 52, 662, 72], split: 130},
            {name: 'discount_class', label: 'Discount Class ID',
                type: 'many2one', model: 'nline.discount_class',
                readonly: true, at: [442, 74, 662, 94], split: 130},
            {name: 'receivable', label: 'Receivables Acct ID', type: 'char',
                readonly: true, at: [442, 96, 662, 116], split: 130},
            {name: 'receivable_descr', label: 'Receivables description',
                type: 'char', readonly: true, at: [664, 96, 840, 116],
                split: 0}],
            {frames: [{label: '', at: [8, 1, 435, 121]},
                {label: '', at: [438, 1, 854, 120]}]});
        var specs = el('textarea', {rows: 10, style: {width: '100%'},
            'aria-label': 'Specifications'});
        var charges = chargesEditor({editable: true, adding: false});
        var qtyInputs = [];

        var shipTabs = tabs(main, [
            {title: 'Shipping Activity', build: function (pane) {
                activityPane = pane;
            }},
            {title: 'Shipper', build: function (pane) {
                shipperPane = pane;
                pane.appendChild(head.node);
                var holder = el('div');
                pane.appendChild(holder);
                tabs(holder, [
                    {title: 'Shipper Lines', build: function (p) {
                        linesPane = p;
                        p.appendChild(el('p.muted', 'Double-click an order ' +
                            'on the Shipping Activity tab.'));
                    }},
                    {title: 'Sold To', build: function (p) {
                        soldToPane = p;
                    }},
                    {title: 'Ship To', build: function (p) {
                        shipToPane = p;
                    }},
                    {title: 'Specs', build: function (p) {
                        p.appendChild(specs);
                    }},
                    {title: 'Notes', build: function (p) {
                        notesPane = p;
                    }},
                    {title: 'Charges', build: function (p) {
                        p.appendChild(el('p.muted', 'The charges of the ' +
                            'order still to invoice: the applied ones go ' +
                            'on the invoice of this shipment.'));
                        p.appendChild(charges.node);
                    }}
                ]);
                pane.appendChild(el('div', {style: {marginTop: '8px'}},
                    detailsGrid.node));
            }},
            {title: 'Browse', build: function (pane) {
                browsePane = pane;
            }, onshow: function () {
                browse();
            }}
        ]);
        describe(main, [['FOB Point ID', [238, 8, 420, 28]],
            ['Ship Via ID', [238, 30, 420, 50]],
            ['Carrier ID', [238, 52, 420, 72]],
            ['Tax Group ID', [664, 8, 840, 28]],
            ['Discount Class ID', [664, 74, 840, 94]]]);
        charges.set([], false);
        head.lock(false);
        detailsGrid.lock(false);

        rights(['stock.shipment.out', 'stock.shipment.out.return',
            'sale.sale']).then(function (r) {
                can.write = r['stock.shipment.out'].write;
                can.returns = r['stock.shipment.out.return'].write;
                can.sale = r['sale.sale'].create;
                loadActivity();
                if (shipper) {
                    showShipper(shipper);
                }
            });

        function salesLines(row) {
            if (!row.sales.length) {
                return;
            }
            orderLinesDialog('Sales Order Lines - ' + row.sales[0].number,
                {sale: row.sales[0].id}, null);
        }

        function loadActivity() {
            var args = [shipped];
            if (horizon.value || canShipOnly.checked) {
                args.push(horizon.value || null, canShipOnly.checked);
            }
            desk('sales_shipping_activity', args).then(function (rows) {
                    UI.clear(activityPane);
                    var mode = el('select', {'aria-label': 'View'},
                        el('option', {value: 'unshipped'},
                            'View Unshipped Orders'),
                        el('option', {value: 'shipped'},
                            'View Shipped Orders'));
                    mode.value = shipped ? 'shipped' : 'unshipped';
                    mode.addEventListener('change', function () {
                        shipped = mode.value === 'shipped';
                        loadActivity();
                    });
                    activityPane.appendChild(el('div.toolbar',
                        el('label', 'Show Sales Orders with a Desired Ship ' +
                            'Date On or Before ', horizon),
                        el('label', canShipOnly, ' Show Only Orders where ' +
                            '\'Some Can Ship\''), mode));
                    var box = function (on) {
                        var c = el('input', {type: 'checkbox', disabled: true,
                            tabindex: -1});
                        c.checked = Boolean(on);
                        return c;
                    };
                    var orders = el('div');
                    activityPane.appendChild(el('div', {style: {display:
                        'grid', gridTemplateColumns: 'minmax(0, 1fr) ' +
                        'minmax(0, 1fr)', gap: '10px'}}, el('div', table([
                        {label: 'Some Can Ship'}, {label: 'Sales Order ID'},
                        {label: 'Shipper ID'}, {label: 'Return'},
                        {label: 'Desired Ship'}, {label: 'Carrier ID'},
                        {label: 'Customer'}, {label: 'PO Ref No'},
                        {label: 'Ship To Name'}, {label: 'Message'}],
                        rows.map(function (row) {
                            var open = function () {
                                if (modernOpen('shipper', row.id,
                                        row.model)) {
                                    return;
                                }
                                loadShipper(row.id, row.model);
                                shipTabs.show(1);
                            };
                            return {ondblclick: open, oncontextmenu:
                                function (event) {
                                    activityMenu(event, row, open);
                                }, cells: [box(row.some_can_ship),
                                    row.sales.map(function (s) {
                                        return s.number;
                                    }).join(', '), row.number,
                                    box(row['return']),
                                    UI.date(row.planned_date),
                                    row.carrier || '', clip(row.customer),
                                    row.reference, clip(row.ship_to_name),
                                    el('span' + (/late|hold/i.test(
                                        row.message) ? '.js-late' : ''),
                                        row.message)]};
                        }), shipped ? 'Nothing shipped in the last 90 days.' :
                        'Nothing to ship.', true)), orders));
                    /* GRID_ORDER: the released orders (double-click: the
                     * Sales Order window) */
                    Rpc.searchRead('sale.sale', [['js_status', '=',
                        'released']], ['number', 'party.code', 'reference',
                        'sale_date', 'js_last_shipped_date'], {limit: 300,
                        order: [['sale_date', 'DESC'], ['id', 'DESC']]})
                        .then(function (list) {
                            orders.appendChild(table([{label: 'Order ID'},
                                {label: 'Customer ID'}, {label: 'PO Ref No'},
                                {label: 'Order Date'},
                                {label: 'Last Shipped Date'}],
                                list.map(function (o) {
                                    return {ondblclick: screens.orders ?
                                        function () {
                                            openOrder(o.id, o.number);
                                        } : null, cells: [o.number ||
                                        String(o.id), (o['party.'] || {})
                                        .code || '', o.reference || '',
                                        UI.date(o.sale_date), UI.date(
                                            o.js_last_shipped_date)]};
                                }), 'No released order.', true));
                        }, function () {});
                }, failed);
        }
        horizon.addEventListener('change', loadActivity);
        canShipOnly.addEventListener('change', loadActivity);

        /* Jobshop's PopupShipping */
        function activityMenu(event, row, open) {
            var items = [];
            if (!row['return'] && row.state !== 'done' && can.write) {
                items.push({label: 'Ship', onclick: function () {
                    Rpc.desk('sales_shipper_get', [row.id, row.model]).then(
                        function (data) {
                            ship(data, true);
                        }, UI.showError);
                }});
            }
            if (row['return'] && row.state !== 'done' && can.returns) {
                items.push({label: 'Return', onclick: function () {
                    receive(row.id);
                }});
            }
            if (!row['return'] && row.state === 'done' && can.sale &&
                    row.sales.length) {
                items.push({label: 'Return', onclick: function () {
                    returnDialog(row.sales[0]);
                }});
            }
            items.push({label: 'Edit Shipper', onclick: open});
            items.push('-');
            if (screens.orders && row.sales.length) {
                items.push({label: 'Open Sales Order...', onclick:
                    function () {
                        openOrder(row.sales[0].id, row.sales[0].number);
                    }});
            }
            items.push({label: 'Sales Order Lines...', disabled:
                !row.sales.length, onclick: function () {
                    salesLines(row);
                }});
            items.push('-', {label: 'View Unshipped Orders', checked:
                !shipped, onclick: function () {
                    shipped = false;
                    loadActivity();
                }}, {label: 'View Shipped Orders', checked: shipped,
                onclick: function () {
                    shipped = true;
                    loadActivity();
                }});
            UI.contextMenu(event, items);
        }

        function loadShipper(id, model) {
            return Rpc.desk('sales_shipper_get', [id, model ||
                'stock.shipment.out']).then(showShipper, UI.showError);
        }

        function addressText(a) {
            if (!a) {
                return '';
            }
            return [a.name, a.street, [a.city, a.state, a.postal_code]
                .filter(Boolean).join(' '), a.country].filter(Boolean)
                .join('\n');
        }

        function showShipper(data) {
            shipper = data;
            var editable = can.write && !data['return'] &&
                ['draft', 'waiting', 'assigned'].indexOf(data.state) >= 0;
            head.set(Object.assign({}, data, {
                sales_text: data.sales.map(function (s) {
                    return s.number;
                }).join(', '),
                customer_code: data.customer_code || name(data.customer),
                sold_to_text: addressText(data.sold_to),
                ship_to_text: addressText(data.ship_to),
                printed_date: UI.date(data.printed_date)}));
            head.lock(editable);
            shipOrReturn.textContent = data['return'] ? 'Return' : 'Ship';
            var custInput = head.controls.customer_code.node.querySelector ?
                head.controls.customer_code.node.querySelector('input') ||
                head.controls.customer_code.node : null;
            if (custInput) {
                custInput.title = name(data.customer);
            }
            var shipButton = shipperPane.querySelector('button.js-btn');
            if (shipButton) {
                shipButton.textContent = data['return'] ? 'Return' : 'Ship';
                shipButton.hidden = data.state === 'done' ||
                    data.state === 'cancelled' || !(data['return'] ?
                        can.returns : can.write);
            }
            qtyInputs = [];
            UI.clear(linesPane);
            linesPane.appendChild(table([{label: 'Close Short'},
                {label: 'Line No'}, {label: 'SO Line No'},
                {label: 'Line Desired Ship Date'}, {label: 'Part ID'},
                {label: 'Description'},
                {label: 'Could Ship Qty (stock U/M)', num: true},
                {label: 'Ship Qty (stock U/M)', num: true},
                {label: 'Stock U/M'},
                {label: data['return'] ? 'Ship/Rtn Qty (selling U/M)' :
                    'Ship/Rtn Qty (selling U/M)', num: true},
                {label: 'Selling U/M'}, {label: 'Location'},
                {label: 'Loc Qty Avail (stock U/M)', num: true},
                {label: 'Ship Via'}, {label: 'Transacted'},
                {label: 'Tracked'}, {label: 'Lot Tracking No/Quantity'},
                {label: 'Linked'}],
                data.lines.map(function (line) {
                    var qty = el('input.js-qty', {type: 'text', value:
                        num(line.quantity), 'aria-label': 'Ship Qty'});
                    var short = el('input', {type: 'checkbox', 'aria-label':
                        'Close Short'});
                    qty.disabled = short.disabled = !editable;
                    qtyInputs.push({move: line.move, input: qty,
                        quantity: line.quantity, short: short});
                    return {cells: [short, String(line.line_no),
                        line.so_line_no === null ||
                            line.so_line_no === undefined ? '' :
                            String(line.so_line_no),
                        UI.date(line.desired_date), el('span', {title:
                            name(line.product)}, UI.shortName(
                            'product.product', name(line.product))),
                        clip(line.description),
                        num(line.could_ship === undefined ? line.available :
                            line.could_ship),
                        num(line.stock_quantity === undefined ?
                            line.quantity : line.stock_quantity),
                        line.stock_unit || line.unit, qty, line.unit,
                        line.location, num(line.available),
                        line.ship_via || '', check(line.state === 'done'),
                        check(line.tracked), line.lot || '',
                        check(line.linked)]};
                }), 'No shipper line.', true));
            if (editable) {
                linesPane.appendChild(el('p.muted', 'Ship less than the ' +
                    'quantity to back order the rest (0: the whole line); ' +
                    'tick Close Short to close the line instead.'));
            }
            var buttons = el('div.toolbar');
            if (editable) {
                buttons.appendChild(el('button', {type: 'button', onclick:
                    function () {
                        ship(data, false);
                    }}, 'Save'));
            }
            if (!data['return'] && can.write) {
                /* The step by step buttons of the desk's window */
                (SHIP_STEPS[data.state] || []).forEach(function (step) {
                    buttons.appendChild(el('button', {type: 'button',
                        onclick: function () {
                            Rpc.model('stock.shipment.out', step[0],
                                [[data.id]]).then(function () {
                                    UI.toast('Shipper ' + data.number + ': ' +
                                        step[1], 'ok');
                                    loadShipper(data.id);
                                    loadActivity();
                                }, UI.showError);
                        }}, step[1]));
                });
            }
            if (!data['return']) {
                [['stock.shipment.out.picking_list', 'Picking List'],
                    ['stock.shipment.out.delivery_note', 'Packing List']]
                    .forEach(function (r) {
                        buttons.appendChild(el('button', {type: 'button',
                            onclick: function () {
                                Rpc.report(r[0], [data.id]).then(function (x) {
                                    UI.openReport(x, r[1]);
                                }, UI.showError);
                            }}, r[1]));
                    });
            }
            if (!data['return'] && data.state === 'done' && can.sale &&
                    data.sales.length) {
                buttons.appendChild(el('button', {type: 'button', onclick:
                    function () {
                        returnDialog(data.sales[0]);
                    }}, 'Return…'));
            }
            linesPane.appendChild(buttons);
            addressPane(soldToPane, data.sold_to);
            addressPane(shipToPane, data.ship_to);
            UI.clear(notesPane);
            UI.notesTab(notesPane, data.model || 'stock.shipment.out',
                data.id, can.write);
            detailsGrid.set(Object.assign({}, data, {
                receivable: codeOf(data.receivable),
                receivable_descr: descOf(data.receivable),
                payment_term_descr: data.payment_term_descr ||
                    data.payment_term || ''}));
            detailsGrid.lock(can.write && !data['return'] &&
                data.state !== 'done' && data.state !== 'cancelled');
            specs.value = data.js_specs || '';
            specs.disabled = !(can.write && !data['return']);
            charges.set(data.charges, can.write && !data['return'] &&
                data.state !== 'done');
            UI.setTitle('Shipper :: ' + data.number);
        }

        function ship(data, doShip) {
            var values = {id: data.id, ship: doShip};
            if (shipper && shipper.id === data.id) {
                Object.assign(values, detailsGrid.get());
                ['payment_term', 'shipped_by', 'receivable', 'tax_group',
                    'discount_class'].forEach(function (n) {
                        delete values[n];
                    });
                var h = head.get();
                if (h.effective_date) {
                    values.effective_date = h.effective_date;
                }
                values.js_specs = specs.value || null;
                values.charges = charges.values().filter(function (c) {
                    return c.id;
                });
                values.lines = qtyInputs.map(function (q) {
                    return {move: q.move, quantity: q.input.value === '' ?
                        q.quantity : UI.parseMoney(q.input.value),
                        close_short: q.short.checked};
                });
            }
            UI.service('sales_ship', values).then(function (result) {
                UI.toast('Shipper ' + result.number + (doShip ? ' shipped' :
                    ' saved'), 'ok');
                showShipper(result);
                loadActivity();
                if (doShip) {
                    UI.confirm('Packing List', 'Print the Pack List for ' +
                        'shipper ' + result.number + '?').then(function (ok) {
                            if (ok) {
                                Rpc.report('stock.shipment.out.delivery_note',
                                    [result.id]).then(function (x) {
                                        UI.openReport(x, 'Packing List');
                                    }, UI.showError);
                            }
                        });
                }
            }, failed);
        }

        function receive(id) {
            Rpc.desk('sales_return_receive', [id]).then(function (data) {
                UI.toast('Return ' + data.number + ' received', 'ok');
                showShipper(data);
                shipTabs.show(1);
                loadActivity();
            }, UI.showError);
        }

        /* Marking a Sales Order for Return: the quantities to return */
        function returnDialog(sale) {
            Rpc.desk('sale_order_get', [sale.id]).then(function (order) {
                var inputs = [];
                var rows = order.lines.filter(function (l) {
                    return l.shipped_quantity > 0;
                }).map(function (l) {
                    var input = el('input.js-qty', {type: 'text', value: '0',
                        'aria-label': 'Return Qty'});
                    inputs.push({line: l.id, input: input});
                    return {cells: [String(l.line_no), l.product ?
                        l.product.rec_name : '', l.description,
                        num(l.shipped_quantity), input]};
                });
                UI.modal('Return parts of order ' + (order.number ||
                    order.id), [el('p.muted', 'Makes a return order and ' +
                    'its return shipper; receive it on the Shipping ' +
                    'Activity tab, its credit memo waits on Invoicing.'),
                    table([{label: 'Line No'}, {label: 'Part ID'},
                        {label: 'Description'}, {label: 'Shipped', num: true},
                        {label: 'Return Qty', num: true}], rows,
                        'Nothing shipped on this order.')], [
                    {label: 'Cancel'},
                    {label: 'Return', primary: true, onclick: function () {
                        var lines = inputs.map(function (i) {
                            return {line: i.line, quantity:
                                UI.parseMoney(i.input.value) || 0};
                        }).filter(function (l) {
                            return l.quantity > 0;
                        });
                        Rpc.desk('sales_return', [{sale: order.id, lines:
                            lines}]).then(function (result) {
                                UI.toast('Return order ' + result.sale.number +
                                    ' made', 'ok');
                                shipped = false;
                                loadActivity();
                                shipTabs.show(0);
                            }, UI.showError);
                    }}]);
            }, UI.showError);
        }

        function browse() {
            var search = el('input', {type: 'text', placeholder:
                'Search', 'aria-label': 'Search'});
            var holder = el('div');
            function run() {
                desk('sales_shipper_browse', [search.value.trim() || null])
                    .then(function (rows) {
                        UI.clear(holder).appendChild(table([
                            {label: 'Shipper ID'}, {label: 'Sales Order ID'},
                            {label: 'Customer Name'},
                            {label: 'Shipper Status'},
                            {label: 'Shipper Type'}], rows.map(function (r) {
                                return {ondblclick: function () {
                                    if (modernOpen('shipper', r.id,
                                            r.model)) {
                                        return;
                                    }
                                    loadShipper(r.id, r.model);
                                    shipTabs.show(1);
                                }, cells: [r.number, r.sales, r.customer,
                                    label(SHIPPER_STATUS, r.status),
                                    r.type]};
                            }), 'No shipper.'));
                    }, failed);
            }
            var timer;
            search.addEventListener('input', function () {
                global.clearTimeout(timer);
                timer = global.setTimeout(run, 250);
            });
            UI.clear(browsePane).appendChild(el('div.toolbar', el('div',
                {style: {width: '320px'}}, search)));
            browsePane.appendChild(holder);
            run();
        }

        global.document.addEventListener('keydown', function onKey(event) {
            if (!main.isConnected) {
                global.document.removeEventListener('keydown', onKey);
                return;
            }
            if (event.key === 'F5') {
                event.preventDefault();
                loadActivity();
                if (shipper) {
                    loadShipper(shipper.id, shipper.model);
                }
            }
        });

        if (params && params[0]) {
            loadShipper(parseInt(params[0], 10), isReturn ?
                'stock.shipment.out.return' : null).then(function () {
                shipTabs.show(1);
            });
        }
    }

    /* ---- Invoicing ------------------------------------------------------------ */

    /* The Invoicing window: Invoicing Activity, Invoice (header, sub-tabs
     * Invoice Lines, Bill To, Ship To, Specs, Notes, Charges, Taxes, the
     * details and totals under them), Browse */
    function classicInvoicing(main, params) {
        injectCss();
        var root = main;
        var form = UI.form(main, {title: 'Invoicing', extra: [
            {label: 'New View', title: 'The invoice as a document',
                onclick: function () {
                    UI.setDocView('invoice', 'modern');
                    if (!invoice) {
                        UI.toast('Double-click an invoice: it opens as a ' +
                            'document', 'ok');
                        return;
                    }
                    global.history.replaceState(null, '', '#/invoicing/' +
                        invoice.id);
                    Screens.invoicing(root, [invoice.id]);
                }},
            {label: 'Post Selected', title: 'Tools > Invoicing > Invoice: ' +
                'post and print the ticked invoices', onclick: function () {
                    postSelected();
                }},
            {label: 'Set Shipper Line Unit Price', title: 'N-Line: the ' +
                'shipped lines waiting without a unit price', onclick:
                function () {
                    unpricedDialog();
                }}]});
        main = form.body;
        main.classList.add('js-sales');
        var invoice = null;
        var activity = [];
        var can = {write: true, create: true};
        var screens = {orders: false};
        UI.screenAllowed('orders').then(function (ok) {
            screens.orders = ok;
        });
        var activityPane, browsePane, linesPane, billToPane, shipToPane,
            taxesPane, notesPane, buttonsPane;
        var finder = UI.picker('account.invoice', {label: 'Invoice ID',
            placeholder: 'Invoice ID', domain: [['type', '=', 'out']],
            onselect: function (r) {
                loadInvoice(r.id);
            }});
        var reference = el('input', {type: 'text', 'aria-label':
            'Purchase Order No'});
        /* Jobshop's lblType: a caption beside the Invoice button */
        var typeLabel = el('span', {style: {display: 'flex',
            alignItems: 'center', justifyContent: 'flex-end', height: '100%',
            fontWeight: '600'}});
        var head = fieldGrid([
            {name: 'invoice_finder', label: 'Invoice ID', custom: true,
                at: [17, 4, 250, 24], split: 100},
            {name: 'shipper_text', label: 'Shipper ID', type: 'char',
                readonly: true, at: [17, 26, 233, 46], split: 100},
            {name: 'sales_text', label: 'Sales Order ID', type: 'char',
                readonly: true, at: [17, 48, 233, 68], split: 100},
            {name: 'customer_code', label: 'Customer ID', type: 'char',
                readonly: true, at: [17, 70, 233, 90], split: 100},
            {name: 'shipped_text', label: 'Shipped Date', type: 'char',
                readonly: true, at: [17, 92, 233, 112], split: 100},
            {name: 'reference', label: 'Purchase Order No', custom: true,
                at: [17, 114, 233, 134], split: 100},
            {name: 'js_shipper_status', label: 'Status', type: 'selection',
                options: SHIPPER_STATUS, readonly: true,
                at: [17, 136, 233, 156], split: 100},
            {name: 'type_text', label: '', type: 'char', custom: true,
                at: [257, 35, 417, 59], split: 0},
            {name: 'bill_to_text', label: 'Bill to', type: 'text',
                readonly: true, at: [251, 67, 412, 155], split: 143},
            {name: 'ship_to_text', label: 'Ship to', type: 'text',
                readonly: true, at: [422, 67, 583, 155], split: 139},
            {name: 'created_by', label: 'Created by', type: 'char',
                readonly: true, at: [261, 4, 563, 24], split: 97},
            {name: 'modified_by', label: 'Last Modified by', type: 'char',
                readonly: true, at: [571, 4, 839, 24], split: 90},
            {name: 'payment_due', label: 'Payment Due Date', type: 'date',
                readonly: true, at: [600, 26, 840, 46], split: 120},
            {name: 'order_date', label: 'Order Date', type: 'date',
                readonly: true, at: [600, 48, 840, 68], split: 120},
            {name: 'js_printed_date', label: 'Invoice Printed Date',
                type: 'date', readonly: true, at: [600, 70, 840, 90],
                split: 120},
            {name: 'invoice_date', label: 'Invoiced Date', type: 'date',
                at: [600, 92, 840, 112], split: 120},
            /* Exported: posted to the accounting (QuickBooks emulation) */
            {name: 'exported', label: 'Exported', type: 'boolean',
                readonly: true, at: [600, 114, 679, 134]},
            {name: 'exported_date', label: 'Date', type: 'date',
                readonly: true, at: [686, 114, 840, 134], split: 33},
            {name: 'paid_amount', label: 'Paid Amount', type: 'money',
                readonly: true, at: [600, 136, 787, 156], split: 80},
            {name: 'paid', label: 'Paid', type: 'boolean', readonly: true,
                at: [791, 136, 840, 156]}],
            {frames: [{label: '', at: [7, 4, 852, 159]}], buttons: [
                {label: 'Invoice', at: [422, 31, 564, 62], onclick:
                    function () {
                        if (invoice && invoice.state === 'draft' &&
                                can.write) {
                            saveInvoice().then(function () {
                                post([invoice.id]);
                            });
                        } else if (invoice) {
                            printInvoice(invoice.id);
                        }
                    }}],
                custom: {invoice_finder: {node: finder.node},
                    reference: {node: reference},
                    type_text: {node: typeLabel}}});
        var details = fieldGrid([
            {name: 'fob_point', label: 'FOB Point ID', type: 'many2one',
                model: 'nline.fob_point', readonly: true,
                at: [16, 8, 232, 28], split: 100},
            {name: 'ship_via', label: 'Ship Via ID', type: 'many2one',
                model: 'nline.ship_via', readonly: true,
                at: [16, 30, 232, 50], split: 100},
            {name: 'js_carrier', label: 'Carrier ID', type: 'many2one',
                model: 'nline.carrier', readonly: true,
                at: [16, 52, 232, 72], split: 100},
            {name: 'freight_terms', label: 'Freight Terms',
                type: 'selection', options: FREIGHT_TERMS, readonly: true,
                at: [16, 74, 232, 94], split: 100},
            {name: 'tax_group', label: 'Tax Group ID', type: 'many2one',
                model: 'nline.sales_tax_group', readonly: true,
                at: [436, 8, 668, 28], split: 130},
            {name: 'payment_term', label: 'Terms ID', type: 'many2one',
                model: 'account.invoice.payment_term',
                at: [436, 30, 668, 50], split: 130},
            {name: 'payment_term_descr', label: 'Terms description',
                type: 'char', readonly: true, at: [670, 30, 839, 50],
                split: 0},
            {name: 'discount_class', label: 'Discount Class ID',
                type: 'many2one', model: 'nline.discount_class',
                readonly: true, at: [436, 52, 668, 72], split: 130},
            {name: 'receivable', label: 'Receivables Acct ID', type: 'char',
                readonly: true, at: [436, 74, 668, 94], split: 130},
            {name: 'receivable_descr', label: 'Receivables description',
                type: 'char', readonly: true, at: [670, 74, 839, 94],
                split: 0},
            {name: 'lines_total', label: 'Lines', type: 'char',
                readonly: true, at: [687, 98, 852, 118], split: 53},
            {name: 'charges_total', label: 'Charges', type: 'char',
                readonly: true, at: [687, 120, 852, 140], split: 53},
            {name: 'tax_total', label: 'Tax', type: 'char',
                readonly: true, at: [687, 142, 852, 162], split: 53},
            {name: 'total', label: 'Total', type: 'char',
                readonly: true, at: [687, 164, 852, 184], split: 53}],
            {frames: [{label: '', at: [6, 2, 424, 98]},
                {label: '', at: [432, 2, 852, 97]}]});
        var specs = el('textarea', {rows: 10, style: {width: '100%'},
            'aria-label': 'Specifications'});
        var charges = chargesEditor({editable: true, invoiceEdit: true});
        var lineInputs = [];

        var invoiceTabs = tabs(main, [
            {title: 'Invoicing Activity', build: function (pane) {
                activityPane = pane;
            }},
            {title: 'Invoice', build: function (pane) {
                pane.appendChild(head.node);
                var holder = el('div');
                pane.appendChild(holder);
                tabs(holder, [
                    {title: 'Invoice Lines', build: function (p) {
                        linesPane = p;
                        p.appendChild(el('p.muted', 'Double-click an ' +
                            'invoice on the Invoicing Activity tab, or ' +
                            'find one.'));
                    }},
                    {title: 'Bill To', build: function (p) {
                        billToPane = p;
                    }},
                    {title: 'Ship To', build: function (p) {
                        shipToPane = p;
                    }},
                    {title: 'Specs', build: function (p) {
                        p.appendChild(specs);
                    }},
                    {title: 'Notes', build: function (p) {
                        notesPane = p;
                    }},
                    {title: 'Charges', build: function (p) {
                        p.appendChild(charges.node);
                    }},
                    {title: 'Taxes', build: function (p) {
                        taxesPane = p;
                    }}
                ]);
                buttonsPane = el('div.toolbar');
                pane.appendChild(buttonsPane);
                pane.appendChild(el('div', {style: {marginTop: '8px'}},
                    details.node));
            }},
            {title: 'Browse', build: function (pane) {
                browsePane = pane;
            }, onshow: function () {
                browse();
            }}
        ]);
        describe(main, [['FOB Point ID', [234, 8, 412, 28]],
            ['Ship Via ID', [234, 30, 412, 50]],
            ['Carrier ID', [234, 52, 412, 72]],
            ['Tax Group ID', [670, 8, 839, 28]],
            ['Discount Class ID', [670, 52, 839, 72]]]);
        charges.set([], false);
        head.lock(false);
        details.lock(false);

        rights(['account.invoice']).then(function (r) {
            can.write = r['account.invoice'].write;
            can.create = r['account.invoice'].create;
            form.allow(true, can.write ? [] : ['Post Selected',
                'Set Shipper Line Unit Price']);
            loadActivity();
            if (invoice) {
                showInvoice(invoice);
            }
        });

        /* Jobshop's PopupInvoicing */
        function activityMenu(event, row, open) {
            UI.contextMenu(event, [
                {label: 'Invoice', disabled: !can.write, onclick:
                    function () {
                        post([row.id]);
                    }},
                {label: 'Edit Invoice', onclick: open},
                '-',
                {label: 'Open Sales Order...', disabled: !screens.orders ||
                    !row.sales.length, onclick: function () {
                        openOrder(row.sales[0].id, row.sales[0].number);
                    }},
                {label: 'Set Shipper Line Unit Price...', disabled:
                    !can.write, onclick: unpricedDialog}]);
        }

        function loadActivity() {
            Rpc.desk('sales_invoicing_activity', []).then(function (rows) {
                activity = rows;
                UI.clear(activityPane);
                activityPane.appendChild(el('p.muted', 'The invoices of ' +
                    'shipped orders and the credit memos of returns wait ' +
                    'here: tick and Post Selected, or right-click.'));
                activityPane.appendChild(table([{label: ''},
                    {label: 'Shipper ID'}, {label: 'Order ID'},
                    {label: 'Name'}, {label: 'Shipped Date'},
                    {label: 'Shipped Amount', num: true},
                    {label: 'Shipper Type'}], rows.map(function (row) {
                        row.box = el('input', {type: 'checkbox',
                            'aria-label': 'Post'});
                        row.box.hidden = !can.write;
                        var open = function () {
                            if (modernOpen('invoice', row.id)) {
                                return;
                            }
                            loadInvoice(row.id);
                            invoiceTabs.show(1);
                        };
                        return {ondblclick: open, oncontextmenu: function (e) {
                            activityMenu(e, row, open);
                        }, cells: [row.box, row.shippers.map(function (s) {
                            return s.number;
                        }).join(', '), row.sales.map(function (s) {
                            return s.number;
                        }).join(', '), row.party,
                            row.shippers.map(function (s) {
                                return UI.date(s.date);
                            }).join(', '), UI.money(row.total_amount),
                            row.type]};
                    }), 'No invoice waiting.'));
            }, UI.showError);
        }

        function loadInvoice(id) {
            return Rpc.desk('sales_invoice_get', [id]).then(showInvoice,
                UI.showError);
        }

        function addressText(a) {
            if (!a) {
                return '';
            }
            return [a.name, a.street, [a.city, a.state, a.postal_code]
                .filter(Boolean).join(' '), a.country].filter(Boolean)
                .join('\n');
        }

        /* Printed: Jobshop's Invoice Printed Date */
        function markPrinted(ids) {
            Rpc.desk('sales_invoice_printed', [ids]).then(function () {
                if (invoice && ids.indexOf(invoice.id) >= 0) {
                    head.controls.js_printed_date.set(UI.today());
                }
            }, function () {});
        }

        function printInvoice(id) {
            Rpc.report('account.invoice', [id]).then(function (r) {
                UI.openReport(r, 'Invoice');
                markPrinted([id]);
            }, UI.showError);
        }

        function showInvoice(data) {
            invoice = data;
            var draft = data.state === 'draft' && can.write;
            finder.set(data.id, data.number || '(draft)');
            reference.value = data.reference || '';
            reference.disabled = !draft;
            head.set(Object.assign({}, data, {
                shipper_text: data.shippers.map(function (s) {
                    return s.number;
                }).join(', '),
                sales_text: data.sales.map(function (s) {
                    return s.number;
                }).join(', '),
                customer_code: data.customer_code || name(data.party),
                shipped_text: data.shippers.map(function (s) {
                    return UI.date(s.date);
                }).join(', '),
                js_shipper_status: data.js_shipper_status ||
                    (data.state === 'draft' ? 'unapproved' : 'approved'),
                bill_to_text: addressText(data.bill_to),
                ship_to_text: addressText(data.ship_to)}));
            head.lock(draft);
            typeLabel.textContent = data.type || '';
            var custInput = main.querySelector(
                'input[aria-label="Customer ID"]');
            if (custInput) {
                custInput.title = name(data.party);
            }
            /* Jobshop's SHIPPER_LINE grid of the Invoicing window: the
             * quantities and prices come from the shipper (read-only; Set
             * Shipper Line Unit Price prices the unpriced lines) */
            lineInputs = [];
            UI.clear(linesPane);
            linesPane.appendChild(table([{label: 'Line No'},
                {label: 'PO Line No'}, {label: 'Part ID'},
                {label: 'Description'},
                {label: 'Ship Qty (stock U/M)', num: true},
                {label: 'Stock U/M'}, {label: 'Selling U/M'},
                {label: 'Unit Price', num: true},
                {label: 'Trade Disc%', num: true},
                {label: 'Shipped Amount', num: true},
                {label: 'Applied Billed Amount', num: true},
                {label: 'Extension', num: true}, {label: 'Transacted'}],
                data.lines.map(function (line) {
                    return {cells: [String(line.line_no), line.po_line || '',
                        el('span', {title: name(line.product)},
                            UI.shortName('product.product',
                                name(line.product))),
                        clip(line.description), num(line.stock_quantity ===
                            undefined ? line.quantity : line.stock_quantity),
                        line.stock_unit || line.unit, line.unit,
                        UI.money(line.unit_price), num(line.trade_discount),
                        UI.money(line.amount), UI.money(0),
                        UI.money(line.amount), check(line.transacted)]};
                }), 'No invoice line.', true));
            UI.clear(buttonsPane);
            if (draft) {
                buttonsPane.appendChild(el('button', {type: 'button',
                    onclick: saveInvoice}, 'Save'));
            }
            buttonsPane.appendChild(el('button', {type: 'button', onclick:
                function () {
                    printInvoice(data.id);
                }}, 'Print'));
            if (data.state !== 'draft' && data.state !== 'cancelled' &&
                    can.create) {
                buttonsPane.appendChild(el('button', {type: 'button',
                    onclick: function () {
                        UI.confirm('Credit Memo', 'Issue a credit memo for ' +
                            'invoice ' + data.number + '?').then(
                            function (ok) {
                                if (!ok) {
                                    return;
                                }
                                Rpc.desk('sales_credit_memo', [data.id]).then(
                                    function (memo) {
                                        UI.toast('Credit memo made: check ' +
                                            'and post it', 'ok');
                                        showInvoice(memo);
                                        loadActivity();
                                    }, UI.showError);
                            });
                    }}, 'Credit Memo'));
            }
            addressPane(billToPane, data.bill_to, null, data.customer_mobile);
            addressPane(shipToPane, data.ship_to);
            UI.clear(notesPane);
            UI.notesTab(notesPane, 'account.invoice', data.id, can.write);
            details.set(Object.assign({}, data, {
                receivable: codeOf(data.receivable),
                receivable_descr: descOf(data.receivable),
                payment_term_descr: data.payment_term_descr ||
                    name(data.payment_term),
                lines_total: UI.money(data.untaxed_amount -
                    data.charges_amount),
                charges_total: UI.money(data.charges_amount),
                tax_total: UI.money(data.tax_amount),
                total: UI.money(data.total_amount)}));
            details.lock(draft);
            specs.value = data.comment || '';
            specs.disabled = !draft;
            charges.set(data.charges, draft);
            UI.clear(taxesPane).appendChild(table([{label: 'Tax Group ID'},
                {label: 'Tax Name'}, {label: 'Description'},
                {label: 'Account ID'}, {label: 'Tax Percent', num: true},
                {label: 'Tax Amount', num: true},
                {label: 'Taxable', num: true}], data.taxes.map(function (t) {
                    return {cells: [name(data.tax_group).split(' - ')[0],
                        t.description, t.description, t.account,
                        num(t.percent), UI.money(t.amount),
                        UI.money(t.base)]};
                }), 'No tax.'));
            UI.setTitle('Invoice :: ' + (data.number || data.id));
        }

        function saveInvoice() {
            if (!invoice) {
                return Promise.resolve();
            }
            var d = details.get();
            var h = head.get();
            return UI.service('sales_invoice_save', {id: invoice.id,
                invoice_date: h.invoice_date, payment_term: d.payment_term,
                reference: reference.value || null,
                comment: specs.value || null,
                lines: lineInputs.map(function (l) {
                    return {id: l.id, quantity: UI.parseMoney(l.qty.value),
                        unit_price: String(UI.parseMoney(l.price.value))};
                }),
                charges: charges.values()}).then(function (data) {
                    UI.toast('Invoice saved', 'ok');
                    showInvoice(data);
                    loadActivity();
                    return data;
                }, function (error) {
                    failed(error);
                    throw error;
                });
        }

        function post(ids) {
            Rpc.model('account.invoice', 'post', [ids]).then(function () {
                UI.toast(ids.length + ' invoice(s) posted', 'ok');
                Rpc.report('account.invoice', ids).then(function (r) {
                    UI.openReport(r, 'Invoices');
                    markPrinted(ids);
                }, function () {});
                loadActivity();
                if (invoice && ids.indexOf(invoice.id) >= 0) {
                    loadInvoice(invoice.id);
                }
            }, UI.showError);
        }

        function postSelected() {
            var ids = activity.filter(function (r) {
                return r.box && r.box.checked;
            }).map(function (r) {
                return r.id;
            });
            if (!ids.length) {
                UI.toast('Tick the invoices to post.', 'ok');
                return;
            }
            post(ids);
        }

        /* N-Line's Set Shipper Line Unit Price window */
        function unpricedDialog() {
            desk('sales_unpriced_lines', []).then(function (rows) {
                var inputs = [];
                var cells = rows.map(function (r) {
                    var price = UI.moneyInput({'aria-label': 'Unit Price'});
                    price.value = UI.money(r.unit_price);
                    price.disabled = !can.write;
                    inputs.push({id: r.id, input: price});
                    return {cells: [UI.date(r.shipped_date), r.customer,
                        r.sale.number, r.sales_line_no, r.shipper,
                        r.line_no, r.reference, r.po_line, num(r.quantity),
                        price]};
                });
                UI.modal('Set Shipper Line Unit Price', [el('div.js-sales',
                    table([{label: 'Shipped Date'}, {label: 'Customer ID'},
                        {label: 'Sales ID'}, {label: 'Sales Line No'},
                        {label: 'Shipper ID'}, {label: 'Line No'},
                        {label: 'Customer PO'},
                        {label: 'Customer PO Line No'},
                        {label: 'Shipped Qty', num: true},
                        {label: 'Unit Price', num: true}], cells,
                        'No shipped line without a price.'))],
                    can.write && rows.length ? [{label: 'Cancel'},
                        {label: 'Save', primary: true, onclick: function () {
                            desk('sales_unpriced_save', [inputs.filter(
                                function (i) {
                                    return i.input.value !== '';
                                }).map(function (i) {
                                    return {id: i.id, unit_price: String(
                                        UI.parseMoney(i.input.value))};
                                })]).then(function (n) {
                                    UI.toast(n + ' line(s) priced', 'ok');
                                    loadActivity();
                                    if (invoice) {
                                        loadInvoice(invoice.id);
                                    }
                                }, failed);
                        }}] : [{label: 'Close', primary: true}]);
            }, failed);
        }

        function browse() {
            var search = el('input', {type: 'text', placeholder: 'Search',
                'aria-label': 'Search'});
            var holder = el('div');
            function run() {
                desk('sales_invoice_browse', [search.value.trim() || null])
                    .then(function (rows) {
                        UI.clear(holder).appendChild(table([
                            {label: 'Invoice ID'}, {label: 'Shipper ID'},
                            {label: 'Sales Order ID'},
                            {label: 'Customer Name'},
                            {label: 'Shipper Status'},
                            {label: 'Shipper Type'}, {label: 'Posted'}],
                            rows.map(function (r) {
                                return {ondblclick: function () {
                                    if (modernOpen('invoice', r.id)) {
                                        return;
                                    }
                                    loadInvoice(r.id);
                                    invoiceTabs.show(1);
                                }, cells: [r.number, r.shippers.map(
                                    function (s) {
                                        return s.number;
                                    }).join(', '), r.sales.map(function (s) {
                                        return s.number;
                                    }).join(', '), r.party, label(
                                    SHIPPER_STATUS, r.status), r.type,
                                    r.posted ? '✔' : '']};
                            }), 'No invoice.'));
                    }, failed);
            }
            var timer;
            search.addEventListener('input', function () {
                global.clearTimeout(timer);
                timer = global.setTimeout(run, 250);
            });
            UI.clear(browsePane).appendChild(el('div.toolbar', el('div',
                {style: {width: '320px'}}, search)));
            browsePane.appendChild(holder);
            run();
        }

        global.document.addEventListener('keydown', function onKey(event) {
            if (!main.isConnected) {
                global.document.removeEventListener('keydown', onKey);
                return;
            }
            if (event.key === 'F5') {
                event.preventDefault();
                loadActivity();
                if (invoice) {
                    loadInvoice(invoice.id);
                }
            } else if ((event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === 's' && invoice &&
                    invoice.state === 'draft' && can.write) {
                event.preventDefault();
                saveInvoice();
            }
        });

        if (params && params[0]) {
            loadInvoice(parseInt(params[0], 10)).then(function () {
                invoiceTabs.show(1);
            });
        }
    }

    /* ==== The modern document pages (UI.docPage, owner's design of 29 Oct
     * 2026): the answers first, the fields second. Each window keeps its
     * Jobshop (classic) view: More > Classic view; the classic ribbon's
     * New View comes back. ================================================ */

    function money(v) {
        var n = Number(v) || 0;
        return (n < 0 ? '-$' : '$') + UI.money(Math.abs(n));
    }

    function amountOf(v) {
        var n = Number(v);
        return isNaN(n) ? 0 : n;
    }

    /* A code with its full name in the tooltip (the owner's ID rule) */
    function idSpan(v) {
        return v && name(v) ? el('span', {title: name(v)}, codeOf(v)) : null;
    }

    /* The sub-line's due date: amber today, red when late */
    function dueSub(word, date, open) {
        var day = iso(date);
        if (!day) {
            return null;
        }
        var t = UI.today();
        var late = open && day < t;
        var isToday = open && day === t;
        return {text: word + (late ? ' ' : isToday ? ' today, ' : ' by ') +
            UI.date(day) + (late ? ', late' : ''), tone: late ? 'bad' :
            isToday ? 'warn' : null, icon: 'clock'};
    }

    /* A page's single keys only while it is the page shown (the shell's
     * #main is reused by every screen and view; token.root = the page) */
    function pageKeys(main, token, keys) {
        var out = {};
        Object.keys(keys).forEach(function (k) {
            out[k] = {label: keys[k].label, run: function (d, page) {
                if (main._salesPage === token && token.root &&
                        token.root.isConnected) {
                    keys[k].run(d, page);
                }
            }};
        });
        return out;
    }

    function startPage(main) {
        UI.clear(main);
        main.classList.remove('dp-main');
        main.classList.remove('js-sales');
        var token = {};
        main._salesPage = token;
        return token;
    }

    function queryParam(key) {
        var query = global.location.hash.split('?')[1] || '';
        var m = new RegExp('(?:^|&)' + key + '=([^&]*)').exec(query);
        return m ? decodeURIComponent(m[1]) : null;
    }

    function notesDialog(model, id, title, editable) {
        var pane = el('div', {style: {minWidth: '480px'}});
        UI.notesTab(pane, model, id, editable);
        UI.modal('Notes: ' + title, [pane], [{label: 'Close',
            primary: true}]);
    }

    /* The ID chip of a line: its full name in the tooltip (docLines draws
     * the chips; the first chip of each row is the part) */
    function chipTooltips(pane, items, nameOf) {
        var rows = pane.querySelectorAll('.dp-line');
        items.forEach(function (item, i) {
            var full = nameOf(item);
            var first = rows[i] && rows[i].querySelector('.dp-line-chips ' +
                '.dp-chip');
            if (full && first) {
                first.title = full;
            }
        });
    }

    /* A line's text without the part's [ID] in front (its chip has it) */
    function plainTitle(text) {
        return String(text || '').replace(/^\[[^\]]*\]\s*/, '');
    }

    function addressLine(p) {
        return [p.addr_1, p.addr_2, [p.city, p.state, p.postal]
            .filter(Boolean).join(' '), p.country].filter(Boolean)
            .join(', ');
    }

    function addressRows(p) {
        return [['Name', p.name], ['Address', addressLine(p)],
            ['Contact', [p.contact, p.title].filter(Boolean).join(', ')],
            ['Phone', p.phone], ['E-mail', p.email]];
    }

    /* Opens a shipper / invoice of the activity lists as its modern page
     * when that is the window's view */
    function modernOpen(view, id, model) {
        if (!UI.docPage || UI.docView(view) !== 'modern') {
            return false;
        }
        global.location.hash = view === 'shipper' ? '#/shipping/' + id +
            (model === 'stock.shipment.out.return' ? '?return=1' : '') :
            '#/invoicing/' + id;
        return true;
    }

    /* ---- Customer Order Entry, modern ------------------------------------ */

    var SO_STATUS_TONE = {firm: 'accent', released: 'accent', closed: 'ok',
        hold: 'warn', cancelled: 'bad'};
    var HEADER_REFS = ['sales_rep', 'territory', 'fob_point', 'ship_via',
        'js_carrier', 'tax_group', 'discount_class'];

    function soAllowedNext(d) {
        return {
            unreleased: ['firm', 'released', 'hold', 'cancelled'],
            firm: ['unreleased', 'released', 'hold', 'cancelled'],
            released: ['hold', 'closed'],
            hold: d.state === 'draft' ? ['unreleased', 'firm', 'released',
                'cancelled'] : d.state === 'quotation' ? ['firm', 'released',
                    'cancelled'] : ['released', 'closed'],
            closed: d.state === 'done' ? [] : ['released'],
            cancelled: ['unreleased']
        }[d.js_status] || [];
    }

    function storedParts(d, prefix) {
        return ADDRESS_PARTS.some(function (k) {
            return d[prefix + k];
        });
    }

    function soSoldParts(d) {
        return storedParts(d, 'js_sold_') ? unprefixed('js_sold_', d) :
            addressParts(d.sold_to, d.customer_mobile);
    }

    function soShipParts(d) {
        if (storedParts(d, 'js_ship_')) {
            return unprefixed('js_ship_', d);
        }
        return d.shipment_address && d.ship_to && d.ship_to.id ?
            addressParts(d.ship_to) : soSoldParts(d);
    }

    /* A line as sale_order_save takes it (the desk's fields and the
     * Jobshop ones, written by position on a draft order) */
    function soLine(l) {
        var refs = {};
        ['product_code', 'commodity_code', 'line_tax_group',
            'js_ship_via'].forEach(function (n) {
                refs[n] = idOf(l[n]);
            });
        return Object.assign(refs, {
            id: l.id || null,
            product: idOf(l.product),
            unit: idOf(l.unit) || undefined,
            description: l.description || null,
            quantity: amountOf(l.quantity) || 1,
            gross_unit_price: l.gross_unit_price === null ||
                l.gross_unit_price === undefined || l.gross_unit_price ===
                '' ? null : String(l.gross_unit_price),
            trade_discount: String(amountOf(l.trade_discount)),
            customer_part: l.customer_part || null,
            customer_po_line: l.customer_po_line || null,
            js_desired_date: iso(l.js_desired_date),
            promise_date: iso(l.promise_date),
            drawing_id: l.drawing_id || null,
            drawing_rev: l.drawing_rev || null,
            commissionable: l.commissionable !== false,
            commission_percent: l.commission_percent === null ||
                l.commission_percent === undefined ||
                l.commission_percent === '' ? null :
                String(l.commission_percent),
            js_line_specs: l.js_line_specs || null,
            user_0: l.user_0 || null,
            user_1: l.user_1 || null,
            user_2: l.user_2 || null
        });
    }

    function soModern(main, openId, presetCustomer) {
        var token = startPage(main);
        var can = {save: true, create: true, del: true, workOrder: true,
            charges: true};
        var screens = {shipping: false, invoicing: false, workorders: false,
            parts: false, 'customer-window': false, quotes: false};
        var page;
        rights(['sale.sale', 'sale.line', 'nline.sale_charge', 'production'])
            .then(function (r) {
                can.save = r['sale.sale'].write && r['sale.line'].create;
                can.create = r['sale.sale'].create;
                can.del = r['sale.sale']['delete'];
                can.workOrder = r.production.create;
                can.charges = r['nline.sale_charge'].write &&
                    r['nline.sale_charge'].create;
                if (page) {
                    page.render();
                }
            }, function () {});
        Object.keys(screens).forEach(function (s) {
            UI.screenAllowed(s).then(function (ok) {
                screens[s] = ok;
                if (page && ok) {
                    page.render();
                }
            });
        });

        function draft(d) {
            return !d.id || d.state === 'draft';
        }

        function writable(d) {
            return d.id ? can.save : can.create;
        }

        function noPrice(l) {
            return !amountOf(l.gross_unit_price) && !amountOf(l.unit_price) &&
                ['closed', 'cancelled'].indexOf(l.js_line_status) < 0;
        }

        function lineOpen(l) {
            return (l.js_line_status || 'open') === 'open' &&
                amountOf(l.shipped_quantity) < amountOf(l.quantity);
        }

        function openShipper(d) {
            return (d.shippers || []).filter(function (s) {
                return s.model === 'stock.shipment.out' &&
                    ['done', 'cancelled'].indexOf(s.state) < 0;
            })[0] || null;
        }

        function invoicesOf(d) {
            var seen = {};
            var out = [];
            (d.shippers || []).forEach(function (s) {
                var inv = s.invoice;
                if (inv && !seen[inv.id]) {
                    seen[inv.id] = true;
                    out.push({id: inv.id, number: inv.number ||
                        s.invoice_number || '', date: s.invoiced_date,
                        posted: s.model === 'account.invoice' ?
                            s.status === 'approved' : Boolean(inv.number),
                        amount: s.invoiced_amount});
                }
            });
            return out;
        }

        /* The payload of sale_order_save: the whole order (it writes every
         * header field it gets); a released order sends its changed lines */
        function values(d) {
            var v = {id: d.id || null, number: d.number || null,
                party: idOf(d.party), sale_date: iso(d.sale_date),
                shipping_date: iso(d.shipping_date),
                promise_date: iso(d.promise_date),
                reference: d.reference || null,
                description: d.description || null,
                payment_term: idOf(d.payment_term_ref) || (typeof
                    d.payment_term === 'number' ? d.payment_term : null),
                shipment_address: idOf(d.shipment_address),
                freight_terms: d.freight_terms || null,
                js_specs: d.js_specs || null,
                js_copy_notes: Boolean(d.js_copy_notes)};
            HEADER_REFS.forEach(function (n) {
                v[n] = idOf(d[n]);
            });
            ADDRESS_PARTS.forEach(function (k) {
                v['js_sold_' + k] = d['js_sold_' + k] || '';
                v['js_ship_' + k] = d['js_ship_' + k] || '';
            });
            if (can.charges) {
                v.charges = (d.charges || []).map(function (c) {
                    return {id: c.id || null, service_charge:
                        idOf(c.service_charge), description: c.description ||
                        '', amount: c.amount === null || c.amount ===
                        undefined ? null : String(c.amount), tax_group:
                        idOf(c.tax_group), apply: Boolean(c.apply),
                        account: idOf(c.account)};
                });
            }
            var lines = d.lines || [];
            v.lines = (draft(d) ? lines : lines.filter(function (l) {
                return l.changed;
            })).map(soLine);
            return v;
        }

        /* A new ship to address chosen: the order's Ship To becomes it */
        function shipToAddress(v, d) {
            if (!v.shipment_address || v.shipment_address ===
                    idOf(d.shipment_address)) {
                return Promise.resolve();
            }
            return Rpc.model('party.address', 'read', [[v.shipment_address],
                ['party_name', 'street', 'city', 'postal_code',
                    'subdivision.rec_name', 'country.rec_name',
                    'ship_to_contact', 'ship_to_title', 'ship_to_phone',
                    'ship_to_fax', 'ship_to_email']]).then(function (rows) {
                    var a = rows[0] || {};
                    Object.assign(v, prefixed('js_ship_', addressParts({
                        name: a.party_name, street: a.street, city: a.city,
                        postal_code: a.postal_code, state:
                            (a['subdivision.'] || {}).rec_name, country:
                            (a['country.'] || {}).rec_name, contact:
                            a.ship_to_contact, title: a.ship_to_title,
                        phone: a.ship_to_phone, fax: a.ship_to_fax,
                        email: a.ship_to_email})));
                });
        }

        /* Another customer on a draft order: its terms, details and
         * addresses, as Jobshop fills them */
        function customerDefaults(v, d) {
            if (!v.party || (d.id && v.party === idOf(d.party))) {
                return Promise.resolve();
            }
            return Rpc.desk('sales_order_defaults', [v.party]).then(
                function (def) {
                    if (def.payment_term) {
                        v.payment_term = def.payment_term;
                    }
                    HEADER_REFS.forEach(function (n) {
                        v[n] = idOf(def[n]);
                    });
                    v.freight_terms = def.freight_terms || null;
                    if (!v.js_specs && def.js_specs) {
                        v.js_specs = def.js_specs;
                    }
                    v.shipment_address = idOf(def.shipment_address);
                    ADDRESS_PARTS.forEach(function (k) {
                        v['js_sold_' + k] = '';
                        v['js_ship_' + k] = '';
                    });
                    if (def.credit_status === 'hold_orders') {
                        UI.toast('The customer has a hold type credit ' +
                            'status', 'error');
                    }
                });
        }

        function print(d) {
            Rpc.report('sale.sale', [d.id]).then(function (r) {
                UI.openReport(r, 'Order');
                desk('sales_order_printed', [d.id]).then(function () {
                    page.reload();
                }, function () {});
            }, UI.showError);
        }

        function setStatus(d, s) {
            var ask = s === 'cancelled' || s === 'closed' ?
                UI.confirm('Change status', 'Set order ' + (d.number ||
                    d.id) + ' to ' + label(JS_STATUS, s) + '?') :
                Promise.resolve(true);
            ask.then(function (ok) {
                if (!ok) {
                    return;
                }
                Rpc.desk('sales_order_status', [d.id, s]).then(function () {
                    UI.toast('Order ' + (d.number || d.id) + ': ' +
                        label(JS_STATUS, s), 'ok');
                    page.reload();
                }, UI.showError);
            });
        }

        function ship(d) {
            var s = openShipper(d);
            if (s) {
                UI.openScreen('shipping/' + s.id, 'Shipper ' + s.number);
            } else {
                UI.openScreen('shipping', 'Shipping');
            }
        }

        function openInvoice(id, number) {
            if (screens.invoicing) {
                UI.openScreen('invoicing/' + id, 'Invoice ' + (number || id));
            } else {
                UI.openRecord('account.invoice', id, number);
            }
        }

        function chooseCustomer(d) {
            UI.docEdit(d.id ? 'Change the customer' : 'New sales order', [
                {name: 'party', label: 'Customer', type: 'many2one',
                    model: 'party.party'},
                d.id ? null : {name: 'number', label: 'Order ID (empty: ' +
                    'automatic)', type: 'char'},
                {name: 'reference', label: 'Customer PO', type: 'char'},
                {name: 'shipping_date', label: 'Desired ship date',
                    type: 'date', value: function (x) {
                        return iso(x.shipping_date);
                    }}].filter(Boolean), d).then(function (v) {
                    if (!v.party) {
                        UI.toast('Choose the customer', 'error');
                        return;
                    }
                    page.save(v).then(null, function () {});
                }, function () {});
        }

        /* The work orders of a line (the Order Line window's Links) */
        function linksNode(d, l) {
            var links = l.link_details || [];
            var box = el('div.dp-form-extra', el('div.dp-muted',
                'Work orders'));
            if (!links.length) {
                box.appendChild(el('div', 'Not linked to a work order.'));
            }
            links.forEach(function (w) {
                box.appendChild(el('div', screens.workorders ? el('a', {
                    href: '#', onclick: function (event) {
                        event.preventDefault();
                        UI.openScreen('workorders/' + w.id, 'WO ' +
                            w.number);
                    }}, 'WO ' + w.number) : 'WO ' + w.number, ' · ' +
                    w.state + ' · ' + num(w.quantity) + (w.planned_end_date ?
                        ' · finish ' + UI.date(w.planned_end_date) : '')));
            });
            var released = d.state === 'confirmed' || d.state ===
                'processing';
            if (l.id && released && !links.length && can.workOrder) {
                var button = el('button', {type: 'button', onclick:
                    function () {
                        button.disabled = true;
                        UI.service('sale_line_work_order', l.id).then(
                            function (wo) {
                                button.replaceWith(el('span', 'Work order ' +
                                    wo.number + ' created'));
                                page.reload();
                            }, function (error) {
                                button.disabled = false;
                                failed(error);
                            });
                    }}, 'New work order');
                box.appendChild(button);
            }
            return box;
        }

        function lineFields(d, l, adding) {
            var priceLocked = !draft(d) || !writable(d);
            var ro = !writable(d);
            var fields = [
                {name: 'product', label: 'Part', type: 'many2one',
                    model: 'product.product', readonly: priceLocked,
                    domain: [['salable', '=', true]]},
                {name: 'description', label: 'Description', type: 'char',
                    wide: true, readonly: priceLocked},
                {name: 'quantity', label: 'Order qty', type: 'float',
                    readonly: priceLocked},
                {name: 'gross_unit_price', label: 'Unit price (empty: ' +
                    'the customer\'s price)', type: 'float',
                    readonly: priceLocked},
                {name: 'trade_discount', label: 'Trade disc %',
                    type: 'float', readonly: priceLocked},
                {name: 'js_desired_date', label: 'Desired ship date',
                    type: 'date', readonly: ro, value: function (x) {
                        return iso(x.js_desired_date);
                    }},
                {name: 'customer_po_line', label: 'Customer PO line',
                    type: 'char', readonly: ro}];
            if (adding) {
                return fields;
            }
            fields[3].label = 'Unit price';
            return fields.concat([
                {name: 'promise_date', label: 'Promised', type: 'date',
                    readonly: ro, value: function (x) {
                        return iso(x.promise_date);
                    }},
                {name: 'customer_part', label: 'Customer part ID',
                    type: 'char', readonly: ro},
                {name: 'drawing_id', label: 'Drawing ID', type: 'char',
                    readonly: ro},
                {name: 'drawing_rev', label: 'Drawing rev', type: 'char',
                    readonly: ro},
                {name: 'product_code', label: 'Product code',
                    type: 'many2one', model: 'nline.product_code',
                    readonly: ro},
                {name: 'commodity_code', label: 'Commodity code',
                    type: 'many2one', model: 'nline.commodity_code',
                    readonly: ro},
                {name: 'line_tax_group', label: 'Tax group',
                    type: 'many2one', model: 'nline.sales_tax_group',
                    readonly: ro},
                {name: 'js_ship_via', label: 'Ship via', type: 'many2one',
                    model: 'nline.ship_via', readonly: ro},
                {name: 'commissionable', label: 'Commissionable',
                    type: 'boolean', readonly: ro, value: function (x) {
                        return x.commissionable !== false;
                    }},
                {name: 'commission_percent', label: 'Commission %',
                    type: 'float', readonly: ro},
                {name: 'js_line_specs', label: 'Specs', type: 'text',
                    wide: true, readonly: ro},
                draft(d) && writable(d) ? {name: '_remove', label:
                    'Remove this line', type: 'boolean'} : null])
                .filter(Boolean);
        }

        /* The customer's price of a part (Reset Unit Price from Customer)
         * and the part's name as the description */
        function priceLine(d, l) {
            var product = idOf(l.product);
            if (!product) {
                return Promise.resolve(l);
            }
            var steps = [];
            if (l.gross_unit_price === null || l.gross_unit_price ===
                    undefined || l.gross_unit_price === '') {
                var args = [idOf(d.party), product, amountOf(l.quantity) ||
                    1, iso(d.sale_date)];
                if (idOf(l.unit)) {
                    args.push(idOf(l.unit));
                }
                steps.push(Rpc.desk('sales_price', args).then(function (p) {
                    l.gross_unit_price = p.gross_unit_price;
                    l.trade_discount = p.trade_discount || 0;
                    if (p.customer_part && !l.customer_part) {
                        l.customer_part = p.customer_part;
                    }
                }));
            }
            if (!l.description) {
                steps.push(Rpc.model('product.product', 'read', [[product],
                    ['rec_name']]).then(function (rows) {
                        l.description = String((rows[0] || {}).rec_name || '')
                            .replace(/^\[[^\]]*\]\s*/, '');
                    }));
            }
            return Promise.all(steps).then(function () {
                return l;
            });
        }

        function editLine(d, l) {
            var ro = !writable(d);
            UI.docEdit('Line ' + (l.line_no || '') + (l.product ? ' · ' +
                UI.shortName('product.product', name(l.product)) : ''),
                lineFields(d, l, false), l, linksNode(d, l)).then(
                function (v) {
                    if (ro) {
                        return;
                    }
                    if (v._remove) {
                        d.lines = (d.lines || []).filter(function (x) {
                            return x !== l;
                        });
                        page.save({}).then(null, function () {});
                        return;
                    }
                    delete v._remove;
                    Object.assign(l, v);
                    l.changed = true;
                    page.save({}).then(null, function () {});
                }, function () {});
        }

        function addLine(d) {
            if (!d.party || !draft(d) || !writable(d)) {
                if (d.id && !draft(d)) {
                    UI.toast('A released order keeps its lines: add them ' +
                        'on a new order', 'error');
                }
                return;
            }
            UI.docEdit('Add a line', lineFields(d, {}, true), {quantity: 1,
                js_desired_date: iso(d.shipping_date)}).then(function (v) {
                    if (!v.product && !v.description) {
                        UI.toast('Choose a part or type a description',
                            'error');
                        return;
                    }
                    var line = Object.assign({id: null, js_line_status:
                        'open', commissionable: true}, v);
                    return priceLine(d, line).then(function () {
                        d.lines = (d.lines || []).concat([line]);
                        return page.save({});
                    });
                }, function () {}).then(null, function () {});
        }

        function reprice(d) {
            Promise.all((d.lines || []).filter(function (l) {
                return l.product;
            }).map(function (l) {
                l.gross_unit_price = null;
                return priceLine(d, l);
            })).then(function () {
                return page.save({});
            }).then(function () {
                UI.toast('Unit prices reset from the customer', 'ok');
            }, function () {});
        }

        function editCharge(d, c) {
            var locked = !writable(d) || !can.charges || Boolean(c.invoice);
            UI.docEdit('Charge ' + codeOf(c.service_charge), [
                {name: 'description', label: 'Description', type: 'char',
                    wide: true, readonly: locked},
                {name: 'amount', label: 'Amount', type: 'float',
                    readonly: locked},
                {name: 'apply', label: 'Apply (on the next invoice)',
                    type: 'boolean', readonly: locked},
                {name: 'tax_group', label: 'Tax group', type: 'many2one',
                    model: 'nline.sales_tax_group', readonly: locked},
                locked ? null : {name: '_remove', label: 'Remove this ' +
                    'charge', type: 'boolean'}].filter(Boolean), c).then(
                function (v) {
                    if (locked) {
                        return;
                    }
                    if (v._remove) {
                        d.charges = d.charges.filter(function (x) {
                            return x !== c;
                        });
                    } else {
                        delete v._remove;
                        Object.assign(c, v);
                    }
                    page.save({}).then(null, function () {});
                }, function () {});
        }

        function addCharge(d) {
            UI.docEdit('Add a service charge', [
                {name: 'service_charge', label: 'Service charge',
                    type: 'many2one', model: 'nline.service_charge'},
                {name: 'description', label: 'Description (empty: the ' +
                    'charge\'s)', type: 'char', wide: true},
                {name: 'amount', label: 'Amount (empty: the charge\'s)',
                    type: 'float'},
                {name: 'apply', label: 'Apply (on the next invoice)',
                    type: 'boolean'}], {apply: true}).then(function (v) {
                    if (!v.service_charge) {
                        UI.toast('Choose the service charge', 'error');
                        return;
                    }
                    var add = function (svc) {
                        d.charges = (d.charges || []).concat([{id: null,
                            service_charge: v.service_charge, description:
                                v.description || svc.description || '',
                            amount: v.amount === null ? svc.amount :
                                v.amount, apply: v.apply,
                            account: svc.account || null}]);
                        return page.save({});
                    };
                    return Rpc.model('nline.service_charge', 'read',
                        [[v.service_charge], ['description', 'amount',
                            'account']]).then(function (rows) {
                            return add(rows[0] || {});
                        });
                }, function () {}).then(null, function () {});
        }

        var shipAddressField = {name: 'shipment_address', label:
            'Customer address', type: 'many2one', model: 'party.address',
            domain: [['id', '=', -1]], value: function (d) {
                return d.shipment_address && d.shipment_address.id ?
                    d.shipment_address : null;
            }};

        function partField(prefix, part, caption, getParts) {
            return {name: prefix + part, label: caption, type: 'char',
                value: function (d) {
                    return getParts(d)[part];
                }};
        }

        function addressFieldsOf(prefix, getParts) {
            return [['name', 'Name'], ['addr_1', 'Address'],
                ['addr_2', 'Address 2'], ['city', 'City'],
                ['state', 'State'], ['postal', 'Postal code'],
                ['country', 'Country'], ['contact', 'Contact'],
                ['phone', 'Phone'], ['email', 'E-mail']].map(function (p) {
                    return partField(prefix, p[0], p[1], getParts);
                });
        }

        page = UI.docPage(main, {
            title: 'Sales Order',
            crumbs: ['Sales', 'Customer orders'],
            model: 'sale.sale', label: 'Order ID',
            order: [['sale_date', 'DESC'], ['id', 'DESC']],
            openId: openId,
            load: function (id) {
                return Rpc.desk('sale_order_get', [id]);
            },
            onload: function (d) {
                shipAddressField.domain = [['party', '=', idOf(d.party) ||
                    -1]];
                UI.setTitle('Sales Order :: ' + (d.number || d.id));
            },
            values: values,
            save: function (v, d) {
                if (!v.party) {
                    return Promise.reject({message: 'Choose the customer ' +
                        'first.'});
                }
                return customerDefaults(v, d).then(function () {
                    return shipToAddress(v, d);
                }).then(function () {
                    return UI.service('sale_order_save', v);
                }).then(function (r) {
                    if (r && r.id && r.id !== d.id) {
                        global.history.replaceState(null, '', '#/orders/' +
                            r.id);
                    }
                    shipAddressField.domain = [['party', '=',
                        idOf(r.party) || -1]];
                    return r;
                });
            },
            blank: function () {
                return can.create ? {id: null, number: '', state: 'draft',
                    js_status: 'unreleased', party: null,
                    sale_date: UI.today(), lines: [], charges: [],
                    shippers: []} : null;
            },
            head: function (d) {
                var open = ['closed', 'cancelled'].indexOf(d.js_status) < 0 &&
                    d.shipment_state !== 'sent';
                return {
                    title: d.party ? d.customer_name || name(d.party) ||
                        'New sales order' : 'New sales order',
                    chips: d.customer_code ? [d.customer_code] : [],
                    sub: [d.id ? (d.number ? 'SO ' + d.number :
                        'Order not numbered yet') : 'Not saved yet',
                        d.sale_date ? 'ordered ' + UI.date(d.sale_date) +
                            (d.created_by ? ' by ' + String(d.created_by)
                                .split(' ')[0] : '') : null,
                        d.reference ? 'PO ' + d.reference : null,
                        dueSub('ship', d.shipping_date, open && d.id)],
                    amount: {value: money(d.id ? d.order_amount : 0),
                        label: (d.lines || []).length + ' lines' +
                            (d.payment_term_ref ? ' · ' +
                                name(d.payment_term_ref) : '')}
                };
            },
            status: function (d) {
                if (!d.id) {
                    return [{text: 'New', tone: 'muted'}];
                }
                var out = [{text: label(JS_STATUS, d.js_status) ||
                    'Unreleased', tone: SO_STATUS_TONE[d.js_status]},
                    {text: d.js_printed_date ? 'Printed ' +
                        UI.date(d.js_printed_date) : 'Not printed'}];
                if (d.shipment_state === 'sent') {
                    out.push({text: 'Shipped', tone: 'ok'});
                } else if (d.shipment_state === 'partially shipped') {
                    out.push({text: 'Partly shipped', tone: 'accent'});
                }
                if (d.invoice_state === 'paid') {
                    out.push({text: 'Paid', tone: 'ok'});
                }
                if (d.credit_status && d.credit_status !== 'approved') {
                    out.push({text: label(CREDIT_STATUS, d.credit_status),
                        tone: 'bad'});
                }
                return out;
            },
            actions: function (d) {
                if (!d.id) {
                    return [];
                }
                var next = soAllowedNext(d);
                var release = can.save && next.indexOf('released') >= 0 &&
                    d.js_status !== 'closed';
                var shipper = d.js_status === 'released' && screens.shipping &&
                    openShipper(d);
                var invoice = (d.draft_invoices || [])[0];
                return [
                    {label: 'Print', key: 'p', title: 'Print the ' +
                        'acknowledgement', onclick: print},
                    release ? {label: 'Release', key: 'r', primary: true,
                        onclick: function () {
                            setStatus(d, 'released');
                        }} : null,
                    shipper ? {label: 'Ship', key: 's', primary: !release,
                        title: 'Open shipper ' + shipper.number,
                        onclick: ship} : null,
                    invoice && screens.invoicing ? {label: 'Invoice',
                        key: 'i', primary: !release && !shipper,
                        title: 'Open the invoice waiting to post',
                        onclick: function () {
                            openInvoice(invoice.id, invoice.number);
                        }} : null];
            },
            more: function (d) {
                var items = [];
                if (d.id && can.save && soAllowedNext(d).length) {
                    items.push({label: 'Change status', items:
                        soAllowedNext(d).map(function (s) {
                            return {label: label(JS_STATUS, s), onclick:
                                function () {
                                    setStatus(d, s);
                                }};
                        })});
                }
                if (draft(d) && writable(d)) {
                    items.push({label: d.id ? 'Change the customer...' :
                        'Choose the customer...', onclick: function () {
                            chooseCustomer(d);
                        }});
                }
                if (d.party && writable(d) && can.charges) {
                    items.push({label: 'Add a service charge...', onclick:
                        function () {
                            addCharge(d);
                        }});
                }
                if (d.id && draft(d) && can.save && (d.lines || []).length) {
                    items.push({label: 'Re-price lines from the customer',
                        onclick: function () {
                            reprice(d);
                        }});
                }
                if (d.id && can.create) {
                    items.push({label: 'Copy to a new order', onclick:
                        function () {
                            Rpc.desk('sales_order_copy', [d.id, 'order'])
                                .then(function (copy) {
                                    UI.toast('Copied to a new order', 'ok');
                                    global.history.replaceState(null, '',
                                        '#/orders/' + copy.id);
                                    page.load(copy.id);
                                }, UI.showError);
                        }});
                }
                if (d.id && can.del && ['unreleased', 'firm', 'cancelled']
                        .indexOf(d.js_status) >= 0) {
                    items.push({label: 'Delete order', onclick: function () {
                        UI.confirm('Delete order', 'Delete order ' +
                            (d.number || d.id) + '? It can not be ' +
                            'recovered.').then(function (ok) {
                                if (!ok) {
                                    return;
                                }
                                Rpc.desk('sales_order_delete', [d.id]).then(
                                    function () {
                                        UI.toast('Order deleted', 'ok');
                                        global.location.hash = '#/orders/' +
                                            'new?' + Date.now();
                                    }, UI.showError);
                            });
                    }});
                }
                if (d.party && screens['customer-window']) {
                    items.push({label: 'Open customer', onclick: function () {
                        UI.openScreen('customer-window/' + idOf(d.party),
                            'Customer');
                    }});
                }
                if (d.js_quote && screens.quotes) {
                    items.push({label: 'Open quote ' + d.js_quote, onclick:
                        function () {
                            Rpc.searchRead('nline.quote', [['number', '=',
                                d.js_quote]], ['number'], {limit: 1}).then(
                                function (q) {
                                    if (q.length) {
                                        UI.openScreen('quotes/' + q[0].id,
                                            'Quote ' + q[0].number);
                                    } else {
                                        UI.toast('Quote ' + d.js_quote +
                                            ' is not in the ERP', 'error');
                                    }
                                }, UI.showError);
                        }});
                }
                if (d.id) {
                    items.push({label: 'Shipper lines...', onclick:
                        function () {
                            desk('sales_shipper_lines', [d.id, null]).then(
                                function (rows) {
                                    listDialog('Shipper Lines', ['Shipper ID',
                                        'Status', 'Shipped Date', 'Line No',
                                        'Part ID', 'Description',
                                        'Shipped Qty', 'Unit Price',
                                        'Shipped Amount'].map(function (x) {
                                            return {label: x, num:
                                                /Qty|Price|Amount/.test(x)};
                                        }), rows.map(function (r) {
                                            return {cells: [r.shipper.number,
                                                label(SHIPPER_STATUS,
                                                    r.status),
                                                UI.date(r.shipped_date),
                                                r.sales_line_no,
                                                codeOf(r.product),
                                                r.description,
                                                num(r.quantity),
                                                UI.money(r.unit_price),
                                                UI.money(r.amount)]};
                                        }), {empty: 'No shipper line.'});
                                }, failed);
                        }});
                    items.push({label: 'Notes', onclick: function () {
                        notesDialog('sale.sale', d.id, 'SO ' + (d.number ||
                            d.id), can.save);
                    }});
                }
                items.push('-', {label: 'Classic view', onclick: function () {
                    UI.setDocView('so', 'classic');
                    Screens.salesOrder(main, d.id ? [d.id] : []);
                }});
                return items;
            },
            attention: function (d) {
                var out = [];
                if (!d.party) {
                    out.push({tone: 'info', title: 'Choose the customer',
                        detail: 'Its terms, sales rep, ship to and specs ' +
                            'fill in from the customer.', action: writable(d) ?
                            {label: 'Choose', onclick: function () {
                                chooseCustomer(d);
                            }} : null});
                    return out;
                }
                if (d.credit_status === 'hold_orders' ||
                        d.credit_status === 'hold_shipments') {
                    out.push({tone: 'bad', icon: 'bad', title: 'Credit hold: ' +
                        label(CREDIT_STATUS, d.credit_status),
                        detail: d.credit_status === 'hold_orders' ?
                            'The customer is on a hold type credit status.' :
                            'Shipping asks to accept the hold.',
                        action: screens['customer-window'] ? {label:
                            'Open customer', onclick: function () {
                                UI.openScreen('customer-window/' +
                                    idOf(d.party), 'Customer');
                            }} : null});
                }
                if (d.js_status === 'hold') {
                    out.push({tone: 'bad', icon: 'bad', title: 'The order is ' +
                        'on hold', detail: 'It is not shipped while on hold.',
                        action: can.save && soAllowedNext(d).indexOf(
                            'released') >= 0 ? {label: 'Release',
                                onclick: function () {
                                    setStatus(d, 'released');
                                }} : null});
                }
                if (d.id && !d.reference && d.js_status !== 'cancelled') {
                    out.push({tone: 'warn', title: 'No customer PO reference',
                        detail: 'The acknowledgement, shippers and invoices ' +
                            'print it.', action: writable(d) ? {label:
                            'Add PO', onclick: function () {
                                UI.docEdit('Customer PO', [{name: 'reference',
                                    label: 'Purchase order no', type:
                                    'char'}], d).then(function (v) {
                                        page.save(v).then(null,
                                            function () {});
                                    }, function () {});
                            }} : null});
                }
                (d.lines || []).forEach(function (l) {
                    if (noPrice(l)) {
                        out.push({tone: 'warn', title: 'Line ' +
                            (l.line_no || '') + ' has no price', detail:
                            draft(d) ? 'It would ship and invoice at $0.' :
                            'Released: the price is set on the invoice ' +
                            '(Set Shipper Line Unit Price).', action:
                            draft(d) && writable(d) ? {label: 'Set price',
                                onclick: function () {
                                    editLine(d, l);
                                }} : null});
                    }
                });
                var openLines = (d.lines || []).filter(lineOpen);
                if (d.id && iso(d.shipping_date) && iso(d.shipping_date) <
                        UI.today() && openLines.length &&
                        ['closed', 'cancelled'].indexOf(d.js_status) < 0) {
                    var shipper = d.js_status === 'released' &&
                        screens.shipping && openShipper(d);
                    out.push({tone: 'bad', icon: 'clock', title: 'Past the ' +
                        'desired ship date', detail: 'Wanted ' +
                        UI.date(d.shipping_date) + '; ' + openLines.length +
                        ' line(s) not shipped' + (d.promise_date ?
                            ', promised ' + UI.date(d.promise_date) : '') +
                        '.', action: shipper ? {label: 'Ship', onclick:
                            function () {
                                ship(d);
                            }} : writable(d) ? {label: 'New date',
                            onclick: function () {
                                UI.docEdit('Desired ship date', [{name:
                                    'shipping_date', label: 'Desired ship ' +
                                    'date', type: 'date', value: function (x) {
                                        return iso(x.shipping_date);
                                    }}, {name: 'promise_date', label:
                                    'Promised', type: 'date', value:
                                    function (x) {
                                        return iso(x.promise_date);
                                    }}], d).then(function (v) {
                                        page.save(v).then(null,
                                            function () {});
                                    }, function () {});
                            }} : null});
                }
                if (d.id && (d.js_status === 'unreleased' || d.js_status ===
                        'firm') && (d.lines || []).length) {
                    out.push({tone: 'info', title: 'Not released yet',
                        detail: 'Shipping and the work orders see it once it ' +
                            'is released.', action: can.save ? {label:
                            'Release', onclick: function () {
                                setStatus(d, 'released');
                            }} : null});
                }
                (d.draft_invoices || []).forEach(function (inv) {
                    out.push({tone: 'info', title: 'An invoice waits to be ' +
                        'posted', detail: 'Shipped and invoiced in draft; ' +
                        'post it on Invoicing.', action: screens.invoicing ?
                        {label: 'Open invoice', onclick: function () {
                            openInvoice(inv.id, inv.number);
                        }} : null});
                });
                return out;
            },
            tracker: function (d) {
                if (!d.id) {
                    return null;
                }
                var total = amountOf(d.order_amount);
                var shipped = amountOf(d.shipped_amount);
                var invoiced = d.invoiced_amount !== undefined ?
                    amountOf(d.invoiced_amount) : invoicesOf(d).filter(
                        function (i) {
                            return i.posted;
                        }).reduce(function (s, i) {
                            return s + amountOf(i.amount);
                        }, 0);
                var paid = d.paid_amount;
                var cancelled = d.js_status === 'cancelled';
                return {title: 'Order, shipment, invoice and payment',
                    note: 'at the order\'s prices', steps: [
                    {label: 'Ordered', value: money(total), state: cancelled ?
                        'bad' : ['released', 'closed'].indexOf(d.js_status) >=
                        0 || d.state !== 'draft' ? 'done' : 'now'},
                    {label: 'Shipped', value: money(shipped), state:
                        d.shipment_state === 'sent' ? 'done' : shipped ?
                            'now' : 'todo'},
                    {label: 'Invoiced', value: money(invoiced), state:
                        invoiced && invoiced >= total - 0.005 ? 'done' :
                            invoiced ? 'now' : 'todo'},
                    {label: 'Paid', value: paid !== undefined ? money(paid) :
                        d.invoice_state === 'paid' ? 'yes' : 'no', state:
                        d.invoice_state === 'paid' ? 'done' :
                            d.invoice_state === 'partially paid' ||
                            amountOf(paid) ? 'now' : 'todo'}]};
            },
            sections: [{title: 'What was ordered', note: function (d) {
                return draft(d) ? 'Click a line to change it' :
                    'Released: click a line for its dates, specs and work ' +
                    'orders';
            }, render: function (pane, d) {
                var items = d.lines || [];
                var today = UI.today();
                UI.docLines(pane, {
                    items: items,
                    kind: function (l) {
                        return l.product ? {icon: 'part', tone: 'part'} :
                            {icon: 'charge', tone: 'charge'};
                    },
                    title: function (l) {
                        return plainTitle(l.description || name(l.product)) ||
                            'Line';
                    },
                    chips: function (l) {
                        var c = [];
                        if (l.product) {
                            c.push(UI.shortName('product.product',
                                name(l.product)));
                        }
                        if (noPrice(l)) {
                            c.push({text: 'no price', tone: 'warn'});
                        }
                        if (l.js_line_status === 'closed') {
                            c.push({text: 'closed', tone: 'ok'});
                        } else if (l.js_line_status === 'cancelled') {
                            c.push({text: 'cancelled', tone: 'bad'});
                        }
                        if (l.customer_po_line) {
                            c.push('PO line ' + l.customer_po_line);
                        }
                        var want = iso(l.js_desired_date) ||
                            iso(d.shipping_date);
                        if (want && lineOpen(l) && d.id) {
                            c.push(want < today ? {text: 'late, wanted ' +
                                UI.date(want), tone: 'bad'} : 'wanted ' +
                                UI.date(want));
                        }
                        if (l.promise_date) {
                            c.push('promised ' + UI.date(l.promise_date));
                        }
                        (l.link_details || []).forEach(function (w) {
                            c.push({text: 'WO ' + w.number, tone: 'accent'});
                        });
                        if (l.js_line_specs) {
                            c.push('specs');
                        }
                        return c;
                    },
                    progress: function (l) {
                        if (!d.id || draft(d)) {
                            return null;
                        }
                        var q = amountOf(l.quantity);
                        var s = amountOf(l.shipped_quantity);
                        return {done: s, total: q, label: num(s) + ' of ' +
                            num(q) + ' shipped'};
                    },
                    right: function (l) {
                        var disc = amountOf(l.trade_discount);
                        return [money(l.amount), num(l.quantity) + ' × ' +
                            money(l.gross_unit_price) + (disc ? ' less ' +
                                num(disc) + '%' : ''), noPrice(l) ? 'warn' :
                            null];
                    },
                    onclick: function (l) {
                        editLine(d, l);
                    },
                    add: d.party && draft(d) && writable(d) ? {placeholder:
                        'Add a part, service or charge', onclick: function () {
                            addLine(d);
                        }} : null,
                    footer: ['Lines ' + money(d.untaxed_amount),
                        'Charges ' + money(d.charges_amount),
                        'Tax ' + money(d.tax_amount),
                        'Total ' + money(d.order_amount)]
                });
                chipTooltips(pane, items, function (l) {
                    return l.product ? name(l.product) : '';
                });
            }}, {title: 'Charges', note: 'Applied charges go on the next ' +
                'invoice', visible: function (d) {
                    return Boolean((d.charges || []).length);
                }, render: function (pane, d) {
                    UI.docLines(pane, {
                        items: d.charges || [],
                        kind: function () {
                            return {icon: 'charge', tone: 'charge'};
                        },
                        title: function (c) {
                            return c.description || name(c.service_charge);
                        },
                        chips: function (c) {
                            return [codeOf(c.service_charge), c.invoice ?
                                {text: 'invoiced ' + (name(c.invoice) || ''),
                                    tone: 'ok'} : c.apply ? {text:
                                    'on the next invoice', tone: 'accent'} :
                                'not applied'];
                        },
                        right: function (c) {
                            return [money(c.amount), c.applied_amount ?
                                'applied ' + money(c.applied_amount) : ''];
                        },
                        onclick: function (c) {
                            editCharge(d, c);
                        },
                        empty: 'No charge.',
                        add: d.party && writable(d) && can.charges ?
                            {placeholder: 'Add a service charge',
                                onclick: function () {
                                    addCharge(d);
                                }} : null,
                        footer: ['Charges ' + money(d.charges_amount)]
                    });
                }}],
            cards: [
                {title: 'Sold to', rows: function (d) {
                    return [['Customer', idSpan(d.party && {rec_name:
                        (d.customer_code ? d.customer_code + ' - ' : '') +
                        (d.customer_name || name(d.party))})],
                        ['Customer PO', d.reference]].concat(addressRows(
                            soSoldParts(d)));
                }, fields: [{name: 'reference', label: 'Customer PO',
                    type: 'char'}].concat(addressFieldsOf('js_sold_',
                        soSoldParts)),
                    editable: function (d) {
                        return Boolean(d.party) && writable(d);
                    }},
                {title: 'Ship to', rows: function (d) {
                    var p = soShipParts(d);
                    return addressRows(p).concat([['Ship via',
                        idSpan(d.ship_via)], ['Carrier', idSpan(d.js_carrier)],
                        ['Address no', d.shipment_address &&
                            d.shipment_address.id ? String(
                                d.shipment_address.id) : null]]);
                }, fields: [shipAddressField].concat(addressFieldsOf(
                    'js_ship_', soShipParts)),
                    editable: function (d) {
                        return Boolean(d.party) && writable(d);
                    }},
                {title: 'Terms', rows: function (d) {
                    return [['Terms', d.payment_term_ref ? name(
                        d.payment_term_ref) : d.payment_term_descr],
                        ['Freight', label(FREIGHT_TERMS, d.freight_terms) ||
                            null],
                        ['Tax group', idSpan(d.tax_group)],
                        ['Discount class', idSpan(d.discount_class)],
                        ['Receivables', idSpan(d.receivable)],
                        ['Order date', d.sale_date ? UI.date(d.sale_date) :
                            null]];
                }, fields: [
                    {name: 'payment_term', label: 'Terms (while unreleased)',
                        type: 'many2one', model:
                            'account.invoice.payment_term',
                        value: function (d) {
                            return d.payment_term_ref || null;
                        }},
                    {name: 'freight_terms', label: 'Freight terms',
                        type: 'selection', options: FREIGHT_TERMS},
                    {name: 'tax_group', label: 'Tax group', type: 'many2one',
                        model: 'nline.sales_tax_group'},
                    {name: 'discount_class', label: 'Discount class',
                        type: 'many2one', model: 'nline.discount_class'},
                    {name: 'sale_date', label: 'Order date (while ' +
                        'unreleased)', type: 'date', value: function (d) {
                            return iso(d.sale_date);
                        }}],
                    editable: function (d) {
                        return Boolean(d.party) && writable(d);
                    }},
                {title: 'Sales rep and delivery', rows: function (d) {
                    return [['Sales rep', idSpan(d.sales_rep)],
                        ['Territory', idSpan(d.territory)],
                        ['Desired ship', d.shipping_date ? UI.date(
                            d.shipping_date) : null],
                        ['Promised', d.promise_date ? UI.date(
                            d.promise_date) : null],
                        ['Last shipped', d.last_shipped_date ? UI.date(
                            d.last_shipped_date) : null],
                        ['FOB', idSpan(d.fob_point)]];
                }, fields: [
                    {name: 'sales_rep', label: 'Sales rep', type: 'many2one',
                        model: 'nline.sales_rep'},
                    {name: 'territory', label: 'Territory', type: 'many2one',
                        model: 'nline.territory'},
                    {name: 'shipping_date', label: 'Desired ship date',
                        type: 'date', value: function (d) {
                            return iso(d.shipping_date);
                        }},
                    {name: 'promise_date', label: 'Promised', type: 'date',
                        value: function (d) {
                            return iso(d.promise_date);
                        }},
                    {name: 'ship_via', label: 'Ship via', type: 'many2one',
                        model: 'nline.ship_via'},
                    {name: 'js_carrier', label: 'Carrier', type: 'many2one',
                        model: 'nline.carrier'},
                    {name: 'fob_point', label: 'FOB point', type: 'many2one',
                        model: 'nline.fob_point'}],
                    editable: function (d) {
                        return Boolean(d.party) && writable(d);
                    }},
                {title: 'Specs and notes', rows: function (d) {
                    return [['Specs', d.js_specs ? String(d.js_specs)
                        .slice(0, 160) : null],
                        ['Memo', d.description],
                        ['Copy notes to shipper', d.js_copy_notes ? 'Yes' :
                            'No'],
                        ['Quote', d.js_quote]];
                }, fields: [
                    {name: 'js_specs', label: 'Specs', type: 'text'},
                    {name: 'description', label: 'Memo', type: 'char'},
                    {name: 'js_copy_notes', label: 'Copy notes to shipper',
                        type: 'boolean'}],
                    editable: function (d) {
                        return Boolean(d.party) && writable(d);
                    }}
            ],
            trail: function (d) {
                if (!d.id) {
                    return [];
                }
                var out = [];
                if (d.js_quote) {
                    out.push({done: true, text: 'Quote ' + d.js_quote,
                        when: 'won'});
                }
                out.push({done: true, text: 'Order entered', when:
                    d.created_by || UI.date(d.sale_date)});
                out.push({done: ['released', 'closed'].indexOf(d.js_status) >=
                    0 || ['confirmed', 'processing', 'done'].indexOf(
                        d.state) >= 0, text: 'Released', when:
                    label(JS_STATUS, d.js_status)});
                out.push({done: Boolean(d.js_printed_date), text:
                    'Acknowledgement printed', when: d.js_printed_date ?
                    UI.date(d.js_printed_date) : 'not yet'});
                var shippers = (d.shippers || []).filter(function (s) {
                    return s.model !== 'account.invoice';
                });
                shippers.forEach(function (s) {
                    out.push({done: s.state === 'done', text: (s.type ===
                        'Return' ? 'Return ' : 'Shipper ') + s.number +
                        (s.amount ? ' · ' + money(s.amount) : ''),
                        when: s.shipped_date ? UI.date(s.shipped_date) :
                            s.state, onclick: s.model ===
                            'stock.shipment.out' && screens.shipping ?
                            function () {
                                UI.openScreen('shipping/' + s.id,
                                    'Shipper ' + s.number);
                            } : null});
                });
                if (!shippers.length) {
                    out.push({done: false, text: 'Shippers', when:
                        'none yet'});
                }
                var invoices = invoicesOf(d);
                invoices.forEach(function (inv) {
                    out.push({done: inv.posted, text: 'Invoice ' +
                        (inv.number || '(draft)') + (inv.amount ? ' · ' +
                            money(inv.amount) : ''), when: inv.date ?
                        UI.date(inv.date) : 'draft', onclick: function () {
                            openInvoice(inv.id, inv.number);
                        }});
                });
                if (!invoices.length) {
                    out.push({done: false, text: 'Invoices', when:
                        'none yet'});
                }
                out.push({done: d.invoice_state === 'paid', text: 'Paid',
                    when: d.paid_amount !== undefined ? money(d.paid_amount) :
                        d.invoice_state === 'paid' ? '' : 'not yet'});
                out.push({done: d.js_status === 'closed' || d.state ===
                    'done', text: 'Closed', when: d.js_status === 'closed' ?
                    '' : 'open'});
                out.push({text: 'Notes', onclick: function () {
                    notesDialog('sale.sale', d.id, 'SO ' + (d.number ||
                        d.id), can.save);
                }});
                return out;
            },
            keys: pageKeys(main, token, {
                p: {label: 'print', run: function (d) {
                    if (d.id) {
                        print(d);
                    }
                }},
                r: {label: 'release', run: function (d) {
                    if (d.id && can.save && soAllowedNext(d).indexOf(
                            'released') >= 0) {
                        setStatus(d, 'released');
                    }
                }},
                s: {label: 'ship', run: function (d) {
                    if (d.js_status === 'released' && screens.shipping) {
                        ship(d);
                    }
                }},
                a: {label: 'add a line', run: function (d) {
                    addLine(d);
                }}
            }),
            classic: function (d) {
                UI.setDocView('so', 'classic');
                Screens.salesOrder(main, d && d.id ? [d.id] : []);
            }
        });
        /* New order for a customer (the Customers page's New order) */
        if (!openId && presetCustomer && can.create) {
            Rpc.model('party.party', 'read', [[presetCustomer.id],
                ['rec_name']]).then(function (rows) {
                    var d = page.data();
                    if (d && !d.id && rows[0]) {
                        d.party = {id: rows[0].id, rec_name:
                            rows[0].rec_name};
                        chooseCustomer(d);
                    }
                }, function () {});
        }
        token.root = main.querySelector('.dp-page');
        return page;
    }

    /* The Customer Order Entry window: the modern page (default) or
     * Jobshop's classic window */
    Screens.salesOrder = function (main, params) {
        startPage(main);
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        if (UI.docPage && UI.docView('so') === 'modern') {
            injectCss();
            var preset = queryParam('customer');
            soModern(main, openId, preset && /^\d+$/.test(preset) ?
                {id: parseInt(preset, 10)} : null);
            return;
        }
        main._salesPage = null;
        classicSalesOrder(main, params);
    };

    /* ---- Shipping: the shipper as a document ----------------------------- */

    var SHIP_STATE = {draft: 'Draft', waiting: 'Waiting for stock',
        assigned: 'Stock assigned', picked: 'Picked', packed: 'Packed',
        done: 'Shipped', cancelled: 'Cancelled'};
    var SHIP_ORDER = ['draft', 'waiting', 'assigned', 'picked', 'packed',
        'done'];

    function shipperModern(main, openId, isReturn) {
        var token = startPage(main);
        var model = isReturn ? 'stock.shipment.out.return' :
            'stock.shipment.out';
        var can = {write: true, returns: true, sale: true};
        var screens = {orders: false, invoicing: false};
        var page;
        rights(['stock.shipment.out', 'stock.shipment.out.return',
            'sale.sale']).then(function (r) {
                can.write = r['stock.shipment.out'].write;
                can.returns = r['stock.shipment.out.return'].write;
                can.sale = r['sale.sale'].create;
                if (page) {
                    page.render();
                }
            }, function () {});
        Object.keys(screens).forEach(function (s) {
            UI.screenAllowed(s).then(function (ok) {
                screens[s] = ok;
                if (page && ok) {
                    page.render();
                }
            });
        });

        function open(d) {
            return ['done', 'cancelled'].indexOf(d.state) < 0;
        }

        /* Quantities change while the stock is not picked */
        function qtyEditable(d) {
            return can.write && !d['return'] && ['draft', 'waiting',
                'assigned'].indexOf(d.state) >= 0;
        }

        function headEditable(d) {
            return can.write && !d['return'] && d.state !== 'cancelled';
        }

        function total(d) {
            return (d.lines || []).reduce(function (s, l) {
                return s + amountOf(l.quantity) * amountOf(l.unit_price);
            }, 0);
        }

        function short(l) {
            var have = l.could_ship === undefined ? l.available :
                l.could_ship;
            var want = l.stock_quantity === undefined ? l.quantity :
                l.stock_quantity;
            return amountOf(have) < amountOf(want) - 0.00001;
        }

        function ownInvoice(d) {
            var numbers = String(d.invoice_id || '').split(', ')
                .filter(Boolean);
            return (d.invoices || []).filter(function (i) {
                return i.number && numbers.indexOf(i.number) >= 0;
            })[0] || (d.js_shipper_status !== 'approved' ? (d.invoices ||
                []).filter(function (i) {
                    return i.state === 'draft';
                })[0] : null) || null;
        }

        function openInvoice(inv) {
            if (screens.invoicing) {
                UI.openScreen('invoicing/' + inv.id, 'Invoice ' +
                    (inv.number || inv.id));
            } else {
                UI.openRecord('account.invoice', inv.id, inv.number);
            }
        }

        /* The payload of sales_ship: the Details overrides, the ship
         * quantities (less than ordered back orders the rest), charges */
        function values(d) {
            var v = {id: d.id, ship: false,
                fob_point: idOf(d.fob_point), ship_via: idOf(d.ship_via),
                js_carrier: idOf(d.js_carrier),
                freight_terms: d.freight_terms || null,
                js_specs: d.js_specs || null,
                js_tracking_number: d.js_tracking_number || null,
                charges: (d.charges || []).filter(function (c) {
                    return c.id;
                }).map(function (c) {
                    return {id: c.id, amount: c.amount === null ||
                        c.amount === undefined ? null : String(c.amount),
                        apply: Boolean(c.apply)};
                }),
                lines: (d.lines || []).map(function (l) {
                    return {move: l.move, quantity: amountOf(l.quantity),
                        close_short: Boolean(l.close_short)};
                })};
            if (iso(d.effective_date)) {
                v.effective_date = iso(d.effective_date);
            }
            return v;
        }

        function packingList(d) {
            Rpc.report('stock.shipment.out.delivery_note', [d.id]).then(
                function (x) {
                    UI.openReport(x, 'Packing List');
                }, UI.showError);
        }

        function ship(d) {
            if (d['return']) {
                Rpc.desk('sales_return_receive', [d.id]).then(function () {
                    UI.toast('Return ' + d.number + ' received', 'ok');
                    page.reload();
                }, UI.showError);
                return;
            }
            page.save({ship: true}).then(function (r) {
                UI.confirm('Packing List', 'Print the Pack List for ' +
                    'shipper ' + r.number + '?').then(function (ok) {
                        if (ok) {
                            packingList(r);
                        }
                    });
            }, function () {});
        }

        function step(d, s) {
            Rpc.model('stock.shipment.out', s[0], [[d.id]]).then(function () {
                UI.toast('Shipper ' + d.number + ': ' + s[1], 'ok');
                page.reload();
            }, UI.showError);
        }

        /* Marking a Sales Order for Return: the quantities to return */
        function returnDialog(sale) {
            Rpc.desk('sale_order_get', [sale.id]).then(function (order) {
                var lines = order.lines.filter(function (l) {
                    return l.shipped_quantity > 0;
                });
                if (!lines.length) {
                    UI.toast('Nothing shipped on this order', 'error');
                    return;
                }
                UI.docEdit('Return parts of order ' + (order.number ||
                    order.id), lines.map(function (l) {
                        return {name: 'l' + l.id, label: 'Line ' + l.line_no +
                            ' · ' + (l.description || name(l.product)) +
                            ' (shipped ' + num(l.shipped_quantity) + ')',
                            type: 'float', wide: true};
                    }), {}, el('p.dp-muted', 'Makes a return order and its ' +
                        'return shipper; receive it on Shipping, its credit ' +
                        'memo waits on Invoicing.')).then(function (v) {
                        var out = lines.map(function (l) {
                            return {line: l.id, quantity: amountOf(
                                v['l' + l.id])};
                        }).filter(function (l) {
                            return l.quantity > 0;
                        });
                        if (!out.length) {
                            return;
                        }
                        Rpc.desk('sales_return', [{sale: order.id, lines:
                            out}]).then(function (result) {
                                UI.toast('Return order ' +
                                    result.sale.number + ' made', 'ok');
                                page.reload();
                            }, UI.showError);
                    }, function () {});
            }, UI.showError);
        }

        function editLine(d, l) {
            var ro = !qtyEditable(d);
            UI.docEdit('Shipper line ' + l.line_no + (l.product ? ' · ' +
                UI.shortName('product.product', name(l.product)) : ''), [
                {name: 'quantity', label: 'Ship qty (' + (l.unit || '') +
                    '; less back orders the rest, 0 the whole line)',
                    type: 'float', wide: true, readonly: ro},
                {name: 'close_short', label: 'Close short (the rest is ' +
                    'not back ordered, the order line closes)',
                    type: 'boolean', wide: true, readonly: ro},
                {name: 'could_ship', label: 'Could ship (stock U/M)',
                    type: 'float', readonly: true},
                {name: 'available', label: 'On hand at ' + (l.location ||
                    'the warehouse'), type: 'float', readonly: true},
                {name: 'ordered', label: 'Ordered', type: 'float',
                    readonly: true},
                {name: 'lot', label: 'Lot', type: 'char', readonly: true},
                {name: 'specs', label: 'Line specs', type: 'text',
                    wide: true, readonly: true}], l).then(function (v) {
                    if (ro) {
                        return;
                    }
                    l.quantity = v.quantity === null ? l.quantity :
                        v.quantity;
                    l.close_short = v.close_short;
                    page.save({}).then(null, function () {});
                }, function () {});
        }

        function editCharge(d, c) {
            var locked = !can.write || d['return'] || d.state === 'done' ||
                Boolean(c.invoice);
            UI.docEdit('Charge ' + codeOf(c.service_charge), [
                {name: 'amount', label: 'Amount', type: 'float',
                    readonly: locked},
                {name: 'apply', label: 'Apply (on this shipment\'s ' +
                    'invoice)', type: 'boolean', readonly: locked}], c).then(
                function (v) {
                    if (!locked) {
                        Object.assign(c, v);
                        page.save({}).then(null, function () {});
                    }
                }, function () {});
        }

        page = UI.docPage(main, {
            title: isReturn ? 'Return' : 'Shipper',
            crumbs: ['Sales', 'Shipping'],
            model: model, label: isReturn ? 'Return ID' : 'Shipper ID',
            order: [['id', 'DESC']],
            openId: openId,
            load: function (id) {
                return Rpc.desk('sales_shipper_get', [id, model]);
            },
            values: values,
            save: function (v) {
                return UI.service('sales_ship', v);
            },
            head: function (d) {
                var sales = (d.sales || []).map(function (s) {
                    return s.number;
                }).join(', ');
                return {
                    title: name(d.customer) || d.customer_code,
                    chips: d.customer_code ? [d.customer_code] : [],
                    sub: [(d['return'] ? 'Return ' : 'Shipper ') + d.number,
                        sales ? 'for SO ' + sales : null,
                        d.reference ? 'PO ' + d.reference : null,
                        d.state === 'done' ? (d['return'] ? 'received ' :
                            'shipped ') + UI.date(d.effective_date) +
                            (d.shipped_by ? ' by ' + d.shipped_by : '') :
                            dueSub('ship', d.planned_date, open(d))],
                    amount: {value: money(total(d)), label: (d.lines ||
                        []).length + ' lines' + (d.payment_term ? ' · ' +
                            d.payment_term : '')}
                };
            },
            status: function (d) {
                var tone = {done: 'ok', cancelled: 'bad', waiting: 'warn',
                    assigned: 'accent', picked: 'accent', packed: 'accent'};
                return [{text: d['return'] && d.state === 'done' ?
                    'Received' : SHIP_STATE[d.state] || d.state,
                    tone: tone[d.state]},
                    {text: label(SHIPPER_STATUS, d.js_shipper_status) ||
                        'Unapproved', tone: d.js_shipper_status ===
                        'approved' ? 'ok' : null},
                    {text: d.invoice_id ? 'Invoice ' + d.invoice_id :
                        'Not invoiced'}];
            },
            actions: function (d) {
                var out = [];
                if (!d['return'] && open(d) && can.write) {
                    out.push({label: 'Ship', key: 's', primary: true,
                        title: 'Ship it (assigns the stock, picks, packs ' +
                            'and ships)', onclick: ship});
                }
                if (d['return'] && open(d) && can.returns) {
                    out.push({label: 'Receive return', key: 's',
                        primary: true, onclick: ship});
                }
                if (!d['return']) {
                    out.push({label: 'Packing list', key: 'p',
                        onclick: packingList});
                }
                var inv = ownInvoice(d);
                if (inv && d.state === 'done') {
                    out.push({label: 'Invoice', key: 'i', primary: !out.some(
                        function (a) {
                            return a.primary;
                        }) && inv.state === 'draft', title: 'Open invoice ' +
                        (inv.number || '(draft)'), onclick: function () {
                            openInvoice(inv);
                        }});
                }
                return out;
            },
            more: function (d) {
                var items = [];
                if (!d['return'] && can.write) {
                    (SHIP_STEPS[d.state] || []).forEach(function (s) {
                        if (s[0] !== 'done') {
                            items.push({label: s[1], onclick: function () {
                                step(d, s);
                            }});
                        }
                    });
                }
                if (!d['return']) {
                    items.push({label: 'Picking list', onclick: function () {
                        Rpc.report('stock.shipment.out.picking_list',
                            [d.id]).then(function (x) {
                                UI.openReport(x, 'Picking List');
                            }, UI.showError);
                    }});
                }
                if (!d['return'] && d.state === 'done' && can.sale &&
                        (d.sales || []).length) {
                    items.push({label: 'Return parts...', onclick:
                        function () {
                            returnDialog(d.sales[0]);
                        }});
                }
                (d.sales || []).forEach(function (s) {
                    if (screens.orders) {
                        items.push({label: 'Open sales order ' + s.number,
                            onclick: function () {
                                openOrder(s.id, s.number);
                            }});
                    }
                });
                if ((d.sales || []).length) {
                    items.push({label: 'Sales order lines...', onclick:
                        function () {
                            orderLinesDialog('Sales Order Lines - ' +
                                d.sales[0].number, {sale: d.sales[0].id},
                                null);
                        }});
                }
                items.push({label: 'Notes', onclick: function () {
                    notesDialog(model, d.id, (d['return'] ? 'Return ' :
                        'Shipper ') + d.number, can.write);
                }}, {label: 'Shipping activity', onclick: function () {
                    global.location.hash = '#/shipping';
                }}, '-', {label: 'Classic view', onclick: function () {
                    UI.setDocView('shipper', 'classic');
                    Screens.shipping(main, [d.id], d['return']);
                }});
                return items;
            },
            attention: function (d) {
                var out = [];
                if (d.sales_hold) {
                    out.push({tone: 'bad', icon: 'bad', title: 'The order is ' +
                        'on hold', detail: 'It ships once the order is ' +
                        'released again.', action: screens.orders &&
                        (d.sales || []).length ? {label: 'Open order',
                            onclick: function () {
                                openOrder(d.sales[0].id, d.sales[0].number);
                            }} : null});
                }
                if (d.credit_status === 'hold_shipments' && open(d)) {
                    out.push({tone: 'bad', icon: 'bad', title: 'Credit hold: ' +
                        'shipments', detail: 'Shipping asks to accept the ' +
                        'customer\'s hold.'});
                } else if (d.credit_status === 'hold_orders' && open(d)) {
                    out.push({tone: 'warn', title: 'Credit hold: orders',
                        detail: 'The customer is on a hold type credit ' +
                            'status.'});
                }
                if (open(d) && iso(d.planned_date) && iso(d.planned_date) <
                        UI.today()) {
                    out.push({tone: 'bad', icon: 'clock', title: 'Past the ' +
                        'desired ship date', detail: 'Wanted ' +
                        UI.date(d.planned_date) + '.', action: can.write &&
                        !d['return'] ? {label: 'Ship', onclick: ship} :
                        null});
                }
                var shortLines = open(d) && !d['return'] ? (d.lines || [])
                    .filter(short) : [];
                if (shortLines.length > 2) {
                    out.push({tone: 'warn', title: shortLines.length +
                        ' lines are short of stock', detail: shortLines.map(
                            function (l) {
                                return 'line ' + l.line_no + ': ' + num(
                                    l.could_ship === undefined ? l.available :
                                    l.could_ship) + ' of ' + num(
                                    l.stock_quantity === undefined ?
                                    l.quantity : l.stock_quantity);
                            }).join(', ') + '. Ship less to back order the ' +
                            'rest, or ship anyway (Jobshop ships what is on ' +
                            'hand).', action: can.write && d.state ===
                            'waiting' ? {label: 'Assign stock', onclick:
                                function () {
                                    step(d, ['assign_try', 'Assign Stock']);
                                }} : null});
                } else if (shortLines.length) {
                    shortLines.forEach(function (l) {
                        if (short(l)) {
                            out.push({tone: 'warn', title: 'Line ' +
                                l.line_no + ': ' + num(l.could_ship ===
                                    undefined ? l.available : l.could_ship) +
                                ' of ' + num(l.stock_quantity === undefined ?
                                    l.quantity : l.stock_quantity) + ' ' +
                                (l.stock_unit || l.unit || '') + ' in stock',
                                detail: 'Ship less to back order the rest, ' +
                                    'or ship it all anyway (Jobshop ships ' +
                                    'what is on hand).', action:
                                    qtyEditable(d) ? {label: 'Ship less',
                                        onclick: function () {
                                            editLine(d, l);
                                        }} : null});
                        }
                    });
                }
                (d.lines || []).forEach(function (l) {
                    if (!amountOf(l.unit_price) && d.state !== 'cancelled') {
                        out.push({tone: 'warn', title: 'Line ' + l.line_no +
                            ' has no price', detail: 'It would invoice at ' +
                            '$0: price it on the order, or on Invoicing ' +
                            '(Set Shipper Line Unit Price).'});
                    }
                });
                if (d.state === 'done' && !d['return'] &&
                        !d.js_tracking_number) {
                    out.push({tone: 'info', title: 'No tracking number',
                        detail: 'The packing list and the invoice print it.',
                        action: headEditable(d) ? {label: 'Add tracking',
                            onclick: function () {
                                UI.docEdit('Tracking', [{name:
                                    'js_tracking_number', label:
                                    'Shipment tracking no', type: 'char'}],
                                    d).then(function (v) {
                                        page.save(v).then(null,
                                            function () {});
                                    }, function () {});
                            }} : null});
                }
                var inv = ownInvoice(d);
                if (d.state === 'done' && d.js_shipper_status !== 'approved') {
                    out.push({tone: 'info', title: d['return'] ?
                        'Credit memo not posted yet' : 'Invoice not posted ' +
                        'yet', detail: 'Post it on Invoicing.', action: inv ?
                        {label: 'Open invoice', onclick: function () {
                            openInvoice(inv);
                        }} : null});
                }
                return out;
            },
            tracker: function (d) {
                if (d['return']) {
                    return {title: 'Return', steps: [
                        {label: 'Marked for return', value: money(total(d)),
                            state: 'done'},
                        {label: 'Received', value: d.state === 'done' ?
                            UI.date(d.effective_date) : 'no', state:
                            d.state === 'done' ? 'done' : 'now'},
                        {label: 'Credited', value: d.invoice_id || 'no',
                            state: d.js_shipper_status === 'approved' ?
                                'done' : d.state === 'done' ? 'now' :
                                'todo'}]};
                }
                var at = SHIP_ORDER.indexOf(d.state);
                var st = function (i) {
                    return d.state === 'cancelled' ? 'bad' : at >= i ?
                        'done' : at === i - 1 ? 'now' : 'todo';
                };
                return {title: 'Pick, pack, ship and invoice', steps: [
                    {label: 'Stock assigned', value: d.state === 'waiting' ?
                        'waiting' : at >= 2 ? 'yes' : 'no', state: st(2)},
                    {label: 'Picked', state: st(3)},
                    {label: 'Packed', state: st(4)},
                    {label: 'Shipped', value: d.state === 'done' ?
                        UI.date(d.effective_date) : money(total(d)),
                        state: st(5)},
                    {label: 'Invoiced', value: d.invoice_id || 'no', state:
                        d.js_shipper_status === 'approved' ? 'done' :
                            d.state === 'done' ? 'now' : 'todo'}]};
            },
            sections: [{title: isReturn ? 'What comes back' :
                'What ships', note: function (d) {
                    return qtyEditable(d) ? 'Click a line to ship less or ' +
                        'close it short' : 'Click a line for its stock';
                }, render: function (pane, d) {
                    var items = d.lines || [];
                    var today = UI.today();
                    UI.docLines(pane, {
                        items: items,
                        kind: function () {
                            return {icon: 'part', tone: 'part'};
                        },
                        title: function (l) {
                            return plainTitle(l.description ||
                                name(l.product));
                        },
                        chips: function (l) {
                            var c = [UI.shortName('product.product',
                                name(l.product))];
                            if (l.sale) {
                                c.push('SO ' + l.sale + (l.so_line_no ?
                                    ' line ' + l.so_line_no : ''));
                            }
                            var want = iso(l.desired_date);
                            if (want && open(d)) {
                                c.push(want < today ? {text: 'late, wanted ' +
                                    UI.date(want), tone: 'bad'} : 'wanted ' +
                                    UI.date(want));
                            }
                            if (!amountOf(l.unit_price)) {
                                c.push({text: 'no price', tone: 'warn'});
                            }
                            if (l.close_short) {
                                c.push({text: 'close short', tone: 'warn'});
                            }
                            if (l.lot) {
                                c.push('lot ' + l.lot);
                            }
                            if (l.linked) {
                                c.push({text: 'WO linked', tone: 'accent'});
                            }
                            if (l.ship_via) {
                                c.push(codeOf(l.ship_via));
                            }
                            return c;
                        },
                        progress: function (l) {
                            var want = amountOf(l.stock_quantity ===
                                undefined ? l.quantity : l.stock_quantity);
                            if (!open(d)) {
                                return {done: amountOf(l.quantity), total:
                                    amountOf(l.ordered), label: num(
                                        l.quantity) + ' of ' + num(l.ordered) +
                                    ' ordered'};
                            }
                            var have = amountOf(l.could_ship === undefined ?
                                l.available : l.could_ship);
                            return {done: Math.min(have, want), total: want,
                                label: num(have) + ' of ' + num(want) +
                                    ' in stock'};
                        },
                        right: function (l) {
                            return [money(amountOf(l.quantity) *
                                amountOf(l.unit_price)), num(l.quantity) +
                                ' ' + (l.unit || '') + ' × ' +
                                money(l.unit_price), !amountOf(l.unit_price) ?
                                    'warn' : null];
                        },
                        onclick: function (l) {
                            editLine(d, l);
                        },
                        empty: 'No shipper line.',
                        footer: ['Lines ' + money(total(d))]
                    });
                    chipTooltips(pane, items, function (l) {
                        return name(l.product);
                    });
                }}, {title: 'Charges', note: 'The order\'s charges still ' +
                    'to invoice', visible: function (d) {
                        return Boolean((d.charges || []).length);
                    }, render: function (pane, d) {
                        UI.docLines(pane, {
                            items: d.charges || [],
                            kind: function () {
                                return {icon: 'charge', tone: 'charge'};
                            },
                            title: function (c) {
                                return c.description || name(c.service_charge);
                            },
                            chips: function (c) {
                                return [codeOf(c.service_charge), c.apply ?
                                    {text: 'on this invoice', tone:
                                        'accent'} : 'not applied'];
                            },
                            right: function (c) {
                                return [money(c.amount), ''];
                            },
                            onclick: function (c) {
                                editCharge(d, c);
                            }
                        });
                    }}],
            cards: [
                {title: 'Sold to', rows: function (d) {
                    return [['Customer', idSpan(d.customer && {rec_name:
                        (d.customer_code ? d.customer_code + ' - ' : '') +
                        name(d.customer)})]].concat(addressRows(
                            addressParts(d.sold_to)));
                }},
                {title: 'Ship to', rows: function (d) {
                    return addressRows(addressParts(d.ship_to));
                }},
                {title: 'Delivery', rows: function (d) {
                    return [['Ship via', idSpan(d.ship_via)],
                        ['Carrier', idSpan(d.js_carrier)],
                        ['Tracking no', d.js_tracking_number],
                        ['FOB', idSpan(d.fob_point)],
                        ['Freight', label(FREIGHT_TERMS, d.freight_terms) ||
                            null],
                        [d['return'] ? 'Received' : 'Shipped',
                            d.effective_date ? UI.date(d.effective_date) +
                            (d.shipped_by ? ' by ' + d.shipped_by : '') :
                            null]];
                }, fields: [
                    {name: 'ship_via', label: 'Ship via', type: 'many2one',
                        model: 'nline.ship_via'},
                    {name: 'js_carrier', label: 'Carrier', type: 'many2one',
                        model: 'nline.carrier'},
                    {name: 'js_tracking_number', label: 'Shipment ' +
                        'tracking no', type: 'char'},
                    {name: 'fob_point', label: 'FOB point', type: 'many2one',
                        model: 'nline.fob_point'},
                    {name: 'freight_terms', label: 'Freight terms',
                        type: 'selection', options: FREIGHT_TERMS},
                    {name: 'effective_date', label: 'Shipped date',
                        type: 'date', value: function (d) {
                            return iso(d.effective_date);
                        }}],
                    editable: headEditable},
                {title: 'Terms and accounting', rows: function (d) {
                    return [['Terms', d.payment_term_descr ||
                        d.payment_term],
                        ['Tax group', idSpan(d.tax_group)],
                        ['Discount class', idSpan(d.discount_class)],
                        ['Receivables', idSpan(d.receivable)],
                        ['Order date', d.order_date ? UI.date(d.order_date) :
                            null],
                        ['Payment due', d.payment_due ? UI.date(
                            d.payment_due) : null]];
                }},
                {title: 'Specs', rows: function (d) {
                    return [['Printed on the shipper', d.js_specs ?
                        String(d.js_specs).slice(0, 300) : null]];
                }, fields: [{name: 'js_specs', label: 'Specs', type: 'text'}],
                    editable: headEditable}
            ],
            trail: function (d) {
                var out = (d.sales || []).map(function (s) {
                    return {done: true, text: 'Sales order ' + s.number,
                        when: label(JS_STATUS, s.js_status), onclick:
                            screens.orders ? function () {
                                openOrder(s.id, s.number);
                            } : null};
                });
                out.push({done: true, text: (d['return'] ? 'Return ' :
                    'Shipper ') + 'made', when: d.created_by});
                out.push({done: d.state === 'done', text: d['return'] ?
                    'Received' : 'Shipped', when: d.state === 'done' ?
                    UI.date(d.effective_date) : SHIP_STATE[d.state] ||
                    d.state});
                var inv = ownInvoice(d);
                out.push({done: d.js_shipper_status === 'approved', text:
                    (d['return'] ? 'Credit memo ' : 'Invoice ') +
                    (d.invoice_id || (inv ? '(draft)' : '')), when:
                    d.invoiced_date ? UI.date(d.invoiced_date) : inv ?
                    'draft' : 'not yet', onclick: inv ? function () {
                        openInvoice(inv);
                    } : null});
                if (d.printed_date) {
                    out.push({done: true, text: 'Invoice printed', when:
                        UI.date(d.printed_date)});
                }
                if (d.payment_due) {
                    out.push({done: false, text: 'Payment due', when:
                        UI.date(d.payment_due)});
                }
                out.push({text: 'Notes', onclick: function () {
                    notesDialog(model, d.id, (d['return'] ? 'Return ' :
                        'Shipper ') + d.number, can.write);
                }});
                return out;
            },
            keys: pageKeys(main, token, {
                s: {label: isReturn ? 'receive' : 'ship', run: function (d) {
                    if (open(d) && (d['return'] ? can.returns : can.write)) {
                        ship(d);
                    }
                }},
                p: {label: 'packing list', run: function (d) {
                    if (!d['return']) {
                        packingList(d);
                    }
                }},
                i: {label: 'invoice', run: function (d) {
                    var inv = ownInvoice(d);
                    if (inv) {
                        openInvoice(inv);
                    }
                }}
            }),
            classic: function (d) {
                UI.setDocView('shipper', 'classic');
                Screens.shipping(main, d && d.id ? [d.id] : [], isReturn);
            }
        });
        token.root = main.querySelector('.dp-page');
        return page;
    }

    /* The Shipping window: the Shipping Activity (Jobshop's window) lists
     * the work; a shipper opens as its modern page (default) or in the
     * classic window */
    Screens.shipping = function (main, params, isReturn) {
        startPage(main);
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        isReturn = Boolean(isReturn || queryParam('return') === '1');
        if (openId && UI.docPage && UI.docView('shipper') === 'modern') {
            injectCss();
            shipperModern(main, openId, isReturn);
            return;
        }
        main._salesPage = null;
        classicShipping(main, params, isReturn);
    };

    /* ---- Invoicing: the invoice as a document ---------------------------- */

    var INVOICE_STATE = {draft: 'Draft', validated: 'Validated',
        posted: 'Posted', paid: 'Paid', cancelled: 'Cancelled'};

    function invoiceModern(main, openId) {
        var token = startPage(main);
        var can = {write: true, create: true};
        var screens = {orders: false, shipping: false};
        var page;
        rights(['account.invoice']).then(function (r) {
            can.write = r['account.invoice'].write;
            can.create = r['account.invoice'].create;
            if (page) {
                page.render();
            }
        }, function () {});
        Object.keys(screens).forEach(function (s) {
            UI.screenAllowed(s).then(function (ok) {
                screens[s] = ok;
                if (page && ok) {
                    page.render();
                }
            });
        });

        function draft(d) {
            return d.state === 'draft' && can.write;
        }

        function posted(d) {
            return d.state === 'posted' || d.state === 'paid';
        }

        function memo(d) {
            return amountOf(d.total_amount) < 0;
        }

        function noun(d) {
            return memo(d) ? 'Credit memo' : 'Invoice';
        }

        /* The payload of sales_invoice_save (a draft invoice) */
        function values(d) {
            return {id: d.id, invoice_date: iso(d.invoice_date),
                reference: d.reference || null,
                description: d.description || null,
                comment: d.comment || null,
                payment_term: idOf(d.payment_term),
                lines: (d.lines || []).map(function (l) {
                    return {id: l.id, quantity: amountOf(l.quantity),
                        unit_price: String(amountOf(l.unit_price)),
                        description: l.description || null};
                }),
                charges: (d.charges || []).map(function (c) {
                    return {id: c.id || null, service_charge:
                        c.service_charge, description: c.description || '',
                        amount: c.amount === null || c.amount === undefined ?
                            null : String(c.amount), tax_group:
                            idOf(c.tax_group)};
                })};
        }

        function markPrinted(id) {
            Rpc.desk('sales_invoice_printed', [[id]]).then(function () {
                page.reload();
            }, function () {});
        }

        function print(d) {
            Rpc.report('account.invoice', [d.id]).then(function (r) {
                UI.openReport(r, noun(d));
                markPrinted(d.id);
            }, UI.showError);
        }

        function post(d) {
            UI.confirm('Post', 'Post ' + noun(d).toLowerCase() + ' of ' +
                money(d.total_amount) + ' to ' + (name(d.party) ||
                    d.customer_code) + ' and print it?').then(function (ok) {
                    if (!ok) {
                        return;
                    }
                    Rpc.model('account.invoice', 'post', [[d.id]]).then(
                        function () {
                            UI.toast(noun(d) + ' posted', 'ok');
                            Rpc.report('account.invoice', [d.id]).then(
                                function (r) {
                                    UI.openReport(r, noun(d));
                                    markPrinted(d.id);
                                }, function () {
                                    page.reload();
                                });
                        }, UI.showError);
                });
        }

        function creditMemo(d) {
            UI.confirm('Credit memo', 'Issue a credit memo for invoice ' +
                d.number + '?').then(function (ok) {
                    if (!ok) {
                        return;
                    }
                    Rpc.desk('sales_credit_memo', [d.id]).then(function (m) {
                        UI.toast('Credit memo made: check and post it', 'ok');
                        global.history.replaceState(null, '',
                            '#/invoicing/' + m.id);
                        page.load(m.id);
                    }, UI.showError);
                });
        }

        function editLine(d, l) {
            var ro = !draft(d);
            UI.docEdit('Line ' + l.line_no + (l.product ? ' · ' +
                UI.shortName('product.product', name(l.product)) : ''), [
                {name: 'description', label: 'Description', type: 'char',
                    wide: true, readonly: ro},
                {name: 'quantity', label: 'Ship qty (from the shipper)',
                    type: 'float', readonly: true},
                {name: 'unit_price', label: 'Unit price', type: 'float',
                    readonly: ro},
                {name: 'trade_discount', label: 'Trade disc % (the ' +
                    'order line\'s)', type: 'float', readonly: true},
                {name: 'po_line', label: 'Customer PO line', type: 'char',
                    readonly: true}], l).then(function (v) {
                    if (ro) {
                        return;
                    }
                    l.description = v.description;
                    l.unit_price = v.unit_price === null ? 0 : v.unit_price;
                    page.save({}).then(null, function () {});
                }, function () {});
        }

        function editCharge(d, c) {
            var ro = !draft(d);
            UI.docEdit('Charge ' + codeOf(c.service_charge), [
                {name: 'amount', label: 'Amount', type: 'float',
                    readonly: ro},
                ro ? null : {name: '_remove', label: 'Remove it (it waits ' +
                    'for the next invoice)', type: 'boolean'}].filter(
                Boolean), c).then(function (v) {
                    if (ro) {
                        return;
                    }
                    if (v._remove) {
                        d.charges = d.charges.filter(function (x) {
                            return x !== c;
                        });
                    } else {
                        c.amount = v.amount;
                    }
                    page.save({}).then(null, function () {});
                }, function () {});
        }

        function addCharge(d) {
            UI.docEdit('Add a service charge', [
                {name: 'service_charge', label: 'Service charge',
                    type: 'many2one', model: 'nline.service_charge'},
                {name: 'description', label: 'Description (empty: the ' +
                    'charge\'s)', type: 'char', wide: true},
                {name: 'amount', label: 'Amount (empty: the charge\'s)',
                    type: 'float'}], {}).then(function (v) {
                    if (!v.service_charge) {
                        UI.toast('Choose the service charge', 'error');
                        return;
                    }
                    d.charges = (d.charges || []).concat([{id: null,
                        service_charge: v.service_charge, description:
                            v.description || '', amount: v.amount}]);
                    page.save({}).then(null, function () {});
                }, function () {});
        }

        function openOrderOf(d) {
            var s = (d.sales || [])[0];
            if (s && screens.orders) {
                openOrder(s.id, s.number);
            }
        }

        page = UI.docPage(main, {
            title: 'Invoice',
            crumbs: ['Sales', 'Invoicing'],
            model: 'account.invoice', label: 'Invoice ID',
            domain: [['type', '=', 'out']],
            order: [['invoice_date', 'DESC'], ['id', 'DESC']],
            openId: openId,
            load: function (id) {
                return Rpc.desk('sales_invoice_get', [id]);
            },
            values: values,
            save: function (v) {
                return UI.service('sales_invoice_save', v);
            },
            head: function (d) {
                var sales = (d.sales || []).map(function (s) {
                    return s.number;
                }).join(', ');
                var due = amountOf(d.amount_to_pay);
                return {
                    title: name(d.party) || d.customer_code,
                    chips: d.customer_code ? [d.customer_code] : [],
                    sub: [d.number ? noun(d) + ' ' + d.number : 'Draft ' +
                        noun(d).toLowerCase(),
                        d.invoice_date ? 'dated ' + UI.date(d.invoice_date) :
                            null,
                        sales ? 'for SO ' + sales : null,
                        d.reference ? 'PO ' + d.reference : null,
                        posted(d) && due > 0 ? dueSub('due', d.payment_due,
                            true) : null],
                    amount: posted(d) ? {value: money(due), label:
                        (d.state === 'paid' ? 'paid in full, ' : 'due of ') +
                        money(d.total_amount)} : {value: money(
                            d.total_amount), label: d.state === 'cancelled' ?
                            'cancelled' : 'total, not posted'}
                };
            },
            status: function (d) {
                var tone = {posted: 'accent', paid: 'ok', cancelled: 'bad',
                    draft: 'warn'};
                var out = [{text: INVOICE_STATE[d.state] || d.state,
                    tone: tone[d.state]}];
                if (memo(d)) {
                    out.push({text: 'Credit memo', tone: 'accent'});
                }
                out.push({text: d.js_printed_date ? 'Printed ' +
                    UI.date(d.js_printed_date) : 'Not printed'});
                if (d.exported) {
                    out.push({text: 'Exported' + (d.exported_date ? ' ' +
                        UI.date(d.exported_date) : ''), tone: 'ok'});
                }
                return out;
            },
            actions: function (d) {
                return [
                    draft(d) ? {label: 'Post', key: 'o', primary: true,
                        title: 'Post and print', onclick: post} : null,
                    {label: 'Print', key: 'p', onclick: print},
                    posted(d) && !memo(d) && can.create ? {label: 'Credit ' +
                        'memo', onclick: creditMemo} : null];
            },
            more: function (d) {
                var items = [];
                (d.sales || []).forEach(function (s) {
                    if (screens.orders) {
                        items.push({label: 'Open sales order ' + s.number,
                            onclick: function () {
                                openOrder(s.id, s.number);
                            }});
                    }
                });
                (d.shippers || []).forEach(function (s) {
                    if (screens.shipping) {
                        items.push({label: 'Open ' + (s.model ===
                            'stock.shipment.out.return' ? 'return ' :
                            'shipper ') + s.number, onclick: function () {
                                UI.openScreen('shipping/' + s.id + (s.model ===
                                    'stock.shipment.out.return' ?
                                    '?return=1' : ''), 'Shipper ' +
                                    s.number);
                            }});
                    }
                });
                items.push({label: 'Notes', onclick: function () {
                    notesDialog('account.invoice', d.id, noun(d) + ' ' +
                        (d.number || '(draft)'), can.write);
                }}, {label: 'Invoicing activity', onclick: function () {
                    global.location.hash = '#/invoicing';
                }}, '-', {label: 'Classic view', onclick: function () {
                    UI.setDocView('invoice', 'classic');
                    Screens.invoicing(main, [d.id]);
                }});
                return items;
            },
            attention: function (d) {
                var out = [];
                if (d.state === 'draft') {
                    (d.lines || []).forEach(function (l) {
                        if (!amountOf(l.unit_price)) {
                            out.push({tone: 'warn', title: 'Line ' +
                                l.line_no + ' has no price', detail:
                                'It would invoice at $0.', action: draft(d) ?
                                {label: 'Set price', onclick: function () {
                                    editLine(d, l);
                                }} : null});
                        }
                    });
                    if (!d.reference && !memo(d)) {
                        out.push({tone: 'warn', title: 'No customer PO ' +
                            'reference', detail: 'Most customers pay ' +
                            'against their PO number.', action: draft(d) ?
                            {label: 'Add PO', onclick: function () {
                                UI.docEdit('Customer PO', [{name: 'reference',
                                    label: 'Purchase order no', type:
                                    'char'}], d).then(function (v) {
                                        page.save(v).then(null,
                                            function () {});
                                    }, function () {});
                            }} : null});
                    }
                    out.push({tone: 'info', title: memo(d) ? 'Credit memo ' +
                        'to check and post' : 'Not posted yet', detail:
                        'The customer owes nothing until it is posted.',
                        action: draft(d) ? {label: 'Post', onclick:
                            function () {
                                post(d);
                            }} : null});
                }
                var due = iso(d.payment_due);
                if (posted(d) && amountOf(d.amount_to_pay) > 0 && due &&
                        due < UI.today()) {
                    out.push({tone: 'bad', icon: 'clock', title: 'Overdue',
                        detail: money(d.amount_to_pay) + ' was due ' +
                            UI.date(due) + '.'});
                }
                if (posted(d) && !d.js_printed_date) {
                    out.push({tone: 'info', title: 'Not printed or sent',
                        action: {label: 'Print', onclick: function () {
                            print(d);
                        }}});
                }
                return out;
            },
            tracker: function (d) {
                var paid = amountOf(d.paid_amount);
                return {title: memo(d) ? 'Credit' : 'Invoice and payment',
                    steps: [
                        {label: 'Drafted', value: money(d.total_amount),
                            state: d.state === 'cancelled' ? 'bad' : 'done'},
                        {label: 'Posted', value: d.exported_date ? UI.date(
                            d.exported_date) : posted(d) ? 'yes' : 'no',
                            state: posted(d) ? 'done' : d.state ===
                                'cancelled' ? 'todo' : 'now'},
                        {label: 'Printed', value: d.js_printed_date ?
                            UI.date(d.js_printed_date) : 'no', state:
                            d.js_printed_date ? 'done' : 'todo'},
                        {label: memo(d) ? 'Applied' : 'Paid', value:
                            money(paid), state: d.state === 'paid' ? 'done' :
                                paid ? 'now' : 'todo'}]};
            },
            sections: [{title: 'What is invoiced', note:
                function (d) {
                    return draft(d) ? 'Click a line to price it' :
                        'Posted: the lines are fixed';
                }, render: function (pane, d) {
                    var items = d.lines || [];
                    UI.docLines(pane, {
                        items: items,
                        kind: function (l) {
                            return l.product ? {icon: 'part', tone: 'part'} :
                                {icon: 'charge', tone: 'charge'};
                        },
                        title: function (l) {
                            return plainTitle(l.description ||
                                name(l.product));
                        },
                        chips: function (l) {
                            var c = [];
                            if (l.product) {
                                c.push(UI.shortName('product.product',
                                    name(l.product)));
                            }
                            if (l.sale) {
                                c.push('SO ' + l.sale);
                            }
                            if (l.po_line) {
                                c.push('PO line ' + l.po_line);
                            }
                            if (!amountOf(l.unit_price)) {
                                c.push({text: 'no price', tone: 'warn'});
                            }
                            if (l.transacted) {
                                c.push({text: 'shipped', tone: 'ok'});
                            }
                            return c;
                        },
                        right: function (l) {
                            var disc = amountOf(l.trade_discount);
                            return [money(l.amount), num(l.quantity) + ' ' +
                                (l.unit || '') + ' × ' + money(l.unit_price) +
                                (disc ? ' (disc ' + num(disc) + '%)' : ''),
                                !amountOf(l.unit_price) ? 'warn' : null];
                        },
                        onclick: function (l) {
                            editLine(d, l);
                        },
                        empty: 'No invoice line.',
                        footer: ['Lines ' + money(amountOf(d.untaxed_amount) -
                            amountOf(d.charges_amount)), 'Charges ' +
                            money(d.charges_amount), 'Tax ' +
                            money(d.tax_amount), 'Total ' +
                            money(d.total_amount)]
                    });
                    chipTooltips(pane, items, function (l) {
                        return l.product ? name(l.product) : '';
                    });
                }}, {title: 'Charges', visible: function (d) {
                    return Boolean((d.charges || []).length || draft(d));
                }, render: function (pane, d) {
                    UI.docLines(pane, {
                        items: d.charges || [],
                        kind: function () {
                            return {icon: 'charge', tone: 'charge'};
                        },
                        title: function (c) {
                            return c.description || name(c.service_charge);
                        },
                        chips: function (c) {
                            return [codeOf(c.service_charge)];
                        },
                        right: function (c) {
                            return [money(c.amount), ''];
                        },
                        onclick: function (c) {
                            editCharge(d, c);
                        },
                        empty: 'No charge.',
                        add: draft(d) ? {placeholder: 'Add a service charge',
                            onclick: function () {
                                addCharge(d);
                            }} : null,
                        footer: ['Charges ' + money(d.charges_amount)]
                    });
                }}, {title: 'Taxes', visible: function (d) {
                    return Boolean((d.taxes || []).length);
                }, render: function (pane, d) {
                    UI.docLines(pane, {
                        items: d.taxes || [],
                        kind: function () {
                            return {icon: 'doc', tone: 'muted'};
                        },
                        title: function (t) {
                            return t.description || 'Tax';
                        },
                        chips: function (t) {
                            return [t.percent !== null && t.percent !==
                                undefined ? num(t.percent) + '%' : null,
                                t.account ? codeOf(t.account) : null];
                        },
                        right: function (t) {
                            return [money(t.amount), 'on ' + money(t.base)];
                        },
                        footer: ['Tax ' + money(d.tax_amount)]
                    });
                }}],
            cards: [
                {title: 'Bill to', rows: function (d) {
                    return [['Customer', idSpan(d.party && {rec_name:
                        (d.customer_code ? d.customer_code + ' - ' : '') +
                        name(d.party)})]].concat(addressRows(addressParts(
                            d.bill_to, d.customer_mobile)));
                }},
                {title: 'Ship to', rows: function (d) {
                    return addressRows(addressParts(d.ship_to));
                }},
                {title: 'Terms', rows: function (d) {
                    return [['Terms', d.payment_term_descr ||
                        name(d.payment_term)],
                        ['Invoice date', d.invoice_date ? UI.date(
                            d.invoice_date) : null],
                        ['Customer PO', d.reference],
                        ['Payment due', d.payment_due ? UI.date(
                            d.payment_due) : null],
                        ['Paid', money(d.paid_amount)],
                        ['Receivables', idSpan(d.receivable)]];
                }, fields: [
                    {name: 'payment_term', label: 'Terms', type: 'many2one',
                        model: 'account.invoice.payment_term'},
                    {name: 'invoice_date', label: 'Invoice date (empty: ' +
                        'the posting day)', type: 'date', value: function (d) {
                            return iso(d.invoice_date);
                        }},
                    {name: 'reference', label: 'Customer PO', type: 'char'}],
                    editable: draft},
                {title: 'Delivery', rows: function (d) {
                    return [['Shipped', (d.shippers || []).map(function (s) {
                        return s.number + (s.date ? ' ' + UI.date(s.date) :
                            '');
                    }).join(', ') || null],
                        ['Ship via', idSpan(d.ship_via)],
                        ['Carrier', idSpan(d.js_carrier)],
                        ['FOB', idSpan(d.fob_point)],
                        ['Freight', label(FREIGHT_TERMS, d.freight_terms) ||
                            null],
                        ['Tax group', idSpan(d.tax_group)]];
                }},
                {title: 'Specs and notes', rows: function (d) {
                    return [['Printed on the invoice', d.comment ?
                        String(d.comment).slice(0, 300) : null],
                        ['Memo', d.description]];
                }, fields: [
                    {name: 'comment', label: 'Specs (printed)', type: 'text'},
                    {name: 'description', label: 'Memo', type: 'char'}],
                    editable: draft}
            ],
            trail: function (d) {
                var out = (d.sales || []).map(function (s) {
                    return {done: true, text: 'Sales order ' + s.number,
                        when: UI.date(s.sale_date), onclick: screens.orders ?
                            function () {
                                openOrder(s.id, s.number);
                            } : null};
                });
                (d.shippers || []).forEach(function (s) {
                    out.push({done: Boolean(s.date), text: (s.model ===
                        'stock.shipment.out.return' ? 'Return ' :
                        'Shipper ') + s.number, when: s.date ?
                        UI.date(s.date) : '', onclick: screens.shipping ?
                        function () {
                            UI.openScreen('shipping/' + s.id + (s.model ===
                                'stock.shipment.out.return' ? '?return=1' :
                                ''), 'Shipper ' + s.number);
                        } : null});
                });
                out.push({done: true, text: noun(d) + ' drafted', when:
                    d.created_by});
                out.push({done: posted(d), text: 'Posted', when: posted(d) ?
                    (d.exported_date ? UI.date(d.exported_date) : '') :
                    'not yet'});
                out.push({done: Boolean(d.js_printed_date), text:
                    'Printed / sent', when: d.js_printed_date ?
                    UI.date(d.js_printed_date) : 'not yet'});
                if (posted(d)) {
                    out.push({done: false, text: 'Payment due', when:
                        d.payment_due ? UI.date(d.payment_due) : ''});
                }
                out.push({done: d.state === 'paid', text: 'Paid', when:
                    d.state === 'paid' ? money(d.paid_amount) :
                    amountOf(d.paid_amount) ? money(d.paid_amount) +
                    ' so far' : 'not yet'});
                out.push({text: 'Notes', onclick: function () {
                    notesDialog('account.invoice', d.id, noun(d) + ' ' +
                        (d.number || '(draft)'), can.write);
                }});
                return out;
            },
            keys: pageKeys(main, token, {
                p: {label: 'print', run: function (d) {
                    print(d);
                }},
                o: {label: 'post', run: function (d) {
                    if (draft(d)) {
                        post(d);
                    }
                }}
            }),
            classic: function (d) {
                UI.setDocView('invoice', 'classic');
                Screens.invoicing(main, d && d.id ? [d.id] : []);
            }
        });
        token.root = main.querySelector('.dp-page');
        return page;
    }

    /* The Invoicing window: the Invoicing Activity (Jobshop's window)
     * lists the work; an invoice opens as its modern page (default) or in
     * the classic window */
    Screens.invoicing = function (main, params) {
        startPage(main);
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        if (openId && UI.docPage && UI.docView('invoice') === 'modern') {
            injectCss();
            invoiceModern(main, openId);
            return;
        }
        main._salesPage = null;
        classicInvoicing(main, params);
    };

    /* ---- Customers: the customer as a master record ---------------------- */

    var CUSTOMER_REFS = ['sold_to_subdivision', 'sold_to_country',
        'sales_rep', 'territory', 'customer_fob_point', 'customer_ship_via',
        'carrier', 'customer_sic_code', 'discount_class',
        'customer_tax_group', 'customer_payment_term', 'account_receivable',
        'create_uid', 'write_uid'];
    var CUSTOMER_FIELDS = ['code', 'name', 'customer_inactive',
        'customer_exported', 'customer_exported_date', 'customer_contact',
        'contact_title', 'customer_phone', 'customer_fax', 'customer_email',
        'customer_mobile', 'sold_to_name', 'sold_to_address_1',
        'sold_to_address_2', 'sold_to_city', 'sold_to_postal_code',
        'customer_open_date', 'customer_last_order_date',
        'customer_open_orders', 'customer_open_order_count',
        'our_supplier_id', 'customer_freight_terms', 'credit_status',
        'credit_limit', 'customer_tax_id_number', 'customer_tax_exempt',
        'quote_instructions', 'sales_instructions', 'customer_specs',
        'create_date', 'write_date'];

    function customerModern(main, openId) {
        var token = startPage(main);
        var can = {write: true, create: true, address: true, contact: true,
            order: true};
        var screens = {orders: false, invoicing: false, quotes: false};
        var page;
        rights(['party.party', 'party.address', 'party.contact_mechanism',
            'sale.sale']).then(function (r) {
                can.write = r['party.party'].write;
                can.create = r['party.party'].create;
                can.address = r['party.address'].write &&
                    r['party.address'].create;
                can.contact = r['party.contact_mechanism'].write &&
                    r['party.contact_mechanism'].create;
                can.order = r['sale.sale'].create;
                if (page) {
                    page.render();
                }
            }, function () {});
        Object.keys(screens).forEach(function (s) {
            UI.screenAllowed(s).then(function (ok) {
                screens[s] = ok;
                if (page && ok) {
                    page.render();
                }
            });
        });

        function load(id) {
            var fields = CUSTOMER_FIELDS.concat(CUSTOMER_REFS,
                CUSTOMER_REFS.map(function (n) {
                    return n + '.rec_name';
                }));
            return Promise.all([
                Rpc.model('party.party', 'read', [[id], fields]),
                Rpc.model('party.party', 'read', [[id], ['receivable']])
                    .then(function (rows) {
                        return rows[0] ? rows[0].receivable : null;
                    }, function () {
                        return null;
                    }),
                Rpc.searchRead('sale.sale', [['party', '=', id],
                    ['js_status', 'in', ['unreleased', 'firm', 'released',
                        'hold']]], ['number', 'js_status', 'reference',
                    'sale_date', 'shipping_date', 'promise_date',
                    'total_amount', 'js_shipped_amount'], {limit: 100,
                        order: [['shipping_date', 'ASC'], ['id', 'ASC']]})
                    .then(null, function () {
                        return null;
                    }),
                Rpc.searchRead('account.invoice', [['party', '=', id],
                    ['type', '=', 'out'], ['state', 'in', ['draft',
                        'posted']]], ['number', 'invoice_date', 'state',
                    'reference', 'total_amount', 'amount_to_pay'],
                    {limit: 100, order: [['invoice_date', 'ASC'],
                        ['id', 'ASC']]}).then(null, function () {
                        return null;
                    }),
                Rpc.searchRead('party.contact_mechanism', [['party', '=',
                    id]], ['type', 'value', 'name'], {order: [['sequence',
                        'ASC'], ['id', 'ASC']]}).then(null, function () {
                        return [];
                    }),
                Rpc.searchRead('party.address', [['party', '=', id]],
                    ['party_name', 'street', 'city', 'postal_code',
                        'subdivision', 'country', 'ship_to_default',
                        'ship_to_contact', 'ship_to_phone', 'ship_to_email',
                        'invoice', 'delivery'], {order: [['sequence', 'ASC'],
                            ['id', 'ASC']]}).then(null, function () {
                        return [];
                    })
            ]).then(function (all) {
                var d = all[0][0];
                CUSTOMER_REFS.forEach(function (n) {
                    d[n] = d[n] ? {id: d[n], rec_name: (d[n + '.'] || {})
                        .rec_name || ''} : null;
                });
                d.receivable = all[1];
                d._orders = all[2];
                d._invoices = all[3];
                d._contacts = all[4];
                d._addresses = all[5];
                d.number = d.code;
                return d;
            });
        }

        function editable() {
            return can.write;
        }

        function newOrder(d) {
            UI.openScreen('orders/new?customer=' + d.id, 'New order');
        }

        function overLimit(d) {
            var limit = amountOf(d.credit_limit);
            var used = amountOf(d.customer_open_orders) +
                amountOf(d.receivable);
            return limit > 0 && used > limit ? used : 0;
        }

        function editContact(d, c) {
            UI.docEdit(c.id ? 'Contact' : 'Add a contact', [
                {name: 'type', label: 'Type', type: 'selection',
                    options: CONTACT_TYPES},
                {name: 'value', label: 'Number or address', type: 'char',
                    wide: true},
                {name: 'name', label: 'Person', type: 'char'},
                c.id ? {name: '_remove', label: 'Remove it',
                    type: 'boolean'} : null].filter(Boolean), c).then(
                function (v) {
                    var remove = v._remove;
                    delete v._remove;
                    var call = c.id ? remove ? Rpc.model(
                        'party.contact_mechanism', 'delete', [[c.id]]) :
                        Rpc.model('party.contact_mechanism', 'write',
                            [[c.id], v]) : Rpc.model(
                        'party.contact_mechanism', 'create', [[Object.assign(
                            {party: d.id}, v)]]);
                    call.then(function () {
                        page.reload();
                    }, UI.showError);
                }, function () {});
        }

        function editAddress(d, a) {
            UI.docEdit(a.id ? 'Address ' + a.id : 'Add a ship to address', [
                {name: 'party_name', label: 'Name', type: 'char',
                    wide: true},
                {name: 'street', label: 'Street', type: 'text', wide: true},
                {name: 'city', label: 'City', type: 'char'},
                {name: 'postal_code', label: 'Postal code', type: 'char'},
                {name: 'subdivision', label: 'State', type: 'many2one',
                    model: 'country.subdivision', value: function (x) {
                        return x.subdivision ? {id: x.subdivision, rec_name:
                            x['subdivision.rec_name'] || ''} : null;
                    }},
                {name: 'country', label: 'Country', type: 'many2one',
                    model: 'country.country', value: function (x) {
                        return x.country ? {id: x.country, rec_name:
                            x['country.rec_name'] || ''} : null;
                    }},
                {name: 'ship_to_contact', label: 'Contact', type: 'char'},
                {name: 'ship_to_phone', label: 'Contact phone',
                    type: 'char'},
                {name: 'ship_to_email', label: 'Contact e-mail',
                    type: 'char'},
                {name: 'ship_to_default', label: 'Default ship to',
                    type: 'boolean'},
                {name: 'delivery', label: 'Ships here', type: 'boolean'},
                {name: 'invoice', label: 'Bills here', type: 'boolean'}],
                a.id ? a : {delivery: true}).then(function (v) {
                    var call = a.id ? Rpc.model('party.address', 'write',
                        [[a.id], v]) : Rpc.model('party.address', 'create',
                        [[Object.assign({party: d.id}, v)]]);
                    call.then(function () {
                        page.reload();
                    }, UI.showError);
                }, function () {});
        }

        function nameIt(d) {
            UI.docEdit('New customer', [
                {name: 'code', label: 'Customer ID (empty: automatic)',
                    type: 'char'},
                {name: 'name', label: 'Name', type: 'char', wide: true}], d)
                .then(function (v) {
                    if (!v.name) {
                        UI.toast('Type the name', 'error');
                        return;
                    }
                    if (!v.code) {
                        delete v.code;
                    }
                    page.save(v).then(null, function () {});
                }, function () {});
        }

        var refField = function (n, caption, model, extra) {
            return Object.assign({name: n, label: caption, type: 'many2one',
                model: model}, extra || {});
        };

        page = UI.docPage(main, {
            title: 'Customer',
            crumbs: ['Sales', 'Customers'],
            model: 'party.party', label: 'Customer ID',
            order: [['name', 'ASC']],
            openId: openId,
            load: load,
            /* Only the changes are written (a master record) */
            values: function () {
                return {};
            },
            save: function (v, d) {
                Object.keys(v).forEach(function (k) {
                    if (k.charAt(0) === '_') {
                        delete v[k];
                    }
                });
                if (!d.id) {
                    if (!v.name && !d.name) {
                        return Promise.reject({message: 'Type the ' +
                            'customer\'s name first.'});
                    }
                    return Rpc.model('party.party', 'create', [[Object.assign(
                        {name: d.name}, v)]]).then(function (ids) {
                            global.history.replaceState(null, '',
                                '#/customer-window/' + ids[0]);
                            return load(ids[0]);
                        });
                }
                return Rpc.model('party.party', 'write', [[d.id], v]).then(
                    function () {
                        return load(d.id);
                    });
            },
            blank: function () {
                return can.create ? {id: null, name: '', code: '',
                    credit_status: 'approved', _orders: [], _invoices: [],
                    _contacts: [], _addresses: []} : null;
            },
            head: function (d) {
                return {
                    title: d.name || 'New customer',
                    chips: d.code ? [d.code] : [],
                    sub: [d.id ? null : 'Not saved yet',
                        d.customer_open_date ? 'customer since ' +
                            UI.date(d.customer_open_date) : null,
                        d.customer_last_order_date ? 'last order ' +
                            UI.date(d.customer_last_order_date) : null,
                        d.sales_rep ? 'rep ' + codeOf(d.sales_rep) : null,
                        d.customer_phone || null],
                    amount: d.id ? {value: money(d.receivable), label:
                        'open balance · ' + (d.customer_open_order_count ||
                            0) + ' open orders ' +
                        money(d.customer_open_orders)} : null
                };
            },
            status: function (d) {
                var tone = {approved: 'ok', hold_orders: 'bad',
                    hold_shipments: 'warn'};
                var out = [{text: 'Credit ' + (label(CREDIT_STATUS,
                    d.credit_status) || 'Approved').toLowerCase(),
                    tone: tone[d.credit_status || 'approved']},
                    d.customer_inactive ? {text: 'Inactive', tone: 'muted'} :
                        {text: 'Active', tone: 'accent'}];
                if (d.customer_exported) {
                    out.push({text: 'Exported', tone: 'ok'});
                }
                if (d.customer_tax_exempt) {
                    out.push({text: 'Tax exempt'});
                }
                return out;
            },
            actions: function (d) {
                if (!d.id) {
                    return [];
                }
                return [can.order && screens.orders ? {label: 'New order',
                    key: 'n', primary: true, onclick: newOrder} : null];
            },
            more: function (d) {
                var items = [];
                if (d.id) {
                    items.push({label: 'Sales order lines...', onclick:
                        function () {
                            orderLinesDialog('Sales Order Lines - ' + d.name,
                                {party: d.id}, null);
                        }});
                    items.push({label: 'Notes', onclick: function () {
                        notesDialog('party.party', d.id, d.name, can.write);
                    }});
                }
                items.push('-', {label: 'Classic view (prices, quotes, ' +
                    'footers)', onclick: function () {
                        UI.setDocView('customer', 'classic');
                        Screens.customerWindow(main, d.id ? [d.id] : []);
                    }});
                return items;
            },
            attention: function (d) {
                var out = [];
                if (!d.id) {
                    out.push({tone: 'info', title: 'Name the new customer',
                        action: can.create ? {label: 'Name it', onclick:
                            function () {
                                nameIt(d);
                            }} : null});
                    return out;
                }
                if (d.credit_status === 'hold_orders' ||
                        d.credit_status === 'hold_shipments') {
                    out.push({tone: 'bad', icon: 'bad', title: 'Credit hold: ' +
                        label(CREDIT_STATUS, d.credit_status), detail:
                        d.credit_status === 'hold_orders' ? 'New orders ask ' +
                        'to accept the hold.' : 'Shipping asks to accept ' +
                        'the hold.', action: editable() ? {label: 'Approve',
                            onclick: function () {
                                UI.confirm('Credit status', 'Approve the ' +
                                    'credit of ' + d.name + '?').then(
                                    function (ok) {
                                        if (ok) {
                                            page.save({credit_status:
                                                'approved'}).then(null,
                                                function () {});
                                        }
                                    });
                            }} : null});
                }
                var used = overLimit(d);
                if (used) {
                    out.push({tone: 'warn', title: 'Over the order limit',
                        detail: money(used) + ' open (orders and balance) ' +
                            'against a limit of ' +
                            money(d.credit_limit) + '.', action: editable() ?
                            {label: 'Change limit', onclick: function () {
                                UI.docEdit('Order limit', [{name:
                                    'credit_limit', label: 'Order limit ' +
                                    '(0: none)', type: 'money'}], d).then(
                                    function (v) {
                                        page.save(v).then(null,
                                            function () {});
                                    }, function () {});
                            }} : null});
                }
                if (!d.customer_payment_term) {
                    out.push({tone: 'warn', title: 'No payment terms',
                        detail: 'New orders and invoices take the terms ' +
                            'from here.', action: editable() ? {label:
                            'Set terms', onclick: function () {
                                UI.docEdit('Terms', [refField(
                                    'customer_payment_term', 'Terms',
                                    'account.invoice.payment_term')], d).then(
                                    function (v) {
                                        page.save(v).then(null,
                                            function () {});
                                    }, function () {});
                            }} : null});
                }
                if (!d.customer_phone && !d.customer_email) {
                    out.push({tone: 'info', title: 'No phone or e-mail',
                        action: editable() ? {label: 'Add', onclick:
                            function () {
                                UI.docEdit('Contact', [
                                    {name: 'customer_contact', label:
                                        'Contact', type: 'char'},
                                    {name: 'customer_phone', label: 'Phone',
                                        type: 'char'},
                                    {name: 'customer_email', label: 'E-mail',
                                        type: 'char'}], d).then(function (v) {
                                        page.save(v).then(null,
                                            function () {});
                                    }, function () {});
                            }} : null});
                }
                if (d.customer_inactive) {
                    out.push({tone: 'info', title: 'Inactive', detail:
                        'Left out of the lists and lookups.', action:
                        editable() ? {label: 'Make active', onclick:
                            function () {
                                page.save({customer_inactive: false}).then(
                                    null, function () {});
                            }} : null});
                }
                var late = (d._orders || []).filter(function (o) {
                    return o.js_status === 'released' && iso(o.shipping_date) &&
                        iso(o.shipping_date) < UI.today();
                });
                if (late.length) {
                    out.push({tone: 'warn', icon: 'clock', title: late.length +
                        ' released order(s) past the desired ship date',
                        detail: late.map(function (o) {
                            return o.number;
                        }).join(', ')});
                }
                return out;
            },
            sections: [{title: 'Open orders', note: function (d) {
                return (d._orders || []).length + ' unreleased, firm, ' +
                    'released or on hold';
            }, visible: function (d) {
                return Boolean(d.id && d._orders);
            }, render: function (pane, d) {
                var today = UI.today();
                UI.docLines(pane, {
                    items: d._orders,
                    kind: function () {
                        return {icon: 'doc', tone: 'part'};
                    },
                    title: function (o) {
                        return 'SO ' + (o.number || o.id) + (o.reference ?
                            ' · PO ' + o.reference : '');
                    },
                    chips: function (o) {
                        var want = iso(o.shipping_date);
                        return [{text: label(JS_STATUS, o.js_status), tone:
                            SO_STATUS_TONE[o.js_status]}, 'ordered ' +
                            UI.date(o.sale_date), want ? want < today &&
                            o.js_status === 'released' ? {text: 'late, ' +
                                'wanted ' + UI.date(want), tone: 'bad'} :
                            'wanted ' + UI.date(want) : null];
                    },
                    progress: function (o) {
                        var t = amountOf(o.total_amount);
                        var s = amountOf(o.js_shipped_amount);
                        return {done: s, total: t, label: money(s) +
                            ' shipped'};
                    },
                    right: function (o) {
                        return [money(o.total_amount), ''];
                    },
                    onclick: screens.orders ? function (o) {
                        openOrder(o.id, o.number);
                    } : null,
                    empty: 'No open order.',
                    add: can.order && screens.orders ? {placeholder:
                        'New order', onclick: function () {
                            newOrder(d);
                        }} : null,
                    footer: ['Open orders ' + money(d.customer_open_orders)]
                });
            }}, {title: 'Open invoices', visible: function (d) {
                return Boolean(d.id && (d._invoices || []).length);
            }, render: function (pane, d) {
                UI.docLines(pane, {
                    items: d._invoices,
                    kind: function () {
                        return {icon: 'doc', tone: 'charge'};
                    },
                    title: function (i) {
                        return (i.number ? 'Invoice ' + i.number :
                            'Draft invoice') + (i.reference ? ' · PO ' +
                                i.reference : '');
                    },
                    chips: function (i) {
                        return [{text: INVOICE_STATE[i.state] || i.state,
                            tone: i.state === 'draft' ? 'warn' : 'accent'},
                            i.invoice_date ? 'dated ' + UI.date(
                                i.invoice_date) : null];
                    },
                    right: function (i) {
                        return [money(i.state === 'draft' ? i.total_amount :
                            i.amount_to_pay), i.state === 'draft' ?
                            'not posted' : 'due of ' + money(i.total_amount)];
                    },
                    onclick: function (i) {
                        if (screens.invoicing) {
                            UI.openScreen('invoicing/' + i.id, 'Invoice ' +
                                (i.number || i.id));
                        } else {
                            UI.openRecord('account.invoice', i.id, i.number);
                        }
                    },
                    footer: ['Open balance ' + money(d.receivable)]
                });
            }}, {title: 'Contacts', visible: function (d) {
                return Boolean(d.id);
            }, render: function (pane, d) {
                UI.docLines(pane, {
                    items: d._contacts || [],
                    kind: function () {
                        return {icon: 'person', tone: 'muted'};
                    },
                    title: function (c) {
                        return c.value;
                    },
                    chips: function (c) {
                        return [label(CONTACT_TYPES, c.type), c.name || null];
                    },
                    onclick: can.contact ? function (c) {
                        editContact(d, c);
                    } : null,
                    empty: 'No contact.',
                    add: can.contact ? {placeholder: 'Add a phone, e-mail ' +
                        'or other contact', onclick: function () {
                            editContact(d, {type: 'phone'});
                        }} : null
                });
            }}, {title: 'Addresses', note: 'The sold to address and the ' +
                'ship to addresses', visible: function (d) {
                return Boolean(d.id);
            }, render: function (pane, d) {
                var items = (d._addresses || []).map(function (a) {
                    return Object.assign({}, a, {
                        'subdivision.rec_name': (a['subdivision.'] || {})
                            .rec_name, 'country.rec_name': (a['country.'] ||
                                {}).rec_name});
                });
                UI.docLines(pane, {
                    items: items,
                    kind: function () {
                        return {icon: 'truck', tone: 'muted'};
                    },
                    title: function (a) {
                        return [a.party_name || d.name, String(a.street ||
                            '').split(/\r?\n/)[0], a.city].filter(Boolean)
                            .join(', ');
                    },
                    chips: function (a) {
                        return ['No ' + a.id, a.ship_to_default ? {text:
                            'default ship to', tone: 'accent'} : null,
                            a.invoice ? 'bills' : null, a.delivery ?
                                'ships' : null, a.ship_to_contact || null];
                    },
                    onclick: can.address ? function (a) {
                        editAddress(d, a);
                    } : null,
                    empty: 'No address.',
                    add: can.address ? {placeholder: 'Add a ship to address',
                        onclick: function () {
                            editAddress(d, {});
                        }} : null
                });
            }}],
            cards: [
                {title: 'Main address', rows: function (d) {
                    return [['Name', d.sold_to_name || d.name],
                        ['Address', [d.sold_to_address_1, d.sold_to_address_2,
                            [d.sold_to_city, codeOf(d.sold_to_subdivision),
                                d.sold_to_postal_code].filter(Boolean)
                                .join(' '), name(d.sold_to_country)]
                            .filter(Boolean).join(', ')]];
                }, fields: [
                    {name: 'name', label: 'Customer name', type: 'char'},
                    {name: 'sold_to_address_1', label: 'Address',
                        type: 'char'},
                    {name: 'sold_to_address_2', label: 'Address 2',
                        type: 'char'},
                    {name: 'sold_to_city', label: 'City', type: 'char'},
                    refField('sold_to_subdivision', 'State',
                        'country.subdivision'),
                    {name: 'sold_to_postal_code', label: 'Postal code',
                        type: 'char'},
                    refField('sold_to_country', 'Country', 'country.country'),
                    {name: 'sold_to_name', label: 'Etc.', type: 'char'}],
                    editable: editable},
                {title: 'Contact', rows: function (d) {
                    return [['Contact', [d.customer_contact, d.contact_title]
                        .filter(Boolean).join(', ')],
                        ['Phone', d.customer_phone], ['Fax', d.customer_fax],
                        ['E-mail', d.customer_email],
                        ['Mobile', d.customer_mobile]];
                }, fields: [
                    {name: 'customer_contact', label: 'Contact',
                        type: 'char'},
                    {name: 'contact_title', label: 'Title', type: 'char'},
                    {name: 'customer_phone', label: 'Phone', type: 'char'},
                    {name: 'customer_fax', label: 'Fax', type: 'char'},
                    {name: 'customer_email', label: 'E-mail', type: 'char'},
                    {name: 'customer_mobile', label: 'Mobile', type: 'char'}],
                    editable: editable},
                {title: 'Credit and terms', rows: function (d) {
                    return [['Credit status', label(CREDIT_STATUS,
                        d.credit_status) || 'Approved'],
                        ['Order limit', amountOf(d.credit_limit) ?
                            money(d.credit_limit) : 'none'],
                        ['Terms', name(d.customer_payment_term) || null],
                        ['Freight', label(FREIGHT_TERMS,
                            d.customer_freight_terms) || null],
                        ['Receivables', idSpan(d.account_receivable)],
                        ['Account opened', d.customer_open_date ? UI.date(
                            d.customer_open_date) : null]];
                }, fields: [
                    {name: 'credit_status', label: 'Credit status',
                        type: 'selection', options: CREDIT_STATUS},
                    {name: 'credit_limit', label: 'Order limit (0: none)',
                        type: 'money'},
                    refField('customer_payment_term', 'Terms',
                        'account.invoice.payment_term'),
                    {name: 'customer_freight_terms', label: 'Freight terms',
                        type: 'selection', options: FREIGHT_TERMS},
                    refField('account_receivable', 'Receivables account',
                        'account.account', {domain: [['type.receivable', '=',
                            true]]}),
                    {name: 'customer_open_date', label: 'Account opened',
                        type: 'date', value: function (d) {
                            return iso(d.customer_open_date);
                        }}],
                    editable: editable},
                {title: 'Sales and delivery', rows: function (d) {
                    return [['Sales rep', idSpan(d.sales_rep)],
                        ['Territory', idSpan(d.territory)],
                        ['Discount class', idSpan(d.discount_class)],
                        ['Ship via', idSpan(d.customer_ship_via)],
                        ['FOB', idSpan(d.customer_fob_point)],
                        ['Carrier', idSpan(d.carrier)],
                        ['SIC code', idSpan(d.customer_sic_code)]];
                }, fields: [
                    refField('sales_rep', 'Sales rep', 'nline.sales_rep'),
                    refField('territory', 'Territory', 'nline.territory'),
                    refField('discount_class', 'Discount class',
                        'nline.discount_class'),
                    refField('customer_ship_via', 'Ship via',
                        'nline.ship_via'),
                    refField('customer_fob_point', 'FOB point',
                        'nline.fob_point'),
                    refField('carrier', 'Carrier', 'nline.carrier'),
                    refField('customer_sic_code', 'SIC code',
                        'nline.sic_code')],
                    editable: editable},
                {title: 'Tax', rows: function (d) {
                    return [['Tax group', idSpan(d.customer_tax_group)],
                        ['Tax ID number', d.customer_tax_id_number],
                        ['Tax exempt', d.customer_tax_exempt ? 'Yes' : 'No'],
                        ['Our supplier ID', d.our_supplier_id]];
                }, fields: [
                    refField('customer_tax_group', 'Tax group',
                        'nline.sales_tax_group'),
                    {name: 'customer_tax_id_number', label: 'Tax ID number',
                        type: 'char'},
                    {name: 'customer_tax_exempt', label: 'Tax exempt',
                        type: 'boolean'},
                    {name: 'our_supplier_id', label: 'Our supplier ID (at ' +
                        'this customer)', type: 'char'}],
                    editable: editable},
                {title: 'Specs and instructions', rows: function (d) {
                    return [['Specs', d.customer_specs ?
                        String(d.customer_specs).slice(0, 200) : null],
                        ['Sales order instructions', d.sales_instructions ?
                            String(d.sales_instructions).slice(0, 200) :
                            null],
                        ['Quote instructions', d.quote_instructions ?
                            String(d.quote_instructions).slice(0, 200) :
                            null]];
                }, fields: [
                    {name: 'customer_specs', label: 'Specs (copied onto ' +
                        'new orders)', type: 'text'},
                    {name: 'sales_instructions', label: 'Sales order ' +
                        'instructions', type: 'text'},
                    {name: 'quote_instructions', label: 'Quote ' +
                        'instructions', type: 'text'}],
                    editable: editable}
            ],
            trail: function (d) {
                if (!d.id) {
                    return [];
                }
                return [
                    {done: true, text: 'Created', when: whoText(d.create_uid,
                        d.create_date)},
                    {done: Boolean(d.customer_open_date), text: 'Account ' +
                        'opened', when: d.customer_open_date ? UI.date(
                            d.customer_open_date) : 'not set'},
                    {done: Boolean(d.customer_last_order_date), text: 'Last ' +
                        'order', when: d.customer_last_order_date ? UI.date(
                            d.customer_last_order_date) : 'none'},
                    {done: Boolean(d.customer_exported), text: 'Exported to ' +
                        'the accounting', when: d.customer_exported_date ?
                        UI.date(d.customer_exported_date) : d.customer_exported ?
                        '' : 'not yet'},
                    {done: Boolean(d.write_date), text: 'Last modified',
                        when: d.write_date ? whoText(d.write_uid,
                            d.write_date) : ''},
                    {text: 'Notes', onclick: function () {
                        notesDialog('party.party', d.id, d.name, can.write);
                    }}];
            },
            keys: pageKeys(main, token, {
                n: {label: 'new order', run: function (d) {
                    if (d.id && can.order && screens.orders) {
                        newOrder(d);
                    }
                }}
            }),
            classic: function (d) {
                UI.setDocView('customer', 'classic');
                Screens.customerWindow(main, d && d.id ? [d.id] : []);
            }
        });
        token.root = main.querySelector('.dp-page');
        return page;
    }

    /* The Customers window: the modern page (default) or Jobshop's
     * classic window (its prices, quotes and footers) */
    Screens.customerWindow = function (main, params) {
        startPage(main);
        var openId = params && params[0] ? parseInt(params[0], 10) : null;
        if (UI.docPage && UI.docView('customer') === 'modern') {
            injectCss();
            customerModern(main, openId);
            return;
        }
        main._salesPage = null;
        classicCustomerWindow(main, params);
    };
}(window));
