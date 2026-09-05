import { useMemo, useState } from "react";
import {
  Alert,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { column, DataTable } from "@app/ui/DataTable";
import { HardwareCertificateInfo } from "@app/services/hardwareSigningService";
import {
  byUsefulness,
  displayName,
  distinctIssuer,
  expiryDate,
  isUsable,
  matches,
  validityOf,
} from "@app/utils/certSign/hardwareCertificateDisplay";

interface HardwareCertificateModalProps {
  opened: boolean;
  onClose: () => void;
  certs: HardwareCertificateInfo[];
  loading: boolean;
  error: string | null;
  selectedAlias?: string;
  onSelect: (cert: HardwareCertificateInfo) => void;
  onRefresh: () => void;
}

/**
 * Picks a signing certificate from a table wide enough to tell them apart.
 *
 * <p>The side panel is a few hundred pixels across, which is not enough for a subject, an issuer
 * and an expiry date on one line: the names collapse into each other and choosing between two
 * certificates from the same authority becomes guesswork. A dialog has the width to give each of
 * those its own column, and leaves the panel showing only the one that was chosen.
 */
const HardwareCertificateModal = ({
  opened,
  onClose,
  certs,
  loading,
  error,
  selectedAlias,
  onSelect,
  onRefresh,
}: HardwareCertificateModalProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => certs.filter((cert) => matches(cert, query)).sort(byUsefulness),
    [certs, query],
  );

  const validityLabels = {
    valid: t("certSign.hardware.valid", "Valid"),
    expired: t("certSign.hardware.expired", "expired"),
    notYetValid: t("certSign.hardware.notYetValid", "not yet valid"),
  };

  const columns = [
    column.entity<HardwareCertificateInfo>({
      key: "name",
      header: t("certSign.hardware.columns.certificate", "Certificate"),
      primary: displayName,
      // Marks the one already in use, so reopening the dialog says where you are.
      suffix: (cert) =>
        cert.alias === selectedAlias
          ? t("certSign.hardware.current", "(in use)")
          : null,
      note: (cert) => cert.subject,
      sortable: true,
    }),
    column.text<HardwareCertificateInfo>({
      key: "issuer",
      header: t("certSign.hardware.columns.issuer", "Issued by"),
      get: (cert) => distinctIssuer(cert) ?? "—",
      sortable: true,
    }),
    column.text<HardwareCertificateInfo>({
      key: "expiry",
      header: t("certSign.hardware.columns.validUntil", "Valid until"),
      get: expiryDate,
      // Sorted on the raw instant, so the column orders by date and not by digit.
      sortBy: (cert) => cert.notAfter ?? "",
      sortable: true,
    }),
    column.badge<HardwareCertificateInfo>({
      key: "status",
      header: t("certSign.hardware.columns.status", "Status"),
      get: (cert) => {
        const validity = validityOf(cert);
        return {
          tone: validity === "valid" ? "success" : "danger",
          label: validityLabels[validity],
        };
      },
      sortable: true,
    }),
    column.text<HardwareCertificateInfo>({
      key: "source",
      header: t("certSign.hardware.columns.source", "Type"),
      get: (cert) =>
        cert.source === "WINDOWS_STORE"
          ? t("certSign.format.windowsStore", "Windows certificate store")
          : t("certSign.format.pkcs11", "USB Token"),
    }),
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="xl"
      title={t("certSign.hardware.modalTitle", "Choose a signing certificate")}
    >
      <Stack gap="md">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t(
            "certSign.hardware.search",
            "Search by name, issuer or serial number",
          )}
          disabled={loading}
        />

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {loading ? (
          <Group gap="xs" justify="center" py="md">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              {t("certSign.hardware.loading", "Reading certificates…")}
            </Text>
          </Group>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(cert) => cert.alias}
            onRowClick={(cert) => {
              onSelect(cert);
              onClose();
            }}
            // An expired certificate cannot produce a valid signature, so it is shown -
            // knowing it is there and unusable beats wondering where it went - but not offered.
            isRowInteractive={isUsable}
            rowAffordance="chevron"
            defaultSort={{ key: "name" }}
            empty={
              <Text size="sm" c="dimmed">
                {t(
                  "certSign.hardware.noCerts",
                  "No signing certificates found",
                )}
              </Text>
            }
          />
        )}

        <Group justify="space-between">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            {t("certSign.hardware.refresh", "Refresh")}
          </Button>
          <Button variant="tertiary" onClick={onClose}>
            {t("certSign.hardware.cancel", "Cancel")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default HardwareCertificateModal;
export type { HardwareCertificateModalProps };
