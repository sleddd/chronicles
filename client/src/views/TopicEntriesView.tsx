import { useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { NewEntryCard } from '../components/organisms/NewEntryCard.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName, stripHtml, summarizeUserFields } from '../utils/stripHtml.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useUIStore } from '../stores/uiStore.js';
import type { DecryptedPost } from '@shared/crypto/types';

/* ── Layout (mirrors TopicDetailView / TopicsView) ── */

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
  padding: 53px 0 20px;
`;

const Title = styled.h1`
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  @media (max-width: 480px) { font-size: 34px; }
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

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

const AddWrap = styled.div`
  padding: 8px 0 0;
`;

/* ── View ── */

interface TopicEntriesViewProps {
  title: string;
  titleTo?: string;
  topicNames: string[];
  metaFields?: { key: string; label: string }[];
  showDateFilter?: boolean;
  printable?: boolean;
  navBar?: ReactNode;
  summaryFields?: { key: string; label: string; format?: (total: number) => string }[];
}

export function TopicEntriesView({ title, topicNames, navBar }: TopicEntriesViewProps) {
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const entries = useEntriesStore(s => s.decryptedEntries);
  const allTopics = useEntriesStore(s => s.allTopics);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const openInJournal = useOpenInJournal();

  const [isAddOpen, setIsAddOpen] = useState(false);

  // The add affordance appears when the names resolve to exactly one topic
  const addTopic = useMemo(() => {
    const matches = allTopics.filter(t => topicNames.some(n => n.toLowerCase() === t.name.toLowerCase()));
    return matches.length === 1 ? matches[0] : undefined;
  }, [allTopics, topicNames]);

  const topicIds = useMemo(() => {
    const lowerNames = new Set(topicNames.map(n => n.toLowerCase()));
    return new Set(allTopics.filter(t => lowerNames.has(t.name.toLowerCase())).map(t => t.id));
  }, [allTopics, topicNames]);

  const filtered = useMemo(() => (
    entries
      .filter(entry => {
        const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
        return !!taxId && topicIds.has(taxId);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  ), [entries, topicIds]);

  const getTopicForEntry = useCallback((entry: DecryptedPost) => {
    const taxId = (entry.metadata as Record<string, unknown>)?._taxonomyId as number | undefined;
    return taxId ? allTopics.find(t => t.id === taxId) : undefined;
  }, [allTopics]);

  const handleDeleteEntry = useCallback(async (id: number) => {
    try {
      await deleteEntryWithImages(id);
    } catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

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

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <Title>{title}</Title>
            {addTopic && (
              <NewBtn onClick={() => setIsAddOpen(true)}>
                <MaterialIcon $size={16} aria-hidden="true">add</MaterialIcon>
                New entry
              </NewBtn>
            )}
          </Head>

          {navBar}

          {addTopic && isAddOpen && (
            <AddWrap>
              <NewEntryCard
                topic={addTopic}
                accentColor={accentColor}
                hideButton
                isOpen={isAddOpen}
                onOpenChange={setIsAddOpen}
              />
            </AddWrap>
          )}

          {filtered.length === 0 ? (
            <EmptyState message={`No ${title.toLowerCase()} entries yet.`} />
          ) : (
            <List>
              {filtered.map(entry => {
                const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
                const topic = getTopicForEntry(entry);

                // No text content → the first filled custom field is the
                // title; the remaining fields become the preview line
                const cf = (entry.metadata as Record<string, unknown>)?._customFields as Record<string, unknown> | undefined;
                const uf = (cf?._userFields as Record<string, unknown>) ?? {};
                const defs = topic ? (topicCustomFields[topic.id] ?? []) : [];
                let fallbackTitle = builtinEntryName(cf);
                let previewDefs = defs;
                if (!fallbackTitle) {
                  const primary = defs.find(d => {
                    const v = uf[d.id];
                    return typeof v === 'string' ? v.trim() !== '' : v != null;
                  });
                  if (primary) {
                    const v = uf[primary.id];
                    fallbackTitle = typeof v === 'string' ? v.trim() : String(v);
                    previewDefs = defs.filter(d => d !== primary);
                  }
                }
                const hasText = stripHtml(entry.content).trim() !== '';
                const preview = !hasText ? (summarizeUserFields(previewDefs, uf) || undefined) : undefined;

                return (
                  <SwipeActions
                    key={entry.id}
                    accentColor={accentColor}
                    onEdit={() => openInJournal(entry.id)}
                    onDelete={() => handleDeleteEntry(entry.id)}
                  >
                    <EntryListCard
                      content={entry.content}
                      createdAt={created}
                      topicName={topic?.name}
                      topicColor={topic?.color || accentColor}
                      fallbackTitle={fallbackTitle}
                      preview={preview}
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
