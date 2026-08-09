/**
 * The cloud build's spend cap: a thin wrapper that supplies translated labels
 * to the shared control. Stories cover the states the wrapper can produce —
 * a preset cap, a custom amount, no cap at all, and the save affordance.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import SpendCapControl from "@app/components/shared/config/configSections/SpendCapControl";

const meta: Meta<typeof SpendCapControl> = {
  title: "Cloud/SpendCapControl",
  component: SpendCapControl,
  parameters: { layout: "padded" },
  args: {
    capUsd: null,
    onChange: () => {},
    pricePerDocMinor: 2,
    currency: "USD",
  },
};
export default meta;

type Story = StoryObj<typeof SpendCapControl>;

/** No cap set — spending is unlimited. */
export const NoCap: Story = {};

/** A preset amount, with the document estimate derived from the per-doc rate. */
export const PresetCap: Story = { args: { capUsd: 50 } };

/** An amount off the preset list, which selects the custom field instead. */
export const CustomAmount: Story = { args: { capUsd: 37 } };

/** Without a known per-document rate the estimate cannot be shown. */
export const NoRateKnown: Story = {
  args: { capUsd: 50, pricePerDocMinor: null },
};

/** With a save handler the control gains its confirm button. */
export const WithSave: Story = {
  args: { capUsd: 50, savedCapUsd: 25, onSave: () => {} },
};

/** Already saved at this value, so there is nothing to confirm. */
export const Unchanged: Story = {
  args: { capUsd: 50, savedCapUsd: 50, onSave: () => {} },
};

/** A note beneath the control, used for plan-specific caveats. */
export const WithNote: Story = {
  args: { capUsd: 50, note: "Caps reset on the first of each month." },
};
