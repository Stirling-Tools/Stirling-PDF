import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import SignatureAppearanceSettings from "@app/components/tools/certSign/SignatureAppearanceSettings";
import {
  CertSignParameters,
  defaultParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";
import {
  CERTIFICATE_ATTRIBUTES,
  CERTIFICATE_ATTRIBUTE_LABEL_KEYS,
} from "@app/constants/certSignConstants";

const mockT = vi.fn((key: string) => `mock-${key}`);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files: [], fileStubs: [] }),
}));

// The thumbnail picker pulls in the PDF worker, which has no business being started
// by a test about panel layout. It only renders in the "every page" mode anyway.
vi.mock("@app/components/tools/certSign/SignaturePlacementPicker", () => ({
  default: () => <div data-testid="placement-picker" />,
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

const visible: CertSignParameters = {
  ...defaultParameters,
  showSignature: true,
};

const withBox: CertSignParameters = {
  ...visible,
  signatureArea: { x: 320, y: 60, width: 200, height: 60 },
};

const renderSettings = (parameters: CertSignParameters) =>
  render(
    <TestWrapper>
      <SignatureAppearanceSettings
        parameters={parameters}
        onParameterChange={vi.fn()}
      />
    </TestWrapper>,
  );

describe("SignatureAppearanceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The bug this guards against: the reset control used to appear only once a box had
   * been placed, so finishing the placement made the panel a row taller and pushed the
   * tool's run button off the bottom of the sidebar. The control is now always there,
   * disabled until there is something to reset, so the height cannot change underfoot.
   */
  test("placing a box does not add a control to the panel", () => {
    const { unmount } = renderSettings(visible);
    const before = screen.getAllByRole("button").length;
    unmount();

    renderSettings(withBox);
    expect(screen.getAllByRole("button")).toHaveLength(before);
  });

  test("the reset control is disabled until a box has been placed", () => {
    const label = "mock-certSign.placement.reset";

    const { unmount } = renderSettings(visible);
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    unmount();

    renderSettings(withBox);
    expect(screen.getByRole("button", { name: label })).not.toBeDisabled();
  });

  test("the certificate fields start folded away and open on demand", () => {
    renderSettings(visible);

    const toggle = screen.getByRole("button", {
      name: /mock-certSign\.attributes\.title/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/attributes\.subjectCommonName/)).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    CERTIFICATE_ATTRIBUTES.forEach((attribute) => {
      expect(
        screen.getByLabelText(
          `mock-${CERTIFICATE_ATTRIBUTE_LABEL_KEYS[attribute]}`,
        ),
      ).toBeInTheDocument();
    });
  });
});
