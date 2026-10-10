package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.core.io.ClassPathResource;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.util.GeneralUtils;

class ExtractPipelineExamplesTest {

    @Test
    void extractsExamplesAndRemovesOnlyUneditedLegacyCopies(@TempDir Path base) throws Exception {
        Path dir = base.resolve("defaultWebUIConfigs");
        Files.createDirectories(dir);
        try (InputStream in =
                new ClassPathResource("static/pipeline/defaultWebUIConfigs/OCR images.json.example")
                        .getInputStream()) {
            Files.write(dir.resolve("OCR images.json"), in.readAllBytes());
        }
        Files.writeString(dir.resolve("split-rotate-auto-rename.json"), "{\"name\":\"edited\"}");

        try (MockedStatic<InstallationPathConfig> mocked =
                Mockito.mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPipelinePath).thenReturn(base.toString());
            GeneralUtils.extractPipeline();
        }

        assertTrue(Files.isRegularFile(dir.resolve("OCR images.json.example")));
        assertTrue(Files.isRegularFile(dir.resolve("split-rotate-auto-rename.json.example")));
        assertFalse(Files.exists(dir.resolve("OCR images.json")));
        assertTrue(Files.exists(dir.resolve("split-rotate-auto-rename.json")));
    }
}
