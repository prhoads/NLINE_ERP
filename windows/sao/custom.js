/* Tryton ERP for N-Line Valves: the branding of the Tryton web client
 *
 * The client loads custom.js and custom.css from its folder by design, so the
 * client itself is not changed. This adds the title and tagline, the header of
 * the N-Line BI apps (Apps, Claude, light / dark, name menu: desk/shared) and
 * the one sign-in with the N-Line Desk (both keep the session in the browser).
 */
(function () {
    'use strict';

    document.write(
        '<script src="desk/shared/nline_header.js?v=20261026e"><\/script>');

    Sao.config.title = 'Tryton ERP';

    /* Opened without a database: sign in silently with the last one used by
     * Tryton or the desk when the browser still has its session */
    try {
        var database = localStorage.getItem('nline.desk.database');
        if ((!location.hash || location.hash === '#') && database &&
                localStorage.getItem('sao_session_' + database)) {
            location.hash = '#' + database;
        }
    } catch (e) {
        /* No storage: the sign-in dialog asks */
    }

    var userMenu = Sao.user_menu;
    Sao.user_menu = function (preferences) {
        userMenu.apply(this, arguments);
        var session = Sao.Session.current_session;
        if (!window.NLineHeader || !session) {
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

    jQuery(function () {
        var brand = jQuery('.navbar-brand');
        brand.after(jQuery('<div/>', {
            'id': 'nl-apps',
            'class': 'navbar-text nl-apps-slot'
        }));
        jQuery('#title').after(jQuery('<span/>', {
            'class': 'nl-tagline hidden-xs',
            'text': 'For N-Line Valves'
        }));
        jQuery('#user-preferences').before(jQuery('<li/>', {
            'class': 'nl-right-item'
        }).append(jQuery('<span/>', {'id': 'nl-right'})));
    });
}());
