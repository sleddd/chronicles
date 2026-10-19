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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A journal for people too busy to journal.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/seats open|of 30/)).not.toBeInTheDocument();
  });

  it('needs both boxes before applying, then shows the seat', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    const submit = screen.getByRole('button', { name: 'Sign Up For Beta' });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tick both boxes');
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('I’m 18 or older'));
    fireEvent.click(screen.getByLabelText(/I understand Chronicles is still in development/));
    fireEvent.click(submit);
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ name: 'Sam', email: 'sam@example.com', trackFirst: 'journal', device: 'ios' }));
    expect(await screen.findByText('You have a beta seat')).toBeInTheDocument();
  });

  it('has one sign-up form and no separate waitlist form', async () => {
    await renderPage();
    expect(screen.getAllByLabelText('Email')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Join the waitlist' })).not.toBeInTheDocument();
  });

  it('tells a late applicant they are on the waitlist', async () => {
    apply.mockResolvedValue({ status: 'waitlist' });
    await renderPage();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    fireEvent.click(screen.getByLabelText('I’m 18 or older'));
    fireEvent.click(screen.getByLabelText(/I understand Chronicles is still in development/));
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up For Beta' }));
    expect(await screen.findByText('You’re on the waitlist')).toBeInTheDocument();
  });
});
