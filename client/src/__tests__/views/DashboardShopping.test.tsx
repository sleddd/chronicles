import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { useState } from 'react';
import { lightTheme } from '@shared/theme/tokens';

vi.mock('@/contexts/EncryptionContext', () => ({
  useEncryption: () => ({ encryptPost: vi.fn(), encryptNewPost: vi.fn() }),
}));

import { Shopping } from '@/views/DashboardView';
import { useEntriesStore } from '@/stores/entriesStore';

const list = (id: number, title: string, items: string[], day: string) => ({
  id, content: `<p>${title}</p>`, isEncrypted: true, createdAt: new Date(day), updatedAt: new Date(day),
  metadata: { _taxonomyId: 9, _customFields: { items: items.map((n, i) => ({ id: `${id}-${i}`, name: n, category: 'other', checked: false })), notes: '', linkedRecipeIds: [] } },
});

function Harness() {
  const [show, setShow] = useState('latest');
  return <Shopping show={show} onShow={setShow} />;
}

describe('dashboard Shopping list card', () => {
  it('shows the chosen list’s items when the picker changes', () => {
    useEntriesStore.setState({
      allTopics: [{ id: 9, name: 'Shopping List' }] as never,
      decryptedEntries: [list(1, 'Groceries', ['Milk', 'Eggs'], '2026-11-05'), list(2, 'Hardware', ['Nails'], '2026-11-01')] as never,
    });
    render(<ThemeProvider theme={lightTheme}><MemoryRouter><Harness /></MemoryRouter></ThemeProvider>);
    expect(screen.getByText('Milk')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Which shopping list'), { target: { value: '2' } });
    expect(screen.getByText('Nails')).toBeInTheDocument();
    expect(screen.queryByText('Milk')).not.toBeInTheDocument();
  });

  it('switches even when saving the choice is turned away', () => {
    render(<ThemeProvider theme={lightTheme}><MemoryRouter><Shopping show="latest" onShow={() => { /* refused */ }} /></MemoryRouter></ThemeProvider>);
    fireEvent.change(screen.getByLabelText('Which shopping list'), { target: { value: '2' } });
    expect(screen.getByText('Nails')).toBeInTheDocument();
    expect((screen.getByLabelText('Which shopping list') as HTMLSelectElement).value).toBe('2');
  });
});
