import type { StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openMenu,
  type PlayContext,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { FIXTURES } from "@editor/components/tools/toolPanelStory/fixtures";
import type { SavedSignature } from "@editor/types/signature";

/** Must match STORAGE_KEY in the SaaS signatureStorageService. */
const BROWSER_LIBRARY_KEY = "stirling:saved-signatures:v1";

const browserSignature = (id: string, label: string): SavedSignature => ({
  id,
  type: "image",
  dataUrl: FIXTURES["sample.png"].url,
  label,
  scope: "localStorage",
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
});

function forgetBrowserLibrary() {
  window.localStorage.removeItem(BROWSER_LIBRARY_KEY);
}

/**
 * Sign as SaaS shows it: saved signatures live in this browser, so there is no
 * server library, nothing shared with the team and nothing an admin manages.
 */
const meta = {
  title: "Tools/Sign/SaaS",
  ...toolPanelMeta("sign"),
  beforeEach: () => {
    window.localStorage.setItem(
      BROWSER_LIBRARY_KEY,
      JSON.stringify([
        browserSignature("browser-1", "My signature"),
        browserSignature("browser-2", "Initials"),
      ]),
    );
    return forgetBrowserLibrary;
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

async function openSignatureMenu(context: PlayContext, label: string) {
  await waitForPanelText(context, label);
  return within(await openMenu(context, `Options for ${label}`));
}

export const BrowserSignatures: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, "My signature");
    await panel.findByText("Initials");
  },
};

export const BrowserSignatureMenu: Story = {
  play: async (context) => {
    const menu = await openSignatureMenu(context, "My signature");
    await menu.findByRole("menuitem", { name: "Rename" });
    await expect(
      menu.queryByRole("menuitem", { name: "Share with everyone" }),
    ).toBeNull();
  },
};
