# Stirling PDF File History Specification

## Overview

Stirling PDF implements a comprehensive file history tracking system that embeds metadata directly into PDF documents using the PDF keywords field. This system tracks tool operations, version progression, and file lineage through the processing pipeline.

## PDF Metadata Format

### Storage Mechanism
File history is stored in the PDF **Keywords** field as a JSON string with the prefix `stirling-history:`.

### Metadata Structure

```typescript
interface PDFHistoryMetadata {
  stirlingHistory: {
    originalFileId: string;        // UUID of the root file in the version chain
    parentFileId?: string;         // UUID of the immediate parent file  
    versionNumber: number;         // Version number (1, 2, 3, etc.)
    toolChain: ToolOperation[];    // Array of applied tool operations
    createdBy: 'Stirling-PDF';     // System identifier
    formatVersion: '1.0';          // Metadata format version
    createdAt: number;             // Timestamp when version was created
    lastModified: number;          // Timestamp when last modified
  };
}

interface ToolOperation {
  toolName: string;                // Tool identifier (e.g., 'compress', 'sanitize')
  timestamp: number;               // When the tool was applied
  parameters?: Record<string, any>; // Tool-specific parameters (optional)
}
```

### Example PDF Keywords Field
```
Keywords: ["user-keyword", "stirling-history:{\"stirlingHistory\":{\"originalFileId\":\"abc123\",\"versionNumber\":2,\"toolChain\":[{\"toolName\":\"compress\",\"timestamp\":1756825614618},{\"toolName\":\"sanitize\",\"timestamp\":1756825631545}],\"createdBy\":\"Stirling-PDF\",\"formatVersion\":\"1.0\"}}"]
```

## Version Numbering System

### Version Progression
- **v0**: Original uploaded file (no Stirling PDF processing)
- **v1**: First tool applied to original file
- **v2**: Second tool applied (inherits from v1)  
- **v3**: Third tool applied (inherits from v2)
- **etc.**

### Version Relationships
```
document.pdf (v0) 
    ↓ compress
document.pdf (v1: compress)
    ↓ sanitize  
document.pdf (v2: compress → sanitize)
    ↓ ocr
document.pdf (v3: compress → sanitize → ocr)
```

## File Lineage Tracking

### Original File ID
The `originalFileId` remains constant throughout the entire version chain, enabling grouping of all versions of the same logical document.

### Parent-Child Relationships  
Each processed file references its immediate parent via `parentFileId`, creating a complete audit trail.

### Tool Chain
The `toolChain` array maintains the complete sequence of tool operations applied to reach the current version.

## Implementation Architecture

### Frontend Components

#### 1. PDF Metadata Service (`pdfMetadataService.ts`)
- **PDF-lib Integration**: Uses pdf-lib for metadata injection/extraction
- **Caching**: ContentCache with 10-minute TTL for performance
- **Encryption Support**: Handles encrypted PDFs with `ignoreEncryption: true`

**Key Methods:**
```typescript
// Inject metadata into PDF
injectHistoryMetadata(pdfBytes: ArrayBuffer, originalFileId: string, parentFileId?: string, toolChain: ToolOperation[], versionNumber: number): Promise<ArrayBuffer>

// Extract metadata from PDF  
extractHistoryMetadata(pdfBytes: ArrayBuffer): Promise<PDFHistoryMetadata | null>

// Create new version with incremented number
createNewVersion(pdfBytes: ArrayBuffer, parentFileId: string, toolOperation: ToolOperation): Promise<ArrayBuffer>
```

#### 2. File History Utilities (`fileHistoryUtils.ts`)
- **FileContext Integration**: Links PDF metadata with React state management
- **Version Management**: Handles version grouping and latest version filtering
- **Tool Integration**: Prepares files for tool processing with history injection

**Key Functions:**
```typescript
// Extract history from File and update FileRecord
extractFileHistory(file: File, record: FileRecord): Promise<FileRecord>

// Inject history before tool processing
injectHistoryForTool(file: File, sourceFileRecord: FileRecord, toolName: string, parameters?): Promise<File>

// Group files by original ID for version management
groupFilesByOriginal(fileRecords: FileRecord[]): Map<string, FileRecord[]>

// Get only latest version of each file group
getLatestVersions(fileRecords: FileRecord[]): FileRecord[]
```

#### 3. Tool Operation Integration (`useToolOperation.ts`)
- **Automatic Injection**: All tool operations automatically inject history metadata
- **Version Progression**: Reads current version from PDF and increments appropriately
- **Universal Support**: Works with single-file, multi-file, and custom tool patterns

