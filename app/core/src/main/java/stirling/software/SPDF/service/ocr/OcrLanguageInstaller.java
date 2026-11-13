package stirling.software.SPDF.service.ocr;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;

import org.apache.commons.io.FileUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;

import tools.jackson.databind.ObjectMapper;

/**
 * Adds OCR languages to the tessdata folder of the desktop app. A language is copied from a
 * Tesseract the user already installed when one is found (no download, but only once Tesseract has
 * proved it can load it), otherwise downloaded from a pinned tessdata_fast commit. URLs and
 * SHA-256s come only from the bundled catalogue, never from the request. Installing is desktop-only
 * because core has no admin check; servers manage tessdata through their volume, as documented.
 */
@Slf4j
@Service
public class OcrLanguageInstaller {

    static final String CATALOG_RESOURCE = "ocr/tessdata-fast-catalog.json";
    private static final String ALLOWED_URL_PREFIX =
            "https://raw.githubusercontent.com/tesseract-ocr/";
    private static final Pattern CODE = Pattern.compile("[a-z][a-z0-9_]{1,31}");

    /** The largest catalogue file is about 12 MB; this allows for a slow connection. */
    private static final Duration DOWNLOAD_TIMEOUT = Duration.ofMinutes(10);

    /** Where an installable language would come from. */
    public enum Source {
        DOWNLOAD,
        SYSTEM
    }

    public record Installable(String code, long sizeBytes, Source source) {}

    /** Installed languages plus what the user could add here. */
    public record Languages(
            List<String> installed, List<Installable> installable, boolean canInstall) {}

    record CatalogEntry(String code, long sizeBytes, String sha256) {}

    record Catalog(String source, String commit, String baseUrl, List<CatalogEntry> languages) {}

    private final RuntimePathConfig runtimePathConfig;
    private final NativeTesseractService nativeTesseract;
    private final Catalog catalog;
    private final HttpClient http;
    private final List<Path> systemDirs;
    private final String allowedUrlPrefix;
    private final Duration downloadTimeout;

    @Autowired
    public OcrLanguageInstaller(
            RuntimePathConfig runtimePathConfig,
            NativeTesseractService nativeTesseract,
            ObjectMapper objectMapper)
            throws IOException {
        this(
                runtimePathConfig,
                nativeTesseract,
                loadCatalog(objectMapper),
                systemTessdataDirs(System.getenv(), System.getProperty("os.name", "")),
                ALLOWED_URL_PREFIX,
                DOWNLOAD_TIMEOUT);
    }

    OcrLanguageInstaller(
            RuntimePathConfig runtimePathConfig,
            NativeTesseractService nativeTesseract,
            Catalog catalog,
            List<Path> systemDirs,
            String allowedUrlPrefix,
            Duration downloadTimeout) {
        this.runtimePathConfig = runtimePathConfig;
        this.nativeTesseract = nativeTesseract;
        this.catalog = catalog;
        this.systemDirs = systemDirs;
        this.allowedUrlPrefix = allowedUrlPrefix;
        this.downloadTimeout = downloadTimeout;
        this.http =
                HttpClient.newBuilder()
                        // Every hop would need re-checking against the allowlist, so none are
                        // taken.
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .connectTimeout(Duration.ofSeconds(20))
                        .build();
    }

    static Catalog loadCatalog(ObjectMapper objectMapper) throws IOException {
        try (InputStream in =
                OcrLanguageInstaller.class.getClassLoader().getResourceAsStream(CATALOG_RESOURCE)) {
            if (in == null) throw new IOException("Missing " + CATALOG_RESOURCE);
            return objectMapper.readValue(in, Catalog.class);
        }
    }

