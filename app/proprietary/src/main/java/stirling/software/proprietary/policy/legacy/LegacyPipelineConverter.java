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
 * Reads a legacy pipeline JSON and translates it into the pieces a {@code Policy} is built from:
 * ordered {@link PipelineStep}s, a destination directory, and an output naming pattern.
 *
 * <p>Two deliberate departures from the legacy runner, both fixing behaviour that was broken rather
 * than relied upon: {@code {folderName}} expands to the watched folder's own name (the legacy
 * runner substituted its full path and then string-stripped {@code watchedFolders} out of the
 * middle, which produced a mangled path for any absolute location), and an output pattern that
 * already carries an extension keeps it instead of having the real one appended after it (the
 * legacy runner turned {@code pre_publish_{filename}.PDF} into {@code pre_publish_x.PDF.pdf}).
 */
@Component
@RequiredArgsConstructor
public class LegacyPipelineConverter {

    /**
     * The legacy marker for "the files come from the pipeline itself". It named a multipart file
     * field, so carrying it over as a scalar form field would corrupt the request.
     */
    private static final String LEGACY_FILE_INPUT_PARAMETER = "fileInput";

    static final String OUTPUT_FOLDER_TOKEN = "{outputFolder}";
    static final String FOLDER_NAME_TOKEN = "{folderName}";
    static final String PIPELINE_NAME_TOKEN = "{pipelineName}";

    private final ObjectMapper objectMapper;
    private final RuntimePathConfig runtimePathConfig;

    /** Parse a legacy config file. Throws {@link IOException} if unreadable or malformed. */
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
     * The directory a watched folder's results are written to. {@code {outputFolder}} is the
     * configured finished-folders location and {@code {folderName}} the watched folder's own name;
     * a relative result is resolved under the finished-folders location so a run can never write
     * into the server's working directory.
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
     * The config's output naming pattern with {@code {pipelineName}} already substituted, since it
     * is fixed for a given pipeline; {@code {filename}}, {@code {date}} and {@code {time}} stay for
     * the sink to expand per file. Null when the config names outputs the default way.
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

    /** A pipeline name safe to embed in a filename. */
    private static String safeName(String name) {
        if (name == null || name.isBlank()) {
            return "pipeline";
        }
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }
}
