import { useTranslation } from "react-i18next";
import { Button, Card, type CardProps } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";
import "@portal/components/PopularUseCases.css";

type Accent = NonNullable<CardProps["accent"]>;

interface UseCase {
  /** Stable key into the useCases.items.* translation table. */
  key: string;
  accent: Accent;
}

const ACCENT_COLOR: Partial<Record<Accent, string>> = {
  default: "var(--color-blue)",
  premium: "var(--color-purple)",
  success: "var(--color-green)",
  warning: "var(--color-amber)",
  danger: "var(--color-red)",
};

/**
 * Curated landing-page use cases — a teaser, not the full catalogue. The
 * exhaustive per-vertical endpoint list lives on the Documents view; here we
 * surface the four cross-cutting pipelines people reach for first. The display
 * copy (eyebrow, title, blurb, cta) is keyed into useCases.items.<key>.
 */
const USE_CASES: UseCase[] = [
  { key: "autoRouting", accent: "default" },
  { key: "piiRedaction", accent: "danger" },
  { key: "trainingData", accent: "premium" },
  { key: "authenticity", accent: "success" },
];

export function PopularUseCases() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  return (
    <section
      className="portal-usecases"
      aria-label={t("portal.useCases.title")}
    >
      <header className="portal-usecases__head">
        <h2 className="portal-usecases__title">{t("portal.useCases.title")}</h2>
        <Button
          variant="quiet"
          type="button"
          className="portal-usecases__viewall"
          onClick={() => setActiveView("pipelines")}
        >
          {t("portal.useCases.viewAll")} <span aria-hidden>→</span>
        </Button>
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
              {t(`portal.useCases.items.${uc.key}.eyebrow`)}
            </span>
            <h3 className="portal-usecases__card-title">
              {t(`portal.useCases.items.${uc.key}.title`)}
            </h3>
            <p className="portal-usecases__blurb">
              {t(`portal.useCases.items.${uc.key}.blurb`)}
            </p>
            <Button
              variant="quiet"
              type="button"
              className="portal-usecases__cta"
              style={{ color: ACCENT_COLOR[uc.accent] }}
              onClick={() => setActiveView("pipelines")}
            >
              {t(`portal.useCases.items.${uc.key}.cta`)}{" "}
              <span aria-hidden>→</span>
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
