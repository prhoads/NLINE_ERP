# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Parse the Paychex Flex "General Ledger Report by Check Date" PDF

The report lists, by section, the payroll amounts in a DEBIT and a CREDIT
column.  The text of the PDF has no reliable spacing so the lines are rebuilt
from the position of the characters and the amounts are assigned to the column
whose header is the closest.
"""
import datetime
import io
import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional

AMOUNT = re.compile(r'^_*(\d{1,3}(?:,\d{3})*\.\d{2})$')
DATE = re.compile(r'(\d{2})/(\d{2})/(\d{2})')


class PaychexError(ValueError):
    pass


def normalize(label):
    "Return the key of a label independently of the spaces"
    return ''.join(c for c in label.upper() if c.isalnum())


def _date(text):
    month, day, year = map(int, DATE.search(text).groups())
    return datetime.date(2000 + year, month, day)


@dataclass
class Line:
    section: str
    label: str
    debit: Decimal = Decimal(0)
    credit: Decimal = Decimal(0)

    @property
    def key(self):
        return normalize(self.section), normalize(self.label)


@dataclass
class Report:
    company_code: Optional[str] = None
    company_name: Optional[str] = None
    check_date: Optional[datetime.date] = None
    period_start: Optional[datetime.date] = None
    period_end: Optional[datetime.date] = None
    lines: List[Line] = field(default_factory=list)
    total_debit: Optional[Decimal] = None
    total_credit: Optional[Decimal] = None

    def validate(self):
        if not self.check_date:
            raise PaychexError("Check date not found")
        if not self.lines:
            raise PaychexError("No amount found")
        debit = sum(l.debit for l in self.lines)
        credit = sum(l.credit for l in self.lines)
        if self.total_debit is None or self.total_credit is None:
            raise PaychexError("Totals not found")
        if debit != self.total_debit or credit != self.total_credit:
            raise PaychexError(
                "Lines (%s / %s) do not match the totals (%s / %s)" % (
                    debit, credit, self.total_debit, self.total_credit))
        if debit != credit:
            raise PaychexError(
                "Report is not balanced (%s / %s)" % (debit, credit))


def _words(page):
    "Yield the lines of the page as list of (text, x0, x1) from top"
    from pdfminer.layout import LTChar

    def chars(layout):
        for obj in layout:
            if isinstance(obj, LTChar):
                yield obj
            elif hasattr(obj, '__iter__'):
                yield from chars(obj)
    rows = {}
    for char in chars(page):
        rows.setdefault(round(char.y0), []).append(char)
    for y in sorted(rows, reverse=True):
        words = []
        current = None
        for char in sorted(rows[y], key=lambda c: c.x0):
            if current is not None and char.x0 - current[2] < 2.5:
                current[0] += char.get_text()
                current[2] = char.x1
            else:
                current = [char.get_text(), char.x0, char.x1]
                words.append(current)
        yield [(t.strip(), x0, x1) for t, x0, x1 in words if t.strip()]


def parse(data):
    "Parse the PDF content and return a Report"
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LAParams

    # pdfminer logs warnings for the fonts of the report
    logging.getLogger('pdfminer').setLevel(logging.ERROR)
    report = Report()
    debit_x = credit_x = None
    section = None
    for page in extract_pages(io.BytesIO(data), laparams=LAParams()):
        for words in _words(page):
            texts = [w[0] for w in words]
            joined = ' '.join(texts)
            if 'DEBIT' in texts and 'CREDIT' in texts:
                debit_x = next(w[2] for w in words if w[0] == 'DEBIT')
                credit_x = next(w[2] for w in words if w[0] == 'CREDIT')
                continue
            if normalize(joined).startswith('CHECKDATE') or (
                    'CheckDate' in joined.replace(' ', '')
                    and DATE.search(joined)):
                report.check_date = _date(joined)
                continue
            compact = joined.replace(' ', '')
            if 'PeriodStart' in compact:
                # The run date may be on the same line
                dates = DATE.findall(compact[compact.index('PeriodStart'):])
                if len(dates) >= 2:
                    report.period_start = _date('/'.join(dates[0]))
                    report.period_end = _date('/'.join(dates[1]))
                continue
            if report.company_code is None:
                match = re.match(r'^(\d{4} \d{4}-\d{4})\s*(.*)$', joined)
                if match:
                    report.company_code = match.group(1)
                    report.company_name = match.group(2).strip() or None
            if debit_x is None:
                continue
            amounts = []
            labels = []
            for text, x0, x1 in words:
                match = AMOUNT.match(text)
                if match:
                    amounts.append((Decimal(match.group(1).replace(',', '')),
                            x1))
                elif not set(text) <= {'_', ' '}:
                    labels.append(text)
            label = ' '.join(labels)
            if not amounts:
                if label and label.isupper() and not label.startswith(
                        ('GENERAL', 'DESCRIPTION', 'ACCOUNT', 'MONTH')):
                    section = label
                continue
            if normalize(label) == 'TOTALS':
                for amount, x1 in amounts:
                    if abs(x1 - debit_x) < abs(x1 - credit_x):
                        report.total_debit = amount
                    else:
                        report.total_credit = amount
                continue
            if normalize(label).startswith('TOTAL'):
                continue
            line = Line(section=section or '', label=label)
            for amount, x1 in amounts:
                if abs(x1 - debit_x) < abs(x1 - credit_x):
                    line.debit += amount
                else:
                    line.credit += amount
            report.lines.append(line)
    if debit_x is None:
        raise PaychexError("This is not a Paychex General Ledger Report")
    report.validate()
    return report
