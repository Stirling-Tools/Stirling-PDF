import type { Meta, StoryObj } from "@storybook/react-vite";
import FitText from "@app/components/shared/FitText";

const meta: Meta<typeof FitText> = {
  title: "Shared/FitText",
  component: FitText,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "12rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Single-line text that shrinks its font size to fit the available width. */
export const Default: Story = {
  args: {
    text: "Invoice_2026_Quarterly_Report.pdf",
  },
};

/** Multi-line clamp with soft-break hints inserted after '/', '-' and '_'. */
export const MultiLine: Story = {
  args: {
    text: "path/to/some-very/long_document/name_that_needs_multiple_lines.pdf",
    lines: 3,
  },
};

/** Explicit font size (rem) with a lower minimum shrink scale. */
export const CustomFontSize: Story = {
  args: {
    text: "Custom Sized Label",
    fontSize: 1.5,
    minimumFontScale: 0.5,
  },
};
