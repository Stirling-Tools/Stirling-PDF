/** Duplicate a field beside itself, or onto every other page of the document. */
import { Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useFormFill } from "@editor/tools/formFill/FormFillContext";
import { pendingSelectionName } from "@editor/tools/formFill/pendingSelection";
import {
  duplicateInPlace,
  duplicateToAllPages,
  takenFieldNames,
  type FieldTemplate,
} from "@editor/tools/formFill/fieldDuplication";

interface DuplicateFieldMenuProps {
  /** Read on click, so the copy picks up edits staged since the row rendered. */
  getSource: () => FieldTemplate | null;
  testId: string;
}

export function DuplicateFieldMenu({
  getSource,
  testId,
}: DuplicateFieldMenuProps) {
  const { t } = useTranslation();
  const label = t("formFill.duplicate.label", "Duplicate");
  return (
    // Clicks here, including in the portalled dropdown, still bubble through React to the row,
    // which toggles on click. Stopped on a wrapper because an onClick on the button itself would
    // replace the handler Menu.Target injects through the Tooltip.
    <span style={{ display: "flex" }} onClick={(e) => e.stopPropagation()}>
      <Menu position="bottom-end" withArrow withinPortal>
        <Menu.Target>
          <Tooltip label={label} withArrow>
            <ActionIcon
              size="sm"
              variant="tertiary"
              aria-label={label}
              data-testid={`${testId}-menu`}
            >
              <Icon name="copy-plus" size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <DuplicateItems getSource={getSource} testId={testId} />
        </Menu.Dropdown>
      </Menu>
    </span>
  );
}

/** Mounted only while the menu is open, so the page count is current when it is read. */
function DuplicateItems({ getSource, testId }: DuplicateFieldMenuProps) {
  const { t } = useTranslation();
  const {
    state,
    pendingFields,
    modifiedFields,
    addPendingField,
    addPendingFields,
    setSelectedField,
  } = useFormFill();
  const { getScrollState } = useViewer();
  const totalPages = getScrollState().totalPages;
  const taken = () =>
    takenFieldNames(state.fields, pendingFields, modifiedFields);

  return (
    <>
      <Menu.Item
        leftSection={<Icon name="copy" size={16} />}
        data-testid={`${testId}-in-place`}
        onClick={() => {
          const source = getSource();
          if (!source) return;
          const id = addPendingField(duplicateInPlace(source, taken()));
          setSelectedField(pendingSelectionName(id));
        }}
      >
        {t("formFill.duplicate.inPlace", "Duplicate in place")}
      </Menu.Item>
      <Menu.Item
        leftSection={<Icon name="files" size={16} />}
        disabled={totalPages < 2}
        data-testid={`${testId}-all-pages`}
        onClick={() => {
          const source = getSource();
          if (!source) return;
          addPendingFields(duplicateToAllPages(source, totalPages, taken()));
        }}
      >
        {t("formFill.duplicate.allPages", "Duplicate to all pages")}
      </Menu.Item>
    </>
  );
}
