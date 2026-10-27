import React, { useState } from "react";
import { Container } from "@mantine/core";
import { useFileHandler } from "@editor/hooks/useFileHandler";
import MobileUploadModal from "@editor/components/shared/MobileUploadModal";
import { openFilesFromDisk } from "@editor/services/openFilesFromDisk";
import { Logo } from "@editor/ui/Logo";
import { LandingActions } from "@editor/components/shared/LandingActions";
import "@editor/components/shared/LandingPage.css";

const LandingPage = () => {
  const { addFiles } = useFileHandler();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [mobileUploadModalOpen, setMobileUploadModalOpen] = useState(false);

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
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-visible px-4 py-8">
        <Logo
          variant="iconAndText"
          orientation="vertical"
          iconHeight="5rem"
          textHeight="2.5rem"
          gap="1rem"
          className="landing-logo-enter"
          style={{ marginBottom: "2.5rem" }}
        />

        <div className="landing-actions-enter">
          <LandingActions
            fileInputRef={fileInputRef}
            onUploadClick={() => void handleNativeUploadClick()}
            onMobileUploadClick={() => setMobileUploadModalOpen(true)}
            onFileSelect={handleFileSelect}
          />
        </div>
      </div>

      <MobileUploadModal
        opened={mobileUploadModalOpen}
        onClose={() => setMobileUploadModalOpen(false)}
        onFilesReceived={handleFilesReceivedFromMobile}
      />
    </Container>
  );
};

export default LandingPage;
