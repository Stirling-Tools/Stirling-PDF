/**
 * Lazy wrapper around the settings modal: it renders nothing until opened, so
 * the heavy config bundle is only fetched when someone asks for settings.
 *
 * Sections come from the build's registry, and hosts can add their own or hide
 * ones they cannot run.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import AppConfigModalLazy from "@app/components/shared/AppConfigModalLazy";

const meta: Meta<typeof AppConfigModalLazy> = {
  title: "Shared/AppConfigModalLazy",
  component: AppConfigModalLazy,
  parameters: { layout: "fullscreen" },
  args: { opened: false, onClose: () => {}, urlSync: false },
};
export default meta;

type Story = StoryObj<typeof AppConfigModalLazy>;

/** Closed, which is the state it spends nearly all its life in. */
export const Closed: Story = {};

export const Opened: Story = { args: { opened: true } };

/** A host that cannot run a registry section drops it by key. */
export const WithHiddenSection: Story = {
  args: { opened: true, hiddenSectionKeys: ["about"] as never },
};
