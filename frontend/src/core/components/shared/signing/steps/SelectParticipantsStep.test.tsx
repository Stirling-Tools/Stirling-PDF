import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

// ── i18n ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === 'string') return fallback;
      if (typeof fallback === 'object' && fallback !== null) {
        // Handle interpolation like {{count}}
        const defaultValue = (fallback as Record<string, unknown>).defaultValue;
        if (typeof defaultValue === 'string') return defaultValue;
      }
      return key;
    },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// ── UserSelector stub — renders a simple multi-select ───────────────────────

vi.mock('@app/components/shared/UserSelector', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: number[];
    onChange: (ids: number[]) => void;
  }) => (
    <div data-testid="user-selector">
      <button onClick={() => onChange([...value, 42])}>Add User 42</button>
      <button onClick={() => onChange([])}>Clear Users</button>
      <span data-testid="user-count">{value.length}</span>
    </div>
  ),
}));

// ── MUI icons stub (to avoid SVG transform issues in jsdom) ─────────────────

vi.mock('@mui/icons-material/ArrowBack', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Close', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Person', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Email', () => ({ default: () => null }));

// ── Component under test ────────────────────────────────────────────────────

import { SelectParticipantsStep, Participant } from './SelectParticipantsStep';

// ── Test wrapper ────────────────────────────────────────────────────────────

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

// ── Default props ───────────────────────────────────────────────────────────

function makeProps(overrides?: Partial<{
  participants: Participant[];
  onParticipantsChange: (p: Participant[]) => void;
  onBack: () => void;
  onNext: () => void;
}>) {
  return {
    participants: [] as Participant[],
    onParticipantsChange: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SelectParticipantsStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the registered users tab by default', () => {
    render(
      <TestWrapper>
        <SelectParticipantsStep {...makeProps()} />
      </TestWrapper>
    );

    expect(screen.getByText('Registered Users')).toBeInTheDocument();
    expect(screen.getByTestId('user-selector')).toBeInTheDocument();
  });

  it('renders the external tab', () => {
    render(
      <TestWrapper>
        <SelectParticipantsStep {...makeProps()} />
      </TestWrapper>
    );

    expect(screen.getByText('External (by email)')).toBeInTheDocument();
  });

  it('Continue button is disabled when participants list is empty', () => {
    render(
      <TestWrapper>
        <SelectParticipantsStep {...makeProps({ participants: [] })} />
      </TestWrapper>
    );

    const continueBtn = screen.getByText('Continue to Signature Settings');
    expect(continueBtn.closest('button')).toBeDisabled();
  });

  it('Continue button is enabled when participants list has entries', () => {
    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({
            participants: [{ type: 'external', email: 'alice@example.com' }],
          })}
        />
      </TestWrapper>
    );

    const continueBtn = screen.getByText('Continue to Signature Settings');
    expect(continueBtn.closest('button')).not.toBeDisabled();
  });

  it('adds external email to participant list on Add button click', async () => {
    const user = userEvent.setup();
    const onParticipantsChange = vi.fn();

    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({ onParticipantsChange })}
        />
      </TestWrapper>
    );

    // Switch to external tab
    await user.click(screen.getByText('External (by email)'));

    const input = screen.getByPlaceholderText('signer@example.com');
    await user.type(input, 'new@example.com');
    await user.click(screen.getByText('Add'));

    expect(onParticipantsChange).toHaveBeenCalledWith([
      { type: 'external', email: 'new@example.com' },
    ]);
  });

  it('adds external email on Enter keypress', async () => {
    const user = userEvent.setup();
    const onParticipantsChange = vi.fn();

    render(
      <TestWrapper>
        <SelectParticipantsStep {...makeProps({ onParticipantsChange })} />
      </TestWrapper>
    );

    await user.click(screen.getByText('External (by email)'));

    const input = screen.getByPlaceholderText('signer@example.com');
    await user.type(input, 'enter@example.com{Enter}');

    expect(onParticipantsChange).toHaveBeenCalledWith([
      { type: 'external', email: 'enter@example.com' },
    ]);
  });

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SelectParticipantsStep {...makeProps()} />
      </TestWrapper>
    );

    await user.click(screen.getByText('External (by email)'));

    const input = screen.getByPlaceholderText('signer@example.com');
    await user.type(input, 'not-an-email');
    await user.click(screen.getByText('Add'));

    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
  });

  it('shows duplicate email error when same email is added twice', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({
            participants: [{ type: 'external', email: 'existing@example.com' }],
          })}
        />
      </TestWrapper>
    );

    await user.click(screen.getByText('External (by email)'));

    const input = screen.getByPlaceholderText('signer@example.com');
    await user.type(input, 'existing@example.com');
    await user.click(screen.getByText('Add'));

    expect(screen.getByText('This email has already been added')).toBeInTheDocument();
  });

  it('displays external participants as Guest badges', () => {
    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({
            participants: [{ type: 'external', email: 'guest@example.com' }],
          })}
        />
      </TestWrapper>
    );

    expect(screen.getByText('guest@example.com')).toBeInTheDocument();
    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('removes participant when close button is clicked', () => {
    const onParticipantsChange = vi.fn();

    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({
            participants: [{ type: 'external', email: 'remove@example.com' }],
            onParticipantsChange,
          })}
        />
      </TestWrapper>
    );

    // The remove action icon
    const removeButtons = screen.getAllByRole('button');
    const removeBtn = removeButtons.find(
      (btn) => btn.getAttribute('data-variant') === 'subtle'
    );
    expect(removeBtn).toBeDefined();
    fireEvent.click(removeBtn!);

    expect(onParticipantsChange).toHaveBeenCalledWith([]);
  });

  it('shows email invite alert when external participants are present', () => {
    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({
            participants: [{ type: 'external', email: 'invited@example.com' }],
          })}
        />
      </TestWrapper>
    );

    expect(
      screen.getByText(/External participants will receive an email invitation/i)
    ).toBeInTheDocument();
  });

  it('does not show email invite alert when only registered users are present', () => {
    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({
            participants: [{ type: 'registered', userId: 1 }],
          })}
        />
      </TestWrapper>
    );

    expect(
      screen.queryByText(/External participants will receive an email invitation/i)
    ).not.toBeInTheDocument();
  });

  it('calls onBack when Back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <TestWrapper>
        <SelectParticipantsStep {...makeProps({ onBack })} />
      </TestWrapper>
    );

    await user.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onNext when Continue button is clicked with participants', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    render(
      <TestWrapper>
        <SelectParticipantsStep
          {...makeProps({
            participants: [{ type: 'external', email: 'a@b.com' }],
            onNext,
          })}
        />
      </TestWrapper>
    );

    await user.click(screen.getByText('Continue to Signature Settings'));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
