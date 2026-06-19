import { type Source, SOURCE_TYPE_META } from "@portal/api/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";
import "@portal/views/Sources.css";

interface SourceDetailCardProps {
  source: Source;
  onClose: () => void;
}

/** Expanded type-specific detail for the selected table row. */
export function SourceDetailCard({ source, onClose }: SourceDetailCardProps) {
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
            {meta.label} · owned by {source.owner}
          </span>
        </div>
        <button
          type="button"
          className="portal-sources__expanded-close"
          onClick={onClose}
          aria-label="Close detail"
        >
          ×
        </button>
      </header>
      <SourceDetailPanel source={source} />
    </section>
  );
}
