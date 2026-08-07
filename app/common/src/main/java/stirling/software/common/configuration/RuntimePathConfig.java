package stirling.software.common.configuration;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;
import org.springframework.boot.system.ApplicationHome;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.CustomPaths;
import stirling.software.common.model.ApplicationProperties.CustomPaths.Operations;
import stirling.software.common.model.ApplicationProperties.CustomPaths.Pipeline;
import stirling.software.common.model.ApplicationProperties.System;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.UnoServerPool;

@Slf4j
@Configuration
@Getter
public class RuntimePathConfig {

    /** Directory holding the Tesseract binary bundled by the desktop installers. */
    private static final String TESSERACT_BUNDLE_DIR = "tesseract";

    private static final String TESSDATA_DIR_NAME = TESSERACT_BUNDLE_DIR + "/tessdata";
    private static final String TESSERACT_COMMAND = "tesseract";
    private static final String DEFAULT_LINUX_TESSDATA_PATH = "/usr/share/tesseract-ocr/5/tessdata";

    private final ApplicationProperties properties;
    private final String basePath;

    // Operation paths
    private final String weasyPrintPath;
    private final String unoConvertPath;
    private final String calibrePath;
    private final String ocrMyPdfPath;
    private final String sOfficePath;

    // Tesseract binary and data paths
    private final String tesseractPath;
    private final String tessDataPath;

    private final List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> unoServerEndpoints;

    // Pipeline paths
    private final String pipelineWatchedFoldersPath;
    private final List<String> pipelineWatchedFoldersPaths;
    private final String pipelineFinishedFoldersPath;
    private final String pipelineDefaultWebUiConfigs;
    private final String pipelinePath;

    public RuntimePathConfig(ApplicationProperties properties) {
        this.properties = properties;
        this.basePath = InstallationPathConfig.getPath();

        System system = properties.getSystem();
        CustomPaths customPaths = system.getCustomPaths();

        Pipeline pipeline = customPaths.getPipeline();

        this.pipelinePath =
                resolvePath(
                        Path.of(basePath, "pipeline").toString(),
                        pipeline != null ? pipeline.getPipelineDir() : null);
        String defaultWatchedFolders = Path.of(this.pipelinePath, "watchedFolders").toString();
        String defaultFinishedFolders = Path.of(this.pipelinePath, "finishedFolders").toString();
        String defaultWebUIConfigs = Path.of(this.pipelinePath, "defaultWebUIConfigs").toString();

        List<String> watchedFoldersDirs =
                sanitizePathList(pipeline != null ? pipeline.getWatchedFoldersDirs() : null);
        this.pipelineWatchedFoldersPaths =
                resolveWatchedFolderPaths(
                        defaultWatchedFolders,
                        watchedFoldersDirs,
                        pipeline != null ? pipeline.getWatchedFoldersDir() : null);
        this.pipelineWatchedFoldersPath = this.pipelineWatchedFoldersPaths.get(0);
        this.pipelineFinishedFoldersPath =
                resolvePath(
                        defaultFinishedFolders,
                        pipeline != null ? pipeline.getFinishedFoldersDir() : null);
        this.pipelineDefaultWebUiConfigs =
                resolvePath(
                        defaultWebUIConfigs,
                        pipeline != null ? pipeline.getWebUIConfigsDir() : null);

        // Validate path conflicts after all paths are resolved
        validatePipelinePaths();

        boolean isDocker = isRunningInDocker();

        // Initialize Operation paths
        String defaultWeasyPrintPath = isDocker ? "/opt/venv/bin/weasyprint" : "weasyprint";
        String defaultUnoConvertPath = isDocker ? "/usr/local/bin/unoconvert" : "unoconvert";
        String defaultCalibrePath = isDocker ? "/opt/calibre/ebook-convert" : "ebook-convert";
        String defaultOcrMyPdfPath = isDocker ? "/opt/venv/bin/ocrmypdf" : "ocrmypdf";
        String defaultSOfficePath = isDocker ? "/usr/bin/soffice" : "soffice";

        Operations operations = customPaths.getOperations();
        this.weasyPrintPath =
                resolvePath(
                        defaultWeasyPrintPath,
                        operations != null ? operations.getWeasyprint() : null);
        this.unoConvertPath =
                resolvePath(
                        defaultUnoConvertPath,
                        operations != null ? operations.getUnoconvert() : null);
        this.calibrePath =
                resolvePath(
                        defaultCalibrePath, operations != null ? operations.getCalibre() : null);
        this.ocrMyPdfPath =
                resolvePath(
                        defaultOcrMyPdfPath, operations != null ? operations.getOcrmypdf() : null);
        this.sOfficePath =
                resolvePath(
                        defaultSOfficePath, operations != null ? operations.getSoffice() : null);

        // Initialize Tesseract binary path
        // Priority: config setting > bundled binary shipped with the app > PATH lookup
        this.tesseractPath =
                resolveTesseractPath(operations != null ? operations.getTesseract() : null);

        // Initialize Tesseract data path
        // Priority: config setting > TESSDATA_PREFIX env var > bundled tessdata > default path
        String tessPath = system.getTessdataDir();
        String tessdataPrefix = java.lang.System.getenv("TESSDATA_PREFIX");

        if (tessPath != null && !tessPath.isEmpty()) {
            this.tessDataPath = tessPath;
        } else if (tessdataPrefix != null && !tessdataPrefix.isEmpty()) {
            this.tessDataPath = tessdataPrefix;
        } else {
            this.tessDataPath =
                    findBundledPath(TESSDATA_DIR_NAME)
                            .map(Path::toString)
                            .orElse(DEFAULT_LINUX_TESSDATA_PATH);
        }

        log.info("Using Tesseract binary: {}", this.tesseractPath);
        log.info("Using Tesseract data path: {}", this.tessDataPath);

        ApplicationProperties.ProcessExecutor processExecutor = properties.getProcessExecutor();
        int libreOfficeLimit = 1;
        if (processExecutor != null && processExecutor.getSessionLimit() != null) {
            libreOfficeLimit = processExecutor.getSessionLimit().getLibreOfficeSessionLimit();
        }
        this.unoServerEndpoints = buildUnoServerEndpoints(processExecutor, libreOfficeLimit);
        ProcessExecutor.setUnoServerPool(new UnoServerPool(this.unoServerEndpoints));
    }