### Data Flow

```
1. User uploads PDF → No history (v0)
2. Tool processing begins → prepareFilesWithHistory() injects current state
3. Backend processes PDF → Returns processed file with embedded history  
4. FileContext adds result → extractFileHistory() reads embedded metadata
5. UI displays file → Shows version badges and tool chain
```

## UI Integration

### File Manager
- **Version Toggle**: Switch between "Latest Only" and "All Versions" views
- **Version Badges**: v0, v1, v2 indicators on file items
- **History Dropdown**: Version timeline with restore functionality
- **Tool Chain Display**: Complete processing history in file details panel

### Active Files Workbench
- **Version Metadata**: Version number in file metadata line (e.g., "PDF file - 3 Pages - v2")
- **Tool Chain Overlay**: Bottom overlay showing tool sequence (e.g., "compress → sanitize")
- **Real-time Updates**: Immediate display after tool processing

## Storage and Persistence

### PDF Metadata
- **Embedded in PDF**: History travels with the document across downloads/uploads
- **Keywords Field**: Uses standard PDF metadata field for maximum compatibility
- **Multiple Keywords**: System handles multiple history entries and extracts latest version

### IndexedDB Storage
- **Client-side Persistence**: FileMetadata includes extracted history information
- **Lazy Loading**: History extracted when files are accessed from storage
- **Batch Processing**: Large collections processed in batches of 5 to prevent memory issues

### Memory Management
- **ContentCache**: 10-minute TTL, 50-file capacity for metadata extraction results
- **Cleanup**: Automatic cache eviction and expired entry removal
- **Large File Support**: No artificial size limits (supports 100GB+ PDFs)

## Tool Configuration

### Filename Preservation
Most tools preserve the original filename to maintain file identity:

**No Prefix (Filename Preserved):**
- compress, repair, sanitize, addPassword, removePassword, changePermissions, removeCertificateSign, unlockPdfForms, ocr, addWatermark

**With Prefix (Different Content):**
- split (`split_` - creates multiple files)
- convert (`converted_` - changes file format)

### Configuration Pattern
```typescript
export const toolOperationConfig = {
  toolType: ToolType.singleFile,
  operationType: 'toolName',
  endpoint: '/api/v1/category/tool-endpoint',
  filePrefix: '', // Empty for filename preservation
  buildFormData: buildToolFormData,
  defaultParameters
};
```

## Error Handling and Resilience

### Graceful Degradation
- **Extraction Failures**: Files display normally without history if metadata extraction fails
- **Encrypted PDFs**: System handles encrypted documents with `ignoreEncryption` option
- **Corrupted Metadata**: Invalid history metadata is silently ignored with fallback to basic file info

### Performance Considerations
- **Caching**: Metadata extraction results are cached to avoid re-parsing
- **Batch Processing**: Large file collections processed in controlled batches
- **Async Extraction**: History extraction doesn't block file operations

## Developer Guidelines

### Adding History to New Tools
1. **Set `filePrefix: ''`** in tool configuration to preserve filenames
2. **Use existing patterns**: Tool operations automatically inherit history injection
3. **Custom processors**: Must handle history injection manually if using custom response handlers

### Testing File History
1. **Upload a PDF**: Should show no version (v0)
2. **Apply any tool**: Should show v1 with tool name in history
3. **Apply another tool**: Should show v2 with tool chain sequence
4. **Check file manager**: Version toggle and history dropdown should work
5. **Check workbench**: Tool chain overlay should appear on thumbnails

### Debugging
Enable development mode logging to see:
- History injection: `📄 Injected PDF history metadata`
- History extraction: `📄 History extraction completed` 
- Version progression: Version number increments and tool chain updates

## Future Enhancements

### Possible Extensions
- **Branching**: Support for parallel processing branches from same source
- **Diff Tracking**: Track specific changes made by each tool
- **User Attribution**: Add user information to tool operations
- **Timestamp Precision**: Enhanced timestamp tracking for audit trails
- **Export Options**: Export complete processing history as JSON/XML

### Compatibility
- **PDF Standard Compliance**: Uses standard PDF Keywords field for broad compatibility
- **Backwards Compatibility**: PDFs without history metadata work normally
- **Future Versions**: Format version field enables future metadata schema evolution

---

**Last Updated**: January 2025  
**Format Version**: 1.0  
**Implementation**: Stirling PDF Frontend v2