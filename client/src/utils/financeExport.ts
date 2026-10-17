/**
 * Export all Finance data, decrypted in the browser: a complete JSON backup
 * and a CSV of every money movement for spreadsheets. Nothing here touches
 * the server beyond reading the user's own (encrypted) records.
 */
import { csvCell } from './csv.js';
import { centsToInput, goalProgress, monthlyEquivalent, nextUnpaidDue, paydaySummary, potBalance, todayStr } from './finance.js';
import { zipTextFiles } from './zip.js';
import type { FinanceKind, FinanceRecord } from '../types/finance.js';

const KINDS: FinanceKind[] = ['budget', 'bills', 'expenses', 'savings', 'goals', 'paydays'];

export interface FinanceExport {
  app: 'chronicles';
  kind: 'finance-export';
  version: 1;
  exportedAt: string;
  budget: FinanceRecord<'budget'>[];
  bills: FinanceRecord<'bills'>[];
  expenses: FinanceRecord<'expenses'>[];
  savings: FinanceRecord<'savings'>[];
  goals: FinanceRecord<'goals'>[];
  paydays: FinanceRecord<'paydays'>[];
  /** Rows that couldn't be decrypted, per kind (left out of the export). */
  unreadable: Partial<Record<FinanceKind, number>>;
}

export interface CollectFinanceDeps {
  list: (kind: FinanceKind) => Promise<{ records: { id: string; payload: string; iv: string; createdAt: string; updatedAt: string }[] }>;
  decryptRecord: <T>(kind: string, id: string, payload: string, iv: string) => Promise<T>;
  now?: () => Date;
}

/** Fetch and decrypt every Finance record (fresh from the server, not the cache). */
export async function collectFinanceData(deps: CollectFinanceDeps): Promise<FinanceExport> {
  const out = {
    app: 'chronicles', kind: 'finance-export', version: 1,
    exportedAt: (deps.now?.() ?? new Date()).toISOString(),
    budget: [], bills: [], expenses: [], savings: [], goals: [], paydays: [],
    unreadable: {},
  } as FinanceExport;
  for (const kind of KINDS) {
    const { records } = await deps.list(kind);
    const rows: unknown[] = [];
    let bad = 0;
    for (const r of records) {
      try {
        const data = await deps.decryptRecord<Record<string, unknown>>(kind, r.id, r.payload, r.iv);
        rows.push({ id: r.id, ...data, createdAt: r.createdAt, updatedAt: r.updatedAt });
      } catch {
        bad++;
      }
    }
    (out as unknown as Record<FinanceKind, unknown[]>)[kind] = rows;
    if (bad) out.unreadable[kind] = bad;
  }
  return out;
}

export function financeExportJson(data: FinanceExport): string {
  return JSON.stringify(data, null, 2) + '\n';
}

const money = (cents: number) => centsToInput(cents);

/**
 * One row per money movement, oldest first. Amount is signed from your
 * account's point of view: money out is negative, money in positive
 * (savings: adding to a fund is positive, taking out negative).
 */
