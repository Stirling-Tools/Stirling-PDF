import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Tabs } from "@app/ui/Tabs";
import { Tooltip } from "@app/ui/Tooltip";
import type { SigningIntent } from "@app/utils/pendingSigningIntent";
import type { SigningMenuItem } from "@app/utils/signingItems";
import { SigningSessionRow } from "@app/components/shared/signing/SigningSessionRow";
import type {
  SessionTab,
  SignMenuSessions,
} from "@app/components/shared/signing/useSignMenuSessions";

interface SessionsHeaderProps {
  disabled: boolean;
  onOpenSigning: (intent: SigningIntent) => void;
}

function SessionsHeader({ disabled, onOpenSigning }: SessionsHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="sign-menu__session-header">
      <div className="sign-menu__heading">
        <h2>{t("signMenu.sessions", "Signing sessions")}</h2>
        <Tooltip content={t("signWorkspace.expand", "Expand signing sessions")}>
          <button
            type="button"
            className="sign-menu__icon-button"
            aria-label={t("signWorkspace.expand", "Expand signing sessions")}
            disabled={disabled}
            onClick={() => onOpenSigning("list")}
          >
            <Icon name="maximize-2" size={18} />
          </button>
        </Tooltip>
      </div>
      <button
        type="button"
        className="sign-menu__request"
        disabled={disabled}
        onClick={() => onOpenSigning("create")}
      >
        <Icon name="plus" size={18} />
        {t("signMenu.request", "Request signatures")}
      </button>
    </div>
  );
}

function SessionFilters({ sessions }: { sessions: SignMenuSessions }) {
  const { t } = useTranslation();
  const searchLabel = t("signMenu.search", "Find a document or person");
  return (
    <div className="sign-menu__filters">
      <Tabs
        items={sessions.tabs}
        activeKey={sessions.tab}
        onChange={sessions.setTab}
        variant="underline"
        ariaLabel={t("signMenu.sessionFilter", "Session views")}
        className="sign-menu__tabs"
      />
      <div className="sign-menu__search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={sessions.query}
          onChange={(event) => sessions.setQuery(event.currentTarget.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
        />
      </div>
    </div>
  );
}

function EmptySessions({ query, tab }: { query: string; tab: SessionTab }) {
  const { t } = useTranslation();
  const emptyByTab: Record<SessionTab, string> = {
    active: t("signMenu.noActive", "No active sessions"),
    unread: t("signMenu.noUnread", "You're all caught up"),
    closed: t("signMenu.noCompleted", "No completed sessions"),
  };
  return (
    <div className="sign-menu__empty" role="status">
      <Icon name="search" size={24} />
      <strong>
        {query
          ? t("signMenu.noMatches", "No matching sessions")
          : emptyByTab[tab]}
      </strong>
    </div>
  );
}

interface SessionResultsProps {
  sessions: SignMenuSessions;
  onOpenSigning: (intent: SigningIntent) => void;
}

function SessionResults({ sessions, onOpenSigning }: SessionResultsProps) {
  const { tab, tabs, rows, query } = sessions;
  return (
    <div
      key={tab}
      className="sign-menu__results"
      tabIndex={0}
      role="region"
      aria-label={tabs.find((item) => item.key === tab)?.label}
    >
      {rows.length > 0 ? (
        <SessionList rows={rows} onOpenSigning={onOpenSigning} />
      ) : (
        <EmptySessions query={query} tab={tab} />
      )}
    </div>
  );
}

interface SessionListProps {
  rows: SigningMenuItem[];
  onOpenSigning: (intent: SigningIntent) => void;
}

function SessionList({ rows, onOpenSigning }: SessionListProps) {
  return (
    <ul className="sign-menu__list">
      {rows.map((item) => (
        <SigningSessionRow
          key={`${item.kind}-${item.sessionId}`}
          item={item}
          onOpenSigning={onOpenSigning}
        />
      ))}
    </ul>
  );
}

interface SignMenuSessionsSectionProps {
  sessions: SignMenuSessions;
  unavailableReason?: string;
  onOpenSigning: (intent: SigningIntent) => void;
}

export function SignMenuSessionsSection({
  sessions,
  unavailableReason,
  onOpenSigning,
}: SignMenuSessionsSectionProps) {
  const { t } = useTranslation();
  return (
    <section
      className="sign-menu__sessions"
      aria-label={t("signMenu.sessions", "Signing sessions")}
    >
      <SessionsHeader
        disabled={Boolean(unavailableReason)}
        onOpenSigning={onOpenSigning}
      />
      {unavailableReason ? (
        <p className="sign-menu__hint">{unavailableReason}</p>
      ) : (
        <>
          <SessionFilters sessions={sessions} />
          <SessionResults sessions={sessions} onOpenSigning={onOpenSigning} />
        </>
      )}
    </section>
  );
}
