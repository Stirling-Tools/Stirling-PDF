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
import java.util.regex.Pattern;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.core.Response;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/ui-data")
@RequiredArgsConstructor
@Tag(name = "UI Data")
public class UIDataTessdataController {

    private static final Pattern INVALID_LANG_CHARS_PATTERN = Pattern.compile("[^A-Za-z0-9_+\\-]");
    private final RuntimePathConfig runtimePathConfig;
    private final ObjectMapper objectMapper;
    private static volatile List<String> cachedRemoteTessdata = null;
    private static volatile long cachedRemoteTessdataExpiry = 0L;
    private static final long REMOTE_TESSDATA_TTL_MS = 10 * 60 * 1000; // 10 minutes

    @GET
    @jakarta.ws.rs.Path("/tessdata-languages")
    @RolesAllowed("ADMIN")
    @Operation(summary = "List installed and remotely available tessdata languages")
    public Response getTessdataLanguages() {
        TessdataLanguagesResponse response = new TessdataLanguagesResponse();
        response.setInstalled(getAvailableTesseractLanguages());
        response.setAvailable(getRemoteTessdataLanguages());
        response.setWritable(isWritableDirectory(Paths.get(runtimePathConfig.getTessDataPath())));
        return Response.ok(response).build();
    }

    @POST
    @jakarta.ws.rs.Path("/tessdata/download")
    @RolesAllowed("ADMIN")
    @Operation(summary = "Download selected tessdata languages from the official repository")
    public Response downloadTessdataLanguages(TessdataDownloadRequest request) {
        if (request.getLanguages() == null || request.getLanguages().isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("message", "No languages provided for download"))
                    .build();
        }

        Path tessdataDir = Paths.get(runtimePathConfig.getTessDataPath());
        try {
            Files.createDirectories(tessdataDir);
        } catch (IOException e) {
            log.error("Failed to create tessdata directory {}", tessdataDir, e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("message", "Failed to prepare tessdata directory"))
                    .build();
        }

        if (!isWritableDirectory(tessdataDir)) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(Map.of("message", tessdataDir.toString()))
                    .build();
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
            String safeLang = INVALID_LANG_CHARS_PATTERN.matcher(language).replaceAll("");
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
            return Response.ok(response).build();
        } else if (!downloaded.isEmpty()) {
            return Response.status(207).entity(response).build(); // Multi-Status for partial success
        } else {
            return Response.status(Response.Status.BAD_GATEWAY).entity(response).build();
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
                List<Map<String, Object>> items =
                        objectMapper.readValue(
                                is, new TypeReference<List<Map<String, Object>>>() {});
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
