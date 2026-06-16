import { Card } from "@shared/components";
import type { UseCase, UseCaseAccent } from "@portal/api/gettingStarted";

const ACCENT_COLOR: Record<UseCaseAccent, string> = {
  blue: "var(--color-blue)",
  purple: "var(--color-purple)",
  green: "var(--color-green)",
  amber: "var(--color-amber)",
  red: "var(--color-red)",
};

/**
 * Step 1 — "What do you want to build?". A grid of use-case cards; selecting
 * one advances the funnel. Selection is reflected via a ring so the choice
 * stays visible if the user steps back to change it.
 */
export interface UseCasePickerProps {
  useCases: UseCase[];
  selectedId: string | null;
  onSelect: (useCase: UseCase) => void;
}

export function UseCasePicker({
  useCases,
  selectedId,
  onSelect,
}: UseCasePickerProps) {
  return (
    <div className="portal-gs__usecases" role="list">
      {useCases.map((uc) => {
        const color = ACCENT_COLOR[uc.accent];
        const isSelected = uc.id === selectedId;
        return (
          <Card
            key={uc.id}
            accent={uc.accent}
            padding="none"
            interactive
            role="listitem"
            className={
              "portal-gs__usecase" + (isSelected ? " is-selected" : "")
            }
          >
            <button
              type="button"
              className="portal-gs__usecase-hit"
              aria-pressed={isSelected}
              onClick={() => onSelect(uc)}
            >
              <span className="portal-gs__usecase-eyebrow" style={{ color }}>
                {uc.eyebrow}
              </span>
              <span className="portal-gs__usecase-title">{uc.title}</span>
              <span className="portal-gs__usecase-blurb">{uc.blurb}</span>
              <span className="portal-gs__usecase-cta" style={{ color }}>
                Start with this <span aria-hidden>→</span>
              </span>
            </button>
          </Card>
        );
      })}
    </div>
  );
}
