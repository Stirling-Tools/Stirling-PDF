import { FormEvent, KeyboardEvent, useEffect, useState } from 'react'
import { DocumentState } from '../../types'
import PdfThumbnailViewer from '../pdfTextEditor/PdfThumbnailViewer'

interface WorkspaceViewProps {
  isGenerating: boolean
  isLivePreviewing: boolean
  isStageLoading: boolean
  prompt: string
  onPromptChange: (value: string) => void
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  currentDoc: DocumentState | null
  onBack: () => void
  stage: 'outline' | 'text' | 'styling' | 'review'
  outlineRows: { section: string; details: string }[]
  outlineSections: string[]
  excludedFields: string[]
  outlineConstraints: { tone: string; audience: string; pageCount: number }
  draftRows: { label: string; value: string }[]
  setOutlineRows: (rows: { section: string; details: string }[]) => void
  setOutlineSections: (next: string[]) => void
  setExcludedFields: (next: string[]) => void
  setOutlineConstraints: (next: { tone: string; audience: string; pageCount: number }) => void
  setDraftRows: (rows: { label: string; value: string }[]) => void
  docTypes: string[]
  templateCounts: Record<string, number>
  selectedDocType: string
  selectedTemplateId: string
  templatesForSelected: string[]
  isTemplateLoading: boolean
  onSelectTemplate: (docType: string, templateId: string) => void
  templateThumbnailUrl: (docType: string, templateId: string) => string
  approveOutline: () => void
  onAiOutline: () => void
  approveDraft: () => void
  saveAndReview: () => void
  styleDraft: { layout_preference: string; font_preference: string; color_accent: string }
  setStyleDraft: (next: { layout_preference: string; font_preference: string; color_accent: string }) => void
  applyStyleAndRegenerate: () => void
  onAddPromptInfo: (value: string) => void
  onStageSelect: (stage: 'outline' | 'text' | 'styling' | 'review') => void
  imagePlaceholdersCount: number
  isAssetUploading: boolean
  assetError: string | null
  onAddPlaceholderImage: (file: File) => void
  onRemovePlaceholders: () => void
  onOpenImportTemplate: () => void
}

