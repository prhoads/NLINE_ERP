# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
from decimal import Decimal

from trytond.model import fields
from trytond.modules.product import price_digits
from trytond.pool import Pool, PoolMeta
from trytond.pyson import Eval
from trytond.transaction import Transaction


class Line(metaclass=PoolMeta):
    __name__ = 'purchase.line'

    production_cost_amount = fields.Numeric(
        "Production Cost Amount", digits=price_digits, readonly=True,
        states={
            'invisible': ~Eval('production'),
            },
        help="The amount of the line included in the cost of the production "
        "when it was done.")
    production_billed = fields.Function(fields.Boolean(
            "Production Billed",
            states={
                'invisible': ~Eval('production'),
                }),
        'get_production_billed')

    def _get_posted_invoice_lines(self):
        return [l for l in self.invoice_lines
            if l.invoice and l.invoice.state in {'posted', 'paid'}]

    def get_production_billed(self, name=None):
        "Return if the line quantity is billed on posted supplier invoices"
        pool = Pool()
        Uom = pool.get('product.uom')
        quantity = 0
        for invoice_line in self._get_posted_invoice_lines():
            quantity += Uom.compute_qty(
                invoice_line.unit, invoice_line.quantity, self.unit)
        return quantity >= self.quantity

    def get_production_cost_basis(self):
        """Return the amount of the line to include in the production cost:
        the posted bills once the quantity is billed else the purchase"""
        pool = Pool()
        Currency = pool.get('currency.currency')
        if self.production_billed:
            amount = Decimal(0)
            for invoice_line in self._get_posted_invoice_lines():
                amount += Currency.compute(
                    invoice_line.invoice.currency, invoice_line.amount,
                    self.currency, round=False)
            return amount
        return self.amount or Decimal(0)

    def get_invoice_line(self):
        pool = Pool()
        Configuration = pool.get('account.configuration')
        lines = super().get_invoice_line()
        if self.production:
            # The services bought for a production are work in progress
            account = Configuration(1).get_multivalue(
                'production_wip_account', company=self.company.id)
            if account:
                for line in lines:
                    line.account = account
        return lines

    def get_production_variance_move(self):
        """Return the move clearing from WIP the difference between the bills
        posted after the production was done and the cost it included"""
        pool = Pool()
        AccountMove = pool.get('account.move')
        AccountMoveLine = pool.get('account.move.line')
        Configuration = pool.get('account.configuration')
        Currency = pool.get('currency.currency')
        Period = pool.get('account.period')
        Date = pool.get('ir.date')

        company = self.company
        difference = Currency.compute(
            self.currency,
            self.get_production_cost_basis() - self.production_cost_amount,
            company.currency)
        if not difference:
            return
        configuration = Configuration(1)
        wip = configuration.get_multivalue(
            'production_wip_account', company=company.id)
        variance = configuration.get_multivalue(
            'production_variance_account', company=company.id)
        if not wip or not variance:
            return
        with Transaction().set_context(company=company.id):
            date = Date.today()
        period = Period.find(company, date=date)
        if difference > 0:
            debit, credit = difference, Decimal(0)
        else:
            debit, credit = Decimal(0), -difference
        return AccountMove(
            journal=configuration.get_multivalue(
                'stock_journal', company=company.id),
            period=period,
            date=date,
            origin=self.production,
            description=self.rec_name,
            lines=[
                AccountMoveLine(
                    account=variance, debit=debit, credit=credit),
                AccountMoveLine(
                    account=wip, debit=credit, credit=debit),
                ])

    @classmethod
    def copy(cls, lines, default=None):
        default = default.copy() if default is not None else {}
        default.setdefault('production_cost_amount', None)
        return super().copy(lines, default=default)


class Invoice(metaclass=PoolMeta):
    __name__ = 'account.invoice'

    @classmethod
    def _post(cls, invoices):
        pool = Pool()
        AccountMove = pool.get('account.move')
        PurchaseLine = pool.get('purchase.line')
        super()._post(invoices)

        purchase_lines = {
            l.origin for i in invoices if i.type == 'in' for l in i.lines
            if isinstance(l.origin, PurchaseLine)
            and l.origin.production
            and l.origin.production.state == 'done'
            and l.origin.production_cost_amount is not None}
        moves, to_save = [], []
        for line in PurchaseLine.browse(list(purchase_lines)):
            move = line.get_production_variance_move()
            if move:
                moves.append(move)
                line.production_cost_amount = line.get_production_cost_basis()
                to_save.append(line)
        AccountMove.save(moves)
        AccountMove.post(moves)
        PurchaseLine.save(to_save)


class AccountMove(metaclass=PoolMeta):
    __name__ = 'account.move'

    @classmethod
    def _get_origin(cls):
        return super()._get_origin() + ['production']
