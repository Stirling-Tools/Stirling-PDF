/**
 * Proprietary implementation of the right-sidebar Policies surface.
 *
 * Shadows the core stubs at {@code core/components/policies/PoliciesSidebar.tsx}
 * via the {@code @app/*} alias cascade. Three slots, all driven by the shared
 * {@link policySelectionStore} so they stay in sync:
 *   • {@link PoliciesSection} — the collapsible policy list, rendered above the
 *     Tools section in {@code RightSidebar} when no policy is open.
 *   • {@link PolicyDetailTakeover} — the detail / wizard / settings view, which
 *     replaces the Tools area when a policy is open.
 *   • {@link PoliciesCollapsedButton} — the icon rail shown when the sidebar is
 *     collapsed; clicking an icon selects the policy and expands the rail.
 */

import {
  useState,
  useEffect,
  useMemo,
  type DragEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DragIndicatorRounded from "@mui/icons-material/DragIndicatorRounded";
import MoreHorizRounded from "@mui/icons-material/MoreHorizRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { usePolicies } from "@app/hooks/usePolicies";
import { usePolicyCatalog } from "@app/hooks/usePolicyCatalog";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";
import { getPolicyAutomation } from "@app/services/policyFolders";
import { watchedFolderStorage } from "@app/services/watchedFolderStorage";
import { runsToActivity, runsToStats } from "@app/services/policyLiveData";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";
import { runPolicyOnFile } from "@app/components/policies/usePolicyAutoRun";
import type { FileId } from "@app/types/file";
import type {
  AutomationConfig,
  AutomationOperation,
} from "@app/types/automation";
import type { WatchedFolder } from "@app/types/watchedFolders";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { IconBadge } from "@shared/components/IconBadge";
import {
  deriveRowStatus,
  STATUS_LABEL,
  ROW_ACCENT,
} from "@app/components/policies/policyStatus";
import { StatusBadge } from "@shared/components/StatusBadge";
import { SectionHeader } from "@shared/components/SectionHeader";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import { PolicyDetailPanel } from "@app/components/policies/PolicyDetailPanel";
import { PolicyDeleteConfirmModal } from "@app/components/policies/PolicyDeleteConfirmModal";
import type { PolicyCategory, PolicyConfigResult } from "@app/types/policies";
import { PanelHeader } from "@shared/components/PanelHeader";
import {
  usePolicySelection,
  selectPolicy,
  setPolicyDetailView,
  closePolicy,
  openPolicySettings,
  closePolicySettings,
} from "@app/components/policies/policySelectionStore";
import "@app/components/policies/Policies.css";

/** localStorage key persisting the Policies section's expand/collapse state. */
const POLICIES_COLLAPSED_KEY = "stirling-policies-section-collapsed";

/** Whether the right rail should host the Policies section. True in proprietary. */
export function usePoliciesEnabled(): boolean {
  return POLICIES_ENABLED;
}

/**
 * Whether the right rail should show the Policies section.
 */
export function usePoliciesVisible(): boolean {
  const pol = usePolicies();
  const { categories } = usePolicyCatalog();
  if (!POLICIES_ENABLED) return false;
  return pol.canConfigure || categories.some((c) => !c.comingSoon);
}

/**
 * Whether the current user is a guest who can't open or configure policies —
 * an anonymous user on a login-enabled deployment (i.e. a SaaS sign-up prompt
 * candidate). The policy list stays visible but its rows don't open; the guest
 * sign-up banner explains why. A login-disabled single-user deployment has an
 * anonymous local operator with full access, so it is not gated.
 */
export function usePolicyGuestBlocked(): boolean {
  const { config } = useAppConfig();
  const { user } = useAuth();
  return config?.enableLogin === true && user?.is_anonymous === true;
}

/** Re-summon the guest sign-up banner (the saas GuestUserBanner listens for this;
 *  a no-op on builds without it). Used when a guest clicks a gated policy. */
function promptGuestSignup(): void {
  window.dispatchEvent(new CustomEvent("stirling:show-guest-banner"));
}

/**
 * Whether a policy is open — i.e. its detail view should take over the rail in
 * place of the tool list. False when the feature is off or nothing is selected.
 */
export function usePolicyDetailActive(): boolean {
  const { selectedId, settingsOpen } = usePolicySelection();
  return POLICIES_ENABLED && (selectedId != null || settingsOpen);
}

/** The collapsible policy list, rendered above the Tools section. */
export function PoliciesSection({
  leadingControl,
}: {
  /** Optional control rendered to the left of the header (e.g. the sidebar
   *  collapse button), mirroring the back-button + title in a policy. */
  leadingControl?: ReactNode;
} = {}) {
  const { t } = useTranslation();
  const pol = usePolicies();
  const { categories } = usePolicyCatalog();
  const guestBlocked = usePolicyGuestBlocked();
  // Persist the expand/collapse state across refreshes.
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(POLICIES_COLLAPSED_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const toggleExpanded = () =>
    setExpanded((open) => {
      const next = !open;
      try {
        localStorage.setItem(POLICIES_COLLAPSED_KEY, next ? "0" : "1");
      } catch {
        // Best-effort; ignore quota/availability failures.
      }
      return next;
    });

  if (!POLICIES_ENABLED) return null;

  // Admins / team leads see the full catalogue (coming-soon rows greyed as an
  // enterprise upsell); regular users only see the live policies — the
  // coming-soon "Upgrade to enterprise" rows are hidden from them.
  const visibleCategories = pol.canConfigure
    ? categories
    : categories.filter((c) => !c.comingSoon);
  if (visibleCategories.length === 0) return null;

  // The header tally counts every CONFIGURED policy (active + paused), not just
  // the active ones.
  const configuredCount = categories.filter(
    (c) => pol.policies[c.id]?.configured,
  ).length;

  // Rows render in execution order (defaults to catalog order until reordered
  // on the Policy settings page).
  const displayCategories = [...visibleCategories].sort(
    (a, b) =>
      (pol.policies[a.id]?.order ?? 0) - (pol.policies[b.id]?.order ?? 0),
  );

  return (
    <div className="pol-list">
      <div className="pol-list-head">
        {leadingControl}
        <SectionHeader
          title={t("policies.sidebar.title", "Policies")}
          count={t("policies.sidebar.activeCount", "{{count}} active", {
            count: configuredCount,
          })}
          collapsible
          expanded={expanded}
          onToggle={toggleExpanded}
        />
        <Menu position="bottom-end" width="13rem" withinPortal>
          <Menu.Target>
            <button
              type="button"
              className="pol-info-btn"
              aria-label={t(
                "policies.sidebar.optionsAriaLabel",
                "Policy options",
              )}
            >
              <MoreHorizRounded sx={{ fontSize: "1.25rem" }} />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {/* Hovering surfaces the same explanation the info tooltip used to show. */}
            <AppTooltip
              content={t(
                "policies.sidebar.infoTooltip",
                "A policy is a fixed set of tools that runs automatically whenever it's triggered — for example when a new document arrives — enforcing rules like redacting PII with no manual steps.",
              )}
              position="left"
              maxWidth="16rem"
            >
              <Menu.Item
                leftSection={<InfoOutlined sx={{ fontSize: "1rem" }} />}
              >
                {t("policies.sidebar.whatIsPolicy", "What is a policy?")}
              </Menu.Item>
            </AppTooltip>
            {pol.canConfigure && (
              <Menu.Item
                leftSection={<TuneRounded sx={{ fontSize: "1rem" }} />}
                onClick={() => openPolicySettings()}
              >
                {t("policies.sidebar.policySettings", "Policy settings")}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>

      {expanded && (
        <>
          <div className="pol-list-rows">
            {displayCategories.map((cat) => {
              if (cat.comingSoon) {
                return (
                  <div key={cat.id} className="pol-row pol-row--soon">
                    <IconBadge size="sm" accent={ROW_ACCENT[cat.id] ?? "blue"}>
                      {cat.icon}
                    </IconBadge>
                    <span className="pol-row-label">
                      {t(`policies.catalog.${cat.id}`, cat.label)}
                    </span>
                    <span className="pol-row-trail">
                      <a
                        className="pol-row-upgrade"
                        href="https://stirling.com/contact"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t(
                          "policies.sidebar.upgradeToEnterprise",
                          "Upgrade to enterprise",
                        )}
                      </a>
                    </span>
                  </div>
                );
              }
              const status = deriveRowStatus(pol.policies[cat.id]);
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="pol-row"
                  onClick={() =>
                    guestBlocked ? promptGuestSignup() : selectPolicy(cat.id)
                  }
                >
                  <IconBadge size="sm" accent={ROW_ACCENT[cat.id] ?? "blue"}>
                    {cat.icon}
                  </IconBadge>
                  <span className="pol-row-label">
                    {t(`policies.catalog.${cat.id}`, cat.label)}
                  </span>
                  <span className="pol-row-trail">
                    {status === "setup" ? (
                      <span className="pol-row-setup">
                        {t("policies.sidebar.setUp", "Set up")}
                      </span>
                    ) : (
                      <StatusBadge
                        tone={status === "active" ? "success" : "warning"}
                        size="sm"
                      >
                        {t(`policies.status.${status}`, STATUS_LABEL[status])}
                      </StatusBadge>
                    )}
                    <ChevronRightIcon
                      className="pol-row-chevron"
                      sx={{ fontSize: "1rem" }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Takeover dispatcher: shows the policy-settings page (execution order), an open
 * policy's detail, or nothing — whichever the selection store currently holds.
 * The heavy per-policy hooks live in {@link PolicyOpenDetail}, so the settings
 * page doesn't pay for (or trip over) them.
 */
export function PolicyDetailTakeover() {
  const { selectedId, settingsOpen } = usePolicySelection();
  if (!POLICIES_ENABLED) return null;
  if (settingsOpen && selectedId == null) return <PolicySettingsPanel />;
  if (selectedId == null) return null;
  return <PolicyOpenDetail />;
}

/**
 * The open-policy view — narrative detail, setup wizard, or edit-settings —
 * which replaces the Tools area while a policy is selected.
 */
function PolicyOpenDetail() {
  const { t } = useTranslation();
  const pol = usePolicies();
  const { categories, configs, sources, docTypes } = usePolicyCatalog();
  const { selectedId, detailView } = usePolicySelection();

  // The configured policy's backing folder + automation (its real, editable
  // pipeline). `reloadKey` bumps after the edit modal saves so the detail
  // reflects the new steps. Falls back to the preset's rules when unconfigured.
  const folderId = selectedId ? pol.policies[selectedId]?.folderId : undefined;
  const [steps, setSteps] = useState<AutomationOperation[]>([]);
  const [backingFolder, setBackingFolder] = useState<WatchedFolder | null>(
    null,
  );
  const [backingAutomation, setBackingAutomation] =
    useState<AutomationConfig | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!folderId) {
      setSteps([]);
      setBackingFolder(null);
      setBackingAutomation(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [folder, automation] = await Promise.all([
        watchedFolderStorage.getFolder(folderId),
        getPolicyAutomation(folderId),
      ]);
      if (cancelled) return;
      setBackingFolder(folder);
      setBackingAutomation(automation);
      setSteps(automation?.operations ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [folderId, reloadKey]);

  // Activity/stats come from the real backend runs the auto-run controller fires
  // on every upload (policyRunStore), filtered to this policy's category. The
  // store is reactive, so the feed updates live as runs progress — no polling
  // here (the controller does the run-status polling).
  const allRuns = usePolicyRuns();
  const categoryRuns = useMemo(
    () => allRuns.filter((r) => r.categoryId === selectedId),
    [allRuns, selectedId],
  );

  if (!POLICIES_ENABLED || selectedId == null) return null;

  const category = categories.find((c) => c.id === selectedId);
  const state = pol.policies[selectedId];
  const config = configs[selectedId];
  if (!category || !state || !config) return null;
  // Coming-soon categories can't be opened (the list row is locked anyway).
  if (category.comingSoon) return null;

  const status = deriveRowStatus(state);

  const onSetupClassification = () => {
    const classifier = categories.find((c) => c.providesClassification);
    if (classifier) selectPolicy(classifier.id);
  };

  // Preset (tool-chain) policies configure via the wizard's locked tool-config
  // step instead of the add/remove builder; the wizard fires onCommitConfig for
  // them (and onComplete for builder-based categories). One commit path serves
  // both first-time configure and edits.
  const commitConfig = (result: PolicyConfigResult) =>
    pol.commitPolicyConfig(selectedId, result).then(() => {
      setReloadKey((k) => k + 1);
      setPolicyDetailView("detail");
    });

  // Setup: the shared wizard in create mode.
  if (!state.configured) {
    return (
      <PolicySetupWizard
        key={selectedId}
        category={category}
        config={config}
        initial={state}
        sources={sources}
        docTypes={docTypes}
        canConfigure={pol.canConfigure}
        // No standalone classification policy exists yet to enable doc-type
        // narrowing, so it stays off for this release.
        classificationEnabled={false}
        mode="create"
        onCancel={() => closePolicy()}
        onComplete={(result) =>
          pol
            .enablePolicy(selectedId, result)
            .then(() => setPolicyDetailView("detail"))
        }
        onCommitConfig={commitConfig}
        onSetupClassification={onSetupClassification}
      />
    );
  }

  // Edit: the same wizard in edit mode, pre-filled — so editing has the settings
  // steps (not just the workflow). Wait for the backing automation to load so
  // the workflow step edits the real pipeline.
  if (detailView === "settings" && pol.canConfigure) {
    if (!backingAutomation) {
      return (
        <div className="pol-detail">
          <div className="pol-scroll">
            <p className="pol-desc">
              {t("policies.sidebar.loading", "Loading…")}
            </p>
          </div>
        </div>
      );
    }
    return (
      <PolicySetupWizard
        key={`edit-${selectedId}`}
        category={category}
        config={config}
        initial={state}
        sources={sources}
        docTypes={docTypes}
        canConfigure={pol.canConfigure}
        classificationEnabled={false}
        mode="edit"
        existingAutomation={backingAutomation}
        initialFolder={backingFolder ?? undefined}
        onCancel={() => setPolicyDetailView("detail")}
        onComplete={(result) =>
          pol.savePolicyConfig(selectedId, result).then(() => {
            setReloadKey((k) => k + 1);
            setPolicyDetailView("detail");
          })
        }
        onCommitConfig={commitConfig}
        onSetupClassification={onSetupClassification}
      />
    );
  }

  return (
    <>
      <PolicyDetailPanel
        category={category}
        config={config}
        status={status}
        steps={steps}
        activity={runsToActivity(categoryRuns)}
        stats={runsToStats(categoryRuns, backingFolder?.createdAt)}
        canConfigure={pol.canConfigure}
        canDelete={!state.isDefault}
        onBack={() => closePolicy()}
        onEditSettings={() => {
          // Seeded/active policies may have no backing folder yet — create one
          // from the preset so there's a workflow to edit, then open settings.
          void pol
            .ensurePolicyFolder(selectedId)
            .then(() => setPolicyDetailView("settings"));
        }}
        onTogglePause={() =>
          status === "paused"
            ? pol.resumePolicy(selectedId)
            : pol.pausePolicy(selectedId)
        }
        onDelete={() => setConfirmingDelete(true)}
        onRetry={(item) => {
          if (item.fileId && state.backendId) {
            void runPolicyOnFile(
              selectedId,
              state.backendId,
              item.fileId as FileId,
              item.doc,
            );
          }
        }}
      />
      {confirmingDelete && (
        <PolicyDeleteConfirmModal
          opened
          label={category.label}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            closePolicy();
            void pol.deletePolicy(selectedId);
          }}
        />
      )}
    </>
  );
}

/**
 * The Policy settings takeover — reached from the section header's "…" menu.
 * Each trigger (upload / export) gets its own run-order list, since a chain only
 * spans policies that fire on the same trigger — reordering one never affects the
 * other. Admin-only (the menu entry is gated on canConfigure).
 */
function PolicySettingsPanel() {
  const { t } = useTranslation();
  const pol = usePolicies();
  const { categories } = usePolicyCatalog();

  // Configured, live policies for a trigger, in execution order.
  const inOrder = (trigger: "upload" | "export") =>
    categories
      .filter(
        (c) =>
          pol.policies[c.id]?.configured &&
          !c.comingSoon &&
          (pol.policies[c.id]?.runOn ?? "upload") === trigger,
      )
      .sort(
        (a, b) =>
          (pol.policies[a.id]?.order ?? 0) - (pol.policies[b.id]?.order ?? 0),
      );

  const uploadCats = inOrder("upload");
  const exportCats = inOrder("export");

  // Order is one global sort key, so persist both groups together (upload first)
  // to keep each group's members contiguous — the auto-run chain reads relative
  // order within a trigger.
  const persist = (uploadIds: string[], exportIds: string[]) =>
    pol.reorderPolicies([...uploadIds, ...exportIds]);

  return (
    <div className="pol-detail">
      <PanelHeader
        icon={<TuneRounded sx={{ fontSize: "1.1rem" }} />}
        title={t("policies.settings.title", "Policy settings")}
        onClose={() => closePolicySettings()}
        closeLabel={t("policies.detail.close", "Close")}
      />
      <div className="pol-scroll">
        <p className="pol-desc">
          {t(
            "policies.settings.runOrderDesc",
            "When more than one policy runs on the same trigger, they run in this order — each on the previous policy's output. Drag to reorder.",
          )}
        </p>
        {/* Both triggers are always shown so the run order for each is explicit,
            with an empty note when a trigger has no policies. */}
        <PolicyReorderSection
          title={t("policies.settings.onUpload", "On upload")}
          cats={uploadCats}
          emptyText={t(
            "policies.settings.noneUpload",
            "No policies currently run on upload.",
          )}
          onReorder={(ids) =>
            persist(
              ids,
              exportCats.map((c) => c.id),
            )
          }
        />
        <PolicyReorderSection
          title={t("policies.settings.onExport", "On export")}
          cats={exportCats}
          emptyText={t(
            "policies.settings.noneExport",
            "No policies currently run on export.",
          )}
          onReorder={(ids) =>
            persist(
              uploadCats.map((c) => c.id),
              ids,
            )
          }
        />
      </div>
    </div>
  );
}

/**
 * One trigger's run-order list. Rows drag to reorder (only when there's more than
 * one to order); the drag ghost is the whole row with a blue outline, and a
 * straight blue line marks where the policy will land. Reorders in isolation and
 * hands the new id order back to the parent to persist.
 */
function PolicyReorderSection({
  title,
  cats,
  emptyText,
  onReorder,
}: {
  title: string;
  cats: PolicyCategory[];
  emptyText: string;
  onReorder: (orderedIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Whether the drop would land after (vs before) the hovered row.
  const [overBelow, setOverBelow] = useState(false);
  const draggable = cats.length >= 2;

  const clear = () => {
    setDragId(null);
    setOverId(null);
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return clear();
    const ids = cats.map((c) => c.id);
    const from = ids.indexOf(dragId);
    let to = ids.indexOf(targetId) + (overBelow ? 1 : 0);
    if (from < 0 || to < 0) return clear();
    ids.splice(from, 1);
    if (from < to) to -= 1;
    ids.splice(to, 0, dragId);
    onReorder(ids);
    clear();
  };

  // The native drag image would be just the grip under the cursor; instead snapshot
  // the whole row (a styled clone) so the ghost that follows the mouse is the full
  // row with a blue outline.
  const startDrag = (e: DragEvent<HTMLSpanElement>, catId: string) => {
    setDragId(catId);
    e.dataTransfer.effectAllowed = "move";
    const row = (e.currentTarget as HTMLElement).closest(".pol-reorder-row");
    if (row instanceof HTMLElement) {
      const clone = row.cloneNode(true) as HTMLElement;
      clone.classList.add("pol-reorder-row--ghost");
      clone.style.width = `${row.offsetWidth}px`;
      clone.style.position = "fixed";
      clone.style.top = "-1000px";
      clone.style.left = "-1000px";
      clone.style.pointerEvents = "none";
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, 24, row.offsetHeight / 2);
      window.setTimeout(() => clone.remove(), 0);
    }
  };

  if (cats.length === 0) {
    return (
      <section className="pol-reorder-section">
        <p className="pol-section-label">{title}</p>
        <p className="pol-reorder-empty">{emptyText}</p>
      </section>
    );
  }

  return (
    <section className="pol-reorder-section">
      <p className="pol-section-label">{title}</p>
      <div className="pol-reorder-list">
        {cats.map((cat) => (
          <div
            key={cat.id}
            className="pol-reorder-row"
            data-dragging={dragId === cat.id || undefined}
            data-drop={
              draggable && overId === cat.id && dragId !== cat.id
                ? overBelow
                  ? "below"
                  : "above"
                : undefined
            }
            onDragOver={
              draggable
                ? (e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setOverId(cat.id);
                    setOverBelow(e.clientY > rect.top + rect.height / 2);
                  }
                : undefined
            }
            onDragLeave={
              draggable
                ? () => setOverId((id) => (id === cat.id ? null : id))
                : undefined
            }
            onDrop={
              draggable
                ? (e) => {
                    e.preventDefault();
                    handleDrop(cat.id);
                  }
                : undefined
            }
          >
            {draggable && (
              <span
                className="pol-reorder-grip"
                draggable
                onDragStart={(e) => startDrag(e, cat.id)}
                onDragEnd={clear}
                role="button"
                tabIndex={-1}
                aria-label={t(
                  "policies.settings.reorderHandle",
                  "Drag to reorder",
                )}
              >
                <DragIndicatorRounded sx={{ fontSize: "1rem" }} />
              </span>
            )}
            <IconBadge size="sm" accent={ROW_ACCENT[cat.id] ?? "blue"}>
              {cat.icon}
            </IconBadge>
            <span className="pol-reorder-label">
              {t(`policies.catalog.${cat.id}`, cat.label)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Collapsed-rail policy icons. Each tints blue when active and carries a small
 * status dot (green active / amber paused). Clicking selects the policy and
 * expands the rail.
 */
export function PoliciesCollapsedButton({
  onExpand,
}: {
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const pol = usePolicies();
  const { categories } = usePolicyCatalog();
  const guestBlocked = usePolicyGuestBlocked();

  if (!POLICIES_ENABLED) return null;

  // Coming-soon policies are excluded; admins see all real policies, others only see configured ones — renders nothing when empty.
  const railCategories = categories.filter((cat) => {
    if (cat.comingSoon) return false;
    if (pol.canConfigure) return true;
    return pol.policies[cat.id]?.configured;
  });
  if (railCategories.length === 0) return null;

  return (
    <>
      <div className="pol-crail">
        {railCategories.map((cat) => {
          const status = deriveRowStatus(pol.policies[cat.id]);
          const label = t(`policies.catalog.${cat.id}`, cat.label);
          const statusLabel = t(
            `policies.status.${status}`,
            STATUS_LABEL[status],
          );
          const suffix =
            status === "active"
              ? t("policies.sidebar.railSuffixActive", " (Active)")
              : status === "paused"
                ? t("policies.sidebar.railSuffixPaused", " (Paused)")
                : "";
          return (
            <AppTooltip
              key={cat.id}
              content={`${label}${suffix}`}
              position="left"
              arrow
              delay={300}
            >
              <button
                type="button"
                className="pol-crail-btn"
                data-status={status}
                aria-label={t(
                  "policies.sidebar.railAriaLabel",
                  "{{label}} policy — {{status}}",
                  { label, status: statusLabel },
                )}
                onClick={() => {
                  if (guestBlocked) {
                    promptGuestSignup();
                    return;
                  }
                  selectPolicy(cat.id);
                  onExpand();
                }}
              >
                {cat.icon}
                {(status === "active" || status === "paused") && (
                  <span className="pol-crail-dot" data-status={status} />
                )}
              </button>
            </AppTooltip>
          );
        })}
      </div>
      <div className="tool-panel__collapsed-divider" />
    </>
  );
}
