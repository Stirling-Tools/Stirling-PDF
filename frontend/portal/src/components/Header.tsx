import { Avatar, Button, Dropdown } from "@shared/components";
import { useTheme } from "@portal/contexts/ThemeContext";
import { useTier, TIER_INFO, type Tier } from "@portal/contexts/TierContext";
import { useView, VIEW_LABELS } from "@portal/contexts/ViewContext";
import { useUI } from "@portal/contexts/UIContext";
import {
  SearchIcon,
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
} from "@portal/components/icons";
import { NotificationsDropdown } from "@portal/components/NotificationsDropdown";
import { MocksToggle } from "@portal/components/MocksToggle";
import "@portal/components/Header.css";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      className="portal-header__icon-btn"
      onClick={toggle}
      aria-label={
        theme === "light" ? "Switch to dark theme" : "Switch to light theme"
      }
      title={theme === "light" ? "Dark mode" : "Light mode"}
      leftSection={
        theme === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />
      }
    />
  );
}

function TierSwitcher() {
  const { tier, setTier } = useTier();
  const info = TIER_INFO[tier];
  return (
    <Dropdown.Root align="end">
      <Dropdown.Trigger>
        <Button
          variant="ghost"
          size="sm"
          className="portal-header__tier-btn"
          leftSection={
            <span
              className="portal-header__tier-dot"
              style={{ background: info.dotColor }}
              aria-hidden
            />
          }
          rightSection={<ChevronDownIcon size={14} />}
        >
          <span className="portal-header__tier-label">{info.label}</span>
        </Button>
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

      <Button
        variant="ghost"
        className="portal-header__search"
        aria-label="Search"
        onClick={openSearch}
      >
        <SearchIcon size={14} />
        <span className="portal-header__search-placeholder">Search…</span>
        <span className="portal-header__search-kbd" aria-hidden>
          ⌘K
        </span>
      </Button>

      <div className="portal-header__right">
        <MocksToggle />
        <ThemeToggle />
        <NotificationsDropdown />
        <TierSwitcher />
        <Avatar name="Reece" size="md" tone="blue" />
      </div>
    </header>
  );
}
