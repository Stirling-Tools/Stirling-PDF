import React from "react";
import { Card, Stack, Text, Group, Badge, Button, Box, Image, ThemeIcon } from "@mantine/core";
import { useTranslation } from "react-i18next";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import StorageIcon from "@mui/icons-material/Storage";

import { FileWithUrl } from "../types/file";
import { getFileSize, getFileDate } from "../utils/fileUtils";
import { useIndexedDBThumbnail } from "../hooks/useIndexedDBThumbnail";

interface FileCardProps {
  file: FileWithUrl;
  onRemove: () => void;
  onDoubleClick?: () => void;
}

const FileCard: React.FC<FileCardProps> = ({ file, onRemove, onDoubleClick }) => {
  const { t } = useTranslation();
  const { thumbnail: thumb, isGenerating } = useIndexedDBThumbnail(file);

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
        cursor: onDoubleClick ? "pointer" : undefined 
      }}
      onDoubleClick={onDoubleClick}
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
          }}
        >
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
          <Badge color="gray" variant="light" size="sm">
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
          onClick={onRemove}
          mt={4}
        >
          {t("delete", "Remove")}
        </Button>
      </Stack>
    </Card>
  );
};

export default FileCard;