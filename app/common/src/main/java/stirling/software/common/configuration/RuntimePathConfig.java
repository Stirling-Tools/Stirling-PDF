package stirling.software.common.configuration;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;
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
    private final ApplicationProperties properties;
    private final String basePath;

    // Operation paths
    private final String weasyPrintPath;
    private final String unoConvertPath;
    private final String calibrePath;
    private final String ocrMyPdfPath;
    private final String sOfficePath;

    // Tesseract data path
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
        String defaultUnoConvertPath = isDocker ? "/opt/venv/bin/unoconvert" : "unoconvert";
        String defaultCalibrePath = isDocker ? "/opt/calibre/ebook-convert" : "ebook-convert";
        String defaultOcrMyPdfPath = isDocker ? "/usr/bin/ocrmypdf" : "ocrmypdf";
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

        // Initialize Tesseract data path
        // Priority: config setting > TESSDATA_PREFIX env var > default path
        String tessPath = system.getTessdataDir();
        String tessdataPrefix = java.lang.System.getenv("TESSDATA_PREFIX");
        String defaultPath = "/usr/share/tesseract-ocr/5/tessdata";

        if (tessPath != null && !tessPath.isEmpty()) {
            this.tessDataPath = tessPath;
        } else if (tessdataPrefix != null && !tessdataPrefix.isEmpty()) {
            this.tessDataPath = tessdataPrefix;
        } else {
            this.tessDataPath = defaultPath;
        }

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
                Path path = Paths.get(pathStr.trim()).toAbsolutePath().normalize();
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
            Path path1 = Paths.get(paths.get(i));
            for (int j = i + 1; j < paths.size(); j++) {
                Path path2 = Paths.get(paths.get(j));

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
            Path finishedPath = Paths.get(pipelineFinishedFoldersPath).toAbsolutePath().normalize();

            for (String watchedPathStr : pipelineWatchedFoldersPaths) {
                Path watchedPath = Paths.get(watchedPathStr).toAbsolutePath().normalize();

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
