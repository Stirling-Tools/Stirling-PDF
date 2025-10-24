import { useTranslation } from 'react-i18next';
import { TooltipContent } from '@app/types/tips';

export const useBookletImpositionTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("bookletImposition.tooltip.header.title", "Booklet Creation Guide")
    },
    tips: [
      {
        title: t("bookletImposition.tooltip.description.title", "What is Booklet Imposition?"),
        description: t("bookletImposition.tooltip.description.text", "Creates professional booklets by arranging pages in the correct printing order. Your PDF pages are placed 2-up on landscape sheets so when folded and bound, they read in proper sequence like a real book.")
      },
      {
        title: t("bookletImposition.tooltip.example.title", "Example: 8-Page Booklet"),
        description: t("bookletImposition.tooltip.example.text", "Your 8-page document becomes 2 sheets:"),
        bullets: [
          t("bookletImposition.tooltip.example.bullet1", "Sheet 1 Front: Pages 8, 1  |  Back: Pages 2, 7"),
          t("bookletImposition.tooltip.example.bullet2", "Sheet 2 Front: Pages 6, 3  |  Back: Pages 4, 5"),
          t("bookletImposition.tooltip.example.bullet3", "When folded & stacked: Reads 1→2→3→4→5→6→7→8")
        ]
      },
      {
        title: t("bookletImposition.tooltip.printing.title", "How to Print & Assemble"),
        description: t("bookletImposition.tooltip.printing.text", "Follow these steps for perfect booklets:"),
        bullets: [
          t("bookletImposition.tooltip.printing.bullet1", "Print double-sided with 'Flip on long edge'"),
          t("bookletImposition.tooltip.printing.bullet2", "Stack sheets in order, fold in half"),
          t("bookletImposition.tooltip.printing.bullet3", "Staple or bind along the folded spine"),
          t("bookletImposition.tooltip.printing.bullet4", "For short-edge printers: Enable 'Flip on short edge' option")
        ]
      },
      {
        title: t("bookletImposition.tooltip.manualDuplex.title", "Manual Duplex (Single-sided Printers)"),
        description: t("bookletImposition.tooltip.manualDuplex.text", "For printers without automatic duplex:"),
        bullets: [
          t("bookletImposition.tooltip.manualDuplex.bullet1", "Turn OFF 'Double-sided printing'"),
          t("bookletImposition.tooltip.manualDuplex.bullet2", "Select '1st Pass' → Print → Stack face-down"),
          t("bookletImposition.tooltip.manualDuplex.bullet3", "Select '2nd Pass' → Load stack → Print backs"),
          t("bookletImposition.tooltip.manualDuplex.bullet4", "Fold and assemble as normal")
        ]
      },
      {
        title: t("bookletImposition.tooltip.advanced.title", "Advanced Options"),
        description: t("bookletImposition.tooltip.advanced.text", "Fine-tune your booklet:"),
        bullets: [
          t("bookletImposition.tooltip.advanced.bullet1", "Right-to-Left Binding: For Arabic, Hebrew, or RTL languages"),
          t("bookletImposition.tooltip.advanced.bullet2", "Borders: Shows cut lines for trimming"),
          t("bookletImposition.tooltip.advanced.bullet3", "Gutter Margin: Adds space for binding/stapling"),
          t("bookletImposition.tooltip.advanced.bullet4", "Short-edge Flip: Only for automatic duplex printers")
        ]
      }
    ]
  };
};