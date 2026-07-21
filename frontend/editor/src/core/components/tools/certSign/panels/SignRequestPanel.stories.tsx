import type { Meta, StoryObj } from "@storybook/react-vite";
import SignRequestPanel from "@app/components/tools/certSign/panels/SignRequestPanel";
import { AppProviders } from "@app/components/AppProviders";
import type { SigningRequestData } from "@app/hooks/signing/useSigningSessionController";
import type { SignRequestDetail } from "@app/types/signingSession";

function mockPdfFile(name: string): File {
  return new File(["%PDF-1.4 storybook fixture"], name, {
    type: "application/pdf",
  });
}

function mockSignRequest(
  overrides: Partial<SignRequestDetail> = {},
): SignRequestDetail {
  return {
    sessionId: "session-1",
    documentName: "Vendor Agreement.pdf",
    ownerUsername: "alice",
    message: "Please review and sign by end of week.",
    dueDate: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-07-10T00:00:00.000Z",
    myStatus: "NOTIFIED",
    ...overrides,
  };
}

function mockSigningRequestData(
  overrides: Partial<SigningRequestData> = {},
): SigningRequestData {
  return {
    signRequest: mockSignRequest(),
    pdfFile: mockPdfFile("Vendor Agreement.pdf"),
    onSign: async () => {},
    onDecline: async () => {},
    onBack: () => {},
    canSign: true,
    ...overrides,
  };
}

const meta = {
  title: "Tools/CertSign/SignRequestPanel",
  component: SignRequestPanel,
  parameters: { layout: "padded" },
  // Reads/writes the shared viewer overlay (useSigningOverlay) and adds the
  // document to active files (useFileActions), so it needs the full
  // AppProviders stack rather than a minimal test wrapper.
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <div style={{ width: "20rem" }}>
          <Story />
        </div>
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof SignRequestPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Participant can sign: signature controls are shown above the action buttons. */
export const Default: Story = {
  args: {
    data: mockSigningRequestData(),
  },
};

/** Read-only viewer (e.g. the request owner): no signature controls, only decline/back. */
export const ReadOnly: Story = {
  args: {
    data: mockSigningRequestData({ canSign: false }),
  },
};

/** Already signed: the decline button is hidden. */
export const AlreadySigned: Story = {
  args: {
    data: mockSigningRequestData({
      signRequest: mockSignRequest({ myStatus: "SIGNED" }),
    }),
  },
};
