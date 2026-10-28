/* N-Line Desk: the work orders list and a work order's Details tab
 *
 * The list of the open work orders and Jobs; a work order opens in the
 * Jobshop Work Order window on its Details tab (the information cards,
 * js/jobshop/engineering.js: Jobshop's stacks of cards, legs, zoom,
 * right-click menus and the drag-a-master panel).
 */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    Screens.workorders = function (main) {
        main = UI.form(main, {title: 'Work Orders'}).body;
        var search = el('input', {type: 'text', placeholder:
            'Search number or part', 'aria-label': 'Search work orders'});
        var body = el('tbody');
        main.appendChild(el('div.toolbar', el('div', {style: {width:
            '320px'}}, search), el('span.spacer'),
            el('span.muted', 'Open work orders and Jobs')));
        main.appendChild(el('div.table-wrap', el('table.data',
            el('thead', el('tr', el('th', 'Number'), el('th', 'Part'),
                el('th', 'Rev'), el('th.num', 'Qty'), el('th', 'Start'),
                el('th', 'Due'), el('th', 'For'), el('th', 'State'))),
            body)));

        function load() {
            var domain = [['parent', '=', null],
                ['state', 'not in', ['done', 'cancelled']]];
            var text = search.value.trim();
            if (text) {
                domain.push(['OR', ['number', 'ilike', '%' + text + '%'],
                    ['product.rec_name', 'ilike', '%' + text + '%']]);
            }
            Rpc.searchRead('production', domain, ['number',
                'product.rec_name', 'bom.revision', 'quantity',
                'unit.symbol', 'planned_start_date', 'planned_date',
                'origin.rec_name', 'state', 'job'], {limit: 200,
                    order: [['number', 'ASC']]}).then(function (rows) {
                UI.clear(body);
                rows.forEach(function (row) {
                    body.appendChild(el('tr', {style: {cursor: 'pointer'},
                        onclick: function () {
                            global.location.hash = '#/workorders/' + row.id;
                        }},
                        el('td', el('a', {href: '#/workorders/' + row.id},
                            row.number), row.job ? el('span.badge', ' Job') :
                            null),
                        el('td', row['product.'] ? row['product.'].rec_name :
                            ''),
                        el('td', row['bom.'] ? row['bom.'].revision || '' :
                            ''),
                        el('td.num', row.quantity + ' ' + (row['unit.'] ?
                            row['unit.'].symbol : '')),
                        el('td', UI.date(row.planned_start_date)),
                        el('td', UI.date(row.planned_date)),
                        el('td', row['origin.'] ? row['origin.'].rec_name :
                            ''),
                        el('td', el('span.badge.st-' + row.state,
                            row.state))));
                });
                if (!rows.length) {
                    body.appendChild(el('tr', el('td', {colspan: 8},
                        'No open work order.')));
                }
            }, UI.showError);
        }
        var timer;
        search.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(load, 250);
        });
        load();
    };

    /* A work order: the Work Order window on its Details tab (the cards) */
    Screens.workorder = function (main, params) {
        Screens.jsWorkOrder(main, params, {tab: 'Details'});
    };
}(window));
