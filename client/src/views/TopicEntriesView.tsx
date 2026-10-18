import { useState, useMemo, useCallback } from 'react';
import { PillButton } from '../components/atoms/PillButton.js';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { MonthGroups } from '../components/molecules/MonthGroups.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { useOpenInJournal, useNewEntryInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName, stripHtml, summarizeUserFields } from '../utils/stripHtml.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { useUIStore } from '../stores/uiStore.js';
import type { DecryptedPost } from '@shared/crypto/types';
import { entryTopicIds, hasMixedTopics } from '../utils/mixedTopics.js';
import { DEFAULT_ACCENT_COLOR } from '../styles/accent.js';

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
  /* Room for descenders (g/p/y), which overflow: hidden would clip */
  padding-bottom: 0.2em;
  margin: 0 0 -0.2em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  @media (max-width: 480px) { font-size: 34px; }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  /* Breathing room between the topic title and its entries */
  margin-top: 28px;
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
  const accentColor = useUIStore(s => s.accentColor) || DEFAULT_ACCENT_COLOR;
  const topicCustomFields = useUIStore(s => s.topicCustomFields);
  const openInJournal = useOpenInJournal();

  const newEntry = useNewEntryInJournal();

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
  // Topic labels only when the list spans more than one topic
  const mixedTopics = useMemo(() => hasMixedTopics(entryTopicIds(filtered)), [filtered]);

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
              <PillButton type="button" onClick={() => addTopic && newEntry(addTopic.id)}>
                New entry
              </PillButton>
            )}
          </Head>

          {navBar}


          {filtered.length === 0 ? (
            <EmptyState message={`No ${title.toLowerCase()} entries yet.`} />
          ) : (
            <List>
              <MonthGroups items={filtered} keyOf={e => e.id} dateOf={e => (e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt))}>{entry => {
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
                    onDelete={() => handleDeleteEntry(entry.id)}
                  >
                    <EntryListCard
                      content={entry.content}
                      createdAt={created}
                      topicName={mixedTopics ? topic?.name : undefined}
                      topicColor={topic?.color || accentColor}
                      fallbackTitle={fallbackTitle}
                      preview={preview}
                      onClick={() => openInJournal(entry.id)}
                    />
                  </SwipeActions>
                );
              }}</MonthGroups>
            </List>
          )}
        </Inner>
      </Page>
    </ContentTemplate>
  );
}
