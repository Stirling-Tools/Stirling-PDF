import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import type { ReactNode } from "react";
import { SourceModal } from "@portal/components/sources/SourceModal";
import { UIProvider } from "@portal/contexts/UIContext";

// SourceModal reads useUI() (open settings) and useQueryClient (list
// invalidation), so provide the query client + Mantine + the UI context.
const Providers = ({ children }: { children: ReactNode }) => (
  <PortalTestProviders>
    <UIProvider>{children}</UIProvider>
  </PortalTestProviders>
);

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: Providers });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const createSource = vi.fn();
const fetchSource = vi.fn();
const deleteSource = vi.fn();
const isFolderAccessDeniedError = vi.fn();
vi.mock("@portal/api/sources", () => ({
  createSource: (s: unknown) => createSource(s),
  fetchSource: (id: string) => fetchSource(id),
  deleteSource: (id: string) => deleteSource(id),
  isFolderAccessDeniedError: (e: unknown) => isFolderAccessDeniedError(e),
}));

const fetchS3Connections = vi.fn();
const createIntegration = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => Promise.resolve([]),
  fetchIntegrationCapabilities: () => Promise.resolve({ customApi: false }),
  fetchS3Connections: () => fetchS3Connections(),
  createIntegration: (body: unknown) => createIntegration(body),
}));

function renderModal(sourceId: string | null = null) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <SourceModal
      open
      sourceId={sourceId}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  return { onClose, onSaved };
}

