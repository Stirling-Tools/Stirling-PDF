import { useTranslation } from "react-i18next";
import { Avatar, Dropdown } from "@shared/components";
import { useAuth } from "@shared/auth";
import { useTheme } from "@portal/contexts/ThemeContext";
import { useTier, TIER_INFO, type Tier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
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
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="portal-header__icon-btn"
      onClick={toggle}
      aria-label={
        theme === "light"
          ? t("shell.header.switchToDark")
          : t("shell.header.switchToLight")
      }
      title={
        theme === "light"
          ? t("shell.header.darkMode")
          : t("shell.header.lightMode")
      }
    >
      {theme === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </button>
  );
}

function TierSwitcher() {
  const { tier, setTier, isDerived } = useTier();
  const info = TIER_INFO[tier];
  // When mocks are off, the tier is derived from the real link/wallet state —
  // pair the dropdown with the mocks toggle (hidden in prod) so testing real
  // billing flows can't be perturbed by accidentally flipping the mock tier.
  if (isDerived) return null;
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

function UserMenu() {
  const { t } = useTranslation();
  const { displayName, signOut } = useAuth();
  const name = displayName ?? t("shell.header.accountFallback", "Account");
  return (
    <Dropdown.Root align="end">
      <Dropdown.Trigger>
        <button
          type="button"
          className="portal-header__user"
          aria-label={t("shell.header.accountMenu", "Account menu")}
          title={name}
        >
          <Avatar name={name} size="md" tone="blue" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Menu width="12rem">
        <Dropdown.Item disabled>{name}</Dropdown.Item>
        <Dropdown.Item onSelect={() => void signOut()}>
          {t("shell.header.signOut", "Sign out")}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}

export function Header() {
  const { activeView } = useView();
  const { openSearch } = useUI();
  const { t } = useTranslation();
  return (
    <header className="portal-header">
      <div className="portal-header__left">
        <span className="portal-header__breadcrumb">
          {t(`nav.${activeView}`)}
        </span>
      </div>

      <button
        type="button"
        className="portal-header__search"
        aria-label={t("shell.header.search")}
        onClick={openSearch}
      >
        <SearchIcon size={14} />
        <span className="portal-header__search-placeholder">
          {t("shell.header.searchPlaceholder")}
        </span>
        <span className="portal-header__search-kbd" aria-hidden>
          ⌘K
        </span>
      </button>

      <div className="portal-header__right">
        <MocksToggle />
        <ThemeToggle />
        <NotificationsDropdown />
        <TierSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
