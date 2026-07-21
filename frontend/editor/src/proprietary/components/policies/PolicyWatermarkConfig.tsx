import { useEffect } from "react";
import AddWatermarkSingleStepSettings from "@app/components/tools/addWatermark/AddWatermarkSingleStepSettings";
import type { AddWatermarkParameters } from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

interface PolicyWatermarkConfigProps {
  parameters: AddWatermarkParameters;
  onChange: (parameters: AddWatermarkParameters) => void;
  disabled?: boolean;
}

/**
 * Watermark configuration for a policy: text watermarks only (the type selector
 * and image option are hidden), minus the "Flatten PDF pages to images" toggle
 * (hidden), with flatten forced on so the watermark is baked into the page and
 * can't be stripped out. Normalised once on mount.
 */
export function PolicyWatermarkConfig({
  parameters,
  onChange,
  disabled,
}: PolicyWatermarkConfigProps) {
  useEffect(() => {
    const patch: Partial<AddWatermarkParameters> = {};
    if (parameters.convertPDFToImage !== true) patch.convertPDFToImage = true;
    // Policies only support text watermarks.
    if (parameters.watermarkType !== "text") patch.watermarkType = "text";
    if (Object.keys(patch).length > 0) onChange({ ...parameters, ...patch });
  }, []);

  return (
    <AddWatermarkSingleStepSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        onChange({ ...parameters, [key]: value })
      }
      disabled={disabled}
      showFlatten={false}
      textOnly
    />
  );
}
