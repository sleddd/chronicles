/**
 * Pure Finance helpers — money maths, bill schedules and budget totals.
 * Money is integer cents throughout; dates are YYYY-MM-DD strings, handled in
 * UTC so no time zone can shift a day.
 */
import type {
  Bill, BillFrequency, BillPayment, BudgetCategory, FinanceExpense, FinanceMeta, FinanceGoal, SavingsPot,
} from '../types/finance.js';

// ── Money ───────────────────────────────────────────────────────────────────

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "$1,234.56" / "-$12.00". */
export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/** Parse what someone typed ("1,234.5", "$12", "-3.20") into cents; null when it isn't money. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^-?(\d+\.?\d{0,2}|\.\d{1,2})$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

/** Cents → the plain string shown in an input ("1234.50"). */
export function centsToInput(cents: number | undefined): string {
  if (cents === undefined || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2);
}

// ── Dates ───────────────────────────────────────────────────────────────────

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDay(d);
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** `anchor` moved by whole months, keeping its day (clamped to short months: Jan 31 → Feb 28/29). */
export function addMonthsClamped(anchor: string, months: number): string {
  const [y, m, d] = anchor.split('-').map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm0 = ((total % 12) + 12) % 12;
  const nd = Math.min(d, daysInMonth(ny, nm0));
  return fmtDay(new Date(Date.UTC(ny, nm0, nd)));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

/** Today in local time as YYYY-MM-DD. */
export function todayStr(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "Oct 7, 2026". */
export function formatDay(day: string): string {
  return parseDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "October 2026" for a YYYY-MM month. */
export function formatMonth(month: string): string {
  return parseDay(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function shiftMonth(month: string, n: number): string {
  return addMonthsClamped(`${month}-01`, n).slice(0, 7);
}

// ── Bill schedules ──────────────────────────────────────────────────────────

const MONTH_STEP: Partial<Record<BillFrequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 };
const DAY_STEP: Partial<Record<BillFrequency, number>> = { weekly: 7, biweekly: 14 };

/** Does this bill still count (not paused or cancelled)? Any other status — e.g. an old 'review' — counts as active. */
export function billCounts(bill: Bill): boolean {
  return bill.status !== 'paused' && bill.status !== 'cancelled';
}

/** The n-th due date of a bill counted from its anchor (n may be negative). */
function occurrence(bill: Bill, n: number): string {
  const months = MONTH_STEP[bill.frequency];
  if (months) return addMonthsClamped(bill.dueDate, n * months);
  const days = DAY_STEP[bill.frequency];
  if (days) return addDays(bill.dueDate, n * days);
  return bill.dueDate;
}

/** Every due date of a bill in [start, end] (inclusive). */
export function billDueDates(bill: Bill, start: string, end: string): string[] {
  if (bill.frequency === 'once') {
    return bill.dueDate >= start && bill.dueDate <= end ? [bill.dueDate] : [];
  }
  // Estimate the first index at/after `start`, then walk
  const stepDays = DAY_STEP[bill.frequency] ?? (MONTH_STEP[bill.frequency] ?? 1) * 30.44;
  let n = Math.floor(daysBetween(bill.dueDate, start) / stepDays) - 1;
  while (occurrence(bill, n) >= start) n--;
  const out: string[] = [];
  for (let i = n + 1; ; i++) {
    const day = occurrence(bill, i);
    if (day > end) break;
    if (day >= start) out.push(day);
    if (out.length > 400) break;
  }
  return out;
}

/** The first due date on or after `from`, or null (a past one-off bill). */
export function nextDueDate(bill: Bill, from: string): string | null {
  if (bill.frequency === 'once') return bill.dueDate >= from ? bill.dueDate : null;
  return billDueDates(bill, from, addMonthsClamped(from, 13))[0] ?? null;
}

/** Bill occurrences in a date range, for the Calendar. Paused/cancelled bills are left out. */
export function billOccurrences<B extends Bill & FinanceMeta>(bills: B[], start: string, end: string): { bill: B; date: string }[] {
  const out: { bill: B; date: string }[] = [];
  for (const bill of bills) {
    if (!billCounts(bill)) continue;
    for (const date of billDueDates(bill, start, end)) out.push({ bill, date });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.bill.name.localeCompare(b.bill.name));
}

/** What a bill costs per month on average (0 for paused, cancelled and one-off bills). */
export function monthlyEquivalent(bill: Bill): number {
  if (!billCounts(bill)) return 0;
  switch (bill.frequency) {
    case 'weekly': return Math.round((bill.amountCents * 52) / 12);
    case 'biweekly': return Math.round((bill.amountCents * 26) / 12);
    case 'monthly': return bill.amountCents;
    case 'quarterly': return Math.round(bill.amountCents / 3);
    case 'yearly': return Math.round(bill.amountCents / 12);
    default: return 0;
  }
}

/** How often a bill's own amount is paid, written after it: "$160.00/quarter" */
export function billPeriodSuffix(frequency: BillFrequency): string {
  switch (frequency) {
    case 'weekly': return '/wk';
    case 'biweekly': return '/2 wks';
    case 'monthly': return '/mo';
    case 'quarterly': return '/quarter';
    case 'yearly': return '/yr';
    default: return ' once';
  }
}

export interface BillTotals { monthly: number; yearly: number; subscriptionsMonthly: number }

export function billTotals(bills: Bill[]): BillTotals {
  let monthly = 0;
  let subscriptionsMonthly = 0;
  for (const b of bills) {
    const m = monthlyEquivalent(b);
    monthly += m;
    if (b.kind === 'subscription') subscriptionsMonthly += m;
  }
  return { monthly, yearly: monthly * 12, subscriptionsMonthly };
}

// ── Mark paid (payments recorded on the bill only) ──────────────────────────

/** What's been paid toward one due date */
export function paidToward(bill: Bill, forDue: string): number {
  return (bill.payments ?? []).reduce((t, p) => (p.forDue === forDue ? t + p.amountCents : t), 0);
}

/** Whether a due date is paid: a full payment, or parts adding up to the bill */
export function isDuePaid(bill: Bill, forDue: string): boolean {
  const mine = (bill.payments ?? []).filter(p => p.forDue === forDue);
  if (!mine.length) return false;
  return mine.some(p => !p.partial) || paidToward(bill, forDue) >= bill.amountCents;
}

/** What's still owed on a due date (0 once it's paid) */
export function leftToPay(bill: Bill, forDue: string): number {
  return isDuePaid(bill, forDue) ? 0 : Math.max(0, bill.amountCents - paidToward(bill, forDue));
}

/** The latest due date that's paid (part payments count once they add up). */
export function lastPaidDue(bill: Bill): string | undefined {
  let last: string | undefined;
  for (const p of bill.payments ?? []) if ((!last || p.forDue > last) && isDuePaid(bill, p.forDue)) last = p.forDue;
  return last;
}

/**
 * The next due date that hasn't been paid: the one after the last paid due
 * date, or — before any payment is recorded — the next one from a week ago
 * (so a bill that just came due still shows, as overdue). Null when nothing
 * is left (a paid one-off bill).
 */
export function nextUnpaidDue(bill: Bill, today: string): string | null {
  const last = lastPaidDue(bill);
  if (bill.frequency === 'once') return last ? null : bill.dueDate;
  return last ? nextDueDate(bill, addDays(last, 1)) : nextDueDate(bill, addDays(today, -7));
}

/** Record a payment for the next unpaid due date: what's left of it (all of
 *  it, unless part was paid already). */
export function markBillPaid<B extends Bill>(bill: B, today: string, id: string, paidAt = new Date().toISOString()): B {
  const forDue = nextUnpaidDue(bill, today);
  if (!forDue) return bill;
  return markBillPaidFor(bill, forDue, today, id, paidAt);
}

/** Remove the most recent payment (Undo). */
export function undoLastPayment<B extends Bill>(bill: B): B {
  const payments = [...(bill.payments ?? [])].sort((a, b) => a.forDue.localeCompare(b.forDue) || a.paidOn.localeCompare(b.paidOn));
  payments.pop();
  return { ...bill, payments };
}

/** Record a payment for one particular due date (the month on screen's) */
export function markBillPaidFor<B extends Bill>(bill: B, forDue: string, today: string, id: string, paidAt = new Date().toISOString()): B {
  if (isDuePaid(bill, forDue)) return bill;
  const amountCents = bill.amountCents - paidToward(bill, forDue);
  return { ...bill, payments: [...(bill.payments ?? []), { id, forDue, paidOn: today, paidAt, amountCents: Math.max(0, amountCents) }] };
}

/** Pay part of one due date's bill (Pay part). Paying the rest or more pays it. */
export function payPartFor<B extends Bill>(bill: B, forDue: string, amountCents: number, today: string, id: string, paidAt = new Date().toISOString()): B {
  if (amountCents <= 0 || isDuePaid(bill, forDue)) return bill;
  const payment = amountCents >= leftToPay(bill, forDue)
    ? { id, forDue, paidOn: today, paidAt, amountCents }
    : { id, forDue, paidOn: today, paidAt, amountCents, partial: true };
  return { ...bill, payments: [...(bill.payments ?? []), payment] };
}

/** Undo the latest payment toward one due date (a part payment comes off one at a time) */
export function undoPaymentFor<B extends Bill>(bill: B, forDue: string): B {
  const mine = (bill.payments ?? []).filter(p => p.forDue === forDue);
  if (!mine.length) return bill;
  const last = mine.reduce((a, b) => ((b.paidAt ?? b.paidOn) >= (a.paidAt ?? a.paidOn) ? b : a));
  return { ...bill, payments: (bill.payments ?? []).filter(p => p !== last) };
}

/** Whether every payment toward a due date has cleared at the bank */
export function isDueCleared(bill: Bill, forDue: string): boolean {
  const mine = (bill.payments ?? []).filter(p => p.forDue === forDue);
  return mine.length > 0 && mine.every(p => !!p.clearedOn);
}

/** Marks the payments toward a due date cleared at the bank (a day), or not (null) */
export function setDueCleared<B extends Bill>(bill: B, forDue: string, clearedOn: string | null): B {
  return {
    ...bill,
    payments: (bill.payments ?? []).map(p => {
      if (p.forDue !== forDue) return p;
      if (clearedOn) return { ...p, clearedOn: p.clearedOn ?? clearedOn };
      const { clearedOn: _drop, ...rest } = p;
      return rest;
    }),
  };
}

/**
 * A bill as seen from one month (YYYY-MM) on Budget & bills:
 * - 'paid': its bill for that month is paid (the last one paid, if it's due
 *   more than once that month and all are paid)
 * - 'unpaid': its first unpaid bill that month
 * - 'none': nothing due that month (a quarterly bill, a paused one) — then
 *   `due` is its next unpaid date from today, if any
 */
export type BillMonthState =
  | { kind: 'paid'; due: string; payment: BillPayment }
  /** paidCents: part paid so far, leftCents: what's still owed */
  | { kind: 'unpaid'; due: string; paidCents: number; leftCents: number }
  | { kind: 'none'; due: string | null };

export function billMonthState(bill: Bill, month: string, today: string): BillMonthState {
  if (billCounts(bill)) {
    const start = `${month}-01`;
    const end = addDays(addMonthsClamped(start, 1), -1);
    const dues = billDueDates(bill, start, end);
    const unpaid = dues.find(d => !isDuePaid(bill, d));
    if (unpaid) return { kind: 'unpaid', due: unpaid, paidCents: paidToward(bill, unpaid), leftCents: leftToPay(bill, unpaid) };
    if (dues.length) { const due = dues[dues.length - 1]; return { kind: 'paid', due, payment: latestPaymentFor(bill, due)! }; }
  }
  return { kind: 'none', due: billCounts(bill) ? nextUnpaidDue(bill, today) : null };
}

/** The payment covering the latest due date, if any. */
export function latestPayment(bill: Bill) {
  const last = lastPaidDue(bill);
  return last ? latestPaymentFor(bill, last) : undefined;
}

/** The most recent payment toward one due date */
function latestPaymentFor(bill: Bill, forDue: string): BillPayment | undefined {
  let latest: BillPayment | undefined;
  for (const p of bill.payments ?? []) if (p.forDue === forDue && (!latest || (p.paidAt ?? p.paidOn) >= (latest.paidAt ?? latest.paidOn))) latest = p;
  return latest;
}

// ── Budget ──────────────────────────────────────────────────────────────────

export const UNCATEGORIZED = '__none__';

export interface BudgetRow {
  categoryId: string;
  name: string;
  plannedCents: number;
  /** Active bills in this category due this month (from the bills list). */
  billsCents: number;
  /** Payments marked on those bills for this month's due dates (shown, not subtracted again). */
  paidCents: number;
  /** Spending logged this month. */
  spendingCents: number;
  /** Planned − bills − spending. */
  leftCents: number;
}

export interface BudgetSummary {
  rows: BudgetRow[];
  totals: Omit<BudgetRow, 'categoryId' | 'name'>;
}

/**
 * Planned vs committed vs spent for one month (YYYY-MM).
 * - Bills: every due date of an active bill that falls in the month, counted
 *   as soon as the bill is entered (paused and cancelled bills don't count).
 * - Paid: payments marked on bills for those due dates — shown, not counted twice.
 * - Spending: spending lines dated in the month.
 */
export function budgetSummary(
  categories: (BudgetCategory & FinanceMeta)[],
  bills: (Bill & FinanceMeta)[],
  expenses: FinanceExpense[],
  month: string,
): BudgetSummary {
  const known = new Set(categories.map(c => c.id));
  const bucket = (id: string | undefined) => (id && known.has(id) ? id : UNCATEGORIZED);
  const billsBy = new Map<string, number>();
  const paidBy = new Map<string, number>();
  const spendBy = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const inMonth = (day: string) => day.slice(0, 7) === month;

  const monthStart = `${month}-01`;
  const monthEnd = addDays(addMonthsClamped(monthStart, 1), -1);
  for (const b of bills) {
    const cat = bucket(b.categoryId);
    if (billCounts(b)) {
      const due = billDueDates(b, monthStart, monthEnd).length;
      if (due) add(billsBy, cat, due * b.amountCents);
    }
    for (const p of b.payments ?? []) if (inMonth(p.forDue)) add(paidBy, cat, p.amountCents);
  }

  for (const e of expenses) if (inMonth(e.date)) add(spendBy, bucket(e.categoryId), e.amountCents);

  const row = (categoryId: string, name: string, plannedCents: number): BudgetRow => {
    const billsCents = billsBy.get(categoryId) ?? 0;
    const spendingCents = spendBy.get(categoryId) ?? 0;
    return { categoryId, name, plannedCents, billsCents, paidCents: paidBy.get(categoryId) ?? 0, spendingCents, leftCents: plannedCents - billsCents - spendingCents };
  };
  const used = (id: string) => billsBy.has(id) || paidBy.has(id) || spendBy.has(id);

  const rows: BudgetRow[] = [...categories]
    .filter(c => !c.archived || used(c.id))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(c => row(c.id, c.name, c.monthlyPlannedCents));
  if (used(UNCATEGORIZED)) rows.push(row(UNCATEGORIZED, 'Uncategorized', 0));

  const totals = rows.reduce(
    (t, r) => ({
      plannedCents: t.plannedCents + r.plannedCents,
      billsCents: t.billsCents + r.billsCents,
      paidCents: t.paidCents + r.paidCents,
      spendingCents: t.spendingCents + r.spendingCents,
      leftCents: t.leftCents + r.leftCents,
    }),
    { plannedCents: 0, billsCents: 0, paidCents: 0, spendingCents: 0, leftCents: 0 },
  );
  return { rows, totals };
}

// ── Savings & goals ─────────────────────────────────────────────────────────

export function potBalance(pot: SavingsPot): number {
  return pot.entries.reduce((sum, e) => sum + e.amountCents, 0);
}

export interface GoalProgress { currentCents: number; targetCents: number; /** 0–1 */ fraction: number; reached: boolean }

export function goalProgress(goal: FinanceGoal, pots: (SavingsPot & FinanceMeta)[]): GoalProgress {
  const pot = goal.savingsPotId ? pots.find(p => p.id === goal.savingsPotId) : undefined;
  const currentCents = pot ? potBalance(pot) : (goal.currentCents ?? 0);
  const fraction = goal.targetCents > 0 ? Math.max(0, Math.min(1, currentCents / goal.targetCents)) : 0;
  return { currentCents, targetCents: goal.targetCents, fraction, reached: goal.targetCents > 0 && currentCents >= goal.targetCents };
}

/** A new random record / line id. */
export function newId(): string {
  return crypto.randomUUID();
}

// ── Reports ─────────────────────────────────────────────────────────────────

/** One bill payment, from Mark paid. */
export interface BillPaymentRecord {
  key: string;
  billId: string;
  name: string;
  kind: Bill['kind'];
  categoryId?: string;
  /** The day it was paid */
  date: string;
  amountCents: number;
}

/** Every recorded bill payment, oldest first */
export function billPaymentRecords(bills: (Bill & FinanceMeta)[]): BillPaymentRecord[] {
  const out: BillPaymentRecord[] = [];
  for (const b of bills) {
    for (const p of b.payments ?? []) {
      out.push({ key: `m:${b.id}:${p.id}`, billId: b.id, name: b.name, kind: b.kind, categoryId: b.categoryId, date: p.paidOn, amountCents: p.amountCents });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export interface ReportFilter {
  query?: string;
  kind?: Bill['kind'] | 'all';
  /** A category id, UNCATEGORIZED, or 'all'. */
  categoryId?: string;
  /** Inclusive YYYY-MM-DD bounds. */
  start: string;
  end: string;
}

export function filterPayments(records: BillPaymentRecord[], f: ReportFilter): BillPaymentRecord[] {
  const q = (f.query ?? '').trim().toLowerCase();
  return records.filter(r =>
    r.date >= f.start && r.date <= f.end
    && (!q || r.name.toLowerCase().includes(q))
    && (!f.kind || f.kind === 'all' || r.kind === f.kind)
    && (!f.categoryId || f.categoryId === 'all' || (f.categoryId === UNCATEGORIZED ? !r.categoryId : r.categoryId === f.categoryId)));
}

export interface ReportSummary {
  totalCents: number;
  count: number;
  /** Per bill, largest total first. */
  byBill: { billId: string; name: string; kind: Bill['kind']; categoryId?: string; totalCents: number; count: number; lastPaid: string }[];
  /** Every month in the range (YYYY-MM), oldest first, including empty months. */
  byMonth: { month: string; totalCents: number; count: number }[];
}

export function reportSummary(records: BillPaymentRecord[], start: string, end: string): ReportSummary {
  const bills = new Map<string, ReportSummary['byBill'][number]>();
  const months = new Map<string, { totalCents: number; count: number }>();
  for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = shiftMonth(m, 1)) months.set(m, { totalCents: 0, count: 0 });
  let totalCents = 0;
  for (const r of records) {
    totalCents += r.amountCents;
    const b = bills.get(r.billId) ?? { billId: r.billId, name: r.name, kind: r.kind, categoryId: r.categoryId, totalCents: 0, count: 0, lastPaid: r.date };
    b.totalCents += r.amountCents;
    b.count += 1;
    if (r.date > b.lastPaid) b.lastPaid = r.date;
    bills.set(r.billId, b);
    const m = months.get(r.date.slice(0, 7));
    if (m) { m.totalCents += r.amountCents; m.count += 1; }
  }
  return {
    totalCents,
    count: records.length,
    byBill: [...bills.values()].sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name)),
    byMonth: [...months.entries()].map(([month, v]) => ({ month, ...v })),
  };
}

export type ReportPeriod = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'custom';

/** Inclusive date bounds for a preset period, relative to `today`. */
export function periodRange(period: Exclude<ReportPeriod, 'custom'>, today: string): { start: string; end: string } {
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  const monthEnd = (m: string) => addDays(addMonthsClamped(`${m}-01`, 1), -1);
  switch (period) {
    case 'this-month': return { start: `${month}-01`, end: monthEnd(month) };
    case 'last-month': { const m = shiftMonth(month, -1); return { start: `${m}-01`, end: monthEnd(m) }; }
    case 'this-year': return { start: `${year}-01-01`, end: `${year}-12-31` };
    case 'last-year': return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
  }
}

/**
 * Average paid per month, counting only months that have happened since
 * tracking started: from the first month in the range with a payment through
 * the current month (or the range's end, if earlier). Future months and
 * months before the first payment don't drag the average down; a real month
 * with nothing paid still counts.
 */
export function averagePerMonth(byMonth: ReportSummary['byMonth'], today: string): { averageCents: number; months: number } {
  const current = today.slice(0, 7);
  const first = byMonth.findIndex(m => m.count > 0);
  if (first === -1) return { averageCents: 0, months: 0 };
  const counted = byMonth.slice(first).filter(m => m.month <= current);
  const months = Math.max(1, counted.length);
  const total = counted.reduce((t, m) => t + m.totalCents, 0);
  return { averageCents: Math.round(total / months), months };
}

/** Within this many days a bill counts as "due" for Mark paid. */
export const DUE_SOON_DAYS = 7;

/**
 * The one action a bill row shows up front: Mark paid when the next payment is
 * overdue or due within a week (or nothing's been paid yet), otherwise Undo
 * paid for the latest payment. Null for paused/cancelled or fully paid one-offs.
 */
export function primaryBillAction(bill: Bill, today: string): 'mark' | 'undo' | null {
  const due = billCounts(bill) ? nextUnpaidDue(bill, today) : null;
  const paid = !!latestPayment(bill);
  if (due && (daysBetween(today, due) <= DUE_SOON_DAYS || !paid)) return 'mark';
  if (paid) return 'undo';
  return due ? 'mark' : null;
}

export interface SpendSlice { key: string; name: string; cents: number; share: number }

/**
 * Where the month's money goes: each category's bills due + spending, biggest
 * first, the top `max` named and the rest folded into "Everything else".
 */
export function spendingBreakdown(rows: BudgetRow[], max = 4): SpendSlice[] {
  const used = rows
    .map(r => ({ key: r.categoryId, name: r.name, cents: r.billsCents + r.spendingCents }))
    .filter(r => r.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  const total = used.reduce((t, r) => t + r.cents, 0);
  if (!total) return [];
  const top = used.length > max + 1 ? used.slice(0, max) : used;
  const restCents = used.slice(top.length).reduce((t, r) => t + r.cents, 0);
  const slices = restCents ? [...top, { key: '__rest__', name: 'Everything else', cents: restCents }] : top;
  return slices.map(s => ({ ...s, share: s.cents / total }));
}

const ORD = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/** The bill editor's note under its due date: "Repeats on the 5th of each month" */
export function billRepeatNote(frequency: Bill['frequency'], dueDate: string): string {
  if (!dueDate) return '';
  const d = parseDay(dueDate);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const day = ORD(d.getUTCDate());
  switch (frequency) {
    case 'monthly': return `Repeats on the ${day} of each month`;
    case 'weekly': return `Repeats every ${weekday}`;
    case 'biweekly': return `Repeats every other ${weekday}`;
    case 'quarterly': return `Repeats every 3 months on the ${day}`;
    case 'yearly': return `Repeats every year on ${monthDay}`;
    default: return `Just once, on ${monthDay}`;
  }
}

const FREQUENCY_WORD: Record<Bill['frequency'], string> = {
  monthly: 'monthly', weekly: 'weekly', biweekly: 'every 2 weeks', quarterly: 'quarterly', yearly: 'yearly', once: 'once',
};

/** The bill editor's footer line: "$95.00 monthly · next due Nov 5 · autopay on" */
export function billSummaryLine(bill: Pick<Bill, 'amountCents' | 'frequency' | 'dueDate' | 'autopay'>, today: string): string {
  const next = bill.dueDate ? nextDueDate(bill as Bill, today) : null;
  const parts = [`${formatCents(bill.amountCents)} ${FREQUENCY_WORD[bill.frequency]}`];
  if (next) parts.push(`next due ${parseDay(next).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`);
  if (bill.autopay) parts.push('autopay on');
  return parts.join(' · ');
}
