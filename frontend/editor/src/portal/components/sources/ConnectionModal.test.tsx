import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionModal } from "@portal/components/sources/ConnectionModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@portal/api/integrations", () => ({
  createIntegration: vi.fn(),
  updateIntegration: vi.fn(),
}));

vi.mock("@portal/api/http", () => ({
  errorMessage: (e: unknown) => String(e),
}));

const { createIntegration, updateIntegration } =
  await import("@portal/api/integrations");

const wrap = (ui: React.ReactNode) => <MantineProvider>{ui}</MantineProvider>;

const fill = async (label: string, value: string) => {
  const field = screen.getByLabelText(label, { exact: false });
  await userEvent.clear(field);
  await userEvent.type(field, value);
};

describe("ConnectionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createIntegration).mockResolvedValue({ id: 7 } as never);
    vi.mocked(updateIntegration).mockResolvedValue({ id: 7 } as never);
  });

  it("creates a Purview connection with its tenant id", async () => {
    const onSaved = vi.fn();
    render(
      wrap(
        <ConnectionModal
          open
          fixedTypeId="purview"
          onClose={vi.fn()}
          onSaved={onSaved}
        />,
      ),
    );

    await fill("portal.integrations.typedName", "Corp Purview");
    await fill(
      "portal.connections.types.purview.fields.tenantId",
      "cb46c030-1825-4e81-a295-151c039dbf02",
    );
    await userEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() =>
      expect(createIntegration).toHaveBeenCalledWith({
        integrationType: "PURVIEW",
        name: "Corp Purview",
        scope: "TEAM",
        config: {
          presetId: "purview",
          tenantId: "cb46c030-1825-4e81-a295-151c039dbf02",
        },
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("bakes the ConsignO preset into the saved config", async () => {
    render(
      wrap(
        <ConnectionModal
          open
          fixedTypeId="consigno"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );

    await fill("portal.integrations.typedName", "Notarius");
    await fill(
      "portal.connections.types.consigno.fields.baseUrl",
      "https://acme.consignocloud.com/api/v1",
    );
    await fill("portal.connections.types.consigno.fields.clientId", "cid");
    await fill(
      "portal.connections.types.consigno.fields.clientSecret",
      "csecret",
    );
    await fill(
      "portal.connections.types.consigno.fields.username",
      "api@acme.test",
    );
    await fill("portal.connections.types.consigno.fields.password", "pw");
    await userEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() => expect(createIntegration).toHaveBeenCalled());
    const body = vi.mocked(createIntegration).mock.calls[0][0];
    expect(body.integrationType).toBe("CONSIGNO");
    // The operator supplied credentials; the vendor's auth mechanics came from the preset.
    expect(body.config).toMatchObject({
      authType: "TOKEN_LOGIN",
      loginPath: "/auth/login",
      tokenResponseHeader: "X-Auth-Token",
      loginHeaders: { "X-Client-Id": "cid", "X-Client-Secret": "csecret" },
      loginBody: { username: "api@acme.test", password: "pw" },
    });
  });

  it("round-trips a masked secret so the stored value is kept", async () => {
    render(
      wrap(
        <ConnectionModal
          open
          connection={
            {
              id: 3,
              integrationType: "S3",
              name: "Existing",
              config: {
                bucket: "b",
                region: "eu-west-2",
                accessKeyId: "AK",
                secretAccessKey: "********",
              },
            } as never
          }
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );

    await userEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() => expect(updateIntegration).toHaveBeenCalled());
    const [id, body] = vi.mocked(updateIntegration).mock.calls[0];
    expect(id).toBe(3);
    // Sending the mask back unchanged is what tells the backend to keep the real secret.
    expect(body.config).toMatchObject({
      secretAccessKey: "********",
      bucket: "b",
    });
  });

  it("cannot be saved until the required fields are filled", async () => {
    render(
      wrap(
        <ConnectionModal
          open
          fixedTypeId="purview"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );

    const save = screen.getByText("portal.connections.picker.save");
    expect(save.closest("button")).toBeDisabled();

    await fill("portal.integrations.typedName", "Corp");
    // Name alone is not enough: Purview needs a tenant id.
    expect(save.closest("button")).toBeDisabled();
  });

  it("offers custom API only to admins, and only under Advanced", async () => {
    const { rerender } = render(
      wrap(
        <ConnectionModal
          open
          capabilities={{ customApi: false }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );
    // Not an admin: the escape hatch is not offered at all.
    expect(screen.queryByText("portal.connections.types.api.label")).toBeNull();
    expect(
      screen.queryByText("portal.connections.categories.advanced.label"),
    ).toBeNull();

    rerender(
      wrap(
        <ConnectionModal
          open
          capabilities={{ customApi: true }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );
    // Admin: reachable, but filed under Advanced rather than sitting among the vendors.
    await waitFor(() =>
      expect(
        screen.getByText("portal.connections.types.api.label"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("portal.connections.categories.advanced.label"),
    ).toBeInTheDocument();
  });

  it("pins the custom API form even without capabilities, rather than blanking", async () => {
    // The pipeline's Custom API step opens this modal pinned to "api" and passes no capabilities
    // (it has none to hand). Filtering the pin through capabilities dropped the gated custom entry
    // and left the picker with nothing - a blank screen. A pinned slot is already vetted upstream,
    // so its form must always render.
    render(
      wrap(
        <ConnectionModal
          open
          fixedTypeId="api"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      ),
    );

    // Straight to the api form (its base URL field), not an empty grid.
    await waitFor(() =>
      expect(
        screen.getByLabelText(
          /portal\.connections\.types\.api\.fields\.baseUrl/,
          {
            exact: false,
          },
        ),
      ).toBeInTheDocument(),
    );
    // The picker's search box is a tell for the empty-grid state; it must not be here.
    expect(
      screen.queryByPlaceholderText(
        "portal.connections.picker2.searchPlaceholder",
      ),
    ).toBeNull();
  });

  it("searches across vendor aliases rather than just the label", async () => {
    render(wrap(<ConnectionModal open onClose={vi.fn()} onSaved={vi.fn()} />));

    // "siem" is nobody's product name - it is the job. Someone who wants audit logging should
    // find Splunk without having to guess we filed it under "audit".
    await userEvent.type(
      screen.getByPlaceholderText(
        "portal.connections.picker2.searchPlaceholder",
      ),
      "siem",
    );

    await waitFor(() =>
      expect(
        screen.getByText("portal.connections.types.splunk.label"),
      ).toBeInTheDocument(),
    );
    // A flat result list, not every category heading it happens to fall under.
    expect(screen.queryByText("portal.connections.types.s3.label")).toBeNull();
  });

  it("picking a vendor opens its form, and the back link returns to the grid", async () => {
    render(wrap(<ConnectionModal open onClose={vi.fn()} onSaved={vi.fn()} />));

    await userEvent.click(
      screen.getByText("portal.connections.types.purview.label"),
    );
    // The chosen vendor's own fields, not a generic form.
    await waitFor(() =>
      expect(
        screen.getByLabelText(
          "portal.connections.types.purview.fields.tenantId",
          {
            exact: false,
          },
        ),
      ).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("portal.connections.picker2.back"));
    await waitFor(() =>
      expect(
        screen.getByText("portal.connections.types.s3.label"),
      ).toBeInTheDocument(),
    );
  });

  it("says so when a search matches nothing", async () => {
    render(wrap(<ConnectionModal open onClose={vi.fn()} onSaved={vi.fn()} />));

    await userEvent.type(
      screen.getByPlaceholderText(
        "portal.connections.picker2.searchPlaceholder",
      ),
      "Fabrikam",
    );

    await waitFor(() =>
      expect(
        screen.getByText("portal.connections.picker2.noResultsTitle"),
      ).toBeInTheDocument(),
    );
    // No cards left over from the unfiltered grid.
    expect(screen.queryByText("portal.connections.types.s3.label")).toBeNull();
  });
});
