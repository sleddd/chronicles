import styled from 'styled-components';

/* Shared pieces for the mockup-style field forms (exercise, meals, …):
   sentence-case section labels, outline chips, a segmented control, an
   outlined stats strip, a date | time box and outlined text boxes.
   Margins, not gaps: the journal editor zeroes gaps on its field wrappers. */

export const FormWrap = styled.div`
  display: flex;
  flex-direction: column;
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  & + & { margin-top: 40px; }
`;

export const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
`;

export const SectionLabel = styled.h3`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-soft);
`;

/* A big borderless title field ("What did you eat?") */
export const TitleInput = styled.input`
  && {
    width: 100%;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 300;
    line-height: 1.2;
    color: var(--text-primary);
  }
  &::placeholder { color: var(--text-hint); }
`;

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

/* Outline chip: chosen = accent outline + soft-accent text, never a fill */
export const Chip = styled.button<{ $active: boolean }>`
  height: 38px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--border-card)')};
  background: transparent;
  font-family: var(--font-sans);
  font-size: 16px;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-soft)')};
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
  &:hover { border-color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--control-border)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Segmented control: one outlined box; the chosen segment gets an accent
   outline and soft-accent text (no fill) */
export const Segments = styled.div`
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(110px, 1fr);
  align-self: flex-start;
  max-width: 100%;
  padding: 4px;
  border: 1px solid var(--border-card);
  border-radius: 10px;
`;

export const Segment = styled.button<{ $active: boolean }>`
  height: 34px;
  padding: 0 16px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'transparent')};
  border-radius: 7px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 16px;
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-muted)')};
  cursor: pointer;
  &:hover { color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-soft)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Outlined strip of stat cells split by rules */
export const Strip = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(0, 1fr));
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  @media (max-width: 560px) { grid-template-columns: minmax(0, 1fr); }
`;

export const Cell = styled.label`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px 16px 16px;
  box-shadow: -1px 0 0 var(--border-card), 0 -1px 0 var(--border-card); /* rules between cells */
  cursor: text;
  &:focus-within { box-shadow: inset 0 0 0 1px var(--color-accent); }
`;

export const CellHead = styled.span`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

export const CellValue = styled.span`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
`;

/* A stat's number: large and light */
export const CellInput = styled.input<{ $ai?: boolean }>`
  && {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 300;
    font-style: ${({ $ai }) => ($ai ? 'italic' : 'normal')};
    line-height: 1.1;
    color: var(--text-secondary);
    -moz-appearance: textfield;
    appearance: textfield;
  }
  &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  &::placeholder { color: var(--text-hint); }
`;

export const Unit = styled.span`
  flex: none;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

/* A small outlined pill that flips a unit (mi ⇄ km) */
export const UnitPill = styled.button`
  flex: none;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-soft);
  cursor: pointer;
  &:hover { border-color: var(--control-border); color: var(--text-primary); }
`;

/* Quiet accent text action inside a label row ("Estimate") */
export const TextAction = styled.button`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent-link);
  cursor: pointer;
  &:hover:not(:disabled) { text-decoration: underline; }
  &:disabled { opacity: 0.6; cursor: wait; }
`;

/* One outlined box holding date | time */
export const DateTimeBox = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  border: 1px solid var(--border-card);
  border-radius: 10px;
  overflow: hidden;
  & > * + * { border-left: 1px solid var(--border-card); }
`;

export const DateTimeField = styled.input`
  && {
    width: 100%;
    min-width: 0;
    height: 50px;
    padding: 0 16px;
    border: none !important;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
    color-scheme: light dark;
  }
  &&:focus { box-shadow: inset 0 0 0 1px var(--color-accent); }
  &::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; }
`;

/* Outlined single-line box */
export const BoxInput = styled.input`
  && {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border: 1px solid var(--border-card) !important;
    border-radius: 10px;
    background: transparent !important;
    outline: none;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-secondary);
  }
  &&:focus { border-color: var(--color-accent) !important; }
  /* Beats GlobalStyle's input:not(…×4) { border: none !important } — that
     selector outranks two classes, so the outline needs five */
  &&&&& { border: 1px solid var(--border-card) !important; }
  &&&&&:focus { border-color: var(--color-accent) !important; }
  &::placeholder { color: var(--text-hint); }
`;

/* Outlined multi-line box */
export const BoxText = styled.textarea`
  && {
    width: 100%;
    min-height: 112px;
    padding: 14px 16px;
    border: 1px solid var(--border-card) !important;
    border-radius: 10px;
    background: transparent !important;
    outline: none;
    resize: vertical;
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  &&:focus { border-color: var(--color-accent) !important; }
  &::placeholder { color: var(--text-hint); }
`;

export const FieldNote = styled.p<{ $error?: boolean }>`
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-muted)')};
  em { font-style: italic; }
`;
