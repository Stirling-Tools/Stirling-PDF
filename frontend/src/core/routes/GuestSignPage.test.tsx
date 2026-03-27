import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

// ── i18n ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === 'string') return fallback;
      return key;
    },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// ── react-router-dom: useParams returns our injected token ──────────────────

const mockToken = 'test-token-abc';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: mockToken }),
}));

// ── Heavy sub-components — stub them out so we don't need full canvas / MUI ─

vi.mock('@app/components/shared/wetSignature/DrawSignatureCanvas', () => ({
  DrawSignatureCanvas: ({ onChange }: { onChange: (v: string | null) => void }) => (
    <button onClick={() => onChange('sig-data-stub')}>Draw</button>
  ),
}));

vi.mock('@app/components/shared/wetSignature/SignatureTypeSelector', () => ({
  SignatureTypeSelector: () => <div data-testid="sig-type-selector" />,
  SignatureType: {},
}));

vi.mock('@app/components/shared/wetSignature/TypeSignatureText', () => ({
  TypeSignatureText: () => <div data-testid="type-sig-text" />,
}));

vi.mock('@app/components/shared/wetSignature/UploadSignatureImage', () => ({
  UploadSignatureImage: () => <div data-testid="upload-sig-image" />,
}));

vi.mock('@app/components/shared/signing/GuestCertificateChooser', () => ({
  GuestCertificateChooser: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div data-testid="cert-chooser" data-value={value}>
      <button onClick={() => onChange('GUEST_CERT')}>Auto Cert</button>
      <button onClick={() => onChange('P12')}>Upload Cert</button>
    </div>
  ),
  GuestCertType: {},
}));

vi.mock('@app/types/signingSession', () => ({}));

// ── Component under test ────────────────────────────────────────────────────

import GuestSignPage from './GuestSignPage';

// ── Test wrapper ────────────────────────────────────────────────────────────

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

// ── Fetch helpers ───────────────────────────────────────────────────────────

function mockFetchSuccess(
  sessionData = { sessionId: '1', documentName: 'Contract.pdf', ownerEmail: 'owner@example.com' },
  participantData = { id: 1, email: 'guest@example.com', name: 'Guest', status: 'VIEWED' }
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.includes('/session')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sessionData) });
      }
      if (url.includes('/details')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(participantData),
        });
      }
      if (url.includes('/document')) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      // submit-signature or decline
      return Promise.resolve({ ok: true, status: 200 });
    })
  );
}

function mockFetchForbidden() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 403 })
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GuestSignPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state on mount before fetch resolves', () => {
    // Never resolve the fetch — stays in loading state
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    expect(screen.getByText(/loading signing session/i)).toBeInTheDocument();
  });

  it('shows expired message when fetch returns 403', async () => {
    mockFetchForbidden();

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/This signing link has expired\./i)
      ).toBeInTheDocument();
    });
  });

  it('shows signed success state when participant status is SIGNED', async () => {
    mockFetchSuccess(undefined, {
      id: 1,
      email: 'guest@example.com',
      name: 'Guest',
      status: 'SIGNED',
    });

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Your signature has been submitted successfully\./i)
      ).toBeInTheDocument();
    });
  });

  it('shows declined state when participant status is DECLINED', async () => {
    mockFetchSuccess(undefined, {
      id: 1,
      email: 'guest@example.com',
      name: 'Guest',
      status: 'DECLINED',
    });

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/You have declined this signing request\./i)
      ).toBeInTheDocument();
    });
  });

  it('renders the signing form in ready state', async () => {
    mockFetchSuccess();

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Sign Document')).toBeInTheDocument();
      expect(screen.getByText('Contract.pdf')).toBeInTheDocument();
    });
  });

  it('shows auto-cert chooser selected by default', async () => {
    mockFetchSuccess();

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      const chooser = screen.getByTestId('cert-chooser');
      expect(chooser).toHaveAttribute('data-value', 'GUEST_CERT');
    });
  });

  it('submits with GUEST_CERT when auto cert is selected', async () => {
    const user = userEvent.setup();
    mockFetchSuccess();

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Sign Document')).toBeInTheDocument();
    });

    const submitButton = screen.getByText('Submit Signature');
    await user.click(submitButton);

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const submitCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('submit-signature')
      );
      expect(submitCall).toBeDefined();
      const body = submitCall![1]!.body as FormData;
      expect(body.get('certType')).toBe('GUEST_CERT');
      expect(body.get('participantToken')).toBe(mockToken);
    });
  });

  it('shows success state after successful submission', async () => {
    const user = userEvent.setup();
    mockFetchSuccess();

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Sign Document')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Submit Signature'));

    await waitFor(() => {
      expect(
        screen.getByText(/Your signature has been submitted successfully\./i)
      ).toBeInTheDocument();
    });
  });

  it('opens decline confirmation modal when Decline is clicked', async () => {
    const user = userEvent.setup();
    mockFetchSuccess();

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Sign Document')).toBeInTheDocument();
    });

    // Click the outer Decline button (variant="subtle")
    const outerDeclineBtn = screen.getAllByRole('button').find(
      (btn) => btn.getAttribute('data-variant') === 'subtle'
    );
    expect(outerDeclineBtn).toBeDefined();
    await user.click(outerDeclineBtn!);

    // Modal confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Decline signing?')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to decline/i)).toBeInTheDocument();
    });

    // Cancel button should close the modal
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText('Decline signing?')).not.toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails with non-403 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    render(
      <TestWrapper>
        <GuestSignPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });
  });
});
