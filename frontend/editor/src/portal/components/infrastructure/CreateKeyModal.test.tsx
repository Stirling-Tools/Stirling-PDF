import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Deterministic i18n: keys returned verbatim, so assertions are stable.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { CreateKeyModal } from "@portal/components/infrastructure/CreateKeyModal";

const K = "portal.infrastructure.createKey";

function renderModal(props: Partial<ComponentProps<typeof CreateKeyModal>>) {
  return render(
    <MantineProvider>
      <CreateKeyModal open onClose={() => {}} {...props} />
    </MantineProvider>,
  );
}

describe("CreateKeyModal", () => {
  it("gates the create button on a name and at least one permission", () => {
    renderModal({});
    const cta = screen.getByRole("button", { name: `${K}.createKey` });
    expect(cta).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(`${K}.keyNamePlaceholder`), {
      target: { value: "Production ingest" },
    });
    expect(cta).toBeEnabled();
  });

  it("reveals the generated secret with a store-it warning", () => {
    renderModal({});
    fireEvent.change(screen.getByPlaceholderText(`${K}.keyNamePlaceholder`), {
      target: { value: "Production ingest" },
    });
    fireEvent.click(screen.getByRole("button", { name: `${K}.createKey` }));

    expect(screen.getByText(`${K}.secretWarning`)).toBeInTheDocument();
    expect(
      screen.getByText("sk_live_demo_key_rotate_in_prod"),
    ).toBeInTheDocument();
  });
});
