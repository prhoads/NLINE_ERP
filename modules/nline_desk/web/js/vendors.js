/* N-Line Desk: vendor screens (Enter Bills, Write Checks, Pay Bills,
 * Vendor Center) */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    /* The expense grid of bills and checks: account, memo, amount and the
     * cost order (sales order) the cost is for */
    function expenseGrid(onchange, kind) {
        var accountDomain = kind === 'revenue' ?
            [['type.revenue', '=', true], ['closed', '!=', true]] :
            [['type.expense', '=', true], ['closed', '!=', true]];
        var grid = UI.grid({total: 'amount', onchange: onchange, columns: [
            {key: 'account', label: 'Account', width: '34%', kind: 'picker',
                picker: {model: 'account.account', domain: accountDomain,
                    placeholder: 'Account'}},
            {key: 'memo', label: 'Memo'},
            {key: 'cost', label: 'Cost order', width: '18%', kind: 'picker',
                picker: {model: 'analytic_account.account', domain: [
                    ['type', '=', 'normal']], placeholder: 'Sales order'}},
            {key: 'amount', label: 'Amount', width: '14%', kind: 'money'}
        ]});
        return {
            node: grid.node,
            lines: function () {
                return grid.rows().map(function (row) {
                    if (!row.account) {
                        throw new Error('Choose the account of every line.');
                    }
                    return {
                        account: row.account,
                        description: row.memo || null,
                        amount: String(row.amount),
                        cost_order: row.cost
                    };
                });
            },
            total: grid.total,
            setFirst: function (accountId, accountName, memo) {
                var first = grid.controls()[0];
                first.account.set(accountId, accountName);
                if (memo) {
                    first.memo.value = memo;
                }
            }
        };
    }
    Screens.expenseGrid = expenseGrid;

    /* The columns of the Find of bills and invoices */
    var INVOICE_COLUMNS = [
        {field: 'number', label: 'Number'},
        {field: 'invoice_date', label: 'Date'},
        {field: 'rec_name', label: 'Invoice'},
        {field: 'total_amount', label: 'Amount', money: true},
        {field: 'state', label: 'State'}];
    Screens.INVOICE_COLUMNS = INVOICE_COLUMNS;
    var PAYMENT_COLUMNS = [
        {field: 'date', label: 'Date'},
        {field: 'rec_name', label: 'Payment'},
        {field: 'amount', label: 'Amount', money: true},
        {field: 'state', label: 'State'}];
    Screens.PAYMENT_COLUMNS = PAYMENT_COLUMNS;

    function paymentJournals(method) {
        var domain = method ? [['process_method', 'in', method]] : [];
        return Rpc.searchRead('account.payment.journal', domain, ['name',
            'process_method', 'bank_account', 'check_sequence', 'check_micr',
            'check_micr_routing', 'check_micr_account'],
            {order: [['name', 'ASC']]});
    }
    Screens.paymentJournals = paymentJournals;

    function terms() {
        return Rpc.searchRead('account.invoice.payment_term', [], ['name'],
            {order: [['name', 'ASC']]});
    }

    Screens.enterBill = function (main) {
        var form = UI.form(main, {title: 'Enter Bills', kind: 'vendor',
            find: {model: 'account.invoice', title: 'Find bills', domain: [['type', '=', 'in']],
                order: [['invoice_date', 'DESC'], ['id', 'DESC']],
                columns: INVOICE_COLUMNS},
            onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/bills/new?' + Date.now();
            }});
        main = form.body;
        var vendor = UI.picker('party.party', {placeholder: 'Vendor',
            label: 'Vendor', fields: ['supplier_payment_term'],
            onselect: function (record) {
                if (record.supplier_payment_term) {
                    term.value = record.supplier_payment_term;
                }
                form.showParty(record.id);
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var ref = el('input', {type: 'text', 'aria-label': 'Ref. No.'});
        var term = el('select', {'aria-label': 'Terms'}, el('option',
            {value: ''}, ''));
        var amountDue = el('div.num', {style: {fontSize: '18px',
            fontWeight: '600'}}, '0.00');
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var grid = expenseGrid(function (sum) {
            amountDue.textContent = UI.money(sum, true);
        });
        terms().then(function (rows) {
            rows.forEach(function (row) {
                term.appendChild(el('option', {value: row.id}, row.name));
            });
        });
        main.appendChild(el('div.panel',
            el('div.grid-form',
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Vendor'), vendor.node),
                el('div', el('label.field', 'Date'), date),
                el('div', el('label.field', 'Ref. No.'), ref),
                el('div', el('label.field', 'Terms'), term),
                el('div', el('label.field', 'Amount Due'), amountDue),
                el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                    'Memo'), memo)),
            el('h2', 'Expenses'), grid.node));
        var save = function (andNew) {
            var lines;
            try {
                lines = grid.lines();
            } catch (error) {
                UI.showError(error.message);
                return;
            }
            if (!vendor.value() || !lines.length) {
                UI.showError('Enter the vendor and at least one amount.');
                return;
            }
            return UI.service('enter_bill', {party: vendor.value(), date: date.value,
                reference: ref.value || null, memo: memo.value || null,
                payment_term: term.value ? parseInt(term.value, 10) : null,
                lines: lines}).then(function (result) {
                UI.toast('Bill ' + result.number + ' of ' +
                    UI.money(result.total_amount, true) + ' posted', 'ok');
                global.location.hash = andNew ? '#/bills/new?' + Date.now() :
                    '#/bills/pay';
            }, function (error) {
                if (!error.cancelled) {
                    UI.showError(error);
                }
            });
        };
    };

    Screens.writeCheck = function (main) {
        var form = UI.form(main, {title: 'Write Checks', kind: 'vendor',
            find: {model: 'account.payment', title: 'Find checks',
                domain: [['kind', '=', 'payable']],
                order: [['date', 'DESC'], ['id', 'DESC']],
                columns: PAYMENT_COLUMNS},
            onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/checks/new?' + Date.now();
            }});
        main = form.body;
        var company = (Rpc.context()['company.rec_name']) || '';
        var bank = el('select', {'aria-label': 'Bank account'});
        var number = el('input', {type: 'text', readonly: true,
            'aria-label': 'Check number'});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var address = el('div.address', {'aria-label': 'Address'}, '');
        var payee = UI.picker('party.party', {placeholder: 'Pay to the order of',
            label: 'Payee', onselect: function (record) {
                form.showParty(record.id);
                Rpc.searchRead('party.address', [['party', '=', record.id]],
                    ['full_address'], {limit: 1}).then(function (rows) {
                    address.textContent = record.rec_name + '\n' +
                        (rows.length ? rows[0].full_address : '');
                });
            }});
        var amount = UI.moneyInput({'aria-label': 'Amount'});
        var words = el('div.words', '');
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var micr = el('div.micr', '');
        var grid = expenseGrid(function (sum) {
            amount.value = UI.money(sum);
            words.textContent = UI.amountWords(sum);
        });
        amount.addEventListener('input', function () {
            words.textContent = UI.amountWords(UI.parseMoney(amount.value));
        });
        var journals = [];

        function nextNumber() {
            var journal = journals.filter(function (j) {
                return String(j.id) === bank.value;
            })[0];
            if (!journal || !journal.check_sequence) {
                number.value = '';
                return;
            }
            Rpc.model('ir.sequence', 'read', [[journal.check_sequence],
                ['number_next', 'padding']]).then(function (rows) {
                number.value = rows.length ? String(rows[0].number_next) : '';
                /* Like the printed MICR line: on-us number, transit, account */
                micr.textContent = '⑈' + number.value.padStart(6, '0') +
                    '⑈' + (journal.check_micr ? '  ⑆' +
                        journal.check_micr_routing + '⑆  ' +
                        journal.check_micr_account + '⑈' : '');
            });
        }

        paymentJournals(['check']).then(function (rows) {
            journals = rows;
            rows.forEach(function (row) {
                bank.appendChild(el('option', {value: row.id}, row.name));
            });
            nextNumber();
        }, UI.showError);
        bank.addEventListener('change', nextNumber);

        main.appendChild(el('div.check', {role: 'group',
                'aria-label': 'Check'},
            el('div.row',
                el('div', el('div.company', company), el('div.bank', bank)),
                el('div.no', el('div.label', 'No.'), number)),
            el('div.row', el('span'), el('div', {style: {marginLeft: 'auto',
                display: 'flex', alignItems: 'center', gap: '8px'}},
                el('span.label', 'Date'), date)),
            el('div.row.line',
                el('span.label', 'Pay to the order of'),
                el('div.payee', payee.node),
                el('div.amount', amount)),
            el('div.row', words),
            el('div.row', address),
            el('div.row.line', el('span.label', 'Memo'), el('div.memo', memo),
                el('div.signature', 'Authorized signature')),
            micr));
        main.appendChild(el('h2', 'Expenses'));
        main.appendChild(grid.node);

        var save = function (andNew) {
            var lines;
            try {
                lines = grid.lines();
            } catch (error) {
                UI.showError(error.message);
                return;
            }
            if (!payee.value() || !lines.length || !bank.value) {
                UI.showError('Enter the bank account, the payee and the ' +
                    'expense lines.');
                return;
            }
            var check = UI.parseMoney(amount.value);
            var expenses = grid.total();
            if (Math.abs(check - expenses) > 0.004) {
                UI.showError('The check amount ' + UI.money(check, true) +
                    ' differs from the expenses ' + UI.money(expenses, true) +
                    '.');
                return;
            }
            return UI.service('write_check', {journal: parseInt(bank.value, 10),
                party: payee.value(), date: date.value,
                memo: memo.value || null, lines: lines}).then(
                function (result) {
                    UI.toast('Check ' + (result.check_number || '') + ' of ' +
                        UI.money(result.amount, true) + ' written', 'ok');
                    UI.confirm('Print check', 'Print check ' +
                        (result.check_number || '') + ' now?').then(
                        function (ok) {
                            if (ok) {
                                printChecks(result.group);
                            }
                            global.location.hash = andNew ? '#/checks/new?' +
                                Date.now() : '#/register';
                        });
                }, function (error) {
                    if (!error.cancelled) {
                        UI.showError(error);
                    }
                });
        };
    };

    function printChecks(group) {
        Rpc.report('account.payment.group.check', [group]).then(function (r) {
            UI.openReport(r, 'Checks');
        }, UI.showError);
    }
    Screens.printChecks = printChecks;

    Screens.payBills = function (main) {
        main = UI.form(main, {title: 'Pay Bills'}).body;
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Payment date'});
        var method = el('select', {'aria-label': 'Payment method'});
        var showAll = el('input', {type: 'checkbox', checked: true,
            id: 'showall'});
        var dueBy = el('input', {type: 'date', value: UI.addDays(UI.today(),
            10), 'aria-label': 'Due on or before'});
        var body = el('tbody');
        var totalPay = el('td.num', '0.00');
        var totalDisc = el('td.num', '0.00');
        var bills = [];
        paymentJournals(['check', 'nacha', 'manual']).then(function (rows) {
            rows.forEach(function (row) {
                method.appendChild(el('option', {value: row.id},
                    row.name + (row.process_method === 'nacha' ? ' (ACH)' :
                        row.process_method === 'check' ? ' (Check)' : '')));
            });
        }, UI.showError);

        function load() {
            Rpc.desk('open_bills', [null, date.value]).then(function (rows) {
                bills = rows.map(function (row) {
                    row.selected = false;
                    return row;
                });
                render();
            }, UI.showError);
        }

        function render() {
            UI.clear(body);
            var limit = dueBy.value;
            bills.filter(function (bill) {
                return showAll.checked || !bill.due_date ||
                    bill.due_date <= limit;
            }).forEach(function (bill) {
                var check = el('input', {type: 'checkbox', checked:
                    bill.selected, 'aria-label': 'Pay ' + bill.number});
                var pay = UI.moneyInput({value: bill.selected ?
                    UI.money(bill.pay) : '', 'aria-label': 'Amount to pay'});
                var disc = UI.moneyInput({value: bill.selected &&
                    bill.disc ? UI.money(bill.disc) : '', 'aria-label':
                    'Discount'});
                check.addEventListener('change', function () {
                    bill.selected = check.checked;
                    bill.disc = check.checked ? bill.discount : 0;
                    bill.pay = check.checked ? Math.round((bill.open_amount -
                        bill.disc) * 100) / 100 : 0;
                    render();
                });
                pay.addEventListener('change', function () {
                    bill.pay = UI.parseMoney(pay.value);
                    bill.selected = bill.pay > 0;
                    totals();
                });
                disc.addEventListener('change', function () {
                    bill.disc = UI.parseMoney(disc.value);
                    bill.pay = Math.round((bill.open_amount - bill.disc) *
                        100) / 100;
                    render();
                });
                var overdue = bill.due_date && bill.due_date < UI.today();
                body.appendChild(el('tr', el('td', check),
                    el('td', UI.date(bill.due_date), overdue ?
                        el('span.badge.open', ' overdue') : null),
                    el('td', bill.party_name), el('td', bill.reference || ''),
                    el('td', bill.number),
                    el('td.num', UI.money(bill.amount)),
                    el('td.num', bill.discount ? UI.money(bill.discount) :
                        ''),
                    el('td', {style: {width: '110px'}}, disc),
                    el('td', {style: {width: '120px'}}, pay)));
            });
            if (!body.children.length) {
                body.appendChild(el('tr', el('td', {colspan: 9},
                    'No open bill.')));
            }
            totals();
        }

        function totals() {
            var pay = 0, disc = 0;
            bills.forEach(function (bill) {
                if (bill.selected) {
                    pay += bill.pay || 0;
                    disc += bill.disc || 0;
                }
            });
            totalPay.textContent = UI.money(pay, true);
            totalDisc.textContent = UI.money(disc, true);
        }

        main.appendChild(el('div.panel', el('div.grid-form',
            el('div', el('label.field', 'Show bills'), el('div',
                showAll, el('label', {for: 'showall'}, ' all bills'))),
            el('div', el('label.field', 'Due on or before'), dueBy),
            el('div', el('label.field', 'Payment date'), date),
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Payment method / account'), method))));
        main.appendChild(el('div.toolbar', el('button', {type: 'button',
            onclick: function () {
                bills.forEach(function (bill) {
                    bill.selected = true;
                    bill.disc = bill.discount;
                    bill.pay = Math.round((bill.open_amount - bill.disc) *
                        100) / 100;
                });
                render();
            }}, 'Select All'), el('button', {type: 'button', onclick:
            function () {
                bills.forEach(function (bill) {
                    bill.selected = false;
                });
                render();
            }}, 'Clear Selections')));
        main.appendChild(el('div.table-wrap', el('table.data',
            el('thead', el('tr', el('th', ''), el('th', 'Due'),
                el('th', 'Vendor'), el('th', 'Ref. No.'), el('th', 'Bill'),
                el('th.num', 'Amt. Due'), el('th.num', 'Disc. Avail.'),
                el('th.num', 'Disc. Used'), el('th.num', 'Amt. To Pay'))),
            body, el('tfoot', el('tr', el('td', {colspan: 7}, 'Totals'),
                totalDisc, totalPay)))));
        main.appendChild(el('div.toolbar', el('span.spacer'),
            el('button.primary', {type: 'button', onclick: function () {
                var items = bills.filter(function (bill) {
                    return bill.selected && (bill.pay || bill.disc);
                }).map(function (bill) {
                    return {line: bill.line, amount: String(bill.pay || 0),
                        discount: String(bill.disc || 0)};
                });
                if (!items.length) {
                    UI.showError('Select the bills to pay.');
                    return;
                }
                UI.service('pay_bills', {journal: parseInt(method.value, 10),
                    date: date.value, items: items}).then(function (result) {
                    UI.toast('Paid ' + UI.money(result.amount, true) +
                        (result.checks.length ? ', checks ' +
                            result.checks.join(', ') : ''), 'ok');
                    if (result.checks.length) {
                        UI.confirm('Print checks', 'Print ' +
                            result.checks.length + ' check(s) now?').then(
                            function (ok) {
                                if (ok) {
                                    printChecks(result.group);
                                }
                                load();
                            });
                    } else {
                        load();
                    }
                }, function (error) {
                    if (!error.cancelled) {
                        UI.showError(error);
                    }
                });
            }}, 'Pay Selected Bills')));
        date.addEventListener('change', load);
        dueBy.addEventListener('change', render);
        showAll.addEventListener('change', render);
        load();
    };

    /* Customer and Vendor Centers share the layout (UI.center) */
    function center(main, kind) {
        var field = kind === 'customer' ? 'receivable' : 'payable';
        UI.center(main, {
            title: kind === 'customer' ? 'Customer Center' : 'Vendor Center',
            empty: 'Choose a ' + kind + '.',
            actions: kind === 'customer' ? [
                {label: 'New Invoice', route: 'invoices/new'},
                {label: 'Receive Payments', route: 'payments/receive'}] : [
                {label: 'Enter Bills', route: 'bills/new'},
                {label: 'Pay Bills', route: 'bills/pay'},
                {label: 'Write Checks', route: 'checks/new'}],
            list: function (text) {
                var domain = [];
                if (text) {
                    domain.push(['rec_name', 'ilike', '%' + text + '%']);
                }
                return Rpc.searchRead('party.party', domain, ['rec_name',
                    field], {limit: 200, order: [['name', 'ASC']]}).then(
                    function (rows) {
                        return rows.map(function (row) {
                            return {id: row.id, name: row.rec_name, amount:
                                kind === 'customer' ? row.receivable :
                                    -row.payable};
                        });
                    });
            },
            detail: function (id, detail) {
                show(id, detail);
            }
        });

        function show(id, detail) {
            Rpc.desk('party_center', [id, kind]).then(function (data) {
                UI.clear(detail);
                detail.appendChild(el('h2', {style: {marginTop: 0}},
                    el('a', {href: '#', title: 'Open in Tryton', onclick:
                        function (event) {
                            event.preventDefault();
                            UI.openRecord('party.party', id, data.name);
                        }}, data.name)));
                detail.appendChild(el('p', 'Open balance: ', el('strong',
                    UI.money(data.balance, true))));
                if (kind === 'customer') {
                    detail.appendChild(el('div.toolbar', el('button', {
                        type: 'button', onclick: function () {
                            var from = UI.addDays(UI.today(), -90);
                            Rpc.report('nline.customer_statement', [id], {
                                company: Rpc.context().company,
                                from_date: Rpc.date(from),
                                to_date: Rpc.date(UI.today()),
                                parties: [id]}).then(function (report) {
                                UI.openReport(report, 'Statement');
                            }, UI.showError);
                        }}, 'Statement (90 days)')));
                }
                var body = el('tbody');
                data.transactions.forEach(function (t) {
                    var model = t.type === 'payment' ? 'account.payment' :
                        'account.invoice';
                    body.appendChild(el('tr', {title: 'Double-click to open',
                        ondblclick: function () {
                            UI.openRecord(model, t.id, t.number);
                        }}, el('td', UI.date(t.date)),
                        el('td', t.type), el('td', t.number || ''),
                        el('td', t.reference || ''),
                        el('td.num', UI.money(t.amount)),
                        el('td.num', t.open_amount !== null ?
                            UI.money(t.open_amount) : ''),
                        el('td', el('span.badge.' + (t.state === 'paid' ||
                            t.state === 'succeeded' ? 'paid' : 'open'),
                            t.state))));
                });
                if (!data.transactions.length) {
                    body.appendChild(el('tr', el('td', {colspan: 7},
                        'No transaction.')));
                }
                detail.appendChild(el('div.table-wrap', el('table.data',
                    el('thead', el('tr', el('th', 'Date'), el('th', 'Type'),
                        el('th', 'Number'), el('th', 'Reference'),
                        el('th.num', 'Amount'), el('th.num', 'Open'),
                        el('th', 'State'))), body)));
            }, UI.showError);
        }
    }
    Screens.center = center;

    Screens.vendors = function (main) {
        center(main, 'vendor');
    };
}(window));
