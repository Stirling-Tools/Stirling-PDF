import { fireEvent, render, screen } from "@testing-library/react";
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
