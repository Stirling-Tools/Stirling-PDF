import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileSelectors } from "@app/contexts/file/fileHooks";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFileThumbnail } from "@app/hooks/useFileThumbnail";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";
import { PrivateContent } from "@app/components/shared/PrivateContent";
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
  onChange: (fileId: string | null) => void;
  disabled: boolean;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const { fileStubs } = useAllFiles();
  const selectors = useFileSelectors();
  const { openFilesModal } = useFilesModalContext();
  const { addFiles } = useFileHandler();
  const pdfs = fileStubs.filter((file) =>
    file.name.toLowerCase().endsWith(".pdf"),
  );
  const selectedFile = pdfs.find((file) => file.id === value);

  return (
    <div className="signing-workspace__document-picker">
      <div className="signing-document-picker__heading">
        <h2 id={headingId} title={selectedFile?.name}>
          {selectedFile ? (
            <PrivateContent>{selectedFile.name}</PrivateContent>
          ) : (
            t("signWorkspace.document", "Document")
          )}
        </h2>
        {selectedFile ? (
          <Button
            variant="secondary"
            disabled={disabled || loading}
            onClick={() => onChange(null)}
            leftSection={<Icon name="arrow-left" size={18} />}
          >
            {t("signWorkspace.changeDocument", "Change PDF")}
          </Button>
        ) : (
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
        )}
      </div>
      {selectedFile ? (
        <figure
          className="signing-document-picker__selected"
          aria-labelledby={headingId}
        >
          <SigningDocumentPreview
            key={selectedFile.id}
            file={selectedFile}
            floating
          />
        </figure>
      ) : pdfs.length > 0 ? (
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
  onSelect,
}: {
  file: StirlingFileStub;
  onSelect: () => void;
}) {
  return (
    <label className="signing-document-card">
      <input
        type="radio"
        name="signing-document"
        aria-label={file.name}
        checked={false}
        onChange={onSelect}
      />
      <SigningDocumentPreview file={file} />
      <span className="signing-document-card__name" title={file.name}>
        {file.name}
      </span>
    </label>
  );
}

function SigningDocumentPreview({
  file,
  floating = false,
}: {
  file: StirlingFileStub;
  floating?: boolean;
}) {
  const { thumbnail, isEncrypted, isGenerating } = useFileThumbnail(file);
  const [pageRatio, setPageRatio] = useState(210 / 297);
  return (
    <div
      className={
        floating
          ? "signing-document-preview"
          : `${thumbnailStyles.thumbContainer} signing-document-card__preview`
      }
    >
      {floating && thumbnail && !isEncrypted ? (
        <PrivateContent>
          <img
            src={thumbnail}
            alt={`Preview of ${file.name}`}
            draggable={false}
            className="signing-document-preview__page"
            style={{ width: `min(100cqw, calc(100cqh * ${pageRatio}))` }}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalHeight > 0)
                setPageRatio(image.naturalWidth / image.naturalHeight);
            }}
          />
        </PrivateContent>
      ) : (
        <DocumentThumbnail
          file={file}
          thumbnail={thumbnail}
          isEncrypted={isEncrypted}
          isLoading={isGenerating}
          imgClassName={thumbnailStyles.thumbImage}
        />
      )}
    </div>
  );
}
