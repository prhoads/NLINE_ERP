/* N-Line Desk: Settings > My Settings > Menu Layout (route #/menu-layout)
 *
 * Every user's own menu pane: which items it lists, the colour scheme and
 * the icon style, and each item's own icon and colour. Saved on the user
 * (res.user nline_menu_prefs, a preference: anyone may save their own);
 * the Tryton page draws the menu from it (custom.js, menuprefs.js) and shows
 * each change at once while this screen is open.
 */
(function (global) {
    'use strict';

    var Screens = global.Screens = global.Screens || {};
    var routes = global.NLINE_ROUTES = global.NLINE_ROUTES || [];
    routes.push([/^#\/menu-layout$/, 'menuLayout']);
    var UI = global.UI;
    var el = UI.el;
    var M = global.NLineMenu;

    function img(menu, prefs) {
        var url = M.iconUrl(menu, prefs);
        var node = el('img.ml-icon', {alt: ''});
        if (url) {
            node.src = url;
        } else {
            node.src = 'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent(M.svg('list', '#7a808a', 'ring'));
        }
        return node;
    }

    function css() {
        if (document.getElementById('nl-menu-layout-css')) {
            return;
        }
        document.head.appendChild(el('style#nl-menu-layout-css', [
            '.ml-page { max-width: 1100px; margin: 0 auto; }',
            '.ml-schemes { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }',
            '.ml-scheme { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: var(--paper); cursor: pointer; text-align: left; }',
            '.ml-scheme.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }',
            '.ml-sw { display: flex; gap: 3px; margin: 6px 0; }',
            '.ml-sw i { flex: 1; height: 14px; border-radius: 3px; }',
            '.ml-styles { display: flex; gap: 6px; flex-wrap: wrap; }',
            '.ml-styles button.on { background: var(--accent); color: #fff; border-color: var(--accent); }',
            '.ml-tab { margin-top: 14px; }',
            '.ml-tab h3 { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }',
            '.ml-group { font-weight: 600; font-size: 12px; color: var(--muted); padding: 8px 0 2px; }',
            '.ml-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; }',
            '.ml-row.off { opacity: .5; }',
            '.ml-icon { width: 22px; height: 22px; }',
            '.ml-iconbtn { border: 1px solid var(--line); background: var(--paper); border-radius: 6px; padding: 2px; line-height: 0; }',
            '.ml-swatch { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--line); padding: 0; }',
            '.ml-pop { position: fixed; z-index: 1000; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 10px 28px rgba(0,0,0,.2); padding: 8px; max-width: 360px; }',
            '.ml-grid { display: grid; grid-template-columns: repeat(9, 30px); gap: 4px; max-height: 260px; overflow-y: auto; }',
            '.ml-grid button { padding: 2px; line-height: 0; border: 1px solid transparent; background: none; }',
            '.ml-grid button:hover, .ml-grid button.on { border-color: var(--accent); }',
            '.ml-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 28px; }'
        ].join('\n')));
    }

    Screens.menuLayout = function (main) {
        css();
        var saved = null;           /* the saved text */
        var prefs = M.parse(null);
        var menus = [], byParent = {};
        var pop = null;

        function closePop() {
            if (pop) {
                pop.remove();
                pop = null;
            }
        }
        document.addEventListener('mousedown', function (event) {
            if (pop && !pop.contains(event.target)) {
                closePop();
            }
        });

        /* The Tryton page draws the menu as it would look */
        function preview() {
            try {
                global.parent.postMessage({nline: 'menu-prefs',
                    prefs: JSON.stringify(prefs)}, global.location.origin);
            } catch (e) {
                /* Opened on its own: nothing to show it in */
            }
        }

        function changed() {
            render();
            preview();
        }

        function save() {
            var text = JSON.stringify(prefs);
            Rpc.model('res.user', 'set_preferences', [{
                nline_menu_prefs: text}]).then(function () {
                    saved = text;
                    UI.toast('Menu layout saved', 'ok');
                    preview();
                }, UI.showError);
        }

        var body = el('div.ml-page');
        UI.form(main, {title: 'Menu Layout', extra: [
            {label: 'Show all items', title: 'Every menu item back in the ' +
                'list', onclick: function () {
                    prefs.hidden = [];
                    changed();
                }},
            {label: 'Default icons', title: 'Each item back to its own ' +
                'icon and colour', onclick: function () {
                    prefs.icons = {};
                    prefs.colors = {};
                    changed();
                }},
            {label: 'Undo changes', title: 'Back to what is saved',
                onclick: function () {
                    prefs = M.parse(saved);
                    changed();
                }}
        ], onSave: function () {
            save();
            return Promise.resolve();
        }}).body.appendChild(body);
        /* (one layout: no "Save & New") */
        Array.prototype.forEach.call(main.querySelectorAll('button'),
            function (b) {
                if (b.textContent === 'Save & New') {
                    b.hidden = true;
                }
            });

        function iconPicker(anchor, menu) {
            closePop();
            var id = String(menu.id);
            var current = M.look(menu, prefs);
            var grid = el('div.ml-grid');
            Object.keys(global.NLineMenuIcons.glyphs).sort().forEach(
                function (glyph) {
                    var b = el('button' + (glyph === current.glyph ? '.on' :
                        ''), {type: 'button', title: glyph.replace(
                        'tryton-', ''), onclick: function () {
                            prefs.icons[id] = glyph;
                            closePop();
                            changed();
                        }}, el('img.ml-icon', {alt: glyph, src:
                            'data:image/svg+xml;charset=utf-8,' +
                            encodeURIComponent(M.svg(glyph, current.colour,
                                current.style))}));
                    grid.appendChild(b);
                });
            var colours = el('div.ml-sw', M.SCHEMES[prefs.scheme].colors
                .map(function (c) {
                    return el('button.ml-swatch', {type: 'button', title: c,
                        style: {background: c}, onclick: function () {
                            prefs.colors[id] = c;
                            closePop();
                            changed();
                        }});
                }));
            pop = el('div.ml-pop', el('div.muted', 'Colour'), colours,
                el('div.muted', {style: {marginTop: '6px'}}, 'Icon'), grid,
                el('div', {style: {marginTop: '8px', textAlign: 'right'}},
                    el('button', {type: 'button', onclick: function () {
                        delete prefs.icons[id];
                        delete prefs.colors[id];
                        closePop();
                        changed();
                    }}, 'Its own icon')));
            document.body.appendChild(pop);
            var r = anchor.getBoundingClientRect();
            pop.style.left = Math.min(r.left, global.innerWidth - 370) + 'px';
            pop.style.top = Math.min(r.bottom + 4, global.innerHeight -
                pop.offsetHeight - 8) + 'px';
        }

        function row(menu, depth) {
            var shown = prefs.hidden.indexOf(menu.id) < 0;
            var box = el('input', {type: 'checkbox', 'aria-label': 'Show ' +
                menu.name, checked: shown, onchange: function () {
                    var at = prefs.hidden.indexOf(menu.id);
                    if (box.checked && at >= 0) {
                        prefs.hidden.splice(at, 1);
                    } else if (!box.checked && at < 0) {
                        prefs.hidden.push(menu.id);
                    }
                    changed();
                }});
            var iconBtn = el('button.ml-iconbtn', {type: 'button', title:
                'Icon and colour', 'aria-label': 'Icon and colour of ' +
                    menu.name, onclick: function (event) {
                    iconPicker(event.currentTarget, menu);
                }}, img(menu, prefs));
            return el('div.ml-row' + (shown ? '' : '.off'), {style: {
                paddingLeft: depth * 18 + 'px'}}, box, iconBtn,
                el('span', menu.name));
        }

        function render() {
            UI.clear(body);
            body.appendChild(el('p.muted', 'Your own menu pane: tick what ' +
                'it lists, pick a colour scheme and an icon style, and click ' +
                'an icon to change it. The menu shows each change at once; ' +
                'Save keeps it on your user, on any computer.'));
            body.appendChild(el('h2', 'Colour scheme'));
            body.appendChild(el('div.ml-schemes', Object.keys(M.SCHEMES)
                .map(function (key) {
                    var s = M.SCHEMES[key];
                    return el('button.ml-scheme' + (prefs.scheme === key ?
                        '.on' : ''), {type: 'button', onclick: function () {
                            prefs.scheme = key;
                            changed();
                        }}, el('b', s.name), el('div.ml-sw', s.colors.slice(0,
                            8).map(function (c) {
                                return el('i', {style: {background: c}});
                            })), el('div.muted', {style: {fontSize: '12px'}},
                            s.note));
                })));
            body.appendChild(el('h2', 'Icon style'));
            body.appendChild(el('div.ml-styles', Object.keys(M.STYLES)
                .map(function (key) {
                    return el('button' + (prefs.style === key ? '.on' : ''), {
                        type: 'button', onclick: function () {
                            prefs.style = key;
                            changed();
                        }}, M.STYLES[key]);
                })));
            body.appendChild(el('h2', 'Menu items'));
            var cols = el('div.ml-cols');
            M.CATEGORIES.forEach(function (cat) {
                var tops = (byParent[0] || []).filter(function (m) {
                    return M.categoryOf(m.name) === cat[0];
                });
                if (!tops.length) {
                    return;
                }
                var tab = el('div.ml-tab', el('h3', cat[0]));
                tops.forEach(function (top) {
                    tab.appendChild(row(top, 0));
                    (function add(parent, depth) {
                        (byParent[parent] || []).forEach(function (m) {
                            tab.appendChild(row(m, depth));
                            if (depth < 2) {
                                add(m.id, depth + 1);
                            }
                        });
                    }(top.id, 1));
                });
                cols.appendChild(tab);
            });
            body.appendChild(cols);
        }

        Promise.all([
            Rpc.model('res.user', 'get_preferences', [false]),
            Rpc.searchRead('ir.ui.menu', [], ['name', 'parent', 'icon'],
                {order: [['sequence', 'ASC'], ['id', 'ASC']]})
        ]).then(function (results) {
            saved = results[0].nline_menu_prefs || null;
            prefs = M.parse(saved);
            menus = results[1];
            menus.forEach(function (m) {
                var parent = m.parent || 0;
                (byParent[parent] = byParent[parent] || []).push(m);
            });
            render();
        }, UI.showError);
        /* Leaving without saving: the menu as saved */
        global.addEventListener('pagehide', function () {
            prefs = M.parse(saved);
            preview();
        });
    };
}(window));
