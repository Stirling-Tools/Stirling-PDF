import React from 'react';
import { Menu, Loader, Group, Text, ActionIcon, Tooltip } from '@mantine/core';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CloseIcon from '@mui/icons-material/Close';
import FitText from '@app/components/shared/FitText';
import { PrivateContent } from '@app/components/shared/PrivateContent';
import { FileId } from '@app/types/file';

// Truncate text from the center: "very-long-filename.pdf" -> "very-lo...ame.pdf"
function truncateCenter(text: string, maxLength: number = 25): string {
  if (text.length <= maxLength) return text;
  const ellipsis = '...';
  const charsToShow = maxLength - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return text.substring(0, frontChars) + ellipsis + text.substring(text.length - backChars);
}

interface FileDropdownMenuProps {
  displayName: string;
  activeFiles: Array<{ fileId: string; name: string; versionNumber?: number }>;
  currentFileIndex: number;
  onFileSelect?: (index: number) => void;
  onFileRemove?: (fileId: FileId) => void;
  switchingTo?: string | null;
  viewOptionStyle: React.CSSProperties;
  pillRef?: React.RefObject<HTMLDivElement>;
}

export const FileDropdownMenu: React.FC<FileDropdownMenuProps> = ({
  displayName,
  activeFiles,
  currentFileIndex,
  onFileSelect,
  onFileRemove,
  switchingTo,
  viewOptionStyle,
}) => {
  return (
    <Menu trigger="click" position="bottom" width="30rem">
      <Menu.Target>
        <div style={{...viewOptionStyle, cursor: 'pointer', maxWidth: '100%'}}>
          {switchingTo === "viewer" ? (
            <Loader size="xs" />
          ) : (
            <InsertDriveFileIcon fontSize="small" style={{ flexShrink: 0 }} />
          )}
          <PrivateContent>
            <FitText
              text={truncateCenter(displayName, 30)}
              minimumFontScale={0.6}
              style={{ maxWidth: '12rem', display: 'inline-block' }}
            />
          </PrivateContent>
          <KeyboardArrowDownIcon fontSize="small" style={{ flexShrink: 0 }} />
        </div>
      </Menu.Target>
      <Menu.Dropdown style={{
        backgroundColor: 'var(--right-rail-bg)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        maxHeight: '50vh',
        overflowY: 'auto'
      }}>
        {activeFiles.map((file, index) => {
          const itemName = file?.name || 'Untitled';
          const isActive = index === currentFileIndex;
          return (
            <Menu.Item
              key={file.fileId}
              onClick={(e) => {
                e.stopPropagation();
                onFileSelect?.(index);
              }}
              className="viewer-file-tab"
              {...(isActive && { 'data-active': true })}
              style={{
                justifyContent: 'flex-start',
              }}
            >
              <Group gap="xs" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <PrivateContent>
                    <FitText
                      text={truncateCenter(itemName, 50)}
                      minimumFontScale={0.7}
                      style={{ display: 'block', width: '100%' }}
                    />
                  </PrivateContent>
                </div>
                <Group gap="xs" style={{ flexShrink: 0 }}>
                  {file.versionNumber && file.versionNumber > 1 && (
                    <Text size="xs" c="dimmed">
                      v{file.versionNumber}
                    </Text>
                  )}
                  {onFileRemove && (
                    <Tooltip label="Close file" withArrow>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFileRemove(file.fileId as FileId);
                        }}
                        style={{ flexShrink: 0 }}
                      >
                        <CloseIcon style={{ fontSize: 14 }} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};
