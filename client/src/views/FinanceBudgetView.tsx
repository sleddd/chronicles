import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { BillsTable } from '../components/organisms/BillsTable.js';
import { BudgetTable } from '../components/organisms/BudgetTable.js';
import { SpendingLog } from '../components/organisms/SpendingLog.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { todayStr } from '../utils/finance.js';
import { useFinance } from '../hooks/useFinance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

/** Budget & Bills: the monthly budget by category, spending for the month, then every bill and subscription. */
export function FinanceBudgetView() {
  return (
    <FinanceShell>
      <BudgetAndBills />
    </FinanceShell>
  );
}

function BudgetAndBills() {
  // Reconcile's paydays feed the budget only when it's switched on
  const reconcileOn = useEntriesStore(s => s.featureFlags.reconcileEnabled === true);
  const bills = useFinance('bills');
  const budget = useFinance('budget');
  const expenses = useFinance('expenses');
  const paydays = useFinance('paydays', { enabled: reconcileOn });
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const categories = useMemo(() => [...budget.records].sort((a, b) => a.order - b.order), [budget.records]);
  const paydayRecords = reconcileOn ? paydays.records : NO_PAYDAYS;

  const statuses = [bills.status, budget.status, expenses.status, ...(reconcileOn ? [paydays.status] : [])];
  if (statuses.some(s => s === 'idle' || s === 'loading')) return <Center><Spinner size={32} /></Center>;

  return (
    <>
      <BudgetTable
        categories={categories}
        bills={bills.records}
        expenses={expenses.records}
        paydays={paydayRecords}
        month={month}
        onMonthChange={setMonth}
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
        onSave={b => bills.save(b)}
        onDelete={id => void bills.remove(id)}
      />
    </>
  );
}

const NO_PAYDAYS: never[] = [];
