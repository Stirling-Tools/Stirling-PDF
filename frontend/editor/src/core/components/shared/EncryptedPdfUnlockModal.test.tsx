import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));
// Mantine's Modal and PasswordInput loop under jsdom + React 19, so render them flat
vi.mock("@mantine/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Modal: ({ opened, children }: { opened: boolean; children: ReactNode }) =>
    opened ? <div>{children}</div> : null,
  PasswordInput: ({ label }: { label: string }) => <input aria-label={label} />,
}));

const renderModal = (isSigned: boolean) =>
  render(
    <MantineProvider>
      <EncryptedPdfUnlockModal
        opened
        fileName="aadhaar.pdf"
        password=""
        isProcessing={false}
        isSigned={isSigned}
        onPasswordChange={vi.fn()}
        onUnlock={vi.fn()}
        onSkip={vi.fn()}
      />
    </MantineProvider>,
  );

describe("EncryptedPdfUnlockModal", () => {
  it("warns about the signature and offers to keep a signed PDF locked", () => {
    renderModal(true);

    expect(screen.getByTestId("unlock-signed-warning")).toHaveTextContent(
      "keep it locked: those tools will ask for the password",
    );
    expect(
      screen.getByRole("button", { name: "Keep locked" }),
    ).toBeInTheDocument();
  });

  it("keeps the plain skip wording for unsigned PDFs", () => {
    renderModal(false);

    expect(
      screen.queryByTestId("unlock-signed-warning"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Skip for now" }),
    ).toBeInTheDocument();
  });
});
