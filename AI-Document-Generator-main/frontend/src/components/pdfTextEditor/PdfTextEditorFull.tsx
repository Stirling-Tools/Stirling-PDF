import type { PointerEvent as ReactPointerEvent } from 'react'
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { PdfJsonDocument, PdfJsonFont, PdfJsonPage, PdfJsonTextElement } from './pdfTextEditorTypes'
import ZoomControls from './ZoomControls'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

interface PdfTextEditorFullProps {
  pdfUrl: string
  onApply: (nextPdfUrl: string) => void
}

type TextBox = {
  id: string
  text: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  fontWeight?: number | string | null
  fontStyle?: 'normal' | 'italic' | null
  fontId?: string | null
  baseFont?: string | null
  color?: string | null
  groupId?: string | null
}

type ImageBox = {
  id: string
  dataUrl: string | null
  left: number
  top: number
  width: number
  height: number
}

type EditorPage = {
  width: number
  height: number
  background: string | null
  textBoxes: TextBox[]
  imageBoxes: ImageBox[]
}

type Selection =
  | { type: 'text'; pageIndex: number; ids: string[]; groupId?: string | null }
  | { type: 'image'; pageIndex: number; id: string }
  | null

type DragState =
  | {
      type: 'text'
      pageIndex: number
      ids: string[]
      startX: number
      startY: number
      initialPositions: Record<string, { left: number; top: number; width: number; height: number }>
    }
  | {
      type: 'image'
      pageIndex: number
      id: string
      startX: number
      startY: number
      initialLeft: number
      initialTop: number
      initialWidth?: number
      initialHeight?: number
    }

type ResizeState = {
  type: 'text' | 'image'
  pageIndex: number
  id: string
  startX: number
  startY: number
  initialWidth: number
  initialHeight: number
  initialTop: number
  initialLeft: number
  mode: 'corner' | 'text-top' | 'text-bottom'
}

type GroupResizeState = {
  type: 'text-group'
  pageIndex: number
  ids: string[]
  startX: number
  startY: number
  initialGroup: { left: number; top: number; width: number; height: number }
  initialBoxes: Record<string, { left: number; top: number; width: number; height: number }>
}

interface PdfEditorResponse {
  document: PdfJsonDocument | null
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clonePages = (pages: EditorPage[]) => JSON.parse(JSON.stringify(pages)) as EditorPage[]

const sanitizeText = (value: string | null | undefined) => (value ?? '').replace(/\u00a0/g, ' ')

const stripSubsetPrefix = (name?: string | null): string | null => {
  if (!name) return null
  const match = name.match(/^[A-Z]{6}\+(.+)$/)
  return match ? match[1] : name
}

const pickFontPayload = (font: PdfJsonFont) => {
  if (font.webProgram && font.webProgram.length > 0) {
    return { data: font.webProgram, format: font.webProgramFormat }
  }
  if (font.pdfProgram && font.pdfProgram.length > 0) {
    return { data: font.pdfProgram, format: font.pdfProgramFormat }
  }
  if (font.program && font.program.length > 0) {
    return { data: font.program, format: font.programFormat }
  }
  return null
}

const guessFontStack = (baseName?: string | null) => {
  const normalized = stripSubsetPrefix(baseName)?.toLowerCase() || ''
  if (!normalized) return 'inherit'
  if (normalized.includes('times')) return '"Times New Roman", Times, serif'
  if (normalized.includes('helvetica') || normalized.includes('arial')) return 'Arial, Helvetica, sans-serif'
  if (normalized.includes('courier')) return '"Courier New", Courier, monospace'
  if (normalized.includes('mono')) return '"Courier New", Courier, monospace'
  if (normalized.includes('serif')) return '"Times New Roman", Times, serif'
  if (normalized.includes('sans')) return 'Arial, Helvetica, sans-serif'
  return 'inherit'
}

const guessFontWeight = (baseName?: string | null): number | string | undefined => {
  const normalized = stripSubsetPrefix(baseName)?.toLowerCase() || ''
  if (!normalized) return undefined
  if (/(black|heavy|ultra|extra\s*bold|extrabold)/.test(normalized)) return 900
  if (/(bold|demi|semi[-\s]?bold|medium)/.test(normalized)) return 700
  if (/(light|thin|hairline)/.test(normalized)) return 300
  return undefined
}

const decodeBase64 = (value: string): Uint8Array => {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const buildFontFamilyName = (font: PdfJsonFont): string => {
  const seed = stripSubsetPrefix(font.baseName) || font.uid || font.id || 'pdf-font'
  return `pdf-font-${seed.replace(/[^a-zA-Z0-9_-]/g, '')}`
}


const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const normalizeFontFormat = (format?: string | null): string | undefined => {
  if (!format) return undefined
  const lower = format.toLowerCase()
  if (lower.includes('woff2')) return 'woff2'
  if (lower.includes('woff')) return 'woff'
  if (lower.includes('otf') || lower.includes('opentype')) return 'opentype'
  if (lower.includes('ttf') || lower.includes('truetype')) return 'truetype'
  return undefined
}

const useDocumentFonts = (fonts: PdfJsonFont[] | null | undefined) => {
  const [familyMap, setFamilyMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!fonts || fonts.length === 0 || typeof FontFace === 'undefined') {
      setFamilyMap(new Map())
      return
    }

    let disposed = false
    const active: { face: FontFace; url?: string }[] = []

    const registerFonts = async () => {
      const next = new Map<string, string>()
      for (const font of fonts) {
        if (!font) continue
        const payload = pickFontPayload(font)
        if (!payload) continue
        try {
          const buffer = decodeBase64(payload.data)
          const arrayBuffer =
            buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
          const blob = new Blob([arrayBuffer], { type: 'font/ttf' })
          const url = URL.createObjectURL(blob)
          const familyName = buildFontFamilyName(font)
          const formatHint = normalizeFontFormat(payload.format)
          const source = formatHint ? `url(${url}) format('${formatHint}')` : `url(${url})`
          const face = new FontFace(familyName, source)
          await face.load()
          document.fonts.add(face)
          active.push({ face, url })
          if (font.id) next.set(font.id, familyName)
          if (font.uid) next.set(font.uid, familyName)
          if (font.pageNumber !== null && font.pageNumber !== undefined && font.id) {
            next.set(`${font.pageNumber}:${font.id}`, familyName)
          }
        } catch (err) {
          console.warn('Failed to register font for editor', err)
        }
      }
      if (!disposed) {
        setFamilyMap(next)
      } else {
        next.forEach((_, key) => {
          next.delete(key)
        })
      }
    }

    registerFonts()

    return () => {
      disposed = true
      active.forEach(({ face, url }) => {
        try {
          document.fonts.delete(face)
        } catch {
          // ignore
        }
        if (url) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [fonts])

  return familyMap
}

const extractTop = (pageHeight: number, element: PdfJsonTextElement): number => {
  const y = typeof element.y === 'number' ? element.y : pageHeight
  const rawTop = pageHeight - y
  return Number.isFinite(rawTop) ? rawTop : 0
}

const clamp01 = (value: number) => clamp(value, 0, 1)

const normalizePdfComponents = (components: number[]): number[] => {
  if (!components.length) return components
  const maxAbs = Math.max(...components.map((v) => Math.abs(v)))
  if (maxAbs <= 1.0001) {
    return components.map((v) => clamp01(v))
  }
  // assume 0–255 (or similar) and normalize to 0–1
  return components.map((v) => clamp01(v / 255))
}

const pdfTextColorToCss = (color?: { colorSpace?: string | null; components?: number[] | null } | null): string | null => {
  if (!color || !color.components || color.components.length === 0) return null
  const comps = normalizePdfComponents(color.components)
  const space = (color.colorSpace || '').toLowerCase()
  const to255 = (v: number) => Math.round(clamp01(v) * 255)

  if (space.includes('rgb') && comps.length >= 3) {
    const [r, g, b] = comps
    return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`
  }

  if (space.includes('gray') && comps.length >= 1) {
    const v = comps[0]
    const c = to255(v)
    return `rgb(${c}, ${c}, ${c})`
  }

  if (space.includes('cmyk') && comps.length >= 4) {
    const [c, m, y, k] = normalizePdfComponents(comps)
    const toC = (v: number) => 1 - Math.min(1, v * (1 - k) + k)
    return `rgb(${to255(toC(c))}, ${to255(toC(m))}, ${to255(toC(y))})`
  }

  return null
}

const normalizeFontColorString = (color?: string | null): string | null => {
  if (!color) return null
  const trimmed = color.trim()
  const hex6 = trimmed.match(/^#?([0-9a-f]{6})$/i)
  if (hex6) {
    return `#${hex6[1].toLowerCase()}`
  }
  const hex3 = trimmed.match(/^#?([0-9a-f]{3})$/i)
  if (hex3) {
    const [r, g, b] = hex3[1].split('')
    return `#${(r + r + g + g + b + b).toLowerCase()}`
  }
  const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)\s*$/i)
  if (rgbMatch) {
    const clamp255 = (v: string) => clamp(parseInt(v, 10), 0, 255)
    const r = clamp255(rgbMatch[1])
    const g = clamp255(rgbMatch[2])
    const b = clamp255(rgbMatch[3])
    return `rgb(${r}, ${g}, ${b})`
  }
  return null
}

const cssColorToPdfRgb = (color?: string | null) => {
  if (!color) return rgb(0, 0, 0)

  const rgbMatch = color.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
  if (rgbMatch) {
    const [, rStr, gStr, bStr] = rgbMatch
    const toUnit = (v: string) => clamp(parseInt(v, 10) / 255, 0, 1)
    return rgb(toUnit(rStr), toUnit(gStr), toUnit(bStr))
  }

  const hexMatch = color.match(/^#([0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const toUnit = (v: number) => clamp(v / 255, 0, 1)
    return rgb(toUnit(r), toUnit(g), toUnit(b))
  }

  return rgb(0, 0, 0)
}

const isBoldWeight = (weight?: number | string | null) => {
  if (typeof weight === 'number') return weight >= 600
  if (typeof weight === 'string') return weight.toLowerCase().includes('bold')
  return false
}

const cssToHexColor = (color?: string | null) => {
  if (!color) return '#000000'
  const rgbMatch = color.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch
    const toHex = (v: string) => {
      const num = clamp(parseInt(v, 10), 0, 255)
      return num.toString(16).padStart(2, '0')
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i)
  if (hexMatch) {
    return `#${hexMatch[1]}`
  }
  return '#000000'
}

const buildTextBoxes = (page: PdfJsonPage, fontLookup: Map<string, PdfJsonFont>): TextBox[] => {
  const height = typeof page.height === 'number' ? page.height : 792
  const width = typeof page.width === 'number' ? page.width : 612
  const elements = page.textElements ?? []

  const inferFontWeight = (element: PdfJsonTextElement, baseFont?: string | null) => {
    const explicit = (element as any).fontWeight
    if (explicit !== undefined && explicit !== null) {
      return explicit
    }
    const meta = element.fontId ? fontLookup.get(element.fontId) : undefined
    if (meta?.fontDescriptorFlags !== null && meta?.fontDescriptorFlags !== undefined) {
      // PDF FontDescriptor flag 256 (0x100) indicates "ForceBold"
      if ((meta.fontDescriptorFlags & 0x100) === 0x100) {
        return 700
      }
    }
    return guessFontWeight(baseFont)
  }

  const boxes = elements
    .map((element, idx) => {
      const text = sanitizeText(element.text)
      const computedFontSize = element.fontSize ?? element.height ?? 12
      const rawWidth =
        element.width ??
        Math.max(
          text.length * Math.max(computedFontSize * 0.55, 6), // conservative estimate when width missing
          12
        )
      const boxWidth = clamp(rawWidth, 1, width)
      const boxHeight = Math.max(element.height ?? computedFontSize * 1.2, 12)
      const top = clamp(extractTop(height, element), 0, height - boxHeight)
      const rawLeft = element.x ?? 0
      const left = clamp(rawLeft, 0, width - boxWidth) // clamp using actual width to avoid overflow
      const font = element.fontId ? fontLookup.get(element.fontId) : undefined
      const baseFont = font?.baseName || font?.uid || font?.id || null
      const fillCss = pdfTextColorToCss(element.fillColor as any)
      const strokeCss = pdfTextColorToCss(element.strokeColor as any)
      const fontCss = normalizeFontColorString(font?.color)
      const color = fillCss || strokeCss || fontCss || null
      const fontWeight = inferFontWeight(element, baseFont)
      const rawStyle = (element as any).fontStyle
      const fontStyle: 'normal' | 'italic' | null =
        rawStyle === 'italic' ? 'italic' : rawStyle === 'normal' ? 'normal' : null
      return {
        id: (element as any).id ?? `text-${idx}`,
        text,
        left,
        top,
        width: boxWidth,
        height: boxHeight,
        fontSize: computedFontSize,
        fontWeight,
        fontStyle,
        fontId: element.fontId,
        baseFont,
        color,
        groupId: null,
      }
    })
    .filter((box) => box.text.trim().length > 0 || box.width > 0)

  // Deduplicate overlapping identical boxes (helps avoid doubled numeric columns)
  const EPS = 1.5
  const overlapsALot = (a: TextBox, b: TextBox) => {
    const ax2 = a.left + a.width
    const ay2 = a.top + a.height
    const bx2 = b.left + b.width
    const by2 = b.top + b.height

    const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.left, b.left))
    const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.top, b.top))
    const interArea = ix * iy
    const aArea = Math.max(1, a.width * a.height)
    const bArea = Math.max(1, b.width * b.height)
    const iou = interArea / (aArea + bArea - interArea)

