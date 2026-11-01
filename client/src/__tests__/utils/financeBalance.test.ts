import { describe, it, expect } from 'vitest';
import { balanceNow, billsStillDue } from '@/utils/financeBalance';
import { markBillPaid, undoLastPayment } from '@/utils/finance';
import type { Bill } from '@/types/finance';

const snap = { amountCents: 200000, setAt: '2026-11-01T15:00:00.000Z' };
const bill = (over: Partial<Bill> = {}): Bill => ({
  name: 'Electric', kind: 'bill', amountCents: 9500, frequency: 'monthly', dueDate: '2026-11-05', status: 'active', payments: [], ...over,
});

describe('current balance', () => {
  it('takes off bills paid and spending logged after it was set', () => {
    const paid = markBillPaid(bill(), '2026-11-01', 'p1', 9500, '2026-11-01T16:00:00.000Z');
    const r = balanceNow(snap, [paid], [
      { date: '2026-11-01', description: 'Groceries', amountCents: 4200, createdAt: '2026-11-01T17:00:00.000Z' },
      { date: '2026-10-30', description: 'Before it was set', amountCents: 999, createdAt: '2026-10-30T12:00:00.000Z' },
    ]);
    expect(r).toEqual({ cents: 200000 - 9500 - 4200, payments: 1, paidCents: 9500, purchases: 1, spentCents: 4200 });
  });

  it('puts a payment back when it is undone (worked out from the records)', () => {
    const paid = markBillPaid(bill(), '2026-11-01', 'p1', 9500, '2026-11-01T16:00:00.000Z');
    expect(balanceNow(snap, [undoLastPayment(paid)], []).cents).toBe(200000);
  });

  it('counts an older payment with no moment by its day', () => {
    const old = bill({ payments: [{ id: 'a', forDue: '2026-10-05', paidOn: '2026-11-01', amountCents: 9500 }, { id: 'b', forDue: '2026-11-05', paidOn: '2026-11-02', amountCents: 9500 }] });
    expect(balanceNow(snap, [old], []).payments).toBe(1); // the same day as it was set is taken as already in it
  });
});

describe('bills still due this month', () => {
  it('adds up unpaid bills from now to the month end, overdue ones included', () => {
    const r = billsStillDue([
      bill({ dueDate: '2026-11-05' }),
      bill({ name: 'Phone', amountCents: 8500, dueDate: '2026-10-29' }), // overdue (within the week)
      bill({ name: 'Weekly box', amountCents: 2000, frequency: 'weekly', dueDate: '2026-11-03' }), // never paid: Oct 27 is overdue
      bill({ name: 'Paused', status: 'paused' }),
      bill({ name: 'Yearly', frequency: 'yearly', dueDate: '2027-03-10' }), // not this month
    ], '2026-11-01');
    expect(r.through).toBe('2026-11-30');
    expect(r.items.map(i => `${i.bill.name} ${i.due}`)).toEqual([
      'Weekly box 2026-10-27', 'Phone 2026-10-29', 'Weekly box 2026-11-03', 'Electric 2026-11-05',
      'Weekly box 2026-11-10', 'Weekly box 2026-11-17', 'Weekly box 2026-11-24', 'Phone 2026-11-29',
    ]);
    expect(r.cents).toBe(8500 * 2 + 2000 * 5 + 9500);
  });

  it('leaves out a bill already paid for this month', () => {
    const paid = markBillPaid(bill(), '2026-11-01', 'p1');
    expect(billsStillDue([paid], '2026-11-01').items).toEqual([]);
  });
});
