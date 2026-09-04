import { useTranslation } from "react-i18next";
import { SettingsCard } from "@app/components/shared/config/SettingsCard";
import HelpSection from "@app/components/shared/config/configSections/HelpSection";
import LegalSection from "@app/components/shared/config/configSections/LegalSection";
import {
  BackendThirdPartyLicensesSection,
  FrontendThirdPartyLicensesSection,
} from "@app/components/shared/config/configSections/ThirdPartyLicensesSection";
import "@app/components/shared/config/configSections/AboutSection.css";

export interface AboutSectionProps {
  isAdmin: boolean;
  /** Tours need the settings page out of the way before they can run. */
  onRequestClose: () => void;
}

/**
 * The reference material that used to be four nav rows. Each card keeps the
 * label its row had and carries that row's id, so `?focus=` deep links and
 * search results for the retired keys still land on the right card.
 *
 * Backend licences come last: it is the only card here that fetches, and the
 * only one that can render an error in place of its list.
 */
export default function AboutSection({
  isAdmin,
  onRequestClose,
}: AboutSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="settings-section-container">
      <div className="about-section">
        <SettingsCard
          id="help"
          title={t("settings.help.label", "Tours")}
          description={t(
            "settings.help.description",
            "Guided walkthroughs of the editor and the admin area.",
          )}
        >
          <HelpSection isAdmin={isAdmin} onRequestClose={onRequestClose} />
        </SettingsCard>

        <SettingsCard
          id="legal"
          title={t("settings.legal.label", "Legal")}
          description={t(
            "settings.legal.description",
            "Terms, privacy policy and your cookie preferences.",
          )}
        >
          <LegalSection />
        </SettingsCard>

        <SettingsCard
          id="frontendThirdPartyLicenses"
          title={t("settings.licenses.frontendLabel", "Frontend Licenses")}
          description={t(
            "settings.licenses.frontendDescription",
            "Licenses for frontend dependencies bundled into the release build.",
          )}
          defaultCollapsed
          lazy
        >
          <FrontendThirdPartyLicensesSection />
        </SettingsCard>

        <SettingsCard
          id="backendThirdPartyLicenses"
          title={t("settings.licenses.backendLabel", "Backend Licenses")}
          description={t(
            "settings.licenses.backendDescription",
            "Licenses for backend dependencies bundled with this server.",
          )}
          defaultCollapsed
          lazy
        >
          <BackendThirdPartyLicensesSection />
        </SettingsCard>
      </div>
    </div>
  );
}
