import { useCallback, useEffect, useMemo, useState } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type PageTextItem = {
  id: string
  str: string
  x: number
  y: number
  width: number
  fontSize: number
}

type PageData = {
  width: number
  height: number
  image: string
  items: PageTextItem[]
}

interface PdfTextEditorLiteProps {
  pdfUrl: string
  onClose: () => void
}

export function PdfTextEditorLite({ pdfUrl, onClose }: PdfTextEditorLiteProps) {
  const [pages, setPages] = useState<PageData[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editedItems, setEditedItems] = useState<Record<string, string>>({})

  const loadPdf = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(pdfUrl)
      const buffer = await resp.arrayBuffer()
      const pdf = await getDocument({ data: buffer }).promise
      const loaded: PageData[] = []

      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 1.2 })

        // Render page to image
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: ctx, viewport }).promise
        const image = canvas.toDataURL('image/png')

        // Extract text items
        const textContent = await page.getTextContent()
        const items: PageTextItem[] = textContent.items
          .map((raw, idx) => {
            const it = raw as any
            const transform: number[] = Array.isArray(it?.transform) ? it.transform : [1, 0, 0, 1, 0, 0]
            const [a, b, , , e, f] = transform
            const x = typeof e === 'number' ? e : 0
            const y = typeof f === 'number' ? f : 0
            const fontSize = Math.hypot(a || 0, b || 0) || it?.height || 12
            const width = ((it?.width as number | undefined) || fontSize) * viewport.scale
            const str = typeof it?.str === 'string' ? it.str : ''
            return { id: `${i}-${idx}`, str, x, y, width, fontSize }
          })
          .filter((it) => it.str.length > 0)

        loaded.push({
          width: viewport.width,
          height: viewport.height,
          image,
          items,
        })
      }

      setPages(loaded)
      const initialEdits: Record<string, string> = {}
      loaded.forEach((p) =>
        p.items.forEach((it) => {
          initialEdits[it.id] = it.str
        }),
      )
      setEditedItems(initialEdits)
    } catch (e: any) {
      setError(e?.message || 'Failed to load PDF')
    } finally {
      setLoading(false)
    }
  }, [pdfUrl])

  useEffect(() => {
    loadPdf()
  }, [loadPdf])

  const handleChange = (id: string, value: string) => {
    setEditedItems((prev) => ({ ...prev, [id]: value }))
  }

  const handleDownload = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const doc = await PDFDocument.create()
      const font = await doc.embedFont(StandardFonts.Helvetica)

      for (const page of pages) {
        const pdfPage = doc.addPage([page.width, page.height])
        const bg = await doc.embedPng(page.image)
        pdfPage.drawImage(bg, { x: 0, y: 0, width: page.width, height: page.height })

        page.items.forEach((item) => {
          const text = editedItems[item.id] ?? item.str
          const yPdf = page.height - item.y // flip coordinate to bottom-left origin
          pdfPage.drawText(text, {
            x: item.x,
            y: yPdf - item.fontSize,
            size: item.fontSize || 12,
            font,
            color: rgb(0, 0, 0),
          })
        })
      }

      const bytes = await doc.save()
      const arrayBuffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(arrayBuffer).set(bytes)
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'edited.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message || 'Failed to generate PDF')
    } finally {
      setSaving(false)
    }
  }, [editedItems, pages])

  const pageCount = useMemo(() => pages.length, [pages])

  return (
    <div className="w-full h-full flex flex-col bg-slate-950">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <h3 className="text-slate-100 font-semibold">Text Editor (lite)</h3>
          <span className="text-xs text-slate-400">Pages: {pageCount || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={saving || loading || pages.length === 0}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Download edited PDF'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-700 text-slate-100 text-sm hover:bg-slate-600"
          >
            Back to preview
          </button>
        </div>
      </div>

      {error && <div className="px-4 py-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-600">{error}</div>}

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        {loading && <div className="text-slate-300 text-sm">Loading PDF…</div>}
        {!loading &&
          pages.map((page, pageIdx) => (
            <div
              key={page.image}
              className="relative bg-slate-900 border border-slate-800 rounded-lg p-2 shadow"
              style={{ width: page.width, minHeight: page.height }}
            >
              <div className="absolute inset-2">
                <img
                  src={page.image}
                  alt={`Page ${pageIdx + 1}`}
                  className="w-full h-auto rounded border border-slate-800 shadow pointer-events-none select-none"
                />
                <div className="absolute inset-0">
                  {page.items.map((item) => {
                    const yTop = page.height - item.y
                    return (
                      <div
                        key={item.id}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => handleChange(item.id, (e.target as HTMLDivElement).innerText)}
                        className="absolute bg-transparent outline-none focus:ring-1 focus:ring-blue-400 rounded px-0.5"
                        style={{
                          left: item.x,
                          top: yTop - item.fontSize * 0.85,
                          minWidth: Math.max(item.width, 4),
                          fontSize: item.fontSize,
                          lineHeight: '1.05',
                          color: '#111827',
                        }}
                      >
                        {editedItems[item.id] ?? item.str}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        {!loading && pages.length === 0 && <div className="text-slate-400 text-sm">No pages loaded.</div>}
      </div>
    </div>
  )
}

export default PdfTextEditorLite

