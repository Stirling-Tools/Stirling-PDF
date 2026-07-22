import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { HttpError } from "@portal/api/http";
import { ConnectionsTab } from "@portal/components/sources/ConnectionsTab";
import type { IntegrationConfig } from "@portal/api/integrations";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchS3Connections = vi.fn();
const deleteIntegration = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchS3Connections: () => fetchS3Connections(),
  deleteIntegration: (id: number) => deleteIntegration(id),
  createIntegration: vi.fn(),
  updateIntegration: vi.fn(),
}));

const CONNECTION = {
  id: 5,
  integrationType: "S3",
  name: "Claims bucket",
  config: { bucket: "inbox", region: "us-east-1" },
  canManage: true,
} as unknown as IntegrationConfig;

describe("ConnectionsTab", () => {
  beforeEach(() => {
    fetchS3Connections.mockReset();
    deleteIntegration.mockReset();
    deleteIntegration.mockResolvedValue(undefined);
  });

  it("shows the empty state when there are no connections", async () => {
    fetchS3Connections.mockResolvedValue([]);
    render(<ConnectionsTab />);
    expect(
      await screen.findByText("portal.connections.empty.title"),
    ).toBeInTheDocument();
  });

  it("lists connections and deletes one", async () => {
    fetchS3Connections.mockResolvedValueOnce([CONNECTION]);
    fetchS3Connections.mockResolvedValueOnce([]);
    render(<ConnectionsTab />);

    expect(await screen.findByText("Claims bucket")).toBeInTheDocument();
    fireEvent.click(screen.getByText("portal.connections.delete"));
    await waitFor(() => expect(deleteIntegration).toHaveBeenCalledWith(5));
  });

  it("surfaces the 409 when deleting a connection still in use", async () => {
    fetchS3Connections.mockResolvedValue([CONNECTION]);
    deleteIntegration.mockRejectedValue(
      new HttpError(409, "Conflict", {
        detail: "Integration is in use by: source 'Claims intake'",
      }),
    );
    render(<ConnectionsTab />);

    await screen.findByText("Claims bucket");
    fireEvent.click(screen.getByText("portal.connections.delete"));
    expect(
      await screen.findByText(
        "Integration is in use by: source 'Claims intake'",
      ),
    ).toBeInTheDocument();
  });
});
