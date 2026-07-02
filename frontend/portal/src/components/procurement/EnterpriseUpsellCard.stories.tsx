import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { EnterpriseUpsellCard } from "@portal/components/procurement/EnterpriseUpsellCard";

/** The enterprise on-ramp CTAs — the Home ("Start Trial") and Usage ("Build your quote") variants. */
const meta: Meta<typeof EnterpriseUpsellCard> = {
  title: "Portal/Procurement/EnterpriseUpsellCard",
  component: EnterpriseUpsellCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof EnterpriseUpsellCard>;

export const Home: Story = { args: { variant: "home" } };
export const Usage: Story = { args: { variant: "usage" } };
