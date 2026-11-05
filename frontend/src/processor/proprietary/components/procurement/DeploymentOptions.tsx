import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, CarouselDots } from "@editor/ui";
import { Icon, type IconName } from "@editor/ui/Icon";
import type { Deployment } from "@processor/api/procurement";
import { ENTERPRISE_DOCS } from "@processor/components/procurement/enterpriseDocs";
import "@processor/components/procurement/DeploymentOptions.css";

interface Option {
  id: Deployment;
  icon: IconName;
  docs: string;
}

const OPTIONS: Option[] = [
  { id: "cloud", icon: "cloud", docs: ENTERPRISE_DOCS.cloud },
  { id: "selfhost", icon: "server", docs: ENTERPRISE_DOCS.server },
  { id: "airgap", icon: "shield-check", docs: ENTERPRISE_DOCS.offlineLicence },
];

/**
 * The ways to run Enterprise, one slide each with a link to its docs, for buyers who meet the
 * deployment question at the start of the trial without a technical background.
 *
 * Every slide shares one grid cell, so the card holds the tallest one's height and the page does
 * not jump between slides.
 */
export function DeploymentOptions() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const step = (by: number) =>
    setIndex((i) => (i + by + OPTIONS.length) % OPTIONS.length);

  const copy = {
    cloud: {
      title: t("portal.enterprise.options.cloud.title", "Stirling Cloud"),
      tagline: t(
        "portal.enterprise.options.cloud.tagline",
        "Hosted for you, with nothing to install.",
      ),
      points: [
        t(
          "portal.enterprise.options.cloud.point1",
          "Your team signs in at stirling.com/app",
        ),
        t(
          "portal.enterprise.options.cloud.point2",
          "Runs on AWS, with stored files encrypted at rest",
        ),
        t(
          "portal.enterprise.options.cloud.point3",
          "Single sign-on through your own identity provider needs self-hosting",
        ),
      ],
      more: t("portal.enterprise.options.cloud.more", "Stirling Cloud docs"),
    },
    selfhost: {
      title: t("portal.enterprise.options.selfhost.title", "Self-hosted"),
      tagline: t(
        "portal.enterprise.options.selfhost.tagline",
        "On your own servers, on-premises or in your own cloud.",
      ),
      points: [
        t(
          "portal.enterprise.options.selfhost.point1",
          "Install with Docker, or the Helm chart on Kubernetes",
        ),
        t(
          "portal.enterprise.options.selfhost.point2",
          "Documents are processed on your own infrastructure",
        ),
        t(
          "portal.enterprise.options.selfhost.point3",
          "OAuth2, OIDC or SAML single sign-on",
        ),
      ],
      more: t("portal.enterprise.options.selfhost.more", "Self-hosting docs"),
    },
    airgap: {
      title: t("portal.enterprise.options.airgap.title", "Air-gapped"),
      tagline: t(
        "portal.enterprise.options.airgap.tagline",
        "Self-hosted on a network with no internet access.",
      ),
      points: [
        t(
          "portal.enterprise.options.airgap.point1",
          "Activated with a licence file that works offline, not a key checked online",
        ),
        t(
          "portal.enterprise.options.airgap.point2",
          "Installs like self-hosted, from an image you bring across",
        ),
        t(
          "portal.enterprise.options.airgap.point3",
          "Sign-in stays inside your network",
        ),
      ],
      more: t("portal.enterprise.options.airgap.more", "Offline licence docs"),
    },
  };

  return (
    <section
      className="ent__options"
      aria-roledescription="carousel"
      aria-label={t("portal.enterprise.options.label", "Ways to run it")}
    >
      <div className="ent__options-head">
        <span className="ent__options-eyebrow">
          {t("portal.enterprise.options.label", "Ways to run it")}
        </span>
        <div className="ent__options-nav">
          <ActionIcon
            variant="quiet"
            size="sm"
            aria-label={t("portal.enterprise.options.previous", "Previous")}
            onClick={() => step(-1)}
          >
            <Icon name="chevron-left" size={16} />
          </ActionIcon>
          <ActionIcon
            variant="quiet"
            size="sm"
            aria-label={t("portal.enterprise.options.next", "Next")}
            onClick={() => step(1)}
          >
            <Icon name="chevron-right" size={16} />
          </ActionIcon>
        </div>
      </div>

      <div className="ent__options-slides" aria-live="polite">
        {OPTIONS.map((option, i) => {
          const c = copy[option.id];
          const active = i === index;
          return (
            <div
              key={option.id}
              className="ent__options-slide"
              data-active={active || undefined}
              aria-hidden={!active}
              inert={!active}
              aria-roledescription="slide"
              aria-label={t("portal.enterprise.options.slideOf", {
                defaultValue: "{{n}} of {{total}}",
                n: i + 1,
                total: OPTIONS.length,
              })}
            >
              <div className="ent__options-title">
                <span className="ent__options-icon">
                  <Icon name={option.icon} size={18} />
                </span>
                <div>
                  <strong>{c.title}</strong>
                  <span>{c.tagline}</span>
                </div>
              </div>
              <ul className="ent__options-points">
                {c.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <a
                className="ent__options-more"
                href={option.docs}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.more}
                <Icon name="external-link" size={14} />
              </a>
            </div>
          );
        })}
      </div>

      <CarouselDots
        count={OPTIONS.length}
        activeIndex={index}
        onSelect={setIndex}
        label={t("portal.enterprise.options.label", "Ways to run it")}
        dotLabel={(i) => copy[OPTIONS[i].id].title}
        className="ent__options-dots"
      />
    </section>
  );
}
