import React from "react";
import { Modal } from "@mantine/core";
import { useTranslation } from "react-i18next";
import OcrRuntimePanel from "@app/components/shared/ocr/OcrRuntimePanel";

export interface OcrRuntimeManagerProps {
  opened: boolean;
  onClose: () => void;
  /** Lets the picker refresh itself once the installed set has changed. */
  onLanguagesChanged?: () => void;
}

/**
 * The OCR installer as a dialog, for the point in the OCR tool where someone
 * discovers their language is missing. Settings renders the same panel inline.
 */
const OcrRuntimeManager: React.FC<OcrRuntimeManagerProps> = ({
  opened,
  onClose,
  onLanguagesChanged,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("ocr.runtime.title", "OCR setup")}
      size="md"
    >
      <OcrRuntimePanel
        active={opened}
        onLanguagesChanged={onLanguagesChanged}
      />
    </Modal>
  );
};

export default OcrRuntimeManager;
