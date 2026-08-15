import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Checkbox, Loader, Modal, ScrollArea, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { getOcrDisplayName } from "@app/utils/languageMapping";
import {
  changeOcrLanguages,
  formatBytes,
  getOcrRuntimeStatus,
  installOcrEngine,
  type OcrRuntimeStatus,
} from "@app/services/ocrRuntimeService";

export interface OcrRuntimeManagerProps {
  opened: boolean;
  onClose: () => void;
  /** Lets the picker refresh itself once the installed set has changed. */
  onLanguagesChanged?: () => void;
}

/**
 * Installs the OCR engine and picks which language models to keep.
 *
 * Two separate actions on purpose: the engine is a one-off ~40 MB download that
 * needs a restart before the tool becomes available, while languages are small,
 * can be changed at any time, and take effect immediately because the backend
 * re-reads them from disk on every request. Presenting them as one step would
 * make people think adding Catalan needs a restart too.
 */
const OcrRuntimeManager: React.FC<OcrRuntimeManagerProps> = ({
  opened,
  onClose,
  onLanguagesChanged,
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<OcrRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getOcrRuntimeStatus();
      setStatus(next);
      setSelected(new Set(next.installedLanguages));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (opened) refresh();
  }, [opened, refresh]);

  const catalogue = useMemo(() => {
    const entries = Object.entries(status?.availableLanguages ?? {});
    return entries
      .map(([code, artifact]) => ({
        code,
        size: artifact.size,
        label: artifact.name || getOcrDisplayName(code) || code,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [status]);

  const installed = useMemo(
    () => new Set(status?.installedLanguages ?? []),
    [status],
  );

  const pending = useMemo(() => {
    const toInstall = [...selected].filter((code) => !installed.has(code));
    const toRemove = [...installed].filter((code) => !selected.has(code));
    return { toInstall, toRemove };
  }, [selected, installed]);

  const pendingBytes = useMemo(
    () =>
      pending.toInstall.reduce(
        (total, code) => total + (status?.availableLanguages?.[code]?.size ?? 0),
        0,
      ),
    [pending.toInstall, status],
  );

  const toggle = (code: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const onInstallEngine = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await installOcrEngine();
      if (!result.installed) {
        setError(result.error ?? t("ocr.runtime.engineFailed", "Could not install the OCR engine."));
        return;
      }
      setRestartRequired(Boolean(result.restartRequired));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onApplyLanguages = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await changeOcrLanguages(pending.toInstall, pending.toRemove);
      const failed = Object.entries(result.failed ?? {});
      if (failed.length > 0) {
        // Naming the ones that failed matters: the rest did land, and a blanket
        // "something went wrong" would send someone to redo all of it.
        setError(
          failed.map(([code, reason]) => `${code}: ${reason}`).join("\n"),
        );
      }
      await refresh();
      onLanguagesChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasChanges = pending.toInstall.length > 0 || pending.toRemove.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("ocr.runtime.title", "OCR setup")}
      size="md"
    >
      {loading && <Loader size="sm" />}

      {!loading && status && (
        <div className="flex flex-col gap-3">
          {!status.catalogueReachable && (
            <Alert color="yellow">
              {t(
                "ocr.runtime.catalogueUnreachable",
                "The list of installable OCR components could not be reached. Anything already installed still works.",
              )}
            </Alert>
          )}

          {!status.engineInstalled && (
            <div className="flex flex-col gap-2">
              <Text size="sm">
                {t(
                  "ocr.runtime.engineMissing",
                  "Text recognition is not installed yet.",
                )}
              </Text>
              <Button
                variant="primary"
                disabled={busy || !status.engineAvailable}
                onClick={onInstallEngine}
              >
                {status.engineAvailable
                  ? t("ocr.runtime.installEngine", "Install OCR ({{size}})", {
                      size: formatBytes(status.engineAvailable.size),
                    })
                  : t(
                      "ocr.runtime.engineUnavailable",
                      "No OCR engine is offered for this platform",
                    )}
              </Button>
            </div>
          )}

          {restartRequired && (
            <Alert color="blue">
              {t(
                "ocr.runtime.restartRequired",
                "Restart Stirling-PDF to finish enabling OCR.",
              )}
            </Alert>
          )}

          {status.engineInstalled && (
            <>
              <Text size="sm" fw={500}>
                {t("ocr.runtime.languages", "Languages")}
              </Text>
              <ScrollArea.Autosize mah={280}>
                <div className="flex flex-col gap-1">
                  {catalogue.map(({ code, label, size }) => (
                    <Checkbox
                      key={code}
                      checked={selected.has(code)}
                      // English is what Tesseract falls back to; removing it
                      // leaves an engine that refuses every job.
                      disabled={busy || code === "eng"}
                      onChange={() => toggle(code)}
                      label={`${label} · ${formatBytes(size)}`}
                    />
                  ))}
                </div>
              </ScrollArea.Autosize>

              <Button
                variant="primary"
                disabled={busy || !hasChanges}
                onClick={onApplyLanguages}
              >
                {pendingBytes > 0
                  ? t("ocr.runtime.applyWithSize", "Apply ({{size}} to download)", {
                      size: formatBytes(pendingBytes),
                    })
                  : t("ocr.runtime.apply", "Apply")}
              </Button>
            </>
          )}

          {error && (
            <Alert color="red" style={{ whiteSpace: "pre-line" }}>
              {error}
            </Alert>
          )}
        </div>
      )}
    </Modal>
  );
};

export default OcrRuntimeManager;
