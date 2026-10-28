/* N-Line Jobshop emulation: admin screens (module nline_js_admin; see
 * docs/jobshop/EMULATION.md). Routes: push [regex, screen name] onto
 * window.NLINE_ROUTES; screens go on window.Screens.
 *
 * - Accounting: Account Sets, Accounting Calendar, Account Interface (the
 *   Accounts item opens the desk chart of accounts)
 * - Executive Information: Sales, Purchasing, Production, Financials
 * - Administration: User Manager, Authority Manager, System Settings
 * - The Jobshop reports of every group bar (js-reports/<group>): the
 *   Report Selection window, the report dialog (ranges, dates, statuses,
 *   Sort By, Advanced Filtering and Sorting) and the printable report,
 *   built by the server's report engine (jsadmin_report_run). */
(function (global) {
    'use strict';

    var el = UI.el;
    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];

    routes.push(
        [/^#\/account-sets$/, 'jsAccountSets'],
        [/^#\/account-sets\/(\d+)$/, 'jsAccountSets'],
        [/^#\/accounting-calendar$/, 'jsAccountingCalendar'],
        [/^#\/account-interface$/, 'jsAccountInterface'],
        [/^#\/exec\/(sales|purchasing|production|financials)$/, 'jsExec'],
        [/^#\/users$/, 'jsUsers'],
        [/^#\/authorities$/, 'jsAuthorities'],
        [/^#\/system-settings$/, 'jsSystemSettings'],
        [/^#\/js-reports\/([a-z]+)$/, 'jsReports'],
        [/^#\/js-reports\/([a-z]+)\/([a-z_]+)$/, 'jsReports']);

    /* ---- Style -------------------------------------------------------- */

    function style() {
        if (document.getElementById('nl-js-admin-css')) {
            return;
        }
        document.head.appendChild(el('style#nl-js-admin-css', [
            '.jsa-tiles { display: grid; grid-template-columns: ' +
                'repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; ' +
                'margin-bottom: 14px; }',
            '.jsa-tile { background: var(--paper); border: 1px solid ' +
                'var(--line); border-radius: 6px; padding: 10px 12px; }',
            '.jsa-tile .label { color: var(--muted); font-size: 12px; }',
            '.jsa-tile .value { font-size: 20px; font-weight: 700; }',
            '.jsa-tile.bad .value { color: var(--bad); }',
            '.jsa-tile .hint { color: var(--muted); font-size: 12px; }',
            '.jsa-charts { display: grid; grid-template-columns: ' +
                'repeat(auto-fit, minmax(420px, 1fr)); gap: 14px; }',
            '.jsa-chart { background: var(--paper); border: 1px solid ' +
                'var(--line); border-radius: 6px; padding: 10px 12px; }',
            '.jsa-chart h3 { margin: 0 0 6px; font-size: 14px; }',
            '.jsa-chart svg { width: 100%; height: auto; display: block; }',
            '.jsa-chart svg text { fill: var(--muted); font-size: 10px; }',
            '.jsa-chart .legend { font-size: 12px; color: var(--muted); }',
            '.jsa-chart .legend i { display: inline-block; width: 10px; ' +
                'height: 10px; margin: 0 4px 0 10px; border-radius: 2px; }',
            '.jsa-split { display: grid; grid-template-columns: 260px 1fr; ' +
                'gap: 14px; align-items: start; }',
            '@media (max-width: 900px) { .jsa-split { ' +
                'grid-template-columns: 1fr; } }',
            '.jsa-list { background: var(--paper); border: 1px solid ' +
                'var(--line); border-radius: 6px; max-height: 75vh; ' +
                'overflow-y: auto; }',
            '.jsa-list button { display: block; width: 100%; text-align: ' +
                'left; border: none; border-bottom: 1px solid ' +
                'var(--line-soft); border-radius: 0; background: none; ' +
                'padding: 6px 10px; }',
            '.jsa-list button small { display: block; color: var(--muted); }',
            '.jsa-list button.active { background: var(--accent-soft); ' +
                'font-weight: 600; }',
            '.jsa-filters { display: grid; grid-template-columns: ' +
                'max-content 1fr 1fr; gap: 6px 10px; align-items: center; }',
            '.jsa-filters label { color: var(--muted); font-size: 13px; }',
            '.jsa-adv table td { padding: 2px 4px; }',
            'table.jsa-report td, table.jsa-report th { border-bottom: ' +
                'none; padding: 3px 6px; font-size: 13px; }',
            'table.jsa-report tr.group td { font-weight: 700; ' +
                'padding-top: 10px; color: var(--accent); }',
            'table.jsa-report tr.subtotal td { font-weight: 600; ' +
                'border-top: 1px solid var(--line-soft); }',
            'table.jsa-report tr.total td { font-weight: 700; border-top: ' +
                '2px solid var(--line); }',
            'table.jsa-report tr.drill { cursor: zoom-in; }',
            '.jsa-gaps { margin-top: 12px; font-size: 12px; color: ' +
                'var(--muted); border-top: 1px dashed var(--line); ' +
                'padding-top: 6px; }',
            '.jsa-allow, .jsa-deny { border-radius: 10px; padding: 1px ' +
                '10px; font-size: 12px; font-weight: 600; }',
            '.jsa-allow { color: var(--ok); border-color: var(--ok); }',
            '.jsa-deny { color: var(--bad); border-color: var(--bad); }',
            'table.jsa-matrix th.rot { writing-mode: vertical-rl; ' +
                'transform: rotate(180deg); white-space: nowrap; ' +
                'font-weight: 500; }',
            'table.jsa-matrix td.cell { text-align: center; cursor: ' +
                'pointer; }',
            'table.jsa-matrix td.cell.yes { color: var(--ok); }',
            'table.jsa-matrix td.cell.no { color: var(--bad); }',
            '.jsa-labels { display: grid; grid-template-columns: ' +
                'repeat(3, 1fr); gap: 0 12px; }',
            '.jsa-label { border: 1px dashed var(--line); padding: 14px; ' +
                'height: 70px; text-align: center; }',
            '.jsa-label .bar { font-family: monospace; letter-spacing: 2px; ' +
                'font-size: 18px; }',
            '.jsa-note { color: var(--muted); font-size: 12px; }',
            '.jsa-sample { font-family: monospace; padding: 4px 8px; ' +
                'background: var(--accent-soft); border-radius: 4px; }',
            'fieldset.jsa-box { border: 1px solid var(--line); ' +
                'border-radius: 6px; margin: 0 0 12px; padding: 8px 12px; }',
            'fieldset.jsa-box legend { color: var(--accent); ' +
                'font-weight: 600; padding: 0 4px; }',
            '@media print { .jsa-noprint, #topbar, .ribbon { display: ' +
                'none !important; } .jsa-split { display: block; } ' +
                '.report-page { border: none; } }'
        ].join('\n')));
    }

    /* ---- Helpers ------------------------------------------------------ */

    function ribbon(main, title, buttons) {
        var bar = el('div.ribbon.jsa-noprint', {role: 'toolbar'},
            el('span.ribbon-title', title), el('span.spacer'),
            buttons.filter(Boolean));
        main.appendChild(bar);
        UI.setTitle(title);
        return bar;
    }

    function button(label, onclick, primary, title) {
        return el('button' + (primary ? '.primary' : ''), {type: 'button',
            title: title || null, onclick: onclick}, label);
    }

    function format(value, type) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        switch (type) {
            case 'money':
                return UI.money(value);
            case 'date':
                return UI.date(value);
            case 'bool':
                return value ? '✔' : '';
            case 'pct':
                return (Math.round(value * 10) / 10) + '%';
            case 'qty':
            case 'num':
                return String(Math.round(value * 10000) / 10000);
            default:
                return String(value);
        }
    }

    function numeric(type) {
        return ['money', 'qty', 'num', 'int', 'pct'].indexOf(type) >= 0;
    }

    function csvValue(v) {
        v = v === null || v === undefined ? '' : String(v);
        return /[",\n\r]/.test(v) ? '"' + v.split('"').join('""') + '"' : v;
    }

    function download(name, content, type) {
        var link = el('a', {href: global.URL.createObjectURL(new Blob(
            [content], {type: type || 'text/csv'})), download: name});
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function table(columns, rows, onrow) {
        var body = el('tbody');
        rows.forEach(function (row, index) {
            body.appendChild(el('tr', onrow ? {ondblclick: function () {
                onrow(row, index);
            }, title: 'Double-click to open'} : null,
                columns.map(function (c, i) {
                    var v = Array.isArray(row) ? row[i] : row[c.key];
                    return el('td' + (numeric(c.type) ? '.num' : ''),
                        c.render ? c.render(row) : format(v, c.type));
                })));
        });
        if (!rows.length) {
            body.appendChild(el('tr', el('td.muted', {colspan:
                columns.length}, 'None.')));
        }
        return el('div.table-wrap', el('table.data', el('thead', el('tr',
            columns.map(function (c) {
                return el('th' + (numeric(c.type) ? '.num' : ''), c.label);
            }))), body));
    }

    /* Ctrl+S / F5 while the screen is shown */
    function shortcuts(node, handlers) {
        document.addEventListener('keydown', function (event) {
            if (!node.isConnected) {
                return;
            }
            var key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 's' &&
                    handlers.save) {
                event.preventDefault();
                handlers.save();
            } else if (event.key === 'F5' && handlers.refresh) {
                event.preventDefault();
                handlers.refresh();
            }
        });
    }

    function storeGet(key) {
        try {
            return JSON.parse(global.localStorage.getItem(key));
        } catch (e) {
            return null;
        }
    }

    function storeSet(key, value) {
        try {
            if (value === null) {
                global.localStorage.removeItem(key);
            } else {
                global.localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) {
            /* Private mode: nothing kept */
        }
    }

    /* ---- Charts (plain SVG) ------------------------------------------- */

    var SVG = 'http://www.w3.org/2000/svg';
    var COLORS = ['var(--accent)', '#3d6fb6', '#b26a00', 'var(--leg)',
        'var(--job)', 'var(--bad)'];

    function svg(name, attrs, children) {
        var node = document.createElementNS(SVG, name);
        Object.keys(attrs || {}).forEach(function (key) {
            node.setAttribute(key, attrs[key]);
        });
        (children || []).forEach(function (child) {
            if (child) {
                node.appendChild(child);
            }
        });
        return node;
    }

    function svgText(x, y, text, anchor) {
        var node = svg('text', {x: x, y: y, 'text-anchor': anchor ||
            'middle'});
        node.textContent = text;
        return node;
    }

    function short(value, money) {
        var a = Math.abs(value);
        var text = a >= 1e6 ? (value / 1e6).toFixed(1) + 'M' : a >= 1e4 ?
            Math.round(value / 1e3) + 'k' : a >= 1e3 ? (value / 1e3)
            .toFixed(1) + 'k' : String(Math.round(value * 100) / 100);
        return (money ? '$' : '') + text;
    }

    /* chart({title, kind: 'bar'|'line'|'hbar', labels, series: [{label,
     * values}], money}) -> node */
    function chart(spec) {
        var box = el('div.jsa-chart', el('h3', spec.title));
        var labels = spec.labels || [];
        var series = spec.series || [];
        if (!labels.length) {
            box.appendChild(el('p.muted', 'Nothing yet.'));
            return box;
        }
        var all = [];
        series.forEach(function (s) {
            all = all.concat(s.values.map(Number));
        });
        var max = Math.max.apply(null, all.concat([0]));
        var min = Math.min.apply(null, all.concat([0]));
        var range = (max - min) || 1;
        var node;
        if (spec.kind === 'hbar') {
            var rowH = 20, left = 150, width = 460;
            var height = labels.length * rowH + 10;
            node = svg('svg', {viewBox: '0 0 ' + (left + width + 70) + ' ' +
                height, role: 'img', 'aria-label': spec.title});
            labels.forEach(function (label, i) {
                var v = Number(series[0].values[i]) || 0;
                var w = Math.max(1, width * Math.abs(v) / (Math.max(Math.abs(
                    max), Math.abs(min)) || 1));
                var y = i * rowH + 4;
                node.appendChild(svgText(left - 6, y + 12, String(label)
                    .slice(0, 26), 'end'));
                node.appendChild(svg('rect', {x: left, y: y, width: w,
                    height: rowH - 6, rx: 2, fill: v < 0 ? 'var(--bad)' :
                        COLORS[0]}, [svg('title', {}, [])]));
                node.lastChild.firstChild.textContent = label + ': ' +
                    (spec.money ? UI.money(v, true) : v);
                node.appendChild(svgText(left + w + 4, y + 12, short(v,
                    spec.money), 'start'));
            });
        } else {
            var W = 600, H = 220, padL = 52, padB = 34, padT = 10;
            var plotW = W - padL - 10, plotH = H - padB - padT;
            var y0 = padT + plotH * max / range;
            node = svg('svg', {viewBox: '0 0 ' + W + ' ' + H, role: 'img',
                'aria-label': spec.title});
            [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
                var value = min + range * f;
                var y = padT + plotH * (1 - f);
                node.appendChild(svg('line', {x1: padL, x2: W - 10, y1: y,
                    y2: y, stroke: 'var(--line-soft)'}));
                node.appendChild(svgText(padL - 4, y + 3, short(value,
                    spec.money), 'end'));
            });
            node.appendChild(svg('line', {x1: padL, x2: W - 10, y1: y0,
                y2: y0, stroke: 'var(--line)'}));
            var step = plotW / labels.length;
            labels.forEach(function (label, i) {
                if (labels.length <= 14 || i % 2 === 0) {
                    node.appendChild(svgText(padL + step * (i + 0.5), H - 18,
                        String(label).slice(0, 12)));
                }
            });
            series.forEach(function (s, si) {
                var color = COLORS[si % COLORS.length];
                if (spec.kind === 'line') {
                    var points = s.values.map(function (v, i) {
                        return (padL + step * (i + 0.5)) + ',' + (padT +
                            plotH * (max - Number(v)) / range);
                    }).join(' ');
                    node.appendChild(svg('polyline', {points: points,
                        fill: 'none', stroke: color, 'stroke-width': 2}));
                    s.values.forEach(function (v, i) {
                        var dot = svg('circle', {cx: padL + step * (i + 0.5),
                            cy: padT + plotH * (max - Number(v)) / range,
                            r: 3, fill: color}, [svg('title')]);
                        dot.firstChild.textContent = labels[i] + ': ' +
                            (spec.money ? UI.money(v, true) : v);
                        node.appendChild(dot);
                    });
                } else {
                    var bw = step * 0.8 / series.length;
                    s.values.forEach(function (v, i) {
                        v = Number(v) || 0;
                        var y = padT + plotH * (max - Math.max(v, 0)) / range;
                        var h = Math.max(1, plotH * Math.abs(v) / range);
                        var bar = svg('rect', {x: padL + step * i + step *
                            0.1 + bw * si, y: y, width: Math.max(1, bw - 1),
                            height: h, fill: v < 0 ? 'var(--bad)' : color},
                            [svg('title')]);
                        bar.firstChild.textContent = s.label + ' ' +
                            labels[i] + ': ' + (spec.money ?
                                UI.money(v, true) : v);
                        node.appendChild(bar);
                    });
                }
            });
        }
        box.appendChild(node);
        if (series.length > 1) {
            box.appendChild(el('div.legend', series.map(function (s, i) {
                return [el('i', {style: {background: COLORS[i %
                    COLORS.length]}}), s.label];
            })));
        }
        return box;
    }

    /* ---- Account Sets --------------------------------------------------- */

    Screens.jsAccountSets = function (main, params) {
        style();
        Rpc.desk('jsadmin_account_set_fields', []).then(function (accounts) {
            var domain = [['type', '!=', null], ['closed', '!=', true]];
            function fieldsOf(prefixes) {
                return accounts.filter(function (a) {
                    return prefixes.some(function (p) {
                        return a.jobshop.indexOf(p) === 0;
                    });
                }).map(function (a) {
                    return {name: a.name, label: a.label + ' G/L Account ID' +
                        (a.tryton ? ' *' : ''), type: 'many2one',
                        model: 'account.account', domain: domain, span: 2};
                });
            }
            var note = {title: 'Notes', render: function (pane) {
                pane.appendChild(el('p.jsa-note', 'The accounts marked * ' +
                    'are the ones Tryton posts to for the parts of this ' +
                    'account set (Inventory Material: stock, CGS ' +
                    'Material: stock out, Purchase Order Accrual: stock ' +
                    'in, Purchase Expense, Sales Revenue). The others ' +
                    'are kept for Jobshop\'s reports; the work in process ' +
                    'is posted to the WIP account of the accounting ' +
                    'configuration.'));
            }};
            UI.master(main, {
                title: 'Account Sets',
                model: 'product.category',
                label: 'Account Set ID',
                domain: [['accounting', '=', true]],
                order: [['name', 'ASC']],
                open: params && params[0] ? parseInt(params[0], 10) : null,
                defaults: {accounting: true},
                tabs: [
                    {title: 'Account Set', fields: [
                        {name: 'name', label: 'Account Set ID',
                            type: 'char'},
                        {name: 'js_description', label: 'Description',
                            type: 'char', span: 2}]},
                    {title: 'Inventory', fields: fieldsOf(['INV_', 'ADJ'])},
                    {title: 'WIP', fields: fieldsOf(['WIP_'])},
                    {title: 'Cost of Goods Sold', fields: fieldsOf(
                        ['CGS_'])},
                    {title: 'Purchasing / Sales', fields: fieldsOf(['EXP',
                        'REV', 'POA', 'RECV', 'PAYB'])},
                    {title: 'Labor', fields: fieldsOf(['AFL', 'AFB',
                        'IND'])},
                    note
                ],
                browse: [{name: 'name', label: 'Account Set ID'},
                    {name: 'js_description', label: 'Description'},
                    {name: 'account_revenue', label: 'Sales Revenue',
                        type: 'many2one'},
                    {name: 'account_expense', label: 'Purchase Expense',
                        type: 'many2one'}],
                extra: [{label: 'Account Set List', onclick: function () {
                    UI.openScreen('js-reports/accounting/account_set_list',
                        'Account Set List');
                }}]
            });
        }, UI.showError);
    };

    /* ---- Accounting Calendar ------------------------------------------ */

    var STATE = {open: 'Open', closed: 'Closed', locked: 'Locked'};

    Screens.jsAccountingCalendar = function (main) {
        style();
        var body = el('div');
        var access = {};
        var years = [];
        var chosen = null;
        var yearSelect = el('select', {'aria-label': 'Fiscal Year',
            onchange: function () {
                chosen = parseInt(yearSelect.value, 10);
                render();
            }});
        var newYear = button('New Fiscal Year', addYear, false,
            'Create the next fiscal year with its periods');
        newYear.hidden = true;
        ribbon(main, 'Accounting Calendar', [
            el('label.ribbon-field', 'Fiscal Year ', yearSelect),
            button('Refresh', load, false, 'F5'),
            newYear,
            button('Print', function () {
                UI.openScreen('js-reports/accounting/accounting_calendar',
                    'Accounting Calendar');
            })]);
        main.appendChild(body);
        shortcuts(body, {refresh: load});

        function act(action, ids, question) {
            UI.confirm('Accounting Calendar', question).then(function (ok) {
                if (!ok) {
                    return;
                }
                Rpc.desk('jsadmin_calendar_action', [action, ids]).then(
                    function (result) {
                        years = result;
                        render();
                        UI.toast('Done', 'ok');
                    }, UI.showError);
            });
        }

        function render() {
            UI.clear(body);
            var year = years.filter(function (y) {
                return y.id === chosen;
            })[0] || years[0];
            if (!year) {
                body.appendChild(el('p.muted', 'No fiscal year yet.'));
                return;
            }
            chosen = year.id;
            yearSelect.value = String(year.id);
            var periodWrite = access['account.period'] &&
                access['account.period'].write;
            var yearWrite = access['account.fiscalyear'] &&
                access['account.fiscalyear'].write;
            var columns = [
                {key: 'number', label: 'Period', type: 'int'},
                {key: 'name', label: 'Name'},
                {key: 'start_date', label: 'Start Date', type: 'date'},
                {key: 'end_date', label: 'Last Day', type: 'date'},
                {key: 'state', label: 'Status', render: function (p) {
                    return STATE[p.state] || p.state;
                }},
                {key: 'drafts', label: 'Unposted Moves', type: 'int'}];
            if (periodWrite) {
                columns.push({key: 'action', label: '', render: function (p) {
                    if (p.state === 'open') {
                        return button('Close', function () {
                            /* Jobshop closes the period with the open ones
                             * before it */
                            var ids = year.periods.filter(function (q) {
                                return q.state === 'open' &&
                                    q.end_date <= p.end_date;
                            }).map(function (q) {
                                return q.id;
                            });
                            act('period-close', ids, 'Close ' + p.name +
                                (ids.length > 1 ? ' and the ' + (ids.length -
                                    1) + ' open periods before it' : '') +
                                '? No entry can be posted in a closed ' +
                                'period.');
                        });
                    }
                    if (p.state === 'closed') {
                        return [button('Reopen', function () {
                            act('period-reopen', [p.id], 'Reopen ' +
                                p.name + '?');
                        }), ' ', button('Lock', function () {
                            act('period-lock', [p.id], 'Lock ' + p.name +
                                '? A locked period cannot be reopened.');
                        })];
                    }
                    return '';
                }});
            }
            body.appendChild(el('div.panel', el('div.toolbar',
                el('strong', year.name + ' (' + UI.date(year.start_date) +
                    ' - ' + UI.date(year.end_date) + ')'),
                el('span.muted', ' ' + (STATE[year.state] || year.state)),
                el('span.spacer'),
                yearWrite && year.state === 'open' ? button(
                    'Close Fiscal Year', function () {
                        act('year-close', [year.id], 'Close the fiscal ' +
                            'year ' + year.name + '? All its periods must ' +
                            'be closed.');
                    }) : null,
                yearWrite && year.state === 'closed' ? button(
                    'Reopen Fiscal Year', function () {
                        act('year-reopen', [year.id], 'Reopen the fiscal ' +
                            'year ' + year.name + '?');
                    }) : null),
                table(columns, year.periods)));
        }

        function load() {
            Promise.all([Rpc.desk('jsadmin_calendar', []), UI.access([
                'account.period', 'account.fiscalyear'])]).then(
                function (result) {
                    years = result[0];
                    access = result[1];
                    newYear.hidden = !(access['account.fiscalyear'] &&
                        access['account.fiscalyear'].create);
                    UI.clear(yearSelect);
                    years.forEach(function (y) {
                        yearSelect.appendChild(el('option', {value: y.id},
                            y.name));
                    });
                    render();
                }, UI.showError);
        }

        function addYear() {
            var last = years[0];
            var end = el('input', {type: 'date', value: last ? String(
                parseInt(last.end_date.slice(0, 4), 10) + 1) +
                last.end_date.slice(4) : ''});
            var kind = el('select', el('option', {value: 'monthly'},
                'Monthly'), el('option', {value: 'quarterly'}, 'Quarterly'));
            UI.modal('New Fiscal Year', [
                el('p.jsa-note', 'Made from the latest fiscal year (its ' +
                    'numbering renewed), with its periods.'),
                el('label.field', 'End Date'), end,
                el('label.field', 'Period Type'), kind], [
                {label: 'Cancel'},
                {label: 'Auto', primary: true, onclick: function () {
                    Rpc.desk('jsadmin_fiscalyear_create', [{end_date:
                        Rpc.date(end.value), period_type: kind.value}])
                        .then(function () {
                            UI.toast('Fiscal year created', 'ok');
                            load();
                        }, UI.showError);
                }}]);
        }

        load();
    };

    /* ---- Account Interface -------------------------------------------- */

    Screens.jsAccountInterface = function (main) {
        style();
        var body = el('div');
        var data = null;
        var periods = [];
        var access = {};
        ribbon(main, 'Account Interface', [
            button('Refresh', load, false, 'F5'),
            button('Journal Batch List', function () {
                UI.openScreen('js-reports/accounting/journal_batch_list',
                    'Journal Batch List');
            })]);
        main.appendChild(body);
        shortcuts(body, {refresh: load});

        function load() {
            Promise.all([Rpc.desk('jsadmin_interface', [null, null]),
                Rpc.desk('jsadmin_calendar', []).catch(function () {
                    return [];
                }), UI.access(['account.move', 'nline.js.journal_batch',
                    'account.invoice', 'party.party'])]).then(
                function (result) {
                    data = result[0];
                    periods = [];
                    result[1].forEach(function (y) {
                        periods = periods.concat(y.periods);
                    });
                    periods.sort(function (a, b) {
                        return a.end_date < b.end_date ? -1 : 1;
                    });
                    access = result[2];
                    render();
                }, UI.showError);
        }

        function can(model, what) {
            return Boolean(access[model] && access[model][what]);
        }

        function postSection() {
            var today = UI.today();
            var current = periods.filter(function (p) {
                return p.start_date <= today && p.end_date >= today;
            })[0];
            var previous = current ? periods.filter(function (p) {
                return p.end_date < current.start_date;
            }).pop() : null;
            var choice = 'current';
            function radio(value, label, period) {
                return el('label', el('input', {type: 'radio', name:
                    'jsa-post', checked: value === choice, disabled:
                    !period, onchange: function () {
                        choice = value;
                    }}), ' ' + label + (period ? ' ' + UI.date(
                        period.end_date) : ' (none)'));
            }
            var box = el('fieldset.jsa-box', el('legend', 'Account Periods'),
                el('p.jsa-note', 'Post: the unposted moves of the stock, ' +
                    'production and invoice operations up to the period ' +
                    'end are posted, then gathered by journal into journal ' +
                    'batches for the export.'),
                el('div', radio('previous', 'Post to Previous Period End ' +
                    'Date of', previous)),
                el('div', radio('current', 'Post to Current Period End ' +
                    'Date of', current)));
            if (can('account.move', 'write') &&
                    can('nline.js.journal_batch', 'create')) {
                box.appendChild(el('div.toolbar', button('Post', function () {
                    var period = choice === 'previous' ? previous : current;
                    if (!period) {
                        return;
                    }
                    var ids = periods.filter(function (p) {
                        return p.end_date <= period.end_date &&
                            p.state === 'open';
                    }).map(function (p) {
                        return p.id;
                    });
                    UI.confirm('Post', 'Post the transactions up to ' +
                        UI.date(period.end_date) + '?').then(function (ok) {
                            if (!ok) {
                                return;
                            }
                            Rpc.desk('jsadmin_interface_post', [{periods: ids,
                                up_to: Rpc.date(period.end_date)}]).then(
                                function (result) {
                                    UI.toast(result.posted + ' moves posted, ' +
                                        result.batches.length + ' batches',
                                        'ok');
                                    load();
                                }, UI.showError);
                        });
                }, true)));
            }
            return box;
        }

        function groupsSection() {
            var box = el('fieldset.jsa-box', el('legend',
                'Transactions Not Posted'));
            if (!data.groups.length) {
                box.appendChild(el('p.muted', 'Everything is posted and in a ' +
                    'batch.'));
                return box;
            }
            data.groups.forEach(function (g) {
                var detail = el('div', {hidden: true}, table([
                    {key: 'number', label: 'Move'},
                    {key: 'date', label: 'Date', type: 'date'},
                    {key: 'state', label: 'State'},
                    {key: 'class', label: 'Class'},
                    {key: 'origin', label: 'Document'},
                    {key: 'description', label: 'Description'},
                    {key: 'amount', label: 'Amount', type: 'money'}],
                    g.moves, function (m) {
                        UI.openRecord('account.move', m.id, m.number);
                    }));
                var toggle = button((g.draft ? g.draft + ' unposted, ' : '') +
                    (g.posted ? g.posted + ' not in a batch' : '') +
                    ' - ' + UI.money(g.debit, true), function () {
                        detail.hidden = !detail.hidden;
                    });
                box.appendChild(el('div', el('div.toolbar', el('strong',
                    g.period_name + ' / ' + g.journal_name), el('span.muted',
                        ' ' + (STATE[g.period_state] || '')),
                    el('span.spacer'), toggle), detail));
            });
            return box;
        }

        function exportSection() {
            var from = el('input', {type: 'date'});
            var to = el('input', {type: 'date', value: UI.today()});
            var reexport = el('input', {type: 'checkbox'});
            var batch = el('select', el('option', {value: ''}, ''),
                data.batches.map(function (b) {
                    return el('option', {value: b.id}, b.number + ' ' +
                        b.description);
                }));
            var forBatch = el('input', {type: 'checkbox', onchange:
                function () {
                    batch.disabled = !forBatch.checked;
                }});
            batch.disabled = true;
            var detail = el('input', {type: 'radio', name: 'jsa-roll'});
            var rolled = el('input', {type: 'radio', name: 'jsa-roll',
                checked: true});
            var what = {};
            var options = [
                ['gl', 'Posted Inventory Transactions (General Ledger)',
                    can('nline.js.journal_batch', 'write')],
                ['ar', 'Invoices (Accounts Receivable)',
                    can('account.invoice', 'read')],
                ['ap', 'Receivers (Accounts Payable)',
                    can('account.invoice', 'read')],
                ['customers', 'Customer Information',
                    can('party.party', 'read')],
                ['suppliers', 'Supplier Information',
                    can('party.party', 'read')]];
            var box = el('fieldset.jsa-box', el('legend', 'Export'),
                el('div.jsa-filters',
                    el('label', 'From'), from, el('span'),
                    el('label', 'To'), to, el('span'),
                    el('label', 'Re-Export All in Date Range'), reexport,
                    el('span'),
                    el('label', 'For Batch ID'), forBatch, batch),
                el('div', el('label', rolled, ' Export Rolled-up Batch by ' +
                    'Account ID')),
                el('div', el('label', detail, ' Export Individual ' +
                    'Transaction Details')),
                options.filter(function (o) {
                    return o[2];
                }).map(function (o) {
                    what[o[0]] = el('input', {type: 'checkbox', checked:
                        o[0] === 'gl'});
                    return el('div', el('label', what[o[0]], ' ' + o[1]));
                }),
                el('div.toolbar', button('Export', function () {
                    var chosen = Object.keys(what).filter(function (k) {
                        return what[k].checked;
                    });
                    Promise.all(chosen.map(function (k) {
                        return Rpc.desk('jsadmin_interface_export', [{
                            what: k,
                            from_date: from.value ? Rpc.date(from.value) :
                                null,
                            to_date: to.value ? Rpc.date(to.value) : null,
                            reexport: reexport.checked,
                            batch: forBatch.checked && batch.value ?
                                parseInt(batch.value, 10) : null,
                            detail: detail.checked}]);
                    })).then(function (results) {
                        results.forEach(function (files) {
                            files.forEach(function (f) {
                                download(f.name, f.content);
                            });
                        });
                        UI.toast('Exported', 'ok');
                        load();
                    }, UI.showError);
                }, true)));
            return box;
        }

        function render() {
            UI.clear(body);
            body.appendChild(postSection());
            body.appendChild(groupsSection());
            body.appendChild(exportSection());
            body.appendChild(el('fieldset.jsa-box', el('legend',
                'Journal Batches'), table([
                    {key: 'number', label: 'Batch ID'},
                    {key: 'posting_date', label: 'Posting Date',
                        type: 'date'},
                    {key: 'period', label: 'Period/Year'},
                    {key: 'journal', label: 'Sub Ledger'},
                    {key: 'moves', label: 'Moves', type: 'int'},
                    {key: 'debit', label: 'Debit', type: 'money'},
                    {key: 'credit', label: 'Credit', type: 'money'},
                    {key: 'posted_date', label: 'Posted Date',
                        type: 'date'},
                    {key: 'exported_date', label: 'Exported',
                        type: 'date'}], data.batches)));
        }

        load();
    };

    /* ---- Executive Information ---------------------------------------- */

    var EXEC_TITLES = {sales: 'Sales', purchasing: 'Purchasing',
        production: 'Production', financials: 'Financials'};

    Screens.jsExec = function (main, params) {
        style();
        var kind = params[0];
        var months = el('select', {'aria-label': 'Months', onchange: load},
            [6, 12, 24].map(function (m) {
                return el('option', {value: m}, 'Last ' + m + ' months');
            }));
        months.value = String(storeGet('jsa-exec-months') || 12);
        var body = el('div');
        ribbon(main, 'Executive Information - ' + EXEC_TITLES[kind], [
            el('label.ribbon-field', 'Show ', months),
            button('Refresh', load, false, 'F5'),
            button('Print', function () {
                global.print();
            })]);
        main.appendChild(body);
        shortcuts(body, {refresh: load});

        function load() {
            storeSet('jsa-exec-months', parseInt(months.value, 10));
            Rpc.desk('jsadmin_exec', [kind, parseInt(months.value, 10)])
                .then(render, UI.showError);
        }

        function render(data) {
            UI.clear(body);
            body.appendChild(el('p.muted', 'As of ' + UI.date(data.as_of)));
            body.appendChild(el('div.jsa-tiles', data.tiles.map(function (t) {
                return el('div.jsa-tile' + (t.bad ? '.bad' : ''),
                    el('div.label', t.label),
                    el('div.value', t.type === 'money' ? UI.money(t.value,
                        true) : String(t.value)),
                    t.hint ? el('div.hint', t.hint) : null);
            })));
            body.appendChild(el('div.jsa-charts', data.charts.map(chart)));
            data.tables.forEach(function (t) {
                body.appendChild(el('div.panel', el('h3', t.title),
                    table(t.columns, t.rows)));
            });
        }

        load();
    };

    /* ---- User Manager ---------------------------------------------------- */

    var BI_NOTE = 'People sign in through N-Line BI: there is no password ' +
        'here. Their N-Line role and its options (PO limit, work orders) ' +
        'are set again from the BI Admin page at each sign-in; roles ' +
        'added here stay.';

    function userDialog(data, user, done, presetRole) {
        user = user || {groups: presetRole ? [presetRole] : [], active: true,
            nline_wo_create: true, nline_wo_modify: true};
        var login = el('input', {type: 'text', value: user.login || ''});
        var fullName = el('input', {type: 'text', value: user.name || ''});
        var email = el('input', {type: 'text', value: user.email || ''});
        var active = el('input', {type: 'checkbox', checked: user.active});
        var role = el('select', el('option', {value: ''}, ''),
            data.nline_roles.map(function (r) {
                return el('option', {value: r.id}, r.name + ' (' + r.code +
                    ')');
            }));
        role.value = user.nline_role ? String(user.nline_role.id) : '';
        var checks = {};
        var groupList = el('div', {style: {maxHeight: '220px', overflowY:
            'auto', border: '1px solid var(--line)', padding: '4px'}},
            data.groups.map(function (g) {
                checks[g.id] = el('input', {type: 'checkbox', checked:
                    user.groups.indexOf(g.id) >= 0});
                return el('div', el('label', checks[g.id], ' ' + g.name));
            }));
        var options = {};
        var optionNodes = data.options.map(function (o) {
            if (o.name === 'nline_po_limit') {
                options[o.name] = el('input', {type: 'text', value:
                    user[o.name] === null || user[o.name] === undefined ?
                        '' : String(user[o.name])});
            } else {
                options[o.name] = el('input', {type: 'checkbox', checked:
                    user[o.name] !== false});
            }
            return [el('label.field', o.label), options[o.name]];
        });
        UI.modal(user.id ? 'User Properties' : 'User Properties - New', [
            el('p.jsa-note', BI_NOTE),
            el('div.grid-form',
                el('div', el('label.field', 'User ID'), login),
                el('div', el('label.field', 'Full Name'), fullName),
                el('div', el('label.field', 'Email'), email),
                el('div', el('label.field', 'Active'), active),
                data.nline_roles.length ? el('div', el('label.field',
                    'N-Line Role (BI)'), role) : null,
                optionNodes.map(function (n) {
                    return el('div', n);
                })),
            el('label.field', 'Roles'), groupList], [
            {label: 'Cancel'},
            {label: 'OK', primary: true, onclick: function (close) {
                var values = {
                    id: user.id || null,
                    login: login.value,
                    name: fullName.value,
                    email: email.value,
                    active: active.checked,
                    groups: Object.keys(checks).filter(function (id) {
                        return checks[id].checked;
                    }).map(Number)
                };
                if (data.nline_roles.length) {
                    values.nline_role = role.value ? parseInt(role.value,
                        10) : null;
                }
                Object.keys(options).forEach(function (name) {
                    values[name] = options[name].type === 'checkbox' ?
                        options[name].checked : options[name].value;
                });
                Rpc.desk('jsadmin_user_save', [values]).then(function () {
                    close();
                    UI.toast('User saved', 'ok');
                    done();
                }, UI.showError);
                return true;
            }}]);
        login.focus();
    }

    function roleDialog(data, group, done) {
        group = group || {users: []};
        var roleName = el('input', {type: 'text', value: group.name || ''});
        var checks = {};
        var users = el('div', {style: {maxHeight: '260px', overflowY: 'auto',
            border: '1px solid var(--line)', padding: '4px'}},
            data.users.map(function (u) {
                checks[u.id] = el('input', {type: 'checkbox', checked:
                    group.users.indexOf(u.id) >= 0});
                return el('div', el('label', checks[u.id], ' ' + u.login +
                    ' - ' + u.name));
            }));
        UI.modal(group.id ? 'Role Properties' : 'Role Properties - New', [
            el('label.field', 'Role'), roleName,
            el('label.field', 'Users'), users], [
            {label: 'Cancel'},
            group.id ? {label: 'Add User', onclick: function () {
                userDialog(data, null, done, group.id);
            }} : null,
            {label: 'OK', primary: true, onclick: function (close) {
                Rpc.desk('jsadmin_role_save', [{id: group.id || null,
                    name: roleName.value, users: Object.keys(checks).filter(
                        function (id) {
                            return checks[id].checked;
                        }).map(Number)}]).then(function () {
                    close();
                    UI.toast('Role saved', 'ok');
                    done();
                }, UI.showError);
                return true;
            }}].filter(Boolean));
    }

    Screens.jsUsers = function (main) {
        style();
        var body = el('div');
        var data = null;
        var access = {};
        var search = el('input', {type: 'text', placeholder: 'Find',
            'aria-label': 'Find', oninput: render});
        var addUser = button('Add User', function () {
            userDialog(data, null, load);
        });
        var addRole = button('Add Role', function () {
            roleDialog(data, null, load);
        });
        ribbon(main, 'User Manager', [el('label.ribbon-field', search),
            addUser, addRole, button('Refresh', load, false, 'F5')]);
        main.appendChild(body);
        shortcuts(body, {refresh: load});

        function load() {
            Promise.all([Rpc.desk('jsadmin_users', []), UI.access([
                'res.user', 'res.group'])]).then(function (result) {
                    data = result[0];
                    access = result[1];
                    addUser.hidden = !(access['res.user'] &&
                        access['res.user'].create);
                    addRole.hidden = !(access['res.group'] &&
                        access['res.group'].create);
                    render();
                }, UI.showError);
        }

        function render() {
            if (!data) {
                return;
            }
            UI.clear(body);
            var text = search.value.trim().toLowerCase();
            var names = {};
            data.groups.forEach(function (g) {
                names[g.id] = g.name;
            });
            var canWrite = access['res.user'] && access['res.user'].write;
            var users = data.users.filter(function (u) {
                return !text || (u.login + ' ' + u.name).toLowerCase()
                    .indexOf(text) >= 0;
            });
            body.appendChild(el('p.jsa-note', BI_NOTE));
            body.appendChild(el('h3', 'Users'));
            body.appendChild(table([
                {key: 'login', label: 'User ID'},
                {key: 'name', label: 'Full Name'},
                {key: 'nline_role', label: 'N-Line Role', render: function (u) {
                    return u.nline_role ? u.nline_role.rec_name : '';
                }},
                {key: 'groups', label: 'Roles', render: function (u) {
                    return u.groups.map(function (g) {
                        return names[g];
                    }).join(', ');
                }},
                {key: 'nline_po_limit', label: 'PO Limit', type: 'money'},
                {key: 'active', label: 'Active', type: 'bool'}],
                users, canWrite ? function (u) {
                    userDialog(data, u, load);
                } : null));
            var canGroup = access['res.group'] && access['res.group'].write;
            body.appendChild(el('h3', 'Roles'));
            body.appendChild(table([
                {key: 'name', label: 'Role'},
                {key: 'users', label: 'Users', type: 'int', render:
                    function (g) {
                        return String(g.users.length);
                    }}],
                data.groups.filter(function (g) {
                    return !text || g.name.toLowerCase().indexOf(text) >= 0;
                }), canGroup ? function (g) {
                    roleDialog(data, g, load);
                } : null));
        }

        load();
    };

    /* ---- Authority Manager -------------------------------------------- */

    Screens.jsAuthorities = function (main) {
        style();
        var body = el('div');
        var data = null;
        var access = {};
        var kind = el('select', {'aria-label': 'By', onchange: function () {
            fillWho();
            render();
        }}, el('option', {value: 'group'}, 'Role'),
            el('option', {value: 'user'}, 'User'));
        var who = el('select', {'aria-label': 'Name', onchange: render});
        var tree = el('input', {type: 'checkbox', checked: true,
            onchange: render});
        var matrix = el('input', {type: 'checkbox', onchange: render});
        ribbon(main, 'Authority Manager', [
            el('label.ribbon-field', 'By ', kind),
            el('label.ribbon-field', 'Name ', who),
            el('label.ribbon-field', tree, ' Authority Tree View'),
            el('label.ribbon-field', matrix, ' All Users'),
            button('Refresh', load, false, 'F5')]);
        main.appendChild(body);
        shortcuts(body, {refresh: load});

        function fillWho() {
            var current = who.value;
            UI.clear(who);
            var list = kind.value === 'user' ? data.users : data.groups;
            list.forEach(function (x) {
                who.appendChild(el('option', {value: x.id}, kind.value ===
                    'user' ? x.login + ' - ' + x.name : x.name));
            });
            if (current && list.some(function (x) {
                return String(x.id) === current;
            })) {
                who.value = current;
            }
        }

        function load() {
            Promise.all([Rpc.desk('jsadmin_authorities', []), UI.access([
                'res.user', 'ir.ui.menu'])]).then(function (result) {
                    data = result[0];
                    access = result[1];
                    fillWho();
                    render();
                }, UI.showError);
        }

        function set(values) {
            Rpc.desk('jsadmin_authority_set', [values]).then(function (r) {
                data = r;
                render();
            }, UI.showError);
        }

        function canEdit() {
            return kind.value === 'user' ? access['res.user'] &&
                access['res.user'].write : access['ir.ui.menu'] &&
                access['ir.ui.menu'].write;
        }

        function cell(screen, entity, isUser) {
            var allowed = entity.allowed.indexOf(screen.id) >= 0;
            var everyone = !screen.needs.length;
            var label = allowed ? 'Allow' : 'Deny';
            if (everyone || !canEdit() || (isUser && entity.admin)) {
                return el('span' + (allowed ? '.jsa-allow' : '.jsa-deny'),
                    everyone ? 'Allow (everyone)' : label);
            }
            return el('button' + (allowed ? '.jsa-allow' : '.jsa-deny'), {
                type: 'button', title: 'Click to ' + (allowed ? 'deny' :
                    'allow'), onclick: function () {
                    var values = {menu: screen.id, allow: !allowed};
                    values[isUser ? 'user' : 'group'] = entity.id;
                    set(values);
                }}, label);
        }

        function options(user) {
            if (!data.options.length) {
                return null;
            }
            var write = access['res.user'] && access['res.user'].write;
            var nodes = data.options.map(function (o) {
                var input;
                if (o.name === 'nline_po_limit') {
                    input = el('input', {type: 'text', value: user[o.name] ===
                        null || user[o.name] === undefined ? '' :
                        String(user[o.name]), disabled: !write});
                } else {
                    input = el('input', {type: 'checkbox', checked:
                        user[o.name] !== false, disabled: !write});
                }
                input.addEventListener('change', function () {
                    var values = {id: user.id};
                    values[o.name] = input.type === 'checkbox' ?
                        input.checked : input.value;
                    Rpc.desk('jsadmin_user_save', [values]).then(function () {
                        UI.toast('Saved', 'ok');
                    }, UI.showError);
                });
                return el('label.ribbon-field', o.label + ' ', input);
            });
            return el('fieldset.jsa-box', el('legend', 'Functions'),
                el('p.jsa-note', 'Set from the N-Line BI Admin page too ' +
                    '(again at each sign-in).'), el('div.toolbar', nodes));
        }

        function render() {
            if (!data) {
                return;
            }
            UI.clear(body);
            if (matrix.checked) {
                body.appendChild(el('div.table-wrap', el('table.data.' +
                    'jsa-matrix', el('thead', el('tr', el('th', 'Screen'),
                        data.users.map(function (u) {
                            return el('th.rot', u.login);
                        }))), el('tbody', data.screens.map(function (s) {
                            return el('tr', el('td', s.path),
                                data.users.map(function (u) {
                                    var yes = u.allowed.indexOf(s.id) >= 0;
                                    var editable = canEdit() && !u.admin &&
                                        s.needs.length && access['res.user'];
                                    return el('td.cell.' + (yes ? 'yes' :
                                        'no'), {title: u.login + ': ' +
                                        s.path, onclick: editable ?
                                        function () {
                                            set({menu: s.id, user: u.id,
                                                allow: !yes});
                                        } : null}, yes ? '✔' : '✖');
                                }));
                        })))));
                return;
            }
            var isUser = kind.value === 'user';
            var list = isUser ? data.users : data.groups;
            var entity = list.filter(function (x) {
                return String(x.id) === who.value;
            })[0];
            if (!entity) {
                body.appendChild(el('p.muted', 'Choose a role or a user.'));
                return;
            }
            if (isUser) {
                var functions = options(entity);
                if (functions) {
                    body.appendChild(functions);
                }
                if (entity.admin) {
                    body.appendChild(el('p.jsa-note', 'An administrator ' +
                        'may open everything.'));
                }
            }
            var folders = {};
            var order = [];
            data.screens.forEach(function (s) {
                var key = tree.checked ? s.folder : '';
                if (!folders[key]) {
                    folders[key] = [];
                    order.push(key);
                }
                folders[key].push(s);
            });
            order.forEach(function (folder) {
                body.appendChild(el('fieldset.jsa-box', folder ? el('legend',
                    folder) : null, table([
                        {key: 'name', label: 'Function', render: function (s) {
                            return tree.checked ? s.name : s.path;
                        }},
                        {key: 'status', label: 'Authority', render:
                            function (s) {
                                return cell(s, entity, isUser);
                            }}], folders[folder])));
            });
        }

        load();
    };

    /* ---- System Settings ---------------------------------------------- */

    var SETTING_TABS = ['Address', 'Accounting', 'Estimating', 'Inventory',
        'Purchasing', 'Sales', 'Shopfloor'];

    Screens.jsSystemSettings = function (main) {
        style();
        var data = null;
        var controls = {company: {}, numbering: {}, options: {}};
        var tabBar = el('div.tabs', {role: 'tablist'});
        var panes = el('div.tab-panes');
        var saveButton = button('Save', save, true, 'Ctrl+S');
        ribbon(main, 'System Settings', [button('Refresh', load, false,
            'F5'), saveButton]);
        main.appendChild(tabBar);
        main.appendChild(panes);
        shortcuts(panes, {save: save, refresh: load});

        function load() {
            Promise.all([Rpc.desk('jsadmin_settings', []), UI.access([
                'nline.desk.configuration', 'ir.sequence', 'party.party',
                'account.fiscalyear'])]).then(function (result) {
                    data = result[0];
                    render(result[1]);
                }, UI.showError);
        }

        function show(index) {
            Array.prototype.forEach.call(tabBar.children, function (b, i) {
                b.classList.toggle('active', i === index);
            });
            Array.prototype.forEach.call(panes.children, function (p, i) {
                p.hidden = i !== index;
            });
        }

        function field(label, node) {
            return el('div', el('label.field', label), node);
        }

        function numberingBox(n) {
            var seq = n.sequence;
            if (!seq) {
                return el('fieldset.jsa-box', el('legend', n.label +
                    ' Auto Numbering'), el('p.muted', 'No Tryton numbering ' +
                    'set for it.'));
            }
            var next = el('input.money', {type: 'text', value:
                seq.number_next});
            var prefix = el('input', {type: 'text', value: seq.prefix});
            var suffix = el('input', {type: 'text', value: seq.suffix});
            var digits = el('input.money', {type: 'text', value: seq.padding ||
                ''});
            var zeros = el('input', {type: 'checkbox', checked:
                seq.padding > 0});
            var sample = el('span.jsa-sample');
            function preview() {
                var number = String(next.value || '');
                var pad = zeros.checked ? parseInt(digits.value, 10) || 0 : 0;
                while (number.length < pad) {
                    number = '0' + number;
                }
                sample.textContent = prefix.value + number + suffix.value;
            }
            [next, prefix, suffix, digits, zeros].forEach(function (input) {
                input.addEventListener('input', preview);
                input.addEventListener('change', preview);
            });
            preview();
            controls.numbering[n.key] = function () {
                return {
                    number_next: seq.type === 'incremental' ? next.value :
                        null,
                    prefix: prefix.value,
                    suffix: suffix.value,
                    padding: zeros.checked ? parseInt(digits.value, 10) ||
                        0 : 0
                };
            };
            return el('fieldset.jsa-box', el('legend', n.label +
                ' Auto Numbering'), el('div.grid-form',
                    field('Next Sequential Number', next),
                    field('Alphanumeric Prefix', prefix),
                    field('Alphanumeric Suffix', suffix),
                    field('No. of Decimal Places', digits),
                    field('Show Leading Zeros', zeros),
                    field('Sample', sample)),
                el('p.jsa-note', seq.name + (n.key === 'quote' ? ' (Tryton ' +
                    'numbers the quotes and the sales orders alike)' : '')));
        }

        function optionField(key) {
            var info = data.fields[key];
            if (!info) {
                return null;
            }
            var value = data.options[key];
            var f = {name: key, label: info.label, type: info.type,
                model: info.model, options: info.options ? [[null, '']]
                    .concat(info.options) : null};
            var c = UI.fieldControl(f);
            c.set(value);
            controls.options[key] = c;
            return field(info.label, c.node);
        }

        function addressPane(pane) {
            var company = data.company;
            [['name', 'Name', 'char'], ['street', 'Address', 'text'],
                ['city', 'City', 'char'], ['subdivision', 'State',
                    'many2one', 'country.subdivision'],
                ['postal_code', 'Postal', 'char'], ['country', 'Country',
                    'many2one', 'country.country'], ['phone', 'Phone',
                    'char'], ['fax', 'Fax', 'char'], ['website', 'Web URL',
                    'char']].forEach(function (spec) {
                var c = UI.fieldControl({name: spec[0], label: spec[1],
                    type: spec[2], model: spec[3], rows: 2});
                c.set(company[spec[0]]);
                controls.company[spec[0]] = c;
                pane.appendChild(field(spec[1], c.node));
            });
        }

        function render(access) {
            UI.clear(tabBar);
            UI.clear(panes);
            controls = {company: {}, numbering: {}, options: {}};
            var canWrite = access['nline.desk.configuration'] &&
                access['nline.desk.configuration'].write;
            saveButton.hidden = !canWrite;
            SETTING_TABS.forEach(function (tab, index) {
                tabBar.appendChild(el('button.tab', {type: 'button',
                    role: 'tab', onclick: function () {
                        show(index);
                    }}, tab));
                var pane = el('div.tab-pane.panel', {role: 'tabpanel'});
                var grid = el('div.grid-form');
                if (tab === 'Address') {
                    if (access['party.party'] && access['party.party'].write) {
                        addressPane(grid);
                    } else {
                        grid.appendChild(el('p.muted', data.company.name));
                    }
                }
                Object.keys(data.fields).forEach(function (key) {
                    if (data.fields[key].tab === tab) {
                        grid.appendChild(optionField(key));
                    }
                });
                if (tab === 'Inventory') {
                    grid.appendChild(field('Current Period End Date',
                        el('span', UI.date(data.current_period_end))));
                    grid.appendChild(field('Next Period End Date',
                        el('span', UI.date(data.next_period_end))));
                }
                pane.appendChild(grid);
                if (tab === 'Accounting' && access['account.fiscalyear'] &&
                        access['account.fiscalyear'].create) {
                    var end = el('input', {type: 'date'});
                    pane.appendChild(el('fieldset.jsa-box', el('legend',
                        'Automatic Date Generation'), el('div.toolbar',
                            el('label.ribbon-field', 'Fiscal Year End Date ',
                                end), button('Auto', function () {
                                if (!end.value) {
                                    return;
                                }
                                var type = controls.options.period_type ?
                                    controls.options.period_type.get() :
                                    'monthly';
                                Rpc.desk('jsadmin_fiscalyear_create', [{
                                    end_date: Rpc.date(end.value),
                                    period_type: type || 'monthly'}]).then(
                                    function () {
                                        UI.toast('Fiscal year created', 'ok');
                                        load();
                                    }, UI.showError);
                            })), el('p.jsa-note', 'Creates the fiscal year ' +
                                'ending on the date with monthly or ' +
                                'quarterly periods (Period Type).')));
                }
                if (access['ir.sequence'] && access['ir.sequence'].write) {
                    data.numbering.forEach(function (n) {
                        if (n.tab === tab) {
                            pane.appendChild(numberingBox(n));
                        }
                    });
                }
                panes.appendChild(pane);
            });
            show(0);
        }

        function save() {
            if (!data || saveButton.hidden) {
                return;
            }
            var values = {company: {}, numbering: {}, options: {}};
            Object.keys(controls.company).forEach(function (k) {
                values.company[k] = controls.company[k].get();
            });
            if (!Object.keys(values.company).length) {
                delete values.company;
            }
            Object.keys(controls.numbering).forEach(function (k) {
                values.numbering[k] = controls.numbering[k]();
            });
            Object.keys(controls.options).forEach(function (k) {
                values.options[k] = controls.options[k].get();
            });
            Rpc.desk('jsadmin_settings_save', [values]).then(function () {
                UI.toast('System Settings saved', 'ok');
                load();
            }, UI.showError);
        }

        load();
    };

    /* ---- The Jobshop reports ------------------------------------------ */

    var GROUP_TITLES = {inventory: 'Inventory', engineering: 'Engineering',
        estimating: 'Estimating', sales: 'Sales', purchasing: 'Purchasing',
        planning: 'Planning', shopfloor: 'Shopfloor', accounting:
        'Accounting', common: 'Common'};
    var CONDITIONS = ['=', '!=', '<', '<=', '>', '>=', 'contains',
        'not contains', 'starts with', 'is empty', 'is not empty'];
    var PERIODS = [['', 'All'], ['today', 'Today'], ['this-month',
        'This Month'], ['last-month', 'Last Month'], ['this-quarter',
        'This Quarter'], ['this-year', 'This Year'], ['last-year',
        'Last Year'], ['custom', 'Custom']];

    function iso(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,
            '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function periodDates(name) {
        var now = new Date(), y = now.getFullYear(), m = now.getMonth();
        var q = Math.floor(m / 3) * 3;
        switch (name) {
            case 'today':
                return [iso(now), iso(now)];
            case 'this-month':
                return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
            case 'last-month':
                return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
            case 'this-quarter':
                return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))];
            case 'this-year':
                return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
            case 'last-year':
                return [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11,
                    31))];
            default:
                return ['', ''];
        }
    }

    /* The report dialog: the controls of the filters, Sort By and the
     * advanced filters and sorts; get() -> params, set(params) */
    function reportDialog(definition, onrun) {
        var box = el('div.panel.jsa-noprint');
        var grid = el('div.jsa-filters');
        var getters = [];
        var setters = [];
        definition.filters.forEach(function (f) {
            if (f.type === 'range') {
                var a = el('input', {type: 'text', placeholder: 'From',
                    'aria-label': f.label + ' from'});
                var b = el('input', {type: 'text', placeholder: 'To',
                    'aria-label': f.label + ' to'});
                grid.appendChild(el('label', f.label));
                grid.appendChild(a);
                grid.appendChild(b);
                getters.push(function (p) {
                    if (a.value.trim()) {
                        p[f.key + '_from'] = a.value.trim();
                    }
                    if (b.value.trim()) {
                        p[f.key + '_to'] = b.value.trim();
                    }
                });
                setters.push(function (p) {
                    a.value = p[f.key + '_from'] || '';
                    b.value = p[f.key + '_to'] || '';
                });
            } else if (f.type === 'dates') {
                var choice = el('select', {'aria-label': f.label},
                    PERIODS.map(function (o) {
                        return el('option', {value: o[0]}, o[1]);
                    }));
                var from = el('input', {type: 'date', 'aria-label': f.label +
                    ' from'});
                var to = el('input', {type: 'date', 'aria-label': f.label +
                    ' to'});
                var apply = function () {
                    if (choice.value !== 'custom') {
                        var d = periodDates(choice.value);
                        from.value = d[0];
                        to.value = d[1];
                    }
                };
                choice.addEventListener('change', apply);
                [from, to].forEach(function (input) {
                    input.addEventListener('change', function () {
                        choice.value = 'custom';
                    });
                });
                grid.appendChild(el('label', f.label));
                grid.appendChild(el('span', choice, ' ', from));
                grid.appendChild(to);
                getters.push(function (p) {
                    if (from.value) {
                        p[f.key + '_from'] = from.value;
                    }
                    if (to.value) {
                        p[f.key + '_to'] = to.value;
                    }
                    p['_period_' + f.key] = choice.value;
                });
                setters.push(function (p) {
                    choice.value = p['_period_' + f.key] !== undefined ?
                        p['_period_' + f.key] : (f['default'] || '');
                    if (choice.value === 'custom') {
                        from.value = p[f.key + '_from'] || '';
                        to.value = p[f.key + '_to'] || '';
                    } else {
                        apply();
                    }
                });
            } else if (f.type === 'select' || f.type === 'option') {
                var select = el('select', {'aria-label': f.label},
                    (f.type === 'select' ? [['', 'All']] : []).concat(
                        f.options).map(function (o) {
                        return el('option', {value: o[0]}, o[1]);
                    }));
                grid.appendChild(el('label', f.label));
                grid.appendChild(select);
                grid.appendChild(el('span'));
                getters.push(function (p) {
                    if (select.value !== '') {
                        p[f.key] = select.value;
                    }
                });
                setters.push(function (p) {
                    select.value = p[f.key] !== undefined ? p[f.key] :
                        (f['default'] || '');
                });
            } else if (f.type === 'check') {
                var check = el('input', {type: 'checkbox'});
                grid.appendChild(el('label', f.label));
                grid.appendChild(check);
                grid.appendChild(el('span'));
                getters.push(function (p) {
                    p[f.key] = check.checked;
                });
                setters.push(function (p) {
                    check.checked = p[f.key] !== undefined ? p[f.key] :
                        Boolean(f['default']);
                });
            } else if (f.type === 'date') {
                var date = el('input', {type: 'date'});
                grid.appendChild(el('label', f.label));
                grid.appendChild(date);
                grid.appendChild(el('span'));
                getters.push(function (p) {
                    if (date.value) {
                        p[f.key] = date.value;
                    }
                });
                setters.push(function (p) {
                    date.value = p[f.key] || (f['default'] === 'today' ?
                        UI.today() : '');
                });
            }
        });
        var sortBy = el('select', {'aria-label': 'Sort By'},
            definition.columns.map(function (c) {
                return el('option', {value: c.key}, c.label);
            }));
        var desc = el('input', {type: 'checkbox'});
        grid.appendChild(el('label', 'Sort By'));
        grid.appendChild(sortBy);
        grid.appendChild(el('label', desc, ' Descending'));
        var group = null;
        if (definition.group_by) {
            group = el('input', {type: 'checkbox', checked: true});
            grid.appendChild(el('label', 'Subtotals'));
            grid.appendChild(el('label', group, ' By ' + definition.columns
                .filter(function (c) {
                    return c.key === definition.group_by;
                }).map(function (c) {
                    return c.label;
                })[0]));
            grid.appendChild(el('span'));
        }
        box.appendChild(grid);

        /* Advanced Filtering and Sorting */
        var advFilters = [];
        var advSorts = [];
        var advBody = el('div.jsa-adv', {hidden: true});
        function columnSelect(value) {
            var s = el('select', {'aria-label': 'Column'},
                definition.columns.map(function (c) {
                    return el('option', {value: c.key}, c.label);
                }));
            if (value) {
                s.value = value;
            }
            return s;
        }
        function renderAdvanced() {
            UI.clear(advBody);
            var rows = el('tbody');
            advFilters.forEach(function (f, i) {
                var column = columnSelect(f.key);
                var condition = el('select', {'aria-label': 'Condition'},
                    CONDITIONS.map(function (c) {
                        return el('option', {value: c}, c);
                    }));
                condition.value = f.condition || '=';
                var value = el('input', {type: 'text', value: f.value ||
                    '', 'aria-label': 'Value'});
                var join = el('select', {'aria-label': 'And/Or'},
                    el('option', {value: 'and'}, 'And'),
                    el('option', {value: 'or'}, 'Or'));
                join.value = f.join || 'and';
                [column, condition, value, join].forEach(function (n) {
                    n.addEventListener('change', function () {
                        f.key = column.value;
                        f.condition = condition.value;
                        f.value = value.value;
                        f.join = join.value;
                    });
                });
                f.key = column.value;
                f.condition = condition.value;
                rows.appendChild(el('tr', el('td', i ? join : ''),
                    el('td', column), el('td', condition), el('td', value),
                    el('td', button('Delete', function () {
                        advFilters.splice(i, 1);
                        renderAdvanced();
                    }))));
            });
            advBody.appendChild(el('h4', 'Filters'));
            advBody.appendChild(el('table', rows));
            advBody.appendChild(button('Add Filter', function () {
                advFilters.push({condition: '='});
                renderAdvanced();
            }));
            var sorts = el('tbody');
            advSorts.forEach(function (s, i) {
                var column = columnSelect(s.key);
                var down = el('input', {type: 'checkbox', checked: s.desc});
                column.addEventListener('change', function () {
                    s.key = column.value;
                });
                down.addEventListener('change', function () {
                    s.desc = down.checked;
                });
                s.key = column.value;
                sorts.appendChild(el('tr', el('td', column), el('td',
                    el('label', down, ' Descending')), el('td',
                        button('Up', function () {
                            if (i > 0) {
                                advSorts.splice(i - 1, 0, advSorts.splice(i,
                                    1)[0]);
                                renderAdvanced();
                            }
                        }), ' ', button('Down', function () {
                            if (i < advSorts.length - 1) {
                                advSorts.splice(i + 1, 0, advSorts.splice(i,
                                    1)[0]);
                                renderAdvanced();
                            }
                        }), ' ', button('Remove', function () {
                            advSorts.splice(i, 1);
                            renderAdvanced();
                        }))));
            });
            advBody.appendChild(el('h4', 'Sorting'));
            advBody.appendChild(el('table', sorts));
            advBody.appendChild(button('Add Sort', function () {
                advSorts.push({});
                renderAdvanced();
            }));
        }
        var advToggle = button('Advanced Filtering and Sorting', function () {
            advBody.hidden = !advBody.hidden;
            renderAdvanced();
        });
        advToggle.hidden = !definition.advanced;
        var key = 'jsa-report-' + definition.id;
        box.appendChild(el('div.toolbar',
            button('Preview', function () {
                onrun(get());
            }, true, 'Run the report (F5)'),
            advToggle,
            button('Save Filters', function () {
                storeSet(key, get());
                UI.toast('Filters saved for this report', 'ok');
            }),
            button('Restore Defaults', function () {
                storeSet(key, null);
                set({});
            })));
        box.appendChild(advBody);

        function get() {
            var p = {};
            getters.forEach(function (g) {
                g(p);
            });
            p.sort = sortBy.value;
            p.sort_desc = desc.checked;
            if (group) {
                p.group = group.checked;
            }
            p.advanced = {
                filters: advFilters.filter(function (f) {
                    return f.key && f.condition;
                }),
                sort: advSorts.filter(function (s) {
                    return s.key;
                })
            };
            return p;
        }

        function set(p) {
            setters.forEach(function (s) {
                s(p);
            });
            sortBy.value = p.sort || definition.sort;
            desc.checked = Boolean(p.sort_desc);
            if (group) {
                group.checked = p.group !== false;
            }
            advFilters = ((p.advanced || {}).filters || []).slice();
            advSorts = ((p.advanced || {}).sort || []).slice();
            renderAdvanced();
        }

        set(storeGet(key) || {});
        return {node: box, get: get};
    }

    /* The printed report: company, title, ranges, the rows with their
     * groups, subtotals and total, the graph, the gaps */
    function reportOutput(data) {
        var page = el('div.report-page.jsa-report-out');
        page.appendChild(el('div.report-head',
            el('div.report-company', data.company || ''),
            el('div.report-title', data.title),
            el('div.report-subtitle', data.subtitle || ''),
            el('div.report-subtitle', 'Printed ' + UI.date(UI.today()))));
        if (data.chart && data.chart.labels.length) {
            page.appendChild(chart(data.chart));
        }
        var columns = data.columns;
        var body = el('tbody');
        data.rows.forEach(function (row) {
            if (row.k === 'group') {
                body.appendChild(el('tr.group', el('td', {colspan:
                    columns.length}, row.l)));
                return;
            }
            var cells = columns.map(function (c, i) {
                var v = row.v[i];
                if (row.k !== 'row' && !c.total) {
                    v = null;
                }
                return el('td' + (numeric(c.type) ? '.num' : ''),
                    format(v, c.type));
            });
            if (row.k !== 'row' && row.l) {
                for (var i = 0; i < columns.length; i++) {
                    if (!columns[i].total) {
                        cells[i].textContent = row.l;
                        break;
                    }
                }
            }
            body.appendChild(el('tr' + (row.k !== 'row' ? '.' + row.k : '') +
                (row.d ? '.drill' : ''), row.d ? {title:
                    'Double-click to open', ondblclick: function () {
                        drill(row.d);
                    }} : null, cells));
        });
        if (!data.rows.length) {
            body.appendChild(el('tr', el('td.muted', {colspan:
                columns.length}, 'Nothing to report.')));
        }
        page.appendChild(el('div.table-wrap', el('table.data.jsa-report',
            el('thead', el('tr', columns.map(function (c) {
                return el('th' + (numeric(c.type) ? '.num' : ''), c.label);
            }))), body)));
        var notes = [];
        if (data.truncated) {
            notes.push('Only the first rows of ' + data.count + ' are shown: ' +
                'narrow the ranges.');
        }
        if (data.note) {
            notes.push(data.note);
        }
        notes = notes.concat(data.gaps || []);
        if (notes.length) {
            page.appendChild(el('div.jsa-gaps', notes.map(function (n) {
                return el('div', n);
            })));
        }
        return page;
    }

    function drill(target) {
        if (target.type === 'record') {
            UI.openRecord(target.model, target.id);
        } else if (target.type === 'screen') {
            UI.openScreen(target.route);
        } else if (target.type === 'account') {
            UI.openScreen('accounts/' + target.id);
        }
    }

    function reportCsv(data) {
        var lines = [data.columns.map(function (c) {
            return csvValue(c.label);
        }).join(',')];
        data.rows.forEach(function (row) {
            if (row.k === 'group') {
                lines.push(csvValue(row.l));
                return;
            }
            lines.push(data.columns.map(function (c, i) {
                var v = row.v[i];
                if (row.k !== 'row') {
                    v = c.total ? v : (i === 0 ? row.l : '');
                }
                return csvValue(c.type === 'bool' ? (v ? 'Y' : '') : v);
            }).join(','));
        });
        download(data.title.replace(/\W+/g, '_') + '.csv',
            lines.join('\r\n'));
    }

    /* Avery 5160: three labels across */
    function labelsOutput(data) {
        var page = el('div.report-page.jsa-report-out');
        var keys = data.columns.map(function (c) {
            return c.key;
        });
        page.appendChild(el('div.jsa-labels', data.rows.filter(function (r) {
            return r.k === 'row';
        }).map(function (r) {
            return el('div.jsa-label', el('div', r.v[keys.indexOf(
                'employee')]), el('div.bar', r.v[keys.indexOf('barcode')]));
        })));
        return page;
    }

    Screens.jsReports = function (main, params) {
        style();
        var group = params[0];
        var wanted = params[1] || null;
        var title = (GROUP_TITLES[group] || group) + ' Reports';
        var list = el('div.jsa-list.jsa-noprint', {role: 'listbox',
            'aria-label': 'Reports'});
        var right = el('div');
        var data = null;
        var dialog = null;
        var current = null;
        /* Landscape reports print landscape */
        var pageStyle = document.getElementById('nl-js-admin-page');
        if (!pageStyle) {
            pageStyle = el('style#nl-js-admin-page');
            document.head.appendChild(pageStyle);
        }
        pageStyle.textContent = '';
        var printButton = button('Print', function () {
            if (data) {
                global.print();
            }
        });
        var exportButton = button('Export', function () {
            if (data) {
                reportCsv(data);
            }
        }, false, 'Export to a CSV file');
        ribbon(main, title, [printButton, exportButton]);
        var layout = el('div.jsa-split', list, right);
        main.appendChild(layout);
        shortcuts(layout, {refresh: function () {
            if (dialog) {
                run(dialog.get());
            }
        }});

        function run(p) {
            Rpc.desk('jsadmin_report_run', [current.id, p]).then(
                function (result) {
                    data = result;
                    pageStyle.textContent = data.landscape ?
                        '@page { size: landscape; }' : '';
                    var out = right.querySelector('.jsa-report-out');
                    if (out) {
                        out.remove();
                    }
                    right.appendChild(current.id === 'employee_label' ?
                        labelsOutput(data) : reportOutput(data));
                    UI.setTitle(data.title);
                }, UI.showError);
        }

        function choose(definition, buttonNode) {
            current = definition;
            data = null;
            Array.prototype.forEach.call(list.children, function (b) {
                b.classList.toggle('active', b === buttonNode);
            });
            UI.clear(right);
            right.appendChild(el('h2.jsa-noprint', definition.name,
                el('span.muted', ' ' + definition.rpt)));
            dialog = reportDialog(definition, run);
            right.appendChild(dialog.node);
        }

        Rpc.desk('jsadmin_report_list', [group]).then(function (reports) {
            if (!reports.length) {
                right.appendChild(el('p.muted', 'No report of this group ' +
                    'you may run.'));
                return;
            }
            reports.sort(function (a, b) {
                return a.name < b.name ? -1 : 1;
            });
            reports.forEach(function (r) {
                var node = el('button', {type: 'button', role: 'option',
                    ondblclick: function () {
                        if (current === r && dialog) {
                            run(dialog.get());
                        }
                    }}, r.name, el('small', r.rpt));
                node.addEventListener('click', function () {
                    choose(r, node);
                });
                list.appendChild(node);
                if (r.id === wanted) {
                    choose(r, node);
                }
            });
            if (!current) {
                right.appendChild(el('p.muted', 'Choose a report.'));
            }
        }, UI.showError);
    };
}(window));
