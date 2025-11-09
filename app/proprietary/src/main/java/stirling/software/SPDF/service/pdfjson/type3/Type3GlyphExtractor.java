package stirling.software.SPDF.service.pdfjson.type3;

import java.awt.geom.GeneralPath;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType3CharProc;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.pdfjson.type3.model.Type3GlyphOutline;

@Slf4j
@Component
public class Type3GlyphExtractor {

    public List<Type3GlyphOutline> extractGlyphs(
            PDDocument document, PDType3Font font, String fontId, int pageNumber)
            throws IOException {
        Objects.requireNonNull(font, "font");
        COSDictionary charProcs =
                (COSDictionary) font.getCOSObject().getDictionaryObject(COSName.CHAR_PROCS);
        if (charProcs == null || charProcs.size() == 0) {
            return List.of();
        }
        List<Type3GlyphOutline> outlines = new ArrayList<>();
        for (COSName glyphName : charProcs.keySet()) {
            COSStream stream =
                    charProcs.getDictionaryObject(glyphName) instanceof COSStream cosStream
                            ? cosStream
                            : null;
            if (stream == null) {
                continue;
            }
            PDType3CharProc charProc = new PDType3CharProc(font, stream);
            outlines.add(analyseGlyph(document, font, glyphName, charProc, fontId, pageNumber));
        }
        return outlines;
    }

    private Type3GlyphOutline analyseGlyph(
            PDDocument document,
            PDType3Font font,
            COSName glyphName,
            PDType3CharProc charProc,
            String fontId,
            int pageNumber)
            throws IOException {
        int code = resolveCharCode(font, glyphName.getName());
        float advanceWidth = 0f;
        if (code >= 0) {
            advanceWidth = font.getWidthFromFont(code);
        }

        PDRectangle glyphBBox = extractGlyphBoundingBox(font, charProc);
        PDRectangle bbox = font.getFontBBox();
        GlyphGraphicsExtractor extractor =
                new GlyphGraphicsExtractor(new PDPage(bbox != null ? bbox : new PDRectangle()));
        extractor.process(charProc);
        GeneralPath outline = extractor.getAccumulatedPath();
        Integer unicodeValue = null;
        if (code >= 0) {
            String unicode = font.toUnicode(code);
            if (unicode != null && !unicode.isEmpty()) {
                unicodeValue = unicode.codePointAt(0);
            } else {
                unicodeValue = code;
            }
        }
        return Type3GlyphOutline.builder()
                .glyphName(glyphName.getName())
                .charCode(code)
                .advanceWidth(advanceWidth)
                .boundingBox(glyphBBox)
                .outline(outline)
                .hasFill(extractor.isSawFill())
                .hasStroke(extractor.isSawStroke())
                .hasImages(extractor.isSawImage())
                .hasText(extractor.isSawText())
                .hasShading(extractor.isSawShading())
                .warnings(extractor.getWarnings())
                .unicode(unicodeValue)
                .build();
    }

    private PDRectangle extractGlyphBoundingBox(PDType3Font font, PDType3CharProc charProc) {
        COSStream stream = charProc != null ? charProc.getCOSObject() : null;
        if (stream != null) {
            COSArray bboxArray = (COSArray) stream.getDictionaryObject(COSName.BBOX);
            if (bboxArray != null && bboxArray.size() == 4) {
                return new PDRectangle(bboxArray);
            }
        }
        return font.getFontBBox();
    }

    private int resolveCharCode(PDType3Font font, String glyphName) {
        if (glyphName == null || font.getEncoding() == null) {
            return -1;
        }
        for (int code = 0; code <= 0xFF; code++) {
            String name = font.getEncoding().getName(code);
            if (glyphName.equals(name)) {
                return code;
            }
        }
        return -1;
    }

    private static final class GlyphGraphicsExtractor extends Type3GraphicsEngine {
        GlyphGraphicsExtractor(PDPage page) {
            super(page);
        }
    }
}
