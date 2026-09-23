import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";

interface NonPdfBannerProps {
  onConvertToPdf?: () => void;
}

export function NonPdfBanner({ onConvertToPdf }: NonPdfBannerProps) {
  const { t } = useTranslation();

  if (!onConvertToPdf) return null;

  return (
    <Button
      size="sm"
      variant="secondary"
      accent="warning"
      leftSection={<Icon name="file-pdf" size={"0.9rem"} />}
      onClick={onConvertToPdf}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
      }}
    >
      {t("viewer.nonPdf.convertToPdf")}
    </Button>
  );
}
