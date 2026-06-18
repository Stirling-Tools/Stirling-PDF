import { useEffect } from "react";
import AddWatermarkSingleStepSettings from "@app/components/tools/addWatermark/AddWatermarkSingleStepSettings";
import type { AddWatermarkParameters } from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

interface PolicyWatermarkConfigProps {
  parameters: Record<string, unknown>;
  onChange: (parameters: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Watermark configuration for a policy: the full watermark settings minus the
 * "Flatten PDF pages to images" toggle (hidden), with flatten forced on so the
 * watermark is baked into the page and can't be stripped out. Normalised once
 * on mount.
 */
export function PolicyWatermarkConfig({
  parameters,
  onChange,
  disabled,
}: PolicyWatermarkConfigProps) {
  useEffect(() => {
    if (parameters.convertPDFToImage !== true) {
      onChange({ ...parameters, convertPDFToImage: true });
    }
  }, []);

  return (
    <AddWatermarkSingleStepSettings
      parameters={parameters as unknown as AddWatermarkParameters}
      onParameterChange={(key, value) =>
        onChange({ ...parameters, [key]: value })
      }
      disabled={disabled}
      showFlatten={false}
    />
  );
}
