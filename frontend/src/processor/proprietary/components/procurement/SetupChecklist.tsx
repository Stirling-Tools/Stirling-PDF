import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { copyText } from "@editor/utils/copyText";
import { EDITOR_URL } from "@processor/auth/editorUrl";
import { DownloadEditorModal } from "@processor/components/DownloadEditorModal";
import { useEditorInstalled } from "@processor/hooks/useEditorInstalled";
import "@processor/views/Procurement.css";

const DOCS = "https://docs.stirlingpdf.com";
const DOC = {
  docker: `${DOCS}/Server/Install/Docker/`,
  kubernetes: `${DOCS}/Server/Install/Kubernetes/`,
  licence: `${DOCS}/Server/Licensing/Plans-and-Licences/`,
  sso: `${DOCS}/Server/Security/OAuth-SSO/`,
  saml: `${DOCS}/Server/Security/SAML-SSO/`,
  ocr: `${DOCS}/Server/Operations/OCR-Languages/`,
};

const IMAGE = "stirlingtools/stirling-pdf:latest";
/** The extra fonts an offline server cannot fetch later. */
const FULL_IMAGE = "stirlingtools/stirling-pdf:latest-fat";

type Deployment = "cloud" | "selfhost" | "airgap";

interface StepLink {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface Step {
  id: string;
  title: string;
  body: string;
  links: StepLink[];
  /** A command to copy, for steps run on the buyer's own machines. */
  code?: string;
  /** Known from the account rather than ticked by the buyer. */
  done?: boolean;
}

/**
 * Getting Stirling itself running, for the deployment the buyer chose: open it on Cloud, or install,
 * sign in and license it on their own servers, with the command that starts it licensed.
 * Shown from the trial onward and kept at go-live, where it becomes the rollout checklist.
 *
 * <p>Ticks the buyer sets are remembered in this browser, per deal: there is no server record of
 * setup progress, and steps done on the buyer's own servers cannot be seen from here anyway.
 */
export function SetupChecklist({
  dealId,
  deployment,
  licenseKey,
  live,
  teamSize,
  onInvite,
  onDownloadOfflineLicense,
  downloadingLicense,
}: {
  dealId: number | null | undefined;
  deployment: string;
  licenseKey: string | null | undefined;
  /** At go-live the same steps read as the rollout checklist. */
  live: boolean;
  /** Seats in use on the team, so inviting is ticked once someone has joined. */
  teamSize: number;
  /** Absent for members, who cannot invite. */
  onInvite?: () => void;
  onDownloadOfflineLicense: () => void;
  downloadingLicense: boolean;
}) {
  const { t } = useTranslation();
  const [ticked, setTicked] = useTicks(dealId);
  const [downloading, setDownloading] = useState(false);
  const editorInstalled = useEditorInstalled();
  // Buyers arrive from the website, so the app itself is the first thing most of them still need.
  const getApp = (label: string): StepLink => ({
    label,
    onClick: () => setDownloading(true),
  });
  const openApp: StepLink = {
    label: t("portal.enterprise.setup.links.openApp", "Open Stirling"),
    href: EDITOR_URL,
  };
  const kind: Deployment =
    deployment === "selfhost" || deployment === "airgap" ? deployment : "cloud";
  const key = licenseKey ?? "YOUR-LICENCE-KEY";

  const runCommand = (image: string, licence: string) =>
    [
      "docker run -d --name stirling-pdf -p 8080:8080 \\",
      '  -v "$(pwd)/stirling/configs:/configs" \\',
      '  -v "$(pwd)/stirling/logs:/logs" \\',
      "  -e SECURITY_ENABLELOGIN=true \\",
      "  -e PREMIUM_ENABLED=true \\",
      `  -e PREMIUM_KEY=${licence} \\`,
      `  ${image}`,
    ].join("\n");

  // The same first sign-in on any server the buyer runs: the default admin, then the licence.
  const signInStep: Step = {
    id: "signIn",
    title: t("portal.enterprise.setup.signIn.title", "Sign in as the admin"),
    body: t(
      "portal.enterprise.setup.signIn.body",
      "Open http://your-server:8080 and sign in with admin / stirling. You'll be asked to choose a new password straight away.",
    ),
    links: [],
  };

  const ssoLinks: StepLink[] = [
    {
      label: t("portal.enterprise.setup.links.ssoGuide", "SSO guide"),
      href: DOC.sso,
    },
    {
      label: t("portal.enterprise.setup.links.samlGuide", "SAML guide"),
      href: DOC.saml,
    },
  ];

  const peopleStep = (body: string): Step => ({
    id: "people",
    title: t("portal.enterprise.setup.people.title", "Add your people"),
    body,
    links: [
      getApp(
        t(
          "portal.enterprise.setup.links.downloadForTeam",
          "Get the app for your team",
        ),
      ),
      ...ssoLinks,
    ],
  });

  const steps: Step[] =
    kind === "cloud"
      ? [
          {
            id: "getApp",
            title: t("portal.enterprise.setup.getApp.title", "Get Stirling"),
            body: t(
              "portal.enterprise.setup.getApp.body",
              "Install the desktop app for Windows, Mac or Linux and sign in with the account you just made, or use it straight from your browser.",
            ),
            links: [
              getApp(
                t("portal.enterprise.setup.links.download", "Download the app"),
              ),
              {
                label: t(
                  "portal.enterprise.setup.links.browser",
                  "Use it in your browser",
                ),
                href: EDITOR_URL,
              },
            ],
            done: editorInstalled,
          },
          {
            id: "firstDocument",
            title: t(
              "portal.enterprise.setup.firstDocument.title",
              "Run your first document",
            ),
            body: t(
              "portal.enterprise.setup.firstDocument.body",
              "Upload a PDF your team works with and try the tools you'd use day to day, such as redact, compress or OCR.",
            ),
            links: [openApp],
          },
          {
            id: "invite",
            title: t(
              "portal.enterprise.setup.invite.title",
              "Invite your team",
            ),
            body: t(
              "portal.enterprise.setup.invite.body",
              "Bring in the people who'll use it, so the trial reflects real work.",
            ),
            links: onInvite
              ? [
                  {
                    label: t(
                      "portal.enterprise.setup.links.invite",
                      "Invite teammates",
                    ),
                    onClick: onInvite,
                  },
                ]
              : [],
            done: teamSize > 1,
          },
          // No single sign-on step: on Stirling Cloud it needs self-hosting (see DeploymentOptions).
        ]
      : kind === "selfhost"
        ? [
            {
              id: "install",
              title: t(
                "portal.enterprise.setup.install.title",
                "Install and start Stirling",
              ),
              body: t(
                "portal.enterprise.setup.install.body",
                "Run this on your server. It starts Stirling with your licence applied, and the image includes OCR and office conversion. For larger teams, use Kubernetes.",
              ),
              code: runCommand(IMAGE, key),
              links: [
                {
                  label: t(
                    "portal.enterprise.setup.links.docker",
                    "Docker guide",
                  ),
                  href: DOC.docker,
                },
                {
                  label: t(
                    "portal.enterprise.setup.links.kubernetes",
                    "Kubernetes guide",
                  ),
                  href: DOC.kubernetes,
                },
              ],
            },
            signInStep,
            {
              id: "licence",
              title: t(
                "portal.enterprise.setup.licence.title",
                "Check your licence is active",
              ),
              body: t(
                "portal.enterprise.setup.licence.body",
                "Open http://your-server:8080/settings/adminPlan, where your Enterprise licence should show as active. Installed another way? Add the key under premium.key in settings.yml and restart.",
              ),
              links: [
                {
                  label: t(
                    "portal.enterprise.setup.links.licence",
                    "Licence activation",
                  ),
                  href: DOC.licence,
                },
              ],
            },
            peopleStep(
              t(
                "portal.enterprise.setup.people.bodySelfHosted",
                "Create accounts at /settings/people, or connect your identity provider so your team signs in with their work accounts. They use Stirling in the browser at your server's address, or in the desktop app pointed at it.",
              ),
            ),
          ]
        : [
            {
              id: "offlineLicence",
              title: t(
                "portal.enterprise.setup.offlineLicence.title",
                "Download your offline licence",
              ),
              body: t(
                "portal.enterprise.setup.offlineLicence.body",
                "An air-gapped server can't reach our licence service, so it checks this signed file instead. Keep it with the image you carry across.",
              ),
              links: [
                {
                  label: downloadingLicense
                    ? t(
                        "portal.enterprise.setup.links.downloading",
                        "Downloading...",
                      )
                    : t(
                        "portal.enterprise.setup.links.downloadLicence",
                        "Download licence file",
                      ),
                  onClick: onDownloadOfflineLicense,
                },
              ],
            },
            {
              id: "install",
              title: t(
                "portal.enterprise.setup.offlineInstall.title",
                "Bring Stirling across and start it",
              ),
              body: t(
                "portal.enterprise.setup.offlineInstall.body",
                "Pull the full image on a connected machine, carry it and the licence file across, then load and start it. The full image adds the fonts an offline server can't download.",
              ),
              code: [
                "# On a connected machine",
                `docker pull ${FULL_IMAGE}`,
                `docker save -o stirling-pdf.tar ${FULL_IMAGE}`,
                "",
                "# On the air-gapped server, with stirling-enterprise.lic in ./stirling/configs",
                "docker load -i stirling-pdf.tar",
                runCommand(FULL_IMAGE, "file:/configs/stirling-enterprise.lic"),
              ].join("\n"),
              links: [
                {
                  label: t(
                    "portal.enterprise.setup.links.docker",
                    "Docker guide",
                  ),
                  href: DOC.docker,
                },
                {
                  label: t(
                    "portal.enterprise.setup.links.ocr",
                    "OCR languages",
                  ),
                  href: DOC.ocr,
                },
              ],
            },
            {
              ...signInStep,
              body: t(
                "portal.enterprise.setup.signIn.bodyAirgap",
                "Open http://your-server:8080 and sign in with admin / stirling, choose a new password, then check /settings/adminPlan shows your licence as active.",
              ),
            },
            peopleStep(
              t(
                "portal.enterprise.setup.people.bodyAirgap",
                "Create accounts at /settings/people, or point Stirling at your internal identity provider so sign-in never leaves your network.",
              ),
            ),
          ];

  const isDone = (step: Step) => step.done || ticked.includes(step.id);
  const doneCount = steps.filter(isDone).length;

  return (
    <Card padding="loose" className="ent-setup">
      <DownloadEditorModal
        open={downloading}
        onClose={() => setDownloading(false)}
        // Their deployment is already chosen; only the apps that connect to it are on offer.
        desktopOnly
      />
      <div className="ent-setup__head">
        <div>
          <h2 className="ent__h2">
            {live
              ? t("portal.enterprise.setup.titleLive", "Go-live checklist")
              : t("portal.enterprise.setup.title", "Get set up")}
          </h2>
          <p className="ent__text">
            {live
              ? t(
                  "portal.enterprise.setup.subtitleLive",
                  "The steps to finish before you roll out to everyone.",
                )
              : t(
                  "portal.enterprise.setup.subtitle",
                  "Make the most of your trial by trying it the way you'll run it.",
                )}
          </p>
        </div>
        <span className="ent__chip">
          {t("portal.enterprise.setup.progress", "{{done}} of {{total}} done", {
            done: doneCount,
            total: steps.length,
          })}
        </span>
      </div>
      <ol className="ent-setup__steps">
        {steps.map((step, index) => {
          const done = isDone(step);
          return (
            <li
              key={step.id}
              className="ent-setup__step"
              data-done={done || undefined}
            >
              <button
                type="button"
                className="ent-setup__tick"
                aria-pressed={done}
                aria-label={t(
                  "portal.enterprise.setup.markDone",
                  "Mark “{{step}}” done",
                  {
                    step: step.title,
                  },
                )}
                // A step known from the account cannot be unticked by hand.
                disabled={step.done}
                onClick={() => setTicked(step.id, !done)}
              >
                {done ? <Icon name="check" size={14} /> : index + 1}
              </button>
              <div className="ent-setup__content">
                <h3 className="ent__h3">{step.title}</h3>
                <p className="ent__text">{step.body}</p>
                {step.code && <CodeBlock code={step.code} />}
                {step.links.length > 0 && (
                  <div className="ent-setup__links">
                    {step.links.map((link) => (
                      <StepAction key={link.label} link={link} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StepAction({ link }: { link: StepLink }): ReactNode {
  if (link.onClick) {
    return (
      <Button variant="secondary" size="sm" onClick={link.onClick}>
        {link.label}
      </Button>
    );
  }
  const external = link.href?.startsWith("http");
  return (
    <a
      className="ent-setup__link"
      href={link.href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {link.label}
      {external && <Icon name="external-link" size={13} />}
    </a>
  );
}

function CodeBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const copy = () => {
    void copyText(code).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      // The browser refused: select the command so the admin can copy it by hand.
      const range = document.createRange();
      if (codeRef.current) range.selectNodeContents(codeRef.current);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
  };
  return (
    <div className="ent-setup__code">
      <pre>
        <code ref={codeRef}>{code}</code>
      </pre>
      <Button variant="tertiary" size="sm" onClick={copy}>
        {copied
          ? t("portal.enterprise.setup.copied", "Copied")
          : t("portal.enterprise.setup.copy", "Copy")}
      </Button>
    </div>
  );
}

const TICKS_KEY = "stirling-enterprise-setup";

function readTicks(storageKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/** The steps the buyer ticked on this deal, kept in this browser. */
function useTicks(
  dealId: number | null | undefined,
): [string[], (id: string, on: boolean) => void] {
  const storageKey = `${TICKS_KEY}:${dealId ?? "none"}`;
  const [state, setState] = useState(() => ({
    key: storageKey,
    ticked: readTicks(storageKey),
  }));
  // Another deal's ticks are read afresh, never carried over and saved under its key.
  if (state.key !== storageKey) {
    setState({ key: storageKey, ticked: readTicks(storageKey) });
  }
  const setTicked = (id: string, on: boolean) => {
    setState((current) => {
      const next = on
        ? [...new Set([...current.ticked, id])]
        : current.ticked.filter((v) => v !== id);
      try {
        window.localStorage.setItem(current.key, JSON.stringify(next));
      } catch {
        // Storage unavailable: the ticks last for this visit only.
      }
      return { key: current.key, ticked: next };
    });
  };
  return [
    state.key === storageKey ? state.ticked : readTicks(storageKey),
    setTicked,
  ];
}
