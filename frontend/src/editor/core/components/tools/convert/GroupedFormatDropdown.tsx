import { useId, useState, useMemo, type ReactNode } from "react";
import {
  Stack,
  Text,
  Group,
  Box,
  Input,
  InputBase,
  Popover,
} from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { FORMAT_GROUP_LABEL_KEYS } from "@editor/constants/convertConstants";

interface FormatOption {
  value: string;
  label: string;
  labelKey?: string;
  group: string;
  enabled?: boolean;
  usesCloud?: boolean;
  needsSignIn?: boolean;
}

interface GroupedFormatDropdownProps {
  label?: ReactNode;
  value?: string;
  placeholder?: string;
  options: FormatOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  minWidth?: string;
  name?: string;
  withinPortal?: boolean;
  zIndex?: number;
}

const GroupedFormatDropdown = ({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
  minWidth = "18.75rem",
  name,
  withinPortal = true,
  zIndex = Z_INDEX_AUTOMATE_DROPDOWN,
}: GroupedFormatDropdownProps) => {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("dropdownList.selectOption");
  const [dropdownOpened, setDropdownOpened] = useState(false);
  const labelId = useId();
  const valueId = useId();

  const getOptionLabel = (option: FormatOption) =>
    option.labelKey ? t(option.labelKey, option.label) : option.label;
  const getGroupLabel = (group: string) => {
    const key = FORMAT_GROUP_LABEL_KEYS[group];
    return key ? t(key, group) : group;
  };

  const groupedOptions = useMemo(() => {
    const groups: Record<string, FormatOption[]> = {};

    options.forEach((option) => {
      if (!groups[option.group]) {
        groups[option.group] = [];
      }
      groups[option.group].push(option);
    });

    return groups;
  }, [options]);

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const selected = options.find((opt) => opt.value === value);
    return selected
      ? `${getGroupLabel(selected.group)} (${getOptionLabel(selected)})`
      : value.toUpperCase();
  }, [value, options, t]);

  const handleOptionSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setDropdownOpened(false);
  };

  return (
    <Popover
      opened={dropdownOpened}
      onDismiss={() => setDropdownOpened(false)}
      position="bottom-start"
      withArrow
      shadow="sm"
      disabled={disabled}
      closeOnEscape={true}
      trapFocus
      withinPortal={withinPortal}
      zIndex={zIndex}
    >
      <Popover.Target>
        <InputBase
          component="button"
          type="button"
          pointer
          label={label}
          labelProps={{ id: labelId }}
          // The <label> would otherwise be the whole name, hiding the chosen format.
          aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
          name={name}
          data-testid={name}
          onClick={() => setDropdownOpened(!dropdownOpened)}
          disabled={disabled}
          rightSection={
            <Icon
              name="chevron-down"
              size="1rem"
              style={{
                transform: dropdownOpened ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
                color: "var(--c-text-muted)",
              }}
            />
          }
          rightSectionPointerEvents="none"
          styles={{
            input: { textAlign: "start" },
            label: {
              color: "var(--c-text-muted)",
              fontWeight: "var(--font-weight-medium)",
            },
          }}
        >
          <span id={valueId}>
            {selectedLabel ?? (
              <Input.Placeholder>{resolvedPlaceholder}</Input.Placeholder>
            )}
          </span>
        </InputBase>
      </Popover.Target>
      <Popover.Dropdown
        style={{
          minWidth: Math.min(350, parseInt(minWidth.replace("rem", "")) * 16),
          maxWidth: "90vw",
          maxHeight: "40vh",
          overflow: "auto",
          backgroundColor: "var(--dropdown-panel-bg)",
          border: `0.0625rem solid var(--dropdown-panel-border)`,
        }}
      >
        <Stack gap="md">
          {Object.entries(groupedOptions).map(([groupName, groupOptions]) => (
            <Box key={groupName}>
              <Text
                size="sm"
                fw={600}
                mb="xs"
                style={{ color: "var(--dropdown-group-label)" }}
              >
                {getGroupLabel(groupName)}
              </Text>
              <Group gap="xs" style={{ flexWrap: "wrap" }}>
                {groupOptions.map((option) => (
                  <Button
                    key={option.value}
                    data-testid={`format-option-${option.value}`}
                    variant={value === option.value ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => handleOptionSelect(option.value)}
                    disabled={option.enabled === false}
                    title={
                      option.needsSignIn
                        ? t("convert.signInToUse", "Sign in to use")
                        : undefined
                    }
                    rightSection={
                      option.needsSignIn ? (
                        <Icon
                          name="lock"
                          size={"0.625rem"}
                          style={{ marginLeft: "0.25rem", opacity: 0.7 }}
                        />
                      ) : option.usesCloud ? (
                        <Icon
                          name="cloud"
                          size={"0.625rem"}
                          style={{ marginLeft: "0.25rem", opacity: 0.7 }}
                        />
                      ) : undefined
                    }
                    style={{
                      fontSize: "0.75rem",
                      height: "2rem",
                      padding: "0 0.75rem",
                      flexShrink: 0,
                      position: "relative",
                    }}
                  >
                    {getOptionLabel(option)}
                  </Button>
                ))}
              </Group>
            </Box>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

export default GroupedFormatDropdown;
