package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import org.springframework.context.annotation.Conditional;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.DatabaseApi;
import stirling.software.proprietary.security.database.H2SQLCondition;
import stirling.software.proprietary.security.service.DatabaseService;

@Slf4j
@DatabaseApi
@PreAuthorize("hasRole('ROLE_ADMIN')")
@Conditional(H2SQLCondition.class)
@RequiredArgsConstructor
public class DatabaseController {

    private final DatabaseService databaseService;

    @Operation(
            summary = "Import a database backup file",
            description = "Uploads and imports a database backup SQL file.")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "import-database")
    public ResponseEntity<?> importDatabase(
            @Parameter(description = "SQL file to import", required = true)
                    @RequestParam("fileInput")
                    MultipartFile file)
            throws IOException {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "fileNullOrEmpty",
                                    "message",
                                    "File is null or empty"));
        }
        log.info("Received file: {}", file.getOriginalFilename());
        Path tempTemplatePath = Files.createTempFile("backup_", ".sql");
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, tempTemplatePath, StandardCopyOption.REPLACE_EXISTING);
            boolean importSuccess = databaseService.importDatabaseFromUI(tempTemplatePath);
            if (importSuccess) {
                return ResponseEntity.ok(
                        java.util.Map.of(
                                "message",
                                "importIntoDatabaseSuccessed",
                                "description",
                                "Database imported successfully"));
            } else {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(
                                java.util.Map.of(
                                        "error",
                                        "failedImportFile",
                                        "message",
                                        "Failed to import database file"));
            }
        } catch (Exception e) {
            log.error("Error importing database: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "failedImportFile",
                                    "message",
                                    "Failed to import database: " + e.getMessage()));
        }
    }

    @Hidden
    @Operation(
            summary = "Import database backup by filename",
            description = "Imports a database backup file from the server using its file name.")
    @GetMapping("/import-database-file/{fileName}")
    public ResponseEntity<?> importDatabaseFromBackupUI(
            @Parameter(description = "Name of the file to import", required = true) @PathVariable
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "fileNullOrEmpty",
                                    "message",
                                    "File name is null or empty"));
        }
        // Check if the file exists in the backup list
        boolean fileExists =
                databaseService.getBackupList().stream()
                        .anyMatch(backup -> backup.getFileName().equals(fileName));
        if (!fileExists) {
            log.error("File {} not found in backup list", fileName);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "fileNotFound",
                                    "message",
                                    "File not found in backup list"));
        }
        log.info("Received file: {}", fileName);
        if (databaseService.importDatabaseFromUI(fileName)) {
            log.info("File {} imported to database", fileName);
            return ResponseEntity.ok(
                    java.util.Map.of(
                            "message",
                            "importIntoDatabaseSuccessed",
                            "description",
                            "Database backup imported successfully"));
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(
                        java.util.Map.of(
                                "error",
                                "failedImportFile",
                                "message",
                                "Failed to import database file"));
    }

    @Hidden
    @Operation(
            summary = "Delete a database backup file",
            description = "Deletes a specified database backup file from the server.")
    @GetMapping("/delete/{fileName}")
    public ResponseEntity<?> deleteFile(
            @Parameter(description = "Name of the file to delete", required = true) @PathVariable
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "invalidFileName",
                                    "message",
                                    "File must not be null or empty"));
        }
        try {
            if (databaseService.deleteBackupFile(fileName)) {
                log.info("Deleted file: {}", fileName);
                return ResponseEntity.ok(java.util.Map.of("message", "File deleted successfully"));
            } else {
                log.error("Failed to delete file: {}", fileName);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(
                                java.util.Map.of(
                                        "error",
                                        "failedToDeleteFile",
                                        "message",
                                        "Failed to delete backup file"));
            }
        } catch (IOException e) {
            log.error("Error deleting file: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "deleteError",
                                    "message",
                                    "Error deleting file: " + e.getMessage()));
        }
    }

    @Hidden
    @Operation(
            summary = "Download a database backup file",
            description = "Downloads the specified database backup file from the server.")
    @GetMapping("/download/{fileName}")
    public ResponseEntity<?> downloadFile(
            @Parameter(description = "Name of the file to download", required = true) @PathVariable
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            throw new IllegalArgumentException("File must not be null or empty");
        }

        // Validate that file is a legitimate backup file
        // Only allow files matching the backup naming pattern
        if (!fileName.startsWith("backup_") || !fileName.endsWith(".sql")) {
            log.warn("Attempted download of non-backup file: {}", fileName);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "invalidFileName",
                                    "message",
                                    "Only backup files are allowed"));
        }

        try {
            Path filePath = databaseService.getBackupFilePath(fileName);
            InputStreamResource resource = new InputStreamResource(Files.newInputStream(filePath));
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment;filename=" + fileName)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(Files.size(filePath))
                    .body(resource);
        } catch (IOException e) {
            log.error("Error downloading file: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            java.util.Map.of(
                                    "error",
                                    "downloadFailed",
                                    "message",
                                    "Failed to download file: " + e.getMessage()));
        }
    }

    @Operation(
            summary = "Create a database backup",
            description = "This endpoint triggers the creation of a database backup.")
    @GetMapping("/createDatabaseBackup")
    public ResponseEntity<?> createDatabaseBackup() {
        log.info("Starting database backup creation...");
        databaseService.exportDatabase();
        log.info("Database backup successfully created.");
        return ResponseEntity.ok(
                java.util.Map.of(
                        "message",
                        "backupCreated",
                        "description",
                        "Database backup created successfully"));
    }
}
