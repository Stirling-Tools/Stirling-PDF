import React, { useState } from "react";
import { Container } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { LandingDocumentStack } from "@app/components/shared/LandingDocumentStack";
import { LandingActions } from "@app/components/shared/LandingActions";
import "@app/components/shared/LandingPage.css";

const LandingPage = () => {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const terminology = useFileActionTerminology();
  const [mobileUploadModalOpen, setMobileUploadModalOpen] = useState(false);

  const handleFileDrop = async (files: File[]) => {
    await addFiles(files);
  };

  const handleNativeUploadClick = async () => {
    const files = await openFilesFromDisk({
      multiple: true,
      onFallbackOpen: () => fileInputRef.current?.click(),
    });
    if (files.length > 0) {
      await addFiles(files);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      await addFiles(files);
    }
    event.target.value = "";
  };

  const handleFilesReceivedFromMobile = async (files: File[]) => {
    if (files.length > 0) {
      await addFiles(files);
    }
  };

  return (
    <Container
      size="70rem"
      p={0}
      h="100%"
      className="flex min-h-0 flex-col"
      style={{ position: "relative" }}
    >
      <Dropzone
        onDrop={handleFileDrop}
        multiple
        activateOnClick={false}
        enablePointerEvents
        aria-label={terminology.dropFilesHere}
        className="flex min-h-0 flex-1 cursor-default flex-col items-center justify-center border-none bg-transparent px-4 py-8 shadow-none outline-none"
        styles={{
          root: {
            border: "none !important",
            backgroundColor: "transparent",
            overflow: "visible",
            "&[data-accept]": {
              outline: "2px dashed var(--accent-interactive)",
              outlineOffset: 4,
            },
            "&[data-reject]": {
              outline: "2px dashed var(--mantine-color-red-6)",
              outlineOffset: 4,
            },
          },
          inner: {
            overflow: "visible",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
          },
        }}
      >
        <LandingDocumentStack />

        <h1 className="landing-title">
          {t("landing.heroTitle", "Stirling PDF")}
        </h1>
        <p className="landing-subtitle">
          {t(
            "landing.heroSubtitle",
            "Drop in or add an existing PDF to get started.",
          )}
        </p>

        <LandingActions
          fileInputRef={fileInputRef}
          onUploadClick={() => void handleNativeUploadClick()}
          onMobileUploadClick={() => setMobileUploadModalOpen(true)}
          onFileSelect={handleFileSelect}
        />
      </Dropzone>

      <MobileUploadModal
        opened={mobileUploadModalOpen}
        onClose={() => setMobileUploadModalOpen(false)}
        onFilesReceived={handleFilesReceivedFromMobile}
      />
    </Container>
  );
};

export default LandingPage;
