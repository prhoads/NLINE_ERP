#!/usr/bin/env python3
"""Let Tryton accept the N-Line BI sign-in (module nline_nlbi)

    venv\\Scripts\\python.exe src\\windows\\set_nlbi_sign_in.py <secret>
        [trytond.conf]

Sets in trytond.conf (default G:\\NLINE_ERP\\trytond.conf):

    [session]
    authentications = nlbi,password
    [nlbi]
    secret = <secret>

keeping every other line. The secret is the ERP_SECRET the N-Line BI server's
INSTALL_APP_ONLY_ERP.cmd printed. Restart the ERP afterwards.
"""
import re
import sys

DEFAULT_CONF = r'G:\NLINE_ERP\trytond.conf'


def update(text, values):
    """Return the configuration text with values {(section, option): value}
    set, the other lines unchanged"""
    lines = text.splitlines()
    todo = dict(values)
    section = None
    out = []

    def flush(section):
        for (s, option), value in list(todo.items()):
            if s == section:
                out.append('%s = %s' % (option, value))
                del todo[s, option]

    for line in lines:
        match = re.match(r'^\s*\[([^\]]+)\]\s*$', line)
        if match:
            flush(section)
            section = match.group(1).strip()
            out.append(line)
            continue
        match = re.match(r'^\s*([A-Za-z0-9_]+)\s*[=:]', line)
        if match and (section, match.group(1)) in todo:
            out.append('%s = %s' % (match.group(1),
                    todo.pop((section, match.group(1)))))
            continue
        out.append(line)
    flush(section)
    for s in sorted({s for s, _ in todo}):
        out.extend(['', '[%s]' % s])
        flush(s)
    return '\n'.join(out) + '\n'


def main():
    if len(sys.argv) < 2 or not re.fullmatch(r'[0-9a-f]{32,}', sys.argv[1]):
        sys.exit(__doc__)
    path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_CONF
    with open(path, encoding='utf-8') as fp:
        text = fp.read()
    text = update(text, {
            ('session', 'authentications'): 'nlbi,password',
            ('nlbi', 'secret'): sys.argv[1],
            })
    with open(path, 'w', encoding='utf-8') as fp:
        fp.write(text)
    print("N-Line BI sign-in set in %s: restart the ERP "
        "(stop_nline_erp.ps1 -Restart)" % path)


if __name__ == '__main__':
    main()
