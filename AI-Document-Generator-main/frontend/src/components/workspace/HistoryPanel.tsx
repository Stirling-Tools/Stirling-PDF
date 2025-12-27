import { VersionEntry } from '../../types'
import { Button } from '../ui/Button'

interface HistoryPanelProps {
  versions: VersionEntry[]
  selectedVersionId: string | null
  onSelectVersion: (id: string) => void
  onClose: () => void
  onRefresh: () => void
}

export function HistoryPanel({ versions, selectedVersionId, onSelectVersion, onClose, onRefresh }: HistoryPanelProps) {
  const uniqueTypes = Array.from(new Set(versions.map((v) => v.documentType)))

  return (
    <div className="absolute inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col z-20">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">Versions & Layouts</div>
          <div className="text-xs text-slate-500">Most recent first</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        <div className="text-xs uppercase text-slate-500">Saved layouts</div>
        <div className="flex flex-wrap gap-2">
          {uniqueTypes.length === 0 && <span className="text-xs text-slate-500">None yet</span>}
          {uniqueTypes.map((type) => (
            <span
              key={type}
              className="px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 text-slate-300"
            >
              {type}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs uppercase text-slate-500">History</span>
          <span className="text-[11px] text-slate-500">{versions.length} versions</span>
        </div>

        {versions.length === 0 && <p className="text-sm text-slate-500">No versions yet</p>}
        {versions.slice(0, 30).map((version) => (
          <button
            key={version.id}
            onClick={() => onSelectVersion(version.id)}
            className={`w-full text-left p-3 rounded-xl border transition-colors ${
              selectedVersionId === version.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-800 bg-slate-900'
            } hover:border-blue-500`}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase text-slate-400">{version.documentType}</div>
              <div className="text-[10px] text-slate-500">
                {version.createdAt ? new Date(version.createdAt).toLocaleString() : 'recent'}
              </div>
            </div>
            <div className="text-sm text-slate-100 line-clamp-2">{version.prompt || 'Generated document'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
