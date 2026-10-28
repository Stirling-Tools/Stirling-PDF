package stirling.software.SPDF.controller.api.misc;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MobileScannerService;
import stirling.software.common.service.MobileScannerService.FileMetadata;
import stirling.software.common.service.MobileScannerService.UploadLimitException;

/**
 * REST controller for mobile scanner functionality. Allows mobile devices to upload scanned images
 * that can be retrieved by desktop clients via a session-based system. No authentication required
 * for peer-to-peer scanning workflow.
 */
@RestController
@RequestMapping("/api/v1/mobile-scanner")
@Tag(
        name = "Mobile Scanner",
        description =
                "Endpoints for mobile-to-desktop file transfer via QR code scanning. "
                        + "Files are temporarily stored and automatically cleaned up after 10 minutes.")
@Hidden
@Slf4j
public class MobileScannerController {

    private final MobileScannerService mobileScannerService;
    private final ApplicationProperties applicationProperties;

    public MobileScannerController(
            MobileScannerService mobileScannerService,
            ApplicationProperties applicationProperties) {
        this.mobileScannerService = mobileScannerService;
        this.applicationProperties = applicationProperties;
    }

    /**
     * Check if any feature backed by these transfer sessions is enabled. The mobile scanner and
     * mobile signature drawing share this session/upload API, so the endpoints stay available while
     * either feature is on; each flag independently controls only its own UI.
     *
     * @return Error response if disabled, null if enabled
     */
    private ResponseEntity<Map<String, Object>> checkFeatureEnabled() {
        boolean anyEnabled =
                applicationProperties.getSystem().isEnableMobileScanner()
                        || applicationProperties.getSystem().isEnableMobileSignature();
        if (!anyEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(
                            Map.of(
                                    "error",
                                    "Mobile scanner feature is not enabled",
                                    "enabled",
                                    false));
        }
        return null;
    }

