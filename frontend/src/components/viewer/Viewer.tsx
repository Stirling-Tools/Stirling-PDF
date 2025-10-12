import EmbedPdfViewer from './EmbedPdfViewer';

export interface ViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File | null;
}

const Viewer = (props: ViewerProps) => {
  // Default to EmbedPDF viewer
  return <EmbedPdfViewer {...props} />;
};

export default Viewer;
