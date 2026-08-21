package stirling.software.saas.procurement.legal;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.TempFileManager;

/**
 * Renders an assembled agreement's markdown to a PDF, dogfooding Stirling's own conversion path:
 * commonmark (markdown → HTML) then {@link FileToPdf#convertHtmlToPdf} (HTML → PDF via WeasyPrint),
 * the same pipeline as the product's Markdown-to-PDF tool.
 *
 * <p>The signed PDF is a stored artifact, but it must never block signing: {@link #tryRender}
 * returns {@code null} if the conversion runtime (WeasyPrint) is unavailable, so the signature is
 * still recorded and the buyer keeps the on-the-fly download.
 */
@Service
@RequiredArgsConstructor
public class AgreementPdfRenderer {

    private final RuntimePathConfig runtimePathConfig;
    private final TempFileManager tempFileManager;
    private final CustomHtmlSanitizer customHtmlSanitizer;
    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private static final List<Extension> EXTENSIONS = List.of(TablesExtension.create());

    /** Render to PDF, or return null if the conversion runtime isn't available. */
    public byte[] tryRender(String markdown) {
        try {
            return render(markdown);
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(AgreementPdfRenderer.class)
                    .warn(
                            "[legal] agreement PDF render unavailable; recording signature without a"
                                    + " stored PDF: {}",
                            e.getMessage());
            return null;
        }
    }

    private byte[] render(String markdown) throws Exception {
        Parser parser = Parser.builder().extensions(EXTENSIONS).build();
        Node document = parser.parse(markdown);
        HtmlRenderer renderer = HtmlRenderer.builder().extensions(EXTENSIONS).build();
        String html = renderer.render(document);

        byte[] pdfBytes =
                FileToPdf.convertHtmlToPdf(
                        runtimePathConfig.getWeasyPrintPath(),
                        null,
                        html.getBytes(StandardCharsets.UTF_8),
                        "agreement.html",
                        tempFileManager,
                        customHtmlSanitizer);
        return pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);
    }
}
