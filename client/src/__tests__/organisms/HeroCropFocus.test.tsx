import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntryHeroBanner, focusPosition } from '@/components/organisms/EntryImageGallery';
import type { EntryImage } from '@/services/imageStorage';

vi.mock('@/hooks/useDecryptedImage', () => ({
  useDecryptedImage: () => ({ url: 'blob:photo', loading: false, error: null }),
}));

const photo = (extra: Partial<EntryImage> = {}): EntryImage =>
  ({ key: 'img/a', iv: 'iv', mimeType: 'image/jpeg', width: 2000, height: 1000, ...extra } as EntryImage);

const imgEl = (container: HTMLElement) => container.querySelector('img') as HTMLImageElement;

describe('featured photo crop focus', () => {
  it('centres by default and uses a saved focus point', () => {
    expect(focusPosition({})).toBe('50% 50%');
    const { container } = render(<EntryHeroBanner image={photo({ focusX: 10, focusY: 90 })} />);
    expect(imgEl(container).style.objectPosition).toBe('10% 90%');
  });

  it('offers no adjusting without a save handler', () => {
    render(<EntryHeroBanner image={photo()} />);
    expect(screen.queryByRole('button', { name: 'Adjust crop' })).toBeNull();
  });

  it('arrow keys move the focus and Center resets it', () => {
    const onFocusChange = vi.fn();
    const { container } = render(<EntryHeroBanner image={photo()} onFocusChange={onFocusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust crop' }));
    const banner = screen.getByLabelText(/Featured photo crop/);
    fireEvent.keyDown(banner, { key: 'ArrowLeft' });
    fireEvent.keyDown(banner, { key: 'ArrowDown', shiftKey: true });
    expect(onFocusChange).toHaveBeenLastCalledWith(45, 51);
    expect(imgEl(container).style.objectPosition).toBe('45% 51%');
    fireEvent.click(screen.getByRole('button', { name: 'Center' }));
    expect(onFocusChange).toHaveBeenLastCalledWith(50, 50);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Adjust crop' })).toBeTruthy();
  });

  it('dragging the photo right and up brings its lower left into view', () => {
    const onFocusChange = vi.fn();
    render(<EntryHeroBanner image={photo()} onFocusChange={onFocusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust crop' }));
    const banner = screen.getByLabelText(/Featured photo crop/);
    // 800×200 banner, 2000×1000 photo → scaled to 800×400: no sideways overhang, 200px down
    banner.getBoundingClientRect = () => ({ width: 800, height: 200, top: 0, left: 0, right: 800, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    banner.setPointerCapture = () => {};
    // jsdom has no PointerEvent, so send mouse events under the pointer names (they carry clientX/Y)
    const send = (type: string, x: number, y: number) =>
      fireEvent(banner, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    send('pointerdown', 400, 100);
    send('pointermove', 500, 0);
    send('pointerup', 500, 0);
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(onFocusChange).toHaveBeenCalledWith(50, 100);
  });
});
