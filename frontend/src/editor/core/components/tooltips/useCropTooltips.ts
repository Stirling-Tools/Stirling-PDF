import { useTranslation } from "react-i18next";

export function useCropTooltips() {
  const { t } = useTranslation();

  return {
    header: {
      title: t("crop.tooltip.title", "How to Crop PDFs"),
    },
    tips: [
      {
        description: t(
          "crop.tooltip.description",
          "Drag the handles to trim the page. Zoom in, or open the full-screen editor, when you need to place an edge precisely.",
        ),
        bullets: [
          t(
            "crop.tooltip.drag",
            "Drag inside the selection to move the whole area",
          ),
          t(
            "crop.tooltip.resize",
            "Drag a corner or edge handle to resize; hold Alt while using the arrow keys to resize from the keyboard",
          ),
          t(
            "crop.tooltip.precision",
            "Type margins in millimetres, or exact PDF points, for repeatable crops",
          ),
        ],
      },
    ],
  };
}
