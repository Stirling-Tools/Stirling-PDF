package stirling.software.SPDF.utils;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.apache.batik.anim.dom.SAXSVGDocumentFactory;
import org.apache.batik.bridge.BridgeContext;
import org.apache.batik.bridge.DocumentLoader;
import org.apache.batik.bridge.GVTBuilder;
import org.apache.batik.bridge.UserAgent;
import org.apache.batik.bridge.UserAgentAdapter;
import org.apache.batik.gvt.GraphicsNode;
import org.apache.batik.util.XMLResourceDescriptor;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.w3c.dom.svg.SVGDocument;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import de.rototor.pdfbox.graphics2d.PdfBoxGraphics2D;

@UtilityClass
@Slf4j
public class SvgToPdf {

    /** Default page width in points (A4) */
    private static final float DEFAULT_PAGE_WIDTH = 595f;

    /** Default page height in points (A4) */
    private static final float DEFAULT_PAGE_HEIGHT = 842f;

    /** Timeout for SVG rendering in seconds (prevents DoS via complex SVGs) */
    private static final int RENDERING_TIMEOUT_SECONDS = 30;

    public byte[] convert(byte[] svgBytes) throws IOException {
        if (svgBytes == null || svgBytes.length == 0) {
            throw new IOException("SVG input is empty or null");
        }

        log.debug("Starting SVG to PDF conversion, input size: {} bytes", svgBytes.length);

        try {
            // 1. Load SVG using Batik
            String parser = XMLResourceDescriptor.getXMLParserClassName();
            SAXSVGDocumentFactory factory = new SAXSVGDocumentFactory(parser);

            SVGDocument svgDoc;
            try (ByteArrayInputStream inputStream = new ByteArrayInputStream(svgBytes)) {
                svgDoc = factory.createSVGDocument("file:///input.svg", inputStream);
            }

            // 2. Build the GVT (Graphics Vector Tree) with timeout protection
            UserAgent userAgent = new UserAgentAdapter();
            DocumentLoader loader = new DocumentLoader(userAgent);
            BridgeContext ctx = new BridgeContext(userAgent, loader);
            ctx.setDynamicState(BridgeContext.DYNAMIC);

            GraphicsNode rootNode = buildGvtWithTimeout(ctx, svgDoc);

            // 3. Get SVG dimensions
            float width = (float) ctx.getDocumentSize().getWidth();
            float height = (float) ctx.getDocumentSize().getHeight();

            if (width <= 0) {
                width = DEFAULT_PAGE_WIDTH;
                log.warn("SVG width not specified, using default: {}", width);
            }
            if (height <= 0) {
                height = DEFAULT_PAGE_HEIGHT;
                log.warn("SVG height not specified, using default: {}", height);
            }

            log.debug("SVG dimensions: {}x{} points", width, height);

            // 4. Create PDF document and render
            return renderToPdf(rootNode, width, height);

        } catch (Exception e) {
            log.error("Failed to convert SVG to PDF", e);
            throw new IOException("SVG to PDF conversion failed: " + e.getMessage(), e);
        }
    }

    private GraphicsNode buildGvtWithTimeout(BridgeContext ctx, SVGDocument svgDoc)
            throws IOException {
        GVTBuilder builder = new GVTBuilder();
        ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

        Callable<GraphicsNode> buildTask = () -> builder.build(ctx, svgDoc);
        Future<GraphicsNode> future = executor.submit(buildTask);

        try {
            return future.get(RENDERING_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new IOException(
                    "SVG rendering timed out after "
                            + RENDERING_TIMEOUT_SECONDS
                            + " seconds. The SVG may be too complex.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("SVG rendering was interrupted", e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            throw new IOException(
                    "SVG rendering failed: "
                            + (cause != null ? cause.getMessage() : e.getMessage()),
                    cause);
        } finally {
            executor.shutdownNow();
        }
    }

    private byte[] renderToPdf(GraphicsNode rootNode, float width, float height)
            throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {

            PDPage page = new PDPage(new PDRectangle(width, height));
            document.addPage(page);

            // Create and use PdfBoxGraphics2D with proper resource management
            PdfBoxGraphics2D pdfGraphics = new PdfBoxGraphics2D(document, width, height);
            try {
                rootNode.paint(pdfGraphics);
            } finally {
                pdfGraphics.dispose();
            }

            PDFormXObject xform = pdfGraphics.getXFormObject();
            try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
                contentStream.drawForm(xform);
            }

            document.save(outputStream);

            byte[] result = outputStream.toByteArray();
            log.debug("SVG to PDF conversion complete, output size: {} bytes", result.length);

            return result;
        }
    }

    public byte[] combineIntoPdf(List<byte[]> svgBytesList) throws IOException {
        if (svgBytesList == null || svgBytesList.isEmpty()) {
            throw new IOException("SVG list is empty or null");
        }

        log.debug("Combining {} SVG files into single PDF", svgBytesList.size());

        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {

            for (int i = 0; i < svgBytesList.size(); i++) {
                byte[] svgBytes = svgBytesList.get(i);
                if (svgBytes == null || svgBytes.length == 0) {
                    log.warn("Skipping empty SVG at index {}", i);
                    continue;
                }

                try {
                    addSvgAsPage(document, svgBytes);
                    log.debug("Added SVG {} of {} to combined PDF", i + 1, svgBytesList.size());
                } catch (Exception e) {
                    log.error("Failed to add SVG {} to combined PDF: {}", i, e.getMessage());
                    // Continue with other SVGs
                }
            }

            if (document.getNumberOfPages() == 0) {
                throw new IOException("No SVG files were successfully added to the PDF");
            }

            document.save(outputStream);
            byte[] result = outputStream.toByteArray();
            log.debug(
                    "Combined SVG to PDF conversion complete, output size: {} bytes",
                    result.length);
            return result;
        }
    }

    private void addSvgAsPage(PDDocument document, byte[] svgBytes) throws IOException {
        String parser = XMLResourceDescriptor.getXMLParserClassName();
        SAXSVGDocumentFactory factory = new SAXSVGDocumentFactory(parser);

        SVGDocument svgDoc;
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(svgBytes)) {
            svgDoc = factory.createSVGDocument("file:///input.svg", inputStream);
        }

        UserAgent userAgent = new UserAgentAdapter();
        DocumentLoader loader = new DocumentLoader(userAgent);
        BridgeContext ctx = new BridgeContext(userAgent, loader);
        ctx.setDynamicState(BridgeContext.DYNAMIC);

        GraphicsNode rootNode = buildGvtWithTimeout(ctx, svgDoc);

        float svgWidth = (float) ctx.getDocumentSize().getWidth();
        float svgHeight = (float) ctx.getDocumentSize().getHeight();

        if (svgWidth <= 0) svgWidth = DEFAULT_PAGE_WIDTH;
        if (svgHeight <= 0) svgHeight = DEFAULT_PAGE_HEIGHT;

        // Use SVG dimensions directly for the PDF page
        PDPage page = new PDPage(new PDRectangle(svgWidth, svgHeight));
        document.addPage(page);

        PdfBoxGraphics2D pdfGraphics = new PdfBoxGraphics2D(document, svgWidth, svgHeight);
        try {
            rootNode.paint(pdfGraphics);
        } finally {
            pdfGraphics.dispose();
        }

        PDFormXObject xform = pdfGraphics.getXFormObject();
        try (PDPageContentStream contentStream = new PDPageContentStream(document, page)) {
            contentStream.drawForm(xform);
        }
    }
}
