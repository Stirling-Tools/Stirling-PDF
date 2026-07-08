import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";
import {
  DownloadIcon,
  UsersIcon,
  EditorIcon,
  SearchIcon,
  SourcesIcon,
  PoliciesIcon,
  SparklesIcon,
  ComponentsIcon,
  DocumentsIcon,
  SettingsIcon,
} from "@portal/components/icons";
import "@portal/components/WelcomeBanner.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Editor-card visual                                                       */
/*                                                                           */
/*  A decorative mock of the deployed PDF Editor reviewing a security        */
/*  report. Purely presentational — hidden from assistive tech.              */
/* ──────────────────────────────────────────────────────────────────────── */

const RAIL_ICONS = [
  SearchIcon,
  SourcesIcon,
  PoliciesIcon,
  EditorIcon,
  ComponentsIcon,
  SparklesIcon,
  DocumentsIcon,
  SettingsIcon,
] as const;

function EditorRail() {
  return (
    <div className="portal-welcome__rail" aria-hidden>
      {RAIL_ICONS.map((Icon, i) => (
        <span key={i} className="portal-welcome__rail-icon">
          <Icon size={13} />
        </span>
      ))}
    </div>
  );
}

function WelcomeEditorCard() {
  return (
    <div className="portal-welcome__editor" aria-hidden>
      <div className="portal-welcome__editor-bar">
        <div className="portal-welcome__editor-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="portal-welcome__editor-file">
          <EditorIcon size={12} />
          <span className="portal-welcome__editor-name">
            Vulnerability Assessment Report CVE-2026-1847.pdf
          </span>
          <span className="portal-welcome__editor-sep">·</span>
          <span className="portal-welcome__editor-pages">18 pages</span>
        </div>
        <span className="portal-welcome__editor-page">1 / 18</span>
      </div>

      <div className="portal-welcome__editor-body">
        <EditorRail />
        <div className="portal-welcome__doc">
          <div className="portal-welcome__doc-eyebrow">
            <span>SECURITY ASSESSMENT</span>
            <span className="portal-welcome__doc-critical">CRITICAL</span>
          </div>
          <div className="portal-welcome__doc-title">
            Vulnerability Assessment Report CVE-2026-1847
          </div>
          <div className="portal-welcome__doc-divider" />
          <div className="portal-welcome__doc-meta">
            <span>
              <span className="portal-welcome__doc-meta-key">
                Assessment Date:{" "}
              </span>
              February 2026
            </span>
            <span>
              <span className="portal-welcome__doc-meta-key">
                Classification:{" "}
              </span>
              FOUO
            </span>
          </div>
          <div className="portal-welcome__doc-heading">EXECUTIVE SUMMARY</div>
          <p className="portal-welcome__doc-body">
            This assessment identifies critical vulnerabilities in the target
            environment and provides actionable remediation guidance prioritized
            by risk severity.
          </p>
          <div className="portal-welcome__doc-heading">KEY FINDINGS</div>
          <div className="portal-welcome__doc-finding portal-welcome__doc-finding--critical">
            <span className="portal-welcome__doc-dot" />3 Critical
            vulnerabilities identified
          </div>
          <div className="portal-welcome__doc-finding portal-welcome__doc-finding--high">
            <span className="portal-welcome__doc-dot" />7 High-severity issues
            requiring attention
          </div>
        </div>
        <EditorRail />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Welcome banner (free-tier hero)                                          */
/* ──────────────────────────────────────────────────────────────────────── */

interface WelcomeBannerProps {
  /**
   * Rendered as an attached footer strip inside the banner card (e.g. the
   * "Finish setting up" checklist). Kept as a slot so the hero stays a pure
   * presentational shell.
   */
  footer?: ReactNode;
}

export function WelcomeBanner({ footer }: WelcomeBannerProps) {
  const { t } = useTranslation();
  const { setActiveView } = useView();

  return (
    <section
      className="portal-welcome"
      aria-label={t("portal.welcome.ariaLabel")}
    >
      <div className="portal-welcome__body">
        <div className="portal-welcome__canvas" aria-hidden>
          <div className="portal-welcome__blob portal-welcome__blob--1" />
          <div className="portal-welcome__blob portal-welcome__blob--2" />
          <div className="portal-welcome__blob portal-welcome__blob--3" />
        </div>

        <div className="portal-welcome__text">
          <span className="portal-welcome__badge">
            {t("portal.welcome.badge")}
          </span>
          <h1 className="portal-welcome__title">
            {t("portal.welcome.title")}{" "}
            <span className="portal-welcome__title-accent">
              {t("portal.welcome.titleAccent")}
            </span>
          </h1>
          <p className="portal-welcome__sub">{t("portal.welcome.subtitle")}</p>
          <div className="portal-welcome__cta">
            <Button
              variant="primary"
              leftSection={<DownloadIcon size={15} />}
              onClick={() => setActiveView("editor")}
            >
              {t("portal.welcome.installEditor")}
            </Button>
            <Button
              variant="secondary"
              leftSection={<UsersIcon size={15} />}
              onClick={() => setActiveView("users")}
            >
              {t("portal.welcome.inviteTeammates")}
            </Button>
          </div>
          <p className="portal-welcome__perks">{t("portal.welcome.perks")}</p>
        </div>

        <div className="portal-welcome__visual">
          <WelcomeEditorCard />
        </div>
      </div>

      {footer && <div className="portal-welcome__footer">{footer}</div>}
    </section>
  );
}
