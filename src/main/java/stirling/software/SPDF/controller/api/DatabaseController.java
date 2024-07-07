package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import org.eclipse.jetty.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.security.database.DatabaseBackupHelper;

@Slf4j
@Controller
@RequestMapping("/api/v1/database")
@PreAuthorize("hasRole('ROLE_ADMIN')")
@Tag(name = "Database", description = "Database APIs")
public class DatabaseController {

    @Autowired DatabaseBackupHelper databaseBackupHelper;

    @Hidden
    @PostMapping(consumes = "multipart/form-data", value = "import-database")
    @Operation(
            summary = "Import database backup",
            description = "This endpoint imports a database backup from a SQL file.")
    public String importDatabase(
            @RequestParam("fileInput") MultipartFile file, RedirectAttributes redirectAttributes)
            throws IllegalArgumentException, IOException {
        if (file == null || file.isEmpty()) {
            redirectAttributes.addAttribute("error", "fileNullOrEmpty");
            return "redirect:/database";
        }
        log.info("Received file: {}", file.getOriginalFilename());
        Path tempTemplatePath = Files.createTempFile("backup_", ".sql");
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, tempTemplatePath, StandardCopyOption.REPLACE_EXISTING);
            boolean importSuccess = databaseBackupHelper.importDatabaseFromUI(tempTemplatePath);
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
    @GetMapping("/import-database-file/{fileName}")
    public String importDatabaseFromBackupUI(@PathVariable String fileName)
            throws IllegalArgumentException, IOException {
        if (fileName == null || fileName.isEmpty()) {
            return "redirect:/database?error=fileNullOrEmpty";
        }

        // Check if the file exists in the backup list
        boolean fileExists =
                databaseBackupHelper.getBackupList().stream()
                        .anyMatch(backup -> backup.getFileName().equals(fileName));
        if (!fileExists) {
            log.error("File {} not found in backup list", fileName);
            return "redirect:/database?error=fileNotFound";
        }
        log.info("Received file: {}", fileName);
        if (databaseBackupHelper.importDatabaseFromUI(fileName)) {
            log.info("File {} imported to database", fileName);
            return "redirect:/database?infoMessage=importIntoDatabaseSuccessed";
        }
        return "redirect:/database?error=failedImportFile";
    }

    @Hidden
    @GetMapping("/delete/{fileName}")
    @Operation(
            summary = "Delete a database backup file",
            description =
                    "This endpoint deletes a database backup file with the specified file name.")
    public String deleteFile(@PathVariable String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            throw new IllegalArgumentException("File must not be null or empty");
        }
        try {
            if (databaseBackupHelper.deleteBackupFile(fileName)) {
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
    @GetMapping("/download/{fileName}")
    @Operation(
            summary = "Download a database backup file",
            description =
                    "This endpoint downloads a database backup file with the specified file name.")
    public ResponseEntity<?> downloadFile(@PathVariable String fileName) {
        if (fileName == null || fileName.isEmpty()) {
            throw new IllegalArgumentException("File must not be null or empty");
        }
        try {
            Path filePath = databaseBackupHelper.getBackupFilePath(fileName);
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
}
