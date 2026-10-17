# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Generate sample_report.pdf with the layout of the Paychex General Ledger
Report by Check Date and fictitious amounts (requires reportlab)"""
import os

from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfgen import canvas

DEBIT_X, CREDIT_X = 686, 777
LINES = [
    (476, 18, 'EARNINGS', None, None),
    (468, 32, 'EARNINGS', '10,000.00', None),
    (458, 39, 'TOTAL EARNINGS', '10,000.00', None),
    (431, 18, 'EMPLOYEE WITHHOLDINGS', None, None),
    (422, 32, 'SOCIAL SECURITY', None, '620.00'),
    (413, 32, 'MEDICARE', None, '145.00'),
    (404, 32, 'FED INCOME TAX', None, '1,000.00'),
    (395, 39, 'TOTAL EMPLOYEE WITHHOLDINGS PAID BY PAYCHEX', None,
        '1,765.00'),
    (367, 18, 'DEDUCTIONS', None, None),
    (359, 32, 'PXCMP EE PRE', None, '200.00'),
    (349, 39, 'TOTAL DEDUCTIONS', None, '200.00'),
    (295, 18, 'NET PAYROLL', None, None),
    (286, 32, 'DIRECT DEPOSIT', None, '8,035.00'),
    (276, 39, 'TOTAL NET PAYROLL', None, '8,035.00'),
    (249, 18, 'EMPLOYER PAID TAX LIABILITIES', None, None),
    (241, 32, 'EMPLOYER TAX EXPENSES', '765.00', None),
    (231, 32, 'SOCIAL SECURITY', None, '620.00'),
    (222, 32, 'MEDICARE', None, '145.00'),
    (213, 39, 'TOTAL EMPLOYER PAID TAX LIABILITIES PAID BY PAYCHEX', '765.00',
        '765.00'),
    (186, 18, 'TOTALS', '10,765.00', '10,765.00'),
    ]


def main(path):
    pdf = canvas.Canvas(path, pagesize=landscape(letter))
    pdf.setFont('Helvetica', 9)
    pdf.drawString(13, 557, '0000 1234-5678')
    pdf.drawString(311, 556, 'GENERAL LEDGER REPORT BY CHECK DATE')
    pdf.drawString(117, 527, 'DESCRIPTION')
    pdf.drawRightString(DEBIT_X + 1, 495, 'DEBIT')
    pdf.drawRightString(CREDIT_X, 495, 'CREDIT')
    for y, x, label, debit, credit in LINES:
        pdf.drawString(x, y, label)
        if debit is None and credit is None and not label.startswith(
                'TOTAL'):
            continue
        if not label.startswith('TOTAL'):
            pdf.drawString(288, y, '_' * 27)
        if debit:
            pdf.drawRightString(DEBIT_X, y, debit)
        if credit:
            pdf.drawRightString(CREDIT_X, y, credit)
    pdf.drawString(13, 16, 'Run Date 10/08/26 10:36AM')
    pdf.drawString(318, 16, 'Period Start - End Date')
    pdf.drawString(430, 16, '09/21/26 - 10/04/26')
    pdf.drawString(319, 9, 'Check Date')
    pdf.drawString(406, 9, '10/09/26')
    pdf.save()


if __name__ == '__main__':
    main(os.path.join(os.path.dirname(__file__), 'sample_report.pdf'))
