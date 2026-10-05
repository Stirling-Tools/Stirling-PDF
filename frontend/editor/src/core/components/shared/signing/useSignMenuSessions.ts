import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isSigningItemClosed,
  canReceiveSigningActivity,
  type SigningMenuItem,
} from "@app/utils/signingItems";

export type SessionTab = "active" | "unread" | "closed";

function hasUnreadActivity(item: SigningMenuItem): boolean {
  return item.unread && canReceiveSigningActivity(item);
}

function isInTab(item: SigningMenuItem, tab: SessionTab): boolean {
  if (tab === "unread") return hasUnreadActivity(item);
  return isSigningItemClosed(item) === (tab === "closed");
}

/** Tab and search state for the Sign popover, reset each time it opens. */
export function useSignMenuSessions(items: SigningMenuItem[], opened: boolean) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SessionTab>("active");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (opened) {
      setTab("active");
      setQuery("");
    }
  }, [opened]);

  const tabs = [
    {
      key: "active" as const,
      label: t("certSign.collab.sessionList.active", "Active"),
    },
    {
      key: "unread" as const,
      label: t("signMenu.unreadTab", "Unread"),
      count: items.filter(hasUnreadActivity).length,
    },
    { key: "closed" as const, label: t("signMenu.completedTab", "Completed") },
  ];
  const needle = query.trim().toLocaleLowerCase();
  const rows = items.filter((item) => {
    const searchable = `${item.documentName} ${item.kind === "request" ? item.ownerUsername : t("signWorkspace.createdByMe", "Created by me")}`;
    return (
      isInTab(item, tab) && searchable.toLocaleLowerCase().includes(needle)
    );
  });

  return { tab, setTab, query, setQuery, tabs, rows };
}

export type SignMenuSessions = ReturnType<typeof useSignMenuSessions>;
