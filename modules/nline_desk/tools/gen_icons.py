"""Generate the N-Line menu icons: a tile in the colour of its Jobshop area
with a white symbol (icons/nline-*.svg) and their ir.ui.icon records
(icons.xml).

    python tools/gen_icons.py

The Tryton web client sets the fill of an icon's <svg> to its one theme
colour; every shape here carries its own fill, so the tiles keep their
colours. The areas' colours are in AREAS; the menus pick an icon by name
(nline_desk/tools/gen_menus.py, nline_jobshop/tools/gen_menus.py).
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE = os.path.dirname(HERE)
MODULES = os.path.dirname(MODULE)
OUT = os.path.join(MODULE, 'icons')
SAO = os.path.join(os.path.dirname(MODULES), 'windows', 'sao', 'images')

# The colour of each area: (top, bottom) of the tile's gradient
AREAS = {
    'home': ('#f2862e', '#d9600a'),         # N-Line orange
    'inventory': ('#f5b43c', '#d98a06'),    # amber
    'engineering': ('#4f8ef7', '#1d5fd1'),  # blue
    'estimating': ('#9b6cf0', '#6d3fd0'),   # violet
    'sales': ('#34c46c', '#14924a'),        # green
    'purchasing': ('#22b8d6', '#0b85a4'),   # cyan
    'planning': ('#7279f0', '#4248c9'),     # indigo
    'shopfloor': ('#f06060', '#c62828'),    # red
    'accounting': ('#2bb59a', '#0e7d68'),   # emerald
    'common': ('#8a97a8', '#5c6878'),       # slate
    'executive': ('#e6b422', '#b88600'),    # gold
    'admin': ('#5f6f86', '#39475c'),        # steel
    'customers': ('#3fbf7f', '#18915a'),    # QuickBooks side
    'vendors': ('#f39a4b', '#cf6b16'),
    'banking': ('#4a7bd0', '#244f9e'),
    'company': ('#5aa6a0', '#2f746f'),
}

# Symbols (24 x 24): Material Design paths (Apache 2.0, as in Tryton's own
# icons) and N-Line's own (valve)
GLYPHS = {
    'home': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'box': 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4l16-.02V7z',
    'ruler': 'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v4h2V8h2v4h2V8h2v4h2V8h2v4h2V8h2v8z',
    'swap': 'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
    'place': 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    'tune': 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    'report': 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
    'tree': 'M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z',
    'wrench': 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
    'calc': 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5.97 4.06L14.09 6l1.41 1.41L16.91 6l1.06 1.06-1.41 1.41 1.41 1.41-1.06 1.06-1.41-1.4-1.41 1.41-1.06-1.06 1.41-1.41-1.41-1.42zm-6.78.66h5v1.5h-5v-1.5zM11.5 16h-2v2H8v-2H6v-1.5h2v-2h1.5v2h2V16zm6.5 1.25h-5v-1.5h5v1.5zm0-2.5h-5v-1.5h5v1.5z',
    'doc': 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    'people': 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    'person': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    'shield': 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
    'trend': 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
    'clock': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    'receipt': 'M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20z',
    'tag': 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
    'list': 'M3 14h4v-4H3v4zm0 5h4v-4H3v4zM3 9h4V5H3v4zm5 5h13v-4H8v4zm0 5h13v-4H8v4zM8 5v4h13V5H8z',
    'grid': 'M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-7h5V5h-5v6zm6-6v6h5V5h-5z',
    'bell': 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
    'map': 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
    'flag': 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
    'percent': 'M7.5 11C9.43 11 11 9.43 11 7.5S9.43 4 7.5 4 4 5.57 4 7.5 5.57 11 7.5 11zm0-5C8.33 6 9 6.67 9 7.5S8.33 9 7.5 9 6 8.33 6 7.5 6.67 6 7.5 6zM4 18.58L18.59 4l1.41 1.41L5.42 20zM16.5 13c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zm0 5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    'touch': 'M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z',
    'sliders': 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2z',
    'gauge': 'M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z',
    'card': 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
    'check': 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
    'factory': 'M22 22H2V10l7-3v2l5-2v3h3l1-8h3l1 8v12zM12 9.95l-5 2V10l-3 1.32V20h16v-8h-8V9.95zM11 18h2v-4h-2v4zm-4 0h2v-4H7v4zm10-4h-2v4h2v-4z',
    # A gate valve: hand wheel, stem, bonnet, body with flanges
    'valve': 'M7 2h10v2h-4v2h2v3h-2v2h3l3-2h2v8h-2l-3-2H8l-3 2H3v-8h2l3 2h3V9H9V6h2V4H7z',
}

# Tryton's own symbols reused (sao images or module icons)
TRYTON = ['tryton-stock', 'tryton-product', 'tryton-production',
    'tryton-purchase', 'tryton-sale', 'tryton-party', 'tryton-account',
    'tryton-bank', 'tryton-currency', 'tryton-invoice', 'tryton-payment',
    'tryton-carrier', 'tryton-company', 'tryton-country', 'tryton-timesheet',
    'tryton-shipment-in', 'tryton-shipment-out', 'tryton-quality',
    'tryton-project', 'tryton-date', 'tryton-print', 'tryton-email',
    'tryton-search', 'tryton-public', 'tryton-note', 'tryton-star',
    'tryton-history', 'tryton-barcode-scanner', 'tryton-export',
    'tryton-import', 'tryton-question', 'tryton-send', 'tryton-link',
    'tryton-archive']

# The icons: name: (area, symbol)
ICONS = {}


def tryton_paths(name):
    "The <path d> of a Tryton icon, without its empty frame"
    for folder in [SAO] + [os.path.join(MODULES, m, 'icons')
            for m in os.listdir(MODULES)]:
        path = os.path.join(folder, name + '.svg')
        if os.path.exists(path):
            svg = open(path, encoding='utf-8').read()
            return [d for d in re.findall(r'<path[^>]* d="([^"]+)"', svg)
                if d not in ('M0 0h24v24H0z', 'M0 0h24v24H0V0z')]
    raise SystemExit('No Tryton icon %s' % name)


def symbol(name):
    if name in GLYPHS:
        return [GLYPHS[name]]
    return tryton_paths(name)


# Each icon its own look (the owner's choice, 28 Oct 2026): a palette of
# today's interior colours (sage, terracotta, clay, ochre, navy, dusty blue,
# olive, plum, rose clay, walnut, brass, charcoal) and three tile styles,
# picked per icon so no two neighbours look alike. AREAS stays for the names.
PALETTE = ['#8a9a7b', '#c46a4a', '#b5835a', '#c9a04a', '#2f3e5c', '#6e8ca8',
    '#6b7046', '#6e4a5e', '#c98e86', '#6b4f3a', '#b08d57', '#3d3f42',
    '#4f6b5e', '#a65d57']
STYLES = ['solid', 'soft', 'ring']


def look(name):
    "The colour and style of an icon: steady for a name, varied across"
    order = sorted(ICONS) or [name]
    index = order.index(name) if name in order else sum(map(ord, name))
    colour = PALETTE[(index * 5) % len(PALETTE)]
    style = STYLES[(index // len(PALETTE) + index) % len(STYLES)]
    return colour, style


def tint(colour, amount):
    "The colour mixed with white (amount 0..1 of white)"
    rgb = [int(colour[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(c + (255 - c) * amount)
        for c in rgb)


def svg(name, glyph):
    colour, style = look(name)
    if style == 'solid':
        tile = ('<rect x="0.5" y="0.5" width="23" height="23" rx="6" '
            'fill="%s"/>' % colour)
        ink = '#ffffff'
    elif style == 'soft':
        tile = ('<rect x="0.5" y="0.5" width="23" height="23" rx="6" '
            'fill="%s"/>' % tint(colour, 0.78))
        ink = colour
    else:
        tile = ('<rect x="1.25" y="1.25" width="21.5" height="21.5" rx="6" '
            'fill="#ffffff" stroke="%s" stroke-width="1.5"/>' % colour)
        ink = colour
    paths = ''.join('<path fill="%s" d="%s"/>' % (ink, d)
        for d in symbol(glyph))
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" '
        'viewBox="0 0 24 24">%s<g transform="translate(4.2 4.2) '
        'scale(0.65)">%s</g></svg>' % (tile, paths)) + chr(10)


def icon(area, glyph):
    "The name of the icon of this area and symbol (made on generate)"
    name = 'nline-%s-%s' % (area, glyph.replace('tryton-', ''))
    ICONS[name] = (area, glyph)
    return name


def generate():
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.startswith('nline-'):
            os.remove(os.path.join(OUT, old))
    records = []
    for name, (area, glyph) in sorted(ICONS.items()):
        open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8',
            newline='\n').write(svg(name, glyph))
        records.append('''        <record model="ir.ui.icon" id="icon_%s">
            <field name="name">%s</field>
            <field name="path">icons/%s.svg</field>
        </record>
''' % (name.replace('-', '_'), name, name))
    open(os.path.join(MODULE, 'icons.xml'), 'w', encoding='utf-8',
        newline='\n').write('''<?xml version="1.0"?>
<!-- This file is part of Tryton.  The COPYRIGHT file at the top level of
this repository contains the full copyright notices and license terms. -->
<!-- Generated by tools/gen_icons.py: the N-Line menu icons -->
<tryton>
    <data>
%s    </data>
</tryton>
''' % ''.join(records))
    return len(records)


def all_icons():
    "Every icon the menus use (both menu generators declare theirs)"
    import runpy
    for tool in [os.path.join(HERE, 'gen_menus.py'), os.path.join(MODULES,
                'nline_jobshop', 'tools', 'gen_menus.py')]:
        icons = runpy.run_path(tool).get('ICONS_USED', {})
        ICONS.update(icons)


if __name__ == '__main__':
    all_icons()
    print('icons.xml: %d icons' % generate())
