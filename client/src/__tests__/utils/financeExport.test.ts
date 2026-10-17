import { describe, it, expect } from 'vitest';
import { collectFinanceData, financeExportFiles, financeExportJson, financeMovementsCsv } from '../../utils/financeExport.js';
import { planFinanceSeed } from '../../utils/seedFinanceData.js';
import { parseCsvRow, splitCsvLines } from '../../utils/csv.js';
import type { FinanceKind } from '../../types/finance.js';

const TODAY = '2026-10-16';

/** A fake server holding the seed plan "encrypted" as JSON. */
function fakeServer(extraBad = 0) {
  const plan = planFinanceSeed(TODAY);
  const list = async (kind: FinanceKind) => {
    const recs = (plan[kind as keyof typeof plan] as { id: string }[]).map(({ id, ...rest }) => ({
      id, payload: JSON.stringify({ kind, id, rest }), iv: 'iv', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z',
    }));
    if (kind === 'bills') for (let i = 0; i < extraBad; i++) recs.push({ id: `bad${i}`, payload: 'garbage', iv: 'iv', createdAt: '', updatedAt: '' });
    return { records: recs };
  };
  const decryptRecord = async <T,>(kind: string, id: string, payload: string): Promise<T> => {
    const p = JSON.parse(payload);
    if (p.kind !== kind || p.id !== id) throw new Error('aad');
    return p.rest as T;
  };
  return { plan, list, decryptRecord };
}

describe('collectFinanceData', () => {
  it('decrypts every kind, keeps ids and dates, and counts unreadable rows', async () => {
    const { plan, list, decryptRecord } = fakeServer(2);
    const data = await collectFinanceData({ list, decryptRecord, now: () => new Date('2026-10-16T12:00:00Z') });
    expect(data.exportedAt).toBe('2026-10-16T12:00:00.000Z');
    expect(data.bills).toHaveLength(plan.bills.length);
    expect(data.paydays).toHaveLength(2);
    expect(data.bills[0]).toMatchObject({ id: plan.bills[0].id, name: 'Rent', createdAt: '2026-10-01T00:00:00Z' });
    expect(data.unreadable).toEqual({ bills: 2 });
    expect(JSON.parse(financeExportJson(data)).kind).toBe('finance-export');
  });
});

describe('financeMovementsCsv', () => {
  it('lists every money movement with signed amounts, oldest first', async () => {
    const { list, decryptRecord } = fakeServer();
    const data = await collectFinanceData({ list, decryptRecord });
    const lines = splitCsvLines(financeMovementsCsv(data)).filter(Boolean);
    expect(lines[0]).toBe('Date,Type,Description,Category,Amount,Details');
    const rows = lines.slice(1).map(parseCsvRow);
    const types = new Set(rows.map(r => r[1]));
    for (const t of ['Bill payment', 'Subscription payment', 'Spending', 'Savings deposit', 'Savings withdrawal', 'Payday — paying', 'Payday — coming in', 'Payday — spending']) {
      expect(types.has(t)).toBe(true);
    }
    const dates = rows.map(r => r[0]);
    expect([...dates].sort()).toEqual(dates);
    const rent = rows.find(r => r[2] === 'Rent' && r[1] === 'Bill payment')!;
    expect(rent[3]).toBe('Housing');
    expect(rent[4]).toBe('-1450.00'); // a plain number, not guarded as text
    expect(rows.find(r => r[1] === 'Payday — coming in')![4]).toBe('36.00');
  });

  it('guards free text against spreadsheet formulas', async () => {
    const { list, decryptRecord } = fakeServer();
    const data = await collectFinanceData({ list, decryptRecord });
    data.expenses.push({ id: 'x', date: '2026-10-10', description: '=HYPERLINK("http://evil")', amountCents: 100 });
    const csv = financeMovementsCsv(data);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('financeExportFiles', () => {
  it('has a spreadsheet for every section plus the JSON backup', async () => {
    const { plan, list, decryptRecord } = fakeServer();
    const data = await collectFinanceData({ list, decryptRecord });
    const files = financeExportFiles(data, TODAY);
    expect(files.map(f => f.name)).toEqual([
      'transactions.csv', 'budget-categories.csv', 'bills.csv', 'bill-payments.csv', 'spending.csv',
      'savings-funds.csv', 'savings-entries.csv', 'goals.csv', 'paydays.csv', 'payday-lines.csv', 'finance.json',
    ]);
    const rows = (name: string) => splitCsvLines(files.find(f => f.name === name)!.text).filter(Boolean).map(parseCsvRow);
    expect(rows('budget-categories.csv')).toHaveLength(plan.budget.length + 1);
    expect(rows('bills.csv')).toHaveLength(plan.bills.length + 1);
    const paymentCount = plan.bills.reduce((t, b) => t + (b.payments?.length ?? 0), 0);
    expect(rows('bill-payments.csv')).toHaveLength(paymentCount + 1);
    expect(rows('spending.csv')).toHaveLength(plan.expenses.length + 1);
    const rent = rows('bills.csv').find(r => r[0] === 'Rent')!;
    expect(rent.slice(1, 3)).toEqual(['Bill', '1450.00']);
    const emergency = rows('goals.csv').find(r => r[0] === 'Six-month emergency fund')!;
    expect(emergency[5]).toBe('Emergency fund');
    expect(rows('paydays.csv')[1][0] < rows('paydays.csv')[2][0]).toBe(true);
    expect(JSON.parse(files.at(-1)!.text).bills).toHaveLength(plan.bills.length);
  });
});
