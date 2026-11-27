import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import LanguagePicker, {
  LANGUAGE_CATALOG_ENDPOINT,
} from "@editor/components/tools/ocr/LanguagePicker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, string>) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(options?.[name] ?? ""),
      ),
    i18n: { language: "en-GB" },
  }),
}));

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get, post } }));

const renderPicker = (onChange = vi.fn(), value: string[] = []) => {
  render(
    <MantineProvider>
      <LanguagePicker value={value} onChange={onChange} />
    </MantineProvider>,
  );
  return onChange;
};

const openDropdown = async () => {
  fireEvent.click(await screen.findByRole("button"));
};

describe("LanguagePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data:
          url === LANGUAGE_CATALOG_ENDPOINT
            ? {
                installed: ["eng"],
                installable: [
                  { code: "fra", sizeBytes: 1130365, source: "DOWNLOAD" },
                ],
                canInstall: true,
              }
            : { languages: ["eng"] },
      }),
    );
  });

  test("installs a downloadable language when it is picked, then selects it", async () => {
    post.mockResolvedValue({
      data: { installed: ["eng", "fra"], installable: [], canInstall: true },
    });
    const onChange = renderPicker();
    await openDropdown();

    fireEvent.click(await screen.findByText(/French \(/));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        `${LANGUAGE_CATALOG_ENDPOINT}/fra`,
        undefined,
        { timeout: 0 },
      ),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(["fra"]));
    expect(
      screen.queryByText(/Languages showing a size are added/),
    ).not.toBeInTheDocument();
  });

  test("falls back to the setup guide when the backend cannot install languages", async () => {
    get.mockImplementation((url: string) =>
      url === LANGUAGE_CATALOG_ENDPOINT
        ? Promise.reject(new Error("404"))
        : Promise.resolve({ data: { languages: ["eng"] } }),
    );
    renderPicker();
    await openDropdown();

    expect(await screen.findByText("View setup guide →")).toBeInTheDocument();
    expect(screen.queryByText(/French \(/)).not.toBeInTheDocument();
  });

  test("leaves languages already in the selection alone instead of installing them", async () => {
    // A saved automation can name a language this machine does not have.
    const onChange = renderPicker(vi.fn(), ["deu"]);
    await openDropdown();

    fireEvent.click(await screen.findByText("English"));

    expect(onChange).toHaveBeenCalledWith(["deu", "eng"]);
    expect(post).not.toHaveBeenCalled();
  });

  test("reports a failed install without selecting the language", async () => {
    post.mockRejectedValue(new Error("network down"));
    const onChange = renderPicker();
    await openDropdown();

    fireEvent.click(await screen.findByText(/French \(/));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn't add French/,
    );
    expect(onChange).not.toHaveBeenCalledWith(["fra"]);
  });
});
