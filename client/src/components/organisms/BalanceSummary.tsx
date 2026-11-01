import { useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../atoms/PillButton.js';
import {
  Section, SheetHead, SheetHeading, Note, StatBoxRow, StatCell, TextAction,
} from '../molecules/FinanceParts.js';
import { centsToInput, formatCents, formatDay, parseMoney, todayStr } from '../../utils/finance.js';
import { balanceNow, billsStillDue, type BalanceSnapshot } from '../../utils/financeBalance.js';
import type { FinanceRecord } from '../../types/finance.js';

/* Budget & bills → Current balance: what you have available to spend, across
   your accounts. Set it once ("Set balance"), and it keeps itself current —
   bills marked paid and spending logged since come off it — then
   Update brings it back in line with what your accounts say. Beside it, the
   bills still due this month and what's left after them. Props only. */

const MoneyForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 44px;
    min-width: 200px;
    padding: 0 14px;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    background: var(--bg-control, transparent);
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-muted);
  }
  label:focus-within { border-color: var(--color-accent-line); }
  input {
    flex: 1;
    min-width: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font: inherit;
    color: var(--text-primary);
  }
`;

export function BalanceSummary({ snapshot, bills, expenses, onSet }: {
  snapshot: BalanceSnapshot | null;
  bills: FinanceRecord<'bills'>[];
  expenses: FinanceRecord<'expenses'>[];
  onSet: (snapshot: BalanceSnapshot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const today = todayStr();
  const now = snapshot ? balanceNow(snapshot, bills, expenses) : null;
  const due = billsStillDue(bills, today);

  const startEdit = () => { setDraft(now ? centsToInput(now.cents) : ''); setEditing(true); };
  const cents = parseMoney(draft);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (cents === null) return;
    onSet({ amountCents: cents, setAt: new Date().toISOString() });
    setEditing(false);
  };

  const form = (
    <MoneyForm onSubmit={save}>
      <label>$<input autoFocus inputMode="decimal" value={draft} onChange={e => setDraft(e.target.value)} placeholder="0.00" aria-label="Current balance" /></label>
      <PillButton type="submit" disabled={cents === null}>{snapshot ? 'Save balance' : 'Set balance'}</PillButton>
      {snapshot && <TextAction type="button" onClick={() => setEditing(false)}>Cancel</TextAction>}
    </MoneyForm>
  );

  const since = now
    ? [now.payments ? `${now.payments} ${now.payments === 1 ? 'bill' : 'bills'} paid` : '', now.purchases ? `${now.purchases} ${now.purchases === 1 ? 'purchase' : 'purchases'}` : '']
      .filter(Boolean).join(', ')
    : '';
  const left = now ? now.cents - due.cents : 0;

  return (
    <Section aria-label="Current balance">
      <SheetHead>
        <SheetHeading>Current balance</SheetHeading>
        {snapshot && !editing && <TextAction type="button" onClick={startEdit}>Update</TextAction>}
      </SheetHead>
      {!snapshot || !now ? (
        <>
          <Note>
            What you have to spend right now, across all your accounts. Enter it once and it keeps itself current.
            Bills you mark paid and spending you log come off it, and you can update it whenever you check your accounts.
          </Note>
          {editing ? form : <PillButton type="button" style={{ marginTop: 12 }} onClick={startEdit}>Set balance</PillButton>}
        </>
      ) : (
        <>
          <StatBoxRow $cols={3}>
            <StatCell label="Available now" cents={now.cents} tone={now.cents < 0 ? 'danger' : 'accent'}
              sub={`Set ${formatDay(snapshot.setAt.slice(0, 10)).replace(/, \d{4}$/, '')}${since ? ` · ${since} since` : ''}`} />
            <StatCell label="Bills still due" cents={due.cents}
              sub={due.items.length ? `${due.items.length} ${due.items.length === 1 ? 'bill' : 'bills'} through ${formatDay(due.through).replace(/, \d{4}$/, '')}` : 'Nothing else due this month'} />
            <StatCell label="Left after bills" cents={left} tone={left < 0 ? 'danger' : 'accent'}
              sub={left < 0 ? `${formatCents(-left)} short for this month’s bills` : 'After the bills still due this month'} />
          </StatBoxRow>
          {editing && form}
        </>
      )}
    </Section>
  );
}
