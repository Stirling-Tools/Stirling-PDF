import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CodeBlock, Modal, SegmentedControl } from "@app/ui";
import { EDITOR_URL } from "@portal/auth/editorUrl";
import { markEditorInstalled } from "@portal/hooks/useEditorInstalled";
import { DOWNLOAD_URLS } from "@app/constants/downloads";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import DnsRounded from "@mui/icons-material/DnsRounded";
import LayersRounded from "@mui/icons-material/LayersRounded";
import TerminalRounded from "@mui/icons-material/TerminalRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import type { SvgIconComponent } from "@mui/icons-material";
import "@portal/components/DownloadEditorModal.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Install commands + guides (code isn't translated; only labels are)       */
/* ──────────────────────────────────────────────────────────────────────── */

const WINGET = "winget install StirlingTools.StirlingPDF";
const BREW = "brew install --cask stirling-pdf";
const dockerCmd = (tag: string) =>
  `docker run -d --name stirling-pdf -p 8080:8080 \\\n  -v ./stirling-data:/configs \\\n  stirlingtools/stirling-pdf:${tag}`;
const HELM = `helm repo add stirling-pdf https://stirling-tools.github.io/Stirling-PDF/
helm repo update
helm install stirling-pdf stirling-pdf/stirling-pdf-chart \\\n  --namespace stirling-pdf --create-namespace`;
const JAR_URL = "https://files.stirlingpdf.com/Stirling-PDF-with-login.jar";
const JAR =
  "java -Xmx2g -jar Stirling-PDF-with-login.jar\n# then open http://localhost:8080";

const GUIDES = {
  windows: "https://docs.stirlingpdf.com/Installation/Windows%20Installation/",
  mac: "https://docs.stirlingpdf.com/Installation/Mac%20Installation/",
  linux: DOWNLOAD_URLS.LINUX_DOCS,
  docker: "https://docs.stirlingpdf.com/Installation/Docker%20Install",
  kubernetes: "https://docs.stirlingpdf.com/Installation/Kubernetes",
  manual: DOWNLOAD_URLS.LINUX_DOCS,
} as const;

type OptionId = keyof typeof GUIDES;
type DockerVariant = "latest" | "latest-fat" | "latest-ultra-lite";

const DESKTOP: OptionId[] = ["windows", "mac", "linux"];
const SELF_HOSTED: OptionId[] = ["docker", "kubernetes", "manual"];

const ICONS: Record<OptionId, SvgIconComponent> = {
  windows: DownloadRounded,
  mac: DownloadRounded,
  linux: DownloadRounded,
  docker: DnsRounded,
  kubernetes: LayersRounded,
  manual: TerminalRounded,
};

interface Props {
  open: boolean;
  onClose: () => void;
}

function openUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Install-the-editor modal. Lists desktop + self-hosted options; each opens a
 * detail pane with a download button and/or copyable install command and a
 * guide link. A completing action — clicking a download button or pressing Done
 * — marks the getting-started "Download the editor" step complete (via
 * {@link markEditorInstalled}); nothing else is persisted.
 */
