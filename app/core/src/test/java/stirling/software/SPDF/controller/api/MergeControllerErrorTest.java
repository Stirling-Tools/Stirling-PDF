package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;

import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.exception.JPDFiumException;
import stirling.software.jpdfium.exception.PdfCorruptException;
import stirling.software.jpdfium.exception.PdfPasswordException;

class MergeControllerErrorTest {
    private MergeController controller;

    @BeforeEach
    void setUp() {
        controller =
                new MergeController(
                        mock(CustomPDFDocumentFactory.class),
                        new TempFileManager(new TempFileRegistry(), new ApplicationProperties()));
    }

    @Test
    void unexpectedOpenFailureIsNotReportedAsCorruption() {
        JPDFiumException failure = new JPDFiumException("disk full");
        try (MockedStatic<PdfDocument> pdf = mockStatic(PdfDocument.class)) {
            pdf.when(() -> PdfDocument.open(any(Path.class))).thenThrow(failure);
            assertThat(
                            assertThrows(
                                    JPDFiumException.class,
                                    () -> controller.mergePdfs(request("private.pdf"), null)))
                    .isSameAs(failure);
        }
    }

    @Test
    void mixedFailuresReportOnlyPasswordInputWithoutFilenames() {
        try (MockedStatic<PdfDocument> pdf = mockStatic(PdfDocument.class)) {
            pdf.when(() -> PdfDocument.open(any(Path.class)))
                    .thenThrow(new PdfCorruptException("corrupt"))
                    .thenThrow(new PdfPasswordException("password"));
            ExceptionUtils.PdfPasswordException failure =
                    assertThrows(
                            ExceptionUtils.PdfPasswordException.class,
                            () ->
                                    controller.mergePdfs(
                                            request("private-broken.pdf", "private-locked.pdf"),
                                            null));
            assertThat(failure.getMessage()).contains("file 2").doesNotContain("file 1", "private");
        }
    }

    @Test
    void errorPositionRefersToUploadOrderAfterSorting() {
        try (MockedStatic<PdfDocument> pdf = mockStatic(PdfDocument.class)) {
            pdf.when(() -> PdfDocument.open(any(Path.class)))
                    .thenThrow(new PdfCorruptException("corrupt"))
                    .thenReturn(mock(PdfDocument.class));
            MergePdfsRequest request = request("z-private.pdf", "a-private.pdf");
            request.setSortType("byFileName");
            ExceptionUtils.PdfCorruptedException failure =
                    assertThrows(
                            ExceptionUtils.PdfCorruptedException.class,
                            () -> controller.mergePdfs(request, null));
            assertThat(failure.getMessage()).contains("file 2").doesNotContain("file 1", "private");
        }
    }

    @Test
    void nativeEncryptionFailureIsNotReportedAsCorruption() {
        try (MockedStatic<PdfDocument> pdf = mockStatic(PdfDocument.class)) {
            pdf.when(() -> PdfDocument.open(any(Path.class)))
                    .thenThrow(new JPDFiumException("Failed to decrypt"));
            assertThrows(
                    ExceptionUtils.PdfEncryptionException.class,
                    () -> controller.mergePdfs(request("private.pdf"), null));
        }
    }

    private MergePdfsRequest request(String... names) {
        MultipartFile[] files = new MultipartFile[names.length];
        for (int index = 0; index < names.length; index++) {
            files[index] =
                    new MockMultipartFile(
                            "fileInput", names[index], "application/pdf", new byte[] {1});
        }
        MergePdfsRequest request = new MergePdfsRequest();
        request.setFileInput(files);
        request.setSortType("orderProvided");
        return request;
    }
}
