import { useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../components/atoms/PillButton.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import {
  Note, ProgressRule, ConfirmDelete, RowMenu, type RowMenuItem,
  PanelCard, CardTitle, FieldRow, OutlineBtn, SHEET_RULE,
} from '../components/molecules/FinanceParts.js';
import { useFinance } from '../hooks/useFinance.js';
import { centsToInput, debtFraction, debtOwed, formatCents, formatDay, isDebt, newId, parseMoney, todayStr } from '../utils/finance.js';
import type { FinanceRecord, SavingsPot } from '../types/finance.js';

/* Debts: the same as Savings, the other way round — each debt starts at the balance owed,
   and you log each payment toward it. Kept in the encrypted savings
   table as kind 'debt', so the server sees nothing new. */

const ErrorNote = styled.p`
  margin: -14px 0 20px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-danger);
`;

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: start;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); }
`;

/* "Owed in all" over a big thin figure, "New debt" across from it */
const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 32px 0 36px;
`;

const TotalLabel = styled.div`
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-soft);
`;

const TotalFigure = styled.div`
  margin-top: 4px;
  font-family: var(--font-display);
  font-size: 38px;
  font-weight: 300;
  line-height: 1.05;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  small { margin-left: 10px; font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Owed = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 24px 0 20px;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 300;
  line-height: 1;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  small { font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

/* Log payment: one button across the card */
const OneButton = styled.div`
  display: grid;
  margin-top: 16px;
`;

const Buttons = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
`;

const Entries = styled.div`
  margin-top: 26px;
  border-top: 1px solid ${SHEET_RULE};
`;

const Entry = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  small { display: block; margin-top: 2px; font-size: 12px; color: var(--text-muted); }
  b { font-weight: 400; font-variant-numeric: tabular-nums; }
`;

const NewDebt = styled(FieldRow)`
  margin-bottom: 24px;
