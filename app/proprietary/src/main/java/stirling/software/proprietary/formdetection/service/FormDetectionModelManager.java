package stirling.software.proprietary.formdetection.service;

import static java.nio.file.StandardOpenOption.CREATE;
import static java.nio.file.StandardOpenOption.TRUNCATE_EXISTING;
import static java.nio.file.StandardOpenOption.WRITE;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.EndpointConfiguration.DisableReason;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.formdetection.catalog.ModelCatalogService;
import stirling.software.proprietary.formdetection.inference.FormDetectionEngine;
import stirling.software.proprietary.formdetection.model.FormDetectionStatus;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;
import stirling.software.proprietary.formdetection.model.ModelStatusResponse;

/**
 * Downloads, verifies and tracks the detection model. Single-flight install, SHA-256 verified,
 * published by atomic rename into a mounted volume so it survives container restarts.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FormDetectionModelManager {

    /** Endpoint key gated until a model is ready (drives the disabled tool tile in the UI). */
    public static final String ENDPOINT_KEY = "form-detection";

    private static final Pattern SAFE_ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,63}");
    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    /** The only origin the bundled catalog downloads from; also rejects userinfo/lookalikes. */
    private static final String ALLOWED_MODEL_URL_PREFIX = "https://huggingface.co/";

    /** Hugging Face hands the file off to its own CDN, so redirects must stay in these domains. */
    private static final List<String> ALLOWED_REDIRECT_HOSTS = List.of("huggingface.co", "hf.co");

    private static final int MAX_REDIRECTS = 5;

    /**
     * Whether the ONNX engine is bundled in this build; the jar only ships with {@code
     * -PbundleOnnxRuntime=true}. Without it the tool cannot run at all.
     */
    private static final boolean SERVER_ENGINE_AVAILABLE = isOnnxRuntimePresent();

    private static boolean isOnnxRuntimePresent() {
        try {
            Class.forName(
                    "ai.onnxruntime.OrtEnvironment",
                    false,
                    FormDetectionModelManager.class.getClassLoader());
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private final RuntimePathConfig runtimePathConfig;
    private final ModelCatalogService catalog;
    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;

    /**
     * Resolved lazily and by interface: the ONNX engine is absent from builds without onnxruntime,
     * and an eager or concrete-typed dependency would fail startup there.
     */
    private final ObjectProvider<FormDetectionEngine> engineProvider;

    private final AtomicBoolean installing = new AtomicBoolean(false);
    private volatile FormDetectionStatus state = FormDetectionStatus.NOT_INSTALLED;
    private volatile int progress = 0;
    private volatile String error = null;
    private volatile String activeSha = null;
    private volatile String downloadingModelId = null;

    @PostConstruct
    void init() {
        sweepTempFiles();
        seedPreinstalledModels();
        Optional<Path> active = getActiveModelFile();
        if (active.isPresent()) {
            activeSha = getActiveEntry().map(ModelCatalogEntry::getSha256).orElse(null);
            state = FormDetectionStatus.READY;
            log.info("Auto Form Detection model '{}' is installed and ready", activeModelId());
        } else {
            state = FormDetectionStatus.NOT_INSTALLED;
        }
        applyEndpointState();
    }

    /**
     * Gate the {@code form-detection} endpoint that drives the tool tile: CONFIG when an admin
     * disabled the feature, DEPENDENCY when no model is ready, enabled otherwise.
     */
    private void applyEndpointState() {
        if (!isFeatureEnabled()) {
            endpointConfiguration.disableEndpoint(ENDPOINT_KEY, DisableReason.CONFIG);
        } else if (state == FormDetectionStatus.READY && getActiveModelFile().isPresent()) {
            endpointConfiguration.enableEndpoint(ENDPOINT_KEY);
        } else {
            endpointConfiguration.disableEndpoint(ENDPOINT_KEY, DisableReason.DEPENDENCY);
        }
    }

    public boolean isFeatureEnabled() {
        return applicationProperties.getFormDetection().isEnabled();
    }

    /** Master on/off (admin). Persists and re-gates the endpoint immediately. */
    public synchronized void setEnabled(boolean enabled) {
        applicationProperties.getFormDetection().setEnabled(enabled);
        try {
            GeneralUtils.saveKeyToSettings("formDetection.enabled", enabled);
        } catch (IOException e) {
            log.warn("Could not persist formDetection.enabled (state kept in memory)", e);
        }
        applyEndpointState();
    }

    /**
     * Validate and kick off a background download+verify+install. Returns immediately; callers poll
     * {@link #status()}.
     *
     * @throws IllegalArgumentException unknown/invalid model id or bad checksum format
     * @throws IllegalStateException no URL/checksum configured, or an install is already running
     */
    public synchronized void startInstall(String modelId) {
        if (!SAFE_ID.matcher(modelId).matches()) {
            throw new IllegalArgumentException("Invalid model id: " + modelId);
        }
        ModelCatalogEntry entry =
                catalog.getById(modelId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("Unknown model id: " + modelId));
        // URL + checksum come ONLY from the bundled catalog (trusted constants), never from the
        // request, so an admin cannot point the download at an arbitrary host (avoids SSRF).
        String url = entry.getOnnxUrl();
        String sha = entry.getSha256() == null ? null : entry.getSha256().toLowerCase(Locale.ROOT);
        if (StringUtils.isBlank(url) || StringUtils.isBlank(sha)) {
            throw new IllegalStateException(
                    "Model '" + modelId + "' has no download URL/checksum configured yet");
        }
        // Same allowlist the download enforces, so a bad catalog entry fails here, not mid-install.
        if (!url.startsWith(ALLOWED_MODEL_URL_PREFIX)) {
            throw new IllegalArgumentException("Model URL is not on the allowlist: " + url);
        }
        if (!SHA256_HEX.matcher(sha).matches()) {
            throw new IllegalArgumentException("Checksum must be a 64-char hex SHA-256");
        }
        if (!installing.compareAndSet(false, true)) {
            throw new IllegalStateException("An install is already in progress");
        }
        state = FormDetectionStatus.DOWNLOADING;
        progress = 0;
        error = null;
        downloadingModelId = modelId;
        final String fUrl = url;
        final String fSha = sha;
        Thread.ofVirtual()
                .name("form-detection-install-" + modelId)
                .start(
                        () -> {
                            try {
                                doInstall(modelId, entry, fUrl, fSha);
                            } catch (Exception e) {
                                log.error("Auto Form Detection install failed for {}", modelId, e);
                                error = e.getMessage();
                                // Keep a previously-installed model usable if the new one failed.
                                state =
                                        getActiveModelFile().isPresent()
                                                ? FormDetectionStatus.READY
                                                : FormDetectionStatus.FAILED;
                            } finally {
                                downloadingModelId = null;
                                installing.set(false);
                            }
                        });
    }

    private void doInstall(String modelId, ModelCatalogEntry entry, String url, String expectedSha)
            throws IOException {
        Path dir = modelDir();
        Files.createDirectories(dir);
        if (!isWritable(dir)) {
            throw new IOException("Model directory is not writable: " + dir);
        }
        Path base = dir.toRealPath();
        Path target = base.resolve(modelId + ".onnx").normalize();
        if (!target.startsWith(base)) {
            throw new IOException("Blocked path traversal for model id " + modelId);
        }

        // Already downloaded and intact: skip the network fetch and just (re)activate it. Makes
        // switching between already-downloaded models instant instead of re-fetching tens of MB.
        if (Files.isRegularFile(target) && expectedSha.equals(sha256OfFile(target))) {
            log.info(
                    "Model '{}' already present and verified; activating without re-download",
                    modelId);
            activate(modelId, expectedSha);
            return;
        }

        Path tmp = base.resolve(modelId + ".onnx.tmp");

        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (Exception e) {
            throw new IOException("SHA-256 unavailable", e);
        }

        HttpURLConnection conn = null;
        try {
            conn = openModelDownload(url);
            long total =
                    entry.getSizeBytes() > 0 ? entry.getSizeBytes() : conn.getContentLengthLong();
            try (InputStream in = conn.getInputStream();
                    OutputStream out =
                            Files.newOutputStream(tmp, CREATE, TRUNCATE_EXISTING, WRITE)) {
                byte[] buf = new byte[1 << 16];
                long read = 0;
                int n;
                while ((n = in.read(buf)) >= 0) {
                    out.write(buf, 0, n);
                    digest.update(buf, 0, n);
                    read += n;
                    if (total > 0) {
                        progress = (int) Math.min(99, (read * 100) / total);
                    }
                }
            }
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }

        state = FormDetectionStatus.VERIFYING;
        byte[] actual = digest.digest();
        byte[] expected = HexFormat.of().parseHex(expectedSha);
        if (!MessageDigest.isEqual(actual, expected)) {
            Files.deleteIfExists(tmp);
            throw new IOException(
                    "Checksum mismatch (expected "
                            + expectedSha
                            + " got "
                            + HexFormat.of().formatHex(actual)
                            + ")");
        }

        try {
            Files.move(
                    tmp,
                    target,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        }

        activate(modelId, expectedSha);
    }

    /**
     * Open the model download after checking the URL against the allowlist. Redirects are followed
     * by hand so every hop is re-checked; auto-follow would skip that. Package-private for tests.
     */
    HttpURLConnection openModelDownload(String url) throws IOException {
        if (!url.startsWith(ALLOWED_MODEL_URL_PREFIX)) {
            throw new IOException("Model download URL is not on the allowlist: " + url);
        }
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpURLConnection conn =
                    (HttpURLConnection) URI.create(current).toURL().openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Stirling-PDF-App");
            conn.setRequestProperty("Accept", "application/octet-stream");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(60000);
            int http = conn.getResponseCode();
            if (http == HttpURLConnection.HTTP_OK) {
                return conn;
            }
            String location = isRedirect(http) ? conn.getHeaderField("Location") : null;
            conn.disconnect();
            if (StringUtils.isBlank(location)) {
                throw new IOException("Download failed: HTTP " + http + " from " + current);
            }
            current = requireAllowedRedirect(current, location);
        }
        throw new IOException("Too many redirects downloading model from " + url);
    }

    private static boolean isRedirect(int status) {
        return status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;
    }

    /** Resolve a redirect target and re-apply the https + host allowlist to it. */
    private static String requireAllowedRedirect(String from, String location) throws IOException {
        URI next;
        try {
            next = URI.create(from).resolve(location);
        } catch (IllegalArgumentException e) {
            throw new IOException("Model download redirect is not a valid URL: " + location, e);
        }
        String host = next.getHost() == null ? "" : next.getHost().toLowerCase(Locale.ROOT);
        boolean allowed =
                "https".equalsIgnoreCase(next.getScheme())
                        && next.getUserInfo() == null
                        && ALLOWED_REDIRECT_HOSTS.stream()
                                .anyMatch(h -> host.equals(h) || host.endsWith("." + h));
        if (!allowed) {
            throw new IOException("Model download redirect is not on the allowlist: " + next);
        }
        return next.toString();
    }

    /**
     * Tombstone for an admin-uninstalled model, so the next boot's seeding cannot resurrect it;
     * cleared by a reinstall. The containment check keeps the path inside the model dir.
     */
    private Path tombstoneFor(String id) {
        Path base = modelDir().normalize();
        Path tombstone = base.resolve(id + ".onnx.removed").normalize();
        if (!tombstone.startsWith(base)) {
            throw new IllegalArgumentException("Blocked path traversal for model id " + id);
        }
        return tombstone;
    }

    private void clearTombstone(String id) {
        try {
            Files.deleteIfExists(tombstoneFor(id));
        } catch (IOException e) {
            log.debug("Could not clear uninstall tombstone for {}", id, e);
        }
    }

    /**
     * Mark a verified on-disk model active and re-enable the feature. Synchronized because it
     * writes settings from the install thread, where a concurrent toggle could drop a key.
     */
    private synchronized void activate(String modelId, String expectedSha) {
        clearTombstone(modelId);
        applicationProperties.getFormDetection().setActiveModelId(modelId);
        try {
            GeneralUtils.saveKeyToSettings("formDetection.activeModelId", modelId);
        } catch (IOException e) {
            log.warn("Could not persist formDetection.activeModelId (state kept in memory)", e);
        }
        activeSha = expectedSha;
        progress = 100;
        state = FormDetectionStatus.READY;
        invalidateEngine();
        applyEndpointState();
        log.info("Auto Form Detection model '{}' installed and ready", modelId);
    }

    /**
     * Drop any model an engine still holds. Reinstalling the same id leaves the loaded id
     * unchanged, so without this the engine keeps serving the pre-swap session.
     */
    private void invalidateEngine() {
        engineProvider.ifAvailable(FormDetectionEngine::unload);
    }

    /** SHA-256 of an existing model file as lowercase hex, or {@code null} if it cannot be read. */
    private String sha256OfFile(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) >= 0) {
                digest.update(buf, 0, n);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            log.debug("Could not hash existing model file {}", file, e);
            return null;
        }
    }

    /** Remove a model file; if it was the active one, disable the feature again. */
    public synchronized void deleteModel(String modelId) {
        if (installing.get()) {
            throw new IllegalStateException("Cannot uninstall while an install is in progress");
        }
        String id = StringUtils.isNotBlank(modelId) ? modelId : activeModelId();
        if (StringUtils.isBlank(id) || !SAFE_ID.matcher(id).matches()) {
            return;
        }
        // Only the downloaded copy is ours to remove; an image-baked file is read-only and is
        // retired by the tombstone below instead.
        Optional<Path> file = modelFileIn(modelDir(), id);
        if (file.isPresent()) {
            try {
                Files.deleteIfExists(file.get());
            } catch (IOException e) {
                log.warn("Failed to delete model file {}", file.get(), e);
            }
        }
        // Record the explicit removal so a pre-installed copy is not re-seeded on restart.
        try {
            Path tombstone = tombstoneFor(id);
            if (!Files.exists(tombstone)) {
                Files.createFile(tombstone);
            }
        } catch (IOException e) {
            log.warn("Could not record uninstall tombstone for {}", id, e);
        }
        if (id.equals(activeModelId())) {
            applicationProperties.getFormDetection().setActiveModelId("");
            try {
                GeneralUtils.saveKeyToSettings("formDetection.activeModelId", "");
            } catch (IOException e) {
                log.warn("Could not clear formDetection.activeModelId", e);
            }
            activeSha = null;
        }
        if (getActiveModelFile().isEmpty()) {
            state = FormDetectionStatus.NOT_INSTALLED;
            error = null;
        }
        // The file is gone; releasing the engine's handle on it frees the native session too.
        invalidateEngine();
        applyEndpointState();
    }

    public ModelStatusResponse status() {
        Path dir = modelDir();
        List<String> installed = new ArrayList<>(listModelIds(dir));
        // Image-baked models count as installed even though they were never copied here.
        for (String id : listModelIds(preinstalledDir())) {
            if (!installed.contains(id) && !isTombstoned(id)) {
                installed.add(id);
            }
        }
        return new ModelStatusResponse(
                state.wire(),
                progress,
                activeModelId(),
                installed,
                error,
                isWritable(dir),
                catalog.getAll(),
                isFeatureEnabled(),
                SERVER_ENGINE_AVAILABLE,
                downloadingModelId);
    }

    public Optional<Path> getActiveModelFile() {
        return installedModelFile(activeModelId());
    }

    /**
     * Locate a model by listing the directory, so the path can never escape it via the id. The
     * writable model dir wins; an image-baked copy is read in place.
     */
    private Optional<Path> installedModelFile(String id) {
        if (StringUtils.isBlank(id) || !SAFE_ID.matcher(id).matches()) {
            return Optional.empty();
        }
        Optional<Path> downloaded = modelFileIn(modelDir(), id);
        if (downloaded.isPresent()) {
            return downloaded;
        }
        // An uninstalled model must stay uninstalled even though the image copy is still there.
        return isTombstoned(id) ? Optional.empty() : modelFileIn(preinstalledDir(), id);
    }

    private Optional<Path> modelFileIn(Path dir, String id) {
        if (dir == null || !Files.isDirectory(dir)) {
            return Optional.empty();
        }
        String wanted = id + ".onnx";
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "*.onnx")) {
            for (Path p : s) {
                if (wanted.equals(p.getFileName().toString()) && Files.isRegularFile(p)) {
                    return Optional.of(p);
                }
            }
        } catch (IOException e) {
            log.debug("Could not list models in {}", dir, e);
        }
        return Optional.empty();
    }

    /** Ids of the {@code <id>.onnx} files in a directory; empty when it is unset or missing. */
    private List<String> listModelIds(Path dir) {
        List<String> ids = new ArrayList<>();
        if (dir == null || !Files.isDirectory(dir)) {
            return ids;
        }
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "*.onnx")) {
            for (Path p : s) {
                String fn = p.getFileName().toString();
                ids.add(fn.substring(0, fn.length() - ".onnx".length()));
            }
        } catch (IOException e) {
            log.debug("Could not list models in {}", dir, e);
        }
        return ids;
    }

    private boolean isTombstoned(String id) {
        return SAFE_ID.matcher(id).matches() && Files.exists(tombstoneFor(id));
    }

    /** Read-only dir of image-baked models, or null when the deployment bakes none. */
    private Path preinstalledDir() {
        String dir = applicationProperties.getFormDetection().getPreinstalledModelDir();
        return StringUtils.isBlank(dir) ? null : Paths.get(dir);
    }

    public Optional<ModelCatalogEntry> getActiveEntry() {
        return catalog.getById(activeModelId());
    }

    public Optional<String> getActiveEtag() {
        return Optional.ofNullable(activeSha);
    }

    public boolean isReady() {
        return isFeatureEnabled()
                && state == FormDetectionStatus.READY
                && getActiveModelFile().isPresent();
    }

    private String activeModelId() {
        return applicationProperties.getFormDetection().getActiveModelId();
    }

    private Path modelDir() {
        return Paths.get(runtimePathConfig.getFormDetectionModelPath());
    }

    /**
     * Activate an image-baked model when nothing is active, so the air-gapped image needs no admin
     * install. Read in place; copying would store the same ~37MB twice per container.
     */
    private void seedPreinstalledModels() {
        Path src = preinstalledDir();
        if (src == null || !Files.isDirectory(src)) {
            return;
        }
        for (String id : listModelIds(src)) {
            if (!SAFE_ID.matcher(id).matches() || catalog.getById(id).isEmpty()) {
                continue;
            }
            if (isTombstoned(id)) {
                log.info("Skipping pre-installed model '{}': an admin uninstalled it", id);
                continue;
            }
            if (StringUtils.isNotBlank(activeModelId())) {
                continue;
            }
            applicationProperties.getFormDetection().setActiveModelId(id);
            try {
                GeneralUtils.saveKeyToSettings("formDetection.activeModelId", id);
            } catch (IOException e) {
                log.warn("Could not persist seeded activeModelId: {}", e.getMessage());
            }
            log.info("Activated pre-installed Auto Form Detection model '{}'", id);
        }
    }

    private void sweepTempFiles() {
        Path dir = modelDir();
        if (!Files.isDirectory(dir)) {
            return;
        }
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "*.tmp")) {
            for (Path p : s) {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // best-effort sweep of interrupted downloads
                }
            }
        } catch (IOException e) {
            log.debug("No stale form-detection temp files to sweep", e);
        }
    }

    private boolean isWritable(Path dir) {
        try {
            Files.createDirectories(dir);
            if (!Files.isWritable(dir)) {
                return false;
            }
            Path probe = Files.createTempFile(dir, "fd-write-test", ".tmp");
            Files.deleteIfExists(probe);
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
