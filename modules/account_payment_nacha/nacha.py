# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Write ACH files in the Nacha format

Every record is 94 characters and the file is blocked by 10 records.
"""
import datetime
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional

RECORD_SIZE = 94
BLOCKING_FACTOR = 10

# Transaction codes
CHECKING_CREDIT = '22'
CHECKING_DEBIT = '27'
SAVINGS_CREDIT = '32'
SAVINGS_DEBIT = '37'
TRANSACTION_CODES = {
    ('checking', 'credit'): CHECKING_CREDIT,
    ('checking', 'debit'): CHECKING_DEBIT,
    ('savings', 'credit'): SAVINGS_CREDIT,
    ('savings', 'debit'): SAVINGS_DEBIT,
    }

# Service class codes
MIXED = '200'
CREDITS_ONLY = '220'
DEBITS_ONLY = '225'


class NachaError(ValueError):
    pass


def routing_number_valid(number):
    "Check the ABA routing number checksum"
    if not number or len(number) != 9 or not number.isdigit():
        return False
    digits = list(map(int, number))
    total = (3 * (digits[0] + digits[3] + digits[6])
        + 7 * (digits[1] + digits[4] + digits[7])
        + (digits[2] + digits[5] + digits[8]))
    return total % 10 == 0


def _ascii(value):
    "Return value with only the characters allowed by Nacha"
    value = unicodedata.normalize('NFKD', value or '')
    value = value.encode('ascii', 'ignore').decode('ascii')
    # Only printable characters are allowed
    return ''.join(c for c in value if 32 <= ord(c) < 127)


def alpha(value, size):
    "Alphanumeric field: upper case, left justified, blank filled"
    value = _ascii(value).upper()
    return value[:size].ljust(size)


def numeric(value, size):
    "Numeric field: right justified, zero filled"
    value = str(value)
    if not value.isdigit():
        raise NachaError("%r is not numeric" % value)
    if len(value) > size:
        raise NachaError("%r is longer than %d" % (value, size))
    return value.rjust(size, '0')


def amount(value, size):
    "Amount in cents"
    cents = (Decimal(value) * 100).quantize(Decimal(1))
    if cents != Decimal(value) * 100:
        raise NachaError("%s has more than 2 decimals" % value)
    if cents < 0:
        raise NachaError("%s is negative" % value)
    return numeric(int(cents), size)


@dataclass
class Entry:
    "Entry detail record"
    routing_number: str
    account_number: str
    account_type: str  # checking or savings
    amount: Decimal
    name: str
    identification: str = ''
    direction: str = 'credit'  # credit or debit
    discretionary_data: str = ''
    addenda: Optional[str] = None
    prenote: bool = False

    def validate(self):
        if not routing_number_valid(self.routing_number):
            raise NachaError(
                "Invalid routing number %r for %s" % (
                    self.routing_number, self.name))
        if not self.account_number:
            raise NachaError("Missing account number for %s" % self.name)
        if len(_ascii(self.account_number).replace(' ', '')) > 17:
            raise NachaError(
                "Account number of %s is longer than 17" % self.name)
        if (self.account_type, self.direction) not in TRANSACTION_CODES:
            raise NachaError(
                "Invalid account type %r or direction %r" % (
                    self.account_type, self.direction))
        if not self.prenote and Decimal(self.amount) <= 0:
            raise NachaError("Amount must be positive for %s" % self.name)

    @property
    def transaction_code(self):
        code = TRANSACTION_CODES[(self.account_type, self.direction)]
        if self.prenote:
            # Prenotification codes are the live code + 1
            code = str(int(code) + 1)
        return code


@dataclass
class Batch:
    "Batch of entries with the same company and effective date"
    company_name: str
    company_identification: str
    entry_description: str
    effective_date: datetime.date
    odfi_routing_number: str
    standard_entry_class: str = 'CCD'
    company_discretionary_data: str = ''
    descriptive_date: str = ''
    entries: List[Entry] = field(default_factory=list)
    # Balanced batch: add an offset entry against the originator account
    offset_account_number: Optional[str] = None
    offset_account_type: str = 'checking'

    def validate(self):
        if not routing_number_valid(self.odfi_routing_number):
            raise NachaError(
                "Invalid ODFI routing number %r" % self.odfi_routing_number)
        if self.standard_entry_class not in {'CCD', 'PPD', 'CTX'}:
            raise NachaError(
                "Unsupported SEC code %r" % self.standard_entry_class)
        if not self.entries:
            raise NachaError("Batch without entries")
        for entry in self.entries:
            entry.validate()


@dataclass
class File:
    immediate_destination: str
    immediate_origin: str
    immediate_destination_name: str
    immediate_origin_name: str
    file_id_modifier: str = 'A'
    reference_code: str = ''
    creation: Optional[datetime.datetime] = None
    batches: List[Batch] = field(default_factory=list)
    line_ending: str = '\n'
    block: bool = True

    def validate(self):
        modifier = self.file_id_modifier
        if (len(modifier) != 1
                or not (modifier.isdigit() or 'A' <= modifier <= 'Z')):
            raise NachaError("Invalid file id modifier %r" % modifier)
        if not self.batches:
            raise NachaError("File without batches")
        for batch in self.batches:
            batch.validate()

    def records(self):
        self.validate()
        creation = self.creation or datetime.datetime.now()
        records = [self._file_header(creation)]
        file_entry_count = 0
        file_hash = 0
        file_debit = file_credit = 0
        for number, batch in enumerate(self.batches, 1):
            batch_records, count, hash_, debit, credit = self._batch(
                batch, number)
            records.extend(batch_records)
            file_entry_count += count
            file_hash += hash_
            file_debit += debit
            file_credit += credit
        block_count = -(-(len(records) + 1) // BLOCKING_FACTOR)
        records.append(''.join([
                    '9',
                    numeric(len(self.batches), 6),
                    numeric(block_count, 6),
                    numeric(file_entry_count, 8),
                    numeric(file_hash % 10 ** 10, 10),
                    numeric(file_debit, 12),
                    numeric(file_credit, 12),
                    ' ' * 39,
                    ]))
        if self.block:
            while len(records) % BLOCKING_FACTOR:
                records.append('9' * RECORD_SIZE)
        for record in records:
            assert len(record) == RECORD_SIZE, (len(record), record)
        return records

    def __str__(self):
        return self.line_ending.join(self.records()) + self.line_ending

    def encode(self):
        return str(self).encode('ascii')

    def _file_header(self, creation):
        return ''.join([
                '1',
                '01',
                self._routing_field(self.immediate_destination),
                self._routing_field(self.immediate_origin),
                creation.strftime('%y%m%d'),
                creation.strftime('%H%M'),
                self.file_id_modifier,
                '094',
                '10',
                '1',
                alpha(self.immediate_destination_name, 23),
                alpha(self.immediate_origin_name, 23),
                alpha(self.reference_code, 8),
                ])

    @staticmethod
    def _routing_field(value):
        "10 positions: routing number preceded by a blank or a 10 digits ID"
        value = (value or '').strip()
        if len(value) == 9:
            return ' ' + numeric(value, 9)
        elif len(value) == 10 and (value.isdigit() or value[0] == ' '):
            return value
        raise NachaError("Invalid immediate destination/origin %r" % value)

    def _batch(self, batch, number):
        entries = list(batch.entries)
        if batch.offset_account_number:
            debits = sum(Decimal(e.amount) for e in entries
                if e.direction == 'debit')
            credits = sum(Decimal(e.amount) for e in entries
                if e.direction == 'credit')
            if credits != debits:
                direction = 'debit' if credits > debits else 'credit'
                entries.append(Entry(
                        routing_number=batch.odfi_routing_number,
                        account_number=batch.offset_account_number,
                        account_type=batch.offset_account_type,
                        amount=abs(credits - debits),
                        name=batch.company_name,
                        identification=batch.company_identification,
                        direction=direction))
        has_debit = any(e.direction == 'debit' for e in entries)
        has_credit = any(e.direction == 'credit' for e in entries)
        if has_debit and has_credit:
            service_class = MIXED
        elif has_debit:
            service_class = DEBITS_ONLY
        else:
            service_class = CREDITS_ONLY
        odfi = batch.odfi_routing_number[:8]
        records = [''.join([
                    '5',
                    service_class,
                    alpha(batch.company_name, 16),
                    alpha(batch.company_discretionary_data, 20),
                    alpha(batch.company_identification, 10),
                    batch.standard_entry_class,
                    alpha(batch.entry_description, 10),
                    alpha(batch.descriptive_date, 6),
                    batch.effective_date.strftime('%y%m%d'),
                    '   ',
                    '1',
                    odfi,
                    numeric(number, 7),
                    ])]
        count = hash_ = debit = credit = 0
        for sequence, entry in enumerate(entries, 1):
            entry.validate()
            trace = odfi + numeric(sequence, 7)
            cents = int(amount(entry.amount, 10)) if not entry.prenote else 0
            account_number = _ascii(entry.account_number).replace(' ', '')
            records.append(''.join([
                        '6',
                        entry.transaction_code,
                        entry.routing_number[:8],
                        entry.routing_number[8],
                        alpha(account_number, 17),
                        numeric(cents, 10),
                        alpha(entry.identification, 15),
                        alpha(entry.name, 22),
                        alpha(entry.discretionary_data, 2),
                        '1' if entry.addenda else '0',
                        trace,
                        ]))
            count += 1
            if entry.addenda:
                records.append(''.join([
                            '7',
                            '05',
                            alpha(entry.addenda, 80),
                            numeric(1, 4),
                            numeric(sequence, 7),
                            ]))
                count += 1
            hash_ += int(entry.routing_number[:8])
            if entry.direction == 'debit':
                debit += cents
            else:
                credit += cents
        records.append(''.join([
                    '8',
                    service_class,
                    numeric(count, 6),
                    numeric(hash_ % 10 ** 10, 10),
                    numeric(debit, 12),
                    numeric(credit, 12),
                    alpha(batch.company_identification, 10),
                    ' ' * 19,
                    ' ' * 6,
                    odfi,
                    numeric(number, 7),
                    ]))
        return records, count, hash_, debit, credit
