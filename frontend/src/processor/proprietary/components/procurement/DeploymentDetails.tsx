import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import type { Deployment } from "@processor/api/procurement";
import { ENTERPRISE_DOCS } from "@processor/components/procurement/enterpriseDocs";
import "@processor/components/procurement/DeploymentDetails.css";

const DOCS: Record<Deployment, string> = {
  cloud: ENTERPRISE_DOCS.cloud,
  selfhost: ENTERPRISE_DOCS.server,
  airgap: ENTERPRISE_DOCS.offlineLicence,
};

/**
 * What the chosen way to run Enterprise involves, with a link to its docs, beside the choice in
 * the trial setup. Buyers meet the deployment question there, often without a technical background.
 */
export function DeploymentDetails({ deployment }: { deployment: Deployment }) {
  const { t } = useTranslation();

  const copy = {
    cloud: {
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
  }[deployment];

  return (
    <div className="ent-deploy" aria-live="polite">
      <p className="ent-deploy__tagline">{copy.tagline}</p>
      <ul className="ent-deploy__points">
        {copy.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <a
        className="ent-deploy__more"
        href={DOCS[deployment]}
        target="_blank"
        rel="noopener noreferrer"
      >
        {copy.more}
        <Icon name="external-link" size={14} />
      </a>
    </div>
  );
}
