import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { EditorStatusCard } from "@portal/components/EditorStatusCard";
import { SetupChecklist } from "@portal/components/SetupChecklist";
import type { OnboardingProgress } from "@portal/hooks/useOnboardingProgress";

const progress: OnboardingProgress = {
  loading: false,
  editorDone: true,
  policiesDone: true,
  inviteDone: false,
  policiesActive: 3,
  policiesRecommended: 4,
  allComplete: false,
};

const meta: Meta<typeof EditorStatusCard> = {
  title: "Portal/Home/EditorStatusCard",
  component: EditorStatusCard,
  parameters: { layout: "padded" },
  globals: { tier: "pro" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EditorStatusCard>;

/** The deployed-Editor status card on its own. */
export const Default: Story = {};

/** As it renders on the subscribed home: the setup checklist attached as the footer. */
export const WithSetupChecklist: Story = {
  args: {
    footer: <SetupChecklist progress={progress} />,
  },
};

/**
 * Backend without the editor-deployment endpoint (404): the status row is
 * skipped and the card falls back to just the footer (setup checklist). It
 * lights up automatically once /v1/editor/deployment is served.
 */
export const DeploymentUnavailable: Story = {
  args: {
    footer: <SetupChecklist progress={progress} />,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/editor/deployment", () =>
          HttpResponse.json({ message: "not found" }, { status: 404 }),
        ),
      ],
    },
  },
};
