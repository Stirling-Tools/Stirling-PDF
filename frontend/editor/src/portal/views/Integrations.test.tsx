import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { HttpError } from "@portal/api/http";
import { Integrations } from "@portal/views/Integrations";
import type { IntegrationConfig } from "@portal/api/integrations";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchIntegrations = vi.fn();
const deleteIntegration = vi.fn();
const capabilities = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => fetchIntegrations(),
  fetchIntegrationCapabilities: () => capabilities(),
  fetchS3Connections: () => Promise.resolve([]),
  deleteIntegration: (id: number) => deleteIntegration(id),
  createIntegration: vi.fn(),
  updateIntegration: vi.fn(),
}));

const bucket = (id: number, name: string): IntegrationConfig =>
  ({
    id,
    integrationType: "S3",
    name,
    config: { bucket: `${name}-bucket`, region: "us-east-1" },
    canManage: true,
  }) as unknown as IntegrationConfig;

describe("Integrations view", () => {
  beforeEach(() => {
    fetchIntegrations.mockReset();
    deleteIntegration.mockReset();
    deleteIntegration.mockResolvedValue(undefined);
    capabilities.mockReset();
    capabilities.mockResolvedValue({ customApi: false });
  });

  it("lists the available catalogue with Connect actions when nothing is connected", async () => {
    fetchIntegrations.mockResolvedValue([]);
    render(<Integrations />);
    expect(
      await screen.findByText("portal.connections.types.s3.label"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.connections.types.slack.label"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("portal.integrations.connect").length,
    ).toBeGreaterThan(5);
    // Roadmap source connectors are listed greyed, not connectable.
    expect(
      screen.getByText("portal.sources.types.sharepoint.label"),
    ).toBeInTheDocument();
  });

  it("groups connections of the same type and expands to the instances", async () => {
    fetchIntegrations.mockResolvedValue([
      bucket(1, "Claims"),
      bucket(2, "Archive"),
    ]);
    render(<Integrations />);

    // One connected group row for S3 with the instance count, not two rows.
    const group = await screen.findByText(
      "portal.integrations.connectionCount",
    );
    expect(group).toBeInTheDocument();

    fireEvent.click(screen.getByText("portal.connections.types.s3.label"));
    expect(await screen.findByText("Claims")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(
      screen.getByText("portal.integrations.addAnother"),
    ).toBeInTheDocument();
    // The available band remains for the other, unconnected vendors.
    expect(
      screen.getByText(/portal\.integrations\.availableHeading/),
    ).toBeInTheDocument();
  });

  it("deletes an instance from the expanded group", async () => {
    fetchIntegrations.mockResolvedValueOnce([bucket(5, "Claims")]);
    fetchIntegrations.mockResolvedValueOnce([]);
    render(<Integrations />);

    fireEvent.click(
      await screen.findByText("portal.connections.types.s3.label"),
    );
    fireEvent.click(await screen.findByText("portal.connections.delete"));

    await waitFor(() => expect(deleteIntegration).toHaveBeenCalledWith(5));
  });

  it("surfaces the 409 when deleting a connection still in use", async () => {
    fetchIntegrations.mockResolvedValue([bucket(5, "Claims")]);
    deleteIntegration.mockRejectedValue(
      new HttpError(409, "Conflict", {
        detail: "Integration is in use by: source 'Claims intake'",
      }),
    );
    render(<Integrations />);

    fireEvent.click(
      await screen.findByText("portal.connections.types.s3.label"),
    );
    fireEvent.click(await screen.findByText("portal.connections.delete"));

    expect(
      await screen.findByText(
        "Integration is in use by: source 'Claims intake'",
      ),
    ).toBeInTheDocument();
  });

  it("offers Custom API as a button and an available row when the server allows it", async () => {
    capabilities.mockResolvedValue({ customApi: true });
    fetchIntegrations.mockResolvedValue([]);
    render(<Integrations />);
    expect(
      await screen.findByText("portal.integrations.customApi"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("portal.connections.types.api.label"),
    ).toBeInTheDocument();
  });

  it("keeps Custom API out of the catalogue when the server withholds it", async () => {
    fetchIntegrations.mockResolvedValue([]);
    render(<Integrations />);
    await screen.findByText("portal.connections.types.s3.label");
    expect(
      screen.queryByText("portal.connections.types.api.label"),
    ).not.toBeInTheDocument();
  });

  it("expands an available row's (i) into the tasks that integration adds", async () => {
    fetchIntegrations.mockResolvedValue([]);
    render(<Integrations />);
    await screen.findByText("portal.connections.types.jira.label");

    expect(
      screen.queryByText("portal.policies.operations.jiraComment.label"),
    ).not.toBeInTheDocument();

    // Every step-backed vendor gets an (i); S3 (a bucket, no steps) gets none, so
    // there are fewer (i)s than Connect buttons.
    const infos = screen.getAllByRole("button", {
      name: "portal.connections.picker2.tasksInfo",
    });
    expect(infos.length).toBeGreaterThan(0);
    expect(infos.length).toBeLessThan(
      screen.getAllByText("portal.integrations.connect").length,
    );

    // The Jira row's (i) reveals all three of its tasks inline.
    const jiraRow = screen
      .getByText("portal.connections.types.jira.label")
      .closest(".portal-integrations__group") as HTMLElement;
    fireEvent.click(
      within(jiraRow).getByRole("button", {
        name: "portal.connections.picker2.tasksInfo",
      }),
    );
    expect(
      await screen.findByText("portal.policies.operations.jiraAttach.label"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.policies.operations.jiraComment.label"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.policies.operations.jiraTransition.label"),
    ).toBeInTheDocument();
  });

  it("keeps the custom-call task out of a connected group when the server withholds it", async () => {
    // A stored custom-API connection still lists; the task the server would refuse must not
    // be advertised in its panel (same gate the catalogue honours).
    const custom = {
      id: 3,
      integrationType: "API",
      name: "In-house API",
      config: { baseUrl: "https://api.internal" },
      canManage: true,
    } as unknown as IntegrationConfig;
    fetchIntegrations.mockResolvedValue([custom]);
    render(<Integrations />);

    fireEvent.click(
      await screen.findByText("portal.connections.types.api.label"),
    );
    expect(
      await screen.findByText("portal.integrations.addAnother"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("portal.policies.operations.customApiCall.label"),
    ).not.toBeInTheDocument();
  });

  it("shows a connected group's tasks in its expanded panel", async () => {
    const slack = {
      id: 9,
      integrationType: "API",
      name: "Ops alerts",
      config: { presetId: "slack", baseUrl: "https://hooks.slack.com/x" },
      canManage: true,
    } as unknown as IntegrationConfig;
    fetchIntegrations.mockResolvedValue([slack]);
    render(<Integrations />);

    fireEvent.click(
      await screen.findByText("portal.connections.types.slack.label"),
    );
    expect(
      await screen.findByText("portal.policies.operations.slackNotify.label"),
    ).toBeInTheDocument();
  });
});
