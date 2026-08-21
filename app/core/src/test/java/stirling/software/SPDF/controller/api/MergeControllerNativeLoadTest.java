package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;

/**
 * Merging depends on JPDFium's native library. When those natives cannot be loaded the JVM raises
 * an ExceptionInInitializerError, which is an Error rather than an Exception - so every
 * catch(Exception) guard around PdfDocument.open() lets it through and the request fails with an
 * opaque 500 and a null message.
 */
class MergeControllerNativeLoadTest {

    private MergeController mergeController;
    private TempFileManager tempFileManager;
    private byte[] pdfBytes;

    @BeforeEach
    void setUp() throws Exception {
        CustomPDFDocumentFactory factory = org.mockito.Mockito.mock(CustomPDFDocumentFactory.class);
        tempFileManager = org.mockito.Mockito.mock(TempFileManager.class);
        when(tempFileManager.createTempFile(any()))
                .thenAnswer(inv -> Files.createTempFile("merge-native", ".pdf").toFile());
        when(tempFileManager.convertMultipartFileToFile(any(MultipartFile.class)))
                .thenAnswer(
                        inv -> {
                            MultipartFile mf = inv.getArgument(0);
                            Path p = Files.createTempFile("merge-native-in", ".pdf");
                            Files.write(p, mf.getBytes());
                            return p.toFile();
                        });
        mergeController = new MergeController(factory, tempFileManager);

        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }
    }

    @Test
    @DisplayName("Reports a readable error when the JPDFium natives cannot be loaded")
    void reportsReadableErrorWhenNativesUnavailable() throws Exception {
        MergePdfsRequest request = new MergePdfsRequest();
        request.setFileInput(
                new MultipartFile[] {
                    new MockMultipartFile(
                            "fileInput", "a.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes),
                    new MockMultipartFile(
                            "fileInput", "b.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes)
                });

        try (MockedStatic<PdfDocument> natives = mockStatic(PdfDocument.class)) {
            natives.when(() -> PdfDocument.open(any(Path.class)))
                    .thenThrow(
                            new ExceptionInInitializerError(
                                    new RuntimeException("Failed to load native library")));

            Throwable thrown =
                    assertThrows(Throwable.class, () -> mergeController.mergePdfs(request, null));

            assertInstanceOf(
                    IOException.class,
                    thrown,
                    "a native-load failure must surface as a handled IOException, not a raw Error");
            assertTrue(
                    thrown.getMessage() != null && !thrown.getMessage().isBlank(),
                    "the failure must carry a message the caller can act on");
        }
    }

    @Test
    @DisplayName("Cleans up the temp output when the natives cannot be loaded")
    void doesNotLeakTempFilesWhenNativesUnavailable() throws Exception {
        MergePdfsRequest request = new MergePdfsRequest();
        request.setFileInput(
                new MultipartFile[] {
                    new MockMultipartFile(
                            "fileInput", "a.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes)
                });

        try (MockedStatic<PdfDocument> natives = mockStatic(PdfDocument.class)) {
            natives.when(() -> PdfDocument.open(any(Path.class)))
                    .thenThrow(
                            new ExceptionInInitializerError(
                                    new RuntimeException("Failed to load native library")));

            assertThrows(IOException.class, () -> mergeController.mergePdfs(request, null));
        }

        org.mockito.Mockito.verify(tempFileManager, org.mockito.Mockito.atLeastOnce())
                .deleteTempFile(any(File.class));
    }
}
