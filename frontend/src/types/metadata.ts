export enum TrappedStatus {
  TRUE = 'True',
  FALSE = 'False',
  UNKNOWN = 'Unknown'
}

export interface CustomMetadataEntry {
  key: string;
  value: string;
  id: string; // For React uniqueness
}

export interface ExtractedPDFMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
  trapped: TrappedStatus;
  customMetadata: CustomMetadataEntry[];
}
