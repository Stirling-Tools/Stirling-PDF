import { useTranslation } from 'react-i18next';
import { TooltipContent } from '../../types/tips';

export const useSignModeTips = (): TooltipContent => {
  const { t } = useTranslation();

  return {
    header: {
      title: t("manageSignatures.signMode.tooltip.header.title", "About PDF Signatures")
    },
    tips: [
      {
        title: t("manageSignatures.signMode.tooltip.overview.title", "How signatures work"),
        description: t("manageSignatures.signMode.tooltip.overview.text", "Both modes seal the document (any edits are flagged as tampering) and record who/when/how for auditing. Viewer trust depends on the certificate chain.")
      },
      {
        title: t("manageSignatures.signMode.tooltip.manual.title", "Manual - Bring your certificate"),
        description: t("manageSignatures.signMode.tooltip.manual.text", "Use your own certificate files for brand-aligned identity. Can display <b>Trusted</b> when your CA/chain is recognized."),
        bullets: [
          t("manageSignatures.signMode.tooltip.manual.use", "Use for: customer-facing, legal, compliance.")
        ]
      },
      {
        title: t("manageSignatures.signMode.tooltip.auto.title", "Auto - Zero-setup, instant system seal"),
        description: t("manageSignatures.signMode.tooltip.auto.text", "Signs with a server <b>self-signed</b> certificate. Same <b>tamper-evident seal</b> and <b>audit trail</b>; typically shows <b>Unverified</b> in viewers."),
        bullets: [
          t("manageSignatures.signMode.tooltip.auto.use", "Use when: you need speed and consistent internal identity across reviews and records.")
        ]
      },
      {
        title: t("manageSignatures.signMode.tooltip.rule.title", "Rule of thumb"),
        description: t("manageSignatures.signMode.tooltip.rule.text", "Need recipient <b>Trusted</b> status? <b>Manual</b>. Need a fast, tamper-evident seal and audit trail with no setup? <b>Auto</b>.")
      }
    ]
  };
};