import { FormEvent, KeyboardEvent, MutableRefObject } from 'react'
import { DocumentState, Message, StyleProfile, VersionEntry } from '../../types'
import { ChatPanel } from './ChatPanel'
import { HistoryPanel } from './HistoryPanel'
import { PreviewPanel } from './PreviewPanel'

interface WorkspaceViewProps {
  styleProfile: StyleProfile | null
  messages: Message[]
  chatEndRef: MutableRefObject<HTMLDivElement | null>
  isGenerating: boolean
  isLivePreviewing: boolean
  prompt: string
  onPromptChange: (value: string) => void
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void
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
  onBack: () => void
  onOpenHistory: () => void
  onOpenImport: () => void
  isHistoryOpen: boolean
  versions: VersionEntry[]
  selectedVersionId: string | null
  onSelectVersion: (id: string) => void
  onCloseHistory: () => void
  onRefreshHistory: () => void
  onPdfUpdated: (pdfUrl: string) => void
}

export function WorkspaceView({
  styleProfile,
  messages,
  chatEndRef,
  isGenerating,
  isLivePreviewing,
  prompt,
  onPromptChange,
  onChatSubmit,
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
  onBack,
  onOpenHistory,
  onOpenImport,
  isHistoryOpen,
  versions,
  selectedVersionId,
  onSelectVersion,
  onCloseHistory,
  onRefreshHistory,
  onPdfUpdated,
}: WorkspaceViewProps) {
  return (
    <div className="relative flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <ChatPanel
        onBack={onBack}
        styleProfile={styleProfile}
        messages={messages}
        chatEndRef={chatEndRef}
        isGenerating={isGenerating}
        prompt={prompt}
        onPromptChange={onPromptChange}
        onSubmit={onChatSubmit}
        onKeyDown={onKeyDown}
        skipTemplates={skipTemplates}
        onSkipTemplatesChange={onSkipTemplatesChange}
        onClearSession={onClearSession}
        onToggleRecording={onToggleRecording}
        onCancelRecording={onCancelRecording}
        onAcceptRecording={onAcceptRecording}
        isRecording={isRecording}
        whisperStatus={whisperStatus}
        waveformHistory={waveformHistory}
        currentDoc={currentDoc}
        onOpenHistory={onOpenHistory}
        onOpenImport={onOpenImport}
      />
      <PreviewPanel
        currentDoc={currentDoc}
        isGenerating={isGenerating}
        isLivePreviewing={isLivePreviewing}
        skipTemplates={skipTemplates}
        onPdfReplaced={onPdfUpdated}
      />
      {isHistoryOpen && (
        <HistoryPanel
          versions={versions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={onSelectVersion}
          onClose={onCloseHistory}
          onRefresh={onRefreshHistory}
        />
      )}
    </div>
  )
}
