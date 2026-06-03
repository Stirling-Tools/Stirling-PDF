import { Card, type CardProps } from "@shared/components";
import { useView } from "@portal/contexts/ViewContext";
import "@portal/components/PopularUseCases.css";

type Accent = NonNullable<CardProps["accent"]>;

interface UseCase {
  eyebrow: string;
  title: string;
  blurb: string;
  cta: string;
  accent: Accent;
}

const ACCENT_COLOR: Record<Accent, string> = {
  blue: "var(--color-blue)",
  purple: "var(--color-purple)",
  green: "var(--color-green)",
  amber: "var(--color-amber)",
  red: "var(--color-red)",
};

/**
 * Curated landing-page use cases — a teaser, not the full catalogue. The
 * exhaustive per-vertical endpoint list lives on the Documents view; here we
 * surface the four cross-cutting pipelines people reach for first. Copy mirrors
 * the prototype's "Popular use cases" block.
 */
const USE_CASES: UseCase[] = [
  {
    eyebrow: "AUTO-ROUTING",
    title: "Auto-classify and route incoming documents",
    blurb:
      "One classifier reads what arrived — KYC form, invoice, contract, COI — and routes to the right downstream pipeline. No manual triage, no docs in the wrong workflow.",
    cta: "Build a classifier pipeline",
    accent: "blue",
  },
  {
    eyebrow: "PII REDACTION",
    title: "Redact PII before it leaves your stack",
    blurb:
      "Strip sensitive fields before storage, indexing, or LLM processing. Schema-aware, per-field audit, BYOK or HYOK keys. Compliance at the document boundary, not per pipeline.",
    cta: "See redaction pipelines",
    accent: "red",
  },
  {
    eyebrow: "TRAINING DATA",
    title: "Turn PDFs into training data",
    blurb:
      "Batch-import an archive, redact PII, classify, chunk, and emit ready-to-load JSON for fine-tuning, eval sets, or RAG. Self-completing and replayable.",
    cta: "Build a training-data pipeline",
    accent: "purple",
  },
  {
    eyebrow: "AUTHENTICITY",
    title: "Verify signatures and detect tampering",
    blurb:
      "Cryptographic checks at the document boundary — signature validation, tamper detection, signing flows for outbound documents. Trust decisions in the pipeline, not your app code.",
    cta: "Try authenticity check",
    accent: "green",
  },
];

export function PopularUseCases() {
  const { setActiveView } = useView();
  return (
    <section className="portal-usecases" aria-label="Popular use cases">
      <header className="portal-usecases__head">
        <h2 className="portal-usecases__title">Popular use cases</h2>
        <button
          type="button"
          className="portal-usecases__viewall"
          onClick={() => setActiveView("pipelines")}
        >
          View all pipelines <span aria-hidden>→</span>
        </button>
      </header>
      <div className="portal-usecases__grid">
        {USE_CASES.map((uc) => (
          <Card
            key={uc.eyebrow}
            accent={uc.accent}
            padding="loose"
            className="portal-usecases__card"
          >
            <span
              className="portal-usecases__eyebrow"
              style={{ color: ACCENT_COLOR[uc.accent] }}
            >
              {uc.eyebrow}
            </span>
            <h3 className="portal-usecases__card-title">{uc.title}</h3>
            <p className="portal-usecases__blurb">{uc.blurb}</p>
            <button
              type="button"
              className="portal-usecases__cta"
              style={{ color: ACCENT_COLOR[uc.accent] }}
              onClick={() => setActiveView("pipelines")}
            >
              {uc.cta} <span aria-hidden>→</span>
            </button>
          </Card>
        ))}
      </div>
    </section>
  );
}
