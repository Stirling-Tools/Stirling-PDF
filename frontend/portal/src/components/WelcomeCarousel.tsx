import { useEffect, useState, type ReactNode } from "react";
import { Button, StatusBadge } from "@shared/components";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import "@portal/components/WelcomeCarousel.css";

type SlideAction =
  | { label: string; target: ViewId }
  | { label: string; action: "try-op" };

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  sub: string;
  durationMs: number;
  primary: SlideAction;
  secondary: SlideAction;
  ornament: ReactNode;
}

function EditorOrnament() {
  return (
    <div className="portal-carousel__doc">
      <StatusBadge tone="danger" size="sm" pulse>
        Critical
      </StatusBadge>
      <div className="portal-carousel__doc-title">
        Vulnerability Assessment Report
      </div>
      <div className="portal-carousel__doc-sub">CVE-2026-1847 · 12 pages</div>
      <div className="portal-carousel__doc-meta">
        <span>signed</span>
        <span>·</span>
        <span>OCR-clean</span>
        <span>·</span>
        <span>schema match 0.97</span>
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
    eyebrow: "PDF Editor",
    title: "The #1 PDF Editor on GitHub",
    sub: "Annotate, sign, redact, and review locally or in the cloud. Brought to the platform as the credibility anchor of the Stirling control plane.",
    durationMs: 12000,
    primary: { label: "Install PDF Editor", target: "editor" },
    secondary: { label: "Connect an instance", target: "editor" },
    ornament: <EditorOrnament />,
  },
  {
    id: "platform",
    eyebrow: "Platform",
    title: "PDF Infrastructure for Developers",
    sub: "Ingest from agents, APIs and connectors. Run composable pipelines with evals and golden sets. Land in a vault with zero-standing-access controls.",
    durationMs: 8000,
    primary: { label: "Try a PDF operation", action: "try-op" },
    secondary: { label: "Get an API key", target: "infrastructure" },
    ornament: <PlatformOrnament />,
  },
  {
    id: "agents",
    eyebrow: "AI Agents",
    title: "PDF Processor for AI Agents",
    sub: "Wire your agent via MCP, REST or tool definitions. Deterministic operations and guardrails — test with scenarios and evals before you ship.",
    durationMs: 8000,
    primary: { label: "Try PDF Processor", target: "sources" },
    secondary: { label: "View MCP docs", target: "docs" },
    ornament: <AgentOrnament />,
  },
];

interface WelcomeCarouselProps {
  /** Called when a slide CTA wants to invoke the single-op runner. */
  onTryOp: () => void;
}

export function WelcomeCarousel({ onTryOp }: WelcomeCarouselProps) {
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
      onBlur={() => setPaused(false)}
      aria-label="Stirling product highlights"
      aria-roledescription="carousel"
    >
      <div className="portal-carousel__inner" key={slide.id}>
        <div className="portal-carousel__text">
          <div className="portal-carousel__eyebrow">{slide.eyebrow}</div>
          <h1 className="portal-carousel__title">{slide.title}</h1>
          <p className="portal-carousel__sub">{slide.sub}</p>
          <div className="portal-carousel__cta">
            <Button
              variant="gradient"
              onClick={() => runAction(slide.primary)}
              trailingIcon={<span aria-hidden>→</span>}
            >
              {slide.primary.label}
            </Button>
            <Button
              variant="outline"
              onClick={() => runAction(slide.secondary)}
            >
              {slide.secondary.label}
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
        aria-label="Carousel pagination"
      >
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={i === index ? "true" : undefined}
            aria-label={`Slide ${i + 1}: ${s.title}`}
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
