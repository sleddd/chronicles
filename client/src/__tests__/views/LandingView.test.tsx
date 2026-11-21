import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { LandingView } from '@/views/LandingView';
import { renderWithRouter } from '../testUtils';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false })),
}));

const apply = vi.fn();
vi.mock('@/services/api', () => ({
  beta: {
    apply: (...a: unknown[]) => apply(...a),
  },
}));

const renderPage = async () => { renderWithRouter(<LandingView />); };

describe('LandingView', () => {
  beforeEach(() => {
    apply.mockReset().mockResolvedValue({ status: 'seat' });
  });

  it('shows the headline and sign in, and never a seat count', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A planner that knows the rest of your life.');
    expect(screen.getByRole('link', { name: 'Join the beta' })).toHaveAttribute('href', '#beta');
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/seats open|of 30/)).not.toBeInTheDocument();
  });

  it('needs both boxes before applying, then shows the seat', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    const submit = screen.getByRole('button', { name: 'Request a beta seat' });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tick both boxes');
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('I’m 18 or older'));
    fireEvent.click(screen.getByLabelText(/I understand Chronicles is still in development/));
    fireEvent.click(submit);
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ name: 'Sam', email: 'sam@example.com' }));
    expect(await screen.findByText('Thank you for requesting early access to Chronicles.')).toBeInTheDocument();
  });

  it('has one sign-up form and no separate waitlist form', async () => {
    await renderPage();
    expect(screen.getAllByLabelText('Email')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Join the waitlist' })).not.toBeInTheDocument();
    // Just name and email: no "what would you track first" or device questions
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('finds every screenshot it lists (the narrowed globs) and keeps closed answers out of the landmarks', async () => {
    await renderPage();
    // Each row's carousel names its slides; a missing file would drop one
    expect(screen.getByRole('group', { name: /^The meals log .* \(dark mode\) and The health dashboard .* \(dark mode\) and Exercise history/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /A public shelf as visitors see it, with the shared covers and ratings and The Following view/ })).toBeInTheDocument();
    // The hero's first and last slides
    expect(document.querySelectorAll('img[alt^="Dashboard: "], img[alt^="Settings: "]')).toHaveLength(2);
    expect(screen.getAllByRole('region').filter(r => r.id.startsWith('faq-'))).toHaveLength(0);
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }));
  });

  it('thanks a late applicant the same way, without saying the beta is full', async () => {
    apply.mockResolvedValue({ status: 'waitlist' });
    await renderPage();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    fireEvent.click(screen.getByLabelText('I’m 18 or older'));
    fireEvent.click(screen.getByLabelText(/I understand Chronicles is still in development/));
    fireEvent.click(screen.getByRole('button', { name: 'Request a beta seat' }));
    expect(await screen.findByText('Thank you for requesting early access to Chronicles.')).toBeInTheDocument();
    expect(screen.queryByText(/waitlist/i)).toBeNull();
  });
});
