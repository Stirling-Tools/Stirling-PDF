import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const useSignatureAppearanceTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t(
        "certSign.appearance.tooltip.header.title",
        "About Signature Appearance",
      ),
    },
    tips: [
      {
        title: t(
          "certSign.appearance.tooltip.invisible.title",
          "Invisible Signatures",
        ),
        description: t(
          "certSign.appearance.tooltip.invisible.text",
          "The signature is added to the PDF for security but won't be visible when viewing the document. Perfect for legal requirements without changing the document's appearance.",
        ),
        bullets: [
          t(
            "certSign.appearance.tooltip.invisible.bullet1",
            "Provides security without visual changes",
          ),
          t(
            "certSign.appearance.tooltip.invisible.bullet2",
            "Meets legal requirements for digital signing",
          ),
          t(
            "certSign.appearance.tooltip.invisible.bullet3",
            "Doesn't affect document layout or design",
          ),
        ],
      },
      {
        title: t(
          "certSign.appearance.tooltip.visible.title",
          "Visible Signatures",
        ),
        description: t(
          "certSign.appearance.tooltip.visible.text",
          "Shows a signature block on the PDF with your name, date, and optional details. Useful when you want readers to clearly see the document is signed.",
        ),
        bullets: [
          t(
            "certSign.appearance.tooltip.visible.bullet1",
            "Shows signer name and date on the document",
          ),
          t(
            "certSign.appearance.tooltip.visible.bullet2",
            "Can include reason and location for signing",
          ),
          t(
            "certSign.appearance.tooltip.visible.bullet3",
            "Choose exactly where on the page it goes",
          ),
          t(
            "certSign.appearance.tooltip.visible.bullet4",
            "Optional logo can be included",
          ),
        ],
      },
      {
        title: t(
          "certSign.appearance.tooltip.placement.title",
          "Choosing Where the Signature Goes",
        ),
        description: t(
          "certSign.appearance.tooltip.placement.text",
          "Drag a box on the page preview to say where the signature should appear, the same way you would draw a crop area. Useful when a document has a printed line or box meant for the signature.",
        ),
        bullets: [
          t(
            "certSign.appearance.tooltip.placement.bullet1",
            "Drag to draw the box, then drag its corners to resize it",
          ),
          t(
            "certSign.appearance.tooltip.placement.bullet2",
            "The text shrinks to fit, so it never spills over the page",
          ),
          t(
            "certSign.appearance.tooltip.placement.bullet3",
            "Leave it alone and the signature goes in its usual place",
          ),
        ],
      },
      {
        title: t(
          "certSign.appearance.tooltip.attributes.title",
          "Choosing What the Signature Shows",
        ),
        description: t(
          "certSign.appearance.tooltip.attributes.text",
          "Your certificate holds details such as your name, who issued it and how long it is valid. Tick the ones you want printed inside the signature box.",
        ),
        bullets: [
          t(
            "certSign.appearance.tooltip.attributes.bullet1",
            "Show only what matters, such as your name and the date",
          ),
          t(
            "certSign.appearance.tooltip.attributes.bullet2",
            "Add the issuing authority when the reader needs to trust the source",
          ),
          t(
            "certSign.appearance.tooltip.attributes.bullet3",
            "Details your certificate does not contain are simply left out",
          ),
        ],
      },
    ],
  };
};
