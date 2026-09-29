import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchInterface } from "@app/components/viewer/SearchInterface";

// SearchInterface reads ViewerContext via useContext with optional chaining
// throughout, so it renders fine without a ViewerProvider mounted — search
// state simply resolves to its empty/no-results defaults.
const meta = {
  title: "Viewer/SearchInterface",
  component: SearchInterface,
} satisfies Meta<typeof SearchInterface>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    visible: true,
    onClose: () => {},
  },
};

export const Hidden: Story = {
  args: {
    visible: false,
    onClose: () => {},
  },
};
