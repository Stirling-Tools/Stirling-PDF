import { useNavigate } from "react-router-dom";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Alert, Center, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { SigningSessionsTable } from "@app/components/shared/signing/SigningSessionsTable";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { useSigningSessionController } from "@app/hooks/signing/useSigningSessionController";
import { useAllFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { SigningDocumentPicker } from "@app/components/shared/signing/SigningDocumentPicker";
import { useSigningOverlay } from "@app/contexts/SigningOverlayContext";
import { CreateSessionFlow } from "@app/components/shared/signing/CreateSessionFlow";
import { SessionDetailPanel } from "@app/components/tools/certSign/panels/SessionDetailPanel";
import SignRequestPanel from "@app/components/tools/certSign/panels/SignRequestPanel";
import { collectSigningItems, type SigningItem } from "@app/utils/signingItems";
import { useSigningActivity } from "@app/hooks/signing/useSigningActivity";
import {
  requestSigningIntent,
  usePendingSigningIntent,
} from "@app/utils/pendingSigningIntent";
import "@app/components/shared/signing/signing.css";

const Viewer = lazy(() => import("@app/components/viewer/Viewer"));

/** Owns session navigation and gives the document and signing controls their own workspace. */
export default function SigningWorkspace() {
  const { t } = useTranslation();
  const enabled = useGroupSigningEnabled();
  const navigate = useNavigate();
  const { requestNavigation } = useNavigationGuard();
  const controller = useSigningSessionController(enabled, () =>
    navigate(EDITOR_BASENAME),
  );
  const { overlay } = useSigningOverlay();
  const { files } = useAllFiles();
  const { activeFileIndex } = useViewer();
  const pdfs = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
  const [documentId, setDocumentId] = useState<string | null>(
    pdfs.find((file) => file.fileId === files[activeFileIndex]?.fileId)
      ?.fileId ?? (pdfs.length === 1 ? pdfs[0].fileId : null),
  );
  const document = pdfs.find((file) => file.fileId === documentId);
  const [uploading, setUploading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [listRevision, setListRevision] = useState(0);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingIntent = usePendingSigningIntent();
  const sessions = useMemo(
    () => collectSigningItems(controller.signRequests, controller.mySessions),
    [controller.signRequests, controller.mySessions],
  );
  const items = useSigningActivity(sessions);

  const openItem = async (item: SigningItem) => {
    setOpening(true);
    setShowCreate(false);
    try {
      if (item.kind === "request") await controller.openSignRequest(item);
      else await controller.openSession(item);
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    if (!pendingIntent || !enabled || controller.loading || opening) return;
    requestSigningIntent(null);
    controller.backToList();
    setError(null);
    setShowCreate(pendingIntent === "create");
    if (typeof pendingIntent === "object") {
      const item = items.find(
        (entry) =>
          entry.kind === pendingIntent.kind &&
          entry.sessionId === pendingIntent.sessionId,
      );
      if (item) void openItem(item);
      else
        setError(
          t(
            "signWorkspace.unavailable",
            "This session is no longer available. Refresh the list to see your current sessions.",
          ),
        );
    }
  }, [
    pendingIntent,
    opening,
    enabled,
    controller.loading,
    items,
    controller.backToList,
  ]);

  const detail = controller.view !== "list" && !showCreate;
  const currentLocation = showCreate
    ? t("signMenu.request", "Request signatures")
    : detail
      ? (controller.detailData?.session.documentName ??
        controller.requestData?.signRequest.documentName)
      : null;

  return (
    <section
      className="signing-workspace"
      aria-label={t("signMenu.sessions", "Signing sessions")}
    >
      <header className="signing-workspace__header">
        <nav
          className="signing-workspace__navigation"
          aria-label={t("signWorkspace.navigation", "Signing navigation")}
        >
          <h1 className="signing-workspace__path">
            <Button
              variant={currentLocation ? "tertiary" : "primary"}
              shape="pill"
              size="sm"
              aria-current={currentLocation ? undefined : "page"}
              disabled={controller.creating || uploading || opening}
              onClick={() =>
                requestNavigation(() => {
                  controller.backToList();
                  setShowCreate(false);
                  setError(null);
                })
              }
            >
              {t("signMenu.sessions", "Signing sessions")}
            </Button>
            {currentLocation && (
              <>
                <Icon name="chevron-right" size={16} aria-hidden="true" />
                <span
                  className="signing-workspace__current"
                  aria-current="page"
                  title={currentLocation}
                >
                  {currentLocation}
                </span>
              </>
            )}
          </h1>
        </nav>
        {!detail && !showCreate && enabled && (
          <Button
            leftSection={<Icon name="plus" size={18} />}
            onClick={() => setShowCreate(true)}
          >
            {t("signMenu.request", "Request signatures")}
          </Button>
        )}
      </header>
      {!enabled ? (
        <div className="signing-workspace__body">
          <Alert>
            {t(
              "sharedSign.disabledBody",
              "Collaborative signing isn't enabled on this server.",
            )}
          </Alert>
        </div>
      ) : opening ? (
        <Center h="100%">
          <Loader />
        </Center>
      ) : detail ? (
        <div className="signing-workspace__detail">
          <div className="signing-workspace__preview">
            {overlay?.file ? (
              <Suspense
                fallback={
                  <Center h="100%">
                    <Loader />
                  </Center>
                }
              >
                <Viewer
                  previewFile={overlay.file}
                  signaturePreviews={overlay.signaturePreviews}
                  signaturePreviewsReadOnly={overlay.signaturePreviewsReadOnly}
                  signaturePlacementMode={overlay.signaturePlacementMode}
                  signaturePlacementData={overlay.signaturePlacementData}
                  signaturePlacementType={overlay.signaturePlacementType}
                  onSignaturePreviewsChange={overlay.onSignaturePreviewsChange}
                  signatureOverlayApiRef={overlay.signatureOverlayApiRef}
                />
              </Suspense>
            ) : (
              <div className="signing-workspace__empty">
                {t("signWorkspace.noPreview", "Document preview unavailable")}
              </div>
            )}
          </div>
          <div className="signing-workspace__panel">
            {controller.view === "detail" && controller.detailData && (
              <SessionDetailPanel data={controller.detailData} />
            )}
            {controller.view === "request" && controller.requestData && (
              <SignRequestPanel data={controller.requestData} />
            )}
          </div>
        </div>
      ) : (
        <div className="signing-workspace__body" hidden={!showCreate}>
          {error && (
            <Alert mb="md" color="red">
              {error}
            </Alert>
          )}
          {showCreate && (
            <CreateSessionFlow
              documentPicker={
                <SigningDocumentPicker
                  value={document?.fileId ?? null}
                  onChange={setDocumentId}
                  disabled={controller.creating}
                  loading={uploading}
                  onLoadingChange={setUploading}
                />
              }
              selectedFiles={document ? [document] : []}
              selectedUserIds={selectedUserIds}
              onSelectedUserIdsChange={setSelectedUserIds}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              creating={controller.creating || uploading}
              onSubmit={(settings) => {
                if (!document) return;
                void controller
                  .createSession(settings, selectedUserIds, dueDate, document)
                  .then((ok) => {
                    if (!ok) return;
                    setShowCreate(false);
                    setSelectedUserIds([]);
                    setDueDate("");
                    setListRevision((revision) => revision + 1);
                  });
              }}
            />
          )}
        </div>
      )}
      {enabled && (
        <div
          className="signing-workspace__body"
          hidden={opening || detail || showCreate}
        >
          {error && (
            <Alert mb="md" color="red">
              {error}
            </Alert>
          )}
          <SigningSessionsTable
            key={listRevision}
            items={items}
            loading={controller.loading}
            onOpen={(item) => {
              void openItem(item);
            }}
            onRefresh={() => {
              void controller.refetch();
            }}
          />
        </div>
      )}
    </section>
  );
}
