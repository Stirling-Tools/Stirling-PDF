import { Popover } from "@mantine/core";
import { ActionIcon } from "@editor/ui/ActionIcon";
import LocalIcon from "@editor/components/shared/LocalIcon";
import { Tooltip } from "@editor/components/shared/Tooltip";
import BulkSelectionPanel from "@editor/components/pageEditor/BulkSelectionPanel";

interface PageSelectByNumberButtonProps {
  disabled: boolean;
  totalPages: number;
  label: string;
  csvInput: string;
  setCsvInput: (value: string) => void;
  selectedPageIds: string[];
  displayDocument?: { pages: { id: string; pageNumber: number }[] };
  updatePagesFromCSV: (override?: string) => void;
}

export default function PageSelectByNumberButton({
  disabled,
  totalPages,
  label,
  csvInput,
  setCsvInput,
  selectedPageIds,
  displayDocument,
  updatePagesFromCSV,
}: PageSelectByNumberButtonProps) {
  return (
    <Tooltip
      content={label}
      position="bottom"
      offset={12}
      arrow
      portalTarget={document.body}
    >
      <div>
        <Popover position="left" withArrow shadow="md" offset={8}>
          <Popover.Target>
            <div style={{ display: "inline-flex" }}>
              <ActionIcon
                variant="tertiary"
                disabled={disabled || totalPages === 0}
                aria-label={label}
              >
                <LocalIcon icon="pin-end" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <div style={{ minWidth: "24rem", maxWidth: "32rem" }}>
              <BulkSelectionPanel
                csvInput={csvInput}
                setCsvInput={setCsvInput}
                selectedPageIds={selectedPageIds}
                displayDocument={displayDocument}
                onUpdatePagesFromCSV={updatePagesFromCSV}
              />
            </div>
          </Popover.Dropdown>
        </Popover>
      </div>
    </Tooltip>
  );
}
