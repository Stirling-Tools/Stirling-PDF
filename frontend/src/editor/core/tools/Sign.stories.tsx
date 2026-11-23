import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  appConfig,
  onViewer,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  findEnabled,
  openMenu,
  openTooltip,
  panelOf,
  placeAndUndo,
  placeOnPage,
  type PlayContext,
  STAGE_TIMEOUT,
  untilPanelShows,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { FIXTURES } from "@editor/components/tools/toolPanelStory/fixtures";
import type { SavedSignature } from "@editor/types/signature";
import type { SignRequestSummary } from "@editor/types/signingSession";

const meta = {
  title: "Tools/Sign/Panel",
  ...toolPanelMeta("sign"),
  // A default signature arms itself when the panel opens, so one a story sets
  // must not reach the next.
  beforeEach: () => {
    forgetDefaultSignature();
    return forgetDefaultSignature;
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

const SIGNATURE_IMAGE = FIXTURES["sample.png"].url;

const saved = (
  id: string,
  label: string,
  scope: SavedSignature["scope"],
  type: "canvas" | "image" = "image",
): SavedSignature => ({
  id,
  type,
  dataUrl: SIGNATURE_IMAGE,
  label,
  scope,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
});

const SAVED_SIGNATURES: SavedSignature[] = [
  saved("personal-1", "My signature", "personal", "canvas"),
  saved("personal-2", "Initials", "personal"),
  saved("shared-1", "Company stamp", "shared"),
];

const PENDING_REQUEST: SignRequestSummary = {
  sessionId: "session-1",
  documentName: "contract.pdf",
  ownerUsername: "owner",
  createdAt: "2026-01-01T00:00:00Z",
  dueDate: "2026-12-31T00:00:00Z",
  myStatus: "PENDING",
};

/** Must match the storage key in useDefaultSignature. */
const DEFAULT_SIGNATURE_KEY = "stirling:sign:default-signature-id";

function forgetDefaultSignature() {
  try {
    window.localStorage.removeItem(DEFAULT_SIGNATURE_KEY);
  } catch {
    return;
  }
}

function signaturesResponse(signatures: SavedSignature[]) {
  return http.get("*/api/v1/proprietary/signatures", () =>
    HttpResponse.json(signatures),
  );
}

/**
 * Stories reading the server's signature library. SaaS keeps signatures in the
 * browser instead, which Tools/Sign/SaaS shows.
 */
const SERVER_LIBRARY = ["not-in-saas"];

const noSavedSignatures = toolPanelServer(signaturesResponse([]));
const savedSignatures = toolPanelServer(signaturesResponse(SAVED_SIGNATURES));
const savedSignaturesAsAdmin = toolPanelServer(
  signaturesResponse(SAVED_SIGNATURES),
  appConfig({ isAdmin: true }),
);
const viewer = onViewer();
const savedSignaturesOnViewer = {
  ...viewer,
  parameters: { ...savedSignatures, ...viewer.parameters },
} as const;
const phoneSignatures = toolPanelServer(
  signaturesResponse([]),
  appConfig({ enableMobileSignature: true }),
);

async function startNewSignature(context: PlayContext, method: string) {
  await waitForPanelText(context, "Add your signature");
  await userEvent.click(await findEnabled(context, "button", method));
  return within(
    await bodyOf(context).findByRole(
      "dialog",
      { name: /New signature/ },
      STAGE_TIMEOUT,
    ),
  );
}

async function createUnsavedSignature(context: PlayContext) {
  const dialog = await startNewSignature(context, "Type");
  await userEvent.type(dialog.getByLabelText("Your name"), "Jane Signer");
  await userEvent.click(
    dialog.getByRole("checkbox", { name: /Save to my signatures/ }),
  );
  const use = dialog.getByRole("button", { name: "Use signature" });
  await waitFor(() => expect(use).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(use);
  return waitForPanelText(context, "Unsaved");
}

async function openSignatureMenu(context: PlayContext, label: string) {
  await waitForPanelText(context, label);
  return within(await openMenu(context, `Options for ${label}`));
}

async function chooseFromSignatureMenu(
  context: PlayContext,
  label: string,
  action: string,
) {
  const menu = await openSignatureMenu(context, label);
  await userEvent.click(menu.getByRole("menuitem", { name: action }));
}

async function armSignature(context: PlayContext) {
  await waitForPanelText(context, "My signature");
  await userEvent.click(await findEnabled(context, "button", "My signature"));
  return waitForPanelText(context, "Click the page to place My signature.");
}

async function placeSignature(context: PlayContext) {
  const panel = await placeOnPage(context, armSignature);
  await panel.findByText("On this document (1)", undefined, STAGE_TIMEOUT);
  return panel;
}

async function placeAndUndoSignature(context: PlayContext) {
  return placeAndUndo(context, armSignature);
}

export const Panel: Story = {
  parameters: noSavedSignatures,
  play: untilPanelShows("Add your signature"),
};

export const NoFiles: Story = {
  args: { files: [] },
  parameters: noSavedSignatures,
};

export const PhoneSignature: Story = {
  parameters: phoneSignatures,
  play: async (context) => {
    const panel = await waitForPanelText(context, "Add your signature");
    await panel.findByRole("button", { name: "Phone" }, STAGE_TIMEOUT);
  },
};

export const DrawNewSignature: Story = {
  parameters: noSavedSignatures,
  play: async (context) => {
    await startNewSignature(context, "Draw");
  },
};

export const TypeNewSignature: Story = {
  parameters: noSavedSignatures,
  play: async (context) => {
    await startNewSignature(context, "Type");
  },
};

export const UploadNewSignature: Story = {
  parameters: noSavedSignatures,
  play: async (context) => {
    await startNewSignature(context, "Upload");
  },
};

export const PhoneNewSignature: Story = {
  parameters: phoneSignatures,
  play: async (context) => {
    await startNewSignature(context, "Phone");
  },
};

export const UnsavedSignature: Story = {
  parameters: noSavedSignatures,
  play: createUnsavedSignature,
};

export const UnsavedSignatureMenu: Story = {
  parameters: noSavedSignatures,
  play: async (context) => {
    await createUnsavedSignature(context);
    const menu = await openSignatureMenu(context, "Typed signature");
    await menu.findByRole("menuitem", { name: "Save to my signatures" });
  },
};

export const DraftExistsWarning: Story = {
  parameters: noSavedSignatures,
  play: async (context) => {
    await createUnsavedSignature(context);
    await userEvent.click(
      await findEnabled(context, "button", "New signature"),
    );
    await bodyOf(context).findByText(
      "Save or discard your unsaved signature first",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const LibraryFull: Story = {
  tags: SERVER_LIBRARY,
  parameters: toolPanelServer(
    signaturesResponse(
      Array.from({ length: 20 }, (_, index) =>
        saved(`personal-${index + 1}`, `Signature ${index + 1}`, "personal"),
      ),
    ),
  ),
  play: untilPanelShows("20 of 20"),
};

export const SavedSignatures: Story = {
  parameters: savedSignatures,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    const panel = await waitForPanelText(context, "Company stamp");
    await panel.findByText("Pick a signature to place it");
    await panel.findByText("On this document (0)");
  },
};

export const NewSignature: Story = {
  parameters: savedSignatures,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await waitForPanelText(context, "Company stamp");
    await userEvent.click(
      await findEnabled(context, "button", "New signature"),
    );
    await bodyOf(context).findByRole(
      "dialog",
      { name: /New signature/ },
      STAGE_TIMEOUT,
    );
  },
};

export const SignatureMenu: Story = {
  parameters: savedSignatures,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    const menu = await openSignatureMenu(context, "My signature");
    await menu.findByRole("menuitem", { name: "Rename" });
  },
};

export const SharedSignatureMenu: Story = {
  parameters: savedSignatures,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    const menu = await openSignatureMenu(context, "Company stamp");
    await expect(menu.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  },
};

export const AdminSignatureMenu: Story = {
  parameters: savedSignaturesAsAdmin,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    const menu = await openSignatureMenu(context, "My signature");
    await menu.findByRole(
      "menuitem",
      { name: "Share with everyone" },
      STAGE_TIMEOUT,
    );
  },
};

export const AdminSharedSignatureMenu: Story = {
  parameters: savedSignaturesAsAdmin,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    const menu = await openSignatureMenu(context, "Company stamp");
    await menu.findByRole("menuitem", { name: "Delete" }, STAGE_TIMEOUT);
  },
};

export const RenameSignature: Story = {
  parameters: savedSignatures,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await chooseFromSignatureMenu(context, "My signature", "Rename");
    await bodyOf(context).findByRole("dialog", {}, STAGE_TIMEOUT);
  },
};

