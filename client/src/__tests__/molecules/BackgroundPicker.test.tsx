import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { BackgroundPicker } from '@/components/molecules/BackgroundPicker';
import { renderWithTheme } from '../testUtils';
import { BACKGROUND_IMAGES } from '@shared/theme/backgrounds';

describe('BackgroundPicker', () => {
  it('renders all background option labels', () => {
    renderWithTheme(<BackgroundPicker selected="" onImageChange={() => {}} />);
    // Check a specific non-"None" label to confirm rendering
    const nonNoneLabels = BACKGROUND_IMAGES.filter(bg => bg.label !== 'None' && !bg.hidden);
    nonNoneLabels.forEach(bg => {
      expect(screen.getByText(bg.label)).toBeInTheDocument();
    });
  });

  it('does not offer retired (hidden) backgrounds', () => {
    renderWithTheme(<BackgroundPicker selected="" onImageChange={() => {}} />);
    BACKGROUND_IMAGES.filter(bg => bg.hidden).forEach(bg => {
      expect(screen.queryByText(bg.label)).not.toBeInTheDocument();
    });
  });

  it('renders "None" option (label and thumbnail placeholder)', () => {
    renderWithTheme(<BackgroundPicker selected="" onImageChange={() => {}} />);
    // "None" appears both as thumbnail placeholder and label text
    const noneElements = screen.getAllByText('None');
    expect(noneElements.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onImageChange when a background thumbnail is clicked', () => {
    const onImageChange = vi.fn();
    renderWithTheme(<BackgroundPicker selected="" onImageChange={onImageChange} />);
    // Click on one of the image thumbnails
    const images = screen.getAllByRole('img');
    fireEvent.click(images[0]);
    expect(onImageChange).toHaveBeenCalled();
  });

  it('renders thumbnail images for backgrounds that have thumbs', () => {
    renderWithTheme(<BackgroundPicker selected="" onImageChange={() => {}} />);
    const images = screen.getAllByRole('img');
    const bgWithThumbs = BACKGROUND_IMAGES.filter(bg => bg.thumb && !bg.hidden);
    expect(images).toHaveLength(bgWithThumbs.length);
  });
});
