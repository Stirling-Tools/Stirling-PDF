import type { Meta, StoryObj } from "@storybook/react-vite";
import { accessFor } from "@portal/mocks/users";
import { AccessControls } from "@portal/components/users/AccessControls";

const meta: Meta<typeof AccessControls> = {
  title: "Portal/Users/AccessControls",
  component: AccessControls,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof AccessControls>;

/** Free: seat limit + upgrade nudge only. */
export const Free: Story = {
  args: { access: accessFor("free") },
};

/** Pro: adds self-service MFA + session toggles. */
export const Pro: Story = {
  args: { access: accessFor("pro") },
};

/** Enterprise: SSO/SAML, SCIM provisioning and enforced MFA. */
export const Enterprise: Story = {
  args: { access: accessFor("enterprise") },
};
