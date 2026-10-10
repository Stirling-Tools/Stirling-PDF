# Stirling PDF File History Specification

## Overview

Stirling PDF implements a client-side file history system using IndexedDB storage. File metadata, including version history and tool chains, are stored as `StirlingFileStub` objects that travel alongside the actual file data. This enables comprehensive version tracking, tool history, and file lineage management without modifying PDF content.

## Storage Architecture

### IndexedDB-Based Storage
File history is stored in the browser's IndexedDB using the `fileStorage` service, providing:
- **Persistent storage**: Survives browser sessions and page reloads
- **Large capacity**: Supports files up to 100GB+ with full metadata
- **Fast queries**: Optimized for file browsing and history lookups
- **Type safety**: Structured TypeScript interfaces

### Core Data Structures

```typescript
interface StirlingFileStub extends BaseFileMetadata {
  id: FileId;                      // Unique file identifier (UUID)
  quickKey: string;                // Deduplication key: name|size|lastModified
  thumbnailUrl?: string;           // Generated thumbnail blob URL
  processedFile?: ProcessedFileMetadata;  // PDF page data and processing results
  
  // File Metadata
  name: string;
  size: number;
  type: string;
  lastModified: number;
  createdAt: number;
  
  // Version Control
  isLeaf: boolean;                 // True if this is the latest version
  versionNumber?: number;          // Version number (1, 2, 3, etc.)
  originalFileId?: string;         // UUID of the root file in version chain
  parentFileId?: string;           // UUID of immediate parent file
  
  // Tool History
  toolHistory?: ToolOperation[];   // Complete sequence of applied tools
}

interface ToolOperation {
  toolName: string;                // Tool identifier (e.g., 'compress', 'sanitize')
  timestamp: number;               // When the tool was applied
}

interface StoredStirlingFileRecord extends StirlingFileStub {
  data: ArrayBuffer;               // Actual file content
  fileId: FileId;                  // Duplicate for indexing
}
```

## Version Management System

### Version Progression
- **v1**: Original uploaded file (first version)
- **v2**: First tool applied to original
- **v3**: Second tool applied (inherits from v2)
- **v4**: Third tool applied (inherits from v3)
- **etc.**

### Leaf Node System
Only the latest version of each file family is marked as `isLeaf: true`:
- **Leaf files**: Show in default file list, available for tool processing
- **History files**: Hidden by default, accessible via history expansion

### File Relationships
```
document.pdf (v1, isLeaf: false) 
    ↓ compress
document.pdf (v2, isLeaf: false)
    ↓ sanitize  
document.pdf (v3, isLeaf: true)  ← Current active version
```

## Implementation Architecture

### 1. FileStorage Service (`fileStorage.ts`)

**Core Methods:**
```typescript
// Store file with complete metadata
async storeStirlingFile(stirlingFile: StirlingFile, stub: StirlingFileStub): Promise<void>

// Load file with metadata
async getStirlingFile(id: FileId): Promise<StirlingFile | null>
async getStirlingFileStub(id: FileId): Promise<StirlingFileStub | null>

// Query operations  
async getLeafStirlingFileStubs(): Promise<StirlingFileStub[]>
async getAllStirlingFileStubs(): Promise<StirlingFileStub[]>

// Version management
async markFileAsProcessed(fileId: FileId): Promise<boolean>  // Set isLeaf = false
async markFileAsLeaf(fileId: FileId): Promise<boolean>       // Set isLeaf = true
```

### 2. File Context Integration

**FileContext** manages runtime state with `StirlingFileStub[]` in memory:
```typescript
interface FileContextState {
  files: {
    ids: FileId[];
    byId: Record<FileId, StirlingFileStub>;
  };
}
```

**Key Operations:**
- `addFiles()`: Stores new files with initial metadata
- `addStirlingFileStubs()`: Loads existing files from storage with preserved metadata
- `consumeFiles()`: Processes files through tools, creating new versions

### 3. Tool Operation Integration

**Tool Processing Flow:**
1. **Input**: User selects files (marked as `isLeaf: true`)
2. **Processing**: Backend processes files and returns results
3. **History Creation**: New `StirlingFileStub` created with:
   - Incremented version number
   - Updated tool history
   - Parent file reference
4. **Storage**: Both parent (marked `isLeaf: false`) and child (marked `isLeaf: true`) stored
5. **UI Update**: FileContext updated with new file state

**Child Stub Creation:**
```typescript
export function createChildStub(
  parentStub: StirlingFileStub, 
  operation: { toolName: string; timestamp: number }, 
  resultingFile: File, 
  thumbnail?: string
): StirlingFileStub {
  return {
    id: createFileId(),
    name: resultingFile.name,
    size: resultingFile.size,
    type: resultingFile.type,
    lastModified: resultingFile.lastModified,
    quickKey: createQuickKey(resultingFile),
    createdAt: Date.now(),
    isLeaf: true,
    
    // Version Control
    versionNumber: (parentStub.versionNumber || 1) + 1,
    originalFileId: parentStub.originalFileId || parentStub.id,
    parentFileId: parentStub.id,
    
    // Tool History
    toolHistory: [...(parentStub.toolHistory || []), operation],
    thumbnailUrl: thumbnail
  };
}
```

