import { LandingView } from './components/landing/LandingView'
import { ImportLayoutModal } from './components/modals/ImportLayoutModal'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import { useDocumentWorkflow } from './hooks/useDocumentWorkflow'
import { useSpeechCapture } from './hooks/useSpeechCapture'

function App() {
  const workflow = useDocumentWorkflow()
  const speech = useSpeechCapture({ appendPrompt: workflow.appendPrompt })

  const importModal = (
    <ImportLayoutModal
      isOpen={workflow.showImportModal}
      docType={workflow.importDocType}
      onDocTypeChange={workflow.setImportDocType}
      onClose={() => workflow.setShowImportModal(false)}
      onFileSelected={workflow.handleImportTemplate}
      isImporting={workflow.isImporting}
      status={workflow.importStatus}
    />
  )

  if (workflow.view === 'landing') {
    return (
      <>
        <LandingView
          prompt={workflow.prompt}
          onPromptChange={workflow.setPrompt}
          onSubmit={workflow.handleInitialSubmit}
          onKeyDown={workflow.handleKeyDown}
          uploadedPdfFile={workflow.uploadedPdfFile}
          onFileSelect={workflow.setUploadedPdfFile}
          isImporting={workflow.isImporting}
          onToggleRecording={speech.toggleRecording}
          onCancelRecording={speech.cancelRecording}
          onAcceptRecording={speech.acceptRecording}
          isRecording={speech.isRecording}
          whisperStatus={speech.whisperStatus}
          waveformHistory={speech.waveformHistory}
        />
        {importModal}
      </>
    )
  }

  return (
    <>
      <WorkspaceView
        styleProfile={workflow.styleProfile}
        messages={workflow.messages}
        chatEndRef={workflow.chatEndRef}
        isGenerating={workflow.isGenerating}
        isLivePreviewing={workflow.isLivePreviewing}
        prompt={workflow.prompt}
        onPromptChange={workflow.setPrompt}
        onChatSubmit={workflow.handleChatSubmit}
        onKeyDown={workflow.handleKeyDown}
        skipTemplates={workflow.skipTemplates}
        onSkipTemplatesChange={workflow.setSkipTemplates}
        onClearSession={workflow.clearSession}
        onToggleRecording={speech.toggleRecording}
        onCancelRecording={speech.cancelRecording}
        onAcceptRecording={speech.acceptRecording}
        isRecording={speech.isRecording}
        whisperStatus={speech.whisperStatus}
        waveformHistory={speech.waveformHistory}
        currentDoc={workflow.currentDoc}
        onBack={() => workflow.setView('landing')}
        onOpenHistory={() => workflow.setIsHistoryOpen(true)}
        onOpenImport={() => workflow.setShowImportModal(true)}
        isHistoryOpen={workflow.isHistoryOpen}
        versions={workflow.versions}
        selectedVersionId={workflow.selectedVersionId}
        onSelectVersion={workflow.selectVersion}
        onCloseHistory={() => workflow.setIsHistoryOpen(false)}
        onRefreshHistory={workflow.fetchHistory}
        onPdfUpdated={workflow.applyEditedPdf}
      />
      {importModal}
    </>
  )
}

export default App
