/**
 * The banner that drops into the corner of the viewer when the open PDF turns
 * out to have fillable fields.
 *
 * It is a prompt, not a panel: it appears only when the document has fields the
 * user could fill (signature and button fields do not count), they are finished
 * loading, the form-fill tool is not already open with its own save controls,
 * and the user has not dismissed it. Until something is actually typed it just
 * announces the form; editing a value adds the unsaved badge and the two ways
 * out — apply the changes back into the viewer, or download the filled copy.
 * The download is held while an export policy is running against the file.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormSaveBar } from "@app/tools/formFill/FormSaveBar";
import { STORY_PDF, withFormFill } from "@app/tools/formFill/storyFixtures";

const meta: Meta<typeof FormSaveBar> = {
  title: "Tools/FormFill/FormSaveBar",
  component: FormSaveBar,
  parameters: { layout: "fullscreen" },
  args: {
    file: STORY_PDF,
    isFormFillToolActive: false,
    onApply: async () => {},
  },
  decorators: [
    withFormFill(),
    (Story) => (
      // The bar pins itself to the top-right of the viewport it sits in.
      <div style={{ position: "relative", height: "60vh" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FormSaveBar>;

/** Fields found, nothing typed yet. */
export const Default: Story = {};

/** A value has been edited, so the save actions appear. */
export const UnsavedChanges: Story = {
  decorators: [withFormFill({ filled: { fullName: "Jordan Blake" } })],
};

/** A policy is running against the file, so it cannot leave the app yet. */
export const DownloadBlockedByPolicy: Story = {
  args: { policyEnforcing: true },
  decorators: [withFormFill({ filled: { fullName: "Jordan Blake" } })],
};

/** The form-fill tool is open and owns saving, so the bar stays away. */
export const HiddenWhileToolOpen: Story = {
  args: { isFormFillToolActive: true },
};
