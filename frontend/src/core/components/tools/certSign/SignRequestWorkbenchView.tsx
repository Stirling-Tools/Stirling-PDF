import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Paper,
  Group,
  Button,
  Text,
  Divider,
  CloseButton,
} from "@mantine/core";
import { useIsPhone } from "@app/hooks/useIsMobile";
import CancelIcon from "@mui/icons-material/Cancel";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import ZoomOutMapIcon from "@mui/icons-material/ZoomOutMap";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { Z_INDEX_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import { SignRequestDetail } from "@app/types/signingSession";
import {
  LocalEmbedPDFWithAnnotations,
  AnnotationAPI,
} from "@app/components/viewer/LocalEmbedPDFWithAnnotations";
import { alert } from "@app/components/toast";
import SignControlsStrip from "@app/components/tools/certSign/SignControlsStrip";
import { CertificateConfigModal } from "@app/components/tools/certSign/modals/CertificateConfigModal";
import type { CertificateSubmitData } from "@app/components/tools/certSign/modals/CertificateConfigModal";
import { SignParameters } from "@app/hooks/tools/sign/useSignParameters";
import { useFileActions } from "@app/contexts/file/fileHooks";

export interface SignRequestWorkbenchData {
  signRequest: SignRequestDetail;
  pdfFile: File;
  onSign: (certificateData: FormData) => Promise<void>;
  onDecline: () => Promise<void>;
  onBack: () => void;
  canSign: boolean;
}

interface SignRequestWorkbenchViewProps {
  data: SignRequestWorkbenchData;
}

const SignRequestWorkbenchView = ({ data }: SignRequestWorkbenchViewProps) => {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const { signRequest, pdfFile, onSign, onDecline, onBack, canSign } = data;
  const { actions: fileActions } = useFileActions();

  // Ref for annotation API
  const annotationApiRef = useRef<AnnotationAPI | null>(null);

  // Signature state - start with default config if user can sign
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

  // Certificate modal state
  const [certificateModalOpen, setCertificateModalOpen] = useState(false);

  // Process state
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);

  // Show/hide sign controls strip - always visible when user can sign
  const signControlsVisible = canSign && signatureConfig !== null;

  // Check for selected annotation periodically
  useEffect(() => {
    if (!signControlsVisible || !annotationApiRef.current) {
      setHasSelectedAnnotation(false);
      return;
    }
    const check = () => {
      const has = (
        annotationApiRef.current as any
      )?.getHasSelectedAnnotation?.();
      setHasSelectedAnnotation(Boolean(has));
    };
    check();
    const id = setInterval(check, 350);
    return () => clearInterval(id);
  }, [signControlsVisible]);

  const handleSignatureSelected = (config: SignParameters) => {
    setSignatureConfig(config);
  };

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
    const previews = annotationApiRef.current?.getSignaturePreviews() || [];
    console.log("handleSign called, previews:", previews.length, "signatures");

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

      // Add signature appearance settings from sign request
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

      // Add all wet signatures from previews
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

        console.log(
          "Sending wet signatures to backend:",
          wetSignaturesJson.length,
          "signatures",
        );
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
    await fileActions.addFiles([pdfFile]);
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
    (annotationApiRef.current as any)?.deleteSelectedAnnotation?.();
  };

  const handlePlaceSignature = (
    id: string,
    pageIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    console.log("Signature placed:", { id, pageIndex, x, y, width, height });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Top Control Bar */}
      <Paper
        p="sm"
        shadow="sm"
        style={{
          flexShrink: 0,
          zIndex: Z_INDEX_FULLSCREEN_SURFACE,
          position: "relative",
        }}
      >
        <Group
          justify="space-between"
          style={{ flexWrap: isPhone ? "wrap" : "nowrap" }}
        >
          <Group gap="md">
            <LocalIcon
              icon="signature-rounded"
              width="1.5rem"
              height="1.5rem"
            />
            <div>
              <Text
                size="sm"
                fw={600}
                style={{ maxWidth: isPhone ? "180px" : undefined }}
                truncate={isPhone ? "end" : undefined}
              >
                {signRequest.documentName}
              </Text>
              {!isPhone && (
                <Text size="xs" c="dimmed">
                  {t("certSign.collab.signRequest.from", "From")}:{" "}
                  {signRequest.ownerUsername} •{" "}
                  {new Date(signRequest.createdAt).toLocaleDateString()}
                </Text>
              )}
            </div>
          </Group>

          <Group
            gap="xs"
            style={{ width: isPhone ? "100%" : undefined }}
            justify={isPhone ? "flex-end" : undefined}
          >
            <Button
              variant="light"
              size="sm"
              leftSection={<FolderOpenIcon fontSize="small" />}
              onClick={handleAddToActiveFiles}
              style={{
                backgroundColor: "var(--landing-inner-paper-bg)",
                color: "var(--btn-open-file)",
                border: "1px solid var(--landing-inner-paper-border)",
              }}
            >
              {t(
                "certSign.collab.signRequest.addToFiles",
                "Add to Active Files",
              )}
            </Button>
            {signRequest.myStatus !== "SIGNED" &&
              signRequest.myStatus !== "DECLINED" && (
                <Button
                  variant="light"
                  color="red"
                  size="sm"
                  leftSection={<CancelIcon fontSize="small" />}
                  onClick={handleDecline}
                  loading={declining}
                >
                  {t("certSign.collab.signRequest.decline", "Decline Request")}
                </Button>
              )}
            {!isPhone && (
              <>
                <Divider orientation="vertical" />
                <Button.Group>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => annotationApiRef.current?.zoomOut()}
                    title={t("viewer.zoomOut", "Zoom out")}
                  >
                    <ZoomOutIcon fontSize="small" />
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => annotationApiRef.current?.resetZoom()}
                    title={t("viewer.resetZoom", "Reset zoom")}
                  >
                    <ZoomOutMapIcon fontSize="small" />
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => annotationApiRef.current?.zoomIn()}
                    title={t("viewer.zoomIn", "Zoom in")}
                  >
                    <ZoomInIcon fontSize="small" />
                  </Button>
                </Button.Group>
              </>
            )}
            <Divider orientation="vertical" />
            <CloseButton
              size="md"
              onClick={onBack}
              title={t(
                "certSign.collab.signRequest.backToList",
                "Back to Sign Requests",
              )}
            />
          </Group>
        </Group>
      </Paper>

      {/* Sign Controls Strip - always shown when user can sign */}
      {canSign && signControlsVisible && (
        <SignControlsStrip
          visible={signControlsVisible}
          placementMode={placementMode}
          onPlacementModeChange={setPlacementMode}
          onSignatureSelected={handleSignatureSelected}
          onComplete={handleOpenCertificateModal}
          canComplete={previewCount > 0}
          signatureConfig={signatureConfig}
          hasSelectedAnnotation={hasSelectedAnnotation}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      {/* PDF Viewer (full width) */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <LocalEmbedPDFWithAnnotations
          ref={annotationApiRef}
          file={pdfFile}
          onAnnotationChange={() => {}}
          placementMode={placementMode}
          signatureData={signatureConfig?.signatureData}
          signatureType={signatureConfig?.signatureType}
          onPlaceSignature={handlePlaceSignature}
          onPreviewCountChange={setPreviewCount}
        />
      </div>

      {/* Certificate Configuration Modal */}
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

export default SignRequestWorkbenchView;
