import type { Meta, StoryObj } from "@storybook/react-vite";
import ThirdPartyLicensesSection, {
  FrontendThirdPartyLicensesSection,
} from "@app/components/shared/config/configSections/ThirdPartyLicensesSection";

const meta = {
  title: "Shared/Config/ConfigSections/ThirdPartyLicensesSection",
  component: ThirdPartyLicensesSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ThirdPartyLicensesSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Frontend: Story = {
  render: () => <FrontendThirdPartyLicensesSection />,
};