    private String resolvePath(String defaultPath, String customPath) {
        return StringUtils.isNotBlank(customPath) ? customPath : defaultPath;
    }

    /**
     * Resolves the Tesseract executable. Desktop installers ship their own copy so the user does
     * not have to install Tesseract separately; everything else (Docker images, distro packages,
     * developer machines) keeps relying on a PATH lookup.
     */
    private String resolveTesseractPath(String customPath) {
        if (StringUtils.isNotBlank(customPath)) {
            return customPath;
        }
        String executable = isWindows() ? "tesseract.exe" : "tesseract";
        return findBundledPath(TESSERACT_BUNDLE_DIR + "/" + executable)
                .map(Path::toString)
                .orElse(TESSERACT_COMMAND);
    }

    /**
     * Locates a file or directory bundled alongside the application.
     *
     * @return the first candidate that exists on disk, or empty when nothing is bundled
     */
    private static Optional<Path> findBundledPath(String relativePath) {
        return findBundledPath(bundleRoots(), relativePath);
    }

    /**
     * The search itself, kept separate from {@link #bundleRoots()} so it can be exercised against a
     * simulated install layout rather than whatever directory the tests happen to run from.
     */
    static Optional<Path> findBundledPath(List<Path> roots, String relativePath) {
        for (Path root : roots) {
            try {
                Path candidate = root.resolve(relativePath);
                if (Files.exists(candidate)) {
                    return Optional.of(candidate.toAbsolutePath().normalize());
                }
            } catch (InvalidPathException | SecurityException e) {
                log.debug("Skipping bundle root {} while looking for {}", root, relativePath, e);
            }
        }
        return Optional.empty();
    }

