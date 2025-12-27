import { FormEvent, KeyboardEvent, MutableRefObject, useRef, useEffect } from 'react'
import { DocumentState, Message, StyleProfile } from '../../types'
import { Button } from '../ui/Button'
import { AudioWaveform } from '../ui/AudioWaveform'

interface ChatPanelProps {
  onBack: () => void
  styleProfile: StyleProfile | null
  messages: Message[]
  chatEndRef: MutableRefObject<HTMLDivElement | null>
  isGenerating: boolean
  prompt: string
  onPromptChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  skipTemplates: boolean
  onSkipTemplatesChange: (value: boolean) => void
  onClearSession: () => void
  onToggleRecording: () => void
  onCancelRecording: () => void
  onAcceptRecording: () => void
  isRecording: boolean
  whisperStatus: string | null
  waveformHistory: number[][]
  currentDoc: DocumentState | null
  onOpenHistory: () => void
  onOpenImport: () => void
}

export function ChatPanel({
  onBack,
  styleProfile,
  messages,
  chatEndRef,
  isGenerating,
  prompt,
  onPromptChange,
  onSubmit,
  onKeyDown,
  skipTemplates,
  onSkipTemplatesChange,
  onClearSession,
  onToggleRecording,
  onCancelRecording,
  onAcceptRecording,
  isRecording,
  whisperStatus,
  waveformHistory,
  currentDoc,
  onOpenHistory,
  onOpenImport,
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gradientRef = useRef<HTMLDivElement>(null)

  const updateInputGradient = () => {
    const gradient = gradientRef.current
    if (!gradient) return
    // Hide the gradient entirely to avoid lingering blur while typing.
    gradient.style.opacity = '0'
  }
  
  // Auto-resize textarea and update gradient visibility
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 200) // Max ~8 lines for the smaller panel
      textarea.style.height = `${newHeight}px`
    }
    updateInputGradient()
  }, [prompt])
  
  return (
    <div className="w-1/3 min-w-[350px] flex flex-col border-r border-slate-800 bg-slate-900 z-10">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onOpenHistory}>
            History & Layouts
          </Button>
          <Button variant="accent" size="sm" onClick={onOpenImport}>
            Import Layout (PDF)
          </Button>
        </div>
      </div>
      {styleProfile && (
        <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-3 text-xs text-slate-400">
          <span className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700">
            {styleProfile.layout_preference || 'clean'}
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700">
            {styleProfile.font_preference || 'font'}
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700">
            {styleProfile.tone || 'tone'}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-6 relative">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl p-4 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{msg.text}</p>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl p-4 rounded-bl-none border border-slate-700">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
        {!messages.length && (
          <div className="text-xs text-slate-500">
            Ask for revisions, upload layouts, or describe the style you want. I&apos;ll keep the latest
            context.
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipTemplates}
              onChange={(e) => onSkipTemplatesChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-blue-500"
            />
            <span>Don&apos;t reuse saved layouts/templates</span>
          </label>
          <Button variant="secondary" size="sm" onClick={onClearSession}>
            Clear
          </Button>
        </div>
        <form onSubmit={onSubmit} className="relative">
          <div className="w-full bg-slate-800 rounded-xl border border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/50">
            {/* Content area */}
            <div className="px-3 pt-3 pb-1">
              {isRecording ? (
                <div className="min-h-[20px]">
                  <AudioWaveform waveformHistory={waveformHistory} isActive={isRecording} />
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  onScroll={updateInputGradient}
                  placeholder={currentDoc ? 'Modify the document...' : 'Describe what to build...'}
                  className="w-full bg-transparent text-white focus:outline-none resize-none overflow-y-auto text-sm"
                  style={{ maxHeight: '200px' }}
                  rows={1}
                />
              )}
            </div>
          </div>
          <div
            ref={gradientRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-slate-900/90 to-transparent transition-opacity duration-200"
            style={{ opacity: 0 }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {isRecording ? (
              <>
                <button
                  type="button"
                  onClick={onCancelRecording}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  title="Cancel recording"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onToggleRecording}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  title="Start voice input"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Send"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </form>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <div className="relative group px-3 py-2 rounded-full bg-slate-800 border border-slate-700 font-medium text-slate-300 cursor-not-allowed select-none">
            <span className="flex items-center gap-2">
              Document type (auto)
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l-7-7-7 7" />
              </svg>
            </span>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-3 py-1 text-[11px] text-slate-200 border border-slate-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              We’ll pick the best document type for your prompt automatically using AI.
            </span>
          </div>
          <div className="px-3 py-2 rounded-full bg-slate-800 border border-slate-700 font-medium text-slate-300 cursor-not-allowed select-none">
            GPT 5.1
          </div>
        </div>
        {whisperStatus && <div className="text-[11px] text-slate-400 mt-1">{whisperStatus}</div>}
      </div>
    </div>
  )
}
