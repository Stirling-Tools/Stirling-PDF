import type { Meta, StoryObj } from "@storybook/react-vite";
import { NonPdfBanner } from "@app/components/viewer/nonpdf/NonPdfBanner";

const meta = {
  title: "Viewer/NonPdf/NonPdfBanner",
  component: NonPdfBanner,
  parameters: { layout: "padded" },
} satisfies Meta<typeof NonPdfBanner>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onConvertToPdf: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "6rem" }}>
        <Story />
      </div>
    ),
  ],
};

export const Hidden: Story = {
  args: {
    onConvertToPdf: undefined,
  },
};
