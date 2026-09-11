package stirling.software.proprietary.policy.legacy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.proprietary.policy.model.PipelineStep;

import tools.jackson.databind.ObjectMapper;

/**
 * Reads a legacy pipeline JSON into the pieces a {@code Policy} is built from: ordered {@link
 * PipelineStep}s, a destination directory, and an output naming pattern.
 */
@Component
@RequiredArgsConstructor
public class LegacyPipelineConverter {

    /** Legacy marker naming a multipart field; sent as a form value it corrupts the request. */
    private static final String LEGACY_FILE_INPUT_PARAMETER = "fileInput";

    static final String OUTPUT_FOLDER_TOKEN = "{outputFolder}";
    static final String FOLDER_NAME_TOKEN = "{folderName}";
    static final String PIPELINE_NAME_TOKEN = "{pipelineName}";

    private final ObjectMapper objectMapper;
    private final RuntimePathConfig runtimePathConfig;

    public LegacyPipelineConfig read(Path jsonFile) throws IOException {
        return objectMapper.readValue(
                Files.readString(jsonFile, java.nio.charset.StandardCharsets.UTF_8),
                LegacyPipelineConfig.class);
    }

    /** The config's operations as engine steps, minus the legacy file-input marker. */
    public List<PipelineStep> toSteps(LegacyPipelineConfig config) {
        List<PipelineStep> steps = new ArrayList<>();
        for (LegacyPipelineConfig.LegacyOperation operation : config.operations()) {
            if (operation == null || operation.operation() == null) {
                continue;
            }
            Map<String, Object> parameters = new LinkedHashMap<>(operation.parameters());
            parameters.remove(LEGACY_FILE_INPUT_PARAMETER);
            steps.add(new PipelineStep(operation.operation(), parameters));
        }
        return steps;
    }

    /**
     * Where results are written. {@code {folderName}} is the folder's own name; the legacy runner
     * used its full path and produced mangled output paths.
     */
    public Path resolveOutputDirectory(LegacyPipelineConfig config, Path watchedDir) {
        String finishedFolders = runtimePathConfig.getPipelineFinishedFoldersPath();
        String configured = config.outputDir();
        if (configured == null || configured.isBlank() || config.returnsToCaller()) {
            return Path.of(finishedFolders);
        }
        Path folderName = watchedDir.getFileName();
        String expanded =
                configured
                        .replace(OUTPUT_FOLDER_TOKEN, finishedFolders)
                        .replace(
                                FOLDER_NAME_TOKEN, folderName == null ? "" : folderName.toString());
        Path resolved = Path.of(expanded).normalize();
        return resolved.isAbsolute() ? resolved : Path.of(finishedFolders).resolve(resolved);
    }

    /**
     * The naming pattern with {@code {pipelineName}} already substituted (it is fixed per
     * pipeline); the per-file tokens stay for the sink. Null when outputs keep their own names.
     */
    public String resolveFilenamePattern(LegacyPipelineConfig config) {
        String pattern = config.outputFileName();
        if (pattern == null || pattern.isBlank()) {
            return null;
        }
        String resolved = pattern.replace(PIPELINE_NAME_TOKEN, safeName(config.name()));
        // "{filename}" alone reproduces the input name, which is what the sink does anyway.
        return "{filename}".equals(resolved.trim()) ? null : resolved;
    }

    private static String safeName(String name) {
        if (name == null || name.isBlank()) {
            return "pipeline";
        }
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }
}