export function WorkspaceView({
  isGenerating,
  isLivePreviewing,
  isStageLoading,
  prompt,
  onPromptChange,
  onChatSubmit,
  onKeyDown,
  currentDoc,
  onBack,
  stage,
  outlineRows,
  outlineSections,
  excludedFields,
  outlineConstraints,
  draftRows,
  setOutlineRows,
  setOutlineSections,
  setExcludedFields,
  setOutlineConstraints,
  setDraftRows,
  docTypes,
  templateCounts,
  selectedDocType,
  selectedTemplateId,
  templatesForSelected,
  isTemplateLoading,
  onSelectTemplate,
  templateThumbnailUrl,
  approveOutline,
  onAiOutline,
  approveDraft,
  saveAndReview,
  styleDraft,
  setStyleDraft,
  applyStyleAndRegenerate,
  onAddPromptInfo,
  onStageSelect,
  imagePlaceholdersCount,
  isAssetUploading,
  assetError,
  onAddPlaceholderImage,
  onRemovePlaceholders,
  onOpenImportTemplate,
}: WorkspaceViewProps) {
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
  const [isDataPanelOpen, setIsDataPanelOpen] = useState(false)
  const [promptAddon, setPromptAddon] = useState('')
  const autoSize = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget
    target.style.height = 'auto'
    target.style.height = `${target.scrollHeight}px`
  }
  useEffect(() => {
    const nodes = document.querySelectorAll('textarea[data-autosize="true"]')
    nodes.forEach((node) => {
      const area = node as HTMLTextAreaElement
      area.style.height = 'auto'
      area.style.height = `${area.scrollHeight}px`
    })
  }, [outlineRows, draftRows, stage])

  const formatDocLabel = (value: string) => {
    return value
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const docLabel = currentDoc?.documentType ? formatDocLabel(currentDoc.documentType) : 'Document'

  const renderStageContent = () => {
    if (stage === 'outline') {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{docLabel} Inputs</h2>
            <p className="text-sm text-slate-500">Fill in the data you want the AI to use.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Selected Template
                </div>
                <div className="text-sm text-slate-700">
                  {formatDocLabel(selectedDocType)} · {formatDocLabel(selectedTemplateId)}
                </div>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-blue-600"
                onClick={() => setIsTemplatePickerOpen((prev) => !prev)}
              >
                {isTemplatePickerOpen ? 'Hide' : 'Edit'}
              </button>
            </div>
            {isTemplatePickerOpen && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Document Type
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    value={selectedDocType}
                    onChange={(event) => onSelectTemplate(event.target.value, selectedTemplateId)}
                  >
                    {docTypes.map((docType) => (
                      <option key={docType} value={docType}>
                        {formatDocLabel(docType)} ({templateCounts[docType] ?? 1})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Template Style
                  </label>
                  {isTemplateLoading ? (
                    <div className="text-sm text-slate-400">Loading templates...</div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {templatesForSelected.map((templateId) => (
                        <button
                          type="button"
                          key={templateId}
                          onClick={() => onSelectTemplate(selectedDocType, templateId)}
                          className={`rounded-xl border text-left ${
                            selectedTemplateId === templateId
                              ? 'border-blue-500 ring-2 ring-blue-200'
                              : 'border-slate-200'
                          }`}
                        >
                          <div
                            className="w-full rounded-t-xl bg-slate-50 overflow-hidden h-36"
                            style={{ aspectRatio: '210 / 297' }}
                          >
                            <img
                              src={templateThumbnailUrl(selectedDocType, templateId)}
                              alt={`${templateId} template`}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <div className="px-3 py-2 text-sm text-slate-700">
                            {formatDocLabel(templateId)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Data to use</div>
                <div className="text-xs text-slate-400">
                  {outlineRows.filter((row) => row.details.trim()).length} filled ·{' '}
                  {outlineRows.filter((row) => !row.details.trim()).length} empty
                </div>
                {outlineRows.filter((row) => !row.details.trim()).length > outlineRows.length / 2 && (
                  <div className="text-xs text-amber-500 mt-1">
                    Add a bit more data for better results.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-blue-600"
                onClick={() => setIsDataPanelOpen((prev) => !prev)}
              >
                {isDataPanelOpen ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Add info from prompt
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  placeholder="Add more details (e.g., biller address, invoice number)..."
                  value={promptAddon}
                  onChange={(event) => setPromptAddon(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onAddPromptInfo(promptAddon)
                      setPromptAddon('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    onAddPromptInfo(promptAddon)
                    setPromptAddon('')
                  }}
                >
                  Add
                </button>
              </div>
              <div className="text-xs text-slate-400">
                This appends to the original prompt and re-runs auto-fill.
              </div>
            </div>
            {isDataPanelOpen && (
              <div className="border-t border-slate-200">
                <div className="grid grid-cols-[1.2fr,2fr,auto] bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <div>Data name</div>
                  <div>Value</div>
                  <div />
                </div>
                {outlineRows.map((row, idx) => (
                  <div
                    key={`outline-${idx}`}
                    className="grid grid-cols-[1.2fr,2fr,auto] px-6 py-3 border-t border-slate-100 gap-4 items-start"
                  >
                    <input
                      className="text-sm text-slate-800 bg-transparent focus:outline-none"
                      value={row.section}
                      onChange={(event) => {
                        const next = [...outlineRows]
                        next[idx] = { ...row, section: event.target.value }
                        setOutlineRows(next)
                      }}
                    />
                    <textarea
                      rows={1}
                      className="min-h-[56px] w-full resize-none overflow-hidden text-sm text-slate-500 bg-transparent focus:outline-none"
                      value={row.details}
                      onInput={autoSize}
                      data-autosize="true"
                      onChange={(event) => {
                        const next = [...outlineRows]
                        next[idx] = { ...row, details: event.target.value }
                        setOutlineRows(next)
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-rose-500"
                      onClick={() => {
                        const next = outlineRows.filter((_, rowIndex) => rowIndex !== idx)
                        const label = row.section.trim()
                        if (label) {
                          setExcludedFields([...excludedFields, label])
                        }
                        setOutlineRows(next)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-6 py-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-blue-600"
                    onClick={() => setOutlineRows([...outlineRows, { section: 'New data', details: '' }])}
                  >
                    Add data
                  </button>
                  {excludedFields.length > 0 && (
                    <div className="text-xs text-slate-400">
                      Excluded: {excludedFields.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              AI Constraints
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tone</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={outlineConstraints.tone}
                  onChange={(event) =>
                    setOutlineConstraints({ ...outlineConstraints, tone: event.target.value })
                  }
                >
                  {['Professional', 'Formal', 'Friendly', 'Neutral', 'Academic', 'Technical', 'Narrative', 'Direct', 'Informative'].map((tone) => (
                    <option key={tone} value={tone}>
                      {tone}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audience</label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={outlineConstraints.audience}
                  onChange={(event) =>
                    setOutlineConstraints({ ...outlineConstraints, audience: event.target.value })
                  }
                  placeholder="Audience"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pages</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={outlineConstraints.pageCount}
                  onChange={(event) =>
                    setOutlineConstraints({
                      ...outlineConstraints,
                      pageCount: Math.max(1, Number(event.target.value || 1)),
                    })
                  }
                />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sections
            </div>
            <div className="space-y-3">
              {outlineSections.map((section, idx) => (
                <div key={`section-${idx}`} className="flex items-center gap-3">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    value={section}
                    onChange={(event) => {
                      const next = [...outlineSections]
                      next[idx] = event.target.value
                      setOutlineSections(next)
                    }}
                  />
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-rose-500"
                    onClick={() => {
                      const next = outlineSections.filter((_, rowIndex) => rowIndex !== idx)
                      setOutlineSections(next)
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-blue-600"
              onClick={() => setOutlineSections([...outlineSections, 'New section'])}
            >
              Add section
            </button>
          </div>
        </div>
      )
    }

    if (stage === 'text') {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{docLabel} Text</h2>
            <p className="text-sm text-slate-500">Edit each section draft. Polishing happens after approval.</p>
          </div>
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1.2fr,2fr] bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div>Section</div>
              <div>Content</div>
            </div>
            {draftRows.map((row, idx) => (
              <div
                key={`draft-${idx}`}
                className="grid grid-cols-[1.2fr,2fr] px-6 py-3 border-t border-slate-100 gap-4"
              >
                <input
                  className="text-sm text-slate-800 bg-transparent focus:outline-none"
                  value={row.label}
                  onChange={(event) => {
                    const next = [...draftRows]
                    next[idx] = { ...row, label: event.target.value }
                    setDraftRows(next)
                  }}
                />
                <textarea
                  rows={1}
                  className="min-h-[120px] w-full resize-none overflow-hidden text-sm text-slate-600 bg-transparent focus:outline-none"
                  value={row.value}
                  onInput={autoSize}
                  data-autosize="true"
                  onChange={(event) => {
                    const next = [...draftRows]
                    next[idx] = { ...row, value: event.target.value }
                    setDraftRows(next)
                  }}
                  placeholder={isStageLoading ? 'Generating draft...' : 'Add content...'}
                />
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (stage === 'styling') {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{docLabel} Review</h2>
            <p className="text-sm text-slate-500">Check the generated preview before exporting.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.1fr,2fr]">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Font</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={styleDraft.font_preference}
                  onChange={(event) =>
                    setStyleDraft({ ...styleDraft, font_preference: event.target.value })
                  }
                >
                  {['Serif', 'Sans', 'Modern', 'Classic', 'Minimal'].map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Layout</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={styleDraft.layout_preference}
                  onChange={(event) =>
                    setStyleDraft({ ...styleDraft, layout_preference: event.target.value })
                  }
                >
                  {['Compact', 'Balanced', 'Spacious', 'Grid', 'Editorial'].map((layout) => (
                    <option key={layout} value={layout}>
                      {layout}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accent</label>
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2"
                  value={styleDraft.color_accent}
                  onChange={(event) =>
                    setStyleDraft({ ...styleDraft, color_accent: event.target.value })
                  }
                />
              </div>
              <button
                type="button"
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={applyStyleAndRegenerate}
                disabled={isGenerating || isStageLoading}
              >
                Apply Style & Regenerate
              </button>
            </div>
            <div className="border border-slate-200 rounded-2xl bg-white">
              {currentDoc?.pdfUrl ? (
                <div className="p-4">
                  <PdfThumbnailViewer pdfUrl={currentDoc.pdfUrl} isLivePreviewing={isLivePreviewing} />
                </div>
              ) : (
                <div className="p-12 text-sm text-slate-500 text-center">
                  {isStageLoading || isGenerating ? 'Generating preview...' : 'Preview will appear here.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{docLabel} Export</h2>
          <p className="text-sm text-slate-500">Download or export your final PDF.</p>
        </div>
        <div className="border border-slate-200 rounded-2xl bg-white">
          {currentDoc?.pdfUrl ? (
            <div className="p-4">
              <PdfThumbnailViewer pdfUrl={currentDoc.pdfUrl} isLivePreviewing={isLivePreviewing} />
            </div>
          ) : (
            <div className="p-12 text-sm text-slate-500 text-center">Generating the final preview...</div>
          )}
        </div>
      </div>
    )
  }

  const StageItem = ({
    number,
    label,
    active,
    stageKey,
  }: {
    number: number
    label: string
    active: boolean
    stageKey: 'outline' | 'text' | 'styling' | 'review'
  }) => (
    <button
      type="button"
      onClick={() => onStageSelect(stageKey)}
      disabled={isGenerating || isStageLoading}
      className={`flex w-full items-center justify-between text-sm ${
        active ? 'text-slate-900' : 'text-slate-400'
      } disabled:opacity-50`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
            active ? 'border-blue-600 text-blue-600' : 'border-slate-300 text-slate-400'
          }`}
        >
          {number}
        </span>
        <span className="font-medium">{label}</span>
      </div>
    </button>
  )

  return (
    <div className="relative flex h-screen bg-slate-100 text-slate-900 overflow-hidden">
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col px-5 py-6 gap-6">
        <div className="flex items-center justify-between">
          <button className="text-xs text-slate-500" onClick={onBack}>
            Stirling
          </button>
          <button className="text-xs text-slate-400">Create</button>
        </div>

        <div className="space-y-4">
          <StageItem number={1} label="Outline" active={stage === 'outline'} stageKey="outline" />
          <StageItem number={2} label="Text" active={stage === 'text'} stageKey="text" />
          <StageItem number={3} label="Review" active={stage === 'styling'} stageKey="styling" />
          <StageItem number={4} label="Export" active={stage === 'review'} stageKey="review" />
        </div>

        {stage === 'outline' && (
          <div className="mt-2 space-y-2">
            <button
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              onClick={onAiOutline}
              disabled={isGenerating || isStageLoading}
            >
              Auto-fill Fields
            </button>
            <button
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={approveOutline}
              disabled={isGenerating || isStageLoading}
            >
              Approve and Continue
            </button>
          </div>
        )}
        {stage === 'text' && (
          <button
            className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={approveDraft}
            disabled={isGenerating || isStageLoading}
          >
            Approve and Continue
          </button>
        )}
        {stage === 'styling' && (
          <button
            className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={saveAndReview}
            disabled={isGenerating || isStageLoading}
          >
            Continue to Export
          </button>
        )}

        {stage === 'review' && (
          <div className="space-y-2 text-xs text-slate-500">
            <div className="font-semibold text-slate-700">Export</div>
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600">
              {docLabel} - 1 page
            </div>
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-[11px] text-slate-600"
              onClick={onOpenImportTemplate}
            >
              Import template from PDF
            </button>
            {imagePlaceholdersCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                <div className="font-semibold">Image placeholders detected</div>
                <p className="mt-1 text-[11px] text-amber-700">
                  Add images now or remove placeholders before exporting.
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1 text-[11px] text-amber-700">
                    {isAssetUploading ? 'Uploading...' : 'Add image'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif"
                      className="hidden"
                      disabled={isAssetUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onAddPlaceholderImage(file)
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-3 py-1 text-[11px] text-slate-600"
                    onClick={onRemovePlaceholders}
                    disabled={isAssetUploading}
                  >
                    Remove placeholders
                  </button>
                </div>
                {assetError && <div className="mt-2 text-[11px] text-amber-600">{assetError}</div>}
              </div>
            )}
            {currentDoc?.pdfUrl && (
              <a
                href={currentDoc.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-700"
              >
                Export and Close
              </a>
            )}
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto px-8 py-10">
        <div className="mx-auto max-w-4xl space-y-8">
          <form
            onSubmit={onChatSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400"
              >
                +
              </button>
              <div className="flex-1">
                <input
                  className="w-full text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                  value={prompt}
                  onChange={(event) => onPromptChange(event.target.value)}
                  placeholder="Describe what you want to create..."
                  onKeyDown={onKeyDown}
                />
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500"
                onClick={onOpenImportTemplate}
              >
                Template
              </button>
              <button
                type="submit"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white"
              >
                ^
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            {renderStageContent()}
          </div>
        </div>
      </main>

      <aside className="w-16 border-l border-slate-200 bg-slate-50 flex flex-col items-center py-6 gap-4 text-slate-400 text-xs">
        <div className="h-10 w-10 rounded-xl bg-slate-200" />
        <div className="h-10 w-10 rounded-xl bg-slate-200" />
        <div className="h-10 w-10 rounded-xl bg-slate-200" />
        <div className="h-10 w-10 rounded-xl bg-slate-200" />
      </aside>
    </div>
  )
}
