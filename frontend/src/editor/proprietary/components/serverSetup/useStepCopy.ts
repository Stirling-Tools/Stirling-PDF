import { useTranslation } from "react-i18next";
import type { SetupStepId } from "@editor/components/serverSetup/serverSetupDraft";

/** Each setup card's title and subtitle, shared by the wizard and its stories. */
export function useStepCopy() {
  const { t } = useTranslation();
  return (step: SetupStepId) => {
    switch (step) {
      case "addresses":
        return {
          title: t("serverSetup.addresses.title", "Addresses"),
          subtitle: t(
            "serverSetup.addresses.subtitle",
            "How people and sign-in providers reach this server.",
          ),
        };
      case "language":
        return {
          title: t("serverSetup.language.title", "Language"),
          subtitle: t(
            "serverSetup.language.subtitle",
            "What new visitors see first.",
          ),
        };
      case "signIn":
        return {
          title: t("serverSetup.signIn.title", "Sign-in"),
          subtitle: t("serverSetup.signIn.subtitle", "How your team signs in."),
        };
      case "email":
        return {
          title: t("serverSetup.email.title", "Email"),
          subtitle: t(
            "serverSetup.email.subtitle",
            "For invites, signing requests and shares.",
          ),
        };
      case "files":
        return {
          title: t("serverSetup.files.title", "Files"),
          subtitle: t(
            "serverSetup.files.subtitle",
            "Manage file storage and sharing.",
          ),
        };
      case "ai":
        return {
          title: t("serverSetup.ai.title", "AI"),
          subtitle: t(
            "serverSetup.ai.subtitle",
            "Document questions, automated edits and AI agents.",
          ),
        };
      case "summary":
        return {
          title: t("serverSetup.summary.title", "Quick start"),
          subtitle: t(
            "serverSetup.summary.subtitle",
            "Check the essentials. Everything else keeps its default.",
          ),
        };
      case "password":
        return {
          title: t("serverSetup.account.title", "Set up your account"),
          subtitle: t(
            "serverSetup.account.subtitle",
            "Choose how you'll sign in from now on.",
          ),
        };
      case "analytics":
        return {
          title: t("serverSetup.analytics.title", "Analytics"),
          subtitle: t(
            "serverSetup.analytics.subtitle",
            "Help make Stirling PDF better.",
          ),
        };
    }
  };
}
