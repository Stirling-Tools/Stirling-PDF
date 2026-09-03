import { useTranslation } from "react-i18next";
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
        <section className="about-section__card">
          <h2 className="about-section__heading" id="help">
            {t("settings.help.label", "Tours")}
          </h2>
          <HelpSection isAdmin={isAdmin} onRequestClose={onRequestClose} />
        </section>

        <section className="about-section__card">
          <h2 className="about-section__heading" id="legal">
            {t("settings.legal.label", "Legal")}
          </h2>
          <LegalSection />
        </section>

        <section className="about-section__card">
          <h2
            className="about-section__heading"
            id="frontendThirdPartyLicenses"
          >
            {t("settings.licenses.frontendLabel", "Frontend Licenses")}
          </h2>
          <FrontendThirdPartyLicensesSection />
        </section>

        <section className="about-section__card">
          <h2 className="about-section__heading" id="backendThirdPartyLicenses">
            {t("settings.licenses.backendLabel", "Backend Licenses")}
          </h2>
          <BackendThirdPartyLicensesSection />
        </section>
      </div>
    </div>
  );
}