    const closePos = Math.abs(a.left - b.left) < EPS && Math.abs(a.top - b.top) < EPS
    return closePos || iou > 0.8
  }

  const score = (t: string) => {
    const s = sanitizeText(t).trim()
    const hasCurrency = /^[\s\u00a0]*[$€£¥]/.test(s) ? 1 : 0
    const nonSpace = s.replace(/\s+/g, '').length
    const digits = (s.match(/\d/g) || []).length
    return [hasCurrency, nonSpace, digits] as const
  }

  const prefer = (a: TextBox, b: TextBox) => {
    const sa = score(a.text)
    const sb = score(b.text)
    if (sa[0] !== sb[0]) return sa[0] > sb[0] ? a : b
    if (sa[1] !== sb[1]) return sa[1] > sb[1] ? a : b
    if (sa[2] !== sb[2]) return sa[2] > sb[2] ? a : b
    return a.text.length >= b.text.length ? a : b
  }

  const deduped: TextBox[] = []
  for (const box of boxes) {
    const hit = deduped.findIndex((b) => overlapsALot(box, b))
    if (hit === -1) {
      deduped.push(box)
    } else {
      deduped[hit] = prefer(box, deduped[hit])
    }
  }

  return deduped
}

const buildImageBoxes = (page: PdfJsonPage): ImageBox[] => {
  const height = typeof page.height === 'number' ? page.height : 792
  const width = typeof page.width === 'number' ? page.width : 612
  const elements = page.imageElements ?? []

  return elements
    .filter((element) => Boolean(element.imageData))
    .map((element, idx) => {
    const boxWidth = Math.max(element.width ?? 64, 24)
    const boxHeight = Math.max(element.height ?? 64, 24)
    const rawTop =
      typeof element.top === 'number'
        ? element.top
        : typeof element.y === 'number'
          ? height - element.y - boxHeight
          : 0
    const left = clamp(element.x ?? element.left ?? 0, 0, width - boxWidth)
    const top = clamp(rawTop, 0, height - boxHeight)
    return {
      id: element.id ?? `image-${idx}`,
      dataUrl: element.imageData ?? null,
      left,
      top,
      width: boxWidth,
      height: boxHeight,
    }
    })
    .filter((img) => {
      // Drop page-sized background images so text stays over a white card instead of a rendered PDF thumbnail
      const coversWidth = img.width >= width * 0.9
      const coversHeight = img.height >= height * 0.9
      return !(coversWidth && coversHeight)
    })
}

