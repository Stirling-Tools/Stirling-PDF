package stirling.software.SPDF.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.misc.GrayscaleConversionStrategy;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.doc.PdfColorConverter;

class GrayscaleConversionStrategyTest {

    @TempDir private Path tempDir;

    @Test
    void convertsUploadedPdfToGrayscaleThroughJpdfium() throws Exception {
        byte[] inputBytes = "%PDF-1.4 grayscale input".getBytes(StandardCharsets.UTF_8);
        MultipartFile file =
                new MockMultipartFile("file", "input.pdf", "application/pdf", inputBytes);
        TempFileManager tempFileManager = mock(TempFileManager.class);
        PdfDocument document = mock(PdfDocument.class);
        byte[] outputBytes = "%PDF-1.4 grayscale output".getBytes(StandardCharsets.UTF_8);

        try (var tempFiles =
                        mockConstruction(
                                TempFile.class,
                                (mock, context) -> {
                                    Path realFile = Files.createTempFile(tempDir, "gray", ".pdf");
                                    when(mock.getPath()).thenReturn(realFile);
                                });
                var documents = mockStatic(PdfDocument.class);
                var converter = mockStatic(PdfColorConverter.class)) {
            documents.when(() -> PdfDocument.open(any(Path.class))).thenReturn(document);
            converter.when(() -> PdfColorConverter.toGrayscale(document)).thenReturn(3);
            doAnswer(
                            invocation -> {
                                Files.write(invocation.getArgument(0), outputBytes);
                                return null;
                            })
                    .when(document)
                    .save(any(Path.class));

            GrayscaleConversionStrategy strategy =
                    new GrayscaleConversionStrategy(
                            file, ReplaceAndInvert.GRAYSCALE, tempFileManager);
            InputStreamResource result = strategy.replace();

            assertArrayEquals(
                    outputBytes,
                    result.getInputStream().readAllBytes(),
                    "Expected the saved grayscale bytes to be returned");
            converter.verify(() -> PdfColorConverter.toGrayscale(document));
            verify(document).save(any(Path.class));
        }
    }
}
