import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import ParticipantView from "@app/components/workflow/ParticipantView";
import type {
  ParticipantResponse,
  WorkflowSessionResponse,
} from "@app/services/workflowService";

/**
 * The signing hook (`useParticipantSession`) fires two GETs on mount —
 * session + participant details — so every story mocks both via MSW rather
 * than passing data through props (the component only accepts a `token`).
 */
function sessionHandlers(
  session: WorkflowSessionResponse,
  participant: ParticipantResponse,
) {
  return [
    http.get("/api/v1/workflow/participant/session", () =>
      HttpResponse.json(session),
    ),
    http.get("/api/v1/workflow/participant/details", () =>
      HttpResponse.json(participant),
    ),
  ];
}

const baseSession: WorkflowSessionResponse = {
  sessionId: "session-1",
  ownerId: 1,
  ownerUsername: "alex",
  workflowType: "SIGNING",
  documentName: "vendor-agreement.pdf",
  message: "Please sign by end of week, thanks!",
  dueDate: "2026-07-20T00:00:00Z",
  status: "IN_PROGRESS",
  finalized: false,
  createdAt: "2026-07-10T09:00:00Z",
  updatedAt: "2026-07-10T09:00:00Z",
  participants: [],
  hasProcessedFile: false,
};

const baseParticipant: ParticipantResponse = {
  id: 1,
  email: "jordan@example.com",
  name: "Jordan",
  status: "NOTIFIED",
  shareToken: null,
  accessRole: "EDITOR",
  lastUpdated: "2026-07-10T09:00:00Z",
  hasCompleted: false,
  isExpired: false,
};

const meta = {
  title: "Workflow/ParticipantView",
  component: ParticipantView,
  parameters: { layout: "padded" },
  args: {
    token: "story-participant-token",
  },
} satisfies Meta<typeof ParticipantView>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Awaiting signature: the certificate + signing form is shown. */
export const Default: Story = {
  parameters: {
    msw: { handlers: sessionHandlers(baseSession, baseParticipant) },
  },
};

/** Participant already signed: the form is replaced with a completion banner. */
export const Completed: Story = {
  parameters: {
    msw: {
      handlers: sessionHandlers(
        { ...baseSession, status: "COMPLETED", finalized: true },
        { ...baseParticipant, status: "SIGNED", hasCompleted: true },
      ),
    },
  },
};

/** The participant's access window has passed: signing is blocked. */
export const Expired: Story = {
  parameters: {
    msw: {
      handlers: sessionHandlers(baseSession, {
        ...baseParticipant,
        status: "PENDING",
        isExpired: true,
        expiresAt: "2026-07-01T00:00:00Z",
      }),
    },
  },
};
