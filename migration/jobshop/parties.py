"""One party per Jobshop customer / supplier (step js_parties).

A step run on its own (purchases, the suppliers' prices...) did not find
the party made for a Jobshop ID and made a second one: numbered (Tryton's
sequence) and named like the first, or named by the Jobshop ID itself. The
documents then show "19" where Jobshop shows LIGHTNING. Each such duplicate
is replaced by the party of the Jobshop ID with Tryton's Replace Party
(every document moves to it; the duplicate is deactivated).

Re-runnable: a replaced party is inactive and not looked at again."""

import re

from proteus import Wizard

from nline_migrate import log, norm

NUMBERED = re.compile(r'^\d+$')


def run(m):
    Party = m.get('party.party')
    Company = m.get('company.company')
    Warning = m.get('res.user.warning')
    user = m.get('res.user')(m.context.get('user') or
        m.config.user)
    companies = {c.party.id for c in Company.find([])}
    parties = Party.find([])
    by_name, by_code = {}, {}
    for party in parties:
        if party.code and not NUMBERED.match(party.code):
            by_name.setdefault(norm(party.name), []).append(party)
            by_code[party.code.upper()] = party
    replaced = 0
    for party in parties:
        if not party.code or not NUMBERED.match(party.code) or \
                party.id in companies:
            continue
        keep = by_code.get((party.name or '').strip().upper())
        if not keep:
            same = by_name.get(norm(party.name)) or []
            keep = same[0] if len(same) == 1 else None
        if not keep or keep.id == party.id:
            continue
        try:
            # Jobshop's name and the ID-named duplicate differ: answered
            # yes ahead (Tryton's warnings, one each)
            for what in ['name', 'tax_identifier']:
                Warning(user=user, name='party.replace %s %s %s' % (what,
                        party.id, keep.id), always=False).save()
            replace = Wizard('party.replace')
            replace.form.source = party
            replace.form.destination = keep
            replace.execute('replace')
        except Exception as error:
            log("party %s (%s): not replaced by %s: %s" % (party.code,
                    party.name, keep.code, error))
            continue
        replaced += 1
    m.count('duplicate parties replaced', replaced)
    log("parties: %s duplicates replaced by the Jobshop ID's party"
        % replaced)
