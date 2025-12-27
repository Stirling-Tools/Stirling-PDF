import React from 'react'

type ZoomControlsProps = {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

const ZoomControls: React.FC<ZoomControlsProps> = ({
  value,
  onChange,
  min = 0.2,
  max = 3,
  step = 0.1,
  disabled = false,
  className = '',
}) => {
  const handleChange = (next: number) => {
    if (disabled) return
    const clamped = clamp(next, min, max)
    onChange(Number(clamped.toFixed(2)))
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="hidden text-xs text-slate-400 sm:inline">Zoom</span>
      <button
        type="button"
        onClick={() => handleChange(value - step)}
        disabled={disabled}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        −
      </button>
      <div className="min-w-[56px] rounded border border-slate-700 bg-slate-800 px-2 py-1 text-center text-xs font-medium text-slate-100">
        {formatPercent(value)}
      </div>
      <button
        type="button"
        onClick={() => handleChange(value + step)}
        disabled={disabled}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        +
      </button>
    </div>
  )
}

export default ZoomControls

