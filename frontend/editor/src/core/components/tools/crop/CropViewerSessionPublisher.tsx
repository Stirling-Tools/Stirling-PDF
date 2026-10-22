import { useEffect } from "react";
import type { Rectangle } from "@app/utils/cropCoordinates";
import type { CropPageGeometry } from "@app/utils/cropPageGeometry";
import { setCropViewerSession } from "@app/components/tools/crop/cropViewerSession";

interface CropViewerSessionPublisherProps {
  enabled: boolean;
  geometry: CropPageGeometry | null;
  geometryPageNumber: number;
  cropArea: Rectangle;
  pageNumber: number;
  pageCount: number;
  aspectRatio: number | null;
  gridEnabled: boolean;
  snapEnabled: boolean;
  onApplyArea: (area: Rectangle, geometry: CropPageGeometry) => void;
  onPageChange: (page: number) => void;
}

/**
 * Publishes the tool's live state to the viewer overlay. Rendering nothing
 * keeps the panel the only owner of the parameters.
 */
export default function CropViewerSessionPublisher({
  enabled,
  geometry,
  geometryPageNumber,
  cropArea,
  pageNumber,
  pageCount,
  aspectRatio,
  gridEnabled,
  snapEnabled,
  onApplyArea,
  onPageChange,
}: CropViewerSessionPublisherProps) {
  useEffect(() => {
    return () => setCropViewerSession(null);
  }, []);

  useEffect(() => {
    if (!enabled || !geometry) {
      setCropViewerSession(null);
      return;
    }
    setCropViewerSession({
      geometry,
      geometryPageNumber,
      cropArea,
      pageNumber,
      pageCount,
      aspectRatio,
      gridEnabled,
      snapEnabled,
      applyArea: onApplyArea,
      onPageChange,
    });
  }, [
    enabled,
    geometry,
    geometryPageNumber,
    cropArea,
    pageNumber,
    pageCount,
    aspectRatio,
    gridEnabled,
    snapEnabled,
    onApplyArea,
    onPageChange,
  ]);

  return null;
}
