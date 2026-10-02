import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, expect, it, vi } from "vitest";
import SignRequestPanel from "@app/components/tools/certSign/panels/SignRequestPanel";
import type { SigningRequestData } from "@app/hooks/signing/useSigningSessionController";

const { setOverlay, addFiles, t } = vi.hoisted(() => ({
  setOverlay: vi.fn(),
  addFiles: vi.fn(),
  t: (key: string, fallback?: string) => fallback ?? key,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("@app/contexts/SigningOverlayContext", () => ({
  useSigningOverlay: () => ({ setOverlay }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileActions: () => ({ actions: { addFiles } }),
}));
vi.mock("@app/components/tools/certSign/panels/SignControlsPanel", () => ({
  default: () => <div>Visible mark editor</div>,
}));
vi.mock("@app/components/tools/certSign/modals/CertificateConfigModal", () => ({
  CertificateConfigModal: ({
    opened,
    signatureCount,
    onClose,
  }: {
    opened: boolean;
    signatureCount: number;
    onClose: () => void;
  }) =>
    opened ? (
      <div role="dialog" aria-label="Certificate">
        <span>{signatureCount} visible marks</span>
        <button onClick={onClose}>Cancel certificate</button>
      </div>
    ) : null,
}));

beforeEach(() => vi.clearAllMocks());

function setup(
  status: SigningRequestData["signRequest"]["myStatus"] = "PENDING",
  finalized = false,
) {
  const data: SigningRequestData = {
    signRequest: {
      sessionId: "demo",
      documentName: "agreement.pdf",
      ownerUsername: "Alice",
      message: "Please check the second page.",
      dueDate: "2026-10-12",
      createdAt: "2026-10-01T10:00:00Z",
      myStatus: status,
      finalized,
    },
    pdfFile: new File(["pdf"], "agreement.pdf"),
    canSign: !finalized && status !== "SIGNED" && status !== "DECLINED",
    onSign: vi.fn(),
    onDecline: vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onBack: vi.fn(),
  };
  const result = render(
    <MantineProvider>
      <SignRequestPanel data={data} />
    </MantineProvider>,
  );
  return { ...result, data };
}

it("shows the owner's message and a local-calendar due date", () => {
  const { container } = setup();
  expect(
    screen.getByRole("heading", { name: "agreement.pdf" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Please check the second page.")).toBeInTheDocument();
  expect(
    container.querySelector('time[datetime="2026-10-12"]'),
  ).toHaveTextContent(new Date(2026, 9, 12).toLocaleDateString());
});

it("directs an owner back to their session after submitting their own signature", () => {
  const { data, rerender } = setup("SIGNED");
  expect(
    screen.queryByRole("button", { name: "Manage signing session" }),
  ).not.toBeInTheDocument();
  data.onManageSession = vi.fn();
  rerender(
    <MantineProvider>
      <SignRequestPanel data={data} />
    </MantineProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Return to your session",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Manage signing session" }),
  );
  expect(data.onManageSession).toHaveBeenCalledOnce();
});

it("releases its own viewer on unmount without clearing a replacement owner preview", () => {
  const { unmount, data } = setup();
  const participantOverlay = setOverlay.mock.calls.at(-1)![0];
  const ownerOverlay = { file: data.pdfFile, signaturePreviewsReadOnly: true };
  unmount();
  const releaseOverlay = setOverlay.mock.calls.at(-1)![0];
  expect(releaseOverlay(participantOverlay)).toBeNull();
  expect(releaseOverlay(ownerOverlay)).toBe(ownerOverlay);
});

it("opens certificate-only signing without submitting and preserves the editor on cancel", () => {
  const { data } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Complete & Sign" }));
  expect(screen.getByRole("dialog", { name: "Certificate" })).toHaveTextContent(
    "0 visible marks",
  );
  expect(data.onSign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel certificate" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Visible mark editor")).toBeInTheDocument();
});

it.each([
  ["SIGNED", false, "Your signature is submitted"],
  ["DECLINED", false, "This request is closed"],
  ["PENDING", true, "Signed document"],
] as const)(
  "keeps %s requests read-only when finalized=%s",
  (status, finalized, heading) => {
    setup(status, finalized);
    expect(screen.getByRole("status")).toHaveTextContent(heading);
    expect(
      screen.queryByRole("button", { name: "Complete & Sign" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Decline Request" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Visible mark editor")).not.toBeInTheDocument();
    expect(setOverlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ signaturePlacementMode: false }),
    );
  },
);

it("renders submitted marks separately from the participant's editable draft and supports refresh", async () => {
  const { data, rerender } = setup("SIGNED");
  data.signRequest = {
    ...data.signRequest,
    participants: [
      {
        id: 2,
        name: "Bob",
        status: "SIGNED",
        wetSignatures: [
          {
            type: "image",
            data: "data:image/png;base64,AA==",
            page: 0,
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.1,
          },
        ],
      },
    ],
  };
  rerender(
    <MantineProvider>
      <SignRequestPanel data={data} />
    </MantineProvider>,
  );
  const overlay = setOverlay.mock.calls.at(-1)![0];
  expect(overlay.readOnlySignaturePreviews).toHaveLength(1);
  expect(overlay.signaturePreviews).toBeUndefined();
  expect(screen.getByRole("list", { name: "Participants" })).toHaveTextContent(
    "Bob",
  );
  expect(
    screen.queryByRole("button", { name: /Remove Bob/ }),
  ).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh preview" }));
  });
  expect(data.onRefresh).toHaveBeenCalledOnce();
  data.signRequest = { ...data.signRequest, finalized: true };
  rerender(
    <MantineProvider>
      <SignRequestPanel data={data} />
    </MantineProvider>,
  );
  expect(setOverlay.mock.calls.at(-1)![0].readOnlySignaturePreviews).toEqual(
    [],
  );
  expect(
    screen.queryByRole("button", { name: "Refresh preview" }),
  ).not.toBeInTheDocument();
});

it("clears an unfinished draft when the owner finalizes or closes access", () => {
  const { data, rerender } = setup();
  const clearPreviews = vi.fn();
  const overlay = setOverlay.mock.calls.at(-1)![0];
  overlay.signatureOverlayApiRef.current = { clearPreviews };
  data.canSign = false;
  data.signRequest = { ...data.signRequest, finalized: true };
  rerender(
    <MantineProvider>
      <SignRequestPanel data={data} />
    </MantineProvider>,
  );
  expect(clearPreviews).toHaveBeenCalledOnce();
  expect(setOverlay.mock.calls.at(-1)![0]).toEqual(
    expect.objectContaining({
      signaturePreviewsReadOnly: true,
      signaturePlacementMode: false,
      readOnlySignaturePreviews: [],
    }),
  );
});
