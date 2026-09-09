import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionTypePicker } from "@processor/components/sources/ConnectionTypePicker";
import {
  CREATABLE_CONNECTION_TYPES,
  presetConnectionTypes,
} from "@processor/components/sources/connectionTypes";

const meta = {
  title: "Processor/Sources/ConnectionTypePicker",
  component: ConnectionTypePicker,
  parameters: { layout: "padded" },
  args: {
    types: presetConnectionTypes(),
    onPick: () => {},
  },
} satisfies Meta<typeof ConnectionTypePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const IncludingCustomApi: Story = {
  args: { types: CREATABLE_CONNECTION_TYPES },
};

export const NoResults: Story = {
  args: { types: [] },
};
