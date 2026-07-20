import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { S3ConnectionModal } from "@processor/components/sources/S3ConnectionModal";
import type { IntegrationConfig } from "@processor/api/integrations";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const createIntegration = vi.fn();
const updateIntegration = vi.fn();
vi.mock("@processor/api/integrations", () => ({
  createIntegration: (...a: unknown[]) => createIntegration(...a),
  updateIntegration: (...a: unknown[]) => updateIntegration(...a),
}));

function setField(labelPattern: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(labelPattern), { target: { value } });
}

describe("S3ConnectionModal", () => {
  beforeEach(() => {
    createIntegration.mockReset();
    updateIntegration.mockReset();
  });

  it("creates a team-scoped connection from the entered fields", async () => {
    createIntegration.mockResolvedValue({ id: 5, name: "Claims bucket" });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<S3ConnectionModal open onClose={onClose} onSaved={onSaved} />);

    setField(/portal\.connections\.s3\.fields\.name/, "Claims bucket");
    setField(/portal\.sources\.types\.s3\.fields\.bucket\.label/, "inbox");
    setField(/portal\.sources\.types\.s3\.fields\.accessKeyId\.label/, "AKIA");
    setField(
      /portal\.sources\.types\.s3\.fields\.secretAccessKey\.label/,
      "shh",
    );
    fireEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() => expect(createIntegration).toHaveBeenCalledTimes(1));
    expect(createIntegration).toHaveBeenCalledWith({
      integrationType: "S3",
      name: "Claims bucket",
      scope: "TEAM",
      config: {
        bucket: "inbox",
        region: "us-east-1",
        endpoint: "",
        accessKeyId: "AKIA",
        secretAccessKey: "shh",
      },
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalled();
  });

  it("round-trips a masked secret unchanged on edit (keeps the stored value)", async () => {
    updateIntegration.mockResolvedValue({ id: 5, name: "Claims bucket" });
    // The API returns secrets masked; the modal must resend the sentinel verbatim
    // so the backend keeps the stored secret rather than overwriting it.
    const connection = {
      id: 5,
      integrationType: "S3",
      name: "Claims bucket",
      config: {
        bucket: "inbox",
        region: "us-east-1",
        accessKeyId: "AKIA",
        secretAccessKey: "********",
      },
      canManage: true,
    } as unknown as IntegrationConfig;

    render(
      <S3ConnectionModal
        open
        connection={connection}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const secret = screen.getByLabelText(
      /portal\.sources\.types\.s3\.fields\.secretAccessKey\.label/,
    ) as HTMLInputElement;
    expect(secret.value).toBe("********");
    // Change only the name; leave the masked secret untouched.
    setField(/portal\.connections\.s3\.fields\.name/, "Renamed bucket");
    fireEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() => expect(updateIntegration).toHaveBeenCalledTimes(1));
    expect(updateIntegration).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        name: "Renamed bucket",
        config: expect.objectContaining({ secretAccessKey: "********" }),
      }),
    );
  });

  it("keeps save disabled until the required fields are present", () => {
    render(<S3ConnectionModal open onClose={vi.fn()} onSaved={vi.fn()} />);
    const save = () =>
      screen.getByText("portal.connections.picker.save").closest("button");

    expect(save()).toBeDisabled();
    setField(/portal\.connections\.s3\.fields\.name/, "Only a name");
    expect(save()).toBeDisabled();
    setField(/portal\.sources\.types\.s3\.fields\.bucket\.label/, "inbox");
    setField(/portal\.sources\.types\.s3\.fields\.accessKeyId\.label/, "AKIA");
    setField(
      /portal\.sources\.types\.s3\.fields\.secretAccessKey\.label/,
      "shh",
    );
    expect(save()).not.toBeDisabled();
  });
});
