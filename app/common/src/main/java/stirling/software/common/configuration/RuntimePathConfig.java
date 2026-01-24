package stirling.software.common.configuration;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

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
        if (watchedFoldersDirs != null && !watchedFoldersDirs.isEmpty()) {
            return watchedFoldersDirs;
        }
        if (StringUtils.isNotBlank(legacyWatchedFolder)) {
            return List.of(legacyWatchedFolder);
        }
        return List.of(defaultPath);
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
