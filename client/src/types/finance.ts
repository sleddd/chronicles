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
  /** The moment it was marked paid (ISO) — what the current balance counts from; older payments have only paidOn */
  paidAt?: string;
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

/** A spending line on Budget & Bills (groceries, gas…). */
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
