import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import "@editor/components/shared/signatureFields/StampPreviewFrame.css";

interface StampPreviewFrameProps {
  /** The stamp image, drawn at its box's proportions; a dashed line marks the box's edges. */
  src: string;
  alt: string;
}

export function StampPreviewFrame({ src, alt }: StampPreviewFrameProps) {
  return (
    <div className={`stamp-preview-frame ${privateContentClassName}`}>
      <img src={src} alt={alt} />
    </div>
  );
}
