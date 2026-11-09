package stirling.software.proprietary.mcp.files;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.McpCallContext;

/** Page count and a small first-page thumbnail for the MCP result card. */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpPreview {

    // Thumbnails are a nicety: skip big inputs rather than slow every result down.
    static final long MAX_BYTES = 25L * 1024 * 1024;
    private static final float WIDTH = 240f;
    private static final float HEIGHT = 480f;
    private static final float MAX_SCALE = 1f;
    // Both sides are bounded, so a crafted page box can't ask for a huge bitmap.
    private static final long MAX_PIXELS = (long) (WIDTH * HEIGHT);

    private final ApplicationProperties applicationProperties;

    public McpPreview(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    public record Preview(int pageCount, String imageDataUrl) {}

    /** Worth rendering: the widget is on and the client shows it (unknown on old protocols). */
    public boolean wanted(McpCallContext context) {
        if (!applicationProperties.getMcp().isWidgetEnabled()) {
            return false;
        }
        return context == null || context.clientCapabilities() == null || context.rendersApps();
    }

    /** Small enough to load for a preview or page count; checked before reading the file. */
    public boolean fits(long size) {
        return size > 0 && size <= MAX_BYTES;
    }

    /** The page count without rendering, or null when the PDF can't be read. */
    public Integer pageCount(byte[] pdf) {
        if (pdf == null || pdf.length == 0 || pdf.length > MAX_BYTES) {
            return null;
        }
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return document.getNumberOfPages();
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** Null when the bytes are not a readable PDF (encrypted, damaged, too large). */
    public Preview of(byte[] pdf) {
        if (pdf == null || pdf.length == 0 || pdf.length > MAX_BYTES) {
            return null;
        }
        try (PDDocument document = Loader.loadPDF(pdf)) {
            int pages = document.getNumberOfPages();
            if (pages == 0) {
                return new Preview(0, null);
            }
            PDRectangle box = document.getPage(0).getCropBox();
            float width = Math.max(1f, box.getWidth());
            float height = Math.max(1f, box.getHeight());
            float scale = Math.min(MAX_SCALE, Math.min(WIDTH / width, HEIGHT / height));
            if ((long) Math.ceil(width * scale) * (long) Math.ceil(height * scale) > MAX_PIXELS) {
                return new Preview(pages, null);
            }
            PDFRenderer renderer = new PDFRenderer(document);
            renderer.setSubsamplingAllowed(true);
            BufferedImage image = renderer.renderImage(0, scale, ImageType.RGB);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "jpg", out);
            return new Preview(
                    pages,
                    "data:image/jpeg;base64,"
                            + Base64.getEncoder().encodeToString(out.toByteArray()));
        } catch (IOException | RuntimeException e) {
            log.debug("No MCP preview: {}", e.getMessage());
            return null;
        }
    }
}
