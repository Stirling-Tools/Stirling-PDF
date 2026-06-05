import { useMemo, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useRainbowThemeContext } from "@app/components/shared/RainbowThemeProvider";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import rainbowStyles from "@app/styles/rainbow.module.css";
import { useIsMobile } from "@app/hooks/useIsMobile";
import ToolPanel from "@app/components/tools/ToolPanel";
import ToolSearch from "@app/components/tools/toolPicker/ToolSearch";
import {
  AgentsChatOverlay,
  AgentsCollapsedButton,
  AgentsSection,
  useAgentsEnabled,
} from "@app/components/agents/AgentsPanel";
import {
  PoliciesCollapsedButton,
  PoliciesSection,
  PolicyDetailTakeover,
  usePoliciesEnabled,
  usePolicyDetailActive,
} from "@app/components/policies/PoliciesSidebar";
import { useFavoriteToolItems } from "@app/hooks/tools/useFavoriteToolItems";
import { useToolSections } from "@app/hooks/useToolSections";
import type { SubcategoryGroup } from "@app/hooks/useToolSections";
import { ToolIcon } from "@app/components/shared/ToolIcon";
import { Tooltip as AppTooltip } from "@app/components/shared/Tooltip";
import { withViewTransition } from "@app/utils/viewTransition";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import { ToolId } from "@app/types/toolId";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import {
  FullscreenToolPanel,
  useIsFullscreenExpanded,
} from "@app/components/tools/FullscreenToolPanel";
import { useToolPanelGeometry } from "@app/hooks/tools/useToolPanelGeometry";
import "@app/components/tools/ToolPanel.css";

/**
 * Right-side rail wrapping the tool panel.
 *
 * Owns the rail-level concerns: collapse/expand chrome, the AGENTS top label,
 * the collapsed strip (agent button + favourite/recommended icon shortcuts),
 * and the agents chat overlay. Fullscreen takeover lives in FullscreenToolPanel.
 */
