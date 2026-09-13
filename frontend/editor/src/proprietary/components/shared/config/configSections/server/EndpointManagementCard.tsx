import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Stack, Paper, Group, MultiSelect } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { EndpointsCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

// Complete list of all endpoints from frontend tool registry (alphabetical)
const commonEndpoints = [
  "add-attachments",
  "add-image",
  "add-page-numbers",
  "add-password",
  "add-stamp",
  "add-watermark",
  "adjust-contrast",
  "auto-redact",
  "auto-rename",
  "auto-split-pdf",
  "automate",
  "booklet-imposition",
  "cert-sign",
  "compare",
  "compress-pdf",
  "crop",
  "dev-airgapped-docs",
  "dev-api-docs",
  "dev-folder-scanning-docs",
  "dev-sso-guide-docs",
  "edit-table-of-contents",
  "eml-to-pdf",
  "extract-image-scans",
  "extract-images",
  "file-to-pdf",
  "flatten",
  "get-info-on-pdf",
  "handleData",
  "html-to-pdf",
  "img-to-pdf",
  "markdown-to-pdf",
  "merge-pdfs",
  "multi-page-layout",
  "multi-tool",
  "ocr-pdf",
  "overlay-pdf",
  "pdf-to-csv",
  "pdf-to-xlsx",
  "pdf-to-epub",
  "pdf-to-html",
  "pdf-to-img",
  "pdf-to-markdown",
  "pdf-to-pdfa",
  "pdf-to-presentation",
  "pdf-to-single-page",
  "pdf-to-text",
  "pdf-to-word",
  "pdf-to-xml",
  "pipeline",
  "rearrange-pages",
  "remove-annotations",
  "remove-blanks",
  "remove-cert-sign",
  "remove-image-pdf",
  "remove-pages",
  "remove-password",
  "repair",
  "replace-invert-pdf",
  "rotate-pdf",
  "sanitize-pdf",
  "scale-pages",
  "scanner-effect",
  "show-javascript",
  "sign",
  "split-by-size-or-count",
  "split-pages",
  "split-pdf-by-chapters",
  "split-pdf-by-sections",
  "text-editor-pdf",
  "unlock-pdf-forms",
  "update-metadata",
  "validate-signature",
  "view-pdf",
];

// Complete list of functional and tool groups from EndpointConfiguration.java
const commonGroups = [
  // Functional Groups
  "PageOps",
  "Convert",
  "Security",
  "Other",
  "Advance",
  "Automation",
  "DeveloperTools",
  "DeveloperDocs",
  // Tool Groups
  "CLI",
  "Python",
  "OpenCV",
  "LibreOffice",
  "Unoconvert",
  "Java",
  "Javascript",
  "qpdf",
  "Ghostscript",
  "ImageMagick",
  "tesseract",
  "OCRmyPDF",
  "Weasyprint",
  "Pdftohtml",
  "Calibre",
  "FFmpeg",
  "veraPDF",
  "rar",
];

/** Which endpoints and endpoint groups the server refuses to expose. */
export function EndpointManagementCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: EndpointsCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <MultiSelect
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.endpoints.toRemove.label",
                    "Disabled Endpoints",
                  )}
                </span>
                <PendingBadge show={isFieldPending("toRemove")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.endpoints.toRemove.description",
                    "Select individual endpoints to disable",
                  )}
                />
              </Group>
            }
            value={settings.toRemove || []}
            onChange={(value) => {
              if (!loginEnabled) return;
              setSettings({ ...settings, toRemove: value });
            }}
            data={commonEndpoints.map((endpoint) => ({
              value: endpoint,
              label: endpoint,
            }))}
            searchable
            clearable
            placeholder={t(
              "admin.settings.endpoints.toRemove.placeholder",
              "Select endpoints to disable",
            )}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <MultiSelect
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.endpoints.groupsToRemove.label",
                    "Disabled Endpoint Groups",
                  )}
                </span>
                <PendingBadge show={isFieldPending("groupsToRemove")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.endpoints.groupsToRemove.description",
                    "Select endpoint groups to disable",
                  )}
                />
              </Group>
            }
            value={settings.groupsToRemove || []}
            onChange={(value) => {
              if (!loginEnabled) return;
              setSettings({ ...settings, groupsToRemove: value });
            }}
            data={commonGroups.map((group) => ({
              value: group,
              label: group,
            }))}
            searchable
            clearable
            placeholder={t(
              "admin.settings.endpoints.groupsToRemove.placeholder",
              "Select groups to disable",
            )}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
        </div>
      </Stack>
    </Paper>
  );
}
