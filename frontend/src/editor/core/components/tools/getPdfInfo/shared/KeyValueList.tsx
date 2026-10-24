import React from "react";
import { Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface KeyValueListProps {
  obj?: Record<string, unknown> | null;
  emptyLabel?: string;
}

const KeyValueList: React.FC<KeyValueListProps> = ({ obj, emptyLabel }) => {
  const { t } = useTranslation();
  if (!obj || Object.keys(obj).length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {emptyLabel ?? t("getPdfInfo.noneDetected", "None detected")}
      </Text>
    );
  }
  return (
    <Stack gap={6}>
      {Object.entries(obj).map(([k, v]) => (
        <Group
          key={k}
          wrap="nowrap"
          align="flex-start"
          style={{ width: "100%" }}
        >
          <Text
            size="sm"
            style={{ minWidth: 180, maxWidth: 180, flexShrink: 0 }}
          >
            {k}
          </Text>
          <Text
            size="sm"
            c="dimmed"
            style={{
              wordBreak: "break-word",
              overflowWrap: "break-word",
              flex: 1,
            }}
          >
            {v == null ? "" : String(v)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
};

export default KeyValueList;
