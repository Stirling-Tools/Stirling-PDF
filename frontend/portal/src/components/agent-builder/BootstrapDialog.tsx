import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "@shared/components";
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
      title={t("agentBuilder.bootstrap.title")}
      subtitle={t("agentBuilder.bootstrap.subtitle")}
      footer={
        <div className="portal-agents__dialog-footer">
          <Button variant="ghost" size="sm" onClick={close}>
            {t("agentBuilder.bootstrap.cancel")}
          </Button>
          <Button size="sm" onClick={bootstrap} disabled={!fileName}>
            {t("agentBuilder.bootstrap.submit")}
          </Button>
        </div>
      }
    >
      <div className="portal-agents__bootstrap">
        <p className="portal-agents__bootstrap-lead">
          {t("agentBuilder.bootstrap.lead")}
        </p>
        <label className="portal-agents__dropzone">
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff"
            className="portal-agents__dropzone-input"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className="portal-agents__dropzone-icon" aria-hidden>
            ⇪
          </span>
          <span className="portal-agents__dropzone-text">
            {fileName ?? t("agentBuilder.bootstrap.dropzoneText")}
          </span>
        </label>
      </div>
    </Modal>
  );
}