    /**
     * Candidate directories a bundled resource may sit in.
     *
     * <p>Spring Boot's {@link ApplicationHome} does the hard part: for an executable JAR it reports
     * the directory holding that JAR, handling the nested class loader that makes {@code
     * getCodeSource()} unusable here. The desktop bundler puts the JAR in {@code <root>/libs} and
     * the bundled tools in {@code <root>}, so the home directory's parent is probed as well.
     */
    private static List<Path> bundleRoots() {
        List<Path> roots = new ArrayList<>();
        // Explicit configuration first: an operator who set a base path meant it.
        roots.add(Path.of(InstallationPathConfig.getPath()));
        applicationHome()
                .ifPresent(
                        dir -> {
                            roots.add(dir);
                            Path parent = dir.getParent();
                            if (parent != null) {
                                roots.add(parent);
                            }
                        });
        return roots;
    }

    private static Optional<Path> applicationHome() {
        try {
            File dir = new ApplicationHome(RuntimePathConfig.class).getDir();
            return Optional.ofNullable(dir).map(File::toPath);
        } catch (RuntimeException e) {
            // Never worth failing startup over: without a home directory the lookup simply falls
            // through to the configured base path and then to a PATH lookup.
            log.debug("Could not determine the application home directory", e);
            return Optional.empty();
        }
    }

    private static boolean isWindows() {
        return java.lang.System.getProperty("os.name", "")
                .toLowerCase(Locale.ROOT)
                .contains("windows");
    }

    private List<String> resolveWatchedFolderPaths(
            String defaultPath, List<String> watchedFoldersDirs, String legacyWatchedFolder) {
        List<String> rawPaths = new ArrayList<>();

        // Collect paths from new config
        if (watchedFoldersDirs != null && !watchedFoldersDirs.isEmpty()) {
            rawPaths.addAll(watchedFoldersDirs);
        }
        // Fall back to legacy config
        else if (StringUtils.isNotBlank(legacyWatchedFolder)) {
            rawPaths.add(legacyWatchedFolder);
        }
        // Fall back to default
        else {
            rawPaths.add(defaultPath);
        }

        // Validate, normalize, and deduplicate paths
        List<String> validatedPaths = validateAndNormalizePaths(rawPaths);

        // Ensure we have at least one valid path (critical for system to function)
        if (validatedPaths.isEmpty()) {
            log.warn(
                    "No valid watched folder paths configured, falling back to default: {}",
                    defaultPath);
            validatedPaths.add(defaultPath);
        }

        // Detect overlapping paths (warning only, not blocking)
        detectOverlappingPaths(validatedPaths);

        return validatedPaths;
    }

