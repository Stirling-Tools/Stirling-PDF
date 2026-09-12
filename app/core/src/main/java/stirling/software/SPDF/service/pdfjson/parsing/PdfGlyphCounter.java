package stirling.software.SPDF.service.pdfjson.parsing;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Component owning glyph-counting utilities extracted from PdfJsonConversionService.
 *
 * <p>Behavior, logging, and exception semantics are preserved exactly.
 */
@Component
public class PdfGlyphCounter {

    private static final Logger log = LoggerFactory.getLogger(PdfGlyphCounter.class);

    /**
     * Count how many codes the supplied {@code reader} can extract from {@code inputStream}, with
     * two safety nets that PDFBox's raw {@link
     * org.apache.pdfbox.pdmodel.font.PDFont#readCode(InputStream)} loop lacks:
     *
     * <ol>
     *   <li>Stop when the stream is empty (a corrupt CMap can otherwise loop forever returning
     *       successfully-matched zero-bytes from an exhausted {@link ByteArrayInputStream}).
     *   <li>Stop when a {@code readCode} call did not consume any bytes, even if it returned a
     *       non-{@code -1} value.
     * </ol>
     *
     * Both conditions were observed in the wild on round-tripped fallback fonts where the embedded
     * ToUnicode CMap matched 0x00 sequences, hanging the JSON&rarr;PDF rebuild.
     */
    public static int countCodesProtected(ByteArrayInputStream inputStream, CodeReader reader)
            throws IOException {
        int count = 0;
        int previousAvailable = inputStream.available();
        while (previousAvailable > 0) {
            int code = reader.readCode(inputStream);
            if (code == -1) {
                break;
            }
            int currentAvailable = inputStream.available();
            if (currentAvailable >= previousAvailable) {
                // No progress made; break to avoid infinite loop on corrupt CMaps.
                break;
            }
            count++;
            previousAvailable = currentAvailable;
        }
        return count;
    }

    /**
     * Functional accessor for {@link PDFont#readCode(InputStream)} so the bounded counting loop can
     * be exercised in isolation without instantiating a {@link PDFont}.
     */
    @FunctionalInterface
    public interface CodeReader {
        int readCode(InputStream stream) throws IOException;
    }

    /**
     * Count glyphs in the provided COSString value using the provided PDFont. Mirrors the original
     * implementation in PdfJsonConversionService.
     */
    public int countGlyphs(COSString value, PDFont font) {
        if (value == null) {
            return 0;
        }
        if (font != null) {
            try (ByteArrayInputStream inputStream = new ByteArrayInputStream(value.getBytes())) {
                int count = PdfGlyphCounter.countCodesProtected(inputStream, font::readCode);
                if (count > 0) {
                    return count;
                }
            } catch (IOException ex) {
                log.debug("Failed to decode glyphs: {}", ex.getMessage());
            }
        }
        byte[] bytes = value.getBytes();
        return Math.max(1, bytes.length);
    }
}
