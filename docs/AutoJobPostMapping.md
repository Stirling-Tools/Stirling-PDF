# AutoJobPostMapping Annotation

The `AutoJobPostMapping` annotation simplifies the creation of job-based REST endpoints in Stirling-PDF. It automatically handles job execution, file persistence, error handling, retries, and progress tracking.

## Features

- Wraps endpoint methods with job execution logic
- Supports both synchronous and asynchronous execution (via `?async=true` query parameter)
- Custom timeout configuration per endpoint
- Automatic retries with configurable retry count
- WebSocket-based progress tracking
- Consistent error handling and reporting
- Automatic persistence of uploaded files for async processing

## Usage

```java
@AutoJobPostMapping("/api/v1/security/remove-password")
public ResponseEntity<byte[]> removePassword(@ModelAttribute PDFPasswordRequest request)
        throws IOException {
    MultipartFile fileInput = request.getFileInput();
    String password = request.getPassword();
    PDDocument document = pdfDocumentFactory.load(fileInput, password);
    document.setAllSecurityToBeRemoved(true);
    return WebResponseUtils.pdfDocToWebResponse(
            document,
            Filenames.toSimpleFileName(fileInput.getOriginalFilename())
                            .replaceFirst("[.][^.]+$", "")
                    + "_password_removed.pdf");
}
```

## Parameters

The `AutoJobPostMapping` annotation accepts the following parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String[] | `{}` | The path mapping URIs (e.g., "/api/v1/security/add-password") |
| `consumes` | String[] | `{"multipart/form-data"}` | Supported media types for requests |
| `timeout` | long | `-1` (use system default) | Custom timeout in milliseconds for this job |
| `retryCount` | int | `1` (no retries) | Maximum number of retry attempts on failure |
| `trackProgress` | boolean | `true` | Enable WebSocket progress tracking for async jobs |
| `queueable` | boolean | `false` | Whether this job can be queued when system resources are limited |
| `resourceWeight` | int | `50` | Resource weight of this job (1-100), higher values indicate more resource-intensive jobs |

## Examples

### Basic Usage
```java
@AutoJobPostMapping("/api/v1/security/remove-password")
public ResponseEntity<byte[]> removePassword(@ModelAttribute PDFPasswordRequest request) {
    // Implementation
}
```

### With Custom Timeout
```java
// Set a 5-minute timeout for this operation
@AutoJobPostMapping(value = "/api/v1/misc/ocr-pdf", timeout = 300000)
public ResponseEntity<byte[]> ocrPdf(@ModelAttribute OCRRequest request) {
    // OCR implementation
}
```

### With Retries
```java
// Allow up to 3 retry attempts for external API calls
@AutoJobPostMapping(value = "/api/v1/convert/url-to-pdf", retryCount = 3)
public ResponseEntity<byte[]> convertUrlToPdf(@ModelAttribute WebsiteToPDFRequest request) {
    // Implementation
}
```

### Disable Progress Tracking
```java
// Simple, fast operation that doesn't need progress tracking
@AutoJobPostMapping(value = "/api/v1/misc/flatten", trackProgress = false)
public ResponseEntity<byte[]> flattenPdf(@ModelAttribute FlattenRequest request) {
    // Implementation
}
```

### Enable Job Queueing for Resource-Intensive Operations
```java
// Resource-intensive operation that can be queued during high system load
@AutoJobPostMapping(
    value = "/api/v1/misc/ocr-pdf", 
    queueable = true,
    resourceWeight = 80, // High resource usage
    timeout = 600000 // 10 minutes
)
public ResponseEntity<byte[]> ocrPdf(@ModelAttribute OCRRequest request) {
    // OCR implementation
}
```

### Lightweight Operation
```java
// Very lightweight operation with low resource requirements
@AutoJobPostMapping(
    value = "/api/v1/misc/get-page-count",
    queueable = false,
    resourceWeight = 10 // Very low resource usage
)
public ResponseEntity<Integer> getPageCount(@ModelAttribute PDFFile request) {
    // Simple page count implementation
}
```

## Client-Side Integration

For asynchronous jobs, clients can:
1. Submit the job with `?async=true` parameter 
2. Receive a job ID in the response
3. Connect to the WebSocket at `/ws/progress/{jobId}` to receive progress updates
4. Fetch the completed result from `/api/v1/general/job/{jobId}/result` when done

Example WebSocket message:
```json
{
  "jobId": "b4c9a31d-4b7e-42b2-8ab9-3cbe99d5b94f",
  "status": "Processing",
  "progress": 65,
  "message": "OCR processing page 13/20"
}
```

## Resource-Aware Job Queueing

The `queueable` parameter enables intelligent resource-aware job queueing for heavy operations. When enabled:

1. Jobs are automatically queued when system resources (CPU, memory) are constrained
2. Queue capacity dynamically adjusts based on available resources
3. Queue position and status updates are sent via WebSocket
4. Jobs with high `resourceWeight` values have stricter queueing conditions
5. Long-running jobs don't block the system from handling other requests

### Resource Weight Guidelines

When setting the `resourceWeight` parameter, use these guidelines:

| Weight Range | Appropriate For |
|--------------|----------------|
| 1-20 | Lightweight operations: metadata reads, simple transforms, etc. |
| 21-50 | Medium operations: basic PDF manipulation, simple image operations |
| 51-80 | Heavy operations: PDF merging, image conversions, medium OCR |
| 81-100 | Very intensive operations: large OCR jobs, complex transformations |

### Example Queue Status Messages

```json
{
  "jobId": "b4c9a31d-4b7e-42b2-8ab9-3cbe99d5b94f",
  "status": "Queued",
  "progress": 0,
  "message": "Waiting in queue for resources (position 3)"
}
```

```json
{
  "jobId": "b4c9a31d-4b7e-42b2-8ab9-3cbe99d5b94f",
  "status": "Starting",
  "progress": 10,
  "message": "Resources available, starting job execution"
}
```