    private List<String> sanitizePathList(List<String> paths) {
        if (paths == null || paths.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> sanitized = new ArrayList<>();
        for (String path : paths) {
            if (StringUtils.isNotBlank(path)) {
                sanitized.add(path.trim());
            }
        }
        return sanitized;
    }

    private List<String> validateAndNormalizePaths(List<String> paths) {
        Set<String> normalizedPaths = new LinkedHashSet<>(); // Preserves order, prevents duplicates

        for (String pathStr : paths) {
            if (StringUtils.isBlank(pathStr)) {
                continue;
            }

            try {
                // Normalize to absolute path
                Path path = Path.of(pathStr.trim()).toAbsolutePath().normalize();
                String normalizedPath = path.toString();

                // Check for duplicates
                if (normalizedPaths.contains(normalizedPath)) {
                    log.debug("Skipping duplicate watched folder path: {}", pathStr);
                    continue;
                }

                normalizedPaths.add(normalizedPath);
                log.info("Registered watched folder path: {}", normalizedPath);

            } catch (InvalidPathException e) {
                log.error(
                        "Invalid watched folder path '{}' - skipping: {}", pathStr, e.getMessage());
            }
        }

        return new ArrayList<>(normalizedPaths);
    }

    private void detectOverlappingPaths(List<String> paths) {
        for (int i = 0; i < paths.size(); i++) {
            Path path1 = Path.of(paths.get(i));
            for (int j = i + 1; j < paths.size(); j++) {
                Path path2 = Path.of(paths.get(j));

                // Check if one path is a parent of the other
                if (path1.startsWith(path2)) {
                    log.warn(
                            "Watched folder path '{}' is nested inside '{}' - this may cause duplicate processing",
                            path1,
                            path2);
                } else if (path2.startsWith(path1)) {
                    log.warn(
                            "Watched folder path '{}' is nested inside '{}' - this may cause duplicate processing",
                            path2,
                            path1);
                }
            }
        }
    }

    private void validatePipelinePaths() {
        try {
            Path finishedPath = Path.of(pipelineFinishedFoldersPath).toAbsolutePath().normalize();

            for (String watchedPathStr : pipelineWatchedFoldersPaths) {
                Path watchedPath = Path.of(watchedPathStr).toAbsolutePath().normalize();

                // Check if watched folder is same as finished folder
                if (watchedPath.equals(finishedPath)) {
                    log.error(
                            "CRITICAL: Watched folder '{}' is the same as finished folder '{}' - this will cause processing loops!",
                            watchedPath,
                            finishedPath);
                }
                // Check if watched folder contains finished folder
                else if (finishedPath.startsWith(watchedPath)) {
                    log.warn(
                            "Finished folder '{}' is nested inside watched folder '{}' - this may cause issues",
                            finishedPath,
                            watchedPath);
                }
                // Check if finished folder contains watched folder
                else if (watchedPath.startsWith(finishedPath)) {
                    log.error(
                            "CRITICAL: Watched folder '{}' is nested inside finished folder '{}' - this will cause processing loops!",
                            watchedPath,
                            finishedPath);
                }
            }
        } catch (Exception e) {
            log.error("Error validating pipeline paths: {}", e.getMessage());
        }
    }

    private boolean isRunningInDocker() {
        return Files.exists(Path.of("/.dockerenv"));
    }

    private List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> buildUnoServerEndpoints(
            ApplicationProperties.ProcessExecutor processExecutor, int sessionLimit) {
        if (processExecutor == null) {
            log.warn("ProcessExecutor config missing; defaulting to a single UNO endpoint.");
            return Collections.singletonList(
                    new ApplicationProperties.ProcessExecutor.UnoServerEndpoint());
        }
        if (!processExecutor.isAutoUnoServer()) {
            List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> configured =
                    sanitizeUnoServerEndpoints(processExecutor.getUnoServerEndpoints());
            if (!configured.isEmpty()) {
                // Warn if manual endpoint count doesn't match sessionLimit
                if (configured.size() != sessionLimit) {
                    log.warn(
                            "Manual UNO endpoint count ({}) differs from libreOfficeSessionLimit ({}). "
                                    + "Concurrency will be limited by endpoint count, not sessionLimit.",
                            configured.size(),
                            sessionLimit);
                }
                return configured;
            }
            log.warn(
                    "autoUnoServer disabled but no unoServerEndpoints configured; defaulting to 127.0.0.1:2003.");
            return Collections.singletonList(
                    new ApplicationProperties.ProcessExecutor.UnoServerEndpoint());
        }
        int count = sessionLimit > 0 ? sessionLimit : 1;
        return buildAutoUnoServerEndpoints(count);
    }

    private List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint>
            buildAutoUnoServerEndpoints(int count) {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints = new ArrayList<>();
        int basePort = 2003;
        for (int i = 0; i < count; i++) {
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint =
                    new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
            endpoint.setHost("127.0.0.1");
            endpoint.setPort(basePort + (i * 2));
            endpoints.add(endpoint);
        }
        return endpoints;
    }

    private List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint>
            sanitizeUnoServerEndpoints(
                    List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints) {
        if (endpoints == null || endpoints.isEmpty()) {
            return Collections.emptyList();
        }
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> sanitized = new ArrayList<>();
        for (ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint : endpoints) {
            if (endpoint == null) {
                continue;
            }
            String host = endpoint.getHost();
            int port = endpoint.getPort();
            if (host == null || host.isBlank() || port <= 0) {
                continue;
            }
            sanitized.add(endpoint);
        }
        return sanitized;
    }
}
