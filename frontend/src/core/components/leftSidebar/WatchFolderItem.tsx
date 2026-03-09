import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';

export interface WatchFolder {
  id: string;
  name: string;
  pipeline: string;
  outputPath: string;
  active?: boolean;
}

interface WatchFolderItemProps {
  folder: WatchFolder;
  onClick?: () => void;
}

export function WatchFolderItem({ folder, onClick }: WatchFolderItemProps) {
  const Icon = folder.active ? FolderOpenRoundedIcon : FolderRoundedIcon;

  return (
    <div className="left-sidebar-watch-folder" onClick={onClick} role="button" tabIndex={0}>
      <span className={`left-sidebar-watch-folder-icon${folder.active ? ' active' : ''}`}>
        <Icon sx={{ fontSize: '1.125rem' }} />
      </span>
      <div className="left-sidebar-watch-folder-content">
        <div className={`left-sidebar-watch-folder-name${folder.active ? '' : ' inactive'}`}>
          {folder.name}
        </div>
        <div className="left-sidebar-watch-folder-meta">
          {folder.pipeline} → {folder.outputPath}
        </div>
      </div>
    </div>
  );
}
