package stirling.software.proprietary.policy.legacy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.proprietary.policy.model.PipelineStep;

import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link LegacyPipelineConverter}: legacy JSON parses into engine steps without the
 * legacy file-input marker, and the output templates resolve to a directory and naming pattern.
 */
class LegacyPipelineConverterTest {

    private static final String FINISHED = Path.of("/var/finished").toString();

    private final RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
    private final LegacyPipelineConverter converter =
            new LegacyPipelineConverter(JsonMapper.builder().build(), runtimePathConfig);

    @Test
    void readsOperationsAndDropsTheLegacyFileInputMarker(@TempDir Path dir) throws IOException {
        Path config =
                write(
                        dir,
                        """
                        {
                          "name": "Split and rotate",
                          "pipeline": [
                            {
                              "operation": "/api/v1/general/rotate-pdf",
                              "parameters": {"angle": 90, "fileInput": "automated"}
                            },
                            {
                              "operation": "/api/v1/misc/auto-rename",
                              "parameters": {"useFirstTextAsFallback": false}
                            }
                          ],
                          "outputDir": "{outputFolder}",
                          "outputFileName": "{filename}"
                        }
                        """);

        LegacyPipelineConfig parsed = converter.read(config);
        List<PipelineStep> steps = converter.toSteps(parsed);

        assertEquals("Split and rotate", parsed.name());
        assertEquals(2, steps.size());
        assertEquals("/api/v1/general/rotate-pdf", steps.get(0).operation());
        assertEquals(90, steps.get(0).parameters().get("angle"));
        assertFalse(
                steps.get(0).parameters().containsKey("fileInput"),
                "the legacy file-input marker names a multipart field, not a form value");
        assertEquals(false, steps.get(1).parameters().get("useFirstTextAsFallback"));
    }

    @Test
    void expandsTheOutputFolderToken(@TempDir Path dir) throws IOException {
        when(runtimePathConfig.getPipelineFinishedFoldersPath()).thenReturn(FINISHED);
        LegacyPipelineConfig config = converter.read(write(dir, outputConfig("{outputFolder}")));

        assertEquals(Path.of(FINISHED), converter.resolveOutputDirectory(config, dir));
    }

    @Test
    void expandsFolderNameToTheWatchedFoldersOwnName(@TempDir Path dir) throws IOException {
        when(runtimePathConfig.getPipelineFinishedFoldersPath()).thenReturn(FINISHED);
        LegacyPipelineConfig config =
                converter.read(write(dir, outputConfig("{outputFolder}/{folderName}")));

        Path watched = dir.resolve("invoices");
        assertEquals(
                Path.of(FINISHED).resolve("invoices"),
                converter.resolveOutputDirectory(config, watched));
    }

    @Test
    void sendsReturnToCallerConfigsToTheFinishedFolder(@TempDir Path dir) throws IOException {
        when(runtimePathConfig.getPipelineFinishedFoldersPath()).thenReturn(FINISHED);
        LegacyPipelineConfig config = converter.read(write(dir, outputConfig("httpWebRequest")));

        // A watched folder has no caller to return results to.
        assertEquals(Path.of(FINISHED), converter.resolveOutputDirectory(config, dir));
    }

    @Test
    void resolvesRelativeOutputDirectoriesUnderTheFinishedFolder(@TempDir Path dir)
            throws IOException {
        when(runtimePathConfig.getPipelineFinishedFoldersPath()).thenReturn(FINISHED);
        LegacyPipelineConfig config = converter.read(write(dir, outputConfig("archive")));

        assertEquals(
                Path.of(FINISHED).resolve("archive"),
                converter.resolveOutputDirectory(config, dir));
    }

    @Test
    void substitutesThePipelineNameButLeavesPerFileTokens(@TempDir Path dir) throws IOException {
        LegacyPipelineConfig config =
                converter.read(
                        write(
                                dir,
                                """
                                {
                                  "name": "Nightly OCR",
                                  "pipeline": [{"operation": "/api/v1/misc/ocr-pdf"}],
                                  "outputDir": "{outputFolder}",
                                  "outputFileName": "{filename}-{pipelineName}-{date}-{time}"
                                }
                                """));

        assertEquals(
                "{filename}-Nightly OCR-{date}-{time}", converter.resolveFilenamePattern(config));
    }

    @Test
    void treatsThePassThroughPatternAsNoPattern(@TempDir Path dir) throws IOException {
        LegacyPipelineConfig config = converter.read(write(dir, outputConfig("{outputFolder}")));

        assertNull(converter.resolveFilenamePattern(config));
    }

    @Test
    void convertsARealWorldConfigIncludingItsListParameter(@TempDir Path dir) throws IOException {
        // A representative legacy config: nested list parameter, extra keys, the fileInput marker.
        LegacyPipelineConfig config =
                converter.read(
                        write(
                                dir,
                                """
                                {
                                  "name": "OCR images",
                                  "pipeline": [
                                    {
                                      "operation": "/api/v1/convert/img/pdf",
                                      "parameters": {
                                        "fitOption": "fillPage",
                                        "autoRotate": true,
                                        "fileInput": "automated"
                                      }
                                    },
                                    {
                                      "operation": "/api/v1/misc/ocr-pdf",
                                      "parameters": {
                                        "languages": ["eng"],
                                        "ocrType": "skip-text",
                                        "fileInput": "automated"
                                      }
                                    }
                                  ],
                                  "_examples": {"outputDir": "{outputFolder}/{folderName}"},
                                  "outputDir": "{outputFolder}",
                                  "outputFileName": "{filename}"
                                }
                                """));

        List<PipelineStep> steps = converter.toSteps(config);

        assertEquals(2, steps.size());
        assertEquals(List.of("eng"), steps.get(1).parameters().get("languages"));
        assertEquals("skip-text", steps.get(1).parameters().get("ocrType"));
        assertFalse(steps.get(1).parameters().containsKey("fileInput"));
        assertNull(converter.resolveFilenamePattern(config));
    }

    private static String outputConfig(String outputDir) {
        return """
               {
                 "name": "Example",
                 "pipeline": [{"operation": "/api/v1/misc/repair", "parameters": {}}],
                 "outputDir": "%s",
                 "outputFileName": "{filename}"
               }
               """
                .formatted(outputDir);
    }

    private static Path write(Path dir, String json) throws IOException {
        Path file = dir.resolve("config.json");
        Files.writeString(file, json);
        return file;
    }
}
