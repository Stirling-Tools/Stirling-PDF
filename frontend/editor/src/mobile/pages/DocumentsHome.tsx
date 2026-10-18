import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useAllFiles } from "@app/contexts/file/fileHooks";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { LandingExtraActions } from "@app/components/shared/LandingExtraActions";
import { formatFileSize } from "@app/utils/fileUtils";
import type { StirlingFileStub } from "@app/types/fileContext";

const RECENT_LIMIT = 30;

interface DocumentsHomeProps {
  /** Shows a document, adding it to the workspace first if it is only in the library. */
  onOpen: (stub: StirlingFileStub) => void;
  onBrowseAll: () => void;
}

function DocumentRow({
  stub,
  onOpen,
}: {
  stub: StirlingFileStub;
  onOpen: (stub: StirlingFileStub) => void;
}) {
  const { i18n } = useTranslation();
  const date = new Date(stub.createdAt ?? stub.lastModified).toLocaleDateString(
    i18n.language,
  );
  return (
    <li>
      <button
        type="button"
        className="documents-home-row"
        onClick={() => onOpen(stub)}
      >
        {stub.thumbnailUrl ? (
          <img
            className="documents-home-thumb"
            src={stub.thumbnailUrl}
            alt=""
          />
        ) : (
          <span className="documents-home-thumb">
            <Icon name="file-text" size="1.25rem" />
          </span>
        )}
        <span className="documents-home-meta">
          <span className="documents-home-name">{stub.name}</span>
          <span className="documents-home-detail">
            {formatFileSize(stub.size)} · {date}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The mobile app's home: bring a document in, or pick up one you used before. */
export function DocumentsHome({ onOpen, onBrowseAll }: DocumentsHomeProps) {
  const { t } = useTranslation();
  const { fileStubs } = useAllFiles();
  const { allFiles } = useFilesPage();
  const { addFiles } = useFileHandler();

  const openIds = useMemo(
    () => new Set(fileStubs.map((stub) => stub.id)),
    [fileStubs],
  );
  const recent = useMemo(
    () =>
      allFiles
        .filter((stub) => !openIds.has(stub.id))
        .sort(
          (a, b) =>
            (b.createdAt ?? b.lastModified) - (a.createdAt ?? a.lastModified),
        )
        .slice(0, RECENT_LIMIT),
    [allFiles, openIds],
  );

  const openFromDevice = async () => {
    const files = await openFilesFromDisk({ multiple: true });
    if (files.length > 0) await addFiles(files);
  };

  return (
    <div className="documents-home">
      <h1 className="documents-home-title">
        {t("mobile.home.title", "Documents")}
      </h1>
      <div className="documents-home-actions">
        <Button
          fat
          leftSection={<Icon name="plus" size="1rem" />}
          onClick={() => void openFromDevice()}
        >
          {t("mobile.home.open", "Open")}
        </Button>
        <LandingExtraActions />
      </div>

      {fileStubs.length > 0 && (
        <section>
          <h2 className="documents-home-section">
            {t("mobile.home.openNow", "Open now")}
          </h2>
          <ul className="documents-home-list">
            {fileStubs.map((stub) => (
              <DocumentRow key={stub.id} stub={stub} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="documents-home-section">
            {t("mobile.home.recent", "Recent")}
          </h2>
          <ul className="documents-home-list">
            {recent.map((stub) => (
              <DocumentRow key={stub.id} stub={stub} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}

      <Button variant="tertiary" onClick={onBrowseAll}>
        {t("mobile.home.browseAll", "Browse all files")}
      </Button>
    </div>
  );
}
