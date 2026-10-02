import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { StatusBadge } from "@app/ui/StatusBadge";
import { SigningSessionHeader } from "@app/components/shared/signing/SigningSessionHeader";
import { alert } from "@app/components/toast";
import type {
  SignatureOverlayAPI,
  SignaturePreview,
} from "@app/components/viewer/viewerTypes";
import { useSigningOverlay } from "@app/contexts/SigningOverlayContext";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { SignParameters } from "@app/hooks/tools/sign/useSignParameters";
import SignControlsPanel from "@app/components/tools/certSign/panels/SignControlsPanel";
import { CertificateConfigModal } from "@app/components/tools/certSign/modals/CertificateConfigModal";
import type { CertificateSubmitData } from "@app/components/tools/certSign/modals/CertificateConfigModal";
import type { SigningRequestData } from "@app/hooks/signing/useSigningSessionController";
import { getSubmittedSignaturePreviews } from "@app/utils/signingPreviews";
import { ParticipantListPanel } from "@app/components/tools/certSign/panels/ParticipantListPanel";

interface SignRequestPanelProps {
  data: SigningRequestData;
}

/** Controls for a sign request: drives viewer placement via the overlay context and reads placed signatures via the overlay API ref. */
const SignRequestPanel = ({ data }: SignRequestPanelProps) => {
  const { t } = useTranslation();
  const {
    signRequest,
    pdfFile,
    onSign,
    onDecline,
    onRefresh,
    onBack,
    canSign,
  } = data;
  const { actions: fileActions } = useFileActions();
  const { setOverlay } = useSigningOverlay();

  // Imperative handle to the viewer's signature overlay layer.
  const overlayApiRef = useRef<SignatureOverlayAPI | null>(null);

  const [signatureConfig, setSignatureConfig] = useState<SignParameters | null>(
    canSign
      ? {
          signatureType: "canvas",
          signerName: "",
          fontFamily: "Helvetica",
          fontSize: 16,
          textColor: "#000000",
        }
      : null,
  );
  const [previewCount, setPreviewCount] = useState(0);
  const [placementMode, setPlacementMode] = useState(true);
  const [hasSelectedAnnotation, setHasSelectedAnnotation] = useState(false);
  const [certificateModalOpen, setCertificateModalOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const submittedPreviews = useMemo(
    () => getSubmittedSignaturePreviews(signRequest),
    [signRequest],
  );

  useEffect(() => {
    if (signRequest.finalized || signing || declining) return;
    const timer = setInterval(() => {
      void onRefresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [signRequest.finalized, signing, declining, onRefresh]);

  const refreshPreview = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const signControlsVisible = canSign && signatureConfig !== null;

  useEffect(() => {
    if (!canSign) overlayApiRef.current?.clearPreviews();
  }, [canSign]);

  const handlePreviewsChange = useCallback((previews: SignaturePreview[]) => {
    setPreviewCount(previews.length);
  }, []);

  // Drive the shared viewer: show the document and (when the user can sign)
  // enable interactive placement of the selected signature.
  const placementData = signatureConfig?.signatureData;
  const placementType = signatureConfig?.signatureType;
  useEffect(() => {
    setOverlay({
      file: pdfFile,
      readOnlySignaturePreviews: submittedPreviews,
      signaturePreviewsReadOnly: !canSign,
      signaturePlacementMode: signControlsVisible ? placementMode : false,
      signaturePlacementData: signControlsVisible ? placementData : undefined,
      signaturePlacementType: signControlsVisible ? placementType : undefined,
      onSignaturePreviewsChange: handlePreviewsChange,
      signatureOverlayApiRef: overlayApiRef,
    });
  }, [
    pdfFile,
    submittedPreviews,
    canSign,
    signControlsVisible,
    placementMode,
    placementData,
    placementType,
    handlePreviewsChange,
    setOverlay,
  ]);

  // Owner navigation may install its preview before this panel unmounts.
  useEffect(() => {
    return () =>
      setOverlay((current) =>
        current?.signatureOverlayApiRef === overlayApiRef ? null : current,
      );
  }, [setOverlay]);

  // Poll for a selected placement (drives the delete control).
  useEffect(() => {
    if (!signControlsVisible) {
      setHasSelectedAnnotation(false);
      return;
    }
    const check = () =>
      setHasSelectedAnnotation(Boolean(overlayApiRef.current?.hasSelected?.()));
    check();
    const id = setInterval(check, 350);
    return () => clearInterval(id);
  }, [signControlsVisible]);

  const handleOpenCertificateModal = () => {
    setCertificateModalOpen(true);
  };

  const handleSign = async (
    certData: CertificateSubmitData,
    reason?: string,
    location?: string,
  ) => {
    const previews = overlayApiRef.current?.getSignaturePreviews() || [];

    setSigning(true);
    try {
      const formData = new FormData();

      if (certData.certType === "UPLOAD") {
        const {
          uploadFormat,
          p12File,
          privateKeyFile,
          certFile,
          jksFile,
          password,
        } = certData;
        formData.append("certType", uploadFormat);
        switch (uploadFormat) {
          case "PKCS12":
          case "PFX":
            if (!p12File) {
              alert({
                alertType: "error",
                title: t("common.error"),
                body: t(
                  "certSign.collab.signRequest.noCertificate",
                  "Please select a certificate file",
                ),
              });
              setSigning(false);
              return;
            }
            formData.append("p12File", p12File);
            break;
          case "PEM":
            if (!privateKeyFile || !certFile) {
              alert({
                alertType: "error",
                title: t("common.error"),
                body: t(
                  "certSign.collab.signRequest.noCertificate",
                  "Please select a certificate file",
                ),
              });
              setSigning(false);
              return;
            }
            formData.append("privateKeyFile", privateKeyFile);
            formData.append("certFile", certFile);
            break;
          case "JKS":
            if (!jksFile) {
              alert({
                alertType: "error",
                title: t("common.error"),
                body: t(
                  "certSign.collab.signRequest.noCertificate",
                  "Please select a certificate file",
                ),
              });
              setSigning(false);
              return;
            }
            formData.append("jksFile", jksFile);
            break;
        }
        if (password) {
          formData.append("password", password);
        }
      } else {
        formData.append("certType", certData.certType);
      }

      // Signature appearance settings from the sign request
      if (signRequest.showSignature !== undefined) {
        formData.append("showSignature", signRequest.showSignature.toString());
      }
      if (
        signRequest.pageNumber !== undefined &&
        signRequest.pageNumber !== null
      ) {
        formData.append("pageNumber", signRequest.pageNumber.toString());
      }

      // Participant-provided reason/location override session defaults
      if (reason && reason.trim()) {
        formData.append("reason", reason);
      } else if (signRequest.reason) {
        formData.append("reason", signRequest.reason);
      }

      if (location && location.trim()) {
        formData.append("location", location);
      } else if (signRequest.location) {
        formData.append("location", signRequest.location);
      }

      if (signRequest.showLogo !== undefined) {
        formData.append("showLogo", signRequest.showLogo.toString());
      }

      // All placed wet signatures (coordinates are page fractions)
      if (previews.length > 0) {
        const wetSignaturesJson = previews.map((preview) => ({
          type: preview.signatureType,
          data: preview.signatureData,
          page: preview.pageIndex,
          x: preview.x,
          y: preview.y,
          width: preview.width,
          height: preview.height,
        }));
        formData.append("wetSignaturesData", JSON.stringify(wetSignaturesJson));
      }

      await onSign(formData);
      overlayApiRef.current?.clearPreviews();
      setCertificateModalOpen(false);
    } finally {
      setSigning(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await onDecline();
    } catch (error) {
      console.error("Failed to decline request:", error);
      setDeclining(false);
    }
  };

  const handleAddToActiveFiles = async () => {
    await fileActions.addFiles([pdfFile], { skipUploadTracking: true });
    alert({
      alertType: "success",
      title: t("success"),
      body: t(
        "certSign.collab.signRequest.addedToFiles",
        "Document added to active files",
      ),
      expandable: false,
      durationMs: 2500,
    });
    onBack();
    data.onOpenFiles?.();
  };

  const handleDeleteSelected = () => {
    overlayApiRef.current?.deleteSelected?.();
  };

  return (
    <div className="signing-detail">
      <div className="signing-detail__body">
        <SigningSessionHeader
          documentName={signRequest.documentName}
          owner={signRequest.ownerUsername}
          createdAt={signRequest.createdAt}
          dueDate={signRequest.dueDate}
          message={signRequest.message}
          status={
            <StatusBadge
              tone={
                signRequest.finalized || signRequest.myStatus === "SIGNED"
                  ? "success"
                  : signRequest.myStatus === "DECLINED"
                    ? "neutral"
                    : "info"
              }
            >
              {signRequest.finalized
                ? t("certSign.collab.sessionList.finalized", "Finalized")
                : signRequest.myStatus === "SIGNED"
                  ? t("signMenu.submitted", "Submitted · awaiting finalization")
                  : signRequest.myStatus === "DECLINED"
                    ? t("certSign.declined", "Declined")
                    : t("signingDetail.requestTitle", "Signature request")}
            </StatusBadge>
          }
        />
        {!signRequest.finalized && (
          <p className="signing-detail__hint">
            {t(
              "signingDetail.inProgressPreview",
              "In-progress preview with submitted signatures. The owner has not finalized this document yet.",
            )}
          </p>
        )}
        {!canSign && (
          <div className="signing-detail__summary" role="status">
            <Icon
              name={
                signRequest.finalized || signRequest.myStatus === "SIGNED"
                  ? "circle-check"
                  : "info"
              }
              size={24}
            />
            <h3>
              {signRequest.finalized
                ? t("signingDetail.finalDocument", "Signed document")
                : signRequest.myStatus === "SIGNED"
                  ? t(
                      "signingDetail.signatureSubmitted",
                      "Your signature is submitted",
                    )
                  : t("signingDetail.requestClosed", "This request is closed")}
            </h3>
            <p>
              {signRequest.finalized
                ? t(
                    "certSign.collab.signRequest.closed",
                    "This session is finalized. You can view the final document, but no further signatures or declines are accepted.",
                  )
                : signRequest.myStatus === "SIGNED"
                  ? data.onManageSession
                    ? t(
                        "signingDetail.ownerNext",
                        "Return to your session to review everyone's signatures and finalize the document when you are ready.",
                      )
                    : t(
                        "signingDetail.awaitingOwner",
                        "The owner will finalize the document once they are ready.",
                      )
                  : t(
                      "signingDetail.viewOnly",
                      "You can still review the document here.",
                    )}
            </p>
          </div>
        )}
        {signRequest.participants && (
          <ParticipantListPanel
            participants={signRequest.participants}
            finalized={Boolean(signRequest.finalized)}
          />
        )}
        {signControlsVisible && (
          <SignControlsPanel
            placementMode={placementMode}
            onPlacementModeChange={setPlacementMode}
            onSignatureSelected={setSignatureConfig}
            signatureConfig={signatureConfig}
            hasSelectedAnnotation={hasSelectedAnnotation}
            onDeleteSelected={handleDeleteSelected}
          />
        )}
      </div>
      <footer className="signing-detail__footer">
        {data.onManageSession && (
          <Button
            variant="secondary"
            onClick={data.onManageSession}
            disabled={signing || declining}
          >
            {t("signingDetail.manageSession", "Manage signing session")}
          </Button>
        )}
        {!signRequest.finalized && (
          <Button
            variant="secondary"
            onClick={refreshPreview}
            loading={refreshing}
            disabled={signing || declining}
          >
            {t("signingDetail.refreshPreview", "Refresh preview")}
          </Button>
        )}
        {canSign && (
          <>
            <h3>{t("signingDetail.readyToSign", "Ready to sign?")}</h3>
            <p className="signing-detail__hint">
              {t(
                "signingDetail.certificateNext",
                "Choose your certificate in the next step.",
              )}
            </p>
            <Button
              leftSection={<Icon name="check" size={18} />}
              onClick={handleOpenCertificateModal}
              disabled={declining || signing}
              fullWidth
            >
              {t(
                "certSign.collab.signRequest.completeAndSign",
                "Complete & Sign",
              )}
            </Button>
          </>
        )}
        <div className="signing-detail__secondary">
          <Button
            variant="tertiary"
            leftSection={<Icon name="folder-open" size={16} />}
            onClick={handleAddToActiveFiles}
            size="sm"
            disabled={declining || signing}
          >
            {t("certSign.collab.signRequest.addToFiles", "Add to Active Files")}
          </Button>
          {canSign && (
            <Button
              variant="tertiary"
              accent="danger"
              leftSection={<Icon name="circle-x" size={16} />}
              onClick={handleDecline}
              loading={declining}
              size="sm"
              disabled={signing}
            >
              {t("certSign.collab.signRequest.decline", "Decline Request")}
            </Button>
          )}
        </div>
      </footer>
      {canSign && (
        <CertificateConfigModal
          opened={certificateModalOpen}
          onClose={() => setCertificateModalOpen(false)}
          onSign={handleSign}
          signatureCount={previewCount}
          disabled={signing}
          defaultReason={signRequest.reason || ""}
          defaultLocation={signRequest.location || ""}
        />
      )}
    </div>
  );
};

export default SignRequestPanel;
