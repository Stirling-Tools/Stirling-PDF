package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.IOException;

import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.misc.AdjustContrastRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Server-side twin of the editor's client-side Adjust Colors/Contrast tool. Rendering scale, page
 * geometry and the per-pixel maths must stay in sync with {@code
 * frontend/editor/src/core/hooks/tools/adjustContrast/useAdjustContrastOperation.ts} and {@code
 * frontend/editor/src/core/components/tools/adjustContrast/utils.ts}, or the API and the editor
 * produce different files for the same settings.
 */
@MiscApi
@RequiredArgsConstructor
public class AdjustContrastController {

    /** The editor renders with pdf.js at viewport scale 2, i.e. 144 DPI. */
    private static final float RENDER_SCALE = 2f;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/adjust-contrast",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Adjust colors and contrast of a PDF",
            description =
                    "Rasterises every page and adjusts its contrast, brightness, saturation and"
                            + " red/green/blue levels. Each value is a percentage from 0 to 200,"
                            + " where 100 leaves the page unchanged. The output is image-only, so"
                            + " text is no longer selectable.")
    public ResponseEntity<Resource> adjustContrast(
            @Valid @ModelAttribute AdjustContrastRequest request) throws IOException {
        try (PDDocument source = pdfDocumentFactory.load(request);
                PDDocument output =
                        pdfDocumentFactory.createNewDocument(
                                MemoryUsageSetting.setupTempFileOnly())) {
            PDFRenderer renderer = new PDFRenderer(source);
            int pageCount = source.getNumberOfPages();
            for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                int pageNumber = pageIndex + 1;
                int index = pageIndex;
                BufferedImage image =
                        ExceptionUtils.handleOomRendering(
                                pageNumber,
                                (int) (RENDER_SCALE * 72),
                                () -> renderer.renderImage(index, RENDER_SCALE, ImageType.RGB));
                adjustPixels(image, request);
                appendImagePage(output, image);
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    output,
                    GeneralUtils.generateFilename(
                            request.getFileInput().getOriginalFilename(), "_adjusted.pdf"),
                    tempFileManager);
        }
    }

    private static void appendImagePage(PDDocument output, BufferedImage image) throws IOException {
        float width = image.getWidth() / RENDER_SCALE;
        float height = image.getHeight() / RENDER_SCALE;
        PDPage page = new PDPage(new PDRectangle(width, height));
        output.addPage(page);
        PDImageXObject xObject = LosslessFactory.createFromImage(output, image);
        try (PDPageContentStream contentStream = new PDPageContentStream(output, page)) {
            contentStream.drawImage(xObject, 0, 0, width, height);
        }
    }

    private static void adjustPixels(BufferedImage image, AdjustContrastRequest request) {
        // ImageType.RGB renders to TYPE_INT_RGB, so the raster is one packed int per pixel.
        int[] pixels = ((DataBufferInt) image.getRaster().getDataBuffer()).getData();
        ColorAdjustment adjustment = ColorAdjustment.from(request);
        for (int i = 0; i < pixels.length; i++) {
            pixels[i] = adjustment.apply(pixels[i]);
        }
    }

    /**
     * Factors as fractions (percent / 100). {@link #apply} is a line-for-line port of {@code
     * applyAdjustmentsToCanvas} in the editor, including its clamping points and its HSL
     * round-trip, so both produce the same bytes from the same rendered pixel.
     */
    record ColorAdjustment(
            double contrast,
            double brightness,
            double saturation,
            double red,
            double green,
            double blue) {

        static ColorAdjustment from(AdjustContrastRequest request) {
            return new ColorAdjustment(
                    request.getContrast() / 100.0,
                    request.getBrightness() / 100.0,
                    request.getSaturation() / 100.0,
                    request.getRed() / 100.0,
                    request.getGreen() / 100.0,
                    request.getBlue() / 100.0);
        }

        /** Maps one opaque {@code 0xRRGGBB} pixel. */
        int apply(int rgb) {
            double r = ((rgb >> 16) & 0xFF) * red;
            double g = ((rgb >> 8) & 0xFF) * green;
            double b = (rgb & 0xFF) * blue;

            r = clamp((r - 128) * contrast + 128);
            g = clamp((g - 128) * contrast + 128);
            b = clamp((b - 128) * contrast + 128);

            r = clamp(r * brightness);
            g = clamp(g * brightness);
            b = clamp(b * brightness);

            double rn = r / 255;
            double gn = g / 255;
            double bn = b / 255;
            double max = Math.max(rn, Math.max(gn, bn));
            double min = Math.min(rn, Math.min(gn, bn));
            double h = 0;
            double s = 0;
            double l = (max + min) / 2;
            if (max != min) {
                double d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                if (max == rn) {
                    h = (gn - bn) / d + (gn < bn ? 6 : 0);
                } else if (max == gn) {
                    h = (bn - rn) / d + 2;
                } else {
                    h = (rn - gn) / d + 4;
                }
                h /= 6;
            }
            s = Math.min(1, Math.max(0, s * saturation));

            double r2;
            double g2;
            double b2;
            if (s == 0) {
                r2 = g2 = b2 = l;
            } else {
                double q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                double p = 2 * l - q;
                r2 = hueToRgb(p, q, h + 1.0 / 3);
                g2 = hueToRgb(p, q, h);
                b2 = hueToRgb(p, q, h - 1.0 / 3);
            }
            return (toByte(r2) << 16) | (toByte(g2) << 8) | toByte(b2);
        }

        private static double hueToRgb(double p, double q, double t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1.0 / 6) return p + (q - p) * 6 * t;
            if (t < 1.0 / 2) return q;
            if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6;
            return p;
        }

        private static double clamp(double value) {
            return Math.min(255, Math.max(0, value));
        }

        /** JS {@code Math.round} rounds halves up, as does {@link Math#round(double)}. */
        private static int toByte(double unit) {
            return (int) clamp(Math.round(unit * 255));
        }
    }
}