`;

function DebtCard({ debt, onSave, onDelete }: {
  debt: FinanceRecord<'savings'>;
  onSave: (d: SavingsPot & { id?: string }) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayStr());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(debt.name);
  const [start, setStart] = useState(centsToInput(debt.startCents));
  const owed = debtOwed(debt);
  const start$ = debt.startCents ?? 0;
  const cents = parseMoney(amount);
  const ok = cents !== null && cents > 0;

  // A payment toward the debt
  const pay = () => {
    if (!ok || cents === null) return;
    void onSave({ ...debt, entries: [...debt.entries, { id: newId(), date, amountCents: cents, note: note.trim() || undefined }] });
    setAmount(''); setNote('');
  };

  const menu: RowMenuItem[] = [
    { label: 'Rename or change balance', onSelect: () => setEditing(true) },
    { label: 'Delete debt', danger: true, confirmLabel: 'Click again to delete', onSelect: onDelete },
  ];

  return (
    <PanelCard aria-label={debt.name}>
      <CardHead>
        <CardTitle>{debt.name}</CardTitle>
        <RowMenu label={`More actions for ${debt.name}`} items={menu} />
      </CardHead>

      {editing && (
        <form style={{ marginTop: 14 }} onSubmit={e => {
          e.preventDefault();
          const v = parseMoney(start);
          if (!name.trim() || v === null) return;
          void onSave({ ...debt, name: name.trim(), startCents: v });
          setEditing(false);
        }}>
          <FieldRow $cols="minmax(0, 1fr) 140px">
            <label><input aria-label="Debt name" value={name} onChange={e => setName(e.target.value)} /></label>
            <label><span className="pre">$</span><input aria-label="Balance owed" inputMode="decimal" value={start} onChange={e => setStart(e.target.value)} placeholder="Balance owed" /></label>
          </FieldRow>
          <Buttons>
            <OutlineBtn type="submit">Save</OutlineBtn>
            <OutlineBtn type="button" $tone="neutral" onClick={() => setEditing(false)}>Cancel</OutlineBtn>
          </Buttons>
        </form>
      )}

      {/* What's still owed, "of" the starting balance, and how far it's paid down */}
      <Owed>
        <span>{formatCents(owed)}</span>
        {start$ > 0 ? <small>{owed === 0 ? 'Paid off' : `of ${formatCents(start$)}`}</small> : null}
      </Owed>
      {start$ > 0 ? <div style={{ marginBottom: 24 }}><ProgressRule fraction={debtFraction(debt)} tone={owed === 0 ? 'success' : 'default'} /></div> : null}

      <form onSubmit={e => { e.preventDefault(); pay(); }}>
        <FieldRow $cols="150px 110px minmax(0, 1fr)">
          <label><input type="date" aria-label="Date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label><span className="pre">$</span><input aria-label="Amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
          <label><input aria-label="Note" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" /></label>
        </FieldRow>
        <OneButton>
          <OutlineBtn type="submit" disabled={!ok}>Log payment</OutlineBtn>
        </OneButton>
      </form>

      {debt.entries.length > 0 && (
        <Entries>
          {[...debt.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50).map(e => (
            <Entry key={e.id}>
              <span>{e.amountCents >= 0 ? 'Paid' : 'Added'}<small>{[formatDay(e.date), e.note].filter(Boolean).join(' · ')}</small></span>
              <b>{formatCents(Math.abs(e.amountCents))}</b>
              <ConfirmDelete label="Remove" onConfirm={() => void onSave({ ...debt, entries: debt.entries.filter(x => x.id !== e.id) })} />
            </Entry>
          ))}
        </Entries>
      )}
    </PanelCard>
  );
}

/** Debts: each with a starting balance, payments logged against it, and any charges added. */
export function FinanceDebtsView() {
  return (
    <FinanceShell>
      <Debts />
    </FinanceShell>
  );
}

function Debts() {
  const savings = useFinance('savings');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  if (savings.status === 'idle' || savings.status === 'loading') return <Center><Spinner size={32} /></Center>;

  const debts = savings.records.filter(isDebt);
  const owed = debts.reduce((s, d) => s + debtOwed(d), 0);
  const balanceCents = parseMoney(balance);

  return (
    <section>
      <Top>
        <div>
          <TotalLabel>Owed in all</TotalLabel>
          <TotalFigure>{formatCents(owed)}</TotalFigure>
        </div>
        <PillButton type="button" onClick={() => {
          // With no debts the form is already open: New debt just takes you to its name box
          if (debts.length === 0) { document.getElementById('new-debt-name')?.focus(); return; }
          setAdding(a => !a);
        }}>{adding && debts.length > 0 ? 'Close' : 'New debt'}</PillButton>
      </Top>

      {(adding || debts.length === 0) && (
        <form onSubmit={e => {
          e.preventDefault();
          // Say what's missing rather than leaving the button greyed out
          if (!name.trim()) { setError('Give the debt a name.'); return; }
          if (balanceCents === null || balanceCents <= 0) { setError('Enter the balance owed, like 1200.00'); return; }
          setError('');
          void savings.save({ kind: 'debt', name: name.trim(), startCents: balanceCents, entries: [] })
            .then(r => { if (!r) setError('Couldn’t save that debt. Try again.'); });
          setName(''); setBalance(''); setAdding(false);
        }}>
          <NewDebt $cols="minmax(0, 1fr) 170px auto">
            <label><input id="new-debt-name" aria-label="Debt name" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Debt name — credit card, car loan, student loan…" /></label>
            <label><span className="pre">$</span><input aria-label="Balance owed" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} placeholder="Balance owed" /></label>
            <label style={{ padding: '0 6px' }}><OutlineBtn type="submit" style={{ height: 30 }}>Add debt</OutlineBtn></label>
          </NewDebt>
          {error && <ErrorNote role="alert">{error}</ErrorNote>}
        </form>
      )}

      {debts.length === 0 ? (
        <Note>Add each debt with what you owe on it, then log each payment you make toward it.</Note>
      ) : (
        <Cards>
          {debts.map(d => (
            <DebtCard key={d.id} debt={d} onSave={x => savings.save(x)} onDelete={() => void savings.remove(d.id)} />
          ))}
        </Cards>
      )}
    </section>
  );
}
