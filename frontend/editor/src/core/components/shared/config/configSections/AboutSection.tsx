import { useState } from "react";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
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
  // Both lists are hundreds of rows; showing them open buries everything above.
  const [openList, setOpenList] = useState<"frontend" | "backend" | null>(null);

  return (
    <div className="settings-section-container">
      <div className="about-section">
        <section className="about-section__card">
          <h2 className="about-section__heading" id="help">
            {t("settings.help.label", "Tours")}
          </h2>
          <p className="about-section__description">
            {t(
              "settings.help.description",
              "Guided walkthroughs of the editor and the admin area.",
            )}
          </p>
          <HelpSection isAdmin={isAdmin} onRequestClose={onRequestClose} />
        </section>

        <section className="about-section__card">
          <h2 className="about-section__heading" id="legal">
            {t("settings.legal.label", "Legal")}
          </h2>
          <p className="about-section__description">
            {t(
              "settings.legal.description",
              "Terms, privacy policy and your cookie preferences.",
            )}
          </p>
          <LegalSection />
        </section>

        <section className="about-section__card">
          <h2 className="about-section__heading">
            <button
              type="button"
              id="frontendThirdPartyLicenses"
              className="about-section__disclosure"
              aria-expanded={openList === "frontend"}
              aria-controls="about-frontend-licenses"
              onClick={() =>
                setOpenList((open) => (open === "frontend" ? null : "frontend"))
              }
            >
              <LocalIcon
                icon="expand-more-rounded"
                width={16}
                height={16}
                className="about-section__disclosure-chevron"
              />
              {t("settings.licenses.frontendLabel", "Frontend Licenses")}
            </button>
          </h2>
          <p className="about-section__description">
            {t(
              "settings.licenses.frontendDescription",
              "Licenses for frontend dependencies bundled into the release build.",
            )}
          </p>
          <div id="about-frontend-licenses" hidden={openList !== "frontend"}>
            {openList === "frontend" && <FrontendThirdPartyLicensesSection />}
          </div>
        </section>

        <section className="about-section__card">
          <h2 className="about-section__heading">
            <button
              type="button"
              id="backendThirdPartyLicenses"
              className="about-section__disclosure"
              aria-expanded={openList === "backend"}
              aria-controls="about-backend-licenses"
              onClick={() =>
                setOpenList((open) => (open === "backend" ? null : "backend"))
              }
            >
              <LocalIcon
                icon="expand-more-rounded"
                width={16}
                height={16}
                className="about-section__disclosure-chevron"
              />
              {t("settings.licenses.backendLabel", "Backend Licenses")}
            </button>
          </h2>
          <p className="about-section__description">
            {t(
              "settings.licenses.backendDescription",
              "Licenses for backend dependencies bundled with this server.",
            )}
          </p>
          <div id="about-backend-licenses" hidden={openList !== "backend"}>
            {openList === "backend" && <BackendThirdPartyLicensesSection />}
          </div>
        </section>
      </div>
    </div>
  );
}
