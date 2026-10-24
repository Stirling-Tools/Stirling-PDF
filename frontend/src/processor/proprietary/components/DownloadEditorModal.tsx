import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CodeBlock, Modal, SegmentedControl } from "@app/ui";
import { EDITOR_URL } from "@portal/auth/editorUrl";
import { markEditorInstalled } from "@portal/hooks/useEditorInstalled";
import { DOWNLOAD_URLS } from "@app/constants/downloads";
import {
  dockerRunCommand,
  HELM_INSTALL_COMMAND,
  JAR_RUN_COMMAND,
  SELF_HOST_GUIDES,
  SERVER_JAR_URL,
  type DockerImageTag,
} from "@app/constants/selfHosting";
import { Icon, type IconName } from "@app/ui/Icon";
import "@portal/components/DownloadEditorModal.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Install commands + guides (code isn't translated; only labels are)       */
/* ──────────────────────────────────────────────────────────────────────── */

const WINGET = "winget install StirlingTools.StirlingPDF";
const BREW = "brew install --cask stirling-pdf";
const GUIDES = {
  windows: "https://docs.stirlingpdf.com/Installation/Windows%20Installation/",
  mac: "https://docs.stirlingpdf.com/Installation/Mac%20Installation/",
  linux: DOWNLOAD_URLS.LINUX_DOCS,
  ...SELF_HOST_GUIDES,
} as const;

type OptionId = keyof typeof GUIDES;
type DockerVariant = DockerImageTag;

const DESKTOP: OptionId[] = ["windows", "mac", "linux"];
const SELF_HOSTED: OptionId[] = ["docker", "kubernetes", "manual"];

const ICONS: Record<OptionId, IconName> = {
  windows: "download",
  mac: "download",
  linux: "download",
  docker: "server",
  kubernetes: "network",
  manual: "terminal",
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
      <Icon name="external-link" size={15} />
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
              leftSection={<Icon name="download" size={16} />}
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
            <Button
              variant="primary"
              leftSection={<Icon name="download" size={16} />}
              onClick={() => download(DOWNLOAD_URLS.LINUX_DEB)}
            >
              {t("portal.home.download.linux.downloadDeb")}
            </Button>
            <div className="portal-install__row">
              <Button
                variant="secondary"
                leftSection={<Icon name="download" size={16} />}
                onClick={() => download(DOWNLOAD_URLS.LINUX_RPM)}
              >
                {t("portal.home.download.linux.downloadRpm")}
              </Button>
              <Button
                variant="secondary"
                leftSection={<Icon name="download" size={16} />}
                onClick={() => download(DOWNLOAD_URLS.LINUX_APPIMAGE)}
              >
                {t("portal.home.download.linux.downloadAppImage")}
              </Button>
            </div>
            {note("linux")}
            {guideLink("linux")}
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
            <CodeBlock code={dockerRunCommand(dockerVariant)} lang="bash" />
            {note("docker")}
            {guideLink("docker")}
          </>
        );
      case "kubernetes":
        return (
          <>
            <CodeBlock code={HELM_INSTALL_COMMAND} lang="bash" />
            {note("kubernetes")}
            {guideLink("kubernetes")}
          </>
        );
      case "manual":
        return (
          <>
            <Button
              variant="primary"
              leftSection={<Icon name="download" size={16} />}
              onClick={() => download(SERVER_JAR_URL)}
            >
              {t("portal.home.download.manual.downloadBtn")}
            </Button>
            <p className="portal-install__eyebrow">
              {t("portal.home.download.manual.runLabel")}
            </p>
            <CodeBlock code={JAR_RUN_COMMAND} lang="bash" />
            {note("manual")}
            {guideLink("manual")}
          </>
        );
    }
  }

  const renderRow = (id: OptionId) => {
    return (
      <button
        key={id}
        type="button"
        className="portal-install__option"
        onClick={() => setSelected(id)}
      >
        <span className="portal-install__option-icon" aria-hidden>
          <Icon name={ICONS[id]} size={20} />
        </span>
        <span className="portal-install__option-text">
          <strong>{t(`portal.home.download.${id}.title`)}</strong>
          <span>{t(`portal.home.download.${id}.tagline`)}</span>
        </span>
        <Icon
          name="chevron-right"
          size={20}
          className="portal-install__option-chevron"
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
            leftSection={<Icon name="external-link" size={15} />}
            onClick={() => {
              window.open(EDITOR_URL, "_blank", "noopener,noreferrer");
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
