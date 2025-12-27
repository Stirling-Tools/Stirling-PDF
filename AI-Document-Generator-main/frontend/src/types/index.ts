export interface Message {
  role: 'user' | 'assistant'
  text: string
}

export interface StyleProfile {
  layout_preference?: string
  font_preference?: string
  tone?: string
  color_accent?: string
  last_doc_type?: string | null
}

export interface VersionEntry {
  id: string
  prompt: string
  latex: string
  pdfUrl: string
  documentType: string
  createdAt?: string
  styleProfile?: StyleProfile
  templateUsed?: boolean
}

export interface DocumentState {
  latex: string
  pdfUrl: string
  documentType: string
  templateUsed?: boolean
}
