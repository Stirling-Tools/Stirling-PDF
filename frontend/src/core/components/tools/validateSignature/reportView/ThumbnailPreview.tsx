import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import '@app/components/tools/validateSignature/reportView/styles.css';

const ThumbnailPreview = ({
  thumbnailUrl,
  fileName,
}: {
  thumbnailUrl?: string | null;
  fileName: string;
}) => {
  if (thumbnailUrl) {
    return (
      <div className="thumbnail-container">
        <img
          src={thumbnailUrl}
          alt={`${fileName} thumbnail`}
          className="thumbnail-image"
        />
      </div>
    );
  }

  return (
    <div className="thumbnail-placeholder">
      <PictureAsPdfIcon fontSize="large" />
    </div>
  );
};

export default ThumbnailPreview;
