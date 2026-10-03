import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import HardwareCertificateModal from "@app/components/tools/certSign/modals/HardwareCertificateModal";
import { HardwareCertificateInfo } from "@app/services/hardwareSigningService";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

const cert = (
  name: string,
  overrides: Partial<HardwareCertificateInfo> = {},
): HardwareCertificateInfo => ({
  alias: name,
  source: "WINDOWS_STORE",
  subject: `CN=${name}`,
  issuer: "CN=FNMT-RCM, C=ES",
  subjectCommonName: name,
  issuerCommonName: "FNMT-RCM",
  serialNumber: "1a2b3c4d5e6f",
  keyAlgorithm: "RSA",
  notBefore: "2025-01-01T00:00:00Z",
  notAfter: "2027-04-11T00:00:00Z",
  expired: false,
  notYetValid: false,
  ...overrides,
});

const NAMES = /^(Abad|Zurita)$/;

describe("HardwareCertificateModal", () => {
  test("offers a usable certificate before an expired one, whatever the names", () => {
    render(
      <MantineProvider>
        <HardwareCertificateModal
          opened
          onClose={vi.fn()}
          certs={[cert("Abad", { expired: true }), cert("Zurita")]}
          loading={false}
          error={null}
          onSelect={vi.fn()}
          onRefresh={vi.fn()}
        />
      </MantineProvider>,
    );

    expect(screen.getAllByText(NAMES).map((name) => name.textContent)).toEqual([
      "Zurita",
      "Abad",
    ]);
  });
});
