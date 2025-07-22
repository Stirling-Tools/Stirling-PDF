import React, { useState } from "react";
import { Card, Stack, Text, Group, Badge, Button, Box, Image, ThemeIcon, ActionIcon, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import StorageIcon from "@mui/icons-material/Storage";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";

import { getFileSize, getFileDate } from "../../utils/fileUtils";
import { useIndexedDBThumbnail } from "../../hooks/useIndexedDBThumbnail";
import { fileStorage } from "../../services/fileStorage";

interface FileCardProps {
  file: FileWithUrl;
  onRemove: () => void;
  onDoubleClick?: () => void;
  onView?: () => void;
  onEdit?: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

const FileCard = ({ file, onRemove, onDoubleClick, onView, onEdit, isSelected, onSelect }: FileCardProps) => {
  const { t } = useTranslation();
  const { thumbnail: thumb, isGenerating } = useIndexedDBThumbnail(file);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      shadow="xs"
      radius="md"
      withBorder
      p="xs"
      style={{
        width: 225,
        minWidth: 180,
        maxWidth: 260,
        cursor: onDoubleClick ? "pointer" : undefined,
        position: 'relative',
        border: isSelected ? '2px solid var(--mantine-color-blue-6)' : undefined,
        backgroundColor: isSelected ? 'var(--mantine-color-blue-0)' : undefined
      }}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      <Stack gap={6} align="center">
        <Box
          style={{
            border: "2px solid #e0e0e0",
            borderRadius: 8,
            width: 90,
            height: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
            background: "#fafbfc",
            position: 'relative'
          }}
        >
          {/* Hover action buttons */}
          {isHovered && (onView || onEdit) && (
            <div
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                display: 'flex',
                gap: 4,
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 4,
                padding: 2
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {onView && (
                <Tooltip label="View in Viewer">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="blue"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView();
                    }}
                  >
                    <VisibilityIcon style={{ fontSize: 16 }} />
                  </ActionIcon>
                </Tooltip>
              )}
              {onEdit && (
                <Tooltip label="Open in File Editor">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="orange"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                  >
                    <EditIcon style={{ fontSize: 16 }} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          )}
          {thumb ? (
            <Image
              src={thumb}
              alt="PDF thumbnail"
              height={110}
              width={80}
              fit="contain"
              radius="sm"
            />
          ) : isGenerating ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                width: 20,
                height: 20,
                border: '2px solid #ddd',
                borderTop: '2px solid #666',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: 8
              }} />
              <Text size="xs" c="dimmed">Generating...</Text>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ThemeIcon
                variant="light"
                color={file.size > 100 * 1024 * 1024 ? "orange" : "red"}
                size={60}
                radius="sm"
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <PictureAsPdfIcon style={{ fontSize: 40 }} />
              </ThemeIcon>
              {file.size > 100 * 1024 * 1024 && (
                <Text size="xs" c="dimmed" mt={4}>Large File</Text>
              )}
            </div>
          )}
        </Box>

        <Text fw={500} size="sm" lineClamp={1} ta="center">
          {file.name}
        </Text>

        <Group gap="xs" justify="center">
          <Badge color="red" variant="light" size="sm">
            {getFileSize(file)}
          </Badge>
          <Badge color="blue" variant="light" size="sm">
            {getFileDate(file)}
          </Badge>
          {file.storedInIndexedDB && (
            <Badge
              color="green"
              variant="light"
              size="sm"
              leftSection={<StorageIcon style={{ fontSize: 12 }} />}
            >
              DB
            </Badge>
          )}
        </Group>

        <Button
          color="red"
          size="xs"
          variant="light"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          mt={4}
        >
          {t("delete", "Remove")}
        </Button>
      </Stack>
    </Card>
  );
};

export default FileCard;
