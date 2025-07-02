# Exception Handling Guide

This guide shows how to use the centralized exception handling utilities for consistent error messages with frontend translation support.

## Architecture Overview

The system uses a **backend-frontend translation split**:
- **Backend**: Creates structured JSON error responses with translation keys and English fallbacks
- **Frontend**: Translates error messages to user's language using JavaScript

## New Utilities

### 1. ExceptionUtils  
Creates `TranslatableException` instances with structured translation data for frontend.

### 2. GlobalExceptionHandler
Converts exceptions to structured JSON responses with translation information.

### 3. MessageFormatter.js
Frontend utility for translating error messages with placeholder replacement.

## Usage Examples

### Basic PDF Exception Handling

**Before:**
```java
try {
    // PDF operation
} catch (IOException e) {
    if (PdfErrorUtils.isCorruptedPdfError(e)) {
        throw new IOException("PDF file is corrupted...", e);
    }
    throw e;
}
```

**After:**
```java
try {
    // PDF operation
} catch (IOException e) {
    ExceptionUtils.logException("operation name", e);
    throw ExceptionUtils.handlePdfException(e);
}
```

### Creating Specific Exception Types

```java
// PDF corruption
throw ExceptionUtils.createPdfCorruptedException(originalException);

// PDF corruption with context
throw ExceptionUtils.createPdfCorruptedException("during merge", originalException);

// Multiple PDF corruption (for merge operations)
throw ExceptionUtils.createMultiplePdfCorruptedException(originalException);

// PDF encryption issues
throw ExceptionUtils.createPdfEncryptionException(originalException);

// File processing errors
throw ExceptionUtils.createFileProcessingException("merge", originalException);

// Generic exceptions with i18n
throw ExceptionUtils.createIOException("error.customKey", "Default message", originalException, arg1, arg2);
```

### JSON Error Response Format

The system returns structured JSON error responses with translation support:

```json
{
  "error": "Bad Request",
  "message": "DPI value 500 exceeds maximum safe limit of 300. High DPI values can cause memory issues and crashes. Please use a lower DPI value.",
  "trace": "java.lang.IllegalArgumentException: ...",
  "translationKey": "error.dpiExceedsLimit", 
  "translationArgs": ["500", "300"]
}
```

**Key Features:**
- `message`: English fallback for API consumers that ignore translation
- `translationKey`: Frontend translation key 
- `translationArgs`: Arguments for placeholder replacement
- API consumers can rely on `message` for backwards compatibility

### Frontend Translation with MessageFormatter

```javascript
// Translate error messages with placeholder replacement
const displayMessage = window.MessageFormatter.translate(
    json.translationKey,
    json.translationArgs, 
    json.message // fallback to original message
);
```

## Controller Pattern

```java
@RestController
public class MyController {
    
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    
    @PostMapping("/process")
    public ResponseEntity<byte[]> processFile(@ModelAttribute FileRequest request) throws IOException {
        try {
            PDDocument document = pdfDocumentFactory.load(request.getFileInput());
            
            // Process document...
            
            return WebResponseUtils.pdfDocToWebResponse(document, "output.pdf");
        } catch (IOException e) {
            ExceptionUtils.logException("file processing", e);
            throw ExceptionUtils.handlePdfException(e, "during processing");
        }
    }
}
```

## Error Message Keys

When creating new exception messages, add the corresponding i18n keys to `messages_en_GB.properties` only. The translation scripts will automatically propagate them to other language files during merge.

### Key Categories Available:

**Core PDF Operations:**
- `error.pdfCorrupted` - General PDF corruption
- `error.pdfCorruptedDuring` - Corruption with context (takes operation parameter)
- `error.pdfEncryption` - Encryption/decryption issues
- `error.pdfPassword` - Password-related errors

**File Processing:**
- `error.fileProcessing` - Generic file operation errors (takes operation and error message)
- `error.commandFailed` - External tool failures (takes tool name)

**Validation:**
- `error.invalidArgument` - Invalid parameters (takes argument description)
- `error.invalidFormat` - Invalid file formats (takes format type)
- `error.optionsNotSpecified` - Missing required options (takes option type)

**System Requirements:**
- `error.toolNotInstalled` - Missing tools (takes tool name)
- `error.toolRequired` - Tool requirements (takes tool and operation)

### Creating New Keys:
When adding new error scenarios, follow the naming pattern:
- `error.[category].[specific]` (e.g., `error.ocr.languageRequired`)
- Keep parameter placeholders simple and translatable
- Avoid putting full sentences in `{0}` parameters

### Parameter Best Practices:

**✅ Good Examples:**
```java
// Simple identifiers or values
ExceptionUtils.createIllegalArgumentException("error.invalidArgument", "Invalid argument: {0}", "angle");
ExceptionUtils.createRuntimeException("error.commandFailed", "{0} command failed", null, "Tesseract");
ExceptionUtils.createIllegalArgumentException("error.invalidFormat", "Invalid {0} format", "PDF");
```

**❌ Bad Examples:**
```java
// Full sentences that can't be translated
ExceptionUtils.createIllegalArgumentException("error.invalidArgument", "Invalid argument: {0}", "angle must be multiple of 90");
```

**Solution for Complex Messages:**
Create specific i18n keys instead:
```java
// Instead of complex parameters, create specific keys
ExceptionUtils.createIllegalArgumentException("error.angleNotMultipleOf90", "Angle must be a multiple of 90");
```

## Testing Error Messages

```java
@Test
public void testErrorMessageLocalization() {
    // Test with different locales
    LocaleContextHolder.setLocale(Locale.FRENCH);
    
    IOException exception = ExceptionUtils.createPdfCorruptedException(new RuntimeException("test"));
    
    // Verify message is in French
    assertThat(exception.getMessage()).contains("PDF");
}
```