import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { EditorAdmin } from "@portal/views/EditorAdmin";

/**
 * Editor deployment management, reached from Infrastructure → Deployments: the
 * summary strip, the deployment targets (Managed Cloud / Docker / Kubernetes),
 * instance pairing, instance health, and the credential / offline-activation
 * cards.
 *
 * The whole page is one tier-aware fetch, so the tier is what makes these
 * stories differ: it decides which targets are unlocked (locked ones show an
 * upgrade nudge instead of an install snippet), how many instances the org runs,
 * and whether offline activation is offered at all. Until that fetch resolves,
 * the strip and targets render as skeletons and the lower sections are absent.
 */
const meta: Meta<typeof EditorAdmin> = {
  // AppShell renders every view inside <main>; standalone, this view's
  // own <header> would be promoted to a second banner landmark.
  decorators: [
    (Story: () => React.ReactElement) => (
      <main>
        <Story />
      </main>
    ),
  ],
  title: "Portal/Views/EditorAdmin",
  component: EditorAdmin,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof EditorAdmin>;

/** Free: only Managed Cloud is available, the self-hosted targets are gated. */
export const FreeTier: Story = { globals: { tier: "free" } };

/** Pay-as-you-go: self-hosted targets unlock alongside Managed Cloud. */
export const ProTier: Story = { globals: { tier: "pro" } };

/** Enterprise: every target, plus the offline-activation lifecycle card. */
export const EnterpriseTier: Story = { globals: { tier: "enterprise" } };

/** In flight: skeleton summary + target cards, with the later sections withheld. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/v1/editor/deployment", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      ],
    },
  },
};
