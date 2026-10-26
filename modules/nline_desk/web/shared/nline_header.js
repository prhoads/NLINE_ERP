/* Tryton ERP for N-Line Valves: the header pieces shared by the Tryton web
 * client (custom.js) and the N-Line Desk, the same as in the N-Line BI apps:
 * the Apps menu right after the name, then on the right the Claude button,
 * the light / dark switch and the name menu.
 *
 *   NLineHeader.mount({
 *       apps: <element the Apps button goes in>,
 *       right: <element the Claude button, theme switch and name menu go in>,
 *       user: {name, login, database},
 *       here: 'erp' | 'desk',
 *       onPreferences: function () {...},   (optional)
 *       onSignOut: function () {...}
 *   });
 *
 * The ERP runs on NLVDC01 and must work without nlvrdp01: the N-Line BI apps
 * and Claude only open in new tabs on the N-Line BI server.
 */
(function (global) {
    'use strict';

    var doc = global.document;
    var BI_URL = global.NLINE_BI_URL || 'https://nlvrdp01:8765';
    var THEME_KEY = 'nline.theme';
    var DB_KEY = 'nline.desk.database';

    var CSS = [
        '.nl-btn{font:inherit;font-size:13px;cursor:pointer;border:1px solid transparent;background:none;',
        '  color:inherit;padding:5px 10px;border-radius:6px;white-space:nowrap;line-height:1.4}',
        '.nl-btn:hover{border-color:currentColor}',
        '.nl-who::before{content:"\\25CF  ";color:#2f9e5f}',
        '.nl-who{font-size:12px;opacity:.9}',
        '.nl-pop{position:fixed;z-index:9000;min-width:240px;padding:6px;border-radius:8px;',
        '  background:var(--nl-pop-bg,#fff);color:var(--nl-pop-ink,#1d2421);border:1px solid var(--nl-pop-line,#d9dfdc);',
        '  box-shadow:0 6px 24px rgba(0,0,0,.14);font:14px/1.4 system-ui,"Segoe UI",sans-serif;text-align:left}',
        '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .nl-pop{--nl-pop-bg:#202327;--nl-pop-ink:#e8e9eb;--nl-pop-line:#33373d;--nl-pop-soft:#1f2b27}}',
        ':root[data-theme="dark"] .nl-pop{--nl-pop-bg:#202327;--nl-pop-ink:#e8e9eb;--nl-pop-line:#33373d;--nl-pop-soft:#1f2b27}',
        '.nl-pop a,.nl-pop button{display:block;width:100%;box-sizing:border-box;text-align:left;border:0;background:none;',
        '  padding:6px 10px;color:inherit;text-decoration:none;border-radius:5px;font:inherit;cursor:pointer}',
        '.nl-pop a:hover,.nl-pop button:hover{background:var(--nl-pop-soft,#eef4f1);text-decoration:none;color:inherit}',
        '.nl-pop a.here{font-weight:600}',
        '.nl-pop small{display:block;opacity:.65;font-size:12px}',
        '.nl-pop hr{border:0;border-top:1px solid var(--nl-pop-line,#d9dfdc);margin:4px 0}',
        '.nl-pop .head{padding:4px 10px 6px;opacity:.65;font-size:11.5px;font-family:ui-monospace,Consolas,monospace}',
        '.nl-pop .group{padding:6px 10px 2px;opacity:.6;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}',
        '.nl-pop .themes{display:flex;gap:4px;padding:2px 6px}',
        '.nl-pop .themes button{flex:1;text-align:center;border:1px solid var(--nl-pop-line,#d9dfdc);padding:4px 6px}',
        '.nl-pop .themes button[aria-pressed="true"]{border-color:#2f9e5f;font-weight:600}',
        '.nl-right{display:inline-flex;align-items:center;gap:4px}'
    ].join('\n');

    function storage(method, key, value) {
        try {
            return global.localStorage[method](key, value);
        } catch (e) {
            return null;
        }
    }

    /* Light / dark: '' follows the system, as in the N-Line BI apps */
    function theme() {
        return storage('getItem', THEME_KEY) || '';
    }

    function applyTheme(value) {
        if (value) {
            doc.documentElement.setAttribute('data-theme', value);
        } else {
            doc.documentElement.removeAttribute('data-theme');
        }
    }

    function setTheme(value) {
        storage('setItem', THEME_KEY, value);
        applyTheme(value);
    }

    function isDark() {
        var value = theme();
        if (value) {
            return value === 'dark';
        }
        return global.matchMedia &&
            global.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    applyTheme(theme());

    var style = null;

    /* The button and menu styles: also used by the pages that show the
     * N-Line BI drop-ins instead of these menus */
    function ensureStyle() {
        if (style) {
            return;
        }
        style = doc.createElement('style');
        style.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(style);
    }
    ensureStyle();

    function esc(text) {
        return String(text === null || text === undefined ? '' : text)
            .replace(/[&<>"']/g, function (c) {
                return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
                    "'": '&#39;'}[c];
            });
    }

    function apps(database) {
        return [
            {key: 'erp', title: 'Tryton ERP', note: 'the full ERP',
                path: '/#' + encodeURIComponent(database || '')},
            {group: 'N-Line BI'},
            {key: 'acct', title: 'Accounting', path: BI_URL + '/Acct/'},
            {key: 'bom', title: 'BOM Tool', path: BI_URL + '/bom/'},
            {key: 'ops', title: 'Operations', path: BI_URL + '/Ops/'},
            {key: 'sales', title: 'Sales', path: BI_URL + '/Sales/'},
            {key: 'qhse', title: 'QHSE', path: BI_URL + '/QHSE/'},
            {key: 'asst', title: 'Assistant', path: BI_URL + '/Asst/'}
        ];
    }

    var popups = [];
    var listening = false;

    function popup(button, html, align) {
        var box = doc.createElement('div');
        box.className = 'nl-pop';
        box.setAttribute('role', 'menu');
        box.hidden = true;
        box.innerHTML = html;
        doc.body.appendChild(box);
        popups.push(box);
        button.setAttribute('aria-haspopup', 'true');
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            var open = box.hidden;
            popups.forEach(function (other) {
                other.hidden = true;
            });
            if (!open) {
                return;
            }
            box.hidden = false;
            var rect = button.getBoundingClientRect();
            box.style.top = (rect.bottom + 4) + 'px';
            var left = align === 'right' ? rect.right - box.offsetWidth :
                rect.left;
            box.style.left = Math.max(4, Math.min(left,
                global.innerWidth - box.offsetWidth - 4)) + 'px';
        });
        return box;
    }

    function closeAll() {
        popups.forEach(function (box) {
            box.hidden = true;
        });
    }

    function mount(options) {
        ensureStyle();
        if (!listening) {
            listening = true;
            doc.addEventListener('mousedown', function (event) {
                if (!popups.some(function (box) {
                    return box.contains(event.target);
                })) {
                    closeAll();
                }
            });
            doc.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') {
                    closeAll();
                }
            });
        }
        popups.forEach(function (box) {
            box.remove();
        });
        popups = [];
        var user = options.user || {};
        if (user.database) {
            storage('setItem', DB_KEY, user.database);
        }

        /* Apps */
        if (options.apps) {
            options.apps.innerHTML = '';
            var appsButton = doc.createElement('button');
            appsButton.type = 'button';
            appsButton.className = 'nl-btn nl-apps';
            appsButton.title = 'Open another app';
            appsButton.textContent = 'Apps ▾';
            options.apps.appendChild(appsButton);
            var html = apps(user.database).map(function (app) {
                if (app.group) {
                    return '<hr><div class="group">' + esc(app.group) +
                        '</div>';
                }
                var here = app.key === options.here;
                return '<a role="menuitem" href="' + esc(app.path) + '"' +
                    (here ? ' class="here"' : ' target="_blank" rel="noopener"') +
                    '>' + esc(app.title) + (here ? ' ✓' : '') +
                    (app.note ? '<small>' + esc(app.note) + '</small>' : '') +
                    '</a>';
            }).join('');
            var appsBox = popup(appsButton, html, 'left');
            appsBox.addEventListener('click', function (event) {
                var link = event.target.closest('a');
                if (link && link.classList.contains('here')) {
                    event.preventDefault();
                }
                closeAll();
            });
        }

        /* Claude, light / dark, name menu */
        var right = options.right;
        right.innerHTML = '';
        right.classList.add('nl-right');

        var claude = doc.createElement('button');
        claude.type = 'button';
        claude.className = 'nl-btn nl-claude';
        claude.textContent = '✦ Claude';
        claude.title = 'Claude Code on the development PC ' +
            '(opens in N-Line BI; tell it you are in the Tryton ERP)';
        claude.addEventListener('click', function () {
            global.open(BI_URL + '/Asst/', '_blank', 'noopener');
        });
        right.appendChild(claude);

        var toggle = doc.createElement('button');
        toggle.type = 'button';
        toggle.className = 'nl-btn nl-theme';
        var paint = function () {
            toggle.textContent = isDark() ? '☀' : '☾';
            toggle.title = isDark() ? 'Switch to light' : 'Switch to dark';
            toggle.setAttribute('aria-label', toggle.title);
        };
        paint();
        toggle.addEventListener('click', function () {
            setTheme(isDark() ? 'light' : 'dark');
            paint();
            refreshThemes();
        });
        right.appendChild(toggle);

        var who = doc.createElement('button');
        who.type = 'button';
        who.className = 'nl-btn nl-who';
        who.textContent = user.name || user.login || '';
        who.title = 'Signed in as ' + (user.name || '') + ' (' +
            (user.login || '') + ') - account menu';
        right.appendChild(who);
        var whoBox = popup(who,
            '<div class="head">' + esc(user.name) + ' (' + esc(user.login) +
            ')' + (user.database ? ' · ' + esc(user.database) : '') +
            '</div>' +
            (options.onPreferences ?
                '<button type="button" data-prefs>Preferences…</button>' :
                '') +
            '<div class="group">Theme</div><div class="themes">' +
            '<button type="button" data-theme-value="">System</button>' +
            '<button type="button" data-theme-value="light">Light</button>' +
            '<button type="button" data-theme-value="dark">Dark</button>' +
            '</div><hr><button type="button" data-out>Sign out</button>',
            'right');

        function refreshThemes() {
            Array.prototype.forEach.call(
                whoBox.querySelectorAll('[data-theme-value]'), function (b) {
                    b.setAttribute('aria-pressed', String(
                        b.getAttribute('data-theme-value') === theme()));
                });
        }
        refreshThemes();
        whoBox.addEventListener('click', function (event) {
            var target = event.target.closest('button');
            if (!target) {
                return;
            }
            if (target.hasAttribute('data-theme-value')) {
                setTheme(target.getAttribute('data-theme-value'));
                refreshThemes();
                paint();
                return;
            }
            closeAll();
            if (target.hasAttribute('data-prefs')) {
                options.onPreferences();
            } else if (target.hasAttribute('data-out')) {
                options.onSignOut();
            }
        });
    }

    global.NLineHeader = {
        mount: mount,
        theme: theme,
        setTheme: setTheme,
        isDark: isDark,
        lastDatabase: function () {
            return storage('getItem', DB_KEY);
        }
    };
}(window));
