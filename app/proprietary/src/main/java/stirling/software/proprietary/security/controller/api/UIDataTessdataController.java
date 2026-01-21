package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    private static volatile List<String> cachedRemoteTessdata = null;
    private static volatile long cachedRemoteTessdataExpiry = 0L;
    private static final long REMOTE_TESSDATA_TTL_MS = 10 * 60 * 1000; // 10 minutes

    @GetMapping("/tessdata-languages")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @Operation(summary = "List installed and remotely available tessdata languages")
    public ResponseEntity<TessdataLanguagesResponse> getTessdataLanguages() {
        TessdataLanguagesResponse response = new TessdataLanguagesResponse();
        response.setInstalled(getAvailableTesseractLanguages());
        response.setAvailable(getRemoteTessdataLanguages());
        response.setWritable(isWritableDirectory(Paths.get(runtimePathConfig.getTessDataPath())));
        return ResponseEntity.ok(response);
    }

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

        List<String> remoteLanguages = getRemoteTessdataLanguages();
        Set<String> remoteSet =
                remoteLanguages == null ? Collections.emptySet() : new HashSet<>(remoteLanguages);

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

            if (!remoteSet.isEmpty() && !remoteSet.contains(safeLang)) {
                log.warn("Requested tessdata language {} not available in upstream list", safeLang);
                failed.add(language);
                continue;
            }

            String downloadUrl =
                    "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/"
                            + safeLang
                            + ".traineddata";
            Path baseRealPath;
            try {
                baseRealPath = tessdataDir.toRealPath();
            } catch (IOException e) {
                log.warn("Failed to resolve tessdata directory {}", tessdataDir, e);
                failed.add(language);
                continue;
            }

            Path targetFile = baseRealPath.resolve(safeLang + ".traineddata").normalize();
            if (!targetFile.startsWith(baseRealPath)) {
                log.warn("Blocked tessdata download path traversal attempt for {}", language);
                failed.add(language);
                continue;
            }

            if (downloadLanguageFile(safeLang, targetFile, downloadUrl)) {
                downloaded.add(safeLang);
            } else {
                failed.add(language);
            }
        }

        Map<String, Object> response =
                Map.of(
                        "downloaded", downloaded,
                        "failed", failed,
                        "tessdataDir", tessdataDir.toString());

        if (!downloaded.isEmpty() && failed.isEmpty()) {
            return ResponseEntity.ok(response);
        } else if (!downloaded.isEmpty()) {
            return ResponseEntity.status(207).body(response); // Multi-Status for partial success
        } else {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(response);
        }
    }

    /** Download the language file, returning true on success. Extracted for testability. */
    protected boolean downloadLanguageFile(String safeLang, Path targetFile, String downloadUrl) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(downloadUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", "Stirling-PDF-App");
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(30000);

            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                log.warn(
                        "Tessdata language {} not downloadable. HTTP {} from {}",
                        safeLang,
                        status,
                        downloadUrl);
                return false;
            }

            try (InputStream is = connection.getInputStream()) {
                Files.copy(is, targetFile, StandardCopyOption.REPLACE_EXISTING);
                log.info("Downloaded tessdata language {} to {}", safeLang, targetFile);
                return true;
            }
        } catch (IOException e) {
            log.warn("Failed to download tessdata language {} from {}", safeLang, downloadUrl, e);
            return false;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    /** Fetch list of available remote tessdata languages (with simple caching). */
    protected List<String> getRemoteTessdataLanguages() {
        long now = System.currentTimeMillis();
        List<String> localCache;
        long localExpiry;
        synchronized (UIDataTessdataController.class) {
            localCache = cachedRemoteTessdata;
            localExpiry = cachedRemoteTessdataExpiry;
        }
        if (localCache != null && now < localExpiry) {
            return localCache;
        }

        String apiUrl = "https://api.github.com/repos/tesseract-ocr/tessdata/contents";
        HttpURLConnection connection = null;
        try {
            URL url = new URL(apiUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", "Stirling-PDF-App");
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(30000);

            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                String remaining = connection.getHeaderField("X-RateLimit-Remaining");
                String reset = connection.getHeaderField("X-RateLimit-Reset");
                if (status == HttpURLConnection.HTTP_FORBIDDEN && remaining != null) {
                    log.warn(
                            "GitHub tessdata listing rate limited. Remaining={}, resetEpochSeconds={}",
                            remaining,
                            reset);
                } else {
                    log.warn("GitHub tessdata listing returned HTTP {}", status);
                }
                return cachedRemoteTessdata != null
                        ? cachedRemoteTessdata
                        : Collections.emptyList();
            }

            try (InputStream is = connection.getInputStream()) {
                ObjectMapper mapper = new ObjectMapper();
                List<Map<String, Object>> items =
                        mapper.readValue(is, new TypeReference<List<Map<String, Object>>>() {});
                List<String> languages =
                        items.stream()
                                .map(item -> (String) item.get("name"))
                                .filter(Objects::nonNull)
                                .filter(name -> name.endsWith(".traineddata"))
                                .map(name -> name.replace(".traineddata", ""))
                                .filter(lang -> !"osd".equalsIgnoreCase(lang))
                                .sorted()
                                .toList();

                synchronized (UIDataTessdataController.class) {
                    cachedRemoteTessdata = languages;
                    cachedRemoteTessdataExpiry =
                            System.currentTimeMillis() + REMOTE_TESSDATA_TTL_MS;
                }
                return languages;
            }
        } catch (IOException e) {
            log.warn("Failed to fetch tessdata languages from GitHub", e);
            return cachedRemoteTessdata != null ? cachedRemoteTessdata : Collections.emptyList();
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    @Data
    private static class TessdataDownloadRequest {
        private List<String> languages;
    }

    @Data
    private static class TessdataLanguagesResponse {
        private List<String> installed;
        private List<String> available;
        private boolean writable;
    }

    private List<String> getAvailableTesseractLanguages() {
        String tessdataDir = runtimePathConfig.getTessDataPath();
        java.io.File[] files = new java.io.File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .filter(file -> file.getName().endsWith(".traineddata"))
                .map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !"osd".equalsIgnoreCase(lang))
                .sorted()
                .toList();
    }

    protected boolean isWritableDirectory(Path dir) {
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
}
