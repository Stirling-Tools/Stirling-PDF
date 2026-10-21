import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionDetailPanel } from "@app/components/tools/certSign/panels/SessionDetailPanel";
import type { SigningDetailData } from "@app/hooks/signing/useSigningSessionController";
import type { SessionDetail } from "@app/types/signingSession";

const baseSession: SessionDetail = {
  sessionId: "session-1",
  documentName: "Employment-Contract.pdf",
  ownerEmail: "owner@example.com",
  message: "Please review and sign by the due date.",
  dueDate: "2026-08-01T00:00:00Z",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-10T00:00:00Z",
  finalized: false,
  participants: [
    {
      id: 1,
      userId: 101,
      email: "alice@example.com",
      name: "Alice Johnson",
      status: "SIGNED",
      lastUpdated: "2026-07-05T00:00:00Z",
    },
    {
      id: 2,
      userId: 102,
      email: "bob@example.com",
      name: "Bob Smith",
      status: "PENDING",
      lastUpdated: "2026-07-01T00:00:00Z",
    },
  ],
};

function buildData(session: SessionDetail): SigningDetailData {
  return {
    session,
    pdfFile: null,
    onFinalize: async () => {},
    onLoadSignedPdf: async () => {},
    onAddParticipants: async () => {},
    onRemoveParticipant: async () => {},
    onDelete: async () => {},
    onBack: () => {},
    onRefresh: async () => {},
  };
}

const meta = {
  title: "CertSign/SessionDetailPanel",
  component: SessionDetailPanel,
} satisfies Meta<typeof SessionDetailPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: buildData(baseSession),
  },
};

export const Finalized: Story = {
  args: {
    data: buildData({
      ...baseSession,
      finalized: true,
      participants: baseSession.participants.map((p) => ({
        ...p,
        status: "SIGNED",
      })),
    }),
  },
};
