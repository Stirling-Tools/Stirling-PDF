import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import "@app/components/tools/validateSignature/reportView/styles.css";

const ThumbnailPreview = ({
  thumbnailUrl,
  fileName,
}: {
  thumbnailUrl?: string | null;
  fileName: string;
}) => {
  const { t } = useTranslation();
  if (thumbnailUrl) {
    return (
      <div className="thumbnail-container">
        <img
          src={thumbnailUrl}
          alt={t(
            "validateSignature.report.thumbnailAlt",
            "{{fileName}} thumbnail",
            {
              fileName,
            },
          )}
          className="thumbnail-image"
        />
      </div>
    );
  }

  return (
    <div className="thumbnail-placeholder">
      <Icon name="file-pdf" size={35} />
    </div>
  );
};

export default ThumbnailPreview;
