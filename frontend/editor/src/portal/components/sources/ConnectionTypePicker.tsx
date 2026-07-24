import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  CONNECTION_CATEGORIES,
  searchConnectionTypes,
  type ConnectionCategory,
  type CreatableConnectionType,
} from "@portal/components/sources/connectionTypes";
import { operationsForConnectionType } from "@portal/components/policies/stepOperations";
import { BrandMark } from "@portal/components/BrandMarks";

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
    <div className="portal-conn-picker">
      <div className="portal-conn-picker__search">
        <SearchRoundedIcon className="portal-conn-picker__search-icon" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("portal.connections.picker2.searchPlaceholder")}
          aria-label={t("portal.connections.picker2.searchPlaceholder")}
        />
      </div>

      {matches.length === 0 ? (
        <div className="portal-conn-picker__empty">
          <p className="portal-conn-picker__empty-title">
            {t("portal.connections.picker2.noResultsTitle", { query })}
          </p>
          <p className="portal-conn-picker__empty-body">
            {t("portal.connections.picker2.noResultsBody")}
          </p>
        </div>
      ) : searching ? (
        <Grid types={matches} onPick={onPick} />
      ) : (
        sections.map((category) => (
          <section key={category} className="portal-conn-picker__section">
            <h4 className="portal-conn-picker__section-title">
              {t(`portal.connections.categories.${category}.label`)}
            </h4>
            <p className="portal-conn-picker__section-desc">
              {t(`portal.connections.categories.${category}.description`)}
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
  return (
    <div className="portal-conn-picker__grid">
      {types.map((type) => (
        <TypeCard key={type.id} type={type} onPick={onPick} />
      ))}
    </div>
  );
}

/**
 * One vendor card. Its (i) expands the tasks the integration unlocks, inline below the card -
 * the picker scrolls, so a floating popover would be clipped at its edges. No (i) for entries
 * that add no policy steps (a bucket, a label store).
 */
function TypeCard({
  type,
  onPick,
}: {
  type: CreatableConnectionType;
  onPick: (type: CreatableConnectionType) => void;
}) {
  const { t } = useTranslation();
  const [showTasks, setShowTasks] = useState(false);
  const tasks = operationsForConnectionType(type.id);
  const label = t(type.labelKey);

  return (
    <div className="portal-conn-picker__card-wrap">
      <button
        type="button"
        className={
          "portal-conn-picker__card" +
          (type.kind === "custom"
            ? " portal-conn-picker__card--advanced"
            : "") +
          (tasks.length > 0 ? " portal-conn-picker__card--has-tasks" : "")
        }
        onClick={() => onPick(type)}
      >
        {/* The vendor's real mark, full colour on the card surface. */}
        <span className="portal-conn-picker__mark" aria-hidden>
          <BrandMark id={type.id} size={20} />
        </span>
        <span className="portal-conn-picker__card-text">
          <span className="portal-conn-picker__card-name">{label}</span>
          <span className="portal-conn-picker__card-desc">
            {t(type.descriptionKey)}
          </span>
        </span>
      </button>

      {tasks.length > 0 && (
        <button
          type="button"
          className="portal-conn-picker__info"
          aria-label={t("portal.connections.picker2.tasksInfo")}
          aria-expanded={showTasks}
          onClick={() => setShowTasks((open) => !open)}
        >
          <InfoOutlinedIcon fontSize="inherit" />
        </button>
      )}

      {showTasks && (
        <div className="portal-conn-picker__tasks">
          <p className="portal-conn-picker__tasks-title">
            {t("portal.connections.picker2.tasksTitle")}
          </p>
          <ul className="portal-conn-picker__tasks-list">
            {tasks.map((op) => (
              <li key={op.id} className="portal-conn-picker__task">
                <span className="portal-conn-picker__task-name">
                  {t(op.labelKey)}
                </span>
                <span className="portal-conn-picker__task-desc">
                  {t(op.descriptionKey)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
