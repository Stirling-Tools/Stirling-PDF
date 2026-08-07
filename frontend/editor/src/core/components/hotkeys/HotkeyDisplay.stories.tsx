import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  HotkeyContext,
  type HotkeyContextValue,
} from "@app/contexts/HotkeyContext";
import { HotkeyDisplay } from "@app/components/hotkeys/HotkeyDisplay";
import { getDisplayParts } from "@app/utils/hotkeys";

/** A keyboard shortcut rendered as key caps.
 *
 *  HotkeyProvider pulls in the whole tool-workflow chain, but the display only
 *  needs one function off the context — so the stories supply that slice, using
 *  the real formatter so the caps render exactly as they do in the app. Pinned
 *  to the non-mac glyphs to keep the stories stable across machines. */
const withHotkeys = (Story: React.ComponentType) => (
  <HotkeyContext.Provider
    value={
      {
        getDisplayParts: (binding) => getDisplayParts(binding, false),
      } as HotkeyContextValue
    }
  >
    <Story />
  </HotkeyContext.Provider>
);

const meta: Meta<typeof HotkeyDisplay> = {
  title: "Hotkeys/HotkeyDisplay",
  component: HotkeyDisplay,
  parameters: { layout: "centered" },
  decorators: [withHotkeys],
};
export default meta;

type Story = StoryObj<typeof HotkeyDisplay>;

/** A single key. */
export const SingleKey: Story = { args: { binding: { code: "KeyS" } } };

/** The common save shortcut. */
export const WithModifier: Story = {
  args: { binding: { code: "KeyS", ctrl: true } },
};

/** Several modifiers at once. */
export const MultipleModifiers: Story = {
  args: { binding: { code: "KeyP", ctrl: true, shift: true, alt: true } },
};

/** The macOS command modifier. */
export const MetaModifier: Story = {
  args: { binding: { code: "KeyK", meta: true } },
};

/** A non-letter key, which renders its own glyph rather than a letter. */
export const ArrowKey: Story = { args: { binding: { code: "ArrowRight" } } };

/** Both sizes side by side. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <HotkeyDisplay binding={{ code: "KeyS", ctrl: true }} size="sm" />
      <HotkeyDisplay binding={{ code: "KeyS", ctrl: true }} size="md" />
    </div>
  ),
};

/** Muted, for a shortcut shown beside a disabled action. */
export const Muted: Story = {
  args: { binding: { code: "KeyS", ctrl: true }, muted: true },
};

/** No binding assigned — the component renders nothing rather than an empty
 *  cap, so an unbound action shows no stray chrome. */
export const Unbound: Story = { args: { binding: null } };
