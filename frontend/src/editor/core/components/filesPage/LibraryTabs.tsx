import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, type ButtonProps } from "@app/ui/Button";
import type { FilesPageTab } from "@app/contexts/FilesPageContext";

/** Shared view navigation; each host owns its remembered browsing state. */
export function LibraryTabs({
  currentTab,
  onChange,
  onOpenRoot,
  rootDropHandlers,
  sharingEnabled,
  breadcrumbs,
  libraryOnly = false,
}: {
  currentTab: FilesPageTab;
  onChange: (tab: FilesPageTab) => void;
  /** The active library tab returns to root; switching tabs restores the remembered folder. */
  onOpenRoot: () => void;
  rootDropHandlers?: Pick<ButtonProps, "onDragOver" | "onDrop">;
  sharingEnabled: boolean;
  breadcrumbs?: ReactNode;
  libraryOnly?: boolean;
}) {
  const { t } = useTranslation();
  const tabs: { id: FilesPageTab; label: string }[] = [
    { id: "recent", label: t("filesPage.recentFiles", "Recents") },
    { id: "all", label: t("filesPage.allFiles", "Stirling library") },
    ...(sharingEnabled
      ? [
          {
            id: "shared" as const,
            label: t("fileManager.sharedWithYou", "Shared with you"),
          },
        ]
      : []),
  ];
  return (
    <div className="files-page-navigation">
      <nav
        className="files-page-view-tabs"
        aria-label={t("filePicker.sources", "File sources")}
      >
        {tabs
          .filter((tab) => !libraryOnly || tab.id === "all")
          .map((tab) => (
            <Fragment key={tab.id}>
              <Button
                variant={currentTab === tab.id ? "primary" : "tertiary"}
                shape="pill"
                size="sm"
                aria-pressed={currentTab === tab.id}
                onClick={() =>
                  tab.id === "all" && currentTab === "all"
                    ? onOpenRoot()
                    : onChange(tab.id)
                }
                {...(tab.id === "all" ? rootDropHandlers : undefined)}
              >
                {tab.label}
              </Button>
              {tab.id === "all" && currentTab === "all" && breadcrumbs}
            </Fragment>
          ))}
      </nav>
    </div>
  );
}
