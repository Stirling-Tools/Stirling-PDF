import React from "react";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import OcrRuntimePanel from "@app/components/shared/ocr/OcrRuntimePanel";

/**
 * Settings entry for text recognition.
 *
 * The same panel the OCR tool opens in a dialog, shown inline here so someone
 * can set OCR up before they need it rather than only at the moment they are
 * blocked by it.
 */
const OcrSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <Text size="sm" c="dimmed">
        {t(
          "settings.ocr.description",
          "Text recognition is downloaded when you want it, so the installer stays small. Add or remove languages at any time.",
        )}
      </Text>
      <OcrRuntimePanel />
    </div>
  );
};

export default OcrSection;
