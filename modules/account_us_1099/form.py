# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Render the recipient copies (Copy B) of Forms 1099 as substitute
statements on Letter paper"""
import io

from .us_1099 import BOX_NUMBERS, BOX_TITLES, FORM_TITLES, truncate_tin

LEGEND = (
    "This is important tax information and is being furnished to the IRS. "
    "If you are required to file a return, a negligence penalty or other "
    "sanction may be imposed on you if this income is taxable and the IRS "
    "determines that it has not been reported.")
INSTRUCTIONS = {
    'nec': "Instructions for Recipient: see www.irs.gov/Form1099NEC.",
    'misc': "Instructions for Recipient: see www.irs.gov/Form1099MISC.",
    }


def _address_lines(party, address):
    lines = [party.name]
    if address:
        lines.extend((address.street or '').splitlines())
        state = (address.subdivision.code.split('-')[-1]
            if address.subdivision else '')
        lines.append(' '.join(filter(None, [
                        (address.city or '') + (',' if state else ''),
                        state, address.postal_code or ''])))
        if address.country and address.country.code != 'US':
            lines.append(address.country.name)
    return lines


def _amount(value):
    return '$ {:,.2f}'.format(value) if value else ''


def render(forms):
    "Return the PDF of the recipient copies of the forms"
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen.canvas import Canvas

    buffer = io.BytesIO()
    canvas = Canvas(buffer, pagesize=letter, pageCompression=1)
    width, height = letter
    margin = 0.5 * inch
    regular, bold = 'Helvetica', 'Helvetica-Bold'

    def box(x, y, w, h, label, lines=(), size=10, amount=None):
        "Draw a box with top-left corner at x, y"
        canvas.rect(x, y - h, w, h)
        canvas.setFont(regular, 7)
        label_lines = simpleSplit(label, regular, 7, w - 6)
        for i, line in enumerate(label_lines):
            canvas.drawString(x + 3, y - 9 - i * 8, line)
        canvas.setFont(regular, size)
        top = y - 9 - len(label_lines) * 8 - size
        for i, line in enumerate(lines):
            canvas.drawString(x + 6, top - i * (size + 2), line)
        if amount:
            canvas.drawRightString(x + w - 6, y - h + 6, amount)

    for form in forms:
        boxes = form.boxes
        top = height - margin
        left = margin
        full = width - 2 * margin
        half = full / 2

        # Title
        canvas.setFont(bold, 16)
        canvas.drawString(left, top - 16, 'Form 1099-%s' % form.form.upper())
        canvas.setFont(regular, 12)
        canvas.drawString(left, top - 32, FORM_TITLES[form.form])
        canvas.setFont(bold, 12)
        canvas.drawRightString(left + full, top - 16, 'Copy B')
        canvas.setFont(regular, 9)
        canvas.drawRightString(left + full, top - 28, 'For Recipient')
        canvas.drawRightString(left + full, top - 40,
            'Department of the Treasury - Internal Revenue Service')
        canvas.setFont(bold, 12)
        canvas.drawCentredString(left + full / 2, top - 16,
            'Tax Year %s' % form.year)

        # Payer and recipient
        y = top - 56
        payer = _address_lines(form.company.party, form.payer_address)
        if form.company.party.phone:
            payer.append(form.company.party.phone)
        box(left, y, half, 96,
            "PAYER'S name, street address, city or town, state or "
            "province, country, ZIP or foreign postal code, and telephone "
            "no.", payer)
        payer_tin = form.payer_tin
        box(left, y - 96, half / 2, 36, "PAYER'S TIN",
            [payer_tin.code if payer_tin else ''])
        box(left + half / 2, y - 96, half / 2, 36, "RECIPIENT'S TIN",
            [truncate_tin(form.tin.code if form.tin else '')])
        box(left, y - 132, half, 84,
            "RECIPIENT'S name, street address (including apt. no.), "
            "city or town, state, and ZIP code",
            _address_lines(form.party, form.address))
        box(left, y - 216, half * 0.6, 36, "Account number (see instructions)",
            [str(form.party.code or form.party.id)])
        box(left + half * 0.6, y - 216, half * 0.4, 36, "2nd TIN not.",
            ['X' if form.party.us_1099_second_tin_notice else ''])

        # Amounts
        numbers = BOX_NUMBERS[form.form]
        columns = 1 if len(numbers) <= 2 else 2
        rows = -(-len(numbers) // columns)
        column_width = half / columns
        row_height = 252 / rows
        for i in range(rows * columns):
            row, column = divmod(i, columns)
            x = left + half + column * column_width
            top_y = y - row * row_height
            if i >= len(numbers):
                canvas.rect(x, top_y - row_height, column_width, row_height)
                continue
            number = numbers[i]
            if number == '4':
                title = "Federal income tax withheld"
            else:
                title = BOX_TITLES['%s_%s' % (form.form, number)]
            box(x, top_y, column_width, row_height,
                '%s %s' % (number, title), amount=_amount(boxes.get(number)))

        # Legend and instructions
        y -= 272
        canvas.setFont(regular, 9)
        for line in simpleSplit(LEGEND, regular, 9, full):
            canvas.drawString(left, y, line)
            y -= 12
        y -= 6
        canvas.drawString(left, y, INSTRUCTIONS[form.form])
        canvas.setFont(regular, 7)
        canvas.drawString(left, margin, '(keep for your records)')
        canvas.showPage()
    canvas.save()
    return buffer.getvalue()
