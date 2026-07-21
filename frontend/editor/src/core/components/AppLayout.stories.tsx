import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppLayout } from "@app/components/AppLayout";
import { BannerProvider, useBanner } from "@app/contexts/BannerContext";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { InfoBanner } from "@app/components/shared/InfoBanner";

const meta = {
  title: "Components/AppLayout",
  component: AppLayout,
  parameters: { layout: "fullscreen" },
  // AppLayout reads the active banner from BannerContext and renders
  // NavigationWarningModal + LoginAgreementModal, which need the navigation
  // guard (backed by the tool registry) mounted above them.
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

const sampleContent = (
  <div style={{ padding: 24 }}>
    <h1>Workbench</h1>
    <p>Tool panels and file previews render in this area.</p>
  </div>
);

export const Default: Story = {
  args: {
    children: sampleContent,
  },
};

// Calls BannerContext's setBanner on mount so the story can exercise
// AppLayout's height-adjustment behaviour (the child area shrinks to make
// room for the banner) without adding a banner prop to AppLayout itself.
function BannerSetter() {
  const { setBanner } = useBanner();
  useEffect(() => {
    setBanner(
      <InfoBanner
        icon="info-rounded"
        title="Heads up"
        message="This workspace is running in offline mode."
      />,
    );
    return () => setBanner(null);
  }, [setBanner]);
  return null;
}

export const WithBanner: Story = {
  args: {
    children: sampleContent,
  },
  decorators: [
    (Story) => (
      <>
        <BannerSetter />
        <Story />
      </>
    ),
  ],
};
