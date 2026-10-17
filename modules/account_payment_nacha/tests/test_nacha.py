# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
import datetime
import unittest
from decimal import Decimal

from ..nacha import (
    Batch, Entry, File, NachaError, RECORD_SIZE, routing_number_valid)


def chase_file(**kwargs):
    nacha = File(
        immediate_destination='021000021',
        immediate_origin='1234567890',
        immediate_destination_name='JPMORGAN CHASE',
        immediate_origin_name='N-Line Valves, Inc.',
        creation=datetime.datetime(2026, 10, 19, 7, 35),
        profile='chase')
    batch = Batch(
        company_name='N-Line Valves',
        company_identification='1234567890',
        entry_description='ACH Pmt',
        effective_date=datetime.date(2026, 10, 21),
        odfi_routing_number='021000021',
        funding_account_number='123456789',
        descriptive_date='OCT 21')
    batch.entries.append(Entry(
            routing_number='081904808',
            account_number='12345678901234567',
            account_type='checking',
            amount=Decimal('1500.25'),
            name='Paper Supplies #1',
            identification='V-0042',
            addenda='Invoice #34789324 on May 25'))
    batch.entries.append(Entry(
            routing_number='071000013',
            account_number='9876543210',
            account_type='savings',
            amount=Decimal('38.04'),
            name='Alltex Welding Supply',
            identification='V0043'))
    for key, value in kwargs.items():
        setattr(nacha, key, value)
    nacha.batches.append(batch)
    return nacha


class NachaTestCase(unittest.TestCase):
    "Test Nacha file"

    def test_routing_number(self):
        "Test routing number checksum"
        for number, valid in [
                ('021000021', True),
                ('081904808', True),
                ('021000022', False),
                ('02100002', False),
                ('02100002a', False),
                ]:
            with self.subTest(number=number):
                self.assertEqual(routing_number_valid(number), valid)

    def test_chase_file(self):
        "Test Chase file follows the specifications"
        records = chase_file().records()

        self.assertTrue(all(len(r) == RECORD_SIZE for r in records))
        self.assertEqual(len(records) % 10, 0)
        header, batch, entry1, addenda, entry2, control, file_control = (
            records[:7])
        # File header
        self.assertEqual(header[0:3], '101')
        self.assertEqual(header[3:13], ' 021000021')
        self.assertEqual(header[13:23], '1234567890')
        self.assertEqual(header[23:33], '2610190735')
        self.assertEqual(header[34:40], '094101')
        self.assertEqual(header[40:63].rstrip(), 'JPMORGAN CHASE')
        # Comma is not allowed by Chase
        self.assertEqual(header[63:86].rstrip(), 'N-LINE VALVES  INC.')
        # Batch header
        self.assertEqual(batch[0:4], '5220')
        self.assertEqual(batch[20:40], '00000000000123456789')
        self.assertEqual(batch[40:50], '1234567890')
        self.assertEqual(batch[50:53], 'CCD')
        self.assertEqual(batch[53:63], 'ACH PMT   ')
        self.assertEqual(batch[63:69], 'OCT 21')
        self.assertEqual(batch[69:75], '261021')
        self.assertEqual(batch[75:78], '   ')
        self.assertEqual(batch[78:94], '1021000020000001')
        # Entry
        self.assertEqual(entry1[0:3], '622')
        self.assertEqual(entry1[3:12], '081904808')
        self.assertEqual(entry1[12:29], '12345678901234567')
        self.assertEqual(entry1[29:39], '0000150025')
        self.assertEqual(entry1[39:54], 'V0042          ')
        # Number sign is not allowed by Chase
        self.assertEqual(entry1[54:76], 'PAPER SUPPLIES  1     ')
        self.assertEqual(entry1[78], '1')
        self.assertEqual(entry1[79:94], '021000020000001')
        self.assertEqual(addenda[0:3], '705')
        self.assertEqual(addenda[3:83].rstrip(), 'INVOICE #34789324 ON MAY 25')
        self.assertEqual(addenda[83:94], '00010000001')
        self.assertEqual(entry2[0:3], '632')
        self.assertEqual(entry2[78], '0')
        # Batch control
        self.assertEqual(control[0:4], '8220')
        self.assertEqual(control[4:10], '000003')
        self.assertEqual(control[10:20], '0015290481')
        self.assertEqual(control[20:32], '000000000000')
        self.assertEqual(control[32:44], '000000153829')
        self.assertEqual(control[44:54], '1234567890')
        self.assertEqual(control[79:94], '021000020000001')
        # File control
        self.assertEqual(file_control[0:21], '900000100000100000003')
        self.assertEqual(file_control[21:31], '0015290481')
        self.assertEqual(file_control[31:55], '000000000000000000153829')

    def test_crlf(self):
        "Test lines end with CRLF"
        content = chase_file().encode()
        self.assertEqual(content.count(b'\r\n'), 10)

    def test_chase_rules(self):
        "Test Chase rules are enforced"
        for label, change in [
                ('balanced', lambda f: setattr(
                        f.batches[0], 'offset_account_number', '1')),
                ('mixed', lambda f: setattr(
                        f.batches[0].entries[0], 'direction', 'debit')),
                ('prenote', lambda f: setattr(
                        f.batches[0].entries[0], 'prenote', True)),
                ('no identification', lambda f: setattr(
                        f.batches[0].entries[0], 'identification', '#-')),
                ('same day', lambda f: setattr(
                        f.batches[0], 'effective_date',
                        datetime.date(2026, 10, 19))),
                ('no funding account', lambda f: setattr(
                        f.batches[0], 'funding_account_number', None)),
                ('origin', lambda f: setattr(
                        f, 'immediate_origin', '123456789')),
                ('payroll CCD', lambda f: setattr(
                        f.batches[0], 'entry_description', 'PAYROLL')),
                ]:
            with self.subTest(label=label):
                nacha = chase_file()
                change(nacha)
                with self.assertRaises(NachaError):
                    nacha.records()

    def test_invalid_amount(self):
        "Test amount with more than 2 decimals"
        nacha = chase_file()
        nacha.batches[0].entries[0].amount = Decimal('1.001')
        with self.assertRaises(NachaError):
            nacha.records()
