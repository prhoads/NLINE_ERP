/* N-Line Desk: work orders like the Jobshop "Details" tab
 *
 * Each order or leg shows its operations as a diagonal stack of cards with
 * the material cards used at each operation underneath. A leg branches off
 * the card it supplies. Dragging a master revision from the left panel onto
 * a material card makes that card a leg.
 */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};

    var PROD_W = 300, PROD_H = 46;
    var OP_W = 190, OP_H = 48, OP_DX = 205, OP_DY = 28;
    var MAT_W = 180, MAT_H = 42, GAP = 7, LEG_INDENT = 46, LEG_GAP = 34;
    var EDITABLE = ['request', 'draft', 'waiting'];
    var STATES = ['request', 'draft', 'waiting', 'assigned', 'running',
        'done', 'cancelled'];

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

    /* Compute the positions of the nodes of a production and its legs */
    function layout(tree) {
        var nodes = [], links = [];
        var maxX = 0;

        function place(node, x, y, parentCard) {
            nodes.push({kind: 'prod', x: x, y: y, w: PROD_W, h: PROD_H,
                data: node, card: parentCard});
            maxX = Math.max(maxX, x + PROD_W);
            var works = (node.works || []).slice().sort(function (a, b) {
                return (a.sequence || 0) - (b.sequence || 0);
            });
            if (!works.length) {
                works = [{sequence: null, operation: 'Materials',
                    state: node.state, pseudo: true}];
            }
            var byWork = works.map(function () {
                return [];
            });
            (node.cards || []).forEach(function (card) {
                var index = 0;
                works.forEach(function (work, i) {
                    if (work.sequence !== null &&
                            (card.operation || 0) >= work.sequence) {
                        index = i;
                    }
                });
                byWork[index].push(card);
            });
            var bottom = y + PROD_H;
            var cardNodes = [];
            works.forEach(function (work, i) {
                var ox = x + 18 + i * OP_DX;
                var oy = y + PROD_H + 14 + i * OP_DY;
                nodes.push({kind: 'op', x: ox, y: oy, w: OP_W, h: OP_H,
                    data: work});
                maxX = Math.max(maxX, ox + OP_W);
                var cy = oy + OP_H + 6;
                byWork[i].forEach(function (card) {
                    var cardNode = {kind: 'mat', x: ox + 10, y: cy,
                        w: MAT_W, h: MAT_H, data: card, root: node};
                    nodes.push(cardNode);
                    cardNodes.push(cardNode);
                    cy += MAT_H + GAP;
                });
                bottom = Math.max(bottom, cy, oy + OP_H);
            });
            cardNodes.forEach(function (cardNode) {
                var leg = cardNode.data.leg;
                if (!leg) {
                    return;
                }
                var legX = x + LEG_INDENT;
                var legY = bottom + LEG_GAP;
                links.push({from: cardNode, toX: legX, toY: legY +
                    PROD_H / 2});
                bottom = place(leg, legX, legY, cardNode.data);
            });
            return bottom;
        }
        var height = place(tree, 16, 16, null) + 24;
        return {nodes: nodes, links: links, width: maxX + 40,
            height: height};
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
                el('div.legend', STATES.map(function (state) {
                    return el('span', el('i' + stateClass(state)), state);
                }), el('span', el('i', {style: {borderLeft:
                    '5px solid var(--leg)'}}), 'leg'),
                    el('span', el('i', {style: {borderLeft:
                        '5px solid var(--job)'}}), 'Job'),
                    el('span', el('i', {style: {boxShadow:
                        '0 0 0 2px var(--bad)'}}), 'short')),
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
                if (d.state === 'request' || d.state === 'draft') {
                    buttons.push(el('button', {type: 'button', onclick:
                        release, title: 'Release the order and its legs'},
                        'Release'));
                }
                buttons.push(el('button', {type: 'button', onclick:
                    traveler, title: 'Print the traveler'}, 'Traveler'));
            } else if (d.state === 'request' || d.state === 'draft') {
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

        function opNode(n) {
            var w = n.data;
            var where = w.outside ? (w.supplier || 'Outside') +
                (w.purchase ? ' · ' + w.purchase : '') +
                (w.expected_date ? ' · due ' + UI.date(w.expected_date) :
                    '') : (w.work_center || '') + (w.planned_duration ?
                ' · ' + w.planned_duration.toFixed(2) + ' h' : '');
            return el('div.node.op', {style: pos(n), title: w.operation +
                (where ? ' — ' + where : '')},
                el('div.hd' + stateClass(w.pseudo ? 'draft' : w.state),
                    w.sequence !== null ? String(w.sequence) : '',
                    ' ', w.operation, w.outside ? el('span.tag',
                        'OUTSIDE') : null),
                el('div.bd', where || ' '));
        }

        function matNode(n, editable) {
            var c = n.data;
            var parts = code(c.product);
            var classes = '.node.mat' + (c.supply === 'leg' ? '.leg' : '') +
                (c.supply === 'job' ? '.job' : '') + (c.short ? '.short' :
                    '');
            var droppable = editable && c.producible && c.supply !== 'leg' &&
                c.supply !== 'job';
            var tag = c.supply === 'leg' ? 'LEG' : c.supply === 'job' ?
                'JOB ' + (c.job || '') : c.short ? 'SHORT' : 'STOCK';
            var node = el('div' + classes + (droppable ? '.droppable' : ''),
                {style: pos(n), title: c.product + '\nOperation ' +
                    (c.operation || '') + ', piece ' + (c.piece || '') +
                    (c.revision ? '\nPinned revision ' + c.revision : '') +
                    (droppable ? '\nDrop a master here to make a leg' : '')},
                el('div.hd' + stateClass(c.state === 'done' ? 'done' :
                    'draft'), (c.operation || '') + (c.piece ? '-' + c.piece :
                    ''), ' ', parts.code || parts.name, el('span.tag', tag)),
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
                height: n.h + 'px'};
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
                /* Along the left margin of the cards below the supplied one */
                var sx = link.from.x, sy = link.from.y + link.from.h / 2;
                var mx = link.from.x - 5;
                var path = document.createElementNS(svgNS, 'path');
                path.setAttribute('d', 'M' + sx + ' ' + sy + ' L' + mx +
                    ' ' + sy + ' L' + mx + ' ' + link.toY + ' L' +
                    link.toX + ' ' + link.toY);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#7b55b8');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('marker-end', 'url(#arrow)');
                svg.appendChild(path);
            });
            var defs = document.createElementNS(svgNS, 'defs');
            defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" ' +
                'refX="9" refY="5" markerWidth="7" markerHeight="7" ' +
                'orient="auto"><path d="M0 0 L10 5 L0 10 z" ' +
                'fill="#7b55b8"/></marker>';
            svg.appendChild(defs);
            canvas.appendChild(svg);
            plan.nodes.forEach(function (n) {
                var node = n.kind === 'prod' ? prodNode(n, editable) :
                    n.kind === 'op' ? opNode(n) : matNode(n, editable);
                canvas.appendChild(node);
            });
            UI.clear(canvasWrap).appendChild(canvas);
        }

        var timer;
        masterSearch.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(loadMasters, 250);
        });
        loadMasters();
        load();
    };
}(window));
