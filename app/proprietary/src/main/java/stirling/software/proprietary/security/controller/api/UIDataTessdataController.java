package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;

@Slf4j
@RestController
@RequestMapping("/api/v1/ui-data")
@RequiredArgsConstructor
public class UIDataTessdataController {

    private final RuntimePathConfig runtimePathConfig;

    @PostMapping("/tessdata/download")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @Operation(summary = "Download selected tessdata languages from the official repository")
    public ResponseEntity<Map<String, Object>> downloadTessdataLanguages(
            @RequestBody TessdataDownloadRequest request) {
        if (request.getLanguages() == null || request.getLanguages().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "No languages provided for download"));
        }

        Path tessdataDir = Paths.get(runtimePathConfig.getTessDataPath());
        try {
            Files.createDirectories(tessdataDir);
        } catch (IOException e) {
            log.error("Failed to create tessdata directory {}", tessdataDir, e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("message", "Failed to prepare tessdata directory"));
        }

        if (!isWritableDirectory(tessdataDir)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", tessdataDir.toString()));
        }

        List<String> downloaded = new ArrayList<>();
        List<String> failed = new ArrayList<>();

        for (String language : request.getLanguages()) {
            if (language == null || language.isBlank()) {
                failed.add(language);
                continue;
            }
            String safeLang = language.replaceAll("[^A-Za-z0-9_+\\-]", "");
            if (!safeLang.equals(language)) {
                failed.add(language);
                continue;
            }

            String downloadUrl =
                    "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/"
                            + safeLang
                            + ".traineddata";
            Path targetFile = tessdataDir.resolve(safeLang + ".traineddata");
            try (InputStream is = new URL(downloadUrl).openStream()) {
                Files.copy(is, targetFile, StandardCopyOption.REPLACE_EXISTING);
                downloaded.add(safeLang);
                log.info("Downloaded tessdata language {} to {}", safeLang, targetFile);
            } catch (IOException e) {
                log.warn(
                        "Failed to download tessdata language {} from {}",
                        safeLang,
                        downloadUrl,
                        e);
                failed.add(language);
            }
        }

        Map<String, Object> response =
                Map.of(
                        "downloaded", downloaded,
                        "failed", failed,
                        "tessdataDir", tessdataDir.toString());
        return ResponseEntity.ok(response);
    }

    private boolean isWritableDirectory(Path dir) {
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            log.warn("Tessdata directory cannot be created: {}", dir, e);
            return false;
        }

        if (!Files.isWritable(dir)) {
            log.warn("Tessdata directory not writable (ACL check failed): {}", dir);
            return false;
        }

        try {
            Path probe = Files.createTempFile(dir, "tessdata-write-test", ".tmp");
            Files.deleteIfExists(probe);
            return true;
        } catch (IOException e) {
            log.warn("Tessdata directory not writable (temp file creation failed): {}", dir);
            return false;
        }
    }

    @Data
    private static class TessdataDownloadRequest {
        private List<String> languages;
    }
}
