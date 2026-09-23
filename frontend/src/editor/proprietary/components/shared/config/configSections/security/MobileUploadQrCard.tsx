import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { useNavigate } from "react-router-dom";
import {
  Stack,
  Paper,
  Text,
  Group,
  Switch,
  Select,
  Anchor,
  Collapse,
} from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { ConnectionsCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** QR-code handoff so a phone can push files into this session. */
export function MobileUploadQrCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
  getDisabledStyles,
}: ConnectionsCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        {/* Documentation Link */}
        <Anchor
          href="https://docs.stirlingpdf.com/Functionality/Mobile-Scanner"
          target="_blank"
          size="xs"
          c="var(--c-accent-text)"
        >
          {t("admin.settings.connections.documentation", "View documentation")}{" "}
          ↗
        </Anchor>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.connections.mobileScanner.enable",
                "Enable QR Code Upload",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.connections.mobileScanner.description",
                  "Allow users to upload files from mobile devices by scanning a QR code",
                )}
              />
            </Text>
            <Text size="xs" c="var(--color-amber-dark)" mt={8} fw={500}>
              {t(
                "admin.settings.connections.mobileScanner.note",
                "Note: Requires Frontend URL to be configured. ",
              )}
              <Anchor
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/settings/adminGeneral#frontendUrl");
                }}
                c="var(--color-amber-dark)"
                td="underline"
              >
                {t(
                  "admin.settings.connections.mobileScanner.link",
                  "Configure in System Settings",
                )}
              </Anchor>
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings?.enableMobileScanner || false}
              onChange={(e) => {
                if (!loginEnabled) return; // Block change when login disabled
                setSettings({
                  ...settings,
                  enableMobileScanner: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("enableMobileScanner")} />
          </Group>
        </div>

        {/* Mobile Scanner Settings - Only show when enabled */}
        <Collapse in={settings?.enableMobileScanner || false}>
          <Stack
            gap="md"
            mt="md"
            ml="lg"
            style={{
              borderLeft: "2px solid var(--mantine-color-gray-3)",
              paddingLeft: "1rem",
            }}
          >
            {/* Convert to PDF */}
            <div>
              <Text size="sm" fw={500} mb="xs">
                {t(
                  "admin.settings.connections.mobileScannerConvertToPdf",
                  "Convert Images to PDF",
                )}{" "}
                <InfoTooltip
                  label={t(
                    "admin.settings.connections.mobileScannerConvertToPdfDesc",
                    "Automatically convert uploaded images to PDF format. If disabled, images will be kept as-is.",
                  )}
                />
              </Text>
              <Group gap="xs">
                <Switch
                  checked={settings?.mobileScannerConvertToPdf !== false}
                  onChange={(e) => {
                    if (!loginEnabled) return;
                    setSettings({
                      ...settings,
                      mobileScannerConvertToPdf: e.target.checked,
                    });
                  }}
                  disabled={!loginEnabled}
                />
                <PendingBadge
                  show={isFieldPending("mobileScannerConvertToPdf")}
                />
              </Group>
            </div>

            {/* PDF Conversion Settings - Only show when convertToPdf is enabled */}
            {settings?.mobileScannerConvertToPdf !== false && (
              <>
                {/* Image Resolution */}
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t(
                      "admin.settings.connections.mobileScannerImageResolution",
                      "Image Resolution",
                    )}{" "}
                    <InfoTooltip
                      label={t(
                        "admin.settings.connections.mobileScannerImageResolutionDesc",
                        'Resolution of uploaded images. "Reduced" scales images to max 1200px to reduce file size.',
                      )}
                    />
                  </Text>
                  <Group gap="xs">
                    <Select
                      value={settings?.mobileScannerImageResolution || "full"}
                      onChange={(value) => {
                        if (!loginEnabled) return;
                        setSettings({
                          ...settings,
                          mobileScannerImageResolution: value || "full",
                        });
                      }}
                      data={[
                        {
                          value: "full",
                          label: t(
                            "admin.settings.connections.imageResolutionFull",
                            "Full (Original Size)",
                          ),
                        },
                        {
                          value: "reduced",
                          label: t(
                            "admin.settings.connections.imageResolutionReduced",
                            "Reduced (Max 1200px)",
                          ),
                        },
                      ]}
                      disabled={!loginEnabled}
                      style={{ width: "250px" }}
                      comboboxProps={{
                        withinPortal: true,
                        zIndex: Z_INDEX_OVER_CONFIG_MODAL,
                      }}
                    />
                    <PendingBadge
                      show={isFieldPending("mobileScannerImageResolution")}
                    />
                  </Group>
                </div>

                {/* Page Format */}
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t(
                      "admin.settings.connections.mobileScannerPageFormat",
                      "Page Format",
                    )}{" "}
                    <InfoTooltip
                      label={t(
                        "admin.settings.connections.mobileScannerPageFormatDesc",
                        'PDF page size for converted images. "Keep" uses original image dimensions.',
                      )}
                    />
                  </Text>
                  <Group gap="xs">
                    <Select
                      value={settings?.mobileScannerPageFormat || "A4"}
                      onChange={(value) => {
                        if (!loginEnabled) return;
                        setSettings({
                          ...settings,
                          mobileScannerPageFormat: value || "A4",
                        });
                      }}
                      data={[
                        {
                          value: "keep",
                          label: t(
                            "admin.settings.connections.pageFormatKeep",
                            "Keep (Original Dimensions)",
                          ),
                        },
                        {
                          value: "A4",
                          label: t(
                            "admin.settings.connections.pageFormatA4",
                            "A4 (210×297mm)",
                          ),
                        },
                        {
                          value: "letter",
                          label: t(
                            "admin.settings.connections.pageFormatLetter",
                            "Letter (8.5×11in)",
                          ),
                        },
                      ]}
                      disabled={!loginEnabled}
                      style={{ width: "250px" }}
                      comboboxProps={{
                        withinPortal: true,
                        zIndex: Z_INDEX_OVER_CONFIG_MODAL,
                      }}
                    />
                    <PendingBadge
                      show={isFieldPending("mobileScannerPageFormat")}
                    />
                  </Group>
                </div>

                {/* Stretch to Fit */}
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t(
                      "admin.settings.connections.mobileScannerStretchToFit",
                      "Stretch to Fit",
                    )}{" "}
                    <InfoTooltip
                      label={t(
                        "admin.settings.connections.mobileScannerStretchToFitDesc",
                        "Stretch images to fill the entire page. If disabled, images are centered with preserved aspect ratio.",
                      )}
                    />
                  </Text>
                  <Group gap="xs">
                    <Switch
                      checked={settings?.mobileScannerStretchToFit || false}
                      onChange={(e) => {
                        if (!loginEnabled) return;
                        setSettings({
                          ...settings,
                          mobileScannerStretchToFit: e.target.checked,
                        });
                      }}
                      disabled={!loginEnabled}
                    />
                    <PendingBadge
                      show={isFieldPending("mobileScannerStretchToFit")}
                    />
                  </Group>
                </div>
              </>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}
