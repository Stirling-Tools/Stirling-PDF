package stirling.software.proprietary.security.controller.api.enterprise;

import java.util.List;

import org.apache.commons.lang3.tuple.Pair;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.database.H2SQLCondition;
import stirling.software.proprietary.security.service.DatabaseService;

@Slf4j
@Controller
@RequestMapping("/api/v1/database")
@PreAuthorize("hasRole('ROLE_ADMIN')")
@EnterpriseEndpoint
@Conditional(H2SQLCondition.class)
@Tag(name = "Database", description = "Database APIs for backup, import, and management")
@RequiredArgsConstructor
public class DatabaseControllerEnterprise {

    private final DatabaseService databaseService;

    @Operation(
            summary = "Delete the last database backup file",
            description =
                    "Only Enterprise - Deletes the last database backup file from the server.")
    @DeleteMapping("/deleteLast")
    public ResponseEntity<?> deleteLastFile() {
        log.info("Deleting last database backup file...");
        List<Pair<FileInfo, Boolean>> results = databaseService.deleteLastBackup();
        return getDeleteAllResults(results);
    }

    @Operation(
            summary = "Delete all database backup files",
            description = "Only Enterprise - Deletes all database backup files from the server.")
    @DeleteMapping("/deleteAll")
    public ResponseEntity<?> deleteAllFiles() {
        log.info("Deleting all database backup files...");
        List<Pair<FileInfo, Boolean>> results = databaseService.deleteAllBackups();
        return getDeleteAllResults(results);
    }

    private ResponseEntity<?> getDeleteAllResults(List<Pair<FileInfo, Boolean>> results) {
        if (results.isEmpty()) {
            log.info("No backup files found to delete.");
            return ResponseEntity.ok(new DeleteAllResult(List.of(), List.of(), "noContent"));
        }

        List<String> deleted =
                results.stream()
                        .filter(p -> Boolean.TRUE.equals(p.getRight()))
                        .map(p -> p.getLeft().getFileName())
                        .toList();

        List<String> failed =
                results.stream()
                        .filter(p -> !Boolean.TRUE.equals(p.getRight()))
                        .map(p -> p.getLeft().getFileName())
                        .toList();

        log.info("Deleted backup files: {}", deleted);
        if (!failed.isEmpty()) {
            log.warn("Some backup files could not be deleted: {}", failed);
            return ResponseEntity.status(HttpStatus.MULTI_STATUS) // 207
                    .body(new DeleteAllResult(deleted, failed, "partialFailure"));
        }
        DeleteAllResult result = new DeleteAllResult(deleted, failed, "ok");
        log.debug(
                "DeleteAllResult: deleted={}, failed={}, status={}",
                result.deleted,
                result.failed,
                result.status);
        return ResponseEntity.ok(result); // 200
    }

    private static final class DeleteAllResult {
        public final List<String> deleted;
        public final List<String> failed;
        public final String status;

        public DeleteAllResult(List<String> deleted, List<String> failed, String status) {
            this.deleted = deleted;
            this.failed = failed;
            this.status = status;
        }
    }
}
