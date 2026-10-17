/**
 * Finance records. Each is stored as one encrypted JSON payload in its own
 * tenant table (see server/src/routes/finance.ts) — the server never sees
 * any of these fields. All money is integer cents; dates are YYYY-MM-DD.
 */
import type { FinanceKind } from '../services/api.js';

export type { FinanceKind };

/** Every stored record carries its row id (a client UUID, bound into the AAD). */
export interface FinanceMeta {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── Reconcile: one payday at a time ─────────────────────────────────────────

export interface PaydayItem {
  id: string;
  /** Bill this line was picked from (for budget figures and suggestions only). */
  billId?: string;
  description: string;
  amountCents: number;
  /** 'out' = a bill/payment leaving the account; 'in' = money still to arrive. */
  direction: 'out' | 'in';
  /** Several small charges rolled into one line ("Uber — 9 rides"). */
  combinedCount?: number;
  combinedPeriod?: string;
  categoryId?: string;
  /** Set when it went through the bank (the notepad X). */
  clearedOn?: string;
  /** Copied into a newer payday because it hadn't cleared yet. */
  carriedOver?: boolean;
}

/** Spending from the leftover (food, gas…). */
export interface PaydaySpend {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  categoryId?: string;
  clearedOn?: string;
}

export interface BalanceCheckEntry {
  /** ISO timestamp of the check. */
  at: string;
  balanceCents: number;
}

export interface Payday {
  date: string;
  /** Bank balance after everything posted (paycheck included). */
  startingBalanceCents: number;
  status: 'open' | 'closed';
  closedOn?: string;
  note?: string;
  items: PaydayItem[];
  spending: PaydaySpend[];
  balanceChecks: BalanceCheckEntry[];
}

// ── Budget & Bills ──────────────────────────────────────────────────────────

export type BillFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'once';
/** Paused = out of the budget and Calendar for now; cancelled = for good. (Old 'review' bills read as active.) */
export type BillStatus = 'active' | 'paused' | 'cancelled';

export const BILL_FREQUENCIES: { value: BillFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'once', label: 'Once' },
];

export const BILL_STATUSES: { value: BillStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** A payment recorded on a bill ("Mark paid") — never posts anywhere else. */
export interface BillPayment {
  id: string;
  /** The due date this payment covers. */
  forDue: string;
  /** When it was paid. */
  paidOn: string;
  amountCents: number;
}

export interface Bill {
  name: string;
  kind: 'bill' | 'subscription';
  amountCents: number;
  frequency: BillFrequency;
  /** Any one due date; the schedule repeats from it by `frequency`. */
  dueDate: string;
  categoryId?: string;
  autopay?: boolean;
  status: BillStatus;
  cancelledOn?: string;
  notes?: string;
  payments?: BillPayment[];
}

/** A spending line on Budget & Bills (groceries, gas…) — for everyone, no Reconcile needed. */
export interface FinanceExpense {
  date: string;
  description: string;
  amountCents: number;
  categoryId?: string;
}

export interface BudgetCategory {
  name: string;
  monthlyPlannedCents: number;
  order: number;
  archived?: boolean;
}

export const STARTER_CATEGORIES: { name: string; monthlyPlannedCents: number }[] = [
  { name: 'Housing', monthlyPlannedCents: 0 },
  { name: 'Utilities', monthlyPlannedCents: 0 },
  { name: 'Subscriptions', monthlyPlannedCents: 0 },
  { name: 'Insurance', monthlyPlannedCents: 0 },
  { name: 'Transportation', monthlyPlannedCents: 0 },
  { name: 'Groceries', monthlyPlannedCents: 0 },
  { name: 'Dining out', monthlyPlannedCents: 0 },
  { name: 'Debt payments', monthlyPlannedCents: 0 },
  { name: 'Other', monthlyPlannedCents: 0 },
];

// ── Goals & Savings ─────────────────────────────────────────────────────────

export interface SavingsEntry {
  id: string;
  date: string;
  /** Positive = contribution, negative = withdrawal. */
  amountCents: number;
  note?: string;
}

export interface SavingsPot {
  name: string;
  targetCents?: number;
  entries: SavingsEntry[];
  archived?: boolean;
}

export interface FinanceGoal {
  name: string;
  targetCents: number;
  targetDate?: string;
  /** Progress comes from this pot's balance when set… */
  savingsPotId?: string;
  /** …otherwise from this hand-entered amount. */
  currentCents?: number;
  status: 'active' | 'achieved' | 'paused';
  notes?: string;
}

/** Record shape per kind. */
export interface FinanceRecordMap {
  paydays: Payday;
  bills: Bill;
  budget: BudgetCategory;
  expenses: FinanceExpense;
  goals: FinanceGoal;
  savings: SavingsPot;
}

export type FinanceRecord<K extends FinanceKind> = FinanceRecordMap[K] & FinanceMeta;

/** One bill due date, as shown on the Calendar. */
export interface CalendarBillItem {
  key: string;
  billId: string;
  name: string;
  amountCents: number;
  date: string;
}
