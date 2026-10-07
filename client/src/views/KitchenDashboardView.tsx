import { useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { Checkbox } from '../components/atoms/Checkbox.js';
import { PillButton } from '../components/atoms/PillButton.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { KITCHEN_TITLE, MealsTabBar } from '../components/molecules/MealsTabBar.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { entries as entriesApi } from '../services/api.js';
import { builtinEntryName, stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { longDay } from '../components/organisms/FoodLog.js';
import { latestOpenList, menuDays, upcomingMeals } from '../utils/kitchen.js';
import type { ShoppingItem } from '../types/fields.js';

/* ── Layout (mirrors the Health dashboard) ── */

const Page = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px 64px;
  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

const Head = styled.div`
  padding: 53px 0 16px;
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  @media (max-width: 480px) { font-size: 34px; }
`;

/* Flat, borderless section: a top rule + tracked label row. */
const Section = styled.section`
  margin-top: 32px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`;

const SectionLabel = styled.h2`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
`;

const SectionLink = styled.button`
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  &:hover { opacity: 0.7; }
`;

const Note = styled.p`
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
`;

const SubTitle = styled.div`
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  color: var(--text-primary);
  margin: 0 0 12px;
`;

function DashSection({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Section aria-label={label}>
      <SectionHead>
        <SectionLabel>{label}</SectionLabel>
        {action}
      </SectionHead>
      {children}
    </Section>
  );
}

/* ── Today's meals ── */

const MealRow = styled.div`
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 16px;
  align-items: baseline;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
  &:last-child { border-bottom: none; }
`;

const SlotLabel = styled.span`
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const MealName = styled.button<{ $link: boolean }>`
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  cursor: ${({ $link }) => ($link ? 'pointer' : 'default')};
  &:hover { ${({ $link }) => ($link ? 'color: var(--color-accent);' : '')} }
`;

function UpcomingMeals() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const openInJournal = useOpenInJournal();
  const today = toDateStr(new Date());
  const menuTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'menu plan')?.id, [allTopics]);
  const next = useMemo(() => upcomingMeals(menuDays(entries, menuTopicId), today), [entries, menuTopicId, today]);

  if (!next) return <Note>Nothing planned for the next two weeks. Plan meals on the Menu tab.</Note>;
  return (
    <>
      <SubTitle>{next.day === today ? 'Today' : longDay(next.day)}</SubTitle>
      {next.meals.map(m => (
        <MealRow key={m.slot}>
          <SlotLabel>{m.label}</SlotLabel>
          <MealName
            type="button"
            $link={m.recipeId !== null}
            disabled={m.recipeId === null}
            onClick={() => { if (m.recipeId !== null) openInJournal(m.recipeId); }}
            title={m.recipeId !== null ? 'Open recipe' : undefined}
          >
            {m.name}
          </MealName>
        </MealRow>
      ))}
    </>
  );
}

/* ── Shopping list checklist ── */

const ItemRow = styled.div<{ $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: ${({ $done }) => ($done ? 'var(--text-tertiary)' : 'var(--text-primary)')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  label { cursor: pointer; }
`;

const AddRow = styled.form`
  display: flex;
  gap: 10px;
  margin-top: 12px;
  align-items: center;
`;

const AddInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: none;
  border-radius: var(--r-md, 1px);
  &:focus { outline: 2px solid var(--color-accent); outline-offset: 0; }
  &::placeholder { color: var(--text-tertiary); }
`;

const ErrorNote = styled(Note)`
  color: var(--color-danger, #9B4444);
  margin-top: 8px;
`;

function ShoppingChecklist() {
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const updateDecryptedEntry = useEntriesStore(s => s.updateDecryptedEntry);
  const { encryptPost } = useEncryption();
  const openInJournal = useOpenInJournal();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const listTopicId = useMemo(() => allTopics.find(t => t.name.toLowerCase() === 'shopping list')?.id, [allTopics]);
  const list = useMemo(() => latestOpenList(entries, listTopicId), [entries, listTopicId]);

  if (!list) {
    return (
      <Note>
        No open shopping list.{' '}
        <SectionLink type="button" onClick={() => navigate('/shopping')}>Start one</SectionLink>
      </Note>
    );
  }

  const meta = (list.metadata as Record<string, unknown>) ?? {};
  const cf = (meta._customFields as Record<string, unknown>) ?? {};
  const items = (cf.items as ShoppingItem[] | undefined) ?? [];
  const left = items.filter(i => !i.checked).length;
  const name = stripHtml(list.content).trim() || builtinEntryName(cf) || 'Shopping list';

  const saveItems = async (next: ShoppingItem[]) => {
    const prev = list.metadata;
    const metadata = { ...meta, _customFields: { ...cf, items: next } };
    updateDecryptedEntry(list.id, { metadata });
    setError('');
    try {
      const tid = meta._taxonomyId as number | undefined;
      const encrypted = await encryptPost(list.content, metadata);
      await entriesApi.update(list.id, {
        contentEncrypted: encrypted.contentEncrypted, contentIv: encrypted.contentIv,
        metadataEncrypted: encrypted.metadataEncrypted, metadataIv: encrypted.metadataIv,
        taxonomyIds: tid ? [tid] : [],
      });
    } catch (err) {
      console.error('Shopping list save failed:', err);
      updateDecryptedEntry(list.id, { metadata: prev });
      setError('That change didn’t save — try again.');
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void saveItems([...items, { id: crypto.randomUUID(), name: text, category: 'other', checked: false }]);
  };

  // Unchecked first, so what's still needed sits at the top
  const ordered = [...items.filter(i => !i.checked), ...items.filter(i => i.checked)];

  return (
    <>
      <SubTitle>{name}</SubTitle>
      <Note style={{ marginBottom: 8 }}>
        {items.length === 0 ? 'No items yet.' : `${left} of ${items.length} left to get`}
      </Note>
      {ordered.map(item => (
        <ItemRow key={item.id} $done={item.checked}>
          <Checkbox
            checked={item.checked}
            label={item.name || 'Item'}
            onChange={v => void saveItems(items.map(i => (i.id === item.id ? { ...i, checked: v } : i)))}
          />
        </ItemRow>
      ))}
      <AddRow onSubmit={add}>
        <AddInput value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="Add an item" />
        <PillButton type="submit" disabled={!draft.trim()}>Add</PillButton>
        <PillButton type="button" $variant="neutral" onClick={() => openInJournal(list.id)}>Open list</PillButton>
      </AddRow>
      {error && <ErrorNote role="alert">{error}</ErrorNote>}
    </>
  );
}

/* ── View ── */

/**
 * From the Kitchen dashboard: what's on the menu today (or next), and the
 * latest unfinished shopping list as a checklist you can tick off and add to.
 */
export function KitchenDashboardView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const navigate = useNavigate();

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to continue" /></ContentTemplate>
      <UnlockDialog onUnlock={handleUnlock} />
    </>
  );

  if (isLoading || !isReady) return (
    <ContentTemplate>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Spinner size={40} />
      </div>
    </ContentTemplate>
  );

  const seeAll = (path: string) => <SectionLink type="button" onClick={() => navigate(path)}>See all</SectionLink>;

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head><Title>{KITCHEN_TITLE}</Title></Head>
          <MealsTabBar />

          <DashSection label="Meals" action={seeAll('/menu')}>
            <UpcomingMeals />
          </DashSection>

          <DashSection label="Shopping list" action={seeAll('/shopping')}>
            <ShoppingChecklist />
          </DashSection>
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
