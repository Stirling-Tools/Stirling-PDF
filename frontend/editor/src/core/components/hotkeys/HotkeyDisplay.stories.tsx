import type { Meta, StoryObj } from "@storybook/react-vite";
import { HotkeyDisplay } from "@app/components/hotkeys/HotkeyDisplay";
import type { HotkeyBinding } from "@app/utils/hotkeys";
import { AppProviders } from "@app/components/AppProviders";

const binding: HotkeyBinding = {
  code: "Digit1",
  alt: true,
  ctrl: true,
};

const meta = {
  title: "Hotkeys/HotkeyDisplay",
  component: HotkeyDisplay,
  // HotkeyDisplay reads getDisplayParts from HotkeyContext, which is only
  // available inside the full provider tree — mount that here with the
  // network fetch + blocking gate disabled so the story renders immediately.
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <Story />
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof HotkeyDisplay>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    binding,
  },
};

export const Medium: Story = {
  args: {
    binding,
    size: "md",
  },
};

export const Muted: Story = {
  args: {
    binding,
    muted: true,
  },
};

export const NoBinding: Story = {
  args: {
    binding: null,
  },
};
