import { Button } from "@shared/components";
import { useTranslation } from "react-i18next";
import { type Source, SOURCE_TYPE_META } from "@portal/api/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";
import "@portal/views/Sources.css";
import CloseIcon from "@mui/icons-material/Close";

interface SourceDetailCardProps {
  source: Source;
  onClose: () => void;
}

/** Expanded type-specific detail for the selected table row. */
export function SourceDetailCard({ source, onClose }: SourceDetailCardProps) {
  const { t } = useTranslation();
  const meta = SOURCE_TYPE_META[source.type];
  return (
    <section className="portal-sources__expanded">
      <header className="portal-sources__expanded-head">
        <span
          className={`portal-sources__type-dot portal-sources__type-dot--${meta.tone}`}
          aria-hidden
        >
          {meta.icon}
        </span>
        <div>
          <h2 className="portal-sources__expanded-title">{source.name}</h2>
          <span className="portal-sources__expanded-sub">
            {t("sources.detail.ownedBy", {
              type: meta.label,
              owner: source.owner,
            })}
          </span>
        </div>
        <Button
          variant="ghost"
          className="portal-sources__expanded-close"
          onClick={onClose}
          aria-label={t("sources.detail.closeAriaLabel")}
          leftSection={<CloseIcon />}
        ></Button>
      </header>
      <SourceDetailPanel source={source} />
    </section>
  );
}
