import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import OverlayPdfsSettings from "@app/components/tools/overlayPdfs/OverlayPdfsSettings";
import { AppProviders } from "@app/components/AppProviders";
import { type OverlayPdfsParameters } from "@app/hooks/tools/overlayPdfs/useOverlayPdfsParameters";

const makeFile = (name: string, sizeBytes: number): File =>
  new File([new Uint8Array(sizeBytes)], name);

// OverlayPdfsSettings calls useFilesModalContext() unconditionally (to wire up
// the "Choose PDF(s)..." button), which only resolves inside the full provider
// tree — mount that here with the network fetch and blocking loading gate
// disabled so the story renders immediately.
const OverlayPdfsSettingsDemo = (props: {
  initialParameters: OverlayPdfsParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<OverlayPdfsParameters>(
    props.initialParameters,
  );

  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: {},
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <OverlayPdfsSettings
        parameters={parameters}
        onParameterChange={(key, value) =>
          setParameters((prev) => ({ ...prev, [key]: value }))
        }
        disabled={props.disabled}
      />
    </AppProviders>
  );
};

const meta = {
  title: "Tools/OverlayPdfs/OverlayPdfsSettings",
  component: OverlayPdfsSettings,
  args: {
    parameters: {
      overlayFiles: [],
      overlayMode: "SequentialOverlay",
      overlayPosition: 0,
      counts: [],
    },
    onParameterChange: () => {},
  },
} satisfies Meta<typeof OverlayPdfsSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <OverlayPdfsSettingsDemo
      initialParameters={{
        overlayFiles: [],
        overlayMode: "SequentialOverlay",
        overlayPosition: 0,
        counts: [],
      }}
    />
  ),
};

export const WithOverlayFiles: Story = {
  render: () => (
    <OverlayPdfsSettingsDemo
      initialParameters={{
        overlayFiles: [
          makeFile("cover-page.pdf", 24_576),
          makeFile("watermark.pdf", 8_192),
        ],
        overlayMode: "InterleavedOverlay",
        overlayPosition: 1,
        counts: [],
      }}
    />
  ),
};

export const FixedRepeatWithCounts: Story = {
  render: () => (
    <OverlayPdfsSettingsDemo
      initialParameters={{
        overlayFiles: [
          makeFile("stamp.pdf", 4_096),
          makeFile("signature.pdf", 2_048),
        ],
        overlayMode: "FixedRepeatOverlay",
        overlayPosition: 0,
        counts: [3, 1],
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <OverlayPdfsSettingsDemo
      initialParameters={{
        overlayFiles: [makeFile("cover-page.pdf", 24_576)],
        overlayMode: "SequentialOverlay",
        overlayPosition: 0,
        counts: [],
      }}
      disabled
    />
  ),
};
