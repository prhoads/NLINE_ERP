/* N-Line Desk: the document page (owner's review, 29 Oct 2026)
 *
 * The modern view of a document window (purchase order, sales order, work
 * order...): the answers first, the fields second.
 *
 *   UI.docPage(main, spec) -> page {load(id), reload(), data(), save(changes),
 *       clear(), setClassic()}
 *
 * spec:
 *   title         the window's name ('Purchase Order')
 *   crumbs        ['Purchasing', 'Purchase orders']
 *   model, label  the ID lookup (UI.picker) to open another one
 *   openId        the record to open first (null: new)
 *   load(id)      -> Promise of the data
 *   save(values, data) -> Promise of the new data; values = the page's
 *                 changes merged into spec.values(data)
 *   values(data)  the full payload the save expects (default: data)
 *   blank()       the data of a new record (null: no New)
 *   head(data)    {title, chips: [text], sub: [text | {text, tone, icon}],
 *                 amount: {value, label}}
 *   status(data)  [{text, tone}] (tone: accent, bad, warn, ok, muted)
 *   actions(data, page) [{label, icon, primary, key, title, onclick}]
 *   more(data, page)    menu items (UI.contextMenu items)
 *   attention(data, page) [{tone, icon, title, detail, action: {label,
 *                 onclick}}]
 *   tracker(data) {title, note, steps: [{label, value, state}]} (state:
 *                 done, now, bad, todo)
 *   sections      [{title, note, render(pane, data, page)}]
 *   cards         [{title, icon, visible(data), rows(data) -> [[label, value]], fields:
 *                 [field specs of UI.fieldControl], editable(data)}]
 *   trail(data, page) [{done, text, when, onclick}]
 *   keys          {key: {label, run(data, page), name}} keys outside a
 *                 field: a letter, or a key name (ArrowUp, Enter...) with
 *                 name its display ('↑')
 *   route(data)   the address of a saved record ('purchase-orders/12')
 *   classic       function () {}: back to the Jobshop window
 *
 *   UI.docLines(pane, spec): the lines of a document as a list
 *   spec: items, kind(item) -> {icon, tone}, title(item), chips(item) ->
 *   [{text, tone}], progress(item) -> {done, total, label} | null,
 *   right(item) -> [main, sub, tone], onclick(item), add: {placeholder,
 *   onclick}, footer: [text]
 */
