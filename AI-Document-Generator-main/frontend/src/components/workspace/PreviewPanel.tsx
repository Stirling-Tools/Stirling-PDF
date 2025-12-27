import { useMemo } from 'react'
import { DocumentState } from '../../types'
import PdfThumbnailViewer from '../pdfTextEditor/PdfThumbnailViewer'
// import PdfTextEditorFull from '../pdfTextEditor/PdfTextEditorFull'

interface PreviewPanelProps {
  currentDoc: DocumentState | null
  isGenerating: boolean
  isLivePreviewing: boolean
  skipTemplates: boolean
  onPdfReplaced: (pdfUrl: string) => void
}

export function PreviewPanel({
  currentDoc,
  isGenerating,
  isLivePreviewing,
  skipTemplates,
  onPdfReplaced,
}: PreviewPanelProps) {
  // Keep around while editor is hidden so we don't lose the apply handler
  void onPdfReplaced

  const hasDocumentStarted = useMemo(() => {
    const latex = currentDoc?.latex || ''
    return /\\begin\s*{document}/i.test(latex)
  }, [currentDoc?.latex])

  const canRenderPdf = useMemo(() => {
    if (!currentDoc?.pdfUrl) return false
    // While live preview is streaming, wait until the document body starts
    if (isLivePreviewing) return hasDocumentStarted
    return true
  }, [currentDoc?.pdfUrl, hasDocumentStarted, isLivePreviewing])

  const heading = useMemo(() => {
    if (isGenerating) return 'Generating ...'
    if (isLivePreviewing) return 'Live updating preview'
    if (currentDoc?.pdfUrl) return 'Preview ready'
    return 'PDF preview'
  }, [currentDoc?.pdfUrl, isGenerating, isLivePreviewing])

  return (
    <div className="flex-1 flex flex-col bg-slate-950">
      <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <h2 className="font-semibold text-slate-200">{heading}</h2>
          {currentDoc && (
            <span className="text-xs text-slate-500 px-2 py-1 bg-slate-800 rounded border border-slate-700">
              {currentDoc.documentType}
            </span>
          )}
          {skipTemplates && (
            <span className="text-[11px] text-amber-200 px-2 py-1 rounded bg-amber-500/20 border border-amber-600">
              Skipping saved layouts
            </span>
          )}
          {isLivePreviewing && (
            <span className="text-[11px] text-blue-200 px-2 py-1 rounded bg-blue-600/20 border border-blue-500 animate-pulse">
              Rendering live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {currentDoc?.pdfUrl && (
            <a
              href={currentDoc.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center"
            >
              Download PDF
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {canRenderPdf ? (
          <div className="h-full">
            {/* Temporarily hiding the interactive editor; restore when edit mode returns */}
            {/*
            <PdfTextEditorFull
              pdfUrl={currentDoc?.pdfUrl || ''}
              onApply={(nextUrl: string) => {
                onPdfReplaced(nextUrl)
              }}
            />
            */}
            <PdfThumbnailViewer pdfUrl={currentDoc?.pdfUrl || ''} isLivePreviewing={isLivePreviewing} />
          </div>
        ) : (
          <div className="flex-1 bg-slate-900 overflow-auto p-6">
            {isGenerating || isLivePreviewing ? (
              <div className="relative w-full h-full overflow-auto bg-slate-900 rounded-lg border border-slate-800 shadow-inner">
                <div className="flex justify-center py-8">
                  <div
                    className="relative rounded-2xl border border-slate-300/60 bg-white shadow-2xl overflow-hidden"
                    style={{
                      width: '860px',
                      maxWidth: '90vw',
                      aspectRatio: '1 / 1.414',
                    }}
                  >
                    <div className="h-12 bg-slate-100 border-b border-slate-200 animate-pulse" />
                    <div className="p-8 space-y-4">
                      {[1, 2, 3, 4].map((line) => (
                        <div
                          key={`line-top-${line}`}
                          className="h-4 rounded-full bg-slate-200 animate-pulse"
                          style={{ width: `${78 - line * 10}%` }}
                        />
                      ))}
                      <div className="h-40 rounded-xl bg-slate-100 border border-slate-200 animate-pulse" />
                      {[5, 6, 7].map((line) => (
                        <div
                          key={`line-bottom-${line}`}
                          className="h-4 rounded-full bg-slate-200 animate-pulse"
                          style={{ width: `${70 - (line - 5) * 8}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center text-sm text-slate-500 h-full">
                Generate a PDF to view the preview.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

