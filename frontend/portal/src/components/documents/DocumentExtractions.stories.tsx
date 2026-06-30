import type { Meta, StoryObj } from "@storybook/react-vite";
import { documentsFor } from "@portal/mocks/documents";
import { DocumentExtractions } from "@portal/components/documents/DocumentExtractions";
import "@portal/views/Documents.css";

const ALL = documentsFor("enterprise");
const NON_SENSITIVE = ALL.find((d) => !d.sensitive)!;
const SENSITIVE = ALL.find((d) => d.sensitive)!;
const NO_AMOUNT = ALL.find((d) =>
  d.extractions.some((e) => e.confidence === 0),
)!;

const meta: Meta<typeof DocumentExtractions> = {
  title: "Portal/Documents/DocumentExtractions",
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

/** Per-field table with mixed confidence tones. */
export const Default: Story = {};

/** A field that failed to extract sits at 0% confidence. */
export const LowConfidence: Story = {
  args: { doc: NO_AMOUNT },
};

/** Sensitive doc with no active grant — content stays masked. */
export const Masked: Story = {
  args: { doc: SENSITIVE, unlocked: false },
};

/** Same sensitive doc once a timed elevation is active. */
export const Unlocked: Story = {
  args: { doc: SENSITIVE, unlocked: true },
};
