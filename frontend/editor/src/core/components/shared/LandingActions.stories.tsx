import { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LandingActions } from "@app/components/shared/LandingActions";
import { AppProviders } from "@app/components/AppProviders";

// LandingActions reads openFilesModal from FilesModalContext and enableMobileScanner
// from AppConfigContext, both only available inside the full provider tree — mount
// that here with the network fetch + blocking gate disabled so the story renders
// immediately. fileInputRef also needs a real ref, so args are supplied via render.
function LandingActionsDemo({
  enableMobileScanner,
}: {
  enableMobileScanner?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: { enableMobileScanner },
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <LandingActions
        fileInputRef={fileInputRef}
        onUploadClick={fn()}
        onMobileUploadClick={fn()}
        onFileSelect={fn()}
      />
    </AppProviders>
  );
}

const meta = {
  title: "Shared/LandingActions",
  component: LandingActions,
  parameters: { layout: "padded" },
  // Required props are only ever supplied via the per-story render wrappers
  // below (fileInputRef needs a real ref), but Storybook's types still
  // require meta-level args to satisfy the component's required props.
  args: {
    fileInputRef: { current: null },
    onUploadClick: fn(),
    onMobileUploadClick: fn(),
    onFileSelect: fn(),
  },
} satisfies Meta<typeof LandingActions>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <LandingActionsDemo />,
};

export const WithMobileScanner: Story = {
  render: () => <LandingActionsDemo enableMobileScanner />,
};
