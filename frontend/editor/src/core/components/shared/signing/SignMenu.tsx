import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown, type DropdownTriggerProps } from "@app/ui/Dropdown";
import { Icon } from "@app/ui/Icon";
import { Tabs } from "@app/ui/Tabs";
import { Tooltip } from "@app/ui/Tooltip";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import type { ToolId } from "@app/types/toolId";
import type { SigningIntent } from "@app/utils/pendingSigningIntent";
import type { SigningMenuItem } from "@app/utils/signingItems";
import "@app/components/shared/signing/signing.css";

interface SignMenuProps {
  children: DropdownTriggerProps["children"];
  opened: boolean;
  onClose: () => void;
  onSelect: (tool: ToolId) => void;
  onOpenSigning: (intent: SigningIntent) => void;
  reasons: QuickNavToolReasons;
  items: SigningMenuItem[];
}

type SessionTab = "attention" | "active" | "closed";

/** The global rail cannot depend on either app's file, authentication or Mantine providers. */
export function SignMenu({
  children,
  opened,
  onClose,
  onSelect,
  onOpenSigning,
  reasons,
  items,
}: SignMenuProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SessionTab>("attention");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (opened) {
      setTab("attention");
      setQuery("");
    }
  }, [opened]);

  const attentionCount = items.filter((item) => item.action !== null).length;
  const actionLabels = {
    sign: t("signMenu.actionSign", "Sign document"),
    review: t("signMenu.actionReview", "Review new signatures"),
    finalize: t("signMenu.actionFinalize", "Finalize document"),
  };
  const tabs = [
    {
      key: "attention" as const,
      label: t("signMenu.needsAction", "Needs action"),
      count: attentionCount,
    },
    {
      key: "active" as const,
      label: t("certSign.collab.sessionList.active", "Active"),
    },
    { key: "closed" as const, label: t("signMenu.closedTab", "Closed") },
  ];
  const rows = items.filter((item) => {
    const closed =
      item.finalized ||
      (item.kind === "request" && item.myStatus === "DECLINED");
    const inTab =
      tab === "attention"
        ? item.action !== null
        : tab === "closed"
          ? closed
          : !closed;
    const searchable = `${item.documentName} ${item.kind === "request" ? item.ownerUsername : t("signWorkspace.createdByMe", "Created by me")}`;
    return (
      inTab &&
      searchable.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    );
  });
  const openSigning = (intent: SigningIntent) => {
    onClose();
    onOpenSigning(intent);
  };
  const selectTool = (tool: ToolId) => {
    onClose();
    onSelect(tool);
  };

  return (
    <Dropdown.Root
      open={opened}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      align="start"
    >
      <Dropdown.Trigger popupRole="dialog">{children}</Dropdown.Trigger>
      <Dropdown.Menu
        className={`sign-menu${reasons.sharedSign ? " sign-menu--unavailable" : ""}`}
        width="min(400px, calc(100vw - 24px))"
        autoFocus
        role="dialog"
        ariaLabel={t("signMenu.title", "Sign")}
        placement="side"
      >
        <section
          className="sign-menu__personal"
          aria-label={t("signWorkspace.personalHeading", "Sign a document")}
        >
          <h2>{t("signWorkspace.personalHeading", "Sign a document")}</h2>
          <div className="sign-menu__tools">
            <button
              type="button"
              className="sign-menu__tool"
              disabled={Boolean(reasons.sign)}
              onClick={() => selectTool("sign")}
              title={reasons.sign}
            >
              <Icon name="pen-tool" size={20} />
              <strong>
                {t("signMenu.personalTitle", "Personal signature")}
              </strong>
              <span>{t("signMenu.personalHint", "Draw, type or upload")}</span>
            </button>
            <button
              type="button"
              className="sign-menu__tool"
              disabled={Boolean(reasons.certSign)}
              onClick={() => selectTool("certSign")}
              title={reasons.certSign}
            >
              <Icon name="shield-check" size={20} />
              <strong>
                {t("signMenu.certificateTitle", "Digital signature")}
              </strong>
              <span>{t("signMenu.certificateHint", "Use a certificate")}</span>
            </button>
          </div>
          {(reasons.sign || reasons.certSign) && (
            <p className="sign-menu__hint">
              {[
                ...new Set([reasons.sign, reasons.certSign].filter(Boolean)),
              ].join(" · ")}
            </p>
          )}
        </section>
        <section
          className="sign-menu__sessions"
          aria-label={t("signMenu.sessions", "Signing sessions")}
        >
          <div className="sign-menu__session-header">
            <div className="sign-menu__heading">
              <h2>{t("signMenu.sessions", "Signing sessions")}</h2>
              <Tooltip
                content={t("signWorkspace.expand", "Expand signing sessions")}
              >
                <button
                  type="button"
                  className="sign-menu__icon-button"
                  aria-label={t(
                    "signWorkspace.expand",
                    "Expand signing sessions",
                  )}
                  disabled={Boolean(reasons.sharedSign)}
                  onClick={() => openSigning("list")}
                >
                  <Icon name="maximize-2" size={18} />
                </button>
              </Tooltip>
            </div>
            <button
              type="button"
              className="sign-menu__request"
              disabled={Boolean(reasons.sharedSign)}
              onClick={() => openSigning("create")}
            >
              <Icon name="plus" size={18} />
              {t("signMenu.request", "Request signatures")}
            </button>
          </div>
          {reasons.sharedSign ? (
            <p className="sign-menu__hint">{reasons.sharedSign}</p>
          ) : (
            <>
              <div className="sign-menu__filters">
                <Tabs
                  items={tabs}
                  activeKey={tab}
                  onChange={setTab}
                  variant="underline"
                  ariaLabel={t("signMenu.sessionFilter", "Session views")}
                  className="sign-menu__tabs"
                />
                <div className="sign-menu__search">
                  <Icon name="search" size={16} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder={t(
                      "signMenu.search",
                      "Find a document or person",
                    )}
                    aria-label={t(
                      "signMenu.search",
                      "Find a document or person",
                    )}
                  />
                </div>
                {tab === "attention" && (
                  <p className="sign-menu__hint">
                    {t(
                      "signMenu.attentionHelp",
                      "The badge counts documents to sign, review or finalize.",
                    )}
                  </p>
                )}
              </div>
              <div
                key={tab}
                className="sign-menu__results"
                tabIndex={0}
                role="region"
                aria-label={tabs.find((item) => item.key === tab)?.label}
              >
                {rows.length > 0 ? (
                  <ul className="sign-menu__list">
                    {rows.map((item) => {
                      const state = item.action
                        ? actionLabels[item.action]
                        : item.finalized
                          ? t("certSign.finalized", "Finalized")
                          : item.kind === "session"
                            ? t(
                                "certSign.awaitingSignatures",
                                "Awaiting signatures",
                              )
                            : item.myStatus === "DECLINED"
                              ? t("certSign.declined", "Declined")
                              : t(
                                  "signMenu.submitted",
                                  "Submitted · awaiting finalization",
                                );
                      return (
                        <li key={`${item.kind}-${item.sessionId}`}>
                          <button
                            type="button"
                            className="sign-menu__session"
                            data-action={Boolean(item.action)}
                            onClick={() =>
                              openSigning({
                                kind: item.kind,
                                sessionId: item.sessionId,
                              })
                            }
                          >
                            <span className="sign-menu__session-icon">
                              <Icon
                                name={
                                  item.action === "sign"
                                    ? "pen-tool"
                                    : item.action === "finalize"
                                      ? "circle-check"
                                      : item.kind === "session"
                                        ? "users"
                                        : "file-text"
                                }
                                size={19}
                              />
                            </span>
                            <span className="sign-menu__session-copy">
                              <span
                                className="sign-menu__document"
                                title={item.documentName}
                              >
                                {item.documentName}
                              </span>
                              <span className="sign-menu__state">{state}</span>
                              <span className="sign-menu__meta">
                                {item.kind === "request"
                                  ? `${t("certSign.collab.signRequest.from", "From")}: ${item.ownerUsername}`
                                  : t(
                                      "signMenu.ownerProgress",
                                      "Your request · {{signed}} / {{total}} signed",
                                      {
                                        signed: item.signedCount,
                                        total: item.participantCount,
                                      },
                                    )}
                              </span>
                            </span>
                            <Icon name="chevron-right" size={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="sign-menu__empty" role="status">
                    <Icon
                      name={
                        tab === "attention" && !query
                          ? "circle-check"
                          : "search"
                      }
                      size={24}
                    />
                    <strong>
                      {query
                        ? t("signMenu.noMatches", "No matching sessions")
                        : tab === "attention"
                          ? t("signMenu.caughtUp", "You're all caught up")
                          : tab === "closed"
                            ? t("signMenu.noClosed", "No closed sessions")
                            : t("signMenu.noActive", "No active sessions")}
                    </strong>
                    {!query && tab === "attention" && (
                      <span>
                        {t(
                          "signMenu.caughtUpHint",
                          "Follow ongoing requests in Active, or start a new one.",
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
