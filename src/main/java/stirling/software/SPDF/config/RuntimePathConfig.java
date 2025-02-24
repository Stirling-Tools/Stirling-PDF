package stirling.software.SPDF.config;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.apache.commons.lang3.StringUtils;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.CustomPaths.Operations;
import stirling.software.SPDF.model.ApplicationProperties.CustomPaths.Pipeline;

@Slf4j
@Configuration
@Getter
public class RuntimePathConfig {
    private final ApplicationProperties properties;
    private final String basePath;
    private final String weasyPrintPath;
    private final String unoConvertPath;

    // Pipeline paths
    private final String pipelineWatchedFoldersPath;
    private final String pipelineFinishedFoldersPath;
    private final String pipelineDefaultWebUiConfigs;
    private final String pipelinePath;

    public RuntimePathConfig(ApplicationProperties properties) {
        this.properties = properties;
        this.basePath = InstallationPathConfig.getPath();

        String pipelinePath = basePath + "pipeline" + File.separator;
        String watchedFoldersPath = pipelinePath + "watchedFolders" + File.separator;
        String finishedFoldersPath = pipelinePath + "finishedFolders" + File.separator;
        String webUiConfigsPath = pipelinePath + "defaultWebUIConfigs" + File.separator;

        Pipeline pipeline = properties.getSystem().getCustomPaths().getPipeline();
        if (pipeline != null) {
            if (!StringUtils.isEmpty(pipeline.getWatchedFoldersDir())) {
                watchedFoldersPath = pipeline.getWatchedFoldersDir();
            }
            if (!StringUtils.isEmpty(pipeline.getFinishedFoldersDir())) {
                finishedFoldersPath = pipeline.getFinishedFoldersDir();
            }
            if (!StringUtils.isEmpty(pipeline.getWebUIConfigsDir())) {
                webUiConfigsPath = pipeline.getWebUIConfigsDir();
            }
        }

        this.pipelinePath = pipelinePath;
        this.pipelineWatchedFoldersPath = watchedFoldersPath;
        this.pipelineFinishedFoldersPath = finishedFoldersPath;
        this.pipelineDefaultWebUiConfigs = webUiConfigsPath;

        boolean isDocker = isRunningInDocker();

        // Initialize Operation paths
        String weasyPrintPath = isDocker ? "/opt/venv/bin/weasyprint" : "weasyprint";
        String unoConvertPath = isDocker ? "/opt/venv/bin/unoconvert" : "unoconvert";


        // Check for custom operation paths
        Operations operations = properties.getSystem().getCustomPaths().getOperations();
        if (operations != null) {
            if (!StringUtils.isEmpty(operations.getWeasyprint())) {
                weasyPrintPath = operations.getWeasyprint();
            }
            if (!StringUtils.isEmpty(operations.getUnoconvert())) {
                unoConvertPath = operations.getUnoconvert();
            }
        }

        // Assign operations final fields
        this.weasyPrintPath = weasyPrintPath;
        this.unoConvertPath = unoConvertPath;
    }

    private boolean isRunningInDocker() {
        return Files.exists(Paths.get("/.dockerenv"));
    }

}
