package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import io.swagger.v3.oas.annotations.Operation;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.PipelineApi;
import stirling.software.common.configuration.RuntimePathConfig;

import tools.jackson.databind.ObjectMapper;

@Slf4j
@PipelineApi
public class PipelineConfigController {

    private final RuntimePathConfig runtimePathConfig;
    private final ObjectMapper objectMapper;

    public PipelineConfigController(
            RuntimePathConfig runtimePathConfig, ObjectMapper objectMapper) {
        this.runtimePathConfig = runtimePathConfig;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/watched-folders/config")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary =
                    "Save a folder-scanning pipeline config into pipeline/watchedFolders (optionally in a subfolder)")
    public ResponseEntity<?> saveConfigToWatchedFolder(
            @RequestBody SaveWatchedFolderConfigRequest request) {
        try {
            if (request == null || request.getConfig() == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Missing request body or config payload"));
            }

            Path watchedRoot =
                    Paths.get(runtimePathConfig.getPipelineWatchedFoldersPath())
                            .toAbsolutePath()
                            .normalize();

            String subfolder = request.getSubfolder() == null ? "" : request.getSubfolder().trim();
            Path targetDir =
                    subfolder.isEmpty()
                            ? watchedRoot
                            : watchedRoot.resolve(subfolder).toAbsolutePath().normalize();

            if (!targetDir.startsWith(watchedRoot)) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid subfolder path"));
            }

            Files.createDirectories(targetDir);

            String safeFileName = sanitizeFileName(request.getFileName());
            Path targetFile = targetDir.resolve(safeFileName).toAbsolutePath().normalize();

            if (!targetFile.startsWith(watchedRoot)) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid target file path"));
            }

            String json =
                    objectMapper
                            .writerWithDefaultPrettyPrinter()
                            .writeValueAsString(request.getConfig());
            Files.writeString(targetFile, json, StandardCharsets.UTF_8);

            return ResponseEntity.ok(
                    Map.of(
                            "success",
                            true,
                            "savedPath",
                            targetFile.toString(),
                            "fileName",
                            safeFileName));
        } catch (IOException e) {
            log.error("Failed to write pipeline config to watched folder", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to write config file"));
        }
    }

    private String sanitizeFileName(String fileName) {
        String base =
                fileName == null || fileName.isBlank()
                        ? "automation.folder-scan.json"
                        : fileName.trim();
        String sanitized = base.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!sanitized.toLowerCase().endsWith(".json")) {
            sanitized = sanitized + ".json";
        }
        if (sanitized.length() > 200) {
            sanitized = sanitized.substring(0, 200);
            if (!sanitized.toLowerCase().endsWith(".json")) {
                sanitized = sanitized + ".json";
            }
        }
        return sanitized;
    }

    @Data
    public static class SaveWatchedFolderConfigRequest {
        private String subfolder;
        private String fileName;
        private Object config;
    }
}
