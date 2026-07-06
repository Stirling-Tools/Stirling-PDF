/**
 * The Files sidebar's group picker — a "tune" button in the section header
 * opening a modal where the user chooses WHICH groups the sidebar shows.
 *
 * Built-in labels are listed under their families, busiest first, each section
 * collapsible (only the busiest starts expanded): a family checkbox shows the
 * whole family as ONE group (the default), while each member label can be
 * enabled as its own standalone group for finer granularity (e.g. hide
 * "Medical", show "Lab report"). Custom team/personal labels get their own
 * toggles. Changes apply instantly (device-local prefs, no save step); files
 * in no visible group fall back to the sidebar's "Other" group.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import TuneIcon from "@mui/icons-material/Tune";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Checkbox, TextInput } from "@mantine/core";
import { Modal } from "@shared/components/Modal";
import { Button } from "@shared/components/Button";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { useClassificationLabels } from "@app/hooks/useClassificationLabels";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import {
  LABEL_FAMILIES,
  LABEL_FAMILY_BY_NAME,
} from "@app/data/classificationLabels";
import {
  getFileSidebarGroupPrefs,
  resetFileSidebarGroupPrefs,
  setGroupHidden,
  setLabelEnabled,
  subscribeFileSidebarGroupPrefs,
} from "@app/services/fileSidebarGroupPrefs";
import type { StirlingFileStub } from "@app/types/fileContext";
import "@app/components/shared/FileSidebarGroupControls.css";

interface FileSidebarGroupControlsProps {
  /** The files currently listed, for live per-label counts. */
  stubs: StirlingFileStub[];
}

