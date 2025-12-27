import { FormEvent, KeyboardEvent, useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react'
import { AudioWaveform } from '../ui/AudioWaveform'

interface LandingViewProps {
  prompt: string
  onPromptChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  uploadedPdfFile: File | null
  onFileSelect: (file: File | null) => void
  isImporting: boolean
  onToggleRecording: () => void
  onCancelRecording: () => void
  onAcceptRecording: () => void
  isRecording: boolean
  whisperStatus: string | null
  waveformHistory: number[][]
}

export function LandingView({
  prompt,
  onPromptChange,
  onSubmit,
  onKeyDown,
  uploadedPdfFile,
  onFileSelect,
  isImporting,
  onToggleRecording,
  onCancelRecording,
  onAcceptRecording,
  isRecording,
  whisperStatus,
  waveformHistory,
}: LandingViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [isMultiline, setIsMultiline] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [textareaHeight, setTextareaHeight] = useState(24)
  const prevIsMultilineRef = useRef(isMultiline)
  const cursorPositionRef = useRef<number | null>(null)
  
  // Measure the actual content height using a hidden div
  const measureContent = useCallback(() => {
    if (!measureRef.current) return 24
    measureRef.current.textContent = prompt || 'X' // Use 'X' as minimum to get line height
    const height = measureRef.current.scrollHeight
    return height
  }, [prompt])

  const updateScrollIndicator = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const canScroll = textarea.scrollHeight > textarea.clientHeight + 1
    const isAtBottom = textarea.scrollTop + textarea.clientHeight >= textarea.scrollHeight - 2
    setCanScrollDown(canScroll && !isAtBottom)
  }, [])
  
  // Update layout based on content
  const updateLayout = useCallback(() => {
    // Save cursor position before potential layout change
    if (textareaRef.current) {
      cursorPositionRef.current = textareaRef.current.selectionStart
    }
    
    const contentHeight = measureContent()
    const isMulti = contentHeight > 32 // More than ~1.5 lines
    setIsMultiline(isMulti)
    
    // Set textarea height (capped at 240px)
    const newHeight = Math.min(Math.max(contentHeight, 24), 240)
    setTextareaHeight(newHeight)
    
    // Update scroll indicator after layout settles
    requestAnimationFrame(updateScrollIndicator)
  }, [measureContent, updateScrollIndicator])
  
  // Restore cursor position when layout mode changes
  useEffect(() => {
    if (prevIsMultilineRef.current !== isMultiline) {
      prevIsMultilineRef.current = isMultiline
      // Use requestAnimationFrame to ensure the new textarea is mounted
      requestAnimationFrame(() => {
        if (textareaRef.current && cursorPositionRef.current !== null) {
          const pos = cursorPositionRef.current
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(pos, pos)
        }
      })
    }
  }, [isMultiline])
  
  // Update on every prompt change - use layoutEffect for synchronous update
  useLayoutEffect(() => {
    updateLayout()
  }, [prompt, updateLayout])
  
  // Also update after a small delay to catch any missed updates
  useEffect(() => {
    const timer = setTimeout(updateLayout, 10)
    return () => clearTimeout(timer)
  }, [prompt, updateLayout])
  
  // Handle scroll to update gradient visibility
  const handleScroll = useCallback(() => {
    updateScrollIndicator()
  }, [updateScrollIndicator])
  
  // Toolbar buttons component to avoid duplication
  const ToolbarButtons = () => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleRecording}
        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex-shrink-0"
        title="Start voice input"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      </button>
      <button
        type="submit"
        disabled={isImporting || (!prompt.trim() && !uploadedPdfFile)}
        className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        title="Send"
      >
        {isImporting ? (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        )}
      </button>
    </div>
  )
  
  const PlusButton = () => (
    <label
      htmlFor="pdf-upload-landing"
      className="hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer flex-shrink-0"
      title="Upload PDF to extract layout"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </label>
  )
  
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
        <div className="absolute top-14 left-14 w-96 h-96 bg-blue-600 rounded-full blur-3xl filter mix-blend-screen animate-pulse"></div>
        <div className="absolute bottom-14 right-14 w-96 h-96 bg-purple-600 rounded-full blur-3xl filter mix-blend-screen animate-pulse delay-1000"></div>
      </div>

      {/* Hidden measurement div - mirrors textarea styling */}
      <div
        ref={measureRef}
        className="absolute invisible whitespace-pre-wrap text-base"
        style={{ 
          width: 'calc(100% - 200px)', // Account for buttons and padding
          maxWidth: 'calc(768px - 200px)', // max-w-3xl minus buttons
          padding: '0',
          lineHeight: '1.5',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
        aria-hidden="true"
      />

      <div className="z-10 w-full max-w-3xl flex flex-col items-center space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl leading-tight pb-1 font-bold tracking-tighter bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Stirling
          </h1>
          <p className="text-xl text-slate-400">Intelligent Document 1.0</p>
        </div>

        <form onSubmit={onSubmit} className="w-full">
          <div className="relative bg-slate-800 rounded-2xl shadow-2xl border border-slate-700">
            {/* Hidden file input */}
            <input
              id="pdf-upload-landing"
              type="file"
              accept="application/pdf"
              onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
              className="hidden"
            />
            
            {/* PDF attached indicator */}
            {uploadedPdfFile && !isRecording && (
              <div className="px-4 pt-3 pb-0">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-xs text-emerald-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {uploadedPdfFile.name}
                  <button
                    type="button"
                    onClick={() => onFileSelect(null)}
                    className="ml-1 hover:text-emerald-300"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              </div>
            )}
            
            {isRecording ? (
              /* Recording mode - waveform with buttons below */
              <div className="p-4">
                <div className="min-h-[24px] mb-3">
                  <AudioWaveform waveformHistory={waveformHistory} isActive={isRecording} />
                </div>
                <div className="flex items-center justify-between">
                  <div />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onCancelRecording}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                      title="Cancel recording"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onAcceptRecording()
                      }}
                      className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      title="Accept and transcribe"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : isMultiline ? (
              /* Multiline mode - textarea on top, buttons below */
              <div className="p-4">
                <div className="relative mb-3">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    onScroll={handleScroll}
                    onKeyDown={onKeyDown}
                    placeholder="Ask anything"
                    className="w-full bg-transparent text-base text-white placeholder-slate-500 focus:outline-none resize-none overflow-y-auto break-words"
                    style={{ height: `${textareaHeight}px`, maxHeight: '240px', overflowWrap: 'anywhere' }}
                    rows={1}
                    autoFocus
                  />
                  {/* Scroll indicator gradient */}
                  {canScrollDown && (
                    <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none bg-gradient-to-t from-slate-800 to-transparent" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <PlusButton />
                  <ToolbarButtons />
                </div>
              </div>
            ) : (
              /* Single line mode - all in one row */
              <div className="flex items-center gap-2 p-3">
                <PlusButton />
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask anything"
                  className="flex-1 bg-transparent text-base text-white placeholder-slate-500 focus:outline-none resize-none overflow-hidden min-w-0 break-words"
                  style={{ height: '24px', overflowWrap: 'anywhere' }}
                  rows={1}
                  autoFocus
                />
                <ToolbarButtons />
              </div>
            )}
          </div>
        </form>
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-300 justify-center">
          <div className="relative group px-4 py-2 rounded-full bg-slate-800/70 border border-slate-700 cursor-not-allowed select-none">
            <span className="flex items-center gap-2">
              Document type (auto)
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l-7-7-7 7" />
              </svg>
            </span>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-3 py-1 text-[11px] text-slate-200 border border-slate-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              We’ll pick the best document type for your prompt automatically using AI.
            </span>
          </div>
          <div className="relative group px-4 py-2 rounded-full bg-slate-800/70 border border-slate-700 cursor-not-allowed select-none">
            <span className="flex items-center gap-2">
              GPT 5.1
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l-7-7-7 7" />
              </svg>
            </span>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-3 py-1 text-[11px] text-slate-200 border border-slate-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              More models coming soon.
            </span>
          </div>
        </div>
        {whisperStatus && <div className="text-xs text-slate-400">{whisperStatus}</div>}
      </div>
    </div>
  )
}
