import { useTranslation } from "react-i18next";
import { TooltipContent } from "@app/types/tips";

export const useGroupSigningTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("groupSigning.tooltip.header", "About Group Signing"),
    },
    tips: [
      {
        title: t(
          "groupSigning.tooltip.sequential.title",
          "Signing in Any Order",
        ),
        description: t(
          "groupSigning.tooltip.sequential.description",
          "Assigned participants can review and sign independently, in any order.",
        ),
        bullets: [
          t(
            "groupSigning.tooltip.sequential.bullet1",
            "Participants do not need to wait for another signer",
          ),
          t(
            "groupSigning.tooltip.sequential.bullet2",
            "Track each participant's progress in Signing Sessions",
          ),
          t(
            "groupSigning.tooltip.sequential.bullet3",
            "A due date is a reminder; it does not expire access",
          ),
        ],
      },
      {
        title: t("groupSigning.tooltip.roles.title", "Participant Roles"),
        description: t(
          "groupSigning.tooltip.roles.description",
          "The owner sets request defaults; each participant chooses their certificate and optional visible mark.",
        ),
        bullets: [
          t(
            "groupSigning.tooltip.roles.bullet1",
            "Owner (you): Creates session, configures signature defaults, finalizes document",
          ),
          t(
            "groupSigning.tooltip.roles.bullet2",
            "Participants: Choose a certificate and optionally place a visible signature on the PDF",
          ),
          t(
            "groupSigning.tooltip.roles.bullet3",
            "Participants can adjust their signature reason and location before submitting",
          ),
        ],
      },
      {
        title: t(
          "groupSigning.tooltip.finalization.title",
          "Finalization Process",
        ),
        description: t(
          "groupSigning.tooltip.finalization.description",
          "After at least one participant has signed, the owner can finalize the request and generate the signed PDF.",
        ),
        bullets: [
          t(
            "groupSigning.tooltip.finalization.bullet1",
            "The final PDF includes all accepted signatures",
          ),
          t(
            "groupSigning.tooltip.finalization.bullet2",
            "Review outstanding participants before finalizing with partial signatures",
          ),
          t(
            "groupSigning.tooltip.finalization.bullet3",
            "Finalization closes the request; outstanding participants can no longer sign",
          ),
        ],
      },
    ],
  };
};
