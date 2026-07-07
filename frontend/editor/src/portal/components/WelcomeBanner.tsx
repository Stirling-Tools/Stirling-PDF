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
    <div className="portal-hero__rail" aria-hidden>
      {RAIL_ICONS.map((Icon, i) => (
        <span key={i} className="portal-hero__rail-icon">
          <Icon size={13} />
        </span>
      ))}
    </div>
  );
}

function WelcomeEditorCard() {
  return (
    <div className="portal-hero__editor" aria-hidden>
      <div className="portal-hero__editor-bar">
        <div className="portal-hero__editor-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="portal-hero__editor-file">
          <EditorIcon size={12} />
          <span className="portal-hero__editor-name">
            Vulnerability Assessment Report CVE-2026-1847.pdf
          </span>
          <span className="portal-hero__editor-sep">·</span>
          <span className="portal-hero__editor-pages">18 pages</span>
        </div>
        <span className="portal-hero__editor-page">1 / 18</span>
      </div>

      <div className="portal-hero__editor-body">
        <EditorRail />
        <div className="portal-hero__doc">
          <div className="portal-hero__doc-eyebrow">
            <span>SECURITY ASSESSMENT</span>
            <span className="portal-hero__doc-critical">CRITICAL</span>
          </div>
          <div className="portal-hero__doc-title">
            Vulnerability Assessment Report CVE-2026-1847
          </div>
          <div className="portal-hero__doc-divider" />
          <div className="portal-hero__doc-meta">
            <span>
              <span className="portal-hero__doc-meta-key">
                Assessment Date:{" "}
              </span>
              February 2026
            </span>
            <span>
              <span className="portal-hero__doc-meta-key">
                Classification:{" "}
              </span>
              FOUO
            </span>
          </div>
          <div className="portal-hero__doc-heading">EXECUTIVE SUMMARY</div>
          <p className="portal-hero__doc-body">
            This assessment identifies critical vulnerabilities in the target
            environment and provides actionable remediation guidance prioritized
            by risk severity.
          </p>
          <div className="portal-hero__doc-heading">KEY FINDINGS</div>
          <div className="portal-hero__doc-finding portal-hero__doc-finding--critical">
            <span className="portal-hero__doc-dot" />3 Critical vulnerabilities
            identified
          </div>
          <div className="portal-hero__doc-finding portal-hero__doc-finding--high">
            <span className="portal-hero__doc-dot" />7 High-severity issues
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
    <section className="portal-hero" aria-label={t("portal.welcome.ariaLabel")}>
      <div className="portal-hero__body">
        <div className="portal-hero__canvas" aria-hidden>
          <div className="portal-hero__blob portal-hero__blob--1" />
          <div className="portal-hero__blob portal-hero__blob--2" />
          <div className="portal-hero__blob portal-hero__blob--3" />
        </div>

        <div className="portal-hero__text">
          <span className="portal-hero__badge">
            {t("portal.welcome.badge")}
          </span>
          <h1 className="portal-hero__title">
            {t("portal.welcome.title")}{" "}
            <span className="portal-hero__title-accent">
              {t("portal.welcome.titleAccent")}
            </span>
          </h1>
          <p className="portal-hero__sub">{t("portal.welcome.subtitle")}</p>
          <div className="portal-hero__cta">
            <Button
              variant="gradient"
              leadingIcon={<DownloadIcon size={15} />}
              onClick={() => setActiveView("editor")}
            >
              {t("portal.welcome.installEditor")}
            </Button>
            <Button
              variant="outline"
              leadingIcon={<UsersIcon size={15} />}
              onClick={() => setActiveView("users")}
            >
              {t("portal.welcome.inviteTeammates")}
            </Button>
          </div>
          <p className="portal-hero__perks">{t("portal.welcome.perks")}</p>
        </div>

        <div className="portal-hero__visual">
          <WelcomeEditorCard />
        </div>
      </div>

      {footer && <div className="portal-hero__footer">{footer}</div>}
    </section>
  );
}
