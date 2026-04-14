import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRightRailButtons, RightRailButtonWithAction } from "@app/hooks/useRightRailButtons";

interface FileEditorRightRailButtonsParams {
  totalItems: number;
  onCloseAll: () => void;
}

export function useFileEditorRightRailButtons({ totalItems, onCloseAll }: FileEditorRightRailButtonsParams) {
  const { t, i18n } = useTranslation();

  const buttons = useMemo<RightRailButtonWithAction[]>(() => [], [t, i18n.language, totalItems, onCloseAll]);

  useRightRailButtons(buttons);
}
