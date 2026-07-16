import type { Meta, StoryObj } from "@storybook/react-vite";
import LandingPage from "@app/components/shared/LandingPage";
import { AppProviders } from "@app/components/AppProviders";

// LandingPage reads useFileHandler()/useFilesModalContext()/useAppConfig()
// indirectly through LandingActions and FilesModalContext, all only available
// inside the full provider tree — mount that here with the network fetch and
// blocking loading gate disabled so the story renders immediately.
function LandingPageDemo({
  enableMobileScanner,
}: {
  enableMobileScanner?: boolean;
}) {
  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: { enableMobileScanner },
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <div style={{ height: "32rem" }}>
        <LandingPage />
      </div>
    </AppProviders>
  );
}

const meta = {
  title: "Shared/LandingPage",
  component: LandingPage,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LandingPage>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <LandingPageDemo />,
};

export const WithMobileScanner: Story = {
  render: () => <LandingPageDemo enableMobileScanner />,
};
