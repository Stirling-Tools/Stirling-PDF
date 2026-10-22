import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, expect, it, vi } from "vitest";
import {
  CertificateSelector,
  type CertificateType,
} from "@app/components/tools/certSign/CertificateSelector";

const { config } = vi.hoisted(() => ({
  config: { runningProOrHigher: false, serverCertificateEnabled: true },
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/components/shared/FileUploadButton", () => ({
  default: () => <button>Upload certificate file</button>,
}));

beforeEach(() => {
  config.runningProOrHigher = false;
  config.serverCertificateEnabled = true;
});

function setup(certType: CertificateType = "SERVER") {
  const onCertTypeChange = vi.fn();
  render(
    <MantineProvider>
      <CertificateSelector
        certType={certType}
        onCertTypeChange={onCertTypeChange}
        uploadFormat="PKCS12"
        onUploadFormatChange={vi.fn()}
        p12File={null}
        onP12FileChange={vi.fn()}
        privateKeyFile={null}
        onPrivateKeyFileChange={vi.fn()}
        certFile={null}
        onCertFileChange={vi.fn()}
        jksFile={null}
        onJksFileChange={vi.fn()}
        password=""
        onPasswordChange={vi.fn()}
      />
    </MantineProvider>,
  );
  return onCertTypeChange;
}

it("offers organization signing without a paid license", () => {
  const onChange = setup("UPLOAD");
  fireEvent.click(
    screen.getByRole("radio", { name: /Stirling Sign · Organization/ }),
  );
  expect(onChange).toHaveBeenCalledWith("SERVER");
  expect(
    screen.queryByRole("radio", { name: /Stirling Sign · Personal/ }),
  ).not.toBeInTheDocument();
});

it("selects the available organization certificate when personal signing is unavailable", () => {
  const onChange = setup("USER_CERT");
  expect(onChange).toHaveBeenCalledWith("SERVER");
});

it("preserves a server certificate selection on the free tier", () => {
  const onChange = setup();
  expect(
    screen.getByRole("radio", { name: /Stirling Sign · Organization/ }),
  ).toBeChecked();
  expect(onChange).not.toHaveBeenCalled();
});

it("falls back to upload when the administrator disables organization signing", () => {
  config.serverCertificateEnabled = false;
  const onChange = setup();
  expect(
    screen.queryByRole("radio", { name: /Stirling Sign · Organization/ }),
  ).not.toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith("UPLOAD");
});

it("keeps personal signing available on paid servers with organization signing disabled", () => {
  config.runningProOrHigher = true;
  config.serverCertificateEnabled = false;
  const onChange = setup("USER_CERT");
  expect(
    screen.getByRole("radio", { name: /Stirling Sign · Personal/ }),
  ).toBeChecked();
  expect(
    screen.queryByRole("radio", { name: /Stirling Sign · Organization/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("radio", { name: "Upload a certificate" }),
  ).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
