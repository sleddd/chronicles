import styled, { css } from 'styled-components';
import type { ReactNode } from 'react';
import { Icon } from '../atoms/core/Icon.jsx';

/* The Settings redesign (mockup 1, Account): a section is a thin title with a
   muted line under it, then small groups — a tracked-caps label over one
   outlined panel of label-left rows split by hairlines. Props only. */

const Head = styled.header`
  margin: 8px 0 40px;
`;

const HeadTitle = styled.h2`
  margin: 0;
  font-family: var(--font-display);
  font-size: 44px;
  font-weight: 200;
  line-height: 1.1;
  color: var(--text-primary);
  @media (max-width: 560px) { font-size: 36px; }
`;

const HeadNote = styled.p`
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
`;

export function SettingsSectionHead({ title, note, id }: { title: string; note?: string; id?: string }) {
  return (
    <Head>
      <HeadTitle id={id}>{title}</HeadTitle>
      {note && <HeadNote>{note}</HeadNote>}
    </Head>
  );
}

const GroupWrap = styled.section`
  & + & { margin-top: 36px; }
`;

const GroupLabel = styled.h3`
  margin: 0 0 14px 4px;
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
`;

/* Fields inside a group: a box a shade darker than the panel, a hairline
   outline, accent outline on focus. !important beats GlobalStyle's flat-input
   rule; an in-place input (data-underline) keeps its own look. */
const fieldInputs = css`
  & input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([data-underline]),
  & select,
  & textarea {
    width: 100%;
    min-height: 44px;
    padding-left: 14px;
    padding-right: 14px;
    background-color: var(--bg-app) !important;
    border: 1px solid var(--border-card) !important;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--text-primary);
    outline: none !important;
    box-shadow: none !important;
    transition: border-color 120ms;
  }
  & textarea { padding-top: 11px; padding-bottom: 11px; line-height: 1.5; resize: vertical; }
  & select { padding-right: 36px; }
  & input:not([data-underline]):hover, & select:hover, & textarea:hover { border-color: var(--control-border) !important; }
  & input:not([data-underline]):focus, & select:focus, & textarea:focus { border-color: var(--color-accent-line) !important; }
  & input::placeholder, & textarea::placeholder { color: var(--text-placeholder); }
`;

const Panel = styled.div`
  background: var(--bg-panel);
  border: 1px solid var(--border-card);
  border-radius: 12px;
  overflow: hidden;
  & > * + * { border-top: 1px solid var(--border-subtle); }
  ${fieldInputs}
`;

/** A tracked-caps label (optional) over one outlined panel of rows */
export function SettingsGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <GroupWrap aria-label={label}>
      {label && <GroupLabel>{label}</GroupLabel>}
      <Panel>{children}</Panel>
    </GroupWrap>
  );
}


const RowGrid = styled.div<{ $top?: boolean }>`
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) auto;
  align-items: ${({ $top }) => ($top ? 'start' : 'center')};
  column-gap: 16px;
  min-height: 60px;
  padding: 12px 20px;
  @media (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 6px;
  }
`;

const RowLabel = styled.div<{ $top?: boolean }>`
  padding-top: ${({ $top }) => ($top ? '11px' : '0')};
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-secondary);
  @media (max-width: 560px) { grid-column: 1 / -1; font-size: 13px; color: var(--text-muted); }
`;

const RowValue = styled.div`
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-primary);
  overflow-wrap: anywhere;
`;

/** One label-left row: label | value | an optional action on the right */
export function SettingsGroupRow({ label, children, action, labelId, alignTop }: {
  label: string; children?: ReactNode; action?: ReactNode; labelId?: string;
  /** Label level with the top of a tall field (a text box) instead of its middle */
  alignTop?: boolean;
}) {
  return (
    <RowGrid $top={alignTop}>
      <RowLabel id={labelId} $top={alignTop}>{label}</RowLabel>
      <RowValue>{children}</RowValue>
      {action ?? <span />}
    </RowGrid>
  );
}

const LinkRowA = styled.a`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 60px;
  padding: 12px 20px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-primary);
  text-decoration: none;
  svg { flex: none; color: var(--text-muted); }
  &:hover svg { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

/** A whole row that opens a page (the policy links), chevron on the right */
export function SettingsLinkRow({ href, children, newTab }: { href: string; children: ReactNode; newTab?: boolean }) {
  return (
    <LinkRowA href={href} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
      <Icon name="chevron-right" size={18} />
    </LinkRowA>
  );
}

/** A full-width row for a form that opens inside a group (Change email…) */
export const SettingsGroupBody = styled.div`
  padding: 16px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  ${fieldInputs}
`;

/** The settings rows' sentence-case outlined pill (Change, Show again) */
export const RowPill = styled.button<{ $tone?: 'neutral' | 'danger' | 'accent' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  height: 36px;
  padding: 0 16px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  color: ${({ $tone }) => ($tone === 'danger' ? 'var(--color-danger)' : $tone === 'accent' ? 'var(--color-accent-line)' : 'var(--text-primary)')};
  background: transparent;
  border: 1px solid ${({ $tone }) => ($tone === 'danger' ? 'color-mix(in srgb, var(--color-danger) 60%, transparent)' : $tone === 'accent' ? 'var(--color-accent-line)' : 'var(--border-pill, var(--border-strong))')};
  border-radius: var(--r-full, 999px);
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
  &:hover:not(:disabled) {
    background: ${({ $tone }) => ($tone === 'danger' ? 'var(--color-danger-subtle)' : $tone === 'accent' ? 'var(--color-accent-subtle)' : 'var(--bg-hover)')};
  }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/** Two (or more) choices in one rounded track; the chosen one an accent outline (no fill) */
export const PillChoice = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-card);
  border-radius: 999px;
  background: var(--bg-app);
`;

