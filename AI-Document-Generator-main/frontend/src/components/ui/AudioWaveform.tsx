import { useRef, useEffect, useState } from 'react'

interface AudioWaveformProps {
  waveformHistory: number[][]
  isActive: boolean
}

export function AudioWaveform({ waveformHistory, isActive }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [maxColumns, setMaxColumns] = useState(150)
  
  // Measure container and calculate how many columns fit
  useEffect(() => {
    if (!containerRef.current) return
    
    const updateMaxColumns = () => {
      if (!containerRef.current) return
      const width = containerRef.current.offsetWidth
      // Each column is 2px + 2px gap = 4px effective width
      const cols = Math.floor(width / 4)
      setMaxColumns(Math.max(cols, 50)) // minimum 50 columns
    }
    
    updateMaxColumns()
    
    const resizeObserver = new ResizeObserver(updateMaxColumns)
    resizeObserver.observe(containerRef.current)
    
    return () => resizeObserver.disconnect()
  }, [])
  
  if (!isActive) return null

  // Use history if available, otherwise show placeholder
  const columns = waveformHistory || []
  
  // Only take exactly what fits
  const visibleColumns = columns.slice(-maxColumns)
  
  // Pad with empty columns at the start if we don't have enough history
  const paddingCount = Math.max(0, maxColumns - visibleColumns.length)

  return (
    <div ref={containerRef} className="flex items-center h-6 w-full">
      <div className="flex items-center gap-0.5 w-full">
        {/* Padding columns (empty/minimal) */}
        {Array(paddingCount).fill(0).map((_, i) => (
          <div
            key={`pad-${i}`}
            className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0"
            style={{ width: '2px', minWidth: '2px' }}
          >
            {Array(10).fill(0).map((_, bandIndex) => (
              <div
                key={bandIndex}
                className="w-full bg-blue-400/20 rounded-full"
                style={{ height: '1px', minHeight: '1px' }}
              />
            ))}
          </div>
        ))}
        
        {/* Actual waveform columns */}
        {visibleColumns.map((column, colIndex) => {
          const numBands = 10
          const step = Math.floor(column.length / numBands)
          const bands = []
          for (let i = 0; i < numBands; i++) {
            const index = Math.min(i * step, column.length - 1)
            bands.push(column[index])
          }
          
          return (
            <div
              key={`col-${colIndex}`}
              className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0"
              style={{ width: '2px', minWidth: '2px' }}
            >
              {bands.map((level, bandIndex) => {
                const height = Math.max(1, level * 20)
                return (
                  <div
                    key={bandIndex}
                    className="w-full bg-blue-400 rounded-full"
                    style={{
                      height: `${height}px`,
                      minHeight: '1px',
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