export function FileSidebarGroupControls({
  stubs,
}: FileSidebarGroupControlsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const prefs = useSyncExternalStore(
    subscribeFileSidebarGroupPrefs,
    getFileSidebarGroupPrefs,
  );
  // Only fetch the label sets while the picker is open — the sidebar itself
  // doesn't need them here.
  const { merged: labelSet } = useClassificationLabels(open);

  const hidden = useMemo(() => new Set(prefs.hiddenGroups), [prefs]);
  const enabled = useMemo(() => new Set(prefs.enabledLabels), [prefs]);

  // Files per label key and per family (family counts dedupe multi-label files).
  const { labelCounts, familyCounts } = useMemo(() => {
    const labelCounts = new Map<string, number>();
    const familyStubs = new Map<string, Set<string>>();
    for (const stub of stubs) {
      for (const label of stub.classificationLabels ?? []) {
        const key = label.toLowerCase();
        labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
        const familyId = LABEL_FAMILY_BY_NAME.get(key);
        if (familyId) {
          const ids = familyStubs.get(familyId) ?? new Set();
          ids.add(stub.id as string);
          familyStubs.set(familyId, ids);
        }
      }
    }
    const familyCounts = new Map<string, number>();
    for (const [id, ids] of familyStubs) familyCounts.set(id, ids.size);
    return { labelCounts, familyCounts };
  }, [stubs]);

  // Custom labels = the user's effective set plus anything actually on files,
  // minus the built-ins (those live under their family sections).
  const customLabels = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const label of labelSet) {
      const key = label.name.toLowerCase();
      if (!LABEL_FAMILY_BY_NAME.has(key)) byKey.set(key, label.name);
    }
    for (const stub of stubs) {
      for (const label of stub.classificationLabels ?? []) {
        const key = label.toLowerCase();
        if (!LABEL_FAMILY_BY_NAME.has(key) && !byKey.has(key)) {
          byKey.set(key, label);
        }
      }
    }
    return [...byKey.entries()]
      .map(([key, display]) => ({ key, display }))
      .sort((a, b) =>
        a.display.localeCompare(b.display, undefined, { sensitivity: "base" }),
      );
  }, [labelSet, stubs]);

  const q = query.trim().toLowerCase();
  const matches = (name: string) => q === "" || name.toLowerCase().includes(q);

  // Busiest categories first — the sections the user most likely came to
  // adjust. Ties keep the declaration order.
  const sortedFamilies = useMemo(
    () =>
      [...LABEL_FAMILIES].sort(
        (a, b) => (familyCounts.get(b.id) ?? 0) - (familyCounts.get(a.id) ?? 0),
      ),
    [familyCounts],
  );

  // Collapsed/expanded per family section. On open, only the busiest section
  // starts expanded — a scannable overview instead of a wall of 270 chips.
  const [expandedFamilies, setExpandedFamilies] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const toggleFamilyExpanded = (id: string) =>
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openPicker = () => {
    setQuery("");
    setExpandedFamilies(
      new Set(sortedFamilies.length > 0 ? [sortedFamilies[0].id] : []),
    );
    setOpen(true);
  };

  return (
    <>
      {/* -external: revealed on section-header hover, like the Browse button. */}
      <button
        className="file-sidebar-section-btn file-sidebar-section-btn-external"
        onClick={openPicker}
        title={t("fileSidebar.customizeGroups", "Customize groups")}
        type="button"
        data-testid="customize-groups"
      >
        <TuneIcon sx={{ fontSize: "1rem" }} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="md"
        title={t("fileSidebar.groupsModal.title", "Sidebar groups")}
        subtitle={t(
          "fileSidebar.groupsModal.subtitle",
          "Choose which groups organize your files. Tick a category to see it as one group, or expand the granularity by ticking individual labels. Files in none of your groups appear under “Other”.",
        )}
        footer={
          <div className="fsg-footer">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<RestartAltIcon sx={{ fontSize: "1rem" }} />}
              onClick={resetFileSidebarGroupPrefs}
            >
              {t("fileSidebar.groupsModal.reset", "Reset to defaults")}
            </Button>
            <Button variant="gradient" size="sm" onClick={() => setOpen(false)}>
              {t("fileSidebar.groupsModal.done", "Done")}
            </Button>
          </div>
        }
      >
        <div className="fsg-body">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={t("fileSidebar.groupsModal.search", "Search labels…")}
            size="sm"
            data-autofocus
          />

          {sortedFamilies.map((family) => {
            // Family-name hits show the whole family; otherwise only matching
            // member labels (and hide the section when nothing matches).
            const familyHit = matches(family.name);
            const members = familyHit
              ? family.labels
              : family.labels.filter((label) => matches(label.name));
            if (members.length === 0) return null;
            const familyShown = !hidden.has(`family:${family.id}`);
            // Searching overrides the collapse state — a hit you can't see
            // isn't a hit.
            const isExpanded = q !== "" || expandedFamilies.has(family.id);
            return (
              <section key={family.id} className="fsg-family">
                <div
                  className="fsg-family-header"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleFamilyExpanded(family.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleFamilyExpanded(family.id);
                    }
                  }}
                >
                  {isExpanded ? (
                    <KeyboardArrowDownIcon className="fsg-chevron" />
                  ) : (
                    <KeyboardArrowRightIcon className="fsg-chevron" />
                  )}
                  {/* The checkbox toggles the group's visibility; keep its
                      clicks out of the header's expand/collapse. */}
                  <span
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      size="xs"
                      checked={familyShown}
                      onChange={(e) =>
                        setGroupHidden(
                          `family:${family.id}`,
                          !e.currentTarget.checked,
                        )
                      }
                      aria-label={family.name}
                    />
                  </span>
                  <LocalIcon icon={family.icon} width="1.05rem" />
                  <span className="fsg-family-name">{family.name}</span>
                  <span className="fsg-count">
                    {familyCounts.get(family.id) ?? 0}
                  </span>
                </div>
                {isExpanded && (
                  <div className="fsg-chips">
                    {members.map((label) => {
                      const key = label.name.toLowerCase();
                      const on = enabled.has(key);
                      const count = labelCounts.get(key) ?? 0;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`fsg-chip${on ? " is-on" : ""}`}
                          aria-pressed={on}
                          onClick={() => setLabelEnabled(label.name, !on)}
                        >
                          <LocalIcon
                            icon={label.icon ?? DEFAULT_LABEL_ICON}
                            width="0.95rem"
                          />
                          {label.name}
                          {count > 0 && (
                            <span className="fsg-count">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {customLabels.some((label) => matches(label.display)) && (
            <section className="fsg-family">
              <p className="fsg-custom-title">
                {t(
                  "fileSidebar.groupsModal.customSection",
                  "Team & personal labels",
                )}
              </p>
              <div className="fsg-chips">
                {customLabels
                  .filter((label) => matches(label.display))
                  .map((label) => {
                    const shown = !hidden.has(`label:${label.key}`);
                    const count = labelCounts.get(label.key) ?? 0;
                    return (
                      <button
                        key={label.key}
                        type="button"
                        className={`fsg-chip${shown ? " is-on" : ""}`}
                        aria-pressed={shown}
                        onClick={() =>
                          setGroupHidden(`label:${label.key}`, shown)
                        }
                      >
                        <LocalIcon icon={DEFAULT_LABEL_ICON} width="0.95rem" />
                        {label.display}
                        {count > 0 && (
                          <span className="fsg-count">{count}</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </section>
          )}
        </div>
      </Modal>
    </>
  );
}
