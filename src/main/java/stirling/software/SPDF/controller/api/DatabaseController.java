package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import org.eclipse.jetty.http.HttpStatus;
import org.springframework.context.annotation.Conditional;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.security.database.DatabaseService;

@Slf4j
@Controller
@RequestMapping("/api/v1/database")
@PreAuthorize("hasRole('ROLE_ADMIN')")
@Conditional(H2SQLCondition.class)
@Tag(name = "Database", description = "Database APIs for backup, import, and management")
@RequiredArgsConstructor
public class DatabaseController {

    private final DatabaseService databaseService;

    @Operation(
            summary = "Import a database backup file",
            description = "Uploads and imports a database backup SQL file.")
    @PostMapping(consumes = "multipart/form-data", value = "import-database")
    public String importDatabase(
            @Parameter(description = "SQL file to import", required = true)
                    @RequestParam("fileInput")
                    MultipartFile file,
            RedirectAttributes redirectAttributes)
            throws IOException {
        if (file == null || file.isEmpty()) {
            redirectAttributes.addAttribute("error", "fileNullOrEmpty");
            return "redirect:/database";
        }
        log.info("Received file: {}", file.getOriginalFilename());
        Path tempTemplatePath = Files.createTempFile("backup_", ".sql");
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, tempTemplatePath, StandardCopyOption.REPLACE_EXISTING);
            boolean importSuccess = databaseService.importDatabaseFromUI(tempTemplatePath);
            if (importSuccess) {
                redirectAttributes.addAttribute("infoMessage", "importIntoDatabaseSuccessed");
            } else {
                redirectAttributes.addAttribute("error", "failedImportFile");
            }
        } catch (Exception e) {
            log.error("Error importing database: {}", e.getMessage());
            redirectAttributes.addAttribute("error", "failedImportFile");
        }
        return "redirect:/database";
    }

    @Hidden
    @Operation(
            summary = "Import database backup by filename",
            description = "Imports a database backup file from the server using its file name.")
    @GetMapping("/import-database-file/{fileName}")
    public String importDatabaseFromBackupUI(
            @Parameter(description = "Name of the file to import", required = true) @PathVariable
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            return "redirect:/database?error=fileNullOrEmpty";
        }
        // Check if the file exists in the backup list
        boolean fileExists =
                databaseService.getBackupList().stream()
                        .anyMatch(backup -> backup.getFileName().equals(fileName));
        if (!fileExists) {
            log.error("File {} not found in backup list", fileName);
            return "redirect:/database?error=fileNotFound";
        }
        log.info("Received file: {}", fileName);
        if (databaseService.importDatabaseFromUI(fileName)) {
            log.info("File {} imported to database", fileName);
            return "redirect:/database?infoMessage=importIntoDatabaseSuccessed";
        }
        return "redirect:/database?error=failedImportFile";
    }

    @Hidden
    @Operation(
            summary = "Delete a database backup file",
            description = "Deletes a specified database backup file from the server.")
    @GetMapping("/delete/{fileName}")
    public String deleteFile(
            @Parameter(description = "Name of the file to delete", required = true) @PathVariable
                    String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            throw new IllegalArgumentException("File must not be null or empty");
        }
        try {
            if (databaseService.deleteBackupFile(fileName)) {
                log.info("Deleted file: {}", fileName);
            } else {
                log.error("Failed to delete file: {}", fileName);
                return "redirect:/database?error=failedToDeleteFile";
            }
        } catch (IOException e) {
            log.error("Error deleting file: {}", e.getMessage());
            return "redirect:/database?error=" + e.getMessage();
        }
        return "redirect:/database";
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
            return ResponseEntity.status(HttpStatus.SEE_OTHER_303)
                    .location(URI.create("/database?error=downloadFailed"))
                    .build();
        }
    }

    @Operation(
            summary = "Create a database backup",
            description =
                    "This endpoint triggers the creation of a database backup and redirects to the"
                            + " database management page.")
    @GetMapping("/createDatabaseBackup")
    public String createDatabaseBackup() {
        log.info("Starting database backup creation...");
        databaseService.exportDatabase();
        log.info("Database backup successfully created.");
        return "redirect:/database?infoMessage=backupCreated";
    }
}
