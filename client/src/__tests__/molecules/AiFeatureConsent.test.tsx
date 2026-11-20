import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { AiFeatureConsent } from '@/components/molecules/AiFeatureConsent';
import { AI_SHARING_CHECKS, AI_SHARING_CONSENT } from '@/utils/chatDisclosure';

describe('AiFeatureConsent', () => {
  it('shows the whole sharing statement and where the data goes', () => {
    renderWithTheme(<AiFeatureConsent feature="aiPlan" provider="Claude (Anthropic API)" onAgree={vi.fn()} onCancel={vi.fn()} />);
    for (const line of AI_SHARING_CONSENT) expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByText(/straight to Claude \(Anthropic API\)/)).toBeInTheDocument();
    expect(screen.getByText(/goals and milestones with their notes, your visions/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing else about an event or meeting is/)).toBeInTheDocument();
  });

  it('starts with nothing ticked, and Turn on needs both boxes', () => {
    const onAgree = vi.fn();
    renderWithTheme(<AiFeatureConsent feature="aiInsights" provider="OpenAI" onAgree={onAgree} onCancel={vi.fn()} />);
    const boxes = AI_SHARING_CHECKS.map(label => screen.getByLabelText(label) as HTMLInputElement);
    expect(boxes.every(b => !b.checked)).toBe(true);
    const turnOn = screen.getByRole('button', { name: 'Turn on' });
    expect(turnOn).toBeDisabled();
    fireEvent.click(boxes[0]);
    expect(turnOn).toBeDisabled();
    fireEvent.click(boxes[1]);
    expect(turnOn).toBeEnabled();
    fireEvent.click(turnOn);
    expect(onAgree).toHaveBeenCalledTimes(1);
  });

  it('Not now agrees to nothing', () => {
    const onAgree = vi.fn(); const onCancel = vi.fn();
    renderWithTheme(<AiFeatureConsent feature="aiPlan" provider="OpenAI" onAgree={onAgree} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onAgree).not.toHaveBeenCalled();
  });
});