    /**
     * Create a new session (called by desktop when QR code is generated)
     *
     * @param sessionId Unique session identifier
     * @return Session information with expiry time
     */
    @PostMapping("/create-session/{sessionId}")
    @Operation(
            summary = "Create a new mobile scanner session",
            description = "Desktop clients call this when generating a QR code")
    @ApiResponse(
            responseCode = "200",
            description = "Session created successfully",
            content = @Content(schema = @Schema(implementation = SessionInfoResponse.class)))
    @ApiResponse(responseCode = "400", description = "Invalid session ID")
    @ApiResponse(responseCode = "503", description = "Too many active sessions")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public ResponseEntity<Map<String, Object>> createSession(
            @Parameter(description = "Session ID for QR code", required = true) @PathVariable
                    String sessionId) {

        ResponseEntity<Map<String, Object>> featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        try {
            MobileScannerService.SessionInfo sessionInfo =
                    mobileScannerService.createSession(sessionId);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("sessionId", sessionInfo.getSessionId());
            response.put("createdAt", sessionInfo.getCreatedAt());
            response.put("expiresAt", sessionInfo.getExpiresAt());
            response.put("timeoutMs", sessionInfo.getTimeoutMs());

            return ResponseEntity.ok(response);

        } catch (UploadLimitException e) {
            return limitExceeded(e);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid session creation request: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Validate if a session exists and is not expired
     *
     * @param sessionId Session identifier to validate
     * @return Session information if valid, error if invalid/expired
     */
    @GetMapping("/validate-session/{sessionId}")
    @Operation(
            summary = "Validate a mobile scanner session",
            description = "Check if session exists and is not expired")
    @ApiResponse(
            responseCode = "200",
            description = "Session is valid",
            content = @Content(schema = @Schema(implementation = SessionInfoResponse.class)))
    @ApiResponse(responseCode = "404", description = "Session not found or expired")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public ResponseEntity<Map<String, Object>> validateSession(
            @Parameter(description = "Session ID to validate", required = true) @PathVariable
                    String sessionId) {

        ResponseEntity<Map<String, Object>> featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        MobileScannerService.SessionInfo sessionInfo =
                mobileScannerService.validateSession(sessionId);

        if (sessionInfo == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("valid", false, "error", "Session not found or expired"));
        }

        Map<String, Object> response = new HashMap<>();
        response.put("valid", true);
        response.put("sessionId", sessionInfo.getSessionId());
        response.put("createdAt", sessionInfo.getCreatedAt());
        response.put("expiresAt", sessionInfo.getExpiresAt());
        response.put("timeoutMs", sessionInfo.getTimeoutMs());

        return ResponseEntity.ok(response);
    }

    /**
     * Upload files from mobile device
     *
     * @param sessionId Unique session identifier from QR code
     * @param files Files to upload
     * @return Upload status
     */
    @PostMapping("/upload/{sessionId}")
    @Operation(
            summary = "Upload scanned files from mobile device",
            description = "Mobile devices upload scanned images to a temporary session")
    @ApiResponse(
            responseCode = "200",
            description = "Files uploaded successfully",
            content = @Content(schema = @Schema(implementation = UploadResponse.class)))
    @ApiResponse(
            responseCode = "400",
            description = "Unknown or expired session, invalid session ID or no files")
    @ApiResponse(responseCode = "413", description = "File or session size limit exceeded")
    @ApiResponse(responseCode = "503", description = "Server-wide upload capacity reached")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    @ApiResponse(responseCode = "500", description = "Upload failed")
    public ResponseEntity<Map<String, Object>> uploadFiles(
            @Parameter(description = "Session ID from QR code", required = true) @PathVariable
                    String sessionId,
            @Parameter(description = "Files to upload", required = true) @RequestParam("files")
                    List<MultipartFile> files) {

        ResponseEntity<Map<String, Object>> featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        try {
            if (files == null || files.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "No files provided"));
            }

            mobileScannerService.uploadFiles(sessionId, files);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("sessionId", sessionId);
            response.put("filesUploaded", files.size());
            response.put("message", "Files uploaded successfully");

            log.info("Mobile scanner upload: session={}, files={}", sessionId, files.size());
            return ResponseEntity.ok(response);

        } catch (UploadLimitException e) {
            return limitExceeded(e);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid mobile scanner upload request: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            log.error("Failed to upload files for session: {}", sessionId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to save files"));
        }
    }

    /**
     * Get list of uploaded files for a session
     *
     * @param sessionId Session identifier
     * @return List of file metadata
     */
    @GetMapping("/files/{sessionId}")
    @Operation(
            summary = "Get uploaded files for a session",
            description = "Desktop clients poll this endpoint to check for new uploads")
    @ApiResponse(
            responseCode = "200",
            description = "File list retrieved",
            content = @Content(schema = @Schema(implementation = FileListResponse.class)))
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public ResponseEntity<Map<String, Object>> getSessionFiles(
            @Parameter(description = "Session ID", required = true) @PathVariable
                    String sessionId) {

        ResponseEntity<Map<String, Object>> featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        List<FileMetadata> files = mobileScannerService.getSessionFiles(sessionId);

        Map<String, Object> response = new HashMap<>();
        response.put("sessionId", sessionId);
        response.put("files", files);
        response.put("count", files.size());

        return ResponseEntity.ok(response);
    }

