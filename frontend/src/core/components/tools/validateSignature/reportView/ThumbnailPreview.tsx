import LocalIcon from '@app/components/shared/LocalIcon';
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
      <LocalIcon icon="picture-as-pdf-rounded" width={32} height={32} />
    </div>
  );
};

export default ThumbnailPreview;
