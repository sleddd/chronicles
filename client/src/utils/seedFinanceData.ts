/**
 * Seed realistic Finance data for trying the feature: budget categories,
 * bills and subscriptions (with ~5 months of Mark-paid payments), spending,
 * savings funds, goals linked to them, and two Reconcile paydays.
 * Every record is encrypted in the browser like real data. Adds to what's
 * there — running it twice adds a second set.
 */
import { addDays, addMonthsClamped, billDueDates, newId, todayStr } from './finance.js';
import type {
  Bill, BillPayment, BudgetCategory, FinanceExpense, FinanceGoal, FinanceKind, FinanceRecordMap, Payday, SavingsPot,
} from '../types/finance.js';

export interface SeedFinanceDeps {
  encryptRecord: (kind: string, id: string, record: unknown) => Promise<{ payload: string; iv: string }>;
  put: (kind: FinanceKind, id: string, payload: string, iv: string) => Promise<unknown>;
  onProgress?: (msg: string) => void;
  /** For tests; defaults to today. */
  today?: string;
}

const $ = (dollars: number) => Math.round(dollars * 100);

/** Small deterministic wobble so amounts aren't all identical. */
function wobble(seed: number, spread: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return (x - Math.floor(x) - 0.5) * 2 * spread;
}

export interface SeedFinancePlan {
  budget: (BudgetCategory & { id: string })[];
  bills: (Bill & { id: string })[];
  expenses: (FinanceExpense & { id: string })[];
  savings: (SavingsPot & { id: string })[];
  goals: (FinanceGoal & { id: string })[];
  paydays: (Payday & { id: string })[];
}

