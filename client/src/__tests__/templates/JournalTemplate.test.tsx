import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { JournalTemplate, SidePanel, EditorPanel, MobileBackButton } from '@/components/templates/JournalTemplate';
import { renderWithTheme } from '../testUtils';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) =>
    selector({ backgroundImage: '' })
  ),
}));

describe('JournalTemplate', () => {
  it('renders sidePanel and editorPanel slots', () => {
    renderWithTheme(
      <JournalTemplate
        sidePanel={<div data-testid="side">Side panel</div>}
        editorPanel={<div data-testid="editor">Editor panel</div>}
      />
    );
    expect(screen.getByTestId('side')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  it('renders both panels side by side in a flex container', () => {
    const { container } = renderWithTheme(
      <JournalTemplate
        sidePanel={<div>Side</div>}
        editorPanel={<div>Editor</div>}
      />
    );
    const contentArea = container.firstChild as HTMLElement;
    const styles = window.getComputedStyle(contentArea);
    expect(styles.display).toBe('flex');
  });
});

describe('SidePanel', () => {
  it('renders children', () => {
    renderWithTheme(
      <SidePanel>
        <div data-testid="side-child">List items</div>
      </SidePanel>
    );
    expect(screen.getByTestId('side-child')).toBeInTheDocument();
  });

  it('accepts hiddenMobile prop without crashing', () => {
    renderWithTheme(
      <SidePanel hiddenMobile>
        <div data-testid="hidden-side">Content</div>
      </SidePanel>
    );
    expect(screen.getByTestId('hidden-side')).toBeInTheDocument();
  });
});

describe('EditorPanel', () => {
  it('renders children', () => {
    renderWithTheme(
      <EditorPanel>
        <div data-testid="editor-child">Editor content</div>
      </EditorPanel>
    );
    expect(screen.getByTestId('editor-child')).toBeInTheDocument();
  });

  it('accepts visibleMobile prop without crashing', () => {
    renderWithTheme(
      <EditorPanel visibleMobile>
        <div data-testid="visible-editor">Content</div>
      </EditorPanel>
    );
    expect(screen.getByTestId('visible-editor')).toBeInTheDocument();
  });
});

describe('MobileBackButton', () => {
  it('renders an Entries back label with an accessible name', () => {
    renderWithTheme(<MobileBackButton onClick={() => {}} />);
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByLabelText('Back to entries')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    renderWithTheme(<MobileBackButton onClick={handleClick} />);
    fireEvent.click(screen.getByText('Entries'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a button element', () => {
    renderWithTheme(<MobileBackButton onClick={() => {}} />);
    // Button has display:none on desktop; use hidden option to find it
    expect(screen.getByRole('button', { hidden: true })).toBeInTheDocument();
  });
});
