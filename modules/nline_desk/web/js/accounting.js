/* N-Line screens: QuickBooks daily accounting (UI upgrade phase 2):
 * Sales Receipts, Credit Memos, Vendor Credits, Create Statements, Enter
 * Credit Card Charges, Make General Journal Entries, Chart of Accounts and
 * registers, Reconcile, Income Tracker, Bill Tracker, Item List, Report
 * Center and the reports */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    function failed(error) {
        if (!error || !error.cancelled) {
            UI.showError(error);
        }
    }

    function field(label, control, span) {
        return el('div', span ? {style: {gridColumn: 'span ' + span}} : null,
            el('label.field', label), control.node || control);
    }

    function journalSelect(methods, label) {
        var select = el('select', {'aria-label': label});
        Screens.paymentJournals(methods).then(function (rows) {
            rows.forEach(function (row) {
                select.appendChild(el('option', {value: row.id}, row.name));
            });
        }, UI.showError);
        return select;
    }

    /* ---- Sales Receipts ------------------------------------------------ */

    Screens.salesReceipt = function (main) {
        var form = UI.form(main, {title: 'Enter Sales Receipts',
            kind: 'customer',
            find: {model: 'account.invoice', title: 'Find sales',
                domain: [['type', '=', 'out']],
                order: [['invoice_date', 'DESC'], ['id', 'DESC']],
                columns: Screens.INVOICE_COLUMNS},
            onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/sales-receipts/new?' + Date.now();
            }});
        main = form.body;
        var customer = UI.picker('party.party', {placeholder: 'Customer',
            label: 'Customer', onselect: function (record) {
                form.showParty(record.id);
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var number = el('input', {type: 'text', 'aria-label': 'Sale No.'});
        var check = el('input', {type: 'text', 'aria-label': 'Check No.'});
        var journal = journalSelect(['manual', 'check'], 'Deposit to');
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var total = el('div.big-total', '$0.00');
        var grid = Screens.itemGrid(function (sum) {
            total.textContent = UI.money(sum, true);
        });
        main.appendChild(el('div.panel', el('div.grid-form',
                field('Customer', customer, 2), field('Date', date),
                field('Sale No.', number), field('Check No.', check),
                field('Deposit to (payment method)', journal, 2)),
            el('h2', 'Items'), grid.node,
            el('div.grid-form', {style: {marginTop: '12px'}},
                field('Memo', memo, 2), el('div'),
                field('Total (tax added when posted)', total))));

        function save(andNew) {
            var lines;
            try {
                lines = grid.lines();
            } catch (error) {
                UI.showError(error.message);
                return;
            }
            if (!customer.value() || !lines.length || !journal.value) {
                UI.showError('Enter the customer, the payment method and ' +
                    'at least one line.');
                return;
            }
            return UI.service('sales_receipt', {party: customer.value(),
                date: date.value, reference: number.value || null,
                payment_reference: check.value || null,
                memo: memo.value || null, journal: parseInt(journal.value, 10),
                lines: lines}).then(function (result) {
                    UI.toast('Sales receipt ' + result.number + ' of ' +
                        UI.money(result.total_amount, true) +
                        ' received into undeposited funds', 'ok');
                    global.location.hash = andNew ? '#/sales-receipts/new?' +
                        Date.now() : '#/';
                }, failed);
        }
    };

    /* ---- Credit Memos / Vendor Credits ---------------------------------- */

    function creditScreen(main, kind) {
        var customer = kind === 'customer';
        var title = customer ? 'Create Credit Memos/Refunds' :
            'Enter Vendor Credits';
        var route = customer ? 'credits/new' : 'vendor-credits/new';
        var form = UI.form(main, {title: title, kind: kind,
            find: {model: 'account.invoice', title: 'Find credits',
                domain: [['type', '=', customer ? 'out' : 'in'],
                    ['total_amount', '<', 0]],
                order: [['invoice_date', 'DESC'], ['id', 'DESC']],
                columns: Screens.INVOICE_COLUMNS},
            onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/' + route + '?' + Date.now();
            }});
        main = form.body;
        var applyTo = el('select', {'aria-label': 'Apply to'},
            el('option', {value: ''}, 'Keep as an available credit'));
        var party = UI.picker('party.party', {placeholder: customer ?
            'Customer' : 'Vendor', label: customer ? 'Customer' : 'Vendor',
            onselect: function (record) {
                form.showParty(record.id);
                UI.clear(applyTo).appendChild(el('option', {value: ''},
                    'Keep as an available credit'));
                Rpc.desk(customer ? 'open_invoices' : 'open_bills',
                    [record.id, null]).then(function (rows) {
                        rows.forEach(function (row) {
                            applyTo.appendChild(el('option', {value:
                                row.invoice}, 'Apply to ' + row.number +
                                ' (open ' + UI.money(row.open_amount, true) +
                                ')'));
                        });
                    }, function () {});
            }});
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var ref = el('input', {type: 'text', 'aria-label': 'Ref. No.'});
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var total = el('div.big-total', '$0.00');
        var grid = customer ? Screens.itemGrid(function (sum) {
            total.textContent = UI.money(sum, true);
        }) : Screens.expenseGrid(function (sum) {
            total.textContent = UI.money(sum, true);
        });
        main.appendChild(el('div.panel', el('div.grid-form',
                field(customer ? 'Customer' : 'Vendor', party, 2),
                field('Date', date), field(customer ? 'Credit No.' :
                    'Ref. No.', ref), field('Credit amount', total)),
            el('h2', customer ? 'Items' : 'Expenses'), grid.node,
            el('div.grid-form', {style: {marginTop: '12px'}},
                field('Memo', memo, 2), field('Use the credit', applyTo, 2))));

        function save(andNew) {
            var lines;
            try {
                lines = grid.lines();
            } catch (error) {
                UI.showError(error.message);
                return;
            }
            if (!party.value() || !lines.length) {
                UI.showError('Enter the ' + kind + ' and at least one line.');
                return;
            }
            return UI.service('credit_memo', {kind: kind, party: party.value(),
                date: date.value, reference: ref.value || null,
                memo: memo.value || null, lines: lines,
                apply_to: applyTo.value ? parseInt(applyTo.value, 10) :
                    null}).then(function (result) {
                    UI.toast('Credit ' + result.number + ' of ' +
                        UI.money(-result.total_amount, true) + ' posted' +
                        (result.applied ? ' and applied' : ''), 'ok');
                    global.location.hash = andNew ? '#/' + route + '?' +
                        Date.now() : '#/';
                }, failed);
        }
    }

    Screens.creditMemo = function (main) {
        creditScreen(main, 'customer');
    };

    Screens.vendorCredit = function (main) {
        creditScreen(main, 'vendor');
    };

    /* ---- Create Statements ---------------------------------------------- */

    Screens.statements = function (main) {
        main = UI.form(main, {title: 'Create Statements', extra: [
            {label: 'Print / Preview', onclick: function () {
                print();
            }}]}).body;
        var from = el('input', {type: 'date', value: UI.addDays(UI.today(),
            -30), 'aria-label': 'From'});
        var to = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'To'});
        var onlyBalance = el('input', {type: 'checkbox', checked: true,
            id: 'only-balance'});
        var body = el('tbody');
        var parties = [];
        main.appendChild(el('div.panel', el('div.grid-form',
            field('Statement period from', from), field('To', to),
            el('div', el('label.field', 'Customers'), el('div', onlyBalance,
                el('label', {for: 'only-balance'},
                    ' only with an open balance'))))));
        main.appendChild(el('div.toolbar', el('button', {type: 'button',
            onclick: function () {
                select(true);
            }}, 'Select All'), el('button', {type: 'button', onclick:
            function () {
                select(false);
            }}, 'Clear Selections')));
        main.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', ''), el('th', 'Customer'),
                el('th.num', 'Open balance'))), body)));

        function select(on) {
            parties.forEach(function (p) {
                p.selected = on;
            });
            render();
        }

        function render() {
            UI.clear(body);
            parties.filter(function (p) {
                return !onlyBalance.checked || p.receivable;
            }).forEach(function (p) {
                var box = el('input', {type: 'checkbox', checked: p.selected,
                    'aria-label': 'Statement for ' + p.rec_name});
                box.addEventListener('change', function () {
                    p.selected = box.checked;
                });
                body.appendChild(el('tr', el('td', box), el('td', p.rec_name),
                    el('td.num', UI.money(p.receivable))));
            });
        }

        function load() {
            Rpc.searchRead('party.party', [], ['rec_name', 'receivable'],
                {order: [['name', 'ASC']], limit: 1000}).then(function (rows) {
                    parties = rows.map(function (r) {
                        r.selected = !!r.receivable;
                        return r;
                    });
                    render();
                }, UI.showError);
        }

        function print() {
            var ids = parties.filter(function (p) {
                return p.selected && (!onlyBalance.checked || p.receivable);
            }).map(function (p) {
                return p.id;
            });
            if (!ids.length) {
                UI.showError('Select the customers.');
                return;
            }
            Rpc.report('nline.customer_statement', ids, {
                company: Rpc.context().company,
                from_date: Rpc.date(from.value),
                to_date: Rpc.date(to.value),
                parties: ids}).then(function (report) {
                    UI.openReport(report, 'Statements');
                }, UI.showError);
        }
        onlyBalance.addEventListener('change', render);
        load();
    };

    /* ---- Enter Credit Card Charges ---------------------------------------- */

    Screens.creditCard = function (main) {
        var form = UI.form(main, {title: 'Enter Credit Card Charges',
            kind: 'vendor', onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/cards/new?' + Date.now();
            }});
        main = form.body;
        var card = UI.picker('account.account', {placeholder:
            'Credit card account', label: 'Credit card', domain: [
                ['type.statement', '=', 'balance'],
                ['type.assets', '!=', true], ['closed', '!=', true]]});
        var vendor = UI.picker('party.party', {placeholder: 'Purchased from',
            label: 'Purchased from', onselect: function (record) {
                form.showParty(record.id);
            }});
        var kind = el('select', {'aria-label': 'Charge or credit'},
            el('option', {value: ''}, 'Purchase/Charge'),
            el('option', {value: '1'}, 'Refund/Credit'));
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var ref = el('input', {type: 'text', 'aria-label': 'Ref. No.'});
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var total = el('div.big-total', '$0.00');
        var grid = Screens.expenseGrid(function (sum) {
            total.textContent = UI.money(sum, true);
        });
        main.appendChild(el('div.panel', el('div.grid-form',
                field('Credit card', card, 2), field('', kind),
                field('Purchased from', vendor, 2), field('Date', date),
                field('Ref. No.', ref), field('Amount', total)),
            el('h2', 'Expenses'), grid.node,
            el('div.grid-form', {style: {marginTop: '12px'}},
                field('Memo', memo, 2))));

        function save(andNew) {
            var lines;
            try {
                lines = grid.lines();
            } catch (error) {
                UI.showError(error.message);
                return;
            }
            if (!card.value() || !lines.length) {
                UI.showError('Enter the credit card account and at least ' +
                    'one expense.');
                return;
            }
            return UI.service('credit_card_charge', {card: card.value(),
                party: vendor.value(), date: date.value,
                reference: ref.value || null, memo: memo.value || null,
                refund: !!kind.value, lines: lines.map(function (l) {
                    return {account: l.account, memo: l.description,
                        amount: l.amount};
                })}).then(function (result) {
                    UI.toast('Charge ' + result.number + ' of ' +
                        UI.money(result.amount, true) + ' entered', 'ok');
                    global.location.hash = andNew ? '#/cards/new?' +
                        Date.now() : '#/';
                }, failed);
        }
    };

    /* ---- Make General Journal Entries ------------------------------------- */

    Screens.journalEntry = function (main) {
        var form = UI.form(main, {title: 'Make General Journal Entries',
            find: {model: 'account.move', title: 'Find entries',
                order: [['date', 'DESC'], ['id', 'DESC']],
                columns: [{field: 'number', label: 'Number'},
                    {field: 'date', label: 'Date'},
                    {field: 'description', label: 'Memo'},
                    {field: 'state', label: 'State'}]},
            onSave: function (andNew) {
                return save(andNew);
            },
            onClear: function () {
                global.location.hash = '#/journal/new?' + Date.now();
            }});
        main = form.body;
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Date'});
        var memo = el('input', {type: 'text', 'aria-label': 'Memo'});
        var debits = el('strong', '0.00');
        var credits = el('strong', '0.00');
        var grid = UI.grid({total: 'debit', required: null, columns: [
            {key: 'account', label: 'Account', width: '30%', kind: 'picker',
                picker: {model: 'account.account', domain: [
                    ['type', '!=', null], ['closed', '!=', true]],
                    placeholder: 'Account'}},
            {key: 'debit', label: 'Debit', width: '13%', kind: 'money'},
            {key: 'credit', label: 'Credit', width: '13%', kind: 'money'},
            {key: 'memo', label: 'Memo'},
            {key: 'party', label: 'Name', width: '20%', kind: 'picker',
                picker: {model: 'party.party', placeholder: 'Name'}}
        ], onchange: totals});
        grid.node.addEventListener('input', totals);
        grid.node.addEventListener('focusout', totals);

        function totals() {
            var d = 0, c = 0;
            grid.rows().forEach(function (row) {
                d += row.debit || 0;
                c += row.credit || 0;
            });
            debits.textContent = UI.money(d);
            credits.textContent = UI.money(c);
            return [d, c];
        }
        main.appendChild(el('div.panel', el('div.grid-form',
                field('Date', date), field('Memo', memo, 3)),
            el('h2', 'Lines'), grid.node,
            el('p', 'Debits ', debits, '   Credits ', credits)));

        function save(andNew) {
            var lines = grid.rows().filter(function (row) {
                return row.debit || row.credit;
            });
            var t = totals();
            if (!lines.length || Math.abs(t[0] - t[1]) > 0.004) {
                UI.showError('Enter balanced lines: the debits and the ' +
                    'credits must be equal.');
                return;
            }
            if (lines.some(function (l) {
                return !l.account;
            })) {
                UI.showError('Choose the account of every line.');
                return;
            }
            return UI.service('journal_entry', {date: date.value,
                memo: memo.value || null, lines: lines.map(function (l) {
                    return {account: l.account, debit: String(l.debit || 0),
                        credit: String(l.credit || 0), memo: l.memo || null,
                        party: l.party};
                })}).then(function (result) {
                    UI.toast('Journal entry ' + result.number + ' posted',
                        'ok');
                    global.location.hash = andNew ? '#/journal/new?' +
                        Date.now() : '#/';
                }, failed);
        }
    };

    /* ---- Chart of Accounts and registers ---------------------------------- */

    Screens.accounts = function (main) {
        main = UI.form(main, {title: 'Chart of Accounts', extra: [
            {label: 'Journal Entry', onclick: function () {
                UI.openScreen('journal/new');
            }}]}).body;
        var search = el('input', {type: 'text', placeholder: 'Search',
            'aria-label': 'Search accounts'});
        var body = el('tbody');
        var accounts = [];
        main.appendChild(el('div.toolbar', el('div', {style: {width:
            '320px'}}, search), el('span.spacer'), el('span.muted',
            'Double-click an account to open its register')));
        main.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', 'Number'), el('th', 'Name'), el('th', 'Type'),
                el('th.num', 'Balance Total'))), body)));

        function render() {
            var text = search.value.trim().toLowerCase();
            UI.clear(body);
            accounts.filter(function (a) {
                return !text || (a.code + ' ' + a.name + ' ' + a.type)
                    .toLowerCase().indexOf(text) >= 0;
            }).forEach(function (a) {
                body.appendChild(el('tr', {title: 'Double-click to open the ' +
                    'register', ondblclick: function () {
                        UI.openScreen('accounts/' + a.id, a.name);
                    }}, el('td', a.code), el('td', a.name), el('td', a.type),
                    el('td.num', a.statement === 'balance' ?
                        UI.money(a.balance) : '')));
            });
        }
        search.addEventListener('input', render);
        Rpc.desk('accounts', [null]).then(function (rows) {
            accounts = rows;
            render();
        }, UI.showError);
    };

    Screens.accountRegister = function (main, params) {
        var id = parseInt(params[0], 10);
        var form = UI.form(main, {title: 'Register'});
        main = form.body;
        var from = el('input', {type: 'date', value: UI.addDays(UI.today(),
            -90), 'aria-label': 'From'});
        var to = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'To'});
        var ending = el('strong', '');
        var body = el('tbody');
        main.appendChild(el('div.toolbar', el('label.field', 'From'), from,
            el('label.field', 'To'), to, el('span.spacer'),
            el('span', 'Ending balance ', ending)));
        main.appendChild(el('div.table-wrap', el('table.data.register',
            el('thead', el('tr', el('th', 'Date'), el('th', 'Number'),
                el('th', 'Name'), el('th', 'Memo'), el('th.num', 'Increase'),
                el('th.num', 'Decrease'), el('th', '✔'),
                el('th.num', 'Balance'))), body)));

        function load() {
            Rpc.desk('account_register', [id, from.value || null,
                to.value || null]).then(function (data) {
                    form.ribbon.querySelector('.ribbon-title').textContent =
                        'Register: ' + data.name;
                    UI.setTitle('Register: ' + data.name);
                    ending.textContent = UI.money(data.balance, true);
                    UI.clear(body);
                    data.rows.forEach(function (r) {
                        body.appendChild(el('tr', {title: 'Double-click to ' +
                            'open', ondblclick: function () {
                                var origin = r.origin ? r.origin.split(',') :
                                    null;
                                if (origin && parseInt(origin[1], 10) > 0) {
                                    UI.openRecord(origin[0], parseInt(
                                        origin[1], 10), r.number);
                                } else {
                                    UI.openRecord('account.move', r.move,
                                        r.number);
                                }
                            }}, el('td', UI.date(r.date)),
                            el('td', r.number), el('td', r.party_name),
                            el('td', r.memo), el('td.num', r.debit ?
                                UI.money(r.debit) : ''),
                            el('td.num', r.credit ? UI.money(r.credit) : ''),
                            el('td', r.reconciled ? '✔' : ''),
                            el('td.num', UI.money(r.balance))));
                    });
                    if (!data.rows.length) {
                        body.appendChild(el('tr', el('td', {colspan: 8},
                            'No line in the period.')));
                    }
                }, UI.showError);
        }
        from.addEventListener('change', load);
        to.addEventListener('change', load);
        load();
    };

    /* ---- Reconcile ------------------------------------------------------ */

    Screens.reconcile = function (main) {
        main = UI.form(main, {title: 'Reconcile'}).body;
        var journal = journalSelect(['check', 'manual', 'nacha'],
            'Account');
        var date = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'Statement date'});
        var ending = UI.moneyInput({'aria-label': 'Ending balance'});
        var begin = el('strong', '');
        var clearedOut = el('strong', '0.00');
        var clearedIn = el('strong', '0.00');
        var clearedBalance = el('strong', '');
        var difference = el('strong', '');
        var checks = el('tbody');
        var deposits = el('tbody');
        var data = null;
        var button = el('button.primary', {type: 'button', disabled: true,
            onclick: save}, 'Reconcile Now');
        main.appendChild(el('div.panel', el('div.grid-form',
            field('Account', journal, 2), field('Statement date', date),
            field('Beginning balance', begin),
            field('Ending balance', ending))));
        main.appendChild(el('div.reconcile', el('div',
            el('h2', 'Checks and Payments'), el('div.table-wrap',
                el('table.data', el('thead', el('tr', el('th', '✔'),
                    el('th', 'Date'), el('th', 'Chk #'), el('th', 'Payee'),
                    el('th.num', 'Amount'))), checks))),
            el('div', el('h2', 'Deposits and Other Credits'),
                el('div.table-wrap', el('table.data', el('thead', el('tr',
                    el('th', '✔'), el('th', 'Date'), el('th', 'Chk #'),
                    el('th', 'Memo'), el('th.num', 'Amount'))), deposits)))));
        main.appendChild(el('div.panel.reconcile-totals',
            el('span', 'Deposits cleared ', clearedIn),
            el('span', 'Checks cleared ', clearedOut),
            el('span', 'Cleared balance ', clearedBalance),
            el('span', 'Difference ', difference), el('span.spacer'),
            button));

        function load() {
            if (!journal.value) {
                return;
            }
            Rpc.desk('reconcile_data', [parseInt(journal.value, 10)]).then(
                function (result) {
                    data = result;
                    data.items.forEach(function (i) {
                        i.ticked = false;
                    });
                    render();
                }, UI.showError);
        }

        function render() {
            UI.clear(checks);
            UI.clear(deposits);
            begin.textContent = UI.money(data.beginning_balance, true);
            data.items.forEach(function (item) {
                var box = el('input', {type: 'checkbox', checked: item.ticked,
                    'aria-label': 'Cleared'});
                box.addEventListener('change', function () {
                    item.ticked = box.checked;
                    totals();
                });
                var out = item.amount < 0;
                (out ? checks : deposits).appendChild(el('tr', el('td', box),
                    el('td', UI.date(item.date)), el('td', item.number),
                    el('td', out ? item.party_name : item.memo ||
                        item.party_name),
                    el('td.num', UI.money(Math.abs(item.amount)))));
            });
            totals();
        }

        function totals() {
            if (!data) {
                return;
            }
            var inSum = 0, outSum = 0;
            data.items.forEach(function (item) {
                if (item.ticked) {
                    if (item.amount < 0) {
                        outSum -= item.amount;
                    } else {
                        inSum += item.amount;
                    }
                }
            });
            var cleared = data.beginning_balance + inSum - outSum;
            var diff = Math.round((UI.parseMoney(ending.value) - cleared) *
                100) / 100;
            clearedIn.textContent = UI.money(inSum, true);
            clearedOut.textContent = UI.money(outSum, true);
            clearedBalance.textContent = UI.money(cleared, true);
            difference.textContent = UI.money(diff, true);
            difference.classList.toggle('bad', !!diff);
            button.disabled = !!diff || !ending.value;
        }

        function save() {
            var lines = data.items.filter(function (i) {
                return i.ticked;
            }).map(function (i) {
                return i.line;
            });
            UI.service('reconcile', {journal: parseInt(journal.value, 10),
                date: date.value, ending_balance:
                    String(UI.parseMoney(ending.value)), lines: lines}).then(
                function (result) {
                    UI.toast('Reconciled: ' + result.lines + ' item(s) ' +
                        'cleared', 'ok');
                    load();
                }, failed);
        }
        journal.addEventListener('change', load);
        ending.addEventListener('input', totals);
        ending.addEventListener('blur', totals);
        setTimeout(load, 400);
    };

    /* ---- Income Tracker / Bill Tracker ------------------------------------ */

    function tracker(main, kind) {
        var customer = kind === 'customer';
        main = UI.form(main, {title: customer ? 'Income Tracker' :
            'Bill Tracker'}).body;
        var tiles = el('div.tracker-tiles');
        var body = el('tbody');
        var filter = null;
        var data = null;
        main.appendChild(tiles);
        main.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', customer ? 'Customer' : 'Vendor'),
                el('th', 'Type'), el('th', 'Number'), el('th', 'Date'),
                el('th', 'Due Date'), el('th.num', 'Amount'),
                el('th.num', 'Open Balance'), el('th', 'Status'),
                el('th', 'Action'))), body)));
        var TILES = [
            ['unbilled', customer ? 'Unbilled (sales orders)' :
                'Purchase orders not billed'],
            ['open', 'Unpaid'], ['overdue', 'Overdue'],
            ['paid', 'Paid (last 30 days)']];

        function render() {
            UI.clear(tiles);
            TILES.forEach(function (t) {
                tiles.appendChild(el('a.tracker-tile.' + t[0] + (filter ===
                    t[0] ? '.active' : ''), {href: '#', onclick: function (
                        event) {
                        event.preventDefault();
                        filter = filter === t[0] ? null : t[0];
                        render();
                    }}, el('strong', UI.money(data.totals[t[0]] || 0, true)),
                    el('span', (data.counts[t[0]] || 0) + ' ' + t[1])));
            });
            UI.clear(body);
            data.rows.filter(function (r) {
                return !filter || r.status === filter || (filter === 'open'
                    && r.status === 'overdue');
            }).forEach(function (r) {
                var action = el('select', {'aria-label': 'Action'},
                    el('option', {value: ''}, 'Action'),
                    el('option', {value: 'open'}, 'Open'),
                    r.status === 'open' || r.status === 'overdue' ?
                        el('option', {value: 'pay'}, customer ?
                            'Receive Payment' : 'Pay Bill') : null);
                action.addEventListener('change', function () {
                    if (action.value === 'open') {
                        UI.openRecord(r.model, r.id, r.number);
                    } else if (action.value === 'pay') {
                        UI.openScreen(customer ? 'payments/receive' :
                            'bills/pay');
                    }
                    action.value = '';
                });
                body.appendChild(el('tr', {ondblclick: function () {
                    UI.openRecord(r.model, r.id, r.number);
                }}, el('td', r.party_name), el('td', r.type),
                    el('td', r.number), el('td', UI.date(r.date)),
                    el('td', UI.date(r.due_date)),
                    el('td.num', UI.money(r.amount)),
                    el('td.num', r.open_amount ? UI.money(r.open_amount) :
                        ''),
                    el('td', el('span.badge.' + (r.status === 'paid' ? 'paid'
                        : 'open'), r.status)), el('td', action)));
            });
        }
        Rpc.desk('tracker', [kind]).then(function (result) {
            data = result;
            render();
        }, UI.showError);
    }

    Screens.incomeTracker = function (main) {
        tracker(main, 'customer');
    };

    Screens.billTracker = function (main) {
        tracker(main, 'vendor');
    };

    /* ---- Item List ---------------------------------------------------------- */

    Screens.items = function (main) {
        main = UI.form(main, {title: 'Item List'}).body;
        var search = el('input', {type: 'text', placeholder: 'Search items',
            'aria-label': 'Search items'});
        var body = el('tbody');
        main.appendChild(el('div.toolbar', el('div', {style: {width:
            '320px'}}, search), el('span.spacer'), el('span.muted',
            'Double-click an item to open it')));
        main.appendChild(el('div.table-wrap', el('table.data', el('thead',
            el('tr', el('th', 'Name'), el('th', 'Type'),
                el('th', 'Description'), el('th.num', 'Price'),
                el('th.num', 'Cost'), el('th.num', 'On Hand'))), body)));

        function load() {
            var domain = [];
            var text = search.value.trim();
            if (text) {
                domain.push(['rec_name', 'ilike', '%' + text + '%']);
            }
            Rpc.searchRead('product.product', domain, ['rec_name', 'type',
                'description', 'list_price', 'cost_price', 'quantity',
                'template'], {limit: 300, order: [['code', 'ASC']]}).then(
                function (rows) {
                    UI.clear(body);
                    rows.forEach(function (r) {
                        body.appendChild(el('tr', {ondblclick: function () {
                            UI.openRecord('product.template', r.template,
                                r.rec_name);
                        }}, el('td', r.rec_name), el('td', r.type),
                            el('td', r.description || ''),
                            el('td.num', UI.money(r.list_price)),
                            el('td.num', UI.money(r.cost_price)),
                            el('td.num', r.type === 'goods' ?
                                String(r.quantity || 0) : '')));
                    });
                }, UI.showError);
        }
        var timer;
        search.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(load, 250);
        });
        load();
    };

    /* ---- Report Center and the reports ------------------------------------ */

    var REPORTS = [
        ['Company & Financial', [
            ['profit_loss', 'Profit & Loss', 'range',
                'Income and expenses for a period'],
            ['balance_sheet', 'Balance Sheet', 'asof',
                'Assets, liabilities and equity on a date']]],
        ['Customers & Receivables', [
            ['ar_aging', 'A/R Aging Summary', 'asof',
                'What customers owe, by how late']]],
        ['Vendors & Payables', [
            ['ap_aging', 'A/P Aging Summary', 'asof',
                'What you owe vendors, by how late']]]
    ];
    Screens.REPORTS = REPORTS;

    function findReport(name) {
        var found = null;
        REPORTS.forEach(function (group) {
            group[1].forEach(function (r) {
                if (r[0] === name) {
                    found = r;
                }
            });
        });
        return found;
    }

    Screens.reportCenter = function (main) {
        main = UI.form(main, {title: 'Report Center'}).body;
        var board = el('div.report-center');
        REPORTS.forEach(function (group) {
            board.appendChild(el('section.panel', el('h2', group[0]),
                group[1].map(function (r) {
                    return el('a.report-link', {href: '#', onclick: function (
                        event) {
                        event.preventDefault();
                        UI.openScreen('reports/' + r[0], r[1]);
                    }}, el('strong', r[1]), el('span.muted', r[3]));
                })));
        });
        main.appendChild(board);
    };

    Screens.report = function (main, params) {
        var r = findReport(params[0]);
        if (!r) {
            main.appendChild(el('p', 'Unknown report.'));
            return;
        }
        UI.report(main, {name: r[0], title: r[1], dates: r[2]});
    };
}(window));
