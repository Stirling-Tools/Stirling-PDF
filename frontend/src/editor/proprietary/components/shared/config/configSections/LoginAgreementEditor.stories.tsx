import type { Meta, StoryObj } from "@storybook/react-vite";
import LoginAgreementEditor from "@app/components/shared/config/configSections/LoginAgreementEditor";

/**
 * Per-language editor for the login agreement markdown shown on the login screen.
 */
const meta: Meta<typeof LoginAgreementEditor> = {
  title: "Config/ConfigSections/LoginAgreementEditor",
  component: LoginAgreementEditor,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Inputs are locked while a parent action (e.g. saving elsewhere) is in progress. */
export const Disabled: Story = {
  args: { disabled: true },
};
