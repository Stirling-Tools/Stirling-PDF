import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { EditorStatusCard } from "@processor/components/EditorStatusCard";

const meta: Meta<typeof EditorStatusCard> = {
  title: "Processor/Home/EditorStatusCard",
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

/** The deployment rail, reporting a live deployment. */
export const Default: Story = {};

/**
 * Backend without the editor-deployment endpoint (404): the rail keeps its identity and the neutral
 * deploy ask, and states no host or adoption figure, since neither can be read.
 */
export const DeploymentUnavailable: Story = {
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
