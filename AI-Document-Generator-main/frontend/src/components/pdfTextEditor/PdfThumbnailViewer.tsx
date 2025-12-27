import { useEffect, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type ThumbnailPage = {
  id: string
  dataUrl: string
  width: number
  height: number
}

function PdfPreviewSkeleton() {
  return (
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
  )
}

interface PdfThumbnailViewerProps {
  pdfUrl: string
  isLivePreviewing?: boolean
}

export function PdfThumbnailViewer({ pdfUrl, isLivePreviewing = false }: PdfThumbnailViewerProps) {
  const [pages, setPages] = useState<ThumbnailPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [hasRenderedPage, setHasRenderedPage] = useState(false)

  useEffect(() => {
    if (!pdfUrl) {
      setPages([])
      setHasRenderedPage(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(pdfUrl, { signal: controller.signal })
        if (!response.ok) {
          throw new Error('Unable to download PDF preview')
        }
        const buffer = await response.arrayBuffer()
        const pdf = await getDocument({ data: buffer }).promise
        const next: ThumbnailPage[] = []
        try {
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber)
            const viewport = page.getViewport({ scale: 0.85 })
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (ctx) {
              canvas.width = viewport.width
              canvas.height = viewport.height
              await page.render({ canvasContext: ctx, viewport }).promise
              next.push({
                id: `page-${pageNumber}`,
                dataUrl: canvas.toDataURL('image/png'),
                width: viewport.width,
                height: viewport.height,
              })
              canvas.width = 0
              canvas.height = 0
            }
            page.cleanup?.()
          }
        } finally {
          try {
            pdf.cleanup?.()
            await pdf.destroy?.()
          } catch {
            // ignore cleanup errors
          }
        }
        if (!cancelled) {
          setPages(next)
          if (next.length > 0) {
            setHasRenderedPage(true)
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load PDF preview'
          const normalized = message.toLowerCase()
          if (
            isLivePreviewing &&
            (normalized.includes('zero bytes') || normalized.includes('file is empty') || normalized.includes('pdf is empty'))
          ) {
            setError(null)
          } else {
            setError(message)
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [pdfUrl, isLivePreviewing])

  const shouldShowSkeleton = (loading && !hasRenderedPage && pages.length === 0) || (isLivePreviewing && pages.length === 0 && !error && !hasRenderedPage)

  return (
    <div className="flex h-full flex-col bg-slate-900">
      {error && (
        <div className="border-b border-amber-700 bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="relative flex-1 overflow-y-auto px-6 py-6">
        <div className="sticky top-0 z-10 mb-4 flex items-center justify-end gap-3 rounded-lg border border-slate-800 bg-slate-850/80 px-3 py-2 backdrop-blur">
          <span className="text-xs text-slate-300">Zoom</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))}
              className="h-8 w-8 rounded border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-750"
            >
              −
            </button>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-2 w-32 accent-blue-500"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 100) / 100))}
              className="h-8 w-8 rounded border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-750"
            >
              +
            </button>
            <span className="w-12 text-right text-xs text-slate-300">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {shouldShowSkeleton && <PdfPreviewSkeleton />}

        {!shouldShowSkeleton && pages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Preview unavailable.</div>
        )}

        {!shouldShowSkeleton && pages.length > 0 && (
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-8">
            {pages.map((page) => {
              const baseScale = Math.min(920 / page.width, 1)
              const displayScale = baseScale * zoom
              const displayWidth = page.width * displayScale
              const displayHeight = page.height * displayScale
              return (
                <div
                  key={page.id}
                  className="overflow-hidden rounded-lg border border-slate-800 bg-white shadow-2xl"
                  style={{
                    width: displayWidth,
                    height: displayHeight,
                    maxWidth: '100%',
                  }}
                >
                  <img
                    src={page.dataUrl}
                    alt={`PDF page ${page.id}`}
                    className="block h-full w-full select-none object-contain"
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default PdfThumbnailViewer

