import EmbedPdfViewer from '@app/components/viewer/EmbedPdfViewer';

export interface ViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File | null;
  activeFileIndex?: number;
  setActiveFileIndex?: (index: number) => void;
}

const Viewer = (props: ViewerProps) => {
  // Default to EmbedPDF viewer
  return <EmbedPdfViewer {...props} />;
};

export default Viewer;
