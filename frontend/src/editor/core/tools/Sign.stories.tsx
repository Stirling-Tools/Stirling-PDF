import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  appConfig,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  placeOnPage,
  type PlayContext,
  STAGE_TIMEOUT,
  undoInPanel,
  untilPanelShows,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { FIXTURES } from "@editor/components/tools/toolPanelStory/fixtures";
import type { SavedSignature } from "@editor/types/signature";
import type { SignRequestSummary } from "@editor/types/signingSession";

const meta = {
  title: "Tools/Sign/Panel",
  ...toolPanelMeta("sign"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const SIGNATURE_IMAGE = FIXTURES["sample.png"].url;

const SAVED_SIGNATURES: SavedSignature[] = [
  {
    id: "personal-1",
    type: "canvas",
    dataUrl: SIGNATURE_IMAGE,
    label: "My signature",
    scope: "personal",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: "personal-2",
    type: "image",
    dataUrl: SIGNATURE_IMAGE,
    label: "Initials",
    scope: "personal",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: "shared-1",
    type: "image",
    dataUrl: SIGNATURE_IMAGE,
    label: "Company stamp",
    scope: "shared",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
];

const PENDING_REQUEST: SignRequestSummary = {
  sessionId: "session-1",
  documentName: "contract.pdf",
  ownerUsername: "owner",
  createdAt: "2026-01-01T00:00:00Z",
  dueDate: "2026-12-31T00:00:00Z",
  myStatus: "PENDING",
};

function signaturesResponse(signatures: SavedSignature[]) {
  return http.get("/api/v1/proprietary/signatures", () =>
    HttpResponse.json(signatures),
  );
}

const savedSignatures = toolPanelServer(signaturesResponse(SAVED_SIGNATURES));

export const Panel: Story = {
  parameters: toolPanelServer(signaturesResponse([])),
  play: untilPanelShows("Add your signature"),
};

export const SavedSignatures: Story = {
  parameters: savedSignatures,
  play: untilPanelShows("Company stamp"),
};

export const PhoneSignature: Story = {
  parameters: toolPanelServer(
    signaturesResponse([]),
    appConfig({ enableMobileSignature: true }),
  ),
  play: untilPanelShows("Phone"),
};

export const RequestSignatures: Story = {
  parameters: toolPanelServer(
    signaturesResponse([]),
    appConfig({ storageGroupSigningEnabled: true }),
    http.get("/api/v1/security/cert-sign/sign-requests", () =>
      HttpResponse.json([PENDING_REQUEST]),
    ),
    http.get("/api/v1/security/cert-sign/sessions", () =>
      HttpResponse.json([]),
    ),
  ),
  play: untilPanelShows("Open shared signing"),
};

export const SharedSignaturesTooltip: Story = {
  parameters: savedSignatures,
  play: openTooltip({ info: "Everyone can use these" }),
};

const savedSignaturesOnViewer = {
  args: { showWorkbench: true, workbench: "viewer" },
  parameters: savedSignatures,
} as const;

async function armSignature(context: PlayContext) {
  const panel = await waitForPanelText(context, "My signature");
  const tile = panel.getByRole("button", { name: "My signature" });
  await waitFor(() => expect(tile).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(tile);
  await panel.findByText(
    "Click the page to place My signature.",
    undefined,
    STAGE_TIMEOUT,
  );
  return panel;
}

async function placeSignature(context: PlayContext) {
  const panel = await placeOnPage(context, armSignature);
  await panel.findByText("On this document (1)", undefined, STAGE_TIMEOUT);
  return panel;
}

async function clickUndo(context: PlayContext) {
  const panel = await placeSignature(context);
  await undoInPanel(panel);
  return panel;
}

async function undoPlacement(context: PlayContext) {
  const panel = await clickUndo(context);
  await panel.findByText("On this document (0)", undefined, STAGE_TIMEOUT);
  return panel;
}

export const PlacingSignature: Story = {
  ...savedSignaturesOnViewer,
  play: armSignature,
};

export const SignaturePlaced: Story = {
  ...savedSignaturesOnViewer,
  play: placeSignature,
};

export const PlacementUndone: Story = {
  ...savedSignaturesOnViewer,
  play: undoPlacement,
};

export const UndoTooltip: Story = {
  ...savedSignaturesOnViewer,
  play: openTooltip({ info: "Undo" }, { after: placeSignature }),
};

export const RedoTooltip: Story = {
  ...savedSignaturesOnViewer,
  play: openTooltip({ info: "Redo" }, { after: clickUndo }),
};
