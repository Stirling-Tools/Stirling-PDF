import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { S3ConnectionPicker } from "@portal/components/sources/S3ConnectionPicker";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchS3Connections = vi.fn();
const createIntegration = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchS3Connections: () => fetchS3Connections(),
  createIntegration: (...a: unknown[]) => createIntegration(...a),
  updateIntegration: vi.fn(),
}));

describe("S3ConnectionPicker", () => {
  beforeEach(() => {
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
    createIntegration.mockReset();
  });

  it("creates a connection inline and selects it", async () => {
    createIntegration.mockResolvedValue({ id: 7, name: "New bucket" });
    const onChange = vi.fn();
    render(<S3ConnectionPicker value="" onChange={onChange} />);

    fireEvent.click(
      await screen.findByText("portal.connections.picker.createNew"),
    );
    fireEvent.change(
      screen.getByLabelText(/portal\.connections\.s3\.fields\.name/),
      { target: { value: "New bucket" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.s3\.fields\.bucket\.label/,
      ),
      { target: { value: "inbox" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.s3\.fields\.accessKeyId\.label/,
      ),
      { target: { value: "AKIA" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.s3\.fields\.secretAccessKey\.label/,
      ),
      { target: { value: "shh" } },
    );
    fireEvent.click(screen.getByText("portal.connections.picker.save"));

    await waitFor(() => expect(createIntegration).toHaveBeenCalledTimes(1));
    // The newly created connection's id is selected in the parent.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("7"));
  });
});
