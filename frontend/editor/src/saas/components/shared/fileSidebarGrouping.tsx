/**
 * SaaS override of the Files-sidebar grouping seam (shadows the core
 * `@app/components/shared/fileSidebarGrouping`). Classification/policies are
 * SaaS-only, so only here does the sidebar group by classification label:
 *   • "Recent" — the most-recently-modified files, expanded by default.
 *   • one collapsible group per VISIBLE group choice — by default the built-in
 *     label FAMILIES ("Financial", "Legal & contracts", …), each collecting
 *     every file carrying any of its labels; users can hide families and show
 *     individual labels instead via the sidebar's group picker (device-local,
 *     {@link getFileSidebarGroupPrefs}). A file appears under EVERY visible
 *     group it belongs to (multi-membership).
 *   • "Other" — files in none of the visible groups (no labels, or all of
 *     their groups toggled off).
 *
 * A file's labels are read once from its PDF metadata and cached on the stub
 * (`classificationLabels`) via a lazy backfill, so grouping stays cheap.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { useClassificationLabels } from "@app/hooks/useClassificationLabels";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import {
  LABEL_FAMILIES,
  LABEL_FAMILY_BY_NAME,
} from "@app/data/classificationLabels";
import { fileStorage } from "@app/services/fileStorage";
import { readStubClassificationLabels } from "@app/services/fileClassification";
import { hasInFlightPolicyRuns } from "@app/components/policies/policyRunStore";
import {
  getFileSidebarGroupPrefs,
  subscribeFileSidebarGroupPrefs,
  type FileSidebarGroupPrefs,
} from "@app/services/fileSidebarGroupPrefs";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileSidebarGroup } from "@core/components/shared/fileSidebarGrouping";

export type { FileSidebarGroup };
// The sidebar's group-picker button + modal (core renders a null stub).
export { FileSidebarGroupControls } from "@app/components/shared/FileSidebarGroupControls";

/** Files shown in the always-expanded "Recent" group. */
const RECENT_COUNT = 8;
/** Files read per effect pass, so a big library backfills over several ticks. */
const BACKFILL_BATCH = 3;
/** Recheck delay when the backfill yields to an active policy wave. */
const BACKFILL_BUSY_RETRY_MS = 4000;

/** Distinct accent colours cycled across label groups in display order, so each
 *  group's icon reads at a glance. Muted, professional tones. */
const GROUP_COLORS = [
  "#16a34a", // green
  "#2563eb", // blue
  "#dc2626", // red
  "#ea580c", // orange
  "#9333ea", // purple
  "#0d9488", // teal
  "#db2777", // pink
  "#d97706", // amber
  "#4f46e5", // indigo
  "#0891b2", // cyan
];
/** Neutral grey for the "Other" (unlabelled) group. */
const OTHER_COLOR = "#6b7280";

/** Schedule work for the browser's idle time (or soon after, as a fallback). */
function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, 200);
  return () => window.clearTimeout(timer);
}

export function useFileSidebarGroups(
  stubs: StirlingFileStub[],
): FileSidebarGroup[] | null {
  const { t } = useTranslation();
  const { merged: labelSet } = useClassificationLabels(true);
  const { bumpRevision } = useIndexedDB();
  // Reads we've already attempted, keyed by file id + lastModified. Keying on
  // lastModified (not just id) means a file that gets (re-)classified — the
  // classify policy writes its labels into a NEW version, bumping lastModified —
  // is read again, so it moves out of "Other" on its own instead of being stuck
  // until a manual refresh. A genuinely-unlabelled file keeps a stable key, so
  // it's read once, not on a loop.
  const attempted = useRef<Set<string>>(new Set());
  const attemptKey = (s: StirlingFileStub) =>
    `${s.id as string}:${s.lastModified ?? 0}`;
  // Bumped to re-attempt a backfill pass that yielded to an active policy wave.
  const [retryTick, setRetryTick] = useState(0);

  // Lazily cache each file's labels on its stub (read PDF metadata once).
  // This is a fallback path for files that arrive with labels already in their
  // PDF metadata without going through a policy delivery (which stamps the stub
  // directly) — e.g. imported or shared files. It must never compete with real
  // work: each read loads the
  // file's full bytes + parses PDF metadata. It yields while a policy wave is in
  // flight (those files get stamped on delivery anyway) and otherwise runs in
  // idle time, a few files per pass.
  useEffect(() => {
    const pending = stubs
      .filter(
        (s) => !s.classificationLabels && !attempted.current.has(attemptKey(s)),
      )
      .slice(0, BACKFILL_BATCH);
    if (pending.length === 0) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      // A policy wave is working these files — deliveries stamp labels
      // deterministically, so reading now is wasted parsing at the worst time.
      // Recheck after the wave (also covered by the stubs change a delivery
      // causes, but a timer self-heals when a wave ends without one).
      if (hasInFlightPolicyRuns()) {
        retryTimer = window.setTimeout(() => {
          if (!cancelled) setRetryTick((n) => n + 1);
        }, BACKFILL_BUSY_RETRY_MS);
        return;
      }
      void (async () => {
        let wrote = false;
        for (const stub of pending) {
          attempted.current.add(attemptKey(stub));
          const labels = await readStubClassificationLabels(stub);
          if (cancelled) return;
          if (labels) {
            const ok = await fileStorage.updateFileMetadata(stub.id as FileId, {
              classificationLabels: labels,
            });
            if (ok) wrote = true;
          }
        }
        // One revision bump per batch → the sidebar re-reads and re-groups.
        if (!cancelled && wrote) bumpRevision();
      })();
    });
    return () => {
      cancelled = true;
      cancelIdle();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [stubs, bumpRevision, retryTick]);

  const prefs = useSyncExternalStore(
    subscribeFileSidebarGroupPrefs,
    getFileSidebarGroupPrefs,
  );
  return useMemo(
    () => buildLabelGroups(stubs, labelSet, t, prefs),
    [stubs, labelSet, t, prefs],
  );
}