export function financeMovementsCsv(data: FinanceExport): string {
  const catName = new Map(data.budget.map(c => [c.id, c.name]));
  const cat = (id?: string) => (id ? catName.get(id) ?? '' : '');
  const billById = new Map(data.bills.map(b => [b.id, b]));
  const rows: { date: string; type: string; description: string; category: string; amount: string; details: string }[] = [];

  for (const b of data.bills) {
    for (const p of b.payments ?? []) {
      rows.push({
        date: p.paidOn, type: b.kind === 'subscription' ? 'Subscription payment' : 'Bill payment',
        description: b.name, category: cat(b.categoryId), amount: money(-p.amountCents), details: `For due date ${p.forDue}`,
      });
    }
  }
  for (const e of data.expenses) {
    rows.push({ date: e.date, type: 'Spending', description: e.description, category: cat(e.categoryId), amount: money(-e.amountCents), details: '' });
  }
  for (const f of data.savings) {
    for (const e of f.entries) {
      rows.push({
        date: e.date, type: e.amountCents >= 0 ? 'Savings deposit' : 'Savings withdrawal',
        description: f.name, category: '', amount: money(e.amountCents), details: e.note ?? '',
      });
    }
  }
  for (const p of data.paydays) {
    for (const i of p.items) {
      if (i.carriedOver) continue;
      const combined = i.combinedCount ? `${i.combinedCount} combined${i.combinedPeriod ? ` (${i.combinedPeriod})` : ''}` : i.combinedPeriod ?? '';
      rows.push({
        date: p.date, type: i.direction === 'in' ? 'Payday — coming in' : 'Payday — paying',
        description: i.description, category: cat(i.categoryId ?? (i.billId ? billById.get(i.billId)?.categoryId : undefined)),
        amount: money(i.direction === 'in' ? i.amountCents : -i.amountCents),
        details: [i.clearedOn ? `Cleared ${i.clearedOn}` : 'Not cleared', combined].filter(Boolean).join(' · '),
      });
    }
    for (const sp of p.spending) {
      rows.push({
        date: sp.date, type: 'Payday — spending', description: sp.description, category: cat(sp.categoryId),
        amount: money(-sp.amountCents), details: sp.clearedOn ? `Cleared ${sp.clearedOn}` : 'Not cleared',
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.description.localeCompare(b.description));
  const header = ['Date', 'Type', 'Description', 'Category', 'Amount', 'Details'].join(',');
  // Amount is a number we generate, so it's written as-is (the formula guard
  // would turn "-12.00" into text); every free-text cell is guarded.
  const lines = rows.map(r => [csvCell(r.date), csvCell(r.type), csvCell(r.description), csvCell(r.category), r.amount, csvCell(r.details)].join(','));
  return [header, ...lines].join('\n') + '\n';
}

/* ── Per-section spreadsheets + the ZIP that bundles them ── */

/** A CSV from rows; `numeric` columns (amounts we generate) skip the formula guard. */
function table(header: string[], rows: (string | number | undefined)[][], numeric: number[] = []): string {
  const num = new Set(numeric);
  const line = (cols: (string | number | undefined)[]) =>
    cols.map((v, i) => (num.has(i) ? String(v ?? '') : csvCell(String(v ?? '')))).join(',');
  return [header.join(','), ...rows.map(line)].join('\n') + '\n';
}

const yesNo = (b?: boolean) => (b ? 'Yes' : '');

/** Every section as its own spreadsheet, plus all transactions and the JSON backup. */
export function financeExportFiles(data: FinanceExport, today = todayStr()): { name: string; text: string }[] {
  const catName = new Map(data.budget.map(c => [c.id, c.name]));
  const cat = (id?: string) => (id ? catName.get(id) ?? '' : '');
  const fundName = new Map(data.savings.map(f => [f.id, f.name]));
  const billById = new Map(data.bills.map(b => [b.id, b]));

  const budget = table(
    ['Category', 'Planned per month', 'Archived', 'Order'],
    [...data.budget].sort((a, b) => a.order - b.order).map(c => [c.name, money(c.monthlyPlannedCents), yesNo(c.archived), c.order]),
    [1, 3],
  );

  const bills = table(
    ['Name', 'Type', 'Amount', 'How often', 'Due date (schedule repeats from)', 'Next due', 'Monthly cost', 'Category', 'Autopay', 'Status', 'Cancelled on', 'Notes'],
    data.bills.map(b => [
      b.name, b.kind === 'subscription' ? 'Subscription' : 'Bill', money(b.amountCents), b.frequency, b.dueDate,
      b.status === 'active' ? nextUnpaidDue(b, today) ?? '' : '', money(monthlyEquivalent(b)), cat(b.categoryId),
      yesNo(b.autopay), b.status, b.cancelledOn ?? '', b.notes ?? '',
    ]),
    [2, 6],
  );

  const payments = table(
    ['Paid on', 'Bill', 'Type', 'Category', 'For due date', 'Amount'],
    data.bills.flatMap(b => (b.payments ?? []).map(p => [p.paidOn, b.name, b.kind === 'subscription' ? 'Subscription' : 'Bill', cat(b.categoryId), p.forDue, money(p.amountCents)]))
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [5],
  );

  const spending = table(
    ['Date', 'Description', 'Category', 'Amount'],
    [...data.expenses].sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, e.description, cat(e.categoryId), money(e.amountCents)]),
    [3],
  );

  const funds = table(
    ['Fund', 'Target', 'Balance', 'Entries', 'Archived'],
    data.savings.map(f => [f.name, f.targetCents !== undefined ? money(f.targetCents) : '', money(potBalance(f)), f.entries.length, yesNo(f.archived)]),
    [1, 2, 3],
  );

  const fundEntries = table(
    ['Date', 'Fund', 'Amount', 'Note'],
    data.savings.flatMap(f => f.entries.map(e => [e.date, f.name, money(e.amountCents), e.note ?? '']))
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [2],
  );

  const goals = table(
    ['Goal', 'Target', 'Target date', 'Current', 'Progress %', 'Linked fund', 'Status', 'Notes'],
    data.goals.map(g => {
      const p = goalProgress(g, data.savings);
      return [g.name, money(g.targetCents), g.targetDate ?? '', money(p.currentCents), Math.round(p.fraction * 100),
        g.savingsPotId ? fundName.get(g.savingsPotId) ?? '(deleted fund)' : '', g.status, g.notes ?? ''];
    }),
    [1, 3, 4],
  );

  const sortedPaydays = [...data.paydays].sort((a, b) => a.date.localeCompare(b.date));
  const paydays = table(
    ['Payday', 'Starting balance', 'Paying', 'Coming in', 'Spent', 'Leftover', 'Still waiting', 'Status', 'Closed on', 'Last balance check', 'Note'],
    sortedPaydays.map(p => {
      const s = paydaySummary(p);
      const last = p.balanceChecks[p.balanceChecks.length - 1];
      return [p.date, money(p.startingBalanceCents), money(s.payingCents), money(s.incomingCents), money(s.spentCents),
        money(s.leftoverCents), money(s.waitingCents), p.status, p.closedOn ?? '', last ? money(last.balanceCents) : '', p.note ?? ''];
    }),
    [1, 2, 3, 4, 5, 6, 9],
  );

  const paydayLines = table(
    ['Payday', 'Kind', 'Description', 'Category', 'Amount', 'Cleared on', 'Combined', 'Carried to a later payday'],
    sortedPaydays.flatMap(p => [
      ...p.items.map(i => [
        p.date, i.direction === 'in' ? 'Coming in' : 'Paying', i.description,
        cat(i.categoryId ?? (i.billId ? billById.get(i.billId)?.categoryId : undefined)),
        money(i.direction === 'in' ? i.amountCents : -i.amountCents), i.clearedOn ?? '',
        i.combinedCount ? `${i.combinedCount}${i.combinedPeriod ? ` (${i.combinedPeriod})` : ''}` : i.combinedPeriod ?? '',
        yesNo(i.carriedOver),
      ]),
      ...p.spending.map(sp => [p.date, 'Spending', sp.description, cat(sp.categoryId), money(-sp.amountCents), sp.clearedOn ?? '', '', '']),
    ]),
    [4],
  );

  return [
    { name: 'transactions.csv', text: financeMovementsCsv(data) },
    { name: 'budget-categories.csv', text: budget },
    { name: 'bills.csv', text: bills },
    { name: 'bill-payments.csv', text: payments },
    { name: 'spending.csv', text: spending },
    { name: 'savings-funds.csv', text: funds },
    { name: 'savings-entries.csv', text: fundEntries },
    { name: 'goals.csv', text: goals },
    { name: 'paydays.csv', text: paydays },
    { name: 'payday-lines.csv', text: paydayLines },
    { name: 'finance.json', text: financeExportJson(data) },
  ];
}

/** One ZIP with every Finance spreadsheet and the JSON backup. */
export function financeExportZip(data: FinanceExport, today = todayStr()): Uint8Array {
  return zipTextFiles(financeExportFiles(data, today));
}
