import type { Meta, StoryObj } from "@storybook/react-vite";
import ApiKeySection from "@app/components/shared/config/configSections/apiKeys/ApiKeySection";
import "@app/components/shared/AppConfigModal.css";

/**
 * Card showing a public API key with copy and refresh actions. Rendered in a
 * `.modal-body`, since the card surface comes from the settings modal's CSS.
 */
const meta: Meta<typeof ApiKeySection> = {
  title: "Config/ApiKeySection",
  component: ApiKeySection,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div className="modal-body" style={{ background: "var(--c-bg)" }}>
        <S />
      </div>
    ),
  ],
  args: {
    publicKey: "demo-publishable-key-xxxx",
    copied: null,
    onCopy: () => {},
    onRefresh: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** After the copy button has been clicked, it shows a "Copied!" state. */
export const Copied: Story = {
  args: { copied: "public" },
};

/** The refresh button is disabled while a refresh is in progress. */
export const Disabled: Story = {
  args: { disabled: true },
};
