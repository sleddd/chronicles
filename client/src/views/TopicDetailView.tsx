import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ContentTemplate } from '../components/templates/ContentTemplate.js';
import { EmptyState } from '../components/atoms/EmptyState.js';
import { Spinner } from '../components/atoms/Spinner.js';
import { UnlockDialog } from '../components/organisms/UnlockDialog.js';
import { MaterialIcon } from '../components/atoms/MaterialIcon.js';
import { useOpenInJournal } from '../hooks/useOpenInJournal.js';
import { deleteEntryWithImages } from '../utils/entryActions.js';
import { builtinEntryName } from '../utils/stripHtml.js';
import { EntryListCard } from '../components/molecules/EntryListCard.js';
import { SwipeActions } from '../components/molecules/SwipeActions.js';
import { NewEntryCard } from '../components/organisms/NewEntryCard.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useInitializeData } from '../hooks/useInitializeData.js';
import { entries as entriesApi } from '../services/api.js';
import type { DecryptedPost } from '@shared/crypto/types';

/* ── Layout (mirrors TopicsView) ── */

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

const TitleBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const BackBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: -6px;
  background: transparent;
  border: none;
  border-radius: var(--r-md, 4px);
  color: var(--text-tertiary);
  cursor: pointer;
  &:hover { background: var(--bg-hover); color: var(--text-primary); }
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

/* ── Rows ── */

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

const AddWrap = styled.div`
  padding: 8px 0 0;
`;

/* ── View ── */

export function TopicDetailView() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { isReady, isLoading, needsUnlock, handleUnlock } = useInitializeData();
  const allTopics = useEntriesStore(s => s.allTopics);
  const entries = useEntriesStore(s => s.decryptedEntries);
  const accentColor = useUIStore(s => s.accentColor) || '#4A5568';
  const openInJournal = useOpenInJournal();

  const topic = allTopics.find(t => String(t.id) === String(topicId));

  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleDeleteEntry = useCallback(async (id: number) => {
    try {
      await deleteEntryWithImages(id);
    } catch (err) { console.error('Failed to delete entry:', err); }
  }, []);

  const topicEntries = useMemo(() => {
    if (!topic) return [];
    return entries
      .filter(e => (e.metadata as Record<string, unknown>)?._taxonomyId === topic.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, topic]);

  if (needsUnlock) return (
    <>
      <ContentTemplate><EmptyState message="Unlock your journal to view this topic" /></ContentTemplate>
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

  if (!topic) return (
    <ContentTemplate>
      <EmptyState message="Topic not found." submessage="It may have been deleted." />
    </ContentTemplate>
  );

  return (
    <ContentTemplate>
      <Page>
        <Inner>
          <Head>
            <TitleBlock>
              <BackBtn onClick={() => navigate('/topics')} aria-label="Back to topics">
                <MaterialIcon $size={22} aria-hidden="true">chevron_left</MaterialIcon>
              </BackBtn>
              <Title>{topic.name}</Title>
            </TitleBlock>
            <NewBtn onClick={() => setIsAddOpen(true)}>
              <MaterialIcon $size={16} aria-hidden="true">add</MaterialIcon>
              New entry
            </NewBtn>
          </Head>

          {isAddOpen && (
            <AddWrap>
              <NewEntryCard
                topic={topic}
                accentColor={accentColor}
                hideButton
                isOpen={isAddOpen}
                onOpenChange={setIsAddOpen}
              />
            </AddWrap>
          )}

          {topicEntries.length === 0 ? (
            <EmptyState message={`No ${topic.name.toLowerCase()} entries yet.`} />
          ) : (
            <List>
              {topicEntries.map((entry: DecryptedPost) => {
                const created = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
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
                      topicName={topic.name}
                      topicColor={topic.color || accentColor}
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
