import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { DocumentState, Message, StyleProfile, VersionEntry } from '../types'

type ViewMode = 'landing' | 'workspace'

export function useDocumentWorkflow() {
  const [view, setView] = useState<ViewMode>('landing')
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentDoc, setCurrentDoc] = useState<DocumentState | null>(null)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLivePreviewing, setIsLivePreviewing] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')
  const [skipTemplates, setSkipTemplates] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importDocType, setImportDocType] = useState('document')
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [uploadedPdfFile, setUploadedPdfFile] = useState<File | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const justAcceptedRef = useRef(false)
  const progressiveJobRef = useRef<{ aborted: boolean; baseJobId: string; finalPdfUrl: string } | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const jobSeqRef = useRef<number>(0)
  const jobTotalRef = useRef<number>(0)
  const normalizePdfUrl = useCallback((url?: string | null) => {
    if (!url) return url || undefined
    return url.startsWith('/output/') ? `/api/v1/ai${url}` : url
  }, [])

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

  const generateResponse = async (
    userPrompt: string,
    conversation: Message[] = messages,
    skipTemplateFlag = skipTemplates,
  ) => {
    setIsGenerating(true)
    resetLivePreview()
    setIsLivePreviewing(true)

    if (!jobIdRef.current) {
      jobIdRef.current = crypto.randomUUID()
      jobSeqRef.current = 0
      jobTotalRef.current = view === 'workspace' ? 1 : 3
    }
    
    let accumulatedLatex = ''
    let jobId: string | null = null
    let finalVersion: VersionEntry | null = null
    let sseBuffer = ''
    let abortStreaming = false
    
    try {
      const response = await fetch('/api/v1/ai/generate_stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Job-Id': jobIdRef.current,
          'X-Job-Seq': String(jobSeqRef.current += 1),
          'X-Job-Total': String(jobTotalRef.current),
        },
        body: JSON.stringify({
          prompt: userPrompt,
          userId: 'default_user',
          conversationHistory: conversation.map((m) => ({ role: m.role, content: m.text })),
          currentLatex: currentDoc?.latex || null,
          skipTemplate: skipTemplateFlag,
        }),
      })

      const contentType = response.headers.get('content-type') || ''
      const isJsonResponse = contentType.includes('application/json')
      
      if (!response.ok || isJsonResponse) {
        const errorData = await response.json().catch(() => ({}))
        
        if (errorData.needsInfo) {
          addMessage('assistant', errorData.message || 'I need a few more details before generating your PDF.')
          setIsGenerating(false)
          setIsLivePreviewing(false)
          return
        }
        
        if (!response.ok) {
          throw new Error(errorData.error || 'Failed to start generation')
        }
        
        // Unexpected JSON with 200 – bail out instead of trying to parse as SSE
        throw new Error('Received non-streaming response from server')
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

        // SSE events are separated by blank lines
        const events = sseBuffer.split('\n\n')
        // Keep the last partial event in buffer
        sseBuffer = events.pop() || ''

        for (const event of events) {
          const dataLines = event
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())

          if (!dataLines.length) continue

          try {
            const payload = JSON.parse(dataLines.join('\n'))

            if (payload.type === 'start') {
              jobId = payload.jobId || jobId
              if (payload.documentType) {
                setCurrentDoc((prev) => ({
                  ...prev,
                  documentType: payload.documentType,
                } as DocumentState))
              }
            } else if (payload.type === 'latex_chunk') {
              accumulatedLatex = payload.accumulated || `${accumulatedLatex}${payload.chunk || ''}`
              setCurrentDoc((prev) => ({
                ...prev,
                latex: accumulatedLatex,
              } as DocumentState))
            } else if (payload.type === 'heartbeat') {
              // keep-alive/no-op
            } else if (payload.type === 'pdf_update') {
              setCurrentDoc((prev) => ({
                ...prev,
                pdfUrl: normalizePdfUrl(payload.pdfUrl),
                latex: accumulatedLatex,
              } as DocumentState))
              // Remove overlay as soon as we have a preview PDF
              setIsGenerating(false)
            } else if (payload.type === 'complete') {
              const normalizedPdfUrl = normalizePdfUrl(payload.pdfUrl) || payload.pdfUrl
              finalVersion = payload.version || {
                id: payload.jobId || jobId || crypto.randomUUID(),
                prompt: userPrompt,
                latex: payload.latex || accumulatedLatex,
                pdfUrl: normalizedPdfUrl,
                documentType: payload.documentType,
                createdAt: new Date().toISOString(),
                templateUsed: payload.templateUsed,
              }
              const finalDoc: DocumentState = {
                latex: payload.latex || accumulatedLatex,
                pdfUrl: normalizedPdfUrl,
                documentType: payload.documentType,
                templateUsed: payload.templateUsed,
              }
              setCurrentDoc(finalDoc)
              if (finalVersion) {
                const versionToAdd = finalVersion
                setSelectedVersionId(versionToAdd.id)
                setVersions((prev) => {
                  const exists = prev.find((v) => v.id === versionToAdd.id)
                  if (exists) return prev
                  return [versionToAdd, ...prev].slice(0, 20)
                })
              }
              if (payload.styleProfile) {
                setStyleProfile(payload.styleProfile)
              }
              addMessage('assistant', `Generated ${payload.documentType} successfully!`)
            } else if (payload.type === 'error') {
              const message = payload.message || 'Generation error occurred'
              addMessage('assistant', message)
              resetLivePreview()
              setIsGenerating(false)
              setIsLivePreviewing(false)
              abortStreaming = true
              await reader.cancel().catch(() => {})
              break
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError, event)
          }
        }

        if (abortStreaming) break
      }
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
    generateResponse(prompt, nextMessages, skipTemplates)
    setPrompt('')
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
    generateResponse(prompt, nextMessages, skipTemplates)
    setPrompt('')
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
    generateResponse(usePrompt, nextMessages, true)
  }

  const clearSession = () => {
    setMessages([])
    setCurrentDoc(null)
    resetLivePreview()
    setSelectedVersionId(null)
    setLastPrompt('')
    setPrompt('')
    setIsHistoryOpen(false)
    setSkipTemplates(true)
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
    setPrompt,
    appendPrompt,
    messages,
    currentDoc,
    versions,
    selectedVersionId,
    styleProfile,
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
  }
}
