import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import HardwareCertificateModal from "@app/components/tools/certSign/modals/HardwareCertificateModal";
import { Button } from "@app/ui/Button";
import { HardwareCertificateInfo } from "@app/services/hardwareSigningService";

const cert = (
  overrides: Partial<HardwareCertificateInfo>,
): HardwareCertificateInfo => ({
  alias: "Jane Doe",
  source: "WINDOWS_STORE",
  subject: "CN=Jane Doe, O=Acme Holdings, OU=Finance, C=ES",
  issuer: "CN=FNMT-RCM, C=ES",
  subjectCommonName: "Jane Doe",
  issuerCommonName: "FNMT-RCM",
  serialNumber: "1a2b3c4d5e6f",
  keyAlgorithm: "RSA",
  notBefore: "2025-01-01T00:00:00Z",
  notAfter: "2027-04-11T00:00:00Z",
  expired: false,
  notYetValid: false,
  ...overrides,
});

// Names of the length the reviewer reported: in the side panel these ran into each
// other, which is the whole reason the dialog exists.
const CERTS: HardwareCertificateInfo[] = [
  cert({
    alias: "ASSESSORIA EM NEGOCIOS LTDA:53280626000165",
    subjectCommonName: "ASSESSORIA EM NEGOCIOS LTDA:53280626000165",
    subject:
      "CN=ASSESSORIA EM NEGOCIOS LTDA:53280626000165, O=ICP-Brasil, OU=AC SyngularID Multipla, C=BR",
    issuerCommonName: "AC SyngularID Multipla",
    notAfter: "2027-02-18T00:00:00Z",
  }),
  cert({
    alias: "Samuel Saez",
    subjectCommonName: "Samuel Saez",
    subject: "CN=Samuel Saez, OU=Desarrollo, O=IMGA, C=ES",
    issuerCommonName: "Samuel Saez",
    notAfter: "2036-08-15T00:00:00Z",
  }),
  cert({
    alias: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    subjectCommonName: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    subject: "CN=3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    issuerCommonName: "MS-Organization-Access",
    notAfter: "2056-03-03T00:00:00Z",
  }),
  cert({
    alias: "Old Token Key",
    subjectCommonName: "Old Token Key",
    source: "PKCS11",
    notAfter: "2024-01-01T00:00:00Z",
    expired: true,
  }),
];

const meta = {
  title: "Tools/CertSign/HardwareCertificateModal",
  component: HardwareCertificateModal,
  args: {
    opened: true,
    onClose: () => {},
    certs: CERTS,
    loading: false,
    error: null,
    onSelect: () => {},
    onRefresh: () => {},
  },
} satisfies Meta<typeof HardwareCertificateModal>;
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The dialog takes the list as a prop rather than loading it, so a story can show every state
 * without a backend - and so the panel and the dialog cannot end up reading the store separately.
 */
const ModalDemo = (props: {
  certs: HardwareCertificateInfo[];
  loading?: boolean;
  error?: string | null;
  selectedAlias?: string;
}) => {
  const [opened, setOpened] = useState(true);
  const [alias, setAlias] = useState(props.selectedAlias);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpened(true)}>
        Choose certificate…
      </Button>
      <HardwareCertificateModal
        opened={opened}
        onClose={() => setOpened(false)}
        certs={props.certs}
        loading={props.loading ?? false}
        error={props.error ?? null}
        selectedAlias={alias}
        onSelect={(c) => setAlias(c.alias)}
        onRefresh={() => {}}
      />
    </>
  );
};

export const Default: Story = {
  render: () => <ModalDemo certs={CERTS} />,
};

/** One already chosen, which the list marks so reopening says where you are. */
export const WithSelection: Story = {
  render: () => <ModalDemo certs={CERTS} selectedAlias="Samuel Saez" />,
};

export const Loading: Story = {
  render: () => <ModalDemo certs={[]} loading />,
};

export const Empty: Story = {
  render: () => <ModalDemo certs={[]} />,
};

export const LoadFailed: Story = {
  render: () => (
    <ModalDemo
      certs={[]}
      error="Could not read the Windows certificate store"
    />
  ),
};
