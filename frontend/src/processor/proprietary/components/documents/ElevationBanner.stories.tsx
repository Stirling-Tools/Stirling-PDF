import type { Meta, StoryObj } from "@storybook/react-vite";
import { ElevationBanner } from "@portal/components/documents/ElevationBanner";
import { ELEVATION_WINDOW_SECONDS } from "@portal/components/documents/format";
import "@portal/views/Documents.css";

const meta: Meta<typeof ElevationBanner> = {
  title: "Portal/Documents/ElevationBanner",
  component: ElevationBanner,
  parameters: { layout: "padded" },
  args: { secondsLeft: null, fourEyes: false, onRequest: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "40rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ElevationBanner>;

/** No grant yet — offers the request affordance. */
export const Locked: Story = {};

/** No grant, enterprise four-eyes note. */
export const LockedFourEyes: Story = {
  args: { fourEyes: true },
};

/** Active grant counting down. */
export const Granted: Story = {
  args: { secondsLeft: ELEVATION_WINDOW_SECONDS - 1 },
};

export const GrantedFourEyes: Story = {
  args: { secondsLeft: ELEVATION_WINDOW_SECONDS - 1, fourEyes: true },
};
