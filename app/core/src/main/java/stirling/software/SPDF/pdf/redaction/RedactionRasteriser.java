package stirling.software.SPDF.pdf.redaction;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Set;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

import lombok.extern.slf4j.Slf4j;

/** Rasterisation fallback: renders whole pages to an image so no text/vector content survives. */
@Slf4j
final class RedactionRasteriser {

    private RedactionRasteriser() {}

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

                BufferedImage img = renderer.renderImageWithDPI(i, 150, ImageType.RGB);
                ByteArrayOutputStream imgOut = new ByteArrayOutputStream();
                ImageIO.write(img, "png", imgOut);
                PDImageXObject imageXObject =
                        PDImageXObject.createFromByteArray(
                                source, imgOut.toByteArray(), "redacted-page-" + i);

                // Drop all prior content / resources / annotations / thumbnail; the raster is the
                // page.
                page.getCOSObject().removeItem(COSName.CONTENTS);
                page.setResources(new PDResources());
                page.getCOSObject().removeItem(COSName.ANNOTS);
                page.getCOSObject().removeItem(COSName.getPDFName("Thumb"));
                // Rotation is already baked into the rendered image, so reset it to zero.
                page.setRotation(0);

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
                            crop.getLowerLeftX(),
                            crop.getLowerLeftY(),
                            crop.getWidth(),
                            crop.getHeight());
                }
            }
            return source;
        } catch (IOException | RuntimeException e) {
            source.close();
            throw e;
        }
    }
}
