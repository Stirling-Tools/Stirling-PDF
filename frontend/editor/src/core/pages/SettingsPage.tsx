import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { useSectionHeadings } from "@app/components/settings/useSectionHeadings";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Badge, Tooltip } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SettingsMobileBackButton } from "@app/components/shared/config/SettingsMobileBackButton";
import { SettingsNavChevron } from "@app/components/shared/config/SettingsNavChevron";
import { useSettingsNav } from "@app/components/settings/useSettingsNav";
import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import { useEditorSearchScopes } from "@app/hooks/useSuperSearch";
import type { NavKey } from "@app/components/shared/config/types";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useLicenseAlert } from "@app/hooks/useLicenseAlert";
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
} from "@app/contexts/UnsavedChangesContext";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import { useOtherAppSwitch } from "@app/hooks/useOtherAppSwitch";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { stripBasePath } from "@app/constants/app";
import { takeSettingsOrigin } from "@app/utils/settingsNavigation";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import "@app/components/shared/config/settingsSections.css";
import "@app/pages/SettingsPage.css";

const COLLAPSED_GROUPS_KEY = "stirling.settingsCollapsedGroups";

/** Which sidebar groups the user folded or unfolded, by group id. */
function readCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeCollapsedGroups(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: the fold state just does not survive a reload.
  }
}