/** Build the seed records (pure — no network). */
export function planFinanceSeed(today = todayStr()): SeedFinancePlan {
  const month = today.slice(0, 7);
  const monthsAgo = (n: number) => addMonthsClamped(`${month}-01`, -n).slice(0, 7);
  const day = (m: string, d: number) => {
    const last = Number(addDays(addMonthsClamped(`${m}-01`, 1), -1).slice(8, 10));
    return `${m}-${String(Math.min(d, last)).padStart(2, '0')}`;
  };

  // ── Categories ──
  const cat = (name: string, planned: number, order: number) => ({ id: newId(), name, monthlyPlannedCents: $(planned), order });
  const housing = cat('Housing', 1500, 0);
  const utilities = cat('Utilities', 300, 1);
  const subs = cat('Subscriptions', 80, 2);
  const insurance = cat('Insurance', 250, 3);
  const transport = cat('Transportation', 250, 4);
  const groceries = cat('Groceries', 600, 5);
  const dining = cat('Dining out', 150, 6);
  const debt = cat('Debt payments', 300, 7);
  const other = cat('Other', 100, 8);
  const budget = [housing, utilities, subs, insurance, transport, groceries, dining, debt, other];

  // ── Bills ──
  const anchor = (d: number) => day(monthsAgo(6), d);
  const bill = (b: Omit<Bill, 'status'> & { status?: Bill['status'] }): Bill & { id: string } => ({ id: newId(), status: 'active', ...b });
  const bills = [
    bill({ name: 'Rent', kind: 'bill', amountCents: $(1450), frequency: 'monthly', dueDate: anchor(1), categoryId: housing.id }),
    bill({ name: 'Electric', kind: 'bill', amountCents: $(95), frequency: 'monthly', dueDate: anchor(12), categoryId: utilities.id, autopay: true }),
    bill({ name: 'Internet', kind: 'bill', amountCents: $(70), frequency: 'monthly', dueDate: anchor(20), categoryId: utilities.id, autopay: true }),
    bill({ name: 'Phone', kind: 'bill', amountCents: $(85), frequency: 'monthly', dueDate: anchor(22), categoryId: utilities.id }),
    bill({ name: 'Car insurance', kind: 'bill', amountCents: $(642.5), frequency: 'quarterly', dueDate: anchor(5), categoryId: insurance.id }),
    bill({ name: 'Credit card', kind: 'bill', amountCents: $(150), frequency: 'monthly', dueDate: anchor(25), categoryId: debt.id, notes: 'Minimum is $45 — paying extra' }),
    bill({ name: 'Netflix', kind: 'subscription', amountCents: $(15.49), frequency: 'monthly', dueDate: anchor(15), categoryId: subs.id, autopay: true }),
    bill({ name: 'Spotify', kind: 'subscription', amountCents: $(11.99), frequency: 'monthly', dueDate: anchor(8), categoryId: subs.id, autopay: true }),
    bill({ name: 'iCloud+', kind: 'subscription', amountCents: $(2.99), frequency: 'monthly', dueDate: anchor(3), categoryId: subs.id, autopay: true }),
    bill({ name: 'Gym', kind: 'subscription', amountCents: $(39), frequency: 'monthly', dueDate: anchor(5), categoryId: other.id }),
    bill({ name: 'Amazon Prime', kind: 'subscription', amountCents: $(139), frequency: 'yearly', dueDate: day(monthsAgo(2), 18), categoryId: subs.id }),
    bill({ name: 'Hulu', kind: 'subscription', amountCents: $(9.99), frequency: 'monthly', dueDate: anchor(10), categoryId: subs.id, status: 'paused' }),
    bill({ name: 'Disney+', kind: 'subscription', amountCents: $(13.99), frequency: 'monthly', dueDate: anchor(27), categoryId: subs.id, status: 'cancelled', cancelledOn: day(monthsAgo(3), 27) }),
  ];

  // ~5 months of payments on every active bill, up to today
  const paidFrom = `${monthsAgo(5)}-01`;
  bills.forEach((b, bi) => {
    if (b.status !== 'active') return;
    const payments: BillPayment[] = billDueDates(b, paidFrom, today).map((forDue, i) => {
      const varies = b.name === 'Electric' ? Math.round(wobble(bi * 31 + i, 22) * 100) : 0;
      return { id: newId(), forDue, paidOn: b.autopay ? forDue : addDays(forDue, -1), amountCents: b.amountCents + varies };
    });
    if (payments.length) b.payments = payments;
  });

  // ── Spending (last 3 months, this month so far) ──
  const expenses: (FinanceExpense & { id: string })[] = [];
  const spendPlan: [string, string, number, number[]][] = [
    ['Groceries — Trader Joe’s', groceries.id, 95, [2, 9, 16, 23, 30]],
    ['Groceries — farmers market', groceries.id, 32, [6, 20]],
    ['Gas', transport.id, 48, [4, 14, 26]],
    ['Takeout', dining.id, 28, [7, 21]],
    ['Coffee', dining.id, 6.5, [3, 10, 17, 24]],
    ['Pharmacy', other.id, 22, [13]],
  ];
  for (let n = 2; n >= 0; n--) {
    const m = monthsAgo(n);
    for (const [description, categoryId, base, days] of spendPlan) {
      days.forEach((d, i) => {
        const date = day(m, d);
        if (date > today) return;
        expenses.push({ id: newId(), date, description, amountCents: Math.max(100, $(base + wobble(n * 97 + i + base, base * 0.3))), categoryId });
      });
    }
  }

  // ── Savings funds ──
  const monthly = (amount: number, count: number, d: number, note?: string) =>
    Array.from({ length: count }, (_, i) => ({ id: newId(), date: day(monthsAgo(count - 1 - i), d), amountCents: $(amount), note }))
      .filter(e => e.date <= today);
  const emergency: SavingsPot & { id: string } = { id: newId(), name: 'Emergency fund', targetCents: $(6000), entries: [{ id: newId(), date: day(monthsAgo(8), 1), amountCents: $(1200), note: 'Opening balance' }, ...monthly(250, 8, 16)] };
  const vacation: SavingsPot & { id: string } = {
    id: newId(), name: 'Lisbon trip', targetCents: $(2500),
    entries: [...monthly(150, 6, 2), { id: newId(), date: day(monthsAgo(1), 11), amountCents: -$(220), note: 'Flight deposit' }],
  };
  const car: SavingsPot & { id: string } = { id: newId(), name: 'Car repairs', entries: [...monthly(60, 5, 20), { id: newId(), date: day(monthsAgo(2), 9), amountCents: -$(185), note: 'New tires' }] };
  const savings = [emergency, vacation, car];

  // ── Goals ──
  const goals: (FinanceGoal & { id: string })[] = [
    { id: newId(), name: 'Six-month emergency fund', targetCents: $(6000), targetDate: day(addMonthsClamped(`${month}-01`, 10).slice(0, 7), 1), savingsPotId: emergency.id, status: 'active' },
    { id: newId(), name: 'Lisbon in the spring', targetCents: $(2500), targetDate: day(addMonthsClamped(`${month}-01`, 5).slice(0, 7), 15), savingsPotId: vacation.id, status: 'active' },
    { id: newId(), name: 'Pay off the credit card', targetCents: $(3200), currentCents: $(1350), targetDate: day(addMonthsClamped(`${month}-01`, 8).slice(0, 7), 30), status: 'active', notes: 'Started at $3,200' },
    { id: newId(), name: 'Start a retirement IRA', targetCents: $(1000), currentCents: $(1000), status: 'achieved' },
  ];

  // ── Reconcile paydays: last month's (closed, all cleared) and the latest (open) ──
  const byName = (n: string) => bills.find(b => b.name === n)!;
  const line = (name: string, clearedOn?: string) => {
    const b = byName(name);
    return { id: newId(), billId: b.id, description: b.name, amountCents: b.amountCents, direction: 'out' as const, categoryId: b.categoryId, clearedOn };
  };
  const prevDate = day(monthsAgo(1), 15);
  const prev: Payday & { id: string } = {
    id: newId(), date: prevDate, startingBalanceCents: $(3120.45), status: 'closed', closedOn: addDays(prevDate, 9),
    items: [
      line('Phone', addDays(prevDate, 2)),
      line('Credit card', addDays(prevDate, 3)),
      { id: newId(), description: 'Uber', amountCents: $(84.2), direction: 'out', combinedCount: 9, combinedPeriod: 'Last 2 weeks', categoryId: transport.id, clearedOn: addDays(prevDate, 4) },
    ],
    spending: [{ id: newId(), date: addDays(prevDate, 1), description: 'Groceries', amountCents: $(112.3), categoryId: groceries.id, clearedOn: addDays(prevDate, 2) }],
    balanceChecks: [],
  };
  const prevPaid = prev.items.reduce((t, i) => t + i.amountCents, 0) + prev.spending.reduce((t, s) => t + s.amountCents, 0);
  prev.balanceChecks = [{ at: `${addDays(prevDate, 8)}T18:00:00.000Z`, balanceCents: prev.startingBalanceCents - prevPaid }];

  const lastDate = day(month, 1) <= today ? day(month, 1) : day(monthsAgo(1), 30);
  const latest: Payday & { id: string } = {
    id: newId(), date: lastDate, startingBalanceCents: $(3480.1), status: 'open',
    items: [
      line('Rent', addDays(lastDate, 1) <= today ? addDays(lastDate, 1) : undefined),
      line('Gym'),
      line('Car insurance'),
      { id: newId(), description: 'Venmo — split dinner', amountCents: $(36), direction: 'in', categoryId: dining.id },
    ],
    spending: [{ id: newId(), date: lastDate, description: 'Groceries', amountCents: $(87.65), categoryId: groceries.id }],
    balanceChecks: [],
  };

  return { budget, bills, expenses, savings, goals, paydays: [prev, latest] };
}

/** Encrypt and upload the seed plan. Resolves with a short summary. */
export async function seedFinanceData(deps: SeedFinanceDeps): Promise<string> {
  const plan = planFinanceSeed(deps.today);
  const order: FinanceKind[] = ['budget', 'bills', 'expenses', 'savings', 'goals', 'paydays'];
  let total = 0;
  for (const kind of order) {
    const records = plan[kind as keyof SeedFinancePlan] as ({ id: string } & FinanceRecordMap[FinanceKind])[];
    deps.onProgress?.(`Adding ${kind}…`);
    for (const { id, ...record } of records) {
      const { payload, iv } = await deps.encryptRecord(kind, id, record);
      await deps.put(kind, id, payload, iv);
      total++;
    }
  }
  return `Added ${total} finance records (${plan.bills.length} bills, ${plan.expenses.length} spending lines, ${plan.savings.length} funds, ${plan.goals.length} goals, ${plan.paydays.length} paydays)`;
}
