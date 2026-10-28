import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { OnboardingTour } from '@/components/organisms/OnboardingTour';
import { GettingStarted } from '@/components/organisms/GettingStarted';

describe('OnboardingTour', () => {
  const setup = () => {
    const props = { onClose: vi.fn(), onTheme: vi.fn(), onFeature: vi.fn(), isOn: (f: string) => f !== 'financeEnabled', themePreference: 'light' as const };
    renderWithTheme(<OnboardingTour {...props} />);
    return props;
  };

  it('walks through six steps, then Get started closes it', () => {
    const p = setup();
    expect(screen.getByRole('heading', { name: 'Welcome to Chronicles' })).toBeInTheDocument();
    for (const title of ['Your dashboard is your day at a glance', 'Your health in one place', 'Everything has a place', 'Shortcuts worth knowing', 'Make it yours']) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Shortcuts worth knowing' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(p.onClose).toHaveBeenCalled();
  });

  it('sets the theme and features from the last step', () => {
    const p = setup();
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(p.onTheme).toHaveBeenCalledWith('dark');
    fireEvent.click(screen.getByLabelText('Goals and planning'));
    expect(p.onFeature).toHaveBeenCalledWith(['goalsEnabled', 'milestonesEnabled'], false);
    fireEvent.click(screen.getByLabelText('Finance'));
    expect(p.onFeature).toHaveBeenCalledWith(['financeEnabled'], true);
  });

  it('Skip and Escape close it', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });
});

describe('GettingStarted', () => {
  it('lists what\'s left with its action, and closes', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const onToggle = vi.fn();
    renderWithTheme(<GettingStarted onAction={onAction} onToggle={onToggle} onDismiss={onDismiss} items={[
      { key: 'name', label: 'Add your name', how: 'Settings → Account.', done: true },
      { key: 'entry', label: 'Write your first entry', how: 'Pick a topic in Quick entry, write your entry, then press Save entry.', done: false },
      { key: 'recovery', label: 'Keep your recovery key somewhere safe', how: 'Lost it?', done: false },
    ]} />);
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
    expect(screen.getByText(/Pick a topic in Quick entry/)).toBeInTheDocument();
    expect(screen.queryByText('Settings → Account.')).not.toBeInTheDocument(); // a done item's how-to goes
    expect(screen.getAllByRole('button', { name: 'Show me' })).toHaveLength(1); // done items have no action
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(onAction).toHaveBeenCalledWith('entry');
    fireEvent.click(screen.getByRole('button', { name: 'Mark “Write your first entry” done' }));
    expect(onToggle).toHaveBeenCalledWith('entry');
    fireEvent.click(screen.getByRole('button', { name: 'I’ve saved it' }));
    expect(onAction).toHaveBeenCalledWith('recovery');
    fireEvent.click(screen.getByRole('button', { name: 'Close getting started' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('says "You’re all set" once everything is ticked', () => {
    renderWithTheme(<GettingStarted onAction={() => {}} onToggle={() => {}} onDismiss={() => {}} items={[
      { key: 'name', label: 'Add your name', how: '', done: true },
      { key: 'recovery', label: 'Keep your recovery key somewhere safe', how: '', done: true },
    ]} />);
    expect(screen.getByText(/You’re all set/)).toBeInTheDocument();
  });
});

