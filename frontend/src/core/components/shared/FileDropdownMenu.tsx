import React from 'react';
import { Menu, Loader, Group, Text } from '@mantine/core';
import VisibilityIcon from '@mui/icons-material/Visibility';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FitText from '@app/components/shared/FitText';
import { PrivateContent } from '@app/components/shared/PrivateContent';

interface FileDropdownMenuProps {
  displayName: string;
  activeFiles: Array<{ fileId: string; name: string; versionNumber?: number }>;
  currentFileIndex: number;
  onFileSelect?: (index: number) => void;
  switchingTo?: string | null;
  viewOptionStyle: React.CSSProperties;
  pillRef?: React.RefObject<HTMLDivElement>;
}

export const FileDropdownMenu: React.FC<FileDropdownMenuProps> = ({
  displayName,
  activeFiles,
  currentFileIndex,
  onFileSelect,
  switchingTo,
  viewOptionStyle,
}) => {
  return (
    <Menu trigger="click" position="bottom" width="30rem">
      <Menu.Target>
        <div style={{...viewOptionStyle, cursor: 'pointer'}}>
          {switchingTo === "viewer" ? (
            <Loader size="xs" />
          ) : (
            <VisibilityIcon fontSize="small" />
          )}
          <PrivateContent>
            <FitText text={displayName} fontSize={14} minimumFontScale={0.6} />
          </PrivateContent>
          <KeyboardArrowDownIcon fontSize="small" />
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
                    <FitText text={itemName} fontSize={14} minimumFontScale={0.7} />
                  </PrivateContent>
                </div>
                {file.versionNumber && file.versionNumber > 1 && (
                  <Text size="xs" c="dimmed">
                    v{file.versionNumber}
                  </Text>
                )}
              </Group>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};