    /** Folders a separately installed Tesseract keeps its languages in, most specific first. */
    static List<Path> systemTessdataDirs(Map<String, String> env, String osName) {
        List<String> dirs = new ArrayList<>();
        // The desktop launcher passes on the user's own TESSDATA_PREFIX, which it overrides.
        dirs.add(env.get("STIRLING_PDF_SYSTEM_TESSDATA"));
        String os = osName.toLowerCase(Locale.ROOT);
        if (os.startsWith("windows")) {
            for (String root :
                    new String[] {env.get("ProgramFiles"), env.get("ProgramFiles(x86)")}) {
                if (root != null) dirs.add(root + "\\Tesseract-OCR\\tessdata");
            }
            String local = env.get("LOCALAPPDATA");
            if (local != null) {
                dirs.add(local + "\\Programs\\Tesseract-OCR\\tessdata");
                dirs.add(local + "\\Tesseract-OCR\\tessdata");
            }
        } else if (os.startsWith("mac")) {
            dirs.addAll(
                    List.of(
                            "/opt/homebrew/share/tessdata",
                            "/usr/local/share/tessdata",
                            "/opt/local/share/tessdata"));
        } else {
            dirs.addAll(
                    List.of(
                            "/usr/share/tesseract-ocr/5/tessdata",
                            "/usr/share/tesseract-ocr/4.00/tessdata",
                            "/usr/share/tessdata",
                            "/usr/local/share/tessdata"));
        }
        return dirs.stream().filter(d -> d != null && !d.isBlank()).map(Path::of).toList();
    }

    public Languages languages() {
        List<String> installed = OcrLanguages.installed(tessdataDir().toString());
        if (!canInstall()) return new Languages(installed, List.of(), false);
        List<Installable> installable = new ArrayList<>();
        for (CatalogEntry entry : catalog.languages()) {
            if (OcrLanguages.OSD.equals(entry.code()) || installed.contains(entry.code())) continue;
            Optional<Path> local = systemCopy(entry.code());
            installable.add(
                    local.map(p -> new Installable(entry.code(), size(p), Source.SYSTEM))
                            .orElseGet(
                                    () ->
                                            new Installable(
                                                    entry.code(),
                                                    entry.sizeBytes(),
                                                    Source.DOWNLOAD)));
        }
        return new Languages(installed, installable, true);
    }

    /** Desktop app only, and only where the tessdata folder can be written. */
    public boolean canInstall() {
        return OcrLanguages.canInstall(runtimePathConfig.getTessDataPath());
    }

