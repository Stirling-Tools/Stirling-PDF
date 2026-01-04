import { FormEvent, KeyboardEvent, useMemo, useState } from 'react'
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
  docTypes: string[]
  templateCounts: Record<string, number>
  templateCatalog: { docType: string; templateCount: number; templates: string[] }[]
  selectedDocType: string
  selectedTemplateId: string
  templatesForSelected: string[]
  isTemplateLoading: boolean
  isTemplatePanelOpen: boolean
  onToggleTemplatePanel: () => void
  onSelectTemplate: (docType: string, templateId: string) => void
  templateThumbnailUrl: (docType: string, templateId: string) => string
  formatDocLabel: (value: string) => string
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
  docTypes,
  templateCounts,
  templateCatalog,
  selectedDocType,
  selectedTemplateId,
  templatesForSelected,
  isTemplateLoading,
  isTemplatePanelOpen,
  onToggleTemplatePanel,
  onSelectTemplate,
  templateThumbnailUrl,
  formatDocLabel,
}: LandingViewProps) {
  const [templateSearch, setTemplateSearch] = useState('')
  const [activeTemplateTab, setActiveTemplateTab] = useState<'popular' | 'legal' | 'financial' | 'academic' | 'marketing' | 'operations'>('popular')
  const [expandedDocType, setExpandedDocType] = useState<string | null>(null)
  const [hoveredTemplate, setHoveredTemplate] = useState<{ docType: string; templateId: string; x: number; y: number } | null>(null)

  const popularDocTypes = new Set(['cvs_and_resumes', 'invoices', 'cover_letters', 'business_reports', 'presentations'])
  const legalDocTypes = new Set(['formal_letters', 'theses'])
  const financialDocTypes = new Set(['invoices', 'business_reports', 'calendars'])
  const academicDocTypes = new Set(['academic_articles', 'academic_journals', 'assignments', 'theses'])
  const marketingDocTypes = new Set(['newsletters', 'signs', 'presentations'])
  const operationsDocTypes = new Set(['laboratory_reports', 'laboratory_books', 'business_reports'])

  const visibleDocTypes = useMemo(() => {
    const filtered = docTypes.filter((docType) =>
      formatDocLabel(docType).toLowerCase().includes(templateSearch.toLowerCase()),
    )
    if (activeTemplateTab === 'legal') {
      return filtered.filter((docType) => legalDocTypes.has(docType))
    }
    if (activeTemplateTab === 'financial') {
      return filtered.filter((docType) => financialDocTypes.has(docType))
    }
    if (activeTemplateTab === 'academic') {
      return filtered.filter((docType) => academicDocTypes.has(docType))
    }
    if (activeTemplateTab === 'marketing') {
      return filtered.filter((docType) => marketingDocTypes.has(docType))
    }
    if (activeTemplateTab === 'operations') {
      return filtered.filter((docType) => operationsDocTypes.has(docType))
    }
    return filtered.filter((docType) => popularDocTypes.has(docType))
  }, [
    academicDocTypes,
    activeTemplateTab,
    docTypes,
    financialDocTypes,
    formatDocLabel,
    legalDocTypes,
    marketingDocTypes,
    operationsDocTypes,
    popularDocTypes,
    templateSearch,
  ])

  const docTypeIcon = (docType: string) => {
    switch (docType) {
      case 'cvs_and_resumes':
        return '📄'
      case 'invoices':
        return '🧾'
      case 'cover_letters':
        return '✉️'
      case 'business_reports':
        return '📊'
      case 'formal_letters':
        return '📝'
      case 'theses':
        return '🎓'
      case 'presentations':
        return '🖥️'
      case 'recipes':
        return '🍲'
      default:
        return '📁'
    }
  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span className="text-base">Stirling</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full border border-slate-200 px-4 py-1.5 text-xs text-slate-500">
            Log in
          </button>
          <button className="rounded-full bg-slate-900 px-4 py-1.5 text-xs text-white">
            Get Stirling free
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-4xl rounded-[32px] border border-slate-200 bg-white p-10 shadow-lg">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="text-3xl font-semibold text-slate-900">Stirling PDF</div>
            <p className="text-sm text-slate-500">Create any PDF you can imagine with AI</p>
          </div>

          <form onSubmit={onSubmit} className="mt-10">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              {isRecording ? (
                <div className="space-y-3">
                  <AudioWaveform history={waveformHistory} />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{whisperStatus || 'Listening...'}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1"
                        onClick={onCancelRecording}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-blue-600 px-3 py-1 text-white"
                        onClick={onAcceptRecording}
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    className="w-full resize-none text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                    rows={1}
                    value={prompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Make an invoice for me to bill a client for $1500 in consulting fees"
                  />
                  {uploadedPdfFile && (
                    <div className="mt-2 text-xs text-emerald-600">{uploadedPdfFile.name}</div>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 relative">
                      <label
                        htmlFor="pdf-upload-landing"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400"
                      >
                        +
                      </label>
                      <input
                        id="pdf-upload-landing"
                        type="file"
                        accept="application/pdf"
                        onChange={(event) => onFileSelect(event.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500"
                        onClick={onToggleTemplatePanel}
                      >
                        Template
                      </button>
                      <span className="text-xs text-slate-400">
                        {formatDocLabel(selectedDocType)} · {formatDocLabel(selectedTemplateId)}
                      </span>
                      {isTemplatePanelOpen && (
                        <div className="absolute left-2 top-10 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg z-50">
                          <div className="absolute -top-2 left-6 h-3 w-3 rotate-45 border border-slate-200 bg-white" />
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-500">
                              <span>🔎</span>
                              <input
                                className="w-full bg-transparent text-sm text-slate-600 focus:outline-none"
                                placeholder="Search templates..."
                                value={templateSearch}
                                onChange={(event) => setTemplateSearch(event.target.value)}
                              />
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {[
                                { id: 'popular', label: 'Popular' },
                                { id: 'legal', label: 'Legal' },
                                { id: 'financial', label: 'Financial' },
                                { id: 'academic', label: 'Academic' },
                                { id: 'marketing', label: 'Marketing' },
                                { id: 'operations', label: 'Operations' },
                              ].map((tab) => (
                                <button
                                  type="button"
                                  key={tab.id}
                                  onClick={() => setActiveTemplateTab(tab.id as typeof activeTemplateTab)}
                                  className={`rounded-full px-3 py-1 text-xs ${
                                    activeTemplateTab === tab.id
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1 relative">
                            {visibleDocTypes.map((docType) => {
                              const isExpanded = expandedDocType === docType
                              const templates =
                                templateCatalog.find((entry) => entry.docType === docType)?.templates ||
                                (docType === selectedDocType ? templatesForSelected : ['default'])
                              return (
                                <div key={docType} className="rounded-lg border border-slate-200 bg-white">
                                  <div
                                    className="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700"
                                  >
                                    <button
                                      type="button"
                                      className="flex flex-1 items-center gap-2 text-left"
                                      onClick={() => onSelectTemplate(docType, 'default')}
                                    >
                                      <span>{docTypeIcon(docType)}</span>
                                      <span>{formatDocLabel(docType)}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="text-slate-400 px-2"
                                      onClick={() => setExpandedDocType(isExpanded ? null : docType)}
                                    >
                                      {isExpanded ? '▾' : '▸'}
                                    </button>
                                  </div>
                                  {isExpanded && (
                                    <div className="border-t border-slate-200 px-3 py-2 space-y-2">
                                      {(templates || ['default']).map((templateId) => (
                                        <button
                                          type="button"
                                          key={`${docType}-${templateId}`}
                                          onClick={() => onSelectTemplate(docType, templateId)}
                                          className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm ${
                                            selectedDocType === docType && selectedTemplateId === templateId
                                              ? 'bg-blue-50 text-blue-700'
                                              : 'text-slate-600'
                                          }`}
                                          onMouseMove={(event) =>
                                            setHoveredTemplate({
                                              docType,
                                              templateId,
                                              x: event.clientX,
                                              y: event.clientY,
                                            })
                                          }
                                          onMouseLeave={() => setHoveredTemplate(null)}
                                        >
                                          <span>{formatDocLabel(templateId)}</span>
                                          <span className="text-xs text-slate-400">Select</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {!visibleDocTypes.length && (
                              <div className="text-sm text-slate-400">No templates found.</div>
                            )}
                            {hoveredTemplate && (
                              <div
                                className="fixed z-50 w-36 rounded-lg border border-slate-200 bg-white shadow-lg p-2"
                                style={{ left: hoveredTemplate.x + 12, top: hoveredTemplate.y + 12 }}
                              >
                                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">
                                  Preview
                                </div>
                                <div className="w-full bg-slate-50 rounded-md overflow-hidden" style={{ aspectRatio: '210 / 297' }}>
                                  <img
                                    src={templateThumbnailUrl(hoveredTemplate.docType, hoveredTemplate.templateId)}
                                    alt={`${hoveredTemplate.docType} ${hoveredTemplate.templateId} preview`}
                                    className="h-full w-full object-contain"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500"
                        onClick={onToggleRecording}
                        aria-label="Voice input"
                      >
                        🎤
                      </button>
                      <button
                        type="submit"
                        disabled={isImporting || (!prompt.trim() && !uploadedPdfFile)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-40"
                        aria-label="Generate"
                      >
                        ➜
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </form>

        </div>
      </main>
    </div>
  )
}
