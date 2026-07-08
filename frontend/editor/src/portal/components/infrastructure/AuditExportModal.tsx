import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Modal, RadioGroup } from "@app/ui";
import { exportAuditLog } from "@portal/api/infrastructure";

interface AuditExportModalProps {
  open: boolean;
  onClose: () => void;
}

type ExportFormat = "csv" | "json";

/** Columns offered for export - mirrors the editor's audit export section. */
const FIELD_KEYS = [
  "date",
  "username",
  "ipaddress",
  "tool",
  "documentName",
  "outcome",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const DEFAULT_FIELDS: Record<FieldKey, boolean> = {
  date: true,
  username: true,
  ipaddress: false,
  tool: true,
  documentName: true,
  outcome: true,
};

/**
 * Export the audit log to CSV/JSON via the admin-only, whole-server
 * `/audit-export` endpoint (routed through the portal's local/saas client). The
 * caller only reaches this modal from the full-server view, so it's admin-gated.
 */
export function AuditExportModal({ open, onClose }: AuditExportModalProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [fields, setFields] =
    useState<Record<FieldKey, boolean>>(DEFAULT_FIELDS);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyField = FIELD_KEYS.some((k) => fields[k]);

  async function handleExport() {
    setError(null);
    setExporting(true);
    try {
      const fieldsParam = FIELD_KEYS.filter((k) => fields[k]).join(",");
      const blob = await exportAuditLog(format, fieldsParam);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-export-${new Date().toISOString()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError(t("portal.infrastructure.audit.export.error"));
    } finally {
      setExporting(false);
    }
  }

  const fieldLabel: Record<FieldKey, string> = {
    date: t("portal.infrastructure.audit.export.fields.date"),
    username: t("portal.infrastructure.audit.export.fields.username"),
    ipaddress: t("portal.infrastructure.audit.export.fields.ipAddress"),
    tool: t("portal.infrastructure.audit.export.fields.tool"),
    documentName: t("portal.infrastructure.audit.export.fields.documentName"),
    outcome: t("portal.infrastructure.audit.export.fields.outcome"),
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("portal.infrastructure.audit.export.title")}
      subtitle={t("portal.infrastructure.audit.export.subtitle")}
      footer={
        <div className="portal-infra__export-actions">
          <Button variant="tertiary" onClick={onClose} disabled={exporting}>
            {t("portal.infrastructure.audit.export.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={exporting || !anyField}
          >
            {exporting
              ? t("portal.infrastructure.audit.export.exporting")
              : t("portal.infrastructure.audit.export.exportButton")}
          </Button>
        </div>
      }
    >
      <div className="portal-infra__export">
        <div className="portal-infra__export-group">
          <span className="portal-infra__export-label">
            {t("portal.infrastructure.audit.export.format")}
          </span>
          <RadioGroup<ExportFormat>
            name="audit-export-format"
            value={format}
            onChange={setFormat}
            direction="horizontal"
            options={[
              { value: "csv", label: "CSV" },
              { value: "json", label: "JSON" },
            ]}
          />
        </div>

        <div className="portal-infra__export-group">
          <span className="portal-infra__export-label">
            {t("portal.infrastructure.audit.export.fieldsLegend")}
          </span>
          <div className="portal-infra__export-fields">
            {FIELD_KEYS.map((k) => (
              <Checkbox
                key={k}
                label={fieldLabel[k]}
                checked={fields[k]}
                onChange={(e) => {
                  // Capture the value synchronously - React nulls `currentTarget`
                  // before the (async) state updater runs.
                  const checked = e.target.checked;
                  setFields((prev) => ({ ...prev, [k]: checked }));
                }}
              />
            ))}
          </div>
        </div>

        {error && <p className="portal-infra__export-error">{error}</p>}
      </div>
    </Modal>
  );
}
