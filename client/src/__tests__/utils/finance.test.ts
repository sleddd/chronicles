import { describe, it, expect } from 'vitest';
import { spendingBreakdown,
  parseMoney, formatCents, addMonthsClamped, billDueDates, nextDueDate, billOccurrences,
  monthlyEquivalent, billTotals, budgetSummary, potBalance, goalProgress, UNCATEGORIZED, shiftMonth,
  nextUnpaidDue, markBillPaid, undoLastPayment, latestPayment, billMonthState, markBillPaidFor, undoPaymentFor, payPartFor, isDuePaid, leftToPay,
  billPaymentRecords, filterPayments, reportSummary, periodRange, averagePerMonth, primaryBillAction,
} from '../../utils/finance.js';
import type { Bill } from '../../types/finance.js';

const bill = (over: Partial<Bill> & { id?: string } = {}): Bill & { id: string } => ({
  id: 'b1', name: 'Rent', kind: 'bill', amountCents: 120000, frequency: 'monthly',
  dueDate: '2026-01-31', status: 'active', ...over,
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

});

describe('mark paid', () => {
  const rent = bill({ dueDate: '2026-01-01' });

  it('pays the due date that just came up, then moves to the next', () => {
    // No payments yet: a bill due in the last week shows (overdue)
    expect(nextUnpaidDue(rent, '2026-10-05')).toBe('2026-10-01');
    expect(nextUnpaidDue(rent, '2026-10-16')).toBe('2026-11-01');
    const paid = markBillPaid(rent, '2026-10-05', 'p1', '2026-10-05T12:00:00.000Z');
    expect(paid.payments).toEqual([{ id: 'p1', forDue: '2026-10-01', paidOn: '2026-10-05', paidAt: '2026-10-05T12:00:00.000Z', amountCents: 120000 }]);
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

  it('collects marked payments, oldest first', () => {
    const recs = billPaymentRecords([rent, netflix]);
    expect(recs.map(r => [r.billId, r.date, r.amountCents])).toEqual([
      ['rent', '2026-08-30', 120000],
      ['rent', '2026-10-01', 120000],
      ['nf', '2026-10-15', 1599],
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

describe('averagePerMonth', () => {
  const months = (vals: [string, number][]) => vals.map(([month, totalCents]) => ({ month, totalCents, count: totalCents ? 1 : 0 }));

  it('skips months before the first payment and months still to come', () => {
    const byMonth = months([['2026-01', 0], ['2026-02', 0], ['2026-03', 1000], ['2026-04', 0], ['2026-05', 2000], ['2026-06', 0]]);
    // March–May: 3 months (April's real zero counts), June is in the future
    expect(averagePerMonth(byMonth, '2026-05-20')).toEqual({ averageCents: 1000, months: 3 });
  });

  it('handles no payments and a single month', () => {
    expect(averagePerMonth(months([['2026-01', 0]]), '2026-01-10')).toEqual({ averageCents: 0, months: 0 });
    expect(averagePerMonth(months([['2026-10', 4500]]), '2026-10-16')).toEqual({ averageCents: 4500, months: 1 });
  });

  it('uses the whole range when it is in the past', () => {
    const byMonth = months([['2025-11', 1000], ['2025-12', 3000]]);
    expect(averagePerMonth(byMonth, '2026-10-16')).toEqual({ averageCents: 2000, months: 2 });
  });
});

describe('primaryBillAction', () => {
  const rent = bill({ dueDate: '2026-01-01' });

  it('offers Mark paid when due soon or overdue, or never paid', () => {
    expect(primaryBillAction(rent, '2026-10-28')).toBe('mark');               // Nov 1 is 4 days off
    expect(primaryBillAction(rent, '2026-10-16')).toBe('mark');               // never paid
    expect(primaryBillAction(markBillPaid(rent, '2026-09-01', 'p'), '2026-10-03')).toBe('mark'); // Oct 1 overdue
  });

  it('offers Undo paid once the current one is paid and the next is not due yet', () => {
    expect(primaryBillAction(markBillPaid(rent, '2026-10-01', 'p'), '2026-10-16')).toBe('undo');
  });

  it('offers nothing for paused bills that were never paid', () => {
    expect(primaryBillAction(bill({ status: 'paused' }), '2026-10-16')).toBeNull();
    expect(primaryBillAction(markBillPaid(bill({ frequency: 'once', dueDate: '2026-10-01' }), '2026-10-01', 'p'), '2026-10-16')).toBe('undo');
  });
});

describe('billPeriodSuffix', () => {
  it('names how often the bill\'s own amount is paid', async () => {
    const { billPeriodSuffix } = await import('@/utils/finance');
    expect(billPeriodSuffix('quarterly')).toBe('/quarter');
    expect(billPeriodSuffix('monthly')).toBe('/mo');
    expect(billPeriodSuffix('biweekly')).toBe('/2 wks');
    expect(billPeriodSuffix('once')).toBe(' once');
  });
});

describe('billMonthState', () => {
  const b = bill({ dueDate: '2026-01-15', payments: [{ id: 'p', forDue: '2026-10-15', paidOn: '2026-10-16', amountCents: 120000 }] });
  it('reads the month on screen', () => {
    expect(billMonthState(b, '2026-10', '2026-11-01')).toMatchObject({ kind: 'paid', due: '2026-10-15' });
    expect(billMonthState(b, '2026-11', '2026-11-01')).toEqual({ kind: 'unpaid', due: '2026-11-15', paidCents: 0, leftCents: 120000 });
    expect(billMonthState(bill({ frequency: 'quarterly', dueDate: '2026-01-15' }), '2026-11', '2026-11-01')).toEqual({ kind: 'none', due: '2027-01-15' });
    expect(billMonthState(bill({ status: 'paused' }), '2026-11', '2026-11-01')).toEqual({ kind: 'none', due: null });
  });
  it('pays and undoes one particular due date', () => {
    const paid = markBillPaidFor(b, '2026-11-15', '2026-11-01', 'q', 'T');
    expect(paid.payments!.map(p => p.forDue)).toEqual(['2026-10-15', '2026-11-15']);
    expect(markBillPaidFor(paid, '2026-11-15', '2026-11-02', 'r')).toBe(paid);
    expect(undoPaymentFor(paid, '2026-10-15').payments!.map(p => p.forDue)).toEqual(['2026-11-15']);
  });
});

describe('part payments', () => {
  const b = bill({ amountCents: 10000, dueDate: '2026-01-15' });
  it('counts parts toward one due date and pays it once they add up', () => {
    const one = payPartFor(b, '2026-11-15', 4000, '2026-11-01', 'a', 'T1');
    expect(one.payments![0].partial).toBe(true);
    expect(isDuePaid(one, '2026-11-15')).toBe(false);
    expect(leftToPay(one, '2026-11-15')).toBe(6000);
    expect(billMonthState(one, '2026-11', '2026-11-01')).toEqual({ kind: 'unpaid', due: '2026-11-15', paidCents: 4000, leftCents: 6000 });
    expect(nextUnpaidDue(one, '2026-11-01')).toBe('2026-11-15');
    const two = payPartFor(one, '2026-11-15', 6000, '2026-11-03', 'b', 'T2');
    expect(isDuePaid(two, '2026-11-15')).toBe(true);
    expect(two.payments![1].partial).toBeUndefined();
    expect(nextUnpaidDue(two, '2026-11-03')).toBe('2026-12-15');
  });
  it('Mark paid pays only the rest, and Undo takes off the latest payment', () => {
    const part = payPartFor(b, '2026-11-15', 2500, '2026-11-01', 'a', 'T1');
    const rest = markBillPaidFor(part, '2026-11-15', '2026-11-02', 'b', 'T2');
    expect(rest.payments!.map(p => p.amountCents)).toEqual([2500, 7500]);
    expect(isDuePaid(rest, '2026-11-15')).toBe(true);
    const undone = undoPaymentFor(rest, '2026-11-15');
    expect(undone.payments!.map(p => p.id)).toEqual(['a']);
  });
  it('a full payment stays paid when the bill amount goes up later', () => {
    const paid = markBillPaidFor(b, '2026-10-15', '2026-10-15', 'a', 'T');
    expect(isDuePaid({ ...paid, amountCents: 12000 }, '2026-10-15')).toBe(true);
  });
});

describe('spendingBreakdown', () => {
  const row = (categoryId: string, billsCents: number, spendingCents: number) =>
    ({ categoryId, name: categoryId, plannedCents: 0, billsCents, paidCents: 0, spendingCents, leftCents: 0 });

  it('ranks categories by bills + spending and folds the rest', () => {
    const s = spendingBreakdown([row('a', 100, 0), row('b', 0, 500), row('c', 200, 100), row('d', 50, 0), row('e', 30, 0), row('f', 20, 0), row('z', 0, 0)]);
    expect(s.map(x => x.name)).toEqual(['b', 'c', 'a', 'd', 'Everything else']);
    expect(s[4].cents).toBe(50);
    expect(s.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1);
  });

  it('names one extra category rather than folding it alone', () => {
    expect(spendingBreakdown([row('a', 5, 0), row('b', 4, 0), row('c', 3, 0), row('d', 2, 0), row('e', 1, 0)]).map(x => x.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is empty with nothing spent', () => {
    expect(spendingBreakdown([row('a', 0, 0)])).toEqual([]);
  });
});
