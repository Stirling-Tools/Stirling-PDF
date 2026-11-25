package stirling.software.SPDF.pdf.signature;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.apache.fontbox.ttf.CmapLookup;
import org.apache.fontbox.ttf.TTFParser;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.core.io.ClassPathResource;

import lombok.extern.slf4j.Slf4j;

/**
 * Writes visible-signature text in any script the bundled Noto fonts cover. Each character is drawn
 * with the first face that has a glyph for it, so a Latin label with a Japanese or Cyrillic name
 * mixes faces within one line. Faces are parsed only when a character needs them and are embedded
 * as subsets. A character no bundled face covers is drawn as {@code ?}: signing must not fail over
 * display text, and the certificate itself is unaffected.
 *
 * <p>Glyphs are placed in logical order without shaping, so Arabic and Indic text is legible letter
 * by letter but not joined. Not thread-safe; use one instance per document.
 */
@Slf4j
public final class SignatureTextWriter {

    private static final List<String> FACES =
            List.of(
                    "static/fonts/NotoSans-Bold.ttf",
                    "static/fonts/NotoSansSC-Regular.ttf",
                    "static/fonts/NotoSansJP-Regular.ttf",
                    "static/fonts/NotoSansKR-Regular.ttf",
                    "static/fonts/NotoSansArabic-Regular.ttf",
                    "static/fonts/NotoSansHebrew-Regular.ttf",
                    "static/fonts/NotoSansThai-Regular.ttf",
                    "static/fonts/NotoSansDevanagari-Regular.ttf",
                    "static/fonts/NotoSansMalayalam-Regular.ttf");

    private static final int REPLACEMENT = '?';

    private static final class Face {
        private final TrueTypeFont ttf;
        private final CmapLookup cmap;
        private PDType0Font font;

        Face(TrueTypeFont ttf) throws IOException {
            this.ttf = ttf;
            this.cmap = ttf.getUnicodeCmapLookup();
        }

        boolean covers(int codePoint) {
            return cmap.getGlyphId(codePoint) != 0;
        }

        PDType0Font font(PDDocument document) throws IOException {
            if (font == null) {
                font = PDType0Font.load(document, ttf, true);
            }
            return font;
        }
    }

    private record Run(Face face, String text) {}

    private final PDDocument document;
    private final Face[] faces = new Face[FACES.size()];
    private final boolean[] unavailable = new boolean[FACES.size()];

    public SignatureTextWriter(PDDocument document) {
        this.document = document;
    }

    /** Shows {@code text} at the current text position; the caller is inside BT/ET. */
    public void showText(PDPageContentStream stream, String text, float fontSize)
            throws IOException {
        for (Run run : runs(text)) {
            stream.setFont(run.face().font(document), fontSize);
            stream.showText(run.text());
        }
    }

    private List<Run> runs(String text) throws IOException {
        List<Run> runs = new ArrayList<>();
        Face current = null;
        StringBuilder pending = new StringBuilder();
        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            i += Character.charCount(codePoint);
            Face face = faceFor(codePoint);
            if (face == null) {
                face = face(0);
                codePoint = REPLACEMENT;
            }
            if (face != current && !pending.isEmpty()) {
                runs.add(new Run(current, pending.toString()));
                pending.setLength(0);
            }
            current = face;
            pending.appendCodePoint(codePoint);
        }
        if (!pending.isEmpty()) {
            runs.add(new Run(current, pending.toString()));
        }
        return runs;
    }

    private Face faceFor(int codePoint) throws IOException {
        for (int index = 0; index < FACES.size(); index++) {
            Face face = face(index);
            if (face != null && face.covers(codePoint)) {
                return face;
            }
        }
        return null;
    }

    /** The face at {@code index}, or null when it cannot be read; the primary face must load. */
    private Face face(int index) throws IOException {
        if (faces[index] == null && !unavailable[index]) {
            try {
                faces[index] = load(FACES.get(index));
            } catch (IOException e) {
                if (index == 0) {
                    throw e;
                }
                log.warn("Signature font {} unavailable: {}", FACES.get(index), e.getMessage());
                unavailable[index] = true;
            }
        }
        return faces[index];
    }

    private Face load(String resource) throws IOException {
        TrueTypeFont ttf;
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            ttf = new TTFParser().parse(new RandomAccessReadBuffer(in));
        }
        document.registerTrueTypeFontForClosing(ttf);
        return new Face(ttf);
    }
}