/**
 * Pure grouping: Recent (top {@link RECENT_COUNT} by lastModified), then the
 * VISIBLE groups alphabetically (multi-membership), then Other — files in no
 * visible group — always last. Visible groups per {@link FileSidebarGroupPrefs}:
 * built-in families (default on), individually enabled built-in labels
 * (default off — their family covers them), and custom labels (default on).
 * Exported for tests.
 */
export function buildLabelGroups(
  stubs: StirlingFileStub[],
  labelSet: readonly { name: string; icon?: string }[],
  t: (key: string, fallback: string) => string,
  prefs: FileSidebarGroupPrefs,
): FileSidebarGroup[] | null {
  if (stubs.length === 0) return null;

  const hidden = new Set(prefs.hiddenGroups);
  const enabled = new Set(prefs.enabledLabels);

  // icon per label name (case-insensitive), from the user's effective set
  // (team ∪ personal). Labels on files that have since left the set (stale
  // metadata) still group — they just get the default icon.
  const iconByName = new Map<string, string | undefined>();
  for (const label of labelSet) {
    iconByName.set(label.name.toLowerCase(), label.icon);
  }

  const recent = [...stubs]
    .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
    .slice(0, RECENT_COUNT);

  // Bucket files per label (case-insensitive; first-seen casing wins the
  // display name) and per family (dedup — two same-family labels on one file
  // must not list it twice in the family group).
  const byLabel = new Map<
    string,
    { display: string; stubs: StirlingFileStub[] }
  >();
  const byFamily = new Map<string, Map<string, StirlingFileStub>>();
  for (const stub of stubs) {
    for (const label of stub.classificationLabels ?? []) {
      const key = label.toLowerCase();
      const bucket = byLabel.get(key);
      if (bucket) bucket.stubs.push(stub);
      else byLabel.set(key, { display: label, stubs: [stub] });
      const familyId = LABEL_FAMILY_BY_NAME.get(key);
      if (familyId) {
        const members = byFamily.get(familyId) ?? new Map();
        members.set(stub.id as string, stub);
        byFamily.set(familyId, members);
      }
    }
  }

  // Assemble the visible groups, then sort alphabetically — stable as counts
  // change, predictable to scan. Only groups with files render.
  const visible: Omit<FileSidebarGroup, "color">[] = [];
  for (const family of LABEL_FAMILIES) {
    const members = byFamily.get(family.id);
    if (!members || hidden.has(`family:${family.id}`)) continue;
    visible.push({
      id: `family:${family.id}`,
      label: family.name,
      icon: family.icon,
      stubs: [...members.values()],
      defaultExpanded: false,
    });
  }
  for (const [key, bucket] of byLabel) {
    const isBuiltIn = LABEL_FAMILY_BY_NAME.has(key);
    // Built-in labels show standalone only when explicitly enabled; custom
    // labels (team/personal additions) are their own group unless hidden.
    const show = isBuiltIn ? enabled.has(key) : !hidden.has(`label:${key}`);
    if (!show) continue;
    visible.push({
      id: `label:${key}`,
      label: bucket.display,
      icon: iconByName.get(key) ?? DEFAULT_LABEL_ICON,
      stubs: bucket.stubs,
      defaultExpanded: false,
    });
  }
  visible.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );

  // Other = every file covered by no visible group — unlabelled files AND
  // labelled files whose groups are all toggled off (they must stay reachable).
  const covered = new Set<string>();
  for (const group of visible) {
    for (const stub of group.stubs) covered.add(stub.id as string);
  }
  const other = stubs.filter((stub) => !covered.has(stub.id as string));

  const groups: FileSidebarGroup[] = [
    {
      id: "recent",
      label: t("fileSidebar.recent", "Recent"),
      icon: "history",
      stubs: recent,
      defaultExpanded: true,
    },
    ...visible.map((group, index) => ({
      ...group,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
    })),
  ];
  if (other.length > 0) {
    groups.push({
      id: "other",
      label: t("fileSidebar.other", "Other"),
      icon: DEFAULT_LABEL_ICON,
      color: OTHER_COLOR,
      stubs: other,
      defaultExpanded: false,
    });
  }
  return groups;
}
