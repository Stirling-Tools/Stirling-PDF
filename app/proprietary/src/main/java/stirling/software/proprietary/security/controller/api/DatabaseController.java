package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.DatabaseApi;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.proprietary.security.service.DatabaseService;

@Slf4j
@ApplicationScoped
@DatabaseApi
// DatabaseApi carries only @Tag; JAX-RS does not inherit @Path from meta-annotations, so the base
// path must be declared explicitly here.
@jakarta.ws.rs.Path("/api/v1/database")
@RolesAllowed("ADMIN")
// TODO: Migration required - @Conditional(H2SQLCondition.class) gated this controller on the
// datasource being H2 (driver/url inspection of the Spring Environment). Quarkus has no
// @Conditional equivalent; this must be re-expressed either as a build-time @IfBuildProfile, a
// runtime @LookupIfProperty on a datasource property, or a runtime guard inside DatabaseService
// that no-ops/returns 404 when the active datasource is not H2.
@RequiredArgsConstructor
public class DatabaseController {

    private final DatabaseService databaseService;

    @Operation(
            summary = "Import a database backup file",
            description = "Uploads and imports a database backup SQL file.")
    @POST
    @jakarta.ws.rs.Path("import-database")
    @jakarta.ws.rs.Consumes(MediaType.MULTIPART_FORM_DATA)
    public Response importDatabase(
            @Parameter(description = "SQL file to import", required = true) @RestForm("fileInput")
                    FileUpload fileInput)
            throws IOException {
        stirling.software.common.model.MultipartFile file =
                fileInput == null ? null : FileUploadMultipartFile.of(fileInput);
        if (file == null || file.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "fileNullOrEmpty",
                                    "message",
                                    "File is null or empty"))
                    .build();
        }
        log.info("Received file: {}", file.getOriginalFilename());
        java.nio.file.Path tempTemplatePath = Files.createTempFile("backup_", ".sql");
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, tempTemplatePath, StandardCopyOption.REPLACE_EXISTING);
            boolean importSuccess = databaseService.importDatabaseFromUI(tempTemplatePath);
            if (importSuccess) {
                return Response.ok(
                                java.util.Map.of(
                                        "message",
                                        "importIntoDatabaseSuccessed",
                                        "description",
                                        "Database imported successfully"))
                        .build();
            } else {
                return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                        .entity(
                                java.util.Map.of(
                                        "error",
                                        "failedImportFile",
                                        "message",
                                        "Failed to import database file"))
                        .build();
            }
        } catch (Exception e) {
            log.error("Error importing database: {}", e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "failedImportFile",
                                    "message",
                                    "Failed to import database: " + e.getMessage()))
                    .build();
        }
    }

    @Hidden
    @Operation(
            summary = "Import database backup by filename",
            description = "Imports a database backup file from the server using its file name.")
    @GET
    @jakarta.ws.rs.Path("/import-database-file/{fileName}")
    public Response importDatabaseFromBackupUI(
            @Parameter(description = "Name of the file to import", required = true) @PathParam("fileName")
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "fileNullOrEmpty",
                                    "message",
                                    "File name is null or empty"))
                    .build();
        }
        // Check if the file exists in the backup list
        boolean fileExists =
                databaseService.getBackupList().stream()
                        .anyMatch(backup -> backup.getFileName().equals(fileName));
        if (!fileExists) {
            log.error("File {} not found in backup list", fileName);
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "fileNotFound",
                                    "message",
                                    "File not found in backup list"))
                    .build();
        }
        log.info("Received file: {}", fileName);
        if (databaseService.importDatabaseFromUI(fileName)) {
            log.info("File {} imported to database", fileName);
            return Response.ok(
                            java.util.Map.of(
                                    "message",
                                    "importIntoDatabaseSuccessed",
                                    "description",
                                    "Database backup imported successfully"))
                    .build();
        }
        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(
                        java.util.Map.of(
                                "error",
                                "failedImportFile",
                                "message",
                                "Failed to import database file"))
                .build();
    }

    @Hidden
    @Operation(
            summary = "Delete a database backup file",
            description = "Deletes a specified database backup file from the server.")
    @GET
    @jakarta.ws.rs.Path("/delete/{fileName}")
    public Response deleteFile(
            @Parameter(description = "Name of the file to delete", required = true) @PathParam("fileName")
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "invalidFileName",
                                    "message",
                                    "File must not be null or empty"))
                    .build();
        }
        try {
            if (databaseService.deleteBackupFile(fileName)) {
                log.info("Deleted file: {}", fileName);
                return Response.ok(java.util.Map.of("message", "File deleted successfully")).build();
            } else {
                log.error("Failed to delete file: {}", fileName);
                return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                        .entity(
                                java.util.Map.of(
                                        "error",
                                        "failedToDeleteFile",
                                        "message",
                                        "Failed to delete backup file"))
                        .build();
            }
        } catch (IOException e) {
            log.error("Error deleting file: {}", e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "deleteError",
                                    "message",
                                    "Error deleting file: " + e.getMessage()))
                    .build();
        }
    }

    @Hidden
    @Operation(
            summary = "Download a database backup file",
            description = "Downloads the specified database backup file from the server.")
    @GET
    @jakarta.ws.rs.Path("/download/{fileName}")
    public Response downloadFile(
            @Parameter(description = "Name of the file to download", required = true) @PathParam("fileName")
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            throw new IllegalArgumentException("File must not be null or empty");
        }

        // Validate that file is a legitimate backup file
        // Only allow files matching the backup naming pattern
        if (!fileName.startsWith("backup_") || !fileName.endsWith(".sql")) {
            log.warn("Attempted download of non-backup file: {}", fileName);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "invalidFileName",
                                    "message",
                                    "Only backup files are allowed"))
                    .build();
        }

        try {
            java.nio.file.Path filePath = databaseService.getBackupFilePath(fileName);
            long contentLength = Files.size(filePath);
            StreamingOutput stream =
                    output -> {
                        try (InputStream in = Files.newInputStream(filePath)) {
                            in.transferTo(output);
                        }
                    };
            return Response.ok(stream)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment;filename=" + fileName)
                    .type(MediaType.APPLICATION_OCTET_STREAM)
                    .header(HttpHeaders.CONTENT_LENGTH, contentLength)
                    .build();
        } catch (IOException e) {
            log.error("Error downloading file: {}", e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(
                            java.util.Map.of(
                                    "error",
                                    "downloadFailed",
                                    "message",
                                    "Failed to download file: " + e.getMessage()))
                    .build();
        }
    }

    @Operation(
            summary = "Create a database backup",
            description = "This endpoint triggers the creation of a database backup.")
    @GET
    @jakarta.ws.rs.Path("/createDatabaseBackup")
    public Response createDatabaseBackup() {
        log.info("Starting database backup creation...");
        databaseService.exportDatabase();
        log.info("Database backup successfully created.");
        return Response.ok(
                        java.util.Map.of(
                                "message",
                                "backupCreated",
                                "description",
                                "Database backup created successfully"))
                .build();
    }
}
