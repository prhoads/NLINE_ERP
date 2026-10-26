/* N-Line Desk: customer screens (Create Invoices, Receive Payments,
 * Make Deposits, Customer Center) */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    /* The item grid of an invoice: item, description, quantity, rate */
    function itemGrid(onchange) {
        var body = el('tbody');
        var total = el('td.num', '0.00');
        var rows = [];

        function addRow() {
            var row = {};
            row.item = UI.picker('product.product', {domain: [
                ['salable', '=', true]], placeholder: 'Item', label: 'Item',
                fields: ['list_price'], onselect: function (record) {
                    row.description.value = record.rec_name.replace(
                        /^\[[^\]]*\]\s*/, '');
                    if (record.list_price) {
                        row.rate.value = UI.money(record.list_price);
                    }
                    update();
                }});
            row.account = UI.picker('account.account', {domain: [
                ['type.revenue', '=', true], ['closed', '!=', true]],
                placeholder: 'or income account', label: 'Income account'});
            row.description = el('input', {type: 'text', 'aria-label':
                'Description'});
            row.quantity = el('input', {type: 'text', value: '1',
                style: {textAlign: 'right'}, 'aria-label': 'Quantity'});
            row.rate = UI.moneyInput({'aria-label': 'Rate'});
            row.amount = el('td.num', '');
            var tr = el('tr', el('td', {style: {width: '22%'}},
                row.item.node, row.account.node), el('td', row.description),
                el('td', {style: {width: '8%'}}, row.quantity),
                el('td', {style: {width: '12%'}}, row.rate), row.amount,
                el('td', {style: {width: '30px'}}, el('button', {type:
                    'button', 'aria-label': 'Remove line', onclick:
                    function () {
                        rows.splice(rows.indexOf(row), 1);
                        tr.remove();
                        update();
                    }}, '✕')));
            [row.quantity, row.rate].forEach(function (input) {
                input.addEventListener('input', update);
                input.addEventListener('blur', function () {
                    update();
                    if (rows[rows.length - 1] === row && lineAmount(row)) {
                        addRow();
                    }
                });
            });
            rows.push(row);
            body.appendChild(tr);
        }

        function lineAmount(row) {
            var quantity = parseFloat(row.quantity.value) || 0;
            return Math.round(quantity * UI.parseMoney(row.rate.value) * 100) /
                100;
        }

        function update() {
            var sum = 0;
            rows.forEach(function (row) {
                var amount = lineAmount(row);
                row.amount.textContent = amount ? UI.money(amount) : '';
                sum += amount;
            });
            total.textContent = UI.money(sum);
            if (onchange) {
                onchange(sum);
            }
        }

        addRow();
        return {
            node: el('div.table-wrap', el('table.data',
                el('thead', el('tr', el('th', 'Item'),
                    el('th', 'Description'), el('th.num', 'Qty'),
                    el('th.num', 'Rate'), el('th.num', 'Amount'),
                    el('th', ''))), body,
                el('tfoot', el('tr', el('td', {colspan: 4}, 'Subtotal'),
                    total, el('td', ''))))),
            lines: function () {
                return rows.filter(lineAmount).map(function (row) {
                    if (!row.item.value() && !row.account.value()) {
                        throw new Error('Choose the item or the income ' +
                            'account of every line.');
                    }
                    return {
                        product: row.item.value(),
                        account: row.item.value() ? null :
                            row.account.value(),
                        description: row.description.value || null,
                        quantity: parseFloat(row.quantity.value) || 1,
                        unit_price: String(UI.parseMoney(row.rate.value))
                    };
                });
            }
        };
    }

    Screens.createInvoice = function (main) {
        main.appendChild(el('h1', 'Create Invoices'));
        var customer = UI.picker('party.party', {placeholder: 'Customer',
            label: 'Customer', fields: ['customer_payment_term'],
            onselect: function (record) {
                if (record.customer_payment_term) {
                    term.value = record.customer_payment_term;
                }
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
            UI.service('create_invoice', {party: customer.value(),
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
        main.appendChild(el('div.toolbar', el('span.spacer'),
            el('button', {type: 'button', onclick: function () {
                save(true);
            }}, 'Save & New'),
            el('button.primary', {type: 'button', onclick: function () {
                save(false);
            }}, 'Save & Close')));
    };

    Screens.receivePayment = function (main) {
        main.appendChild(el('h1', 'Receive Payments'));
        var customer = UI.picker('party.party', {placeholder:
            'Received from', label: 'Received from', onselect: load});
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
        main.appendChild(el('div.toolbar', el('span.spacer'),
            el('button.primary', {type: 'button', onclick: function () {
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
                UI.service('receive_payment', {journal: parseInt(
                    journal.value, 10), party: customer.value(),
                    date: date.value, amount: String(total),
                    reference: reference.value || null, items: items}).then(
                    function (result) {
                        UI.toast('Payment of ' + UI.money(result.amount,
                            true) + ' received into undeposited funds',
                            'ok');
                        global.location.hash = '#/deposits/new';
                    }, function (error) {
                        if (!error.cancelled) {
                            UI.showError(error);
                        }
                    });
            }}, 'Save & Close')));
    };

    Screens.makeDeposit = function (main) {
        main.appendChild(el('h1', 'Make Deposits'));
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
        main.appendChild(el('div.toolbar', el('span.spacer'),
            el('button.primary', {type: 'button', onclick: function () {
                var lines = payments.filter(function (p) {
                    return p.selected;
                }).map(function (p) {
                    return p.line;
                });
                if (!lines.length) {
                    UI.showError('Select the payments to deposit.');
                    return;
                }
                UI.service('make_deposit', {journal: parseInt(journal.value,
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
            }}, 'Save & Close')));
        load();
    };

    Screens.customers = function (main) {
        Screens.center(main, 'customer');
    };
}(window));
