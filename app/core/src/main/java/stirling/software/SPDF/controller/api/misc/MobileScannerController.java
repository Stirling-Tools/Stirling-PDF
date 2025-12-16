package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

import stirling.software.common.service.MobileScannerService;
import stirling.software.common.service.MobileScannerService.FileMetadata;

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

    public MobileScannerController(MobileScannerService mobileScannerService) {
        this.mobileScannerService = mobileScannerService;
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
    @ApiResponse(responseCode = "400", description = "Invalid session ID or files")
    @ApiResponse(responseCode = "500", description = "Upload failed")
    public ResponseEntity<Map<String, Object>> uploadFiles(
            @Parameter(description = "Session ID from QR code", required = true) @PathVariable
                    String sessionId,
            @Parameter(description = "Files to upload", required = true) @RequestParam("files")
                    List<MultipartFile> files) {

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
    public ResponseEntity<Map<String, Object>> getSessionFiles(
            @Parameter(description = "Session ID", required = true) @PathVariable
                    String sessionId) {

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
    @ApiResponse(responseCode = "404", description = "File or session not found")
    public ResponseEntity<Resource> downloadFile(
            @Parameter(description = "Session ID", required = true) @PathVariable String sessionId,
            @Parameter(description = "Filename to download", required = true) @PathVariable
                    String filename) {

        try {
            Path filePath = mobileScannerService.getFile(sessionId, filename);

            // Read file into memory first, so we can delete it before sending
            byte[] fileBytes = Files.readAllBytes(filePath);

            String contentType = Files.probeContentType(filePath);
            if (contentType == null) {
                contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
            }

            // Delete file immediately after reading into memory (server-side cleanup)
            mobileScannerService.deleteFileAfterDownload(sessionId, filename);

            // Serve from memory
            Resource resource = new org.springframework.core.io.ByteArrayResource(fileBytes);

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
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
    public ResponseEntity<Map<String, Object>> deleteSession(
            @Parameter(description = "Session ID to delete", required = true) @PathVariable
                    String sessionId) {

        mobileScannerService.deleteSession(sessionId);

        return ResponseEntity.ok(
                Map.of("success", true, "sessionId", sessionId, "message", "Session deleted"));
    }

    // Response schemas for OpenAPI documentation
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
