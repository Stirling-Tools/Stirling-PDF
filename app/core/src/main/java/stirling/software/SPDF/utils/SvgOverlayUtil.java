package stirling.software.SPDF.utils;

import java.io.ByteArrayInputStream;
import java.io.IOException;

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
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.w3c.dom.svg.SVGDocument;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import de.rototor.pdfbox.graphics2d.PdfBoxGraphics2D;

@UtilityClass
@Slf4j
public class SvgOverlayUtil {

    public void overlaySvgOnPage(
            PDDocument document, PDPage page, byte[] svgBytes, float x, float y)
            throws IOException {
        try {
            String parser = XMLResourceDescriptor.getXMLParserClassName();
            SAXSVGDocumentFactory factory = new SAXSVGDocumentFactory(parser);

            SVGDocument svgDoc;
            try (ByteArrayInputStream inputStream = new ByteArrayInputStream(svgBytes)) {
                svgDoc = factory.createSVGDocument("file:///overlay.svg", inputStream);
            }

            UserAgent userAgent = new UserAgentAdapter();
            DocumentLoader loader = new DocumentLoader(userAgent);
            BridgeContext ctx = new BridgeContext(userAgent, loader);
            ctx.setDynamicState(BridgeContext.DYNAMIC);

            GVTBuilder builder = new GVTBuilder();
            GraphicsNode rootNode = builder.build(ctx, svgDoc);

            float svgWidth = (float) ctx.getDocumentSize().getWidth();
            float svgHeight = (float) ctx.getDocumentSize().getHeight();

            PdfBoxGraphics2D pdfGraphics = new PdfBoxGraphics2D(document, svgWidth, svgHeight);

            try {
                rootNode.paint(pdfGraphics);
            } finally {
                pdfGraphics.dispose();
            }

            PDFormXObject xform = pdfGraphics.getXFormObject();

            try (PDPageContentStream newContentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                newContentStream.saveGraphicsState();

                newContentStream.transform(new Matrix(1, 0, 0, 1, x, y));

                newContentStream.drawForm(xform);

                newContentStream.restoreGraphicsState();
            }

            log.info("SVG successfully overlaid as vector graphic at ({}, {})", x, y);

        } catch (Exception e) {
            log.error("Failed to overlay SVG as vector graphic", e);
            throw new IOException("SVG overlay failed: " + e.getMessage(), e);
        }
    }

    public boolean isSvgImage(byte[] bytes) {
        if (bytes == null || bytes.length < 5) {
            return false;
        }
        // Check for SVG markers: <?xml or <svg
        String start =
                new String(
                                bytes,
                                0,
                                Math.min(200, bytes.length),
                                java.nio.charset.StandardCharsets.UTF_8)
                        .toLowerCase();
        return start.contains("<svg") || (start.contains("<?xml") && start.contains("svg"));
    }
}
