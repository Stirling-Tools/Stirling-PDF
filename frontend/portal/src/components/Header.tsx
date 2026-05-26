import { Avatar, Dropdown } from "@shared/components";
import { useTheme } from "@app/contexts/ThemeContext";
import { useTier, TIER_INFO, type Tier } from "@app/contexts/TierContext";
import { useView, VIEW_LABELS } from "@app/contexts/ViewContext";
import { useUI } from "@app/contexts/UIContext";
import {
  SearchIcon,
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
} from "@app/components/icons";
import { NotificationsDropdown } from "@app/components/NotificationsDropdown";
import { MocksToggle } from "@app/components/MocksToggle";
import "@app/components/Header.css";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="portal-header__icon-btn"
      onClick={toggle}
      aria-label={
        theme === "light" ? "Switch to dark theme" : "Switch to light theme"
      }
      title={theme === "light" ? "Dark mode" : "Light mode"}
    >
      {theme === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </button>
  );
}

function TierSwitcher() {
  const { tier, setTier } = useTier();
  const info = TIER_INFO[tier];
  return (
    <Dropdown.Root align="end">
      <Dropdown.Trigger>
        <button type="button" className="portal-header__tier-btn">
          <span
            className="portal-header__tier-dot"
            style={{ background: info.dotColor }}
            aria-hidden
          />
          <span className="portal-header__tier-label">{info.label}</span>
          <ChevronDownIcon size={14} />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Menu width="12rem">
        {(Object.keys(TIER_INFO) as Tier[]).map((id) => (
          <Dropdown.Item
            key={id}
            active={tier === id}
            onSelect={() => setTier(id)}
            leading={
              <span
                className="portal-header__tier-dot"
                style={{ background: TIER_INFO[id].dotColor }}
                aria-hidden
              />
            }
          >
            {TIER_INFO[id].label}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}

export function Header() {
  const { activeView } = useView();
  const { openSearch } = useUI();
  return (
    <header className="portal-header">
      <div className="portal-header__left">
        <span className="portal-header__breadcrumb">
          {VIEW_LABELS[activeView]}
        </span>
      </div>

      <button
        type="button"
        className="portal-header__search"
        aria-label="Search"
        onClick={openSearch}
      >
        <SearchIcon size={14} />
        <span className="portal-header__search-placeholder">Search…</span>
        <span className="portal-header__search-kbd" aria-hidden>
          ⌘K
        </span>
      </button>

      <div className="portal-header__right">
        <MocksToggle />
        <ThemeToggle />
        <NotificationsDropdown />
        <TierSwitcher />
        <Avatar name="Reece" size="md" tone="blue" onClick={() => {}} />
      </div>
    </header>
  );
}
