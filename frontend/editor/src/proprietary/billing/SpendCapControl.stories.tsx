import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpendCapControl } from "@app/billing/SpendCapControl";

/**
 * Setting a monthly spend ceiling. The estimate underneath translates the cap
 * into documents at the account's per-document rate, so the stories cover the
 * cases where that estimate cannot be drawn — no rate known, or no cap at all.
 *
 * The cap is driven by real state here: choosing a preset, typing a custom
 * amount and clearing back to no cap are the whole interaction.
 */
const meta: Meta<typeof SpendCapControl> = {
  title: "Proprietary/Billing/SpendCapControl",
  component: SpendCapControl,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof SpendCapControl>;

function Demo({
  initial = 50,
  ...rest
}: Partial<React.ComponentProps<typeof SpendCapControl>> & {
  initial?: number | null;
}) {
  const [capUsd, setCapUsd] = useState<number | null>(initial);
  return (
    <SpendCapControl
      capUsd={capUsd}
      onChange={setCapUsd}
      pricePerDocMinor={2}
      currency="USD"
      {...rest}
    />
  );
}

/** A preset selected, with the document estimate beneath. */
export const Default: Story = { render: () => <Demo /> };

/** No cap — spending is uncapped, so there is no estimate to draw. */
export const NoCap: Story = { render: () => <Demo initial={null} /> };

/** An amount outside the presets, entered by hand. */
export const CustomAmount: Story = { render: () => <Demo initial={175} /> };

/** No per-document rate known, so the estimate is withheld rather than
 *  guessed. */
export const RateUnknown: Story = {
  render: () => <Demo pricePerDocMinor={null} />,
};

/** A different currency symbol. */
export const NonUsdCurrency: Story = {
  render: () => <Demo currency="GBP" pricePerDocMinor={2} />,
};

/** A saved cap the user has since changed — the save action becomes
 *  meaningful only once the two differ. */
export const UnsavedChange: Story = {
  render: () => <Demo initial={200} savedCapUsd={50} onSave={async () => {}} />,
};

/** Inert while a request is in flight. */
export const Disabled: Story = { render: () => <Demo disabled /> };

/** With a supporting note, e.g. an admin-set restriction. */
export const WithNote: Story = {
  render: () => (
    <Demo note="Your administrator has set a hard ceiling of $500." />
  ),
};
