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
          "Draw a box straight onto the document to say where the signature should appear. Useful when a form has a printed line or box meant for the signature.",
        ),
        bullets: [
          t(
            "certSign.appearance.tooltip.placement.bullet1",
            "Drag across the page, or click one corner and then the opposite one",
          ),
          t(
            "certSign.appearance.tooltip.placement.bullet2",
            "The page you draw on becomes the page that gets signed",
          ),
          t(
            "certSign.appearance.tooltip.placement.bullet3",
            "The text grows or shrinks to fill the box, so no space is wasted",
          ),
          t(
            "certSign.appearance.tooltip.placement.bullet4",
            "Draw nothing and the signature goes in its usual place",
          ),
        ],
      },
      {
        title: t(
          "certSign.appearance.tooltip.markAllPages.title",
          "Showing It on Every Page",
        ),
        description: t(
          "certSign.appearance.tooltip.markAllPages.text",
          "Long documents are often initialled on every page so a reader can see the whole thing was signed. A PDF can only be signed in one place, so the other pages get a matching mark instead.",
        ),
        bullets: [
          t(
            "certSign.appearance.tooltip.markAllPages.bullet1",
            "Only the page you drew on carries the real signature",
          ),
          t(
            "certSign.appearance.tooltip.markAllPages.bullet2",
            "Clicking a mark jumps to that page, where you can check the signature",
          ),
          t(
            "certSign.appearance.tooltip.markAllPages.bullet3",
            "Draw the box first — there has to be a shape to repeat",
          ),
        ],
      },
      {
        title: t("certSign.appearance.tooltip.logo.title", "Adding Your Logo"),
        description: t(
          "certSign.appearance.tooltip.logo.text",
          "Upload your organisation's logo to show it inside the signature box, and choose where it sits. Leave it empty and the built-in Stirling PDF mark is used instead.",
        ),
        bullets: [
          t(
            "certSign.appearance.tooltip.logo.bullet1",
            "PNG or JPEG; the image keeps its proportions, never stretched",
          ),
          t(
            "certSign.appearance.tooltip.logo.bullet2",
            "Put it beside the text, above it, below it, or behind it",
          ),
          t(
            "certSign.appearance.tooltip.logo.bullet3",
            "Behind draws it as a faded watermark, so the text stays readable on top",
          ),
          t(
            "certSign.appearance.tooltip.logo.bullet4",
            "It takes the largest size the box allows, and the text fills what is left",
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
