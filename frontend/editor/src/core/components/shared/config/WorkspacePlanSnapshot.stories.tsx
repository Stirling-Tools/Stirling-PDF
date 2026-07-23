import type { Meta, StoryObj } from "@storybook/react-vite";
import WorkspacePlanSnapshot from "@app/components/shared/config/WorkspacePlanSnapshot";

/**
 * The "Plan & Usage" card. One wallet-driven card is shared across editions:
 * Free (Editor) and subscribed (Processor). The optional context banner is
 * omitted on the shipped page, so these stories mirror that.
 */
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

/** Free "Editor" tier: hard free cap, no card on file, connected sources. */
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
        value: "1¢ / credit",
        sub: "A credit is one processor run · first 500 free",
      },
      {
        label: "Sources",
        value: "1",
        sub: "Connected for policies + pipelines",
      },
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
        sub: "From 1¢ / credit · scales with size + policies",
      },
      {
        label: "Spend this month",
        value: "$4,911",
        sub: "41% of $12,000 limit",
      },
      {
        label: "Starting rate",
        value: "1¢ / credit",
        sub: "Floor; scales with size + policies",
      },
      { label: "Audit retention", value: "7 days" },
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
