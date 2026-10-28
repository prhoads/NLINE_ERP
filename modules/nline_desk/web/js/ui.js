/* N-Line Desk: small UI helpers shared by the screens */
(function (global) {
    'use strict';

    var doc = global.document;

    /* el('div.class#id', {attr: value, onclick: fn}, children...) */
    function el(spec, attrs) {
        var parts = spec.split(/(?=[.#])/);
        var node = doc.createElement(parts[0] || 'div');
        parts.slice(1).forEach(function (part) {
            if (part[0] === '.') {
                node.classList.add(part.slice(1));
            } else if (part[0] === '#') {
                node.id = part.slice(1);
            }
        });
        var children = Array.prototype.slice.call(arguments, 2);
        if (attrs && (typeof attrs !== 'object' || attrs.nodeType ||
                    Array.isArray(attrs))) {
            children.unshift(attrs);
            attrs = null;
        }
        Object.keys(attrs || {}).forEach(function (key) {
            var value = attrs[key];
            if (value === null || value === undefined || value === false) {
                return;
            }
            if (key.slice(0, 2) === 'on') {
                node.addEventListener(key.slice(2), value);
            } else if (key === 'style' && typeof value === 'object') {
                Object.keys(value).forEach(function (name) {
                    node.style[name] = value[name];
                });
            } else if (key === 'value') {
                node.value = value;
            } else if (key === 'checked') {
                node.checked = !!value;
            } else if (key === 'dataset') {
                Object.keys(value).forEach(function (name) {
                    node.dataset[name] = value[name];
                });
            } else {
                node.setAttribute(key, value === true ? '' : value);
            }
        });
        append(node, children);
        return node;
    }

    function append(node, children) {
        children.forEach(function (child) {
            if (child === null || child === undefined || child === false) {
                return;
            }
            if (Array.isArray(child)) {
                append(node, child);
            } else if (child.nodeType) {
                node.appendChild(child);
            } else {
                node.appendChild(doc.createTextNode(String(child)));
            }
        });
    }

    function clear(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
        return node;
    }

    var moneyFormat = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2});

    function money(value, symbol) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        var text = moneyFormat.format(Math.abs(value));
        return (value < 0 ? '-' : '') + (symbol ? '$' : '') + text;
    }

    function parseMoney(text) {
        if (typeof text === 'number') {
            return text;
        }
        var value = parseFloat(String(text || '').replace(/[$,\s]/g, ''));
        return isNaN(value) ? 0 : Math.round(value * 100) / 100;
    }

    function today() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,
            '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function addDays(iso, days) {
        var d = new Date(iso + 'T12:00:00');
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function date(iso) {
        if (!iso) {
            return '';
        }
        var p = String(iso).slice(0, 10).split('-');
        return p[1] + '/' + p[2] + '/' + p[0];
    }

    var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
        'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
        'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty',
        'Seventy', 'Eighty', 'Ninety'];
    var SCALES = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'],
        [1000, 'Thousand'], [100, 'Hundred']];

    function words(n) {
        if (n < 20) {
            return ONES[n];
        }
        if (n < 100) {
            return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] :
                '');
        }
        for (var i = 0; i < SCALES.length; i++) {
            var scale = SCALES[i][0];
            if (n >= scale) {
                var rest = n % scale;
                return words(Math.floor(n / scale)) + ' ' + SCALES[i][1] +
                    (rest ? ' ' + words(rest) : '');
            }
        }
        return '';
    }

    /* The amount as written on a check, like the printed one */
    function amountWords(amount) {
        amount = Math.round((amount || 0) * 100);
        var dollars = Math.floor(amount / 100);
        var cents = amount % 100;
        return (dollars ? words(dollars) : 'Zero') + ' and ' +
            String(cents).padStart(2, '0') + '/100';
    }

    function toast(message, kind) {
        /* In a Tryton tab the message is shown by Tryton too: the tab may
         * close at once (Save & Close) */
        if (global.parent !== global && global.Screens &&
                global.Screens.embedded) {
            global.parent.postMessage({nline: 'toast', message:
                String(message), kind: kind || ''}, global.location.origin);
            return;
        }
        var box = doc.getElementById('toasts');
        var item = el('div.toast' + (kind ? '.' + kind : ''), message);
        box.appendChild(item);
        global.setTimeout(function () {
            item.classList.add('gone');
            global.setTimeout(function () {
                item.remove();
            }, 400);
        }, kind === 'error' ? 8000 : 3500);
    }

    /* modal(title, body nodes, buttons [{label, primary, onclick}]) */
    function modal(title, body, buttons) {
        var overlay = el('div.overlay');
        var close = function () {
            overlay.remove();
        };
        var box = el('div.modal', {role: 'dialog', 'aria-label': title},
            el('div.modal-title', title),
            el('div.modal-body', body),
            el('div.modal-buttons', (buttons || [{label: 'OK',
                    primary: true}]).map(function (button) {
                return el('button' + (button.primary ? '.primary' : ''), {
                    type: 'button',
                    onclick: function () {
                        var keep = button.onclick && button.onclick(close);
                        if (keep !== true) {
                            close();
                        }
                    }
                }, button.label);
            })));
        overlay.appendChild(box);
        doc.body.appendChild(overlay);
        var first = box.querySelector('input, select, button.primary');
        if (first) {
            first.focus();
        }
        return close;
    }

    function confirm(title, message) {
        return new Promise(function (resolve) {
            modal(title, el('p', message), [
                {label: 'Cancel', onclick: function () {
                    resolve(false);
                }},
                {label: 'Continue', primary: true, onclick: function () {
                    resolve(true);
                }}
            ]);
        });
    }

    function showError(error) {
        if (error && error.type === 'session') {
            global.location.hash = '#/login';
        }
        var message = error && error.message ? error.message : String(error);
        if (error && error.type === 'server' && /nline\./.test(message)) {
            /* A KeyError on an N-Line model: the module is not activated */
            var session = global.Rpc.session();
            message = 'The N-Line modules are not activated in database "' +
                (session ? session.database : '') + '". Sign out and ' +
                'choose the database where they are (nline_test).';
            error = {message: message};
        }
        var description = error && error.description ? error.description :
            '';
        modal(error && error.type === 'user' ? 'Cannot save' : 'Error',
            [el('p', message), description ? el('p.muted', description) :
                null]);
    }

    /* Run a desk service; a Tryton warning is shown and, when the user
     * accepts it, the call is sent again with accept_warnings */
    function service(method, values, extra) {
        return global.Rpc.desk(method, [values].concat(extra || []))
            .catch(function (error) {
                if (error.type !== 'warning') {
                    throw error;
                }
                return confirm('Warning', error.message).then(function (ok) {
                    if (!ok) {
                        throw {cancelled: true};
                    }
                    var accepted = Object.assign({}, values,
                        {accept_warnings: true});
                    return global.Rpc.desk(method, [accepted].concat(
                        extra || []));
                });
            });
    }

    /* Autocomplete input on a model: returns {node, value(), set(id, name)}
     * options: domain, placeholder, onselect(record), fields */
    /* What a field shows of its record, as Jobshop's ID fields: a part its
     * Part ID ("[332-...] Assy..." -> "332-..."), a master "Part ID / Eng ID",
     * a code table its ID; the full name in the field's tooltip */
    var CODE_TABLES = ['nline.fob_point', 'nline.ship_via',
        'nline.product_code', 'nline.commodity_code', 'nline.reason_code',
        'nline.sales_rep', 'nline.territory', 'nline.sic_code',
        'nline.carrier', 'nline.service_charge', 'nline.sales_tax_group',
        'nline.discount_class'];
    function shortName(model, name) {
        name = name || '';
        var match;
        if (model === 'product.product' || model === 'product.template') {
            match = /^\[([^\]]+)\]/.exec(name);
            return match ? match[1] : name;
        }
        if (model === 'production.bom') {
            match = /^(\S+)[\s\S]*?(?:\sRev\s+(\S+))?$/.exec(name);
            return match ? match[1] + (match[2] ? ' / ' + match[2] : '') :
                name;
        }
        if (CODE_TABLES.indexOf(model) >= 0 && name.indexOf(' - ') > 0) {
            return name.slice(0, name.indexOf(' - '));
        }
        return name;
    }

    function picker(model, options) {
        options = options || {};
        var selected = null;
        var input = el('input', {type: 'text', autocomplete: 'off',
            placeholder: options.placeholder || '', 'aria-label':
                options.label || options.placeholder || model});
        var list = el('div.picker-list');
        /* "..." (or F9): the full lookup with wildcards (frame.js) */
        var more = el('button.picker-browse', {type: 'button', tabindex: -1,
            title: 'Look up (F9)', 'aria-label': 'Look up', onclick:
                function () {
                    lookup();
                }}, '…');
        var wrap = el('div.picker', input, list, more);

        function lookup() {
            if (!global.UI.browse) {
                return;
            }
            global.UI.browse(model, {title: options.label || options.placeholder,
                domain: options.domain, order: options.order}).then(
                function (record) {
                    /* With the fields the screen needs (e.g. the terms) */
                    global.Rpc.searchRead(model, [['id', '=', record.id]],
                        ['rec_name'].concat(options.fields || [])).then(
                        function (rows) {
                            choose(rows[0] || record);
                            input.focus();
                        }, showError);
                }, function () {
                    input.focus();
                });
        }
        var timer = null;
        var active = -1;
        var items = [];

        function render() {
            clear(list);
            /* Fixed so a scrolling table does not clip the list */
            var rect = input.getBoundingClientRect();
            list.style.position = 'fixed';
            list.style.left = rect.left + 'px';
            list.style.top = rect.bottom + 'px';
            list.style.width = Math.max(rect.width, 260) + 'px';
            items.forEach(function (record, index) {
                list.appendChild(el('div.picker-item' +
                    (index === active ? '.active' : ''), {
                    onmousedown: function (event) {
                        event.preventDefault();
                        choose(record);
                    }
                }, record.rec_name, record.extra ?
                    el('span.muted', ' ' + record.extra) : null));
            });
            list.style.display = items.length ? 'block' : 'none';
        }

        function show(name) {
            input.value = shortName(model, name);
            input.title = input.value !== (name || '') ? name : '';
        }

        function choose(record) {
            selected = record;
            show(record.rec_name);
            items = [];
            render();
            if (options.onselect) {
                options.onselect(record);
            }
        }

        function search() {
            var text = input.value.trim();
            var domain = (options.domain || []).slice();
            pending = false;
            if (text) {
                domain.push(['rec_name', 'ilike', '%' + text + '%']);
            }
            return global.Rpc.searchRead(model, domain, ['rec_name'].concat(
                options.fields || []), {limit: 12, order: options.order})
                .then(function (records) {
                    items = records.map(function (record) {
                        if (options.extra) {
                            record.extra = options.extra(record);
                        }
                        return record;
                    });
                    active = items.length ? 0 : -1;
                    render();
                }, showError);
        }

        var pending = false;
        input.addEventListener('input', function () {
            selected = null;
            pending = true;
            global.clearTimeout(timer);
            timer = global.setTimeout(search, 180);
        });
        input.addEventListener('focus', function () {
            if (!input.value) {
                search();
            }
        });
        input.addEventListener('blur', function () {
            global.setTimeout(function () {
                items = [];
                render();
            }, 150);
        });
        input.addEventListener('keydown', function (event) {
            if (event.key === 'F9') {
                event.preventDefault();
                lookup();
                return;
            }
            if (event.key === 'Enter' && pending) {
                /* Typed faster than the search: search now, take the first */
                event.preventDefault();
                global.clearTimeout(timer);
                search().then(function () {
                    if (items.length) {
                        choose(items[0]);
                    }
                });
                return;
            }
            if (!items.length) {
                return;
            }
            if (event.key === 'ArrowDown') {
                active = Math.min(active + 1, items.length - 1);
                render();
                event.preventDefault();
            } else if (event.key === 'ArrowUp') {
                active = Math.max(active - 1, 0);
                render();
                event.preventDefault();
            } else if (event.key === 'Enter' && active >= 0) {
                choose(items[active]);
                event.preventDefault();
            }
        });
        return {
            node: wrap,
            input: input,
            value: function () {
                return selected ? selected.id : null;
            },
            record: function () {
                return selected;
            },
            set: function (id, name) {
                selected = id ? {id: id, rec_name: name} : null;
                show(name);
            }
        };
    }

    function moneyInput(attrs) {
        var input = el('input.money', Object.assign({type: 'text',
            inputmode: 'decimal'}, attrs || {}));
        input.addEventListener('blur', function () {
            if (input.value !== '') {
                input.value = money(parseMoney(input.value));
            }
        });
        return input;
    }

    function openReport(result, title) {
        /* result: [ext, {base64}, direct_print, name] */
        var ext = result[0];
        var data = result[1];
        if (data && data.base64 !== undefined) {
            /* Binary reports (PDF, ODT) */
            var content = global.atob(data.base64);
            data = new Uint8Array(content.length);
            for (var i = 0; i < content.length; i++) {
                data[i] = content.charCodeAt(i);
            }
        }
        var type = ext === 'html' ? 'text/html;charset=utf-8' : ext === 'pdf' ?
            'application/pdf' : 'application/octet-stream';
        var url = global.URL.createObjectURL(new Blob([data], {type: type}));
        var opened = global.open(url, '_blank');
        if (!opened) {
            toast((title || 'Report') + ' blocked by the browser: allow ' +
                'pop-ups for this site.', 'error');
        }
    }

    global.UI = {
        el: el,
        clear: clear,
        money: money,
        parseMoney: parseMoney,
        today: today,
        addDays: addDays,
        date: date,
        amountWords: amountWords,
        toast: toast,
        modal: modal,
        confirm: confirm,
        showError: showError,
        service: service,
        picker: picker,
        shortName: shortName,
        moneyInput: moneyInput,
        openReport: openReport
    };
}(window));
