package stirling.software.SPDF.pdf.parser;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.pdf.parser.PageImageLocator.ImageBox;

/**
 * Unit tests for {@link PageImageLocator}. PDFs are built in memory with PDFBox so each test is
 * deterministic and needs no fixtures or native libraries. The locator transforms the image unit
 * square through the CTM, so an image drawn at {@code (x, y)} with size {@code (w, h)} must yield
 * the box {@code (x, y, x+w, y+h)}.
 */
class PageImageLocatorTest {

    /** A tiny opaque raster; pixel content is irrelevant, only its placement matters. */
    private static PDImageXObject tinyImage(PDDocument doc) throws Exception {
        BufferedImage img = new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB);
        return LosslessFactory.createFromImage(doc, img);
    }

    /** Builds a one-page PDF that draws one image at the given placement. */
    private static byte[] pdfWithImageAt(float x, float y, float w, float h) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDImageXObject image = tinyImage(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(image, x, y, w, h);
            }
            return save(doc);
        }
    }

    private static byte[] save(PDDocument doc) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }

    @Nested
    @DisplayName("drawImage bounding boxes")
    class DrawImageBoxes {

        @Test
        @DisplayName("a single image yields one box with the page index and CTM-derived bounds")
        void singleImageBox() throws Exception {
            byte[] pdf = pdfWithImageAt(100f, 200f, 50f, 80f);
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                PageImageLocator locator = new PageImageLocator(doc.getPage(0), 0);
                locator.processPage(doc.getPage(0));

                List<ImageBox> boxes = locator.getImageBoxes();
                assertThat(boxes).hasSize(1);
                ImageBox box = boxes.get(0);
                assertThat(box.pageIndex()).isZero();
                assertThat(box.x1()).isCloseTo(100f, within(0.5f));
                assertThat(box.y1()).isCloseTo(200f, within(0.5f));
                assertThat(box.x2()).isCloseTo(150f, within(0.5f));
                assertThat(box.y2()).isCloseTo(280f, within(0.5f));
            }
        }

        @Test
        @DisplayName("the supplied page index is stored on every box")
        void pageIndexStored() throws Exception {
            byte[] pdf = pdfWithImageAt(10f, 10f, 20f, 20f);
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                PageImageLocator locator = new PageImageLocator(doc.getPage(0), 7);
                locator.processPage(doc.getPage(0));
                assertThat(locator.getImageBoxes().get(0).pageIndex()).isEqualTo(7);
            }
        }

        @Test
        @DisplayName("two images on one page yield two boxes")
        void twoImages() throws Exception {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                PDImageXObject image = tinyImage(doc);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(image, 50f, 50f, 30f, 30f);
                    cs.drawImage(image, 200f, 400f, 60f, 40f);
                }
                byte[] pdf = save(doc);
                try (PDDocument reopened = Loader.loadPDF(pdf)) {
                    PageImageLocator locator = new PageImageLocator(reopened.getPage(0), 0);
                    locator.processPage(reopened.getPage(0));
                    assertThat(locator.getImageBoxes()).hasSize(2);
                }
            }
        }

        @Test
        @DisplayName("a page with no images yields no boxes")
        void noImages() throws Exception {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                byte[] pdf = save(doc);
                try (PDDocument reopened = Loader.loadPDF(pdf)) {
                    PageImageLocator locator = new PageImageLocator(reopened.getPage(0), 0);
                    locator.processPage(reopened.getPage(0));
                    assertThat(locator.getImageBoxes()).isEmpty();
                }
            }
        }

        @Test
        @DisplayName("getImageBoxes is empty before any page is processed")
        void emptyBeforeProcessing() throws Exception {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                PageImageLocator locator = new PageImageLocator(doc.getPage(0), 0);
                assertThat(locator.getImageBoxes()).isEmpty();
            }
        }
    }

    @Nested
    @DisplayName("path operation no-ops")
    class PathNoOps {

        private PageImageLocator newLocator() {
            PDPage page = new PDPage(PDRectangle.A4);
            return new PageImageLocator(page, 0);
        }

        @Test
        @DisplayName("moveTo updates the current point")
        void moveToUpdatesPoint() {
            PageImageLocator locator = newLocator();
            locator.moveTo(12f, 34f);
            Point2D current = locator.getCurrentPoint();
            assertThat(current.getX()).isEqualTo(12d);
            assertThat(current.getY()).isEqualTo(34d);
        }

        @Test
        @DisplayName("lineTo updates the current point")
        void lineToUpdatesPoint() {
            PageImageLocator locator = newLocator();
            locator.lineTo(5f, 6f);
            assertThat(locator.getCurrentPoint().getX()).isEqualTo(5d);
            assertThat(locator.getCurrentPoint().getY()).isEqualTo(6d);
        }

        @Test
        @DisplayName("curveTo updates the current point to the final control point")
        void curveToUpdatesPoint() {
            PageImageLocator locator = newLocator();
            locator.curveTo(1f, 1f, 2f, 2f, 9f, 8f);
            assertThat(locator.getCurrentPoint().getX()).isEqualTo(9d);
            assertThat(locator.getCurrentPoint().getY()).isEqualTo(8d);
        }

        @Test
        @DisplayName("rectangle, clip, path and shading operations are no-ops that do not throw")
        void otherOpsDoNotThrow() {
            PageImageLocator locator = newLocator();
            Point2D p = new Point2D.Float(0f, 0f);
            // None of these record anything or alter state; they must simply not throw.
            locator.appendRectangle(p, p, p, p);
            locator.clip(0);
            locator.closePath();
            locator.endPath();
            locator.strokePath();
            locator.fillPath(0);
            locator.fillAndStrokePath(0);
            locator.shadingFill(COSName.getPDFName("Sh0"));
            assertThat(locator.getImageBoxes()).isEmpty();
        }
    }
}
