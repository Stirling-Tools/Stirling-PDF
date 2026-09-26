import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropzone } from "@mantine/dropzone";
import { FilePicker } from "@app/ui/FilePicker";
import { Icon } from "@app/ui/Icon";
import { formatFileSize, readFileAsDataUrl } from "@app/utils/fileUtils";
import { TransparentPreview } from "@app/components/tools/sign/createSignature/TransparentPreview";
import {
  DEFAULT_CLEANUP,
  UploadCleanupOptions,
  toUploadCleanup,
  type CleanupSettings,
} from "@app/components/tools/sign/createSignature/UploadCleanupOptions";
import { useCleanedSignatureImage } from "@app/components/tools/sign/createSignature/useCleanedSignatureImage";
import type { UploadPanelHandle } from "@app/components/tools/sign/createSignature/types";
import styles from "@app/components/tools/sign/createSignature/UploadSignaturePanel.module.css";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD_MB = 10;

type UploadProblem = "unreadable" | "rejected";

interface UploadSource {
  dataUrl: string;
  name: string;
  size?: number;
}

interface UploadSignaturePanelProps {
  onReadyChange: (ready: boolean) => void;
}

export const UploadSignaturePanel = forwardRef<
  UploadPanelHandle,
  UploadSignaturePanelProps
>(function UploadSignaturePanel({ onReadyChange }, ref) {
  const { t } = useTranslation();
  const [source, setSource] = useState<UploadSource | null>(null);
  const [cleanup, setCleanup] = useState<CleanupSettings>(DEFAULT_CLEANUP);
  const [problem, setProblem] = useState<UploadProblem | null>(null);
  const cleaned = useCleanedSignatureImage(
    source?.dataUrl ?? null,
    toUploadCleanup(cleanup),
  );
  const ready = Boolean(cleaned.dataUrl) && !cleaned.processing;

  useEffect(() => onReadyChange(ready), [ready, onReadyChange]);

  function loadSource(next: UploadSource) {
    setProblem(null);
    setCleanup((prev) => ({ ...prev, quarterTurns: 0 }));
    setSource(next);
  }

  async function acceptFile(file: File | null) {
    if (!file) return;
    try {
      loadSource({
        dataUrl: await readFileAsDataUrl(file),
        name: file.name,
        size: file.size,
      });
    } catch {
      setProblem("unreadable");
    }
  }

  useImperativeHandle(ref, () => ({
    loadSource: (dataUrl: string, name: string) =>
      loadSource({ dataUrl, name }),
    getResult: async () =>
      cleaned.dataUrl
        ? { source: "upload", type: "image", dataUrl: cleaned.dataUrl }
        : null,
  }));

  const problemMessages: Record<UploadProblem, string> = {
    unreadable: t("sign.wallet.upload.failed", "Could not read that image."),
    rejected: t(
      "sign.wallet.upload.rejected",
      "Choose a PNG, JPG or WebP image up to {{size}} MB.",
      { size: MAX_UPLOAD_MB },
    ),
  };
  const currentProblem = cleaned.failed ? "unreadable" : problem;
  const errorMessage = currentProblem ? problemMessages[currentProblem] : null;

  if (!source) {
    return (
      <UploadDropzone
        error={errorMessage}
        onAccept={(file) => void acceptFile(file)}
        onReject={() => setProblem("rejected")}
      />
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.previewColumn}>
        <TransparentPreview
          src={cleaned.dataUrl}
          label={t("sign.wallet.upload.preview", "Uploaded signature preview")}
          overlay={
            cleaned.processing &&
            t("sign.wallet.upload.processing", "Cleaning up the image...")
          }
        />
        <div className={styles.fileRow}>
          <Icon name="image" size={16} />
          <span className={styles.fileName}>{source.name}</span>
          {source.size !== undefined && (
            <span className={styles.fileSize}>
              {formatFileSize(source.size)}
            </span>
          )}
          <FilePicker
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(file) => void acceptFile(file)}
            variant="tertiary"
            size="sm"
          >
            {t("sign.wallet.upload.replace", "Replace")}
          </FilePicker>
        </div>
        {errorMessage && (
          <span className={styles.error} role="alert">
            {errorMessage}
          </span>
        )}
      </div>
      <UploadCleanupOptions value={cleanup} onChange={setCleanup} />
    </div>
  );
});

interface UploadDropzoneProps {
  error: string | null;
  onAccept: (file: File | null) => void;
  onReject: () => void;
}

function UploadDropzone({ error, onAccept, onReject }: UploadDropzoneProps) {
  const { t } = useTranslation();
  const label = t("sign.wallet.upload.drop", "Drop an image here");

  return (
    <div className={styles.dropArea}>
      <Dropzone
        onDrop={(files) => onAccept(files[0] ?? null)}
        onReject={onReject}
        accept={ACCEPTED_TYPES}
        maxSize={MAX_UPLOAD_MB * 1024 * 1024}
        multiple={false}
        aria-label={label}
        inputProps={{ "aria-label": label }}
        className={styles.dropzone}
      >
        <div className={styles.dropContent}>
          <span className={styles.dropIcon}>
            <Icon name="upload" size={19} />
          </span>
          <span className={styles.dropTitle}>{label}</span>
          <span className={styles.dropBrowse}>
            {t("sign.wallet.upload.browse", "or browse files")}
          </span>
          <span className={styles.dropHint}>
            {t(
              "sign.wallet.upload.hint",
              "PNG, JPG or WebP up to {{size}} MB. White backgrounds are removed automatically.",
              { size: MAX_UPLOAD_MB },
            )}
          </span>
        </div>
      </Dropzone>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
