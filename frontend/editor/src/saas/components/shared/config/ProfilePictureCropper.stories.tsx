/**
 * The square-crop step between choosing a profile picture and uploading it.
 * What it shows is decided by the file handed to it: with one, the picture sits
 * under a draggable crop frame with a zoom slider; without one, the frame is
 * empty. Its remaining states — the "processing" button and the error banner —
 * belong to a crop already in progress and cannot be posed from props.
 *
 * Mantine renders the modal into a portal outside the story canvas.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProfilePictureCropper } from "@app/components/shared/config/ProfilePictureCropper";

/**
 * A landscape picture, so the square frame has something to crop away on both
 * sides. Drawn rather than fetched to keep every render identical.
 */
const SAMPLE_PICTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">
  <rect width="480" height="320" fill="#1f3a5f"/> <!-- theme-allow-color sample photo, not themed UI -->
  <circle cx="240" cy="130" r="70" fill="#f2d0a4"/> <!-- theme-allow-color -->
  <path d="M240 215c-80 0-130 45-130 105h260c0-60-50-105-130-105z" fill="#e07a5f"/> <!-- theme-allow-color -->
</svg>`;

const samplePicture = new File([SAMPLE_PICTURE], "portrait.svg", {
  type: "image/svg+xml",
});

const meta: Meta<typeof ProfilePictureCropper> = {
  title: "SaaS/Config/ProfilePictureCropper",
  component: ProfilePictureCropper,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    file: samplePicture,
    onClose: () => {},
    onCropComplete: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof ProfilePictureCropper>;

/** The usual case: a chosen picture, framed and ready to adjust. */
export const WithPicture: Story = {};

/** No picture to work on, which leaves the frame blank but the controls live. */
export const WithoutPicture: Story = { args: { file: null } };
