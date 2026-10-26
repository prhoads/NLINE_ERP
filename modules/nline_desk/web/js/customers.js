/* N-Line Desk: customer screens (Create Invoices, Receive Payments,
 * Make Deposits, Customer Center) */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    /* The item grid of an invoice: item (or income account), description,
     * quantity, rate and amount (UI.grid) */
    function itemGrid(onchange, sign) {
        var grid = UI.grid({total: 'amount', required: 'amount',
            onchange: onchange, columns: [
                {key: 'item', label: 'Item', width: '20%', kind: 'picker',
                    picker: {model: 'product.product', domain: [
                        ['salable', '=', true]], placeholder: 'Item',
                        fields: ['list_price'],
                        onselect: function (record, controls) {
                            controls.description.value = record.rec_name
                                .replace(/^\[[^\]]*\]\s*/, '');
                            if (record.list_price) {
                                controls.rate.value = UI.money(
                                    record.list_price);
                            }
                        }}},
                {key: 'account', label: 'or Income Account', width: '18%',
                    kind: 'picker', picker: {model: 'account.account',
                        domain: [['type.revenue', '=', true],
                            ['closed', '!=', true]], placeholder:
                            'Income account'}},
                {key: 'description', label: 'Description'},
                {key: 'quantity', label: 'Qty', width: '8%', kind: 'number',
                    default: '1'},
                {key: 'rate', label: 'Rate', width: '12%', kind: 'money'},
                {key: 'amount', label: 'Amount', width: '12%', kind:
                    'computed', compute: function (v) {
                        return Math.round((v.quantity || 0) * (v.rate || 0) *
                            100) / 100;
                    }}
            ]});
        return {
            node: grid.node,
            lines: function () {
                return grid.rows().map(function (row) {
                    if (!row.item && !row.account) {
                        throw new Error('Choose the item or the income ' +
                            'account of every line.');
                    }
                    return {
                        product: row.item,
                        account: row.item ? null : row.account,
                        description: row.description || null,
                        quantity: (row.quantity || 1) * (sign || 1),
                        unit_price: String(row.rate)
                    };
                });
            },
            total: grid.total
        };
    }
    Screens.itemGrid = itemGrid;

    Screens.createInvoice = function (main) {
        var form = UI.form(main, {title: 'Create Invoices', kind: 'customer',
            find: {model: 'account.invoice', title: 'Find invoices',
                domain: [['type', '=', 'out']],
                order: [['invoice_date', 'DESC'], ['id', 'DESC']],
                columns: Screens.INVOICE_COLUMNS},
            onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/invoices/new?' + Date.now();
            }});
        main = form.body;
        var customer = UI.picker('party.party', {placeholder: 'Customer',
            label: 'Customer', fields: ['customer_payment_term'],
            onselect: function (record) {
                if (record.customer_payment_term) {
                    term.value = record.customer_payment_term;
                }
                form.showParty(record.id);
                Rpc.searchRead('party.address', [['party', '=', record.id]],
                    ['full_address'], {limit: 1}).then(function (rows) {
                    billTo.textContent = record.rec_name + '\n' +
                        (rows.length ? rows[0].full_address : '');
                });
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var po = el('input', {type: 'text', 'aria-label': 'P.O. No.'});
        var term = el('select', {'aria-label': 'Terms'}, el('option',
            {value: ''}, ''));
        var billTo = el('div', {style: {whiteSpace: 'pre-line', minHeight:
            '64px', border: '1px solid var(--line)', borderRadius: '3px',
            padding: '5px 7px', background: '#fafbfc'}}, '');
        var memo = el('input', {type: 'text', 'aria-label':
            'Customer message'});
        var total = el('div', {style: {fontSize: '18px', fontWeight: '600',
            textAlign: 'right'}}, '$0.00');
        var grid = itemGrid(function (sum) {
            total.textContent = UI.money(sum, true);
        });
        Rpc.searchRead('account.invoice.payment_term', [], ['name'],
            {order: [['name', 'ASC']]}).then(function (rows) {
            rows.forEach(function (row) {
                term.appendChild(el('option', {value: row.id}, row.name));
            });
        });
        main.appendChild(el('div.panel',
            el('div.grid-form',
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Customer'), customer.node),
                el('div', el('label.field', 'Date'), date),
                el('div', el('label.field', 'P.O. No.'), po),
                el('div', el('label.field', 'Terms'), term)),
            el('div', {style: {display: 'grid', gridTemplateColumns:
                'minmax(200px, 320px) 1fr', gap: '14px', marginTop: '12px'}},
                el('div', el('label.field', 'Bill To'), billTo),
                el('div')),
            el('h2', 'Items'), grid.node,
            el('div.grid-form', {style: {marginTop: '12px'}},
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Customer message / memo'), memo),
                el('div'),
                el('div', el('label.field', 'Subtotal (tax added by the ' +
                    'tax rules when posted)'), total))));
        var save = function (andNew) {
            var lines;
            try {
                lines = grid.lines();
            } catch (error) {
                UI.showError(error.message);
                return;
            }
            if (!customer.value() || !lines.length) {
                UI.showError('Enter the customer and at least one line.');
                return;
            }
            return UI.service('create_invoice', {party: customer.value(),
                date: date.value, reference: po.value || null,
                memo: memo.value || null, payment_term: term.value ?
                    parseInt(term.value, 10) : null, lines: lines}).then(
                function (result) {
                    UI.toast('Invoice ' + result.number + ' of ' +
                        UI.money(result.total_amount, true) + ' posted' +
                        (result.tax_amount ? ' (tax ' +
                            UI.money(result.tax_amount, true) + ')' : ''),
                        'ok');
                    UI.confirm('Print invoice', 'Print invoice ' +
                        result.number + ' now?').then(function (ok) {
                        if (ok) {
                            Rpc.report('account.invoice', [result.id]).then(
                                function (report) {
                                    UI.openReport(report, 'Invoice');
                                }, UI.showError);
                        }
                        global.location.hash = andNew ? '#/invoices/new?' +
                            Date.now() : '#/customers';
                    });
                }, function (error) {
                    if (!error.cancelled) {
                        UI.showError(error);
                    }
                });
        };
    };

    Screens.receivePayment = function (main) {
        var form = UI.form(main, {title: 'Receive Payments', kind: 'customer',
            find: {model: 'account.payment', title: 'Find payments',
                domain: [['kind', '=', 'receivable']],
                order: [['date', 'DESC'], ['id', 'DESC']],
                columns: Screens.PAYMENT_COLUMNS},
            onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/payments/receive?' + Date.now();
            }});
        main = form.body;
        var customer = UI.picker('party.party', {placeholder:
            'Received from', label: 'Received from', onselect: function (
                record) {
                form.showParty(record.id);
                load(record);
            }});
        var amount = UI.moneyInput({'aria-label': 'Payment amount'});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var reference = el('input', {type: 'text', placeholder:
            'Check no.', 'aria-label': 'Reference / check number'});
        var journal = el('select', {'aria-label': 'Deposit to'});
        var body = el('tbody');
        var applied = el('td.num', '0.00');
        var unapplied = el('div.muted', '');
        var invoices = [];
        Screens.paymentJournals(['manual']).then(function (rows) {
            rows.forEach(function (row) {
                journal.appendChild(el('option', {value: row.id}, row.name));
            });
        }, UI.showError);

        function load() {
            if (!customer.value()) {
                return;
            }
            Rpc.desk('open_invoices', [customer.value(), date.value]).then(
                function (rows) {
                    invoices = rows.map(function (row) {
                        row.pay = 0;
                        return row;
                    });
                    autoApply();
                }, UI.showError);
        }

        function autoApply() {
            var rest = UI.parseMoney(amount.value);
            invoices.forEach(function (invoice) {
                invoice.pay = Math.max(Math.min(rest, invoice.open_amount),
                    0);
                rest = Math.round((rest - invoice.pay) * 100) / 100;
            });
            render();
        }

        function render() {
            UI.clear(body);
            invoices.forEach(function (invoice) {
                var check = el('input', {type: 'checkbox', checked:
                    invoice.pay > 0, 'aria-label': 'Apply to ' +
                    invoice.number});
                var pay = UI.moneyInput({value: invoice.pay ?
                    UI.money(invoice.pay) : '', 'aria-label': 'Payment'});
                check.addEventListener('change', function () {
                    invoice.pay = check.checked ? invoice.open_amount : 0;
                    render();
                });
                pay.addEventListener('change', function () {
                    invoice.pay = UI.parseMoney(pay.value);
                    totals();
                });
                body.appendChild(el('tr', el('td', check),
                    el('td', UI.date(invoice.date)), el('td', invoice.number),
                    el('td', invoice.reference || ''),
                    el('td', UI.date(invoice.due_date)),
                    el('td.num', UI.money(invoice.amount)),
                    el('td.num', UI.money(invoice.open_amount)),
                    el('td', {style: {width: '130px'}}, pay)));
            });
            if (!invoices.length) {
                body.appendChild(el('tr', el('td', {colspan: 8},
                    customer.value() ? 'No open invoice.' :
                        'Choose the customer.')));
            }
            totals();
        }

        function totals() {
            var sum = invoices.reduce(function (s, i) {
                return s + (i.pay || 0);
            }, 0);
            applied.textContent = UI.money(sum, true);
            var rest = UI.parseMoney(amount.value) - sum;
            unapplied.textContent = rest > 0.004 ? UI.money(rest, true) +
                ' unapplied: kept as a credit of the customer' : '';
        }

        amount.addEventListener('change', autoApply);
        date.addEventListener('change', load);
        main.appendChild(el('div.panel', el('div.grid-form',
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Received from'), customer.node),
            el('div', el('label.field', 'Payment amount'), amount),
            el('div', el('label.field', 'Date'), date),
            el('div', el('label.field', 'Reference / check no.'), reference),
            el('div', el('label.field', 'Deposit to'), journal))));
        main.appendChild(el('h2', 'Open invoices'));
        main.appendChild(el('div.table-wrap', el('table.data',
            el('thead', el('tr', el('th', ''), el('th', 'Date'),
                el('th', 'Number'), el('th', 'P.O.'), el('th', 'Due'),
                el('th.num', 'Orig. Amt.'), el('th.num', 'Amt. Due'),
                el('th.num', 'Payment'))), body,
            el('tfoot', el('tr', el('td', {colspan: 7}, 'Amount applied'),
                applied)))));
        main.appendChild(unapplied);
        render();
        function save(andNew) {
            {
                var items = invoices.filter(function (i) {
                    return i.pay > 0;
                }).map(function (i) {
                    return {line: i.line, amount: String(i.pay)};
                });
                var total = UI.parseMoney(amount.value);
                if (!customer.value() || !total) {
                    UI.showError('Enter the customer and the amount.');
                    return;
                }
                return UI.service('receive_payment', {journal: parseInt(
                    journal.value, 10), party: customer.value(),
                    date: date.value, amount: String(total),
                    reference: reference.value || null, items: items}).then(
                    function (result) {
                        UI.toast('Payment of ' + UI.money(result.amount,
                            true) + ' received into undeposited funds',
                            'ok');
                        global.location.hash = andNew ?
                            '#/payments/receive?' + Date.now() :
                            '#/deposits/new';
                    }, function (error) {
                        if (!error.cancelled) {
                            UI.showError(error);
                        }
                    });
            }
        }
    };

    Screens.makeDeposit = function (main) {
        main = UI.form(main, {title: 'Make Deposits', onSave: function () {
            return save();
        }}).body;
        var journal = el('select', {'aria-label': 'Deposit to'});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var memo = el('input', {type: 'text', value: 'Deposit',
            'aria-label': 'Memo'});
        var body = el('tbody');
        var total = el('td.num', '0.00');
        var payments = [];
        Screens.paymentJournals(['check']).then(function (rows) {
            rows.forEach(function (row) {
                journal.appendChild(el('option', {value: row.id},
                    row.name.replace(/ Checks$/, '')));
            });
        }, UI.showError);

        function load() {
            Rpc.desk('undeposited_payments', []).then(function (rows) {
                payments = rows.map(function (row) {
                    row.selected = true;
                    return row;
                });
                render();
            }, UI.showError);
        }

        function render() {
            UI.clear(body);
            payments.forEach(function (payment) {
                var check = el('input', {type: 'checkbox', checked:
                    payment.selected, 'aria-label': 'Deposit payment of ' +
                    payment.party_name});
                check.addEventListener('change', function () {
                    payment.selected = check.checked;
                    totals();
                });
                body.appendChild(el('tr', el('td', check),
                    el('td', UI.date(payment.date)),
                    el('td', payment.party_name),
                    el('td', payment.reference),
                    el('td.num', UI.money(payment.amount))));
            });
            if (!payments.length) {
                body.appendChild(el('tr', el('td', {colspan: 5},
                    'No payment waiting to be deposited.')));
            }
            totals();
        }

        function totals() {
            total.textContent = UI.money(payments.reduce(function (s, p) {
                return s + (p.selected ? p.amount : 0);
            }, 0), true);
        }

        main.appendChild(el('div.panel', el('div.grid-form',
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Deposit to'), journal),
            el('div', el('label.field', 'Date'), date),
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Memo'), memo))));
        main.appendChild(el('h2', 'Payments to deposit'));
        main.appendChild(el('div.table-wrap', el('table.data',
            el('thead', el('tr', el('th', ''), el('th', 'Date'),
                el('th', 'Received from'), el('th', 'Reference'),
                el('th.num', 'Amount'))), body,
            el('tfoot', el('tr', el('td', {colspan: 4}, 'Deposit total'),
                total)))));
        function save() {
            {
                var lines = payments.filter(function (p) {
                    return p.selected;
                }).map(function (p) {
                    return p.line;
                });
                if (!lines.length) {
                    UI.showError('Select the payments to deposit.');
                    return;
                }
                return UI.service('make_deposit', {journal: parseInt(journal.value,
                    10), date: date.value, memo: memo.value || null,
                    lines: lines}).then(function (result) {
                    UI.toast('Deposit of ' + UI.money(result.amount, true) +
                        ' made', 'ok');
                    global.location.hash = '#/register';
                }, function (error) {
                    if (!error.cancelled) {
                        UI.showError(error);
                    }
                });
            }
        }
        load();
    };

    Screens.customers = function (main) {
        Screens.center(main, 'customer');
    };
}(window));
