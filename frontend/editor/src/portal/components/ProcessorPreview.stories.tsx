import type { Meta, StoryObj } from "@storybook/react-vite";
import "@portal/components/ProcessorPreview.css";
import { ProcessorFlow } from "@portal/components/ProcessorFlow";
import type { ProcessorFlow as FlowModel } from "@portal/api/processorFlow";

const enterpriseFlow: FlowModel = {
  sources: [
    { id: "editor", name: "Employee PDFs", type: "editor", docs24h: 8400 },
    {
      id: "invoices",
      name: "Supplier invoices",
      type: "folder",
      docs24h: 12600,
    },
    { id: "claims", name: "Insurance claims", type: "s3", docs24h: 6200 },
    { id: "contracts", name: "Legal contracts", type: "folder", docs24h: 3800 },
    { id: "hr", name: "HR onboarding", type: "folder", docs24h: 2400 },
    { id: "finance", name: "Finance archive", type: "s3", docs24h: 4600 },
  ],
  comingSoonSources: [],
  policies: [
    ["ingestion", "OCR & extract invoice data", 12600],
    ["security", "Redact personal information", 8400],
    ["classification", "Classify claims & contracts", 10000],
    ["compliance", "Validate & apply watermarks", 6200],
    ["routing", "Route to the right team", 38000],
    ["retention", "Encrypt & archive records", 7000],
  ].map(([key, labelKey, runs24h]) => ({
    key: String(key),
    labelKey: String(labelKey),
    runs24h: Number(runs24h),
    state: "active",
    configured: true,
  })),
  outcomes: [
    { key: "success", labelKey: "Processed & delivered", count24h: 37848 },
    { key: "failed", labelKey: "Flagged for review", count24h: 152 },
  ],
};

const meta: Meta<typeof ProcessorFlow> = {
  title: "Portal/Marketing/ProcessorPreview",
  component: ProcessorFlow,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ProcessorFlow>;

/** Illustrative enterprise data for social artwork; never used by the live dashboard. */
export const Enterprise: Story = {
  args: { dataOverride: enterpriseFlow },
  decorators: [
    (Story) => (
      <div className="marketing-processor-preview">
        <Story />
      </div>
    ),
  ],
};
