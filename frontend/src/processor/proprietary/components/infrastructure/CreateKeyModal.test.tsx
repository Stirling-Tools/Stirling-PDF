import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Deterministic i18n: keys returned verbatim, so assertions are stable.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// Stub the API layer so no real request is made; capture the create payload.
// vi.hoisted keeps the mock fn defined before the hoisted vi.mock factory runs.
const { createApiKey } = vi.hoisted(() => ({ createApiKey: vi.fn() }));
vi.mock("@portal/api/infrastructure", () => ({ createApiKey }));

import { CreateKeyModal } from "@portal/components/infrastructure/CreateKeyModal";

const K = "portal.infrastructure.createKey";

function renderModal(props: Partial<ComponentProps<typeof CreateKeyModal>>) {
  return render(
    <MantineProvider>
      <CreateKeyModal open onClose={() => {}} onCreated={() => {}} {...props} />
    </MantineProvider>,
  );
}

describe("CreateKeyModal", () => {
  it("gates the create button on a non-empty name", () => {
    renderModal({});
    const cta = screen.getByRole("button", { name: `${K}.createKey` });
    expect(cta).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(`${K}.keyNamePlaceholder`), {
      target: { value: "Production ingest" },
    });
    expect(cta).toBeEnabled();
  });

  it("creates a key and reveals the returned secret", async () => {
    createApiKey.mockResolvedValueOnce({
      key: { id: "1", name: "Production ingest" },
      secret: "sk_live_demo_key_rotate_in_prod",
    });
    const onCreated = vi.fn();
    renderModal({ onCreated });

    fireEvent.change(screen.getByPlaceholderText(`${K}.keyNamePlaceholder`), {
      target: { value: "Production ingest" },
    });
    fireEvent.click(screen.getByRole("button", { name: `${K}.createKey` }));

    expect(await screen.findByText(`${K}.secretWarning`)).toBeInTheDocument();
    expect(
      screen.getByText("sk_live_demo_key_rotate_in_prod"),
    ).toBeInTheDocument();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createApiKey).toHaveBeenCalledWith({ name: "Production ingest" });
  });
});