/** `/settings/people` -> "people". Null for `/settings` itself. */
function sectionFromPath(pathname: string): string | null {
  const match = stripBasePath(pathname).match(/\/settings\/([^/?#]+)/);
  return match?.[1] ?? null;
}

const SettingsPageInner: React.FC = () => {
  const { t } = useTranslation();
  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const licenseAlert = useLicenseAlert();
  const { confirmIfDirty } = useUnsavedChanges();
  // The rail sits outside every app, so each page tells it what only the
  // signed-in session knows.
  const otherApp = useOtherAppSwitch();
  // The same bar as the editor and the processor, so search is one thing
  // everywhere; settings results deep-link straight back into this page.
  const searchScopes = useEditorSearchScopes();
  const [mobilePane, setMobilePane] = useState<"nav" | "content">(() =>
    sectionFromPath(window.location.pathname) ? "content" : "nav",
  );
  const [collapsed, setCollapsed] =
    useState<Record<string, boolean>>(readCollapsedGroups);
  const toggleGroup = useCallback((groupId: string, fold: boolean) => {
    setCollapsed((prev) => {
      const next = { ...prev, [groupId]: fold };
      writeCollapsedGroups(next);
      return next;
    });
  }, []);

  // Leaving restores where the user came from (the editor, the processor,
  // wherever) by replacement, or the editor for a deep link with no origin.
  const leave = useCallback(() => {
    navigate(takeSettingsOrigin() ?? EDITOR_BASENAME, { replace: true });
  }, [navigate]);

  const { sections, overlay, aliases } = useSettingsNav(leave);
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const urlSection = sectionFromPath(location.pathname);
  const activeItem = useMemo(
    () => items.find((i) => i.key === urlSection) ?? null,
    [items, urlSection],
  );
  const activeGroup = useMemo(
    () =>
      sections.find((s) => s.items.some((i) => i.key === activeItem?.key))
        ?.title,
    [sections, activeItem],
  );

  // The URL always names what is shown. `/settings` and an unknown key land on
  // the first section; a retired key (an old bookmark, an older search result)
  // follows its alias to whatever replaced it.
  useEffect(() => {
    if (items.length === 0 || activeItem) return;
    const target =
      (urlSection && aliases?.[urlSection]) ??
      items.find((i) => !i.disabled)?.key ??
      items[0].key;
    navigate(`/settings/${target}${location.search}`, { replace: true });
  }, [items, activeItem, urlSection, aliases, location.search, navigate]);

  // Replace, not push: Back should leave settings, not walk the tabs you opened.
  const switchSection = useCallback(
    (key: NavKey) => {
      navigate(`/settings/${key}`, { replace: true });
    },
    [navigate],
  );

  const handleNavigation = useCallback(
    async (key: NavKey) => {
      if (!(await confirmIfDirty())) return;
      switchSection(key);
      setMobilePane("content");
    },
    [confirmIfDirty, switchSection],
  );

  const handleMobileBack = useCallback(async () => {
    if (!(await confirmIfDirty())) return;
    setMobilePane("nav");
  }, [confirmIfDirty]);

  // The rail sits beside the page, so its entries are exits too.
  const requestNavigation = useCallback(
    (go: () => void) => {
      void confirmIfDirty().then((ok) => {
        if (ok) go();
      });
    },
    [confirmIfDirty],
  );

  const handleLeave = useCallback(
    () => requestNavigation(leave),
    [requestNavigation, leave],
  );

  // Sections dispatch `appConfig:navigate` to send the user to a sibling tab.
  useEffect(() => {
    const handler = (ev: Event) => {
      const key = (ev as CustomEvent<{ key?: NavKey }>).detail?.key;
      if (key) switchSection(key);
    };
    window.addEventListener("appConfig:navigate", handler as EventListener);
    return () =>
      window.removeEventListener(
        "appConfig:navigate",
        handler as EventListener,
      );
  }, [switchSection]);

  // Deep link: /settings/{section}?focus={anchor} scrolls to and briefly
  // highlights one control (the global super search jumps straight to a row).
  useEffect(() => {
    const focus = new URLSearchParams(location.search).get("focus");
    if (!focus) return;
    let raf = 0;
    const timer = window.setTimeout(() => {
      raf = window.requestAnimationFrame(() => {
        const el = document.getElementById(focus);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("settings-focus-target");
        window.setTimeout(
          () => el.classList.remove("settings-focus-target"),
          1800,
        );
      });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [activeItem, location.search]);

  // Sections that bring their own page header get the whole pane; on mobile the
  // bar stays anyway, because it carries the only way back to the list.
  const fullBleed = activeItem?.fullBleed ?? false;
  const headings = useSectionHeadings(activeItem?.key, contentRef);

  return (
    <div className="settings-page" data-tour="settings-modal">
      <QuickNavHostBridge
        portalAccess={Boolean(otherApp)}
        requestNavigation={requestNavigation}
      />

      <aside
        className={`settings-page__nav modal-nav ${isMobile ? "mobile" : ""}`}
        style={
          isMobile && mobilePane !== "nav" ? { display: "none" } : undefined
        }
        aria-label={t("settings.title", "Settings")}
      >
        <div className="settings-page__nav-head">
          {/* The page's own exit: the rail's app entries only ship with the portal. */}
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            onClick={handleLeave}
            data-testid="settings-back"
            aria-label={t("common.back", "Back")}
          >
            <LocalIcon icon="arrow-back" width={20} height={20} />
          </ActionIcon>
          <span className="settings-page__nav-title">
            {t("settings.title", "Settings")}
          </span>
        </div>

        <div className="modal-nav-scroll">
          {sections.map((section) => {
            const groupId = section.id ?? section.title;
            // The group you are in never hides its own row, whatever was remembered.
            const holdsActive = section.items.some(
              (i) => i.key === activeItem?.key,
            );
            const open =
              holdsActive ||
              !(collapsed[groupId] ?? section.collapsedByDefault ?? false);
            // A header that toggles a single row costs a line and a click to
            // show what it already named; the row stands on its own instead.
            const solo = section.items.length === 1;
            return (
              <div key={groupId} className="modal-nav-section">
                {!solo && (
                  <button
                    type="button"
                    className="settings-page__group"
                    aria-expanded={open}
                    aria-controls={`settings-group-${groupId}`}
                    onClick={() => toggleGroup(groupId, open)}
                  >
                    <span>{section.title}</span>
                    <LocalIcon
                      icon="expand-more-rounded"
                      width={16}
                      height={16}
                      className="settings-page__group-chevron"
                    />
                  </button>
                )}
                {(solo || open) && (
                  <div
                    id={`settings-group-${groupId}`}
                    className="modal-nav-section-items"
                  >
                    {section.items.map((item) => {
                      const isActive = activeItem?.key === item.key;
                      const isDisabled = item.disabled ?? false;
                      const showPlanWarning =
                        item.key === "adminPlan" &&
                        licenseAlert.active &&
                        licenseAlert.audience === "admin";
                      const row = (
                        <button
                          type="button"
                          onClick={() => {
                            if (!isDisabled) void handleNavigation(item.key);
                          }}
                          className={`modal-nav-item ${isActive ? "active" : ""} ${isMobile ? "mobile" : ""}`}
                          data-tour={`admin-${item.key}-nav`}
                          aria-current={isActive ? "page" : undefined}
                          // Not `disabled`: it stays focusable, so the tooltip
                          // saying why it is off is reachable by keyboard.
                          aria-disabled={isDisabled || undefined}
                        >
                          <LocalIcon
                            icon={item.icon}
                            width={18}
                            height={18}
                            className="settings-page__nav-icon"
                          />
                          <span className="settings-page__nav-label">
                            {item.label}
                          </span>
                          {item.badge && (
                            <Badge
                              size="xs"
                              variant="light"
                              color={item.badgeColor ?? "orange"}
                              className="modal-nav-item-badge"
                            >
                              {item.badge}
                            </Badge>
                          )}
                          {showPlanWarning && (
                            <LocalIcon
                              icon="warning-rounded"
                              width={14}
                              height={14}
                              className="settings-page__nav-warning"
                            />
                          )}
                          <SettingsNavChevron show={isMobile} />
                        </button>
                      );
                      return isDisabled && item.disabledTooltip ? (
                        <Tooltip
                          key={item.key}
                          label={item.disabledTooltip}
                          position="right"
                          withArrow
                          zIndex={Z_INDEX_OVER_CONFIG_MODAL}
                        >
                          {row}
                        </Tooltip>
                      ) : (
                        <React.Fragment key={item.key}>
                          {row}
                          {isActive && headings.length > 1 && (
                            <ul className="settings-page__subnav">
                              {headings.map((h) => (
                                <li key={h.id}>
                                  <button
                                    type="button"
                                    className="settings-page__subnav-item"
                                    onClick={() =>
                                      document
                                        .getElementById(h.id)
                                        ?.scrollIntoView({
                                          behavior: "smooth",
                                          block: "start",
                                        })
                                    }
                                  >
                                    {h.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div
        className="settings-page__main modal-content"
        data-tour="settings-content-area"
        style={
          isMobile && mobilePane !== "content" ? { display: "none" } : undefined
        }
      >
        <div className="settings-page__search-bar">
          <SuperSearch
            inputId="settings-search-input"
            scopes={searchScopes}
            dropdownClassName="settings-search-dropdown"
          />
        </div>
        <div className="modal-content-scroll" ref={setContentRef}>
          {isMobile && (
            <div className="settings-page__mobile-bar modal-header">
              <SettingsMobileBackButton
                show
                onClick={() => void handleMobileBack()}
              />
              <span className="settings-page__mobile-bar-title">
                {activeGroup}
              </span>
            </div>
          )}
          <div className={`modal-body${fullBleed ? " is-full-bleed" : ""}`}>
            {activeItem && !fullBleed && (
              <header className="settings-page__header">
                {activeGroup && (
                  <span className="settings-page__eyebrow">{activeGroup}</span>
                )}
                <div className="settings-page__title-row">
                  <h1 className="settings-page__title">{activeItem.label}</h1>
                  {activeItem.description && (
                    <InfoTooltip
                      label={activeItem.description}
                      position="right"
                    />
                  )}
                </div>
              </header>
            )}
            {/* Its own boundary: a section that suspends must not take the
                nav and the header down with it. */}
            <Suspense fallback={<LoadingFallback />}>
              {activeItem?.component}
            </Suspense>
          </div>
        </div>
      </div>

      {overlay}
    </div>
  );
};

/** Full-page settings: account, preferences and every server setting. */
export default function SettingsPage() {
  return (
    <UnsavedChangesProvider>
      <SettingsPageInner />
    </UnsavedChangesProvider>
  );
}
