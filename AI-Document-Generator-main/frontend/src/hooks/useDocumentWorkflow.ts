import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DocumentState, Message, StyleProfile, VersionEntry } from '../types'

type ViewMode = 'landing' | 'workspace'
type CreateStage = 'outline' | 'text' | 'styling' | 'review'
type OutlineRow = { section: string; details: string }
type DraftRow = { label: string; value: string }
type OutlineConstraints = { tone: string; audience: string; pageCount: number }
import { templateCatalog as staticCatalog } from '../templateCatalog'

type TemplateCatalogEntry = { docType: string; templateCount: number; templates: string[] }

export function useDocumentWorkflow() {
  const [view, setView] = useState<ViewMode>('landing')
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentDoc, setCurrentDoc] = useState<DocumentState | null>(null)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null)
  const [styleDraft, setStyleDraft] = useState({
    layout_preference: 'Balanced',
    font_preference: 'Serif',
    color_accent: '#1f2937',
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLivePreviewing, setIsLivePreviewing] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')
  const [skipTemplates, setSkipTemplates] = useState(false)
  const [_aiSessionId, setAiSessionId] = useState<string | null>(null)
  const [stage, setStage] = useState<CreateStage>('outline')
  const [outlineRows, setOutlineRows] = useState<OutlineRow[]>([])
  const [outlineSections, setOutlineSections] = useState<string[]>([])
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])
  const [excludedFields, setExcludedFields] = useState<string[]>([])
  const [outlineConstraints, setOutlineConstraints] = useState<OutlineConstraints>({
    tone: 'Professional',
    audience: 'General',
    pageCount: 1,
  })
  const [isStageLoading, setIsStageLoading] = useState(false)
  const [templateCatalog, setTemplateCatalog] = useState<TemplateCatalogEntry[]>(staticCatalog)
  const [selectedDocType, setSelectedDocType] = useState<string>('miscellaneous')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default')
  const [isTemplateLoading, setIsTemplateLoading] = useState(false)
  const [isTemplatePanelOpen, setIsTemplatePanelOpen] = useState(false)
  const [userSelectedTemplate, setUserSelectedTemplate] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importDocType, setImportDocType] = useState('document')
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [uploadedPdfFile, setUploadedPdfFile] = useState<File | null>(null)
  const [isAssetUploading, setIsAssetUploading] = useState(false)
  const [assetError, setAssetError] = useState<string | null>(null)
  const autoFilledRef = useRef(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const justAcceptedRef = useRef(false)
  const autoFillAttemptsRef = useRef(0)
  const progressiveJobRef = useRef<{ aborted: boolean; baseJobId: string; finalPdfUrl: string } | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const jobSeqRef = useRef<number>(0)
  const jobTotalRef = useRef<number>(0)
  const normalizePdfUrl = useCallback((url?: string | null) => {
    if (!url) return url || undefined
    return url.startsWith('/output/') ? `/api/v1/ai${url}` : url
  }, [])

  const imagePlaceholderPattern = useMemo(() => /\\rule\s*\{[^}]+\}\s*\{[^}]+\}/g, [])
  const imagePlaceholdersCount = useMemo(() => {
    const latex = currentDoc?.latex || ''
    const matches = latex.match(imagePlaceholderPattern)
    return matches ? matches.length : 0
  }, [currentDoc?.latex, imagePlaceholderPattern])

  const ensureGraphicx = useCallback((latex: string) => {
    if (!latex || latex.includes('\\usepackage{graphicx}')) return latex
    return latex.replace(/(\\documentclass[^\n]*\n)/, `$1\\usepackage{graphicx}\n`)
  }, [])

  const replaceFirstImagePlaceholder = useCallback(
    (latex: string, imagePath: string) => {
      if (!latex) return latex
      let replaced = false
      return latex.replace(imagePlaceholderPattern, (match) => {
        if (replaced) return match
        const sizeMatch = match.match(/\\rule\s*\{([^}]+)\}\s*\{([^}]+)\}/)
        if (!sizeMatch) return match
        const [, width, height] = sizeMatch
        replaced = true
        return `\\includegraphics[width=${width},height=${height},keepaspectratio]{${imagePath}}`
      })
    },
    [imagePlaceholderPattern],
  )

  const removeImagePlaceholders = useCallback(
    (latex: string) => {
      if (!latex) return latex
      return latex.replace(imagePlaceholderPattern, '')
    },
    [imagePlaceholderPattern],
  )

  const compileLatex = useCallback(
    async (latex: string) => {
      const res = await fetch('/api/v1/ai/progressive_render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.pdfUrl) {
        throw new Error(data.error || 'Failed to compile PDF')
      }
      return normalizePdfUrl(data.pdfUrl) || data.pdfUrl
    },
    [normalizePdfUrl],
  )

  const uploadImageAsset = useCallback(
    async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/v1/ai/assets/upload', {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.latexPath) {
        throw new Error(data.error || 'Failed to upload image')
      }
      return data.latexPath as string
    },
    [],
  )

  const addImageToPlaceholders = useCallback(
    async (file: File) => {
      if (!currentDoc?.latex) return
      setAssetError(null)
      setIsAssetUploading(true)
      try {
        const imagePath = await uploadImageAsset(file)
        const updatedLatex = ensureGraphicx(replaceFirstImagePlaceholder(currentDoc.latex, imagePath))
        if (updatedLatex === currentDoc.latex) {
          throw new Error('No image placeholders found.')
        }
        const pdfUrl = await compileLatex(updatedLatex)
        setCurrentDoc((prev) => (prev ? { ...prev, latex: updatedLatex, pdfUrl } : prev))
      } catch (error) {
        console.error('Image upload failed:', error)
        setAssetError(error instanceof Error ? error.message : 'Failed to add image')
      } finally {
        setIsAssetUploading(false)
      }
    },
    [compileLatex, currentDoc?.latex, ensureGraphicx, replaceFirstImagePlaceholder, uploadImageAsset],
  )

  const stripImagePlaceholders = useCallback(async () => {
    if (!currentDoc?.latex) return
    setAssetError(null)
    setIsAssetUploading(true)
    try {
      const updatedLatex = removeImagePlaceholders(currentDoc.latex)
      if (updatedLatex === currentDoc.latex) {
        throw new Error('No image placeholders found.')
      }
      const pdfUrl = await compileLatex(updatedLatex)
      setCurrentDoc((prev) => (prev ? { ...prev, latex: updatedLatex, pdfUrl } : prev))
    } catch (error) {
      console.error('Placeholder removal failed:', error)
      setAssetError(error instanceof Error ? error.message : 'Failed to remove placeholders')
    } finally {
      setIsAssetUploading(false)
    }
  }, [compileLatex, currentDoc?.latex, removeImagePlaceholders])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      if (progressiveJobRef.current) {
        progressiveJobRef.current.aborted = true
      }
    }
  }, [])

  const resetLivePreview = useCallback(() => {
    if (progressiveJobRef.current) {
      progressiveJobRef.current.aborted = true
      progressiveJobRef.current = null
    }
    setIsLivePreviewing(false)
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const headers = jobIdRef.current
        ? { 'X-Job-Id': jobIdRef.current, 'X-Job-Seq': String(jobSeqRef.current += 1), 'X-Job-Total': String(jobTotalRef.current) }
        : undefined
      const res = await fetch('/api/v1/ai/versions/default_user', headers ? { headers } : undefined)
      const data = await res.json()
      if (Array.isArray(data.versions)) {
        const normalized = data.versions.map((version: VersionEntry) => ({
          ...version,
          pdfUrl: normalizePdfUrl(version.pdfUrl) || version.pdfUrl,
        }))
        setVersions(normalized)
        if (selectedVersionId) {
          const exists = data.versions.find((v: VersionEntry) => v.id === selectedVersionId)
          if (!exists) setSelectedVersionId(null)
        }
      }
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }, [selectedVersionId, normalizePdfUrl])

  const fetchStyle = useCallback(async () => {
    try {
      const headers = jobIdRef.current
        ? { 'X-Job-Id': jobIdRef.current, 'X-Job-Seq': String(jobSeqRef.current += 1), 'X-Job-Total': String(jobTotalRef.current) }
        : undefined
      const res = await fetch('/api/v1/ai/style/default_user', headers ? { headers } : undefined)
      const data = await res.json()
      if (data.style) setStyleProfile(data.style)
    } catch (err) {
      console.error('Failed to load style profile', err)
    }
  }, [])

  useEffect(() => {
    if (view === 'workspace') {
      fetchHistory()
      fetchStyle()
    }
  }, [view, fetchHistory, fetchStyle])

  useEffect(() => {
    if (!styleProfile) return
    setStyleDraft({
      layout_preference: styleProfile.layout_preference || 'Balanced',
      font_preference: styleProfile.font_preference || 'Serif',
      color_accent: styleProfile.color_accent || '#1f2937',
    })
  }, [styleProfile])

  const appendPrompt = (text: string) => {
    // Set flag to prevent auto-submission right after voice input
    justAcceptedRef.current = true
    setTimeout(() => {
      justAcceptedRef.current = false
    }, 500) // Allow 500ms before enabling submission
    
    setPrompt((prev) => {
      const combined = prev ? `${prev} ${text}` : text
      // Normalize multiple spaces to single space
      return combined.replace(/\s+/g, ' ')
    })
  }

  const addMessage = (role: Message['role'], text: string) => {
    setMessages((prev) => [...prev, { role, text }])
  }

  const parseOutlineText = useCallback((outlineText: string) => {
    const lines = outlineText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(section|details)$/i.test(line))

    const rows: OutlineRow[] = []
    for (let i = 0; i < lines.length; i += 1) {
      const cleaned = lines[i].replace(/^\d+[\).\s-]+/, '').trim()
      if (!cleaned) continue

      const split = cleaned.split(/[-–:]+/, 2)
      if (split.length > 1) {
        rows.push({
          section: split[0]?.trim() || 'Section',
          details: split[1]?.trim() || '',
        })
        continue
      }

      const next = lines[i + 1]?.trim()
      if (next && !/^(section|details)$/i.test(next) && !/^\d+[\).\s-]+/.test(next)) {
        rows.push({ section: cleaned, details: next })
        i += 1
        continue
      }

      rows.push({ section: cleaned, details: '' })
    }

    return rows
  }, [])

  const formatOutlineRows = useCallback(
    (rows: OutlineRow[]) => {
      const isExcluded = (label: string) =>
        excludedFields.some((field) => field.trim().toLowerCase() === label.trim().toLowerCase())

      const defaultForLabel = (label: string) => {
        const key = label.trim().toLowerCase()
        if (!key) return 'Example'
        if (/(name|author|student|presenter|recipient|sender)/.test(key)) return 'Jane Doe'
        if (/(company|business|organization|institution|client)/.test(key)) return 'John Smith Consulting'
        if (/(title|headline|subject)/.test(key)) return 'Project Overview'
        if (/(email)/.test(key)) return 'jane.doe@example.com'
        if (/(phone|tel)/.test(key)) return '(555) 000-0000'
        if (/(address|location|city)/.test(key)) return '123 Example Street, Example City'
        if (/(date|due|issue|month|year)/.test(key)) return '2025-01-15'
        if (/(amount|total|subtotal|price|rate|salary|budget|cost)/.test(key)) return '$1,250.00'
        if (/(website|url|link)/.test(key)) return 'www.example.com'
        if (/(role|position|job)/.test(key)) return 'Product Manager'
        if (/(summary|objective|overview|abstract)/.test(key)) return 'Concise summary of goals and outcomes.'
        if (/(notes|terms|instructions)/.test(key)) return 'Payment due within 15 days.'
        return 'Example'
      }

      const fieldLines = rows
        .map((row) => {
          const label = row.section.trim() || 'Field'
          const value = row.details.trim()
          if (value) return `${label}: ${value}`
          if (isExcluded(label)) return `${label}: [excluded]`
          return `${label}: ${defaultForLabel(label)}`
        })
        .join('\n')
      const sectionLines = outlineSections.length
        ? `\n\nSections:\n${outlineSections.map((section) => `- ${section}`).join('\n')}`
        : ''
      const excludedLines = excludedFields.length
        ? `\n\nExcluded fields:\n${excludedFields.map((field) => `- ${field}`).join('\n')}`
        : ''
      return `Fields:\n${fieldLines}${sectionLines}${excludedLines}`
    },
    [excludedFields, outlineSections],
  )

  const fieldTemplates: Record<string, OutlineRow[]> = {
    academic_articles: [
      { section: 'Title', details: '' },
      { section: 'Authors', details: '' },
      { section: 'Affiliations', details: '' },
      { section: 'Abstract', details: '' },
      { section: 'Keywords', details: '' },
      { section: 'Research Area', details: '' },
    ],
    academic_journals: [
      { section: 'Title', details: '' },
      { section: 'Authors', details: '' },
      { section: 'Affiliations', details: '' },
      { section: 'Abstract', details: '' },
      { section: 'Keywords', details: '' },
      { section: 'Journal Name', details: '' },
    ],
    assignments: [
      { section: 'Course Name', details: '' },
      { section: 'Instructor', details: '' },
      { section: 'Assignment Title', details: '' },
      { section: 'Due Date', details: '' },
      { section: 'Student Name', details: '' },
    ],
    books: [
      { section: 'Title', details: '' },
      { section: 'Subtitle', details: '' },
      { section: 'Author', details: '' },
      { section: 'Publisher', details: '' },
      { section: 'Edition', details: '' },
    ],
    business_cards: [
      { section: 'Full Name', details: '' },
      { section: 'Job Title', details: '' },
      { section: 'Company', details: '' },
      { section: 'Email', details: '' },
      { section: 'Phone', details: '' },
      { section: 'Website', details: '' },
    ],
    business_reports: [
      { section: 'Report Title', details: '' },
      { section: 'Company', details: '' },
      { section: 'Prepared By', details: '' },
      { section: 'Report Date', details: '' },
      { section: 'Period Covered', details: '' },
    ],
    calendars: [
      { section: 'Title', details: '' },
      { section: 'Month', details: '' },
      { section: 'Year', details: '' },
      { section: 'Theme', details: '' },
    ],
    conference_posters: [
      { section: 'Title', details: '' },
      { section: 'Authors', details: '' },
      { section: 'Affiliations', details: '' },
      { section: 'Conference Name', details: '' },
      { section: 'Contact Email', details: '' },
    ],
    cover_letters: [
      { section: 'Your Name', details: '' },
      { section: 'Your Email', details: '' },
      { section: 'Your Phone', details: '' },
      { section: 'Company Name', details: '' },
      { section: 'Role Title', details: '' },
      { section: 'Hiring Manager', details: '' },
    ],
    cvs_and_resumes: [
      { section: 'Full Name', details: '' },
      { section: 'Email', details: '' },
      { section: 'Phone', details: '' },
      { section: 'Location', details: '' },
      { section: 'LinkedIn', details: '' },
      { section: 'Target Role', details: '' },
    ],
    essays: [
      { section: 'Title', details: '' },
      { section: 'Author', details: '' },
      { section: 'Course', details: '' },
      { section: 'Instructor', details: '' },
      { section: 'Thesis Statement', details: '' },
    ],
    formal_letters: [
      { section: 'Sender Name', details: '' },
      { section: 'Sender Address', details: '' },
      { section: 'Recipient Name', details: '' },
      { section: 'Recipient Address', details: '' },
      { section: 'Subject', details: '' },
      { section: 'Date', details: '' },
    ],
    invoices: [
      { section: 'Biller Name', details: '' },
      { section: 'Biller Address', details: '' },
      { section: 'Biller Email', details: '' },
      { section: 'Invoice Number', details: '' },
      { section: 'Issue Date', details: '' },
      { section: 'Due Date', details: '' },
      { section: 'Client Name', details: '' },
      { section: 'Client Address', details: '' },
      { section: 'Client Email', details: '' },
      { section: 'Line Items', details: '' },
      { section: 'Subtotal', details: '' },
      { section: 'Taxes', details: '' },
      { section: 'Total', details: '' },
      { section: 'Payment Terms', details: '' },
      { section: 'Payment Methods', details: '' },
    ],
    laboratory_books: [
      { section: 'Experiment Title', details: '' },
      { section: 'Date', details: '' },
      { section: 'Objective', details: '' },
      { section: 'Materials', details: '' },
      { section: 'Procedure', details: '' },
    ],
    laboratory_reports: [
      { section: 'Title', details: '' },
      { section: 'Authors', details: '' },
      { section: 'Lab/Institution', details: '' },
      { section: 'Date', details: '' },
      { section: 'Experiment Objective', details: '' },
    ],
    miscellaneous: [
      { section: 'Title', details: '' },
      { section: 'Author', details: '' },
      { section: 'Date', details: '' },
      { section: 'Purpose', details: '' },
    ],
    newsletters: [
      { section: 'Newsletter Title', details: '' },
      { section: 'Issue Date', details: '' },
      { section: 'Organization', details: '' },
      { section: 'Editor', details: '' },
      { section: 'Contact Email', details: '' },
    ],
    presentations: [
      { section: 'Title', details: '' },
      { section: 'Presenter', details: '' },
      { section: 'Organization', details: '' },
      { section: 'Date', details: '' },
      { section: 'Audience', details: '' },
    ],
    recipes: [
      { section: 'Recipe Name', details: '' },
      { section: 'Servings', details: '' },
      { section: 'Prep Time', details: '' },
      { section: 'Cook Time', details: '' },
      { section: 'Dietary Notes', details: '' },
    ],
    signs: [
      { section: 'Headline', details: '' },
      { section: 'Subtext', details: '' },
      { section: 'Call to Action', details: '' },
      { section: 'Location', details: '' },
    ],
    theses: [
      { section: 'Title', details: '' },
      { section: 'Author', details: '' },
      { section: 'Institution', details: '' },
      { section: 'Advisor', details: '' },
      { section: 'Submission Date', details: '' },
    ],
    title_pages: [
      { section: 'Title', details: '' },
      { section: 'Subtitle', details: '' },
      { section: 'Author', details: '' },
      { section: 'Organization', details: '' },
      { section: 'Date', details: '' },
    ],
  }

  const sectionTemplates: Record<string, DraftRow[]> = {
    academic_articles: [
      { label: 'Title', value: '' },
      { label: 'Abstract', value: '' },
      { label: 'Introduction', value: '' },
      { label: 'Related Work', value: '' },
      { label: 'Methodology', value: '' },
      { label: 'Results', value: '' },
      { label: 'Discussion', value: '' },
      { label: 'Conclusion', value: '' },
      { label: 'References', value: '' },
    ],
    academic_journals: [
      { label: 'Title', value: '' },
      { label: 'Author Info', value: '' },
      { label: 'Abstract', value: '' },
      { label: 'Keywords', value: '' },
      { label: 'Main Text', value: '' },
      { label: 'Figures/Tables', value: '' },
      { label: 'References', value: '' },
    ],
    assignments: [
      { label: 'Course Details', value: '' },
      { label: 'Assignment Prompt', value: '' },
      { label: 'Requirements', value: '' },
      { label: 'Work/Answer', value: '' },
      { label: 'References', value: '' },
    ],
    books: [
      { label: 'Title Page', value: '' },
      { label: 'Table of Contents', value: '' },
      { label: 'Preface', value: '' },
      { label: 'Chapters', value: '' },
      { label: 'Appendix', value: '' },
      { label: 'Index', value: '' },
    ],
    business_cards: [
      { label: 'Name', value: '' },
      { label: 'Company', value: '' },
      { label: 'Contact', value: '' },
      { label: 'Address', value: '' },
    ],
    business_reports: [
      { label: 'Title Page', value: '' },
      { label: 'Executive Summary', value: '' },
      { label: 'Background', value: '' },
      { label: 'Findings', value: '' },
      { label: 'Recommendations', value: '' },
      { label: 'Appendix', value: '' },
    ],
    calendars: [
      { label: 'Title', value: '' },
      { label: 'Grid', value: '' },
      { label: 'Events', value: '' },
      { label: 'Footer', value: '' },
    ],
    conference_posters: [
      { label: 'Title', value: '' },
      { label: 'Authors', value: '' },
      { label: 'Background', value: '' },
      { label: 'Methods', value: '' },
      { label: 'Results', value: '' },
      { label: 'Conclusion', value: '' },
      { label: 'References', value: '' },
      { label: 'Contact', value: '' },
    ],
    cover_letters: [
      { label: 'Header', value: '' },
      { label: 'Salutation', value: '' },
      { label: 'Intro', value: '' },
      { label: 'Body', value: '' },
      { label: 'Closing', value: '' },
      { label: 'Signature', value: '' },
    ],
    cvs_and_resumes: [
      { label: 'Header', value: '' },
      { label: 'Summary', value: '' },
      { label: 'Experience', value: '' },
      { label: 'Education', value: '' },
      { label: 'Skills', value: '' },
      { label: 'Projects', value: '' },
    ],
    essays: [
      { label: 'Title', value: '' },
      { label: 'Introduction', value: '' },
      { label: 'Body', value: '' },
      { label: 'Conclusion', value: '' },
      { label: 'References', value: '' },
    ],
    formal_letters: [
      { label: 'Sender Info', value: '' },
      { label: 'Recipient Info', value: '' },
      { label: 'Date', value: '' },
      { label: 'Subject', value: '' },
      { label: 'Body', value: '' },
      { label: 'Closing', value: '' },
    ],
    invoices: [
      { label: 'Header and Invoice Details', value: '' },
      { label: 'Bill To (Client Information)', value: '' },
      { label: 'Invoice Summary', value: '' },
      { label: 'Line Item Details', value: '' },
      { label: 'Taxes and Additional Charges/Discounts', value: '' },
      { label: 'Payment Terms and Methods', value: '' },
      { label: 'Notes or Special Instructions', value: '' },
      { label: 'Authorization and Contact for Queries', value: '' },
    ],
    laboratory_books: [
      { label: 'Experiment Title', value: '' },
      { label: 'Objective', value: '' },
      { label: 'Materials', value: '' },
      { label: 'Procedure', value: '' },
      { label: 'Observations', value: '' },
      { label: 'Conclusion', value: '' },
    ],
    laboratory_reports: [
      { label: 'Title', value: '' },
      { label: 'Abstract', value: '' },
      { label: 'Introduction', value: '' },
      { label: 'Methods', value: '' },
      { label: 'Results', value: '' },
      { label: 'Discussion', value: '' },
      { label: 'Conclusion', value: '' },
    ],
    miscellaneous: [
      { label: 'Title', value: '' },
      { label: 'Overview', value: '' },
      { label: 'Main Content', value: '' },
      { label: 'Supporting Details', value: '' },
      { label: 'Conclusion', value: '' },
    ],
    newsletters: [
      { label: 'Header', value: '' },
      { label: 'Top Story', value: '' },
      { label: 'Updates', value: '' },
      { label: 'Spotlight', value: '' },
      { label: 'Footer', value: '' },
    ],
    presentations: [
      { label: 'Title Slide', value: '' },
      { label: 'Agenda', value: '' },
      { label: 'Key Points', value: '' },
      { label: 'Data/Visuals', value: '' },
      { label: 'Conclusion', value: '' },
    ],
    recipes: [
      { label: 'Title', value: '' },
      { label: 'Summary', value: '' },
      { label: 'Ingredients', value: '' },
      { label: 'Instructions', value: '' },
      { label: 'Notes', value: '' },
    ],
    signs: [
      { label: 'Headline', value: '' },
      { label: 'Subtext', value: '' },
      { label: 'Call to Action', value: '' },
      { label: 'Contact', value: '' },
    ],
    theses: [
      { label: 'Title Page', value: '' },
      { label: 'Abstract', value: '' },
      { label: 'Introduction', value: '' },
      { label: 'Literature Review', value: '' },
      { label: 'Methodology', value: '' },
      { label: 'Results', value: '' },
      { label: 'Conclusion', value: '' },
      { label: 'References', value: '' },
    ],
    title_pages: [
      { label: 'Title', value: '' },
      { label: 'Subtitle', value: '' },
      { label: 'Author', value: '' },
      { label: 'Date', value: '' },
      { label: 'Organization', value: '' },
    ],
  }

  const constraintDefaults: Record<string, OutlineConstraints> = {
    academic_articles: { tone: 'Formal', audience: 'Researchers', pageCount: 6 },
    academic_journals: { tone: 'Formal', audience: 'Researchers', pageCount: 8 },
    assignments: { tone: 'Academic', audience: 'Instructor', pageCount: 2 },
    books: { tone: 'Narrative', audience: 'General', pageCount: 40 },
    business_cards: { tone: 'Professional', audience: 'Clients', pageCount: 1 },
    business_reports: { tone: 'Professional', audience: 'Executives', pageCount: 6 },
    calendars: { tone: 'Neutral', audience: 'General', pageCount: 1 },
    conference_posters: { tone: 'Academic', audience: 'Conference Attendees', pageCount: 1 },
    cover_letters: { tone: 'Professional', audience: 'Hiring Manager', pageCount: 1 },
    cvs_and_resumes: { tone: 'Professional', audience: 'Recruiters', pageCount: 2 },
    essays: { tone: 'Academic', audience: 'Instructor', pageCount: 3 },
    formal_letters: { tone: 'Formal', audience: 'Recipient', pageCount: 1 },
    invoices: { tone: 'Professional', audience: 'Client', pageCount: 1 },
    laboratory_books: { tone: 'Technical', audience: 'Lab Team', pageCount: 4 },
    laboratory_reports: { tone: 'Technical', audience: 'Researchers', pageCount: 6 },
    miscellaneous: { tone: 'Neutral', audience: 'General', pageCount: 2 },
    newsletters: { tone: 'Informative', audience: 'Subscribers', pageCount: 2 },
    presentations: { tone: 'Professional', audience: 'Stakeholders', pageCount: 8 },
    recipes: { tone: 'Friendly', audience: 'Home Cooks', pageCount: 1 },
    signs: { tone: 'Direct', audience: 'Public', pageCount: 1 },
    theses: { tone: 'Formal', audience: 'Academic Committee', pageCount: 30 },
    title_pages: { tone: 'Formal', audience: 'General', pageCount: 1 },
  }

  const keywordDocTypeMap: Array<{ key: string; keywords: string[] }> = [
    { key: 'academic_articles', keywords: ['academic article', 'research article', 'journal article'] },
    { key: 'academic_journals', keywords: ['academic journal', 'journal'] },
    { key: 'assignments', keywords: ['assignment', 'homework'] },
    { key: 'books', keywords: ['book', 'chapter'] },
    { key: 'business_cards', keywords: ['business card'] },
    { key: 'business_reports', keywords: ['business report', 'annual report', 'report'] },
    { key: 'calendars', keywords: ['calendar', 'schedule'] },
    { key: 'conference_posters', keywords: ['conference poster', 'poster'] },
    { key: 'cover_letters', keywords: ['cover letter'] },
    { key: 'cvs_and_resumes', keywords: ['resume', 'cv'] },
    { key: 'essays', keywords: ['essay'] },
    { key: 'formal_letters', keywords: ['formal letter', 'letter'] },
    { key: 'invoices', keywords: ['invoice', 'billing'] },
    { key: 'laboratory_books', keywords: ['lab book', 'laboratory notebook'] },
    { key: 'laboratory_reports', keywords: ['lab report', 'laboratory report'] },
    { key: 'newsletters', keywords: ['newsletter'] },
    { key: 'presentations', keywords: ['presentation', 'slides', 'deck'] },
    { key: 'recipes', keywords: ['recipe', 'cookbook'] },
    { key: 'signs', keywords: ['sign'] },
    { key: 'theses', keywords: ['thesis', 'dissertation'] },
    { key: 'title_pages', keywords: ['title page'] },
  ]

  const detectDocTypeFromPrompt = useCallback((value: string) => {
    const text = value.toLowerCase()
    for (const entry of keywordDocTypeMap) {
      if (entry.keywords.some((keyword) => text.includes(keyword))) {
        return entry.key
      }
    }
    return 'miscellaneous'
  }, [])

  const seedOutlineForDocType = useCallback(
    (docType: string) => {
      const rows = fieldTemplates[docType] || fieldTemplates.miscellaneous
      setOutlineRows(rows.map((row) => ({ ...row })))
      setDraftRows(
        (sectionTemplates[docType] || sectionTemplates.miscellaneous).map((row) => ({
          label: row.label,
          value: '',
        })),
      )
      setOutlineSections(
        (sectionTemplates[docType] || sectionTemplates.miscellaneous).map((row) => row.label),
      )
      setExcludedFields([])
      const defaults = constraintDefaults[docType] || constraintDefaults.miscellaneous
      setOutlineConstraints({ ...defaults })
    },
    [constraintDefaults, fieldTemplates, sectionTemplates],
  )

  const templateThumbnailUrl = useCallback((docType: string, templateId: string) => {
    return `/templates/${docType}/${templateId}.jpg`
  }, [])

  const openImportTemplate = useCallback(
    (docType?: string) => {
      if (docType) {
        setImportDocType(docType)
      }
      setShowImportModal(true)
    },
    [setImportDocType, setShowImportModal],
  )

  const docTypes = templateCatalog.map((entry) => entry.docType)

  const templateCounts = templateCatalog.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.docType] = entry.templateCount
    return acc
  }, {})

  const templatesForSelected =
    templateCatalog.find((entry) => entry.docType === selectedDocType)?.templates || ['default']

  useEffect(() => {
    setIsTemplateLoading(false)
  }, [])

  const applyTemplateSelection = useCallback(
    (docType: string, templateId: string) => {
      const available =
        templateCatalog.find((entry) => entry.docType === docType)?.templates || ['default']
      const nextTemplateId = available.includes(templateId) ? templateId : 'default'
      setSelectedDocType(docType)
      setSelectedTemplateId(nextTemplateId)
      setUserSelectedTemplate(true)
      seedOutlineForDocType(docType)
      setCurrentDoc((prev) => {
        if (prev) {
          return { ...prev, documentType: docType }
        }
        return { latex: '', pdfUrl: '', documentType: docType }
      })
      if (_aiSessionId) {
        fetch(`/api/v1/ai/create/sessions/${_aiSessionId}/template`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType, templateId: nextTemplateId }),
        }).catch((error) => {
          console.error('Template update failed:', error)
        })
      }
    },
    [_aiSessionId, seedOutlineForDocType, templateCatalog],
  )

  useEffect(() => {
    if (userSelectedTemplate) return
    const inferred = detectDocTypeFromPrompt(lastPrompt || prompt)
    if (inferred !== selectedDocType) {
      setSelectedDocType(inferred)
      setSelectedTemplateId('default')
      seedOutlineForDocType(inferred)
    }
  }, [detectDocTypeFromPrompt, lastPrompt, prompt, seedOutlineForDocType, selectedDocType, userSelectedTemplate])

  const handlePromptChange = useCallback(
    (value: string) => {
      setPrompt(value)
      if (!userSelectedTemplate) {
        const inferred = detectDocTypeFromPrompt(value)
        if (inferred !== selectedDocType) {
          setSelectedDocType(inferred)
          setSelectedTemplateId('default')
        }
      }
    },
    [detectDocTypeFromPrompt, selectedDocType, userSelectedTemplate],
  )

  const autoFillFieldsFromPrompt = useCallback(
    (value: string) => {
      if (!value.trim()) return
      const lines = value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const kvPairs = new Map<string, string>()
      for (const line of lines) {
        const match = line.match(/^([^:]{2,40}):\s*(.+)$/)
        if (match) {
          kvPairs.set(match[1].toLowerCase(), match[2].trim())
        }
      }
      const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
      const phoneMatch = value.match(/(\+?\d[\d\s().-]{7,})/)
      const dateMatch = value.match(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/)
      const moneyMatch = value.match(/\$\s?\d[\d,]*(?:\.\d{2})?/)

      setOutlineRows((prev) =>
        prev.map((row) => {
          if (row.details.trim()) return row
          const label = row.section.toLowerCase()
          for (const [key, val] of kvPairs.entries()) {
            if (label.includes(key)) {
              return { ...row, details: val }
            }
          }
          if (emailMatch && label.includes('email')) {
            return { ...row, details: emailMatch[0] }
          }
          if (phoneMatch && label.includes('phone')) {
            return { ...row, details: phoneMatch[0] }
          }
          if (dateMatch && (label.includes('date') || label.includes('due'))) {
            return { ...row, details: dateMatch[0] }
          }
          if (moneyMatch && (label.includes('total') || label.includes('amount'))) {
            return { ...row, details: moneyMatch[0] }
          }
          return row
        }),
      )
    },
    [],
  )

  const fillFieldsFromAI = useCallback(async (extraPrompt?: string) => {
    if (!_aiSessionId) return
    console.debug('[AI create] fillFieldsFromAI start', {
      sessionId: _aiSessionId,
      hasExtraPrompt: Boolean(extraPrompt?.trim()),
      outlineCount: outlineRows.length,
    })
    setIsStageLoading(true)
    try {
      const res = await fetch(`/api/v1/ai/create/sessions/${_aiSessionId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: outlineRows.map((row) => ({
            label: row.section,
            value: row.details,
          })),
          extraPrompt,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 503) {
          addMessage('assistant', data.error || 'AI is disabled. Set an API key to enable AI features.')
          autoFilledRef.current = true
          autoFillAttemptsRef.current = 0
          return
        }
        console.warn('[AI create] fillFieldsFromAI failed', {
          sessionId: _aiSessionId,
          status: res.status,
          data,
        })
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to auto-fill fields')
      }
      if (Array.isArray(data.fields)) {
        setOutlineRows((prev) =>
          prev.map((row) => {
            const match = data.fields.find(
              (field: { label: string; value: string }) =>
                field.label?.toLowerCase().trim() === row.section.toLowerCase().trim(),
            )
            if (!match) return row
            if (!row.details.trim() && match.value) {
              return { ...row, details: match.value }
            }
            return row
          }),
        )
        autoFilledRef.current = true
        autoFillAttemptsRef.current = 0
      } else {
        autoFillFieldsFromPrompt(prompt)
      }
    } catch (error) {
      console.warn('Auto-fill failed:', error)
      autoFillFieldsFromPrompt(prompt)
      if (autoFillAttemptsRef.current < 2) {
        autoFillAttemptsRef.current += 1
        setTimeout(() => {
          if (view === 'workspace' && stage === 'outline') {
            fillFieldsFromAI()
          }
        }, 1000 * autoFillAttemptsRef.current)
      }
    } finally {
      setIsStageLoading(false)
    }
  }, [_aiSessionId, outlineRows, autoFillFieldsFromPrompt, prompt, stage, view, addMessage])

  const addPromptForFields = useCallback(
    (extraPrompt: string) => {
      if (!extraPrompt.trim()) return
      setPrompt((prev) => {
        const combined = prev ? `${prev}\n${extraPrompt}` : extraPrompt
        return combined.replace(/\s+\n/g, '\n').trim()
      })
      fillFieldsFromAI(extraPrompt)
    },
    [fillFieldsFromAI],
  )

  useEffect(() => {
    if (view !== 'workspace' || stage !== 'outline' || !_aiSessionId) return
    if (autoFilledRef.current) return
    fillFieldsFromAI()
  }, [view, stage, _aiSessionId, fillFieldsFromAI])

  const streamPhase = async (sessionId: string, phase: 'outline' | 'draft' | 'polish') => {
    let accumulatedLatex = ''
    let outlineText = ''
    let draftSections: DraftRow[] = []
    let sseBuffer = ''
    const response = await fetch(`/api/v1/ai/create/sessions/${sessionId}/stream?phase=${phase}`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to start ${phase} stream`)
    }
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      throw new Error('Response body is not readable')
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      sseBuffer += decoder.decode(value, { stream: true })
      const events = sseBuffer.split('\n\n')
      sseBuffer = events.pop() || ''

      for (const event of events) {
        const dataLines = event
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())

        if (!dataLines.length) continue

        try {
          const payload = JSON.parse(dataLines.join('\n'))

          if (payload.type === 'outline_ready') {
            outlineText = payload.outlineText || ''
          } else if (payload.type === 'draft_sections') {
            draftSections = Array.isArray(payload.sections) ? payload.sections : []
            if (draftSections.length) {
              setDraftRows(draftSections.map((row: DraftRow) => ({ ...row })))
            }
          } else if (payload.type === 'latex_delta') {
            accumulatedLatex += payload.delta || ''
            setCurrentDoc((prev) => ({
              ...prev,
              latex: accumulatedLatex,
            } as DocumentState))
          } else if (payload.type === 'save_complete') {
            setCurrentDoc((prev) => ({
              ...prev,
              pdfUrl: normalizePdfUrl(payload.pdfUrl),
            } as DocumentState))
          } else if (payload.type === 'phase_complete' && payload.latex && !accumulatedLatex) {
            accumulatedLatex = payload.latex
            setCurrentDoc((prev) => ({
              ...prev,
              latex: accumulatedLatex,
            } as DocumentState))
          } else if (payload.type === 'phase_complete' && payload.phase === 'draft' && payload.sections) {
            draftSections = Array.isArray(payload.sections) ? payload.sections : []
            if (draftSections.length) {
              setDraftRows(draftSections.map((row: DraftRow) => ({ ...row })))
            }
          } else if (payload.type === 'error') {
            throw new Error(payload.message || 'Generation error occurred')
          }
        } catch (parseError) {
          console.error('Failed to parse SSE data:', parseError, event)
        }
      }
    }

    return { outlineText, latex: accumulatedLatex, draftSections }
  }

  const runOutline = useCallback(
    async (sessionId: string) => {
      setIsStageLoading(true)
      const outlineResult = await streamPhase(sessionId, 'outline')
      const rows = parseOutlineText(outlineResult.outlineText || '')
      setOutlineRows(rows.length ? rows : [{ section: 'Field', details: '' }])
      setDraftRows(rows.map((row) => ({ label: row.section, value: '' })))
      setStage('outline')
      setIsStageLoading(false)
    },
    [parseOutlineText],
  )

  const runDraft = useCallback(async (sessionId: string) => {
    setIsStageLoading(true)
    setStage('text')
    await streamPhase(sessionId, 'draft')
    setIsStageLoading(false)
  }, [])

  const runPolish = useCallback(async (sessionId: string) => {
    setIsStageLoading(true)
    await streamPhase(sessionId, 'polish')
    setIsStageLoading(false)
  }, [])

  const approveOutline = useCallback(async () => {
    if (!_aiSessionId) return
    setDraftRows(
      (sectionTemplates[selectedDocType] || sectionTemplates.miscellaneous).map((row) => ({
        label: row.label,
        value: '',
      })),
    )
    const outlineText = formatOutlineRows(outlineRows)
    setIsGenerating(true)
    setIsLivePreviewing(true)
    try {
      const res = await fetch(`/api/v1/ai/create/sessions/${_aiSessionId}/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlineText, constraints: outlineConstraints }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to approve outline')
      }
      await runDraft(_aiSessionId)
    } catch (error) {
      console.error('Outline approval failed:', error)
      addMessage('assistant', error instanceof Error ? error.message : 'Failed to approve outline. Please try again.')
    } finally {
      setIsGenerating(false)
      setIsLivePreviewing(false)
    }
  }, [_aiSessionId, formatOutlineRows, outlineConstraints, outlineRows, runDraft, sectionTemplates, selectedDocType])

  const approveDraft = useCallback(async () => {
    if (!_aiSessionId) {
      setStage('styling')
      return
    }
    const draftSections = draftRows.map((row) => ({
      label: row.label.trim() || 'Section',
      value: row.value,
    }))
    if (!draftSections.length) {
      addMessage('assistant', 'Add at least one section before continuing.')
      return
    }
    setIsGenerating(true)
    setIsLivePreviewing(true)
    try {
      const res = await fetch(`/api/v1/ai/create/sessions/${_aiSessionId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftSections }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to approve draft')
      }
      setStage('styling')
      await runPolish(_aiSessionId)
    } catch (error) {
      console.error('Draft approval failed:', error)
      addMessage('assistant', error instanceof Error ? error.message : 'Failed to approve draft. Please try again.')
    } finally {
      setIsGenerating(false)
      setIsLivePreviewing(false)
    }
  }, [_aiSessionId, draftRows, runPolish])

  const saveAndReview = useCallback(async () => {
    if (!_aiSessionId) return
    if (!currentDoc?.pdfUrl) {
      setIsGenerating(true)
      setIsLivePreviewing(true)
      try {
        await runPolish(_aiSessionId)
      } catch (error) {
        console.error('Polish failed:', error)
        addMessage('assistant', 'Failed to polish the document. Please try again.')
        return
      } finally {
        setIsGenerating(false)
        setIsLivePreviewing(false)
      }
    }
    setStage('review')
  }, [_aiSessionId, currentDoc?.pdfUrl, runPolish])

  const applyStyleAndRegenerate = useCallback(async () => {
    if (!_aiSessionId) return
    setIsGenerating(true)
    setIsLivePreviewing(true)
    const layoutChanged = styleProfile
      ? styleDraft.layout_preference !== styleProfile.layout_preference
      : true
    try {
      await fetch('/api/v1/ai/style/default_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(styleDraft),
      })
      setStyleProfile((prev) => ({ ...(prev || {}), ...styleDraft }))
      if (!layoutChanged && currentDoc?.latex) {
        const res = await fetch('/api/v1/ai/style/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latex: currentDoc.latex, style: styleDraft }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.latex) {
          throw new Error(data.error || 'Failed to apply style')
        }
        const nextLatex = data.latex as string
        const pdfUrl = await compileLatex(nextLatex)
        setCurrentDoc((prev) => (prev ? { ...prev, latex: nextLatex, pdfUrl } : prev))
      } else {
        await runPolish(_aiSessionId)
      }
    } catch (error) {
      console.error('Style update failed:', error)
      addMessage('assistant', 'Failed to apply style. Please try again.')
    } finally {
      setIsGenerating(false)
      setIsLivePreviewing(false)
    }
  }, [
    _aiSessionId,
    compileLatex,
    currentDoc?.latex,
    runPolish,
    setStyleProfile,
    styleDraft,
    styleProfile?.layout_preference,
  ])

  const generateResponse = async (userPrompt: string) => {
    setIsGenerating(true)
    resetLivePreview()
    setIsLivePreviewing(true)

    try {
      const inferredDocType = userSelectedTemplate
        ? selectedDocType
        : detectDocTypeFromPrompt(userPrompt)
      seedOutlineForDocType(inferredDocType)
      autoFillFieldsFromPrompt(userPrompt)
      setCurrentDoc((prev) => {
        if (prev) {
          return { ...prev, documentType: inferredDocType }
        }
        return { latex: '', pdfUrl: '', documentType: inferredDocType }
      })

      const createResponse = await fetch('/api/v1/ai/create/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: userPrompt,
          docType: inferredDocType,
          templateId: userSelectedTemplate ? selectedTemplateId : 'default',
        }),
      })

      const createData = await createResponse.json().catch(() => ({}))
      console.debug('[AI create] create session response', {
        status: createResponse.status,
        ok: createResponse.ok,
        sessionId: createData.sessionId,
        error: createData.error,
      })
      if (!createResponse.ok || !createData.sessionId) {
        throw new Error(createData.error || 'Failed to create AI session')
      }

    const sessionId = createData.sessionId as string
    setAiSessionId(sessionId)
    autoFilledRef.current = false
    autoFillAttemptsRef.current = 0
    } catch (error) {
      console.error('Generation error:', error)
      resetLivePreview()
      addMessage('assistant', error instanceof Error ? error.message : 'Failed to generate document. Make sure the backend is running.')
    } finally {
      setIsGenerating(false)
      setIsLivePreviewing(false)
      jobIdRef.current = null
      jobSeqRef.current = 0
      jobTotalRef.current = 0
    }
  }

  const handleInitialSubmit = async (e?: FormEvent) => {
    e?.preventDefault()
    // Don't auto-submit right after accepting voice input
    if (justAcceptedRef.current) return
    if (!prompt.trim() && !uploadedPdfFile) return

    if (uploadedPdfFile) {
      setIsImporting(true)
      try {
        const form = new FormData()
        form.append('file', uploadedPdfFile)
        form.append('docType', 'document')
        form.append('userId', 'default_user')
        const res = await fetch('/api/v1/ai/import_template', {
          method: 'POST',
          body: form,
        })
        const data = await res.json()
        if (!res.ok) {
          console.error('PDF import failed:', data.error)
        }
      } catch (err) {
        console.error('Import failed', err)
      } finally {
        setIsImporting(false)
        setUploadedPdfFile(null)
      }
    }

    setLastPrompt(prompt)
    jobIdRef.current = crypto.randomUUID()
    jobSeqRef.current = 0
    jobTotalRef.current = 3
    setView('workspace')
    const nextMessages: Message[] = [...messages, { role: 'user' as const, text: prompt }]
    setMessages(nextMessages)
    setVersions([])
    setSelectedVersionId(null)
    generateResponse(prompt)
  }

  const handleChatSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!prompt.trim()) return

    setLastPrompt(prompt)
    jobIdRef.current = crypto.randomUUID()
    jobSeqRef.current = 0
    jobTotalRef.current = 1
    const nextMessages: Message[] = [...messages, { role: 'user' as const, text: prompt }]
    setMessages(nextMessages)
    if (_aiSessionId) {
      setIsGenerating(true)
      setIsLivePreviewing(true)
      fetch(`/api/v1/ai/create/sessions/${_aiSessionId}/reprompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
        .then(() => {
          autoFilledRef.current = false
          autoFillAttemptsRef.current = 0
          setStage('outline')
          return fillFieldsFromAI()
        })
        .catch((error) => {
          console.error('Reprompt failed:', error)
          addMessage('assistant', 'Failed to reprompt. Please try again.')
        })
        .finally(() => {
          setIsGenerating(false)
          setIsLivePreviewing(false)
        })
    } else {
      generateResponse(prompt)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Don't submit right after accepting voice input
      if (justAcceptedRef.current) return
      if (view === 'landing') {
        handleInitialSubmit()
      } else {
        handleChatSubmit()
      }
    }
  }

  const selectVersion = (id: string) => {
    const version = versions.find((v) => v.id === id)
    if (!version) return
    resetLivePreview()
    setSelectedVersionId(id)
    setCurrentDoc({
      latex: version.latex,
      pdfUrl: normalizePdfUrl(version.pdfUrl),
      documentType: version.documentType,
      templateUsed: version.templateUsed,
    })
    addMessage('assistant', `Switched to version from ${version.createdAt || 'history'}.`)
    setIsHistoryOpen(false)
  }

  const regenerateFreshLayout = () => {
    const usePrompt = lastPrompt || prompt
    if (!usePrompt.trim()) {
      addMessage('assistant', 'No prompt available to regenerate.')
      return
    }
    const nextMessages: Message[] = [...messages, { role: 'user' as const, text: usePrompt }]
    setMessages(nextMessages)
    generateResponse(usePrompt)
  }

  const clearSession = () => {
    setMessages([])
    setCurrentDoc(null)
    resetLivePreview()
    setSelectedVersionId(null)
    setLastPrompt('')
    setPrompt('')
    setAiSessionId(null)
    setOutlineRows([])
    setOutlineSections([])
    setDraftRows([])
    setExcludedFields([])
    setStage('outline')
    setIsHistoryOpen(false)
    setSkipTemplates(true)
    setSelectedTemplateId('default')
    setSelectedDocType('miscellaneous')
    setIsTemplatePanelOpen(false)
    setUserSelectedTemplate(false)
    setOutlineConstraints(constraintDefaults.miscellaneous)
    autoFilledRef.current = false
    autoFillAttemptsRef.current = 0
  }

  const handleImportTemplate = async (file: File) => {
    setIsImporting(true)
    setImportStatus('Uploading...')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('docType', importDocType || 'document')
      form.append('userId', 'default_user')
      const res = await fetch('/api/v1/ai/import_template', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (res.ok) {
        setImportStatus(`Template saved for ${data.docType}`)
        setShowImportModal(false)
        fetchHistory()
      } else {
        setImportStatus(data.error || 'Import failed')
      }
    } catch (err) {
      console.error('Import failed', err)
      setImportStatus('Import failed')
    } finally {
      setIsImporting(false)
      setTimeout(() => setImportStatus(null), 2500)
    }
  }

  const applyEditedPdf = useCallback(
    (nextPdfUrl: string) => {
      setCurrentDoc((prev) => (prev ? { ...prev, pdfUrl: normalizePdfUrl(nextPdfUrl) } : prev))
    },
    [normalizePdfUrl],
  )

  return {
    view,
    setView,
    prompt,
    setPrompt: handlePromptChange,
    appendPrompt,
    messages,
    currentDoc,
    versions,
    selectedVersionId,
    styleProfile,
    styleDraft,
    setStyleDraft,
    isGenerating,
    isHistoryOpen,
    skipTemplates,
    setSkipTemplates,
    showImportModal,
    setShowImportModal,
    importDocType,
    setImportDocType,
    isImporting,
    importStatus,
    uploadedPdfFile,
    setUploadedPdfFile,
    isAssetUploading,
    assetError,
    imagePlaceholdersCount,
    addImageToPlaceholders,
    stripImagePlaceholders,
    chatEndRef,
    isLivePreviewing,
    handleInitialSubmit,
    handleChatSubmit,
    handleKeyDown,
    selectVersion,
    regenerateFreshLayout,
    clearSession,
    fetchHistory,
    handleImportTemplate,
    setIsHistoryOpen,
    applyEditedPdf,
    stage,
    outlineRows,
    outlineSections,
    setOutlineSections,
    excludedFields,
    setExcludedFields,
    draftRows,
    isStageLoading,
    setStage,
    setOutlineRows,
    setDraftRows,
    autoFillFieldsFromPrompt,
    fillFieldsFromAI,
    addPromptForFields,
    outlineConstraints,
    setOutlineConstraints,
    formatOutlineRows,
    runDraft,
    runPolish,
    runOutline,
    _aiSessionId,
    approveOutline,
    approveDraft,
    saveAndReview,
    applyStyleAndRegenerate,
    docTypes,
    templateCounts,
    templateCatalog,
    selectedDocType,
    selectedTemplateId,
    templatesForSelected,
    isTemplateLoading,
    isTemplatePanelOpen,
    setIsTemplatePanelOpen,
    applyTemplateSelection,
    templateThumbnailUrl,
    userSelectedTemplate,
    openImportTemplate,
  }
}
