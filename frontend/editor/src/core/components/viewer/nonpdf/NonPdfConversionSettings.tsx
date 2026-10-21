import { Stack } from "@mantine/core";
import ConvertFromCbrSettings from "@app/components/tools/convert/ConvertFromCbrSettings";
import ConvertFromCbzSettings from "@app/components/tools/convert/ConvertFromCbzSettings";
import ConvertFromEbookSettings from "@app/components/tools/convert/ConvertFromEbookSettings";
import ConvertFromEmailSettings from "@app/components/tools/convert/ConvertFromEmailSettings";
import ConvertFromImageSettings from "@app/components/tools/convert/ConvertFromImageSettings";
import ConvertFromSvgSettings from "@app/components/tools/convert/ConvertFromSvgSettings";
import ConvertFromWebSettings from "@app/components/tools/convert/ConvertFromWebSettings";
import ConvertOfficeEngineSettings from "@app/components/tools/convert/ConvertOfficeEngineSettings";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import type { NonPdfConversionPlan } from "@app/utils/nonPdfConversion";

interface NonPdfConversionSettingsProps {
  plan: NonPdfConversionPlan;
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  disabled?: boolean;
}

/** Format-specific settings for the inline conversion surface. */
export function NonPdfConversionSettings({
  plan,
  parameters,
  onParameterChange,
  disabled = false,
}: NonPdfConversionSettingsProps) {
  const shared = { parameters, onParameterChange, disabled };

  const settings = (() => {
    switch (plan.optionsKind) {
      case "image":
        return <ConvertFromImageSettings {...shared} />;
      case "svg":
        return <ConvertFromSvgSettings {...shared} />;
      case "web":
        return <ConvertFromWebSettings {...shared} />;
      case "email":
        return <ConvertFromEmailSettings {...shared} />;
      case "ebook":
        return <ConvertFromEbookSettings {...shared} />;
      case "cbz":
        return <ConvertFromCbzSettings {...shared} />;
      case "cbr":
        return <ConvertFromCbrSettings {...shared} />;
      case "office":
        return <ConvertOfficeEngineSettings {...shared} />;
      default:
        return null;
    }
  })();

  if (!settings) return null;

  return (
    <Stack gap="sm" data-testid="nonpdf-settings">
      {settings}
    </Stack>
  );
}
