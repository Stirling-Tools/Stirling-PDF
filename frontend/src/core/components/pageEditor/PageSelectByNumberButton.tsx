import { ActionIcon, Popover } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import BulkSelectionPanel from '@app/components/pageEditor/BulkSelectionPanel';

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
    <Tooltip content={label} position="left" offset={12} arrow portalTarget={document.body}>
      <div className={`right-rail-fade enter`}>
        <Popover position="left" withArrow shadow="md" offset={8}>
          <Popover.Target>
            <div style={{ display: 'inline-flex' }}>
              <ActionIcon
                variant="subtle"
                radius="md"
                className="right-rail-icon"
                disabled={disabled || totalPages === 0}
                aria-label={label}
              >
                <LocalIcon icon="pin-end" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <div style={{ minWidth: '24rem', maxWidth: '32rem' }}>
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
