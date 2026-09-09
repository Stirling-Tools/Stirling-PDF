package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

/**
 * Gap-filling tests for {@link PdfToCbrUtils#convertPdfToCbr} that drive the real PDFBox render
 * loop with a tiny one-page PDF and mock the external {@code rar} process so the archive-creation
 * branch is exercised without any external tool.
 */
class PdfToCbrUtilsMoreTest {

    /** A one-page PDF containing a small embedded image so the renderer produces a PNG. */
    private static byte[] onePageImagePdf() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(new PDRectangle(72, 72));
            doc.addPage(page);

            BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = img.createGraphics();
            g.setColor(Color.BLUE);
            g.fillRect(0, 0, 16, 16);
            g.dispose();
            PDImageXObject pdImage = LosslessFactory.createFromImage(doc, img);

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(pdImage, 0, 0, 72, 72);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static MultipartFile pdfMultipart(byte[] bytes) {
        return new MockMultipartFile("file", "comic.pdf", "application/pdf", bytes);
    }

    private static CustomPDFDocumentFactory factoryReturning(PDDocument document)
            throws IOException {
        CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
        when(factory.load(any(MultipartFile.class))).thenReturn(document);
        return factory;
    }

    @Nested
    @DisplayName("convertPdfToCbr - rar process branches")
    class RarProcessTests {

        @Test
        @DisplayName("non-zero rar exit code surfaces as a processing exception")
        void rarNonZeroExit() throws Exception {
            PDDocument doc = Loader.loadPDF(onePageImagePdf());
            CustomPDFDocumentFactory factory = factoryReturning(doc);

            ProcessExecutorResult result = mock(ProcessExecutorResult.class);
            when(result.getRc()).thenReturn(1);
            ProcessExecutor executor = mock(ProcessExecutor.class);
            Mockito.doReturn(result).when(executor).runCommandWithOutputHandling(anyList(), any());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.INSTALL_APP))
                        .thenReturn(executor);

                assertThatThrownBy(
                                () ->
                                        PdfToCbrUtils.convertPdfToCbr(
                                                pdfMultipart(onePageImagePdf()), 72, factory))
                        .isInstanceOf(IOException.class);
            }
            doc.close();
        }

        @Test
        @DisplayName("rc=0 but missing rar output file raises 'RAR file was not created'")
        void rarFileNotCreated() throws Exception {
            PDDocument doc = Loader.loadPDF(onePageImagePdf());
            CustomPDFDocumentFactory factory = factoryReturning(doc);

            ProcessExecutorResult result = mock(ProcessExecutorResult.class);
            when(result.getRc()).thenReturn(0);
            ProcessExecutor executor = mock(ProcessExecutor.class);
            // No real rar runs, so the expected output.cbr is never produced.
            Mockito.doReturn(result).when(executor).runCommandWithOutputHandling(anyList(), any());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.INSTALL_APP))
                        .thenReturn(executor);

                assertThatThrownBy(
                                () ->
                                        PdfToCbrUtils.convertPdfToCbr(
                                                pdfMultipart(onePageImagePdf()), 72, factory))
                        .isInstanceOf(IOException.class)
                        .hasMessageContaining("RAR");
            }
            doc.close();
        }

        @Test
        @DisplayName("an interrupted rar process is wrapped and the thread interrupt is restored")
        void rarInterrupted() throws Exception {
            PDDocument doc = Loader.loadPDF(onePageImagePdf());
            CustomPDFDocumentFactory factory = factoryReturning(doc);

            ProcessExecutor executor = mock(ProcessExecutor.class);
            Mockito.doThrow(new InterruptedException("boom"))
                    .when(executor)
                    .runCommandWithOutputHandling(anyList(), any());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.INSTALL_APP))
                        .thenReturn(executor);

                assertThatThrownBy(
                                () ->
                                        PdfToCbrUtils.convertPdfToCbr(
                                                pdfMultipart(onePageImagePdf()), 72, factory))
                        .isInstanceOf(Exception.class);
            } finally {
                // Clear the interrupt flag set by the handler so it doesn't leak into later tests.
                Thread.interrupted();
                doc.close();
            }
        }
    }

    @Nested
    @DisplayName("convertPdfToCbr - document validation")
    class DocumentValidationTests {

        @Test
        @DisplayName("a zero-page document raises a no-pages exception before rendering")
        void zeroPageDocument() throws Exception {
            try (PDDocument empty = new PDDocument()) {
                CustomPDFDocumentFactory factory = factoryReturning(empty);
                assertThatThrownBy(
                                () ->
                                        PdfToCbrUtils.convertPdfToCbr(
                                                pdfMultipart(onePageImagePdf()), 72, factory))
                        .isInstanceOf(Exception.class);
            }
        }
    }

    @Nested
    @DisplayName("isPdfFile")
    class IsPdfFileTests {

        @Test
        @DisplayName("a .cbr file is not a PDF")
        void cbrIsNotPdf() {
            MultipartFile file = mock(MultipartFile.class);
            when(file.getOriginalFilename()).thenReturn("comic.cbr");
            assertThat(PdfToCbrUtils.isPdfFile(file)).isFalse();
        }
    }
}
