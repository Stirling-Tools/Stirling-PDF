import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import ProviderCard from "@editor/components/shared/config/configSections/ProviderCard";
import type { Provider } from "@editor/components/shared/config/configSections/providerDefinitions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const copyText = vi.hoisted(() => vi.fn());
vi.mock("@editor/utils/copyText", () => ({
  copyText: (text: string) => copyText(text),
}));

const provider: Provider = {
  id: "microsoft",
  category: "integration",
  name: "Microsoft 365",
  icon: "onedrive",
  type: "microsoft",
  scope: "Files & pipelines",
  fields: [
    {
      key: "clientId",
      type: "text",
      label: "Client ID",
      description: "From the app registration",
    },
    {
      key: "redirectUri",
      type: "copy",
      label: "Redirect URI",
      description: "Register this on the app",
      value:
        "https://pdf.example.com/api/v1/connected-accounts/callback/microsoft",
    },
  ],
};

function renderCard(onSave = vi.fn()) {
  render(
    <MantineProvider>
      <ProviderCard
        provider={provider}
        isConfigured
        settings={{ clientId: "abc" }}
        onSave={onSave}
      />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByText("admin.expand"));
  return onSave;
}

describe("ProviderCard copy field", () => {
  it("shows the value read-only with its description", () => {
    renderCard();
    const input = screen.getByTestId(
      "provider-copy-redirectUri",
    ) as HTMLInputElement;
    expect(input.value).toBe(
      "https://pdf.example.com/api/v1/connected-accounts/callback/microsoft",
    );
    expect(input.readOnly).toBe(true);
    expect(screen.getByText("Register this on the app")).toBeTruthy();
  });

  it("copies the value and confirms it", async () => {
    copyText.mockResolvedValue(true);
    renderCard();
    fireEvent.click(screen.getByText("common.copy"));
    await waitFor(() =>
      expect(copyText).toHaveBeenCalledWith(
        "https://pdf.example.com/api/v1/connected-accounts/callback/microsoft",
      ),
    );
    expect(await screen.findByText("common.copied")).toBeTruthy();
  });

  it("never saves the copied value as a setting", () => {
    const onSave = renderCard();
    fireEvent.click(screen.getByText("admin.settings.save"));
    expect(onSave).toHaveBeenCalledWith({ clientId: "abc" });
  });
});
