import type { Meta, StoryObj } from "@storybook/react-vite";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";

/**
 * Config section showing the user's API key, with copy/refresh actions and
 * links to the API docs. Fetches the key from the backend on mount.
 */
const meta: Meta<typeof ApiKeys> = {
  title: "Config/ConfigSections/ApiKeys",
  component: ApiKeys,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
