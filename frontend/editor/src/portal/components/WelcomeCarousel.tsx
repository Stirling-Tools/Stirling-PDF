import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, StatusBadge } from "@shared/components";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import "@portal/components/WelcomeCarousel.css";

type SlideAction =
  | { labelKey: string; target: ViewId }
  | { labelKey: string; action: "try-op" };

interface Slide {
  id: string;
  durationMs: number;
  primary: SlideAction;
  secondary: SlideAction;
  ornament: ReactNode;
}

function EditorOrnament() {
  const { t } = useTranslation();
  return (
    <div className="portal-carousel__doc">
      <StatusBadge tone="danger" size="sm" pulse>
        {t("welcome.ornament.editor.critical")}
      </StatusBadge>
      <div className="portal-carousel__doc-title">
        Vulnerability Assessment Report
      </div>
      <div className="portal-carousel__doc-sub">CVE-2026-1847 · 12 pages</div>
      <div className="portal-carousel__doc-meta">
        <span>{t("welcome.ornament.editor.signed")}</span>
        <span>·</span>
        <span>{t("welcome.ornament.editor.ocrClean")}</span>
        <span>·</span>
        <span>{t("welcome.ornament.editor.schemaMatch")}</span>
      </div>
    </div>
  );
}

function PlatformOrnament() {
  return (
    <pre className="portal-carousel__code">
      <span className="portal-carousel__code-method">POST</span>{" "}
      <span className="portal-carousel__code-path">/v1/secure</span>
      {"\n"}
      <span className="portal-carousel__code-key">Authorization</span>:{" "}
      <span className="portal-carousel__code-string">Bearer sk_live_a3f8…</span>
      {"\n"}
      <span className="portal-carousel__code-key">file</span>:{" "}
      <span className="portal-carousel__code-string">
        federal_CUI_contract.pdf
      </span>
      {"\n"}
      <span className="portal-carousel__code-key">pipeline</span>:{" "}
      <span className="portal-carousel__code-string">cui-redact-v2</span>
    </pre>
  );
}

function AgentOrnament() {
  return (
    <div className="portal-carousel__eval">
      <div className="portal-carousel__eval-head">
        <span className="portal-carousel__eval-title">KYC Processor</span>
        <span className="portal-carousel__eval-score">94%</span>
      </div>
      <div className="portal-carousel__eval-sub">
        Eval pass rate · 28 test cases
      </div>
      <div className="portal-carousel__eval-bar">
        <div
          className="portal-carousel__eval-fill"
          style={{ width: "94%" }}
          aria-hidden
        />
      </div>
      <div className="portal-carousel__eval-meta">
        <span>26 passed</span>
        <span>2 review</span>
        <span>MCP · Claude</span>
      </div>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    id: "editor",
    durationMs: 12000,
    primary: { labelKey: "welcome.slides.editor.primary", target: "editor" },
    secondary: {
      labelKey: "welcome.slides.editor.secondary",
      target: "editor",
    },
    ornament: <EditorOrnament />,
  },
  {
    id: "platform",
    durationMs: 8000,
    primary: { labelKey: "welcome.slides.platform.primary", action: "try-op" },
    secondary: {
      labelKey: "welcome.slides.platform.secondary",
      target: "infrastructure",
    },
    ornament: <PlatformOrnament />,
  },
  {
    id: "agents",
    durationMs: 8000,
    primary: { labelKey: "welcome.slides.agents.primary", target: "sources" },
    secondary: { labelKey: "welcome.slides.agents.secondary", target: "docs" },
    ornament: <AgentOrnament />,
  },
];

interface WelcomeCarouselProps {
  /** Called when a slide CTA wants to invoke the single-op runner. */
  onTryOp: () => void;
}

export function WelcomeCarousel({ onTryOp }: WelcomeCarouselProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { setActiveView } = useView();

  function runAction(act: SlideAction) {
    if ("action" in act && act.action === "try-op") {
      onTryOp();
    } else if ("target" in act) {
      setActiveView(act.target);
    }
  }

  useEffect(() => {
    if (paused) return;
    const duration = SLIDES[index].durationMs;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, duration);
    return () => window.clearTimeout(t);
  }, [index, paused]);

  const slide = SLIDES[index];

  return (
    <section
      className="portal-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        // onBlur bubbles from children; only unpause when focus actually
        // leaves the carousel, not when tabbing between the dot buttons.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      aria-label={t("welcome.ariaLabel")}
      aria-roledescription="carousel"
    >
      <div className="portal-carousel__inner" key={slide.id}>
        <div className="portal-carousel__text">
          <div className="portal-carousel__eyebrow">
            {t(`welcome.slides.${slide.id}.eyebrow`)}
          </div>
          <h1 className="portal-carousel__title">
            {t(`welcome.slides.${slide.id}.title`)}
          </h1>
          <p className="portal-carousel__sub">
            {t(`welcome.slides.${slide.id}.sub`)}
          </p>
          <div className="portal-carousel__cta">
            <Button
              variant="gradient"
              onClick={() => runAction(slide.primary)}
              trailingIcon={<span aria-hidden>→</span>}
            >
              {t(slide.primary.labelKey)}
            </Button>
            <Button
              variant="outline"
              onClick={() => runAction(slide.secondary)}
            >
              {t(slide.secondary.labelKey)}
            </Button>
          </div>
        </div>
        <div className="portal-carousel__ornament">{slide.ornament}</div>
      </div>

      <div className="portal-carousel__decor" aria-hidden>
        <div className="portal-carousel__blob portal-carousel__blob--1" />
        <div className="portal-carousel__blob portal-carousel__blob--2" />
      </div>

      <div
        className="portal-carousel__dots"
        role="group"
        aria-label={t("welcome.pagination")}
      >
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={i === index ? "true" : undefined}
            aria-label={t("welcome.slideLabel", {
              number: i + 1,
              title: t(`welcome.slides.${s.id}.title`),
            })}
            className={
              "portal-carousel__dot" + (i === index ? " is-active" : "")
            }
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  );
}
