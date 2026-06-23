import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SecurityTab } from "@portal/components/infrastructure/SecurityTab";
import "@portal/views/Infrastructure.css";

const meta: Meta<typeof SecurityTab> = {
  title: "Portal/Infrastructure/SecurityTab",
  component: SecurityTab,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SecurityTab>;

export const Default: Story = {};

// Enterprise unlocks HYOK key custody (with a live rotate affordance) and the
// full attested compliance set, including PCI in-scope.
export const Enterprise: Story = {
  globals: { tier: "enterprise" },
};

// Free runs on Stirling-managed keys (rotate disabled, upgrade nudge) and a
// trimmed attestation set with HIPAA/PCI not-applicable.
export const Free: Story = {
  globals: { tier: "free" },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/security", async () => {
          await delay("infinite");
          return HttpResponse.json(null);
        }),
      ],
    },
  },
};

export const Unavailable: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/infrastructure/security", () =>
          HttpResponse.json(null, { status: 503 }),
        ),
      ],
    },
  },
};
