/* Tryton ERP for N-Line Valves: the branding of the Tryton web client
 *
 * The client loads custom.js and custom.css from its folder by design, so the
 * client itself is not changed. This adds the title and tagline and the
 * header of the N-Line BI apps (Apps, Claude, light / dark, name menu).
 *
 * Two ways to open the ERP:
 * - through the N-Line BI web server, https://nlvrdp01:8765/ERP/ (the usual
 *   way): its one sign-in, saved browser password, Apps menu, name menu and
 *   Claude panel (/server/web/*.js). The client's addresses get the /ERP
 *   prefix and the Tryton sign-in is the N-Line BI one (the BI server signs
 *   it, module nline_nlbi): no Tryton sign-in dialog.
 * - directly on the ERP server, http://nlvdc01:8000/ (when N-Line BI is
 *   down): Tryton's own sign-in, shared with the N-Line Desk, and the same
 *   header from desk/shared/nline_header.js.
 */
(function () {
    'use strict';

    var BASE = location.pathname.replace(/\/[^\/]*$/, '');
    var BEHIND_NLBI = BASE !== '';

    document.write(
        '<script src="desk/shared/nline_header.js?v=20261027b"><\/script>');

    Sao.config.title = 'Tryton ERP';

    if (BEHIND_NLBI) {
        /* The client's absolute addresses ('/' + database + '/') under /ERP */
        var ajax = jQuery.ajax;
        jQuery.ajax = function (url, options) {
            if (typeof url === 'object') {
                options = url;
                url = undefined;
            }
            options = options || {};
            var target = url !== undefined ? url : options.url;
            if (typeof target === 'string' && target.charAt(0) === '/' &&
                    target.indexOf(BASE + '/') !== 0) {
                target = BASE + target;
            }
            if (url !== undefined) {
                return ajax.call(this, target, options);
            }
            options.url = target;
            return ajax.call(this, options);
        };

        /* The N-Line BI sign-in in place of the Tryton dialog: the BI server
         * replaces the parameters of the sign-in with its signed token */
        Sao.Session.get_credentials = function () {
            var dfd = jQuery.Deferred();
            ajax.call(jQuery, {
                url: BASE + '/nlbi/config',
                dataType: 'json'
            }).then(function (config) {
                var session = new Sao.Session(config.database, config.login);
                if (location.hash.replace(/^#!?/, '').split('/', 1)[0] !==
                        config.database) {
                    location.hash = '#' + config.database;
                }
                if (session.session) {
                    dfd.resolve(session);
                } else {
                    session.do_login().then(function () {
                        dfd.resolve(session);
                    }, function () {
                        dfd.reject();
                    });
                }
            }, function () {
                location.href = '/server/login?next=' +
                    encodeURIComponent(location.pathname + location.hash);
                dfd.reject();
            });
            return dfd.promise();
        };
    } else {
        /* Opened without a database: sign in silently with the last one
         * used by Tryton or the desk when the browser still has its session */
        try {
            var database = localStorage.getItem('nline.desk.database');
            if ((!location.hash || location.hash === '#') && database &&
                    localStorage.getItem('sao_session_' + database)) {
                location.hash = '#' + database;
            }
        } catch (e) {
            /* No storage: the sign-in dialog asks */
        }
    }

    var userMenu = Sao.user_menu;
    Sao.user_menu = function (preferences) {
        userMenu.apply(this, arguments);
        var session = Sao.Session.current_session;
        if (BEHIND_NLBI || !window.NLineHeader || !session) {
            return;
        }
        NLineHeader.mount({
            apps: document.getElementById('nl-apps'),
            right: document.getElementById('nl-right'),
            user: {
                /* "Administrator [USD]": the name without the currency */
                name: (preferences.status_bar || session.login).replace(
                    /\s*\[[^\]]*\]\s*$/, ''),
                login: session.login,
                database: session.database
            },
            here: 'erp',
            onPreferences: function () {
                Sao.preferences();
            },
            onSignOut: function () {
                Sao.logout();
            }
        });
    };

    function module(src) {
        var script = document.createElement('script');
        script.type = 'module';
        script.src = src;
        document.head.appendChild(script);
    }

    jQuery(function () {
        jQuery('#title').after(jQuery('<span/>', {
            'class': 'nl-tagline hidden-xs',
            'text': 'For N-Line Valves'
        }));
        var apps = jQuery('<div/>', {
            'id': 'nl-apps',
            'class': 'navbar-text nl-apps-slot'
        });
        jQuery('.navbar-brand').after(apps);
        var right = jQuery('<span/>', {'id': 'nl-right'});
        jQuery('#user-preferences').before(jQuery('<li/>', {
            'class': 'nl-right-item'
        }).append(right));
        if (BEHIND_NLBI) {
            /* The N-Line BI drop-ins, as in every N-Line BI app: Apps right
             * after the name, then Claude, light / dark and the name menu */
            apps.append(jQuery('<span/>', {
                'id': 'apps-slot',
                'data-btn-class': 'nl-btn'
            }));
            right.addClass('nl-right');
            right.append(jQuery('<span/>', {
                'id': 'claude-slot',
                'data-app': 'Tryton ERP',
                'data-btn-class': 'nl-btn'
            }));
            var theme = jQuery('<button/>', {
                'type': 'button',
                'class': 'nl-btn nl-theme'
            });
            var paint = function () {
                var dark = window.NLineHeader && NLineHeader.isDark();
                theme.text(dark ? '☀' : '☾')
                    .attr('title', dark ? 'Switch to light' :
                        'Switch to dark')
                    .attr('aria-label', dark ? 'Switch to light' :
                        'Switch to dark');
            };
            theme.click(function () {
                NLineHeader.setTheme(NLineHeader.isDark() ? 'light' : 'dark');
                paint();
            });
            paint();
            right.append(theme);
            /* "Settings..." of the name menu: the Tryton preferences */
            right.append(jQuery('<button/>', {
                'type': 'button',
                'id': 'nl-preferences',
                'hidden': 'hidden'
            }).click(function () {
                Sao.preferences();
            }));
            right.append(jQuery('<span/>', {
                'id': 'who-slot',
                'data-settings': '#nl-preferences'
            }));
            module('/server/web/apps_menu.js');
            module('/server/web/claude_panel.js');
            module('/server/web/name_menu.js');
        }
    });
}());
