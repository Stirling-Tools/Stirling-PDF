import { useTranslation } from "react-i18next";
import { Banner } from "@editor/ui/Banner";
import { Icon } from "@editor/ui/Icon";

interface NoReductionNoticeProps {
  unreduced: number;
  total: number;
  /** Whether the run already used the strongest compression, so a retry cannot help. */
  atStrongest: boolean;
}

export function NoReductionNotice({
  unreduced,
  total,
  atStrongest,
}: NoReductionNoticeProps) {
  const { t } = useTranslation();

  let message: string;
  if (total === 1) {
    message = atStrongest
      ? t(
          "compress.noReduction.single",
          "Compression ran successfully, but this file can't be compressed any further.",
        )
      : t(
          "compress.noReduction.singleAtLevel",
          "Compression at this level made no improvement to this file. Try a higher compression level.",
        );
  } else {
    message = atStrongest
      ? t("compress.noReduction.multiple", {
          count: unreduced,
          total,
          defaultValue:
            "Compression ran successfully, but {{count}} of {{total}} files can't be compressed any further.",
        })
      : t("compress.noReduction.multipleAtLevel", {
          count: unreduced,
          total,
          defaultValue:
            "Compression at this level made no improvement to {{count}} of {{total}} files. Try a higher compression level.",
        });
  }

  return (
    <Banner
      tone="warning"
      icon={<Icon name="triangle-alert" />}
      description={message}
    />
  );
}
