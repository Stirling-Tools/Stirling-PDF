import { useTranslation } from "react-i18next";
import { SettingsFieldLabel } from "@app/components/shared/config/SettingsFieldLabel";
import { NumberInput, Stack, Paper, Accordion } from "@mantine/core";
import type { AdvancedCardProps } from "@app/components/shared/config/configSections/advanced/advancedCardProps";

/** Per-executor concurrency and timeouts. */
export function AdvancedProcessExecutorCard({
  settings,
  setSettings,
  loginEnabled,
}: AdvancedCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Accordion variant="separated">
          <Accordion.Item value="libreOffice">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.libreOffice",
                "LibreOffice",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.libreOfficeSessionLimit ?? 1
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          libreOfficeSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.libreOfficetimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          libreOfficetimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="pdfToHtml">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.pdfToHtml",
                "PDF to HTML",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.pdfToHtmlSessionLimit ?? 1
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          pdfToHtmlSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.pdfToHtmltimeoutMinutes ?? 20
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          pdfToHtmltimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="qpdf">
            <Accordion.Control>
              {t("admin.settings.advanced.processExecutor.qpdf", "QPDF")}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit?.qpdfSessionLimit ??
                    4
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          qpdfSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.qpdfTimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          qpdfTimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Tesseract OCR */}
          <Accordion.Item value="tesseract">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.tesseract",
                "Tesseract OCR",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.tesseractSessionLimit ?? 1
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          tesseractSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.tesseractTimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          tesseractTimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="pythonOpenCv">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.pythonOpenCv",
                "Python OpenCV",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.pythonOpenCvSessionLimit ?? 8
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          pythonOpenCvSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.pythonOpenCvtimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          pythonOpenCvtimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="weasyPrint">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.weasyPrint",
                "WeasyPrint",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.weasyPrintSessionLimit ?? 16
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          weasyPrintSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.weasyPrinttimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          weasyPrinttimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="installApp">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.installApp",
                "Install App",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.installAppSessionLimit ?? 1
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          installAppSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.installApptimeoutMinutes ?? 60
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          installApptimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="calibre">
            <Accordion.Control>
              {t("admin.settings.advanced.processExecutor.calibre", "Calibre")}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.calibreSessionLimit ?? 1
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          calibreSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.calibretimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          calibretimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="ghostscript">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.ghostscript",
                "Ghostscript",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.ghostscriptSessionLimit ?? 8
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          ghostscriptSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.ghostscriptTimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          ghostscriptTimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="ocrMyPdf">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.ocrMyPdf",
                "OCRmyPDF",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.sessionLimit.description",
                        "Maximum concurrent instances",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.sessionLimit.label",
                        "Session Limit",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.sessionLimit
                      ?.ocrMyPdfSessionLimit ?? 2
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          ocrMyPdfSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={100}
                  disabled={!loginEnabled}
                />
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.timeout.description",
                        "Maximum execution time",
                      )}
                    >
                      {t(
                        "admin.settings.advanced.processExecutor.timeout.label",
                        "Timeout (minutes)",
                      )}
                    </SettingsFieldLabel>
                  }
                  value={
                    settings.processExecutor?.timeoutMinutes
                      ?.ocrMyPdfTimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          ocrMyPdfTimeoutMinutes: Number(value),
                        },
                      },
                    })
                  }
                  min={1}
                  max={240}
                  disabled={!loginEnabled}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Paper>
  );
}
