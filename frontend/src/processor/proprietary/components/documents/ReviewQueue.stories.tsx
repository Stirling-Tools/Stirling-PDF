import type { Meta, StoryObj } from "@storybook/react-vite";
import { documentsFor } from "@portal/mocks/documents";
import { ReviewQueue } from "@portal/components/documents/ReviewQueue";
import "@portal/views/Documents.css";

const meta: Meta<typeof ReviewQueue> = {
  title: "Portal/Documents/ReviewQueue",
  component: ReviewQueue,
  parameters: { layout: "padded" },
  args: { documents: documentsFor("enterprise"), loading: false },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "80rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ReviewQueue>;

export const Default: Story = {};

export const Loading: Story = {
  args: { documents: [], loading: true },
};

export const Empty: Story = {
  args: { documents: [], loading: false },
};
