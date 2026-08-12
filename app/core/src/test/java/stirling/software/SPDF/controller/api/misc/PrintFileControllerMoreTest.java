package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.awt.print.PrinterException;
import java.awt.print.PrinterJob;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import javax.imageio.ImageIO;
import javax.print.PrintService;
import javax.print.PrintServiceLookup;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.PrintFileRequest;

/**
 * Additional tests for {@link PrintFileController}. The printing boundary is fully mocked: {@link
 * PrintServiceLookup} returns a fake printer and {@link PrinterJob#getPrinterJob()} returns a mock
 * whose {@code print()} is a no-op (or throws on demand). No physical printer is ever touched.
 */
@ExtendWith(MockitoExtension.class)
class PrintFileControllerMoreTest {

    private final PrintFileController controller = new PrintFileController();

    private static byte[] smallPdf() throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            document.addPage(new PDPage(PDRectangle.A4));
            document.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] smallPng() throws IOException {
        BufferedImage image = new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, "png", baos);
        return baos.toByteArray();
    }

    private static PrintService printerNamed(String name) {
        PrintService service = mock(PrintService.class);
        when(service.getName()).thenReturn(name);
        return service;
    }

    private static PrintFileRequest request(MockMultipartFile file, String printerName) {
        PrintFileRequest request = new PrintFileRequest();
        request.setFileInput(file);
        request.setPrinterName(printerName);
        return request;
    }

    @Nested
    @DisplayName("PDF printing")
    class PdfPrinting {

        @Test
        @DisplayName("PDF to a matching printer returns 200 and invokes job.print()")
        void pdfPrintSuccess() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, smallPdf());

            PrintService service = printerNamed("Mock Office Printer");
            PrintService[] services = {service};
            PrinterJob job = mock(PrinterJob.class);
            doNothing().when(job).print();

            try (MockedStatic<PrintServiceLookup> lookup = mockStatic(PrintServiceLookup.class);
                    MockedStatic<PrinterJob> printerJob = mockStatic(PrinterJob.class)) {
                lookup.when(() -> PrintServiceLookup.lookupPrintServices(isNull(), isNull()))
                        .thenReturn(services);
                printerJob.when(PrinterJob::getPrinterJob).thenReturn(job);

                ResponseEntity<String> response = controller.printFile(request(file, "office"));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(response.getBody().contains("Mock Office Printer"));
                verify(job, atLeastOnce()).print();
            }
        }

        @Test
        @DisplayName("PrinterException during PDF print yields 400 with the error message")
        void pdfPrintErrorReturnsBadRequest() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, smallPdf());

            PrintService service = printerNamed("Mock Office Printer");
            PrintService[] services = {service};
            PrinterJob job = mock(PrinterJob.class);
            doThrow(new PrinterException("paper jam")).when(job).print();

            try (MockedStatic<PrintServiceLookup> lookup = mockStatic(PrintServiceLookup.class);
                    MockedStatic<PrinterJob> printerJob = mockStatic(PrinterJob.class)) {
                lookup.when(() -> PrintServiceLookup.lookupPrintServices(isNull(), isNull()))
                        .thenReturn(services);
                printerJob.when(PrinterJob::getPrinterJob).thenReturn(job);

                ResponseEntity<String> response = controller.printFile(request(file, "office"));

                assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
                assertTrue(response.getBody().contains("paper jam"));
            }
        }
    }

    @Nested
    @DisplayName("Image printing")
    class ImagePrinting {

        @Test
        @DisplayName("PNG to a matching printer returns 200 and invokes job.print()")
        void imagePrintSuccess() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile("fileInput", "pic.png", "image/png", smallPng());

            PrintService service = printerNamed("Photo Printer");
            PrintService[] services = {service};
            PrinterJob job = mock(PrinterJob.class);
            doNothing().when(job).print();

            try (MockedStatic<PrintServiceLookup> lookup = mockStatic(PrintServiceLookup.class);
                    MockedStatic<PrinterJob> printerJob = mockStatic(PrinterJob.class)) {
                lookup.when(() -> PrintServiceLookup.lookupPrintServices(isNull(), isNull()))
                        .thenReturn(services);
                printerJob.when(PrinterJob::getPrinterJob).thenReturn(job);

                ResponseEntity<String> response = controller.printFile(request(file, "photo"));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(response.getBody().contains("Photo Printer"));
                verify(job, atLeastOnce()).print();
            }
        }
    }

    @Nested
    @DisplayName("Printer matching")
    class PrinterMatching {

        @Test
        @DisplayName("no matching printer returns 400 with 'No matching printer'")
        void noMatchingPrinterReturnsBadRequest() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, smallPdf());

            PrintService service = printerNamed("Some Other Printer");
            PrintService[] services = {service};

            try (MockedStatic<PrintServiceLookup> lookup = mockStatic(PrintServiceLookup.class)) {
                lookup.when(() -> PrintServiceLookup.lookupPrintServices(isNull(), isNull()))
                        .thenReturn(services);

                ResponseEntity<String> response =
                        controller.printFile(request(file, "nonexistent"));

                assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
                assertTrue(response.getBody().contains("No matching printer"));
            }
        }

        @Test
        @DisplayName("printer match is case-insensitive and substring based")
        void printerMatchCaseInsensitive() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, smallPdf());

            PrintService service = printerNamed("HP LaserJet 4000");
            PrintService[] services = {service};
            PrinterJob job = mock(PrinterJob.class);
            doNothing().when(job).print();

            try (MockedStatic<PrintServiceLookup> lookup = mockStatic(PrintServiceLookup.class);
                    MockedStatic<PrinterJob> printerJob = mockStatic(PrinterJob.class)) {
                lookup.when(() -> PrintServiceLookup.lookupPrintServices(isNull(), isNull()))
                        .thenReturn(services);
                printerJob.when(PrinterJob::getPrinterJob).thenReturn(job);

                ResponseEntity<String> response = controller.printFile(request(file, "laserjet"));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(response.getBody().contains("HP LaserJet 4000"));
            }
        }
    }

    @Nested
    @DisplayName("Content-type handling")
    class ContentTypeHandling {

        @Test
        @DisplayName("unsupported content type still returns 200 without printing")
        void unsupportedContentTypeNoPrint() throws Exception {
            // Neither application/pdf nor image/* -> neither print branch runs.
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "data.bin", "application/octet-stream", "x".getBytes());

            PrintService service = printerNamed("Generic Printer");
            PrintService[] services = {service};

            try (MockedStatic<PrintServiceLookup> lookup = mockStatic(PrintServiceLookup.class)) {
                lookup.when(() -> PrintServiceLookup.lookupPrintServices(isNull(), isNull()))
                        .thenReturn(services);

                ResponseEntity<String> response = controller.printFile(request(file, "generic"));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(response.getBody().contains("Generic Printer"));
            }
        }
    }

    @Nested
    @DisplayName("Path validation")
    class PathValidation {

        @Test
        @DisplayName("path traversal in filename throws before any printer lookup")
        void pathTraversalThrows() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            "../../secret.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            "data".getBytes());

            assertThrows(Exception.class, () -> controller.printFile(request(file, "any")));
        }
    }
}
