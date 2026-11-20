import { useTranslation } from "react-i18next";
import { SettingsFieldLabel } from "@editor/components/shared/config/SettingsFieldLabel";
import { NumberInput, Stack, Paper, Accordion } from "@mantine/core";
import type { AdvancedCardProps } from "@editor/components/shared/config/configSections/advanced/advancedCardProps";

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
          <Accordion.Item value="officeConvert">
            <Accordion.Control>
              {t(
                "admin.settings.advanced.processExecutor.officeConvert",
                "Office conversion",
              )}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label={
                    <SettingsFieldLabel
                      info={t(
                        "admin.settings.advanced.processExecutor.officeConvertSessionLimit",
                        "Maximum concurrent conversions; 0 picks a limit from CPUs and memory",
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
                      ?.officeConvertSessionLimit ?? 0
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        sessionLimit: {
                          ...settings.processExecutor?.sessionLimit,
                          officeConvertSessionLimit: Number(value),
                        },
                      },
                    })
                  }
                  min={0}
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
                      ?.officeConvertTimeoutMinutes ?? 30
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      processExecutor: {
                        ...settings.processExecutor,
                        timeoutMinutes: {
                          ...settings.processExecutor?.timeoutMinutes,
                          officeConvertTimeoutMinutes: Number(value),
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
                "Python",
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