const buildEditorPages = (
  document: PdfJsonDocument | null,
  backgrounds: Array<{ dataUrl: string | null; width: number; height: number }>
): EditorPage[] => {
  const pages = document?.pages ?? []
  const fontLookup = new Map<string, PdfJsonFont>()
  document?.fonts?.forEach((font) => {
    if (!font) return
    if (font.id) {
      fontLookup.set(font.id, font)
    }
    if (font.uid) {
      fontLookup.set(font.uid, font)
    }
    if (font.pageNumber !== null && font.pageNumber !== undefined && font.id) {
      fontLookup.set(`${font.pageNumber}:${font.id}`, font)
    }
  })
  return pages.map((page, index) => {
    const bg = backgrounds[index]
    return {
      width: typeof page.width === 'number' ? page.width : bg?.width ?? 612,
      height: typeof page.height === 'number' ? page.height : bg?.height ?? 792,
      background: bg?.dataUrl ?? null,
      textBoxes: buildTextBoxes(page, fontLookup),
      imageBoxes: buildImageBoxes(page),
    }
  })
}

const useResizeObserver = (
  ref: RefObject<HTMLDivElement | null>,
  onChange: (width: number) => void
) => {
  useEffect(() => {
    const target = ref.current
    if (!target || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry?.contentRect?.width) {
        onChange(entry.contentRect.width)
      }
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [ref, onChange])
}

const renderPdfBackgrounds = async (
  buffer: ArrayBuffer
): Promise<Array<{ dataUrl: string | null; width: number; height: number }>> => {
  const pdf = await getDocument({ data: buffer }).promise
  const results: Array<{ dataUrl: string | null; width: number; height: number }> = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        canvas.width = baseViewport.width
        canvas.height = baseViewport.height
        await page.render({ canvasContext: ctx, viewport: baseViewport }).promise
      }
      results.push({
        dataUrl: ctx ? canvas.toDataURL('image/png') : null,
        width: baseViewport.width,
        height: baseViewport.height,
      })
      if (ctx) {
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

  return results
}

export function PdfTextEditorFull({ pdfUrl, onApply }: PdfTextEditorFullProps) {
  const [pages, setPages] = useState<EditorPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const interactionLocked = loading || saving
  const [selection, setSelection] = useState<Selection>(null)
  const selectionRef = useRef<Selection>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const [groupResizeState, setGroupResizeState] = useState<GroupResizeState | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollPosRef = useRef<number>(0)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const [zoom, setZoom] = useState(1)
  const [addTextMode, setAddTextMode] = useState(false)
  const [documentFonts, setDocumentFonts] = useState<PdfJsonFont[]>([])
  const fontFamilyMap = useDocumentFonts(documentFonts)
  const [, setHistory] = useState<EditorPage[][]>([])
  const [, setFuture] = useState<EditorPage[][]>([])
  const pagesRef = useRef<EditorPage[]>([])
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const [marquee, setMarquee] = useState<{ pageIndex: number; left: number; top: number; width: number; height: number } | null>(null)
  const selectionBoxRef = useRef<{
    active: boolean
    pageIndex: number
    startX: number
    startY: number
    currentX: number
    currentY: number
    scale: number
  } | null>(null)

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const preserveScrollWhile = useCallback(
    (fn: () => void) => {
      const node = containerRef.current
      if (!node) {
        fn()
        return
      }
      const prevTop = node.scrollTop
      const prevHeight = node.scrollHeight
      const prevClient = node.clientHeight
      const prevDistFromBottom = prevHeight - prevTop - prevClient
      const wasNearBottom = prevDistFromBottom < 80

      fn()

      requestAnimationFrame(() => {
        const n = containerRef.current
        if (!n) return
        if (wasNearBottom) {
          n.scrollTop = n.scrollHeight
        } else {
          n.scrollTop = prevTop
        }
      })
    },
    []
  )

  const pushHistory = useCallback(() => {
    setHistory((prev) => [clonePages(pagesRef.current), ...prev].slice(0, 50))
    setFuture([])
  }, [])

  const applyPagesChange = useCallback(
    (mutator: (draft: EditorPage[]) => EditorPage[] | void) => {
      preserveScrollWhile(() => {
        setPages((prev) => {
          const prevSnapshot = clonePages(prev)
          const draft = clonePages(prev)
          const result = mutator(draft)
          const next = (result ?? draft) as EditorPage[]
          setHistory((hist) => [prevSnapshot, ...hist].slice(0, 50))
          setFuture([])
          setDirty(true)
          return next
        })
      })
    },
    [preserveScrollWhile]
  )

  const setTextSelection = useCallback(
    (pageIndex: number, ids: string[], additive = false, groupId?: string | null) => {
      setSelection((prev) => {
        if (additive && prev?.type === 'text' && prev.pageIndex === pageIndex) {
          const merged = Array.from(new Set([...prev.ids, ...ids]))
          return { type: 'text', pageIndex, ids: merged, groupId: null }
        }
        return { type: 'text', pageIndex, ids, groupId: groupId ?? null }
      })
    },
    []
  )

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.length) return prev
      const [last, ...rest] = prev
      setFuture((f) => [clonePages(pagesRef.current), ...f].slice(0, 50))
      setPages(last)
      return rest
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (!prev.length) return prev
      const [next, ...rest] = prev
      setHistory((h) => [clonePages(pagesRef.current), ...h].slice(0, 50))
      setPages(next)
      return rest
    })
  }, [])

  useResizeObserver(containerRef, setContainerWidth)

  const selectedTextBoxes = useMemo(() => {
    if (selection?.type !== 'text') return []
    const page = pages[selection.pageIndex]
    if (!page) return []
    return page.textBoxes.filter((box) => selection.ids.includes(box.id))
  }, [pages, selection])

  const updateSelectedTextBoxes = useCallback(
    (updater: (box: TextBox) => TextBox) => {
      if (selection?.type !== 'text') return
      applyPagesChange((draft) => {
        const page = draft[selection.pageIndex]
        if (!page) return draft
        page.textBoxes = page.textBoxes.map((box) =>
          selection.ids.includes(box.id) ? updater({ ...box }) : box
        )
        return draft
      })
    },
    [applyPagesChange, selection]
  )

  const fontSupportsItalic = useCallback(
    (font?: PdfJsonFont | null) => {
      if (!font) return false
      const name = stripSubsetPrefix(font.baseName) || ''
      if (/italic|oblique/i.test(name)) return true
      if (typeof font.italicAngle === 'number' && Math.abs(font.italicAngle) > 0.01) return true
      if (typeof font.fontDescriptorFlags === 'number' && (font.fontDescriptorFlags & 0x40)) return true // italic flag
      return false
    },
    []
  )

  const selectedFontMeta = useMemo(() => {
    const box = selectedTextBoxes[0]
    if (!box) return null
    const targetId = box.fontId || null
    const targetBase = stripSubsetPrefix(box.baseFont) || null
    return (
      documentFonts.find((f) => f.id === targetId || f.uid === targetId || `${f.pageNumber}:${f.id}` === targetId) ||
      documentFonts.find((f) => stripSubsetPrefix(f.baseName) === targetBase) ||
      null
    )
  }, [documentFonts, selectedTextBoxes])

  const anySupportsItalic = useMemo(() => documentFonts.some((f) => fontSupportsItalic(f)), [documentFonts, fontSupportsItalic])
  const selectedSupportsItalic = useMemo(() => fontSupportsItalic(selectedFontMeta), [fontSupportsItalic, selectedFontMeta])

  const selectedFontSize = selectedTextBoxes[0]?.fontSize ?? 12
  const selectedColor = cssToHexColor(selectedTextBoxes[0]?.color ?? '#000000')
  const isBold =
    selectedTextBoxes.length > 0 &&
    ((typeof selectedTextBoxes[0].fontWeight === 'number' && selectedTextBoxes[0].fontWeight >= 600) ||
      selectedTextBoxes[0].fontWeight === 'bold')
  const isItalic = selectedTextBoxes[0]?.fontStyle === 'italic'
  const hasTextSelection = selectedTextBoxes.length > 0

  const toggleBold = useCallback(() => {
    updateSelectedTextBoxes((box) => {
      const nextIsBold =
        (typeof box.fontWeight === 'number' && box.fontWeight >= 600) || box.fontWeight === 'bold'
      return { ...box, fontWeight: nextIsBold ? 'normal' : 700 }
    })
  }, [updateSelectedTextBoxes])

  const toggleItalic = useCallback(() => {
    if (!selectedSupportsItalic) return
    updateSelectedTextBoxes((box) => {
      const next = box.fontStyle === 'italic' ? 'normal' : 'italic'
      return { ...box, fontStyle: next }
    })
  }, [selectedSupportsItalic, updateSelectedTextBoxes])

  const adjustFontSize = useCallback(
    (delta: number) => {
      updateSelectedTextBoxes((box) => {
        const next = clamp((box.fontSize || 12) + delta, 4, 200)
        return { ...box, fontSize: next }
      })
    },
    [updateSelectedTextBoxes]
  )

  const setFontSizeValue = useCallback(
    (value: number) => {
      updateSelectedTextBoxes((box) => {
        const next = clamp(value, 4, 200)
        return { ...box, fontSize: next }
      })
    },
    [updateSelectedTextBoxes]
  )

  const setFontColorValue = useCallback(
    (value: string) => {
      updateSelectedTextBoxes((box) => ({ ...box, color: value }))
    },
    [updateSelectedTextBoxes]
  )

  // groupSelectedBoxes / ungroupSelectedBoxes removed (no longer used in UI)

  const addTextAt = useCallback(
    (pageIndex: number, x: number, y: number) => {
      const newId = `text-new-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
      applyPagesChange((draft) => {
        const page = draft[pageIndex]
        if (!page) return draft
        const defaultWidth = 220
        const defaultHeight = 40
        const fontSize = 18
        const clampedLeft = clamp(x, 0, page.width - defaultWidth)
        const clampedTop = clamp(y, 0, page.height - defaultHeight)
        const newBox: TextBox = {
          id: newId,
          text: 'New text',
          left: clampedLeft,
          top: clampedTop,
          width: defaultWidth,
          height: defaultHeight,
          fontSize,
          fontWeight: 'normal',
          fontStyle: 'normal',
          baseFont: null,
          fontId: null,
          color: '#000000',
          groupId: null,
        }
        page.textBoxes.push(newBox)
        return draft
      })
      setSelection({ type: 'text', pageIndex, ids: [newId], groupId: null })
    },
    [applyPagesChange]
  )


  const computeScale = useCallback(
    (page: EditorPage | undefined) => {
      if (!page || !containerWidth || page.width === 0) {
        return 1
      }
      const available = Math.max(containerWidth - 64, 200)
      const scale = available / page.width
      return clamp(scale, 0.4, 1.5)
    },
    [containerWidth]
  )

  const resolveFontFamily = useCallback(
    (fontId?: string | null, baseFont?: string | null) => {
      if (fontId) {
        const registered = fontFamilyMap.get(fontId)
        if (registered) {
          const fallback = guessFontStack(baseFont)
          return fallback && fallback !== 'inherit' ? `'${registered}', ${fallback}` : `'${registered}', sans-serif`
        }
      }
      const fallback = guessFontStack(baseFont)
      return fallback
    },
    [fontFamilyMap]
  )

  const joinSelected = useCallback(
    (pageIndex: number, ids: string[]) => {
      if (ids.length < 2) return
      applyPagesChange((draft) => {
        const page = draft[pageIndex]
        if (!page) return draft
        const selected = page.textBoxes.filter((box) => ids.includes(box.id))
        if (selected.length < 2) return draft
        const ordered = selected.sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top))
        const mergedText = ordered
          .map((box) => (box.text ?? '').trimEnd())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
        const left = Math.min(...ordered.map((b) => b.left))
        const top = Math.min(...ordered.map((b) => b.top))
        const right = Math.max(...ordered.map((b) => b.left + b.width))
        const bottom = Math.max(...ordered.map((b) => b.top + b.height))
        const mergedBox: TextBox = {
          ...ordered[0],
          id: ordered[0].id,
          text: mergedText,
          left,
          top,
          width: right - left,
          height: bottom - top,
        }
        page.textBoxes = page.textBoxes.filter((box) => !ids.includes(box.id))
        page.textBoxes.push(mergedBox)
        return draft
      })
      setSelection({ type: 'text', pageIndex, ids: [ids[0]] })
    },
    [applyPagesChange]
  )

  useEffect(() => {
    let cancelled = false
    const docController = new AbortController()
    const pdfController = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      const node = containerRef.current
      if (node) {
        scrollPosRef.current = node.scrollTop
      }
      try {
        const [docResponse, pdfResponse] = await Promise.all([
          fetch(`/api/v1/ai/pdf-editor/document?pdfUrl=${encodeURIComponent(pdfUrl)}`, {
            signal: docController.signal,
          }),
          fetch(pdfUrl, { signal: pdfController.signal }),
        ])

        if (!docResponse.ok) {
          const message = (await docResponse.json().catch(() => ({}))).error
          throw new Error(message || 'Failed to load PDF structure')
        }
        if (!pdfResponse.ok) {
          throw new Error('Unable to download generated PDF')
        }

        const payload = (await docResponse.json()) as PdfEditorResponse
        const pdfBuffer = await pdfResponse.arrayBuffer()
        const backgrounds = await renderPdfBackgrounds(pdfBuffer)
        if (cancelled) {
          return
        }
        const nextPages = buildEditorPages(payload.document, backgrounds)
        preserveScrollWhile(() => setPages(nextPages))
        const fonts =
          payload.document?.fonts?.filter((font): font is PdfJsonFont => Boolean(font)) ?? []
        setDocumentFonts(fonts)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF editor')
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
      docController.abort()
      pdfController.abort()
    }
  }, [pdfUrl])

  const startDrag = useCallback(
    (payload: { type: 'text' | 'image'; pageIndex: number; id: string; left: number; top: number }) =>
      (event: ReactPointerEvent) => {
        if (interactionLocked) return
        event.preventDefault()
        event.stopPropagation()
        pushHistory()
        if (payload.type === 'text') {
          const page = pagesRef.current[payload.pageIndex]
          if (!page) return
          const additive = event.metaKey || event.ctrlKey || event.shiftKey
          const currentSelection = selectionRef.current
          const existingSelectionIds =
            currentSelection?.type === 'text' &&
            currentSelection.pageIndex === payload.pageIndex &&
            currentSelection.ids.includes(payload.id)
              ? currentSelection.ids
              : null
          const targetBox = page.textBoxes.find((box) => box.id === payload.id)
          const groupMembers =
            targetBox?.groupId && !additive
              ? page.textBoxes.filter((box) => box.groupId === targetBox.groupId).map((box) => box.id)
              : []
          const targetIds = existingSelectionIds
            ? existingSelectionIds
            : additive && currentSelection?.type === 'text' && currentSelection.pageIndex === payload.pageIndex
              ? Array.from(new Set([...currentSelection.ids, payload.id]))
              : groupMembers.length > 1
                ? groupMembers
                : [payload.id]
          const groupId =
            targetBox?.groupId &&
            groupMembers.length > 1 &&
            groupMembers.length === targetIds.length &&
            targetIds.every((id) => groupMembers.includes(id))
              ? targetBox.groupId
              : null
          setTextSelection(payload.pageIndex, targetIds, false, groupId)
          const initialPositions: Record<string, { left: number; top: number; width: number; height: number }> = {}
          targetIds.forEach((id) => {
            const box = page.textBoxes.find((b) => b.id === id)
            if (box) {
              initialPositions[id] = { left: box.left, top: box.top, width: box.width, height: box.height }
            }
          })
          setDragState({
            type: 'text',
            pageIndex: payload.pageIndex,
            ids: targetIds,
            startX: event.clientX,
            startY: event.clientY,
            initialPositions,
          })
        } else {
          setSelection({ type: 'image', pageIndex: payload.pageIndex, id: payload.id })
          setDragState({
            type: 'image',
            pageIndex: payload.pageIndex,
            id: payload.id,
            startX: event.clientX,
            startY: event.clientY,
            initialLeft: payload.left,
            initialTop: payload.top,
          })
        }
      },
    [interactionLocked, pushHistory, setTextSelection]
  )

  const deleteTextBox = useCallback(
    (pageIndex: number, id: string) => {
      if (interactionLocked) return
      applyPagesChange((draft) => {
        const page = draft[pageIndex]
        if (!page) return draft
        page.textBoxes = page.textBoxes.filter((box) => box.id !== id)
        return draft
      })
      setSelection(null)
    },
    [applyPagesChange, interactionLocked]
  )

  const deleteImageBox = useCallback(
    (pageIndex: number, id: string) => {
      if (interactionLocked) return
      applyPagesChange((draft) => {
        const page = draft[pageIndex]
        if (!page) return draft
        page.imageBoxes = page.imageBoxes.filter((box) => box.id !== id)
        return draft
      })
      setSelection(null)
    },
    [applyPagesChange, interactionLocked]
  )

  const startResize = useCallback(
    (payload: {
      type: 'text' | 'image'
      pageIndex: number
      id: string
      width: number
      height: number
      top: number
      left: number
      mode: 'corner' | 'text-top' | 'text-bottom'
    }) =>
      (event: ReactPointerEvent) => {
        if (interactionLocked) return
        event.preventDefault()
        event.stopPropagation()
        pushHistory()
        if (payload.type === 'text') {
          setTextSelection(payload.pageIndex, [payload.id], event.metaKey || event.ctrlKey || event.shiftKey)
        } else {
          setSelection({ type: 'image', pageIndex: payload.pageIndex, id: payload.id })
        }
        setResizeState({
          type: payload.type,
          pageIndex: payload.pageIndex,
          id: payload.id,
          startX: event.clientX,
          startY: event.clientY,
          initialWidth: payload.width,
          initialHeight: payload.height,
          initialTop: payload.top,
          initialLeft: payload.left,
          mode: payload.mode,
        })
      },
    [interactionLocked, pushHistory]
  )

  const startGroupDrag = useCallback(
    (pageIndex: number, ids: string[]) => (event: ReactPointerEvent) => {
      if (interactionLocked) return
      if (!ids.length) return
      event.preventDefault()
      event.stopPropagation()
      pushHistory()
      const page = pagesRef.current[pageIndex]
      if (!page) return
      const initialPositions: Record<string, { left: number; top: number; width: number; height: number }> = {}
      ids.forEach((id) => {
        const box = page.textBoxes.find((b) => b.id === id)
        if (box) {
          initialPositions[id] = { left: box.left, top: box.top, width: box.width, height: box.height }
        }
      })
      setDragState({
        type: 'text',
        pageIndex,
        ids,
        startX: event.clientX,
        startY: event.clientY,
        initialPositions,
      })
    },
    [interactionLocked, pushHistory]
  )

  const startGroupResize = useCallback(
    (pageIndex: number, ids: string[]) => (event: ReactPointerEvent) => {
      if (interactionLocked) return
      if (!ids.length) return
      event.preventDefault()
      event.stopPropagation()
      pushHistory()
      const page = pagesRef.current[pageIndex]
      if (!page) return
      const selected = page.textBoxes.filter((b) => ids.includes(b.id))
      if (!selected.length) return
      const left = Math.min(...selected.map((b) => b.left))
      const top = Math.min(...selected.map((b) => b.top))
      const right = Math.max(...selected.map((b) => b.left + b.width))
      const bottom = Math.max(...selected.map((b) => b.top + b.height))
      const initialBoxes: Record<string, { left: number; top: number; width: number; height: number }> = {}
      selected.forEach((b) => {
        initialBoxes[b.id] = { left: b.left, top: b.top, width: b.width, height: b.height }
      })
      setGroupResizeState({
        type: 'text-group',
        pageIndex,
        ids,
        startX: event.clientX,
        startY: event.clientY,
        initialGroup: { left, top, width: right - left, height: bottom - top },
        initialBoxes,
      })
    },
    [interactionLocked, pushHistory]
  )

  const deleteSelectedTextBoxes = useCallback(
    (pageIndex: number, ids: string[]) => {
      if (interactionLocked) return
      applyPagesChange((draft) => {
        const page = draft[pageIndex]
        if (!page) return draft
        const idSet = new Set(ids)
        page.textBoxes = page.textBoxes.filter((box) => !idSet.has(box.id))
        return draft
      })
      setSelection(null)
    },
    [applyPagesChange, interactionLocked]
  )

  const deselect = useCallback(() => setSelection(null), [])

  const beginMarqueeSelection = useCallback(
    (pageIndex: number, scale: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement
      if (target.closest('[data-text-box="true"]')) return
      const rect = event.currentTarget.getBoundingClientRect()
      const startX = (event.clientX - rect.left) / scale
      const startY = (event.clientY - rect.top) / scale
      selectionBoxRef.current = {
        active: true,
        pageIndex,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        scale,
      }
      setMarquee({ pageIndex, left: startX, top: startY, width: 0, height: 0 })
    },
    []
  )

  const handlePageMouseDown = useCallback(
    (pageIndex: number, visualScale: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (interactionLocked) {
        event.preventDefault()
        return
      }
      if (addTextMode) {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - rect.left) / visualScale
        const y = (event.clientY - rect.top) / visualScale
        setAddTextMode(false)
        addTextAt(pageIndex, x, y)
        return
      }
      beginMarqueeSelection(pageIndex, visualScale)(event)
    },
    [addTextMode, addTextAt, beginMarqueeSelection, interactionLocked]
  )

  const updateMarqueeSelection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = selectionBoxRef.current
    if (!state?.active) return
    const rect = event.currentTarget.getBoundingClientRect()
    const currentX = (event.clientX - rect.left) / state.scale
    const currentY = (event.clientY - rect.top) / state.scale
    selectionBoxRef.current = { ...state, currentX, currentY }
    const left = Math.min(state.startX, currentX)
    const top = Math.min(state.startY, currentY)
    const width = Math.abs(currentX - state.startX)
    const height = Math.abs(currentY - state.startY)
    setMarquee({ pageIndex: state.pageIndex, left, top, width, height })
  }, [])

  const endMarqueeSelection = useCallback(() => {
    const state = selectionBoxRef.current
    if (!state?.active) return
    selectionBoxRef.current = null
    setMarquee(null)
    const page = pagesRef.current[state.pageIndex]
    if (!page) return
    const left = Math.min(state.startX, state.currentX)
    const top = Math.min(state.startY, state.currentY)
    const right = Math.max(state.startX, state.currentX)
    const bottom = Math.max(state.startY, state.currentY)
    const ids = page.textBoxes
      .filter((box) => {
        const boxRight = box.left + box.width
        const boxBottom = box.top + box.height
        const overlap = !(boxRight < left || box.left > right || boxBottom < top || box.top > bottom)
        return overlap
      })
      .map((b) => b.id)
    if (ids.length > 0) {
      setSelection({ type: 'text', pageIndex: state.pageIndex, ids })
    } else {
      deselect()
    }
  }, [deselect])
  useEffect(() => {
    if (!dragState && !resizeState && !groupResizeState) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault()
      preserveScrollWhile(() =>
        setPages((prev) =>
          prev.map((page, idx) => {
            if (dragState && idx === dragState.pageIndex) {
              const scale = computeScale(page) * zoom
              const deltaX = (event.clientX - dragState.startX) / scale
              const deltaY = (event.clientY - dragState.startY) / scale
              if (dragState.type === 'text') {
                const idSet = new Set(dragState.ids)
                return {
                  ...page,
                  textBoxes: page.textBoxes.map((box) => {
                    if (!idSet.has(box.id)) {
                      return box
                    }
                    const initial = dragState.initialPositions[box.id] ?? {
                      left: box.left,
                      top: box.top,
                      width: box.width,
                      height: box.height,
                    }
                    return {
                      ...box,
                      left: clamp(initial.left + deltaX, 0, page.width - box.width),
                      top: clamp(initial.top + deltaY, 0, page.height - box.height),
                    }
                  }),
                }
              }
              return {
                ...page,
                imageBoxes: page.imageBoxes.map((box) =>
                  box.id === dragState.id
                    ? {
                        ...box,
                        left: clamp(dragState.initialLeft + deltaX, 0, page.width - box.width),
                        top: clamp(dragState.initialTop + deltaY, 0, page.height - box.height),
                      }
                    : box
                ),
              }
            }

            if (resizeState && idx === resizeState.pageIndex) {
              const scale = computeScale(page) * zoom
              const deltaX = (event.clientX - resizeState.startX) / scale
              const deltaY = (event.clientY - resizeState.startY) / scale
              if (resizeState.type === 'text') {
                return {
                  ...page,
                  textBoxes: page.textBoxes.map((box) => {
                    if (box.id !== resizeState.id) {
                      return box
                    }
                    if (resizeState.mode === 'text-bottom') {
                      const maxHeight = page.height - resizeState.initialTop
                      const nextHeight = clamp(resizeState.initialHeight + deltaY, 16, maxHeight)
                      return { ...box, height: nextHeight }
                    }
                    if (resizeState.mode === 'text-top') {
                      const minHeight = 16
                      const maxTop = resizeState.initialTop + resizeState.initialHeight - minHeight
                      const nextTop = clamp(resizeState.initialTop + deltaY, 0, maxTop)
                      const deltaTop = resizeState.initialTop - nextTop
                      const nextHeight = clamp(
                        resizeState.initialHeight + deltaTop,
                        minHeight,
                        page.height - nextTop
                      )
                      return { ...box, top: nextTop, height: nextHeight }
                    }
                    return {
                      ...box,
                      width: clamp(
                        resizeState.initialWidth + deltaX,
                        32,
                        page.width - resizeState.initialLeft
                      ),
                      height: clamp(
                        resizeState.initialHeight + deltaY,
                        16,
                        page.height - resizeState.initialTop
                      ),
                    }
                  }),
                }
              }
              return {
                ...page,
                imageBoxes: page.imageBoxes.map((box) =>
                  box.id === resizeState.id
                    ? {
                        ...box,
                        width: clamp(
                          resizeState.initialWidth + deltaX,
                          32,
                          page.width - resizeState.initialLeft
                        ),
                        height: clamp(
                          resizeState.initialHeight + deltaY,
                          32,
                          page.height - resizeState.initialTop
                        ),
                      }
                    : box
                ),
              }
            }
            if (groupResizeState && idx === groupResizeState.pageIndex) {
              const scale = computeScale(page) * zoom
              const deltaX = (event.clientX - groupResizeState.startX) / scale
              const deltaY = (event.clientY - groupResizeState.startY) / scale
              const init = groupResizeState.initialGroup
              const ids = new Set(groupResizeState.ids)
              const newLeft = init.left
              const newTop = init.top
              const minWidth = 16
              const minHeight = 16
              const newWidth = clamp(init.width + deltaX, minWidth, page.width - newLeft)
              const newHeight = clamp(init.height + deltaY, minHeight, page.height - newTop)
              const baseW = init.width || 1
              const baseH = init.height || 1
              const scaleX = Math.max(0.1, newWidth / baseW)
              const scaleY = Math.max(0.1, newHeight / baseH)
              return {
                ...page,
                textBoxes: page.textBoxes.map((box) => {
                  if (!ids.has(box.id)) return box
                  const initial = groupResizeState.initialBoxes[box.id] || box
                  const relX = initial.left - init.left
                  const relY = initial.top - init.top
                  const left = clamp(newLeft + relX * scaleX, 0, page.width - 4)
                  const top = clamp(newTop + relY * scaleY, 0, page.height - 4)
                  const width = clamp(initial.width * scaleX, 4, page.width - left)
                  const height = clamp(initial.height * scaleY, 4, page.height - top)
                  return { ...box, left, top, width, height }
                }),
              }
            }
            return page
          })
        )
      )
    }

    const handlePointerUp = () => {
      setDragState(null)
      setResizeState(null)
      setGroupResizeState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, resizeState, groupResizeState, computeScale, pages, zoom, applyPagesChange])

  const handleTextChange = useCallback(
    (pageIndex: number, id: string, value: string) => {
      if (interactionLocked) return
      applyPagesChange((draft) => {
        if (!draft[pageIndex]) return draft
        draft[pageIndex].textBoxes = draft[pageIndex].textBoxes.map((box) =>
          box.id === id ? { ...box, text: value } : box
        )
        return draft
      })
    },
    [applyPagesChange, interactionLocked]
  )

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey
      if (!isMeta) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (key === 'j' && selection?.type === 'text' && selection.ids.length > 1) {
        event.preventDefault()
        joinSelected(selection.pageIndex, selection.ids)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [undo, redo, selection, joinSelected])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (interactionLocked) return
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      if (!selection) return
      event.preventDefault()
      if (selection.type === 'text') {
        selection.ids.forEach((id) => deleteTextBox(selection.pageIndex, id))
      } else if (selection.type === 'image') {
        deleteImageBox(selection.pageIndex, selection.id)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [selection, interactionLocked, deleteTextBox, deleteImageBox])

  useEffect(() => {
    Object.values(textareaRefs.current).forEach((node) => {
      if (!node) return
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight}px`
    })
  }, [pages, selection, containerWidth])

  const handleApplyEdits = useCallback(async () => {
    if (!pages.length) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const doc = await PDFDocument.create()
      const defaultFont = await doc.embedFont(StandardFonts.Helvetica)
      const FALLBACK_FONT_URL =
        'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNb4j5Ba_2c7A.ttf'
      let fallbackFont: any | null = null
      const getFallbackFont = async () => {
        if (fallbackFont) return fallbackFont
        try {
          const res = await fetch(FALLBACK_FONT_URL)
          const buffer = await res.arrayBuffer()
          fallbackFont = await doc.embedFont(new Uint8Array(buffer))
          return fallbackFont
        } catch (err) {
          console.warn('Fallback font load failed, using Helvetica', err)
          fallbackFont = defaultFont
          return fallbackFont
        }
      }
      const fontCache = new Map<string, any>()

      const getPdfFontForBox = async (box: TextBox) => {
        const cacheKey = box.fontId || box.baseFont || 'default'
        if (fontCache.has(cacheKey)) {
          return fontCache.get(cacheKey)
        }

        const meta = documentFonts.find(
          (f) => f.id === box.fontId || f.uid === box.fontId || f.baseName === box.baseFont
        )
        const payload = meta ? pickFontPayload(meta) : null

        if (!meta || !payload) {
          const fb = await getFallbackFont()
          fontCache.set(cacheKey, fb)
          return fb
        }

        try {
          const buffer = decodeBase64(payload.data)
          const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
          const embedded = await doc.embedFont(new Uint8Array(arrayBuffer))
          fontCache.set(cacheKey, embedded)
          return embedded
        } catch (err) {
          console.warn('Falling back to fallback font for box', box.id, err)
          const fb = await getFallbackFont()
          fontCache.set(cacheKey, fb)
          return fb
        }
      }
      const ensureFontCanEncode = async (
        font: any,
        text: string
      ): Promise<{ font: any; text: string; sanitized: boolean }> => {
        const candidates = [font, await getFallbackFont(), defaultFont].filter(Boolean)
        for (const candidate of candidates) {
          const encoder = (candidate as any)?.encodeText
          try {
            if (encoder) {
              encoder.call(candidate, text)
            }
            return { font: candidate, text, sanitized: false }
          } catch (err) {
            console.warn('Font lacks glyphs, trying next fallback', err)
          }
        }
        const sanitizedText = text.replace(/[^\x00-\x7F]/g, '?')
        return { font: await getFallbackFont(), text: sanitizedText, sanitized: sanitizedText !== text }
      }

      const tryDrawSvgText = async ({
        page,
        text,
        x,
        y,
        lineHeight,
        fontSize,
        width,
        color,
      }: {
        page: any
        text: string
        x: number
        y: number
        lineHeight: number
        fontSize: number
        width: number
        color: string
      }) => {
        try {
          const embedSvg = (doc as any)?.embedSvg
          if (typeof embedSvg !== 'function') {
            return false
          }
          const safeText = escapeXml(text)
          const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(width, fontSize)}" height="${lineHeight}">
              <text x="0" y="${fontSize}" font-family="Noto Sans, sans-serif" font-size="${fontSize}" fill="${color}">
                ${safeText}
              </text>
            </svg>
          `
          const svgImage = await embedSvg.call(doc, svg)
          const drawWidth = Math.max(width, svgImage.width)
          page.drawImage(svgImage, {
            x,
            y: y - fontSize,
            width: drawWidth,
            height: lineHeight,
          })
          return true
        } catch (err) {
          console.warn('SVG fallback failed, defaulting to text draw', err)
          return false
        }
      }

      for (const page of pages) {
        const pdfPage = doc.addPage([page.width, page.height])
        // Always draw a clean white background; do not embed the existing PDF page image
        pdfPage.drawRectangle({
          x: 0,
          y: 0,
          width: page.width,
          height: page.height,
          color: rgb(1, 1, 1),
        })

        const imageCache = new Map<string, any>()
        for (const image of page.imageBoxes) {
          if (!image.dataUrl) {
            continue
          }
          let embedded = imageCache.get(image.dataUrl)
          if (!embedded) {
            embedded = image.dataUrl.startsWith('data:image/png')
              ? await doc.embedPng(image.dataUrl)
              : await doc.embedJpg(image.dataUrl)
            imageCache.set(image.dataUrl, embedded)
          }
          pdfPage.drawImage(embedded, {
            x: image.left,
            y: page.height - image.top - image.height,
            width: image.width,
            height: image.height,
          })
        }

        for (const box of page.textBoxes) {
          const fontSize = Math.max(box.fontSize || 12, 4)
          const lines = (box.text || '').split('\n')
          const pdfFont = await getPdfFontForBox(box)
          const pdfColor = cssColorToPdfRgb(box.color)
          const bold = isBoldWeight(box.fontWeight)
          const lineHeight = fontSize * 1.2

          let cursorY = page.height - box.top - fontSize
          for (const line of lines) {
            const textLine = line.length > 0 ? line : ' '
            cursorY = Math.max(cursorY, 0)
            const { font: fontForLine, text: safeText, sanitized } = await ensureFontCanEncode(pdfFont, textLine)
            if (sanitized) {
              const svgDrawn = await tryDrawSvgText({
                page: pdfPage,
                text: textLine,
                x: box.left,
                y: cursorY + fontSize,
                lineHeight,
                fontSize,
                width: box.width,
                color: box.color || '#000000',
              })
              if (svgDrawn) {
                cursorY -= lineHeight
                continue
              }
            }
            const draw = (xOffset: number) =>
              pdfPage.drawText(safeText, {
                x: box.left + xOffset,
                y: cursorY,
                size: fontSize,
                maxWidth: box.width,
                font: fontForLine,
                color: pdfColor,
                lineHeight,
              })
            draw(0)
            if (bold) {
              draw(fontSize * 0.02)
            }
            cursorY -= lineHeight
          }
        }
      }

      const bytes = await doc.save()
      const pdfBuffer =
        bytes instanceof Uint8Array
          ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          : bytes
      const blob = new Blob([new Uint8Array(pdfBuffer as ArrayBuffer)], { type: 'application/pdf' })
      const form = new FormData()
      form.append('file', blob, 'edited.pdf')
      const response = await fetch('/api/v1/ai/pdf-editor/upload', {
        method: 'POST',
        body: form,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.pdfUrl) {
        throw new Error(payload.error || 'Failed to apply edits')
      }
      onApply(payload.pdfUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply edits')
    } finally {
      setSaving(false)
    }
  }, [pages, onApply, documentFonts])

  return (
    <div className="relative flex h-full flex-col bg-slate-950 text-slate-100">
      {!loading && (
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-850 px-2 py-1">
              <button
                type="button"
                onClick={toggleBold}
                disabled={!hasTextSelection || interactionLocked}
                className={`h-8 w-8 rounded border border-slate-700 text-sm font-bold ${
                  isBold ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-200'
                } disabled:opacity-50`}
              >
                B
              </button>
              {anySupportsItalic && (
                <button
                  type="button"
                  onClick={toggleItalic}
                  disabled={!hasTextSelection || interactionLocked || !selectedSupportsItalic}
                  className={`h-8 w-8 rounded border border-slate-700 text-sm italic ${
                    isItalic && selectedSupportsItalic ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-200'
                  } disabled:opacity-50`}
                  title={selectedSupportsItalic ? 'Italic' : 'Italic not available for this font'}
                >
                  I
                </button>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustFontSize(-1)}
                  disabled={!hasTextSelection || interactionLocked}
                  className="h-8 w-8 rounded border border-slate-700 bg-slate-800 text-sm text-slate-200 disabled:opacity-50"
                >
                  −
                </button>
                <input
                  type="number"
                  min={4}
                  max={200}
                  value={Math.round(selectedFontSize)}
                  disabled={!hasTextSelection || interactionLocked}
                  onChange={(e) => setFontSizeValue(Number(e.target.value) || selectedFontSize)}
                  className="h-8 w-16 rounded border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => adjustFontSize(1)}
                  disabled={!hasTextSelection || interactionLocked}
                  className="h-8 w-8 rounded border border-slate-700 bg-slate-800 text-sm text-slate-200 disabled:opacity-50"
                >
                  +
                </button>
              </div>
              <input
                type="color"
                value={selectedColor}
                disabled={!hasTextSelection || interactionLocked}
                onChange={(e) => setFontColorValue(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900 p-1 disabled:opacity-50"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setAddTextMode(true)
                setSelection(null)
              }}
              disabled={interactionLocked}
              className={`rounded border px-3 py-2 text-sm font-medium ${
                addTextMode
                  ? 'border-blue-400 bg-blue-500 text-white'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-750'
              }`}
            >
              Add text
            </button>

            <ZoomControls value={zoom} onChange={setZoom} disabled={loading || pages.length === 0} />
            <div className="flex gap-2">
              <button
                onClick={handleApplyEdits}
                disabled={saving || loading || pages.length === 0 || !dirty}
                className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Applying…' : dirty ? 'Apply edits' : 'No changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {interactionLocked && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 shadow-lg">
            {loading ? 'Preparing PDF… please wait' : 'Applying edits…'}
          </div>
        </div>
      )}

      {error && (
        <div className="border-b border-amber-700 bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div
        className="relative flex-1 overflow-y-auto bg-slate-900/40 px-6 py-6"
        ref={containerRef}
        onScroll={(event) => {
          scrollPosRef.current = event.currentTarget.scrollTop
        }}
        onMouseDown={(event) => {
          if (event.target === containerRef.current) {
            deselect()
          }
        }}
      >
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading PDF layers…</div>
        )}

        {!loading && pages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Unable to load PDF content. Try regenerating the document.
          </div>
        )}

        <div className="mx-auto flex flex-col items-center gap-10">
          {pages.map((page, pageIndex) => {
            const baseScale = computeScale(page)
            const visualScale = baseScale * zoom
          const multiSelection =
            selection?.type === 'text' && selection.pageIndex === pageIndex && selection.ids.length > 1
          const multiSelectedBoxes = multiSelection
            ? page.textBoxes.filter((box) => selection?.ids.includes(box.id))
            : []
          const groupBounds = multiSelectedBoxes.length
            ? {
                left: Math.min(...multiSelectedBoxes.map((b) => b.left)),
                top: Math.min(...multiSelectedBoxes.map((b) => b.top)),
                right: Math.max(...multiSelectedBoxes.map((b) => b.left + b.width)),
                bottom: Math.max(...multiSelectedBoxes.map((b) => b.top + b.height)),
              }
            : null

            return (
              <div
                key={`page-${pageIndex}`}
                className="relative rounded-lg border border-slate-800 bg-white shadow-2xl"
                style={{ width: page.width * visualScale, height: page.height * visualScale, overflow: 'visible' }}
                onMouseDown={handlePageMouseDown(pageIndex, visualScale)}
                onMouseMove={updateMarqueeSelection}
                onMouseUp={endMarqueeSelection}
                onMouseLeave={endMarqueeSelection}
              >
                <div className="absolute inset-0 rounded-lg bg-white" />

                <div className="absolute inset-0">
                  {page.imageBoxes.map((image) => {
                    const isSelected =
                      selection?.type === 'image' && selection.pageIndex === pageIndex && selection.id === image.id
                    return (
                      <div
                        key={image.id}
                        className={`group absolute cursor-move rounded border ${
                          isSelected ? 'border-blue-400 shadow-lg' : 'border-transparent'
                        }`}
                        style={{
                          left: image.left * visualScale,
                          top: image.top * visualScale,
                          width: image.width * visualScale,
                          height: image.height * visualScale,
                        }}
                        onPointerDown={(event) =>
                          startDrag({
                            type: 'image',
                            pageIndex,
                            id: image.id,
                            left: image.left,
                            top: image.top,
                          })(event)
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelection({ type: 'image', pageIndex, id: image.id })
                        }}
                      >
                        {image.dataUrl ? (
                          <img src={image.dataUrl} alt="" className="h-full w-full select-none object-contain" draggable={false} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">image</div>
                        )}
                        <div
                          className={`absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded bg-blue-400 ${
                            isSelected ? 'opacity-100' : 'opacity-0'
                          }`}
                          onPointerDown={(event) =>
                            startResize({
                              type: 'image',
                              pageIndex,
                              id: image.id,
                              width: image.width,
                              height: image.height,
                              top: image.top,
                              left: image.left,
                              mode: 'corner',
                            })(event)
                          }
                        />
                      </div>
                    )
                  })}

                  {multiSelection && groupBounds && (
                    <div
                      className="absolute z-30 border-2 border-blue-400/80 bg-blue-200/10"
                      style={{
                        left: groupBounds.left * visualScale,
                        top: groupBounds.top * visualScale,
                        width: (groupBounds.right - groupBounds.left) * visualScale,
                        height: (groupBounds.bottom - groupBounds.top) * visualScale,
                      }}
                    >
                      <div
                        className="absolute -left-6 top-1/2 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow ring-1 ring-blue-400/80 cursor-move"
                        onPointerDown={startGroupDrag(pageIndex, selection.ids)}
                      >
                        <div className="flex flex-col items-center gap-0.5 text-blue-500">
                          {[0, 1, 2].map((row) => (
                            <span key={`group-dot-${row}`} className="h-1 w-1 rounded-full bg-blue-500" />
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete selection"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSelectedTextBoxes(pageIndex, selection.ids)
                        }}
                        className="absolute -top-4 -right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow ring-1 ring-slate-300 hover:bg-rose-100 hover:text-rose-600 hover:ring-rose-200"
                      >
                        🗑️
                      </button>
                      <div
                        className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded bg-blue-500"
                        onPointerDown={startGroupResize(pageIndex, selection.ids)}
                      />
                    </div>
                  )}

                  {marquee && marquee.pageIndex === pageIndex && (
                    <div
                      className="pointer-events-none absolute border border-blue-400/70 bg-blue-300/10"
                      style={{
                        left: marquee.left * visualScale,
                        top: marquee.top * visualScale,
                        width: marquee.width * visualScale,
                        height: marquee.height * visualScale,
                      }}
                    />
                  )}

                  {page.textBoxes.map((box) => {
                    const isSelected =
                      selection?.type === 'text' && selection.pageIndex === pageIndex && selection.ids.includes(box.id)
                    const fontFamily = resolveFontFamily(box.fontId, box.baseFont)
                    const fontWeight = box.fontWeight ?? guessFontWeight(box.baseFont)
                    const minTextHeight = Math.max(box.height * visualScale, box.fontSize * visualScale * 1.02)
                    const handleVisibility = isSelected && !multiSelection ? 'opacity-100' : 'opacity-0'
                    const renderWidth = box.width * visualScale
                    const renderLeft = box.left * visualScale
                    const boxBorderClass =
                      isSelected && !multiSelection
                        ? 'border border-blue-400 bg-white/80 shadow-lg'
                        : 'border border-transparent bg-transparent shadow-none'
                    return (
                      <div
                        key={box.id}
                        data-text-box="true"
                        className={`group absolute rounded transition-colors transition-shadow ${boxBorderClass}`}
                        style={{
                          left: renderLeft,
                          top: box.top * visualScale,
                          width: renderWidth,
                          height: 'auto',
                          minHeight: minTextHeight,
                          overflow: 'visible',
                        }}
                      >
                        <div
                          className={`absolute -left-4 top-1/2 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-blue-400/80 ${handleVisibility}`}
                          onPointerDown={(event) =>
                            startDrag({
                              type: 'text',
                              pageIndex,
                              id: box.id,
                              left: box.left,
                              top: box.top,
                            })(event)
                          }
                        >
                          <div className="flex flex-col items-center gap-0.5 text-blue-500">
                            {[0, 1, 2].map((row) => (
                              <span key={`dot-${box.id}-${row}`} className="h-1 w-1 rounded-full bg-blue-500" />
                            ))}
                          </div>
                        </div>
                        <div className={`absolute -top-3 right-0 flex items-center gap-1 transition-opacity ${handleVisibility}`}>
                          <button
                            type="button"
                            aria-label="Delete text box"
                            onClick={(event) => {
                              event.stopPropagation()
                              deleteTextBox(pageIndex, box.id)
                            }}
                            className="flex items-center justify-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-300 hover:bg-rose-100 hover:text-rose-600 hover:ring-rose-200 h-7 w-7"
                          >
                            🗑️
                          </button>
                        </div>

                        <textarea
                          ref={(node) => {
                            textareaRefs.current[box.id] = node
                          }}
                          value={box.text}
                          onChange={(event) => handleTextChange(pageIndex, box.id, event.target.value)}
                          disabled={interactionLocked}
                          className="w-full resize-none bg-transparent px-0 py-0 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:text-slate-500"
                          style={{
                            fontSize: Math.max(box.fontSize * visualScale, 10),
                            lineHeight: 1,
                            fontFamily,
                            fontWeight: fontWeight ?? 'normal',
                            fontStyle: box.fontStyle ?? 'normal',
                            color: box.color ?? '#000000',
                            height: 'auto',
                            minHeight: minTextHeight,
                            whiteSpace: 'pre',
                            overflow: 'visible',
                            wordBreak: 'keep-all',
                            overflowWrap: 'normal',
                          }}
                          onClick={(event) => {
                            if (interactionLocked) return
                            event.stopPropagation()
                            const additive = event.metaKey || event.ctrlKey || event.shiftKey
                            if (additive) {
                              setTextSelection(pageIndex, [box.id], true, null)
                              return
                            }
                            const page = pagesRef.current[pageIndex]
                            const currentSelection = selectionRef.current
                            const groupId = box.groupId
                            if (groupId && page) {
                              const groupMembers = page.textBoxes.filter((b) => b.groupId === groupId).map((b) => b.id)
                              const groupAlreadySelected =
                                currentSelection?.type === 'text' &&
                                currentSelection.pageIndex === pageIndex &&
                                currentSelection.groupId === groupId &&
                                currentSelection.ids.length === groupMembers.length
                              if (groupAlreadySelected) {
                                setTextSelection(pageIndex, [box.id], false, null)
                              } else if (groupMembers.length > 1) {
                                setTextSelection(pageIndex, groupMembers, false, groupId)
                              } else {
                                setTextSelection(pageIndex, [box.id], false, null)
                              }
                            } else {
                              setTextSelection(pageIndex, [box.id], false, null)
                            }
                          }}
                          spellCheck={false}
                        />
                        <div
                          className={`absolute -top-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-n-resize rounded bg-blue-400 ${handleVisibility}`}
                          onPointerDown={(event) =>
                            startResize({
                              type: 'text',
                              pageIndex,
                              id: box.id,
                              width: box.width,
                              height: box.height,
                              top: box.top,
                              left: box.left,
                              mode: 'text-top',
                            })(event)
                          }
                        />
                        <div
                          className={`absolute -bottom-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-s-resize rounded bg-blue-400 ${handleVisibility}`}
                          onPointerDown={(event) =>
                            startResize({
                              type: 'text',
                              pageIndex,
                              id: box.id,
                              width: box.width,
                              height: box.height,
                              top: box.top,
                              left: box.left,
                              mode: 'text-bottom',
                            })(event)
                          }
                        />
                        <div
                          className={`absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded bg-blue-500 ${handleVisibility}`}
                          onPointerDown={(event) =>
                            startResize({
                              type: 'text',
                              pageIndex,
                              id: box.id,
                              width: box.width,
                              height: box.height,
                              top: box.top,
                              left: box.left,
                              mode: 'corner',
                            })(event)
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default PdfTextEditorFull
