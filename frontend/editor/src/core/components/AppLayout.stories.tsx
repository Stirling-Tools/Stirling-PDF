import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppLayout } from "@app/components/AppLayout";
import { BannerProvider } from "@app/contexts/BannerContext";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";

const meta = {
  title: "Components/AppLayout",
  component: AppLayout,
  parameters: { layout: "fullscreen" },
  // AppLayout reads the active banner from BannerContext and renders
  // NavigationWarningModal + LoginAgreementModal, which need the navigation
  // guard (backed by the tool registry) mounted above them — matching the
  // provider nesting App.tsx sets up around AppLayout.
  decorators: [
    (Story) => (
      <ToolRegistryProvider>
        <NavigationProvider>
          <BannerProvider>
            <Story />
          </BannerProvider>
        </NavigationProvider>
      </ToolRegistryProvider>
    ),
  ],
} satisfies Meta<typeof AppLayout>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <div>App content</div>,
  },
};
