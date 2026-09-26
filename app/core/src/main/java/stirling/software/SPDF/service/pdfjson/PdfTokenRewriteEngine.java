package stirling.software.SPDF.service.pdfjson;

import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.pdfjson.font.PdfFontResolver;
import stirling.software.SPDF.service.pdfjson.parsing.PdfGlyphCounter;

@Slf4j
public final class PdfTokenRewriteEngine {
    private PdfTokenRewriteEngine() {}

    public static boolean rewriteTextOperators(
            PDDocument document,
            PDPage page,
            List<PdfJsonTextElement> elements,
            boolean removeOnly,
            boolean forceRegenerate,
            Map<String, PdfJsonFont> fontLookup,
            int pageNumber,
            PdfFontResolver pdfFontResolver,
            PdfGlyphCounter pdfGlyphCounter)
            throws IOException {
        if (forceRegenerate) {
            log.debug("forceRegenerate flag set; skipping token rewrite for page");
            return false;
        }
        if (elements == null || elements.isEmpty()) {
            return true;
        }
        PDResources resources = page.getResources();
        if (resources == null) {
            return false;
        }
        try {
            log.debug("Attempting token-level rewrite for page");
            PDFStreamParser parser = new PDFStreamParser(page);
            List<Object> tokens = parser.parse();
            log.debug("Parsed {} tokens for rewrite", tokens.size());
            PdfTextElementCursor cursor = new PdfTextElementCursor(elements);
            PDFont currentFont = null;
            String currentFontName = null;
            PdfJsonFont currentFontModel = null;

            boolean encounteredModifiedFont = false;

            for (int i = 0; i < tokens.size(); i++) {
                Object token = tokens.get(i);
                if (!(token instanceof Operator operator)) {
                    continue;
                }
                String operatorName = operator.getName();
                switch (operatorName) {
                    case "Tf":
                        if (i >= 2 && tokens.get(i - 2) instanceof COSName fontResourceName) {
                            currentFont = resources.getFont(fontResourceName);
                            currentFontName = fontResourceName.getName();
                            currentFontModel =
                                    pdfFontResolver.resolve(
                                            fontLookup, pageNumber, currentFontName);
                            log.trace(
                                    "Encountered Tf operator; switching to font resource {}",
                                    currentFontName);
                            if (forceRegenerate) {
                                encounteredModifiedFont = true;
                            }
                        } else {
                            currentFont = null;
                            currentFontName = null;
                            currentFontModel = null;
                            log.debug(
                                    "Tf operator missing resource operand; clearing current font");
                        }
                        break;
                    case "Tj":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSString)) {
                            log.debug(
                                    "Encountered Tj without preceding string operand; aborting rewrite");
                            return false;
                        }
                        log.trace(
                                "Rewriting Tj operator using font {} (token index {}, cursor remaining {})",
                                currentFontName,
                                i,
                                cursor.remaining());
                        if (!PdfShowTextRewriter.rewriteShowText(
                                tokens,
                                i - 1,
                                currentFont,
                                currentFontModel,
                                currentFontName,
                                cursor,
                                removeOnly,
                                pdfGlyphCounter)) {
                            log.debug("Failed to rewrite Tj operator; aborting rewrite");
                            return false;
                        }
                        break;
                    case "TJ":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSArray array)) {
                            log.debug("Encountered TJ without array operand; aborting rewrite");
                            return false;
                        }
                        log.trace(
                                "Rewriting TJ operator using font {} (token index {}, cursor remaining {})",
                                currentFontName,
                                i,
                                cursor.remaining());
                        if (!PdfShowTextArrayRewriter.rewriteShowTextArray(
                                array,
                                currentFont,
                                currentFontModel,
                                currentFontName,
                                cursor,
                                removeOnly,
                                pdfGlyphCounter)) {
                            log.debug("Failed to rewrite TJ operator; aborting rewrite");
                            return false;
                        }
                        break;
                    default:
                        break;
                }
            }

            if (cursor.hasRemaining()) {
                log.debug("Rewrite cursor still has {} elements; falling back", cursor.remaining());
                return false;
            }

            if (forceRegenerate && encounteredModifiedFont) {
                log.debug(
                        "Rewrite succeeded but forceRegenerate=true, returning false to trigger rebuild");
                return false;
            }

            PDStream newStream = new PDStream(document);
            try (OutputStream outputStream = newStream.createOutputStream(COSName.FLATE_DECODE)) {
                new ContentStreamWriter(outputStream).writeTokens(tokens);
            }
            page.setContents(newStream);
            log.debug("Token rewrite completed successfully");
            return true;
        } catch (IOException ex) {
            log.debug("Failed to rewrite content stream: {}", ex.getMessage());
            return false;
        }
    }
}
