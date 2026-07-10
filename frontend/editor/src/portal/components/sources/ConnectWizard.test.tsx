import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { HttpError } from "@portal/api/http";
import { ConnectWizard } from "@portal/components/sources/ConnectWizard";

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// Deterministic i18n: keys come back verbatim so the test never waits on the
// async TOML backend.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// Mock the service layer so no real fetch is issued.
const createSource = vi.fn();
vi.mock("@portal/api/sources", () => ({
  createSource: (...args: unknown[]) => createSource(...args),
}));

const fetchS3Connections = vi.fn();
const createIntegration = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchS3Connections: () => fetchS3Connections(),
  createIntegration: (...args: unknown[]) => createIntegration(...args),
}));

/** Step through the folder-source flow: choose type -> configure -> review. */
function stepToReview() {
  // Step 0: folder is the default-selected type. Continue.
  fireEvent.click(screen.getByText("portal.sources.wizard.continue"));

  // Step 1: fill the required name + directory fields.
  const inputs = screen.getAllByRole("textbox");
  // First textbox is the name field, second is the folder's directory field.
  fireEvent.change(inputs[0], { target: { value: "Claims intake" } });
  fireEvent.change(inputs[1], { target: { value: "/data/incoming" } });
  fireEvent.click(screen.getByText("portal.sources.wizard.continue"));
}

describe("ConnectWizard", () => {
  beforeEach(() => {
    createSource.mockReset();
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
    createIntegration.mockReset();
  });

  it("creates a folder source with the configured options", async () => {
    createSource.mockResolvedValue({ id: "src-1" });
    const onCreated = vi.fn();
    const onClose = vi.fn();

    renderWithMantine(
      <ConnectWizard open onClose={onClose} onCreated={onCreated} />,
    );

    stepToReview();

    // Step 2: submit via the final "connect source" action.
    fireEvent.click(screen.getByText("portal.sources.actions.connectSource"));

    await waitFor(() => {
      expect(createSource).toHaveBeenCalledTimes(1);
    });
    expect(createSource).toHaveBeenCalledWith({
      name: "Claims intake",
      type: "folder",
      options: {
        directory: "/data/incoming",
        mode: "consume",
        recursive: "false",
        identity: "stat",
      },
      enabled: true,
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("creates an s3 source by creating a connection inline", async () => {
    createSource.mockResolvedValue({ id: "src-2" });
    createIntegration.mockResolvedValue({ id: 12, name: "Claims bucket" });

    renderWithMantine(
      <ConnectWizard open onClose={vi.fn()} onCreated={vi.fn()} />,
    );

    // Step 0: pick the S3 type card.
    fireEvent.click(screen.getByText("portal.sources.types.s3.label"));
    fireEvent.click(screen.getByText("portal.sources.wizard.continue"));

    // Name the source (the wizard's own field), then create a connection
    // inline - it is saved immediately (validated backend-side) and selected.
    fireEvent.change(screen.getByLabelText(/portal\.sources\.wizard\.name/), {
      target: { value: "Claims intake" },
    });
    fireEvent.click(
      await screen.findByText("portal.connections.picker.createNew"),
    );
    // Target the connection form by label, not position - a Mantine Select in
    // the picker also carries an input role and would shift index-based queries.
    fireEvent.change(
      screen.getByLabelText(/portal\.connections\.s3\.fields\.name/),
      {
        target: { value: "Claims bucket" },
      },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.s3\.fields\.bucket\.label/,
      ),
      { target: { value: "claims-inbox" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.s3\.fields\.accessKeyId\.label/,
      ),
      { target: { value: "AKIAEXAMPLE" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.s3\.fields\.secretAccessKey\.label/,
      ),
      { target: { value: "shh-secret" } },
    );
    fireEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() => {
      expect(createIntegration).toHaveBeenCalledWith({
        integrationType: "S3",
        name: "Claims bucket",
        scope: "TEAM",
        config: {
          bucket: "claims-inbox",
          region: "us-east-1",
          endpoint: "",
          accessKeyId: "AKIAEXAMPLE",
          secretAccessKey: "shh-secret",
        },
      });
    });

    fireEvent.click(screen.getByText("portal.sources.wizard.continue"));
    fireEvent.click(screen.getByText("portal.sources.actions.connectSource"));
    await waitFor(() => {
      expect(createSource).toHaveBeenCalledTimes(1);
    });
    expect(createSource).toHaveBeenCalledWith({
      name: "Claims intake",
      type: "s3",
      options: {
        connectionId: "12",
        prefix: "",
        mode: "consume",
      },
      enabled: true,
    });
  });

  it("edits an existing source: prefilled, skips type, submits with its id", async () => {
    createSource.mockResolvedValue({ id: "s1" });
    const onCreated = vi.fn();

    renderWithMantine(
      <ConnectWizard
        open
        source={{
          id: "s1",
          name: "James",
          type: "folder",
          options: { directory: "'/data/in'", mode: "consume" },
          enabled: true,
        }}
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );

    // Edit opens on the configure step with name + directory prefilled.
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs[0].value).toBe("James");
    expect(inputs[1].value).toBe("'/data/in'");

    // Fix the stray quotes, continue to review, save.
    fireEvent.change(inputs[1], { target: { value: "/data/in" } });
    fireEvent.click(screen.getByText("portal.sources.wizard.continue"));
    fireEvent.click(screen.getByText("portal.sources.wizard.save"));

    await waitFor(() => {
      expect(createSource).toHaveBeenCalledTimes(1);
    });
    // Options absent from the stored source are submitted at their defaults.
    expect(createSource).toHaveBeenCalledWith({
      id: "s1",
      name: "James",
      type: "folder",
      options: {
        directory: "/data/in",
        mode: "consume",
        recursive: "false",
        identity: "stat",
      },
      enabled: true,
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("renders the inline error message when create fails", async () => {
    createSource.mockRejectedValue(
      new HttpError(400, "Bad Request", {
        detail: "Directory is not readable",
      }),
    );

    renderWithMantine(
      <ConnectWizard open onClose={vi.fn()} onCreated={vi.fn()} />,
    );

    stepToReview();
    fireEvent.click(screen.getByText("portal.sources.actions.connectSource"));

    expect(
      await screen.findByText("Directory is not readable"),
    ).toBeInTheDocument();
  });
});
