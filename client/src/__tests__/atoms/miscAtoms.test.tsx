import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import { lightTheme } from '@shared/theme/tokens';

// Styled-component atoms (no props interface, just styled.div exports)
import { ScrollList } from '@/components/atoms/ScrollList';
import { DateGroup, DateGroupLabel } from '@/components/atoms/DateGroupLabel';
import { LoadingCenter } from '@/components/atoms/LoadingCenter';
import { EmptyEditor } from '@/components/atoms/EmptyEditor';
import { SidePadding } from '@/components/atoms/SidePadding';
import { AuthForm } from '@/components/atoms/AuthForm';
import { ErrorBanner } from '@/components/atoms/ErrorBanner';
import { DragHandle } from '@/components/atoms/DragHandle';
import { DateTimeInput } from '@/components/atoms/DateTimeInput';
import {
  ActionButton,
  SignOutButton,
  SelectedColorLabel,
  BackLink,
} from '@/components/atoms/SettingsAtoms';

/** Helper to render with ThemeProvider + MemoryRouter (for Link-based components) */
function renderWithRouter(ui: React.ReactElement) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter>{ui}</MemoryRouter>
    </ThemeProvider>
  );
}

// --- ScrollList ---
describe('ScrollList', () => {
  it('renders without crashing', () => {
    const { container } = renderWithTheme(<ScrollList>Items</ScrollList>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders children', () => {
    renderWithTheme(<ScrollList><div>Item 1</div><div>Item 2</div></ScrollList>);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('accepts custom padding and gap props', () => {
    const { container } = renderWithTheme(
      <ScrollList $padding="8px" $gap="4px">Content</ScrollList>
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});

// --- DateGroup & DateGroupLabel ---
describe('DateGroup', () => {
  it('renders without crashing', () => {
    const { container } = renderWithTheme(<DateGroup>Group</DateGroup>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders children', () => {
    renderWithTheme(<DateGroup><span>Entry List</span></DateGroup>);
    expect(screen.getByText('Entry List')).toBeInTheDocument();
  });
});

describe('DateGroupLabel', () => {
  it('renders without crashing', () => {
    renderWithTheme(<DateGroupLabel>January 15, 2024</DateGroupLabel>);
    expect(screen.getByText('January 15, 2024')).toBeInTheDocument();
  });

  it('renders children text', () => {
    renderWithTheme(<DateGroupLabel>Today</DateGroupLabel>);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});

// --- LoadingCenter ---
describe('LoadingCenter', () => {
  it('renders without crashing', () => {
    const { container } = renderWithTheme(<LoadingCenter>Loading...</LoadingCenter>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders children', () => {
    renderWithTheme(<LoadingCenter><span>Spinner here</span></LoadingCenter>);
    expect(screen.getByText('Spinner here')).toBeInTheDocument();
  });
});

// --- EmptyEditor ---
describe('EmptyEditor', () => {
  it('renders without crashing', () => {
    renderWithTheme(<EmptyEditor>Select an entry to edit</EmptyEditor>);
    expect(screen.getByText('Select an entry to edit')).toBeInTheDocument();
  });

  it('renders children', () => {
    renderWithTheme(<EmptyEditor>No entry selected</EmptyEditor>);
    expect(screen.getByText('No entry selected')).toBeInTheDocument();
  });
});

// --- SidePadding ---
describe('SidePadding', () => {
  it('renders without crashing', () => {
    const { container } = renderWithTheme(<SidePadding>Padded content</SidePadding>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders children', () => {
    renderWithTheme(<SidePadding>Inside padding</SidePadding>);
    expect(screen.getByText('Inside padding')).toBeInTheDocument();
  });
});

// --- AuthForm ---
describe('AuthForm', () => {
  it('renders without crashing', () => {
    const { container } = renderWithTheme(<AuthForm>Form content</AuthForm>);
    expect(container.querySelector('form')).toBeInTheDocument();
  });

  it('renders as a form element', () => {
    const { container } = renderWithTheme(<AuthForm>Fields</AuthForm>);
    expect(container.querySelector('form')).toBeInTheDocument();
  });

  it('renders children', () => {
    renderWithTheme(
      <AuthForm>
        <input aria-label="email" />
        <button type="submit">Login</button>
      </AuthForm>
    );
    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('handles form submit', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithTheme(<AuthForm onSubmit={onSubmit}><button type="submit">Go</button></AuthForm>);
    fireEvent.submit(screen.getByText('Go').closest('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

// --- ErrorBanner ---
describe('ErrorBanner', () => {
  it('renders without crashing', () => {
    renderWithTheme(<ErrorBanner>Something went wrong</ErrorBanner>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders error message text', () => {
    renderWithTheme(<ErrorBanner>Invalid credentials</ErrorBanner>);
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });
});

// --- DateTimeInput ---
describe('DateTimeInput', () => {
  it('renders without crashing', () => {
    const { container } = renderWithTheme(
      <DateTimeInput
        dateValue="2024-01-15"
        timeValue="10:30"
        onDateChange={() => {}}
        onTimeChange={() => {}}
      />
    );
    expect(container.querySelector('input[type="date"]')).toBeInTheDocument();
    expect(container.querySelector('input[type="time"]')).toBeInTheDocument();
  });

  it('renders date and time inputs with correct values', () => {
    const { container } = renderWithTheme(
      <DateTimeInput
        dateValue="2024-06-15"
        timeValue="14:00"
        onDateChange={() => {}}
        onTimeChange={() => {}}
      />
    );
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2024-06-15');
    expect(timeInput.value).toBe('14:00');
  });

  it('calls onDateChange when date changes', () => {
    const onDateChange = vi.fn();
    const { container } = renderWithTheme(
      <DateTimeInput
        dateValue="2024-01-01"
        timeValue="09:00"
        onDateChange={onDateChange}
        onTimeChange={() => {}}
      />
    );
    fireEvent.change(container.querySelector('input[type="date"]')!, {
      target: { value: '2024-02-01' },
    });
    expect(onDateChange).toHaveBeenCalledWith('2024-02-01');
  });

  it('calls onTimeChange when time changes', () => {
    const onTimeChange = vi.fn();
    const { container } = renderWithTheme(
      <DateTimeInput
        dateValue="2024-01-01"
        timeValue="09:00"
        onDateChange={() => {}}
        onTimeChange={onTimeChange}
      />
    );
    fireEvent.change(container.querySelector('input[type="time"]')!, {
      target: { value: '15:30' },
    });
    expect(onTimeChange).toHaveBeenCalledWith('15:30');
  });
});

// --- DragHandle ---
describe('DragHandle', () => {
  it('renders without crashing', () => {
    renderWithTheme(<DragHandle aria-label="drag" />);
    expect(screen.getByRole('button', { name: 'drag' })).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    const { container } = renderWithTheme(<DragHandle />);
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('renders the grip icon (svg)', () => {
    const { container } = renderWithTheme(<DragHandle />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    renderWithTheme(<DragHandle aria-label="drag" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'drag' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards HTML button attributes', () => {
    renderWithTheme(<DragHandle aria-label="drag" title="Drag to reorder" />);
    expect(screen.getByRole('button', { name: 'drag' })).toHaveAttribute('title', 'Drag to reorder');
  });
});

// --- SettingsAtoms ---
describe('ActionButton', () => {
  it('renders without crashing', () => {
    renderWithTheme(<ActionButton>Change Password</ActionButton>);
    expect(screen.getByText('Change Password')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    renderWithTheme(<ActionButton onClick={onClick}>Click</ActionButton>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a button element', () => {
    const { container } = renderWithTheme(<ActionButton>Btn</ActionButton>);
    expect(container.querySelector('button')).toBeInTheDocument();
  });
});

describe('SignOutButton', () => {
  it('renders without crashing', () => {
    renderWithTheme(<SignOutButton>Sign Out</SignOutButton>);
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    renderWithTheme(<SignOutButton onClick={onClick}>Logout</SignOutButton>);
    fireEvent.click(screen.getByText('Logout'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a button element', () => {
    const { container } = renderWithTheme(<SignOutButton>Out</SignOutButton>);
    expect(container.querySelector('button')).toBeInTheDocument();
  });
});

describe('SelectedColorLabel', () => {
  it('renders without crashing', () => {
    renderWithTheme(<SelectedColorLabel>Navy Blue</SelectedColorLabel>);
    expect(screen.getByText('Navy Blue')).toBeInTheDocument();
  });

  it('renders children text', () => {
    renderWithTheme(<SelectedColorLabel>Dark</SelectedColorLabel>);
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });
});

describe('BackLink', () => {
  it('renders without crashing', () => {
    renderWithRouter(<BackLink to="/settings">Back to Settings</BackLink>);
    expect(screen.getByText('Back to Settings')).toBeInTheDocument();
  });

  it('renders as a link element', () => {
    renderWithRouter(<BackLink to="/settings">Back</BackLink>);
    const link = screen.getByText('Back');
    expect(link.closest('a')).toBeInTheDocument();
  });

  it('has correct href', () => {
    renderWithRouter(<BackLink to="/settings">Go Back</BackLink>);
    const link = screen.getByText('Go Back').closest('a');
    expect(link).toHaveAttribute('href', '/settings');
  });
});
