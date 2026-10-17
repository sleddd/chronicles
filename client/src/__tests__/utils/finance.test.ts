import { describe, it, expect } from 'vitest';
import {
  parseMoney, formatCents, addMonthsClamped, billDueDates, nextDueDate, billOccurrences,
  monthlyEquivalent, billTotals, suggestBillsForPayday, paydaySummary, balanceCheck,
  isReadyToSpend, budgetSummary, potBalance, goalProgress, UNCATEGORIZED, shiftMonth,
  nextUnpaidDue, markBillPaid, undoLastPayment, latestPayment,
  billPaymentRecords, filterPayments, reportSummary, periodRange,
} from '../../utils/finance.js';
import type { Bill, Payday } from '../../types/finance.js';

const bill = (over: Partial<Bill> & { id?: string } = {}): Bill & { id: string } => ({
  id: 'b1', name: 'Rent', kind: 'bill', amountCents: 120000, frequency: 'monthly',
  dueDate: '2026-01-31', status: 'active', ...over,
});

const payday = (over: Partial<Payday> = {}): Payday => ({
  date: '2026-10-15', startingBalanceCents: 300000, status: 'open',
  items: [], spending: [], balanceChecks: [], ...over,
});

describe('money', () => {
  it('parses typed amounts into cents', () => {
    expect(parseMoney('1,234.56')).toBe(123456);
    expect(parseMoney('$12')).toBe(1200);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('.5')).toBe(50);
    expect(parseMoney('-3.20')).toBe(-320);
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });

  it('formats cents', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-500)).toBe('-$5.00');
  });
});

