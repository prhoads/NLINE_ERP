# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Parse the local sales tax rate file of the Texas Comptroller

The file (taxrates.txt) is distributed with the Sales Tax EDI software of the
Comptroller.  It is tab separated with:

- a header line: type, quarter (YYYYQ), period (YYYYMM), quarter label,
  state rate, ?, number of lines, message, version
- the due dates of the filing periods: period, q or m, date
- a line per location: name, then code, rate for the city, county,
  special purpose district and transit authority (with their name before)
"""
import datetime
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import List, Optional

JURISDICTION_TYPES = ['city', 'county', 'special', 'transit']
# The first digit of the local code gives the type of jurisdiction
CODE_TYPES = {
    '2': 'city',
    '3': 'transit',
    '4': 'county',
    '5': 'special',
    '6': 'special',
    }
# Single local use tax rate is for remote sellers only
REMOTE_SELLER_PREFIX = '1'
# Maximum combined local rate in Texas
LOCAL_RATE_CAP = Decimal('0.02')


class TexasRateError(ValueError):
    pass


@dataclass
class Jurisdiction:
    type: str
    code: str
    name: str
    rate: Decimal


@dataclass
class Location:
    name: str
    county: str
    jurisdictions: List[Jurisdiction] = field(default_factory=list)

    @property
    def local_rate(self):
        return sum((j.rate for j in self.jurisdictions), Decimal(0))

    @property
    def over_cap(self):
        "Overlapping jurisdictions to choose for the address"
        return self.local_rate > LOCAL_RATE_CAP

    def jurisdiction(self, type_):
        for jurisdiction in self.jurisdictions:
            if jurisdiction.type == type_:
                return jurisdiction


@dataclass
class RateFile:
    quarter: str
    label: str
    state_rate: Decimal
    locations: List[Location] = field(default_factory=list)

    @property
    def start_date(self):
        "First day of the quarter"
        year, quarter = int(self.quarter[:4]), int(self.quarter[4:])
        return datetime.date(year, 3 * (quarter - 1) + 1, 1)

    @property
    def jurisdictions(self):
        "Return the distinct jurisdictions by code"
        result = {}
        for location in self.locations:
            for jurisdiction in location.jurisdictions:
                result.setdefault(jurisdiction.code, jurisdiction)
        return result


def _rate(value):
    value = (value or '').strip()
    if not value:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        raise TexasRateError("Invalid rate %r" % value)


def _code(value):
    value = (value or '').strip()
    if not value or value.lower() == 'n/a':
        return None
    if not value.isdigit():
        raise TexasRateError("Invalid local code %r" % value)
    return value


def parse(data):
    "Parse the content (bytes or str) of taxrates.txt"
    if isinstance(data, bytes):
        data = data.decode('latin-1')
    lines = data.splitlines()
    if not lines:
        raise TexasRateError("Empty file")
    header = lines[0].split('\t')
    if len(header) < 7 or header[0] != '1':
        raise TexasRateError("This is not a Texas tax rate file")
    quarter = header[1].strip()
    if len(quarter) != 5 or not quarter.isdigit():
        raise TexasRateError("Invalid quarter %r" % quarter)
    rates = RateFile(
        quarter=quarter,
        label=header[3].strip(),
        state_rate=_rate(header[4]))
    for number, line in enumerate(lines[1:], 2):
        columns = line.split('\t')
        if len(columns) < 12:
            continue
        if columns[1] in {'q', 'm'} and columns[0].strip().isdigit():
            # Due date of filing period
            continue
        name = columns[0].strip()
        if not name:
            continue
        location = Location(name=name, county=columns[3].strip())
        if (_code(columns[1]) or '').startswith(REMOTE_SELLER_PREFIX):
            continue
        for i, type_ in enumerate(JURISDICTION_TYPES):
            jurisdiction_name, code, rate = columns[3 * i:3 * i + 3]
            code = _code(code)
            if not code:
                continue
            type_ = CODE_TYPES.get(code[0], type_)
            rate = _rate(rate)
            if rate is None:
                raise TexasRateError(
                    "Missing rate of %s on line %d" % (code, number))
            location.jurisdictions.append(Jurisdiction(
                    type=type_,
                    code=code,
                    name=jurisdiction_name.strip() or location.name,
                    rate=rate))
        rates.locations.append(location)
    if not rates.locations:
        raise TexasRateError("No location found")
    if rates.state_rate is None:
        raise TexasRateError("Missing state rate")
    return rates
