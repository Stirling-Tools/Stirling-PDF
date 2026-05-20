import { Button } from "@mantine/core";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useTranslation } from "react-i18next";

interface NonPdfBannerProps {
  onConvertToPdf?: () => void;
}

export function NonPdfBanner({ onConvertToPdf }: NonPdfBannerProps) {
  const { t } = useTranslation();

  if (!onConvertToPdf) return null;

  return (
    <Button
      size="xs"
      variant="light"
      color="orange"
      leftSection={<PictureAsPdfIcon style={{ fontSize: "0.9rem" }} />}
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