export const DeleteSignature: Story = {
  parameters: savedSignatures,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await chooseFromSignatureMenu(context, "My signature", "Delete");
    await bodyOf(context).findByRole("dialog", {}, STAGE_TIMEOUT);
  },
};

export const DefaultSignature: Story = {
  parameters: savedSignatures,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await chooseFromSignatureMenu(context, "Initials", "Make default");
    const panel = await panelOf(context);
    await panel.findByTitle("Default", undefined, STAGE_TIMEOUT);
  },
};

export const DefaultSignatureArmed: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  beforeEach: () => {
    window.localStorage.setItem(DEFAULT_SIGNATURE_KEY, "personal-2");
  },
  play: untilPanelShows("Click the page to place Initials."),
};

export const PlacingSignature: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: armSignature,
};

export const PlacingSignatureMenu: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await armSignature(context);
    const menu = await openSignatureMenu(context, "My signature");
    await menu.findByRole("menuitem", { name: "Stop placing" });
  },
};

export const PlacementStopped: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await armSignature(context);
    await userEvent.click(await findEnabled(context, "button", "Stop"));
    await waitForPanelText(context, "Pick a signature to place it");
  },
};

export const SignaturePlaced: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await placeSignature(context);
    await findEnabled(context, "button", "Apply 1 signature");
  },
};

export const PlacementUndone: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: placeAndUndoSignature,
};

export const PlacedSignatureRemoved: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: async (context) => {
    await placeSignature(context);
    await userEvent.click(await findEnabled(context, "button", /^Remove /));
    await waitForPanelText(context, "On this document (0)");
  },
};

export const UndoTooltip: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: openTooltip({ info: "Undo" }, { after: placeSignature }),
};

export const RedoTooltip: Story = {
  ...savedSignaturesOnViewer,
  tags: SERVER_LIBRARY,
  play: openTooltip({ info: "Redo" }, { after: placeAndUndoSignature }),
};

/** Group signing needs a signed-in self-hosted server on desktop. */
export const RequestSignatures: Story = {
  tags: ["not-in-desktop"],
  parameters: toolPanelServer(
    signaturesResponse([]),
    appConfig({ storageGroupSigningEnabled: true }),
    http.get("*/api/v1/security/cert-sign/sign-requests", () =>
      HttpResponse.json([PENDING_REQUEST]),
    ),
    http.get("*/api/v1/security/cert-sign/sessions", () =>
      HttpResponse.json([]),
    ),
  ),
  play: async (context) => {
    const panel = await waitForPanelText(context, "Open shared signing");
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: /Open shared signing/ }),
        ).toHaveTextContent("1"),
      STAGE_TIMEOUT,
    );
  },
};
