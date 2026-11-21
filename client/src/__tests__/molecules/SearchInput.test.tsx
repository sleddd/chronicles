import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { SearchInput } from '@/components/molecules/SearchInput';
import { renderWithTheme } from '../testUtils';

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with placeholder', () => {
    renderWithTheme(<SearchInput value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    renderWithTheme(<SearchInput value="" onChange={() => {}} placeholder="Find entries..." />);
    expect(screen.getByPlaceholderText('Find entries...')).toBeInTheDocument();
  });

  it('shows the input value', () => {
    renderWithTheme(<SearchInput value="test query" onChange={() => {}} />);
    expect(screen.getByDisplayValue('test query')).toBeInTheDocument();
  });

  it('calls onChange after debounce', () => {
    const onChange = vi.fn();
    renderWithTheme(<SearchInput value="" onChange={onChange} debounceMs={200} />);
    const input = screen.getByPlaceholderText('Search...');

    fireEvent.change(input, { target: { value: 'hello' } });
    expect(onChange).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('shows clear button when there is text', () => {
    renderWithTheme(<SearchInput value="something" onChange={() => {}} />);
    // Clear button has an SVG icon (faXmark)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show clear button when input is empty', () => {
    renderWithTheme(<SearchInput value="" onChange={() => {}} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('clears the input and calls onChange immediately when clear is clicked', () => {
    const onChange = vi.fn();
    renderWithTheme(<SearchInput value="text" onChange={onChange} />);
    const clearBtn = screen.getByRole('button');
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('SearchInput ariaLabel', () => {
  it('defaults to Search entries and takes another name', () => {
    const { unmount } = renderWithTheme(<SearchInput value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Search entries' })).toBeInTheDocument();
    unmount();
    renderWithTheme(<SearchInput value="" onChange={() => {}} ariaLabel="Search topics" />);
    expect(screen.getByRole('textbox', { name: 'Search topics' })).toBeInTheDocument();
  });
});
