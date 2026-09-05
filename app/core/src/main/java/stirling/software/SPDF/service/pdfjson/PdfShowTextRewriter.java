package stirling.software.SPDF.service.pdfjson;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.font.PDFont;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.pdfjson.encoding.PdfTextEncoder;
import stirling.software.SPDF.service.pdfjson.parsing.PdfGlyphCounter;

@Slf4j
public final class PdfShowTextRewriter {
    private PdfShowTextRewriter() {}

    public static boolean rewriteShowText(
            List<Object> tokens,
            int tokenIndex,
            PDFont font,
            PdfJsonFont fontModel,
            String expectedFontName,
            PdfTextElementCursor cursor,
            boolean removeOnly,
            PdfGlyphCounter pdfGlyphCounter)
            throws IOException {
        if (font == null) {
            log.debug(
                    "rewriteShowText aborted: no active font for expected resource {}",
                    expectedFontName);
            return false;
        }
        COSString cosString = (COSString) tokens.get(tokenIndex);
        int glyphCount = pdfGlyphCounter.countGlyphs(cosString, font);
        log.trace(
                "rewriteShowText consuming {} glyphs at cursor index {} for font {}",
                glyphCount,
                cursor.getIndex(),
                expectedFontName);
        List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
        if (consumed == null) {
            log.debug(
                    "Failed to consume {} glyphs for font {} (cursor remaining {})",
                    glyphCount,
                    expectedFontName,
                    cursor.remaining());
            return false;
        }
        if (removeOnly) {
            tokens.set(tokenIndex, new COSString(new byte[0]));
            return true;
        }
        PdfTextMergeHelper.MergedText replacement = PdfTextMergeHelper.mergeText(consumed);
        try {
            byte[] encoded =
                    PdfTextEncoder.encode(
                            font, fontModel, replacement.text(), replacement.charCodes());
            if (encoded == null) {
                log.debug(
                        "Failed to map replacement text to glyphs for font {} (text='{}')",
                        expectedFontName,
                        replacement.text());
                return false;
            }
            tokens.set(tokenIndex, new COSString(encoded));
            return true;
        } catch (IOException | IllegalArgumentException | UnsupportedOperationException ex) {
            log.debug(
                    "Failed to encode replacement text with font {}: {}",
                    expectedFontName,
                    ex.getMessage());
            return false;
        }
    }
}
