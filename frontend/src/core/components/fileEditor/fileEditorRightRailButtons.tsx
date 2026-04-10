import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRightRailButtons, RightRailButtonWithAction } from "@app/hooks/useRightRailButtons";
import LocalIcon from "@app/components/shared/LocalIcon";

interface FileEditorRightRailButtonsParams {
  totalItems: number;
  onCloseAll: () => void;
}

export function useFileEditorRightRailButtons({
  totalItems,
  onCloseAll,
}: FileEditorRightRailButtonsParams) {
  const { t, i18n } = useTranslation();

  const buttons = useMemo<RightRailButtonWithAction[]>(
    () => [
      {
        id: "file-close-all",
        icon: <LocalIcon icon="close-rounded" width="1.5rem" height="1.5rem" />,
        tooltip: t("rightRail.closeAll", "Close All Files"),
        ariaLabel: typeof t === "function" ? t("rightRail.closeAll", "Close All Files") : "Close All Files",
        section: "top" as const,
        order: 30,
        disabled: totalItems === 0,
        visible: totalItems > 0,
        onClick: onCloseAll,
      },
    ],
    [t, i18n.language, totalItems, onCloseAll],
  );

  useRightRailButtons(buttons);
}