export default function RightSidebar() {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { sidebarRefs } = useSidebarContext();
  const { toolPanelRef, quickAccessRef } = sidebarRefs;
  const isMobile = useIsMobile();

  const {
    leftPanelView,
    isPanelVisible,
    searchQuery,
    filteredTools,
    toolRegistry,
    setSearchQuery,
    selectedToolKey,
    handleToolSelect,
    handleBackToTools,
    setLeftPanelView,
    setReaderMode,
    setSidebarsVisible,
    sidebarsVisible,
    readerMode,
    favoriteTools,
  } = useToolWorkflow();

  const agentsEnabled = useAgentsEnabled();
  const policiesEnabled = usePoliciesEnabled();
  const rawPolicyDetailActive = usePolicyDetailActive();
  const fullscreenExpanded = useIsFullscreenExpanded();
  const fullscreenGeometry = useToolPanelGeometry({
    enabled: fullscreenExpanded,
    toolPanelRef,
    quickAccessRef,
  });

  const handleExpand = () => {
    withViewTransition(() => {
      if (readerMode) setReaderMode(false);
      if (leftPanelView === "hidden") setLeftPanelView("toolPicker");
      if (!sidebarsVisible) setSidebarsVisible(true);
    });
  };

  const handleCollapse = () => {
    withViewTransition(() => setLeftPanelView("hidden"));
  };

  const [allToolsView, setAllToolsView] = useState(false);

  const handleShowAllTools = () => {
    withViewTransition(() => setAllToolsView(true));
  };

  const handleBackToDefault = () => {
    withViewTransition(() => {
      setAllToolsView(false);
      setSearchQuery("");
    });
  };

  // Opening a policy (e.g. from the collapsed rail) lands the rail in the clean
  // default tool-picker view — the only view the policy takeover renders in — so
  // it never collides with an open tool or the all-tools/search view.
  const handleOpenPolicy = () => {
    withViewTransition(() => {
      if (readerMode) setReaderMode(false);
      setLeftPanelView("toolPicker");
      if (!sidebarsVisible) setSidebarsVisible(true);
      setAllToolsView(false);
      setSearchQuery("");
    });
  };

  // The header shows [back] [search] when we have somewhere to go back to —
  // i.e. the user is in a specific tool, or already in the all-tools/search view.
  const inToolView = leftPanelView !== "toolPicker";
  // Show X (close) button only when there's somewhere to go back to.
  const showCloseButton = inToolView || allToolsView;
  // Show search input whenever there's a close button, or when agents are off and
  // we're in the default tool-picker view (search filters the full list inline).
  const showHeaderSearch =
    showCloseButton || (!agentsEnabled && leftPanelView === "toolPicker");

  const handleHeaderBack = () => {
    if (inToolView) {
      withViewTransition(() => handleBackToTools());
    } else {
      handleBackToDefault();
    }
  };

  const handleToolSelectWithTransition = (id: ToolId) => {
    withViewTransition(() => handleToolSelect(id));
  };

  // Typing in the header search while inside a tool exits the tool and lifts the
  // panel into the all-tools view so the user immediately sees search results.
  const handleHeaderSearchChange = (value: string) => {
    if (inToolView) {
      withViewTransition(() => {
        handleBackToTools();
        setAllToolsView(true);
        setSearchQuery(value);
      });
      return;
    }
    setSearchQuery(value);
  };

  const activeTool: ToolRegistryEntry | null =
    inToolView && selectedToolKey
      ? (toolRegistry[selectedToolKey as ToolId] ?? null)
      : null;

  // Agents header + section is hidden when:
  //  - the AI engine is off, or
  //  - the user is in the all-tools view, or
  //  - a specific tool is being rendered (leftPanelView ≠ "toolPicker").
  const showAgents =
    agentsEnabled && !allToolsView && leftPanelView === "toolPicker";

  // Policies section sits above the tool list in the default tool-picker view,
  // mirroring the prototype (and hidden inside a specific tool / all-tools view).
  const showPolicies =
    policiesEnabled && !allToolsView && leftPanelView === "toolPicker";

  // The detail takeover replaces the tool list ONLY in the same default view —
  // never over an open tool or the all-tools view (which must keep priority).
  // A lingering selection is harmless: it stays hidden behind a tool and the
  // list/takeover reappears on return to the picker (as in the prototype).
  const policyDetailActive = rawPolicyDetailActive && showPolicies;

  // The rail widens when a policy detail takes it over — the tool list is fine
  // at 18.5rem, but the policy detail/wizard/settings need more breathing room.
  const expandedWidth = policyDetailActive ? "25rem" : "18.5rem";

  const computedWidth = () => {
    if (isMobile) return "100%";
    if (!isPanelVisible) return "3.5rem";
    return expandedWidth;
  };

  // Collapsed rail: show favourites + recommended tools as icons.
  const favoriteToolItems = useFavoriteToolItems(favoriteTools, toolRegistry);
  const { sections: collapsedSections } = useToolSections(filteredTools);
  const collapsedQuickSection = useMemo(
    () => collapsedSections.find((s) => s.key === "quick"),
    [collapsedSections],
  );
  const collapsedRecommendedItems = useMemo(() => {
    if (!collapsedQuickSection) return [];
    const items: Array<{ id: ToolId; tool: ToolRegistryEntry }> = [];
    collapsedQuickSection.subcategories.forEach((sc: SubcategoryGroup) =>
      sc.tools.forEach((entry) =>
        items.push({ id: entry.id as ToolId, tool: entry.tool }),
      ),
    );
    return items;
  }, [collapsedQuickSection]);
  const collapsedRailItems = useMemo(() => {
    const map = new Map<ToolId, ToolRegistryEntry>();
    favoriteToolItems.forEach(({ id, tool }) => map.set(id, tool));
    collapsedRecommendedItems.forEach(({ id, tool }) => {
      if (!map.has(id)) map.set(id, tool);
    });
    return Array.from(map, ([id, tool]) => ({ id, tool }));
  }, [favoriteToolItems, collapsedRecommendedItems]);

  return (
    <div
      ref={toolPanelRef}
      data-sidebar="tool-panel"
      data-tour={fullscreenExpanded ? undefined : "tool-panel"}
      className={`tool-panel flex flex-col ${fullscreenExpanded ? "tool-panel--fullscreen-active" : "overflow-hidden"} bg-[var(--bg-toolbar)] border-l border-[var(--border-subtle)] transition-all duration-300 ease-out ${
        isRainbowMode ? rainbowStyles.rainbowPaper : ""
      } ${isMobile ? "h-full border-r-0" : "h-screen"} ${fullscreenExpanded ? "tool-panel--fullscreen" : ""}`}
      style={{
        width: computedWidth(),
        padding: "0",
      }}
    >
      {!fullscreenExpanded && !isPanelVisible && !isMobile && (
        <div className="tool-panel__collapsed-strip">
          <div className="tool-panel__collapsed-top">
            <ActionIcon
              variant="outline"
              color="gray.4"
              radius="xl"
              size="md"
              className="tool-panel__expand-btn"
              onClick={handleExpand}
              aria-label={t("toolPanel.expand", "Expand panel")}
            >
              <ChevronLeftIcon sx={{ fontSize: "1.1rem" }} />
            </ActionIcon>
            <AgentsCollapsedButton onExpand={handleExpand} />
          </div>
          <div className="tool-panel__collapsed-divider" />
          <PoliciesCollapsedButton onExpand={handleOpenPolicy} />
          <div className="tool-panel__collapsed-tools">
            {collapsedRailItems.map(({ id, tool }) => (
              <AppTooltip
                key={id}
                content={tool.name}
                position="left"
                arrow
                delay={300}
              >
                <button
                  type="button"
                  className="tool-panel__collapsed-tool-btn"
                  data-selected={selectedToolKey === id}
                  onClick={() => {
                    handleExpand();
                    handleToolSelectWithTransition(id);
                  }}
                  aria-label={tool.name}
                >
                  <ToolIcon icon={tool.icon} marginRight="0" />
                </button>
              </AppTooltip>
            ))}
          </div>
        </div>
      )}

      {!fullscreenExpanded && isPanelVisible && (
        <div
          /* Fixed width matches the expanded panel width so the inner content is
             laid out at its final size from the moment it mounts. The outer
             .tool-panel clips it (overflow-hidden) while it animates from the
             collapsed 3.5rem width — text/icons stay put and just come into view
             instead of jiggling as space becomes available. */
          style={{
            opacity: 1,
            transition: "opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            height: "100%",
            width: isMobile ? "100%" : expandedWidth,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {policyDetailActive ? (
            <div className="pol-takeover">
              <PolicyDetailTakeover />
            </div>
          ) : (
            <>
              <div className="tool-panel__compact-header">
                {activeTool ? (
                  <div
                    className="tool-panel__active-tool-pill"
                    aria-label={activeTool.name}
                  >
                    <span className="tool-panel__active-tool-pill-icon">
                      <ToolIcon
                        icon={activeTool.icon}
                        marginRight="0"
                        color="var(--mantine-color-blue-filled)"
                      />
                    </span>
                    <span className="tool-panel__active-tool-pill-label">
                      {activeTool.name}
                    </span>
                  </div>
                ) : showHeaderSearch ? (
                  <div className="tool-panel__compact-header-search">
                    <ToolSearch
                      value={searchQuery}
                      onChange={handleHeaderSearchChange}
                      toolRegistry={toolRegistry}
                      mode="filter"
                      autoFocus={allToolsView && !inToolView}
                    />
                  </div>
                ) : (
                  showAgents && (
                    <span className="tool-panel__section-label">
                      {t("agents.section_title", "Agents")}
                    </span>
                  )
                )}
                {showCloseButton ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    radius="xl"
                    size="md"
                    onClick={handleHeaderBack}
                    aria-label={
                      inToolView
                        ? t("toolPanel.backToAllTools", "Back to all tools")
                        : t("toolPanel.goBack", "Go back")
                    }
                    className="tool-panel__expand-btn"
                  >
                    <CloseIcon sx={{ fontSize: "1.1rem" }} />
                  </ActionIcon>
                ) : (
                  <ActionIcon
                    variant="outline"
                    radius="xl"
                    size="md"
                    onClick={handleCollapse}
                    aria-label={t("toolPanel.collapse", "Collapse panel")}
                    className="tool-panel__expand-btn"
                  >
                    <ChevronRightIcon sx={{ fontSize: "1.1rem" }} />
                  </ActionIcon>
                )}
              </div>

              {showAgents && <AgentsSection />}

              {showPolicies && <PoliciesSection />}

              <ToolPanel
                allToolsView={allToolsView}
                onShowAllTools={handleShowAllTools}
                onToolSelect={handleToolSelectWithTransition}
                compact={agentsEnabled && !allToolsView}
              />
              <AgentsChatOverlay />
            </>
          )}
        </div>
      )}

      <FullscreenToolPanel geometry={fullscreenGeometry} />
    </div>
  );
}
