import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { outlinedInputs } from '../../styles/filledInputs.js';
import { BillEditor } from './BillsTable.js';
import { ExpenseForm } from './SpendingLog.js';
import { useFinance } from '../../hooks/useFinance.js';
import { todayStr } from '../../utils/finance.js';

/* The Quick entry's Bill and Spending (Finance on): the topic picker lists
   them beside the topics, and picking one swaps the writing area for Budget &
   bills' own forms — the bill editor, or the spending row. They save to the
   finance tables (never the journal), and logged spending comes off the
   current balance like any other. */

export type QuickFinanceKind = 'bill' | 'spending';

export const QUICK_FINANCE_CHOICES: { key: QuickFinanceKind; name: string; icon: string }[] = [
  { key: 'bill', name: 'Bill', icon: 'receipt' },
  { key: 'spending', name: 'Spending', icon: 'wallet' },
];

/* In the Quick entry the bill and spending fields are outlined like the entry
   forms' boxes — no shaded fill */
const Wrap = styled.div`
  font-family: var(--font-sans);
  ${outlinedInputs}
  /* The entry card's rows: boxes fill their column */
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { width: 100%; }
`;

const Saved = styled.p`
  margin: 0;
  padding: 14px 36px;
  border-top: 1px solid var(--border-subtle);
  font-size: 14px;
  color: var(--text-muted);
  button {
    margin-left: 8px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: 500;
    color: var(--color-accent-link);
    cursor: pointer;
  }
  button:hover { text-decoration: underline; }
`;

export function QuickFinance({ kind }: { kind: QuickFinanceKind }) {
  const navigate = useNavigate();
  const budget = useFinance('budget');
  const bills = useFinance('bills', { enabled: kind === 'bill' });
  const expenses = useFinance('expenses', { enabled: kind === 'spending' });
  const categories = useMemo(() => [...budget.records].sort((a, b) => a.order - b.order), [budget.records]);
  // Remounts the form after a save so it starts blank
  const [round, setRound] = useState(0);
  const [saved, setSaved] = useState('');

  const done = (what: string) => { setSaved(what); setRound(r => r + 1); };

  return (
    <Wrap>
      {kind === 'bill' ? (
        <BillEditor
          card
          noHeading
          key={`bill-${round}`}
          categories={categories}
          onAddCategory={async name => (await budget.save({ name, monthlyPlannedCents: 0, order: categories.reduce((m, c) => Math.max(m, c.order), -1) + 1 }))?.id ?? null}
          onSave={async b => { if (await bills.save(b)) setSaved(`Saved ${b.name} to Bills.`); }}
          onCancel={() => setRound(r => r + 1)}
        />
      ) : (
        <ExpenseForm
          key={`spend-${round}`}
          initial={{ date: todayStr(), description: '', amount: '', categoryId: '' }}
          categories={categories}
          card
          submitLabel="Log spending"
          onSubmit={e => void expenses.save(e).then(r => { if (r) done(`Logged ${e.description} to Spending.`); })}
        />
      )}
      {saved && (
        <Saved role="status">
          {saved}
          <button type="button" onClick={() => navigate('/finance')}>Open Budget &amp; bills</button>
        </Saved>
      )}
    </Wrap>
  );
}