describe("SourceModal", () => {
  beforeEach(() => {
    createSource.mockReset();
    createSource.mockResolvedValue({ id: "src-1" });
    fetchSource.mockReset();
    deleteSource.mockReset();
    deleteSource.mockResolvedValue(undefined);
    isFolderAccessDeniedError.mockReset();
    isFolderAccessDeniedError.mockReturnValue(false);
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
    createIntegration.mockReset();
    createIntegration.mockResolvedValue({ id: 77, name: "Fresh bucket" });
  });

  it("creates a folder source through the staged flow and closes", async () => {
    const { onClose, onSaved } = renderModal();

    // Stage 1: pick the folder connector, then fill name + directory.
    fireEvent.click(screen.getByText("portal.sources.types.folder.label"));
    fireEvent.change(screen.getByLabelText(/portal\.integrations\.typedName/), {
      target: { value: "Claims intake" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.folder\.fields\.directory\.label/,
      ),
      { target: { value: "/data/incoming" } },
    );
    fireEvent.click(screen.getByText("portal.sources.builder.create"));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(1));
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Claims intake",
        type: "folder",
        options: expect.objectContaining({ directory: "/data/incoming" }),
        enabled: true,
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("offers a Folder Access settings link when the folder is outside allowed roots", async () => {
    createSource.mockRejectedValue(
      new Error("outside the allowed folder roots"),
    );
    isFolderAccessDeniedError.mockReturnValue(true);
    renderModal();

    fireEvent.click(screen.getByText("portal.sources.types.folder.label"));
    fireEvent.change(screen.getByLabelText(/portal\.integrations\.typedName/), {
      target: { value: "Claims intake" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.folder\.fields\.directory\.label/,
      ),
      { target: { value: "/etc" } },
    );
    fireEvent.click(screen.getByText("portal.sources.builder.create"));

    expect(
      await screen.findByText("portal.sources.builder.folderAccess.title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.sources.builder.folderAccess.openSettings"),
    ).toBeInTheDocument();
  });

  it("shows a plain error banner (no settings link) for other save failures", async () => {
    createSource.mockRejectedValue(new Error("boom"));
    isFolderAccessDeniedError.mockReturnValue(false);
    renderModal();

    fireEvent.click(screen.getByText("portal.sources.types.folder.label"));
    fireEvent.change(screen.getByLabelText(/portal\.integrations\.typedName/), {
      target: { value: "Claims intake" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.folder\.fields\.directory\.label/,
      ),
      { target: { value: "/data/incoming" } },
    );
    fireEvent.click(screen.getByText("portal.sources.builder.create"));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(
      screen.queryByText("portal.sources.builder.folderAccess.openSettings"),
    ).not.toBeInTheDocument();
  });

  it("gates the s3 type on a chosen connection", async () => {
    renderModal();
    fireEvent.click(screen.getByText("portal.sources.types.s3.label"));
    fireEvent.change(screen.getByLabelText(/portal\.integrations\.typedName/), {
      target: { value: "Bucket source" },
    });
    expect(
      await screen.findByText(
        "portal.sources.types.s3.fields.connection.label",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.sources.builder.create").closest("button"),
    ).toBeDisabled();
  });

  it("reveals the delivery URL and signing secret once after creating a webhook", async () => {
    createSource.mockResolvedValue({
      id: "wh-1",
      options: { webhookId: "whk_abc123", signingSecret: "whsec_topsecret" },
    });
    const { onClose } = renderModal();

    fireEvent.click(screen.getByText("portal.sources.types.webhook.label"));
    fireEvent.change(screen.getByLabelText(/portal\.integrations\.typedName/), {
      target: { value: "Partner uploads" },
    });
    fireEvent.click(screen.getByText("portal.sources.builder.create"));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByDisplayValue("whsec_topsecret"),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/\/api\/v1\/webhooks\/whk_abc123$/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByText("portal.sources.types.webhook.reveal.done"),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("creates an S3 connection in-place without stacking a second modal", async () => {
    renderModal();
    fireEvent.click(screen.getByText("portal.sources.types.s3.label"));
    // "New connection..." swaps the stage instead of opening another modal.
    fireEvent.click(
      await screen.findByText("portal.connections.picker.createNew"),
    );
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);

    fireEvent.change(screen.getByLabelText(/portal\.integrations\.typedName/), {
      target: { value: "Fresh bucket" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /portal\.connections\.types\.s3\.fields\.bucket\.label/,
      ),
      { target: { value: "fresh-bucket" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.connections\.types\.s3\.fields\.accessKeyId\.label/,
      ),
      { target: { value: "AKIA123" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.connections\.types\.s3\.fields\.secretAccessKey\.label/,
      ),
      { target: { value: "secret" } },
    );
    fireEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() => expect(createIntegration).toHaveBeenCalledTimes(1));
    expect(createIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationType: "S3",
        name: "Fresh bucket",
        scope: "TEAM",
      }),
    );
    // Back on the source form with the new connection selected.
    expect(
      await screen.findByText(
        "portal.sources.types.s3.fields.connection.label",
      ),
    ).toBeInTheDocument();
  });

  it("lists coming-soon connectors as inert cards", () => {
    renderModal();
    fireEvent.click(screen.getByText("portal.sources.types.sharepoint.label"));
    // Still on the type stage: no configure form appeared.
    expect(
      screen.queryByLabelText(/portal\.integrations\.typedName/),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("portal.sources.builder.comingSoon").length,
    ).toBeGreaterThan(1);
  });

  it("edits an existing source prefilled and saves with its id", async () => {
    fetchSource.mockResolvedValue({
      id: "src-9",
      name: "Existing",
      type: "folder",
      options: { directory: "/old", mode: "consume" },
      enabled: true,
    });
    renderModal("src-9");

    const directory = await screen.findByLabelText(
      /portal\.sources\.types\.folder\.fields\.directory\.label/,
    );
    expect((directory as HTMLInputElement).value).toBe("/old");
    fireEvent.change(directory, { target: { value: "/new" } });
    fireEvent.click(screen.getByText("portal.sources.builder.save"));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(1));
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "src-9",
        options: expect.objectContaining({ directory: "/new" }),
      }),
    );
  });

  it("deletes an existing source after the inline confirm", async () => {
    fetchSource.mockResolvedValue({
      id: "src-9",
      name: "Existing",
      type: "folder",
      options: { directory: "/old" },
      enabled: true,
    });
    const { onSaved } = renderModal("src-9");

    fireEvent.click(await screen.findByText("portal.sources.builder.delete"));
    fireEvent.click(await screen.findByText("portal.sources.delete.confirm"));

    await waitFor(() => expect(deleteSource).toHaveBeenCalledWith("src-9"));
    expect(onSaved).toHaveBeenCalled();
  });
});
