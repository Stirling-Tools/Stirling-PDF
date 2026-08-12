/**
 * The strip that sits under the desktop tool list inviting the user to sign in.
 * It exists for local (offline) mode only and renders nothing in the SaaS and
 * self-hosted modes, so it has a single appearance.
 *
 * The mode is answered by the desktop shell rather than by a prop; with no
 * shell to answer, the connection service settles on local — precisely the mode
 * this footer belongs to.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolPickerFooterExtensions } from "@app/components/tools/toolPicker/ToolPickerFooterExtensions";

const meta: Meta<typeof ToolPickerFooterExtensions> = {
  title: "Desktop/ToolPicker/FooterExtensions",
  component: ToolPickerFooterExtensions,
  parameters: { layout: "padded" },
  // The real footer spans the tool panel, where the message has to wrap around
  // a button that never shrinks.
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ToolPickerFooterExtensions>;

/** Offline, with the cloud tools still behind a sign-in. */
export const LocalMode: Story = {};
