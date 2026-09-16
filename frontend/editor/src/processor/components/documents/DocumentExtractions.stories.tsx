import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Extraction } from "@processor/api/documents";
import { documentsFor } from "@processor/mocks/documents";
import { DocumentExtractions } from "@processor/components/documents/DocumentExtractions";
import "@processor/views/Documents.css";

const ALL = documentsFor("enterprise");

// The mock documents ship without extractions, so seed a realistic set here -
// a spread of confidence levels so the table (and its confidence sort) is
// actually reviewable.
const EXTRACTIONS: Extraction[] = [
  { field: "Counterparty", value: "Acme Services LLC", confidence: 0.98 },
  { field: "Effective date", value: "2026-01-14", confidence: 0.94 },
  { field: "Contract value", value: "$248,000.00", confidence: 0.87 },
  { field: "Governing law", value: "Delaware", confidence: 0.72 },
  { field: "Auto-renewal", value: "Yes (12 months)", confidence: 0.55 },
];

const NON_SENSITIVE = {
  ...ALL.find((d) => !d.sensitive)!,
  extractions: EXTRACTIONS,
  fieldsExtracted: EXTRACTIONS.length,
};
const SENSITIVE = {
  ...ALL.find((d) => d.sensitive)!,
  extractions: EXTRACTIONS,
  fieldsExtracted: EXTRACTIONS.length,
};

const meta: Meta<typeof DocumentExtractions> = {
  title: "Processor/Documents/DocumentExtractions",
  component: DocumentExtractions,
  parameters: { layout: "padded" },
  args: { doc: NON_SENSITIVE, unlocked: false },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "36rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DocumentExtractions>;

/** Extracted fields with a mix of confidence levels; click a header to sort. */
export const Default: Story = {};

/** Sensitive doc with no active grant — content stays masked. */
export const Masked: Story = {
  args: { doc: SENSITIVE, unlocked: false },
};

/** Same sensitive doc once a timed elevation is active. */
export const Unlocked: Story = {
  args: { doc: SENSITIVE, unlocked: true },
};

/** No extraction data yet — the empty state. */
export const Empty: Story = {
  args: {
    doc: { ...NON_SENSITIVE, extractions: [], fieldsExtracted: 0 },
  },
};
