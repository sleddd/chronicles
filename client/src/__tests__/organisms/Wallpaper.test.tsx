import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithTheme } from '../testUtils';
import { Wallpaper } from '@/components/organisms/Wallpaper';
import { WallpaperPicker } from '@/components/molecules/WallpaperPicker';
import { useUIStore } from '@/stores/uiStore';

// The person's own photo is opened from their bucket: here, a fixed address once asked for
const opened = vi.hoisted(() => ({ error: null as string | null }));
vi.mock('@/hooks/useDecryptedImage', () => ({
  useDecryptedImage: (key: string | null) => ({ url: key && !opened.error ? `blob:${key}` : null, loading: false, error: key ? opened.error : null }),
}));

const OWN = { key: 'img/11111111-2222-3333-4444-555555555555', iv: 'aXY=', thumbKey: 'img/11111111-2222-3333-4444-555555555555-t', thumbIv: 'dGl2', mimeType: 'image/jpeg', size: 1 };

afterEach(() => {
  opened.error = null;
  act(() => {
    useUIStore.getState().setWallpaper(null);
    useUIStore.getState().setCustomWallpaper(null);
    useUIStore.setState({ imagesEnabled: false, imagesConfigured: false });
  });
});

describe('Wallpaper', () => {
  it('shows the person’s own photo while Entry Images is on and set up', () => {
    act(() => {
      useUIStore.setState({ imagesEnabled: true, imagesConfigured: true });
      useUIStore.getState().setCustomWallpaper(OWN);
      useUIStore.getState().setWallpaper('custom');
    });
    renderWithTheme(<MemoryRouter><Wallpaper /></MemoryRouter>);
    expect(document.documentElement.getAttribute('data-wallpaper')).toBe('custom');
  });

  it('falls back to the theme’s default photo when the person’s own can’t be opened', () => {
    opened.error = 'gone';
    act(() => {
      useUIStore.setState({ imagesEnabled: true, imagesConfigured: true });
      useUIStore.getState().setCustomWallpaper(OWN);
      useUIStore.getState().setWallpaper('custom');
    });
    renderWithTheme(<MemoryRouter><Wallpaper /></MemoryRouter>);
    expect(document.documentElement.getAttribute('data-wallpaper')).toBe('own-2');
  });

  it('shows nothing, rather than another photo, while the person’s own is still on its way', () => {
    act(() => {
      useUIStore.setState({ wallpaperSynced: false, customWallpaper: null });
      useUIStore.getState().setWallpaper('custom');
    });
    const { container } = renderWithTheme(<MemoryRouter><Wallpaper /></MemoryRouter>);
    expect(container.firstChild).toBeNull();
  });

  it('draws nothing and leaves the page plain with None chosen', () => {
    act(() => useUIStore.getState().setWallpaper(null));
    const { container } = renderWithTheme(<MemoryRouter><Wallpaper /></MemoryRouter>);
    expect(container.firstChild).toBeNull();
    expect(document.documentElement.hasAttribute('data-wallpaper')).toBe(false);
  });

  it('marks the page while a photo shows, and clears it when taken away', () => {
    act(() => useUIStore.getState().setWallpaper('benjamin-voros-phIFdC6lA4E'));
    const { unmount } = renderWithTheme(<MemoryRouter><Wallpaper /></MemoryRouter>);
    expect(document.documentElement.getAttribute('data-wallpaper')).toBe('benjamin-voros-phIFdC6lA4E');
    unmount();
    expect(document.documentElement.hasAttribute('data-wallpaper')).toBe(false);
  });

  it('scrolls away with the page\'s own scrolling panel, not with a small box', () => {
    act(() => useUIStore.getState().setWallpaper('benjamin-voros-phIFdC6lA4E'));
    const { container } = renderWithTheme(
      <MemoryRouter><div data-testid="host"><Wallpaper /><div data-testid="panel"><div data-testid="table" /></div></div></MemoryRouter>,
    );
    const host = container.querySelector('[data-testid="host"]') as HTMLElement;
    const panel = container.querySelector('[data-testid="panel"]') as HTMLElement;
    const table = container.querySelector('[data-testid="table"]') as HTMLElement;
    const layer = host.querySelector('[aria-hidden="true"]') as HTMLElement;
    Object.defineProperty(host, 'clientHeight', { value: 1000 });
    Object.defineProperty(panel, 'clientHeight', { value: 1000 });
    Object.defineProperty(table, 'clientHeight', { value: 200 });
    panel.scrollTop = 120;
    act(() => { panel.dispatchEvent(new Event('scroll')); });
    expect(layer.style.transform).toBe('translateY(-120px)');
    table.scrollTop = 50;
    act(() => { table.dispatchEvent(new Event('scroll')); });
    expect(layer.style.transform).toBe('translateY(-120px)');
  });
});

describe('WallpaperPicker', () => {
  it('offers None first, credits every photo and picks one', () => {
    const onChange = vi.fn();
    renderWithTheme(<WallpaperPicker value={null} onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveTextContent('None');
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('Benjamin Voros')[0].closest('a')).toHaveAttribute('href', expect.stringContaining('unsplash.com/photos/phIFdC6lA4E'));
    fireEvent.click(screen.getByRole('radio', { name: 'Photo by Benjamin Voros' }));
    expect(onChange).toHaveBeenCalledWith('benjamin-voros-phIFdC6lA4E');
  });
});
