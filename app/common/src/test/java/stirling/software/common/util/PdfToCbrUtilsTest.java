package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

@ExtendWith(MockitoExtension.class)
class PdfToCbrUtilsTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Test
    void convertPdfToCbr_nullFileThrowsException() {
        assertThrows(
                IllegalArgumentException.class,
                () -> PdfToCbrUtils.convertPdfToCbr(null, 150, pdfDocumentFactory));
    }

    @Test
    void convertPdfToCbr_emptyFileThrowsException() {
        MockMultipartFile emptyFile =
                new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]);

        assertThrows(
                IllegalArgumentException.class,
                () -> PdfToCbrUtils.convertPdfToCbr(emptyFile, 150, pdfDocumentFactory));
    }

    @Test
    void convertPdfToCbr_filenameMissingThrowsException() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getOriginalFilename()).thenReturn(null);

        assertThrows(
                IllegalArgumentException.class,
                () -> PdfToCbrUtils.convertPdfToCbr(file, 150, pdfDocumentFactory));
    }

    @Test
    void convertPdfToCbr_nonPdfExtensionThrowsException() {
        MockMultipartFile nonPdfFile =
                new MockMultipartFile(
                        "file",
                        "document.txt",
                        "text/plain",
                        "content".getBytes(StandardCharsets.UTF_8));

        assertThrows(
                IllegalArgumentException.class,
                () -> PdfToCbrUtils.convertPdfToCbr(nonPdfFile, 150, pdfDocumentFactory));
    }

    @Test
    void convertPdfToCbr_pdfWithNoPagesThrowsException() throws IOException {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "file",
                        "test.pdf",
                        "application/pdf",
                        "data".getBytes(StandardCharsets.UTF_8));

        PDDocument emptyDocument = new PDDocument();
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(emptyDocument);

        try {
            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> PdfToCbrUtils.convertPdfToCbr(pdfFile, 150, pdfDocumentFactory));
            assertEquals("PDF file contains no pages", exception.getMessage());
        } finally {
            emptyDocument.close();
        }
    }

    @Test
    void convertPdfToCbr_successfulConversionReturnsBytes() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "file",
                        "test.pdf",
                        "application/pdf",
                        "data".getBytes(StandardCharsets.UTF_8));

        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(document);

        ProcessExecutor mockExecutor = mock(ProcessExecutor.class);
        ProcessExecutorResult mockResult = mock(ProcessExecutorResult.class);

        try (MockedStatic<ProcessExecutor> mockedStatic = mockStatic(ProcessExecutor.class)) {
            mockedStatic
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.INSTALL_APP))
                    .thenReturn(mockExecutor);

            when(mockExecutor.runCommandWithOutputHandling(anyList(), any(File.class)))
                    .thenAnswer(
                            invocation -> {
                                File workingDirectory = invocation.getArgument(1);
                                File rarFile = new File(workingDirectory, "output.cbr");
                                Files.write(
                                        rarFile.toPath(),
                                        "cbr-content".getBytes(StandardCharsets.UTF_8));
                                return mockResult;
                            });
            when(mockResult.getRc()).thenReturn(0);

            byte[] result = PdfToCbrUtils.convertPdfToCbr(pdfFile, 72, pdfDocumentFactory);
            assertNotNull(result);
            assertEquals("cbr-content", new String(result, StandardCharsets.UTF_8));
        } finally {
            document.close();
        }
    }

    @Test
    void convertPdfToCbr_rarCommandFailureThrowsIOException() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "file",
                        "test.pdf",
                        "application/pdf",
                        "data".getBytes(StandardCharsets.UTF_8));

        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(document);

        ProcessExecutor mockExecutor = mock(ProcessExecutor.class);
        ProcessExecutorResult mockResult = mock(ProcessExecutorResult.class);

        try (MockedStatic<ProcessExecutor> mockedStatic = mockStatic(ProcessExecutor.class)) {
            mockedStatic
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.INSTALL_APP))
                    .thenReturn(mockExecutor);

            when(mockExecutor.runCommandWithOutputHandling(anyList(), any(File.class)))
                    .thenReturn(mockResult);
            when(mockResult.getRc()).thenReturn(1);

            IOException exception =
                    assertThrows(
                            IOException.class,
                            () -> PdfToCbrUtils.convertPdfToCbr(pdfFile, 72, pdfDocumentFactory));
            assertTrue(exception.getMessage().contains("RAR command failed"));
        } finally {
            document.close();
        }
    }

    @Test
    void isPdfFile_returnsTrueForPdfExtension() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("document.PDF");

        assertTrue(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_returnsFalseWhenFilenameMissing() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn(null);

        assertFalse(PdfToCbrUtils.isPdfFile(file));
    }

    @Test
    void isPdfFile_returnsFalseForNonPdfExtension() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("image.png");

        assertFalse(PdfToCbrUtils.isPdfFile(file));
    }
}
