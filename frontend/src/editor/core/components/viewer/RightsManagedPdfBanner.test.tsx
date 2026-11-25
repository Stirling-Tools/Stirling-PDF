import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { RightsManagedPdfBanner } from "@editor/components/viewer/RightsManagedPdfBanner";
import type {
  RightsManagedPermissions,
  RightsManagedProtection,
} from "@editor/services/rightsManagedPdf";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const FULL: RightsManagedPermissions = {
  view: true,
  print: true,
  copy: true,
  edit: true,
  comment: true,
  export: true,
  owner: false,
};

function protection(
  permissions: RightsManagedPermissions,
): RightsManagedProtection {
  return {
    label: null,
    rights: [],
    owner: "megan@contoso.com",
    issuedTo: null,
    issuedToOwner: false,
    contentId: null,
    custom: true,
    templateId: null,
    templateName: null,
    allowOfflineAccess: false,
    validUntilEpochSeconds: null,
    permissions,
  };
}

function renderBanner(permissions: RightsManagedPermissions) {
  render(
    <MantineProvider>
      <RightsManagedPdfBanner protection={protection(permissions)} />
    </MantineProvider>,
  );
}

describe("RightsManagedPdfBanner access summary", () => {
  it("says Full access only when every right is granted", () => {
    renderBanner(FULL);
    expect(screen.getByText("Full access")).toBeInTheDocument();
  });

  it.each<[string, Partial<RightsManagedPermissions>]>([
    ["export", { export: false }],
    ["annotations", { comment: false, edit: false }],
    ["print", { print: false }],
  ])("says Limited access when the %s right is missing", (_, missing) => {
    renderBanner({ ...FULL, ...missing });
    expect(screen.getByText("Limited access")).toBeInTheDocument();
    expect(screen.queryByText("Full access")).not.toBeInTheDocument();
  });
});
