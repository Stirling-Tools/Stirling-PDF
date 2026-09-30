import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileSelectors } from "@app/contexts/file/fileHooks";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFileThumbnail } from "@app/hooks/useFileThumbnail";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";
import { createQuickKey, type StirlingFileStub } from "@app/types/fileContext";
import thumbnailStyles from "@app/components/fileEditor/FileEditorThumbnail.module.css";

/** Picks one PDF without navigating away; library imports use the normal FileContext ingestion path. */
export function SigningDocumentPicker({
  value,
  onChange,
  disabled,
  loading,
  onLoadingChange,
}: {
  value: string | null;
  onChange: (fileId: string) => void;
  disabled: boolean;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
}) {
  const { t } = useTranslation();
  const { fileStubs } = useAllFiles();
  const selectors = useFileSelectors();
  const { openFilesModal } = useFilesModalContext();
  const { addFiles } = useFileHandler();
  const pdfs = fileStubs.filter((file) =>
    file.name.toLowerCase().endsWith(".pdf"),
  );

  return (
    <div className="signing-workspace__document-picker">
      <div className="signing-document-picker__heading">
        <h2>{t("signWorkspace.document", "Document")}</h2>
        <Button
          variant="secondary"
          loading={loading}
          disabled={disabled}
          leftSection={<Icon name="folder-open" size={18} />}
          onClick={() =>
            openFilesModal({
              maxSelectable: 1,
              supportedFormats: ["pdf"],
              customHandler: async (files) => {
                if (
                  files.length !== 1 ||
                  !files[0].name.toLowerCase().endsWith(".pdf")
                ) {
                  throw new Error(
                    t(
                      "signWorkspace.selectOnePdf",
                      "Choose one PDF for this signing request.",
                    ),
                  );
                }
                onLoadingChange(true);
                try {
                  const existing = selectors
                    .getFiles()
                    .find(
                      (file) =>
                        createQuickKey(file) === createQuickKey(files[0]),
                    );
                  const selected =
                    existing ??
                    (await addFiles(files, { selectFiles: false }))[0];
                  if (!selected)
                    throw new Error(
                      t(
                        "signWorkspace.uploadFailed",
                        "Could not open this PDF. Please try again.",
                      ),
                    );
                  onChange(selected.fileId);
                } finally {
                  onLoadingChange(false);
                }
              },
            })
          }
        >
          {t("signWorkspace.chooseFromLibrary", "Choose from library")}
        </Button>
      </div>
      {pdfs.length > 0 ? (
        <fieldset
          disabled={disabled || loading}
          className="signing-document-picker__files"
        >
          <legend>
            {t("signWorkspace.chooseDocument", "Choose an open PDF")}
          </legend>
          <div className="signing-document-picker__grid">
            {pdfs.map((file) => (
              <SigningDocumentCard
                key={file.id}
                file={file}
                selected={value === file.id}
                onSelect={() => onChange(file.id)}
              />
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="signing-document-picker__empty">
          {t(
            "signWorkspace.noOpenPdfs",
            "Choose a PDF from your library or add one from your computer.",
          )}
        </p>
      )}
    </div>
  );
}

function SigningDocumentCard({
  file,
  selected,
  onSelect,
}: {
  file: StirlingFileStub;
  selected: boolean;
  onSelect: () => void;
}) {
  const { thumbnail, isEncrypted, isGenerating } = useFileThumbnail(file);
  const cardRef = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <label
      ref={cardRef}
      className="signing-document-card"
      data-selected={selected}
    >
      <input
        type="radio"
        name="signing-document"
        aria-label={file.name}
        checked={selected}
        onChange={onSelect}
      />
      <div
        className={`${thumbnailStyles.thumbContainer} signing-document-card__preview`}
      >
        <DocumentThumbnail
          file={file}
          thumbnail={thumbnail}
          isEncrypted={isEncrypted}
          isLoading={isGenerating}
          imgClassName={thumbnailStyles.thumbImage}
        />
      </div>
      <span className="signing-document-card__name" title={file.name}>
        {file.name}
      </span>
    </label>
  );
}
