package stirling.software.SPDF.service.pdfjson;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.font.PDFont;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.pdfjson.encoding.PdfTextEncoder;
import stirling.software.SPDF.service.pdfjson.parsing.PdfGlyphCounter;

@Slf4j
public final class PdfShowTextArrayRewriter {
    private PdfShowTextArrayRewriter() {}

    public static boolean rewriteShowTextArray(
            COSArray array,
            PDFont font,
            PdfJsonFont fontModel,
            String expectedFontName,
            PdfTextElementCursor cursor,
            boolean removeOnly,
            PdfGlyphCounter pdfGlyphCounter)
            throws IOException {
        if (font == null) {
            log.debug(
                    "rewriteShowTextArray aborted: no active font for expected resource {}",
                    expectedFontName);
            return false;
        }
        for (int i = 0; i < array.size(); i++) {
            COSBase element = array.get(i);
            if (element instanceof COSString cosString) {
                int glyphCount = pdfGlyphCounter.countGlyphs(cosString, font);
                List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
                if (consumed == null) {
                    log.debug(
                            "Failed to consume {} glyphs for font {} in TJ segment {} (cursor remaining {})",
                            glyphCount,
                            expectedFontName,
                            i,
                            cursor.remaining());
                    return false;
                }
                if (removeOnly) {
                    array.set(i, new COSString(new byte[0]));
                    continue;
                }
                PdfTextMergeHelper.MergedText replacement = PdfTextMergeHelper.mergeText(consumed);
                try {
                    byte[] encoded =
                            PdfTextEncoder.encode(
                                    font, fontModel, replacement.text(), replacement.charCodes());
                    if (encoded == null) {
                        log.debug(
                                "Failed to map replacement text in TJ array for font {} segment {}",
                                expectedFontName,
                                i);
                        return false;
                    }
                    array.set(i, new COSString(encoded));
                } catch (IOException
                        | IllegalArgumentException
                        | UnsupportedOperationException ex) {
                    log.debug(
                            "Failed to encode replacement text in TJ array for font {} segment {}: {}",
                            expectedFontName,
                            i,
                            ex.getMessage());
                    return false;
                }
            }
        }
        return true;
    }
}
