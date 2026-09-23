import { MantineProvider } from "@mantine/core";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  downloadsDir: "/Users/ada/Downloads" as string | null,
  listing: null as { files: unknown[]; directories: unknown[] } | null,
  listThrows: false,
  canList: true,
  block: null as string | null,
  classificationActive: true,
  stubs: [] as { id: string; name: string; classificationLabels?: string[] }[],
  addFiles: vi.fn(),
  mountLocalFolder: vi.fn(),
  readDiskFile: vi.fn(),
}));

vi.mock("@app/services/downloadsDirectory", () => ({
  getDownloadsDirectory: async () => h.downloadsDir,
}));
vi.mock("@app/services/localFolderContents", () => ({
  get canListDirectory() {
    return h.canList;
  },
  listDirectory: async () => {
    if (h.listThrows) throw new Error("Operation not permitted");
    return h.listing;
  },
  readDiskFile: (entry: { name: string }) => h.readDiskFile(entry),
}));
vi.mock("@app/hooks/useServerProcessingBlock", () => ({
  useServerProcessingBlock: () => h.block,
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      classification: h.classificationActive
        ? {
            configured: true,
            enabled: true,
            backendId: "be-1",
            runsOnEditor: true,
            runOn: "upload",
          }
        : { configured: false, enabled: false, runsOnEditor: true },
    },
  }),
}));
vi.mock("@app/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: h.addFiles }),
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({ mountLocalFolder: h.mountLocalFolder }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: h.stubs }),
}));
vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn().mockResolvedValue({}) },
}));
// Render the English copy rather than raw keys, so assertions read like the UI.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, arg?: unknown) => {
      if (typeof arg === "string") return arg;
      const opts = arg as { defaultValue?: string } | undefined;
      return opts?.defaultValue ?? key;
    },
  }),
}));

import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";

const render = (ui: React.ReactElement) =>
  rtlRender(<MantineProvider>{ui}</MantineProvider>);

const pdf = (name: string, lastModified = 1) => ({
  path: `/Users/ada/Downloads/${name}`,
  name,
  sizeBytes: 10,
  lastModified,
});

describe("DownloadsProcessingWizard", () => {
  beforeEach(() => {
    h.downloadsDir = "/Users/ada/Downloads";
    h.listing = { files: [pdf("a.pdf"), pdf("b.pdf")], directories: [] };
    h.listThrows = false;
    h.canList = true;
    h.block = null;
    h.classificationActive = true;
    h.stubs = [];
    h.addFiles
      .mockReset()
      .mockImplementation(async (files: File[]) =>
        files.map((f, i) => ({ fileId: `id-${f.name}-${i}` })),
      );
    h.mountLocalFolder.mockReset().mockResolvedValue({});
    h.readDiskFile
      .mockReset()
      .mockImplementation(
        async (e: { name: string }) =>
          new File([new Uint8Array([1])], e.name, { type: "application/pdf" }),
      );
  });

  it("offers the PDFs it found on the machine", async () => {
    render(<DownloadsProcessingWizard />);
    expect(
      await screen.findByRole("button", { name: /Downloads/i }),
    ).toBeTruthy();
  });

  it("stays hidden without a connected server", async () => {
    h.block = "Sign in to Stirling Cloud or connect a self-hosted server.";
    render(<DownloadsProcessingWizard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: /Downloads/i })).toBeNull();
  });

  it("stays hidden when the build cannot read the disk", async () => {
    h.canList = false;
    render(<DownloadsProcessingWizard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: /Downloads/i })).toBeNull();
  });

  it("stays hidden when the server will not run the classification policy", async () => {
    h.classificationActive = false;
    render(<DownloadsProcessingWizard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: /Downloads/i })).toBeNull();
  });

  it("stays hidden when the machine reports no Downloads folder", async () => {
    h.downloadsDir = null;
    render(<DownloadsProcessingWizard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: /Downloads/i })).toBeNull();
  });

  it("stays hidden when Downloads holds no PDFs", async () => {
    h.listing = { files: [], directories: [] };
    render(<DownloadsProcessingWizard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: /Downloads/i })).toBeNull();
  });

  it("stays hidden when reading Downloads is refused", async () => {
    // The macOS Downloads-access case: listDirectory throws.
    h.listThrows = true;
    render(<DownloadsProcessingWizard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: /Downloads/i })).toBeNull();
  });

  it("mounts Downloads and imports its PDFs when approved", async () => {
    const user = userEvent.setup();
    render(<DownloadsProcessingWizard />);
    await user.click(await screen.findByRole("button", { name: /Downloads/i }));
    await user.click(
      await screen.findByRole("button", { name: /Process my Downloads/i }),
    );

    await waitFor(() => expect(h.mountLocalFolder).toHaveBeenCalled());
    expect(h.mountLocalFolder.mock.calls[0][0]).toBe("/Users/ada/Downloads");
    await waitFor(() => expect(h.addFiles).toHaveBeenCalled());

    // Never steal the workbench selection for a background sweep.
    expect(h.addFiles.mock.calls[0][1]).toMatchObject({ selectFiles: false });
    const imported = h.addFiles.mock.calls.flatMap((c) => c[0] as File[]);
    expect(imported.map((f) => f.name).sort()).toEqual(["a.pdf", "b.pdf"]);
  });

  it("takes the newest PDFs first", async () => {
    h.listing = {
      files: [pdf("old.pdf", 1), pdf("new.pdf", 999)],
      directories: [],
    };
    const user = userEvent.setup();
    render(<DownloadsProcessingWizard />);
    await user.click(await screen.findByRole("button", { name: /Downloads/i }));
    await user.click(
      await screen.findByRole("button", { name: /Process my Downloads/i }),
    );

    await waitFor(() => expect(h.readDiskFile).toHaveBeenCalled());
    expect(h.readDiskFile.mock.calls[0][0].name).toBe("new.pdf");
  });

  it("ignores files that are not PDFs", async () => {
    h.listing = {
      files: [pdf("a.pdf"), { ...pdf("notes.txt"), name: "notes.txt" }],
      directories: [],
    };
    const user = userEvent.setup();
    render(<DownloadsProcessingWizard />);
    await user.click(await screen.findByRole("button", { name: /Downloads/i }));
    await user.click(
      await screen.findByRole("button", { name: /Process my Downloads/i }),
    );

    await waitFor(() => expect(h.addFiles).toHaveBeenCalled());
    const imported = h.addFiles.mock.calls.flatMap((c) => c[0] as File[]);
    expect(imported.map((f) => f.name)).toEqual(["a.pdf"]);
  });
});
