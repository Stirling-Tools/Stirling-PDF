import type { Meta, StoryObj } from "@storybook/react-vite";
import WorkspacePlanSnapshot from "@app/components/shared/config/WorkspacePlanSnapshot";

const meta: Meta<typeof WorkspacePlanSnapshot> = {
  title: "Config/WorkspacePlanSnapshot",
  component: WorkspacePlanSnapshot,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "40rem" }}>
        <S />
      </div>
    ),
  ],
  args: {
    bannerTitle: "Read-only snapshot",
    bannerMessage:
      "Plan and usage are governed in the PDF Processor. This mirrors the workspace's current state.",
    currentPlanLabel: "Current plan",
    statusLabel: "Active",
    ctaLabel: "Manage in Usage & Billing",
    canManage: true,
    onManage: () => {},
    cannotManageHint:
      "This is read-only, ask a workspace admin to make changes.",
  },
};
export default meta;
type Story = StoryObj<typeof WorkspacePlanSnapshot>;

/** Free/self-hosted editor: hard free cap, no card on file. */
export const EditorTier: Story = {
  args: {
    tierLabel: "Editor",
    rows: [
      {
        label: "Documents this month",
        value: "247 / 500",
        sub: "Hard cap on Free",
      },
      { label: "Spend this month", value: "$0.00", sub: "No card on file" },
      {
        label: "Starting rate",
        value: "1¢ / PDF",
        sub: "From here, scales with file size and policies · first 500 free",
      },
      { label: "Sources", value: "1", sub: "Free limit" },
    ],
  },
};

/** PAYG "Processor" tier: metered documents + spend against a limit. */
export const ProcessorTier: Story = {
  args: {
    tierLabel: "Processor",
    rows: [
      {
        label: "Documents this month",
        value: "142,847",
        sub: "From 1¢ / PDF · scales with size + policies",
      },
      {
        label: "Spend this month",
        value: "$4,911",
        sub: "41% of $12,000 limit",
      },
      {
        label: "Starting rate",
        value: "1¢ / PDF",
        sub: "Floor; scales with size + policies",
      },
      { label: "Audit retention", value: "7 days" },
    ],
  },
};

/** Enterprise: committed volume pricing. */
export const EnterpriseTier: Story = {
  args: {
    tierLabel: "Enterprise",
    rows: [
      {
        label: "Documents this month",
        value: "7.4M",
        sub: "247,280 in last 24h",
      },
      {
        label: "Billing",
        value: "Committed rate",
        sub: "Annual · volume-priced",
      },
      {
        label: "Per-PDF rate",
        value: "$0.0200",
        sub: "Governed posture · committed",
      },
      { label: "Audit retention", value: "90 days", sub: "Immutable" },
    ],
  },
};

/** No portal access: CTA disabled with the read-only hint. */
export const NoPortalAccess: Story = {
  args: {
    ...EditorTier.args,
    canManage: false,
  },
};

/** Live figures still loading. */
export const Loading: Story = {
  args: {
    ...EditorTier.args,
    loading: true,
  },
};
