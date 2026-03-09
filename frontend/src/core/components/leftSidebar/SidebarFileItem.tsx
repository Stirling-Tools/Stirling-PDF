import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { StirlingFileStub } from '@app/types/fileContext';
import { getFileIconInfo } from '@app/utils/fileIconUtils';
import { getRelativeTime } from '@app/utils/fileUtils';

function getFileTypeLabel(name: string): string {
  const ext = (name.split('.').pop() || '').toUpperCase();
  return ext || 'File';
}

interface SidebarFileItemProps {
  file: StirlingFileStub;
  isActive: boolean;
  onClick: () => void;
}

export function SidebarFileItem({ file, isActive, onClick }: SidebarFileItemProps) {
  const { icon, color } = getFileIconInfo(file.name);
  const timeStr = getRelativeTime(file.lastModified);
  const typeLabel = getFileTypeLabel(file.name);

  return (
    <div
      className={`left-sidebar-file-item${isActive ? ' active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <span className="left-sidebar-file-icon">
        {isActive ? (
          <span className="left-sidebar-file-check">
            <CheckRoundedIcon sx={{ fontSize: '0.75rem' }} />
          </span>
        ) : (
          <span style={{ color }}>{icon}</span>
        )}
      </span>
      <div className="left-sidebar-file-info">
        <div className={`left-sidebar-file-name${isActive ? ' active' : ''}`} title={file.name}>
          {file.name}
        </div>
        <div className="left-sidebar-file-meta">
          {timeStr}{timeStr ? ' • ' : ''}{typeLabel}
        </div>
      </div>
    </div>
  );
}
