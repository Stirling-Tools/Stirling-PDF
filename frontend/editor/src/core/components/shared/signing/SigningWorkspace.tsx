import { useNavigate } from "react-router-dom";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Alert, Center, Loader, Select, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { useSigningSessionController } from "@app/hooks/signing/useSigningSessionController";
import { useAllFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { SigningDocumentPicker } from "@app/components/shared/signing/SigningDocumentPicker";
import { SigningSessionThumbnail } from "@app/components/shared/signing/SigningSessionThumbnail";
import { useSigningOverlay } from "@app/contexts/SigningOverlayContext";
import { CreateSessionFlow } from "@app/components/shared/signing/CreateSessionFlow";
import { SessionDetailPanel } from "@app/components/tools/certSign/panels/SessionDetailPanel";
import SignRequestPanel from "@app/components/tools/certSign/panels/SignRequestPanel";
import {
  collectSigningItems,
  needsSignature,
  type SigningItem,
} from "@app/utils/signingItems";
import { signingStatus } from "@app/utils/signingStatus";
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
  const [tab, setTab] = useState("active");
  const [scope, setScope] = useState<string | null>("all");
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingIntent = usePendingSigningIntent();
  const items = useMemo(
    () => collectSigningItems(controller.signRequests, controller.mySessions),
    [controller.signRequests, controller.mySessions],
  );

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

  const filtered = items.filter((item) => {
    if (Boolean(item.finalized) !== (tab === "completed")) return false;
    if (scope === "mine" && item.kind !== "session") return false;
    if (
      scope === "signed" &&
      (item.kind !== "request" || item.myStatus !== "SIGNED")
    )
      return false;
    if (
      scope === "declined" &&
      (item.kind !== "request" || item.myStatus !== "DECLINED")
    )
      return false;
    if (scope === "needsMe" && !needsSignature(item)) return false;
    if (
      scope === "overdue" &&
      (!item.dueDate || new Date(item.dueDate).getTime() >= Date.now())
    )
      return false;
    const text = `${item.documentName} ${item.kind === "request" ? item.ownerUsername : ""}`;
    return text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
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
        <div className="signing-workspace__body">
          {error && (
            <Alert mb="md" color="red">
              {error}
            </Alert>
          )}
          {showCreate ? (
            <div className="signing-workspace__create">
              <SigningDocumentPicker
                value={document?.fileId ?? null}
                onChange={setDocumentId}
                disabled={controller.creating}
                loading={uploading}
                onLoadingChange={setUploading}
              />
              <CreateSessionFlow
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
                      setTab("active");
                      setScope("mine");
                      setSearch("");
                    });
                }}
              />
            </div>
          ) : (
            <div className="signing-workspace__content">
              <div className="signing-workspace__toolbar">
                <SegmentedControl
                  value={tab}
                  onChange={(value) => {
                    setTab(value);
                    setScope("all");
                  }}
                  options={[
                    {
                      value: "active",
                      label: t("sharedSign.tab.active", "Active"),
                    },
                    {
                      value: "completed",
                      label: t("sharedSign.tab.completed", "Completed"),
                    },
                  ]}
                />
                <Select
                  aria-label={t("signWorkspace.filter", "Filter sessions")}
                  value={scope}
                  onChange={setScope}
                  allowDeselect={false}
                  data={[
                    {
                      value: "all",
                      label: t("signWorkspace.all", "All sessions"),
                    },
                    {
                      value: "mine",
                      label: t("signWorkspace.createdByMe", "Created by me"),
                    },
                    {
                      value: "signed",
                      label: t("sharedSign.filterSigned", "Signed"),
                    },
                    {
                      value: "declined",
                      label: t("sharedSign.filterDeclined", "Declined"),
                    },
                    ...(tab === "active"
                      ? [
                          {
                            value: "needsMe",
                            label: t(
                              "signWorkspace.needsYou",
                              "Needs your signature",
                            ),
                          },
                          {
                            value: "overdue",
                            label: t("sharedSign.filterOverdue", "Overdue"),
                          },
                        ]
                      : []),
                  ]}
                />
                <TextInput
                  className="signing-workspace__search"
                  aria-label={t(
                    "signWorkspace.search",
                    "Search documents or people",
                  )}
                  placeholder={t(
                    "signWorkspace.search",
                    "Search documents or people",
                  )}
                  leftSection={<Icon name="search" size={16} />}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
                <Button
                  variant="quiet"
                  aria-label={t("signWorkspace.refresh", "Refresh sessions")}
                  title={t("signWorkspace.refresh", "Refresh sessions")}
                  onClick={() => {
                    void controller.refetch();
                  }}
                  leftSection={<Icon name="refresh-cw" size={18} />}
                />
              </div>
              {controller.loading && items.length === 0 ? (
                <Center py="xl">
                  <Loader />
                </Center>
              ) : filtered.length === 0 ? (
                <div className="signing-workspace__empty">
                  <Icon name="file-text" size={36} />
                  <span>
                    {search || scope !== "all"
                      ? t(
                          "signWorkspace.noMatches",
                          "No sessions match your search or filter.",
                        )
                      : t("signWorkspace.empty", "No sessions here yet.")}
                  </span>
                </div>
              ) : (
                <div className="signing-workspace__list">
                  {filtered.map((item) => (
                    <button
                      type="button"
                      className="signing-workspace__row"
                      key={`${item.kind}-${item.sessionId}`}
                      onClick={() => {
                        void openItem(item);
                      }}
                    >
                      <SigningSessionThumbnail
                        sessionId={item.sessionId}
                        finalized={Boolean(item.finalized)}
                      />
                      <span>
                        <span className="signing-workspace__name">
                          {item.documentName}
                        </span>
                        <span className="signing-workspace__meta">
                          {item.kind === "session"
                            ? t("signWorkspace.yourRequest", "Your request")
                            : t("sharedSign.fromOwner", "From {{owner}}", {
                                owner: item.ownerUsername,
                              })}{" "}
                          · {new Date(item.createdAt).toLocaleDateString()}
                          {item.dueDate &&
                            ` · ${t("sharedSign.due", "Due {{date}}", { date: new Date(item.dueDate).toLocaleDateString() })}`}
                        </span>
                      </span>
                      <span
                        className="signing-workspace__status"
                        data-attention={needsSignature(item)}
                      >
                        {needsSignature(item)
                          ? t("signWorkspace.needsYou", "Needs your signature")
                          : signingStatus(item, t).label}
                      </span>
                      <Icon name="chevron-right" size={18} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
