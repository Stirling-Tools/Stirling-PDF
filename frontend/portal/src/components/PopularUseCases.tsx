import { useTranslation } from "react-i18next";
import { Card, type CardProps } from "@shared/components";
import { useView } from "@portal/contexts/ViewContext";
import "@portal/components/PopularUseCases.css";

type Accent = NonNullable<CardProps["accent"]>;

interface UseCase {
  /** Stable key into the useCases.items.* translation table. */
  key: string;
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
 * surface the four cross-cutting pipelines people reach for first. The display
 * copy (eyebrow, title, blurb, cta) is keyed into useCases.items.<key>.
 */
const USE_CASES: UseCase[] = [
  { key: "autoRouting", accent: "blue" },
  { key: "piiRedaction", accent: "red" },
  { key: "trainingData", accent: "purple" },
  { key: "authenticity", accent: "green" },
];

export function PopularUseCases() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  return (
    <section className="portal-usecases" aria-label={t("useCases.title")}>
      <header className="portal-usecases__head">
        <h2 className="portal-usecases__title">{t("useCases.title")}</h2>
        <button
          type="button"
          className="portal-usecases__viewall"
          onClick={() => setActiveView("pipelines")}
        >
          {t("useCases.viewAll")} <span aria-hidden>→</span>
        </button>
      </header>
      <div className="portal-usecases__grid">
        {USE_CASES.map((uc) => (
          <Card
            key={uc.key}
            accent={uc.accent}
            padding="loose"
            className="portal-usecases__card"
          >
            <span
              className="portal-usecases__eyebrow"
              style={{ color: ACCENT_COLOR[uc.accent] }}
            >
              {t(`useCases.items.${uc.key}.eyebrow`)}
            </span>
            <h3 className="portal-usecases__card-title">
              {t(`useCases.items.${uc.key}.title`)}
            </h3>
            <p className="portal-usecases__blurb">
              {t(`useCases.items.${uc.key}.blurb`)}
            </p>
            <button
              type="button"
              className="portal-usecases__cta"
              style={{ color: ACCENT_COLOR[uc.accent] }}
              onClick={() => setActiveView("pipelines")}
            >
              {t(`useCases.items.${uc.key}.cta`)} <span aria-hidden>→</span>
            </button>
          </Card>
        ))}
      </div>
    </section>
  );
}
