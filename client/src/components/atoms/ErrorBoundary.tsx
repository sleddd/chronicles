import { Component, type ErrorInfo, type ReactNode } from 'react';
import styled from 'styled-components';

/*
 * A render error anywhere used to take the whole app down to a blank page —
 * and since the cause is usually one entry holding something a view didn't
 * expect, every later load went blank too, with no way to reach Settings,
 * export or the entry itself. A boundary keeps the failure to the part that
 * failed:
 *
 * - `fallback="page"`: the page's place shows a short note with ways on
 *   (other pages, reload). It clears when `resetKey` changes (the address).
 * - `fallback="none"`: a floating extra (the bell, the chat, the timer) that
 *   fails simply isn't shown; the page under it carries on.
 *
 * Nothing about the error is shown or sent anywhere: its message can hold
 * decrypted text. It goes to the console only.
 */

const Wrap = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-app, #f4f5f7);
  color: var(--text-primary, #1f2128);
  font-family: var(--font-sans, 'Open Sans', sans-serif);
`;

const Panel = styled.div`
  width: 100%;
  max-width: 520px;
  padding: 32px;
  background: var(--bg-panel, #fbfbfc);
  border: 1px solid var(--border-subtle, #d3d7dd);
  border-radius: 14px;
`;

const Title = styled.h1`
  margin: 0 0 12px;
  font-family: var(--font-display, 'Work Sans', sans-serif);
  font-weight: 300;
  font-size: 28px;
  line-height: 1.2;
`;

const Text = styled.p`
  margin: 0 0 24px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-muted, #575d68);
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const Action = styled.a`
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--border-pill, var(--border-default, #80868f));
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary, #1f2128);
  font: inherit;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;

  &:hover, &:focus-visible {
    border-color: var(--color-accent-line, #23706e);
    color: var(--color-accent-soft, #23706e);
  }
`;

interface Props {
  children: ReactNode;
  fallback: 'page' | 'none';
  /** The fallback clears when this changes (pass the address) */
  resetKey?: string;
  /** Links offered on the page fallback, e.g. other pages that may still open */
  links?: { to: string; label: string }[];
}

interface State { failed: boolean; at?: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Another address: try again there
    if (state.at !== props.resetKey) return { at: props.resetKey, failed: false };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A part of the app failed to show:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback === 'none') return null;
    return (
      <Wrap role="alert">
        <Panel>
          <Title>This page couldn’t be shown</Title>
          <Text>
            Something on it didn’t load the way it should. Your journal is safe: nothing was changed or lost.
            Reload to try again, or open another page.
          </Text>
          <Actions>
            <Action as="button" type="button" onClick={() => window.location.reload()}>Reload</Action>
            {/* Plain links (a full load), so they work whatever state the app is in */}
            {(this.props.links ?? []).map(l => <Action key={l.to} href={l.to}>{l.label}</Action>)}
          </Actions>
        </Panel>
      </Wrap>
    );
  }
}
