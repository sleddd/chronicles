import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { KITCHEN_TITLE, MealsTabBar } from '../components/molecules/MealsTabBar.js';
import { FilterTabs } from '../components/molecules/FilterTabs.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { EntryTableHead } from '../components/molecules/EntryTable.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { NewEntryCard } from '../components/organisms/NewEntryCard.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { entries as entriesApi } from '../services/api.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import type { ShoppingItem } from '../types/fields.js';

/* ── Layout (mirrors HealthView) ── */

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
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
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

const TabsRow = styled.div`
  margin: 0;
`;

const NewBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 9px 4px;
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 120ms ease;
  &:hover { opacity: 0.7; }
`;

const SubTabs = styled.div`
  padding: 10px 0 4px;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

/* ── Tabs ── */

const TABS = [
  { value: 'current' as const, label: 'Current' },
  { value: 'completed' as const, label: 'Completed' },
];
type Tab = 'current' | 'completed';

/* ── ShoppingListsView ── */

export function ShoppingListsView() {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries   = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';
  const openInJournal = useOpenInJournal();

  const [tab, setTab] = useState<Tab>('current');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteEntryWithImages(id);
    } catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

  const shoppingListTopic = useMemo(
    () => allTopics.find(t => t.name.toLowerCase() === 'shopping list'),
    [allTopics]
  );

  const lists = useMemo(() => {
    if (!shoppingListTopic) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === shoppingListTopic.id)
      .map(e => {
        const meta = e.metadata as Record<string, unknown>;
        const cf   = meta?._customFields as Record<string, unknown> | undefined;
        const items = (cf?.items as ShoppingItem[]) || [];
        const completed = items.length > 0 && items.every(i => i.checked);
        return { entry: e, completed };
      })
      .sort((a, b) => new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime());
  }, [entries, shoppingListTopic]);

  const visible = useMemo(
    () => lists.filter(l => tab === 'completed' ? l.completed : !l.completed),
    [lists, tab]
  );

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to view shopping lists" /></ContentTemplate>
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

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>{KITCHEN_TITLE}</Title>
            {shoppingListTopic && (
              <NewBtn onClick={() => setIsAddOpen(true)}>
                <MaterialIcon $size={16} aria-hidden="true">add</MaterialIcon>
                New list
              </NewBtn>
            )}
          </Head>

          <TabsRow><MealsTabBar /></TabsRow>

          <SubTabs>
            <FilterTabs options={TABS} active={tab} onChange={v => setTab(v as Tab)} flush bordered={false} />
          </SubTabs>

          {shoppingListTopic && isAddOpen && (
            <NewEntryCard
              topic={shoppingListTopic}
              accentColor={accentColor}
              hideButton
              isOpen={isAddOpen}
              onOpenChange={setIsAddOpen}
            />
          )}

          {visible.length === 0 ? (
            <EmptyState
              message={tab === 'completed' ? 'No completed lists yet.' : 'No current shopping lists.'}
              submessage={tab === 'current' ? 'Use “New list” above to create your first shopping list.' : undefined}
            />
          ) : (
            <List>
              <EntryTableHead />
              {visible.map(({ entry, completed }) => {
                const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
                return (
                  <SwipeActions
                    key={entry.id}
                    accentColor={accentColor}
                    onEdit={() => openInJournal(entry.id)}
                    onDelete={() => handleDelete(entry.id)}
                  >
                    <EntryListCard
                      content={entry.content}
                      createdAt={created}
                      topicName={shoppingListTopic?.name}
                      completed={completed}
                      fallbackTitle={builtinEntryName((entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown>)}
                      onClick={() => openInJournal(entry.id)}
                    />
                  </SwipeActions>
                );
              })}
            </List>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
