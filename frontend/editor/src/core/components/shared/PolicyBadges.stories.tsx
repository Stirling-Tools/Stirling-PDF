import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyBadges } from "@app/components/shared/PolicyBadges";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";

// Accent colours travel on the policy record itself, so the mocks carry
// literals the way real data would.
const RED = "#e03131"; // theme-allow-color policy accent data
const GREEN = "#2f9e44"; // theme-allow-color policy accent data
const BLUE = "#4263eb"; // theme-allow-color policy accent data

const mockPolicies: FileItemPolicyRef[] = [
  { id: "policy-1", name: "Redact PII", accentColor: RED, recent: true },
  { id: "policy-2", name: "Sanitize", accentColor: GREEN, recent: false },
  { id: "policy-3", name: "Watermark", accentColor: BLUE, recent: false },
];

const meta = {
  title: "Shared/PolicyBadges",
  component: PolicyBadges,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PolicyBadges>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    policies: mockPolicies,
  },
};

export const Enforcing: Story = {
  args: {
    policies: [
      {
        id: "policy-1",
        name: "Redact PII",
        accentColor: RED,
        recent: false,
        enforcing: true,
      },
      ...mockPolicies.slice(1),
    ],
  },
};

export const Empty: Story = {
  args: {
    policies: [],
  },
};
