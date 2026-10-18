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
import { centsToInput, formatCents, formatDay, newId, parseMoney, potBalance, todayStr } from '../utils/finance.js';
import type { FinanceRecord, SavingsPot } from '../types/finance.js';

const Center = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 0;
`;

const Pots = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: start;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); }
`;

/* "Saved in all" over a big thin figure, "+ New fund" across from it */
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
`;

const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Balance = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 18px 0 16px;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 300;
  line-height: 1;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  small { font-family: var(--font-sans); font-size: 14px; color: var(--text-muted); }
`;

const Buttons = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
`;

const Entries = styled.div`
  margin-top: 18px;
  border-top: 1px solid ${SHEET_RULE};
`;

const Entry = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-secondary);
  & + & { border-top: 1px solid ${SHEET_RULE}; }
  small { display: block; margin-top: 2px; font-size: 12px; color: var(--text-muted); }
  b { font-weight: 400; font-variant-numeric: tabular-nums; }
`;

const NewFund = styled(FieldRow)`
  margin-bottom: 24px;
`;

function PotCard({ pot, onSave, onDelete }: {
  pot: FinanceRecord<'savings'>;
  onSave: (p: SavingsPot & { id?: string }) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayStr());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pot.name);
  const [target, setTarget] = useState(centsToInput(pot.targetCents));
  const balance = potBalance(pot);
  const cents = parseMoney(amount);
  const ok = cents !== null && cents > 0;

  const add = (sign: 1 | -1) => {
    if (!ok || cents === null) return;
    void onSave({ ...pot, entries: [...pot.entries, { id: newId(), date, amountCents: sign * cents, note: note.trim() || undefined }] });
    setAmount(''); setNote('');
  };

  const menu: RowMenuItem[] = [
    { label: 'Rename or set target', onSelect: () => setEditing(true) },
    { label: 'Delete fund', danger: true, confirmLabel: 'Click again to delete', onSelect: onDelete },
  ];

  return (
    <PanelCard aria-label={pot.name}>
      <CardHead>
        <CardTitle>{pot.name}</CardTitle>
        <RowMenu label={`More actions for ${pot.name}`} items={menu} />
      </CardHead>

      {editing && (
        <form style={{ marginTop: 14 }} onSubmit={e => {
          e.preventDefault();
          const t = target.trim() ? parseMoney(target) : null;
          if (!name.trim() || (target.trim() && t === null)) return;
          void onSave({ ...pot, name: name.trim(), targetCents: t ?? undefined });
          setEditing(false);
        }}>
          <FieldRow $cols="minmax(0, 1fr) 140px">
            <label><input aria-label="Fund name" value={name} onChange={e => setName(e.target.value)} /></label>
            <label><span className="pre">$</span><input aria-label="Target" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target (optional)" /></label>
          </FieldRow>
          <Buttons>
            <OutlineBtn type="submit">Save</OutlineBtn>
            <OutlineBtn type="button" $tone="neutral" onClick={() => setEditing(false)}>Cancel</OutlineBtn>
          </Buttons>
        </form>
      )}

      <Balance>
        <span>{formatCents(balance)}</span>
        {pot.targetCents ? <small>of {formatCents(pot.targetCents)}</small> : null}
      </Balance>
      {pot.targetCents ? <div style={{ marginBottom: 16 }}><ProgressRule fraction={balance / pot.targetCents} tone={balance >= pot.targetCents ? 'success' : 'default'} /></div> : null}

      <form onSubmit={e => { e.preventDefault(); add(1); }}>
        <FieldRow $cols="150px 110px minmax(0, 1fr)">
          <label><input type="date" aria-label="Date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label><span className="pre">$</span><input aria-label="Amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
          <label><input aria-label="Note" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" /></label>
        </FieldRow>
        <Buttons>
          <OutlineBtn type="submit" disabled={!ok}>Add to fund</OutlineBtn>
          <OutlineBtn type="button" $tone="neutral" disabled={!ok} onClick={() => add(-1)}>Take out</OutlineBtn>
        </Buttons>
      </form>

      {pot.entries.length > 0 && (
        <Entries>
          {[...pot.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50).map(e => (
            <Entry key={e.id}>
              <span>{e.amountCents >= 0 ? 'Added' : 'Took out'}<small>{[formatDay(e.date), e.note].filter(Boolean).join(' · ')}</small></span>
              <b style={e.amountCents < 0 ? { color: 'var(--text-muted)' } : undefined}>{e.amountCents < 0 ? '−' : ''}{formatCents(Math.abs(e.amountCents))}</b>
              <ConfirmDelete label="Remove" onConfirm={() => void onSave({ ...pot, entries: pot.entries.filter(x => x.id !== e.id) })} />
            </Entry>
          ))}
        </Entries>
      )}
    </PanelCard>
  );
}

/** Savings: named funds, each with contributions and withdrawals. */
export function FinanceSavingsView() {
  return (
    <FinanceShell>
      <Savings />
    </FinanceShell>
  );
}

function Savings() {
  const savings = useFinance('savings');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [adding, setAdding] = useState(false);

  if (savings.status === 'idle' || savings.status === 'loading') return <Center><Spinner size={32} /></Center>;

  const total = savings.records.reduce((s, p) => s + potBalance(p), 0);
  const targetCents = target.trim() ? parseMoney(target) : null;

  return (
    <section>
      <Top>
        <div>
          <TotalLabel>Saved in all</TotalLabel>
          <TotalFigure>{formatCents(total)}</TotalFigure>
        </div>
        <PillButton type="button" onClick={() => setAdding(a => !a)}>{adding ? 'Close' : 'New fund'}</PillButton>
      </Top>

      {(adding || savings.records.length === 0) && (
        <form onSubmit={e => {
          e.preventDefault();
          if (!name.trim() || (target.trim() && targetCents === null)) return;
          void savings.save({ name: name.trim(), targetCents: targetCents ?? undefined, entries: [] });
          setName(''); setTarget(''); setAdding(false);
        }}>
          <NewFund $cols="minmax(0, 1fr) 170px auto">
            <label><input aria-label="Fund name" value={name} onChange={e => setName(e.target.value)} placeholder="Fund name — emergency fund, vacation, car…" /></label>
            <label><span className="pre">$</span><input aria-label="Target" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target (optional)" /></label>
            <label style={{ padding: '0 6px' }}><OutlineBtn type="submit" disabled={!name.trim()} style={{ height: 30 }}>Create fund</OutlineBtn></label>
          </NewFund>
        </form>
      )}

      {savings.records.length === 0 ? (
        <Note>Make a fund for each thing you're saving for, then log what you add or take out. Goals can track a fund's balance.</Note>
      ) : (
        <Pots>
          {savings.records.map(p => (
            <PotCard key={p.id} pot={p} onSave={x => savings.save(x)} onDelete={() => void savings.remove(p.id)} />
          ))}
        </Pots>
      )}
    </section>
  );
}
