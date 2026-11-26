import type { StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openTooltip,
  runToResults,
  toggle,
  typeInto,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Flatten/Panel",
  ...toolPanelMeta("flatten", { files: ["form-fields-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const FORMS_ONLY = /^Flatten only forms/;
const RENDERING_DPI = /^Rendering DPI/;

export const Panel: Story = {
  play: async (context) => {
    await expect(
      await findEnabled(context, "checkbox", FORMS_ONLY),
    ).not.toBeChecked();
    await expect(
      await findEnabled(context, "textbox", RENDERING_DPI),
    ).toBeVisible();
  },
};

export const RenderingDpiEntered: Story = {
  play: async (context) => {
    const dpi = await typeInto(context, RENDERING_DPI, "300");
    await waitFor(() => expect(dpi).toHaveValue("300"));
  },
};

export const FormsOnly: Story = {
  play: async (context) => {
    const panel = await toggle(context, "checkbox", FORMS_ONLY);
    await waitFor(() =>
      expect(panel.queryByRole("textbox", { name: RENDERING_DPI })).toBeNull(),
    );
  },
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const FlattenOnlyFormsTooltip: Story = {
  play: openTooltip({ info: /^Only flatten form fields/ }),
};

export const RenderingDpiTooltip: Story = {
  play: openTooltip({
    info: /^Optional\. Leave blank to use the system default/,
  }),
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/misc/flatten", "sample.pdf"),
  ),
  play: runToResults,
};
