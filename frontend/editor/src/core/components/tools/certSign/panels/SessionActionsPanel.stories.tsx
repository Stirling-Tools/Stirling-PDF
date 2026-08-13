import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionActionsPanel } from "@app/components/tools/certSign/panels/SessionActionsPanel";
import type { SessionDetail } from "@app/types/signingSession";

const baseSession: SessionDetail = {
  sessionId: "session-1",
  documentName: "Contract.pdf",
  ownerEmail: "owner@example.com",
  message: "Please review and sign by end of week.",
  dueDate: "2026-08-01",
  createdAt: "2026-07-01T09:00:00Z",
  updatedAt: "2026-07-10T09:00:00Z",
  finalized: false,
  participants: [
    {
      id: 1,
      userId: 1,
      email: "alice@example.com",
      name: "Alice",
      status: "SIGNED",
      lastUpdated: "2026-07-05T09:00:00Z",
    },
    {
      id: 2,
      userId: 2,
      email: "bob@example.com",
      name: "Bob",
      status: "PENDING",
      lastUpdated: "2026-07-01T09:00:00Z",
    },
  ],
};

const meta = {
  title: "Tools/CertSign/Panels/SessionActionsPanel",
  component: SessionActionsPanel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SessionActionsPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    session: baseSession,
    onAddParticipants: () => {},
    onFinalize: () => {},
    onLoadSignedPdf: () => {},
    finalizing: false,
    loadingPdf: false,
  },
};

export const AllSigned: Story = {
  args: {
    ...Default.args,
    session: {
      ...baseSession,
      participants: baseSession.participants.map((p) => ({
        ...p,
        status: "SIGNED",
      })),
    },
  },
};

export const Finalized: Story = {
  args: {
    ...Default.args,
    session: { ...baseSession, finalized: true },
    loadingPdf: true,
  },
};
