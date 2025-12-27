interface ImportLayoutModalProps {
  isOpen: boolean
  docType: string
  onDocTypeChange: (value: string) => void
  onClose: () => void
  onFileSelected: (file: File) => void
  isImporting: boolean
  status: string | null
}

export function ImportLayoutModal({
  isOpen,
  docType,
  onDocTypeChange,
  onClose,
  onFileSelected,
  isImporting,
  status,
}: ImportLayoutModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">Import layout from PDF</div>
            <div className="text-xs text-slate-500">First 2 pages only, uses vision model</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400">Document type</label>
          <input
            type="text"
            value={docType}
            onChange={(e) => onDocTypeChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
            placeholder="invoice, resume, report..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400">PDF file</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileSelected(file)
            }}
            className="w-full text-sm text-slate-300"
            disabled={isImporting}
          />
        </div>

        {status && (
          <div className="text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
            {status}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 text-xs text-slate-400">
          <button onClick={onClose} className="px-3 py-1 rounded-lg border border-slate-700 hover:bg-slate-800">
            Close
          </button>
          {isImporting && <span>Processing...</span>}
        </div>
      </div>
    </div>
  )
}