## UI Integration

### File Manager History Display

**FileManager** (`FileManager.tsx`) provides:
- **Default View**: Shows only leaf files (`isLeaf: true`)
- **History Expansion**: Click to show all versions of a file family
- **History Groups**: Nested display using `FileHistoryGroup.tsx`

**FileListItem** (`FileListItem.tsx`) displays:
- **Version Badges**: v1, v2, v3 indicators
- **Tool Chain**: Complete processing history in tooltips
- **History Actions**: "Show/Hide History" toggle, "Restore" for history files

### FileManagerContext Integration

**File Selection Flow:**
```typescript
// Recent files (from storage)
onRecentFileSelect: (stirlingFileStubs: StirlingFileStub[]) => void
// Calls: actions.addStirlingFileStubs(stirlingFileStubs, options)

// New uploads  
onFileUpload: (files: File[]) => void
// Calls: actions.addFiles(files, options)
```

**History Management:**
```typescript
// Toggle history visibility
const { expandedFileIds, onToggleExpansion } = useFileManagerContext();

// Restore history file to current
const handleAddToRecents = (file: StirlingFileStub) => {
  fileStorage.markFileAsLeaf(file.id);  // Make this version current
};
```

## Data Flow

### New File Upload
```
1. User uploads files → addFiles() 
2. Generate thumbnails and page count
3. Create StirlingFileStub with isLeaf: true, versionNumber: 1
4. Store both StirlingFile + StirlingFileStub in IndexedDB
5. Dispatch to FileContext state
```

### Tool Processing
```
1. User selects tool + files → useToolOperation()
2. API processes files → returns processed File objects
3. createChildStub() for each result:
   - Parent marked isLeaf: false
   - Child created with isLeaf: true, incremented version
4. Store all files with updated metadata
5. Update FileContext with new state
```

### File Loading (Recent Files)
```
1. User selects from FileManager → onRecentFileSelect()
2. addStirlingFileStubs() with preserved metadata
3. Load actual StirlingFile data from storage  
4. Files appear in workbench with complete history intact
```

## Performance Optimizations

### Metadata Regeneration
When loading files from storage, missing `processedFile` data is regenerated:
```typescript
// In addStirlingFileStubs()
const needsProcessing = !record.processedFile || 
                        !record.processedFile.pages || 
                        record.processedFile.pages.length === 0;

if (needsProcessing) {
  const result = await generateThumbnailWithMetadata(stirlingFile);
  record.processedFile = createProcessedFile(result.pageCount, result.thumbnail);
}
```

### Memory Management
- **Blob URL Tracking**: Automatic cleanup of thumbnail URLs
- **Lazy Loading**: Files loaded from storage only when needed
- **LRU Caching**: File objects cached in memory with size limits

## File Deduplication

### QuickKey System
Files are deduplicated using `quickKey` format:
```typescript
const quickKey = `${file.name}|${file.size}|${file.lastModified}`;
```

This prevents duplicate uploads while allowing different versions of the same logical file.

## Error Handling

### Graceful Degradation
- **Storage Failures**: Files continue to work without persistence
- **Metadata Issues**: Missing metadata regenerated on demand
- **Version Conflicts**: Automatic version number resolution

### Recovery Scenarios
- **Corrupted Storage**: Automatic cleanup and re-initialization
- **Missing Files**: Stubs cleaned up automatically
- **Version Mismatches**: Automatic version chain reconstruction

## Developer Guidelines

### Adding File History to New Components

1. **Use FileContext Actions**:
```typescript
const { actions } = useFileActions();
await actions.addFiles(files);  // For new uploads
await actions.addStirlingFileStubs(stubs);  // For existing files
```

2. **Preserve Metadata When Processing**:
```typescript
const childStub = createChildStub(parentStub, {
  toolName: 'compress',
  timestamp: Date.now()
}, processedFile, thumbnail);
```

3. **Handle Storage Operations**:
```typescript
await fileStorage.storeStirlingFile(stirlingFile, stirlingFileStub);
const stub = await fileStorage.getStirlingFileStub(fileId);
```

### Testing File History

1. **Upload files**: Should show v1, marked as leaf
2. **Apply tool**: Should create v2, mark v1 as non-leaf
3. **Check FileManager**: History should show both versions
4. **Restore old version**: Should mark old version as leaf
5. **Check storage**: Both versions should persist in IndexedDB

## Future Enhancements

### Potential Improvements
- **Branch History**: Support for parallel processing branches
- **History Export**: Export complete version history as JSON
- **Conflict Resolution**: Handle concurrent modifications
- **Cloud Sync**: Sync history across devices
- **Compression**: Compress historical file data

### API Extensions
- **Batch Operations**: Process multiple version chains simultaneously
- **Search Integration**: Search within tool history and file metadata
- **Analytics**: Track usage patterns and tool effectiveness

---

**Last Updated**: January 2025  
**Implementation**: Stirling PDF Frontend v2  
**Storage Version**: IndexedDB with fileStorage service