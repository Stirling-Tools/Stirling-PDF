package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mockStatic;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.topdf.OfficeToPdf;

class FileToPdfTest {

    @TempDir Path dir;
    private TempFileManager tempFiles;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().getTempFileManagement().setBaseTmpDir(dir.toString());
        tempFiles = new TempFileManager(new TempFileRegistry(), properties);
    }

    @Test
    void convertsHtmlToPdfAndCleansUpItsTempFiles() throws Exception {
        byte[] html =
                "<html><body><p>Stirling HTML content</p></body></html>"
                        .getBytes(StandardCharsets.UTF_8);

        byte[] pdf = FileToPdf.convertHtmlToPdf(html, Duration.ofMinutes(1), tempFiles);

        try (var document = Loader.loadPDF(pdf)) {
            assertThat(new PDFTextStripper().getText(document)).contains("Stirling HTML content");
        }
        try (var files = Files.walk(dir)) {
            assertThat(files.filter(Files::isRegularFile)).isEmpty();
        }
    }

    @Test
    void rejectsIncompleteOutput() {
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(
                            () ->
                                    OfficeToPdf.convert(
                                            any(Path.class),
                                            any(Path.class),
                                            any(OfficeToPdf.Options.class)))
                    .thenReturn(new OfficeToPdf.Result(1, true, List.of(), false));

            assertThatThrownBy(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            "<p>x</p>".getBytes(StandardCharsets.UTF_8),
                                            Duration.ofMinutes(1),
                                            tempFiles))
                    .isInstanceOf(IOException.class)
                    .hasMessage("Only part of the document could be converted");
        }
    }
}
