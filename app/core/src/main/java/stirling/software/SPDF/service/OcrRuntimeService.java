package stirling.software.SPDF.service;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ocr.OcrManifest;
import stirling.software.SPDF.model.ocr.OcrManifest.OcrArtifact;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ChecksumUtils;

import tools.jackson.databind.ObjectMapper;

/**
 * Installs the OCR engine and its language models on demand, so the desktop installers do not have
 * to carry ~130 MB that most users never touch.
 *
 * <p>Everything lands under {@code <installation path>/tesseract}, which is the first directory
 * {@code RuntimePathConfig} already probes for a bundled Tesseract, so nothing about path
 * resolution changes: an installed runtime is found exactly where an embedded one used to be. On
 * the desktop that directory sits in the user's own application data, so no elevation is needed.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OcrRuntimeService {

    /**
     * Where the catalogue lives when nothing is configured.
     *
     * <p>Intentionally the single point of control: whoever owns this address decides what an
     * installation is allowed to download. It is a plain setting so a maintainer can move the
     * hosting, and an operator can redirect it to an internal mirror, without touching code.
     */
    static final String DEFAULT_MANIFEST_URL =
            "https://raw.githubusercontent.com/samuelsl27/Stirling-PDF/ocr-manifest/ocr-manifest.json";

    /** Directory name, kept identical to the one the bundled runtime used. */
    private static final String RUNTIME_DIR = "tesseract";

    private static final String TESSDATA_DIR = "tessdata";

    /** Same character set the existing tessdata downloader accepts; anything else is rejected. */
    private static final Pattern LANGUAGE_CODE = Pattern.compile("[A-Za-z0-9_+\\-]{1,32}");

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(15);
    private static final Duration REQUEST_TIMEOUT = Duration.ofMinutes(10);

    /** Ceilings that turn a hostile archive into a clean failure instead of a full disk. */
    private static final long MAX_ARCHIVE_BYTES = 300L * 1024 * 1024;

    private static final long MAX_EXPANDED_BYTES = 700L * 1024 * 1024;
    private static final int MAX_ENTRIES = 5_000;

    private final ApplicationProperties applicationProperties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Last known progress, so the UI can show something during a long download. */
    private final AtomicReference<Progress> progress = new AtomicReference<>(Progress.idle());

    /**
     * @param what artefact being fetched, empty when nothing is running
     * @param bytesDone bytes written so far
     * @param bytesTotal expected total, 0 when unknown
     */
    public record Progress(String what, long bytesDone, long bytesTotal) {
        public static Progress idle() {
            return new Progress("", 0, 0);
        }
    }

    public Progress currentProgress() {
        return progress.get();
    }

    // ---------------------------------------------------------------- layout

    public Path runtimeRoot() {
        return Path.of(InstallationPathConfig.getPath(), RUNTIME_DIR);
    }

    public Path tessdataRoot() {
        return runtimeRoot().resolve(TESSDATA_DIR);
    }

    public boolean isEngineInstalled() {
        return Files.isRegularFile(runtimeRoot().resolve(executableName()));
    }

    private static String executableName() {
        return isWindows() ? "tesseract.exe" : "tesseract";
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("windows");
    }

    /**
     * Key used to pick an engine build out of the manifest.
     *
     * <p>Kept coarse on purpose: the manifest decides which platforms exist, and an unknown key
     * simply means "no engine offered here", which is the right answer on a Linux distribution that
     * ships Tesseract through its package manager.
     */
    static String platformKey(String osName, String arch) {
        String os = osName == null ? "" : osName.toLowerCase(Locale.ROOT);
        String cpu = arch == null ? "" : arch.toLowerCase(Locale.ROOT);
        String platform;
        if (os.contains("windows")) {
            platform = "windows";
        } else if (os.contains("mac") || os.contains("darwin")) {
            platform = "macos";
        } else {
            platform = "linux";
        }
        String bits =
                switch (cpu) {
                    case "aarch64", "arm64" -> "aarch64";
                    case "amd64", "x86_64" -> "x86_64";
                    default -> cpu.isEmpty() ? "unknown" : cpu;
                };
        return platform + "-" + bits;
    }

    public String platformKey() {
        return platformKey(System.getProperty("os.name"), System.getProperty("os.arch"));
    }

    // -------------------------------------------------------------- manifest

    public String manifestUrl() {
        String configured =
                applicationProperties.getSystem().getOcr() == null
                        ? null
                        : applicationProperties.getSystem().getOcr().getManifestUrl();
        return configured == null || configured.isBlank() ? DEFAULT_MANIFEST_URL : configured;
    }

    public OcrManifest loadManifest() throws IOException {
        URI uri = validatedUri(manifestUrl());
        try (InputStream in = open(uri)) {
            return objectMapper.readValue(in.readAllBytes(), OcrManifest.class);
        }
    }

    /** Language codes present on disk right now. Cheap enough to do per request. */
    public List<String> installedLanguages() {
        Path tessdata = tessdataRoot();
        if (!Files.isDirectory(tessdata)) {
            return List.of();
        }
        try (var entries = Files.list(tessdata)) {
            return entries.map(p -> p.getFileName().toString())
                    .filter(n -> n.endsWith(".traineddata"))
                    .map(n -> n.substring(0, n.length() - ".traineddata".length()))
                    .sorted()
                    .toList();
        } catch (IOException e) {
            log.warn("Could not list installed OCR languages in {}", tessdata, e);
            return List.of();
        }
    }

    // ------------------------------------------------------------- installing

    /**
     * Downloads and unpacks the engine for this platform.
     *
     * <p>The archive is expanded into a sibling directory and only swapped in once it is complete,
     * so a download that dies half way leaves the previous state untouched rather than a runtime
     * that exists but cannot run.
     */
    public synchronized void installEngine() throws IOException {
        OcrManifest manifest = loadManifest();
        String key = platformKey();
        OcrArtifact artifact = manifest.engine().get(key);
        if (artifact == null) {
            throw new IOException("The OCR catalogue offers no engine for " + key);
        }

        Path root = runtimeRoot();
        Path staging = root.resolveSibling(RUNTIME_DIR + ".incoming");
        Path archive = null;
        try {
            deleteRecursively(staging);
            Files.createDirectories(staging);
            archive = Files.createTempFile("stirling-ocr-", ".zip");
            download(artifact, archive, "OCR engine " + nullToEmpty(artifact.version()));
            unzipInto(archive, staging);

            if (!Files.isRegularFile(staging.resolve(executableName()))) {
                throw new IOException(
                        "The downloaded OCR archive has no " + executableName() + " in it");
            }
            // configs/pdf is not optional: the "pdf" argument Stirling-PDF passes to Tesseract is
            // the name of a config file, and without it a run exits 0 having written nothing.
            if (!Files.isReadable(
                    staging.resolve(TESSDATA_DIR).resolve("configs").resolve("pdf"))) {
                throw new IOException(
                        "The downloaded OCR archive is missing tessdata/configs/pdf, so OCR would"
                                + " silently produce no output");
            }

            carryOverExistingLanguages(root, staging);
            swapIn(staging, root);
            log.info("Installed the OCR engine into {}", root);
        } finally {
            deleteQuietly(archive);
            deleteRecursively(staging);
        }
    }

    /** Adds one language model next to the engine, where Tesseract will actually look for it. */
    public synchronized void installLanguage(String code) throws IOException {
        String safe = requireSafeLanguageCode(code);
        OcrManifest manifest = loadManifest();
        OcrArtifact artifact = manifest.languages().get(safe);
        if (artifact == null) {
            artifact = manifest.extras().get(safe);
        }
        if (artifact == null) {
            throw new IOException("The OCR catalogue does not offer the language " + safe);
        }

        Path tessdata = tessdataRoot();
        Files.createDirectories(tessdata);
        Path target = resolveInside(tessdata, safe + ".traineddata");
        Path temp = Files.createTempFile(tessdata, safe + "-", ".part");
        try {
            download(artifact, temp, displayName(artifact, safe));
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            log.info("Installed the OCR language {}", safe);
        } finally {
            deleteQuietly(temp);
        }
    }

    public synchronized void removeLanguage(String code) throws IOException {
        String safe = requireSafeLanguageCode(code);
        if ("eng".equals(safe)) {
            // Tesseract needs a fallback model; removing English is the classic way to end up with
            // an engine that is installed and refuses every job.
            throw new IOException("English cannot be removed: Tesseract falls back to it");
        }
        Path target = resolveInside(tessdataRoot(), safe + ".traineddata");
        Files.deleteIfExists(target);
    }

    // ------------------------------------------------------------- internals

    /**
     * Keeps models the user already installed when the engine itself is replaced.
     *
     * <p>Without this, upgrading the engine would silently throw away every extra language and the
     * user would have to notice and redownload them.
     */
    private void carryOverExistingLanguages(Path currentRoot, Path staging) throws IOException {
        Path from = currentRoot.resolve(TESSDATA_DIR);
        if (!Files.isDirectory(from)) {
            return;
        }
        Path to = staging.resolve(TESSDATA_DIR);
        Files.createDirectories(to);
        try (var entries = Files.list(from)) {
            for (Path model :
                    entries.filter(p -> p.getFileName().toString().endsWith(".traineddata"))
                            .toList()) {
                Path destination = to.resolve(model.getFileName().toString());
                if (!Files.exists(destination)) {
                    Files.copy(model, destination, StandardCopyOption.COPY_ATTRIBUTES);
                }
            }
        }
    }

    private void swapIn(Path staging, Path root) throws IOException {
        Path retired = root.resolveSibling(RUNTIME_DIR + ".previous");
        deleteRecursively(retired);
        if (Files.exists(root)) {
            Files.move(root, retired);
        }
        try {
            Files.move(staging, root);
        } catch (IOException e) {
            // Put the old runtime back rather than leaving the installation with no OCR at all.
            if (Files.exists(retired) && !Files.exists(root)) {
                Files.move(retired, root);
            }
            throw e;
        } finally {
            deleteRecursively(retired);
        }
    }

    void download(OcrArtifact artifact, Path target, String label) throws IOException {
        if (artifact.sha256() == null || artifact.sha256().isBlank()) {
            // Refusing here is the whole point: this writes executable code and language data next
            // to the application, and an unverified artefact is an unverified instruction.
            throw new IOException("The OCR catalogue lists " + label + " without a SHA-256");
        }
        URI uri = validatedUri(artifact.url());
        progress.set(new Progress(label, 0, artifact.size()));
        try (InputStream in = open(uri)) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            progress.set(Progress.idle());
        }

        long written = Files.size(target);
        if (written > MAX_ARCHIVE_BYTES) {
            Files.deleteIfExists(target);
            throw new IOException(label + " is larger than the " + MAX_ARCHIVE_BYTES + " byte cap");
        }
        if (artifact.size() > 0 && written != artifact.size()) {
            Files.deleteIfExists(target);
            throw new IOException(
                    label + " is " + written + " bytes, the catalogue says " + artifact.size());
        }
        if (!ChecksumUtils.matches(target, "SHA-256", artifact.sha256())) {
            Files.deleteIfExists(target);
            throw new IOException("SHA-256 mismatch for " + label + "; nothing was installed");
        }
    }

    /**
     * Only https and local files are accepted.
     *
     * <p>Plain http would let whoever can rewrite the traffic rewrite the manifest and the digests
     * it contains in the same breath, which makes the checksum theatre rather than a check.
     */
    static URI validatedUri(String url) throws IOException {
        if (url == null || url.isBlank()) {
            throw new IOException("No OCR catalogue address configured");
        }
        URI uri;
        try {
            uri = new URI(url.trim());
        } catch (URISyntaxException e) {
            throw new IOException("Not a usable OCR catalogue address: " + url, e);
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !"file".equals(scheme)) {
            throw new IOException(
                    "OCR downloads must come over https or from a local file, got: " + scheme);
        }
        return uri;
    }

    private InputStream open(URI uri) throws IOException {
        if ("file".equalsIgnoreCase(uri.getScheme())) {
            return Files.newInputStream(Path.of(uri));
        }
        HttpRequest request =
                HttpRequest.newBuilder(uri)
                        .timeout(REQUEST_TIMEOUT)
                        .header("User-Agent", "Stirling-PDF")
                        .GET()
                        .build();
        try (HttpClient client =
                HttpClient.newBuilder()
                        .connectTimeout(CONNECT_TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build()) {
            HttpResponse<InputStream> response =
                    client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                throw new IOException("HTTP " + response.statusCode() + " fetching " + uri);
            }
            return response.body();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted fetching " + uri, e);
        }
    }

    /** Expands an archive, refusing anything that tries to write outside {@code destination}. */
    static void unzipInto(Path archive, Path destination) throws IOException {
        Path root = destination.toAbsolutePath().normalize();
        long expanded = 0;
        int entries = 0;
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > MAX_ENTRIES) {
                    throw new IOException(
                            "The OCR archive has more than " + MAX_ENTRIES + " files");
                }
                Path target = resolveInside(root, entry.getName());
                if (entry.isDirectory()) {
                    Files.createDirectories(target);
                    continue;
                }
                Files.createDirectories(target.getParent());
                long written = Files.copy(zip, target, StandardCopyOption.REPLACE_EXISTING);
                expanded += written;
                if (expanded > MAX_EXPANDED_BYTES) {
                    throw new IOException("The OCR archive expands past the size cap");
                }
            }
        }
        markExecutable(root.resolve(executableName()));
    }

    /**
     * Joins a untrusted relative name onto a trusted root and proves the result stayed inside it.
     *
     * <p>Covers both {@code ../} in an archive entry and an absolute path, which on Windows also
     * means a drive-qualified one.
     */
    static Path resolveInside(Path root, String relative) throws IOException {
        Path base = root.toAbsolutePath().normalize();
        Path candidate = base.resolve(relative).normalize();
        if (!candidate.startsWith(base) || candidate.equals(base)) {
            throw new IOException("Refusing to write outside the OCR directory: " + relative);
        }
        return candidate;
    }

    private static void markExecutable(Path binary) {
        if (isWindows() || !Files.exists(binary)) {
            return;
        }
        if (!binary.toFile().setExecutable(true, false)) {
            log.warn("Could not mark {} executable", binary);
        }
    }

    static String requireSafeLanguageCode(String code) throws IOException {
        String trimmed = code == null ? "" : code.trim();
        if (!LANGUAGE_CODE.matcher(trimmed).matches()) {
            throw new IOException("Not a valid OCR language code: " + code);
        }
        return trimmed;
    }

    private static String displayName(OcrArtifact artifact, String fallback) {
        return artifact.name() == null || artifact.name().isBlank() ? fallback : artifact.name();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.debug("Could not delete {}", path, e);
        }
    }

    private static void deleteRecursively(Path path) {
        if (path == null || !Files.exists(path)) {
            return;
        }
        try (var walk = Files.walk(path)) {
            List<Path> deepestFirst =
                    new ArrayList<>(walk.sorted(Comparator.reverseOrder()).toList());
            for (Path p : deepestFirst) {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            log.debug("Could not clean up {}", path, e);
        }
    }
}
