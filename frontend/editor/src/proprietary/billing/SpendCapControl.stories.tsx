import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpendCapControl, type SpendCapControlProps } from "@app/billing";
import "@portal/components/billing/billing.css";

/**
 * The monthly spend-cap editor shared by the editor's cloud surface and the
 * admin portal: preset chips, a custom-amount pill, a "no cap" chip and an
 * optional inline Save.
 *
 * The control is fully controlled, so the states below differ by what the cap
 * currently is and by which optional affordances the host asked for:
 *   - a cap matching a preset selects that chip;
 *   - any other number activates the custom pill instead;
 *   - null is the no-cap state, which drops the estimate and adds an explainer;
 *   - passing `onSave` adds the Save button, enabled only once the cap differs
 *     from the persisted `savedCapUsd`.
 *
 * Copy is injected by the host (the editor passes i18n strings, the portal
 * passes literals), so these render the built-in English defaults. The `scc-*`
 * styling likewise belongs to each host — the portal's billing stylesheet here.
 */
const PRICE_PER_DOC_MINOR = 2;

/**
 * Holds the cap locally so the chips, custom field and Save button behave as
 * they do in a host that owns the value.
 */
function ControlledCap({
  initialCap,
  ...rest
}: { initialCap: number | null } & Omit<
  SpendCapControlProps,
  "capUsd" | "onChange"
>) {
  const [cap, setCap] = useState<number | null>(initialCap);
  return <SpendCapControl {...rest} capUsd={cap} onChange={setCap} />;
}

const meta: Meta<typeof SpendCapControl> = {
  title: "Portal/Billing/SpendCapControl",
  component: SpendCapControl,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "44rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SpendCapControl>;

/** A cap on one of the presets: that chip is selected and drives the estimate. */
export const PresetSelected: Story = {
  render: () => (
    <ControlledCap initialCap={500} pricePerDocMinor={PRICE_PER_DOC_MINOR} />
  ),
};

/** An amount outside the presets moves the selection into the custom pill. */
export const CustomAmount: Story = {
  render: () => (
    <ControlledCap initialCap={1234} pricePerDocMinor={PRICE_PER_DOC_MINOR} />
  ),
};

/** No cap: nothing to estimate against, and the uncapped-billing note appears. */
export const NoCap: Story = {
  render: () => (
    <ControlledCap initialCap={null} pricePerDocMinor={PRICE_PER_DOC_MINOR} />
  ),
};

/**
 * Hosts that persist the cap pass `onSave`, which adds the Save button. It stays
 * disabled until the chosen cap differs from the saved one — shown here already
 * dirty (saved 250, selected 1,000).
 */
export const WithSaveButton: Story = {
  render: () => (
    <ControlledCap
      initialCap={1000}
      savedCapUsd={250}
      onSave={async () => {}}
      pricePerDocMinor={PRICE_PER_DOC_MINOR}
      note="Changes apply from the next billing period."
    />
  ),
};

/** Every control is inert while the host has an operation in flight. */
export const Disabled: Story = {
  render: () => (
    <ControlledCap
      initialCap={500}
      disabled
      onSave={async () => {}}
      savedCapUsd={250}
      pricePerDocMinor={PRICE_PER_DOC_MINOR}
    />
  ),
};
