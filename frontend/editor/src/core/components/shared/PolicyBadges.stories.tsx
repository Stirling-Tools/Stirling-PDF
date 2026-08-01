import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyBadges } from "@app/components/shared/PolicyBadges";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";

const mockPolicies: FileItemPolicyRef[] = [
  { id: "policy-1", name: "Redact PII", accentColor: "#e03131", recent: true },
  { id: "policy-2", name: "Sanitize", accentColor: "#2f9e44", recent: false },
  { id: "policy-3", name: "Watermark", accentColor: "#4263eb", recent: false },
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
        accentColor: "#e03131",
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