    /**
     * Makes sure Tesseract's orientation model is present, installing it where languages can be
     * installed. Never throws: without it pages are simply not rotated.
     *
     * @return whether osd.traineddata is now in the tessdata folder
     */
    public boolean ensureOsd() {
        if (Files.isRegularFile(tessdataDir().resolve(OcrLanguages.OSD + OcrLanguages.SUFFIX))) {
            return true;
        }
        if (!canInstall()) return false;
        try {
            install(OcrLanguages.OSD);
            return true;
        } catch (IOException | RuntimeException e) {
            log.warn("Could not install the page orientation model: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Installs {@code code} and returns the updated languages. Single-flight: concurrent calls
     * queue, and a language that arrived meanwhile is not fetched again.
     *
     * @throws IllegalStateException installing is not available here
     * @throws IllegalArgumentException the code is not in the catalogue
     * @throws IOException the copy or download failed, or the file did not verify
     */
    public synchronized Languages install(String code) throws IOException {
        if (!canInstall()) {
            throw new IllegalStateException(
                    "OCR languages can only be installed from the desktop app");
        }
        String normalised = code == null ? "" : code.toLowerCase(Locale.ROOT);
        CatalogEntry entry =
                catalog.languages().stream()
                        .filter(e -> e.code().equals(normalised))
                        .filter(e -> CODE.matcher(e.code()).matches())
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "Unknown OCR language: " + code));
        Path dir = tessdataDir();
        Files.createDirectories(dir);
        Path target = dir.resolve(entry.code() + OcrLanguages.SUFFIX);
        if (!Files.isRegularFile(target)) {
            Path staging = Files.createTempDirectory(dir, ".install-");
            try {
                Path staged = staging.resolve(entry.code() + OcrLanguages.SUFFIX);
                if (!copyFromSystem(entry.code(), staging, staged)) download(entry, staged);
                move(staged, target);
                log.info("Installed OCR language {}", entry.code());
            } finally {
                FileUtils.deleteQuietly(staging.toFile());
            }
            nativeTesseract.refreshAvailability();
        }
        return languages();
    }

    /** False when there is no system copy or Tesseract cannot load it (e.g. 3.x-era data). */
    private boolean copyFromSystem(String code, Path staging, Path staged) throws IOException {
        Optional<Path> local = systemCopy(code);
        if (local.isEmpty()) return false;
        Files.copy(local.get(), staged, StandardCopyOption.REPLACE_EXISTING);
        if (nativeTesseract.canLoadLanguage(staging, code)) return true;
        log.info("Ignoring {}: Tesseract cannot load it, downloading instead", local.get());
        Files.deleteIfExists(staged);
        return false;
    }

    /**
     * The whole transfer is bounded by {@link #downloadTimeout}, not just the wait for headers, so
     * a stalled connection cannot hold the install lock.
     */
    private void download(CatalogEntry entry, Path staged) throws IOException {
        String url = catalog.baseUrl() + entry.code() + OcrLanguages.SUFFIX;
        if (!url.startsWith(allowedUrlPrefix)) {
            throw new IOException("Language URL is not on the allowlist: " + url);
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
        HttpResponse.BodyHandler<Path> toFile =
                info ->
                        info.statusCode() == 200
                                ? HttpResponse.BodySubscribers.ofFile(staged)
                                : HttpResponse.BodySubscribers.replacing(null);
        CompletableFuture<HttpResponse<Path>> transfer =
                http.sendAsync(
                        request, HttpResponse.BodyHandlers.limiting(toFile, entry.sizeBytes()));
        HttpResponse<Path> response;
        try {
            response = transfer.get(downloadTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            transfer.cancel(true);
            throw new IOException(
                    "Downloading "
                            + entry.code()
                            + " took longer than "
                            + downloadTimeout.toSeconds()
                            + " seconds",
                    e);
        } catch (InterruptedException e) {
            transfer.cancel(true);
            Thread.currentThread().interrupt();
            throw new IOException("Download interrupted", e);
        } catch (ExecutionException e) {
            throw new IOException("Downloading " + entry.code() + " failed", e.getCause());
        }
        if (response.statusCode() != 200) {
            throw new IOException(
                    "Downloading " + entry.code() + " failed: HTTP " + response.statusCode());
        }
        if (!MessageDigest.isEqual(sha256(staged), HexFormat.of().parseHex(entry.sha256()))) {
            throw new IOException(entry.code() + " failed its checksum");
        }
    }

    private static byte[] sha256(Path file) throws IOException {
        try (InputStream in = Files.newInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[1 << 16];
            int n;
            while ((n = in.read(buffer)) >= 0) digest.update(buffer, 0, n);
            return digest.digest();
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("SHA-256 unavailable", e);
        }
    }

    private Optional<Path> systemCopy(String code) {
        Path own = tessdataDir().toAbsolutePath().normalize();
        return systemDirs.stream()
                .filter(d -> !d.toAbsolutePath().normalize().equals(own))
                .map(d -> d.resolve(code + OcrLanguages.SUFFIX))
                .filter(Files::isRegularFile)
                .findFirst();
    }

    private Path tessdataDir() {
        return Path.of(runtimePathConfig.getTessDataPath());
    }

    private static long size(Path file) {
        try {
            return Files.size(file);
        } catch (IOException e) {
            return 0;
        }
    }

    private static void move(Path from, Path to) throws IOException {
        try {
            Files.move(from, to, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
