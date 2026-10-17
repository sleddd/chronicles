/**
 * Pure Finance helpers — money maths, bill schedules and budget totals.
 * Money is integer cents throughout; dates are YYYY-MM-DD strings, handled in
 * UTC so no time zone can shift a day.
 */
import type {
  Bill, BillFrequency, BudgetCategory, FinanceExpense, FinanceMeta, FinanceGoal, Payday, SavingsPot,
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

/** The latest due date a recorded payment covers. */
export function lastPaidDue(bill: Bill): string | undefined {
  let last: string | undefined;
  for (const p of bill.payments ?? []) if (!last || p.forDue > last) last = p.forDue;
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

/** Record a payment for the next unpaid due date (amount defaults to the bill's). */
export function markBillPaid<B extends Bill>(bill: B, today: string, id: string, amountCents = bill.amountCents): B {
  const forDue = nextUnpaidDue(bill, today);
  if (!forDue) return bill;
  return { ...bill, payments: [...(bill.payments ?? []), { id, forDue, paidOn: today, amountCents }] };
}

/** Remove the most recent payment (Undo). */
export function undoLastPayment<B extends Bill>(bill: B): B {
  const payments = [...(bill.payments ?? [])].sort((a, b) => a.forDue.localeCompare(b.forDue) || a.paidOn.localeCompare(b.paidOn));
  payments.pop();
  return { ...bill, payments };
}

/** The payment covering the latest due date, if any. */
export function latestPayment(bill: Bill) {
  const last = lastPaidDue(bill);
  return last ? (bill.payments ?? []).find(p => p.forDue === last) : undefined;
}

export interface BillSuggestion<B> { bill: B; due: string; /** Due within the window (pre-ticked). */ dueSoon: boolean }

/**
 * Bills to offer when filling a payday: every counting bill not already on it,
 * by next due date from the payday. Those due within `windowDays` are flagged.
 */
export function suggestBillsForPayday<B extends Bill & FinanceMeta>(
  bills: B[], payday: Pick<Payday, 'date' | 'items'>, windowDays = 16,
): BillSuggestion<B>[] {
  const onIt = new Set(payday.items.map(i => i.billId).filter(Boolean));
  const out: BillSuggestion<B>[] = [];
  for (const bill of bills) {
    if (!billCounts(bill) || onIt.has(bill.id)) continue;
    // A few days' grace so a bill due just before payday still shows
    const due = nextDueDate(bill, addDays(payday.date, -5));
    if (!due) continue;
    out.push({ bill, due, dueSoon: daysBetween(payday.date, due) <= windowDays });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

// ── Payday maths ────────────────────────────────────────────────────────────

/** Signed effect on the bank balance (out = negative). */
function effect(item: { amountCents: number; direction?: 'out' | 'in' }): number {
  return item.direction === 'in' ? item.amountCents : -item.amountCents;
}

export interface PaydaySummary {
  /** Total of the bill/payment lines going out. */
  payingCents: number;
  /** Total of lines still to come in. */
  incomingCents: number;
  spentCents: number;
  /** Starting balance − paying + incoming − spending. */
  leftoverCents: number;
  /** Net amount that hasn't gone through the bank yet (positive = still to leave). */
  waitingCents: number;
  waitingCount: number;
  /** Starting balance − everything that has cleared: what the bank should show now. */
  expectedBankCents: number;
}

/** Lines that still belong to this payday (ones carried to a newer payday don't). */
function liveItems(p: Payday) {
  return p.items.filter(i => !i.carriedOver);
}

export function paydaySummary(p: Payday): PaydaySummary {
  let paying = 0, incoming = 0, spent = 0, waiting = 0, waitingCount = 0, clearedNet = 0;
  for (const i of liveItems(p)) {
    if (i.direction === 'in') incoming += i.amountCents; else paying += i.amountCents;
    if (i.clearedOn) clearedNet += effect(i);
    else { waiting -= effect(i); waitingCount++; }
  }
  for (const s of p.spending) {
    spent += s.amountCents;
    if (s.clearedOn) clearedNet -= s.amountCents;
    else { waiting += s.amountCents; waitingCount++; }
  }
  return {
    payingCents: paying,
    incomingCents: incoming,
    spentCents: spent,
    leftoverCents: p.startingBalanceCents - paying + incoming - spent,
    waitingCents: waiting,
    waitingCount,
    expectedBankCents: p.startingBalanceCents + clearedNet,
  };
}

export interface BalanceCheckResult {
  expectedCents: number;
  /** Current − expected: 0 = matches; ≠ 0 = something unlisted went through or an amount differs. */
  differenceCents: number;
  matches: boolean;
  /** Current balance − what's still waiting to go through. */
  availableCents: number;
}

export function balanceCheck(p: Payday, currentCents: number): BalanceCheckResult {
  const s = paydaySummary(p);
  const differenceCents = currentCents - s.expectedBankCents;
  return {
    expectedCents: s.expectedBankCents,
    differenceCents,
    matches: differenceCents === 0,
    availableCents: currentCents - s.waitingCents,
  };
}

/** Everything cleared and the latest balance check matches. */
export function isReadyToSpend(p: Payday): boolean {
  const s = paydaySummary(p);
  if (s.waitingCount > 0) return false;
  const last = p.balanceChecks[p.balanceChecks.length - 1];
  return !!last && balanceCheck(p, last.balanceCents).matches;
}

/** Newest payday first. */
export function sortPaydays<P extends Payday & FinanceMeta>(paydays: P[]): P[] {
  return [...paydays].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
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
  /** Spending logged this month (plus Reconcile spending / one-off lines when it's on). */
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
 * - Spending: spending lines dated in the month. When Reconcile is on, its
 *   paydays add their spending lines and one-off lines that aren't one of
 *   your bills (a bill line there is already in Bills).
 */
export function budgetSummary(
  categories: (BudgetCategory & FinanceMeta)[],
  bills: (Bill & FinanceMeta)[],
  expenses: FinanceExpense[],
  month: string,
  paydays: Payday[] = [],
): BudgetSummary {
  const billIds = new Set(bills.map(b => b.id));
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

  for (const p of paydays) {
    if (inMonth(p.date)) {
      for (const i of liveItems(p)) {
        if (i.direction === 'in' || (i.billId && billIds.has(i.billId))) continue;
        add(spendBy, bucket(i.categoryId), i.amountCents);
      }
    }
    for (const s of p.spending) if (inMonth(s.date)) add(spendBy, bucket(s.categoryId), s.amountCents);
  }

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

/** One bill payment, from Mark paid or (when Reconcile is on) a payday's bill line. */
export interface BillPaymentRecord {
  key: string;
  billId: string;
  name: string;
  kind: Bill['kind'];
  categoryId?: string;
  /** The day it was paid (Mark paid: paidOn; Reconcile: the payday). */
  date: string;
  amountCents: number;
  source: 'marked' | 'reconcile';
}

/**
 * Every recorded bill payment. Reconcile lines count only for bills that still
 * exist and only when that bill has no Mark-paid payment in the same month,
 * so a bill paid both ways isn't counted twice.
 */
export function billPaymentRecords(bills: (Bill & FinanceMeta)[], paydays: Payday[] = []): BillPaymentRecord[] {
  const out: BillPaymentRecord[] = [];
  const markedMonths = new Set<string>();
  for (const b of bills) {
    for (const p of b.payments ?? []) {
      out.push({ key: `m:${b.id}:${p.id}`, billId: b.id, name: b.name, kind: b.kind, categoryId: b.categoryId, date: p.paidOn, amountCents: p.amountCents, source: 'marked' });
      markedMonths.add(`${b.id}|${p.paidOn.slice(0, 7)}`);
    }
  }
  const byId = new Map(bills.map(b => [b.id, b]));
  for (const p of paydays) {
    for (const i of liveItems(p)) {
      const b = i.billId ? byId.get(i.billId) : undefined;
      if (!b || i.direction === 'in' || markedMonths.has(`${b.id}|${p.date.slice(0, 7)}`)) continue;
      out.push({ key: `r:${i.id}`, billId: b.id, name: b.name, kind: b.kind, categoryId: i.categoryId ?? b.categoryId, date: p.date, amountCents: i.amountCents, source: 'reconcile' });
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
