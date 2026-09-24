import { useState } from "react";
import { Popover } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import BulkSelectionPanel from "@app/components/shared/pageSelection/BulkSelectionPanel";
import { parseSelection } from "@app/utils/bulkselection/parseSelection";

export interface SelectByNumberPopoverProps {
  label: string;
  /** Pages the typed numbers can address, numbered as the user sees them. */
  pages: { id: string; pageNumber: number }[];
  /** Highest page number the selection syntax resolves against. */
  maxPages: number;
  selectedPageIds: string[];
  /** Receives the 1-based page numbers the typed selection resolves to. */
  onSelect: (pageNumbers: number[]) => void;
  disabled?: boolean;
  iconSize: string;
  className?: string;
  actionSize?: "sm" | "md";
}

/** A button opening the "1,3,5-10" page selection panel. */
export function SelectByNumberPopover({
  label,
  pages,
  maxPages,
  selectedPageIds,
  onSelect,
  disabled = false,
  iconSize,
  className,
  actionSize,
}: SelectByNumberPopoverProps) {
  const [csvInput, setCsvInput] = useState("");

  const applyInput = (override?: string) => {
    if (maxPages === 0) return;
    onSelect(parseSelection(override ?? csvInput, maxPages));
  };

  return (
    <Popover position="bottom" withArrow shadow="md" offset={8}>
      <Popover.Target>
        <div style={{ display: "inline-flex" }}>
          <Tooltip content={label} position="bottom">
            <ActionIcon
              variant="quiet"
              size={actionSize}
              className={className}
              disabled={disabled || maxPages === 0}
              aria-label={label}
            >
              <Icon name="file-digit" size={iconSize} />
            </ActionIcon>
          </Tooltip>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        {/* Portalled, but still a React child of a draggable track header:
            its pointer events must not reach the header's drag handle. */}
        <div
          style={{ minWidth: "24rem", maxWidth: "32rem" }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <BulkSelectionPanel
            csvInput={csvInput}
            setCsvInput={setCsvInput}
            selectedPageIds={selectedPageIds}
            displayDocument={{ pages }}
            onUpdatePagesFromCSV={applyInput}
          />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
