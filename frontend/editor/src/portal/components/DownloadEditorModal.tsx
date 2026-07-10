import { useTranslation } from "react-i18next";
import { Button, Modal } from "@app/ui";
import { useOs } from "@app/hooks/useOs";
import { DOWNLOAD_URLS } from "@app/constants/downloads";
import { DownloadIcon } from "@portal/components/icons";
import "@portal/components/DownloadEditorModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

const OPTIONS = [
  { id: "windows", url: DOWNLOAD_URLS.WINDOWS },
  { id: "mac", url: DOWNLOAD_URLS.MAC },
  { id: "linux", url: DOWNLOAD_URLS.LINUX_DOCS },
] as const;

/**
 * Download-the-editor modal: one button per platform (the caller's detected OS
 * is highlighted as primary). Opened from the home hero's first step instead of
 * routing to the editor deploy page.
 */
export function DownloadEditorModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const os = useOs();

  const isCurrent = (id: (typeof OPTIONS)[number]["id"]) =>
    id === "linux" ? os.startsWith("linux") : os === id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title={t("portal.home.download.title")}
      subtitle={t("portal.home.download.body")}
    >
      <div className="portal-download__options">
        {OPTIONS.map((o) => (
          <Button
            key={o.id}
            variant={isCurrent(o.id) ? "primary" : "secondary"}
            leftSection={<DownloadIcon size={15} />}
            onClick={() => window.open(o.url, "_blank", "noopener,noreferrer")}
          >
            {t(`portal.home.download.${o.id}`)}
          </Button>
        ))}
      </div>
    </Modal>
  );
}
