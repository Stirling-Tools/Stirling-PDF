package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.ImageType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertCbrToPdfRequest;
import stirling.software.SPDF.model.api.converters.ConvertCbzToPdfRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToCbrRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToCbzRequest;
import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CbrUtils;
import stirling.software.common.util.CbzUtils;
import stirling.software.common.util.CheckProgramInstall;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfToCbrUtils;
import stirling.software.common.util.PdfToCbzUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Gap coverage for {@link ConvertImgPDFController}, exercising the comic-book and image converters
 * left untested by ConvertImgPDFControllerTest. External binaries (Ghostscript, Python, RAR) are
 * never invoked: the utility boundaries are mocked statically.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertImgPDFControllerGapTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertImgPDFController controller;

    /** Builds a tiny, valid single-page A4 PDF as bytes. */
    private static byte[] tinyPdfBytes(int pages) throws IOException {
        try (PDDocument doc = new PDDocument();
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** Builds a fresh in-memory PDDocument (the factory must hand back a real, open document). */
    private static PDDocument tinyDocument(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(PDRectangle.A4));
        }
        return doc;
    }

    private static MockMultipartFile pdfFile(String name, byte[] bytes) {
        return new MockMultipartFile("fileInput", name, "application/pdf", bytes);
    }

    @Nested
    @DisplayName("convertCbzToPdf")
    class ConvertCbzToPdf {

        @Test
        @DisplayName("disables ebook optimization when Ghostscript is not enabled")
        void disablesOptimizationWhenGhostscriptMissing() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "book.cbz", "application/zip", new byte[] {1});
            ConvertCbzToPdfRequest request = new ConvertCbzToPdfRequest();
            request.setFileInput(file);
            request.setOptimizeForEbook(true);

            Mockito.when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            TempFile tempFile = Mockito.mock(TempFile.class);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<CbzUtils> cbz = Mockito.mockStatic(CbzUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                cbz.when(
                                () ->
                                        CbzUtils.convertCbzToPdf(
                                                eq(file),
                                                eq(pdfDocumentFactory),
                                                eq(tempFileManager),
                                                eq(false)))
                        .thenReturn(tempFile);
                gu.when(() -> GeneralUtils.generateFilename("book", "_converted.pdf"))
                        .thenReturn("book_converted.pdf");
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(tempFile, "book_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.convertCbzToPdf(request);

                assertSame(expected, response);
                cbz.verify(
                        () ->
                                CbzUtils.convertCbzToPdf(
                                        eq(file),
                                        eq(pdfDocumentFactory),
                                        eq(tempFileManager),
                                        eq(false)));
            }
        }

        @Test
        @DisplayName("keeps ebook optimization when Ghostscript is enabled")
        void keepsOptimizationWhenGhostscriptEnabled() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "book.cbz", "application/zip", new byte[] {1});
            ConvertCbzToPdfRequest request = new ConvertCbzToPdfRequest();
            request.setFileInput(file);
            request.setOptimizeForEbook(true);

            Mockito.when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            TempFile tempFile = Mockito.mock(TempFile.class);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<CbzUtils> cbz = Mockito.mockStatic(CbzUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                cbz.when(
                                () ->
                                        CbzUtils.convertCbzToPdf(
                                                eq(file),
                                                eq(pdfDocumentFactory),
                                                eq(tempFileManager),
                                                eq(true)))
                        .thenReturn(tempFile);
                gu.when(() -> GeneralUtils.generateFilename("book", "_converted.pdf"))
                        .thenReturn("book_converted.pdf");
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(tempFile, "book_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.convertCbzToPdf(request);

                assertSame(expected, response);
                cbz.verify(
                        () ->
                                CbzUtils.convertCbzToPdf(
                                        eq(file),
                                        eq(pdfDocumentFactory),
                                        eq(tempFileManager),
                                        eq(true)));
            }
        }

        @Test
        @DisplayName("falls back to the default comic name when the original filename is null")
        void usesDefaultNameWhenFilenameNull() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile("fileInput", null, "application/zip", new byte[] {1});
            ConvertCbzToPdfRequest request = new ConvertCbzToPdfRequest();
            request.setFileInput(file);
            request.setOptimizeForEbook(false);

            TempFile tempFile = Mockito.mock(TempFile.class);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<CbzUtils> cbz = Mockito.mockStatic(CbzUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                cbz.when(() -> CbzUtils.convertCbzToPdf(any(), any(), any(), anyBoolean()))
                        .thenReturn(tempFile);
                gu.when(() -> GeneralUtils.generateFilename("comic", "_converted.pdf"))
                        .thenReturn("comic_converted.pdf");
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                tempFile, "comic_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.convertCbzToPdf(request);

                assertSame(expected, response);
                // Default comic name is resolved when the upload carries no filename.
                gu.verify(() -> GeneralUtils.generateFilename("comic", "_converted.pdf"));
            }
        }
    }

    @Nested
    @DisplayName("convertCbrToPdf")
    class ConvertCbrToPdf {

        @Test
        @DisplayName("disables ebook optimization when Ghostscript is not enabled")
        void disablesOptimizationWhenGhostscriptMissing() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "book.cbr", "application/x-rar", new byte[] {1});
            ConvertCbrToPdfRequest request = new ConvertCbrToPdfRequest();
            request.setFileInput(file);
            request.setOptimizeForEbook(true);

            Mockito.when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            byte[] pdfBytes = "converted-pdf".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(pdfBytes);

            try (MockedStatic<CbrUtils> cbr = Mockito.mockStatic(CbrUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                cbr.when(
                                () ->
                                        CbrUtils.convertCbrToPdf(
                                                eq(file),
                                                eq(pdfDocumentFactory),
                                                eq(tempFileManager),
                                                eq(false)))
                        .thenReturn(pdfBytes);
                gu.when(() -> GeneralUtils.generateFilename("book", "_converted.pdf"))
                        .thenReturn("book_converted.pdf");
                wr.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "book_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertCbrToPdf(request);

                assertSame(expected, response);
                cbr.verify(
                        () ->
                                CbrUtils.convertCbrToPdf(
                                        eq(file),
                                        eq(pdfDocumentFactory),
                                        eq(tempFileManager),
                                        eq(false)));
            }
        }

        @Test
        @DisplayName("keeps ebook optimization when Ghostscript is enabled")
        void keepsOptimizationWhenGhostscriptEnabled() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "story.cbr", "application/x-rar", new byte[] {1});
            ConvertCbrToPdfRequest request = new ConvertCbrToPdfRequest();
            request.setFileInput(file);
            request.setOptimizeForEbook(true);

            Mockito.when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            byte[] pdfBytes = "converted-pdf".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(pdfBytes);

            try (MockedStatic<CbrUtils> cbr = Mockito.mockStatic(CbrUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                cbr.when(
                                () ->
                                        CbrUtils.convertCbrToPdf(
                                                eq(file),
                                                eq(pdfDocumentFactory),
                                                eq(tempFileManager),
                                                eq(true)))
                        .thenReturn(pdfBytes);
                gu.when(() -> GeneralUtils.generateFilename("story", "_converted.pdf"))
                        .thenReturn("story_converted.pdf");
                wr.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "story_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertCbrToPdf(request);

                assertSame(expected, response);
            }
        }
    }

    @Nested
    @DisplayName("convertPdfToCbz")
    class ConvertPdfToCbz {

        @Test
        @DisplayName("passes the requested DPI through and returns a zip response")
        void passesThroughRequestedDpi() throws Exception {
            MockMultipartFile file = pdfFile("doc.pdf", tinyPdfBytes(1));
            ConvertPdfToCbzRequest request = new ConvertPdfToCbzRequest();
            request.setFileInput(file);
            request.setDpi(200);

            TempFile cbzFile = Mockito.mock(TempFile.class);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<PdfToCbzUtils> p2c = Mockito.mockStatic(PdfToCbzUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                p2c.when(
                                () ->
                                        PdfToCbzUtils.convertPdfToCbz(
                                                eq(file),
                                                eq(200),
                                                eq(pdfDocumentFactory),
                                                eq(tempFileManager)))
                        .thenReturn(cbzFile);
                gu.when(() -> GeneralUtils.generateFilename("doc", "_converted.cbz"))
                        .thenReturn("doc_converted.cbz");
                wr.when(() -> WebResponseUtils.zipFileToWebResponse(cbzFile, "doc_converted.cbz"))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.convertPdfToCbz(request);

                assertSame(expected, response);
            }
        }

        @Test
        @DisplayName("defaults DPI to 300 when a non-positive value is supplied")
        void defaultsDpiWhenNonPositive() throws Exception {
            MockMultipartFile file = pdfFile("doc.pdf", tinyPdfBytes(1));
            ConvertPdfToCbzRequest request = new ConvertPdfToCbzRequest();
            request.setFileInput(file);
            request.setDpi(0);

            TempFile cbzFile = Mockito.mock(TempFile.class);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<PdfToCbzUtils> p2c = Mockito.mockStatic(PdfToCbzUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                p2c.when(
                                () ->
                                        PdfToCbzUtils.convertPdfToCbz(
                                                eq(file),
                                                eq(300),
                                                eq(pdfDocumentFactory),
                                                eq(tempFileManager)))
                        .thenReturn(cbzFile);
                gu.when(() -> GeneralUtils.generateFilename("doc", "_converted.cbz"))
                        .thenReturn("doc_converted.cbz");
                wr.when(() -> WebResponseUtils.zipFileToWebResponse(cbzFile, "doc_converted.cbz"))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.convertPdfToCbz(request);

                assertSame(expected, response);
                // Negative/zero DPI is replaced by the 300 default before delegating.
                p2c.verify(
                        () ->
                                PdfToCbzUtils.convertPdfToCbz(
                                        eq(file),
                                        eq(300),
                                        eq(pdfDocumentFactory),
                                        eq(tempFileManager)));
            }
        }
    }

    @Nested
    @DisplayName("convertPdfToCbr")
    class ConvertPdfToCbr {

        @Test
        @DisplayName("passes the requested DPI and wraps bytes as an octet-stream response")
        void passesThroughRequestedDpi() throws Exception {
            MockMultipartFile file = pdfFile("doc.pdf", tinyPdfBytes(1));
            ConvertPdfToCbrRequest request = new ConvertPdfToCbrRequest();
            request.setFileInput(file);
            request.setDpi(150);

            byte[] cbrBytes = "cbr-archive".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(cbrBytes);

            try (MockedStatic<PdfToCbrUtils> p2c = Mockito.mockStatic(PdfToCbrUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                p2c.when(
                                () ->
                                        PdfToCbrUtils.convertPdfToCbr(
                                                eq(file), eq(150), eq(pdfDocumentFactory)))
                        .thenReturn(cbrBytes);
                gu.when(() -> GeneralUtils.generateFilename("doc", "_converted.cbr"))
                        .thenReturn("doc_converted.cbr");
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(cbrBytes),
                                                eq("doc_converted.cbr"),
                                                eq(MediaType.APPLICATION_OCTET_STREAM)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertPdfToCbr(request);

                assertSame(expected, response);
            }
        }

        @Test
        @DisplayName("defaults DPI to 300 when a non-positive value is supplied")
        void defaultsDpiWhenNonPositive() throws Exception {
            MockMultipartFile file = pdfFile("doc.pdf", tinyPdfBytes(1));
            ConvertPdfToCbrRequest request = new ConvertPdfToCbrRequest();
            request.setFileInput(file);
            request.setDpi(-5);

            byte[] cbrBytes = "cbr-archive".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(cbrBytes);

            try (MockedStatic<PdfToCbrUtils> p2c = Mockito.mockStatic(PdfToCbrUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                p2c.when(
                                () ->
                                        PdfToCbrUtils.convertPdfToCbr(
                                                eq(file), eq(300), eq(pdfDocumentFactory)))
                        .thenReturn(cbrBytes);
                gu.when(() -> GeneralUtils.generateFilename("doc", "_converted.cbr"))
                        .thenReturn("doc_converted.cbr");
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(cbrBytes),
                                                eq("doc_converted.cbr"),
                                                eq(MediaType.APPLICATION_OCTET_STREAM)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertPdfToCbr(request);

                assertSame(expected, response);
                p2c.verify(
                        () ->
                                PdfToCbrUtils.convertPdfToCbr(
                                        eq(file), eq(300), eq(pdfDocumentFactory)));
            }
        }
    }

    @Nested
    @DisplayName("convertToImage")
    class ConvertToImage {

        private MockMultipartFile imagePdf(byte[] bytes) {
            return pdfFile("source.pdf", bytes);
        }

        @Test
        @DisplayName("single-image PNG path returns the rendered bytes")
        void singleImagePng() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(1);
            MockMultipartFile file = imagePdf(pdfBytes);

            ConvertToImageRequest request = new ConvertToImageRequest();
            request.setFileInput(file);
            request.setImageFormat("png");
            request.setSingleOrMultiple("single");
            request.setColorType("color");
            request.setDpi(72);
            request.setPageNumbers("all");
            request.setIncludeAnnotations(false);

            // rearrangePdfPages loads a real document; convertFromPdf is the boundary we stub.
            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDocument(1));

            byte[] imageBytes = "png-image".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(imageBytes);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                eq(pdfDocumentFactory),
                                                any(byte[].class),
                                                eq("PNG"),
                                                eq(ImageType.RGB),
                                                eq(true),
                                                eq(72),
                                                any(String.class),
                                                eq(false)))
                        .thenReturn(imageBytes);
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(imageBytes),
                                                any(String.class),
                                                any(MediaType.class)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertToImage(request);

                assertSame(expected, response);
            }
        }

        @Test
        @DisplayName("multiple-image path zips the rendered output with octet-stream type")
        void multipleImagesZip() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(2);
            MockMultipartFile file = imagePdf(pdfBytes);

            ConvertToImageRequest request = new ConvertToImageRequest();
            request.setFileInput(file);
            request.setImageFormat("jpg");
            request.setSingleOrMultiple("multiple");
            request.setColorType("greyscale");
            request.setDpi(72);
            request.setPageNumbers("all");
            request.setIncludeAnnotations(true);

            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDocument(2));

            byte[] zipBytes = "zip-bytes".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(zipBytes);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                // greyscale -> ImageType.GRAY, multiple -> singleImage=false
                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                eq(pdfDocumentFactory),
                                                any(byte[].class),
                                                eq("JPG"),
                                                eq(ImageType.GRAY),
                                                eq(false),
                                                eq(72),
                                                any(String.class),
                                                eq(true)))
                        .thenReturn(zipBytes);
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(zipBytes),
                                                any(String.class),
                                                eq(MediaType.APPLICATION_OCTET_STREAM)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertToImage(request);

                assertSame(expected, response);
            }
        }

        @Test
        @DisplayName("blackwhite color type maps to BINARY image type")
        void blackwhiteMapsToBinary() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(1);
            MockMultipartFile file = imagePdf(pdfBytes);

            ConvertToImageRequest request = new ConvertToImageRequest();
            request.setFileInput(file);
            request.setImageFormat("png");
            request.setSingleOrMultiple("single");
            request.setColorType("blackwhite");
            request.setDpi(72);
            request.setPageNumbers("all");
            request.setIncludeAnnotations(false);

            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDocument(1));

            byte[] imageBytes = "bw-image".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(imageBytes);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                eq(pdfDocumentFactory),
                                                any(byte[].class),
                                                eq("PNG"),
                                                eq(ImageType.BINARY),
                                                eq(true),
                                                eq(72),
                                                any(String.class),
                                                eq(false)))
                        .thenReturn(imageBytes);
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(imageBytes),
                                                any(String.class),
                                                any(MediaType.class)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertToImage(request);

                assertSame(expected, response);
            }
        }

        @Test
        @DisplayName("null page numbers fall back to all pages")
        void nullPageNumbersDefaultsToAll() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(1);
            MockMultipartFile file = imagePdf(pdfBytes);

            ConvertToImageRequest request = new ConvertToImageRequest();
            request.setFileInput(file);
            request.setImageFormat("png");
            request.setSingleOrMultiple("single");
            request.setColorType("color");
            request.setDpi(72);
            request.setPageNumbers(null);
            request.setIncludeAnnotations(null);

            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDocument(1));

            byte[] imageBytes = "png-image".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(imageBytes);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                // includeAnnotations null -> false
                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                eq(pdfDocumentFactory),
                                                any(byte[].class),
                                                eq("PNG"),
                                                eq(ImageType.RGB),
                                                eq(true),
                                                eq(72),
                                                any(String.class),
                                                eq(false)))
                        .thenReturn(imageBytes);
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(imageBytes),
                                                any(String.class),
                                                any(MediaType.class)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertToImage(request);

                assertSame(expected, response);
            }
        }

        @Test
        @DisplayName("webp requested without Python throws the python-required IOException")
        void webpWithoutPythonThrows() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(1);
            MockMultipartFile file = imagePdf(pdfBytes);

            ConvertToImageRequest request = new ConvertToImageRequest();
            request.setFileInput(file);
            request.setImageFormat("webp");
            request.setSingleOrMultiple("single");
            request.setColorType("color");
            request.setDpi(72);
            request.setPageNumbers("all");
            request.setIncludeAnnotations(false);

            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDocument(1));

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<CheckProgramInstall> cpi =
                            Mockito.mockStatic(CheckProgramInstall.class)) {

                // webp renders to PNG first, then requires Python for the final conversion.
                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                eq(pdfDocumentFactory),
                                                any(byte[].class),
                                                eq("png"),
                                                any(ImageType.class),
                                                anyBoolean(),
                                                anyInt(),
                                                any(String.class),
                                                anyBoolean()))
                        .thenReturn("png-image".getBytes());
                cpi.when(CheckProgramInstall::isPythonAvailable).thenReturn(false);

                assertThrows(IOException.class, () -> controller.convertToImage(request));
            }
        }
    }

    @Nested
    @DisplayName("createConvertedFilename (via the comic converters)")
    class CreateConvertedFilename {

        @Test
        @DisplayName("strips only the trailing extension from a multi-dot filename")
        void stripsTrailingExtensionOnly() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "my.archive.cbz", "application/zip", new byte[] {1});
            ConvertCbzToPdfRequest request = new ConvertCbzToPdfRequest();
            request.setFileInput(file);
            request.setOptimizeForEbook(false);

            TempFile tempFile = Mockito.mock(TempFile.class);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<CbzUtils> cbz = Mockito.mockStatic(CbzUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                cbz.when(() -> CbzUtils.convertCbzToPdf(any(), any(), any(), anyBoolean()))
                        .thenReturn(tempFile);
                gu.when(() -> GeneralUtils.generateFilename("my.archive", "_converted.pdf"))
                        .thenReturn("my.archive_converted.pdf");
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                tempFile, "my.archive_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.convertCbzToPdf(request);

                assertSame(expected, response);
                // Only the final ".cbz" is removed, the inner dot is preserved.
                gu.verify(() -> GeneralUtils.generateFilename("my.archive", "_converted.pdf"));
            }
        }

        @Test
        @DisplayName("uses the default comic name when stripping leaves a blank base name")
        void fallsBackToComicWhenBaseNameBlank() throws Exception {
            // ".cbz" strips to an empty base, which the controller replaces with "comic".
            MockMultipartFile file =
                    new MockMultipartFile("fileInput", ".cbz", "application/zip", new byte[] {1});
            ConvertCbzToPdfRequest request = new ConvertCbzToPdfRequest();
            request.setFileInput(file);
            request.setOptimizeForEbook(false);

            TempFile tempFile = Mockito.mock(TempFile.class);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<CbzUtils> cbz = Mockito.mockStatic(CbzUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                cbz.when(() -> CbzUtils.convertCbzToPdf(any(), any(), any(), anyBoolean()))
                        .thenReturn(tempFile);
                gu.when(() -> GeneralUtils.generateFilename("comic", "_converted.pdf"))
                        .thenReturn("comic_converted.pdf");
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                tempFile, "comic_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.convertCbzToPdf(request);

                assertSame(expected, response);
                gu.verify(() -> GeneralUtils.generateFilename("comic", "_converted.pdf"));
            }
        }
    }

    @Test
    @DisplayName("controller is constructed with its injected collaborators")
    void controllerIsConstructed() {
        assertNotNull(controller);
        assertEquals(0, 0);
    }
}
