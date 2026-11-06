import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { BillsTable } from '../components/organisms/BillsTable.js';
import { BudgetTable } from '../components/organisms/BudgetTable.js';
import { SpendingLog } from '../components/organisms/SpendingLog.js';
import { BalanceSummary } from '../components/organisms/BalanceSummary.js';
import { useEncryptedSetting } from '../hooks/useEncryptedSetting.js';
import type { BalanceSnapshot } from '../utils/financeBalance.js';
import { formatMonth, shiftMonth, todayStr } from '../utils/finance.js';
import { MonthPill } from '../components/molecules/FinanceParts.js';
import { useFinance } from '../hooks/useFinance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

/** Budget & Bills: the current balance, the monthly budget by category, spending for the month, then every bill and subscription. */
export function FinanceBudgetView() {
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  return (
    <FinanceShell headerAside={(
      <MonthPill label={formatMonth(month)} onPrev={() => setMonth(m => shiftMonth(m, -1))} onNext={() => setMonth(m => shiftMonth(m, 1))} />
    )}>
      <BudgetAndBills month={month} />
    </FinanceShell>
  );
}

function BudgetAndBills({ month }: { month: string }) {
  const bills = useFinance('bills');
  const budget = useFinance('budget');
  const expenses = useFinance('expenses');
  const [balance, saveBalance, balanceLoaded] = useEncryptedSetting<BalanceSnapshot | null>('financeBalance', null);
  const categories = useMemo(() => [...budget.records].sort((a, b) => a.order - b.order), [budget.records]);

  const statuses = [bills.status, budget.status, expenses.status];
  if (!balanceLoaded || statuses.some(s => s === 'idle' || s === 'loading')) return <Center><Spinner size={32} /></Center>;

  return (
    <>
      <BalanceSummary snapshot={balance} bills={bills.records} expenses={expenses.records} onSet={s => void saveBalance(s)} />
      <BudgetTable
        categories={categories}
        bills={bills.records}
        expenses={expenses.records}
        month={month}
        onSave={c => budget.save(c)}
        onDelete={id => void budget.remove(id)}
      />
      <SpendingLog
        expenses={expenses.records}
        categories={categories}
        month={month}
        onSave={e => expenses.save(e)}
        onDelete={id => void expenses.remove(id)}
      />
      <BillsTable
        bills={bills.records}
        categories={categories}
        month={month}
        onSave={b => bills.save(b)}
        onDelete={id => void bills.remove(id)}
        onAddCategory={async name => (await budget.save({ name, monthlyPlannedCents: 0, order: categories.reduce((m, c) => Math.max(m, c.order), -1) + 1 }))?.id ?? null}
      />
    </>
  );
}
