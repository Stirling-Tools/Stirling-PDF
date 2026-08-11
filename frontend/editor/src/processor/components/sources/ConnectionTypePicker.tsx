import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  CONNECTION_CATEGORIES,
  searchConnectionTypes,
  type ConnectionCategory,
  type CreatableConnectionType,
} from "@processor/components/sources/connectionTypes";
import { BrandMark } from "@processor/components/BrandMarks";

/**
 * Choose what to connect to.
 *
 * A dropdown was right for three vendors and is wrong for thirty: you cannot scan it, and it hides
 * the answer to "do you support X?" behind a click. This is a searchable, categorised grid instead,
 * grouped by the job someone is trying to do - because a person who has never heard of ConsignO
 * still knows they want "signing".
 *
 * Search matches the vendor's own aliases and the job words too ("siem", "ocr", "notify"), because
 * people search for the problem as often as the product.
 */
interface ConnectionTypePickerProps {
  types: CreatableConnectionType[];
  onPick: (type: CreatableConnectionType) => void;
}

export function ConnectionTypePicker({
  types,
  onPick,
}: ConnectionTypePickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const matches = useMemo(
    () => searchConnectionTypes(types, query, (key) => t(key)),
    [types, query, t],
  );

  const grouped = useMemo(() => {
    const map = new Map<ConnectionCategory, CreatableConnectionType[]>();
    for (const type of matches) {
      const list = map.get(type.category) ?? [];
      list.push(type);
      map.set(type.category, list);
    }
    return map;
  }, [matches]);

  const searching = query.trim() !== "";
  // While searching, one flat relevance-ordered list reads better than seven tiny sections.
  const sections: ConnectionCategory[] = searching
    ? []
    : CONNECTION_CATEGORIES.filter((c) => (grouped.get(c)?.length ?? 0) > 0);

  return (
    <div className="processor-conn-picker">
      <div className="processor-conn-picker__search">
        <SearchRoundedIcon className="processor-conn-picker__search-icon" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("processor.connections.picker2.searchPlaceholder")}
          aria-label={t("processor.connections.picker2.searchPlaceholder")}
        />
      </div>

      {matches.length === 0 ? (
        <div className="processor-conn-picker__empty">
          <p className="processor-conn-picker__empty-title">
            {t("processor.connections.picker2.noResultsTitle", { query })}
          </p>
          <p className="processor-conn-picker__empty-body">
            {t("processor.connections.picker2.noResultsBody")}
          </p>
        </div>
      ) : searching ? (
        <Grid types={matches} onPick={onPick} />
      ) : (
        sections.map((category) => (
          <section key={category} className="processor-conn-picker__section">
            <h4 className="processor-conn-picker__section-title">
              {t(`processor.connections.categories.${category}.label`)}
            </h4>
            <p className="processor-conn-picker__section-desc">
              {t(`processor.connections.categories.${category}.description`)}
            </p>
            <Grid types={grouped.get(category) ?? []} onPick={onPick} />
          </section>
        ))
      )}
    </div>
  );
}

function Grid({
  types,
  onPick,
}: {
  types: CreatableConnectionType[];
  onPick: (type: CreatableConnectionType) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="processor-conn-picker__grid">
      {types.map((type) => {
        const label = t(type.labelKey);
        return (
          <button
            key={type.id}
            type="button"
            className={
              "processor-conn-picker__card" +
              (type.kind === "custom"
                ? " processor-conn-picker__card--advanced"
                : "")
            }
            onClick={() => onPick(type)}
          >
            {/* The vendor's real mark, full colour on the card surface. */}
            <span className="processor-conn-picker__mark" aria-hidden>
              <BrandMark id={type.id} size={20} />
            </span>
            <span className="processor-conn-picker__card-text">
              <span className="processor-conn-picker__card-name">{label}</span>
              <span className="processor-conn-picker__card-desc">
                {t(type.descriptionKey)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
