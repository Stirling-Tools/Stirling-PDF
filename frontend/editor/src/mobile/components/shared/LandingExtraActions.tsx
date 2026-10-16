import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { alert } from "@app/components/toast";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { scanDocument } from "@app/services/documentScannerService";

// Native plugin rejections arrive as a plain string or a `{ message }` object.
function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

/** Scanning with the phone's camera is the mobile app's own way to bring a document in. */
export function LandingExtraActions() {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const file = await scanDocument();
      if (file) await addFiles([file]);
    } catch (error) {
      alert({
        alertType: "error",
        title: t("mobile.scan.failed", "The document could not be scanned."),
        body: errorMessage(error),
        isPersistentPopup: false,
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Button
      variant="secondary"
      fat
      loading={scanning}
      leftSection={<Icon name="scan" size="1rem" />}
      onClick={(event) => {
        event.stopPropagation();
        void handleScan();
      }}
    >
      {t("mobile.scan.button", "Scan document")}
    </Button>
  );
}
