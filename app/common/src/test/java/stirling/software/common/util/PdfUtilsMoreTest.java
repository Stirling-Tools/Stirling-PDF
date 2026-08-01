package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Further gap-filling tests for {@link PdfUtils}, complementing {@code PdfUtilsTest} and {@code
 * PdfUtilsGapTest}: the form-XObject recursion in image discovery, the found-text branch, the
 * ApplicationProperties-present DPI lookups, the rotated/duplicate page-size paths, and the
 * multi-frame TIFF input path of imageToPdf.
 */
class PdfUtilsMoreTest {

    // ---- helpers ------------------------------------------------------------

    /** Builds a PDF whose pages each show the given text phrase. */
    private static PDDocument docWithText(String... pageTexts) throws IOException {
        PDDocument doc = new PDDocument();
        for (String text : pageTexts) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText(text);
                cs.endText();
            }
        }
        return doc;
    }

    /** A small one-page PDF serialized to bytes. */
    private static byte[] simplePdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** Builds an ApplicationProperties whose system reports the given max DPI. */
    private static ApplicationProperties propsWithMaxDpi(int dpi) {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().setMaxDPI(dpi);
        return props;
    }

    /** Encodes a multi-frame TIFF (two solid-colour frames) to bytes. */
    private static byte[] multiFrameTiff() throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("tiff").next();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(baos)) {
            writer.setOutput(ios);
            ImageWriteParam param = writer.getDefaultWriteParam();
            writer.prepareWriteSequence(null);
            for (Color c : new Color[] {Color.RED, Color.BLUE}) {
                BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = img.createGraphics();
                g.setColor(c);
                g.fillRect(0, 0, 16, 16);
                g.dispose();
                writer.writeToSequence(new IIOImage(img, null, null), param);
            }
            writer.endWriteSequence();
        }
        writer.dispose();
        return baos.toByteArray();
    }

    // ---- getAllImages recursion --------------------------------------------

    @Nested
    @DisplayName("getAllImages with form XObjects")
    class GetAllImagesForm {

        @Test
        @DisplayName("images nested inside a form XObject are discovered recursively")
        void recursesIntoFormXObject() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                // Build a form XObject that itself holds an image in its resources.
                PDFormXObject form = new PDFormXObject(doc);
                form.setResources(new PDResources());
                BufferedImage bi = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
                PDImageXObject nested = LosslessFactory.createFromImage(doc, bi);
                form.getResources().add(nested);

                PDResources pageResources = new PDResources();
                pageResources.add(form);

                assertThat(PdfUtils.getAllImages(pageResources)).hasSize(1);
            }
        }
    }

    // ---- hasText found branch ----------------------------------------------

    @Nested
    @DisplayName("hasText found branch")
    class HasTextFound {

        @Test
        @DisplayName("returns true when the phrase is present on a searched page")
        void findsPhrase() throws IOException {
            try (PDDocument doc = docWithText("NeedleInHaystack")) {
                assertThat(PdfUtils.hasText(doc, "all", "NeedleInHaystack")).isTrue();
            }
        }

        @Test
        @DisplayName("returns true when the phrase is on the requested page only")
        void findsPhraseOnSecondPage() throws IOException {
            try (PDDocument doc = docWithText("first", "SecondMarker")) {
                assertThat(PdfUtils.hasText(doc, "2", "SecondMarker")).isTrue();
            }
        }
    }

    // ---- convertFromPdf with ApplicationProperties present ------------------

    @Nested
    @DisplayName("convertFromPdf honouring configured max DPI")
    class ConvertFromPdfWithProps {

        @Test
        @DisplayName("DPI under the configured limit renders; properties branch is taken")
        void underConfiguredLimitRenders() throws Exception {
            byte[] bytes = simplePdfBytes();
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(new PDRectangle(20f, 20f)));
            when(factory.load(bytes)).thenReturn(doc);

            try (MockedStatic<ApplicationContextProvider> ctx =
                    Mockito.mockStatic(ApplicationContextProvider.class)) {
                ctx.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                        .thenReturn(propsWithMaxDpi(200));

                byte[] out =
                        PdfUtils.convertFromPdf(
                                factory, bytes, "png", ImageType.RGB, true, 72, "doc", true);
                assertThat(out).isNotEmpty();
            }
        }

        @Test
        @DisplayName("DPI above the configured limit throws using the configured maximum")
        void aboveConfiguredLimitThrows() {
            byte[] bytes = new byte[] {1, 2, 3};
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);

            try (MockedStatic<ApplicationContextProvider> ctx =
                    Mockito.mockStatic(ApplicationContextProvider.class)) {
                ctx.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                        .thenReturn(propsWithMaxDpi(100));

                // 150 exceeds the configured limit of 100, so the limit check fires before loading.
                org.junit.jupiter.api.Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                PdfUtils.convertFromPdf(
                                        factory,
                                        bytes,
                                        "png",
                                        ImageType.RGB,
                                        true,
                                        150,
                                        "doc",
                                        true));
            }
        }

        @Test
        @DisplayName("combined-image mode reuses the cached size for duplicate pages")
        void combinedImageReusesDuplicatePageSize() throws Exception {
            byte[] bytes = simplePdfBytes();
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
            PDDocument doc = new PDDocument();
            // Two identically-sized pages: the second hits the size cache.
            doc.addPage(new PDPage(new PDRectangle(20f, 30f)));
            doc.addPage(new PDPage(new PDRectangle(20f, 30f)));
            when(factory.load(bytes)).thenReturn(doc);

            byte[] out =
                    PdfUtils.convertFromPdf(
                            factory, bytes, "png", ImageType.RGB, true, 36, "doc", true);
            assertThat(out).isNotEmpty();
        }

        @Test
        @DisplayName("combined-image mode swaps dimensions for a rotated page")
        void combinedImageRotatedPage() throws Exception {
            byte[] bytes = simplePdfBytes();
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
            PDDocument doc = new PDDocument();
            PDPage rotated = new PDPage(new PDRectangle(20f, 30f));
            rotated.setRotation(90);
            doc.addPage(rotated);
            when(factory.load(bytes)).thenReturn(doc);

            byte[] out =
                    PdfUtils.convertFromPdf(
                            factory, bytes, "png", ImageType.RGB, true, 36, "doc", true);
            assertThat(out).isNotEmpty();
        }
    }

    // ---- convertPdfToPdfImage with ApplicationProperties present ------------

    @Nested
    @DisplayName("convertPdfToPdfImage honouring configured DPI")
    class ConvertPdfToPdfImageWithProps {

        @Test
        @DisplayName("renders using the configured max DPI when properties are present")
        void usesConfiguredDpi() throws IOException {
            try (MockedStatic<ApplicationContextProvider> ctx =
                    Mockito.mockStatic(ApplicationContextProvider.class)) {
                ctx.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                        .thenReturn(propsWithMaxDpi(72));

                try (PDDocument source = new PDDocument()) {
                    source.addPage(new PDPage(new PDRectangle(12f, 18f)));
                    try (PDDocument result = PdfUtils.convertPdfToPdfImage(source)) {
                        assertThat(result.getNumberOfPages()).isEqualTo(1);
                    }
                }
            }
        }
    }

    // ---- imageToPdf with a multi-frame TIFF --------------------------------

    @Nested
    @DisplayName("imageToPdf with TIFF input")
    class ImageToPdfTiff {

        @Test
        @DisplayName("a multi-frame TIFF produces one page per frame")
        void multiFrameTiffBecomesMultiplePages() throws IOException {
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
            when(factory.createNewDocument()).thenReturn(new PDDocument());

            MockMultipartFile tiff =
                    new MockMultipartFile("file", "scan.tiff", "image/tiff", multiFrameTiff());

            byte[] pdfOut =
                    PdfUtils.imageToPdf(
                            new MultipartFile[] {tiff}, "fillPage", false, "color", factory);

            assertThat(pdfOut).isNotEmpty();
            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdfOut)) {
                assertThat(doc.getNumberOfPages()).isEqualTo(2);
            }
        }

        @Test
        @DisplayName("a .tif extension is also handled by the TIFF reader path")
        void tifExtensionHandled() throws IOException {
            CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
            when(factory.createNewDocument()).thenReturn(new PDDocument());

            MockMultipartFile tif =
                    new MockMultipartFile(
                            "file",
                            "scan.tif",
                            MediaType.APPLICATION_OCTET_STREAM_VALUE,
                            multiFrameTiff());

            byte[] pdfOut =
                    PdfUtils.imageToPdf(
                            new MultipartFile[] {tif}, "fillPage", false, "color", factory);

            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdfOut)) {
                assertThat(doc.getNumberOfPages()).isEqualTo(2);
            }
        }
    }
}
