/* N-Line Desk: banking screens (Check Register) */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    Screens.register = function (main) {
        main.appendChild(el('h1', 'Check Register'));
        var journal = el('select', {'aria-label': 'Bank account'});
        var from = el('input', {type: 'date', value: UI.addDays(UI.today(),
            -60), 'aria-label': 'From'});
        var to = el('input', {type: 'date', value: UI.today(),
            'aria-label': 'To'});
        var body = el('tbody');
        var ending = el('strong', '');
        main.appendChild(el('div.panel', el('div.grid-form',
            el('div', {style: {gridColumn: 'span 2'}}, el('label.field',
                'Bank account'), journal),
            el('div', el('label.field', 'From'), from),
            el('div', el('label.field', 'To'), to),
            el('div', el('label.field', 'Ending balance'), ending))));
        main.appendChild(el('div.toolbar',
            el('a', {href: '#/checks/new'}, 'Write check'),
            el('a', {href: '#/deposits/new'}, 'Make deposit'),
            el('span.spacer'),
            el('span.muted', '✔ = cleared by the bank statement')));
        main.appendChild(el('div.table-wrap', el('table.data.register',
            el('thead', el('tr', el('th', 'Date'), el('th', 'Number'),
                el('th', 'Payee'), el('th', 'Memo'),
                el('th.num', 'Payment'), el('th', '✔'),
                el('th.num', 'Deposit'), el('th.num', 'Balance'))), body)));

        function load() {
            if (!journal.value) {
                return;
            }
            Rpc.desk('register', [parseInt(journal.value, 10), from.value,
                to.value]).then(function (rows) {
                UI.clear(body);
                rows.forEach(function (row) {
                    body.appendChild(el('tr', el('td', UI.date(row.date)),
                        el('td', row.number || ''), el('td', row.party_name),
                        el('td', row.memo),
                        el('td.num', row.payment ? UI.money(row.payment) : ''),
                        el('td.cleared', row.cleared ? '✔' : ''),
                        el('td.num', row.deposit ? UI.money(row.deposit) : ''),
                        el('td.num', UI.money(row.balance))));
                });
                if (!rows.length) {
                    body.appendChild(el('tr', el('td', {colspan: 8},
                        'No transaction in the period.')));
                }
                ending.textContent = rows.length ?
                    UI.money(rows[rows.length - 1].balance, true) : '';
            }, UI.showError);
        }

        Screens.paymentJournals(['check']).then(function (rows) {
            rows.forEach(function (row) {
                journal.appendChild(el('option', {value: row.id},
                    row.name.replace(/ Checks$/, '')));
            });
            load();
        }, UI.showError);
        [journal, from, to].forEach(function (input) {
            input.addEventListener('change', load);
        });
    };
}(window));
