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
import stirling.software.proprietary.formdetection.model.FormDetectionStatus;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;
import stirling.software.proprietary.formdetection.model.ModelStatusResponse;

/**
 * Downloads, verifies and tracks the on-demand Auto Form Detection model. Concurrency-safe
 * (single-flight install), checksum-verified, and atomic-published to a mounted volume so the model
 * survives container restarts/updates. Mirrors the OCR tessdata admin pattern but adds the lock,
 * temp-file + atomic rename, and SHA-256 verification the spec requires.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FormDetectionModelManager {

    /** Endpoint key gated until a model is ready (drives the disabled tool tile in the UI). */
    public static final String ENDPOINT_KEY = "form-detection";

    private static final Pattern SAFE_ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,63}");
    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    /**
     * Whether the server-side ONNX engine is bundled in this build (the onnxruntime jar is only
     * included via {@code -PbundleOnnxRuntime=true}, e.g. the Docker server image). The frontend
     * uses this to disable the "Server" execution mode when it isn't available.
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

    private final AtomicBoolean installing = new AtomicBoolean(false);
    private volatile FormDetectionStatus state = FormDetectionStatus.NOT_INSTALLED;
    private volatile int progress = 0;
    private volatile String error = null;
    private volatile String activeSha = null;

    @PostConstruct
    void init() {
        sweepTempFiles();
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
     * Gate the {@code form-detection} endpoint (which drives the tool tile): off with reason CONFIG
     * when the feature is disabled by the admin, off with reason DEPENDENCY when no model is ready,
     * otherwise on. Execution mode (browser/server) does not affect this - the tile is active
     * either way and the frontend chooses where to run.
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

    private boolean isFeatureEnabled() {
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

    /** Set where detection runs: auto|browser|server (admin). Persists. */
    public synchronized void setExecutionMode(String mode) {
        String m = mode == null ? "auto" : mode.trim().toLowerCase(Locale.ROOT);
        if (!m.equals("auto") && !m.equals("browser") && !m.equals("server")) {
            throw new IllegalArgumentException("executionMode must be auto, browser or server");
        }
        applicationProperties.getFormDetection().setExecutionMode(m);
        try {
            GeneralUtils.saveKeyToSettings("formDetection.executionMode", m);
        } catch (IOException e) {
            log.warn("Could not persist formDetection.executionMode (state kept in memory)", e);
        }
    }

    /**
     * Validate and kick off a background download+verify+install. Returns immediately; callers poll
     * {@link #status()}.
     *
     * @throws IllegalArgumentException unknown/invalid model id or bad checksum format
     * @throws IllegalStateException no URL/checksum configured, or an install is already running
     */
    public synchronized void startInstall(String modelId, String overrideUrl, String overrideSha) {
        ModelCatalogEntry entry =
                catalog.getById(modelId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("Unknown model id: " + modelId));
        if (!SAFE_ID.matcher(modelId).matches()) {
            throw new IllegalArgumentException("Invalid model id: " + modelId);
        }
        String url = StringUtils.isNotBlank(overrideUrl) ? overrideUrl : entry.getOnnxUrl();
        String rawSha = StringUtils.isNotBlank(overrideSha) ? overrideSha : entry.getSha256();
        String sha = rawSha == null ? null : rawSha.toLowerCase(Locale.ROOT);
        if (StringUtils.isBlank(url) || StringUtils.isBlank(sha)) {
            throw new IllegalStateException(
                    "Model '" + modelId + "' has no download URL/checksum configured yet");
        }
        String scheme = URI.create(url).getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("Model URL must be http(s): " + url);
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
            conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Stirling-PDF-App");
            conn.setRequestProperty("Accept", "application/octet-stream");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(60000);
            int http = conn.getResponseCode();
            if (http != HttpURLConnection.HTTP_OK) {
                throw new IOException("Download failed: HTTP " + http + " from " + url);
            }
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

    /** Mark a verified, on-disk model as the active one and (re)enable the feature. */
    private void activate(String modelId, String expectedSha) {
        applicationProperties.getFormDetection().setActiveModelId(modelId);
        try {
            GeneralUtils.saveKeyToSettings("formDetection.activeModelId", modelId);
        } catch (IOException e) {
            log.warn("Could not persist formDetection.activeModelId (state kept in memory)", e);
        }
        activeSha = expectedSha;
        progress = 100;
        state = FormDetectionStatus.READY;
        applyEndpointState();
        log.info("Auto Form Detection model '{}' installed and ready", modelId);
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
        Path file = modelDir().resolve(id + ".onnx");
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            log.warn("Failed to delete model file {}", file, e);
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
        applyEndpointState();
    }

    public ModelStatusResponse status() {
        Path dir = modelDir();
        List<String> installed = new ArrayList<>();
        if (Files.isDirectory(dir)) {
            try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "*.onnx")) {
                for (Path p : s) {
                    String fn = p.getFileName().toString();
                    installed.add(fn.substring(0, fn.length() - ".onnx".length()));
                }
            } catch (IOException e) {
                log.debug("Could not list installed models in {}", dir, e);
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
                applicationProperties.getFormDetection().getExecutionMode(),
                SERVER_ENGINE_AVAILABLE);
    }

    public Optional<Path> getActiveModelFile() {
        String id = activeModelId();
        if (StringUtils.isBlank(id)) {
            return Optional.empty();
        }
        Path f = modelDir().resolve(id + ".onnx");
        return Files.isRegularFile(f) ? Optional.of(f) : Optional.empty();
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
