/**
 * SaaS override of the Files-sidebar grouping seam (shadows the core
 * `@app/components/shared/fileSidebarGrouping`). Classification/policies are
 * SaaS-only, so only here does the sidebar group by document category:
 *   • "Recent" — the most-recently-modified files, expanded by default.
 *   • one collapsible group per classification category (taxonomy icon + count).
 *   • "Other" — files without a category.
 *
 * A file's category is read once from its PDF metadata and cached on the stub
 * (`classificationCategory`) via a lazy backfill, so grouping stays cheap.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { useClassificationTaxonomy } from "@app/hooks/useClassificationTaxonomy";
import { DEFAULT_CATEGORY_ICON } from "@app/data/categoryIcons";
import { fileStorage } from "@app/services/fileStorage";
import { readStubClassificationCategory } from "@app/services/fileClassification";
import { hasInFlightPolicyRuns } from "@app/components/policies/policyRunStore";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileSidebarGroup } from "@core/components/shared/fileSidebarGrouping";

export type { FileSidebarGroup };

/** Files shown in the always-expanded "Recent" group. */
const RECENT_COUNT = 8;
/** Files read per effect pass, so a big library backfills over several ticks. */
const BACKFILL_BATCH = 3;
/** Recheck delay when the backfill yields to an active policy wave. */
const BACKFILL_BUSY_RETRY_MS = 4000;

/** Schedule work for the browser's idle time (or soon after, as a fallback). */
function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, 200);
  return () => window.clearTimeout(timer);
}

/** Distinct accent colours cycled across categories in taxonomy order, so each
 *  category's icon reads at a glance. Muted, professional tones. */
const CATEGORY_COLORS = [
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
/** Neutral grey for the "Other" (uncategorised) group. */
const OTHER_COLOR = "#6b7280";

export function useFileSidebarGroups(
  stubs: StirlingFileStub[],
): FileSidebarGroup[] | null {
  const { t } = useTranslation();
  const { taxonomy } = useClassificationTaxonomy(true);
  const { bumpRevision } = useIndexedDB();
  // Reads we've already attempted, keyed by file id + lastModified. Keying on
  // lastModified (not just id) means a file that gets (re-)classified — the
  // classify policy writes its category into a NEW version, bumping
  // lastModified — is read again, so it moves out of "Other" on its own instead
  // of being stuck until a manual refresh. A genuinely-uncategorised file keeps
  // a stable key, so it's read once, not on a loop.
  const attempted = useRef<Set<string>>(new Set());
  const attemptKey = (s: StirlingFileStub) =>
    `${s.id as string}:${s.lastModified ?? 0}`;
  // Bumped to re-attempt a backfill pass that yielded to an active policy wave.
  const [retryTick, setRetryTick] = useState(0);

  // Lazily cache each file's category on its stub (read PDF metadata once).
  // This is a LEGACY/fallback path (policy deliveries stamp the category on the
  // stub directly), so it must never compete with real work: each read loads the
  // file's full bytes + parses PDF metadata. It yields while a policy wave is in
  // flight (those files get stamped on delivery anyway) and otherwise runs in
  // idle time, a few files per pass.
  useEffect(() => {
    const pending = stubs
      .filter(
        (s) =>
          !s.classificationCategory && !attempted.current.has(attemptKey(s)),
      )
      .slice(0, BACKFILL_BATCH);
    if (pending.length === 0) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      // A policy wave is working these files — deliveries stamp categories
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
          const category = await readStubClassificationCategory(stub);
          if (cancelled) return;
          if (category) {
            const ok = await fileStorage.updateFileMetadata(stub.id as FileId, {
              classificationCategory: category,
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

  return useMemo(() => {
    if (stubs.length === 0) return null;

    // icon + display order per category id, from the team's taxonomy.
    const meta = new Map<string, { icon?: string; order: number }>();
    taxonomy.categories.forEach((category, index) =>
      meta.set(category.id, { icon: category.icon, order: index }),
    );

    const recent = [...stubs]
      .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
      .slice(0, RECENT_COUNT);

    const byCategory = new Map<string, StirlingFileStub[]>();
    const uncategorized: StirlingFileStub[] = [];
    for (const stub of stubs) {
      const category = stub.classificationCategory;
      if (!category) {
        uncategorized.push(stub);
        continue;
      }
      const bucket = byCategory.get(category.id);
      if (bucket) bucket.push(stub);
      else byCategory.set(category.id, [stub]);
    }

    const categoryGroups = [...byCategory.entries()]
      .map(([id, groupStubs]) => {
        const order = meta.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
        return {
          order,
          group: {
            id: `cat:${id}`,
            label: groupStubs[0].classificationCategory?.label ?? id,
            icon: meta.get(id)?.icon ?? DEFAULT_CATEGORY_ICON,
            color:
              CATEGORY_COLORS[
                (order === Number.MAX_SAFE_INTEGER ? 0 : order) %
                  CATEGORY_COLORS.length
              ],
            stubs: groupStubs,
            defaultExpanded: false,
          } satisfies FileSidebarGroup,
        };
      })
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.group);

    const groups: FileSidebarGroup[] = [
      {
        id: "recent",
        label: t("fileSidebar.recent", "Recent"),
        icon: "history",
        stubs: recent,
        defaultExpanded: true,
      },
      ...categoryGroups,
    ];
    if (uncategorized.length > 0) {
      groups.push({
        id: "other",
        label: t("fileSidebar.other", "Other"),
        icon: DEFAULT_CATEGORY_ICON,
        color: OTHER_COLOR,
        stubs: uncategorized,
        defaultExpanded: false,
      });
    }
    return groups;
  }, [stubs, taxonomy, t]);
}
