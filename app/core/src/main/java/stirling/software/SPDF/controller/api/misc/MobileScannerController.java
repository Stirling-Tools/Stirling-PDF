package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.MobileScannerService;
import stirling.software.common.service.MobileScannerService.FileMetadata;

/**
 * REST controller for mobile scanner functionality. Allows mobile devices to upload scanned images
 * that can be retrieved by desktop clients via a session-based system. No authentication required
 * for peer-to-peer scanning workflow.
 */
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/mobile-scanner")
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
     * Check if mobile scanner feature is enabled
     *
     * @return Error response if disabled, null if enabled
     */
    private Response checkFeatureEnabled() {
        if (!applicationProperties.getSystem().isEnableMobileScanner()) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(
                            Map.of(
                                    "error",
                                    "Mobile scanner feature is not enabled",
                                    "enabled",
                                    false))
                    .build();
        }
        return null;
    }

    /**
     * Create a new session (called by desktop when QR code is generated)
     *
     * @param sessionId Unique session identifier
     * @return Session information with expiry time
     */
    @POST
    @jakarta.ws.rs.Path("/create-session/{sessionId}")
    @Operation(
            summary = "Create a new mobile scanner session",
            description = "Desktop clients call this when generating a QR code")
    @ApiResponse(
            responseCode = "200",
            description = "Session created successfully",
            content = @Content(schema = @Schema(implementation = SessionInfoResponse.class)))
    @ApiResponse(responseCode = "400", description = "Invalid session ID")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public Response createSession(
            @Parameter(description = "Session ID for QR code", required = true) @PathParam("sessionId")
                    String sessionId) {

        Response featureCheck = checkFeatureEnabled();
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

            return Response.ok(response).build();

        } catch (IllegalArgumentException e) {
            log.warn("Invalid session creation request: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        }
    }

    /**
     * Validate if a session exists and is not expired
     *
     * @param sessionId Session identifier to validate
     * @return Session information if valid, error if invalid/expired
     */
    @GET
    @jakarta.ws.rs.Path("/validate-session/{sessionId}")
    @Operation(
            summary = "Validate a mobile scanner session",
            description = "Check if session exists and is not expired")
    @ApiResponse(
            responseCode = "200",
            description = "Session is valid",
            content = @Content(schema = @Schema(implementation = SessionInfoResponse.class)))
    @ApiResponse(responseCode = "404", description = "Session not found or expired")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public Response validateSession(
            @Parameter(description = "Session ID to validate", required = true) @PathParam("sessionId")
                    String sessionId) {

        Response featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        MobileScannerService.SessionInfo sessionInfo =
                mobileScannerService.validateSession(sessionId);

        if (sessionInfo == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("valid", false, "error", "Session not found or expired"))
                    .build();
        }

        Map<String, Object> response = new HashMap<>();
        response.put("valid", true);
        response.put("sessionId", sessionInfo.getSessionId());
        response.put("createdAt", sessionInfo.getCreatedAt());
        response.put("expiresAt", sessionInfo.getExpiresAt());
        response.put("timeoutMs", sessionInfo.getTimeoutMs());

        return Response.ok(response).build();
    }

    /**
     * Upload files from mobile device
     *
     * @param sessionId Unique session identifier from QR code
     * @param fileUploads Files to upload
     * @return Upload status
     */
    @POST
    @jakarta.ws.rs.Path("/upload/{sessionId}")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Upload scanned files from mobile device",
            description = "Mobile devices upload scanned images to a temporary session")
    @ApiResponse(
            responseCode = "200",
            description = "Files uploaded successfully",
            content = @Content(schema = @Schema(implementation = UploadResponse.class)))
    @ApiResponse(responseCode = "400", description = "Invalid session ID or files")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    @ApiResponse(responseCode = "500", description = "Upload failed")
    public Response uploadFiles(
            @Parameter(description = "Session ID from QR code", required = true) @PathParam("sessionId")
                    String sessionId,
            @Parameter(description = "Files to upload", required = true) @RestForm("files")
                    List<FileUpload> fileUploads) {

        Response featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        try {
            if (fileUploads == null || fileUploads.isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "No files provided"))
                        .build();
            }

            List<MultipartFile> files = new ArrayList<>();
            for (FileUpload upload : fileUploads) {
                files.add(FileUploadMultipartFile.of(upload));
            }

            mobileScannerService.uploadFiles(sessionId, files);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("sessionId", sessionId);
            response.put("filesUploaded", files.size());
            response.put("message", "Files uploaded successfully");

            log.info("Mobile scanner upload: session={}, files={}", sessionId, files.size());
            return Response.ok(response).build();

        } catch (IllegalArgumentException e) {
            log.warn("Invalid mobile scanner upload request: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (IOException e) {
            log.error("Failed to upload files for session: {}", sessionId, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to save files"))
                    .build();
        }
    }

    /**
     * Get list of uploaded files for a session
     *
     * @param sessionId Session identifier
     * @return List of file metadata
     */
    @GET
    @jakarta.ws.rs.Path("/files/{sessionId}")
    @Operation(
            summary = "Get uploaded files for a session",
            description = "Desktop clients poll this endpoint to check for new uploads")
    @ApiResponse(
            responseCode = "200",
            description = "File list retrieved",
            content = @Content(schema = @Schema(implementation = FileListResponse.class)))
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public Response getSessionFiles(
            @Parameter(description = "Session ID", required = true) @PathParam("sessionId")
                    String sessionId) {

        Response featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        List<FileMetadata> files = mobileScannerService.getSessionFiles(sessionId);

        Map<String, Object> response = new HashMap<>();
        response.put("sessionId", sessionId);
        response.put("files", files);
        response.put("count", files.size());

        return Response.ok(response).build();
    }

    /**
     * Download a specific file from a session
     *
     * @param sessionId Session identifier
     * @param filename Filename to download
     * @return File content
     */
    @GET
    @jakarta.ws.rs.Path("/download/{sessionId}/{filename}")
    @Operation(
            summary = "Download a specific file",
            description =
                    "Download a file that was uploaded to a session. File is automatically deleted after download.")
    @ApiResponse(responseCode = "200", description = "File downloaded successfully")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    @ApiResponse(responseCode = "404", description = "File or session not found")
    public Response downloadFile(
            @Parameter(description = "Session ID", required = true) @PathParam("sessionId")
                    String sessionId,
            @Parameter(description = "Filename to download", required = true) @PathParam("filename")
                    String filename) {

        if (!applicationProperties.getSystem().isEnableMobileScanner()) {
            return Response.status(Response.Status.FORBIDDEN).build();
        }

        try {
            Path filePath = mobileScannerService.getFile(sessionId, filename);

            // Read file into memory first, so we can delete it before sending
            byte[] fileBytes = Files.readAllBytes(filePath);

            String contentType = Files.probeContentType(filePath);
            if (contentType == null) {
                contentType = MediaType.APPLICATION_OCTET_STREAM;
            }

            // Delete file immediately after reading into memory (server-side cleanup)
            mobileScannerService.deleteFileAfterDownload(sessionId, filename);

            // Serve from memory
            return Response.ok(fileBytes)
                    .type(MediaType.valueOf(contentType))
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + filename + "\"")
                    .build();

        } catch (IOException e) {
            log.warn("File not found: session={}, file={}", sessionId, filename);
            return Response.status(Response.Status.NOT_FOUND).build();
        }
    }

    /**
     * Delete a session and all its files
     *
     * @param sessionId Session to delete
     * @return Deletion status
     */
    @DELETE
    @jakarta.ws.rs.Path("/session/{sessionId}")
    @Operation(
            summary = "Delete a session",
            description = "Manually delete a session and all its uploaded files")
    @ApiResponse(responseCode = "200", description = "Session deleted successfully")
    @ApiResponse(responseCode = "403", description = "Mobile scanner feature not enabled")
    public Response deleteSession(
            @Parameter(description = "Session ID to delete", required = true) @PathParam("sessionId")
                    String sessionId) {

        Response featureCheck = checkFeatureEnabled();
        if (featureCheck != null) {
            return featureCheck;
        }

        mobileScannerService.deleteSession(sessionId);

        return Response.ok(
                        Map.of("success", true, "sessionId", sessionId, "message", "Session deleted"))
                .build();
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
