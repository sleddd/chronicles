import styled from 'styled-components';
import { DateInput } from '../atoms/DateInput.js';
import { useUIStore } from '../../stores/uiStore.js';
import { useEntriesStore } from '../../stores/entriesStore.js';

/* The journal's search filters, under the tool row while searching: topic and
   a From / To date range (the keyword is the tool row's search box). Keyword
   and dates apply while searching; the topic filter stays on
   across tabs (with its own Clear bar). Compact stacked labels to fit the
   narrow journal list panel. */

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px 16px;
  border-bottom: 1px solid var(--border-subtle);
`;

const DateRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  /* Filled DS box (GlobalStyle flattens inputs to transparent) */
  input, select {
    width: 100%;
    min-height: 38px;
    padding: 0 10px;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    background-color: var(--bg-sunken) !important;
    border-radius: 4px; /* just a little round */
  }
  select {
    appearance: none;
    cursor: pointer;
    padding-right: 32px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2390909a' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
  }
  input:focus, select:focus { outline: 1px solid var(--color-accent) !important; outline-offset: -1px; }
`;

const FieldLabel = styled.span`
  font-family: var(--font-label);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
`;

const ClearBtn = styled.button`
  align-self: flex-start;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--color-accent);
  &:hover { color: var(--color-accent-hover); }
`;

export function SearchPanel() {
  const searchKeyword = useUIStore(s => s.searchKeyword);
  const selectedTopicId = useUIStore(s => s.selectedTopicId);
  const setSelectedTopicId = useUIStore(s => s.setSelectedTopicId);
  const topics = useEntriesStore(s => s.topics);
  const searchDateFrom = useUIStore(s => s.searchDateFrom);
  const searchDateTo = useUIStore(s => s.searchDateTo);
  const setSearchDateFrom = useUIStore(s => s.setSearchDateFrom);
  const setSearchDateTo = useUIStore(s => s.setSearchDateTo);
  const clearSearch = useUIStore(s => s.clearSearch);

  const hasFilters = searchKeyword || searchDateFrom || searchDateTo || selectedTopicId != null;

  return (
    <Panel>
      <Field>
        <FieldLabel>Topic</FieldLabel>
        <select
          value={selectedTopicId ?? ''}
          onChange={e => setSelectedTopicId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All topics</option>
          {[...topics].sort((a, b) => a.name.localeCompare(b.name)).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </Field>
      <DateRow>
        <Field>
          <FieldLabel>From</FieldLabel>
          <DateInput value={searchDateFrom} onChange={e => setSearchDateFrom(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>To</FieldLabel>
          <DateInput value={searchDateTo} onChange={e => setSearchDateTo(e.target.value)} />
        </Field>
      </DateRow>
      {hasFilters && (
        <ClearBtn type="button" onClick={() => { clearSearch(); setSelectedTopicId(null); }}>Clear filters</ClearBtn>
      )}
    </Panel>
  );
}
