import { useState } from 'react';
import styled from 'styled-components';
import { PillButton } from '../components/atoms/PillButton.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { FinanceShell } from '../components/organisms/FinanceShell.js';
import { CollapsibleCard } from '../components/organisms/CollapsibleCard.js';
import {
  Section, SectionHead, SectionLabel, Note, SmallPill, InlineForm, Field, Actions, Table, Row, Cell, SubText,
  ProgressRule, Money, ConfirmDelete, SmallBtn, StatLabel,
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
  gap: 24px;
  align-items: start;
  @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); }
`;

const Balance = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 200;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  small { font-family: var(--font-sans); font-size: 13px; color: var(--text-tertiary); }
`;

const ENTRY_COLS = 'minmax(0, 1fr) 110px auto';
const CARDS_KEY = 'finance-savings-collapsed-v1';

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

  const add = (sign: 1 | -1) => {
    if (cents === null || cents <= 0) return;
    void onSave({ ...pot, entries: [...pot.entries, { id: newId(), date, amountCents: sign * cents, note: note.trim() || undefined }] });
    setAmount(''); setNote('');
  };

  return (
    <CollapsibleCard
      id={pot.id}
      storageKey={CARDS_KEY}
      title={pot.name}
      action={editing ? undefined : (
        /* Kept well clear of the collapse caret so Delete isn't hit by accident */
        <Actions style={{ marginRight: 32 }}>
          <SmallBtn type="button" onClick={() => setEditing(true)}>Edit</SmallBtn>
          <ConfirmDelete label="Delete" onConfirm={onDelete} />
        </Actions>
      )}
    >
      {editing && (
        <div style={{ marginBottom: 18 }}>
          <InlineForm onSubmit={e => {
            e.preventDefault();
            const t = target.trim() ? parseMoney(target) : null;
            if (!name.trim() || (target.trim() && t === null)) return;
            void onSave({ ...pot, name: name.trim(), targetCents: t ?? undefined });
            setEditing(false);
          }}>
            <Field $grow><span>Name</span><input value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field $w="130px"><span>Target</span><input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Optional" /></Field>
            <Actions>
              <PillButton type="submit">Save</PillButton>
              <PillButton type="button" $variant="neutral" onClick={() => setEditing(false)}>Cancel</PillButton>
            </Actions>
          </InlineForm>
        </div>
      )}
      <Balance>
        <span>{formatCents(balance)}</span>
        {pot.targetCents ? <small>of {formatCents(pot.targetCents)}</small> : null}
      </Balance>
      {pot.targetCents ? <ProgressRule fraction={balance / pot.targetCents} tone={balance >= pot.targetCents ? 'success' : 'default'} /> : null}

      <InlineForm style={{ marginTop: 18 }} onSubmit={e => { e.preventDefault(); add(1); }}>
        <Field $w="170px"><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field $w="110px"><span>Amount</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <Field $grow><span>Note</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" /></Field>
        {/* Buttons on their own line, with room above */}
        <Actions style={{ flexBasis: '100%', justifyContent: 'flex-start', marginTop: 10 }}>
          <PillButton type="submit" disabled={cents === null || cents <= 0}>Add</PillButton>
          <PillButton type="button" $variant="neutral" disabled={cents === null || cents <= 0} onClick={() => add(-1)}>Take out</PillButton>
        </Actions>
      </InlineForm>

      {pot.entries.length > 0 && (
        <Table $cols={ENTRY_COLS} style={{ marginTop: 16 }}>
          {[...pot.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50).map(e => (
            <Row key={e.id} $cols={ENTRY_COLS}>
              <span>{e.amountCents >= 0 ? 'Added' : 'Took out'}<SubText>{[formatDay(e.date), e.note].filter(Boolean).join(' · ')}</SubText></span>
              <Cell $right><Money cents={Math.abs(e.amountCents)} out={e.amountCents < 0} /></Cell>
              <Actions><ConfirmDelete label="Remove" onConfirm={() => void onSave({ ...pot, entries: pot.entries.filter(x => x.id !== e.id) })} /></Actions>
            </Row>
          ))}
        </Table>
      )}

    </CollapsibleCard>
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
    <Section>
      <SectionHead>
        <span>
          <SectionLabel>Savings</SectionLabel>
          {savings.records.length > 0 && <StatLabel>{formatCents(total)} saved in all</StatLabel>}
        </span>
        <SmallPill type="button" onClick={() => setAdding(a => !a)}>{adding ? 'Close' : 'New fund'}</SmallPill>
      </SectionHead>

      {(adding || savings.records.length === 0) && (
        <InlineForm style={{ marginBottom: 24 }} onSubmit={e => {
          e.preventDefault();
          if (!name.trim() || (target.trim() && targetCents === null)) return;
          void savings.save({ name: name.trim(), targetCents: targetCents ?? undefined, entries: [] });
          setName(''); setTarget(''); setAdding(false);
        }}>
          <Field $grow><span>Fund name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Emergency fund, vacation, car…" /></Field>
          <Field $w="150px"><span>Target</span><input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Optional" /></Field>
          <Actions><PillButton type="submit" disabled={!name.trim()}>Create fund</PillButton></Actions>
        </InlineForm>
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
    </Section>
  );
}
