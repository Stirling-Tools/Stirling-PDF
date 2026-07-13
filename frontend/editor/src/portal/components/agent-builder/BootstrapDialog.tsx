import { useState } from "react";
import { useTranslation } from "react-i18next";
import FileUploadRounded from "@mui/icons-material/FileUploadRounded";
import { Button, Modal } from "@app/ui";
import "@portal/views/AgentBuilder.css";

interface BootstrapDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Seed a new agent from a sample document — the user drops one representative
 * file and the backend proposes scenarios and an extraction schema. Demo stub:
 * it captures the chosen file name locally and closes without provisioning.
 */
export function BootstrapDialog({ open, onClose }: BootstrapDialogProps) {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState<string | null>(null);

  function close() {
    onClose();
    setTimeout(() => setFileName(null), 200);
  }

  function bootstrap() {
    // TODO(backend): POST /v1/agents/bootstrap (multipart sample document) —
    // infer a starter agent (scenarios + extraction schema) from the file.
    close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="md"
      title={t("portal.agentBuilder.bootstrap.title")}
      subtitle={t("portal.agentBuilder.bootstrap.subtitle")}
      footer={
        <div className="portal-agents__dialog-footer">
          <Button variant="tertiary" size="sm" onClick={close}>
            {t("portal.agentBuilder.bootstrap.cancel")}
          </Button>
          <Button size="sm" onClick={bootstrap} disabled={!fileName}>
            {t("portal.agentBuilder.bootstrap.submit")}
          </Button>
        </div>
      }
    >
      <div className="portal-agents__bootstrap">
        <p className="portal-agents__bootstrap-lead">
          {t("portal.agentBuilder.bootstrap.lead")}
        </p>
        <label className="portal-agents__dropzone">
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff"
            className="portal-agents__dropzone-input"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className="portal-agents__dropzone-icon" aria-hidden>
            <FileUploadRounded style={{ fontSize: "1.5rem" }} />
          </span>
          <span className="portal-agents__dropzone-text">
            {fileName ?? t("portal.agentBuilder.bootstrap.dropzoneText")}
          </span>
        </label>
      </div>
    </Modal>
  );
}
