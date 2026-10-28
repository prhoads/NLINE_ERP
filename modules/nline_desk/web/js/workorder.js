/* N-Line Desk: work orders like the Jobshop "Details" tab
 *
 * Each order or leg is one stack of overlapping cards, as in Jobshop: the
 * order's card at the bottom left, then each next card in sequence / piece
 * order a little up and to the right (the materials of an operation, then
 * the operation). An earlier card lies on top of the next one, so the top
 * line of every card shows. A leg is a stack of its own to the right, joined
 * to the card it supplies. Dragging a master revision from the left panel
 * onto a material card makes that card a leg. Zoom with the buttons or
 * Ctrl + mouse wheel.
 */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    /* A card, and the step from one card to the next of a stack (the
     * strip of each card left showing) */
    var CARD_W = 230, CARD_H = 64, STEP_X = 14, STEP_Y = 20;
    var PROD_W = 250, PROD_H = 72, LEG_GAP = 40, MARGIN = 16;
    var EDITABLE = ['request', 'draft', 'waiting'];

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

    function stateClass(state) {
        return '.st-' + (state || 'draft');
    }

    function code(name) {
        var match = /^\[([^\]]+)\]\s*(.*)$/.exec(name || '');
        return match ? {code: match[1], name: match[2]} : {code: '',
            name: name || ''};
    }

    /* The cards of a production in Jobshop's order: for each operation (by
     * sequence) its material cards (by piece), then the operation */
    function stackOrder(node) {
        var works = (node.works || []).slice().sort(function (a, b) {
            return (a.sequence || 0) - (b.sequence || 0);
        });
        var cards = (node.cards || []).slice().sort(function (a, b) {
            return (a.operation || 0) - (b.operation || 0) ||
                (a.piece || 0) - (b.piece || 0);
        });
        var byWork = works.map(function () {
            return [];
        });
        var loose = [];
        cards.forEach(function (card) {
            var index = -1;
            works.forEach(function (work, i) {
                if (work.sequence !== null &&
                        (card.operation || 0) >= work.sequence) {
                    index = i;
                }
            });
            (index < 0 ? loose : byWork[index]).push(card);
        });
        var order = loose.map(function (card) {
            return {kind: 'mat', data: card};
        });
        works.forEach(function (work, i) {
            byWork[i].forEach(function (card) {
                order.push({kind: 'mat', data: card});
            });
            order.push({kind: 'op', data: work});
        });
        return order;
    }

    /* Compute the positions of the cards of a production and its legs:
     * stacks side by side, all starting on the same bottom line */
    function layout(tree) {
        var stacks = [];

        function collect(node, parentCard) {
            var stack = {node: node, card: parentCard,
                order: stackOrder(node)};
            stacks.push(stack);
            stack.order.forEach(function (item) {
                if (item.kind === 'mat' && item.data.leg) {
                    item.legStack = collect(item.data.leg, item.data);
                }
            });
            return stack;
        }
        collect(tree, null);
        var tallest = 0;
        stacks.forEach(function (stack) {
            tallest = Math.max(tallest, stack.order.length * STEP_Y);
        });
        var bottom = MARGIN + tallest + PROD_H;
        var nodes = [], links = [];
        var x = MARGIN;
        stacks.forEach(function (stack) {
            var n = stack.order.length;
            var z = n + 2;
            stack.prod = {kind: 'prod', x: x, y: bottom - PROD_H, w: PROD_W,
                h: PROD_H, z: z, data: stack.node, card: stack.card};
            nodes.push(stack.prod);
            stack.order.forEach(function (item, i) {
                item.node = {kind: item.kind, x: x + (i + 1) * STEP_X,
                    y: bottom - PROD_H - (i + 1) * STEP_Y, w: CARD_W,
                    h: CARD_H, z: z - i - 1, data: item.data,
                    root: stack.node};
                nodes.push(item.node);
            });
            x += Math.max(PROD_W, n * STEP_X + CARD_W) + LEG_GAP;
        });
        stacks.forEach(function (stack) {
            stack.order.forEach(function (item) {
                if (item.legStack) {
                    links.push({from: item.node, to: item.legStack.prod});
                }
            });
        });
        return {nodes: nodes, links: links, width: x + MARGIN,
            height: bottom + MARGIN};
    }

    Screens.workorder = function (main, params) {
        var id = parseInt(params[0], 10);
        var masters = [];
        var tree = null;
        var title = el('h1', 'Work Order');
        var canvasWrap = el('div.canvas-wrap');
        var info = el('div.muted');
        var masterSearch = el('input', {type: 'text', placeholder:
            'Search masters (part or name)', 'aria-label': 'Search masters'});
        var masterList = el('div');
        var zoomLabel = el('span.muted', {style: {minWidth: '42px',
            textAlign: 'center'}}, '100%');
        main.appendChild(title);
        main.appendChild(el('div.toolbar',
            el('a', {href: '#/workorders'}, '← Work orders'),
            el('span.spacer'), info));
        main.appendChild(el('div.wo-layout',
            el('div.panel.masters',
                el('h2', {style: {marginTop: 0}}, 'Engineering masters'),
                el('p.muted', {style: {fontSize: '12px', margin: '0 0 8px'}},
                    'Drag a revision onto a material card of the same part ' +
                    'to make it a leg.'),
                masterSearch, el('div', {style: {height: '8px'}}),
                masterList),
            el('div',
                el('div.legend',
                    el('span', el('i.card-op'), 'operation'),
                    el('span', el('i.card-out'), 'outside service'),
                    el('span', el('i.card-mat'), 'material'),
                    el('span', el('i.card-closed'), 'closed (C)'),
                    el('span', el('i', {style: {borderLeft:
                        '5px solid var(--leg)'}}), 'leg'),
                    el('span', el('i', {style: {boxShadow:
                        '0 0 0 2px var(--bad)'}}), 'short'),
                    el('span.spacer'),
                    el('button', {type: 'button', title: 'Zoom out',
                        'aria-label': 'Zoom out', onclick: function () {
                            setZoom(zoom / 1.25);
                        }}, '−'),
                    zoomLabel,
                    el('button', {type: 'button', title: 'Zoom in',
                        'aria-label': 'Zoom in', onclick: function () {
                            setZoom(zoom * 1.25);
                        }}, '+'),
                    el('button', {type: 'button', title: 'Actual size',
                        onclick: function () {
                            setZoom(1);
                        }}, '100%')),
                canvasWrap)));

        function loadMasters() {
            Rpc.desk('masters', [masterSearch.value.trim(), 40]).then(
                function (result) {
                    masters = result;
                    renderMasters();
                }, UI.showError);
        }

        function renderMasters() {
            UI.clear(masterList);
            masters.forEach(function (master) {
                var parts = code(master.name);
                masterList.appendChild(el('div.master',
                    el('div.name', parts.code || parts.name),
                    el('div.meta', parts.code ? parts.name : '',
                        master.drawing ? ' · ' + master.drawing : ''),
                    el('div.revs', master.masters.map(function (m) {
                        var chip = el('span.rev' + (m.current ? '.current' :
                            ''), {draggable: 'true', title: 'Rev ' +
                            (m.revision || '-') + ': ' + m.inputs +
                            ' material(s), ' + m.operations +
                            ' operation(s)' + (m.current ? ' (current)' :
                            '')}, 'Rev ' + (m.revision || '-'));
                        chip.addEventListener('dragstart', function (event) {
                            event.dataTransfer.effectAllowed = 'copy';
                            event.dataTransfer.setData(
                                'application/x-nline-master',
                                String(m.product_bom));
                            event.dataTransfer.setData(
                                'application/x-nline-product-' +
                                master.product, '1');
                            event.dataTransfer.setData('text/plain',
                                master.name + ' Rev ' + (m.revision || ''));
                        });
                        return chip;
                    }))));
            });
            if (!masters.length) {
                masterList.appendChild(el('p.muted', 'No master found.'));
            }
        }

        function load() {
            Rpc.desk('work_order', [id]).then(function (result) {
                tree = result;
                render();
            }, UI.showError);
        }

        /* What the user may open and do: a menu item or button they may
         * not use is not shown (no error popups) */
        var SCREENS = ['work-orders', 'parts', 'masters', 'resources',
            'orders', 'purchase-orders', 'issues', 'labor', 'planning'];
        var MODELS = ['production', 'production.material_card'];
        var perm = {screens: {}, access: {}};
        Promise.all([Promise.all(SCREENS.map(UI.screenAllowed)),
            UI.access(MODELS)]).then(function (result) {
            SCREENS.forEach(function (screen, i) {
                perm.screens[screen] = result[0][i];
            });
            perm.access = result[1] || {};
            if (tree) {
                render();
            }
        });
        function can(model, mode) {
            var a = perm.access[model];
            return Boolean(a && a[mode]);
        }
        function opener(screen, path, label) {
            return perm.screens[screen] ? {label: label, onclick: function () {
                UI.openScreen(path);
            }} : null;
        }
        function mayRelease() {
            return can('production', 'write');
        }
        function mayMakeLeg() {
            return can('production', 'create') &&
                can('production.material_card', 'create');
        }
        function mayRemoveLeg() {
            return can('production', 'delete') &&
                can('production.material_card', 'write');
        }

        /* Jobshop's right-click menus of the cards */
        function prodMenu(n) {
            var d = n.data;
            var leg = n.card;
            var open = d.state === 'request' || d.state === 'draft';
            var running = ['waiting', 'assigned', 'running'].indexOf(
                d.state) >= 0;
            return [
                opener('work-orders', 'work-orders/' + d.id,
                    'Open work order' + (leg ? ' (leg)' : '')),
                d.template_id ? opener('parts', 'parts/' + d.template_id,
                    'Open part') : null,
                d.bom_id ? opener('masters', 'masters/' + d.bom_id,
                    'Open engineering master') : null,
                d.sale_id ? opener('orders', 'orders/' + d.sale_id,
                    'Open sales order') : null,
                '-',
                !leg && open && mayRelease() ? {label:
                    'Release with its legs', onclick: release} : null,
                leg && open && mayRemoveLeg() ? {label: 'Remove leg',
                    onclick: function () {
                        removeLeg(leg);
                    }} : null,
                running ? opener('issues', 'issues', 'Issue materials…') :
                    null,
                running ? opener('labor', 'labor', 'Labor entry…') : null,
                {label: 'Print traveler', onclick: traveler},
                '-',
                {label: 'Show details', onclick: function () {
                    details(d.number, [
                        ['Part', d.product],
                        ['Revision', d.revision],
                        ['Quantity', d.quantity + ' ' + (d.unit || '')],
                        ['Status', d.state],
                        ['Start', UI.date(d.planned_start_date)],
                        ['Due', UI.date(d.planned_date)],
                        ['For', d.origin],
                        ['Cost', d.cost !== null && d.cost !== undefined ?
                            UI.money(d.cost) : ''],
                        ['Short', d.shortage ? 'Yes' : 'No']]);
                }}];
        }

        function opMenu(n) {
            var w = n.data;
            var done = w.state === 'done' || w.state === 'finished';
            var running = ['waiting', 'assigned', 'running'].indexOf(
                n.root.state) >= 0;
            return [
                w.work_center_id ? opener('resources', 'resources/' +
                    w.work_center_id, 'Open resource') : null,
                w.purchase_id ? opener('purchase-orders', 'purchase-orders/' +
                    w.purchase_id, 'Open purchase order') : null,
                w.outside && !w.purchase_id && !done ? opener(
                    'purchase-orders', 'purchase-orders/new',
                    'Purchase this service…') : null,
                n.root.bom_id ? opener('masters', 'masters/' + n.root.bom_id,
                    'Open engineering master') : null,
                '-',
                w.id && running && !done ? opener('labor', 'labor',
                    'Labor entry…') : null,
                '-',
                {label: 'Show details', onclick: function () {
                    details((w.sequence !== null ? w.sequence + ' - ' : '') +
                        w.operation, [
                        ['Work order', n.root.number],
                        ['Resource', w.work_center],
                        ['Status', w.state],
                        ['Planned hours', w.planned_duration ?
                            w.planned_duration.toFixed(2) : ''],
                        ['Outside', w.outside ? 'Yes' : 'No'],
                        ['Supplier', w.supplier],
                        ['Purchase order', w.purchase],
                        ['Expected', UI.date(w.expected_date)],
                        ['Cost', w.cost !== null && w.cost !== undefined ?
                            UI.money(w.cost) : '']]);
                }}];
        }

        function matMenu(n, editable) {
            var c = n.data;
            var draft = !c.leg || c.leg.state === 'request' ||
                c.leg.state === 'draft';
            var running = ['waiting', 'assigned', 'running'].indexOf(
                n.root.state) >= 0;
            return [
                c.template_id ? opener('parts', 'parts/' + c.template_id,
                    'Open part') : null,
                c.master_bom_id ? opener('masters', 'masters/' +
                    c.master_bom_id, 'Open engineering master') : null,
                opener('planning', 'planning', 'Supply and demand'),
                c.leg ? {label: 'Go to leg ' + c.leg.number, onclick:
                    function () {
                        goTo(c.leg.id);
                    }} : null,
                '-',
                editable && c.producible && c.supply === 'stock' &&
                    mayMakeLeg() ? {label: 'Make leg…', onclick: function () {
                        askLeg(c, null);
                    }} : null,
                c.supply === 'leg' && draft && mayRemoveLeg() ? {label:
                    'Remove leg', onclick: function () {
                        removeLeg(c);
                    }} : null,
                running && c.supply !== 'leg' && c.state !== 'done' ?
                    opener('issues', 'issues', 'Issue material…') : null,
                c.supply === 'stock' && c.state !== 'done' ? opener(
                    'purchase-orders', 'purchase-orders/new',
                    'Purchase this material…') : null,
                '-',
                {label: 'Show details', onclick: function () {
                    details(c.product, [
                        ['Work order', n.root.number],
                        ['Operation', c.operation],
                        ['Piece', c.piece],
                        ['Quantity', c.quantity + ' ' + c.unit],
                        ['Pinned revision', c.revision],
                        ['Supply', c.supply === 'leg' ? 'Leg ' +
                            (c.leg ? c.leg.number : '') : c.supply === 'job'
                            ? 'Job ' + (c.job || '') : 'Stock'],
                        ['Status', c.state],
                        ['Short', c.short ? 'Yes' : 'No']]);
                }}];
        }

        function details(heading, rows) {
            UI.modal(heading, [el('dl.details-grid', rows.filter(
                function (row) {
                    return row[1] !== null && row[1] !== undefined &&
                        row[1] !== '';
                }).map(function (row) {
                    return [el('dt', row[0]), el('dd', String(row[1]))];
                }).reduce(function (a, b) {
                    return a.concat(b);
                }, []))], [{label: 'Close', primary: true}]);
        }

        /* Scroll to the card of a leg and flash it */
        function goTo(productionId) {
            var target = shown && shown.nodes.filter(function (n) {
                return n.kind === 'prod' && n.data.id === productionId;
            })[0];
            if (!target || !target.el) {
                return;
            }
            canvasWrap.scrollLeft = Math.max(0, target.x * zoom -
                canvasWrap.clientWidth / 3);
            canvasWrap.scrollTop = Math.max(0, (target.y + target.h) * zoom -
                canvasWrap.clientHeight + 40);
            target.el.classList.remove('flash');
            void target.el.offsetWidth;
            target.el.classList.add('flash');
        }

        function withMenu(node, n, items) {
            node.addEventListener('contextmenu', function (event) {
                UI.contextMenu(event, items(n).filter(Boolean));
            });
            n.el = node;
            return node;
        }

        function mastersOf(productId) {
            for (var i = 0; i < masters.length; i++) {
                if (masters[i].product === productId) {
                    return Promise.resolve(masters[i]);
                }
            }
            return Rpc.desk('masters', ['', 500]).then(function (all) {
                return all.filter(function (m) {
                    return m.product === productId;
                })[0];
            });
        }

        function askLeg(card, productBom) {
            mastersOf(card.product_id).then(function (master) {
                if (!master) {
                    UI.toast('No master for ' + card.product, 'error');
                    return;
                }
                var select = el('select', {'aria-label': 'Revision'},
                    master.masters.map(function (m) {
                        var selected = productBom ? m.product_bom ===
                            productBom : (card.revision ? m.revision ===
                                card.revision : m.current);
                        return el('option', {value: m.product_bom,
                            selected: selected || null},
                            'Rev ' + (m.revision || '-') + (m.current ?
                                ' (current)' : '') + (card.revision &&
                                m.revision === card.revision ? ' (pinned)' :
                                ''));
                    }));
                UI.modal('Make leg', [
                    el('p', 'Make ', el('strong', card.product), ' (' +
                        card.quantity + ' ' + card.unit + ') in a leg of ' +
                        tree.number + '.'),
                    card.revision ? el('p.muted', 'The card pins revision ' +
                        card.revision + '.') : null,
                    el('label.field', 'Revision'), select
                ], [
                    {label: 'Cancel'},
                    {label: 'Make leg', primary: true, onclick: function () {
                        Rpc.desk('make_leg', [card.id,
                            parseInt(select.value, 10)]).then(
                            function (result) {
                                tree = result;
                                render();
                                UI.toast('Leg made for ' + card.product,
                                    'ok');
                            }, UI.showError);
                    }}
                ]);
            }, UI.showError);
        }

        function removeLeg(card) {
            UI.confirm('Remove leg', 'Remove the leg of ' + card.product +
                ' and supply the card from stock?').then(function (ok) {
                if (!ok) {
                    return;
                }
                Rpc.model('production.material_card', 'remove_leg',
                    [[card.id]]).then(load, UI.showError);
            });
        }

        function release() {
            var start = tree.state === 'request' ?
                Rpc.model('production', 'draft', [[tree.id]]) :
                Promise.resolve();
            start.then(function () {
                return Rpc.model('production', 'wait', [[tree.id]]);
            }).then(function () {
                UI.toast(tree.number + ' released with its legs', 'ok');
                load();
            }, UI.showError);
        }

        function traveler() {
            Rpc.report('production.traveler', [tree.id]).then(function (r) {
                UI.openReport(r, 'Traveler');
            }, UI.showError);
        }

        function prodNode(n, editable) {
            var d = n.data;
            var parts = code(d.product);
            var buttons = [];
            if (!n.card) {
                if ((d.state === 'request' || d.state === 'draft') &&
                        mayRelease()) {
                    buttons.push(el('button', {type: 'button', onclick:
                        release, title: 'Release the order and its legs'},
                        'Release'));
                }
                buttons.push(el('button', {type: 'button', onclick:
                    traveler, title: 'Print the traveler'}, 'Traveler'));
            } else if ((d.state === 'request' || d.state === 'draft') &&
                    mayRemoveLeg()) {
                buttons.push(el('button', {type: 'button', onclick:
                    function () {
                        removeLeg(n.card);
                    }, title: 'Remove this leg'}, '✕ Leg'));
            }
            return el('div.node.prod', {style: pos(n)},
                el('div.hd', d.number, d.job ? ' (Job)' : '', buttons),
                el('div.bd' + stateClass(d.state),
                    (parts.code ? parts.code + ' ' : '') + parts.name +
                    (d.revision ? ' · Rev ' + d.revision : '') +
                    ' · ' + d.quantity + ' ' + (d.unit || '') +
                    ' · ' + d.state +
                    (d.shortage ? ' · SHORT' : '')));
        }

        /* Jobshop's status letter of a card */
        function letter(state) {
            return state === 'done' || state === 'finished' ? 'C' :
                state === 'request' || state === 'draft' ? 'U' : 'R';
        }

        function opNode(n) {
            var w = n.data;
            var where = w.outside ? (w.supplier || 'Outside') +
                (w.purchase ? ' · ' + w.purchase : '') +
                (w.expected_date ? ' · due ' + UI.date(w.expected_date) :
                    '') : (w.work_center || '') + (w.planned_duration ?
                ' · ' + w.planned_duration.toFixed(2) + ' h' : '');
            var done = w.state === 'done' || w.state === 'finished';
            return el('div.node.card.op' + (w.outside ? '.outside' : '') +
                (done ? '.closed' : ''), {style: pos(n),
                    title: w.operation + (where ? ' — ' + where : '')},
                /* (an operation not done has the order's status) */
                el('div.hd', '(' + letter(done ? 'done' : n.root.state) +
                    ') ' + (w.sequence !== null ? w.sequence + ' - ' : '') +
                    w.operation, w.outside ? el('span.tag', 'OUTSIDE') :
                    null),
                el('div.bd', where || ' '));
        }

        function matNode(n, editable) {
            var c = n.data;
            var parts = code(c.product);
            var classes = '.node.card.mat' + (c.state === 'done' ?
                '.closed' : '') + (c.supply === 'leg' ? '.leg' : '') +
                (c.supply === 'job' ? '.job' : '') + (c.short ? '.short' :
                    '');
            var droppable = editable && c.producible && c.supply !== 'leg' &&
                c.supply !== 'job' && mayMakeLeg();
            var tag = c.supply === 'leg' ? 'LEG' : c.supply === 'job' ?
                'JOB ' + (c.job || '') : c.short ? 'SHORT' : 'STOCK';
            var node = el('div' + classes + (droppable ? '.droppable' : ''),
                {style: pos(n), title: c.product + '\nOperation ' +
                    (c.operation || '') + ', piece ' + (c.piece || '') +
                    (c.revision ? '\nPinned revision ' + c.revision : '') +
                    (droppable ? '\nDrop a master here to make a leg' : '')},
                el('div.hd', '(' + (c.state === 'done' ? 'C' : 'R') + ') ' +
                    (c.piece ? c.piece + ' - ' : '') + (parts.code ||
                    parts.name), el('span.tag', tag)),
                el('div.bd', c.quantity + ' ' + c.unit + (c.revision ?
                    ' · Rev ' + c.revision : '') + ' · ' +
                    (parts.code ? parts.name : ''),
                    droppable ? el('button', {type: 'button', style: {
                        float: 'right', padding: '0 5px', fontSize: '11px'},
                        title: 'Make leg', 'aria-label': 'Make leg for ' +
                            c.product, onclick: function () {
                            askLeg(c, null);
                        }}, '+') : null));
            if (droppable) {
                var type = 'application/x-nline-product-' + c.product_id;
                node.addEventListener('dragover', function (event) {
                    var types = Array.prototype.slice.call(
                        event.dataTransfer.types);
                    if (types.indexOf('application/x-nline-master') < 0) {
                        return;
                    }
                    var ok = types.indexOf(type) >= 0;
                    node.classList.toggle('drop-ok', ok);
                    node.classList.toggle('drop-no', !ok);
                    if (ok) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                    }
                });
                node.addEventListener('dragleave', function () {
                    node.classList.remove('drop-ok', 'drop-no');
                });
                node.addEventListener('drop', function (event) {
                    event.preventDefault();
                    node.classList.remove('drop-ok', 'drop-no');
                    var productBom = parseInt(event.dataTransfer.getData(
                        'application/x-nline-master'), 10);
                    askLeg(c, productBom);
                });
            }
            return node;
        }

        function pos(n) {
            return {left: n.x + 'px', top: n.y + 'px', width: n.w + 'px',
                height: n.h + 'px', zIndex: n.z};
        }

        function render() {
            title.textContent = (tree.job ? 'Job ' : 'Work Order ') +
                tree.number;
            info.textContent = (tree.origin ? 'For ' + tree.origin +
                ' · ' : '') + 'Due ' + UI.date(tree.planned_date);
            var editable = EDITABLE.indexOf(tree.state) >= 0;
            var plan = layout(tree);
            var canvas = el('div.canvas', {style: {width: plan.width + 'px',
                height: plan.height + 'px'}});
            var svgNS = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', plan.width);
            svg.setAttribute('height', plan.height);
            plan.links.forEach(function (link) {
                /* From the right of the supplied card's top line to the
                 * leg's card */
                var sx = link.from.x + link.from.w, sy = link.from.y + 10;
                var tx = link.to.x, ty = link.to.y + link.to.h / 2;
                var mx = tx - 14;
                var path = document.createElementNS(svgNS, 'path');
                path.setAttribute('d', 'M' + sx + ' ' + sy + ' L' + mx +
                    ' ' + sy + ' L' + mx + ' ' + ty + ' L' + tx + ' ' + ty);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#333');
                path.setAttribute('stroke-width', '1.5');
                path.setAttribute('marker-end', 'url(#arrow)');
                svg.appendChild(path);
            });
            var defs = document.createElementNS(svgNS, 'defs');
            defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" ' +
                'refX="9" refY="5" markerWidth="7" markerHeight="7" ' +
                'orient="auto"><path d="M0 0 L10 5 L0 10 z" ' +
                'fill="#333"/></marker>';
            svg.appendChild(defs);
            canvas.appendChild(svg);
            plan.nodes.forEach(function (n) {
                var node = n.kind === 'prod' ? withMenu(prodNode(n, editable),
                    n, prodMenu) : n.kind === 'op' ? withMenu(opNode(n), n,
                    opMenu) : withMenu(matNode(n, editable), n, function (m) {
                        return matMenu(m, editable);
                    });
                canvas.appendChild(node);
            });
            sizer = el('div.canvas-sizer');
            sizer.appendChild(canvas);
            UI.clear(canvasWrap).appendChild(sizer);
            shown = plan;
            applyZoom();
            /* The stacks start at the bottom, as in Jobshop */
            canvasWrap.scrollTop = canvasWrap.scrollHeight;
        }

        /* Zoom: the canvas scaled, its box sized to match (scrollbars) */
        var zoom = 1, sizer = null, shown = null;
        function applyZoom() {
            if (!sizer || !shown) {
                return;
            }
            var canvas = sizer.firstChild;
            canvas.style.transform = 'scale(' + zoom + ')';
            canvas.style.transformOrigin = '0 0';
            sizer.style.width = shown.width * zoom + 'px';
            sizer.style.height = shown.height * zoom + 'px';
            zoomLabel.textContent = Math.round(zoom * 100) + '%';
        }
        function setZoom(value) {
            zoom = Math.min(2.5, Math.max(0.3, value));
            applyZoom();
        }
        canvasWrap.addEventListener('scroll', UI.closeMenu);
        canvasWrap.addEventListener('wheel', function (event) {
            if (event.ctrlKey) {
                event.preventDefault();
                setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
            }
        }, {passive: false});

        var timer;
        masterSearch.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(loadMasters, 250);
        });
        loadMasters();
        load();
    };
}(window));
