import { describe, it, expect, vi } from 'vitest';
import { planFinanceSeed, seedFinanceData } from '../../utils/seedFinanceData.js';
import { budgetSummary, billPaymentRecords, isReadyToSpend, nextUnpaidDue } from '../../utils/finance.js';

const TODAY = '2026-10-16';

describe('planFinanceSeed', () => {
  const plan = planFinanceSeed(TODAY);
  const catIds = new Set(plan.budget.map(c => c.id));

  it('links everything to records that exist', () => {
    for (const b of plan.bills) expect(catIds.has(b.categoryId!)).toBe(true);
    for (const e of plan.expenses) expect(catIds.has(e.categoryId!)).toBe(true);
    const potIds = new Set(plan.savings.map(p => p.id));
    for (const g of plan.goals) if (g.savingsPotId) expect(potIds.has(g.savingsPotId)).toBe(true);
    const billIds = new Set(plan.bills.map(b => b.id));
    for (const p of plan.paydays) for (const i of p.items) if (i.billId) expect(billIds.has(i.billId)).toBe(true);
  });

  it('never records anything in the future', () => {
    for (const b of plan.bills) for (const p of b.payments ?? []) expect(p.paidOn <= TODAY).toBe(true);
    for (const e of plan.expenses) expect(e.date <= TODAY).toBe(true);
    for (const s of plan.savings) for (const e of s.entries) expect(e.date <= TODAY).toBe(true);
  });

  it('only pays active bills, and leaves them paid up to date', () => {
    for (const b of plan.bills) {
      if (b.status !== 'active') expect(b.payments).toBeUndefined();
      else expect(nextUnpaidDue(b, TODAY)! > TODAY).toBe(true);
    }
  });

  it('fills the budget and reports with sensible numbers', () => {
    const s = budgetSummary(plan.budget, plan.bills, plan.expenses, TODAY.slice(0, 7));
    expect(s.totals.plannedCents).toBeGreaterThan(0);
    expect(s.totals.billsCents).toBeGreaterThan(0);
    expect(s.totals.spendingCents).toBeGreaterThan(0);
    expect(billPaymentRecords(plan.bills, plan.paydays).length).toBeGreaterThan(30);
  });

  it('has a closed, fully reconciled payday and an open one', () => {
    const [prev, latest] = plan.paydays;
    expect(prev.status).toBe('closed');
    expect(isReadyToSpend(prev)).toBe(true);
    expect(latest.status).toBe('open');
    expect(isReadyToSpend(latest)).toBe(false);
  });
});

describe('seedFinanceData', () => {
  it('encrypts and uploads every record by kind', async () => {
    const encryptRecord = vi.fn(async () => ({ payload: 'p', iv: 'i' }));
    const put = vi.fn(async () => ({}));
    const msg = await seedFinanceData({ encryptRecord, put, today: TODAY });
    const kinds = new Set(put.mock.calls.map(c => (c as unknown[])[0]));
    expect([...kinds].sort()).toEqual(['bills', 'budget', 'expenses', 'goals', 'paydays', 'savings']);
    expect(encryptRecord).toHaveBeenCalledTimes(put.mock.calls.length);
    // The row id is never inside the encrypted record
    for (const call of encryptRecord.mock.calls as unknown as [string, string, Record<string, unknown>][]) expect(call[2].id).toBeUndefined();
    expect(msg).toMatch(/^Added \d+ finance records/);
  });
});
