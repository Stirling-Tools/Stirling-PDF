import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyBadges } from "@editor/components/shared/PolicyBadges";
import type { FileItemPolicyRef } from "@editor/components/shared/PolicyBadges";

// Real catalog category ids, so each badge renders its own shared glyph
// (policyCategoryIcon) rather than the unknown-category fallback. Accents mirror
// policyAccentVar's mapping — that lives in the proprietary layer, which a core
// story can't import.
const mockPolicies: FileItemPolicyRef[] = [
  { id: "security", name: "Redact PII", accentColor: "var(--color-purple)" },
  { id: "compliance", name: "Sanitize", accentColor: "var(--color-green)" },
  { id: "ingestion", name: "Watermark", accentColor: "var(--color-blue)" },
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

/** A blocking policy mid-run: spinner, and the file's exit points are gated. */
export const Enforcing: Story = {
  args: {
    policies: [
      { ...mockPolicies[0], enforcing: true },
      ...mockPolicies.slice(1),
    ],
  },
};

/** A non-blocking run (classification tagging): same spinner, nothing gated. */
export const Background: Story = {
  args: {
    policies: [
      {
        id: "classification",
        name: "Classification",
        accentColor: "var(--color-orange)",
        background: true,
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
