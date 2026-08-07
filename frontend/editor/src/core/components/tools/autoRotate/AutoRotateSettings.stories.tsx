import type { Meta, StoryObj } from "@storybook/react-vite";
import AutoRotateSettings from "@app/components/tools/autoRotate/AutoRotateSettings";
import {
  defaultParameters,
  validateAutoRotateParameters,
  type AutoRotateParameters,
} from "@app/hooks/tools/autoRotate/useAutoRotateParameters";
import { useStoryParameters } from "@app/components/tools/shared/storyParameters";

/** How pages are detected before rotation: `auto` tries embedded text first
 *  and falls back to OCR orientation detection; the other modes force one. */
const meta: Meta<typeof AutoRotateSettings> = {
  title: "Tools/AutoRotate/AutoRotateSettings",
  component: AutoRotateSettings,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AutoRotateSettings>;

function Demo({
  overrides,
  disabled,
}: {
  overrides?: Partial<AutoRotateParameters>;
  disabled?: boolean;
}) {
  const parameters = useStoryParameters<AutoRotateParameters>(
    { ...defaultParameters, ...overrides },
    { endpointName: "auto-rotate", validate: validateAutoRotateParameters },
  );
  return <AutoRotateSettings parameters={parameters} disabled={disabled} />;
}

/** Defaults: automatic detection, inference on. */
export const Default: Story = { render: () => <Demo /> };

/** Text-direction detection only — no OCR pass. */
export const TextOnly: Story = {
  render: () => <Demo overrides={{ detectionMode: "text" }} />,
};

/** OCR orientation detection only, where the pages carry no extractable text. */
export const OsdOnly: Story = {
  render: () => <Demo overrides={{ detectionMode: "osd" }} />,
};

/** A high confidence floor — only strongly-detected pages get corrected. */
export const StrictConfidence: Story = {
  render: () => <Demo overrides={{ confidenceThreshold: 85 }} />,
};

/** Undetected pages left alone rather than taking the document consensus. */
export const InferenceOff: Story = {
  render: () => <Demo overrides={{ inferUndetected: false }} />,
};

/** Inert while the tool is running. */
export const Disabled: Story = { render: () => <Demo disabled /> };