export const PillChoiceBtn = styled.button<{ $active: boolean }>`
  height: 32px;
  padding: 0 16px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent-line)' : 'transparent')};
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-secondary)')};
  background: transparent;
  cursor: pointer;
  &:hover { color: ${({ $active }) => ($active ? 'var(--color-accent-soft)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/** A muted line under a row's value ("Sent to your account email.") */
export const RowNote = styled.div<{ $error?: boolean }>`
  margin-top: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-muted)')};
`;

/** An input that reads as plain text until focused (Display name) */
export const InPlaceInput = styled.input.attrs({ 'data-underline': '' } as Record<string, string>)`
  && {
    width: 100%;
    height: 36px;
    margin: 0 0 0 -8px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--text-primary);
  }
  &&:hover { border-color: var(--border-card); }
  &&:focus { outline: none; border-color: var(--color-accent-line); }
  &&::placeholder { color: var(--text-placeholder); }
`;

/** The section's foot: a hairline, then a note beside a (danger) action */
export const SettingsFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 40px;
  padding: 28px 4px 0;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  color: var(--text-muted);
  @media (max-width: 560px) { flex-direction: column; align-items: flex-start; }
`;

/** Cancel / Save under an open form */
export const FormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
`;

/* ── Rows for the Security / Entry images / In-App AI sections (mockup 2) ── */

const ActionWrap = styled.div``;

const ActionMain = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 60px;
  padding: 14px 20px;
`;

const ActionText = styled.div`
  flex: 1;
  min-width: 0;
`;

const ActionTitle = styled.div`
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-primary);
`;

const ActionDesc = styled.div<{ $error?: boolean }>`
  margin-top: 3px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: ${({ $error }) => ($error ? 'var(--color-danger)' : 'var(--text-muted)')};
`;

const ActionExtra = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 20px 18px;
`;

/** A titled row: title over a muted line on the left, an action on the right,
 *  and anything that opens under it (a form, a list) inside the same row */
export function SettingsActionRow({ title, description, descriptionError, action, children }: {
  title: ReactNode; description?: ReactNode; descriptionError?: boolean; action?: ReactNode; children?: ReactNode;
}) {
  return (
    <ActionWrap>
      <ActionMain>
        <ActionText>
          <ActionTitle>{title}</ActionTitle>
          {description && <ActionDesc $error={descriptionError}>{description}</ActionDesc>}
        </ActionText>
        {action}
      </ActionMain>
      {children && <ActionExtra>{children}</ActionExtra>}
    </ActionWrap>
  );
}

const DisclosureBtn = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 60px;
  padding: 14px 20px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  svg { flex: none; color: var(--text-muted); transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')}); transition: transform 150ms; }
  &:hover svg { color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
`;

/** A titled row whose chevron opens more under it (Setup guide) */
export function SettingsDisclosureRow({ title, description, open, onToggle, children }: {
  title: ReactNode; description?: ReactNode; open: boolean; onToggle: () => void; children?: ReactNode;
}) {
  return (
    <ActionWrap>
      <DisclosureBtn type="button" $open={open} aria-expanded={open} onClick={onToggle}>
        <ActionText>
          <ActionTitle>{title}</ActionTitle>
          {description && <ActionDesc>{description}</ActionDesc>}
        </ActionText>
        <Icon name="chevron-right" size={18} />
      </DisclosureBtn>
      {open && children && <ActionExtra>{children}</ActionExtra>}
    </ActionWrap>
  );
}

const NoticeBox = styled.div`
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: color-mix(in srgb, var(--color-accent) 7%, var(--bg-panel));
  font-family: var(--font-sans);
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--text-secondary);
`;

const NoticeIcon = styled.span`
  flex: none;
  margin-top: 1px;
  font-family: 'Material Symbols Outlined';
  font-size: 18px;
  font-weight: 300;
  line-height: 1;
  font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
  color: var(--color-accent-soft, var(--color-accent));
`;

/** The faint accent band that opens a group (where the data goes) */
export function SettingsNotice({ children }: { children: ReactNode }) {
  return (
    <NoticeBox>
      <NoticeIcon aria-hidden="true">lock</NoticeIcon>
      <div>{children}</div>
    </NoticeBox>
  );
}

const StatusRowBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

/** A group's last line: a save status on the left, a quiet link on the right */
export function SettingsStatusRow({ status, action }: { status: ReactNode; action?: ReactNode }) {
  return (
    <StatusRowBox>
      <span role="status">{status}</span>
      {action}
    </StatusRowBox>
  );
}

const OkText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-accent-soft, var(--color-accent));
`;

/** "✓ Saved" / "✓ On, using an authenticator app" */
export function StatusOk({ children }: { children: ReactNode }) {
  return <OkText><Icon name="check" size={14} />{children}</OkText>;
}

/** A quiet underlined text button ("Forget credentials") */
export const QuietLink = styled.button<{ $danger?: boolean }>`
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--text-secondary)')};
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { color: ${({ $danger }) => ($danger ? 'var(--color-danger)' : 'var(--text-primary)')}; }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/** A note under a field with something on its right (a character count) */
export const FieldFoot = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;
