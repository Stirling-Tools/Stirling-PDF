package stirling.software.SPDF.model.api.converters;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import jakarta.ws.rs.core.Response;

import stirling.software.common.pdf.PdfMarkdownConverter;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.jpdfium.PdfDocument;

/**
 * MIGRATION (Spring -> Quarkus): {@code ConvertPDFToMarkdown} is a JAX-RS resource returning {@link
 * Response}; the handler binds a RESTEasy Reactive {@code FileUpload} (stubbed via {@link
 * TestFileUploads}) and the {@code TempFile} now takes a {@code TempFileManager} (intercepted by
 * the existing {@code MockedConstruction<TempFile>}, so a {@code null} manager is fine).
 *
 * <p>The former MockMvc + {@code @RestControllerAdvice} setup is dropped: the success path is read
 * straight off {@code Response} (status / content-type / body bytes), and the error path - which
 * the controller propagates rather than mapping to 500 itself - is asserted with {@code
 * assertThrows}.
 */
class ConvertPDFToMarkdownTest {

    @Test
    void pdfToMarkdownReturnsMarkdownBytes() throws Exception {
        byte[] md = "# heading\n\ncontent\n".getBytes(StandardCharsets.UTF_8);
        String expectedMd = "# heading\n\ncontent\n";

        File tmpFile = File.createTempFile("test", ".pdf");
        tmpFile.deleteOnExit();

        try (MockedConstruction<TempFile> tempMock =
                        Mockito.mockConstruction(
                                TempFile.class,
                                (mock, ctx) -> {
                                    when(mock.getFile()).thenReturn(tmpFile);
                                    when(mock.getPath()).thenReturn(tmpFile.toPath());
                                });
                MockedStatic<PdfDocument> docStatic = Mockito.mockStatic(PdfDocument.class);
                MockedConstruction<PdfMarkdownConverter> converterMock =
                        Mockito.mockConstruction(
                                PdfMarkdownConverter.class,
                                (mock, ctx) -> when(mock.convert(any())).thenReturn(expectedMd))) {

            PdfDocument mockDoc = Mockito.mock(PdfDocument.class);
            docStatic.when(() -> PdfDocument.open(any(Path.class))).thenReturn(mockDoc);

            FileUpload file =
                    TestFileUploads.of(new byte[] {1, 2, 3}, "input.pdf", "application/pdf");

            ConvertPDFToMarkdown controller = new ConvertPDFToMarkdown(null);
            Response resp = controller.processPdfToMarkdown(file, null);

            assertEquals(200, resp.getStatus());
            assertEquals("text/markdown", resp.getMediaType().toString());
            assertArrayEquals(md, (byte[]) resp.getEntity());
        }
    }

    @Test
    void pdfToMarkdownWhenServiceThrowsReturns500() throws Exception {
        File tmpFile = File.createTempFile("test", ".pdf");
        tmpFile.deleteOnExit();

        try (MockedConstruction<TempFile> tempMock =
                        Mockito.mockConstruction(
                                TempFile.class,
                                (mock, ctx) -> {
                                    when(mock.getFile()).thenReturn(tmpFile);
                                    when(mock.getPath()).thenReturn(tmpFile.toPath());
                                });
                MockedStatic<PdfDocument> docStatic = Mockito.mockStatic(PdfDocument.class);
                MockedConstruction<PdfMarkdownConverter> converterMock =
                        Mockito.mockConstruction(
                                PdfMarkdownConverter.class,
                                (mock, ctx) ->
                                        when(mock.convert(any()))
                                                .thenThrow(new RuntimeException("boom")))) {

            PdfDocument mockDoc = Mockito.mock(PdfDocument.class);
            docStatic.when(() -> PdfDocument.open(any(Path.class))).thenReturn(mockDoc);

            FileUpload file = TestFileUploads.of(new byte[] {0x01}, "x.pdf", "application/pdf");

            ConvertPDFToMarkdown controller = new ConvertPDFToMarkdown(null);

            // The converter failure propagates out of the handler (no controller-level mapping to
            // 500); JAX-RS would surface it as a 500 at the HTTP boundary.
            RuntimeException ex =
                    assertThrows(
                            RuntimeException.class,
                            () -> controller.processPdfToMarkdown(file, null));
            assertEquals("boom", ex.getMessage());
        }
    }
}
