import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Button, Text, Divider } from "@mantine/core";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CancelIcon from "@mui/icons-material/Cancel";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
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

interface SignRequestPanelProps {
  data: SigningRequestData;
}

/** Sidebar controls for a sign request: drives viewer placement via the overlay context and reads placed signatures via the overlay API ref. */
const SignRequestPanel = ({ data }: SignRequestPanelProps) => {
  const { t } = useTranslation();
  const { signRequest, pdfFile, onSign, onDecline, onBack, canSign } = data;
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

  const signControlsVisible = canSign && signatureConfig !== null;

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
      signaturePlacementMode: signControlsVisible ? placementMode : false,
      signaturePlacementData: signControlsVisible ? placementData : undefined,
      signaturePlacementType: signControlsVisible ? placementType : undefined,
      onSignaturePreviewsChange: handlePreviewsChange,
      signatureOverlayApiRef: overlayApiRef,
    });
  }, [
    pdfFile,
    signControlsVisible,
    placementMode,
    placementData,
    placementType,
    handlePreviewsChange,
    setOverlay,
  ]);

  // Clear the shared viewer overlay when leaving the sign request.
  useEffect(() => {
    return () => setOverlay(null);
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
    if (previewCount === 0) {
      alert({
        alertType: "error",
        title: t("common.error"),
        body: t(
          "certSign.collab.signRequest.noSignatures",
          "Please place at least one signature on the PDF",
        ),
      });
      return;
    }
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
      setCertificateModalOpen(false);
    } catch (error) {
      console.error("Failed to sign document:", error);
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
  };

  const handleDeleteSelected = () => {
    overlayApiRef.current?.deleteSelected?.();
  };

  return (
    <Stack gap="md" p="md">
      <Button
        leftSection={<ArrowBackIcon fontSize="small" />}
        variant="subtle"
        size="sm"
        onClick={onBack}
        justify="flex-start"
        px={6}
        style={{ alignSelf: "flex-start" }}
      >
        {t("certSign.collab.signRequest.backToList", "Back to Sign Requests")}
      </Button>

      <Stack gap={2}>
        <Text size="sm" fw={600} truncate>
          {signRequest.documentName}
        </Text>
        <Text size="xs" c="dimmed">
          {t("certSign.collab.signRequest.from", "From")}:{" "}
          {signRequest.ownerUsername} •{" "}
          {new Date(signRequest.createdAt).toLocaleDateString()}
        </Text>
      </Stack>

      <Divider />

      {canSign && signControlsVisible && (
        <>
          <SignControlsPanel
            placementMode={placementMode}
            onPlacementModeChange={setPlacementMode}
            onSignatureSelected={setSignatureConfig}
            onComplete={handleOpenCertificateModal}
            canComplete={previewCount > 0}
            signatureConfig={signatureConfig}
            hasSelectedAnnotation={hasSelectedAnnotation}
            onDeleteSelected={handleDeleteSelected}
          />
          <Divider />
        </>
      )}

      <Button
        variant="light"
        leftSection={<FolderOpenIcon fontSize="small" />}
        onClick={handleAddToActiveFiles}
        fullWidth
        style={{
          backgroundColor: "var(--landing-inner-paper-bg)",
          color: "var(--btn-open-file)",
          border: "1px solid var(--landing-inner-paper-border)",
        }}
      >
        {t("certSign.collab.signRequest.addToFiles", "Add to Active Files")}
      </Button>

      {signRequest.myStatus !== "SIGNED" &&
        signRequest.myStatus !== "DECLINED" && (
          <Button
            variant="light"
            color="red"
            leftSection={<CancelIcon fontSize="small" />}
            onClick={handleDecline}
            loading={declining}
            fullWidth
          >
            {t("certSign.collab.signRequest.decline", "Decline Request")}
          </Button>
        )}

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
    </Stack>
  );
};

export default SignRequestPanel;
