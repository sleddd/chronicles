import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { api, encryption } = vi.hoisted(() => ({
  api: {
    list: vi.fn(),
    put: vi.fn(),
    remove: vi.fn(),
  },
  encryption: {
    isUnlocked: true,
    encryptRecord: vi.fn(async (kind: string, id: string, record: unknown) => ({ payload: btoa(JSON.stringify({ kind, id, record })), iv: 'iv' })),
    decryptRecord: vi.fn(async (kind: string, id: string, payload: string) => {
      const parsed = JSON.parse(atob(payload));
      if (parsed.kind !== kind || parsed.id !== id) throw new Error('aad mismatch');
      return parsed.record;
    }),
  },
}));

vi.mock('@/services/api', () => ({ finance: api }));
vi.mock('@/contexts/EncryptionContext', () => ({ useEncryption: () => encryption }));

import { useFinance } from '@/hooks/useFinance';
import { useFinanceStore, clearFinanceCache } from '@/stores/financeStore';

const ID = '3f1c2a64-8d1e-4f5a-9b2c-0d1e2f3a4b5c';
const wire = (kind: string, id: string, record: unknown) => ({
  id, payload: btoa(JSON.stringify({ kind, id, record })), iv: 'iv', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
});

describe('useFinance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFinanceCache();
    encryption.isUnlocked = true;
  });

  it('loads and decrypts records on first use, skipping unreadable rows', async () => {
    api.list.mockResolvedValue({ records: [
      wire('bills', ID, { name: 'Rent', amountCents: 1000 }),
      wire('goals', '00000000-0000-4000-8000-000000000000', { name: 'Moved here' }), // wrong kind → refused
    ] });
    const { result } = renderHook(() => useFinance('bills'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.list).toHaveBeenCalledWith('bills');
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0]).toMatchObject({ id: ID, name: 'Rent', amountCents: 1000 });
    expect(result.current.unreadable).toBe(1);
  });

  it('does not load while disabled or locked', async () => {
    renderHook(() => useFinance('bills', { enabled: false }));
    encryption.isUnlocked = false;
    renderHook(() => useFinance('goals'));
    await new Promise(r => setTimeout(r, 0));
    expect(api.list).not.toHaveBeenCalled();
  });

  it('saves optimistically and encrypts only the record (not the row fields)', async () => {
    api.list.mockResolvedValue({ records: [] });
    api.put.mockResolvedValue({ record: {} });
    const { result } = renderHook(() => useFinance('savings'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { await result.current.save({ name: 'Trip', entries: [] }); });
    expect(result.current.records).toHaveLength(1);
    const saved = result.current.records[0];
    expect(encryption.encryptRecord).toHaveBeenCalledWith('savings', saved.id, { name: 'Trip', entries: [] });
    expect(api.put).toHaveBeenCalledWith('savings', saved.id, expect.any(String), 'iv');
  });

  it('rolls back and reports when the server refuses a save', async () => {
    api.list.mockResolvedValue({ records: [wire('budget', ID, { name: 'Food', monthlyPlannedCents: 100, order: 0 })] });
    api.put.mockRejectedValue(new Error('Server down'));
    const { result } = renderHook(() => useFinance('budget'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      const r = await result.current.save({ ...result.current.records[0], monthlyPlannedCents: 999 });
      expect(r).toBeNull();
    });
    expect(result.current.records[0].monthlyPlannedCents).toBe(100);
    expect(useFinanceStore.getState().error).toContain('Server down');
  });

  it('wipes everything on lock', async () => {
    api.list.mockResolvedValue({ records: [wire('bills', ID, { name: 'Rent' })] });
    const { result } = renderHook(() => useFinance('bills'));
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    act(() => clearFinanceCache());
    expect(useFinanceStore.getState().records.bills).toEqual([]);
  });
});
