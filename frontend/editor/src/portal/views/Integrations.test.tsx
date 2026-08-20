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

  it("groups connections of the same type, instances shown as rows (no expand)", async () => {
    fetchIntegrations.mockResolvedValue([
      bucket(1, "Claims"),
      bucket(2, "Archive"),
    ]);
    render(<Integrations />);

    // Instances are rows directly under the S3 vendor group - no expand click.
    expect(await screen.findByText("Claims")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    // Vendor group header shows the instance count and the "add another" action.
    expect(
      screen.getByText("portal.integrations.connectionCount"),
    ).toBeInTheDocument();
    // Each connected vendor group offers a Connect action (to add another).
    expect(
      screen.getAllByText("portal.integrations.connect").length,
    ).toBeGreaterThan(0);
    // The available band remains for the other, unconnected vendors.
    expect(
      screen.getByText(/portal\.integrations\.availableHeading/),
    ).toBeInTheDocument();
  });

  it("deletes an instance directly from its row", async () => {
    fetchIntegrations.mockResolvedValueOnce([bucket(5, "Claims")]);
    fetchIntegrations.mockResolvedValueOnce([]);
    render(<Integrations />);

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

  it("lists the tasks an available integration unlocks once its (i) is pressed", async () => {
    fetchIntegrations.mockResolvedValue([]);
    render(<Integrations />);
    await screen.findByText("portal.connections.types.jira.label");

    const jiraRow = screen
      .getByText("portal.connections.types.jira.label")
      .closest("tr") as HTMLElement;
    const tasks = [
      "portal.policies.operations.jiraAttach.label",
      "portal.policies.operations.jiraComment.label",
      "portal.policies.operations.jiraTransition.label",
    ];

    // The list stays behind the (i) so the table is not a wall of prose.
    for (const task of tasks) {
      expect(within(jiraRow).queryByText(task)).not.toBeInTheDocument();
    }

    fireEvent.click(
      within(jiraRow).getByLabelText("portal.connections.picker2.tasksInfo"),
    );

    // The Jira row then names all three of the tasks connecting it would add.
    for (const task of tasks) {
      expect(within(jiraRow).getByText(task)).toBeInTheDocument();
    }

    // S3 is a bucket, not a step - its row lists no tasks.
    const s3Row = screen
      .getByText("portal.connections.types.s3.label")
      .closest("tr") as HTMLElement;
    expect(
      within(s3Row).queryByText(/portal\.policies\.operations\./),
    ).not.toBeInTheDocument();
  });

  it("keeps the custom-call task off a connected row when the server withholds it", async () => {
    // A stored custom-API connection still lists; the task the server would refuse must not
    // be advertised on its row (same gate the catalogue honours).
    const custom = {
      id: 3,
      integrationType: "API",
      name: "In-house API",
      config: { baseUrl: "https://api.internal" },
      canManage: true,
    } as unknown as IntegrationConfig;
    fetchIntegrations.mockResolvedValue([custom]);
    render(<Integrations />);

    const row = (await screen.findByText("In-house API")).closest(
      "tr",
    ) as HTMLElement;
    expect(
      screen.queryByText("portal.policies.operations.customApiCall.label"),
    ).not.toBeInTheDocument();
    // Nothing left to disclose, so the row gets no (i) either.
    expect(
      within(row).queryByLabelText("portal.connections.picker2.tasksInfo"),
    ).not.toBeInTheDocument();
  });

  it("shows a connected instance's tasks behind its row's (i)", async () => {
    const slack = {
      id: 9,
      integrationType: "API",
      name: "Ops alerts",
      config: { presetId: "slack", baseUrl: "https://hooks.slack.com/x" },
      canManage: true,
    } as unknown as IntegrationConfig;
    fetchIntegrations.mockResolvedValue([slack]);
    render(<Integrations />);

    const row = (await screen.findByText("Ops alerts")).closest(
      "tr",
    ) as HTMLElement;
    expect(
      within(row).queryByText("portal.policies.operations.slackNotify.label"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(row).getByLabelText("portal.connections.picker2.tasksInfo"),
    );
    expect(
      within(row).getByText("portal.policies.operations.slackNotify.label"),
    ).toBeInTheDocument();
  });

  it("only claims to control the task list while that list is on screen", async () => {
    fetchIntegrations.mockResolvedValue([]);
    render(<Integrations />);
    await screen.findByText("portal.connections.types.jira.label");

    const jiraRow = screen
      .getByText("portal.connections.types.jira.label")
      .closest("tr") as HTMLElement;
    const info = within(jiraRow).getByLabelText(
      "portal.connections.picker2.tasksInfo",
    );

    // Collapsed: there is no region yet, so the (i) points at nothing.
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(info).not.toHaveAttribute("aria-controls");

    fireEvent.click(info);

    // Expanded: aria-controls names the list that just appeared, explanations included.
    expect(info).toHaveAttribute("aria-expanded", "true");
    const listId = info.getAttribute("aria-controls");
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId as string)).toBeInTheDocument();
    expect(
      within(jiraRow).getByText(
        "portal.policies.operations.jiraAttach.description",
      ),
    ).toBeInTheDocument();
    expect(
      within(jiraRow).getByText(
        "portal.policies.operations.jiraTransition.description",
      ),
    ).toBeInTheDocument();

    // Collapsing takes the whole region away again, not just the prose.
    fireEvent.click(info);
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(info).not.toHaveAttribute("aria-controls");
    expect(
      within(jiraRow).queryByText(
        "portal.policies.operations.jiraAttach.label",
      ),
    ).not.toBeInTheDocument();
  });

  it("gives a row with no tasks no (i) to press", async () => {
    fetchIntegrations.mockResolvedValue([]);
    render(<Integrations />);
    await screen.findByText("portal.connections.types.s3.label");

    const s3Row = screen
      .getByText("portal.connections.types.s3.label")
      .closest("tr") as HTMLElement;
    expect(
      within(s3Row).queryByLabelText("portal.connections.picker2.tasksInfo"),
    ).not.toBeInTheDocument();
  });
});