describe('dates', () => {
  it('clamps month ends', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-03-15', -3)).toBe('2025-12-15');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('bill schedules', () => {
  it('keeps a month-end bill on each month end', () => {
    expect(billDueDates(bill(), '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('handles a Feb 29 yearly bill', () => {
    const b = bill({ frequency: 'yearly', dueDate: '2028-02-29' });
    expect(billDueDates(b, '2029-01-01', '2029-12-31')).toEqual(['2029-02-28']);
    expect(billDueDates(b, '2032-01-01', '2032-12-31')).toEqual(['2032-02-29']);
  });

  it('works before the anchor date too', () => {
    const b = bill({ dueDate: '2026-10-05' });
    expect(billDueDates(b, '2026-08-01', '2026-08-31')).toEqual(['2026-08-05']);
  });

  it('repeats weekly and biweekly bills', () => {
    expect(billDueDates(bill({ frequency: 'weekly', dueDate: '2026-10-02' }), '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
    expect(billDueDates(bill({ frequency: 'biweekly', dueDate: '2026-10-02' }), '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-02', '2026-10-16', '2026-10-30']);
  });

  it('finds the next due date', () => {
    expect(nextDueDate(bill({ dueDate: '2026-01-10' }), '2026-10-11')).toBe('2026-11-10');
    expect(nextDueDate(bill({ dueDate: '2026-01-10' }), '2026-10-10')).toBe('2026-10-10');
    expect(nextDueDate(bill({ frequency: 'once', dueDate: '2026-01-10' }), '2026-10-10')).toBeNull();
  });

  it('leaves paused and cancelled bills off the calendar', () => {
    const bills = [bill({ id: 'a' }), bill({ id: 'b', status: 'paused' }), bill({ id: 'c', status: 'cancelled' }), bill({ id: 'd', status: 'review' as never })] // old 'review' bills still count;
    expect(billOccurrences(bills, '2026-10-01', '2026-10-31').map(o => o.bill.id)).toEqual(['a', 'd']);
  });

  it('computes monthly equivalents and totals', () => {
    expect(monthlyEquivalent(bill({ frequency: 'yearly', amountCents: 12000 }))).toBe(1000);
    expect(monthlyEquivalent(bill({ frequency: 'weekly', amountCents: 1200 }))).toBe(5200);
    expect(monthlyEquivalent(bill({ frequency: 'quarterly', amountCents: 3000 }))).toBe(1000);
    expect(monthlyEquivalent(bill({ status: 'cancelled' }))).toBe(0);
    expect(monthlyEquivalent(bill({ frequency: 'once' }))).toBe(0);
    const t = billTotals([bill({ amountCents: 1000 }), bill({ kind: 'subscription', amountCents: 1599 }), bill({ status: 'paused', amountCents: 999 })]);
    expect(t).toEqual({ monthly: 2599, yearly: 31188, subscriptionsMonthly: 1599 });
  });

  it('suggests bills for a payday, flagging those due soon', () => {
    const bills = [
      bill({ id: 'rent', dueDate: '2026-01-01' }),
      bill({ id: 'phone', name: 'Phone', dueDate: '2026-01-20' }),
      bill({ id: 'gym', name: 'Gym', dueDate: '2026-01-12' }),
      bill({ id: 'old', status: 'cancelled' }),
    ];
    const s = suggestBillsForPayday(bills, { date: '2026-10-15', items: [{ id: 'x', billId: 'gym', description: 'Gym', amountCents: 1, direction: 'out' }] });
    expect(s.map(x => [x.bill.id, x.due, x.dueSoon])).toEqual([
      ['phone', '2026-10-20', true],
      ['rent', '2026-11-01', false],
    ]);
  });
});

describe('payday maths', () => {
  const p = payday({
    items: [
      { id: '1', description: 'Rent', amountCents: 120000, direction: 'out', clearedOn: '2026-10-16' },
      { id: '2', description: 'Phone', amountCents: 8000, direction: 'out' },
      { id: '3', description: 'Uber', amountCents: 8420, direction: 'out', combinedCount: 9 },
      { id: '4', description: 'Refund', amountCents: 2000, direction: 'in' },
      { id: '5', description: 'Old', amountCents: 99999, direction: 'out', carriedOver: true },
    ],
    spending: [{ id: 's', date: '2026-10-16', description: 'Groceries', amountCents: 6000, clearedOn: '2026-10-17' }],
  });

  it('works out paying, leftover and what is still waiting', () => {
    const s = paydaySummary(p);
    expect(s.payingCents).toBe(136420);
    expect(s.incomingCents).toBe(2000);
    expect(s.spentCents).toBe(6000);
    expect(s.leftoverCents).toBe(300000 - 136420 + 2000 - 6000);
    // phone + uber still to leave, refund still to arrive
    expect(s.waitingCents).toBe(8000 + 8420 - 2000);
    expect(s.waitingCount).toBe(3);
    expect(s.expectedBankCents).toBe(300000 - 120000 - 6000);
  });

  it('checks the bank balance', () => {
    const ok = balanceCheck(p, 174000);
    expect(ok.matches).toBe(true);
    expect(ok.availableCents).toBe(174000 - 14420);
    const off = balanceCheck(p, 172500);
    expect(off.matches).toBe(false);
    expect(off.differenceCents).toBe(-1500);
  });

  it('is ready to spend only when everything cleared and the balance matches', () => {
    const cleared = payday({
      items: [{ id: '1', description: 'Rent', amountCents: 1000, direction: 'out', clearedOn: '2026-10-16' }],
    });
    expect(isReadyToSpend(cleared)).toBe(false); // no balance check yet
    expect(isReadyToSpend({ ...cleared, balanceChecks: [{ at: 'x', balanceCents: 299000 }] })).toBe(true);
    expect(isReadyToSpend({ ...cleared, balanceChecks: [{ at: 'x', balanceCents: 298000 }] })).toBe(false);
    expect(isReadyToSpend({ ...p, balanceChecks: [{ at: 'x', balanceCents: 174000 }] })).toBe(false);
  });
});

describe('mark paid', () => {
  const rent = bill({ dueDate: '2026-01-01' });

  it('pays the due date that just came up, then moves to the next', () => {
    // No payments yet: a bill due in the last week shows (overdue)
    expect(nextUnpaidDue(rent, '2026-10-05')).toBe('2026-10-01');
    expect(nextUnpaidDue(rent, '2026-10-16')).toBe('2026-11-01');
    const paid = markBillPaid(rent, '2026-10-05', 'p1');
    expect(paid.payments).toEqual([{ id: 'p1', forDue: '2026-10-01', paidOn: '2026-10-05', amountCents: 120000 }]);
    expect(nextUnpaidDue(paid, '2026-10-05')).toBe('2026-11-01');
    // Paying early covers the next one
    const twice = markBillPaid(paid, '2026-10-20', 'p2');
    expect(latestPayment(twice)?.forDue).toBe('2026-11-01');
    expect(nextUnpaidDue(twice, '2026-10-20')).toBe('2026-12-01');
  });

  it('undoes the latest payment', () => {
    const twice = markBillPaid(markBillPaid(rent, '2026-10-05', 'p1'), '2026-10-20', 'p2');
    const once = undoLastPayment(twice);
    expect(once.payments?.map(p => p.id)).toEqual(['p1']);
    expect(nextUnpaidDue(once, '2026-10-20')).toBe('2026-11-01');
  });

  it('settles a one-off bill', () => {
    const once = bill({ frequency: 'once', dueDate: '2026-09-01' });
    expect(nextUnpaidDue(once, '2026-10-16')).toBe('2026-09-01');
    const paid = markBillPaid(once, '2026-10-16', 'p');
    expect(nextUnpaidDue(paid, '2026-10-16')).toBeNull();
    expect(markBillPaid(paid, '2026-10-16', 'q')).toBe(paid);
  });
});

describe('budgetSummary', () => {
  const cats = [
    { id: 'home', name: 'Housing', monthlyPlannedCents: 130000, order: 0 },
    { id: 'food', name: 'Groceries', monthlyPlannedCents: 40000, order: 1 },
    { id: 'subs', name: 'Subscriptions', monthlyPlannedCents: 3000, order: 2 },
    { id: 'gone', name: 'Old', monthlyPlannedCents: 5000, order: 3, archived: true },
  ];

  it('counts a bill in its category as soon as it is entered', () => {
    const s = budgetSummary(cats, [bill({ id: 'rent', categoryId: 'home', dueDate: '2026-01-01' })], [], '2026-10');
    expect(s.rows.find(r => r.categoryId === 'home')).toMatchObject({ billsCents: 120000, paidCents: 0, leftCents: 10000 });
  });

  it('counts every due date in the month, and skips paused/cancelled bills', () => {
    const bills = [
      bill({ id: 'w', categoryId: 'subs', amountCents: 500, frequency: 'weekly', dueDate: '2026-10-02' }), // 5 Fridays
      bill({ id: 'y', categoryId: 'subs', amountCents: 9900, frequency: 'yearly', dueDate: '2026-03-01' }), // not this month
      bill({ id: 'p', categoryId: 'subs', amountCents: 1000, status: 'paused' }),
      bill({ id: 'c', categoryId: 'subs', amountCents: 1000, status: 'cancelled' }),
    ];
    expect(budgetSummary(cats, bills, [], '2026-10').rows.find(r => r.categoryId === 'subs')?.billsCents).toBe(2500);
  });

  it('shows marked payments for the month without counting them twice', () => {
    const rent = markBillPaid(bill({ id: 'rent', categoryId: 'home', dueDate: '2026-01-01' }), '2026-10-02', 'p1');
    const s = budgetSummary(cats, [rent], [], '2026-10');
    expect(s.rows.find(r => r.categoryId === 'home')).toMatchObject({ billsCents: 120000, paidCents: 120000, leftCents: 10000 });
    expect(budgetSummary(cats, [rent], [], '2026-11').rows.find(r => r.categoryId === 'home')?.paidCents).toBe(0);
  });

  it('adds logged spending by category and month', () => {
    const expenses = [
      { date: '2026-10-03', description: 'Store', amountCents: 5000, categoryId: 'food' },
      { date: '2026-11-01', description: 'Store', amountCents: 7000, categoryId: 'food' },
      { date: '2026-10-09', description: 'Gift', amountCents: 2500 },
    ];
    const s = budgetSummary(cats, [], expenses, '2026-10');
    expect(s.rows.map(r => [r.categoryId, r.spendingCents, r.leftCents])).toEqual([
      ['home', 0, 130000], ['food', 5000, 35000], ['subs', 0, 3000], [UNCATEGORIZED, 2500, -2500],
    ]);
  });

  it('adds Reconcile spending and one-off lines, but not bill lines, when paydays are given', () => {
    const bills = [bill({ id: 'rent', categoryId: 'home', dueDate: '2026-01-01' })];
    const p1 = payday({
      date: '2026-10-01',
      items: [
        { id: '1', billId: 'rent', description: 'Rent', amountCents: 120000, direction: 'out' },
        { id: '2', description: 'Misc', amountCents: 1500, direction: 'out' },
        { id: '3', description: 'Refund', amountCents: 999, direction: 'in' },
      ],
      spending: [{ id: 's1', date: '2026-10-03', description: 'Store', amountCents: 5000, categoryId: 'food' }],
    });
    const s = budgetSummary(cats, bills, [], '2026-10', [p1]);
    expect(s.rows.map(r => [r.categoryId, r.billsCents, r.spendingCents])).toEqual([
      ['home', 120000, 0], ['food', 0, 5000], ['subs', 0, 0], [UNCATEGORIZED, 0, 1500],
    ]);
    expect(s.totals).toMatchObject({ plannedCents: 173000, billsCents: 120000, spendingCents: 6500, leftCents: 46500 });
  });
});

describe('savings and goals', () => {
  const pot = { id: 'p', name: 'Emergency', targetCents: 100000, entries: [
    { id: '1', date: '2026-10-01', amountCents: 50000 },
    { id: '2', date: '2026-10-05', amountCents: -10000 },
  ] };

  it('sums a pot', () => {
    expect(potBalance(pot)).toBe(40000);
  });

  it('measures a goal from its pot or a typed amount', () => {
    expect(goalProgress({ name: 'G', targetCents: 80000, savingsPotId: 'p', status: 'active' }, [pot]))
      .toEqual({ currentCents: 40000, targetCents: 80000, fraction: 0.5, reached: false });
    expect(goalProgress({ name: 'G', targetCents: 1000, currentCents: 1500, status: 'active' }, []).reached).toBe(true);
    expect(goalProgress({ name: 'G', targetCents: 1000, currentCents: 1500, status: 'active' }, []).fraction).toBe(1);
  });
});

describe('reports', () => {
  const rent = { ...bill({ id: 'rent', categoryId: 'home', dueDate: '2026-01-01' }), payments: [
    { id: 'p1', forDue: '2026-09-01', paidOn: '2026-08-30', amountCents: 120000 },
    { id: 'p2', forDue: '2026-10-01', paidOn: '2026-10-01', amountCents: 120000 },
  ] };
  const netflix = { ...bill({ id: 'nf', name: 'Netflix', kind: 'subscription', amountCents: 1599, dueDate: '2026-01-15' }), payments: [
    { id: 'n1', forDue: '2026-10-15', paidOn: '2026-10-15', amountCents: 1599 },
  ] };

  it('collects marked payments, and reconcile lines without double counting', () => {
    const p = payday({ date: '2026-10-02', items: [
      { id: 'i1', billId: 'rent', description: 'Rent', amountCents: 120000, direction: 'out' }, // rent already marked paid in Oct
      { id: 'i2', billId: 'nf', description: 'Netflix', amountCents: 1599, direction: 'out' },  // Netflix marked in Oct too
      { id: 'i3', billId: 'gone', description: 'Old', amountCents: 500, direction: 'out' },     // deleted bill
    ] });
    const p2 = payday({ date: '2026-11-01', items: [{ id: 'i4', billId: 'rent', description: 'Rent', amountCents: 125000, direction: 'out' }] });
    const recs = billPaymentRecords([rent, netflix], [p, p2]);
    expect(recs.map(r => [r.billId, r.date, r.amountCents, r.source])).toEqual([
      ['rent', '2026-08-30', 120000, 'marked'],
      ['rent', '2026-10-01', 120000, 'marked'],
      ['nf', '2026-10-15', 1599, 'marked'],
      ['rent', '2026-11-01', 125000, 'reconcile'],
    ]);
  });

  it('filters by name, type, category and dates', () => {
    const recs = billPaymentRecords([rent, netflix]);
    const all = { start: '2026-01-01', end: '2026-12-31' };
    expect(filterPayments(recs, { ...all, query: 'net' }).map(r => r.billId)).toEqual(['nf']);
    expect(filterPayments(recs, { ...all, kind: 'bill' }).map(r => r.billId)).toEqual(['rent', 'rent']);
    expect(filterPayments(recs, { ...all, categoryId: UNCATEGORIZED }).map(r => r.billId)).toEqual(['nf']);
    expect(filterPayments(recs, { start: '2026-10-01', end: '2026-10-31' })).toHaveLength(2);
  });

  it('totals by bill and by month (empty months included)', () => {
    const recs = billPaymentRecords([rent, netflix]);
    const s = reportSummary(recs, '2026-08-01', '2026-10-31');
    expect(s.totalCents).toBe(241599);
    expect(s.count).toBe(3);
    expect(s.byBill.map(b => [b.billId, b.totalCents, b.count, b.lastPaid])).toEqual([
      ['rent', 240000, 2, '2026-10-01'], ['nf', 1599, 1, '2026-10-15'],
    ]);
    expect(s.byMonth).toEqual([
      { month: '2026-08', totalCents: 120000, count: 1 },
      { month: '2026-09', totalCents: 0, count: 0 },
      { month: '2026-10', totalCents: 121599, count: 2 },
    ]);
  });

  it('works out preset periods', () => {
    expect(periodRange('this-month', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('last-month', '2026-01-10')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(periodRange('this-year', '2026-10-16')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodRange('last-year', '2026-10-16')).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });
});