export function DownloadEditorModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [dockerVariant, setDockerVariant] = useState<DockerVariant>("latest");

  const close = () => {
    setSelected(null);
    onClose();
  };

  // A download or a Done press completes the "Download the editor" step.
  const download = (url: string) => {
    openUrl(url);
    markEditorInstalled();
  };
  const done = () => {
    markEditorInstalled();
    close();
  };

  const guideLink = (id: keyof typeof GUIDES) => (
    <button
      type="button"
      className="portal-install__guide"
      onClick={() => openUrl(GUIDES[id])}
    >
      {t("portal.home.download.guide", {
        name: t(`portal.home.download.${id}.title`),
      })}
      <OpenInNewRounded sx={{ fontSize: 15 }} />
    </button>
  );

  const note = (id: OptionId) => (
    <p className="portal-install__note">
      {t(`portal.home.download.${id}.note`)}
    </p>
  );

  function renderDetail(id: OptionId) {
    switch (id) {
      case "windows":
      case "mac": {
        const url =
          id === "windows" ? DOWNLOAD_URLS.WINDOWS : DOWNLOAD_URLS.MAC;
        return (
          <>
            <Button
              variant="primary"
              leftSection={<DownloadRounded sx={{ fontSize: 16 }} />}
              onClick={() => download(url)}
            >
              {t(`portal.home.download.${id}.downloadBtn`)}
            </Button>
            <p className="portal-install__eyebrow">
              {t(`portal.home.download.${id}.altLabel`)}
            </p>
            <CodeBlock code={id === "windows" ? WINGET : BREW} lang="bash" />
            {guideLink(id)}
          </>
        );
      }
      case "linux":
        return (
          <>
            {note("linux")}
            <Button
              variant="secondary"
              leftSection={<OpenInNewRounded sx={{ fontSize: 16 }} />}
              onClick={() => openUrl(GUIDES.linux)}
            >
              {t("portal.home.download.linux.guideBtn")}
            </Button>
          </>
        );
      case "docker":
        return (
          <>
            <SegmentedControl<DockerVariant>
              value={dockerVariant}
              onChange={setDockerVariant}
              options={[
                {
                  label: t("portal.home.download.docker.variantStandard"),
                  value: "latest",
                },
                {
                  label: t("portal.home.download.docker.variantFat"),
                  value: "latest-fat",
                },
                {
                  label: t("portal.home.download.docker.variantLite"),
                  value: "latest-ultra-lite",
                },
              ]}
            />
            <CodeBlock code={dockerCmd(dockerVariant)} lang="bash" />
            {note("docker")}
            {guideLink("docker")}
          </>
        );
      case "kubernetes":
        return (
          <>
            <CodeBlock code={HELM} lang="bash" />
            {note("kubernetes")}
            {guideLink("kubernetes")}
          </>
        );
      case "manual":
        return (
          <>
            <Button
              variant="primary"
              leftSection={<DownloadRounded sx={{ fontSize: 16 }} />}
              onClick={() => download(JAR_URL)}
            >
              {t("portal.home.download.manual.downloadBtn")}
            </Button>
            <p className="portal-install__eyebrow">
              {t("portal.home.download.manual.runLabel")}
            </p>
            <CodeBlock code={JAR} lang="bash" />
            {note("manual")}
            {guideLink("manual")}
          </>
        );
    }
  }

  const renderRow = (id: OptionId) => {
    const Icon = ICONS[id];
    return (
      <button
        key={id}
        type="button"
        className="portal-install__option"
        onClick={() => setSelected(id)}
      >
        <span className="portal-install__option-icon" aria-hidden>
          <Icon sx={{ fontSize: 20 }} />
        </span>
        <span className="portal-install__option-text">
          <strong>{t(`portal.home.download.${id}.title`)}</strong>
          <span>{t(`portal.home.download.${id}.tagline`)}</span>
        </span>
        <ChevronRightRounded
          className="portal-install__option-chevron"
          sx={{ fontSize: 20 }}
          aria-hidden
        />
      </button>
    );
  };

  const detail = selected !== null;

  return (
    <Modal
      open={open}
      onClose={close}
      width="md"
      title={
        detail
          ? t(`portal.home.download.${selected}.title`)
          : t("portal.home.download.title")
      }
      subtitle={
        detail
          ? t(`portal.home.download.${selected}.detailBody`)
          : t("portal.home.download.body")
      }
      footer={
        detail ? (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              {t("portal.home.download.back")}
            </Button>
            <Button variant="primary" onClick={done}>
              {t("portal.home.download.done")}
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            leftSection={<OpenInNewRounded sx={{ fontSize: 15 }} />}
            onClick={() => {
              window.location.href = EDITOR_URL;
            }}
          >
            {t("portal.home.download.openInBrowser")}
          </Button>
        )
      }
    >
      {detail ? (
        <div className="portal-install__detail">{renderDetail(selected)}</div>
      ) : (
        <div className="portal-install__list">
          <p className="portal-install__section">
            {t("portal.home.download.sectionDesktop")}
          </p>
          {DESKTOP.map(renderRow)}
          <p className="portal-install__section">
            {t("portal.home.download.sectionSelfHosted")}
          </p>
          {SELF_HOSTED.map(renderRow)}
        </div>
      )}
    </Modal>
  );
}
