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
        docTypes={workflow.docTypes}
        templateCounts={workflow.templateCounts}
        templateCatalog={workflow.templateCatalog}
        selectedDocType={workflow.selectedDocType}
        selectedTemplateId={workflow.selectedTemplateId}
        templatesForSelected={workflow.templatesForSelected}
        isTemplateLoading={workflow.isTemplateLoading}
        isTemplatePanelOpen={workflow.isTemplatePanelOpen}
        onToggleTemplatePanel={() =>
          workflow.setIsTemplatePanelOpen(!workflow.isTemplatePanelOpen)
        }
        onSelectTemplate={workflow.applyTemplateSelection}
        templateThumbnailUrl={workflow.templateThumbnailUrl}
        formatDocLabel={(value: string) =>
          value
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
        }
      />
        {importModal}
      </>
    )
  }

  return (
    <>
      <WorkspaceView
        isGenerating={workflow.isGenerating}
        isLivePreviewing={workflow.isLivePreviewing}
        isStageLoading={workflow.isStageLoading}
        prompt={workflow.prompt}
        onPromptChange={workflow.setPrompt}
        onChatSubmit={workflow.handleChatSubmit}
        onKeyDown={workflow.handleKeyDown}
        currentDoc={workflow.currentDoc}
        onBack={() => workflow.setView('landing')}
        stage={workflow.stage}
        outlineRows={workflow.outlineRows}
        outlineSections={workflow.outlineSections}
        excludedFields={workflow.excludedFields}
        outlineConstraints={workflow.outlineConstraints}
        draftRows={workflow.draftRows}
        setOutlineRows={workflow.setOutlineRows}
        setOutlineSections={workflow.setOutlineSections}
        setExcludedFields={workflow.setExcludedFields}
        setOutlineConstraints={workflow.setOutlineConstraints}
        setDraftRows={workflow.setDraftRows}
        docTypes={workflow.docTypes}
        templateCounts={workflow.templateCounts}
        selectedDocType={workflow.selectedDocType}
        selectedTemplateId={workflow.selectedTemplateId}
        templatesForSelected={workflow.templatesForSelected}
        isTemplateLoading={workflow.isTemplateLoading}
        onSelectTemplate={workflow.applyTemplateSelection}
        templateThumbnailUrl={workflow.templateThumbnailUrl}
        approveOutline={workflow.approveOutline}
        onAiOutline={() => {
          workflow.fillFieldsFromAI()
        }}
        approveDraft={workflow.approveDraft}
        saveAndReview={workflow.saveAndReview}
        styleDraft={workflow.styleDraft}
        setStyleDraft={workflow.setStyleDraft}
        applyStyleAndRegenerate={workflow.applyStyleAndRegenerate}
        onAddPromptInfo={workflow.addPromptForFields}
        onStageSelect={(nextStage) => workflow.setStage(nextStage)}
        imagePlaceholdersCount={workflow.imagePlaceholdersCount}
        isAssetUploading={workflow.isAssetUploading}
        assetError={workflow.assetError}
        onAddPlaceholderImage={workflow.addImageToPlaceholders}
        onRemovePlaceholders={workflow.stripImagePlaceholders}
        onOpenImportTemplate={() => workflow.openImportTemplate(workflow.selectedDocType)}
      />
      {importModal}
    </>
  )
}

export default App
