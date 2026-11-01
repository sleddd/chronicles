/* Current balance: what you have available to spend, across however many
   accounts — set by hand ("bring it current"), then kept current on its own:
   a bill marked paid and spending logged after it was set come off it (undo /
   delete puts them back, since it's worked out from the records, never stored
   as a running total). The budget weighs it against the bills still due this
   month. The snapshot is the encrypted setting `financeBalance`. Pure. */

import type { Bill, FinanceExpense, FinanceMeta } from '../types/finance.js';
import { addDays, addMonthsClamped, billCounts, billDueDates, leftToPay, nextUnpaidDue } from './finance.js';

export interface BalanceSnapshot {
  amountCents: number;
  /** When it was set (ISO) */
  setAt: string;
}

export interface BalanceNow {
  cents: number;
  /** Bill payments since it was set */
  payments: number;
  paidCents: number;
  /** Spending logged since it was set */
  purchases: number;
  spentCents: number;
}

/** Recorded after the snapshot: by the exact moment when there is one, else by the day (a later day counts) */
function after(moment: string | undefined, day: string, setAt: string): boolean {
  if (moment) return moment > setAt;
  return day > setAt.slice(0, 10);
}

export function balanceNow(snapshot: BalanceSnapshot, bills: Bill[], expenses: (FinanceExpense & Partial<FinanceMeta>)[]): BalanceNow {
  let paidCents = 0;
  let payments = 0;
  for (const b of bills) {
    for (const p of b.payments ?? []) {
      if (!after(p.paidAt, p.paidOn, snapshot.setAt)) continue;
      paidCents += p.amountCents;
      payments++;
    }
  }
  let spentCents = 0;
  let purchases = 0;
  for (const e of expenses) {
    if (!after(e.createdAt, e.date, snapshot.setAt)) continue;
    spentCents += e.amountCents;
    purchases++;
  }
  return { cents: snapshot.amountCents - paidCents - spentCents, payments, paidCents, purchases, spentCents };
}

export interface BillDue<B> { bill: B; due: string; amountCents: number }

/** Every unpaid bill due from now (overdue ones included) to the end of the month, soonest first */
export function billsStillDue<B extends Bill>(bills: B[], today: string): { cents: number; items: BillDue<B>[]; through: string } {
  const through = addDays(addMonthsClamped(`${today.slice(0, 7)}-01`, 1), -1);
  const items: BillDue<B>[] = [];
  for (const bill of bills) {
    if (!billCounts(bill)) continue;
    const first = nextUnpaidDue(bill, today);
    if (!first || first > through) continue;
    for (const due of billDueDates(bill, first, through)) {
      const left = leftToPay(bill, due);
      if (left > 0) items.push({ bill, due, amountCents: left });
    }
  }
  items.sort((a, b) => a.due.localeCompare(b.due));
  return { cents: items.reduce((t, i) => t + i.amountCents, 0), items, through };
}