    /**
     * Download a specific file from a session
     *
     * @param sessionId Session identifier
     * @param filename Filename to download
     * @return File content
     */
    @GetMapping("/download/{sessionId}/{filename}")
    @Operation(
            summary = "Download a specific file",
            description =
                    "Download a file that was uploaded to a session. File is automatically deleted after download.")
    @ApiResponse(responseCode = "200", description = "File downloaded successfully")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    @ApiResponse(responseCode = "404", description = "File or session not found")
    public ResponseEntity<Resource> downloadFile(
            @Parameter(description = "Session ID", required = true) @PathVariable String sessionId,
            @Parameter(description = "Filename to download", required = true) @PathVariable
                    String filename) {

        if (!applicationProperties.getSystem().isEnableMobileScanner()
                && !applicationProperties.getSystem().isEnableMobileSignature()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            // From the name, not the file: nothing after getFile's claim may throw.
            MediaType contentType =
                    MediaTypeFactory.getMediaType(filename)
                            .orElse(MediaType.APPLICATION_OCTET_STREAM);
            Path filePath = mobileScannerService.getFile(sessionId, filename);

            Resource resource =
                    new DeleteAfterReadResource(
                            filePath,
                            () -> mobileScannerService.deleteFileAfterDownload(sessionId, filename),
                            () -> mobileScannerService.releaseDownloadClaim(sessionId, filename));

            return ResponseEntity.ok()
                    .contentType(contentType)
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + filename + "\"")
                    .body(resource);

        } catch (IOException e) {
            log.warn("File not found: session={}, file={}", sessionId, filename);
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Delete a session and all its files
     *
     * @param sessionId Session to delete
     * @return Deletion status
     */
    @DeleteMapping("/session/{sessionId}")
    @Operation(
            summary = "Delete a session",
            description = "Manually delete a session and all its uploaded files")
    @ApiResponse(responseCode = "200", description = "Session deleted successfully")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public ResponseEntity<Map<String, Object>> deleteSession(
            @Parameter(description = "Session ID to delete", required = true) @PathVariable
                    String sessionId) {

        ResponseEntity<Map<String, Object>> featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        mobileScannerService.deleteSession(sessionId);

        return ResponseEntity.ok(
                Map.of("success", true, "sessionId", sessionId, "message", "Session deleted"));
    }

    private ResponseEntity<Map<String, Object>> limitExceeded(UploadLimitException e) {
        log.warn("Mobile scanner storage limit: {}", e.getMessage());
        HttpStatus status =
                e.isServerCapacity()
                        ? HttpStatus.SERVICE_UNAVAILABLE
                        : HttpStatus.CONTENT_TOO_LARGE;
        return ResponseEntity.status(status).body(Map.of("error", e.getMessage()));
    }

    /**
     * Streams a file from disk, so an unread download does not pin it on the heap. When the stream
     * closes it runs {@code onFullRead} if the whole file was read, otherwise {@code
     * onPartialRead}, so a failed or ranged download leaves the file to be fetched again.
     */
    private static final class DeleteAfterReadResource extends FileSystemResource {
        private final Runnable onFullRead;
        private final Runnable onPartialRead;

        DeleteAfterReadResource(Path path, Runnable onFullRead, Runnable onPartialRead) {
            super(path);
            this.onFullRead = onFullRead;
            this.onPartialRead = onPartialRead;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return new FilterInputStream(super.getInputStream()) {
                private boolean reachedEnd;
                private boolean closed;

                @Override
                public int read() throws IOException {
                    int b = super.read();
                    reachedEnd |= b == -1;
                    return b;
                }

                @Override
                public int read(byte[] buffer, int offset, int length) throws IOException {
                    int n = super.read(buffer, offset, length);
                    reachedEnd |= n == -1;
                    return n;
                }

                @Override
                public long transferTo(OutputStream out) throws IOException {
                    // Copies through read() so reaching the end is seen; delegating would bypass
                    // it.
                    long total = 0;
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = read(buffer, 0, buffer.length)) != -1) {
                        out.write(buffer, 0, n);
                        total += n;
                    }
                    return total;
                }

                @Override
                public void close() throws IOException {
                    if (closed) {
                        return;
                    }
                    closed = true;
                    try {
                        super.close();
                    } finally {
                        (reachedEnd ? onFullRead : onPartialRead).run();
                    }
                }
            };
        }
    }

    // Response schemas for OpenAPI documentation
    private static class SessionInfoResponse {
        public boolean success;
        public String sessionId;
        public long createdAt;
        public long expiresAt;
        public long timeoutMs;
    }

    private static class UploadResponse {
        public boolean success;
        public String sessionId;
        public int filesUploaded;
        public String message;
    }

    private static class FileListResponse {
        public String sessionId;
        public List<FileMetadata> files;
        public int count;
    }
}
