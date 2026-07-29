package stirling.software.SPDF.pdf.redaction;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

import lombok.extern.slf4j.Slf4j;

/** Rasterisation fallback: renders whole pages to an image so no text/vector content survives. */
@Slf4j
final class RedactionRasteriser {

    private static final float TARGET_DPI = 150f;

    // Caps the render buffer (~200 MB RGB) so an absurd page size can't demand gigabytes.
    private static final double MAX_RENDER_PIXELS = 50_000_000d;

    private RedactionRasteriser() {}

    /** 150 DPI, lowered just enough on oversized pages to stay under the pixel cap. */
    private static float effectiveDpi(PDRectangle crop) {
        double pixelsAtTarget =
                (crop.getWidth() * TARGET_DPI / 72d) * (crop.getHeight() * TARGET_DPI / 72d);
        if (pixelsAtTarget <= MAX_RENDER_PIXELS) {
            return TARGET_DPI;
        }
        float capped = (float) (TARGET_DPI * Math.sqrt(MAX_RENDER_PIXELS / pixelsAtTarget));
        log.warn(
                "Oversized page ({} x {} pt); rasterising at {} DPI instead of {}",
                crop.getWidth(),
                crop.getHeight(),
                capped,
                TARGET_DPI);
        return Math.max(18f, capped);
    }

    /** Rasterise the listed pages (all when null) at 150 DPI, replacing their content. */
    static PDDocument rasterisePages(byte[] sourceBytes, Set<Integer> pagesToRaster)
            throws IOException {
        // Load the document directly and mutate in place: rewriting
        PDDocument source = Loader.loadPDF(sourceBytes);
        try {
            PDFRenderer renderer = new PDFRenderer(source);
            int pageCount = source.getNumberOfPages();
            for (int i = 0; i < pageCount; i++) {
                if (pagesToRaster != null && !pagesToRaster.contains(i)) {
                    continue;
                }
                PDPage page = source.getPage(i);
                // PDFRenderer renders the CropBox region, so draw the raster over the CropBox (not
                // the MediaBox) or a CropBox != MediaBox page is stretched/offset.
                PDRectangle crop = page.getCropBox();
                int rotation = page.getRotation();

                BufferedImage img =
                        renderer.renderImageWithDPI(i, effectiveDpi(crop), ImageType.RGB);
                // Straight Flate encode; avoids the PNG encode/decode round-trip of
                // createFromByteArray.
                PDImageXObject imageXObject = LosslessFactory.createFromImage(source, img);

                // Drop all prior content / resources / annotations / thumbnail; the raster is the
                // page.
                page.getCOSObject().removeItem(COSName.CONTENTS);
                page.setResources(new PDResources());
                page.getCOSObject().removeItem(COSName.ANNOTS);
                page.getCOSObject().removeItem(COSName.getPDFName("Thumb"));
                // Rotation is already baked into the rendered image, so reset it to zero.
                page.setRotation(0);

                // The render swaps width/height for 90/270, so give the page the as-displayed
                // box or the landscape image would be squashed into the portrait crop rect.
                PDRectangle target = crop;
                if (rotation == 90 || rotation == 270) {
                    target = new PDRectangle(crop.getHeight(), crop.getWidth());
                    page.setMediaBox(target);
                    page.setCropBox(target);
                }

                try (PDPageContentStream cs =
                        new PDPageContentStream(
                                source,
                                page,
                                PDPageContentStream.AppendMode.OVERWRITE,
                                false,
                                true)) {
                    // The rendered image already has the rotation baked in visually
                    cs.drawImage(
                            imageXObject,
                            target.getLowerLeftX(),
                            target.getLowerLeftY(),
                            target.getWidth(),
                            target.getHeight());
                }
            }
            return source;
        } catch (IOException | RuntimeException e) {
            source.close();
            throw e;
        }
    }
}
