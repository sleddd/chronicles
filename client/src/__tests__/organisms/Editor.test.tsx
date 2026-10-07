import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '@shared/theme/tokens';
import { Editor } from '@/components/organisms/Editor';

// Mock TipTap
vi.mock('@tiptap/react', () => ({
  useEditor: () => ({
    getHTML: () => '<p>test</p>',
    isActive: () => false,
    chain: () => ({ focus: () => ({ toggleBold: () => ({ run: vi.fn() }), toggleItalic: () => ({ run: vi.fn() }), toggleStrike: () => ({ run: vi.fn() }), toggleCode: () => ({ run: vi.fn() }), toggleBulletList: () => ({ run: vi.fn() }), toggleOrderedList: () => ({ run: vi.fn() }), toggleBlockquote: () => ({ run: vi.fn() }), toggleCodeBlock: () => ({ run: vi.fn() }), setHorizontalRule: () => ({ run: vi.fn() }), undo: () => ({ run: vi.fn() }), redo: () => ({ run: vi.fn() }) }) }),
    can: () => ({ undo: () => true, redo: () => true }),
    commands: { setContent: vi.fn() },
  }),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">Editor Content</div>
  ),
  // Used by the inline drawing node extension
  NodeViewWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ReactNodeViewRenderer: () => () => null,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: () => ({}) },
}));
vi.mock('@tiptap/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiptap/core')>()),
  Extension: { create: () => ({}) },
}));
vi.mock('@tiptap/pm/state', () => ({
  Plugin: vi.fn(),
  PluginKey: vi.fn(),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Editor', () => {
  it('renders editor content area', () => {
    renderWithTheme(<Editor content="" onChange={vi.fn()} />);
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('renders toolbar toggle when not read-only', () => {
    renderWithTheme(<Editor content="" onChange={vi.fn()} />);
    // Toolbar toggle button exists (the pen icon toggle)
    const toggles = screen.getAllByRole('button');
    expect(toggles.length).toBeGreaterThan(0);
  });

  it('does not render toolbar when read-only', () => {
    renderWithTheme(<Editor content="" onChange={vi.fn()} readOnly={true} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