(function (global) {
    'use strict';

    var UI = global.UI;
    var el = UI.el;

    function chip(text, tone, icon, title) {
        var node = el('span.dp-chip' + (tone ? '.dp-' + tone : ''),
            icon ? el('i.dp-ico', {'aria-hidden': 'true'}, icon) : null,
            text);
        if (title) {
            node.title = title;
        }
        return node;
    }

    /* Small line icons drawn here (no icon font in the desk) */
    var ICONS = {
        warn: 'M12 3 2 21h20L12 3zm1 14h-2v-2h2v2zm0-4h-2V9h2v4z',
        bad: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
        info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
        ok: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
        clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.5 5H11v6l5.2 3.2.8-1.3-4.5-2.7z',
        dot: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
        edit: 'M3 17.2V21h3.8L17.8 9.9 14 6.1 3 17.2zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8L19 8.8 20.7 7z',
        plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
        part: 'M21 16.5c0 .4-.2.7-.5.9l-7.9 4.4c-.2.1-.4.2-.6.2s-.4-.1-.6-.2l-7.9-4.4c-.3-.2-.5-.5-.5-.9v-9c0-.4.2-.7.5-.9l7.9-4.4c.2-.1.4-.2.6-.2s.4.1.6.2l7.9 4.4c.3.2.5.5.5.9v9z',
        service: 'M22.7 19 13.6 9.9c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
        charge: 'M7 2v11h3v9l7-12h-4l4-8z',
        doc: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
        truck: 'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm13.5-9 2 2.5H17V9.5h2.5zm-1.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
        factory: 'M22 22H2V10l7-3v2l5-2v3h3l1-8h3l1 8v12z',
        person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z'
    };

    function icon(name, tone) {
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', 'dp-svg' + (tone ? ' dp-' + tone : ''));
        svg.setAttribute('aria-hidden', 'true');
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', ICONS[name] || ICONS.dot);
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);
        return svg;
    }

    function text(value) {
        return value === null || value === undefined || value === '' ?
            el('span.dp-unset', 'Not set') : String(value);
    }

    function docPage(main, spec) {
        var data = null;
        var dirty = {};
        var page = {};
        var editing = null;
        UI.clear(main);
        main.classList.add('dp-main');
        var crumbs = el('div.dp-crumbs', (spec.crumbs || []).join(' › '));
        var finder = spec.model ? UI.picker(spec.model, {
            label: spec.label || 'Open', placeholder: 'Open ' +
                (spec.label || 'another'), domain: spec.domain,
            order: spec.order, onselect: function (r) {
                page.load(r.id);
            }}) : null;
        var top = el('div.dp-top', crumbs, el('span.dp-spacer'),
            finder ? el('div.dp-finder', finder.node) : null,
            spec.blank ? el('button', {type: 'button', title: 'New (Ctrl+N)',
                onclick: function () {
                    page.clear();
                }}, 'New') : null,
            spec.classic ? el('button.dp-ghost', {type: 'button', title:
                'Show this window as Jobshop draws it', onclick: function () {
                    spec.classic(data);
                }}, 'Classic view') : null);
        var headBox = el('div.dp-head');
        var barBox = el('div.dp-bar');
        var attBox = el('div');
        var trackBox = el('div');
        var sectionBoxes = (spec.sections || []).map(function () {
            return el('div');
        });
        var cardsBox = el('div.dp-cards');
        var keysBox = el('div.dp-keys');
        var pageNode = el('div.dp-page', top, headBox, barBox, attBox,
            trackBox, sectionBoxes, cardsBox, keysBox);
        main.appendChild(pageNode);

        function card(title, body, tools) {
            return el('section.dp-card', el('div.dp-card-head',
                el('h3', title), tools || null), body);
        }

        function render() {
            UI.clear(headBox);
            UI.clear(barBox);
            UI.clear(attBox);
            UI.clear(trackBox);
            UI.clear(cardsBox);
            if (!data) {
                headBox.appendChild(el('p.dp-muted', 'Open one with the ' +
                    'search above' + (spec.blank ? ', or start a New one.' :
                        '.')));
                return;
            }
            var head = spec.head(data);
            headBox.appendChild(el('div.dp-head-main',
                el('div.dp-title-row', el('h1.dp-title', {title:
                    head.title || ''}, head.title || '(new)'), (head.chips || []).map(function (c) {
                        return typeof c === 'string' ? chip(c) :
                            chip(c.text, c.tone, null, c.title);
                    })),
                el('div.dp-sub', (head.sub || []).filter(Boolean)
                    .map(function (s, i) {
                        var item = typeof s === 'string' ? {text: s} : s;
                        return [i ? el('span.dp-dot', '·') : null,
                            el('span' + (item.tone ? '.dp-' + item.tone : ''),
                                item.icon ? icon(item.icon, item.tone) :
                                    null, item.text)];
                    }))));
            if (head.amount) {
                headBox.appendChild(el('div.dp-amount',
                    el('div.dp-amount-value', head.amount.value),
                    el('div.dp-muted', head.amount.label || '')));
            }
            barBox.appendChild(el('div.dp-status', (spec.status ?
                spec.status(data) : []).map(function (s) {
                    return chip(s.text, s.tone);
                })));
            var actions = spec.actions ? spec.actions(data, page) : [];
            var more = spec.more ? spec.more(data, page) : [];
            barBox.appendChild(el('div.dp-actions', actions.filter(Boolean)
                .map(function (a) {
                    return el('button' + (a.primary ? '.primary' : ''), {
                        type: 'button', title: (a.title || a.label) +
                            (a.key ? ' (' + a.key.toUpperCase() + ')' : ''),
                        onclick: function () {
                            a.onclick(data, page);
                        }}, a.label);
                }), more.length ? el('button', {type: 'button',
                    title: 'More', 'aria-label': 'More actions',
                    onclick: function (event) {
                        var r = event.currentTarget.getBoundingClientRect();
                        UI.contextMenu({preventDefault: function () {},
                            clientX: r.left, clientY: r.bottom + 2},
                            spec.more(data, page));
                    }}, '•••') : null));
            var att = spec.attention ? spec.attention(data, page)
                .filter(Boolean) : [];
            if (att.length) {
                attBox.appendChild(card('Needs your attention', el('div',
                    att.map(function (a) {
                        return el('div.dp-att', icon(a.icon || a.tone ||
                            'warn', a.tone || 'warn'), el('div.dp-att-text',
                            el('div', a.title), a.detail ? el('div.dp-muted',
                                a.detail) : null), a.action ?
                            el('button', {type: 'button', onclick:
                                function () {
                                    a.action.onclick(data, page);
                                }}, a.action.label) : null);
                    })), el('span.dp-muted', att.length + (att.length > 1 ?
                        ' items' : ' item'))));
            }
            var tr = spec.tracker ? spec.tracker(data) : null;
            if (tr) {
                trackBox.appendChild(card(tr.title, el('div.dp-track',
                    tr.steps.map(function (s) {
                        return el('div.dp-step.dp-step-' + (s.state ||
                            'todo'), el('b'), el('div.dp-muted', s.label),
                            s.value !== undefined ? el('div.dp-step-value',
                                s.value) : null);
                    })), tr.note ? el('span.dp-muted', tr.note) : null));
            }
            (spec.sections || []).forEach(function (s, i) {
                var box = sectionBoxes[i];
                UI.clear(box);
                if (s.visible && !s.visible(data)) {
                    return;
                }
                var pane = el('div');
                box.appendChild(card(s.title, pane, s.note ?
                    el('span.dp-muted', typeof s.note === 'function' ?
                        s.note(data) : s.note) : null));
                s.render(pane, data, page);
            });
            (spec.cards || []).forEach(function (c) {
                if (!c.visible || c.visible(data)) {
                    cardsBox.appendChild(infoCard(c));
                }
            });
            var trail = spec.trail ? spec.trail(data, page) : null;
            if (trail) {
                cardsBox.appendChild(card('Paper trail', el('div.dp-trail',
                    trail.filter(Boolean).map(function (t) {
                        return el('div.dp-trail-row' + (t.onclick ?
                            '.dp-link' : ''), {onclick: t.onclick ?
                            function () {
                                t.onclick(data, page);
                            } : null}, icon(t.done ? 'ok' : t.onclick ?
                            'plus' : 'dot', t.done ? 'ok' : 'muted'),
                            el('span', t.text), el('span.dp-muted.dp-when',
                                t.when || ''));
                    }))));
            }
            UI.clear(keysBox);
            var keys = Object.keys(spec.keys || {});
            if (keys.length) {
                keysBox.textContent = keys.map(function (k) {
                    return (spec.keys[k].name || k.toUpperCase()) + ' ' +
                        spec.keys[k].label;
                }).join(' · ');
            }
        }

        /* A card of key-values; its pencil turns it into fields */
        function infoCard(c) {
            var body = el('div');
            var can = c.fields && c.fields.length && (!c.editable ||
                c.editable(data));
            var pencil = can ? el('button.dp-icon-btn', {type: 'button',
                title: 'Edit', 'aria-label': 'Edit ' + c.title}, icon('edit'))
                : null;
            function view() {
                UI.clear(body);
                body.appendChild(el('div.dp-kv', c.rows(data).map(
                    function (row) {
                        if (!row) {
                            return null;
                        }
                        return [el('span.dp-muted', row[0]), el('span',
                            row[1] instanceof Node ? row[1] : text(row[1]))];
                    })));
            }
            function edit() {
                UI.clear(body);
                var controls = c.fields.map(function (f) {
                    var control = UI.fieldControl(f);
                    var value = f.value ? f.value(data) : data[f.name];
                    control.set(value === undefined ? null : value);
                    return {f: f, control: control};
                });
                body.appendChild(el('div.dp-form', controls.map(function (x) {
                    return el('label.dp-field', el('span.dp-muted',
                        x.f.label), x.control.node);
                })));
                body.appendChild(el('div.dp-form-buttons',
                    el('button', {type: 'button', onclick: function () {
                        editing = null;
                        view();
                    }}, 'Cancel'),
                    el('button.primary', {type: 'button', onclick:
                        function () {
                            var changes = {};
                            controls.forEach(function (x) {
                                changes[x.f.name] = x.control.get();
                            });
                            /* (shown again in its fields if refused) */
                            editing = null;
                            page.save(changes).then(null, function () {
                                editing = c;
                                render();
                            });
                        }}, 'Save')));
                var first = body.querySelector('input, select, textarea');
                if (first) {
                    first.focus();
                }
                editing = c;
            }
            if (pencil) {
                pencil.addEventListener('click', edit);
            }
            if (editing === c) {
                edit();
            } else {
                view();
            }
            return card(c.title, body, pencil);
        }

        page.data = function () {
            return data;
        };
        page.load = function (id) {
            return spec.load(id).then(function (d) {
                data = d;
                dirty = {};
                if (finder) {
                    finder.set(d.id, d.number || d.rec_name || String(d.id));
                }
                if (spec.onload) {
                    spec.onload(d);
                }
                UI.setTitle && UI.setTitle(spec.head(d).title);
                render();
                return d;
            }, UI.showError);
        };
        page.reload = function () {
            return data && data.id ? page.load(data.id) : render();
        };
        page.clear = function () {
            data = spec.blank ? spec.blank() : null;
            dirty = {};
            if (finder) {
                finder.set(null, '');
            }
            render();
        };
        /* Save: the changes over the whole payload (the save RPCs write
         * every field they get) */
        page.save = function (changes) {
            var values = spec.values ? spec.values(data) :
                Object.assign({}, data);
            Object.assign(values, dirty, changes || {});
            return Promise.resolve(spec.save(values, data)).then(function (d) {
                var created = !(data && data.id) && d && d.id;
                data = d;
                dirty = {};
                /* A new record's first save: its address and the ID box */
                if (created) {
                    if (finder) {
                        finder.set(d.id, d.number || d.rec_name ||
                            String(d.id));
                    }
                    if (spec.route) {
                        global.history.replaceState(null, '', '#/' +
                            spec.route(d));
                    }
                }
                UI.toast((spec.title || 'Document') + ' saved', 'ok');
                render();
                return d;
            }, function (error) {
                if (error && !error.cancelled) {
                    UI.showError(error);
                }
                throw error || {};
            });
        };
        page.render = render;
        main.dpPage = page;
        page.setClassic = spec.classic;

        main.addEventListener('keydown', function () {});
        document.addEventListener('keydown', function (event) {
            /* Only the newest page of a shown screen (not one in a hidden
             * tab, nor one the screen replaced) */
            if (!pageNode.isConnected || main.dpPage !== page ||
                    main.offsetParent === null ||
                    !main.classList.contains('dp-main') ||
                    event.ctrlKey || event.altKey ||
                    event.metaKey || document.querySelector('.overlay')) {
                return;
            }
            var t = event.target;
            if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) ||
                    t.isContentEditable)) {
                return;
            }
            var key = (spec.keys || {})[event.key.length === 1 ?
                event.key.toLowerCase() : event.key];
            if (key && data) {
                event.preventDefault();
                key.run(data, page);
            }
        });
        if (spec.openId) {
            page.load(spec.openId);
        } else {
            page.clear();
        }
        return page;
    }

    /* The lines of a document, one row each: kind icon, title with chips,
     * progress, amounts; a click opens the line */
    function docLines(pane, spec) {
        var list = el('div.dp-lines');
        (spec.items || []).forEach(function (item) {
            var kind = spec.kind ? spec.kind(item) : {icon: 'doc'};
            var progress = spec.progress ? spec.progress(item) : null;
            var right = spec.right ? spec.right(item) : [];
            var row = el('div.dp-line' + (spec.onclick ? '.dp-link' : ''), {
                tabindex: spec.onclick ? 0 : null,
                onclick: spec.onclick ? function () {
                    spec.onclick(item);
                } : null,
                onkeydown: spec.onclick ? function (event) {
                    if (event.key === 'Enter') {
                        spec.onclick(item);
                    }
                } : null},
                el('div.dp-kind.dp-' + (kind.tone || 'muted'),
                    icon(kind.icon)),
                el('div.dp-line-main', el('div.dp-line-title',
                    spec.title(item)), el('div.dp-line-chips',
                    (spec.chips ? spec.chips(item) : []).filter(Boolean)
                        .map(function (c) {
                            return typeof c === 'string' ? chip(c) :
                                chip(c.text, c.tone, null, c.title);
                        }))),
                el('div.dp-line-prog', progress ? [el('div.dp-muted',
                    progress.label), el('div.dp-bar-track',
                    el('div.dp-bar-fill', {style: {width: Math.min(100,
                        progress.total ? 100 * progress.done /
                            progress.total : 0) + '%'}}))] : null),
                el('div.dp-line-right', el('div' + (right[2] ?
                    '.dp-' + right[2] : ''), right[0] || ''),
                    el('div.dp-muted', right[1] || '')));
            list.appendChild(row);
        });
        if (!(spec.items || []).length) {
            list.appendChild(el('p.dp-muted.dp-pad', spec.empty ||
                'No lines yet.'));
        }
        var foot = el('div.dp-lines-foot', spec.add ? el('button.dp-add', {
            type: 'button', onclick: spec.add.onclick}, icon('plus'),
            spec.add.placeholder || 'Add a line') : el('span'),
            el('div.dp-lines-total', (spec.footer || []).map(function (f, i) {
                return el(i === (spec.footer.length - 1) ? 'b' :
                    'span.dp-muted', f);
            })));
        pane.classList.add('dp-flush');
        pane.appendChild(list);
        pane.appendChild(foot);
    }

    /* Edit an item (a line) in a dialog with fields: -> Promise of the
     * changed values (rejected on Cancel) */
    function editDialog(title, fields, item, extra) {
        return new Promise(function (resolve, reject) {
            var controls = fields.map(function (f) {
                var control = UI.fieldControl(f);
                var value = f.value ? f.value(item) : item[f.name];
                control.set(value === undefined ? null : value);
                return {f: f, control: control};
            });
            UI.modal(title, [el('div.dp-form', controls.map(function (x) {
                return el('label.dp-field' + (x.f.wide ? '.dp-wide' : ''),
                    el('span.dp-muted', x.f.label), x.control.node);
            })), extra || null], [
                {label: 'Cancel', onclick: function () {
                    reject({cancelled: true});
                }},
                {label: 'OK', primary: true, onclick: function () {
                    var values = {};
                    controls.forEach(function (x) {
                        values[x.f.name] = x.control.get();
                    });
                    resolve(values);
                }}]);
        });
    }

    /* The window's view: modern (default) or classic, per window and
     * browser */
    function viewOf(name) {
        try {
            return localStorage.getItem('nline.view.' + name) || 'modern';
        } catch (e) {
            return 'modern';
        }
    }

    function setView(name, view) {
        try {
            localStorage.setItem('nline.view.' + name, view);
        } catch (e) {
            /* No storage: this time only */
        }
    }

    Object.assign(UI, {docPage: docPage, docLines: docLines,
        docEdit: editDialog, docIcon: icon, docChip: chip,
        docView: viewOf, setDocView: setView});
}(window));
