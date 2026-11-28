import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { Spinner } from "@editor/ui/Spinner";
import { useCreatePdfMenu } from "@editor/components/createPdf/useCreatePdfMenu";
import { CreatePdfMenuItems } from "@editor/components/createPdf/CreatePdfMenuItems";

export function CreatePdfSidebarRow() {
  const { t } = useTranslation();
  const createPdf = useCreatePdfMenu();
  const busy = createPdf.busyLabel !== null;
  const label = createPdf.busyLabel ?? t("createPdf.button", "Create PDF");
  return (
    <>
      <Menu
        position="right-start"
        withinPortal
        shadow="md"
        width={300}
        disabled={busy}
      >
        <Menu.Target>
          <div
            className="file-sidebar-action-row"
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-busy={busy}
            aria-label={label}
            data-testid="files-page-create-pdf"
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.currentTarget.click();
            }}
          >
            <span className="file-sidebar-action-icon">
              {busy ? <Spinner size="xs" /> : <Icon name="file-plus" />}
            </span>
            <span className="file-sidebar-action-label sidebar-content-fade">
              {label}
            </span>
          </div>
        </Menu.Target>
        <Menu.Dropdown>
          <CreatePdfMenuItems items={createPdf.items} />
        </Menu.Dropdown>
      </Menu>
      {createPdf.dialogs}
    </>
  );
}
