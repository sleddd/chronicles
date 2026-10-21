import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';

/* A TipTap stand-in that keeps its own HTML, so the content sync can be
   followed: onUpdate = the person typing, setContent = the parent loading. */
const { fake } = vi.hoisted(() => {
  const fake = { html: '', editor: null as unknown, onUpdate: null as null | ((a: { editor: unknown }) => void), setContent: null as unknown as ReturnType<typeof import('vitest').vi.fn> };
  return { fake };
});
vi.mock('@tiptap/react', async () => {
  const { vi: v } = await import('vitest');
  fake.setContent = v.fn((html: string) => { fake.html = html; });
  const editor = {
    getHTML: () => fake.html,
    isActive: () => false,
    can: () => ({ undo: () => true, redo: () => true }),
    chain: () => new Proxy({}, { get: () => () => ({ run: v.fn() }) }),
    commands: { setContent: (h: string) => fake.setContent(h) },
  };
  return {
    useEditor: (opts: { content: string; onUpdate: (a: { editor: unknown }) => void }) => {
      fake.onUpdate = opts.onUpdate;
      fake.editor = editor;
      return editor;
    },
    EditorContent: () => <div data-testid="editor-content" />,
    NodeViewWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ReactNodeViewRenderer: () => () => null,
  };
});
vi.mock('@tiptap/starter-kit', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-placeholder', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiptap/core')>()),
  Extension: { create: () => ({}) },
}));
vi.mock('@tiptap/pm/state', () => ({ Plugin: vi.fn(), PluginKey: vi.fn() }));

import { Editor } from '@/components/organisms/Editor';

const view = (content: string) => <ThemeProvider theme={lightTheme}><Editor content={content} onChange={() => {}} /></ThemeProvider>;

describe('Editor content sync', () => {
  it('loads an entry again even when its text matches what was typed earlier', () => {
    const { rerender } = render(view(''));
    // type a new entry
    fake.html = '<p>Buy milk</p>';
    fake.onUpdate!({ editor: fake.editor });
    rerender(view('<p>Buy milk</p>'));
    // save clears the editor, then another entry is opened
    rerender(view(''));
    rerender(view('<p>Call the dentist</p>'));
    expect(fake.html).toBe('<p>Call the dentist</p>');
    // going back to the new entry must show it, not keep the other one
    rerender(view('<p>Buy milk</p>'));
    expect(fake.html).toBe('<p>Buy milk</p>');
  });

  it('does not reload what was just typed', () => {
    const { rerender } = render(view(''));
    fake.setContent.mockClear();
    fake.html = '<p>Hi</p>';
    fake.onUpdate!({ editor: fake.editor });
    rerender(view('<p>Hi</p>'));
    expect(fake.setContent).not.toHaveBeenCalled();
  });
});
