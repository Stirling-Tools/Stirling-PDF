import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AttachmentSidebar } from "@app/components/viewer/AttachmentSidebar";

const mocks = vi.hoisted(() => ({
  setActiveFileId: vi.fn(),
  setPreviewFile: vi.fn(),
  registerPreviewImport: vi.fn(),
  addFiles: vi.fn(),
  readPortfolioMemberBytes: vi.fn(),
  libraryFiles: [] as File[],
}));

// Every context value here is built once: the sidebar's effects depend on the
// identity of these objects, so a fresh one per render never settles.
const viewer = vi.hoisted(() => ({
  attachmentActions: {
    clearAttachments: vi.fn(),
    setLocalAttachments: vi.fn(),
    downloadAttachment: vi.fn(),
  },
  hasAttachmentSupport: () => false,
  toggleAttachmentSidebar: vi.fn(),
}));

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ ...viewer, setActiveFileId: mocks.setActiveFileId }),
}));

vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files: mocks.libraryFiles }),
  useFileManagement: () => ({ addFiles: mocks.addFiles }),
}));

const toolWorkflow = vi.hoisted(() => ({ handleToolSelectForced: vi.fn() }));

vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    ...toolWorkflow,
    previewFile: null,
    setPreviewFile: mocks.setPreviewFile,
    registerPreviewImport: mocks.registerPreviewImport,
  }),
}));

// The real shell wraps the list in a Mantine ScrollArea, which re-renders
// without bound under jsdom's zero-sized layout.
vi.mock("@app/components/viewer/SidebarBase", () => ({
  SidebarBase: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@app/utils/portfolioMembers", () => ({
  readPortfolioMemberBytes: mocks.readPortfolioMemberBytes,
}));

const MEMBER = {
  index: 0,
  name: "note.pdf",
  description: "",
  mimeType: "application/pdf",
  size: 5,
  creationDate: new Date("2024-01-01T00:00:00Z"),
  checksum: "",
};

const renderSidebar = () => {
  const portfolioFile = new File(["%PDF-1.7"], "portfolio.pdf", {
    type: "application/pdf",
  });
  return render(
    <MantineProvider>
      <AttachmentSidebar
        visible
        thumbnailVisible={false}
        bookmarkVisible={false}
        portfolio={{
          file: portfolioFile,
          members: [MEMBER],
          activeMemberName: null,
        }}
      />
    </MantineProvider>,
  );
};

const clickImport = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("viewer.portfolio.import"));
};

describe("AttachmentSidebar portfolio import", () => {
  beforeEach(() => {
    mocks.setActiveFileId.mockReset();
    mocks.setPreviewFile.mockReset();
    mocks.registerPreviewImport.mockReset();
    mocks.addFiles.mockReset();
    mocks.readPortfolioMemberBytes.mockReset();
    mocks.readPortfolioMemberBytes.mockResolvedValue(
      new TextEncoder().encode("hello"),
    );
    mocks.libraryFiles = [];
  });

  it("opens the file the workbench created for the member", async () => {
    mocks.addFiles.mockResolvedValue([{ fileId: "new-id" }]);
    renderSidebar();

    await clickImport();

    await waitFor(() =>
      expect(mocks.setActiveFileId).toHaveBeenCalledWith("new-id"),
    );
    expect(mocks.setPreviewFile).toHaveBeenCalledWith(null);
    expect(mocks.registerPreviewImport).toHaveBeenCalledWith(null);
  });

  it("opens the copy the workbench already holds when the member is deduplicated away", async () => {
    // addFiles drops a file whose name|size|lastModified it already has, and
    // resolves to nothing at all rather than to the file it kept.
    mocks.addFiles.mockResolvedValue([]);
    const held = new File([new Uint8Array(5)], "note.pdf", {
      type: "application/pdf",
      lastModified: MEMBER.creationDate.getTime(),
    });
    mocks.libraryFiles = [
      Object.assign(held, {
        fileId: "held-id",
        quickKey: `note.pdf|5|${MEMBER.creationDate.getTime()}`,
      }),
    ];
    renderSidebar();

    await clickImport();

    await waitFor(() =>
      expect(mocks.setActiveFileId).toHaveBeenCalledWith("held-id"),
    );
    expect(mocks.registerPreviewImport).toHaveBeenCalledWith(null);
    expect(mocks.setPreviewFile).toHaveBeenCalledWith(null);
  });

  it("reports a failure instead of silently doing nothing", async () => {
    mocks.addFiles.mockResolvedValue([]);
    renderSidebar();

    await clickImport();

    expect(
      await screen.findByText("viewer.portfolio.importFailed"),
    ).toBeInTheDocument();
    expect(mocks.setActiveFileId).not.toHaveBeenCalled();
  });
});
